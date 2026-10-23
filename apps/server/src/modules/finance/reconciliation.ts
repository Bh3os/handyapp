// The reconciliation queue for unmatched and uncertain money (TSK-0090; HH-FIN-15, HH-FIN-09, HH-FIN-08, T61,
// OWN-DEC-111, RULE-SERVER-AUTHZ). Migration 0096 keeps the records true whatever path writes.
// - The Owner or Office reports what they cannot match yet: an uncertain outcome (the customer says a Square payment
//   failed midway and it is not in Square yet), money received that matches no payment, an amount or currency
//   mismatch, a duplicate entry, or a Square payment whose reference does not match. Reporting it records no payment
//   and changes no balance: the balance stays due until staff record a verified payment (HH-FIN-09).
// - It never resolves itself. A person resolves it once with evidence: matched (to a payment already recorded) or
//   recorded (the verified payment staff recorded for it), routine matching that Office may do; not received,
//   duplicate, corrected, refunded or no action, the Owner's (PROPOSED). Matched and recorded name the payment, one item
//   per payment, so a retry in Square recorded once never makes a double entry. Never the resolver's own collection
//   (payment.reconcile: not_self_collected).
// - The same queue lists, from their own records, checks still pending, payments returned in the last 30 days
//   (PROPOSED), open disputes and refunds whose outcome is not certain yet (processing, needs review).
// - Each open item is in the staff queue (reconciliation_item) until resolved.
import type { Db, Tx } from '@handyhub/db'
import type { StaffActor } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError, type FieldError } from '../../api/errors.js'
import { openQueueItem, resolveQueueItem } from '../queue/items.js'
import { PAYMENT_METHODS, type PaymentMethod } from './deposits.js'

type Reader = Db | Tx

export const RECONCILIATION_KINDS = [
  'uncertain_outcome',
  'unmatched_payment',
  'amount_mismatch',
  'currency_mismatch',
  'duplicate_entry',
  'reference_mismatch',
] as const
export type ReconciliationKind = (typeof RECONCILIATION_KINDS)[number]
export const RECONCILIATION_SOURCES = ['customer', 'square', 'bank', 'staff'] as const
export const RECONCILIATION_RESOLUTIONS = [
  'matched',
  'recorded',
  'not_received',
  'duplicate',
  'corrected',
  'refunded',
  'no_action',
] as const
export type ReconciliationResolution = (typeof RECONCILIATION_RESOLUTIONS)[number]
/** Routine matching: Office may resolve these too (PROPOSED); every other resolution is the Owner's. */
export const ROUTINE_RESOLUTIONS: readonly ReconciliationResolution[] = ['matched', 'recorded']

/** PROPOSED limits and windows. */
export const RECONCILIATION_LIMITS = { description: 2000, evidence: 2000, reference: 120 } as const
export const RETURNED_WINDOW_DAYS = 30
const RESOLVED_SHOWN = 50

export const RECONCILIATION_QUEUE_TYPE = 'reconciliation_item'

const field = (f: string, code: string): FieldError => ({ field: f, code, message: '' })
const invalid = (f: string, code: string) => new ApiError('VALIDATION_FAILED', { fieldErrors: [field(f, code)] })
const conflict = (code: string, f = 'item') => new ApiError('CONFLICT', { fieldErrors: [field(f, code)] })

function text(value: string | null | undefined, f: string, max: number, required: boolean): string | null {
  const v = (value ?? '').trim().replace(/\s+/g, ' ')
  if (v === '') {
    if (required) throw invalid(f, 'required')
    return null
  }
  if (v.length > max) throw invalid(f, 'TOO_LONG')
  return v
}

export type ReportInput = {
  kind: ReconciliationKind
  source: (typeof RECONCILIATION_SOURCES)[number]
  jobId?: string | null
  paymentId?: string | null
  method?: PaymentMethod | null
  amountCents?: number | null
  currency?: string | null
  reference?: string | null
  description: string
}

/** Reports money staff cannot match yet; it records no payment and opens the staff queue item. */
export async function reportItem(tx: Tx, actor: StaffActor, input: ReportInput): Promise<{ id: string }> {
  if (!(RECONCILIATION_KINDS as readonly string[]).includes(input.kind)) throw invalid('body.kind', 'INVALID')
  if (!(RECONCILIATION_SOURCES as readonly string[]).includes(input.source)) throw invalid('body.source', 'INVALID')
  if (input.method && !(PAYMENT_METHODS as readonly string[]).includes(input.method))
    throw invalid('body.method', 'INVALID')
  if (input.amountCents != null && (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0))
    throw invalid('body.amountCents', 'INVALID')
  const currency = (input.currency ?? 'USD').trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(currency)) throw invalid('body.currency', 'INVALID')
  const description = text(input.description, 'body.description', RECONCILIATION_LIMITS.description, true) as string
  const reference = text(input.reference, 'body.reference', RECONCILIATION_LIMITS.reference, false)
  let projectId: string | null = null
  let jobId: string | null = null
  if (input.jobId) {
    const j = await tx
      .selectFrom('work.jobs')
      .select(['id', 'project_id'])
      .where('id', '=', input.jobId)
      .executeTakeFirst()
    if (!j) throw invalid('body.jobId', 'NOT_FOUND')
    projectId = j.project_id
    jobId = j.id
  }
  if (input.paymentId) {
    const p = await tx
      .selectFrom('finance.payments')
      .select(['id', 'project_id', 'job_id'])
      .where('id', '=', input.paymentId)
      .executeTakeFirst()
    if (!p || (jobId !== null && p.job_id !== jobId)) throw invalid('body.paymentId', 'NOT_FOUND')
    projectId = p.project_id
    jobId = p.job_id
  }
  const row = await tx
    .insertInto('finance.reconciliation_items')
    .values({
      kind: input.kind,
      source: input.source,
      project_id: projectId,
      job_id: jobId,
      payment_id: input.paymentId ?? null,
      method: input.method ?? null,
      amount_cents: input.amountCents ?? null,
      currency,
      reference,
      description,
      reported_by: actor.userId,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  const project = projectId
    ? await tx.selectFrom('crm.projects').select('reference').where('id', '=', projectId).executeTakeFirst()
    : undefined
  await openQueueItem(tx, {
    type: RECONCILIATION_QUEUE_TYPE,
    subjectId: row.id,
    reason: input.kind,
    projectId,
    reference: project?.reference ?? null,
  })
  return { id: row.id }
}

/** The facts the policy needs to resolve: the project, and the collector of the payment it would be matched to. */
export async function resolveFacts(db: Reader, itemId: string, paymentId: string | null | undefined) {
  const item = await db
    .selectFrom('finance.reconciliation_items')
    .select(['project_id'])
    .where('id', '=', itemId)
    .executeTakeFirst()
  if (!item) return null
  const p = paymentId
    ? await db
        .selectFrom('finance.payments')
        .select('collector_staff_id')
        .where('id', '=', paymentId)
        .executeTakeFirst()
    : undefined
  return {
    ...(item.project_id ? { projectId: item.project_id } : {}),
    // No payment named: no collection of anyone's is being reconciled.
    collectedByStaffId: p?.collector_staff_id ?? NO_COLLECTOR,
  }
}
/** The collector fact when an action reconciles no recorded payment (never a staff user's id). */
export const NO_COLLECTOR = 'none'

/** Resolves an open item once, with evidence (see the header). */
export async function resolveItem(
  tx: Tx,
  actor: StaffActor,
  itemId: string,
  input: { resolution: ReconciliationResolution; evidence: string; paymentId?: string | null },
) {
  if (!(RECONCILIATION_RESOLUTIONS as readonly string[]).includes(input.resolution))
    throw invalid('body.resolution', 'INVALID')
  const evidence = text(input.evidence, 'body.evidence', RECONCILIATION_LIMITS.evidence, true) as string
  if (!ROUTINE_RESOLUTIONS.includes(input.resolution) && !actor.roles.includes('owner')) throw new ApiError('FORBIDDEN')
  const item = await tx
    .selectFrom('finance.reconciliation_items')
    .select(['id', 'project_id', 'state'])
    .where('id', '=', itemId)
    .forUpdate()
    .executeTakeFirst()
  if (!item) throw new ApiError('NOT_FOUND')
  if (item.state !== 'open') throw conflict('ITEM_RESOLVED')
  const named = ROUTINE_RESOLUTIONS.includes(input.resolution)
  if (named && !input.paymentId) throw invalid('body.paymentId', 'required')
  if (!named && input.paymentId) throw invalid('body.paymentId', 'NOT_ALLOWED')
  if (input.paymentId) {
    const p = await tx
      .selectFrom('finance.payments')
      .select(['id', 'project_id', 'state'])
      .where('id', '=', input.paymentId)
      .executeTakeFirst()
    if (!p || (item.project_id !== null && p.project_id !== item.project_id))
      throw invalid('body.paymentId', 'NOT_FOUND')
    if (p.state === 'returned' || p.state === 'voided') throw conflict(`PAYMENT_${p.state.toUpperCase()}`)
    const taken = await tx
      .selectFrom('finance.reconciliation_items')
      .select('id')
      .where('resolved_payment_id', '=', p.id)
      .executeTakeFirst()
    if (taken) throw conflict('PAYMENT_ALREADY_MATCHED', 'body.paymentId')
  }
  const row = await tx
    .updateTable('finance.reconciliation_items')
    .set({
      state: 'resolved',
      resolution: input.resolution,
      evidence,
      resolved_payment_id: input.paymentId ?? null,
      resolved_by: actor.userId,
      resolved_at: new Date(),
    })
    .where('id', '=', itemId)
    .returning(['version'])
    .executeTakeFirstOrThrow()
  await resolveQueueItem(tx, { type: RECONCILIATION_QUEUE_TYPE, subjectId: itemId, resolution: input.resolution })
  return { id: itemId, version: row.version, projectId: item.project_id }
}

// ------------------------------------------------------------------------------------------------ the staff view

type StaffRef = { id: string; name: string | null }

export type ReconciliationItemView = {
  id: string
  kind: ReconciliationKind
  source: string
  project: { id: string; reference: string } | null
  jobId: string | null
  paymentId: string | null
  method: string | null
  amountCents: number | null
  currency: string
  reference: string | null
  description: string
  reportedBy: StaffRef
  reportedAt: string
  state: 'open' | 'resolved'
  resolution: ReconciliationResolution | null
  evidence: string | null
  resolvedPaymentId: string | null
  resolvedBy: StaffRef | null
  resolvedAt: string | null
  /** Payments of the item's project it may be matched to (standing, not matched to another item). */
  candidates: { id: string; method: string; amountCents: number; receivedOn: string; reference: string | null }[]
  /** The resolutions this caller may record now. */
  resolutions: ReconciliationResolution[]
}

/** A record the queue lists from its own source: a pending check, a returned payment, a dispute, a refund. */
export type ReconciliationRecord = {
  kind: 'pending_check' | 'returned_payment' | 'open_dispute' | 'refund_uncertain'
  jobId: string
  projectReference: string
  method: string
  amountCents: number
  state: string
  since: string
}

export type ReconciliationView = {
  open: ReconciliationItemView[]
  resolved: ReconciliationItemView[]
  records: ReconciliationRecord[]
  actions: { report: boolean }
}

function dateText(d: Date | string): string {
  if (typeof d === 'string') return d.slice(0, 10)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** The reconciliation queue as this caller sees it; `only` narrows it to one item (the queue's deep link). */
export async function reconciliationView(
  db: Reader,
  actor: StaffActor,
  options: { report: boolean; only?: string } = { report: false },
): Promise<ReconciliationView> {
  const base = db
    .selectFrom('finance.reconciliation_items as r')
    .leftJoin('crm.projects as p', 'p.id', 'r.project_id')
    .leftJoin('identity.staff_users as a', 'a.id', 'r.reported_by')
    .leftJoin('identity.staff_users as b', 'b.id', 'r.resolved_by')
    .select([
      'r.id',
      'r.kind',
      'r.source',
      'r.project_id',
      'p.reference as project_reference',
      'r.job_id',
      'r.payment_id',
      'r.method',
      'r.amount_cents',
      'r.currency',
      'r.reference',
      'r.description',
      'r.reported_by',
      'a.display_name as reported_name',
      'r.created_at',
      'r.state',
      'r.resolution',
      'r.evidence',
      'r.resolved_payment_id',
      'r.resolved_by',
      'b.display_name as resolved_name',
      'r.resolved_at',
    ])
  const scoped = options.only ? base.where('r.id', '=', options.only) : base
  const open = await scoped.where('r.state', '=', 'open').orderBy('r.created_at').execute()
  const resolved = await scoped
    .where('r.state', '=', 'resolved')
    .orderBy('r.resolved_at', 'desc')
    .limit(RESOLVED_SHOWN)
    .execute()
  const owner = actor.roles.includes('owner')
  const toView = async (r: (typeof open)[number]): Promise<ReconciliationItemView> => {
    const candidates =
      r.state === 'open' && r.project_id
        ? await db
            .selectFrom('finance.payments as x')
            .select(['x.id', 'x.method', 'x.amount_cents', 'x.received_on', 'x.reference', 'x.collector_staff_id'])
            .where('x.project_id', '=', r.project_id)
            .where('x.state', 'in', ['recorded', 'reconciled', 'received', 'deposited', 'cleared'])
            .where(({ not, exists, selectFrom }) =>
              not(
                exists(
                  selectFrom('finance.reconciliation_items as m')
                    .select('m.id')
                    .whereRef('m.resolved_payment_id', '=', 'x.id'),
                ),
              ),
            )
            .orderBy('x.created_at')
            .execute()
        : []
    return {
      id: r.id,
      kind: r.kind as ReconciliationKind,
      source: r.source,
      project: r.project_id && r.project_reference ? { id: r.project_id, reference: r.project_reference } : null,
      jobId: r.job_id,
      paymentId: r.payment_id,
      method: r.method,
      amountCents: r.amount_cents === null ? null : Number(r.amount_cents),
      currency: r.currency,
      reference: r.reference,
      description: r.description,
      reportedBy: { id: r.reported_by, name: r.reported_name },
      reportedAt: r.created_at.toISOString(),
      state: r.state as 'open' | 'resolved',
      resolution: r.resolution as ReconciliationResolution | null,
      evidence: r.evidence,
      resolvedPaymentId: r.resolved_payment_id,
      resolvedBy: r.resolved_by ? { id: r.resolved_by, name: r.resolved_name } : null,
      resolvedAt: r.resolved_at?.toISOString() ?? null,
      // Never the resolver's own collection (payment.reconcile: not_self_collected).
      candidates: candidates
        .filter((c) => c.collector_staff_id !== actor.userId)
        .map((c) => ({
          id: c.id,
          method: c.method,
          amountCents: Number(c.amount_cents),
          receivedOn: dateText(c.received_on),
          reference: c.reference,
        })),
      resolutions:
        r.state !== 'open'
          ? []
          : RECONCILIATION_RESOLUTIONS.filter(
              (x) =>
                (owner || ROUTINE_RESOLUTIONS.includes(x)) &&
                (!ROUTINE_RESOLUTIONS.includes(x) || candidates.length > 0),
            ),
    }
  }
  const records: ReconciliationRecord[] = []
  if (!options.only) {
    const r = await sql<{
      kind: ReconciliationRecord['kind']
      job_id: string
      reference: string
      method: string
      amount: string
      state: string
      since: Date
    }>`
      SELECT 'pending_check' AS kind, x.job_id, pr.reference, x.method, x.amount_cents::text AS amount, x.state,
             COALESCE(x.deposited_at, x.created_at) AS since
        FROM finance.payments x JOIN crm.projects pr ON pr.id = x.project_id
       WHERE x.state IN ('received', 'deposited')
      UNION ALL
      SELECT 'returned_payment', x.job_id, pr.reference, x.method, x.amount_cents::text, x.state, a.created_at
        FROM finance.payments x JOIN crm.projects pr ON pr.id = x.project_id
        JOIN finance.payment_adjustments a ON a.payment_id = x.id AND a.to_state = 'returned'
       WHERE x.state = 'returned' AND a.created_at > now() - make_interval(days => ${RETURNED_WINDOW_DAYS})
      UNION ALL
      SELECT 'open_dispute', x.job_id, pr.reference, x.method, x.amount_cents::text, x.state,
             (SELECT max(a.created_at) FROM finance.payment_adjustments a
               WHERE a.payment_id = x.id AND a.kind = 'dispute_opened')
        FROM finance.payments x JOIN crm.projects pr ON pr.id = x.project_id
       WHERE finance.payment_dispute_open(x.id)
      UNION ALL
      SELECT 'refund_uncertain', f.job_id, pr.reference, x.method, f.amount_cents::text, f.state,
             COALESCE(f.approved_at, f.created_at)
        FROM finance.refunds f JOIN crm.projects pr ON pr.id = f.project_id
        JOIN finance.payments x ON x.id = f.payment_id
       WHERE f.type = 'refund' AND f.state IN ('processing', 'needs_review')
      ORDER BY since`.execute(db)
    for (const x of r.rows)
      records.push({
        kind: x.kind,
        jobId: x.job_id,
        projectReference: x.reference,
        method: x.method,
        amountCents: Number(x.amount),
        state: x.state,
        since: new Date(x.since).toISOString(),
      })
  }
  return {
    open: await Promise.all(open.map(toView)),
    resolved: await Promise.all(resolved.map(toView)),
    records,
    actions: { report: options.report },
  }
}
