// Invoices drafted from the approved scope and issued after the Owner's quality review (TSK-0085; HH-FIN-04,
// HH-FIN-05, HH-QA-02, HH-PORT-10, T58, ENT-Invoice, ENT-JobScopeSnapshot, ENT-DepositRequirement, FACT-BUSINESS-NAME,
// FACT-BUSINESS-ADDRESS, FACT-PUBLIC-CONTACT, FACT-PAYMENT-DUE, FACT-PAYMENT-INSTRUCTIONS, FACT-TAX-NO-LINE,
// FACT-PRICING-DISCOUNTS, OWN-DEC-104, OWN-DEC-110, OWN-DEC-126, OWN-DEC-138, OWN-DEC-145, OWN-DEC-152, OWN-DEC-203,
// RULE-MONEY-CENTS, RULE-NO-INVENTED-FACTS, RULE-SERVER-AUTHZ).
// - The final invoice draft is prepared automatically (on the approval's committed event, and again on request) from
//   the job's latest scope snapshot: the approved estimate lines and selected options exactly as approved, the
//   approved discount as its own totals row (never a line), and later the approved change orders (TSK-0082 appends
//   scope snapshots; a credit line is a positive magnitude with a negative effect, OWN-DEC-203). Nothing is priced
//   here: every amount is the snapshot's own integer cents, and the draft is refused when its lines do not add up to
//   the approved totals (never adjusted). Unapproved work never appears: only the approved scope is read.
// - The deposit invoice bills the job's required deposit while it is still due (OWN-DEC-152: issuing it sends the
//   deposit-invoice message); its line is the deposit amount the approval pinned. PROPOSED: staff prepare it; it
//   needs no quality review (HH-QA-02: deposit invoices follow their approved terms).
// - Exceptions are shown to staff before issue; the blocking ones refuse the issue on the server: the Owner's quality
//   review (finance.invoice_quality_gate: TSK-0084 is not built, so every final invoice waits with
//   QUALITY_REVIEW_NOT_RECORDED), a scope that changed since the draft, a deposit check still pending, a verified
//   deposit larger than the invoice (routed to the Owner), and an issuer name that is NOT CONFIGURED. The missing
//   mailing address, the placeholder phone and email and the placeholder payment handles are shown, and block nothing
//   (HH-FIN-04, FACT-BUSINESS-ADDRESS, FACT-PUBLIC-CONTACT, FACT-PAYMENT-INSTRUCTIONS).
// - Issuing (Owner or Office, invoice.issue, OWN-DEC-138) pins the number (the project reference and -I<n>, never
//   reused), the issuer, the public contact, the payment instructions, the configuration versions and, for a final
//   invoice, the deposit's verified money as its credit, exactly once (the database refuses a second credit). It
//   writes invoice.issued (final) or invoice.deposit_issued (deposit): the PDF and the one notice follow from them.
import type { Db, Tx } from '@handyhub/db'
import { customerTranslator } from '@handyhub/i18n'
import { cents, subtract, sum } from '@handyhub/money'
import { decide, type Action, type Resource, type StaffActor } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError, type FieldError } from '../../api/errors.js'
import { loadConfig, type Config } from '../../platform/config/index.js'
import { outbox } from '../../platform/outbox.js'
import { syncDepositItem } from './deposit-queue.js'
import { invoiceMoney, invoicePayments, type InvoiceMoney, type InvoicePaymentView } from './ledger.js'
import { announcePaidInvoices, unallocatedCents } from './money-events.js'

type Reader = Db | Tx

export const INVOICE_KINDS = ['deposit', 'final'] as const
export type InvoiceKind = (typeof INVOICE_KINDS)[number]
export const INVOICE_STATES = ['draft', 'issued', 'partially_paid', 'paid', 'voided'] as const
export type InvoiceState = (typeof INVOICE_STATES)[number]
export const INVOICE_ISSUED_EVENT = 'invoice.issued'
export const DEPOSIT_INVOICE_ISSUED_EVENT = 'invoice.deposit_issued'

/** Exceptions shown before issue; `blocking` ones refuse the issue (the server decides them again when issuing). */
export const INVOICE_EXCEPTIONS = [
  'QUALITY_REVIEW_NOT_RECORDED',
  'QUALITY_REVIEW_BLOCKED',
  'QUALITY_REVIEW_OWNER_ONLY',
  'SCOPE_CHANGED',
  'DEPOSIT_CHECK_PENDING',
  'DEPOSIT_EXCEEDS_TOTAL',
  'DEPOSIT_NOT_DUE',
  'BUSINESS_NAME_NOT_CONFIGURED',
  'DEPOSIT_WAIVED',
  'DEPOSIT_NOT_PAID',
  'UNALLOCATED_PAYMENT',
  'MAILING_ADDRESS_NOT_CONFIGURED',
  'PUBLIC_CONTACT_PLACEHOLDER',
  'PAYMENT_INSTRUCTIONS_PLACEHOLDER',
] as const
export type InvoiceExceptionCode = (typeof INVOICE_EXCEPTIONS)[number]
const BLOCKING: ReadonlySet<InvoiceExceptionCode> = new Set([
  'QUALITY_REVIEW_NOT_RECORDED',
  'QUALITY_REVIEW_BLOCKED',
  'QUALITY_REVIEW_OWNER_ONLY',
  'SCOPE_CHANGED',
  'DEPOSIT_CHECK_PENDING',
  'DEPOSIT_EXCEEDS_TOTAL',
  'DEPOSIT_NOT_DUE',
  'BUSINESS_NAME_NOT_CONFIGURED',
])
export type InvoiceException = { code: InvoiceExceptionCode; blocking: boolean }

const field = (f: string, code: string): FieldError => ({ field: f, code, message: '' })
const conflict = (code: string, f = 'invoice') => new ApiError('CONFLICT', { fieldErrors: [field(f, code)] })
const allows = (actor: StaffActor, action: Action, resource: Resource) =>
  decide(actor, action, resource, { now: new Date(), online: true }).effect === 'allow'

type SnapshotLine = {
  position: number
  kind: string
  serviceCode: string | null
  description: string | null
  quantity: string | null
  unit: string | null
  unitPriceCents: number | null
  amountCents: number | null
}

type DraftLine = {
  position: number
  kind: 'charge' | 'credit'
  source: 'estimate_line' | 'change_order' | 'deposit'
  sourcePosition: number | null
  lineKind: 'base' | 'alternate' | 'add_on' | null
  serviceCode: string | null
  description: string
  quantity: string | null
  unit: string | null
  unitPriceCents: number | null
  amountCents: number
}

type DraftContent = {
  approvalId: string
  projectId: string
  scopeSnapshotId: string | null
  scopeVersion: number | null
  depositRequirementId: string | null
  lines: DraftLine[]
  chargesCents: number
  creditLinesCents: number
  subtotalCents: number
  discountCents: number
  discountCategory: string | null
  discountPercentBps: number | null
  totalCents: number
  paymentTerm: string
  paymentTermText: string
  testMark: boolean
}

async function dbNow(tx: Reader): Promise<Date> {
  const r = await sql<{ now: Date }>`SELECT now() AS now`.execute(tx)
  return new Date((r.rows[0] as { now: Date }).now)
}

/** The job's current approved scope: its latest scope snapshot (version 1 is the approval; later ones change orders). */
async function latestSnapshot(db: Reader, jobId: string) {
  return db
    .selectFrom('work.job_scope_snapshots')
    .select(['id', 'version', 'source', 'lines', 'subtotal_cents', 'discount_cents', 'total_cents'])
    .where('job_id', '=', jobId)
    .orderBy('version', 'desc')
    .limit(1)
    .executeTakeFirst()
}

async function jobFacts(db: Reader, jobId: string) {
  return db
    .selectFrom('work.jobs as j')
    .innerJoin('estimating.approvals as a', 'a.id', 'j.approval_id')
    .innerJoin('estimating.estimate_versions as v', 'v.id', 'a.version_id')
    .innerJoin('estimating.estimates as e', 'e.id', 'a.estimate_id')
    .leftJoin('finance.deposit_requirements as d', 'd.job_id', 'j.id')
    .select([
      'j.id',
      'j.project_id',
      'a.id as approval_id',
      'a.payment_term',
      'a.payment_term_text',
      'a.test_mark',
      'v.discount_category',
      'v.discount_percent_bps',
      'e.number as estimate_number',
      'a.version as estimate_version',
      'd.id as requirement_id',
      'd.required',
      'd.amount_cents as deposit_cents',
      'd.state as deposit_state',
    ])
    .where('j.id', '=', jobId)
    .executeTakeFirst()
}

/**
 * The final invoice's content from the job's current approved scope; a problem code when the scope cannot be billed
 * as it stands (a line without an amount, credits that reach the charges, lines that do not add up to the totals).
 */
async function finalDraftContent(db: Reader, jobId: string): Promise<DraftContent | { problem: string } | null> {
  const job = await jobFacts(db, jobId)
  if (!job) return null
  const snap = await latestSnapshot(db, jobId)
  if (!snap) return { problem: 'SCOPE_MISSING' }
  const lines: DraftLine[] = []
  for (const [i, l] of (snap.lines as SnapshotLine[]).entries()) {
    if (l.amountCents === null || !Number.isSafeInteger(l.amountCents) || l.amountCents <= 0 || !l.description?.trim())
      return { problem: 'SCOPE_LINE_NOT_PRICED' }
    const credit = l.kind === 'credit'
    lines.push({
      position: i + 1,
      kind: credit ? 'credit' : 'charge',
      source: snap.source === 'change_order' ? 'change_order' : 'estimate_line',
      sourcePosition: l.position ?? null,
      lineKind: l.kind === 'base' || l.kind === 'alternate' || l.kind === 'add_on' ? l.kind : null,
      serviceCode: l.serviceCode ?? null,
      description: l.description.trim(),
      quantity: l.quantity ?? null,
      unit: l.unit ?? null,
      unitPriceCents: l.unitPriceCents ?? null,
      amountCents: l.amountCents,
    })
  }
  const charges = sum(lines.filter((l) => l.kind === 'charge').map((l) => cents(l.amountCents)))
  const credits = sum(lines.filter((l) => l.kind === 'credit').map((l) => cents(l.amountCents)))
  // OWN-DEC-203: a reduction never makes a negative charge; it is refused and routed to staff instead.
  if (charges <= credits) return { problem: 'CREDIT_EXCEEDS_CHARGES' }
  const subtotal = subtract(charges, credits)
  const discount = cents(Number(snap.discount_cents))
  if (subtotal !== Number(snap.subtotal_cents) || subtract(subtotal, discount) !== Number(snap.total_cents))
    return { problem: 'SCOPE_TOTALS_MISMATCH' }
  const discounted = discount > 0
  if (discounted && (!job.discount_category || job.discount_percent_bps === null))
    return { problem: 'DISCOUNT_NOT_RECORDED' }
  return {
    approvalId: job.approval_id,
    projectId: job.project_id,
    scopeSnapshotId: snap.id,
    scopeVersion: snap.version,
    depositRequirementId: job.requirement_id,
    lines,
    chargesCents: charges,
    creditLinesCents: credits,
    subtotalCents: subtotal,
    discountCents: discount,
    discountCategory: discounted ? job.discount_category : null,
    discountPercentBps: discounted ? job.discount_percent_bps : null,
    totalCents: Number(snap.total_cents),
    paymentTerm: job.payment_term,
    paymentTermText: job.payment_term_text,
    testMark: job.test_mark,
  }
}

/** The deposit invoice's content: one line, the deposit the approval pinned (in the customer's English). */
async function depositDraftContent(db: Reader, jobId: string): Promise<DraftContent | { problem: string } | null> {
  const job = await jobFacts(db, jobId)
  if (!job) return null
  if (!job.requirement_id || !job.required || job.deposit_cents === null) return { problem: 'DEPOSIT_NOT_REQUIRED' }
  if (job.deposit_state !== 'required' && job.deposit_state !== 'partly_satisfied')
    return { problem: 'DEPOSIT_NOT_DUE' }
  const amount = Number(job.deposit_cents)
  return {
    approvalId: job.approval_id,
    projectId: job.project_id,
    scopeSnapshotId: null,
    scopeVersion: null,
    depositRequirementId: job.requirement_id,
    lines: [
      {
        position: 1,
        kind: 'charge',
        source: 'deposit',
        sourcePosition: null,
        lineKind: null,
        serviceCode: null,
        description: customerTranslator().t('invoicePdf.depositLine', {
          number: job.estimate_number,
          version: job.estimate_version,
        }),
        quantity: null,
        unit: null,
        unitPriceCents: null,
        amountCents: amount,
      },
    ],
    chargesCents: amount,
    creditLinesCents: 0,
    subtotalCents: amount,
    discountCents: 0,
    discountCategory: null,
    discountPercentBps: null,
    totalCents: amount,
    paymentTerm: job.payment_term,
    paymentTermText: job.payment_term_text,
    testMark: job.test_mark,
  }
}

async function writeLines(tx: Tx, invoiceId: string, lines: readonly DraftLine[]) {
  await tx.deleteFrom('finance.invoice_lines').where('invoice_id', '=', invoiceId).execute()
  if (lines.length === 0) return
  await tx
    .insertInto('finance.invoice_lines')
    .values(
      lines.map((l) => ({
        invoice_id: invoiceId,
        position: l.position,
        kind: l.kind,
        source: l.source,
        source_position: l.sourcePosition,
        line_kind: l.lineKind,
        service_code: l.serviceCode,
        description: l.description,
        quantity: l.quantity,
        unit: l.unit,
        unit_price_cents: l.unitPriceCents,
        amount_cents: l.amountCents,
      })),
    )
    .execute()
}

const draftColumns = (c: DraftContent) => ({
  scope_snapshot_id: c.scopeSnapshotId,
  scope_version: c.scopeVersion,
  charges_cents: c.chargesCents,
  credit_lines_cents: c.creditLinesCents,
  subtotal_cents: c.subtotalCents,
  discount_cents: c.discountCents,
  discount_category: c.discountCategory,
  discount_percent_bps: c.discountPercentBps,
  total_cents: c.totalCents,
  payment_term: c.paymentTerm,
  payment_term_text: c.paymentTermText,
})

export type PreparedDraft = { invoiceId: string; outcome: 'created' | 'refreshed' | 'unchanged'; version: number }

/**
 * Prepares (or brings up to date) the job's invoice draft of this kind, under the job's deposit-requirement lock (the
 * lock order of every money write). An issued invoice of the kind is a CONFLICT (one per job, HH-FIN-05).
 */
export async function prepareDraft(
  tx: Tx,
  input: { jobId: string; kind: InvoiceKind; preparedBy: string | null },
): Promise<PreparedDraft> {
  if (!tx.isTransaction) throw new Error('prepareDraft runs inside the business transaction (withTx)')
  await tx
    .selectFrom('finance.deposit_requirements')
    .select('id')
    .where('job_id', '=', input.jobId)
    .forUpdate()
    .execute()
  // Serialises two preparations of the same job (the unique index would refuse the second draft anyway).
  await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`finance.invoice_draft:${input.jobId}`}, 0))`.execute(tx)
  const existing = await tx
    .selectFrom('finance.invoices')
    .select(['id', 'state', 'scope_version', 'version'])
    .where('job_id', '=', input.jobId)
    .where('kind', '=', input.kind)
    .where('state', '<>', 'voided')
    .forUpdate()
    .executeTakeFirst()
  if (existing && existing.state !== 'draft') throw conflict('INVOICE_ALREADY_ISSUED')
  const content =
    input.kind === 'final' ? await finalDraftContent(tx, input.jobId) : await depositDraftContent(tx, input.jobId)
  if (!content) throw new ApiError('NOT_FOUND')
  if ('problem' in content) throw conflict(content.problem)
  const now = await dbNow(tx)
  if (existing) {
    const lines = await tx
      .selectFrom('finance.invoice_lines')
      .select(['position', 'kind', 'amount_cents', 'description'])
      .where('invoice_id', '=', existing.id)
      .orderBy('position')
      .execute()
    const same =
      existing.scope_version === content.scopeVersion &&
      lines.length === content.lines.length &&
      lines.every(
        (l, i) =>
          l.kind === content.lines[i]?.kind &&
          Number(l.amount_cents) === content.lines[i]?.amountCents &&
          l.description === content.lines[i]?.description,
      )
    if (same) return { invoiceId: existing.id, outcome: 'unchanged', version: existing.version }
    await writeLines(tx, existing.id, content.lines)
    const row = await tx
      .updateTable('finance.invoices')
      .set({ ...draftColumns(content), prepared_by: input.preparedBy, prepared_at: now, version: existing.version + 1 })
      .where('id', '=', existing.id)
      .returning('version')
      .executeTakeFirstOrThrow()
    return { invoiceId: existing.id, outcome: 'refreshed', version: row.version }
  }
  const row = await tx
    .insertInto('finance.invoices')
    .values({
      project_id: content.projectId,
      job_id: input.jobId,
      kind: input.kind,
      approval_id: content.approvalId,
      deposit_requirement_id: content.depositRequirementId,
      test_mark: content.testMark,
      prepared_by: input.preparedBy,
      prepared_at: now,
      created_at: now,
      ...draftColumns(content),
    })
    .returning(['id', 'version'])
    .executeTakeFirstOrThrow()
  await writeLines(tx, row.id, content.lines)
  return { invoiceId: row.id, outcome: 'created', version: row.version }
}

type InvoiceRow = {
  id: string
  project_id: string
  job_id: string
  kind: string
  state: string
  scope_version: number | null
  deposit_requirement_id: string | null
  total_cents: string
  deposit_credit_cents: string
  version: number
}

const INVOICE_COLUMNS = [
  'id',
  'project_id',
  'job_id',
  'kind',
  'state',
  'scope_version',
  'deposit_requirement_id',
  'total_cents',
  'deposit_credit_cents',
  'version',
] as const

/** The quality-review gate of a job's final invoice (finance.invoice_quality_gate, replaced by TSK-0084). */
export async function qualityGate(db: Reader, jobId: string): Promise<string> {
  const r = await sql<{ gate: string | null }>`SELECT finance.invoice_quality_gate(${jobId}::uuid) AS gate`.execute(db)
  return r.rows[0]?.gate ?? 'quality_review_not_recorded'
}

async function depositMoney(db: Reader, requirementId: string | null) {
  if (!requirementId) return { verified: 0, pending: 0, waived: false, required: false }
  const r = await sql<{ verified: string; pending: string; waived: boolean; required: boolean }>`
    SELECT finance.deposit_verified_cents(d.id)::text AS verified, finance.deposit_pending_cents(d.id)::text AS pending,
           EXISTS (SELECT 1 FROM finance.deposit_waivers w WHERE w.deposit_requirement_id = d.id) AS waived, d.required
      FROM finance.deposit_requirements d WHERE d.id = ${requirementId}`.execute(db)
  const row = r.rows[0]
  return {
    verified: Number(row?.verified ?? 0),
    pending: Number(row?.pending ?? 0),
    waived: row?.waived ?? false,
    required: row?.required ?? false,
  }
}

/** What the configuration says about the issuer and payment details, and the versions it says it with. */
function issuerDetails(config: Config) {
  const name = config.get('business.name')
  const address = config.get('business.mailing_address')
  const contact = config.get('business.public_contact')
  const instructions = config.get('payment.instructions')
  const term = config.get('payment.term_default')
  const methods = config.get('payment.methods')
  return {
    name: name.state === 'CONFIGURED' ? name.value.documentName : null,
    mailingAddress: address.state === 'CONFIGURED' && address.value.lines.length ? [...address.value.lines] : null,
    phone: contact.state === 'CONFIGURED' ? contact.value.phone : null,
    email: contact.state === 'CONFIGURED' ? contact.value.email : null,
    instructions:
      instructions.state === 'CONFIGURED'
        ? {
            placeholder: instructions.value.placeholder,
            zelle: instructions.value.zelle,
            cashApp: instructions.value.cashApp,
            chime: instructions.value.chime,
            checkPayee: instructions.value.checkPayee,
          }
        : null,
    methods: methods.state === 'CONFIGURED' ? [...methods.value.methods] : null,
    versions: {
      'business.name': name.version,
      'business.mailing_address': address.state === 'CONFIGURED' ? address.version : null,
      'business.public_contact': contact.state === 'CONFIGURED' ? contact.version : null,
      'payment.instructions': instructions.state === 'CONFIGURED' ? instructions.version : null,
      'payment.term_default': term.state === 'CONFIGURED' ? term.version : null,
      'payment.methods': methods.state === 'CONFIGURED' ? methods.version : null,
    },
  }
}

/** The exceptions of a draft as the records stand now, for this caller (the Owner-only review outcome). */
async function draftExceptions(db: Reader, actor: StaffActor | null, i: InvoiceRow): Promise<InvoiceException[]> {
  const out: InvoiceExceptionCode[] = []
  const config = await loadConfig(db)
  const issuer = issuerDetails(config)
  if (i.kind === 'final') {
    const gate = await qualityGate(db, i.job_id)
    if (gate === 'blocked') out.push('QUALITY_REVIEW_BLOCKED')
    else if (gate === 'owner_may_issue') {
      if (!actor?.roles.includes('owner')) out.push('QUALITY_REVIEW_OWNER_ONLY')
    } else if (gate !== 'passed') out.push('QUALITY_REVIEW_NOT_RECORDED')
    const snap = await latestSnapshot(db, i.job_id)
    if (!snap || snap.version !== i.scope_version) out.push('SCOPE_CHANGED')
    const d = await depositMoney(db, i.deposit_requirement_id)
    if (d.pending > 0) out.push('DEPOSIT_CHECK_PENDING')
    if (d.verified > Number(i.total_cents)) out.push('DEPOSIT_EXCEEDS_TOTAL')
    if (d.required && d.waived) out.push('DEPOSIT_WAIVED')
    else if (d.required && d.verified === 0 && d.pending === 0) out.push('DEPOSIT_NOT_PAID')
    if ((await unallocatedCents(db, i.job_id)) > 0) out.push('UNALLOCATED_PAYMENT')
  } else {
    const r = await db
      .selectFrom('finance.deposit_requirements')
      .select('state')
      .where('id', '=', i.deposit_requirement_id as string)
      .executeTakeFirst()
    if (r?.state !== 'required' && r?.state !== 'partly_satisfied') out.push('DEPOSIT_NOT_DUE')
  }
  if (issuer.name === null) out.push('BUSINESS_NAME_NOT_CONFIGURED')
  if (issuer.mailingAddress === null) out.push('MAILING_ADDRESS_NOT_CONFIGURED')
  if (issuer.phone === null || issuer.email === null) out.push('PUBLIC_CONTACT_PLACEHOLDER')
  if (issuer.instructions === null || issuer.instructions.placeholder) out.push('PAYMENT_INSTRUCTIONS_PLACEHOLDER')
  return out.map((code) => ({ code, blocking: BLOCKING.has(code) }))
}

export type IssuedInvoice = {
  invoiceId: string
  jobId: string
  kind: InvoiceKind
  number: string
  totalCents: number
  depositCreditCents: number
  state: InvoiceState
  version: number
}

/** Issues a draft at the version the caller saw (see the header); every blocking exception refuses it. */
export async function issueInvoice(
  tx: Tx,
  actor: StaffActor,
  input: { invoiceId: string; expectedVersion: number },
): Promise<IssuedInvoice> {
  if (!tx.isTransaction) throw new Error('issueInvoice runs inside the business transaction (withTx)')
  const head = await tx
    .selectFrom('finance.invoices')
    .select(['job_id', 'deposit_requirement_id'])
    .where('id', '=', input.invoiceId)
    .executeTakeFirst()
  if (!head) throw new ApiError('NOT_FOUND')
  // Lock order: the deposit requirement, then the invoice.
  if (head.deposit_requirement_id)
    await tx
      .selectFrom('finance.deposit_requirements')
      .select('id')
      .where('id', '=', head.deposit_requirement_id)
      .forUpdate()
      .execute()
  const i = (await tx
    .selectFrom('finance.invoices')
    .select(INVOICE_COLUMNS)
    .where('id', '=', input.invoiceId)
    .forUpdate()
    .executeTakeFirstOrThrow()) as InvoiceRow
  if (i.version !== input.expectedVersion)
    throw new ApiError('STALE_VERSION', { current: { version: i.version, values: { state: i.state } } })
  if (i.state !== 'draft') throw conflict('INVOICE_ALREADY_ISSUED')
  const blocking = (await draftExceptions(tx, actor, i)).filter((e) => e.blocking)
  if (blocking.length)
    throw new ApiError(
      blocking.some((e) => e.code === 'BUSINESS_NAME_NOT_CONFIGURED') ? 'NOT_CONFIGURED' : 'CONFLICT',
      {
        fieldErrors: blocking.map((e) =>
          field(
            e.code.startsWith('QUALITY_REVIEW')
              ? 'qualityReview'
              : e.code.startsWith('DEPOSIT')
                ? 'deposit'
                : 'invoice',
            e.code,
          ),
        ),
      },
    )
  const config = await loadConfig(tx)
  const issuer = issuerDetails(config)
  const deposit = i.kind === 'final' ? await depositMoney(tx, i.deposit_requirement_id) : { verified: 0 }
  const project = await tx
    .selectFrom('crm.projects')
    .select('reference')
    .where('id', '=', i.project_id)
    .executeTakeFirstOrThrow()
  // The number: the project's next invoice sequence, never reused (issued invoices are never deleted).
  await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`finance.invoice_number:${i.project_id}`}, 0))`.execute(tx)
  const last = await tx
    .selectFrom('finance.invoices')
    .select((eb) => eb.fn.max('sequence').as('max'))
    .where('project_id', '=', i.project_id)
    .executeTakeFirst()
  const sequence = Number(last?.max ?? 0) + 1
  const number = `${project.reference}-I${sequence}`
  const row = await tx
    .updateTable('finance.invoices')
    .set({
      state: 'issued',
      sequence,
      number,
      issued_at: sql<Date>`now()`,
      issued_by: actor.userId,
      issuer_name: issuer.name,
      issuer_mailing_address: issuer.mailingAddress,
      public_phone: issuer.phone,
      public_email: issuer.email,
      payment_instructions: issuer.instructions ? JSON.stringify(issuer.instructions) : null,
      policy_versions: JSON.stringify(issuer.versions),
      deposit_credit_cents: deposit.verified,
    })
    .where('id', '=', i.id)
    .returning(['version'])
    .executeTakeFirstOrThrow()
  if (i.kind === 'final' && deposit.verified > 0 && i.deposit_requirement_id)
    await tx
      .insertInto('finance.invoice_deposit_credits')
      .values({
        invoice_id: i.id,
        job_id: i.job_id,
        deposit_requirement_id: i.deposit_requirement_id,
        amount_cents: deposit.verified,
      })
      .execute()
  const type = i.kind === 'final' ? INVOICE_ISSUED_EVENT : DEPOSIT_INVOICE_ISSUED_EVENT
  await outbox.add(tx, {
    type,
    aggregate: { type: 'invoice', id: i.id, version: row.version },
    payload: { kind: i.kind },
    idempotencyKey: `${type}:${i.id}`,
  })
  await syncDepositItem(tx, i.job_id)
  await announcePaidInvoices(tx, i.job_id)
  const after = await tx
    .selectFrom('finance.invoices')
    .select(['state', 'version'])
    .where('id', '=', i.id)
    .executeTakeFirstOrThrow()
  return {
    invoiceId: i.id,
    jobId: i.job_id,
    kind: i.kind as InvoiceKind,
    number,
    totalCents: Number(i.total_cents),
    depositCreditCents: deposit.verified,
    state: after.state as InvoiceState,
    version: after.version,
  }
}

/** The facts the policy needs about an invoice: its project; null when there is no such invoice. */
export async function invoiceFacts(db: Reader, invoiceId: string): Promise<Resource | null> {
  const i = await db.selectFrom('finance.invoices').select('project_id').where('id', '=', invoiceId).executeTakeFirst()
  return i ? { projectId: i.project_id } : null
}

export async function jobOfInvoice(db: Reader, invoiceId: string): Promise<string | null> {
  const i = await db.selectFrom('finance.invoices').select('job_id').where('id', '=', invoiceId).executeTakeFirst()
  return i?.job_id ?? null
}

type StaffRef = { id: string; name: string | null }

export type InvoiceLineView = {
  position: number
  kind: 'charge' | 'credit'
  source: 'estimate_line' | 'change_order' | 'deposit'
  lineKind: 'base' | 'alternate' | 'add_on' | null
  serviceCode: string | null
  description: string
  quantity: string | null
  unit: string | null
  unitPriceCents: number | null
  amountCents: number
}

export type InvoiceView = {
  id: string
  kind: InvoiceKind
  state: InvoiceState
  number: string | null
  scopeVersion: number | null
  lines: InvoiceLineView[]
  chargesCents: number
  creditLinesCents: number
  subtotalCents: number
  discount: { category: string; percentBps: number; amountCents: number } | null
  totalCents: number
  /** Pinned at issue; for a final draft, what the deposit's verified money would credit now. */
  depositCreditCents: number
  paymentTermText: string
  preparedAt: string
  issuedAt: string | null
  issuedBy: StaffRef | null
  issuer: { name: string; mailingAddress: string[] | null; phone: string | null; email: string | null } | null
  money: InvoiceMoney | null
  payments: InvoicePaymentView[]
  exceptions: InvoiceException[]
  document: 'none' | 'preparing' | 'issued'
  testMark: boolean
  version: number
  actions: { issue: boolean; recordPayment: boolean }
}

export type JobInvoicesView = {
  jobId: string
  final: InvoiceView | null
  deposit: InvoiceView | null
  /** Money of the job's payments not applied to anything: for the Owner's credit or refund decision. */
  unallocatedCents: number
  actions: { prepareFinal: boolean; prepareDeposit: boolean }
}

async function staffName(db: Reader, id: string | null): Promise<StaffRef | null> {
  if (!id) return null
  const r = await db.selectFrom('identity.staff_users').select('display_name').where('id', '=', id).executeTakeFirst()
  return { id, name: r?.display_name ?? null }
}

async function invoiceView(db: Reader, actor: StaffActor, id: string): Promise<InvoiceView> {
  const i = await db.selectFrom('finance.invoices').selectAll().where('id', '=', id).executeTakeFirstOrThrow()
  const lines = await db
    .selectFrom('finance.invoice_lines')
    .selectAll()
    .where('invoice_id', '=', id)
    .orderBy('position')
    .execute()
  const draft = i.state === 'draft'
  const row = i as unknown as InvoiceRow
  const exceptions = draft ? await draftExceptions(db, actor, row) : []
  const deposit =
    draft && i.kind === 'final'
      ? (await depositMoney(db, i.deposit_requirement_id)).verified
      : Number(i.deposit_credit_cents)
  const doc = await db
    .selectFrom('finance.invoice_documents')
    .select('id')
    .where('invoice_id', '=', id)
    .executeTakeFirst()
  const resource = { projectId: i.project_id }
  const discount = Number(i.discount_cents)
  return {
    id: i.id,
    kind: i.kind as InvoiceKind,
    state: i.state as InvoiceState,
    number: i.number,
    scopeVersion: i.scope_version,
    lines: lines.map((l) => ({
      position: l.position,
      kind: l.kind as 'charge' | 'credit',
      source: l.source as InvoiceLineView['source'],
      lineKind: l.line_kind as InvoiceLineView['lineKind'],
      serviceCode: l.service_code,
      description: l.description,
      quantity: l.quantity,
      unit: l.unit,
      unitPriceCents: l.unit_price_cents === null ? null : Number(l.unit_price_cents),
      amountCents: Number(l.amount_cents),
    })),
    chargesCents: Number(i.charges_cents),
    creditLinesCents: Number(i.credit_lines_cents),
    subtotalCents: Number(i.subtotal_cents),
    discount:
      discount > 0 && i.discount_category && i.discount_percent_bps !== null
        ? { category: i.discount_category, percentBps: i.discount_percent_bps, amountCents: discount }
        : null,
    totalCents: Number(i.total_cents),
    depositCreditCents: deposit,
    paymentTermText: i.payment_term_text,
    preparedAt: i.prepared_at.toISOString(),
    issuedAt: i.issued_at?.toISOString() ?? null,
    issuedBy: await staffName(db, i.issued_by),
    issuer: i.issuer_name
      ? {
          name: i.issuer_name,
          mailingAddress: i.issuer_mailing_address,
          phone: i.public_phone,
          email: i.public_email,
        }
      : null,
    money: draft ? null : await invoiceMoney(db, i.id),
    payments: draft ? [] : await invoicePayments(db, actor, i.id),
    exceptions,
    document: draft ? 'none' : doc ? 'issued' : 'preparing',
    testMark: i.test_mark,
    version: i.version,
    actions: {
      issue: draft && !exceptions.some((e) => e.blocking) && allows(actor, 'invoice.issue', resource),
      recordPayment:
        i.kind === 'final' &&
        (i.state === 'issued' || i.state === 'partially_paid') &&
        allows(actor, 'payment.record', { ...resource, collectedByStaffId: actor.userId }),
    },
  }
}

/** The staff view of a job's invoices; null when there is no such job. */
export async function jobInvoices(db: Reader, actor: StaffActor, jobId: string): Promise<JobInvoicesView | null> {
  const job = await jobFacts(db, jobId)
  if (!job) return null
  const rows = await db
    .selectFrom('finance.invoices')
    .select(['id', 'kind'])
    .where('job_id', '=', jobId)
    .where('state', '<>', 'voided')
    .execute()
  const final = rows.find((r) => r.kind === 'final')
  const deposit = rows.find((r) => r.kind === 'deposit')
  const resource = { projectId: job.project_id }
  const mayPrepare = allows(actor, 'invoice.issue', resource)
  const finalView = final ? await invoiceView(db, actor, final.id) : null
  const depositView = deposit ? await invoiceView(db, actor, deposit.id) : null
  return {
    jobId,
    final: finalView,
    deposit: depositView,
    unallocatedCents: await unallocatedCents(db, jobId),
    actions: {
      prepareFinal: mayPrepare && (!finalView || finalView.state === 'draft'),
      prepareDeposit:
        mayPrepare &&
        job.required === true &&
        (job.deposit_state === 'required' || job.deposit_state === 'partly_satisfied') &&
        (!depositView || depositView.state === 'draft'),
    },
  }
}

// ------------------------------------------------------------------------------------------------ customer

/** HH-PORT-10: an issued invoice is the current one; a voided one is superseded (by its reissue). */
export const CUSTOMER_INVOICE_STATUSES = ['current', 'superseded'] as const

export type CustomerInvoiceItem = {
  number: string
  kind: InvoiceKind
  status: (typeof CUSTOMER_INVOICE_STATUSES)[number]
  state: Exclude<InvoiceState, 'draft'>
  issuedAt: Date
  totalCents: number
  /** What is still owed from confirmed payments and credits (a pending check does not reduce it). */
  balanceCents: number
  pendingCents: number
  document: 'preparing' | 'issued'
}

/** The issued invoices of a project as its verified customer sees them, newest first (drafts never). */
export async function customerInvoiceList(db: Reader, projectId: string): Promise<CustomerInvoiceItem[]> {
  const rows = await db
    .selectFrom('finance.invoices as i')
    .leftJoin('finance.invoice_documents as d', 'd.invoice_id', 'i.id')
    .select(['i.id', 'i.number', 'i.kind', 'i.state', 'i.issued_at', 'i.total_cents', 'd.id as document_id'])
    .where('i.project_id', '=', projectId)
    .where('i.state', '<>', 'draft')
    .orderBy('i.issued_at', 'desc')
    .execute()
  const out: CustomerInvoiceItem[] = []
  for (const r of rows) {
    if (!r.number || !r.issued_at) continue
    const m = await invoiceMoney(db, r.id)
    out.push({
      number: r.number,
      kind: r.kind as InvoiceKind,
      status: r.state === 'voided' ? 'superseded' : 'current',
      state: r.state as CustomerInvoiceItem['state'],
      issuedAt: r.issued_at,
      totalCents: Number(r.total_cents),
      balanceCents: m.remainingCents,
      pendingCents: m.pendingCents,
      document: r.document_id ? 'issued' : 'preparing',
    })
  }
  return out
}
