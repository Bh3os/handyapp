// Change orders: worker proposals and staff drafts (TSK-0081; HH-CHG-01, HH-CHG-02, HH-WORK-07, T53, ENT-ChangeOrder,
// OWN-DEC-108, OWN-DEC-168, OWN-DEC-169, OWN-DEC-203).
//
//   draft    -> reviewed    review: an Estimator or the Owner checked pricing and eligibility (every line priced)
//   reviewed -> draft       reopen: back to a draft to change it
//   draft    -> withdrawn   withdraw, with a reason
//   reviewed -> withdrawn
//   reviewed -> issued      issue: an Estimator or the Owner publishes it to the customer (TSK-0082), valid 7 days
//   issued   -> superseded  supersede: a revised version replaces it (system, in the revising transaction)
//   issued   -> expired     expire: its validity ended (system job), never extended (OWN-DEC-168)
//   issued   -> withdrawn   withdraw, with a reason
//   issued   -> approved    approve: the identified customer approves the exact version before it expires, against the
//                           job's current approved scope (TSK-0082 part 2); the job's next scope snapshot follows
//   issued   -> rejected    reject: the identified customer declines it (an optional reason)
//
// A draft, reviewed or issued version binds nothing: no scope, price, packet or total changes until the identified
// customer approves the exact issued version. Rejecting, expiring or withdrawing never authorizes the change (HH-CHG-03).
// Prices are computed by @handyhub/money (priceChangeOrder).
import { defineMachine, type Guard } from './engine.js'
import { reasonGiven } from './guards.js'

export const CHANGE_ORDER_STATES = [
  'draft',
  'reviewed',
  'issued',
  'approved',
  'rejected',
  'expired',
  'superseded',
  'withdrawn',
] as const
export type ChangeOrderState = (typeof CHANGE_ORDER_STATES)[number]

/** A change order that is still open: it may still bind, so the checklist steps it names wait for it (HH-WORK-07). */
export const OPEN_CHANGE_ORDER_STATES = ['draft', 'reviewed', 'issued'] as const satisfies readonly ChangeOrderState[]
/** The states a draft is edited in. */
export const EDITABLE_CHANGE_ORDER_STATES = ['draft'] as const satisfies readonly ChangeOrderState[]

/** Where a change comes from (HH-CHG-01). */
export const CHANGE_ORDER_ORIGINS = ['worker_proposal', 'customer_request', 'estimator', 'emergency_follow_up'] as const
export type ChangeOrderOrigin = (typeof CHANGE_ORDER_ORIGINS)[number]

/** Job states in which a change order may be drafted: after the approval, before the work is operationally complete. */
export const CHANGE_ORDER_JOB_STATES = [
  'pending_preparation',
  'ready',
  'in_progress',
  'paused',
  'ready_for_qa',
  'reopened',
] as const

export type ChangeOrderFacts = {
  /** Problems the server found pricing the version (empty when every line is priced and the totals hold). */
  readonly pricingProblems?: readonly string[]
  readonly reason?: string
  /** Issue: the version is still priced against the job's current approved scope. */
  readonly baseCurrent?: boolean
  /** Expire, approve and reject: the version's valid-until time. */
  readonly validUntil?: Date
}

type G = Guard<ChangeOrderFacts>
const priced: G = (f) => {
  if (f.pricingProblems === undefined) return { code: 'FACTS_MISSING', message: 'The server must check: pricing.' }
  return f.pricingProblems.length
    ? { code: 'NOT_PRICED', message: 'Every line needs a quantity and a price, and the totals must hold.' }
    : null
}
const reason: G = (f) => reasonGiven(f.reason)
const baseCurrent: G = (f) => {
  if (f.baseCurrent === undefined) return { code: 'FACTS_MISSING', message: 'The server must check: the base scope.' }
  return f.baseCurrent
    ? null
    : { code: 'APPROVED_SCOPE_CHANGED', message: 'The approved scope changed since this version was priced.' }
}
const validityEnded: G = (f, now) => {
  if (!f.validUntil) return { code: 'FACTS_MISSING', message: 'The server must check: the valid-until time.' }
  return now.getTime() >= f.validUntil.getTime()
    ? null
    : { code: 'NOT_DUE', message: 'The change order is still valid.' }
}

const stillValid: G = (f, now) => {
  if (!f.validUntil) return { code: 'FACTS_MISSING', message: 'The server must check: the valid-until time.' }
  return now.getTime() < f.validUntil.getTime()
    ? null
    : { code: 'EXPIRED', message: 'The change order expired; ask for a new version.' }
}

export const CHANGE_ORDER_MACHINE = defineMachine({
  entity: 'change_order',
  dimension: 'lifecycle',
  states: ['draft', 'reviewed', 'issued', 'approved', 'rejected', 'superseded', 'expired', 'withdrawn'] as const,
  initial: 'draft',
  final: ['approved', 'rejected', 'superseded', 'expired', 'withdrawn'],
  proposed: true,
  transitions: [
    { event: 'review', from: ['draft'], to: 'reviewed', actors: ['staff'], guards: [priced] },
    { event: 'reopen', from: ['reviewed'], to: 'draft', actors: ['staff'] },
    { event: 'issue', from: ['reviewed'], to: 'issued', actors: ['staff'], guards: [priced, baseCurrent] },
    { event: 'supersede', from: ['issued'], to: 'superseded', actors: ['system'] },
    { event: 'expire', from: ['issued'], to: 'expired', actors: ['system'], guards: [validityEnded] },
    { event: 'withdraw', from: ['draft', 'reviewed', 'issued'], to: 'withdrawn', actors: ['staff'], guards: [reason] },
    { event: 'approve', from: ['issued'], to: 'approved', actors: ['customer'], guards: [stillValid, baseCurrent] },
    { event: 'reject', from: ['issued'], to: 'rejected', actors: ['customer'], guards: [stillValid] },
  ],
})
export type ChangeOrderEvent = (typeof CHANGE_ORDER_MACHINE.transitions)[number]['event']

/** The state a reader sees: an issued version past its valid-until time is expired even before the job records it. */
export function effectiveChangeOrderState(state: string, validUntil: Date | null, now: Date): string {
  return state === 'issued' && validUntil !== null && now.getTime() >= validUntil.getTime() ? 'expired' : state
}

/** States a later version may start from: reissue after it ended, or revise an issued one (OWN-DEC-168 item 6). */
export const REVISABLE_CHANGE_ORDER_STATES = ['issued', 'expired', 'withdrawn', 'rejected'] as const

export type AffectedStep = { readonly workPackageId: string; readonly stepId: string }

/** The checklist steps that wait for an open change order, keyed `<workPackageId>:<stepId>` (HH-WORK-07). */
export function waitingSteps(
  versions: readonly { state: string; number: number; affectedSteps: readonly AffectedStep[] }[],
): Map<string, number[]> {
  const out = new Map<string, number[]>()
  for (const v of versions) {
    if (!(OPEN_CHANGE_ORDER_STATES as readonly string[]).includes(v.state)) continue
    for (const s of v.affectedSteps) {
      const key = `${s.workPackageId}:${s.stepId}`
      out.set(
        key,
        [...(out.get(key) ?? []), v.number].sort((a, b) => a - b),
      )
    }
  }
  return out
}
