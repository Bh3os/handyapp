// The job checklist: step lifecycle, stage order, evidence and the completion summary (TSK-0075; HH-WORK-11,
// HH-WORK-05, T47, ENT-Task). Pure: no database.
import { describe, expect, it } from 'vitest'
import {
  apply,
  checklistSummary,
  currentStage,
  earlierOpen,
  eventsFrom,
  evidenceMissing,
  CHECKLIST_STEP_MACHINE,
  type ChecklistStepState,
} from '../src/index.js'

const now = new Date('2026-10-23T15:00:00Z')
const ctx = (facts: object, expectedVersion = 0) => ({ actor: 'staff' as const, expectedVersion, now, facts })
const step = (state: ChecklistStepState, version = 1) =>
  ({ machine: 'checklist_step.lifecycle', state, version }) as const

describe('checklist step lifecycle (TSK-0075, HH-WORK-05)', () => {
  it('[HH-WORK-05] not started -> in progress <-> paused -> completed; skipped and reopened with a reason', () => {
    expect(eventsFrom(CHECKLIST_STEP_MACHINE, 'not_started')).toEqual(['start', 'complete', 'skip'])
    expect(apply(step('not_started', 0), 'start', ctx({ earlierOpen: 0 }))).toMatchObject({
      ok: true,
      to: 'in_progress',
    })
    expect(apply(step('in_progress'), 'pause', ctx({}, 1))).toMatchObject({ ok: true, to: 'paused' })
    expect(apply(step('paused'), 'resume', ctx({ earlierOpen: 0 }, 1))).toMatchObject({ ok: true, to: 'in_progress' })
    const noReason = apply(step('in_progress'), 'skip', ctx({}, 1))
    expect(noReason.ok ? [] : noReason.problems.map((p) => p.code)).toEqual(['REASON_REQUIRED'])
    expect(apply(step('completed'), 'reopen', ctx({ earlierOpen: 0, reason: 'recheck' }, 1))).toMatchObject({
      ok: true,
      to: 'in_progress',
    })
    expect(apply(step('completed'), 'pause', ctx({}, 1))).toMatchObject({ ok: false, code: 'INVALID_TRANSITION' })
  })

  it('[HH-WORK-11] a step of a later stage waits for the earlier stages; completing needs its evidence', () => {
    const early = apply(step('not_started', 0), 'complete', ctx({ earlierOpen: 2, evidence: [] }))
    expect(early.ok ? [] : early.problems.map((p) => p.code)).toEqual(['EARLIER_STAGE_OPEN'])
    const bare = apply(
      step('in_progress'),
      'complete',
      ctx({ earlierOpen: 0, evidence: ['photo', 'note'], photos: 0 }, 1),
    )
    expect(bare.ok ? [] : bare.problems.map((p) => p.code)).toEqual(['EVIDENCE_MISSING'])
    expect(evidenceMissing(['photo', 'measurement', 'note'], { photos: 1, measurement: ' ', note: 'ok' })).toEqual([
      'measurement',
    ])
  })
})

describe('stage order and the completion summary (TSK-0075, T47)', () => {
  const steps = [
    { id: '1.1', stage: 1, required: true },
    { id: '1.2', stage: 1, required: true },
    { id: '2.1', stage: 2, required: true },
  ]
  it('[HH-WORK-11] counts the open steps of earlier stages and finds the current stage', () => {
    const recorded = [{ stepId: '1.1', stage: 1, state: 'completed' as const }]
    expect(earlierOpen(steps, recorded, 2)).toBe(1)
    expect(currentStage(steps, recorded)).toBe(1)
    const done = [...recorded, { stepId: '1.2', stage: 1, state: 'skipped' as const }]
    expect(earlierOpen(steps, done, 2)).toBe(0)
    expect(currentStage(steps, done)).toBe(2)
  })
  it('[T47] a skipped required step blocks completion and stays visible', () => {
    expect(
      checklistSummary(steps, [
        { stepId: '1.1', stage: 1, state: 'completed' },
        { stepId: '1.2', stage: 1, state: 'skipped' },
        { stepId: '2.1', stage: 2, state: 'completed' },
      ]),
    ).toEqual({ steps: 3, completed: 2, skipped: 1, requiredSkipped: 1, requiredOpen: 0, complete: false })
    expect(checklistSummary(steps, [])).toMatchObject({ requiredOpen: 3, complete: false })
  })
})
