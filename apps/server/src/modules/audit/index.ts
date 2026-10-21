// Audit-log module (TSK-0098; HH-SEC-06, HH-STAFF-08, S09, T28, T64, T74, ENT-AuditEvent, OWN-DEC-123, OWN-DEC-142,
// RULE-SERVER-AUTHZ). The staff audit-log screen's reads:
//   GET /staff/audit-log      who sees what (all or own actions), the retention rule and, for the Owner, how many
//                             entries are past it and the staff list of the actor filter
//   GET /staff/audit-events   the entries, newest first, filtered (area, action, result, actor, record, dates) and
//                             paged; Owner every entry, Office their own actions (ROLE-MATRIX audit.view)
// There is no write: entries cannot be edited or deleted through the app or the API (ROLE-MATRIX audit.edit and
// audit.delete are refused for every role; the table rejects UPDATE and DELETE, migration 0002).
import type { ApiContext, ApiModule, RouteDef } from '../../api/route.js'
import { pageSchema } from '../../api/pagination.js'
import { auditOverview, listAuditEntries, type AuditFilters } from './log.js'

const TEST = 'test/integration/audit-log.test.ts'

const UUID = {
  type: 'string',
  pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
} as const
const NULLABLE_STRING = { type: ['string', 'null'] } as const
const RESULT = { type: 'string', enum: ['succeeded', 'denied', 'failed'] } as const

/**
 * The policy's record facts for both reads: the caller's own entries. The Owner's rule (scope any) needs no fact; the
 * Office rule (own_staff) holds for the caller's own entries, and the query then reads only those (ctx.scope).
 * Estimators and Workers hold no audit.view rule and are refused.
 */
const ownEntries: NonNullable<RouteDef['resource']> = async ({ actor }) =>
  actor.kind === 'staff' ? { ownerStaffId: actor.userId } : {}

const read = {
  actors: ['staff'],
  permission: 'audit.view',
  kind: 'read',
  idempotency: 'none',
  expectedVersion: 'none',
  rateLimit: 'none',
  audit: 'none',
  test: TEST,
  resource: ownEntries,
} as const

const FIELD = {
  type: 'object',
  additionalProperties: false,
  required: ['path', 'value'],
  properties: { path: { type: 'string' }, value: { type: ['string', 'number', 'boolean', 'null'] } },
} as const

const ENTRY = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'seq',
    'occurredAt',
    'actor',
    'action',
    'area',
    'target',
    'result',
    'reason',
    'stepUpUsed',
    'requestId',
    'changes',
  ],
  properties: {
    id: { type: 'string' },
    seq: { type: 'string' },
    occurredAt: { type: 'string', format: 'date-time' },
    actor: {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'staffUserId', 'name', 'roles', 'process'],
      properties: {
        kind: { type: 'string', enum: ['staff', 'customer', 'guest', 'system'] },
        staffUserId: NULLABLE_STRING,
        name: NULLABLE_STRING,
        roles: { type: 'array', items: { type: 'string' } },
        process: NULLABLE_STRING,
      },
    },
    action: { type: 'string' },
    area: { type: 'string' },
    target: {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'id', 'version'],
      properties: { type: { type: 'string' }, id: NULLABLE_STRING, version: { type: ['integer', 'null'] } },
    },
    result: RESULT,
    reason: NULLABLE_STRING,
    stepUpUsed: { type: 'boolean' },
    requestId: { type: 'string' },
    changes: { type: 'array', items: FIELD },
  },
} as const

const OVERVIEW = {
  type: 'object',
  additionalProperties: false,
  required: ['visibility', 'timeZone', 'retention', 'staff'],
  properties: {
    visibility: { type: 'string', enum: ['all', 'own'] },
    timeZone: NULLABLE_STRING,
    retention: {
      type: 'object',
      additionalProperties: false,
      required: [
        'state',
        'years',
        'afterPeriod',
        'automaticDeletion',
        'holdsKeepRecords',
        'version',
        'sourceIds',
        'awaitingConfirmation',
        'pastPeriod',
        'oldestAt',
      ],
      properties: {
        state: { type: 'string', enum: ['CONFIGURED', 'NOT_CONFIGURED'] },
        years: { type: ['integer', 'null'] },
        afterPeriod: { type: ['string', 'null'] },
        automaticDeletion: { type: 'boolean', enum: [false] },
        holdsKeepRecords: { type: ['boolean', 'null'] },
        version: { type: ['integer', 'null'] },
        sourceIds: { type: 'array', items: { type: 'string' } },
        awaitingConfirmation: { type: 'boolean' },
        pastPeriod: { type: ['integer', 'null'] },
        oldestAt: { type: ['string', 'null'] },
      },
    },
    staff: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'name'],
        properties: { id: { type: 'string' }, name: NULLABLE_STRING },
      },
    },
  },
} as const

const LIST_QUERY = {
  type: 'object',
  additionalProperties: false,
  properties: {
    area: { type: 'string', pattern: '^[a-z][a-z0-9_]{0,59}$' },
    action: { type: 'string', maxLength: 120, pattern: '^[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)+$' },
    result: RESULT,
    actor: UUID,
    targetType: { type: 'string', pattern: '^[a-z][a-z0-9_]{0,59}$' },
    targetId: { type: 'string', minLength: 1, maxLength: 100 },
    from: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    to: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
  },
} as const

export function auditModule(): ApiModule {
  const overview: RouteDef = {
    ...read,
    method: 'GET',
    path: '/staff/audit-log',
    operationId: 'getAuditLogOverview',
    summary: 'The audit-log screen: visibility and retention',
    description:
      'Owner and Office (ROLE-MATRIX audit.view; Estimators and Workers are refused). Says whether the caller sees ' +
      'every entry (Owner) or only their own actions (Office); the business time zone the date filters use; the ' +
      'retention rule (retention.audit_log: 7 years, then the owner deletion review, never deleted automatically, ' +
      'a hold keeps the record; awaiting CPA and attorney confirmation, OQ-RETENTION-REVIEW); and, for the Owner ' +
      'only, how many entries are past the period, the oldest entry time and the staff the actor filter offers.',
    pagination: false,
    schema: { response: { 200: OVERVIEW } },
    handler: async (ctx: ApiContext) => ({ body: await auditOverview(ctx.db, ctx.scope, new Date()) }),
  }

  const list: RouteDef = {
    ...read,
    method: 'GET',
    path: '/staff/audit-events',
    operationId: 'listAuditEvents',
    summary: 'Audit entries',
    description:
      'Owner: every entry; Office: only the entries of actions they performed themselves (ROLE-MATRIX audit.view, ' +
      'own actions), applied before filters and paging, so no filter or cursor reaches another person’s ' +
      'entry. Newest first; filters: area (the action prefix), action, result, actor (a staff ID), record type and ' +
      'ID, from and to (local dates in the business time zone, both included). Each entry: who (staff name and ' +
      'roles, or customer, guest or system), when, the action, the affected record and version, the result, the ' +
      'reason, whether a fresh sign-in was used, the request correlation ID and the change summary as path and ' +
      'value pairs, redacted again on the way out (never a password, token, code or message content). Read-only.',
    pagination: true,
    schema: { querystring: LIST_QUERY, response: { 200: pageSchema(ENTRY) } },
    handler: async (ctx: ApiContext) => {
      const page = ctx.page as NonNullable<ApiContext['page']>
      const q = ctx.req.query as AuditFilters
      return { body: await listAuditEntries(ctx.db, ctx.scope, q, page) }
    },
  }

  return { name: 'audit', routes: [overview, list] }
}
