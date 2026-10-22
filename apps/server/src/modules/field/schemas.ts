// JSON schemas of the My Day, tap and timestamp routes (TSK-0070; HH-API-01, HH-ARC-04). Input objects refuse unknown
// fields; response objects list every field, so nothing else (an access code above all) can reach a response.
import { ACKNOWLEDGMENT_STATES, MY_DAY_NEXT, STAMP_STATUSES, TIME_STAMP_KINDS } from '@handyhub/domain'

const UUID = {
  type: 'string',
  pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
} as const
const STR = { type: 'string' } as const
const STR_OR_NULL = { type: ['string', 'null'] } as const
const INT = { type: 'integer' } as const
const INT_OR_NULL = { type: ['integer', 'null'] } as const
const BOOL = { type: 'boolean' } as const
const TIME = { type: 'string', format: 'date-time' } as const
const TIME_OR_NULL = { type: ['string', 'null'], format: 'date-time' } as const
const DATE = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } as const

function obj(properties: Record<string, unknown>, nullable = false) {
  return {
    type: nullable ? ['object', 'null'] : 'object',
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  } as const
}
const arr = (items: unknown) => ({ type: 'array', items }) as const

export const VISIT_PARAMS = obj({ visitId: UUID })

/** A tap: optionally the device's own clock at the tap (kept beside the server's time, never instead of it). */
export const TAP_BODY = {
  type: 'object',
  additionalProperties: false,
  properties: { deviceRecordedAt: TIME },
} as const

const WINDOW = obj({ localDate: STR, start: STR, end: STR, timeZone: STR, startsAt: TIME, endsAt: TIME })
const DETAIL = obj({ detail: STR, value: STR_OR_NULL, source: STR, confirmedAt: TIME })
const ADDRESS = obj({ street: STR, unit: STR_OR_NULL, city: STR, state: STR, zip: STR }, true)

export const MY_DAY_ITEM = obj({
  visitId: STR,
  number: INT,
  purpose: STR,
  state: STR,
  version: INT,
  projectReference: STR,
  jobId: STR_OR_NULL,
  assignment: { type: 'string', enum: ['confirmed', 'hold'] },
  role: STR,
  window: WINDOW,
  team: arr(obj({ name: STR_OR_NULL, role: STR })),
  address: ADDRESS,
  directionsUrl: STR_OR_NULL,
  accessNotes: arr(DETAIL),
  preparation: obj({ customerPreparation: STR_OR_NULL, instructions: STR_OR_NULL }),
  readiness: obj(
    {
      packetVersion: INT,
      lastViewedVersion: INT_OR_NULL,
      changedSinceViewed: BOOL,
      criticalSinceViewed: BOOL,
      // TSK-0072: the caller's own packet acknowledgment.
      acknowledgment: { type: 'string', enum: [...ACKNOWLEDGMENT_STATES] },
      blockers: arr(obj({ code: STR, count: INT })),
    },
    true,
  ),
  mine: obj({ departedAt: TIME_OR_NULL, arrivedAt: TIME_OR_NULL, finishedAt: TIME_OR_NULL }),
  next: { type: 'string', enum: [...MY_DAY_NEXT] },
  onMyWayOpensAt: TIME_OR_NULL,
  actions: obj({ onMyWay: BOOL, arrived: BOOL, finished: BOOL }),
})

export const MY_DAY = obj({
  checkedAt: TIME,
  onMyWay: obj({
    state: { type: 'string', enum: ['configured', 'not_configured'] },
    earliestMinutesBefore: INT_OR_NULL,
  }),
  visits: arr(MY_DAY_ITEM),
})

export const TAP_RESULT = obj({ recorded: BOOL, visit: MY_DAY_ITEM })

const CORRECTION = obj({
  correctedAt: TIME,
  previousAt: TIME_OR_NULL,
  reason: STR,
  correctedBy: STR_OR_NULL,
  createdAt: TIME,
})
const STAMP = obj({
  status: { type: 'string', enum: [...STAMP_STATUSES] },
  at: TIME_OR_NULL,
  recordedAt: TIME_OR_NULL,
  deviceRecordedAt: TIME_OR_NULL,
  corrections: arr(CORRECTION),
})

export const VISIT_TIMES = obj({
  visitId: STR,
  number: INT,
  purpose: STR,
  state: STR,
  version: INT,
  projectReference: STR,
  window: WINDOW,
  dayEnded: BOOL,
  workers: arr(
    obj({
      staffUserId: STR,
      name: STR_OR_NULL,
      role: STR_OR_NULL,
      assigned: BOOL,
      departedAt: TIME_OR_NULL,
      arrived: STAMP,
      finished: STAMP,
      durationMinutes: INT_OR_NULL,
      flagged: BOOL,
    }),
  ),
  actions: obj({ correct: BOOL, export: BOOL }),
})

export const CORRECTION_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['staffUserId', 'kind', 'at', 'reason'],
  properties: {
    staffUserId: UUID,
    kind: { type: 'string', enum: [...TIME_STAMP_KINDS] },
    at: TIME,
    reason: { type: 'string', minLength: 1, maxLength: 500 },
  },
} as const

/** An export: the range of visit dates and the reason the accounting export rule asks for. */
export const EXPORT_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['from', 'to', 'reason'],
  properties: { from: DATE, to: DATE, reason: { type: 'string', minLength: 1, maxLength: 500 } },
} as const

export const EXPORT_FILE = obj({
  filename: STR,
  contentType: { type: 'string', enum: ['text/csv'] },
  rows: INT,
  csv: STR,
})
