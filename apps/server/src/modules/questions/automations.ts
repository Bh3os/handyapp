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
//   question: the notice's successful send schedules the two reminder drafts (first and final, both measured from it);
//   the final reminder's actual send schedules the "may close" queue item 24 hours later (configured cadence).
// - questions.reminder_draft: at its time, an unanswered question of an open request whose notice still stands
//   (sent or delivered now) gets its reminder drafts (email, and text with the SMS opt-in) and the request's
//   "reminder ready" queue item. Drafts are staff-released (FACT-AUTOMATIC-MESSAGES); no reminder wording was approved,
//   so a released reminder is recorded as template_not_configured with a delivery issue, never as sent.
// - questions.close_available: 24 hours after the final reminder was actually sent, the queue item says the request
//   may be closed "Closed—no response" (staff decide; nothing closes on its own).
// - questionRecordCheck: the send-time recheck of a released reminder (HH-COM-05): an answered question or a closed
//   request cancels it (record_changed).
import type { Tx } from '@handyhub/db'
import { sql } from 'kysely'
import type { Automation } from '../../platform/automation.js'
import { loadConfig } from '../../platform/config/index.js'
import { scheduleJob } from '../../platform/jobs.js'
import { labelKey, staffTranslator, type StaffKey } from '@handyhub/i18n'
import { listingScope } from '@handyhub/policy'
import {
  businessZone,
  createDraft,
  firstNameOf,
  instantText,
  notificationAutomation,
  present,
  staffLink,
  type FailureItem,
  type NotificationProviders,
  type RecordCheck,
  type ReleaseFailureItem,
} from '../notifications/index.js'
import { openQueueItem } from '../queue/items.js'
import {
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
  REMINDER_STAGES,
  reminderSubject,
  REPLY_STAFF_NOTICE,
  sentNow,
  subjectOf,
  UUID_RE,
  type ReminderStage,
} from './model.js'

const DELIVERY_SUCCEEDED = 'message.delivery_succeeded'

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

/** Drafts one stage's reminders of an unanswered question (scheduled from the notice's successful send). */
export function reminderDraftAutomation(deps: Pick<QuestionAutomationDeps, 'publicSiteUrl'>): Automation {
  return {
    name: 'questions.reminder_draft',
    trigger: { kind: 'schedule', description: 'one job per question and reminder stage, at the configured cadence' },
    identity: 'system.questions',
    inputs: { description: 'the question and the reminder stage; the records read when the job runs', version: 1 },
    idempotency: 'one draft per question, stage, channel and destination (the delivery tuple)',
    effect: 'creates the staff-released reminder drafts of an unanswered question and its queue item',
    retry: SCHEDULE_RETRY,
    timeoutMs: 10_000,
    exceptionOwner: 'office',
    audit: { action: 'question.reminder_drafted' },
    handle: async ({ tx, job }) => {
      const id = String(job.payload['questionId'] ?? '')
      const stage = job.payload['stage'] as ReminderStage
      if (!UUID_RE.test(id) || !(REMINDER_STAGES as readonly string[]).includes(stage)) return 'cancelled'
      const q = await tx
        .selectFrom('intake.questions')
        .select(['id', 'request_id', 'state'])
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirst()
      // Reminders stop when the customer replies (OWN-DEC-101).
      if (!q || q.state !== 'published') return 'cancelled'
      const target = await noticeTarget(tx, q.request_id)
      if (!target || isClosedState(target.state)) return 'cancelled'
      // A notice whose delivery failed since (a bounce after acceptance) never counts as non-response.
      if (!(await sentNow(tx, QUESTION_NOTICE, noticeSubject(q.id)))) return 'cancelled'
      const config = await loadConfig(tx)
      const link = questionLink(deps.publicSiteUrl, target.reference, q.id)
      for (const destination of target.destinations)
        await createDraft(tx, {
          config,
          messageKey: QUESTION_REMINDER,
          destination,
          recipient: { kind: 'customer_contact', id: target.contactId, destinations: [] },
          subjectKey: reminderSubject(q.id, stage),
          record: { type: 'question', id: q.id },
          values: link ? { projectLink: link } : {},
          projectId: target.projectId,
        })
      // Prominent in the action queue (OWN-DEC-101): one item per request, its reason the latest stage drafted.
      await openQueueItem(tx, {
        type: 'question_reminder',
        subjectId: target.requestId,
        reason: stage === 'first' ? 'question_reminder_first' : 'question_reminder_final',
        projectId: target.projectId,
        reference: target.reference,
        status: target.state,
        assignedStaffId: target.responsibleStaffId,
      })
      return 'done'
    },
  }
}

/** 24 hours after the final reminder was actually sent: the request may be closed "Closed—no response". */
export function closeAvailableAutomation(): Automation {
  return {
    name: 'questions.close_available',
    trigger: { kind: 'schedule', description: 'one job per question, the configured hours after its final reminder' },
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

/** The scheduling declarations (the worker's own instances run them; scheduling needs only the declaration). */
export const REMINDER_DRAFT_JOB = reminderDraftAutomation({ publicSiteUrl: undefined })
export const CLOSE_AVAILABLE_JOB = closeAvailableAutomation()

/** Records the successful send of a question's notice or reminder, once, and schedules what follows it. */
export function questionDeliveryAutomation(): Automation {
  return {
    name: 'questions.delivery_outcome',
    trigger: { kind: 'event', eventTypes: [DELIVERY_SUCCEEDED] },
    identity: 'system.questions',
    inputs: { description: 'the delivery id and the time it succeeded; the delivery row as it is now', version: 1 },
    idempotency: 'each time is recorded once (the first success); the follow-up jobs are keyed per question and stage',
    effect: 'records when a question notice or reminder was actually sent and schedules the reminder steps',
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
      const column =
        d.message_key === QUESTION_NOTICE
          ? subject.stage === null
            ? 'notice_sent_at'
            : null
          : subject.stage === 'first'
            ? 'first_reminder_sent_at'
            : subject.stage === 'final'
              ? 'final_reminder_sent_at'
              : null
      if (!column || q[column] !== null) return 'cancelled'
      await tx
        .updateTable('intake.questions')
        .set({ [column]: at, version: sql<number>`version + 1` })
        .where('id', '=', q.id)
        .execute()
      const cadence = questionCadence(await loadConfig(tx))
      // NOT CONFIGURED: the send is recorded; no reminder time is guessed.
      if (!cadence) return 'done'
      if (column === 'notice_sent_at')
        for (const stage of REMINDER_STAGES)
          await scheduleJob(tx, REMINDER_DRAFT_JOB, {
            key: `${q.id}:${stage}`,
            runAt: new Date(at.getTime() + (stage === 'first' ? cadence.firstHours : cadence.finalHours) * HOUR_MS),
            payload: { questionId: q.id, stage },
            target: { type: 'question', id: q.id },
            requestId: job.requestId,
          })
      if (column === 'final_reminder_sent_at')
        await scheduleJob(tx, CLOSE_AVAILABLE_JOB, {
          key: q.id,
          runAt: new Date(at.getTime() + cadence.closeAfterFinalHours * HOUR_MS),
          payload: { questionId: q.id },
          target: { type: 'question', id: q.id },
          requestId: job.requestId,
        })
      return 'done'
    },
  }
}

/** Send-time recheck of a released question reminder (HH-COM-05): answered, or a closed request, cancels it. */
export const questionRecordCheck: RecordCheck = async (tx, input) => {
  if (input.messageKey !== QUESTION_REMINDER) return 'current'
  if (!UUID_RE.test(input.recordId)) return 'stale'
  const q = await tx
    .selectFrom('intake.questions as q')
    .innerJoin('intake.requests as r', 'r.id', 'q.request_id')
    .select(['q.state', 'r.state as request_state'])
    .where('q.id', '=', input.recordId)
    .executeTakeFirst()
  if (!q || q.state !== 'published' || isClosedState(q.request_state)) return 'stale'
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
    reminderDraftAutomation(deps),
    closeAvailableAutomation(),
  ]
}

export { QUESTION_PUBLISHED, QUESTION_REPLIED }
