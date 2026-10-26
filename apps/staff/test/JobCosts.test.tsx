// A job's estimated versus actual costs and its gross margin (TSK-0095, TSK-0131; HH-FIN-17, HH-FIN-20, HH-DATA-10,
// HH-QA-08, T73, RULE-MONEY-CENTS). The API is a synthetic stand-in; every name, note, amount and reference is
// synthetic (RULE-SYNTHETIC-DATA).
import { staffTranslator, type StaffLocale } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { JobCostsPage, type Figure, type JobCostsData } from '../src/JobCosts'
import type { MarginData } from '../src/JobMargin'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const JOB = '33333333-3333-4333-8333-333333333395'
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const f = (state: Figure['state'], cents: number | null = null): Figure => ({ state, cents })
const LINES = ['labor', 'burden', 'materials', 'purchase', 'subcontractor', 'rental', 'disposal', 'other'] as const
const CATEGORY = (l: string) => l !== 'labor' && l !== 'burden'

const NOT_FINAL = { revenueCents: null, costCents: null, grossProfitCents: null, marginBps: null }
function margin(over: Partial<MarginData> = {}): MarginData {
  return {
    targetBps: 3000,
    targetVersion: 1,
    estimatedPriceCents: 60_000,
    revenue: {
      state: 'not_invoiced',
      cents: null,
      invoicedCents: 0,
      refundsCents: 0,
      creditsCents: 0,
      gaps: ['not_invoiced'],
    },
    estimated: {
      state: 'complete',
      revenueCents: 60_000,
      costCents: 50_000,
      grossProfitCents: 10_000,
      marginBps: 1667,
      gaps: [],
    },
    actual: { state: 'incomplete', ...NOT_FINAL, gaps: ['not_invoiced', 'costs_incomplete'] },
    varianceBps: null,
    profitVarianceCents: null,
    flag: 'incomplete',
    estimatedFlag: 'below_target',
    reviewed: false,
    reviews: [],
    report: 'job_margin',
    actions: { review: false },
    ...over,
  }
}

function data(over: Partial<JobCostsData> = {}): JobCostsData {
  return {
    jobId: JOB,
    projectReference: 'HH-SYNTH-95',
    jobState: 'in_progress',
    estimate: { number: 'E-95', version: 1 },
    changeOrders: 0,
    lines: LINES.map((line) => ({
      line,
      estimated:
        line === 'materials' ? f('complete', 20_000) : line === 'labor' ? f('complete', 30_000) : f('not_estimated'),
      actual:
        line === 'labor' || line === 'burden'
          ? f('not_configured')
          : line === 'materials'
            ? f('incomplete', 12_345)
            : f('not_recorded'),
      varianceCents: null,
      confirmed: null,
      actions: { confirm: CATEGORY(line), reopen: false },
    })),
    totals: {
      estimated: f('complete', 50_000),
      actual: f('incomplete', 12_345),
      varianceCents: null,
      incompleteLines: [...LINES],
    },
    labor: {
      minutes: 95,
      minutesComplete: false,
      unknownTimes: 1,
      workDone: false,
      times: [
        {
          visitId: 'v1',
          visitNumber: 1,
          localDate: '2026-10-26',
          staffUserId: 'a',
          name: 'Synthetic Ann',
          minutes: 95,
          flagged: false,
          rated: true,
          laborCents: 3_958,
          burdenCents: null,
        },
        {
          visitId: 'v1',
          visitNumber: 1,
          localDate: '2026-10-26',
          staffUserId: 'b',
          name: 'Synthetic Ben',
          minutes: null,
          flagged: true,
          rated: false,
          laborCents: null,
          burdenCents: null,
        },
      ],
    },
    entries: [
      {
        id: 'k1',
        category: 'materials',
        amountCents: 12_345,
        incurredOn: '2026-10-26',
        note: 'Synthetic compound',
        recordedBy: { id: 'o', name: 'Synthetic Owner' },
        recordedAt: '2026-10-26T14:00:00.000Z',
        voided: null,
        actions: { void: true },
      },
    ],
    returnWork: { cost: f('incomplete', 1_250), entries: 1, caseIds: ['c1'] },
    history: [],
    report: { id: 'job_costs', basis: 'job_costs', unknown: 'incomplete' },
    margin: margin(),
    actions: { record: true },
    ...over,
  }
}

function mount(locale: StaffLocale, fetchImpl: typeof fetch) {
  return render(
    <JobCostsPage
      t={staffTranslator(locale).t}
      locale={locale}
      fetchImpl={fetchImpl}
      jobId={JOB}
      href={(to) => `/staff${to}`}
    />,
  )
}

describe('[HH-FIN-17][HH-DATA-10][T73] the job cost page', () => {
  it('never shows an unknown cost as $0.00 and states its sources', async () => {
    mount('en', vi.fn(async () => json(200, data())) as unknown as typeof fetch)
    const page = await screen.findByTestId('job-costs')
    const row = (l: string) => within(page).getByTestId(`job-cost-line-${l}`)
    expect(row('materials').textContent).toContain('$200.00')
    expect(row('materials').textContent).toContain('$123.45 so far (incomplete)')
    expect(row('labor').textContent).toContain('Not configured')
    expect(row('rental').textContent).toContain('Not estimated')
    expect(row('rental').textContent).toContain('Not recorded')
    for (const l of LINES) expect(row(l).textContent).not.toContain('$0.00')
    expect(within(page).getByTestId('job-cost-total').textContent).toContain('$123.45 so far (incomplete)')
    expect(within(page).getByTestId('job-costs-sources').textContent).toMatch(/not revenue or money received/)
    expect(within(page).getByText(/stays incomplete until the job is operationally complete/)).toBeTruthy()
    const labor = within(page).getByTestId('job-costs-labor')
    expect(labor.textContent).toMatch(/95 minutes known so far; 1 worker's time is missing or not finished/)
    expect(labor.textContent).toContain('labor $39.58, burden not known')
    expect(labor.textContent).toContain('No labor cost rate')
    expect(within(page).getByTestId('job-costs-return-work').textContent).toContain('$12.50 so far (incomplete)')
  })

  it('shows $0.00 only for a category the Owner confirmed with no entry', async () => {
    const d = data()
    d.lines = d.lines.map((l) =>
      l.line === 'disposal'
        ? {
            ...l,
            actual: f('complete', 0),
            confirmed: { by: { id: 'o', name: 'Synthetic Owner' }, at: '2026-10-26T15:00:00.000Z' },
            actions: { confirm: false, reopen: true },
          }
        : l,
    )
    mount('en', vi.fn(async () => json(200, d)) as unknown as typeof fetch)
    const page = await screen.findByTestId('job-costs')
    expect(within(page).getByTestId('job-cost-line-disposal').textContent).toMatch(
      /\$0\.00.*Confirmed by Synthetic Owner/,
    )
    expect(within(page).getByRole('button', { name: 'Reopen Disposal' })).toBeTruthy()
  })

  it('records a cost in integer cents and confirms a category', async () => {
    const posts: { url: string; body: unknown }[] = []
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posts.push({ url, body: JSON.parse(String(init.body)) })
        return json(url.endsWith('/costs') ? 201 : 200, data())
      }
      return json(200, data())
    })
    mount('en', fetchImpl as unknown as typeof fetch)
    const page = await screen.findByTestId('job-costs')
    const form = within(page).getByRole('form', { name: 'Record a cost' })
    fireEvent.change(within(form).getByLabelText('Category'), { target: { value: 'rental' } })
    fireEvent.change(within(form).getByLabelText('Amount (USD)'), { target: { value: '40.05' } })
    fireEvent.change(within(form).getByLabelText('Date incurred'), { target: { value: '2026-10-20' } })
    fireEvent.change(within(form).getByLabelText('What it was'), { target: { value: ' Synthetic ladder ' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Record cost' }))
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toEqual({
      url: `/api/v1/staff/jobs/${JOB}/costs`,
      body: { category: 'rental', amountCents: 4005, incurredOn: '2026-10-20', note: 'Synthetic ladder' },
    })
    fireEvent.click(within(page).getByRole('button', { name: 'Confirm Materials' }))
    await waitFor(() => expect(posts).toHaveLength(2))
    expect(posts[1]?.url).toBe(`/api/v1/staff/jobs/${JOB}/cost-categories/materials/actions/confirm`)
  })

  it('names a refusal in words', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === 'POST'
        ? json(409, { error: { code: 'CONFLICT', fieldErrors: [{ field: 'category', code: 'CATEGORY_CONFIRMED' }] } })
        : json(200, data()),
    )
    mount('en', fetchImpl as unknown as typeof fetch)
    const page = await screen.findByTestId('job-costs')
    fireEvent.click(within(page).getByRole('button', { name: 'Confirm Materials' }))
    expect((await within(page).findByRole('alert')).textContent).toBe('This category is confirmed: reopen it first.')
  })

  it('offers no control without the server offering it, and is in Spanish for staff (RULE-LANGUAGES)', async () => {
    const d = data({ actions: { record: false } })
    d.lines = d.lines.map((l) => ({ ...l, actions: { confirm: false, reopen: false } }))
    d.entries = d.entries.map((e) => ({ ...e, actions: { void: false } }))
    mount('es', vi.fn(async () => json(200, d)) as unknown as typeof fetch)
    const page = await screen.findByTestId('job-costs')
    expect(within(page).queryByRole('form')).toBeNull()
    expect(within(page).queryByRole('button')).toBeNull()
    expect(within(page).getByTestId('job-cost-line-labor').textContent).toContain('No configurado')
    expect(within(page).getByTestId('job-cost-line-materials').textContent).toContain('hasta ahora (incompleto)')
  })

  it('[HH-FIN-20] shows no margin percentage until it is final, and names why', async () => {
    mount('en', vi.fn(async () => json(200, data())) as unknown as typeof fetch)
    const section = await screen.findByTestId('job-margin')
    expect(within(section).getByTestId('job-margin-target').textContent).toContain('Target: 30.00% (advisory')
    expect(within(section).getByTestId('job-margin-flag').textContent).toBe('Margin not final')
    const actual = within(section).getByTestId('job-margin-actual')
    expect(actual.textContent).toContain('Not invoiced yet')
    expect(actual.textContent).toMatch(/Not final: No final invoice issued yet.*Some costs are not final/)
    expect(actual.textContent).not.toMatch(/\d+\.\d{2}%/)
    expect(within(section).getByText('16.67%')).toBeTruthy()
    expect(within(section).getByTestId('job-margin-variance').textContent).toContain('not available')
    expect(within(section).queryByRole('form')).toBeNull()
  })

  it('[HH-FIN-20] flags a final margin below the target as advisory and records the reason', async () => {
    const flagged = data({
      margin: margin({
        revenue: {
          state: 'complete',
          cents: 60_000,
          invoicedCents: 65_000,
          refundsCents: 5_000,
          creditsCents: 0,
          gaps: [],
        },
        actual: {
          state: 'complete',
          revenueCents: 60_000,
          costCents: 48_000,
          grossProfitCents: 12_000,
          marginBps: 2000,
          gaps: [],
        },
        varianceBps: 333,
        profitVarianceCents: 2_000,
        flag: 'below_target',
        actions: { review: true },
      }),
    })
    const posts: { url: string; body: unknown }[] = []
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posts.push({ url, body: JSON.parse(String(init.body)) })
        return json(201, flagged)
      }
      return json(200, flagged)
    })
    mount('en', fetchImpl as unknown as typeof fetch)
    const section = await screen.findByTestId('job-margin')
    expect(within(section).getByTestId('job-margin-flag').textContent).toBe('Below the target margin')
    expect(within(section).getByText(/Advisory only/)).toBeTruthy()
    expect(within(section).getByTestId('job-margin-actual').textContent).toMatch(
      /\$600\.00.*\$480\.00.*\$120\.00.*20\.00%/,
    )
    expect(within(section).getByTestId('job-margin-variance').textContent).toContain('3.33% ($20.00 gross profit)')
    const form = within(section).getByRole('form', { name: 'Record the reason' })
    fireEvent.change(within(form).getByLabelText('Reason'), { target: { value: 'material_overrun' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Record the reason' }))
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toEqual({ url: `/api/v1/staff/jobs/${JOB}/margin-reviews`, body: { reason: 'material_overrun' } })
  })

  it('says when only the Owner may see it', async () => {
    mount(
      'en',
      vi.fn(async () => json(403, { error: { code: 'FORBIDDEN', fieldErrors: [] } })) as unknown as typeof fetch,
    )
    expect(await screen.findByText("Only the Owner sees a job's costs.")).toBeTruthy()
  })
})
