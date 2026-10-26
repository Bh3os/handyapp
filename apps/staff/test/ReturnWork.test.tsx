// Return work on the case page and the worker's return-visit punch items (TSK-0094; HH-QA-07, HH-QA-08, HH-FIN-17,
// T56, FACT-WARRANTY, RULE-HUMAN-REVIEW, RULE-MONEY-CENTS). The API is a synthetic stand-in; every name, note, amount
// and reference is synthetic (RULE-SYNTHETIC-DATA).
import { staffTranslator, type StaffLocale } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReturnWorkItems, ReturnWorkSection, type ReturnWorkView } from '../src/ReturnWork'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const CASE = '11111111-1111-4111-8111-111111111194'
const RW = '22222222-2222-4222-8222-222222222294'
const JOB = '33333333-3333-4333-8333-333333333394'
const ITEM = '44444444-4444-4444-8444-444444444494'
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const NO_ACTIONS = {
  classify: false,
  decide: false,
  planVisit: false,
  linkVisit: false,
  linkJob: false,
  addItem: false,
  addCost: false,
}

function view(over: Partial<ReturnWorkView> = {}): ReturnWorkView {
  return {
    caseId: CASE,
    caseState: 'acknowledged',
    originalJob: { jobId: JOB, state: 'operationally_complete', projectReference: 'HH-SYNTH-94' },
    warranty: {
      reviewedCompletionOn: '2026-09-25',
      lastDayOn: '2026-12-24',
      reportedOn: '2026-10-25',
      within: true,
      days: 90,
      reviewState: 'passed',
    },
    workPackages: [{ id: 'wp-1', code: 'DW-01' }],
    workers: [{ id: 'w-1', name: 'Synthetic Ann' }],
    returnWork: null,
    actions: { ...NO_ACTIONS, classify: true },
    ...over,
  }
}
const classified = (over: Partial<NonNullable<ReturnWorkView['returnWork']>> = {}) => ({
  id: RW,
  version: 3,
  classification: 'warranty_claim',
  classificationNote: null,
  window: { reviewedCompletionOn: '2026-09-25', reportedOn: '2026-10-25', within: true },
  decision: null,
  returnJob: null,
  visits: [],
  items: [],
  costs: [
    {
      id: 'k1',
      kind: 'materials',
      amountCents: 2599,
      note: 'Synthetic tape',
      recordedBy: { id: 'o', name: 'Synthetic Office' },
      recordedAt: '2026-10-25T14:00:00.000Z',
      voided: null,
      actions: { void: false },
    },
  ],
  totals: { costCents: 2599, laborMinutes: 45, laborMinutesComplete: true, laborCost: 'incomplete' as const },
  history: [],
  ...over,
})

function mount(locale: StaffLocale, fetchImpl: typeof fetch) {
  return render(
    <ReturnWorkSection
      t={staffTranslator(locale).t}
      locale={locale}
      fetchImpl={fetchImpl}
      caseId={CASE}
      href={(to) => `/staff${to}`}
    />,
  )
}

describe('[HH-QA-07][FACT-WARRANTY] the return work of a case', () => {
  it('shows the warranty window as dates, never as coverage, and classifies with If-Match 0 the first time', async () => {
    const calls: { url: string; method: string; body: unknown; ifMatch: string | null }[] = []
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        url,
        method: init?.method ?? 'GET',
        body: init?.body ? JSON.parse(String(init.body)) : null,
        ifMatch: new Headers(init?.headers).get('if-match'),
      })
      if (init?.method === 'PUT') return json(200, { returnWorkId: RW, classification: 'warranty_claim', version: 1 })
      return json(200, view())
    })
    mount('en', fetchImpl as unknown as typeof fetch)
    const section = await screen.findByTestId('return-work')
    expect(within(section).getByTestId('return-work-window').textContent).toBe(
      'Reported 2026-10-25, within 90 days of the reviewed completion on 2026-09-25 (last day 2026-12-24).',
    )
    expect(within(section).getByText(/Nothing here applies coverage or an exclusion by itself/)).toBeTruthy()
    expect(within(section).getByTestId('return-work-original').textContent).toMatch(/never reopens it/)
    // No decision control without the Owner's action.
    expect(within(section).queryByRole('form', { name: "Owner's decision" })).toBeNull()
    fireEvent.change(within(section).getByLabelText('Classification'), { target: { value: 'workmanship_callback' } })
    fireEvent.click(within(section).getByRole('button', { name: 'Classify' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true))
    expect(calls.find((c) => c.method === 'PUT')).toEqual({
      url: `/api/v1/staff/cases/${CASE}/return-work`,
      method: 'PUT',
      body: { classification: 'workmanship_callback' },
      ifMatch: '"0"',
    })
  })

  it("[RULE-HUMAN-REVIEW] the Owner's decision records coverage, price and a note, and no amount", async () => {
    const posts: { url: string; body: unknown; ifMatch: string | null }[] = []
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posts.push({ url, body: JSON.parse(String(init.body)), ifMatch: new Headers(init.headers).get('if-match') })
        return json(200, { returnWorkId: RW, version: 4 })
      }
      return json(200, view({ returnWork: classified(), actions: { ...NO_ACTIONS, classify: true, decide: true } }))
    })
    mount('en', fetchImpl as unknown as typeof fetch)
    const section = await screen.findByTestId('return-work')
    expect(within(section).getByTestId('return-work-class').textContent).toBe('Warranty claim')
    expect(within(section).getByTestId('return-work-decision').textContent).toBe('Not decided yet.')
    expect(within(section).getByTestId('return-work-totals').textContent).toBe(
      'Costs recorded: $25.99 · Time on return visits: 45 min',
    )
    expect(within(section).getByText(/Labor cost is incomplete/)).toBeTruthy()
    const form = within(section).getByRole('form', { name: "Owner's decision" })
    fireEvent.change(within(form).getByLabelText('Price'), { target: { value: 'chargeable' } })
    fireEvent.change(within(form).getByLabelText('Why (your note)'), { target: { value: ' Synthetic reason ' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Record the decision' }))
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toEqual({
      url: `/api/v1/staff/return-work/${RW}/actions/decide`,
      body: { coverage: 'covered', price: 'chargeable', note: 'Synthetic reason' },
      ifMatch: '"3"',
    })
  })

  it('[HH-FIN-17][RULE-MONEY-CENTS] records a cost in integer cents; a refusal is named, in Spanish', async () => {
    const posts: { url: string; body: unknown }[] = []
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posts.push({ url, body: JSON.parse(String(init.body)) })
        return json(409, {
          error: { code: 'CONFLICT', message: '', fieldErrors: [{ field: 'state', code: 'CASE_CLOSED', message: '' }] },
        })
      }
      return json(200, view({ returnWork: classified(), actions: { ...NO_ACTIONS, addCost: true } }))
    })
    mount('es', fetchImpl as unknown as typeof fetch)
    const costs = await screen.findByTestId('return-work-costs')
    fireEvent.change(within(costs).getByLabelText(/Monto/), { target: { value: '12.50' } })
    fireEvent.change(within(costs).getByLabelText('Qué fue'), { target: { value: 'Sintético' } })
    fireEvent.click(within(costs).getByRole('button', { name: 'Registrar costo' }))
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toEqual({
      url: `/api/v1/staff/return-work/${RW}/costs`,
      body: { kind: 'materials', amountCents: 1250, note: 'Sintético' },
    })
    expect(await within(costs).findByRole('alert')).toBeTruthy()
  })
})

describe('[HH-QA-08] the worker records a correction only on a return visit they started', () => {
  it('waits for the start, then sends the note with the version shown', async () => {
    let started = false
    const posts: { url: string; body: unknown; ifMatch: string | null }[] = []
    const item = (correct: boolean) => ({
      id: ITEM,
      workPackageId: null,
      area: 'Synthetic hallway',
      description: 'Synthetic: re-tape the seam',
      requiredEvidence: 'Synthetic note',
      dueOn: '2026-10-27',
      state: 'open',
      correctionNote: null,
      version: 1,
      actions: { correct },
    })
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posts.push({ url, body: JSON.parse(String(init.body)), ifMatch: new Headers(init.headers).get('if-match') })
        return json(200, { itemId: ITEM, state: 'corrected', version: 2 })
      }
      return json(200, { jobId: JOB, items: [item(started)] })
    })
    const t = staffTranslator('en').t
    const first = render(<ReturnWorkItems t={t} fetchImpl={fetchImpl as unknown as typeof fetch} jobId={JOB} />)
    const list = await screen.findByTestId('return-work-own-items')
    expect(within(list).getByText(/Start work on this return visit first/)).toBeTruthy()
    expect(within(list).queryByRole('button', { name: 'Record correction' })).toBeNull()
    first.unmount()
    started = true
    render(<ReturnWorkItems t={t} fetchImpl={fetchImpl as unknown as typeof fetch} jobId={JOB} />)
    const again = await screen.findByTestId('return-work-own-items')
    fireEvent.change(within(again).getByLabelText('What you did'), { target: { value: 'Synthetic: done' } })
    fireEvent.click(within(again).getByRole('button', { name: 'Record correction' }))
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toEqual({
      url: `/api/v1/staff/return-work-items/${ITEM}/actions/correct`,
      body: { note: 'Synthetic: done' },
      ifMatch: '"1"',
    })
  })
})
