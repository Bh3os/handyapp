// Arrived and Finished per worker: the Owner's view, corrections and the accountant's CSV (TSK-0070; HH-WORK-06,
// HH-FIN-16, T47, ENT-TimeStamp, ENT-AuditEvent, OWN-DEC-69, RULE-HUMAN-REVIEW, RULE-NO-INVENTED-FACTS).
// - Every assigned worker (and anyone who recorded a value on the visit) has their own Arrived and Finished, each
//   recorded, corrected, not due yet or missing; a missing value is flagged and no duration is made up for it.
// - A correction is the Owner's (visit.correct_timestamps): the new value, the value it replaced (the recorded tap or
//   an earlier correction; null when it was missing) and the reason are kept; the recorded tap is never changed. A
//   correction stays in the past and keeps Arrived before Finished. Supplying the last missing Finished of an arrived
//   visit completes it (PROPOSED, OQ-MY-DAY-DETAILS); a correction never moves a visit any other way.
// - The CSV lists the recorded times for the accountant (export.accounting: the Owner, fresh sign-in). It holds times
//   and durations only: no pay, rate, overtime or deduction is computed anywhere (payroll is a human-review area,
//   RULE-HUMAN-REVIEW). Cells are written so a spreadsheet never runs one as a formula.
import type { Db, Tx } from '@handyhub/db'
import { correctionProblem, csvCell, workerTimes, type StampValue, type TimeStampKind } from '@handyhub/domain'
import type { StaffActor } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError } from '../../api/errors.js'
import { assignedWorkers, completeIfEveryoneFinished } from './taps.js'

type Reader = Db | Tx

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null)
const STARTED = ['en_route', 'arrived', 'completed'] as const

async function visitRow(db: Reader, visitId: string) {
  return db
    .selectFrom('work.visits as v')
    .innerJoin('crm.projects as p', 'p.id', 'v.project_id')
    .select([
      'v.id',
      'v.number',
      'v.purpose',
      'v.state',
      'v.version',
      'v.project_id',
      'v.local_date',
      'v.window_start',
      'v.window_end',
      'v.time_zone',
      'v.starts_at',
      'v.ends_at',
      'p.reference',
      sql<boolean>`now() >= ((v.local_date + 1)::timestamp AT TIME ZONE v.time_zone)`.as('day_ended'),
    ])
    .where('v.id', '=', visitId)
    .executeTakeFirst()
}

/** The per-worker times of the given visits, with the names of the workers and of the Owner who corrected them. */
async function timesOf(db: Reader, visits: { id: string; state: string; day_ended: boolean }[]) {
  const ids = visits.map((v) => v.id)
  if (ids.length === 0) return new Map<string, ReturnType<typeof shape>[]>()
  const reservations = await db
    .selectFrom('work.reservations')
    .select(['visit_id', 'staff_user_id', 'role'])
    .where('visit_id', 'in', ids)
    .where('resource', '=', 'worker')
    .where('kind', '=', 'confirmed')
    .where('ended_at', 'is', null)
    .orderBy('role')
    .orderBy('staff_user_id')
    .execute()
  const stamps = await db
    .selectFrom('work.time_stamps')
    .select(['visit_id', 'staff_user_id', 'kind', 'recorded_at', 'device_recorded_at'])
    .where('visit_id', 'in', ids)
    .execute()
  const corrections = await db
    .selectFrom('work.time_stamp_corrections')
    .select([
      'visit_id',
      'staff_user_id',
      'kind',
      'corrected_at',
      'previous_at',
      'reason',
      'corrected_by',
      'created_at',
    ])
    .where('visit_id', 'in', ids)
    .orderBy('created_at')
    .orderBy('id')
    .execute()
  const departures = await db
    .selectFrom('work.visit_departures')
    .select(['visit_id', 'staff_user_id', 'recorded_at'])
    .where('visit_id', 'in', ids)
    .execute()
  const people = [
    ...new Set([
      ...reservations.map((r) => r.staff_user_id as string),
      ...stamps.map((s) => s.staff_user_id),
      ...corrections.flatMap((c) => [c.staff_user_id, c.corrected_by]),
    ]),
  ]
  const names = new Map(
    (people.length
      ? await db.selectFrom('identity.staff_users').select(['id', 'display_name']).where('id', 'in', people).execute()
      : []
    ).map((u) => [u.id, u.display_name]),
  )
  function shape(visitId: string, w: ReturnType<typeof workerTimes>[number]) {
    const role = reservations.find((r) => r.visit_id === visitId && r.staff_user_id === w.staffUserId)?.role
    const device = (kind: TimeStampKind) =>
      iso(
        stamps.find((s) => s.visit_id === visitId && s.staff_user_id === w.staffUserId && s.kind === kind)
          ?.device_recorded_at,
      )
    const stamp = (s: StampValue, kind: TimeStampKind) => ({
      status: s.status,
      at: iso(s.at),
      recordedAt: iso(s.recordedAt),
      deviceRecordedAt: device(kind),
      corrections: s.corrections.map((c) => {
        const row = corrections.find(
          (x) =>
            x.visit_id === visitId &&
            x.staff_user_id === c.staffUserId &&
            x.kind === c.kind &&
            x.created_at.getTime() === c.createdAt.getTime(),
        )
        return {
          correctedAt: c.correctedAt.toISOString(),
          previousAt: iso(c.previousAt),
          reason: c.reason,
          correctedBy: row ? (names.get(row.corrected_by) ?? null) : null,
          createdAt: c.createdAt.toISOString(),
        }
      }),
    })
    return {
      staffUserId: w.staffUserId,
      name: names.get(w.staffUserId) ?? null,
      role: role === undefined ? null : (role ?? 'member'),
      assigned: role !== undefined,
      departedAt: iso(departures.find((d) => d.visit_id === visitId && d.staff_user_id === w.staffUserId)?.recorded_at),
      arrived: stamp(w.arrived, 'arrived'),
      finished: stamp(w.finished, 'finished'),
      durationMinutes: w.durationMinutes,
      flagged: w.flagged,
    }
  }
  const out = new Map<string, ReturnType<typeof shape>[]>()
  for (const v of visits) {
    const assigned = reservations.filter((r) => r.visit_id === v.id).map((r) => r.staff_user_id as string)
    const lead = reservations
      .filter((r) => r.visit_id === v.id && r.role === 'lead')
      .map((r) => r.staff_user_id as string)
    const ordered = [...lead, ...assigned.filter((id) => !lead.includes(id))]
    const times = workerTimes({
      assigned: ordered,
      stamps: stamps
        .filter((s) => s.visit_id === v.id)
        .map((s) => ({ staffUserId: s.staff_user_id, kind: s.kind as TimeStampKind, recordedAt: s.recorded_at })),
      corrections: corrections
        .filter((c) => c.visit_id === v.id)
        .map((c) => ({
          staffUserId: c.staff_user_id,
          kind: c.kind as TimeStampKind,
          correctedAt: c.corrected_at,
          previousAt: c.previous_at,
          reason: c.reason,
          createdAt: c.created_at,
        })),
      visitState: v.state,
      dayEnded: v.day_ended,
    })
    out.set(
      v.id,
      times.map((w) => shape(v.id, w)),
    )
  }
  return out
}

export type VisitTimesView = Awaited<ReturnType<typeof visitTimes>>

/** One visit's Arrived and Finished per worker (the Owner's view; T47). */
export async function visitTimes(db: Reader, visitId: string, can: { correct: boolean; export: boolean }) {
  const v = await visitRow(db, visitId)
  if (!v) throw new ApiError('NOT_FOUND')
  const workers = (await timesOf(db, [v])).get(v.id) ?? []
  return {
    visitId: v.id,
    number: v.number,
    purpose: v.purpose,
    state: v.state,
    version: v.version,
    projectReference: v.reference,
    window: {
      localDate: v.local_date,
      start: v.window_start.slice(0, 5),
      end: v.window_end.slice(0, 5),
      timeZone: v.time_zone,
      startsAt: new Date(v.starts_at).toISOString(),
      endsAt: new Date(v.ends_at).toISOString(),
    },
    dayEnded: v.day_ended,
    workers,
    actions: { correct: can.correct && (STARTED as readonly string[]).includes(v.state), export: can.export },
  }
}

export type CorrectionInput = { staffUserId: string; kind: TimeStampKind; at: string; reason: string }

const field = (f: string, code: string) =>
  new ApiError('VALIDATION_FAILED', { fieldErrors: [{ field: f, code, message: '' }] })

/** Records the Owner's correction (see the header) and completes the visit when it supplied the last Finished. */
export async function correctTimestamp(
  tx: Tx,
  actor: StaffActor,
  visitId: string,
  input: CorrectionInput,
  now = new Date(),
) {
  const locked = await tx
    .selectFrom('work.visits')
    .select(['id', 'project_id', 'state', 'version'])
    .where('id', '=', visitId)
    .forUpdate()
    .executeTakeFirst()
  if (!locked) throw new ApiError('NOT_FOUND')
  if (!(STARTED as readonly string[]).includes(locked.state))
    throw new ApiError('CONFLICT', { fieldErrors: [{ field: 'visit', code: 'VISIT_NOT_STARTED', message: '' }] })
  const reason = input.reason.trim()
  if (!reason) throw field('body.reason', 'REASON_REQUIRED')
  const v = await visitRow(tx, visitId)
  if (!v) throw new ApiError('NOT_FOUND')
  const worker = ((await timesOf(tx, [v])).get(visitId) ?? []).find((w) => w.staffUserId === input.staffUserId)
  if (!worker) throw field('body.staffUserId', 'NOT_A_WORKER_OF_THE_VISIT')
  const at = new Date(input.at)
  const current = {
    arrived: { at: worker.arrived.at ? new Date(worker.arrived.at) : null },
    finished: { at: worker.finished.at ? new Date(worker.finished.at) : null },
  }
  const problem = correctionProblem(input.kind, at, current, now)
  if (problem) throw field('body.at', problem)
  const stamp = await tx
    .selectFrom('work.time_stamps')
    .select('id')
    .where('visit_id', '=', visitId)
    .where('staff_user_id', '=', input.staffUserId)
    .where('kind', '=', input.kind)
    .executeTakeFirst()
  const previous = input.kind === 'arrived' ? current.arrived.at : current.finished.at
  const row = await tx
    .insertInto('work.time_stamp_corrections')
    .values({
      visit_id: visitId,
      staff_user_id: input.staffUserId,
      kind: input.kind,
      time_stamp_id: stamp?.id ?? null,
      previous_at: previous,
      corrected_at: at,
      reason,
      corrected_by: actor.userId,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  const outcome =
    input.kind === 'finished'
      ? await completeIfEveryoneFinished(
          tx,
          {
            visitId,
            projectId: locked.project_id,
            fromState: locked.state,
            state: locked.state,
            version: locked.version,
          },
          await assignedWorkers(tx, visitId),
        )
      : null
  return {
    correctionId: row.id,
    projectId: locked.project_id,
    previousAt: previous,
    correctedAt: at,
    reason,
    visitVersion: outcome?.version ?? locked.version,
    completed: outcome?.moved ?? false,
  }
}

// --- The accountant's CSV (HH-WORK-06, HH-FIN-16) -----------------------------------------------------------------

/** PROPOSED: one export covers at most 366 days of visit dates. */
export const EXPORT_MAX_DAYS = 366

/** A CSV cell: quoted, with a leading formula character neutralized (CSV injection); shared with TSK-0096. */
export { csvCell }

const localText = (d: string | null, zone: string) => {
  if (!d) return null
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(d))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`
}

export const CSV_COLUMNS = [
  'visit_date',
  'time_zone',
  'project_reference',
  'visit_number',
  'visit_purpose',
  'worker_name',
  'worker_id',
  'arrived_local',
  'arrived_utc',
  'arrived_status',
  'finished_local',
  'finished_utc',
  'finished_status',
  'duration_minutes',
  'corrected',
] as const

/** Every started visit with a date in [from, to] (each in its own zone), one row per worker. */
export async function timestampsCsv(db: Reader, range: { readonly from: string; readonly to: string }) {
  const days = (Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) / 86_400_000
  if (!Number.isFinite(days) || days < 0) throw field('body.to', 'RANGE_INVALID')
  if (days >= EXPORT_MAX_DAYS) throw field('body.to', 'RANGE_TOO_LONG')
  const visits = await db
    .selectFrom('work.visits as v')
    .innerJoin('crm.projects as p', 'p.id', 'v.project_id')
    .select([
      'v.id',
      'v.number',
      'v.purpose',
      'v.state',
      'v.local_date',
      'v.time_zone',
      'p.reference',
      sql<boolean>`now() >= ((v.local_date + 1)::timestamp AT TIME ZONE v.time_zone)`.as('day_ended'),
    ])
    .where('v.state', 'in', [...STARTED])
    .where('v.local_date', '>=', range.from)
    .where('v.local_date', '<=', range.to)
    .orderBy('v.local_date')
    .orderBy('v.starts_at')
    .orderBy('v.id')
    .execute()
  const times = await timesOf(db, visits)
  const lines = [CSV_COLUMNS.join(',')]
  let rows = 0
  for (const v of visits) {
    for (const w of times.get(v.id) ?? []) {
      rows++
      lines.push(
        [
          v.local_date,
          v.time_zone,
          v.reference,
          v.number,
          v.purpose,
          w.name,
          w.staffUserId,
          localText(w.arrived.at, v.time_zone),
          w.arrived.at,
          w.arrived.status,
          localText(w.finished.at, v.time_zone),
          w.finished.at,
          w.finished.status,
          w.durationMinutes,
          w.arrived.status === 'corrected' || w.finished.status === 'corrected' ? 'yes' : 'no',
        ]
          .map((c) => csvCell(c))
          .join(','),
      )
    }
  }
  return { csv: `${lines.join('\r\n')}\r\n`, rows, visits: visits.length }
}
