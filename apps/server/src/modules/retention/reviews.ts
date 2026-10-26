// The Owner's deletion-review queue, read-only (TSK-0099; HH-PRIV-01, HH-DATA-09, ENT-RetentionReview, OWN-DEC-70,
// OWN-DEC-142, OQ-RETENTION-REVIEW, ROLE-MATRIX retention.view). The schedule as configured, whether the job can find
// each category's records yet, when it last ran, and the entries it opened with their hold checks. Nothing here
// decides an entry: the Delete, Archive and early-deletion decisions are the Owner Delete action (HH-PRIV-05, TSK-0100:
// modules/privacy), and until the Owner decides, the record stays exactly as it is. TSK-0100: each entry carries its
// status from the Owner's latest decision (pending, archived, kept longer until a time, deleted), and the list can be
// narrowed to one status. TSK-0138: a period is whole years or (technical logs, expired sessions and links) calendar
// days, and an entry may stand for a batch of rows (the expired sessions and links of one kind and month).
import type { Db } from '@handyhub/db'
import { sql } from 'kysely'
import { ApiError } from '../../api/errors.js'
import type { Page, PageRequest } from '../../api/pagination.js'
import { toPage } from '../../api/pagination.js'
import { loadConfig } from '../../platform/config/index.js'
import {
  CATEGORY_DEFINITIONS,
  PERIOD_CATEGORIES,
  RETENTION_CATEGORIES,
  type HoldCheckOutcome,
  type PeriodCategory,
  type RetentionCategory,
  type ScanState,
} from './schedule.js'

export const RETENTION_AUTOMATION = 'retention.review_scan'

export type CategoryView = {
  id: RetentionCategory
  configKey: string | null
  scan: ScanState
  /** The configuration's state; null for a category the schedule gives no period. */
  state: 'CONFIGURED' | 'NOT_CONFIGURED' | null
  years: number | null
  /** TSK-0138: a period in calendar days (technical logs, expired sessions and links). */
  days: number | null
  after: string | null
  version: number | null
  sourceIds: string[]
  /** Entries opened for the category. */
  entries: number
}

export type RetentionOverview = {
  automaticDeletion: false
  /** The periods still await CPA and attorney confirmation (OQ-RETENTION-REVIEW). */
  awaitingConfirmation: boolean
  timeZone: string | null
  categories: CategoryView[]
  lastScanAt: string | null
  nextScanAt: string | null
  entries: number
}

export async function retentionOverview(db: Db): Promise<RetentionOverview> {
  const config = await loadConfig(db)
  const zone = config.get('business.timezone')
  const counts = await db
    .selectFrom('privacy.retention_reviews')
    .select(['category', sql<string>`count(*)::text`.as('n')])
    .groupBy('category')
    .execute()
  const byCategory = new Map(counts.map((c) => [c.category, Number(c.n)]))
  const jobs = await db
    .selectFrom('platform.jobs')
    .select([
      sql<Date | null>`max(finished_at) FILTER (WHERE state = 'succeeded')`.as('last'),
      sql<Date | null>`min(run_at) FILTER (WHERE state IN ('queued', 'running'))`.as('next'),
    ])
    .where('automation', '=', RETENTION_AUTOMATION)
    .executeTakeFirstOrThrow()
  let awaiting = false
  const categories = RETENTION_CATEGORIES.map((id): CategoryView => {
    const def = CATEGORY_DEFINITIONS[id]
    if (def.configKey === null)
      return {
        id,
        configKey: null,
        scan: def.scan,
        state: null,
        years: null,
        days: null,
        after: null,
        version: null,
        sourceIds: [...def.sources],
        entries: 0,
      }
    const entry = config.get(def.configKey)
    if (entry.sourceIds.includes('OQ-RETENTION-REVIEW')) awaiting = true
    const value =
      entry.state === 'CONFIGURED' ? (entry.value as { years?: number; days?: number; after?: string }) : null
    const period = value !== null && (value.years !== undefined || value.days !== undefined)
    return {
      id,
      configKey: def.configKey,
      scan: def.scan,
      state: entry.state,
      years: value?.years ?? null,
      days: value?.days ?? null,
      // The audit-log value has no `after`: its period starts when the entry is recorded (OWN-DEC-142). Settings
      // history has no period at all (TSK-0138).
      after: period ? (value.after ?? 'recorded') : null,
      version: entry.version,
      sourceIds: [...entry.sourceIds],
      entries: byCategory.get(id) ?? 0,
    }
  })
  const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null)
  return {
    automaticDeletion: false,
    awaitingConfirmation: awaiting,
    timeZone: zone.state === 'CONFIGURED' ? zone.value.zone : null,
    categories,
    lastScanAt: iso(jobs.last),
    nextScanAt: iso(jobs.next),
    entries: [...byCategory.values()].reduce((a, b) => a + b, 0),
  }
}

/** TSK-0100: the entry's status from the Owner's latest decision (privacy.retention_decisions). */
export const ENTRY_STATES = ['pending', 'archived', 'kept', 'deleted'] as const
export type EntryStatusView = {
  state: (typeof ENTRY_STATES)[number]
  until: string | null
  decidedAt: string | null
  reason: string | null
}

export type ReviewEntry = {
  id: string
  seq: string
  category: PeriodCategory
  record: { type: string; id: string; reference: string; projectId: string | null }
  retentionStartedAt: string
  periodEndsAt: string
  years: number | null
  /** TSK-0138: the period in calendar days instead of years. */
  days: number | null
  /** TSK-0138: the rows a batch entry (or a consent history) stands for; null for one record. */
  count: number | null
  policy: { key: string; version: number }
  holdChecks: HoldCheckOutcome[]
  holdsFound: boolean
  openedAt: string
  openedBy: string
  status: EntryStatusView
}

const SEQ = /^[1-9][0-9]{0,18}$/
const invalid = (field: string) =>
  new ApiError('VALIDATION_FAILED', { fieldErrors: [{ field, code: 'invalid', message: '' }] })

/** One page of the queue in the order the entries were opened, optionally one category's only. */
export async function listReviewEntries(
  db: Db,
  filters: { category?: string; status?: string },
  page: PageRequest,
): Promise<Page<ReviewEntry>> {
  if (filters.category !== undefined && !(PERIOD_CATEGORIES as readonly string[]).includes(filters.category))
    throw invalid('querystring.category')
  if (filters.status !== undefined && !(ENTRY_STATES as readonly string[]).includes(filters.status))
    throw invalid('querystring.status')
  let after: string | undefined
  if (page.after !== undefined) {
    const [seq] = page.after
    if (page.after.length !== 1 || typeof seq !== 'string' || !SEQ.test(seq)) throw invalid('querystring.cursor')
    after = seq
  }
  // The latest decision of each entry (TSK-0100); a keep-longer whose time passed reads as pending again.
  const state = sql<string>`CASE
      WHEN ld.decision IS NULL THEN 'pending'
      WHEN ld.decision = 'delete' THEN 'deleted'
      WHEN ld.decision = 'archive' THEN 'archived'
      WHEN ld.keep_until <= now() THEN 'pending'
      ELSE 'kept' END`
  let q = db
    .selectFrom('privacy.retention_reviews')
    .leftJoinLateral(
      (eb) =>
        eb
          .selectFrom('privacy.retention_decisions as d')
          .select(['d.decision', 'd.keep_until', 'd.decided_at', 'd.reason'])
          .whereRef('d.review_id', '=', 'privacy.retention_reviews.id')
          .orderBy('d.seq', 'desc')
          .limit(1)
          .as('ld'),
      (join) => join.onTrue(),
    )
    .select([
      state.as('status_state'),
      'ld.keep_until',
      'ld.decided_at',
      'ld.reason as decision_reason',
      'id',
      sql<string>`seq::text`.as('seq'),
      'category',
      'record_type',
      'record_id',
      'record_ref',
      'project_id',
      'retention_started_at',
      'period_ends_at',
      'period_years',
      'period_days',
      'record_count',
      'policy_key',
      'policy_version',
      'hold_checks',
      'holds_found',
      'opened_at',
      'opened_by',
    ])
  if (filters.category !== undefined) q = q.where('category', '=', filters.category)
  if (filters.status !== undefined) q = q.where(sql<boolean>`${state} = ${filters.status}`)
  if (after !== undefined) q = q.where(sql<boolean>`seq > ${after}::bigint`)
  // The table's bigint seq, not the text `seq` of the select list (text order would put 35 before 4).
  const rows = await q
    .orderBy(sql`privacy.retention_reviews.seq`)
    .limit(page.limit + 1)
    .execute()
  const out = toPage(rows, page, (r) => [r.seq])
  return {
    items: out.items.map((r) => ({
      id: r.id,
      seq: r.seq,
      category: r.category as PeriodCategory,
      record: { type: r.record_type, id: r.record_id, reference: r.record_ref, projectId: r.project_id },
      retentionStartedAt: new Date(r.retention_started_at).toISOString(),
      periodEndsAt: new Date(r.period_ends_at).toISOString(),
      years: r.period_years,
      days: r.period_days,
      count: r.record_count,
      policy: { key: r.policy_key, version: r.policy_version },
      holdChecks: r.hold_checks as unknown as HoldCheckOutcome[],
      holdsFound: r.holds_found,
      openedAt: new Date(r.opened_at).toISOString(),
      openedBy: r.opened_by,
      status: {
        state: r.status_state as EntryStatusView['state'],
        until: r.keep_until ? new Date(r.keep_until).toISOString() : null,
        decidedAt: r.decided_at ? new Date(r.decided_at).toISOString() : null,
        reason: r.decision_reason ?? null,
      },
    })),
    nextCursor: out.nextCursor,
  }
}
