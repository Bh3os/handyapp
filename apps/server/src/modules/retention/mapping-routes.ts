// The routes of the table-to-retention mapping review (TSK-0152; OWN-DEC-201 I5, HH-PRIV-01, HH-PRIV-05, ROLE-MATRIX,
// RULE-SERVER-AUTHZ):
//   GET  /staff/retention-mapping           the mapping's digest, findings and categories, the live audit of this
//                                           database, the latest review and whether production deletion is enabled
//   POST /staff/retention-mapping/reviews   the Owner records a review of the mapping in force (fresh sign-in)
// PROPOSED mappings: reading it is retention.view; recording a review sits in the Delete action's row (records.delete),
// as it is what enables deletion in production.
import type { Tx } from '@handyhub/db'
import { ApiError } from '../../api/errors.js'
import type { ApiContext, JsonSchema, RouteDef } from '../../api/route.js'
import { currentContext } from '../../platform/request-context.js'
import { FRESH_AUTH_MINUTES } from '../identity/sessions.js'
import { MAPPING_FINDINGS, MAPPING_NOTE_MAX, mappingStatus, recordMappingReview } from './mapping-review.js'
import { RETENTION_CATEGORIES } from './schedule.js'

const TEST = 'test/integration/privacy-refinements.test.ts'

const STRING = { type: 'string' } as const
const STRINGS = { type: 'array', items: STRING } as const
const object = (fields: Record<string, JsonSchema>): JsonSchema => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(fields),
  properties: fields,
})

const REVIEW = object({
  id: STRING,
  digest: STRING,
  tables: { type: 'integer' },
  cpaConfirmed: { type: 'boolean' },
  attorneyConfirmed: { type: 'boolean' },
  note: STRING,
  recordedBy: object({ id: STRING, name: { type: ['string', 'null'] } }),
  recordedAt: { type: 'string', format: 'date-time' },
})

const STATUS = object({
  digest: STRING,
  tables: { type: 'integer' },
  environment: STRING,
  productionDeletion: { type: 'string', enum: ['enabled', 'disabled'] },
  latest: { oneOf: [{ type: 'null' }, REVIEW] },
  current: { type: 'boolean' },
  findings: {
    type: 'array',
    items: object({ finding: { type: 'string', enum: [...MAPPING_FINDINGS] }, tables: { type: 'integer' } }),
  },
  categories: {
    type: 'array',
    items: object({
      category: { type: 'string', enum: [...RETENTION_CATEGORIES] },
      status: { type: 'string', enum: ['decided', 'provisional', 'unscheduled'] },
      scan: { type: 'string', enum: ['scanned', 'start_not_recorded', 'no_period', 'while_referenced', 'not_stored'] },
      tables: STRINGS,
    }),
  },
  live: object({ unannotated: STRINGS, missing: STRINGS }),
})

export function mappingRoutes(environment: string): RouteDef[] {
  const status: RouteDef = {
    method: 'GET',
    path: '/staff/retention-mapping',
    operationId: 'getRetentionMapping',
    summary: 'The table-to-retention mapping and its review',
    description:
      'Owner only (retention.view). The data inventory’s table-to-retention mapping as reviewed (OWN-DEC-201 I5): its ' +
      'digest and table count, the findings a reviewer looks at (PROPOSED kinds) and each category with where its ' +
      'rule comes from (decided, provisional, unscheduled), its scan state and its tables; the live audit of the ' +
      'database the server runs on (tables without an annotation, annotations without a table); the latest review; ' +
      'and whether production deletion is enabled (a review of this digest confirmed by the CPA and the attorney). ' +
      'The full report is docs/retention-mapping-review.md.',
    actors: ['staff'],
    permission: 'retention.view',
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'none',
    pagination: false,
    test: TEST,
    schema: { response: { 200: STATUS } },
    handler: async (ctx: ApiContext) => ({ body: await mappingStatus(ctx.db, environment) }),
  }

  const review: RouteDef = {
    method: 'POST',
    path: '/staff/retention-mapping/reviews',
    operationId: 'recordRetentionMappingReview',
    summary: 'Record a review of the table-to-retention mapping',
    description:
      'Owner only (records.delete, PROPOSED), with a fresh sign-in and a note: the review of the mapping in force ' +
      '(its digest, as GET /staff/retention-mapping gives it) and whether the CPA and the attorney confirmed it. In ' +
      'production the Delete actions are enabled only while the latest review names the mapping in force with both ' +
      'confirmations; recording one without them keeps deletion disabled. Append-only. Refusals: ' +
      'FRESH_AUTH_REQUIRED, CONFLICT STALE_MAPPING (the mapping changed: review the new digest), VALIDATION_FAILED.',
    actors: ['staff'],
    permission: 'records.delete',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'none',
    rateLimit: 'none',
    freshAuthMinutes: FRESH_AUTH_MINUTES,
    audit: 'retention.mapping_review',
    pagination: false,
    test: TEST,
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['digest', 'cpaConfirmed', 'attorneyConfirmed', 'note'],
        properties: {
          digest: { type: 'string', pattern: '^[0-9a-f]{64}$' },
          cpaConfirmed: { type: 'boolean' },
          attorneyConfirmed: { type: 'boolean' },
          note: { type: 'string', minLength: 1, maxLength: MAPPING_NOTE_MAX, pattern: '\\S' },
        },
      },
      response: { 200: REVIEW },
    },
    handler: async (ctx: ApiContext) => {
      if (ctx.actor.kind !== 'staff') throw new ApiError('FORBIDDEN')
      const body = ctx.req.body as { digest: string; cpaConfirmed: boolean; attorneyConfirmed: boolean; note: string }
      const out = await recordMappingReview(ctx.tx as Tx, {
        ...body,
        staffUserId: ctx.actor.userId,
        requestId: currentContext()?.requestId ?? ctx.req.id,
      })
      await ctx.audit({
        target: { type: 'retention_mapping_review', id: out.id },
        summary: {
          digest: out.digest,
          tables: out.tables,
          cpaConfirmed: out.cpaConfirmed,
          attorneyConfirmed: out.attorneyConfirmed,
        },
        reason: out.note,
        stepUpUsed: true,
      })
      return { body: out }
    },
  }
  return [status, review]
}
