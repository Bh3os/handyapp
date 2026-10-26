// JSON schemas of the staff visit routes (TSK-0061; HH-API-01, HH-ARC-04). Input objects refuse unknown fields;
// response objects list every field.
import {
  ADDRESS_PROBLEMS,
  CANCELLATION_INITIATORS,
  CANCELLATION_OUTCOMES,
  CUSTOMER_CIRCUMSTANCES,
  FOLLOW_UP_BASES,
  HANDYHUB_CAUSES,
  PREPARATION_BASES,
  PREPARATION_MAX_LENGTH,
  PREPARATION_RULES,
  SITE_CONTACT_AUTHORITIES,
  SITE_CONTACT_DESIGNATIONS,
  STAFF_DETAIL_SOURCES,
  VISIT_PURPOSES,
  VISIT_STATES,
  WINDOW_OFFER_STATES,
} from '@handyhub/domain'
import { AUTHORIZATION_LIMITS } from './authorizations.js'
import { BOARD_VIEWS } from './board.js'
import { CHANGE_KINDS, CHANGE_LIMITS, REQUEST_KINDS } from './changes.js'
import { OFFER_LIMITS } from './offers.js'
import { SITE_CONTACT_LIMITS } from './site-checks.js'
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

// TSK-0066 (HH-SCH-07): who initiated a change of a booked visit, and HandyHub's cause.
const INITIATION_FIELDS = {
  initiator: { type: 'string', enum: [...CANCELLATION_INITIATORS] },
  handyhubCause: { type: 'string', enum: [...HANDYHUB_CAUSES] },
} as const

export const WINDOW_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['localDate', 'windowStart', 'windowEnd'],
  properties: {
    ...WINDOW_FIELDS,
    // Required (REASON_REQUIRED) when the visit is confirmed: a reschedule records its reason (TSK-0066).
    reason: { type: 'string', maxLength: VISIT_LIMITS.reasonLength },
    ...INITIATION_FIELDS,
    changeRequestId: UUID,
  },
} as const

export const REASSIGN_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['workerIds', 'reason'],
  properties: {
    workerIds: { type: 'array', minItems: 1, maxItems: CONFIRM_LIMITS.workers, items: UUID },
    equipmentIds: { type: 'array', maxItems: CONFIRM_LIMITS.equipment, items: UUID },
    reason: { type: 'string', maxLength: CHANGE_LIMITS.reason },
  },
} as const

export const CANCEL_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['reason'],
  properties: {
    reason: { type: 'string', maxLength: CHANGE_LIMITS.reason },
    ...INITIATION_FIELDS,
    changeRequestId: UUID,
    // TSK-0140 (OWN-DEC-161): why a customer's cancellation is not charged automatically, and the Owner's waiver.
    circumstance: { type: 'string', enum: [...CUSTOMER_CIRCUMSTANCES] },
    feeWaiver: {
      type: 'object',
      additionalProperties: false,
      required: ['feeCents', 'reason'],
      properties: {
        feeCents: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
        reason: { type: 'string', maxLength: CHANGE_LIMITS.waiverReason },
      },
    },
  },
} as const

export const REQUEST_PARAMS = {
  type: 'object',
  additionalProperties: false,
  required: ['requestId'],
  properties: { requestId: UUID },
} as const

export const DECLINE_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['reason'],
  properties: { reason: { type: 'string', maxLength: CHANGE_LIMITS.reason } },
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
    // TSK-0145 (OWN-DEC-194 B1): save as a draft only (nothing held, no clock); otherwise published at once.
    draft: { type: 'boolean' },
    // TSK-0145 (B4): publishing over the visit's open offer replaces it, with this reason.
    replaceReason: { type: 'string', minLength: 1, maxLength: OFFER_LIMITS.reason },
  },
} as const

/** TSK-0145 (B1, B4): publish a draft offer; over an open offer it is a replacement and needs the reason. */
export const PUBLISH_BODY = {
  type: 'object',
  additionalProperties: false,
  properties: { replaceReason: { type: 'string', minLength: 1, maxLength: OFFER_LIMITS.reason } },
} as const

export const DISCARD_BODY = { type: 'object', additionalProperties: false, properties: {} } as const

/** TSK-0145 (OWN-DEC-193 A1, OWN-DEC-208): the Owner's hazard-evaluation inspection authorization. */
export const INSPECTION_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['qualifiedPerson', 'qualification', 'safetyConditions', 'reason'],
  properties: {
    qualifiedPerson: { type: 'string', minLength: 1, maxLength: AUTHORIZATION_LIMITS.person },
    qualification: { type: 'string', minLength: 1, maxLength: AUTHORIZATION_LIMITS.qualification },
    safetyConditions: { type: 'string', minLength: 1, maxLength: AUTHORIZATION_LIMITS.conditions },
    reason: { type: 'string', minLength: 1, maxLength: AUTHORIZATION_LIMITS.reason },
  },
} as const

/** TSK-0145 (OWN-DEC-193 A4): the recorded basis of a follow-up visit on a completed job. */
export const FOLLOW_UP_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['basis', 'note'],
  properties: {
    basis: { type: 'string', enum: [...FOLLOW_UP_BASES] },
    note: { type: 'string', minLength: 1, maxLength: AUTHORIZATION_LIMITS.note },
    returnWorkId: UUID,
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
    'publishedBy',
    'publishedAt',
    'expiresAt',
    'holdHours',
    'preparationInstructions',
    'preparationBasis',
    'windows',
    'team',
    'selectedPosition',
    'closedAt',
    'closedBy',
    'closedReason',
    'replacedByNumber',
    'customerNote',
    'noticeKey',
    'notices',
    'actions',
  ],
  properties: {
    id: { type: 'string' },
    // TSK-0145: null for a draft (numbered when published).
    number: NULLABLE_INT,
    state: { type: 'string', enum: [...WINDOW_OFFER_STATES] },
    held: { type: 'boolean' },
    version: { type: 'integer' },
    offeredBy: STAFF_REF,
    offeredAt: { type: 'string', format: 'date-time' },
    // TSK-0145 (B1): the publication the hold runs from, and its exact end; null for a draft.
    publishedBy: { anyOf: [STAFF_REF, { type: 'null' }] },
    publishedAt: { type: ['string', 'null'] },
    expiresAt: { type: ['string', 'null'] },
    holdHours: { type: 'integer' },
    preparationInstructions: NULLABLE_STRING,
    // TSK-0146 (OWN-DEC-194 B7): how the instructions stand against the defaults they started from (null before 0123).
    preparationBasis: { type: ['string', 'null'], enum: [...PREPARATION_BASES, null] },
    windows: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['position', 'window', 'reservedRange'],
        properties: { position: { type: 'integer' }, window: OFFERED_WINDOW, reservedRange: SPAN },
      },
    },
    team: {
      anyOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['workerIds', 'equipmentIds'],
          properties: {
            workerIds: { type: 'array', items: { type: 'string' } },
            equipmentIds: { type: 'array', items: { type: 'string' } },
          },
        },
        { type: 'null' },
      ],
    },
    selectedPosition: NULLABLE_INT,
    closedAt: { type: ['string', 'null'] },
    closedBy: { anyOf: [STAFF_REF, { type: 'null' }] },
    closedReason: NULLABLE_STRING,
    replacedByNumber: NULLABLE_INT,
    customerNote: NULLABLE_STRING,
    noticeKey: NULLABLE_STRING,
    notices: { type: 'array', items: NOTICE },
    actions: {
      type: 'object',
      additionalProperties: false,
      required: ['withdraw', 'publish', 'discard'],
      properties: { withdraw: { type: 'boolean' }, publish: { type: 'boolean' }, discard: { type: 'boolean' } },
    },
  },
} as const

const OUTCOME = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'noticeMinutes', 'keptCents', 'refundCents', 'invoiceCents'],
  properties: {
    kind: { type: 'string', enum: [...CANCELLATION_OUTCOMES] },
    noticeMinutes: { type: 'integer' },
    keptCents: NULLABLE_INT,
    refundCents: NULLABLE_INT,
    invoiceCents: NULLABLE_INT,
  },
} as const

const CHANGE_REQUEST = {
  anyOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'kind', 'state', 'version', 'requestedAt', 'reason', 'preferredTimes', 'outcome', 'actions'],
      properties: {
        id: { type: 'string' },
        kind: { type: 'string', enum: [...REQUEST_KINDS] },
        state: { type: 'string', enum: ['open'] },
        version: { type: 'integer' },
        requestedAt: { type: 'string', format: 'date-time' },
        reason: NULLABLE_STRING,
        preferredTimes: NULLABLE_STRING,
        outcome: { anyOf: [OUTCOME, { type: 'null' }] },
        actions: {
          type: 'object',
          additionalProperties: false,
          required: ['confirm', 'decline'],
          properties: { confirm: { type: 'boolean' }, decline: { type: 'boolean' } },
        },
      },
    },
    { type: 'null' },
  ],
} as const

const CANCELLATION_PREVIEW = {
  anyOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: [
        'depositPaidCents',
        'depositPendingCents',
        'workStarted',
        'markers',
        'feeDisclosed',
        'feeEnforcement',
        'customer',
        'handyhub',
        'mayCommit',
        'mayWaive',
        'rulesProposed',
      ],
      properties: {
        depositPaidCents: { type: 'integer' },
        depositPendingCents: { type: 'integer' },
        workStarted: { type: 'boolean' },
        markers: {
          type: 'object',
          additionalProperties: false,
          required: ['arrivedAt', 'preparationStartedAt', 'contractedWorkStartedAt', 'completedAt'],
          properties: {
            arrivedAt: NULLABLE_STRING,
            preparationStartedAt: NULLABLE_STRING,
            contractedWorkStartedAt: NULLABLE_STRING,
            completedAt: NULLABLE_STRING,
          },
        },
        feeDisclosed: { type: 'boolean' },
        feeEnforcement: { type: 'string' },
        customer: OUTCOME,
        handyhub: OUTCOME,
        mayCommit: {
          type: 'object',
          additionalProperties: false,
          required: ['customer', 'handyhub'],
          properties: { customer: { type: 'boolean' }, handyhub: { type: 'boolean' } },
        },
        mayWaive: { type: 'boolean' },
        rulesProposed: { type: 'boolean' },
      },
    },
    { type: 'null' },
  ],
} as const

const CHANGE = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'kind',
    'fromVersion',
    'toVersion',
    'fromWindowVersion',
    'toWindowVersion',
    'fromWorkers',
    'toWorkers',
    'initiator',
    'handyhubCause',
    'reason',
    'changeRequestId',
    'changedBy',
    'changedAt',
    'cancellation',
  ],
  properties: {
    id: { type: 'string' },
    kind: { type: 'string', enum: [...CHANGE_KINDS] },
    fromVersion: { type: 'integer' },
    toVersion: { type: 'integer' },
    fromWindowVersion: { type: 'integer' },
    toWindowVersion: { type: 'integer' },
    fromWorkers: { type: 'array', items: STAFF_REF },
    toWorkers: { type: 'array', items: STAFF_REF },
    initiator: NULLABLE_STRING,
    handyhubCause: NULLABLE_STRING,
    reason: { type: 'string' },
    changeRequestId: NULLABLE_STRING,
    changedBy: STAFF_REF,
    changedAt: { type: 'string', format: 'date-time' },
    cancellation: {
      anyOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: [
            'outcome',
            'workStarted',
            'depositPaidCents',
            'depositPendingCents',
            'rulesVersion',
            'circumstance',
            'feeWaiver',
          ],
          properties: {
            outcome: OUTCOME,
            workStarted: { type: 'boolean' },
            depositPaidCents: { type: 'integer' },
            depositPendingCents: { type: 'integer' },
            rulesVersion: { type: 'integer' },
            circumstance: NULLABLE_STRING,
            feeWaiver: {
              anyOf: [
                {
                  type: 'object',
                  additionalProperties: false,
                  required: ['fromCents', 'reason'],
                  properties: { fromCents: { type: 'integer' }, reason: { type: 'string' } },
                },
                { type: 'null' },
              ],
            },
          },
        },
        { type: 'null' },
      ],
    },
  },
} as const

const AUTHORIZATIONS = {
  type: 'object',
  additionalProperties: false,
  required: ['inspection', 'followUp', 'jobCompleted', 'actions'],
  properties: {
    inspection: {
      anyOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: [
            'id',
            'qualifiedPerson',
            'qualification',
            'safetyConditions',
            'reason',
            'holdIds',
            'authorizedBy',
            'authorizedAt',
          ],
          properties: {
            id: { type: 'string' },
            qualifiedPerson: { type: 'string' },
            qualification: { type: 'string' },
            safetyConditions: { type: 'string' },
            reason: { type: 'string' },
            holdIds: { type: 'array', items: { type: 'string' } },
            authorizedBy: STAFF_REF,
            authorizedAt: { type: 'string', format: 'date-time' },
          },
        },
        { type: 'null' },
      ],
    },
    followUp: {
      anyOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'basis', 'note', 'returnWorkId', 'authorizedBy', 'authorizedAt'],
          properties: {
            id: { type: 'string' },
            basis: { type: 'string', enum: [...FOLLOW_UP_BASES] },
            note: { type: 'string' },
            returnWorkId: NULLABLE_STRING,
            authorizedBy: STAFF_REF,
            authorizedAt: { type: 'string', format: 'date-time' },
          },
        },
        { type: 'null' },
      ],
    },
    // A work visit of a completed job (A4): it needs its follow-up authorization.
    jobCompleted: { type: 'boolean' },
    actions: {
      type: 'object',
      additionalProperties: false,
      required: ['authorizeInspection', 'authorizeFollowUp'],
      properties: { authorizeInspection: { type: 'boolean' }, authorizeFollowUp: { type: 'boolean' } },
    },
  },
} as const

const VISIT_ACTIONS = {
  type: 'object',
  additionalProperties: false,
  required: ['changeWindow', 'confirm', 'reassign', 'cancel', 'offerWindows', 'replaceOffer'],
  properties: {
    changeWindow: { type: 'boolean' },
    confirm: { type: 'boolean' },
    reassign: { type: 'boolean' },
    cancel: { type: 'boolean' },
    offerWindows: { type: 'boolean' },
    // TSK-0145 (OWN-DEC-194 B4): new windows replace the visit's open offer, with a reason.
    replaceOffer: { type: 'boolean' },
  },
} as const

const VISIT = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'number',
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
    'changeRequest',
    'cancellationPreview',
    'changes',
    'authorizations',
    'actions',
  ],
  properties: {
    id: { type: 'string' },
    number: { type: 'integer' },
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
    // TSK-0066 (HH-SCH-07, HH-PORT-04): the open customer request, the cancellation outcome preview of a confirmed
    // visit the caller may cancel, and the committed changes, newest first.
    changeRequest: CHANGE_REQUEST,
    cancellationPreview: CANCELLATION_PREVIEW,
    changes: { type: 'array', items: CHANGE },
    // TSK-0145 (OWN-DEC-193 A1, A4): the visit's hazard-evaluation inspection and follow-up authorizations.
    authorizations: AUTHORIZATIONS,
    actions: VISIT_ACTIONS,
  },
} as const

/** TSK-0127: staff's verification of the property's address and county for its current address version. */
export const COUNTY_VERIFICATION = {
  anyOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['state', 'county', 'inArea', 'addressVersion', 'verifiedBy', 'verifiedAt'],
      properties: {
        state: { type: 'string' },
        county: { type: 'string' },
        inArea: { type: 'boolean' },
        addressVersion: { type: 'integer' },
        verifiedBy: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'name'],
          properties: { id: { type: 'string' }, name: { type: ['string', 'null'] } },
        },
        verifiedAt: { type: 'string' },
      },
    },
    { type: 'null' },
  ],
} as const

const nullable = (o: object) => ({ anyOf: [o, { type: 'null' }] })

/** TSK-0126 (OWN-DEC-167): the three site checks of a project, each with what it rests on. */
export const SITE_CHECKS = {
  type: 'object',
  additionalProperties: false,
  required: ['property', 'address', 'siteContact', 'coverage', 'actions'],
  properties: {
    property: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'version', 'addressVersion', 'address'],
      properties: {
        id: { type: 'string' },
        version: { type: 'integer' },
        addressVersion: { type: 'integer' },
        address: {
          type: 'object',
          additionalProperties: false,
          required: ['street', 'unit', 'city', 'state', 'zip'],
          properties: {
            street: { type: 'string' },
            unit: NULLABLE_STRING,
            city: { type: 'string' },
            state: { type: 'string' },
            zip: { type: 'string' },
          },
        },
      },
    },
    address: {
      type: 'object',
      additionalProperties: false,
      required: ['done', 'problems', 'verification'],
      properties: {
        done: { type: 'boolean' },
        problems: { type: 'array', items: { type: 'string', enum: [...ADDRESS_PROBLEMS] } },
        verification: nullable({
          type: 'object',
          additionalProperties: false,
          required: ['id', 'state', 'county', 'inArea', 'addressVersion', 'verifiedBy', 'verifiedAt'],
          properties: {
            id: { type: 'string' },
            state: { type: 'string' },
            county: { type: 'string' },
            inArea: { type: 'boolean' },
            addressVersion: { type: 'integer' },
            verifiedBy: STAFF_REF,
            verifiedAt: { type: 'string' },
          },
        }),
      },
    },
    siteContact: {
      type: 'object',
      additionalProperties: false,
      required: ['done', 'problem', 'current', 'customer'],
      properties: {
        done: { type: 'boolean' },
        problem: {
          type: ['string', 'null'],
          enum: ['SITE_CONTACT_MISSING', 'SITE_CONTACT_NOT_AUTHORIZED', 'SITE_CONTACT_CHANGED', null],
        },
        current: nullable({
          type: 'object',
          additionalProperties: false,
          required: [
            'version',
            'designation',
            'name',
            'role',
            'phone',
            'email',
            'authority',
            'source',
            'note',
            'recordedBy',
            'recordedAt',
          ],
          properties: {
            version: { type: 'integer' },
            designation: { type: 'string', enum: [...SITE_CONTACT_DESIGNATIONS] },
            name: { type: 'string' },
            role: NULLABLE_STRING,
            phone: NULLABLE_STRING,
            email: NULLABLE_STRING,
            authority: { type: 'array', items: { type: 'string', enum: [...SITE_CONTACT_AUTHORITIES] } },
            source: { type: 'string' },
            note: NULLABLE_STRING,
            recordedBy: STAFF_REF,
            recordedAt: { type: 'string' },
          },
        }),
        // The customer's own contact, to designate them without typing anything again.
        customer: nullable({
          type: 'object',
          additionalProperties: false,
          required: ['name', 'phone', 'email'],
          properties: { name: { type: 'string' }, phone: NULLABLE_STRING, email: NULLABLE_STRING },
        }),
      },
    },
    coverage: {
      type: 'object',
      additionalProperties: false,
      required: ['done', 'outcome', 'countyVerificationId', 'acceptance'],
      properties: {
        done: { type: 'boolean' },
        outcome: { type: ['string', 'null'], enum: ['served', 'outside', null] },
        countyVerificationId: NULLABLE_STRING,
        acceptance: nullable({
          type: 'object',
          additionalProperties: false,
          required: ['outcome', 'exceptionReason', 'acceptedBy', 'acceptedAt'],
          properties: {
            outcome: { type: 'string', enum: ['served', 'outside'] },
            exceptionReason: NULLABLE_STRING,
            acceptedBy: STAFF_REF,
            acceptedAt: { type: 'string' },
          },
        }),
      },
    },
    actions: {
      type: 'object',
      additionalProperties: false,
      required: ['verifyAddress', 'recordSiteContact', 'acceptCoverage', 'approveException'],
      properties: {
        verifyAddress: { type: 'boolean' },
        recordSiteContact: { type: 'boolean' },
        acceptCoverage: { type: 'boolean' },
        approveException: { type: 'boolean' },
      },
    },
  },
} as const

/** TSK-0126: the project's site contact as its next version, with the authority staff confirmed. */
export const SITE_CONTACT_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['currentVersion', 'designation', 'authority', 'source'],
  properties: {
    currentVersion: { type: 'integer', minimum: 0 },
    designation: { type: 'string', enum: [...SITE_CONTACT_DESIGNATIONS] },
    fullName: { type: ['string', 'null'], maxLength: SITE_CONTACT_LIMITS.name },
    role: { type: ['string', 'null'], maxLength: SITE_CONTACT_LIMITS.role },
    phone: { type: ['string', 'null'], maxLength: 40 },
    email: { type: ['string', 'null'], maxLength: SITE_CONTACT_LIMITS.email },
    authority: {
      type: 'array',
      uniqueItems: true,
      maxItems: SITE_CONTACT_AUTHORITIES.length,
      items: { type: 'string', enum: [...SITE_CONTACT_AUTHORITIES] },
    },
    source: { type: 'string', enum: [...STAFF_DETAIL_SOURCES] },
    note: { type: ['string', 'null'], maxLength: SITE_CONTACT_LIMITS.note },
  },
} as const

export const SITE_CONTACT_RESULT = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'version', 'authorized'],
  properties: { id: { type: 'string' }, version: { type: 'integer' }, authorized: { type: 'boolean' } },
} as const

/** TSK-0126: SERVED coverage accepted on the county check the caller saw. */
export const COVERAGE_ACCEPT_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['countyVerificationId'],
  properties: { countyVerificationId: UUID },
} as const

/** TSK-0126: the Owner's exception for an OUTSIDE county, with the reason. */
export const COVERAGE_EXCEPTION_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['countyVerificationId', 'reason'],
  properties: {
    countyVerificationId: UUID,
    reason: { type: 'string', minLength: 1, maxLength: SITE_CONTACT_LIMITS.reason },
  },
} as const

export const COVERAGE_RESULT = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'outcome'],
  properties: { id: { type: 'string' }, outcome: { type: 'string', enum: ['served', 'outside'] } },
} as const

export const PROJECT_VISITS = {
  type: 'object',
  additionalProperties: false,
  required: [
    'projectId',
    'projectState',
    'timeZone',
    'coverage',
    'siteChecks',
    'businessTimeZone',
    'visitHours',
    'windowOffers',
    'job',
    'schedulingTask',
    'actions',
    'visitTimes',
    'workerAccess',
    'dismissFlags',
    'visits',
  ],
  properties: {
    projectId: { type: 'string' },
    projectState: { type: 'string' },
    // TSK-0123: the property's zone; null while it is unknown (no visit is planned until it is verified).
    timeZone: { type: ['string', 'null'] },
    coverage: {
      type: 'object',
      additionalProperties: false,
      required: ['result', 'code', 'reason', 'countyVerification'],
      properties: {
        result: { type: 'string' },
        code: { type: 'string' },
        reason: { type: ['string', 'null'] },
        countyVerification: COUNTY_VERIFICATION,
      },
    },
    siteChecks: SITE_CHECKS,
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
    // TSK-0070: the caller may open each started visit's Arrived and Finished times (visit.correct_timestamps).
    visitTimes: { type: 'boolean' },
    // TSK-0128: the caller may extend a worker's visit-day access on each live visit (visit.extend_worker_access).
    workerAccess: { type: 'boolean' },
    // TSK-0151: the caller may keep an appointment as it is despite a working-hours or equipment flag (the Owner).
    dismissFlags: { type: 'boolean' },
    visits: { type: 'array', items: VISIT },
  },
} as const

// TSK-0065: the scheduling board (HH-SCH-13). A day or a week of the business zone, or the date of one visit to open.
export const BOARD_QUERY = {
  type: 'object',
  additionalProperties: false,
  properties: {
    date: DATE,
    view: { type: 'string', enum: [...BOARD_VIEWS] },
    visitId: UUID,
  },
} as const

const BLOCKER = {
  type: 'object',
  additionalProperties: false,
  required: ['field', 'code'],
  properties: { field: { type: 'string' }, code: { type: 'string' } },
} as const

const BOARD_VISIT = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'number',
    'projectId',
    'projectReference',
    'requestId',
    'purpose',
    'state',
    'version',
    'window',
    'windowVersion',
    'expectedDurationMinutes',
    'preparationBufferMinutes',
    'travelBufferMinutes',
    'requiredWorkers',
    'equipment',
    'reservedRange',
    'team',
    'items',
    'openOffer',
    'changeRequest',
    'cancellationPreview',
    'confirmationBlockers',
    'actions',
  ],
  properties: {
    id: { type: 'string' },
    number: { type: 'integer' },
    projectId: { type: 'string' },
    projectReference: { type: 'string' },
    requestId: NULLABLE_STRING,
    purpose: { type: 'string', enum: [...VISIT_PURPOSES] },
    state: { type: 'string', enum: [...VISIT_STATES] },
    version: { type: 'integer' },
    window: WINDOW,
    windowVersion: { type: 'integer' },
    expectedDurationMinutes: NULLABLE_INT,
    preparationBufferMinutes: NULLABLE_INT,
    travelBufferMinutes: NULLABLE_INT,
    requiredWorkers: NULLABLE_INT,
    equipment: { type: 'array', items: { type: 'string' } },
    reservedRange: { anyOf: [SPAN, { type: 'null' }] },
    team: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['worker', 'role', 'kind', 'startsAt', 'endsAt', 'holdExpiresAt', 'flags'],
        properties: {
          worker: STAFF_REF,
          role: NULLABLE_STRING,
          kind: { type: 'string', enum: ['hold', 'confirmed'] },
          startsAt: { type: 'string', format: 'date-time' },
          endsAt: { type: 'string', format: 'date-time' },
          holdExpiresAt: { type: ['string', 'null'] },
          flags: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'name', 'kind'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          kind: { type: 'string', enum: ['hold', 'confirmed'] },
        },
      },
    },
    openOffer: { type: 'boolean' },
    changeRequest: CHANGE_REQUEST,
    cancellationPreview: CANCELLATION_PREVIEW,
    confirmationBlockers: { anyOf: [{ type: 'array', items: BLOCKER }, { type: 'null' }] },
    actions: VISIT_ACTIONS,
  },
} as const

const BOARD_ENTRY = {
  type: 'object',
  additionalProperties: false,
  required: ['reservationId', 'visitId', 'kind', 'role', 'startsAt', 'endsAt', 'holdExpiresAt', 'flags'],
  properties: {
    reservationId: { type: 'string' },
    visitId: { type: 'string' },
    kind: { type: 'string', enum: ['hold', 'confirmed'] },
    role: NULLABLE_STRING,
    startsAt: { type: 'string', format: 'date-time' },
    endsAt: { type: 'string', format: 'date-time' },
    holdExpiresAt: { type: ['string', 'null'] },
    flags: { type: 'array', items: { type: 'string' } },
  },
} as const

export const SCHEDULE_BOARD = {
  type: 'object',
  additionalProperties: false,
  required: [
    'view',
    'date',
    'days',
    'previous',
    'next',
    'timeZone',
    'timeZoneProposed',
    'visitHours',
    'windowOffers',
    'focusVisitId',
    'workers',
    'unassigned',
    'visits',
  ],
  properties: {
    view: { type: 'string', enum: [...BOARD_VIEWS] },
    date: { type: 'string' },
    days: { type: 'array', items: { type: 'string' } },
    previous: { type: 'string' },
    next: { type: 'string' },
    timeZone: { type: 'string' },
    timeZoneProposed: { type: 'boolean' },
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
    focusVisitId: NULLABLE_STRING,
    workers: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'name', 'eligibleFor', 'scheduleVersion', 'days'],
        properties: {
          id: { type: 'string' },
          name: NULLABLE_STRING,
          eligibleFor: {
            type: 'object',
            additionalProperties: false,
            required: ['estimateVisits', 'workVisits'],
            properties: { estimateVisits: { type: 'boolean' }, workVisits: { type: 'boolean' } },
          },
          scheduleVersion: NULLABLE_INT,
          days: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['date', 'working', 'timeOff', 'free', 'workingMinutes', 'freeMinutes', 'entries'],
              properties: {
                date: { type: 'string' },
                working: { type: 'array', items: SPAN },
                timeOff: { type: 'array', items: SPAN },
                free: { type: 'array', items: SPAN },
                workingMinutes: { type: 'integer' },
                freeMinutes: { type: 'integer' },
                entries: { type: 'array', items: BOARD_ENTRY },
              },
            },
          },
        },
      },
    },
    unassigned: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['date', 'visitIds'],
        properties: { date: { type: 'string' }, visitIds: { type: 'array', items: { type: 'string' } } },
      },
    },
    visits: { type: 'array', items: BOARD_VISIT },
  },
} as const

/** TSK-0146 (OWN-DEC-194 B7): the default a visit's offer form starts from. */
export const VISIT_PREPARATION_DEFAULT = {
  type: 'object',
  additionalProperties: false,
  required: ['visitId', 'text', 'tooLong', 'services'],
  properties: {
    visitId: { type: 'string' },
    text: NULLABLE_STRING,
    tooLong: { type: 'boolean' },
    services: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['serviceId', 'name', 'state', 'version'],
        properties: {
          serviceId: { type: 'string' },
          name: { type: 'string' },
          state: { type: 'string', enum: ['approved', 'not_configured'] },
          version: NULLABLE_INT,
        },
      },
    },
  },
} as const

export const SERVICE_PARAMS = {
  type: 'object',
  additionalProperties: false,
  required: ['serviceId'],
  properties: { serviceId: { type: 'string', pattern: '^SVC-[A-Z]{2}-[0-9]{2}$' } },
} as const

/** TSK-0146: the Owner approves a service's default: the reviewed page steps, the Owner's text, or its removal. */
export const PREPARATION_DEFAULT_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['source', 'currentVersion'],
  properties: {
    source: { type: 'string', enum: ['service_page', 'text', 'none'] },
    text: { type: 'string', maxLength: PREPARATION_MAX_LENGTH },
    reason: { type: 'string', minLength: 1, maxLength: 500 },
    currentVersion: { type: 'integer', minimum: 0 },
  },
} as const

const DEFAULT_VERSION = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'version', 'text', 'basis', 'serviceVersion', 'reason', 'approvedBy', 'approvedAt'],
  properties: {
    id: { type: 'string' },
    version: { type: 'integer' },
    text: NULLABLE_STRING,
    basis: { type: 'string', enum: ['service_page', 'edited', 'removed'] },
    serviceVersion: NULLABLE_INT,
    reason: NULLABLE_STRING,
    approvedBy: STAFF_REF,
    approvedAt: { type: 'string', format: 'date-time' },
  },
} as const

/** TSK-0146: the Owner's review of every service's default. */
export const PREPARATION_DEFAULTS = {
  type: 'object',
  additionalProperties: false,
  required: ['services'],
  properties: {
    services: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['serviceId', 'code', 'category', 'name', 'servicePage', 'current', 'version', 'history'],
        properties: {
          serviceId: { type: 'string' },
          code: { type: 'string' },
          category: { type: 'string' },
          name: { type: 'string' },
          servicePage: {
            anyOf: [
              {
                type: 'object',
                additionalProperties: false,
                required: ['version', 'text', 'problems'],
                properties: {
                  version: { type: 'integer' },
                  text: NULLABLE_STRING,
                  problems: { type: 'array', items: { type: 'string', enum: [...PREPARATION_RULES] } },
                },
              },
              { type: 'null' },
            ],
          },
          current: { anyOf: [DEFAULT_VERSION, { type: 'null' }] },
          version: { type: 'integer' },
          history: { type: 'array', items: DEFAULT_VERSION },
        },
      },
    },
  },
} as const

export const PREPARATION_DEFAULT_RESULT = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'serviceId', 'version', 'basis', 'serviceVersion'],
  properties: {
    id: { type: 'string' },
    serviceId: { type: 'string' },
    version: { type: 'integer' },
    basis: { type: 'string', enum: ['service_page', 'edited', 'removed'] },
    serviceVersion: NULLABLE_INT,
  },
} as const
