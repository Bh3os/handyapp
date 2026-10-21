// Who is assigned to a job or a property right now, as the policy reads it (TSK-0069; HH-PKT-01, HH-DATA-08,
// HH-WORK-10, HH-SCH-07, T28, T44, OWN-DEC-40, OWN-DEC-121, OWN-DEC-119, RULE-SERVER-AUTHZ).
// - An assignment is an active confirmed worker reservation (ENT-Reservation) on a live work visit of the job:
//   confirmed, on the way or arrived. A tentative hold is no assignment, and neither is a reservation ended by a
//   reschedule, a reassignment, a cancellation or an availability change: the removed worker loses the packet (and the
//   access codes) on the very next request, and nobody inherits anyone's review (TSK-0066 note, OQ-VISIT-CHANGE-DETAILS).
// - The access window (the policy's "A: assigned jobs only, inside the access window"): from the reservation's
//   confirmation until the end of the visit's service day in the visit's zone (OWN-DEC-40). A completed visit is no
//   longer live, which is stricter than the end of the day (OWN-DEC-40 effect).
// - Every fact comes from the server's own records; nothing a client sends is trusted.
import type { Db, Tx } from '@handyhub/db'
import { PACKET_VISIT_STATES } from '@handyhub/domain'
import { localDate } from '@handyhub/domain/request-form'
import type { Actor, Assignment, Resource } from '@handyhub/policy'
import { sql } from 'kysely'
import { loadConfig } from '../../platform/config/index.js'

type Reader = Db | Tx

const ACCESS_ENDS = sql<Date>`((v.local_date + 1)::timestamp AT TIME ZONE v.time_zone)`

/** The active assignments on a job's live work visits, each with its access window. */
export async function jobAssignments(db: Reader, jobId: string): Promise<Assignment[]> {
  const rows = await db
    .selectFrom('work.reservations as r')
    .innerJoin('work.visits as v', 'v.id', 'r.visit_id')
    .select(['r.staff_user_id', 'r.created_at', ACCESS_ENDS.as('access_ends')])
    .where('v.job_id', '=', jobId)
    .where('r.resource', '=', 'worker')
    .where('r.kind', '=', 'confirmed')
    .where('r.ended_at', 'is', null)
    .where('v.state', 'in', [...PACKET_VISIT_STATES])
    .execute()
  return rows.map((r) => ({ staffUserId: r.staff_user_id as string, from: r.created_at, to: new Date(r.access_ends) }))
}

/**
 * The visit facts a worker's access-code reveal is decided on (T28, OWN-DEC-121, OWN-DEC-40): the worker's own active
 * confirmed reservations on live visits at the property, each with its access window, and the date of the visit that
 * is on today's business date (else the nearest one), so the policy's visit_date rule refuses any other day. The
 * Owner and Office need no facts.
 */
export async function propertyVisitFacts(db: Reader, propertyId: string, actor: Actor): Promise<Resource> {
  if (actor.kind !== 'staff') return { assignments: [] }
  const rows = await db
    .selectFrom('work.reservations as r')
    .innerJoin('work.visits as v', 'v.id', 'r.visit_id')
    .select(['r.staff_user_id', 'r.created_at', 'v.local_date', ACCESS_ENDS.as('access_ends')])
    .where('v.property_id', '=', propertyId)
    .where('r.staff_user_id', '=', actor.userId)
    .where('r.resource', '=', 'worker')
    .where('r.kind', '=', 'confirmed')
    .where('r.ended_at', 'is', null)
    .where('v.state', 'in', [...PACKET_VISIT_STATES])
    .orderBy('v.starts_at')
    .execute()
  if (rows.length === 0) return { assignments: [] }
  const zone = (await loadConfig(db)).get('business.timezone')
  const today = zone.state === 'CONFIGURED' ? localDate(new Date(), zone.value.zone) : undefined
  const visit = rows.find((r) => r.local_date === today) ?? rows[0]
  return {
    assignments: rows.map((r) => ({
      staffUserId: r.staff_user_id as string,
      from: r.created_at,
      to: new Date(r.access_ends),
    })),
    ...(visit ? { visitDate: visit.local_date } : {}),
  }
}
