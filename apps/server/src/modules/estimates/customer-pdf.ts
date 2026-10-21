// The customer PDF of an estimate version (TSK-0054; HH-EST-11, HH-EST-01, HH-EST-03, HH-PORT-08, ENT-Document,
// FACT-BUSINESS-NAME, FACT-BUSINESS-ADDRESS, OWN-DEC-126, OWN-DEC-145, RULE-LANGUAGES, RULE-NO-INVENTED-FACTS).
// - One renderer for both authoring methods: the content is the version's customer-facing content
//   (projections.customerVersionContent, the allow-list of the customer projection), so no internal cost, margin,
//   markup, estimator note or preparer can reach it. Every amount is a stored, server-computed integer-cent amount,
//   formatted with @handyhub/money; nothing is recomputed. There is no tax, minimum or surcharge line.
// - English only: every label comes from the customer catalog (customer.en), whatever the staff member's locale.
// - Configuration only, never a default: the issuer is business.name, the mailing-address line is left out while it
//   is missing (it is never taken from the customer), and any other value that is NOT CONFIGURED (validity, terms
//   version, deposit rule) is shown as "Not provided". Outside production every page carries the mark
//   "TEST — not a real invoice or estimate" (OWN-DEC-126).
// - Deterministic and offline: pdfkit with the standard Helvetica fonts built into the library (no font file, image or
//   network fetch), fixed document metadata whose date comes from the stored version, and no clock or random input,
//   so the same stored data and configuration always give the same bytes. Text the standard fonts cannot encode
//   (outside Windows-1252) is shown as "?".
// - For an uploaded version the PDF names the SHA-256 of the customer document it goes with, so it binds to the exact
//   document version the customer reviews (the document itself is served beside it, unchanged).
import type { Db, Tx } from '@handyhub/db'
import { customerTranslator, type CustomerKey } from '@handyhub/i18n'
import { cents, formatUsd, toDecimalString } from '@handyhub/money'
import PDFDocument from 'pdfkit'
import { loadConfig } from '../../platform/config/index.js'
import { currentDocuments } from './documents.js'
import { EDITABLE_STATES } from './model.js'
import { customerVersionContent, type CustomerVersionContent } from './projections.js'
import { documentDetails } from './readiness.js'

export type CustomerPdfInput = {
  readonly content: CustomerVersionContent
  /** business.name (FACT-BUSINESS-NAME); null while NOT CONFIGURED. */
  readonly issuerName: string | null
  /** business.mailing_address; null while missing: the line is left out (FACT-BUSINESS-ADDRESS). */
  readonly mailingAddress: readonly string[] | null
  /** Days of validity from publishing (estimate.validity), shown on an unpublished preview; null: not provided. */
  readonly validityDays: number | null
  /** The terms version the version carries, or for a preview the configured one; null: not provided. */
  readonly termsVersion: string | null
  /** The customer's name and the property the estimate is for (HH-EST-01). */
  readonly recipient: { readonly name: string; readonly property: string }
  readonly authoringMethod: 'written' | 'uploaded'
  /** Uploaded versions: the ready customer document this PDF goes with; null while there is none. */
  readonly document: { readonly sha256: string } | null
  /** Outside production: the TEST mark on every page (OWN-DEC-126). */
  readonly testMark: boolean
  /** business.timezone for the dates; null: dates are shown in UTC and say so. */
  readonly timeZone: string | null
  /** The document date (stored data: published_at, or the version's last change for a preview). */
  readonly createdAt: Date
}

type Cells = readonly [string, string, string, string]
export type PdfBlock =
  | { readonly kind: 'facts'; readonly rows: readonly { readonly label: string; readonly value: string }[] }
  | { readonly kind: 'heading'; readonly text: string }
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'table'; readonly head: Cells; readonly rows: readonly Cells[] }
  | {
      readonly kind: 'totals'
      readonly rows: readonly { readonly label: string; readonly value: string; readonly strong: boolean }[]
    }
  | { readonly kind: 'list'; readonly items: readonly string[] }

/** What the PDF says, page furniture aside: tested on its own, then laid out by renderCustomerPdf. */
export type CustomerPdfModel = {
  readonly mark: string | null
  readonly title: string
  readonly footer: string
  readonly blocks: readonly PdfBlock[]
}

const t = (key: CustomerKey, values?: Record<string, string | number>) => customerTranslator().t(key, values)

const TEXT_LISTS = [
  ['assumptions', 'estimatePdf.assumptions'],
  ['exclusions', 'estimatePdf.exclusions'],
  ['customerResponsibilities', 'estimatePdf.customerResponsibilities'],
  ['dependencies', 'estimatePdf.dependencies'],
  ['scheduleAssumptions', 'estimatePdf.scheduleAssumptions'],
] as const satisfies readonly (readonly [keyof CustomerVersionContent, CustomerKey])[]

const KIND: Record<string, CustomerKey> = {
  alternate: 'estimatePdf.kind.alternate',
  add_on: 'estimatePdf.kind.add_on',
}
const DISCOUNT_CATEGORY: Record<string, CustomerKey> = {
  military: 'estimatePdf.discountCategory.military',
  senior: 'estimatePdf.discountCategory.senior',
  returning_customer: 'estimatePdf.discountCategory.returning_customer',
}
const PAYMENT_TERM: Record<string, CustomerKey> = { due_on_receipt: 'estimatePdf.paymentTerm.due_on_receipt' }

const usd = (c: number) => formatUsd(cents(c))
const percent = (bps: number) => (bps % 100 === 0 ? String(bps / 100) : toDecimalString(cents(bps)))

function dateText(iso: string, timeZone: string | null): string {
  const text = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: timeZone ?? 'UTC',
  }).format(new Date(iso))
  return timeZone ? text : `${text} (UTC)`
}

/** The PDF's content for one version. Pure: the same input always gives the same model. */
export function customerPdfModel(input: CustomerPdfInput): CustomerPdfModel {
  const c = input.content
  const notProvided = t('estimatePdf.notProvided')
  const facts: { label: string; value: string }[] = [
    { label: t('estimatePdf.issuer'), value: input.issuerName ?? notProvided },
  ]
  // The mailing-address line exists only when the address is configured (FACT-BUSINESS-ADDRESS).
  if (input.mailingAddress) facts.push({ label: t('estimatePdf.address'), value: input.mailingAddress.join(', ') })
  facts.push(
    { label: t('estimatePdf.preparedFor'), value: input.recipient.name },
    { label: t('estimatePdf.property'), value: input.recipient.property },
    { label: t('estimatePdf.version'), value: String(c.version) },
  )
  if (c.publishedAt) {
    facts.push({ label: t('estimatePdf.published'), value: dateText(c.publishedAt, input.timeZone) })
    facts.push({
      label: t('estimatePdf.validUntil'),
      value: c.validUntil ? dateText(c.validUntil, input.timeZone) : notProvided,
    })
  } else {
    facts.push({ label: t('estimatePdf.status'), value: t('estimatePdf.draftPreview') })
    facts.push({
      label: t('estimatePdf.validity'),
      value: input.validityDays === null ? notProvided : t('estimatePdf.validFor', { days: input.validityDays }),
    })
  }

  const head: Cells = [
    t('estimatePdf.column.description'),
    t('estimatePdf.column.quantity'),
    t('estimatePdf.column.unitPrice'),
    t('estimatePdf.column.amount'),
  ]
  const row = (l: CustomerVersionContent['lines'][number]): Cells => {
    const description = l.description ?? notProvided
    const kind = KIND[l.kind]
    return [
      kind ? `${t(kind)}: ${description}` : description,
      l.quantity === null ? notProvided : [l.quantity, l.unit].filter(Boolean).join(' '),
      l.unitPriceCents === null ? notProvided : usd(l.unitPriceCents),
      l.amountCents === null ? notProvided : usd(l.amountCents),
    ]
  }
  const base = c.lines.filter((l) => l.kind === 'base')
  const options = c.lines.filter((l) => l.kind !== 'base')

  const blocks: PdfBlock[] = [
    { kind: 'facts', rows: facts },
    { kind: 'heading', text: t('estimatePdf.scope') },
  ]
  blocks.push(base.length ? { kind: 'table', head, rows: base.map(row) } : { kind: 'text', text: notProvided })
  if (options.length) {
    blocks.push({ kind: 'heading', text: t('estimatePdf.options') }, { kind: 'table', head, rows: options.map(row) })
  }

  blocks.push({ kind: 'heading', text: t('estimatePdf.totals') })
  if (!c.totals) blocks.push({ kind: 'text', text: t('estimatePdf.totalsPending') })
  else {
    const rows = [{ label: t('estimatePdf.subtotal'), value: usd(c.totals.subtotalCents), strong: false }]
    const d = c.totals.discount
    if (d) {
      const categoryKey = DISCOUNT_CATEGORY[d.category]
      rows.push({
        label: t('estimatePdf.discount', {
          category: categoryKey ? t(categoryKey) : d.category,
          percent: percent(d.percentBps),
        }),
        value: `-${usd(d.amountCents)}`,
        strong: false,
      })
    }
    rows.push({ label: t('estimatePdf.total'), value: usd(c.totals.totalCents), strong: true })
    // The deposit appears only when the deposit rule applies (T31); a missing rule is never read as "no deposit".
    const dep = c.totals.deposit
    if (dep.state === 'required')
      rows.push({ label: t('estimatePdf.deposit'), value: usd(dep.amountCents), strong: false })
    if (dep.state === 'not_configured')
      rows.push({ label: t('estimatePdf.deposit'), value: notProvided, strong: false })
    blocks.push({ kind: 'totals', rows })
  }

  for (const [key, label] of TEXT_LISTS) {
    const items = c[key]
    if (items.length) blocks.push({ kind: 'heading', text: t(label) }, { kind: 'list', items })
  }

  const termKey = PAYMENT_TERM[c.paymentTerm]
  const closing: { label: string; value: string }[] = [
    { label: t('estimatePdf.paymentTerm'), value: termKey ? t(termKey) : notProvided },
    { label: t('estimatePdf.terms'), value: input.termsVersion ?? notProvided },
  ]
  if (input.authoringMethod === 'uploaded')
    closing.push({
      label: t('estimatePdf.document'),
      value: input.document ? t('estimatePdf.documentPdf', { sha256: input.document.sha256 }) : notProvided,
    })
  blocks.push({ kind: 'facts', rows: closing })

  return {
    mark: input.testMark ? t('estimatePdf.testMark') : null,
    title: t('estimatePdf.title', { number: c.estimateNumber }),
    footer: t('estimatePdf.footer', { number: c.estimateNumber, version: c.version }),
    blocks,
  }
}

/** Windows-1252 characters beyond Latin-1 that the standard PDF fonts encode (WinAnsiEncoding). */
const WIN_ANSI_EXTRA = new Set(
  [
    0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017d, 0x2018,
    0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
  ].map((c) => String.fromCodePoint(c)),
)
/** Text the standard fonts can draw: other characters become "?", tabs a space (the stored text is unchanged). */
export function pdfText(text: string): string {
  let out = ''
  for (const ch of text.replace(/\r\n?/g, '\n').replace(/\t/g, ' ')) {
    const c = ch.codePointAt(0) ?? 0
    out += ch === '\n' || (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WIN_ANSI_EXTRA.has(ch) ? ch : '?'
  }
  return out
}

const PAGE = { width: 612, height: 792, margin: 54 } as const
const CONTENT_WIDTH = PAGE.width - 2 * PAGE.margin
const COLUMNS = [270, 74, 80, 80] as const
const BODY = 10
const SMALL = 8

/**
 * Renders the customer PDF (US Letter). `compress: false` keeps the content streams readable, for tests only.
 */
export async function renderCustomerPdf(
  input: CustomerPdfInput,
  options: { compress?: boolean } = {},
): Promise<Buffer> {
  const model = customerPdfModel(input)
  const doc = new PDFDocument({
    size: 'LETTER',
    margin: PAGE.margin,
    bufferPages: true,
    compress: options.compress ?? true,
    info: {
      Title: pdfText(model.title),
      Author: pdfText(input.issuerName ?? ''),
      Creator: 'HandyApp',
      Producer: 'HandyApp',
      CreationDate: input.createdAt,
    },
  })
  const chunks: Buffer[] = []
  doc.on('data', (chunk: Buffer) => chunks.push(chunk))
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })

  const left = PAGE.margin
  const bottom = PAGE.height - PAGE.margin - 18
  const drawMark = () => {
    if (!model.mark) return
    const y = PAGE.margin - 30
    doc.save().rect(left, y, CONTENT_WIDTH, 20).fillAndStroke('#fff4e5', '#b45309').restore()
    doc
      .fillColor('#7c2d12')
      .font('Helvetica-Bold')
      .fontSize(BODY)
      .text(pdfText(model.mark), left, y + 5, { width: CONTENT_WIDTH, align: 'center', lineBreak: false })
      .fillColor('black')
    doc.x = left
    doc.y = PAGE.margin
  }
  doc.on('pageAdded', drawMark)
  drawMark()
  const room = (height: number) => {
    if (doc.y + height > bottom) doc.addPage()
  }

  doc.font('Helvetica-Bold').fontSize(18).text(pdfText(model.title), left, doc.y, { width: CONTENT_WIDTH })
  doc.moveDown(0.5)

  for (const [index, block] of model.blocks.entries()) {
    switch (block.kind) {
      case 'heading':
        room(40)
        doc.moveDown(0.6).font('Helvetica-Bold').fontSize(12).text(pdfText(block.text), left, doc.y, {
          width: CONTENT_WIDTH,
        })
        doc.moveDown(0.2)
        break
      case 'text':
        doc.font('Helvetica').fontSize(BODY)
        room(doc.heightOfString(pdfText(block.text), { width: CONTENT_WIDTH }))
        doc.text(pdfText(block.text), left, doc.y, { width: CONTENT_WIDTH })
        break
      case 'facts':
        if (index > 0) doc.moveDown(0.8)
        for (const r of block.rows) {
          doc.font('Helvetica').fontSize(BODY)
          const value = pdfText(r.value)
          const h = Math.max(doc.heightOfString(value, { width: CONTENT_WIDTH - 140 }), BODY + 2)
          room(h + 2)
          const y = doc.y
          doc.font('Helvetica-Bold').text(pdfText(r.label), left, y, { width: 132 })
          doc.font('Helvetica').text(value, left + 140, y, { width: CONTENT_WIDTH - 140 })
          doc.y = y + h + 2
        }
        break
      case 'table': {
        const drawRow = (cells: Cells, bold: boolean) => {
          doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? SMALL + 1 : BODY)
          const texts = cells.map(pdfText)
          const h = Math.max(...texts.map((s, i) => doc.heightOfString(s, { width: (COLUMNS[i] as number) - 6 })))
          if (doc.y + h + 4 > bottom) {
            doc.addPage()
            if (!bold) drawRow(block.head, true)
          }
          const y = doc.y
          let x = left
          texts.forEach((s, i) => {
            const w = COLUMNS[i] as number
            doc.text(s, x, y, { width: w - 6, align: i === 0 ? 'left' : 'right' })
            x += w
          })
          doc.y = y + h + 4
          doc
            .moveTo(left, doc.y - 2)
            .lineTo(left + CONTENT_WIDTH, doc.y - 2)
            .lineWidth(0.5)
            .strokeColor(bold ? '#555555' : '#cccccc')
            .stroke()
        }
        drawRow(block.head, true)
        for (const r of block.rows) drawRow(r, false)
        break
      }
      case 'totals':
        for (const r of block.rows) {
          doc.font(r.strong ? 'Helvetica-Bold' : 'Helvetica').fontSize(r.strong ? 12 : BODY)
          room(18)
          const y = doc.y
          doc.text(pdfText(r.label), left, y, { width: CONTENT_WIDTH - 110, align: 'right' })
          doc.text(pdfText(r.value), left + CONTENT_WIDTH - 104, y, { width: 104, align: 'right' })
          doc.y = Math.max(doc.y, y + (r.strong ? 18 : 14))
        }
        break
      case 'list':
        doc.font('Helvetica').fontSize(BODY)
        for (const item of block.items) {
          const text = pdfText(item)
          room(doc.heightOfString(text, { width: CONTENT_WIDTH - 14 }) + 2)
          const y = doc.y
          doc.text('•', left, y, { width: 10 })
          doc.text(text, left + 14, y, { width: CONTENT_WIDTH - 14 })
          doc.y += 2
        }
        break
    }
  }

  // Page numbers on every page, written last so the page count is known (bufferPages).
  const range = doc.bufferedPageRange()
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i)
    const marginBottom = doc.page.margins.bottom
    doc.page.margins.bottom = 0
    doc
      .font('Helvetica')
      .fontSize(SMALL)
      .fillColor('#444444')
      .text(
        pdfText(`${model.footer} ${t('estimatePdf.page', { page: i + 1, pages: range.count })}`),
        left,
        PAGE.height - PAGE.margin + 12,
        { width: CONTENT_WIDTH, align: 'center', lineBreak: false },
      )
    doc.page.margins.bottom = marginBottom
  }
  doc.end()
  return done
}

/**
 * The PDF input of a stored version, from its customer-facing content, its project's customer and property and the
 * active configuration; null when the version does not exist. The caller authorizes the read. A version past review
 * shows what it pinned (terms version, the customer document it was confirmed for); a version still being edited
 * shows the configured validity and terms as a preview.
 */
export async function customerPdfInput(
  db: Db | Tx,
  versionId: string,
  options: { testMark: boolean },
): Promise<CustomerPdfInput | null> {
  const content = await customerVersionContent(db, versionId)
  if (!content) return null
  const v = await db
    .selectFrom('estimating.estimate_versions as v')
    .innerJoin('crm.projects as p', 'p.id', 'v.project_id')
    .innerJoin('crm.customers as c', 'c.id', 'p.customer_id')
    .innerJoin('crm.properties as pr', 'pr.id', 'p.property_id')
    .select([
      'v.state',
      'v.authoring_method',
      'v.agreement_document_id',
      'v.published_at',
      'v.updated_at',
      'c.display_name',
      'pr.street',
      'pr.unit',
      'pr.city',
      'pr.state as property_state',
      'pr.zip',
    ])
    .where('v.id', '=', versionId)
    .executeTakeFirstOrThrow()
  const config = await loadConfig(db)
  const details = documentDetails(config)
  const zone = config.get('business.timezone')
  const editable = (EDITABLE_STATES as readonly string[]).includes(v.state)
  let document: { sha256: string } | null = null
  if (v.authoring_method === 'uploaded') {
    if (editable) {
      const pdf = (await currentDocuments(db, versionId)).customerPdf
      document = pdf?.state === 'ready' ? { sha256: pdf.sha256 } : null
    } else if (v.agreement_document_id) {
      const pinned = await db
        .selectFrom('estimating.estimate_documents')
        .select('sha256')
        .where('id', '=', v.agreement_document_id)
        .executeTakeFirst()
      document = pinned ? { sha256: pinned.sha256 } : null
    }
  }
  return {
    content,
    issuerName: details.issuerName,
    mailingAddress: details.mailingAddress,
    validityDays: details.validityDays,
    termsVersion: content.termsVersion ?? (editable ? details.termsDocumentId : null),
    recipient: {
      name: v.display_name,
      property: `${v.street}${v.unit ? `, ${v.unit}` : ''}, ${v.city}, ${v.property_state} ${v.zip}`,
    },
    authoringMethod: v.authoring_method === 'uploaded' ? 'uploaded' : 'written',
    document,
    testMark: options.testMark,
    timeZone: zone.state === 'CONFIGURED' ? zone.value.zone : null,
    createdAt: v.published_at ?? v.updated_at,
  }
}
