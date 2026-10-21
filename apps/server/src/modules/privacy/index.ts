// Privacy module (TSK-0100; HH-PRIV-03, HH-PRIV-05, HH-PRIV-06, HH-DATA-09, T22, T68, T72, ENT-PrivacyRequest,
// ENT-RetentionReview, ENT-Document, OWN-DEC-70, OWN-DEC-71, OWN-DEC-113, ROLE-MATRIX, RULE-SERVER-AUTHZ).
// Customer routes (verified project access; scoped to the session, any other project is NOT_FOUND):
//   GET  /customer/projects/:reference/privacy-requests                      the requester's own requests and outcomes
//   POST /customer/projects/:reference/privacy-requests/{export,correction,deletion}   a new request (fresh code)
//   GET  /customer/projects/:reference/privacy-requests/:request/export      the data export of a completed request
//   GET  /customer/projects/:reference/estimates/:number/versions/:version/documents   short-lived download links
// Owner routes (ROLE-MATRIX "Decide privacy requests; Delete action; delete a login account": Owner only):
//   GET  /staff/privacy-requests[/:id]                 the requests, each with the scoped search as it is now
//   POST /staff/privacy-requests/:id/review            open the review (keeps what the search found)
//   POST /staff/privacy-requests/:id/decision          complete or decline (fresh sign-in, reason)
//   GET  /staff/retention-reviews/:reviewId/deletion   the Delete confirmation of a review entry
//   POST /staff/retention-reviews/:reviewId/delete     Confirm Delete (fresh sign-in, reason, confirmed checks)
//   POST /staff/retention-reviews/:reviewId/archive    Archive (the record is kept)
//   POST /staff/retention-reviews/:reviewId/keep       Keep longer (until a date)
//   GET  /staff/deletions                              the deletion log (references only)
// PROPOSED mappings: reading one's own requests and the documents is the workspace read (request.view); downloading the
// export is privacy.request_export; opening a review and deciding are privacy.decide; Archive and Keep longer sit in
// the Delete action's row (records.delete); the confirmation and the log are retention.view. The fresh sign-in for
// Delete and for deciding (ROLE-OWNER: sensitive actions need a fresh sign-in and a reason) is PROPOSED in the route.
import type { Tx } from '@handyhub/db'
import type { CustomerActor } from '@handyhub/policy'
import { ApiError } from '../../api/errors.js'
import { pageSchema } from '../../api/pagination.js'
import type { ApiContext, ApiModule, RouteDef } from '../../api/route.js'
import { currentContext } from '../../platform/request-context.js'
import type { ObjectStorage } from '../../providers/index.js'
import { projectIdOf } from '../access/projects.js'
import { FRESH_AUTH_MINUTES } from '../identity/sessions.js'
import { readSessionToken, resolveCustomerSession } from '../identity/customer-sessions.js'
import { DOCUMENT_DOWNLOADS, PRIVACY_EXPORT, PRIVACY_REQUEST, PRIVACY_REQUESTS, findProject } from '../records/index.js'
import { archiveEntry, deleteEntry, keepEntry, previewEntry, reviewExists } from './decisions.js'
import { versionDownloads } from './documents.js'
import { customerExport } from './export.js'
import { listDeletions } from './log.js'
import {
  customerPrivacyRequest,
  customerPrivacyRequests,
  decidePrivacyRequest,
  DETAILS_MAX,
  listPrivacyRequests,
  privacyRequestDetail,
  privacyRequestExists,
  PRIVACY_REQUEST_STATES,
  requesterOf,
  startReview,
  submitPrivacyRequest,
  type PrivacyRequestKind,
} from './requests.js'
import {
  DELETION_DETAIL,
  DELETION_PAGE,
  ENTRY_DECISION,
  REQUEST_DETAIL,
  REQUEST_ITEM,
  REVIEW_PARAMS,
  STAFF_REQUEST_PARAMS,
} from './schemas.js'

export * from './decisions.js'
export * from './documents.js'
export * from './export.js'
export * from './log.js'
export * from './plan.js'
export * from './reapply.js'
export * from './requests.js'
export * from './targets.js'

const TEST = 'test/integration/privacy.test.ts'
const DOWNLOAD_TEST = 'test/integration/privacy-downloads.test.ts'

/** PROPOSED (no owner value): per client network and hour, like the other customer-facing writes. */
export const PRIVACY_REQUEST_RATE_LIMIT = {
  bucket: 'customer-privacy-request',
  limit: 10,
  windowSeconds: 3600,
} as const

const REASON = { type: 'string', minLength: 1, maxLength: 1000, pattern: '\\S' } as const
const CONFIRMED = { type: 'array', maxItems: 20, uniqueItems: true, items: { type: 'string', maxLength: 40 } } as const
const PROJECT_PARAMS = {
  type: 'object',
  additionalProperties: false,
  required: ['reference'],
  properties: { reference: { type: 'string', minLength: 1, maxLength: 40 } },
} as const

const projectResource: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const id = await projectIdOf(db, (req.params as { reference: string }).reference)
  return id ? { projectId: id } : null
}

/** Dates as ISO strings, exactly as the response schemas name them. */
const json = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

const requestIdOf = (ctx: ApiContext) => currentContext()?.requestId ?? ctx.req.id
const staffId = (ctx: ApiContext) => {
  if (ctx.actor.kind !== 'staff') throw new ApiError('FORBIDDEN')
  return ctx.actor.userId
}

/** The customer's session and who it is for this project (in scope: the framework checked the project). */
async function requester(ctx: ApiContext) {
  const db = ctx.tx ?? ctx.db
  const project = await findProject(db, ctx.scope, { reference: (ctx.req.params as { reference: string }).reference })
  if (!project) throw new ApiError('NOT_FOUND')
  const session = await resolveCustomerSession(db, readSessionToken(ctx.req))
  if (!session) throw new ApiError('UNAUTHENTICATED')
  const who = await requesterOf(db, session, project.id)
  if (!who) throw new ApiError('NOT_FOUND')
  return { project, session, who }
}

export type PrivacyDeps = { storage?: ObjectStorage | null }

export function privacyModule(deps: PrivacyDeps = {}): ApiModule {
  // ------------------------------------------------------------------------------------------------ customer
  const customerRead = {
    method: 'GET',
    actors: ['customer'],
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'none',
    pagination: false,
    test: TEST,
    resource: projectResource,
  } as const

  const myRequests: RouteDef = {
    ...customerRead,
    path: '/customer/projects/:reference/privacy-requests',
    operationId: 'listCustomerPrivacyRequests',
    summary: 'My privacy requests',
    description:
      'The export, correction and deletion requests the verified contact of this session made about this ' +
      'project’s customer, newest first, each with its state and, once the Owner decided, the outcome they are told: ' +
      'the categories deleted, retained (why, the retention category and its configured years, and until when where ' +
      'the start of the period is recorded) and excluded. Whether the session’s verification is fresh enough to make ' +
      'a new request (the identity confirmation, HH-ID-07). Never the Owner’s reason, a check or another person’s ' +
      'data. Any other project is NOT_FOUND (T19).',
    permission: 'request.view',
    projection: PRIVACY_REQUESTS,
    schema: { params: PROJECT_PARAMS, response: { 200: PRIVACY_REQUESTS.schema } },
    handler: async (ctx) => {
      const { project, who } = await requester(ctx)
      return {
        body: PRIVACY_REQUESTS.project({
          reference: project.reference,
          freshVerification: (ctx.actor as CustomerActor).freshVerification,
          requests: await customerPrivacyRequests(ctx.db, who),
        }),
      }
    },
  }

  const submit = (kind: PrivacyRequestKind, permission: RouteDef['permission'], body: Record<string, unknown>) =>
    ({
      method: 'POST',
      path: `/customer/projects/:reference/privacy-requests/${kind}`,
      operationId: `request${kind[0]?.toUpperCase()}${kind.slice(1)}`,
      summary: `Ask for ${kind === 'export' ? 'a data export' : kind === 'correction' ? 'a correction' : 'deletion'}`,
      description:
        `A ${kind} request about this project’s customer from its verified contact (ROLE-MATRIX ` +
        `${String(permission)}: Customer V). The identity confirmation is a one-time code entered in this session ` +
        'within the freshness window (PROPOSED): an older verification is FRESH_VERIFICATION_REQUIRED and nothing is ' +
        'written. One open request of each kind per customer (CONFLICT PRIVACY_REQUEST_OPEN). The Owner reviews and ' +
        'decides it; nothing is deleted or changed by the request itself. ' +
        (kind === 'correction' ? 'The customer says what to correct (details, kept as written). ' : '') +
        'Any other project is NOT_FOUND (T19).',
      actors: ['customer'],
      permission,
      kind: 'write',
      idempotency: 'required',
      expectedVersion: 'none',
      rateLimit: PRIVACY_REQUEST_RATE_LIMIT,
      audit: 'privacy.request_submit',
      pagination: false,
      test: TEST,
      resource: projectResource,
      projection: PRIVACY_REQUEST,
      schema: {
        params: PROJECT_PARAMS,
        body: {
          type: 'object',
          additionalProperties: false,
          required: Object.keys(body),
          properties: body,
        },
        response: { 201: PRIVACY_REQUEST.schema },
      },
      handler: async (ctx) => {
        const tx = ctx.tx as Tx
        const { project, session } = await requester(ctx)
        const details = (ctx.req.body as { details?: string } | undefined)?.details ?? null
        const out = await submitPrivacyRequest(tx, {
          kind,
          details,
          projectId: project.id,
          session,
          requestId: requestIdOf(ctx),
        })
        // The customer's words stay on the request; the audit keeps what happened.
        await ctx.audit({
          target: { type: 'privacy_request', id: out.id },
          summary: { kind, reference: out.reference, project: project.reference },
        })
        return { status: 201, body: PRIVACY_REQUEST.project(out) }
      },
    }) satisfies RouteDef

  const exportRoute: RouteDef = {
    ...customerRead,
    path: '/customer/projects/:reference/privacy-requests/:request/export',
    operationId: 'getCustomerDataExport',
    summary: 'My data export',
    description:
      'The data export of the requester’s completed export request (privacy.request_export), read now from the ' +
      'records: their customer name, own contact values, sign-in values, the properties and requests they ' +
      'submitted, the estimate versions received, approvals, their consent records, privacy requests and photo ' +
      'counts. Other contacts (third parties), staff-only notes and handling, staff details and audit entries are ' +
      'excluded and named so (PROPOSED, OQ-PRIVACY-REQUESTS). Needs a fresh verification of the session ' +
      '(FRESH_VERIFICATION_REQUIRED). A request that is not the requester’s, not an export or not completed is ' +
      'NOT_FOUND, as is any other project.',
    permission: 'privacy.request_export',
    projection: PRIVACY_EXPORT,
    schema: {
      params: {
        type: 'object',
        additionalProperties: false,
        required: ['reference', 'request'],
        properties: {
          reference: { type: 'string', minLength: 1, maxLength: 40 },
          request: { type: 'string', minLength: 1, maxLength: 20 },
        },
      },
      response: { 200: PRIVACY_EXPORT.schema },
    },
    handler: async (ctx) => {
      const { who } = await requester(ctx)
      const r = await customerPrivacyRequest(ctx.db, who, (ctx.req.params as { request: string }).request)
      if (!r || r.kind !== 'export' || r.state !== 'completed') throw new ApiError('NOT_FOUND')
      if (!(ctx.actor as CustomerActor).freshVerification)
        throw new ApiError('FORBIDDEN', {
          fieldErrors: [{ field: 'verification', code: 'FRESH_VERIFICATION_REQUIRED', message: '' }],
        })
      return { body: PRIVACY_EXPORT.project(await customerExport(ctx.db, who)) }
    },
  }

  const downloads: RouteDef = {
    ...customerRead,
    test: DOWNLOAD_TEST,
    path: '/customer/projects/:reference/estimates/:number/versions/:version/documents',
    operationId: 'getCustomerEstimateDownloads',
    summary: 'Download links of an estimate version',
    description:
      'For an estimate version the customer received (current, approved, declined, expired, superseded or ' +
      'withdrawn; HH-PRIV-06): short-lived signed links (DOCUMENT_URL_SECONDS) issued now, after the record and ' +
      'visibility checks, to the customer PDF as published and, for an uploaded estimate, the customer document it was ' +
      'confirmed for. Never a private original or an internal document. A draft, another project’s estimate and an ' +
      'unknown version are NOT_FOUND (T19, T68); storage NOT CONFIGURED is NOT_CONFIGURED.',
    permission: 'request.view',
    projection: DOCUMENT_DOWNLOADS,
    schema: {
      params: {
        type: 'object',
        additionalProperties: false,
        required: ['reference', 'number', 'version'],
        properties: {
          reference: { type: 'string', minLength: 1, maxLength: 40 },
          number: { type: 'string', minLength: 1, maxLength: 40 },
          version: { type: 'string', pattern: '^[1-9][0-9]{0,3}$' },
        },
      },
      response: { 200: DOCUMENT_DOWNLOADS.schema },
    },
    handler: async (ctx) => {
      const p = ctx.req.params as { reference: string; number: string; version: string }
      const out = await versionDownloads(
        ctx.db,
        ctx.scope,
        { reference: p.reference, number: p.number, version: Number(p.version) },
        deps.storage ?? null,
      )
      if (out === null) throw new ApiError('NOT_FOUND')
      if (out === 'not_configured') throw new ApiError('NOT_CONFIGURED')
      return { body: DOCUMENT_DOWNLOADS.project(out) }
    },
  }

  // ------------------------------------------------------------------------------------------------ staff
  const staffRead = {
    method: 'GET',
    actors: ['staff'],
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'none',
    pagination: false,
    test: TEST,
  } as const
  const staffWrite = {
    method: 'POST',
    actors: ['staff'],
    kind: 'write',
    idempotency: 'required',
    rateLimit: 'none',
    pagination: false,
    test: TEST,
  } as const

  const requestResource: NonNullable<RouteDef['resource']> = async ({ req, db }) =>
    (await privacyRequestExists(db, (req.params as { id: string }).id)) ? {} : null
  const reviewResource: NonNullable<RouteDef['resource']> = async ({ req, db }) =>
    (await reviewExists(db, (req.params as { reviewId: string }).reviewId)) ? {} : null

  const listRequests: RouteDef = {
    ...staffRead,
    path: '/staff/privacy-requests',
    operationId: 'listPrivacyRequests',
    summary: 'Privacy requests',
    description:
      'Owner only (privacy.decide). Every privacy request in the order received, optionally of one state: the ' +
      'reference, kind, state, project, customer, the requesting contact, whether it came from a login account, and ' +
      'when it was received, reviewed and decided. Response deadlines are NOT CONFIGURED (OQ-PRIVACY-REQUESTS).',
    permission: 'privacy.decide',
    pagination: true,
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: { state: { type: 'string', enum: [...PRIVACY_REQUEST_STATES] } },
      },
      response: { 200: pageSchema(REQUEST_ITEM) },
    },
    handler: async (ctx) => ({
      body: json(
        await listPrivacyRequests(
          ctx.db,
          ctx.req.query as { state?: string },
          ctx.page as NonNullable<ApiContext['page']>,
        ),
      ),
    }),
  }

  const getRequest: RouteDef = {
    ...staffRead,
    path: '/staff/privacy-requests/:id',
    operationId: 'getPrivacyRequest',
    summary: 'One privacy request with its scoped search',
    description:
      'Owner only (privacy.decide). The request, what the review found when it started, and the scoped search as it is ' +
      'now: every record kind held about the customer and the requester, counted, with what a deletion would do ' +
      '(delete, retain with the reason and until when where known, exclude third parties, none stored, not recorded), ' +
      'the hold checks and the checks the Owner must confirm (complaints, disputes, claims, invoices and payments are ' +
      'not recorded by the software yet), and what a confirmed deletion removes now.',
    permission: 'privacy.decide',
    resource: requestResource,
    schema: { params: STAFF_REQUEST_PARAMS, response: { 200: REQUEST_DETAIL } },
    handler: async (ctx) => {
      const d = await privacyRequestDetail(ctx.db, (ctx.req.params as { id: string }).id)
      if (!d) throw new ApiError('NOT_FOUND')
      return { body: json(d), version: d.version }
    },
  }

  const review: RouteDef = {
    ...staffWrite,
    path: '/staff/privacy-requests/:id/review',
    operationId: 'startPrivacyReview',
    summary: 'Open the review of a privacy request',
    description:
      'Owner only (privacy.decide). received -> under_review, keeping what the scoped search found (categories and ' +
      'counts, never content). If-Match: the request version. Refusals: CONFLICT REVIEW_ALREADY_STARTED, STALE_VERSION.',
    permission: 'privacy.decide',
    expectedVersion: 'required',
    audit: 'privacy.review_start',
    resource: requestResource,
    schema: {
      params: STAFF_REQUEST_PARAMS,
      body: { type: 'object', additionalProperties: false, properties: {} },
      response: { 200: REQUEST_DETAIL },
    },
    handler: async (ctx) => {
      const d = await startReview(ctx.tx as Tx, {
        id: (ctx.req.params as { id: string }).id,
        staffUserId: staffId(ctx),
        expectedVersion: ctx.expectedVersion(),
      })
      await ctx.audit({
        target: { type: 'privacy_request', id: d.id, version: d.version },
        summary: { reference: d.reference, kind: d.kind, found: d.plan.items.length },
      })
      return { body: json(d), version: d.version }
    },
  }

  const decide: RouteDef = {
    ...staffWrite,
    path: '/staff/privacy-requests/:id/decision',
    operationId: 'decidePrivacyRequest',
    summary: 'Complete or decline a privacy request',
    description:
      'Owner only (privacy.decide), with a fresh sign-in and a written reason. Completing a deletion request deletes ' +
      'what the scoped search allows now (each estimate never accepted that nothing blocks, with its deletion log ' +
      'entry) and, with closeAccess, closes sign-in, sessions and project access links (OWN-DEC-71; allowed while a ' +
      'hold keeps records; an unpaid balance never blocks it); every not-recorded check must be listed in ' +
      'confirmedChecks (VALIDATION_FAILED CHECK_NOT_CONFIRMED). Everything else is retained, never cascaded into ' +
      'protected records; the outcome names the deleted and retained categories (partially_completed when anything ' +
      'is retained). Completing an export makes the export available to the requester; a correction records that it ' +
      'was handled in the records’ own screens. If-Match: the request version. Refusals: FRESH_AUTH_REQUIRED, ' +
      'CONFLICT REVIEW_NOT_STARTED / ALREADY_DECIDED / RECORD_CHANGED, STALE_VERSION, VALIDATION_FAILED.',
    permission: 'privacy.decide',
    expectedVersion: 'required',
    freshAuthMinutes: FRESH_AUTH_MINUTES,
    audit: 'privacy.decide',
    resource: requestResource,
    schema: {
      params: STAFF_REQUEST_PARAMS,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['decision', 'reason'],
        properties: {
          decision: { type: 'string', enum: ['complete', 'decline'] },
          reason: REASON,
          confirmedChecks: CONFIRMED,
          closeAccess: { type: 'boolean' },
        },
      },
      response: { 200: REQUEST_DETAIL },
    },
    handler: async (ctx) => {
      const body = ctx.req.body as {
        decision: 'complete' | 'decline'
        reason: string
        confirmedChecks?: string[]
        closeAccess?: boolean
      }
      const out = await decidePrivacyRequest(ctx.tx as Tx, {
        id: (ctx.req.params as { id: string }).id,
        staffUserId: staffId(ctx),
        expectedVersion: ctx.expectedVersion(),
        decision: body.decision,
        reason: body.reason,
        confirmedChecks: body.confirmedChecks ?? [],
        ...(body.closeAccess === undefined ? {} : { closeAccess: body.closeAccess }),
        requestId: requestIdOf(ctx),
      })
      const d = out.detail
      await ctx.audit({
        target: { type: 'privacy_request', id: d.id, version: d.version },
        summary: {
          reference: d.reference,
          kind: d.kind,
          decision: body.decision,
          state: d.state,
          accessClosed: d.accessClosed ?? false,
          deletions: out.deletions.map((x) => ({ id: x.id, type: x.recordType, reference: x.reference })),
          checksConfirmed: body.confirmedChecks ?? [],
        },
        reason: body.reason.trim(),
        stepUpUsed: true,
      })
      return { body: json(d), version: d.version }
    },
  }

  const preview: RouteDef = {
    ...staffRead,
    path: '/staff/retention-reviews/:reviewId/deletion',
    operationId: 'getRetentionDeletion',
    summary: 'The Delete confirmation of a review entry',
    description:
      'Owner only (retention.view). What Confirm Delete would do now: the record reference, the attachments and ' +
      'linked rows removed with it, the linked records that stay, whether deletion is permanent (copies in backups ' +
      'stay until those backups expire), every check (open holds, signed approvals, jobs; complaints, warranties, ' +
      'disputes, claims, investigations, unfiled tax returns, legal and insurance holds, issued invoices and payments ' +
      'are not recorded and must be confirmed by the Owner), every blocker (a hold, protected evidence, a record in use, ' +
      'an erasure this software does not perform: requests and audit entries) and the entry’s status. A blocked ' +
      'deletion offers Archive.',
    permission: 'retention.view',
    resource: reviewResource,
    schema: { params: REVIEW_PARAMS, response: { 200: DELETION_DETAIL } },
    handler: async (ctx) => {
      const p = await previewEntry(ctx.db, (ctx.req.params as { reviewId: string }).reviewId)
      if (!p) throw new ApiError('NOT_FOUND')
      return { body: p }
    },
  }

  const del: RouteDef = {
    ...staffWrite,
    path: '/staff/retention-reviews/:reviewId/delete',
    operationId: 'deleteRetentionRecord',
    summary: 'Confirm Delete',
    description:
      'Owner only (ROLE-MATRIX records.delete), with a fresh sign-in and a written reason: deletes the entry’s record ' +
      'when nothing blocks it and every not-recorded check is listed in confirmedChecks, with its deletion log entry ' +
      '(actor, time, record reference, reason; never the content) in the same transaction; stored files are removed ' +
      'after the commit. Never passes a hold, protected evidence (Archive, Void or an audited correction instead), a ' +
      'record in use or an erasure this software does not perform: CONFLICT naming each blocker, audited as denied, ' +
      'with nothing deleted. Refusals: FRESH_AUTH_REQUIRED, CONFLICT (blockers, RECORD_CHANGED), VALIDATION_FAILED ' +
      '(CHECK_NOT_CONFIRMED, reason).',
    permission: 'records.delete',
    expectedVersion: 'none',
    freshAuthMinutes: FRESH_AUTH_MINUTES,
    audit: 'privacy.record_delete',
    resource: reviewResource,
    schema: {
      params: REVIEW_PARAMS,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['reason', 'confirmedChecks'],
        properties: { reason: REASON, confirmedChecks: CONFIRMED },
      },
      response: { 200: ENTRY_DECISION },
    },
    handler: async (ctx) => {
      const reviewId = (ctx.req.params as { reviewId: string }).reviewId
      const body = ctx.req.body as { reason: string; confirmedChecks: string[] }
      const out = await deleteEntry(ctx.tx as Tx, {
        reviewId,
        staffUserId: staffId(ctx),
        reason: body.reason,
        confirmedChecks: body.confirmedChecks,
        requestId: requestIdOf(ctx),
      })
      const record = out.preview?.target.record
      if (!out.ok) {
        await ctx.audit({
          target: record ? { type: record.type, id: record.id } : { type: 'retention_review', id: reviewId },
          result: 'denied',
          summary: {
            review: reviewId,
            reference: record?.reference ?? null,
            blockers: [...out.blockers],
            refused: out.error.options.fieldErrors?.map((f) => f.code) ?? [],
          },
          reason: body.reason.trim(),
          stepUpUsed: true,
        })
        return { body: null, refusal: out.error }
      }
      await ctx.audit({
        target: { type: out.preview.target.record.type, id: out.preview.target.record.id },
        summary: {
          review: reviewId,
          deletion: out.deletionId,
          reference: out.preview.target.record.reference,
          early: out.preview.early,
          removed: out.removed,
          checksConfirmed: body.confirmedChecks,
        },
        reason: body.reason.trim(),
        stepUpUsed: true,
      })
      return { body: { status: { state: 'deleted' }, deletionId: out.deletionId, blockers: [] } }
    },
  }

  const archive: RouteDef = {
    ...staffWrite,
    path: '/staff/retention-reviews/:reviewId/archive',
    operationId: 'archiveRetentionRecord',
    summary: 'Archive instead of deleting',
    description:
      'Owner only (records.delete, PROPOSED: Archive sits in the Delete action’s row), with a written reason. The ' +
      'record is kept exactly as it is, with its retention category and permissions (HH-DATA-09); the entry leaves ' +
      'the open queue and keeps why deletion was blocked. A later Delete stays possible once nothing blocks it. ' +
      'CONFLICT ALREADY_DELETED once its record was deleted.',
    permission: 'records.delete',
    expectedVersion: 'none',
    audit: 'privacy.record_archive',
    resource: reviewResource,
    schema: {
      params: REVIEW_PARAMS,
      body: { type: 'object', additionalProperties: false, required: ['reason'], properties: { reason: REASON } },
      response: { 200: ENTRY_DECISION },
    },
    handler: async (ctx) => {
      const reviewId = (ctx.req.params as { reviewId: string }).reviewId
      const { reason } = ctx.req.body as { reason: string }
      const out = await archiveEntry(ctx.tx as Tx, {
        reviewId,
        staffUserId: staffId(ctx),
        reason,
        requestId: requestIdOf(ctx),
      })
      await ctx.audit({
        target: { type: 'retention_review', id: reviewId },
        summary: { decision: 'archive', blockers: [...out.blockers] },
        reason: reason.trim(),
      })
      return { body: { status: { state: out.status.state }, deletionId: null, blockers: out.blockers } }
    },
  }

  const keep: RouteDef = {
    ...staffWrite,
    path: '/staff/retention-reviews/:reviewId/keep',
    operationId: 'keepRetentionRecord',
    summary: 'Keep the record longer',
    description:
      'Owner only (records.delete, PROPOSED), with a written reason and the time the entry comes back to the queue ' +
      '(after now, at most KEEP_LONGER_MAX_YEARS ahead, PROPOSED). The record is kept unchanged (OWN-DEC-70: the owner ' +
      'may extend periods). CONFLICT ALREADY_DELETED once its record was deleted.',
    permission: 'records.delete',
    expectedVersion: 'none',
    audit: 'privacy.record_keep',
    resource: reviewResource,
    schema: {
      params: REVIEW_PARAMS,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['reason', 'keepUntil'],
        properties: { reason: REASON, keepUntil: { type: 'string', format: 'date-time' } },
      },
      response: { 200: ENTRY_DECISION },
    },
    handler: async (ctx) => {
      const reviewId = (ctx.req.params as { reviewId: string }).reviewId
      const { reason, keepUntil } = ctx.req.body as { reason: string; keepUntil: string }
      const status = await keepEntry(ctx.tx as Tx, {
        reviewId,
        staffUserId: staffId(ctx),
        reason,
        until: new Date(keepUntil),
        requestId: requestIdOf(ctx),
      })
      await ctx.audit({
        target: { type: 'retention_review', id: reviewId },
        summary: { decision: 'extend', keepUntil: status.until },
        reason: reason.trim(),
      })
      return { body: { status: { state: status.state }, deletionId: null, blockers: [] } }
    },
  }

  const log: RouteDef = {
    ...staffRead,
    path: '/staff/deletions',
    operationId: 'listDeletions',
    summary: 'The deletion log',
    description:
      'Owner only (retention.view). Every deletion, newest first: the record type, ID and reference, the reason, ' +
      'whether it was early and permanent, the counts of what went with it, the checks the Owner confirmed, who ' +
      'decided and when, where the decision came from (a review entry, a privacy request, a re-application after a ' +
      'restore, which names the original entry). Never the deleted content.',
    permission: 'retention.view',
    pagination: true,
    schema: { response: { 200: DELETION_PAGE } },
    handler: async (ctx) => ({ body: await listDeletions(ctx.db, ctx.page as NonNullable<ApiContext['page']>) }),
  }

  return {
    name: 'privacy',
    routes: [
      myRequests,
      submit('export', 'privacy.request_export', {}),
      submit('correction', 'privacy.request_correction', {
        details: { type: 'string', minLength: 1, maxLength: DETAILS_MAX },
      }),
      submit('deletion', 'privacy.request_deletion', {}),
      exportRoute,
      downloads,
      listRequests,
      getRequest,
      review,
      decide,
      preview,
      del,
      archive,
      keep,
      log,
    ],
  }
}
