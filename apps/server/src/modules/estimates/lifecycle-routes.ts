// Estimate lifecycle routes (TSK-0055; HH-EST-04, HH-STATE-01, S04, C05, T26, T32, OWN-DEC-118, RULE-SERVER-AUTHZ).
//   POST /staff/estimate-versions/:versionId/publish          Publish (estimate.publish, the Owner's publishing policy)
//   POST /staff/estimate-versions/:versionId/request-review   draft -> in review (estimate.draft, PROPOSED)
//   POST /staff/estimate-versions/:versionId/return-to-draft  in review -> draft (estimate.draft, PROPOSED)
//   POST /staff/estimate-versions/:versionId/withdraw         published -> withdrawn, with a reason
//   POST /staff/estimate-versions/:versionId/expire           published -> expired now, with a reason
//   POST /staff/estimate-versions/:versionId/record-decline   published -> declined (the customer's decline)
//   POST /staff/estimate-versions/:versionId/revise           a new draft version of the same estimate
//   GET  /staff/settings/estimate-publishing                  who may publish (estimate.change_publishers, Owner)
//   PUT  /staff/settings/estimate-publishing                  the Owner changes it
// - There is no route that sets a state: each route is one named event, decided on the server by the policy and the
//   domain machine (lifecycle.ts), with the version the caller saw (If-Match) and an idempotency key. Each writes its
//   audit event with what it pinned or changed; reasons go to the audit log only.
// - The publishing policy is read from configuration both by the enforcement point (decisionContext) and again inside
//   the transaction, so a removed permission refuses the next publish at once (T26).
import type { Tx } from '@handyhub/db'
import { STAFF_ROLES, type StaffRole } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError } from '../../api/errors.js'
import type { ApiContext, RouteDef } from '../../api/route.js'
import { loadConfig, recordPolicyVersion } from '../../platform/config/index.js'
import type { ObjectStorage } from '../../providers/index.js'
import {
  changeVersionState,
  estimateExpiryAutomation,
  publishingRoles,
  publishVersion,
  reviseVersion,
  type StaffEvent,
} from './lifecycle.js'
import {
  EMPTY_BODY,
  OPTIONAL_REASON_BODY,
  PUBLISHING_BODY,
  PUBLISHING_SETTING,
  REASON_BODY,
} from './lifecycle-schemas.js'
import { builderView, staffActor, versionProjectOf } from './routes.js'
import { CREATE_RESULT, VERSION_PARAMS, VERSION_VIEW } from './schemas.js'

const TEST = 'test/integration/estimate-lifecycle.test.ts'

export type LifecycleDeps = {
  /** The private object storage the published customer PDF is stored in; null while NOT CONFIGURED. */
  storage: ObjectStorage | null
  /** Outside production the customer PDF carries the TEST mark (OWN-DEC-126). */
  testMark: boolean
}

const common = {
  actors: ['staff'],
  kind: 'write',
  idempotency: 'required',
  rateLimit: 'none',
  pagination: false,
  test: TEST,
} as const

/** The Owner's publishing policy for the enforcement point, read from configuration. */
const publishingContext: NonNullable<RouteDef['decisionContext']> = async ({ db }) => ({
  publishingRoles: publishingRoles(await loadConfig(db)),
})

const reasonOf = (ctx: ApiContext) => {
  const r = (ctx.req.body as { reason?: unknown } | undefined)?.reason
  return typeof r === 'string' && r.trim() !== '' ? r.trim() : undefined
}

function stateRoute(def: {
  path: string
  operationId: string
  summary: string
  description: string
  permission: RouteDef['permission']
  audit: string
  event: StaffEvent
  body: NonNullable<RouteDef['schema']['body']>
}): RouteDef {
  return {
    ...common,
    method: 'POST',
    path: def.path,
    operationId: def.operationId,
    summary: def.summary,
    description: def.description,
    permission: def.permission,
    expectedVersion: 'required',
    audit: def.audit,
    resource: versionProjectOf,
    schema: { params: VERSION_PARAMS, body: def.body, response: { 200: VERSION_VIEW } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staffActor(ctx)
      const { versionId } = ctx.req.params as { versionId: string }
      const reason = reasonOf(ctx)
      const out = await changeVersionState(tx, actor, versionId, def.event, {
        expectedRowVersion: ctx.expectedVersion(),
        ...(reason === undefined ? {} : { reason }),
      })
      const view = await builderView(tx, actor, versionId)
      await ctx.audit({
        target: { type: 'estimate_version', id: versionId, version: out.rowVersion },
        summary: { estimateNumber: view.estimateNumber, version: view.version, from: out.from, to: out.to },
        ...(reason === undefined ? {} : { reason }),
      })
      return { body: view, version: out.rowVersion }
    },
  }
}

export function lifecycleRoutes(deps: LifecycleDeps): RouteDef[] {
  const expiry = estimateExpiryAutomation()

  const publish: RouteDef = {
    ...common,
    method: 'POST',
    path: '/staff/estimate-versions/:versionId/publish',
    operationId: 'publishEstimateVersion',
    summary: 'Publish an estimate version',
    description:
      "Staff with estimate.publish: the Owner always; an Estimator while the Owner's publishing policy " +
      '(estimate.publishing_roles) grants the role; every other role is refused (OWN-DEC-118). With If-Match: the ' +
      'row version shown. Runs the publish readiness check under the version lock and refuses, naming every reason, ' +
      'unless it is ready (a NOT CONFIGURED value keeps it unpublished) and no review hold blocks. In one ' +
      'transaction: the version published before it is superseded; the validity (from publishing) and the terms ' +
      'version are pinned; the customer PDF is stored with its SHA-256; a request ready for its estimate is marked ' +
      'estimated; the automatic estimate-ready notice is queued (no amounts); the validity expiry is scheduled. ' +
      'Returns the builder view.',
    permission: 'estimate.publish',
    decisionContext: publishingContext,
    expectedVersion: 'required',
    audit: 'estimate.publish',
    resource: versionProjectOf,
    schema: { params: VERSION_PARAMS, body: EMPTY_BODY, response: { 200: VERSION_VIEW } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staffActor(ctx)
      const { versionId } = ctx.req.params as { versionId: string }
      const out = await publishVersion(
        tx,
        actor,
        versionId,
        { storage: deps.storage, testMark: deps.testMark, expiry },
        { expectedRowVersion: ctx.expectedVersion() },
      )
      const view = await builderView(tx, actor, versionId)
      await ctx.audit({
        target: { type: 'estimate_version', id: versionId, version: out.rowVersion },
        summary: {
          estimateNumber: view.estimateNumber,
          version: view.version,
          authoringMethod: view.authoringMethod,
          totalCents: view.totals?.totalCents ?? null,
          publishedAt: out.publishedAt.toISOString(),
          validUntil: out.validUntil.toISOString(),
          validityPolicyVersion: out.validityPolicyVersion,
          termsVersion: out.termsVersion,
          publishingPolicyVersion: out.publishingPolicyVersion,
          customerPdfSha256: out.customerPdf.sha256,
          superseded: out.superseded ? { versionId: out.superseded.versionId, version: out.superseded.version } : null,
          requestsEstimated: out.requestsEstimated,
        },
      })
      if (out.superseded)
        await ctx.audit({
          action: 'estimate.supersede',
          target: { type: 'estimate_version', id: out.superseded.versionId },
          summary: { estimateNumber: view.estimateNumber, version: out.superseded.version, by: view.version },
        })
      return { body: view, version: out.rowVersion }
    },
  }

  const requestReview = stateRoute({
    path: '/staff/estimate-versions/:versionId/request-review',
    operationId: 'requestEstimateReview',
    summary: 'Request review of an estimate draft',
    description:
      'Staff with estimate.draft (PROPOSED mapping), on a draft, with If-Match. Marks it in review: the optional ' +
      'pre-publish review; it stays editable and can be published directly. Returns the builder view.',
    permission: 'estimate.draft',
    audit: 'estimate.request_review',
    event: 'request_review',
    body: EMPTY_BODY,
  })
  const returnToDraft = stateRoute({
    path: '/staff/estimate-versions/:versionId/return-to-draft',
    operationId: 'returnEstimateToDraft',
    summary: 'Return an estimate in review to the draft',
    description:
      'Staff with estimate.draft (PROPOSED mapping), on a version in review, with If-Match. Returns the builder view.',
    permission: 'estimate.draft',
    audit: 'estimate.return_to_draft',
    event: 'return_to_draft',
    body: EMPTY_BODY,
  })
  const withdraw = stateRoute({
    path: '/staff/estimate-versions/:versionId/withdraw',
    operationId: 'withdrawEstimateVersion',
    summary: 'Withdraw a published estimate',
    description:
      'Staff with estimate.withdraw (Owner, Estimator), on a published version, with If-Match and a written reason ' +
      '(PROPOSED; kept in the audit log only). The version is kept as withdrawn and can no longer be accepted. ' +
      'Returns the builder view.',
    permission: 'estimate.withdraw',
    audit: 'estimate.withdraw',
    event: 'withdraw',
    body: REASON_BODY,
  })
  const expire = stateRoute({
    path: '/staff/estimate-versions/:versionId/expire',
    operationId: 'expireEstimateVersion',
    summary: 'Expire a published estimate now',
    description:
      'Staff with estimate.expire (Owner, Estimator), on a published version, with If-Match and a written reason ' +
      '(PROPOSED). Ends its validity now; the end of the validity period expires it on its own (the validity job). ' +
      'An expired version can never be accepted. Returns the builder view.',
    permission: 'estimate.expire',
    audit: 'estimate.expire',
    event: 'expire_now',
    body: REASON_BODY,
  })
  const recordDecline = stateRoute({
    path: '/staff/estimate-versions/:versionId/record-decline',
    operationId: 'recordEstimateDecline',
    summary: "Record the customer's decline",
    description:
      'Staff with estimate.record_decline (Owner, Estimator; Office PROPOSED), on a published version, with ' +
      "If-Match: records that the customer declined it, with the customer's optional reason (OWN-DEC-103; audit log " +
      'only). Returns the builder view.',
    permission: 'estimate.record_decline',
    audit: 'estimate.record_decline',
    event: 'decline',
    body: OPTIONAL_REASON_BODY,
  })

  const revise: RouteDef = {
    ...common,
    method: 'POST',
    path: '/staff/estimate-versions/:versionId/revise',
    operationId: 'reviseEstimateVersion',
    summary: 'Revise an estimate as a new version',
    description:
      'Staff with estimate.revise (Owner, Estimator), on a version past review of an open project. Creates the next ' +
      'version of the same estimate as a draft, copied from this one and priced again by the server; the source ' +
      'version is never changed. Refused while the estimate has a version being edited, and once it has an ' +
      'accepted version (PROPOSED: accepted work changes through a change order). Publishing the new version ' +
      'supersedes the published one.',
    permission: 'estimate.revise',
    expectedVersion: 'none',
    audit: 'estimate.revise',
    resource: versionProjectOf,
    schema: { params: VERSION_PARAMS, body: EMPTY_BODY, response: { 201: CREATE_RESULT } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staffActor(ctx)
      const { versionId } = ctx.req.params as { versionId: string }
      const out = await reviseVersion(tx, actor, versionId)
      await ctx.audit({
        target: { type: 'estimate_version', id: out.versionId, version: out.rowVersion },
        summary: {
          estimateNumber: out.number,
          version: out.version,
          revisedFrom: versionId,
          discountDropped: out.discountDropped,
        },
      })
      const body = {
        estimateId: out.estimateId,
        number: out.number,
        versionId: out.versionId,
        version: out.version,
        rowVersion: out.rowVersion,
      }
      return { status: 201, body, version: out.rowVersion }
    },
  }

  const setting = async (db: ApiContext['db'] | Tx) => {
    const entry = (await loadConfig(db)).get('estimate.publishing_roles')
    const roles = entry.state === 'CONFIGURED' ? [...entry.value.roles] : []
    return {
      state: entry.state,
      version: entry.version,
      roles,
      estimatorsMayPublish: roles.includes('estimator'),
    }
  }

  const getPublishing: RouteDef = {
    method: 'GET',
    path: '/staff/settings/estimate-publishing',
    operationId: 'getEstimatePublishing',
    summary: 'Who may publish estimates',
    description:
      'The Owner (estimate.change_publishers). The publishing policy (estimate.publishing_roles, OWN-DEC-118): the ' +
      'roles listed and whether Estimators may publish. The Owner always may (ROLE-MATRIX). ETag: the policy version.',
    actors: ['staff'],
    permission: 'estimate.change_publishers',
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'none',
    pagination: false,
    test: TEST,
    schema: { response: { 200: PUBLISHING_SETTING } },
    handler: async (ctx) => {
      const body = await setting(ctx.db)
      return { body, version: body.version ?? 0 }
    },
  }

  const putPublishing: RouteDef = {
    ...common,
    method: 'PUT',
    path: '/staff/settings/estimate-publishing',
    operationId: 'setEstimatePublishing',
    summary: 'Change who may publish estimates',
    description:
      'The Owner (estimate.change_publishers), with If-Match: the policy version shown. Records the next version of ' +
      'estimate.publishing_roles: the Owner, and the Estimator when estimatorsMayPublish is true. Takes effect at ' +
      'once: the next publish is decided under the new version (T26). Audited.',
    permission: 'estimate.change_publishers',
    expectedVersion: 'required',
    audit: 'estimate.change_publishers',
    schema: { body: PUBLISHING_BODY, response: { 200: PUBLISHING_SETTING } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staffActor(ctx)
      const { estimatorsMayPublish } = ctx.req.body as { estimatorsMayPublish: boolean }
      // The same lock recordPolicyVersion takes, so the version compared is the one superseded.
      await sql`SELECT pg_advisory_xact_lock(hashtext(${'policy_version:estimate.publishing_roles'}))`.execute(tx)
      const before = await setting(tx)
      const expected = ctx.expectedVersion()
      if (expected !== (before.version ?? 0))
        throw new ApiError('STALE_VERSION', { current: { version: before.version ?? 0 } })
      const roles: StaffRole[] = STAFF_ROLES.filter((r) => r === 'owner' || (estimatorsMayPublish && r === 'estimator'))
      const version = await recordPolicyVersion(tx, {
        key: 'estimate.publishing_roles',
        value: { roles },
        sourceIds: ['OWN-DEC-118'],
        changedBy: actor.userId,
        reason: 'The Owner changed who may publish estimates (OWN-DEC-118).',
      })
      await ctx.audit({
        target: { type: 'policy_version', id: 'estimate.publishing_roles', version },
        summary: { from: before.roles, to: roles, previousVersion: before.version },
      })
      const body = await setting(tx)
      return { body, version }
    },
  }

  return [publish, requestReview, returnToDraft, withdraw, expire, recordDecline, revise, getPublishing, putPublishing]
}
