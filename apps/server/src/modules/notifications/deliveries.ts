// Notification delivery (TSK-0047; HH-COM-04, HH-COM-06, HH-AUTO-01, HH-ARC-08, T12, T65, T66).
// - An automatic message is an automation declaration plus a job: `notificationAutomation` declares one per message
//   type, triggered only by the type's committed business events. At send time it rechecks the configured list
//   (a message taken off the list sends nothing), resolves recipients and values from the current records, and writes
//   one delivery row per destination.
// - Every other message is a draft (`createDraft`) that a staff member releases (`releaseDraft`); the release is
//   audited and scheduled as a job of the `notify.release` automation. Reminders whose cadence is held to contact
//   hours wait for the next opening; unanswered-estimate reminders and replies send at once.
// - A delivery row is metadata only (template version, audience, channel, destination, permission, event, record,
//   attempts, provider message ID, state, error code): the rendered text is never stored or logged.
// - The provider idempotency key is derived from the delivery's unique tuple (message type, channel, subject,
//   destination), so a retried job or a double submission reaches the provider with the same key and sends once.
// - Every send goes through the providers' destination guard: outside production, approved test destinations only.
import { createHash } from 'node:crypto'
import type { Tx } from '@handyhub/db'
import type { StaffLocale } from '@handyhub/i18n'
import { sql } from 'kysely'
import { audit, type AuditActor } from '../../platform/audit.js'
import type { Automation, JobContext, JobOutcome } from '../../platform/automation.js'
import { loadConfig, type Config } from '../../platform/config/index.js'
import { scheduleJob } from '../../platform/jobs.js'
import type { EmailSender, SmsSender } from '../../providers/index.js'
import { nextContactTime } from './contact-hours.js'
import { messageType, type Channel } from './message-types.js'
import { automaticPolicy } from './policy.js'
import { contentLocale, currentTemplate, renderTemplate } from './templates.js'

export type Destination = {
  channel: Channel
  /** An e-mail address or an E.164 number. */
  destination: string
  /** How the recipient allowed this channel (HH-COM-04 "channel permission"). */
  permission: 'preferred' | 'permitted' | 'staff_account'
}

export type Recipient = {
  kind: 'customer_contact' | 'staff_user'
  id?: string
  /** Staff recipients only: their own interface locale, which their notifications use. */
  staffLocale?: StaffLocale
  destinations: readonly Destination[]
}

export type Resolved = {
  /** The subject the message is about (for example the request ID): one notification per type, channel and subject. */
  subjectKey: string
  record: { type: string; id: string }
  recipients: readonly Recipient[]
  values: Readonly<Record<string, string>>
}

export type NotificationProviders = { email: EmailSender | null; sms: SmsSender | null }

export class RetryableDeliveryError extends Error {
  override name = 'RetryableDeliveryError'
}

export class DraftError extends Error {
  override name = 'DraftError'
}

/** PROPOSED retry for notification jobs (old repo default): 5 attempts, 30 s doubling, capped at 15 minutes. */
export const NOTIFICATION_RETRY = { maxAttempts: 5, baseDelayMs: 30_000, maxDelayMs: 900_000 } as const

/** Stable per delivery tuple, so every retry presents the same key to the provider. */
export function deliveryIdempotencyKey(
  messageKey: string,
  channel: Channel,
  subjectKey: string,
  destination: string,
): string {
  const h = createHash('sha256').update(`${messageKey}\n${channel}\n${subjectKey}\n${destination}`).digest('hex')
  return `notification/${h.slice(0, 40)}`
}

type DeliveryRow = {
  id: string
  message_key: string
  channel: string
  audience: string
  subject_key: string
  state: string
  locale: string
  destination: string
  variables: unknown
}

/** Renders and sends one delivery row, recording what happened. Retryable outcomes throw so the job retries. */
async function send(
  tx: Tx,
  row: DeliveryRow,
  values: Readonly<Record<string, string>>,
  providers: NotificationProviders,
): Promise<void> {
  const channel = row.channel as Channel
  const update = (set: Record<string, unknown>) =>
    tx
      .updateTable('platform.message_deliveries')
      .set({ ...set, attempts: sql<number>`attempts + 1`, updated_at: sql<Date>`now()` })
      .where('id', '=', row.id)
      .execute()
  const template = await currentTemplate(tx, row.message_key, channel, row.locale as 'en' | 'es')
  if (!template) {
    await update({ state: 'failed', error_code: 'template_not_configured' })
    return
  }
  const sender = channel === 'email' ? providers.email : providers.sms
  if (!sender) {
    await update({ state: 'failed', error_code: 'channel_not_configured', template_version: template.version })
    return
  }
  let rendered: { subject: string | null; body: string }
  try {
    rendered = renderTemplate(template, values)
  } catch {
    await update({ state: 'failed', error_code: 'template_values_missing', template_version: template.version })
    return
  }
  const idempotencyKey = deliveryIdempotencyKey(row.message_key, channel, row.subject_key, row.destination)
  const outcome =
    channel === 'email'
      ? await (sender as EmailSender).send({
          to: row.destination,
          subject: rendered.subject ?? '',
          text: rendered.body,
          idempotencyKey,
        })
      : await (sender as SmsSender).send({
          to: row.destination,
          text: rendered.body,
          category: row.audience === 'customer' ? 'transactional' : 'service',
          idempotencyKey,
        })
  const base = { template_version: template.version, provider: sender.provider }
  switch (outcome.outcome) {
    case 'accepted':
      await update({ ...base, state: outcome.status, provider_message_id: outcome.providerMessageId, error_code: null })
      return
    case 'suppressed':
      await update({ ...base, state: 'suppressed', error_code: outcome.reason })
      return
    case 'rejected':
      await update({ ...base, state: 'failed', error_code: outcome.errorCode })
      return
    case 'retryable_error':
    case 'outcome_unknown':
      // The transaction rolls back; the job retries with the same idempotency key.
      throw new RetryableDeliveryError(outcome.errorCode)
  }
}

async function upsertDelivery(
  tx: Tx,
  input: {
    messageKey: string
    destination: Destination
    recipient: Recipient
    subjectKey: string
    record: { type: string; id: string }
    release: 'automatic' | 'staff_released'
    state: 'queued' | 'draft'
    outboxEventId?: string | null
    variables?: Record<string, string>
  },
): Promise<DeliveryRow> {
  const type = messageType(input.messageKey)
  const locale = contentLocale(type.audience, input.recipient.staffLocale)
  const inserted = await tx
    .insertInto('platform.message_deliveries')
    .values({
      message_key: input.messageKey,
      channel: input.destination.channel,
      audience: type.audience,
      subject_key: input.subjectKey,
      release: input.release,
      state: input.state,
      locale,
      outbox_event_id: input.outboxEventId ?? null,
      record_type: input.record.type,
      record_id: input.record.id,
      recipient_kind: input.recipient.kind,
      recipient_id: input.recipient.id ?? null,
      destination: input.destination.destination,
      channel_permission: input.destination.permission,
      variables: JSON.stringify(input.variables ?? {}),
      queued_at: input.state === 'queued' ? sql<Date>`now()` : null,
    })
    .onConflict((oc) => oc.doNothing())
    .returningAll()
    .executeTakeFirst()
  if (inserted) return inserted
  return tx
    .selectFrom('platform.message_deliveries')
    .selectAll()
    .where('message_key', '=', input.messageKey)
    .where('channel', '=', input.destination.channel)
    .where('subject_key', '=', input.subjectKey)
    .where('recipient_kind', '=', input.recipient.kind)
    .where('destination', '=', input.destination.destination)
    .executeTakeFirstOrThrow()
}

export type NotificationAutomationOptions = {
  messageKey: string
  providers: NotificationProviders
  /** Reads the current records for the job; 'stale' when the triggering state no longer holds (sends nothing). */
  resolve: (ctx: JobContext) => Promise<Resolved | 'stale'>
  /** Defaults to reading the configuration in the job's transaction. */
  config?: (tx: Tx) => Promise<Config>
}

/** The automation declaration of one automatic message type (HH-AUTO-01). */
export function notificationAutomation(o: NotificationAutomationOptions): Automation {
  const type = messageType(o.messageKey)
  const readConfig = o.config ?? ((tx: Tx) => loadConfig(tx))
  return {
    name: `notify.${type.key}`,
    trigger: { kind: 'event', eventTypes: type.triggerEvents },
    identity: 'system.notifications',
    inputs: {
      description: `the committed ${type.triggerEvents.join(' or ')} event; records read at send time`,
      version: 1,
    },
    idempotency: 'one delivery per type, channel, subject and destination; its tuple hash is the provider key',
    effect: `sends ${type.key} to the resolved ${type.audience} destinations, approved test destinations only outside production`,
    retry: NOTIFICATION_RETRY,
    timeoutMs: 30_000,
    exceptionOwner: type.audience === 'customer' ? 'office' : 'owner',
    audit: { action: 'notification.sent' },
    handle: async (ctx): Promise<JobOutcome> => {
      const policy = automaticPolicy(await readConfig(ctx.tx))
      if (!policy.isAutomatic(type.key)) {
        ctx.log.warn({ messageKey: type.key }, 'message is not on the automatic list; nothing sent')
        return 'cancelled'
      }
      const resolved = await o.resolve(ctx)
      if (resolved === 'stale') return 'cancelled'
      for (const recipient of resolved.recipients) {
        for (const destination of recipient.destinations) {
          if (!type.channels.includes(destination.channel)) continue
          const row = await upsertDelivery(ctx.tx, {
            messageKey: type.key,
            destination,
            recipient,
            subjectKey: resolved.subjectKey,
            record: resolved.record,
            release: 'automatic',
            state: 'queued',
            outboxEventId: ctx.job.eventId,
          })
          if (row.state !== 'queued') continue // already sent, suppressed or failed for this subject
          await send(ctx.tx, row, resolved.values, o.providers)
        }
      }
      return 'done'
    },
  }
}

/**
 * A staff-released draft of a message that is NOT on the automatic list. Its values are stored with it (short texts
 * and links, never credentials); the customer content language is English whatever the drafting staff member uses.
 */
export async function createDraft(
  tx: Tx,
  input: {
    config: Config
    messageKey: string
    destination: Destination
    recipient: Recipient
    subjectKey: string
    record: { type: string; id: string }
    values: Record<string, string>
  },
): Promise<{ id: string }> {
  const type = messageType(input.messageKey)
  if (automaticPolicy(input.config).isAutomatic(type.key))
    throw new DraftError(`${type.key} sends automatically from its event; it is not drafted`)
  if (!type.channels.includes(input.destination.channel))
    throw new DraftError(`${type.key} is not sent by ${input.destination.channel}`)
  for (const k of Object.keys(input.values)) {
    const kind = type.variables[k]
    if (!kind) throw new DraftError(`${type.key} does not declare {${k}}`)
    if (kind === 'credential') throw new DraftError('a draft never stores a code or an access link')
  }
  const row = await upsertDelivery(tx, {
    messageKey: type.key,
    destination: input.destination,
    recipient: input.recipient,
    subjectKey: input.subjectKey,
    record: input.record,
    release: 'staff_released',
    state: 'draft',
    variables: input.values,
  })
  return { id: row.id }
}

/** Cadence keys of reminders, for the contact-hours rule (FACT-REMINDER-CADENCES, HH-COM-09). */
const REMINDER_CADENCE: Record<string, string> = {
  'reminder.unanswered_estimate': 'unansweredEstimate',
  'reminder.unanswered_question': 'unansweredQuestion',
  'reminder.appointment': 'appointment',
  'reminder.satisfaction_check': 'satisfaction',
  'reminder.unpaid_invoice': 'unpaidInvoice',
  'reminder.repeat_service': 'repeatService',
}

/** When a released draft may send: now, or the next contact-hours opening for reminders held to those hours. */
export function releaseTime(config: Config, messageKey: string, now: Date): Date {
  const cadenceKey = REMINDER_CADENCE[messageKey]
  if (!cadenceKey) return now
  const cadences = config.get('reminders.cadences')
  const hours = config.get('contact.hours')
  const zone = config.get('business.timezone')
  if (cadences.state !== 'CONFIGURED' || hours.state !== 'CONFIGURED' || zone.state !== 'CONFIGURED') return now
  const cadence = (cadences.value as Record<string, { contactHoursOnly: boolean }>)[cadenceKey]
  if (!cadence?.contactHoursOnly) return now
  return nextContactTime(now, hours.value, zone.value.zone)
}

/** The automation that sends released drafts (scheduled per release). */
export function releaseAutomation(providers: NotificationProviders): Automation {
  return {
    name: 'notify.release',
    trigger: { kind: 'schedule', description: 'one job per released draft, at its release time' },
    identity: 'system.notifications',
    inputs: { description: 'the released delivery row and its stored values', version: 1 },
    idempotency: 'one job per delivery; its tuple hash is the provider key',
    effect: 'sends one staff-released message, approved test destinations only outside production',
    retry: NOTIFICATION_RETRY,
    timeoutMs: 30_000,
    exceptionOwner: 'office',
    audit: { action: 'notification.sent' },
    handle: async (ctx): Promise<JobOutcome> => {
      const id = String(ctx.job.payload['deliveryId'] ?? '')
      const row = await ctx.tx
        .selectFrom('platform.message_deliveries')
        .selectAll()
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirst()
      if (!row || row.state !== 'queued') return 'cancelled'
      await send(ctx.tx, row, (row.variables ?? {}) as Record<string, string>, providers)
      return 'done'
    },
  }
}

/** Staff release of a draft: audited, then sent by a `notify.release` job at its release time. */
export async function releaseDraft(
  tx: Tx,
  input: {
    config: Config
    deliveryId: string
    actor: Extract<AuditActor, { kind: 'staff' }>
    automation: Automation
    requestId: string
    now?: Date
  },
): Promise<{ runAt: Date }> {
  const row = await tx
    .updateTable('platform.message_deliveries')
    .set({ state: 'queued', released_by: input.actor.id, queued_at: sql<Date>`now()`, updated_at: sql<Date>`now()` })
    .where('id', '=', input.deliveryId)
    .where('state', '=', 'draft')
    .returning(['id', 'message_key', 'record_type', 'record_id', 'channel'])
    .executeTakeFirst()
  if (!row) throw new DraftError(`delivery ${input.deliveryId} is not a draft`)
  const runAt = releaseTime(input.config, row.message_key, input.now ?? new Date())
  await scheduleJob(tx, input.automation, {
    key: row.id,
    runAt,
    payload: { deliveryId: row.id },
    target: { type: 'message_delivery', id: row.id },
    requestId: input.requestId,
  })
  await audit.record(tx, {
    actor: input.actor,
    action: 'message.released',
    target: { type: 'message_delivery', id: row.id },
    summary: { messageKey: row.message_key, channel: row.channel, record: `${row.record_type}:${row.record_id}` },
    requestId: input.requestId,
  })
  return { runAt }
}
