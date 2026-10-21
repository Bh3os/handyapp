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
// - TSK-0032 review (HH-ARC-09, HH-INT-20, HH-COM-02, HH-SEC-06):
//   - every delivery a job handles records its own audit event with what truly happened (notification.sent,
//     notification.failed, notification.suppressed or notification.outcome_unknown); the job itself is audited as
//     notification.processed, never as a send;
//   - an uncertain provider outcome (a timeout or a lost answer after the request went out) on the last attempt is
//     recorded with an `outcome_unknown_<code>` error code: the provider may have sent it, so it gets no Retry (its
//     delivery issue is resolved as outcome_unknown and the delivery stays listed as failed in System health for
//     reconciliation against the provider's own record); only a definite failure is retried by staff;
//   - a delivery a staff retry queued again that the re-run does not send (the message left the automatic list, the
//     record went stale, the recipient changed, or the job failed) goes back to failed with that reason, and its
//     delivery issue follows, so nothing reads queued for good;
//   - a delivery issue follows its record's responsible staff member when the record is reassigned.
import { createHash } from 'node:crypto'
import type { Tx } from '@handyhub/db'
import type { StaffLocale } from '@handyhub/i18n'
import { sql, type SqlBool } from 'kysely'
import { audit, type AuditActor } from '../../platform/audit.js'
import type { Automation, JobContext, JobOutcome } from '../../platform/automation.js'
import { loadConfig, type Config } from '../../platform/config/index.js'
import { scheduleJob } from '../../platform/jobs.js'
import { outbox } from '../../platform/outbox.js'
import { currentContext } from '../../platform/request-context.js'
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

/**
 * The outcome of a customer delivery, for the modules that follow it (TSK-0043: the first-response clock, HH-LEAD-05).
 * Written in the same transaction as the delivery's new state: `message.delivery_succeeded` when a delivery first
 * becomes sent or delivered, `message.delivery_failed` when it fails or is suppressed. Identifiers and times only.
 */
export async function recordDeliveryOutcome(
  tx: Tx,
  input: { deliveryId: string; audience: string; outcome: 'succeeded' | 'failed'; at: Date; cause: string },
): Promise<void> {
  if (input.audience !== 'customer') return
  const type = input.outcome === 'succeeded' ? 'message.delivery_succeeded' : 'message.delivery_failed'
  await outbox.add(tx, {
    type,
    aggregate: { type: 'message_delivery', id: input.deliveryId },
    payload: { at: input.at.toISOString() },
    idempotencyKey: `${type}:${input.deliveryId}:${input.cause}`,
    requestId: currentContext()?.requestId ?? `delivery:${input.deliveryId}`,
  })
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
 * The error-code prefix of a delivery whose provider outcome is not known (HH-ARC-09): the request may have reached the
 * provider and been sent, so it is reconciled against the provider's own record, never retried blindly.
 */
export const OUTCOME_UNKNOWN_PREFIX = 'outcome_unknown_'

/** Whether a delivery's error code records an uncertain provider outcome. */
export function isOutcomeUnknown(errorCode: string | null | undefined): boolean {
  return typeof errorCode === 'string' && errorCode.startsWith(OUTCOME_UNKNOWN_PREFIX)
}

/** The audit action of a send's result: what truly happened to the delivery (HH-SEC-06). */
export function deliveryAuditAction(result: SendResult): string {
  if (result.state === 'failed')
    return isOutcomeUnknown(result.errorCode) ? 'notification.outcome_unknown' : 'notification.failed'
  if (result.state === 'suppressed') return 'notification.suppressed'
  if (result.state === 'cancelled') return 'notification.cancelled'
  return 'notification.sent'
}

/** One audit event per delivery handled, in the job's transaction, with the true outcome. */
async function auditDelivery(
  tx: Tx,
  job: { requestId: string },
  process: string,
  row: { id: string; message_key: string; channel: string },
  result: SendResult,
) {
  await audit.record(tx, {
    actor: { kind: 'system', process },
    action: deliveryAuditAction(result),
    target: { type: 'message_delivery', id: row.id },
    result: result.state === 'failed' ? 'failed' : 'succeeded',
    summary: { messageKey: row.message_key, channel: row.channel, state: result.state, errorCode: result.errorCode },
    requestId: job.requestId,
  })
}

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
    // The outcome for the modules that follow customer deliveries (TSK-0043: the first-response clock), in the same
    // transaction as the new state: sent or delivered succeeded; failed (also an unknown last outcome) or suppressed failed.
    const outcome =
      set.state === 'sent' || set.state === 'delivered'
        ? 'succeeded'
        : set.state === 'failed' || set.state === 'suppressed'
          ? 'failed'
          : null
    if (outcome)
      await recordDeliveryOutcome(tx, {
        deliveryId: row.id,
        audience: row.audience,
        outcome,
        at: new Date(),
        cause: 'send',
      })
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
      // The last attempt: the failure is recorded, never shown as sent; a staff retry presents the same key again.
      if (final) return update({ ...base, state: 'failed', error_code: outcome.errorCode })
      // The transaction rolls back; the job retries with the same idempotency key.
      throw new RetryableDeliveryError(outcome.errorCode)
    case 'outcome_unknown':
      // The last attempt: the provider may have sent it. Recorded as an unknown outcome, which staff cannot retry
      // blindly: once the provider's idempotency window has passed the same key would send a second message.
      if (final)
        return update({
          ...base,
          state: 'failed',
          error_code: `${OUTCOME_UNKNOWN_PREFIX}${outcome.errorCode}`.slice(0, 120),
        })
      throw new RetryableDeliveryError(outcome.errorCode)
  }
}

/**
 * The staff side of a send's result (HH-COM-02, HH-INT-20): a failed delivery opens (or updates) its one
 * delivery_failed item; a send handed over or suppressed resolves an open one. Nothing for messages without one.
 */
async function syncFailureItem(tx: Tx, deliveryId: string, result: SendResult, item: FailureItem | undefined) {
  if (!item) return
  // An unknown outcome has no Retry: an open delivery issue (from an earlier definite failure) is resolved, and the
  // delivery stays listed as failed in System health until it is reconciled against the provider (HH-ARC-09).
  if (result.state === 'failed' && isOutcomeUnknown(result.errorCode)) {
    await resolveQueueItem(tx, { type: 'delivery_failed', subjectId: deliveryId, resolution: 'outcome_unknown' })
    return
  }
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

/**
 * Deliveries of this event and message that a staff retry queued again (retry.ts) and this run did not send: they go
 * back to failed with the reason, so none reads queued for good (HH-COM-02). `keepIssue`: their delivery issue stays
 * open (the failure can be retried again); otherwise it is resolved with the same reason, as no Retry can send it.
 * Before a staff retry no automatic delivery is queued outside its own job's transaction, so only retried rows match.
 */
async function settleUnsentRetries(
  tx: Tx,
  input: {
    eventId: string | null
    messageKey: string
    errorCode: string
    keepIssue: boolean
    sent?: readonly string[]
    job: { requestId: string }
    process: string
  },
): Promise<number> {
  if (!input.eventId) return 0
  let q = tx
    .updateTable('platform.message_deliveries')
    .set({ state: 'failed', error_code: input.errorCode, updated_at: sql<Date>`now()` })
    .where('outbox_event_id', '=', input.eventId)
    .where('message_key', '=', input.messageKey)
    .where('release', '=', 'automatic')
    .where('state', '=', 'queued')
    .where('provider_message_id', 'is', null)
  if (input.sent?.length) q = q.where('id', 'not in', input.sent)
  const rows = await q.returning(['id', 'message_key', 'channel']).execute()
  for (const row of rows) {
    const result = { state: 'failed', errorCode: input.errorCode }
    await auditDelivery(tx, input.job, input.process, row, result)
    if (!input.keepIssue)
      await resolveQueueItem(tx, { type: 'delivery_failed', subjectId: row.id, resolution: input.errorCode })
  }
  return rows.length
}

/**
 * Keeps the open delivery issues of a record's deliveries with the staff member now responsible for it (TSK-0032,
 * HH-OPS-02, RULE-SERVER-AUTHZ): called in the same transaction as the reassignment, so the queue and the Retry check
 * never use a stale owner.
 */
export async function syncDeliveryFailureOwner(
  tx: Tx,
  input: { recordType: string; recordId: string; assignedStaffId: string | null },
): Promise<number> {
  const res = await tx
    .updateTable('ops.queue_items')
    .set({ assigned_staff_id: input.assignedStaffId, updated_at: sql<Date>`now()`, version: sql<number>`version + 1` })
    .where('type', '=', 'delivery_failed')
    .where('subject_type', '=', 'message_delivery')
    .where('resolved_at', 'is', null)
    .where(sql<SqlBool>`assigned_staff_id IS DISTINCT FROM ${input.assignedStaffId}`)
    .where('subject_id', 'in', (eb) =>
      eb
        .selectFrom('platform.message_deliveries')
        .select(sql<string>`id::text`.as('id'))
        .where('record_type', '=', input.recordType)
        .where('record_id', '=', input.recordId),
    )
    .executeTakeFirst()
  return Number(res.numUpdatedRows)
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
  const process = 'system.notifications'
  return {
    name: `notify.${type.key}`,
    trigger: { kind: 'event', eventTypes: type.triggerEvents },
    identity: process,
    inputs: {
      description: `the committed ${type.triggerEvents.join(' or ')} event; records read at send time`,
      version: 1,
    },
    idempotency: 'one delivery per type, channel, subject and destination; its tuple hash is the provider key',
    effect: `sends ${type.key} to the resolved ${type.audience} destinations, approved test destinations only outside production`,
    retry: NOTIFICATION_RETRY,
    timeoutMs: 30_000,
    exceptionOwner: type.audience === 'customer' ? 'office' : 'owner',
    // The job is audited as processed; each delivery records its own outcome (auditDelivery).
    audit: { action: 'notification.processed' },
    // A failed run leaves a delivery a staff retry queued as failed again, with its delivery issue still open.
    onFinalFailure: async ({ tx, job }) => {
      await settleUnsentRetries(tx, {
        eventId: job.eventId,
        messageKey: type.key,
        errorCode: 'retry_job_failed',
        keepIssue: true,
        job,
        process,
      })
    },
    handle: async (ctx): Promise<JobOutcome> => {
      const settle = (errorCode: string, sent?: readonly string[]) =>
        settleUnsentRetries(ctx.tx, {
          eventId: ctx.job.eventId,
          messageKey: type.key,
          errorCode,
          keepIssue: false,
          ...(sent ? { sent } : {}),
          job: ctx.job,
          process,
        })
      const policy = automaticPolicy(await readConfig(ctx.tx))
      if (!policy.isAutomatic(type.key)) {
        ctx.log.warn({ messageKey: type.key }, 'message is not on the automatic list; nothing sent')
        await settle('not_automatic')
        return 'cancelled'
      }
      const resolved = await o.resolve(ctx)
      if (resolved === 'stale') {
        await settle('record_changed')
        return 'cancelled'
      }
      const handled: string[] = []
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
          handled.push(row.id)
          // Already handed to the provider, suppressed or failed for this subject: a replay sends nothing. A failed
          // delivery is queued again only by a staff retry (retry.ts).
          if (row.state !== 'queued' || row.provider_message_id !== null) continue
          const final = ctx.job.maxAttempts !== undefined && ctx.job.attempt >= ctx.job.maxAttempts
          const result = await send(ctx.tx, row, resolved.values, o.providers, final)
          await auditDelivery(ctx.tx, ctx.job, process, row, result)
          await syncFailureItem(ctx.tx, row.id, result, resolved.failureItem)
        }
      }
      // A retried delivery whose recipient or destination is no longer resolved was not sent by this run.
      await settle('recipient_changed', handled)
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
 * - { stale: reason }: the same, with the reason the check names (TSK-0060: why an estimate reminder stopped), recorded
 *   as the cancelled delivery's error code;
 * - { hold }: send later (for example a review or satisfaction request while a case is active): the delivery goes
 *   back to a draft marked held, for staff to release again once the reason has cleared.
 * A record type without a registered check is sent as released.
 */
export type RecordCheckResult = 'current' | 'stale' | { stale: string } | { hold: string }
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
    // The job is audited as processed; the delivery records its own outcome (auditDelivery).
    audit: { action: 'notification.processed' },
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
      if (verdict === 'stale' || (typeof verdict === 'object' && 'stale' in verdict)) {
        const errorCode = verdict === 'stale' ? 'record_changed' : verdict.stale.slice(0, 120)
        await ctx.tx
          .updateTable('platform.message_deliveries')
          .set({
            state: 'cancelled',
            error_code: errorCode,
            cancelled_by: 'system',
            cancelled_at: sql<Date>`now()`,
            updated_at: sql<Date>`now()`,
          })
          .where('id', '=', row.id)
          .execute()
        await auditDelivery(ctx.tx, ctx.job, 'system.notifications', row, { state: 'cancelled', errorCode })
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
      const result = await send(ctx.tx, row, (row.variables ?? {}) as Record<string, string>, providers)
      await auditDelivery(ctx.tx, ctx.job, 'system.notifications', row, result)
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
