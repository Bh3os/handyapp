// The target gross margin and the labor cost rates in Settings (TSK-0131; HH-FIN-20, OWN-DEC-189, FACT-MARGIN-TARGET,
// RULE-MONEY-CENTS, RULE-NO-INVENTED-FACTS). The API is a synthetic stand-in; every name and amount is synthetic
// (RULE-SYNTHETIC-DATA).
import { staffTranslator } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LaborRatesSetting, MarginTargetSetting, percent } from '../src/JobMargin'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const RATES = {
  today: '2026-10-26',
  workers: [
    {
      staffUserId: '11111111-1111-4111-8111-111111111131',
      name: 'Synthetic Ann',
      status: 'active',
      roles: ['worker'],
      inForce: { effectiveOn: '2026-10-01', rateCents: 3_000, burdenCents: null },
      rates: [],
    },
    {
      staffUserId: '22222222-2222-4222-8222-222222222231',
      name: 'Synthetic Ben',
      status: 'active',
      roles: ['worker'],
      inForce: null,
      rates: [],
    },
  ],
}

describe('[HH-FIN-20] percentages from basis points, without floating point', () => {
  it('formats basis points with two decimals', () => {
    expect(percent(3000)).toBe('30.00%')
    expect(percent(1287)).toBe('12.87%')
    expect(percent(5)).toBe('0.05%')
    expect(percent(-250)).toBe('-2.50%')
  })
})

describe('[HH-FIN-20][OWN-DEC-189] the target margin setting', () => {
  it('shows the target and sends a new one in basis points with the reason and the version', async () => {
    const calls: { method: string; body: unknown; headers: Record<string, string> }[] = []
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        calls.push({
          method: 'PUT',
          body: JSON.parse(String(init.body)),
          headers: init.headers as Record<string, string>,
        })
        return json(200, { state: 'CONFIGURED', version: 2, targetBps: 2750, sourceIds: [] })
      }
      return json(200, { state: 'CONFIGURED', version: 1, targetBps: 3000, sourceIds: ['FACT-MARGIN-TARGET'] })
    })
    render(<MarginTargetSetting t={staffTranslator('en').t} fetchImpl={fetchImpl as unknown as typeof fetch} />)
    const section = await screen.findByTestId('margin-target')
    expect(section.textContent).toContain('30.00% (version 1)')
    fireEvent.change(within(section).getByLabelText('Target margin (%)'), { target: { value: '27.5' } })
    fireEvent.change(within(section).getByLabelText(/Reason/), { target: { value: 'Synthetic reason' } })
    fireEvent.click(within(section).getByRole('button', { name: 'Save the target' }))
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]?.body).toEqual({ targetBps: 2750, reason: 'Synthetic reason' })
    expect(calls[0]?.headers['if-match']).toBe('"1"')
    expect(await within(section).findByText('27.50% (version 2)')).toBeTruthy()
  })

  it('is hidden when the server refuses it', async () => {
    const fetchImpl = vi.fn(async () => json(403, { error: { code: 'FORBIDDEN', fieldErrors: [] } }))
    const { container } = render(
      <MarginTargetSetting t={staffTranslator('en').t} fetchImpl={fetchImpl as unknown as typeof fetch} />,
    )
    await waitFor(() => expect(fetchImpl).toHaveBeenCalled())
    expect(container.textContent).toBe('')
  })
})

describe('[HH-FIN-20][OWN-DEC-189][RULE-NO-INVENTED-FACTS] the labor cost rates', () => {
  it('shows no rate as not configured, never $0.00, and enters one in cents per hour (Spanish too)', async () => {
    const posts: unknown[] = []
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posts.push(JSON.parse(String(init.body)))
        return json(201, RATES)
      }
      return json(200, RATES)
    })
    render(<LaborRatesSetting t={staffTranslator('en').t} fetchImpl={fetchImpl as unknown as typeof fetch} />)
    const section = await screen.findByTestId('labor-rates')
    const rows = within(section).getAllByTestId('labor-rate-row')
    expect(rows[0]?.textContent).toMatch(/\$30\.00.*Not known.*2026-10-01/)
    expect(rows[1]?.textContent).toContain('Not configured')
    expect(rows[1]?.textContent).not.toContain('$0.00')
    fireEvent.change(within(section).getByLabelText('Person'), { target: { value: RATES.workers[1]?.staffUserId } })
    fireEvent.change(within(section).getByLabelText('Labor cost per hour (USD)'), { target: { value: '28.75' } })
    fireEvent.change(within(section).getByLabelText('Burden per hour (USD; blank if not known)'), {
      target: { value: '' },
    })
    fireEvent.change(within(section).getByLabelText('Why'), { target: { value: 'Synthetic: agreed cost' } })
    fireEvent.click(within(section).getByRole('button', { name: 'Save the rate' }))
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toEqual({
      staffUserId: RATES.workers[1]?.staffUserId,
      effectiveOn: '2026-10-26',
      rateCents: 2_875,
      burdenCents: null,
      reason: 'Synthetic: agreed cost',
    })
    cleanup()
    render(<LaborRatesSetting t={staffTranslator('es').t} fetchImpl={fetchImpl as unknown as typeof fetch} />)
    expect((await screen.findByTestId('labor-rates')).textContent).toContain('No configurado')
  })
})
