// Staff route of the unanswered-estimate reminder (TSK-0060, TSK-0121; HH-EST-14, HH-COM-05, HH-COM-14, S01,
// OWN-DEC-153, RULE-SERVER-AUTHZ).
//   GET  /staff/estimate-versions/:versionId/reminders   the version's reminder, the cadence and the stop rule
// - TSK-0121 (OWN-DEC-153): the reminder is automatic; nobody releases or dismisses it, so the release and dismiss
//   routes of TSK-0060 are gone. Staff see it scheduled, sent, failed or cancelled with its reason (a failed one is a
//   delivery issue with Retry in the action queue). Listing needs estimate.draft (Owner, Estimator), the estimate
//   screen's own permission.
import { ApiError } from '../../api/errors.js'
import type { RouteDef } from '../../api/route.js'
import { REMINDER_STOP_REASONS, remindersView } from './reminders.js'
import { versionProjectOf } from './routes.js'
import { VERSION_PARAMS } from './schemas.js'

const TEST = 'test/integration/estimate-reminders.test.ts'
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
        afterDeliveryHours: { type: 'number' },
        deliveredAt: NULLABLE_DATE_TIME,
        dueAt: NULLABLE_DATE_TIME,
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

export function reminderRoutes(): RouteDef[] {
  const list: RouteDef = {
    method: 'GET',
    path: '/staff/estimate-versions/:versionId/reminders',
    operationId: 'listEstimateReminders',
    summary: 'Reminder of an estimate version',
    description:
      'Staff with estimate.draft (Owner, Estimator). The automatic unanswered-estimate reminder of one version ' +
      '(HH-EST-14, OWN-DEC-153): the configured cadence (reminders.cadences: 3 days after the version was successfully ' +
      'delivered), when the version was first delivered and when its reminder is due, whether a stop rule applies now ' +
      '(accepted, declined, expired, withdrawn, superseded, a customer response, a customer message or question reply, ' +
      'a recorded conversation, the project no longer open), and each of its deliveries: channel, state, when it is ' +
      'due or was sent, and the reason it was cancelled, suppressed, failed or waits. Staff-released drafts from ' +
      'before TSK-0121 are listed as history. The destination is not shown.',
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
      const view = await remindersView(ctx.db, versionId)
      if (!view) throw new ApiError('NOT_FOUND')
      return { body: view }
    },
  }
  return [list]
}
