// Staff routes of questions (TSK-0051; HH-LEAD-03, HH-LEAD-06, HH-COM-06, HH-COM-09, HH-STATE-01, HH-STATE-02, S02,
// C04, OWN-DEC-98, OWN-DEC-101, RULE-SERVER-AUTHZ).
//   GET  /staff/requests/:requestId/questions                                  the questions, replies and reminders
//   POST /staff/requests/:requestId/questions                                  publish a question (the release)
//   POST /staff/requests/:requestId/questions/replies-reviewed                 mark the customer's replies reviewed
//   POST /staff/requests/:requestId/actions/close-no-response                  "Closed—no response"
//   POST /staff/requests/:requestId/actions/reopen                             reopen it (TSK-0148)
// - Publishing is the staff release (OWN-DEC-98): in one transaction the question is kept exactly as written, the
//   request moves to "needs information" (from review, after a received request is moved to review; from a site
//   visit or ready-for-estimate request too), and question.published is recorded for the automatic notice. The
//   composer carries the hazard guard: staff confirm that the question never asks the customer to inspect a hazardous
//   area (a required confirmation beside the warning, OWN-DEC-192 E1). Card numbers are refused.
// - TSK-0121 (OWN-DEC-153): the one reminder of an unanswered question is automatic, 3 days after the notice was
//   delivered; nobody releases it (the release route of TSK-0051 is gone). Staff see it scheduled, sent, failed or
//   cancelled; an email goes at any hour and a text waits for the recipient's permitted hours (TSK-0122).
// - Closing "Closed—no response" (PROPOSED permission request.close_no_response, the request-handling row) is open only
//   while the request waits on the customer, 24 hours (configured) after the reminder of every unanswered question was
//   actually sent and while that send still stands (a failed reminder is a delivery issue for staff follow-up), and
//   never with accepted work, an appointment or money received (OWNER_REVIEW_REQUIRED; OWN-DEC-197 E4, OWN-DEC-208:
//   accepted, scheduled or paid work is never cancelled under this rule).
// - TSK-0148 (OWN-DEC-197 E2, E4, E5; OWN-DEC-208):
//   - E2: staff mark whether the customer may answer "I'm not sure" (notSureAllowed), for any question; a measurement
//     always allows it (PROPOSED).
//   - E4: the reminder counts only while one of its deliveries is sent or delivered, 24 hours (configured) after its
//     earliest such send; a queued or scheduled reminder never counts, however late it is (FINAL_REMINDER_NOT_SENT);
//     a reminder whose deliveries all failed is staff follow-up (REMINDER_FAILED, and the request's question_reminder
//     item "question_reminder_failed"); a customer response since the reminder, or one staff have not reviewed yet,
//     keeps the request open (CUSTOMER_REPLIED, PROPOSED reading).
//   - E5: POST /staff/requests/:requestId/actions/reopen: an authorized staff member (PROPOSED permission
//     request.reopen, the request-handling row) reopens a "Closed—no response" request for review with a written
//     reason, within the reopen period or after it; the history is kept and nothing else is restored.
import { apply, type RequestState } from '@handyhub/domain'
import { withTx, type Tx } from '@handyhub/db'
import { looksLikeCardNumber } from '@handyhub/domain'
import { decide, type Actor, type DataScope, type StaffActor } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError } from '../../api/errors.js'
import type { ApiContext, RouteDef } from '../../api/route.js'
import { loadConfig, type Config } from '../../platform/config/index.js'
import { projectInScope } from '../../platform/data-scope.js'
import { outbox } from '../../platform/outbox.js'
import { currentContext } from '../../platform/request-context.js'
import { openQueueItem, resolveQueueItem, syncEstimateItem, syncNewRequestItem } from '../queue/index.js'
import { syncReviewHoldItem } from '../requests/holds.js'
import { DEFAULT_OBLIGATION_CHECKS, obligationFacts, type ObligationCheck } from '../requests/obligations.js'
import {
  closedNoResponseAt,
  customerResponded,
  DAY_MS,
  HOUR_MS,
  isClosedState,
  noticeSubject,
  noticeTarget,
  QUESTION_KINDS,
  QUESTION_MAX_LENGTH,
  QUESTION_NOTICE,
  QUESTION_PUBLISHED,
  QUESTION_REMINDER,
  questionCadence,
  reminderStanding,
  reminderSubjects,
  reopenPeriodDays,
  UUID_RE,
  type QuestionKind,
} from './model.js'

const TEST = 'test/integration/questions.test.ts'
const UUID = {
  type: 'string',
  pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
}
const S = { type: 'string' } as const
const NS = { type: ['string', 'null'] } as const
const B = { type: 'boolean' } as const
const I = { type: 'integer' } as const
const NI = { type: ['integer', 'null'] } as const
const obj = (properties: Record<string, unknown>) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
})
const nobj = (properties: Record<string, unknown>) => ({ ...obj(properties), type: ['object', 'null'] })
const arr = (items: unknown) => ({ type: 'array', items })

const REQUEST_PARAMS = obj({ requestId: UUID })
const STAFF = obj({ id: S, name: NS })
const DELIVERY = obj({ id: S, channel: S, state: S, errorCode: NS, sendAt: NS, retry: B })
/**
 * The progress of a question's reminder: not scheduled (no successful notice yet), scheduled (due later, or a text
 * waiting for its permitted hours), queued (due now), sent, failed or cancelled; draft for a staff-released draft of
 * before TSK-0121 that is still listed.
 */
export const REMINDER_STATES = ['not_scheduled', 'scheduled', 'draft', 'queued', 'sent', 'failed', 'cancelled'] as const
const QUESTION = obj({
  id: S,
  kind: { type: 'string', enum: [...QUESTION_KINDS] },
  notSureAllowed: B,
  text: S,
  author: STAFF,
  publishedAt: S,
  state: { type: 'string', enum: ['published', 'answered'] },
  answeredAt: NS,
  notice: obj({
    state: { type: 'string', enum: ['pending', 'sent', 'failed'] },
    sentAt: NS,
    deliveries: arr(DELIVERY),
  }),
  reminder: obj({
    state: { type: 'string', enum: [...REMINDER_STATES] },
    dueAt: NS,
    sentAt: NS,
    deliveries: arr(DELIVERY),
  }),
  reply: nobj({
    text: NS,
    notSure: B,
    at: S,
    reopenedRequest: B,
    photos: arr(obj({ id: S, state: S })),
  }),
})
const QUESTIONS_VIEW = obj({
  requestId: S,
  reference: S,
  state: S,
  version: I,
  projectState: S,
  questions: arr(QUESTION),
  canPublish: B,
  repliesWaiting: B,
  canMarkReviewed: B,
  cadence: nobj({ afterDeliveryHours: I, closeAfterReminderHours: I }),
  close: obj({
    allowed: B,
    available: B,
    reasons: arr(S),
    availableAt: NS,
  }),
  reopen: obj({ days: NI, closedAt: NS, until: NS, periodEnded: B, allowed: B }),
  maxLength: I,
})
const PUBLISH_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['text', 'kind', 'noHazardInspection'],
  properties: {
    text: { type: 'string', minLength: 1, maxLength: QUESTION_MAX_LENGTH, pattern: '\\S' },
    kind: { type: 'string', enum: [...QUESTION_KINDS] },
    // TSK-0148 (OWN-DEC-197 E2): the customer may answer "I'm not sure"; a measurement always may.
    notSureAllowed: { type: 'boolean' },
    // The hazard guard (OWN-DEC-98): the staff member confirms the question asks for no inspection of a hazard.
    noHazardInspection: { const: true },
  },
} as const
const PUBLISH_RESULT = obj({ questionId: S, requestId: S, state: S, version: I, moved: B })
const CLOSE_BODY = {
  type: 'object',
  additionalProperties: false,
  properties: { internalNote: { type: 'string', maxLength: 5000 } },
} as const
const CLOSE_RESULT = obj({
  requestId: S,
  outcome: { type: 'string', enum: ['moved'] },
  state: S,
  version: I,
  projectState: S,
})
const REVIEWED_RESULT = obj({ reviewed: B })
/** The longest reason for reopening (PROPOSED). */
export const REOPEN_REASON_MAX_LENGTH = 2000
const REOPEN_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['reason'],
  properties: { reason: { type: 'string', minLength: 1, maxLength: REOPEN_REASON_MAX_LENGTH, pattern: '\\S' } },
} as const
const REOPEN_RESULT = obj({
  requestId: S,
  state: S,
  version: I,
  projectState: S,
  afterPeriod: B,
})

export type QuestionStaffDeps = {
  obligationChecks?: readonly ObligationCheck[]
  /** The clock (tests). Default: the real time. */
  now?: () => Date
}

function staffActor(ctx: ApiContext): StaffActor {
  if (ctx.actor.kind !== 'staff') throw new ApiError('FORBIDDEN')
  return ctx.actor
}
const correlation = (ctx: ApiContext) => currentContext()?.requestId ?? ctx.req.id
const requestIdOf = (ctx: ApiContext) => (ctx.req.params as { requestId: string }).requestId
const refused = (...codes: string[]) =>
  new ApiError('CONFLICT', { fieldErrors: codes.map((code) => ({ field: 'state', code, message: '' })) })

/** The request's project and responsible staff member, for the policy (an Estimator's own-record grants). */
const requestResource: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { requestId } = req.params as { requestId: string }
  if (!UUID_RE.test(requestId)) return null
  const r = await db
    .selectFrom('intake.requests')
    .select(['project_id', 'responsible_staff_id'])
    .where('id', '=', requestId)
    .executeTakeFirst()
  if (!r) return null
  return {
    projectId: r.project_id,
    ...(r.responsible_staff_id ? { ownerStaffId: r.responsible_staff_id } : {}),
  }
}

type Locked = {
  id: string
  reference: string
  state: RequestState
  version: number
  projectId: string
  projectState: string
  projectVersion: number
  responsibleStaffId: string | null
}

/** Locks the request (then its project) inside the caller's scope; outside it, NOT_FOUND. */
async function lockRequest(tx: Tx, scope: DataScope, requestId: string): Promise<Locked> {
  if (!UUID_RE.test(requestId)) throw new ApiError('NOT_FOUND')
  const r = await tx
    .selectFrom('intake.requests')
    .select(['id', 'reference', 'state', 'state_version', 'project_id', 'responsible_staff_id'])
    .where('id', '=', requestId)
    .where(projectInScope('project_id', scope))
    .forUpdate()
    .executeTakeFirst()
  if (!r) throw new ApiError('NOT_FOUND')
  const p = await tx
    .selectFrom('crm.projects')
    .select(['state', 'state_version'])
    .where('id', '=', r.project_id)
    .forUpdate()
    .executeTakeFirstOrThrow()
  return {
    id: r.id,
    reference: r.reference,
    state: r.state as RequestState,
    version: r.state_version,
    projectId: r.project_id,
    projectState: p.state,
    projectVersion: p.state_version,
    responsibleStaffId: r.responsible_staff_id,
  }
}

function stale(current: Locked): ApiError {
  return new ApiError('STALE_VERSION', {
    current: {
      version: current.version,
      values: { state: current.state, responsibleStaffId: current.responsibleStaffId },
    },
  })
}

function allowed(
  actor: Actor,
  action: Parameters<typeof decide>[1],
  resource: { projectId: string; owner: string | null },
) {
  return (
    decide(
      actor,
      action,
      { projectId: resource.projectId, ...(resource.owner ? { ownerStaffId: resource.owner } : {}) },
      { now: new Date(), online: true },
    ).effect === 'allow'
  )
}

/** States from which publishing a question moves the request to "needs information" (or keeps it there). */
const PUBLISH_FROM: readonly RequestState[] = [
  'received',
  'reviewing',
  'needs_information',
  'needs_site_visit',
  'ready_for_estimate',
]

/**
 * Whether "Closed—no response" is possible now (OWN-DEC-197 E4, OWN-DEC-208; TSK-0148): the unmet requirements in
 * the order staff read them (none when it is possible), when it becomes possible, and the facts of the request
 * machine. The view and the close route use the same check.
 * - The reminder of every unanswered question was actually sent: one of its deliveries is sent or delivered now (a
 *   staff-released one sent before TSK-0121 counts as that reminder); a queued, scheduled or draft reminder never
 *   counts, however long ago it was due (FINAL_REMINDER_NOT_SENT). A reminder whose deliveries all failed is staff
 *   follow-up, never customer non-response (REMINDER_FAILED).
 * - The configured hours passed since the latest of those sends (TOO_EARLY); NOT CONFIGURED refuses (CONFIG_MISSING).
 * - No customer response since that send, and none waiting for staff review (CUSTOMER_REPLIED).
 * - No accepted work, appointment or recorded payment (OWNER_REVIEW_REQUIRED).
 */
async function closeCheck(
  tx: Tx,
  request: { id: string; projectId: string; state: string },
  config: Config,
  now: Date,
  checks: readonly ObligationCheck[],
) {
  const reasons: string[] = []
  if (request.state !== 'needs_information') reasons.push('INVALID_TRANSITION')
  const open = await tx
    .selectFrom('intake.questions')
    .select('id')
    .where('request_id', '=', request.id)
    .where('state', '=', 'published')
    .execute()
  let sentAt: Date | null = null
  let failed = false
  let unsent = false
  for (const q of open) {
    const s = await reminderStanding(tx, q.id)
    if (s.state === 'sent') {
      if (!sentAt || s.sentAt.getTime() > sentAt.getTime()) sentAt = s.sentAt
    } else if (s.state === 'failed') failed = true
    else unsent = true
  }
  const everySent = open.length > 0 && !failed && !unsent && sentAt !== null
  const cadence = questionCadence(config)
  const availableAt =
    everySent && sentAt && cadence ? new Date(sentAt.getTime() + cadence.closeAfterReminderHours * HOUR_MS) : null
  if (open.length === 0) reasons.push('NO_OPEN_QUESTION')
  else if (failed) reasons.push('REMINDER_FAILED')
  else if (!everySent) reasons.push('FINAL_REMINDER_NOT_SENT')
  else if (!availableAt || availableAt.getTime() > now.getTime()) reasons.push('TOO_EARLY')
  if (!cadence) reasons.push('CONFIG_MISSING')
  const responded = await customerResponded(tx, { requestId: request.id, projectId: request.projectId, since: sentAt })
  if (responded) reasons.push('CUSTOMER_REPLIED')
  const obligations = await obligationFacts(tx, request.projectId, checks)
  if (obligations.workAccepted || obligations.appointmentExists || obligations.moneyReceived)
    reasons.push('OWNER_REVIEW_REQUIRED')
  return {
    reasons,
    availableAt,
    facts: {
      ...obligations,
      customerResponded: responded,
      ...(everySent && sentAt ? { finalReminderSentAt: sentAt } : {}),
      ...(cadence ? { noResponseCloseHours: cadence.closeAfterReminderHours } : {}),
    },
  }
}

/**
 * Whether an unanswered question of the open request has a reminder whose deliveries all failed (TSK-0148, OWN-DEC-208
 * "the request goes to staff follow-up instead").
 */
export async function reminderFollowUpNeeded(tx: Tx, requestId: string): Promise<boolean> {
  const open = await tx
    .selectFrom('intake.questions as q')
    .innerJoin('intake.requests as r', 'r.id', 'q.request_id')
    .select(['q.id', 'r.state'])
    .where('q.request_id', '=', requestId)
    .where('q.state', '=', 'published')
    .execute()
  for (const q of open) {
    if (isClosedState(q.state)) return false
    if ((await reminderStanding(tx, q.id)).state === 'failed') return true
  }
  return false
}

/**
 * The request's question_reminder item follows its reminders' delivery (TSK-0148): a failed reminder opens it as
 * "question_reminder_failed" (assigned to the responsible staff member, who follows up with the customer another way);
 * once no reminder of an unanswered question has failed any more, that follow-up is resolved. Other reasons of the
 * item are left as they are.
 */
export async function syncReminderFollowUp(tx: Tx, requestId: string): Promise<void> {
  if (await reminderFollowUpNeeded(tx, requestId)) {
    const target = await noticeTarget(tx, requestId)
    if (!target) return
    await openQueueItem(tx, {
      type: 'question_reminder',
      subjectId: requestId,
      reason: 'question_reminder_failed',
      projectId: target.projectId,
      reference: target.reference,
      status: target.state,
      assignedStaffId: target.responsibleStaffId,
    })
    return
  }
  const item = await tx
    .selectFrom('ops.queue_items')
    .select('reason')
    .where('type', '=', 'question_reminder')
    .where('subject_id', '=', requestId)
    .where('resolved_at', 'is', null)
    .executeTakeFirst()
  if (item?.reason === 'question_reminder_failed')
    await resolveQueueItem(tx, { type: 'question_reminder', subjectId: requestId, resolution: 'handled' })
}

/** Every open reminder of the request's questions (or of one question) is cancelled: nothing old goes out. */
export async function cancelOpenReminders(tx: Tx, where: { requestId: string } | { questionId: string }) {
  const ids =
    'questionId' in where
      ? [where.questionId]
      : (await tx.selectFrom('intake.questions').select('id').where('request_id', '=', where.requestId).execute()).map(
          (q) => q.id,
        )
  if (ids.length === 0) return 0
  const res = await tx
    .updateTable('platform.message_deliveries')
    .set({
      state: 'cancelled',
      error_code: 'record_changed',
      cancelled_by: 'system',
      cancelled_at: sql<Date>`now()`,
      updated_at: sql<Date>`now()`,
    })
    .where('message_key', '=', QUESTION_REMINDER)
    .where('record_type', '=', 'question')
    .where('record_id', 'in', ids)
    .where('state', 'in', ['draft', 'queued'])
    .where('provider_message_id', 'is', null)
    .executeTakeFirst()
  return Number(res.numUpdatedRows)
}

/**
 * Resolves the request's reminder item once no reminder of its questions waits for release, unless a failed reminder
 * of another unanswered question still needs staff follow-up (TSK-0148).
 */
export async function syncReminderItem(tx: Tx, requestId: string): Promise<void> {
  const waiting = await tx
    .selectFrom('platform.message_deliveries as d')
    .innerJoin('intake.questions as q', (j) => j.on(sql<boolean>`q.id::text = d.record_id`))
    .select('d.id')
    .where('d.message_key', '=', QUESTION_REMINDER)
    .where('d.record_type', '=', 'question')
    .where('d.state', '=', 'draft')
    .where('q.request_id', '=', requestId)
    .where('q.state', '=', 'published')
    .limit(1)
    .executeTakeFirst()
  if (waiting) return
  if (await reminderFollowUpNeeded(tx, requestId)) return syncReminderFollowUp(tx, requestId)
  await resolveQueueItem(tx, { type: 'question_reminder', subjectId: requestId, resolution: 'handled' })
}

type DeliveryRow = {
  id: string
  message_key: string
  subject_key: string
  channel: string
  state: string
  error_code: string | null
  send_at: Date | null
  issue: boolean | null
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null)

function deliveryView(d: DeliveryRow) {
  return {
    id: d.id,
    channel: d.channel,
    state: d.state,
    errorCode: d.error_code,
    sendAt: d.state === 'queued' ? iso(d.send_at) : null,
    retry: d.state === 'failed' && Boolean(d.issue) && !String(d.error_code ?? '').startsWith('outcome_unknown_'),
  }
}

function stageState(rows: readonly DeliveryRow[], due: Date | null, now: Date): (typeof REMINDER_STATES)[number] {
  if (rows.length === 0) return due ? 'scheduled' : 'not_scheduled'
  const has = (s: string) => rows.some((r) => r.state === s)
  if (has('sent') || has('delivered')) return 'sent'
  if (has('draft')) return 'draft'
  // A queued reminder due later (or a text waiting for its permitted hours) is scheduled.
  if (rows.some((r) => r.state === 'queued' && r.send_at && r.send_at.getTime() > now.getTime())) return 'scheduled'
  if (has('queued')) return 'queued'
  if (has('failed') || has('suppressed')) return 'failed'
  return 'cancelled'
}

export function questionStaffRoutes(deps: QuestionStaffDeps = {}): RouteDef[] {
  const now = deps.now ?? (() => new Date())
  const checks = deps.obligationChecks ?? DEFAULT_OBLIGATION_CHECKS

  const view: RouteDef = {
    method: 'GET',
    path: '/staff/requests/:requestId/questions',
    operationId: 'listRequestQuestions',
    summary: 'Questions to the customer',
    description:
      'Staff with request.view, inside the caller’s scope (otherwise NOT_FOUND). The questions published in the ' +
      'request’s project, oldest first, each exactly as written with its author and time, its automatic notice ' +
      '(pending, sent, failed, with each delivery and Retry for a definite failure: a failed notice never starts the ' +
      'reminders), its one automatic reminder (TSK-0121: not scheduled, scheduled with the due time 3 days after the ' +
      'notice’s successful send, queued, sent, failed or cancelled, with each delivery; a text waits for the ' +
      'recipient’s permitted hours) and the customer’s reply exactly as written ("I’m not sure", the attached photos and their states, and ' +
      'whether it reopened the request). Also whether this caller may publish, whether replies wait for review, the ' +
      'configured cadence, whether "Closed—no response" is possible now (with the unmet requirements and when it ' +
      'becomes possible) and the reopen period.',
    actors: ['staff'],
    permission: 'request.view',
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'none',
    pagination: false,
    test: TEST,
    resource: requestResource,
    schema: { params: REQUEST_PARAMS, response: { 200: QUESTIONS_VIEW } },
    handler: async (ctx) => {
      const actor = staffActor(ctx)
      const t = now()
      const r = await ctx.db
        .selectFrom('intake.requests as r')
        .innerJoin('crm.projects as p', 'p.id', 'r.project_id')
        .select([
          'r.id',
          'r.reference',
          'r.state',
          'r.state_version',
          'r.project_id',
          'r.responsible_staff_id',
          'p.state as project_state',
        ])
        .where('r.id', '=', requestIdOf(ctx))
        .where(projectInScope('r.project_id', ctx.scope))
        .executeTakeFirst()
      if (!r) throw new ApiError('NOT_FOUND')
      const config = await loadConfig(ctx.db)
      const cadence = questionCadence(config)
      const questions = await ctx.db
        .selectFrom('intake.questions as q')
        .leftJoin('identity.staff_users as s', 's.id', 'q.author_staff_id')
        .select([
          'q.id',
          'q.kind',
          'q.not_sure_allowed',
          'q.body',
          'q.author_staff_id',
          's.display_name',
          'q.published_at',
          'q.state',
          'q.answered_at',
          'q.notice_sent_at',
          'q.first_reminder_sent_at',
          'q.final_reminder_sent_at',
        ])
        .where('q.request_id', '=', r.id)
        .where('q.project_id', '=', r.project_id)
        .orderBy('q.published_at')
        .orderBy('q.id')
        .execute()
      const ids = questions.map((q) => q.id)
      const subjects = ids.flatMap((id) => [noticeSubject(id), ...reminderSubjects(id)])
      const deliveries: DeliveryRow[] = subjects.length
        ? ((await ctx.db
            .selectFrom('platform.message_deliveries as d')
            .select([
              'd.id',
              'd.message_key',
              'd.subject_key',
              'd.channel',
              'd.state',
              'd.error_code',
              sql<Date | null>`(SELECT min(j.run_at) FROM platform.jobs j WHERE j.target_type = 'message_delivery'
                AND j.target_id = d.id::text AND j.state = 'queued')`.as('send_at'),
              sql<boolean>`EXISTS (SELECT 1 FROM ops.queue_items qi WHERE qi.type = 'delivery_failed'
                AND qi.subject_id = d.id::text AND qi.resolved_at IS NULL)`.as('issue'),
            ])
            .where('d.message_key', 'in', [QUESTION_NOTICE, QUESTION_REMINDER])
            .where('d.subject_key', 'in', subjects)
            .orderBy('d.seq')
            .execute()) as DeliveryRow[])
        : []
      const replies = ids.length
        ? await ctx.db
            .selectFrom('intake.question_replies')
            .select(['id', 'question_id', 'body', 'not_sure', 'created_at', 'reopened_request'])
            .where('question_id', 'in', ids)
            .execute()
        : []
      const photos = replies.length
        ? await ctx.db
            .selectFrom('intake.question_reply_photos as rp')
            .innerJoin('intake.photos as ph', 'ph.id', 'rp.photo_id')
            .select(['rp.reply_id', 'ph.id', 'ph.state'])
            .where(
              'rp.reply_id',
              'in',
              replies.map((x) => x.id),
            )
            .orderBy('rp.position')
            .execute()
        : []
      const owner = r.responsible_staff_id
      const res = { projectId: r.project_id, owner }
      const out = questions.map((q) => {
        const notice = deliveries.filter((d) => d.subject_key === noticeSubject(q.id))
        const reply = replies.find((x) => x.question_id === q.id)
        return {
          id: q.id,
          kind: q.kind as QuestionKind,
          notSureAllowed: q.not_sure_allowed,
          text: q.body,
          author: { id: q.author_staff_id, name: q.display_name },
          publishedAt: q.published_at.toISOString(),
          state: q.state as 'published' | 'answered',
          answeredAt: iso(q.answered_at),
          notice: {
            state: notice.some((d) => d.state === 'sent' || d.state === 'delivered')
              ? ('sent' as const)
              : notice.some((d) => d.state === 'failed' || d.state === 'suppressed') &&
                  !notice.some((d) => d.state === 'queued')
                ? ('failed' as const)
                : ('pending' as const),
            sentAt: iso(q.notice_sent_at),
            deliveries: notice.map(deliveryView),
          },
          reminder: (() => {
            const subjects = reminderSubjects(q.id)
            const rows = deliveries.filter((d) => subjects.includes(d.subject_key))
            const due =
              q.notice_sent_at && cadence
                ? new Date(q.notice_sent_at.getTime() + cadence.afterDeliveryHours * HOUR_MS)
                : null
            const state = q.state === 'answered' && rows.length === 0 ? 'cancelled' : stageState(rows, due, t)
            return {
              state: q.state === 'answered' && state === 'scheduled' ? ('cancelled' as const) : state,
              dueAt: iso(due),
              sentAt: iso(q.final_reminder_sent_at ?? q.first_reminder_sent_at),
              deliveries: rows.map(deliveryView),
            }
          })(),
          reply: reply
            ? {
                text: reply.body,
                notSure: reply.not_sure,
                at: reply.created_at.toISOString(),
                reopenedRequest: reply.reopened_request,
                photos: photos.filter((p) => p.reply_id === reply.id).map((p) => ({ id: p.id, state: p.state })),
              }
            : null,
        }
      })
      // Closing now: the same checks as the close route, read without locks.
      const closeAllowed = allowed(actor, 'request.close_no_response', res)
      const check = await withTx(ctx.db, (tx) =>
        closeCheck(tx, { id: r.id, projectId: r.project_id, state: r.state }, config, t, checks),
      )
      const reasons = check.reasons
      const closedAt = await closedNoResponseAt(ctx.db, r.id)
      const days = reopenPeriodDays(config)
      const until =
        r.state === 'closed_no_response' && closedAt && days !== null
          ? new Date(closedAt.getTime() + days * DAY_MS)
          : null
      const waiting = await ctx.db
        .selectFrom('ops.queue_items')
        .select('id')
        .where('type', '=', 'question_replied')
        .where('subject_id', '=', r.id)
        .where('resolved_at', 'is', null)
        .executeTakeFirst()
      return {
        body: {
          requestId: r.id,
          reference: r.reference,
          state: r.state,
          version: r.state_version,
          projectState: r.project_state,
          questions: out,
          canPublish:
            r.project_state === 'open' &&
            PUBLISH_FROM.includes(r.state as RequestState) &&
            allowed(actor, 'request.ask_question', res),
          repliesWaiting: waiting !== undefined,
          canMarkReviewed: waiting !== undefined && allowed(actor, 'request.ask_question', res),
          cadence,
          close: {
            allowed: closeAllowed,
            available: closeAllowed && reasons.length === 0,
            reasons,
            availableAt: iso(check.availableAt),
          },
          reopen: {
            days,
            closedAt: r.state === 'closed_no_response' ? iso(closedAt) : null,
            until: iso(until),
            // After the period a reply no longer reopens it: staff may, or the customer sends a new request (E5).
            periodEnded: until !== null && t.getTime() > until.getTime(),
            allowed:
              r.state === 'closed_no_response' && r.project_state === 'closed' && allowed(actor, 'request.reopen', res),
          },
          maxLength: QUESTION_MAX_LENGTH,
        },
        version: r.state_version,
      }
    },
  }

  const publish: RouteDef = {
    method: 'POST',
    path: '/staff/requests/:requestId/questions',
    operationId: 'publishRequestQuestion',
    summary: 'Publish a question to the customer',
    description:
      'Staff with request.ask_question on the request, inside the caller’s scope (otherwise NOT_FOUND), with the ' +
      'request’s version (If-Match). Publishing is the release (OWN-DEC-98): the question is kept exactly as written ' +
      '(general, or a measurement), with whether the customer may answer "I’m not sure" (notSureAllowed, any question; ' +
      'a measurement always may, TSK-0148, OWN-DEC-197 E2), the request moves to "needs information" ' +
      '(a received request is moved to review first) or stays there, and question.published is recorded in the same ' +
      'transaction for the automatic notice "HandyHub has a question about your request. View and reply securely.", ' +
      'which links to the question through the project’s verified access. The staff member confirms the question ' +
      'never asks the customer to inspect a hazardous area (noHazardInspection). Card numbers are refused. Refused ' +
      'from any other state (CONFLICT INVALID_TRANSITION) or for a project that is not open (PROJECT_NOT_OPEN). The ' +
      'audit event never holds the text.',
    actors: ['staff'],
    permission: 'request.ask_question',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'required',
    rateLimit: 'none',
    audit: 'question.publish',
    pagination: false,
    test: TEST,
    resource: requestResource,
    schema: { params: REQUEST_PARAMS, body: PUBLISH_BODY, response: { 201: PUBLISH_RESULT } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staffActor(ctx)
      const b = ctx.req.body as { text: string; kind: QuestionKind; notSureAllowed?: boolean }
      // E2 (OWN-DEC-197): any question may offer "I'm not sure"; a measurement always does (PROPOSED).
      const notSureAllowed = b.kind === 'measurement' || b.notSureAllowed === true
      if (looksLikeCardNumber(b.text))
        throw new ApiError('VALIDATION_FAILED', {
          fieldErrors: [{ field: 'body.text', code: 'sensitive_content', message: '' }],
        })
      const current = await lockRequest(tx, ctx.scope, requestIdOf(ctx))
      if (ctx.expectedVersion() !== current.version) throw stale(current)
      if (current.projectState !== 'open') throw refused('PROJECT_NOT_OPEN')
      if (!PUBLISH_FROM.includes(current.state)) throw refused('INVALID_TRANSITION')
      let state = current.state
      let version = current.version
      const at = now()
      if (state !== 'needs_information') {
        const step = (event: 'start_review' | 'request_information') => {
          const res = apply({ machine: 'request.lifecycle', state, version }, event, {
            actor: 'staff',
            expectedVersion: version,
            now: at,
            facts: {},
          })
          if (!res.ok) throw refused(...(res.problems.length ? res.problems.map((p) => p.code) : [res.code]))
          state = res.to
          version = res.version
        }
        if (state === 'received') step('start_review')
        step('request_information')
        await tx
          .updateTable('intake.requests')
          .set({ state, state_version: version })
          .where('id', '=', current.id)
          .execute()
        // The customer timeline's "More information needed" and the history keep the decision (HH-LEAD-01).
        await tx
          .insertInto('intake.request_decisions')
          .values({
            request_id: current.id,
            project_id: current.projectId,
            action: 'ask_question',
            event: 'request_information',
            from_state: current.state,
            to_state: state,
            decided_by: actor.userId,
            request_version: version,
          })
          .execute()
        await syncNewRequestItem(tx, current.id)
        await syncReviewHoldItem(tx, current.id)
        await syncEstimateItem(tx, current.id)
        await outbox.add(tx, {
          type: 'request.information_requested',
          aggregate: { type: 'request', id: current.id, version },
          payload: { requestId: current.id, projectId: current.projectId, reference: current.reference },
          idempotencyKey: `request.information_requested:${current.id}:${version}`,
          requestId: correlation(ctx),
        })
      }
      const q = await tx
        .insertInto('intake.questions')
        .values({
          request_id: current.id,
          project_id: current.projectId,
          kind: b.kind,
          not_sure_allowed: notSureAllowed,
          // Exactly as the staff member wrote it.
          body: b.text,
          author_staff_id: actor.userId,
        })
        .returning('id')
        .executeTakeFirstOrThrow()
      await outbox.add(tx, {
        type: QUESTION_PUBLISHED,
        aggregate: { type: 'question', id: q.id },
        payload: { questionId: q.id, requestId: current.id, projectId: current.projectId },
        idempotencyKey: `${QUESTION_PUBLISHED}:${q.id}`,
        requestId: correlation(ctx),
      })
      // Asking again is staff's review of the replies so far.
      await resolveQueueItem(tx, { type: 'question_replied', subjectId: current.id, resolution: 'handled' })
      await ctx.audit({
        target: { type: 'question', id: q.id },
        summary: {
          requestId: current.id,
          kind: b.kind,
          notSureAllowed,
          from: current.state,
          to: state,
          moved: state !== current.state,
        },
      })
      return {
        status: 201,
        body: { questionId: q.id, requestId: current.id, state, version, moved: state !== current.state },
        version,
      }
    },
  }

  const reviewed: RouteDef = {
    method: 'POST',
    path: '/staff/requests/:requestId/questions/replies-reviewed',
    operationId: 'markQuestionRepliesReviewed',
    summary: 'Mark the customer’s replies reviewed',
    description:
      'Staff with request.ask_question on the request, inside the caller’s scope (otherwise NOT_FOUND). Resolves the ' +
      'request’s "question replied" queue item (publishing another question, a request action or closing does the ' +
      'same). Nothing about the replies changes.',
    actors: ['staff'],
    permission: 'request.ask_question',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'question.replies_reviewed',
    pagination: false,
    test: TEST,
    resource: requestResource,
    schema: { params: REQUEST_PARAMS, response: { 200: REVIEWED_RESULT } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const current = await lockRequest(tx, ctx.scope, requestIdOf(ctx))
      const done = await resolveQueueItem(tx, {
        type: 'question_replied',
        subjectId: current.id,
        resolution: 'handled',
      })
      await ctx.audit({ target: { type: 'request', id: current.id }, summary: { reviewed: done } })
      return { body: { reviewed: done } }
    },
  }

  const close: RouteDef = {
    method: 'POST',
    path: '/staff/requests/:requestId/actions/close-no-response',
    operationId: 'closeRequestNoResponse',
    summary: 'Close the request "Closed—no response"',
    description:
      'Staff with request.close_no_response (PROPOSED: the request-handling row), inside the caller’s scope ' +
      '(otherwise NOT_FOUND), with the request’s version (If-Match). Only an unbooked request waiting on the customer ' +
      '("needs information") whose unanswered questions all had their one reminder actually sent (a delivery sent or ' +
      'delivered now; queued or scheduled never counts), at least the configured hours after the latest such send ' +
      '(reminders.cadences.unansweredQuestion.closeAfterReminderHours, 24, OWN-DEC-208). A reminder whose deliveries all ' +
      'failed is staff follow-up (REMINDER_FAILED), never customer non-response. A customer response since that send, or ' +
      'one staff have not reviewed yet, keeps it open (CUSTOMER_REPLIED). With accepted work, an appointment or a ' +
      'recorded payment it is refused (OWNER_REVIEW_REQUIRED): this rule never cancels accepted, scheduled or paid ' +
      'work. The request and project close with their history; open reminders are cancelled; a customer reply within ' +
      'the reopen period (request.reopen_period) reopens the same request. CONFLICT codes: INVALID_TRANSITION, ' +
      'NO_OPEN_QUESTION, REMINDER_FAILED, FINAL_REMINDER_NOT_SENT, TOO_EARLY, CONFIG_MISSING, CUSTOMER_REPLIED, ' +
      'OWNER_REVIEW_REQUIRED.',
    actors: ['staff'],
    permission: 'request.close_no_response',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'required',
    rateLimit: 'none',
    audit: 'request.close_no_response',
    pagination: false,
    test: TEST,
    resource: requestResource,
    schema: { params: REQUEST_PARAMS, body: CLOSE_BODY, response: { 200: CLOSE_RESULT } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staffActor(ctx)
      const b = (ctx.req.body ?? {}) as { internalNote?: string }
      const current = await lockRequest(tx, ctx.scope, requestIdOf(ctx))
      if (ctx.expectedVersion() !== current.version) throw stale(current)
      if (current.projectState !== 'open') throw refused('PROJECT_NOT_OPEN')
      const config = await loadConfig(tx)
      const t = now()
      if (current.state !== 'needs_information') throw refused('INVALID_TRANSITION')
      const check = await closeCheck(
        tx,
        { id: current.id, projectId: current.projectId, state: current.state },
        config,
        t,
        checks,
      )
      if (check.reasons.length) throw refused(...check.reasons)
      const { workAccepted, appointmentExists, moneyReceived } = check.facts
      const obligations = { workAccepted, appointmentExists, moneyReceived }
      // The request machine decides again from the same facts.
      const moved = apply(
        { machine: 'request.lifecycle', state: current.state, version: current.version },
        'close_no_response',
        { actor: 'staff', expectedVersion: current.version, now: t, facts: check.facts },
      )
      if (!moved.ok) throw refused(...(moved.problems.length ? moved.problems.map((p) => p.code) : [moved.code]))
      const closed = apply({ machine: 'project.lifecycle', state: 'open', version: current.projectVersion }, 'close', {
        actor: 'staff',
        expectedVersion: current.projectVersion,
        now: t,
        facts: { ...obligations, requestState: moved.to },
      })
      if (!closed.ok) throw refused(...(closed.problems.length ? closed.problems.map((p) => p.code) : [closed.code]))
      await tx
        .updateTable('intake.requests')
        .set({ state: moved.to, state_version: moved.version })
        .where('id', '=', current.id)
        .execute()
      await tx
        .updateTable('crm.projects')
        .set({ state: closed.to, state_version: closed.version })
        .where('id', '=', current.projectId)
        .execute()
      const note = b.internalNote && b.internalNote.trim() !== '' ? b.internalNote.trim() : null
      await tx
        .insertInto('intake.request_decisions')
        .values({
          request_id: current.id,
          project_id: current.projectId,
          action: 'close_no_response',
          event: 'close_no_response',
          from_state: current.state,
          to_state: moved.to,
          project_from_state: current.projectState,
          project_to_state: closed.to,
          internal_note: note,
          decided_by: actor.userId,
          decided_at: t,
          request_version: moved.version,
        })
        .execute()
      const cancelled = await cancelOpenReminders(tx, { requestId: current.id })
      await resolveQueueItem(tx, { type: 'question_reminder', subjectId: current.id, resolution: 'closed' })
      await resolveQueueItem(tx, { type: 'question_replied', subjectId: current.id, resolution: 'closed' })
      await syncNewRequestItem(tx, current.id)
      await syncReviewHoldItem(tx, current.id)
      await syncEstimateItem(tx, current.id)
      await ctx.audit({
        target: { type: 'request', id: current.id, version: moved.version },
        summary: {
          action: 'close_no_response',
          from: current.state,
          to: moved.to,
          projectTo: closed.to,
          remindersCancelled: cancelled,
          internalNote: note !== null,
        },
      })
      return {
        body: {
          requestId: current.id,
          outcome: 'moved',
          state: moved.to,
          version: moved.version,
          projectState: closed.to,
        },
        version: moved.version,
      }
    },
  }

  const reopen: RouteDef = {
    method: 'POST',
    path: '/staff/requests/:requestId/actions/reopen',
    operationId: 'reopenRequest',
    summary: 'Reopen a "Closed—no response" request',
    description:
      'TSK-0148 (OWN-DEC-197 E5): staff with request.reopen (PROPOSED: the request-handling row, the roles that may ' +
      'close it), inside the caller’s scope (otherwise NOT_FOUND), with the request’s version (If-Match) and a written ' +
      'reason (kept staff-only in the decision history). A "Closed—no response" request goes back to HandyHub’s review ' +
      'and its project reopens, within the reopen period or after it (afterPeriod says which); the history is kept and ' +
      'nothing else is restored (no expired estimate or appointment, no reminder). The customer’s unanswered questions ' +
      'can be answered again. CONFLICT codes: INVALID_TRANSITION, PROJECT_NOT_CLOSED, REASON_REQUIRED.',
    actors: ['staff'],
    permission: 'request.reopen',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'required',
    rateLimit: 'none',
    audit: 'request.reopen',
    pagination: false,
    test: TEST,
    resource: requestResource,
    schema: { params: REQUEST_PARAMS, body: REOPEN_BODY, response: { 200: REOPEN_RESULT } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staffActor(ctx)
      const reason = (ctx.req.body as { reason: string }).reason.trim()
      const current = await lockRequest(tx, ctx.scope, requestIdOf(ctx))
      if (ctx.expectedVersion() !== current.version) throw stale(current)
      if (current.state !== 'closed_no_response') throw refused('INVALID_TRANSITION')
      if (current.projectState !== 'closed') throw refused('PROJECT_NOT_CLOSED')
      const t = now()
      const moved = apply(
        { machine: 'request.lifecycle', state: current.state, version: current.version },
        'reopen_by_staff',
        { actor: 'staff', expectedVersion: current.version, now: t, facts: { reason } },
      )
      if (!moved.ok) throw refused(...(moved.problems.length ? moved.problems.map((p) => p.code) : [moved.code]))
      const opened = apply(
        { machine: 'project.lifecycle', state: 'closed', version: current.projectVersion },
        'reopen',
        { actor: 'staff', expectedVersion: current.projectVersion, now: t, facts: { requestState: moved.to } },
      )
      if (!opened.ok) throw refused(...(opened.problems.length ? opened.problems.map((p) => p.code) : [opened.code]))
      // Whether a customer reply could still have reopened it (the period is read, never assumed).
      const closedAt = await closedNoResponseAt(tx, current.id)
      const days = reopenPeriodDays(await loadConfig(tx))
      const afterPeriod = closedAt !== null && days !== null && t.getTime() > closedAt.getTime() + days * DAY_MS
      await tx
        .updateTable('intake.requests')
        .set({ state: moved.to, state_version: moved.version })
        .where('id', '=', current.id)
        .execute()
      await tx
        .updateTable('crm.projects')
        .set({ state: opened.to, state_version: opened.version })
        .where('id', '=', current.projectId)
        .execute()
      // Who reopened it, when and why, in the project history (staff-only; the customer timeline shows its state).
      await tx
        .insertInto('intake.request_decisions')
        .values({
          request_id: current.id,
          project_id: current.projectId,
          action: 'reopen',
          event: 'reopen_by_staff',
          from_state: current.state,
          to_state: moved.to,
          project_from_state: current.projectState,
          project_to_state: opened.to,
          internal_note: reason,
          decided_by: actor.userId,
          decided_at: t,
          request_version: moved.version,
        })
        .execute()
      await syncNewRequestItem(tx, current.id)
      await syncReviewHoldItem(tx, current.id)
      await syncEstimateItem(tx, current.id)
      await ctx.audit({
        target: { type: 'request', id: current.id, version: moved.version },
        summary: { action: 'reopen', from: current.state, to: moved.to, projectTo: opened.to, afterPeriod },
      })
      return {
        body: {
          requestId: current.id,
          state: moved.to,
          version: moved.version,
          projectState: opened.to,
          afterPeriod,
        },
        version: moved.version,
      }
    },
  }

  return [view, publish, reviewed, close, reopen]
}
