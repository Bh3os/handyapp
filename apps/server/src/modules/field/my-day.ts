// The worker's My Day, built on the server from current assignments only (TSK-0070; HH-OFF-09, HH-SCH-08,
// HH-PKT-02, HH-OFF-02, ENT-Visit, ENT-Reservation, ENT-JobPacket, OWN-DEC-121, OWN-DEC-171, RULE-SERVER-AUTHZ,
// RULE-NO-INVENTED-FACTS).
// - The caller's own active reservations only: confirmed assignments and tentative holds (a hold is no assignment and
//   shows no address, HH-OFF-09). Listed: today's visits in each visit's own zone, and any visit still on the way or
//   arrived, in arrival-window order. A visit the caller was reassigned away from is simply not there.
// - Each visit: the arrival window, the address and a plain directions link (confirmed and live only, and only on the
//   visit's own local service day, OWN-DEC-171: a visit still under way after its day ended and a completed visit show
//   none), the access notes (never a code: codes are revealed separately, online, in the packet's audited flow), the
//   preparation (the customer-preparation detail and the instructions given to the customer), the readiness blockers
//   the records show and the one next action (the same rule the taps are decided with, @handyhub/domain myDayActions).
// - Readiness here lists what the records show (a blocking hold, a deposit not yet covered, a work package without an
//   SOP, a packet not viewed or changed since, the worker's own packet acknowledgment missing or ended (TSK-0072), a
//   loadout task block, required loadout items not yet confirmed loaded or a loadout NOT CONFIGURED (TSK-0071)); it is
//   not the Start Work check, which stays the start route's, online (RULE-SAFETY-GATES), and it never refuses a tap:
//   On my way, Arrived and Finished never depend on it (HH-SCH-08, HH-WORK-06). No ETA is computed, shown or sent
//   anywhere (HH-PORT-07).
import type { Db, Tx } from '@handyhub/db'
import {
  localDateOf,
  myDayActions,
  onMyWayOpensAt,
  packetChanges,
  SITE_ACCESS_DETAILS,
  type AcknowledgmentState,
  type PacketContent,
} from '@handyhub/domain'
import type { StaffActor } from '@handyhub/policy'
import { sql } from 'kysely'
import { loadConfig } from '../../platform/config/index.js'
import { jobLoadoutReadiness } from '../loadouts/store.js'
import { acknowledgmentStatus, assignedNow } from '../packets/acknowledgments.js'
import { packetVersion, refreshJobPacket } from '../packets/content.js'
import { directionsUrl, lastViewed } from '../packets/view.js'

type Reader = Db | Tx

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null)
const LIVE = ['confirmed', 'en_route', 'arrived'] as const

/** The On my way rule in force (visit.on_my_way, OWN-DEC-107), or NOT CONFIGURED: never assumed. */
export async function onMyWayRule(db: Reader): Promise<number | null> {
  const r = (await loadConfig(db)).get('visit.on_my_way')
  return r.state === 'CONFIGURED' ? r.value.earliestMinutesBefore : null
}

/** The caller's own taps on these visits. */
async function ownTaps(db: Reader, staffUserId: string, visitIds: string[]) {
  if (visitIds.length === 0)
    return new Map<string, { departedAt: Date | null; arrivedAt: Date | null; finishedAt: Date | null }>()
  const departures = await db
    .selectFrom('work.visit_departures')
    .select(['visit_id', 'recorded_at'])
    .where('staff_user_id', '=', staffUserId)
    .where('visit_id', 'in', visitIds)
    .execute()
  const stamps = await db
    .selectFrom('work.time_stamps')
    .select(['visit_id', 'kind', 'recorded_at'])
    .where('staff_user_id', '=', staffUserId)
    .where('visit_id', 'in', visitIds)
    .execute()
  const out = new Map<string, { departedAt: Date | null; arrivedAt: Date | null; finishedAt: Date | null }>()
  for (const id of visitIds) {
    out.set(id, {
      departedAt: departures.find((d) => d.visit_id === id)?.recorded_at ?? null,
      arrivedAt: stamps.find((s) => s.visit_id === id && s.kind === 'arrived')?.recorded_at ?? null,
      finishedAt: stamps.find((s) => s.visit_id === id && s.kind === 'finished')?.recorded_at ?? null,
    })
  }
  return out
}

type Readiness = {
  packetVersion: number
  lastViewedVersion: number | null
  changedSinceViewed: boolean
  criticalSinceViewed: boolean
  /** The caller's own packet acknowledgment (TSK-0072): acknowledged, required, invalidated or not_assigned. */
  acknowledgment: AcknowledgmentState
  blockers: { code: string; count: number }[]
}

/** What the records show before the visit (see the header); null when the visit has no job or is not live. */
async function readinessOf(db: Reader, jobId: string, staffUserId: string, now: Date): Promise<Readiness | null> {
  const row = await refreshJobPacket(db, jobId)
  if (!row) return null
  const seen = await lastViewed(db, jobId, staffUserId)
  let critical = false
  if (seen && seen.version !== row.version) {
    const before = await packetVersion(db, jobId, seen.version)
    critical = before ? packetChanges(before.content as PacketContent, row.content).some((c) => c.critical) : false
  }
  const c = row.content
  const blockers: { code: string; count: number }[] = []
  // A loadout task block is a hold on one work package (TSK-0071): listed as a loadout shortage, not twice.
  const jobHolds = c.holds.holds.filter((h) => h.kind !== 'task_block').length
  if (jobHolds > 0) blockers.push({ code: 'blocking_hold', count: jobHolds })
  const deposit = c.dependencies.deposit
  if (deposit && deposit.required && deposit.state !== 'satisfied' && deposit.state !== 'waived')
    blockers.push({ code: 'deposit_not_covered', count: 1 })
  const noSop = c.sop.packages.filter((p) => p.state === 'not_configured').length
  if (noSop > 0) blockers.push({ code: 'sop_not_configured', count: noSop })
  if (!seen) blockers.push({ code: 'packet_not_viewed', count: 1 })
  else if (seen.version !== row.version)
    blockers.push({ code: critical ? 'packet_critical_change' : 'packet_changed', count: 1 })
  // TSK-0072: the worker's own acknowledgment of the current packet (never a teammate's).
  const assigned = (await assignedNow(db, jobId, now)).includes(staffUserId)
  const ack = await acknowledgmentStatus(db, row, staffUserId, assigned)
  if (ack.state === 'required') blockers.push({ code: 'packet_not_acknowledged', count: 1 })
  else if (ack.state === 'invalidated') blockers.push({ code: 'packet_acknowledgment_ended', count: 1 })
  // TSK-0071: each work package's loadout (the same answer the loadout page and the Start Work gate read).
  const loadout = await jobLoadoutReadiness(db, jobId)
  const shortages = loadout.reduce((n, p) => n + p.readiness.blocks.length, 0)
  if (shortages > 0) blockers.push({ code: 'loadout_blocked', count: shortages })
  const unconfirmed = loadout.filter((p) => p.readiness.state === 'not_confirmed').length
  if (unconfirmed > 0) blockers.push({ code: 'loadout_not_confirmed', count: unconfirmed })
  const noLoadout = loadout.filter((p) => p.readiness.state === 'not_configured').length
  if (noLoadout > 0) blockers.push({ code: 'loadout_not_configured', count: noLoadout })
  return {
    packetVersion: row.version,
    lastViewedVersion: seen?.version ?? null,
    changedSinceViewed: seen !== null && seen.version !== row.version,
    criticalSinceViewed: critical,
    acknowledgment: ack.state,
    blockers,
  }
}

export type MyDayItem = Awaited<ReturnType<typeof myDayItems>>[number]

/**
 * The caller's My Day items: today's visits (and any visit still under way) of their own active reservations, or the
 * one visit `visitId` when given (a tap's answer). Nothing about another person's assignments beyond their teammates'
 * names on the caller's own visits.
 */
export async function myDayItems(db: Reader, actor: StaffActor, opts: { visitId?: string; now?: Date } = {}) {
  const now = opts.now ?? new Date()
  let q = db
    .selectFrom('work.reservations as r')
    .innerJoin('work.visits as v', 'v.id', 'r.visit_id')
    .innerJoin('crm.projects as p', 'p.id', 'v.project_id')
    .innerJoin('crm.properties as pr', 'pr.id', 'v.property_id')
    .select([
      'v.id',
      'v.number',
      'v.purpose',
      'v.state',
      'v.version',
      'v.job_id',
      'v.project_id',
      'v.property_id',
      'v.local_date',
      'v.window_start',
      'v.window_end',
      'v.time_zone',
      'v.starts_at',
      'v.ends_at',
      'p.reference',
      'pr.street',
      'pr.unit',
      'pr.city',
      'pr.state as address_state',
      'pr.zip',
      'r.kind as reservation_kind',
      'r.role',
    ])
    .where('r.staff_user_id', '=', actor.userId)
    .where('r.resource', '=', 'worker')
    .where('r.ended_at', 'is', null)
    .where('r.kind', 'in', ['confirmed', 'hold'])
    .where('v.state', 'in', ['tentative', 'confirmed', 'en_route', 'arrived', 'completed'])
  q = opts.visitId
    ? q.where('v.id', '=', opts.visitId)
    : q.where((eb) =>
        eb.or([
          eb(sql<string>`v.local_date`, '=', sql<string>`(now() AT TIME ZONE v.time_zone)::date`),
          eb('v.state', 'in', ['en_route', 'arrived']),
        ]),
      )
  const rows = await q.orderBy('v.starts_at').orderBy('v.number').execute()
  // A hold of an offered window and the confirmed assignment of the same visit: the assignment wins.
  const byVisit = new Map<string, (typeof rows)[number]>()
  for (const r of rows) {
    const had = byVisit.get(r.id)
    if (!had || (had.reservation_kind !== 'confirmed' && r.reservation_kind === 'confirmed')) byVisit.set(r.id, r)
  }
  const visits = [...byVisit.values()]
  const ids = visits.map((v) => v.id)
  const taps = await ownTaps(db, actor.userId, ids)
  const minutes = await onMyWayRule(db)
  const team = ids.length
    ? await db
        .selectFrom('work.reservations as r')
        .leftJoin('identity.staff_users as u', 'u.id', 'r.staff_user_id')
        .select(['r.visit_id', 'r.role', 'u.display_name'])
        .where('r.visit_id', 'in', ids)
        .where('r.resource', '=', 'worker')
        .where('r.kind', '=', 'confirmed')
        .where('r.ended_at', 'is', null)
        .orderBy('r.role')
        .orderBy('u.display_name')
        .execute()
    : []
  const propertyIds = [...new Set(visits.map((v) => v.property_id))]
  const details = propertyIds.length
    ? await db
        .selectFrom('crm.property_details')
        .select(['property_id', 'detail', 'value', 'source', 'confirmed_at'])
        .where('property_id', 'in', propertyIds)
        .orderBy('detail')
        .execute()
    : []
  const offers = ids.length
    ? await db
        .selectFrom('work.window_offers')
        .select(['visit_id', 'preparation_instructions'])
        .where('visit_id', 'in', ids)
        .where('state', '=', 'selected')
        .execute()
    : []

  const out = []
  for (const v of visits) {
    const confirmed = v.reservation_kind === 'confirmed' && v.state !== 'tentative'
    const live = confirmed && (LIVE as readonly string[]).includes(v.state)
    // OWN-DEC-171: the address, directions, access notes and preparation only on the visit's own local service day
    // (the rest of the visit-day access window, extensions and the packet's own projection are TSK-0128).
    const onSite = live && v.local_date === localDateOf(now, v.time_zone)
    const mine = taps.get(v.id) ?? { departedAt: null, arrivedAt: null, finishedAt: null }
    const opensAt = minutes === null ? null : onMyWayOpensAt(new Date(v.starts_at), minutes)
    const actions = myDayActions({
      visitState: v.state,
      reservation: confirmed ? 'confirmed' : 'hold',
      departed: mine.departedAt !== null,
      arrived: mine.arrivedAt !== null,
      finished: mine.finishedAt !== null,
      onMyWayOpensAt: opensAt,
      now,
    })
    const address = onSite ? { street: v.street, unit: v.unit, city: v.city, state: v.address_state, zip: v.zip } : null
    const propertyDetails = details.filter((d) => d.property_id === v.property_id)
    out.push({
      visitId: v.id,
      number: v.number,
      purpose: v.purpose,
      state: v.state,
      version: v.version,
      projectReference: v.reference,
      jobId: v.job_id,
      assignment: confirmed ? ('confirmed' as const) : ('hold' as const),
      role: v.role ?? 'member',
      window: {
        localDate: v.local_date,
        start: v.window_start.slice(0, 5),
        end: v.window_end.slice(0, 5),
        timeZone: v.time_zone,
        startsAt: new Date(v.starts_at).toISOString(),
        endsAt: new Date(v.ends_at).toISOString(),
      },
      // The team of a confirmed visit (names only); a hold names nobody.
      team: confirmed
        ? team
            .filter((m) => m.visit_id === v.id)
            .map((m) => ({ name: m.display_name, role: m.role ?? 'member' }))
            .sort((a, b) => (a.role === b.role ? 0 : a.role === 'lead' ? -1 : 1))
        : [],
      address,
      directionsUrl: address ? directionsUrl(address) : null,
      // Access notes (never a code), only while the address is shown.
      accessNotes: onSite
        ? (SITE_ACCESS_DETAILS as readonly string[]).flatMap((name) => {
            const d = propertyDetails.find((x) => x.detail === name)
            return d
              ? [
                  {
                    detail: d.detail,
                    value: d.value,
                    source: d.source,
                    confirmedAt: new Date(d.confirmed_at).toISOString(),
                  },
                ]
              : []
          })
        : [],
      preparation: onSite
        ? {
            customerPreparation: propertyDetails.find((d) => d.detail === 'customer_preparation')?.value ?? null,
            instructions: offers.find((o) => o.visit_id === v.id)?.preparation_instructions ?? null,
          }
        : { customerPreparation: null, instructions: null },
      readiness: live && v.job_id ? await readinessOf(db, v.job_id, actor.userId, now) : null,
      mine: { departedAt: iso(mine.departedAt), arrivedAt: iso(mine.arrivedAt), finishedAt: iso(mine.finishedAt) },
      next: actions.next,
      onMyWayOpensAt: confirmed ? iso(opensAt) : null,
      actions: { onMyWay: actions.onMyWay, arrived: actions.arrived, finished: actions.finished },
    })
  }
  return out
}
