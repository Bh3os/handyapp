// Return work and resuming (TSK-0094; HH-QA-07, HH-QA-08, HH-INC-03, FACT-WARRANTY, OWN-DEC-135). Dates are local
// calendar dates, so nothing here depends on the time of day or a daylight-saving change.
import { describe, expect, it } from 'vitest'
import {
  classifyReturnWork,
  RETURN_VISIT_JOB_STATES,
  RETURN_WORK_CLASSES,
  resumeNeeded,
  WARRANTY_DAYS,
  warrantyWindow,
} from '../src/return-work.js'
import { START_GATE_CODES } from '../src/start-gate.js'

describe('[FACT-WARRANTY][OWN-DEC-135] the 90-day warranty window from the reviewed completion date', () => {
  it('is 90 days, counted in local dates and inclusive of the 90th day', () => {
    expect(WARRANTY_DAYS).toBe(90)
    expect(warrantyWindow('2026-08-01', '2026-10-30')).toEqual({
      reviewedCompletionOn: '2026-08-01',
      lastDayOn: '2026-10-30',
      reportedOn: '2026-10-30',
      within: true,
    })
    expect(warrantyWindow('2026-08-01', '2026-10-31').within).toBe(false)
    // Across the November daylight-saving change and a year end: still calendar days.
    expect(warrantyWindow('2026-10-15', '2027-01-13').within).toBe(true)
    expect(warrantyWindow('2026-10-15', '2027-01-14').within).toBe(false)
  })

  it('has no window without a reviewed completion, and none for a report before it', () => {
    expect(warrantyWindow(null, '2026-10-25')).toEqual({
      reviewedCompletionOn: null,
      lastDayOn: null,
      reportedOn: '2026-10-25',
      within: null,
    })
    expect(warrantyWindow('2026-10-25', '2026-10-24').within).toBe(false)
    expect(() => warrantyWindow('2026-10-25', 'yesterday')).toThrow()
  })
})

describe('[HH-QA-07] classification: people choose; only the warranty rule is applied', () => {
  const inside = { window: warrantyWindow('2026-09-25', '2026-10-25'), reviewPassed: true }
  const after = { window: warrantyWindow('2026-06-01', '2026-10-25'), reviewPassed: true }
  const unreviewed = { window: warrantyWindow(null, '2026-10-25'), reviewPassed: false }

  it('has the seven classes of HH-QA-07', () => {
    expect(RETURN_WORK_CLASSES).toEqual([
      'open_punch',
      'workmanship_callback',
      'warranty_claim',
      'new_scope',
      'customer_change_or_damage',
      'product_issue',
      'unresolved',
    ])
  })

  it('records a workmanship problem as a warranty claim inside the window and a callback after it', () => {
    for (const chosen of ['workmanship_callback', 'warranty_claim'] as const) {
      expect(classifyReturnWork(chosen, inside)).toEqual({ ok: true, classification: 'warranty_claim' })
      expect(classifyReturnWork(chosen, after)).toEqual({ ok: true, classification: 'workmanship_callback' })
      expect(classifyReturnWork(chosen, unreviewed)).toEqual({ ok: false, code: 'REVIEW_NOT_PASSED' })
    }
  })

  it('keeps every other class as chosen; open punch only before the review passed', () => {
    for (const chosen of ['new_scope', 'customer_change_or_damage', 'product_issue', 'unresolved'] as const)
      expect(classifyReturnWork(chosen, inside)).toEqual({ ok: true, classification: chosen })
    expect(classifyReturnWork('open_punch', unreviewed)).toEqual({ ok: true, classification: 'open_punch' })
    expect(classifyReturnWork('open_punch', inside)).toEqual({ ok: false, code: 'REVIEW_ALREADY_PASSED' })
  })
})

describe('[HH-QA-08] a return visit starts after Finished and never moves the job', () => {
  it('starts only once the job awaits review, is operationally complete or closed', () => {
    expect(RETURN_VISIT_JOB_STATES).toEqual(['ready_for_qa', 'operationally_complete', 'closed'])
  })
})

describe('[HH-INC-03] resuming after a pause', () => {
  const pausedAt = new Date('2026-10-25T15:00:00Z')
  const earlier = new Date('2026-10-25T14:00:00Z')
  const later = new Date('2026-10-25T16:00:00Z')

  it('is needed by a worker who started before the pause and has not started or resumed since', () => {
    expect(resumeNeeded({ jobState: 'paused', startedOnJob: true, pausedAt, lastActiveAt: earlier })).toBe(true)
    expect(resumeNeeded({ jobState: 'in_progress', startedOnJob: true, pausedAt, lastActiveAt: earlier })).toBe(true)
    expect(resumeNeeded({ jobState: 'in_progress', startedOnJob: true, pausedAt, lastActiveAt: later })).toBe(false)
  })

  it('is never needed without a pause, a start, or a job that can resume', () => {
    expect(resumeNeeded({ jobState: 'paused', startedOnJob: true, pausedAt: null, lastActiveAt: earlier })).toBe(false)
    expect(resumeNeeded({ jobState: 'paused', startedOnJob: false, pausedAt, lastActiveAt: null })).toBe(false)
    expect(resumeNeeded({ jobState: 'ready_for_qa', startedOnJob: true, pausedAt, lastActiveAt: earlier })).toBe(false)
  })

  it('names its refusals as Start Work gate codes of the assignment prerequisite', () => {
    expect(START_GATE_CODES.NOT_STARTED_BEFORE.item).toBe('assignment')
    expect(START_GATE_CODES.RESUME_NOT_NEEDED.item).toBe('assignment')
  })
})
