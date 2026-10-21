// The approval receipt (TSK-0058; HH-EST-12, HH-EST-10, HH-DATA-03, HH-BASE-06, HH-PORT-10, ENT-Document,
// ENT-Approval, ENT-JobScopeSnapshot, FACT-AUTOMATIC-MESSAGES #9, OWN-DEC-105, OWN-DEC-104, OWN-DEC-126, OWN-DEC-127,
// T33, T35, RULE-LANGUAGES, RULE-NO-INVENTED-FACTS, RULE-MONEY-CENTS).
// - The document: one combined English PDF per approval (PROPOSED: OWN-DEC-105 allows "one combined PDF"): the receipt
//   (estimate number and version, when, the name the customer typed, how), the approved scope and amounts exactly as
//   the approval and the job's scope snapshot recorded them (never recomputed from the catalog, a policy or a default,
//   HH-EST-10), the payment term in the words shown, the fingerprints the approval pinned (the version's content and,
//   for an uploaded estimate, the published customer PDF's SHA-256, which stays served beside it unchanged), and the
//   full wording of the estimate terms version accepted. The issuer and dates come from configuration at the moment
//   it is issued; nothing that is NOT CONFIGURED is invented ("Not provided"; no mailing-address line while missing).
//   The approval's own TEST mark puts "TEST — not a real invoice or estimate" on every page (OWN-DEC-126).
// - Issued once, by the automation approval_receipt.issue from the committed estimate.approved event: rendered, stored
//   in private object storage under an opaque key, and recorded with its SHA-256 (migration 0047: one per approval,
//   never changed or deleted). A retried job finds the issued receipt and does nothing; storage that is NOT CONFIGURED
//   or failing retries and, at the last attempt, is a failed job the Office owns in System health. The approval
//   itself is never undone by anything here.
// - The message: approval.receipt, an automatic message on the configured list (FACT-AUTOMATIC-MESSAGES #9), once per
//   approval and destination (email, and text when the customer gave a number). Its wording has no owner approval and
//   no template version exists, so every delivery records template_not_configured (never sent) and opens one staff
//   delivery issue with Retry, while the approval and the receipt stay as they are. The secure project link it would
//   carry is not supplied (as for estimate.ready), so no invented link is ever sent. The PDF is not attached: email
//   bodies carry no amounts and no private details; the customer reads and downloads it through verified project
//   access (PROPOSED, OQ-APPROVAL-RECEIPT-MESSAGE).
// - The next step (OWN-DEC-105, HH-EST-12): deposit required and not satisfied: "Estimate approved—pay your deposit to
//   proceed with scheduling."; otherwise "Estimate approved—choose your work appointment." A deposit is satisfied or
//   waived only by records TSK-0059 builds; until they exist a required deposit stays due (never assumed paid).
import { createHash, randomUUID } from 'node:crypto'
import type { Db, Tx } from '@handyhub/db'
import { customerStatus, type CustomerStep, type ProjectState, type RequestState } from '@handyhub/domain'
import { estimateTermsDocument, legalDocument, type EstimateTermsDocument } from '@handyhub/domain/legal'
import { customerTranslator, type CustomerKey } from '@handyhub/i18n'
import { cents, formatUsd } from '@handyhub/money'
import type { Automation } from '../../platform/automation.js'
import { loadConfig } from '../../platform/config/index.js'
import type { ObjectStorage } from '../../providers/index.js'
import { notificationAutomation, type Destination, type NotificationProviders } from '../notifications/index.js'
import { ESTIMATE_APPROVED_EVENT } from './approval.js'
import { discountRowLabel, renderPdfModel, type CustomerPdfModel, type PdfBlock } from './customer-pdf.js'
import { DOCUMENT_URL_SECONDS, type CustomerEstimateLine } from './projections.js'
import { documentDetails } from './readiness.js'

type Reader = Db | Tx

export const APPROVAL_RECEIPT_MESSAGE_KEY = 'approval.receipt'
/** The layout version recorded with each issued receipt (its bytes never change once issued). */
export const APPROVAL_RECEIPT_RENDERER = 1
const PDF_TYPE = 'application/pdf'

const t = (key: CustomerKey, values?: Record<string, string | number>) => customerTranslator().t(key, values)
const usd = (c: number) => formatUsd(cents(c))
const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')

const TEXT_LISTS = [
  ['assumptions', 'estimatePdf.assumptions'],
  ['exclusions', 'estimatePdf.exclusions'],
  ['customerResponsibilities', 'estimatePdf.customerResponsibilities'],
  ['dependencies', 'estimatePdf.dependencies'],
  ['scheduleAssumptions', 'estimatePdf.scheduleAssumptions'],
] as const
type TextKey = (typeof TEXT_LISTS)[number][0]
const KIND: Record<string, CustomerKey> = {
  alternate: 'estimatePdf.kind.alternate',
  add_on: 'estimatePdf.kind.add_on',
}

/** Everything the receipt says, from the stored approval, its snapshot and the configuration when issued. */
export type ApprovalReceiptInput = {
  readonly estimateNumber: string
  readonly version: number
  readonly authoringMethod: 'written' | 'uploaded'
  /** SHA-256 of the version's canonical customer content, as the approval pinned it. */
  readonly contentSha256: string
  /** Uploaded estimates: the SHA-256 of the published customer PDF the approval pinned. */
  readonly documentSha256: string | null
  /** The approved lines (base and selected options) as the job's scope snapshot holds them. */
  readonly lines: readonly CustomerEstimateLine[]
  readonly texts: Readonly<Record<TextKey, readonly string[]>>
  readonly subtotalCents: number
  readonly discount: { readonly category: string; readonly percentBps: number; readonly amountCents: number } | null
  readonly totalCents: number
  readonly depositCents: number | null
  /** The payment term in the words the approval recorded. */
  readonly paymentTermText: string
  readonly approvedAt: Date
  /** The name the customer typed, exactly as recorded (never translated). */
  readonly fullName: string
  readonly accessVia: 'grant' | 'account'
  readonly terms: { readonly document: EstimateTermsDocument; readonly sha256: string }
  readonly issuerName: string | null
  readonly mailingAddress: readonly string[] | null
  readonly recipient: { readonly name: string; readonly property: string }
  readonly timeZone: string | null
  readonly testMark: boolean
}

/** A time in English in the business time zone ("October 21, 2026 at 3:04 PM EDT"), or UTC and saying so. */
export function receiptTime(at: Date, timeZone: string | null): string {
  return (
    new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timeZone ?? 'UTC',
      timeZoneName: 'short',
    })
      .format(at)
      // The standard PDF fonts have no narrow or no-break spaces.
      .replace(/[\u202f\u00a0]/g, ' ')
  )
}

function dayText(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, d)),
  )
}

/** The ICU values of a terms document: whole numbers as they are, an amount (`fooCents`) as en-US currency. */
function termsValues(doc: EstimateTermsDocument): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  for (const [name, value] of Object.entries(doc.values)) {
    if (name.endsWith('Cents')) out[name.slice(0, -'Cents'.length)] = usd(value)
    else out[name] = value
  }
  return out
}

/** The terms wording as PDF blocks: the version line, the summary and the numbered sections. */
function termsBlocks(doc: EstimateTermsDocument): PdfBlock[] {
  const values = termsValues(doc)
  const tx = (key: string) => t(key as CustomerKey, values)
  const blocks: PdfBlock[] = [
    { kind: 'heading', text: tx(doc.title) },
    {
      kind: 'text',
      text: t('legal.estimateTerms.version', {
        label: doc.label,
        preparedOn: dayText(doc.preparedOn),
        documentId: doc.documentId,
      }),
    },
    { kind: 'text', text: tx(doc.summary) },
  ]
  doc.sections.forEach((s, i) => {
    blocks.push({ kind: 'heading', text: `${i + 1}. ${tx(s.heading)}` })
    for (const b of s.blocks) {
      if (b.kind === 'p') blocks.push({ kind: 'text', text: tx(b.key) })
      else if (b.kind === 'list') blocks.push({ kind: 'list', items: b.keys.map(tx) })
      else if (b.kind === 'link') blocks.push({ kind: 'text', text: `${tx(b.key)} (${legalDocument(b.to).path})` })
      // The estimate terms hold no pending or contact block: nothing is shown in their place.
    }
  })
  return blocks
}

/** The receipt's content. Pure: the same input always gives the same model. */
export function approvalReceiptModel(input: ApprovalReceiptInput): CustomerPdfModel {
  const notProvided = t('estimatePdf.notProvided')
  const facts: { label: string; value: string }[] = [
    { label: t('estimatePdf.issuer'), value: input.issuerName ?? notProvided },
  ]
  if (input.mailingAddress) facts.push({ label: t('estimatePdf.address'), value: input.mailingAddress.join(', ') })
  facts.push(
    { label: t('estimatePdf.preparedFor'), value: input.recipient.name },
    { label: t('estimatePdf.property'), value: input.recipient.property },
    {
      label: t('approvalReceipt.estimate'),
      value: t('approvalReceipt.estimateVersion', { number: input.estimateNumber, version: input.version }),
    },
    { label: t('approvalReceipt.approvedAt'), value: receiptTime(input.approvedAt, input.timeZone) },
    { label: t('approvalReceipt.approvedBy'), value: input.fullName },
    {
      label: t('approvalReceipt.method'),
      value: t(input.accessVia === 'account' ? 'approvalReceipt.method.account' : 'approvalReceipt.method.grant'),
    },
  )

  const head = [
    t('estimatePdf.column.description'),
    t('estimatePdf.column.quantity'),
    t('estimatePdf.column.unitPrice'),
    t('estimatePdf.column.amount'),
  ] as const
  const rows = input.lines.map((l) => {
    const description = l.description ?? notProvided
    const kind = KIND[l.kind]
    return [
      kind ? `${t(kind)}: ${description}` : description,
      l.quantity === null ? notProvided : [l.quantity, l.unit].filter(Boolean).join(' '),
      l.unitPriceCents === null ? notProvided : usd(l.unitPriceCents),
      l.amountCents === null ? notProvided : usd(l.amountCents),
    ] as const
  })

  const totals = [{ label: t('estimatePdf.subtotal'), value: usd(input.subtotalCents), strong: false }]
  if (input.discount)
    totals.push({
      label: discountRowLabel(input.discount),
      value: `-${usd(input.discount.amountCents)}`,
      strong: false,
    })
  totals.push({ label: t('estimatePdf.total'), value: usd(input.totalCents), strong: true })
  totals.push({
    label: t('estimatePdf.deposit'),
    value: input.depositCents === null ? t('approvalReceipt.depositNotRequired') : usd(input.depositCents),
    strong: false,
  })

  const blocks: PdfBlock[] = [
    { kind: 'facts', rows: facts },
    { kind: 'heading', text: t('approvalReceipt.scope') },
    { kind: 'table', head, rows },
    { kind: 'heading', text: t('approvalReceipt.totals') },
    { kind: 'totals', rows: totals },
  ]
  for (const [key, label] of TEXT_LISTS) {
    const items = input.texts[key]
    if (items.length) blocks.push({ kind: 'heading', text: t(label) }, { kind: 'list', items: [...items] })
  }
  const evidence: { label: string; value: string }[] = [
    { label: t('estimatePdf.paymentTerm'), value: input.paymentTermText },
    {
      label: t('estimatePdf.terms'),
      value: t('approvalReceipt.termsVersion', {
        label: input.terms.document.label,
        documentId: input.terms.document.documentId,
      }),
    },
    { label: t('approvalReceipt.termsFingerprint'), value: input.terms.sha256 },
    { label: t('approvalReceipt.contentFingerprint'), value: input.contentSha256 },
  ]
  if (input.authoringMethod === 'uploaded')
    evidence.push({
      label: t('estimatePdf.document'),
      value: input.documentSha256 ? t('estimatePdf.documentPdf', { sha256: input.documentSha256 }) : notProvided,
    })
  blocks.push({ kind: 'heading', text: t('approvalReceipt.record') }, { kind: 'facts', rows: evidence })
  blocks.push(...termsBlocks(input.terms.document))

  return {
    mark: input.testMark ? t('estimatePdf.testMark') : null,
    title: t('approvalReceipt.title', { number: input.estimateNumber }),
    footer: t('approvalReceipt.footer', { number: input.estimateNumber, version: input.version }),
    blocks,
  }
}

/** Renders the receipt PDF; deterministic (the metadata date is the approval's server time). */
export function renderApprovalReceipt(input: ApprovalReceiptInput, options: { compress?: boolean } = {}) {
  return renderPdfModel(approvalReceiptModel(input), { author: input.issuerName, createdAt: input.approvedAt }, options)
}

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

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

/**
 * The receipt input of one approval from its own records (the approval, the job's first scope snapshot, the version's
 * discount category, the project's customer and property) and the configuration now; null when the approval does not
 * exist or its terms are not a document this software holds. The caller authorizes the read.
 */
export async function approvalReceiptInput(db: Reader, approvalId: string): Promise<ApprovalReceiptInput | null> {
  const a = await db
    .selectFrom('estimating.approvals as a')
    .innerJoin('estimating.estimate_versions as v', 'v.id', 'a.version_id')
    .innerJoin('estimating.estimates as e', 'e.id', 'a.estimate_id')
    .innerJoin('work.jobs as j', 'j.approval_id', 'a.id')
    .innerJoin('work.job_scope_snapshots as s', (jn) => jn.onRef('s.job_id', '=', 'j.id').on('s.version', '=', 1))
    .innerJoin('crm.projects as p', 'p.id', 'a.project_id')
    .innerJoin('crm.customers as c', 'c.id', 'p.customer_id')
    .innerJoin('crm.properties as pr', 'pr.id', 'p.property_id')
    .select([
      'a.version',
      'a.authoring_method',
      'a.content_sha256',
      'a.document_sha256',
      'a.subtotal_cents',
      'a.discount_cents',
      'a.total_cents',
      'a.deposit_cents',
      'a.payment_term_text',
      'a.created_at',
      'a.full_name',
      'a.access_via',
      'a.terms_document_id',
      'a.terms_sha256',
      'a.test_mark',
      'v.discount_category',
      'v.discount_percent_bps',
      'e.number',
      's.lines',
      's.texts',
      'c.display_name',
      'pr.street',
      'pr.unit',
      'pr.city',
      'pr.state as property_state',
      'pr.zip',
    ])
    .where('a.id', '=', approvalId)
    .executeTakeFirst()
  if (!a) return null
  const doc = estimateTermsDocument(a.terms_document_id)
  // An approval pins only terms whose wording this software holds with that hash (approval.ts); anything else is
  // never presented as the accepted wording.
  if (!doc || doc.contentSha256 !== a.terms_sha256) return null
  const config = await loadConfig(db)
  const details = documentDetails(config)
  const zone = config.get('business.timezone')
  const texts = (a.texts ?? {}) as Record<string, unknown>
  const discountCents = Number(a.discount_cents)
  return {
    estimateNumber: a.number,
    version: a.version,
    authoringMethod: a.authoring_method === 'uploaded' ? 'uploaded' : 'written',
    contentSha256: a.content_sha256,
    documentSha256: a.document_sha256,
    lines: (a.lines as SnapshotLine[]).map((l) => ({
      position: l.position,
      kind: l.kind,
      serviceCode: l.serviceCode,
      description: l.description,
      quantity: l.quantity,
      unit: l.unit,
      unitPriceCents: l.unitPriceCents === null ? null : cents(l.unitPriceCents),
      amountCents: l.amountCents === null ? null : cents(l.amountCents),
    })),
    texts: Object.fromEntries(TEXT_LISTS.map(([k]) => [k, strings(texts[k])])) as Record<TextKey, string[]>,
    subtotalCents: Number(a.subtotal_cents),
    discount:
      discountCents > 0 && a.discount_category && a.discount_percent_bps !== null
        ? { category: a.discount_category, percentBps: a.discount_percent_bps, amountCents: discountCents }
        : null,
    totalCents: Number(a.total_cents),
    depositCents: a.deposit_cents === null ? null : Number(a.deposit_cents),
    paymentTermText: a.payment_term_text,
    approvedAt: a.created_at,
    fullName: a.full_name,
    accessVia: a.access_via === 'account' ? 'account' : 'grant',
    terms: { document: doc, sha256: a.terms_sha256 },
    issuerName: details.issuerName,
    mailingAddress: details.mailingAddress,
    recipient: {
      name: a.display_name,
      property: `${a.street}${a.unit ? `, ${a.unit}` : ''}, ${a.city}, ${a.property_state} ${a.zip}`,
    },
    timeZone: zone.state === 'CONFIGURED' ? zone.value.zone : null,
    testMark: a.test_mark,
  }
}

export class ReceiptError extends Error {
  override name = 'ReceiptError'
}

/**
 * Issues the receipt of one approval, once: renders it, stores it under a new opaque key and records it with its
 * SHA-256. An approval that already has its receipt is left as it is ('exists'). Runs in the caller's transaction.
 */
export async function issueApprovalReceipt(
  tx: Tx,
  storage: ObjectStorage | null,
  approvalId: string,
): Promise<{ outcome: 'issued' | 'exists'; receiptId: string } | null> {
  const approval = await tx
    .selectFrom('estimating.approvals')
    .select(['id', 'project_id', 'terms_document_id', 'terms_sha256', 'test_mark'])
    .where('id', '=', approvalId)
    .forShare()
    .executeTakeFirst()
  if (!approval) return null
  const existing = await tx
    .selectFrom('estimating.approval_receipts')
    .select('id')
    .where('approval_id', '=', approvalId)
    .executeTakeFirst()
  if (existing) return { outcome: 'exists', receiptId: existing.id }
  const input = await approvalReceiptInput(tx, approvalId)
  if (!input) throw new ReceiptError('the approval has no receipt content (terms wording not held)')
  if (!storage) throw new ReceiptError('storage_not_configured')
  const bytes = await renderApprovalReceipt(input)
  const key = `estimates/receipts/${randomUUID()}`
  await storage.put(key, bytes, PDF_TYPE)
  const row = await tx
    .insertInto('estimating.approval_receipts')
    .values({
      approval_id: approval.id,
      project_id: approval.project_id,
      object_key: key,
      content_type: PDF_TYPE,
      byte_size: bytes.length,
      sha256: sha256(bytes),
      terms_document_id: approval.terms_document_id,
      terms_sha256: approval.terms_sha256,
      test_mark: approval.test_mark,
      renderer_version: APPROVAL_RECEIPT_RENDERER,
    })
    .onConflict((oc) => oc.column('approval_id').doNothing())
    .returning('id')
    .executeTakeFirst()
  if (row) return { outcome: 'issued', receiptId: row.id }
  const winner = await tx
    .selectFrom('estimating.approval_receipts')
    .select('id')
    .where('approval_id', '=', approvalId)
    .executeTakeFirstOrThrow()
  return { outcome: 'exists', receiptId: winner.id }
}

/** The automation that issues the receipt of each approval (HH-AUTO-01). */
export function approvalReceiptDocumentAutomation(storage: ObjectStorage | null): Automation {
  return {
    name: 'approval_receipt.issue',
    trigger: { kind: 'event', eventTypes: [ESTIMATE_APPROVED_EVENT] },
    identity: 'system.documents',
    inputs: {
      description: 'the approval id of the estimate.approved event; the approval and its snapshot',
      version: 1,
    },
    idempotency: 'one receipt per approval (unique approval_id); an approval with its receipt is left as it is',
    effect: 'renders the approval receipt PDF, stores it once in private object storage and records its SHA-256',
    retry: { maxAttempts: 5, baseDelayMs: 5_000, maxDelayMs: 300_000 },
    timeoutMs: 60_000,
    exceptionOwner: 'office',
    audit: { action: 'approval_receipt.issued' },
    handle: async ({ tx, job }) => {
      const id = job.target.id
      if (!id) return 'cancelled'
      const out = await issueApprovalReceipt(tx, storage, id)
      if (!out || out.outcome === 'exists') return 'cancelled'
      return 'done'
    },
  }
}

/** The automatic approval receipt message (FACT-AUTOMATIC-MESSAGES #9): once per approval and destination. */
export function approvalReceiptNoticeAutomation(deps: { providers: NotificationProviders }): Automation {
  return notificationAutomation({
    messageKey: APPROVAL_RECEIPT_MESSAGE_KEY,
    providers: deps.providers,
    resolve: async ({ tx, job }) => {
      const id = job.target.id
      if (!id) return 'stale'
      const a = await tx
        .selectFrom('estimating.approvals as a')
        .innerJoin('intake.requests as r', 'r.project_id', 'a.project_id')
        .innerJoin('crm.contacts as c', 'c.id', 'r.contact_id')
        .select([
          'a.id',
          'a.project_id',
          'r.reference',
          'r.responsible_staff_id',
          'c.id as contactId',
          'c.email',
          'c.phone_e164',
          'c.preferred_channel',
        ])
        .where('a.id', '=', id)
        .executeTakeFirst()
      if (!a) return 'stale'
      // Email, and text when the customer gave a number (owner answer 2026-10-05T17:41); consent is rechecked at
      // send time by the notifications module (a text needs the SMS opt-in).
      const destinations: Destination[] = []
      if (a.email)
        destinations.push({
          channel: 'email',
          destination: a.email,
          permission: a.preferred_channel === 'email' ? 'preferred' : 'permitted',
        })
      if (a.phone_e164)
        destinations.push({
          channel: 'sms',
          destination: a.phone_e164,
          permission: a.preferred_channel === 'text' ? 'preferred' : 'permitted',
        })
      return {
        subjectKey: `estimate_approval:${a.id}`,
        record: { type: 'estimate_approval', id: a.id },
        recipients: [{ kind: 'customer_contact', id: a.contactId, destinations }],
        // The secure project link is not supplied: no truthful link exists for this message yet (see the header).
        values: {},
        failureItem: { reference: a.reference, projectId: a.project_id, assignedStaffId: a.responsible_staff_id },
      }
    },
  })
}

export type ReceiptView =
  { state: 'preparing' } | { state: 'issued'; issuedAt: Date; byteSize: number; url: string | null }

/**
 * The receipt of the approval of a version, for a caller who may already read that version: issued (with a
 * short-lived signed link while storage is configured), or still being prepared; null when the version is not
 * approved.
 */
export async function receiptOfVersion(
  db: Reader,
  versionId: string,
  storage: ObjectStorage | null,
): Promise<ReceiptView | null> {
  const a = await db
    .selectFrom('estimating.approvals as a')
    .leftJoin('estimating.approval_receipts as r', 'r.approval_id', 'a.id')
    .select(['a.id', 'r.object_key', 'r.byte_size', 'r.issued_at'])
    .where('a.version_id', '=', versionId)
    .executeTakeFirst()
  if (!a) return null
  if (!a.object_key || a.byte_size === null || !a.issued_at) return { state: 'preparing' }
  return {
    state: 'issued',
    issuedAt: a.issued_at,
    byteSize: a.byte_size,
    url: storage ? await storage.signedGetUrl(a.object_key, { expiresInSeconds: DOCUMENT_URL_SECONDS }) : null,
  }
}

/** The two next steps after an approval (OWN-DEC-105). */
export type ApprovalNextStep = Extract<CustomerStep, 'deposit_due' | 'choose_work_appointment'>

/**
 * The approval facts of a project for the customer status (HH-PORT-02): approved, and whether its required deposit is
 * still due. TSK-0059 records deposit payments and the owner's waiver; until then a required deposit is due.
 */
export async function approvalFacts(
  db: Reader,
  projectId: string,
): Promise<{ estimateApproved: boolean; depositDue: boolean }> {
  const a = await db
    .selectFrom('estimating.approvals')
    .select('deposit_state')
    .where('project_id', '=', projectId)
    .orderBy('created_at', 'desc')
    .limit(1)
    .executeTakeFirst()
  return { estimateApproved: a !== undefined, depositDue: a?.deposit_state === 'required' }
}

/**
 * The next step the customer sees after approving: the project's own status (the same records the Overview reads),
 * while it is at the approval stage; null once the project has moved on (a later stage names its own step).
 */
export async function approvalNextStep(db: Reader, projectId: string): Promise<ApprovalNextStep | null> {
  const p = await db
    .selectFrom('crm.projects as p')
    .innerJoin('intake.requests as r', 'r.project_id', 'p.id')
    .select(['p.state as project_state', 'r.state as request_state'])
    .where('p.id', '=', projectId)
    .executeTakeFirst()
  if (!p) return null
  const status = customerStatus({
    requestState: p.request_state as RequestState,
    projectState: p.project_state as ProjectState,
    ...(await approvalFacts(db, projectId)),
  })
  return status.step === 'deposit_due' || status.step === 'choose_work_appointment' ? status.step : null
}
