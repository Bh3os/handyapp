// A project's visits on the request record (TSK-0061; HH-SCH-01, HH-SCH-02, T37, T41). The API is a synthetic stand-in
// (RULE-SYNTHETIC-DATA). The windows are read in the visit's own zone, whatever this machine's zone is.
import { staffTranslator } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProjectVisitsSection, type ProjectVisits, type Visit } from '../src/Visits'

afterEach(cleanup)

const PROJECT = '33333333-3333-4333-8333-333333333333'
const VISIT = '44444444-4444-4444-8444-444444444444'
const JOB = '55555555-5555-4555-8555-555555555555'
const ZONE = 'America/Kentucky/Louisville'
const OFFICE = { id: 'staff-1', name: 'Synthetic Office' }
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const window = (over: Partial<Visit['window']> = {}): Visit['window'] => ({
  localDate: '2026-11-01',
  start: '01:30',
  end: '03:00',
  timeZone: ZONE,
  startOffset: '-05:00',
  endOffset: '-05:00',
  startsAt: '2026-11-01T06:30:00.000Z',
  endsAt: '2026-11-01T08:00:00.000Z',
  withinVisitHours: false,
  ...over,
})
const visit = (over: Partial<Visit> = {}): Visit => ({
  id: VISIT,
  purpose: 'site_estimate',
  state: 'tentative',
  version: 2,
  jobId: null,
  window: window(),
  windowVersion: 2,
  expectedDurationMinutes: 45,
  preparationBufferMinutes: null,
  travelBufferMinutes: null,
  requiredWorkers: 1,
  equipment: [],
  createdBy: OFFICE,
  createdAt: '2026-10-21T15:00:00.000Z',
  history: [
    {
      windowVersion: 2,
      window: window(),
      visitState: 'tentative',
      setBy: OFFICE,
      setAt: '2026-10-21T16:00:00.000Z',
      reason: 'Synthetic: the customer asked',
    },
    {
      windowVersion: 1,
      window: window({
        localDate: '2026-10-31',
        start: '09:00',
        end: '11:00',
        startOffset: '-04:00',
        endOffset: '-04:00',
        startsAt: '2026-10-31T13:00:00.000Z',
        endsAt: '2026-10-31T15:00:00.000Z',
        withinVisitHours: true,
      }),
      visitState: 'tentative',
      setBy: OFFICE,
      setAt: '2026-10-21T15:00:00.000Z',
      reason: null,
    },
  ],
  actions: { changeWindow: true },
  ...over,
})
const data = (over: Partial<ProjectVisits> = {}): ProjectVisits => ({
  projectId: PROJECT,
  projectState: 'open',
  timeZone: ZONE,
  businessTimeZone: { zone: ZONE, proposed: true },
  visitHours: { open: '08:00', close: '22:00' },
  job: null,
  schedulingTask: null,
  actions: { planEstimateVisit: true, planWorkVisit: false },
  visits: [visit()],
  ...over,
})

function renderSection(fetchImpl: ReturnType<typeof vi.fn>, locale: 'en' | 'es' = 'en') {
  const { t } = staffTranslator(locale)
  render(
    <ProjectVisitsSection t={t} locale={locale} fetchImpl={fetchImpl as unknown as typeof fetch} projectId={PROJECT} />,
  )
}

describe('[HH-SCH-01][T37] the project visits on the request record', () => {
  it('[T37][HH-SCH-02] shows each visit with its purpose, tentative state, zone, offsets and window history', async () => {
    renderSection(vi.fn(async () => json(200, data())))
    const item = await screen.findByTestId('visit')
    expect(within(item).getByText('Estimate visit')).toBeTruthy()
    expect(within(item).getByText('Tentative: not a booking')).toBeTruthy()
    expect(within(item).getByTestId('visit-window').textContent).toBe(
      'Sunday, November 1, 2026, 1:30 AM EST – 3:00 AM EST (America/Kentucky/Louisville)',
    )
    expect(within(item).getByTestId('visit-utc').textContent).toContain('-05:00')
    expect(within(item).getByText('The project (no job, no price approval)')).toBeTruthy()
    expect(within(item).getByText('Outside the visit hours: it cannot be confirmed like this.')).toBeTruthy()
    expect(within(item).getByTestId('visit-window-reason').textContent).toBe('Reason: Synthetic: the customer asked')
    expect(within(item).getByTestId('visit-history').textContent).toContain(
      'Window 1: Saturday, October 31, 2026, 9:00 AM EDT – 11:00 AM EDT (America/Kentucky/Louisville)',
    )
    expect(
      screen.getByText("America/Kentucky/Louisville (PROPOSED: waiting for the owner's confirmation)"),
    ).toBeTruthy()
    expect(screen.getByTestId('visits-job').textContent).toBe(
      'No job yet: work visits are planned after the estimate is approved.',
    )
  })

  it('[T37] a work visit shows its job, and the scheduling task stays apart', async () => {
    renderSection(
      vi.fn(async () =>
        json(
          200,
          data({
            projectState: 'approved',
            job: { id: JOB, scopeVersion: 1 },
            schedulingTask: { state: 'planning' },
            actions: { planEstimateVisit: false, planWorkVisit: true },
            visits: [visit({ purpose: 'service', jobId: JOB, history: [] })],
          }),
        ),
      ),
      'es',
    )
    const item = await screen.findByTestId('visit')
    expect(within(item).getByText('Visita de trabajo')).toBeTruthy()
    expect(within(item).getByText('El trabajo (alcance aprobado)')).toBeTruthy()
    expect(screen.getByTestId('visits-job').textContent).toBe('Trabajo creado, versión del alcance 1')
    expect(screen.getByTestId('visits-task').textContent).toBe('En planificación')
    const purpose = screen.getByLabelText('Propósito de la visita') as HTMLSelectElement
    expect([...purpose.options].map((o) => o.value)).toEqual(['service', 'follow_up', 'return_work'])
  })
})

describe('[HH-SCH-02][T41] entering a window in the visit zone', () => {
  it('[T41] a time in the spring-forward gap is named at once; the server refusal is shown', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST')
        return json(400, {
          error: { code: 'VALIDATION_FAILED', fieldErrors: [{ field: 'body.windowStart', code: 'LOCAL_TIME_GAP' }] },
        })
      return json(200, data({ visits: [] }))
    })
    renderSection(fetchImpl)
    await screen.findByText('Plan a tentative visit')
    fireEvent.change(screen.getByLabelText('Date', { exact: false }), { target: { value: '2026-03-08' } })
    fireEvent.change(screen.getByLabelText('Arrival window starts', { exact: false }), { target: { value: '02:30' } })
    fireEvent.change(screen.getByLabelText('Arrival window ends', { exact: false }), { target: { value: '04:00' } })
    expect(screen.getByTestId('windowStart-gap').textContent).toBe(
      '02:30 does not exist on 2026-03-08 in America/Kentucky/Louisville: the clocks jump from 02:00 to 03:00. Choose another time.',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Plan tentative visit' }))
    await waitFor(() =>
      expect(
        screen.getByText(
          "This time does not exist on this date in the visit's time zone (the clocks move forward). Choose another time.",
        ),
      ).toBeTruthy(),
    )
  })

  it('[T41] a time in the repeated hour asks which reading and sends its offset', async () => {
    const bodies: unknown[] = []
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        bodies.push(JSON.parse(String(init.body)))
        return json(201, data())
      }
      return json(200, data({ visits: [] }))
    })
    renderSection(fetchImpl)
    await screen.findByText('Plan a tentative visit')
    fireEvent.change(screen.getByLabelText('Date', { exact: false }), { target: { value: '2026-11-01' } })
    fireEvent.change(screen.getByLabelText('Arrival window starts', { exact: false }), { target: { value: '01:30' } })
    fireEvent.change(screen.getByLabelText('Arrival window ends', { exact: false }), { target: { value: '03:00' } })
    const group = screen.getByRole('group', { name: '01:30 happens twice on this date. Which one?' })
    const readings = within(group).getAllByRole('radio')
    expect(readings.map((r) => (r as HTMLInputElement).value)).toEqual(['-04:00', '-05:00'])
    expect(within(group).getByText('1:30 AM EDT (UTC -04:00)')).toBeTruthy()
    fireEvent.click(within(group).getByLabelText('1:30 AM EST (UTC -05:00)'))
    fireEvent.change(screen.getByLabelText('Expected work (minutes)'), { target: { value: '45' } })
    fireEvent.click(screen.getByRole('button', { name: 'Plan tentative visit' }))
    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toEqual({
      purpose: 'site_estimate',
      localDate: '2026-11-01',
      windowStart: '01:30',
      windowEnd: '03:00',
      startOffset: '-05:00',
      endOffset: null,
      expectedDurationMinutes: 45,
      preparationBufferMinutes: null,
      travelBufferMinutes: null,
      requiredWorkers: null,
      equipment: [],
    })
    const [url, init] = fetchImpl.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'POST') as [
      string,
      RequestInit,
    ]
    expect(url).toBe(`/api/v1/staff/projects/${PROJECT}/visits`)
    expect((init.headers as Record<string, string>)['idempotency-key']).toMatch(/^staff-/)
  })

  it('[HH-SCH-01] changing a window sends the version shown; a stale version offers the current visit', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST')
        return json(409, { error: { code: 'STALE_VERSION', fieldErrors: [], current: { version: 3 } } })
      return json(200, data())
    })
    renderSection(fetchImpl)
    fireEvent.click(await screen.findByRole('button', { name: 'Change the window' }))
    const item = screen.getByTestId('visit')
    fireEvent.change(within(item).getByLabelText('Date', { exact: false }), { target: { value: '2026-11-02' } })
    fireEvent.click(within(item).getByRole('button', { name: 'Save the new window' }))
    await screen.findByText('Someone changed this visit since you opened it. Nothing was saved.')
    const post = fetchImpl.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'POST') as [
      string,
      RequestInit,
    ]
    expect(post[0]).toBe(`/api/v1/staff/visits/${VISIT}/window`)
    expect((post[1].headers as Record<string, string>)['if-match']).toBe('"2"')
  })

  it('[HH-DATA-06] with the business time zone NOT CONFIGURED nothing can be planned', async () => {
    renderSection(
      vi.fn(async () =>
        json(200, data({ businessTimeZone: null, actions: { planEstimateVisit: false, planWorkVisit: false } })),
      ),
    )
    await screen.findByText('The business time zone is not configured, so no visit can be planned.')
    expect(screen.queryByText('Plan a tentative visit')).toBeNull()
  })

  it('[RULE-SERVER-AUTHZ] a role without the scheduling view sees no section', async () => {
    const fetchImpl = vi.fn(async () => json(403, { error: { code: 'FORBIDDEN', fieldErrors: [] } }))
    renderSection(fetchImpl)
    await waitFor(() => expect(fetchImpl).toHaveBeenCalled())
    expect(screen.queryByTestId('project-visits')).toBeNull()
  })
})

describe('[HH-SCH-06][HH-SCH-05][T36][T40] a tentative visit says what stops its confirmation (TSK-0064)', () => {
  it('[HH-SCH-06][T36][T40] lists the unmet preconditions in English and Spanish and offers no Confirm', async () => {
    const blocked = visit({
      purpose: 'service',
      jobId: JOB,
      history: [],
      window: window({ withinVisitHours: true }),
      confirmationBlockers: [
        { field: 'deposit', code: 'DEPOSIT_REQUIRED' },
        { field: 'holds.66666666-6666-4666-8666-666666666666', code: 'REVIEW_HOLD_OPEN' },
        { field: 'holds.77777777-7777-4777-8777-777777777777', code: 'REVIEW_HOLD_OPEN' },
      ],
      actions: { changeWindow: true, confirm: false, offerWindows: false },
    })
    const body = data({ projectState: 'approved', job: { id: JOB, scopeVersion: 1 }, visits: [blocked] })
    renderSection(vi.fn(async () => json(200, body)))
    const list = await screen.findByTestId('visit-blockers')
    expect(within(list).getByText('Not ready to confirm')).toBeTruthy()
    // Every reason once, however many holds share it.
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      "The job's required deposit is not covered by verified money or waived by the Owner yet, so no work visit can be planned.",
      'A review hold on this project is open or under review. No visit can be confirmed until the Owner resolves it.',
    ])
    expect(screen.queryByRole('button', { name: 'Confirm with workers' })).toBeNull()
    cleanup()
    renderSection(
      vi.fn(async () => json(200, body)),
      'es',
    )
    expect(within(await screen.findByTestId('visit-blockers')).getByText('Aún no se puede confirmar')).toBeTruthy()
  })

  it('[HH-SCH-06] shows nothing when nothing stops it, and nothing for a confirmed visit', async () => {
    renderSection(
      vi.fn(async () =>
        json(
          200,
          data({
            visits: [
              visit({ confirmationBlockers: [] }),
              visit({ id: '88888888-8888-4888-8888-888888888888', state: 'confirmed', confirmationBlockers: null }),
            ],
          }),
        ),
      ),
    )
    expect(await screen.findAllByTestId('visit')).toHaveLength(2)
    expect(screen.queryByTestId('visit-blockers')).toBeNull()
  })
})
