// JSON schemas of the capacity routes (TSK-0062; HH-API-01, HH-ARC-04). Input objects refuse unknown fields; response
// objects list every field.
import { AVAILABILITY_LIMITS } from './availability.js'

const UUID = {
  type: 'string',
  pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
} as const
const DATE = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } as const
const CLOCK = { type: 'string', pattern: '^(([01]\\d|2[0-3]):[0-5]\\d|24:00)$' } as const
const NULLABLE_CLOCK = {
  anyOf: [{ type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' }, { type: 'null' }],
} as const
const NULLABLE_STRING = { type: ['string', 'null'] } as const
const INSTANT = { type: 'string', format: 'date-time' } as const
const SPAN = {
  type: 'object',
  additionalProperties: false,
  required: ['startsAt', 'endsAt'],
  properties: { startsAt: INSTANT, endsAt: INSTANT },
} as const

export const STAFF_PARAMS = {
  type: 'object',
  additionalProperties: false,
  required: ['staffUserId'],
  properties: { staffUserId: UUID },
} as const
export const TIME_OFF_PARAMS = {
  type: 'object',
  additionalProperties: false,
  required: ['timeOffId'],
  properties: { timeOffId: UUID },
} as const
export const EQUIPMENT_PARAMS = {
  type: 'object',
  additionalProperties: false,
  required: ['equipmentId'],
  properties: { equipmentId: UUID },
} as const
export const DAY_QUERY = {
  type: 'object',
  additionalProperties: false,
  required: ['date'],
  properties: { date: DATE },
} as const

export const WORKING_HOURS_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['periods'],
  properties: {
    periods: {
      type: 'array',
      maxItems: AVAILABILITY_LIMITS.periodsPerWeek,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['weekday', 'start', 'end'],
        properties: { weekday: { type: 'integer', minimum: 1, maximum: 7 }, start: CLOCK, end: CLOCK },
      },
    },
    reason: { type: 'string', maxLength: AVAILABILITY_LIMITS.reasonLength },
  },
} as const

export const TIME_OFF_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['startDate', 'endDate'],
  properties: { startDate: DATE, startTime: NULLABLE_CLOCK, endDate: DATE, endTime: NULLABLE_CLOCK },
} as const

export const EQUIPMENT_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['name'],
  properties: { name: { type: 'string', minLength: 1, maxLength: AVAILABILITY_LIMITS.equipmentNameLength } },
} as const

const ELIGIBLE = {
  type: 'object',
  additionalProperties: false,
  required: ['estimateVisits', 'workVisits'],
  properties: { estimateVisits: { type: 'boolean' }, workVisits: { type: 'boolean' } },
} as const

const SCHEDULE = {
  anyOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['version', 'timeZone', 'setAt', 'reason', 'periods'],
      properties: {
        version: { type: 'integer' },
        timeZone: { type: 'string' },
        setAt: INSTANT,
        reason: NULLABLE_STRING,
        periods: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['weekday', 'start', 'end'],
            properties: { weekday: { type: 'integer' }, start: { type: 'string' }, end: { type: 'string' } },
          },
        },
      },
    },
    { type: 'null' },
  ],
} as const

const ZONE = {
  anyOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['zone', 'proposed'],
      properties: { zone: { type: 'string' }, proposed: { type: 'boolean' } },
    },
    { type: 'null' },
  ],
} as const

export const AVAILABILITY = {
  type: 'object',
  additionalProperties: false,
  required: ['businessTimeZone', 'workers', 'equipment'],
  properties: {
    businessTimeZone: ZONE,
    workers: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'name', 'status', 'roles', 'eligibleFor', 'schedule', 'timeOff'],
        properties: {
          id: { type: 'string' },
          name: NULLABLE_STRING,
          status: { type: 'string' },
          roles: { type: 'array', items: { type: 'string' } },
          eligibleFor: ELIGIBLE,
          schedule: SCHEDULE,
          timeOff: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['id', 'startsAt', 'endsAt', 'timeZone', 'recordedAt'],
              properties: {
                id: { type: 'string' },
                startsAt: INSTANT,
                endsAt: INSTANT,
                timeZone: { type: 'string' },
                recordedAt: INSTANT,
              },
            },
          },
        },
      },
    },
    equipment: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'name', 'createdAt'],
        properties: { id: { type: 'string' }, name: { type: 'string' }, createdAt: INSTANT },
      },
    },
  },
} as const

/** A write's answer: the availability view and how many upcoming reservations it flagged for review. */
export const AVAILABILITY_CHANGE = {
  type: 'object',
  additionalProperties: false,
  required: ['flagged', 'availability'],
  properties: { flagged: { type: 'integer' }, availability: AVAILABILITY },
} as const

const RESERVATION = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'visitId',
    'projectId',
    'purpose',
    'visitState',
    'kind',
    'role',
    'startsAt',
    'endsAt',
    'holdExpiresAt',
    'flags',
  ],
  properties: {
    id: { type: 'string' },
    visitId: { type: 'string' },
    projectId: { type: 'string' },
    purpose: { type: 'string' },
    visitState: { type: 'string' },
    kind: { type: 'string', enum: ['hold', 'confirmed'] },
    role: NULLABLE_STRING,
    startsAt: INSTANT,
    endsAt: INSTANT,
    holdExpiresAt: { anyOf: [INSTANT, { type: 'null' }] },
    flags: { type: 'array', items: { type: 'string' } },
  },
} as const

export const CAPACITY_DAY = {
  type: 'object',
  additionalProperties: false,
  required: ['date', 'timeZone', 'timeZoneProposed', 'visitHours', 'workers', 'equipment'],
  properties: {
    date: { type: 'string' },
    timeZone: { type: 'string' },
    timeZoneProposed: { type: 'boolean' },
    visitHours: {
      anyOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['open', 'close', 'periods'],
          properties: { open: { type: 'string' }, close: { type: 'string' }, periods: { type: 'array', items: SPAN } },
        },
        { type: 'null' },
      ],
    },
    workers: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'id',
          'name',
          'roles',
          'eligibleFor',
          'scheduleVersion',
          'working',
          'timeOff',
          'reservations',
          'free',
        ],
        properties: {
          id: { type: 'string' },
          name: NULLABLE_STRING,
          roles: { type: 'array', items: { type: 'string' } },
          eligibleFor: ELIGIBLE,
          scheduleVersion: { type: ['integer', 'null'] },
          working: { type: 'array', items: SPAN },
          timeOff: { type: 'array', items: SPAN },
          reservations: { type: 'array', items: RESERVATION },
          free: { type: 'array', items: SPAN },
        },
      },
    },
    equipment: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'name', 'reservations', 'free'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          reservations: { type: 'array', items: RESERVATION },
          free: { type: 'array', items: SPAN },
        },
      },
    },
  },
} as const
