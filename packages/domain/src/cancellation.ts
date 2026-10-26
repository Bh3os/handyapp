// The outcome of a final cancellation under the decided rules (TSK-0066, TSK-0140; FACT-CANCELLATION-RULES,
// OWN-DEC-134, OWN-DEC-161, OWN-DEC-163, OWN-DEC-195, HH-SCH-07, HH-PORT-04, HH-FIN-14, T25, RULE-MONEY-CENTS,
// RULE-DECIDED-VALUES-ACTIVE).
// - Rescheduling is always free: no outcome here ever charges a reschedule.
// - HandyHub cancels or moves the visit (weather, safety stop, sick worker): the customer chooses a free reschedule or
//   a full refund (`customer_chooses`, the whole verified deposit as the refund if they choose it).
// - An estimate visit is never charged, whatever the notice (OWN-DEC-163): `estimate_visit_free`, nothing kept,
//   refunded or invoiced. The late-cancellation amount applies only to confirmed work visits.
// - A customer cancellation caused by unsafe conditions or an emergency, a legally protected cancellation right, or a
//   circumstance that needs the Owner's review is never charged automatically (OWN-DEC-161 5-6): `owner_review`, no
//   amount computed; the Owner decides.
// - The customer cancels after contracted work started (Start Work, OWN-DEC-195 C4; arrival or preparation alone is
//   not it): the work done plus materials, which the Owner determines (`work_started`; no amount is computed here).
// - The customer cancels with the configured notice or more (24 hours) before the visit, before work starts: the full
//   deposit is refunded and nothing is charged (`full_refund_no_charge`).
// - Under the notice (including no access and then cancelling), OWN-DEC-161: the fee is capped at the configured
//   late-cancellation amount ($50.00). A deposit of that amount or more keeps at most the amount and refunds the rest;
//   a smaller deposit is kept and the difference is never invoiced (`late_cancellation`). With no deposit the amount
//   is invoiced only where it was disclosed and accepted in advance (`late_cancellation` with the invoice); otherwise
//   nothing is charged (`late_no_charge`). Materials bought never add to it.
// - The notice and the amounts are the active policy (cancellation.rules: noticeHours, lateCancellationCents), never
//   values written here. Every amount is integer cents. Nothing is refunded or charged by computing an outcome: each
//   one is an Owner action (HH-FIN-14), and fee enforcement waits for attorney approval (OQ-ATTORNEY-TERMS).

export const CANCELLATION_INITIATORS = ['customer', 'handyhub'] as const
export type CancellationInitiator = (typeof CANCELLATION_INITIATORS)[number]

/** Why HandyHub cancels or moves a visit (OWN-DEC-134 names weather, a safety stop and a sick worker). */
export const HANDYHUB_CAUSES = ['weather', 'safety_stop', 'sick_worker', 'other'] as const
export type HandyhubCause = (typeof HANDYHUB_CAUSES)[number]

/**
 * Why a customer's cancellation is never charged automatically (OWN-DEC-161 5-6): unsafe conditions, an emergency, a
 * legally protected cancellation right, or another circumstance that needs the Owner's review. Staff record it; the
 * Owner decides the outcome.
 */
export const CUSTOMER_CIRCUMSTANCES = ['unsafe_conditions', 'emergency', 'legally_protected', 'owner_review'] as const
export type CustomerCircumstance = (typeof CUSTOMER_CIRCUMSTANCES)[number]

export const CANCELLATION_OUTCOMES = [
  'full_refund_no_charge',
  'late_cancellation',
  'late_no_charge',
  'estimate_visit_free',
  'work_started',
  'customer_chooses',
  'owner_review',
] as const
export type CancellationOutcomeKind = (typeof CANCELLATION_OUTCOMES)[number]

/**
 * The outcomes of a routine customer-authorized cancellation within the approved policy, which Office processes
 * without the Owner (OWN-DEC-195 C6). Waivers, refunds, disputed charges, exceptions (owner_review), the work done after
 * a start and HandyHub's own cancellations stay the Owner's.
 */
export const ROUTINE_CANCELLATION_OUTCOMES = [
  'full_refund_no_charge',
  'late_cancellation',
  'late_no_charge',
  'estimate_visit_free',
] as const satisfies readonly CancellationOutcomeKind[]

export type CancellationRules = {
  /** The notice that makes a cancellation free, in hours (cancellation.rules.noticeHours). */
  readonly noticeHours: number
  /** The late-cancellation amount (the cap of the fee) in cents (cancellation.rules.lateCancellationCents). */
  readonly lateCancellationCents: number
}

export type CancellationFacts = {
  readonly initiator: CancellationInitiator
  /** When the cancellation was asked for (the customer's request, or when staff record it). */
  readonly requestedAt: Date
  /** The start of the visit's arrival window. */
  readonly visitStartsAt: Date
  /** Whether contracted work on the job has started (Start Work; never arrival or preparation alone). */
  readonly workStarted: boolean
  /** Verified deposit money received, in cents (an uncleared check never counts). */
  readonly depositPaidCents: number
  /** The visit is an Estimate visit (free, OWN-DEC-99, OWN-DEC-163), not a work visit. */
  readonly estimateVisit?: boolean
  /** The late-cancellation amount was disclosed and accepted in advance (the accepted estimate terms state it). */
  readonly feeDisclosedAndAccepted?: boolean
  /** A circumstance that keeps the customer's cancellation from being charged automatically. */
  readonly circumstance?: CustomerCircumstance | null
}

export type CancellationOutcome = {
  readonly kind: CancellationOutcomeKind
  /** Whole minutes of notice before the visit (negative when asked for after it started). */
  readonly noticeMinutes: number
  /** Kept from the deposit; null when the Owner determines it (work started, review). */
  readonly keptCents: number | null
  /** To refund (an Owner action); for customer_chooses, the refund if the customer chooses it. */
  readonly refundCents: number | null
  /** To invoice when no deposit was paid (only where disclosed and accepted in advance). */
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
  const nothing = { keptCents: 0, refundCents: 0, invoiceCents: 0 }
  const ownerDecides = { keptCents: null, refundCents: null, invoiceCents: null }
  if (f.initiator === 'handyhub')
    return { ...base, kind: 'customer_chooses', keptCents: 0, refundCents: paid, invoiceCents: 0 }
  if (f.estimateVisit === true) return { ...base, kind: 'estimate_visit_free', ...nothing }
  if (f.circumstance) return { ...base, kind: 'owner_review', ...ownerDecides }
  if (f.workStarted) return { ...base, kind: 'work_started', ...ownerDecides }
  if (noticeMinutes >= rules.noticeHours * 60)
    return { ...base, kind: 'full_refund_no_charge', keptCents: 0, refundCents: paid, invoiceCents: 0 }
  if (paid > 0) {
    const kept = Math.min(paid, late)
    return { ...base, kind: 'late_cancellation', keptCents: kept, refundCents: paid - kept, invoiceCents: 0 }
  }
  if (f.feeDisclosedAndAccepted === true && late > 0)
    return { ...base, kind: 'late_cancellation', keptCents: 0, refundCents: 0, invoiceCents: late }
  return { ...base, kind: 'late_no_charge', ...nothing }
}

/** Whether an outcome needs an Owner action (a refund, a kept or invoiced amount, or the Owner's determination). */
export function needsOwnerAction(o: CancellationOutcome): boolean {
  if (o.kind === 'work_started' || o.kind === 'owner_review') return true
  return (o.keptCents ?? 0) > 0 || (o.refundCents ?? 0) > 0 || (o.invoiceCents ?? 0) > 0
}

/**
 * A routine customer-authorized cancellation within the approved policy (OWN-DEC-195 C6): the customer asked for it,
 * no circumstance makes it an exception, and its outcome is one the rules decide without the Owner.
 */
export function isRoutineCancellation(
  f: Pick<CancellationFacts, 'initiator' | 'circumstance'>,
  o: CancellationOutcome,
): boolean {
  return (
    f.initiator === 'customer' &&
    !f.circumstance &&
    (ROUTINE_CANCELLATION_OUTCOMES as readonly string[]).includes(o.kind)
  )
}

/** The cancellation fee an outcome charges: kept from the deposit or invoiced (zero when nothing is charged). */
export function cancellationFee(o: CancellationOutcome): number {
  return o.kind === 'late_cancellation' ? (o.keptCents ?? 0) + (o.invoiceCents ?? 0) : 0
}

/**
 * The outcome after the Owner waives or reduces the fee to `feeCents` (OWN-DEC-161 8): kept from the deposit when one
 * was paid, the rest refunded, or invoiced when none was. Only a fee can be reduced, never raised.
 */
export function withReducedFee(
  o: CancellationOutcome,
  depositPaidCents: number,
  feeCents: number,
): CancellationOutcome {
  const paid = cents(depositPaidCents, 'depositPaidCents')
  const fee = cents(feeCents, 'feeCents')
  const before = cancellationFee(o)
  if (before === 0) throw new RangeError('the outcome charges no fee to waive')
  if (fee > before) throw new RangeError('a waiver never raises the fee')
  if (paid > 0) {
    const kept = Math.min(paid, fee)
    return { ...o, keptCents: kept, refundCents: paid - kept, invoiceCents: 0 }
  }
  return { ...o, keptCents: 0, refundCents: 0, invoiceCents: fee }
}

/**
 * A customer's cancellation with less than the configured notice, before contracted work started: one of the
 * short-notice cancellations counted towards the repeat pattern of OWN-DEC-163 (7). An estimate visit counts too: it
 * is recorded, never charged.
 */
export function isShortNoticeCancellation(
  o: { readonly initiator: string | null; readonly noticeMinutes: number; readonly kind: string },
  rules: Pick<CancellationRules, 'noticeHours'>,
): boolean {
  return (
    o.initiator === 'customer' &&
    o.kind !== 'work_started' &&
    o.kind !== 'customer_chooses' &&
    o.noticeMinutes < rules.noticeHours * 60
  )
}

// --- Work-start markers (OWN-DEC-195 C4) -----------------------------------------------------------------------------

/**
 * The four separate markers of field work: a worker arrived, preparation started, the actual contracted work started
 * (Start Work, TSK-0073) and the work completed. Arrival alone is never the start of contracted work.
 */
export const WORK_MARKERS = ['arrived', 'preparation_started', 'contracted_work_started', 'completed'] as const
export type WorkMarker = (typeof WORK_MARKERS)[number]
export type WorkMarkers = { readonly [K in WorkMarker]: Date | null }

/** Only "contracted work started" triggers the after-start outcome; arrival, preparation or both never do. */
export function contractedWorkStarted(m: WorkMarkers): boolean {
  return m.contracted_work_started !== null
}
