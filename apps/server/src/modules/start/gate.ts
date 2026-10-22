// The Start Work gate, read from the server's own records (TSK-0073; HH-WORK-01, HH-WORK-04, HH-WORK-12, HH-PKT-04,
// HH-PKT-06, HH-OFF-04, T45, T46, ENT-StartGateEvaluation, ENT-GateException, OWN-DEC-68, OWN-DEC-79, OWN-DEC-196,
// RULE-SAFETY-GATES).
// - gatherGate() reads every prerequisite of HH-WORK-01 for one worker on one visit and names every missing item; the
//   decision itself is @handyhub/domain evaluateStartGate(). Nothing a client sends is a fact here: the worker is the
//   caller, the packet is brought up to date first (refreshJobPacket), and the deposit gate share-locks the requirement.
// - Runs inside a transaction: the read route opens its own (it reads only, but the packet refresh and the deposit
//   gate's share lock need one); the start route runs it inside the start transaction, after taking the visit's and
//   the job's row locks, so a hold raised a moment earlier is seen and one raised a moment later waits for the start.
// - The exceptions of the visit are read with where they stand now (effectiveExceptionState): an approved one covers
//   only its own code while the visit lasts and no relevant change (scope, site, access, assignment) happened since the
//   packet version it was requested against. settleExceptions() records an ending in the write transactions.
import type { Tx } from '@handyhub/db'
import {
  BLOCKING_HOLD_STATES,
  effectiveExceptionState,
  evaluateStartGate,
  isWorkVisitPurpose,
  packetChanges,
  sopReadiness,
  START_BLOCKING_HOLD_KINDS,
  type CoveringException,
  type FoundMissing,
  type GateExceptionEnding,
  type GateExceptionKind,
  type GateExceptionState,
  type PacketContent,
  type StartGateResult,
} from '@handyhub/domain'
import { sql } from 'kysely'
import { confirmationDepositGate } from '../finance/deposit-gate.js'
import { assignedWorkers } from '../field/taps.js'
import { jobLoadoutReadiness } from '../loadouts/store.js'
import { acknowledgmentStatus, latestAcknowledgment } from '../packets/acknowledgments.js'
import { packetVersion, refreshJobPacket, type PacketRow } from '../packets/content.js'
import { lastViewed } from '../packets/view.js'

export type GateEnvironment = 'local' | 'ci' | 'staging' | 'production'

/** The job states a new Start Work may begin from (PROPOSED: a later worker or visit of a job already in progress). */
export const STARTABLE_JOB_STATES = ['pending_preparation', 'ready', 'in_progress'] as const

/** The Spanish release state of a safety text that a Spanish-reading worker may work from (OWN-DEC-79). */
export const SPANISH_RELEASED = 'ai_reviewed'

const HOLD_CODE = {
  review: 'REVIEW_HOLD_OPEN',
  job_requirement: 'JOB_ON_HOLD',
  critical_safety: 'CRITICAL_HOLD_OPEN',
} as const

export type GateVisit = {
  id: string
  jobId: string | null
  projectId: string
  propertyId: string
  purpose: string
  state: string
  version: number
  localDate: string
  timeZone: string
  /** The end of the visit's service day in its zone. */
  dayEndsAt: Date
}

export type ExceptionRow = {
  id: string
  kind: GateExceptionKind
  requirement: string
  state: GateExceptionState
  reason: string
  evidence: Record<string, unknown>
  requestedBy: string
  requestedAt: Date
  packetVersion: number
  expiresAt: Date
  decidedBy: string | null
  decidedAt: Date | null
  decisionNote: string | null
  followUpOwner: string | null
  followUpDue: string | null
  endedAt: Date | null
  endedReason: string | null
  version: number
  /** Where it stands now (requested and approved ones may have ended since they were written). */
  effective: GateExceptionState
  ending: GateExceptionEnding | null
}

export type GateFacts = {
  visit: GateVisit
  staffUserId: string
  assigned: boolean
  packet: PacketRow | null
  acknowledgmentId: string | null
  found: FoundMissing[]
  exceptions: ExceptionRow[]
  result: StartGateResult
  /** The worker's latest site check on this visit. */
  siteCheck: SiteCheckRow | null
  /** Before photos of this visit per work package. */
  photos: Map<string, number>
  started: { id: string; startedAt: Date } | null
  locale: string
}

export type SiteCheckRow = {
  id: string
  propertyConfirmed: boolean
  accessAvailable: boolean
  customerPresent: boolean
  hazardsReviewed: boolean
  siteCondition: 'as_described' | 'differs'
  holdId: string | null
  holdState: string | null
  packetVersion: number
  recordedAt: Date
}

/** The visit, with the end of its service day; null when it does not exist. */
export async function gateVisit(tx: Tx, visitId: string, lock = false): Promise<GateVisit | null> {
  let q = tx
    .selectFrom('work.visits as v')
    .select([
      'v.id',
      'v.job_id',
      'v.project_id',
      'v.property_id',
      'v.purpose',
      'v.state',
      'v.version',
      'v.local_date',
      'v.time_zone',
      sql<Date>`((v.local_date + 1)::timestamp AT TIME ZONE v.time_zone)`.as('day_ends'),
    ])
    .where('v.id', '=', visitId)
  if (lock) q = q.forUpdate()
  const v = await q.executeTakeFirst()
  if (!v) return null
  return {
    id: v.id,
    jobId: v.job_id,
    projectId: v.project_id,
    propertyId: v.property_id,
    purpose: v.purpose,
    state: v.state,
    version: v.version,
    localDate: v.local_date,
    timeZone: v.time_zone,
    dayEndsAt: new Date(v.day_ends),
  }
}

/** The job's row lock: hazard reports, critical holds and job-level holds are written under it (migration 0074). */
export async function lockJob(tx: Tx, jobId: string): Promise<void> {
  await tx.selectFrom('work.jobs').select('id').where('id', '=', jobId).forUpdate().execute()
}

/** The critical packet sections that changed between a stored version and the current packet. */
async function criticalSince(tx: Tx, row: PacketRow, version: number): Promise<string[]> {
  if (version === row.version) return []
  const before = await packetVersion(tx, row.jobId, version)
  if (!before) return []
  return [...new Set(packetChanges(before.content, row.content).flatMap((c) => (c.critical ? [c.section] : [])))]
}

/** The visit's exceptions, newest first, each with where it stands now. */
export async function visitExceptions(
  tx: Tx,
  visit: GateVisit,
  row: PacketRow | null,
  assigned: readonly string[],
  now: Date,
): Promise<ExceptionRow[]> {
  const rows = await tx
    .selectFrom('work.gate_exceptions')
    .selectAll()
    .where('visit_id', '=', visit.id)
    .orderBy('requested_at', 'desc')
    .orderBy('id', 'desc')
    .execute()
  const out: ExceptionRow[] = []
  for (const r of rows) {
    const changed = row ? await criticalSince(tx, row, r.packet_version) : []
    const eff = effectiveExceptionState(
      { state: r.state as GateExceptionState, expiresAt: r.expires_at },
      { now, visitState: visit.state, changedSections: changed, requesterAssigned: assigned.includes(r.requested_by) },
    )
    out.push({
      id: r.id,
      kind: r.kind as GateExceptionKind,
      requirement: r.requirement,
      state: r.state as GateExceptionState,
      reason: r.reason,
      evidence: r.evidence as Record<string, unknown>,
      requestedBy: r.requested_by,
      requestedAt: r.requested_at,
      packetVersion: r.packet_version,
      expiresAt: r.expires_at,
      decidedBy: r.decided_by,
      decidedAt: r.decided_at,
      decisionNote: r.decision_note,
      followUpOwner: r.follow_up_owner,
      followUpDue: r.follow_up_due,
      endedAt: r.ended_at,
      endedReason: r.ended_reason,
      version: r.version,
      effective: eff.state,
      ending: eff.ending ?? (r.ended_reason as GateExceptionEnding | null),
    })
  }
  return out
}

/** Records the ending of every requested or approved exception of the visit that has ended (write transactions). */
export async function settleExceptions(tx: Tx, exceptions: ExceptionRow[]): Promise<void> {
  for (const e of exceptions) {
    if (e.state === e.effective || (e.effective !== 'invalidated' && e.effective !== 'expired')) continue
    await tx
      .updateTable('work.gate_exceptions')
      .set({ state: e.effective, ended_at: sql<Date>`now()`, ended_reason: e.ending, version: e.version + 1 })
      .where('id', '=', e.id)
      .where('version', '=', e.version)
      .execute()
    e.state = e.effective
    e.version += 1
  }
}

function covering(e: ExceptionRow): CoveringException {
  const ids = e.evidence['workPackageIds']
  return {
    id: e.id,
    kind: e.kind,
    ...(e.kind === 'before_photo_upload_failed'
      ? { workPackageIds: Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [] }
      : {}),
  }
}

/** The worker's latest site check on the visit, with the state of the hold a difference raised. */
export async function latestSiteCheck(tx: Tx, visitId: string, staffUserId: string): Promise<SiteCheckRow | null> {
  const r = await tx
    .selectFrom('work.start_site_checks as c')
    .leftJoin('work.holds as h', 'h.id', 'c.hold_id')
    .select([
      'c.id',
      'c.property_confirmed',
      'c.access_available',
      'c.customer_present',
      'c.hazards_reviewed',
      'c.site_condition',
      'c.hold_id',
      'h.state as hold_state',
      'c.packet_version',
      'c.recorded_at',
    ])
    .where('c.visit_id', '=', visitId)
    .where('c.staff_user_id', '=', staffUserId)
    .orderBy('c.recorded_at', 'desc')
    .orderBy('c.id', 'desc')
    .limit(1)
    .executeTakeFirst()
  return r
    ? {
        id: r.id,
        propertyConfirmed: r.property_confirmed,
        accessAvailable: r.access_available,
        customerPresent: r.customer_present,
        hazardsReviewed: r.hazards_reviewed,
        siteCondition: r.site_condition as 'as_described' | 'differs',
        holdId: r.hold_id,
        holdState: r.hold_state ?? null,
        packetVersion: r.packet_version,
        recordedAt: r.recorded_at,
      }
    : null
}

/** Before photos of the visit, counted per work package; a photo processing rejected never counts (TSK-0076). */
export async function beforePhotoCounts(tx: Tx, visitId: string): Promise<Map<string, number>> {
  const rows = await tx
    .selectFrom('work.field_photos')
    .select(['work_package_id', sql<number>`count(*)::integer`.as('n')])
    .where('visit_id', '=', visitId)
    .where('phase', '=', 'before')
    .where('state', '<>', 'rejected')
    .groupBy('work_package_id')
    .execute()
  return new Map(rows.map((r) => [r.work_package_id, Number(r.n)]))
}

/**
 * Every prerequisite of HH-WORK-01 for `staffUserId` on the visit, in a transaction. `seenPacketVersion` is the packet
 * version the caller's screen showed when they pressed Start: a different current version is a change between the
 * check and the start, and refuses it.
 */
export async function gatherGate(
  tx: Tx,
  visit: GateVisit,
  staffUserId: string,
  opts: { environment: GateEnvironment; now?: Date; seenPacketVersion?: number },
): Promise<GateFacts> {
  if (!tx.isTransaction) throw new Error('gatherGate runs inside a transaction')
  const now = opts.now ?? new Date()
  const found: FoundMissing[] = []
  const add = (code: FoundMissing['code'], ref: string | null = null) => found.push({ code, ref })
  const team = await assignedWorkers(tx, visit.id)
  const assigned = team.includes(staffUserId)
  const staffRow = await tx
    .selectFrom('identity.staff_users')
    .select('locale')
    .where('id', '=', staffUserId)
    .executeTakeFirst()
  const locale = staffRow?.locale ?? 'en'
  const started = await tx
    .selectFrom('work.work_starts')
    .select(['id', 'started_at'])
    .where('visit_id', '=', visit.id)
    .where('staff_user_id', '=', staffUserId)
    .executeTakeFirst()
  const empty = (): GateFacts => ({
    visit,
    staffUserId,
    assigned,
    packet: null,
    acknowledgmentId: null,
    found,
    exceptions: [],
    result: evaluateStartGate(found),
    siteCheck: null,
    photos: new Map(),
    started: started ? { id: started.id, startedAt: started.started_at } : null,
    locale,
  })

  // 1. Assignment, the visit and arrival.
  if (!isWorkVisitPurpose(visit.purpose) || visit.jobId === null) {
    add('NOT_WORK_VISIT')
    return empty()
  }
  const jobId = visit.jobId
  if (!assigned) add('NOT_ASSIGNED')
  const arrived = await tx
    .selectFrom('work.time_stamps')
    .select('id')
    .where('visit_id', '=', visit.id)
    .where('staff_user_id', '=', staffUserId)
    .where('kind', '=', 'arrived')
    .executeTakeFirst()
  if (!['confirmed', 'en_route', 'arrived'].includes(visit.state) || now.getTime() >= visit.dayEndsAt.getTime())
    add('VISIT_NOT_ACTIVE')
  else if (visit.state !== 'arrived' || !arrived) add('ARRIVED_FIRST')
  if (started) add('ALREADY_STARTED')
  const job = await tx
    .selectFrom('work.jobs')
    .select('operational_state')
    .where('id', '=', jobId)
    .executeTakeFirstOrThrow()
  if (!(STARTABLE_JOB_STATES as readonly string[]).includes(job.operational_state)) add('JOB_NOT_STARTABLE')

  // 3. The packet: brought up to date, viewed at its latest version (OWN-DEC-196) and personally acknowledged.
  const row = await refreshJobPacket(tx, jobId, now)
  if (!row) return empty()
  const content: PacketContent = row.content
  if (content.scope.snapshotId === null) add('SCOPE_NOT_ACCEPTED')
  const viewed = await lastViewed(tx, jobId, staffUserId)
  if (!viewed) add('PACKET_NOT_VIEWED')
  else if (
    viewed.version !== row.version ||
    (opts.seenPacketVersion !== undefined && opts.seenPacketVersion !== row.version)
  )
    add('PACKET_CHANGED_SINCE_VIEWED')
  const ack = await acknowledgmentStatus(tx, row, staffUserId, assigned)
  if (ack.state === 'required') add('PACKET_NOT_ACKNOWLEDGED')
  else if (ack.state === 'invalidated') add('PACKET_ACKNOWLEDGMENT_ENDED')
  const acknowledgmentId =
    ack.state === 'acknowledged' ? ((await latestAcknowledgment(tx, jobId, staffUserId))?.id ?? null) : null

  // 4. SOP per work package, and the Spanish safety release for a Spanish-reading worker (HH-PKT-04).
  for (const p of content.sop.packages) {
    const readiness = sopReadiness({
      pinned: p.state === 'pinned',
      signedOff: p.reviewState === 'approved',
      environment: opts.environment,
    })
    for (const b of readiness.blockers) add(b, p.workPackageId)
    if (p.state === 'pinned' && locale === 'es' && p.spanishStatus !== SPANISH_RELEASED)
      add('SPANISH_SAFETY_REVIEW_PENDING', p.workPackageId)
  }

  // 5 and 6. Holds on the project that block Start Work: one entry per hold.
  const holds = await tx
    .selectFrom('work.holds')
    .select(['id', 'kind'])
    .where('project_id', '=', visit.projectId)
    .where('kind', 'in', [...START_BLOCKING_HOLD_KINDS])
    .where('state', 'in', [...BLOCKING_HOLD_STATES])
    .orderBy('raised_at')
    .orderBy('id')
    .execute()
  for (const h of holds) add(HOLD_CODE[h.kind as keyof typeof HOLD_CODE], h.id)

  // 2, 6 and 8. The worker's own site check on arrival.
  const siteCheck = await latestSiteCheck(tx, visit.id, staffUserId)
  if (!siteCheck) {
    add('SITE_CHECK_MISSING')
    add('HAZARDS_NOT_REVIEWED')
    add('SITE_CONDITION_NOT_REVIEWED')
  } else {
    if (!siteCheck.propertyConfirmed) add('PROPERTY_NOT_CONFIRMED')
    if (!siteCheck.accessAvailable) add('ACCESS_NOT_AVAILABLE')
    if (!siteCheck.customerPresent) add('CUSTOMER_NOT_PRESENT')
    if (!siteCheck.hazardsReviewed) add('HAZARDS_NOT_REVIEWED')
    // A difference counts as assessed once the Owner set Ready on the hold it raised (or cancelled it as an error).
    if (
      siteCheck.siteCondition === 'differs' &&
      (BLOCKING_HOLD_STATES as readonly string[]).includes(siteCheck.holdState ?? 'open')
    )
      add('SITE_CONDITION_DIFFERS', siteCheck.holdId)
  }

  // 7. Critical resources: each work package's loadout (TSK-0071).
  for (const p of await jobLoadoutReadiness(tx, jobId)) {
    if (p.readiness.state === 'blocked') add('LOADOUT_BLOCKED', p.workPackageId)
    else if (p.readiness.state === 'not_confirmed') add('LOADOUT_NOT_CONFIRMED', p.workPackageId)
    else if (p.readiness.state === 'not_configured') add('LOADOUT_NOT_CONFIGURED', p.workPackageId)
  }

  // 9. Before photos: PROPOSED at least one per work package of the job, uploaded on this visit.
  const photos = await beforePhotoCounts(tx, visit.id)
  for (const s of content.identity.services)
    if (!photos.get(s.workPackageId)) add('BEFORE_PHOTOS_MISSING', s.workPackageId)

  // 10. The deposit (TSK-0059): verified money, the Owner's waiver, or the approved exception.
  const deposit = await confirmationDepositGate(tx, { kind: 'work', jobId })
  if (!deposit.open) add(deposit.code)

  const exceptions = await visitExceptions(tx, visit, row, team, now)
  const live = exceptions.filter((e) => e.effective === 'approved').map(covering)
  return {
    visit,
    staffUserId,
    assigned,
    packet: row,
    acknowledgmentId,
    found,
    exceptions,
    result: evaluateStartGate(found, live),
    siteCheck,
    photos,
    started: started ? { id: started.id, startedAt: started.started_at } : null,
    locale,
  }
}

/** The SOP versions a packet names (pinned packages only). */
export const sopVersionIds = (row: PacketRow | null): string[] =>
  row ? row.content.sop.packages.flatMap((p) => (p.sopVersionId ? [p.sopVersionId] : [])) : []
