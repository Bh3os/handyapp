// Staff questions: shared rules and reads (TSK-0051; HH-LEAD-03, HH-LEAD-06, HH-COM-05, HH-COM-06, ENT-Question,
// OWN-DEC-98, OWN-DEC-101, FACT-REMINDER-CADENCES, FACT-REOPEN-PERIOD).
// - A question's notice and its reminder are deliveries of the notifications module whose subject names the
//   question: `question:<id>` for the automatic notice (one per question, channel and destination, so a retry never
//   sends a second notice) and `question:<id>:reminder` for the one automatic reminder (TSK-0121, OWN-DEC-153);
//   `question:<id>:first` and `question:<id>:final` were the staff-released reminder drafts before it (history).
// - The notice goes to the contact of the project's request: by email, and by text too when the request gave the SMS
//   opt-in; the notifications module rechecks consent at send time, so a STOP suppresses the text (HH-COM-05).
// - Its link opens the question in the portal (`/portal/p/<reference>#question-<id>`), which shows it only to a
//   verified session of that project; the link itself grants nothing (HH-ID-04). Without a public site URL there is no
//   truthful link and the template's value is left out (the delivery records template_values_missing).
// - The cadence is the configured reminders.cadences.unansweredQuestion (one reminder 72 hours after the notice's
//   successful send; "Closed—no response" 24 hours after that reminder was actually sent, OWN-DEC-153, OWN-DEC-208)
//   and the reopen period is request.reopen_period (30 days, FACT-REOPEN-PERIOD). While either is NOT CONFIGURED
//   nothing is guessed: no reminder is scheduled, and closing or reopening is refused.
// - TSK-0148 (OWN-DEC-197 E2, E4, E5; OWN-DEC-208): staff mark whether a question offers "I'm not sure" (any question,
//   a measurement always); the reminder counts for closing only while one of its deliveries is sent or delivered, from
//   its earliest such send; a reminder whose deliveries all failed asks for staff follow-up; a customer response since
//   the reminder (or one not reviewed yet) keeps the request open.
import type { Db, Tx } from '@handyhub/db'
import { REQUEST_CLOSED_STATES, type RequestState } from '@handyhub/domain'
import { sql } from 'kysely'
import type { Config } from '../../platform/config/index.js'
import type { Destination } from '../notifications/index.js'

type Reader = Db | Tx

export const QUESTION_NOTICE = 'question.notice'
export const QUESTION_REMINDER = 'reminder.unanswered_question'
export const REPLY_STAFF_NOTICE = 'staff_notice.customer_reply'
export const QUESTION_PUBLISHED = 'question.published'
export const QUESTION_REPLIED = 'question.customer_replied'

export const QUESTION_KINDS = ['general', 'measurement'] as const
export type QuestionKind = (typeof QUESTION_KINDS)[number]
/** The staff-released reminder stages before TSK-0121 (their deliveries are history). */
export const DRAFT_REMINDER_STAGES = ['first', 'final'] as const
/** `reminder`: the one automatic reminder (TSK-0121); `first` and `final`: the earlier staff-released drafts. */
export type ReminderStage = 'reminder' | (typeof DRAFT_REMINDER_STAGES)[number]

/** The longest question (the column's limit). */
export const QUESTION_MAX_LENGTH = 2000
/** The longest reply or portal message (PROPOSED; the reply column's limit). */
export const REPLY_MAX_LENGTH = 5000

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const noticeSubject = (questionId: string) => `question:${questionId}`
export const reminderSubject = (questionId: string, stage: ReminderStage = 'reminder') =>
  `question:${questionId}:${stage}`
/** Every reminder subject of a question: the automatic one and the earlier drafts. */
export const reminderSubjects = (questionId: string) =>
  (['reminder', ...DRAFT_REMINDER_STAGES] as const).map((s) => reminderSubject(questionId, s))

/** The question (and reminder stage) a delivery subject names, or null. */
export function subjectOf(subject: string): { questionId: string; stage: ReminderStage | null } | null {
  const m = /^question:([0-9a-f-]{36})(?::(reminder|first|final))?$/i.exec(subject)
  if (!m || !UUID_RE.test(m[1] as string)) return null
  return { questionId: (m[1] as string).toLowerCase(), stage: (m[2] as ReminderStage | undefined) ?? null }
}

/** The portal page of the question, through the project's verified access; null while no public URL is configured. */
export function questionLink(baseUrl: string | undefined, reference: string, questionId: string): string | null {
  if (!baseUrl) return null
  return `${baseUrl.replace(/\/$/, '')}/portal/p/${encodeURIComponent(reference)}#question-${questionId}`
}

export type Cadence = {
  /** The reminder is due these elapsed hours after the notice's successful send (72). */
  afterDeliveryHours: number
  /** "Closed—no response" these hours after the reminder was actually sent (24). */
  closeAfterReminderHours: number
}

/** reminders.cadences.unansweredQuestion, or null while NOT CONFIGURED. */
export function questionCadence(config: Config): Cadence | null {
  const c = config.get('reminders.cadences')
  if (c.state !== 'CONFIGURED') return null
  const q = c.value.unansweredQuestion
  return { afterDeliveryHours: q.afterDeliveryHours, closeAfterReminderHours: q.closeAfterReminderHours }
}

/** request.reopen_period in days, or null while NOT CONFIGURED. */
export function reopenPeriodDays(config: Config): number | null {
  const r = config.get('request.reopen_period')
  return r.state === 'CONFIGURED' ? r.value.days : null
}

export const HOUR_MS = 3_600_000
export const DAY_MS = 24 * HOUR_MS

/**
 * PROPOSED: the request states in which a published question can still be answered. A request that is declined, out
 * of scope, not served or withdrawn takes no reply; "Closed—no response" takes one within the reopen period.
 */
export const REPLYABLE_STATES: readonly RequestState[] = [
  'received',
  'reviewing',
  'needs_information',
  'needs_site_visit',
  'ready_for_estimate',
  'estimated',
]

export type ReplyWindow = 'open' | 'reopen' | 'period_ended' | 'closed'

/** When the request was last closed "Closed—no response", or null. */
export async function closedNoResponseAt(db: Reader, requestId: string): Promise<Date | null> {
  const row = await db
    .selectFrom('intake.request_decisions')
    .select('decided_at')
    .where('request_id', '=', requestId)
    .where('action', '=', 'close_no_response')
    .orderBy('decided_at', 'desc')
    .limit(1)
    .executeTakeFirst()
  return row?.decided_at ?? null
}

/**
 * Whether a reply can be sent now: the request is open ('open'); it is "Closed—no response" and the reopen period
 * has not ended ('reopen', the reply reopens it); the period ended ('period_ended', a new request is the way); or the
 * request is closed otherwise ('closed').
 */
export async function replyWindow(
  db: Reader,
  request: { id: string; state: string },
  config: Config,
  now: Date,
): Promise<{ window: ReplyWindow; until: Date | null; closedAt: Date | null }> {
  if ((REPLYABLE_STATES as readonly string[]).includes(request.state))
    return { window: 'open', until: null, closedAt: null }
  if (request.state !== 'closed_no_response') return { window: 'closed', until: null, closedAt: null }
  const closedAt = await closedNoResponseAt(db, request.id)
  const days = reopenPeriodDays(config)
  if (!closedAt || days === null) return { window: 'closed', until: null, closedAt }
  const until = new Date(closedAt.getTime() + days * DAY_MS)
  return { window: now.getTime() <= until.getTime() ? 'reopen' : 'period_ended', until, closedAt }
}

export const isClosedState = (state: string) => (REQUEST_CLOSED_STATES as readonly string[]).includes(state)

export type NoticeTarget = {
  requestId: string
  projectId: string
  reference: string
  state: string
  contactId: string
  /** The contact's full name, for the greeting's first name only (TSK-0119, OWN-DEC-158). */
  fullName: string
  responsibleStaffId: string | null
  destinations: Destination[]
}

/** The request's contact and the destinations of its question notices and reminders (see the header). */
export async function noticeTarget(db: Reader, requestId: string): Promise<NoticeTarget | null> {
  const r = await db
    .selectFrom('intake.requests as r')
    .innerJoin('crm.contacts as c', 'c.id', 'r.contact_id')
    .select([
      'r.id',
      'r.project_id',
      'r.reference',
      'r.state',
      'r.responsible_staff_id',
      'r.preferred_channel',
      'r.sms_opt_in',
      'c.id as contact_id',
      'c.full_name',
      'c.email',
      'c.phone_e164',
    ])
    .where('r.id', '=', requestId)
    .executeTakeFirst()
  if (!r) return null
  const destinations: Destination[] = [
    { channel: 'email', destination: r.email, permission: r.preferred_channel === 'email' ? 'preferred' : 'permitted' },
    ...(r.sms_opt_in
      ? [
          {
            channel: 'sms' as const,
            destination: r.phone_e164,
            permission: r.preferred_channel === 'text' ? ('preferred' as const) : ('permitted' as const),
          },
        ]
      : []),
  ]
  return {
    requestId: r.id,
    projectId: r.project_id,
    reference: r.reference,
    state: r.state,
    contactId: r.contact_id,
    fullName: r.full_name,
    responsibleStaffId: r.responsible_staff_id && UUID_RE.test(r.responsible_staff_id) ? r.responsible_staff_id : null,
    destinations,
  }
}

/**
 * Where a question's reminder stands for "Closed—no response" (TSK-0148, OWN-DEC-208): 'sent' while one of its
 * deliveries (any reminder subject) is sent or delivered now, from the earliest time such a delivery first succeeded
 * (a bounced one no longer counts, so a later send by another channel is the actual send); 'pending' while one is
 * still a draft or queued (handed to the provider is not sent); 'failed' when the rest failed or were suppressed (staff
 * follow-up, never customer non-response); 'none' when nothing was scheduled or only cancelled rows exist.
 */
export type ReminderStanding = { state: 'sent'; sentAt: Date } | { state: 'pending' | 'failed' | 'none'; sentAt: null }

export async function reminderStanding(db: Reader, questionId: string): Promise<ReminderStanding> {
  const rows = await db
    .selectFrom('platform.message_deliveries as d')
    .select([
      'd.state',
      sql<Date | null>`coalesce((SELECT min(e.occurred_at) FROM platform.message_delivery_events e
        WHERE e.delivery_id = d.id AND e.to_state IN ('sent', 'delivered')), d.status_at, d.sent_at)`.as(
        'succeeded_at',
      ),
    ])
    .where('d.message_key', '=', QUESTION_REMINDER)
    .where('d.subject_key', 'in', reminderSubjects(questionId))
    .execute()
  const sent = rows.filter((r) => r.state === 'sent' || r.state === 'delivered')
  if (sent.length) {
    const times = sent.map((r) => (r.succeeded_at ? new Date(r.succeeded_at).getTime() : Number.POSITIVE_INFINITY))
    const first = Math.min(...times)
    if (Number.isFinite(first)) return { state: 'sent', sentAt: new Date(first) }
    // A success with no recorded time is still a success: the question's recorded send time stands in for it.
    const q = await db
      .selectFrom('intake.questions')
      .select(['first_reminder_sent_at', 'final_reminder_sent_at'])
      .where('id', '=', questionId)
      .executeTakeFirst()
    const at = q?.final_reminder_sent_at ?? q?.first_reminder_sent_at
    if (at) return { state: 'sent', sentAt: at }
  }
  if (rows.some((r) => r.state === 'draft' || r.state === 'queued')) return { state: 'pending', sentAt: null }
  if (rows.some((r) => r.state === 'failed' || r.state === 'suppressed')) return { state: 'failed', sentAt: null }
  return { state: 'none', sentAt: null }
}

/**
 * Whether the customer responded in a way that keeps the request from "Closed—no response" (TSK-0148, OWN-DEC-208 "if
 * the customer replied"; PROPOSED reading, OQ-QUESTION-AMENDMENT-DETAILS): a reply to any question of the request, or
 * a message of the customer placed on the project (portal, text or email), after `since` (the reminder's send); or a
 * reply or customer message staff have not reviewed yet (its queue item is still open).
 */
export async function customerResponded(
  db: Reader,
  input: { requestId: string; projectId: string; since: Date | null },
): Promise<boolean> {
  const waiting = await db
    .selectFrom('ops.queue_items')
    .select('id')
    .where('resolved_at', 'is', null)
    .where((eb) =>
      eb.or([
        eb.and([eb('type', '=', 'question_replied'), eb('subject_id', '=', input.requestId)]),
        eb.and([eb('type', '=', 'customer_replied'), eb('project_id', '=', input.projectId)]),
      ]),
    )
    .limit(1)
    .executeTakeFirst()
  if (waiting) return true
  if (!input.since) return false
  const reply = await db
    .selectFrom('intake.question_replies')
    .select('id')
    .where('request_id', '=', input.requestId)
    .where('created_at', '>', input.since)
    .limit(1)
    .executeTakeFirst()
  if (reply) return true
  const message = await db
    .selectFrom('comms.messages')
    .select('id')
    .where('project_id', '=', input.projectId)
    .where('direction', '=', 'inbound')
    .where('received_at', '>', input.since)
    .limit(1)
    .executeTakeFirst()
  return message !== undefined
}

/** Whether any delivery of this subject is sent or delivered now (a later bounce takes a success back). */
export async function sentNow(db: Reader, messageKey: string, subjectKey: string): Promise<boolean> {
  const row = await db
    .selectFrom('platform.message_deliveries')
    .select('id')
    .where('message_key', '=', messageKey)
    .where('subject_key', '=', subjectKey)
    .where('state', 'in', ['sent', 'delivered'])
    .limit(1)
    .executeTakeFirst()
  return row !== undefined
}
