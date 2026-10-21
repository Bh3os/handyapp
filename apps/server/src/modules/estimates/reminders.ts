// Unanswered-estimate reminder drafts and their stop rules (TSK-0060; HH-EST-14, HH-COM-05, HH-COM-09, T65, S01,
// OWN-DEC-78, OWN-DEC-65, OWN-DEC-132, FACT-REMINDER-CADENCES, FACT-ESTIMATE-VALIDITY, ENT-Message, ENT-EstimateVersion,
// RULE-DECIDED-VALUES-ACTIVE, RULE-SERVER-AUTHZ, RULE-NO-INVENTED-FACTS).
// - Schedule: publishing a version commits estimate.version_published; its job (estimate.reminder_schedule) schedules
//   a first and a final draft job at the cadence configured as reminders.cadences.unansweredEstimate (the owner's
//   +24 hours and +3 days, OWN-DEC-132), measured from publishing. While the cadence is NOT CONFIGURED nothing is
//   scheduled; no interval is made up.
// - Drafts, never sends: each job (estimate.reminder_draft) prepares one staff-released draft of
//   reminder.unanswered_estimate (OWN-DEC-78, OWN-DEC-65) and opens the staff queue item estimate_reminder. Nothing
//   sends until a staff member releases the draft; a released estimate reminder sends at once, at any hour
//   (OWN-DEC-132, HH-COM-09: the cadence's contactHoursOnly is false).
// - Content: the only value is the link to the project workspace on the public site (/portal/p/<reference>), where
//   the customer can approve, ask, request changes or request another service; no amounts and no private details.
//   No wording is approved for this message: no template version is released, so a released reminder is recorded as
//   template_not_configured (never as sent) until the owner approves the wording (OQ-ESTIMATE-REMINDER-WORDING).
// - Stop rules (HH-EST-14), checked when the draft is prepared, again when staff release it and again by the send job
//   (the notifications module's send-time record check): the version accepted, declined, expired (also past its
//   valid-until time), withdrawn or superseded; any customer response on the estimate since this version was
//   published (Request Changes, Decline, Request an Updated Estimate); a conversation with the customer that staff
//   recorded since then (PROPOSED); the project no longer open. Channel permission is rechecked at release and send
//   (HH-COM-05: an SMS STOP or a missing opt-in stops a text). A stopped draft is cancelled with its reason, and the
//   lifecycle, response and approval (TSK-0057) transactions cancel waiting drafts at once (stopEstimateReminders).
// - Channel (PROPOSED): one draft per reminder, on the customer's preferred channel: a text when they prefer texts and
//   the SMS opt-in is current, otherwise email (a call preference has no message channel).
// - A failed delivery is a staff issue (the reminders panel and System health list it), never a customer
//   non-response: nothing here counts a non-response, and the cadence is measured from publishing.
// - Not built here (later tasks): customer messages and questions in the project thread (TSK-0049/TSK-0050) and
//   complaints (cases, TSK-0093) do not exist yet; when they do, reminderStopReason checks them too.
import type { Db, Tx } from '@handyhub/db'
import { decide, type StaffActor } from '@handyhub/policy'
import { sql } from 'kysely'
import { audit } from '../../platform/audit.js'
import type { Automation, JobOutcome } from '../../platform/automation.js'
import { type Config, loadConfig } from '../../platform/config/index.js'
import { scheduleJob } from '../../platform/jobs.js'
import { currentContext } from '../../platform/request-context.js'
import {
  createDraft,
  NOTIFICATION_RETRY,
  sendPermission,
  type Destination,
  type RecordCheck,
} from '../notifications/index.js'
import { openQueueItem, resolveQueueItem } from '../queue/index.js'

type Reader = Db | Tx

export const ESTIMATE_REMINDER_MESSAGE_KEY = 'reminder.unanswered_estimate'
export const ESTIMATE_REMINDER_ITEM = 'estimate_reminder'
export const REMINDER_STEPS = ['first', 'final'] as const
export type ReminderStep = (typeof REMINDER_STEPS)[number]

/** Why the reminders of a version stop (HH-EST-14); 'conversation_recorded' is PROPOSED. */
export const REMINDER_STOP_REASONS = [
  'accepted',
  'declined',
  'expired',
  'withdrawn',
  'superseded',
  'not_published',
  'customer_responded',
  'conversation_recorded',
  'project_not_open',
] as const
export type ReminderStopReason = (typeof REMINDER_STOP_REASONS)[number]

/** Staff dismissed the draft; the final draft replaced a first draft nobody released (PROPOSED). */
export const DISMISSED = 'dismissed'
export const REPLACED_BY_FINAL = 'replaced_by_final'

const PROCESS = 'system.estimate_reminders'
const RECORD_TYPE = 'estimate_version'

export const reminderSubjectKey = (versionId: string, step: ReminderStep) => `estimate_reminder:${versionId}:${step}`
const stepOf = (subjectKey: string): ReminderStep => (subjectKey.endsWith(':final') ? 'final' : 'first')

export type ReminderCadence =
  | {
      readonly state: 'CONFIGURED'
      readonly version: number
      readonly proposed: boolean
      readonly firstHours: number
      readonly finalHours: number
    }
  | { readonly state: 'NOT_CONFIGURED'; readonly version: number | null }

/** The configured unanswered-estimate cadence (FACT-REMINDER-CADENCES); NOT CONFIGURED when the key is unset. */
export function reminderCadence(config: Config): ReminderCadence {
  const entry = config.get('reminders.cadences')
  if (entry.state !== 'CONFIGURED') return { state: 'NOT_CONFIGURED', version: entry.version }
  const c = entry.value.unansweredEstimate
  return {
    state: 'CONFIGURED',
    version: entry.version,
    proposed: entry.proposed,
    firstHours: c.firstHours,
    finalHours: c.finalHours,
  }
}

const HOUR_MS = 3_600_000
export function reminderDueAt(publishedAt: Date, cadence: Extract<ReminderCadence, { state: 'CONFIGURED' }>) {
  return {
    first: new Date(publishedAt.getTime() + cadence.firstHours * HOUR_MS),
    final: new Date(publishedAt.getTime() + cadence.finalHours * HOUR_MS),
  }
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
 * The stop rule of a version's reminders as the records are now (HH-EST-14): the reason they stop, or null while the
 * published version is still unanswered.
 */
export async function reminderStopReason(db: Reader, versionId: string, now: Date): Promise<ReminderStopReason | null> {
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

/** Resolves the version's queue item once none of its reminders is waiting for release. */
async function syncReminderItem(tx: Tx, versionId: string, resolution: string): Promise<void> {
  const waiting = await tx
    .selectFrom('platform.message_deliveries')
    .select('id')
    .where('record_type', '=', RECORD_TYPE)
    .where('record_id', '=', versionId)
    .where('message_key', '=', ESTIMATE_REMINDER_MESSAGE_KEY)
    .where('state', '=', 'draft')
    .limit(1)
    .executeTakeFirst()
  if (!waiting) await resolveQueueItem(tx, { type: ESTIMATE_REMINDER_ITEM, subjectId: versionId, resolution })
}

/**
 * Cancels one waiting draft with its reason (stopped, dismissed or replaced), audited by who cancelled it: the system
 * for a stop rule, the staff member for a dismissal.
 */
async function cancelDraft(
  tx: Tx,
  row: { id: string; subject_key: string; channel: string },
  reason: string,
  by: { kind: 'system' } | { kind: 'staff'; id: string; roles: readonly string[] },
  requestId: string,
  options: { audit?: boolean } = {},
): Promise<boolean> {
  const done = await tx
    .updateTable('platform.message_deliveries')
    .set({
      state: 'cancelled',
      error_code: reason,
      cancelled_by: by.kind === 'staff' ? by.id : 'system',
      cancelled_at: sql<Date>`now()`,
      updated_at: sql<Date>`now()`,
    })
    .where('id', '=', row.id)
    .where('state', '=', 'draft')
    .executeTakeFirst()
  if (Number(done.numUpdatedRows) === 0) return false
  // A route that records its own audit event for the same change passes audit: false.
  if (options.audit === false) return true
  await audit.record(tx, {
    actor: by.kind === 'staff' ? by : { kind: 'system', process: PROCESS },
    action: by.kind === 'staff' ? 'estimate_reminder.dismiss' : 'estimate_reminder.stop',
    target: { type: 'message_delivery', id: row.id },
    summary: { messageKey: ESTIMATE_REMINDER_MESSAGE_KEY, step: stepOf(row.subject_key), channel: row.channel, reason },
    requestId,
  })
  return true
}

const waitingDrafts = (tx: Tx, versionId: string) =>
  tx
    .selectFrom('platform.message_deliveries')
    .select(['id', 'subject_key', 'channel'])
    .where('record_type', '=', RECORD_TYPE)
    .where('record_id', '=', versionId)
    .where('message_key', '=', ESTIMATE_REMINDER_MESSAGE_KEY)
    .where('state', '=', 'draft')
    .forUpdate()
    .execute()

/**
 * Cancels the version's waiting reminder drafts when a stop rule now applies (HH-EST-14). Called in the transaction
 * of each change that can stop them (publishing a newer version, withdraw, expire, decline, the expiry job, a customer
 * response, the approval); a released reminder not yet sent is stopped by its send-time check instead. Returns the reason, or null.
 */
export async function stopEstimateReminders(tx: Tx, versionId: string): Promise<ReminderStopReason | null> {
  const reason = await reminderStopReason(tx, versionId, await dbNow(tx))
  if (!reason) return null
  for (const row of await waitingDrafts(tx, versionId))
    await cancelDraft(tx, row, reason, { kind: 'system' }, requestIdOf(versionId))
  await syncReminderItem(tx, versionId, 'stopped')
  return reason
}

/** The send-time recheck of an estimate reminder (registered with the notifications module's release automation). */
export const estimateReminderRecordCheck: RecordCheck = async (tx, input) => {
  if (input.messageKey !== ESTIMATE_REMINDER_MESSAGE_KEY) return 'current'
  const reason = await reminderStopReason(tx, input.recordId, await dbNow(tx))
  return reason ? { stale: reason } : 'current'
}

export type ReminderDraftDeps = {
  /** The public site's base URL for the project link; undefined while not configured (the link is left out). */
  publicSiteUrl?: string | undefined
}

/** One draft job per reminder: prepares the staff-released draft at its due time unless a stop rule applies. */
export function estimateReminderDraftAutomation(deps: ReminderDraftDeps = {}): Automation {
  return {
    name: 'estimate.reminder_draft',
    trigger: { kind: 'schedule', description: 'the first and the final reminder of a published estimate version' },
    identity: PROCESS,
    inputs: {
      description: 'the version (job target) and the reminder (first or final); records read when it runs',
      version: 1,
    },
    idempotency: 'one job per version and reminder; one draft per reminder, channel and destination',
    effect: 'prepares one staff-released reminder draft and its queue item; never sends anything',
    retry: { maxAttempts: 5, baseDelayMs: 60_000, maxDelayMs: 3_600_000 },
    timeoutMs: 10_000,
    exceptionOwner: 'estimator',
    audit: { action: 'estimate_reminder.draft' },
    handle: async ({ tx, job }): Promise<JobOutcome> => {
      const versionId = job.target.id
      const step = job.payload['step']
      if (!versionId || (step !== 'first' && step !== 'final')) return 'cancelled'
      const head = await tx
        .selectFrom('estimating.estimate_versions')
        .select(['estimate_id'])
        .where('id', '=', versionId)
        .executeTakeFirst()
      if (!head) return 'cancelled'
      // The lifecycle's lock order (estimate, then version), so a response, a publish or the expiry of the same
      // estimate serializes with the draft.
      await tx.selectFrom('estimating.estimates').select('id').where('id', '=', head.estimate_id).forUpdate().execute()
      const v = await tx
        .selectFrom('estimating.estimate_versions as v')
        .innerJoin('crm.projects as p', 'p.id', 'v.project_id')
        .select(['v.id', 'v.project_id', 'v.prepared_by', 'p.reference'])
        .where('v.id', '=', versionId)
        .forUpdate()
        .executeTakeFirstOrThrow()
      const reason = await stopEstimateReminders(tx, versionId)
      if (reason) {
        await audit.record(tx, {
          actor: { kind: 'system', process: PROCESS },
          action: 'estimate_reminder.stop',
          target: { type: RECORD_TYPE, id: versionId },
          summary: { messageKey: ESTIMATE_REMINDER_MESSAGE_KEY, step, reason, drafted: false },
          requestId: job.requestId,
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
      const destination = await reminderDestination(tx, contact)
      const config = await loadConfig(tx)
      const base = deps.publicSiteUrl?.replace(/\/$/, '')
      const draft = await createDraft(tx, {
        config,
        messageKey: ESTIMATE_REMINDER_MESSAGE_KEY,
        destination,
        recipient: { kind: 'customer_contact', id: contact.id, destinations: [destination] },
        subjectKey: reminderSubjectKey(versionId, step),
        record: { type: RECORD_TYPE, id: versionId },
        values: base ? { projectLink: `${base}/portal/p/${encodeURIComponent(v.reference)}` } : {},
        // TSK-0049: the delivery belongs to the project (its reply address and conversation).
        projectId: v.project_id,
      })
      // The final draft replaces a first draft nobody released, so the customer never gets both at once (PROPOSED).
      if (step === 'final')
        for (const row of await waitingDrafts(tx, versionId))
          if (row.id !== draft.id) await cancelDraft(tx, row, REPLACED_BY_FINAL, { kind: 'system' }, job.requestId)
      await openQueueItem(tx, {
        type: ESTIMATE_REMINDER_ITEM,
        subjectId: versionId,
        reason: `estimate_reminder_${step}`,
        projectId: v.project_id,
        reference: v.reference,
        status: 'draft',
        assignedStaffId: v.prepared_by,
      })
      await audit.record(tx, {
        actor: { kind: 'system', process: PROCESS },
        action: 'estimate_reminder.drafted',
        target: { type: 'message_delivery', id: draft.id },
        summary: { messageKey: ESTIMATE_REMINDER_MESSAGE_KEY, step, channel: destination.channel, version: versionId },
        requestId: job.requestId,
      })
      return 'done'
    },
  }
}

/**
 * The channel of a reminder (PROPOSED): a text when the customer prefers texts and may be texted now (the SMS opt-in
 * is current, no STOP), otherwise email.
 */
async function reminderDestination(
  tx: Tx,
  contact: { email: string; phone_e164: string; preferred_channel: string },
): Promise<Destination> {
  if (contact.preferred_channel === 'text') {
    const sms = await sendPermission(tx, {
      channel: 'sms',
      destination: contact.phone_e164,
      audience: 'customer',
      messageKey: ESTIMATE_REMINDER_MESSAGE_KEY,
    })
    if (sms.allowed) return { channel: 'sms', destination: contact.phone_e164, permission: 'preferred' }
  }
  return {
    channel: 'email',
    destination: contact.email,
    permission: contact.preferred_channel === 'email' ? 'preferred' : 'permitted',
  }
}

/**
 * Publishing a version schedules its two reminder draft jobs at the configured cadence, measured from publishing.
 * The cadence in effect at publishing applies to that version (PROPOSED); NOT CONFIGURED schedules nothing.
 */
export function estimateReminderScheduleAutomation(draft: Automation): Automation {
  return {
    name: 'estimate.reminder_schedule',
    trigger: { kind: 'event', eventTypes: ['estimate.version_published'] },
    identity: PROCESS,
    inputs: { description: 'the committed estimate.version_published event; the cadence configured then', version: 1 },
    idempotency: 'one draft job per version and reminder (job key: version and reminder)',
    effect: 'schedules the first and the final reminder draft jobs of a published version',
    retry: NOTIFICATION_RETRY,
    timeoutMs: 10_000,
    exceptionOwner: 'estimator',
    audit: { action: 'estimate_reminder.schedule' },
    handle: async ({ tx, job, log }): Promise<JobOutcome> => {
      const versionId = job.target.id
      if (!versionId) return 'cancelled'
      const v = await tx
        .selectFrom('estimating.estimate_versions')
        .select(['id', 'published_at'])
        .where('id', '=', versionId)
        .executeTakeFirst()
      if (!v?.published_at) return 'cancelled'
      const cadence = reminderCadence(await loadConfig(tx))
      if (cadence.state !== 'CONFIGURED') {
        log.warn({ versionId }, 'reminders.cadences is NOT CONFIGURED; no estimate reminder is scheduled')
        return 'cancelled'
      }
      const due = reminderDueAt(v.published_at, cadence)
      for (const step of REMINDER_STEPS)
        await scheduleJob(tx, draft, {
          key: `${versionId}:${step}`,
          runAt: due[step],
          payload: { step, cadenceVersion: cadence.version },
          target: { type: RECORD_TYPE, id: versionId },
          requestId: job.requestId,
        })
      return 'done'
    },
  }
}

/** The reminder automations of the estimates module, wired together. */
export function estimateReminderAutomations(deps: ReminderDraftDeps = {}): Automation[] {
  const draft = estimateReminderDraftAutomation(deps)
  return [estimateReminderScheduleAutomation(draft), draft]
}

/** Who may release or dismiss a version's reminders: message.release_draft, the Estimator for their own estimates. */
export function mayRelease(actor: StaffActor, projectId: string, preparedBy: string): boolean {
  return (
    decide(actor, 'message.release_draft', { projectId, ownerStaffId: preparedBy }, { now: new Date(), online: true })
      .effect === 'allow'
  )
}

export type ReminderView = {
  id: string
  step: ReminderStep
  state: string
  channel: string
  /** Why it stopped, was dismissed, suppressed or not sent (a stop reason or a delivery error code). */
  reason: string | null
  draftedAt: string
  releasedAt: string | null
  releasedBy: { id: string; name: string | null } | null
  cancelledAt: string | null
  cancelledBy: { id: string; name: string | null } | 'system' | null
  actions: { release: boolean; dismiss: boolean }
}

export type RemindersView = {
  versionId: string
  cadence:
    | {
        state: 'CONFIGURED'
        proposed: boolean
        firstHours: number
        finalHours: number
        firstAt: string | null
        finalAt: string | null
      }
    | { state: 'NOT_CONFIGURED' }
  /** The stop rule as the records are now: once set, no reminder of this version is drafted or sent. */
  stoppedBy: ReminderStopReason | null
  reminders: ReminderView[]
}

/**
 * The reminders of one version for the staff screen: the cadence and its due times, whether a stop rule applies now,
 * and every reminder drafted with what happened to it (channel only; the destination is not shown).
 */
export async function remindersView(db: Reader, actor: StaffActor, versionId: string): Promise<RemindersView | null> {
  const v = await db
    .selectFrom('estimating.estimate_versions')
    .select(['id', 'project_id', 'prepared_by', 'published_at'])
    .where('id', '=', versionId)
    .executeTakeFirst()
  if (!v) return null
  const now = await dbNow(db)
  const cadence = reminderCadence(await loadConfig(db))
  const stoppedBy = await reminderStopReason(db, versionId, now)
  const rows = await db
    .selectFrom('platform.message_deliveries')
    .select([
      'id',
      'subject_key',
      'state',
      'channel',
      'error_code',
      'created_at',
      'queued_at',
      'released_by',
      'cancelled_by',
      'cancelled_at',
    ])
    .where('record_type', '=', RECORD_TYPE)
    .where('record_id', '=', versionId)
    .where('message_key', '=', ESTIMATE_REMINDER_MESSAGE_KEY)
    .orderBy('created_at')
    .orderBy('seq')
    .execute()
  const ids = [
    ...new Set(rows.flatMap((r) => [r.released_by, r.cancelled_by]).filter((x): x is string => !!x && x !== 'system')),
  ]
  const people = ids.length
    ? await db
        .selectFrom('identity.staff_users')
        .select(['id', 'display_name'])
        .where(sql<string>`id::text`, 'in', ids)
        .execute()
    : []
  const names = new Map(people.map((p) => [String(p.id), p.display_name]))
  const ref = (id: string | null) => (id ? { id, name: names.get(id) ?? null } : null)
  const may = mayRelease(actor, v.project_id, v.prepared_by)
  const due = cadence.state === 'CONFIGURED' && v.published_at ? reminderDueAt(v.published_at, cadence) : null
  return {
    versionId,
    cadence:
      cadence.state === 'CONFIGURED'
        ? {
            state: 'CONFIGURED',
            proposed: cadence.proposed,
            firstHours: cadence.firstHours,
            finalHours: cadence.finalHours,
            firstAt: due?.first.toISOString() ?? null,
            finalAt: due?.final.toISOString() ?? null,
          }
        : { state: 'NOT_CONFIGURED' },
    stoppedBy,
    reminders: rows.map((r) => ({
      id: r.id,
      step: stepOf(r.subject_key),
      state: r.state,
      channel: r.channel,
      reason: r.error_code,
      draftedAt: r.created_at.toISOString(),
      releasedAt: r.released_by && r.queued_at ? r.queued_at.toISOString() : null,
      releasedBy: ref(r.released_by),
      cancelledAt: r.cancelled_at?.toISOString() ?? null,
      cancelledBy: r.cancelled_by === 'system' ? 'system' : ref(r.cancelled_by),
      actions: {
        release: r.state === 'draft' && may && stoppedBy === null,
        dismiss: r.state === 'draft' && may,
      },
    })),
  }
}

export { cancelDraft as cancelReminderDraft, syncReminderItem, waitingDrafts as waitingReminderDrafts }
