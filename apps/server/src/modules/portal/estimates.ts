// The customer estimate routes of the portal (TSK-0056; HH-EST-06, HH-EST-09, HH-EST-13, HH-PORT-10, HH-PORT-01,
// HH-ID-07, T19, T24, T33, OWN-DEC-103, RULE-SERVER-AUTHZ).
//   GET  /customer/projects/:reference/estimates/:number/versions/:version                 one version as published
//   POST /customer/projects/:reference/estimates/:number/versions/:version/request-changes Request Changes
//   POST /customer/projects/:reference/estimates/:number/versions/:version/decline         Decline (optional reason)
//   POST /customer/projects/:reference/estimates/:number/versions/:version/request-update  Request an Updated Estimate
// - Reading is the project read of the Overview and the tabs (request.view, Customer "V (own)"; PROPOSED mapping: the
//   matrix has no separate estimate-view action). Requesting changes and declining are the matrix's own actions
//   (estimate.request_changes, estimate.decline: Customer "V (fresh verification)"), so a session whose verification
//   is older than the configured freshness window is refused with FRESH_VERIFICATION_REQUIRED and nothing is written.
// - Every project outside the session, another project's estimate, an unknown version and a version that never
//   reached the customer answer the same NOT_FOUND (T19). The answers are the explicit customer views of
//   records/projections.ts; the customer's words are kept in the response history, never in the audit summary.
// - There is no approval route here: approving is the approval transaction (TSK-0057). No route, retry or timeout of
//   this module can accept an estimate (HH-EST-09).
import type { CustomerActor } from '@handyhub/policy'
import { ApiError } from '../../api/errors.js'
import type { RouteDef } from '../../api/route.js'
import { projectIdOf } from '../access/projects.js'
import { customerEstimateDetail } from '../estimates/customer.js'
import { recordCustomerResponse, RESPONSE_LIMITS, type ResponseKind } from '../estimates/responses.js'
import { readSessionToken, resolveCustomerSession } from '../identity/customer-sessions.js'
import { CUSTOMER_ESTIMATE, CUSTOMER_ESTIMATE_RESPONSE } from '../records/index.js'
import { refreshSeconds } from './overview.js'
import type { ObjectStorage } from '../../providers/index.js'

export type PortalEstimateDeps = {
  storage?: ObjectStorage | null
  /** Outside production the estimate carries the TEST mark (OWN-DEC-126, HH-PORT-10); default true. */
  testMark?: boolean
}

const TEST = 'test/integration/portal-estimates.test.ts'
/** PROPOSED: 30 responses an hour per network (no owner value), like the other customer-facing writes. */
export const ESTIMATE_RESPONSE_RATE_LIMIT = {
  bucket: 'customer-estimate-response',
  limit: 30,
  windowSeconds: 3600,
} as const

const PATH = '/customer/projects/:reference/estimates/:number/versions/:version'
const PARAMS = {
  type: 'object',
  additionalProperties: false,
  required: ['reference', 'number', 'version'],
  properties: {
    reference: { type: 'string', minLength: 1, maxLength: 40 },
    number: { type: 'string', minLength: 1, maxLength: 40 },
    version: { type: 'string', pattern: '^[1-9][0-9]{0,3}$' },
  },
} as const
type Params = { reference: string; number: string; version: string }
const refOf = (p: Params) => ({ reference: p.reference, number: p.number, version: Number(p.version) })

const resource: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const id = await projectIdOf(db, (req.params as Params).reference)
  return id ? { projectId: id } : null
}

export function portalEstimateRoutes(deps: PortalEstimateDeps = {}): RouteDef[] {
  const read: RouteDef = {
    method: 'GET',
    path: PATH,
    operationId: 'getCustomerEstimate',
    summary: 'One estimate version as the customer received it',
    description:
      'An estimate version of a project the caller’s session opens, as published (HH-EST-06): the business name, ' +
      'the lines, options, exclusions and other texts, the subtotal, any discount row, the total and any deposit in ' +
      'integer cents as stored, the payment term, the valid-until time and the status (current, approved, declined, ' +
      'expired, superseded, withdrawn). For an uploaded estimate, a short-lived link to its customer PDF. The terms ' +
      'it pinned by document ID, with their state: not_configured (no wording this software holds for that ID, or a ' +
      'content hash that does not match), not_in_effect (a draft not approved for real customers: shown with the TEST ' +
      'banner) or in_effect. Approval is never available here (TSK-0057): every reason is listed, with the current ' +
      'version to review or none. The responses the customer may give now and their own earlier responses, the server ' +
      'time of the read and the refresh interval (portal.refresh). Any other ' +
      'project, estimate or version, a draft and a malformed reference are the same NOT_FOUND (T19).',
    actors: ['customer'],
    permission: 'request.view',
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'none',
    pagination: false,
    test: TEST,
    resource,
    projection: CUSTOMER_ESTIMATE,
    schema: { params: PARAMS, response: { 200: CUSTOMER_ESTIMATE.schema } },
    handler: async (ctx) => {
      const ref = refOf(ctx.req.params as Params)
      const v = await customerEstimateDetail(ctx.db, ctx.actor as CustomerActor, ctx.scope, ref, deps.storage ?? null)
      if (!v) throw new ApiError('NOT_FOUND')
      return {
        body: CUSTOMER_ESTIMATE.project({
          ...v,
          testMark: deps.testMark ?? true,
          refreshedAt: new Date(),
          refreshSeconds: await refreshSeconds(ctx.db),
        }),
      }
    },
  }

  const write = (o: {
    path: string
    operationId: string
    summary: string
    description: string
    permission: 'estimate.request_changes' | 'estimate.decline'
    audit: string
    kind: ResponseKind
    body: Record<string, unknown>
    required: string[]
    text: (body: Record<string, unknown>) => string | undefined
  }): RouteDef => ({
    method: 'POST',
    path: `${PATH}/${o.path}`,
    operationId: o.operationId,
    summary: o.summary,
    description:
      `${o.description} Needs a fresh verification of the session (HH-ID-07, the matrix rule of ${o.permission}): ` +
      'an older one is FRESH_VERIFICATION_REQUIRED and nothing is written. A version this response does not apply ' +
      'to answers CONFLICT naming its status now. In one transaction: the append-only response, the staff follow-up ' +
      'item (estimate_response) and the committed event of the staff notice, whose wording is NOT CONFIGURED yet. ' +
      'Never accepts the estimate. Any other project, estimate or version is NOT_FOUND (T19).',
    actors: ['customer'],
    permission: o.permission,
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'none',
    rateLimit: ESTIMATE_RESPONSE_RATE_LIMIT,
    audit: o.audit,
    pagination: false,
    test: TEST,
    resource,
    projection: CUSTOMER_ESTIMATE_RESPONSE,
    schema: {
      params: PARAMS,
      body: { type: 'object', additionalProperties: false, required: o.required, properties: o.body },
      response: { 201: CUSTOMER_ESTIMATE_RESPONSE.schema },
    },
    handler: async (ctx) => {
      if (!ctx.tx) throw new Error(`${o.operationId} runs in its write transaction`)
      const ref = refOf(ctx.req.params as Params)
      const session = await resolveCustomerSession(ctx.tx, readSessionToken(ctx.req))
      const out = await recordCustomerResponse(ctx.tx, ctx.actor as CustomerActor, ctx.scope, {
        ...ref,
        kind: o.kind,
        message: o.text((ctx.req.body ?? {}) as Record<string, unknown>),
        sessionId: session?.id ?? null,
      })
      // The customer's words stay in the response history; the audit keeps what happened.
      await ctx.audit({
        target: { type: 'estimate_version', id: out.versionId },
        summary: { kind: o.kind, version: ref.version, from: out.from, to: out.to, responseId: out.responseId },
      })
      return {
        status: 201,
        body: CUSTOMER_ESTIMATE_RESPONSE.project({
          reference: ref.reference,
          number: ref.number,
          version: ref.version,
          kind: o.kind,
          status: out.status,
          at: out.at,
        }),
      }
    },
  })

  const text = (key: string) => (b: Record<string, unknown>) => (typeof b[key] === 'string' ? b[key] : undefined)
  return [
    read,
    write({
      path: 'request-changes',
      operationId: 'requestEstimateChanges',
      summary: 'Request changes to the current estimate version',
      description:
        'Request Changes (HH-EST-09): the customer’s message is kept as a revision request on the project and ' +
        'the responsible staff member is notified. The version is not changed: it stays the current offer.',
      permission: 'estimate.request_changes',
      audit: 'estimate.request_changes',
      kind: 'changes_requested',
      body: { message: { type: 'string', minLength: 1, maxLength: RESPONSE_LIMITS.message } },
      required: ['message'],
      text: text('message'),
    }),
    write({
      path: 'decline',
      operationId: 'declineEstimate',
      summary: 'Decline the current estimate version',
      description:
        'Decline (HH-EST-09): the version moves from published to declined with the customer’s optional reason; ' +
        'every earlier record is kept and staff get a follow-up item.',
      permission: 'estimate.decline',
      audit: 'estimate.customer_decline',
      kind: 'declined',
      body: { reason: { type: 'string', maxLength: RESPONSE_LIMITS.reason } },
      required: [],
      text: text('reason'),
    }),
    write({
      path: 'request-update',
      operationId: 'requestUpdatedEstimate',
      summary: 'Request an updated estimate for an expired version',
      description:
        'Request an Updated Estimate (OWN-DEC-103, FACT-ESTIMATE-VALIDITY): on a version that expired with no ' +
        'current version of the estimate to review, a request for a new one with an optional message. The expired ' +
        'version stays expired; whether it is re-issued at the old price is decided by staff each time.',
      permission: 'estimate.request_changes',
      audit: 'estimate.request_update',
      kind: 'update_requested',
      body: { message: { type: 'string', maxLength: RESPONSE_LIMITS.message } },
      required: [],
      text: text('message'),
    }),
  ]
}
