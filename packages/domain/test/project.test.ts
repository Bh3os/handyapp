// Project lifecycle (TSK-0009; HH-STATE-02, HH-QA-09, OWN-DEC-100; PROPOSED state model, see src/project.ts).
import { describe, expect, it } from 'vitest'
import { apply, PROJECT_MACHINE, type ProjectFacts, type ProjectState } from '../src/index.js'
import { pairs, reachableAvoiding } from './helpers.js'

const NOW = new Date('2026-10-20T15:00:00Z')
type Event = Parameters<typeof apply<'project.lifecycle'>>[1]

const SETTLED: ProjectFacts = {
  workAccepted: false,
  appointmentExists: false,
  moneyReceived: false,
  requestState: 'declined',
  hasJob: false,
  jobOperationallyComplete: true,
  jobClosed: true,
  openBalance: false,
  pendingChecks: false,
  openCases: false,
  financialReviewRecorded: true,
  hasAcceptedEstimate: false,
  reason: 'Synthetic reason',
}
/** Facts that meet every guard of each event (some events need opposite facts). */
const FACTS: Record<Event, ProjectFacts> = {
  approve: SETTLED,
  close: SETTLED,
  reopen: { ...SETTLED, requestState: 'reviewing' },
  complete: SETTLED,
  close_out: SETTLED,
  route_to_owner_review: { ...SETTLED, workAccepted: true },
  cancel: SETTLED,
  keep_open: SETTLED,
  keep_approved: { ...SETTLED, hasAcceptedEstimate: true },
}

const run = (
  state: ProjectState,
  event: Event,
  facts: ProjectFacts = FACTS[event],
  actor: 'staff' | 'customer' | 'system' = 'staff',
) => apply({ machine: 'project.lifecycle', state, version: 7 }, event, { actor, expectedVersion: 7, now: NOW, facts })

describe('project: every invalid transition is rejected with a reason (TSK-0009, HH-STATE-02)', () => {
  it('is a PROPOSED table until the owner confirms the project states', () => {
    expect(PROJECT_MACHINE.proposed).toBe(true)
  })

  for (const { state, event, transition } of pairs(PROJECT_MACHINE)) {
    it(`${event} from ${state} is ${transition ? `allowed, to ${transition.to}` : 'refused'}`, () => {
      const r = run(state, event, FACTS[event], transition?.actors[0] ?? 'staff')
      if (transition) expect(r).toMatchObject({ ok: true, from: state, to: transition.to, version: 8 })
      else expect(r).toMatchObject({ ok: false, code: 'INVALID_TRANSITION' })
    })
  }
})

describe('project: closeout and cancellation cannot skip required states (TSK-0009, HH-STATE-02, HH-QA-09)', () => {
  it('approved work closes only through completed, and cancels only through the Owner review', () => {
    expect(reachableAvoiding(PROJECT_MACHINE, 'approved', 'canceled', ['cancellation_review'])).toBe(false)
    expect(reachableAvoiding(PROJECT_MACHINE, 'approved', 'closed', ['completed', 'cancellation_review'])).toBe(false)
    expect(reachableAvoiding(PROJECT_MACHINE, 'open', 'canceled', ['cancellation_review'])).toBe(false)
    expect(run('approved', 'close')).toMatchObject({ ok: false, code: 'INVALID_TRANSITION' })
    expect(run('approved', 'cancel')).toMatchObject({ ok: false, code: 'INVALID_TRANSITION' })
    expect(run('approved', 'close_out')).toMatchObject({ ok: false, code: 'INVALID_TRANSITION' })
  })

  it('kept projects return to the state their acceptance allows, never around the review', () => {
    expect(run('cancellation_review', 'keep_open', { ...SETTLED, hasAcceptedEstimate: true })).toMatchObject({
      problems: [{ code: 'HAS_ACCEPTED_ESTIMATE' }],
    })
    expect(run('cancellation_review', 'keep_approved', SETTLED)).toMatchObject({
      problems: [{ code: 'NO_ACCEPTED_ESTIMATE' }],
    })
  })

  it('closeout names every unresolved obligation: job, balance, pending checks and cases', () => {
    const r = run('completed', 'close_out', {
      ...SETTLED,
      jobClosed: false,
      openBalance: true,
      pendingChecks: true,
      openCases: true,
    })
    expect(r).toMatchObject({
      ok: false,
      code: 'GUARD_FAILED',
      problems: [
        { code: 'JOB_NOT_CLOSED' },
        { code: 'OPEN_BALANCE' },
        { code: 'PENDING_CHECKS' },
        { code: 'OPEN_CASES' },
      ],
    })
    // Unknown facts are refused, never assumed settled.
    expect(run('completed', 'close_out', {}).ok).toBe(false)
  })

  it('completes only after the Owner quality review passed the job', () => {
    expect(run('approved', 'complete', { ...SETTLED, jobOperationallyComplete: false }, 'system')).toMatchObject({
      problems: [{ code: 'JOB_NOT_COMPLETE' }],
    })
  })

  it('an open project with accepted work, an appointment or money cannot simply close (OWN-DEC-100)', () => {
    for (const fact of ['workAccepted', 'appointmentExists', 'moneyReceived'] as const) {
      expect(run('open', 'close', { ...SETTLED, [fact]: true })).toMatchObject({
        problems: [{ code: 'OWNER_REVIEW_REQUIRED' }],
      })
      expect(run('open', 'route_to_owner_review', { ...SETTLED, [fact]: true })).toMatchObject({
        ok: true,
        to: 'cancellation_review',
        effects: ['owner_review.queue'],
      })
    }
    expect(run('open', 'route_to_owner_review', SETTLED)).toMatchObject({ problems: [{ code: 'NO_OBLIGATIONS' }] })
  })

  it('cancelling needs the recorded financial review and a reason', () => {
    expect(
      run('cancellation_review', 'cancel', { ...SETTLED, financialReviewRecorded: false, reason: '' }),
    ).toMatchObject({
      problems: [{ code: 'FINANCIAL_REVIEW_REQUIRED' }, { code: 'REASON_REQUIRED' }],
    })
  })

  it('closes only after the request closed, and reopens only when the request was reopened by a reply', () => {
    expect(run('open', 'close', { ...SETTLED, requestState: 'reviewing' })).toMatchObject({
      problems: [{ code: 'REQUEST_NOT_CLOSED' }],
    })
    expect(run('closed', 'reopen', { ...SETTLED, requestState: 'closed_no_response' }, 'system')).toMatchObject({
      problems: [{ code: 'REQUEST_NOT_REOPENED' }],
    })
  })

  it('a project has at most one job', () => {
    expect(run('open', 'approve', { ...SETTLED, hasJob: true }, 'system')).toMatchObject({
      problems: [{ code: 'JOB_EXISTS' }],
    })
    expect(run('open', 'approve', SETTLED, 'system')).toMatchObject({
      ok: true,
      to: 'approved',
      effects: ['job.create'],
    })
  })

  it('a stale version is refused (HH-STATE-01)', () => {
    const r = apply({ machine: 'project.lifecycle', state: 'open', version: 8 }, 'close', {
      actor: 'staff',
      expectedVersion: 7,
      now: NOW,
      facts: SETTLED,
    })
    expect(r).toMatchObject({ ok: false, code: 'STALE_VERSION' })
  })
})
