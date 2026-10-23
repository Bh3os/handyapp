// Visit outcomes (TSK-0078; HH-SCH-09, HH-WORK-03, HH-PORT-07, ENT-Visit, OWN-DEC-68, OWN-DEC-107, RULE-SERVER-AUTHZ).
// Migration 0089 keeps the records true whatever path writes.
// - A worker assigned to the visit (or the Owner) records one explicit outcome with a note: delay, no access, customer
//   absent, weather, missing resources or a readiness issue, while the visit is confirmed, on the way or arrived. In the
//   same transaction, under the visit's row lock, it opens the staff follow-up item visit_outcome (one per outcome),
//   assigned to the request's responsible staff member when there is one.
// - Only "no access" changes the visit: to no_access (final; its reservations and waiting appointment reminders end),
//   refused once work started on the visit. No outcome completes a visit or marks work done; customer absence does not
//   start work (Start Work needs the customer present or the Owner-approved exception, HH-WORK-03).
// - The customer sees only "Update pending" while a follow-up is open: no note, no reason, no worker and never an
//   arrival time (HH-SCH-09: a delay is told by staff from the recorded window or an approved update).
// - Staff record the follow-up once (what was done: rescheduled, cancelled, the customer contacted), which resolves the
//   item. Rescheduling and cancelling themselves stay the visit routes' (TSK-0066).
import type { Db, Tx } from '@handyhub/db'
import {
  localDateOf,
  VISIT_MACHINE,
  VISIT_OUTCOME_NOTE_MAX,
  transition,
  visitOutcome,
  type VisitOutcomeKind,
  type VisitState,
} from '@handyhub/domain'
import type { StaffActor } from '@handyhub/policy'
import { ApiError, type FieldError } from '../../api/errors.js'
import { openQueueItem, resolveQueueItem } from '../queue/index.js'
import { stopAppointmentReminders } from '../visits/reminders.js'
import { moveVisit } from './taps.js'

type Reader = Db | Tx

export const VISIT_OUTCOME_QUEUE_TYPE = 'visit_outcome'

const field = (f: string, code: string): FieldError => ({ field: f, code, message: '' })

export type OutcomeRecord = {
  outcomeId: string
  visitId: string
  kind: VisitOutcomeKind
  visitState: string
  recordedAt: Date
  queueItemId: string
}

/** Records one outcome on a visit (see the header). The caller authorizes and audits. */
export async function recordVisitOutcome(
  tx: Tx,
  actor: StaffActor,
  visitId: string,
  input: { kind: VisitOutcomeKind; note: string },
  now = new Date(),
): Promise<OutcomeRecord> {
  const v = await tx
    .selectFrom('work.visits as v')
    .innerJoin('crm.projects as p', 'p.id', 'v.project_id')
    .leftJoin('intake.requests as r', 'r.project_id', 'v.project_id')
    .select([
      'v.id',
      'v.project_id',
      'v.job_id',
      'v.state',
      'v.version',
      'v.local_date',
      'v.time_zone',
      'p.reference',
      'r.responsible_staff_id',
    ])
    .where('v.id', '=', visitId)
    .forUpdate('v')
    .executeTakeFirst()
  if (!v) throw new ApiError('NOT_FOUND')
  const started = await tx
    .selectFrom('work.work_starts')
    .select('id')
    .where('visit_id', '=', visitId)
    .executeTakeFirst()
  const decided = visitOutcome({
    kind: input.kind,
    visitState: v.state,
    workStarted: started !== undefined,
    note: input.note,
  })
  if (!decided.ok)
    throw decided.problem === 'NOTE_REQUIRED' || decided.problem === 'NOTE_TOO_LONG'
      ? new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body.note', decided.problem)] })
      : new ApiError('CONFLICT', { fieldErrors: [field('visit', decided.problem)] })
  const row = await tx
    .insertInto('work.visit_outcomes')
    .values({
      visit_id: visitId,
      project_id: v.project_id,
      job_id: v.job_id,
      kind: input.kind,
      note: input.note.trim(),
      visit_state: v.state,
      recorded_by: actor.userId,
      recorded_at: now,
    })
    .returning(['id', 'recorded_at'])
    .executeTakeFirstOrThrow()
  let state = v.state
  if (decided.visitTo === 'no_access') {
    const t = transition(VISIT_MACHINE, { state: v.state as VisitState, version: v.version }, 'record_no_access', {
      actor: 'staff',
      expectedVersion: v.version,
      now,
      facts: {},
    })
    if (!t.ok) throw new ApiError('CONFLICT', { fieldErrors: [field('visit', 'VISIT_NOT_OPEN')] })
    // The visit leaves its booked states: its waiting appointment reminders are outdated (TSK-0067).
    await stopAppointmentReminders(tx, visitId, { reason: 'visit_no_access' })
    await moveVisit(tx, visitId, v.state, t.to, v.version)
    state = t.to
  }
  // The follow-up: on the visit's own date it is today's appointment change (PROPOSED band, OQ-VISIT-OUTCOME-DETAILS).
  const today = String(v.local_date).slice(0, 10) === localDateOf(now, v.time_zone)
  const item = await openQueueItem(tx, {
    type: VISIT_OUTCOME_QUEUE_TYPE,
    subjectId: row.id,
    reason: input.kind,
    projectId: v.project_id,
    reference: v.reference,
    status: state,
    assignedStaffId: v.responsible_staff_id ?? null,
    ...(today ? { band: 'today_change' as const } : {}),
    openedAt: now,
  })
  return {
    outcomeId: row.id,
    visitId,
    kind: input.kind,
    visitState: state,
    recordedAt: row.recorded_at,
    queueItemId: item.id,
  }
}

/** Records the staff follow-up of an outcome, once, and resolves its item. */
export async function followUpVisitOutcome(
  tx: Tx,
  actor: StaffActor,
  outcomeId: string,
  input: { note: string },
  now = new Date(),
) {
  const note = input.note.trim()
  if (!note) throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body.note', 'NOTE_REQUIRED')] })
  if (note.length > VISIT_OUTCOME_NOTE_MAX)
    throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body.note', 'NOTE_TOO_LONG')] })
  const o = await tx
    .selectFrom('work.visit_outcomes')
    .select(['id', 'visit_id', 'followed_up_at'])
    .where('id', '=', outcomeId)
    .forUpdate()
    .executeTakeFirst()
  if (!o) throw new ApiError('NOT_FOUND')
  if (o.followed_up_at !== null)
    throw new ApiError('CONFLICT', { fieldErrors: [field('outcome', 'ALREADY_FOLLOWED_UP')] })
  await tx
    .updateTable('work.visit_outcomes')
    .set({ followed_up_by: actor.userId, followed_up_at: now, follow_up_note: note })
    .where('id', '=', outcomeId)
    .execute()
  await resolveQueueItem(tx, {
    type: VISIT_OUTCOME_QUEUE_TYPE,
    subjectId: outcomeId,
    resolution: 'followed_up',
  })
  return { outcomeId, visitId: o.visit_id, followedUpAt: now }
}

export type OutcomeView = {
  outcomeId: string
  visitId: string
  reference: string
  kind: VisitOutcomeKind
  note: string
  visitState: string
  visitNow: string
  localDate: string
  recordedBy: { id: string; name: string | null }
  recordedAt: string
  followUp: { by: { id: string; name: string | null }; at: string; note: string } | null
}

/** One outcome as staff read it (the follow-up screen and the queue's deep link). */
export async function visitOutcomeView(db: Reader, outcomeId: string): Promise<OutcomeView | null> {
  const o = await db
    .selectFrom('work.visit_outcomes as o')
    .innerJoin('work.visits as v', 'v.id', 'o.visit_id')
    .innerJoin('crm.projects as p', 'p.id', 'o.project_id')
    .innerJoin('identity.staff_users as r', 'r.id', 'o.recorded_by')
    .leftJoin('identity.staff_users as f', 'f.id', 'o.followed_up_by')
    .select([
      'o.id',
      'o.visit_id',
      'o.kind',
      'o.note',
      'o.visit_state',
      'o.recorded_by',
      'o.recorded_at',
      'o.followed_up_by',
      'o.followed_up_at',
      'o.follow_up_note',
      'v.state as visit_now',
      'v.local_date',
      'p.reference',
      'r.display_name as recorded_name',
      'f.display_name as follow_up_name',
    ])
    .where('o.id', '=', outcomeId)
    .executeTakeFirst()
  if (!o) return null
  return {
    outcomeId: o.id,
    visitId: o.visit_id,
    reference: o.reference,
    kind: o.kind as VisitOutcomeKind,
    note: o.note,
    visitState: o.visit_state,
    visitNow: o.visit_now,
    localDate: String(o.local_date).slice(0, 10),
    recordedBy: { id: o.recorded_by, name: o.recorded_name },
    recordedAt: o.recorded_at.toISOString(),
    followUp:
      o.followed_up_by && o.followed_up_at && o.follow_up_note
        ? {
            by: { id: o.followed_up_by, name: o.follow_up_name },
            at: o.followed_up_at.toISOString(),
            note: o.follow_up_note,
          }
        : null,
  }
}

/** A visit's outcomes, oldest first (My Day shows the caller what was already recorded). */
export async function outcomesOfVisit(db: Reader, visitId: string) {
  const rows = await db
    .selectFrom('work.visit_outcomes')
    .select(['id', 'kind', 'recorded_at', 'followed_up_at'])
    .where('visit_id', '=', visitId)
    .orderBy('recorded_at')
    .execute()
  return rows.map((r) => ({
    outcomeId: r.id,
    kind: r.kind as VisitOutcomeKind,
    recordedAt: r.recorded_at.toISOString(),
    followedUp: r.followed_up_at !== null,
  }))
}

/** Whether a project has an outcome still waiting for staff follow-up (the customer's "Update pending"). */
export async function openVisitOutcome(db: Reader, projectId: string): Promise<boolean> {
  const r = await db
    .selectFrom('work.visit_outcomes')
    .select('id')
    .where('project_id', '=', projectId)
    .where('followed_up_at', 'is', null)
    .limit(1)
    .executeTakeFirst()
  return r !== undefined
}
