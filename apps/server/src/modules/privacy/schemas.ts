// Response and parameter schemas of the privacy module's staff routes (TSK-0100). Every object lists its fields.
import { pageSchema } from '../../api/pagination.js'
import type { JsonSchema } from '../../api/route.js'
import { PRIVACY_DEADLINE_ALERTS } from '@handyhub/domain'
import { RETENTION_CATEGORIES } from '../retention/schedule.js'
import { DISPOSITIONS, PLAN_CATEGORIES, RETAIN_REASONS } from './plan.js'
import { PRIVACY_REQUEST_KINDS, PRIVACY_REQUEST_STATES } from './requests.js'
import { BLOCKERS, DELETION_CHECKS, TARGET_TYPES } from './targets.js'

const STRING = { type: 'string' } as const
const NULLABLE_STRING = { type: ['string', 'null'] } as const
const DATE = { type: 'string', format: 'date-time' } as const
const NULLABLE_DATE = { type: ['string', 'null'], format: 'date-time' } as const
const INT = { type: 'integer' } as const
const NULLABLE_INT = { type: ['integer', 'null'] } as const
const DAY = { type: 'string', format: 'date' } as const
const NULLABLE_DAY = { type: ['string', 'null'], format: 'date' } as const
const UUID_PATTERN = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
const enumOf = (values: readonly string[]) => ({ type: 'string', enum: [...values] }) as const
const object = (fields: Record<string, JsonSchema>, optional: readonly string[] = []): JsonSchema => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(fields).filter((k) => !optional.includes(k)),
  properties: fields,
})

export const STAFF_REQUEST_PARAMS = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: { id: { type: 'string', pattern: UUID_PATTERN } },
} as const

export const REVIEW_PARAMS = {
  type: 'object',
  additionalProperties: false,
  required: ['reviewId'],
  properties: { reviewId: { type: 'string', pattern: UUID_PATTERN } },
} as const

const CHECK = object(
  {
    check: enumOf(DELETION_CHECKS),
    result: enumOf(['found', 'none_found', 'not_applicable', 'not_recorded']),
    count: INT,
  },
  ['count'],
)

export const PLAN_ITEM = object({
  category: enumOf(PLAN_CATEGORIES),
  disposition: enumOf(DISPOSITIONS),
  count: INT,
  reason: { type: ['string', 'null'], enum: [...RETAIN_REASONS, null] },
  retention: { type: ['string', 'null'], enum: [...RETENTION_CATEGORIES, null] },
  years: { type: ['integer', 'null'] },
  reviewAt: NULLABLE_DATE,
})

const OUTCOME = object({
  deleted: { type: 'array', items: object({ category: enumOf(PLAN_CATEGORIES), count: INT }) },
  retained: { type: 'array', items: PLAN_ITEM },
  excluded: { type: 'array', items: PLAN_ITEM },
  exportReady: { type: 'boolean' },
  accessClosed: { type: 'boolean' },
})

/** TSK-0136: the request's dates as counted at receipt, the target in force, the legal deadline and the alerts. */
export const DEADLINES = object({
  state: enumOf(['CONFIGURED', 'NOT_CONFIGURED']),
  receivedOn: NULLABLE_DAY,
  zone: NULLABLE_STRING,
  calendarVersion: NULLABLE_INT,
  targetsVersion: NULLABLE_INT,
  acknowledgedAt: NULLABLE_DATE,
  acknowledgmentDueOn: NULLABLE_DAY,
  substantiveAcknowledgedAt: NULLABLE_DATE,
  targetDueOn: NULLABLE_DAY,
  targetOn: NULLABLE_DAY,
  extensions: {
    type: 'array',
    items: object({ previousTargetOn: DAY, targetOn: DAY, reason: STRING, decidedAt: DATE }),
  },
  legalDeadline: object({ on: NULLABLE_DAY, note: NULLABLE_STRING, recordedAt: NULLABLE_DATE }),
  today: NULLABLE_DAY,
  alerts: { type: 'array', items: enumOf(PRIVACY_DEADLINE_ALERTS) },
})

const REQUEST_FIELDS = {
  id: STRING,
  reference: STRING,
  kind: enumOf(PRIVACY_REQUEST_KINDS),
  state: enumOf(PRIVACY_REQUEST_STATES),
  details: NULLABLE_STRING,
  submittedAt: DATE,
  reviewStartedAt: NULLABLE_DATE,
  decidedAt: NULLABLE_DATE,
  version: INT,
  project: object({ reference: STRING }),
  customer: object({ name: STRING }),
  contact: object({ name: STRING, email: NULLABLE_STRING, phone: NULLABLE_STRING }),
  account: { type: 'boolean' },
  accessClosed: { type: ['boolean', 'null'] },
  outcome: { oneOf: [{ type: 'null' }, OUTCOME] },
  // TSK-0136: what the customer is shown of the dates (the staff view adds `deadlines`).
  acknowledgedAt: NULLABLE_DATE,
  acknowledgmentDueOn: NULLABLE_DAY,
  targetOn: NULLABLE_DAY,
  extensions: { type: 'array', items: object({ targetOn: DAY, reason: STRING, decidedAt: DATE }) },
  deadlines: DEADLINES,
} as const

export const REQUEST_ITEM = object(REQUEST_FIELDS)

export const REQUEST_DETAIL = object({
  ...REQUEST_FIELDS,
  plan: object({
    items: { type: 'array', items: PLAN_ITEM },
    checks: { type: 'array', items: CHECK },
    confirm: { type: 'array', items: enumOf(DELETION_CHECKS) },
    deletable: object({
      estimates: { type: 'array', items: object({ id: STRING, reference: STRING, projectId: STRING }) },
      accountIds: { type: 'array', items: STRING },
      grantIds: { type: 'array', items: STRING },
      sessions: INT,
    }),
  }),
  findings: {
    oneOf: [
      { type: 'null' },
      object({
        items: { type: 'array', items: PLAN_ITEM },
        checks: { type: 'array', items: CHECK },
        at: DATE,
      }),
    ],
  },
})

const LINKED = { type: 'array', items: object({ kind: STRING, count: INT }) } as const
const STATUS = object({
  state: enumOf(['pending', 'archived', 'kept', 'deleted']),
  until: NULLABLE_DATE,
  decidedAt: NULLABLE_DATE,
  reason: NULLABLE_STRING,
})
export const ENTRY_STATUS = STATUS

export const DELETION_DETAIL = object({
  entry: object({ id: STRING, category: STRING, reference: STRING, periodEndsAt: DATE }),
  status: STATUS,
  early: { type: 'boolean' },
  target: object({
    record: object({ type: enumOf(TARGET_TYPES), id: STRING, reference: STRING, projectId: NULLABLE_STRING }),
    exists: { type: 'boolean' },
    permanent: { type: 'boolean' },
    removes: LINKED,
    keeps: LINKED,
    checks: { type: 'array', items: CHECK },
    blockers: { type: 'array', items: enumOf(BLOCKERS) },
    confirm: { type: 'array', items: enumOf(DELETION_CHECKS) },
  }),
})

export const ENTRY_DECISION = object({
  status: object({ state: enumOf(['pending', 'archived', 'kept', 'deleted']) }),
  deletionId: NULLABLE_STRING,
  blockers: { type: 'array', items: enumOf(BLOCKERS) },
})

const DELETION = object({
  id: STRING,
  seq: STRING,
  record: object({ type: STRING, id: STRING, reference: STRING }),
  source: enumOf(['retention_review', 'privacy_request', 'restore_reapply']),
  reason: STRING,
  early: { type: 'boolean' },
  permanent: { type: 'boolean' },
  removed: { type: 'object', additionalProperties: INT, properties: {} },
  checksConfirmed: { type: 'array', items: STRING },
  decidedBy: {
    oneOf: [object({ id: STRING, name: NULLABLE_STRING }), object({ system: STRING })],
  },
  decidedAt: DATE,
  original: { oneOf: [{ type: 'null' }, object({ id: STRING, decidedAt: DATE })] },
})

export const DELETION_PAGE = pageSchema(DELETION)
