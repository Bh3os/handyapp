// The reconciliation queue on the staff app (TSK-0090; HH-FIN-15, T61). The API is a synthetic stand-in; every value
// is synthetic (RULE-SYNTHETIC-DATA).
import { staffTranslator } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Fetch } from '../src/api'
import { ReconciliationScreen, type ReconciliationData, type ReconciliationItem } from '../src/Reconciliation'

afterEach(cleanup)

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const href = (p: string) => p
const ITEM: ReconciliationItem = {
  id: '88888888-8888-4888-8888-888888888890',
  kind: 'uncertain_outcome',
  source: 'customer',
  project: { id: 'p', reference: 'HH-SYNTH090' },
  jobId: 'job-90',
  paymentId: null,
  method: 'square_payment_link',
  amountCents: 50_000,
  currency: 'USD',
  reference: null,
  description: 'Synthetic: failed midway',
  reportedBy: { id: 'o', name: 'Synthetic Office' },
  reportedAt: '2026-10-23T15:00:00.000Z',
  state: 'open',
  resolution: null,
  evidence: null,
  resolvedPaymentId: null,
  resolvedBy: null,
  resolvedAt: null,
  candidates: [
    { id: 'pay-1', method: 'square_payment_link', amountCents: 50_000, receivedOn: '2026-10-23', reference: 'SQ-1' },
  ],
  resolutions: ['matched', 'recorded', 'not_received'],
}
const data = (over: Partial<ReconciliationData> = {}): ReconciliationData => ({
  open: [ITEM],
  resolved: [],
  records: [
    {
      kind: 'pending_check',
      jobId: 'job-91',
      projectReference: 'HH-SYNTH091',
      method: 'check',
      amountCents: 1_000,
      state: 'received',
      since: '2026-10-22T15:00:00.000Z',
    },
  ],
  actions: { report: true },
  ...over,
})

describe('ReconciliationScreen (TSK-0090)', () => {
  it('[HH-FIN-15][T61] lists open items and the records it waits on; resolving names the payment and the evidence', async () => {
    const posts: [string, unknown][] = []
    const fetchImpl: Fetch = async (input, init) => {
      if (init?.method !== 'POST') return json(200, data())
      posts.push([String(input), JSON.parse(String(init.body))])
      return json(200, data({ open: [] }))
    }
    render(<ReconciliationScreen t={staffTranslator('en').t} fetchImpl={fetchImpl} href={href} />)
    expect((await screen.findAllByTestId('reconcile-item'))[0]?.textContent).toContain('Uncertain payment outcome')
    expect(screen.getByTestId('reconcile-records').textContent).toContain('Check pending')
    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }))
    expect(screen.getByRole('alert').textContent).toBe('Write the evidence.')
    fireEvent.change(screen.getByLabelText(/Evidence/), { target: { value: 'Synthetic: found in Square' } })
    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }))
    await waitFor(() => expect(screen.getByText('Nothing to reconcile.')).toBeTruthy())
    expect(posts).toEqual([
      [
        `/api/v1/staff/reconciliation/${ITEM.id}/resolve`,
        { resolution: 'matched', evidence: 'Synthetic: found in Square', paymentId: 'pay-1' },
      ],
    ])
  })

  it('[T61][HH-FIN-09] reporting needs a description and records nothing but the item; Spanish', async () => {
    const posts: [string, unknown][] = []
    const fetchImpl: Fetch = async (input, init) => {
      if (init?.method !== 'POST') return json(200, data({ open: [], records: [] }))
      posts.push([String(input), JSON.parse(String(init.body))])
      return json(201, data())
    }
    render(<ReconciliationScreen t={staffTranslator('es').t} fetchImpl={fetchImpl} href={href} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Reportar dinero por conciliar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }))
    expect(screen.getByRole('alert').textContent).toBe('Describa lo que se vio.')
    fireEvent.change(screen.getByLabelText(/Importe/), { target: { value: '500.00' } })
    fireEvent.change(screen.getByLabelText(/Qué se vio/), { target: { value: 'Sintético: falló a medias' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Reportado/))
    expect(posts).toEqual([
      [
        '/api/v1/staff/reconciliation',
        {
          kind: 'uncertain_outcome',
          source: 'customer',
          jobId: null,
          method: null,
          amountCents: 50_000,
          reference: null,
          description: 'Sintético: falló a medias',
        },
      ],
    ])
  })
})
