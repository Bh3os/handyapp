// SOP versions and the SOP pinned on a work package (TSK-0068; HH-PKT-03, HH-WORK-11, ENT-SOPVersion, ENT-WorkPackage,
// OWN-DEC-17, OWN-DEC-108, OQ-SAFETY-REVIEW, RULE-SAFETY-GATES, RULE-HUMAN-REVIEW, RULE-NO-INVENTED-FACTS).
//
//   pending_competent_review -> approved      sign_off: the Owner records the competent reviewer's sign-off
//   pending_competent_review -> superseded    supersede: a later import of changed content
//   approved                 -> superseded
//
// - The checklist content is imported verbatim from the SOP-* nodes (tools/import-sops.mjs); this module only reads
//   it. Nothing here writes, completes or reorders a step, and a stage with no step shows the fixed "ask the office"
//   message instead of a made-up one (HH-PKT-03).
// - Readiness (sopReadiness): a work package with no pinned SOP version is NOT CONFIGURED and cannot become ready. In
//   production the pinned version must carry the competent-review sign-off (OWN-DEC-17); on private staging (and in
//   local and ci) a version pending competent review may run under the "Pending competent review" banner
//   (OWN-DEC-108). This adds blockers only: it never clears a hold, a stop-work right or the Start Job gate
//   (RULE-SAFETY-GATES), and licensed-trade, structural and hazardous-material work is not decided here: the SOPs'
//   own HOLD controls route it to a hold and a named reviewer (RULE-HUMAN-REVIEW).
// PROPOSED: the sign-off names the reviewer and their qualification and says what was reviewed (OQ-SAFETY-REVIEW asks
// who the competent reviewers are; the software records the Owner's entry, it does not judge competence).
import { defineMachine, type Guard } from './engine.js'
import { reasonGiven } from './guards.js'

export const SOP_REVIEW_STATES = ['pending_competent_review', 'approved', 'superseded'] as const
export type SopReviewState = (typeof SOP_REVIEW_STATES)[number]

/** The six ordered checklist stages of HH-WORK-11 (OWN-DEC-108). */
export const SOP_STAGES = [
  'site_preparation',
  'setup_checks',
  'work_steps',
  'quality_checks',
  'cleanup_waste',
  'final_checks',
] as const
export type SopStage = (typeof SOP_STAGES)[number]

export const SOP_EVIDENCE_KINDS = ['photo', 'measurement', 'note'] as const
export type SopEvidenceKind = (typeof SOP_EVIDENCE_KINDS)[number]

type ItemBase = {
  /** `<stage>.<n>`, `stop.<n>` or `oq.<n>`: stable within the version. */
  readonly id: string
  /** The node's "From ..." heading naming the vault section, verbatim. */
  readonly section: string | null
  /** The vault line of the item's first line; null when the graph added the line (never shown as vault text). */
  readonly line: number | null
  /** The node's lines, verbatim and in order. */
  readonly lines: readonly string[]
}
export type SopStep = ItemBase & {
  readonly kind: 'step'
  readonly checkbox: boolean
  readonly evidence: readonly SopEvidenceKind[]
  /** PROPOSED: every step is required; the SOPs mark none optional (unknown is not safe, OWN-DEC-17). */
  readonly required: boolean
  /** The controls quoted directly before the step ("a HOLD placed before a step must be cleared before it starts"). */
  readonly holdBefore: readonly string[]
}
export type SopControl = ItemBase & {
  readonly kind: 'control'
  readonly control: 'HOLD' | 'GATE' | 'FLAG'
  readonly ref: string | null
}
export type SopNote = ItemBase & { readonly kind: 'note' | 'table' }
export type SopItem = SopStep | SopControl | SopNote
export type SopStageContent = {
  readonly stage: number
  readonly key: SopStage
  readonly heading: string
  readonly items: readonly SopItem[]
}
export type SopContent = {
  readonly stages: readonly SopStageContent[]
  readonly stopWork: readonly SopItem[]
  readonly openQuestions: readonly SopItem[]
}

/** An item's text as the worker reads it: the verbatim lines without list, quote and evidence markers. */
export function itemText(item: SopItem): string {
  if (item.kind === 'table') return item.lines.join('\n')
  if (item.kind === 'step')
    return item.lines
      .filter((l, i) => i === 0 || !/^ {2}- Evidence: /.test(l))
      .map((l, i) => (i === 0 ? l.replace(/^- (\[ \] )?/, '') : l.trim()))
      .join('\n')
  return item.lines.map((l) => l.replace(/^>\s?/, '')).join('\n')
}

/** A table item's header and rows (separator rows left out), cells trimmed, text unchanged. */
export function tableRows(item: SopItem): { header: string[]; rows: string[][] } {
  const rows = item.lines
    .filter((l) => !/^\|[\s:|-]+\|$/.test(l))
    .map((l) =>
      l
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((c) => c.trim()),
    )
  return { header: rows[0] ?? [], rows: rows.slice(1) }
}

/** The hazard checks of a version: every HOLD, GATE and FLAG control of the six stages. */
export function hazardControls(content: SopContent): SopControl[] {
  return content.stages.flatMap((s) => s.items.filter((i): i is SopControl => i.kind === 'control'))
}

export type SopPinFacts = {
  /** Whether an SOP version is pinned on the work package (false: NOT CONFIGURED). */
  readonly pinned: boolean
  /** Whether the pinned version carries the Owner's record of the competent-review sign-off. */
  readonly signedOff: boolean
  readonly environment: 'local' | 'ci' | 'staging' | 'production'
}

export type SopReadinessBlocker = 'SOP_NOT_CONFIGURED' | 'SOP_PENDING_COMPETENT_REVIEW'
export type SopReadiness = {
  /** Whether the SOP part of readiness holds; every other gate still applies on its own. */
  readonly ok: boolean
  readonly blockers: readonly SopReadinessBlocker[]
  /** The banner every step screen shows while the version has no competent-review sign-off. */
  readonly pendingReviewBanner: boolean
}

/**
 * The SOP part of a work package's readiness. NOT CONFIGURED (no pinned version) always blocks; a version without the
 * competent-review sign-off blocks in production and runs under the banner elsewhere (OWN-DEC-17, OWN-DEC-108). A
 * pinned version that a later import superseded keeps its own sign-off for the job that pinned it.
 */
export function sopReadiness(f: SopPinFacts): SopReadiness {
  if (!f.pinned) return { ok: false, blockers: ['SOP_NOT_CONFIGURED'], pendingReviewBanner: false }
  if (f.signedOff) return { ok: true, blockers: [], pendingReviewBanner: false }
  if (f.environment === 'production')
    return { ok: false, blockers: ['SOP_PENDING_COMPETENT_REVIEW'], pendingReviewBanner: true }
  return { ok: true, blockers: [], pendingReviewBanner: true }
}

export type SopSignOffFacts = {
  readonly reviewerName?: string
  readonly reviewerQualification?: string
  readonly reviewNote?: string
}
type G = Guard<SopSignOffFacts>
const reviewerNamed: G = (f) =>
  typeof f.reviewerName === 'string' && f.reviewerName.trim() !== ''
    ? null
    : { code: 'REVIEWER_REQUIRED', message: 'Name the competent reviewer.' }
const qualificationGiven: G = (f) =>
  typeof f.reviewerQualification === 'string' && f.reviewerQualification.trim() !== ''
    ? null
    : { code: 'QUALIFICATION_REQUIRED', message: "State the reviewer's qualification." }
const noteGiven: G = (f) => reasonGiven(f.reviewNote, 'A note saying what was reviewed')

export const SOP_VERSION_MACHINE = defineMachine({
  entity: 'sop_version',
  dimension: 'review',
  states: SOP_REVIEW_STATES,
  initial: 'pending_competent_review',
  final: ['superseded'],
  proposed: true,
  transitions: [
    {
      event: 'sign_off',
      from: ['pending_competent_review'],
      to: 'approved',
      actors: ['staff'],
      guards: [reviewerNamed, qualificationGiven, noteGiven],
    },
    { event: 'supersede', from: ['pending_competent_review', 'approved'], to: 'superseded', actors: ['system'] },
  ],
})
