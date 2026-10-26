// The visit-day data access of the workers assigned to a visit, read from the server's records (TSK-0128; HH-PKT-08,
// HH-CRM-03, HH-OFF-02, HH-DATA-08, T28, T49, ENT-Visit, ENT-Reservation, ENT-AccessInstructionSecret, OWN-DEC-171,
// OWN-DEC-159, RULE-SERVER-AUTHZ).
// - A worker's access on one visit: an active confirmed reservation on the live visit (confirmed, on the way or
//   arrived), and either the visit's own local service day (the visit's zone, @handyhub/domain visitAccess) or an Owner
//   extension in force on that reservation (migration 0107). Every fact is the server's; nothing a client sends counts.
// - Removal, reassignment, a reschedule (which books a new reservation), a cancellation, a completed visit or a
//   disabled account end the access at once: the reservation or the visit no longer qualifies on the next request.
// - The same bounds in SQL (DAY_STARTS, DAY_ENDS, EXTENDED) let the data scopes (platform/data-scope.ts) and the
//   assignment facts (assignments.ts) decide with the very same rule as the projections here.
// - What the access opens (the packet's projection): the customer's first name, the verified address and directions,
//   the site-access details (the site contact and its phone, access windows, notes, parking) and the access-code
//   entries with the audited reveal. Without it the packet keeps the job type, date, window, team, tools, materials,
//   SOPs, hazards, occupants and safety details and shows the general service area (city and state) only.
import type { Db, Tx } from '@handyhub/db'
import {
  firstName,
  PACKET_VISIT_STATES,
  serviceArea,
  visitAccess,
  type AccessExtension,
  type VisitAccess,
} from '@handyhub/domain'
import { sql, type RawBuilder } from 'kysely'

type Reader = Db | Tx

/** The visit's service day in its own zone: local midnight of its date to the next local midnight (alias `v`). */
export const DAY_STARTS = sql<Date>`((v.local_date)::timestamp AT TIME ZONE v.time_zone)`
export const DAY_ENDS = sql<Date>`((v.local_date + 1)::timestamp AT TIME ZONE v.time_zone)`

/** The earliest start of the Owner extensions in force on reservation `r` at `now` (null: none). */
export const EXTENDED_FROM = (now: RawBuilder<Date> | Date = sql<Date>`now()`) =>
  sql<Date | null>`(SELECT min(x.starts_at) FROM work.visit_access_extensions x
      WHERE x.reservation_id = r.id AND x.starts_at <= ${now} AND ${now} < x.expires_at
        AND (x.ended_at IS NULL OR x.ended_at > ${now}))`

/** The latest expiry of an Owner extension in force on reservation `r` at `now` (null: none). */
export const EXTENDED = (now: RawBuilder<Date> | Date = sql<Date>`now()`) =>
  sql<Date | null>`(SELECT max(x.expires_at) FROM work.visit_access_extensions x
      WHERE x.reservation_id = r.id AND x.starts_at <= ${now} AND ${now} < x.expires_at
        AND (x.ended_at IS NULL OR x.ended_at > ${now}))`

export type WorkerVisitAccess = {
  visitId: string
  reservationId: string
  number: number
  localDate: string
  timeZone: string
  access: VisitAccess
}

/**
 * The caller's visit-day access on each of their live assigned visits (of one job, of one property, or the given
 * visits), at `now`. A visit the caller holds no active confirmed reservation on is not listed (no access).
 */
export async function workerVisitAccess(
  db: Reader,
  staffUserId: string,
  where: { jobId?: string; propertyId?: string; visitIds?: readonly string[] },
  now = new Date(),
): Promise<WorkerVisitAccess[]> {
  let q = db
    .selectFrom('work.reservations as r')
    .innerJoin('work.visits as v', 'v.id', 'r.visit_id')
    .select(['v.id', 'r.id as reservation_id', 'v.number', 'v.local_date', 'v.time_zone'])
    .where('r.staff_user_id', '=', staffUserId)
    .where('r.resource', '=', 'worker')
    .where('r.kind', '=', 'confirmed')
    .where('r.ended_at', 'is', null)
    .where('v.state', 'in', [...PACKET_VISIT_STATES])
  if (where.jobId) q = q.where('v.job_id', '=', where.jobId)
  if (where.propertyId) q = q.where('v.property_id', '=', where.propertyId)
  if (where.visitIds) {
    if (where.visitIds.length === 0) return []
    q = q.where('v.id', 'in', [...where.visitIds])
  }
  const rows = await q.orderBy('v.starts_at').orderBy('v.number').execute()
  const extensions = await reservationExtensions(
    db,
    rows.map((r) => r.reservation_id),
  )
  return rows.map((r) => ({
    visitId: r.id,
    reservationId: r.reservation_id,
    number: r.number,
    localDate: r.local_date,
    timeZone: r.time_zone,
    access: visitAccess({
      localDate: r.local_date,
      timeZone: r.time_zone,
      assigned: true,
      extensions: extensions.get(r.reservation_id) ?? [],
      now,
    }),
  }))
}

/** Every extension recorded on these reservations (ended and expired ones too: the domain rule ignores them). */
async function reservationExtensions(db: Reader, reservationIds: string[]): Promise<Map<string, AccessExtension[]>> {
  const out = new Map<string, AccessExtension[]>()
  if (reservationIds.length === 0) return out
  const rows = await db
    .selectFrom('work.visit_access_extensions')
    .select(['reservation_id', 'starts_at', 'expires_at', 'ended_at'])
    .where('reservation_id', 'in', reservationIds)
    .execute()
  for (const r of rows) {
    const list = out.get(r.reservation_id) ?? []
    list.push({ startsAt: r.starts_at, expiresAt: r.expires_at, endedAt: r.ended_at })
    out.set(r.reservation_id, list)
  }
  return out
}

/** How a packet reader stands: everything (Owner, Office, Estimator), or a worker's visit-day access now. */
export type PacketAccess =
  | { mode: 'full' }
  | { mode: 'visit_day'; basis: 'visit_day' | 'extension'; endsAt: Date }
  | { mode: 'closed'; opensAt: Date | null }

/**
 * A worker's access to the visit-day data of a job: open while any of their assigned live visits of the job is open
 * (ending at the latest end among them); else closed, with when the next visit day opens.
 */
export function packetAccessOf(visits: readonly WorkerVisitAccess[]): PacketAccess {
  let endsAt: Date | null = null
  let basis: 'visit_day' | 'extension' = 'extension'
  let opensAt: Date | null = null
  for (const v of visits) {
    const a = v.access
    if (a.open) {
      if (!endsAt || a.endsAt.getTime() > endsAt.getTime()) endsAt = a.endsAt
      if (a.basis === 'visit_day') basis = 'visit_day'
    } else if (a.opensAt && (!opensAt || a.opensAt.getTime() < opensAt.getTime())) opensAt = a.opensAt
  }
  return endsAt ? { mode: 'visit_day', basis, endsAt } : { mode: 'closed', opensAt }
}

/** The first name of the project's customer (the primary contact's first word), or null when none is recorded. */
export async function customerFirstName(db: Reader, projectId: string): Promise<string | null> {
  const c = await db
    .selectFrom('crm.projects as p')
    .innerJoin('crm.contacts as c', 'c.customer_id', 'p.customer_id')
    .select('c.full_name')
    .where('p.id', '=', projectId)
    .orderBy('c.is_primary', 'desc')
    .orderBy('c.created_at')
    .limit(1)
    .executeTakeFirst()
  return firstName(c?.full_name ?? null)
}

type Address = { street: string; unit: string | null; city: string; state: string; zip: string }
type Detail = { detail: string; value: string | null; source: string; confirmedAt: string }
type ProjectedView = {
  site: {
    address: Address | null
    directionsUrl: string | null
    details: readonly Detail[]
    accessCodes: readonly unknown[]
    serviceArea: { city: string; state: string } | null
  }
  communication: { siteContact: Detail | null }
}

/**
 * The packet as this reader may see it now (see the header): unchanged for `full`; with the visit-day data while a
 * worker's access is open; without it otherwise. Adds `access` (how the reader stands) and `customer` (the first
 * name only, while the visit-day data is shown).
 */
export function projectPacket<V extends ProjectedView>(view: V, access: PacketAccess, first: string | null) {
  const open = access.mode !== 'closed'
  const site: V['site'] = open
    ? view.site
    : {
        ...view.site,
        address: null,
        directionsUrl: null,
        details: [] as V['site']['details'],
        accessCodes: [] as V['site']['accessCodes'],
      }
  return {
    ...view,
    site,
    communication: {
      ...view.communication,
      siteContact: open ? view.communication.siteContact : null,
    } as V['communication'],
    customer: { firstName: open ? first : null },
    access: {
      mode: access.mode,
      basis: access.mode === 'visit_day' ? access.basis : null,
      endsAt: access.mode === 'visit_day' ? access.endsAt.toISOString() : null,
      opensAt: access.mode === 'closed' && access.opensAt ? access.opensAt.toISOString() : null,
    },
  }
}

/** The general service area of an address (city and state), or null without one. */
export const areaOf = (a: Address | null) => (a ? serviceArea(a) : null)
