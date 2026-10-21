// Queue item providers fed by the outbox (TSK-0041; HH-OPS-01, HH-AUTO-01, TSK-0012). Each provider is a declared
// automation: it reads its subject as it is now and opens, updates or resolves the subject's one item, in the job's
// transaction. Modules built later add their providers here, next to the type they declare in registry.ts.
import type { Tx } from '@handyhub/db'
import type { Automation } from '../../platform/automation.js'
import { openQueueItem, resolveQueueItem } from './items.js'

export const REQUEST_SUBMITTED = 'request.submitted'

/**
 * Brings a request's new_request item in line with the request and its first-response clock as they are now
 * (TSK-0043; HH-LEAD-05, OWN-DEC-116): the item stays open, due at the clock's internal target, until a meaningful
 * response stops the clock, whatever staff did meanwhile (opening, assigning, qualifying, the four actions, drafting).
 * While received it reads "new request"; afterwards "awaiting a first response". A request without a clock (none
 * since TSK-0043) keeps the earlier rule: open while received. The provider below runs it from the outbox; the
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
  const awaiting = clock ? clock.stopped_at === null : request.state === 'received'
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
    dueAt: clock?.due_at ?? null,
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

export function queueAutomations(): Automation[] {
  return [newRequestQueueAutomation()]
}
