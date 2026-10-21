// Queue item providers fed by the outbox (TSK-0041; HH-OPS-01, HH-AUTO-01, TSK-0012). Each provider is a declared
// automation: it reads its subject as it is now and opens, updates or resolves the subject's one item, in the job's
// transaction. Modules built later add their providers here, next to the type they declare in registry.ts.
import type { Tx } from '@handyhub/db'
import type { Automation } from '../../platform/automation.js'
import { openQueueItem, resolveQueueItem } from './items.js'

export const REQUEST_SUBMITTED = 'request.submitted'

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

export function queueAutomations(): Automation[] {
  return [newRequestQueueAutomation()]
}
