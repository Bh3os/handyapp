// Payment exceptions (TSK-0089 part 1; HH-FIN-13, HH-FIN-14, HH-FIN-03, T63, ENT-Payment, ENT-PaymentAllocation,
// OWN-DEC-138, RULE-SERVER-AUTHZ). Migration 0094 keeps the records true whatever path writes.
// - A recorded payment is never edited or deleted. What happens to it afterwards is an adjustment appended with a
//   reason and optional evidence (the bank notice, the Square dispute ID):
//   - a check returned by the bank (received, deposited or already cleared): check.mark_returned, the Owner or Office;
//   - a card or digital payment that failed, a dispute opened, won or lost, and a payment voided because it was
//     recorded wrongly: payment.correct, the Owner only, with a fresh sign-in (read again here) and a reason.
// - Returned, failed and a dispute lost return the payment; a void voids it. Each of its allocations then gets a
//   reversing allocation in the same transaction: the balance reopens, a deposit it satisfied reverts to required (a
//   deposit already credited to the final invoice reopens that invoice instead), its receipt shows voided, and the
//   job's queue items follow (deposit due, checks to clear, unallocated money).
// - A dispute opened leaves the money counted until its outcome (PROPOSED, OQ-PAYMENT-EXCEPTION-DETAILS): the payment
//   is then frozen (no reconcile, void or failure) and the Owner's payment_dispute item stays open for the job; routine
//   payment reminders (TSK-0091) read jobDisputeOpen and pause.
// - A correction voids the wrong payment and records the right one in the same transaction, naming the payment it
//   corrects, toward where that money now belongs: the deposit while it is still due, else the final invoice.
import type { Db, Tx } from '@handyhub/db'
import { decide, type Resource, type StaffActor } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError, type FieldError } from '../../api/errors.js'
import { FRESH_AUTH_MINUTES } from '../identity/sessions.js'
import { openQueueItem, resolveQueueItem } from '../queue/items.js'
import { syncDepositItem } from './deposit-queue.js'
import { recordDepositPayment, type PaymentMethod, type PaymentState, type RecordPaymentInput } from './deposits.js'
import { recordInvoicePayment } from './ledger.js'
import { syncJobInvoiceReminders } from './invoice-reminders.js'
import { syncUnallocatedItem } from './money-events.js'
import { syncCheckItem } from './payment-states.js'

type Reader = Db | Tx

export const ADJUSTMENT_KINDS = [
  'returned',
  'failed',
  'dispute_opened',
  'dispute_won',
  'dispute_lost',
  'voided',
] as const
export type AdjustmentKind = (typeof ADJUSTMENT_KINDS)[number]

/** PROPOSED limits: a written reason up to 2000 characters (as the waiver's), the evidence up to 500. */
export const ADJUSTMENT_LIMITS = { reason: 2000, evidence: 500 } as const

export const DISPUTE_QUEUE_TYPE = 'payment_dispute'

const CONFIRMED: readonly string[] = ['recorded', 'reconciled']
const CHECK_HELD: readonly string[] = ['received', 'deposited', 'cleared']

const field = (f: string, code: string): FieldError => ({ field: f, code, message: '' })
const conflict = (code: string) => new ApiError('CONFLICT', { fieldErrors: [field('payment', code)] })
const invalid = (f: string, code: string) => new ApiError('VALIDATION_FAILED', { fieldErrors: [field(f, code)] })

async function dbNow(tx: Reader): Promise<Date> {
  const r = await sql<{ now: Date }>`SELECT now() AS now`.execute(tx)
  return new Date((r.rows[0] as { now: Date }).now)
}

/**
 * The Owner designation and the fresh sign-in, read again at the write (another administrator never qualifies):
 * the caller's own live session, signed in within FRESH_AUTH_MINUTES by the database clock.
 */
export async function requireOwnerFreshSession(tx: Tx, actor: StaffActor, sessionId: string): Promise<void> {
  const now = await dbNow(tx)
  const owner = await tx
    .selectFrom('identity.role_grants')
    .select('id')
    .where('staff_user_id', '=', actor.userId)
    .where('kind', '=', 'role')
    .where('name', '=', 'owner')
    .where('ended_at', 'is', null)
    .where('effective_from', '<=', now)
    .executeTakeFirst()
  if (!owner) throw new ApiError('FORBIDDEN')
  const session = await tx
    .selectFrom('identity.staff_sessions')
    .select(['authenticated_at', 'revoked_at', 'staff_user_id'])
    .where('id', '=', sessionId)
    .forShare()
    .executeTakeFirst()
  if (
    !session ||
    session.staff_user_id !== actor.userId ||
    session.revoked_at !== null ||
    now.getTime() - session.authenticated_at.getTime() > FRESH_AUTH_MINUTES * 60_000
  )
    throw new ApiError('FRESH_AUTH_REQUIRED')
}

function text(value: string | null | undefined, f: string, max: number, required: boolean): string | null {
  const v = (value ?? '').trim()
  if (v === '') {
    if (required) throw invalid(f, 'required')
    return null
  }
  if (v.length > max) throw invalid(f, 'TOO_LONG')
  return v
}

/** Whether any payment of the job has a dispute opened and not yet won or lost. */
export async function jobDisputeOpen(db: Reader, jobId: string): Promise<boolean> {
  const r = await sql<{ open: boolean }>`
    SELECT EXISTS (SELECT 1 FROM finance.payments p
                    WHERE p.job_id = ${jobId} AND finance.payment_dispute_open(p.id)) AS open`.execute(db)
  return r.rows[0]?.open === true
}

/** Opens or resolves the job's payment_dispute item in Owner Decisions as its disputes stand now. */
export async function syncDisputeItem(tx: Tx, jobId: string): Promise<'open' | 'resolved'> {
  if (!(await jobDisputeOpen(tx, jobId))) {
    await resolveQueueItem(tx, { type: DISPUTE_QUEUE_TYPE, subjectId: jobId, resolution: 'decided' })
    return 'resolved'
  }
  const job = await tx
    .selectFrom('work.jobs as j')
    .innerJoin('crm.projects as p', 'p.id', 'j.project_id')
    .select(['j.project_id', 'p.reference'])
    .where('j.id', '=', jobId)
    .executeTakeFirstOrThrow()
  await openQueueItem(tx, {
    type: DISPUTE_QUEUE_TYPE,
    subjectId: jobId,
    reason: 'payment_disputed',
    projectId: job.project_id,
    reference: job.reference,
  })
  return 'open'
}

/** Why this kind is not available for the payment as it stands; null when it is (the database checks it again). */
function unavailable(kind: AdjustmentKind, p: { method: string; state: string }, disputed: boolean): string | null {
  if (p.state === 'returned' || p.state === 'voided') return `PAYMENT_${p.state.toUpperCase()}`
  switch (kind) {
    case 'returned':
      if (p.method !== 'check') return 'NOT_A_CHECK'
      return CHECK_HELD.includes(p.state) ? null : `CHECK_${p.state.toUpperCase()}`
    case 'failed':
    case 'dispute_opened':
      if (p.method === 'check') return 'CHECK_RETURNS_INSTEAD'
      if (disputed) return 'DISPUTE_OPEN'
      return CONFIRMED.includes(p.state) ? null : `PAYMENT_${p.state.toUpperCase()}`
    case 'dispute_won':
    case 'dispute_lost':
      return disputed ? null : 'NO_OPEN_DISPUTE'
    case 'voided':
      return disputed ? 'DISPUTE_OPEN' : null
  }
}

export type AdjustmentInput = {
  kind: AdjustmentKind
  reason: string
  evidence?: string | null
  /** The Owner's session, for every kind but a returned check. */
  sessionId?: string | null
}

export type AdjustedPayment = {
  adjustmentId: string
  paymentId: string
  jobId: string
  kind: AdjustmentKind
  from: PaymentState
  state: PaymentState
  /** The money the payment's allocations gave and no longer give (0 for a dispute opened or won). */
  reversedCents: number
  version: number
}

/** Records what happened to a recorded payment (see the header); runs in the business transaction. */
export async function adjustPayment(
  tx: Tx,
  actor: StaffActor,
  paymentId: string,
  input: AdjustmentInput,
): Promise<AdjustedPayment> {
  if (!tx.isTransaction) throw new Error('adjustPayment runs inside the business transaction (withTx)')
  if (!(ADJUSTMENT_KINDS as readonly string[]).includes(input.kind)) throw invalid('body.kind', 'INVALID')
  const reason = text(input.reason, 'body.reason', ADJUSTMENT_LIMITS.reason, true) as string
  const evidence = text(input.evidence, 'body.evidence', ADJUSTMENT_LIMITS.evidence, false)
  const ownerOnly = input.kind !== 'returned'
  if (ownerOnly) {
    if (!input.sessionId) throw new ApiError('FRESH_AUTH_REQUIRED')
    await requireOwnerFreshSession(tx, actor, input.sessionId)
  }

  // The lock order of every money write: the deposit requirement first, then the invoices, then the payment.
  const targets = await tx
    .selectFrom('finance.payment_allocations')
    .select(['deposit_requirement_id', 'invoice_id'])
    .where('payment_id', '=', paymentId)
    .execute()
  const requirements = [
    ...new Set(targets.flatMap((a) => (a.deposit_requirement_id ? [a.deposit_requirement_id] : []))),
  ]
  if (requirements.length)
    await tx
      .selectFrom('finance.deposit_requirements')
      .select('id')
      .where('id', 'in', requirements)
      .orderBy('id')
      .forUpdate()
      .execute()
  // The invoices it was applied to and those crediting its deposit (a final invoice reopens with the deposit).
  await tx
    .selectFrom('finance.invoices')
    .select('id')
    .where((eb) =>
      eb.or([
        eb(
          'id',
          'in',
          eb.selectFrom('finance.payment_allocations').select('invoice_id').where('payment_id', '=', paymentId),
        ),
        ...(requirements.length ? [eb('deposit_requirement_id', 'in', requirements)] : []),
      ]),
    )
    .orderBy('id')
    .forUpdate()
    .execute()
  const p = await tx
    .selectFrom('finance.payments')
    .select(['id', 'project_id', 'job_id', 'method', 'state', 'version'])
    .where('id', '=', paymentId)
    .forUpdate()
    .executeTakeFirst()
  if (!p) throw new ApiError('NOT_FOUND')
  const disputed = await sql<{ open: boolean }>`SELECT finance.payment_dispute_open(${p.id}) AS open`.execute(tx)
  const problem = unavailable(input.kind, p, disputed.rows[0]?.open === true)
  if (problem) throw conflict(problem)

  const to: PaymentState =
    input.kind === 'voided'
      ? 'voided'
      : input.kind === 'dispute_opened' || input.kind === 'dispute_won'
        ? (p.state as PaymentState)
        : 'returned'
  const adjustment = await tx
    .insertInto('finance.payment_adjustments')
    .values({
      payment_id: p.id,
      project_id: p.project_id,
      job_id: p.job_id,
      kind: input.kind,
      from_state: p.state,
      to_state: to,
      reason,
      evidence,
      recorded_by: actor.userId,
      staff_session_id: ownerOnly ? (input.sessionId as string) : null,
      // The trigger keeps the session's own value (full precision).
      authenticated_at: ownerOnly ? new Date() : null,
    })
    .returning('id')
    .executeTakeFirstOrThrow()

  let version = p.version
  let reversed = 0
  if (to !== p.state) {
    const next = await tx
      .updateTable('finance.payments')
      .set({ state: to, version: p.version + 1 })
      .where('id', '=', p.id)
      .returning('version')
      .executeTakeFirstOrThrow()
    version = next.version
    // HH-FIN-13: a reversing allocation for each allocation of the payment, appended, never an edit.
    const originals = await tx
      .selectFrom('finance.payment_allocations')
      .select(['id', 'deposit_requirement_id', 'invoice_id', 'amount_cents'])
      .where('payment_id', '=', p.id)
      .where('reverses_allocation_id', 'is', null)
      .orderBy('created_at')
      .orderBy('id')
      .execute()
    for (const a of originals) {
      await tx
        .insertInto('finance.payment_allocations')
        .values({
          payment_id: p.id,
          deposit_requirement_id: a.deposit_requirement_id,
          invoice_id: a.invoice_id,
          amount_cents: a.amount_cents,
          allocated_by: actor.userId,
          reverses_allocation_id: a.id,
          adjustment_id: adjustment.id,
        })
        .execute()
      reversed += Number(a.amount_cents)
    }
    await syncDepositItem(tx, p.job_id)
    await syncUnallocatedItem(tx, p.job_id)
    if (p.method === 'check') await syncCheckItem(tx, p.job_id)
  }
  if (input.kind.startsWith('dispute_')) await syncDisputeItem(tx, p.job_id)
  // TSK-0091: an open dispute stops the job's invoice reminders; a reopened balance opens nothing by itself.
  await syncJobInvoiceReminders(tx, p.job_id)
  return {
    adjustmentId: adjustment.id,
    paymentId: p.id,
    jobId: p.job_id,
    kind: input.kind,
    from: p.state as PaymentState,
    state: to,
    reversedCents: reversed,
    version,
  }
}

export type Replacement = {
  method?: PaymentMethod
  amountCents: number
  receivedOn?: string
  reference?: string | null
  payerName?: string | null
  memo?: string | null
}

/**
 * Corrects a payment recorded wrongly: voids it (the Owner, fresh sign-in, reason) and, when a replacement is given,
 * records the right payment in the same transaction, naming the one it corrects. What the replacement leaves out is
 * the voided payment's own (method, date, reference, payer, memo, collector).
 */
export async function correctPayment(
  tx: Tx,
  actor: StaffActor,
  paymentId: string,
  input: { reason: string; evidence?: string | null; sessionId: string; replacement?: Replacement | null },
): Promise<{ voided: AdjustedPayment; replacementId: string | null; replacementState: PaymentState | null }> {
  const original = await tx
    .selectFrom('finance.payments')
    .select(['method', 'received_on', 'reference', 'payer_name', 'memo', 'collector_staff_id'])
    .where('id', '=', paymentId)
    .executeTakeFirst()
  if (!original) throw new ApiError('NOT_FOUND')
  const voided = await adjustPayment(tx, actor, paymentId, {
    kind: 'voided',
    reason: input.reason,
    evidence: input.evidence ?? null,
    sessionId: input.sessionId,
  })
  const r = input.replacement
  if (!r) return { voided, replacementId: null, replacementState: null }
  // A date column: the driver may hand back a Date at local midnight or a string.
  const on = original.received_on as Date | string
  const received =
    typeof on === 'string'
      ? on.slice(0, 10)
      : `${on.getFullYear()}-${String(on.getMonth() + 1).padStart(2, '0')}-${String(on.getDate()).padStart(2, '0')}`
  const payment: RecordPaymentInput = {
    method: r.method ?? (original.method as PaymentMethod),
    amountCents: r.amountCents,
    receivedOn: r.receivedOn ?? received,
    reference: r.reference !== undefined ? r.reference : original.reference,
    payerName: r.payerName !== undefined ? r.payerName : original.payer_name,
    memo: r.memo !== undefined ? r.memo : original.memo,
    collectorStaffId: original.collector_staff_id,
    correctsPaymentId: paymentId,
  }
  // Where the money now belongs: the deposit while it is still due, else the job's issued final invoice.
  const deposit = await tx
    .selectFrom('finance.deposit_requirements')
    .select('state')
    .where('job_id', '=', voided.jobId)
    .executeTakeFirst()
  if (deposit && (deposit.state === 'required' || deposit.state === 'partly_satisfied')) {
    const out = await recordDepositPayment(tx, actor, voided.jobId, payment)
    return { voided, replacementId: out.paymentId, replacementState: out.state }
  }
  const invoice = await tx
    .selectFrom('finance.invoices')
    .select('id')
    .where('job_id', '=', voided.jobId)
    .where('kind', '=', 'final')
    .where('state', 'in', ['issued', 'partially_paid'])
    .executeTakeFirst()
  if (!invoice) throw conflict('NOTHING_TO_APPLY')
  const out = await recordInvoicePayment(tx, actor, invoice.id, payment)
  return { voided, replacementId: out.paymentId, replacementState: out.state }
}

export type AdjustmentView = {
  kind: AdjustmentKind
  from: string
  to: string
  reason: string
  evidence: string | null
  by: { id: string; name: string | null }
  at: string
}

/** The adjustments of these payments, oldest first, keyed by payment. */
export async function adjustmentsOf(db: Reader, paymentIds: readonly string[]): Promise<Map<string, AdjustmentView[]>> {
  const out = new Map<string, AdjustmentView[]>()
  if (paymentIds.length === 0) return out
  const rows = await db
    .selectFrom('finance.payment_adjustments as a')
    .leftJoin('identity.staff_users as s', 's.id', 'a.recorded_by')
    .select([
      'a.payment_id',
      'a.kind',
      'a.from_state',
      'a.to_state',
      'a.reason',
      'a.evidence',
      'a.recorded_by',
      's.display_name',
      'a.created_at',
    ])
    .where('a.payment_id', 'in', [...paymentIds])
    .orderBy('a.created_at')
    .orderBy('a.id')
    .execute()
  for (const a of rows) {
    const list = out.get(a.payment_id) ?? []
    list.push({
      kind: a.kind as AdjustmentKind,
      from: a.from_state,
      to: a.to_state,
      reason: a.reason,
      evidence: a.evidence,
      by: { id: a.recorded_by, name: a.display_name },
      at: a.created_at.toISOString(),
    })
    out.set(a.payment_id, list)
  }
  return out
}

/** Whether each payment's dispute is open now (from its adjustments, oldest first). */
export function disputeOpen(adjustments: readonly AdjustmentView[] | undefined): boolean {
  let open = 0
  for (const a of adjustments ?? []) {
    if (a.kind === 'dispute_opened') open++
    else if (a.kind === 'dispute_won' || a.kind === 'dispute_lost') open--
  }
  return open > 0
}

/**
 * The adjustments this caller may record on the payment now, for the buttons shown (the server decides again at the
 * write): a returned check for check.mark_returned; the rest for the Owner (payment.correct, fresh sign-in asked then).
 */
export function availableAdjustments(
  actor: StaffActor,
  resource: Resource,
  p: { method: string; state: string },
  disputed: boolean,
): AdjustmentKind[] {
  const may = (action: 'check.mark_returned' | 'payment.correct') =>
    decide({ ...actor, freshAuth: true }, action, resource, { now: new Date(), online: true, reason: 'shown' })
      .effect === 'allow'
  return ADJUSTMENT_KINDS.filter(
    (k) => unavailable(k, p, disputed) === null && may(k === 'returned' ? 'check.mark_returned' : 'payment.correct'),
  )
}

const ADJUSTMENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'from', 'to', 'reason', 'evidence', 'by', 'at'],
  properties: {
    kind: { type: 'string', enum: [...ADJUSTMENT_KINDS] },
    from: { type: 'string' },
    to: { type: 'string' },
    reason: { type: 'string' },
    evidence: { type: ['string', 'null'] },
    by: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'name'],
      properties: { id: { type: 'string' }, name: { type: ['string', 'null'] } },
    },
    at: { type: 'string', format: 'date-time' },
  },
} as const

/** The payment fields TSK-0089 adds to the staff deposit and invoice views (response schemas). */
export const PAYMENT_EXCEPTION_FIELDS = ['adjustments', 'disputeOpen', 'adjustable', 'correctsPaymentId'] as const
export const PAYMENT_EXCEPTION_PROPERTIES = {
  adjustments: { type: 'array', items: ADJUSTMENT_SCHEMA },
  disputeOpen: { type: 'boolean' },
  adjustable: { type: 'array', items: { type: 'string', enum: [...ADJUSTMENT_KINDS] } },
  correctsPaymentId: { type: ['string', 'null'] },
} as const
