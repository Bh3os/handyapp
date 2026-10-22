// The issued invoice's English PDF (TSK-0085; HH-FIN-04, HH-FIN-10, HH-CUS-07, T58, ENT-Document, FACT-BUSINESS-NAME,
// FACT-BUSINESS-ADDRESS, FACT-PUBLIC-CONTACT, FACT-PAYMENT-DUE, FACT-PAYMENT-INSTRUCTIONS, FACT-NO-SURCHARGE,
// FACT-TAX-NO-LINE, FACT-WARRANTY, OWN-DEC-89, OWN-DEC-126, OWN-DEC-145, OWN-DEC-203, RULE-LANGUAGES,
// RULE-MONEY-CENTS, RULE-NO-INVENTED-FACTS).
// - Everything comes from the issued invoice as it was pinned: the number, issuer, public contact, payment
//   instructions, lines and totals; nothing is recomputed from the catalog, a policy or a default. The customer and
//   the property are read from the project's records when the PDF is rendered (they are the record the invoice is for).
// - Totals: the charges, the credit lines (a reduction shown as a positive magnitude subtracted, OWN-DEC-203), the
//   discount as its own row before the total (OWN-DEC-145), the total, the deposit credit and the balance due at
//   issue. No tax line (FACT-TAX-NO-LINE; nothing is said about tax either way), no surcharge, no late fee.
// - The mailing-address line exists only once it is configured; a missing phone or email is a labelled placeholder
//   and never a working contact (FACT-PUBLIC-CONTACT); the payment handles are labelled "Placeholder — not a payment
//   destination" while they are placeholders (HH-FIN-10). Cards name Square; no surcharge is charged or mentioned
//   (OWN-DEC-89, HH-CUS-07: customer text never mentions one).
// - The 90-day workmanship warranty (FACT-WARRANTY) in the words of the estimate terms, with their note that the
//   wording and any exclusions wait for attorney review (OQ-ATTORNEY-TERMS); no exclusion is invented.
// - Outside production every page carries "TEST — not a real invoice or estimate" (OWN-DEC-126). English only.
// - Deterministic: laid out by the estimate PDF's renderer (estimates/customer-pdf.ts) with the issue time as the
//   document date, so the same issued invoice always gives the same bytes.
import type { Db, Tx } from '@handyhub/db'
import { customerTranslator, type CustomerKey } from '@handyhub/i18n'
import { cents, formatUsd } from '@handyhub/money'
import { loadConfig } from '../../platform/config/index.js'
import { discountRowLabel, renderPdfModel, type CustomerPdfModel, type PdfBlock } from '../estimates/customer-pdf.js'

type Reader = Db | Tx

/** The layout version recorded with each stored invoice PDF (its bytes never change once stored). */
export const INVOICE_PDF_RENDERER = 1

const t = (key: CustomerKey, values?: Record<string, string | number>) => customerTranslator().t(key, values)
const usd = (c: number) => formatUsd(cents(c))

export type InvoicePdfInput = {
  readonly number: string
  readonly kind: 'deposit' | 'final'
  readonly issuedAt: Date
  readonly issuerName: string
  readonly mailingAddress: readonly string[] | null
  readonly phone: string | null
  readonly email: string | null
  readonly estimate: { readonly number: string; readonly version: number }
  readonly recipient: { readonly name: string; readonly property: string }
  readonly lines: readonly {
    readonly kind: 'charge' | 'credit'
    readonly lineKind: string | null
    readonly description: string
    readonly quantity: string | null
    readonly unit: string | null
    readonly unitPriceCents: number | null
    readonly amountCents: number
  }[]
  readonly chargesCents: number
  readonly creditLinesCents: number
  readonly discount: { readonly category: string; readonly percentBps: number; readonly amountCents: number } | null
  readonly totalCents: number
  readonly depositCreditCents: number
  readonly paymentTermText: string
  /** The accepted methods as issued (payment.methods); null while NOT CONFIGURED. */
  readonly methods: readonly string[] | null
  readonly instructions: {
    readonly placeholder: boolean
    readonly zelle: string
    readonly cashApp: string
    readonly chime: string
    readonly checkPayee: string
  } | null
  readonly testMark: boolean
  readonly timeZone: string | null
}

const KIND: Record<string, CustomerKey> = {
  alternate: 'estimatePdf.kind.alternate',
  add_on: 'estimatePdf.kind.add_on',
}

function dateText(at: Date, timeZone: string | null): string {
  const text = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: timeZone ?? 'UTC',
  }).format(at)
  return timeZone ? text : `${text} (UTC)`
}

/** The PDF's content for one issued invoice. Pure: the same input always gives the same model. */
export function invoicePdfModel(input: InvoicePdfInput): CustomerPdfModel {
  const notProvided = t('estimatePdf.notProvided')
  const placeholder = t('invoicePdf.contactPlaceholder')
  const facts: { label: string; value: string }[] = [{ label: t('estimatePdf.issuer'), value: input.issuerName }]
  if (input.mailingAddress) facts.push({ label: t('estimatePdf.address'), value: input.mailingAddress.join(', ') })
  facts.push(
    { label: t('invoicePdf.phone'), value: input.phone ?? placeholder },
    { label: t('invoicePdf.email'), value: input.email ?? placeholder },
    { label: t('invoicePdf.billedTo'), value: input.recipient.name },
    { label: t('estimatePdf.property'), value: input.recipient.property },
    { label: t('invoicePdf.number'), value: input.number },
    { label: t('invoicePdf.issued'), value: dateText(input.issuedAt, input.timeZone) },
    { label: t('invoicePdf.estimate'), value: t('invoicePdf.estimateRef', input.estimate) },
    { label: t('invoicePdf.due'), value: input.paymentTermText },
  )

  const head = [
    t('estimatePdf.column.description'),
    t('estimatePdf.column.quantity'),
    t('estimatePdf.column.unitPrice'),
    t('estimatePdf.column.amount'),
  ] as const
  const rows = input.lines.map((l) => {
    const kind = l.lineKind ? KIND[l.lineKind] : undefined
    const description = l.kind === 'credit' ? t('invoicePdf.creditLine', { description: l.description }) : l.description
    return [
      kind ? `${t(kind)}: ${description}` : description,
      l.quantity === null ? '' : [l.quantity, l.unit].filter(Boolean).join(' '),
      l.unitPriceCents === null ? '' : usd(l.unitPriceCents),
      l.kind === 'credit' ? `-${usd(l.amountCents)}` : usd(l.amountCents),
    ] as const
  })

  const totals: { label: string; value: string; strong: boolean }[] = [
    { label: t('estimatePdf.subtotal'), value: usd(input.chargesCents), strong: false },
  ]
  if (input.creditLinesCents > 0)
    totals.push({ label: t('invoicePdf.credits'), value: `-${usd(input.creditLinesCents)}`, strong: false })
  if (input.discount)
    totals.push({
      label: discountRowLabel(input.discount),
      value: `-${usd(input.discount.amountCents)}`,
      strong: false,
    })
  totals.push({ label: t('estimatePdf.total'), value: usd(input.totalCents), strong: true })
  if (input.depositCreditCents > 0)
    totals.push({ label: t('invoicePdf.depositCredit'), value: `-${usd(input.depositCreditCents)}`, strong: false })
  totals.push({
    label: t('invoicePdf.balanceAtIssue'),
    value: usd(input.totalCents - input.depositCreditCents),
    strong: true,
  })

  // HH-FIN-10: each accepted method; handles only as configured, labelled while they are placeholders.
  const methods = input.methods ?? []
  const handle = (value: string) =>
    input.instructions?.placeholder ? t('invoicePdf.placeholderHandle', { value }) : value
  const pay: string[] = []
  if (methods.includes('square_payment_link')) pay.push(t('invoicePdf.pay.card'))
  if (methods.includes('square_tap_to_pay')) pay.push(t('invoicePdf.pay.tapToPay'))
  if (methods.includes('cash')) pay.push(t('invoicePdf.pay.cash'))
  if (input.instructions) {
    if (methods.includes('check')) pay.push(t('invoicePdf.pay.check', { payee: handle(input.instructions.checkPayee) }))
    if (methods.includes('zelle')) pay.push(t('invoicePdf.pay.zelle', { handle: handle(input.instructions.zelle) }))
    if (methods.includes('cash_app'))
      pay.push(t('invoicePdf.pay.cashApp', { handle: handle(input.instructions.cashApp) }))
    if (methods.includes('chime')) pay.push(t('invoicePdf.pay.chime', { handle: handle(input.instructions.chime) }))
  }

  const blocks: PdfBlock[] = [
    { kind: 'facts', rows: facts },
    { kind: 'heading', text: t('invoicePdf.lines') },
    { kind: 'table', head, rows },
    { kind: 'heading', text: t('estimatePdf.totals') },
    { kind: 'totals', rows: totals },
    { kind: 'heading', text: t('invoicePdf.howToPay') },
    pay.length ? { kind: 'list', items: pay } : { kind: 'text', text: notProvided },
  ]
  if (input.kind === 'final')
    blocks.push(
      { kind: 'heading', text: t('legal.terms.warranty.heading') },
      { kind: 'text', text: t('legal.terms.warranty.text') },
      { kind: 'text', text: t('legal.terms.warranty.pending') },
    )
  return {
    mark: input.testMark ? t('estimatePdf.testMark') : null,
    title: t(input.kind === 'deposit' ? 'invoicePdf.titleDeposit' : 'invoicePdf.title', { number: input.number }),
    footer: t('invoicePdf.footer', { number: input.number }),
    blocks,
  }
}

/** Renders the invoice PDF; deterministic (the metadata date is the invoice's issue time). */
export function renderInvoicePdf(input: InvoicePdfInput, options: { compress?: boolean } = {}) {
  return renderPdfModel(invoicePdfModel(input), { author: input.issuerName, createdAt: input.issuedAt }, options)
}

type Instructions = NonNullable<InvoicePdfInput['instructions']>

/** The PDF input of one issued invoice from its own records; null for a draft or an unknown invoice. */
export async function invoicePdfInput(db: Reader, invoiceId: string): Promise<InvoicePdfInput | null> {
  const i = await db
    .selectFrom('finance.invoices as i')
    .innerJoin('estimating.approvals as a', 'a.id', 'i.approval_id')
    .innerJoin('estimating.estimates as e', 'e.id', 'a.estimate_id')
    .innerJoin('crm.projects as p', 'p.id', 'i.project_id')
    .innerJoin('crm.customers as c', 'c.id', 'p.customer_id')
    .innerJoin('crm.properties as pr', 'pr.id', 'p.property_id')
    .select([
      'i.id',
      'i.kind',
      'i.state',
      'i.number',
      'i.issued_at',
      'i.issuer_name',
      'i.issuer_mailing_address',
      'i.public_phone',
      'i.public_email',
      'i.payment_instructions',
      'i.policy_versions',
      'i.charges_cents',
      'i.credit_lines_cents',
      'i.discount_cents',
      'i.discount_category',
      'i.discount_percent_bps',
      'i.total_cents',
      'i.deposit_credit_cents',
      'i.payment_term_text',
      'i.test_mark',
      'e.number as estimate_number',
      'a.version as estimate_version',
      'c.display_name',
      'pr.street',
      'pr.unit',
      'pr.city',
      'pr.state as property_state',
      'pr.zip',
    ])
    .where('i.id', '=', invoiceId)
    .executeTakeFirst()
  if (!i || i.state === 'draft' || !i.number || !i.issued_at || !i.issuer_name) return null
  const lines = await db
    .selectFrom('finance.invoice_lines')
    .select(['kind', 'line_kind', 'description', 'quantity', 'unit', 'unit_price_cents', 'amount_cents'])
    .where('invoice_id', '=', invoiceId)
    .orderBy('position')
    .execute()
  const config = await loadConfig(db)
  const zone = config.get('business.timezone')
  // The accepted methods in the version the invoice pinned when issued (never a later list).
  const versions = (i.policy_versions ?? {}) as Record<string, number | null>
  const methodsVersion = versions['payment.methods']
  let methods: string[] | null = null
  if (methodsVersion) {
    const row = await db
      .selectFrom('platform.policy_version')
      .select('value')
      .where('key', '=', 'payment.methods')
      .where('version', '=', methodsVersion)
      .executeTakeFirst()
    const v = row?.value as { methods?: unknown } | null | undefined
    methods = Array.isArray(v?.methods) ? v.methods.filter((m): m is string => typeof m === 'string') : null
  }
  const discount = Number(i.discount_cents)
  return {
    number: i.number,
    kind: i.kind === 'deposit' ? 'deposit' : 'final',
    issuedAt: i.issued_at,
    issuerName: i.issuer_name,
    mailingAddress: i.issuer_mailing_address,
    phone: i.public_phone,
    email: i.public_email,
    estimate: { number: i.estimate_number, version: i.estimate_version },
    recipient: {
      name: i.display_name,
      property: `${i.street}${i.unit ? `, ${i.unit}` : ''}, ${i.city}, ${i.property_state} ${i.zip}`,
    },
    lines: lines.map((l) => ({
      kind: l.kind === 'credit' ? 'credit' : 'charge',
      lineKind: l.line_kind,
      description: l.description,
      quantity: l.quantity,
      unit: l.unit,
      unitPriceCents: l.unit_price_cents === null ? null : Number(l.unit_price_cents),
      amountCents: Number(l.amount_cents),
    })),
    chargesCents: Number(i.charges_cents),
    creditLinesCents: Number(i.credit_lines_cents),
    discount:
      discount > 0 && i.discount_category && i.discount_percent_bps !== null
        ? { category: i.discount_category, percentBps: i.discount_percent_bps, amountCents: discount }
        : null,
    totalCents: Number(i.total_cents),
    depositCreditCents: Number(i.deposit_credit_cents),
    paymentTermText: i.payment_term_text,
    methods,
    instructions: (i.payment_instructions as Instructions | null) ?? null,
    testMark: i.test_mark,
    timeZone: zone.state === 'CONFIGURED' ? zone.value.zone : null,
  }
}
