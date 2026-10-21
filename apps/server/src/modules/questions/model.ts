// Staff questions: shared rules and reads (TSK-0051; HH-LEAD-03, HH-LEAD-06, HH-COM-05, HH-COM-06, ENT-Question,
// OWN-DEC-98, OWN-DEC-101, FACT-REMINDER-CADENCES, FACT-REOPEN-PERIOD).
// - A question's notice and its two reminders are deliveries of the notifications module whose subject names the
//   question: `question:<id>` for the automatic notice (one per question, channel and destination, so a retry never
//   sends a second notice), `question:<id>:first` and `question:<id>:final` for the staff-released reminder drafts.
// - The notice goes to the contact of the project's request: by email, and by text too when the request gave the SMS
//   opt-in; the notifications module rechecks consent at send time, so a STOP suppresses the text (HH-COM-05).
// - Its link opens the question in the portal (`/portal/p/<reference>#question-<id>`), which shows it only to a
//   verified session of that project; the link itself grants nothing (HH-ID-04). Without a public site URL there is no
//   truthful link and the template's value is left out (the delivery records template_values_missing).
// - The cadence is the configured reminders.cadences.unansweredQuestion (first 24 h and final 48 h after the notice's
//   successful send; close 24 h after the final reminder was actually sent, OWN-DEC-101) and the reopen period is
//   request.reopen_period (30 days, FACT-REOPEN-PERIOD). While either is NOT CONFIGURED nothing is guessed: no
//   reminder is drafted, and closing or reopening is refused.
import type { Db, Tx } from '@handyhub/db'
import { REQUEST_CLOSED_STATES, type RequestState } from '@handyhub/domain'
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
export const REMINDER_STAGES = ['first', 'final'] as const
export type ReminderStage = (typeof REMINDER_STAGES)[number]

/** The longest question (the column's limit). */
export const QUESTION_MAX_LENGTH = 2000
/** The longest reply or portal message (PROPOSED; the reply column's limit). */
export const REPLY_MAX_LENGTH = 5000

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const noticeSubject = (questionId: string) => `question:${questionId}`
export const reminderSubject = (questionId: string, stage: ReminderStage) => `question:${questionId}:${stage}`

/** The question (and reminder stage) a delivery subject names, or null. */
export function subjectOf(subject: string): { questionId: string; stage: ReminderStage | null } | null {
  const m = /^question:([0-9a-f-]{36})(?::(first|final))?$/i.exec(subject)
  if (!m || !UUID_RE.test(m[1] as string)) return null
  return { questionId: (m[1] as string).toLowerCase(), stage: (m[2] as ReminderStage | undefined) ?? null }
}

/** The portal page of the question, through the project's verified access; null while no public URL is configured. */
export function questionLink(baseUrl: string | undefined, reference: string, questionId: string): string | null {
  if (!baseUrl) return null
  return `${baseUrl.replace(/\/$/, '')}/portal/p/${encodeURIComponent(reference)}#question-${questionId}`
}

export type Cadence = {
  firstHours: number
  finalHours: number
  closeAfterFinalHours: number
  contactHoursOnly: boolean
}

/** reminders.cadences.unansweredQuestion, or null while NOT CONFIGURED. */
export function questionCadence(config: Config): Cadence | null {
  const c = config.get('reminders.cadences')
  return c.state === 'CONFIGURED' ? c.value.unansweredQuestion : null
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
    responsibleStaffId: r.responsible_staff_id && UUID_RE.test(r.responsible_staff_id) ? r.responsible_staff_id : null,
    destinations,
  }
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
