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
// - TSK-0032 (HH-COM-02, HH-INT-20, T12): a message whose resolver names a failure item opens one `delivery_failed`
//   staff queue item per failed delivery (its one action is Retry, retry.ts) and resolves it once a send is handed
//   over or suppressed. A temporary provider failure on the job's last attempt is recorded as a failed delivery, so it
//   reaches staff as a delivery issue with Retry instead of only as a failed job.
// - TSK-0049 (HH-COM-07, OWN-DEC-120): a delivery records its project. A customer email of a project replies to the
//   project's plus-addressed reply token while a receiving address is configured, so the customer's reply threads back
//   to that project; without one it keeps the configured reply-to.
import { createHash } from 'node:crypto'
import type { Tx } from '@handyhub/db'
import type { StaffLocale } from '@handyhub/i18n'
import { sql } from 'kysely'
import { audit, type AuditActor } from '../../platform/audit.js'
import type { Automation, JobContext, JobOutcome } from '../../platform/automation.js'
import { loadConfig, type Config } from '../../platform/config/index.js'
import { scheduleJob } from '../../platform/jobs.js'
import type { EmailSender, SmsSender } from '../../providers/index.js'
import { projectReplyToken, replyAddress, type InboundAddress } from '../inbox/threading.js'
import { openQueueItem, resolveQueueItem } from '../queue/items.js'
import { nextContactTime } from './contact-hours.js'
import { messageType, type Channel } from './message-types.js'
import { sendPermission } from './consent.js'
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

/**
 * The staff queue facts of a failed delivery (HH-OPS-02): the record's reference and project, and its owner (the
 * staff member responsible for the record, or none: then the item is unassigned and Office and the Owner see it).
 */
export type FailureItem = { reference: string | null; projectId: string | null; assignedStaffId: string | null }

export type Resolved = {
  /** The subject the message is about (for example the request ID): one notification per type, channel and subject. */
  subjectKey: string
  record: { type: string; id: string }
  recipients: readonly Recipient[]
  values: Readonly<Record<string, string>>
  /** When set, a failed delivery opens one `delivery_failed` queue item with these facts (TSK-0032). */
  failureItem?: FailureItem
  /** TSK-0049: the project the message belongs to; default the failure item's project. */
  projectId?: string | null
}

export type NotificationProviders = {
  email: EmailSender | null
  sms: SmsSender | null
  /** TSK-0049: the receiving address of inbound email (INBOUND_EMAIL_ADDRESS); null or unset: no reply tokens. */
  replyAddress?: InboundAddress | null
}

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
  provider_message_id: string | null
  project_id: string | null
}

/** What a send recorded on the delivery row. */
export type SendResult = { state: string; errorCode: string | null }

/** Error codes of a message that cannot be sent until something is configured (a template, a channel). */
export const NOT_CONFIGURED_ERRORS: ReadonlySet<string> = new Set(['template_not_configured', 'channel_not_configured'])

/**
 * Renders and sends one delivery row, recording what happened. Temporary outcomes throw so the job retries, except
 * on the job's last attempt (`final`), where the failure is recorded on the row instead (TSK-0032).
 */
async function send(
  tx: Tx,
  row: DeliveryRow,
  values: Readonly<Record<string, string>>,
  providers: NotificationProviders,
  final = false,
): Promise<SendResult> {
  const channel = row.channel as Channel
  const update = async (set: { state: string; error_code: string | null } & Record<string, unknown>) => {
    await tx
      .updateTable('platform.message_deliveries')
      .set({ ...set, attempts: sql<number>`attempts + 1`, updated_at: sql<Date>`now()` })
      .where('id', '=', row.id)
      .execute()
    return { state: set.state, errorCode: set.error_code }
  }
  const template = await currentTemplate(tx, row.message_key, channel, row.locale as 'en' | 'es')
  if (!template) return update({ state: 'failed', error_code: 'template_not_configured' })
  const sender = channel === 'email' ? providers.email : providers.sms
  if (!sender)
    return update({ state: 'failed', error_code: 'channel_not_configured', template_version: template.version })
  // Send-time recheck of channel permission and consent (HH-COM-05, TSK-0048): a STOP, a missing SMS opt-in or a
  // missing marketing permission suppresses the message instead of sending it.
  const permission = await sendPermission(tx, {
    channel,
    destination: row.destination,
    audience: row.audience as 'customer' | 'staff',
    messageKey: row.message_key,
  })
  if (!permission.allowed)
    return update({ state: 'suppressed', error_code: permission.reason, template_version: template.version })
  let rendered: { subject: string | null; body: string }
  try {
    rendered = renderTemplate(template, values)
  } catch {
    return update({ state: 'failed', error_code: 'template_values_missing', template_version: template.version })
  }
  const idempotencyKey = deliveryIdempotencyKey(row.message_key, channel, row.subject_key, row.destination)
  // A customer email of a project replies to the project's token address (TSK-0049).
  const replyTo =
    channel === 'email' && row.audience === 'customer' && row.project_id && providers.replyAddress
      ? replyAddress(providers.replyAddress, await projectReplyToken(tx, row.project_id))
      : undefined
  const outcome =
    channel === 'email'
      ? await (sender as EmailSender).send({
          to: row.destination,
          subject: rendered.subject ?? '',
          text: rendered.body,
          idempotencyKey,
          ...(replyTo ? { replyTo } : {}),
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
      return update({
        ...base,
        state: outcome.status,
        provider_message_id: outcome.providerMessageId,
        error_code: null,
      })
    case 'suppressed':
      return update({ ...base, state: 'suppressed', error_code: outcome.reason })
    case 'rejected':
      return update({ ...base, state: 'failed', error_code: outcome.errorCode })
    case 'retryable_error':
    case 'outcome_unknown':
      // The last attempt: the failure is recorded, never shown as sent; a staff retry presents the same key again.
      if (final) return update({ ...base, state: 'failed', error_code: outcome.errorCode })
      // The transaction rolls back; the job retries with the same idempotency key.
      throw new RetryableDeliveryError(outcome.errorCode)
  }
}

/**
 * The staff side of a send's result (HH-COM-02, HH-INT-20): a failed delivery opens (or updates) its one
 * delivery_failed item; a send handed over or suppressed resolves an open one. Nothing for messages without one.
 */
async function syncFailureItem(tx: Tx, deliveryId: string, result: SendResult, item: FailureItem | undefined) {
  if (!item) return
  if (result.state === 'failed') {
    await openQueueItem(tx, {
      type: 'delivery_failed',
      subjectId: deliveryId,
      reason: NOT_CONFIGURED_ERRORS.has(result.errorCode ?? '') ? 'delivery_not_configured' : 'delivery_failed',
      projectId: item.projectId,
      reference: item.reference,
      status: 'failed',
      assignedStaffId: item.assignedStaffId,
    })
    return
  }
  await resolveQueueItem(tx, { type: 'delivery_failed', subjectId: deliveryId, resolution: result.state })
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
    projectId?: string | null
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
      project_id: input.projectId ?? null,
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
            projectId: resolved.projectId ?? resolved.failureItem?.projectId ?? null,
          })
          // Already handed to the provider, suppressed or failed for this subject: a replay sends nothing. A failed
          // delivery is queued again only by a staff retry (retry.ts).
          if (row.state !== 'queued' || row.provider_message_id !== null) continue
          const final = ctx.job.maxAttempts !== undefined && ctx.job.attempt >= ctx.job.maxAttempts
          const result = await send(ctx.tx, row, resolved.values, o.providers, final)
          await syncFailureItem(ctx.tx, row.id, result, resolved.failureItem)
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
    /** TSK-0049: the project the message belongs to (its reply address and conversation). */
    projectId?: string | null
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
    projectId: input.projectId ?? null,
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

/**
 * Send-time recheck of the record a staff-released message is about (HH-COM-05, TSK-0048). Each feature registers
 * the check of its record type (estimate, visit, invoice, project with an active case...):
 * - 'current': send;
 * - 'stale': the record changed (approved, declined, expired, cancelled, rescheduled, paid, replied, ...): nothing is
 *   sent and the delivery is cancelled;
 * - { hold }: send later (for example a review or satisfaction request while a case is active): the delivery goes
 *   back to a draft marked held, for staff to release again once the reason has cleared.
 * A record type without a registered check is sent as released.
 */
export type RecordCheckResult = 'current' | 'stale' | { hold: string }
export type RecordCheck = (
  tx: Tx,
  input: { recordType: string; recordId: string; messageKey: string; subjectKey: string },
) => Promise<RecordCheckResult>
export type RecordChecks = Readonly<Record<string, RecordCheck>>

/** The automation that sends released drafts (scheduled per release). */
export function releaseAutomation(
  providers: NotificationProviders,
  options: { recordChecks?: RecordChecks } = {},
): Automation {
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
      const check = row.record_type ? options.recordChecks?.[row.record_type] : undefined
      const verdict: RecordCheckResult =
        check && row.record_id
          ? await check(ctx.tx, {
              recordType: row.record_type as string,
              recordId: row.record_id,
              messageKey: row.message_key,
              subjectKey: row.subject_key,
            })
          : 'current'
      if (verdict === 'stale') {
        await ctx.tx
          .updateTable('platform.message_deliveries')
          .set({ state: 'cancelled', error_code: 'record_changed', updated_at: sql<Date>`now()` })
          .where('id', '=', row.id)
          .execute()
        return 'cancelled'
      }
      if (verdict !== 'current') {
        await ctx.tx
          .updateTable('platform.message_deliveries')
          .set({
            state: 'draft',
            released_by: null,
            queued_at: null,
            error_code: `held_${verdict.hold}`.slice(0, 120),
            updated_at: sql<Date>`now()`,
          })
          .where('id', '=', row.id)
          .execute()
        return 'cancelled'
      }
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
