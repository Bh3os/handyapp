// The routes of a request's discount and its verification (TSK-0125; HH-EST-15, OWN-DEC-165, RULE-SERVER-AUTHZ). See
// discounts.ts.
//   GET  /staff/requests/:requestId/discount                 the requested discount, its state and recorded results
//   POST /staff/requests/:requestId/discount/verifications   a staff check (verified, not_verified) or owner review
//   POST /staff/requests/:requestId/discount/job-history     the server's returning-customer check
//   POST /staff/requests/:requestId/discount/owner-decision  the Owner's decision on a review, or an override
// Every write is decided by the policy (discount.verify: the Owner, Office and Estimator, PROPOSED for the last two;
// discount.decide: the Owner), runs in one transaction with its idempotency key and records its audit event with the
// category and result only.
import type { Tx } from '@handyhub/db'
import { DISCOUNT_CATEGORIES, DISCOUNT_RESULTS, DISCOUNT_STATES, type DiscountResult } from '@handyhub/domain'
import { ApiError } from '../../api/errors.js'
import type { ApiContext, RouteDef } from '../../api/route.js'
import {
  checkJobHistory,
  discountRequestFacts,
  discountView,
  OWNER_DISCOUNT_RESULTS,
  recordDiscountResult,
  STAFF_DISCOUNT_RESULTS,
  type RecordedDiscountResult,
} from './discounts.js'

const TEST = 'test/integration/discount-requests.test.ts'

const UUID = {
  type: 'string',
  pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
} as const
const STRING = { type: 'string' } as const
const BOOLEAN = { type: 'boolean' } as const
const DATE_TIME = { type: 'string', format: 'date-time' } as const
const object = (properties: Record<string, unknown>) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
})
const PARAMS = object({ requestId: UUID })
const VIEW = object({
  requestId: STRING,
  projectId: STRING,
  reference: STRING,
  eligibility: {
    oneOf: [
      { type: 'null' },
      object({
        percentBps: { type: 'integer' },
        seniorFromAge: { type: 'integer' },
        returningWithinMonths: { type: 'integer' },
      }),
    ],
  },
  discount: {
    oneOf: [
      { type: 'null' },
      object({
        category: { type: 'string', enum: [...DISCOUNT_CATEGORIES] },
        requestedAt: DATE_TIME,
        state: { type: 'string', enum: [...DISCOUNT_STATES] },
        verifications: {
          type: 'array',
          items: object({
            position: { type: 'integer' },
            category: { type: 'string', enum: [...DISCOUNT_CATEGORIES] },
            result: { type: 'string', enum: [...DISCOUNT_RESULTS] },
            verifiedBy: object({ id: STRING, name: { type: ['string', 'null'] } }),
            verifiedAt: DATE_TIME,
          }),
        },
        approved: BOOLEAN,
        revisionNeeded: BOOLEAN,
        actions: object({ verify: BOOLEAN, checkJobHistory: BOOLEAN, ownerReview: BOOLEAN, decide: BOOLEAN }),
      }),
    ],
  },
})

const staffActor = (ctx: ApiContext) => {
  if (ctx.actor.kind !== 'staff') throw new ApiError('FORBIDDEN')
  return ctx.actor
}
const facts: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { requestId } = req.params as { requestId: string }
  return discountRequestFacts(db, requestId)
}
async function viewOrThrow(ctx: ApiContext, db: ApiContext['db'] | Tx) {
  const { requestId } = ctx.req.params as { requestId: string }
  const view = await discountView(db, staffActor(ctx), requestId)
  if (!view) throw new ApiError('NOT_FOUND')
  return view
}
/** The audit event of a recorded result: the category and the result, nothing about how it was verified. */
async function audited(ctx: ApiContext, out: RecordedDiscountResult) {
  const { requestId } = ctx.req.params as { requestId: string }
  await ctx.audit({
    target: { type: 'request', id: requestId },
    summary: { verificationId: out.id, position: out.position, category: out.category, result: out.result },
  })
}

const common = { actors: ['staff'], rateLimit: 'none', pagination: false, test: TEST, resource: facts } as const
const write = { ...common, method: 'POST', kind: 'write', idempotency: 'required', expectedVersion: 'none' } as const
const resultBody = (results: readonly DiscountResult[]) => ({
  type: 'object',
  additionalProperties: false,
  required: ['result'],
  properties: { result: { type: 'string', enum: [...results] } },
})

export function discountRoutes(): RouteDef[] {
  return [
    {
      ...common,
      method: 'GET',
      kind: 'read',
      idempotency: 'none',
      expectedVersion: 'none',
      audit: 'none',
      path: '/staff/requests/:requestId/discount',
      operationId: 'getRequestDiscount',
      summary: "A request's discount and its verification",
      description:
        'The Owner, Office and Estimator (discount.verify). The one discount the customer requested on the request ' +
        'form (military, senior or returning customer; null when none), its state (pending verification, verified, ' +
        'not verified, owner review, declined), each recorded result with its verifier and time (category, result, ' +
        'verifier and time only, OWN-DEC-165), whether an estimate version of the project is approved (nothing more ' +
        'is recorded then), whether a published version needs revising because verification failed, and what this ' +
        'caller may record now.',
      permission: 'discount.verify',
      schema: { params: PARAMS, response: { 200: VIEW } },
      handler: async (ctx) => ({ body: await viewOrThrow(ctx, ctx.db) }),
    },
    {
      ...write,
      path: '/staff/requests/:requestId/discount/verifications',
      operationId: 'recordDiscountVerification',
      summary: 'Record a discount verification or send it to owner review',
      description:
        'The Owner, Office or Estimator (discount.verify). verified or not_verified after looking at the military, ' +
        'veteran or spouse documentation, or a photo ID or another reasonable age check for a senior; nothing about ' +
        'the document is sent or kept (no image, ID number, Social Security number or date of birth). A staff result ' +
        'is recorded once, while the discount is pending (PROPOSED). owner_review: the standard process cannot ' +
        'verify it (for example the customer has no proof available); the Owner decides in Owner Decisions. A ' +
        'returning-customer discount is checked from the job history only (the job-history route). CONFLICT ' +
        '(NO_DISCOUNT_REQUEST, ESTIMATE_APPROVED, JOB_HISTORY_ONLY, ALREADY_RECORDED, NOT_REVIEWABLE). Audited. ' +
        'Returns the view.',
      permission: 'discount.verify',
      audit: 'discount.verify',
      schema: { params: PARAMS, body: resultBody(STAFF_DISCOUNT_RESULTS), response: { 201: VIEW } },
      handler: async (ctx) => {
        const tx = ctx.tx as Tx
        const { requestId } = ctx.req.params as { requestId: string }
        const body = ctx.req.body as { result: DiscountResult }
        const out = await recordDiscountResult(tx, staffActor(ctx), requestId, body.result)
        await audited(ctx, out)
        return { status: 201, body: await viewOrThrow(ctx, tx) }
      },
    },
    {
      ...write,
      path: '/staff/requests/:requestId/discount/job-history',
      operationId: 'checkDiscountJobHistory',
      summary: 'Check the job history for a returning-customer discount',
      description:
        'The Owner, Office or Estimator (discount.verify). The server looks for a completed job (operationally ' +
        'complete or closed, its quality review passed) of another project of the same customer as staff see it now ' +
        '(merged records and linked requests; never an automatic match), completed within the configured months ' +
        '(discount.eligibility_verification, 12) before today in the business time zone, and records verified or ' +
        'not_verified; the caller is the verifier. Checked again while no match was found. CONFLICT ' +
        '(NO_DISCOUNT_REQUEST, ESTIMATE_APPROVED, STAFF_CHECK_ONLY, ALREADY_RECORDED); NOT_CONFIGURED without the ' +
        'window or the time zone. Audited. Returns the view.',
      permission: 'discount.verify',
      audit: 'discount.check_job_history',
      schema: { params: PARAMS, body: { type: 'object', additionalProperties: false }, response: { 201: VIEW } },
      handler: async (ctx) => {
        const tx = ctx.tx as Tx
        const { requestId } = ctx.req.params as { requestId: string }
        const out = await checkJobHistory(tx, staffActor(ctx), requestId)
        await audited(ctx, out)
        return { status: 201, body: await viewOrThrow(ctx, tx) }
      },
    },
    {
      ...write,
      path: '/staff/requests/:requestId/discount/owner-decision',
      operationId: 'decideDiscountReview',
      summary: 'The Owner’s decision on a discount',
      description:
        'The Owner (discount.decide): owner_approved or owner_declined, on an owner review or as an override of a ' +
        'recorded result (audited as the Owner’s). Resolves the Owner Decisions item. CONFLICT (NO_DISCOUNT_REQUEST, ' +
        'ESTIMATE_APPROVED, NO_CHANGE). Audited. Returns the view.',
      permission: 'discount.decide',
      audit: 'discount.owner_decision',
      schema: { params: PARAMS, body: resultBody(OWNER_DISCOUNT_RESULTS), response: { 201: VIEW } },
      handler: async (ctx) => {
        const tx = ctx.tx as Tx
        const { requestId } = ctx.req.params as { requestId: string }
        const body = ctx.req.body as { result: DiscountResult }
        const out = await recordDiscountResult(tx, staffActor(ctx), requestId, body.result)
        await audited(ctx, out)
        return { status: 201, body: await viewOrThrow(ctx, tx) }
      },
    },
  ]
}
