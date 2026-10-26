// The discount request panel on a request's record (TSK-0125; HH-EST-15, OWN-DEC-165, RULE-SERVER-AUTHZ). The API is a
// synthetic stand-in; every value is synthetic (RULE-SYNTHETIC-DATA).
import { staffTranslator } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RequestDiscount, type DiscountData } from '../src/Discount'

afterEach(cleanup)

const REQUEST = '12512512-5125-4125-8125-125125125125'
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const ACTIONS = { verify: true, checkJobHistory: false, ownerReview: true, decide: false }
const data = (
  over: Partial<NonNullable<DiscountData['discount']>> = {},
  top: Partial<DiscountData> = {},
): DiscountData => ({
  requestId: REQUEST,
  projectId: 'project-125',
  reference: 'HH-SYNTH125',
  eligibility: { percentBps: 1000, seniorFromAge: 60, returningWithinMonths: 12 },
  discount: {
    category: 'senior',
    requestedAt: '2001-01-04T13:00:00.000Z',
    state: 'pending',
    verifications: [],
    approved: false,
    revisionNeeded: false,
    actions: ACTIONS,
    ...over,
  },
  ...top,
})

function renderPanel(fetchImpl: ReturnType<typeof vi.fn>, locale: 'en' | 'es' = 'en') {
  const { t } = staffTranslator(locale)
  render(
    <RequestDiscount
      t={t}
      fetchImpl={fetchImpl as unknown as typeof fetch}
      requestId={REQUEST}
      when={(iso) => iso.slice(0, 10)}
    />,
  )
}

describe('[HH-EST-15][OWN-DEC-165] the discount request panel', () => {
  it('shows the requested discount pending verification, what it needs and how to check it without keeping anything', async () => {
    renderPanel(vi.fn(async () => json(200, data())))
    const panel = await screen.findByTestId('request-discount')
    expect(within(panel).getByRole('heading', { name: 'Discount request' })).toBeTruthy()
    expect(within(panel).getByText('Senior')).toBeTruthy()
    expect(within(panel).getByText(/60 or older, with a government-issued photo ID/)).toBeTruthy()
    expect(within(panel).getByText('Pending verification')).toBeTruthy()
    expect(within(panel).getByText(/only once it is verified/)).toBeTruthy()
    expect(within(panel).getByText(/Never photograph, scan, copy or upload it/)).toBeTruthy()
    expect(within(panel).getByText('Nothing recorded yet.')).toBeTruthy()
    // No field for a document, an ID number or a date of birth: only the result buttons.
    expect(within(panel).queryAllByRole('textbox')).toHaveLength(0)
    for (const name of ['Verified', 'Not verified', 'Send to owner review'])
      expect(within(panel).getByRole('button', { name })).toBeTruthy()
    expect(within(panel).queryByRole('button', { name: 'Approve discount' })).toBeNull()
  })

  it('records a result with an idempotency key and shows who recorded it', async () => {
    const posts: { url: string; body: unknown; key: string | null }[] = []
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posts.push({
          url,
          body: JSON.parse(String(init.body)),
          key: new Headers(init.headers).get('idempotency-key'),
        })
        return json(
          201,
          data({
            state: 'verified',
            actions: { verify: false, checkJobHistory: false, ownerReview: false, decide: false },
            verifications: [
              {
                position: 1,
                category: 'senior',
                result: 'verified',
                verifiedBy: { id: 's1', name: 'Synthetic office' },
                verifiedAt: '2001-01-05T13:00:00.000Z',
              },
            ],
          }),
        )
      }
      return json(200, data())
    })
    renderPanel(fetchImpl)
    fireEvent.click(await screen.findByRole('button', { name: 'Verified' }))
    await waitFor(() => expect(screen.getByText('Recorded.')).toBeTruthy())
    expect(posts).toEqual([
      {
        url: `/api/v1/staff/requests/${REQUEST}/discount/verifications`,
        body: { result: 'verified' },
        key: expect.any(String),
      },
    ])
    const list = screen.getByTestId('discount-verifications')
    expect(within(list).getByText('Verified')).toBeTruthy()
    expect(within(list).getByText(/Synthetic office, 2001-01-05/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Verified' })).toBeNull()
  })

  it('a returning customer is checked from the job history; the Owner decides a review; a refusal is named', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === 'POST'
        ? json(409, {
            error: {
              code: 'CONFLICT',
              message: 'x',
              fieldErrors: [{ field: 'result', code: 'ESTIMATE_APPROVED', message: '' }],
            },
          })
        : json(
            200,
            data({
              category: 'returning_customer',
              state: 'owner_review',
              actions: { verify: false, checkJobHistory: true, ownerReview: false, decide: true },
            }),
          ),
    )
    renderPanel(fetchImpl)
    const panel = await screen.findByTestId('request-discount')
    expect(within(panel).getByText(/a completed job in the last 12 months/)).toBeTruthy()
    expect(within(panel).getByText('Waiting for owner review')).toBeTruthy()
    expect(within(panel).queryByRole('button', { name: 'Verified' })).toBeNull()
    expect(within(panel).getByRole('button', { name: 'Check job history' })).toBeTruthy()
    fireEvent.click(within(panel).getByRole('button', { name: 'Approve discount' }))
    await waitFor(() =>
      expect(screen.getByText('An estimate of this project is approved: its price is fixed.')).toBeTruthy(),
    )
  })

  it('names a failed verification on a published estimate, and the fixed price once approved; Spanish too', async () => {
    renderPanel(
      vi.fn(async () =>
        json(
          200,
          data({
            state: 'not_verified',
            revisionNeeded: true,
            approved: false,
            actions: { verify: false, checkJobHistory: false, ownerReview: true, decide: false },
          }),
        ),
      ),
      'es',
    )
    const panel = await screen.findByTestId('request-discount')
    expect(within(panel).getByRole('heading', { name: 'Solicitud de descuento' })).toBeTruthy()
    expect(within(panel).getByTestId('discount-revision-needed').textContent).toContain('Revise el estimado sin él')
    expect(within(panel).getByText('No verificado')).toBeTruthy()
  })

  it('says when the customer asked for none', async () => {
    renderPanel(vi.fn(async () => json(200, data({}, { discount: null }))))
    expect(await screen.findByText('The customer did not request a discount.')).toBeTruthy()
  })
})
