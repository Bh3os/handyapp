// Who is assigned to a job or a property right now, as the policy reads it (TSK-0069; HH-PKT-01, HH-DATA-08,
// HH-WORK-10, HH-SCH-07, T28, T44, OWN-DEC-171, OWN-DEC-121, OWN-DEC-119, RULE-SERVER-AUTHZ).
// - An assignment is an active confirmed worker reservation (ENT-Reservation) on a live work visit of the job:
//   confirmed, on the way or arrived. A tentative hold is no assignment, and neither is a reservation ended by a
//   reschedule, a reassignment, a cancellation or an availability change: the removed worker loses the packet (and the
//   access codes) on the very next request, and nobody inherits anyone's review (TSK-0066 note, OQ-VISIT-CHANGE-DETAILS).
// - The job's access window (the policy's "A: assigned jobs only, inside the access window"): from the reservation's
//   confirmation until the end of the visit's service day in the visit's zone, or later while an Owner extension is in
//   force on that reservation (TSK-0128, OWN-DEC-171). Before the visit day the worker reads the packet without the
//   visit-day data (access-window.ts). A completed visit is no longer live, which is stricter than the end of the day.
// - The property's window (the access-code reveal, T28): only the visit's own local service day, or an Owner
//   extension in force, with the visit date and today's date both read in the visit's zone (OWN-DEC-159), so the
//   policy's visit_date rule refuses any other day.
// - Every fact comes from the server's own records; nothing a client sends is trusted.
import type { Db, Tx } from '@handyhub/db'
import { localDateOf, PACKET_VISIT_STATES } from '@handyhub/domain'
import type { Actor, Assignment, Resource } from '@handyhub/policy'
import { sql } from 'kysely'
import { DAY_ENDS, DAY_STARTS, EXTENDED, EXTENDED_FROM } from './access-window.js'

type Reader = Db | Tx

/** The active assignments on a job's live work visits, each with its access window. */
export async function jobAssignments(db: Reader, jobId: string): Promise<Assignment[]> {
  const rows = await db
    .selectFrom('work.reservations as r')
    .innerJoin('work.visits as v', 'v.id', 'r.visit_id')
    .select(['r.staff_user_id', 'r.created_at', DAY_ENDS.as('access_ends'), EXTENDED().as('extended_until')])
    .where('v.job_id', '=', jobId)
    .where('r.resource', '=', 'worker')
    .where('r.kind', '=', 'confirmed')
    .where('r.ended_at', 'is', null)
    .where('v.state', 'in', [...PACKET_VISIT_STATES])
    .execute()
  return rows.map((r) => {
    const ends = new Date(r.access_ends).getTime()
    const extended = r.extended_until ? new Date(r.extended_until).getTime() : 0
    return { staffUserId: r.staff_user_id as string, from: r.created_at, to: new Date(Math.max(ends, extended)) }
  })
}

/**
 * The visit facts a worker's access-code reveal is decided on (T28, OWN-DEC-171, OWN-DEC-121): the worker's own active
 * confirmed reservations on live visits at the property, each with its visit-day window (the visit's own local day)
 * and any Owner extension in force as a second window, and, for the visit that is open now (else the nearest one),
 * its date with today's date in that visit's zone and the extension's end. The Owner and Office need no facts.
 */
export async function propertyVisitFacts(db: Reader, propertyId: string, actor: Actor): Promise<Resource> {
  if (actor.kind !== 'staff') return { assignments: [] }
  const now = new Date()
  const rows = await db
    .selectFrom('work.reservations as r')
    .innerJoin('work.visits as v', 'v.id', 'r.visit_id')
    .select([
      'r.staff_user_id',
      'v.local_date',
      'v.time_zone',
      DAY_STARTS.as('day_starts'),
      DAY_ENDS.as('day_ends'),
      EXTENDED(sql<Date>`${now}::timestamptz`).as('extended_until'),
      EXTENDED_FROM(sql<Date>`${now}::timestamptz`).as('extended_from'),
    ])
    .where('v.property_id', '=', propertyId)
    .where('r.staff_user_id', '=', actor.userId)
    .where('r.resource', '=', 'worker')
    .where('r.kind', '=', 'confirmed')
    .where('r.ended_at', 'is', null)
    .where('v.state', 'in', [...PACKET_VISIT_STATES])
    .orderBy('v.starts_at')
    .execute()
  if (rows.length === 0) return { assignments: [] }
  const assignments: Assignment[] = []
  for (const r of rows) {
    const staffUserId = r.staff_user_id as string
    assignments.push({ staffUserId, from: new Date(r.day_starts), to: new Date(r.day_ends) })
    if (r.extended_until && r.extended_from)
      assignments.push({ staffUserId, from: new Date(r.extended_from), to: new Date(r.extended_until) })
  }
  const t = now.getTime()
  const open = (r: (typeof rows)[number]) =>
    (new Date(r.day_starts).getTime() <= t && t < new Date(r.day_ends).getTime()) || r.extended_until !== null
  const visit = rows.find(open) ?? rows[0]
  if (!visit) return { assignments }
  return {
    assignments,
    visitDate: visit.local_date,
    visitToday: localDateOf(now, visit.time_zone),
    ...(visit.extended_until ? { extendedUntil: new Date(visit.extended_until) } : {}),
  }
}
