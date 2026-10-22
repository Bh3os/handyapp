// The automatic unanswered-estimate reminder and its stop rules (TSK-0060, TSK-0121; HH-EST-14, HH-COM-05, HH-COM-06,
// HH-COM-15, T65, S01, OWN-DEC-153, OWN-DEC-154, OWN-DEC-151, FACT-REMINDER-CADENCES, FACT-ESTIMATE-VALIDITY,
// ENT-Message, ENT-EstimateVersion, RULE-DECIDED-VALUES-ACTIVE, RULE-SERVER-AUTHZ, RULE-NO-INVENTED-FACTS).
// - One automatic reminder per estimate version (OWN-DEC-153 items 1 and 13): due the configured hours
//   (reminders.cadences.unansweredEstimate.afterDeliveryHours, 72 = 3 days) after the version was successfully
//   delivered, measured from the first successful delivery of its estimate-ready notice (message.delivery_succeeded);
//   no 24-hour reminder. A failed notice never starts the clock and is never a customer non-response: it is a staff
//   delivery issue. While the cadence is NOT CONFIGURED nothing is scheduled; no interval is made up.
// - Scheduled, then sent (notifications scheduleAutomaticDelivery): one queued delivery per destination (the email,
//   and the mobile number, whose text needs the SMS opt-in and waits for the permitted hours), due at that time, sent
//   by its notify.release job. Staff see it scheduled, sent, failed or cancelled with its reason; nobody releases it.
// - Content: the owner's estimate_reminder wording (OWN-DEC-151) with the first name, the estimate number and the links
//   to the estimate's page and the project in the portal, read when it sends; no amounts and no private details.
// - Stop rules (HH-EST-14), checked when it is scheduled and again by the send job (the send-time record check): the
//   version accepted, declined, expired (also past its valid-until time), withdrawn or superseded; any customer
//   response on the estimate since this version was published (Request Changes, Decline, Request an Updated
//   Estimate); a customer message on the project since then (an email or text matched or linked to it, or written in
//   the portal's Messages tab; an SMS keyword is consent, not a response); a reply to a staff question on the project
//   since then (TSK-0051); a conversation with the customer that staff recorded since then (PROPOSED); the project no
//   longer open. The lifecycle, response and approval transactions cancel the waiting reminder at once
//   (stopEstimateReminders), as do the transactions in which a customer message lands on the project or a question
//   reply is recorded (stopProjectEstimateReminders). Channel permission and consent are rechecked at send time.
// - Idempotency (OWN-DEC-153 item 7): the delivery tuple (message, channel, subject, destination) holds one row per
//   destination and the send presents its hash as the provider key; a version whose staff-released reminder (before
//   TSK-0121) was already sent or released gets no second one.
// - Not built here (later tasks): complaints (cases, TSK-0093) do not exist yet; when they do, reminderStopReason
//   checks them too.
import type { Db, Tx } from '@handyhub/db'
import { afterElapsedHours } from '@handyhub/domain'
import { sql } from 'kysely'
import { audit } from '../../platform/audit.js'
import type { Automation, JobOutcome } from '../../platform/automation.js'
import { type Config, loadConfig } from '../../platform/config/index.js'
import { currentContext } from '../../platform/request-context.js'
import {
  cancelWaitingDeliveries,
  contactDestinations,
  estimatePageLink,
  firstNameOf,
  NOTIFICATION_RETRY,
  portalLink,
  present,
  scheduleAutomaticDelivery,
  type FailureItem,
  type RecordCheck,
  type ReleaseFailureItem,
  type ReleaseValues,
} from '../notifications/index.js'
import { ESTIMATE_READY_MESSAGE_KEY } from './notify.js'

type Reader = Db | Tx

export const ESTIMATE_REMINDER_MESSAGE_KEY = 'reminder.unanswered_estimate'

/** Why the reminder of a version stops (HH-EST-14); 'conversation_recorded' is PROPOSED. */
export const REMINDER_STOP_REASONS = [
  'accepted',
  'declined',
  'expired',
  'withdrawn',
  'superseded',
  'not_published',
  'customer_responded',
  // A customer message on the project (TSK-0049, TSK-0050, TSK-0051 portal messages) or a question reply (TSK-0051).
  'customer_message',
  'question_replied',
  'conversation_recorded',
  'project_not_open',
] as const
export type ReminderStopReason = (typeof REMINDER_STOP_REASONS)[number]

const PROCESS = 'system.estimate_reminders'
const RECORD_TYPE = 'estimate_version'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The one automatic reminder of a version (TSK-0121). Staff-released drafts before it were `<subject>:first|final`. */
export const reminderSubjectKey = (versionId: string) => `estimate_reminder:${versionId}`

export type ReminderCadence =
  | {
      readonly state: 'CONFIGURED'
      readonly version: number
      readonly proposed: boolean
      readonly afterDeliveryHours: number
    }
  | { readonly state: 'NOT_CONFIGURED'; readonly version: number | null }

/** The configured unanswered-estimate cadence (FACT-REMINDER-CADENCES); NOT CONFIGURED when the key is unset. */
export function reminderCadence(config: Config): ReminderCadence {
  const entry = config.get('reminders.cadences')
  if (entry.state !== 'CONFIGURED') return { state: 'NOT_CONFIGURED', version: entry.version }
  return {
    state: 'CONFIGURED',
    version: entry.version,
    proposed: entry.proposed,
    afterDeliveryHours: entry.value.unansweredEstimate.afterDeliveryHours,
  }
}

/** When the reminder is due: the configured elapsed hours after the successful delivery (DST-safe). */
export function reminderDueAt(deliveredAt: Date, cadence: Extract<ReminderCadence, { state: 'CONFIGURED' }>): Date {
  return afterElapsedHours(deliveredAt, cadence.afterDeliveryHours)
}

const STATE_STOPS: Readonly<Record<string, ReminderStopReason>> = {
  accepted: 'accepted',
  declined: 'declined',
  expired: 'expired',
  withdrawn: 'withdrawn',
  superseded: 'superseded',
  draft: 'not_published',
  in_review: 'not_published',
}

/**
 * The stop rule of a version's reminder as the records are now (HH-EST-14): the reason it stops, or null while the
 * published version is still unanswered.
 */
export async function reminderStopReason(db: Reader, versionId: string, now: Date): Promise<ReminderStopReason | null> {
  if (!UUID_RE.test(versionId)) return 'not_published'
  const v = await db
    .selectFrom('estimating.estimate_versions as v')
    .innerJoin('crm.projects as p', 'p.id', 'v.project_id')
    .select([
      'v.id',
      'v.estimate_id',
      'v.project_id',
      'v.state',
      'v.valid_until',
      'v.published_at',
      'p.state as project',
    ])
    .where('v.id', '=', versionId)
    .executeTakeFirst()
  if (!v) return 'not_published'
  const byState = STATE_STOPS[v.state]
  if (byState) return byState
  if (v.state !== 'published' || !v.published_at) return 'not_published'
  if (!v.valid_until || v.valid_until.getTime() <= now.getTime()) return 'expired'
  if (v.project !== 'open') return 'project_not_open'
  const response = await db
    .selectFrom('estimating.customer_responses')
    .select('id')
    .where('estimate_id', '=', v.estimate_id)
    .where('created_at', '>=', v.published_at)
    .limit(1)
    .executeTakeFirst()
  if (response) return 'customer_responded'
  // Any customer message on the project since publishing: inbound email or text matched or linked to the project, or
  // a message written in the portal; an SMS keyword (STOP, START, HELP) is consent, not a response.
  const message = await db
    .selectFrom('comms.messages')
    .select('id')
    .where('project_id', '=', v.project_id)
    .where('direction', '=', 'inbound')
    .where('link_state', 'in', ['matched', 'linked'])
    .where('keyword', 'is', null)
    .where('received_at', '>=', v.published_at)
    .limit(1)
    .executeTakeFirst()
  if (message) return 'customer_message'
  const reply = await db
    .selectFrom('intake.question_replies')
    .select('id')
    .where('project_id', '=', v.project_id)
    .where('created_at', '>=', v.published_at)
    .limit(1)
    .executeTakeFirst()
  if (reply) return 'question_replied'
  const conversation = await db
    .selectFrom('intake.request_conversations')
    .select('id')
    .where('project_id', '=', v.project_id)
    .where('occurred_at', '>=', v.published_at)
    .limit(1)
    .executeTakeFirst()
  if (conversation) return 'conversation_recorded'
  return null
}

async function dbNow(tx: Reader): Promise<Date> {
  const r = await sql<{ now: Date }>`SELECT now() AS now`.execute(tx)
  return new Date((r.rows[0] as { now: Date }).now)
}

const requestIdOf = (versionId: string) => currentContext()?.requestId ?? `estimate-reminder:${versionId}`

/**
 * Cancels the version's waiting reminder when a stop rule now applies (HH-EST-14, OWN-DEC-153 item 4). Called in the
 * transaction of each change that can stop it (publishing a newer version, withdraw, expire, decline, the expiry job,
 * a customer response, the approval); the send-time check stops anything left. Returns the reason, or null.
 */
export async function stopEstimateReminders(tx: Tx, versionId: string): Promise<ReminderStopReason | null> {
  const reason = await reminderStopReason(tx, versionId, await dbNow(tx))
  if (!reason) return null
  await cancelWaitingDeliveries(tx, {
    messageKey: ESTIMATE_REMINDER_MESSAGE_KEY,
    recordType: RECORD_TYPE,
    recordId: versionId,
    reason,
    process: PROCESS,
    requestId: requestIdOf(versionId),
  })
  return reason
}

/**
 * Cancels the waiting reminder of every published version of a project whose stop rule now applies: called in the
 * transaction in which a customer message lands on the project (inbound matching, a staff link, a portal message) or a
 * question reply is recorded (HH-EST-14).
 */
export async function stopProjectEstimateReminders(tx: Tx, projectId: string): Promise<void> {
  const versions = await tx
    .selectFrom('estimating.estimate_versions')
    .select('id')
    .where('project_id', '=', projectId)
    .where('state', '=', 'published')
    .orderBy('id')
    .execute()
  for (const v of versions) await stopEstimateReminders(tx, v.id)
}

/** The send-time recheck of an estimate reminder (registered with the notifications module's release automation). */
export const estimateReminderRecordCheck: RecordCheck = async (tx, input) => {
  if (input.messageKey !== ESTIMATE_REMINDER_MESSAGE_KEY) return 'current'
  const reason = await reminderStopReason(tx, input.recordId, await dbNow(tx))
  return reason ? { stale: reason } : 'current'
}

/** The first successful delivery of the version's estimate-ready notice, or null while none succeeded. */
export async function estimateDeliveredAt(db: Reader, versionId: string): Promise<Date | null> {
  const row = await db
    .selectFrom('platform.message_deliveries')
    .select(sql<Date | null>`min(coalesce(status_at, sent_at, updated_at))`.as('at'))
    .where('message_key', '=', ESTIMATE_READY_MESSAGE_KEY)
    .where('record_type', '=', RECORD_TYPE)
    .where('record_id', '=', versionId)
    .where('audience', '=', 'customer')
    .where('state', 'in', ['sent', 'delivered'])
    .executeTakeFirst()
  return row?.at ? new Date(row.at) : null
}

/** A reminder of the version already released or sent before TSK-0121 (its staff-released drafts). */
async function earlierReminder(db: Reader, versionId: string): Promise<boolean> {
  const row = await db
    .selectFrom('platform.message_deliveries')
    .select('id')
    .where('message_key', '=', ESTIMATE_REMINDER_MESSAGE_KEY)
    .where('record_type', '=', RECORD_TYPE)
    .where('record_id', '=', versionId)
    .where('subject_key', '<>', reminderSubjectKey(versionId))
    .where((eb) =>
      eb.or([eb('state', 'in', ['queued', 'sent', 'delivered']), eb('provider_message_id', 'is not', null)]),
    )
    .limit(1)
    .executeTakeFirst()
  return row !== undefined
}

/**
 * Schedules the version's one automatic reminder from its successful delivery (unless a stop rule applies, the
 * cadence is NOT CONFIGURED or the reminder is not on the automatic list). Idempotent.
 */
export async function planEstimateReminder(
  tx: Tx,
  input: { versionId: string; deliveredAt: Date; requestId: string },
): Promise<JobOutcome> {
  const head = await tx
    .selectFrom('estimating.estimate_versions')
    .select(['estimate_id'])
    .where('id', '=', input.versionId)
    .executeTakeFirst()
  if (!head) return 'cancelled'
  // The lifecycle's lock order (estimate, then version), so a response, a publish or the expiry serializes with it.
  await tx.selectFrom('estimating.estimates').select('id').where('id', '=', head.estimate_id).forUpdate().execute()
  const v = await tx
    .selectFrom('estimating.estimate_versions as v')
    .innerJoin('crm.projects as p', 'p.id', 'v.project_id')
    .select(['v.id', 'v.project_id'])
    .where('v.id', '=', input.versionId)
    .forUpdate()
    .executeTakeFirstOrThrow()
  const reason = await reminderStopReason(tx, input.versionId, await dbNow(tx))
  const config = await loadConfig(tx)
  const cadence = reminderCadence(config)
  const skipped = reason ?? (cadence.state !== 'CONFIGURED' ? 'not_configured' : null)
  if (skipped || cadence.state !== 'CONFIGURED' || (await earlierReminder(tx, input.versionId))) {
    await audit.record(tx, {
      actor: { kind: 'system', process: PROCESS },
      action: 'estimate_reminder.not_scheduled',
      target: { type: RECORD_TYPE, id: input.versionId },
      summary: { messageKey: ESTIMATE_REMINDER_MESSAGE_KEY, reason: skipped ?? 'already_reminded' },
      requestId: input.requestId,
    })
    return 'cancelled'
  }
  const contact = await tx
    .selectFrom('intake.requests as r')
    .innerJoin('crm.contacts as c', 'c.id', 'r.contact_id')
    .select(['c.id', 'c.email', 'c.phone_e164', 'c.preferred_channel'])
    .where('r.project_id', '=', v.project_id)
    .orderBy('r.submitted_at')
    .limit(1)
    .executeTakeFirst()
  if (!contact) return 'cancelled'
  const scheduled = await scheduleAutomaticDelivery(tx, {
    config,
    messageKey: ESTIMATE_REMINDER_MESSAGE_KEY,
    recipient: { kind: 'customer_contact', id: contact.id, destinations: contactDestinations(contact) },
    subjectKey: reminderSubjectKey(input.versionId),
    record: { type: RECORD_TYPE, id: input.versionId },
    projectId: v.project_id,
    dueAt: reminderDueAt(input.deliveredAt, cadence),
    requestId: input.requestId,
    process: PROCESS,
  })
  return scheduled.state === 'scheduled' ? 'done' : 'cancelled'
}

/** The successful delivery of a version's estimate-ready notice schedules its reminder (TSK-0121). */
export function estimateReminderScheduleAutomation(): Automation {
  return {
    name: 'estimate.reminder_schedule',
    trigger: { kind: 'event', eventTypes: ['message.delivery_succeeded'] },
    identity: PROCESS,
    inputs: {
      description: 'the delivery that succeeded and when; the version, the cadence and the stop rules then',
      version: 2,
    },
    idempotency: 'one delivery per reminder subject and destination; the first successful delivery sets the time',
    effect: 'schedules the one automatic reminder of a published estimate version',
    retry: NOTIFICATION_RETRY,
    timeoutMs: 10_000,
    exceptionOwner: 'estimator',
    audit: { action: 'estimate_reminder.schedule' },
    handle: async ({ tx, job }): Promise<JobOutcome> => {
      // Jobs of the earlier trigger (estimate.version_published, before TSK-0121) schedule nothing.
      if (job.eventType !== 'message.delivery_succeeded') return 'cancelled'
      const deliveryId = job.target.id
      const at = typeof job.payload['at'] === 'string' ? new Date(job.payload['at']) : null
      if (!deliveryId || !UUID_RE.test(deliveryId) || !at || Number.isNaN(at.getTime())) return 'cancelled'
      const d = await tx
        .selectFrom('platform.message_deliveries')
        .select(['message_key', 'audience', 'record_type', 'record_id', 'state'])
        .where('id', '=', deliveryId)
        .executeTakeFirst()
      if (!d || d.message_key !== ESTIMATE_READY_MESSAGE_KEY || d.audience !== 'customer') return 'cancelled'
      if (d.record_type !== RECORD_TYPE || !d.record_id || !UUID_RE.test(d.record_id)) return 'cancelled'
      if (d.state !== 'sent' && d.state !== 'delivered') return 'cancelled'
      const first = (await estimateDeliveredAt(tx, d.record_id)) ?? at
      return planEstimateReminder(tx, {
        versionId: d.record_id,
        deliveredAt: first.getTime() < at.getTime() ? first : at,
        requestId: job.requestId,
      })
    },
  }
}

/**
 * Plans a version's reminder from its records (migration 0075: the versions published before TSK-0121): from the
 * first successful delivery of its estimate-ready notice, or nothing while none succeeded.
 */
export function estimateReminderPlanAutomation(): Automation {
  return {
    name: 'estimate.reminder_plan',
    trigger: { kind: 'schedule', description: 'one job per published estimate version to plan its reminder' },
    identity: PROCESS,
    inputs: { description: 'the version (job target); its deliveries, cadence and stop rules then', version: 1 },
    idempotency: 'one delivery per reminder subject and destination',
    effect: 'schedules the one automatic reminder of a published estimate version',
    retry: NOTIFICATION_RETRY,
    timeoutMs: 10_000,
    exceptionOwner: 'estimator',
    audit: { action: 'estimate_reminder.plan' },
    handle: async ({ tx, job }): Promise<JobOutcome> => {
      const versionId = job.target.id
      if (!versionId || !UUID_RE.test(versionId)) return 'cancelled'
      const at = await estimateDeliveredAt(tx, versionId)
      if (!at) return 'cancelled'
      return planEstimateReminder(tx, { versionId, deliveredAt: at, requestId: job.requestId })
    },
  }
}

/** The reminder automations of the estimates module. */
export function estimateReminderAutomations(): Automation[] {
  return [estimateReminderScheduleAutomation(), estimateReminderPlanAutomation()]
}

/**
 * The values of the owner's estimate_reminder wording, read when it sends (TSK-0121, OWN-DEC-151, OWN-DEC-158): the
 * first name ("Hi there," without one), the estimate number, the estimate's page and the project in the portal.
 */
export function estimateReminderValues(publicSiteUrl: string | undefined): ReleaseValues {
  return async (tx, row) => {
    if (row.message_key !== ESTIMATE_REMINDER_MESSAGE_KEY) return undefined
    const versionId = /^estimate_reminder:([0-9a-f-]{36})/i.exec(row.subject_key)?.[1]
    if (!versionId || !UUID_RE.test(versionId)) return {}
    const v = await tx
      .selectFrom('estimating.estimate_versions as v')
      .innerJoin('estimating.estimates as e', 'e.id', 'v.estimate_id')
      .innerJoin('crm.projects as p', 'p.id', 'v.project_id')
      .select(['v.version', 'v.project_id', 'e.number', 'p.reference'])
      .where('v.id', '=', versionId)
      .executeTakeFirst()
    if (!v) return {}
    const contact = await tx
      .selectFrom('intake.requests as r')
      .innerJoin('crm.contacts as c', 'c.id', 'r.contact_id')
      .select(['c.full_name'])
      .where('r.project_id', '=', v.project_id)
      .orderBy('r.submitted_at')
      .limit(1)
      .executeTakeFirst()
    return present({
      customerName: firstNameOf(contact?.full_name ?? null),
      estimateNumber: v.number,
      estimateLink: estimatePageLink(publicSiteUrl, v.reference, v.number, v.version),
      projectLink: portalLink(publicSiteUrl, v.reference),
    })
  }
}

/** A failed estimate reminder is a delivery issue for the estimator who prepared the version (HH-COM-02). */
export const estimateReminderFailureItem: ReleaseFailureItem = async (tx, row): Promise<FailureItem | undefined> => {
  if (row.message_key !== ESTIMATE_REMINDER_MESSAGE_KEY || row.record_type !== RECORD_TYPE || !row.record_id)
    return undefined
  if (!UUID_RE.test(row.record_id)) return undefined
  const v = await tx
    .selectFrom('estimating.estimate_versions as v')
    .innerJoin('crm.projects as p', 'p.id', 'v.project_id')
    .select(['v.project_id', 'v.prepared_by', 'p.reference'])
    .where('v.id', '=', row.record_id)
    .executeTakeFirst()
  if (!v) return undefined
  return { reference: v.reference, projectId: v.project_id, assignedStaffId: v.prepared_by }
}

type StaffRef = { id: string; name: string | null }

export type ReminderView = {
  id: string
  /** automatic (TSK-0121), or a staff-released draft from before it (kept as history). */
  release: 'automatic' | 'staff_released'
  state: string
  channel: string
  /** Why it stopped, was suppressed, failed or waits (a stop reason or a delivery error code). */
  reason: string | null
  /** When it is due (a text: the next allowed time of the recipient's permitted hours). */
  scheduledAt: string | null
  sentAt: string | null
  cancelledAt: string | null
  cancelledBy: StaffRef | 'system' | null
}

export type RemindersView = {
  versionId: string
  cadence:
    | {
        state: 'CONFIGURED'
        proposed: boolean
        afterDeliveryHours: number
        /** The first successful delivery of the version's notice; null while none succeeded. */
        deliveredAt: string | null
        dueAt: string | null
      }
    | { state: 'NOT_CONFIGURED' }
  /** The stop rule as the records are now: once set, no reminder of this version is scheduled or sent. */
  stoppedBy: ReminderStopReason | null
  reminders: ReminderView[]
}

/**
 * The reminder of one version for the staff screen: the cadence and when it is due, whether a stop rule applies now,
 * and every delivery with what happened to it (the channel only; the destination is not shown).
 */
export async function remindersView(db: Reader, versionId: string): Promise<RemindersView | null> {
  const v = await db
    .selectFrom('estimating.estimate_versions')
    .select(['id'])
    .where('id', '=', versionId)
    .executeTakeFirst()
  if (!v) return null
  const now = await dbNow(db)
  const cadence = reminderCadence(await loadConfig(db))
  const stoppedBy = await reminderStopReason(db, versionId, now)
  const deliveredAt = await estimateDeliveredAt(db, versionId)
  const rows = await db
    .selectFrom('platform.message_deliveries')
    .select([
      'id',
      'release',
      'state',
      'channel',
      'error_code',
      'scheduled_at',
      'sent_at',
      'cancelled_by',
      'cancelled_at',
    ])
    .where('record_type', '=', RECORD_TYPE)
    .where('record_id', '=', versionId)
    .where('message_key', '=', ESTIMATE_REMINDER_MESSAGE_KEY)
    .orderBy('created_at')
    .orderBy('seq')
    .execute()
  const ids = [...new Set(rows.map((r) => r.cancelled_by).filter((x): x is string => !!x && UUID_RE.test(x)))]
  const people = ids.length
    ? await db.selectFrom('identity.staff_users').select(['id', 'display_name']).where('id', 'in', ids).execute()
    : []
  const names = new Map(people.map((p) => [String(p.id), p.display_name]))
  const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null)
  return {
    versionId,
    cadence:
      cadence.state === 'CONFIGURED'
        ? {
            state: 'CONFIGURED',
            proposed: cadence.proposed,
            afterDeliveryHours: cadence.afterDeliveryHours,
            deliveredAt: iso(deliveredAt),
            dueAt: deliveredAt ? reminderDueAt(deliveredAt, cadence).toISOString() : null,
          }
        : { state: 'NOT_CONFIGURED' },
    stoppedBy,
    reminders: rows.map((r) => ({
      id: r.id,
      release: r.release === 'automatic' ? 'automatic' : 'staff_released',
      state: r.state,
      channel: r.channel,
      reason: r.error_code,
      // Due later only while it waits: once the provider accepted it, it reads as sent (sentAt).
      scheduledAt: r.state === 'queued' && !r.sent_at ? iso(r.scheduled_at) : null,
      sentAt: iso(r.sent_at),
      cancelledAt: iso(r.cancelled_at),
      cancelledBy:
        r.cancelled_by === 'system'
          ? 'system'
          : r.cancelled_by
            ? { id: r.cancelled_by, name: names.get(r.cancelled_by) ?? null }
            : null,
    })),
  }
}
