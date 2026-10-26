// Cancellation outcomes (TSK-0066, TSK-0140; FACT-CANCELLATION-RULES, OWN-DEC-134, OWN-DEC-161, OWN-DEC-163,
// OWN-DEC-195, HH-SCH-07, HH-PORT-04, HH-FIN-14, T25). Amounts are the decided policy values passed in, as the server
// reads them from cancellation.rules; instants are synthetic.
import { describe, expect, it } from 'vitest'
import {
  cancellationFee,
  cancellationOutcome,
  contractedWorkStarted,
  isRoutineCancellation,
  isShortNoticeCancellation,
  needsOwnerAction,
  withReducedFee,
  type CancellationFacts,
} from '../src/index.js'

const rules = { noticeHours: 24, lateCancellationCents: 5000 }
const visitStartsAt = new Date('2026-11-10T14:00:00Z')
const hoursBefore = (h: number) => new Date(visitStartsAt.getTime() - h * 3_600_000)
const facts = (over: Partial<CancellationFacts>): CancellationFacts => ({
  initiator: 'customer',
  requestedAt: hoursBefore(48),
  visitStartsAt,
  workStarted: false,
  depositPaidCents: 0,
  ...over,
})

describe('[HH-PORT-04][T25] a final cancellation follows FACT-CANCELLATION-RULES', () => {
  it('[T25][HH-PORT-04] 48 hours before with a paid deposit: the whole deposit is refunded, nothing charged', () => {
    const o = cancellationOutcome(facts({ depositPaidCents: 30_000 }), rules)
    expect(o).toEqual({
      kind: 'full_refund_no_charge',
      noticeMinutes: 48 * 60,
      keptCents: 0,
      refundCents: 30_000,
      invoiceCents: 0,
    })
    expect(needsOwnerAction(o)).toBe(true)
  })

  it('[T25][HH-PORT-04] 12 hours before with a paid deposit: $50.00 kept, the rest refunded', () => {
    expect(cancellationOutcome(facts({ requestedAt: hoursBefore(12), depositPaidCents: 30_000 }), rules)).toEqual({
      kind: 'late_cancellation',
      noticeMinutes: 12 * 60,
      keptCents: 5000,
      refundCents: 25_000,
      invoiceCents: 0,
    })
  })

  it('[HH-PORT-04] exactly the notice is enough; one minute less is late', () => {
    expect(cancellationOutcome(facts({ requestedAt: hoursBefore(24) }), rules).kind).toBe('full_refund_no_charge')
    const late = cancellationOutcome(
      facts({ requestedAt: new Date(hoursBefore(24).getTime() + 60_000), feeDisclosedAndAccepted: true }),
      rules,
    )
    expect(late).toMatchObject({ kind: 'late_cancellation', keptCents: 0, refundCents: 0, invoiceCents: 5000 })
  })

  it('[HH-PORT-04] no deposit and enough notice: nothing at all', () => {
    const free = cancellationOutcome(facts({}), rules)
    expect(free).toMatchObject({ kind: 'full_refund_no_charge', refundCents: 0, keptCents: 0, invoiceCents: 0 })
    expect(needsOwnerAction(free)).toBe(false)
  })

  it('[HH-PORT-04][OWN-DEC-195] after contracted work started: work done plus materials, determined by the Owner', () => {
    const o = cancellationOutcome(facts({ workStarted: true, depositPaidCents: 30_000 }), rules)
    expect(o).toMatchObject({ kind: 'work_started', keptCents: null, refundCents: null, invoiceCents: null })
    expect(needsOwnerAction(o)).toBe(true)
  })

  it('[T25][OWN-DEC-134] HandyHub cancels or moves the visit: the customer chooses a free reschedule or a full refund', () => {
    const o = cancellationOutcome(
      facts({ initiator: 'handyhub', requestedAt: hoursBefore(3), depositPaidCents: 30_000 }),
      rules,
    )
    expect(o).toMatchObject({ kind: 'customer_chooses', keptCents: 0, refundCents: 30_000, invoiceCents: 0 })
  })

  it('[HH-PORT-04] the amounts are integer cents; anything else is refused', () => {
    expect(() => cancellationOutcome(facts({ depositPaidCents: 10.5 }), rules)).toThrow(RangeError)
    expect(() => cancellationOutcome(facts({}), { noticeHours: 24, lateCancellationCents: -1 })).toThrow(RangeError)
  })

  it('[HH-PORT-04] the notice and the amount come from the rules in force', () => {
    const o = cancellationOutcome(facts({ requestedAt: hoursBefore(30), depositPaidCents: 30_000 }), {
      noticeHours: 36,
      lateCancellationCents: 7000,
    })
    expect(o).toMatchObject({ kind: 'late_cancellation', keptCents: 7000, refundCents: 23_000 })
  })
})

describe('[HH-FIN-14][OWN-DEC-161] a late work-visit cancellation: the fee is capped at the late amount', () => {
  it('[OWN-DEC-161][HH-FIN-14] a deposit under $50.00 is kept and nothing more is invoiced', () => {
    const o = cancellationOutcome(facts({ requestedAt: hoursBefore(1), depositPaidCents: 2000 }), rules)
    expect(o).toEqual({
      kind: 'late_cancellation',
      noticeMinutes: 60,
      keptCents: 2000,
      refundCents: 0,
      invoiceCents: 0,
    })
    expect(cancellationFee(o)).toBe(2000)
  })

  it('[OWN-DEC-161][HH-FIN-14] a deposit of exactly $50.00 is kept whole; one cent more refunds that cent', () => {
    expect(cancellationOutcome(facts({ requestedAt: hoursBefore(5), depositPaidCents: 5000 }), rules)).toMatchObject({
      kind: 'late_cancellation',
      keptCents: 5000,
      refundCents: 0,
      invoiceCents: 0,
    })
    expect(cancellationOutcome(facts({ requestedAt: hoursBefore(5), depositPaidCents: 5001 }), rules)).toMatchObject({
      keptCents: 5000,
      refundCents: 1,
    })
  })

  it('[OWN-DEC-161][HH-FIN-14] no deposit: the $50.00 is invoiced only where it was disclosed and accepted in advance', () => {
    const disclosed = cancellationOutcome(facts({ requestedAt: hoursBefore(2), feeDisclosedAndAccepted: true }), rules)
    expect(disclosed).toMatchObject({ kind: 'late_cancellation', keptCents: 0, refundCents: 0, invoiceCents: 5000 })
    const undisclosed = cancellationOutcome(facts({ requestedAt: hoursBefore(2) }), rules)
    expect(undisclosed).toMatchObject({ kind: 'late_no_charge', keptCents: 0, refundCents: 0, invoiceCents: 0 })
    expect(needsOwnerAction(undisclosed)).toBe(false)
  })

  it('[OWN-DEC-161][RULE-HUMAN-REVIEW] unsafe conditions, an emergency, a protected right or an owner-review case are never charged automatically', () => {
    for (const circumstance of ['unsafe_conditions', 'emergency', 'legally_protected', 'owner_review'] as const) {
      const o = cancellationOutcome(
        facts({ requestedAt: hoursBefore(2), depositPaidCents: 30_000, feeDisclosedAndAccepted: true, circumstance }),
        rules,
      )
      expect(o, circumstance).toMatchObject({ kind: 'owner_review', keptCents: null, invoiceCents: null })
      expect(needsOwnerAction(o)).toBe(true)
      expect(cancellationFee(o)).toBe(0)
    }
  })

  it('[OWN-DEC-161] the Owner waives or reduces the fee; it is never raised and only a fee can be waived', () => {
    const late = cancellationOutcome(facts({ requestedAt: hoursBefore(3), depositPaidCents: 30_000 }), rules)
    expect(withReducedFee(late, 30_000, 0)).toMatchObject({ keptCents: 0, refundCents: 30_000, invoiceCents: 0 })
    expect(withReducedFee(late, 30_000, 2500)).toMatchObject({ keptCents: 2500, refundCents: 27_500 })
    const invoiced = cancellationOutcome(facts({ requestedAt: hoursBefore(3), feeDisclosedAndAccepted: true }), rules)
    expect(withReducedFee(invoiced, 0, 1000)).toMatchObject({ keptCents: 0, refundCents: 0, invoiceCents: 1000 })
    expect(() => withReducedFee(late, 30_000, 5001)).toThrow(RangeError)
    expect(() => withReducedFee(cancellationOutcome(facts({}), rules), 0, 0)).toThrow(RangeError)
  })
})

describe('[HH-SCH-07][OWN-DEC-163] estimate visits are never charged', () => {
  it('[OWN-DEC-163][HH-SCH-07] a late cancellation of an estimate visit is free, with or without notice', () => {
    for (const h of [1, 12, 48]) {
      const o = cancellationOutcome(
        facts({ requestedAt: hoursBefore(h), estimateVisit: true, feeDisclosedAndAccepted: true }),
        rules,
      )
      expect(o).toMatchObject({ kind: 'estimate_visit_free', keptCents: 0, refundCents: 0, invoiceCents: 0 })
      expect(needsOwnerAction(o)).toBe(false)
    }
  })

  it('[OWN-DEC-163] a short-notice customer cancellation counts towards the repeat pattern, never a charge', () => {
    const o = cancellationOutcome(facts({ requestedAt: hoursBefore(3), estimateVisit: true }), rules)
    expect(isShortNoticeCancellation({ initiator: 'customer', ...o }, rules)).toBe(true)
    const early = cancellationOutcome(facts({ estimateVisit: true }), rules)
    expect(isShortNoticeCancellation({ initiator: 'customer', ...early }, rules)).toBe(false)
    const hh = cancellationOutcome(facts({ initiator: 'handyhub', requestedAt: hoursBefore(3) }), rules)
    expect(isShortNoticeCancellation({ initiator: 'handyhub', ...hh }, rules)).toBe(false)
  })
})

describe('[HH-SCH-07][OWN-DEC-195] Office routine cancellations and the work-start markers', () => {
  it('[OWN-DEC-195][HH-SCH-07] a customer-authorized cancellation the rules decide is routine; exceptions are not', () => {
    const routine = (f: Partial<CancellationFacts>) => {
      const all = facts(f)
      return isRoutineCancellation(all, cancellationOutcome(all, rules))
    }
    expect(routine({ depositPaidCents: 30_000 })).toBe(true)
    expect(routine({ requestedAt: hoursBefore(2), depositPaidCents: 30_000 })).toBe(true)
    expect(routine({ requestedAt: hoursBefore(2) })).toBe(true)
    expect(routine({ requestedAt: hoursBefore(2), estimateVisit: true })).toBe(true)
    expect(routine({ initiator: 'handyhub', depositPaidCents: 30_000 })).toBe(false)
    expect(routine({ workStarted: true })).toBe(false)
    expect(routine({ circumstance: 'emergency' })).toBe(false)
  })

  it('[OWN-DEC-195][HH-STATE-02] arrival and preparation are not contracted work; only Start Work is', () => {
    const at = new Date('2026-11-10T14:05:00Z')
    const none = { arrived: null, preparation_started: null, contracted_work_started: null, completed: null }
    expect(contractedWorkStarted(none)).toBe(false)
    expect(contractedWorkStarted({ ...none, arrived: at })).toBe(false)
    expect(contractedWorkStarted({ ...none, arrived: at, preparation_started: at })).toBe(false)
    expect(contractedWorkStarted({ ...none, arrived: at, contracted_work_started: at })).toBe(true)
  })
})
