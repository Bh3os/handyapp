// Unpaid-invoice reminders and "Overdue—owner decision" (TSK-0091; OWN-DEC-210, OWN-DEC-112, OWN-DEC-151, OWN-DEC-158,
// OWN-DEC-190, HH-FIN-19, HH-COM-05, HH-COM-06, HH-COM-13, T65, FACT-REMINDER-CADENCES, FACT-PAYMENT-DUE, ENT-Invoice,
// ENT-Message, RULE-DECIDED-VALUES-ACTIVE, RULE-SERVER-AUTHZ, RULE-NO-INVENTED-FACTS, RULE-MONEY-CENTS).
// - Two automatic reminder emails per issued final invoice (OWN-DEC-210): stage 1 the configured calendar days after
//   its due date (reminders.cadences.unpaidInvoice.firstDaysAfterDue, 3), stage 2 after secondDaysAfterDue (7). The
//   due date is the invoice's payment term (FACT-PAYMENT-DUE: due on receipt, the business date it was issued), or the
//   latest revised due date staff recorded. PROPOSED: each is due at the opening of the daily contact hours
//   (contact.hours, 8 AM) in the business time zone on that calendar day. While the cadence, the hours or the zone is
//   NOT CONFIGURED nothing is scheduled; no interval is made up.
// - Scheduled, then sent (notifications scheduleAutomaticDelivery): one queued email per stage, due at that time, sent by
//   its notify.release job after the send-time recheck below. Email only: SMS reminders stay off until A2P 10DLC and
//   consent (OWN-DEC-190). Each scheduling, send, delivery status, suppression and failure is a delivery row and an
//   audit event; what is not scheduled is audited with its reason.
// - Once per invoice and stage (OWN-DEC-210 "only once per invoice and reminder stage", "idempotent event
//   processing"): the delivery tuple (message, channel, subject, destination) holds one row and the provider key is its
//   hash; a stage that was ever handed to the provider, failed or was suppressed is never scheduled again, also after a
//   revised due date (its subject names the due-date version, so a revision cancels the waiting stages and schedules
//   the stages still unsent from the new date).
// - Who gets none, rechecked when it is scheduled and again right before each send (the stop reasons): a deposit
//   invoice (PROPOSED: deposits follow the deposit gate and its queue), a draft, voided or paid invoice, no collectible
//   balance (credits and write-offs counted); a payment plan or a collection hold that is active; an open payment dispute
//   (finance.payment_dispute_open), an open dispute case or an open billing complaint on the project (PROPOSED); a
//   refund, credit or write-off request under review, or a refund needing review; any payment recorded on the invoice
//   since its due date was set, partial payments and pending checks included. A payment suspends the sequence and it
//   never restarts by itself: staff confirm the next step (a revised due date restarts the stages still unsent from the
//   new date; a released follow-up; a payment plan or hold). A plan or hold that ends restarts nothing either.
// - Staff (payment_reminder.release: the Owner, Office) record the collection steps (finance.invoice_collection_steps)
//   and release a follow-up reminder after the second reminder was sent or after a payment suspended the sequence; the
//   follow-up is rechecked at send time like the reminders, counting only payments after its release.
// - Queue items, kept in line with the records in the transaction of each change (syncInvoiceReminders):
//   - invoice_reminder_review (staff queue): a payment suspended the reminders before the second one was sent and the
//     balance remains; resolved once staff record a step after that payment, or the balance is gone;
//   - invoice_overdue_decision (Owner Decisions, OWN-DEC-112): the second reminder was actually sent (provider accepted
//     it) and the balance remains; resolved when the Owner decides, a revised due date, plan or hold is recorded after
//     it, the balance is gone, or the reminder turns out not delivered (a failed delivery is a staff delivery issue,
//     never customer non-response).
// - Content (OWN-DEC-151, OWN-DEC-158): the owner-authorized wording with the first name ("Hi there," without one), the
//   invoice number and the link to the project's Documents tab; never an amount, a fee or a threat. No late fees or
//   interest, never collections, a saved-card charge or an automatic write-off (OWN-DEC-112).
import { randomUUID } from 'node:crypto'
import type { Db, Tx } from '@handyhub/db'
import { addDays, localDate } from '@handyhub/domain/request-form'
import { decide, type StaffActor } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError, type FieldError } from '../../api/errors.js'
import { audit } from '../../platform/audit.js'
import type { Automation, JobOutcome } from '../../platform/automation.js'
import { type Config, loadConfig } from '../../platform/config/index.js'
import { currentContext } from '../../platform/request-context.js'
import {
  businessZone,
  cancelWaitingDeliveries,
  createDraft,
  firstNameOf,
  NOTIFICATION_RETRY,
  portalLink,
  present,
  releaseAutomation,
  releaseDraft,
  scheduleAutomaticDelivery,
  zonedTimeToUtc,
  type FailureItem,
  type RecordCheck,
  type ReleaseFailureItem,
  type ReleaseValues,
} from '../notifications/index.js'
import { openQueueItem, resolveQueueItem } from '../queue/items.js'
import { jobDisputeOpen } from './exceptions.js'
import { INVOICE_ISSUED_EVENT } from './invoices.js'
import { invoiceMoney } from './ledger.js'

type Reader = Db | Tx

export const UNPAID_REMINDER_MESSAGE_KEY = 'reminder.unpaid_invoice'
export const UNPAID_FOLLOW_UP_MESSAGE_KEY = 'reminder.unpaid_invoice_follow_up'
export const REMINDER_REVIEW_QUEUE_TYPE = 'invoice_reminder_review'
export const OVERDUE_QUEUE_TYPE = 'invoice_overdue_decision'
const RECORD_TYPE = 'invoice'
const PROCESS = 'system.invoice_reminders'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const REMINDER_STAGES = [1, 2] as const
export type ReminderStage = (typeof REMINDER_STAGES)[number]

/** Why an invoice gets no automatic reminder now (HH-FIN-19, OWN-DEC-210); the order is the order they are checked. */
export const UNPAID_REMINDER_STOP_REASONS = [
  'invoice_not_found',
  'not_final_invoice',
  'invoice_not_issued',
  'invoice_voided',
  'invoice_paid',
  'no_balance',
  'payment_plan',
  'collection_hold',
  'payment_disputed',
  'dispute_case_open',
  'billing_complaint_open',
  'refund_or_credit_review',
  'payment_recorded',
] as const
export type UnpaidReminderStopReason = (typeof UNPAID_REMINDER_STOP_REASONS)[number]

/** Why one stage's delivery was not scheduled or sent, beyond the stop reasons. */
export const UNPAID_REMINDER_SKIP_REASONS = [
  'not_configured',
  'due_date_revised',
  'stage_already_sent',
  'stage_time_passed',
  'no_email_address',
] as const

/** The collection steps staff record (finance.invoice_collection_steps). */
export const COLLECTION_STEP_KINDS = [
  'revised_due_date',
  'payment_plan',
  'collection_hold',
  'arrangement_ended',
  'follow_up_released',
  'overdue_decided',
] as const
export type CollectionStepKind = (typeof COLLECTION_STEP_KINDS)[number]
/** The steps recorded through the steps route (the follow-up and the overdue decision have their own). */
export const RECORDED_STEP_KINDS = ['revised_due_date', 'payment_plan', 'collection_hold', 'arrangement_ended'] as const
export type RecordedStepKind = (typeof RECORDED_STEP_KINDS)[number]

/** PROPOSED limits: a note of up to 2,000 characters; a revised due date from today to 365 days ahead. */
export const COLLECTION_STEP_LIMITS = { note: 2000, revisedDueDays: 365 } as const

/** The subject of one automatic stage under one due-date version (0: the issue date; n: the n-th revision). */
export const reminderSubjectKey = (invoiceId: string, stage: ReminderStage, dueVersion: number) =>
  `unpaid_invoice_reminder:${invoiceId}:s${stage}:d${dueVersion}`
export const followUpSubjectKey = (invoiceId: string, stepId: string) =>
  `unpaid_invoice_follow_up:${invoiceId}:${stepId}`

export function parseReminderSubject(
  subjectKey: string,
): { invoiceId: string; stage: ReminderStage; dueVersion: number } | null {
  const m = /^unpaid_invoice_reminder:([0-9a-f-]{36}):s([12]):d(\d{1,6})$/i.exec(subjectKey)
  if (!m || !UUID_RE.test(m[1] as string)) return null
  return { invoiceId: (m[1] as string).toLowerCase(), stage: Number(m[2]) as ReminderStage, dueVersion: Number(m[3]) }
}
export function parseFollowUpSubject(subjectKey: string): { invoiceId: string; stepId: string } | null {
  const m = /^unpaid_invoice_follow_up:([0-9a-f-]{36}):([0-9a-f-]{36})$/i.exec(subjectKey)
  if (!m || !UUID_RE.test(m[1] as string) || !UUID_RE.test(m[2] as string)) return null
  return { invoiceId: (m[1] as string).toLowerCase(), stepId: (m[2] as string).toLowerCase() }
}

export type UnpaidReminderCadence =
  | {
      readonly state: 'CONFIGURED'
      readonly version: number
      readonly proposed: boolean
      readonly days: Readonly<Record<ReminderStage, number>>
      /** The local time of day a stage is due (the opening of contact.hours, PROPOSED). */
      readonly at: string
      readonly zone: string
    }
  | { readonly state: 'NOT_CONFIGURED'; readonly version: number | null }

/** The configured unpaid-invoice cadence with the hours and the zone it is counted in; NOT CONFIGURED otherwise. */
export function unpaidReminderCadence(config: Config): UnpaidReminderCadence {
  const entry = config.get('reminders.cadences')
  const hours = config.get('contact.hours')
  const zone = businessZone(config)
  if (entry.state !== 'CONFIGURED' || hours.state !== 'CONFIGURED' || !zone)
    return { state: 'NOT_CONFIGURED', version: entry.version }
  const c = entry.value.unpaidInvoice
  return {
    state: 'CONFIGURED',
    version: entry.version,
    proposed: entry.proposed,
    days: { 1: c.firstDaysAfterDue, 2: c.secondDaysAfterDue },
    at: hours.value.open,
    zone,
  }
}

/**
 * When a stage is due: `days` calendar days after the due date (YYYY-MM-DD, business date), at the local time `at`
 * in `zone`. Calendar arithmetic, so a DST change never moves it to another day.
 */
export function stageDueAt(dueOn: string, days: number, at: string, zone: string): Date {
  const day = addDays(dueOn, days)
  const [year, month, date] = day.split('-').map(Number) as [number, number, number]
  const [hour = 0, minute = 0] = at.split(':').map(Number)
  return zonedTimeToUtc({ year, month, day: date, hour, minute }, zone)
}

type InvoiceRow = {
  id: string
  job_id: string
  project_id: string
  kind: string
  state: string
  number: string | null
  issued_at: Date | null
}
export type StepRow = {
  id: string
  kind: string
  due_on: string | null
  ends_step_id: string | null
  delivery_id: string | null
  note: string | null
  recorded_by: string
  recorded_at: Date
}

async function invoiceRow(db: Reader, invoiceId: string, lock = false): Promise<InvoiceRow | undefined> {
  let q = db
    .selectFrom('finance.invoices')
    .select(['id', 'job_id', 'project_id', 'kind', 'state', 'number', 'issued_at'])
    .where('id', '=', invoiceId)
  if (lock) q = q.forUpdate()
  return (await q.executeTakeFirst()) as InvoiceRow | undefined
}

export async function collectionSteps(db: Reader, invoiceId: string): Promise<StepRow[]> {
  const rows = await db
    .selectFrom('finance.invoice_collection_steps')
    .select(['id', 'kind', 'due_on', 'ends_step_id', 'delivery_id', 'note', 'recorded_by', 'recorded_at'])
    .where('invoice_id', '=', invoiceId)
    .orderBy('recorded_at')
    .orderBy('id')
    .execute()
  return rows.map((r) => ({ ...r, due_on: r.due_on === null ? null : String(r.due_on).slice(0, 10) }))
}

/** The due date the reminders count from, its version and since when payments suspend them. */
export function dueBasis(
  i: Pick<InvoiceRow, 'issued_at'>,
  steps: readonly StepRow[],
  zone: string,
): { dueOn: string; version: number; revised: boolean; since: Date } | null {
  const revisions = steps.filter((s) => s.kind === 'revised_due_date')
  const last = revisions.at(-1)
  if (last?.due_on) return { dueOn: last.due_on, version: revisions.length, revised: true, since: last.recorded_at }
  if (!i.issued_at) return null
  return { dueOn: localDate(new Date(i.issued_at), zone), version: 0, revised: false, since: new Date(i.issued_at) }
}

/** The payment plan and the collection hold still active (recorded and not ended). */
export function activeArrangements(steps: readonly StepRow[]): { plan: StepRow | null; hold: StepRow | null } {
  const ended = new Set(steps.filter((s) => s.kind === 'arrangement_ended').map((s) => s.ends_step_id))
  const active = (kind: string) => steps.filter((s) => s.kind === kind && !ended.has(s.id)).at(-1) ?? null
  return { plan: active('payment_plan'), hold: active('collection_hold') }
}

async function dbNow(db: Reader): Promise<Date> {
  const r = await sql<{ now: Date }>`SELECT now() AS now`.execute(db)
  return new Date((r.rows[0] as { now: Date }).now)
}

/** The latest payment applied to the invoice after `since` (never a reversing allocation), or null. */
async function paymentSince(db: Reader, invoiceId: string, since: Date | null): Promise<Date | null> {
  let q = db
    .selectFrom('finance.payment_allocations')
    .select(sql<Date | null>`max(created_at)`.as('at'))
    .where('invoice_id', '=', invoiceId)
    .where('reverses_allocation_id', 'is', null)
  if (since) q = q.where('created_at', '>', since)
  const r = await q.executeTakeFirst()
  return r?.at ? new Date(r.at) : null
}

/**
 * The stop rule of an invoice's reminders as the records are now (see the header): the reason, or null while it may
 * be reminded. `since`: payments after it suspend (the due date's basis, or a follow-up's release).
 */
async function stopReasonOf(
  db: Reader,
  i: InvoiceRow,
  steps: readonly StepRow[],
  since: Date | null,
): Promise<UnpaidReminderStopReason | null> {
  if (i.kind !== 'final') return 'not_final_invoice'
  if (i.state === 'draft') return 'invoice_not_issued'
  if (i.state === 'voided') return 'invoice_voided'
  if (i.state === 'paid') return 'invoice_paid'
  if ((await invoiceMoney(db, i.id)).remainingCents <= 0) return 'no_balance'
  const { plan, hold } = activeArrangements(steps)
  if (plan) return 'payment_plan'
  if (hold) return 'collection_hold'
  if (await jobDisputeOpen(db, i.job_id)) return 'payment_disputed'
  const cases = await db
    .selectFrom('quality.cases')
    .select(['kind'])
    .where('project_id', '=', i.project_id)
    .where((eb) =>
      eb.or([
        eb.and([eb('kind', '=', 'dispute'), eb('state', '<>', 'closed')]),
        eb.and([
          eb('kind', '=', 'complaint'),
          eb('category', '=', 'billing'),
          eb('state', 'not in', ['resolved', 'closed']),
        ]),
      ]),
    )
    .execute()
  if (cases.some((c) => c.kind === 'dispute')) return 'dispute_case_open'
  if (cases.length) return 'billing_complaint_open'
  const review = await db
    .selectFrom('finance.refunds')
    .select('id')
    .where('job_id', '=', i.job_id)
    .where((eb) =>
      eb.or([eb('state', '=', 'requested'), eb.and([eb('type', '=', 'refund'), eb('state', '=', 'needs_review')])]),
    )
    .limit(1)
    .executeTakeFirst()
  if (review) return 'refund_or_credit_review'
  if (await paymentSince(db, i.id, since)) return 'payment_recorded'
  return null
}

/** The stop rule of the automatic reminders of an invoice now (null: it may be reminded). */
export async function unpaidReminderStopReason(
  db: Reader,
  invoiceId: string,
): Promise<UnpaidReminderStopReason | null> {
  if (!UUID_RE.test(invoiceId)) return 'invoice_not_found'
  const i = await invoiceRow(db, invoiceId)
  if (!i) return 'invoice_not_found'
  const steps = await collectionSteps(db, invoiceId)
  const zone = businessZone(await loadConfig(db)) ?? 'UTC'
  return stopReasonOf(db, i, steps, dueBasis(i, steps, zone)?.since ?? null)
}

const requestIdOf = (fallback: string) => currentContext()?.requestId ?? fallback

type ReminderDeliveryRow = {
  id: string
  message_key: string
  subject_key: string
  state: string
  error_code: string | null
  provider_message_id: string | null
  scheduled_at: Date | null
  sent_at: Date | null
  cancelled_at: Date | null
  created_at: Date
}

async function reminderDeliveries(db: Reader, invoiceId: string): Promise<ReminderDeliveryRow[]> {
  return db
    .selectFrom('platform.message_deliveries')
    .select([
      'id',
      'message_key',
      'subject_key',
      'state',
      'error_code',
      'provider_message_id',
      'scheduled_at',
      'sent_at',
      'cancelled_at',
      'created_at',
    ])
    .where('record_type', '=', RECORD_TYPE)
    .where('record_id', '=', invoiceId)
    .where('message_key', 'in', [UNPAID_REMINDER_MESSAGE_KEY, UNPAID_FOLLOW_UP_MESSAGE_KEY])
    .orderBy('seq')
    .execute() as Promise<ReminderDeliveryRow[]>
}

const handedOver = (d: Pick<ReminderDeliveryRow, 'state' | 'provider_message_id'>) =>
  d.state === 'sent' || d.state === 'delivered' || d.provider_message_id !== null
const waiting = (d: ReminderDeliveryRow) => d.state === 'queued' && d.provider_message_id === null
/** A stage is used once a delivery of it was handed over, failed or suppressed (only a cancelled one frees it). */
const stageUsed = (d: ReminderDeliveryRow) => d.state !== 'cancelled' && !waiting(d)

/** The request facts a reminder needs: the contact, the reference and the responsible staff member. */
async function requestFacts(db: Reader, projectId: string) {
  return db
    .selectFrom('intake.requests as r')
    .innerJoin('crm.contacts as c', 'c.id', 'r.contact_id')
    .innerJoin('crm.projects as p', 'p.id', 'r.project_id')
    .select([
      'r.reference',
      'r.responsible_staff_id',
      'p.reference as project_reference',
      'c.id as contactId',
      'c.full_name',
      'c.email',
      'c.preferred_channel',
    ])
    .where('r.project_id', '=', projectId)
    .orderBy('r.submitted_at')
    .executeTakeFirst()
}

async function cancelStage(tx: Tx, invoiceId: string, subjectKey: string, reason: string, requestId: string) {
  return cancelWaitingDeliveries(tx, {
    messageKey: UNPAID_REMINDER_MESSAGE_KEY,
    recordType: RECORD_TYPE,
    recordId: invoiceId,
    reason,
    process: PROCESS,
    requestId,
    subjectKey,
  })
}

async function notScheduled(
  tx: Tx,
  invoiceId: string,
  reason: string,
  requestId: string,
  stage: ReminderStage | null = null,
) {
  await audit.record(tx, {
    actor: { kind: 'system', process: PROCESS },
    action: 'invoice_reminder.not_scheduled',
    target: { type: RECORD_TYPE, id: invoiceId },
    summary: { messageKey: UNPAID_REMINDER_MESSAGE_KEY, stage, reason },
    requestId,
  })
}

/**
 * Schedules the automatic stages of an invoice still unsent from its current due date (unless a stop rule applies or
 * the cadence is NOT CONFIGURED), after cancelling the waiting stages of an earlier due date. Idempotent.
 */
export async function planUnpaidReminders(
  tx: Tx,
  input: { invoiceId: string; requestId: string },
): Promise<JobOutcome> {
  if (!UUID_RE.test(input.invoiceId)) return 'cancelled'
  // The lock order of every money write: the invoice first.
  const i = await invoiceRow(tx, input.invoiceId, true)
  if (!i || i.kind !== 'final') return 'cancelled'
  const steps = await collectionSteps(tx, i.id)
  const config = await loadConfig(tx)
  const cadence = unpaidReminderCadence(config)
  const basis = cadence.state === 'CONFIGURED' ? dueBasis(i, steps, cadence.zone) : null
  const deliveries = (await reminderDeliveries(tx, i.id)).filter((d) => d.message_key === UNPAID_REMINDER_MESSAGE_KEY)
  // A revised due date: the stages waiting under an earlier one are cancelled.
  for (const d of deliveries.filter(waiting)) {
    const s = parseReminderSubject(d.subject_key)
    if (!basis || !s || s.dueVersion !== basis.version)
      await cancelStage(tx, i.id, d.subject_key, 'due_date_revised', input.requestId)
  }
  const reason = await stopReasonOf(tx, i, steps, basis?.since ?? null)
  if (reason || cadence.state !== 'CONFIGURED' || !basis) {
    for (const d of deliveries.filter(waiting))
      await cancelStage(tx, i.id, d.subject_key, reason ?? 'not_configured', input.requestId)
    await notScheduled(tx, i.id, reason ?? 'not_configured', input.requestId)
    return 'cancelled'
  }
  const r = await requestFacts(tx, i.project_id)
  if (!r?.email) {
    await notScheduled(tx, i.id, 'no_email_address', input.requestId)
    return 'cancelled'
  }
  const now = await dbNow(tx)
  let scheduled = false
  for (const stage of REMINDER_STAGES) {
    const used = deliveries.some((d) => parseReminderSubject(d.subject_key)?.stage === stage && stageUsed(d))
    if (used) {
      await notScheduled(tx, i.id, 'stage_already_sent', input.requestId, stage)
      continue
    }
    const dueAt = stageDueAt(basis.dueOn, cadence.days[stage], cadence.at, cadence.zone)
    if (dueAt.getTime() <= now.getTime()) {
      await notScheduled(tx, i.id, 'stage_time_passed', input.requestId, stage)
      continue
    }
    const out = await scheduleAutomaticDelivery(tx, {
      config,
      messageKey: UNPAID_REMINDER_MESSAGE_KEY,
      recipient: {
        kind: 'customer_contact',
        id: r.contactId,
        destinations: [
          {
            channel: 'email',
            destination: r.email,
            permission: r.preferred_channel === 'email' ? 'preferred' : 'permitted',
          },
        ],
      },
      subjectKey: reminderSubjectKey(i.id, stage, basis.version),
      record: { type: RECORD_TYPE, id: i.id },
      projectId: i.project_id,
      dueAt,
      requestId: input.requestId,
      process: PROCESS,
    })
    if (out.state === 'scheduled') scheduled = true
    else await notScheduled(tx, i.id, 'not_automatic', input.requestId, stage)
  }
  return scheduled ? 'done' : 'cancelled'
}

/**
 * Keeps an invoice's reminders and queue items in line with its records (see the header), in the transaction of the
 * change: waiting reminders a stop rule now applies to are cancelled with the reason; the review and the overdue items
 * are opened, updated or resolved.
 */
export async function syncInvoiceReminders(tx: Tx, invoiceId: string): Promise<void> {
  const i = await invoiceRow(tx, invoiceId)
  if (!i || i.kind !== 'final' || i.state === 'draft') return
  const requestId = requestIdOf(`invoice-reminders:${invoiceId}`)
  const steps = await collectionSteps(tx, i.id)
  const zone = businessZone(await loadConfig(tx)) ?? 'UTC'
  const basis = dueBasis(i, steps, zone)
  const reason = await stopReasonOf(tx, i, steps, basis?.since ?? null)
  const deliveries = await reminderDeliveries(tx, i.id)
  if (reason)
    for (const d of deliveries.filter((x) => x.message_key === UNPAID_REMINDER_MESSAGE_KEY && waiting(x)))
      await cancelStage(tx, i.id, d.subject_key, reason, requestId)
  const collectible = ![
    'invoice_paid',
    'invoice_voided',
    'no_balance',
    'not_final_invoice',
    'invoice_not_issued',
  ].includes(reason ?? '')
  const r = await requestFacts(tx, i.project_id)
  const facts = {
    projectId: i.project_id,
    reference: r?.reference ?? null,
    assignedStaffId: r?.responsible_staff_id ?? null,
  }
  const stageSent = (stage: ReminderStage) =>
    deliveries.filter(
      (d) =>
        d.message_key === UNPAID_REMINDER_MESSAGE_KEY &&
        parseReminderSubject(d.subject_key)?.stage === stage &&
        (d.state === 'sent' || d.state === 'delivered'),
    )
  // The review: a payment suspended the reminders before the second one went, and no step was recorded after it.
  const latestPayment = await paymentSince(tx, i.id, null)
  const latestStep = steps.at(-1)?.recorded_at ?? null
  const review =
    collectible &&
    reason === 'payment_recorded' &&
    stageSent(2).length === 0 &&
    latestPayment !== null &&
    (latestStep === null || latestStep.getTime() < latestPayment.getTime())
  if (review)
    await openQueueItem(tx, { type: REMINDER_REVIEW_QUEUE_TYPE, subjectId: i.id, reason: 'payment_recorded', ...facts })
  else
    await resolveQueueItem(tx, {
      type: REMINDER_REVIEW_QUEUE_TYPE,
      subjectId: i.id,
      resolution: collectible ? 'next_step_recorded' : 'invoice_settled',
    })
  // Overdue—owner decision: the second reminder actually sent, the balance remaining, nothing decided since.
  const sentAt = stageSent(2)
    .map((d) => (d.sent_at ? new Date(d.sent_at).getTime() : 0))
    .sort((a, b) => a - b)[0]
  const decidedSince =
    sentAt !== undefined &&
    steps.some(
      (s) =>
        ['revised_due_date', 'payment_plan', 'collection_hold', 'overdue_decided'].includes(s.kind) &&
        s.recorded_at.getTime() >= sentAt,
    )
  if (collectible && sentAt !== undefined && !decidedSince)
    await openQueueItem(tx, {
      type: OVERDUE_QUEUE_TYPE,
      subjectId: i.id,
      reason: 'overdue_owner_decision',
      ...facts,
      assignedStaffId: null,
    })
  else
    await resolveQueueItem(tx, {
      type: OVERDUE_QUEUE_TYPE,
      subjectId: i.id,
      resolution: !collectible ? 'invoice_settled' : decidedSince ? 'owner_decided' : 'reminder_not_delivered',
    })
}

/** syncInvoiceReminders for each issued final invoice of a job (a change of the job's money, disputes or reviews). */
export async function syncJobInvoiceReminders(tx: Tx, jobId: string): Promise<void> {
  const rows = await tx
    .selectFrom('finance.invoices')
    .select('id')
    .where('job_id', '=', jobId)
    .where('kind', '=', 'final')
    .where('state', '<>', 'draft')
    .orderBy('created_at')
    .execute()
  for (const r of rows) await syncInvoiceReminders(tx, r.id)
}

/**
 * The send-time recheck of an unpaid-invoice reminder or follow-up (the invoice entry of the one notify.release
 * registration): the invoice may still be reminded; an automatic stage still belongs to the current due date and was
 * not handed over under another one; a follow-up counts only payments after its release.
 */
export const unpaidReminderRecordCheck: RecordCheck = async (tx, input) => {
  if (input.messageKey !== UNPAID_REMINDER_MESSAGE_KEY && input.messageKey !== UNPAID_FOLLOW_UP_MESSAGE_KEY)
    return 'current'
  if (!UUID_RE.test(input.recordId)) return { stale: 'invoice_not_found' }
  // Read without the invoice's lock: the send job already holds the delivery's, and the money writes take the invoice's
  // before the deliveries' (the order of every money write), so the check never waits on them in the other order.
  const i = await invoiceRow(tx, input.recordId)
  if (!i) return { stale: 'invoice_not_found' }
  const steps = await collectionSteps(tx, i.id)
  if (input.messageKey === UNPAID_FOLLOW_UP_MESSAGE_KEY) {
    const f = parseFollowUpSubject(input.subjectKey)
    const step = f ? steps.find((s) => s.id === f.stepId && s.kind === 'follow_up_released') : undefined
    if (!step) return { stale: 'invoice_not_found' }
    const reason = await stopReasonOf(tx, i, steps, step.recorded_at)
    return reason ? { stale: reason } : 'current'
  }
  const s = parseReminderSubject(input.subjectKey)
  const zone = businessZone(await loadConfig(tx)) ?? 'UTC'
  const basis = dueBasis(i, steps, zone)
  if (!s || s.invoiceId !== i.id || !basis) return { stale: 'invoice_not_found' }
  if (s.dueVersion !== basis.version) return { stale: 'due_date_revised' }
  const reason = await stopReasonOf(tx, i, steps, basis.since)
  if (reason) return { stale: reason }
  const other = (await reminderDeliveries(tx, i.id)).some(
    (d) =>
      d.message_key === UNPAID_REMINDER_MESSAGE_KEY &&
      d.subject_key !== input.subjectKey &&
      parseReminderSubject(d.subject_key)?.stage === s.stage &&
      handedOver(d),
  )
  return other ? { stale: 'stage_already_sent' } : 'current'
}

/**
 * The values of the reminder and follow-up wording, read when it sends (OWN-DEC-151, OWN-DEC-158): the first name
 * ("Hi there," without one), the invoice number and the project's Documents tab. Never an amount.
 */
export function unpaidReminderValues(publicSiteUrl: string | undefined): ReleaseValues {
  return async (tx, row) => {
    if (row.message_key !== UNPAID_REMINDER_MESSAGE_KEY && row.message_key !== UNPAID_FOLLOW_UP_MESSAGE_KEY)
      return undefined
    const invoiceId =
      parseReminderSubject(row.subject_key)?.invoiceId ?? parseFollowUpSubject(row.subject_key)?.invoiceId
    if (!invoiceId) return {}
    const i = await invoiceRow(tx, invoiceId)
    if (!i?.number) return {}
    const r = await requestFacts(tx, i.project_id)
    if (!r) return {}
    return present({
      customerName: firstNameOf(r.full_name),
      invoiceNumber: i.number,
      invoiceLink: portalLink(publicSiteUrl, r.project_reference, 'documents'),
    })
  }
}

/** A failed reminder or follow-up is a delivery issue for the project's responsible staff member (HH-COM-02). */
export const unpaidReminderFailureItem: ReleaseFailureItem = async (tx, row): Promise<FailureItem | undefined> => {
  if (row.message_key !== UNPAID_REMINDER_MESSAGE_KEY && row.message_key !== UNPAID_FOLLOW_UP_MESSAGE_KEY)
    return undefined
  if (row.record_type !== RECORD_TYPE || !row.record_id || !UUID_RE.test(row.record_id)) return undefined
  const i = await invoiceRow(tx, row.record_id)
  if (!i) return undefined
  const r = await requestFacts(tx, i.project_id)
  return { reference: r?.reference ?? null, projectId: i.project_id, assignedStaffId: r?.responsible_staff_id ?? null }
}

/** An issued final invoice schedules its reminders (TSK-0091). */
export function unpaidReminderScheduleAutomation(): Automation {
  return {
    name: 'invoice.reminder_schedule',
    trigger: { kind: 'event', eventTypes: [INVOICE_ISSUED_EVENT] },
    identity: PROCESS,
    inputs: {
      description: 'the issued invoice (event aggregate); its due date, cadence and stop rules then',
      version: 1,
    },
    idempotency: 'one delivery per invoice, stage, due-date version and destination (the delivery tuple)',
    effect: 'schedules the automatic unpaid-invoice reminders of an issued final invoice',
    retry: NOTIFICATION_RETRY,
    timeoutMs: 10_000,
    exceptionOwner: 'office',
    audit: { action: 'invoice_reminder.schedule' },
    handle: async ({ tx, job }) =>
      job.target.id ? planUnpaidReminders(tx, { invoiceId: job.target.id, requestId: job.requestId }) : 'cancelled',
  }
}

/** Plans the reminders of a final invoice issued before TSK-0091 (migration 0097). */
export function unpaidReminderPlanAutomation(): Automation {
  return {
    name: 'invoice.reminder_plan',
    trigger: { kind: 'schedule', description: 'one job per issued final invoice to plan its reminders' },
    identity: PROCESS,
    inputs: { description: 'the invoice (job target); its due date, cadence and stop rules then', version: 1 },
    idempotency: 'one delivery per invoice, stage, due-date version and destination (the delivery tuple)',
    effect: 'schedules the automatic unpaid-invoice reminders of an issued final invoice',
    retry: NOTIFICATION_RETRY,
    timeoutMs: 10_000,
    exceptionOwner: 'office',
    audit: { action: 'invoice_reminder.plan' },
    handle: async ({ tx, job }) =>
      job.target.id ? planUnpaidReminders(tx, { invoiceId: job.target.id, requestId: job.requestId }) : 'cancelled',
  }
}

/**
 * A reminder's delivery outcome updates the queue items (the second reminder actually sent opens "Overdue—owner
 * decision"; one that turns out not delivered resolves it).
 */
export function unpaidReminderOutcomeAutomation(): Automation {
  return {
    name: 'invoice.reminder_outcome',
    trigger: { kind: 'event', eventTypes: ['message.delivery_succeeded', 'message.delivery_failed'] },
    identity: PROCESS,
    inputs: { description: 'the delivery whose outcome was recorded; the invoice and its records then', version: 1 },
    idempotency: 'the queue items are one open item per type and invoice, computed from the records',
    effect: 'opens or resolves the review and Overdue—owner decision items of an invoice',
    retry: NOTIFICATION_RETRY,
    timeoutMs: 10_000,
    exceptionOwner: 'office',
    audit: { action: 'invoice_reminder.outcome' },
    handle: async ({ tx, job }): Promise<JobOutcome> => {
      const id = job.target.id
      if (!id || !UUID_RE.test(id)) return 'cancelled'
      const d = await tx
        .selectFrom('platform.message_deliveries')
        .select(['message_key', 'record_type', 'record_id'])
        .where('id', '=', id)
        .executeTakeFirst()
      if (!d || (d.message_key !== UNPAID_REMINDER_MESSAGE_KEY && d.message_key !== UNPAID_FOLLOW_UP_MESSAGE_KEY))
        return 'cancelled'
      if (d.record_type !== RECORD_TYPE || !d.record_id || !UUID_RE.test(d.record_id)) return 'cancelled'
      await invoiceRow(tx, d.record_id, true)
      await syncInvoiceReminders(tx, d.record_id)
      return 'done'
    },
  }
}

/** The automations of the unpaid-invoice reminders. */
export function unpaidReminderAutomations(): Automation[] {
  return [unpaidReminderScheduleAutomation(), unpaidReminderPlanAutomation(), unpaidReminderOutcomeAutomation()]
}

// ------------------------------------------------------------------------------------------------ staff actions

const field = (f: string, code: string): FieldError => ({ field: f, code, message: '' })
const conflict = (code: string, f = 'invoice') => new ApiError('CONFLICT', { fieldErrors: [field(f, code)] })
const invalid = (f: string, code: string) => new ApiError('VALIDATION_FAILED', { fieldErrors: [field(f, code)] })
type ReminderPermission = 'payment_reminder.release' | 'invoice.decide_overdue'
const allows = (actor: StaffActor, permission: ReminderPermission, projectId: string) =>
  decide(actor, permission, { projectId }, { now: new Date(), online: true }).effect === 'allow'

function note(value: string | null | undefined, required: boolean): string | null {
  const v = (value ?? '').trim()
  if (v === '') {
    if (required) throw invalid('body.note', 'required')
    return null
  }
  if (v.length > COLLECTION_STEP_LIMITS.note) throw invalid('body.note', 'TOO_LONG')
  return v
}

/** The invoice a staff action is about, locked, issued, final and with a balance. */
async function collectibleInvoice(tx: Tx, invoiceId: string): Promise<InvoiceRow> {
  const i = await invoiceRow(tx, invoiceId, true)
  if (!i) throw new ApiError('NOT_FOUND')
  if (i.kind !== 'final') throw conflict('NOT_FINAL_INVOICE')
  if (i.state === 'draft') throw conflict('INVOICE_NOT_ISSUED')
  if (i.state === 'voided') throw conflict('INVOICE_VOIDED')
  if (i.state === 'paid' || (await invoiceMoney(tx, i.id)).remainingCents <= 0) throw conflict('INVOICE_PAID')
  return i
}

export type RecordStepInput = {
  kind: RecordedStepKind
  dueOn?: string | null
  endsStepId?: string | null
  note: string
}

/**
 * Staff record a collection step (payment_reminder.release: the Owner, Office): a revised due date (from today to 365
 * days ahead, PROPOSED), a payment plan, a collection hold, or the end of an active plan or hold. A revised due date
 * plans the stages still unsent from it at once. Returns the step id.
 */
export async function recordCollectionStep(
  tx: Tx,
  actor: StaffActor,
  invoiceId: string,
  input: RecordStepInput,
): Promise<{ id: string; kind: RecordedStepKind }> {
  if (!(RECORDED_STEP_KINDS as readonly string[]).includes(input.kind)) throw invalid('body.kind', 'INVALID')
  const i = await collectibleInvoice(tx, invoiceId)
  const text = note(input.note, true)
  const steps = await collectionSteps(tx, i.id)
  const active = activeArrangements(steps)
  let dueOn: string | null = null
  let endsStepId: string | null = null
  if (input.kind === 'revised_due_date') {
    const zone = businessZone(await loadConfig(tx))
    if (!zone) throw conflict('TIME_ZONE_NOT_CONFIGURED')
    const v = input.dueOn ?? ''
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(`${v}T12:00:00Z`)) || addDays(v, 0) !== v)
      throw invalid('body.dueOn', 'INVALID_DATE')
    const today = localDate(await dbNow(tx), zone)
    if (v < today) throw invalid('body.dueOn', 'DUE_DATE_IN_PAST')
    if (v > addDays(today, COLLECTION_STEP_LIMITS.revisedDueDays)) throw invalid('body.dueOn', 'DUE_DATE_TOO_FAR')
    dueOn = v
  } else if (input.kind === 'arrangement_ended') {
    const target = [active.plan, active.hold].find((s) => s && s.id === input.endsStepId)
    if (!target) throw conflict('ARRANGEMENT_NOT_ACTIVE', 'body.endsStepId')
    endsStepId = target.id
  } else if ((input.kind === 'payment_plan' && active.plan) || (input.kind === 'collection_hold' && active.hold))
    throw conflict('ARRANGEMENT_ACTIVE', 'body.kind')
  const row = await tx
    .insertInto('finance.invoice_collection_steps')
    .values({
      invoice_id: i.id,
      job_id: i.job_id,
      project_id: i.project_id,
      kind: input.kind,
      due_on: dueOn,
      ends_step_id: endsStepId,
      note: text,
      recorded_by: actor.userId,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  const requestId = requestIdOf(`invoice-reminders:${i.id}`)
  // A revised due date counts the stages still unsent from it; a plan or a hold stops the waiting ones.
  if (input.kind === 'revised_due_date') await planUnpaidReminders(tx, { invoiceId: i.id, requestId })
  await syncInvoiceReminders(tx, i.id)
  return { id: row.id, kind: input.kind }
}

/** Why a follow-up may not be released now, or null when it may (see the header). */
async function followUpProblem(db: Reader, i: InvoiceRow, steps: readonly StepRow[]): Promise<string | null> {
  const zone = businessZone(await loadConfig(db)) ?? 'UTC'
  const basis = dueBasis(i, steps, zone)
  const reason = await stopReasonOf(db, i, steps, basis?.since ?? null)
  if (reason && reason !== 'payment_recorded') return reason
  const deliveries = await reminderDeliveries(db, i.id)
  if (deliveries.some((d) => d.message_key === UNPAID_FOLLOW_UP_MESSAGE_KEY && (waiting(d) || d.state === 'draft')))
    return 'follow_up_waiting'
  const secondSent = deliveries.some(
    (d) =>
      d.message_key === UNPAID_REMINDER_MESSAGE_KEY &&
      parseReminderSubject(d.subject_key)?.stage === 2 &&
      handedOver(d),
  )
  if (!secondSent && reason !== 'payment_recorded') return 'automatic_reminders_pending'
  return null
}

/**
 * Staff release a follow-up reminder (payment_reminder.release): after the second reminder was sent, or after a payment
 * suspended the reminders. One email to the project's contact, sent at once by notify.release and rechecked then.
 */
export async function releaseFollowUp(
  tx: Tx,
  actor: StaffActor,
  invoiceId: string,
  input: { note?: string | null },
): Promise<{ stepId: string; deliveryId: string }> {
  const i = await collectibleInvoice(tx, invoiceId)
  const text = note(input.note, false)
  const steps = await collectionSteps(tx, i.id)
  const problem = await followUpProblem(tx, i, steps)
  if (problem) throw conflict(problem.toUpperCase())
  const r = await requestFacts(tx, i.project_id)
  if (!r?.email) throw conflict('NO_EMAIL_ADDRESS')
  const config = await loadConfig(tx)
  const stepId = randomUUID()
  const draft = await createDraft(tx, {
    config,
    messageKey: UNPAID_FOLLOW_UP_MESSAGE_KEY,
    destination: {
      channel: 'email',
      destination: r.email,
      permission: r.preferred_channel === 'email' ? 'preferred' : 'permitted',
    },
    recipient: { kind: 'customer_contact', id: r.contactId, destinations: [] },
    subjectKey: followUpSubjectKey(i.id, stepId),
    record: { type: RECORD_TYPE, id: i.id },
    values: {},
    projectId: i.project_id,
  })
  await tx
    .insertInto('finance.invoice_collection_steps')
    .values({
      id: stepId,
      invoice_id: i.id,
      job_id: i.job_id,
      project_id: i.project_id,
      kind: 'follow_up_released',
      delivery_id: draft.id,
      note: text,
      recorded_by: actor.userId,
    })
    .execute()
  await releaseDraft(tx, {
    config,
    deliveryId: draft.id,
    actor: { kind: 'staff', id: actor.userId, roles: [...actor.roles] },
    automation: RELEASE_JOB,
    requestId: requestIdOf(`invoice-follow-up:${i.id}`),
  })
  await syncInvoiceReminders(tx, i.id)
  return { stepId, deliveryId: draft.id }
}

/** The scheduling declaration of notify.release (its senders are the worker's own; scheduling needs none). */
const RELEASE_JOB = releaseAutomation({ email: null, sms: null })

/** The Owner's "Overdue—owner decision" (invoice.decide_overdue): staff keep following up; the item resolves. */
export async function decideOverdue(
  tx: Tx,
  actor: StaffActor,
  invoiceId: string,
  input: { note: string },
): Promise<{ id: string }> {
  const i = await collectibleInvoice(tx, invoiceId)
  const text = note(input.note, true)
  const open = await tx
    .selectFrom('ops.queue_items')
    .select('id')
    .where('type', '=', OVERDUE_QUEUE_TYPE)
    .where('subject_id', '=', i.id)
    .where('resolved_at', 'is', null)
    .executeTakeFirst()
  if (!open) throw conflict('NOT_OVERDUE')
  const row = await tx
    .insertInto('finance.invoice_collection_steps')
    .values({
      invoice_id: i.id,
      job_id: i.job_id,
      project_id: i.project_id,
      kind: 'overdue_decided',
      note: text,
      recorded_by: actor.userId,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  await syncInvoiceReminders(tx, i.id)
  return { id: row.id }
}

// ------------------------------------------------------------------------------------------------ the staff view

type StaffRef = { id: string; name: string | null }

export type UnpaidReminderView = {
  id: string
  /** 1 or 2: an automatic stage; null: a staff-released follow-up. */
  stage: ReminderStage | null
  release: 'automatic' | 'staff_released'
  state: string
  /** Why it stopped, was suppressed, failed or waits (a stop reason or a delivery error code). */
  reason: string | null
  scheduledAt: string | null
  sentAt: string | null
  cancelledAt: string | null
}

export type CollectionStepView = {
  id: string
  kind: CollectionStepKind
  dueOn: string | null
  endsStepId: string | null
  /** A payment plan or collection hold that an end was recorded for. */
  ended: boolean
  note: string | null
  recordedBy: StaffRef
  recordedAt: string
}

export type InvoiceRemindersView = {
  invoiceId: string
  jobId: string
  projectReference: string
  invoiceNumber: string | null
  invoiceState: string
  cadence:
    | { state: 'CONFIGURED'; proposed: boolean; firstDaysAfterDue: number; secondDaysAfterDue: number }
    | { state: 'NOT_CONFIGURED' }
  /** The due date the reminders count from (business date), and whether staff revised it. */
  dueOn: string | null
  dueRevised: boolean
  /** When each stage is due from that date (null while NOT CONFIGURED). */
  stageDueAt: { stage: ReminderStage; dueAt: string | null }[]
  /** The stop rule as the records are now: while set, no automatic reminder is sent. */
  stoppedBy: UnpaidReminderStopReason | null
  reminders: UnpaidReminderView[]
  steps: CollectionStepView[]
  review: boolean
  overdue: boolean
  actions: {
    recordStep: boolean
    releaseFollowUp: boolean
    /** Why a follow-up may not be released now (for a caller who may release one). */
    followUpBlockedBy: string | null
    decideOverdue: boolean
  }
}

/** The reminders of one invoice for the staff screen (the channel is always email; the destination is not shown). */
export async function invoiceRemindersView(
  db: Reader,
  actor: StaffActor,
  invoiceId: string,
): Promise<InvoiceRemindersView | null> {
  const i = await invoiceRow(db, invoiceId)
  if (!i || i.kind !== 'final') return null
  const project = await db
    .selectFrom('crm.projects')
    .select('reference')
    .where('id', '=', i.project_id)
    .executeTakeFirstOrThrow()
  const config = await loadConfig(db)
  const cadence = unpaidReminderCadence(config)
  const steps = await collectionSteps(db, i.id)
  const zone = businessZone(config) ?? 'UTC'
  const basis = i.state === 'draft' ? null : dueBasis(i, steps, zone)
  const stoppedBy = i.state === 'draft' ? 'invoice_not_issued' : await stopReasonOf(db, i, steps, basis?.since ?? null)
  const deliveries = await reminderDeliveries(db, i.id)
  const items = await db
    .selectFrom('ops.queue_items')
    .select('type')
    .where('subject_id', '=', i.id)
    .where('type', 'in', [REMINDER_REVIEW_QUEUE_TYPE, OVERDUE_QUEUE_TYPE])
    .where('resolved_at', 'is', null)
    .execute()
  const people = [...new Set(steps.map((s) => s.recorded_by))]
  const names = new Map(
    (people.length
      ? await db.selectFrom('identity.staff_users').select(['id', 'display_name']).where('id', 'in', people).execute()
      : []
    ).map((p) => [String(p.id), p.display_name]),
  )
  const ended = new Set(steps.filter((s) => s.kind === 'arrangement_ended').map((s) => s.ends_step_id))
  const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null)
  const collectible = !['invoice_paid', 'invoice_voided', 'no_balance', 'invoice_not_issued'].includes(stoppedBy ?? '')
  const mayRelease = allows(actor, 'payment_reminder.release', i.project_id)
  const overdue = items.some((x) => x.type === OVERDUE_QUEUE_TYPE)
  const followUpBlockedBy = collectible && i.state !== 'draft' ? await followUpProblem(db, i, steps) : 'invoice_paid'
  return {
    invoiceId: i.id,
    jobId: i.job_id,
    projectReference: project.reference,
    invoiceNumber: i.number,
    invoiceState: i.state,
    cadence:
      cadence.state === 'CONFIGURED'
        ? {
            state: 'CONFIGURED',
            proposed: cadence.proposed,
            firstDaysAfterDue: cadence.days[1],
            secondDaysAfterDue: cadence.days[2],
          }
        : { state: 'NOT_CONFIGURED' },
    dueOn: basis?.dueOn ?? null,
    dueRevised: basis?.revised ?? false,
    stageDueAt: REMINDER_STAGES.map((stage) => ({
      stage,
      dueAt:
        basis && cadence.state === 'CONFIGURED'
          ? stageDueAt(basis.dueOn, cadence.days[stage], cadence.at, cadence.zone).toISOString()
          : null,
    })),
    stoppedBy,
    reminders: deliveries.map((d) => ({
      id: d.id,
      stage:
        d.message_key === UNPAID_REMINDER_MESSAGE_KEY ? (parseReminderSubject(d.subject_key)?.stage ?? null) : null,
      release: d.message_key === UNPAID_REMINDER_MESSAGE_KEY ? 'automatic' : 'staff_released',
      state: d.state,
      reason: d.error_code,
      // Due later only while it waits: once the provider accepted it, it reads as sent (sentAt).
      scheduledAt: d.state === 'queued' && !d.sent_at ? iso(d.scheduled_at) : null,
      sentAt: iso(d.sent_at),
      cancelledAt: iso(d.cancelled_at),
    })),
    steps: steps.map((s) => ({
      id: s.id,
      kind: s.kind as CollectionStepKind,
      dueOn: s.due_on,
      endsStepId: s.ends_step_id,
      ended: ended.has(s.id),
      note: s.note,
      recordedBy: { id: s.recorded_by, name: names.get(s.recorded_by) ?? null },
      recordedAt: new Date(s.recorded_at).toISOString(),
    })),
    review: items.some((x) => x.type === REMINDER_REVIEW_QUEUE_TYPE),
    overdue,
    actions: {
      recordStep: mayRelease && collectible && i.state !== 'draft',
      releaseFollowUp: mayRelease && followUpBlockedBy === null,
      followUpBlockedBy: mayRelease ? followUpBlockedBy : null,
      decideOverdue: overdue && collectible && allows(actor, 'invoice.decide_overdue', i.project_id),
    },
  }
}

/** The facts the policy needs about an invoice's reminders: its project; null when there is no final invoice. */
export async function reminderInvoiceFacts(db: Reader, invoiceId: string): Promise<{ projectId: string } | null> {
  const i = await db
    .selectFrom('finance.invoices')
    .select(['project_id', 'kind'])
    .where('id', '=', invoiceId)
    .executeTakeFirst()
  return i && i.kind === 'final' ? { projectId: i.project_id } : null
}
