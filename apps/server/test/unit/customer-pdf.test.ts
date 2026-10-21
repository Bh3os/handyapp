// The customer PDF of an estimate version (TSK-0054; HH-EST-11, HH-EST-01, HH-EST-03, HH-PORT-08, OWN-DEC-126,
// OWN-DEC-145, T31, RULE-LANGUAGES, RULE-NO-INVENTED-FACTS). Content and amounts are synthetic (RULE-SYNTHETIC-DATA).
import { cents } from '@handyhub/money'
import { describe, expect, it } from 'vitest'
import {
  customerPdfModel,
  documentProblems,
  pdfText as safeText,
  renderCustomerPdf,
  type CustomerPdfInput,
  type CustomerVersionContent,
  type PdfBlock,
} from '../../src/modules/estimates/index.js'
import { PDF, pdfText } from '../fixtures/documents.js'

const CONTENT: CustomerVersionContent = {
  estimateNumber: 'HH-7K2M9Q4D-E1',
  version: 1,
  state: 'draft',
  currency: 'USD',
  lines: [
    {
      position: 1,
      kind: 'base',
      serviceCode: 'DW-01',
      description: 'Synthetic patch',
      quantity: '2.5',
      unit: 'sq ft',
      unitPriceCents: cents(3333),
      amountCents: cents(8333),
    },
    {
      position: 2,
      kind: 'add_on',
      serviceCode: 'PT-01',
      description: 'Synthetic trim',
      quantity: '3',
      unit: 'door',
      unitPriceCents: cents(1999),
      amountCents: cents(5997),
    },
  ],
  assumptions: [],
  exclusions: ['Synthetic: moving furniture'],
  customerResponsibilities: [],
  dependencies: [],
  scheduleAssumptions: [],
  totals: {
    subtotalCents: cents(133_333),
    discount: { category: 'military', percentBps: 1000, amountCents: cents(13_333) },
    totalCents: cents(120_000),
    deposit: { state: 'required', amountCents: cents(24_000) },
  },
  paymentTerm: 'due_on_receipt',
  publishedAt: null,
  validUntil: null,
  termsVersion: null,
}

const TOTALS = CONTENT.totals as NonNullable<CustomerVersionContent['totals']>
const INPUT: CustomerPdfInput = {
  content: CONTENT,
  issuerName: 'Handyhub LLC',
  mailingAddress: null,
  validityDays: 14,
  termsVersion: null,
  recipient: { name: 'Synthetic Customer', property: '100 Synthetic Way, Testville, KY 40000' },
  authoringMethod: 'written',
  document: null,
  testMark: true,
  timeZone: 'America/Kentucky/Louisville',
  createdAt: new Date('2026-10-21T12:00:00Z'),
}

const facts = (blocks: readonly PdfBlock[]) =>
  Object.fromEntries(blocks.flatMap((b) => (b.kind === 'facts' ? b.rows.map((r) => [r.label, r.value]) : [])))
const totals = (blocks: readonly PdfBlock[]) =>
  blocks.flatMap((b) => (b.kind === 'totals' ? b.rows.map((r) => `${r.label} ${r.value}`) : []))

describe('[HH-EST-11][HH-EST-01] the customer PDF content', () => {
  it('[OWN-DEC-126][RULE-NO-INVENTED-FACTS] issuer from configuration, the missing address omitted, NOT CONFIGURED values "Not provided"', () => {
    const model = customerPdfModel(INPUT)
    expect(model.mark).toBe('TEST — not a real invoice or estimate')
    expect(model.title).toBe('Estimate HH-7K2M9Q4D-E1')
    const f = facts(model.blocks)
    expect(f).toMatchObject({
      'Issued by': 'Handyhub LLC',
      'Prepared for': 'Synthetic Customer',
      Property: '100 Synthetic Way, Testville, KY 40000',
      Version: '1',
      Status: 'Draft preview — not published',
      Validity: '14 days from publishing',
      'Payment term': 'Payment due on receipt',
      'Estimate terms': 'Not provided',
    })
    expect(f).not.toHaveProperty('Address')
    const missing = customerPdfModel({ ...INPUT, issuerName: null, validityDays: null, testMark: false })
    expect(missing.mark).toBeNull()
    expect(facts(missing.blocks)).toMatchObject({ 'Issued by': 'Not provided', Validity: 'Not provided' })
    const withAddress = customerPdfModel({ ...INPUT, mailingAddress: ['1 Synthetic Office', 'Testville, KY 40000'] })
    expect(facts(withAddress.blocks)['Address']).toBe('1 Synthetic Office, Testville, KY 40000')
  })

  it('[RULE-MONEY-CENTS][OWN-DEC-145] stored amounts only: the discount as a totals row, the deposit only when the rule applies', () => {
    const model = customerPdfModel(INPUT)
    expect(totals(model.blocks)).toEqual([
      'Subtotal $1,333.33',
      'Discount (military) -10% -$133.33',
      'Total (USD) $1,200.00',
      'Deposit $240.00',
    ])
    const tables = model.blocks.filter((b) => b.kind === 'table')
    expect(tables.map((b) => (b.kind === 'table' ? b.rows : []))).toEqual([
      [['Synthetic patch', '2.5 sq ft', '$33.33', '$83.33']],
      [['Optional add-on: Synthetic trim', '3 door', '$19.99', '$59.97']],
    ])
    const noDeposit = { ...CONTENT, totals: { ...TOTALS, discount: null, deposit: { state: 'not_required' as const } } }
    expect(totals(customerPdfModel({ ...INPUT, content: noDeposit }).blocks)).toEqual([
      'Subtotal $1,333.33',
      'Total (USD) $1,200.00',
    ])
    const missingRule = { ...CONTENT, totals: { ...TOTALS, deposit: { state: 'not_configured' as const } } }
    expect(totals(customerPdfModel({ ...INPUT, content: missingRule }).blocks)).toContain('Deposit Not provided')
    const incomplete = customerPdfModel({ ...INPUT, content: { ...CONTENT, totals: null } })
    expect(totals(incomplete.blocks)).toEqual([])
    expect(JSON.stringify(incomplete.blocks)).toContain('Not provided: the estimate is not complete yet.')
    // No tax, minimum or surcharge text anywhere (FACT-TAX-NO-LINE, FACT-NO-MINIMUM, FACT-NO-SURCHARGE).
    expect(JSON.stringify(model)).not.toMatch(/tax|minimum|surcharge/i)
  })

  it('a published version shows its dates; an uploaded one names the SHA-256 of its customer document', () => {
    const published = customerPdfModel({
      ...INPUT,
      content: {
        ...CONTENT,
        state: 'published',
        publishedAt: '2026-10-21T15:00:00.000Z',
        validUntil: '2026-11-04T15:00:00.000Z',
      },
      termsVersion: 'test-estimate-terms-1',
      authoringMethod: 'uploaded',
      document: { sha256: 'a'.repeat(64) },
    })
    expect(facts(published.blocks)).toMatchObject({
      Published: 'October 21, 2026',
      'Valid until': 'November 4, 2026',
      'Estimate terms': 'test-estimate-terms-1',
      'Estimate document': `PDF, SHA-256 ${'a'.repeat(64)}`,
    })
    expect(facts(customerPdfModel({ ...INPUT, authoringMethod: 'uploaded' }).blocks)['Estimate document']).toBe(
      'Not provided',
    )
    expect(facts(customerPdfModel(INPUT).blocks)).not.toHaveProperty('Estimate document')
  })

  it('text the standard fonts cannot draw becomes "?"; Latin-1 and typographic punctuation stay', () => {
    expect(safeText('café — “quoted” ✓ 漢')).toBe('café — “quoted” ? ?')
  })
})

describe('[HH-EST-11] the customer PDF file', () => {
  it('is deterministic: the same stored data and configuration give the same bytes', async () => {
    const a = await renderCustomerPdf(INPUT)
    const b = await renderCustomerPdf(INPUT)
    expect(a.subarray(0, 8).toString('latin1')).toMatch(/^%PDF-1\.\d/)
    expect(a.equals(b)).toBe(true)
    const other = await renderCustomerPdf({ ...INPUT, content: { ...CONTENT, version: 2 } })
    expect(other.equals(a)).toBe(false)
  })

  it('[HH-PORT-08][RULE-LANGUAGES] is English with the TEST mark on every page, and passes the upload content check', async () => {
    const many = { ...CONTENT, exclusions: Array.from({ length: 80 }, (_, i) => `Synthetic exclusion ${i + 1}`) }
    const bytes = await renderCustomerPdf({ ...INPUT, content: many }, { compress: false })
    const text = pdfText(bytes)
    const pages = text.filter((l) => /^Estimate HH-7K2M9Q4D-E1, version 1\. Page \d+ of \d+$/.test(l))
    expect(pages.length).toBeGreaterThan(1)
    expect(text.filter((l) => l === 'TEST — not a real invoice or estimate')).toHaveLength(pages.length)
    for (const expected of ['Issued by', 'Handyhub LLC', 'Scope of work', 'Synthetic patch', '$1,200.00', 'Exclusions'])
      expect(text, expected).toContain(expected)
    expect(text.join('\n')).not.toMatch(/tax|minimum|surcharge/i)
    expect(documentProblems(await renderCustomerPdf(INPUT), PDF)).toEqual([])
  })
})
