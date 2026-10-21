// The approval receipt's content and layout (TSK-0058; HH-EST-12, HH-EST-10, HH-PORT-08, ENT-Document, OWN-DEC-105,
// OWN-DEC-126, OWN-DEC-127, FACT-BUSINESS-ADDRESS, RULE-LANGUAGES, RULE-NO-INVENTED-FACTS, RULE-MONEY-CENTS). Every
// name, address and amount is synthetic (RULE-SYNTHETIC-DATA).
import { ESTIMATE_TERMS } from '@handyhub/domain/legal'
import { cents } from '@handyhub/money'
import { describe, expect, it } from 'vitest'
import {
  approvalReceiptModel,
  renderApprovalReceipt,
  type ApprovalReceiptInput,
} from '../../src/modules/estimates/index.js'
import { receiptTime } from '../../src/modules/estimates/receipt.js'

const HEX = (c: string) => c.repeat(64)
const input = (over: Partial<ApprovalReceiptInput> = {}): ApprovalReceiptInput => ({
  estimateNumber: 'HH-0000TEST-E1',
  version: 2,
  authoringMethod: 'written',
  contentSha256: HEX('c'),
  documentSha256: null,
  lines: [
    {
      position: 1,
      kind: 'base',
      serviceCode: 'DW-01',
      description: 'Synthetic patch',
      quantity: '2',
      unit: 'patch',
      unitPriceCents: cents(1250),
      amountCents: cents(2500),
    },
    {
      position: 3,
      kind: 'add_on',
      serviceCode: null,
      description: 'Synthetic trim',
      quantity: '1',
      unit: null,
      unitPriceCents: cents(4500),
      amountCents: cents(4500),
    },
  ],
  texts: {
    assumptions: [],
    exclusions: ['Synthetic: no furniture moving'],
    customerResponsibilities: [],
    dependencies: [],
    scheduleAssumptions: [],
  },
  subtotalCents: 7000,
  discount: null,
  totalCents: 7000,
  depositCents: null,
  paymentTermText: 'Payment due on receipt',
  approvedAt: new Date('2026-10-21T19:04:00Z'),
  fullName: 'Synthetic Q. Customer',
  accessVia: 'grant',
  terms: { document: ESTIMATE_TERMS, sha256: ESTIMATE_TERMS.contentSha256 },
  issuerName: 'Synthetic Issuer LLC',
  mailingAddress: null,
  recipient: { name: 'Synthetic Customer', property: '1 Synthetic Way, Testville, KY 40000' },
  timeZone: 'America/New_York',
  testMark: true,
  ...over,
})
const facts = (m: ReturnType<typeof approvalReceiptModel>) =>
  m.blocks.flatMap((b) => (b.kind === 'facts' ? b.rows.map((r) => [r.label, r.value]) : []))

describe('[HH-EST-12][OWN-DEC-105] the approval receipt says what was approved, by whom and when, with the terms', () => {
  it('the receipt facts, the approved lines and totals as recorded, the evidence and the full terms', () => {
    const m = approvalReceiptModel(input())
    expect(m.title).toBe('Approval receipt for estimate HH-0000TEST-E1')
    expect(m.footer).toBe('Approval receipt for estimate HH-0000TEST-E1, version 2.')
    expect(facts(m)).toEqual(
      expect.arrayContaining([
        ['Issued by', 'Synthetic Issuer LLC'],
        ['Prepared for', 'Synthetic Customer'],
        ['Estimate', 'HH-0000TEST-E1, version 2'],
        ['Approved', 'October 21, 2026 at 3:04 PM EDT'],
        // The name exactly as the customer typed it (HH-PORT-08).
        ['Approved by', 'Synthetic Q. Customer'],
        ['How', 'Online, through your secure project link, after a one-time code'],
        ['Payment term', 'Payment due on receipt'],
        ['Estimate terms', `Version 1.0 (document ID ${ESTIMATE_TERMS.documentId})`],
        ['Terms fingerprint (SHA-256)', ESTIMATE_TERMS.contentSha256],
        ['Estimate fingerprint (SHA-256)', HEX('c')],
      ]),
    )
    const table = m.blocks.find((b) => b.kind === 'table')
    expect(table?.kind === 'table' ? table.rows : []).toEqual([
      ['Synthetic patch', '2 patch', '$12.50', '$25.00'],
      ['Optional add-on: Synthetic trim', '1', '$45.00', '$45.00'],
    ])
    const totals = m.blocks.find((b) => b.kind === 'totals')
    expect(totals?.kind === 'totals' ? totals.rows.map((r) => [r.label, r.value]) : []).toEqual([
      ['Subtotal', '$70.00'],
      ['Total (USD)', '$70.00'],
      ['Deposit', 'Not required'],
    ])
    // Every section of the accepted terms, numbered, with the decided values the wording states.
    const headings = m.blocks.flatMap((b) => (b.kind === 'heading' ? [b.text] : []))
    expect(headings).toContain('Estimate Terms')
    expect(headings.filter((h) => /^\d+\. /.test(h))).toHaveLength(ESTIMATE_TERMS.sections.length)
    const text = JSON.stringify(m)
    expect(text).toContain('$1,000.00')
    expect(text).toContain('Synthetic: no furniture moving')
    expect(text).not.toMatch(/\{[a-zA-Z]+\}/)
  })

  it('[OWN-DEC-126][FACT-BUSINESS-ADDRESS] TEST only for a TEST approval; no invented issuer or address', () => {
    expect(approvalReceiptModel(input()).mark).toBe('TEST — not a real invoice or estimate')
    const real = approvalReceiptModel(input({ testMark: false, issuerName: null }))
    expect(real.mark).toBeNull()
    expect(facts(real)).toContainEqual(['Issued by', 'Not provided'])
    expect(facts(real).map(([l]) => l)).not.toContain('Address')
    const addressed = approvalReceiptModel(input({ mailingAddress: ['1 Synthetic Office Rd', 'Testville, KY'] }))
    expect(facts(addressed)).toContainEqual(['Address', '1 Synthetic Office Rd, Testville, KY'])
  })

  it('[HH-EST-11][RULE-MONEY-CENTS] a deposit, a discount row and an uploaded document as the approval pinned them', () => {
    const m = approvalReceiptModel(
      input({
        authoringMethod: 'uploaded',
        documentSha256: HEX('d'),
        accessVia: 'account',
        subtotalCents: 133_497,
        discount: { category: 'military', percentBps: 1000, amountCents: 13_350 },
        totalCents: 120_147,
        depositCents: 24_029,
      }),
    )
    const totals = m.blocks.find((b) => b.kind === 'totals')
    expect(totals?.kind === 'totals' ? totals.rows.map((r) => [r.label, r.value]) : []).toEqual([
      ['Subtotal', '$1,334.97'],
      ['Discount (military) -10%', '-$133.50'],
      ['Total (USD)', '$1,201.47'],
      ['Deposit', '$240.29'],
    ])
    expect(facts(m)).toContainEqual(['Estimate document', `PDF, SHA-256 ${HEX('d')}`])
    expect(facts(m)).toContainEqual(['How', 'Online, signed in to your HandyHub account, after a one-time code'])
  })

  it('[HH-EST-12] times in the business time zone, or UTC and saying so; text the PDF fonts can draw', () => {
    expect(receiptTime(new Date('2026-10-21T19:04:00Z'), 'America/New_York')).toBe('October 21, 2026 at 3:04 PM EDT')
    expect(receiptTime(new Date('2026-12-01T19:04:00Z'), null)).toBe('December 1, 2026 at 7:04 PM UTC')
  })

  it('[HH-EST-10] deterministic bytes: the same records always render the same PDF', async () => {
    const a = await renderApprovalReceipt(input())
    const b = await renderApprovalReceipt(input())
    expect(a.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    expect(Buffer.compare(a, b)).toBe(0)
    // Any recorded fact that differs (here the TEST mark) changes the bytes.
    expect(Buffer.compare(a, await renderApprovalReceipt(input({ testMark: false })))).not.toBe(0)
  })
})
