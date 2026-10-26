// Closeout module (TSK-0092; HH-QA-09, HH-QA-10, HH-STATE-02, T56, T64, T67, OWN-DEC-77, OWN-DEC-157, OWN-DEC-113,
// RULE-SERVER-AUTHZ). See store.ts (closing and reopening) and follow-ups.ts (the satisfaction check, review requests).
//   GET  /staff/jobs/:jobId/closeout                               the job's closeout, follow-ups and history
//   POST /staff/jobs/:jobId/closeout/actions/close                 the Owner closes the job (every obligation met)
//   POST /staff/jobs/:jobId/closeout/actions/reopen                the Owner reopens it (fresh sign-in and a reason)
//   POST /staff/jobs/:jobId/follow-ups/review-request              prepare a review request draft
//   POST /staff/jobs/:jobId/follow-ups/:deliveryId/release         release a prepared follow-up
//   POST /staff/jobs/:jobId/follow-ups/:deliveryId/cancel          decide not to send a prepared follow-up
//   POST /staff/jobs/:jobId/satisfaction-responses                 record the customer's answer to the follow-up
// Every write is decided by the policy (job.close: the Owner; job.reopen: the Owner with a fresh sign-in and a reason;
// message.release_draft for the follow-ups: the Owner, Office on the project's records), runs in one transaction with
// its idempotency key and records its audit event with identifiers and codes only (the reason is the audit reason).
import type { Tx } from '@handyhub/db'
import { CLOSEOUT_OBLIGATIONS, FINANCIAL_BASES, FOLLOW_UP_BLOCKS, SATISFACTION_ANSWERS } from '@handyhub/domain'
import type { StaffActor } from '@handyhub/policy'
import { ApiError } from '../../api/errors.js'
import type { ApiContext, ApiModule, RouteDef } from '../../api/route.js'
import { FRESH_AUTH_MINUTES } from '../identity/sessions.js'
import {
  cancelFollowUp,
  FOLLOW_UP_LIMITS,
  followUpPrepareAutomation,
  followUpsView,
  prepareReviewRequest,
  recordSatisfactionResponse,
  releaseFollowUp,
  syncFollowUps,
  type FollowUpsView,
  type ResponseInput,
} from './follow-ups.js'
import {
  allows,
  CLOSEOUT_LIMITS,
  closeJob,
  closeoutEvents,
  jobProjectFacts,
  jobRow,
  openObligations,
  reopenJob,
  type CloseoutEventView,
} from './store.js'

export {
  followUpFailureItem,
  followUpPrepareAutomation,
  followUpRecordCheck,
  followUpValues,
  prepareSatisfactionCheck,
  syncProjectFollowUps,
} from './follow-ups.js'
export { closeoutFacts, syncCloseoutItem } from './store.js'

/** The automations of the closeout module. */
export function closeoutAutomations() {
  return [followUpPrepareAutomation()]
}

const TEST = 'test/integration/closeout.test.ts'

const UUID = {
  type: 'string',
  pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
} as const
const STRING = { type: 'string' } as const
const NULLABLE_STRING = { type: ['string', 'null'] } as const
const DATE_TIME = { type: 'string', format: 'date-time' } as const
const NULLABLE_DATE_TIME = { type: ['string', 'null'], format: 'date-time' } as const
const object = (properties: Record<string, unknown>) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
})
const STAFF_REF = object({ id: STRING, name: NULLABLE_STRING })
const JOB_PARAMS = object({ jobId: UUID })
const DELIVERY_PARAMS = object({ jobId: UUID, deliveryId: UUID })
const BASIS = { type: ['string', 'null'], enum: [...FINANCIAL_BASES, null] } as const
const VIEW = object({
  jobId: STRING,
  projectId: STRING,
  projectReference: STRING,
  jobState: STRING,
  version: { type: 'integer' },
  obligations: { type: 'array', items: { type: 'string', enum: [...CLOSEOUT_OBLIGATIONS, 'FACTS_MISSING'] } },
  history: {
    type: 'array',
    items: object({
      id: STRING,
      event: { type: 'string', enum: ['closed', 'reopened'] },
      fromState: STRING,
      financialBasis: BASIS,
      reason: NULLABLE_STRING,
      recordedBy: STAFF_REF,
      recordedAt: DATE_TIME,
    }),
  },
  followUps: object({
    cadence: {
      type: 'object',
      additionalProperties: false,
      required: ['state'],
      properties: {
        state: { type: 'string', enum: ['CONFIGURED', 'NOT_CONFIGURED'] },
        daysAfterCompletion: { type: 'integer' },
      },
    },
    satisfactionDueAt: NULLABLE_DATE_TIME,
    items: {
      type: 'array',
      items: object({
        id: STRING,
        kind: { type: 'string', enum: ['satisfaction', 'review'] },
        state: { type: 'string', enum: ['draft', 'queued', 'sent', 'delivered', 'failed', 'suppressed', 'cancelled'] },
        reason: NULLABLE_STRING,
        scheduledAt: NULLABLE_DATE_TIME,
        sentAt: NULLABLE_DATE_TIME,
        cancelledAt: NULLABLE_DATE_TIME,
        createdAt: DATE_TIME,
      }),
    },
    satisfactionBlockedBy: { type: ['string', 'null'], enum: [...FOLLOW_UP_BLOCKS, null] },
    reviewBlockedBy: {
      type: ['string', 'null'],
      enum: [...FOLLOW_UP_BLOCKS, 'review_request_waiting', 'review_request_sent', null],
    },
    reviewWording: { type: 'string', enum: ['CONFIGURED', 'NOT_CONFIGURED'] },
    responses: {
      type: 'array',
      items: object({
        id: STRING,
        answer: { type: 'string', enum: [...SATISFACTION_ANSWERS] },
        note: NULLABLE_STRING,
        recordedBy: STAFF_REF,
        recordedAt: DATE_TIME,
      }),
    },
  }),
  actions: object({
    close: { type: 'boolean' },
    reopen: { type: 'boolean' },
    releaseFollowUps: { type: 'boolean' },
    prepareReviewRequest: { type: 'boolean' },
    recordResponse: { type: 'boolean' },
  }),
})
const REASON = { type: 'string', minLength: 1, maxLength: CLOSEOUT_LIMITS.reason + 100 } as const

export type CloseoutView = {
  jobId: string
  projectId: string
  projectReference: string
  jobState: string
  version: number
  obligations: string[]
  history: CloseoutEventView[]
  followUps: FollowUpsView
  actions: {
    close: boolean
    reopen: boolean
    releaseFollowUps: boolean
    prepareReviewRequest: boolean
    recordResponse: boolean
  }
}

const COMPLETE_STATES = ['operationally_complete', 'closed', 'reopened']

/** One job's closeout for the staff screen; null when there is no such job. */
export async function closeoutView(
  db: ApiContext['db'] | Tx,
  actor: StaffActor,
  jobId: string,
): Promise<CloseoutView | null> {
  const job = await jobRow(db, jobId)
  if (!job) return null
  const project = await db
    .selectFrom('crm.projects')
    .select('reference')
    .where('id', '=', job.project_id)
    .executeTakeFirstOrThrow()
  const followUps = await followUpsView(db, job)
  const obligations = (await openObligations(db, job)).map((p) => p.code)
  const complete = COMPLETE_STATES.includes(job.operational_state)
  const releases = allows(actor, 'message.release_draft', job.project_id)
  return {
    jobId: job.id,
    projectId: job.project_id,
    projectReference: project.reference,
    jobState: job.operational_state,
    version: job.version,
    obligations,
    history: await closeoutEvents(db, job.id),
    followUps,
    actions: {
      close:
        (job.operational_state === 'operationally_complete' || job.operational_state === 'reopened') &&
        allows(actor, 'job.close', job.project_id),
      // The fresh sign-in is asked for when the Owner reopens (FRESH_AUTH_REQUIRED), never assumed here.
      reopen: job.operational_state === 'closed' && actor.roles.includes('owner'),
      releaseFollowUps: releases && complete,
      prepareReviewRequest: releases && followUps.reviewBlockedBy === null,
      recordResponse: releases && complete,
    },
  }
}

const staffActor = (ctx: ApiContext) => {
  if (ctx.actor.kind !== 'staff') throw new ApiError('FORBIDDEN')
  return ctx.actor
}
const sessionOf = (ctx: ApiContext) => {
  const s = ctx.req.staffSession
  if (!s) throw new ApiError('UNAUTHENTICATED')
  return s.sessionId
}
const facts: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { jobId } = req.params as { jobId: string }
  return jobProjectFacts(db, jobId)
}
async function viewOrThrow(ctx: ApiContext, db: ApiContext['db'] | Tx) {
  const { jobId } = ctx.req.params as { jobId: string }
  const view = await closeoutView(db, staffActor(ctx), jobId)
  if (!view) throw new ApiError('NOT_FOUND')
  return view
}

const common = { actors: ['staff'], rateLimit: 'none', pagination: false, test: TEST, resource: facts } as const
const write = { ...common, method: 'POST', kind: 'write', idempotency: 'required', expectedVersion: 'none' } as const

export function closeoutModule(): ApiModule {
  const view: RouteDef = {
    ...common,
    method: 'GET',
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    audit: 'none',
    path: '/staff/jobs/:jobId/closeout',
    operationId: 'getJobCloseout',
    summary: "A job's closeout, its follow-ups and their history",
    description:
      'The Owner and Office (message.release_draft). The job’s operational state and version; while it is ' +
      'operationally complete or reopened, every obligation still open before it may close (' +
      CLOSEOUT_OBLIGATIONS.join(', ') +
      '); the Owner’s closes and reopens with the financial basis or the reason; the service-quality follow-up ' +
      '(prepared reminders.cadences.satisfaction days after the Owner’s review passed, released by staff) and review ' +
      'requests, each with its state and why it waits, stopped or failed, and why a new one may not go now (' +
      FOLLOW_UP_BLOCKS.join(', ') +
      '); the customer’s recorded answers; and what this caller may do. The answers never change whether a review ' +
      'request may be offered. NOT_FOUND when there is no such job.',
    permission: 'message.release_draft',
    schema: { params: JOB_PARAMS, response: { 200: VIEW } },
    handler: async (ctx) => ({ body: await viewOrThrow(ctx, ctx.db) }),
  }

  const close: RouteDef = {
    ...write,
    expectedVersion: 'required',
    path: '/staff/jobs/:jobId/closeout/actions/close',
    operationId: 'closeJob',
    summary: 'Close the job (Owner)',
    description:
      'The Owner (job.close), with If-Match the job’s version, on a job that is operationally complete or reopened. ' +
      'Refused with CONFLICT naming every obligation still open (' +
      CLOSEOUT_OBLIGATIONS.join(', ') +
      '); nothing changes then. Closing records the financial basis (the final invoice paid, or its balance tracked ' +
      'by a payment plan, a collection hold or the Owner’s overdue decision) and resolves the Owner Decisions item; ' +
      'it never changes an invoice, a payment or a reminder. JOB_NOT_COMPLETE before the Owner’s review passed. ' +
      'Audited. Returns the closeout view.',
    permission: 'job.close',
    audit: 'job.close',
    schema: {
      params: JOB_PARAMS,
      body: {
        type: 'object',
        additionalProperties: false,
        properties: { note: { type: ['string', 'null'], maxLength: CLOSEOUT_LIMITS.reason + 100 } },
      },
      response: { 200: VIEW },
    },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const { jobId } = ctx.req.params as { jobId: string }
      const body = (ctx.req.body ?? {}) as { note?: string | null }
      const out = await closeJob(tx, staffActor(ctx), jobId, ctx.expectedVersion(), body)
      await ctx.audit({
        target: { type: 'job', id: jobId, version: out.version },
        summary: { eventId: out.eventId, from: out.from, to: 'closed', financialBasis: out.financialBasis },
      })
      const view = await viewOrThrow(ctx, tx)
      return { body: view, version: view.version }
    },
  }

  const reopen: RouteDef = {
    ...write,
    expectedVersion: 'required',
    freshAuthMinutes: FRESH_AUTH_MINUTES,
    path: '/staff/jobs/:jobId/closeout/actions/reopen',
    operationId: 'reopenJob',
    summary: 'Reopen a closed job (Owner only, fresh sign-in and a reason)',
    description:
      'The Owner only (job.reopen): a fresh sign-in and a written reason; any other role, including another ' +
      'administrator, is refused (OWN-DEC-77). With If-Match the job’s version, on a closed job. The original records ' +
      '(the quality review, punch items, invoices and payments) are kept as they are; the reopen is its own record. ' +
      'The job’s service-quality follow-up is suppressed (OWN-DEC-157), and the job waits in Owner Decisions until ' +
      'it is closed again on the same conditions. Return work for a customer issue is a linked return visit, not a ' +
      'reopen. Audited with the reason. Returns the closeout view.',
    permission: 'job.reopen',
    audit: 'job.reopen',
    schema: {
      params: JOB_PARAMS,
      body: { type: 'object', additionalProperties: false, required: ['reason'], properties: { reason: REASON } },
      response: { 200: VIEW },
    },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const { jobId } = ctx.req.params as { jobId: string }
      const { reason } = ctx.req.body as { reason: string }
      const out = await reopenJob(tx, staffActor(ctx), jobId, ctx.expectedVersion(), {
        reason,
        sessionId: sessionOf(ctx),
      })
      // OWN-DEC-157 item 6: a reopened job's follow-up is not sent.
      await syncFollowUps(tx, jobId)
      await ctx.audit({
        target: { type: 'job', id: jobId, version: out.version },
        summary: { eventId: out.eventId, from: 'closed', to: 'reopened' },
        reason: reason.trim(),
        stepUpUsed: true,
      })
      const view = await viewOrThrow(ctx, tx)
      return { body: view, version: view.version }
    },
  }

  const prepare: RouteDef = {
    ...write,
    path: '/staff/jobs/:jobId/follow-ups/review-request',
    operationId: 'prepareReviewRequest',
    summary: 'Prepare a review request draft',
    description:
      'The Owner or Office (message.release_draft). Review requests are marketing and never automatic: a draft for ' +
      'staff to release, by email, only with the customer’s marketing permission (rechecked at send). The same ' +
      'eligibility applies whatever the customer answered to the follow-up: no positive-review filtering. CONFLICT ' +
      '(JOB_NOT_COMPLETE, JOB_REOPENED, NO_EMAIL_ADDRESS, FOLLOW_UPS_OPTED_OUT, NO_MARKETING_CONSENT, ' +
      'REVIEW_REQUEST_WAITING, REVIEW_REQUEST_SENT: one per job, PROPOSED). While a case is open on the project the ' +
      'draft is held and offered again once every case is closed. Audited. Returns the closeout view.',
    permission: 'message.release_draft',
    audit: 'follow_up.prepare_review_request',
    schema: { params: JOB_PARAMS, body: { type: 'object', additionalProperties: false }, response: { 201: VIEW } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const { jobId } = ctx.req.params as { jobId: string }
      const out = await prepareReviewRequest(tx, staffActor(ctx), jobId)
      await ctx.audit({ target: { type: 'job', id: jobId }, summary: { deliveryId: out.deliveryId } })
      return { status: 201, body: await viewOrThrow(ctx, tx) }
    },
  }

  const release: RouteDef = {
    ...write,
    path: '/staff/jobs/:jobId/follow-ups/:deliveryId/release',
    operationId: 'releaseJobFollowUp',
    summary: 'Release a prepared follow-up',
    description:
      'The Owner or Office (message.release_draft): the service-quality follow-up or a review request of this job, ' +
      'sent by the send job at its release time and rechecked then (a reopened job cancels it; an open case puts it ' +
      'back as a held draft; an opt-out, a missing channel permission or marketing permission suppresses it). ' +
      'CONFLICT (NOT_A_DRAFT, CASE_ACTIVE, JOB_REOPENED, JOB_NOT_COMPLETE, FOLLOW_UPS_OPTED_OUT, NO_MARKETING_CONSENT, ' +
      'NO_EMAIL_ADDRESS, TEMPLATE_NOT_CONFIGURED: the review request wording is NOT CONFIGURED). Audited. Returns the ' +
      'closeout view.',
    permission: 'message.release_draft',
    audit: 'follow_up.release',
    schema: { params: DELIVERY_PARAMS, body: { type: 'object', additionalProperties: false }, response: { 200: VIEW } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const { jobId, deliveryId } = ctx.req.params as { jobId: string; deliveryId: string }
      const out = await releaseFollowUp(tx, staffActor(ctx), jobId, deliveryId)
      await ctx.audit({
        target: { type: 'message_delivery', id: out.deliveryId },
        summary: { jobId, messageKey: out.messageKey, sendAt: out.runAt.toISOString() },
      })
      return { body: await viewOrThrow(ctx, tx) }
    },
  }

  const cancel: RouteDef = {
    ...write,
    path: '/staff/jobs/:jobId/follow-ups/:deliveryId/cancel',
    operationId: 'cancelJobFollowUp',
    summary: 'Decide not to send a prepared follow-up',
    description:
      'The Owner or Office (message.release_draft): a prepared follow-up draft of this job is kept as cancelled ' +
      '(dismissed), never sent. CONFLICT NOT_A_DRAFT. Audited. Returns the closeout view.',
    permission: 'message.release_draft',
    audit: 'follow_up.cancel',
    schema: { params: DELIVERY_PARAMS, body: { type: 'object', additionalProperties: false }, response: { 200: VIEW } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const { jobId, deliveryId } = ctx.req.params as { jobId: string; deliveryId: string }
      const out = await cancelFollowUp(tx, staffActor(ctx), jobId, deliveryId)
      await ctx.audit({
        target: { type: 'message_delivery', id: out.deliveryId },
        summary: { jobId, messageKey: out.messageKey },
      })
      return { body: await viewOrThrow(ctx, tx) }
    },
  }

  const respond: RouteDef = {
    ...write,
    path: '/staff/jobs/:jobId/satisfaction-responses',
    operationId: 'recordSatisfactionResponse',
    summary: "Record the customer's answer to the follow-up",
    description:
      'The Owner or Office (message.release_draft), on a completed, closed or reopened job: the customer’s answer as ' +
      'they gave it in their reply or a call (positive, mixed or negative, PROPOSED), with an optional note and the ' +
      'follow-up it answers. Append-only. It never changes whether a review request may be offered (OWN-DEC-113); a ' +
      'problem the customer reports is recorded as a complaint case. CONFLICT JOB_NOT_COMPLETE. Audited (the note is ' +
      'never in the audit summary). Returns the closeout view.',
    permission: 'message.release_draft',
    audit: 'follow_up.record_response',
    schema: {
      params: JOB_PARAMS,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['answer'],
        properties: {
          answer: { type: 'string', enum: [...SATISFACTION_ANSWERS] },
          note: { type: ['string', 'null'], maxLength: FOLLOW_UP_LIMITS.note + 100 },
          deliveryId: { anyOf: [{ type: 'null' }, UUID] },
        },
      },
      response: { 201: VIEW },
    },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const { jobId } = ctx.req.params as { jobId: string }
      const body = ctx.req.body as ResponseInput
      const out = await recordSatisfactionResponse(tx, staffActor(ctx), jobId, body)
      await ctx.audit({ target: { type: 'job', id: jobId }, summary: { responseId: out.id, answer: out.answer } })
      return { status: 201, body: await viewOrThrow(ctx, tx) }
    },
  }

  return { name: 'closeout', routes: [view, close, reopen, prepare, release, cancel, respond] }
}
