// Customer routes of questions and portal messages (TSK-0051; HH-LEAD-03, HH-LEAD-06, HH-PORT-09, HH-PORT-01,
// HH-SEC-05, HH-COM-02, T30, OWN-DEC-98, OWN-DEC-101, FACT-REOPEN-PERIOD, RULE-SERVER-AUTHZ, RULE-LANGUAGES).
//   GET  /customer/projects/:reference/questions                         the questions published in the project
//   POST /customer/projects/:reference/questions/:questionId/uploads     an upload capability for the reply's photos
//   POST /customer/projects/:reference/questions/:questionId/replies     the reply (text, "I'm not sure", photos)
//   POST /customer/projects/:reference/messages                          a message in the project's conversation
// - Every route is authorized by the policy (ROLE-MATRIX "Reply to a question": Customer V; "Reply from a project":
//   Customer "V project thread") and scoped by the session: another project, an unknown or a malformed reference or
//   question is the same NOT_FOUND. Answers are the allow-listed customer views of records/projections.ts.
// - The customer's text is kept exactly as written (never trimmed, rewritten or translated); card numbers are refused.
// - A reply answers its one question (other questions stay open, OWN-DEC-98) and stops its reminders at once (drafts
//   and released ones not yet sent are cancelled; a send-time recheck catches the rest). When it answers the last open
//   question of a request waiting on the customer, the request goes back to HandyHub's review. A reply to a "Closed—no
//   response" request within the reopen period reopens the same request (and its project) for review with its history;
//   nothing else is restored (no expired estimate or appointment). After the period it is refused
//   (REOPEN_PERIOD_ENDED): a new request is the way (FACT-REOPEN-PERIOD, PROPOSED handling).
// - The reply notifies staff: the request's "question replied" queue item (assigned to its responsible staff member)
//   and question.customer_replied for the automatic staff notification.
// - Photos: the reply's own upload capability (Upload-Capability header) and its uploaded photos, checked like
//   request photos (content, type, size, the request's photo count; HH-SEC-05); a failed upload never loses the draft
//   or the photos already received, which the browser keeps until the reply is sent.
// - Portal messages are text only (PROPOSED: no attachment is offered in the Messages tab) and need an open project;
//   each opens or refreshes the conversation's "customer replied" queue item.
import { apply, looksLikeCardNumber, type RequestState } from '@handyhub/domain'
import type { Tx } from '@handyhub/db'
import type { CustomerActor } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError } from '../../api/errors.js'
import type { ApiContext, RouteDef } from '../../api/route.js'
import { loadConfig } from '../../platform/config/index.js'
import { outbox } from '../../platform/outbox.js'
import { currentContext } from '../../platform/request-context.js'
import { projectIdOf } from '../access/projects.js'
import { stopProjectEstimateReminders } from '../estimates/reminders.js'
import { customerReplied, ensureConversation, touchConversation } from '../inbox/conversations.js'
import {
  bindReplyPhotos,
  CAPABILITY_HEADER,
  createCapability,
  photoLimits,
  PhotoError,
  ReplyPhotoError,
  resolveCapability,
} from '../photos/photos.js'
import { openQueueItem, syncEstimateItem, syncNewRequestItem } from '../queue/index.js'
import { refreshSeconds } from '../portal/overview.js'
import {
  findProject,
  PORTAL_MESSAGE_SENT,
  PROJECT_QUESTIONS,
  QUESTION_REPLY_RESULT,
  QUESTION_UPLOAD,
  type QuestionRecord,
} from '../records/index.js'
import { syncReviewHoldItem } from '../requests/holds.js'
import { REPLY_MAX_LENGTH, QUESTION_REPLIED, replyWindow, reopenPeriodDays, UUID_RE } from './model.js'
import { cancelOpenReminders, syncReminderItem } from './staff-routes.js'

const TEST = 'test/integration/questions.test.ts'
const REFERENCE = { type: 'string', minLength: 1, maxLength: 40 } as const
const QUESTION_ID = { type: 'string', pattern: '^[0-9a-fA-F-]{36}$' } as const
const PARAMS = {
  type: 'object',
  additionalProperties: false,
  required: ['reference'],
  properties: { reference: REFERENCE },
} as const
const QUESTION_PARAMS = {
  type: 'object',
  additionalProperties: false,
  required: ['reference', 'questionId'],
  properties: { reference: REFERENCE, questionId: QUESTION_ID },
} as const
const REPLY_BODY = {
  type: 'object',
  additionalProperties: false,
  properties: {
    text: { type: 'string', maxLength: REPLY_MAX_LENGTH },
    notSure: { type: 'boolean' },
    photoIds: { type: 'array', maxItems: 100, uniqueItems: true, items: QUESTION_ID },
  },
} as const
const MESSAGE_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['text'],
  properties: { text: { type: 'string', minLength: 1, maxLength: REPLY_MAX_LENGTH } },
} as const

/** PROPOSED (no owner value): 30 reply photo capabilities and 60 portal messages per client network per hour. */
export const REPLY_UPLOAD_RATE_LIMIT = { bucket: 'customer-reply-upload', limit: 30, windowSeconds: 3600 } as const
export const PORTAL_MESSAGE_RATE_LIMIT = { bucket: 'customer-portal-message', limit: 60, windowSeconds: 3600 } as const

const projectResource: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const id = await projectIdOf(db, (req.params as { reference: string }).reference)
  return id ? { projectId: id } : null
}

function customer(ctx: ApiContext): CustomerActor {
  if (ctx.actor.kind !== 'customer') throw new ApiError('NOT_FOUND')
  return ctx.actor
}
const invalid = (field: string, code: string) =>
  new ApiError('VALIDATION_FAILED', { fieldErrors: [{ field, code, message: '' }] })
const conflict = (code: string) => new ApiError('CONFLICT', { fieldErrors: [{ field: 'state', code, message: '' }] })
const correlation = (ctx: ApiContext) => currentContext()?.requestId ?? ctx.req.id

/** The project of the reference in the caller's scope, with its request; NOT_FOUND otherwise. */
async function scopedRequest(ctx: ApiContext, db: ApiContext['db'] | Tx, lock = false) {
  const project = await findProject(db, ctx.scope, { reference: (ctx.req.params as { reference: string }).reference })
  if (!project) throw new ApiError('NOT_FOUND')
  let q = db
    .selectFrom('intake.requests')
    .select(['id', 'reference', 'state', 'state_version', 'project_id', 'responsible_staff_id'])
    .where('project_id', '=', project.id)
    .orderBy('submitted_at')
    .limit(1)
  if (lock) q = q.forUpdate()
  const request = await q.executeTakeFirst()
  if (!request) throw new ApiError('NOT_FOUND')
  return { project, request }
}

const writeRoute = {
  method: 'POST',
  actors: ['customer'],
  kind: 'write',
  expectedVersion: 'none',
  pagination: false,
  test: TEST,
  resource: projectResource,
} as const

export function questionCustomerRoutes(deps: { now?: () => Date } = {}): RouteDef[] {
  const now = deps.now ?? (() => new Date())

  const list: RouteDef = {
    method: 'GET',
    path: '/customer/projects/:reference/questions',
    operationId: 'listCustomerQuestions',
    summary: 'Questions from HandyHub',
    description:
      'The questions HandyHub published in a project the caller’s session opens (HH-LEAD-03), oldest first: each ' +
      'text exactly as staff wrote it, whether it is a measurement (a reply may say "I’m not sure"), when it was ' +
      'asked, whether it waits on the customer and whether a reply can be sent now, and the customer’s own reply ' +
      '(text as written, "I’m not sure", attached photos counted by state). replyWindow says whether replies are ' +
      'open, reopen a "Closed—no response" request (until reopenUntil), or are no longer possible. Never an author, ' +
      'a delivery or a reminder. Authorized by request.reply (ROLE-MATRIX "Reply to a question"). Any other project, ' +
      'an unknown or a malformed reference is the same NOT_FOUND (T19).',
    actors: ['customer'],
    permission: 'request.reply',
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'none',
    pagination: false,
    test: TEST,
    resource: projectResource,
    projection: PROJECT_QUESTIONS,
    schema: { params: PARAMS, response: { 200: PROJECT_QUESTIONS.schema } },
    handler: async (ctx) => {
      customer(ctx)
      const t = now()
      const { project, request } = await scopedRequest(ctx, ctx.db)
      const config = await loadConfig(ctx.db)
      const w = await replyWindow(ctx.db, request, config, t)
      const rows = await ctx.db
        .selectFrom('intake.questions as q')
        .leftJoin('intake.question_replies as r', 'r.question_id', 'q.id')
        .select([
          'q.id',
          'q.kind',
          'q.body',
          'q.published_at',
          'q.state',
          'r.id as reply_id',
          'r.body as reply_body',
          'r.not_sure',
          'r.created_at as replied_at',
        ])
        .where('q.project_id', '=', project.id)
        .where('q.request_id', '=', request.id)
        .orderBy('q.published_at')
        .orderBy('q.id')
        .execute()
      const replyIds = rows.flatMap((r) => (r.reply_id ? [r.reply_id] : []))
      const photos = replyIds.length
        ? await ctx.db
            .selectFrom('intake.question_reply_photos as rp')
            .innerJoin('intake.photos as p', 'p.id', 'rp.photo_id')
            .select(['rp.reply_id', 'p.state'])
            .where('rp.reply_id', 'in', replyIds)
            .where('p.state', '<>', 'removed')
            .execute()
        : []
      const questions: QuestionRecord[] = rows.map((r) => {
        const mine = photos.filter((p) => p.reply_id === r.reply_id)
        return {
          id: r.id,
          kind: r.kind as QuestionRecord['kind'],
          text: r.body,
          askedAt: r.published_at,
          state: r.state === 'answered' ? 'answered' : 'waiting',
          canReply: r.state === 'published' && (w.window === 'open' || w.window === 'reopen'),
          reply:
            r.reply_id && r.replied_at
              ? {
                  text: r.reply_body,
                  notSure: Boolean(r.not_sure),
                  at: r.replied_at,
                  photos: {
                    received: mine.filter((p) => p.state === 'ready').length,
                    processing: mine.filter((p) => p.state === 'quarantined').length,
                    failed: mine.filter((p) => p.state === 'rejected').length,
                  },
                }
              : null,
        }
      })
      return {
        body: PROJECT_QUESTIONS.project({
          reference: project.reference,
          refreshedAt: t,
          refreshSeconds: await refreshSeconds(ctx.db),
          questions,
          replyWindow: w.window,
          reopenUntil: w.window === 'reopen' ? w.until : null,
          maxLength: REPLY_MAX_LENGTH,
        }),
      }
    },
  }

  /** The open question of the caller's project, locked with its request; NOT_FOUND or a CONFLICT otherwise. */
  async function openQuestion(ctx: ApiContext, tx: Tx) {
    const { project, request } = await scopedRequest(ctx, tx, true)
    const { questionId } = ctx.req.params as { questionId: string }
    if (!UUID_RE.test(questionId)) throw new ApiError('NOT_FOUND')
    const q = await tx
      .selectFrom('intake.questions')
      .select(['id', 'kind', 'state', 'request_id'])
      .where('id', '=', questionId.toLowerCase())
      .where('project_id', '=', project.id)
      .where('request_id', '=', request.id)
      .forUpdate()
      .executeTakeFirst()
    if (!q) throw new ApiError('NOT_FOUND')
    if (q.state !== 'published') throw conflict('ALREADY_ANSWERED')
    const config = await loadConfig(tx)
    const w = await replyWindow(tx, request, config, now())
    if (w.window === 'period_ended') throw conflict('REOPEN_PERIOD_ENDED')
    if (w.window === 'closed') throw conflict('REQUEST_CLOSED')
    return { project, request, question: q, window: w, config }
  }

  const uploads: RouteDef = {
    ...writeRoute,
    path: '/customer/projects/:reference/questions/:questionId/uploads',
    operationId: 'createQuestionReplyUpload',
    summary: 'Start the photos of a reply',
    description:
      'For the verified customer of the project (request.reply), while the question can be answered: a new upload ' +
      'capability for this one reply’s photos, valid for the configured draft period (session.timings' +
      '.requestDraftDays), with the photo limits (uploads.limits). The token is returned once; the server keeps only ' +
      'its hash. Photos are then sent to the photo upload route under the Upload-Capability header and checked like ' +
      'request photos (content, type, size, and the request’s total photo count, HH-SEC-05); they reach nothing until ' +
      'the reply is sent. UNAVAILABLE while the limits or storage are NOT CONFIGURED. CONFLICT ALREADY_ANSWERED, ' +
      'REQUEST_CLOSED or REOPEN_PERIOD_ENDED.',
    permission: 'request.reply',
    idempotency: 'none',
    rateLimit: REPLY_UPLOAD_RATE_LIMIT,
    audit: 'question.reply_upload_start',
    projection: QUESTION_UPLOAD,
    schema: { params: QUESTION_PARAMS, response: { 201: QUESTION_UPLOAD.schema } },
    handler: async (ctx) => {
      customer(ctx)
      const tx = ctx.tx as Tx
      const { request, question, config } = await openQuestion(ctx, tx)
      const limits = photoLimits(config)
      if (!limits) throw new ApiError('UNAVAILABLE')
      let created: Awaited<ReturnType<typeof createCapability>>
      try {
        // The capability's lifetime is technical (real time), like a request draft's.
        created = await createCapability(tx, { scope: 'reply', requestId: request.id, questionId: question.id })
      } catch (e) {
        if (e instanceof PhotoError) throw new ApiError('UNAVAILABLE')
        throw e
      }
      await ctx.audit({
        target: { type: 'upload_capability', id: created.capability.id },
        summary: { questionId: question.id },
      })
      return {
        status: 201,
        body: QUESTION_UPLOAD.project({ capability: created.token, expiresAt: created.capability.expiresAt, limits }),
      }
    },
  }

  const reply: RouteDef = {
    ...writeRoute,
    path: '/customer/projects/:reference/questions/:questionId/replies',
    operationId: 'replyToQuestion',
    summary: 'Reply to a question',
    description:
      'For the verified customer of the project (request.reply). The reply to one open question: text exactly as ' +
      'written, "I’m not sure" (measurement questions only), and the photos uploaded under this reply’s capability ' +
      '(Upload-Capability header; received or still processing; a rejected or unknown photo is refused). At least ' +
      'one of them. Card numbers are refused. The question is answered and its reminders stop; other questions stay ' +
      'open. The last open question answered moves a request waiting on the customer back to HandyHub’s review; a ' +
      '"Closed—no response" request within the reopen period (request.reopen_period) is reopened, keeping its ' +
      'history and restoring nothing else. The responsible staff member is notified (queue item and automatic staff ' +
      'notification). With the same Idempotency-Key a retried reply returns the first answer and records nothing more. ' +
      'CONFLICT ALREADY_ANSWERED, REQUEST_CLOSED, REOPEN_PERIOD_ENDED. The audit event never holds the text.',
    permission: 'request.reply',
    idempotency: 'required',
    rateLimit: 'none',
    audit: 'question.reply',
    projection: QUESTION_REPLY_RESULT,
    schema: { params: QUESTION_PARAMS, body: REPLY_BODY, response: { 201: QUESTION_REPLY_RESULT.schema } },
    handler: async (ctx) => {
      const actor = customer(ctx)
      const tx = ctx.tx as Tx
      const b = (ctx.req.body ?? {}) as { text?: string; notSure?: boolean; photoIds?: string[] }
      // Kept exactly as written; a reply of only spaces says nothing.
      const text = b.text !== undefined && b.text.trim() !== '' ? b.text : null
      if (text !== null && looksLikeCardNumber(text)) throw invalid('body.text', 'sensitive_content')
      const photoIds = (b.photoIds ?? []).map((p) => p.toLowerCase())
      if (text === null && !b.notSure && photoIds.length === 0) throw invalid('body', 'empty')
      const { project, request, question, window, config } = await openQuestion(ctx, tx)
      if (b.notSure && question.kind !== 'measurement') throw invalid('body.notSure', 'not_a_measurement')
      // The author is the session's verified contact, and it must be a contact of the project's customer.
      const contact = await tx
        .selectFrom('crm.contacts as c')
        .innerJoin('crm.projects as p', 'p.customer_id', 'c.customer_id')
        .select('c.id')
        .where('c.id', '=', actor.contactId)
        .where('p.id', '=', project.id)
        .executeTakeFirst()
      if (!contact) throw new ApiError('NOT_FOUND')
      let bound: string[] = []
      if (photoIds.length) {
        const cap = await resolveCapability(tx, ctx.req.headers[CAPABILITY_HEADER])
        if (!cap || cap.scope !== 'reply' || cap.questionId !== question.id)
          throw invalid('body.photoIds', 'unknown_photo')
        try {
          bound = await bindReplyPhotos(tx, { cap, photoIds, requestId: request.id, projectId: project.id })
        } catch (e) {
          if (e instanceof ReplyPhotoError) throw invalid('body.photoIds', e.problem)
          throw e
        }
      }
      const at = now()
      let state = request.state as RequestState
      let version = request.state_version
      let reopened = false
      if (window.window === 'reopen') {
        const moved = apply({ machine: 'request.lifecycle', state, version }, 'reopen_by_reply', {
          actor: 'customer',
          expectedVersion: version,
          now: at,
          facts: {
            ...(window.closedAt ? { closedAt: window.closedAt } : {}),
            customerReplyAt: at,
            ...(reopenPeriodDays(config) !== null ? { reopenPeriodDays: reopenPeriodDays(config) as number } : {}),
          },
        })
        if (!moved.ok)
          throw conflict(moved.problems[0]?.code === 'PERIOD_ENDED' ? 'REOPEN_PERIOD_ENDED' : 'REQUEST_CLOSED')
        const p = await tx
          .selectFrom('crm.projects')
          .select(['state', 'state_version'])
          .where('id', '=', project.id)
          .forUpdate()
          .executeTakeFirstOrThrow()
        const reopen = apply(
          { machine: 'project.lifecycle', state: p.state as never, version: p.state_version },
          'reopen',
          {
            actor: 'system',
            expectedVersion: p.state_version,
            now: at,
            facts: { requestState: moved.to },
          },
        )
        if (!reopen.ok) throw conflict('REQUEST_CLOSED')
        await tx
          .updateTable('crm.projects')
          .set({ state: reopen.to, state_version: reopen.version })
          .where('id', '=', project.id)
          .execute()
        state = moved.to
        version = moved.version
        reopened = true
      }
      const r = await tx
        .insertInto('intake.question_replies')
        .values({
          question_id: question.id,
          request_id: request.id,
          project_id: project.id,
          author_contact_id: contact.id,
          // Exactly as the customer wrote it.
          body: text,
          not_sure: Boolean(b.notSure),
          reopened_request: reopened,
          created_at: at,
        })
        .returning('id')
        .executeTakeFirstOrThrow()
      for (const [i, photoId] of bound.entries())
        await tx
          .insertInto('intake.question_reply_photos')
          .values({ reply_id: r.id, photo_id: photoId, position: i + 1 })
          .execute()
      await tx
        .updateTable('intake.questions')
        .set({ state: 'answered', answered_at: at, version: sql<number>`version + 1` })
        .where('id', '=', question.id)
        .execute()
      // Reminders stop immediately (OWN-DEC-101).
      await cancelOpenReminders(tx, { questionId: question.id })
      // TSK-0060 (HH-EST-14): a reply to a question is a customer response: the project's waiting estimate reminder
      // drafts stop with it.
      await stopProjectEstimateReminders(tx, project.id)
      const stillOpen = await tx
        .selectFrom('intake.questions')
        .select('id')
        .where('request_id', '=', request.id)
        .where('state', '=', 'published')
        .limit(1)
        .executeTakeFirst()
      if (!reopened && state === 'needs_information' && !stillOpen) {
        const moved = apply({ machine: 'request.lifecycle', state, version }, 'customer_replied', {
          actor: 'customer',
          expectedVersion: version,
          now: at,
          facts: {},
        })
        if (moved.ok) {
          state = moved.to
          version = moved.version
        }
      }
      if (state !== request.state || version !== request.state_version)
        await tx
          .updateTable('intake.requests')
          .set({ state, state_version: version })
          .where('id', '=', request.id)
          .execute()
      const responsible =
        request.responsible_staff_id && UUID_RE.test(request.responsible_staff_id) ? request.responsible_staff_id : null
      await openQueueItem(tx, {
        type: 'question_replied',
        subjectId: request.id,
        reason: reopened ? 'reopened_by_reply' : 'question_replied',
        projectId: project.id,
        reference: request.reference,
        status: state,
        assignedStaffId: responsible,
        openedAt: at,
      })
      await syncReminderItem(tx, request.id)
      await syncNewRequestItem(tx, request.id)
      await syncReviewHoldItem(tx, request.id)
      await syncEstimateItem(tx, request.id)
      await outbox.add(tx, {
        type: QUESTION_REPLIED,
        aggregate: { type: 'question_reply', id: r.id },
        payload: { replyId: r.id, questionId: question.id, requestId: request.id, projectId: project.id },
        idempotencyKey: `${QUESTION_REPLIED}:${r.id}`,
        requestId: correlation(ctx),
      })
      await ctx.audit({
        target: { type: 'question', id: question.id },
        summary: {
          reply: r.id,
          text: text !== null,
          notSure: Boolean(b.notSure),
          photos: bound.length,
          reopened,
          requestState: state,
        },
      })
      return {
        status: 201,
        body: QUESTION_REPLY_RESULT.project({ questionId: question.id, at, photos: bound.length, reopened }),
      }
    },
  }

  const message: RouteDef = {
    ...writeRoute,
    path: '/customer/projects/:reference/messages',
    operationId: 'sendPortalMessage',
    summary: 'Write to HandyHub in the project',
    description:
      'For the verified customer of the project (message.reply, ROLE-MATRIX "V project thread"), while the project is ' +
      'open (CONFLICT PROJECT_CLOSED otherwise). The message is added to the project’s customer conversation exactly ' +
      'as written (HH-PORT-09), from the session’s verified contact; staff see it in the unified inbox, where the ' +
      'conversation’s "customer replied" item opens or refreshes. Text only. Card numbers are refused. With the same ' +
      'Idempotency-Key a retried message returns the first answer and adds nothing. The audit event never holds the ' +
      'text.',
    permission: 'message.reply',
    idempotency: 'required',
    rateLimit: PORTAL_MESSAGE_RATE_LIMIT,
    audit: 'portal.message_sent',
    projection: PORTAL_MESSAGE_SENT,
    schema: { params: PARAMS, body: MESSAGE_BODY, response: { 201: PORTAL_MESSAGE_SENT.schema } },
    handler: async (ctx) => {
      const actor = customer(ctx)
      const tx = ctx.tx as Tx
      const { text } = ctx.req.body as { text: string }
      if (text.trim() === '') throw invalid('body.text', 'empty')
      if (looksLikeCardNumber(text)) throw invalid('body.text', 'sensitive_content')
      const project = await findProject(tx, ctx.scope, {
        reference: (ctx.req.params as { reference: string }).reference,
      })
      if (!project) throw new ApiError('NOT_FOUND')
      const p = await tx
        .selectFrom('crm.projects')
        .select(['id', 'state', 'customer_id'])
        .where('id', '=', project.id)
        .forUpdate()
        .executeTakeFirstOrThrow()
      if (p.state !== 'open' && p.state !== 'approved') throw conflict('PROJECT_CLOSED')
      const contact = await tx
        .selectFrom('crm.contacts')
        .select('id')
        .where('id', '=', actor.contactId)
        .where('customer_id', '=', p.customer_id)
        .executeTakeFirst()
      if (!contact) throw new ApiError('NOT_FOUND')
      const at = now()
      const conversationId = await ensureConversation(tx, p.id, 'customer')
      const m = await tx
        .insertInto('comms.messages')
        .values({
          direction: 'inbound',
          channel: 'portal',
          // Exactly as the customer wrote it (immutable like every message).
          body_text: text,
          body_state: 'received',
          received_at: at,
          link_state: 'matched',
          match_rule: 'portal_session',
          project_id: p.id,
          customer_id: p.customer_id,
          conversation_id: conversationId,
          contact_id: contact.id,
        })
        .returning('id')
        .executeTakeFirstOrThrow()
      await tx
        .insertInto('comms.message_links')
        .values({
          message_id: m.id,
          from_state: null,
          to_state: 'matched',
          to_project_id: p.id,
          rule: 'portal_session',
        })
        .execute()
      await touchConversation(tx, conversationId, at, true)
      await customerReplied(tx, conversationId, p.id, at)
      // TSK-0060 (HH-EST-14): a customer message stops the project's waiting estimate reminder drafts.
      await stopProjectEstimateReminders(tx, p.id)
      await ctx.audit({
        target: { type: 'inbound_message', id: m.id },
        summary: { project: project.reference, conversation: conversationId, channel: 'portal' },
      })
      return { status: 201, body: PORTAL_MESSAGE_SENT.project({ at }) }
    },
  }

  return [list, uploads, reply, message]
}
