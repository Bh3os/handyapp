// Owner publication approvals: the approval queue, the Owner's decision and the threshold setting (TSK-0130;
// HH-EST-16, OWN-DEC-173 with the final owner amendments of 2026-10-22, FACT-OWNER-APPROVAL-THRESHOLD, S11,
// RULE-SERVER-AUTHZ).
//   GET  /staff/publication-approvals                       the pending approvals (the Owner's approval queue)
//   GET  /staff/publication-approvals/:approvalId           one approval record
//   POST /staff/publication-approvals/:approvalId/decision  the Owner approves or rejects, with a comment
//   GET  /staff/settings/approval-threshold                 the threshold in force (the Owner)
//   PUT  /staff/settings/approval-threshold                 the Owner changes it (policy_values.change: fresh sign-in
//                                                           and a reason), a new audited configuration version
// - Asking for an approval is the document's own route (estimates: POST /staff/estimate-versions/:id/owner-approval;
//   change orders with TSK-0082). Deciding and reading the queue are estimate.approve_publication: the Owner only.
import type { Tx } from '@handyhub/db'
import { sql } from 'kysely'
import { ApiError } from '../../api/errors.js'
import type { ApiContext, ApiModule, RouteDef } from '../../api/route.js'
import { loadConfig, recordPolicyVersion } from '../../platform/config/index.js'
import { FRESH_AUTH_MINUTES } from '../identity/sessions.js'
import {
  APPROVAL_LIST,
  APPROVAL_PARAMS,
  APPROVAL_VIEW,
  DECISION_BODY,
  THRESHOLD_BODY,
  THRESHOLD_SETTING,
} from './schemas.js'
import { approvalById, decideApproval, pendingApprovals } from './service.js'

export * from './service.js'

const TEST = 'test/integration/publication-approvals.test.ts'

function staffActor(ctx: ApiContext) {
  if (ctx.actor.kind !== 'staff') throw new ApiError('FORBIDDEN')
  return ctx.actor
}

const approvalProject: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { approvalId } = req.params as { approvalId: string }
  if (!/^[0-9a-f-]{36}$/i.test(approvalId)) return null
  const a = await db
    .selectFrom('estimating.publication_approvals')
    .select('project_id')
    .where('id', '=', approvalId)
    .executeTakeFirst()
  return a ? { projectId: a.project_id } : null
}

const read = {
  actors: ['staff'],
  kind: 'read',
  idempotency: 'none',
  expectedVersion: 'none',
  rateLimit: 'none',
  audit: 'none',
  pagination: false,
  test: TEST,
} as const

const write = {
  actors: ['staff'],
  kind: 'write',
  idempotency: 'required',
  rateLimit: 'none',
  pagination: false,
  test: TEST,
} as const

async function thresholdSetting(db: ApiContext['db'] | Tx) {
  const entry = (await loadConfig(db)).get('owner_approval.threshold')
  return {
    state: entry.state,
    version: entry.version,
    thresholdCents: entry.state === 'CONFIGURED' ? entry.value.thresholdCents : null,
    sourceIds: [...entry.sourceIds],
  }
}

const routes: RouteDef[] = [
  {
    ...read,
    method: 'GET',
    path: '/staff/publication-approvals',
    operationId: 'listPublicationApprovals',
    summary: 'Pending Owner approvals before publishing',
    description:
      'The Owner (estimate.approve_publication). The approvals waiting for a decision, oldest first: the reference, ' +
      'the proposed price (and the highest total its options allow), the discount, change-order adjustments, the ' +
      'reasons approval is needed, the project documents counted together, the threshold and its version, the ' +
      'preparer and, from costs that exist only, the labor and material costs, gross profit and margin (none while ' +
      'the costs are incomplete). Integer cents.',
    permission: 'estimate.approve_publication',
    schema: { response: { 200: APPROVAL_LIST } },
    handler: async (ctx) => ({ body: { items: await pendingApprovals(ctx.db, staffActor(ctx)) } }),
  },
  {
    ...read,
    method: 'GET',
    path: '/staff/publication-approvals/:approvalId',
    operationId: 'getPublicationApproval',
    summary: 'One Owner approval record',
    description:
      'The Owner (estimate.approve_publication). One approval record with what the Owner was shown and the ' +
      'decision: who, when, the comment and the document version; whether it was invalidated (a later change of ' +
      'price or scope) or used by the publication. ETag: the record version.',
    permission: 'estimate.approve_publication',
    resource: approvalProject,
    schema: { params: APPROVAL_PARAMS, response: { 200: APPROVAL_VIEW } },
    handler: async (ctx) => {
      const { approvalId } = ctx.req.params as { approvalId: string }
      const view = await approvalById(ctx.db, staffActor(ctx), approvalId)
      if (!view) throw new ApiError('NOT_FOUND')
      return { body: view, version: view.rowVersion }
    },
  },
  {
    ...write,
    method: 'POST',
    path: '/staff/publication-approvals/:approvalId/decision',
    operationId: 'decidePublicationApproval',
    summary: 'Approve or reject publishing a document (Owner only)',
    description:
      'The Owner only (estimate.approve_publication; OWN-DEC-173), with If-Match: the record version shown, and a ' +
      'written comment (the auditable reason, final owner amendments 2026-10-22). Only a pending approval is ' +
      'decided; one invalidated by a change of price or scope is refused. Records the decision, the time, the ' +
      'comment and the document version, and resolves the Owner Decisions item. An approval lets that exact version ' +
      'be published; any later change of price or scope invalidates it. Audited. Returns the record.',
    permission: 'estimate.approve_publication',
    expectedVersion: 'required',
    audit: 'publication_approval.decide',
    resource: approvalProject,
    schema: { params: APPROVAL_PARAMS, body: DECISION_BODY, response: { 200: APPROVAL_VIEW } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staffActor(ctx)
      const { approvalId } = ctx.req.params as { approvalId: string }
      const body = ctx.req.body as { decision: 'approve' | 'reject'; comment?: string | null }
      const out = await decideApproval(tx, actor, approvalId, {
        decision: body.decision,
        comment: body.comment ?? null,
        expectedRowVersion: ctx.expectedVersion(),
      })
      await ctx.audit({
        action: out.state === 'approved' ? 'publication_approval.approve' : 'publication_approval.reject',
        target: { type: 'publication_approval', id: out.approvalId, version: out.rowVersion },
        summary: {
          subjectType: out.subjectType,
          subjectId: out.subjectId,
          reference: out.reference,
          version: out.documentVersion,
          decision: out.state,
          byPublishing: false,
        },
        ...(out.comment === null ? {} : { reason: out.comment }),
      })
      const view = await approvalById(tx, actor, approvalId)
      if (!view) throw new ApiError('NOT_FOUND')
      return { body: view, version: view.rowVersion }
    },
  },
  {
    ...read,
    method: 'GET',
    path: '/staff/settings/approval-threshold',
    operationId: 'getApprovalThreshold',
    summary: 'The Owner approval threshold',
    description:
      'The Owner (estimate.approve_publication). The threshold in force (owner_approval.threshold, integer cents, ' +
      'compared "greater than": exactly the threshold needs no approval), its version and its sources; NOT ' +
      'CONFIGURED means every publication needs the Owner. ETag: the configuration version.',
    permission: 'estimate.approve_publication',
    schema: { response: { 200: THRESHOLD_SETTING } },
    handler: async (ctx) => {
      const body = await thresholdSetting(ctx.db)
      return { body, version: body.version ?? 0 }
    },
  },
  {
    ...write,
    method: 'PUT',
    path: '/staff/settings/approval-threshold',
    operationId: 'setApprovalThreshold',
    summary: 'Change the Owner approval threshold (Owner only)',
    description:
      'The Owner only (policy_values.change: a fresh sign-in within ' +
      `${FRESH_AUTH_MINUTES} minutes and a written reason), with If-Match: the configuration version shown. Records ` +
      'the next version of owner_approval.threshold (integer cents, above $0.00) citing OWN-DEC-173; the next ' +
      'publication is decided under it. Approvals already given stay with the version they approved. Audited with ' +
      'the old and new value.',
    permission: 'policy_values.change',
    freshAuthMinutes: FRESH_AUTH_MINUTES,
    expectedVersion: 'required',
    audit: 'publication_approval.change_threshold',
    schema: { body: THRESHOLD_BODY, response: { 200: THRESHOLD_SETTING } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staffActor(ctx)
      const { thresholdCents, reason } = ctx.req.body as { thresholdCents: number; reason: string }
      if (reason.trim() === '')
        throw new ApiError('VALIDATION_FAILED', {
          fieldErrors: [{ field: 'body.reason', code: 'required', message: '' }],
        })
      // The same lock recordPolicyVersion takes, so the version compared is the one superseded.
      await sql`SELECT pg_advisory_xact_lock(hashtext(${'policy_version:owner_approval.threshold'}))`.execute(tx)
      const before = await thresholdSetting(tx)
      if (ctx.expectedVersion() !== (before.version ?? 0))
        throw new ApiError('STALE_VERSION', { current: { version: before.version ?? 0 } })
      const version = await recordPolicyVersion(tx, {
        key: 'owner_approval.threshold',
        value: { thresholdCents, comparison: 'greater_than' },
        sourceIds: ['OWN-DEC-173', 'FACT-OWNER-APPROVAL-THRESHOLD'],
        changedBy: actor.userId,
        reason: reason.trim(),
      })
      await ctx.audit({
        target: { type: 'policy_version', id: 'owner_approval.threshold', version },
        summary: { fromCents: before.thresholdCents, toCents: thresholdCents, previousVersion: before.version },
        reason: reason.trim(),
        stepUpUsed: true,
      })
      const body = await thresholdSetting(tx)
      return { body, version }
    },
  },
]

export const APPROVALS_MODULE: ApiModule = { name: 'approvals', routes }
