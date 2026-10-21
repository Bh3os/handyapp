// Loadouts module (TSK-0071; HH-PKT-05, HH-PKT-06, HH-WORK-01, HH-WORK-02, HH-CHG-02, T43, T45, ENT-WorkPackage,
// ENT-Hold, ENT-ChangeOrder, ENT-AuditEvent, OQ-LOADOUT-DETAILS, RULE-SAFETY-GATES, RULE-SERVER-AUTHZ,
// RULE-NO-INVENTED-FACTS).
//   GET  /staff/jobs/:jobId/loadout                          each work package's list, item states, readiness, blocks
//   POST /staff/jobs/:jobId/loadout/checks                   a worker states loaded / missing / damaged per item
//   POST /staff/loadout-blocks/:holdId/actions/start-review  the Owner or Office starts reviewing a task block
//   POST /staff/loadout-blocks/:holdId/actions/resolve       the Owner resolves it: item provided, or approved substitute
//   POST /staff/loadout-blocks/:holdId/actions/cancel        the Owner cancels one entered in error
// - The list of each work package is the loadout version pinned on it (imported verbatim from the service's
//   FACT-INVENTORY node; no quantity is ever added). PROPOSED (OQ-LOADOUT-DETAILS): every item required.
// - Authorization: reading uses job.view_packet (the packet's row: Owner and Office Y, Estimator P, Worker A, inside
//   the access window); stating uses job.record_loadout (PROPOSED in the field-records row: Owner and Worker, assigned
//   jobs only); the block actions use the job-level Hold / Ready cells (start review job_hold.set; resolve and cancel
//   job_hold.set_ready: the Owner). A worker reaches only the jobs of their own live assignments.
// - A missing or damaged required item raises a task block on its work package in the same transaction as the
//   statement, under the job's lock (the job row, then the packet's advisory lock), and the packet gets a new version
//   with the block; Start Work stays blocked for that package only (migration 0063 refuses in_progress). Nothing a
//   worker states later releases it: only the Owner's recorded resolution (the item confirmed loaded after the block,
//   or a named substitute with what it affects) or a cancellation as entered in error. A substitute that affects the
//   customer is a change order (HH-CHG-02): NOT CONFIGURED until change orders exist, so it is refused. The generic
//   hold routes never touch a task block (they handle intake review holds only), and no override exists.
// - Every statement and every block change is audited; the notes stay on the records, never in the audit summary.
import type { Tx } from '@handyhub/db'
import {
  apply,
  BLOCKING_HOLD_STATES,
  type HoldState,
  loadoutItems,
  loadoutReadiness,
  type LoadoutReport,
  type LoadoutStatus,
  raisesTaskBlock,
  SUBSTITUTE_IMPACTS,
  TASK_BLOCK_OWNER,
  TASK_BLOCK_RESOLUTIONS,
  taskBlockResolutionProblems,
  type TaskBlockResolution,
} from '@handyhub/domain'
import { decide, type StaffActor } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError } from '../../api/errors.js'
import type { ApiContext, ApiModule, RouteDef } from '../../api/route.js'
import { jobInScope } from '../../platform/data-scope.js'
import { jobAssignments } from '../packets/assignments.js'
import { refreshJobPacket } from '../packets/content.js'
import {
  isBlocking,
  latestChecks,
  loadoutPackages,
  syncShortageItem,
  taskBlocks,
  type LatestCheck,
  type LoadoutPackage,
  type TaskBlock,
} from './store.js'

export { ensureLoadoutPins, latestChecks, loadoutPackages, taskBlocks } from './store.js'

const TEST = 'test/integration/loadouts.test.ts'
const UUID = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
const UUID_RE = new RegExp(UUID)

const STR = { type: 'string' } as const
const STR_OR_NULL = { type: ['string', 'null'] } as const
const INT = { type: 'integer' } as const
const INT_OR_NULL = { type: ['integer', 'null'] } as const
const BOOL = { type: 'boolean' } as const
const TIME = { type: 'string', format: 'date-time' } as const
const TIME_OR_NULL = { type: ['string', 'null'], format: 'date-time' } as const
const arr = (items: unknown) => ({ type: 'array', items }) as const
const obj = (properties: Record<string, unknown>, nullable = false) =>
  ({
    type: nullable ? ['object', 'null'] : 'object',
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  }) as const
const TEXT = (max: number) => ({ type: 'string', minLength: 1, maxLength: max, pattern: '\\S' }) as const
const STAFF_REF = obj({ id: STR, name: STR_OR_NULL })
const LINES = obj({ lines: arr(STR), line: INT_OR_NULL })

const JOB_PARAMS = obj({ jobId: { type: 'string', pattern: UUID } })
const HOLD_PARAMS = obj({ holdId: { type: 'string', pattern: UUID } })

const ITEM_STATE = obj(
  {
    status: { type: 'string', enum: ['loaded', 'missing', 'damaged', 'substitute_approved'] },
    note: STR_OR_NULL,
    substitute: STR_OR_NULL,
    impacts: { type: ['array', 'null'], items: STR },
    recordedBy: STAFF_REF,
    recordedAt: TIME,
  },
  true,
)
const BLOCK = obj({
  holdId: STR,
  workPackageId: STR,
  itemKey: STR,
  itemName: STR_OR_NULL,
  state: { type: 'string', enum: ['open', 'under_review', 'resolved', 'canceled_as_error'] },
  version: INT,
  note: STR,
  raisedBy: STAFF_REF,
  raisedAt: TIME,
  reviewStartedAt: TIME_OR_NULL,
  resolutionNote: STR_OR_NULL,
  reviewer: STR_OR_NULL,
  resolvedAt: TIME_OR_NULL,
  cancelReason: STR_OR_NULL,
  canceledAt: TIME_OR_NULL,
  owner: obj({ role: STR, action: STR }),
  actions: obj({ startReview: BOOL, resolve: BOOL, cancel: BOOL }),
})
const LOADOUT_VIEW = obj({
  jobId: STR,
  projectReference: STR,
  packetVersion: INT,
  packages: arr(
    obj({
      workPackageId: STR,
      serviceId: STR,
      serviceCode: STR,
      position: INT,
      state: STR,
      loadout: obj({ loadoutVersionId: STR, inventoryId: STR, version: INT, sourceFile: STR, pinnedAt: TIME }, true),
      readiness: obj({
        state: { type: 'string', enum: ['ready', 'not_confirmed', 'blocked', 'not_configured'] },
        unconfirmed: arr(STR),
        reported: arr(STR),
        blocks: arr(STR),
      }),
      groups: arr(
        obj({
          heading: STR_OR_NULL,
          line: INT_OR_NULL,
          notes: arr(LINES),
          items: arr(
            obj({
              key: STR,
              name: STR_OR_NULL,
              lines: arr(STR),
              line: INT_OR_NULL,
              criticality: STR,
              category: STR,
              current: ITEM_STATE,
            }),
          ),
        }),
      ),
      proposed: { ...LINES, type: ['object', 'null'] },
      blocks: arr(BLOCK),
    }),
  ),
  actions: obj({ record: BOOL }),
})

const CHECKS_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['workPackageId', 'items'],
  properties: {
    workPackageId: { type: 'string', pattern: UUID },
    items: {
      type: 'array',
      minItems: 1,
      maxItems: 200,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'status'],
        properties: {
          key: { type: 'string', pattern: '^[0-9]{1,4}$' },
          status: { type: 'string', enum: ['loaded', 'missing', 'damaged'] },
          note: TEXT(1000),
        },
      },
    },
  },
} as const
const CHECKS_RESULT = obj({
  recorded: INT,
  blocksRaised: arr(STR),
  blocksOpen: arr(STR),
  readiness: { type: 'string', enum: ['ready', 'not_confirmed', 'blocked', 'not_configured'] },
  packetVersion: INT,
})
const BLOCK_RESULT = obj({ holdId: STR, state: STR, version: INT, jobId: STR, packetVersion: INT })

function staff(ctx: ApiContext): StaffActor {
  if (ctx.actor.kind !== 'staff') throw new ApiError('FORBIDDEN')
  return ctx.actor
}

const allowed = (actor: StaffActor, action: 'job_hold.set' | 'job_hold.set_ready', projectId: string) =>
  decide(actor, action, { projectId }, { now: new Date(), online: true }).effect === 'allow'

/** The record facts of a job (its project and assignments): the A cells decide on them. */
const jobFacts: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { jobId } = req.params as { jobId: string }
  if (!UUID_RE.test(jobId)) return null
  const job = await db.selectFrom('work.jobs').select('project_id').where('id', '=', jobId).executeTakeFirst()
  return job ? { projectId: job.project_id, assignments: await jobAssignments(db, jobId) } : null
}

/** The record facts of a task block: its job's project and assignments. */
const blockFacts: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { holdId } = req.params as { holdId: string }
  if (!UUID_RE.test(holdId)) return null
  const h = await db
    .selectFrom('work.holds as h')
    .innerJoin('work.work_packages as w', 'w.id', 'h.scope_id')
    .select(['h.project_id', 'w.job_id'])
    .where('h.id', '=', holdId)
    .where('h.kind', '=', 'task_block')
    .executeTakeFirst()
  if (!h?.job_id) return null
  return { projectId: h.project_id, assignments: await jobAssignments(db, h.job_id) }
}

/** The job inside the caller's scope (else NOT_FOUND: an altered ID finds nothing). */
async function scopedJob(ctx: ApiContext, db: ApiContext['db'] | Tx, jobId: string) {
  const job = await db
    .selectFrom('work.jobs as j')
    .innerJoin('crm.projects as p', 'p.id', 'j.project_id')
    .select(['j.id', 'j.project_id', 'p.reference'])
    .where('j.id', '=', jobId)
    .where(jobInScope('j.id', ctx.scope))
    .executeTakeFirst()
  if (!job) throw new ApiError('NOT_FOUND')
  return job
}

/** The job's row lock: the lock hazard reports and task blocks are written under (RULE-SAFETY-GATES). */
async function lockJob(tx: Tx, jobId: string) {
  await tx.selectFrom('work.jobs').select('id').where('id', '=', jobId).forUpdate().execute()
}

const latestMap = (checks: readonly LatestCheck[], workPackageId: string) =>
  new Map(checks.filter((c) => c.workPackageId === workPackageId).map((c) => [c.itemKey, c.status as LoadoutStatus]))

function readinessOf(p: LoadoutPackage, checks: readonly LatestCheck[], blocks: readonly TaskBlock[]) {
  return loadoutReadiness({
    content: p.pin?.content ?? null,
    latest: latestMap(checks, p.workPackageId),
    blockingHolds: blocks.filter((b) => b.workPackageId === p.workPackageId && isBlocking(b)).map((b) => b.id),
  })
}

const itemNameOf = (p: LoadoutPackage | undefined, key: string) =>
  (p?.pin ? loadoutItems(p.pin.content).find((i) => i.key === key)?.name : null) ?? null

function blockView(actor: StaffActor, b: TaskBlock, pkg: LoadoutPackage | undefined) {
  const set = allowed(actor, 'job_hold.set', b.projectId)
  const ready = allowed(actor, 'job_hold.set_ready', b.projectId)
  return {
    holdId: b.id,
    workPackageId: b.workPackageId,
    itemKey: b.itemKey,
    itemName: itemNameOf(pkg, b.itemKey),
    state: b.state,
    version: b.version,
    note: b.note,
    raisedBy: b.raisedBy,
    raisedAt: b.raisedAt,
    reviewStartedAt: b.reviewStartedAt,
    resolutionNote: b.resolutionNote,
    reviewer: b.reviewer,
    resolvedAt: b.resolvedAt,
    cancelReason: b.cancelReason,
    canceledAt: b.canceledAt,
    owner: { role: TASK_BLOCK_OWNER.role, action: TASK_BLOCK_OWNER.action },
    actions: {
      startReview: set && b.state === 'open',
      resolve: ready && b.state === 'under_review',
      cancel: ready && isBlocking(b),
    },
  }
}

const conflict = (codes: readonly string[]) =>
  new ApiError('CONFLICT', { fieldErrors: codes.map((code) => ({ field: 'body', code, message: '' })) })

export function loadoutsModule(): ApiModule {
  const view: RouteDef = {
    method: 'GET',
    path: '/staff/jobs/:jobId/loadout',
    operationId: 'getJobLoadout',
    summary: "A job's loadout: what to load per work package, what was stated, and what blocks",
    description:
      'Staff with job.view_packet inside their scope (as for the job packet: the Owner and Office; the Estimator ' +
      '(PROPOSED cell); a worker only while assigned to a live visit of the job). The server first brings the ' +
      "packet up to date, which pins each package's loadout version once. For each work package: the list as the " +
      'vault inventory file writes it (its groups, items with their vault line, review notes and the proposed ' +
      "additions, which are not approved and never items), PROPOSED every item required; each item's latest " +
      'statement (loaded, missing, damaged, or an approved substitute) with who and when; the readiness Start Work ' +
      'reads (ready, not confirmed, blocked, or NOT CONFIGURED when the service has no list); and the task blocks ' +
      'with their owner, action and what the caller may do. No quantity is ever added.',
    actors: ['staff'],
    permission: 'job.view_packet',
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'none',
    pagination: false,
    test: TEST,
    resource: jobFacts,
    schema: { params: JOB_PARAMS, response: { 200: LOADOUT_VIEW } },
    handler: async (ctx) => {
      const actor = staff(ctx)
      const { jobId } = ctx.req.params as { jobId: string }
      const job = await scopedJob(ctx, ctx.db, jobId)
      const packet = await refreshJobPacket(ctx.db, jobId)
      if (!packet) throw new ApiError('NOT_FOUND')
      const [packages, checks, blocks] = await Promise.all([
        loadoutPackages(ctx.db, jobId),
        latestChecks(ctx.db, jobId),
        taskBlocks(ctx.db, jobId),
      ])
      const record =
        decide(
          actor,
          'job.record_loadout',
          { projectId: job.project_id, assignments: await jobAssignments(ctx.db, jobId) },
          {
            now: new Date(),
            online: true,
          },
        ).effect === 'allow'
      return {
        body: {
          jobId,
          projectReference: job.reference,
          packetVersion: packet.version,
          packages: packages.map((p) => {
            const current = new Map(
              checks.filter((c) => c.workPackageId === p.workPackageId).map((c) => [c.itemKey, c]),
            )
            return {
              workPackageId: p.workPackageId,
              serviceId: p.serviceId,
              serviceCode: p.serviceCode,
              position: p.position,
              state: p.state,
              loadout: p.pin
                ? {
                    loadoutVersionId: p.pin.loadoutVersionId,
                    inventoryId: p.pin.inventoryId,
                    version: p.pin.version,
                    sourceFile: p.pin.sourceFile,
                    pinnedAt: p.pin.pinnedAt,
                  }
                : null,
              readiness: readinessOf(p, checks, blocks),
              groups: (p.pin?.content.groups ?? []).map((g) => ({
                heading: g.heading,
                line: g.line,
                notes: g.notes,
                items: g.items.map((i) => {
                  const c = current.get(i.key)
                  return {
                    ...i,
                    current: c
                      ? {
                          status: c.status,
                          note: c.note,
                          substitute: c.substitute,
                          impacts: c.impacts,
                          recordedBy: c.recordedBy,
                          recordedAt: c.recordedAt,
                        }
                      : null,
                  }
                }),
              })),
              proposed: p.pin?.content.proposed ?? null,
              blocks: blocks.filter((b) => b.workPackageId === p.workPackageId).map((b) => blockView(actor, b, p)),
            }
          }),
          actions: { record },
        },
        headers: { 'cache-control': 'no-store' },
      }
    },
  }

  const record: RouteDef = {
    method: 'POST',
    path: '/staff/jobs/:jobId/loadout/checks',
    operationId: 'recordLoadoutChecks',
    summary: 'State what is loaded, missing or damaged',
    description:
      'Staff with job.record_loadout (PROPOSED in the field-records row: the Owner and workers, assigned jobs only, ' +
      'inside the access window). For one work package of the job, states per item: loaded (loaded and available), ' +
      'missing or damaged, with an optional note. A missing or damaged required item raises a task block on that ' +
      'work package in the same transaction, under the job lock (one per item while it blocks), with its owner and ' +
      'action (the Owner provides the item or approves a substitute), and the packet gets a new version. Start Work ' +
      'stays blocked for that package only. A later "loaded" is recorded but releases nothing: only the Owner\'s ' +
      'recorded resolution does. Each item once per call; only items of the pinned list. Audited (counts only).',
    actors: ['staff'],
    permission: 'job.record_loadout',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'loadout.check',
    pagination: false,
    test: TEST,
    resource: jobFacts,
    schema: { params: JOB_PARAMS, body: CHECKS_BODY, response: { 201: CHECKS_RESULT } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staff(ctx)
      const { jobId } = ctx.req.params as { jobId: string }
      const body = ctx.req.body as {
        workPackageId: string
        items: { key: string; status: LoadoutReport; note?: string }[]
      }
      const job = await scopedJob(ctx, tx, jobId)
      await lockJob(tx, jobId)
      // Pins the list first (a job read for the first time gets its versions now).
      await refreshJobPacket(tx, jobId)
      const pkg = (await loadoutPackages(tx, jobId)).find((p) => p.workPackageId === body.workPackageId)
      if (!pkg)
        throw new ApiError('VALIDATION_FAILED', {
          fieldErrors: [{ field: 'body.workPackageId', code: 'unknown_work_package', message: '' }],
        })
      if (!pkg.pin) throw conflict(['NOT_CONFIGURED'])
      const items = new Map(loadoutItems(pkg.pin.content).map((i) => [i.key, i]))
      const seen = new Set<string>()
      for (const [n, i] of body.items.entries()) {
        if (!items.has(i.key) || seen.has(i.key))
          throw new ApiError('VALIDATION_FAILED', {
            fieldErrors: [
              { field: `body.items.${n}.key`, code: seen.has(i.key) ? 'duplicate' : 'UNKNOWN_ITEM', message: '' },
            ],
          })
        seen.add(i.key)
      }
      const open = new Map(
        (await taskBlocks(tx, jobId))
          .filter((b) => b.workPackageId === pkg.workPackageId && isBlocking(b))
          .map((b) => [b.itemKey, b.id]),
      )
      const raised: string[] = []
      const counts = { loaded: 0, missing: 0, damaged: 0 }
      for (const i of body.items) {
        const item = items.get(i.key)
        if (!item) continue
        const note = i.note?.trim() || null
        let holdId: string | null = null
        if (raisesTaskBlock(item.criticality, i.status)) {
          holdId = open.get(i.key) ?? null
          if (!holdId) {
            // What was seen, as the worker stated it; the item's own name from the list names what is short.
            const what = item.name ?? item.lines[0] ?? `#${item.key}`
            const h = await tx
              .insertInto('work.holds')
              .values({
                kind: 'task_block',
                scope_type: 'work_package',
                scope_id: pkg.workPackageId,
                project_id: job.project_id,
                category: 'critical_resource',
                note: (note ? `${what}: ${note}` : what).slice(0, 1000),
                source: 'loadout',
                source_ref: `item:${item.key}`,
                raised_by: actor.userId,
              })
              .returning('id')
              .executeTakeFirstOrThrow()
            holdId = h.id
            open.set(i.key, h.id)
            raised.push(h.id)
          }
        }
        await tx
          .insertInto('work.loadout_checks')
          .values({
            work_package_id: pkg.workPackageId,
            project_id: job.project_id,
            job_id: jobId,
            loadout_version_id: pkg.pin.loadoutVersionId,
            item_key: item.key,
            status: i.status,
            note,
            hold_id: holdId,
            recorded_by: actor.userId,
          })
          .execute()
        counts[i.status]++
      }
      await syncShortageItem(tx, jobId)
      const packet = await refreshJobPacket(tx, jobId)
      const readiness = readinessOf(pkg, await latestChecks(tx, jobId), await taskBlocks(tx, jobId))
      await ctx.audit({
        target: { type: 'work_package', id: pkg.workPackageId, version: pkg.pin.version },
        summary: { jobId, ...counts, blocksRaised: raised.length, readiness: readiness.state },
      })
      return {
        status: 201,
        body: {
          recorded: body.items.length,
          blocksRaised: raised,
          blocksOpen: [...readiness.blocks],
          readiness: readiness.state,
          packetVersion: packet?.version ?? 0,
        },
      }
    },
  }

  type BlockEvent = 'start_review' | 'resolve' | 'cancel_as_error'
  type BlockBody = {
    resolution?: TaskBlockResolution
    resolutionNote?: string
    reviewer?: string
    substitute?: string
    impacts?: string[]
    customerAffected?: boolean
    reason?: string
  }

  /** Applies one task-block event under the job's lock and the block's row lock. */
  async function moveBlock(ctx: ApiContext, event: BlockEvent, body: BlockBody) {
    const tx = ctx.tx as Tx
    const actor = staff(ctx)
    const { holdId } = ctx.req.params as { holdId: string }
    const scope = await tx
      .selectFrom('work.holds as h')
      .innerJoin('work.work_packages as w', 'w.id', 'h.scope_id')
      .select(['w.job_id'])
      .where('h.id', '=', holdId)
      .where('h.kind', '=', 'task_block')
      .executeTakeFirst()
    if (!scope?.job_id) throw new ApiError('NOT_FOUND')
    const jobId = scope.job_id
    await scopedJob(ctx, tx, jobId)
    await lockJob(tx, jobId)
    const hold = await tx
      .selectFrom('work.holds')
      .selectAll()
      .where('id', '=', holdId)
      .forUpdate()
      .executeTakeFirstOrThrow()
    const expected = ctx.expectedVersion()
    if (expected !== hold.version)
      throw new ApiError('STALE_VERSION', { current: { version: hold.version, values: { state: hold.state } } })
    const resolutionNote = body.resolutionNote?.trim()
    const reviewer = body.reviewer?.trim()
    const reason = body.reason?.trim()
    const result = apply({ machine: 'hold.lifecycle', state: hold.state as HoldState, version: hold.version }, event, {
      actor: 'staff',
      expectedVersion: hold.version,
      now: new Date(),
      facts: {
        kind: 'task_block',
        raisedBy: hold.raised_by,
        actorId: actor.userId,
        ...(resolutionNote !== undefined ? { resolutionNote } : {}),
        ...(reviewer !== undefined ? { reviewer } : {}),
        ...(reason !== undefined ? { reason } : {}),
      },
    })
    if (!result.ok) throw conflict(result.problems.length ? result.problems.map((p) => p.code) : [result.code])
    const itemKey = hold.source_ref.slice('item:'.length)
    let substituteRecorded = false
    if (event === 'resolve') {
      const resolution = body.resolution as TaskBlockResolution
      const loadedAfter = await tx
        .selectFrom('work.loadout_checks')
        .select('id')
        .where('work_package_id', '=', hold.scope_id)
        .where('item_key', '=', itemKey)
        .where('status', '=', 'loaded')
        .where('recorded_at', '>=', hold.raised_at)
        .orderBy('recorded_at', 'desc')
        .limit(1)
        .executeTakeFirst()
      // The latest statement must be that "loaded": a later "missing" again is not provided.
      const latest = (await latestChecks(tx, jobId)).find(
        (c) => c.workPackageId === hold.scope_id && c.itemKey === itemKey,
      )
      const problems = taskBlockResolutionProblems({
        resolution,
        loadedAfterBlock: Boolean(loadedAfter) && latest?.status === 'loaded',
        substitute: body.substitute,
        impacts: body.impacts,
        customerAffected: body.customerAffected,
      })
      if (problems.length) throw conflict(problems)
      if (resolution === 'substitute_approved') {
        const pin = await tx
          .selectFrom('work.work_package_loadouts')
          .select(['loadout_version_id'])
          .where('work_package_id', '=', hold.scope_id)
          .executeTakeFirstOrThrow()
        await tx
          .insertInto('work.loadout_checks')
          .values({
            work_package_id: hold.scope_id,
            project_id: hold.project_id,
            job_id: jobId,
            loadout_version_id: pin.loadout_version_id,
            item_key: itemKey,
            status: 'substitute_approved',
            note: resolutionNote ?? null,
            substitute: (body.substitute ?? '').trim(),
            impacts: [...new Set(body.impacts ?? [])].sort(),
            hold_id: holdId,
            recorded_by: actor.userId,
          })
          .execute()
        substituteRecorded = true
      }
    }
    const now = sql<Date>`now()`
    await tx
      .updateTable('work.holds')
      .set({
        state: result.to,
        version: result.version,
        ...(event === 'start_review' ? { review_started_by: actor.userId, review_started_at: now } : {}),
        ...(event === 'resolve'
          ? {
              resolution_note: resolutionNote ?? null,
              reviewer: reviewer ?? null,
              resolved_by: actor.userId,
              resolved_at: now,
            }
          : {}),
        ...(event === 'cancel_as_error'
          ? { cancel_reason: reason ?? null, canceled_by: actor.userId, canceled_at: now }
          : {}),
      })
      .where('id', '=', holdId)
      .execute()
    await syncShortageItem(tx, jobId)
    const packet = await refreshJobPacket(tx, jobId)
    // The notes, the reviewer's name and the substitute stay on the records; the audit records the change.
    await ctx.audit({
      target: { type: 'hold', id: holdId, version: result.version },
      summary: {
        event,
        from: hold.state,
        to: result.to,
        kind: 'task_block',
        jobId,
        workPackageId: hold.scope_id,
        itemKey,
        ...(event === 'resolve' ? { resolution: body.resolution, substituteRecorded } : {}),
        ...(substituteRecorded ? { impacts: [...new Set(body.impacts ?? [])].sort() } : {}),
      },
    })
    return {
      body: { holdId, state: result.to, version: result.version, jobId, packetVersion: packet?.version ?? 0 },
      version: result.version,
    }
  }

  const blockRoute = (
    def: Pick<RouteDef, 'path' | 'operationId' | 'summary' | 'description' | 'permission' | 'audit'> & {
      body: Record<string, unknown>
      event: BlockEvent
    },
  ): RouteDef => ({
    method: 'POST',
    path: def.path,
    operationId: def.operationId,
    summary: def.summary,
    description: def.description,
    actors: ['staff'],
    permission: def.permission,
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'required',
    rateLimit: 'none',
    audit: def.audit,
    pagination: false,
    test: TEST,
    resource: blockFacts,
    schema: { params: HOLD_PARAMS, body: def.body, response: { 200: BLOCK_RESULT } },
    handler: (ctx) => moveBlock(ctx, def.event, ctx.req.body as BlockBody),
  })

  const startReview = blockRoute({
    path: '/staff/loadout-blocks/:holdId/actions/start-review',
    operationId: 'startLoadoutBlockReview',
    summary: 'Start reviewing a task block',
    description:
      'Staff with job_hold.set (the Owner; Office and Estimator PROPOSED) inside their scope. Moves an open task ' +
      'block to "under review"; it still blocks Start Work on its work package. If-Match is the block version.',
    permission: 'job_hold.set',
    audit: 'loadout.block_start_review',
    event: 'start_review',
    body: { type: 'object', additionalProperties: false, properties: {} },
  })
  const resolve = blockRoute({
    path: '/staff/loadout-blocks/:holdId/actions/resolve',
    operationId: 'resolveLoadoutBlock',
    summary: 'Resolve a task block under review',
    description:
      'The Owner (job_hold.set_ready; PROPOSED for task blocks). With a note saying how it was resolved and who ' +
      'assessed it, either: item_provided (the item was stated loaded after the block was raised and is still ' +
      'loaded) or substitute_approved (the substitute named, never "equivalent", with what it affects: safety, ' +
      'appearance, specification, price, warranty). A substitute that affects the customer is a change order ' +
      '(HH-CHG-02), NOT CONFIGURED until change orders exist: refused with CHANGE_ORDER_REQUIRED. No checkbox, ' +
      'timer, acknowledgment or AI output clears a block.',
    permission: 'job_hold.set_ready',
    audit: 'loadout.block_resolve',
    event: 'resolve',
    body: {
      type: 'object',
      additionalProperties: false,
      required: ['resolution', 'resolutionNote', 'reviewer'],
      properties: {
        resolution: { type: 'string', enum: [...TASK_BLOCK_RESOLUTIONS] },
        resolutionNote: TEXT(2000),
        reviewer: TEXT(200),
        substitute: TEXT(300),
        impacts: {
          type: 'array',
          maxItems: 5,
          uniqueItems: true,
          items: { type: 'string', enum: [...SUBSTITUTE_IMPACTS] },
        },
        customerAffected: BOOL,
      },
    },
  })
  const cancel = blockRoute({
    path: '/staff/loadout-blocks/:holdId/actions/cancel',
    operationId: 'cancelLoadoutBlockAsError',
    summary: 'Cancel a task block entered in error',
    description:
      'The Owner (job_hold.set_ready). Only for a block entered in error, with the reason; the block, the ' +
      'worker\'s statement and the reason stay in the history. The item still needs a "loaded" statement before ' +
      'its package is ready.',
    permission: 'job_hold.set_ready',
    audit: 'loadout.block_cancel',
    event: 'cancel_as_error',
    body: { type: 'object', additionalProperties: false, required: ['reason'], properties: { reason: TEXT(1000) } },
  })

  return { name: 'loadouts', routes: [view, record, startReview, resolve, cancel] }
}

/** Every task block that blocks the job's work packages (the Start Work gate's read, TSK-0073). */
export async function blockingTaskBlocks(db: ApiContext['db'] | Tx, jobId: string): Promise<TaskBlock[]> {
  return (await taskBlocks(db, jobId)).filter((b) => (BLOCKING_HOLD_STATES as readonly string[]).includes(b.state))
}
