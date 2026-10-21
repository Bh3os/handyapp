// The outcome of a final cancellation under the decided rules (TSK-0066; FACT-CANCELLATION-RULES, OWN-DEC-134,
// HH-SCH-07, HH-PORT-04, HH-FIN-14, T25, RULE-MONEY-CENTS, RULE-DECIDED-VALUES-ACTIVE).
// - Rescheduling is always free: no outcome here ever charges a reschedule.
// - HandyHub cancels or moves the visit (weather, safety stop, sick worker): the customer chooses a free reschedule or
//   a full refund (`customer_chooses`, the whole verified deposit as the refund if they choose it).
// - The customer cancels after work started: the work done plus materials, which the Owner determines
//   (`work_started`; no amount is computed or invented here).
// - The customer cancels with the configured notice or more (24 hours) before the visit, before work starts: the full
//   deposit is refunded and nothing is charged (`full_refund_no_charge`).
// - Under the notice (including no access and then cancelling): the configured late-cancellation amount ($50.00) is
//   kept from the deposit and the rest refunded; with no deposit it is invoiced (`late_cancellation`). Materials bought
//   never add to it.
// - OPEN QUESTION (OQ-LATE-CANCELLATION-EDGES): a verified deposit above zero but below the late-cancellation
//   amount is not covered by the decided rules, so the outcome is `owner_review` and no amount is computed.
// - OPEN QUESTION (OQ-LATE-CANCELLATION-EDGES): estimate visits are free (OWN-DEC-99) and the rules do not say
//   whether the late-cancellation amount applies to one, so a late customer cancellation of an estimate visit is
//   `owner_review` with no amount; with enough notice nothing is owed either way.
// - The notice and the amounts are the active policy (cancellation.rules: noticeHours, lateCancellationCents), never
//   values written here. Every amount is integer cents. Nothing is refunded or charged by computing an outcome: each
//   one is an Owner action (HH-FIN-14).

export const CANCELLATION_INITIATORS = ['customer', 'handyhub'] as const
export type CancellationInitiator = (typeof CANCELLATION_INITIATORS)[number]

/** Why HandyHub cancels or moves a visit (OWN-DEC-134 names weather, a safety stop and a sick worker). */
export const HANDYHUB_CAUSES = ['weather', 'safety_stop', 'sick_worker', 'other'] as const
export type HandyhubCause = (typeof HANDYHUB_CAUSES)[number]

export const CANCELLATION_OUTCOMES = [
  'full_refund_no_charge',
  'late_cancellation',
  'work_started',
  'customer_chooses',
  'owner_review',
] as const
export type CancellationOutcomeKind = (typeof CANCELLATION_OUTCOMES)[number]

export type CancellationRules = {
  /** The notice that makes a cancellation free, in hours (cancellation.rules.noticeHours). */
  readonly noticeHours: number
  /** The late-cancellation amount in cents (cancellation.rules.lateCancellationCents). */
  readonly lateCancellationCents: number
}

export type CancellationFacts = {
  readonly initiator: CancellationInitiator
  /** When the cancellation was asked for (the customer's request, or when staff record it). */
  readonly requestedAt: Date
  /** The start of the visit's arrival window. */
  readonly visitStartsAt: Date
  /** Whether work on the job has started. */
  readonly workStarted: boolean
  /** Verified deposit money received, in cents (an uncleared check never counts). */
  readonly depositPaidCents: number
  /** The visit is an Estimate visit (free, OWN-DEC-99), not a work visit. */
  readonly estimateVisit?: boolean
}

export type CancellationOutcome = {
  readonly kind: CancellationOutcomeKind
  /** Whole minutes of notice before the visit (negative when asked for after it started). */
  readonly noticeMinutes: number
  /** Kept from the deposit; null when the Owner determines it (work started, review). */
  readonly keptCents: number | null
  /** To refund (an Owner action); for customer_chooses, the refund if the customer chooses it. */
  readonly refundCents: number | null
  /** To invoice when no deposit was paid. */
  readonly invoiceCents: number | null
}

const MINUTE = 60_000

function cents(n: number, what: string): number {
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError(`${what} is a non-negative whole number of cents`)
  return n
}

/** The outcome of a final cancellation under the rules in force. */
export function cancellationOutcome(f: CancellationFacts, rules: CancellationRules): CancellationOutcome {
  const paid = cents(f.depositPaidCents, 'depositPaidCents')
  const late = cents(rules.lateCancellationCents, 'lateCancellationCents')
  if (!Number.isFinite(rules.noticeHours) || rules.noticeHours < 0) throw new RangeError('noticeHours is not negative')
  const noticeMinutes = Math.floor((f.visitStartsAt.getTime() - f.requestedAt.getTime()) / MINUTE)
  const base = { noticeMinutes }
  if (f.initiator === 'handyhub')
    return { ...base, kind: 'customer_chooses', keptCents: 0, refundCents: paid, invoiceCents: 0 }
  if (f.workStarted) return { ...base, kind: 'work_started', keptCents: null, refundCents: null, invoiceCents: null }
  if (noticeMinutes >= rules.noticeHours * 60)
    return { ...base, kind: 'full_refund_no_charge', keptCents: 0, refundCents: paid, invoiceCents: 0 }
  if (f.estimateVisit === true)
    return { ...base, kind: 'owner_review', keptCents: null, refundCents: null, invoiceCents: null }
  if (paid === 0) return { ...base, kind: 'late_cancellation', keptCents: 0, refundCents: 0, invoiceCents: late }
  if (paid < late) return { ...base, kind: 'owner_review', keptCents: null, refundCents: null, invoiceCents: null }
  return { ...base, kind: 'late_cancellation', keptCents: late, refundCents: paid - late, invoiceCents: 0 }
}

/** Whether an outcome needs an Owner action (a refund, a kept or invoiced amount, or the Owner's determination). */
export function needsOwnerAction(o: CancellationOutcome): boolean {
  if (o.kind === 'work_started' || o.kind === 'owner_review') return true
  return (o.keptCents ?? 0) > 0 || (o.refundCents ?? 0) > 0 || (o.invoiceCents ?? 0) > 0
}
