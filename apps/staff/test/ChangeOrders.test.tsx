// Change orders on the staff app (TSK-0081; HH-CHG-01, HH-CHG-02, HH-WORK-07, T53, OWN-DEC-203). The API is a
// synthetic stand-in; every name, reason and price is synthetic (RULE-SYNTHETIC-DATA).
import { staffTranslator, type StaffLocale } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChangeOrdersPage, type ChangeOrder, type ChangeOrdersData } from '../src/ChangeOrders'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const JOB = '33333333-3333-4333-8333-333333333381'
const WP = '44444444-4444-4444-8444-444444444481'
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const href = (to: string) => `/staff${to}`
const t = (locale: StaffLocale) => staffTranslator(locale).t

const ORDER: ChangeOrder = {
  changeOrderId: 'co-1',
  number: 1,
  reference: 'HH-SYNTH081-C1',
  origin: 'worker_proposal',
  createdAt: '2026-10-23T14:00:00.000Z',
  current: {
    versionId: 'v-1',
    version: 1,
    state: 'draft',
    reason: 'Synthetic: rot behind the trim',
    scope: 'Synthetic: replace one trim board',
    scheduleImpact: null,
    hazards: null,
    resources: null,
    measurements: 'Synthetic: 4 ft',
    photoIds: ['p-1'],
    affectedSteps: [{ workPackageId: WP, stepId: '3.2' }],
    base: { snapshotId: 's-1', totalCents: 80_000 },
    chargesCents: 10_000,
    creditsCents: 3_000,
    revisedTotalCents: 87_000,
    lines: [
      {
        position: 1,
        kind: 'charge',
        description: 'Synthetic trim board',
        workPackageId: WP,
        quantity: '2',
        unit: 'ea',
        unitPriceCents: 5_000,
        amountCents: 10_000,
      },
      {
        position: 2,
        kind: 'credit',
        description: 'Synthetic: one wall removed',
        workPackageId: null,
        quantity: '1',
        unit: null,
        unitPriceCents: 3_000,
        amountCents: 3_000,
      },
    ],
    draftedBy: { id: 'w-1', name: 'Synthetic Worker' },
    draftedAt: '2026-10-23T14:00:00.000Z',
    updatedAt: '2026-10-23T14:00:00.000Z',
    reviewedBy: null,
    reviewedAt: null,
    withdrawnBy: null,
    withdrawnAt: null,
    withdrawReason: null,
    rowVersion: 2,
  },
  history: [],
  actions: { edit: true, review: false, reopen: false, withdraw: true },
}
function data(over: Partial<ChangeOrdersData> = {}): ChangeOrdersData {
  return {
    jobId: JOB,
    reference: 'HH-SYNTH081',
    jobState: 'in_progress',
    approved: { snapshotVersion: 1, totalCents: 80_000 },
    paidCents: 20_000,
    packages: [{ id: WP, code: 'PT-01', steps: [{ id: '3.2', stage: 3, text: 'Synthetic step' }] }],
    photos: [{ id: 'p-1', workPackageId: WP, phase: 'before', areaLabel: 'Synthetic wall' }],
    changeOrders: [ORDER],
    actions: { create: true, chooseOrigin: false },
    ...over,
  }
}

describe('ChangeOrdersPage (TSK-0081)', () => {
  it('[HH-WORK-07][T53] the approved scope stays apart; a proposal is labelled not approved, with its credit', async () => {
    render(<ChangeOrdersPage t={t('en')} fetchImpl={vi.fn(async () => json(200, data()))} jobId={JOB} href={href} />)
    expect(await screen.findByRole('heading', { name: 'Change orders · HH-SYNTH081' })).toBeTruthy()
    expect(screen.getByTestId('change-orders-approved').textContent).toContain(
      'Approved total: $800.00 (approved scope version 1). Paid so far: $200.00.',
    )
    const order = screen.getByTestId('change-order')
    expect(within(order).getByRole('heading').textContent).toBe('HH-SYNTH081-C1 Draft')
    expect(within(order).getByTestId('change-order-not-approved').textContent).toBe(
      'Proposed, not approved: do not do this work and do not promise a price.',
    )
    const rows = within(order).getAllByRole('row')
    expect(rows[2]?.textContent).toContain('Credit (lowers the total)')
    expect(rows[2]?.textContent).toContain('− $30.00')
    expect(within(order).getByTestId('change-order-revised').textContent).toBe('$870.00')
    expect(within(order).getByTestId('change-order-steps-list').textContent).toBe('PT-01 Item 3.2')
    // A worker sees no origin choice and cannot review.
    expect(within(order).queryByRole('button', { name: 'Mark as reviewed' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Propose a change' }))
    const form = screen.getByTestId('change-order-form')
    expect(within(form).queryByLabelText('Where the change comes from')).toBeNull()
  })

  it('[HH-CHG-02] a worker proposes a change: lines in dollars sent as cents, steps and photos named', async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) =>
      init?.method === 'POST' ? json(201, { changeOrderId: 'co-2' }) : json(200, data({ changeOrders: [] })),
    )
    render(<ChangeOrdersPage t={t('en')} fetchImpl={fetchImpl} jobId={JOB} href={href} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Propose a change' }))
    const form = screen.getByTestId('change-order-form')
    fireEvent.change(within(form).getByLabelText('Reason for the change'), { target: { value: 'Synthetic reason' } })
    fireEvent.change(within(form).getByLabelText('Proposed scope'), { target: { value: 'Synthetic scope' } })
    const line = within(form).getByTestId('change-order-line-input')
    fireEvent.change(within(line).getByLabelText('Description'), { target: { value: 'Synthetic board' } })
    fireEvent.change(within(line).getByLabelText('Quantity'), { target: { value: '2.5' } })
    fireEvent.change(within(line).getByLabelText('Unit price (USD)'), { target: { value: '49.99' } })
    fireEvent.click(within(form).getByLabelText(/Item 3\.2/))
    fireEvent.click(within(form).getByLabelText(/Before · Synthetic wall/))
    fireEvent.click(within(form).getByRole('button', { name: 'Save the draft' }))
    await waitFor(() => expect(fetchImpl.mock.calls.some(([, i]) => i?.method === 'POST')).toBe(true))
    const [url, init] = fetchImpl.mock.calls.find(([, i]) => i?.method === 'POST') as [string, RequestInit]
    expect(String(url)).toContain(`/staff/jobs/${JOB}/change-orders`)
    expect(JSON.parse(String(init.body))).toEqual({
      reason: 'Synthetic reason',
      scope: 'Synthetic scope',
      scheduleImpact: null,
      hazards: null,
      resources: null,
      measurements: null,
      photoIds: ['p-1'],
      affectedSteps: [{ workPackageId: WP, stepId: '3.2' }],
      lines: [
        {
          kind: 'charge',
          description: 'Synthetic board',
          workPackageId: null,
          quantity: '2.5',
          unit: null,
          unitPriceCents: 4_999,
        },
      ],
    })
  })

  it('[HH-CHG-01] an estimator reviews with If-Match; a refused review says why, in Spanish', async () => {
    const reviewable = { ...ORDER, actions: { edit: true, review: true, reopen: false, withdraw: true } }
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) =>
      init?.method === 'POST'
        ? json(409, {
            error: {
              code: 'CONFLICT',
              message: '',
              fieldErrors: [{ field: 'body.lines', code: 'CREDIT_EXCEEDS_REMAINING_CHARGE', message: '' }],
              requestId: 'r',
              retryable: false,
            },
          })
        : json(200, data({ changeOrders: [reviewable], actions: { create: true, chooseOrigin: true } })),
    )
    render(<ChangeOrdersPage t={t('es')} fetchImpl={fetchImpl} jobId={JOB} href={href} />)
    const order = await screen.findByTestId('change-order')
    fireEvent.click(within(order).getByRole('button', { name: 'Marcar como revisada' }))
    await waitFor(() =>
      expect(within(order).getByRole('alert').textContent).toBe(
        'El crédito es mayor que lo que queda por cobrar: el dueño se encarga de un reembolso o crédito.',
      ),
    )
    const [url, init] = fetchImpl.mock.calls.find(([, i]) => i?.method === 'POST') as [string, RequestInit]
    expect(String(url)).toContain('/staff/change-orders/co-1/actions/review')
    expect((init.headers as Record<string, string>)['if-match']).toBe('"2"')
    // Staff choose the origin of a new draft.
    fireEvent.click(screen.getByRole('button', { name: 'Redactar una orden de cambio' }))
    expect(screen.getByLabelText('De dónde viene el cambio')).toBeTruthy()
  })
})
