// The Start Work briefing and gate, and the Owner's review (TSK-0073, TSK-0074; HH-WORK-01, HH-WORK-02, HH-WORK-03,
// HH-WORK-04, T40, T45, T46, OWN-DEC-172, OWN-DEC-208). The API is a synthetic stand-in; every name, note and reference
// is synthetic (RULE-SYNTHETIC-DATA).
import { staffTranslator, type StaffLocale } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StartReviewPage, StartWorkPage, type StartGateView, type StartReviewView } from '../src/StartWork'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const VISIT = '11111111-1111-4111-8111-111111111173'
const JOB = '22222222-2222-4222-8222-222222222273'
const WP = '33333333-3333-4333-8333-333333333373'
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const ITEMS = [
  'assignment',
  'site_identity',
  'scope_acknowledged',
  'sop_language',
  'job_holds',
  'safety_holds',
  'critical_resources',
  'site_condition',
  'before_photos',
  'deposit',
]

function gate(over: Partial<StartGateView> = {}, missing: Record<string, string[]> = {}): StartGateView {
  return {
    visitId: VISIT,
    visitNumber: 2,
    visitState: 'arrived',
    jobId: JOB,
    projectReference: 'HH-SYNTH-73',
    checkedAt: '2026-10-22T14:00:00.000Z',
    outcome: Object.keys(missing).length ? 'blocked' : 'ready',
    items: ITEMS.map((item) => ({
      item,
      state: missing[item] ? 'missing' : 'met',
      missing: (missing[item] ?? []).map((code) => ({
        code,
        ref: null,
        severity: 'blocked',
        resolutionOwner: 'owner',
        exceptable: null,
        exceptionId: null,
      })),
    })),
    packet: { version: 7, contentSha256: 'a'.repeat(64) },
    workPackages: [{ workPackageId: WP, serviceCode: 'DW-01', beforePhotos: 1 }],
    siteCheck: null,
    exceptions: [],
    started: null,
    emergency: { call911: 'tel:911' },
    actions: {
      start: Object.keys(missing).length === 0,
      recordSiteCheck: true,
      uploadBeforePhotos: true,
      requestException: [],
    },
    ...over,
  }
}

function mount(locale: StaffLocale, fetchImpl: typeof fetch) {
  return render(
    <StartWorkPage
      t={staffTranslator(locale).t}
      locale={locale}
      fetchImpl={fetchImpl}
      visitId={VISIT}
      href={(to) => `/staff${to}`}
    />,
  )
}

describe('[HH-WORK-01][T46] the Start Work briefing', () => {
  it('[OWN-DEC-172] Call 911 comes first, before anything has loaded, as a plain phone link', () => {
    const fetchImpl = vi.fn(() => new Promise<Response>(() => undefined))
    const { container } = mount('en', fetchImpl as unknown as typeof fetch)
    const call = screen.getByRole('link', { name: 'Call 911 — Immediate Emergency' })
    expect(call.getAttribute('href')).toBe('tel:911')
    // The very first interactive element of the page.
    expect(container.querySelector('a, button, input')).toBe(call)
  })

  it('names every prerequisite and who resolves what is missing; Start stays off until the server says ready', async () => {
    const fetchImpl = vi.fn(async () => json(200, gate({}, { safety_holds: ['CRITICAL_HOLD_OPEN'] })))
    mount('en', fetchImpl as unknown as typeof fetch)
    const list = await screen.findByTestId('start-items')
    expect(
      within(list)
        .getAllByRole('listitem')
        .filter((li) => li.dataset['item']),
    ).toHaveLength(10)
    expect(within(list).getByText('A critical safety hold is open.')).toBeTruthy()
    expect(within(list).getByText('Resolved by the Owner')).toBeTruthy()
    const start = screen.getByRole('button', { name: 'Start Work' })
    expect(start.getAttribute('disabled')).not.toBeNull()
    expect(screen.getByText('Start Work opens once every requirement above is met.')).toBeTruthy()
  })

  it('sends only the packet version shown; a refusal reloads the gate and says so', async () => {
    const calls: { url: string; body: unknown }[] = []
    let n = 0
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null })
      if (url.endsWith('/start')) return json(409, { error: { code: 'CONFLICT', fieldErrors: [] } })
      n++
      return json(200, n === 1 ? gate() : gate({}, { safety_holds: ['CRITICAL_HOLD_OPEN'] }))
    })
    mount('en', fetchImpl as unknown as typeof fetch)
    fireEvent.click(await screen.findByRole('button', { name: 'Start Work' }))
    expect(await screen.findByTestId('start-refusal')).toBeTruthy()
    const post = calls.find((c) => c.url.endsWith(`/staff/visits/${VISIT}/start`))
    expect(post?.body).toEqual({ packetVersion: 7 })
    await waitFor(() => expect(screen.getByText('A critical safety hold is open.')).toBeTruthy())
  })

  it('[T45] the Spanish-reading worker sees "Revisión de seguridad en español pendiente"; no override exists', async () => {
    const fetchImpl = vi.fn(async () =>
      json(200, gate({ outcome: 'requires_review' }, { sop_language: ['SPANISH_SAFETY_REVIEW_PENDING'] })),
    )
    mount('es', fetchImpl as unknown as typeof fetch)
    expect(await screen.findByText('Revisión de seguridad en español pendiente')).toBeTruthy()
    expect(screen.queryByText(/override|anular/i)).toBeNull()
    expect(screen.getByRole('link', { name: 'Llamar al 911 — Emergencia inmediata' })).toBeTruthy()
  })

  it('offers only the exception kinds the server lists, never one for a hold', async () => {
    const fetchImpl = vi.fn(async () =>
      json(
        200,
        gate(
          {
            actions: {
              start: false,
              recordSiteCheck: false,
              uploadBeforePhotos: false,
              requestException: ['customer_not_present'],
            },
          },
          { site_identity: ['CUSTOMER_NOT_PRESENT'] },
        ),
      ),
    )
    mount('en', fetchImpl as unknown as typeof fetch)
    const form = await screen.findByRole('form', { name: 'Request an administrative exception' })
    expect(
      within(form)
        .getAllByRole('radio')
        .map((r) => r.parentElement?.textContent),
    ).toEqual(['Customer not present'])
  })
})

describe('[HH-WORK-02][HH-WORK-03] the Owner review page', () => {
  const view = (over: Partial<StartReviewView> = {}): StartReviewView => ({
    jobId: JOB,
    projectReference: 'HH-SYNTH-73',
    jobState: 'pending_preparation',
    holds: [
      {
        holdId: 'h1',
        kind: 'job_requirement',
        category: 'permit_licensing',
        source: 'job_hold',
        state: 'open',
        version: 1,
        note: 'Synthetic: permit check',
        raisedBy: { id: 's1', name: 'Synthetic Office' },
        raisedAt: '2026-10-22T13:00:00.000Z',
        resolutionNote: null,
        actions: { setReady: true, startReview: false, resolve: false, cancel: false },
      },
      {
        holdId: 'h2',
        kind: 'critical_safety',
        category: 'live_wiring',
        source: 'hazard_report',
        state: 'open',
        version: 1,
        note: 'Synthetic: exposed wiring',
        raisedBy: { id: 'o', name: 'Synthetic Owner' },
        raisedAt: '2026-10-22T13:00:00.000Z',
        resolutionNote: null,
        actions: { setReady: false, startReview: false, resolve: false, cancel: false },
      },
    ],
    exceptions: [],
    followUpOwners: [],
    actions: { setHold: true },
    ...over,
  })

  it('sets Ready with a note on a job-level Hold; a critical hold the Owner raised offers no action', async () => {
    const posts: { url: string; body: unknown; ifMatch: string | null }[] = []
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posts.push({
          url,
          body: JSON.parse(String(init.body)),
          ifMatch: new Headers(init.headers).get('if-match'),
        })
        return json(200, { holdId: 'h1', kind: 'job_requirement', state: 'resolved', version: 3, jobId: JOB })
      }
      return json(200, view())
    })
    render(
      <StartReviewPage
        t={staffTranslator('en').t}
        locale="en"
        fetchImpl={fetchImpl as unknown as typeof fetch}
        jobId={JOB}
      />,
    )
    const holds = await screen.findByTestId('start-review-holds')
    const [job, critical] = within(holds)
      .getAllByRole('listitem')
      .filter((li) => li.dataset['kind'])
    expect(within(critical as HTMLElement).queryByRole('button')).toBeNull()
    fireEvent.change(within(job as HTMLElement).getByLabelText(/How the requirement was resolved/), {
      target: { value: 'Synthetic: permit not needed' },
    })
    fireEvent.click(within(job as HTMLElement).getByRole('button', { name: 'Set Ready' }))
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toEqual({
      url: '/api/v1/staff/job-holds/h1/actions/set-ready',
      body: { resolutionNote: 'Synthetic: permit not needed' },
      ifMatch: '"1"',
    })
  })
})
