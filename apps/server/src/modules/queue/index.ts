// Action queue module (TSK-0041; HH-OPS-01, HH-OPS-02, HH-STAFF-06, HH-ARC-10, RULE-SERVER-AUTHZ): the staff home's
// role-scoped queue and the Owner's Owner Decisions, read by staff with request.view (the queue's menu gate, TSK-0040).
// Which items a caller sees is decided per item type from the permission matrix, in the query (items.ts); a worker
// has no queue at all (their home is My Day).
import type { StaffActor } from '@handyhub/policy'
import { ApiError } from '../../api/errors.js'
import { pageSchema } from '../../api/pagination.js'
import { CLOCK_SCHEMA } from '../requests/clock-view.js'
import type { ApiContext, ApiModule, RouteDef } from '../../api/route.js'
import { listQueue, visibleSections, visibleTypes, type QueueFilters } from './items.js'
import { QUEUE_ACTIONS, QUEUE_BANDS, QUEUE_ITEM_TYPES, QUEUE_SECTIONS, type QueueSection } from './registry.js'

export { openQueueItem, resolveQueueItem, visibleSections, visibleTypes, listQueue } from './items.js'
export type { OpenQueueItemInput, QueueFilters, QueueItemView } from './items.js'
export {
  estimateToWriteQueueAutomation,
  newRequestQueueAutomation,
  queueAutomations,
  syncEstimateItem,
  syncNewRequestItem,
} from './providers.js'
export { QUEUE_ITEM_TYPES, queueItemType, type QueueItemType } from './registry.js'

/**
 * How often an open queue screen refreshes itself, in seconds. PROPOSED engineering default inside HH-ARC-10's
 * "30-60 seconds by default"; no owner decision sets it.
 */
export const QUEUE_REFRESH_SECONDS = 30

const TYPE_IDS = QUEUE_ITEM_TYPES.map((t) => t.id)
const UUID_PATTERN = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'

const ITEM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'type',
    'subjectType',
    'subjectId',
    'band',
    'reference',
    'status',
    'assignee',
    'openedAt',
    'dueAt',
    'clock',
    'responseClock',
    'reason',
    'masked',
    'action',
    'link',
    'version',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    type: { type: 'string', enum: TYPE_IDS },
    subjectType: { type: 'string' },
    subjectId: { type: 'string' },
    band: { type: 'string', enum: [...QUEUE_BANDS] },
    reference: { type: ['string', 'null'] },
    status: { type: ['string', 'null'] },
    assignee: {
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
    openedAt: { type: 'string', format: 'date-time' },
    dueAt: { type: ['string', 'null'], format: 'date-time' },
    clock: { type: ['string', 'null'], enum: ['response_target', null] },
    // TSK-0043: the first-response clock read now, in business minutes; labelled an internal target, never a promise.
    responseClock: { anyOf: [{ type: 'null' }, CLOCK_SCHEMA] },
    reason: { type: 'string' },
    masked: { type: 'boolean' },
    action: { type: 'string', enum: [...QUEUE_ACTIONS] },
    link: { type: 'string' },
    version: { type: 'integer' },
  },
} as const

const LIST_SCHEMA = (() => {
  const page = pageSchema(ITEM_SCHEMA) as {
    required: string[]
    properties: Record<string, unknown>
  } & Record<string, unknown>
  return {
    ...page,
    required: [...page.required, 'section', 'sections', 'types', 'refreshSeconds', 'refreshedAt'],
    properties: {
      ...page.properties,
      section: { type: 'string', enum: [...QUEUE_SECTIONS] },
      sections: { type: 'array', items: { type: 'string', enum: [...QUEUE_SECTIONS] } },
      types: { type: 'array', items: { type: 'string', enum: TYPE_IDS } },
      refreshSeconds: { type: 'integer' },
      refreshedAt: { type: 'string', format: 'date-time' },
    },
  }
})()

const QUERY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    type: { type: 'string', enum: TYPE_IDS },
    assignee: { type: 'string', anyOf: [{ enum: ['me', 'unassigned'] }, { pattern: UUID_PATTERN }] },
    reference: { type: 'string', pattern: '^[Hh][Hh]-[0-9A-Za-z]{0,8}$' },
  },
}

function listRoute(section: QueueSection): RouteDef {
  const owner = section === 'owner_decisions'
  return {
    method: 'GET',
    path: owner ? '/staff/queue/owner-decisions' : '/staff/queue',
    operationId: owner ? 'listOwnerDecisions' : 'listActionQueue',
    summary: owner ? 'Owner Decisions' : 'The staff action queue',
    description:
      (owner
        ? 'The Owner’s decisions waiting: deposit waivers, Start Work exceptions, refunds and cancellation outcomes, ' +
          'deletion requests, Overdue—owner decision invoices, damage, injury and dispute notifications. A caller ' +
          'without any of these grants is refused. '
        : 'Staff with request.view (a worker has My Day instead). ') +
      'Only the item types whose matrix action the caller holds are listed (own-record grants list only items ' +
      'assigned to the caller), filtered before ordering and paging. Ordered by urgency: safety, today’s ' +
      'appointment changes, overdue and other time-sensitive items, then by due time and age. Reasons that reveal ' +
      'restricted detail are replaced by a generic reason for roles that may not see it. No restricted field is ' +
      'stored on an item.',
    actors: ['staff'],
    permission: 'request.view',
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'none',
    pagination: true,
    test: 'test/integration/queue.test.ts',
    schema: { querystring: QUERY_SCHEMA, response: { 200: LIST_SCHEMA } },
    handler: async (ctx: ApiContext) => {
      const actor = ctx.actor as StaffActor
      const sections = visibleSections(actor)
      if (!sections.includes(section)) throw new ApiError('FORBIDDEN')
      const q = ctx.req.query as QueueFilters
      const filters: QueueFilters = {
        ...(q.type ? { type: q.type } : {}),
        ...(q.assignee ? { assignee: q.assignee.toLowerCase() } : {}),
        ...(q.reference ? { reference: q.reference } : {}),
      }
      const now = new Date()
      if (!ctx.page) throw new Error('paginated route without a page')
      const page = await listQueue(ctx.db, actor, section, filters, ctx.page, now)
      const v = visibleTypes(actor, section)
      const visible = TYPE_IDS.filter((id) => v.all.includes(id) || v.own.includes(id))
      return {
        body: {
          ...page,
          section,
          sections,
          types: visible,
          refreshSeconds: QUEUE_REFRESH_SECONDS,
          refreshedAt: now.toISOString(),
        },
      }
    },
  }
}

export const QUEUE_MODULE: ApiModule = {
  name: 'queue',
  routes: [listRoute('queue'), listRoute('owner_decisions')],
}
