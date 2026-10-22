// Staff route of the appointment reminders (TSK-0067, TSK-0121; HH-COM-11, HH-COM-05, HH-COM-14, S01, S06,
// OWN-DEC-153, OWN-DEC-107, RULE-SERVER-AUTHZ).
//   GET  /staff/visits/:visitId/reminders   the visit's reminders, the interval and the stop rule
// - TSK-0121 (OWN-DEC-153): the appointment reminder is automatic, 24 hours before; nobody releases or dismisses it,
//   so the release and dismiss routes of TSK-0067 are gone. Staff see it scheduled, sent, failed or cancelled with its
//   reason (a failed one is a delivery issue with Retry in the action queue). Listing needs schedule.view_board (the
//   board's visit panel shows it).
import { ApiError } from '../../api/errors.js'
import type { RouteDef } from '../../api/route.js'
import { APPOINTMENT_REMINDER_STOP_REASONS, appointmentRemindersView } from './reminders.js'
import { VISIT_PARAMS } from './schemas.js'

const TEST = 'test/integration/appointment-reminders.test.ts'
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
        dueAt: { type: 'string', format: 'date-time' },
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
          'release',
          'state',
          'channel',
          'reason',
          'scheduledAt',
          'sentAt',
          'cancelledAt',
          'cancelledBy',
        ],
        properties: {
          id: { type: 'string', format: 'uuid' },
          windowVersion: { type: ['integer', 'null'] },
          current: { type: 'boolean' },
          release: { type: 'string', enum: ['automatic', 'staff_released'] },
          state: {
            type: 'string',
            enum: ['draft', 'queued', 'sent', 'delivered', 'failed', 'suppressed', 'cancelled'],
          },
          channel: { type: 'string', enum: ['email', 'sms'] },
          reason: NULLABLE_STRING,
          scheduledAt: NULLABLE_DATE_TIME,
          sentAt: NULLABLE_DATE_TIME,
          cancelledAt: NULLABLE_DATE_TIME,
          cancelledBy: { anyOf: [{ type: 'null' }, { type: 'string', enum: ['system'] }, STAFF_REF] },
        },
      },
    },
  },
} as const

const visitProjectOf: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { visitId } = req.params as { visitId: string }
  const v = await db.selectFrom('work.visits').select('project_id').where('id', '=', visitId).executeTakeFirst()
  return v ? { projectId: v.project_id } : null
}

export function appointmentReminderRoutes(): RouteDef[] {
  const list: RouteDef = {
    method: 'GET',
    path: '/staff/visits/:visitId/reminders',
    operationId: 'listAppointmentReminders',
    summary: 'Reminders of a visit',
    description:
      'Staff with schedule.view_board (Owner, Office, Estimator). The automatic appointment reminders of one visit ' +
      '(HH-COM-11, OWN-DEC-153): the configured interval (reminders.cadences.appointment, 24 hours before the arrival ' +
      'window starts) and when the current window’s reminder is due, whether a stop rule applies now (canceled, ' +
      'rescheduled, under way, the window started), and each delivery: its window version and whether it is the ' +
      'current window’s, channel, state, when it is due or was sent, and the reason it was cancelled, suppressed, ' +
      'failed or waits (booked_within_interval: no 24-hour reminder for a visit booked less than 24 hours ahead). ' +
      'Staff-released drafts from before TSK-0121 are listed as history. The destination is not shown.',
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
      const view = await appointmentRemindersView(ctx.db, visitId)
      if (!view) throw new ApiError('NOT_FOUND')
      return { body: view }
    },
  }
  return [list]
}
