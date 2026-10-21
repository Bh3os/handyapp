// Window offers held for the configured hours, and the customer's selection (TSK-0063; HH-SCH-11, HH-LEAD-07,
// HH-SCH-04, HH-SCH-05, T37, T38, ENT-Reservation, ENT-Visit, FACT-AUTOMATIC-MESSAGES, OWN-DEC-99, OWN-DEC-105,
// OWN-DEC-119, OWN-DEC-144, RULE-SERVER-AUTHZ).
// - One mechanism for estimate visits and work visits. Staff offer the configured number of windows of one tentative
//   visit (scheduling.window_offers: 2-3, OWN-DEC-99 and OWN-DEC-105) with the visit's whole team (every worker it
//   needs, the lead first, and an item for each equipment entry). Every window is checked with the capacity module's
//   own rules (evaluate: working hours, time off, visit hours, eligibility, no overlapping reservation or hold) and
//   held for the team, all in one transaction: the holds are reservations, so the database's exclusion constraints
//   make a held window impossible to offer or confirm for anyone else (T38); a concurrent offer or confirmation that
//   took the capacity first gives CONFLICT with alternatives and nothing partial.
// - The hold lasts holdHours from the offer (OWN-DEC-144: 24 hours), by the database's clock. One job per offer runs
//   at its expiry: an offer still open then expires, its holds end and its tentative visit expires with them
//   (HH-SCH-05). Confirmed reservations are never touched by the expiry.
// - The customer selects one window in the portal while it is held. The server locks the offer, rechecks the window
//   (its holds are all still active and the team still passes evaluate), and in one transaction the offer is selected
//   (the database turns that window's holds into the confirmed reservations and releases the others), the visit takes
//   the window and is confirmed. Of two tabs or customers racing for one offer exactly one selection succeeds; a
//   selection and the expiry never both happen (both lock the offer; the database compares with expires_at itself).
//   A window that cannot be kept answers CONFLICT with nothing changed, and the customer can choose another offered
//   window or ask for other times. The customer asks for other times (an optional note) without restarting the
//   request: every hold is released and staff get a queue item.
// - Notices (FACT-AUTOMATIC-MESSAGES): publishing estimate-visit windows triggers estimate_visit.options (#5); a
//   reserved estimate visit estimate_visit.confirmed (#6); a reserved work visit appointment.confirmed (#10). Their
//   wording is not approved yet (no released template): each delivery is recorded as failed with
//   template_not_configured and staff see the delivery issue; nothing reads as sent. The list names no notice for
//   work-visit windows (OQ-WORK-WINDOW-OFFER-NOTICE): none is triggered for them.
// - PROPOSED (no owner rule): staff withdraw an open offer with a reason; a work visit's windows pass the job's
//   scheduling gates when offered and again when selected (WORK_VISIT_GATES, the deposit gate of TSK-0059 first);
//   selecting at or after the hold time is refused as expired, the customer is told the times are no longer held and
//   staff get a queue item to offer new ones.
// - TSK-0059 (HH-SCH-06, HH-FIN-02, RULE-SAFETY-GATES): selecting a work-visit window confirms the visit, so the
//   selection runs the deposit gate itself in its transaction, whatever gates the module was given, exactly as a staff
//   confirmation does (visits.ts confirmVisit); an estimate visit never waits for a deposit.
// - TSK-0064 (HH-SCH-06, HH-SCH-05, T36, T40): the selection runs every confirmation precondition of preconditions.ts
//   (approval, deposit, the other gates, no blocking hold) in its transaction; when one is unmet nothing changes and
//   the customer is told only that the time cannot be confirmed yet (SCHEDULING_NOT_READY), with the deposit when it
//   is due, never a hold or a staff detail. PROPOSED: offering windows also needs the approval and no blocking hold,
//   so a customer is never offered times that cannot be confirmed.
import type { Db, Tx } from '@handyhub/db'
import {
  holdExpiresAt,
  isWorkVisitPurpose,
  offerProblems,
  onSiteRange,
  reservedRange,
  windowText,
  type Interval,
  type LocalWindow,
} from '@handyhub/domain'
import { scopeIncludesProject, type CustomerActor, type DataScope, type StaffActor } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError, type FieldError } from '../../api/errors.js'
import type { Automation } from '../../platform/automation.js'
import { loadConfig, type Config } from '../../platform/config/index.js'
import { scheduleJob } from '../../platform/jobs.js'
import { outbox } from '../../platform/outbox.js'
import { currentContext } from '../../platform/request-context.js'
import { alternatives, capacitySettings, evaluate, type ReservationRequest } from '../capacity/resources.js'
import { notificationAutomation, type Destination, type NotificationProviders } from '../notifications/index.js'
import { openQueueItem, resolveQueueItem } from '../queue/items.js'
import { findProject } from '../records/index.js'
import { unmetGates, type WorkVisitGate } from './gates.js'
import { approvalProblems, blockingHoldProblems, confirmationPreconditions, customerRefusal } from './preconditions.js'
import { factsOf, mayPlanWorkVisits, resolveEntry, storedWindow, type WindowEntry } from './visits.js'

type Reader = Db | Tx

const field = (f: string, code: string): FieldError => ({ field: f, code, message: '' })

export const ESTIMATE_VISIT_OPTIONS_EVENT = 'estimate_visit.windows_published'
export const ESTIMATE_VISIT_RESERVED_EVENT = 'estimate_visit.reserved'
export const APPOINTMENT_RESERVED_EVENT = 'appointment.reserved'
/** The automatic notice a published offer triggers, by purpose; null: none is on the list (work visits). */
export const OFFER_NOTICE = { estimate: 'estimate_visit.options', work: null } as const
export const CONFIRMED_NOTICE = { estimate: 'estimate_visit.confirmed', work: 'appointment.confirmed' } as const

/** PROPOSED input bounds (no owner value). */
export const OFFER_LIMITS = { windows: 10, instructions: 1000, reason: 500, note: 500 } as const

/** The offer policy in force (scheduling.window_offers), or NOT CONFIGURED: never assumed. */
export function windowOfferPolicy(config: Config) {
  const p = config.get('scheduling.window_offers')
  if (p.state !== 'CONFIGURED')
    throw new ApiError('NOT_CONFIGURED', {
      fieldErrors: [field('scheduling.window_offers', 'WINDOW_OFFERS_NOT_CONFIGURED')],
    })
  return { policy: p.value, version: p.version, proposed: p.proposed }
}

async function dbNow(tx: Reader): Promise<Date> {
  const r = await sql<{ now: Date }>`SELECT now() AS now`.execute(tx)
  return new Date((r.rows[0] as { now: Date }).now)
}

const requestIdOf = (fallback: string) => currentContext()?.requestId ?? fallback

/** The project's request (its reference, responsible staff member and contact). */
async function requestOf(db: Reader, projectId: string) {
  return db
    .selectFrom('intake.requests as r')
    .innerJoin('crm.contacts as c', 'c.id', 'r.contact_id')
    .select([
      'r.id',
      'r.reference',
      'r.responsible_staff_id',
      'c.id as contactId',
      'c.email',
      'c.phone_e164',
      'c.preferred_channel',
    ])
    .where('r.project_id', '=', projectId)
    .orderBy('r.submitted_at')
    .executeTakeFirst()
}

/** The staff queue item of an answer to an offer that needs new windows (one per request). */
export const OFFER_QUEUE_TYPE = 'window_offer_response'

async function openOfferItem(
  tx: Tx,
  projectId: string,
  reason: 'window_other_times_requested' | 'window_offer_expired',
) {
  const r = await requestOf(tx, projectId)
  if (!r) return
  await openQueueItem(tx, {
    type: OFFER_QUEUE_TYPE,
    subjectId: r.id,
    reason,
    projectId,
    reference: r.reference,
    status: reason === 'window_offer_expired' ? 'expired' : 'other_times_requested',
    assignedStaffId: r.responsible_staff_id,
  })
}

async function resolveOfferItem(tx: Tx, projectId: string, resolution: 'new_offer' | 'window_selected') {
  const r = await requestOf(tx, projectId)
  if (r) await resolveQueueItem(tx, { type: OFFER_QUEUE_TYPE, subjectId: r.id, resolution })
}

export type OfferInput = {
  readonly windows: readonly WindowEntry[]
  /** Every worker the visit needs, the lead first. */
  readonly workerIds: readonly string[]
  /** One item for every equipment entry of the visit. */
  readonly equipmentIds?: readonly string[]
  /** Customer-facing preparation instructions, shown with the confirmed visit. */
  readonly preparationInstructions?: string
}

export type OfferResult = {
  readonly offerId: string
  readonly number: number
  readonly projectId: string
  readonly visitId: string
  readonly purpose: string
  readonly expiresAt: Date
  readonly holdHours: number
  readonly policyVersion: number
  readonly windows: readonly LocalWindow[]
  readonly workerIds: readonly string[]
  readonly equipmentIds: readonly string[]
}

const RACE = new Set(['23P01', '40P01'])

/** Field errors of one window, under its place in the body. */
function prefixed(prefix: string, errors: readonly FieldError[]): FieldError[] {
  return errors.map((e) => ({ ...e, field: `${prefix}.${e.field.replace(/^body\./, '')}` }))
}

/**
 * Offers windows of a tentative visit with the visit version the caller saw, holding the visit's team for every
 * window until the offer expires. Refusals: NOT_FOUND, FORBIDDEN (an Estimator on a work visit), STALE_VERSION,
 * NOT_CONFIGURED (business.timezone, contact.hours, scheduling.window_offers), VALIDATION_FAILED (the windows: their
 * number, overlap, local-time problems, a window in the past), CONFLICT naming every unmet requirement (VISIT_NOT_TENTATIVE,
 * OFFER_OPEN, DURATION_NOT_ENTERED, WORKERS_NOT_ENTERED, WORKER_COUNT_MISMATCH, WORKER_REPEATED, EQUIPMENT_NOT_ASSIGNED,
 * EQUIPMENT_REPEATED, a gate's codes, and per window `windows[i].<capacity code>`) with alternatives for the first
 * window that cannot be held. Nothing partial is written.
 */
export async function offerWindows(
  tx: Tx,
  actor: StaffActor,
  scope: DataScope,
  visitId: string,
  input: OfferInput,
  deps: { gates: readonly WorkVisitGate[]; now: Date; expectedVersion: number; expiry: Automation },
): Promise<OfferResult> {
  const v = await tx.selectFrom('work.visits').selectAll().where('id', '=', visitId).forUpdate().executeTakeFirst()
  if (!v || !scopeIncludesProject(scope, v.project_id)) throw new ApiError('NOT_FOUND')
  const work = isWorkVisitPurpose(v.purpose)
  if (work && !mayPlanWorkVisits(actor)) throw new ApiError('FORBIDDEN')
  if (v.version !== deps.expectedVersion)
    throw new ApiError('STALE_VERSION', { current: { version: v.version, values: { state: v.state } } })
  if (v.state !== 'tentative') throw new ApiError('CONFLICT', { fieldErrors: [field('state', 'VISIT_NOT_TENTATIVE')] })
  const config = await loadConfig(tx)
  const settings = capacitySettings(config)
  const { policy, version: policyVersion } = windowOfferPolicy(config)
  const open = await tx
    .selectFrom('work.window_offers')
    .select('id')
    .where('visit_id', '=', v.id)
    .where('state', '=', 'open')
    .executeTakeFirst()
  if (open) throw new ApiError('CONFLICT', { fieldErrors: [field('offer', 'OFFER_OPEN')] })

  const workerIds = [...input.workerIds]
  const equipmentIds = [...(input.equipmentIds ?? [])]
  const problems: FieldError[] = []
  if (v.expected_duration_minutes === null)
    problems.push(field('visit.expectedDurationMinutes', 'DURATION_NOT_ENTERED'))
  if (v.required_workers === null) problems.push(field('visit.requiredWorkers', 'WORKERS_NOT_ENTERED'))
  if (new Set(workerIds).size !== workerIds.length) problems.push(field('body.workerIds', 'WORKER_REPEATED'))
  else if (v.required_workers !== null && workerIds.length !== v.required_workers)
    problems.push(field('body.workerIds', 'WORKER_COUNT_MISMATCH'))
  if (new Set(equipmentIds).size !== equipmentIds.length)
    problems.push(field('body.equipmentIds', 'EQUIPMENT_REPEATED'))
  else if (equipmentIds.length < v.equipment.length) problems.push(field('body.equipmentIds', 'EQUIPMENT_NOT_ASSIGNED'))
  problems.push(...(await approvalProblems(tx, v)))
  if (v.job_id !== null)
    for (const code of await unmetGates(tx, { jobId: v.job_id, projectId: v.project_id }, deps.gates))
      problems.push(field('job', code))
  // TSK-0064 (PROPOSED): no times are offered while a hold blocks their confirmation.
  problems.push(...(await blockingHoldProblems(tx, v.project_id)))
  if (v.expected_duration_minutes === null || v.required_workers === null)
    throw new ApiError('CONFLICT', { fieldErrors: problems })

  // The windows, in the visit's zone (the property's zone at planning time).
  const windows: LocalWindow[] = []
  const invalid: FieldError[] = []
  input.windows.forEach((entry, i) => {
    try {
      windows.push(resolveEntry(entry, v.time_zone, deps.now))
    } catch (err) {
      if (!(err instanceof ApiError) || err.code !== 'VALIDATION_FAILED') throw err
      invalid.push(...prefixed(`body.windows[${i}]`, err.options.fieldErrors ?? []))
    }
  })
  if (invalid.length) throw new ApiError('VALIDATION_FAILED', { fieldErrors: invalid })
  const facts = factsOf(v)
  const ranges = windows.map((w) => reservedRange(w, facts))
  const shape = offerProblems(ranges, policy).map((p) =>
    p.code === 'OFFER_WINDOW_COUNT'
      ? field('body.windows', p.code)
      : field(`body.windows[${p.positions[1] - 1}]`, p.code),
  )
  if (shape.length) throw new ApiError('VALIDATION_FAILED', { fieldErrors: shape })

  const requests: ReservationRequest[] = windows.map((w, i) => ({
    visitId: v.id,
    purpose: v.purpose,
    visitZone: v.time_zone,
    range: ranges[i] as Interval,
    onSite: onSiteRange(w, facts),
    travelMinutes: v.travel_buffer_minutes ?? 0,
    workerIds,
    equipmentIds,
    actorId: actor.userId,
    reason: null,
    replaceOwn: false,
    settings,
    now: deps.now,
  }))
  const check = async (): Promise<{ problems: FieldError[]; first: ReservationRequest | null }> => {
    const found: FieldError[] = []
    let first: ReservationRequest | null = null
    for (const [i, req] of requests.entries()) {
      const p = await evaluate(tx, req)
      if (p.length && !first) first = req
      found.push(...p.map((e) => ({ ...e, field: `windows[${i}].${e.field}` })))
    }
    return { problems: found, first }
  }
  const checked = await check()
  problems.push(...checked.problems)
  if (problems.length)
    throw new ApiError('CONFLICT', {
      fieldErrors: problems,
      ...(checked.first ? { alternatives: await alternatives(tx, checked.first) } : {}),
    })

  // The next number of the project's offers, under the project's lock.
  await tx.selectFrom('crm.projects').select('id').where('id', '=', v.project_id).forUpdate().execute()
  const last = await tx
    .selectFrom('work.window_offers')
    .select((eb) => eb.fn.max('number').as('n'))
    .where('project_id', '=', v.project_id)
    .executeTakeFirst()
  const instructions = input.preparationInstructions?.trim() || null
  const offer = await tx
    .insertInto('work.window_offers')
    .values({
      visit_id: v.id,
      project_id: v.project_id,
      number: Number(last?.n ?? 0) + 1,
      hold_hours: policy.holdHours,
      policy_version: policyVersion,
      offered_by: actor.userId,
      // Both instants are set by the database (offered now, expiring holdHours later).
      expires_at: holdExpiresAt(deps.now, policy),
      preparation_instructions: instructions,
    })
    .returning(['id', 'number', 'version', 'offered_at', 'expires_at'])
    .executeTakeFirstOrThrow()
  const expiresAt = new Date(offer.expires_at)
  for (const [i, w] of windows.entries()) {
    const r = ranges[i] as Interval
    await tx
      .insertInto('work.window_offer_options')
      .values({
        offer_id: offer.id,
        position: i + 1,
        local_date: w.date,
        window_start: w.start,
        window_end: w.end,
        time_zone: w.zone,
        start_offset_minutes: w.startOffsetMinutes,
        end_offset_minutes: w.endOffsetMinutes,
        starts_at: w.startsAt,
        ends_at: w.endsAt,
        reserved_starts_at: new Date(r.start),
        reserved_ends_at: new Date(r.end),
      })
      .execute()
  }

  // The holds: every worker and item of the team for every window, in one step (resource id order, then window).
  const lead = workerIds[0] as string
  const rows = windows.flatMap((_, i) => {
    const r = ranges[i] as Interval
    const common = {
      visit_id: v.id,
      kind: 'hold',
      hold_expires_at: expiresAt,
      starts_at: new Date(r.start),
      ends_at: new Date(r.end),
      time_zone: v.time_zone,
      assigned_by: actor.userId,
      offer_id: offer.id,
      offer_position: i + 1,
    }
    return [
      ...workerIds.map((id) => ({
        sort: `w:${id}:${i}`,
        row: { ...common, resource: 'worker', staff_user_id: id, role: id === lead ? 'lead' : 'member' },
      })),
      ...equipmentIds.map((id) => ({
        sort: `e:${id}:${i}`,
        row: { ...common, resource: 'equipment', equipment_id: id },
      })),
    ]
  })
  rows.sort((a, b) => (a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : 0))
  await sql`SAVEPOINT window_offer_holds`.execute(tx)
  try {
    for (const { row } of rows) await tx.insertInto('work.reservations').values(row).execute()
  } catch (err) {
    if (!RACE.has((err as { code?: string }).code ?? '')) throw err
    // A concurrent offer or confirmation took the capacity first: nothing of this offer stays.
    await sql`ROLLBACK TO SAVEPOINT window_offer_holds`.execute(tx)
    const again = await check()
    throw new ApiError('CONFLICT', {
      fieldErrors: again.problems.length ? again.problems : [field('reservation', 'CAPACITY_TAKEN')],
      alternatives: await alternatives(tx, again.first ?? (requests[0] as ReservationRequest)),
    })
  }
  await sql`RELEASE SAVEPOINT window_offer_holds`.execute(tx)

  const requestId = requestIdOf(`window-offer:${offer.id}`)
  if (!work)
    await outbox.add(tx, {
      type: ESTIMATE_VISIT_OPTIONS_EVENT,
      aggregate: { type: 'window_offer', id: offer.id, version: offer.version },
      payload: { visitId: v.id, number: offer.number },
      idempotencyKey: `${ESTIMATE_VISIT_OPTIONS_EVENT}:${offer.id}`,
      requestId,
    })
  await scheduleJob(tx, deps.expiry, {
    key: offer.id,
    runAt: expiresAt,
    target: { type: 'window_offer', id: offer.id },
    requestId,
  })
  await resolveOfferItem(tx, v.project_id, 'new_offer')
  return {
    offerId: offer.id,
    number: offer.number,
    projectId: v.project_id,
    visitId: v.id,
    purpose: v.purpose,
    expiresAt,
    holdHours: policy.holdHours,
    policyVersion,
    windows,
    workerIds,
    equipmentIds,
  }
}

type OfferRow = {
  id: string
  visit_id: string
  project_id: string
  number: number
  state: string
  version: number
  expires_at: Date
  offered_by: string
  selected_position: number | null
  selected_by_contact: string | null
}

async function lockOffer(tx: Tx, where: { id: string } | { projectId: string; number: number }) {
  let q = tx
    .selectFrom('work.window_offers')
    .select([
      'id',
      'visit_id',
      'project_id',
      'number',
      'state',
      'version',
      'expires_at',
      'offered_by',
      'selected_position',
      'selected_by_contact',
    ])
  q =
    'id' in where
      ? q.where('id', '=', where.id)
      : q.where('project_id', '=', where.projectId).where('number', '=', where.number)
  return (await q.forUpdate().executeTakeFirst()) as OfferRow | undefined
}

/**
 * Withdraws an open offer with the offer version the caller saw and a reason (PROPOSED); every hold of it ends
 * ('hold_released') and the visit stays tentative. Refusals: NOT_FOUND, FORBIDDEN, STALE_VERSION, VALIDATION_FAILED
 * (REASON_REQUIRED), CONFLICT (OFFER_<state> for an offer that already ended).
 */
export async function withdrawOffer(
  tx: Tx,
  actor: StaffActor,
  scope: DataScope,
  offerId: string,
  input: { reason?: string },
  deps: { expectedVersion: number },
): Promise<{ offerId: string; number: number; visitId: string; projectId: string; version: number }> {
  const o = await lockOffer(tx, { id: offerId })
  if (!o || !scopeIncludesProject(scope, o.project_id)) throw new ApiError('NOT_FOUND')
  const v = await tx
    .selectFrom('work.visits')
    .select(['purpose'])
    .where('id', '=', o.visit_id)
    .executeTakeFirstOrThrow()
  if (isWorkVisitPurpose(v.purpose) && !mayPlanWorkVisits(actor)) throw new ApiError('FORBIDDEN')
  if (o.version !== deps.expectedVersion)
    throw new ApiError('STALE_VERSION', { current: { version: o.version, values: { state: o.state } } })
  if (o.state !== 'open')
    throw new ApiError('CONFLICT', { fieldErrors: [field('offer', `OFFER_${o.state.toUpperCase()}`)] })
  const reason = input.reason?.trim()
  if (!reason) throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body.reason', 'REASON_REQUIRED')] })
  const updated = await tx
    .updateTable('work.window_offers')
    .set({ state: 'withdrawn', version: o.version + 1, closed_by: actor.userId, closed_reason: reason })
    .where('id', '=', o.id)
    .returning('version')
    .executeTakeFirstOrThrow()
  return { offerId: o.id, number: o.number, visitId: o.visit_id, projectId: o.project_id, version: updated.version }
}

/**
 * The expiry of one offer (its job at expires_at): an offer still open whose hold time has passed expires; the
 * database ends its holds and expires its tentative visit. An offer that ended meanwhile is left as it is.
 */
export async function expireOfferIfDue(tx: Tx, offerId: string): Promise<'expired' | 'unchanged'> {
  const o = await lockOffer(tx, { id: offerId })
  if (!o || o.state !== 'open') return 'unchanged'
  const now = await dbNow(tx)
  // Not due yet: the job fails and retries instead of expiring anything early.
  if (now.getTime() < new Date(o.expires_at).getTime()) throw new Error(`window offer ${offerId} is not due to expire`)
  await tx
    .updateTable('work.window_offers')
    .set({ state: 'expired', version: o.version + 1 })
    .where('id', '=', o.id)
    .execute()
  await openOfferItem(tx, o.project_id, 'window_offer_expired')
  return 'expired'
}

/** The schedule automation of the hold expiry (OWN-DEC-144): one job per offer, at its expiry. */
export function windowOfferExpiryAutomation(): Automation {
  return {
    name: 'visit.window_offer_expiry',
    trigger: { kind: 'schedule', description: 'one job per window offer, at the end of its hold (expires_at)' },
    identity: 'system.scheduling',
    inputs: { description: 'the window offer (job target); the offer as it is when the job runs', version: 1 },
    idempotency: 'one job per offer (key: the offer id); an offer that already ended is left as it is',
    effect: 'expires an open window offer whose hold ended: its holds end and its tentative visit expires',
    retry: { maxAttempts: 5, baseDelayMs: 60_000, maxDelayMs: 3_600_000 },
    timeoutMs: 10_000,
    exceptionOwner: 'office',
    audit: { action: 'visit.window_offer_expire' },
    handle: async ({ tx, job }) => {
      const id = job.target.id
      if (!id) return 'cancelled'
      return (await expireOfferIfDue(tx, id)) === 'expired' ? 'done' : 'cancelled'
    },
  }
}

type CustomerRef = { readonly reference: string; readonly number: number }

/** The offer of a project the customer's scope opens, locked; NOT_FOUND for anything else. */
async function customerOffer(tx: Tx, scope: DataScope, ref: CustomerRef): Promise<OfferRow> {
  const project = await findProject(tx, scope, { reference: ref.reference })
  if (!project) throw new ApiError('NOT_FOUND')
  const o = await lockOffer(tx, { projectId: project.id, number: ref.number })
  if (!o) throw new ApiError('NOT_FOUND')
  return o
}

const ended = (o: OfferRow) => field('offer', `OFFER_${o.state.toUpperCase()}`)

export type Selection = {
  readonly visitId: string
  readonly projectId: string
  readonly offerId: string
  readonly purpose: string
  readonly position: number
  readonly window: LocalWindow
  /** False when this customer had already selected the same window (a second tab or a retry). */
  readonly created: boolean
}

/**
 * The customer selects one window of an offer while it is held (HH-SCH-11, T38). In one transaction under the offer
 * lock: the window is rechecked, the offer is selected (its holds become the booking, the others are released), the
 * visit takes the window and is confirmed, and the confirmation notice's event is written. Refusals: NOT_FOUND,
 * VALIDATION_FAILED (POSITION_UNKNOWN), CONFLICT on `offer` (OFFER_EXPIRED, OFFER_WITHDRAWN, OFFER_SELECTED,
 * OFFER_OTHER_TIMES_REQUESTED) or on `body.position` (WINDOW_UNAVAILABLE: the window can no longer be kept;
 * SCHEDULING_NOT_READY: a confirmation precondition is unmet (approval, deposit, a gate, a blocking hold), with
 * `deposit` DEPOSIT_REQUIRED or DEPOSIT_REQUIREMENT_MISSING when the job's deposit is among them). A refusal changes
 * nothing. The customer sees no staff detail: a conflict names no worker, item, hold or gate.
 */
export async function selectWindow(
  tx: Tx,
  actor: CustomerActor,
  scope: DataScope,
  ref: CustomerRef & { readonly position: number },
  deps: { gates: readonly WorkVisitGate[] },
): Promise<Selection> {
  const o = await customerOffer(tx, scope, ref)
  const v = await tx
    .selectFrom('work.visits')
    .selectAll()
    .where('id', '=', o.visit_id)
    .forUpdate()
    .executeTakeFirstOrThrow()
  const option = await tx
    .selectFrom('work.window_offer_options')
    .selectAll()
    .where('offer_id', '=', o.id)
    .where('position', '=', ref.position)
    .executeTakeFirst()
  if (o.state === 'selected' && o.selected_position === ref.position && o.selected_by_contact === actor.contactId)
    return {
      visitId: v.id,
      projectId: v.project_id,
      offerId: o.id,
      purpose: v.purpose,
      position: ref.position,
      window: storedWindow(v),
      created: false,
    }
  if (o.state !== 'open') throw new ApiError('CONFLICT', { fieldErrors: [ended(o)] })
  const now = await dbNow(tx)
  if (now.getTime() >= new Date(o.expires_at).getTime())
    throw new ApiError('CONFLICT', { fieldErrors: [field('offer', 'OFFER_EXPIRED')] })
  if (!option) throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body.position', 'POSITION_UNKNOWN')] })
  const window = storedWindow(option)
  const unavailable = () => new ApiError('CONFLICT', { fieldErrors: [field('body.position', 'WINDOW_UNAVAILABLE')] })
  if (window.startsAt.getTime() <= now.getTime()) throw unavailable()
  // TSK-0064 (HH-SCH-06, RULE-SAFETY-GATES): the selection confirms the visit, so every confirmation precondition runs
  // here, in this transaction: the approval and the deposit gate of TSK-0059 for a work visit (whatever gates the
  // module was given; an estimate visit never waits for a deposit), the other registered gates and no blocking hold.
  const unmet = await confirmationPreconditions(tx, v, deps.gates)
  if (unmet.length) throw new ApiError('CONFLICT', { fieldErrors: customerRefusal(unmet) })
  // The window's holds are all still active (none ended early) and the team still passes every capacity rule.
  const holds = await tx
    .selectFrom('work.reservations')
    .select(['resource', 'staff_user_id', 'equipment_id'])
    .where('offer_id', '=', o.id)
    .where('offer_position', '=', ref.position)
    .where('kind', '=', 'hold')
    .where('ended_at', 'is', null)
    .execute()
  const workerIds = holds.flatMap((h) => (h.staff_user_id ? [h.staff_user_id] : []))
  const equipmentIds = holds.flatMap((h) => (h.equipment_id ? [h.equipment_id] : []))
  if (workerIds.length !== v.required_workers || equipmentIds.length < v.equipment.length) throw unavailable()
  const config = await loadConfig(tx)
  const facts = factsOf(v)
  const problems = await evaluate(tx, {
    visitId: v.id,
    purpose: v.purpose,
    visitZone: v.time_zone,
    range: reservedRange(window, facts),
    onSite: onSiteRange(window, facts),
    travelMinutes: v.travel_buffer_minutes ?? 0,
    workerIds,
    equipmentIds,
    actorId: o.offered_by,
    reason: null,
    // The visit's own holds of this window are what is being kept; they never count against it.
    replaceOwn: true,
    settings: capacitySettings(config),
    now,
  })
  if (problems.length) throw unavailable()

  await tx
    .updateTable('work.window_offers')
    .set({
      state: 'selected',
      version: o.version + 1,
      selected_position: ref.position,
      selected_by_contact: actor.contactId,
    })
    .where('id', '=', o.id)
    .execute()
  // The visit takes the selected window (its next window version, set from the staff member's offer; unchanged when it
  // is the window the visit was planned with) and is confirmed.
  const current = storedWindow(v)
  const same =
    current.startsAt.getTime() === window.startsAt.getTime() && current.endsAt.getTime() === window.endsAt.getTime()
  const confirmedVersion = same ? v.version + 1 : v.version + 2
  if (!same)
    await tx
      .updateTable('work.visits')
      .set({
        local_date: window.date,
        window_start: window.start,
        window_end: window.end,
        time_zone: window.zone,
        start_offset_minutes: window.startOffsetMinutes,
        end_offset_minutes: window.endOffsetMinutes,
        starts_at: window.startsAt,
        ends_at: window.endsAt,
        window_version: v.window_version + 1,
        window_set_by: o.offered_by,
        window_reason: null,
        version: v.version + 1,
        updated_at: sql<Date>`now()`,
      })
      .where('id', '=', v.id)
      .execute()
  await tx
    .updateTable('work.visits')
    .set({ state: 'confirmed', version: confirmedVersion, updated_at: sql<Date>`now()` })
    .where('id', '=', v.id)
    .execute()
  // PROPOSED (as for a staff confirmation): the job's scheduling task is fulfilled by its first confirmed work visit.
  if (v.job_id !== null)
    await tx
      .updateTable('work.scheduling_tasks')
      .set((eb) => ({ state: 'fulfilled', version: eb('version', '+', 1) }))
      .where('job_id', '=', v.job_id)
      .where('state', 'in', ['open', 'planning'])
      .execute()
  await recordReserved(tx, { id: v.id, purpose: v.purpose, version: confirmedVersion })
  await resolveOfferItem(tx, v.project_id, 'window_selected')
  return {
    visitId: v.id,
    projectId: v.project_id,
    offerId: o.id,
    purpose: v.purpose,
    position: ref.position,
    window,
    created: true,
  }
}

/** The committed event of a reserved visit, which triggers its automatic confirmation notice (#6 or #10). */
export async function recordReserved(tx: Tx, v: { id: string; purpose: string; version: number }): Promise<void> {
  const type = isWorkVisitPurpose(v.purpose) ? APPOINTMENT_RESERVED_EVENT : ESTIMATE_VISIT_RESERVED_EVENT
  await outbox.add(tx, {
    type,
    aggregate: { type: 'visit', id: v.id, version: v.version },
    payload: { purpose: v.purpose },
    idempotencyKey: `${type}:${v.id}`,
    requestId: requestIdOf(`visit-reserved:${v.id}`),
  })
}

/**
 * The customer asks for other times while the offer is held, with an optional note: every hold is released, the
 * visit stays tentative and staff get a queue item to offer new windows. Refusals: NOT_FOUND, CONFLICT on `offer`.
 */
export async function requestOtherTimes(
  tx: Tx,
  scope: DataScope,
  ref: CustomerRef & { readonly note?: string | undefined },
): Promise<{ offerId: string; visitId: string; projectId: string }> {
  const o = await customerOffer(tx, scope, ref)
  if (o.state !== 'open') throw new ApiError('CONFLICT', { fieldErrors: [ended(o)] })
  const now = await dbNow(tx)
  if (now.getTime() >= new Date(o.expires_at).getTime())
    throw new ApiError('CONFLICT', { fieldErrors: [field('offer', 'OFFER_EXPIRED')] })
  await tx
    .updateTable('work.window_offers')
    .set({ state: 'other_times_requested', version: o.version + 1, customer_note: ref.note?.trim() || null })
    .where('id', '=', o.id)
    .execute()
  await openOfferItem(tx, o.project_id, 'window_other_times_requested')
  return { offerId: o.id, visitId: o.visit_id, projectId: o.project_id }
}

// --- Views ------------------------------------------------------------------------------------------------------

type StaffRef = { id: string; name: string | null }
type WindowShown = ReturnType<typeof windowShape>
const windowShape = (w: LocalWindow) => ({
  localDate: w.date,
  start: w.start,
  end: w.end,
  timeZone: w.zone,
  startsAt: w.startsAt.toISOString(),
  endsAt: w.endsAt.toISOString(),
})

export type NoticeView = { messageKey: string; channel: string; state: string; errorCode: string | null }

/** The deliveries recorded for records (window offers, visits), by record id. */
export async function noticesOf(db: Reader, recordType: string, ids: readonly string[]) {
  const out = new Map<string, NoticeView[]>()
  if (ids.length === 0) return out
  const rows = await db
    .selectFrom('platform.message_deliveries')
    .select(['record_id', 'message_key', 'channel', 'state', 'error_code'])
    .where('record_type', '=', recordType)
    .where('record_id', 'in', [...ids])
    .orderBy('seq')
    .execute()
  for (const r of rows) {
    const id = r.record_id as string
    out.set(id, [
      ...(out.get(id) ?? []),
      { messageKey: r.message_key, channel: r.channel, state: r.state, errorCode: r.error_code },
    ])
  }
  return out
}

export type StaffOfferView = {
  id: string
  number: number
  state: string
  /** Open and inside its hold time. */
  held: boolean
  version: number
  offeredBy: StaffRef
  offeredAt: string
  expiresAt: string
  holdHours: number
  preparationInstructions: string | null
  windows: { position: number; window: WindowShown; reservedRange: { startsAt: string; endsAt: string } }[]
  selectedPosition: number | null
  closedAt: string | null
  closedBy: StaffRef | null
  closedReason: string | null
  customerNote: string | null
  /** The automatic notice this offer triggers; null: none is on the automatic list (work-visit windows). */
  noticeKey: string | null
  notices: NoticeView[]
  actions: { withdraw: boolean }
}

/** The offers of these visits for staff, newest first per visit. */
export async function staffOffers(
  db: Reader,
  visits: readonly { id: string; purpose: string }[],
  names: (id: string) => StaffRef,
  canWithdraw: (purpose: string) => boolean,
  now: Date,
): Promise<Map<string, StaffOfferView[]>> {
  const out = new Map<string, StaffOfferView[]>()
  if (visits.length === 0) return out
  const offers = await db
    .selectFrom('work.window_offers')
    .selectAll()
    .where(
      'visit_id',
      'in',
      visits.map((v) => v.id),
    )
    .orderBy('number', 'desc')
    .execute()
  if (offers.length === 0) return out
  const options = await db
    .selectFrom('work.window_offer_options')
    .selectAll()
    .where(
      'offer_id',
      'in',
      offers.map((o) => o.id),
    )
    .orderBy('position')
    .execute()
  const notices = await noticesOf(
    db,
    'window_offer',
    offers.map((o) => o.id),
  )
  for (const o of offers) {
    const purpose = visits.find((v) => v.id === o.visit_id)?.purpose ?? 'site_estimate'
    const expires = new Date(o.expires_at)
    const view: StaffOfferView = {
      id: o.id,
      number: o.number,
      state: o.state,
      held: o.state === 'open' && now.getTime() < expires.getTime(),
      version: o.version,
      offeredBy: names(o.offered_by),
      offeredAt: new Date(o.offered_at).toISOString(),
      expiresAt: expires.toISOString(),
      holdHours: o.hold_hours,
      preparationInstructions: o.preparation_instructions,
      windows: options
        .filter((p) => p.offer_id === o.id)
        .map((p) => ({
          position: p.position,
          window: windowShape(storedWindow(p)),
          reservedRange: {
            startsAt: new Date(p.reserved_starts_at).toISOString(),
            endsAt: new Date(p.reserved_ends_at).toISOString(),
          },
        })),
      selectedPosition: o.selected_position,
      closedAt: o.closed_at ? new Date(o.closed_at).toISOString() : null,
      closedBy: o.closed_by ? names(o.closed_by) : null,
      closedReason: o.closed_reason,
      customerNote: o.customer_note,
      noticeKey: isWorkVisitPurpose(purpose) ? OFFER_NOTICE.work : OFFER_NOTICE.estimate,
      notices: notices.get(o.id) ?? [],
      actions: { withdraw: o.state === 'open' && canWithdraw(purpose) },
    }
    out.set(o.visit_id, [...(out.get(o.visit_id) ?? []), view])
  }
  return out
}

/** Customer-facing purpose codes: an Estimate visit, or a work visit of the job (T37). */
const customerPurpose = (purpose: string) => (isWorkVisitPurpose(purpose) ? 'work_visit' : 'estimate_visit')
const SHOWN_VISIT_STATES = ['confirmed', 'en_route', 'arrived', 'completed'] as const

export type CustomerOffer = {
  number: number
  purpose: 'estimate_visit' | 'work_visit'
  status: 'open' | 'expired' | 'other_times_requested'
  offeredAt: Date
  expiresAt: Date
  windows: (WindowShown & { position: number })[]
}
export type CustomerAppointment = {
  purpose: 'estimate_visit' | 'work_visit'
  status: string
  window: WindowShown
  address: { street: string; unit: string | null; city: string; state: string; zip: string }
  preparationInstructions: string | null
}
export type CustomerAppointments = { offers: CustomerOffer[]; appointments: CustomerAppointment[] }

/**
 * The Appointments tab of a project in the caller's scope (HH-LEAD-07, HH-SCH-11, T37): each visit's latest offer the
 * customer can still see (open, expired unselected, or other times asked for), with its windows; and the confirmed
 * visits with the date, arrival window, property address, visit purpose and preparation instructions. Never a
 * tentative visit without an offer, a hold, a worker, a staff detail or an ID. Null for a project outside the scope.
 */
export async function customerAppointments(
  db: Reader,
  scope: DataScope,
  reference: string,
  now: Date,
): Promise<(CustomerAppointments & { reference: string }) | null> {
  const project = await findProject(db, scope, { reference })
  if (!project) return null
  return { reference: project.reference, ...(await appointmentsOf(db, project.id, now)) }
}

/** The customer's view of one project's visits (see customerAppointments); the caller has checked the scope. */
export async function appointmentsOf(db: Reader, projectId: string, now: Date): Promise<CustomerAppointments> {
  const visits = await db
    .selectFrom('work.visits as v')
    .innerJoin('crm.properties as p', 'p.id', 'v.property_id')
    .select([
      'v.id',
      'v.purpose',
      'v.state',
      'v.local_date',
      'v.window_start',
      'v.window_end',
      'v.time_zone',
      'v.start_offset_minutes',
      'v.end_offset_minutes',
      'v.starts_at',
      'v.ends_at',
      'p.street',
      'p.unit',
      'p.city',
      'p.state as address_state',
      'p.zip',
    ])
    .where('v.project_id', '=', projectId)
    .orderBy('v.starts_at')
    .execute()
  const offers = visits.length
    ? await db
        .selectFrom('work.window_offers')
        .select([
          'id',
          'visit_id',
          'number',
          'state',
          'offered_at',
          'expires_at',
          'preparation_instructions',
          'selected_position',
        ])
        .where('project_id', '=', projectId)
        .orderBy('number', 'desc')
        .execute()
    : []
  const options = offers.length
    ? await db
        .selectFrom('work.window_offer_options')
        .selectAll()
        .where(
          'offer_id',
          'in',
          offers.map((o) => o.id),
        )
        .orderBy('position')
        .execute()
    : []
  const shownOffers: CustomerOffer[] = []
  const appointments: CustomerAppointment[] = []
  const purposeOf = new Map(visits.map((v) => [v.id, customerPurpose(v.purpose)]))
  // An offer that ended unselected is shown until a newer offer of the same purpose, or a confirmed visit of it, exists.
  const superseded = (o: { visit_id: string; number: number }) =>
    offers.some((x) => x.number > o.number && purposeOf.get(x.visit_id) === purposeOf.get(o.visit_id)) ||
    visits.some(
      (x) =>
        (SHOWN_VISIT_STATES as readonly string[]).includes(x.state) &&
        purposeOf.get(x.id) === purposeOf.get(o.visit_id),
    )
  for (const v of visits) {
    const latest = offers.find((o) => o.visit_id === v.id)
    if (
      latest &&
      (v.state === 'tentative' || v.state === 'expired') &&
      (latest.state === 'open' || !superseded(latest))
    ) {
      const status =
        latest.state === 'open'
          ? now.getTime() < new Date(latest.expires_at).getTime()
            ? 'open'
            : 'expired'
          : latest.state === 'expired' || latest.state === 'other_times_requested'
            ? latest.state
            : null
      if (status)
        shownOffers.push({
          number: latest.number,
          purpose: customerPurpose(v.purpose),
          status,
          offeredAt: new Date(latest.offered_at),
          expiresAt: new Date(latest.expires_at),
          windows: options
            .filter((p) => p.offer_id === latest.id)
            .map((p) => ({ position: p.position, ...windowShape(storedWindow(p)) })),
        })
    }
    if ((SHOWN_VISIT_STATES as readonly string[]).includes(v.state)) {
      const selected = offers.find((o) => o.visit_id === v.id && o.state === 'selected')
      appointments.push({
        purpose: customerPurpose(v.purpose),
        status: v.state,
        window: windowShape(storedWindow(v)),
        address: { street: v.street, unit: v.unit, city: v.city, state: v.address_state, zip: v.zip },
        preparationInstructions: selected?.preparation_instructions ?? null,
      })
    }
  }
  return { offers: shownOffers, appointments }
}

/**
 * What the Overview's status needs from the visits (PortalFacts, @handyhub/domain/portal): windows offered and held
 * for an estimate visit or a work visit, the current stage's visit when it is confirmed (or under way), and the next
 * appointment shown beside the status.
 */
export function overviewVisitFacts(a: CustomerAppointments, projectApproved: boolean) {
  const stage = projectApproved ? 'work_visit' : 'estimate_visit'
  const current = a.appointments.find((x) => x.purpose === stage && x.status !== 'completed')
  return {
    visitWindowsOffered: a.offers.some((o) => o.status === 'open' && o.purpose === 'estimate_visit'),
    workWindowsOffered: a.offers.some((o) => o.status === 'open' && o.purpose === 'work_visit'),
    visit: current ? (current.status === 'confirmed' ? ('confirmed' as const) : ('on_the_way' as const)) : undefined,
    appointment: a.appointments.find((x) => x.status !== 'completed') ?? null,
  }
}

// --- Automatic notices (FACT-AUTOMATIC-MESSAGES #5, #6, #10) ------------------------------------------------------

export type VisitNoticeDeps = { providers: NotificationProviders }

function destinationsOf(r: { email: string; phone_e164: string; preferred_channel: string }): Destination[] {
  return [
    { channel: 'email', destination: r.email, permission: r.preferred_channel === 'email' ? 'preferred' : 'permitted' },
    ...(r.phone_e164
      ? [
          {
            channel: 'sms' as const,
            destination: r.phone_e164,
            permission: r.preferred_channel === 'text' ? ('preferred' as const) : ('permitted' as const),
          },
        ]
      : []),
  ]
}

/** #5 "Estimate-visit options available": sent while the offer is still open and held (else stale: nothing sent). */
export function estimateVisitOptionsAutomation(deps: VisitNoticeDeps): Automation {
  return notificationAutomation({
    messageKey: OFFER_NOTICE.estimate,
    providers: deps.providers,
    resolve: async ({ tx, job }) => {
      const id = job.target.id
      if (!id) return 'stale'
      const o = await tx
        .selectFrom('work.window_offers as o')
        .innerJoin('work.visits as v', 'v.id', 'o.visit_id')
        .select(['o.id', 'o.project_id', 'o.state', 'o.expires_at', 'v.purpose'])
        .where('o.id', '=', id)
        .executeTakeFirst()
      if (!o || o.state !== 'open' || isWorkVisitPurpose(o.purpose)) return 'stale'
      if ((await dbNow(tx)).getTime() >= new Date(o.expires_at).getTime()) return 'stale'
      const r = await requestOf(tx, o.project_id)
      if (!r) return 'stale'
      return {
        subjectKey: `window_offer:${o.id}`,
        record: { type: 'window_offer', id: o.id },
        recipients: [{ kind: 'customer_contact', id: r.contactId, destinations: destinationsOf(r) }],
        // The secure project link is not supplied yet (see estimates/notify.ts); the wording is NOT CONFIGURED.
        values: {},
        failureItem: { reference: r.reference, projectId: o.project_id, assignedStaffId: r.responsible_staff_id },
      }
    },
  })
}

function confirmedAutomation(messageKey: string, work: boolean, deps: VisitNoticeDeps): Automation {
  return notificationAutomation({
    messageKey,
    providers: deps.providers,
    resolve: async ({ tx, job }) => {
      const id = job.target.id
      if (!id) return 'stale'
      const v = await tx.selectFrom('work.visits').selectAll().where('id', '=', id).executeTakeFirst()
      // A visit no longer confirmed (cancelled, already on the way) sends no confirmation.
      if (!v || v.state !== 'confirmed' || isWorkVisitPurpose(v.purpose) !== work) return 'stale'
      const r = await requestOf(tx, v.project_id)
      if (!r) return 'stale'
      return {
        subjectKey: `visit:${v.id}`,
        record: { type: 'visit', id: v.id },
        recipients: [{ kind: 'customer_contact', id: r.contactId, destinations: destinationsOf(r) }],
        // Customer messages are English (RULE-LANGUAGES); the project link is not supplied yet.
        values: { visitWindow: windowText(storedWindow(v), 'en-US') },
        failureItem: { reference: r.reference, projectId: v.project_id, assignedStaffId: r.responsible_staff_id },
      }
    },
  })
}

/** #6 "Estimate visit confirmed" (OWN-DEC-99), once per reserved estimate visit. */
export const estimateVisitConfirmedAutomation = (deps: VisitNoticeDeps) =>
  confirmedAutomation(CONFIRMED_NOTICE.estimate, false, deps)
/** #10 "Work appointment confirmed" (OWN-DEC-105), once per reserved work visit. */
export const appointmentConfirmedAutomation = (deps: VisitNoticeDeps) =>
  confirmedAutomation(CONFIRMED_NOTICE.work, true, deps)
