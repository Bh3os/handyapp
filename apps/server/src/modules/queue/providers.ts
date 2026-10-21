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
 * Brings a request's new_request item in line with the request and its first-response clock as they are now
 * (TSK-0043; HH-LEAD-05, OWN-DEC-116): the item stays open, due at the clock's internal target, until a meaningful
 * response stops the clock, whatever staff did meanwhile (opening, assigning, qualifying, the four actions, drafting).
 * It also stays open while the request is still received, so a request answered (say by a logged call) before anyone
 * took one of the four actions does not leave the queue; it then has no due time, since the target was met or missed
 * already. While received it reads "new request"; afterwards "awaiting a first response". A request without a clock
 * (none since TSK-0043) keeps the earlier rule: open while received. The provider below runs it from the outbox; the
 * requests module runs it in the same transaction as an assignment, an action or a clock change, so the queue never
 * shows a stale assignee or an answered request.
 */
export async function syncNewRequestItem(tx: Tx, requestId: string): Promise<'open' | 'resolved' | 'missing'> {
  const request = await tx
    .selectFrom('intake.requests')
    .select(['id', 'state', 'reference', 'project_id', 'submitted_at', 'spam_suspected', 'responsible_staff_id'])
    .where('id', '=', requestId)
    .executeTakeFirst()
  if (!request) return 'missing'
  const clock = await tx
    .selectFrom('intake.response_clocks')
    .select(['due_at', 'stopped_at'])
    .where('request_id', '=', requestId)
    .executeTakeFirst()
  const clockRunning = clock ? clock.stopped_at === null : false
  const awaiting = clockRunning || request.state === 'received'
  if (!awaiting) {
    // Answered (or, without a clock, already handled): an open item from an earlier event is resolved.
    await resolveQueueItem(tx, {
      type: 'new_request',
      subjectId: request.id,
      resolution: clock ? 'responded' : 'handled',
    })
    return 'resolved'
  }
  await openQueueItem(tx, {
    type: 'new_request',
    subjectId: request.id,
    reason:
      request.state !== 'received'
        ? 'awaiting_first_response'
        : request.spam_suspected
          ? 'new_request_flagged'
          : 'new_request',
    projectId: request.project_id,
    reference: request.reference,
    status: request.state,
    assignedStaffId: request.responsible_staff_id,
    dueAt: clockRunning ? (clock?.due_at ?? null) : null,
    openedAt: request.submitted_at,
  })
  return 'open'
}

/**
 * New requests (HH-OPS-01 "new requests (with the 1-hour response clock)"): a received request opens its
 * new_request item, flagged for review when the quiet spam controls flagged it (HH-INT-11). The item's due time is
 * the first-response clock's internal target (HH-LEAD-05, TSK-0043); a clock whose values are NOT CONFIGURED has
 * none, and the item shows its age.
 */
export function newRequestQueueAutomation(): Automation {
  return {
    name: 'queue.new_request',
    trigger: { kind: 'event', eventTypes: [REQUEST_SUBMITTED] },
    identity: 'system.queue',
    inputs: { description: 'the request id of the request.submitted event; the request as it is now', version: 1 },
    idempotency: 'one open new_request item per request; a replay updates it, and an answered request opens none',
    effect: 'opens or updates the new_request queue item of a request awaiting its first meaningful response',
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
 * as handled). The provider below runs it from request.ready_for_estimate; the requests module runs it in the same
 * transaction as every action that moves the request or closes or routes its project (Prepare Online Estimate, Ask a
 * Question, Arrange Estimate Visit, Not a Fit) and as an assignment, and the estimates module as creating an estimate,
 * so the item never shows a stale reason, status or assignee, and never outlives the request's readiness.
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
