// The customer's view of a project's progress (TSK-0038; HH-PORT-02, HH-PORT-03, HH-PORT-07, T23, T48, OWN-DEC-105).
import { describe, expect, it } from 'vitest'
import {
  customerSituation,
  customerStatus,
  DASHBOARD_SECTIONS,
  dashboardSection,
  REQUEST_STATES,
  PROJECT_STATES,
  type PortalFacts,
  type CustomerStatus,
} from '../src/index.js'

const OPEN: PortalFacts = { requestState: 'received', projectState: 'open' }
const status = (over: Partial<PortalFacts>): CustomerStatus => customerStatus({ ...OPEN, ...over })

describe('customer situations from the request and project records (TSK-0038, HH-PORT-03)', () => {
  it('[HH-PORT-03] received, review and estimate preparation wait on HandyHub with "review the details"', () => {
    for (const requestState of ['received', 'reviewing', 'ready_for_estimate'] as const)
      expect(status({ requestState })).toEqual({
        situation: 'received',
        step: 'review_details',
        waitingOn: 'handyhub',
        nextAction: 'none',
      })
  })

  it('[HH-PORT-02][HH-PORT-03] awaiting the customer’s facts: "Waiting on you" with Reply', () => {
    expect(status({ requestState: 'needs_information' })).toEqual({
      situation: 'more_information',
      step: 'answer_questions',
      waitingOn: 'customer',
      nextAction: 'reply',
    })
  })

  it('[HH-PORT-03] a site visit is needed: HandyHub offers windows first, then the customer chooses one', () => {
    expect(status({ requestState: 'needs_site_visit' })).toMatchObject({
      situation: 'site_visit',
      step: 'visit_windows_pending',
      waitingOn: 'handyhub',
      nextAction: 'none',
    })
    expect(status({ requestState: 'needs_site_visit', visitWindowsOffered: true })).toMatchObject({
      situation: 'site_visit',
      waitingOn: 'customer',
      nextAction: 'choose_visit_window',
    })
    expect(status({ requestState: 'needs_site_visit', visit: 'confirmed' })).toMatchObject({ situation: 'scheduled' })
  })

  it('[HH-PORT-03][HH-LEAD-08] Not a fit, withdrawal, cancellation and Closed—no response are closed: nobody waits', () => {
    for (const requestState of ['declined', 'outside_scope', 'not_served'] as const)
      expect(status({ requestState, projectState: 'closed' })).toEqual({
        situation: 'not_a_fit',
        step: 'decision',
        waitingOn: 'nobody',
        nextAction: 'none',
      })
    expect(status({ requestState: 'withdrawn', projectState: 'closed' }).situation).toBe('canceled')
    expect(status({ requestState: 'estimated', projectState: 'canceled' }).situation).toBe('canceled')
    expect(status({ requestState: 'closed_no_response', projectState: 'closed' })).toEqual({
      situation: 'closed_no_response',
      step: 'closed',
      waitingOn: 'nobody',
      nextAction: 'none',
    })
  })

  it('[HH-LEAD-06][T30] Closed—no response within the reopen period: the reply that reopens it is the one action', () => {
    expect(status({ requestState: 'closed_no_response', projectState: 'closed', reopenByReply: true })).toEqual({
      situation: 'closed_no_response',
      step: 'closed',
      waitingOn: 'customer',
      nextAction: 'reply',
    })
    expect(status({ requestState: 'closed_no_response', projectState: 'closed', reopenByReply: false })).toMatchObject({
      waitingOn: 'nobody',
      nextAction: 'none',
    })
  })

  it('[HH-PORT-02] every state pair gives one situation, one step, who waits and exactly one action', () => {
    for (const requestState of REQUEST_STATES)
      for (const projectState of PROJECT_STATES) {
        const s = customerStatus({ requestState, projectState })
        expect(typeof s.situation).toBe('string')
        expect(typeof s.nextAction).toBe('string')
        // Waiting on the customer always comes with something to do; otherwise there is no action.
        expect(s.waitingOn === 'customer', `${requestState}/${projectState}`).toBe(s.nextAction !== 'none')
      }
  })

  it('[T48][HH-PORT-03] a safety hold shows only the neutral safety status and asks nothing of the customer', () => {
    const s = status({
      requestState: 'estimated',
      projectState: 'approved',
      estimateApproved: true,
      workInProgress: true,
      hold: 'safety',
      invoiceDue: true,
      changeToReview: true,
    })
    expect(s).toEqual({ situation: 'safety_hold', step: 'safety_review', waitingOn: 'handyhub', nextAction: 'none' })
    expect(status({ projectState: 'approved', workInProgress: true, hold: 'other' }).situation).toBe('update_pending')
  })

  it('[HH-PORT-03] completion review and follow-up work wait on HandyHub; the payment stays a separate action', () => {
    expect(status({ projectState: 'approved', completion: 'quality_review' })).toMatchObject({
      situation: 'completion_review',
      waitingOn: 'handyhub',
    })
    expect(status({ projectState: 'approved', completion: 'follow_up' })).toMatchObject({
      situation: 'follow_up_work',
      waitingOn: 'handyhub',
    })
    // Unfinished work is never hidden behind the balance: the situation stays the work's, the action is the payment.
    expect(status({ projectState: 'approved', workInProgress: true, invoiceDue: true })).toMatchObject({
      situation: 'work_in_progress',
      nextAction: 'pay_invoice',
    })
  })

  it('[HH-PORT-02] a change order or a visit to review outranks the stage’s own step', () => {
    expect(status({ projectState: 'approved', workInProgress: true, changeToReview: true })).toMatchObject({
      situation: 'work_in_progress',
      waitingOn: 'customer',
      nextAction: 'review_change',
    })
    expect(status({ projectState: 'approved', visit: 'confirmed', visitToReview: true })).toMatchObject({
      situation: 'scheduled',
      nextAction: 'review_visit',
    })
  })

  it('[HH-PORT-07] "On the way" only from a recorded visit update, never from a schedule alone', () => {
    expect(customerSituation({ ...OPEN, projectState: 'approved', visit: 'confirmed' })).toBe('scheduled')
    expect(customerSituation({ ...OPEN, projectState: 'approved', visit: 'on_the_way' })).toBe('on_the_way')
  })
})

describe('the T23 sequence: one next action at each step from the shared records (TSK-0038, T23, OWN-DEC-105)', () => {
  it('[T23][HH-PORT-02][HH-PORT-03] estimate ready → deposit due → deposit recorded → confirmed → on the way → complete → invoice', () => {
    const steps: [string, Partial<PortalFacts>, Partial<CustomerStatus>][] = [
      [
        'estimate ready',
        { requestState: 'estimated', estimatePublished: true },
        { situation: 'estimate_ready', step: 'review_estimate', waitingOn: 'customer', nextAction: 'review_estimate' },
      ],
      [
        'approved with deposit due',
        { requestState: 'estimated', projectState: 'approved', estimateApproved: true, depositDue: true },
        { situation: 'approved', step: 'deposit_due', waitingOn: 'customer', nextAction: 'pay_deposit' },
      ],
      [
        'deposit recorded, windows offered',
        { requestState: 'estimated', projectState: 'approved', estimateApproved: true, workWindowsOffered: true },
        {
          situation: 'approved',
          step: 'choose_work_appointment',
          waitingOn: 'customer',
          nextAction: 'choose_work_appointment',
        },
      ],
      [
        'visit confirmed',
        { requestState: 'estimated', projectState: 'approved', estimateApproved: true, visit: 'confirmed' },
        { situation: 'scheduled', step: 'view_appointment', waitingOn: 'handyhub', nextAction: 'none' },
      ],
      [
        'on the way',
        { requestState: 'estimated', projectState: 'approved', estimateApproved: true, visit: 'on_the_way' },
        { situation: 'on_the_way', step: 'arrival_update', waitingOn: 'handyhub', nextAction: 'none' },
      ],
      [
        // TSK-0150 (OWN-DEC-199): once "Arrived" is recorded the step no longer says the visit is on the way.
        'arrived, work not started',
        { requestState: 'estimated', projectState: 'approved', estimateApproved: true, visit: 'arrived' },
        { situation: 'on_the_way', step: 'arrival_recorded', waitingOn: 'handyhub', nextAction: 'none' },
      ],
      [
        'work complete',
        { requestState: 'estimated', projectState: 'completed', estimateApproved: true, completion: 'complete' },
        { situation: 'work_complete', step: 'review_care_notes_and_invoice', waitingOn: 'nobody', nextAction: 'none' },
      ],
      [
        'invoice issued',
        {
          requestState: 'estimated',
          projectState: 'completed',
          estimateApproved: true,
          completion: 'complete',
          invoiceDue: true,
        },
        { situation: 'work_complete', waitingOn: 'customer', nextAction: 'pay_invoice' },
      ],
    ]
    for (const [name, facts, expected] of steps) expect(status(facts), name).toMatchObject(expected)
  })
})

describe('the customer dashboard sections (TSK-0124, HH-ID-14, OWN-DEC-160)', () => {
  it('[HH-ID-14] Active, Completed (Project History) and Cancelled/Archived from the project lifecycle', () => {
    const sections = Object.fromEntries(
      PROJECT_STATES.map((s) => [s, [dashboardSection(s, false), dashboardSection(s, true)]]),
    )
    expect(sections).toEqual({
      open: ['active', 'active'],
      approved: ['active', 'active'],
      // A cancellation under the Owner's review is not decided yet.
      cancellation_review: ['active', 'active'],
      completed: ['completed', 'completed'],
      // Closeout keeps a completed project in its history; a request that closed without a job is archived.
      // TSK-0150 (OWN-DEC-199, portal.projects.section.archivedEmpty): so "closed" alone is not archived.
      closed: ['archived', 'completed'],
      canceled: ['archived', 'archived'],
    })
    expect([...DASHBOARD_SECTIONS]).toEqual(['active', 'completed', 'archived'])
  })
})
