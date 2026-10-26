// The customer change-order routes of the portal (TSK-0082; HH-CHG-02, HH-CHG-03, HH-PORT-05, HH-ID-07, T19, T53,
// OWN-DEC-169, RULE-SERVER-AUTHZ).
//   GET  /customer/projects/:reference/change-orders                                     the project's change orders
//   POST /customer/projects/:reference/change-orders/:number/versions/:version/approve   approve this exact version
//   POST /customer/projects/:reference/change-orders/:number/versions/:version/reject    decline it (optional reason)
// - Reading is the project read of the workspace (request.view, Customer "V (own)"; PROPOSED mapping like the
//   estimate view). Approving is the matrix's change_order.approve (Customer "V (fresh verification)"); rejecting takes
//   the same row (PROPOSED: the matrix names no separate decline action for change orders), so a stale verification is
//   FRESH_VERIFICATION_REQUIRED with nothing written.
// - Only a POST with the ticked box, the typed name, the digest of the content viewed and the total shown approves; no
//   GET, link preview, timeout or silence ever does. The decision itself is change-orders/approve.ts.
// - Another project, an unknown change order or version and a version that never reached the customer answer the
//   same NOT_FOUND (T19).
import { hasProjectAccess, type CustomerActor } from '@handyhub/policy'
import { clientAddress } from '../../access-gate.js'
import { ApiError } from '../../api/errors.js'
import { readIdempotencyKey } from '../../api/idempotency.js'
import type { RouteDef } from '../../api/route.js'
import { projectIdOf } from '../access/projects.js'
import {
  approveChangeOrder,
  customerChangeOrders,
  lockCustomerTarget,
  rejectChangeOrder,
  REJECTION_REASON_MAX,
  type DecisionResult,
} from '../change-orders/approve.js'
import { FULL_NAME_MAX } from '../estimates/approval.js'
import { readSessionToken, resolveCustomerSession } from '../identity/customer-sessions.js'
import { CUSTOMER_CHANGE_ORDER_DECISION, CUSTOMER_CHANGE_ORDERS } from '../records/index.js'
import { refreshSeconds } from './overview.js'

export type PortalChangeOrderDeps = {
  /** Outside production a decision carries the TEST mark (OWN-DEC-126); default true. */
  testMark?: boolean
  /** Proxies in front of the service (TRUST_PROXY_HOPS): the client address a decision keeps. */
  trustProxyHops?: number
}

const TEST = 'test/integration/change-orders.test.ts'
/** PROPOSED (no owner value): per client network and hour, like the estimate approval. */
export const CHANGE_ORDER_DECISION_RATE_LIMIT = {
  bucket: 'customer-change-order-decision',
  limit: 30,
  windowSeconds: 3600,
} as const
const SHA256_FIELD = { type: 'string', pattern: '^[0-9a-f]{64}$' } as const

const LIST_PATH = '/customer/projects/:reference/change-orders'
const PATH = `${LIST_PATH}/:number/versions/:version`
const LIST_PARAMS = {
  type: 'object',
  additionalProperties: false,
  required: ['reference'],
  properties: { reference: { type: 'string', minLength: 1, maxLength: 40 } },
} as const
const PARAMS = {
  type: 'object',
  additionalProperties: false,
  required: ['reference', 'number', 'version'],
  properties: {
    reference: { type: 'string', minLength: 1, maxLength: 40 },
    number: { type: 'string', pattern: '^[1-9][0-9]{0,3}$' },
    version: { type: 'string', pattern: '^[1-9][0-9]{0,3}$' },
  },
} as const
type Params = { reference: string; number: string; version: string }
const refOf = (p: Params) => ({ reference: p.reference, number: Number(p.number), version: Number(p.version) })

const resource: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const id = await projectIdOf(db, (req.params as { reference: string }).reference)
  return id ? { projectId: id } : null
}

const answer = (reference: string, out: DecisionResult) =>
  CUSTOMER_CHANGE_ORDER_DECISION.project({
    reference,
    changeOrder: out.reference,
    version: out.version,
    status: out.decision,
    at: out.at,
    revisedTotalCents: out.revisedTotalCents,
  })

export function portalChangeOrderRoutes(deps: PortalChangeOrderDeps = {}): RouteDef[] {
  const list: RouteDef = {
    method: 'GET',
    path: LIST_PATH,
    operationId: 'getCustomerChangeOrders',
    summary: 'The project’s change orders as the customer received them',
    description:
      'For a project the caller’s session opens (HH-PORT-05, OWN-DEC-169): the accepted estimate’s total, the current ' +
      'authorized total (the original plus every approved change order) and each change order that was sent to the ' +
      'customer (its latest sent version): reason, scope, schedule impact, the charge and credit lines and totals in ' +
      'integer cents, when it was sent and until when it is valid, its status (issued, approved, rejected, expired, ' +
      'withdrawn, superseded) and the decision. While one is open: whether it can be decided now (blockedBy ' +
      'APPROVED_SCOPE_CHANGED when another change was approved since it was priced), the digest of its content and ' +
      'the estimate terms an approval names (TSK-0118: never decidable, blockedBy NO_APPROVAL_PRIVILEGE, for an ' +
      'organization member without the approve privilege). Drafts and reviews never appear. Any other project and a malformed ' +
      'reference are NOT_FOUND (T19).',
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
    projection: CUSTOMER_CHANGE_ORDERS,
    schema: { params: LIST_PARAMS, response: { 200: CUSTOMER_CHANGE_ORDERS.schema } },
    handler: async (ctx) => {
      const { reference } = ctx.req.params as { reference: string }
      const out = await customerChangeOrders(ctx.db, ctx.scope, reference)
      if (!out) throw new ApiError('NOT_FOUND')
      // TSK-0118 (HH-ID-13): an organization member decides only with the approve privilege.
      const projectId = await projectIdOf(ctx.db, reference)
      const mayDecide =
        projectId !== null && hasProjectAccess(ctx.actor, { projectId }, new Date(), 'change_order.approve')
      const changeOrders = mayDecide
        ? out.changeOrders
        : out.changeOrders.map((c) => ({
            ...c,
            approval: c.approval
              ? { ...c.approval, canDecide: false, blockedBy: 'NO_APPROVAL_PRIVILEGE' as const }
              : null,
          }))
      return {
        body: CUSTOMER_CHANGE_ORDERS.project({
          ...out,
          changeOrders,
          refreshedAt: new Date(),
          refreshSeconds: await refreshSeconds(ctx.db),
        }),
      }
    },
  }

  const decide = {
    method: 'POST',
    actors: ['customer'],
    permission: 'change_order.approve',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'none',
    rateLimit: CHANGE_ORDER_DECISION_RATE_LIMIT,
    pagination: false,
    test: TEST,
    resource,
    projection: CUSTOMER_CHANGE_ORDER_DECISION,
  } as const

  const approve: RouteDef = {
    ...decide,
    path: `${PATH}/approve`,
    operationId: 'approveChangeOrder',
    summary: 'Approve this exact change-order version',
    description:
      'The verified customer approves the exact change-order version they viewed (HH-CHG-02, HH-CHG-03). The body ' +
      'names the digest of the content viewed (approval.contentDigest), the revised total shown in integer cents, the ' +
      'estimate terms the job was accepted under (document ID and content hash), the ticked box (unchecked by ' +
      'default) and the typed full name. Needs a fresh verification of the session (change_order.approve: Customer ' +
      '"V (fresh verification)"): an older one is FRESH_VERIFICATION_REQUIRED and nothing is written. In one ' +
      'transaction under the job lock the server checks the version is issued and not past its valid-until time ' +
      '(else CONFLICT VERSION_EXPIRED, _WITHDRAWN, _SUPERSEDED, _REJECTED), that it was priced against the current ' +
      'approved scope (else APPROVED_SCOPE_CHANGED), the digest and the terms (else CONTENT_MISMATCH, ' +
      'TERMS_NOT_SHOWN), the total (else TOTAL_MISMATCH, nothing written) and the session’s access; then it records ' +
      'the approval, moves the version to approved, adds the job’s next scope snapshot (the change added; the original ' +
      'estimate and earlier snapshots unchanged) and publishes one new packet version, a critical change the assigned ' +
      'workers acknowledge again. The steps the change named stop waiting. A retry with the same key returns the first ' +
      'answer; the same customer approving again for the same total gets the same approval (200); anything else on ' +
      'an approved version is CONFLICT. Any other project, change order or version is NOT_FOUND (T19).',
    audit: 'change_order.approve',
    schema: {
      params: PARAMS,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['contentDigest', 'totalCents', 'termsDocumentId', 'termsSha256', 'acceptTerms', 'fullName'],
        properties: {
          contentDigest: SHA256_FIELD,
          totalCents: { type: 'integer', minimum: 1 },
          termsDocumentId: { type: 'string', minLength: 1, maxLength: 60 },
          termsSha256: SHA256_FIELD,
          acceptTerms: { type: 'boolean' },
          fullName: { type: 'string', minLength: 1, maxLength: FULL_NAME_MAX },
        },
      },
      response: { 200: CUSTOMER_CHANGE_ORDER_DECISION.schema, 201: CUSTOMER_CHANGE_ORDER_DECISION.schema },
    },
    handler: async (ctx) => {
      if (!ctx.tx) throw new Error('approveChangeOrder runs in its write transaction')
      const ref = refOf(ctx.req.params as Params)
      const session = await resolveCustomerSession(ctx.tx, readSessionToken(ctx.req))
      if (!session) throw new ApiError('UNAUTHENTICATED')
      const body = ctx.req.body as {
        contentDigest: string
        totalCents: number
        termsDocumentId: string
        termsSha256: string
        acceptTerms: boolean
        fullName: string
      }
      const agent = ctx.req.headers['user-agent']
      const target = await lockCustomerTarget(ctx.tx, ctx.scope, ref)
      const out = await approveChangeOrder(
        ctx.tx,
        target,
        {
          ...body,
          idempotencyKey: readIdempotencyKey(ctx.req.headers['idempotency-key']),
          testMark: deps.testMark ?? true,
        },
        {
          method: 'portal',
          contactRef: (ctx.actor as CustomerActor).contactId,
          session,
          clientAddress: clientAddress(ctx.req.raw, deps.trustProxyHops ?? 0),
          userAgent: typeof agent === 'string' && agent.trim() ? agent.trim() : null,
        },
      )
      // The typed name and the security metadata stay in the decision record; the audit keeps what happened.
      await ctx.audit({
        target: { type: 'change_order_version', id: out.versionId },
        summary: {
          changeOrder: out.reference,
          version: out.version,
          created: out.created,
          decisionId: out.decisionId,
          method: 'portal',
          revisedTotalCents: out.revisedTotalCents,
          scopeVersion: out.scopeVersion,
          packetVersion: out.packetVersion,
        },
      })
      return { status: out.created ? 201 : 200, body: answer(ref.reference, out) }
    },
  }

  const reject: RouteDef = {
    ...decide,
    path: `${PATH}/reject`,
    operationId: 'rejectChangeOrder',
    summary: 'Decline this exact change-order version',
    description:
      'The verified customer declines the exact change-order version they viewed, with an optional reason (at most ' +
      `${REJECTION_REASON_MAX} characters). Needs a fresh verification of the session, like approving. The version ` +
      'must be issued and not past its valid-until time (else CONFLICT naming its status) and the digest must match ' +
      '(else CONTENT_MISMATCH). Records the decision and moves the version to rejected: the change is never ' +
      'authorized, the approved scope and totals stay as they are and the steps it named stop waiting; staff may ' +
      'revise it into a new version. A repeat by the same customer answers with the first decision (200). Any other ' +
      'project, change order or version is NOT_FOUND (T19).',
    audit: 'change_order.reject',
    schema: {
      params: PARAMS,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['contentDigest'],
        properties: {
          contentDigest: SHA256_FIELD,
          reason: { type: 'string', maxLength: REJECTION_REASON_MAX },
        },
      },
      response: { 200: CUSTOMER_CHANGE_ORDER_DECISION.schema, 201: CUSTOMER_CHANGE_ORDER_DECISION.schema },
    },
    handler: async (ctx) => {
      if (!ctx.tx) throw new Error('rejectChangeOrder runs in its write transaction')
      const ref = refOf(ctx.req.params as Params)
      const session = await resolveCustomerSession(ctx.tx, readSessionToken(ctx.req))
      if (!session) throw new ApiError('UNAUTHENTICATED')
      const body = ctx.req.body as { contentDigest: string; reason?: string }
      const agent = ctx.req.headers['user-agent']
      const target = await lockCustomerTarget(ctx.tx, ctx.scope, ref)
      const out = await rejectChangeOrder(
        ctx.tx,
        target,
        {
          contentDigest: body.contentDigest,
          reason: body.reason ?? null,
          idempotencyKey: readIdempotencyKey(ctx.req.headers['idempotency-key']),
          testMark: deps.testMark ?? true,
        },
        {
          method: 'portal',
          contactRef: (ctx.actor as CustomerActor).contactId,
          session,
          clientAddress: clientAddress(ctx.req.raw, deps.trustProxyHops ?? 0),
          userAgent: typeof agent === 'string' && agent.trim() ? agent.trim() : null,
        },
      )
      // The customer's reason stays in the decision record, never in the audit summary.
      await ctx.audit({
        target: { type: 'change_order_version', id: out.versionId },
        summary: { changeOrder: out.reference, version: out.version, created: out.created, decisionId: out.decisionId },
      })
      return { status: out.created ? 201 : 200, body: answer(ref.reference, out) }
    },
  }

  return [list, approve, reject]
}
