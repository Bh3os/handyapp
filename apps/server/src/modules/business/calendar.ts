// The internal business-day calendar on the Owner's Settings screen (TSK-0136; OWN-DEC-205, FACT-BUSINESS-CALENDAR,
// ENT-PolicyVersion, ENT-AuditEvent, RULE-SERVER-AUTHZ, RULE-HUMAN-REVIEW).
//   GET /staff/settings/business-calendar   the calendar in force with the observed holidays of this year and the next
//   PUT /staff/settings/business-calendar   the Owner changes it: a fresh sign-in, a reason and If-Match; a new audited
//                                            configuration version
// - The decided default (migration 0103) is Monday to Friday without the 11 US federal holidays on their observed
//   dates. The Owner may change the workdays, leave holidays out and add closed dates. A request's dates keep the
//   version they were counted with; a change applies to requests received afterwards.
// - Internal service targets only: the screen says the calendar never sets a statutory deadline (OWN-DEC-205).
import type { Db, Tx } from '@handyhub/db'
import {
  CALENDAR_WEEKDAYS,
  FEDERAL_HOLIDAYS,
  localDateOf,
  observedHolidays,
  type BusinessCalendar,
  type ObservedHoliday,
} from '@handyhub/domain'
import { sql } from 'kysely'
import { ApiError } from '../../api/errors.js'
import type { ApiContext, RouteDef } from '../../api/route.js'
import { loadConfig, recordPolicyVersion } from '../../platform/config/index.js'
import { FRESH_AUTH_MINUTES } from '../identity/sessions.js'

const TEST = 'test/integration/privacy-deadlines.test.ts'
/** At most this many extra closed dates (PROPOSED: the shape's own limit). */
export const CLOSED_DATES_MAX = 366
const SOURCES = ['FACT-BUSINESS-CALENDAR', 'OWN-DEC-205'] as const

export type BusinessCalendarSetting = {
  state: 'CONFIGURED' | 'NOT_CONFIGURED'
  version: number | null
  calendar: BusinessCalendar | null
  sourceIds: string[]
  /** The holidays observed this year and next (business time zone), as the server counts them. */
  observed: ObservedHoliday[]
}

export async function businessCalendarSetting(db: Db | Tx, now = new Date()): Promise<BusinessCalendarSetting> {
  const config = await loadConfig(db)
  const entry = config.get('business.calendar')
  const zone = config.get('business.timezone')
  const calendar =
    entry.state === 'CONFIGURED'
      ? {
          workdays: [...entry.value.workdays],
          holidays: [...entry.value.holidays],
          observance: entry.value.observance,
          closedDates: [...entry.value.closedDates].sort(),
        }
      : null
  const year = Number((zone.state === 'CONFIGURED' ? localDateOf(now, zone.value.zone) : now.toISOString()).slice(0, 4))
  return {
    state: entry.state,
    version: entry.version,
    calendar,
    sourceIds: [...entry.sourceIds],
    observed: calendar ? [...observedHolidays(calendar, year), ...observedHolidays(calendar, year + 1)] : [],
  }
}

const DAY = { type: 'string', format: 'date' } as const
const obj = (properties: Record<string, unknown>) =>
  ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties }) as const
const CALENDAR_FIELDS = {
  workdays: {
    type: 'array',
    minItems: 1,
    maxItems: 7,
    uniqueItems: true,
    items: { type: 'string', enum: [...CALENDAR_WEEKDAYS] },
  },
  holidays: {
    type: 'array',
    maxItems: FEDERAL_HOLIDAYS.length,
    uniqueItems: true,
    items: { type: 'string', enum: [...FEDERAL_HOLIDAYS] },
  },
  closedDates: { type: 'array', maxItems: CLOSED_DATES_MAX, uniqueItems: true, items: DAY },
} as const
const SETTING_SCHEMA = obj({
  state: { type: 'string', enum: ['CONFIGURED', 'NOT_CONFIGURED'] },
  version: { type: ['integer', 'null'] },
  calendar: {
    anyOf: [
      { type: 'null' },
      obj({ ...CALENDAR_FIELDS, observance: { type: 'string', enum: ['federal_weekend_rule'] } }),
    ],
  },
  sourceIds: { type: 'array', items: { type: 'string' } },
  observed: {
    type: 'array',
    items: obj({ holiday: { type: 'string', enum: [...FEDERAL_HOLIDAYS] }, date: DAY, observed: DAY }),
  },
})
const BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['workdays', 'holidays', 'closedDates', 'reason'],
  properties: { ...CALENDAR_FIELDS, reason: { type: 'string', minLength: 1, maxLength: 1000 } },
} as const

const auditable = (c: BusinessCalendar) => ({
  workdays: [...c.workdays],
  holidays: [...c.holidays],
  closedDates: [...c.closedDates],
})

function staffActor(ctx: ApiContext) {
  if (ctx.actor.kind !== 'staff') throw new ApiError('FORBIDDEN')
  return ctx.actor
}

export const CALENDAR_ROUTES: RouteDef[] = [
  {
    actors: ['staff'],
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'none',
    pagination: false,
    test: TEST,
    method: 'GET',
    path: '/staff/settings/business-calendar',
    operationId: 'getBusinessCalendar',
    summary: 'The internal business-day calendar',
    description:
      'The Owner (dashboard.view, PROPOSED: reading configuration, as the system configuration view). The calendar ' +
      'in force (business.calendar, OWN-DEC-205): the weekdays that are business days, the US federal holidays it excludes on their observed dates (Saturday: the Friday before; ' +
      'Sunday: the Monday after) and further closed dates, with the holidays observed this year and next as the ' +
      'server counts them. Internal service targets only (the substantive privacy acknowledgment); never a statutory ' +
      'deadline. ETag: the configuration version.',
    permission: 'dashboard.view',
    schema: { response: { 200: SETTING_SCHEMA } },
    handler: async (ctx) => {
      const body = await businessCalendarSetting(ctx.db)
      return { body, version: body.version ?? 0 }
    },
  },
  {
    actors: ['staff'],
    kind: 'write',
    idempotency: 'required',
    rateLimit: 'none',
    pagination: false,
    test: TEST,
    method: 'PUT',
    path: '/staff/settings/business-calendar',
    operationId: 'setBusinessCalendar',
    summary: 'Change the business-day calendar (Owner only)',
    description:
      'The Owner only (policy_values.change: a fresh sign-in within ' +
      `${FRESH_AUTH_MINUTES} minutes and a written reason), with If-Match: the configuration version shown. Records ` +
      'the next version of business.calendar: at least one workday, any of the 11 federal holidays, and up to ' +
      `${CLOSED_DATES_MAX} further closed dates. Requests already received keep the dates counted with the version ` +
      'they were received under; it applies to requests received afterwards. Audited with the old and new values.',
    permission: 'policy_values.change',
    freshAuthMinutes: FRESH_AUTH_MINUTES,
    expectedVersion: 'required',
    audit: 'business_settings.change_calendar',
    schema: { body: BODY, response: { 200: SETTING_SCHEMA } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staffActor(ctx)
      const body = ctx.req.body as {
        workdays: BusinessCalendar['workdays']
        holidays: BusinessCalendar['holidays']
        closedDates: string[]
        reason: string
      }
      const reason = body.reason.trim()
      if (reason === '')
        throw new ApiError('VALIDATION_FAILED', {
          fieldErrors: [{ field: 'body.reason', code: 'required', message: '' }],
        })
      // The same lock recordPolicyVersion takes, so the version compared is the one superseded.
      await sql`SELECT pg_advisory_xact_lock(hashtext(${'policy_version:business.calendar'}))`.execute(tx)
      const before = await businessCalendarSetting(tx)
      if (ctx.expectedVersion() !== (before.version ?? 0))
        throw new ApiError('STALE_VERSION', { current: { version: before.version ?? 0 } })
      // Stored in a fixed order, so the same calendar always reads the same.
      const value = {
        workdays: CALENDAR_WEEKDAYS.filter((d) => body.workdays.includes(d)),
        holidays: FEDERAL_HOLIDAYS.filter((h) => body.holidays.includes(h)),
        observance: 'federal_weekend_rule' as const,
        closedDates: [...body.closedDates].sort(),
      }
      const version = await recordPolicyVersion(tx, {
        key: 'business.calendar',
        value,
        sourceIds: SOURCES,
        changedBy: actor.userId,
        reason,
      })
      await ctx.audit({
        target: { type: 'policy_version', id: 'business.calendar', version },
        summary: {
          from: before.calendar ? auditable(before.calendar) : null,
          to: auditable(value),
          previousVersion: before.version,
        },
        reason,
        stepUpUsed: true,
      })
      return { body: await businessCalendarSetting(tx), version }
    },
  },
]
