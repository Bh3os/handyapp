// The audit hash chain (TSK-0135; HH-SEC-08, HH-SEC-06, ENT-AuditEvent, OWN-DEC-164 point 8, migration 0114).
// - Each event's digest is computed by the database (platform.audit_event_digest); its chain hash is
//   SHA-256(previous chain hash || digest) in seq order, from the genesis value. Seqs are never renumbered.
// - Seals record the chain hash at a seq, one after the other. The retention job seals the events recorded at least
//   SEAL_MARGIN_MS before its run; a retention operation seals what it needs first.
// - Verification recomputes the chain from the events that exist and compares it with every seal and with the
//   evidence of every retention operation: at a deletion the running hash must equal the hash the operation recorded
//   before its range, and continues from the hash it recorded at the range's end (the deleted events are gone, their
//   chain hash is not); at an archive the hashes before and at the end of its range must match. A seal or an archive
//   boundary inside a deleted range was verified when the range was deleted and is skipped. Any event changed,
//   removed or inserted outside the workflow shows as the first mismatch after it.
import { createHash } from 'node:crypto'
import type { Db, Tx } from '@handyhub/db'
import { sql } from 'kysely'

type Reader = Db | Tx

export const GENESIS: Buffer = createHash('sha256').update('handyhub.audit_chain.v1', 'utf8').digest()
export const link = (previous: Buffer, digest: Buffer): Buffer =>
  createHash('sha256').update(previous).update(digest).digest()

/**
 * PROPOSED engineering default: the job seals only events recorded at least a day before its run, so no transaction
 * that wrote an event below the sealed seq can still be open.
 */
export const SEAL_MARGIN_MS = 24 * 3600 * 1000
/** PROPOSED engineering default: at most this many events chained by one seal; the next seal continues. */
export const SEAL_BATCH = 50_000
/** Events read per query while chaining. */
const PAGE = 5_000

export type ChainEvent = { seq: bigint; digest: Buffer }
export type ChainSeal = { id: string; seq: string; fromSeq: bigint; throughSeq: bigint; chainHash: Buffer }
export type ChainOperation = {
  id: string
  kind: 'archive' | 'delete'
  fromSeq: bigint
  toSeq: bigint
  hashBefore: Buffer
  hashAfter: Buffer
}

export type ChainMismatch = {
  /** What did not match: a seal, the start or end of an archive, a deletion boundary, or an event in a deleted range. */
  at: 'seal' | 'archive_start' | 'archive_end' | 'deletion' | 'deleted_event_present'
  /** The seal or operation (or the event) concerned. */
  id: string
  seq: string
}

export type WalkResult = {
  ok: boolean
  /** Events chained. */
  events: number
  seals: number
  mismatch: ChainMismatch | null
  /** The chain hash after the events up to each captured seq (the caller asks for the positions it needs). */
  captured: Map<bigint, Buffer>
}

type Checkpoint = {
  key: bigint
  rank: number
  apply: (h: Buffer) => { ok: true; h: Buffer } | { ok: false; mismatch: ChainMismatch }
}

// Positions between events: "before seq p" is 4p-2, the event p is 4p, "after seq p" is 4p+1.
const before = (p: bigint) => 4n * p - 2n
const after = (p: bigint) => 4n * p + 1n
const inside = (p: bigint, d: ChainOperation, end: 'after' | 'before') =>
  end === 'after' ? d.fromSeq <= p && p < d.toSeq : d.fromSeq < p && p <= d.toSeq

/** The chain over the events (in seq order), checked against the seals and the operations' evidence. */
export async function walkChain(
  events: AsyncIterable<ChainEvent> | Iterable<ChainEvent>,
  seals: readonly ChainSeal[],
  operations: readonly ChainOperation[],
  capture: readonly bigint[] = [],
): Promise<WalkResult> {
  const deletions = operations.filter((o) => o.kind === 'delete')
  const captured = new Map<bigint, Buffer>()
  const points: Checkpoint[] = []
  const compare = (expected: Buffer, mismatch: ChainMismatch) => (h: Buffer) =>
    h.equals(expected) ? ({ ok: true, h } as const) : ({ ok: false, mismatch } as const)
  let checkedSeals = 0
  for (const s of seals) {
    if (deletions.some((d) => inside(s.throughSeq, d, 'after'))) continue
    const check = compare(s.chainHash, { at: 'seal', id: s.id, seq: String(s.throughSeq) })
    points.push({
      key: after(s.throughSeq),
      rank: 2,
      apply: (h) => {
        checkedSeals += 1
        return check(h)
      },
    })
  }
  for (const o of operations) {
    if (o.kind === 'delete') {
      points.push({
        key: before(o.fromSeq),
        rank: 1,
        apply: (h) =>
          h.equals(o.hashBefore)
            ? { ok: true, h: o.hashAfter }
            : { ok: false, mismatch: { at: 'deletion', id: o.id, seq: String(o.fromSeq) } },
      })
      continue
    }
    if (!deletions.some((d) => inside(o.fromSeq, d, 'before')))
      points.push({
        key: before(o.fromSeq),
        rank: 0,
        apply: compare(o.hashBefore, { at: 'archive_start', id: o.id, seq: String(o.fromSeq) }),
      })
    if (!deletions.some((d) => inside(o.toSeq, d, 'after')))
      points.push({
        key: after(o.toSeq),
        rank: 2,
        apply: compare(o.hashAfter, { at: 'archive_end', id: o.id, seq: String(o.toSeq) }),
      })
  }
  for (const p of capture)
    points.push({
      key: after(p),
      rank: 3,
      apply: (h) => {
        captured.set(p, h)
        return { ok: true, h }
      },
    })
  points.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.rank - b.rank))

  let h = GENESIS
  let i = 0
  let chained = 0
  const fail = (mismatch: ChainMismatch): WalkResult => ({
    ok: false,
    events: chained,
    seals: checkedSeals,
    mismatch,
    captured,
  })
  for await (const e of events) {
    const key = 4n * e.seq
    while (i < points.length && (points[i] as Checkpoint).key < key) {
      const r = (points[i] as Checkpoint).apply(h)
      if (!r.ok) return fail(r.mismatch)
      h = r.h
      i += 1
    }
    const covering = deletions.find((d) => d.fromSeq <= e.seq && e.seq <= d.toSeq)
    if (covering) return fail({ at: 'deleted_event_present', id: covering.id, seq: String(e.seq) })
    h = link(h, e.digest)
    chained += 1
  }
  for (; i < points.length; i += 1) {
    const r = (points[i] as Checkpoint).apply(h)
    if (!r.ok) return fail(r.mismatch)
    h = r.h
  }
  return { ok: true, events: chained, seals: checkedSeals, mismatch: null, captured }
}

/** The events' digests in seq order, after `afterSeq` and up to `throughSeq`, read in pages. */
export async function* eventDigests(db: Reader, afterSeq: bigint, throughSeq: bigint): AsyncGenerator<ChainEvent> {
  let last = afterSeq
  for (;;) {
    const { rows } = await sql<{ seq: string; digest: Buffer }>`
      SELECT e.seq::text AS seq, platform.audit_event_digest(e) AS digest
        FROM platform.audit_events e
       WHERE e.seq > ${String(last)}::bigint AND e.seq <= ${String(throughSeq)}::bigint
       ORDER BY e.seq
       LIMIT ${PAGE}`.execute(db)
    for (const r of rows) yield { seq: BigInt(r.seq), digest: r.digest }
    if (rows.length < PAGE) return
    last = BigInt((rows[rows.length - 1] as { seq: string }).seq)
  }
}

export async function loadSeals(db: Reader): Promise<ChainSeal[]> {
  const rows = await db
    .selectFrom('platform.audit_chain_seals')
    .select(['id', sql<string>`seq::text`.as('seq'), 'from_seq', 'through_seq', 'chain_hash'])
    .orderBy('seq')
    .execute()
  return rows.map((r) => ({
    id: r.id,
    seq: r.seq,
    fromSeq: BigInt(r.from_seq),
    throughSeq: BigInt(r.through_seq),
    chainHash: r.chain_hash,
  }))
}

export async function loadOperations(db: Reader): Promise<ChainOperation[]> {
  const rows = await db
    .selectFrom('platform.audit_retention_operations')
    .select(['id', 'kind', 'from_seq', 'to_seq', 'hash_before', 'hash_after'])
    .orderBy('seq')
    .execute()
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as ChainOperation['kind'],
    fromSeq: BigInt(r.from_seq),
    toSeq: BigInt(r.to_seq),
    hashBefore: r.hash_before,
    hashAfter: r.hash_after,
  }))
}

export type Verification = {
  ok: boolean
  /** Events chained and compared (up to the last seal). */
  checkedEvents: number
  seals: number
  sealedThrough: string | null
  archives: number
  deletions: number
  /** Events recorded after the last seal (sealed by a later run). */
  unsealedEvents: number
  mismatch: ChainMismatch | null
}

/** Verifies the whole sealed chain; optionally captures the chain hash after given seqs. */
export async function verifyChain(
  db: Reader,
  capture: readonly bigint[] = [],
): Promise<Verification & { captured: Map<bigint, Buffer> }> {
  const seals = await loadSeals(db)
  const operations = await loadOperations(db)
  const through = seals.length > 0 ? (seals[seals.length - 1] as ChainSeal).throughSeq : 0n
  const walk = await walkChain(eventDigests(db, 0n, through), seals, operations, capture)
  const tail = await sql<{ n: string }>`
    SELECT count(*)::text AS n FROM platform.audit_events WHERE seq > ${String(through)}::bigint`.execute(db)
  return {
    ok: walk.ok,
    checkedEvents: walk.events,
    seals: seals.length,
    sealedThrough: seals.length > 0 ? String(through) : null,
    archives: operations.filter((o) => o.kind === 'archive').length,
    deletions: operations.filter((o) => o.kind === 'delete').length,
    unsealedEvents: Number(tail.rows[0]?.n ?? 0),
    mismatch: walk.mismatch,
    captured: walk.captured,
  }
}

/** Serializes seals and retention operations (the chain moves forward one writer at a time). */
export const lockChain = (tx: Tx) =>
  sql`SELECT pg_advisory_xact_lock(hashtextextended('platform.audit_chain', 0))`.execute(tx)

export type SealResult = { sealed: number; throughSeq: string | null }

/**
 * Seals the events after the latest seal, up to `throughSeq` or (without one) the latest event recorded at least
 * SEAL_MARGIN_MS before `now`, at most SEAL_BATCH events per seal and `maxSeals` seals. Inside the caller's
 * transaction; returns how many seals were written and the sealed seq.
 */
export async function sealChain(
  tx: Tx,
  input: { now: Date; by: string; requestId: string; throughSeq?: bigint; maxSeals?: number },
): Promise<SealResult> {
  if (!tx.isTransaction) throw new Error('sealChain must run inside a transaction (withTx)')
  await lockChain(tx)
  let target = input.throughSeq
  if (target === undefined) {
    const { rows } = await sql<{ seq: string | null }>`
      SELECT max(seq)::text AS seq FROM platform.audit_events
       WHERE occurred_at <= ${new Date(input.now.getTime() - SEAL_MARGIN_MS)}::timestamptz`.execute(tx)
    target = rows[0]?.seq ? BigInt(rows[0].seq) : 0n
  }
  let sealed = 0
  let latest = await tx
    .selectFrom('platform.audit_chain_seals')
    .select(['id', 'through_seq', 'chain_hash'])
    .orderBy('seq', 'desc')
    .limit(1)
    .executeTakeFirst()
  for (let n = 0; n < (input.maxSeals ?? 1); n += 1) {
    const from = latest ? BigInt(latest.through_seq) : 0n
    if (target <= from) break
    let h = latest ? latest.chain_hash : GENESIS
    const start = h
    let count = 0
    let last = from
    for await (const e of eventDigests(tx, from, target)) {
      h = link(h, e.digest)
      count += 1
      last = e.seq
      if (count >= SEAL_BATCH) break
    }
    if (count === 0) break
    latest = await tx
      .insertInto('platform.audit_chain_seals')
      .values({
        previous_id: latest?.id ?? null,
        from_seq: String(from + 1n),
        through_seq: String(last),
        event_count: String(count),
        start_hash: start,
        chain_hash: h,
        sealed_by: input.by,
        request_id: input.requestId,
      })
      .returning(['id', 'through_seq', 'chain_hash'])
      .executeTakeFirstOrThrow()
    sealed += 1
  }
  return { sealed, throughSeq: latest ? String(latest.through_seq) : null }
}
