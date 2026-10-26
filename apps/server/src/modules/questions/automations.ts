// The automations of staff questions (TSK-0051; HH-LEAD-03, HH-LEAD-06, HH-COM-05, HH-COM-06, HH-COM-09, HH-AUTO-01,
// HH-ARC-08, T65, OWN-DEC-98, OWN-DEC-101, FACT-AUTOMATIC-MESSAGES rows 4 and "staff notifications",
// FACT-REMINDER-CADENCES).
// - notify.question.notice: the automatic question notice, triggered by the committed question.published event while
//   question.notice is on messages.automatic. Its wording is the owner's (OWN-DEC-98, template version 1 of migration
//   0008). One delivery per question, channel and destination; a failed one is a delivery issue with Retry and never
//   starts the reminder clock.
// - notify.staff_notice.customer_reply: the automatic staff notification of a customer's reply, to the responsible
//   staff member (by email, in their own interface language), in the owner's staff_customer_replied wording
//   (OWN-DEC-151; Spanish AI-reviewed). TSK-0120 supplies its values and adds the conversation's replies, grouped (see
//   replyStaffNoticeAutomation); the queue items carry the reply to staff either way.
// - questions.delivery_outcome: a question's notice or reminder whose delivery succeeded records the time once on the
//   question. TSK-0121 (OWN-DEC-153 item 2): the notice's successful send schedules the one automatic reminder, due
//   72 hours later (reminders.cadences.unansweredQuestion.afterDeliveryHours): one delivery per destination (email,
//   and text with the SMS opt-in, which waits for the recipient's permitted hours), sent by notify.release in the
//   owner's question_reminder wording. A failed notice never starts the clock. The reminder's actual send schedules
//   the "may close" queue item 24 hours later (closeAfterReminderHours, OWN-DEC-208).
// - questions.reminder_plan: plans the reminder of a question whose notice was sent before TSK-0121 (migration 0075).
// - questions.close_available: 24 hours after the reminder was actually sent, the queue item says the request may be
//   closed "Closed—no response" (staff decide; nothing closes on its own). A failed reminder never gets there: it is a
//   delivery issue for staff follow-up (OWN-DEC-208).
// - questionRecordCheck: the send-time recheck of a reminder (HH-COM-05): an answered question, a closed request or a
//   notice whose delivery no longer stands cancels it (record_changed).
// - questions.reminder_outcome (TSK-0148, OWN-DEC-197 E4, OWN-DEC-208): every success or failure of a reminder's
//   delivery, at send time or reported later by the provider (a bounce), keeps the request's question_reminder item in
//   line: a reminder whose deliveries all failed opens it as "question_reminder_failed" for the responsible staff
//   member's follow-up (never customer non-response); once a reminder of each unanswered question stands again, that
//   follow-up resolves. questions.close_available opens "may close" only while the reminder stands, no follow-up is
//   due and the customer has not responded since.
import type { Tx } from '@handyhub/db'
import { sql } from 'kysely'
import type { Automation, JobOutcome } from '../../platform/automation.js'
import { loadConfig } from '../../platform/config/index.js'
import { scheduleJob } from '../../platform/jobs.js'
import { afterElapsedHours } from '@handyhub/domain'
import { labelKey, staffTranslator, type StaffKey } from '@handyhub/i18n'
import { listingScope } from '@handyhub/policy'
import {
  businessZone,
  firstNameOf,
  instantText,
  notificationAutomation,
  present,
  scheduleAutomaticDelivery,
  staffLink,
  type FailureItem,
  type NotificationProviders,
  type RecordCheck,
  type ReleaseFailureItem,
  type ReleaseValues,
} from '../notifications/index.js'
import { openQueueItem } from '../queue/items.js'
import { reminderFollowUpNeeded, syncReminderFollowUp } from './staff-routes.js'
import {
  customerResponded,
  HOUR_MS,
  isClosedState,
  noticeSubject,
  noticeTarget,
  QUESTION_NOTICE,
  QUESTION_PUBLISHED,
  QUESTION_REMINDER,
  QUESTION_REPLIED,
  questionCadence,
  questionLink,
  reminderStanding,
  reminderSubject,
  REPLY_STAFF_NOTICE,
  sentNow,
  subjectOf,
  UUID_RE,
} from './model.js'

const DELIVERY_SUCCEEDED = 'message.delivery_succeeded'
const DELIVERY_FAILED = 'message.delivery_failed'

export type QuestionAutomationDeps = {
  providers: NotificationProviders
  /** The public site's base URL for the question link; undefined while not configured (no link is made up). */
  publicSiteUrl: string | undefined
  /** The staff app's base URL for the staff notice's link; undefined while not configured. */
  staffAppUrl?: string | undefined
}

/** The automatic question notice (FACT-AUTOMATIC-MESSAGES row 4). */
export function questionNoticeAutomation(deps: QuestionAutomationDeps): Automation {
  return notificationAutomation({
    messageKey: QUESTION_NOTICE,
    providers: deps.providers,
    resolve: async ({ tx, job }) => {
      const id = job.target.id
      if (!id || !UUID_RE.test(id)) return 'stale'
      const q = await tx
        .selectFrom('intake.questions')
        .select(['id', 'request_id', 'state'])
        .where('id', '=', id)
        .executeTakeFirst()
      // Answered before the notice went out, or the request closed since: nothing to send.
      if (!q || q.state !== 'published') return 'stale'
      const target = await noticeTarget(tx, q.request_id)
      if (!target || isClosedState(target.state)) return 'stale'
      const link = questionLink(deps.publicSiteUrl, target.reference, q.id)
      return {
        subjectKey: noticeSubject(q.id),
        // About the request: a successful send is a meaningful response for its first-response clock (TSK-0043).
        record: { type: 'request', id: target.requestId },
        recipients: [{ kind: 'customer_contact', id: target.contactId, destinations: target.destinations }],
        // TSK-0119: the owner-style notice greets the first name and names the request reference (OWN-DEC-158).
        values: {
          customerName: firstNameOf(target.fullName),
          reference: target.reference,
          ...(link ? { projectLink: link } : {}),
        },
        failureItem: {
          reference: target.reference,
          projectId: target.projectId,
          assignedStaffId: target.responsibleStaffId,
        },
        projectId: target.projectId,
      }
    },
  })
}

/**
 * The automatic staff notification of a customer's reply (FACT-AUTOMATIC-MESSAGES "staff notifications",
 * staff_customer_replied of OWN-DEC-151). TSK-0120: from a reply to a question (question.customer_replied) and from the
 * first customer message of a conversation since staff last handled it (conversation.customer_replied):
 * - authorized assigned staff only: the responsible staff member of the request (question) or project (conversation),
 *   with an active account and a role that may see the record (request.view, message.reply); nobody else, and no one
 *   is invented when none is assigned (the unassigned queue item is the notice);
 * - deduplicated and grouped: the subject is the open queue item the reply belongs to (question_replied of the
 *   request, customer_replied of the conversation), so replies while that item stays open send one notice, and a
 *   retried job or a redelivered event sends nothing more;
 * - in the staff member's own language (English or Spanish), with the customer's display name, the project reference,
 *   when the reply arrived (business zone), the project's status and the staff app link; never the message text.
 */
export function replyStaffNoticeAutomation(deps: QuestionAutomationDeps): Automation {
  return notificationAutomation({
    messageKey: REPLY_STAFF_NOTICE,
    providers: deps.providers,
    resolve: async ({ tx, job }) => {
      const conversation = job.eventType === CONVERSATION_REPLIED
      const subject = conversation
        ? await conversationReplySubject(tx, job.payload)
        : await questionReplySubject(tx, job.target.id)
      if (!subject) return 'stale'
      const p = await tx
        .selectFrom('crm.projects as p')
        .innerJoin('crm.customers as cu', 'cu.id', 'p.customer_id')
        .select(['p.id', 'p.reference', 'p.state', 'p.responsible_staff_id', 'cu.display_name'])
        .where('p.id', '=', subject.projectId)
        .executeTakeFirst()
      if (!p) return 'stale'
      const responsible = conversation ? p.responsible_staff_id : subject.requestResponsible
      // No responsible staff member: the queue item (unassigned) is the notification; no one is invented.
      if (!responsible || !UUID_RE.test(responsible)) return 'stale'
      const staff = await tx
        .selectFrom('identity.staff_users')
        .select(['id', 'email', 'locale', 'display_name'])
        .where('id', '=', responsible)
        .where('status', '=', 'active')
        .executeTakeFirst()
      if (!staff) return 'stale'
      const grants = await tx
        .selectFrom('identity.role_grants')
        .select(['kind', 'name'])
        .where('staff_user_id', '=', staff.id)
        .where('ended_at', 'is', null)
        .where('effective_from', '<=', sql<Date>`now()`)
        .execute()
      const roles = grants.filter((g) => g.kind === 'role').map((g) => g.name)
      const capabilities = grants.filter((g) => g.kind === 'capability').map((g) => g.name)
      if (listingScope(roles, capabilities, conversation ? 'message.reply' : 'request.view') === 'none') return 'stale'
      const locale = staff.locale === 'es' ? 'es' : 'en'
      const zone = businessZone(await loadConfig(tx))
      const link = staffLink(deps.staffAppUrl, `requests/${subject.requestId}`)
      return {
        subjectKey: subject.key,
        record: { type: 'request', id: subject.requestId },
        recipients: [
          {
            kind: 'staff_user',
            id: staff.id,
            staffLocale: locale,
            destinations: [{ channel: 'email', destination: staff.email, permission: 'staff_account' }],
          },
        ],
        values: present({
          staffName: staff.display_name,
          customerName: p.display_name,
          reference: p.reference,
          receivedDateTime: zone ? instantText(subject.at, zone, locale === 'es' ? 'es-US' : 'en-US') : null,
          projectStatus: staffTranslator(locale).t(labelKey('projectState', p.state) as StaffKey),
          staffProjectLink: link,
          appLink: link,
        }),
        projectId: p.id,
      }
    },
  })
}

const CONVERSATION_REPLIED = 'conversation.customer_replied'

type ReplySubject = {
  key: string
  projectId: string
  requestId: string
  requestResponsible: string | null
  at: Date
}

/** A question reply's notice subject: the question_replied item of its request that the reply opened or refreshed. */
async function questionReplySubject(tx: Tx, replyId: string | null): Promise<ReplySubject | null> {
  if (!replyId || !UUID_RE.test(replyId)) return null
  const r = await tx
    .selectFrom('intake.question_replies as qr')
    .innerJoin('intake.requests as r', 'r.id', 'qr.request_id')
    .select(['qr.id', 'qr.created_at', 'r.id as request_id', 'r.project_id', 'r.responsible_staff_id'])
    .where('qr.id', '=', replyId)
    .executeTakeFirst()
  if (!r) return null
  const item = await tx
    .selectFrom('ops.queue_items')
    .select('id')
    .where('type', '=', 'question_replied')
    .where('subject_id', '=', r.request_id)
    .where('opened_at', '<=', r.created_at)
    .orderBy('opened_at', 'desc')
    .limit(1)
    .executeTakeFirst()
  return {
    key: item ? `question_replied:${item.id}` : `question_reply:${r.id}`,
    projectId: r.project_id,
    requestId: r.request_id,
    requestResponsible: r.responsible_staff_id,
    at: new Date(r.created_at),
  }
}

/** A conversation's notice subject: the customer_replied item the event names, while the project has a request. */
async function conversationReplySubject(tx: Tx, payload: Record<string, unknown>): Promise<ReplySubject | null> {
  const itemId = typeof payload['itemId'] === 'string' && UUID_RE.test(payload['itemId']) ? payload['itemId'] : null
  const projectId =
    typeof payload['projectId'] === 'string' && UUID_RE.test(payload['projectId']) ? payload['projectId'] : null
  const at = typeof payload['at'] === 'string' ? new Date(payload['at']) : null
  if (!itemId || !projectId || !at || Number.isNaN(at.getTime())) return null
  const request = await tx
    .selectFrom('intake.requests')
    .select(['id', 'responsible_staff_id'])
    .where('project_id', '=', projectId)
    .orderBy('submitted_at')
    .limit(1)
    .executeTakeFirst()
  if (!request) return null
  return {
    key: `customer_replied:${itemId}`,
    projectId,
    requestId: request.id,
    requestResponsible: request.responsible_staff_id,
    at,
  }
}

const SCHEDULE_RETRY = { maxAttempts: 5, baseDelayMs: 1_000, maxDelayMs: 60_000 } as const

/**
 * Schedules the one automatic reminder of an unanswered question (TSK-0121): due the configured hours after the
 * notice's successful send, while the question is unanswered, the request open and the notice still stands. Idempotent
 * (one delivery per subject and destination). Nothing while the cadence is NOT CONFIGURED.
 */
export async function planQuestionReminder(
  tx: Tx,
  input: { questionId: string; noticeSentAt: Date; requestId: string },
): Promise<JobOutcome> {
  const q = await tx
    .selectFrom('intake.questions')
    .select(['id', 'request_id', 'state', 'first_reminder_sent_at', 'final_reminder_sent_at'])
    .where('id', '=', input.questionId)
    .forUpdate()
    .executeTakeFirst()
  // Reminders stop when the customer replies (OWN-DEC-101); one reminder per question (a reminder sent before
  // TSK-0121 was it).
  if (!q || q.state !== 'published' || q.first_reminder_sent_at || q.final_reminder_sent_at) return 'cancelled'
  const target = await noticeTarget(tx, q.request_id)
  if (!target || isClosedState(target.state)) return 'cancelled'
  // A notice whose delivery failed since (a bounce after acceptance) never counts as non-response.
  if (!(await sentNow(tx, QUESTION_NOTICE, noticeSubject(q.id)))) return 'cancelled'
  const config = await loadConfig(tx)
  const cadence = questionCadence(config)
  if (!cadence) return 'cancelled'
  const scheduled = await scheduleAutomaticDelivery(tx, {
    config,
    messageKey: QUESTION_REMINDER,
    recipient: { kind: 'customer_contact', id: target.contactId, destinations: target.destinations },
    subjectKey: reminderSubject(q.id),
    record: { type: 'question', id: q.id },
    projectId: target.projectId,
    dueAt: afterElapsedHours(input.noticeSentAt, cadence.afterDeliveryHours),
    requestId: input.requestId,
    process: 'system.questions',
  })
  return scheduled.state === 'scheduled' ? 'done' : 'cancelled'
}

/** Plans the reminder of a question whose notice was sent before TSK-0121 (migration 0075). */
export function questionReminderPlanAutomation(): Automation {
  return {
    name: 'questions.reminder_plan',
    trigger: { kind: 'schedule', description: 'one job per question whose notice was sent, to plan its reminder' },
    identity: 'system.questions',
    inputs: { description: 'the question; the records read when the job runs', version: 1 },
    idempotency: 'one delivery per question reminder and destination (the delivery tuple)',
    effect: 'schedules the one automatic reminder of an unanswered question',
    retry: SCHEDULE_RETRY,
    timeoutMs: 10_000,
    exceptionOwner: 'office',
    audit: { action: 'question.reminder_plan' },
    handle: async ({ tx, job }) => {
      const id = String(job.payload['questionId'] ?? job.target.id ?? '')
      if (!UUID_RE.test(id)) return 'cancelled'
      const q = await tx
        .selectFrom('intake.questions')
        .select(['notice_sent_at'])
        .where('id', '=', id)
        .executeTakeFirst()
      if (!q?.notice_sent_at) return 'cancelled'
      return planQuestionReminder(tx, { questionId: id, noticeSentAt: q.notice_sent_at, requestId: job.requestId })
    },
  }
}

/**
 * The values of the owner's question_reminder wording, read when it sends (TSK-0121, OWN-DEC-151, OWN-DEC-158): the
 * first name ("Hi there," without one), the request reference and the question's page in the portal.
 */
export function questionReminderValues(publicSiteUrl: string | undefined): ReleaseValues {
  return async (tx, row) => {
    if (row.message_key !== QUESTION_REMINDER) return undefined
    const subject = subjectOf(row.subject_key)
    if (!subject) return {}
    const q = await tx
      .selectFrom('intake.questions')
      .select(['id', 'request_id'])
      .where('id', '=', subject.questionId)
      .executeTakeFirst()
    if (!q) return {}
    const target = await noticeTarget(tx, q.request_id)
    if (!target) return {}
    return present({
      customerName: firstNameOf(target.fullName),
      reference: target.reference,
      projectLink: questionLink(publicSiteUrl, target.reference, q.id),
    })
  }
}

/** 24 hours after the reminder was actually sent: the request may be closed "Closed—no response" (OWN-DEC-208). */
export function closeAvailableAutomation(): Automation {
  return {
    name: 'questions.close_available',
    trigger: { kind: 'schedule', description: 'one job per question, the configured hours after its reminder' },
    identity: 'system.questions',
    inputs: { description: 'the question; the records read when the job runs', version: 1 },
    idempotency: 'one open queue item per request (the queue keeps one item per type and subject)',
    effect: 'tells staff in the action queue that the request may be closed "Closed—no response"',
    retry: SCHEDULE_RETRY,
    timeoutMs: 10_000,
    exceptionOwner: 'office',
    audit: { action: 'question.close_available' },
    handle: async ({ tx, job }) => {
      const id = String(job.payload['questionId'] ?? '')
      if (!UUID_RE.test(id)) return 'cancelled'
      const q = await tx
        .selectFrom('intake.questions')
        .select(['id', 'request_id', 'state'])
        .where('id', '=', id)
        .executeTakeFirst()
      if (!q || q.state !== 'published') return 'cancelled'
      const target = await noticeTarget(tx, q.request_id)
      if (!target || target.state !== 'needs_information') return 'cancelled'
      // TSK-0148: a failed reminder is staff follow-up, never "may close"; a reminder that no longer stands or a
      // customer response since it was sent says nothing about closing.
      if (await reminderFollowUpNeeded(tx, target.requestId)) {
        await syncReminderFollowUp(tx, target.requestId)
        return 'done'
      }
      const standing = await reminderStanding(tx, q.id)
      if (standing.state !== 'sent') return 'cancelled'
      if (
        await customerResponded(tx, {
          requestId: target.requestId,
          projectId: target.projectId,
          since: standing.sentAt,
        })
      )
        return 'cancelled'
      await openQueueItem(tx, {
        type: 'question_reminder',
        subjectId: target.requestId,
        reason: 'no_response_close_available',
        projectId: target.projectId,
        reference: target.reference,
        status: target.state,
        assignedStaffId: target.responsibleStaffId,
      })
      return 'done'
    },
  }
}

/** The scheduling declaration (the worker's own instance runs it; scheduling needs only the declaration). */
export const CLOSE_AVAILABLE_JOB = closeAvailableAutomation()

/** Records the successful send of a question's notice or reminder, once, and schedules what follows it. */
export function questionDeliveryAutomation(): Automation {
  return {
    name: 'questions.delivery_outcome',
    trigger: { kind: 'event', eventTypes: [DELIVERY_SUCCEEDED] },
    identity: 'system.questions',
    inputs: { description: 'the delivery id and the time it succeeded; the delivery row as it is now', version: 1 },
    idempotency: 'each time is recorded once (the first success); the follow-up jobs are keyed per question and stage',
    effect: 'records when a question notice or reminder was actually sent and schedules what follows it',
    retry: SCHEDULE_RETRY,
    timeoutMs: 10_000,
    exceptionOwner: 'office',
    audit: { action: 'question.delivery_recorded' },
    handle: async ({ tx, job }) => {
      const deliveryId = job.target.id
      const at = typeof job.payload['at'] === 'string' ? new Date(job.payload['at']) : null
      if (!deliveryId || !at || Number.isNaN(at.getTime())) return 'cancelled'
      const d = await tx
        .selectFrom('platform.message_deliveries')
        .select(['id', 'message_key', 'audience', 'subject_key', 'state'])
        .where('id', '=', deliveryId)
        .forShare()
        .executeTakeFirst()
      if (!d || d.audience !== 'customer') return 'cancelled'
      if (d.message_key !== QUESTION_NOTICE && d.message_key !== QUESTION_REMINDER) return 'cancelled'
      // Only a delivery that is sent or delivered now counts (an outcome it has moved past records nothing).
      if (d.state !== 'sent' && d.state !== 'delivered') return 'cancelled'
      const subject = subjectOf(d.subject_key)
      if (!subject) return 'cancelled'
      const q = await tx
        .selectFrom('intake.questions')
        .select(['id', 'notice_sent_at', 'first_reminder_sent_at', 'final_reminder_sent_at'])
        .where('id', '=', subject.questionId)
        .forUpdate()
        .executeTakeFirst()
      if (!q) return 'cancelled'
      // The single automatic reminder is recorded as the final one (the only reminder there is, OWN-DEC-153).
      const column =
        d.message_key === QUESTION_NOTICE
          ? subject.stage === null
            ? 'notice_sent_at'
            : null
          : subject.stage === 'first'
            ? 'first_reminder_sent_at'
            : subject.stage === 'final' || subject.stage === 'reminder'
              ? 'final_reminder_sent_at'
              : null
      if (!column || q[column] !== null) return 'cancelled'
      await tx
        .updateTable('intake.questions')
        .set({ [column]: at, version: sql<number>`version + 1` })
        .where('id', '=', q.id)
        .execute()
      if (column === 'notice_sent_at') {
        await planQuestionReminder(tx, { questionId: q.id, noticeSentAt: at, requestId: job.requestId })
        return 'done'
      }
      const cadence = questionCadence(await loadConfig(tx))
      // NOT CONFIGURED: the send is recorded; no closing time is guessed.
      if (!cadence) return 'done'
      if (column === 'final_reminder_sent_at')
        await scheduleJob(tx, CLOSE_AVAILABLE_JOB, {
          key: q.id,
          runAt: new Date(at.getTime() + cadence.closeAfterReminderHours * HOUR_MS),
          payload: { questionId: q.id },
          target: { type: 'question', id: q.id },
          requestId: job.requestId,
        })
      return 'done'
    },
  }
}

/**
 * A question reminder's delivery succeeded or failed (TSK-0148, OWN-DEC-208): the request's follow-up item is opened
 * when every delivery of an unanswered question's reminder failed, and resolved when none has any more.
 */
export function questionReminderOutcomeAutomation(): Automation {
  return {
    name: 'questions.reminder_outcome',
    trigger: { kind: 'event', eventTypes: [DELIVERY_SUCCEEDED, DELIVERY_FAILED] },
    identity: 'system.questions',
    inputs: {
      description: 'the delivery whose outcome was recorded; the request’s reminders as they are now',
      version: 1,
    },
    idempotency:
      'one open queue item per request (the queue keeps one item per type and subject), computed from the records',
    effect: 'opens or resolves the staff follow-up of a question reminder that failed to deliver',
    retry: SCHEDULE_RETRY,
    timeoutMs: 10_000,
    exceptionOwner: 'office',
    audit: { action: 'question.reminder_outcome' },
    handle: async ({ tx, job }) => {
      const id = job.target.id
      if (!id || !UUID_RE.test(id)) return 'cancelled'
      const d = await tx
        .selectFrom('platform.message_deliveries')
        .select(['message_key', 'record_type', 'record_id'])
        .where('id', '=', id)
        .executeTakeFirst()
      if (!d || d.message_key !== QUESTION_REMINDER || d.record_type !== 'question') return 'cancelled'
      if (!d.record_id || !UUID_RE.test(d.record_id)) return 'cancelled'
      const q = await tx
        .selectFrom('intake.questions')
        .select('request_id')
        .where('id', '=', d.record_id)
        .executeTakeFirst()
      if (!q) return 'cancelled'
      // The request row orders this against a reply or a close of the same request.
      await tx.selectFrom('intake.requests').select('id').where('id', '=', q.request_id).forUpdate().execute()
      await syncReminderFollowUp(tx, q.request_id)
      return 'done'
    },
  }
}

/**
 * Send-time recheck of a question reminder (HH-COM-05): an answered question, a closed request or a notice whose
 * delivery no longer stands (a bounce after acceptance: never a customer non-response) cancels it.
 */
export const questionRecordCheck: RecordCheck = async (tx, input) => {
  if (input.messageKey !== QUESTION_REMINDER) return 'current'
  if (!UUID_RE.test(input.recordId)) return 'stale'
  const q = await tx
    .selectFrom('intake.questions as q')
    .innerJoin('intake.requests as r', 'r.id', 'q.request_id')
    .select(['q.id', 'q.state', 'r.state as request_state'])
    .where('q.id', '=', input.recordId)
    .executeTakeFirst()
  if (!q || q.state !== 'published' || isClosedState(q.request_state)) return 'stale'
  if (!(await sentNow(tx, QUESTION_NOTICE, noticeSubject(q.id)))) return { stale: 'notice_not_delivered' }
  return 'current'
}

/** A failed reminder opens a delivery issue on its request (HH-COM-02), owned by the responsible staff member. */
export const questionReminderFailureItem: ReleaseFailureItem = async (
  tx: Tx,
  row,
): Promise<FailureItem | undefined> => {
  if (row.message_key !== QUESTION_REMINDER || row.record_type !== 'question' || !row.record_id) return undefined
  if (!UUID_RE.test(row.record_id)) return undefined
  const q = await tx
    .selectFrom('intake.questions')
    .select('request_id')
    .where('id', '=', row.record_id)
    .executeTakeFirst()
  if (!q) return undefined
  const target = await noticeTarget(tx, q.request_id)
  if (!target) return undefined
  return { reference: target.reference, projectId: target.projectId, assignedStaffId: target.responsibleStaffId }
}

/** Every automation of staff questions, as the worker registers them. */
export function questionAutomations(deps: QuestionAutomationDeps): Automation[] {
  return [
    questionNoticeAutomation(deps),
    replyStaffNoticeAutomation(deps),
    questionDeliveryAutomation(),
    questionReminderPlanAutomation(),
    closeAvailableAutomation(),
    questionReminderOutcomeAutomation(),
  ]
}

export { QUESTION_PUBLISHED, QUESTION_REPLIED }
