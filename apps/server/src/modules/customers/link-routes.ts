// Staff routes of human-reviewed merges and relinks with the Owner's reversal (TSK-0046; HH-CRM-04, HH-ID-02,
// HH-SEC-06, T21, T29, ROLE-MATRIX rows "Merge or relink customers, correct a request link" and "Reverse a
// record-link change", OWN-DEC-117, RULE-SERVER-AUTHZ). links.ts holds the rules; every route here is decided by the
// policy on the server, inside the caller's scope (an altered ID finds nothing), and every change commits with its
// audit event, its reason and its access recheck.
// - Previews (reads): both records with their contacts, properties and the affected projects and requests, documents
//   and payments (not available in this release, said so) and the live access of the projects, with the digest the
//   confirmation must send back. Shown to staff who may make the change.
// - Merge (customer.merge) and relink (request.correct_link: linking a request to an existing customer and correcting
//   a request linked to the wrong one are one action, ROLE-MATRIX puts them in one row): a reason and the confirmed
//   preview are required from everyone (Office: "reason, preview").
// - Reverse (customer.reverse_link_change): the Owner only, with a reason.
import type { Tx } from '@handyhub/db'
import { decide, type Action, type Actor, type StaffActor } from '@handyhub/policy'
import { ApiError } from '../../api/errors.js'
import type { ApiContext, RouteDef } from '../../api/route.js'
import { customerInScope } from '../../platform/data-scope.js'
import { findRequest } from '../records/repository.js'
import {
  LinkConflict,
  mergeCustomers,
  mergePreview,
  recheckSummary,
  relinkPreview,
  relinkRequest,
  reverseLink,
} from './links.js'
import { syncCandidateItem } from './matching.js'
import { REASON, UUID } from './schemas.js'

const TEST = 'test/integration/record-links.test.ts'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const S = { type: 'string' } as const
const NS = { type: ['string', 'null'] } as const
const B = { type: 'boolean' } as const
const I = { type: 'integer' } as const
const obj = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({
  type: 'object',
  additionalProperties: false,
  required,
  properties,
})
const arr = (items: unknown) => ({ type: 'array', items })
const NOT_AVAILABLE = obj({ state: { type: 'string', enum: ['not_available'] } })
const BLOCKED = {
  type: ['string', 'null'],
  enum: ['CUSTOMER_MERGED', 'SAME_CUSTOMER', null],
}

export const SUMMARY = obj({
  id: S,
  displayName: S,
  status: S,
  version: I,
  createdAt: S,
  contacts: arr(
    obj({
      id: S,
      customerId: S,
      fullName: S,
      email: S,
      phone: S,
      verification: obj({ email: S, phone: S }),
    }),
  ),
  properties: arr(obj({ id: S, customerId: S, street: S, unit: NS, city: S, state: S, zip: S })),
  projects: arr(
    obj({
      id: S,
      reference: S,
      state: S,
      customerId: S,
      requests: arr(obj({ id: S, reference: S, state: S, submittedAt: S })),
    }),
  ),
  access: obj({ liveGrants: I, liveSessions: I }),
})

const MERGE_PREVIEW = obj({
  source: SUMMARY,
  survivor: SUMMARY,
  suggestion: {
    type: ['object', 'null'],
    additionalProperties: false,
    required: ['id', 'status', 'reasons'],
    properties: { id: S, status: S, reasons: arr(S) },
  },
  documents: NOT_AVAILABLE,
  payments: NOT_AVAILABLE,
  blocked: BLOCKED,
  previewDigest: S,
})

const RELINK_PREVIEW = obj({
  request: obj({ id: S, reference: S, state: S }),
  project: obj({ id: S, reference: S, state: S }),
  original: obj({ id: S, displayName: S }),
  from: SUMMARY,
  to: SUMMARY,
  correction: B,
  revokes: obj({ grants: I, sessions: I }),
  documents: NOT_AVAILABLE,
  payments: NOT_AVAILABLE,
  blocked: BLOCKED,
  previewDigest: S,
})

const RECHECK = obj({
  projects: I,
  moved: arr(S),
  grantsChecked: I,
  grantsKept: I,
  grantsRevoked: arr(S),
  sessionsChecked: I,
  sessionsRevoked: arr(S),
  projectsAdded: I,
})
const LINK_RESULT = obj({ linkId: S, access: RECHECK })
const DIGEST = { type: 'string', pattern: '^[0-9a-f]{64}$' } as const

function staffActor(ctx: ApiContext): StaffActor {
  if (ctx.actor.kind !== 'staff') throw new ApiError('FORBIDDEN')
  return ctx.actor
}
const reasonOf = (ctx: ApiContext) => ((ctx.req.body as { reason?: string }).reason ?? '').trim()
const conflict = (code: string) => new ApiError('CONFLICT', { fieldErrors: [{ field: 'state', code, message: '' }] })
const invalid = (field: string, code = 'invalid') =>
  new ApiError('VALIDATION_FAILED', { fieldErrors: [{ field, code, message: '' }] })

/** Whether the caller may make the change a preview is for (decided as if its required reason were given). */
const mayChange = (actor: Actor, action: Action) =>
  decide(actor, action, {}, { now: new Date(), online: true, reason: 'given' }).effect === 'allow'

/** A link-change refusal from links.ts as the API's conflict; anything else is rethrown. */
async function refusals<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (e) {
    if (e instanceof LinkConflict) throw conflict(e.code)
    throw e
  }
}

const customerExists: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { customerId } = req.params as { customerId: string }
  if (!UUID_RE.test(customerId)) return null
  const row = await db.selectFrom('crm.customers').select('id').where('id', '=', customerId).executeTakeFirst()
  return row ? {} : null
}
const requestProject: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { requestId } = req.params as { requestId: string }
  if (!UUID_RE.test(requestId)) return null
  const r = await db.selectFrom('intake.requests').select('project_id').where('id', '=', requestId).executeTakeFirst()
  return r ? { projectId: r.project_id } : null
}
const linkExists: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { linkId } = req.params as { linkId: string }
  if (!UUID_RE.test(linkId)) return null
  const row = await db.selectFrom('crm.record_links').select('id').where('id', '=', linkId).executeTakeFirst()
  return row ? {} : null
}

/** The customer, when it exists inside the caller's scope (an altered ID finds nothing). */
async function scopedCustomer(ctx: ApiContext, customerId: string, lock = false): Promise<string> {
  if (!UUID_RE.test(customerId)) throw new ApiError('NOT_FOUND')
  const q = (ctx.tx ?? ctx.db)
    .selectFrom('crm.customers as cu')
    .select('cu.id')
    .where('cu.id', '=', customerId)
    .where(customerInScope('cu.id', ctx.scope))
  const row = await (lock ? q.forUpdate() : q).executeTakeFirst()
  if (!row) throw new ApiError('NOT_FOUND')
  return row.id
}

const mergePreviewRoute: RouteDef = {
  method: 'GET',
  path: '/staff/customers/:customerId/merge-preview',
  operationId: 'previewCustomerMerge',
  summary: 'Preview merging a duplicate customer into another',
  description:
    'Staff who may merge (customer.merge: Owner; Office with a reason and this preview). Both records side by ' +
    'side: contacts with their separate email and phone verification, properties, the affected projects and ' +
    'requests, the live guest links and sessions of their projects (never widened by a merge), documents and ' +
    'payments (not available in this release) and the duplicate suggestion between them, if any. `into` is the ' +
    'survivor. `blocked` says why it cannot be confirmed now. The confirmation sends back `previewDigest`.',
  actors: ['staff'],
  permission: 'customer.view',
  kind: 'read',
  idempotency: 'none',
  expectedVersion: 'none',
  rateLimit: 'none',
  audit: 'none',
  pagination: false,
  test: TEST,
  resource: customerExists,
  schema: {
    params: obj({ customerId: UUID }),
    querystring: obj({ into: UUID }),
    response: { 200: MERGE_PREVIEW },
  },
  handler: async (ctx) => {
    if (!mayChange(ctx.actor, 'customer.merge')) throw new ApiError('FORBIDDEN')
    const sourceId = await scopedCustomer(ctx, (ctx.req.params as { customerId: string }).customerId)
    const survivorId = await scopedCustomer(ctx, (ctx.req.query as { into: string }).into)
    return { body: await mergePreview(ctx.db, sourceId, survivorId) }
  },
}

const merge: RouteDef = {
  method: 'POST',
  path: '/staff/customers/:customerId/merge',
  operationId: 'mergeCustomer',
  summary: 'Merge a duplicate customer into a survivor',
  description:
    'Staff with customer.merge (Owner; Office with a reason and the preview). Links this customer to the survivor ' +
    'as merged: nothing is deleted or moved; every contact, property, project, request, note and record hanging off ' +
    'them keeps its ID and its customer, and the survivor shows them. Requires the written reason and the digest ' +
    'of the preview the person confirmed (PREVIEW_STALE when the records changed since). Customer access is ' +
    'rechecked and never widened (no grant or session gains a project). A suggestion between the two is kept, ' +
    'marked merged. Only the Owner can reverse it. Never automatic.',
  actors: ['staff'],
  permission: 'customer.merge',
  kind: 'write',
  idempotency: 'required',
  expectedVersion: 'none',
  rateLimit: 'none',
  audit: 'customer.merge',
  pagination: false,
  test: TEST,
  resource: customerExists,
  schema: {
    params: obj({ customerId: UUID }),
    body: obj({ survivorId: UUID, reason: REASON, previewDigest: DIGEST }),
    response: { 200: LINK_RESULT },
  },
  handler: async (ctx) => {
    const tx = ctx.tx as Tx
    const actor = staffActor(ctx)
    const b = ctx.req.body as { survivorId: string; previewDigest: string }
    const sourceId = await scopedCustomer(ctx, (ctx.req.params as { customerId: string }).customerId)
    const survivorId = await scopedCustomer(ctx, b.survivorId)
    if (sourceId === survivorId) throw invalid('body.survivorId', 'same_customer')
    const result = await refusals(() =>
      mergeCustomers(tx, {
        sourceId,
        survivorId,
        reason: reasonOf(ctx),
        previewDigest: b.previewDigest,
        staffId: actor.userId,
      }),
    )
    if (result.candidateId) {
      const m = await tx
        .selectFrom('crm.candidate_matches')
        .select('customer_id')
        .where('id', '=', result.candidateId)
        .executeTakeFirstOrThrow()
      await syncCandidateItem(tx, m.customer_id)
    }
    await ctx.audit({
      target: { type: 'record_link', id: result.linkId },
      summary: {
        kind: 'merge',
        sourceCustomerId: sourceId,
        survivorId,
        candidateMatchId: result.candidateId,
        previewDigest: b.previewDigest,
        access: recheckSummary(result.recheck),
      },
      reason: reasonOf(ctx),
    })
    return { body: { linkId: result.linkId, access: recheckSummary(result.recheck) } }
  },
}

const relinkPreviewRoute: RouteDef = {
  method: 'GET',
  path: '/staff/requests/:requestId/relink-preview',
  operationId: 'previewRequestRelink',
  summary: 'Preview linking a request to another customer',
  description:
    'Staff who may correct a request link (request.correct_link: Owner; Office with a reason and this preview). The ' +
    'request and its project, the customer it is linked to now and the one it would be linked to (`to`), each ' +
    'with contacts, properties and projects, documents and payments (not available in this release), and whether ' +
    'this corrects an earlier relink (a correction revokes the guest links and sessions of the project issued since ' +
    'that relink). Linking never gives the requester access to the other customer’s projects. `blocked` says why it ' +
    'cannot be confirmed now. The confirmation sends back `previewDigest`.',
  actors: ['staff'],
  permission: 'request.view',
  kind: 'read',
  idempotency: 'none',
  expectedVersion: 'none',
  rateLimit: 'none',
  audit: 'none',
  pagination: false,
  test: TEST,
  resource: requestProject,
  schema: {
    params: obj({ requestId: UUID }),
    querystring: obj({ to: UUID }),
    response: { 200: RELINK_PREVIEW },
  },
  handler: async (ctx) => {
    if (!mayChange(ctx.actor, 'request.correct_link')) throw new ApiError('FORBIDDEN')
    const request = await findRequest(ctx.db, ctx.scope, (ctx.req.params as { requestId: string }).requestId)
    if (!request) throw new ApiError('NOT_FOUND')
    const to = await scopedCustomer(ctx, (ctx.req.query as { to: string }).to)
    return { body: await relinkPreview(ctx.db, request.id, to) }
  },
}

const relink: RouteDef = {
  method: 'POST',
  path: '/staff/requests/:requestId/relink',
  operationId: 'relinkRequest',
  summary: 'Link a request to another customer',
  description:
    'Staff with request.correct_link (Owner; Office with a reason and the preview): links the request, with its ' +
    'project, to an existing customer, or corrects a request linked to the wrong customer. A link, never a move: ' +
    'the request keeps its original submission and customer, and nothing is deleted. Requires the written reason ' +
    'and the confirmed preview digest (PREVIEW_STALE when anything changed since). Access is rechecked: the ' +
    'requester never gains the other customer’s projects, no grant or session gains a project, and a correction ' +
    'revokes the project’s guest links and sessions issued while the mistaken link stood. Only the Owner reverses it.',
  actors: ['staff'],
  permission: 'request.correct_link',
  kind: 'write',
  idempotency: 'required',
  expectedVersion: 'none',
  rateLimit: 'none',
  audit: 'request.correct_link',
  pagination: false,
  test: TEST,
  resource: requestProject,
  schema: {
    params: obj({ requestId: UUID }),
    body: obj({ customerId: UUID, reason: REASON, previewDigest: DIGEST }),
    response: { 200: LINK_RESULT },
  },
  handler: async (ctx) => {
    const tx = ctx.tx as Tx
    const actor = staffActor(ctx)
    const b = ctx.req.body as { customerId: string; previewDigest: string }
    const request = await findRequest(tx, ctx.scope, (ctx.req.params as { requestId: string }).requestId)
    if (!request) throw new ApiError('NOT_FOUND')
    const target = await scopedCustomer(ctx, b.customerId)
    const result = await refusals(() =>
      relinkRequest(tx, {
        requestId: request.id,
        targetId: target,
        reason: reasonOf(ctx),
        previewDigest: b.previewDigest,
        staffId: actor.userId,
      }),
    )
    await ctx.audit({
      target: { type: 'record_link', id: result.linkId },
      summary: {
        kind: 'request_relink',
        requestId: request.id,
        projectId: result.projectId,
        fromCustomerId: result.fromId,
        toCustomerId: target,
        correction: result.correction,
        previewDigest: b.previewDigest,
        access: recheckSummary(result.recheck),
      },
      reason: reasonOf(ctx),
    })
    return { body: { linkId: result.linkId, access: recheckSummary(result.recheck) } }
  },
}

const reverse: RouteDef = {
  method: 'POST',
  path: '/staff/customer-links/:linkId/reverse',
  operationId: 'reverseRecordLink',
  summary: 'Reverse a merge or relink',
  description:
    'The Owner only (customer.reverse_link_change), with a written reason. A merged record becomes its own record ' +
    'again with its earlier status; a relinked request goes back to the customer it was linked to before (only a ' +
    'request’s current relink: LINK_NOT_CURRENT otherwise). Everything recorded since stays where it was made. ' +
    'Access is rechecked and what was issued while the link stood is revoked. Reversing twice: LINK_REVERSED.',
  actors: ['staff'],
  permission: 'customer.reverse_link_change',
  kind: 'write',
  idempotency: 'required',
  expectedVersion: 'none',
  rateLimit: 'none',
  audit: 'customer.reverse_link_change',
  pagination: false,
  test: TEST,
  resource: linkExists,
  schema: {
    params: obj({ linkId: UUID }),
    body: obj({ reason: REASON }),
    response: { 200: LINK_RESULT },
  },
  handler: async (ctx) => {
    const tx = ctx.tx as Tx
    const actor = staffActor(ctx)
    const { linkId } = ctx.req.params as { linkId: string }
    const link = await tx
      .selectFrom('crm.record_links')
      .select(['source_customer_id', 'target_customer_id'])
      .where('id', '=', linkId)
      .executeTakeFirst()
    if (!link) throw new ApiError('NOT_FOUND')
    // Both records of the link lie inside the caller's scope.
    await scopedCustomer(ctx, link.source_customer_id)
    await scopedCustomer(ctx, link.target_customer_id)
    const result = await refusals(() => reverseLink(tx, { linkId, reason: reasonOf(ctx), staffId: actor.userId }))
    if (result.candidateId) {
      const m = await tx
        .selectFrom('crm.candidate_matches')
        .select('customer_id')
        .where('id', '=', result.candidateId)
        .executeTakeFirstOrThrow()
      await syncCandidateItem(tx, m.customer_id)
    }
    await ctx.audit({
      target: { type: 'record_link', id: result.linkId },
      summary: {
        kind: result.kind,
        sourceCustomerId: result.sourceCustomerId,
        targetCustomerId: result.targetCustomerId,
        requestId: result.requestId,
        access: recheckSummary(result.recheck),
      },
      reason: reasonOf(ctx),
    })
    return { body: { linkId: result.linkId, access: recheckSummary(result.recheck) } }
  },
}

export const LINK_ROUTES: readonly RouteDef[] = [mergePreviewRoute, merge, relinkPreviewRoute, relink, reverse]
