// Refunds, credits, write-offs and voids on the staff app (TSK-0089; HH-FIN-14, T63, T64). The API is a synthetic
// stand-in; every value is synthetic (RULE-SYNTHETIC-DATA).
import { staffTranslator } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Fetch } from '../src/api'
import { FinanceAdjustments, type AdjustmentsData } from '../src/FinanceAdjustments'

afterEach(cleanup)

const JOB = '66666666-6666-4666-8666-666666666689'
const PAY = '77777777-7777-4777-8777-777777777789'
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const data = (over: Partial<AdjustmentsData> = {}): AdjustmentsData => ({
  jobId: JOB,
  items: [],
  refundable: [{ paymentId: PAY, method: 'cash', receivedOn: '2026-10-23', availableCents: 5_000 }],
  invoice: { id: 'inv', number: 'HH-SYNTH089-I1', state: 'partially_paid', remainingCents: 30_000, pendingCents: 0 },
  voidable: [],
  actions: { refund: true, credit: true, writeOff: true, request: false, voidInvoice: false },
  ...over,
})

describe('FinanceAdjustments (TSK-0089)', () => {
  it('[HH-FIN-14][T64] the Owner records a credit with a reason, signing in again when asked', async () => {
    const posts: [string, unknown][] = []
    let fresh = false
    const fetchImpl: Fetch = async (input, init) => {
      const url = String(input)
      if (init?.method !== 'POST') return json(200, data())
      posts.push([url, JSON.parse(String(init.body))])
      if (url.endsWith('/staff/auth/reauth')) {
        fresh = true
        return json(200, { csrfToken: 'synthetic-csrf' })
      }
      if (!fresh) return json(403, { error: { code: 'FRESH_AUTH_REQUIRED', fieldErrors: [] } })
      return json(201, data())
    }
    render(<FinanceAdjustments t={staffTranslator('en').t} fetchImpl={fetchImpl} jobId={JOB} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Record a refund, credit or write-off' }))
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'credit' } })
    expect(screen.getByText(/at most \$300\.00/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '100.00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Record' }))
    expect(screen.getByRole('alert').textContent).toBe('Write the reason.')
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'Synthetic: goodwill' } })
    fireEvent.click(screen.getByRole('button', { name: 'Record' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Sign in again/))
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'synthetic passphrase' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm password' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Recorded/))
    const body = { amountCents: 10_000, reason: 'Synthetic: goodwill' }
    expect(posts).toEqual([
      [`/api/v1/staff/jobs/${JOB}/credits`, body],
      ['/api/v1/staff/auth/reauth', { password: 'synthetic passphrase' }],
      [`/api/v1/staff/jobs/${JOB}/credits`, body],
    ])
  })

  it('[HH-FIN-14] Office requests a refund of the payment; the request is shown waiting; Spanish', async () => {
    const posts: [string, unknown][] = []
    const waiting = data({
      actions: { refund: false, credit: false, writeOff: false, request: true, voidInvoice: false },
      items: [
        {
          id: 'f1',
          type: 'refund',
          state: 'requested',
          amountCents: 5_000,
          reason: 'Sintético: pagó de más',
          decisionReason: null,
          payment: { id: PAY, method: 'cash', receivedOn: '2026-10-23', amountCents: 65_000 },
          invoiceNumber: null,
          requestedBy: { id: 'o', name: 'Oficina Sintética' },
          requestedAt: '2026-10-23T15:00:00.000Z',
          decidedBy: null,
          decidedAt: null,
          confirmation: null,
          canDecide: false,
          outcomes: [],
        },
      ],
    })
    const fetchImpl: Fetch = async (input, init) => {
      if (init?.method !== 'POST') return json(200, data({ actions: waiting.actions }))
      posts.push([String(input), JSON.parse(String(init.body))])
      return json(201, waiting)
    }
    render(<FinanceAdjustments t={staffTranslator('es').t} fetchImpl={fetchImpl} jobId={JOB} />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'Solicitar un reembolso, crédito o cancelación de saldo' }),
    )
    fireEvent.change(screen.getByLabelText(/Importe/), { target: { value: '50.00' } })
    fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: 'Sintético: pagó de más' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Decisiones del propietario/))
    expect(posts).toEqual([
      [
        `/api/v1/staff/jobs/${JOB}/finance-adjustment-requests`,
        { type: 'refund', paymentId: PAY, amountCents: 5_000, reason: 'Sintético: pagó de más' },
      ],
    ])
    expect(screen.getByTestId('finance-items').textContent).toContain('Solicitado: espera al propietario')
    expect(screen.queryByRole('button', { name: 'Aprobar' })).toBeNull()
  })
})
