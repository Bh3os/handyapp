// JSON schemas of the staff management routes (TSK-0097; HH-API-01, HH-ARC-04). Input objects refuse unknown fields;
// response objects list every field. Never a password hash, a token or a link.
import { CAPABILITIES, STAFF_ROLES } from '@handyhub/policy'

const UUID = {
  type: 'string',
  pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
} as const
const INSTANT = { type: 'string', format: 'date-time' } as const
const NULLABLE_INSTANT = { anyOf: [INSTANT, { type: 'null' }] } as const
const NULLABLE_STRING = { type: ['string', 'null'] } as const
const STATUS = { type: 'string', enum: ['invited', 'active', 'disabled'] } as const
const REASON = { type: 'string', minLength: 1, maxLength: 2000 } as const
const DATE = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } as const

/** The training a collect grant records (TSK-0151, OWN-DEC-200 H4; PROPOSED: the date and what it covered). */
const TRAINING_PROPERTIES = {
  completedOn: DATE,
  description: { type: 'string', minLength: 1, maxLength: 2000 },
} as const
const TRAINING_INPUT = {
  type: 'object',
  additionalProperties: false,
  required: ['completedOn', 'description'],
  properties: TRAINING_PROPERTIES,
} as const
const TRAINING = {
  anyOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['completedOn', 'description'],
      properties: { completedOn: DATE, description: { type: 'string' } },
    },
    { type: 'null' },
  ],
} as const

export const MEMBER_PARAMS = {
  type: 'object',
  additionalProperties: false,
  required: ['staffUserId'],
  properties: { staffUserId: UUID },
} as const

const BY = {
  anyOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['staffUserId', 'name', 'system'],
      properties: {
        staffUserId: { anyOf: [UUID, { type: 'null' }] },
        name: NULLABLE_STRING,
        system: { type: 'boolean' },
      },
    },
    { type: 'null' },
  ],
} as const

const SUMMARY_PROPERTIES = {
  id: UUID,
  displayName: NULLABLE_STRING,
  email: { type: 'string' },
  locale: { type: 'string', enum: ['en', 'es'] },
  status: STATUS,
  self: { type: 'boolean' },
  roles: { type: 'array', items: { type: 'string', enum: [...STAFF_ROLES] } },
  capabilities: { type: 'array', items: { type: 'string', enum: [...CAPABILITIES] } },
  invitedAt: INSTANT,
  activatedAt: NULLABLE_INSTANT,
  disabledAt: NULLABLE_INSTANT,
  passwordSet: { type: 'boolean' },
  mfaEnrolled: { type: 'boolean' },
  liveSessions: { type: 'integer' },
  upcomingAssignments: { type: 'integer' },
  flaggedAssignments: { type: 'integer' },
  permissionReviewOpen: { type: 'boolean' },
  version: { type: 'integer' },
} as const

const SUMMARY = {
  type: 'object',
  additionalProperties: false,
  required: Object.keys(SUMMARY_PROPERTIES),
  properties: SUMMARY_PROPERTIES,
} as const

export const MEMBERS = {
  type: 'object',
  additionalProperties: false,
  required: ['members'],
  properties: { members: { type: 'array', items: SUMMARY } },
} as const

const DETAIL_PROPERTIES = {
  ...SUMMARY_PROPERTIES,
  grants: {
    type: 'array',
    items: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'kind', 'name', 'issuedBy', 'reason', 'effectiveFrom', 'endedAt', 'endedBy', 'training'],
      properties: {
        id: UUID,
        kind: { type: 'string', enum: ['role', 'capability'] },
        name: { type: 'string' },
        issuedBy: BY,
        reason: NULLABLE_STRING,
        effectiveFrom: INSTANT,
        endedAt: NULLABLE_INSTANT,
        endedBy: BY,
        training: TRAINING,
      },
    },
  },
  // TSK-0151 (OWN-DEC-200 H1, H3): the open permission review of a reactivated account, each earlier grant with the
  // Owner's decision so far.
  permissionReview: {
    anyOf: [
      {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'openedAt', 'openedBy', 'items'],
        properties: {
          id: UUID,
          openedAt: INSTANT,
          openedBy: BY,
          items: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: [
                'id',
                'earlierGrantId',
                'kind',
                'name',
                'decision',
                'decidedAt',
                'decidedBy',
                'reason',
                'grantId',
              ],
              properties: {
                id: UUID,
                earlierGrantId: UUID,
                kind: { type: 'string', enum: ['role', 'capability'] },
                name: { type: 'string' },
                decision: { anyOf: [{ type: 'string', enum: ['restored', 'declined'] }, { type: 'null' }] },
                decidedAt: NULLABLE_INSTANT,
                decidedBy: BY,
                reason: NULLABLE_STRING,
                grantId: { anyOf: [UUID, { type: 'null' }] },
              },
            },
          },
        },
      },
      { type: 'null' },
    ],
  },
  statusHistory: {
    type: 'array',
    items: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'from', 'to', 'by', 'reason', 'at'],
      properties: { id: UUID, from: STATUS, to: STATUS, by: BY, reason: NULLABLE_STRING, at: INSTANT },
    },
  },
  assignments: {
    type: 'array',
    items: {
      type: 'object',
      additionalProperties: false,
      required: [
        'reservationId',
        'visitId',
        'requestId',
        'reference',
        'purpose',
        'visitState',
        'role',
        'kind',
        'startsAt',
        'endsAt',
        'timeZone',
        'flags',
      ],
      properties: {
        reservationId: UUID,
        visitId: UUID,
        requestId: { anyOf: [UUID, { type: 'null' }] },
        reference: { type: 'string' },
        purpose: { type: 'string' },
        visitState: { type: 'string' },
        role: NULLABLE_STRING,
        kind: { type: 'string', enum: ['hold', 'confirmed'] },
        startsAt: INSTANT,
        endsAt: INSTANT,
        timeZone: { type: 'string' },
        flags: { type: 'array', items: { type: 'string' } },
      },
    },
  },
} as const

export const MEMBER = {
  type: 'object',
  additionalProperties: false,
  required: Object.keys(DETAIL_PROPERTIES),
  properties: DETAIL_PROPERTIES,
} as const

const GRANT_PROPERTIES = {
  kind: { type: 'string', enum: ['role', 'capability'] },
  name: { type: 'string', enum: [...STAFF_ROLES, ...CAPABILITIES] },
} as const

export const GRANT_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'name', 'reason'],
  properties: { ...GRANT_PROPERTIES, reason: REASON, training: TRAINING_INPUT },
} as const

/** Restores one earlier grant of a permission review (TSK-0151); a collect grant records the training again. */
export const RESTORE_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['itemId', 'reason'],
  properties: { itemId: UUID, reason: REASON, training: TRAINING_INPUT },
} as const

/** Declines one earlier grant of a permission review (TSK-0151); the reason is optional (protective). */
export const DECLINE_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['itemId'],
  properties: { itemId: UUID, reason: REASON },
} as const

export const END_GRANT_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'name'],
  properties: { ...GRANT_PROPERTIES, reason: REASON },
} as const

export const DISABLE_BODY = {
  type: 'object',
  additionalProperties: false,
  properties: { reason: REASON },
} as const

export const ENABLE_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['reason'],
  properties: { reason: REASON },
} as const

export const EMPTY_BODY = { type: 'object', additionalProperties: false, properties: {} } as const

export const DISABLED = {
  type: 'object',
  additionalProperties: false,
  required: ['member', 'sessionsRevoked', 'linksInvalidated', 'upcomingAssignments', 'flagged'],
  properties: {
    member: MEMBER,
    sessionsRevoked: { type: 'integer' },
    linksInvalidated: { type: 'integer' },
    upcomingAssignments: { type: 'integer' },
    flagged: { type: 'integer' },
  },
} as const

/** The Owner's reset of a staff member's authenticator (TSK-0154). */
export const MFA_RESET = {
  type: 'object',
  additionalProperties: false,
  required: ['member', 'sessionsRevoked', 'recoveryCodesRemoved'],
  properties: {
    member: MEMBER,
    sessionsRevoked: { type: 'integer' },
    recoveryCodesRemoved: { type: 'integer' },
  },
} as const

/** Re-enabling (TSK-0151): the link sent and the earlier grants now waiting for the Owner's permission review. */
export const ENABLED = {
  type: 'object',
  additionalProperties: false,
  required: ['member', 'linkSent', 'grantsEnded'],
  properties: {
    member: MEMBER,
    linkSent: { type: 'string', enum: ['reset', 'invite'] },
    grantsEnded: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'name'],
        properties: { kind: { type: 'string', enum: ['role', 'capability'] }, name: { type: 'string' } },
      },
    },
  },
} as const

export const LINK_SENT = {
  type: 'object',
  additionalProperties: false,
  required: ['member', 'linkSent'],
  properties: { member: MEMBER, linkSent: { type: 'string', enum: ['reset', 'invite'] } },
} as const
