// Queue item providers fed by the outbox (TSK-0041; HH-OPS-01, HH-AUTO-01, TSK-0012). Each provider is a declared
// automation: it reads its subject as it is now and opens, updates or resolves the subject's one item, in the job's
// transaction. Modules built later add their providers here, next to the type they declare in registry.ts.
import type { Tx } from '@handyhub/db'
import type { Automation } from '../../platform/automation.js'
import { openQueueItem, resolveQueueItem } from './items.js'

export const REQUEST_SUBMITTED = 'request.submitted'
/** Recorded by Prepare Online Estimate (TSK-0042) when a request is ready for its estimate. */
export const REQUEST_READY_FOR_ESTIMATE = 'request.ready_for_estimate'

/**
 * Brings a request's new_request item in line with the request as it is now: a received request has its one open item
 * (with the current responsible staff member); a request past received has none (resolved as handled). The provider
 * below runs it from the outbox; the requests module runs it in the same transaction as an assignment or an action
 * (TSK-0042), so the queue never shows a handled request or a stale assignee.
 */
export async function syncNewRequestItem(tx: Tx, requestId: string): Promise<'open' | 'resolved' | 'missing'> {
  const request = await tx
    .selectFrom('intake.requests')
    .select(['id', 'state', 'reference', 'project_id', 'submitted_at', 'spam_suspected', 'responsible_staff_id'])
    .where('id', '=', requestId)
    .executeTakeFirst()
  if (!request) return 'missing'
  if (request.state !== 'received') {
    // Already handled: an open item from an earlier event is resolved, and none is opened.
    await resolveQueueItem(tx, { type: 'new_request', subjectId: request.id, resolution: 'handled' })
    return 'resolved'
  }
  await openQueueItem(tx, {
    type: 'new_request',
    subjectId: request.id,
    reason: request.spam_suspected ? 'new_request_flagged' : 'new_request',
    projectId: request.project_id,
    reference: request.reference,
    status: request.state,
    assignedStaffId: request.responsible_staff_id,
    openedAt: request.submitted_at,
  })
  return 'open'
}

/**
 * New requests (HH-OPS-01 "new requests (with the 1-hour response clock)"): a received request opens its
 * new_request item, flagged for review when the quiet spam controls flagged it (HH-INT-11). The item's due time is
 * the first-response clock's (HH-LEAD-05), which that clock sets; until then the item shows its age.
 */
export function newRequestQueueAutomation(): Automation {
  return {
    name: 'queue.new_request',
    trigger: { kind: 'event', eventTypes: [REQUEST_SUBMITTED] },
    identity: 'system.queue',
    inputs: { description: 'the request id of the request.submitted event; the request as it is now', version: 1 },
    idempotency: 'one open new_request item per request; a replay updates it, and a request past received opens none',
    effect: 'opens or updates the new_request queue item of a received request',
    retry: { maxAttempts: 5, baseDelayMs: 1_000, maxDelayMs: 60_000 },
    timeoutMs: 10_000,
    exceptionOwner: 'office',
    audit: { action: 'queue.item_opened' },
    handle: async ({ tx, job }) => {
      const id = job.target.id
      if (!id) return 'cancelled'
      return (await syncNewRequestItem(tx, id)) === 'open' ? 'done' : 'cancelled'
    },
  }
}

/**
 * Brings a request's pending-estimate item (estimate_to_write) in line with the request as it is now (HH-OPS-01
 * "pending estimates", TSK-0053): a request ready for its estimate, on an open project, has its one open item, with the
 * reason "estimate draft" once a draft or in-review version of the project exists; any other request has none (resolved
 * as handled). The provider below runs it from request.ready_for_estimate; the estimates module runs it in the same
 * transaction as creating an estimate, so the item never shows a stale reason.
 */
export async function syncEstimateItem(tx: Tx, requestId: string): Promise<'open' | 'resolved' | 'missing'> {
  const request = await tx
    .selectFrom('intake.requests as r')
    .innerJoin('crm.projects as p', 'p.id', 'r.project_id')
    .select(['r.id', 'r.state', 'r.reference', 'r.project_id', 'r.responsible_staff_id', 'p.state as project_state'])
    .where('r.id', '=', requestId)
    .executeTakeFirst()
  if (!request) return 'missing'
  if (request.state !== 'ready_for_estimate' || request.project_state !== 'open') {
    await resolveQueueItem(tx, { type: 'estimate_to_write', subjectId: request.id, resolution: 'handled' })
    return 'resolved'
  }
  const draft = await tx
    .selectFrom('estimating.estimate_versions')
    .select('id')
    .where('project_id', '=', request.project_id)
    .where('state', 'in', ['draft', 'in_review'])
    .limit(1)
    .executeTakeFirst()
  await openQueueItem(tx, {
    type: 'estimate_to_write',
    subjectId: request.id,
    reason: draft ? 'estimate_draft' : 'ready_for_estimate',
    projectId: request.project_id,
    reference: request.reference,
    status: request.state,
    assignedStaffId: request.responsible_staff_id,
  })
  return 'open'
}

/** Pending estimates: a request marked ready for its estimate opens its estimate_to_write item (TSK-0053). */
export function estimateToWriteQueueAutomation(): Automation {
  return {
    name: 'queue.estimate_to_write',
    trigger: { kind: 'event', eventTypes: [REQUEST_READY_FOR_ESTIMATE] },
    identity: 'system.queue',
    inputs: {
      description:
        'the request id of the request.ready_for_estimate event; the request and its project as they are now',
      version: 1,
    },
    idempotency: 'one open estimate_to_write item per request; a replay updates it, and a request moved on opens none',
    effect: 'opens or updates the estimate_to_write queue item of a request ready for its estimate',
    retry: { maxAttempts: 5, baseDelayMs: 1_000, maxDelayMs: 60_000 },
    timeoutMs: 10_000,
    exceptionOwner: 'estimator',
    audit: { action: 'queue.item_opened' },
    handle: async ({ tx, job }) => {
      const id = job.target.id
      if (!id) return 'cancelled'
      return (await syncEstimateItem(tx, id)) === 'open' ? 'done' : 'cancelled'
    },
  }
}

export function queueAutomations(): Automation[] {
  return [newRequestQueueAutomation(), estimateToWriteQueueAutomation()]
}
