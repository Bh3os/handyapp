// Queue items: the provider API and the role-scoped listing (TSK-0041; HH-OPS-01, HH-OPS-02, HH-API-05, ENT-QueueItem,
// RULE-SERVER-AUTHZ).
// - Providers (outbox consumers of each module) call openQueueItem and resolveQueueItem inside their transaction.
//   Opening is idempotent per type and subject: a second call updates the open item instead of adding one.
// - The listing applies the caller's grants in the query, before ordering and paging, so a page, a cursor or a
//   filter never reaches an item outside the caller's scope (T68); each row is checked again before it is returned.
// - Order (OWN-DEC-115): safety, today's appointment changes, overdue and other time-sensitive items, everything
//   else; within a band by due time (earliest first, none last), then by age.
import type { Db, Tx } from '@handyhub/db'
import { listingScope, type StaffActor } from '@handyhub/policy'
import { sql, type Expression, type SqlBool } from 'kysely'
import { ApiError } from '../../api/errors.js'
import { encodeCursor, isCursorInstant, type Page, type PageRequest } from '../../api/pagination.js'
import { responseClockView, type ResponseClockView } from '../requests/clock-view.js'
import {
  bandRank,
  deepLink,
  QUEUE_BANDS,
  QUEUE_ITEM_TYPES,
  queueItemType,
  type QueueAction,
  type QueueBand,
  type QueueItemType,
  type QueueSection,
} from './registry.js'

export class QueueItemError extends Error {
  override name = 'QueueItemError'
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type OpenQueueItemInput = {
  type: string
  subjectId: string
  reason: string
  /** Default: the type's band. A provider sets today_change for a change to today's appointment, for example. */
  band?: QueueBand
  projectId?: string | null
  reference?: string | null
  /** The subject's current status code. */
  status?: string | null
  assignedStaffId?: string | null
  dueAt?: Date | null
  /** When the need for action began (for example the request's submission); default now. */
  openedAt?: Date
}

function typeOf(id: string): QueueItemType {
  const type = queueItemType(id)
  if (!type) throw new QueueItemError(`Unknown queue item type ${id}`)
  return type
}

/** Opens the item for a subject, or updates the open one (one open item per type and subject). */
export async function openQueueItem(tx: Tx, input: OpenQueueItemInput): Promise<{ id: string; created: boolean }> {
  if (!tx.isTransaction) throw new QueueItemError('openQueueItem runs inside the provider transaction')
  const type = typeOf(input.type)
  if (!type.reasons.includes(input.reason))
    throw new QueueItemError(`Reason ${input.reason} is not declared for ${type.id}`)
  if (input.assignedStaffId != null && !UUID.test(input.assignedStaffId))
    throw new QueueItemError('assignedStaffId is a staff user id')
  const values = {
    band: input.band ?? type.band,
    project_id: input.projectId ?? null,
    reference: input.reference ?? null,
    subject_status: input.status ?? null,
    reason: input.reason,
    assigned_staff_id: input.assignedStaffId ?? null,
    due_at: input.dueAt ?? null,
  }
  const row = await tx
    .insertInto('ops.queue_items')
    .values({
      type: type.id,
      subject_type: type.subject,
      subject_id: input.subjectId,
      ...values,
      opened_at: input.openedAt ?? new Date(),
    })
    .onConflict((oc) =>
      oc
        .columns(['type', 'subject_type', 'subject_id'])
        .where('resolved_at', 'is', null)
        .doUpdateSet({
          ...values,
          updated_at: sql<Date>`now()`,
          version: sql<number>`ops.queue_items.version + 1`,
        })
        // Nothing changed: no new version, so a replayed event leaves the item exactly as it was.
        .where(
          sql<SqlBool>`(ops.queue_items.band, ops.queue_items.project_id, ops.queue_items.reference,
            ops.queue_items.subject_status, ops.queue_items.reason, ops.queue_items.assigned_staff_id,
            ops.queue_items.due_at) IS DISTINCT FROM (excluded.band, excluded.project_id, excluded.reference,
            excluded.subject_status, excluded.reason, excluded.assigned_staff_id, excluded.due_at)`,
        ),
    )
    .returning(['id', sql<boolean>`xmax = 0`.as('created')])
    .executeTakeFirst()
  if (row) return { id: row.id, created: row.created }
  const open = await tx
    .selectFrom('ops.queue_items')
    .select('id')
    .where('type', '=', type.id)
    .where('subject_type', '=', type.subject)
    .where('subject_id', '=', input.subjectId)
    .where('resolved_at', 'is', null)
    .executeTakeFirstOrThrow()
  return { id: open.id, created: false }
}

/** Resolves the open item of a subject, if there is one: it disappears from the queue and stays as history. */
export async function resolveQueueItem(
  tx: Tx,
  input: { type: string; subjectId: string; resolution: string },
): Promise<boolean> {
  const type = typeOf(input.type)
  const res = await tx
    .updateTable('ops.queue_items')
    .set({ resolved_at: sql<Date>`now()`, resolution: input.resolution, updated_at: sql<Date>`now()` })
    .where('type', '=', type.id)
    .where('subject_type', '=', type.subject)
    .where('subject_id', '=', input.subjectId)
    .where('resolved_at', 'is', null)
    .executeTakeFirst()
  return Number(res.numUpdatedRows) > 0
}

/** The types of a section this staff member may see listed: every item, or only items assigned to them. */
export function visibleTypes(actor: StaffActor, section: QueueSection): { all: string[]; own: string[] } {
  const all: string[] = []
  const own: string[] = []
  for (const type of QUEUE_ITEM_TYPES) {
    if (type.section !== section) continue
    const scope = listingScope(actor.roles, actor.capabilities, type.view)
    if (scope === 'all') all.push(type.id)
    // Owner Decisions are decisions, not one's own records: an own-record grant (a worker's own incident report)
    // never lists them.
    else if (scope === 'own' && section !== 'owner_decisions') own.push(type.id)
  }
  return { all, own }
}

/** The sections this staff member has: the queue and, for the Owner, Owner Decisions. */
export function visibleSections(actor: StaffActor): QueueSection[] {
  return (['queue', 'owner_decisions'] as const).filter((s) => {
    const v = visibleTypes(actor, s)
    return v.all.length + v.own.length > 0
  })
}

function mayList(actor: StaffActor, action: QueueItemType['view'], assignedStaffId: string | null): boolean {
  const scope = listingScope(actor.roles, actor.capabilities, action)
  return scope === 'all' || (scope === 'own' && assignedStaffId === actor.userId)
}

export type QueueFilters = {
  type?: string
  /** `me`, `unassigned` or a staff user id. */
  assignee?: string
  /** A reference or its beginning, for example `HH-7K2`. */
  reference?: string
}

export type QueueItemView = {
  id: string
  type: string
  subjectType: string
  subjectId: string
  band: QueueBand
  reference: string | null
  status: string | null
  assignee: { id: string; name: string | null } | null
  openedAt: string
  dueAt: string | null
  clock: 'response_target' | null
  /** The first-response clock read now (TSK-0043): remaining, paused or overdue in business minutes. */
  responseClock: ResponseClockView | null
  reason: string
  /** The reason was replaced by the generic one: its detail is restricted to other roles. */
  masked: boolean
  action: QueueAction
  link: string
  version: number
}

type Cursor = [rank: number, due: string, opened: string, id: string]

function readCursor(after: unknown[] | undefined): Cursor | undefined {
  if (after === undefined) return undefined
  const [rank, due, opened, id] = after
  // The instants are PostgreSQL's text form of a timestamptz, as the cursor was built from it, with a date and time
  // that exist (isCursorInstant), so the casts in the query never fail.
  if (
    after.length === 4 &&
    typeof rank === 'number' &&
    Number.isInteger(rank) &&
    rank >= 1 &&
    rank <= QUEUE_BANDS.length &&
    (due === 'infinity' || isCursorInstant(due)) &&
    isCursorInstant(opened) &&
    typeof id === 'string' &&
    UUID.test(id)
  )
    return [rank, due as string, opened as string, id]
  throw new ApiError('VALIDATION_FAILED', {
    fieldErrors: [{ field: 'querystring.cursor', code: 'invalid', message: '' }],
  })
}

/** One page of a section for this staff member, in urgency order. */
export async function listQueue(
  db: Db,
  actor: StaffActor,
  section: QueueSection,
  filters: QueueFilters,
  page: PageRequest,
  now: Date = new Date(),
): Promise<Page<QueueItemView>> {
  const visible = visibleTypes(actor, section)
  const wanted = (ids: string[]) => (filters.type === undefined ? ids : ids.filter((id) => id === filters.type))
  const all = wanted(visible.all)
  const own = wanted(visible.own)
  if (all.length + own.length === 0) return { items: [], nextCursor: null }
  const cursor = readCursor(page.after)

  const rank = sql<number>`CASE
    WHEN q.due_at IS NOT NULL AND q.due_at <= ${now} AND q.band IN ('time_sensitive', 'other') THEN 3
    WHEN q.band = 'safety' THEN 1 WHEN q.band = 'today_change' THEN 2 WHEN q.band = 'time_sensitive' THEN 3
    ELSE 4 END`
  const dueKey = sql<string>`coalesce(q.due_at, 'infinity'::timestamptz)`

  let query = db
    .selectFrom('ops.queue_items as q')
    .leftJoin('identity.staff_users as s', 's.id', 'q.assigned_staff_id')
    .select([
      'q.id',
      'q.type',
      'q.subject_type',
      'q.subject_id',
      'q.band',
      'q.reference',
      'q.subject_status',
      'q.reason',
      'q.assigned_staff_id',
      's.display_name as assignee_name',
      'q.opened_at',
      'q.due_at',
      'q.version',
      rank.as('rank'),
      sql<string>`${dueKey}::text`.as('due_key'),
      sql<string>`q.opened_at::text`.as('opened_key'),
    ])
    .where('q.resolved_at', 'is', null)
    .where((eb) => {
      const scopes: Expression<SqlBool>[] = []
      if (all.length) scopes.push(eb('q.type', 'in', all))
      if (own.length) scopes.push(eb.and([eb('q.type', 'in', own), eb('q.assigned_staff_id', '=', actor.userId)]))
      return eb.or(scopes)
    })
  if (filters.assignee === 'me') query = query.where('q.assigned_staff_id', '=', actor.userId)
  else if (filters.assignee === 'unassigned') query = query.where('q.assigned_staff_id', 'is', null)
  else if (filters.assignee !== undefined) query = query.where('q.assigned_staff_id', '=', filters.assignee)
  if (filters.reference !== undefined)
    query = query.where('q.reference', 'like', `${filters.reference.toUpperCase().replace(/[%_\\]/g, '')}%`)
  if (cursor)
    query = query.where(
      sql<SqlBool>`(${rank}, ${dueKey}, q.opened_at, q.id) >
        (${cursor[0]}::int, ${cursor[1]}::timestamptz, ${cursor[2]}::timestamptz, ${cursor[3]}::uuid)`,
    )
  const rows = await query
    .orderBy(rank)
    .orderBy(dueKey)
    .orderBy('q.opened_at')
    .orderBy('q.id')
    .limit(page.limit + 1)
    .execute()

  const more = rows.length > page.limit
  const shown = rows.slice(0, page.limit)
  // The first-response clocks of the shown items that carry one (TSK-0043, HH-LEAD-05).
  const clockIds = shown
    .filter((r) => queueItemType(r.type)?.clock === 'response_target' && UUID.test(r.subject_id))
    .map((r) => r.subject_id)
  const clocks = new Map(
    clockIds.length
      ? (await db.selectFrom('intake.response_clocks').selectAll().where('request_id', 'in', clockIds).execute()).map(
          (c) => [c.request_id, c],
        )
      : [],
  )
  const items: QueueItemView[] = []
  for (const r of shown) {
    const type = queueItemType(r.type)
    // Defence in depth: a row the policy would not list is never returned.
    const listed =
      visible.all.includes(r.type) || (visible.own.includes(r.type) && r.assigned_staff_id === actor.userId)
    if (!type || type.section !== section || !listed || !mayList(actor, type.view, r.assigned_staff_id)) continue
    const masked =
      type.restricted !== undefined &&
      type.restricted.reasons.includes(r.reason) &&
      !mayList(actor, type.restricted.action, r.assigned_staff_id)
    const band = r.band as QueueBand
    items.push({
      id: r.id,
      type: r.type,
      subjectType: r.subject_type,
      subjectId: r.subject_id,
      band: QUEUE_BANDS[bandRank(band, r.due_at, now) - 1] ?? band,
      reference: r.reference,
      status: r.subject_status,
      assignee: r.assigned_staff_id ? { id: r.assigned_staff_id, name: r.assignee_name } : null,
      openedAt: r.opened_at.toISOString(),
      dueAt: r.due_at ? r.due_at.toISOString() : null,
      clock: type.clock ?? null,
      responseClock: (() => {
        const c = type.clock === 'response_target' ? clocks.get(r.subject_id) : undefined
        return c ? responseClockView(c, now) : null
      })(),
      reason: masked && type.restricted ? type.restricted.generic : r.reason,
      masked,
      action: type.action,
      link: deepLink(type, r.subject_id),
      version: r.version,
    })
  }
  const last = shown.at(-1)
  return {
    items,
    nextCursor: more && last ? encodeCursor([Number(last.rank), last.due_key, last.opened_key, last.id]) : null,
  }
}
