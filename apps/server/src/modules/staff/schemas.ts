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
      required: ['id', 'kind', 'name', 'issuedBy', 'reason', 'effectiveFrom', 'endedAt', 'endedBy'],
      properties: {
        id: UUID,
        kind: { type: 'string', enum: ['role', 'capability'] },
        name: { type: 'string' },
        issuedBy: BY,
        reason: NULLABLE_STRING,
        effectiveFrom: INSTANT,
        endedAt: NULLABLE_INSTANT,
        endedBy: BY,
      },
    },
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
  properties: { ...GRANT_PROPERTIES, reason: REASON },
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

export const LINK_SENT = {
  type: 'object',
  additionalProperties: false,
  required: ['member', 'linkSent'],
  properties: { member: MEMBER, linkSent: { type: 'string', enum: ['reset', 'invite'] } },
} as const
