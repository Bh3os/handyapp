// The job checklist in six ordered stages and active execution (TSK-0075; HH-WORK-11, HH-WORK-05, HH-WORK-12, T47,
// ENT-Task, OWN-DEC-108, OWN-DEC-109, RULE-SAFETY-GATES, RULE-NO-INVENTED-FACTS).
//
//   step: not_started -> in_progress <-> paused;  in_progress -> completed;  not_started / in_progress / paused ->
//         skipped (with a reason);  completed / skipped -> in_progress (reopened with a reason)
//
// - The steps are the pinned SOP version's own (TSK-0068): their stage, requirement and evidence come from it, never
//   from here. A stage opens once every step of the earlier stages is completed or skipped (PROPOSED: steps within a
//   stage may be done in any order).
// - Completing records every evidence kind the step asks for (a photo, a measurement, a note).
// - Skipping needs a reason, stays visible to the reviewer and, for a required step, blocks completion of the job
//   (checklistSummary: TSK-0083 reads it for Finished).
// - Reopening keeps the earlier evidence: the history keeps every value.
// PROPOSED (OQ-CHECKLIST-DETAILS): the step states (`ready` is shown, not stored), the order within a stage, the
// reopen target and the handoff note.
import { defineMachine, type Guard } from './engine.js'
import { reasonGiven } from './guards.js'
import type { SopContent, SopEvidenceKind, SopStep } from './sop.js'

export const CHECKLIST_STEP_STATES = ['not_started', 'in_progress', 'paused', 'completed', 'skipped'] as const
export type ChecklistStepState = (typeof CHECKLIST_STEP_STATES)[number]

export type ChecklistStepFacts = {
  /** Steps of the earlier stages not yet completed or skipped. */
  readonly earlierOpen?: number
  /** The evidence the step asks for, and what is recorded with this event. */
  readonly evidence?: readonly SopEvidenceKind[]
  readonly photos?: number
  readonly measurement?: string | null
  readonly note?: string | null
  readonly reason?: string
}

type G = Guard<ChecklistStepFacts>
const stageOpen: G = (f) => {
  if (f.earlierOpen === undefined) return { code: 'FACTS_MISSING', message: 'The server must check: earlier stages.' }
  return f.earlierOpen > 0
    ? { code: 'EARLIER_STAGE_OPEN', message: 'Complete or skip every step of the earlier stages first.' }
    : null
}
const evidenceGiven: G = (f) => {
  const missing = evidenceMissing(f.evidence ?? [], f)
  return missing.length
    ? { code: 'EVIDENCE_MISSING', message: `Record the evidence this step asks for: ${missing.join(', ')}.` }
    : null
}
const reason: G = (f) => reasonGiven(f.reason, 'A reason')

export const CHECKLIST_STEP_MACHINE = defineMachine({
  entity: 'checklist_step',
  dimension: 'lifecycle',
  states: CHECKLIST_STEP_STATES,
  initial: 'not_started',
  final: [],
  proposed: true,
  transitions: [
    { event: 'start', from: ['not_started'], to: 'in_progress', actors: ['staff'], guards: [stageOpen] },
    { event: 'pause', from: ['in_progress'], to: 'paused', actors: ['staff'] },
    { event: 'resume', from: ['paused'], to: 'in_progress', actors: ['staff'], guards: [stageOpen] },
    {
      event: 'complete',
      from: ['not_started', 'in_progress'],
      to: 'completed',
      actors: ['staff'],
      guards: [stageOpen, evidenceGiven],
    },
    {
      event: 'skip',
      from: ['not_started', 'in_progress', 'paused'],
      to: 'skipped',
      actors: ['staff'],
      guards: [reason],
    },
    {
      event: 'reopen',
      from: ['completed', 'skipped'],
      to: 'in_progress',
      actors: ['staff'],
      guards: [stageOpen, reason],
    },
  ],
})
export type ChecklistStepEvent = (typeof CHECKLIST_STEP_MACHINE.transitions)[number]['event']

/** The evidence kinds a step asks for that are not recorded. */
export function evidenceMissing(
  asked: readonly SopEvidenceKind[],
  given: { photos?: number; measurement?: string | null; note?: string | null },
): SopEvidenceKind[] {
  return asked.filter((k) =>
    k === 'photo' ? (given.photos ?? 0) === 0 : k === 'measurement' ? !given.measurement?.trim() : !given.note?.trim(),
  )
}

/** The steps of an SOP version in order, with their stage. */
export function sopSteps(content: SopContent): (SopStep & { stage: number })[] {
  return content.stages.flatMap((s) =>
    s.items.filter((i): i is SopStep => i.kind === 'step').map((i) => ({ ...i, stage: s.stage })),
  )
}

export type RecordedStep = { readonly stepId: string; readonly stage: number; readonly state: ChecklistStepState }

/** Steps of the stages before `stage` that are not completed or skipped yet. */
export function earlierOpen(
  steps: readonly { id: string; stage: number }[],
  recorded: readonly RecordedStep[],
  stage: number,
): number {
  const done = new Set(recorded.filter((r) => r.state === 'completed' || r.state === 'skipped').map((r) => r.stepId))
  return steps.filter((s) => s.stage < stage && !done.has(s.id)).length
}

/** The first stage with a step not yet completed or skipped (7 when every step is done). */
export function currentStage(
  steps: readonly { id: string; stage: number }[],
  recorded: readonly RecordedStep[],
): number {
  const done = new Set(recorded.filter((r) => r.state === 'completed' || r.state === 'skipped').map((r) => r.stepId))
  return steps.find((s) => !done.has(s.id))?.stage ?? 7
}

export type ChecklistSummary = {
  readonly steps: number
  readonly completed: number
  readonly skipped: number
  /** Required steps skipped: they block completion and are shown to the reviewer (HH-WORK-11). */
  readonly requiredSkipped: number
  /** Required steps neither completed nor skipped. */
  readonly requiredOpen: number
  /** Whether the checklist lets the job be submitted as finished. */
  readonly complete: boolean
}

/** The checklist of one work package as Finished and the reviewer read it. */
export function checklistSummary(
  steps: readonly { id: string; required: boolean }[],
  recorded: readonly RecordedStep[],
): ChecklistSummary {
  const state = new Map(recorded.map((r) => [r.stepId, r.state]))
  const completed = steps.filter((s) => state.get(s.id) === 'completed').length
  const skipped = steps.filter((s) => state.get(s.id) === 'skipped').length
  const requiredSkipped = steps.filter((s) => s.required && state.get(s.id) === 'skipped').length
  const requiredOpen = steps.filter(
    (s) => s.required && state.get(s.id) !== 'completed' && state.get(s.id) !== 'skipped',
  ).length
  return {
    steps: steps.length,
    completed,
    skipped,
    requiredSkipped,
    requiredOpen,
    complete: requiredSkipped === 0 && requiredOpen === 0,
  }
}
