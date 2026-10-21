// JSON schemas of the estimate lifecycle (TSK-0055; HH-EST-04, HH-API-01, HH-ARC-04): the lifecycle part of the
// builder view, the bodies of the lifecycle routes and the Owner's publishing setting. Input objects refuse unknown
// fields; response objects list every field.
import { ESTIMATE_VERSION_STATES } from '@handyhub/domain'

const NULLABLE_STRING = { type: ['string', 'null'] } as const
const DATE_TIME = { type: 'string', format: 'date-time' } as const
const NULLABLE_DATE_TIME = { type: ['string', 'null'], format: 'date-time' } as const
const STATE = { type: 'string', enum: [...ESTIMATE_VERSION_STATES] } as const
const STAFF_REF = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'name'],
  properties: { id: { type: 'string' }, name: NULLABLE_STRING },
} as const
const NULLABLE_STAFF_REF = { anyOf: [{ type: 'null' }, STAFF_REF] } as const
const VERSION_REF = {
  anyOf: [
    { type: 'null' },
    {
      type: 'object',
      additionalProperties: false,
      required: ['versionId', 'version'],
      properties: { versionId: { type: 'string' }, version: { type: 'integer' } },
    },
  ],
} as const

const ACTIONS = ['publish', 'requestReview', 'returnToDraft', 'withdraw', 'expire', 'recordDecline', 'revise'] as const

/** What publishing pinned, the caller's actions now, the current version and the version history. */
export const LIFECYCLE = {
  type: 'object',
  additionalProperties: false,
  required: [
    'effectiveState',
    'publishedAt',
    'publishedBy',
    'validUntil',
    'termsVersion',
    'firstViewedAt',
    'customerPdf',
    'revisedFrom',
    'current',
    'customerResponses',
    'customerApproval',
    'actions',
    'history',
  ],
  properties: {
    effectiveState: STATE,
    publishedAt: NULLABLE_DATE_TIME,
    publishedBy: NULLABLE_STAFF_REF,
    validUntil: NULLABLE_DATE_TIME,
    termsVersion: NULLABLE_STRING,
    firstViewedAt: NULLABLE_DATE_TIME,
    customerPdf: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: ['sha256', 'byteSize'],
          properties: { sha256: { type: 'string' }, byteSize: { type: 'integer' } },
        },
      ],
    },
    revisedFrom: VERSION_REF,
    current: VERSION_REF,
    // TSK-0056 (HH-EST-09): the customer's responses on the estimate, newest first, with their own words.
    customerResponses: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'version', 'at', 'message'],
        properties: {
          kind: { type: 'string', enum: ['changes_requested', 'declined', 'update_requested'] },
          version: { type: 'integer' },
          at: DATE_TIME,
          message: NULLABLE_STRING,
        },
      },
    },
    // TSK-0057 (HH-EST-06, HH-EST-08): the customer's approval of this estimate, with the job and scheduling task it
    // created; null while no version is approved.
    customerApproval: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: [
            'version',
            'at',
            'fullName',
            'options',
            'totalCents',
            'depositCents',
            'termsVersion',
            'testMark',
            'jobId',
            'jobState',
            'schedulingTaskState',
          ],
          properties: {
            version: { type: 'integer' },
            at: DATE_TIME,
            fullName: { type: 'string' },
            options: { type: 'array', items: { type: 'integer' } },
            totalCents: { type: 'integer' },
            depositCents: { type: ['integer', 'null'] },
            termsVersion: { type: 'string' },
            testMark: { type: 'boolean' },
            jobId: { type: 'string' },
            jobState: { type: 'string' },
            schedulingTaskState: { type: 'string' },
          },
        },
      ],
    },
    actions: {
      type: 'object',
      additionalProperties: false,
      required: [...ACTIONS],
      properties: Object.fromEntries(ACTIONS.map((a) => [a, { type: 'boolean' }])),
    },
    history: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'versionId',
          'version',
          'state',
          'effectiveState',
          'stateChangedAt',
          'createdBy',
          'createdAt',
          'revisedFromVersion',
          'lastEditedBy',
          'lastEditedAt',
          'publishedBy',
          'publishedAt',
          'validUntil',
          'totalCents',
        ],
        properties: {
          versionId: { type: 'string' },
          version: { type: 'integer' },
          state: STATE,
          effectiveState: STATE,
          stateChangedAt: DATE_TIME,
          createdBy: STAFF_REF,
          createdAt: DATE_TIME,
          revisedFromVersion: { type: ['integer', 'null'] },
          lastEditedBy: STAFF_REF,
          lastEditedAt: DATE_TIME,
          publishedBy: NULLABLE_STAFF_REF,
          publishedAt: NULLABLE_DATE_TIME,
          validUntil: NULLABLE_DATE_TIME,
          totalCents: { type: ['integer', 'null'] },
        },
      },
    },
  },
} as const

export const EMPTY_BODY = { type: 'object', additionalProperties: false, properties: {} } as const

/** PROPOSED: a written reason of at most 1000 characters, kept in the audit log. */
export const REASON_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['reason'],
  properties: { reason: { type: 'string', minLength: 1, maxLength: 1000 } },
} as const

export const OPTIONAL_REASON_BODY = {
  type: 'object',
  additionalProperties: false,
  properties: { reason: { type: 'string', maxLength: 1000 } },
} as const

export const PUBLISHING_SETTING = {
  type: 'object',
  additionalProperties: false,
  required: ['state', 'version', 'roles', 'estimatorsMayPublish'],
  properties: {
    state: { type: 'string', enum: ['CONFIGURED', 'NOT_CONFIGURED'] },
    version: { type: ['integer', 'null'] },
    roles: { type: 'array', items: { type: 'string' } },
    estimatorsMayPublish: { type: 'boolean' },
  },
} as const

export const PUBLISHING_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['estimatorsMayPublish'],
  properties: { estimatorsMayPublish: { type: 'boolean' } },
} as const
