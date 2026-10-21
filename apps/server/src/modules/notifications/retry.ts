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
import { randomUUID } from 'node:crypto'
import { sql } from 'kysely'
import { ApiError } from '../../api/errors.js'
import type { ApiModule, RouteDef } from '../../api/route.js'
import { loadConfig } from '../../platform/config/index.js'
import { rerunJob } from '../../platform/jobs.js'
import { currentContext } from '../../platform/request-context.js'
import { isOutcomeUnknown } from './deliveries.js'
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
    'idempotency key, so a retry sends at most one message. A delivery that is not failed (queued, sent, ' +
    'suppressed), a staff-released draft, a message no longer on the automatic list or a delivery without an open ' +
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
      ])
      .where('id', '=', deliveryId)
      .forUpdate()
      .executeTakeFirst()
    if (!row) throw new ApiError('NOT_FOUND')
    // The provider may already have sent it: reconciled against the provider's record, never sent again blindly.
    if (row.state === 'failed' && isOutcomeUnknown(row.error_code))
      throw new ApiError('CONFLICT', { fieldErrors: [{ field: 'state', code: 'OUTCOME_UNKNOWN', message: '' }] })
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
      .set({ state: 'queued', error_code: null, queued_at: sql<Date>`now()`, updated_at: sql<Date>`now()` })
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

export const NOTIFICATIONS_MODULE: ApiModule = { name: 'notifications', routes: [retryDelivery] }
