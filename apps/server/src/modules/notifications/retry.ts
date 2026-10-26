// Staff retry of a failed automatic message (TSK-0032; HH-INT-20, HH-COM-02, HH-OPS-01, HH-ARC-09, T12,
// RULE-SERVER-AUTHZ). The one action of a delivery_failed queue item.
// - Only a failed delivery of an automatic message that never reached the provider is queued again; the send runs as
//   a new job of the message's own automation (rerunJob), which rechecks the automatic list, the template, consent
//   and the record at send time and presents the same provider idempotency key. A retry therefore sends at most one
//   message, and a second press while it is queued, or after it was sent, is a CONFLICT.
// - PROPOSED permission: message.release_draft (retrying a message is releasing it again; ROLE-MATRIX "Reply from a
//   project, release drafts"). An Estimator retries only items assigned to them; a Worker never.
// - The queue item resolves when the send is handed over or suppressed, and stays open when it fails again.
// - TSK-0032 review:
//   - only a delivery with an open delivery issue is retried (a verification code or any other message without one is
//     a CONFLICT), so the route never re-sends what has no Retry action (HH-COM-06);
//   - an uncertain provider outcome (outcome_unknown_<code>: the provider may have sent it) is a CONFLICT naming
//     OUTCOME_UNKNOWN: it is reconciled against the provider's record before anything is sent again (HH-ARC-09,
//     HH-INT-20 exactly one receipt);
//   - the Estimator's own-record check uses the record's current responsible staff member (a request's), never a
//     snapshot on the item (RULE-SERVER-AUTHZ).
// - TSK-0050 (HH-COM-08, HH-COM-02, T66): a failed staff reply is retried the same way. Its delivery was released by
//   Send, so the retry is a new `notify.release` job at the reply's release time (it waits for the contact hours
//   again while replies.contact_hours says so), which rechecks the contact, consent and the template at send time and
//   presents the same provider idempotency key. Other staff-released drafts are still a CONFLICT.
// - TSK-0051 (HH-LEAD-06, HH-COM-02): a failed released question reminder is retried the same way (it waits for the
//   contact hours again and is rechecked against its question at send time).
// - TSK-0067 (HH-COM-11, OWN-DEC-107 "record delivery failures for staff"): so is a failed released appointment
//   reminder (inside the contact hours, rechecked against its visit at send time).
// - TSK-0121, TSK-0122 (OWN-DEC-153, OWN-DEC-154): the routine reminders are scheduled automatic deliveries sent by
//   notify.release; a failed one (estimate, question or appointment reminder) is retried the same way, by a new
//   notify.release job, rechecked against its record at send time. Every retry goes at once by email and at the next
//   allowed time of the recipient's permitted hours by text.
// - TSK-0091 (OWN-DEC-210): so is a failed unpaid-invoice reminder or follow-up (email only), rechecked against its
//   invoice at send time.
import { randomUUID } from 'node:crypto'
import { sql } from 'kysely'
import { ApiError } from '../../api/errors.js'
import type { Tx } from '@handyhub/db'
import type { ApiContext, ApiModule, ApiResult, RouteDef } from '../../api/route.js'
import { loadConfig } from '../../platform/config/index.js'
import { rerunJob, scheduleJob } from '../../platform/jobs.js'
import { currentContext } from '../../platform/request-context.js'
import { isOutcomeUnknown, releaseAutomation, releaseTime, STAFF_REPLY_MESSAGE_KEY } from './deliveries.js'
import { MESSAGE_VIEW_ROUTES } from './message-routes.js'
import { automaticPolicy } from './policy.js'

const DELIVERY_ID = {
  type: 'string',
  pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
} as const

const UUID = new RegExp(DELIVERY_ID.pattern)

const retryDelivery: RouteDef = {
  method: 'POST',
  path: '/staff/message-deliveries/:deliveryId/retry',
  operationId: 'retryMessageDelivery',
  summary: 'Retry a failed message',
  description:
    'The Retry action of a delivery_failed queue item (HH-INT-20, HH-COM-02). Queues a failed delivery of an ' +
    'automatic message again, only when it never reached the provider: a new job of the message’s own automation ' +
    'sends it, rechecking the automatic list, the template, consent and the record, under the same provider ' +
    'idempotency key, so a retry sends at most one message. A failed staff reply (TSK-0050) is released again the ' +
    'same way, and so is a failed estimate, question or appointment reminder (TSK-0121): an email at once, a text at ' +
    'the next allowed time of the recipient’s permitted hours (TSK-0122). A ' +
    'delivery that is not failed (queued, sent, suppressed), any other staff-released draft, a message no longer ' +
    'on the automatic list or a delivery without an open ' +
    'delivery issue is a CONFLICT; so is an uncertain provider outcome (fieldErrors code OUTCOME_UNKNOWN), which is ' +
    'reconciled against the provider instead (HH-ARC-09). A re-run that sends nothing leaves the delivery failed ' +
    'with its reason. Staff with message.release_draft; an Estimator only for deliveries of records they are ' +
    'responsible for. The queue item resolves once the send is handed over.',
  actors: ['staff'],
  permission: 'message.release_draft',
  kind: 'write',
  idempotency: 'required',
  expectedVersion: 'none',
  rateLimit: 'none',
  audit: 'message.retry',
  pagination: false,
  test: 'test/integration/request-receipt.test.ts',
  resource: async ({ req, db }) => {
    const { deliveryId } = req.params as { deliveryId: string }
    const delivery = await db
      .selectFrom('platform.message_deliveries')
      .select(['id', 'record_type', 'record_id'])
      .where('id', '=', deliveryId)
      .executeTakeFirst()
    if (!delivery) return null
    // A request's delivery: its project and owner are the request's own, as they are now (defence in depth behind
    // syncDeliveryFailureOwner, so the own-record check never uses a stale owner).
    if (delivery.record_type === 'request' && delivery.record_id && UUID.test(delivery.record_id)) {
      const request = await db
        .selectFrom('intake.requests')
        .select(['project_id', 'responsible_staff_id'])
        .where('id', '=', delivery.record_id)
        .executeTakeFirst()
      return {
        ...(request?.project_id ? { projectId: request.project_id } : {}),
        ...(request?.responsible_staff_id ? { ownerStaffId: request.responsible_staff_id } : {}),
      }
    }
    // Any other record: the facts of the delivery's open queue item, its project and its owner.
    const item = await db
      .selectFrom('ops.queue_items')
      .select(['project_id', 'assigned_staff_id'])
      .where('type', '=', 'delivery_failed')
      .where('subject_id', '=', delivery.id)
      .where('resolved_at', 'is', null)
      .executeTakeFirst()
    return {
      ...(item?.project_id ? { projectId: item.project_id } : {}),
      ...(item?.assigned_staff_id ? { ownerStaffId: item.assigned_staff_id } : {}),
    }
  },
  schema: {
    params: {
      type: 'object',
      additionalProperties: false,
      required: ['deliveryId'],
      properties: { deliveryId: DELIVERY_ID },
    },
    response: {
      200: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'state'],
        properties: { id: { type: 'string', format: 'uuid' }, state: { type: 'string', enum: ['queued'] } },
      },
    },
  },
  handler: async (ctx) => {
    const tx = ctx.tx
    if (!tx) throw new Error('retryMessageDelivery runs inside its write transaction')
    const { deliveryId } = ctx.req.params as { deliveryId: string }
    const row = await tx
      .selectFrom('platform.message_deliveries')
      .select([
        'id',
        'message_key',
        'channel',
        'release',
        'state',
        'attempts',
        'error_code',
        'provider_message_id',
        'outbox_event_id',
        'record_type',
        'record_id',
        'recipient_kind',
        'recipient_id',
      ])
      .where('id', '=', deliveryId)
      .forUpdate()
      .executeTakeFirst()
    if (!row) throw new ApiError('NOT_FOUND')
    // The provider may already have sent it: reconciled against the provider's record, never sent again blindly.
    if (row.state === 'failed' && isOutcomeUnknown(row.error_code))
      throw new ApiError('CONFLICT', { fieldErrors: [{ field: 'state', code: 'OUTCOME_UNKNOWN', message: '' }] })
    if (RETRYABLE_RELEASED.has(row.message_key) && (row.release === 'staff_released' || row.outbox_event_id === null))
      return retryReply(ctx, tx, row)
    if (
      row.release !== 'automatic' ||
      row.state !== 'failed' ||
      row.provider_message_id !== null ||
      row.outbox_event_id === null ||
      !automaticPolicy(await loadConfig(tx)).isAutomatic(row.message_key)
    )
      throw new ApiError('CONFLICT')
    // Only what staff were offered a Retry for: a failed delivery with its open delivery issue.
    const issue = await tx
      .selectFrom('ops.queue_items')
      .select('id')
      .where('type', '=', 'delivery_failed')
      .where('subject_type', '=', 'message_delivery')
      .where('subject_id', '=', row.id)
      .where('resolved_at', 'is', null)
      .executeTakeFirst()
    if (!issue)
      throw new ApiError('CONFLICT', { fieldErrors: [{ field: 'state', code: 'NO_DELIVERY_ISSUE', message: '' }] })
    // The event's own job of the message's automation; the retry is a new run of it.
    const job = await tx
      .selectFrom('platform.jobs')
      .select('id')
      .where('job_key', '=', `${row.outbox_event_id}:notify.${row.message_key}`)
      .where('state', 'in', ['succeeded', 'cancelled', 'failed'])
      .executeTakeFirst()
    if (!job) throw new ApiError('CONFLICT')
    await tx
      .updateTable('platform.message_deliveries')
      .set({
        state: 'queued',
        error_code: null,
        missing_variables: [],
        queued_at: sql<Date>`now()`,
        scheduled_at: sql<Date>`now()`,
        updated_at: sql<Date>`now()`,
      })
      .where('id', '=', row.id)
      .execute()
    // One new run per accepted retry: the row lock and the checks above admit one retry per failure, and a re-run
    // that sent nothing leaves the delivery failed, so the next retry needs a run of its own.
    await rerunJob(tx, {
      jobId: job.id,
      key: `retry:${row.attempts}:${randomUUID()}`,
      requestId: currentContext()?.requestId ?? ctx.req.id,
    })
    await ctx.audit({
      target: { type: 'message_delivery', id: row.id },
      summary: {
        messageKey: row.message_key,
        channel: row.channel,
        record: `${row.record_type ?? ''}:${row.record_id ?? ''}`,
        previousError: row.error_code,
      },
    })
    return { body: { id: row.id, state: 'queued' } }
  },
}

/**
 * Messages sent by notify.release whose failed delivery has a Retry: the staff reply, and the routine reminders
 * (TSK-0121: automatic, scheduled; before it staff-released), each rechecked against its record at send time.
 */
const RETRYABLE_RELEASED: ReadonlySet<string> = new Set([
  STAFF_REPLY_MESSAGE_KEY,
  'reminder.unanswered_estimate',
  'reminder.unanswered_question',
  'reminder.appointment',
  // TSK-0091: the automatic unpaid-invoice reminder and the staff-released follow-up.
  'reminder.unpaid_invoice',
  'reminder.unpaid_invoice_follow_up',
])

/** The scheduling declaration of `notify.release` (its senders are the worker's own; scheduling needs none). */
const RELEASE_JOB = releaseAutomation({ email: null, sms: null })

type RetryRow = {
  id: string
  message_key: string
  channel: string
  recipient_kind: string
  recipient_id: string | null
  state: string
  attempts: number
  error_code: string | null
  provider_message_id: string | null
  record_type: string | null
  record_id: string | null
}

/** A failed staff reply (or question reminder), released again by a new `notify.release` job (TSK-0050, TSK-0051). */
async function retryReply(ctx: ApiContext, tx: Tx, row: RetryRow): Promise<ApiResult> {
  if (row.state !== 'failed' || row.provider_message_id !== null) throw new ApiError('CONFLICT')
  const issue = await tx
    .selectFrom('ops.queue_items')
    .select('id')
    .where('type', '=', 'delivery_failed')
    .where('subject_type', '=', 'message_delivery')
    .where('subject_id', '=', row.id)
    .where('resolved_at', 'is', null)
    .executeTakeFirst()
  if (!issue)
    throw new ApiError('CONFLICT', { fieldErrors: [{ field: 'state', code: 'NO_DELIVERY_ISSUE', message: '' }] })
  const runAt = await releaseTime(tx, await loadConfig(tx), row, new Date())
  await tx
    .updateTable('platform.message_deliveries')
    .set({
      state: 'queued',
      error_code: null,
      missing_variables: [],
      queued_at: sql<Date>`now()`,
      scheduled_at: runAt,
      updated_at: sql<Date>`now()`,
    })
    .where('id', '=', row.id)
    .execute()
  await scheduleJob(tx, RELEASE_JOB, {
    key: `${row.id}:retry:${row.attempts}:${randomUUID()}`,
    runAt,
    payload: { deliveryId: row.id },
    target: { type: 'message_delivery', id: row.id },
    requestId: currentContext()?.requestId ?? ctx.req.id,
  })
  await ctx.audit({
    target: { type: 'message_delivery', id: row.id },
    summary: {
      messageKey: row.message_key,
      channel: row.channel,
      record: `${row.record_type ?? ''}:${row.record_id ?? ''}`,
      previousError: row.error_code,
      sendAt: runAt.toISOString(),
    },
  })
  return { body: { id: row.id, state: 'queued' } }
}

export const NOTIFICATIONS_MODULE: ApiModule = {
  name: 'notifications',
  routes: [retryDelivery, ...MESSAGE_VIEW_ROUTES],
}
