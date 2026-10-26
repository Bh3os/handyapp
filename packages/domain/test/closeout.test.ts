// A job's closeout, the Owner's reopen and the follow-ups after completion (TSK-0092; HH-QA-09, HH-QA-10, HH-STATE-02,
// T56, T64, T67, OWN-DEC-77, OWN-DEC-113, OWN-DEC-157). Pure: no database.
import { describe, expect, it } from 'vitest'
import {
  apply,
  CLOSEOUT_OBLIGATIONS,
  closeoutObligations,
  eventsFrom,
  followUpBlock,
  followUpDueAt,
  JOB_CLOSEOUT_MACHINE,
  type CloseoutFacts,
  type FollowUpFacts,
} from '../src/index.js'

const now = new Date('2026-10-25T15:00:00Z')
const ctx = (facts: CloseoutFacts, expectedVersion = 5) => ({ actor: 'staff' as const, expectedVersion, now, facts })
const CLEAR: CloseoutFacts = {
  reviewPassed: true,
  punchItemsNotRechecked: 0,
  workPackagesOpen: 0,
  visitsOpen: 0,
  changeOrdersPending: 0,
  holdsOpen: 0,
  finalInvoiceIssued: true,
  financialBasis: 'paid',
  otherInvoicesOpen: 0,
  pendingChecks: 0,
  paymentDisputeOpen: false,
  adjustmentsUnderReview: 0,
  unallocatedMoney: false,
  openCases: 0,
}
const codes = (r: ReturnType<typeof apply>) => (r.ok ? [] : r.problems.map((p) => p.code))

describe('[HH-QA-09][HH-STATE-02] closing a job', () => {
  it('[HH-QA-09] closes from operationally complete or reopened once nothing is open; only the Owner reopens closed', () => {
    expect(eventsFrom(JOB_CLOSEOUT_MACHINE, 'operationally_complete')).toEqual(['close'])
    expect(eventsFrom(JOB_CLOSEOUT_MACHINE, 'closed')).toEqual(['reopen'])
    expect(eventsFrom(JOB_CLOSEOUT_MACHINE, 'reopened')).toEqual(['close'])
    const closed = apply({ machine: 'job.closeout', state: 'operationally_complete', version: 5 }, 'close', ctx(CLEAR))
    expect(closed).toMatchObject({ ok: true, to: 'closed', version: 6 })
    expect(apply({ machine: 'job.closeout', state: 'reopened', version: 7 }, 'close', ctx(CLEAR, 7))).toMatchObject({
      ok: true,
      to: 'closed',
    })
    // The customer and the system never close or reopen a job.
    expect(
      apply({ machine: 'job.closeout', state: 'operationally_complete', version: 5 }, 'close', {
        ...ctx(CLEAR),
        actor: 'system',
      }),
    ).toMatchObject({ ok: false, code: 'ACTOR_NOT_ALLOWED' })
  })

  it('[HH-STATE-02][T56] a refusal names every open obligation, in order, and changes nothing', () => {
    const open: CloseoutFacts = {
      reviewPassed: false,
      punchItemsNotRechecked: 1,
      workPackagesOpen: 2,
      visitsOpen: 1,
      changeOrdersPending: 1,
      holdsOpen: 1,
      finalInvoiceIssued: true,
      financialBasis: null,
      otherInvoicesOpen: 1,
      pendingChecks: 1,
      paymentDisputeOpen: true,
      adjustmentsUnderReview: 1,
      unallocatedMoney: true,
      openCases: 1,
    }
    const r = apply({ machine: 'job.closeout', state: 'operationally_complete', version: 5 }, 'close', ctx(open))
    expect(r).toMatchObject({ ok: false, code: 'GUARD_FAILED' })
    expect(codes(r)).toEqual(CLOSEOUT_OBLIGATIONS.filter((c) => c !== 'FINAL_INVOICE_NOT_ISSUED'))
    expect(closeoutObligations(open).every((p) => p.message.length > 0)).toBe(true)
    // An unissued final invoice is named once (its balance is not a second obligation).
    expect(
      closeoutObligations({ ...CLEAR, finalInvoiceIssued: false, financialBasis: null }).map((p) => p.code),
    ).toEqual(['FINAL_INVOICE_NOT_ISSUED'])
  })

  it('[HH-DATA-05] the balance may be tracked instead of paid; "paid" alone never closes the job', () => {
    for (const basis of ['payment_plan', 'collection_hold', 'overdue_decided'] as const)
      expect(closeoutObligations({ ...CLEAR, financialBasis: basis })).toEqual([])
    // Paid, with the review not passed: still refused.
    expect(closeoutObligations({ ...CLEAR, reviewPassed: false }).map((p) => p.code)).toEqual([
      'QUALITY_REVIEW_NOT_PASSED',
    ])
  })

  it('[HH-STATE-02] an unknown fact is refused, never assumed clear', () => {
    const { openCases: _drop, ...rest } = CLEAR
    void _drop
    expect(closeoutObligations(rest).map((p) => p.code)).toEqual(['FACTS_MISSING'])
  })

  it('[HH-QA-09][T64] a reopen needs the written reason', () => {
    const noReason = apply({ machine: 'job.closeout', state: 'closed', version: 6 }, 'reopen', ctx({}, 6))
    expect(codes(noReason)).toEqual(['REASON_REQUIRED'])
    const reopened = apply(
      { machine: 'job.closeout', state: 'closed', version: 6 },
      'reopen',
      ctx({ reason: 'Synthetic: the wrong job was closed' }, 6),
    )
    expect(reopened).toMatchObject({
      ok: true,
      to: 'reopened',
      effects: ['follow_up.suppress', 'queue.job_closeout_open'],
    })
    // Reopening a job that is not closed is not a transition.
    expect(
      apply({ machine: 'job.closeout', state: 'operationally_complete', version: 5 }, 'reopen', ctx({ reason: 'x' })),
    ).toMatchObject({ ok: false, code: 'INVALID_TRANSITION' })
  })
})

describe('[HH-QA-10][T67] follow-ups after completion', () => {
  const base: FollowUpFacts = {
    jobState: 'operationally_complete',
    everReopened: false,
    activeCases: 0,
    optedOut: false,
    marketingConsent: true,
    hasEmail: true,
  }

  it('[HH-QA-10] the satisfaction check goes after reviewed completion, paused by an active case, stopped by an opt-out', () => {
    expect(followUpBlock('satisfaction', base)).toBeNull()
    expect(followUpBlock('satisfaction', { ...base, jobState: 'closed' })).toBeNull()
    expect(followUpBlock('satisfaction', { ...base, jobState: 'ready_for_qa' })).toBe('job_not_complete')
    expect(followUpBlock('satisfaction', { ...base, activeCases: 1 })).toBe('case_active')
    expect(followUpBlock('satisfaction', { ...base, optedOut: true })).toBe('follow_ups_opted_out')
    // Service communication, not marketing: no marketing permission needed.
    expect(followUpBlock('satisfaction', { ...base, marketingConsent: false })).toBeNull()
    // OWN-DEC-157 item 6: a reopened job gets none.
    expect(followUpBlock('satisfaction', { ...base, jobState: 'reopened' })).toBe('job_reopened')
    expect(followUpBlock('satisfaction', { ...base, jobState: 'closed', everReopened: true })).toBe('job_reopened')
  })

  it('[HH-QA-10][T67] review requests need marketing consent and pause during an active case', () => {
    expect(followUpBlock('review', base)).toBeNull()
    expect(followUpBlock('review', { ...base, marketingConsent: false })).toBe('no_marketing_consent')
    expect(followUpBlock('review', { ...base, activeCases: 2 })).toBe('case_active')
    expect(followUpBlock('review', { ...base, hasEmail: false })).toBe('no_email_address')
  })

  it('[HH-QA-10] the eligibility has no satisfaction score: the same facts give the same answer', () => {
    // A low answer cannot be passed in: the facts carry none (OWN-DEC-113, no positive-review filtering).
    const withScore = { ...base, satisfactionAnswer: 'negative', score: 1 } as FollowUpFacts
    expect(followUpBlock('review', withScore)).toBe(followUpBlock('review', base))
  })

  it('[HH-QA-10] the follow-up is due 48 hours after the review passed (2 days of 24 hours), DST or not', () => {
    // The night of the 2026-11-01 DST change in the business zone: elapsed hours, never local calendar days.
    const passed = new Date('2026-10-31T16:00:00Z')
    expect(followUpDueAt(passed, 2).toISOString()).toBe('2026-11-02T16:00:00.000Z')
    expect(followUpDueAt(passed, 0).getTime()).toBe(passed.getTime())
  })
})
