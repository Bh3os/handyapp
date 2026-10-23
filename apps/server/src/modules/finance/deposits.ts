// The deposit requirement, its deposit request, staff-recorded deposit payments and the owner-only waiver (TSK-0059;
// HH-FIN-02, HH-FIN-03, HH-FIN-07, HH-FIN-09, HH-FIN-12, T36, T59, T64, ENT-DepositRequirement, ENT-Payment,
// ENT-PaymentAllocation, FACT-DEPOSIT-RULE, FACT-PAYMENT-METHODS, INT-Square, OWN-DEC-67, OWN-DEC-76, OWN-DEC-104,
// OWN-DEC-111, OWN-DEC-138, RULE-MONEY-CENTS, RULE-SERVER-AUTHZ, RULE-NO-INVENTED-FACTS).
// - The requirement is written with the job, in the approval's transaction (migration 0048), from the deposit the
//   approval computed from the pinned rule (policy data, never a literal here). Its state follows the money and the
//   waiver; the database refuses any other state.
// - The deposit request: staff with invoice.enter_payment_link (the Owner, Office) paste the deposit-specific Square
//   payment link they created in the Square app: https on a configured Square host (payment.square_link_hosts,
//   PROPOSED list). The customer opens it from Pay by Card; nothing comes back from Square: a redirect or a claim
//   never marks anything paid (HH-FIN-09).
// - Recording a deposit payment (payment.record: the Owner, Office; a Worker only for their own on-site collection
//   with the collect capability on an assigned job): method (one of payment.methods), amount in cents, the date
//   received (not after today in the business time zone), the collector, the transaction reference (required for
//   Square card payments and checks; PROPOSED optional for cash, Zelle, Cash App and Chime) and, for a check, the
//   payer. The same method and reference are refused twice. Under the requirement's row lock, the payment is applied
//   to what the deposit still needs (never beyond it, never twice); any remainder stays unallocated for the Owner's
//   decision (HH-FIN-07; the full ledger is TSK-0086). Cash and digital payments are verified when recorded; a check
//   is received and pending: it satisfies nothing until the Owner, who did not collect it, marks it cleared.
// - The waiver (deposit.waive): the Owner only, with a fresh sign-in and a written reason, job-specific; read again
//   inside the transaction (the session's last password entry by the database clock, the live Owner grant). It never
//   marks the deposit paid and never touches an amount; it is append-only and audited.
// - Each payment, check clearing and waiver keeps the job's deposit_due queue item in line in its own transaction.
// Refunds, returned checks, invoice credit and reconciliation are not here (TSK-0085..TSK-0089).
import type { Db, Tx } from '@handyhub/db'
import { localDate } from '@handyhub/domain/request-form'
import { decide, type Action, type Resource, type StaffActor } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError, type FieldError } from '../../api/errors.js'
import { loadConfig } from '../../platform/config/index.js'
import { FRESH_AUTH_MINUTES } from '../identity/sessions.js'
import { syncDepositItem } from './deposit-queue.js'
import { announcePaidInvoices, syncUnallocatedItem } from './money-events.js'
import {
  adjustmentsOf,
  availableAdjustments,
  disputeOpen,
  type AdjustmentKind,
  type AdjustmentView,
} from './exceptions.js'
import { syncCheckItem } from './payment-states.js'
import { issuePaymentReceipt } from './receipts.js'

type Reader = Db | Tx

export const DEPOSIT_STATES = [
  'not_required',
  'required',
  'partly_satisfied',
  'satisfied',
  'applied',
  'waived',
] as const
export type DepositState = (typeof DEPOSIT_STATES)[number]

export const PAYMENT_METHODS = [
  'square_payment_link',
  'square_tap_to_pay',
  'cash',
  'check',
  'zelle',
  'cash_app',
  'chime',
] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export const PAYMENT_STATES = [
  'recorded',
  'reconciled',
  'received',
  'deposited',
  'cleared',
  'returned',
  'voided',
] as const
export type PaymentState = (typeof PAYMENT_STATES)[number]

/** HH-FIN-09 and HH-FIN-12: the Square payment ID for a card payment, the check number for a check. */
const REFERENCE_REQUIRED: ReadonlySet<PaymentMethod> = new Set(['square_payment_link', 'square_tap_to_pay', 'check'])
/** Verified money: recorded after verification (cash, card, digital), reconciled, or a check once cleared. */
const VERIFIED: ReadonlySet<string> = new Set(['recorded', 'reconciled', 'cleared'])
/** A check received or deposited: pending until cleared. */
const PENDING: ReadonlySet<string> = new Set(['received', 'deposited'])
/** A deposit still to be paid or waived. */
const OPEN_STATES: ReadonlySet<string> = new Set(['required', 'partly_satisfied'])

/** PROPOSED limits (no owner value): a written reason up to 2000 characters, a reference up to 120, a payer 200. */
export const DEPOSIT_LIMITS = { reason: 2000, reference: 120, payerName: 200, paymentLink: 500, memo: 500 } as const

const field = (f: string, code: string): FieldError => ({ field: f, code, message: '' })
const conflict = (code: string, f = 'deposit') => new ApiError('CONFLICT', { fieldErrors: [field(f, code)] })
const invalid = (f: string, code: string) => new ApiError('VALIDATION_FAILED', { fieldErrors: [field(f, code)] })

type RequirementRow = {
  id: string
  job_id: string
  project_id: string
  approval_id: string
  rule_version: number
  base_total_cents: string
  required: boolean
  amount_cents: string | null
  state: string
  payment_link: string | null
  payment_link_set_by: string | null
  payment_link_set_at: Date | null
  version: number
}

async function requirementOfJob(
  db: Reader,
  jobId: string,
  lock: 'none' | 'update' = 'none',
): Promise<RequirementRow | undefined> {
  const q = db
    .selectFrom('finance.deposit_requirements')
    .select([
      'id',
      'job_id',
      'project_id',
      'approval_id',
      'rule_version',
      'base_total_cents',
      'required',
      'amount_cents',
      'state',
      'payment_link',
      'payment_link_set_by',
      'payment_link_set_at',
      'version',
    ])
    .where('job_id', '=', jobId)
  return (lock === 'update' ? q.forUpdate() : q).executeTakeFirst()
}

/** The project of a job, for the policy's record facts; null when there is no such job. */
export async function projectOfJob(db: Reader, jobId: string): Promise<string | null> {
  const j = await db.selectFrom('work.jobs').select('project_id').where('id', '=', jobId).executeTakeFirst()
  return j?.project_id ?? null
}

/** The facts the policy needs about a payment: its project and collector; null when there is no such payment. */
export async function paymentFacts(db: Reader, paymentId: string): Promise<Resource | null> {
  const p = await db
    .selectFrom('finance.payments')
    .select(['project_id', 'collector_staff_id'])
    .where('id', '=', paymentId)
    .executeTakeFirst()
  return p ? { projectId: p.project_id, collectedByStaffId: p.collector_staff_id } : null
}

async function amounts(db: Reader, requirementId: string) {
  const rows = await db
    .selectFrom('finance.payment_allocations as a')
    .innerJoin('finance.payments as p', 'p.id', 'a.payment_id')
    .select(['a.amount_cents', 'p.state'])
    .where('a.deposit_requirement_id', '=', requirementId)
    .where('a.reverses_allocation_id', 'is', null)
    .execute()
  let verified = 0
  let pending = 0
  for (const r of rows) {
    if (VERIFIED.has(r.state)) verified += Number(r.amount_cents)
    else if (PENDING.has(r.state)) pending += Number(r.amount_cents)
  }
  return { verified, pending }
}

async function staffNames(db: Reader, ids: readonly (string | null)[]): Promise<Map<string, string | null>> {
  const wanted = [...new Set(ids.filter((x): x is string => x !== null))]
  if (wanted.length === 0) return new Map()
  const rows = await db
    .selectFrom('identity.staff_users')
    .select(['id', 'display_name'])
    .where('id', 'in', wanted)
    .execute()
  return new Map(rows.map((r) => [r.id, r.display_name]))
}

const ref = (id: string | null, names: Map<string, string | null>) =>
  id === null ? null : { id, name: names.get(id) ?? null }

const allows = (actor: StaffActor, action: Action, resource: Resource, reason?: string) =>
  decide(actor, action, resource, { now: new Date(), online: true, ...(reason ? { reason } : {}) }).effect === 'allow'

export type StaffRef = { id: string; name: string | null }

export type DepositPaymentView = {
  id: string
  method: PaymentMethod
  amountCents: number
  appliedCents: number
  unappliedCents: number
  receivedOn: string
  reference: string | null
  payerName: string | null
  state: PaymentState
  verified: boolean
  collector: StaffRef
  recordedBy: StaffRef
  recordedAt: string
  clearedBy: StaffRef | null
  clearedAt: string | null
  canMarkCleared: boolean
  /** TSK-0088 (HH-FIN-11, HH-FIN-12): the memo, the receipt, the deposit and reconciliation steps. */
  memo: string | null
  receiptNumber: string | null
  depositedAt: string | null
  reconciledAt: string | null
  canMarkDeposited: boolean
  canReconcile: boolean
  /** TSK-0089 (HH-FIN-13): what happened to it afterwards, an open dispute, and what this caller may record now. */
  adjustments: AdjustmentView[]
  disputeOpen: boolean
  adjustable: AdjustmentKind[]
  correctsPaymentId: string | null
}

export type DepositView = {
  jobId: string
  required: boolean
  state: DepositState
  amountCents: number | null
  baseTotalCents: number
  ruleVersion: number
  /** Verified money applied to the deposit (an uncleared check never counts). */
  verifiedCents: number
  /** Checks applied but not cleared. */
  pendingCents: number
  /** What the deposit still needs from verified money; null when not required. */
  remainingCents: number | null
  /** The work-visit confirmation gate as the money and waiver stand now (the confirmation reads it again). */
  workScheduling: 'open' | 'blocked'
  paymentLink: { url: string; setBy: StaffRef | null; setAt: string } | null
  waiver: { by: StaffRef; at: string; reason: string } | null
  payments: DepositPaymentView[]
  version: number
  actions: { enterPaymentLink: boolean; recordPayment: boolean; waive: boolean }
}

/** The staff view of a job's deposit, with the actions the server would allow this caller now. */
export async function depositView(db: Reader, actor: StaffActor, jobId: string): Promise<DepositView | null> {
  const r = await requirementOfJob(db, jobId)
  if (!r) return null
  const { verified, pending } = await amounts(db, r.id)
  const waiver = await db
    .selectFrom('finance.deposit_waivers')
    .select(['waived_by', 'reason', 'created_at'])
    .where('deposit_requirement_id', '=', r.id)
    .executeTakeFirst()
  const payments = await db
    .selectFrom('finance.payments as p')
    .leftJoin('finance.payment_allocations as a', (j) =>
      j
        .onRef('a.payment_id', '=', 'p.id')
        .on('a.deposit_requirement_id', '=', r.id)
        .on('a.reverses_allocation_id', 'is', null),
    )
    .leftJoin('finance.payment_receipts as rc', 'rc.payment_id', 'p.id')
    .select([
      'p.id',
      'p.method',
      'p.amount_cents',
      'p.received_on',
      'p.reference',
      'p.payer_name',
      'p.state',
      'p.collector_staff_id',
      'p.recorded_by',
      'p.created_at',
      'p.cleared_by',
      'p.cleared_at',
      'p.memo',
      'p.deposited_at',
      'p.reconciled_at',
      'rc.number as receipt_number',
      'a.amount_cents as applied_cents',
      'p.corrects_payment_id',
    ])
    .where('p.job_id', '=', jobId)
    .orderBy('p.created_at')
    .orderBy('p.id')
    .execute()
  const adjustments = await adjustmentsOf(
    db,
    payments.map((p) => p.id),
  )
  const names = await staffNames(db, [
    r.payment_link_set_by,
    waiver?.waived_by ?? null,
    ...payments.flatMap((p) => [p.collector_staff_id, p.recorded_by, p.cleared_by]),
  ])
  const amount = r.amount_cents === null ? null : Number(r.amount_cents)
  const open = OPEN_STATES.has(r.state)
  const applied = verified + pending
  const resource = { projectId: r.project_id }
  return {
    jobId: r.job_id,
    required: r.required,
    state: r.state as DepositState,
    amountCents: amount,
    baseTotalCents: Number(r.base_total_cents),
    ruleVersion: r.rule_version,
    verifiedCents: verified,
    pendingCents: pending,
    remainingCents: amount === null ? null : Math.max(0, amount - verified),
    workScheduling:
      !r.required || r.state === 'satisfied' || r.state === 'waived' || r.state === 'applied' ? 'open' : 'blocked',
    paymentLink:
      r.payment_link && r.payment_link_set_at
        ? { url: r.payment_link, setBy: ref(r.payment_link_set_by, names), setAt: r.payment_link_set_at.toISOString() }
        : null,
    waiver: waiver
      ? {
          by: ref(waiver.waived_by, names) as StaffRef,
          at: waiver.created_at.toISOString(),
          reason: waiver.reason,
        }
      : null,
    payments: payments.map((p) => {
      const appliedCents = p.applied_cents === null ? 0 : Number(p.applied_cents)
      return {
        id: p.id,
        method: p.method as PaymentMethod,
        amountCents: Number(p.amount_cents),
        appliedCents,
        unappliedCents: Number(p.amount_cents) - appliedCents,
        receivedOn: dateText(p.received_on),
        reference: p.reference,
        payerName: p.payer_name,
        state: p.state as PaymentState,
        verified: VERIFIED.has(p.state),
        collector: ref(p.collector_staff_id, names) as StaffRef,
        recordedBy: ref(p.recorded_by, names) as StaffRef,
        recordedAt: p.created_at.toISOString(),
        clearedBy: ref(p.cleared_by, names),
        clearedAt: p.cleared_at?.toISOString() ?? null,
        canMarkCleared:
          p.method === 'check' &&
          PENDING.has(p.state) &&
          allows(actor, 'check.mark_cleared', { ...resource, collectedByStaffId: p.collector_staff_id }),
        memo: p.memo,
        receiptNumber: p.receipt_number,
        depositedAt: p.deposited_at?.toISOString() ?? null,
        reconciledAt: p.reconciled_at?.toISOString() ?? null,
        canMarkDeposited:
          p.method === 'check' &&
          p.state === 'received' &&
          allows(actor, 'payment.reconcile', { ...resource, collectedByStaffId: p.collector_staff_id }),
        canReconcile:
          p.method !== 'check' &&
          p.state === 'recorded' &&
          !disputeOpen(adjustments.get(p.id)) &&
          allows(actor, 'payment.reconcile', { ...resource, collectedByStaffId: p.collector_staff_id }),
        adjustments: adjustments.get(p.id) ?? [],
        disputeOpen: disputeOpen(adjustments.get(p.id)),
        adjustable: availableAdjustments(actor, resource, p, disputeOpen(adjustments.get(p.id))),
        correctsPaymentId: p.corrects_payment_id,
      }
    }),
    version: r.version,
    actions: {
      enterPaymentLink: open && allows(actor, 'invoice.enter_payment_link', resource),
      recordPayment:
        open &&
        amount !== null &&
        applied < amount &&
        allows(actor, 'payment.record', { ...resource, collectedByStaffId: actor.userId }),
      // The fresh sign-in and the reason are asked for when the Owner acts; the button shows for the Owner only.
      waive: open && allows({ ...actor, freshAuth: true }, 'deposit.waive', resource, 'shown'),
    },
  }
}

/** A Date column of type date as YYYY-MM-DD (the driver may hand back a Date at local midnight or a string). */
function dateText(d: Date | string): string {
  if (typeof d === 'string') return d.slice(0, 10)
  const y = d.getFullYear()
  return `${y}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function dbNow(tx: Reader): Promise<Date> {
  const r = await sql<{ now: Date }>`SELECT now() AS now`.execute(tx)
  return new Date((r.rows[0] as { now: Date }).now)
}

/** Whether a pasted link is https on one of the configured Square hosts (the host itself or a subdomain). */
export function squareLinkProblem(url: string, hosts: readonly string[]): string | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return 'NOT_A_LINK'
  }
  if (u.protocol !== 'https:') return 'NOT_HTTPS'
  if (u.username !== '' || u.password !== '' || u.port !== '') return 'NOT_A_SQUARE_LINK'
  const host = u.hostname.toLowerCase()
  if (!hosts.some((h) => host === h || host.endsWith(`.${h}`))) return 'NOT_A_SQUARE_LINK'
  return null
}

/** Pastes (or replaces) the deposit request's Square payment link, at the version the caller saw. */
export async function setDepositPaymentLink(
  tx: Tx,
  actor: StaffActor,
  jobId: string,
  input: { url: string; expectedVersion: number },
): Promise<{ version: number; host: string; replaced: boolean }> {
  const r = await requirementOfJob(tx, jobId, 'update')
  if (!r) throw new ApiError('NOT_FOUND')
  if (r.version !== input.expectedVersion)
    throw new ApiError('STALE_VERSION', { current: { version: r.version, values: { state: r.state } } })
  if (!r.required) throw conflict('DEPOSIT_NOT_REQUIRED')
  if (!OPEN_STATES.has(r.state)) throw conflict(`DEPOSIT_${r.state.toUpperCase()}`)
  const setting = (await loadConfig(tx)).get('payment.square_link_hosts')
  if (setting.state !== 'CONFIGURED')
    throw new ApiError('NOT_CONFIGURED', { fieldErrors: [field('payment.square_link_hosts', 'NOT_CONFIGURED')] })
  const url = input.url.trim()
  const problem = url.length > DEPOSIT_LIMITS.paymentLink ? 'TOO_LONG' : squareLinkProblem(url, setting.value.hosts)
  if (problem) throw invalid('body.url', problem)
  const now = await dbNow(tx)
  const next = await tx
    .updateTable('finance.deposit_requirements')
    .set({
      payment_link: url,
      payment_link_set_by: actor.userId,
      payment_link_set_at: now,
      version: r.version + 1,
    })
    .where('id', '=', r.id)
    .returning('version')
    .executeTakeFirstOrThrow()
  return { version: next.version, host: new URL(url).hostname, replaced: r.payment_link !== null }
}

export type RecordPaymentInput = {
  method: string
  amountCents: number
  receivedOn: string
  reference?: string | null
  payerName?: string | null
  collectorStaffId?: string | null
  /** TSK-0088 (HH-FIN-11): an optional memo (cash), kept as written. */
  memo?: string | null
  /** TSK-0089: the voided payment this one corrects (set by the correction only, never by a request body). */
  correctsPaymentId?: string | null
}

export type RecordedPayment = {
  paymentId: string
  state: PaymentState
  appliedCents: number
  unappliedCents: number
  depositState: DepositState
}

const trimmed = (s: string | null | undefined) => {
  const v = (s ?? '').trim().replace(/\s+/g, ' ')
  return v === '' ? null : v
}

/** A payment as validated and normalized for recording (shared by deposit and invoice payments, TSK-0086). */
export type CheckedPayment = {
  method: PaymentMethod
  amountCents: number
  receivedOn: string
  reference: string | null
  payerName: string | null
  memo: string | null
  collector: string
  now: Date
  correctsPaymentId: string | null
}

/**
 * Validates a payment to record (HH-FIN-09, HH-FIN-12): an accepted method (payment.methods), a positive amount in
 * cents, a received date not after today in the business time zone, the reference a card payment or check needs, the
 * payer of a check and an active collector; the same method and reference are refused twice (under an advisory lock,
 * so a concurrent duplicate waits and is then refused by name). Runs in the recording transaction.
 */
export async function checkPaymentInput(tx: Tx, actor: StaffActor, input: RecordPaymentInput): Promise<CheckedPayment> {
  const config = await loadConfig(tx)
  const methods = config.get('payment.methods')
  if (methods.state !== 'CONFIGURED')
    throw new ApiError('NOT_CONFIGURED', { fieldErrors: [field('payment.methods', 'NOT_CONFIGURED')] })
  if (!(methods.value.methods as readonly string[]).includes(input.method)) throw invalid('body.method', 'NOT_ACCEPTED')
  const method = input.method as PaymentMethod
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) throw invalid('body.amountCents', 'INVALID')

  const reference = trimmed(input.reference)
  const payerName = trimmed(input.payerName)
  const problems: FieldError[] = []
  if (REFERENCE_REQUIRED.has(method) && reference === null) problems.push(field('body.reference', 'required'))
  if (reference !== null && reference.length > DEPOSIT_LIMITS.reference)
    problems.push(field('body.reference', 'TOO_LONG'))
  if (method === 'check' && payerName === null) problems.push(field('body.payerName', 'required'))
  if (payerName !== null && payerName.length > DEPOSIT_LIMITS.payerName)
    problems.push(field('body.payerName', 'TOO_LONG'))
  const memo = trimmed(input.memo)
  if (memo !== null && memo.length > DEPOSIT_LIMITS.memo) problems.push(field('body.memo', 'TOO_LONG'))
  const now = await dbNow(tx)
  const zone = config.get('business.timezone')
  // The business day; UTC only if the time zone were ever NOT CONFIGURED.
  const today = localDate(now, zone.state === 'CONFIGURED' ? zone.value.zone : 'UTC')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.receivedOn) || Number.isNaN(Date.parse(`${input.receivedOn}T12:00:00Z`)))
    problems.push(field('body.receivedOn', 'INVALID'))
  else if (input.receivedOn > today) problems.push(field('body.receivedOn', 'IN_FUTURE'))
  if (problems.length) throw new ApiError('VALIDATION_FAILED', { fieldErrors: problems })

  const collector = input.collectorStaffId ?? actor.userId
  const live = await tx
    .selectFrom('identity.staff_users')
    .select('id')
    .where('id', '=', collector)
    .where('status', '=', 'active')
    .executeTakeFirst()
  if (!live) throw invalid('body.collectorStaffId', 'NOT_ACTIVE_STAFF')

  // HH-FIN-09: the same method and reference once. The advisory lock makes a concurrent duplicate wait and then see
  // the first one, so it is refused by name instead of failing on the unique index.
  if (reference !== null) {
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`finance.payment:${method}:${reference}`}, 0))`.execute(
      tx,
    )
    const dup = await tx
      .selectFrom('finance.payments')
      .select('id')
      .where('method', '=', method)
      .where('reference', '=', reference)
      // TSK-0089: a voided payment no longer holds its reference (its correction may record it again).
      .where('state', '<>', 'voided')
      .executeTakeFirst()
    if (dup) throw conflict('DUPLICATE_PAYMENT', 'body.reference')
  }
  return {
    method,
    amountCents: input.amountCents,
    receivedOn: input.receivedOn,
    reference,
    payerName,
    memo,
    collector,
    now,
    correctsPaymentId: input.correctsPaymentId ?? null,
  }
}

/** Records a verified deposit payment and applies it to what the deposit still needs (see the header). */
export async function recordDepositPayment(
  tx: Tx,
  actor: StaffActor,
  jobId: string,
  input: RecordPaymentInput,
): Promise<RecordedPayment> {
  if (!tx.isTransaction) throw new Error('recordDepositPayment runs inside the business transaction (withTx)')
  const r = await requirementOfJob(tx, jobId, 'update')
  if (!r) throw new ApiError('NOT_FOUND')
  if (!r.required || r.amount_cents === null) throw conflict('DEPOSIT_NOT_REQUIRED')
  // TSK-0085: once credited to the final invoice the deposit takes no more money (the invoice does).
  if (r.state === 'applied') throw conflict('DEPOSIT_APPLIED')
  const { method, reference, payerName, memo, collector, now, correctsPaymentId } = await checkPaymentInput(
    tx,
    actor,
    input,
  )

  // What the deposit still needs, counting checks still pending (allocations never exceed the deposit).
  const { verified, pending } = await amounts(tx, r.id)
  const need = Number(r.amount_cents) - verified - pending
  if (need <= 0) throw conflict(r.state === 'satisfied' ? 'DEPOSIT_SATISFIED' : 'DEPOSIT_COVERED')
  const applied = Math.min(need, input.amountCents)

  const payment = await tx
    .insertInto('finance.payments')
    .values({
      project_id: r.project_id,
      job_id: r.job_id,
      method,
      amount_cents: input.amountCents,
      received_on: input.receivedOn,
      collector_staff_id: collector,
      recorded_by: actor.userId,
      reference,
      payer_name: payerName,
      memo,
      state: method === 'check' ? 'received' : 'recorded',
      created_at: now,
      corrects_payment_id: correctsPaymentId,
    })
    .returning(['id', 'state'])
    .executeTakeFirstOrThrow()
  await tx
    .insertInto('finance.payment_allocations')
    .values({
      payment_id: payment.id,
      deposit_requirement_id: r.id,
      amount_cents: applied,
      allocated_by: actor.userId,
      created_at: now,
    })
    .execute()
  await syncDepositItem(tx, jobId)
  // TSK-0086: a remainder is unallocated money for the Owner's credit or refund decision; a deposit invoice paid by
  // this money announces it once.
  await syncUnallocatedItem(tx, jobId)
  await announcePaidInvoices(tx, jobId)
  // TSK-0087: a confirmed payment's receipt, at once (a check's when it is cleared).
  await issuePaymentReceipt(tx, payment.id)
  // TSK-0088: a check waits in the Owner's queue until it clears.
  if (method === 'check') await syncCheckItem(tx, jobId)
  const after = await requirementOfJob(tx, jobId)
  return {
    paymentId: payment.id,
    state: payment.state as PaymentState,
    appliedCents: applied,
    unappliedCents: input.amountCents - applied,
    depositState: (after?.state ?? r.state) as DepositState,
  }
}

/** The Owner marks a received check cleared; the deposit it was applied to counts it from now on. */
export async function markCheckCleared(
  tx: Tx,
  actor: StaffActor,
  paymentId: string,
): Promise<{ jobId: string; state: PaymentState; depositState: DepositState | null; version: number }> {
  // The lock order of every money write: the deposit requirement first, then the invoices, then the payment.
  const targets = await tx
    .selectFrom('finance.payment_allocations')
    .select(['deposit_requirement_id', 'invoice_id'])
    .where('payment_id', '=', paymentId)
    .execute()
  const requirements = targets.flatMap((a) => (a.deposit_requirement_id ? [a.deposit_requirement_id] : []))
  const invoices = targets.flatMap((a) => (a.invoice_id ? [a.invoice_id] : []))
  if (requirements.length)
    await tx
      .selectFrom('finance.deposit_requirements')
      .select('id')
      .where('id', 'in', requirements)
      .orderBy('id')
      .forUpdate()
      .execute()
  if (invoices.length)
    await tx.selectFrom('finance.invoices').select('id').where('id', 'in', invoices).orderBy('id').forUpdate().execute()
  const p = await tx
    .selectFrom('finance.payments')
    .select(['id', 'job_id', 'method', 'state', 'collector_staff_id', 'version'])
    .where('id', '=', paymentId)
    .forUpdate()
    .executeTakeFirst()
  if (!p) throw new ApiError('NOT_FOUND')
  if (p.method !== 'check') throw conflict('NOT_A_CHECK', 'payment')
  if (!PENDING.has(p.state)) throw conflict(`CHECK_${p.state.toUpperCase()}`, 'payment')
  if (p.collector_staff_id === actor.userId) throw new ApiError('FORBIDDEN')
  const now = await dbNow(tx)
  const next = await tx
    .updateTable('finance.payments')
    .set({ state: 'cleared', cleared_by: actor.userId, cleared_at: now, version: p.version + 1 })
    .where('id', '=', p.id)
    .returning(['state', 'version'])
    .executeTakeFirstOrThrow()
  await syncDepositItem(tx, p.job_id)
  // TSK-0086: an invoice the cleared check pays in full is Paid now, announced once.
  await announcePaidInvoices(tx, p.job_id)
  // TSK-0087: the cleared check's receipt.
  await issuePaymentReceipt(tx, p.id)
  // TSK-0088: the job's check_to_clear item follows its checks still pending.
  await syncCheckItem(tx, p.job_id)
  const r = await requirementOfJob(tx, p.job_id)
  return {
    jobId: p.job_id,
    state: next.state as PaymentState,
    depositState: (r?.state ?? null) as DepositState | null,
    version: next.version,
  }
}

/** The Owner's waiver of a job's required deposit: reason required, fresh sign-in read again here. */
export async function waiveDeposit(
  tx: Tx,
  actor: StaffActor,
  input: { jobId: string; reason: string; sessionId: string },
): Promise<{ waiverId: string; at: Date; amountCents: number; previousState: DepositState; version: number }> {
  if (!tx.isTransaction) throw new Error('waiveDeposit runs inside the business transaction (withTx)')
  const reason = input.reason.trim()
  if (reason === '') throw invalid('body.reason', 'required')
  if (reason.length > DEPOSIT_LIMITS.reason) throw invalid('body.reason', 'TOO_LONG')
  const r = await requirementOfJob(tx, input.jobId, 'update')
  if (!r) throw new ApiError('NOT_FOUND')
  const now = await dbNow(tx)
  // The Owner designation and the fresh sign-in, read again at the write (another administrator never qualifies).
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
    .where('id', '=', input.sessionId)
    .forShare()
    .executeTakeFirst()
  if (
    !session ||
    session.staff_user_id !== actor.userId ||
    session.revoked_at !== null ||
    now.getTime() - session.authenticated_at.getTime() > FRESH_AUTH_MINUTES * 60_000
  )
    throw new ApiError('FRESH_AUTH_REQUIRED')
  if (!r.required || r.amount_cents === null) throw conflict('DEPOSIT_NOT_REQUIRED')
  if (!OPEN_STATES.has(r.state)) throw conflict(`DEPOSIT_${r.state.toUpperCase()}`)
  const waiver = await tx
    .insertInto('finance.deposit_waivers')
    .values({
      deposit_requirement_id: r.id,
      job_id: r.job_id,
      waived_by: actor.userId,
      reason,
      staff_session_id: input.sessionId,
      // The trigger keeps the session's own value (full precision); created_at is the transaction's now().
      authenticated_at: session.authenticated_at,
    })
    .returning(['id', 'created_at'])
    .executeTakeFirstOrThrow()
  await syncDepositItem(tx, input.jobId)
  const after = await requirementOfJob(tx, input.jobId)
  return {
    waiverId: waiver.id,
    at: waiver.created_at,
    amountCents: Number(r.amount_cents),
    previousState: r.state as DepositState,
    version: after?.version ?? r.version,
  }
}

export type CustomerDeposit =
  | { state: 'none' }
  | {
      state: 'deposit_due'
      amountCents: number
      verifiedCents: number
      pendingCents: number
      payByCardUrl: string | null
    }
  | { state: 'deposit_received'; amountCents: number }

/**
 * What the customer's project shows about the deposit (HH-FIN-02, C05): the amount due while it is required, with
 * the staff-pasted Square link and any check still pending; "received" once verified money covers it. A waived or
 * not-required deposit shows nothing to pay (the waiver itself is internal).
 */
export async function customerDeposit(db: Reader, projectId: string): Promise<CustomerDeposit> {
  const r = await db
    .selectFrom('finance.deposit_requirements')
    .select(['id', 'required', 'amount_cents', 'state', 'payment_link'])
    .where('project_id', '=', projectId)
    .executeTakeFirst()
  if (!r || !r.required || r.amount_cents === null) return { state: 'none' }
  if (r.state === 'satisfied' || r.state === 'applied')
    return { state: 'deposit_received', amountCents: Number(r.amount_cents) }
  if (!OPEN_STATES.has(r.state)) return { state: 'none' }
  const { verified, pending } = await amounts(db, r.id)
  return {
    state: 'deposit_due',
    amountCents: Number(r.amount_cents),
    verifiedCents: verified,
    pendingCents: pending,
    payByCardUrl: r.payment_link,
  }
}
