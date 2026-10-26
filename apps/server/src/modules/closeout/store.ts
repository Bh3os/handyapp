// A job's closeout and the Owner's reopen (TSK-0092; HH-QA-09, HH-STATE-02, HH-DATA-05, T56, T64, OWN-DEC-77,
// OWN-DEC-64, OWN-DEC-124, ENT-Job, ENT-AuditEvent, RULE-SERVER-AUTHZ). Every write runs in the route's transaction
// under the job's row lock; migration 0101 refuses anything else whatever path writes.
// - Operational completion and the money stay separate (HH-DATA-05): the Owner's quality review passing makes the job
//   operationally complete (TSK-0084); closing is the Owner's separate step once nothing is left open. "Paid" never
//   closes a job and closing never changes an invoice, a payment or a reminder.
// - Close (job.close: the Owner): refused with every obligation still open named (closeoutObligations, in the domain):
//   the review and its punch items, work packages, visits, change orders waiting for the customer, holds, the final
//   invoice and its balance (paid, or explicitly tracked by a payment plan, a collection hold or the Owner's overdue
//   decision, PROPOSED), other open invoices, pending checks, payment disputes, refunds, credits or write-offs under
//   review, money not yet applied, and open cases. The close records the financial basis it was made on.
// - Reopen (job.reopen: the Owner only, a fresh sign-in and a written reason, OWN-DEC-77): another role, including
//   another administrator, is refused. The original records are kept as they are (the review, punch items, invoices
//   and payments); the reopen is its own audited record, and the follow-up of the job is suppressed for good
//   (OWN-DEC-157 item 6). Return work for a customer issue is a linked return visit or job (TSK-0094), never a reopen.
// - The Owner Decisions item job_closeout stays open while the job is operationally complete or reopened, and resolves
//   when it closes; the screen lists what is still open.
import type { Db, Tx } from '@handyhub/db'
import {
  CLOSEOUT_STATES,
  closeoutObligations,
  JOB_CLOSEOUT_MACHINE,
  transition,
  type CloseoutFacts,
  type CloseoutState,
  type FinancialBasis,
  type Problem,
} from '@handyhub/domain'
import { decide, type Action, type StaffActor } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError, type FieldError } from '../../api/errors.js'
import { jobDisputeOpen, requireOwnerFreshSession } from '../finance/exceptions.js'
import { activeArrangements, collectionSteps } from '../finance/invoice-reminders.js'
import { invoiceMoney } from '../finance/ledger.js'
import { openQueueItem, resolveQueueItem } from '../queue/items.js'

type Reader = Db | Tx

export const CLOSEOUT_QUEUE_TYPE = 'job_closeout'
/** The open visit states: planned or under way (a completed, cancelled, expired or no-access visit is done). */
const OPEN_VISIT_STATES = ['tentative', 'confirmed', 'en_route', 'arrived'] as const
/** PROPOSED limits: a reopen reason or a close note of up to 2,000 characters. */
export const CLOSEOUT_LIMITS = { reason: 2000 } as const

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const field = (f: string, code: string): FieldError => ({ field: f, code, message: '' })
const conflict = (code: string, f = 'job') => new ApiError('CONFLICT', { fieldErrors: [field(f, code)] })
const invalid = (f: string, code: string) => new ApiError('VALIDATION_FAILED', { fieldErrors: [field(f, code)] })

export const allows = (actor: StaffActor, action: Action, projectId: string) =>
  decide(actor, action, { projectId }, { now: new Date(), online: true }).effect === 'allow'

export type JobRow = { id: string; project_id: string; operational_state: string; version: number }

export async function jobRow(db: Reader, jobId: string, lock = false): Promise<JobRow | undefined> {
  if (!UUID_RE.test(jobId)) return undefined
  let q = db
    .selectFrom('work.jobs')
    .select(['id', 'project_id', 'operational_state', 'version'])
    .where('id', '=', jobId)
  if (lock) q = q.forUpdate()
  return (await q.executeTakeFirst()) as JobRow | undefined
}

const count = async (q: { executeTakeFirst: () => Promise<{ n: string } | undefined> }) =>
  Number((await q.executeTakeFirst())?.n ?? 0)
const n = sql<string>`count(*)::text`.as('n')

/** The current final invoice: the latest one not voided (a voided one may have its reissue). */
async function finalInvoice(db: Reader, jobId: string) {
  return db
    .selectFrom('finance.invoices')
    .select(['id', 'state', 'number'])
    .where('job_id', '=', jobId)
    .where('kind', '=', 'final')
    .where('state', '<>', 'voided')
    .orderBy('created_at', 'desc')
    .limit(1)
    .executeTakeFirst()
}

/**
 * How the final invoice's money stands: paid (nothing left to collect), or the balance explicitly tracked by an active
 * payment plan or collection hold, or the Owner's overdue decision (PROPOSED); null while the balance is open and not
 * tracked, or while there is no issued final invoice.
 */
export async function financialBasisOf(db: Reader, jobId: string): Promise<FinancialBasis | null> {
  const i = await finalInvoice(db, jobId)
  if (!i || i.state === 'draft') return null
  if (i.state === 'paid' || (await invoiceMoney(db, i.id)).remainingCents <= 0) return 'paid'
  const steps = await collectionSteps(db, i.id)
  const { plan, hold } = activeArrangements(steps)
  if (plan) return 'payment_plan'
  if (hold) return 'collection_hold'
  if (steps.some((s) => s.kind === 'overdue_decided')) return 'overdue_decided'
  return null
}

/** Every fact closing needs, read from the records (see the header). */
export async function closeoutFacts(db: Reader, job: Pick<JobRow, 'id' | 'project_id'>): Promise<CloseoutFacts> {
  const review = await db.selectFrom('quality.reviews').select('state').where('job_id', '=', job.id).executeTakeFirst()
  const invoice = await finalInvoice(db, job.id)
  const unallocated = await db
    .selectFrom('ops.queue_items')
    .select('id')
    .where('type', '=', 'unallocated_credit')
    .where('subject_id', '=', job.id)
    .where('resolved_at', 'is', null)
    .executeTakeFirst()
  return {
    reviewPassed: review?.state === 'passed',
    punchItemsNotRechecked: await count(
      db.selectFrom('quality.punch_items').select(n).where('job_id', '=', job.id).where('state', '<>', 'rechecked'),
    ),
    workPackagesOpen: await count(
      db.selectFrom('work.work_packages').select(n).where('job_id', '=', job.id).where('state', '<>', 'complete'),
    ),
    visitsOpen: await count(
      db
        .selectFrom('work.visits')
        .select(n)
        .where('job_id', '=', job.id)
        .where('state', 'in', [...OPEN_VISIT_STATES]),
    ),
    changeOrdersPending: await count(
      db.selectFrom('work.change_order_versions').select(n).where('job_id', '=', job.id).where('state', '=', 'issued'),
    ),
    holdsOpen: await count(
      db
        .selectFrom('work.holds')
        .select(n)
        .where('project_id', '=', job.project_id)
        .where('state', 'in', ['open', 'under_review']),
    ),
    finalInvoiceIssued: invoice !== undefined && invoice.state !== 'draft',
    financialBasis: await financialBasisOf(db, job.id),
    otherInvoicesOpen: await count(
      db
        .selectFrom('finance.invoices')
        .select(n)
        .where('job_id', '=', job.id)
        .where('kind', '<>', 'final')
        .where('state', 'in', ['issued', 'partially_paid']),
    ),
    pendingChecks: await count(
      db
        .selectFrom('finance.payments')
        .select(n)
        .where('job_id', '=', job.id)
        .where('method', '=', 'check')
        .where('state', 'in', ['received', 'deposited']),
    ),
    paymentDisputeOpen: await jobDisputeOpen(db, job.id),
    // A refund requested, approved, in progress or needing review; a credit or write-off requested.
    adjustmentsUnderReview: await count(
      db
        .selectFrom('finance.refunds')
        .select(n)
        .where('job_id', '=', job.id)
        .where((eb) =>
          eb.or([
            eb('state', '=', 'requested'),
            eb.and([eb('type', '=', 'refund'), eb('state', 'in', ['approved', 'processing', 'needs_review'])]),
          ]),
        ),
    ),
    unallocatedMoney: unallocated !== undefined,
    openCases: await count(
      db.selectFrom('quality.cases').select(n).where('project_id', '=', job.project_id).where('state', '<>', 'closed'),
    ),
  }
}

const isCloseoutState = (s: string): s is CloseoutState => (CLOSEOUT_STATES as readonly string[]).includes(s)

/** The obligations still open for a job in the closeout dimension (empty for a closed job or one not yet complete). */
export async function openObligations(db: Reader, job: JobRow): Promise<Problem[]> {
  if (job.operational_state !== 'operationally_complete' && job.operational_state !== 'reopened') return []
  return closeoutObligations(await closeoutFacts(db, job))
}

function refusal(t: { code: string; problems?: readonly Problem[] }): ApiError {
  if (t.code === 'GUARD_FAILED' && t.problems?.length)
    return new ApiError('CONFLICT', { fieldErrors: t.problems.map((p) => field('job', p.code)) })
  if (t.code === 'STALE_VERSION') return new ApiError('STALE_VERSION')
  return conflict(t.code === 'INVALID_TRANSITION' ? 'INVALID_STATE' : t.code)
}

function text(value: string | null | undefined, f: string, required: boolean): string | null {
  const v = (value ?? '').trim()
  if (v === '') {
    if (required) throw invalid(f, 'required')
    return null
  }
  if (v.length > CLOSEOUT_LIMITS.reason) throw invalid(f, 'TOO_LONG')
  return v
}

async function lockedJob(tx: Tx, jobId: string): Promise<JobRow & { state: CloseoutState }> {
  const job = await jobRow(tx, jobId, true)
  if (!job) throw new ApiError('NOT_FOUND')
  if (!isCloseoutState(job.operational_state)) throw conflict('JOB_NOT_COMPLETE')
  return { ...job, state: job.operational_state }
}

/** The Owner closes the job (job.close): every obligation met, or a refusal naming each one still open. */
export async function closeJob(
  tx: Tx,
  actor: StaffActor,
  jobId: string,
  expectedVersion: number,
  input: { note?: string | null },
): Promise<{ jobId: string; version: number; financialBasis: FinancialBasis; eventId: string; from: CloseoutState }> {
  const job = await lockedJob(tx, jobId)
  const note = text(input.note, 'body.note', false)
  const facts = await closeoutFacts(tx, job)
  const t = transition(JOB_CLOSEOUT_MACHINE, job, 'close', { actor: 'staff', expectedVersion, now: new Date(), facts })
  if (!t.ok) throw refusal(t)
  const basis = facts.financialBasis as FinancialBasis
  const event = await tx
    .insertInto('work.job_closeout_events')
    .values({
      job_id: job.id,
      project_id: job.project_id,
      event: 'closed',
      from_state: job.state,
      financial_basis: basis,
      reason: note,
      recorded_by: actor.userId,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  await tx
    .updateTable('work.jobs')
    .set({ operational_state: 'closed', version: t.version })
    .where('id', '=', job.id)
    .execute()
  await syncCloseoutItem(tx, job.id)
  return { jobId: job.id, version: t.version, financialBasis: basis, eventId: event.id, from: job.state }
}

/**
 * The Owner reopens a closed job (job.reopen): the Owner designation and the fresh sign-in are read again at the
 * write, with the written reason. The follow-up of the job is suppressed (the caller's transaction, followUpsOnReopen).
 */
export async function reopenJob(
  tx: Tx,
  actor: StaffActor,
  jobId: string,
  expectedVersion: number,
  input: { reason: string; sessionId: string },
): Promise<{ jobId: string; version: number; eventId: string }> {
  await requireOwnerFreshSession(tx, actor, input.sessionId)
  const job = await lockedJob(tx, jobId)
  const reason = text(input.reason, 'body.reason', true) as string
  const t = transition(JOB_CLOSEOUT_MACHINE, job, 'reopen', {
    actor: 'staff',
    expectedVersion,
    now: new Date(),
    facts: { reason },
  })
  if (!t.ok) throw refusal(t)
  const event = await tx
    .insertInto('work.job_closeout_events')
    .values({
      job_id: job.id,
      project_id: job.project_id,
      event: 'reopened',
      from_state: 'closed',
      reason,
      recorded_by: actor.userId,
      staff_session_id: input.sessionId,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  await tx
    .updateTable('work.jobs')
    .set({ operational_state: 'reopened', version: t.version })
    .where('id', '=', job.id)
    .execute()
  await syncCloseoutItem(tx, job.id)
  return { jobId: job.id, version: t.version, eventId: event.id }
}

/** The Owner Decisions item of a job's closeout, as the job stands now (see the header). */
export async function syncCloseoutItem(tx: Tx, jobId: string): Promise<void> {
  const j = await tx
    .selectFrom('work.jobs as j')
    .innerJoin('crm.projects as p', 'p.id', 'j.project_id')
    .select(['j.id', 'j.project_id', 'j.operational_state', 'p.reference'])
    .where('j.id', '=', jobId)
    .executeTakeFirst()
  if (!j) return
  if (j.operational_state === 'operationally_complete' || j.operational_state === 'reopened')
    await openQueueItem(tx, {
      type: CLOSEOUT_QUEUE_TYPE,
      subjectId: j.id,
      reason: j.operational_state === 'reopened' ? 'job_reopened' : 'closeout_pending',
      projectId: j.project_id,
      reference: j.reference,
      status: j.operational_state,
    })
  else
    await resolveQueueItem(tx, {
      type: CLOSEOUT_QUEUE_TYPE,
      subjectId: j.id,
      resolution: j.operational_state === 'closed' ? 'closed' : j.operational_state,
    })
}

export type CloseoutEventView = {
  id: string
  event: 'closed' | 'reopened'
  fromState: string
  financialBasis: FinancialBasis | null
  reason: string | null
  recordedBy: { id: string; name: string | null }
  recordedAt: string
}

export async function closeoutEvents(db: Reader, jobId: string): Promise<CloseoutEventView[]> {
  const rows = await db
    .selectFrom('work.job_closeout_events as e')
    .innerJoin('identity.staff_users as s', 's.id', 'e.recorded_by')
    .select(['e.id', 'e.event', 'e.from_state', 'e.financial_basis', 'e.reason', 'e.recorded_by', 's.display_name'])
    .select('e.recorded_at')
    .where('e.job_id', '=', jobId)
    .orderBy('e.recorded_at')
    .orderBy('e.id')
    .execute()
  return rows.map((r) => ({
    id: r.id,
    event: r.event as 'closed' | 'reopened',
    fromState: r.from_state,
    financialBasis: (r.financial_basis as FinancialBasis | null) ?? null,
    reason: r.reason,
    recordedBy: { id: r.recorded_by, name: r.display_name },
    recordedAt: new Date(r.recorded_at).toISOString(),
  }))
}

/** Whether the job was ever reopened (OWN-DEC-157 item 6: its follow-up is suppressed for good, PROPOSED). */
export async function everReopened(db: Reader, jobId: string): Promise<boolean> {
  const r = await db
    .selectFrom('work.job_closeout_events')
    .select('id')
    .where('job_id', '=', jobId)
    .where('event', '=', 'reopened')
    .limit(1)
    .executeTakeFirst()
  return r !== undefined
}

/** The facts the policy needs about a job: its project; null when there is no such job. */
export async function jobProjectFacts(db: Reader, jobId: string): Promise<{ projectId: string } | null> {
  const j = await jobRow(db, jobId)
  return j ? { projectId: j.project_id } : null
}
