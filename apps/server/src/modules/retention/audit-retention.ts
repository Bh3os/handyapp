// The audit-retention workflow (TSK-0135; HH-SEC-08, HH-SEC-06, HH-STAFF-08, ENT-AuditEvent, ENT-RetentionReview,
// FACT-RETENTION-SCHEDULE, OWN-DEC-164, OWN-DEC-142, OWN-DEC-70, RULE-SERVER-AUTHZ, RULE-HUMAN-REVIEW).
// - Eligibility: an audit entry's period ends the configured retention.audit_log years (at least 7, OWN-DEC-164) after
//   it was recorded, counted in calendar years in the business time zone. Before that nobody archives or deletes it;
//   after it nothing happens automatically: the entry waits in the Owner's review (the retention job's queue entries)
//   and here.
// - The Owner works on a seq range of entries: the preview names its size and times, whether every entry is past its
//   period, the hold checks and what blocks archiving or deleting it. Recorded checks: open holds and open cases
//   (complaints, disputes, investigations) on the projects of the records the entries name; a found one blocks
//   deletion. Everything the software does not record (legal holds, litigation, warranties, claims, tax, accounting
//   and contractual requirements, security incidents, insurance holds; PROPOSED list in OQ-AUDIT-RETENTION-DETAILS) is
//   the Owner's confirmation, never "none found".
// - Archive (retention justified): the entries stay exactly as they are; the range's chain hashes are recorded as
//   integrity evidence and its review entries leave the open queue (an archive decision each).
// - Delete: with a fresh sign-in, a reason and every not-recorded check confirmed; the chain is sealed and verified
//   first, the operation is written to the retention-operation trail with the boundary hashes, and the database
//   deletes the range in the same transaction (migration 0114: the only delete path). No content of the deleted
//   entries is kept; the operation and its audit event keep the range, counts, times and hashes. Copies in database
//   backups expire under the backup policy, which is NOT CONFIGURED.
import type { Db, Tx } from '@handyhub/db'
import { sql } from 'kysely'
import { ApiError } from '../../api/errors.js'
import type { Page, PageRequest } from '../../api/pagination.js'
import { toPage } from '../../api/pagination.js'
import { loadConfig } from '../../platform/config/index.js'
import { activeCaseCounts } from '../cases/active.js'
import { GENESIS, lockChain, sealChain, verifyChain, type Verification } from './audit-chain.js'
import { auditEligibleBound, auditEventEnd, auditEventProject } from './audit-events.js'
import { openHolds } from './scan.js'
import { HOLD_CHECKS, holdCheckOutcomes, type CaseCounts, type HoldCheckResult } from './schedule.js'

type Reader = Db | Tx

/** OWN-DEC-164: seven years is the least period after which an audit entry may be archived or deleted. */
export const AUDIT_RETENTION_MIN_YEARS = 7
/** PROPOSED engineering default: the most entries one archive or deletion covers. */
export const AUDIT_RETENTION_MAX_EVENTS = 10_000
/** PROPOSED: the oldest calendar months the overview lists. */
export const AUDIT_RETENTION_MONTHS = 120

/** OWN-DEC-164 point 4, beyond the review queue's hold checks (PROPOSED names, OQ-AUDIT-RETENTION-DETAILS). */
export const AUDIT_EXTRA_CHECKS = [
  'litigation',
  'tax_requirements',
  'accounting_requirements',
  'contractual_requirements',
  'security_incidents',
] as const
export const AUDIT_RETENTION_CHECKS = [...HOLD_CHECKS, ...AUDIT_EXTRA_CHECKS] as const
export type AuditRetentionCheck = (typeof AUDIT_RETENTION_CHECKS)[number]
/** Every check but open holds: the software does not rule them out, so the Owner confirms each before a deletion. */
export const AUDIT_CONFIRM_CHECKS: readonly AuditRetentionCheck[] = AUDIT_RETENTION_CHECKS.filter(
  (c) => c !== 'open_holds',
)
export type AuditCheckOutcome = { check: AuditRetentionCheck; result: HoldCheckResult; count?: number }

export const AUDIT_RETENTION_BLOCKERS = [
  'not_configured',
  'range_missing',
  'range_too_large',
  'not_eligible',
  'hold_found',
  'overlaps_deletion',
  'already_archived',
  'chain_broken',
] as const
export type AuditRetentionBlocker = (typeof AUDIT_RETENTION_BLOCKERS)[number]

export type AuditRetentionPolicy = {
  state: 'CONFIGURED' | 'NOT_CONFIGURED'
  years: number | null
  version: number | null
  timeZone: string | null
  minimumYears: number
}

type Usable = { years: number; version: number; zone: string }

async function policyOf(db: Reader): Promise<{ view: AuditRetentionPolicy; usable: Usable | null }> {
  const config = await loadConfig(db)
  const entry = config.get('retention.audit_log')
  const zone = config.get('business.timezone')
  const years = entry.state === 'CONFIGURED' ? entry.value.years : null
  const timeZone = zone.state === 'CONFIGURED' ? zone.value.zone : null
  const usable =
    years !== null && years >= AUDIT_RETENTION_MIN_YEARS && timeZone !== null
      ? { years, version: entry.version as number, zone: timeZone }
      : null
  return {
    view: {
      state: usable ? 'CONFIGURED' : 'NOT_CONFIGURED',
      years,
      version: entry.version,
      timeZone,
      minimumYears: AUDIT_RETENTION_MIN_YEARS,
    },
    usable,
  }
}

async function dbNow(db: Reader): Promise<Date> {
  const { rows } = await sql<{ now: Date }>`SELECT now() AS now`.execute(db)
  return new Date((rows[0] as { now: Date }).now)
}

const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null)
const hex = (b: Buffer) => b.toString('hex')

export type EligibleMonth = { month: string; fromSeq: string; toSeq: string; count: number; archived: number }

export type AuditRetentionOverview = {
  automaticDeletion: false
  policy: AuditRetentionPolicy
  /** Entries past their period that still exist, and the oldest calendar months of them in the business time zone. */
  eligible: { count: number; months: EligibleMonth[] }
  chain: { seals: number; sealedThrough: string | null; lastSealedAt: string | null }
  operations: { archives: number; deletions: number; deletedEvents: number }
  /** Database backups keep copies until they expire; their retention is NOT CONFIGURED. */
  backups: 'NOT_CONFIGURED'
}

const covered = (kind: 'archive' | 'delete', seq: string) =>
  sql<boolean>`EXISTS (SELECT 1 FROM platform.audit_retention_operations o
    WHERE o.kind = ${kind} AND ${sql.ref(seq)} BETWEEN o.from_seq AND o.to_seq)`

export async function auditRetentionOverview(db: Reader, now?: Date): Promise<AuditRetentionOverview> {
  const at = now ?? (await dbNow(db))
  const { view, usable } = await policyOf(db)
  let count = 0
  let months: EligibleMonth[] = []
  if (usable) {
    const end = auditEventEnd(sql.ref('ae.occurred_at'), usable.years, usable.zone)
    const { rows } = await sql<{ month: string; from_seq: string; to_seq: string; n: number; archived: number }>`
      SELECT to_char(date_trunc('month', ae.occurred_at AT TIME ZONE ${usable.zone}::text), 'YYYY-MM') AS month,
             min(ae.seq)::text AS from_seq, max(ae.seq)::text AS to_seq, count(*)::int AS n,
             (count(*) FILTER (WHERE ${covered('archive', 'ae.seq')}))::int AS archived
        FROM platform.audit_events ae
       WHERE ae.occurred_at <= ${auditEligibleBound(at, usable.years, usable.zone)}
         AND ${end} <= ${at}::timestamptz
       GROUP BY 1
       ORDER BY 1`.execute(db)
    count = rows.reduce((a, r) => a + r.n, 0)
    months = rows.slice(0, AUDIT_RETENTION_MONTHS).map((r) => ({
      month: r.month,
      fromSeq: r.from_seq,
      toSeq: r.to_seq,
      count: r.n,
      archived: r.archived,
    }))
  }
  const seals = await db
    .selectFrom('platform.audit_chain_seals')
    .select([
      sql<string>`count(*)::text`.as('n'),
      sql<string | null>`max(through_seq)::text`.as('through'),
      sql<Date | null>`max(sealed_at)`.as('last'),
    ])
    .executeTakeFirstOrThrow()
  const ops = await db
    .selectFrom('platform.audit_retention_operations')
    .select([
      sql<string>`count(*) FILTER (WHERE kind = 'archive')::text`.as('archives'),
      sql<string>`count(*) FILTER (WHERE kind = 'delete')::text`.as('deletions'),
      sql<string>`coalesce(sum(event_count) FILTER (WHERE kind = 'delete'), 0)::text`.as('deleted'),
    ])
    .executeTakeFirstOrThrow()
  return {
    automaticDeletion: false,
    policy: view,
    eligible: { count, months },
    chain: { seals: Number(seals.n), sealedThrough: seals.through, lastSealedAt: iso(seals.last) },
    operations: {
      archives: Number(ops.archives),
      deletions: Number(ops.deletions),
      deletedEvents: Number(ops.deleted),
    },
    backups: 'NOT_CONFIGURED',
  }
}

const SEQ = /^[1-9][0-9]{0,17}$/
const invalid = (field: string, code = 'invalid') =>
  new ApiError('VALIDATION_FAILED', { fieldErrors: [{ field, code, message: '' }] })

/** The seq range of a request (both seqs as written, `from` not after `to`). */
export function parseRange(from: unknown, to: unknown, where: 'querystring' | 'body'): { from: bigint; to: bigint } {
  if (typeof from !== 'string' || !SEQ.test(from)) throw invalid(`${where}.fromSeq`)
  if (typeof to !== 'string' || !SEQ.test(to)) throw invalid(`${where}.toSeq`)
  const range = { from: BigInt(from), to: BigInt(to) }
  if (range.from > range.to) throw invalid(`${where}.toSeq`, 'before_from')
  return range
}

export type RangePreview = {
  range: {
    fromSeq: string
    toSeq: string
    /** Entries that exist in the range. */
    count: number
    firstOccurredAt: string | null
    lastOccurredAt: string | null
    /** When the period of the range's latest entry ends (every entry is past its period after it). */
    periodEndsAt: string | null
  }
  /** Entries whose period has not ended yet. */
  notYetEligible: number
  /** Entries an earlier archive covers. */
  archived: number
  policy: AuditRetentionPolicy
  checks: AuditCheckOutcome[]
  /** The checks the Owner confirms before a deletion. */
  confirm: AuditRetentionCheck[]
  blockers: { archive: AuditRetentionBlocker[]; delete: AuditRetentionBlocker[] }
  /** A deletion removes the rows for good; copies in backups expire under the backup policy (NOT CONFIGURED). */
  permanent: true
  backups: 'NOT_CONFIGURED'
}

type RangeFacts = {
  n: number
  first_at: Date | null
  last_at: Date | null
  ends_at: Date | null
  not_eligible: number
  archived: number
  has_from: boolean | null
  has_to: boolean | null
}

/** What archiving or deleting a range would do now, and what blocks each. */
export async function previewRange(db: Reader, range: { from: bigint; to: bigint }, now?: Date): Promise<RangePreview> {
  const at = now ?? (await dbNow(db))
  const { view, usable } = await policyOf(db)
  const from = String(range.from)
  const to = String(range.to)
  const end = usable
    ? auditEventEnd(sql.ref('ae.occurred_at'), usable.years, usable.zone)
    : sql<Date>`NULL::timestamptz`
  const { rows } = await sql<RangeFacts>`
    SELECT count(*)::int AS n, min(ae.occurred_at) AS first_at, max(ae.occurred_at) AS last_at,
           max(${end}) AS ends_at,
           (count(*) FILTER (WHERE ${end} IS NULL OR ${end} > ${at}::timestamptz))::int AS not_eligible,
           (count(*) FILTER (WHERE ${covered('archive', 'ae.seq')}))::int AS archived,
           bool_or(ae.seq = ${from}::bigint) AS has_from, bool_or(ae.seq = ${to}::bigint) AS has_to
      FROM platform.audit_events ae
     WHERE ae.seq BETWEEN ${from}::bigint AND ${to}::bigint`.execute(db)
  const f = rows[0] as RangeFacts
  const tooLarge = f.n > AUDIT_RETENTION_MAX_EVENTS
  // The projects of the records the entries name decide the hold checks (bounded by the range size).
  let projects: string[] = []
  if (f.n > 0 && !tooLarge) {
    const p = await sql<{ project_id: string }>`
      SELECT DISTINCT x.project_id FROM (
        SELECT ${auditEventProject('ae')} AS project_id FROM platform.audit_events ae
         WHERE ae.seq BETWEEN ${from}::bigint AND ${to}::bigint) x
       WHERE x.project_id IS NOT NULL`.execute(db)
    projects = p.rows.map((r) => r.project_id)
  }
  const holds = await openHolds(db, projects)
  const cases = await activeCaseCounts(db, projects)
  const held = [...holds.values()].reduce((a, b) => a + b, 0)
  const caseTotals: CaseCounts = [...cases.values()].reduce(
    (a, c) => ({
      complaints: a.complaints + c.complaints,
      disputes: a.disputes + c.disputes,
      incidents: a.incidents + c.incidents,
    }),
    { complaints: 0, disputes: 0, incidents: 0 },
  )
  const checks: AuditCheckOutcome[] = [
    ...(holdCheckOutcomes(
      projects.length > 0 ? held : null,
      projects.length > 0 ? caseTotals : null,
    ) as AuditCheckOutcome[]),
    ...AUDIT_EXTRA_CHECKS.map((check): AuditCheckOutcome => ({ check, result: 'not_recorded' })),
  ]
  const overlap = await db
    .selectFrom('platform.audit_retention_operations')
    .select(['kind'])
    .where(sql<boolean>`from_seq <= ${to}::bigint AND to_seq >= ${from}::bigint`)
    .execute()
  const common: AuditRetentionBlocker[] = []
  if (!usable) common.push('not_configured')
  if (f.n === 0 || !f.has_from || !f.has_to) common.push('range_missing')
  if (tooLarge) common.push('range_too_large')
  if (f.n > 0 && f.not_eligible > 0) common.push('not_eligible')
  const archive = [...common]
  if (overlap.some((o) => o.kind === 'archive')) archive.push('already_archived')
  const del = [...common]
  if (checks.some((c) => c.result === 'found')) del.push('hold_found')
  if (overlap.some((o) => o.kind === 'delete')) del.push('overlaps_deletion')
  return {
    range: {
      fromSeq: from,
      toSeq: to,
      count: f.n,
      firstOccurredAt: iso(f.first_at),
      lastOccurredAt: iso(f.last_at),
      periodEndsAt: iso(f.ends_at),
    },
    notYetEligible: f.not_eligible,
    archived: f.archived,
    policy: view,
    checks,
    confirm: [...AUDIT_CONFIRM_CHECKS],
    blockers: { archive, delete: del },
    permanent: true,
    backups: 'NOT_CONFIGURED',
  }
}

/** A refused operation: CONFLICT naming each blocker (codes), so the screen says why. */
export const blockedBy = (blockers: readonly AuditRetentionBlocker[]) =>
  new ApiError('CONFLICT', {
    fieldErrors: blockers.map((b) => ({ field: 'blockers', code: b.toUpperCase(), message: '' })),
  })

export type OperationInput = {
  kind: 'archive' | 'delete'
  range: { from: bigint; to: bigint }
  reason: string
  /** Delete: the not-recorded checks the Owner confirmed (every one of AUDIT_CONFIRM_CHECKS). */
  confirmedChecks: readonly string[]
  staff: { id: string; roles: readonly string[] }
  freshAuthAt: Date
  requestId: string
}

export type OperationView = {
  id: string
  seq: string
  kind: 'archive' | 'delete'
  fromSeq: string
  toSeq: string
  count: number
  firstOccurredAt: string
  lastOccurredAt: string
  /** Integrity evidence: the chain hash before the range and at its end (hex), and the seal they were verified with. */
  hashBefore: string
  hashAfter: string
  sealSeq: string
  policy: { key: string; version: number }
  years: number
  timeZone: string
  holdChecks: AuditCheckOutcome[]
  checksConfirmed: string[]
  reason: string
  authorizedBy: { id: string; name: string | null }
  authorizedRoles: string[]
  freshAuthAt: string
  authorizedAt: string
  /** Archive: the review entries that left the open queue. */
  reviewEntries: number
}

export type OperationOutcome =
  | { ok: true; operation: OperationView; deleted: number; preview: RangePreview }
  | { ok: false; error: ApiError; blockers: AuditRetentionBlocker[]; preview: RangePreview | null }

/**
 * Archives or deletes a range, inside the route's transaction: under the chain lock the preview is computed again,
 * the chain sealed and verified, the operation written to the trail and (delete) the range deleted by the database.
 * A refusal writes nothing but the caller's audit (and any seal, which only records the chain as it is).
 */
export async function authorizeAuditRetention(tx: Tx, input: OperationInput): Promise<OperationOutcome> {
  if (!tx.isTransaction) throw new Error('authorizeAuditRetention runs inside the route transaction (withTx)')
  await lockChain(tx)
  const now = await dbNow(tx)
  const preview = await previewRange(tx, input.range, now)
  const blockers = preview.blockers[input.kind === 'delete' ? 'delete' : 'archive']
  if (blockers.length > 0) return { ok: false, error: blockedBy(blockers), blockers, preview }
  let confirmed: string[] = []
  if (input.kind === 'delete') {
    const missing = AUDIT_CONFIRM_CHECKS.filter((c) => !input.confirmedChecks.includes(c))
    if (missing.length > 0)
      return {
        ok: false,
        error: new ApiError('VALIDATION_FAILED', {
          fieldErrors: missing.map((c) => ({
            field: `body.confirmedChecks.${c}`,
            code: 'CHECK_NOT_CONFIRMED',
            message: '',
          })),
        }),
        blockers: [],
        preview,
      }
    confirmed = [...AUDIT_CONFIRM_CHECKS]
  }
  // The range is years old: every event up to it is settled. Seal up to the job's margin, then verify everything.
  await sealChain(tx, { now, by: 'retention.audit_workflow', requestId: input.requestId, maxSeals: 1_000 })
  const verification = await verifyChain(tx, [input.range.from - 1n, input.range.to])
  const seal = await tx
    .selectFrom('platform.audit_chain_seals')
    .select(['id', sql<string>`seq::text`.as('seq')])
    .where('through_seq', '>=', String(input.range.to))
    .orderBy('seq')
    .limit(1)
    .executeTakeFirst()
  const hashBefore = verification.captured.get(input.range.from - 1n) ?? GENESIS
  const hashAfter = verification.captured.get(input.range.to)
  if (!verification.ok || !seal || !hashAfter)
    return { ok: false, error: blockedBy(['chain_broken']), blockers: ['chain_broken'], preview }
  const { years, version, timeZone } = preview.policy as { years: number; version: number; timeZone: string }
  const op = await tx
    .insertInto('platform.audit_retention_operations')
    .values({
      kind: input.kind,
      from_seq: preview.range.fromSeq,
      to_seq: preview.range.toSeq,
      event_count: preview.range.count,
      // The database's own times (microseconds), which its guard compares with the range as it is.
      first_occurred_at: sql<Date>`(SELECT min(occurred_at) FROM platform.audit_events
        WHERE seq BETWEEN ${preview.range.fromSeq}::bigint AND ${preview.range.toSeq}::bigint)`,
      last_occurred_at: sql<Date>`(SELECT max(occurred_at) FROM platform.audit_events
        WHERE seq BETWEEN ${preview.range.fromSeq}::bigint AND ${preview.range.toSeq}::bigint)`,
      hash_before: hashBefore,
      hash_after: hashAfter,
      seal_id: seal.id,
      policy_key: 'retention.audit_log',
      policy_version: version,
      period_years: years,
      time_zone: timeZone,
      hold_checks: JSON.stringify(preview.checks),
      checks_confirmed: confirmed,
      reason: input.reason.trim(),
      authorized_by: input.staff.id,
      authorized_roles: [...input.staff.roles],
      fresh_auth_at: input.freshAuthAt,
      request_id: input.requestId,
    })
    .returning(['id'])
    .executeTakeFirstOrThrow()
  let deleted = 0
  let reviewEntries = 0
  if (input.kind === 'delete') {
    const { rows } = await sql<{ n: string }>`SELECT platform.audit_retention_erase(${op.id}::uuid)::text AS n`.execute(
      tx,
    )
    deleted = Number(rows[0]?.n ?? 0)
  } else {
    // The range's review entries leave the open queue (an archive decision each, like the Owner's Archive).
    const { rows } = await sql<{ id: string }>`
      INSERT INTO privacy.retention_decisions (review_id, decision, reason, decided_by, request_id)
      SELECT rv.id, 'archive', ${input.reason.trim()}, ${input.staff.id}::uuid, ${input.requestId}
        FROM privacy.retention_reviews rv
        JOIN platform.audit_events ae ON ae.id = rv.record_id
       WHERE rv.record_type = 'audit_event'
         AND ae.seq BETWEEN ${preview.range.fromSeq}::bigint AND ${preview.range.toSeq}::bigint
         AND coalesce((SELECT d.decision FROM privacy.retention_decisions d WHERE d.review_id = rv.id
                        ORDER BY d.seq DESC LIMIT 1), '') <> 'archive'
      RETURNING id`.execute(tx)
    reviewEntries = rows.length
  }
  const view = (await operationViews(tx, { ids: [op.id] }))[0] as OperationView
  return { ok: true, operation: { ...view, reviewEntries }, deleted, preview }
}

type OperationRow = {
  id: string
  seq: string
  kind: string
  from_seq: string
  to_seq: string
  event_count: number
  first_occurred_at: Date
  last_occurred_at: Date
  hash_before: Buffer
  hash_after: Buffer
  seal_seq: string
  policy_key: string
  policy_version: number
  period_years: number
  time_zone: string
  hold_checks: unknown
  checks_confirmed: string[]
  reason: string
  authorized_by: string
  name: string | null
  authorized_roles: string[]
  fresh_auth_at: Date
  authorized_at: Date
  review_entries: number
}

async function operationViews(
  db: Reader,
  filter: { ids?: readonly string[]; before?: string; limit?: number },
): Promise<OperationView[]> {
  const { rows } = await sql<OperationRow>`
    SELECT o.id, o.seq::text AS seq, o.kind, o.from_seq::text AS from_seq, o.to_seq::text AS to_seq, o.event_count,
           o.first_occurred_at, o.last_occurred_at, o.hash_before, o.hash_after, s.seq::text AS seal_seq,
           o.policy_key, o.policy_version, o.period_years, o.time_zone, o.hold_checks, o.checks_confirmed, o.reason,
           o.authorized_by, coalesce(u.display_name, u.email) AS name, o.authorized_roles, o.fresh_auth_at,
           o.authorized_at,
           (SELECT count(*) FROM privacy.retention_decisions d
             WHERE d.request_id = o.request_id AND d.decision = 'archive' AND o.kind = 'archive')::int AS review_entries
      FROM platform.audit_retention_operations o
      JOIN platform.audit_chain_seals s ON s.id = o.seal_id
      JOIN identity.staff_users u ON u.id = o.authorized_by
     WHERE ${filter.ids ? sql`o.id = ANY(${sql.val([...filter.ids])}::uuid[])` : sql`true`}
       AND ${filter.before ? sql`o.seq < ${filter.before}::bigint` : sql`true`}
     ORDER BY o.seq DESC
     LIMIT ${filter.limit ?? 1000}`.execute(db)
  return rows.map((r) => ({
    id: r.id,
    seq: r.seq,
    kind: r.kind as OperationView['kind'],
    fromSeq: r.from_seq,
    toSeq: r.to_seq,
    count: r.event_count,
    firstOccurredAt: new Date(r.first_occurred_at).toISOString(),
    lastOccurredAt: new Date(r.last_occurred_at).toISOString(),
    hashBefore: hex(r.hash_before),
    hashAfter: hex(r.hash_after),
    sealSeq: r.seal_seq,
    policy: { key: r.policy_key, version: r.policy_version },
    years: r.period_years,
    timeZone: r.time_zone,
    holdChecks: r.hold_checks as AuditCheckOutcome[],
    checksConfirmed: [...r.checks_confirmed],
    reason: r.reason,
    authorizedBy: { id: r.authorized_by, name: r.name },
    authorizedRoles: [...r.authorized_roles],
    freshAuthAt: new Date(r.fresh_auth_at).toISOString(),
    authorizedAt: new Date(r.authorized_at).toISOString(),
    reviewEntries: r.review_entries,
  }))
}

const OP_SEQ = /^[1-9][0-9]{0,18}$/

/** The retention-operation trail, newest first, paged. */
export async function listOperations(db: Reader, page: PageRequest): Promise<Page<OperationView>> {
  let before: string | undefined
  if (page.after !== undefined) {
    const [seq] = page.after
    if (page.after.length !== 1 || typeof seq !== 'string' || !OP_SEQ.test(seq)) throw invalid('querystring.cursor')
    before = seq
  }
  const rows = await operationViews(db, { ...(before ? { before } : {}), limit: page.limit + 1 })
  return toPage(rows, page, (r) => [r.seq])
}

export type VerificationView = Omit<Verification, 'captured'> & { verifiedAt: string }

/** Recomputes the whole sealed chain across every archive and deletion boundary. */
export async function verificationView(db: Reader): Promise<VerificationView> {
  const v = await verifyChain(db)
  return {
    ok: v.ok,
    checkedEvents: v.checkedEvents,
    seals: v.seals,
    sealedThrough: v.sealedThrough,
    archives: v.archives,
    deletions: v.deletions,
    unsealedEvents: v.unsealedEvents,
    mismatch: v.mismatch,
    verifiedAt: (await dbNow(db)).toISOString(),
  }
}
