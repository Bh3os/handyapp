// Staff retry of a failed automatic message (TSK-0032; HH-INT-20, HH-COM-02, HH-OPS-01, HH-ARC-09, T12,
// RULE-SERVER-AUTHZ). The one action of a delivery_failed queue item.
// - Only a failed delivery of an automatic message that never reached the provider is queued again; the send runs as
//   a new job of the message's own automation (rerunJob), which rechecks the automatic list, the template, consent
//   and the record at send time and presents the same provider idempotency key. A retry therefore sends at most one
//   message, and a second press while it is queued, or after it was sent, is a CONFLICT.
// - PROPOSED permission: message.release_draft (retrying a message is releasing it again; ROLE-MATRIX "Reply from a
//   project, release drafts"). An Estimator retries only items assigned to them; a Worker never.
// - The queue item resolves when the send is handed over or suppressed, and stays open when it fails again.
import { sql } from 'kysely'
import { ApiError } from '../../api/errors.js'
import type { ApiModule, RouteDef } from '../../api/route.js'
import { loadConfig } from '../../platform/config/index.js'
import { rerunJob } from '../../platform/jobs.js'
import { currentContext } from '../../platform/request-context.js'
import { automaticPolicy } from './policy.js'

const DELIVERY_ID = {
  type: 'string',
  pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
} as const

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
    'suppressed), a staff-released draft or a message no longer on the automatic list is a CONFLICT. Staff with ' +
    'message.release_draft; an Estimator only for items assigned to them. The queue item resolves once the send is ' +
    'handed over.',
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
      .select('id')
      .where('id', '=', deliveryId)
      .executeTakeFirst()
    if (!delivery) return null
    // The record facts come from the delivery's open queue item: its project and its owner.
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
    if (
      row.release !== 'automatic' ||
      row.state !== 'failed' ||
      row.provider_message_id !== null ||
      row.outbox_event_id === null ||
      !automaticPolicy(await loadConfig(tx)).isAutomatic(row.message_key)
    )
      throw new ApiError('CONFLICT')
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
    await rerunJob(tx, {
      jobId: job.id,
      key: `retry:${row.attempts}`,
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
