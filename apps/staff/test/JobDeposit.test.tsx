// The job's deposit panel (TSK-0059; HH-FIN-02, HH-FIN-03, HH-FIN-12, T36, T64, OWN-DEC-76, OWN-DEC-138,
// RULE-LANGUAGES). The API is a synthetic stand-in (RULE-SYNTHETIC-DATA): amounts, names, references and links are
// fake and nothing reaches Square.
import { staffTranslator } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { JobDeposit, type Deposit } from '../src/JobDeposit'

afterEach(cleanup)

const JOB = '33333333-3333-4333-8333-333333333333'
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const OWNER = { id: 'staff-1', name: 'Synthetic Owner' }
const OFFICE = { id: 'staff-2', name: 'Synthetic Office' }
const fail = (status: number, code: string, fieldErrors: { field: string; code: string }[] = []) =>
  json(status, { error: { code, message: '', fieldErrors, requestId: 'r', retryable: false } })

function deposit(over: Partial<Deposit> = {}): Deposit {
  return {
    jobId: JOB,
    required: true,
    state: 'required',
    amountCents: 30_000,
    baseTotalCents: 150_000,
    ruleVersion: 1,
    verifiedCents: 0,
    pendingCents: 30_000,
    remainingCents: 30_000,
    workScheduling: 'blocked',
    paymentLink: null,
    waiver: null,
    payments: [
      {
        id: 'payment-1',
        method: 'check',
        amountCents: 30_000,
        appliedCents: 30_000,
        unappliedCents: 0,
        receivedOn: '2026-10-21',
        reference: 'SYNTH-CHECK-1',
        payerName: 'Synthetic Payer',
        state: 'received',
        verified: false,
        collector: OFFICE,
        recordedBy: OFFICE,
        recordedAt: '2026-10-21T15:00:00.000Z',
        clearedBy: null,
        clearedAt: null,
        canMarkCleared: true,
      },
    ],
    version: 2,
    actions: { enterPaymentLink: true, recordPayment: false, waive: true },
    ...over,
  }
}

function renderPanel(fetchImpl: ReturnType<typeof vi.fn>, locale: 'en' | 'es' = 'en') {
  const { t } = staffTranslator(locale)
  render(<JobDeposit t={t} fetchImpl={fetchImpl as unknown as typeof fetch} jobId={JOB} />)
}

describe('[HH-FIN-02][HH-FIN-12][T36] the deposit panel', () => {
  it('shows the amount, the pending check, that work visits are blocked, and the Owner clears the check', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(200, deposit()))
      .mockResolvedValueOnce(
        json(
          200,
          deposit({
            state: 'satisfied',
            verifiedCents: 30_000,
            pendingCents: 0,
            remainingCents: 0,
            workScheduling: 'open',
            payments: [
              {
                ...(deposit().payments[0] as Deposit['payments'][number]),
                state: 'cleared',
                verified: true,
                canMarkCleared: false,
              },
            ],
            actions: { enterPaymentLink: false, recordPayment: false, waive: false },
          }),
        ),
      )
    renderPanel(fetchImpl)
    const panel = await screen.findByTestId('job-deposit')
    expect(within(panel).getAllByText('$300.00').length).toBeGreaterThan(0)
    expect(within(panel).getByText('Received (pending until cleared)')).toBeTruthy()
    expect(screen.getByTestId('deposit-work-scheduling').textContent).toBe(
      'Blocked until the deposit is paid with verified money or the Owner waives it',
    )
    fireEvent.click(within(panel).getByRole('button', { name: 'Mark check cleared' }))
    await waitFor(() => expect(screen.getByText('Check marked cleared.')).toBeTruthy())
    expect(fetchImpl.mock.calls[1]?.[0]).toBe('/api/v1/staff/payments/payment-1/clear')
    expect(screen.getByTestId('deposit-work-scheduling').textContent).toBe(
      'May be confirmed (as far as the deposit goes)',
    )
    expect(screen.queryByRole('button', { name: 'Waive the deposit' })).toBeNull()
  })

  it('[RULE-SERVER-AUTHZ] is not shown when the server refuses the read (roles without payment.view)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fail(403, 'FORBIDDEN'))
    renderPanel(fetchImpl)
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1))
    expect(screen.queryByTestId('job-deposit')).toBeNull()
  })

  it('[HH-FIN-09][INT-Square] records a payment with its amount in cents and names a refusal', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        json(
          200,
          deposit({
            payments: [],
            pendingCents: 0,
            actions: { enterPaymentLink: true, recordPayment: true, waive: false },
          }),
        ),
      )
      .mockResolvedValueOnce(fail(409, 'CONFLICT', [{ field: 'body.reference', code: 'DUPLICATE_PAYMENT' }]))
      .mockResolvedValueOnce(fail(400, 'VALIDATION_FAILED', [{ field: 'body.url', code: 'NOT_A_SQUARE_LINK' }]))
    renderPanel(fetchImpl)
    const panel = await screen.findByTestId('job-deposit')
    const form = within(panel).getByRole('form', { name: 'Record a deposit payment' })
    fireEvent.change(within(form).getByLabelText('Method'), { target: { value: 'square_payment_link' } })
    fireEvent.change(within(form).getByLabelText(/Amount received/), { target: { value: '300.00' } })
    fireEvent.change(within(form).getByLabelText('Transaction reference'), { target: { value: 'SYNTH-SQ-1' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Record payment' }))
    await waitFor(() =>
      expect(screen.getByText('A payment with this method and reference is already recorded.')).toBeTruthy(),
    )
    const body = JSON.parse(String((fetchImpl.mock.calls[1]?.[1] as RequestInit).body)) as Record<string, unknown>
    expect(body).toMatchObject({ method: 'square_payment_link', amountCents: 30_000, reference: 'SYNTH-SQ-1' })

    const linkForm = within(panel).getByRole('form', { name: 'Deposit request' })
    fireEvent.change(within(linkForm).getByLabelText('Square payment link for this deposit'), {
      target: { value: 'https://example.test/pay' },
    })
    fireEvent.click(within(linkForm).getByRole('button', { name: 'Save the link' }))
    await waitFor(() => expect(screen.getByText('Enter a Square payment link created in the Square app.')).toBeTruthy())
    expect(
      (fetchImpl.mock.calls[2]?.[1] as RequestInit & { headers: Record<string, string> }).headers['if-match'],
    ).toBe('"2"')
  })
})

describe('[OWN-DEC-76][T64][RULE-LANGUAGES] the Owner waiver asks for a reason and a fresh sign-in', () => {
  it('asks for the password when the server needs a fresh sign-in, then waives (Spanish)', async () => {
    const waived = deposit({
      state: 'waived',
      workScheduling: 'open',
      waiver: { by: OWNER, at: '2026-10-21T16:00:00.000Z', reason: 'Sintético: cliente de confianza' },
      actions: { enterPaymentLink: false, recordPayment: false, waive: false },
    })
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(200, deposit({ payments: [] })))
      .mockResolvedValueOnce(fail(403, 'FRESH_AUTH_REQUIRED'))
      .mockResolvedValueOnce(json(200, { csrfToken: 'synthetic-rotated-token' }))
      .mockResolvedValueOnce(json(200, waived))
    renderPanel(fetchImpl, 'es')
    const panel = await screen.findByTestId('job-deposit')
    const form = within(panel).getByRole('form', { name: 'Dispensar este depósito' })
    fireEvent.click(within(form).getByRole('button', { name: 'Dispensar el depósito' }))
    expect(await screen.findByText('Escriba el motivo de la dispensa.')).toBeTruthy()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    fireEvent.change(within(form).getByLabelText(/Motivo de la dispensa/), {
      target: { value: 'Sintético: cliente de confianza' },
    })
    fireEvent.click(within(form).getByRole('button', { name: 'Dispensar el depósito' }))
    const reauth = await screen.findByRole('form', { name: 'Vuelva a iniciar sesión' })
    fireEvent.change(within(reauth).getByLabelText(/Contraseña/), { target: { value: 'synthetic password' } })
    fireEvent.submit(reauth)
    await waitFor(() => expect(screen.getByText('Depósito dispensado para este trabajo.')).toBeTruthy())
    expect(fetchImpl.mock.calls[2]?.[0]).toBe('/api/v1/staff/auth/reauth')
    const retry = fetchImpl.mock.calls[3]?.[1] as RequestInit & { headers: Record<string, string> }
    expect(retry.headers['x-csrf-token']).toBe('synthetic-rotated-token')
    expect(JSON.parse(String(retry.body))).toEqual({ reason: 'Sintético: cliente de confianza' })
    expect(screen.getByTestId('deposit-waiver').textContent).toContain('Sintético: cliente de confianza')
  })
})
