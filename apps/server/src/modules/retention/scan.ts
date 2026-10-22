// The retention job's scan (TSK-0099; HH-PRIV-01, HH-DATA-09, ENT-RetentionReview, FACT-RETENTION-SCHEDULE,
// OWN-DEC-70, OWN-DEC-142, OQ-RETENTION-REVIEW, RULE-NO-INVENTED-FACTS).
// - For each category whose records and period start the software records (schedule.ts `scanned`), it finds the
//   records whose configured period has ended and opens one deletion-review entry per record in the Owner's queue,
//   with the hold checks it can run. It never deletes, archives or changes a record: the only write is the entry
//   (privacy.retention_reviews, append-only) and one audit event naming how many entries it opened.
// - A category whose configuration is NOT CONFIGURED opens nothing. A record that already has an entry gets no second
//   one, so a repeated run (a retried job, a second worker) opens nothing twice.
// - Periods are added in UTC calendar years to the recorded start (closing decision, final estimate state, the audit
//   entry's time); nothing else is assumed.
import type { Tx } from '@handyhub/db'
import { REQUEST_CLOSED_STATES } from '@handyhub/domain'
import { sql } from 'kysely'
import { audit } from '../../platform/audit.js'
import { loadConfig } from '../../platform/config/index.js'
import { activeCaseCounts } from '../cases/active.js'
import {
  CATEGORY_DEFINITIONS,
  holdCheckOutcomes,
  PERIOD_CATEGORIES,
  type CaseCounts,
  type HoldCheckOutcome,
  type PeriodCategory,
} from './schedule.js'

/** PROPOSED engineering default: at most this many new entries per category in one run; the rest follow next run. */
export const SCAN_BATCH = 500

/** The system identity the job and the operator command act as (the entry's opened_by and the audit actor). */
export const RETENTION_PROCESS = 'system.retention'

export type ScanOptions = {
  /** The scan's clock; the database's now() when omitted. */
  now?: Date
  limit?: number
  requestId: string
  process?: string
}

export type ScanResult = {
  at: string
  opened: Record<PeriodCategory, number>
  /** Categories that were not scanned, with the reason (no records recorded yet, or NOT CONFIGURED). */
  skipped: { category: PeriodCategory; reason: 'start_not_recorded' | 'not_configured' }[]
  /** Some category had more due records than one batch: another run follows soon. */
  more: boolean
}

type Candidate = {
  record_type: string
  record_id: string
  record_ref: string
  project_id: string | null
  started_at: Date
  ends_at: Date
}

const UUID_TEXT = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'

/** The period end of a start column: the start plus whole UTC calendar years. */
const endOf = (column: string, years: number) =>
  sql<Date>`((${sql.ref(column)} AT TIME ZONE 'UTC') + make_interval(years => ${years})) AT TIME ZONE 'UTC'`

/** No entry exists yet for the record. */
const notQueued = (recordType: string, idColumn: string) =>
  sql<boolean>`NOT EXISTS (SELECT 1 FROM privacy.retention_reviews rv
    WHERE rv.record_type = ${recordType} AND rv.record_id = ${sql.ref(idColumn)})`

type Finder = (tx: Tx, years: number, now: Date, limit: number) => Promise<Candidate[]>

const FINDERS: Partial<Record<PeriodCategory, Finder>> = {
  // A request that never became a job: closed, its project closed, no job; the period starts at the latest decision
  // that moved it to its closed state. A request without that recorded decision is not due (no date is assumed).
  requests_not_converted: async (tx, years, now, limit) => {
    const { rows } = await sql<Candidate>`
      SELECT 'request' AS record_type, r.id AS record_id, r.reference AS record_ref, r.project_id,
             c.closed_at AS started_at, ${endOf('c.closed_at', years)} AS ends_at
        FROM intake.requests r
        JOIN crm.projects p ON p.id = r.project_id
        CROSS JOIN LATERAL (SELECT max(d.decided_at) AS closed_at FROM intake.request_decisions d
                             WHERE d.request_id = r.id AND d.to_state = r.state) c
       WHERE r.state = ANY(${sql.val([...REQUEST_CLOSED_STATES])}::text[])
         AND p.state = 'closed'
         AND c.closed_at IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM work.jobs j WHERE j.project_id = r.project_id)
         AND ${endOf('c.closed_at', years)} <= ${now}::timestamptz
         AND ${notQueued('request', 'r.id')}
       ORDER BY c.closed_at, r.id
       LIMIT ${limit}`.execute(tx)
    return rows
  },
  // An estimate never accepted whose latest version expired, was declined or was withdrawn; the period starts when
  // that version reached its state.
  unaccepted_estimates: async (tx, years, now, limit) => {
    const { rows } = await sql<Candidate>`
      SELECT 'estimate' AS record_type, e.id AS record_id, e.number AS record_ref, e.project_id,
             lv.state_changed_at AS started_at, ${endOf('lv.state_changed_at', years)} AS ends_at
        FROM estimating.estimates e
        CROSS JOIN LATERAL (SELECT v.state, v.state_changed_at FROM estimating.estimate_versions v
                             WHERE v.estimate_id = e.id ORDER BY v.version DESC LIMIT 1) lv
       WHERE lv.state IN ('expired', 'declined', 'withdrawn')
         AND NOT EXISTS (SELECT 1 FROM estimating.estimate_versions a WHERE a.estimate_id = e.id AND a.state = 'accepted')
         AND ${endOf('lv.state_changed_at', years)} <= ${now}::timestamptz
         AND ${notQueued('estimate', 'e.id')}
       ORDER BY lv.state_changed_at, e.id
       LIMIT ${limit}`.execute(tx)
    return rows
  },
  // Every audit entry, from the time it was recorded (OWN-DEC-142). The project of the record it names, where there
  // is one, decides the hold check. The first condition only lets the index on occurred_at narrow the scan.
  audit_log: async (tx, years, now, limit) => {
    const { rows } = await sql<Candidate>`
      SELECT 'audit_event' AS record_type, ae.id AS record_id,
             ('#' || ae.seq::text || ' ' || ae.action) AS record_ref,
             CASE WHEN ae.target_id ~ ${UUID_TEXT} THEN
               CASE ae.target_type
                 WHEN 'project' THEN (SELECT p.id FROM crm.projects p WHERE p.id = ae.target_id::uuid)
                 WHEN 'request' THEN (SELECT r.project_id FROM intake.requests r WHERE r.id = ae.target_id::uuid)
                 WHEN 'estimate_version' THEN
                   (SELECT v.project_id FROM estimating.estimate_versions v WHERE v.id = ae.target_id::uuid)
                 WHEN 'job' THEN (SELECT j.project_id FROM work.jobs j WHERE j.id = ae.target_id::uuid)
                 WHEN 'visit' THEN (SELECT w.project_id FROM work.visits w WHERE w.id = ae.target_id::uuid)
                 WHEN 'hold' THEN (SELECT h.project_id FROM work.holds h WHERE h.id = ae.target_id::uuid)
               END
             END AS project_id,
             ae.occurred_at AS started_at, ${endOf('ae.occurred_at', years)} AS ends_at
        FROM platform.audit_events ae
       WHERE ae.occurred_at <= ((${now}::timestamptz AT TIME ZONE 'UTC') - make_interval(years => ${years}))
                                AT TIME ZONE 'UTC'
         AND ${endOf('ae.occurred_at', years)} <= ${now}::timestamptz
         AND ${notQueued('audit_event', 'ae.id')}
       ORDER BY ae.seq
       LIMIT ${limit}`.execute(tx)
    return rows
  },
}

/** Unresolved holds per project (ENT-Hold states open and under review). */
async function openHolds(tx: Tx, projectIds: readonly string[]): Promise<Map<string, number>> {
  if (projectIds.length === 0) return new Map()
  const rows = await tx
    .selectFrom('work.holds')
    .select(['project_id', sql<string>`count(*)::text`.as('n')])
    .where('project_id', 'in', [...projectIds])
    .where('state', 'in', ['open', 'under_review'])
    .groupBy('project_id')
    .execute()
  return new Map(rows.map((r) => [r.project_id, Number(r.n)]))
}

/**
 * The checks of one record: open holds and (TSK-0093) open cases on its project, and the kinds the software does not
 * record yet.
 */
export function holdChecksFor(
  projectId: string | null,
  holds: ReadonlyMap<string, number>,
  cases: ReadonlyMap<string, CaseCounts> = new Map(),
): HoldCheckOutcome[] {
  const n = projectId === null ? null : (holds.get(projectId) ?? 0)
  return holdCheckOutcomes(n, projectId === null ? null : (cases.get(projectId) ?? null))
}

async function dbNow(tx: Tx): Promise<Date> {
  const { rows } = await sql<{ now: Date }>`SELECT now() AS now`.execute(tx)
  return new Date((rows[0] as { now: Date }).now)
}

/** One pass over the scanned categories, inside the caller's transaction. */
export async function runRetentionScan(tx: Tx, options: ScanOptions): Promise<ScanResult> {
  if (!tx.isTransaction) throw new Error('runRetentionScan must run inside a transaction (withTx)')
  const now = options.now ?? (await dbNow(tx))
  const limit = options.limit ?? SCAN_BATCH
  const process = options.process ?? RETENTION_PROCESS
  const config = await loadConfig(tx)
  const opened = Object.fromEntries(PERIOD_CATEGORIES.map((c) => [c, 0])) as Record<PeriodCategory, number>
  const skipped: ScanResult['skipped'] = []
  let more = false

  for (const category of PERIOD_CATEGORIES) {
    const def = CATEGORY_DEFINITIONS[category]
    const find = FINDERS[category]
    if (def.scan !== 'scanned' || !find || def.configKey === null) {
      skipped.push({ category, reason: 'start_not_recorded' })
      continue
    }
    const entry = config.get(def.configKey)
    if (entry.state !== 'CONFIGURED' || !('years' in entry.value)) {
      skipped.push({ category, reason: 'not_configured' })
      continue
    }
    const years = (entry.value as { years: number }).years
    const found = await find(tx, years, now, limit + 1)
    if (found.length > limit) more = true
    const batch = found.slice(0, limit)
    const projectIds = [...new Set(batch.flatMap((c) => (c.project_id ? [c.project_id] : [])))]
    const holds = await openHolds(tx, projectIds)
    const cases = await activeCaseCounts(tx, projectIds)
    for (const c of batch) {
      const checks = holdChecksFor(c.project_id, holds, cases)
      const inserted = await tx
        .insertInto('privacy.retention_reviews')
        .values({
          category,
          record_type: c.record_type,
          record_id: c.record_id,
          record_ref: c.record_ref.slice(0, 160),
          project_id: c.project_id,
          policy_key: def.configKey,
          policy_version: entry.version,
          period_years: years,
          retention_started_at: c.started_at,
          period_ends_at: c.ends_at,
          hold_checks: JSON.stringify(checks),
          holds_found: checks.some((h) => h.result === 'found'),
          opened_by: process,
          request_id: options.requestId,
        })
        .onConflict((oc) => oc.doNothing())
        .returning('id')
        .executeTakeFirst()
      if (inserted) opened[category] += 1
    }
  }

  const total = Object.values(opened).reduce((a, b) => a + b, 0)
  if (total > 0)
    await audit.record(tx, {
      actor: { kind: 'system', process },
      action: 'retention.review_open',
      target: { type: 'retention_review_queue' },
      summary: { opened: { ...opened }, at: now.toISOString() },
      requestId: options.requestId,
    })
  return { at: now.toISOString(), opened, skipped, more }
}
