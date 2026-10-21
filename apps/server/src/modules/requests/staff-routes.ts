// Staff request routes (TSK-0042; HH-LEAD-01, HH-LEAD-02, HH-LEAD-08, HH-SVC-04, OWN-DEC-99, OWN-DEC-100,
// OWN-DEC-116, HH-STATE-01, HH-STATE-02, RULE-SERVER-AUTHZ).
//
// Reads: the requests list, one request's full view (staff-record.ts) and the staff who may be made responsible.
// Writes, each in one transaction with its audit event, under the request's row lock:
// - assign the one responsible staff member (every reassignment kept);
// - record the qualification (a new revision; AI classification stays off);
// - add an internal note (staff only);
// - the four actions. Each is one named request event (no "set status"), checked by @handyhub/domain against the
//   current state and version (If-Match); a received request is moved to review in the same transaction first.
//   * Ask a Question moves the request to "needs information". Writing and publishing the questions, and the
//     automatic notice that publishing sends, belong to TSK-0051: this sends no customer message and only records
//     the request.information_requested event for it.
//   * Prepare Online Estimate and Arrange Estimate Visit need the qualification recorded, create one work package per
//     service of the one project (HH-SVC-04) and move the request on. The estimate (TSK-0052, TSK-0053) and the
//     estimate-visit windows (TSK-0063) are built later: nothing is booked and no message is sent; the
//     request.ready_for_estimate and request.site_visit_required events wait for them.
//   * Not a Fit needs its reason category and the plain-language reason the customer sees; an internal note stays
//     staff-only. If work was accepted, an appointment exists or money was received, the project is routed to the
//     Owner for cancellation and financial review (an Owner Decisions item) and nothing closes. Otherwise the request
//     and project close, the history stays, and decision.not_a_fit_published is recorded for the automatic notice
//     (FACT-AUTOMATIC-MESSAGES row 7), which sends only once its template is released.
// None of these stops the first-response clock (TSK-0043, OWN-DEC-116): the new-request queue item stays, due at the
// internal target, until a meaningful response is sent or a completed customer conversation is recorded here.
// TSK-0043: risk flags needing attention name the potential hazards found, each of which opens a review hold; a
// blocking review hold refuses both estimating routes (holds.ts).
import { apply, ACTION_EVENTS, NOT_A_FIT_EVENTS, type NotAFitCategory, type RequestState } from '@handyhub/domain'
import type { Tx } from '@handyhub/db'
import { heldScopes, type DataScope, type StaffActor } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError } from '../../api/errors.js'
import { instantIdCursor, pageSchema, toPage } from '../../api/pagination.js'
import type { ApiContext, RouteDef } from '../../api/route.js'
import { projectInScope } from '../../platform/data-scope.js'
import { outbox } from '../../platform/outbox.js'
import { currentContext } from '../../platform/request-context.js'
import { syncDeliveryFailureOwner } from '../notifications/index.js'
import { openQueueItem, syncEstimateItem, syncNewRequestItem } from '../queue/index.js'
import { DEFAULT_OBLIGATION_CHECKS, obligationFacts, type ObligationCheck } from './obligations.js'
import { latestQualification, staffRequestView } from './staff-record.js'
import {
  HAZARD_CATEGORIES,
  looksLikeCardNumber,
  NOTE_VISIBILITIES,
  type NoteVisibility,
  qualificationProblems,
  unqualifiedChecks,
  type Qualification,
} from '@handyhub/domain'
import { CLOCK_SCHEMA, responseClockView } from './clock-view.js'
import { blockingReviewHolds, holdRoutes, openFlaggedHolds, syncReviewHoldItem } from './holds.js'
import { recordResponseEvent, responseReport } from './response-clock.js'
import {
  ACTION_RESULT,
  DETAIL,
  INTERNAL_NOTE,
  LIST_ITEM,
  QUALIFICATION_BODY,
  REQUEST_PARAMS,
  UUID,
  WORK_PACKAGES,
} from './staff-schemas.js'

const TEST = 'test/integration/staff-requests.test.ts'
const STATE_FILTERS = ['open', 'closed', 'received', 'needs_information', 'needs_site_visit', 'ready_for_estimate']
const OPEN_STATES = ['received', 'reviewing', 'needs_information', 'needs_site_visit', 'ready_for_estimate']

const projectOf: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { requestId } = req.params as { requestId: string }
  const r = await db.selectFrom('intake.requests').select('project_id').where('id', '=', requestId).executeTakeFirst()
  return r ? { projectId: r.project_id } : null
}

function staffActor(ctx: ApiContext): StaffActor {
  if (ctx.actor.kind !== 'staff') throw new ApiError('FORBIDDEN')
  return ctx.actor
}

function requestIdOf(ctx: ApiContext): string {
  return (ctx.req.params as { requestId: string }).requestId
}

function correlation(ctx: ApiContext): string {
  return currentContext()?.requestId ?? ctx.req.id
}

const optionalNote = (note: string | undefined) => (note && note.trim() !== '' ? note.trim() : null)

type Locked = {
  id: string
  reference: string
  state: RequestState
  version: number
  projectId: string
  projectState: string
  projectVersion: number
  responsibleStaffId: string | null
}

/** The request and its project, locked for this transaction (request first, then project: one order everywhere). */
/** Locks a request inside the caller's scope (TSK-0037): outside it, or unknown, NOT_FOUND and nothing changes. */
async function lockRequest(tx: Tx, scope: DataScope, requestId: string): Promise<Locked> {
  const r = await tx
    .selectFrom('intake.requests')
    .select(['id', 'reference', 'state', 'state_version', 'project_id', 'responsible_staff_id'])
    .where('id', '=', requestId)
    .where(projectInScope('project_id', scope))
    .forUpdate()
    .executeTakeFirst()
  if (!r) throw new ApiError('NOT_FOUND')
  const p = await tx
    .selectFrom('crm.projects')
    .select(['state', 'state_version'])
    .where('id', '=', r.project_id)
    .forUpdate()
    .executeTakeFirstOrThrow()
  return {
    id: r.id,
    reference: r.reference,
    state: r.state as RequestState,
    version: r.state_version,
    projectId: r.project_id,
    projectState: p.state,
    projectVersion: p.state_version,
    responsibleStaffId: r.responsible_staff_id,
  }
}

function stale(current: Locked): ApiError {
  return new ApiError('STALE_VERSION', {
    current: {
      version: current.version,
      values: { state: current.state, responsibleStaffId: current.responsibleStaffId },
    },
  })
}

/** A refused transition: nothing changed; the codes name every unmet requirement (HH-STATE-02, HH-API-03). */
function refused(result: { code: string; problems: readonly { code: string }[] }): ApiError {
  const field = (code: string) =>
    code === 'REASON_REQUIRED' || code === 'REASON_CATEGORY_REQUIRED'
      ? 'body'
      : code === 'QUALIFICATION_INCOMPLETE' || code.startsWith('HAZARD')
        ? 'qualification'
        : code === 'REVIEW_HOLD_OPEN'
          ? 'holds'
          : 'state'
  const problems = result.problems.length ? result.problems : [{ code: result.code }]
  return new ApiError('CONFLICT', {
    fieldErrors: problems.map((p) => ({ field: field(p.code), code: p.code, message: '' })),
  })
}

type RequestEvent = Parameters<typeof apply<'request.lifecycle'>>[1]
type RequestFactsIn = Parameters<typeof apply<'request.lifecycle'>>[2]['facts']

/**
 * Applies one request event to the locked request, after start_review when it is still received. Returns the new
 * state and version; persisting is the caller's.
 */
function transitionRequest(
  current: Locked,
  expectedVersion: number,
  event: RequestEvent,
  facts: RequestFactsIn,
): { state: RequestState; version: number; reviewed: boolean } {
  if (expectedVersion !== current.version) throw stale(current)
  let state = current.state
  let version = current.version
  let reviewed = false
  const now = new Date()
  const direct = apply({ machine: 'request.lifecycle', state, version }, event, {
    actor: 'staff',
    expectedVersion: version,
    now,
    facts,
  })
  if (!direct.ok && direct.code === 'INVALID_TRANSITION' && state === 'received') {
    const review = apply({ machine: 'request.lifecycle', state, version }, 'start_review', {
      actor: 'staff',
      expectedVersion: version,
      now,
      facts,
    })
    if (!review.ok) throw refused(review)
    state = review.to
    version = review.version
    reviewed = true
  } else if (!direct.ok) {
    throw refused(direct)
  } else {
    return { state: direct.to, version: direct.version, reviewed }
  }
  const next = apply({ machine: 'request.lifecycle', state, version }, event, {
    actor: 'staff',
    expectedVersion: version,
    now,
    facts,
  })
  if (!next.ok) throw refused(next)
  return { state: next.to, version: next.version, reviewed }
}

async function saveRequestState(tx: Tx, id: string, state: RequestState, version: number): Promise<void> {
  await tx.updateTable('intake.requests').set({ state, state_version: version }).where('id', '=', id).execute()
}

/** Creates the missing work packages of the project, one per service, in the order given (HH-SVC-04). */
async function ensureWorkPackages(tx: Tx, current: Locked, serviceIds: readonly string[], staffId: string) {
  const services = await tx
    .selectFrom('catalog.services')
    .select(['id', 'current_version'])
    .where('id', 'in', [...serviceIds])
    .execute()
  const known = new Map(services.map((s) => [s.id, s.current_version]))
  const unknown = serviceIds.filter((s) => !known.has(s))
  if (unknown.length)
    throw new ApiError('VALIDATION_FAILED', {
      fieldErrors: unknown.map(() => ({ field: 'body.workPackages', code: 'invalid', message: '' })),
    })
  // The version the customer asked about, when the service was on the request; else the registry's current version.
  const asked = await tx
    .selectFrom('intake.request_services')
    .select(['service_id', 'service_version'])
    .where('request_id', '=', current.id)
    .execute()
  const askedVersion = new Map(asked.map((a) => [a.service_id, a.service_version]))
  const existing = await tx
    .selectFrom('work.work_packages')
    .select(['service_id', 'position'])
    .where('project_id', '=', current.projectId)
    .execute()
  const have = new Set(existing.map((e) => e.service_id))
  let position = existing.reduce((m, e) => Math.max(m, e.position), 0)
  const added: string[] = []
  for (const serviceId of serviceIds) {
    if (have.has(serviceId)) continue
    position += 1
    await tx
      .insertInto('work.work_packages')
      .values({
        project_id: current.projectId,
        request_id: current.id,
        service_id: serviceId,
        service_version: askedVersion.get(serviceId) ?? (known.get(serviceId) as number),
        position,
        created_by: staffId,
      })
      .execute()
    added.push(serviceId)
  }
  return added
}

async function recordDecision(
  tx: Tx,
  input: {
    current: Locked
    action: string
    event: string
    toState: RequestState
    version: number
    staffId: string
    project?: { from: string; to: string }
    category?: NotAFitCategory
    customerText?: string | null
    internalNote?: string | null
  },
) {
  await tx
    .insertInto('intake.request_decisions')
    .values({
      request_id: input.current.id,
      project_id: input.current.projectId,
      action: input.action,
      event: input.event,
      from_state: input.current.state,
      to_state: input.toState,
      project_from_state: input.project?.from ?? null,
      project_to_state: input.project?.to ?? null,
      reason_category: input.category ?? null,
      customer_text: input.customerText ?? null,
      internal_note: input.internalNote ?? null,
      decided_by: input.staffId,
      request_version: input.version,
    })
    .execute()
}

const actionRoute = (
  def: Pick<RouteDef, 'path' | 'operationId' | 'summary' | 'description' | 'permission' | 'audit'> & {
    body: Record<string, unknown>
    handler: RouteDef['handler']
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
  resource: projectOf,
  schema: { params: REQUEST_PARAMS, body: def.body, response: { 200: ACTION_RESULT } },
  handler: def.handler,
})

/** Moves the request with one estimating or question event and records everything that goes with it. */
async function moveRequest(
  ctx: ApiContext,
  input: {
    action: 'ask_question' | 'prepare_online_estimate' | 'arrange_estimate_visit'
    event: RequestEvent
    outboxType: string
    workPackages?: readonly string[]
    customerExplanation?: string
    internalNote?: string
  },
) {
  const tx = ctx.tx as Tx
  const actor = staffActor(ctx)
  const current = await lockRequest(tx, ctx.scope, requestIdOf(ctx))
  if (current.projectState !== 'open') throw refused({ code: 'PROJECT_NOT_OPEN', problems: [] })
  const qualification = await latestQualification(tx, current.id)
  const moved = transitionRequest(current, ctx.expectedVersion(), input.event, {
    missingChecks: unqualifiedChecks((qualification?.checks ?? null) as Qualification | null),
    // Read under the request's lock: holds are opened and released under it too.
    blockingReviewHolds: await blockingReviewHolds(tx, current.id),
    ...(input.customerExplanation !== undefined ? { customerExplanation: input.customerExplanation } : {}),
  })
  await saveRequestState(tx, current.id, moved.state, moved.version)
  const added = input.workPackages ? await ensureWorkPackages(tx, current, input.workPackages, actor.userId) : []
  await recordDecision(tx, {
    current,
    action: input.action,
    event: input.event,
    toState: moved.state,
    version: moved.version,
    staffId: actor.userId,
    customerText: input.customerExplanation?.trim() ?? null,
    internalNote: optionalNote(input.internalNote),
  })
  await syncNewRequestItem(tx, current.id)
  // The review-hold item shows the request's status too; it follows the action in the same transaction.
  await syncReviewHoldItem(tx, current.id)
  // The pending-estimate item opens with Prepare Online Estimate and is resolved when the request leaves "ready for
  // estimate" (Ask a Question, Arrange Estimate Visit), in the same transaction (HH-OPS-01).
  await syncEstimateItem(tx, current.id)
  await outbox.add(tx, {
    type: input.outboxType,
    aggregate: { type: 'request', id: current.id, version: moved.version },
    payload: { requestId: current.id, projectId: current.projectId, reference: current.reference },
    idempotencyKey: `${input.outboxType}:${current.id}:${moved.version}`,
    requestId: correlation(ctx),
  })
  await ctx.audit({
    target: { type: 'request', id: current.id, version: moved.version },
    summary: {
      action: input.action,
      from: current.state,
      to: moved.state,
      reviewed: moved.reviewed,
      workPackagesAdded: added,
      internalNote: optionalNote(input.internalNote) !== null,
    },
  })
  return {
    body: { requestId: current.id, outcome: 'moved', state: moved.state, version: moved.version, projectState: 'open' },
    version: moved.version,
  }
}

export function staffRequestRoutes(deps: { obligationChecks?: readonly ObligationCheck[] } = {}): RouteDef[] {
  const checks = deps.obligationChecks ?? DEFAULT_OBLIGATION_CHECKS

  const list: RouteDef = {
    method: 'GET',
    path: '/staff/requests',
    operationId: 'listStaffRequests',
    summary: 'Requests',
    description:
      'Staff with request.view (not workers). Requests newest first, filtered by state (open, closed or one state) ' +
      'and responsible staff member (me, unassigned or a staff id). Customer name, city, services and coverage only.',
    actors: ['staff'],
    permission: 'request.view',
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'none',
    pagination: true,
    test: TEST,
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          state: { type: 'string', enum: STATE_FILTERS },
          responsible: { anyOf: [{ type: 'string', enum: ['me', 'unassigned'] }, UUID] },
        },
      },
      response: { 200: pageSchema(LIST_ITEM) },
    },
    handler: async (ctx) => {
      const actor = staffActor(ctx)
      const page = ctx.page as NonNullable<ApiContext['page']>
      const q = ctx.req.query as { state?: string; responsible?: string }
      let query = ctx.db
        .selectFrom('intake.requests as r')
        .innerJoin('crm.contacts as c', 'c.id', 'r.contact_id')
        .innerJoin('crm.properties as p', 'p.id', 'r.property_id')
        .leftJoin('identity.staff_users as s', (j) => j.on(sql<boolean>`s.id::text = r.responsible_staff_id`))
        .select([
          'r.id',
          'r.reference',
          'r.state',
          'r.submitted_at',
          'r.coverage_result',
          'r.need_help_today',
          'r.spam_suspected',
          'r.responsible_staff_id',
          'c.full_name',
          'p.city',
          's.display_name',
          sql<string>`r.submitted_at::text`.as('submitted_key'),
        ])
        // Scoped list (TSK-0037, HH-STAFF-04): only the projects the caller's request.view scope reaches.
        .where(projectInScope('r.project_id', ctx.scope))
      if (q.state === 'open') query = query.where('r.state', 'in', OPEN_STATES)
      else if (q.state === 'closed') query = query.where('r.state', 'not in', OPEN_STATES)
      else if (q.state !== undefined) query = query.where('r.state', '=', q.state)
      if (q.responsible === 'me') query = query.where('r.responsible_staff_id', '=', actor.userId)
      else if (q.responsible === 'unassigned') query = query.where('r.responsible_staff_id', 'is', null)
      else if (q.responsible !== undefined)
        query = query.where('r.responsible_staff_id', '=', q.responsible.toLowerCase())
      if (page.after !== undefined) {
        // Both parts checked strictly: a crafted cursor is a 400, never a failed cast (a 500).
        const [at, id] = instantIdCursor(page.after)
        query = query.where(sql<boolean>`(r.submitted_at, r.id) < (${at}::timestamptz, ${id}::uuid)`)
      }
      const rows = await query
        .orderBy('r.submitted_at', 'desc')
        .orderBy('r.id', 'desc')
        .limit(page.limit + 1)
        .execute()
      const ids = rows.map((r) => r.id)
      const services = ids.length
        ? await ctx.db
            .selectFrom('intake.request_services as rs')
            .innerJoin('catalog.services as sv', 'sv.id', 'rs.service_id')
            .select(['rs.request_id', 'sv.code'])
            .where('rs.request_id', 'in', ids)
            .orderBy('rs.position')
            .execute()
        : []
      const out = toPage(rows, page, (r) => [r.submitted_key, r.id])
      return {
        body: {
          items: out.items.map((r) => ({
            id: r.id,
            reference: r.reference,
            state: r.state,
            submittedAt: r.submitted_at.toISOString(),
            services: services.filter((s) => s.request_id === r.id).map((s) => s.code),
            customerName: r.full_name,
            city: r.city,
            coverage: r.coverage_result,
            needHelpToday: r.need_help_today,
            spamSuspected: r.spam_suspected,
            responsibleStaff: r.responsible_staff_id ? { id: r.responsible_staff_id, name: r.display_name } : null,
          })),
          nextCursor: out.nextCursor,
        },
      }
    },
  }

  const assignees: RouteDef = {
    method: 'GET',
    path: '/staff/requests/assignees',
    operationId: 'listRequestAssignees',
    summary: 'Who can be responsible for a request',
    description:
      'Staff with request.assign. Active staff whose roles may handle requests (the matrix row "Ask a question, ' +
      'choose online or site visit, Not a Fit, assign responsible person"): id and name only.',
    actors: ['staff'],
    permission: 'request.assign',
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'none',
    pagination: false,
    test: TEST,
    schema: {
      response: {
        200: {
          type: 'object',
          additionalProperties: false,
          required: ['staff'],
          properties: {
            staff: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['id', 'name'],
                properties: { id: { type: 'string' }, name: { type: ['string', 'null'] } },
              },
            },
          },
        },
      },
    },
    handler: async (ctx) => {
      const staff = await eligibleStaff(ctx.db)
      return { body: { staff } }
    },
  }

  const detail: RouteDef = {
    method: 'GET',
    path: '/staff/requests/:requestId',
    operationId: 'getStaffRequest',
    summary: 'A request: the original submission and its handling',
    description:
      'Staff with request.view (not workers). The original request exactly as sent (services, answers, ' +
      'description, full address, timing, preferences, contact details), the contact verification badges (email ' +
      'and phone separately), coverage, the responsible staff member and reassignments, the latest qualification, ' +
      'internal notes (staff only), decisions with reasons, work packages, the next step, the follow-up due time and ' +
      'the actions the caller may take. The ETag is the request version for the actions’ If-Match. Photos are read ' +
      'from listRequestPhotos.',
    actors: ['staff'],
    permission: 'request.view',
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'none',
    pagination: false,
    test: TEST,
    resource: projectOf,
    schema: { params: REQUEST_PARAMS, response: { 200: DETAIL } },
    handler: async (ctx) => {
      const view = await staffRequestView(ctx.db, ctx.scope, requestIdOf(ctx), ctx.actor)
      if (!view) throw new ApiError('NOT_FOUND')
      // TSK-0044 (OWN-DEC-143): restricted incident detail shown in full is audited, as the matrix cell says.
      const revealed = view.notes.filter((n) => n.visibility === 'restricted_incident' && !n.masked).map((n) => n.id)
      if (revealed.length)
        await ctx.auditAlways({
          action: 'incident.view_restricted',
          target: { type: 'request', id: view.id },
          summary: { notes: revealed },
        })
      return { body: view, version: view.version }
    },
  }

  const assign: RouteDef = {
    method: 'PUT',
    path: '/staff/requests/:requestId/responsible',
    operationId: 'assignRequest',
    summary: 'Make one staff member responsible for a request',
    description:
      'Staff with request.assign. Sets the one responsible staff member (an active staff member whose role may ' +
      'handle requests) on the request and its project; every reassignment is kept with who made it. If-Match is ' +
      'the request version; the new version is returned. Assigning never stops the first-response clock.',
    actors: ['staff'],
    permission: 'request.assign',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'required',
    rateLimit: 'none',
    audit: 'request.assign',
    pagination: false,
    test: TEST,
    resource: projectOf,
    schema: {
      params: REQUEST_PARAMS,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['staffUserId'],
        properties: { staffUserId: UUID },
      },
      response: { 200: ACTION_RESULT },
    },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staffActor(ctx)
      const { staffUserId } = ctx.req.body as { staffUserId: string }
      const target = staffUserId.toLowerCase()
      const current = await lockRequest(tx, ctx.scope, requestIdOf(ctx))
      if (ctx.expectedVersion() !== current.version) throw stale(current)
      if (!(await eligibleStaff(tx)).some((s) => s.id === target))
        throw new ApiError('VALIDATION_FAILED', {
          fieldErrors: [{ field: 'body.staffUserId', code: 'invalid', message: '' }],
        })
      if (current.responsibleStaffId === target)
        return {
          body: {
            requestId: current.id,
            outcome: 'moved',
            state: current.state,
            version: current.version,
            projectState: current.projectState,
          },
          version: current.version,
        }
      const version = current.version + 1
      await tx
        .updateTable('intake.requests')
        .set({ responsible_staff_id: target, state_version: version })
        .where('id', '=', current.id)
        .execute()
      await tx
        .updateTable('crm.projects')
        .set({ responsible_staff_id: target })
        .where('id', '=', current.projectId)
        .execute()
      await tx
        .insertInto('intake.request_assignments')
        .values({
          request_id: current.id,
          staff_user_id: target,
          previous_staff_user_id: current.responsibleStaffId,
          assigned_by: actor.userId,
        })
        .execute()
      // The request's items name the responsible person; none keeps the previous one.
      await syncNewRequestItem(tx, current.id)
      await syncReviewHoldItem(tx, current.id)
      await syncEstimateItem(tx, current.id)
      // The request's open delivery issues (a failed receipt) follow its new owner (TSK-0032, HH-OPS-02).
      await syncDeliveryFailureOwner(tx, { recordType: 'request', recordId: current.id, assignedStaffId: target })
      await ctx.audit({
        target: { type: 'request', id: current.id, version },
        summary: { from: current.responsibleStaffId, to: target },
      })
      return {
        body: {
          requestId: current.id,
          outcome: 'moved',
          state: current.state,
          version,
          projectState: current.projectState,
        },
        version,
      }
    },
  }

  const qualify: RouteDef = {
    method: 'PUT',
    path: '/staff/requests/:requestId/qualification',
    operationId: 'qualifyRequest',
    summary: 'Record the qualification of a request',
    description:
      'Staff with request.qualify (PROPOSED: the request-handling row). One outcome per check of HH-LEAD-02 ' +
      '(coverage, service fit, missing essential facts, urgency, site-visit need, staff and equipment, risk ' +
      'flags) with an optional note; each save is a new revision, and If-Match is the current revision (0 before ' +
      'the first). Classification is by staff; AI stays off. Never changes the request state or stops the clock. ' +
      'TSK-0043: risk flags needing attention name the potential hazards found (at least one, with a note); each ' +
      'newly named hazard opens a review hold in the same transaction. A later revision never clears a hold.',
    actors: ['staff'],
    permission: 'request.qualify',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'required',
    rateLimit: 'none',
    audit: 'request.qualify',
    pagination: false,
    test: TEST,
    resource: projectOf,
    schema: {
      params: REQUEST_PARAMS,
      body: QUALIFICATION_BODY,
      response: {
        200: {
          type: 'object',
          additionalProperties: false,
          required: ['revision', 'missingChecks', 'holdsOpened'],
          properties: {
            revision: { type: 'integer' },
            missingChecks: { type: 'array', items: { type: 'string' } },
            holdsOpened: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staffActor(ctx)
      const current = await lockRequest(tx, ctx.scope, requestIdOf(ctx))
      const latest = await latestQualification(tx, current.id)
      const revision = latest?.revision ?? 0
      if (ctx.expectedVersion() !== revision)
        throw new ApiError('STALE_VERSION', {
          current: { version: revision, values: { checks: (latest?.checks ?? null) as never } },
        })
      const { checks } = ctx.req.body as { checks: Qualification }
      const clean = Object.fromEntries(
        Object.entries(checks).map(([k, v]) => [
          k,
          {
            outcome: v?.outcome,
            note: v?.note?.trim() || null,
            ...(v?.hazards && v.hazards.length
              ? { hazards: HAZARD_CATEGORIES.filter((c) => v.hazards?.includes(c)) }
              : {}),
          },
        ]),
      ) as Qualification
      const problems = qualificationProblems(clean)
      if (problems.length) throw refused({ code: 'GUARD_FAILED', problems })
      await tx
        .insertInto('intake.request_qualifications')
        .values({
          request_id: current.id,
          revision: revision + 1,
          checks: JSON.stringify(clean),
          recorded_by: actor.userId,
        })
        .execute()
      const missing = unqualifiedChecks(clean)
      // The hazard flag (HH-LEAD-04): each newly named potential hazard becomes a review hold.
      const holdsOpened = await openFlaggedHolds(tx, {
        requestId: current.id,
        projectId: current.projectId,
        previous: (latest?.checks ?? null) as Qualification | null,
        current: clean,
        revision: revision + 1,
        staffId: actor.userId,
      })
      await ctx.audit({
        target: { type: 'request', id: current.id, version: current.version },
        summary: {
          revision: revision + 1,
          outcomes: Object.fromEntries(Object.entries(clean).map(([k, v]) => [k, v?.outcome ?? null])),
          hazards: [...(clean.risk_flags?.hazards ?? [])],
          holdsOpened,
        },
      })
      return { body: { revision: revision + 1, missingChecks: missing, holdsOpened }, version: revision + 1 }
    },
  }

  const note: RouteDef = {
    method: 'POST',
    path: '/staff/requests/:requestId/notes',
    operationId: 'addRequestNote',
    summary: 'Add an internal note to a request',
    description:
      'Staff with request.add_note (PROPOSED: the request-handling row). A staff-only note, kept separate from ' +
      'customer messages and never shown to customers. Notes are never edited or deleted; a correction is a new note. ' +
      'TSK-0044 (HH-STAFF-05): its visibility class is internal_operational unless restricted_incident (the Owner and ' +
      'the reporting worker only) or restricted_financial is chosen; never customer-shared. A card number is refused.',
    actors: ['staff'],
    permission: 'request.add_note',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'request.add_note',
    pagination: false,
    test: TEST,
    resource: projectOf,
    schema: {
      params: REQUEST_PARAMS,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['body'],
        properties: {
          body: { type: 'string', minLength: 1, maxLength: 5000, pattern: '\\S' },
          visibility: { type: 'string', enum: [...NOTE_VISIBILITIES] },
        },
      },
      response: {
        201: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'createdAt'],
          properties: { id: { type: 'string' }, createdAt: { type: 'string' } },
        },
      },
    },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staffActor(ctx)
      const current = await lockRequest(tx, ctx.scope, requestIdOf(ctx))
      const { body, visibility } = ctx.req.body as { body: string; visibility?: NoteVisibility }
      // Notes never hold payment card data (HH-CRM-01).
      if (looksLikeCardNumber(body))
        throw new ApiError('VALIDATION_FAILED', {
          fieldErrors: [{ field: 'body.body', code: 'sensitive_content', message: '' }],
        })
      const row = await tx
        .insertInto('intake.request_notes')
        .values({
          request_id: current.id,
          project_id: current.projectId,
          author_staff_id: actor.userId,
          visibility: visibility ?? 'internal_operational',
          body: body.trim(),
        })
        .returning(['id', 'created_at', 'visibility'])
        .executeTakeFirstOrThrow()
      // The note's text is never written to the audit log (RULE-SERVER-AUTHZ).
      await ctx.audit({
        target: { type: 'request_note', id: row.id },
        summary: { requestId: current.id, visibility: row.visibility },
      })
      return { status: 201, body: { id: row.id, createdAt: row.created_at.toISOString() } }
    },
  }

  const askQuestion = actionRoute({
    path: '/staff/requests/:requestId/actions/ask-question',
    operationId: 'askRequestQuestion',
    summary: 'Ask a Question',
    description:
      'Staff with request.ask_question. Moves the request to "needs information" (from review, after a received ' +
      'request is moved to review). The questions themselves and their automatic notice are written and published ' +
      'with TSK-0051: no customer message is sent here; request.information_requested is recorded for it.',
    permission: 'request.ask_question',
    audit: 'request.ask_question',
    body: {
      type: 'object',
      additionalProperties: false,
      properties: { internalNote: INTERNAL_NOTE },
    },
    handler: async (ctx) => {
      const b = ctx.req.body as { internalNote?: string }
      return moveRequest(ctx, {
        action: 'ask_question',
        event: ACTION_EVENTS.ask_question,
        outboxType: 'request.information_requested',
        ...(b.internalNote !== undefined ? { internalNote: b.internalNote } : {}),
      })
    },
  })

  const onlineEstimate = actionRoute({
    path: '/staff/requests/:requestId/actions/online-estimate',
    operationId: 'prepareOnlineEstimate',
    summary: 'Prepare Online Estimate',
    description:
      'Staff with request.choose_estimate_approach. "Estimate online": needs the qualification recorded; creates one ' +
      'work package per listed service of the one project and moves the request to "ready for estimate". The ' +
      'estimate itself is written with TSK-0052/TSK-0053; no message is sent. Refused while a review hold is open ' +
      'or under review (REVIEW_HOLD_OPEN).',
    permission: 'request.choose_estimate_approach',
    audit: 'request.choose_estimate_approach',
    body: {
      type: 'object',
      additionalProperties: false,
      required: ['workPackages'],
      properties: { workPackages: WORK_PACKAGES, internalNote: INTERNAL_NOTE },
    },
    handler: async (ctx) => {
      const b = ctx.req.body as { workPackages: string[]; internalNote?: string }
      return moveRequest(ctx, {
        action: 'prepare_online_estimate',
        event: ACTION_EVENTS.prepare_online_estimate,
        outboxType: 'request.ready_for_estimate',
        workPackages: b.workPackages,
        ...(b.internalNote !== undefined ? { internalNote: b.internalNote } : {}),
      })
    },
  })

  const estimateVisit = actionRoute({
    path: '/staff/requests/:requestId/actions/estimate-visit',
    operationId: 'arrangeEstimateVisit',
    summary: 'Arrange Estimate Visit',
    description:
      'Staff with request.choose_estimate_approach. "Site visit needed" with a short customer-facing explanation ' +
      '(OWN-DEC-99): needs the qualification recorded; creates one work package per listed service and moves the ' +
      'request to "needs site visit". Nothing is booked and no message is sent: the visit windows are offered with ' +
      'TSK-0063 (request.site_visit_required is recorded for it). Refused while a review hold is open or under ' +
      'review (REVIEW_HOLD_OPEN).',
    permission: 'request.choose_estimate_approach',
    audit: 'request.choose_estimate_approach',
    body: {
      type: 'object',
      additionalProperties: false,
      required: ['customerExplanation', 'workPackages'],
      properties: {
        customerExplanation: { type: 'string', minLength: 1, maxLength: 1000, pattern: '\\S' },
        workPackages: WORK_PACKAGES,
        internalNote: INTERNAL_NOTE,
      },
    },
    handler: async (ctx) => {
      const b = ctx.req.body as { customerExplanation: string; workPackages: string[]; internalNote?: string }
      return moveRequest(ctx, {
        action: 'arrange_estimate_visit',
        event: ACTION_EVENTS.arrange_estimate_visit,
        outboxType: 'request.site_visit_required',
        workPackages: b.workPackages,
        customerExplanation: b.customerExplanation,
        ...(b.internalNote !== undefined ? { internalNote: b.internalNote } : {}),
      })
    },
  })

  const notAFit = actionRoute({
    path: '/staff/requests/:requestId/actions/not-a-fit',
    operationId: 'declineNotAFit',
    summary: 'Not a Fit',
    description:
      'Staff with request.not_a_fit. Needs a reason category (coverage, outside our scope, specialist assessment ' +
      'needed, other) and the plain-language reason the customer sees; the internal note stays staff-only. With ' +
      'accepted work, an appointment or money received the project goes to the Owner for cancellation and financial ' +
      'review (Owner Decisions) and nothing closes; otherwise the request and project close with their history and ' +
      'decision.not_a_fit_published is recorded for the automatic notice.',
    permission: 'request.not_a_fit',
    audit: 'request.not_a_fit',
    body: {
      type: 'object',
      additionalProperties: false,
      required: ['category', 'customerReason'],
      properties: {
        category: { type: 'string', enum: Object.keys(NOT_A_FIT_EVENTS) },
        customerReason: { type: 'string', minLength: 1, maxLength: 1000, pattern: '\\S' },
        internalNote: INTERNAL_NOTE,
      },
    },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staffActor(ctx)
      const b = ctx.req.body as { category: NotAFitCategory; customerReason: string; internalNote?: string }
      const current = await lockRequest(tx, ctx.scope, requestIdOf(ctx))
      const expected = ctx.expectedVersion()
      if (expected !== current.version) throw stale(current)
      const customerText = b.customerReason.trim()
      const internalNote = optionalNote(b.internalNote)
      const obligations = await obligationFacts(tx, current.projectId, checks)
      const owed = obligations.workAccepted || obligations.appointmentExists || obligations.moneyReceived

      if (owed) {
        // Routed to the Owner instead of closing (OWN-DEC-100): the request keeps its state; the project waits for
        // the Owner's cancellation and financial review. Nothing is published to the customer.
        if (
          ![
            'received',
            'reviewing',
            'needs_information',
            'needs_site_visit',
            'ready_for_estimate',
            'estimated',
          ].includes(current.state)
        )
          throw refused({ code: 'INVALID_TRANSITION', problems: [] })
        const routed = apply(
          { machine: 'project.lifecycle', state: current.projectState as never, version: current.projectVersion },
          'route_to_owner_review',
          {
            actor: 'staff',
            expectedVersion: current.projectVersion,
            now: new Date(),
            facts: { ...obligations, reason: customerText },
          },
        )
        if (!routed.ok) throw refused(routed)
        await tx
          .updateTable('crm.projects')
          .set({ state: routed.to, state_version: routed.version })
          .where('id', '=', current.projectId)
          .execute()
        const version = current.version + 1
        await tx.updateTable('intake.requests').set({ state_version: version }).where('id', '=', current.id).execute()
        await recordDecision(tx, {
          current,
          action: 'not_a_fit_owner_review',
          event: 'route_to_owner_review',
          toState: current.state,
          version,
          staffId: actor.userId,
          project: { from: current.projectState, to: routed.to },
          category: b.category,
          customerText,
          internalNote,
        })
        await openQueueItem(tx, {
          type: 'cancellation_review',
          subjectId: current.id,
          reason: 'not_a_fit_with_obligations',
          projectId: current.projectId,
          reference: current.reference,
          status: routed.to,
        })
        // The project is no longer open: its pending-estimate item leaves the queue (HH-OPS-01).
        await syncEstimateItem(tx, current.id)
        await ctx.audit({
          target: { type: 'request', id: current.id, version },
          summary: {
            action: 'not_a_fit_owner_review',
            category: b.category,
            projectFrom: current.projectState,
            projectTo: routed.to,
            obligations,
          },
        })
        return {
          body: {
            requestId: current.id,
            outcome: 'routed_to_owner',
            state: current.state,
            version,
            projectState: routed.to,
          },
          version,
        }
      }

      if (current.projectState !== 'open') throw refused({ code: 'PROJECT_NOT_OPEN', problems: [] })
      const event = NOT_A_FIT_EVENTS[b.category]
      const moved = transitionRequest(current, expected, event, {
        ...obligations,
        notAFitCategory: b.category,
        reason: customerText,
      })
      await saveRequestState(tx, current.id, moved.state, moved.version)
      const closed = apply({ machine: 'project.lifecycle', state: 'open', version: current.projectVersion }, 'close', {
        actor: 'staff',
        expectedVersion: current.projectVersion,
        now: new Date(),
        facts: { ...obligations, requestState: moved.state },
      })
      if (!closed.ok) throw refused(closed)
      await tx
        .updateTable('crm.projects')
        .set({ state: closed.to, state_version: closed.version })
        .where('id', '=', current.projectId)
        .execute()
      await recordDecision(tx, {
        current,
        action: 'not_a_fit',
        event,
        toState: moved.state,
        version: moved.version,
        staffId: actor.userId,
        project: { from: current.projectState, to: closed.to },
        category: b.category,
        customerText,
        internalNote,
      })
      await syncNewRequestItem(tx, current.id)
      // A closed request keeps its holds as history; its review-hold and pending-estimate items leave the queue.
      await syncReviewHoldItem(tx, current.id)
      await syncEstimateItem(tx, current.id)
      // The automatic notice that points the customer to the project (FACT-AUTOMATIC-MESSAGES row 7).
      await outbox.add(tx, {
        type: 'decision.not_a_fit_published',
        aggregate: { type: 'request', id: current.id, version: moved.version },
        payload: { requestId: current.id, projectId: current.projectId, reference: current.reference },
        idempotencyKey: `decision.not_a_fit_published:${current.id}`,
        requestId: correlation(ctx),
      })
      await ctx.audit({
        target: { type: 'request', id: current.id, version: moved.version },
        summary: {
          action: 'not_a_fit',
          category: b.category,
          from: current.state,
          to: moved.state,
          projectTo: closed.to,
          internalNote: internalNote !== null,
        },
      })
      return {
        body: {
          requestId: current.id,
          outcome: 'moved',
          state: moved.state,
          version: moved.version,
          projectState: closed.to,
        },
        version: moved.version,
      }
    },
  })

  const conversation: RouteDef = {
    method: 'POST',
    path: '/staff/requests/:requestId/conversations',
    operationId: 'recordRequestConversation',
    summary: 'Record a completed customer conversation',
    description:
      'Staff with request.record_conversation (PROPOSED: the request-handling row). A completed conversation with ' +
      'the customer (a logged phone call or a conversation in person) with its outcome, when it happened (default ' +
      'now; never before the request or in the future). Staff only. It is a meaningful response: the first one ' +
      'stops the first-response clock at the time it happened (OWN-DEC-116). Never edited or deleted.',
    actors: ['staff'],
    permission: 'request.record_conversation',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'request.record_conversation',
    pagination: false,
    test: 'test/integration/response-holds.test.ts',
    resource: projectOf,
    schema: {
      params: REQUEST_PARAMS,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['channel', 'outcome'],
        properties: {
          channel: { type: 'string', enum: ['phone', 'in_person'] },
          outcome: { type: 'string', minLength: 1, maxLength: 1000, pattern: '\\S' },
          occurredAt: { type: 'string', format: 'date-time' },
        },
      },
      response: {
        201: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'occurredAt', 'responseClock'],
          properties: {
            id: { type: 'string' },
            occurredAt: { type: 'string', format: 'date-time' },
            responseClock: { anyOf: [{ type: 'null' }, CLOCK_SCHEMA] },
          },
        },
      },
    },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staffActor(ctx)
      const b = ctx.req.body as { channel: 'phone' | 'in_person'; outcome: string; occurredAt?: string }
      const current = await lockRequest(tx, ctx.scope, requestIdOf(ctx))
      const submitted = await tx
        .selectFrom('intake.requests')
        .select('submitted_at')
        .where('id', '=', current.id)
        .executeTakeFirstOrThrow()
      const now = new Date()
      const at = b.occurredAt ? new Date(b.occurredAt) : now
      // Never before the request was received, never in the future (a minute of clock skew is allowed).
      if (at.getTime() < submitted.submitted_at.getTime() || at.getTime() > now.getTime() + 60_000)
        throw new ApiError('VALIDATION_FAILED', {
          fieldErrors: [{ field: 'body.occurredAt', code: 'out_of_range', message: '' }],
        })
      const row = await tx
        .insertInto('intake.request_conversations')
        .values({
          request_id: current.id,
          project_id: current.projectId,
          channel: b.channel,
          outcome: b.outcome.trim(),
          occurred_at: at,
          recorded_by: actor.userId,
        })
        .returning(['id', 'occurred_at'])
        .executeTakeFirstOrThrow()
      const clock = await recordResponseEvent(tx, {
        requestId: current.id,
        kind: 'conversation_recorded',
        ref: row.id,
        occurredAt: row.occurred_at,
      })
      // The outcome text is never written to the audit log.
      await ctx.audit({
        target: { type: 'request_conversation', id: row.id },
        summary: { requestId: current.id, channel: b.channel, clockStopped: clock?.stopped ?? false },
      })
      const after = await tx
        .selectFrom('intake.response_clocks')
        .selectAll()
        .where('request_id', '=', current.id)
        .executeTakeFirst()
      return {
        status: 201,
        body: {
          id: row.id,
          occurredAt: row.occurred_at.toISOString(),
          responseClock: after ? responseClockView(after, now) : null,
        },
      }
    },
  }

  const report: RouteDef = {
    method: 'GET',
    path: '/staff/reports/first-response',
    operationId: 'getFirstResponseReport',
    summary: 'Customer response: time to first meaningful response',
    description:
      'The Owner (dashboard.view). For requests received in [from, to): how many were received, answered, awaiting ' +
      'and within the internal one-hour target, the share within target (basis points of requests whose outcome is ' +
      'known) and the average and median business minutes to the first meaningful response (OWN-DEC-125). Figures ' +
      'with nothing to measure are null (unavailable), never zero; requests whose clock was NOT CONFIGURED are ' +
      'counted apart. The Owner Dashboard (TSK-0096) reads it.',
    actors: ['staff'],
    permission: 'dashboard.view',
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'none',
    pagination: false,
    test: 'test/integration/response-holds.test.ts',
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        required: ['from', 'to'],
        properties: { from: { type: 'string', format: 'date-time' }, to: { type: 'string', format: 'date-time' } },
      },
      response: {
        200: {
          type: 'object',
          additionalProperties: false,
          required: [
            'from',
            'to',
            'received',
            'notConfigured',
            'answered',
            'awaiting',
            'withinTarget',
            'withinTargetShareBps',
            'averageBusinessMinutes',
            'medianBusinessMinutes',
            'generatedAt',
          ],
          properties: {
            from: { type: 'string', format: 'date-time' },
            to: { type: 'string', format: 'date-time' },
            received: { type: 'integer' },
            notConfigured: { type: 'integer' },
            answered: { type: 'integer' },
            awaiting: { type: 'integer' },
            withinTarget: { type: 'integer' },
            withinTargetShareBps: { type: ['integer', 'null'] },
            averageBusinessMinutes: { type: ['integer', 'null'] },
            medianBusinessMinutes: { type: ['integer', 'null'] },
            generatedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    handler: async (ctx) => {
      const q = ctx.req.query as { from: string; to: string }
      const from = new Date(q.from)
      const to = new Date(q.to)
      if (!(to.getTime() > from.getTime()))
        throw new ApiError('VALIDATION_FAILED', {
          fieldErrors: [{ field: 'querystring.to', code: 'out_of_range', message: '' }],
        })
      const now = new Date()
      const figures = await responseReport(ctx.db, { from, to }, now)
      return { body: { from: from.toISOString(), to: to.toISOString(), ...figures, generatedAt: now.toISOString() } }
    },
  }

  return [
    list,
    assignees,
    detail,
    assign,
    qualify,
    note,
    askQuestion,
    onlineEstimate,
    estimateVisit,
    notAFit,
    conversation,
    report,
    ...holdRoutes(),
  ]
}

/** Active staff whose live roles hold the request-handling actions (PROPOSED: request.choose_estimate_approach). */
async function eligibleStaff(db: ApiContext['db'] | Tx): Promise<{ id: string; name: string | null }[]> {
  const rows = await db
    .selectFrom('identity.staff_users as u')
    .innerJoin('identity.role_grants as g', 'g.staff_user_id', 'u.id')
    .select(['u.id', 'u.display_name', 'g.name'])
    .where('u.status', '=', 'active')
    .where('g.kind', '=', 'role')
    .where('g.ended_at', 'is', null)
    .orderBy('u.display_name')
    .orderBy('u.id')
    .execute()
  const roles = new Map<string, { name: string | null; roles: string[] }>()
  for (const r of rows) {
    const entry = roles.get(r.id) ?? { name: r.display_name, roles: [] }
    entry.roles.push(r.name)
    roles.set(r.id, entry)
  }
  return [...roles.entries()]
    .filter(([, v]) => heldScopes(v.roles, [], 'request.choose_estimate_approach').includes('any'))
    .map(([id, v]) => ({ id, name: v.name }))
}
