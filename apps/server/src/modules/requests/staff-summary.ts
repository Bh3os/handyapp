// The request record header for staff (TSK-0041; HH-OPS-02 "a deep link to the record", HH-STAFF-04). The action
// queue's deep link opens the request's record; this is the part of it that exists before the full original-request
// view (TSK-0042): reference, status, submission time, the services asked for and the responsible staff member. No
// contact, address, description or answer is returned here, so nothing beyond the queue item's own fields is shown.
import { ApiError } from '../../api/errors.js'
import type { RouteDef } from '../../api/route.js'
import { projectInScope } from '../../platform/data-scope.js'

const UUID = {
  type: 'string',
  pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
}

export const staffRequestSummary: RouteDef = {
  method: 'GET',
  path: '/staff/requests/:requestId/summary',
  operationId: 'getStaffRequestSummary',
  summary: 'A request’s record header',
  description:
    'Staff with request.view (not workers). The request’s reference, status, submission time, service codes and ' +
    'responsible staff member; an unknown request answers NOT_FOUND. No contact or property detail.',
  actors: ['staff'],
  permission: 'request.view',
  kind: 'read',
  idempotency: 'none',
  expectedVersion: 'none',
  rateLimit: 'none',
  audit: 'none',
  pagination: false,
  test: 'test/integration/queue.test.ts',
  resource: async ({ req, db }) => {
    const { requestId } = req.params as { requestId: string }
    const r = await db.selectFrom('intake.requests').select('project_id').where('id', '=', requestId).executeTakeFirst()
    return r ? { projectId: r.project_id } : null
  },
  schema: {
    params: { type: 'object', additionalProperties: false, required: ['requestId'], properties: { requestId: UUID } },
    response: {
      200: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'reference', 'state', 'submittedAt', 'services', 'responsibleStaff'],
        properties: {
          id: { type: 'string' },
          reference: { type: 'string' },
          state: { type: 'string' },
          submittedAt: { type: 'string', format: 'date-time' },
          services: { type: 'array', items: { type: 'string' } },
          responsibleStaff: {
            anyOf: [
              { type: 'null' },
              {
                type: 'object',
                additionalProperties: false,
                required: ['id', 'name'],
                properties: { id: { type: 'string' }, name: { type: ['string', 'null'] } },
              },
            ],
          },
        },
      },
    },
  },
  handler: async (ctx) => {
    const { requestId } = ctx.req.params as { requestId: string }
    const r = await ctx.db
      .selectFrom('intake.requests')
      .select(['id', 'reference', 'state', 'submitted_at', 'responsible_staff_id'])
      .where('id', '=', requestId)
      // Scoped read (TSK-0037): a request outside the caller's scope is not found.
      .where(projectInScope('project_id', ctx.scope))
      .executeTakeFirst()
    if (!r) throw new ApiError('NOT_FOUND')
    const services = await ctx.db
      .selectFrom('intake.request_services as rs')
      .innerJoin('catalog.services as s', 's.id', 'rs.service_id')
      .select('s.code')
      .where('rs.request_id', '=', requestId)
      .orderBy('rs.position')
      .execute()
    const staffId = r.responsible_staff_id
    const staff = staffId
      ? await ctx.db
          .selectFrom('identity.staff_users')
          .select(['id', 'display_name'])
          .where('id', '=', staffId)
          .executeTakeFirst()
      : undefined
    return {
      body: {
        id: r.id,
        reference: r.reference,
        state: r.state,
        submittedAt: r.submitted_at.toISOString(),
        services: services.map((s) => s.code),
        responsibleStaff: staff ? { id: staff.id, name: staff.display_name } : null,
      },
    }
  },
}
