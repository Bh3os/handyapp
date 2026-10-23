// A payment's exceptions on the staff app (TSK-0089; HH-FIN-13, HH-FIN-14, T63). The API is a synthetic stand-in;
// every value is synthetic (RULE-SYNTHETIC-DATA).
import { staffTranslator } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Fetch } from '../src/api'
import { PaymentExceptions } from '../src/PaymentExceptions'

afterEach(cleanup)

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const ID = '55555555-5555-4555-8555-555555555589'

describe('PaymentExceptions (TSK-0089)', () => {
  it('[HH-FIN-13][T63] shows what happened to the payment; nothing when there is nothing to show or do', () => {
    const fetchImpl: Fetch = async () => json(500, {})
    const { container } = render(
      <PaymentExceptions t={staffTranslator('en').t} fetchImpl={fetchImpl} p={{ id: ID }} onChanged={() => {}} />,
    )
    expect(container.textContent).toBe('')
    cleanup()
    render(
      <PaymentExceptions
        t={staffTranslator('en').t}
        fetchImpl={fetchImpl}
        onChanged={() => {}}
        p={{
          id: ID,
          disputeOpen: false,
          adjustable: [],
          adjustments: [
            {
              kind: 'returned',
              reason: 'Synthetic: insufficient funds',
              evidence: 'Synthetic bank notice 1',
              by: { id: 'o', name: 'Synthetic Office' },
              at: '2026-10-23T15:00:00.000Z',
            },
          ],
        }}
      />,
    )
    const entry = screen.getByTestId('payment-adjustments').textContent as string
    expect(entry).toContain('Check returned: Synthetic Office')
    expect(entry).toContain('Synthetic: insufficient funds')
    expect(entry).toContain('Evidence: Synthetic bank notice 1')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('[HH-FIN-13][T63] a returned check needs a reason, then posts it with the evidence once', async () => {
    const posts: [string, unknown][] = []
    const fetchImpl: Fetch = async (input, init) => {
      posts.push([String(input), JSON.parse(String(init?.body))])
      return json(200, { jobId: 'job', payments: [] })
    }
    const changed: unknown[] = []
    render(
      <PaymentExceptions
        t={staffTranslator('en').t}
        fetchImpl={fetchImpl}
        onChanged={(d) => void changed.push(d)}
        p={{ id: ID, adjustable: ['returned'], adjustments: [] }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Record check returned' }))
    fireEvent.click(screen.getByRole('button', { name: 'Record' }))
    expect(screen.getByRole('alert').textContent).toBe('Write the reason.')
    expect(posts).toEqual([])
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: ' Synthetic: returned by the bank ' } })
    fireEvent.change(screen.getByLabelText(/Evidence/), { target: { value: 'Synthetic notice' } })
    fireEvent.click(screen.getByRole('button', { name: 'Record' }))
    await waitFor(() => expect(changed).toHaveLength(1))
    expect(posts).toEqual([
      [
        `/api/v1/staff/payments/${ID}/returned`,
        { reason: 'Synthetic: returned by the bank', evidence: 'Synthetic notice' },
      ],
    ])
    expect(screen.getByRole('status').textContent).toMatch(/Recorded/)
  })

  it('[HH-FIN-14][T64] the Owner signs in again when asked, then the correction posts the right amount', async () => {
    const calls: [string, unknown][] = []
    let fresh = false
    const fetchImpl: Fetch = async (input, init) => {
      const url = String(input)
      calls.push([url, JSON.parse(String(init?.body))])
      if (url.endsWith('/staff/auth/reauth')) {
        fresh = true
        return json(200, { csrfToken: 'synthetic-csrf' })
      }
      if (!fresh) return json(403, { error: { code: 'FRESH_AUTH_REQUIRED', fieldErrors: [] } })
      return json(200, { jobId: 'job', payments: [] })
    }
    render(
      <PaymentExceptions
        t={staffTranslator('en').t}
        fetchImpl={fetchImpl}
        onChanged={() => {}}
        p={{ id: ID, adjustable: ['failed', 'dispute_opened', 'voided'], adjustments: [], disputeOpen: false }}
      />,
    )
    expect(screen.getByRole('button', { name: 'Record payment failed' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Void or correct' }))
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'Synthetic: amount typed wrongly' } })
    fireEvent.change(screen.getByLabelText(/Right amount/), { target: { value: '500.00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Record' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Sign in again/))
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'synthetic passphrase' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm password' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Recorded/))
    const body = { reason: 'Synthetic: amount typed wrongly', evidence: null, replacement: { amountCents: 50_000 } }
    expect(calls).toEqual([
      [`/api/v1/staff/payments/${ID}/correction`, body],
      ['/api/v1/staff/auth/reauth', { password: 'synthetic passphrase' }],
      [`/api/v1/staff/payments/${ID}/correction`, body],
    ])
  })

  it('[HH-FIN-13] an open dispute says so; Spanish', () => {
    render(
      <PaymentExceptions
        t={staffTranslator('es').t}
        fetchImpl={async () => json(500, {})}
        onChanged={() => {}}
        p={{ id: ID, disputeOpen: true, adjustable: ['dispute_won', 'dispute_lost'], adjustments: [] }}
      />,
    )
    expect(screen.getByText('Disputa abierta')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Disputa ganada' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Disputa perdida' })).toBeTruthy()
  })
})
