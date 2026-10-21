// On my way, Arrived and Finished (TSK-0070; HH-SCH-08, HH-PORT-07, HH-WORK-06, HH-ARC-08, HH-COM-06, T47, T65,
// ENT-Visit, ENT-TimeStamp, FACT-AUTOMATIC-MESSAGES, OWN-DEC-107, OWN-DEC-69, OWN-DEC-149, RULE-SAFETY-GATES,
// RULE-SERVER-AUTHZ).
// - Each tap is decided again inside its transaction, under the visit's row lock, from the server's own records: the
//   caller's active confirmed reservation of this visit (a reassigned worker is refused), the visit's state (a
//   canceled, expired, no-access or tentative visit refuses every tap), the caller's own earlier taps and the On my way
//   rule (visit.on_my_way: three hours before the window; NOT CONFIGURED refuses). The same rule
//   (@handyhub/domain tapDecision) builds the screen, so My Day never offers what the server refuses.
// - A repeated tap records nothing and sends nothing (idempotent); the idempotency key of the request covers retries.
// - The first On my way moves the visit to en_route and writes the visit.on_my_way event in the same transaction
//   (HH-ARC-08): after commit it sends the automatic on-the-way notice once (FACT-AUTOMATIC-MESSAGES #12; the event key
//   is the visit, so a visit can send it only once). A later On my way of a teammate records that worker's departure
//   only.
// - Arrived moves an en-route visit to arrived; it never starts work and never passes the Start Work gate. Finished
//   completes the visit once every assigned worker has a Finished value (PROPOSED, OQ-MY-DAY-DETAILS). The database
//   refuses any of these state changes without its record (migration 0062).
import type { Tx } from '@handyhub/db'
import { everyoneFinished, onMyWayOpensAt, tapDecision, type FieldTap, type TapRefusal } from '@handyhub/domain'
import type { StaffActor } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError } from '../../api/errors.js'
import { outbox } from '../../platform/outbox.js'
import { currentContext } from '../../platform/request-context.js'
import { onMyWayRule } from './my-day.js'

export const ON_MY_WAY_EVENT = 'visit.on_my_way'

const refusal = (code: TapRefusal) =>
  code === 'ON_MY_WAY_NOT_CONFIGURED'
    ? new ApiError('NOT_CONFIGURED', { fieldErrors: [{ field: 'visit.on_my_way', code, message: '' }] })
    : new ApiError('CONFLICT', { fieldErrors: [{ field: 'visit', code, message: '' }] })

export type TapOutcome = {
  recorded: boolean
  visitId: string
  projectId: string
  fromState: string
  toState: string
  version: number
  /** This tap moved the visit (On my way: the accepted tap that sends the notice). */
  moved: boolean
}

/** The workers assigned to a visit now (active confirmed reservations). */
export async function assignedWorkers(tx: Tx, visitId: string): Promise<string[]> {
  const rows = await tx
    .selectFrom('work.reservations')
    .select('staff_user_id')
    .where('visit_id', '=', visitId)
    .where('resource', '=', 'worker')
    .where('kind', '=', 'confirmed')
    .where('ended_at', 'is', null)
    .execute()
  return rows.flatMap((r) => (r.staff_user_id ? [r.staff_user_id] : []))
}

/** The workers with a Finished value on a visit: recorded, or supplied by the Owner's correction. */
export async function finishedWorkers(tx: Tx, visitId: string): Promise<Set<string>> {
  const stamps = await tx
    .selectFrom('work.time_stamps')
    .select('staff_user_id')
    .where('visit_id', '=', visitId)
    .where('kind', '=', 'finished')
    .execute()
  const corrected = await tx
    .selectFrom('work.time_stamp_corrections')
    .select('staff_user_id')
    .where('visit_id', '=', visitId)
    .where('kind', '=', 'finished')
    .execute()
  return new Set([...stamps, ...corrected].map((r) => r.staff_user_id))
}

/** Moves a visit one state along, raising its version (the database checks the edge and the record). */
export async function moveVisit(tx: Tx, visitId: string, from: string, to: string, version: number) {
  const moved = await tx
    .updateTable('work.visits')
    .set({ state: to, version: version + 1, updated_at: new Date() })
    .where('id', '=', visitId)
    .where('state', '=', from)
    .where('version', '=', version)
    .returning('version')
    .executeTakeFirst()
  if (!moved) throw new ApiError('CONFLICT', { fieldErrors: [{ field: 'visit', code: 'VISIT_CHANGED', message: '' }] })
  return moved.version
}

export async function recordTap(
  tx: Tx,
  actor: StaffActor,
  visitId: string,
  tap: FieldTap,
  input: { deviceRecordedAt?: string | undefined },
  now = new Date(),
): Promise<TapOutcome> {
  // The visit's row lock serializes the taps of one visit (two workers tapping at once).
  const v = await tx
    .selectFrom('work.visits')
    .select(['id', 'project_id', 'job_id', 'state', 'version', 'starts_at'])
    .where('id', '=', visitId)
    .forUpdate()
    .executeTakeFirst()
  if (!v) throw new ApiError('NOT_FOUND')
  const assigned = await assignedWorkers(tx, visitId)
  if (!assigned.includes(actor.userId)) throw new ApiError('FORBIDDEN')
  const departed = await tx
    .selectFrom('work.visit_departures')
    .select('id')
    .where('visit_id', '=', visitId)
    .where('staff_user_id', '=', actor.userId)
    .executeTakeFirst()
  const stamps = await tx
    .selectFrom('work.time_stamps')
    .select('kind')
    .where('visit_id', '=', visitId)
    .where('staff_user_id', '=', actor.userId)
    .execute()
  const minutes = await onMyWayRule(tx)
  const decision = tapDecision(tap, {
    visitState: v.state,
    reservation: 'confirmed',
    departed: departed !== undefined,
    arrived: stamps.some((s) => s.kind === 'arrived'),
    finished: stamps.some((s) => s.kind === 'finished'),
    onMyWayOpensAt: minutes === null ? null : onMyWayOpensAt(new Date(v.starts_at), minutes),
    now,
  })
  const base = { visitId, projectId: v.project_id, fromState: v.state }
  if (decision === 'repeat') return { ...base, recorded: false, toState: v.state, version: v.version, moved: false }
  if (decision !== 'record') throw refusal(decision)
  const device = input.deviceRecordedAt ? new Date(input.deviceRecordedAt) : null

  if (tap === 'on_my_way') {
    const moves = v.state === 'confirmed'
    await tx
      .insertInto('work.visit_departures')
      .values({ visit_id: visitId, staff_user_id: actor.userId, moved_visit: moves, device_recorded_at: device })
      .execute()
    if (!moves) return { ...base, recorded: true, toState: v.state, version: v.version, moved: false }
    const version = await moveVisit(tx, visitId, 'confirmed', 'en_route', v.version)
    await outbox.add(tx, {
      type: ON_MY_WAY_EVENT,
      aggregate: { type: 'visit', id: visitId, version },
      payload: { visitId, visitVersion: version },
      // One event per visit: a visit goes on the way once, so it sends the notice once.
      idempotencyKey: `${ON_MY_WAY_EVENT}:${visitId}`,
      requestId: currentContext()?.requestId ?? `visit-on-my-way:${visitId}`,
    })
    return { ...base, recorded: true, toState: 'en_route', version, moved: true }
  }

  await tx
    .insertInto('work.time_stamps')
    .values({
      visit_id: visitId,
      project_id: v.project_id,
      job_id: v.job_id,
      staff_user_id: actor.userId,
      kind: tap,
      device_recorded_at: device,
    })
    .execute()
  if (tap === 'arrived') {
    if (v.state !== 'en_route') return { ...base, recorded: true, toState: v.state, version: v.version, moved: false }
    const version = await moveVisit(tx, visitId, 'en_route', 'arrived', v.version)
    return { ...base, recorded: true, toState: 'arrived', version, moved: true }
  }
  return completeIfEveryoneFinished(tx, { ...v, ...base }, assigned)
}

/** Completes an arrived visit once every assigned worker has a Finished value (a tap or the Owner's correction). */
export async function completeIfEveryoneFinished(
  tx: Tx,
  v: { visitId: string; projectId: string; fromState: string; state: string; version: number },
  assigned: readonly string[],
): Promise<TapOutcome> {
  const base = { visitId: v.visitId, projectId: v.projectId, fromState: v.fromState }
  if (v.state !== 'arrived' || !everyoneFinished(assigned, await finishedWorkers(tx, v.visitId)))
    return { ...base, recorded: true, toState: v.state, version: v.version, moved: false }
  const version = await moveVisit(tx, v.visitId, 'arrived', 'completed', v.version)
  return { ...base, recorded: true, toState: 'completed', version, moved: true }
}

/** The visit's live reservations as policy assignments: from the reservation until the end of its service day. */
export async function visitAssignments(db: Tx | import('@handyhub/db').Db, visitId: string) {
  const rows = await db
    .selectFrom('work.reservations as r')
    .innerJoin('work.visits as v', 'v.id', 'r.visit_id')
    .select([
      'r.staff_user_id',
      'r.created_at',
      sql<Date>`((v.local_date + 1)::timestamp AT TIME ZONE v.time_zone)`.as('ends'),
    ])
    .where('r.visit_id', '=', visitId)
    .where('r.resource', '=', 'worker')
    .where('r.kind', '=', 'confirmed')
    .where('r.ended_at', 'is', null)
    .execute()
  return rows.map((r) => ({ staffUserId: r.staff_user_id as string, from: r.created_at, to: new Date(r.ends) }))
}
