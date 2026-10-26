// Repeat-service module (TSK-0114; HH-SCH-10, C11, T67, OWN-DEC-113, OWN-DEC-148, RULE-SERVER-AUTHZ). See series.ts
// (the customer-agreed schedule) and reminders.ts (its staff-released reminders).
//   GET  /staff/projects/:projectId/repeat-service                                  the project's schedules
//   POST /staff/projects/:projectId/repeat-service                                  record the schedule the customer agreed to
//   POST /staff/repeat-service/:seriesId/actions/change                             change it (the customer's agreement)
//   POST /staff/repeat-service/:seriesId/actions/stop                               stop it (the customer's wish)
//   POST /staff/repeat-service/:seriesId/occurrences/:date/skip                     skip an occurrence
//   POST /staff/repeat-service/:seriesId/occurrences/:date/link                     link the request that carries it
//   POST /staff/repeat-service/:seriesId/reminders/:deliveryId/release              release a prepared reminder
//   POST /staff/repeat-service/:seriesId/reminders/:deliveryId/cancel               decide not to send it
//   GET  /customer/projects/:reference/repeat-service                               the customer's schedule
//   POST /customer/projects/:reference/repeat-service/change                        change the next date or interval
//   POST /customer/projects/:reference/repeat-service/reminders                     reminders on or off
//   POST /customer/projects/:reference/repeat-service/stop                          stop the schedule
// Every write is decided by the policy (service_series.manage: the Owner, Office P; service_series.change: the
// customer of a project their session opens, V; message.release_draft for the reminders: the Owner, Office), runs in
// one transaction with its idempotency key and records its audit event with identifiers and codes only.
import type { Tx } from '@handyhub/db'
import {
  REPEAT_REMINDER_BLOCKS,
  SERIES_AGREEMENT_SOURCES,
  SERIES_CHANGES,
  SERIES_INTERVAL_LIMITS,
  SERIES_UNITS,
  type SeriesInterval,
} from '@handyhub/domain'
import { dataScope, type StaffActor } from '@handyhub/policy'
import { ApiError } from '../../api/errors.js'
import type { ApiContext, ApiModule, RouteDef } from '../../api/route.js'
import { loadConfig } from '../../platform/config/index.js'
import { projectIdOf } from '../access/projects.js'
import { allows } from '../closeout/store.js'
import { findProject, PROJECT_REPEAT_SERVICE } from '../records/index.js'
import {
  cancelRepeatReminder,
  reminderTimeConfigured,
  reminderWordingReady,
  releaseRepeatReminder,
  remindersView,
  repeatReminderAutomation,
  syncRepeatReminders,
  type ReminderView,
} from './reminders.js'
import {
  agreedViaOf,
  changeNoticeHours,
  changeSeries,
  linkOccurrence,
  projectFacts,
  projectSeries,
  recordSeries,
  requestedOccurrences,
  seriesHistory,
  seriesRow,
  setSeriesReminders,
  skipOccurrence,
  stopSeries,
  SERIES_LIMITS,
  upcomingView,
  type ChangeView,
  type RecordInput,
  type SeriesActor,
  type SeriesRow,
  type UpcomingView,
} from './series.js'

export {
  repeatReminderAutomation,
  repeatReminderFailureItem,
  repeatReminderRecordCheck,
  repeatReminderValues,
  syncProjectRepeatReminders,
  syncRepeatReminders,
} from './reminders.js'

/** The automations of the repeat-service module. */
export function repeatServiceAutomations() {
  return [repeatReminderAutomation()]
}

const TEST = 'test/integration/repeat-service.test.ts'

/** PROPOSED (no owner value, OQ-REPEAT-SERVICE-DETAILS): customer changes per client network and hour. */
export const CUSTOMER_SCHEDULE_RATE_LIMIT = {
  bucket: 'customer-repeat-service',
  limit: 60,
  windowSeconds: 3600,
} as const

const UUID = {
  type: 'string',
  pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
} as const
const LOCAL_DATE = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } as const
const STRING = { type: 'string' } as const
const NULLABLE_STRING = { type: ['string', 'null'] } as const
const DATE_TIME = { type: 'string', format: 'date-time' } as const
const NULLABLE_DATE_TIME = { type: ['string', 'null'], format: 'date-time' } as const
const object = (properties: Record<string, unknown>) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
})
const INTERVAL = {
  anyOf: [
    { type: 'null' },
    object({
      unit: { type: 'string', enum: [...SERIES_UNITS] },
      count: { type: 'integer', minimum: 1, maximum: Math.max(...Object.values(SERIES_INTERVAL_LIMITS)) },
    }),
  ],
} as const
const AGREED_VIA = { type: 'string', enum: [...SERIES_AGREEMENT_SOURCES] } as const
const NOTE = { type: ['string', 'null'], maxLength: SERIES_LIMITS.note + 100 } as const
const PROJECT_PARAMS = object({ projectId: UUID })
const SERIES_PARAMS = object({ seriesId: UUID })
const OCCURRENCE_PARAMS = object({ seriesId: UUID, date: LOCAL_DATE })
const DELIVERY_PARAMS = object({ seriesId: UUID, deliveryId: UUID })
const CUSTOMER_PARAMS = object({ reference: { type: 'string', minLength: 1, maxLength: 40 } })

const SERIES_VIEW = object({
  id: STRING,
  state: { type: 'string', enum: ['active', 'stopped'] },
  version: { type: 'integer' },
  nextDate: STRING,
  interval: INTERVAL,
  reminders: { type: 'boolean' },
  agreedVia: AGREED_VIA,
  recordedAt: DATE_TIME,
  stoppedAt: NULLABLE_DATE_TIME,
  stoppedBy: { type: ['string', 'null'], enum: ['staff', 'customer', null] },
  upcoming: {
    type: 'array',
    items: object({
      date: STRING,
      state: { type: 'string', enum: ['scheduled', 'kept', 'skipped', 'requested'] },
      requestReference: NULLABLE_STRING,
    }),
  },
  requested: { type: 'array', items: object({ date: STRING, requestId: STRING, reference: STRING }) },
  reminderDrafts: {
    type: 'array',
    items: object({
      id: STRING,
      date: STRING,
      state: { type: 'string', enum: ['draft', 'queued', 'sent', 'delivered', 'failed', 'suppressed', 'cancelled'] },
      reason: NULLABLE_STRING,
      scheduledAt: NULLABLE_DATE_TIME,
      sentAt: NULLABLE_DATE_TIME,
      cancelledAt: NULLABLE_DATE_TIME,
      createdAt: DATE_TIME,
    }),
  },
  history: {
    type: 'array',
    items: object({
      version: { type: 'integer' },
      change: { type: 'string', enum: [...SERIES_CHANGES] },
      by: object({
        kind: { type: 'string', enum: ['staff', 'customer'] },
        id: NULLABLE_STRING,
        name: NULLABLE_STRING,
      }),
      nextDate: STRING,
      interval: INTERVAL,
      reminders: { type: 'boolean' },
      occurrenceDate: NULLABLE_STRING,
      keptDates: { type: 'array', items: STRING },
      agreedVia: { type: ['string', 'null'], enum: [...SERIES_AGREEMENT_SOURCES, null] },
      note: NULLABLE_STRING,
      at: DATE_TIME,
    }),
  },
})
const VIEW = object({
  projectId: STRING,
  projectReference: STRING,
  zone: NULLABLE_STRING,
  changeNoticeHours: { type: ['integer', 'null'] },
  reminderTime: { type: 'string', enum: ['CONFIGURED', 'NOT_CONFIGURED'] },
  reminderWording: { type: 'string', enum: ['CONFIGURED', 'NOT_CONFIGURED'] },
  reminderBlocks: { type: 'array', items: { type: 'string', enum: [...REPEAT_REMINDER_BLOCKS] } },
  schedules: { type: 'array', items: SERIES_VIEW },
  actions: object({ record: { type: 'boolean' }, manage: { type: 'boolean' }, releaseReminders: { type: 'boolean' } }),
})

export type SeriesView = {
  id: string
  state: 'active' | 'stopped'
  version: number
  nextDate: string
  interval: SeriesInterval
  reminders: boolean
  agreedVia: string
  recordedAt: string
  stoppedAt: string | null
  stoppedBy: 'staff' | 'customer' | null
  upcoming: UpcomingView[]
  requested: { date: string; requestId: string; reference: string }[]
  reminderDrafts: ReminderView[]
  history: ChangeView[]
}

export type RepeatServiceView = {
  projectId: string
  projectReference: string
  zone: string | null
  changeNoticeHours: number | null
  reminderTime: 'CONFIGURED' | 'NOT_CONFIGURED'
  reminderWording: 'CONFIGURED' | 'NOT_CONFIGURED'
  /** Every reason a reminder may be stopped or held (labels for the screen). */
  reminderBlocks: string[]
  schedules: SeriesView[]
  actions: { record: boolean; manage: boolean; releaseReminders: boolean }
}

async function seriesView(db: ApiContext['db'] | Tx, s: SeriesRow, zone: string | null): Promise<SeriesView> {
  return {
    id: s.id,
    state: s.state,
    version: s.version,
    nextDate: s.anchor_date,
    interval: s.interval_unit && s.interval_count ? { unit: s.interval_unit, count: s.interval_count } : null,
    reminders: s.reminders,
    agreedVia: s.agreed_via,
    recordedAt: new Date(s.created_at).toISOString(),
    stoppedAt: s.stopped_at ? new Date(s.stopped_at).toISOString() : null,
    stoppedBy: s.stopped_by,
    upcoming: s.state === 'active' && zone ? await upcomingView(db, s, zone, SERIES_LIMITS.upcoming) : [],
    requested: (await requestedOccurrences(db, s.id)).map((r) => ({
      date: r.date,
      requestId: r.requestId,
      reference: r.reference,
    })),
    reminderDrafts: await remindersView(db, s),
    history: await seriesHistory(db, s.id),
  }
}

/** One project's repeat-service schedules for the staff screen; null when there is no such project. */
export async function repeatServiceView(
  db: ApiContext['db'] | Tx,
  actor: StaffActor,
  projectId: string,
): Promise<RepeatServiceView | null> {
  const facts = await projectFacts(db, projectId)
  if (!facts) return null
  const config = await loadConfig(db)
  const zone = facts.time_zone
  const series = await projectSeries(db, projectId)
  const manage = allows(actor, 'service_series.manage', projectId)
  return {
    projectId,
    projectReference: facts.project_reference,
    zone,
    changeNoticeHours: changeNoticeHours(config),
    reminderTime: reminderTimeConfigured(config) ? 'CONFIGURED' : 'NOT_CONFIGURED',
    reminderWording: (await reminderWordingReady(db)) ? 'CONFIGURED' : 'NOT_CONFIGURED',
    reminderBlocks: [...REPEAT_REMINDER_BLOCKS],
    schedules: await Promise.all(series.map((s) => seriesView(db, s, zone))),
    actions: {
      record: manage && zone !== null && !series.some((s) => s.state === 'active'),
      manage,
      releaseReminders: allows(actor, 'message.release_draft', projectId),
    },
  }
}

/** The customer's view of the project's schedule: the active one, else the latest stopped one, else none. */
async function customerSchedule(db: ApiContext['db'] | Tx, projectId: string, reference: string) {
  const [s] = await projectSeries(db, projectId)
  const facts = await projectFacts(db, projectId)
  const zone = facts?.time_zone ?? null
  const config = await loadConfig(db)
  const upcoming =
    s && s.state === 'active' && zone ? await upcomingView(db, s, zone, SERIES_LIMITS.customerUpcoming) : []
  return PROJECT_REPEAT_SERVICE.project({
    reference,
    schedule: s
      ? {
          state: s.state,
          nextDates: upcoming.map((u) => ({ date: u.date, requested: u.state === 'requested' })),
          interval: s.interval_unit && s.interval_count ? { unit: s.interval_unit, count: s.interval_count } : null,
          reminders: s.reminders,
          changeNoticeHours: changeNoticeHours(config),
          stoppedAt: s.stopped_at ? new Date(s.stopped_at) : null,
        }
      : null,
  })
}

const staffActor = (ctx: ApiContext) => {
  if (ctx.actor.kind !== 'staff') throw new ApiError('FORBIDDEN')
  return ctx.actor
}

const projectFactsOf: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { projectId } = req.params as { projectId: string }
  return (await projectFacts(db, projectId)) ? { projectId } : null
}
const seriesFacts: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { seriesId } = req.params as { seriesId: string }
  const s = await seriesRow(db, seriesId)
  return s ? { projectId: s.project_id } : null
}
const customerProject: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const id = await projectIdOf(db, (req.params as { reference: string }).reference)
  return id ? { projectId: id } : null
}

const common = { actors: ['staff'], rateLimit: 'none', pagination: false, test: TEST } as const
const write = { ...common, method: 'POST', kind: 'write', idempotency: 'required', expectedVersion: 'none' } as const

/** The staff view after a write, in its transaction. */
async function viewOf(ctx: ApiContext, tx: Tx, projectId: string): Promise<RepeatServiceView> {
  const view = await repeatServiceView(tx, staffActor(ctx), projectId)
  if (!view) throw new ApiError('NOT_FOUND')
  return view
}

const staffBy = (ctx: ApiContext, body: { agreedVia?: string; note?: string | null }): SeriesActor => {
  const note = (body.note ?? '').trim()
  if (note.length > SERIES_LIMITS.note)
    throw new ApiError('VALIDATION_FAILED', { fieldErrors: [{ field: 'body.note', code: 'TOO_LONG', message: '' }] })
  return {
    kind: 'staff',
    actor: staffActor(ctx),
    agreedVia: body.agreedVia === undefined ? null : agreedViaOf(body.agreedVia),
    note: note === '' ? null : note,
  }
}

export function repeatServiceModule(): ApiModule {
  const view: RouteDef = {
    ...common,
    method: 'GET',
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    audit: 'none',
    resource: projectFactsOf,
    path: '/staff/projects/:projectId/repeat-service',
    operationId: 'getProjectRepeatService',
    summary: "A project's customer-agreed repeat-service schedules",
    description:
      'The Owner and Office (service_series.manage). The schedule the customer agreed to (the next service date and ' +
      'how often, in the property’s zone; whether they want reminders; how staff heard the agreement) and the earlier ' +
      'stopped ones: the next occurrences (scheduled, kept inside the change notice, skipped, or requested with the ' +
      'request that carries it), the reminder drafts with why each waits, stopped or failed, and the history of ' +
      'every change by staff or the customer. Whether the reminder time (the opening of contact hours, PROPOSED) and ' +
      'its wording are configured: the wording is NOT CONFIGURED until the Owner releases it, so no reminder can be ' +
      'released. NOT_FOUND when there is no such project.',
    permission: 'service_series.manage',
    schema: { params: PROJECT_PARAMS, response: { 200: VIEW } },
    handler: async (ctx) => {
      const { projectId } = ctx.req.params as { projectId: string }
      const v = await repeatServiceView(ctx.db, staffActor(ctx), projectId)
      if (!v) throw new ApiError('NOT_FOUND')
      return { body: v }
    },
  }

  const record: RouteDef = {
    ...write,
    resource: projectFactsOf,
    path: '/staff/projects/:projectId/repeat-service',
    operationId: 'recordRepeatService',
    summary: 'Record the repeat-service schedule the customer agreed to',
    description:
      'The Owner or Office (service_series.manage), only when the customer agreed to one (customerAgreed must be ' +
      'true: VALIDATION_FAILED CUSTOMER_AGREEMENT_REQUIRED). The next service date (a local date of the property’s ' +
      'zone, today or later), how often when the customer agreed to a repeat (every 1-366 days, 1-52 weeks or 1-24 ' +
      'months, PROPOSED limits; null: one date), whether they want reminders, and how staff heard the agreement. ' +
      'CONFLICT PROPERTY_ZONE_UNKNOWN while the property’s zone is unknown; SERIES_ACTIVE while the project has one ' +
      '(change it instead). Each occurrence becomes a new request with its own records, through every gate of a new ' +
      'request; nothing is copied. Reminder drafts follow the schedule for staff to release. Audited (never the ' +
      'note). Returns the view.',
    permission: 'service_series.manage',
    audit: 'repeat_service.record',
    schema: {
      params: PROJECT_PARAMS,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['nextDate', 'interval', 'reminders', 'agreedVia', 'customerAgreed'],
        properties: {
          nextDate: LOCAL_DATE,
          interval: INTERVAL,
          reminders: { type: 'boolean' },
          agreedVia: AGREED_VIA,
          customerAgreed: { type: 'boolean' },
          note: NOTE,
        },
      },
      response: { 201: VIEW },
    },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const { projectId } = ctx.req.params as { projectId: string }
      const s = await recordSeries(tx, staffActor(ctx), projectId, ctx.req.body as RecordInput)
      await syncRepeatReminders(tx, s.id)
      await ctx.audit({
        target: { type: 'service_series', id: s.id, version: s.version },
        summary: { projectId, interval: s.interval_unit ?? 'none', reminders: s.reminders, agreedVia: s.agreed_via },
      })
      return { status: 201, body: await viewOf(ctx, tx, projectId) }
    },
  }

  const change: RouteDef = {
    ...write,
    expectedVersion: 'required',
    resource: seriesFacts,
    path: '/staff/repeat-service/:seriesId/actions/change',
    operationId: 'changeRepeatService',
    summary: 'Record a change the customer agreed to',
    description:
      'The Owner or Office (service_series.manage), with If-Match the schedule’s version: the new next date, how ' +
      'often, and whether the customer wants reminders, with how staff heard the agreement. The new next date must ' +
      'start more than repeat_service.change_notice hours away (OWN-DEC-148: 24; VALIDATION_FAILED ' +
      'WITHIN_CHANGE_NOTICE); the current schedule’s occurrences inside the notice keep their dates (with their ' +
      'reminder, request and any visit, which follows the cancellation rules). Reminder drafts for dates no longer ' +
      'on the schedule are cancelled. CONFLICT SERIES_STOPPED. Audited. Returns the view.',
    permission: 'service_series.manage',
    audit: 'repeat_service.change',
    schema: {
      params: SERIES_PARAMS,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['nextDate', 'interval', 'reminders', 'agreedVia'],
        properties: {
          nextDate: LOCAL_DATE,
          interval: INTERVAL,
          reminders: { type: 'boolean' },
          agreedVia: AGREED_VIA,
          note: NOTE,
        },
      },
      response: { 200: VIEW },
    },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const { seriesId } = ctx.req.params as { seriesId: string }
      const b = ctx.req.body as { nextDate: string; interval: SeriesInterval; reminders: boolean; agreedVia: string }
      const out = await changeSeries(tx, staffBy(ctx, b), seriesId, ctx.expectedVersion(), b)
      await syncRepeatReminders(tx, seriesId)
      await ctx.audit({
        target: { type: 'service_series', id: seriesId, version: out.series.version },
        summary: { projectId: out.series.project_id, kept: out.kept.length, reminders: out.series.reminders },
      })
      const v = await viewOf(ctx, tx, out.series.project_id)
      return { body: v, version: out.series.version }
    },
  }

  const stop: RouteDef = {
    ...write,
    expectedVersion: 'required',
    resource: seriesFacts,
    path: '/staff/repeat-service/:seriesId/actions/stop',
    operationId: 'stopRepeatService',
    summary: 'Stop the schedule as the customer asked',
    description:
      'The Owner or Office (service_series.manage), with If-Match the schedule’s version and how staff heard the ' +
      'customer’s wish: the schedule and its reminders stop at once (waiting drafts are cancelled). A request already ' +
      'sent for an occurrence stays its own request; its appointment is rescheduled or cancelled the usual way. ' +
      'CONFLICT SERIES_STOPPED. Audited. Returns the view.',
    permission: 'service_series.manage',
    audit: 'repeat_service.stop',
    schema: {
      params: SERIES_PARAMS,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['agreedVia'],
        properties: { agreedVia: AGREED_VIA, note: NOTE },
      },
      response: { 200: VIEW },
    },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const { seriesId } = ctx.req.params as { seriesId: string }
      const s = await stopSeries(tx, staffBy(ctx, ctx.req.body as object), seriesId, ctx.expectedVersion())
      await syncRepeatReminders(tx, seriesId)
      await ctx.audit({
        target: { type: 'service_series', id: seriesId, version: s.version },
        summary: { projectId: s.project_id, by: 'staff' },
      })
      return { body: await viewOf(ctx, tx, s.project_id), version: s.version }
    },
  }

  const skip: RouteDef = {
    ...write,
    expectedVersion: 'required',
    resource: seriesFacts,
    path: '/staff/repeat-service/:seriesId/occurrences/:date/skip',
    operationId: 'skipRepeatServiceOccurrence',
    summary: 'Skip an occurrence the customer asked to skip',
    description:
      'The Owner or Office (service_series.manage), with If-Match the schedule’s version: an upcoming occurrence (on ' +
      'the schedule or kept) gets no reminder and no request; the schedule goes on. CONFLICT NOT_AN_OCCURRENCE, ' +
      'OCCURRENCE_REQUESTED, OCCURRENCE_PASSED, SERIES_STOPPED. Audited. Returns the view.',
    permission: 'service_series.manage',
    audit: 'repeat_service.skip',
    schema: {
      params: OCCURRENCE_PARAMS,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['agreedVia'],
        properties: { agreedVia: AGREED_VIA, note: NOTE },
      },
      response: { 200: VIEW },
    },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const { seriesId, date } = ctx.req.params as { seriesId: string; date: string }
      const by = staffBy(ctx, ctx.req.body as object) as Extract<SeriesActor, { kind: 'staff' }>
      const s = await skipOccurrence(tx, by, seriesId, ctx.expectedVersion(), date)
      await syncRepeatReminders(tx, seriesId)
      await ctx.audit({
        target: { type: 'service_series', id: seriesId, version: s.version },
        summary: { projectId: s.project_id, date },
      })
      return { body: await viewOf(ctx, tx, s.project_id), version: s.version }
    },
  }

  const link: RouteDef = {
    ...write,
    expectedVersion: 'required',
    resource: seriesFacts,
    path: '/staff/repeat-service/:seriesId/occurrences/:date/link',
    operationId: 'linkRepeatServiceOccurrence',
    summary: 'Link the new request that carries an occurrence',
    description:
      'The Owner or Office (service_series.manage), with If-Match the schedule’s version: the request the customer ' +
      'sent for this occurrence (by its reference). It stays a new request with its own records, prices, discounts, ' +
      'verification and consent, through every gate of a new request; the link only shows which occurrence it ' +
      'carries, and the occurrence’s reminder is no longer needed. CONFLICT NOT_THE_SAME_CUSTOMER (the request’s ' +
      'contact email or phone is not the schedule’s, and it was not sent again from the schedule’s project or one ' +
      'of its occurrences, PROPOSED), SAME_PROJECT, REQUEST_ALREADY_LINKED, NOT_AN_OCCURRENCE, ' +
      'OCCURRENCE_REQUESTED, SERIES_STOPPED; VALIDATION_FAILED body.requestReference NOT_FOUND. Audited. Returns the ' +
      'view.',
    permission: 'service_series.manage',
    audit: 'repeat_service.link',
    schema: {
      params: OCCURRENCE_PARAMS,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['requestReference'],
        properties: { requestReference: { type: 'string', minLength: 1, maxLength: 40 } },
      },
      response: { 200: VIEW },
    },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const { seriesId, date } = ctx.req.params as { seriesId: string; date: string }
      const { requestReference } = ctx.req.body as { requestReference: string }
      const by = { kind: 'staff' as const, actor: staffActor(ctx), agreedVia: null, note: null }
      const out = await linkOccurrence(tx, by, seriesId, ctx.expectedVersion(), date, requestReference)
      await syncRepeatReminders(tx, seriesId)
      await ctx.audit({
        target: { type: 'service_series', id: seriesId, version: out.series.version },
        summary: { projectId: out.series.project_id, date, requestId: out.requestId },
      })
      return { body: await viewOf(ctx, tx, out.series.project_id), version: out.series.version }
    },
  }

  const release: RouteDef = {
    ...write,
    resource: seriesFacts,
    path: '/staff/repeat-service/:seriesId/reminders/:deliveryId/release',
    operationId: 'releaseRepeatServiceReminder',
    summary: 'Release a prepared repeat-service reminder',
    description:
      'The Owner or Office (message.release_draft): sent by the send job at its release time and rechecked then (a ' +
      'date the customer no longer wants a reminder for cancels it; an open case puts it back as a held draft; an ' +
      'opt-out of optional follow-ups or a missing channel permission suppresses it). CONFLICT NOT_A_DRAFT, ' +
      'TEMPLATE_NOT_CONFIGURED (the wording is NOT CONFIGURED until the Owner releases it), CASE_ACTIVE, ' +
      'FOLLOW_UPS_OPTED_OUT, NO_EMAIL_ADDRESS and the stop reasons. Audited. Returns the view.',
    permission: 'message.release_draft',
    audit: 'repeat_service.reminder_release',
    schema: { params: DELIVERY_PARAMS, body: { type: 'object', additionalProperties: false }, response: { 200: VIEW } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const { seriesId, deliveryId } = ctx.req.params as { seriesId: string; deliveryId: string }
      const out = await releaseRepeatReminder(tx, staffActor(ctx), seriesId, deliveryId)
      const s = (await seriesRow(tx, seriesId)) as SeriesRow
      await ctx.audit({
        target: { type: 'message_delivery', id: out.deliveryId },
        summary: { seriesId, sendAt: out.runAt.toISOString() },
      })
      return { body: await viewOf(ctx, tx, s.project_id) }
    },
  }

  const cancel: RouteDef = {
    ...write,
    resource: seriesFacts,
    path: '/staff/repeat-service/:seriesId/reminders/:deliveryId/cancel',
    operationId: 'cancelRepeatServiceReminder',
    summary: 'Decide not to send a prepared repeat-service reminder',
    description:
      'The Owner or Office (message.release_draft): the draft is kept as cancelled (dismissed), never sent and never ' +
      'prepared again for its date. CONFLICT NOT_A_DRAFT. Audited. Returns the view.',
    permission: 'message.release_draft',
    audit: 'repeat_service.reminder_cancel',
    schema: { params: DELIVERY_PARAMS, body: { type: 'object', additionalProperties: false }, response: { 200: VIEW } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const { seriesId, deliveryId } = ctx.req.params as { seriesId: string; deliveryId: string }
      const out = await cancelRepeatReminder(tx, staffActor(ctx), seriesId, deliveryId)
      const s = (await seriesRow(tx, seriesId)) as SeriesRow
      await ctx.audit({ target: { type: 'message_delivery', id: out.deliveryId }, summary: { seriesId } })
      return { body: await viewOf(ctx, tx, s.project_id) }
    },
  }

  // ------------------------------------------------------------------------------------------------ customer
  const customerBase = {
    actors: ['customer'],
    pagination: false,
    test: TEST,
    resource: customerProject,
    projection: PROJECT_REPEAT_SERVICE,
  } as const
  /** The project in scope and its active schedule (NOT_FOUND without one: there is nothing to change or stop). */
  const activeOf = async (ctx: ApiContext) => {
    const db = ctx.tx ?? ctx.db
    const p = await findProject(db, ctx.scope, { reference: (ctx.req.params as { reference: string }).reference })
    if (!p) throw new ApiError('NOT_FOUND')
    const s = (await projectSeries(db, p.id)).find((x) => x.state === 'active')
    return { project: p, series: s ?? null }
  }

  const customerView: RouteDef = {
    ...customerBase,
    method: 'GET',
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'none',
    path: '/customer/projects/:reference/repeat-service',
    operationId: 'getCustomerRepeatService',
    summary: 'My repeat-service schedule',
    description:
      'For a project the caller’s session opens (request.view, customer V): the schedule the customer agreed to, ' +
      'its next dates in the property’s zone (each with whether its request was sent), how often, whether reminders ' +
      'are on, and the notice a change needs (OWN-DEC-148); the latest stopped one when none runs; null when there ' +
      'is none. Never how staff heard the agreement, a staff note or the reminder drafts. Any other project is ' +
      'NOT_FOUND (T19); TSK-0118: so is a project an organization member reaches (the schedule stays the ' +
      'customer’s own).',
    permission: 'request.view',
    schema: { params: CUSTOMER_PARAMS, response: { 200: PROJECT_REPEAT_SERVICE.schema } },
    handler: async (ctx) => {
      // TSK-0118 (HH-ID-13): the schedule is the project customer's own agreement, read inside the scope of the row
      // that changes it (service_series.change), so an organization member, whatever their privileges, finds it
      // NOT_FOUND like the changes themselves; the project's own customer reaches the same projects as before.
      const scope = dataScope(ctx.actor, 'service_series.change', new Date())
      const p = await findProject(ctx.db, scope, { reference: (ctx.req.params as { reference: string }).reference })
      if (!p) throw new ApiError('NOT_FOUND')
      return { body: await customerSchedule(ctx.db, p.id, p.reference) }
    },
  }

  const customerWrite = {
    ...customerBase,
    method: 'POST',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'none',
    rateLimit: CUSTOMER_SCHEDULE_RATE_LIMIT,
    permission: 'service_series.change',
  } as const

  const customerChange: RouteDef = {
    ...customerWrite,
    path: '/customer/projects/:reference/repeat-service/change',
    operationId: 'changeCustomerRepeatService',
    summary: 'Change my repeat-service schedule',
    description:
      'The customer of a project their session opens (service_series.change, V): the new next date (a local date of ' +
      'the property’s zone) and how often (null: that one date). The new next date must start more than the change ' +
      'notice away (OWN-DEC-148: 24 hours; VALIDATION_FAILED WITHIN_CHANGE_NOTICE); a date of the current schedule ' +
      'inside the notice keeps its date, and an appointment then follows the cancellation rules. NOT_FOUND without ' +
      'an active schedule. Audited. Returns the schedule.',
    audit: 'repeat_service.customer_change',
    schema: {
      params: CUSTOMER_PARAMS,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['nextDate', 'interval'],
        properties: { nextDate: LOCAL_DATE, interval: INTERVAL },
      },
      response: { 200: PROJECT_REPEAT_SERVICE.schema },
    },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const { project, series } = await activeOf(ctx)
      if (!series) throw new ApiError('NOT_FOUND')
      const b = ctx.req.body as { nextDate: string; interval: SeriesInterval }
      const out = await changeSeries(tx, { kind: 'customer' }, series.id, null, {
        nextDate: b.nextDate,
        interval: b.interval,
      })
      await syncRepeatReminders(tx, series.id)
      await ctx.audit({
        target: { type: 'service_series', id: series.id, version: out.series.version },
        summary: { project: project.reference, kept: out.kept.length },
      })
      return { body: await customerSchedule(tx, project.id, project.reference) }
    },
  }

  const customerReminders: RouteDef = {
    ...customerWrite,
    path: '/customer/projects/:reference/repeat-service/reminders',
    operationId: 'setCustomerRepeatReminders',
    summary: 'Turn my repeat-service reminders on or off',
    description:
      'The customer of a project their session opens (service_series.change, V): off cancels any reminder waiting ' +
      'for staff at once; on prepares the next ones on the schedule again. The schedule itself goes on. NOT_FOUND ' +
      'without an active schedule. Audited. Returns the schedule.',
    audit: 'repeat_service.customer_reminders',
    schema: {
      params: CUSTOMER_PARAMS,
      body: { type: 'object', additionalProperties: false, required: ['on'], properties: { on: { type: 'boolean' } } },
      response: { 200: PROJECT_REPEAT_SERVICE.schema },
    },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const { project, series } = await activeOf(ctx)
      if (!series) throw new ApiError('NOT_FOUND')
      const { on } = ctx.req.body as { on: boolean }
      const out = await setSeriesReminders(tx, { kind: 'customer' }, series.id, null, on)
      await syncRepeatReminders(tx, series.id)
      await ctx.audit({
        target: { type: 'service_series', id: series.id, version: out.series.version },
        summary: { project: project.reference, reminders: on, changed: out.changed },
      })
      return { body: await customerSchedule(tx, project.id, project.reference) }
    },
  }

  const customerStop: RouteDef = {
    ...customerWrite,
    path: '/customer/projects/:reference/repeat-service/stop',
    operationId: 'stopCustomerRepeatService',
    summary: 'Stop my repeat-service schedule',
    description:
      'The customer of a project their session opens (service_series.change, V): the schedule and its reminders stop ' +
      'at once. A request already sent for an occurrence stays its own; an appointment is rescheduled or cancelled ' +
      'the usual way (within 24 hours, the cancellation rules apply). NOT_FOUND without an active schedule. ' +
      'Audited. Returns the schedule.',
    audit: 'repeat_service.customer_stop',
    schema: {
      params: CUSTOMER_PARAMS,
      body: { type: 'object', additionalProperties: false, properties: {} },
      response: { 200: PROJECT_REPEAT_SERVICE.schema },
    },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const { project, series } = await activeOf(ctx)
      if (!series) throw new ApiError('NOT_FOUND')
      const s = await stopSeries(tx, { kind: 'customer' }, series.id, null)
      await syncRepeatReminders(tx, series.id)
      await ctx.audit({
        target: { type: 'service_series', id: series.id, version: s.version },
        summary: { project: project.reference, by: 'customer' },
      })
      return { body: await customerSchedule(tx, project.id, project.reference) }
    },
  }

  return {
    name: 'repeat-service',
    routes: [
      view,
      record,
      change,
      stop,
      skip,
      link,
      release,
      cancel,
      customerView,
      customerChange,
      customerReminders,
      customerStop,
    ],
  }
}
