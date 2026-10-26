// JSON schemas of the staff request routes (TSK-0042). Every input object refuses unknown fields; every response
// object lists its fields, so nothing undeclared reaches the staff app (HH-ARC-04).
import {
  HAZARD_CATEGORIES,
  NOT_A_FIT_CATEGORIES,
  QUALIFICATION_CHECKS,
  QUALIFICATION_OUTCOMES,
  REQUEST_STATES,
  ZONE_FAMILIES,
} from '@handyhub/domain'
import { TIME_WINDOWS } from '@handyhub/domain/request-form'
import { CLOCK_SCHEMA } from './clock-view.js'
import { HOLD_SCHEMA } from './holds.js'
import { NEXT_STEPS } from './staff-record.js'

export const UUID = {
  type: 'string',
  pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
} as const

export const REQUEST_PARAMS = {
  type: 'object',
  additionalProperties: false,
  required: ['requestId'],
  properties: { requestId: UUID },
} as const

const NULLABLE_STRING = { type: ['string', 'null'] } as const
const STAFF_REF = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'name'],
  properties: { id: { type: 'string' }, name: NULLABLE_STRING },
} as const
const NULLABLE_STAFF = { anyOf: [{ type: 'null' }, STAFF_REF] } as const

/** An optional staff-only note on a decision. */
export const INTERNAL_NOTE = { type: 'string', maxLength: 5000 } as const
/** Work packages: one per service, at least one (HH-SVC-04). PROPOSED engineering bound of 10. */
export const WORK_PACKAGES = {
  type: 'array',
  minItems: 1,
  maxItems: 10,
  uniqueItems: true,
  items: { type: 'string', pattern: '^SVC-[A-Z]{2}-[0-9]{2}$' },
} as const

const CHECK_ENTRY = {
  type: 'object',
  additionalProperties: false,
  required: ['outcome'],
  properties: {
    outcome: { type: 'string', enum: [...QUALIFICATION_OUTCOMES] },
    note: { type: ['string', 'null'], maxLength: 1000 },
    // Risk flags only (TSK-0043, HH-LEAD-04): the potential hazards found; each newly named one opens a review hold.
    hazards: {
      type: ['array', 'null'],
      uniqueItems: true,
      maxItems: HAZARD_CATEGORIES.length,
      items: { type: 'string', enum: [...HAZARD_CATEGORIES] },
    },
  },
} as const

export const QUALIFICATION_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['checks'],
  properties: {
    checks: {
      type: 'object',
      additionalProperties: false,
      required: [...QUALIFICATION_CHECKS],
      properties: Object.fromEntries(QUALIFICATION_CHECKS.map((c) => [c, CHECK_ENTRY])),
    },
  },
} as const

const CHECKS_OUT = {
  type: 'object',
  additionalProperties: false,
  properties: Object.fromEntries(QUALIFICATION_CHECKS.map((c) => [c, CHECK_ENTRY])),
} as const

/** A completed customer conversation staff recorded (TSK-0043): staff only. */
export const CONVERSATION = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'channel', 'outcome', 'occurredAt', 'recordedBy', 'recordedAt'],
  properties: {
    id: { type: 'string' },
    channel: { type: 'string', enum: ['phone', 'in_person'] },
    outcome: { type: 'string' },
    occurredAt: { type: 'string', format: 'date-time' },
    recordedBy: STAFF_REF,
    recordedAt: { type: 'string', format: 'date-time' },
  },
} as const

export const LIST_ITEM = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'reference',
    'state',
    'submittedAt',
    'services',
    'customerName',
    'city',
    'coverage',
    'needHelpToday',
    'spamSuspected',
    'responsibleStaff',
  ],
  properties: {
    id: { type: 'string' },
    reference: { type: 'string' },
    state: { type: 'string', enum: [...REQUEST_STATES] },
    submittedAt: { type: 'string', format: 'date-time' },
    services: { type: 'array', items: { type: 'string' } },
    customerName: { type: 'string' },
    city: { type: 'string' },
    coverage: { type: 'string' },
    needHelpToday: { type: 'boolean' },
    spamSuspected: { type: 'boolean' },
    responsibleStaff: NULLABLE_STAFF,
  },
} as const

export const DETAIL = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'reference',
    'state',
    'version',
    'source',
    'submittedAt',
    'formVersion',
    'privacyNoticeVersion',
    'spam',
    'project',
    'customer',
    'repeatOf',
    'original',
    'contactVerification',
    'preferredWindows',
    'coverage',
    'responsibleStaff',
    'assignments',
    'qualification',
    'missingChecks',
    'notes',
    'decisions',
    'workPackages',
    'nextStep',
    'followUpDueAt',
    'responseClock',
    'conversations',
    'holds',
    'estimateBlockedByHolds',
    'actions',
    'serviceCatalog',
  ],
  properties: {
    id: { type: 'string' },
    reference: { type: 'string' },
    state: { type: 'string', enum: [...REQUEST_STATES] },
    version: { type: 'integer' },
    source: { type: 'string' },
    submittedAt: { type: 'string', format: 'date-time' },
    formVersion: { type: 'string' },
    privacyNoticeVersion: { type: 'string' },
    spam: {
      type: 'object',
      additionalProperties: false,
      required: ['suspected', 'signals'],
      properties: { suspected: { type: 'boolean' }, signals: { type: 'array', items: { type: 'string' } } },
    },
    project: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'reference', 'state'],
      properties: { id: { type: 'string' }, reference: { type: 'string' }, state: { type: 'string' } },
    },
    // TSK-0044: the customer record the request belongs to (its own customer: never linked by matching details).
    customer: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'displayName'],
      properties: { id: { type: 'string' }, displayName: { type: 'string' } },
    },
    // TSK-0113 (HH-ID-12, OWN-DEC-113): sent with Request This Service Again from the customer's account: the earlier
    // project it repeats, when the customer confirmed the property details were still current, and whether the
    // address is the earlier one. Null for any other request.
    repeatOf: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: ['projectId', 'reference', 'detailsConfirmedAt', 'sameAddress'],
          properties: {
            projectId: { type: 'string' },
            reference: { type: 'string' },
            detailsConfirmedAt: { type: 'string', format: 'date-time' },
            sameAddress: { type: 'boolean' },
          },
        },
      ],
    },
    original: {
      type: 'object',
      additionalProperties: false,
      required: [
        'services',
        'notSure',
        'otherServicesText',
        'description',
        'answers',
        'property',
        'timing',
        'estimatePreference',
        'preferredChannel',
        'smsOptIn',
        'marketingOptIn',
        'contact',
      ],
      properties: {
        services: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['serviceId', 'code', 'notes'],
            properties: { serviceId: { type: 'string' }, code: { type: 'string' }, notes: NULLABLE_STRING },
          },
        },
        notSure: { type: 'boolean' },
        otherServicesText: NULLABLE_STRING,
        description: NULLABLE_STRING,
        answers: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['serviceCode', 'question', 'label', 'kind', 'number', 'text', 'unit', 'approximate'],
            properties: {
              serviceCode: NULLABLE_STRING,
              question: { type: 'string' },
              label: NULLABLE_STRING,
              kind: { type: 'string', enum: ['number', 'text', 'unknown'] },
              number: { type: ['number', 'null'] },
              text: NULLABLE_STRING,
              unit: NULLABLE_STRING,
              approximate: { type: 'boolean' },
            },
          },
        },
        property: {
          type: 'object',
          additionalProperties: false,
          required: ['street', 'unit', 'city', 'state', 'zip', 'propertyType'],
          properties: {
            street: { type: 'string' },
            unit: NULLABLE_STRING,
            city: { type: 'string' },
            state: { type: 'string' },
            zip: { type: 'string' },
            propertyType: { type: 'string' },
          },
        },
        timing: {
          type: 'object',
          additionalProperties: false,
          required: ['preferredDate', 'flexible', 'needHelpToday', 'windows'],
          properties: {
            preferredDate: NULLABLE_STRING,
            flexible: { type: 'boolean' },
            needHelpToday: { type: 'boolean' },
            windows: { type: 'array', items: { type: 'string' } },
          },
        },
        estimatePreference: { type: 'string' },
        preferredChannel: { type: 'string' },
        smsOptIn: { type: 'boolean' },
        marketingOptIn: { type: 'boolean' },
        contact: {
          type: 'object',
          additionalProperties: false,
          required: ['fullName', 'email', 'phone'],
          properties: { fullName: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' } },
        },
      },
    },
    contactVerification: {
      type: 'object',
      additionalProperties: false,
      required: ['email', 'phone', 'current'],
      properties: {
        email: { type: 'string' },
        phone: { type: 'string' },
        // The contact's current values, which the badges describe (TSK-0033: a verified Change Contact).
        current: {
          type: 'object',
          additionalProperties: false,
          required: ['email', 'phone'],
          properties: { email: { type: 'string' }, phone: { type: 'string' } },
        },
      },
    },
    // TSK-0139 (OWN-DEC-170, OWN-DEC-159): the chosen windows with the hours the form offered, in the property's zone
    // as it is now (null: unknown); on a preferred date also the instants of that date. Preferences, never a slot.
    preferredWindows: {
      type: 'object',
      additionalProperties: false,
      required: ['timeZone', 'family', 'windows'],
      properties: {
        timeZone: NULLABLE_STRING,
        family: { type: ['string', 'null'], enum: [...ZONE_FAMILIES, null] },
        windows: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['code', 'start', 'end', 'startsAt', 'endsAt'],
            properties: {
              code: { type: 'string', enum: [...TIME_WINDOWS] },
              start: NULLABLE_STRING,
              end: NULLABLE_STRING,
              startsAt: { type: ['string', 'null'], format: 'date-time' },
              endsAt: { type: ['string', 'null'], format: 'date-time' },
            },
          },
        },
      },
    },
    coverage: {
      type: 'object',
      additionalProperties: false,
      required: ['result', 'code', 'reason', 'ruleSet'],
      properties: {
        result: { type: 'string' },
        code: { type: 'string' },
        reason: { type: ['string', 'null'] },
        ruleSet: { type: ['integer', 'null'] },
      },
    },
    responsibleStaff: NULLABLE_STAFF,
    assignments: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['staff', 'previous', 'by', 'at'],
        properties: { staff: STAFF_REF, previous: NULLABLE_STAFF, by: STAFF_REF, at: { type: 'string' } },
      },
    },
    qualification: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: ['revision', 'checks', 'recordedBy', 'recordedAt'],
          properties: {
            revision: { type: 'integer' },
            checks: CHECKS_OUT,
            recordedBy: STAFF_REF,
            recordedAt: { type: 'string' },
          },
        },
      ],
    },
    missingChecks: { type: 'array', items: { type: 'string', enum: [...QUALIFICATION_CHECKS] } },
    notes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        // TSK-0044 (HH-STAFF-05): each note's visibility class; a restricted note the caller may not read is masked
        // (it exists, its class and time; no text, no author).
        required: ['id', 'visibility', 'masked', 'body', 'author', 'createdAt'],
        properties: {
          id: { type: 'string' },
          visibility: { type: 'string' },
          masked: { type: 'boolean' },
          body: { type: ['string', 'null'] },
          author: NULLABLE_STAFF,
          createdAt: { type: 'string' },
        },
      },
    },
    decisions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'id',
          'action',
          'event',
          'fromState',
          'toState',
          'projectFromState',
          'projectToState',
          'reasonCategory',
          'customerText',
          'customerMessage',
          'internalNote',
          'decidedBy',
          'decidedAt',
        ],
        properties: {
          id: { type: 'string' },
          action: { type: 'string' },
          event: { type: 'string' },
          fromState: { type: 'string' },
          toState: { type: 'string' },
          projectFromState: NULLABLE_STRING,
          projectToState: NULLABLE_STRING,
          reasonCategory: { type: ['string', 'null'], enum: [...NOT_A_FIT_CATEGORIES, null] },
          customerText: NULLABLE_STRING,
          customerMessage: NULLABLE_STRING,
          internalNote: NULLABLE_STRING,
          decidedBy: STAFF_REF,
          decidedAt: { type: 'string' },
        },
      },
    },
    workPackages: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'serviceId', 'code', 'position', 'state'],
        properties: {
          id: { type: 'string' },
          serviceId: { type: 'string' },
          code: { type: 'string' },
          position: { type: 'integer' },
          state: { type: 'string' },
        },
      },
    },
    nextStep: { type: 'string', enum: [...NEXT_STEPS] },
    followUpDueAt: NULLABLE_STRING,
    // The first-response clock (TSK-0043, HH-LEAD-05): an internal target, staff only. Null for a request from before
    // the clock existed.
    responseClock: { anyOf: [{ type: 'null' }, CLOCK_SCHEMA] },
    conversations: { type: 'array', items: CONVERSATION },
    holds: { type: 'array', items: HOLD_SCHEMA },
    estimateBlockedByHolds: { type: 'boolean' },
    actions: {
      type: 'object',
      additionalProperties: false,
      required: [
        'askQuestion',
        'prepareOnlineEstimate',
        'arrangeEstimateVisit',
        'notAFit',
        'assign',
        'qualify',
        'addNote',
        'relink',
        'recordConversation',
      ],
      properties: {
        askQuestion: { type: 'boolean' },
        prepareOnlineEstimate: { type: 'boolean' },
        arrangeEstimateVisit: { type: 'boolean' },
        notAFit: { type: 'boolean' },
        assign: { type: 'boolean' },
        qualify: { type: 'boolean' },
        addNote: { type: 'boolean' },
        relink: { type: 'boolean' },
        recordConversation: { type: 'boolean' },
      },
    },
    serviceCatalog: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'code'],
        properties: { id: { type: 'string' }, code: { type: 'string' } },
      },
    },
  },
} as const

/** The result of an action: the request's new state and version, and the project's state. */
export const ACTION_RESULT = {
  type: 'object',
  additionalProperties: false,
  required: ['requestId', 'outcome', 'state', 'version', 'projectState'],
  properties: {
    requestId: { type: 'string' },
    outcome: { type: 'string', enum: ['moved', 'routed_to_owner'] },
    state: { type: 'string', enum: [...REQUEST_STATES] },
    version: { type: 'integer' },
    projectState: { type: 'string' },
  },
} as const
