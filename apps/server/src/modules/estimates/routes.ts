// Staff estimate routes: Write an Estimate, the staff builder (TSK-0053; HH-EST-01, HH-EST-05, HH-EST-11, S04,
// RULE-SERVER-AUTHZ, RULE-MONEY-CENTS, RULE-NO-INVENTED-FACTS).
// - Write an Estimate creates the estimate with its first written draft version (createEstimate) and brings the
//   project's pending-estimate queue items up to date, in one transaction with its audit event.
// - The builder reads one version with what it shows besides the lines: the project, customer and property, the
//   project's work packages, the issuer name, mailing address, validity and terms from configuration (null where NOT
//   CONFIGURED: never a default) and the publish readiness with every reason the version cannot be published yet.
// - Saving sends the whole draft (lines per work package, options, texts, discount category, internal notes); the
//   server computes every amount and total (saveDraft), refuses a stale save (If-Match row version) and a save on a
//   project that is no longer open (as canEdit shows), and audits it.
// - Every route needs estimate.draft (Owner, Estimator). Publishing, revising and the lifecycle are TSK-0055; Upload an
//   Estimate (TSK-0054) is document-routes.ts, and the builder view shows an uploaded version's documents. Nothing here
//   sends a message.
import type { Db, Tx } from '@handyhub/db'
import { decide, type StaffActor } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError } from '../../api/errors.js'
import { instantIdCursor, pageSchema, toPage } from '../../api/pagination.js'
import type { ApiContext, RouteDef } from '../../api/route.js'
import { loadConfig } from '../../platform/config/index.js'
import { syncEstimateItem } from '../queue/index.js'
import { documentsView } from './documents.js'
import { lifecycleView, type LifecycleView } from './lifecycle.js'
import { createEstimate, type DraftInput, EDITABLE_STATES, saveDraft } from './model.js'
import { staffEstimateVersion } from './projections.js'
import { documentDetails, readinessOf, versionSnapshot } from './readiness.js'
import {
  CREATE_RESULT,
  DRAFT_BODY,
  LIST_ITEM,
  PROJECT_ESTIMATES,
  PROJECT_PARAMS,
  VERSION_PARAMS,
  VERSION_VIEW,
} from './schemas.js'

const TEST = 'test/integration/estimate-builder.test.ts'
type Reader = Db | Tx

export function staffActor(ctx: ApiContext): StaffActor {
  if (ctx.actor.kind !== 'staff') throw new ApiError('FORBIDDEN')
  return ctx.actor
}

const allowed = (actor: StaffActor, projectId: string) =>
  decide(actor, 'estimate.draft', { projectId }, { now: new Date(), online: true }).effect === 'allow'

export const projectOf: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { projectId } = req.params as { projectId: string }
  const p = await db.selectFrom('crm.projects').select('id').where('id', '=', projectId).executeTakeFirst()
  return p ? { projectId: p.id } : null
}

export const versionProjectOf: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { versionId } = req.params as { versionId: string }
  const v = await db
    .selectFrom('estimating.estimate_versions')
    .select('project_id')
    .where('id', '=', versionId)
    .executeTakeFirst()
  return v ? { projectId: v.project_id } : null
}

const num = (v: string | number | null) => (v === null ? null : Number(v))

/** The builder's view of one version; NOT_FOUND when it does not exist or the caller may not read it. */
export async function builderView(db: Reader, actor: StaffActor, versionId: string) {
  const v = await staffEstimateVersion(db, actor, versionId)
  if (!v) throw new ApiError('NOT_FOUND')
  const project = await db
    .selectFrom('crm.projects as p')
    .innerJoin('crm.customers as c', 'c.id', 'p.customer_id')
    .innerJoin('crm.properties as pr', 'pr.id', 'p.property_id')
    .select([
      'p.id',
      'p.reference',
      'p.state',
      'c.display_name',
      'pr.street',
      'pr.unit',
      'pr.city',
      'pr.state as property_state',
      'pr.zip',
    ])
    .where('p.id', '=', v.projectId)
    .executeTakeFirstOrThrow()
  const request = await db
    .selectFrom('intake.requests')
    .select(['id', 'reference'])
    .where('project_id', '=', v.projectId)
    .orderBy('submitted_at')
    .limit(1)
    .executeTakeFirst()
  const packages = await db
    .selectFrom('work.work_packages as wp')
    .innerJoin('catalog.services as s', 's.id', 'wp.service_id')
    .select(['wp.id', 's.code', 'wp.position'])
    .where('wp.project_id', '=', v.projectId)
    .orderBy('wp.position')
    .execute()
  const preparer = await db
    .selectFrom('identity.staff_users')
    .select(['id', 'display_name'])
    .where('id', '=', v.preparedBy)
    .executeTakeFirst()
  const config = await loadConfig(db)
  const snapshot = await versionSnapshot(db, versionId)
  if (!snapshot) throw new ApiError('NOT_FOUND')
  const readiness = readinessOf(snapshot.version, snapshot.lines, config)
  return {
    id: v.id,
    estimateId: v.estimateId,
    estimateNumber: v.estimateNumber,
    version: v.version,
    state: v.state,
    rowVersion: v.rowVersion,
    authoringMethod: v.authoringMethod,
    currency: v.currency,
    project: { id: project.id, reference: project.reference, state: project.state },
    customer: { name: project.display_name },
    property: {
      street: project.street,
      unit: project.unit,
      city: project.city,
      state: project.property_state,
      zip: project.zip,
    },
    request: request ? { id: request.id, reference: request.reference } : null,
    preparedBy: { id: v.preparedBy, name: preparer?.display_name ?? null },
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
    lines: v.lines,
    texts: v.texts,
    discountCategory: v.discountCategory,
    totals: v.totals,
    paymentTerm: v.pinned.paymentTerm,
    document: documentDetails(config),
    workPackages: packages.map((p) => ({ id: p.id, serviceCode: p.code, position: p.position })),
    readiness,
    internal: v.internal,
    // Upload an Estimate (TSK-0054, HH-EST-11): the documents, "PDF required" and the agree-confirmation.
    documents: v.authoringMethod === 'uploaded' ? await documentsView(db, versionId, config) : null,
    canEdit:
      (EDITABLE_STATES as readonly string[]).includes(v.state) &&
      project.state === 'open' &&
      allowed(actor, v.projectId),
    // TSK-0055: publishing, the lifecycle actions and the version history.
    lifecycle: (await lifecycleView(db, actor, versionId, config)) as LifecycleView,
  }
}

type BuilderView = Awaited<ReturnType<typeof builderView>>

/** The versions of each estimate of a project, newest estimate first, versions in order. */
async function projectEstimates(db: Reader, projectId: string) {
  const rows = await db
    .selectFrom('estimating.estimates as e')
    .innerJoin('estimating.estimate_versions as v', 'v.estimate_id', 'e.id')
    .select([
      'e.id as estimate_id',
      'e.number',
      'e.sequence',
      'v.id',
      'v.version',
      'v.state',
      'v.total_cents',
      'v.updated_at',
    ])
    .where('e.project_id', '=', projectId)
    .orderBy('e.sequence', 'desc')
    .orderBy('v.version')
    .execute()
  const byEstimate = new Map<string, { estimateId: string; number: string; versions: unknown[] }>()
  for (const r of rows) {
    const entry = byEstimate.get(r.estimate_id) ?? { estimateId: r.estimate_id, number: r.number, versions: [] }
    entry.versions.push({
      versionId: r.id,
      version: r.version,
      state: r.state,
      totalCents: num(r.total_cents),
      updatedAt: r.updated_at.toISOString(),
    })
    byEstimate.set(r.estimate_id, entry)
  }
  return [...byEstimate.values()]
}

const list: RouteDef = {
  method: 'GET',
  path: '/staff/estimates',
  operationId: 'listEstimates',
  summary: 'Estimates',
  description:
    'Staff with estimate.draft (Owner, Estimator). Estimates newest first, each with its latest version: number, ' +
    'project reference, customer name, version, state and the server-computed total (integer cents; null while the ' +
    'draft is incomplete). No internal cost or note.',
  actors: ['staff'],
  permission: 'estimate.draft',
  kind: 'read',
  idempotency: 'none',
  expectedVersion: 'none',
  rateLimit: 'none',
  audit: 'none',
  pagination: true,
  test: TEST,
  schema: { response: { 200: pageSchema(LIST_ITEM) } },
  handler: async (ctx) => {
    const page = ctx.page as NonNullable<ApiContext['page']>
    let query = ctx.db
      .selectFrom('estimating.estimates as e')
      .innerJoin('crm.projects as p', 'p.id', 'e.project_id')
      .innerJoin('crm.customers as c', 'c.id', 'p.customer_id')
      .select([
        'e.id',
        'e.number',
        'e.created_at',
        'p.id as project_id',
        'p.reference',
        'c.display_name',
        sql<string>`e.created_at::text`.as('created_key'),
      ])
    if (page.after !== undefined) {
      // Both parts checked strictly: a crafted cursor is a 400, never a failed cast (a 500).
      const [at, id] = instantIdCursor(page.after)
      query = query.where(sql<boolean>`(e.created_at, e.id) < (${at}::timestamptz, ${id}::uuid)`)
    }
    const rows = await query
      .orderBy('e.created_at', 'desc')
      .orderBy('e.id', 'desc')
      .limit(page.limit + 1)
      .execute()
    const out = toPage(rows, page, (r) => [r.created_key, r.id])
    const ids = out.items.map((r) => r.id)
    const latest = ids.length
      ? await ctx.db
          .selectFrom('estimating.estimate_versions')
          .select(['id', 'estimate_id', 'version', 'state', 'total_cents', 'updated_at'])
          .where('estimate_id', 'in', ids)
          .orderBy('version', 'desc')
          .execute()
      : []
    return {
      body: {
        items: out.items.flatMap((r) => {
          const v = latest.find((l) => l.estimate_id === r.id)
          if (!v) return []
          return [
            {
              estimateId: r.id,
              number: r.number,
              projectId: r.project_id,
              projectReference: r.reference,
              customerName: r.display_name,
              createdAt: r.created_at.toISOString(),
              latest: {
                versionId: v.id,
                version: v.version,
                state: v.state,
                totalCents: num(v.total_cents),
                updatedAt: v.updated_at.toISOString(),
              },
            },
          ]
        }),
        nextCursor: out.nextCursor,
      },
    }
  },
}

const ofProject: RouteDef = {
  method: 'GET',
  path: '/staff/projects/:projectId/estimates',
  operationId: 'listProjectEstimates',
  summary: "A project's estimates",
  description:
    'Staff with estimate.draft. The estimates of one project with every version (state, total in integer cents), ' +
    'and whether the caller may Write an Estimate now (the project is open). The request record shows it.',
  actors: ['staff'],
  permission: 'estimate.draft',
  kind: 'read',
  idempotency: 'none',
  expectedVersion: 'none',
  rateLimit: 'none',
  audit: 'none',
  pagination: false,
  test: TEST,
  resource: projectOf,
  schema: { params: PROJECT_PARAMS, response: { 200: PROJECT_ESTIMATES } },
  handler: async (ctx) => {
    const actor = staffActor(ctx)
    const { projectId } = ctx.req.params as { projectId: string }
    const project = await ctx.db
      .selectFrom('crm.projects')
      .select(['id', 'state'])
      .where('id', '=', projectId)
      .executeTakeFirstOrThrow()
    return {
      body: {
        projectId: project.id,
        canWrite: project.state === 'open' && allowed(actor, project.id),
        estimates: await projectEstimates(ctx.db, project.id),
      },
    }
  },
}

const write: RouteDef = {
  method: 'POST',
  path: '/staff/projects/:projectId/estimates',
  operationId: 'writeEstimate',
  summary: 'Write an Estimate',
  description:
    'Staff with estimate.draft, on an open project. Creates estimate <project reference>-E<n> with its first draft ' +
    'version, written in the staff app (HH-EST-11), copying the project payment term; the pending-estimate queue ' +
    'items of the project show the draft. No amount, price or message is created.',
  actors: ['staff'],
  permission: 'estimate.draft',
  kind: 'write',
  idempotency: 'required',
  expectedVersion: 'none',
  rateLimit: 'none',
  audit: 'estimate.create',
  pagination: false,
  test: TEST,
  resource: projectOf,
  schema: {
    params: PROJECT_PARAMS,
    body: { type: 'object', additionalProperties: false, properties: {} },
    response: { 201: CREATE_RESULT },
  },
  handler: async (ctx) => {
    const tx = ctx.tx as Tx
    const actor = staffActor(ctx)
    const { projectId } = ctx.req.params as { projectId: string }
    const created = await createEstimate(tx, actor, { projectId, authoringMethod: 'written' })
    const requests = await tx.selectFrom('intake.requests').select('id').where('project_id', '=', projectId).execute()
    for (const r of requests) await syncEstimateItem(tx, r.id)
    await ctx.audit({
      target: { type: 'estimate_version', id: created.versionId, version: 1 },
      summary: {
        estimateId: created.estimateId,
        number: created.number,
        projectId,
        version: created.version,
        authoringMethod: 'written',
      },
    })
    return { status: 201, body: { ...created, rowVersion: 1 }, version: 1 }
  },
}

const read: RouteDef = {
  method: 'GET',
  path: '/staff/estimate-versions/:versionId',
  operationId: 'getEstimateVersion',
  summary: 'Estimate builder',
  description:
    'Staff with estimate.draft. One version as the builder shows it: lines per work package with server-computed ' +
    'amounts, options, texts, the discount row and total, the deposit state, the project, customer and property, ' +
    'the issuer name, mailing address (null: the line is omitted), validity and terms from configuration (null while ' +
    'NOT CONFIGURED) and the publish readiness with its reasons. Internal costs and notes only with ' +
    'estimate.view_internal_cost. The ETag is the row version for If-Match on save.',
  actors: ['staff'],
  permission: 'estimate.draft',
  kind: 'read',
  idempotency: 'none',
  expectedVersion: 'none',
  rateLimit: 'none',
  audit: 'none',
  pagination: false,
  test: TEST,
  resource: versionProjectOf,
  schema: { params: VERSION_PARAMS, response: { 200: VERSION_VIEW } },
  handler: async (ctx) => {
    const { versionId } = ctx.req.params as { versionId: string }
    const view = await builderView(ctx.db, staffActor(ctx), versionId)
    return { body: view, version: view.rowVersion }
  },
}

const save: RouteDef = {
  method: 'PUT',
  path: '/staff/estimate-versions/:versionId/draft',
  operationId: 'saveEstimateDraft',
  summary: 'Save the estimate draft',
  description:
    'Staff with estimate.draft, on a draft or in-review version of an open project (else 409 PROJECT_NOT_OPEN), ' +
    'with If-Match: the row version shown. Replaces the whole content (lines in order, options, texts, discount ' +
    'category; internal costs and notes only with estimate.view_internal_cost, kept when left out). The server ' +
    'computes every line amount half-up and the totals ' +
    'from the active configuration; client amounts are never read. An incomplete draft is saved with its totals ' +
    'empty; an invalid value is refused with field errors and nothing is stored. Returns the builder view.',
  actors: ['staff'],
  permission: 'estimate.draft',
  kind: 'write',
  idempotency: 'required',
  expectedVersion: 'required',
  rateLimit: 'none',
  audit: 'estimate.save_draft',
  pagination: false,
  test: TEST,
  resource: versionProjectOf,
  schema: { params: VERSION_PARAMS, body: DRAFT_BODY, response: { 200: VERSION_VIEW } },
  handler: async (ctx) => {
    const tx = ctx.tx as Tx
    const actor = staffActor(ctx)
    const { versionId } = ctx.req.params as { versionId: string }
    const body = ctx.req.body as DraftInput
    const out = await saveDraft(tx, actor, versionId, body, { expectedRowVersion: ctx.expectedVersion() })
    const view: BuilderView = await builderView(tx, actor, versionId)
    await ctx.audit({
      target: { type: 'estimate_version', id: versionId, version: out.rowVersion },
      summary: {
        estimateNumber: view.estimateNumber,
        lines: body.lines.length,
        complete: out.complete,
        totalCents: view.totals?.totalCents ?? null,
        discountCategory: view.discountCategory,
        internalWritten: body.internal !== undefined || body.lines.some((l) => l.internalCost !== undefined),
        readiness: view.readiness.problems.map((p) => (p.key ? `${p.code}:${p.key}` : p.code)),
      },
    })
    return { body: view, version: out.rowVersion }
  },
}

export const ESTIMATE_ROUTES: readonly RouteDef[] = [list, ofProject, write, read, save]
