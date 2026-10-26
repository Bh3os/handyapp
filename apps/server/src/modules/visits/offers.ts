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
// - Notices (FACT-AUTOMATIC-MESSAGES): publishing estimate-visit windows triggers estimate_visit.options (#5) and,
//   TSK-0120 (OWN-DEC-156), publishing work-visit windows work_visit.options (#11); a reserved estimate visit
//   estimate_visit.confirmed (#6); a reserved work visit appointment.confirmed (#12). Their wording is the owner's
//   (migration 0065) and TSK-0120 supplies its values, so the emails are sent once each; a confirmation is sent only
//   after the reservation committed. Texts have no wording until A2P 10DLC and are recorded as template_not_configured.
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
// - TSK-0146 (OWN-DEC-194 B7): the preparation instructions start from the Owner-approved defaults of the visit's
//   services (preparation.ts); the offer keeps the text staff sent with its basis (default, edited, staff, none) and
//   the default versions it started from. Unsafe instructions (hazardous preparation, a hazard inspection) are refused
//   when the offer is saved and again when it is published.
import type { Db, Tx } from '@handyhub/db'
import {
  isWorkVisitPurpose,
  offerProblems,
  onSiteRange,
  reservedRange,
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
import {
  firstNameOf,
  instantText,
  jobNumberOf,
  notificationAutomation,
  portalLink,
  present,
  valuesFor,
  visitNumberOf,
  visitWindowValues,
  type Destination,
  type NotificationProviders,
} from '../notifications/index.js'
import { openQueueItem, resolveQueueItem } from '../queue/items.js'
import { findProject } from '../records/index.js'
import { customerRequestsOf } from './changes.js'
import { unmetGates, type WorkVisitGate } from './gates.js'
import { flagCancellationPattern } from './patterns.js'
import { offerPreparation, unsafeProblems } from './preparation.js'
import { approvalProblems, blockingHoldProblems, confirmationPreconditions, customerRefusal } from './preconditions.js'
import { siteCheckProblems } from './site-checks.js'
import { factsOf, mayPlanWorkVisits, resolveEntry, storedWindow, type WindowEntry } from './visits.js'

type Reader = Db | Tx

const field = (f: string, code: string): FieldError => ({ field: f, code, message: '' })

export const ESTIMATE_VISIT_OPTIONS_EVENT = 'estimate_visit.windows_published'
/** TSK-0120 (OWN-DEC-156): publishing work-visit windows triggers the work_appointment_windows notice. */
export const WORK_VISIT_OPTIONS_EVENT = 'work_visit.windows_published'
export const ESTIMATE_VISIT_RESERVED_EVENT = 'estimate_visit.reserved'
export const APPOINTMENT_RESERVED_EVENT = 'appointment.reserved'
/** The automatic notice a published offer triggers, by purpose (FACT-AUTOMATIC-MESSAGES #5 and #11). */
export const OFFER_NOTICE = { estimate: 'estimate_visit.options', work: 'work_visit.options' } as const
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
export async function requestOf(db: Reader, projectId: string) {
  return db
    .selectFrom('intake.requests as r')
    .innerJoin('crm.contacts as c', 'c.id', 'r.contact_id')
    .select([
      'r.id',
      'r.reference',
      'r.responsible_staff_id',
      'c.id as contactId',
      'c.full_name',
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
  reason: 'window_other_times_requested' | 'window_offer_expired' | 'window_offer_withdrawn',
) {
  const r = await requestOf(tx, projectId)
  if (!r) return
  await openQueueItem(tx, {
    type: OFFER_QUEUE_TYPE,
    subjectId: r.id,
    reason,
    projectId,
    reference: r.reference,
    status:
      reason === 'window_offer_expired'
        ? 'expired'
        : reason === 'window_offer_withdrawn'
          ? 'withdrawn'
          : 'other_times_requested',
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
  /** Customer-facing preparation instructions, shown with the confirmed visit; TSK-0146: the offer form starts them from
   * the approved defaults of the visit's services, and what is sent here is kept (with its basis). */
  readonly preparationInstructions?: string
  /** TSK-0145 (B1): save the offer as a draft only; nothing is held and no clock runs until it is published. */
  readonly draft?: boolean
  /** TSK-0145 (B4): publishing over the visit's open offer replaces it, with this reason. */
  readonly replaceReason?: string
}

export type OfferResult = {
  readonly offerId: string
  /** The project's offer number; null for a draft (numbered when published). */
  readonly number: number | null
  readonly state: 'draft' | 'open'
  readonly version: number
  readonly projectId: string
  readonly visitId: string
  readonly purpose: string
  readonly publishedAt: Date | null
  readonly expiresAt: Date | null
  readonly holdHours: number
  readonly policyVersion: number
  readonly windows: readonly LocalWindow[]
  readonly workerIds: readonly string[]
  readonly equipmentIds: readonly string[]
  /** The open offer this publication replaced (B4), with its number. */
  readonly replaced: { readonly offerId: string; readonly number: number; readonly version: number } | null
}

const RACE = new Set(['23P01', '40P01'])

/** Field errors of one window, under its place in the body. */
function prefixed(prefix: string, errors: readonly FieldError[]): FieldError[] {
  return errors.map((e) => ({ ...e, field: `${prefix}.${e.field.replace(/^body\./, '')}` }))
}

type VisitRow = Awaited<ReturnType<typeof lockVisit>>

async function lockVisit(tx: Tx, visitId: string) {
  return tx.selectFrom('work.visits').selectAll().where('id', '=', visitId).forUpdate().executeTakeFirst()
}

/**
 * The visit's open offer, locked. Taken before the visit's own lock, in the order the customer's selection takes them
 * (the offer, then the visit), so a replacement and a selection never wait on each other in a cycle.
 */
async function lockOpenOffer(tx: Tx, visitId: string) {
  return tx
    .selectFrom('work.window_offers')
    .select(['id', 'number', 'version'])
    .where('visit_id', '=', visitId)
    .where('state', '=', 'open')
    .forUpdate()
    .executeTakeFirst()
}

/** The team of an offer for its visit: every worker (lead first, no repeat) and an item per equipment entry. */
function teamProblems(v: NonNullable<VisitRow>, workerIds: readonly string[], equipmentIds: readonly string[]) {
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
  return problems
}

/**
 * Saves windows of a tentative visit as a draft offer (TSK-0145, OWN-DEC-194 B1) with the visit version the caller
 * saw: the windows, the team and the instructions are kept as they will be published; nothing is held, no number is
 * given and no clock runs. Refusals: NOT_FOUND, FORBIDDEN (an Estimator on a work visit), STALE_VERSION, NOT_CONFIGURED
 * (scheduling.window_offers), VALIDATION_FAILED (the windows: their number, overlap, local-time problems, a window in
 * the past), CONFLICT (VISIT_NOT_TENTATIVE, OFFER_DRAFT_EXISTS, DURATION_NOT_ENTERED, WORKERS_NOT_ENTERED,
 * WORKER_COUNT_MISMATCH, WORKER_REPEATED, EQUIPMENT_NOT_ASSIGNED, EQUIPMENT_REPEATED).
 */
export async function saveOfferDraft(
  tx: Tx,
  actor: StaffActor,
  scope: DataScope,
  visitId: string,
  input: OfferInput,
  deps: { now: Date; expectedVersion: number },
): Promise<{ offerId: string; version: number; visitId: string; projectId: string; purpose: string }> {
  await lockOpenOffer(tx, visitId)
  const v = await lockVisit(tx, visitId)
  if (!v || !scopeIncludesProject(scope, v.project_id)) throw new ApiError('NOT_FOUND')
  if (isWorkVisitPurpose(v.purpose) && !mayPlanWorkVisits(actor)) throw new ApiError('FORBIDDEN')
  if (v.version !== deps.expectedVersion)
    throw new ApiError('STALE_VERSION', { current: { version: v.version, values: { state: v.state } } })
  if (v.state !== 'tentative') throw new ApiError('CONFLICT', { fieldErrors: [field('state', 'VISIT_NOT_TENTATIVE')] })
  const config = await loadConfig(tx)
  const { policy, version: policyVersion } = windowOfferPolicy(config)
  const draft = await tx
    .selectFrom('work.window_offers')
    .select('id')
    .where('visit_id', '=', v.id)
    .where('state', '=', 'draft')
    .executeTakeFirst()
  if (draft) throw new ApiError('CONFLICT', { fieldErrors: [field('offer', 'OFFER_DRAFT_EXISTS')] })
  const workerIds = [...input.workerIds]
  const equipmentIds = [...(input.equipmentIds ?? [])]
  const problems = teamProblems(v, workerIds, equipmentIds)
  if (problems.length) throw new ApiError('CONFLICT', { fieldErrors: problems })

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
  // TSK-0146 (B7): the instructions against the defaults of the visit's services, and the unsafe-instruction rules.
  const preparation = await offerPreparation(tx, v, input.preparationInstructions)
  invalid.push(...preparation.problems)
  if (invalid.length) throw new ApiError('VALIDATION_FAILED', { fieldErrors: invalid })
  const facts = factsOf(v)
  const ranges = windows.map((w) => reservedRange(w, facts))
  const shape = shapeProblems(ranges, policy)
  if (shape.length) throw new ApiError('VALIDATION_FAILED', { fieldErrors: shape })

  const offer = await tx
    .insertInto('work.window_offers')
    .values({
      visit_id: v.id,
      project_id: v.project_id,
      state: 'draft',
      hold_hours: policy.holdHours,
      policy_version: policyVersion,
      offered_by: actor.userId,
      preparation_instructions: preparation.instructions,
      preparation_basis: preparation.basis,
      preparation_default_ids: preparation.defaultIds,
      worker_ids: workerIds,
      equipment_ids: equipmentIds,
    })
    .returning(['id', 'version'])
    .executeTakeFirstOrThrow()
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
  return { offerId: offer.id, version: offer.version, visitId: v.id, projectId: v.project_id, purpose: v.purpose }
}

/** The number and overlap problems of an offer's reserved ranges (B4: no overlapping windows in one offer). */
function shapeProblems(ranges: readonly Interval[], policy: Parameters<typeof offerProblems>[1]): FieldError[] {
  return offerProblems(ranges, policy).map((p) =>
    p.code === 'OFFER_WINDOW_COUNT'
      ? field('body.windows', p.code)
      : field(`body.windows[${p.positions[1] - 1}]`, p.code),
  )
}

/**
 * Publishes a draft offer to the customer (TSK-0145, OWN-DEC-194 B1, B3, B4), with the offer version the caller saw.
 * In one transaction: every condition of the visit's purpose is checked again (A2: a work visit's approval, the job's
 * gates and its follow-up authorization; for every visit no blocking hold, A1, and the site checks), each window again
 * like a confirmation (still in the future, the visit's reserved range, the team's capacity), the offer takes the
 * project's next number, its publication instant and its exact expiry (the hold hours in force from now, by the
 * database clock), and every window holds the whole team. When the visit already has an open offer, publishing needs
 * a reason and replaces it: the open offer ends as replaced (its holds released) first. The options notice of the
 * published offer is the customer's one notice. Refusals: NOT_FOUND, FORBIDDEN, STALE_VERSION, NOT_CONFIGURED,
 * VALIDATION_FAILED (the window count, REASON_REQUIRED), CONFLICT naming every unmet requirement (OFFER_<state> for an
 * offer that is not a draft, VISIT_NOT_TENTATIVE, OFFER_OPEN without a reason, OFFER_DRAFT_STALE when the visit's
 * planning changed since the draft, windows[i] WINDOW_IN_PAST, the conditions' codes, per window
 * `windows[i].<capacity code>`) with alternatives for the first window that cannot be held. Nothing partial is written.
 */
export async function publishOffer(
  tx: Tx,
  actor: StaffActor,
  scope: DataScope,
  offerId: string,
  input: { replaceReason?: string | undefined },
  deps: { gates: readonly WorkVisitGate[]; now: Date; expectedVersion: number; expiry: Automation },
): Promise<OfferResult> {
  const d = await tx
    .selectFrom('work.window_offers')
    .select(['visit_id', 'project_id'])
    .where('id', '=', offerId)
    .executeTakeFirst()
  if (!d || !scopeIncludesProject(scope, d.project_id)) throw new ApiError('NOT_FOUND')
  const current = await lockOpenOffer(tx, d.visit_id)
  const v = await lockVisit(tx, d.visit_id)
  if (!v) throw new ApiError('NOT_FOUND')
  const o = await tx
    .selectFrom('work.window_offers')
    .selectAll()
    .where('id', '=', offerId)
    .forUpdate()
    .executeTakeFirstOrThrow()
  const work = isWorkVisitPurpose(v.purpose)
  if (work && !mayPlanWorkVisits(actor)) throw new ApiError('FORBIDDEN')
  if (o.version !== deps.expectedVersion)
    throw new ApiError('STALE_VERSION', { current: { version: o.version, values: { state: o.state } } })
  if (o.state !== 'draft')
    throw new ApiError('CONFLICT', { fieldErrors: [field('offer', `OFFER_${o.state.toUpperCase()}`)] })
  if (v.state !== 'tentative') throw new ApiError('CONFLICT', { fieldErrors: [field('state', 'VISIT_NOT_TENTATIVE')] })
  const config = await loadConfig(tx)
  const settings = capacitySettings(config)
  const { policy, version: policyVersion } = windowOfferPolicy(config)
  const replaceReason = input.replaceReason?.trim() || null
  if (current && !replaceReason) throw new ApiError('CONFLICT', { fieldErrors: [field('offer', 'OFFER_OPEN')] })
  if (!current && replaceReason)
    throw new ApiError('CONFLICT', { fieldErrors: [field('body.replaceReason', 'NO_OPEN_OFFER')] })

  const workerIds = [...(o.worker_ids ?? [])]
  const equipmentIds = [...(o.equipment_ids ?? [])]
  const problems = teamProblems(v, workerIds, equipmentIds)
  problems.push(...(await approvalProblems(tx, v)))
  if (v.job_id !== null)
    for (const code of await unmetGates(tx, { jobId: v.job_id, projectId: v.project_id }, deps.gates))
      problems.push(field('job', code))
  // TSK-0064 (decided by OWN-DEC-193 A2): no times are offered while a hold blocks their confirmation; TSK-0145 (A1): an
  // Owner-authorized hazard-evaluation inspection is not blocked by the intake review holds it evaluates.
  problems.push(...(await blockingHoldProblems(tx, v.project_id, v.id)))
  // TSK-0127, TSK-0126: no times are offered before the three site checks are recorded (the address and county, the
  // authorized site contact, the accepted coverage), since the selection could not confirm them.
  problems.push(...(await siteCheckProblems(tx, v.project_id)))
  // TSK-0146 (B7): the instructions pass the unsafe-instruction rules when published too (a draft saved before them).
  problems.push(...unsafeProblems(o.preparation_instructions, 'preparationInstructions'))
  if (v.expected_duration_minutes === null || v.required_workers === null)
    throw new ApiError('CONFLICT', { fieldErrors: problems })

  // The draft's windows, checked again now: their count under the policy in force, still in the future, and still the
  // visit's reserved range (the planning may have changed since the draft was saved).
  const options = await tx
    .selectFrom('work.window_offer_options')
    .selectAll()
    .where('offer_id', '=', o.id)
    .orderBy('position')
    .execute()
  const windows = options.map((p) => storedWindow(p))
  const facts = factsOf(v)
  const ranges = windows.map((w) => reservedRange(w, facts))
  const shape = shapeProblems(ranges, policy)
  if (shape.length) throw new ApiError('VALIDATION_FAILED', { fieldErrors: shape })
  options.forEach((p, i) => {
    const r = ranges[i] as Interval
    if (new Date(p.reserved_starts_at).getTime() !== r.start || new Date(p.reserved_ends_at).getTime() !== r.end)
      problems.push(field(`windows[${i}]`, 'OFFER_DRAFT_STALE'))
    if ((windows[i] as LocalWindow).startsAt.getTime() <= deps.now.getTime())
      problems.push(field(`windows[${i}]`, 'WINDOW_IN_PAST'))
  })
  if (problems.length) throw new ApiError('CONFLICT', { fieldErrors: problems })

  // B4: the open offer ends as replaced first (its holds released), so its team can hold the new windows.
  if (current)
    await tx
      .updateTable('work.window_offers')
      .set({
        state: 'replaced',
        version: current.version + 1,
        closed_by: actor.userId,
        closed_reason: replaceReason,
        replaced_by: o.id,
      })
      .where('id', '=', current.id)
      .execute()

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
  if (checked.problems.length)
    throw new ApiError('CONFLICT', {
      fieldErrors: checked.problems,
      ...(checked.first ? { alternatives: await alternatives(tx, checked.first) } : {}),
    })

  // The next number of the project's offers, under the project's lock; the database sets the publication instant and
  // the expiry (B1: the hold hours from now).
  await tx.selectFrom('crm.projects').select('id').where('id', '=', v.project_id).forUpdate().execute()
  const last = await tx
    .selectFrom('work.window_offers')
    .select((eb) => eb.fn.max('number').as('n'))
    .where('project_id', '=', v.project_id)
    .executeTakeFirst()
  const published = await tx
    .updateTable('work.window_offers')
    .set({
      state: 'open',
      version: o.version + 1,
      number: Number(last?.n ?? 0) + 1,
      published_by: actor.userId,
      hold_hours: policy.holdHours,
      policy_version: policyVersion,
    })
    .where('id', '=', o.id)
    .returning(['number', 'version', 'published_at', 'expires_at'])
    .executeTakeFirstOrThrow()
  const expiresAt = new Date(published.expires_at as Date)
  const number = published.number as number

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
      offer_id: o.id,
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
    // A concurrent offer or confirmation took the capacity first: nothing of this publication stays.
    await sql`ROLLBACK TO SAVEPOINT window_offer_holds`.execute(tx)
    const again = await check()
    throw new ApiError('CONFLICT', {
      fieldErrors: again.problems.length ? again.problems : [field('reservation', 'CAPACITY_TAKEN')],
      alternatives: await alternatives(tx, again.first ?? (requests[0] as ReservationRequest)),
    })
  }
  await sql`RELEASE SAVEPOINT window_offer_holds`.execute(tx)

  const requestId = requestIdOf(`window-offer:${o.id}`)
  // The committed event of the automatic options notice: estimate-visit options (#5) or, TSK-0120, work-appointment
  // windows (#11, OWN-DEC-156). One per published offer: its id is the notice's subject. A replacement's notice is the
  // customer's one notice of the change (B4); the replaced offer sends nothing of its own.
  const optionsEvent = work ? WORK_VISIT_OPTIONS_EVENT : ESTIMATE_VISIT_OPTIONS_EVENT
  await outbox.add(tx, {
    type: optionsEvent,
    aggregate: { type: 'window_offer', id: o.id, version: published.version },
    payload: { visitId: v.id, number, ...(current ? { replaces: current.number } : {}) },
    idempotencyKey: `${optionsEvent}:${o.id}`,
    requestId,
  })
  await scheduleJob(tx, deps.expiry, {
    key: o.id,
    runAt: expiresAt,
    target: { type: 'window_offer', id: o.id },
    requestId,
  })
  await resolveOfferItem(tx, v.project_id, 'new_offer')
  return {
    offerId: o.id,
    number,
    state: 'open',
    version: published.version,
    projectId: v.project_id,
    visitId: v.id,
    purpose: v.purpose,
    publishedAt: new Date(published.published_at as Date),
    expiresAt,
    holdHours: policy.holdHours,
    policyVersion,
    windows,
    workerIds,
    equipmentIds,
    replaced: current ? { offerId: current.id, number: current.number as number, version: current.version + 1 } : null,
  }
}

/**
 * Offers windows of a tentative visit with the visit version the caller saw: saves the draft (saveOfferDraft) and,
 * unless the caller asked for a draft only, publishes it at once in the same transaction (publishOffer, with a
 * replacement reason when the visit already has an open offer). A refusal of either step writes nothing.
 */
export async function offerWindows(
  tx: Tx,
  actor: StaffActor,
  scope: DataScope,
  visitId: string,
  input: OfferInput,
  deps: { gates: readonly WorkVisitGate[]; now: Date; expectedVersion: number; expiry: Automation },
): Promise<OfferResult> {
  const saved = await saveOfferDraft(tx, actor, scope, visitId, input, deps)
  if (input.draft) {
    const o = await tx
      .selectFrom('work.window_offers')
      .selectAll()
      .where('id', '=', saved.offerId)
      .executeTakeFirstOrThrow()
    const options = await tx
      .selectFrom('work.window_offer_options')
      .selectAll()
      .where('offer_id', '=', o.id)
      .orderBy('position')
      .execute()
    return {
      offerId: o.id,
      number: null,
      state: 'draft',
      version: o.version,
      projectId: saved.projectId,
      visitId: saved.visitId,
      purpose: saved.purpose,
      publishedAt: null,
      expiresAt: null,
      holdHours: o.hold_hours,
      policyVersion: o.policy_version,
      windows: options.map((p) => storedWindow(p)),
      workerIds: o.worker_ids ?? [],
      equipmentIds: o.equipment_ids ?? [],
      replaced: null,
    }
  }
  return publishOffer(
    tx,
    actor,
    scope,
    saved.offerId,
    { replaceReason: input.replaceReason },
    {
      ...deps,
      expectedVersion: saved.version,
    },
  )
}

/**
 * Discards a draft offer that was never published (B1), with the offer version the caller saw: it held nothing and
 * started no clock; it is kept as history. Refusals: NOT_FOUND, FORBIDDEN, STALE_VERSION, CONFLICT (OFFER_<state> for
 * an offer that is not a draft: a published offer is withdrawn or replaced instead).
 */
export async function discardOfferDraft(
  tx: Tx,
  actor: StaffActor,
  scope: DataScope,
  offerId: string,
  deps: { expectedVersion: number },
): Promise<{ offerId: string; visitId: string; projectId: string; version: number }> {
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
  if (o.state !== 'draft')
    throw new ApiError('CONFLICT', { fieldErrors: [field('offer', `OFFER_${o.state.toUpperCase()}`)] })
  const updated = await tx
    .updateTable('work.window_offers')
    .set({ state: 'discarded', version: o.version + 1, closed_by: actor.userId })
    .where('id', '=', o.id)
    .returning('version')
    .executeTakeFirstOrThrow()
  return { offerId: o.id, visitId: o.visit_id, projectId: o.project_id, version: updated.version }
}

type OfferRow = {
  id: string
  visit_id: string
  project_id: string
  number: number | null
  state: string
  version: number
  expires_at: Date | null
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
 * Withdraws an open offer with the offer version the caller saw and a reason (OWN-DEC-194 B4); every hold of it ends
 * ('hold_released') and the visit stays tentative. TSK-0145 (PROPOSED): no withdrawal notice has owner-approved
 * wording, so none is sent; the withdrawn times leave the customer's Appointments tab at once and staff get the
 * "offered windows need new times" item (window_offer_withdrawn), resolved when new windows are published (their
 * notice tells the customer) or a window is selected. Refusals: NOT_FOUND, FORBIDDEN, STALE_VERSION,
 * VALIDATION_FAILED (REASON_REQUIRED), CONFLICT (OFFER_<state> for an offer that is not open: a draft is discarded).
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
  await openOfferItem(tx, o.project_id, 'window_offer_withdrawn')
  return {
    offerId: o.id,
    number: o.number as number,
    visitId: o.visit_id,
    projectId: o.project_id,
    version: updated.version,
  }
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
  if (now.getTime() < new Date(o.expires_at as Date).getTime())
    throw new Error(`window offer ${offerId} is not due to expire`)
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
  if (now.getTime() >= new Date(o.expires_at as Date).getTime())
    throw new ApiError('CONFLICT', { fieldErrors: [field('offer', 'OFFER_EXPIRED')] })
  if (!option) throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body.position', 'POSITION_UNKNOWN')] })
  const window = storedWindow(option)
  const unavailable = () => new ApiError('CONFLICT', { fieldErrors: [field('body.position', 'WINDOW_UNAVAILABLE')] })
  if (window.startsAt.getTime() <= now.getTime()) throw unavailable()
  // TSK-0064 (HH-SCH-06, RULE-SAFETY-GATES): the selection confirms the visit, so every confirmation precondition runs
  // here, in this transaction: the approval and the deposit gate of TSK-0059 for a work visit (whatever gates the
  // module was given; an estimate visit never waits for a deposit), the other registered gates and no blocking hold.
  const unmet = [
    ...(await confirmationPreconditions(tx, v, deps.gates)),
    ...(await siteCheckProblems(tx, v.project_id)),
  ]
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

/**
 * The committed event of a reserved visit, which triggers its automatic confirmation notice (#6 or #10). TSK-0140
 * (OWN-DEC-163 7): an estimate booking of a customer with repeated short-notice cancellations or no-shows also opens
 * the Owner's review item (never a charge or a block).
 */
export async function recordReserved(tx: Tx, v: { id: string; purpose: string; version: number }): Promise<void> {
  await flagCancellationPattern(tx, v)
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
  if (now.getTime() >= new Date(o.expires_at as Date).getTime())
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

/**
 * The automatic notices recorded for records (window offers, visits), by record id. Staff-released drafts about the
 * same records (TSK-0067 appointment reminders) are listed by their own panel, not here.
 */
export async function noticesOf(db: Reader, recordType: string, ids: readonly string[]) {
  const out = new Map<string, NoticeView[]>()
  if (ids.length === 0) return out
  const rows = await db
    .selectFrom('platform.message_deliveries')
    .select(['record_id', 'message_key', 'channel', 'state', 'error_code'])
    .where('record_type', '=', recordType)
    .where('record_id', 'in', [...ids])
    .where('release', '=', 'automatic')
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
  /** The project's offer number; null for a draft (numbered when published). */
  number: number | null
  state: string
  /** Open and inside its hold time. */
  held: boolean
  version: number
  /** Who saved it and when (a draft's saving, B1: no clock runs from it). */
  offeredBy: StaffRef
  offeredAt: string
  /** TSK-0145 (B1): who published it to the customer and when: the hold runs from then; null for a draft. */
  publishedBy: StaffRef | null
  publishedAt: string | null
  /** The exact end of the hold; null for a draft. */
  expiresAt: string | null
  holdHours: number
  preparationInstructions: string | null
  /** TSK-0146 (B7): how the instructions stand against the defaults they started from; null before 0123. */
  preparationBasis: string | null
  windows: { position: number; window: WindowShown; reservedRange: { startsAt: string; endsAt: string } }[]
  /** The team a draft holds when published (null for offers made before drafts existed: their holds name it). */
  team: { workerIds: string[]; equipmentIds: string[] } | null
  selectedPosition: number | null
  closedAt: string | null
  closedBy: StaffRef | null
  closedReason: string | null
  /** B4: the number of the offer that replaced this one. */
  replacedByNumber: number | null
  customerNote: string | null
  /** The automatic notice this offer triggers; null: none is on the automatic list (work-visit windows). */
  noticeKey: string | null
  notices: NoticeView[]
  actions: { withdraw: boolean; publish: boolean; discard: boolean }
}

/** The offers of these visits for staff, newest first per visit (drafts first). */
export async function staffOffers(
  db: Reader,
  visits: readonly { id: string; purpose: string; state: string }[],
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
    .orderBy('offered_at', 'desc')
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
  const numberOf = new Map(offers.map((o) => [o.id, o.number]))
  for (const o of offers) {
    const visit = visits.find((v) => v.id === o.visit_id)
    const purpose = visit?.purpose ?? 'site_estimate'
    const expires = o.expires_at ? new Date(o.expires_at) : null
    const may = canWithdraw(purpose)
    const view: StaffOfferView = {
      id: o.id,
      number: o.number,
      state: o.state,
      held: o.state === 'open' && expires !== null && now.getTime() < expires.getTime(),
      version: o.version,
      offeredBy: names(o.offered_by),
      offeredAt: new Date(o.offered_at).toISOString(),
      publishedBy: o.published_by ? names(o.published_by) : null,
      publishedAt: o.published_at ? new Date(o.published_at).toISOString() : null,
      expiresAt: expires ? expires.toISOString() : null,
      holdHours: o.hold_hours,
      preparationInstructions: o.preparation_instructions,
      preparationBasis: o.preparation_basis,
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
      team: o.worker_ids ? { workerIds: o.worker_ids, equipmentIds: o.equipment_ids ?? [] } : null,
      selectedPosition: o.selected_position,
      closedAt: o.closed_at ? new Date(o.closed_at).toISOString() : null,
      closedBy: o.closed_by ? names(o.closed_by) : null,
      closedReason: o.closed_reason,
      replacedByNumber: o.replaced_by ? (numberOf.get(o.replaced_by) ?? null) : null,
      customerNote: o.customer_note,
      noticeKey: isWorkVisitPurpose(purpose) ? OFFER_NOTICE.work : OFFER_NOTICE.estimate,
      notices: notices.get(o.id) ?? [],
      actions: {
        withdraw: o.state === 'open' && may,
        // B1: a draft is published while its visit is tentative (over an open offer, as its replacement, B4).
        publish: o.state === 'draft' && may && visit?.state === 'tentative',
        discard: o.state === 'draft' && may,
      },
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
  /** TSK-0066: the visit's number inside the project (the customer never sees a database ID). */
  number: number
  purpose: 'estimate_visit' | 'work_visit'
  status: string
  window: WindowShown
  address: { street: string; unit: string | null; city: string; state: string; zip: string }
  preparationInstructions: string | null
  /** TSK-0066 (HH-PORT-04): the customer's latest request, while it awaits staff or once declined; null otherwise. */
  request: { kind: 'reschedule' | 'cancellation'; status: 'awaiting_confirmation' | 'declined' } | null
  /** What the customer may ask for now: only for a confirmed visit with no open request. */
  actions: { requestReschedule: boolean; requestCancellation: boolean }
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
      'v.number',
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
          'published_at',
          'expires_at',
          'preparation_instructions',
          'selected_position',
        ])
        .where('project_id', '=', projectId)
        // TSK-0145 (B1): a draft (or a discarded draft) was never published to the customer.
        .where('published_at', 'is not', null)
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
  const requests = await customerRequestsOf(
    db,
    visits.map((v) => v.id),
  )
  const purposeOf = new Map(visits.map((v) => [v.id, customerPurpose(v.purpose)]))
  // An offer that ended unselected is shown until a newer offer of the same purpose, or a confirmed visit of it, exists.
  const superseded = (o: { visit_id: string; number: number | null }) =>
    offers.some((x) => (x.number ?? 0) > (o.number ?? 0) && purposeOf.get(x.visit_id) === purposeOf.get(o.visit_id)) ||
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
          ? now.getTime() < new Date(latest.expires_at as Date).getTime()
            ? 'open'
            : 'expired'
          : latest.state === 'expired' || latest.state === 'other_times_requested'
            ? latest.state
            : null
      if (status)
        shownOffers.push({
          number: latest.number as number,
          purpose: customerPurpose(v.purpose),
          status,
          offeredAt: new Date(latest.published_at as Date),
          expiresAt: new Date(latest.expires_at as Date),
          windows: options
            .filter((p) => p.offer_id === latest.id)
            .map((p) => ({ position: p.position, ...windowShape(storedWindow(p)) })),
        })
    }
    // TSK-0066: a canceled appointment stays listed, as canceled, so the customer sees the change took effect.
    if ((SHOWN_VISIT_STATES as readonly string[]).includes(v.state) || v.state === 'canceled') {
      const selected = offers.find((o) => o.visit_id === v.id && o.state === 'selected')
      const request = v.state === 'confirmed' ? (requests.get(v.id) ?? null) : null
      const open = request?.status === 'awaiting_confirmation'
      appointments.push({
        number: v.number,
        purpose: customerPurpose(v.purpose),
        status: v.state,
        window: windowShape(storedWindow(v)),
        address: { street: v.street, unit: v.unit, city: v.city, state: v.address_state, zip: v.zip },
        preparationInstructions: selected?.preparation_instructions ?? null,
        request,
        actions: {
          requestReschedule: v.state === 'confirmed' && !open,
          requestCancellation: v.state === 'confirmed' && !open,
        },
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
  const live = (x: CustomerAppointment) => x.status !== 'completed' && x.status !== 'canceled'
  const current = a.appointments.find((x) => x.purpose === stage && live(x))
  return {
    visitWindowsOffered: a.offers.some((o) => o.status === 'open' && o.purpose === 'estimate_visit'),
    workWindowsOffered: a.offers.some((o) => o.status === 'open' && o.purpose === 'work_visit'),
    // TSK-0150 (OWN-DEC-199): a recorded "Arrived" is its own fact, so the step never says the visit is on the way.
    visit: current
      ? current.status === 'confirmed'
        ? ('confirmed' as const)
        : current.status === 'arrived'
          ? ('arrived' as const)
          : ('on_the_way' as const)
      : undefined,
    appointment: a.appointments.find(live) ?? null,
  }
}

// --- Automatic notices (FACT-AUTOMATIC-MESSAGES #5, #6, #10) ------------------------------------------------------

export type VisitNoticeDeps = {
  providers: NotificationProviders
  /** TSK-0120: the public site's base URL for the portal links; undefined while not configured (no link is made up). */
  publicSiteUrl?: string | undefined
}

export function destinationsOf(r: { email: string; phone_e164: string; preferred_channel: string }): Destination[] {
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

/** The date and arrival window of a visit and its customer-facing reference (TSK-0120). */
export function visitValues(
  v: Parameters<typeof storedWindow>[0] & { number: number },
  reference: string,
): Record<string, string> {
  return { ...visitWindowValues(storedWindow(v)), visitNumber: visitNumberOf(reference, v.number) }
}

/**
 * #5 "Estimate-visit options available" and #11 "Work-appointment windows" (OWN-DEC-156): sent while the offer is
 * still open and held (else stale: nothing sent), once per offer. TSK-0120: the first name, the request reference
 * (estimate visit) or the job reference (work visit), the portal's Appointments tab and the hold's end in the visit's
 * property zone.
 */
function optionsAutomation(messageKey: string, work: boolean, deps: VisitNoticeDeps): Automation {
  return notificationAutomation({
    messageKey,
    providers: deps.providers,
    resolve: async ({ tx, job }) => {
      const id = job.target.id
      if (!id) return 'stale'
      const o = await tx
        .selectFrom('work.window_offers as o')
        .innerJoin('work.visits as v', 'v.id', 'o.visit_id')
        .select(['o.id', 'o.project_id', 'o.state', 'o.expires_at', 'v.purpose', 'v.time_zone'])
        .where('o.id', '=', id)
        .executeTakeFirst()
      if (!o || o.state !== 'open' || isWorkVisitPurpose(o.purpose) !== work) return 'stale'
      if ((await dbNow(tx)).getTime() >= new Date(o.expires_at as Date).getTime()) return 'stale'
      const r = await requestOf(tx, o.project_id)
      if (!r) return 'stale'
      return {
        subjectKey: `window_offer:${o.id}`,
        record: { type: 'window_offer', id: o.id },
        recipients: [{ kind: 'customer_contact', id: r.contactId, destinations: destinationsOf(r) }],
        values: present({
          customerName: firstNameOf(r.full_name),
          ...(work ? { jobNumber: jobNumberOf(r.reference) } : { reference: r.reference }),
          appointmentLink: portalLink(deps.publicSiteUrl, r.reference, 'appointments'),
          holdExpiration: instantText(new Date(o.expires_at as Date), o.time_zone),
          ...(work ? {} : { projectLink: portalLink(deps.publicSiteUrl, r.reference) }),
        }),
        failureItem: { reference: r.reference, projectId: o.project_id, assignedStaffId: r.responsible_staff_id },
        projectId: o.project_id,
      }
    },
  })
}

/** #5 "Estimate-visit options available" (OWN-DEC-99). */
export const estimateVisitOptionsAutomation = (deps: VisitNoticeDeps) =>
  optionsAutomation(OFFER_NOTICE.estimate, false, deps)
/** #11 "Work-appointment windows" (OWN-DEC-156), once per published work-visit offer. */
export const workVisitOptionsAutomation = (deps: VisitNoticeDeps) => optionsAutomation(OFFER_NOTICE.work, true, deps)

/** The approved service names of a visit's job (OWN-DEC-158: the catalog names only), or null when it has none. */
async function jobServiceNames(tx: Tx, jobId: string | null): Promise<string | null> {
  if (!jobId) return null
  const rows = await tx
    .selectFrom('work.work_packages as w')
    .innerJoin('catalog.service_versions as s', (j) =>
      j.onRef('s.service_id', '=', 'w.service_id').onRef('s.version', '=', 'w.service_version'),
    )
    .select('s.name')
    .where('w.job_id', '=', jobId)
    .orderBy('w.position')
    .execute()
  const names = [...new Set(rows.map((r) => r.name))]
  return names.length ? names.join(', ') : null
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
        // Customer messages are English (RULE-LANGUAGES). TSK-0120: the owner wording's values, from the visit as
        // it is confirmed now (its property zone); a work appointment also names its job and approved services.
        values: valuesFor(messageKey, {
          customerName: firstNameOf(r.full_name),
          ...visitValues(v, r.reference),
          projectLink: portalLink(deps.publicSiteUrl, r.reference),
          ...(work ? { jobNumber: jobNumberOf(r.reference), serviceName: await jobServiceNames(tx, v.job_id) } : {}),
        }),
        failureItem: { reference: r.reference, projectId: v.project_id, assignedStaffId: r.responsible_staff_id },
        projectId: v.project_id,
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
