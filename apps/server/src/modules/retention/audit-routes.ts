// The audit-retention workflow's routes (TSK-0135; HH-SEC-08, HH-SEC-06, HH-STAFF-08, OWN-DEC-164, RULE-SERVER-AUTHZ):
//   GET  /staff/audit-retention               the period, the entries past it by month, the chain and the trail counts
//   GET  /staff/audit-retention/range         what archiving or deleting a seq range would do, and what blocks it
//   POST /staff/audit-retention/archive       archive a range (retention justified): kept, with integrity evidence
//   POST /staff/audit-retention/delete        delete a range: every check confirmed, the chain verified first
//   GET  /staff/audit-retention/operations    the protected retention-operation trail
//   GET  /staff/audit-retention/verification  the hash chain recomputed across every archive and deletion boundary
// Reads are the Owner's retention review (ROLE-MATRIX retention.view); the writes are the matrix row "Archive or delete
// audit records past 7 years in the audit-retention workflow" (audit.retention_archive, audit.retention_delete: the
// Owner, fresh sign-in and reason). No other route deletes an audit entry: "Edit or delete audit events" stays refused
// for every role, and the Owner Delete action of the review queue refuses audit entries (AUDIT_APPEND_ONLY).
import type { Tx } from '@handyhub/db'
import { ApiError } from '../../api/errors.js'
import { pageSchema } from '../../api/pagination.js'
import type { ApiContext, RouteDef } from '../../api/route.js'
import { currentContext } from '../../platform/request-context.js'
import { FRESH_AUTH_MINUTES } from '../identity/sessions.js'
import { deletionAllowed, mappingNotReviewed } from './mapping-review.js'
import {
  AUDIT_RETENTION_BLOCKERS,
  AUDIT_RETENTION_CHECKS,
  auditRetentionOverview,
  authorizeAuditRetention,
  listOperations,
  parseRange,
  previewRange,
  verificationView,
} from './audit-retention.js'

const TEST = 'test/integration/audit-retention.test.ts'

const NULLABLE_STRING = { type: ['string', 'null'] } as const
const INSTANT = { type: 'string', format: 'date-time' } as const
const NULLABLE_INSTANT = { type: ['string', 'null'], format: 'date-time' } as const
const SEQ_STRING = { type: 'string', pattern: '^[1-9][0-9]{0,17}$' } as const
const REASON = { type: 'string', minLength: 1, maxLength: 1000, pattern: '\\S' } as const
const CHECK = {
  type: 'object',
  additionalProperties: false,
  required: ['check', 'result'],
  properties: {
    check: { type: 'string', enum: [...AUDIT_RETENTION_CHECKS] },
    result: { type: 'string', enum: ['found', 'none_found', 'not_applicable', 'not_recorded'] },
    count: { type: 'integer' },
  },
} as const
const BLOCKERS = { type: 'array', items: { type: 'string', enum: [...AUDIT_RETENTION_BLOCKERS] } } as const

const POLICY = {
  type: 'object',
  additionalProperties: false,
  required: ['state', 'years', 'version', 'timeZone', 'minimumYears'],
  properties: {
    state: { type: 'string', enum: ['CONFIGURED', 'NOT_CONFIGURED'] },
    years: { type: ['integer', 'null'] },
    version: { type: ['integer', 'null'] },
    timeZone: NULLABLE_STRING,
    minimumYears: { type: 'integer' },
  },
} as const

const OVERVIEW = {
  type: 'object',
  additionalProperties: false,
  required: ['automaticDeletion', 'policy', 'eligible', 'chain', 'operations', 'backups'],
  properties: {
    automaticDeletion: { type: 'boolean', enum: [false] },
    policy: POLICY,
    eligible: {
      type: 'object',
      additionalProperties: false,
      required: ['count', 'months'],
      properties: {
        count: { type: 'integer' },
        months: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['month', 'fromSeq', 'toSeq', 'count', 'archived'],
            properties: {
              month: { type: 'string' },
              fromSeq: { type: 'string' },
              toSeq: { type: 'string' },
              count: { type: 'integer' },
              archived: { type: 'integer' },
            },
          },
        },
      },
    },
    chain: {
      type: 'object',
      additionalProperties: false,
      required: ['seals', 'sealedThrough', 'lastSealedAt'],
      properties: { seals: { type: 'integer' }, sealedThrough: NULLABLE_STRING, lastSealedAt: NULLABLE_INSTANT },
    },
    operations: {
      type: 'object',
      additionalProperties: false,
      required: ['archives', 'deletions', 'deletedEvents'],
      properties: {
        archives: { type: 'integer' },
        deletions: { type: 'integer' },
        deletedEvents: { type: 'integer' },
      },
    },
    backups: { type: 'string', enum: ['NOT_CONFIGURED'] },
  },
} as const

const PREVIEW = {
  type: 'object',
  additionalProperties: false,
  required: ['range', 'notYetEligible', 'archived', 'policy', 'checks', 'confirm', 'blockers', 'permanent', 'backups'],
  properties: {
    range: {
      type: 'object',
      additionalProperties: false,
      required: ['fromSeq', 'toSeq', 'count', 'firstOccurredAt', 'lastOccurredAt', 'periodEndsAt'],
      properties: {
        fromSeq: { type: 'string' },
        toSeq: { type: 'string' },
        count: { type: 'integer' },
        firstOccurredAt: NULLABLE_INSTANT,
        lastOccurredAt: NULLABLE_INSTANT,
        periodEndsAt: NULLABLE_INSTANT,
      },
    },
    notYetEligible: { type: 'integer' },
    archived: { type: 'integer' },
    policy: POLICY,
    checks: { type: 'array', items: CHECK },
    confirm: { type: 'array', items: { type: 'string', enum: [...AUDIT_RETENTION_CHECKS] } },
    blockers: {
      type: 'object',
      additionalProperties: false,
      required: ['archive', 'delete'],
      properties: { archive: BLOCKERS, delete: BLOCKERS },
    },
    permanent: { type: 'boolean', enum: [true] },
    backups: { type: 'string', enum: ['NOT_CONFIGURED'] },
  },
} as const

const OPERATION = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'seq',
    'kind',
    'fromSeq',
    'toSeq',
    'count',
    'firstOccurredAt',
    'lastOccurredAt',
    'hashBefore',
    'hashAfter',
    'sealSeq',
    'policy',
    'years',
    'timeZone',
    'holdChecks',
    'checksConfirmed',
    'reason',
    'authorizedBy',
    'authorizedRoles',
    'freshAuthAt',
    'authorizedAt',
    'reviewEntries',
  ],
  properties: {
    id: { type: 'string' },
    seq: { type: 'string' },
    kind: { type: 'string', enum: ['archive', 'delete'] },
    fromSeq: { type: 'string' },
    toSeq: { type: 'string' },
    count: { type: 'integer' },
    firstOccurredAt: INSTANT,
    lastOccurredAt: INSTANT,
    hashBefore: { type: 'string', pattern: '^[0-9a-f]{64}$' },
    hashAfter: { type: 'string', pattern: '^[0-9a-f]{64}$' },
    sealSeq: { type: 'string' },
    policy: {
      type: 'object',
      additionalProperties: false,
      required: ['key', 'version'],
      properties: { key: { type: 'string' }, version: { type: 'integer' } },
    },
    years: { type: 'integer' },
    timeZone: { type: 'string' },
    holdChecks: { type: 'array', items: CHECK },
    checksConfirmed: { type: 'array', items: { type: 'string' } },
    reason: { type: 'string' },
    authorizedBy: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'name'],
      properties: { id: { type: 'string' }, name: NULLABLE_STRING },
    },
    authorizedRoles: { type: 'array', items: { type: 'string' } },
    freshAuthAt: INSTANT,
    authorizedAt: INSTANT,
    reviewEntries: { type: 'integer' },
  },
} as const

const MISMATCH = {
  type: ['object', 'null'],
  additionalProperties: false,
  required: ['at', 'id', 'seq'],
  properties: {
    at: { type: 'string', enum: ['seal', 'archive_start', 'archive_end', 'deletion', 'deleted_event_present'] },
    id: { type: 'string' },
    seq: { type: 'string' },
  },
} as const

const VERIFICATION = {
  type: 'object',
  additionalProperties: false,
  required: [
    'ok',
    'checkedEvents',
    'seals',
    'sealedThrough',
    'archives',
    'deletions',
    'unsealedEvents',
    'mismatch',
    'verifiedAt',
  ],
  properties: {
    ok: { type: 'boolean' },
    checkedEvents: { type: 'integer' },
    seals: { type: 'integer' },
    sealedThrough: NULLABLE_STRING,
    archives: { type: 'integer' },
    deletions: { type: 'integer' },
    unsealedEvents: { type: 'integer' },
    mismatch: MISMATCH,
    verifiedAt: INSTANT,
  },
} as const

const RESULT = {
  type: 'object',
  additionalProperties: false,
  required: ['operation', 'deleted'],
  properties: { operation: OPERATION, deleted: { type: 'integer' } },
} as const

const read = {
  method: 'GET',
  actors: ['staff'],
  permission: 'retention.view',
  kind: 'read',
  idempotency: 'none',
  expectedVersion: 'none',
  rateLimit: 'none',
  audit: 'none',
  pagination: false,
  test: TEST,
} as const

const requestIdOf = (ctx: ApiContext) => currentContext()?.requestId ?? ctx.req.id

/** The archive and delete routes: the same body and outcome, the delete with its confirmations. */
function writeRoute(kind: 'archive' | 'delete', environment: string): RouteDef {
  const del = kind === 'delete'
  return {
    method: 'POST',
    path: `/staff/audit-retention/${kind}`,
    operationId: del ? 'deleteAuditRecords' : 'archiveAuditRecords',
    summary: del ? 'Delete audit records past their retention period' : 'Archive audit records past their period',
    description: del
      ? 'Owner only (ROLE-MATRIX audit.retention_delete: fresh sign-in and a written reason; OWN-DEC-164). Deletes ' +
        'the audit entries of a seq range (both ends existing entries, at most AUDIT_RETENTION_MAX_EVENTS, PROPOSED) ' +
        'when every one is past its period (retention.audit_log years, at least 7, calendar years in the business ' +
        'time zone), no open hold or case is found on the projects their records belong to, the range overlaps no ' +
        'earlier deletion, and confirmedChecks lists every check the software does not record (legal holds, ' +
        'litigation, investigations, disputes, tax, accounting and contractual requirements, security incidents and ' +
        'the rest). The chain is sealed and verified first; the operation (Owner, roles, fresh sign-in time, reason, ' +
        'range, counts, times, hold checks, the chain hashes before and at the end of the range and the seal) is ' +
        'written to the protected retention-operation trail and the database deletes the range in the same ' +
        'transaction, its only delete path. Never automatic. Audited (retention.audit_delete), refusals as denied. ' +
        'Refusals: FRESH_AUTH_REQUIRED, CONFLICT (NOT_CONFIGURED, RANGE_MISSING, RANGE_TOO_LARGE, NOT_ELIGIBLE, ' +
        'HOLD_FOUND, OVERLAPS_DELETION, CHAIN_BROKEN, MAPPING_NOT_REVIEWED: in production until the Owner records ' +
        'a review of the table-to-retention mapping confirmed by the CPA and the attorney, TSK-0152), ' +
        'VALIDATION_FAILED (CHECK_NOT_CONFIRMED, reason, range).'
      : 'Owner only (ROLE-MATRIX audit.retention_archive: fresh sign-in and a written reason; OWN-DEC-164 point 5). ' +
        'Archives the audit entries of a seq range past their period when their retention is justified: the entries ' +
        'stay exactly as they are, the chain is sealed and verified, the operation with the range’s chain hashes is ' +
        'written to the retention-operation trail, and the range’s deletion-review entries leave the open queue (an ' +
        'archive decision each). Holds do not block an archive. Audited (retention.audit_archive), refusals as ' +
        'denied. Refusals: FRESH_AUTH_REQUIRED, CONFLICT (NOT_CONFIGURED, RANGE_MISSING, RANGE_TOO_LARGE, ' +
        'NOT_ELIGIBLE, ALREADY_ARCHIVED, CHAIN_BROKEN), VALIDATION_FAILED (reason, range).',
    actors: ['staff'],
    permission: del ? 'audit.retention_delete' : 'audit.retention_archive',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'none',
    rateLimit: 'none',
    freshAuthMinutes: FRESH_AUTH_MINUTES,
    audit: del ? 'retention.audit_delete' : 'retention.audit_archive',
    pagination: false,
    test: TEST,
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: del ? ['fromSeq', 'toSeq', 'reason', 'confirmedChecks'] : ['fromSeq', 'toSeq', 'reason'],
        properties: {
          fromSeq: SEQ_STRING,
          toSeq: SEQ_STRING,
          reason: REASON,
          ...(del
            ? {
                confirmedChecks: {
                  type: 'array',
                  maxItems: 30,
                  uniqueItems: true,
                  items: { type: 'string', maxLength: 40 },
                },
              }
            : {}),
        },
      },
      response: { 200: RESULT },
    },
    handler: async (ctx) => {
      if (ctx.actor.kind !== 'staff' || !ctx.authenticatedAt) throw new ApiError('FORBIDDEN')
      const body = ctx.req.body as { fromSeq: string; toSeq: string; reason: string; confirmedChecks?: string[] }
      const range = parseRange(body.fromSeq, body.toSeq, 'body')
      // TSK-0152 (OWN-DEC-201 I5): no destructive production deletion on an unreviewed mapping.
      if (del && !(await deletionAllowed(ctx.tx as Tx, environment))) {
        await ctx.audit({
          target: { type: 'audit_retention_range' },
          result: 'denied',
          summary: {
            fromSeq: body.fromSeq,
            toSeq: body.toSeq,
            blockers: ['mapping_not_reviewed'],
            refused: ['MAPPING_NOT_REVIEWED'],
          },
          reason: body.reason.trim(),
          stepUpUsed: true,
        })
        return { body: null, refusal: mappingNotReviewed() }
      }
      const out = await authorizeAuditRetention(ctx.tx as Tx, {
        kind,
        range,
        reason: body.reason,
        confirmedChecks: body.confirmedChecks ?? [],
        staff: { id: ctx.actor.userId, roles: ctx.actor.roles },
        freshAuthAt: ctx.authenticatedAt,
        requestId: requestIdOf(ctx),
      })
      const summaryRange = { fromSeq: body.fromSeq, toSeq: body.toSeq }
      if (!out.ok) {
        await ctx.audit({
          target: { type: 'audit_retention_range' },
          result: 'denied',
          summary: {
            ...summaryRange,
            blockers: [...out.blockers],
            refused: out.error.options.fieldErrors?.map((f) => f.code) ?? [],
          },
          reason: body.reason.trim(),
          stepUpUsed: true,
        })
        return { body: null, refusal: out.error }
      }
      const op = out.operation
      // The range, counts, times and the integrity evidence; never the deleted entries' content.
      await ctx.audit({
        target: { type: 'audit_retention_operation', id: op.id },
        summary: {
          ...summaryRange,
          count: op.count,
          firstOccurredAt: op.firstOccurredAt,
          lastOccurredAt: op.lastOccurredAt,
          chainStart: op.hashBefore,
          chainEnd: op.hashAfter,
          sealSeq: op.sealSeq,
          years: op.years,
          timeZone: op.timeZone,
          checksConfirmed: [...op.checksConfirmed],
          ...(del ? { deleted: out.deleted } : { reviewEntries: op.reviewEntries }),
        },
        reason: body.reason.trim(),
        stepUpUsed: true,
      })
      return { body: { operation: op, deleted: out.deleted } }
    },
  }
}

export function auditRetentionRoutes(environment: string): RouteDef[] {
  const overview: RouteDef = {
    ...read,
    path: '/staff/audit-retention',
    operationId: 'getAuditRetention',
    summary: 'The audit-retention workflow',
    description:
      'Owner only (ROLE-MATRIX retention.view). The audit-log period as configured (retention.audit_log years, at ' +
      'least 7 by OWN-DEC-164, counted in calendar years in the business time zone; NOT CONFIGURED while either is ' +
      'missing), how many audit entries are past it with their oldest calendar months (first and last seq, count, ' +
      'how many an archive covers), the hash chain’s seals, and how many archives and deletions the ' +
      'retention-operation trail holds. Nothing is deleted automatically; database backups keep copies until they ' +
      'expire under a backup policy that is NOT CONFIGURED.',
    schema: { response: { 200: OVERVIEW } },
    handler: async (ctx) => ({ body: await auditRetentionOverview(ctx.db) }),
  }

  const range: RouteDef = {
    ...read,
    path: '/staff/audit-retention/range',
    operationId: 'getAuditRetentionRange',
    summary: 'What archiving or deleting a range of audit entries would do',
    description:
      'Owner only (ROLE-MATRIX retention.view). For a seq range: how many entries exist, their first and last times, ' +
      'when the last one’s period ends, how many are not past it yet and how many an archive covers, every check ' +
      '(open holds and open cases on the projects their records belong to; the rest not recorded, the Owner’s ' +
      'confirmation), the checks a deletion needs confirmed, and what blocks an archive or a deletion. Read-only.',
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        required: ['fromSeq', 'toSeq'],
        properties: { fromSeq: SEQ_STRING, toSeq: SEQ_STRING },
      },
      response: { 200: PREVIEW },
    },
    handler: async (ctx) => {
      const q = ctx.req.query as { fromSeq: string; toSeq: string }
      return { body: await previewRange(ctx.db, parseRange(q.fromSeq, q.toSeq, 'querystring')) }
    },
  }

  const operations: RouteDef = {
    ...read,
    path: '/staff/audit-retention/operations',
    operationId: 'listAuditRetentionOperations',
    summary: 'The retention-operation trail',
    description:
      'Owner only (ROLE-MATRIX retention.view). Every archive and deletion of audit entries, newest first: who ' +
      'authorized it (and with which roles, after which fresh sign-in), the reason, the range, how many entries, ' +
      'their first and last times, the period and time zone applied, the hold checks and the confirmed checks, and ' +
      'the integrity evidence (the chain hashes before and at the end of the range, the seal). Append-only in the ' +
      'database; never the deleted entries’ content.',
    pagination: true,
    schema: { response: { 200: pageSchema(OPERATION) } },
    handler: async (ctx) => ({ body: await listOperations(ctx.db, ctx.page as NonNullable<ApiContext['page']>) }),
  }

  const verification: RouteDef = {
    ...read,
    path: '/staff/audit-retention/verification',
    operationId: 'verifyAuditChain',
    summary: 'Verify the audit hash chain',
    description:
      'Owner only (ROLE-MATRIX retention.view). Recomputes the hash chain from the audit entries that exist, in seq ' +
      'order, and compares it with every seal and with the evidence of every archive and deletion (across a ' +
      'deletion it continues from the hash the operation recorded): ok, how many entries were checked, the sealed ' +
      'seq, the entries recorded after the last seal (sealed by the next daily run), and the first mismatch.',
    schema: { response: { 200: VERIFICATION } },
    handler: async (ctx) => ({ body: await verificationView(ctx.db) }),
  }

  return [
    overview,
    range,
    writeRoute('archive', environment),
    writeRoute('delete', environment),
    operations,
    verification,
  ]
}
