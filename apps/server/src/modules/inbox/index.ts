// Inbox module (TSK-0049; HH-COM-07, HH-COM-10, HH-COM-01, T21, T24, T68, T71, T74, OWN-DEC-120, RULE-SERVER-AUTHZ):
// the staff unified inbox. Customer conversations per project (inbound email and texts, with the project's customer
// notifications as metadata) and, kept apart, the project's internal conversation; the private Needs Linking list and
// the linking correction; and the truthful channel states ("Inbound not configured" while a webhook secret is unset).
// - Conversations and threads: message.reply inside the caller's scope (Owner, Office; an Estimator's own threads are
//   not recorded yet, so their scope reaches none; a Worker has no inbox).
// - Needs Linking, a single inbound message and linking: message.view_unmatched / message.link (Owner, Office only).
//   Other roles are refused, and a Needs Linking message is in no project, so no project-scoped route reaches it.
// - No route answers a customer: messages have no customer projection yet (records/projections; TSK-0050 adds the
//   portal Messages tab), and internal messages never will.
import { looksLikeCardNumber } from '@handyhub/domain'
import { listingScope, type StaffActor } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError } from '../../api/errors.js'
import { pageSchema, toPage } from '../../api/pagination.js'
import type { ApiContext, ApiModule, RouteDef } from '../../api/route.js'
import { projectInScope } from '../../platform/data-scope.js'
import type { ProviderSettings } from '../../providers/settings.js'
import {
  applyLink,
  ensureConversation,
  openNeedsLinking,
  resolveCustomerReplied,
  resolveNeedsLinking,
  touchConversation,
} from './conversations.js'
import { SUPPORTED_INBOUND } from './intake.js'
import { contactOf } from './matching.js'
import {
  CONVERSATION,
  CONVERSATION_ITEM,
  CONVERSATION_PARAMS,
  CREATED,
  HANDLED_BODY,
  HANDLED_RESULT,
  INTERNAL_BODY,
  LINK_BODY,
  LINK_RESULT,
  MESSAGE_DETAIL,
  MESSAGE_PARAMS,
  NEEDS_LINKING_ITEM,
  PROJECT_PARAMS,
  STATUS,
} from './schemas.js'

export { inboxIntakeAutomation, INBOX_INTAKE, SUPPORTED_INBOUND, type IntakeDeps } from './intake.js'
export { CLOSED_PROJECT_STATES, matchInbound, type MatchInput, type MatchResult } from './matching.js'
export {
  newReplyToken,
  projectReplyToken,
  replyAddress,
  replyTokensIn,
  REPLY_TOKEN,
  type InboundAddress,
} from './threading.js'

const TEST = 'test/integration/inbox.test.ts'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Characters of a message shown in a list (PROPOSED). */
export const PREVIEW_LENGTH = 140
/** Candidate projects listed for a Needs Linking message (PROPOSED). */
export const CANDIDATE_LIMIT = 10

export type InboxDeps = {
  /** This process's provider settings; unset: the channel states are reported as unknown, never as configured. */
  providers?: ProviderSettings | null
}

const conflict = (code: string) => new ApiError('CONFLICT', { fieldErrors: [{ field: 'state', code, message: '' }] })
const invalid = (field: string, code = 'invalid') =>
  new ApiError('VALIDATION_FAILED', { fieldErrors: [{ field, code, message: '' }] })
const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null)
const preview = (body: string | null) =>
  body === null ? null : body.replace(/\s+/g, ' ').trim().slice(0, PREVIEW_LENGTH) || null

function staffActor(ctx: ApiContext): StaffActor {
  if (ctx.actor.kind !== 'staff') throw new ApiError('FORBIDDEN')
  return ctx.actor
}
const mayViewUnmatched = (ctx: ApiContext) =>
  ctx.actor.kind === 'staff' &&
  listingScope(ctx.actor.roles, ctx.actor.capabilities, 'message.view_unmatched') === 'all'

function read(
  def: Omit<RouteDef, 'actors' | 'kind' | 'idempotency' | 'expectedVersion' | 'rateLimit' | 'audit' | 'test'>,
): RouteDef {
  return {
    ...def,
    actors: ['staff'],
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'none',
    test: TEST,
  }
}

const conversationResource: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { conversationId } = req.params as { conversationId: string }
  if (!UUID_RE.test(conversationId)) return null
  const row = await db
    .selectFrom('comms.conversations')
    .select('project_id')
    .where('id', '=', conversationId)
    .where('audience', '=', 'customer')
    .executeTakeFirst()
  return row ? { projectId: row.project_id } : null
}
const projectResource: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { projectId } = req.params as { projectId: string }
  if (!UUID_RE.test(projectId)) return null
  const row = await db.selectFrom('crm.projects').select('id').where('id', '=', projectId).executeTakeFirst()
  return row ? { projectId: row.id } : null
}
const messageResource: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { messageId } = req.params as { messageId: string }
  if (!UUID_RE.test(messageId)) return null
  const row = await db
    .selectFrom('comms.messages')
    .select('id')
    .where('id', '=', messageId)
    .where('direction', '=', 'inbound')
    .executeTakeFirst()
  return row ? {} : null
}

function statusRoute(deps: InboxDeps): RouteDef {
  return read({
    method: 'GET',
    path: '/staff/inbox/status',
    operationId: 'getInboxStatus',
    summary: 'Inbox channel states',
    description:
      'Staff with message.reply. Whether each inbound channel is configured (Bird texts, Resend email: their webhook ' +
      'signing secrets), whether email bodies can be read and whether reply tokens are configured, by state only: ' +
      'never a secret, an address or a value. While a secret is unset the channel is "Inbound not configured" and ' +
      'nothing is shown as received. Also the count of inbound events on unsupported channels, and, for holders of ' +
      'message.view_unmatched only, how many messages wait in Needs Linking.',
    permission: 'message.reply',
    pagination: false,
    resource: async ({ actor }) => (actor.kind === 'staff' ? { ownerStaffId: actor.userId } : {}),
    schema: { response: { 200: STATUS } },
    handler: async (ctx) => {
      const p = deps.providers
      const known = (v: boolean) => (p ? (v ? 'configured' : 'not_configured') : 'unknown')
      const reader = !p
        ? 'unknown'
        : p.email.adapter === 'resend'
          ? 'configured'
          : p.email.adapter === 'fake'
            ? 'fake'
            : 'not_configured'
      const supported = Object.values(SUPPORTED_INBOUND).flat() as string[]
      const unsupported = await ctx.db
        .selectFrom('platform.webhook_receipts')
        .select([({ fn }) => fn.countAll<string>().as('n'), ({ fn }) => fn.max('received_at').as('latest')])
        .where('event_type', 'like', '%.received')
        .where('event_type', 'not in', supported)
        .executeTakeFirst()
      let needsLinking: number | null = null
      if (mayViewUnmatched(ctx)) {
        const row = await ctx.db
          .selectFrom('comms.messages')
          .select(({ fn }) => fn.countAll<string>().as('n'))
          .where('link_state', '=', 'needs_linking')
          .executeTakeFirst()
        needsLinking = Number(row?.n ?? 0)
      }
      return {
        body: {
          sms: { provider: 'bird', inbound: known(Boolean(p?.webhookSecrets.bird)) },
          email: {
            provider: 'resend',
            inbound: known(Boolean(p?.webhookSecrets.resend)),
            bodyReading: reader,
            replyTokens: known(Boolean(p?.inbound.emailAddress)),
          },
          unsupported: { count: Number(unsupported?.n ?? 0), latestAt: iso(unsupported?.latest as Date | null) },
          needsLinking,
        },
      }
    },
  })
}

const listConversations: RouteDef = read({
  method: 'GET',
  path: '/staff/inbox/conversations',
  operationId: 'listInboxConversations',
  summary: 'Customer conversations',
  description:
    'Staff with message.reply, inside the caller’s project scope (Owner, Office: every project; an Estimator’s own ' +
    'threads are not recorded yet, so none). Customer conversations, latest activity first, each with its project, ' +
    'customer, whether a customer reply waits and a short preview of the latest message. Internal conversations and ' +
    'Needs Linking messages are never listed here.',
  permission: 'message.reply',
  pagination: true,
  resource: async ({ actor }) => (actor.kind === 'staff' ? { ownerStaffId: actor.userId } : {}),
  schema: {
    querystring: {
      type: 'object',
      additionalProperties: false,
      properties: { limit: { type: 'integer', minimum: 1 }, cursor: { type: 'string', minLength: 1, maxLength: 512 } },
    },
    response: { 200: pageSchema(CONVERSATION_ITEM) },
  },
  handler: async (ctx) => {
    const page = ctx.page as NonNullable<ApiContext['page']>
    let q = ctx.db
      .selectFrom('comms.conversations as cv')
      .innerJoin('crm.projects as p', 'p.id', 'cv.project_id')
      // The customer staff see the project under now (TSK-0046 merges and relinks; the conversation keeps its own).
      .innerJoin('crm.customers as cu', (j) => j.on('cu.id', '=', sql<string>`crm.project_customer(cv.project_id)`))
      .select([
        'cv.id',
        'cv.last_message_at',
        'cv.last_inbound_at',
        'p.id as project_id',
        'p.reference',
        'p.state as project_state',
        'cu.id as customer_id',
        'cu.display_name',
        sql<string>`coalesce(cv.last_message_at, cv.created_at)::text`.as('sort_key'),
      ])
      .where('cv.audience', '=', 'customer')
      .where(projectInScope('cv.project_id', ctx.scope))
    const after = page.after
    if (after !== undefined) {
      const [at, id] = after
      if (after.length !== 2 || typeof at !== 'string' || typeof id !== 'string' || !UUID_RE.test(id))
        throw invalid('querystring.cursor')
      q = q.where(
        sql<boolean>`(coalesce(cv.last_message_at, cv.created_at), cv.id) < (${at}::timestamptz, ${id}::uuid)`,
      )
    }
    const rows = await q
      .orderBy(sql`coalesce(cv.last_message_at, cv.created_at)`, 'desc')
      .orderBy('cv.id', 'desc')
      .limit(page.limit + 1)
      .execute()
    const out = toPage(rows, page, (r) => [r.sort_key, r.id])
    const ids = out.items.map((r) => r.id)
    const latest = ids.length
      ? await ctx.db
          .selectFrom('comms.messages')
          .distinctOn('conversation_id')
          .select(['conversation_id', 'channel', 'direction', 'body_text', 'received_at'])
          .where('conversation_id', 'in', ids)
          .orderBy('conversation_id')
          .orderBy('received_at', 'desc')
          .orderBy('seq', 'desc')
          .execute()
      : []
    const waiting = ids.length
      ? await ctx.db
          .selectFrom('ops.queue_items')
          .select('subject_id')
          .where('type', '=', 'customer_replied')
          .where('resolved_at', 'is', null)
          .where('subject_id', 'in', ids)
          .execute()
      : []
    return {
      body: {
        items: out.items.map((r) => {
          const m = latest.find((x) => x.conversation_id === r.id)
          return {
            id: r.id,
            project: { id: r.project_id, reference: r.reference, state: r.project_state },
            customer: { id: r.customer_id, displayName: r.display_name },
            lastMessageAt: iso(r.last_message_at),
            lastInboundAt: iso(r.last_inbound_at),
            awaitingReply: waiting.some((w) => w.subject_id === r.id),
            latest: m
              ? {
                  channel: m.channel,
                  direction: m.direction,
                  preview: preview(m.body_text),
                  receivedAt: iso(m.received_at),
                }
              : null,
          }
        }),
        nextCursor: out.nextCursor,
      },
    }
  },
})

type MessageRow = {
  id: string
  direction: string
  channel: string
  from_address: string | null
  to_addresses: string[]
  subject: string | null
  body_text: string | null
  body_state: string
  body_truncated: boolean
  attachments: unknown
  keyword: string | null
  received_at: Date
  link_state: string
  match_rule: string | null
  contact_id: string | null
  contact_name: string | null
  author_staff_id: string | null
  staff_name: string | null
}

const attachmentsOf = (v: unknown) =>
  (Array.isArray(v) ? v : []).map((a) => {
    const o = (a ?? {}) as { contentType?: unknown; size?: unknown }
    return {
      contentType: typeof o.contentType === 'string' ? o.contentType : 'unknown',
      size: typeof o.size === 'number' ? o.size : null,
    }
  })

function threadMessage(m: MessageRow) {
  return {
    id: m.id,
    direction: m.direction,
    channel: m.channel,
    from: m.from_address,
    to: m.to_addresses,
    subject: m.subject,
    body: m.body_text,
    bodyState: m.body_state,
    bodyTruncated: m.body_truncated,
    attachments: attachmentsOf(m.attachments),
    keyword: m.keyword,
    receivedAt: iso(m.received_at) as string,
    linkState: m.link_state,
    matchRule: m.match_rule,
    author:
      m.direction === 'internal'
        ? { kind: 'staff' as const, id: m.author_staff_id, name: m.staff_name }
        : m.contact_id
          ? { kind: 'contact' as const, id: m.contact_id, name: m.contact_name }
          : { kind: 'unknown_sender' as const, id: null, name: null },
  }
}

const messagesOf = (ctx: ApiContext, conversationId: string) =>
  ctx.db
    .selectFrom('comms.messages as m')
    .leftJoin('crm.contacts as c', 'c.id', 'm.contact_id')
    .leftJoin('identity.staff_users as su', 'su.id', 'm.author_staff_id')
    .select([
      'm.id',
      'm.direction',
      'm.channel',
      'm.from_address',
      'm.to_addresses',
      'm.subject',
      'm.body_text',
      'm.body_state',
      'm.body_truncated',
      'm.attachments',
      'm.keyword',
      'm.received_at',
      'm.link_state',
      'm.match_rule',
      'm.contact_id',
      'c.full_name as contact_name',
      'm.author_staff_id',
      'su.display_name as staff_name',
    ])
    .where('m.conversation_id', '=', conversationId)
    .orderBy('m.received_at')
    .orderBy('m.seq')
    .limit(500)
    .execute() as Promise<MessageRow[]>

const getConversation: RouteDef = read({
  method: 'GET',
  path: '/staff/inbox/conversations/:conversationId',
  operationId: 'getInboxConversation',
  summary: 'A customer conversation',
  description:
    'Staff with message.reply on the conversation’s project, inside the caller’s scope (an unknown or out-of-scope ID ' +
    'is NOT_FOUND). The customer conversation’s inbound email and texts as received (the original text, never ' +
    'changed; attachments as metadata only, not imported), each with its sender contact or "unknown sender"; the ' +
    'project’s customer notifications as delivery metadata (no text); and, kept apart, the project’s internal ' +
    'conversation, which never reaches the customer.',
  permission: 'message.reply',
  pagination: false,
  resource: conversationResource,
  schema: { params: CONVERSATION_PARAMS, response: { 200: CONVERSATION } },
  handler: async (ctx) => {
    const { conversationId } = ctx.req.params as { conversationId: string }
    const cv = await ctx.db
      .selectFrom('comms.conversations as cv')
      .innerJoin('crm.projects as p', 'p.id', 'cv.project_id')
      // The customer staff see the project under now (TSK-0046 merges and relinks; the conversation keeps its own).
      .innerJoin('crm.customers as cu', (j) => j.on('cu.id', '=', sql<string>`crm.project_customer(cv.project_id)`))
      .select([
        'cv.id',
        'cv.state',
        'cv.handled_at',
        'p.id as project_id',
        'p.reference',
        'p.state as project_state',
        'cu.id as customer_id',
        'cu.display_name',
      ])
      .where('cv.id', '=', conversationId)
      .where('cv.audience', '=', 'customer')
      .where(projectInScope('cv.project_id', ctx.scope))
      .executeTakeFirst()
    if (!cv) throw new ApiError('NOT_FOUND')
    const internal = await ctx.db
      .selectFrom('comms.conversations')
      .select('id')
      .where('project_id', '=', cv.project_id)
      .where('audience', '=', 'internal')
      .executeTakeFirst()
    const waiting = await ctx.db
      .selectFrom('ops.queue_items')
      .select('id')
      .where('type', '=', 'customer_replied')
      .where('subject_id', '=', cv.id)
      .where('resolved_at', 'is', null)
      .executeTakeFirst()
    const deliveries = await ctx.db
      .selectFrom('platform.message_deliveries')
      .select(['id', 'message_key', 'channel', 'state', 'updated_at'])
      .where('project_id', '=', cv.project_id)
      .where('audience', '=', 'customer')
      .where('state', '<>', 'draft')
      .orderBy('seq')
      .limit(200)
      .execute()
    return {
      body: {
        id: cv.id,
        project: { id: cv.project_id, reference: cv.reference, state: cv.project_state },
        customer: { id: cv.customer_id, displayName: cv.display_name },
        state: cv.state,
        awaitingReply: Boolean(waiting),
        handledAt: iso(cv.handled_at),
        messages: (await messagesOf(ctx, cv.id)).map(threadMessage),
        deliveries: deliveries.map((d) => ({
          id: d.id,
          messageKey: d.message_key,
          channel: d.channel,
          state: d.state,
          at: iso(d.updated_at) as string,
        })),
        internal: {
          id: internal?.id ?? null,
          messages: internal ? (await messagesOf(ctx, internal.id)).map(threadMessage) : [],
        },
      },
    }
  },
})

const listNeedsLinking: RouteDef = read({
  method: 'GET',
  path: '/staff/inbox/needs-linking',
  operationId: 'listNeedsLinking',
  summary: 'Needs Linking',
  description:
    'Owner and Office only (message.view_unmatched); every other role is refused. Inbound email and texts that no ' +
    'reliable reference placed on exactly one project (several possible projects, none, a shared contact, or a ' +
    'reference whose sender is not on the project), newest first, with the reason and, when a reference named a ' +
    'project, that project as a suggestion. Nothing here is attached to any customer until staff link it.',
  permission: 'message.view_unmatched',
  pagination: true,
  schema: {
    querystring: {
      type: 'object',
      additionalProperties: false,
      properties: { limit: { type: 'integer', minimum: 1 }, cursor: { type: 'string', minLength: 1, maxLength: 512 } },
    },
    response: { 200: pageSchema(NEEDS_LINKING_ITEM) },
  },
  handler: async (ctx) => {
    const page = ctx.page as NonNullable<ApiContext['page']>
    let q = ctx.db
      .selectFrom('comms.messages as m')
      .leftJoin('crm.projects as sp', 'sp.id', 'm.suggested_project_id')
      .select([
        'm.id',
        'm.seq',
        'm.channel',
        'm.from_address',
        'm.subject',
        'm.body_text',
        'm.received_at',
        'm.needs_linking_reason',
        'm.attachments',
        'sp.id as suggested_id',
        'sp.reference as suggested_reference',
      ])
      .where('m.link_state', '=', 'needs_linking')
    const after = page.after
    if (after !== undefined) {
      const [seq] = after
      if (after.length !== 1 || typeof seq !== 'string' || !/^\d{1,18}$/.test(seq)) throw invalid('querystring.cursor')
      q = q.where('m.seq', '<', seq)
    }
    const rows = await q
      .orderBy('m.seq', 'desc')
      .limit(page.limit + 1)
      .execute()
    const out = toPage(rows, page, (r) => [String(r.seq)])
    return {
      body: {
        items: out.items.map((r) => ({
          id: r.id,
          channel: r.channel,
          from: r.from_address as string,
          subject: r.subject,
          preview: preview(r.body_text),
          receivedAt: iso(r.received_at) as string,
          reason: r.needs_linking_reason as string,
          attachments: attachmentsOf(r.attachments).length,
          suggestion:
            r.suggested_id && r.suggested_reference
              ? { projectId: r.suggested_id, reference: r.suggested_reference }
              : null,
        })),
        nextCursor: out.nextCursor,
      },
    }
  },
})

async function messageDetail(ctx: ApiContext, messageId: string) {
  const db = ctx.tx ?? ctx.db
  const m = await db
    .selectFrom('comms.messages as m')
    .leftJoin('crm.projects as p', 'p.id', 'm.project_id')
    .leftJoin('crm.customers as cu', (j) => j.on('cu.id', '=', sql<string>`crm.project_customer(m.project_id)`))
    .select([
      'm.id',
      'm.link_version',
      'm.direction',
      'm.channel',
      'm.from_address',
      'm.to_addresses',
      'm.subject',
      'm.body_text',
      'm.body_state',
      'm.body_truncated',
      'm.attachments',
      'm.keyword',
      'm.received_at',
      'm.link_state',
      'm.needs_linking_reason',
      'm.match_rule',
      'm.conversation_id',
      'm.suggested_project_id',
      'p.id as project_id',
      'p.reference',
      'cu.id as customer_id',
      'cu.display_name',
    ])
    .where('m.id', '=', messageId)
    .where('m.direction', '=', 'inbound')
    .executeTakeFirst()
  if (!m) throw new ApiError('NOT_FOUND')
  // Candidates for office staff: projects of the customers whose contacts have this address (verified or not), and
  // the project a reference suggested. A name never makes a candidate.
  const from = m.from_address as string
  const candidates = await db
    .selectFrom('crm.projects as p')
    .innerJoin('crm.customers as cu', 'cu.id', 'p.customer_id')
    .select([
      'p.id',
      'p.reference',
      'p.state',
      'p.created_at',
      'cu.id as customer_id',
      'cu.display_name',
      sql<boolean>`EXISTS (SELECT 1 FROM crm.contacts c WHERE c.customer_id = cu.id AND (
        (${m.channel} = 'email' AND c.email_verification = 'verified' AND c.email_verified_value = ${from}) OR
        (${m.channel} = 'sms' AND c.phone_verification = 'verified' AND c.phone_verified_value = ${from})))`.as(
        'verified',
      ),
    ])
    .where('cu.status', '<>', 'merged')
    .where((eb) =>
      eb.or([
        eb.exists(
          eb
            .selectFrom('crm.contacts as c')
            .select('c.id')
            .whereRef('c.customer_id', '=', 'cu.id')
            .where(m.channel === 'email' ? 'c.email_normalized' : 'c.phone_e164', '=', from),
        ),
        ...(m.suggested_project_id ? [eb('p.id', '=', m.suggested_project_id)] : []),
      ]),
    )
    .orderBy(sql`p.state IN ('closed', 'canceled')`)
    .orderBy('p.created_at', 'desc')
    .limit(CANDIDATE_LIMIT)
    .execute()
  const history = await db
    .selectFrom('comms.message_links as l')
    .leftJoin('crm.projects as fp', 'fp.id', 'l.from_project_id')
    .leftJoin('crm.projects as tp', 'tp.id', 'l.to_project_id')
    .leftJoin('identity.staff_users as su', 'su.id', 'l.staff_id')
    .select([
      'l.from_state',
      'l.to_state',
      'fp.reference as from_reference',
      'tp.reference as to_reference',
      'l.rule',
      'l.reason',
      'l.staff_id',
      'su.display_name as staff_name',
      'l.recorded_at',
    ])
    .where('l.message_id', '=', m.id)
    .orderBy('l.seq')
    .execute()
  return {
    id: m.id,
    version: m.link_version,
    direction: m.direction,
    channel: m.channel,
    from: m.from_address,
    to: m.to_addresses,
    subject: m.subject,
    body: m.body_text,
    bodyState: m.body_state,
    bodyTruncated: m.body_truncated,
    attachments: attachmentsOf(m.attachments),
    keyword: m.keyword,
    receivedAt: iso(m.received_at) as string,
    linkState: m.link_state,
    reason: m.needs_linking_reason,
    matchRule: m.match_rule,
    project: m.project_id && m.reference ? { id: m.project_id, reference: m.reference } : null,
    customer: m.customer_id && m.display_name ? { id: m.customer_id, displayName: m.display_name } : null,
    conversationId: m.conversation_id,
    candidates: candidates.map((c) => ({
      projectId: c.id,
      reference: c.reference,
      state: c.state,
      customerId: c.customer_id,
      customerName: c.display_name,
      verifiedContact: Boolean(c.verified),
      suggested: c.id === m.suggested_project_id,
    })),
    history: history.map((h) => ({
      fromState: h.from_state,
      toState: h.to_state,
      fromReference: h.from_reference,
      toReference: h.to_reference,
      rule: h.rule,
      reason: h.reason,
      staff: h.staff_id ? { id: h.staff_id, name: h.staff_name } : null,
      at: iso(h.recorded_at) as string,
    })),
  }
}

const getMessage: RouteDef = read({
  method: 'GET',
  path: '/staff/inbox/messages/:messageId',
  operationId: 'getInboxMessage',
  summary: 'An inbound message and its linking',
  description:
    'Owner and Office only (message.view_unmatched). One inbound email or text exactly as received, its linking ' +
    'state (matched, Needs Linking with the reason, or linked by staff), its linking history with each correction’s ' +
    'staff member and reason, and candidate projects: projects of customers whose contacts have the sender’s exact ' +
    'address (marked when the address is verified) and the project a reference suggested. Candidates are suggestions ' +
    'for staff, never links.',
  permission: 'message.view_unmatched',
  pagination: false,
  resource: messageResource,
  schema: { params: MESSAGE_PARAMS, response: { 200: MESSAGE_DETAIL } },
  handler: async (ctx) => ({ body: await messageDetail(ctx, (ctx.req.params as { messageId: string }).messageId) }),
})

const linkMessage: RouteDef = {
  method: 'POST',
  path: '/staff/inbox/messages/:messageId/link',
  operationId: 'linkInboxMessage',
  summary: 'Link a message to a project, or return it to Needs Linking',
  description:
    'Owner and Office only (message.link), with If-Match (the message’s linking version) and a written reason. Links ' +
    'an inbound message to the project with that reference (any project inside the caller’s scope), or, with ' +
    'projectReference null, returns it to Needs Linking. The message itself never changes: only its linking moves, ' +
    'and the correction is kept in its linking history and the audit log (OWN-DEC-120). The sender is recorded as a ' +
    'contact of the project’s customer only when one of that customer’s contacts already has the exact address; no ' +
    'contact is created and nothing is merged.',
  actors: ['staff'],
  permission: 'message.link',
  kind: 'write',
  idempotency: 'required',
  expectedVersion: 'required',
  rateLimit: 'none',
  audit: 'inbox.message_linked',
  pagination: false,
  test: TEST,
  resource: messageResource,
  schema: { params: MESSAGE_PARAMS, body: LINK_BODY, response: { 200: LINK_RESULT } },
  handler: async (ctx) => {
    const staff = staffActor(ctx)
    const tx = ctx.tx as NonNullable<ApiContext['tx']>
    const { messageId } = ctx.req.params as { messageId: string }
    const b = ctx.req.body as { projectReference: string | null; reason: string }
    const reason = b.reason.trim()
    const m = await tx
      .selectFrom('comms.messages')
      .select([
        'id',
        'link_state',
        'link_version',
        'project_id',
        'channel',
        'from_address',
        'received_at',
        'conversation_id',
      ])
      .where('id', '=', messageId)
      .where('direction', '=', 'inbound')
      .forUpdate()
      .executeTakeFirst()
    if (!m) throw new ApiError('NOT_FOUND')
    if (ctx.expectedVersion() !== m.link_version)
      throw new ApiError('STALE_VERSION', {
        current: { version: m.link_version, values: { linkState: m.link_state } },
      })
    const fromRef = m.project_id
      ? ((await tx.selectFrom('crm.projects').select('reference').where('id', '=', m.project_id).executeTakeFirst())
          ?.reference ?? null)
      : null
    const version = m.link_version + 1
    if (b.projectReference === null) {
      if (m.link_state === 'needs_linking') throw conflict('ALREADY_NEEDS_LINKING')
      await applyLink(tx, {
        messageId: m.id,
        from: { state: m.link_state, projectId: m.project_id },
        to: { state: 'needs_linking', reason: 'returned_by_staff', suggestedProjectId: null },
        staff: { id: staff.userId, reason },
        nextVersion: version,
      })
      if (m.conversation_id) await resolveCustomerRepliedIfQuiet(tx, m.conversation_id)
      await openNeedsLinking(tx, m.id, new Date())
      await ctx.audit({
        target: { type: 'inbound_message', id: m.id, version },
        summary: { from: m.link_state, to: 'needs_linking', fromProject: fromRef, toProject: null },
        reason,
      })
      return { body: { id: m.id, version, linkState: 'needs_linking', project: null, conversationId: null }, version }
    }
    const project = await tx
      .selectFrom('crm.projects as p')
      .innerJoin('crm.customers as cu', 'cu.id', 'p.customer_id')
      .select(['p.id', 'p.reference', 'p.customer_id', 'cu.status'])
      .where('p.reference', '=', b.projectReference)
      .where(projectInScope('p.id', ctx.scope))
      .executeTakeFirst()
    if (!project) throw invalid('body.projectReference', 'not_found')
    if (project.status === 'merged') throw conflict('CUSTOMER_MERGED')
    if (m.project_id === project.id) throw conflict('ALREADY_ON_PROJECT')
    const contactId = await contactOf(tx, project.customer_id, m.channel as 'email' | 'sms', m.from_address as string)
    const conversationId = await applyLink(tx, {
      messageId: m.id,
      from: { state: m.link_state, projectId: m.project_id },
      to: { state: 'linked', rule: 'staff', projectId: project.id, customerId: project.customer_id, contactId },
      staff: { id: staff.userId, reason },
      nextVersion: version,
    })
    if (conversationId) await touchConversation(tx, conversationId, m.received_at, true)
    if (m.conversation_id && m.conversation_id !== conversationId)
      await resolveCustomerRepliedIfQuiet(tx, m.conversation_id)
    await resolveNeedsLinking(tx, m.id)
    await ctx.audit({
      target: { type: 'inbound_message', id: m.id, version },
      summary: { from: m.link_state, to: 'linked', fromProject: fromRef, toProject: project.reference },
      reason,
    })
    return {
      body: {
        id: m.id,
        version,
        linkState: 'linked',
        project: { id: project.id, reference: project.reference },
        conversationId,
      },
      version,
    }
  },
}

/** A conversation that no longer holds any inbound message has no reply waiting. */
async function resolveCustomerRepliedIfQuiet(tx: NonNullable<ApiContext['tx']>, conversationId: string) {
  const left = await tx
    .selectFrom('comms.messages')
    .select('id')
    .where('conversation_id', '=', conversationId)
    .where('direction', '=', 'inbound')
    .executeTakeFirst()
  if (!left) await resolveCustomerReplied(tx, conversationId)
}

const postInternal: RouteDef = {
  method: 'POST',
  path: '/staff/inbox/projects/:projectId/internal-messages',
  operationId: 'postInternalMessage',
  summary: 'Add an internal message to a project',
  description:
    'Staff with message.reply on the project, inside the caller’s scope. Adds a staff-only message to the project’s ' +
    'internal conversation, which is separate from the customer conversation and never reaches the customer ' +
    '(HH-COM-01). A message never becomes a binding scope or price change. Card numbers are refused; never write ' +
    'passwords or access codes in a message.',
  actors: ['staff'],
  permission: 'message.reply',
  kind: 'write',
  idempotency: 'required',
  expectedVersion: 'none',
  rateLimit: 'none',
  audit: 'inbox.internal_message_added',
  pagination: false,
  test: TEST,
  resource: projectResource,
  schema: { params: PROJECT_PARAMS, body: INTERNAL_BODY, response: { 201: CREATED } },
  handler: async (ctx) => {
    const staff = staffActor(ctx)
    const tx = ctx.tx as NonNullable<ApiContext['tx']>
    const { projectId } = ctx.req.params as { projectId: string }
    const inScope = await tx
      .selectFrom('crm.projects')
      .select('id')
      .where('id', '=', projectId)
      .where(projectInScope('id', ctx.scope))
      .executeTakeFirst()
    if (!inScope) throw new ApiError('NOT_FOUND')
    const text = (ctx.req.body as { body: string }).body.trim()
    if (looksLikeCardNumber(text)) throw invalid('body.body', 'card_number')
    const conversationId = await ensureConversation(tx, projectId, 'internal')
    const now = new Date()
    const row = await tx
      .insertInto('comms.messages')
      .values({
        direction: 'internal',
        channel: 'internal',
        body_text: text,
        body_state: 'received',
        received_at: now,
        author_staff_id: staff.userId,
        link_state: 'matched',
        match_rule: 'staff',
        project_id: projectId,
        customer_id: sql<string>`(SELECT customer_id FROM crm.projects WHERE id = ${projectId})`,
        conversation_id: conversationId,
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    await touchConversation(tx, conversationId, now, false)
    await ctx.audit({ target: { type: 'internal_message', id: row.id }, summary: { project: projectId } })
    return { status: 201, body: { id: row.id, conversationId } }
  },
}

const markHandled: RouteDef = {
  method: 'POST',
  path: '/staff/inbox/conversations/:conversationId/handled',
  operationId: 'markConversationHandled',
  summary: 'Mark a customer’s replies handled',
  description:
    'Staff with message.reply on the conversation’s project, inside the caller’s scope. Records who handled the ' +
    'customer’s replies and when, and resolves the conversation’s "customer replied" queue item. Nothing is sent ' +
    'and no message changes.',
  actors: ['staff'],
  permission: 'message.reply',
  kind: 'write',
  idempotency: 'required',
  expectedVersion: 'none',
  rateLimit: 'none',
  audit: 'inbox.conversation_handled',
  pagination: false,
  test: TEST,
  resource: conversationResource,
  schema: { params: CONVERSATION_PARAMS, body: HANDLED_BODY, response: { 200: HANDLED_RESULT } },
  handler: async (ctx) => {
    const staff = staffActor(ctx)
    const tx = ctx.tx as NonNullable<ApiContext['tx']>
    const { conversationId } = ctx.req.params as { conversationId: string }
    const cv = await tx
      .selectFrom('comms.conversations')
      .select('id')
      .where('id', '=', conversationId)
      .where('audience', '=', 'customer')
      .where(projectInScope('project_id', ctx.scope))
      .forUpdate()
      .executeTakeFirst()
    if (!cv) throw new ApiError('NOT_FOUND')
    const now = new Date()
    await tx
      .updateTable('comms.conversations')
      .set({ handled_at: now, handled_by: staff.userId })
      .where('id', '=', cv.id)
      .execute()
    const resolved = await resolveCustomerReplied(tx, cv.id)
    await ctx.audit({ target: { type: 'conversation', id: cv.id }, summary: { resolved } })
    return { body: { resolved, handledAt: now.toISOString() } }
  },
}

export function inboxModule(deps: InboxDeps = {}): ApiModule {
  return {
    name: 'inbox',
    routes: [
      statusRoute(deps),
      listConversations,
      getConversation,
      postInternal,
      markHandled,
      listNeedsLinking,
      getMessage,
      linkMessage,
    ],
  }
}
