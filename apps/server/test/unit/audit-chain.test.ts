// The audit hash chain's verification walk (TSK-0135; HH-SEC-08, OWN-DEC-164 point 8): seals, archive boundaries and
// deletion boundaries over synthetic digests, without a database.
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  GENESIS,
  link,
  walkChain,
  type ChainEvent,
  type ChainOperation,
  type ChainSeal,
} from '../../src/modules/retention/audit-chain.js'

const digest = (seq: bigint) => createHash('sha256').update(`synthetic-event-${seq}`).digest()
const events = (from: number, to: number): ChainEvent[] =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ seq: BigInt(from + i), digest: digest(BigInt(from + i)) }))

/** The chain hash after each event of the original log 1..n. */
function hashes(n: number): Map<bigint, Buffer> {
  const out = new Map<bigint, Buffer>([[0n, GENESIS]])
  let h = GENESIS
  for (const e of events(1, n)) {
    h = link(h, e.digest)
    out.set(e.seq, h)
  }
  return out
}

const H = hashes(20)
const at = (seq: number) => H.get(BigInt(seq)) as Buffer
const seal = (id: string, through: number): ChainSeal => ({
  id,
  seq: id,
  fromSeq: 1n,
  throughSeq: BigInt(through),
  chainHash: at(through),
})
const op = (id: string, kind: 'archive' | 'delete', from: number, to: number): ChainOperation => ({
  id,
  kind,
  fromSeq: BigInt(from),
  toSeq: BigInt(to),
  hashBefore: at(from - 1),
  hashAfter: at(to),
})
const without = (from: number, to: number) => events(1, 20).filter((e) => e.seq < from || e.seq > to)

describe('audit hash chain verification (TSK-0135, HH-SEC-08)', () => {
  it('[HH-SEC-08] an untouched log matches every seal and archive boundary', async () => {
    const r = await walkChain(events(1, 20), [seal('s1', 8), seal('s2', 20)], [op('a1', 'archive', 3, 6)], [2n, 6n])
    expect(r).toMatchObject({ ok: true, events: 20, seals: 2, mismatch: null })
    expect(r.captured.get(2n)?.equals(at(2))).toBe(true)
    expect(r.captured.get(6n)?.equals(at(6))).toBe(true)
  })

  it('[HH-SEC-08] across a recorded deletion the chain continues from the hash the operation kept', async () => {
    // Seal s1 lies inside the deleted range (checked when the range was deleted); s2 sits at its end, s3 after it.
    const seals = [seal('s1', 9), seal('s2', 12), seal('s3', 20)]
    const ops = [op('a1', 'archive', 3, 6), op('a2', 'archive', 8, 11), op('d1', 'delete', 7, 12)]
    const r = await walkChain(without(7, 12), seals, ops)
    expect(r).toMatchObject({ ok: true, events: 14, seals: 2, mismatch: null })
  })

  it('[HH-SEC-08] a change, a removal or an insertion outside the workflow shows at the next check', async () => {
    const seals = [seal('s1', 10), seal('s2', 20)]
    const changed = events(1, 20).map((e) => (e.seq === 4n ? { ...e, digest: digest(99n) } : e))
    expect((await walkChain(changed, seals, [])).mismatch).toEqual({ at: 'seal', id: 's1', seq: '10' })
    // Removed without an operation.
    expect((await walkChain(without(14, 14), seals, [])).mismatch).toEqual({ at: 'seal', id: 's2', seq: '20' })
    // A deletion whose recorded hash before the range does not match the chain.
    const forged = { ...op('d1', 'delete', 5, 6), hashBefore: at(3) }
    expect((await walkChain(without(5, 6), seals, [forged])).mismatch).toEqual({ at: 'deletion', id: 'd1', seq: '5' })
    // More removed than the operation says: the chain no longer reaches the next seal.
    expect((await walkChain(without(5, 7), seals, [op('d1', 'delete', 5, 6)])).mismatch).toMatchObject({ at: 'seal' })
    // An entry back inside a deleted range.
    expect((await walkChain(events(1, 20), seals, [op('d1', 'delete', 5, 6)])).mismatch).toEqual({
      at: 'deleted_event_present',
      id: 'd1',
      seq: '5',
    })
    // An archive whose range no longer hashes as recorded.
    const archived = events(1, 20).map((e) => (e.seq === 15n ? { ...e, digest: digest(98n) } : e))
    expect((await walkChain(archived, [seal('s1', 10)], [op('a1', 'archive', 12, 16)])).mismatch).toEqual({
      at: 'archive_end',
      id: 'a1',
      seq: '16',
    })
  })
})
