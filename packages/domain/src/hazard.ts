// Stop Work, Report Hazard and issue reports (TSK-0077; HH-WORK-08, HH-WORK-09, HH-WORK-13, HH-CHG-04, HH-INC-01,
// HH-INC-02, ENT-IssueReport, ENT-Hold, OWN-DEC-80, OWN-DEC-108, OWN-DEC-143, OWN-DEC-172, RULE-SAFETY-GATES,
// RULE-HUMAN-REVIEW).
// - Stop Work / Report Hazard is never refused for a safety reason: whatever else is open, failing or missing on the
//   job (other holds, a failing Start Work gate, a paused job, an unacknowledged packet), the report is recorded and
//   writes its critical safety hold in the same transaction, under the job lock. Nothing here decides whether a
//   reported condition is safe: every hazard report is critical (PROPOSED: unknown is not safe), and only the
//   documented release path of the hold (HH-WORK-02: evidence, a named reviewer and their qualification, never by the
//   person who raised it) ends it.
// - A suspected gas leak and exposed, potentially live wiring never offer an on-site resolution; neither does any other
//   hazard report, an unsafe condition or an incident (OWN-DEC-80). The software gives no repair procedure for any of
//   them (RULE-HUMAN-REVIEW: licensed gas and electrical work, hazardous materials, structural, injury).
// - An issue report (HH-WORK-08) is resolved on site only when the worker states the fix is within their training,
//   qualifications, the approved scope and the approved SOP, and no unresolved safety hold exists on the job; the
//   record then says what happened, the steps, the materials and how the result was checked, and the Owner is
//   notified. The worker's statement is recorded, never verified by the software.
// - Incident and injury details are restricted (OWN-DEC-143): the Owner and the reporting worker only.
// PROPOSED (OQ-STOP-WORK-DETAILS): the hazard kinds, the severity scale, the next owners, the reviewer named per hazard
// and that a critical-severity issue takes the stop-work path.

/** What a Stop Work / Report Hazard names (PROPOSED, from OWN-DEC-80, ENT-Hold and RULE-HUMAN-REVIEW). */
export const HAZARD_KINDS = [
  'gas_leak',
  'live_wiring',
  'hazardous_material',
  'structural',
  'licensed_trade',
  'injury',
  'other_unsafe',
] as const
export type HazardKind = (typeof HAZARD_KINDS)[number]

/** The issue categories of HH-WORK-08, in its order. */
export const ISSUE_CATEGORIES = [
  'unsafe_condition',
  'scope_mismatch',
  'hidden_damage',
  'material_problem',
  'missing_equipment',
  'access_problem',
  'customer_change',
  'weather',
  'product_defect',
  'incident',
] as const
export type IssueCategory = (typeof ISSUE_CATEGORIES)[number]

/** PROPOSED severity scale; `critical` always takes the stop-work path with a critical hold. */
export const ISSUE_SEVERITIES = ['critical', 'major', 'minor'] as const
export type IssueSeverity = (typeof ISSUE_SEVERITIES)[number]

/** Who handles a report next (HH-WORK-08 "the next owner", PROPOSED values). */
export const NEXT_OWNERS = ['owner', 'office', 'worker'] as const
export type NextOwner = (typeof NEXT_OWNERS)[number]

export const REPORT_KINDS = ['hazard', 'issue'] as const
export type ReportKind = (typeof REPORT_KINDS)[number]

/** The visibility class of a report and its photos (HH-STAFF-05). */
export type ReportVisibility = 'internal_operational' | 'restricted_incident'

/** The critical safety hold categories (migration 0074 holds_critical_categories). */
export type CriticalHoldCategory =
  'gas_leak' | 'live_wiring' | 'hazardous_material' | 'structural' | 'licensed_trade' | 'other'

/** The category of the critical hold a hazard writes. */
export function holdCategoryOf(hazard: HazardKind): CriticalHoldCategory {
  return hazard === 'injury' || hazard === 'other_unsafe' ? 'other' : hazard
}

/** Restricted incident details (OWN-DEC-143): an injury or an incident report. */
export function reportVisibility(r: { hazard?: HazardKind | null; category?: IssueCategory | null }): ReportVisibility {
  return r.hazard === 'injury' || r.category === 'incident' ? 'restricted_incident' : 'internal_operational'
}

/** Whether a report writes a critical safety hold in its own transaction: every hazard, every critical issue. */
export function writesCriticalHold(r: { kind: ReportKind; severity: IssueSeverity }): boolean {
  return r.kind === 'hazard' || r.severity === 'critical'
}

/**
 * The severity a report is recorded with: a hazard and an unsafe condition are always critical, whatever was sent
 * (unknown is not safe); an issue keeps the severity its reporter chose.
 */
export function effectiveSeverity(r: {
  kind: ReportKind
  category?: IssueCategory | null
  severity?: IssueSeverity | null
}): IssueSeverity {
  if (r.kind === 'hazard' || r.category === 'unsafe_condition') return 'critical'
  return r.severity ?? 'major'
}

/**
 * Who must review what a hazard names (RULE-HUMAN-REVIEW: flag it and name the reviewer, never decide). PROPOSED roles,
 * never a person or a firm; HandyHub never performs licensed gas, electrical, plumbing, HVAC or structural work and
 * never removes hazardous materials. The Owner arranges the review (OWN-DEC-172).
 */
export const HAZARD_REVIEWER = {
  gas_leak: 'gas_utility_or_licensed_gas_professional',
  live_wiring: 'licensed_electrician',
  hazardous_material: 'qualified_hazardous_materials_assessor',
  structural: 'structural_engineer',
  licensed_trade: 'licensed_trade_professional',
  injury: 'owner_professional_referral',
  other_unsafe: 'qualified_safety_reviewer',
} as const satisfies Record<HazardKind, string>
export type HazardReviewer = (typeof HAZARD_REVIEWER)[HazardKind]
export const HAZARD_REVIEWERS = [...new Set(Object.values(HAZARD_REVIEWER))] as readonly HazardReviewer[]

/**
 * The emergency guidance a hazard shows at once (HH-WORK-13, OWN-DEC-80, OWN-DEC-172), as catalog codes: Call 911
 * always comes first and is never behind anything; a gas leak means evacuate and call from a safe place; live wiring is
 * never touched; every hazard stops the affected work, keeps people away and calls the Owner. No repair procedure.
 */
export const HAZARD_GUIDANCE = {
  gas_leak: ['evacuate_call_from_safe_place', 'never_gas_repair', 'keep_people_away', 'call_owner'],
  live_wiring: ['never_touch_wiring', 'keep_people_away', 'call_owner'],
  hazardous_material: ['do_not_disturb_material', 'keep_people_away', 'call_owner'],
  structural: ['stop_affected_work', 'keep_people_away', 'call_owner'],
  licensed_trade: ['no_licensed_work', 'stop_affected_work', 'call_owner'],
  injury: ['call_911_serious_injury', 'stop_affected_work', 'call_owner'],
  other_unsafe: ['stop_affected_work', 'keep_people_away', 'call_owner'],
} as const satisfies Record<HazardKind, readonly string[]>
export const GUIDANCE_CODES = [...new Set(Object.values(HAZARD_GUIDANCE).flat())]

/** An on-site resolution as the worker records it (HH-WORK-08, OWN-DEC-80). */
export type OnSiteResolution = {
  readonly whatHappened: string
  readonly steps: string
  readonly materials: string
  readonly howChecked: string
  /** The worker's statement: within their training, qualifications, the approved scope and the approved SOP. */
  readonly withinTrainingAndScope: boolean
}

export type OnSiteResolutionProblem =
  'RESOLVE_ON_SITE_NOT_OFFERED' | 'SAFETY_HOLD_OPEN' | 'NOT_WITHIN_TRAINING_AND_SCOPE' | 'RESOLUTION_INCOMPLETE'

const filled = (s: string | undefined) => typeof s === 'string' && s.trim() !== ''

/**
 * Why an on-site resolution is not recorded; empty when it may be. Never offered for a hazard, an unsafe condition, an
 * incident or a critical issue; refused while any safety hold of the job is unresolved.
 */
export function onSiteResolutionProblems(
  r: { kind: ReportKind; category?: IssueCategory | null; severity: IssueSeverity },
  resolution: Partial<OnSiteResolution>,
  facts: { readonly unresolvedSafetyHolds: number },
): OnSiteResolutionProblem[] {
  if (
    r.kind === 'hazard' ||
    r.severity === 'critical' ||
    r.category === 'unsafe_condition' ||
    r.category === 'incident'
  )
    return ['RESOLVE_ON_SITE_NOT_OFFERED']
  const out: OnSiteResolutionProblem[] = []
  if (facts.unresolvedSafetyHolds > 0) out.push('SAFETY_HOLD_OPEN')
  if (resolution.withinTrainingAndScope !== true) out.push('NOT_WITHIN_TRAINING_AND_SCOPE')
  if (![resolution.whatHappened, resolution.steps, resolution.materials, resolution.howChecked].every(filled))
    out.push('RESOLUTION_INCOMPLETE')
  return out
}

/**
 * What a report stops (HH-CHG-04): the named work packages of the job, or every one when none is named or the report
 * cannot be separated safely (a gas leak, live wiring, hazardous material, structural concern or injury stops the
 * whole job, PROPOSED). Complete packages are never reopened.
 */
export function affectedPackages(
  r: { hazard?: HazardKind | null },
  named: readonly string[],
  jobPackages: readonly { id: string; state: string }[],
): string[] {
  const wholeJob =
    named.length === 0 ||
    ['gas_leak', 'live_wiring', 'hazardous_material', 'structural', 'injury'].includes(r.hazard ?? '')
  const ids = wholeJob ? jobPackages.map((p) => p.id) : named
  return jobPackages
    .filter((p) => ids.includes(p.id) && p.state !== 'complete')
    .map((p) => p.id)
    .sort()
}

/** The job states a report pauses: work under way moves to paused with the hold (HH-WORK-09). */
export function pausesJob(jobState: string): boolean {
  return jobState === 'in_progress'
}
