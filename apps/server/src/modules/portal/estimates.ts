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
// TSK-0057 (HH-EST-06, HH-EST-07, HH-EST-08, HH-ID-07, HH-API-04, T17, T32, T33, T34, OWN-DEC-103):
//   POST .../versions/:version/selection   the selected options, kept on the server, with the server's totals
//   POST .../versions/:version/approve     Approve Estimate: the approval transaction (estimates/approval.ts)
// - Selecting options is part of reading the estimate (request.view, PROPOSED mapping) and never approves anything.
//   Approving is the matrix's estimate.approve (Customer "V (fresh verification)"): a stale verification is
//   FRESH_VERIFICATION_REQUIRED with nothing written, and the selection stays on the server. Only a POST with the
//   ticked box, the typed name, the digest of the content viewed, the options and the total shown approves; no GET,
//   link preview, timeout or silence ever does (HH-EST-09, T17). Request Changes, Decline and Request an Updated
//   Estimate never accept an estimate.
import { dataScope, type CustomerActor } from '@handyhub/policy'
import { clientAddress } from '../../access-gate.js'
import { ApiError } from '../../api/errors.js'
import { readIdempotencyKey } from '../../api/idempotency.js'
import type { RouteDef } from '../../api/route.js'
import { projectIdOf } from '../access/projects.js'
import { approveVersion, FULL_NAME_MAX, saveSelection } from '../estimates/approval.js'
import { approvalNextStep } from '../estimates/receipt.js'
import { customerEstimateDetail } from '../estimates/customer.js'
import { recordCustomerResponse, RESPONSE_LIMITS, type ResponseKind } from '../estimates/responses.js'
import { readSessionToken, resolveCustomerSession } from '../identity/customer-sessions.js'
import {
  CUSTOMER_ESTIMATE,
  CUSTOMER_ESTIMATE_APPROVAL,
  CUSTOMER_ESTIMATE_RESPONSE,
  CUSTOMER_ESTIMATE_SELECTION,
} from '../records/index.js'
import { refreshSeconds } from './overview.js'
import type { ObjectStorage } from '../../providers/index.js'

export type PortalEstimateDeps = {
  storage?: ObjectStorage | null
  /** Outside production the estimate carries the TEST mark (OWN-DEC-126, HH-PORT-10); default true. */
  testMark?: boolean
  /** Proxies in front of the service (TRUST_PROXY_HOPS): the client address an approval keeps (HH-EST-06). */
  trustProxyHops?: number
}

const TEST = 'test/integration/portal-estimates.test.ts'
/** PROPOSED: 30 responses an hour per network (no owner value), like the other customer-facing writes. */
export const ESTIMATE_RESPONSE_RATE_LIMIT = {
  bucket: 'customer-estimate-response',
  limit: 30,
  windowSeconds: 3600,
} as const

/** PROPOSED (no owner value): per client network and hour, like the other customer-facing writes. */
export const ESTIMATE_SELECTION_RATE_LIMIT = {
  bucket: 'customer-estimate-selection',
  limit: 120,
  windowSeconds: 3600,
} as const
export const ESTIMATE_APPROVAL_RATE_LIMIT = {
  bucket: 'customer-estimate-approval',
  limit: 30,
  windowSeconds: 3600,
} as const
const APPROVAL_TEST = 'test/integration/estimate-approval.test.ts'
const OPTIONS_FIELD = {
  type: 'array',
  maxItems: 200,
  uniqueItems: true,
  items: { type: 'integer', minimum: 1, maximum: 32767 },
} as const
const SHA256_FIELD = { type: 'string', pattern: '^[0-9a-f]{64}$' } as const

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
      'banner) or in_effect. Whether it can be approved now (TSK-0057: the current version with terms in effect), with ' +
      'every reason it cannot and the current version to review or none; the digest of its content an approval names; ' +
      'the options the customer selected (kept on the server) with the server’s total and deposit for them; and, once ' +
      'approved, what was approved, the next step (TSK-0058: deposit_due or choose_work_appointment, null once the ' +
      'project has moved past approval) and the approval receipt PDF (preparing, or issued with a short-lived link ' +
      'while storage is configured). The responses the customer may give now and their own earlier responses, the server ' +
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

  const selection: RouteDef = {
    method: 'POST',
    path: `${PATH}/selection`,
    operationId: 'saveEstimateSelection',
    summary: 'Select options on the current estimate version',
    description:
      'The options the customer selects on the current version (by line position), kept on the server for this ' +
      'verified contact so a verification that went stale never loses them (HH-ID-07). Answers the server’s ' +
      'subtotal, discount row, total and deposit for that choice in integer cents: the version’s own line amounts with ' +
      'the discount share and deposit rule version it pinned (FACT-DEPOSIT-RULE), never the client’s arithmetic. A ' +
      'position that is not an option line is VALIDATION_FAILED; a version that is not current is CONFLICT naming ' +
      'its status. Never approves anything. Any other project, estimate or version is NOT_FOUND (T19); TSK-0118: so is ' +
      'a project an organization member reaches without the approve privilege.',
    actors: ['customer'],
    permission: 'request.view',
    kind: 'write',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: ESTIMATE_SELECTION_RATE_LIMIT,
    audit: 'estimate.select_options',
    pagination: false,
    test: APPROVAL_TEST,
    resource,
    projection: CUSTOMER_ESTIMATE_SELECTION,
    schema: {
      params: PARAMS,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['options'],
        properties: { options: OPTIONS_FIELD },
      },
      response: { 200: CUSTOMER_ESTIMATE_SELECTION.schema },
    },
    handler: async (ctx) => {
      if (!ctx.tx) throw new Error('saveEstimateSelection runs in its write transaction')
      const ref = refOf(ctx.req.params as Params)
      // TSK-0118 (HH-ID-13): selecting options prepares an approval, so an organization member needs the approve
      // privilege (the estimate.approve scope); the project's own customer reaches the same projects as before.
      const scope = dataScope(ctx.actor, 'estimate.approve', new Date())
      const out = await saveSelection(ctx.tx, ctx.actor as CustomerActor, scope, {
        ...ref,
        options: (ctx.req.body as { options: number[] }).options,
      })
      await ctx.audit({
        target: { type: 'estimate_version', id: out.versionId },
        summary: { version: ref.version, options: out.totals.options.length },
      })
      return { body: CUSTOMER_ESTIMATE_SELECTION.project({ ...ref, selection: out.totals }) }
    },
  }

  const approve: RouteDef = {
    method: 'POST',
    path: `${PATH}/approve`,
    operationId: 'approveEstimate',
    summary: 'Approve Estimate: approve this exact version',
    description:
      'The verified customer approves the exact published version they viewed (HH-EST-06, HH-EST-07, HH-EST-08). ' +
      'The body names the digest of the content viewed (approval.contentDigest of the estimate view), the selected ' +
      'options, the total and deposit shown in integer cents, the terms document and its content hash, the ticked ' +
      '"I have read and accept the estimate terms" box and the typed full name. Needs a fresh verification of the ' +
      'session (estimate.approve: Customer "V (fresh verification)"): an older one is FRESH_VERIFICATION_REQUIRED and ' +
      'nothing is written; the selected options stay on the server. In one transaction under the estimate lock the ' +
      'server checks the version is the current, unexpired published one (else CONFLICT naming its status, with the ' +
      'current version to review when there is one), the terms are the current version and in effect (else ' +
      'NOT_CONFIGURED: terms that are not approved for real customers are never accepted), the content digest, the ' +
      'options and the total and deposit equal its own computation (else refused with no record written), and the ' +
      'session’s access is still valid; then it records the approval, accepts the version, moves the project to ' +
      'approved and creates one job, its scope snapshot and one scheduling task, with the committed event ' +
      'estimate.approved. A retry with the same key returns the first answer; a second tab of the same customer with ' +
      'the same choice gets the same approval (200); anything else on an approved version is CONFLICT. Approval never ' +
      'confirms an appointment, reserves capacity or marks a deposit paid. The answer names the next step (TSK-0058, ' +
      'OWN-DEC-105): deposit_due while a required deposit is not satisfied, otherwise choose_work_appointment. The ' +
      'approval receipt PDF is issued afterwards from the committed event, once, and its automatic message is ' +
      'recorded per destination (wording NOT CONFIGURED: template_not_configured, never sent). Any other project, ' +
      'estimate or version is NOT_FOUND (T19).',
    actors: ['customer'],
    permission: 'estimate.approve',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'none',
    rateLimit: ESTIMATE_APPROVAL_RATE_LIMIT,
    audit: 'estimate.approve',
    pagination: false,
    test: APPROVAL_TEST,
    resource,
    projection: CUSTOMER_ESTIMATE_APPROVAL,
    schema: {
      params: PARAMS,
      body: {
        type: 'object',
        additionalProperties: false,
        required: [
          'contentDigest',
          'options',
          'totalCents',
          'depositCents',
          'termsDocumentId',
          'termsSha256',
          'acceptTerms',
          'fullName',
        ],
        properties: {
          contentDigest: SHA256_FIELD,
          options: OPTIONS_FIELD,
          totalCents: { type: 'integer', minimum: 1 },
          depositCents: { type: ['integer', 'null'], minimum: 1 },
          termsDocumentId: { type: 'string', minLength: 1, maxLength: 60 },
          termsSha256: SHA256_FIELD,
          acceptTerms: { type: 'boolean' },
          fullName: { type: 'string', minLength: 1, maxLength: FULL_NAME_MAX },
        },
      },
      response: { 200: CUSTOMER_ESTIMATE_APPROVAL.schema, 201: CUSTOMER_ESTIMATE_APPROVAL.schema },
    },
    handler: async (ctx) => {
      if (!ctx.tx) throw new Error('approveEstimate runs in its write transaction')
      const ref = refOf(ctx.req.params as Params)
      const session = await resolveCustomerSession(ctx.tx, readSessionToken(ctx.req))
      if (!session) throw new ApiError('UNAUTHENTICATED')
      const body = ctx.req.body as {
        contentDigest: string
        options: number[]
        totalCents: number
        depositCents: number | null
        termsDocumentId: string
        termsSha256: string
        acceptTerms: boolean
        fullName: string
      }
      const agent = ctx.req.headers['user-agent']
      const out = await approveVersion(ctx.tx, ctx.actor as CustomerActor, ctx.scope, {
        ...ref,
        ...body,
        session,
        idempotencyKey: readIdempotencyKey(ctx.req.headers['idempotency-key']),
        clientAddress: clientAddress(ctx.req.raw, deps.trustProxyHops ?? 0),
        userAgent: typeof agent === 'string' && agent.trim() ? agent.trim() : null,
        testMark: deps.testMark ?? true,
      })
      // The typed name and the security metadata stay in the approval record; the audit keeps what happened.
      await ctx.audit({
        target: { type: 'estimate_version', id: out.versionId },
        summary: {
          version: ref.version,
          created: out.created,
          approvalId: out.approvalId,
          jobId: out.jobId,
          schedulingTaskId: out.schedulingTaskId,
          options: out.options.length,
          totalCents: out.totalCents,
          depositRequired: out.deposit.state === 'required',
        },
      })
      // TSK-0058 (OWN-DEC-105): the next step from the same records the Overview reads; right after approving the
      // project is at the approval stage, so only the deposit decides it.
      const projectId = await projectIdOf(ctx.tx, ref.reference)
      const nextStep =
        (projectId ? await approvalNextStep(ctx.tx, projectId) : null) ??
        (out.deposit.state === 'required' ? 'deposit_due' : 'choose_work_appointment')
      return {
        status: out.created ? 201 : 200,
        body: CUSTOMER_ESTIMATE_APPROVAL.project({ ...ref, approved: out, nextStep }),
      }
    },
  }

  const text = (key: string) => (b: Record<string, unknown>) => (typeof b[key] === 'string' ? b[key] : undefined)
  return [
    read,
    selection,
    approve,
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
