// The sync queue's server side (TSK-0080; HH-OFF-05, HH-OFF-06, HH-OFF-07, T27, T51, ENT-FieldEvent, OWN-DEC-121,
// RULE-SERVER-AUTHZ, RULE-SAFETY-GATES). Migration 0090 keeps the records true whatever path writes.
// - A phone uploads each event it saved (today: the On my way, Arrived and Finished taps of TSK-0079) with the UUID it
//   generated. The UUID is the event's key: an event resent any number of times is ingested once and answers what it
//   answered the first time, so a retry never records a second timestamp.
// - Each event is decided again on arrival, under an advisory lock of its UUID, from the server's own records:
//   - the uploader's account and session are the request's (a disabled worker's sessions are revoked, so their phone
//     cannot upload at all; their evidence reaches the server only through the Owner's recovery upload);
//   - the worker must have been assigned to the visit when the phone recorded the event and still be assigned now
//     (the policy's tap decision, then the tap's own checks); otherwise the event is kept for the Owner's review and
//     never applied (not_assigned);
//   - the tap is then applied through the same path as an online tap (taps.ts), with the phone's time kept beside the
//     server's. One the visit's newer state refuses (canceled, rescheduled away, already finished...) is kept for the
//     Owner's review, never applied over the newer state and never last-write-wins (conflict);
//   - the Owner may upload events another account's phone holds (a disabled or reassigned worker's): they are kept
//     for review only, never applied (recovered).
// - Every event in review opens the Owner's queue item field_event_review; the Owner records once what was done
//   (correct a timestamp with the existing correction, or nothing to apply). Nothing is ever deleted.
import type { Db, Tx } from '@handyhub/db'
import type { FieldTap } from '@handyhub/domain'
import { decide, type StaffActor } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError, type FieldError } from '../../api/errors.js'
import { openQueueItem, resolveQueueItem } from '../queue/index.js'
import { holdsAction } from '../visits/changes.js'
import { recordTap, visitAssignments } from './taps.js'

type Reader = Db | Tx

export const FIELD_EVENT_TYPES = ['tap_on_my_way', 'tap_arrived', 'tap_finished'] as const
export type FieldEventType = (typeof FIELD_EVENT_TYPES)[number]
export const FIELD_EVENT_QUEUE_TYPE = 'field_event_review'
export const FIELD_EVENT_NOTE_MAX = 2000

const TAP_OF: Record<FieldEventType, FieldTap> = {
  tap_on_my_way: 'on_my_way',
  tap_arrived: 'arrived',
  tap_finished: 'finished',
}
/** The visit states that end it: no tap is recorded on them (field-day.ts tapDecision). */
const CLOSED_STATES: readonly string[] = ['canceled', 'expired', 'no_access']
const REASON_OF = {
  conflict: 'sync_conflict',
  not_assigned: 'sync_not_assigned',
  recovered: 'sync_recovered',
} as const

export type FieldEventInput = {
  clientId: string
  type: FieldEventType
  visitId: string
  /** Who recorded it on the phone; the caller when omitted. */
  actorId?: string | undefined
  baseVersion?: number | undefined
  deviceRecordedAt: string
  attempt?: number | undefined
}

export type FieldEventState = 'synchronized' | 'needs_review' | 'reviewed'
export type FieldEventOutcome = 'applied' | 'already_recorded' | 'conflict' | 'not_assigned' | 'recovered'
export type FieldEventResult = {
  clientId: string
  state: FieldEventState
  outcome: FieldEventOutcome
  detail: string | null
  visitId: string
  receivedAt: string
  /** This request recorded it (false: the same event was received before and is answered as it was then). */
  ingested: boolean
}

const field = (f: string, code: string): FieldError => ({ field: f, code, message: '' })

/** Whether the worker held a confirmed reservation of the visit at that moment (ended reservations included). */
async function assignedAt(tx: Tx, visitId: string, staffUserId: string, at: Date): Promise<boolean> {
  const r = await tx
    .selectFrom('work.reservations')
    .select('id')
    .where('visit_id', '=', visitId)
    .where('staff_user_id', '=', staffUserId)
    .where('resource', '=', 'worker')
    .where('kind', '=', 'confirmed')
    .where('created_at', '<=', at)
    .where((eb) => eb.or([eb('ended_at', 'is', null), eb('ended_at', '>', at)]))
    .executeTakeFirst()
  return r !== undefined
}

function resultOf(
  row: {
    client_id: string
    state: string
    outcome: string
    detail: string | null
    visit_id: string
    received_at: Date
  },
  ingested: boolean,
): FieldEventResult {
  return {
    clientId: row.client_id,
    state: row.state as FieldEventState,
    outcome: row.outcome as FieldEventOutcome,
    detail: row.detail,
    visitId: row.visit_id,
    receivedAt: row.received_at.toISOString(),
    ingested,
  }
}

/** Ingests one field event a phone uploaded (see the header). The caller authorizes the upload and audits. */
export async function ingestFieldEvent(
  tx: Tx,
  actor: StaffActor,
  input: FieldEventInput,
  now = new Date(),
): Promise<FieldEventResult & { projectId: string; visitVersion: number | null }> {
  const recordedBy = input.actorId ?? actor.userId
  const device = new Date(input.deviceRecordedAt)
  // One event at a time per UUID: two uploads of the same event never both apply it.
  await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`field_event:${input.clientId}`}, 0))`.execute(tx)
  const seen = await tx
    .selectFrom('work.field_events')
    .selectAll()
    .where('client_id', '=', input.clientId)
    .executeTakeFirst()
  if (seen) {
    // The same UUID for a different event is the phone's error, never a second event.
    if (
      seen.actor_id !== recordedBy ||
      seen.uploaded_by !== actor.userId ||
      seen.type !== input.type ||
      seen.visit_id !== input.visitId ||
      seen.device_recorded_at.getTime() !== device.getTime()
    )
      throw new ApiError('CONFLICT', { fieldErrors: [field('body.clientId', 'CLIENT_ID_REUSED')] })
    return { ...resultOf(seen, false), projectId: seen.project_id, visitVersion: null }
  }
  const v = await tx
    .selectFrom('work.visits as v')
    .innerJoin('crm.projects as p', 'p.id', 'v.project_id')
    .select(['v.id', 'v.project_id', 'v.job_id', 'v.state', 'v.version', 'p.reference'])
    .where('v.id', '=', input.visitId)
    .executeTakeFirst()
  if (!v) throw new ApiError('NOT_FOUND')

  let outcome: FieldEventOutcome
  let detail: string | null = null
  let visitVersion: number | null = null
  const tap = TAP_OF[input.type]
  if (recordedBy !== actor.userId) {
    // The recovery upload: another account's evidence, from a phone the Owner holds. Kept for review, never applied.
    if (!holdsAction(actor, 'visit.correct_timestamps')) throw new ApiError('FORBIDDEN')
    const known = await tx
      .selectFrom('identity.staff_users')
      .select('id')
      .where('id', '=', recordedBy)
      .executeTakeFirst()
    if (!known) throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body.actorId', 'UNKNOWN_STAFF')] })
    outcome = 'recovered'
  } else {
    const facts = { projectId: v.project_id, assignments: await visitAssignments(tx, v.id) }
    const allowed = decide(actor, `visit.tap_${tap}`, facts, { now, online: true })
    if (!(await assignedAt(tx, v.id, actor.userId, device))) {
      outcome = 'not_assigned'
      detail = 'NOT_ASSIGNED_THEN'
    } else if (CLOSED_STATES.includes(v.state)) {
      // A visit canceled, expired or without access since: its reservations ended with it, so this is the visit's
      // newer state, not a reassignment.
      outcome = 'conflict'
      detail = 'VISIT_NOT_ACTIVE'
    } else if (allowed.effect !== 'allow') {
      outcome = 'not_assigned'
      detail = 'NOT_ASSIGNED_NOW'
    } else {
      // The tap as an online tap would record it. Every refusal of the tap is decided before it writes anything
      // (taps.ts), so a refused event leaves nothing behind. No savepoint: the database checks that a visit's state
      // change and its record share one transaction id (migration 0062).
      try {
        const out = await recordTap(tx, actor, v.id, tap, { deviceRecordedAt: input.deviceRecordedAt }, now)
        outcome = out.recorded ? 'applied' : 'already_recorded'
        visitVersion = out.version
      } catch (e) {
        // VISIT_CHANGED comes after a write: the whole upload fails and the phone retries it.
        if (!(e instanceof ApiError) || e.options.fieldErrors?.[0]?.code === 'VISIT_CHANGED') throw e
        if (e.code === 'FORBIDDEN') {
          outcome = 'not_assigned'
          detail = 'NOT_ASSIGNED_NOW'
        } else if (e.code === 'CONFLICT' || e.code === 'NOT_CONFIGURED') {
          outcome = 'conflict'
          detail = e.options.fieldErrors?.[0]?.code ?? 'CONFLICT'
        } else throw e
      }
    }
  }
  const synchronized = outcome === 'applied' || outcome === 'already_recorded'
  const row = await tx
    .insertInto('work.field_events')
    .values({
      client_id: input.clientId,
      actor_id: recordedBy,
      uploaded_by: actor.userId,
      type: input.type,
      visit_id: v.id,
      project_id: v.project_id,
      job_id: v.job_id,
      base_version: input.baseVersion ?? null,
      device_recorded_at: device,
      received_at: now,
      payload: JSON.stringify({ tap }),
      attachment_refs: JSON.stringify([]),
      attempts: input.attempt ?? 1,
      state: synchronized ? 'synchronized' : 'needs_review',
      outcome,
      detail,
    })
    .returningAll()
    .executeTakeFirstOrThrow()
  if (!synchronized) {
    await openQueueItem(tx, {
      type: FIELD_EVENT_QUEUE_TYPE,
      subjectId: row.client_id,
      reason: REASON_OF[outcome as keyof typeof REASON_OF],
      projectId: v.project_id,
      reference: v.reference,
      status: 'needs_review',
      openedAt: now,
    })
  }
  return { ...resultOf(row, true), projectId: v.project_id, visitVersion }
}

/** Records the Owner's review of an event in review, once, and resolves its item. */
export async function reviewFieldEvent(
  tx: Tx,
  actor: StaffActor,
  clientId: string,
  input: { note: string },
  now = new Date(),
) {
  const note = input.note.trim()
  if (!note) throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body.note', 'NOTE_REQUIRED')] })
  if (note.length > FIELD_EVENT_NOTE_MAX)
    throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body.note', 'NOTE_TOO_LONG')] })
  const e = await tx
    .selectFrom('work.field_events')
    .select(['client_id', 'state', 'project_id'])
    .where('client_id', '=', clientId)
    .forUpdate()
    .executeTakeFirst()
  if (!e) throw new ApiError('NOT_FOUND')
  if (e.state !== 'needs_review')
    throw new ApiError('CONFLICT', {
      fieldErrors: [field('fieldEvent', e.state === 'reviewed' ? 'ALREADY_REVIEWED' : 'NOT_IN_REVIEW')],
    })
  await tx
    .updateTable('work.field_events')
    .set({ state: 'reviewed', reviewed_by: actor.userId, reviewed_at: now, review_note: note })
    .where('client_id', '=', clientId)
    .execute()
  await resolveQueueItem(tx, { type: FIELD_EVENT_QUEUE_TYPE, subjectId: clientId, resolution: 'reviewed' })
  return { clientId, projectId: e.project_id }
}

export type FieldEventView = {
  clientId: string
  type: FieldEventType
  visitId: string
  reference: string
  localDate: string
  visitState: string
  recordedBy: { id: string; name: string | null }
  uploadedBy: { id: string; name: string | null }
  deviceRecordedAt: string
  receivedAt: string
  attempts: number
  state: FieldEventState
  outcome: FieldEventOutcome
  detail: string | null
  review: { by: { id: string; name: string | null }; at: string; note: string } | null
}

/** One field event as the Owner reads it (the review screen and the queue's deep link). */
export async function fieldEventView(db: Reader, clientId: string): Promise<FieldEventView | null> {
  const e = await db
    .selectFrom('work.field_events as e')
    .innerJoin('work.visits as v', 'v.id', 'e.visit_id')
    .innerJoin('crm.projects as p', 'p.id', 'e.project_id')
    .innerJoin('identity.staff_users as a', 'a.id', 'e.actor_id')
    .innerJoin('identity.staff_users as u', 'u.id', 'e.uploaded_by')
    .leftJoin('identity.staff_users as r', 'r.id', 'e.reviewed_by')
    .select([
      'e.client_id',
      'e.type',
      'e.visit_id',
      'e.actor_id',
      'e.uploaded_by',
      'e.device_recorded_at',
      'e.received_at',
      'e.attempts',
      'e.state',
      'e.outcome',
      'e.detail',
      'e.reviewed_by',
      'e.reviewed_at',
      'e.review_note',
      'v.state as visit_state',
      'v.local_date',
      'p.reference',
      'a.display_name as actor_name',
      'u.display_name as uploader_name',
      'r.display_name as reviewer_name',
    ])
    .where('e.client_id', '=', clientId)
    .executeTakeFirst()
  if (!e) return null
  return {
    clientId: e.client_id,
    type: e.type as FieldEventType,
    visitId: e.visit_id,
    reference: e.reference,
    localDate: String(e.local_date).slice(0, 10),
    visitState: e.visit_state,
    recordedBy: { id: e.actor_id, name: e.actor_name },
    uploadedBy: { id: e.uploaded_by, name: e.uploader_name },
    deviceRecordedAt: e.device_recorded_at.toISOString(),
    receivedAt: e.received_at.toISOString(),
    attempts: e.attempts,
    state: e.state as FieldEventState,
    outcome: e.outcome as FieldEventOutcome,
    detail: e.detail,
    review:
      e.reviewed_by && e.reviewed_at && e.review_note
        ? { by: { id: e.reviewed_by, name: e.reviewer_name }, at: e.reviewed_at.toISOString(), note: e.review_note }
        : null,
  }
}
