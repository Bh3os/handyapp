// Staff replies from the project (TSK-0050; HH-COM-08, HH-COM-09, HH-COM-01, HH-COM-02, HH-COM-03, HH-COM-05, T65,
// T66, OWN-DEC-120, FACT-HOURS, FACT-TIMEZONE, ENT-Message, ENT-ConsentPreference, RULE-SERVER-AUTHZ).
// - A reply goes to the contact of the project's request (the customer's contact for this project) through the
//   customer's preferred channel while it is permitted: email needs the address verified and no withdrawal of service
//   messages on file; a text needs the number verified and a current SMS opt-in (a STOP withdraws it). Having an
//   address or a number is never permission by itself.
// - When the preferred channel is unavailable, the other permitted option is offered for staff to choose; the server
//   never picks it for them, and while the preferred one is available no other channel is accepted (no silent switch).
//   With no permitted channel nothing can be sent and the composer says why.
// - Pressing Send is the release (no second approval): in one transaction the reply is written to the project's
//   customer conversation exactly as typed (the customer reads it in the portal's Messages tab at once), its one
//   staff.reply delivery is drafted and released by the staff member, and a `notify.release` job sends it at the
//   release time. TSK-0122 (OWN-DEC-154, messages.delivery_hours): an email goes at once, at any hour; a text waits for
//   the recipient's permitted local hours (8 AM–10 PM in their verified zone; 9 AM–9 PM Eastern while it is unknown),
//   and the composer says which applies. The send rechecks the contact, consent and the template at send time; a delivery that fails becomes a
//   delivery issue with Retry, and a retry presents the same provider idempotency key, so one reply is one message.
// - The customer content language is English whatever the staff member's interface language (HH-COM-03): the reply
//   template is the English one; the staff member's own text is kept as written. Card numbers are refused.
// - A successful send is a meaningful staff response for the first-response clock (TSK-0043): the delivery is about the
//   project, whose request's clock stops when the provider takes the message, and only then.
// - Sending a reply marks the customer's waiting replies handled (PROPOSED), so the "customer replied" item resolves.
// Attachments on staff replies are not built here: the composer offers none (no upload is pretended).
import { randomUUID } from 'node:crypto'
import type { Db, Tx } from '@handyhub/db'
import { looksLikeCardNumber } from '@handyhub/domain'
import type { StaffActor } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError } from '../../api/errors.js'
import type { ApiContext, RouteDef } from '../../api/route.js'
import type { Automation } from '../../platform/automation.js'
import { loadConfig, type Config } from '../../platform/config/index.js'
import { projectInScope } from '../../platform/data-scope.js'
import {
  createDraft,
  currentConsent,
  firstNameOf,
  portalLink,
  present,
  templateReadiness,
  nextTextTime,
  releaseAutomation,
  releaseDraft,
  STAFF_REPLY_MESSAGE_KEY,
  textWindowFor,
  type FailureItem,
  type RecordCheck,
  type ReleaseFailureItem,
  type ReleaseValues,
} from '../notifications/index.js'
import { ensureConversation, resolveCustomerReplied, touchConversation } from './conversations.js'
import {
  PROJECT_CONVERSATION,
  PROJECT_PARAMS,
  REPLY_BODY,
  REPLY_MAX_LENGTH,
  REPLY_OPTIONS,
  REPLY_RESULT,
  type CHANNEL_REASONS,
  type REPLY_CHANNELS,
} from './schemas.js'

export type ReplyChannel = (typeof REPLY_CHANNELS)[number]
export type ChannelReason = (typeof CHANNEL_REASONS)[number]
export type ChannelOption = {
  channel: ReplyChannel
  destination: string
  preferred: boolean
  available: boolean
  reason: ChannelReason
}
export type ReplyContact = {
  id: string
  name: string
  email: string
  phone: string
  preferred: 'email' | 'text' | 'call'
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TEST = 'test/integration/replies.test.ts'
const subjectKeyOf = (messageId: string) => `reply:${messageId}`

/** The contact a project's replies go to: its request's contact, else the customer's primary contact. */
export async function replyContact(db: Db | Tx, projectId: string): Promise<ReplyContact | null> {
  const select = [
    'c.id',
    'c.full_name',
    'c.email',
    'c.phone_e164',
    'c.preferred_channel',
    'c.email_verification',
    'c.email_verified_value',
    'c.phone_verification',
    'c.phone_verified_value',
  ] as const
  const byRequest = await db
    .selectFrom('intake.requests as r')
    .innerJoin('crm.contacts as c', 'c.id', 'r.contact_id')
    .select(select)
    .where('r.project_id', '=', projectId)
    .orderBy('r.submitted_at')
    .limit(1)
    .executeTakeFirst()
  const c =
    byRequest ??
    (await db
      .selectFrom('crm.projects as p')
      .innerJoin('crm.contacts as c', 'c.customer_id', 'p.customer_id')
      .select(select)
      .where('p.id', '=', projectId)
      .where('c.is_primary', '=', true)
      .limit(1)
      .executeTakeFirst())
  if (!c) return null
  return {
    id: c.id,
    name: c.full_name,
    email: c.email,
    phone: c.phone_e164,
    preferred: c.preferred_channel as ReplyContact['preferred'],
  }
}

/** Whether each channel may carry a reply to this contact now (HH-COM-08, HH-COM-05). */
export async function channelOptions(db: Db | Tx, contactId: string): Promise<ChannelOption[]> {
  const c = await db
    .selectFrom('crm.contacts')
    .select([
      'email',
      'phone_e164',
      'preferred_channel',
      'email_verification',
      'email_verified_value',
      'phone_verification',
      'phone_verified_value',
    ])
    .where('id', '=', contactId)
    .executeTakeFirstOrThrow()
  const email = c.email.trim().toLowerCase()
  const emailVerified = c.email_verification === 'verified' && c.email_verified_value === email
  const service = await currentConsent(db, 'email', email, 'service_communication')
  const emailReason: ChannelReason = service === 'withdrawn' ? 'opted_out' : emailVerified ? 'available' : 'unverified'
  const phoneVerified = c.phone_verification === 'verified' && c.phone_verified_value === c.phone_e164
  const sms = await currentConsent(db, 'sms', c.phone_e164, 'transactional_sms')
  const smsReason: ChannelReason =
    sms === 'withdrawn' ? 'opted_out' : sms !== 'granted' ? 'no_opt_in' : phoneVerified ? 'available' : 'unverified'
  return [
    {
      channel: 'email',
      destination: email,
      preferred: c.preferred_channel === 'email',
      available: emailReason === 'available',
      reason: emailReason,
    },
    {
      channel: 'sms',
      destination: c.phone_e164,
      preferred: c.preferred_channel === 'text',
      available: smsReason === 'available',
      reason: smsReason,
    },
  ]
}

/** The channel Send uses without a choice: the preferred one while available; otherwise staff choose (null). */
export function defaultChannel(options: readonly ChannelOption[]): ReplyChannel | null {
  return options.find((o) => o.preferred && o.available)?.channel ?? null
}

/**
 * Whether `channel` may carry this reply: available, and the preferred channel unless that one is unavailable
 * (OWN-DEC-120: never a silent switch). Returns the refusal code, or null.
 */
export function channelRefusal(options: readonly ChannelOption[], channel: ReplyChannel): string | null {
  const chosen = options.find((o) => o.channel === channel)
  if (!options.some((o) => o.available)) return 'NO_PERMITTED_CHANNEL'
  if (!chosen?.available) return 'CHANNEL_UNAVAILABLE'
  const preferred = defaultChannel(options)
  if (preferred && preferred !== channel) return 'PREFERRED_CHANNEL_AVAILABLE'
  return null
}

/** When a text sent now would go out (TSK-0122, HH-COM-15). */
export type TextHoursState = {
  state: 'open' | 'closed' | 'not_configured'
  open: string | null
  close: string | null
  zone: string | null
  /** The recipient's own verified zone, or the unknown-zone fallback window. */
  basis: 'recipient_zone' | 'unknown_zone_fallback' | null
  sendAt: Date
}

/**
 * How a reply sent at `now` is delivered (OWN-DEC-154): the email at once, at any hour; the text inside the
 * recipient's permitted hours, or at their next opening. While the rule or the hours are NOT CONFIGURED a text is not
 * sent at all (the send records why), and the composer says so.
 */
export async function replyDeliveryHours(
  db: Db | Tx,
  config: Config,
  contactId: string | null,
  now: Date,
): Promise<{ email: { sendAt: Date }; text: TextHoursState }> {
  const window = await textWindowFor(db, { kind: 'customer_contact', id: contactId }, config)
  if (!window)
    return {
      email: { sendAt: now },
      text: { state: 'not_configured', open: null, close: null, zone: null, basis: null, sendAt: now },
    }
  const at = nextTextTime(now, window)
  return {
    email: { sendAt: now },
    text: {
      state: at.getTime() === now.getTime() ? 'open' : 'closed',
      open: window.open,
      close: window.close,
      zone: window.zone,
      basis: window.basis,
      sendAt: at,
    },
  }
}

export type SentReply = {
  id: string
  conversationId: string
  deliveryId: string
  channel: ReplyChannel
  sendAt: Date
  /** TSK-0122: the text waits for the recipient's permitted hours. */
  heldForTextHours: boolean
}

export class ReplyError extends Error {
  override name = 'ReplyError'
  constructor(readonly code: string) {
    super(code)
  }
}

/**
 * Sends one staff reply (Send is the release): the project message, its staff.reply delivery and the release job, in
 * the caller's transaction. Throws ReplyError with the refusal code when the reply cannot be sent.
 */
export async function sendReply(
  tx: Tx,
  input: {
    projectId: string
    staff: { id: string; roles: StaffActor['roles'] }
    text: string
    channel: ReplyChannel
    now: Date
    requestId: string
    /** The `notify.release` declaration the job is scheduled for (its senders are the worker's). */
    release: Automation
    config?: Config
  },
): Promise<SentReply> {
  const text = input.text.trim()
  if (!text) throw new ReplyError('empty')
  if (text.length > REPLY_MAX_LENGTH) throw new ReplyError('too_long')
  if (looksLikeCardNumber(text)) throw new ReplyError('card_number')
  const contact = await replyContact(tx, input.projectId)
  if (!contact) throw new ReplyError('NO_CONTACT')
  // The contact row is locked so a verification or consent change cannot slip between the check and the release.
  await tx.selectFrom('crm.contacts').select('id').where('id', '=', contact.id).forUpdate().execute()
  const options = await channelOptions(tx, contact.id)
  const refusal = channelRefusal(options, input.channel)
  if (refusal) throw new ReplyError(refusal)
  const destination = (options.find((o) => o.channel === input.channel) as ChannelOption).destination
  const config = input.config ?? (await loadConfig(tx))
  const conversationId = await ensureConversation(tx, input.projectId, 'customer')
  const chosen = options.find((o) => o.channel === input.channel) as ChannelOption
  // The message's id is chosen first: the delivery's subject names it, and the message records its delivery.
  const messageId = randomUUID()
  const draft = await createDraft(tx, {
    config,
    messageKey: STAFF_REPLY_MESSAGE_KEY,
    destination: { channel: input.channel, destination, permission: chosen.preferred ? 'preferred' : 'permitted' },
    recipient: { kind: 'customer_contact', id: contact.id, destinations: [] },
    subjectKey: subjectKeyOf(messageId),
    // About the project: a successful send stops the first-response clock of its request (TSK-0043).
    record: { type: 'project', id: input.projectId },
    values: { replyText: text },
    projectId: input.projectId,
  })
  await tx
    .insertInto('comms.messages')
    .values({
      id: messageId,
      direction: 'outbound',
      channel: input.channel,
      to_addresses: [destination],
      // The text exactly as the staff member wrote it (immutable like every message).
      body_text: text,
      body_state: 'received',
      received_at: input.now,
      author_staff_id: input.staff.id,
      link_state: 'matched',
      match_rule: 'staff',
      project_id: input.projectId,
      customer_id: sql<string>`(SELECT customer_id FROM crm.projects WHERE id = ${input.projectId})`,
      conversation_id: conversationId,
      contact_id: contact.id,
      delivery_id: draft.id,
    })
    .execute()
  const { runAt } = await releaseDraft(tx, {
    config,
    deliveryId: draft.id,
    actor: { kind: 'staff', id: input.staff.id, roles: input.staff.roles },
    automation: input.release,
    requestId: input.requestId,
    now: input.now,
  })
  await touchConversation(tx, conversationId, input.now, false)
  // PROPOSED: answering the customer handles their waiting replies.
  const handled = await resolveCustomerReplied(tx, conversationId)
  if (handled)
    await tx
      .updateTable('comms.conversations')
      .set({ handled_at: input.now, handled_by: input.staff.id })
      .where('id', '=', conversationId)
      .execute()
  return {
    id: messageId,
    conversationId,
    deliveryId: draft.id,
    channel: input.channel,
    sendAt: runAt,
    heldForTextHours: runAt.getTime() > input.now.getTime(),
  }
}

/**
 * The send-time recheck of a staff reply (HH-COM-05): the reply goes only to the address or number the contact still
 * has verified; a changed or unverified destination cancels it (record_changed). Consent is rechecked by the send.
 * Other message types of a project record are current here.
 */
export const replyRecordCheck: RecordCheck = async (tx, input) => {
  if (input.messageKey !== STAFF_REPLY_MESSAGE_KEY) return 'current'
  const id = input.subjectKey.startsWith('reply:') ? input.subjectKey.slice('reply:'.length) : ''
  if (!UUID_RE.test(id)) return 'stale'
  const m = await tx
    .selectFrom('comms.messages as m')
    .innerJoin('crm.contacts as c', 'c.id', 'm.contact_id')
    .select([
      'm.channel',
      'm.to_addresses',
      'c.email_verification',
      'c.email_verified_value',
      'c.email',
      'c.phone_verification',
      'c.phone_verified_value',
      'c.phone_e164',
    ])
    .where('m.id', '=', id)
    .where('m.direction', '=', 'outbound')
    .executeTakeFirst()
  if (!m) return 'stale'
  const to = m.to_addresses[0]
  const ok =
    m.channel === 'email'
      ? m.email_verification === 'verified' && m.email_verified_value === to && m.email.trim().toLowerCase() === to
      : m.phone_verification === 'verified' && m.phone_verified_value === to && m.phone_e164 === to
  return ok ? 'current' : 'stale'
}

/**
 * TSK-0120 (OWN-DEC-151 staff_reply_wrapper, OWN-DEC-154, OWN-DEC-158): the reply email's values at send time, read
 * from the reply itself: the customer's first name ("Hi there," without one), the project reference, the display name
 * of the staff member who pressed Send, the text exactly as written and the project's portal page (where the customer
 * reads and answers it). Other message types get nothing here.
 */
export function replyValues(publicSiteUrl: string | undefined): ReleaseValues {
  return async (tx, row) => {
    if (row.message_key !== STAFF_REPLY_MESSAGE_KEY) return undefined
    const id = row.subject_key.startsWith('reply:') ? row.subject_key.slice('reply:'.length) : ''
    if (!UUID_RE.test(id)) return {}
    const m = await tx
      .selectFrom('comms.messages as m')
      .innerJoin('crm.projects as p', 'p.id', 'm.project_id')
      .leftJoin('crm.contacts as c', 'c.id', 'm.contact_id')
      .leftJoin('identity.staff_users as u', 'u.id', 'm.author_staff_id')
      .select(['m.body_text', 'p.reference', 'c.full_name', 'u.display_name'])
      .where('m.id', '=', id)
      .where('m.direction', '=', 'outbound')
      .executeTakeFirst()
    if (!m) return {}
    return present({
      customerName: firstNameOf(m.full_name),
      reference: m.reference,
      staffDisplayName: m.display_name,
      staffMessage: m.body_text,
      projectLink: portalLink(publicSiteUrl, m.reference),
    })
  }
}

/** A failed reply opens a delivery issue on its project, owned by the project's responsible staff member. */
export const replyFailureItem: ReleaseFailureItem = async (tx, row): Promise<FailureItem | undefined> => {
  if (row.message_key !== STAFF_REPLY_MESSAGE_KEY || !row.project_id) return undefined
  const p = await tx
    .selectFrom('crm.projects')
    .select(['reference', 'responsible_staff_id'])
    .where('id', '=', row.project_id)
    .executeTakeFirst()
  if (!p) return undefined
  const owner = p.responsible_staff_id && UUID_RE.test(p.responsible_staff_id) ? p.responsible_staff_id : null
  return { reference: p.reference, projectId: row.project_id, assignedStaffId: owner }
}

export type ReplyDeps = {
  /** The clock (tests). Default: the real time. */
  now?: () => Date
}

function staffActor(ctx: ApiContext): StaffActor {
  if (ctx.actor.kind !== 'staff') throw new ApiError('FORBIDDEN')
  return ctx.actor
}

const projectResource: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { projectId } = req.params as { projectId: string }
  if (!UUID_RE.test(projectId)) return null
  const row = await db.selectFrom('crm.projects').select('id').where('id', '=', projectId).executeTakeFirst()
  return row ? { projectId: row.id } : null
}

async function projectInCallerScope(ctx: ApiContext, db: Db | Tx, projectId: string) {
  const p = await db
    .selectFrom('crm.projects as p')
    .innerJoin('crm.customers as cu', 'cu.id', 'p.customer_id')
    .select(['p.id', 'p.reference', 'p.state', 'cu.id as customer_id', 'cu.display_name'])
    .where('p.id', '=', projectId)
    .where(projectInScope('p.id', ctx.scope))
    .executeTakeFirst()
  if (!p) throw new ApiError('NOT_FOUND')
  return p
}

const readRoute = {
  actors: ['staff'],
  permission: 'message.reply',
  kind: 'read',
  idempotency: 'none',
  expectedVersion: 'none',
  rateLimit: 'none',
  audit: 'none',
  pagination: false,
  test: TEST,
  resource: projectResource,
} as const

const conflict = (code: string) => new ApiError('CONFLICT', { fieldErrors: [{ field: 'channel', code, message: '' }] })
const invalid = (field: string, code: string) =>
  new ApiError('VALIDATION_FAILED', { fieldErrors: [{ field, code, message: '' }] })

export function replyRoutes(deps: ReplyDeps = {}): RouteDef[] {
  const now = deps.now ?? (() => new Date())
  // Scheduling needs only the declaration; the worker's own instance (automations.ts) sends.
  const release = releaseAutomation({ email: null, sms: null })

  const projectConversation: RouteDef = {
    ...readRoute,
    method: 'GET',
    path: '/staff/inbox/projects/:projectId/conversation',
    operationId: 'getProjectConversation',
    summary: 'The customer conversation of a project',
    description:
      'Staff with message.reply on the project, inside the caller’s scope (otherwise NOT_FOUND). The project, its ' +
      'customer and the id of its customer conversation, or null while no message has been received or sent yet: ' +
      'the reply composer of the project starts it with the first reply. Nothing is created by this read.',
    schema: { params: PROJECT_PARAMS, response: { 200: PROJECT_CONVERSATION } },
    handler: async (ctx) => {
      const { projectId } = ctx.req.params as { projectId: string }
      const p = await projectInCallerScope(ctx, ctx.db, projectId)
      const cv = await ctx.db
        .selectFrom('comms.conversations')
        .select('id')
        .where('project_id', '=', p.id)
        .where('audience', '=', 'customer')
        .executeTakeFirst()
      return {
        body: {
          conversationId: cv?.id ?? null,
          project: { id: p.id, reference: p.reference, state: p.state },
          customer: { id: p.customer_id, displayName: p.display_name },
        },
      }
    },
  }

  const options: RouteDef = {
    ...readRoute,
    method: 'GET',
    path: '/staff/inbox/projects/:projectId/reply-options',
    operationId: 'getReplyOptions',
    summary: 'How a reply on this project can be sent',
    description:
      'Staff with message.reply on the project, inside the caller’s scope (otherwise NOT_FOUND). The contact a reply ' +
      'goes to (the contact of the project’s request), the customer’s preferred channel, and for email and text ' +
      'whether each is permitted now (email: the address verified and service messages not withdrawn; text: the ' +
      'number verified and a current SMS opt-in, which a STOP withdraws), the channel Send uses without a choice ' +
      '(the preferred one while it is permitted; null: staff choose among the permitted ones, never switched ' +
      'silently), when a reply sent now goes out by each channel (TSK-0122: the email at once, at any hour; the text ' +
      'inside the recipient’s permitted hours, 8 AM–10 PM in their verified zone or 9 AM–9 PM Eastern while it is ' +
      'unknown, otherwise at their next opening), whether released reply wording exists per channel, and the longest ' +
      'reply.',
    schema: { params: PROJECT_PARAMS, response: { 200: REPLY_OPTIONS } },
    handler: async (ctx) => {
      const { projectId } = ctx.req.params as { projectId: string }
      const p = await projectInCallerScope(ctx, ctx.db, projectId)
      const contact = await replyContact(ctx.db, p.id)
      const opts = contact ? await channelOptions(ctx.db, contact.id) : []
      const config = await loadConfig(ctx.db)
      const hours = await replyDeliveryHours(ctx.db, config, contact?.id ?? null, now())
      const template = async (channel: ReplyChannel) =>
        // TSK-0119: configured only when the released wording's values are supplied (templateReadiness).
        (await templateReadiness(ctx.db, STAFF_REPLY_MESSAGE_KEY, channel, 'en')).state === 'ready'
          ? 'configured'
          : 'not_configured'
      return {
        body: {
          contact: contact ? { id: contact.id, name: contact.name } : null,
          preferred: contact?.preferred ?? 'call',
          options: opts,
          defaultChannel: defaultChannel(opts),
          deliveryHours: {
            email: { sendAt: hours.email.sendAt.toISOString() },
            text: { ...hours.text, sendAt: hours.text.sendAt.toISOString() },
          },
          templates: { email: await template('email'), sms: await template('sms') },
          maxLength: REPLY_MAX_LENGTH,
        },
      }
    },
  }

  const send: RouteDef = {
    method: 'POST',
    path: '/staff/inbox/projects/:projectId/replies',
    operationId: 'sendStaffReply',
    summary: 'Send a reply to the customer from the project',
    description:
      'Staff with message.reply on the project, inside the caller’s scope (otherwise NOT_FOUND). Pressing Send is ' +
      'the release; there is no second approval (OWN-DEC-120). The reply is added to the project’s customer ' +
      'conversation exactly as written (the customer reads it in the portal’s Messages tab) and its one email or ' +
      'text is released through the chosen channel: the preferred channel while it is permitted, otherwise one of the ' +
      'permitted channels staff chose (CONFLICT PREFERRED_CHANNEL_AVAILABLE, CHANNEL_UNAVAILABLE or ' +
      'NO_PERMITTED_CHANNEL otherwise; never switched silently). An email goes at once, at any hour; a text inside the ' +
      'recipient’s permitted hours, otherwise at their next opening (messages.delivery_hours). The consent, the contact and the English ' +
      'template are rechecked at send time; the delivery records what truly happened, and a failure becomes a ' +
      'delivery issue with Retry. With the same Idempotency-Key a retried submission returns the first answer and ' +
      'sends nothing more. Card numbers are refused; never write passwords or access codes in a reply. The audit ' +
      'event records the project, channel and send time, never the text.',
    actors: ['staff'],
    permission: 'message.reply',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'inbox.reply_sent',
    pagination: false,
    test: TEST,
    resource: projectResource,
    schema: { params: PROJECT_PARAMS, body: REPLY_BODY, response: { 201: REPLY_RESULT } },
    handler: async (ctx) => {
      const staff = staffActor(ctx)
      const tx = ctx.tx as Tx
      const { projectId } = ctx.req.params as { projectId: string }
      const p = await projectInCallerScope(ctx, tx, projectId)
      const b = ctx.req.body as { body: string; channel: ReplyChannel }
      let sent: SentReply
      try {
        sent = await sendReply(tx, {
          projectId: p.id,
          staff: { id: staff.userId, roles: staff.roles },
          text: b.body,
          channel: b.channel,
          now: now(),
          requestId: ctx.req.id,
          release,
        })
      } catch (e) {
        if (!(e instanceof ReplyError)) throw e
        if (e.code === 'card_number' || e.code === 'empty' || e.code === 'too_long') throw invalid('body.body', e.code)
        throw conflict(e.code)
      }
      await ctx.audit({
        target: { type: 'staff_reply', id: sent.id },
        summary: {
          project: p.reference,
          channel: sent.channel,
          delivery: sent.deliveryId,
          sendAt: sent.sendAt.toISOString(),
          heldForTextHours: sent.heldForTextHours,
        },
      })
      return {
        status: 201,
        body: {
          id: sent.id,
          conversationId: sent.conversationId,
          delivery: {
            id: sent.deliveryId,
            channel: sent.channel,
            state: 'queued',
            sendAt: sent.sendAt.toISOString(),
            heldForTextHours: sent.heldForTextHours,
          },
        },
      }
    },
  }
  return [projectConversation, options, send]
}
