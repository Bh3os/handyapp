// Provider status and inbound keywords from the stored webhook receipts (TSK-0048; HH-COM-02, HH-COM-05, HH-COM-12,
// INT-Bird, INT-Resend, OWN-DEC-147). One automation consumes `webhook.received`:
// - Delivery statuses (Bird sms.*, Resend email.*) update the delivery with that provider message ID. Events arrive
//   unordered, so a status applies only when it is newer than the one shown, delivered is final, and a later queued or
//   sent never moves a delivery back. Every applied status is kept in message_delivery_events. "Delivered" is shown
//   only when the provider reported it; acceptance is never proof of reading, and "read" is never recorded.
// - Inbound texts (Bird sms.received) whose whole body is a keyword: STOP withdraws the SMS opt-in and marketing texts,
//   START records a new SMS opt-in (never marketing), HELP changes nothing. Each is recorded at once with the receipt as
//   evidence. Bird itself answers the keyword with its keyword rule (and blocks later sends after STOP); this app sends
//   no second reply. The HELP wording is `sms.help_reply`, NOT CONFIGURED until the owner sets it (KEYWORD_REPLIES below).
// - Bird sms_suppression.created (a STOP, a carrier opt-out or a manual suppression) records the withdrawal too.
// - Inbound texts that are not keywords are left for the unified inbox (the receipt stays 'received').
import type { Tx } from '@handyhub/db'
import { sql } from 'kysely'
import { audit } from '../../platform/audit.js'
import type { Automation, JobOutcome } from '../../platform/automation.js'
import { mapBirdEvent } from '../../providers/bird/index.js'
import { mapResendEvent } from '../../providers/resend/index.js'
import type { DeliveryStatus } from '../../providers/types.js'
import { currentConsent, recordConsent } from './consent.js'
import { recordDeliveryOutcome } from './deliveries.js'

/** US keyword sets, as carriers (CTIA) and Bird's default US catalog treat them. Matched on the whole message. */
export const SMS_KEYWORDS = {
  stop: ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'OPTOUT', 'REVOKE'],
  start: ['START', 'UNSTOP'],
  help: ['HELP', 'INFO'],
} as const
export type SmsKeyword = keyof typeof SMS_KEYWORDS

/**
 * The keyword replies in the owner's wording (OWN-DEC-190 section 5; TSK-0133). Bird sends them: the Owner sets them as
 * the replies of the Bird keyword rules and of the 10DLC campaign (docs/10dlc/registration.md); this app sends none.
 * The HELP reply needs the real support contact for `{verifiedSupportContact}` (FACT-PUBLIC-CONTACT is still a
 * placeholder), so it is not usable yet and `sms.help_reply` stays NOT CONFIGURED until the owner gives that contact.
 * It replaces the earlier PROPOSED HELP wording of TSK-0048.
 */
export const KEYWORD_REPLIES = {
  optIn:
    "HandyHub: You're subscribed to service SMS updates. Message frequency varies. Message and data rates may apply. Reply HELP for help or STOP to opt out.",
  optOut: "HandyHub: You've opted out of text messages. No further SMS notifications will be sent for this program.",
  help: 'HandyHub: For assistance, contact {verifiedSupportContact}. Reply STOP to opt out.',
} as const

export function keywordOf(text: string): SmsKeyword | null {
  const word = text
    .trim()
    .toUpperCase()
    .replace(/[\s.!?]+$/g, '')
  for (const k of Object.keys(SMS_KEYWORDS) as SmsKeyword[])
    if ((SMS_KEYWORDS[k] as readonly string[]).includes(word)) return k
  return null
}

const RANK: Record<string, number> = { queued: 1, sent: 2, delivered: 3, failed: 2 }

/** Whether a provider status may replace the shown one (pure; exported for tests). */
export function nextState(
  current: string,
  currentAt: Date | null,
  incoming: DeliveryStatus,
  incomingAt: Date | null,
): string | null {
  if (!['queued', 'sent', 'delivered', 'failed'].includes(current)) return null // never sent: nothing to update
  if (current === 'delivered' || current === incoming) return null
  if (incoming === 'delivered') return 'delivered'
  if (currentAt && incomingAt && incomingAt.getTime() < currentAt.getTime()) return null
  if (incoming !== 'failed' && current !== 'failed' && (RANK[incoming] ?? 0) <= (RANK[current] ?? 0)) return null
  return incoming
}

type Receipt = {
  id: string
  provider: string
  event_type: string
  provider_message_id: string | null
  event_occurred_at: Date | null
  payload: unknown
  state: string
}

async function setReceipt(tx: Tx, id: string, state: 'processed' | 'ignored'): Promise<void> {
  await tx
    .updateTable('platform.webhook_receipts')
    .set({ state, processed_at: sql<Date>`now()` })
    .where('id', '=', id)
    .execute()
}

async function applyStatus(tx: Tx, r: Receipt, status: DeliveryStatus): Promise<'applied' | 'ignored'> {
  if (!r.provider_message_id) return 'ignored'
  const delivery = await tx
    .selectFrom('platform.message_deliveries')
    .select(['id', 'state', 'status_at', 'audience'])
    // The local and ci fakes stand in for the provider; their IDs never collide with a real provider's.
    .where('provider', 'in', [r.provider, 'fake'])
    .where('channel', '=', r.provider === 'bird' ? 'sms' : 'email')
    .where('provider_message_id', '=', r.provider_message_id)
    .forUpdate()
    .executeTakeFirst()
  if (!delivery) return 'ignored'
  const to = nextState(delivery.state, delivery.status_at, status, r.event_occurred_at)
  if (!to) return 'ignored'
  await tx
    .updateTable('platform.message_deliveries')
    .set({
      state: to,
      status_at: r.event_occurred_at ?? sql<Date>`now()`,
      error_code: to === 'failed' ? `provider_${r.event_type}`.slice(0, 120) : null,
      updated_at: sql<Date>`now()`,
    })
    .where('id', '=', delivery.id)
    .execute()
  await tx
    .insertInto('platform.message_delivery_events')
    .values({
      delivery_id: delivery.id,
      receipt_id: r.id,
      provider_type: r.event_type,
      from_state: delivery.state,
      to_state: to,
      occurred_at: r.event_occurred_at,
    })
    .execute()
  // A delivery that first reaches sent or delivered succeeded; one that fails failed (TSK-0043: the response clock).
  const success = (s: string) => s === 'sent' || s === 'delivered'
  if (success(to) && !success(delivery.state))
    await recordDeliveryOutcome(tx, {
      deliveryId: delivery.id,
      audience: delivery.audience,
      outcome: 'succeeded',
      at: r.event_occurred_at ?? new Date(),
      cause: r.id,
    })
  else if (to === 'failed')
    await recordDeliveryOutcome(tx, {
      deliveryId: delivery.id,
      audience: delivery.audience,
      outcome: 'failed',
      at: r.event_occurred_at ?? new Date(),
      cause: r.id,
    })
  return 'applied'
}

/**
 * TSK-0107 (HH-DATA-04: provider ordering is never assumed): a status can be processed before the send it reports on
 * has committed. The provider answers, and calls back, while the sending transaction is still open; or an attempt
 * crashed after the provider took the message, and the retry records the same message ID (the same idempotency key).
 * That status found no delivery and was ignored. When a delivery records its provider message ID, the statuses ignored
 * for that ID apply to it, oldest first, under the same forward-only rules; each applied one is recorded once.
 */
export async function applyEarlierStatuses(
  tx: Tx,
  input: { channel: 'email' | 'sms'; providerMessageId: string },
): Promise<number> {
  const provider = input.channel === 'sms' ? 'bird' : 'resend'
  const earlier = (await tx
    .selectFrom('platform.webhook_receipts')
    .select(['id', 'provider', 'event_type', 'provider_message_id', 'event_occurred_at', 'payload', 'state'])
    .where('provider', '=', provider)
    .where('provider_message_id', '=', input.providerMessageId)
    .where('state', '=', 'ignored')
    .orderBy(sql`event_occurred_at NULLS LAST`)
    .orderBy('seq')
    .forUpdate()
    .execute()) as Receipt[]
  let applied = 0
  for (const r of earlier) {
    const status = r.provider === 'bird' ? mapBirdEvent(r.event_type) : mapResendEvent(r.event_type)
    if (!status || (await applyStatus(tx, r, status)) !== 'applied') continue
    await setReceipt(tx, r.id, 'processed')
    applied++
  }
  return applied
}

function data(r: Receipt): Record<string, unknown> {
  const d = (r.payload as { data?: unknown } | null)?.data
  return d && typeof d === 'object' ? (d as Record<string, unknown>) : {}
}

async function withdrawSms(
  tx: Tx,
  destination: string,
  r: Receipt,
  source: 'sms_keyword' | 'provider_suppression',
  keyword: string,
) {
  const evidence = { webhookReceiptId: r.id, keyword }
  const at = r.event_occurred_at ?? new Date()
  if ((await currentConsent(tx, 'sms', destination, 'transactional_sms')) !== 'withdrawn')
    await recordConsent(tx, {
      purpose: 'transactional_sms',
      channel: 'sms',
      destination,
      granted: false,
      source,
      recordedBy: 'system:notifications.sms_keywords',
      evidence,
      at,
    })
  // Marketing texts, and TSK-0134 the consent to verification codes by text, end with the SMS opt-in.
  for (const purpose of ['marketing', 'sms_verification'] as const)
    if ((await currentConsent(tx, 'sms', destination, purpose)) === 'granted')
      await recordConsent(tx, {
        purpose,
        channel: 'sms',
        destination,
        granted: false,
        source,
        recordedBy: 'system:notifications.sms_keywords',
        evidence,
        at,
      })
}

async function handleInbound(tx: Tx, r: Receipt, requestId: string): Promise<'processed' | 'left'> {
  const d = data(r)
  const from = typeof d['from'] === 'string' ? d['from'] : null
  const text = typeof d['text'] === 'string' ? d['text'] : typeof d['body'] === 'string' ? d['body'] : null
  if (!from || text === null) return 'left'
  const keyword = keywordOf(text)
  if (!keyword) return 'left'
  if (keyword === 'stop') await withdrawSms(tx, from, r, 'sms_keyword', 'STOP')
  if (keyword === 'start')
    await recordConsent(tx, {
      purpose: 'transactional_sms',
      channel: 'sms',
      destination: from,
      granted: true,
      source: 'sms_keyword',
      recordedBy: 'system:notifications.sms_keywords',
      evidence: { webhookReceiptId: r.id, keyword: 'START' },
      at: r.event_occurred_at ?? new Date(),
    })
  await audit.record(tx, {
    actor: { kind: 'system', process: 'notifications.sms_keywords' },
    action: `sms.keyword_${keyword}`,
    target: { type: 'webhook_receipt', id: r.id },
    summary: { keyword: keyword.toUpperCase() },
    requestId,
  })
  return 'processed'
}

/** The automation that turns stored webhook receipts into delivery states and consent changes. */
export function deliveryStatusAutomation(): Automation {
  return {
    name: 'notify.provider_events',
    trigger: { kind: 'event', eventTypes: ['webhook.received'] },
    identity: 'system.notifications',
    inputs: { description: 'the stored, signature-verified webhook receipt', version: 1 },
    idempotency: 'one job per receipt; a status applies only forward and each receipt is recorded once',
    effect: 'updates delivery states from provider statuses and SMS consent from STOP, START and suppressions',
    retry: { maxAttempts: 5, baseDelayMs: 5_000, maxDelayMs: 300_000 },
    timeoutMs: 15_000,
    exceptionOwner: 'office',
    audit: { action: 'notification.provider_event' },
    handle: async ({ tx, job }): Promise<JobOutcome> => {
      const id = job.target.id
      if (!id) return 'cancelled'
      const r = (await tx
        .selectFrom('platform.webhook_receipts')
        .select(['id', 'provider', 'event_type', 'provider_message_id', 'event_occurred_at', 'payload', 'state'])
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirst()) as Receipt | undefined
      if (!r || r.state !== 'received') return 'cancelled'
      if (r.provider === 'bird' && r.event_type === 'sms.received') {
        if ((await handleInbound(tx, r, job.requestId)) === 'processed') await setReceipt(tx, r.id, 'processed')
        return 'done'
      }
      if (r.provider === 'bird' && r.event_type === 'sms_suppression.created') {
        const destination = data(r)['destination']
        const reason = data(r)['reason']
        if (typeof destination === 'string') {
          await withdrawSms(
            tx,
            destination,
            r,
            'provider_suppression',
            typeof reason === 'string' ? reason : 'suppression',
          )
          await setReceipt(tx, r.id, 'processed')
        } else await setReceipt(tx, r.id, 'ignored')
        return 'done'
      }
      const status = r.provider === 'bird' ? mapBirdEvent(r.event_type) : mapResendEvent(r.event_type)
      if (!status) {
        // Not a delivery state (email.opened, email.clicked, email.received...): other consumers may use it.
        return 'done'
      }
      await setReceipt(tx, r.id, (await applyStatus(tx, r, status)) === 'applied' ? 'processed' : 'ignored')
      return 'done'
    },
  }
}
