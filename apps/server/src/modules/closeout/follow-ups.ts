// The follow-ups after a job's reviewed completion: the service-quality follow-up (the satisfaction check, MESSAGE 18)
// and review requests (TSK-0092; HH-QA-10, HH-COM-05, T67, OWN-DEC-157, OWN-DEC-113, OWN-DEC-109, OWN-DEC-124,
// FACT-REMINDER-CADENCES, ENT-Message, ENT-Case, RULE-SERVER-AUTHZ, RULE-NO-INVENTED-FACTS).
// - The satisfaction check is service communication, never marketing (OWN-DEC-157 items 1 and 4): one draft per job,
//   prepared reminders.cadences.satisfaction.daysAfterCompletion days (2, read as 48 hours, OWN-DEC-157 item 2) after
//   the Owner's quality review passed (the authorized final completion, PROPOSED), for every completed job, and
//   released by staff (message.release_draft: the Owner, Office). Its wording is the owner's customer_follow_up with
//   the secure project link to report a concern or ask for help (item 8, migration 0101). Email only while texts are
//   off (OWN-DEC-190).
// - Review requests are marketing (OWN-DEC-113): never automatic; staff prepare and release one, it is sent only with
//   the customer's marketing permission on the channel (rechecked at send by sendPermission), and the same eligibility
//   applies whatever the customer answered: nothing here reads a satisfaction answer (no positive-review filtering,
//   no incentives, no pressure). PROPOSED: one review request per job (another may be prepared only after one was
//   cancelled, failed or suppressed). Its wording and review destination are NOT CONFIGURED: until the Owner releases
//   a review.request template, staff may prepare a draft but not release it (TEMPLATE_NOT_CONFIGURED).
// - Stopped (never prepared, or not sent): the job was reopened (OWN-DEC-157 item 6, for good, PROPOSED), it is not
//   complete, the customer asked for no optional follow-ups (service communication withdrawn on the channel), or has
//   no email address. Paused: while any case on the project is open (ENT-Case, HH-COM-05): the draft is kept, marked
//   held, cannot be released, and is offered again in the staff queue once every case is closed, whatever the outcome
//   (OWN-DEC-113 "reconsider them after resolution regardless of the outcome").
// - Rechecked right before each send (the job entry of the one notify.release registration): a reopened or incomplete
//   job cancels it; an open case puts it back to a held draft; opt-outs, channel permission and marketing consent are
//   the send's own recheck (HH-COM-05).
// - The customer's answer (from their reply or a call) is recorded by staff (quality.satisfaction_responses); an answer
//   about a problem is handled as a complaint case by staff (TSK-0093), never by this module.
// - Queue: follow_up_release (staff queue) while a prepared follow-up of the job may be released.
import { randomUUID } from 'node:crypto'
import type { Db, Tx } from '@handyhub/db'
import {
  followUpBlock,
  followUpDueAt,
  SATISFACTION_ANSWERS,
  type FollowUpBlock,
  type SatisfactionAnswer,
} from '@handyhub/domain'
import type { StaffActor } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError, type FieldError } from '../../api/errors.js'
import { audit } from '../../platform/audit.js'
import type { Automation, JobOutcome } from '../../platform/automation.js'
import { loadConfig, type Config } from '../../platform/config/index.js'
import { scheduleJob } from '../../platform/jobs.js'
import { currentContext } from '../../platform/request-context.js'
import { projectHasActiveCase } from '../cases/active.js'
import {
  createDraft,
  currentConsent,
  currentTemplate,
  firstNameOf,
  jobNumberOf,
  NOTIFICATION_RETRY,
  portalLink,
  present,
  releaseAutomation,
  releaseDraft,
  type FailureItem,
  type RecordCheck,
  type ReleaseFailureItem,
  type ReleaseValues,
} from '../notifications/index.js'
import { openQueueItem, resolveQueueItem } from '../queue/items.js'
import { everReopened, jobRow, type JobRow } from './store.js'

type Reader = Db | Tx

export const SATISFACTION_MESSAGE_KEY = 'reminder.satisfaction_check'
export const REVIEW_REQUEST_MESSAGE_KEY = 'review.request'
export const FOLLOW_UP_MESSAGE_KEYS = [SATISFACTION_MESSAGE_KEY, REVIEW_REQUEST_MESSAGE_KEY] as const
export const FOLLOW_UP_QUEUE_TYPE = 'follow_up_release'
const RECORD_TYPE = 'job'
const PROCESS = 'system.closeout'
const HELD = 'held_case_active'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** PROPOSED limit: a note on a recorded answer of up to 2,000 characters. */
export const FOLLOW_UP_LIMITS = { note: 2000 } as const

export const satisfactionSubjectKey = (jobId: string) => `satisfaction_check:${jobId}`
export const reviewSubjectKey = (jobId: string, id: string) => `review_request:${jobId}:${id}`

const kindOf = (messageKey: string): 'satisfaction' | 'review' =>
  messageKey === SATISFACTION_MESSAGE_KEY ? 'satisfaction' : 'review'
const requestIdOf = (fallback: string) => currentContext()?.requestId ?? fallback

export type FollowUpCadence =
  | { readonly state: 'CONFIGURED'; readonly days: number; readonly version: number }
  | { readonly state: 'NOT_CONFIGURED' }

/** The configured satisfaction-check cadence (reminders.cadences.satisfaction); NOT CONFIGURED otherwise. */
export function followUpCadence(config: Config): FollowUpCadence {
  const entry = config.get('reminders.cadences')
  if (entry.state !== 'CONFIGURED') return { state: 'NOT_CONFIGURED' }
  return { state: 'CONFIGURED', days: entry.value.satisfaction.daysAfterCompletion, version: entry.version }
}

/** The project's contact a follow-up goes to: the request's contact, its email and the responsible staff member. */
async function contactOf(db: Reader, projectId: string) {
  return db
    .selectFrom('intake.requests as r')
    .innerJoin('crm.contacts as c', 'c.id', 'r.contact_id')
    .innerJoin('crm.projects as p', 'p.id', 'r.project_id')
    .select(['r.reference', 'r.responsible_staff_id', 'p.reference as project_reference', 'c.id as contactId'])
    .select(['c.full_name', 'c.email', 'c.preferred_channel'])
    .where('r.project_id', '=', projectId)
    .orderBy('r.submitted_at')
    .executeTakeFirst()
}

async function passedAt(db: Reader, jobId: string): Promise<Date | null> {
  const r = await db
    .selectFrom('quality.reviews')
    .select('passed_at')
    .where('job_id', '=', jobId)
    .where('state', '=', 'passed')
    .executeTakeFirst()
  return r?.passed_at ? new Date(r.passed_at) : null
}

/** Why a follow-up of this kind may not go for the job now (null: it may), from its records. */
export async function followUpProblem(
  db: Reader,
  job: Pick<JobRow, 'id' | 'project_id' | 'operational_state'>,
  kind: 'satisfaction' | 'review',
): Promise<FollowUpBlock | null> {
  const c = await contactOf(db, job.project_id)
  const email = c?.email ?? null
  const optedOut = email ? (await currentConsent(db, 'email', email, 'service_communication')) === 'withdrawn' : false
  return followUpBlock(kind, {
    jobState: job.operational_state,
    everReopened: await everReopened(db, job.id),
    activeCases: (await projectHasActiveCase(db, job.project_id)) ? 1 : 0,
    optedOut,
    ...(kind === 'review' && email
      ? { marketingConsent: (await currentConsent(db, 'email', email, 'marketing')) === 'granted' }
      : {}),
    hasEmail: email !== null && email !== '',
  })
}

type FollowUpRow = {
  id: string
  message_key: string
  subject_key: string
  state: string
  error_code: string | null
  scheduled_at: Date | null
  sent_at: Date | null
  cancelled_at: Date | null
  created_at: Date
}

async function followUpDeliveries(db: Reader, jobId: string): Promise<FollowUpRow[]> {
  return db
    .selectFrom('platform.message_deliveries')
    .select(['id', 'message_key', 'subject_key', 'state', 'error_code', 'scheduled_at', 'sent_at', 'cancelled_at'])
    .select('created_at')
    .where('record_type', '=', RECORD_TYPE)
    .where('record_id', '=', jobId)
    .where('message_key', 'in', [...FOLLOW_UP_MESSAGE_KEYS])
    .orderBy('seq')
    .execute() as Promise<FollowUpRow[]>
}

async function notPrepared(tx: Tx, jobId: string, reason: string, requestId: string) {
  await audit.record(tx, {
    actor: { kind: 'system', process: PROCESS },
    action: 'follow_up.not_prepared',
    target: { type: RECORD_TYPE, id: jobId },
    summary: { messageKey: SATISFACTION_MESSAGE_KEY, reason },
    requestId,
  })
}

/** The scheduling declaration of the preparation job (scheduling needs only its name and retry budget). */
const PREPARE_NAME = 'closeout.follow_up_prepare'

/**
 * Schedules the preparation of a job's satisfaction check at its time (called in the transaction where the Owner's
 * review passed). Idempotent: one job per job; while the cadence is NOT CONFIGURED it runs now and prepares nothing.
 */
export async function scheduleFollowUpPreparation(tx: Tx, jobId: string): Promise<void> {
  const cadence = followUpCadence(await loadConfig(tx))
  const passed = (await passedAt(tx, jobId)) ?? new Date()
  await scheduleJob(tx, followUpPrepareAutomation(), {
    key: jobId,
    runAt: cadence.state === 'CONFIGURED' ? followUpDueAt(passed, cadence.days) : new Date(),
    target: { type: RECORD_TYPE, id: jobId },
    requestId: requestIdOf(`follow-up:${jobId}`),
  })
}

/**
 * Prepares the satisfaction-check draft of a job, once (see the header): nothing before its time (a run that is early
 * schedules itself at the time), nothing while the cadence is NOT CONFIGURED, nothing for a job that is not complete,
 * was reopened, already has one, or whose customer opted out or has no email. Prepared while a case is open, held.
 */
export async function prepareSatisfactionCheck(tx: Tx, jobId: string, requestId: string): Promise<JobOutcome> {
  const job = await jobRow(tx, jobId, true)
  if (!job) return 'cancelled'
  const config = await loadConfig(tx)
  const cadence = followUpCadence(config)
  const passed = await passedAt(tx, job.id)
  if (cadence.state !== 'CONFIGURED' || !passed) {
    await notPrepared(tx, job.id, passed ? 'not_configured' : 'job_not_complete', requestId)
    return 'cancelled'
  }
  const due = followUpDueAt(passed, cadence.days)
  const now = new Date()
  if (due.getTime() > now.getTime()) {
    await scheduleJob(tx, followUpPrepareAutomation(), {
      key: `${job.id}:at:${due.getTime()}`,
      runAt: due,
      target: { type: RECORD_TYPE, id: job.id },
      requestId,
    })
    return 'cancelled'
  }
  if ((await followUpDeliveries(tx, job.id)).some((d) => d.message_key === SATISFACTION_MESSAGE_KEY)) {
    await notPrepared(tx, job.id, 'already_prepared', requestId)
    return 'cancelled'
  }
  const block = await followUpProblem(tx, job, 'satisfaction')
  if (block && block !== 'case_active') {
    await notPrepared(tx, job.id, block, requestId)
    return 'cancelled'
  }
  const c = (await contactOf(tx, job.project_id)) as NonNullable<Awaited<ReturnType<typeof contactOf>>>
  const destination = {
    channel: 'email' as const,
    destination: c.email,
    permission: c.preferred_channel === 'email' ? ('preferred' as const) : ('permitted' as const),
  }
  const draft = await createDraft(tx, {
    config,
    messageKey: SATISFACTION_MESSAGE_KEY,
    destination,
    recipient: { kind: 'customer_contact', id: c.contactId, destinations: [destination] },
    subjectKey: satisfactionSubjectKey(job.id),
    record: { type: RECORD_TYPE, id: job.id },
    values: {},
    projectId: job.project_id,
  })
  await audit.record(tx, {
    actor: { kind: 'system', process: PROCESS },
    action: 'follow_up.prepared',
    target: { type: 'message_delivery', id: draft.id },
    summary: { messageKey: SATISFACTION_MESSAGE_KEY, jobId: job.id, channel: 'email', held: block === 'case_active' },
    requestId,
  })
  await syncFollowUps(tx, job.id)
  return 'done'
}

/** The schedule-triggered preparation of a job's satisfaction check (scheduled when the review passes; 0101). */
export function followUpPrepareAutomation(): Automation {
  return {
    name: PREPARE_NAME,
    trigger: {
      kind: 'schedule',
      description: 'one job per completed job, at the follow-up time after the review passed',
    },
    identity: PROCESS,
    inputs: { description: 'the job (job target); its review, cases, consent and contact then', version: 1 },
    idempotency: 'one satisfaction-check draft per job (subject satisfaction_check:<job>)',
    effect: 'prepares the staff-released service-quality follow-up of a completed job; never sends anything',
    retry: NOTIFICATION_RETRY,
    timeoutMs: 10_000,
    exceptionOwner: 'office',
    audit: { action: 'follow_up.prepare' },
    handle: async ({ tx, job }) =>
      job.target.id && UUID_RE.test(job.target.id)
        ? prepareSatisfactionCheck(tx, job.target.id, job.requestId)
        : 'cancelled',
  }
}

/**
 * Keeps a job's follow-up drafts and its staff queue item in line with the records, in the transaction of the change
 * (a prepared draft, a release, a case opened or closed on the project, a reopen): a draft is marked held while a case
 * is open and offered again once none is; a draft a stop rule now applies to is cancelled with the reason.
 */
export async function syncFollowUps(tx: Tx, jobId: string): Promise<void> {
  const job = await jobRow(tx, jobId)
  if (!job) return
  const drafts = (await followUpDeliveries(tx, job.id)).filter((d) => d.state === 'draft')
  let ready: 'satisfaction_check_ready' | 'review_request_ready' | null = null
  for (const d of drafts) {
    const block = await followUpProblem(tx, job, kindOf(d.message_key))
    if (block === 'case_active') {
      if (d.error_code !== HELD)
        await tx
          .updateTable('platform.message_deliveries')
          .set({ error_code: HELD, updated_at: sql<Date>`now()` })
          .where('id', '=', d.id)
          .execute()
      continue
    }
    if (block === 'job_reopened' || block === 'job_not_complete') {
      await tx
        .updateTable('platform.message_deliveries')
        .set({
          state: 'cancelled',
          error_code: block,
          cancelled_by: 'system',
          cancelled_at: sql<Date>`now()`,
          updated_at: sql<Date>`now()`,
        })
        .where('id', '=', d.id)
        .where('state', '=', 'draft')
        .execute()
      continue
    }
    if (d.error_code === HELD)
      await tx
        .updateTable('platform.message_deliveries')
        .set({ error_code: null, updated_at: sql<Date>`now()` })
        .where('id', '=', d.id)
        .execute()
    // An opt-out or a missing permission is the send's own recheck; the draft stays for staff to see.
    if (block === null)
      ready ??= d.message_key === SATISFACTION_MESSAGE_KEY ? 'satisfaction_check_ready' : 'review_request_ready'
  }
  if (ready) {
    const c = await contactOf(tx, job.project_id)
    await openQueueItem(tx, {
      type: FOLLOW_UP_QUEUE_TYPE,
      subjectId: job.id,
      reason: ready,
      projectId: job.project_id,
      reference: c?.project_reference ?? null,
      status: job.operational_state,
    })
  } else
    await resolveQueueItem(tx, {
      type: FOLLOW_UP_QUEUE_TYPE,
      subjectId: job.id,
      resolution: drafts.length ? HELD : 'no_draft',
    })
}

/** syncFollowUps for the jobs of a project (a case opened, changed or closed on it). */
export async function syncProjectFollowUps(tx: Tx, projectId: string): Promise<void> {
  const jobs = await tx.selectFrom('work.jobs').select('id').where('project_id', '=', projectId).execute()
  for (const j of jobs) await syncFollowUps(tx, j.id)
}

// ------------------------------------------------------------------------------------------------ send time

/**
 * The send-time recheck of a released follow-up (the job entry of the one notify.release registration): a reopened or
 * incomplete job cancels it; an open case on the project holds it (back to a draft for staff to release again).
 */
export const followUpRecordCheck: RecordCheck = async (tx, input) => {
  if (!(FOLLOW_UP_MESSAGE_KEYS as readonly string[]).includes(input.messageKey)) return 'current'
  const job = await jobRow(tx, input.recordId)
  if (!job) return { stale: 'job_not_found' }
  const block = await followUpProblem(tx, job, kindOf(input.messageKey))
  if (block === 'case_active') return { hold: 'case_active' }
  if (block === 'job_reopened' || block === 'job_not_complete') return { stale: block }
  // Opt-outs, channel permission and marketing consent: the send's own recheck (sendPermission) suppresses it.
  return 'current'
}

/**
 * The values of the follow-up wording, read when it sends: the first name ("Hi there," without one), the job number
 * and the project's portal page (the secure link to report a concern or ask for help). A review request: the link.
 */
export function followUpValues(publicSiteUrl: string | undefined): ReleaseValues {
  return async (tx, row) => {
    if (!(FOLLOW_UP_MESSAGE_KEYS as readonly string[]).includes(row.message_key)) return undefined
    const jobId = /^(?:satisfaction_check|review_request):([0-9a-f-]{36})/i.exec(row.subject_key)?.[1]
    if (!jobId) return {}
    const job = await jobRow(tx, jobId)
    if (!job) return {}
    const c = await contactOf(tx, job.project_id)
    if (!c) return {}
    const projectLink = portalLink(publicSiteUrl, c.project_reference)
    if (row.message_key === REVIEW_REQUEST_MESSAGE_KEY) return present({ projectLink })
    return present({
      customerName: firstNameOf(c.full_name),
      jobNumber: jobNumberOf(c.project_reference),
      projectLink,
    })
  }
}

/** A failed follow-up is a delivery issue for the project's responsible staff member (HH-COM-02). */
export const followUpFailureItem: ReleaseFailureItem = async (tx, row): Promise<FailureItem | undefined> => {
  if (!(FOLLOW_UP_MESSAGE_KEYS as readonly string[]).includes(row.message_key)) return undefined
  if (row.record_type !== RECORD_TYPE || !row.record_id || !UUID_RE.test(row.record_id)) return undefined
  const job = await jobRow(tx, row.record_id)
  if (!job) return undefined
  const c = await contactOf(tx, job.project_id)
  return {
    reference: c?.reference ?? null,
    projectId: job.project_id,
    assignedStaffId: c?.responsible_staff_id ?? null,
  }
}

// ------------------------------------------------------------------------------------------------ staff actions

const field = (f: string, code: string): FieldError => ({ field: f, code, message: '' })
const conflict = (code: string, f = 'followUp') => new ApiError('CONFLICT', { fieldErrors: [field(f, code)] })
const invalid = (f: string, code: string) => new ApiError('VALIDATION_FAILED', { fieldErrors: [field(f, code)] })

/** The scheduling declaration of notify.release (its senders are the worker's own; scheduling needs none). */
const RELEASE_JOB = releaseAutomation({ email: null, sms: null })

async function reviewTemplateReady(db: Reader): Promise<boolean> {
  return (await currentTemplate(db, REVIEW_REQUEST_MESSAGE_KEY, 'email', 'en')) !== null
}

/**
 * Staff prepare a review request (message.release_draft): never automatic and never gated on the customer's answer.
 * Refused for a job not complete or reopened, without an email, after an opt-out, without the customer's marketing
 * permission, while one is waiting or once one was sent (PROPOSED: one per job). Prepared while a case is open, held.
 */
export async function prepareReviewRequest(tx: Tx, actor: StaffActor, jobId: string): Promise<{ deliveryId: string }> {
  const job = await jobRow(tx, jobId, true)
  if (!job) throw new ApiError('NOT_FOUND')
  const existing = (await followUpDeliveries(tx, job.id)).filter((d) => d.message_key === REVIEW_REQUEST_MESSAGE_KEY)
  if (existing.some((d) => d.state === 'draft' || (d.state === 'queued' && !d.sent_at)))
    throw conflict('REVIEW_REQUEST_WAITING')
  if (existing.some((d) => d.state === 'sent' || d.state === 'delivered' || d.sent_at !== null))
    throw conflict('REVIEW_REQUEST_SENT')
  const block = await followUpProblem(tx, job, 'review')
  if (block && block !== 'case_active') throw conflict(block.toUpperCase())
  const c = (await contactOf(tx, job.project_id)) as NonNullable<Awaited<ReturnType<typeof contactOf>>>
  const destination = {
    channel: 'email' as const,
    destination: c.email,
    permission: c.preferred_channel === 'email' ? ('preferred' as const) : ('permitted' as const),
  }
  const draft = await createDraft(tx, {
    config: await loadConfig(tx),
    messageKey: REVIEW_REQUEST_MESSAGE_KEY,
    destination,
    recipient: { kind: 'customer_contact', id: c.contactId, destinations: [destination] },
    subjectKey: reviewSubjectKey(job.id, randomUUID()),
    record: { type: RECORD_TYPE, id: job.id },
    values: {},
    projectId: job.project_id,
  })
  await audit.record(tx, {
    actor: { kind: 'staff', id: actor.userId, roles: [...actor.roles] },
    action: 'follow_up.prepared',
    target: { type: 'message_delivery', id: draft.id },
    summary: { messageKey: REVIEW_REQUEST_MESSAGE_KEY, jobId: job.id, channel: 'email', held: block === 'case_active' },
    requestId: requestIdOf(`review-request:${job.id}`),
  })
  await syncFollowUps(tx, job.id)
  return { deliveryId: draft.id }
}

async function lockFollowUp(tx: Tx, jobId: string, deliveryId: string) {
  if (!UUID_RE.test(deliveryId)) throw new ApiError('NOT_FOUND')
  const row = await tx
    .selectFrom('platform.message_deliveries')
    .select(['id', 'message_key', 'state', 'channel'])
    .where('id', '=', deliveryId)
    .where('record_type', '=', RECORD_TYPE)
    .where('record_id', '=', jobId)
    .where('message_key', 'in', [...FOLLOW_UP_MESSAGE_KEYS])
    .forUpdate()
    .executeTakeFirst()
  if (!row) throw new ApiError('NOT_FOUND')
  if (row.state !== 'draft') throw conflict('NOT_A_DRAFT')
  return row
}

/**
 * Staff release a prepared follow-up (message.release_draft): refused while a case is open, after a reopen, after an
 * opt-out, for a review request without the customer's marketing permission or while its wording is NOT CONFIGURED.
 * Sent by notify.release at its release time and rechecked then.
 */
export async function releaseFollowUp(
  tx: Tx,
  actor: StaffActor,
  jobId: string,
  deliveryId: string,
): Promise<{ deliveryId: string; messageKey: string; runAt: Date }> {
  const job = await jobRow(tx, jobId, true)
  if (!job) throw new ApiError('NOT_FOUND')
  const row = await lockFollowUp(tx, job.id, deliveryId)
  const kind = kindOf(row.message_key)
  const block = await followUpProblem(tx, job, kind)
  if (block) throw conflict(block.toUpperCase())
  if (kind === 'review' && !(await reviewTemplateReady(tx))) throw conflict('TEMPLATE_NOT_CONFIGURED')
  await tx
    .updateTable('platform.message_deliveries')
    .set({ error_code: null, updated_at: sql<Date>`now()` })
    .where('id', '=', row.id)
    .execute()
  const { runAt } = await releaseDraft(tx, {
    config: await loadConfig(tx),
    deliveryId: row.id,
    actor: { kind: 'staff', id: actor.userId, roles: [...actor.roles] },
    automation: RELEASE_JOB,
    requestId: requestIdOf(`follow-up-release:${row.id}`),
  })
  await syncFollowUps(tx, job.id)
  return { deliveryId: row.id, messageKey: row.message_key, runAt }
}

/** Staff decide not to send a prepared follow-up: kept as cancelled (dismissed), never sent. */
export async function cancelFollowUp(
  tx: Tx,
  actor: StaffActor,
  jobId: string,
  deliveryId: string,
): Promise<{ deliveryId: string; messageKey: string }> {
  const job = await jobRow(tx, jobId, true)
  if (!job) throw new ApiError('NOT_FOUND')
  const row = await lockFollowUp(tx, job.id, deliveryId)
  await tx
    .updateTable('platform.message_deliveries')
    .set({
      state: 'cancelled',
      error_code: 'dismissed',
      cancelled_by: actor.userId,
      cancelled_at: sql<Date>`now()`,
      updated_at: sql<Date>`now()`,
    })
    .where('id', '=', row.id)
    .where('state', '=', 'draft')
    .execute()
  await syncFollowUps(tx, job.id)
  return { deliveryId: row.id, messageKey: row.message_key }
}

export type ResponseInput = { answer: SatisfactionAnswer; note?: string | null; deliveryId?: string | null }

/**
 * Staff record the customer's answer to the follow-up (message.release_draft), from their reply or a call: positive,
 * mixed or negative (PROPOSED), with an optional note. It changes nothing about review requests (OWN-DEC-113).
 */
export async function recordSatisfactionResponse(
  tx: Tx,
  actor: StaffActor,
  jobId: string,
  input: ResponseInput,
): Promise<{ id: string; answer: SatisfactionAnswer }> {
  if (!(SATISFACTION_ANSWERS as readonly string[]).includes(input.answer)) throw invalid('body.answer', 'INVALID')
  const job = await jobRow(tx, jobId, true)
  if (!job) throw new ApiError('NOT_FOUND')
  if (!['operationally_complete', 'closed', 'reopened'].includes(job.operational_state))
    throw conflict('JOB_NOT_COMPLETE')
  const v = (input.note ?? '').trim()
  if (v.length > FOLLOW_UP_LIMITS.note) throw invalid('body.note', 'TOO_LONG')
  let deliveryId: string | null = null
  if (input.deliveryId) {
    const d = (await followUpDeliveries(tx, job.id)).find(
      (x) => x.id === input.deliveryId && x.message_key === SATISFACTION_MESSAGE_KEY,
    )
    if (!d) throw invalid('body.deliveryId', 'NOT_FOUND')
    deliveryId = d.id
  }
  const row = await tx
    .insertInto('quality.satisfaction_responses')
    .values({
      job_id: job.id,
      project_id: job.project_id,
      delivery_id: deliveryId,
      answer: input.answer,
      note: v === '' ? null : v,
      recorded_by: actor.userId,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  return { id: row.id, answer: input.answer }
}

// ------------------------------------------------------------------------------------------------ the staff view

export type FollowUpView = {
  id: string
  kind: 'satisfaction' | 'review'
  state: string
  /** Why it waits, stopped, was suppressed or failed (held_case_active, a stop reason, a delivery error code). */
  reason: string | null
  scheduledAt: string | null
  sentAt: string | null
  cancelledAt: string | null
  createdAt: string
}

export type ResponseView = {
  id: string
  answer: SatisfactionAnswer
  note: string | null
  recordedBy: { id: string; name: string | null }
  recordedAt: string
}

export type FollowUpsView = {
  cadence: { state: 'CONFIGURED'; daysAfterCompletion: number } | { state: 'NOT_CONFIGURED' }
  /** When the satisfaction check is (or was) prepared: the review's pass plus the cadence. */
  satisfactionDueAt: string | null
  items: FollowUpView[]
  /** Why the satisfaction check or a review request may not go now (null: it may). */
  satisfactionBlockedBy: FollowUpBlock | null
  reviewBlockedBy: FollowUpBlock | 'review_request_waiting' | 'review_request_sent' | null
  reviewWording: 'CONFIGURED' | 'NOT_CONFIGURED'
  responses: ResponseView[]
}

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null)

export async function followUpsView(db: Reader, job: JobRow): Promise<FollowUpsView> {
  const config = await loadConfig(db)
  const cadence = followUpCadence(config)
  const passed = await passedAt(db, job.id)
  const items = await followUpDeliveries(db, job.id)
  const reviews = items.filter((d) => d.message_key === REVIEW_REQUEST_MESSAGE_KEY)
  const responses = await db
    .selectFrom('quality.satisfaction_responses as r')
    .innerJoin('identity.staff_users as s', 's.id', 'r.recorded_by')
    .select(['r.id', 'r.answer', 'r.note', 'r.recorded_by', 'r.recorded_at', 's.display_name'])
    .where('r.job_id', '=', job.id)
    .orderBy('r.recorded_at')
    .orderBy('r.id')
    .execute()
  const reviewBlock = reviews.some((d) => d.state === 'draft' || (d.state === 'queued' && !d.sent_at))
    ? 'review_request_waiting'
    : reviews.some((d) => d.state === 'sent' || d.state === 'delivered' || d.sent_at !== null)
      ? 'review_request_sent'
      : await followUpProblem(db, job, 'review')
  return {
    cadence:
      cadence.state === 'CONFIGURED'
        ? { state: 'CONFIGURED', daysAfterCompletion: cadence.days }
        : { state: 'NOT_CONFIGURED' },
    satisfactionDueAt:
      passed && cadence.state === 'CONFIGURED' ? followUpDueAt(passed, cadence.days).toISOString() : null,
    items: items.map((d) => ({
      id: d.id,
      kind: kindOf(d.message_key),
      state: d.state,
      reason: d.error_code,
      scheduledAt: d.state === 'queued' && !d.sent_at ? iso(d.scheduled_at) : null,
      sentAt: iso(d.sent_at),
      cancelledAt: iso(d.cancelled_at),
      createdAt: new Date(d.created_at).toISOString(),
    })),
    satisfactionBlockedBy: await followUpProblem(db, job, 'satisfaction'),
    reviewBlockedBy: reviewBlock,
    reviewWording: (await reviewTemplateReady(db)) ? 'CONFIGURED' : 'NOT_CONFIGURED',
    responses: responses.map((r) => ({
      id: r.id,
      answer: r.answer as SatisfactionAnswer,
      note: r.note,
      recordedBy: { id: r.recorded_by, name: r.display_name },
      recordedAt: new Date(r.recorded_at).toISOString(),
    })),
  }
}
