// Project lifecycle (ENT-Project; HH-STATE-02; OWN-DEC-97, OWN-DEC-100, OWN-DEC-101, HH-QA-09).
//
// PROPOSED model: the graph gives the project's invariants but no state list, so these states are derived from them
// and stay PROPOSED until the owner confirms them. They hold only what a project itself decides; the job's
// operational, visit, hold, quality and financial states are separate machines (HH-DATA-05), and the customer's
// progress label is a projection of all of them (HH-STATE-01), never this state alone.
//
//   open                 created automatically when a request is saved (OWN-DEC-97)
//   open -> approved     an estimate was accepted; at most one job per approved project
//   open -> closed       the request closed (Not a fit, outside scope, not served, withdrawn, Closed—no response)
//   closed -> open       a customer reply, or staff (TSK-0148), reopened a "Closed—no response" request
//   approved -> completed            the job is operationally complete (the Owner's quality review passed)
//   completed -> closed              closeout: job closed, no open balance, pending check or open case (HH-QA-09)
//   open / approved -> cancellation_review   accepted work, an appointment or money exists (OWN-DEC-100)
//   cancellation_review -> canceled          the Owner recorded the cancellation and financial review
//   cancellation_review -> open / approved   the Owner kept the project
//
// Closeout and cancellation cannot skip states: approved work never closes without completing, and never cancels
// without the Owner's review.
import { defineMachine, type Guard } from './engine.js'
import { isFalse, isTrue, noObligations, type ObligationFacts, reasonGiven } from './guards.js'
import { REQUEST_CLOSED_STATES, type RequestState } from './request.js'

export const PROJECT_STATES = ['open', 'approved', 'completed', 'closed', 'cancellation_review', 'canceled'] as const
export type ProjectState = (typeof PROJECT_STATES)[number]

export type ProjectFacts = ObligationFacts & {
  /** The current state of the project's request. */
  readonly requestState?: RequestState
  /** A job already exists for the project. */
  readonly hasJob?: boolean
  /** The project has an accepted estimate (used when the Owner keeps a project under review). */
  readonly hasAcceptedEstimate?: boolean
  /** The job's operational state is operationally_complete or closed. */
  readonly jobOperationallyComplete?: boolean
  /** The job's operational state is closed (HH-QA-09 conditions met). */
  readonly jobClosed?: boolean
  readonly openBalance?: boolean
  readonly pendingChecks?: boolean
  readonly openCases?: boolean
  /** The Owner recorded the cancellation and financial review outcome. */
  readonly financialReviewRecorded?: boolean
  readonly reason?: string
}

type G = Guard<ProjectFacts>

const requestClosed: G = (f) =>
  f.requestState !== undefined && (REQUEST_CLOSED_STATES as readonly string[]).includes(f.requestState)
    ? null
    : { code: 'REQUEST_NOT_CLOSED', message: "The project's request must be closed first." }
const noJobYet: G = (f) => isFalse(f.hasJob, 'JOB_EXISTS', 'A project has at most one job; this one already has it.')
const reopenedByReply: G = (f) =>
  f.requestState === 'reviewing'
    ? null
    : { code: 'REQUEST_NOT_REOPENED', message: "The project's request must be reopened first." }
const operationallyComplete: G = (f) =>
  isTrue(f.jobOperationallyComplete, 'JOB_NOT_COMPLETE', "The job must pass the Owner's quality review first.")
const jobClosed: G = (f) => isTrue(f.jobClosed, 'JOB_NOT_CLOSED', 'The job must be closed.')
const noOpenBalance: G = (f) => isFalse(f.openBalance, 'OPEN_BALANCE', 'The balance must be $0.00.')
const noPendingChecks: G = (f) => isFalse(f.pendingChecks, 'PENDING_CHECKS', 'Every check must have cleared.')
const noOpenCases: G = (f) => isFalse(f.openCases, 'OPEN_CASES', 'Every case must be resolved and closed.')
const hasObligations: G = (f) =>
  noObligations(f)?.code === 'OWNER_REVIEW_REQUIRED'
    ? null
    : { code: 'NO_OBLIGATIONS', message: 'Owner review is only for accepted work, an appointment or money received.' }
const reviewRecorded: G = (f) =>
  isTrue(f.financialReviewRecorded, 'FINANCIAL_REVIEW_REQUIRED', "The Owner's financial review must be recorded.")
const reason: G = (f) => reasonGiven(f.reason)
const accepted: G = (f) =>
  isTrue(f.hasAcceptedEstimate, 'NO_ACCEPTED_ESTIMATE', 'The project has no accepted estimate.')
const notAccepted: G = (f) =>
  isFalse(f.hasAcceptedEstimate, 'HAS_ACCEPTED_ESTIMATE', 'The project has an accepted estimate; keep it as approved.')

export const PROJECT_MACHINE = defineMachine({
  entity: 'project',
  dimension: 'lifecycle',
  proposed: true,
  states: PROJECT_STATES,
  initial: 'open',
  final: ['canceled'],
  transitions: [
    {
      event: 'approve',
      from: ['open'],
      to: 'approved',
      actors: ['system'],
      guards: [noJobYet],
      effects: ['job.create'],
    },
    {
      event: 'close',
      from: ['open'],
      to: 'closed',
      actors: ['staff', 'system'],
      guards: [requestClosed, (f) => noObligations(f)],
    },
    { event: 'reopen', from: ['closed'], to: 'open', actors: ['system', 'staff'], guards: [reopenedByReply] },
    { event: 'complete', from: ['approved'], to: 'completed', actors: ['system'], guards: [operationallyComplete] },
    {
      event: 'close_out',
      from: ['completed'],
      to: 'closed',
      actors: ['staff', 'system'],
      guards: [jobClosed, noOpenBalance, noPendingChecks, noOpenCases],
    },
    {
      event: 'route_to_owner_review',
      from: ['open', 'approved'],
      to: 'cancellation_review',
      actors: ['staff', 'system'],
      guards: [hasObligations, reason],
      effects: ['owner_review.queue'],
    },
    {
      event: 'cancel',
      from: ['cancellation_review'],
      to: 'canceled',
      actors: ['staff'],
      guards: [reviewRecorded, reason],
    },
    { event: 'keep_open', from: ['cancellation_review'], to: 'open', actors: ['staff'], guards: [notAccepted, reason] },
    {
      event: 'keep_approved',
      from: ['cancellation_review'],
      to: 'approved',
      actors: ['staff'],
      guards: [accepted, reason],
    },
  ],
})
