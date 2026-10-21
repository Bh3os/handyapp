// Reschedule, reassign and cancel a booked visit, and the customer's change requests (TSK-0066; HH-SCH-07, HH-PORT-04,
// HH-OPS-03, HH-API-04, HH-ARC-08, HH-COM-05, HH-COM-06, HH-FIN-14, T25, T42, T65, ENT-Visit, ENT-Reservation,
// ENT-AuditEvent, FACT-AUTOMATIC-MESSAGES, FACT-CANCELLATION-RULES, OWN-DEC-107, OWN-DEC-119, OWN-DEC-134,
// RULE-SERVER-AUTHZ, RULE-SAFETY-GATES, RULE-MONEY-CENTS).
// - Every change of a confirmed visit carries the version the caller saw (a stale one is refused with the current
//   values), validates the new window or team before anything changes (every confirmation precondition, the deposit
//   gate, the holds and the capacity, in the same transaction) and keeps the previous booking: the window history, the
//   ended reservations ('rescheduled', 'reassigned', 'visit_canceled') and one change record (work.visit_changes) with
//   the actor, the reason (required), the team before and after and who initiated it. A refused change leaves the
//   appointment exactly as it was.
// - A committed reschedule or reassignment writes one appointment.change_committed event in the same transaction
//   (HH-ARC-08). After commit it triggers the automatic "Appointment changed" notice (FACT-AUTOMATIC-MESSAGES #11) and
//   the staff notice to every affected worker (the old and the new team). One notice per change: the change id is the
//   subject, so retries and double submissions never duplicate it. At send time the visit is read again: a change
//   that a newer one superseded, or a visit no longer confirmed, sends nothing to the customer (stale). Neither
//   wording is approved yet, so each delivery is recorded as failed with template_not_configured and staff see the
//   delivery issue with Retry; a failed delivery never rolls back the schedule.
// - A cancellation is not on the automatic list: it notifies the affected workers only (the staff notice); the
//   customer sees the canceled appointment in the portal, and anything sent to them is a staff message.
// - The customer's "Request to Reschedule" and "Request Cancellation" (HH-PORT-04) record the intent, an optional reason
//   and (reschedule) preferred times, open the visit's change-request queue item, and never change the booking. Staff
//   confirm a reschedule request by moving the visit (the window route with the request) or a cancellation request by
//   cancelling it (the cancel route with the request); either runs every rule above. Declining needs a reason and
//   leaves the booking as it is.
// - Cancellation outcome (FACT-CANCELLATION-RULES, OWN-DEC-134): computed with @handyhub/domain cancellationOutcome
//   from the active cancellation.rules (notice, the late-cancellation amount; NOT CONFIGURED while unset), the notice
//   (from the customer's request, or from now when staff record a cancellation), whether work started and the verified
//   deposit. Staff see it before confirming and it is kept on the change record. Nothing is refunded, kept or invoiced
//   automatically: an outcome with money (or the Owner's determination) opens the Owner's cancellation_outcome item.
// - Cancelling a work visit (accepted, scheduled work) is the Owner's (work.cancel_with_financial_review): an Office
//   cancellation of one is refused, and a customer's cancellation request of a work visit also opens the Owner
//   Decisions item visit_cancellation_review. Declining such a request is the Owner's too (PROPOSED).
// - PROPOSED (no owner rule; OQ-VISIT-CHANGE-DETAILS): work started means the job is past preparation (in progress, paused, ready for QA or
//   later) or one of its work visits arrived or completed; one open request per visit; a reassignment keeps the
//   visit's window and runs every confirmation precondition like a reschedule; the scheduling task is left as it is
//   when a visit is canceled (staff plan a new visit).
import type { Db, Tx } from '@handyhub/db'
import {
  cancellationOutcome,
  isWorkVisitPurpose,
  needsOwnerAction,
  onSiteRange,
  reservedRange,
  windowText,
  type CancellationInitiator,
  type CancellationOutcome,
  type HandyhubCause,
} from '@handyhub/domain'
import {
  rowFor,
  scopeIncludesProject,
  type Action,
  type CustomerActor,
  type DataScope,
  type StaffActor,
} from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError, type FieldError } from '../../api/errors.js'
import type { Automation } from '../../platform/automation.js'
import { loadConfig, type Config } from '../../platform/config/index.js'
import { outbox } from '../../platform/outbox.js'
import { currentContext } from '../../platform/request-context.js'
import {
  capacitySettings,
  evaluate,
  insertReservations,
  refuse,
  type ReservationRequest,
} from '../capacity/resources.js'
import { depositView } from '../finance/deposits.js'
import { notificationAutomation, type NotificationProviders } from '../notifications/index.js'
import { openQueueItem, resolveQueueItem } from '../queue/items.js'
import { findProject } from '../records/index.js'
import type { WorkVisitGate } from './gates.js'
import { destinationsOf, requestOf } from './offers.js'
import { confirmationPreconditions } from './preconditions.js'
import { stopAppointmentReminders } from './reminders.js'
import { factsOf, storedWindow } from './visits.js'

type Reader = Db | Tx

const field = (f: string, code: string): FieldError => ({ field: f, code, message: '' })

export const CHANGE_COMMITTED_EVENT = 'appointment.change_committed'
export const APPOINTMENT_CHANGED_NOTICE = 'appointment.changed'
export const SCHEDULE_CHANGE_STAFF_NOTICE = 'staff_notice.schedule_change'
export const CHANGE_REQUEST_QUEUE_TYPE = 'visit_change_request'
export const WORK_CANCELLATION_QUEUE_TYPE = 'visit_cancellation_review'

/** PROPOSED input bounds (no owner value). */
// The reason is kept on the reservations too (at most 500 characters, migration 0052).
export const CHANGE_LIMITS = { reason: 500, preferredTimes: 1000 } as const

export const CHANGE_KINDS = ['rescheduled', 'reassigned', 'canceled'] as const
export type ChangeKind = (typeof CHANGE_KINDS)[number]
export const REQUEST_KINDS = ['reschedule', 'cancellation'] as const
export type RequestKind = (typeof REQUEST_KINDS)[number]

/** Whether one of the actor's roles holds the action (the matrix row's cell has a rule for it). */
export function holdsAction(actor: StaffActor, action: Action): boolean {
  const row = rowFor(action)
  return actor.roles.some((role) => row?.cells[role].rules[action] !== undefined)
}

/** Who may cancel this visit: visit.cancel, and for a work visit the Owner's cancellation and financial review. */
export function mayCancel(actor: StaffActor, purpose: string): boolean {
  return (
    holdsAction(actor, 'visit.cancel') &&
    (!isWorkVisitPurpose(purpose) || holdsAction(actor, 'work.cancel_with_financial_review'))
  )
}

const requestIdOf = (fallback: string) => currentContext()?.requestId ?? fallback

const requiredReason = (reason: string | undefined, at = 'body.reason'): string => {
  const r = reason?.trim()
  if (!r) throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field(at, 'REASON_REQUIRED')] })
  return r
}

export type Initiation = {
  readonly initiator?: CancellationInitiator | undefined
  readonly handyhubCause?: HandyhubCause | undefined
}

/** The initiator and cause as stored: a cause only for HandyHub, and HandyHub always with its cause. */
function initiation(
  i: Initiation,
  required: boolean,
): { initiator: CancellationInitiator | null; cause: HandyhubCause | null } {
  if (!i.initiator) {
    if (required)
      throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body.initiator', 'INITIATOR_REQUIRED')] })
    if (i.handyhubCause)
      throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body.initiator', 'INITIATOR_REQUIRED')] })
    return { initiator: null, cause: null }
  }
  if (i.initiator === 'handyhub' && !i.handyhubCause)
    throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body.handyhubCause', 'CAUSE_REQUIRED')] })
  if (i.initiator === 'customer' && i.handyhubCause)
    throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body.handyhubCause', 'CAUSE_NOT_APPLICABLE')] })
  return { initiator: i.initiator, cause: i.initiator === 'handyhub' ? (i.handyhubCause ?? null) : null }
}

/** The visit's active confirmed team: workers (the lead first) and items. */
export async function activeTeam(db: Reader, visitId: string): Promise<{ workers: string[]; equipment: string[] }> {
  const rows = await db
    .selectFrom('work.reservations')
    .select(['staff_user_id', 'equipment_id', 'role'])
    .where('visit_id', '=', visitId)
    .where('kind', '=', 'confirmed')
    .where('ended_at', 'is', null)
    .orderBy('role')
    .orderBy('staff_user_id')
    .orderBy('equipment_id')
    .execute()
  const workers = rows.filter((r) => r.staff_user_id !== null)
  return {
    workers: [
      ...workers.filter((r) => r.role === 'lead').map((r) => r.staff_user_id as string),
      ...workers.filter((r) => r.role !== 'lead').map((r) => r.staff_user_id as string),
    ],
    equipment: rows.flatMap((r) => (r.equipment_id ? [r.equipment_id] : [])),
  }
}

async function lockVisit(tx: Tx, visitId: string) {
  return tx.selectFrom('work.visits').selectAll().where('id', '=', visitId).forUpdate().executeTakeFirst()
}

const stale = (v: { version: number; state: string; local_date: string; window_start: string; window_end: string }) =>
  new ApiError('STALE_VERSION', {
    current: {
      version: v.version,
      values: {
        state: v.state,
        localDate: v.local_date,
        windowStart: v.window_start.slice(0, 5),
        windowEnd: v.window_end.slice(0, 5),
      },
    },
  })

type OpenRequest = { id: string; kind: string; requested_at: Date; version: number }

/** The visit's open request of this kind, locked; refused when the id names anything else. */
async function openRequestFor(tx: Tx, visitId: string, requestId: string, kind: RequestKind): Promise<OpenRequest> {
  const r = await tx
    .selectFrom('work.visit_change_requests')
    .select(['id', 'kind', 'state', 'visit_id', 'requested_at', 'version'])
    .where('id', '=', requestId)
    .forUpdate()
    .executeTakeFirst()
  if (!r || r.visit_id !== visitId || r.kind !== kind)
    throw new ApiError('CONFLICT', { fieldErrors: [field('body.changeRequestId', 'REQUEST_NOT_FOR_VISIT')] })
  if (r.state !== 'open')
    throw new ApiError('CONFLICT', { fieldErrors: [field('body.changeRequestId', `REQUEST_${r.state.toUpperCase()}`)] })
  return r
}

async function endRequest(
  tx: Tx,
  r: { id: string; version: number },
  actor: StaffActor,
  state: 'confirmed' | 'declined',
  reason: string | null,
) {
  await tx
    .updateTable('work.visit_change_requests')
    .set({
      state,
      version: r.version + 1,
      decided_by: actor.userId,
      decided_at: sql<Date>`now()`,
      decision_reason: reason,
    })
    .where('id', '=', r.id)
    .execute()
}

async function resolveRequestItems(tx: Tx, visitId: string, resolution: string) {
  for (const type of [CHANGE_REQUEST_QUEUE_TYPE, WORK_CANCELLATION_QUEUE_TYPE])
    await resolveQueueItem(tx, { type, subjectId: visitId, resolution })
}

type ChangeRecord = {
  kind: ChangeKind
  visit: { id: string; project_id: string; version: number; window_version: number }
  to: { version: number; windowVersion: number }
  fromWorkers: readonly string[]
  toWorkers: readonly string[]
  initiator: CancellationInitiator | null
  cause: HandyhubCause | null
  reason: string
  changeRequestId: string | null
  actor: StaffActor
  cancellation?: {
    outcome: CancellationOutcome
    workStarted: boolean
    depositPaidCents: number
    depositPendingCents: number
    rulesVersion: number
  }
}

/** Writes the change record and the committed event that notifies after commit (HH-ARC-08), in this transaction. */
async function recordChange(tx: Tx, c: ChangeRecord): Promise<string> {
  const o = c.cancellation
  const row = await tx
    .insertInto('work.visit_changes')
    .values({
      visit_id: c.visit.id,
      project_id: c.visit.project_id,
      kind: c.kind,
      from_version: c.visit.version,
      to_version: c.to.version,
      from_window_version: c.visit.window_version,
      to_window_version: c.to.windowVersion,
      from_workers: [...c.fromWorkers],
      to_workers: [...c.toWorkers],
      initiator: c.initiator,
      handyhub_cause: c.cause,
      reason: c.reason,
      change_request_id: c.changeRequestId,
      changed_by: c.actor.userId,
      ...(o
        ? {
            notice_minutes: o.outcome.noticeMinutes,
            work_started: o.workStarted,
            deposit_paid_cents: o.depositPaidCents,
            deposit_pending_cents: o.depositPendingCents,
            outcome: o.outcome.kind,
            kept_cents: o.outcome.keptCents,
            refund_cents: o.outcome.refundCents,
            invoice_cents: o.outcome.invoiceCents,
            rules_version: o.rulesVersion,
          }
        : {}),
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  await outbox.add(tx, {
    type: CHANGE_COMMITTED_EVENT,
    aggregate: { type: 'visit', id: c.visit.id, version: c.to.version },
    payload: { changeId: row.id, kind: c.kind, visitVersion: c.to.version },
    idempotencyKey: `${CHANGE_COMMITTED_EVENT}:${row.id}`,
    requestId: requestIdOf(`visit-change:${row.id}`),
  })
  return row.id
}

// --- Reschedule (the window route of a confirmed visit, visits.ts changeWindow) -----------------------------------

export type RescheduleMeta = Initiation & {
  readonly reason?: string | undefined
  readonly changeRequestId?: string | undefined
}

/**
 * What a reschedule of a confirmed visit needs before its window moves: the reason, the initiation and the open
 * reschedule request it confirms (locked). Called by changeWindow inside its transaction, before anything changes.
 */
export async function prepareReschedule(tx: Tx, visitId: string, meta: RescheduleMeta) {
  const reason = requiredReason(meta.reason)
  const init = initiation(meta, false)
  const request = meta.changeRequestId ? await openRequestFor(tx, visitId, meta.changeRequestId, 'reschedule') : null
  if (request && init.initiator === 'handyhub')
    throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body.initiator', 'REQUEST_IS_CUSTOMER')] })
  return { reason, ...init, initiator: request ? ('customer' as const) : init.initiator, request }
}

/** After a confirmed visit's window moved: confirms its request and writes the change record and event. */
export async function finishReschedule(
  tx: Tx,
  actor: StaffActor,
  before: { id: string; project_id: string; version: number; window_version: number },
  after: { version: number; windowVersion: number },
  prepared: Awaited<ReturnType<typeof prepareReschedule>>,
): Promise<string> {
  const team = await activeTeam(tx, before.id)
  if (prepared.request) {
    await endRequest(tx, prepared.request, actor, 'confirmed', null)
    await resolveRequestItems(tx, before.id, 'reschedule_confirmed')
  }
  // TSK-0067 (HH-COM-11): the old window's waiting reminder is outdated; the new window gets its own after commit.
  await stopAppointmentReminders(tx, before.id)
  return recordChange(tx, {
    kind: 'rescheduled',
    visit: before,
    to: after,
    fromWorkers: team.workers,
    toWorkers: team.workers,
    initiator: prepared.initiator,
    cause: prepared.cause,
    reason: prepared.reason,
    changeRequestId: prepared.request?.id ?? null,
    actor,
  })
}

// --- Reassign --------------------------------------------------------------------------------------------------------

export type ReassignInput = {
  /** Every worker the visit needs, the lead first. */
  readonly workerIds: readonly string[]
  /** One item for every equipment entry; default: the items reserved now. */
  readonly equipmentIds?: readonly string[] | undefined
  readonly reason?: string | undefined
}

/**
 * Reassigns a confirmed visit to another team for the same window, with the version the caller saw. The new team is
 * checked like a confirmation (every confirmation precondition, then each worker's and item's capacity, with the
 * visit's own reservations set aside) and reserved in this transaction; the old reservations end 'reassigned' and stay
 * as history (a flagged reservation that ends resolves its visit_flagged item, migration 0054). Refusals: NOT_FOUND,
 * FORBIDDEN, STALE_VERSION, VALIDATION_FAILED (REASON_REQUIRED), CONFLICT (VISIT_NOT_CONFIRMED, WORKER_COUNT_MISMATCH,
 * WORKER_REPEATED, EQUIPMENT_NOT_ASSIGNED, EQUIPMENT_REPEATED, TEAM_UNCHANGED, the confirmation preconditions and the
 * capacity codes with alternatives). Nothing partial is written.
 */
export async function reassignVisit(
  tx: Tx,
  actor: StaffActor,
  scope: DataScope,
  visitId: string,
  input: ReassignInput,
  deps: { gates: readonly WorkVisitGate[]; now: Date; expectedVersion: number },
) {
  const v = await lockVisit(tx, visitId)
  if (!v || !scopeIncludesProject(scope, v.project_id)) throw new ApiError('NOT_FOUND')
  if (!holdsAction(actor, 'visit.reassign')) throw new ApiError('FORBIDDEN')
  if (v.version !== deps.expectedVersion) throw stale(v)
  if (v.state !== 'confirmed') throw new ApiError('CONFLICT', { fieldErrors: [field('state', 'VISIT_NOT_CONFIRMED')] })
  const reason = requiredReason(input.reason)
  const before = await activeTeam(tx, v.id)
  const workerIds = [...input.workerIds]
  const equipmentIds = [...(input.equipmentIds ?? before.equipment)]
  const problems: FieldError[] = []
  if (new Set(workerIds).size !== workerIds.length) problems.push(field('body.workerIds', 'WORKER_REPEATED'))
  else if (v.required_workers !== null && workerIds.length !== v.required_workers)
    problems.push(field('body.workerIds', 'WORKER_COUNT_MISMATCH'))
  if (new Set(equipmentIds).size !== equipmentIds.length)
    problems.push(field('body.equipmentIds', 'EQUIPMENT_REPEATED'))
  else if (equipmentIds.length < v.equipment.length) problems.push(field('body.equipmentIds', 'EQUIPMENT_NOT_ASSIGNED'))
  const sameSet = (a: readonly string[], b: readonly string[]) =>
    a.length === b.length && [...a].sort().join() === [...b].sort().join()
  if (
    problems.length === 0 &&
    workerIds[0] === before.workers[0] &&
    sameSet(workerIds, before.workers) &&
    sameSet(equipmentIds, before.equipment)
  )
    problems.push(field('body.workerIds', 'TEAM_UNCHANGED'))
  if (problems.length) throw new ApiError('CONFLICT', { fieldErrors: problems })
  const pre = await confirmationPreconditions(tx, v, deps.gates)
  const config = await loadConfig(tx)
  const window = storedWindow(v)
  const facts = factsOf(v)
  const req: ReservationRequest = {
    visitId: v.id,
    purpose: v.purpose,
    visitZone: v.time_zone,
    range: reservedRange(window, facts),
    onSite: onSiteRange(window, facts),
    travelMinutes: v.travel_buffer_minutes ?? 0,
    workerIds,
    equipmentIds,
    actorId: actor.userId,
    reason,
    replaceOwn: true,
    endedReason: 'reassigned',
    settings: capacitySettings(config),
    now: deps.now,
  }
  const found = [...pre, ...(await evaluate(tx, req))]
  if (found.length) await refuse(tx, req, found)
  const lead = workerIds[0] as string
  await insertReservations(tx, req, new Map(workerIds.map((id) => [id, id === lead ? 'lead' : 'member'])))
  const updated = await tx
    .updateTable('work.visits')
    .set({ version: v.version + 1, updated_at: sql<Date>`now()` })
    .where('id', '=', v.id)
    .returning(['version', 'window_version'])
    .executeTakeFirstOrThrow()
  const changeId = await recordChange(tx, {
    kind: 'reassigned',
    visit: v,
    to: { version: updated.version, windowVersion: updated.window_version },
    fromWorkers: before.workers,
    toWorkers: workerIds,
    initiator: null,
    cause: null,
    reason,
    changeRequestId: null,
    actor,
  })
  return {
    id: v.id,
    projectId: v.project_id,
    purpose: v.purpose,
    version: updated.version,
    changeId,
    from: before,
    to: { workers: workerIds, equipment: equipmentIds },
    reason,
  }
}

// --- Cancel ----------------------------------------------------------------------------------------------------------

/** PROPOSED: the job states that mean work has started (past preparation). */
export const WORK_STARTED_JOB_STATES = [
  'in_progress',
  'paused',
  'ready_for_qa',
  'operationally_complete',
  'closed',
  'reopened',
] as const

/** The cancellation rules in force (cancellation.rules), or NOT CONFIGURED: never assumed. */
export function cancellationRules(config: Config) {
  const r = config.get('cancellation.rules')
  if (r.state !== 'CONFIGURED')
    throw new ApiError('NOT_CONFIGURED', {
      fieldErrors: [field('cancellation.rules', 'CANCELLATION_RULES_NOT_CONFIGURED')],
    })
  return {
    rules: { noticeHours: r.value.noticeHours, lateCancellationCents: r.value.lateCancellationCents },
    version: r.version,
    proposed: r.proposed,
  }
}

/** What the outcome reads: whether work started on the job and the deposit money (verified and pending checks). */
export async function cancellationFacts(
  db: Reader,
  actor: StaffActor,
  v: { id: string; purpose: string; job_id: string | null },
): Promise<{ workStarted: boolean; depositPaidCents: number; depositPendingCents: number }> {
  if (!isWorkVisitPurpose(v.purpose) || v.job_id === null)
    return { workStarted: false, depositPaidCents: 0, depositPendingCents: 0 }
  const job = await db.selectFrom('work.jobs').select('operational_state').where('id', '=', v.job_id).executeTakeFirst()
  const visited = await db
    .selectFrom('work.visits')
    .select('id')
    .where('job_id', '=', v.job_id)
    .where('state', 'in', ['arrived', 'completed'])
    .executeTakeFirst()
  const deposit = await depositView(db, actor, v.job_id)
  return {
    workStarted:
      visited !== undefined ||
      (job !== undefined && (WORK_STARTED_JOB_STATES as readonly string[]).includes(job.operational_state)),
    depositPaidCents: deposit?.verifiedCents ?? 0,
    depositPendingCents: deposit?.pendingCents ?? 0,
  }
}

export type CancelInput = Initiation & {
  readonly reason?: string | undefined
  /** The customer's open cancellation request this cancellation confirms. */
  readonly changeRequestId?: string | undefined
}

/**
 * Cancels a confirmed visit with the version the caller saw: the visit is canceled (its reservations end
 * 'visit_canceled' and stay as history), the request it confirms is confirmed, the outcome of
 * FACT-CANCELLATION-RULES is computed and kept, an outcome with money opens the Owner's cancellation_outcome item, and
 * the change record and event are written. Refusals: NOT_FOUND, FORBIDDEN (a work visit by anyone but the Owner),
 * STALE_VERSION, VALIDATION_FAILED (REASON_REQUIRED, INITIATOR_REQUIRED, CAUSE_REQUIRED, ...), CONFLICT
 * (VISIT_NOT_CONFIRMED, the request's codes), NOT_CONFIGURED (cancellation.rules).
 */
export async function cancelVisit(
  tx: Tx,
  actor: StaffActor,
  scope: DataScope,
  visitId: string,
  input: CancelInput,
  deps: { now: Date; expectedVersion: number },
) {
  const v = await lockVisit(tx, visitId)
  if (!v || !scopeIncludesProject(scope, v.project_id)) throw new ApiError('NOT_FOUND')
  if (!holdsAction(actor, 'visit.cancel')) throw new ApiError('FORBIDDEN')
  if (!mayCancel(actor, v.purpose))
    throw new ApiError('FORBIDDEN', { fieldErrors: [field('visit', 'OWNER_CANCELS_WORK')] })
  if (v.version !== deps.expectedVersion) throw stale(v)
  if (v.state !== 'confirmed') throw new ApiError('CONFLICT', { fieldErrors: [field('state', 'VISIT_NOT_CONFIRMED')] })
  const reason = requiredReason(input.reason)
  const request = input.changeRequestId ? await openRequestFor(tx, v.id, input.changeRequestId, 'cancellation') : null
  if (request && input.initiator === 'handyhub')
    throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body.initiator', 'REQUEST_IS_CUSTOMER')] })
  const init = initiation(request ? { initiator: 'customer' } : input, true)
  const { rules, version: rulesVersion } = cancellationRules(await loadConfig(tx))
  const facts = await cancellationFacts(tx, actor, v)
  const outcome = cancellationOutcome(
    {
      initiator: init.initiator as CancellationInitiator,
      requestedAt: request ? new Date(request.requested_at) : deps.now,
      visitStartsAt: new Date(v.starts_at),
      workStarted: facts.workStarted,
      depositPaidCents: facts.depositPaidCents,
      estimateVisit: !isWorkVisitPurpose(v.purpose),
    },
    rules,
  )
  const team = await activeTeam(tx, v.id)
  if (request) {
    await endRequest(tx, request, actor, 'confirmed', null)
    // Before the visit's state changes, so its items read as confirmed (the database closes anything still open).
    await resolveRequestItems(tx, v.id, 'cancellation_confirmed')
  }
  // TSK-0067 (HH-COM-11): a canceled visit's reminders never send; cancelled here with the reason and audited.
  await stopAppointmentReminders(tx, v.id, { reason: 'visit_canceled' })
  const updated = await tx
    .updateTable('work.visits')
    .set({ state: 'canceled', version: v.version + 1, updated_at: sql<Date>`now()` })
    .where('id', '=', v.id)
    .returning(['version', 'window_version'])
    .executeTakeFirstOrThrow()
  const changeId = await recordChange(tx, {
    kind: 'canceled',
    visit: v,
    to: { version: updated.version, windowVersion: updated.window_version },
    fromWorkers: team.workers,
    toWorkers: [],
    initiator: init.initiator,
    cause: init.cause,
    reason,
    changeRequestId: request?.id ?? null,
    actor,
    cancellation: { outcome, rulesVersion, ...facts },
  })
  if (needsOwnerAction(outcome)) {
    const r = await requestOf(tx, v.project_id)
    const p = await tx.selectFrom('crm.projects').select('reference').where('id', '=', v.project_id).executeTakeFirst()
    await openQueueItem(tx, {
      type: 'cancellation_outcome',
      subjectId: v.project_id,
      reason: 'cancellation_outcome_requested',
      projectId: v.project_id,
      reference: p?.reference ?? r?.reference ?? null,
      status: outcome.kind,
    })
  }
  return {
    id: v.id,
    projectId: v.project_id,
    purpose: v.purpose,
    version: updated.version,
    changeId,
    outcome,
    initiator: init.initiator as CancellationInitiator,
    cause: init.cause,
    facts,
    requestId: request?.id ?? null,
    rulesVersion,
    reason,
  }
}

// --- Customer requests -----------------------------------------------------------------------------------------------

/** The visit states the customer's Appointments tab lists (visits/offers.ts appointmentsOf). */
const CUSTOMER_VISIBLE_STATES = ['confirmed', 'en_route', 'arrived', 'completed', 'canceled'] as const

export type CustomerChangeRequest = {
  readonly reference: string
  readonly number: number
  readonly kind: RequestKind
  readonly reason?: string | undefined
  readonly preferredTimes?: string | undefined
}

/**
 * The customer asks to reschedule or cancel a confirmed visit of a project in their scope (HH-PORT-04). The booking
 * does not change. The same request again (a retry or a second tab) answers the open one. Refusals: NOT_FOUND (another
 * project, an unknown number, a visit the customer does not see), CONFLICT on `appointment` (APPOINTMENT_NOT_CHANGEABLE: not confirmed;
 * REQUEST_ALREADY_OPEN: the other kind is open).
 */
export async function requestVisitChange(tx: Tx, actor: CustomerActor, scope: DataScope, input: CustomerChangeRequest) {
  const project = await findProject(tx, scope, { reference: input.reference })
  if (!project) throw new ApiError('NOT_FOUND')
  const v = await tx
    .selectFrom('work.visits')
    .selectAll()
    .where('project_id', '=', project.id)
    .where('number', '=', input.number)
    .forUpdate()
    .executeTakeFirst()
  // Only an appointment the customer can see is named: a tentative or expired visit is not one (T19).
  if (!v || !(CUSTOMER_VISIBLE_STATES as readonly string[]).includes(v.state)) throw new ApiError('NOT_FOUND')
  const open = await tx
    .selectFrom('work.visit_change_requests')
    .select(['id', 'kind'])
    .where('visit_id', '=', v.id)
    .where('state', '=', 'open')
    .executeTakeFirst()
  if (open) {
    if (open.kind === input.kind)
      return { id: open.id, visitId: v.id, projectId: v.project_id, purpose: v.purpose, created: false }
    throw new ApiError('CONFLICT', { fieldErrors: [field('appointment', 'REQUEST_ALREADY_OPEN')] })
  }
  if (v.state !== 'confirmed')
    throw new ApiError('CONFLICT', { fieldErrors: [field('appointment', 'APPOINTMENT_NOT_CHANGEABLE')] })
  const row = await tx
    .insertInto('work.visit_change_requests')
    .values({
      visit_id: v.id,
      project_id: v.project_id,
      kind: input.kind,
      requested_by_contact: actor.contactId,
      reason: input.reason?.trim() || null,
      preferred_times: input.kind === 'reschedule' ? input.preferredTimes?.trim() || null : null,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  const r = await requestOf(tx, v.project_id)
  const today = (await sql<{ d: string }>`SELECT (now() AT TIME ZONE ${v.time_zone})::date::text AS d`.execute(tx))
    .rows[0]?.d
  const item = {
    subjectId: v.id,
    projectId: v.project_id,
    reference: project.reference,
    status: 'confirmed',
    band: today === v.local_date ? ('today_change' as const) : ('time_sensitive' as const),
    dueAt: new Date(new Date(v.starts_at).getTime() - (v.travel_buffer_minutes ?? 0) * 60_000),
    assignedStaffId: r?.responsible_staff_id ?? null,
  }
  await openQueueItem(tx, {
    type: CHANGE_REQUEST_QUEUE_TYPE,
    reason: input.kind === 'reschedule' ? 'reschedule_requested' : 'cancellation_requested',
    ...item,
  })
  // Cancelling accepted, scheduled work routes to the Owner for cancellation and financial review (HH-SCH-07).
  if (input.kind === 'cancellation' && isWorkVisitPurpose(v.purpose))
    await openQueueItem(tx, {
      type: WORK_CANCELLATION_QUEUE_TYPE,
      reason: 'work_cancellation_requested',
      ...item,
      assignedStaffId: null,
    })
  return { id: row.id, visitId: v.id, projectId: v.project_id, purpose: v.purpose, created: true }
}

/**
 * Staff decline an open request with the request version they saw and a reason: the booking stays exactly as it is.
 * Refusals: NOT_FOUND, FORBIDDEN (a work visit's cancellation request: the Owner, PROPOSED), STALE_VERSION,
 * VALIDATION_FAILED (REASON_REQUIRED), CONFLICT (REQUEST_<state> for one that already ended).
 */
export async function declineRequest(
  tx: Tx,
  actor: StaffActor,
  scope: DataScope,
  requestId: string,
  input: { reason?: string | undefined },
  deps: { expectedVersion: number },
) {
  const r = await tx
    .selectFrom('work.visit_change_requests as r')
    .innerJoin('work.visits as v', 'v.id', 'r.visit_id')
    .select(['r.id', 'r.kind', 'r.state', 'r.version', 'r.visit_id', 'r.project_id', 'v.purpose'])
    .where('r.id', '=', requestId)
    .forUpdate('r')
    .executeTakeFirst()
  if (!r || !scopeIncludesProject(scope, r.project_id)) throw new ApiError('NOT_FOUND')
  const allowed = r.kind === 'reschedule' ? holdsAction(actor, 'visit.reschedule') : mayCancel(actor, r.purpose)
  if (!allowed) throw new ApiError('FORBIDDEN')
  if (r.version !== deps.expectedVersion)
    throw new ApiError('STALE_VERSION', { current: { version: r.version, values: { state: r.state } } })
  if (r.state !== 'open')
    throw new ApiError('CONFLICT', { fieldErrors: [field('request', `REQUEST_${r.state.toUpperCase()}`)] })
  const reason = requiredReason(input.reason)
  await endRequest(tx, r, actor, 'declined', reason)
  await resolveRequestItems(tx, r.visit_id, 'request_declined')
  return { id: r.id, kind: r.kind, visitId: r.visit_id, projectId: r.project_id, version: r.version + 1, reason }
}

// --- Views -----------------------------------------------------------------------------------------------------------

type StaffRef = { id: string; name: string | null }

export type OutcomeView = {
  kind: string
  noticeMinutes: number
  keptCents: number | null
  refundCents: number | null
  invoiceCents: number | null
}
const outcomeView = (o: CancellationOutcome): OutcomeView => ({
  kind: o.kind,
  noticeMinutes: o.noticeMinutes,
  keptCents: o.keptCents,
  refundCents: o.refundCents,
  invoiceCents: o.invoiceCents,
})

export type ChangeRequestView = {
  id: string
  kind: string
  state: string
  version: number
  requestedAt: string
  reason: string | null
  preferredTimes: string | null
  /** For an open cancellation request: the outcome if staff confirm it now (notice from the request). */
  outcome: OutcomeView | null
  actions: { confirm: boolean; decline: boolean }
}

export type CancellationPreview = {
  depositPaidCents: number
  depositPendingCents: number
  workStarted: boolean
  /** The outcome of a cancellation recorded now: asked for by the customer, or by HandyHub. */
  customer: OutcomeView
  handyhub: OutcomeView
  rulesProposed: boolean
}

export type ChangeView = {
  id: string
  kind: string
  fromVersion: number
  toVersion: number
  fromWindowVersion: number
  toWindowVersion: number
  fromWorkers: StaffRef[]
  toWorkers: StaffRef[]
  initiator: string | null
  handyhubCause: string | null
  reason: string
  changeRequestId: string | null
  changedBy: StaffRef
  changedAt: string
  cancellation: {
    outcome: OutcomeView
    workStarted: boolean
    depositPaidCents: number
    depositPendingCents: number
    rulesVersion: number
  } | null
}

const num = (n: unknown) => (n === null || n === undefined ? null : Number(n))

/**
 * The change facts of these visits for staff: each visit's open request (with the outcome a confirmed cancellation
 * would have), the cancellation preview of a confirmed visit the caller may cancel, and the committed changes, newest
 * first. The actions are offered only; the server decides again on every write.
 */
export async function changeFacts(
  db: Reader,
  actor: StaffActor,
  visits: readonly {
    id: string
    purpose: string
    state: string
    job_id: string | null
    starts_at: Date
  }[],
  names: (ids: string[]) => Promise<Map<string, StaffRef>>,
  now: Date,
) {
  const ids = visits.map((v) => v.id)
  const requests = new Map<string, ChangeRequestView>()
  const previews = new Map<string, CancellationPreview>()
  const changes = new Map<string, ChangeView[]>()
  if (ids.length === 0) return { requests, previews, changes }
  const config = await loadConfig(db)
  const rules = (() => {
    try {
      return cancellationRules(config)
    } catch {
      return null
    }
  })()
  const open = await db
    .selectFrom('work.visit_change_requests')
    .selectAll()
    .where('visit_id', 'in', ids)
    .where('state', '=', 'open')
    .execute()
  const rows = await db
    .selectFrom('work.visit_changes')
    .selectAll()
    .where('visit_id', 'in', ids)
    .orderBy('changed_at', 'desc')
    .orderBy('to_version', 'desc')
    .execute()
  const refs = await names([...new Set(rows.flatMap((r) => [r.changed_by, ...r.from_workers, ...r.to_workers]))])
  const ref = (id: string) => refs.get(id) ?? { id, name: null }
  for (const v of visits) {
    const factsFor = async () => cancellationFacts(db, actor, v)
    const outcomeAt = async (initiator: CancellationInitiator, at: Date) => {
      if (!rules) return null
      const f = await factsFor()
      return outcomeView(
        cancellationOutcome(
          {
            initiator,
            requestedAt: at,
            visitStartsAt: new Date(v.starts_at),
            workStarted: f.workStarted,
            depositPaidCents: f.depositPaidCents,
            estimateVisit: !isWorkVisitPurpose(v.purpose),
          },
          rules.rules,
        ),
      )
    }
    const r = open.find((x) => x.visit_id === v.id)
    if (r)
      requests.set(v.id, {
        id: r.id,
        kind: r.kind,
        state: r.state,
        version: r.version,
        requestedAt: new Date(r.requested_at).toISOString(),
        reason: r.reason,
        preferredTimes: r.preferred_times,
        outcome: r.kind === 'cancellation' ? await outcomeAt('customer', new Date(r.requested_at)) : null,
        actions: {
          confirm:
            v.state === 'confirmed' &&
            (r.kind === 'reschedule' ? holdsAction(actor, 'visit.reschedule') : mayCancel(actor, v.purpose)),
          decline: r.kind === 'reschedule' ? holdsAction(actor, 'visit.reschedule') : mayCancel(actor, v.purpose),
        },
      })
    if (v.state === 'confirmed' && mayCancel(actor, v.purpose) && rules) {
      const f = await factsFor()
      const customer = await outcomeAt('customer', now)
      const handyhub = await outcomeAt('handyhub', now)
      if (customer && handyhub)
        previews.set(v.id, {
          depositPaidCents: f.depositPaidCents,
          depositPendingCents: f.depositPendingCents,
          workStarted: f.workStarted,
          customer,
          handyhub,
          rulesProposed: rules.proposed,
        })
    }
    changes.set(
      v.id,
      rows
        .filter((c) => c.visit_id === v.id)
        .map((c) => ({
          id: c.id,
          kind: c.kind,
          fromVersion: c.from_version,
          toVersion: c.to_version,
          fromWindowVersion: c.from_window_version,
          toWindowVersion: c.to_window_version,
          fromWorkers: c.from_workers.map(ref),
          toWorkers: c.to_workers.map(ref),
          initiator: c.initiator,
          handyhubCause: c.handyhub_cause,
          reason: c.reason,
          changeRequestId: c.change_request_id,
          changedBy: ref(c.changed_by),
          changedAt: new Date(c.changed_at).toISOString(),
          cancellation:
            c.kind === 'canceled' && c.outcome !== null
              ? {
                  outcome: {
                    kind: c.outcome,
                    noticeMinutes: c.notice_minutes ?? 0,
                    keptCents: num(c.kept_cents),
                    refundCents: num(c.refund_cents),
                    invoiceCents: num(c.invoice_cents),
                  },
                  workStarted: c.work_started ?? false,
                  depositPaidCents: Number(c.deposit_paid_cents ?? 0),
                  depositPendingCents: Number(c.deposit_pending_cents ?? 0),
                  rulesVersion: c.rules_version ?? 0,
                }
              : null,
        })),
    )
  }
  return { requests, previews, changes }
}

/** The customer's view of a visit's latest request: awaiting confirmation while open, declined once declined. */
export async function customerRequestsOf(db: Reader, visitIds: readonly string[]) {
  const out = new Map<string, { kind: RequestKind; status: 'awaiting_confirmation' | 'declined' }>()
  if (visitIds.length === 0) return out
  const rows = await db
    .selectFrom('work.visit_change_requests')
    .select(['visit_id', 'kind', 'state', 'requested_at'])
    .where('visit_id', 'in', [...visitIds])
    .orderBy('requested_at', 'desc')
    .orderBy('id', 'desc')
    .execute()
  const seen = new Set<string>()
  for (const r of rows) {
    if (seen.has(r.visit_id)) continue
    seen.add(r.visit_id)
    if (r.state === 'open' || r.state === 'declined')
      out.set(r.visit_id, {
        kind: r.kind as RequestKind,
        status: r.state === 'open' ? 'awaiting_confirmation' : 'declined',
      })
  }
  return out
}

// --- Notices (FACT-AUTOMATIC-MESSAGES #11 and the staff schedule-change notice) ---------------------------------------

export type ChangeNoticeDeps = { providers: NotificationProviders; staffAppUrl?: string | undefined }

async function changeOf(tx: Tx, job: { payload: unknown }) {
  const p = job.payload as { changeId?: unknown } | null
  const id = typeof p?.changeId === 'string' && /^[0-9a-f-]{36}$/i.test(p.changeId) ? p.changeId : null
  if (!id) return null
  return (await tx.selectFrom('work.visit_changes').selectAll().where('id', '=', id).executeTakeFirst()) ?? null
}

/**
 * #11 "Appointment changed" (OWN-DEC-119): once per committed reschedule or reassignment, after commit. At send time
 * the visit must still be confirmed at the version the change reached: a change superseded by a newer one, or a visit
 * canceled or under way since, sends nothing (stale). A cancellation is not on the list and never sends this.
 */
export function appointmentChangedAutomation(deps: ChangeNoticeDeps): Automation {
  return notificationAutomation({
    messageKey: APPOINTMENT_CHANGED_NOTICE,
    providers: deps.providers,
    resolve: async ({ tx, job }) => {
      const c = await changeOf(tx, job)
      if (!c || c.kind === 'canceled') return 'stale'
      const v = await tx.selectFrom('work.visits').selectAll().where('id', '=', c.visit_id).executeTakeFirst()
      if (!v || v.state !== 'confirmed' || v.version !== c.to_version) return 'stale'
      const r = await requestOf(tx, v.project_id)
      if (!r) return 'stale'
      return {
        subjectKey: `visit_change:${c.id}`,
        record: { type: 'visit', id: v.id },
        recipients: [{ kind: 'customer_contact', id: r.contactId, destinations: destinationsOf(r) }],
        // Customer messages are English (RULE-LANGUAGES); the secure project link is not supplied yet.
        values: { visitWindow: windowText(storedWindow(v), 'en-US') },
        failureItem: { reference: r.reference, projectId: v.project_id, assignedStaffId: r.responsible_staff_id },
      }
    },
  })
}

/**
 * The staff notice of a schedule change (FACT-AUTOMATIC-MESSAGES staff notifications, OWN-DEC-119): once per committed
 * change, to every affected worker (the team before and after) with an active account, by email in their own
 * language. Its wording is not approved yet, so each delivery is recorded as template_not_configured.
 */
export function scheduleChangeStaffAutomation(deps: ChangeNoticeDeps): Automation {
  return notificationAutomation({
    messageKey: SCHEDULE_CHANGE_STAFF_NOTICE,
    providers: deps.providers,
    resolve: async ({ tx, job }) => {
      const c = await changeOf(tx, job)
      if (!c) return 'stale'
      const ids = [...new Set([...c.from_workers, ...c.to_workers])]
      if (ids.length === 0) return 'stale'
      const staff = await tx
        .selectFrom('identity.staff_users')
        .select(['id', 'email', 'locale'])
        .where('id', 'in', ids)
        .where('status', '=', 'active')
        .orderBy('id')
        .execute()
      if (staff.length === 0) return 'stale'
      const appLink = deps.staffAppUrl ? `${deps.staffAppUrl.replace(/\/$/, '')}/schedule/${c.visit_id}` : null
      return {
        subjectKey: `visit_change:${c.id}`,
        record: { type: 'visit', id: c.visit_id },
        recipients: staff.map((s) => ({
          kind: 'staff_user' as const,
          id: s.id,
          staffLocale: s.locale === 'es' ? ('es' as const) : ('en' as const),
          destinations: [{ channel: 'email' as const, destination: s.email, permission: 'staff_account' as const }],
        })),
        values: appLink ? { appLink } : {},
        projectId: c.project_id,
      }
    },
  })
}
