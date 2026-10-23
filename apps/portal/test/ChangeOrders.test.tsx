// Change orders in the Documents tab (TSK-0082; HH-CHG-02, HH-CHG-03, HH-PORT-05, HH-ID-07, OWN-DEC-169). The API is
// a synthetic stand-in; every reference, text and amount is invented for the test (RULE-SYNTHETIC-DATA).
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ChangeOrders } from '../src/ChangeOrders'
import { parseChangeOrders, type Fetch } from '../src/api'

afterEach(cleanup)

const REF = 'HH-7K2M9Q4D'
const NOW = '2026-10-23T15:00:00.000Z'
const DIGEST = 'd'.repeat(64)
const TERMS = 'e'.repeat(64)
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const order = (over: Record<string, unknown> = {}) => ({
  reference: `${REF}-C1`,
  number: 1,
  version: 1,
  status: 'issued',
  reason: 'Synthetic: rot behind the trim',
  scope: 'Synthetic: replace one trim board',
  scheduleImpact: null,
  lines: [
    {
      position: 1,
      kind: 'charge',
      description: 'Synthetic trim board',
      quantity: '1',
      unit: 'ea',
      unitPriceCents: 9_000,
      amountCents: 9_000,
    },
    {
      position: 2,
      kind: 'credit',
      description: 'Synthetic: paint not needed',
      quantity: '1',
      unit: null,
      unitPriceCents: 1_000,
      amountCents: 1_000,
    },
  ],
  approvedTotalCents: 80_000,
  chargesCents: 9_000,
  creditsCents: 1_000,
  revisedTotalCents: 88_000,
  sentAt: NOW,
  validUntil: '2026-10-31T04:59:59.000Z',
  decidedAt: null,
  decision: null,
  approval: {
    canDecide: true,
    blockedBy: null,
    contentDigest: DIGEST,
    termsDocumentId: 'estimate-terms-synthetic',
    termsSha256: TERMS,
  },
  ...over,
})
const list = (orders: unknown[], current = 80_000) => ({
  reference: REF,
  original: { estimateNumber: `${REF}-E1`, version: 1, totalCents: 80_000 },
  currentTotalCents: current,
  changeOrders: orders,
  refreshedAt: NOW,
  refreshSeconds: 0,
})

/** A fetch answering the list, then each decision with `decide`; records the posts. */
function api(first: unknown, decide: (body: Record<string, unknown>, url: string) => Response, after?: unknown) {
  const posts: { url: string; body: Record<string, unknown>; key: string | null }[] = []
  let decided = false
  const fetchImpl: Fetch = async (input, init) => {
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>
      posts.push({ url: input, body, key: new Headers(init.headers).get('idempotency-key') })
      const res = decide(body, input)
      if (res.status < 300) decided = true
      return res
    }
    if (input.endsWith('/customer/session/verification'))
      return json(200, {
        fresh: false,
        freshUntil: NOW,
        channels: [{ channel: 'email', destination: 's***@example.test' }],
      })
    return json(200, decided && after ? after : first)
  }
  return { fetchImpl, posts }
}

describe('change orders in the Documents tab (TSK-0082, HH-PORT-05)', () => {
  it('[OWN-DEC-169] the original estimate, the current total and each sent change with its lines and totals', async () => {
    expect(parseChangeOrders(list([order()]))).not.toBeNull()
    expect(parseChangeOrders({ ...list([order()]), currentTotalCents: '1' })).toBeNull()
    const { fetchImpl } = api(list([order()]), () => json(500, {}))
    render(<ChangeOrders reference={REF} fetchImpl={fetchImpl} />)
    const section = await screen.findByTestId('documents-change-orders')
    expect(within(section).getByText(`Original estimate ${REF}-E1 (version 1)`)).toBeTruthy()
    expect(screen.getByTestId('change-orders-current-total').textContent).toBe('$800.00')
    expect(within(section).getByText('Waiting for your decision')).toBeTruthy()
    expect(within(section).getByText('Credit: Synthetic: paint not needed')).toBeTruthy()
    expect(within(section).getAllByText('-$10.00')).toHaveLength(2)
    expect(within(screen.getByTestId('change-order-totals')).getByText('$880.00')).toBeTruthy()
  })

  it('[HH-CHG-02] approving needs the unchecked box and the typed name; it names the exact version and total', async () => {
    const approved = order({
      status: 'approved',
      approval: null,
      decidedAt: NOW,
      decision: { kind: 'approved', method: 'portal', at: NOW },
    })
    const { fetchImpl, posts } = api(
      list([order()]),
      () =>
        json(201, {
          reference: REF,
          changeOrder: `${REF}-C1`,
          version: 1,
          status: 'approved',
          at: NOW,
          revisedTotalCents: 88_000,
        }),
      list([approved], 88_000),
    )
    render(<ChangeOrders reference={REF} fetchImpl={fetchImpl} />)
    const box = (await screen.findByRole('checkbox')) as HTMLInputElement
    expect(box.checked).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Approve Change' }))
    expect(posts).toEqual([])
    fireEvent.click(box)
    fireEvent.change(screen.getByLabelText(/Full name/i), { target: { value: ' Synthetic Customer ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Approve Change' }))
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]?.url).toBe(`/api/v1/customer/projects/${REF}/change-orders/1/versions/1/approve`)
    expect(posts[0]?.body).toEqual({
      contentDigest: DIGEST,
      totalCents: 88_000,
      termsDocumentId: 'estimate-terms-synthetic',
      termsSha256: TERMS,
      acceptTerms: true,
      fullName: 'Synthetic Customer',
    })
    expect(posts[0]?.key).toMatch(/^portal-[0-9a-f]{32}$/)
    expect(await screen.findByText(/You approved this change on/)).toBeTruthy()
    expect(screen.getByTestId('change-orders-current-total').textContent).toBe('$880.00')
    expect(screen.queryByRole('button', { name: 'Approve Change' })).toBeNull()
  })

  it('[HH-ID-07] a stale verification asks for a code here and keeps what was typed; declining takes a reason', async () => {
    const { fetchImpl, posts } = api(list([order()]), (body) =>
      body['reason'] === undefined
        ? json(403, { error: { code: 'FORBIDDEN', fieldErrors: [{ code: 'FRESH_VERIFICATION_REQUIRED' }] } })
        : json(403, { error: { code: 'FORBIDDEN', fieldErrors: [{ code: 'FRESH_VERIFICATION_REQUIRED' }] } }),
    )
    render(<ChangeOrders reference={REF} fetchImpl={fetchImpl} />)
    fireEvent.change(await screen.findByLabelText(/Reason for declining/), { target: { value: 'Synthetic: not now' } })
    fireEvent.click(screen.getByRole('button', { name: 'Decline Change' }))
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]?.url).toMatch(/\/change-orders\/1\/versions\/1\/reject$/)
    expect(posts[0]?.body).toEqual({ contentDigest: DIGEST, reason: 'Synthetic: not now' })
    expect(await screen.findByTestId('estimate-reverify')).toBeTruthy()
    expect((screen.getByLabelText(/Reason for declining/) as HTMLTextAreaElement).value).toBe('Synthetic: not now')
  })

  it('[HH-CHG-03] a change priced before another was approved waits for its updated version; none listed: nothing', async () => {
    const blocked = order({ approval: { ...order().approval, canDecide: false, blockedBy: 'APPROVED_SCOPE_CHANGED' } })
    const { fetchImpl } = api(list([blocked]), () => json(500, {}))
    render(<ChangeOrders reference={REF} fetchImpl={fetchImpl} />)
    expect(await screen.findByText(/HandyHub is updating this change order/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Approve Change' })).toBeNull()
    cleanup()
    const empty = api(list([]), () => json(500, {}))
    const { container } = render(<ChangeOrders reference={REF} fetchImpl={empty.fetchImpl} />)
    await waitFor(() => expect(container.innerHTML).toBe(''))
  })
})
