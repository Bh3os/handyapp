// JSON schemas of the Owner publication approvals (TSK-0130; HH-EST-16, HH-API-01, HH-ARC-04). Input objects refuse
// unknown fields; response objects list every field, so nothing undeclared leaves the server.
import {
  PUBLICATION_APPROVAL_BASES,
  PUBLICATION_APPROVAL_FLAGS,
  PUBLICATION_APPROVAL_REASONS,
  PUBLICATION_APPROVAL_STATES,
  PUBLICATION_INVALIDATION_REASONS,
  PUBLICATION_SUBJECTS,
} from '@handyhub/domain'
import { APPROVAL_LIMITS } from './service.js'

const UUID = {
  type: 'string',
  pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
} as const
const NULLABLE_STRING = { type: ['string', 'null'] } as const
const NULLABLE_INT = { type: ['integer', 'null'] } as const
const DATE_TIME = { type: 'string', format: 'date-time' } as const
const NULLABLE_DATE_TIME = { type: ['string', 'null'], format: 'date-time' } as const
const STAFF_REF = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'name'],
  properties: { id: { type: 'string' }, name: NULLABLE_STRING },
} as const
const REASONS = { type: 'array', items: { type: 'string', enum: [...PUBLICATION_APPROVAL_REASONS] } } as const
const FLAGS = { type: 'array', items: { type: 'string', enum: [...PUBLICATION_APPROVAL_FLAGS] } } as const

export const APPROVAL_PARAMS = {
  type: 'object',
  additionalProperties: false,
  required: ['approvalId'],
  properties: { approvalId: UUID },
} as const

/** A linked document of the project, as the splitting check counted it. */
export const LINKED_DOCUMENT = {
  type: 'object',
  additionalProperties: false,
  required: ['reference', 'version', 'state', 'valueCents'],
  properties: {
    kind: { type: 'string', enum: ['estimate', 'change_order'] },
    reference: { type: 'string' },
    version: { type: 'integer' },
    state: { type: 'string' },
    valueCents: { type: 'integer' },
  },
} as const

/** One approval record: what the Owner was shown and what was decided. */
export const APPROVAL_VIEW = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'subjectType',
    'subjectId',
    'projectId',
    'projectReference',
    'reference',
    'documentVersion',
    'state',
    'basis',
    'reasons',
    'flags',
    'proposedTotalCents',
    'highestTotalCents',
    'subtotalCents',
    'discount',
    'changeOrder',
    'combinedProjectCents',
    'thresholdCents',
    'thresholdVersion',
    'linked',
    'costs',
    'requestedBy',
    'requestedAt',
    'decidedBy',
    'decidedAt',
    'comment',
    'invalidatedAt',
    'invalidatedReason',
    'usedAt',
    'rowVersion',
  ],
  properties: {
    id: { type: 'string' },
    subjectType: { type: 'string', enum: [...PUBLICATION_SUBJECTS] },
    subjectId: { type: 'string' },
    projectId: { type: 'string' },
    projectReference: NULLABLE_STRING,
    reference: { type: 'string' },
    documentVersion: { type: 'integer' },
    state: { type: 'string', enum: [...PUBLICATION_APPROVAL_STATES] },
    basis: { type: 'string', enum: [...PUBLICATION_APPROVAL_BASES] },
    reasons: REASONS,
    flags: FLAGS,
    proposedTotalCents: { type: 'integer' },
    highestTotalCents: NULLABLE_INT,
    subtotalCents: NULLABLE_INT,
    discount: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: ['category', 'amountCents'],
          properties: { category: NULLABLE_STRING, amountCents: { type: 'integer' } },
        },
      ],
    },
    changeOrder: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: ['adjustmentCents', 'revisedProjectValueCents'],
          properties: { adjustmentCents: { type: 'integer' }, revisedProjectValueCents: NULLABLE_INT },
        },
      ],
    },
    combinedProjectCents: { type: 'integer' },
    thresholdCents: NULLABLE_INT,
    thresholdVersion: NULLABLE_INT,
    linked: { type: 'array', items: LINKED_DOCUMENT },
    // Staff-only: the known costs, and gross profit and margin only when every cost is known; null for other roles.
    costs: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: ['laborCents', 'materialCents', 'complete', 'grossProfitCents', 'marginBps'],
          properties: {
            laborCents: NULLABLE_INT,
            materialCents: NULLABLE_INT,
            complete: { type: 'boolean' },
            grossProfitCents: NULLABLE_INT,
            marginBps: NULLABLE_INT,
          },
        },
      ],
    },
    requestedBy: STAFF_REF,
    requestedAt: DATE_TIME,
    decidedBy: { anyOf: [{ type: 'null' }, STAFF_REF] },
    decidedAt: NULLABLE_DATE_TIME,
    comment: NULLABLE_STRING,
    invalidatedAt: NULLABLE_DATE_TIME,
    invalidatedReason: { anyOf: [{ type: 'null' }, { type: 'string', enum: [...PUBLICATION_INVALIDATION_REASONS] }] },
    usedAt: NULLABLE_DATE_TIME,
    rowVersion: { type: 'integer' },
  },
} as const

export const APPROVAL_LIST = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: { items: { type: 'array', items: APPROVAL_VIEW } },
} as const

export const DECISION_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['decision'],
  properties: {
    decision: { type: 'string', enum: ['approve', 'reject'] },
    comment: { type: ['string', 'null'], maxLength: APPROVAL_LIMITS.comment + 100 },
  },
} as const

/** The builder's Owner-approval part of an estimate version (estimates module). */
export const OWNER_APPROVAL = {
  anyOf: [
    { type: 'null' },
    {
      type: 'object',
      additionalProperties: false,
      required: ['status', 'evaluation', 'usedApprovalId', 'pendingApprovalId', 'records', 'actions'],
      properties: {
        status: {
          type: 'string',
          enum: ['closed', 'incomplete', 'not_required', 'required', 'pending', 'approved', 'rejected'],
        },
        evaluation: {
          anyOf: [
            { type: 'null' },
            {
              type: 'object',
              additionalProperties: false,
              required: [
                'required',
                'reasons',
                'flags',
                'thresholdCents',
                'thresholdVersion',
                'proposedTotalCents',
                'highestTotalCents',
                'combinedProjectCents',
                'linked',
              ],
              properties: {
                required: { type: 'boolean' },
                reasons: REASONS,
                flags: FLAGS,
                thresholdCents: NULLABLE_INT,
                thresholdVersion: NULLABLE_INT,
                proposedTotalCents: { type: 'integer' },
                highestTotalCents: NULLABLE_INT,
                combinedProjectCents: { type: 'integer' },
                linked: { type: 'array', items: LINKED_DOCUMENT },
              },
            },
          ],
        },
        usedApprovalId: NULLABLE_STRING,
        pendingApprovalId: NULLABLE_STRING,
        records: { type: 'array', items: APPROVAL_VIEW },
        actions: {
          type: 'object',
          additionalProperties: false,
          required: ['request', 'decide', 'publishApproves'],
          properties: {
            request: { type: 'boolean' },
            decide: { type: 'boolean' },
            publishApproves: { type: 'boolean' },
          },
        },
      },
    },
  ],
} as const

/** The Owner's threshold setting (owner_approval.threshold). */
export const THRESHOLD_SETTING = {
  type: 'object',
  additionalProperties: false,
  required: ['state', 'version', 'thresholdCents', 'sourceIds'],
  properties: {
    state: { type: 'string', enum: ['CONFIGURED', 'NOT_CONFIGURED'] },
    version: NULLABLE_INT,
    thresholdCents: NULLABLE_INT,
    sourceIds: { type: 'array', items: { type: 'string' } },
  },
} as const

export const THRESHOLD_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['thresholdCents', 'reason'],
  properties: {
    thresholdCents: { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
    reason: { type: 'string', minLength: 1, maxLength: 1000 },
  },
} as const
