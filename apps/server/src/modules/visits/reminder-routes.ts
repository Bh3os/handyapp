// Staff routes of the appointment reminders (TSK-0067; HH-COM-11, HH-COM-05, HH-COM-09, S01, S06, OWN-DEC-78,
// OWN-DEC-107, RULE-SERVER-AUTHZ).
//   GET  /staff/visits/:visitId/reminders                    the visit's reminder drafts, the interval and the stop rule
//   POST /staff/appointment-reminders/:deliveryId/release    release one draft: it sends inside the contact hours
//   POST /staff/appointment-reminders/:deliveryId/dismiss    dismiss one draft: cancelled, kept, never sent
// - Releasing rechecks, under the visit's lock, that the visit is still confirmed at the reminder's window and the
//   window has not started, that no reminder of it was already sent, that the address and preparation steps are the
//   ones the draft holds, and the channel permission. An outdated or duplicate reminder, or one the customer may no
//   longer be reached on, is cancelled with that reason and the release answers CONFLICT naming it; changed details
//   refresh the draft and answer CONFLICT (details_changed) so staff review it again. The send job checks again.
// - Release and dismiss need message.release_draft and visit.reschedule (PROPOSED: the Owner and Office, the roles that
//   manage booked visits). Listing needs schedule.view_board (the board's visit panel shows it).
import type { Db, Tx } from '@handyhub/db'
import { ApiError } from '../../api/errors.js'
import type { ApiContext, RouteDef } from '../../api/route.js'
import { loadConfig } from '../../platform/config/index.js'
import { currentContext } from '../../platform/request-context.js'
import { releaseAutomation, releaseDraft, sendPermission, type Channel } from '../notifications/index.js'
import {
  alreadyReminded,
  APPOINTMENT_REMINDER_MESSAGE_KEY,
  APPOINTMENT_REMINDER_STOP_REASONS,
  appointmentReminderStopReason,
  appointmentRemindersView,
  cancelAppointmentReminder,
  DISMISSED,
  mayReleaseAppointmentReminder,
  reminderContent,
  reminderDetailsCurrent,
  reminderValues,
  syncAppointmentReminderItem,
  windowVersionOf,
} from './reminders.js'
import { VISIT_PARAMS } from './schemas.js'

const TEST = 'test/integration/appointment-reminders.test.ts'
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
  required: ['visitId', 'visitState', 'cadence', 'stoppedBy', 'reminders'],
  properties: {
    visitId: { type: 'string', format: 'uuid' },
    visitState: { type: 'string' },
    cadence: {
      type: 'object',
      additionalProperties: false,
      required: ['state'],
      properties: {
        state: { type: 'string', enum: ['CONFIGURED', 'NOT_CONFIGURED'] },
        proposed: { type: 'boolean' },
        hoursBefore: { type: 'number' },
        contactHoursOnly: { type: 'boolean' },
        draftAt: { type: 'string', format: 'date-time' },
      },
    },
    stoppedBy: { type: ['string', 'null'], enum: [...APPOINTMENT_REMINDER_STOP_REASONS, null] },
    reminders: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'id',
          'windowVersion',
          'current',
          'state',
          'channel',
          'reason',
          'content',
          'draftedAt',
          'releasedAt',
          'releasedBy',
          'sendAt',
          'cancelledAt',
          'cancelledBy',
          'actions',
        ],
        properties: {
          id: { type: 'string', format: 'uuid' },
          windowVersion: { type: ['integer', 'null'] },
          current: { type: 'boolean' },
          state: {
            type: 'string',
            enum: ['draft', 'queued', 'sent', 'delivered', 'failed', 'suppressed', 'cancelled'],
          },
          channel: { type: 'string', enum: ['email', 'sms'] },
          reason: NULLABLE_STRING,
          content: {
            type: 'object',
            additionalProperties: false,
            required: ['visitWindow', 'serviceAddress', 'preparationSteps'],
            properties: {
              visitWindow: { type: 'string' },
              serviceAddress: { type: 'string' },
              preparationSteps: NULLABLE_STRING,
            },
          },
          draftedAt: { type: 'string', format: 'date-time' },
          releasedAt: NULLABLE_DATE_TIME,
          releasedBy: { anyOf: [{ type: 'null' }, STAFF_REF] },
          sendAt: NULLABLE_DATE_TIME,
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

const staffActor = (ctx: ApiContext) => {
  if (ctx.actor.kind !== 'staff') throw new ApiError('FORBIDDEN')
  return ctx.actor
}

/** An appointment reminder's delivery row and its visit; null for any other delivery. */
async function reminderOf(db: Db | Tx, deliveryId: string) {
  const d = await db
    .selectFrom('platform.message_deliveries')
    .select(['id', 'record_id'])
    .where('id', '=', deliveryId)
    .where('record_type', '=', 'visit')
    .where('message_key', '=', APPOINTMENT_REMINDER_MESSAGE_KEY)
    .executeTakeFirst()
  if (!d?.record_id || !new RegExp(UUID.pattern).test(d.record_id)) return null
  return (
    (await db
      .selectFrom('work.visits')
      .select(['id', 'project_id'])
      .where('id', '=', d.record_id)
      .executeTakeFirst()) ?? null
  )
}

const reminderResource: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { deliveryId } = req.params as { deliveryId: string }
  const v = await reminderOf(db, deliveryId)
  return v ? { projectId: v.project_id } : null
}

const visitProjectOf: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { visitId } = req.params as { visitId: string }
  const v = await db.selectFrom('work.visits').select('project_id').where('id', '=', visitId).executeTakeFirst()
  return v ? { projectId: v.project_id } : null
}

const field = (f: string, code: string) => ({ field: f, code, message: '' })

/** Locks the reminder's visit, then its delivery (the order of every visit change); NOT_FOUND for anything else. */
async function lockReminder(tx: Tx, deliveryId: string) {
  const head = await reminderOf(tx, deliveryId)
  if (!head) throw new ApiError('NOT_FOUND')
  await tx.selectFrom('work.visits').select('id').where('id', '=', head.id).forUpdate().execute()
  const row = await tx
    .selectFrom('platform.message_deliveries')
    .select(['id', 'state', 'channel', 'destination', 'subject_key', 'variables'])
    .where('id', '=', deliveryId)
    .forUpdate()
    .executeTakeFirstOrThrow()
  return { ...row, visitId: head.id, projectId: head.project_id }
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

export function appointmentReminderRoutes(): RouteDef[] {
  // The send job's declaration (its name and retry budget); the worker runs the registered one (automations.ts).
  const release = releaseAutomation({ email: null, sms: null })

  const list: RouteDef = {
    method: 'GET',
    path: '/staff/visits/:visitId/reminders',
    operationId: 'listAppointmentReminders',
    summary: 'Reminders of a visit',
    description:
      'Staff with schedule.view_board (Owner, Office, Estimator). The appointment reminders of one visit ' +
      '(HH-COM-11): the configured interval (reminders.cadences.appointment, before the arrival window starts) and ' +
      'when the current window’s draft is due, whether a stop rule applies now (canceled, rescheduled, under way, ' +
      'the window started), and every reminder drafted: its window version, its content (date and arrival window, ' +
      'address, preparation steps), state, channel, the reason it stopped or was not sent, who released or ' +
      'dismissed it, when a released one sends, and whether the caller may release or dismiss it now. The ' +
      'destination is not shown.',
    actors: ['staff'],
    permission: 'schedule.view_board',
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'none',
    pagination: false,
    test: TEST,
    resource: visitProjectOf,
    schema: { params: VISIT_PARAMS, response: { 200: REMINDERS_VIEW } },
    handler: async (ctx) => {
      const { visitId } = ctx.req.params as { visitId: string }
      const view = await appointmentRemindersView(ctx.db, staffActor(ctx), visitId)
      if (!view) throw new ApiError('NOT_FOUND')
      return { body: view }
    },
  }

  const releaseRoute: RouteDef = {
    ...common,
    method: 'POST',
    path: '/staff/appointment-reminders/:deliveryId/release',
    operationId: 'releaseAppointmentReminder',
    summary: 'Send an appointment reminder draft',
    description:
      'Staff with message.release_draft and visit.reschedule (Owner, Office). Releases one appointment reminder ' +
      'draft; it sends inside the daily contact hours (released outside them it waits for the next opening, ' +
      'HH-COM-09), through a send job that checks the visit, consent and the template again. Before releasing, under ' +
      'the visit lock: the visit must still be confirmed at the reminder’s window, before the window starts, with no ' +
      'reminder of it already sent, and the channel permitted. When one fails the draft is cancelled with that ' +
      'reason, kept, and the answer is CONFLICT naming it (fieldErrors[].field "reminder", code the reason). Changed ' +
      'address or preparation steps refresh the draft and answer CONFLICT (details_changed) for staff to review. A ' +
      'reminder that is not a draft is a CONFLICT (REMINDER_NOT_DRAFT). Returns the visit’s reminders.',
    audit: 'appointment_reminder.release',
    schema: { params: DELIVERY_PARAMS, body: EMPTY_BODY, response: { 200: REMINDERS_VIEW } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staffActor(ctx)
      const { deliveryId } = ctx.req.params as { deliveryId: string }
      const row = await lockReminder(tx, deliveryId)
      if (!mayReleaseAppointmentReminder(actor, row.projectId)) throw new ApiError('FORBIDDEN')
      if (row.state !== 'draft')
        throw new ApiError('CONFLICT', { fieldErrors: [field('reminder', 'REMINDER_NOT_DRAFT')] })
      const requestId = currentContext()?.requestId ?? ctx.req.id
      const wv = windowVersionOf(row.subject_key)
      const stop =
        (wv === null ? 'visit_rescheduled' : await appointmentReminderStopReason(tx, row.visitId, wv, new Date())) ??
        ((await alreadyReminded(tx, row.subject_key, row.id)) ? 'already_reminded' : null)
      const permission = stop
        ? null
        : await sendPermission(tx, {
            channel: row.channel as Channel,
            destination: row.destination,
            audience: 'customer',
            messageKey: APPOINTMENT_REMINDER_MESSAGE_KEY,
          })
      const refusedBy = stop ?? (permission && !permission.allowed ? permission.reason : null)
      if (refusedBy) {
        // Kept as cancelled with its reason; the refusal is answered after the transaction commits.
        await cancelAppointmentReminder(tx, row, refusedBy, { kind: 'system' }, requestId)
        await syncAppointmentReminderItem(tx, row.visitId, 'stopped')
        await ctx.audit({
          target: { type: 'message_delivery', id: row.id },
          summary: { messageKey: APPOINTMENT_REMINDER_MESSAGE_KEY, channel: row.channel, refusedBy },
          result: 'denied',
        })
        return { body: null, refusal: new ApiError('CONFLICT', { fieldErrors: [field('reminder', refusedBy)] }) }
      }
      // The address or the preparation steps changed since the draft: it now holds the current ones, for staff to
      // review before they send it.
      const content = await reminderContent(tx, row.visitId)
      if (content && !reminderDetailsCurrent(row.variables, content)) {
        const stored = (row.variables ?? {}) as Record<string, string>
        const values: Record<string, string> = { ...reminderValues(content) }
        if (typeof stored['projectLink'] === 'string') values['projectLink'] = stored['projectLink']
        await tx
          .updateTable('platform.message_deliveries')
          .set({ variables: JSON.stringify(values), updated_at: new Date() })
          .where('id', '=', row.id)
          .where('state', '=', 'draft')
          .execute()
        await ctx.audit({
          target: { type: 'message_delivery', id: row.id },
          summary: { messageKey: APPOINTMENT_REMINDER_MESSAGE_KEY, channel: row.channel, refusedBy: 'details_changed' },
          result: 'denied',
        })
        return {
          body: null,
          refusal: new ApiError('CONFLICT', { fieldErrors: [field('reminder', 'details_changed')] }),
        }
      }
      const { runAt } = await releaseDraft(tx, {
        config: await loadConfig(tx),
        deliveryId: row.id,
        actor: { kind: 'staff', id: actor.userId, roles: actor.roles },
        automation: release,
        requestId,
      })
      await syncAppointmentReminderItem(tx, row.visitId, 'released')
      await ctx.audit({
        target: { type: 'message_delivery', id: row.id },
        summary: { messageKey: APPOINTMENT_REMINDER_MESSAGE_KEY, channel: row.channel, sendAt: runAt.toISOString() },
      })
      return { body: await appointmentRemindersView(tx, actor, row.visitId) }
    },
  }

  const dismiss: RouteDef = {
    ...common,
    method: 'POST',
    path: '/staff/appointment-reminders/:deliveryId/dismiss',
    operationId: 'dismissAppointmentReminder',
    summary: 'Dismiss an appointment reminder draft',
    description:
      'Staff with message.release_draft and visit.reschedule (Owner, Office). Dismisses one appointment reminder ' +
      'draft: it is cancelled as dismissed, kept with who dismissed it, and never sent (PROPOSED). A rescheduled ' +
      'visit still gets a reminder for its new window. A reminder that is not a draft is a CONFLICT ' +
      '(REMINDER_NOT_DRAFT). Returns the visit’s reminders.',
    audit: 'appointment_reminder.dismiss',
    schema: { params: DELIVERY_PARAMS, body: EMPTY_BODY, response: { 200: REMINDERS_VIEW } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staffActor(ctx)
      const { deliveryId } = ctx.req.params as { deliveryId: string }
      const row = await lockReminder(tx, deliveryId)
      if (!mayReleaseAppointmentReminder(actor, row.projectId)) throw new ApiError('FORBIDDEN')
      if (row.state !== 'draft')
        throw new ApiError('CONFLICT', { fieldErrors: [field('reminder', 'REMINDER_NOT_DRAFT')] })
      const requestId = currentContext()?.requestId ?? ctx.req.id
      await cancelAppointmentReminder(
        tx,
        row,
        DISMISSED,
        { kind: 'staff', id: actor.userId, roles: actor.roles },
        requestId,
        { audit: false },
      )
      await syncAppointmentReminderItem(tx, row.visitId, 'dismissed')
      await ctx.audit({
        target: { type: 'message_delivery', id: row.id },
        summary: { messageKey: APPOINTMENT_REMINDER_MESSAGE_KEY, channel: row.channel, visit: row.visitId },
      })
      return { body: await appointmentRemindersView(tx, actor, row.visitId) }
    },
  }

  return [list, releaseRoute, dismiss]
}
