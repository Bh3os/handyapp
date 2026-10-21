// Inbound email and texts into the unified inbox (TSK-0049; HH-COM-10, HH-COM-07, HH-COM-01, ENT-WebhookReceipt,
// ENT-Message, INT-Bird, INT-Resend, OWN-DEC-120, OWN-DEC-129). One automation consumes `webhook.received`:
// - Bird `sms.received` and Resend `email.received` become one comms.messages row per receipt (the receipt ID is
//   unique on the message), so a provider retry or a replayed delivery adds nothing. The receipt itself was stored only
//   after its signature and timestamp verified (providers/webhooks.ts).
// - The message is matched (matching.ts) and either placed on its project's customer conversation with a
//   "customer replied" queue item, or left in the private Needs Linking list with its queue item.
// - A whole-message SMS keyword (STOP, START, HELP) is kept in the conversation too, but the consent change is the
//   keyword automation's (TSK-0048) and it opens no "customer replied" item (PROPOSED).
// - An email's body and headers are read from Resend (its webhook carries metadata only). A temporary failure retries
//   the job; after the last attempt, or while e-mail is NOT CONFIGURED, the message is kept with its body marked
//   retrieval failed or not retrieved, never with invented content.
// - Other `*.received` events (for example WhatsApp) are an unsupported channel: the receipt is marked ignored and the
//   inbox counts it, so staff see that something arrived on a channel the inbox does not handle.
// The audit summary holds codes only (channel, linking state and rule): never an address, a subject or a body.
import type { Tx } from '@handyhub/db'
import { sql } from 'kysely'
import { audit } from '../../platform/audit.js'
import type { Automation, JobOutcome } from '../../platform/automation.js'
import {
  htmlToText,
  INBOUND_BODY_MAX,
  messageIds,
  parseBirdInboundSms,
  parseResendInboundEmail,
  type InboundAttachment,
  type InboundEmailReader,
} from '../../providers/inbound.js'
import { keywordOf } from '../notifications/index.js'
import {
  applyLink,
  customerReplied,
  ensureConversation,
  openNeedsLinking,
  touchConversation,
  type LinkTarget,
} from './conversations.js'
import { matchInbound, type MatchResult } from './matching.js'
import type { InboundAddress } from './threading.js'

export const INBOX_INTAKE = 'inbox.intake'

/** The inbound events the inbox handles; any other `*.received` event is an unsupported channel. */
export const SUPPORTED_INBOUND = { bird: ['sms.received'], resend: ['email.received'] } as const

export class InboundReadRetry extends Error {
  override name = 'InboundReadRetry'
}

export type IntakeDeps = {
  /** Reads a received email's body and headers; null while e-mail is NOT CONFIGURED. */
  inboundEmail: InboundEmailReader | null
  replyAddress: InboundAddress | null
}

type Receipt = {
  id: string
  provider: string
  event_type: string
  payload: unknown
  state: string
  event_occurred_at: Date | null
  received_at: Date
}

type Body = {
  text: string | null
  state: 'received' | 'html_converted' | 'not_retrieved' | 'retrieval_failed' | 'empty'
  truncated: boolean
}

function body(text: string | null, state: Body['state']): Body {
  if (text === null || text.trim() === '')
    return { text: null, state: state === 'received' || state === 'html_converted' ? 'empty' : state, truncated: false }
  return text.length > INBOUND_BODY_MAX
    ? { text: text.slice(0, INBOUND_BODY_MAX), state, truncated: true }
    : { text, state, truncated: false }
}

type NewMessage = {
  channel: 'email' | 'sms'
  provider: 'bird' | 'resend'
  providerMessageId: string
  from: string
  to: string[]
  subject: string | null
  body: Body
  emailMessageId: string | null
  references: string[]
  attachments: InboundAttachment[]
  keyword: 'stop' | 'start' | 'help' | null
}

async function store(tx: Tx, r: Receipt, m: NewMessage, match: MatchResult, requestId: string): Promise<string> {
  const at = r.event_occurred_at ?? r.received_at
  const target: LinkTarget =
    match.state === 'matched'
      ? {
          state: 'matched',
          rule: match.rule,
          projectId: match.projectId,
          customerId: match.customerId,
          contactId: match.contactId,
        }
      : { state: 'needs_linking', reason: match.reason, suggestedProjectId: match.suggestedProjectId }
  const conversation = match.state === 'matched' ? await ensureConversation(tx, match.projectId, 'customer') : null
  const inserted = await tx
    .insertInto('comms.messages')
    .values({
      direction: 'inbound',
      channel: m.channel,
      webhook_receipt_id: r.id,
      provider: m.provider,
      provider_message_id: m.providerMessageId,
      from_address: m.from,
      to_addresses: m.to,
      subject: m.subject,
      body_text: m.body.text,
      body_state: m.body.state,
      body_truncated: m.body.truncated,
      email_message_id: m.emailMessageId,
      in_reply_to: m.references,
      attachments: JSON.stringify(m.attachments),
      keyword: m.keyword,
      received_at: at,
      ...(match.state === 'matched'
        ? {
            link_state: 'matched',
            match_rule: match.rule,
            project_id: match.projectId,
            customer_id: match.customerId,
            conversation_id: conversation,
            contact_id: match.contactId,
          }
        : {
            link_state: 'needs_linking',
            needs_linking_reason: match.reason,
            suggested_project_id: match.suggestedProjectId,
          }),
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  const id = inserted.id
  // The match is the message's first linking step in its history.
  const conversationId = await applyLink(tx, { messageId: id, from: null, to: target })
  if (conversationId && match.state === 'matched') {
    await touchConversation(tx, conversationId, at, true)
    if (!m.keyword) await customerReplied(tx, conversationId, match.projectId, at)
  } else await openNeedsLinking(tx, id, at)
  await tx
    .updateTable('platform.webhook_receipts')
    .set({
      linked_message_id: id,
      // A keyword's receipt is the consent automation's to close (TSK-0048).
      ...(m.keyword
        ? {}
        : {
            state: sql<string>`CASE WHEN state = 'received' THEN 'processed' ELSE state END`,
            processed_at: sql<Date>`coalesce(processed_at, now())`,
          }),
    })
    .where('id', '=', r.id)
    .execute()
  await audit.record(tx, {
    actor: { kind: 'system', process: INBOX_INTAKE },
    action: 'inbox.message_received',
    target: { type: 'inbound_message', id },
    summary: {
      channel: m.channel,
      linkState: match.state,
      ...(match.state === 'matched' ? { rule: match.rule } : { reason: match.reason }),
      attachments: m.attachments.length,
      bodyState: m.body.state,
    },
    requestId,
  })
  return id
}

async function readEmailBody(
  deps: IntakeDeps,
  emailId: string,
  payload: Record<string, unknown>,
  final: boolean,
): Promise<{ body: Body; headers: Record<string, string> }> {
  if (!deps.inboundEmail) return { body: body(null, 'not_retrieved'), headers: {} }
  const content = await deps.inboundEmail.read(emailId, payload)
  if (content.outcome === 'retryable_error') {
    if (!final) throw new InboundReadRetry(content.errorCode)
    return { body: body(null, 'retrieval_failed'), headers: {} }
  }
  if (content.outcome === 'failed') return { body: body(null, 'retrieval_failed'), headers: {} }
  if (content.text !== null && content.text.trim() !== '')
    return { body: body(content.text, 'received'), headers: content.headers }
  if (content.html !== null && !content.html.startsWith('data:'))
    return { body: body(htmlToText(content.html), 'html_converted'), headers: content.headers }
  return { body: body(null, 'empty'), headers: content.headers }
}

async function ignore(tx: Tx, id: string): Promise<void> {
  await tx
    .updateTable('platform.webhook_receipts')
    .set({ state: 'ignored', processed_at: sql<Date>`now()` })
    .where('id', '=', id)
    .where('state', '=', 'received')
    .execute()
}

/** The automation that turns stored inbound receipts into inbox messages. */
export function inboxIntakeAutomation(deps: IntakeDeps): Automation {
  return {
    name: INBOX_INTAKE,
    trigger: { kind: 'event', eventTypes: ['webhook.received'] },
    identity: 'system.inbox',
    inputs: {
      description: 'the stored, signature-verified webhook receipt and the current contact records',
      version: 1,
    },
    idempotency: 'one message per webhook receipt (unique on the message); a replayed receipt adds nothing',
    effect: 'records an inbound email or text, matched to one project or left in Needs Linking, with its queue item',
    retry: { maxAttempts: 5, baseDelayMs: 5_000, maxDelayMs: 300_000 },
    timeoutMs: 30_000,
    exceptionOwner: 'office',
    audit: { action: 'inbox.message_received' },
    handle: async ({ tx, job }): Promise<JobOutcome> => {
      const id = job.target.id
      if (!id) return 'cancelled'
      const r = (await tx
        .selectFrom('platform.webhook_receipts')
        .select(['id', 'provider', 'event_type', 'payload', 'state', 'event_occurred_at', 'received_at'])
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirst()) as Receipt | undefined
      if (!r) return 'cancelled'
      const supported = (SUPPORTED_INBOUND[r.provider as 'bird' | 'resend'] ?? []) as readonly string[]
      if (!supported.includes(r.event_type)) {
        if (/\.received$/.test(r.event_type)) await ignore(tx, r.id)
        return 'done'
      }
      const existing = await tx
        .selectFrom('comms.messages')
        .select('id')
        .where('webhook_receipt_id', '=', r.id)
        .executeTakeFirst()
      if (existing) return 'cancelled'
      const payload = (r.payload ?? {}) as Record<string, unknown>
      const final = job.maxAttempts !== undefined && job.attempt >= job.maxAttempts

      if (r.provider === 'bird') {
        const sms = parseBirdInboundSms(payload)
        if (!sms) {
          await ignore(tx, r.id)
          return 'done'
        }
        const keyword = sms.text === null ? null : keywordOf(sms.text)
        const message: NewMessage = {
          channel: 'sms',
          provider: 'bird',
          providerMessageId: sms.smsId,
          from: sms.from,
          to: sms.to ? [sms.to] : [],
          subject: null,
          body: body(sms.text, 'received'),
          emailMessageId: null,
          references: [],
          attachments: sms.attachments,
          keyword,
        }
        const match = await matchInbound(tx, { channel: 'sms', from: sms.from, replyAddress: deps.replyAddress })
        await store(tx, r, message, match, job.requestId)
        return 'done'
      }

      const email = parseResendInboundEmail(payload)
      if (!email) {
        await ignore(tx, r.id)
        return 'done'
      }
      const read = await readEmailBody(deps, email.emailId, payload, final)
      const references = [
        ...new Set([...messageIds(read.headers['in-reply-to']), ...messageIds(read.headers['references'])]),
      ]
      const message: NewMessage = {
        channel: 'email',
        provider: 'resend',
        providerMessageId: email.emailId,
        from: email.from,
        to: email.to,
        subject: email.subject,
        body: read.body,
        emailMessageId: email.messageId,
        references,
        attachments: email.attachments,
        keyword: null,
      }
      // The sender is the From address; a Reply-To header is never used to match (it does not prove the sender).
      const match = await matchInbound(tx, {
        channel: 'email',
        from: email.from,
        recipients: email.to,
        references,
        replyAddress: deps.replyAddress,
      })
      await store(tx, r, message, match, job.requestId)
      return 'done'
    },
  }
}
