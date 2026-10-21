// Cancellation outcomes (TSK-0066; FACT-CANCELLATION-RULES, OWN-DEC-134, HH-SCH-07, HH-PORT-04, T25). Amounts are the
// decided policy values passed in, as the server reads them from cancellation.rules; instants are synthetic.
import { describe, expect, it } from 'vitest'
import { cancellationOutcome, needsOwnerAction, type CancellationFacts } from '../src/index.js'

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
    const late = cancellationOutcome(facts({ requestedAt: new Date(hoursBefore(24).getTime() + 60_000) }), rules)
    expect(late).toMatchObject({ kind: 'late_cancellation', keptCents: 0, refundCents: 0, invoiceCents: 5000 })
  })

  it('[HH-PORT-04] late with no deposit: the $50.00 is invoiced; no deposit and enough notice: nothing at all', () => {
    expect(cancellationOutcome(facts({ requestedAt: hoursBefore(2) }), rules)).toMatchObject({
      kind: 'late_cancellation',
      invoiceCents: 5000,
    })
    const free = cancellationOutcome(facts({}), rules)
    expect(free).toMatchObject({ kind: 'full_refund_no_charge', refundCents: 0, keptCents: 0, invoiceCents: 0 })
    expect(needsOwnerAction(free)).toBe(false)
  })

  it('[HH-PORT-04] after work started: work done plus materials, determined by the Owner (no amount computed)', () => {
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

  it('[HH-PORT-04] a deposit below the late amount is not decided: Owner review, no amount invented', () => {
    expect(cancellationOutcome(facts({ requestedAt: hoursBefore(1), depositPaidCents: 2000 }), rules)).toMatchObject({
      kind: 'owner_review',
      keptCents: null,
      refundCents: null,
    })
  })

  it('[HH-PORT-04] a late cancellation of a free estimate visit is not decided: Owner review, nothing invented', () => {
    expect(cancellationOutcome(facts({ requestedAt: hoursBefore(3), estimateVisit: true }), rules)).toMatchObject({
      kind: 'owner_review',
      invoiceCents: null,
    })
    expect(cancellationOutcome(facts({ estimateVisit: true }), rules).kind).toBe('full_refund_no_charge')
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
