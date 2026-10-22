// Stop Work / Report Hazard, issue reports and the job's reports (TSK-0077; HH-WORK-08, HH-WORK-09, HH-WORK-13,
// HH-OFF-03, HH-PKT-09, T48, T54, OWN-DEC-80, OWN-DEC-143, OWN-DEC-152, OWN-DEC-172). The API is a synthetic stand-in;
// every name, note and reference is synthetic (RULE-SYNTHETIC-DATA).
import { staffTranslator, type StaffLocale } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { holdNoteText, IssueReportForm, JobReports, StopWorkPanel, type ReportsView } from '../src/StopWork'

beforeEach(() => window.localStorage.clear())
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.localStorage.clear()
})

const JOB = '22222222-2222-4222-8222-222222222277'
const VISIT = '11111111-1111-4111-8111-111111111177'
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const answer = {
  reportId: 'r1',
  holdId: 'h1',
  holdState: 'open',
  jobState: 'paused',
  jobPaused: true,
  affectedWorkPackageIds: [],
  hazard: 'gas_leak',
  reviewer: 'gas_utility_or_licensed_gas_professional',
  guidance: ['evacuate_call_from_safe_place', 'never_gas_repair', 'keep_people_away', 'call_owner'],
  resolveOnSite: false,
  emergency: { call911: 'tel:911' },
  reportedAt: '2026-10-22T14:00:00.000Z',
}
const panel = (fetchImpl: typeof fetch, locale: StaffLocale = 'en') =>
  render(<StopWorkPanel t={staffTranslator(locale).t} fetchImpl={fetchImpl} jobId={JOB} visitId={VISIT} />)

describe('[HH-WORK-09][HH-WORK-13][OWN-DEC-172] Stop Work / Report Hazard', () => {
  it('Call 911 comes first and needs nothing; Stop Work is never disabled and needs no permission', () => {
    const fetchImpl = vi.fn()
    const { container } = panel(fetchImpl as unknown as typeof fetch)
    const call = screen.getByRole('link', { name: 'Call 911 — Immediate Emergency' })
    expect(call.getAttribute('href')).toBe('tel:911')
    // Call 911 is the first interactive element of the panel, before Stop Work.
    expect(container.querySelector('a, button')).toBe(call)
    const open = screen.getByRole('button', { name: 'Stop Work / Report Hazard' })
    expect(open.getAttribute('disabled')).toBeNull()
    expect(open.getAttribute('aria-disabled')).toBeNull()
    fireEvent.click(open)
    expect(screen.getByText(/You have the right to stop work\. Nobody's permission is needed/)).toBeTruthy()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('[T48] a gas leak shows evacuate-and-call guidance at once, offers no on-site fix, and sends the stop', async () => {
    const posts: { url: string; body: Record<string, unknown>; key: string | null }[] = []
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      posts.push({
        url,
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
        key: new Headers(init?.headers).get('idempotency-key'),
      })
      return json(201, answer)
    })
    panel(fetchImpl as unknown as typeof fetch)
    fireEvent.click(screen.getByRole('button', { name: 'Stop Work / Report Hazard' }))
    fireEvent.click(screen.getByLabelText('Suspected gas leak'))
    const guidance = screen.getByTestId('stop-guidance')
    expect(
      within(guidance).getByText(/Evacuate immediately\. From a safe location, call 911 or the gas utility\./),
    ).toBeTruthy()
    expect(within(guidance).getByText('Never attempt a gas repair.')).toBeTruthy()
    expect(screen.queryByText(/resolved it on site/i)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Stop work now' }))
    expect(await screen.findByText('Work stopped')).toBeTruthy()
    expect(posts).toHaveLength(1)
    expect(posts[0]?.url).toBe(`/api/v1/staff/jobs/${JOB}/hazard-reports`)
    expect(posts[0]?.key).toMatch(/^staff-/)
    expect(posts[0]?.body).toMatchObject({ hazard: 'gas_leak', visitId: VISIT, peopleKeptAway: false })
    expect(screen.getByText('Needs review by: the gas utility or a licensed gas professional')).toBeTruthy()
    expect(screen.getByText(/There is no on-site fix for this/)).toBeTruthy()
    // Nothing is left on the phone once the server has it.
    expect(window.localStorage.getItem('hh.staff.pendingStops')).toBeNull()
  })

  it('[HH-OFF-03] offline the stop shows at once, saved on the phone and "Not yet synchronized"; online it is sent once', async () => {
    const keys: (string | null)[] = []
    let online = false
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      keys.push(new Headers(init?.headers).get('idempotency-key'))
      if (!online) throw new TypeError('Failed to fetch')
      return json(201, answer)
    })
    panel(fetchImpl as unknown as typeof fetch)
    fireEvent.click(screen.getByRole('button', { name: 'Stop Work / Report Hazard' }))
    fireEvent.click(screen.getByLabelText('Exposed, potentially live wiring'))
    fireEvent.click(screen.getByRole('button', { name: 'Stop work now' }))
    expect(await screen.findByText('Saved on this phone')).toBeTruthy()
    expect(screen.getByTestId('stop-not-synced').textContent).toContain(
      'Not yet synchronized. The office has not been notified automatically.',
    )
    expect(within(screen.getByTestId('stop-guidance')).getByText(/Never touch or handle exposed/)).toBeTruthy()
    const saved = JSON.parse(window.localStorage.getItem('hh.staff.pendingStops') ?? '[]') as { body: unknown }[]
    expect(saved).toHaveLength(1)
    expect(saved[0]?.body).toMatchObject({ hazard: 'live_wiring' })
    online = true
    window.dispatchEvent(new Event('online'))
    expect(await screen.findByText('Work stopped')).toBeTruthy()
    // The same key both times: the server records it once.
    expect(new Set(keys).size).toBe(1)
    expect(window.localStorage.getItem('hh.staff.pendingStops')).toBeNull()
  })

  it('[HH-PKT-09] in Spanish: the owner’s Spanish emergency instruction and the Spanish Stop Work', () => {
    panel(vi.fn() as unknown as typeof fetch, 'es')
    expect(screen.getByRole('link', { name: 'Llamar al 911 — Emergencia inmediata' })).toBeTruthy()
    expect(
      screen.getByText(
        'Si hay una emergencia médica grave, un incendio, una fuga peligrosa de gas o cualquier peligro inmediato para la vida, llama al 911 sin esperar autorización. Avisa al propietario cuando sea seguro hacerlo.',
      ),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Detener el trabajo / Reportar un peligro' })).toBeTruthy()
  })
})

describe('[HH-WORK-08][OWN-DEC-80] Report an issue', () => {
  const form = (fetchImpl: typeof fetch) =>
    render(
      <IssueReportForm
        t={staffTranslator('en').t}
        fetchImpl={fetchImpl}
        jobId={JOB}
        workPackages={[{ workPackageId: 'wp1', serviceCode: 'DW-01' }]}
        onDone={() => undefined}
      />,
    )

  it('offers an on-site resolution only for a category that may have one, with the training-and-scope statement', async () => {
    const posts: unknown[] = []
    const fetchImpl = vi.fn(async (_u: string, init?: RequestInit) => {
      posts.push(JSON.parse(String(init?.body)))
      return json(201, { reportId: 'r2', holdId: null })
    })
    form(fetchImpl as unknown as typeof fetch)
    const category = screen.getByLabelText('What kind of issue')
    for (const c of ['unsafe_condition', 'incident']) {
      fireEvent.change(category, { target: { value: c } })
      expect(screen.queryByLabelText('I resolved it on site')).toBeNull()
      expect(screen.getByText(/never resolved on site/)).toBeTruthy()
    }
    fireEvent.change(category, { target: { value: 'unsafe_condition' } })
    expect(screen.getByText(/An unsafe condition stops work/)).toBeTruthy()
    fireEvent.change(category, { target: { value: 'material_problem' } })
    fireEvent.change(screen.getByLabelText('How serious'), { target: { value: 'minor' } })
    fireEvent.click(screen.getByLabelText('I resolved it on site'))
    fireEvent.click(screen.getByLabelText(/within my training and qualifications/))
    fireEvent.change(screen.getByLabelText(/Describe the issue/), { target: { value: 'Synthetic: wrong anchors' } })
    for (const [label, value] of [
      [/^What happened/, 'Synthetic: anchor spun'],
      [/The steps you took/, 'Synthetic: toggle anchor'],
      [/Materials used/, 'Synthetic: one anchor'],
      [/How you checked the result/, 'Synthetic: pull test'],
    ] as const)
      fireEvent.change(screen.getByLabelText(label), { target: { value } })
    fireEvent.click(screen.getByRole('button', { name: 'Send the report' }))
    expect(await screen.findByText('Report sent. The Owner is notified.')).toBeTruthy()
    expect(posts[0]).toMatchObject({
      category: 'material_problem',
      severity: 'minor',
      resolution: { withinTrainingAndScope: true, steps: 'Synthetic: toggle anchor' },
    })
    // A critical severity never offers it either.
    fireEvent.change(screen.getByLabelText('How serious'), { target: { value: 'critical' } })
    expect(screen.queryByLabelText('I resolved it on site')).toBeNull()
  })
})

describe('[T54][OWN-DEC-143][OWN-DEC-152] the job’s reports', () => {
  const view = (over: Partial<ReportsView['reports'][number]> = {}): ReportsView => ({
    jobId: JOB,
    projectReference: 'HH-SYNTH-77',
    jobState: 'paused',
    workPackages: [],
    actions: { reportHazard: true, reportIssue: true },
    reports: [
      {
        reportId: 'r1',
        kind: 'hazard',
        restricted: true,
        hazard: null,
        category: null,
        severity: 'critical',
        description: null,
        resolution: null,
        reviewer: null,
        hold: { holdId: 'h1', state: 'open', version: 1 },
        jobPaused: true,
        reportedBy: { id: '', name: null },
        reportedAt: '2026-10-22T14:00:00.000Z',
        photos: 0,
        stabilizations: [],
        review: null,
        customerNotice: [],
        actions: { addPhoto: false, recordStabilization: false, review: false },
        ...over,
      },
    ],
  })

  it('a restricted report reads as "Restricted report" with its status only', () => {
    render(
      <JobReports
        t={staffTranslator('en').t}
        locale="en"
        fetchImpl={vi.fn() as unknown as typeof fetch}
        view={view()}
        onChange={() => undefined}
      />,
    )
    const item = screen.getByTestId('stop-reports')
    expect(within(item).getByText('Restricted report')).toBeTruthy()
    expect(item.textContent).toContain('Critical')
    expect(item.textContent).not.toMatch(/injury/i)
    expect(within(item).queryByRole('button')).toBeNull()
  })

  it('the Owner releases the work-paused notice from the report', async () => {
    const posts: string[] = []
    const fetchImpl = vi.fn(async (url: string) => {
      posts.push(url)
      return json(200, { reportId: 'r1', deliveryId: 'd1', state: 'queued' })
    })
    render(
      <JobReports
        t={staffTranslator('en').t}
        locale="en"
        fetchImpl={fetchImpl as unknown as typeof fetch}
        view={view({
          restricted: false,
          hazard: 'gas_leak',
          customerNotice: [{ deliveryId: 'd1', state: 'draft', actions: { release: true, dismiss: true } }],
        })}
        onChange={() => undefined}
      />,
    )
    expect(screen.getByText(/Work-paused notice to the customer: Draft/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Release to the customer' }))
    await waitFor(() => expect(posts).toEqual(['/api/v1/staff/issue-reports/r1/notices/d1/release']))
  })

  it('a hold note that is a Stop Work code reads as its label', () => {
    const t = staffTranslator('en').t
    expect(holdNoteText(t, 'hazard_report:injury')).toBe('Injury or medical emergency')
    expect(holdNoteText(t, 'hazard_report:incident')).toBe('Incident')
    expect(holdNoteText(t, 'Synthetic: a written note')).toBe('Synthetic: a written note')
  })
})
