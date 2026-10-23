// Change orders: worker proposals and staff drafts (TSK-0081; HH-CHG-01, HH-CHG-02, HH-WORK-07, T53, ENT-ChangeOrder,
// OWN-DEC-108, OWN-DEC-168, OWN-DEC-169, OWN-DEC-203).
//
//   draft    -> reviewed    review: an Estimator or the Owner checked pricing and eligibility (every line priced)
//   reviewed -> draft       reopen: back to a draft to change it
//   draft    -> withdrawn   withdraw, with a reason
//   reviewed -> withdrawn
//
// Publishing (issued), the customer's approval or rejection, expiry and superseding are TSK-0082. A draft or reviewed
// version binds nothing: no scope, price, packet or total changes until the identified customer approves the exact
// issued version. Prices are computed by @handyhub/money (priceChangeOrder).
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
}

type G = Guard<ChangeOrderFacts>
const priced: G = (f) => {
  if (f.pricingProblems === undefined) return { code: 'FACTS_MISSING', message: 'The server must check: pricing.' }
  return f.pricingProblems.length
    ? { code: 'NOT_PRICED', message: 'Every line needs a quantity and a price, and the totals must hold.' }
    : null
}
const reason: G = (f) => reasonGiven(f.reason)

export const CHANGE_ORDER_MACHINE = defineMachine({
  entity: 'change_order',
  dimension: 'lifecycle',
  // The states this task writes; TSK-0082 adds issued, approved, rejected, expired and superseded with their events.
  states: ['draft', 'reviewed', 'withdrawn'] as const,
  initial: 'draft',
  final: ['withdrawn'],
  proposed: true,
  transitions: [
    { event: 'review', from: ['draft'], to: 'reviewed', actors: ['staff'], guards: [priced] },
    { event: 'reopen', from: ['reviewed'], to: 'draft', actors: ['staff'] },
    { event: 'withdraw', from: ['draft', 'reviewed'], to: 'withdrawn', actors: ['staff'], guards: [reason] },
  ],
})
export type ChangeOrderEvent = (typeof CHANGE_ORDER_MACHINE.transitions)[number]['event']

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
