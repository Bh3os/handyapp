// Staff routes of the unanswered-estimate reminders (TSK-0060; HH-EST-14, HH-COM-05, HH-COM-09, S01, OWN-DEC-78,
// OWN-DEC-132, RULE-SERVER-AUTHZ).
//   GET  /staff/estimate-versions/:versionId/reminders   the version's reminder drafts, the cadence and the stop rule
//   POST /staff/estimate-reminders/:deliveryId/release   release one draft: it sends at once (any hour)
//   POST /staff/estimate-reminders/:deliveryId/dismiss   dismiss one draft: cancelled, kept, never sent
// - Releasing rechecks the stop rules and the channel permission under the estimate's lock: a reminder whose estimate
//   was answered, accepted, declined, expired, withdrawn or superseded, or whose channel the customer may no longer be
//   reached on, is cancelled with that reason and the release answers CONFLICT naming it. The send job checks again.
// - Release and dismiss need message.release_draft (ROLE-MATRIX "Reply from a project, release drafts"); an Estimator
//   only for an estimate they prepared (their estimating thread, PROPOSED mapping). The screen is the estimate's, so
//   listing needs estimate.draft (Owner, Estimator); Office releases from the unified inbox once it exists (TSK-0050).
import type { Db, Tx } from '@handyhub/db'
import { ApiError } from '../../api/errors.js'
import type { RouteDef } from '../../api/route.js'
import { loadConfig } from '../../platform/config/index.js'
import { currentContext } from '../../platform/request-context.js'
import { releaseAutomation, releaseDraft, sendPermission, type Channel } from '../notifications/index.js'
import {
  cancelReminderDraft,
  DISMISSED,
  ESTIMATE_REMINDER_MESSAGE_KEY,
  REMINDER_STEPS,
  REMINDER_STOP_REASONS,
  reminderStopReason,
  remindersView,
  syncReminderItem,
} from './reminders.js'
import { isUuid } from './model.js'
import { staffActor, versionProjectOf } from './routes.js'
import { VERSION_PARAMS } from './schemas.js'

const TEST = 'test/integration/estimate-reminders.test.ts'
const UUID = { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' } as const
const DELIVERY_PARAMS = {
  type: 'object',
  additionalProperties: false,
  required: ['deliveryId'],
  properties: { deliveryId: UUID },
} as const
const EMPTY_BODY = { type: 'object', additionalProperties: false, properties: {} } as const
const NULLABLE_STRING = { type: ['string', 'null'] } as const
const NULLABLE_DATE_TIME = { type: ['string', 'null'], format: 'date-time' } as const
const STAFF_REF = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'name'],
  properties: { id: { type: 'string' }, name: NULLABLE_STRING },
} as const

const REMINDERS_VIEW = {
  type: 'object',
  additionalProperties: false,
  required: ['versionId', 'cadence', 'stoppedBy', 'reminders'],
  properties: {
    versionId: { type: 'string', format: 'uuid' },
    cadence: {
      type: 'object',
      additionalProperties: false,
      required: ['state'],
      properties: {
        state: { type: 'string', enum: ['CONFIGURED', 'NOT_CONFIGURED'] },
        proposed: { type: 'boolean' },
        firstHours: { type: 'number' },
        finalHours: { type: 'number' },
        firstAt: NULLABLE_DATE_TIME,
        finalAt: NULLABLE_DATE_TIME,
      },
    },
    stoppedBy: { type: ['string', 'null'], enum: [...REMINDER_STOP_REASONS, null] },
    reminders: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'id',
          'step',
          'state',
          'channel',
          'reason',
          'draftedAt',
          'releasedAt',
          'releasedBy',
          'cancelledAt',
          'cancelledBy',
          'actions',
        ],
        properties: {
          id: { type: 'string', format: 'uuid' },
          step: { type: 'string', enum: [...REMINDER_STEPS] },
          state: {
            type: 'string',
            enum: ['draft', 'queued', 'sent', 'delivered', 'failed', 'suppressed', 'cancelled'],
          },
          channel: { type: 'string', enum: ['email', 'sms'] },
          reason: NULLABLE_STRING,
          draftedAt: { type: 'string', format: 'date-time' },
          releasedAt: NULLABLE_DATE_TIME,
          releasedBy: { anyOf: [{ type: 'null' }, STAFF_REF] },
          cancelledAt: NULLABLE_DATE_TIME,
          cancelledBy: { anyOf: [{ type: 'null' }, { type: 'string', enum: ['system'] }, STAFF_REF] },
          actions: {
            type: 'object',
            additionalProperties: false,
            required: ['release', 'dismiss'],
            properties: { release: { type: 'boolean' }, dismiss: { type: 'boolean' } },
          },
        },
      },
    },
  },
} as const

/** An estimate reminder's delivery row and its version; null for any other delivery. */
async function reminderOf(db: Db | Tx, deliveryId: string) {
  const d = await db
    .selectFrom('platform.message_deliveries')
    .select(['id', 'record_id'])
    .where('id', '=', deliveryId)
    .where('record_type', '=', 'estimate_version')
    .where('message_key', '=', ESTIMATE_REMINDER_MESSAGE_KEY)
    .executeTakeFirst()
  if (!d?.record_id || !isUuid(d.record_id)) return null
  return (
    (await db
      .selectFrom('estimating.estimate_versions')
      .select(['id', 'estimate_id', 'project_id', 'prepared_by'])
      .where('id', '=', d.record_id)
      .executeTakeFirst()) ?? null
  )
}

/** The delivery's version, project and preparer, as they are now (the Estimator's own-record check). */
const reminderResource: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { deliveryId } = req.params as { deliveryId: string }
  const v = await reminderOf(db, deliveryId)
  return v ? { projectId: v.project_id, ownerStaffId: v.prepared_by } : null
}

const field = (f: string, code: string) => ({ field: f, code, message: '' })

/** Locks the reminder's estimate, version and delivery (the lifecycle's lock order); NOT_FOUND for anything else. */
async function lockReminder(tx: Tx, deliveryId: string) {
  const head = await reminderOf(tx, deliveryId)
  if (!head) throw new ApiError('NOT_FOUND')
  await tx.selectFrom('estimating.estimates').select('id').where('id', '=', head.estimate_id).forUpdate().execute()
  await tx.selectFrom('estimating.estimate_versions').select('id').where('id', '=', head.id).forUpdate().execute()
  const row = await tx
    .selectFrom('platform.message_deliveries')
    .select(['id', 'state', 'channel', 'destination', 'subject_key'])
    .where('id', '=', deliveryId)
    .forUpdate()
    .executeTakeFirstOrThrow()
  return { ...row, versionId: head.id }
}

const common = {
  actors: ['staff'],
  kind: 'write',
  idempotency: 'required',
  expectedVersion: 'none',
  rateLimit: 'none',
  pagination: false,
  test: TEST,
  permission: 'message.release_draft',
  resource: reminderResource,
} as const

export function reminderRoutes(): RouteDef[] {
  // The send job's declaration (its name and retry budget); the worker runs the registered one (automations.ts).
  const release = releaseAutomation({ email: null, sms: null })

  const list: RouteDef = {
    method: 'GET',
    path: '/staff/estimate-versions/:versionId/reminders',
    operationId: 'listEstimateReminders',
    summary: 'Reminders of an estimate version',
    description:
      'Staff with estimate.draft (Owner, Estimator). The unanswered-estimate reminders of one version (HH-EST-14): ' +
      'the configured cadence (reminders.cadences, measured from publishing) and the due times of the first and the ' +
      'final draft, whether a stop rule applies now (accepted, declined, expired, withdrawn, superseded, a customer ' +
      'response, a recorded conversation, the project no longer open), and every reminder drafted: step, state, ' +
      'channel, the reason it stopped or was not sent, who released or dismissed it, and whether the caller may ' +
      'release or dismiss it now. The destination is not shown.',
    actors: ['staff'],
    permission: 'estimate.draft',
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'none',
    pagination: false,
    test: TEST,
    resource: versionProjectOf,
    schema: { params: VERSION_PARAMS, response: { 200: REMINDERS_VIEW } },
    handler: async (ctx) => {
      const { versionId } = ctx.req.params as { versionId: string }
      const view = await remindersView(ctx.db, staffActor(ctx), versionId)
      if (!view) throw new ApiError('NOT_FOUND')
      return { body: view }
    },
  }

  const releaseRoute: RouteDef = {
    ...common,
    method: 'POST',
    path: '/staff/estimate-reminders/:deliveryId/release',
    operationId: 'releaseEstimateReminder',
    summary: 'Send an estimate reminder draft',
    description:
      'Staff with message.release_draft (Owner, Office; an Estimator for an estimate they prepared). Releases one ' +
      'unanswered-estimate reminder draft; it sends at once, at any hour (OWN-DEC-132), through a send job that ' +
      'checks the estimate, consent and the template again. Before releasing, under the estimate lock, the stop ' +
      'rules and the channel permission are checked: when one applies the draft is cancelled with that reason, kept, ' +
      'and the answer is CONFLICT naming it (fieldErrors[].field "reminder", code the reason). A reminder that is not ' +
      'a draft is a CONFLICT (REMINDER_NOT_DRAFT). Returns the version’s reminders.',
    audit: 'estimate_reminder.release',
    schema: { params: DELIVERY_PARAMS, body: EMPTY_BODY, response: { 200: REMINDERS_VIEW } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staffActor(ctx)
      const { deliveryId } = ctx.req.params as { deliveryId: string }
      const row = await lockReminder(tx, deliveryId)
      if (row.state !== 'draft')
        throw new ApiError('CONFLICT', { fieldErrors: [field('reminder', 'REMINDER_NOT_DRAFT')] })
      const now = new Date()
      const requestId = currentContext()?.requestId ?? ctx.req.id
      const by = { kind: 'staff' as const, id: actor.userId, roles: actor.roles }
      const stop = await reminderStopReason(tx, row.versionId, now)
      const permission = stop
        ? null
        : await sendPermission(tx, {
            channel: row.channel as Channel,
            destination: row.destination,
            audience: 'customer',
            messageKey: ESTIMATE_REMINDER_MESSAGE_KEY,
          })
      const refusedBy = stop ?? (permission && !permission.allowed ? permission.reason : null)
      if (refusedBy) {
        // Kept as cancelled with its reason; the refusal is answered after the transaction commits.
        await cancelReminderDraft(tx, row, refusedBy, { kind: 'system' }, requestId)
        await syncReminderItem(tx, row.versionId, 'stopped')
        await ctx.audit({
          target: { type: 'message_delivery', id: row.id },
          summary: { messageKey: ESTIMATE_REMINDER_MESSAGE_KEY, channel: row.channel, refusedBy },
          result: 'denied',
        })
        return {
          body: null,
          refusal: new ApiError('CONFLICT', { fieldErrors: [field('reminder', refusedBy)] }),
        }
      }
      await releaseDraft(tx, {
        config: await loadConfig(tx),
        deliveryId: row.id,
        actor: by,
        automation: release,
        requestId,
      })
      await syncReminderItem(tx, row.versionId, 'released')
      await ctx.audit({
        target: { type: 'message_delivery', id: row.id },
        summary: { messageKey: ESTIMATE_REMINDER_MESSAGE_KEY, channel: row.channel },
      })
      return { body: await remindersView(tx, actor, row.versionId) }
    },
  }

  const dismiss: RouteDef = {
    ...common,
    method: 'POST',
    path: '/staff/estimate-reminders/:deliveryId/dismiss',
    operationId: 'dismissEstimateReminder',
    summary: 'Dismiss an estimate reminder draft',
    description:
      'Staff with message.release_draft (Owner, Office; an Estimator for an estimate they prepared). Dismisses one ' +
      'unanswered-estimate reminder draft: it is cancelled as dismissed, kept with who dismissed it, and never sent. ' +
      'The next reminder of the cadence is still drafted at its time (PROPOSED). A reminder that is not a draft is a ' +
      'CONFLICT (REMINDER_NOT_DRAFT). Returns the version’s reminders.',
    audit: 'estimate_reminder.dismiss',
    schema: { params: DELIVERY_PARAMS, body: EMPTY_BODY, response: { 200: REMINDERS_VIEW } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staffActor(ctx)
      const { deliveryId } = ctx.req.params as { deliveryId: string }
      const row = await lockReminder(tx, deliveryId)
      if (row.state !== 'draft')
        throw new ApiError('CONFLICT', { fieldErrors: [field('reminder', 'REMINDER_NOT_DRAFT')] })
      const requestId = currentContext()?.requestId ?? ctx.req.id
      await cancelReminderDraft(
        tx,
        row,
        DISMISSED,
        { kind: 'staff', id: actor.userId, roles: actor.roles },
        requestId,
        {
          audit: false,
        },
      )
      await syncReminderItem(tx, row.versionId, 'dismissed')
      await ctx.audit({
        target: { type: 'message_delivery', id: row.id },
        summary: { messageKey: ESTIMATE_REMINDER_MESSAGE_KEY, channel: row.channel, version: row.versionId },
      })
      return { body: await remindersView(tx, actor, row.versionId) }
    },
  }

  return [list, releaseRoute, dismiss]
}
