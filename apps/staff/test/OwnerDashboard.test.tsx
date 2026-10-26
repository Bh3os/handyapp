// The Owner Dashboard screen (TSK-0096; HH-FIN-18, HH-FIN-16, HH-DATA-10, T64, T73, RULE-MONEY-CENTS). The API is a
// synthetic stand-in; every name, amount and reference is synthetic (RULE-SYNTHETIC-DATA).
import { staffTranslator, type StaffLocale } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OwnerDashboard, type DashboardData, type DashboardFigure } from '../src/OwnerDashboard'

beforeEach(() => {
  Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:synthetic'), revokeObjectURL: vi.fn() })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const fig = (over: Partial<DashboardFigure> & { id: string; section: string }): DashboardFigure => ({
  unit: 'count',
  scope: 'period',
  report: null,
  detail: null,
  current: { state: 'known', value: 0 },
  previous: { state: 'known', value: 0 },
  ...over,
})
const DATA: DashboardData = {
  period: { from: '2026-10-01', to: '2026-10-26', days: 26, previous: { from: '2026-09-05', to: '2026-09-30' } },
  zone: 'America/Kentucky/Louisville',
  generatedAt: '2026-10-26T15:04:00.000Z',
  accounting: {
    depositRevenueRecognition: 'not_configured',
    taxTreatment: 'not_configured',
    writeOffPresentation: 'not_configured',
  },
  figures: [
    fig({
      id: 'overview.new_requests',
      section: 'overview',
      scope: 'now',
      previous: null,
      current: { state: 'known', value: 3 },
    }),
    fig({
      id: 'response.average_minutes',
      section: 'response',
      unit: 'minutes',
      current: { state: 'unavailable', value: null },
      previous: { state: 'known', value: 42 },
    }),
    fig({
      id: 'payments.invoiced',
      section: 'payments',
      unit: 'cents',
      report: { id: 'invoiced', basis: 'invoiced_revenue', unknown: 'unavailable' },
      current: { state: 'known', value: 240_000 },
      previous: { state: 'known', value: 0 },
    }),
    fig({
      id: 'payments.write_offs',
      section: 'payments',
      unit: 'cents',
      current: { state: 'not_configured', value: null },
      previous: { state: 'not_configured', value: null },
    }),
    fig({
      id: 'costs.recorded',
      section: 'costs',
      unit: 'cents',
      report: { id: 'job_costs', basis: 'job_costs', unknown: 'incomplete' },
      current: { state: 'incomplete', value: 7_500 },
      previous: { state: 'known', value: 0 },
    }),
    fig({
      id: 'cases.open_by_assignee',
      section: 'cases',
      scope: 'now',
      previous: null,
      detail: { id: '44444444-4444-4444-8444-444444444496', name: 'Synthetic Office' },
      current: { state: 'known', value: 2 },
    }),
  ],
}
const RECORDS = {
  figure: 'payments.invoiced',
  unit: 'cents',
  total: 2,
  totalCents: 240_000,
  truncated: false,
  rows: [
    {
      id: 'i1',
      reference: 'HH-SYNTH-I2',
      on: '2026-10-20T14:00:00.000Z',
      state: 'paid',
      cents: 200_000,
      minutes: null,
      link: { screen: 'invoice-reminders', id: 'i1' },
    },
    {
      id: 'i2',
      reference: 'HH-SYNTH-I3',
      on: '2026-10-21T14:00:00.000Z',
      state: 'issued',
      cents: 40_000,
      minutes: null,
      link: null,
    },
  ],
}

function mount(locale: StaffLocale, fetchImpl: typeof fetch, go = vi.fn()) {
  return render(
    <OwnerDashboard
      t={staffTranslator(locale).t}
      locale={locale}
      fetchImpl={fetchImpl}
      go={go}
      href={(to) => `/staff${to}`}
      today={new Date(2026, 9, 26)}
    />,
  )
}
const tile = (page: HTMLElement, id: string) => page.querySelector(`[data-figure="${id}"]`) as HTMLElement

describe('[HH-FIN-18][T73][HH-DATA-10] the Owner Dashboard', () => {
  it('asks for this month so far; shows each figure with its basis, previous period and last-updated time', async () => {
    const fetchImpl = vi.fn(async (_url: string) => json(200, DATA))
    mount('en', fetchImpl as unknown as typeof fetch)
    const page = await screen.findByTestId('owner-dashboard')
    await within(page).findByText(/Last updated/)
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('/api/v1/staff/dashboard?from=2026-10-01&to=2026-10-26')
    expect(tile(page, 'overview.new_requests').textContent).toContain('3')
    expect(tile(page, 'overview.new_requests').textContent).toContain('As of now')
    const invoiced = tile(page, 'payments.invoiced')
    expect(invoiced.textContent).toContain('$2,400.00')
    expect(invoiced.textContent).toContain('Basis: Invoiced revenue')
    expect(invoiced.textContent).toContain('Previous period: $0.00')
    expect(within(page).getByText(/Invoiced amounts are not money received/)).toBeTruthy()
    expect(within(page).getByTestId('dashboard-accounting').textContent).toMatch(/Not configured: how deposits/)
  })

  it('never shows missing data as zero: unavailable, incomplete and not configured say so', async () => {
    mount('en', vi.fn(async () => json(200, DATA)) as unknown as typeof fetch)
    const page = await screen.findByTestId('owner-dashboard')
    await within(page).findByText(/Last updated/)
    const minutes = tile(page, 'response.average_minutes')
    expect(minutes.textContent).toContain('Unavailable')
    expect(minutes.textContent).toContain('Previous period: 42 business minutes')
    expect(tile(page, 'costs.recorded').textContent).toContain('$75.00 so far (incomplete)')
    const writeOffs = tile(page, 'payments.write_offs')
    expect(writeOffs.textContent).toContain('Not configured')
    expect(writeOffs.textContent).not.toContain('$0.00')
    expect(within(writeOffs).queryByRole('button')).toBeNull()
    expect(tile(page, 'cases.open_by_assignee').textContent).toContain('Open cases assigned to Synthetic Office')
  })

  it('opens the records behind a figure, with their total and the screens that open them', async () => {
    const go = vi.fn()
    const fetchImpl = vi.fn(async (url: string) =>
      url.includes('/staff/dashboard/records') ? json(200, RECORDS) : json(200, DATA),
    )
    mount('en', fetchImpl as unknown as typeof fetch, go)
    const page = await screen.findByTestId('owner-dashboard')
    await within(page).findByText(/Last updated/)
    const invoiced = tile(page, 'payments.invoiced')
    fireEvent.click(within(invoiced).getByRole('button', { name: 'Show records' }))
    const table = await within(invoiced).findByRole('table')
    expect(fetchImpl.mock.calls.at(-1)?.[0]).toBe(
      '/api/v1/staff/dashboard/records?from=2026-10-01&to=2026-10-26&figure=payments.invoiced',
    )
    expect(table.textContent).toContain('HH-SYNTH-I2')
    expect(table.textContent).toContain('$2,000.00')
    expect(table.textContent).toMatch(/2 records, total\$2,400\.00/)
    fireEvent.click(within(table).getByRole('link', { name: 'Open' }))
    expect(go).toHaveBeenCalledWith('/invoice-reminders/i1')
    // The per-assignee figure asks for that staff member's records.
    fireEvent.click(within(tile(page, 'cases.open_by_assignee')).getByRole('button', { name: 'Show records' }))
    await waitFor(() =>
      expect(String(fetchImpl.mock.calls.at(-1)?.[0])).toContain('detail=44444444-4444-4444-8444-444444444496'),
    )
  })

  it('[T64] the CSV asks for the password when the sign-in is not recent, then saves the file', async () => {
    const posts: { url: string; body: unknown }[] = []
    let fresh = false
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posts.push({ url, body: JSON.parse(String(init.body)) })
        if (url.endsWith('/staff/auth/reauth')) {
          fresh = true
          return json(200, { csrfToken: 'synthetic-csrf' })
        }
        if (!fresh) return json(403, { error: { code: 'FRESH_AUTH_REQUIRED', fieldErrors: [] } })
        return json(200, { filename: 'owner-dashboard.csv', contentType: 'text/csv', rows: 6, csv: 'section\r\n' })
      }
      return json(200, DATA)
    })
    mount('en', fetchImpl as unknown as typeof fetch)
    const page = await screen.findByTestId('owner-dashboard')
    await within(page).findByText(/Last updated/)
    const form = within(page).getByRole('region', { name: 'Export the dashboard (CSV)' })
    fireEvent.click(within(form).getByRole('button', { name: 'Export CSV' }))
    const reauth = await within(form).findByTestId('owner-reauth')
    fireEvent.change(within(reauth).getByLabelText(/Password/), { target: { value: 'synthetic password' } })
    fireEvent.submit(reauth)
    expect(await within(form).findByText('Exported 6 rows.')).toBeTruthy()
    expect(posts.map((p) => p.url)).toEqual([
      '/api/v1/staff/dashboard/exports',
      '/api/v1/staff/auth/reauth',
      '/api/v1/staff/dashboard/exports',
    ])
    expect(posts[0]?.body).toEqual({ from: '2026-10-01', to: '2026-10-26' })
    expect(URL.createObjectURL).toHaveBeenCalled()
  })

  it("[HH-FIN-16] the accountant's file needs a reason and names the dataset", async () => {
    const posts: { url: string; body: unknown }[] = []
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posts.push({ url, body: JSON.parse(String(init.body)) })
        return json(200, { filename: 'payouts.csv', contentType: 'text/csv', rows: 1, csv: 'payout_id\r\n' })
      }
      return json(200, DATA)
    })
    mount('en', fetchImpl as unknown as typeof fetch)
    const page = await screen.findByTestId('owner-dashboard')
    await within(page).findByText(/Last updated/)
    const form = within(page).getByRole('region', { name: 'Files for the accountant' })
    expect(form.textContent).toMatch(/do not replace an accounting system or your accountant's tax review/)
    fireEvent.click(within(form).getByRole('button', { name: 'Export file' }))
    expect((await within(form).findByRole('alert')).textContent).toBe('Enter the reason for the export.')
    expect(posts).toHaveLength(0)
    fireEvent.change(within(form).getByLabelText('File'), { target: { value: 'payouts' } })
    fireEvent.change(within(form).getByLabelText('Reason'), { target: { value: ' Synthetic month end ' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Export file' }))
    expect(await within(form).findByText('Exported 1 row.')).toBeTruthy()
    expect(posts[0]).toEqual({
      url: '/api/v1/staff/accounting/exports',
      body: { dataset: 'payouts', from: '2026-10-01', to: '2026-10-26', reason: 'Synthetic month end' },
    })
  })

  it('is in Spanish for staff (RULE-LANGUAGES) and says when only the Owner may see it', async () => {
    mount('es', vi.fn(async () => json(200, DATA)) as unknown as typeof fetch)
    const page = await screen.findByTestId('owner-dashboard')
    await within(page).findByText(/Última actualización/)
    expect(tile(page, 'response.average_minutes').textContent).toContain('No disponible')
    expect(tile(page, 'costs.recorded').textContent).toContain('hasta ahora (incompleto)')
    cleanup()
    mount(
      'en',
      vi.fn(async () => json(403, { error: { code: 'FORBIDDEN', fieldErrors: [] } })) as unknown as typeof fetch,
    )
    expect(await screen.findByText('Only the Owner sees the dashboard.')).toBeTruthy()
  })

  it('names a refused period in words', async () => {
    mount(
      'en',
      vi.fn(async () =>
        json(400, {
          error: { code: 'VALIDATION_FAILED', fieldErrors: [{ field: 'querystring.to', code: 'RANGE_TOO_LONG' }] },
        }),
      ) as unknown as typeof fetch,
    )
    expect(await screen.findByText('Choose at most 366 days.')).toBeTruthy()
  })
})
