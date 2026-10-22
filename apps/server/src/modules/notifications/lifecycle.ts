// The message status model (TSK-0119; HH-COM-14, HH-COM-02, OWN-DEC-152 section 7). Every outgoing message reads as
// one of the owner's lifecycle states, derived from the delivery row: the stored delivery states (draft, queued,
// sent, delivered, failed, suppressed, cancelled) are reused, never duplicated.
// - DRAFT: a staff-released message not released yet; PENDING_APPROVAL: the same for a message the Owner releases
//   (work paused). APPROVED is not a resting state here: a release queues (or schedules) the message in the same
//   transaction, and the release identity is recorded on the row (released_by).
// - SCHEDULED: queued for a later time (a release held to permitted hours); QUEUED: due now. SENDING is not a resting
//   state either: a send runs inside one transaction and the row moves straight to its outcome.
// - PROVIDER_ACCEPTED: the provider took it (stored as queued with a provider message ID, or sent). Acceptance is never
//   delivery. DELIVERED only where the provider reported delivery by status webhook (TSK-0048), and never for a test
//   provider: a message intercepted by the fake provider of staging or CI is `intercepted` and stays PROVIDER_ACCEPTED.
//   "Read" is never shown: no provider measures it here.
// - FAILED (with its error code and the names of missing variables), CANCELLED, EXPIRED (cancelled because what it
//   offered expired) and SUPPRESSED (consent, opt-out or the test allowlist).
// Template approval is separate: a template version is released content (template ID, version, source decisions);
// whether a message can send is its readiness (templates.ts), and this is the state of one message.
import { messageType } from './message-types.js'

export const MESSAGE_LIFECYCLE = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'SCHEDULED',
  'QUEUED',
  'SENDING',
  'PROVIDER_ACCEPTED',
  'DELIVERED',
  'FAILED',
  'CANCELLED',
  'EXPIRED',
  'SUPPRESSED',
] as const
export type MessageLifecycle = (typeof MESSAGE_LIFECYCLE)[number]

/** The staff view's groups (HH-COM-14 "delivered, scheduled or failed"). */
export const LIFECYCLE_GROUPS = {
  waiting: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SCHEDULED', 'QUEUED', 'SENDING'],
  sent: ['PROVIDER_ACCEPTED', 'DELIVERED'],
  failed: ['FAILED'],
  stopped: ['CANCELLED', 'EXPIRED', 'SUPPRESSED'],
} as const satisfies Record<string, readonly MessageLifecycle[]>

export type DeliveryFacts = {
  message_key: string
  state: string
  provider: string | null
  provider_message_id: string | null
  error_code: string | null
  scheduled_at: Date | null
}

/** Whether a delivery went to a test provider (staging, CI): never reported as delivered (OWN-DEC-152 section 14). */
export function isIntercepted(row: Pick<DeliveryFacts, 'provider'>): boolean {
  return row.provider === 'fake'
}

/** Whether a message type is released by the Owner only (an unknown type is not). */
function isOwnerReleased(messageKey: string): boolean {
  try {
    return messageType(messageKey).ownerApproval === true
  } catch {
    return false
  }
}

/** The lifecycle state of one delivery at `now`. */
export function lifecycleOf(row: DeliveryFacts, now: Date = new Date()): MessageLifecycle {
  switch (row.state) {
    case 'draft':
      return isOwnerReleased(row.message_key) ? 'PENDING_APPROVAL' : 'DRAFT'
    case 'queued':
      if (row.provider_message_id) return 'PROVIDER_ACCEPTED'
      return row.scheduled_at && row.scheduled_at.getTime() > now.getTime() ? 'SCHEDULED' : 'QUEUED'
    case 'sent':
      return 'PROVIDER_ACCEPTED'
    case 'delivered':
      return isIntercepted(row) ? 'PROVIDER_ACCEPTED' : 'DELIVERED'
    case 'failed':
      return 'FAILED'
    case 'suppressed':
      return 'SUPPRESSED'
    case 'cancelled':
      return /expired/.test(row.error_code ?? '') ? 'EXPIRED' : 'CANCELLED'
    default:
      return 'FAILED'
  }
}

/** The stored states of a lifecycle group, for list filters. */
export function storedStatesOf(group: keyof typeof LIFECYCLE_GROUPS): readonly string[] {
  switch (group) {
    case 'waiting':
      return ['draft', 'queued']
    case 'sent':
      return ['queued', 'sent', 'delivered']
    case 'failed':
      return ['failed']
    case 'stopped':
      return ['cancelled', 'suppressed']
  }
}
