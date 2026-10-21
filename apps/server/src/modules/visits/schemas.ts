// JSON schemas of the staff visit routes (TSK-0061; HH-API-01, HH-ARC-04). Input objects refuse unknown fields;
// response objects list every field.
import { VISIT_PURPOSES, VISIT_STATES } from '@handyhub/domain'
import { OFFER_LIMITS } from './offers.js'
import { CONFIRM_LIMITS, VISIT_LIMITS } from './visits.js'

const UUID = {
  type: 'string',
  pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
} as const

export const PROJECT_PARAMS = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId'],
  properties: { projectId: UUID },
} as const

export const VISIT_PARAMS = {
  type: 'object',
  additionalProperties: false,
  required: ['visitId'],
  properties: { visitId: UUID },
} as const

const DATE = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } as const
const CLOCK = { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' } as const
const OFFSET = { anyOf: [{ type: 'string', pattern: '^[+-]\\d{2}:\\d{2}$' }, { type: 'null' }] } as const
const minutes = (max: number, min = 0) => ({
  anyOf: [{ type: 'integer', minimum: min, maximum: max }, { type: 'null' }],
})

const WINDOW_FIELDS = {
  localDate: DATE,
  windowStart: CLOCK,
  windowEnd: CLOCK,
  startOffset: OFFSET,
  endOffset: OFFSET,
} as const

export const NEW_VISIT_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['purpose', 'localDate', 'windowStart', 'windowEnd'],
  properties: {
    purpose: { type: 'string', enum: [...VISIT_PURPOSES] },
    ...WINDOW_FIELDS,
    expectedDurationMinutes: minutes(VISIT_LIMITS.durationMinutes, 1),
    preparationBufferMinutes: minutes(VISIT_LIMITS.bufferMinutes),
    travelBufferMinutes: minutes(VISIT_LIMITS.bufferMinutes),
    requiredWorkers: minutes(VISIT_LIMITS.workers, 1),
    equipment: {
      type: 'array',
      maxItems: VISIT_LIMITS.equipmentItems,
      items: { type: 'string', minLength: 1, maxLength: VISIT_LIMITS.equipmentLength },
    },
  },
} as const

export const WINDOW_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['localDate', 'windowStart', 'windowEnd'],
  properties: {
    ...WINDOW_FIELDS,
    reason: { type: 'string', maxLength: VISIT_LIMITS.reasonLength },
  },
} as const

export const CONFIRM_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['workerIds'],
  properties: {
    workerIds: { type: 'array', minItems: 1, maxItems: CONFIRM_LIMITS.workers, items: UUID },
    equipmentIds: { type: 'array', maxItems: CONFIRM_LIMITS.equipment, items: UUID },
    reason: { type: 'string', maxLength: VISIT_LIMITS.reasonLength },
  },
} as const

// TSK-0063: offering windows (HH-SCH-11). The number of windows is the configured policy's (scheduling.window_offers),
// checked by the server; the schema only bounds it.
export const OFFER_PARAMS = {
  type: 'object',
  additionalProperties: false,
  required: ['offerId'],
  properties: { offerId: UUID },
} as const

export const OFFER_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['windows', 'workerIds'],
  properties: {
    windows: {
      type: 'array',
      minItems: 1,
      maxItems: OFFER_LIMITS.windows,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['localDate', 'windowStart', 'windowEnd'],
        properties: WINDOW_FIELDS,
      },
    },
    workerIds: { type: 'array', minItems: 1, maxItems: CONFIRM_LIMITS.workers, items: UUID },
    equipmentIds: { type: 'array', maxItems: CONFIRM_LIMITS.equipment, items: UUID },
    preparationInstructions: { type: 'string', maxLength: OFFER_LIMITS.instructions },
  },
} as const

export const WITHDRAW_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['reason'],
  properties: { reason: { type: 'string', minLength: 1, maxLength: OFFER_LIMITS.reason } },
} as const

const NULLABLE_STRING = { type: ['string', 'null'] } as const
const NULLABLE_INT = { type: ['integer', 'null'] } as const
const STAFF_REF = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'name'],
  properties: { id: { type: 'string' }, name: NULLABLE_STRING },
} as const

const WINDOW = {
  type: 'object',
  additionalProperties: false,
  required: [
    'localDate',
    'start',
    'end',
    'timeZone',
    'startOffset',
    'endOffset',
    'startsAt',
    'endsAt',
    'withinVisitHours',
  ],
  properties: {
    localDate: { type: 'string' },
    start: { type: 'string' },
    end: { type: 'string' },
    timeZone: { type: 'string' },
    startOffset: { type: 'string' },
    endOffset: { type: 'string' },
    startsAt: { type: 'string', format: 'date-time' },
    endsAt: { type: 'string', format: 'date-time' },
    withinVisitHours: { type: ['boolean', 'null'] },
  },
} as const

const SPAN = {
  type: 'object',
  additionalProperties: false,
  required: ['startsAt', 'endsAt'],
  properties: { startsAt: { type: 'string', format: 'date-time' }, endsAt: { type: 'string', format: 'date-time' } },
} as const

const NOTICE = {
  type: 'object',
  additionalProperties: false,
  required: ['messageKey', 'channel', 'state', 'errorCode'],
  properties: {
    messageKey: { type: 'string' },
    channel: { type: 'string' },
    state: { type: 'string' },
    errorCode: NULLABLE_STRING,
  },
} as const

const OFFERED_WINDOW = {
  type: 'object',
  additionalProperties: false,
  required: ['localDate', 'start', 'end', 'timeZone', 'startsAt', 'endsAt'],
  properties: {
    localDate: { type: 'string' },
    start: { type: 'string' },
    end: { type: 'string' },
    timeZone: { type: 'string' },
    startsAt: { type: 'string', format: 'date-time' },
    endsAt: { type: 'string', format: 'date-time' },
  },
} as const

const OFFER = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'number',
    'state',
    'held',
    'version',
    'offeredBy',
    'offeredAt',
    'expiresAt',
    'holdHours',
    'preparationInstructions',
    'windows',
    'selectedPosition',
    'closedAt',
    'closedBy',
    'closedReason',
    'customerNote',
    'noticeKey',
    'notices',
    'actions',
  ],
  properties: {
    id: { type: 'string' },
    number: { type: 'integer' },
    state: { type: 'string', enum: ['open', 'selected', 'expired', 'withdrawn', 'other_times_requested'] },
    held: { type: 'boolean' },
    version: { type: 'integer' },
    offeredBy: STAFF_REF,
    offeredAt: { type: 'string', format: 'date-time' },
    expiresAt: { type: 'string', format: 'date-time' },
    holdHours: { type: 'integer' },
    preparationInstructions: NULLABLE_STRING,
    windows: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['position', 'window', 'reservedRange'],
        properties: { position: { type: 'integer' }, window: OFFERED_WINDOW, reservedRange: SPAN },
      },
    },
    selectedPosition: NULLABLE_INT,
    closedAt: { type: ['string', 'null'] },
    closedBy: { anyOf: [STAFF_REF, { type: 'null' }] },
    closedReason: NULLABLE_STRING,
    customerNote: NULLABLE_STRING,
    noticeKey: NULLABLE_STRING,
    notices: { type: 'array', items: NOTICE },
    actions: {
      type: 'object',
      additionalProperties: false,
      required: ['withdraw'],
      properties: { withdraw: { type: 'boolean' } },
    },
  },
} as const

const VISIT = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'purpose',
    'state',
    'version',
    'jobId',
    'window',
    'windowVersion',
    'expectedDurationMinutes',
    'preparationBufferMinutes',
    'travelBufferMinutes',
    'requiredWorkers',
    'equipment',
    'reservedRange',
    'assignments',
    'createdBy',
    'createdAt',
    'history',
    'offers',
    'notices',
    'confirmationBlockers',
    'actions',
  ],
  properties: {
    id: { type: 'string' },
    purpose: { type: 'string', enum: [...VISIT_PURPOSES] },
    state: { type: 'string', enum: [...VISIT_STATES] },
    version: { type: 'integer' },
    jobId: NULLABLE_STRING,
    window: WINDOW,
    windowVersion: { type: 'integer' },
    expectedDurationMinutes: NULLABLE_INT,
    preparationBufferMinutes: NULLABLE_INT,
    travelBufferMinutes: NULLABLE_INT,
    requiredWorkers: NULLABLE_INT,
    equipment: { type: 'array', items: { type: 'string' } },
    reservedRange: {
      anyOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['startsAt', 'endsAt'],
          properties: {
            startsAt: { type: 'string', format: 'date-time' },
            endsAt: { type: 'string', format: 'date-time' },
          },
        },
        { type: 'null' },
      ],
    },
    assignments: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'id',
          'resource',
          'worker',
          'equipment',
          'role',
          'kind',
          'startsAt',
          'endsAt',
          'holdExpiresAt',
          'endedAt',
          'endedReason',
          'flags',
          'offerNumber',
          'offerPosition',
        ],
        properties: {
          id: { type: 'string' },
          resource: { type: 'string', enum: ['worker', 'equipment'] },
          worker: { anyOf: [STAFF_REF, { type: 'null' }] },
          equipment: {
            anyOf: [
              {
                type: 'object',
                additionalProperties: false,
                required: ['id', 'name'],
                properties: { id: { type: 'string' }, name: { type: 'string' } },
              },
              { type: 'null' },
            ],
          },
          role: NULLABLE_STRING,
          kind: { type: 'string', enum: ['hold', 'confirmed'] },
          startsAt: { type: 'string', format: 'date-time' },
          endsAt: { type: 'string', format: 'date-time' },
          holdExpiresAt: { type: ['string', 'null'] },
          endedAt: { type: ['string', 'null'] },
          endedReason: NULLABLE_STRING,
          flags: { type: 'array', items: { type: 'string' } },
          offerNumber: NULLABLE_INT,
          offerPosition: NULLABLE_INT,
        },
      },
    },
    createdBy: STAFF_REF,
    createdAt: { type: 'string', format: 'date-time' },
    history: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['windowVersion', 'window', 'visitState', 'setBy', 'setAt', 'reason'],
        properties: {
          windowVersion: { type: 'integer' },
          window: WINDOW,
          visitState: { type: 'string' },
          setBy: STAFF_REF,
          setAt: { type: 'string', format: 'date-time' },
          reason: NULLABLE_STRING,
        },
      },
    },
    offers: { type: 'array', items: OFFER },
    notices: { type: 'array', items: NOTICE },
    // TSK-0064 (HH-SCH-06): for a tentative visit, what still stops its confirmation now (empty: nothing; the team's
    // capacity is checked when staff confirm); null for a visit that is not tentative.
    confirmationBlockers: {
      anyOf: [
        {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['field', 'code'],
            properties: { field: { type: 'string' }, code: { type: 'string' } },
          },
        },
        { type: 'null' },
      ],
    },
    actions: {
      type: 'object',
      additionalProperties: false,
      required: ['changeWindow', 'confirm', 'offerWindows'],
      properties: {
        changeWindow: { type: 'boolean' },
        confirm: { type: 'boolean' },
        offerWindows: { type: 'boolean' },
      },
    },
  },
} as const

export const PROJECT_VISITS = {
  type: 'object',
  additionalProperties: false,
  required: [
    'projectId',
    'projectState',
    'timeZone',
    'businessTimeZone',
    'visitHours',
    'windowOffers',
    'job',
    'schedulingTask',
    'actions',
    'visits',
  ],
  properties: {
    projectId: { type: 'string' },
    projectState: { type: 'string' },
    timeZone: { type: 'string' },
    businessTimeZone: {
      anyOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['zone', 'proposed'],
          properties: { zone: { type: 'string' }, proposed: { type: 'boolean' } },
        },
        { type: 'null' },
      ],
    },
    visitHours: {
      anyOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['open', 'close'],
          properties: { open: { type: 'string' }, close: { type: 'string' } },
        },
        { type: 'null' },
      ],
    },
    windowOffers: {
      anyOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['holdHours', 'minWindows', 'maxWindows', 'proposed'],
          properties: {
            holdHours: { type: 'integer' },
            minWindows: { type: 'integer' },
            maxWindows: { type: 'integer' },
            proposed: { type: 'boolean' },
          },
        },
        { type: 'null' },
      ],
    },
    job: {
      anyOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'scopeVersion'],
          properties: { id: { type: 'string' }, scopeVersion: NULLABLE_INT },
        },
        { type: 'null' },
      ],
    },
    schedulingTask: {
      anyOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['state'],
          properties: { state: { type: 'string' } },
        },
        { type: 'null' },
      ],
    },
    actions: {
      type: 'object',
      additionalProperties: false,
      required: ['planEstimateVisit', 'planWorkVisit'],
      properties: { planEstimateVisit: { type: 'boolean' }, planWorkVisit: { type: 'boolean' } },
    },
    visits: { type: 'array', items: VISIT },
  },
} as const
