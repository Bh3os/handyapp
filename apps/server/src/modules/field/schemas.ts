// JSON schemas of the My Day, tap and timestamp routes (TSK-0070; HH-API-01, HH-ARC-04). Input objects refuse unknown
// fields; response objects list every field, so nothing else (an access code above all) can reach a response.
import {
  ACKNOWLEDGMENT_STATES,
  MY_DAY_NEXT,
  OFFLINE_ACTIONS,
  OFFLINE_CHECKLIST_EVENTS,
  STAMP_STATUSES,
  TIME_STAMP_KINDS,
  VISIT_OUTCOME_KINDS,
  VISIT_OUTCOME_NOTE_MAX,
} from '@handyhub/domain'

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
  // TSK-0128 (HH-PKT-08, OWN-DEC-171): the general service area (city and state) of a confirmed visit, the visit-day
  // access (the visit's own local day or an Owner extension) and, while it is open, the customer's first name only.
  serviceArea: obj({ city: STR, state: STR }, true),
  visitDay: obj({
    open: BOOL,
    basis: { type: ['string', 'null'], enum: ['visit_day', 'extension', null] },
    endsAt: TIME_OR_NULL,
    opensAt: TIME_OR_NULL,
  }),
  customer: obj({ firstName: STR_OR_NULL }),
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
  // TSK-0078: the outcomes recorded on this visit.
  outcomes: arr(
    obj({
      outcomeId: STR,
      kind: { type: 'string', enum: [...VISIT_OUTCOME_KINDS] },
      recordedAt: TIME,
      followedUp: BOOL,
    }),
  ),
  actions: obj({ onMyWay: BOOL, arrived: BOOL, finished: BOOL, recordOutcome: BOOL }),
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

// TSK-0078: visit outcomes and their follow-up.
const OUTCOME_KIND = { type: 'string', enum: [...VISIT_OUTCOME_KINDS] } as const
const NOTE = { type: 'string', minLength: 1, maxLength: VISIT_OUTCOME_NOTE_MAX, pattern: '\\S' } as const
export const OUTCOME_PARAMS = obj({ outcomeId: UUID })
export const OUTCOME_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'note'],
  properties: { kind: OUTCOME_KIND, note: NOTE },
} as const
export const OUTCOME_RESULT = obj({
  outcomeId: STR,
  visitId: STR,
  kind: OUTCOME_KIND,
  visitState: STR,
  recordedAt: TIME,
  // The visit as the caller's My Day shows it now; null once it left My Day (no access).
  visit: { anyOf: [{ type: 'null' }, MY_DAY_ITEM] },
})
const STAFF_REF = obj({ id: STR, name: STR_OR_NULL })
export const OUTCOME_VIEW = obj({
  outcomeId: STR,
  visitId: STR,
  reference: STR,
  kind: OUTCOME_KIND,
  note: STR,
  visitState: STR,
  visitNow: STR,
  localDate: STR,
  recordedBy: STAFF_REF,
  recordedAt: TIME,
  followUp: { anyOf: [{ type: 'null' }, obj({ by: STAFF_REF, at: TIME, note: STR })] },
  actions: obj({ followUp: BOOL }),
})
export const FOLLOW_UP_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['note'],
  properties: { note: NOTE },
} as const

// TSK-0080 (HH-OFF-05, HH-OFF-06): one field event a phone uploads, and what the server did with it.
const FIELD_EVENT_TYPE = {
  type: 'string',
  enum: ['tap_on_my_way', 'tap_arrived', 'tap_finished', 'checklist_step'],
} as const
const FIELD_EVENT_STATE = { type: 'string', enum: ['synchronized', 'needs_review', 'reviewed'] } as const
const FIELD_EVENT_OUTCOME = {
  type: 'string',
  enum: ['applied', 'already_recorded', 'conflict', 'not_assigned', 'recovered'],
} as const
export const FIELD_EVENT_PARAMS = obj({ clientId: UUID })
export const FIELD_EVENT_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['clientId', 'type', 'visitId', 'deviceRecordedAt'],
  properties: {
    clientId: UUID,
    type: FIELD_EVENT_TYPE,
    visitId: UUID,
    actorId: UUID,
    baseVersion: { type: 'integer', minimum: 1 },
    deviceRecordedAt: TIME,
    attempt: { type: 'integer', minimum: 1, maximum: 10000 },
    // TSK-0115: the checklist step a checklist_step event records (the online route's body, with its event).
    step: {
      type: 'object',
      additionalProperties: false,
      required: ['workPackageId', 'stepId', 'event', 'version'],
      properties: {
        workPackageId: UUID,
        stepId: { type: 'string', pattern: '^[1-6]\\.[0-9]{1,3}$' },
        event: { type: 'string', enum: OFFLINE_CHECKLIST_EVENTS },
        version: { type: 'integer', minimum: 0 },
        measurement: { type: 'string', maxLength: 200 },
        note: { type: 'string', maxLength: 2000 },
        photoIds: { type: 'array', items: UUID, maxItems: 20 },
      },
    },
  },
} as const
export const FIELD_EVENT_RESULT = obj({
  clientId: STR,
  state: FIELD_EVENT_STATE,
  outcome: FIELD_EVENT_OUTCOME,
  detail: STR_OR_NULL,
  visitId: STR,
  receivedAt: TIME,
  ingested: BOOL,
})
export const FIELD_EVENT_VIEW = obj({
  clientId: STR,
  type: FIELD_EVENT_TYPE,
  visitId: STR,
  reference: STR,
  localDate: STR,
  visitState: STR,
  recordedBy: STAFF_REF,
  uploadedBy: STAFF_REF,
  deviceRecordedAt: TIME,
  receivedAt: TIME,
  attempts: INT,
  state: FIELD_EVENT_STATE,
  outcome: FIELD_EVENT_OUTCOME,
  detail: STR_OR_NULL,
  // TSK-0115: the checklist step a checklist_step event names (null for a tap).
  step: {
    anyOf: [
      { type: 'null' },
      obj({
        workPackageId: STR,
        stepId: STR,
        event: STR,
        version: INT,
        measurement: STR_OR_NULL,
        note: STR_OR_NULL,
        photoIds: arr(STR),
      }),
    ],
  },
  review: { anyOf: [{ type: 'null' }, obj({ by: STAFF_REF, at: TIME, note: STR })] },
  actions: obj({ review: BOOL }),
})
export const FIELD_EVENT_REVIEW_BODY = FOLLOW_UP_BODY

// TSK-0115 (HH-OFF-08): the offline actions the Owner turned on, and the change.
export const OFFLINE_ACTIONS_SETTING = obj({
  version: INT,
  actions: arr({ type: 'string', enum: OFFLINE_ACTIONS }),
  available: arr({ type: 'string', enum: OFFLINE_ACTIONS }),
  changedAt: TIME,
  reason: STR_OR_NULL,
})
export const OFFLINE_ACTIONS_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['actions', 'reason'],
  properties: {
    actions: { type: 'array', items: { type: 'string', enum: OFFLINE_ACTIONS }, uniqueItems: true },
    reason: { type: 'string', minLength: 1, maxLength: 1000, pattern: '\\S' },
  },
} as const
