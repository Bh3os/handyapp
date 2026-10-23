// The invoice's Square payment link on the staff app (TSK-0087; HH-FIN-08, T60). The API is a synthetic stand-in;
// every number, name and link is synthetic (RULE-SYNTHETIC-DATA).
import { staffTranslator } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Fetch } from '../src/api'
import { JobInvoices, type JobInvoicesData } from '../src/JobInvoices'

afterEach(cleanup)

const JOB = '44444444-4444-4444-8444-444444444487'
const INVOICE = '55555555-5555-4555-8555-555555555587'
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

type Link = { url: string; setBy: { id: string; name: string | null }; setAt: string } | null
const final = (link: Link) =>
  ({
    id: INVOICE,
    kind: 'final',
    state: 'issued',
    number: 'HH-SYNTH087-I1',
    scopeVersion: 1,
    lines: [],
    chargesCents: 50_000,
    creditLinesCents: 0,
    subtotalCents: 50_000,
    discount: null,
    totalCents: 50_000,
    depositCreditCents: 0,
    paymentTermText: 'Due on receipt',
    issuedAt: '2026-10-23T14:00:00.000Z',
    issuer: { name: 'Handyhub LLC', mailingAddress: null, phone: null, email: null },
    money: {
      invoicedCents: 50_000,
      depositCreditCents: 0,
      appliedCreditsCents: 0,
      creditsCents: 0,
      confirmedCents: 0,
      pendingCents: 0,
      remainingCents: 50_000,
    },
    payments: [],
    exceptions: [],
    document: 'issued',
    version: 2,
    paymentLink: link,
    actions: { issue: false, recordPayment: true, setPaymentLink: true },
  }) as unknown as NonNullable<JobInvoicesData['final']>
const data = (link: Link): JobInvoicesData => ({
  jobId: JOB,
  final: final(link),
  deposit: null,
  unallocatedCents: 0,
  actions: { prepareFinal: false, prepareDeposit: false },
})

describe('the invoice payment link (TSK-0087)', () => {
  it('[HH-FIN-08][T60] staff paste the Square link once with PUT; a refused link says why and changes nothing', async () => {
    const sent: { method: string | undefined; url: string; body: unknown }[] = []
    let refuse = true
    const fetchImpl: Fetch = async (input, init) => {
      if (!init?.method || init.method === 'GET') return json(200, data(null))
      sent.push({ method: init.method, url: String(input), body: JSON.parse(String(init.body)) })
      if (refuse)
        return json(400, {
          error: { code: 'VALIDATION_FAILED', fieldErrors: [{ field: 'body.url', code: 'NOT_A_SQUARE_LINK' }] },
        })
      return json(
        200,
        data({
          url: 'https://square.link/u/SYNTH087',
          setBy: { id: 'o-1', name: 'Synthetic Office' },
          setAt: '2026-10-23T15:00:00.000Z',
        }),
      )
    }
    render(<JobInvoices t={staffTranslator('en').t} fetchImpl={fetchImpl} jobId={JOB} />)
    const form = await screen.findByRole('form', { name: 'Card payment link' })
    fireEvent.change(within(form).getByLabelText(/Square payment link for this invoice/), {
      target: { value: 'https://pay.example.test/x' },
    })
    fireEvent.click(within(form).getByRole('button', { name: 'Save the link' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByTestId('invoice-payment-link')).toBeNull()
    refuse = false
    fireEvent.change(within(form).getByLabelText(/Square payment link for this invoice/), {
      target: { value: ' https://square.link/u/SYNTH087 ' },
    })
    fireEvent.click(within(form).getByRole('button', { name: 'Save the link' }))
    const shown = await screen.findByTestId('invoice-payment-link')
    expect(within(shown).getByRole('link').getAttribute('href')).toBe('https://square.link/u/SYNTH087')
    expect(screen.getByText('Payment link saved.')).toBeTruthy()
    expect(sent.map((s) => [s.method, s.url, s.body])).toEqual([
      ['PUT', `/api/v1/staff/invoices/${INVOICE}/payment-link`, { url: 'https://pay.example.test/x' }],
      ['PUT', `/api/v1/staff/invoices/${INVOICE}/payment-link`, { url: 'https://square.link/u/SYNTH087' }],
    ])
  })
})
