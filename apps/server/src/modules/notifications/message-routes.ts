// The staff message views (TSK-0119; HH-COM-14, HH-COM-13, HH-COM-02, OWN-DEC-152 sections 9 and 14, RULE-SERVER-AUTHZ,
// T74). Read only; the one write is the existing Retry (retry.ts).
// - Deliveries: every outgoing message inside the caller's project scope, newest first, with its lifecycle state
//   (lifecycle.ts), template ID and version, channel, masked destination, created, due, provider-accepted and status
//   times, attempts with their history, the failure reason and the names of missing variables, the consent decision,
//   whether a test provider intercepted it (never shown as delivered) and whether staff may retry it. Filters: the
//   lifecycle group and a project reference. Never the rendered text, a variable value or a full destination.
// - Templates: every message type with its owner template ID, audience, channels, classification, release authority
//   (automatic by the configured list, staff-released, or Owner-released), its released versions per channel and
//   language and their readiness (ready, NOT CONFIGURED, or values not wired yet), and the variable registry.
// - Preview: one released version rendered with synthetic sample values (variables.ts SAMPLE_VALUES) through the
//   same layout as a real send, as JSON (subject, text, HTML) and as an HTML page for a sandboxed frame. A preview is
//   never a delivery and is never recorded as one (OWN-DEC-152 section 14).
// PROPOSED permission: message.release_draft (the staff who release and retry messages: Owner and Office see every
// project; an Estimator and a Worker see only what their data scope reaches, which is nothing until assignments are
// recorded).
import { MESSAGE_TYPES, messageCategory, messageType, type Channel } from './message-types.js'
import { ApiError } from '../../api/errors.js'
import { pageSchema, toPage } from '../../api/pagination.js'
import type { ApiContext, RouteDef } from '../../api/route.js'
import { loadConfig } from '../../platform/config/index.js'
import { projectInScope } from '../../platform/data-scope.js'
import { isOutcomeUnknown } from './deliveries.js'
import { LIFECYCLE_GROUPS, lifecycleOf, isIntercepted, MESSAGE_LIFECYCLE } from './lifecycle.js'
import { automaticPolicy } from './policy.js'
import { currentTemplate, renderTemplate, unwiredVariables, type ContentLocale } from './templates.js'
import { placeholdersOf } from './layout.js'
import { SAMPLE_LINK_HOSTS, SAMPLE_VALUES, TEMPLATE_VARIABLES, type VariableName } from './variables.js'

const TEST = 'test/integration/message-templates.test.ts'
const REFERENCE = '^HH-[0-9A-HJKMNP-TV-Z]{8}$'
const MESSAGE_KEY = '^[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)+$'

function read(def: Omit<RouteDef, 'actors' | 'kind' | 'idempotency' | 'expectedVersion' | 'audit' | 'test'>): RouteDef {
  return {
    // An Estimator's own-record grant is decided on their own records; the data scope then limits what is listed.
    resource: async ({ actor }) => (actor.kind === 'staff' ? { ownerStaffId: actor.userId } : {}),
    ...def,
    actors: ['staff'],
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    audit: 'none',
    test: TEST,
  }
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null)
const NULLABLE_STRING = { type: ['string', 'null'] } as const
const NULLABLE_TIME = { type: ['string', 'null'], format: 'date-time' } as const

/** A destination with only enough shown to tell two apart: the first letter and domain, or the last four digits. */
export function maskDestination(channel: string, destination: string): string {
  if (channel === 'email') {
    const at = destination.lastIndexOf('@')
    if (at <= 0) return '•••'
    return `${destination.slice(0, 1)}•••${destination.slice(at)}`
  }
  const digits = destination.replace(/\D/g, '')
  return `•••${digits.slice(-4)}`
}

const DELIVERY_ITEM = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'messageKey',
    'templateId',
    'templateVersion',
    'layoutVersion',
    'channel',
    'audience',
    'release',
    'lifecycle',
    'intercepted',
    'destination',
    'project',
    'createdAt',
    'queuedAt',
    'scheduledAt',
    'sentAt',
    'statusAt',
    'attempts',
    'errorCode',
    'missingVariables',
    'consentDecision',
    'retryAvailable',
    'history',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    messageKey: { type: 'string' },
    templateId: NULLABLE_STRING,
    templateVersion: { type: ['integer', 'null'] },
    layoutVersion: { type: ['integer', 'null'] },
    channel: { type: 'string', enum: ['email', 'sms'] },
    audience: { type: 'string', enum: ['customer', 'staff'] },
    release: { type: 'string', enum: ['automatic', 'staff_released'] },
    lifecycle: { type: 'string', enum: [...MESSAGE_LIFECYCLE] },
    intercepted: { type: 'boolean' },
    destination: { type: 'string' },
    project: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['id', 'reference'],
      properties: { id: { type: 'string', format: 'uuid' }, reference: { type: 'string' } },
    },
    createdAt: { type: 'string', format: 'date-time' },
    queuedAt: NULLABLE_TIME,
    scheduledAt: NULLABLE_TIME,
    sentAt: NULLABLE_TIME,
    statusAt: NULLABLE_TIME,
    attempts: { type: 'integer' },
    errorCode: NULLABLE_STRING,
    missingVariables: { type: 'array', items: { type: 'string' } },
    consentDecision: NULLABLE_STRING,
    retryAvailable: { type: 'boolean' },
    history: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['attempt', 'state', 'errorCode', 'at'],
        properties: {
          attempt: { type: 'integer' },
          state: { type: 'string' },
          errorCode: NULLABLE_STRING,
          at: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
} as const

const GROUPS = Object.keys(LIFECYCLE_GROUPS) as (keyof typeof LIFECYCLE_GROUPS)[]

const listDeliveries: RouteDef = read({
  method: 'GET',
  path: '/staff/message-deliveries',
  operationId: 'listMessageDeliveries',
  summary: 'Outgoing messages and their delivery state',
  description:
    'Staff with message.release_draft, inside the caller’s project scope (Owner, Office: every message; others only ' +
    'what their scope reaches). Newest first. Each message shows its lifecycle state (DRAFT, PENDING_APPROVAL, ' +
    'SCHEDULED, QUEUED, PROVIDER_ACCEPTED, DELIVERED, FAILED, CANCELLED, EXPIRED, SUPPRESSED), template ID and ' +
    'version, channel, a masked destination, its created, queued, due, provider-accepted and status times, attempts ' +
    'and their history, the failure reason with the names of missing variables, the consent decision, whether a test ' +
    'provider intercepted it (never delivered) and whether its Retry is available. Filters: group (waiting, sent, ' +
    'failed, stopped) and reference (a project reference). Never the text, a value or a full destination.',
  permission: 'message.release_draft',
  rateLimit: 'none',
  pagination: true,
  schema: {
    querystring: {
      type: 'object',
      additionalProperties: false,
      properties: {
        limit: { type: 'integer', minimum: 1 },
        cursor: { type: 'string', minLength: 1, maxLength: 512 },
        group: { type: 'string', enum: GROUPS },
        reference: { type: 'string', pattern: REFERENCE },
      },
    },
    response: { 200: pageSchema(DELIVERY_ITEM) },
  },
  handler: async (ctx) => {
    const page = ctx.page as NonNullable<ApiContext['page']>
    const q = ctx.req.query as { group?: (typeof GROUPS)[number]; reference?: string }
    let query = ctx.db
      .selectFrom('platform.message_deliveries as d')
      .leftJoin('crm.projects as p', 'p.id', 'd.project_id')
      .select([
        'd.id',
        'd.seq',
        'd.message_key',
        'd.template_id',
        'd.template_version',
        'd.layout_version',
        'd.channel',
        'd.audience',
        'd.release',
        'd.state',
        'd.provider',
        'd.provider_message_id',
        'd.destination',
        'd.created_at',
        'd.queued_at',
        'd.scheduled_at',
        'd.sent_at',
        'd.status_at',
        'd.attempts',
        'd.error_code',
        'd.missing_variables',
        'd.consent_decision',
        'p.id as project_id',
        'p.reference',
      ])
      .where(projectInScope('d.project_id', ctx.scope))
    if (q.reference) query = query.where('p.reference', '=', q.reference)
    if (q.group === 'waiting')
      query = query.where((eb) =>
        eb.or([
          eb('d.state', '=', 'draft'),
          eb.and([eb('d.state', '=', 'queued'), eb('d.provider_message_id', 'is', null)]),
        ]),
      )
    else if (q.group === 'sent')
      query = query.where((eb) =>
        eb.or([
          eb('d.state', 'in', ['sent', 'delivered']),
          eb.and([eb('d.state', '=', 'queued'), eb('d.provider_message_id', 'is not', null)]),
        ]),
      )
    else if (q.group === 'failed') query = query.where('d.state', '=', 'failed')
    else if (q.group === 'stopped') query = query.where('d.state', 'in', ['cancelled', 'suppressed'])
    const after = page.after
    if (after !== undefined) {
      const [seq] = after
      if (after.length !== 1 || typeof seq !== 'string' || !/^\d{1,19}$/.test(seq))
        throw new ApiError('VALIDATION_FAILED', {
          fieldErrors: [{ field: 'querystring.cursor', code: 'invalid', message: '' }],
        })
      query = query.where('d.seq', '<', seq)
    }
    const rows = await query
      .orderBy('d.seq', 'desc')
      .limit(page.limit + 1)
      .execute()
    const out = toPage(rows, page, (r) => [String(r.seq)])
    const ids = out.items.map((r) => r.id)
    const [issues, attempts] = ids.length
      ? await Promise.all([
          ctx.db
            .selectFrom('ops.queue_items')
            .select('subject_id')
            .where('type', '=', 'delivery_failed')
            .where('subject_type', '=', 'message_delivery')
            .where('resolved_at', 'is', null)
            .where('subject_id', 'in', ids)
            .execute(),
          ctx.db
            .selectFrom('platform.message_delivery_attempts')
            .select(['delivery_id', 'attempt', 'state', 'error_code', 'recorded_at'])
            .where('delivery_id', 'in', ids)
            .orderBy('delivery_id')
            .orderBy('attempt')
            .execute(),
        ])
      : [[], []]
    const open = new Set(issues.map((i) => i.subject_id))
    const now = new Date()
    return {
      body: {
        items: out.items.map((r) => ({
          id: r.id,
          messageKey: r.message_key,
          templateId: r.template_id,
          templateVersion: r.template_version,
          layoutVersion: r.layout_version,
          channel: r.channel,
          audience: r.audience,
          release: r.release,
          lifecycle: lifecycleOf(r, now),
          intercepted: isIntercepted(r),
          destination: maskDestination(r.channel, r.destination),
          project: r.project_id && r.reference ? { id: r.project_id, reference: r.reference } : null,
          createdAt: iso(r.created_at),
          queuedAt: iso(r.queued_at),
          scheduledAt: iso(r.scheduled_at),
          sentAt: iso(r.sent_at),
          statusAt: iso(r.status_at),
          attempts: r.attempts,
          errorCode: r.error_code,
          missingVariables: r.missing_variables,
          consentDecision: r.consent_decision,
          retryAvailable:
            r.state === 'failed' && r.provider_message_id === null && open.has(r.id) && !isOutcomeUnknown(r.error_code),
          history: attempts
            .filter((a) => a.delivery_id === r.id)
            .map((a) => ({ attempt: a.attempt, state: a.state, errorCode: a.error_code, at: iso(a.recorded_at) })),
        })),
        nextCursor: out.nextCursor,
      },
    }
  },
})

const VERSION_ITEM = {
  type: 'object',
  additionalProperties: false,
  required: ['channel', 'locale', 'version', 'releasedAt', 'translationReview', 'readiness', 'unwired', 'sourceIds'],
  properties: {
    channel: { type: 'string', enum: ['email', 'sms'] },
    locale: { type: 'string', enum: ['en', 'es'] },
    version: { type: ['integer', 'null'] },
    releasedAt: NULLABLE_TIME,
    translationReview: { type: ['string', 'null'], enum: ['source', 'ai_reviewed', null] },
    readiness: { type: 'string', enum: ['ready', 'not_configured', 'not_wired'] },
    unwired: { type: 'array', items: { type: 'string' } },
    sourceIds: { type: 'array', items: { type: 'string' } },
  },
} as const

const TEMPLATE_ITEM = {
  type: 'object',
  additionalProperties: false,
  required: ['messageKey', 'templateId', 'audience', 'channels', 'category', 'release', 'variables', 'versions'],
  properties: {
    messageKey: { type: 'string' },
    templateId: NULLABLE_STRING,
    audience: { type: 'string', enum: ['customer', 'staff'] },
    channels: { type: 'array', items: { type: 'string', enum: ['email', 'sms'] } },
    category: {
      type: 'string',
      enum: ['authentication', 'account_security', 'transactional', 'internal', 'marketing'],
    },
    release: { type: 'string', enum: ['automatic', 'staff', 'owner'] },
    variables: { type: 'array', items: { type: 'string' } },
    versions: { type: 'array', items: VERSION_ITEM },
  },
} as const

const VARIABLE_ITEM = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'kind', 'meaning', 'source', 'subject', 'required', 'fallback', 'sensitive', 'customerForbidden'],
  properties: {
    name: { type: 'string' },
    kind: { type: 'string' },
    meaning: { type: 'string' },
    source: { type: 'string' },
    subject: { type: 'boolean' },
    required: { type: 'boolean' },
    fallback: NULLABLE_STRING,
    sensitive: { type: 'boolean' },
    customerForbidden: { type: 'boolean' },
  },
} as const

/** The language versions a message type has: customer English; staff English and Spanish (RULE-LANGUAGES). */
const localesOf = (audience: string): ContentLocale[] => (audience === 'customer' ? ['en'] : ['en', 'es'])

const listTemplates: RouteDef = read({
  method: 'GET',
  path: '/staff/message-templates',
  operationId: 'listMessageTemplates',
  summary: 'Message templates and the variable registry',
  description:
    'Staff with message.release_draft. Every message type with its owner template ID, audience, channels, ' +
    'classification and release authority (automatic while on messages.automatic, staff-released, or released by ' +
    'the Owner), and per channel and language its newest released version (append-only) and readiness: ready, ' +
    'NOT CONFIGURED (no approved wording) or not wired (the values its wording needs are not supplied yet). Also the ' +
    'one template-variable registry: each variable’s kind, meaning, source record, whether it may appear in a ' +
    'subject, whether it is required (only a variable with an approved fallback is optional) and whether it is ' +
    'sensitive. Template approval is shown separately from any message’s delivery state.',
  permission: 'message.release_draft',
  rateLimit: 'none',
  pagination: false,
  schema: {
    response: {
      200: {
        type: 'object',
        additionalProperties: false,
        required: ['templates', 'variables'],
        properties: {
          templates: { type: 'array', items: TEMPLATE_ITEM },
          variables: { type: 'array', items: VARIABLE_ITEM },
        },
      },
    },
  },
  handler: async (ctx) => {
    const policy = automaticPolicy(await loadConfig(ctx.db))
    const templates = []
    for (const type of MESSAGE_TYPES.values()) {
      const versions = []
      for (const channel of type.channels)
        for (const locale of localesOf(type.audience)) {
          const t = await currentTemplate(ctx.db, type.key, channel, locale)
          const sources = t
            ? await ctx.db
                .selectFrom('platform.message_template_versions')
                .select('source_ids')
                .where('message_key', '=', type.key)
                .where('channel', '=', channel)
                .where('locale', '=', locale)
                .where('version', '=', t.version)
                .executeTakeFirst()
            : undefined
          const unwired = t ? unwiredVariables(t) : []
          versions.push({
            channel,
            locale,
            version: t?.version ?? null,
            releasedAt: iso(t?.releasedAt),
            translationReview: t?.translationReview ?? null,
            readiness: !t ? 'not_configured' : unwired.length ? 'not_wired' : 'ready',
            unwired,
            sourceIds: sources?.source_ids ?? [],
          })
        }
      templates.push({
        messageKey: type.key,
        templateId: type.templateId ?? null,
        audience: type.audience,
        channels: [...type.channels],
        category: messageCategory(type),
        release: type.ownerApproval ? 'owner' : policy.isAutomatic(type.key) ? 'automatic' : 'staff',
        variables: Object.keys(type.variables),
        versions,
      })
    }
    const variables = Object.entries(TEMPLATE_VARIABLES).map(([name, spec]) => {
      const s = spec as (typeof TEMPLATE_VARIABLES)[VariableName] & {
        fallback?: { text: string }
        sensitive?: true
        customerForbidden?: true
      }
      return {
        name,
        kind: s.kind,
        meaning: s.meaning,
        source: s.source,
        subject: s.subject,
        required: !s.fallback,
        fallback: s.fallback?.text ?? null,
        sensitive: s.sensitive === true,
        customerForbidden: s.customerForbidden === true,
      }
    })
    return { body: { templates, variables } }
  },
})

const PREVIEW_PARAMS = {
  type: 'object',
  additionalProperties: false,
  required: ['messageKey'],
  properties: { messageKey: { type: 'string', pattern: MESSAGE_KEY, maxLength: 80 } },
} as const
const PREVIEW_QUERY = {
  type: 'object',
  additionalProperties: false,
  properties: {
    channel: { type: 'string', enum: ['email', 'sms'] },
    locale: { type: 'string', enum: ['en', 'es'] },
  },
} as const

/** A released version rendered with synthetic samples; NOT_FOUND for an unknown type or no released version. */
async function preview(ctx: ApiContext) {
  const { messageKey } = ctx.req.params as { messageKey: string }
  const q = ctx.req.query as { channel?: Channel; locale?: ContentLocale }
  let type
  try {
    type = messageType(messageKey)
  } catch {
    throw new ApiError('NOT_FOUND')
  }
  const channel = q.channel ?? (type.channels[0] as Channel)
  const locale: ContentLocale = type.audience === 'customer' ? 'en' : (q.locale ?? 'en')
  if (!type.channels.includes(channel)) throw new ApiError('NOT_FOUND')
  const t = await currentTemplate(ctx.db, type.key, channel, locale)
  if (!t) throw new ApiError('NOT_FOUND')
  const config = await loadConfig(ctx.db)
  const brand = config.get('business.name')
  const contact = config.get('business.public_contact')
  // Sample values for exactly the variables this version uses (the greeting's sample first name included).
  const used = new Set([...placeholdersOf(t.body), ...(t.subject ? placeholdersOf(t.subject) : [])])
  const values: Record<string, string> = {}
  for (const name of used) if (Object.hasOwn(SAMPLE_VALUES, name)) values[name] = SAMPLE_VALUES[name as VariableName]
  const rendered = renderTemplate(t, values, {
    brand: brand.state === 'CONFIGURED' ? brand.value.brand : 'HandyHub',
    contact: contact.state === 'CONFIGURED' ? contact.value : null,
    linkHosts: SAMPLE_LINK_HOSTS,
  })
  return { t, channel, locale, rendered }
}

const previewTemplate: RouteDef = read({
  method: 'GET',
  path: '/staff/message-templates/:messageKey/preview',
  operationId: 'previewMessageTemplate',
  summary: 'Preview a released template with sample values',
  description:
    'Staff with message.release_draft. The newest released version of one message type for a channel and language ' +
    '(customer messages are English), rendered through the same branded layout as a real send with synthetic sample ' +
    'values on the reserved example.test host: subject, plain text and HTML. A preview is never sent or recorded as ' +
    'a delivery. NOT_FOUND for an unknown type, a channel it does not use, or no released version (NOT CONFIGURED).',
  permission: 'message.release_draft',
  rateLimit: { bucket: 'message_template_preview', limit: 120, windowSeconds: 3600 },
  pagination: false,
  schema: {
    params: PREVIEW_PARAMS,
    querystring: PREVIEW_QUERY,
    response: {
      200: {
        type: 'object',
        additionalProperties: false,
        required: ['messageKey', 'templateId', 'version', 'channel', 'locale', 'subject', 'text', 'html', 'sample'],
        properties: {
          messageKey: { type: 'string' },
          templateId: NULLABLE_STRING,
          version: { type: 'integer' },
          channel: { type: 'string', enum: ['email', 'sms'] },
          locale: { type: 'string', enum: ['en', 'es'] },
          subject: NULLABLE_STRING,
          text: { type: 'string' },
          html: NULLABLE_STRING,
          sample: { type: 'boolean', enum: [true] },
        },
      },
    },
  },
  handler: async (ctx) => {
    const { t, channel, locale, rendered } = await preview(ctx)
    return {
      body: {
        messageKey: t.messageKey,
        templateId: t.templateId ?? null,
        version: t.version,
        channel,
        locale,
        subject: rendered.subject,
        text: rendered.body,
        html: rendered.html,
        sample: true,
      },
      headers: { 'cache-control': 'no-store' },
    }
  },
})

/**
 * The CSP of a message preview page: no scripts, no requests, inline styles only, sandboxed, framed only by the
 * staff app itself (hosts.ts keeps a response's own sandboxed policy).
 */
export const PREVIEW_CSP =
  "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'self'"

const previewPage: RouteDef = read({
  method: 'GET',
  path: '/staff/message-templates/:messageKey/preview.html',
  operationId: 'previewMessageTemplatePage',
  summary: 'The HTML preview page of a released email template',
  description:
    'As previewMessageTemplate, for email: the rendered HTML itself, for a sandboxed frame in the staff app. Served ' +
    'with its own policy (sandbox, no scripts, no requests, inline styles only, framed only by the same origin). ' +
    'NOT_FOUND for a text-message channel or no released version.',
  permission: 'message.release_draft',
  rateLimit: { bucket: 'message_template_preview', limit: 120, windowSeconds: 3600 },
  pagination: false,
  binaryResponse: { contentTypes: ['text/html'] },
  schema: {
    params: PREVIEW_PARAMS,
    querystring: PREVIEW_QUERY,
    response: { 200: { type: 'string', format: 'binary' } },
  },
  handler: async (ctx) => {
    const { rendered } = await preview(ctx)
    if (!rendered.html) throw new ApiError('NOT_FOUND')
    return {
      body: Buffer.from(rendered.html, 'utf8'),
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'content-security-policy': PREVIEW_CSP,
      },
    }
  },
})

export const MESSAGE_VIEW_ROUTES: readonly RouteDef[] = [listDeliveries, listTemplates, previewTemplate, previewPage]
