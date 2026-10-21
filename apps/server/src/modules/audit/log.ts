// The audit-log viewer's reads (TSK-0098; HH-SEC-06, HH-STAFF-08, S09, ENT-AuditEvent, FACT-RETENTION-SCHEDULE,
// OWN-DEC-123, OWN-DEC-142, OWN-DEC-70, RULE-SERVER-AUTHZ).
// - Visibility is the caller's record scope of audit.view (ROLE-MATRIX "View audit log": Owner All, Office Own
//   actions), computed by @handyhub/policy and applied in the query before paging: an Office user's list holds only the
//   events they performed, whatever filter or cursor they send; Estimators and Workers are refused by the policy.
// - Every summary is redacted again on the way out with the writer's secret-field schema (platform/redact.ts), so a
//   row written before a field joined the schema still never shows its value; the row itself is never changed.
// - Retention reads the active retention.audit_log value (7 years, OWN-DEC-142) and counts, for the Owner, the
//   entries past it. Nothing is deleted here or anywhere: the table is append-only (migration 0002), and the
//   owner's deletion-review entries with their hold checks are the retention job of TSK-0099.
import type { Db } from '@handyhub/db'
import { isLocalDate } from '@handyhub/domain'
import type { DataScope } from '@handyhub/policy'
import { sql, type Expression, type SqlBool } from 'kysely'
import { ApiError } from '../../api/errors.js'
import type { PageRequest } from '../../api/pagination.js'
import { toPage, type Page } from '../../api/pagination.js'
import { loadConfig } from '../../platform/config/index.js'
import { redact } from '../../platform/redact.js'

export type AuditField = { path: string; value: string | number | boolean | null }

export type AuditEntry = {
  id: string
  seq: string
  occurredAt: string
  actor: {
    kind: 'staff' | 'customer' | 'guest' | 'system'
    staffUserId: string | null
    name: string | null
    roles: string[]
    process: string | null
  }
  action: string
  area: string
  target: { type: string; id: string | null; version: number | null }
  result: 'succeeded' | 'denied' | 'failed'
  reason: string | null
  stepUpUsed: boolean
  requestId: string
  changes: AuditField[]
}

export type AuditFilters = {
  area?: string
  action?: string
  result?: 'succeeded' | 'denied' | 'failed'
  actor?: string
  targetType?: string
  targetId?: string
  /** Local dates (YYYY-MM-DD) in the business time zone, both included. */
  from?: string
  to?: string
}

/** PROPOSED display limits (engineering defaults): a summary shows at most this many fields of this length. */
export const MAX_FIELDS = 100
export const MAX_VALUE_LENGTH = 500

/**
 * A redacted summary as path and value pairs in the stored order; list items are numbered from 1. Null stays null
 * (a change "from nobody" matters) and an empty list or object is shown as null at its path.
 */
export function summaryFields(summary: unknown): AuditField[] {
  const out: AuditField[] = []
  const walk = (v: unknown, path: string): void => {
    if (out.length >= MAX_FIELDS) return
    if (Array.isArray(v)) {
      if (v.length === 0) out.push({ path, value: null })
      v.forEach((x, i) => walk(x, `${path}[${i + 1}]`))
    } else if (v !== null && typeof v === 'object') {
      const entries = Object.entries(v as Record<string, unknown>)
      if (entries.length === 0 && path) out.push({ path, value: null })
      for (const [k, x] of entries) walk(x, path ? `${path}.${k}` : k)
    } else if (typeof v === 'string')
      out.push({ path: path || 'value', value: v.length > MAX_VALUE_LENGTH ? `${v.slice(0, MAX_VALUE_LENGTH)}…` : v })
    else if (typeof v === 'number' || typeof v === 'boolean') out.push({ path: path || 'value', value: v })
    else if (v === null) out.push({ path: path || 'value', value: null })
  }
  walk(redact(summary), '')
  return out
}

/** The rows `scope` reaches: everything (Owner), only the caller's own actions (Office), or nothing. */
export function auditInScope(scope: DataScope): Expression<SqlBool> {
  switch (scope.kind) {
    case 'all':
      return sql<SqlBool>`true`
    case 'own':
      return sql<SqlBool>`(ae.actor_kind = 'staff' AND ae.actor_id = ${scope.staffUserId})`
    default:
      return sql<SqlBool>`false`
  }
}

const SEQ = /^[1-9]\d{0,18}$/
const invalid = (field: string) =>
  new ApiError('VALIDATION_FAILED', { fieldErrors: [{ field, code: 'invalid', message: '' }] })

/** The business time zone the date filters are read in; UTC (and said so) while it is NOT CONFIGURED. */
export async function auditTimeZone(db: Db): Promise<string | null> {
  const zone = (await loadConfig(db)).get('business.timezone')
  return zone.state === 'CONFIGURED' ? zone.value.zone : null
}

type Row = {
  id: string
  seq: string
  occurred_at: Date
  actor_kind: AuditEntry['actor']['kind']
  actor_id: string | null
  actor_roles: string[]
  actor_process: string | null
  action: string
  target_type: string
  target_id: string | null
  target_version: number | null
  result: AuditEntry['result']
  reason: string | null
  summary: unknown
  step_up_used: boolean
  request_id: string
  staff_name: string | null
}

/** One page of the entries the scope reaches, newest first, with the filters applied before paging. */
export async function listAuditEntries(
  db: Db,
  scope: DataScope,
  filters: AuditFilters,
  page: PageRequest,
): Promise<Page<AuditEntry>> {
  if (filters.from !== undefined && !isLocalDate(filters.from)) throw invalid('querystring.from')
  if (filters.to !== undefined && !isLocalDate(filters.to)) throw invalid('querystring.to')
  if (filters.from !== undefined && filters.to !== undefined && filters.from > filters.to)
    throw invalid('querystring.to')
  let after: string | undefined
  if (page.after !== undefined) {
    const [seq] = page.after
    if (page.after.length !== 1 || typeof seq !== 'string' || !SEQ.test(seq)) throw invalid('querystring.cursor')
    after = seq
  }
  const zone = filters.from !== undefined || filters.to !== undefined ? ((await auditTimeZone(db)) ?? 'UTC') : 'UTC'

  let q = db
    .selectFrom('platform.audit_events as ae')
    .leftJoin('identity.staff_users as su', (j) =>
      j.on(sql<boolean>`ae.actor_kind = 'staff' AND su.id::text = ae.actor_id`),
    )
    .select([
      'ae.id',
      sql<string>`ae.seq::text`.as('seq'),
      'ae.occurred_at',
      'ae.actor_kind',
      'ae.actor_id',
      'ae.actor_roles',
      'ae.actor_process',
      'ae.action',
      'ae.target_type',
      'ae.target_id',
      'ae.target_version',
      'ae.result',
      'ae.reason',
      'ae.summary',
      'ae.step_up_used',
      'ae.request_id',
      sql<string | null>`coalesce(su.display_name, su.email)`.as('staff_name'),
    ])
    // Visibility first (HH-SEC-06): no filter or cursor reaches a row outside the caller's scope.
    .where(auditInScope(scope))
  if (filters.area !== undefined) q = q.where(sql<boolean>`split_part(ae.action, '.', 1) = ${filters.area}`)
  if (filters.action !== undefined) q = q.where('ae.action', '=', filters.action)
  if (filters.result !== undefined) q = q.where('ae.result', '=', filters.result)
  if (filters.actor !== undefined)
    q = q.where('ae.actor_kind', '=', 'staff').where('ae.actor_id', '=', filters.actor.toLowerCase())
  if (filters.targetType !== undefined) q = q.where('ae.target_type', '=', filters.targetType)
  if (filters.targetId !== undefined) q = q.where('ae.target_id', '=', filters.targetId)
  if (filters.from !== undefined)
    q = q.where(sql<boolean>`ae.occurred_at >= ((${filters.from}::date)::timestamp AT TIME ZONE ${zone})`)
  if (filters.to !== undefined)
    q = q.where(sql<boolean>`ae.occurred_at < (((${filters.to}::date) + 1)::timestamp AT TIME ZONE ${zone})`)
  if (after !== undefined) q = q.where(sql<boolean>`ae.seq < ${after}::bigint`)

  const rows = (await q
    .orderBy('ae.seq', 'desc')
    .limit(page.limit + 1)
    .execute()) as Row[]
  const out = toPage(rows, page, (r) => [r.seq])
  return { items: out.items.map(toEntry), nextCursor: out.nextCursor }
}

function toEntry(r: Row): AuditEntry {
  const staff = r.actor_kind === 'staff'
  return {
    id: r.id,
    seq: r.seq,
    occurredAt: r.occurred_at.toISOString(),
    actor: {
      kind: r.actor_kind,
      // A customer's contact ID is not shown (least data): the record the event names identifies the project.
      staffUserId: staff ? r.actor_id : null,
      name: staff ? r.staff_name : null,
      roles: [...r.actor_roles],
      process: r.actor_process,
    },
    action: r.action,
    area: r.action.split('.', 1)[0] as string,
    target: { type: r.target_type, id: r.target_id, version: r.target_version },
    result: r.result,
    reason: r.reason,
    stepUpUsed: r.step_up_used,
    requestId: r.request_id,
    changes: summaryFields(r.summary),
  }
}

export type AuditOverview = {
  visibility: 'all' | 'own'
  timeZone: string | null
  retention: {
    state: 'CONFIGURED' | 'NOT_CONFIGURED'
    years: number | null
    afterPeriod: 'owner_deletion_review' | null
    automaticDeletion: false
    holdsKeepRecords: boolean | null
    version: number | null
    sourceIds: string[]
    /** The periods still await CPA and attorney confirmation (OQ-RETENTION-REVIEW). */
    awaitingConfirmation: boolean
    /** Owner only: entries older than the period, due for the owner's deletion review; null for Office. */
    pastPeriod: number | null
    /** Owner only: when the oldest entry was recorded; null for Office or an empty log. */
    oldestAt: string | null
  }
  /** Owner only: the staff members the actor filter offers; empty for Office (they see only themselves). */
  staff: { id: string; name: string | null }[]
}

export async function auditOverview(db: Db, scope: DataScope, now: Date): Promise<AuditOverview> {
  const config = await loadConfig(db)
  const zone = config.get('business.timezone')
  const entry = config.get('retention.audit_log')
  const all = scope.kind === 'all'
  const years = entry.state === 'CONFIGURED' ? entry.value.years : null
  let pastPeriod: number | null = null
  let oldestAt: string | null = null
  if (all) {
    const row = await db
      .selectFrom('platform.audit_events')
      .select([
        sql<string>`count(*) FILTER (WHERE ${years !== null}
          AND occurred_at < ${now}::timestamptz - make_interval(years => ${years ?? 0}))::text`.as('past'),
        sql<Date | null>`min(occurred_at)`.as('oldest'),
      ])
      .executeTakeFirstOrThrow()
    pastPeriod = years === null ? null : Number(row.past)
    oldestAt = row.oldest ? new Date(row.oldest).toISOString() : null
  }
  const staff = all
    ? (
        await db
          .selectFrom('identity.staff_users')
          .select(['id', sql<string>`coalesce(display_name, email)`.as('name')])
          .orderBy(sql`lower(coalesce(display_name, email))`)
          .orderBy('id')
          .execute()
      ).map((s) => ({ id: s.id, name: s.name }))
    : []
  return {
    visibility: all ? 'all' : 'own',
    timeZone: zone.state === 'CONFIGURED' ? zone.value.zone : null,
    retention: {
      state: entry.state,
      years,
      afterPeriod: entry.state === 'CONFIGURED' ? entry.value.afterPeriod : null,
      automaticDeletion: false,
      holdsKeepRecords: entry.state === 'CONFIGURED' ? entry.value.holdsKeepRecords : null,
      version: entry.version,
      sourceIds: [...entry.sourceIds],
      awaitingConfirmation: entry.sourceIds.includes('OQ-RETENTION-REVIEW'),
      pastPeriod,
      oldestAt,
    },
    staff,
  }
}
