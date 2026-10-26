// Owner approval before publishing over the threshold (TSK-0130; HH-EST-16, OWN-DEC-173, FACT-OWNER-APPROVAL-THRESHOLD,
// FACT-MARGIN-TARGET, OQ-READINGS-2026-10-21 item 5 with the owner's Round 13 corrections, RULE-MONEY-CENTS).
// The reusable policy the server applies when an estimate version is published now, and when a change order version is
// published later (TSK-0082 calls evaluateChangeOrderPublication; nothing here knows a table). Pure and browser-safe:
// every amount is integer cents passed in by the caller, and the threshold is the configured value
// (owner_approval.threshold), never a constant of this file.
//
// - Comparison "greater than" (FACT-OWNER-APPROVAL-THRESHOLD): exactly the threshold needs no approval.
// - Estimate: the final proposed total after eligible discounts. PROPOSED reading: the highest total the customer could
//   approve from the version (the base offer plus every option) is compared as well, so an option line cannot carry a
//   price past the threshold without the Owner.
// - Change order: the absolute price adjustment, or the revised total authorized project value (accepted estimate plus
//   approved change orders plus this one), greater than the threshold.
// - Splitting (OWN-DEC-173 item 4; Round 13 correction 5): the linked documents of the same project across their whole
//   history, not one validity period. Each estimate of the project counts by the latest version that reached the
//   customer (its accepted total once accepted), unless that version was withdrawn or declined (PROPOSED); each change
//   order by its adjustment once it is published or approved. When this document and the linked ones together exceed
//   the threshold, the Owner approves.
// - Adjustments (Round 13 correction 6; final owner amendments 2026-10-22 to OWN-DEC-173): the substance of each
//   adjustment is evaluated, not its document type. Each is a positive magnitude with a negative financial effect (it
//   reduces the effective total and never makes a customer charge negative), with its written reason. A discount of
//   the decided discount rule (the approved 10%, OWN-DEC-145) needs nothing more; a genuine, documented clerical or
//   calculation correction needs nothing more either. A discretionary discount outside that policy, a discretionary
//   credit (every one from the configured materiality amount, PROPOSED: from 1 cent, i.e. every credit), a refund,
//   an undocumented correction and any single adjustment over the threshold need the Owner. The threshold is always
//   evaluated on the final price, so a correction never takes a document out of the Owner's approval.
// - Margin (FACT-MARGIN-TARGET, OWN-DEC-189): only from costs that exist; incomplete costs stay incomplete and never
//   give a final margin. A negative margin is flagged; the known costs alone exceeding the price is negative too.
// - A flag routes the document to the Owner whatever the total (HH-EST-16 "flagged for owner review at any total";
//   PROPOSED: flagged documents wait for the same approval before publishing).
// - The threshold NOT CONFIGURED (no active value): every publication needs the Owner (fail closed, PROPOSED).

import { marginBps } from './job-margin.js'

/** Why a document needs the Owner's approval before it is published. */
export const PUBLICATION_APPROVAL_REASONS = [
  'threshold_not_configured',
  'over_threshold',
  'options_over_threshold',
  'change_order_adjustment',
  'revised_project_value',
  'combined_project_total',
  'adjustment_over_threshold',
  'negative_margin',
  'discretionary_discount',
  'discretionary_credit',
  'refund',
  'undocumented_correction',
] as const
export type PublicationApprovalReason = (typeof PUBLICATION_APPROVAL_REASONS)[number]

/** The reasons that are flags: they route a document to the Owner whatever its total. */
export const PUBLICATION_APPROVAL_FLAGS = [
  'adjustment_over_threshold',
  'negative_margin',
  'discretionary_discount',
  'discretionary_credit',
  'refund',
  'undocumented_correction',
] as const
export type PublicationApprovalFlag = (typeof PUBLICATION_APPROVAL_FLAGS)[number]

/** The kinds of document an approval is for. Change orders arrive with TSK-0082. */
export const PUBLICATION_SUBJECTS = ['estimate_version', 'change_order_version'] as const
export type PublicationSubject = (typeof PUBLICATION_SUBJECTS)[number]

/** States of one approval record (estimating.publication_approvals). */
export const PUBLICATION_APPROVAL_STATES = ['pending', 'approved', 'rejected', 'invalidated'] as const
export type PublicationApprovalState = (typeof PUBLICATION_APPROVAL_STATES)[number]

/** How an approval came about: requested and decided in Owner Decisions, or the Owner publishing it (PROPOSED). */
export const PUBLICATION_APPROVAL_BASES = ['request', 'owner_publication'] as const
export type PublicationApprovalBasis = (typeof PUBLICATION_APPROVAL_BASES)[number]

/** Why an approval stopped counting. */
export const PUBLICATION_INVALIDATION_REASONS = ['content_changed', 'not_required'] as const
export type PublicationInvalidationReason = (typeof PUBLICATION_INVALIDATION_REASONS)[number]

/** The configured threshold (owner_approval.threshold), or null while NOT CONFIGURED. */
export type ApprovalThreshold = { readonly thresholdCents: number; readonly version: number } | null

/**
 * A price adjustment of the document: a positive magnitude of cents with a negative financial effect (it reduces the
 * effective total), and its written reason (null when none was given).
 */
export type PriceAdjustment = {
  /**
   * rule_discount: the decided discount rule's category (the approved 10%, OWN-DEC-145); discretionary_discount: any
   * other discount; discretionary_credit: a credit given at staff discretion; clerical_correction: a correction of a
   * clerical or calculation error; refund: money returned.
   */
  readonly kind: 'rule_discount' | 'discretionary_discount' | 'discretionary_credit' | 'clerical_correction' | 'refund'
  readonly amountCents: number
  /** The written reason (what it corrects or why it is given); a correction without one is not documented. */
  readonly reason: string | null
}

/** The configured materiality of discretionary credits (owner_approval.discretionary_credit); PROPOSED 1 cent. */
export type CreditPolicy = { readonly materialFromCents: number } | null

/** Another document of the same project, as the splitting check counts it. */
export type LinkedDocument = {
  readonly kind: 'estimate' | 'change_order'
  readonly id: string
  /** Estimate number or change-order reference, shown to the Owner. */
  readonly reference: string
  readonly version: number
  readonly state: string
  /** The value it counts with: an estimate's total (accepted total once accepted); a change order's adjustment. */
  readonly valueCents: number
}

/** Known internal costs of the evaluated offer; null when none were entered. */
export type CostFacts = {
  readonly laborCents: number
  readonly materialCents: number
  /** Every counted line has both its labor and its material cost. */
  readonly complete: boolean
} | null

export type Margin = {
  readonly laborCents: number
  readonly materialCents: number
  readonly complete: boolean
  /** Price minus the costs; null while the costs are incomplete. */
  readonly grossProfitCents: number | null
  /** Gross profit over the price in basis points, half-up; null while incomplete or for a zero price. */
  readonly marginBps: number | null
  /** The margin is below zero (also when the known costs alone exceed the price). */
  readonly negative: boolean
}

export type PublicationEvaluation = {
  readonly required: boolean
  /** Every reason, in PUBLICATION_APPROVAL_REASONS order. */
  readonly reasons: readonly PublicationApprovalReason[]
  readonly flags: readonly PublicationApprovalFlag[]
  readonly thresholdCents: number | null
  readonly thresholdVersion: number | null
  /** This document's value plus the linked documents' values. */
  readonly combinedProjectCents: number
  readonly linked: readonly LinkedDocument[]
  readonly margin: Margin | null
}

const safe = (n: number, what: string) => {
  if (!Number.isSafeInteger(n)) throw new RangeError(`${what} must be integer cents`)
  return n
}

/** Gross margin from integer cents (FACT-MARGIN-TARGET); null when no cost was entered. */
export function marginOf(priceCents: number, costs: CostFacts): Margin | null {
  safe(priceCents, 'price')
  if (costs === null) return null
  const cost = safe(costs.laborCents, 'labor') + safe(costs.materialCents, 'material')
  if (costs.laborCents < 0 || costs.materialCents < 0) throw new RangeError('costs are never negative')
  const profit = priceCents - cost
  return {
    laborCents: costs.laborCents,
    materialCents: costs.materialCents,
    complete: costs.complete,
    grossProfitCents: costs.complete ? profit : null,
    // Half-up to the basis point, exact in BigInt (the job margin's own computation, TSK-0131).
    marginBps: costs.complete ? marginBps(profit, priceCents) : null,
    // The known costs alone exceeding the price is a negative margin even before every cost is known.
    negative: profit < 0,
  }
}

function adjustmentFlags(
  adjustments: readonly PriceAdjustment[],
  threshold: ApprovalThreshold,
  credits: CreditPolicy,
): PublicationApprovalFlag[] {
  const flags = new Set<PublicationApprovalFlag>()
  for (const a of adjustments) {
    safe(a.amountCents, 'adjustment')
    if (a.amountCents < 0) throw new RangeError('an adjustment is a positive magnitude')
    if (a.amountCents === 0) continue
    if (threshold !== null && a.amountCents > threshold.thresholdCents) flags.add('adjustment_over_threshold')
    if (a.kind === 'discretionary_discount') flags.add('discretionary_discount')
    // NOT CONFIGURED materiality: every discretionary credit (fail closed).
    if (a.kind === 'discretionary_credit' && a.amountCents >= (credits?.materialFromCents ?? 1))
      flags.add('discretionary_credit')
    if (a.kind === 'refund') flags.add('refund')
    if (a.kind === 'clerical_correction' && (a.reason ?? '').trim() === '') flags.add('undocumented_correction')
  }
  return [...flags]
}

function finish(
  threshold: ApprovalThreshold,
  reasons: Set<PublicationApprovalReason>,
  flags: readonly PublicationApprovalFlag[],
  combined: number,
  linked: readonly LinkedDocument[],
  margin: Margin | null,
): PublicationEvaluation {
  for (const f of flags) reasons.add(f)
  const ordered = PUBLICATION_APPROVAL_REASONS.filter((r) => reasons.has(r))
  return {
    required: ordered.length > 0,
    reasons: ordered,
    flags: PUBLICATION_APPROVAL_FLAGS.filter((f) => reasons.has(f)),
    thresholdCents: threshold?.thresholdCents ?? null,
    thresholdVersion: threshold?.version ?? null,
    combinedProjectCents: combined,
    linked,
    margin,
  }
}

const linkedTotal = (linked: readonly LinkedDocument[]) =>
  linked.reduce((s, d) => s + safe(d.kind === 'change_order' ? d.valueCents : Math.max(0, d.valueCents), 'linked'), 0)

export type EstimatePublicationFacts = {
  /** The base offer's total after the eligible discount (the version's stored total). */
  readonly proposedTotalCents: number
  /** The base offer plus every option, after the discount (the most the customer could approve). */
  readonly highestTotalCents: number
  readonly adjustments: readonly PriceAdjustment[]
  /** Costs of the base offer's lines. */
  readonly costs: CostFacts
  /** The project's other estimates (and, later, change orders) as the splitting check counts them. */
  readonly linked: readonly LinkedDocument[]
}

/** Whether publishing this estimate version needs the Owner's approval first, and why (HH-EST-16). */
export function evaluateEstimatePublication(
  threshold: ApprovalThreshold,
  facts: EstimatePublicationFacts,
  credits: CreditPolicy = null,
): PublicationEvaluation {
  const proposed = safe(facts.proposedTotalCents, 'proposed total')
  const highest = Math.max(proposed, safe(facts.highestTotalCents, 'highest total'))
  const reasons = new Set<PublicationApprovalReason>()
  const combined = proposed + linkedTotal(facts.linked)
  if (threshold === null) reasons.add('threshold_not_configured')
  else {
    const t = safe(threshold.thresholdCents, 'threshold')
    if (proposed > t) reasons.add('over_threshold')
    else if (highest > t) reasons.add('options_over_threshold')
    if (proposed <= t && facts.linked.length > 0 && combined > t) reasons.add('combined_project_total')
  }
  const margin = marginOf(proposed, facts.costs)
  const flags = adjustmentFlags(facts.adjustments, threshold, credits)
  if (margin?.negative) flags.push('negative_margin')
  return finish(threshold, reasons, flags, combined, facts.linked, margin)
}

export type ChangeOrderPublicationFacts = {
  /** The change order's signed price adjustment: positive adds to the project, negative is a credit. */
  readonly adjustmentCents: number
  /**
   * The current effective contract value plus this change: the accepted estimate plus the approved change orders
   * (each counted once, never a superseded or replaced revision) plus this one. Never negative.
   */
  readonly revisedProjectValueCents: number
  /** The substance of each adjustment (a credit appears here with its kind and reason, as a positive magnitude). */
  readonly adjustments: readonly PriceAdjustment[]
  readonly costs: CostFacts
  /** The project's other change orders not yet in the authorized value, and its other open estimates. */
  readonly linked: readonly LinkedDocument[]
}

/**
 * Whether publishing this change order version needs the Owner's approval first (OWN-DEC-173 item 3 and the final
 * owner amendments of 2026-10-22). The documented hook contract for TSK-0082's change-order publishing, which calls
 * it and passes the result to the server's gate (changeOrderPublicationGate): a credit is a negative adjustmentCents
 * whose substance is listed in `adjustments` as a positive magnitude; a credit with no listed substance is treated as
 * a discretionary credit.
 */
export function evaluateChangeOrderPublication(
  threshold: ApprovalThreshold,
  facts: ChangeOrderPublicationFacts,
  credits: CreditPolicy = null,
): PublicationEvaluation {
  const adjustment = safe(facts.adjustmentCents, 'adjustment')
  const revised = safe(facts.revisedProjectValueCents, 'revised project value')
  if (revised < 0) throw new RangeError('a credit never makes the customer charge negative')
  const reasons = new Set<PublicationApprovalReason>()
  const combined = revised + linkedTotal(facts.linked)
  if (threshold === null) reasons.add('threshold_not_configured')
  else {
    const t = safe(threshold.thresholdCents, 'threshold')
    if (Math.abs(adjustment) > t) reasons.add('change_order_adjustment')
    if (revised > t) reasons.add('revised_project_value')
    if (revised <= t && facts.linked.length > 0 && combined > t) reasons.add('combined_project_total')
  }
  const margin = marginOf(Math.max(0, adjustment), facts.costs)
  const listed = facts.adjustments.reduce((sum, a) => sum + safe(a.amountCents, 'adjustment'), 0)
  const unexplained = adjustment < 0 ? -adjustment - listed : 0
  const flags = adjustmentFlags(
    unexplained > 0
      ? [...facts.adjustments, { kind: 'discretionary_credit', amountCents: unexplained, reason: null }]
      : facts.adjustments,
    threshold,
    credits,
  )
  if (margin?.negative) flags.push('negative_margin')
  return finish(threshold, reasons, flags, combined, facts.linked, margin)
}
