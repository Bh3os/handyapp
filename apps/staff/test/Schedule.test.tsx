// The scheduling board (TSK-0065; HH-SCH-13, HH-OPS-03, HH-A11Y-02, T42, T69). The API is a synthetic stand-in
// (RULE-SYNTHETIC-DATA): workers, references and hours are fixtures, never the business's. Times are read in the
// business zone, whatever this machine's zone is.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { staffTranslator } from '@handyhub/i18n'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/App'
import { ScheduleBoard, type Board, type BoardVisit } from '../src/Schedule'

afterEach(cleanup)

const ZONE = 'America/Kentucky/Louisville'
const ANN = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Synthetic Ann' }
const BEN = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Synthetic Ben' }
const OWNER = { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: 'Synthetic Owner' }
const V1 = '11111111-1111-4111-8111-111111111111'
const V2 = '22222222-2222-4222-8222-222222222222'
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const WEEK = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']
const at = (date: string, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number]
  // Eastern standard time after 2026-11-01: UTC-05:00.
  return new Date(
    Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8)), h + 5, m),
  ).toISOString()
}
const window = (date: string, start: string, end: string): BoardVisit['window'] => ({
  localDate: date,
  start,
  end,
  timeZone: ZONE,
  startOffset: '-05:00',
  endOffset: '-05:00',
  startsAt: at(date, start),
  endsAt: at(date, end),
  withinVisitHours: true,
})

const estimate = (over: Partial<BoardVisit> = {}): BoardVisit => ({
  id: V1,
  projectId: 'p1',
  projectReference: 'HH-SYN-0001',
  requestId: '99999999-9999-4999-8999-999999999999',
  purpose: 'site_estimate',
  state: 'confirmed',
  version: 3,
  window: window('2026-11-04', '09:00', '10:00'),
  windowVersion: 1,
  expectedDurationMinutes: 120,
  preparationBufferMinutes: 0,
  travelBufferMinutes: 30,
  requiredWorkers: 2,
  equipment: [],
  reservedRange: { startsAt: at('2026-11-04', '08:30'), endsAt: at('2026-11-04', '12:00') },
  team: [ANN, BEN].map((w, i) => ({
    worker: w,
    role: i === 0 ? 'lead' : 'member',
    kind: 'confirmed',
    startsAt: at('2026-11-04', '08:30'),
    endsAt: at('2026-11-04', '12:00'),
    holdExpiresAt: null,
    flags: [],
  })),
  items: [],
  openOffer: false,
  confirmationBlockers: null,
  actions: { changeWindow: true, confirm: false, offerWindows: false },
  ...over,
})
const work = (over: Partial<BoardVisit> = {}): BoardVisit => ({
  ...estimate(),
  id: V2,
  projectId: 'p2',
  projectReference: 'HH-SYN-0002',
  requestId: null,
  purpose: 'service',
  state: 'tentative',
  version: 1,
  window: window('2026-11-04', '13:00', '14:00'),
  expectedDurationMinutes: 60,
  travelBufferMinutes: null,
  requiredWorkers: 1,
  reservedRange: { startsAt: at('2026-11-04', '13:00'), endsAt: at('2026-11-04', '15:00') },
  team: [],
  confirmationBlockers: [{ field: 'deposit', code: 'DEPOSIT_REQUIRED' }],
  actions: { changeWindow: true, confirm: false, offerWindows: false },
  ...over,
})

function board(view: 'day' | 'week' = 'day', visits: BoardVisit[] = [estimate(), work()]): Board {
  const days = view === 'day' ? ['2026-11-04'] : WEEK
  const lane = (w: { id: string; name: string }, hours: boolean, role: 'lead' | 'member') => ({
    id: w.id,
    name: w.name,
    eligibleFor: { estimateVisits: true, workVisits: true },
    scheduleVersion: hours ? 1 : null,
    days: days.map((d) => {
      const busy = d === '2026-11-04' && hours && visits.some((v) => v.id === V1)
      return {
        date: d,
        working: hours ? [{ startsAt: at(d, '08:00'), endsAt: at(d, '18:00') }] : [],
        timeOff: [],
        free: hours ? [{ startsAt: at(d, '08:00'), endsAt: at(d, '18:00') }] : [],
        workingMinutes: hours ? 600 : 0,
        freeMinutes: hours ? (busy ? 390 : 600) : 0,
        entries: busy
          ? [
              {
                reservationId: `r-${w.id}`,
                visitId: V1,
                kind: 'confirmed',
                role,
                startsAt: at(d, '08:30'),
                endsAt: at(d, '12:00'),
                holdExpiresAt: null,
                flags: [],
              },
            ]
          : [],
      }
    }),
  })
  return {
    view,
    date: '2026-11-04',
    days,
    previous: view === 'day' ? '2026-11-03' : '2026-10-28',
    next: view === 'day' ? '2026-11-05' : '2026-11-11',
    timeZone: ZONE,
    timeZoneProposed: true,
    visitHours: { open: '08:00', close: '22:00' },
    windowOffers: null,
    focusVisitId: null,
    workers: [lane(ANN, true, 'lead'), lane(BEN, true, 'member'), lane(OWNER, false, 'lead')],
    unassigned: days.map((d) => ({
      date: d,
      visitIds: visits.filter((v) => v.team.length === 0 && v.window.localDate === d).map((v) => v.id),
    })),
    visits,
  }
}

type Handler = (url: string, init?: RequestInit) => Response | undefined
function api(...handlers: Handler[]) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    for (const h of handlers) {
      const r = h(url, init)
      if (r) return r
    }
    if (url.startsWith('/api/v1/staff/schedule')) {
      const view = new URL(url, 'http://x').searchParams.get('view') === 'week' ? 'week' : 'day'
      return json(200, board(view))
    }
    return json(404, { error: { code: 'NOT_FOUND', fieldErrors: [] } })
  })
}

function show(fetchImpl: ReturnType<typeof api>, locale: 'en' | 'es' = 'en', focusVisitId?: string) {
  const { t } = staffTranslator(locale)
  return render(
    <ScheduleBoard
      t={t}
      locale={locale}
      fetchImpl={fetchImpl}
      go={vi.fn()}
      href={(to) => `/staff${to}`}
      {...(focusVisitId ? { focusVisitId } : {})}
    />,
  )
}

const lane = (name: string) => screen.getByRole('region', { name })

describe('the scheduling board (TSK-0065, HH-SCH-13)', () => {
  it('[HH-SCH-13][T39] a day by worker: both workers carry the two-person visit; estimate and work visits differ in words; free time left', async () => {
    show(api())
    await screen.findByRole('heading', { level: 1, name: 'Scheduling board' })
    expect(screen.getByTestId('board-zone').textContent).toBe(
      `Times are in ${ZONE} (PROPOSED: waiting for the owner's confirmation).`,
    )
    for (const name of ['Synthetic Ann', 'Synthetic Ben']) {
      const l = lane(name)
      const entry = within(l).getByRole('button', { name: /Estimate visit/ })
      expect(entry.className).toContain('staff-board__entry--estimate')
      expect(entry.textContent).toContain('9:00')
      expect(entry.textContent).toContain('EST')
      expect(entry.textContent).toContain('Work 120 min · Travel 30 min · Preparation 0 min')
      expect(entry.textContent).toContain('Team: Synthetic Ann (lead), Synthetic Ben (team) · Needs 2 worker(s)')
      expect(within(l).getByTestId('board-capacity').textContent).toBe('Free: 6 h 30 min')
    }
    // Nothing is assumed for a worker without working hours.
    expect(within(lane('Synthetic Owner')).getByTestId('board-capacity').textContent).toBe('No working hours set')
    // The tentative work visit reserves no one: listed apart, in words.
    const pending = within(lane('Not assigned to a worker yet')).getByRole('button', { name: /Work visit/ })
    expect(pending.className).toContain('staff-board__entry--work')
    expect(pending.textContent).toContain('Tentative: not a booking')
    expect(pending.textContent).toContain('Travel Not entered')
    expect(pending.textContent).toContain('Not ready to confirm')
  })

  it('[HH-SCH-13] the week: seven days per worker; Previous and Next ask the server for the next range', async () => {
    const fetchImpl = api()
    show(fetchImpl)
    await screen.findByTestId('board-lanes')
    fireEvent.click(screen.getByRole('button', { name: 'Week' }))
    await waitFor(() => expect(within(lane('Synthetic Ann')).getAllByTestId('board-day')).toHaveLength(7))
    expect(screen.getByRole('button', { name: 'Week' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('board-range').textContent).toBe('Mon, Nov 2 to Sun, Nov 8, 2026')
    fireEvent.click(screen.getByRole('button', { name: 'Next week' }))
    await waitFor(() =>
      expect(fetchImpl.mock.calls.map(([u]) => String(u))).toContain(
        '/api/v1/staff/schedule?view=week&date=2026-11-11',
      ),
    )
  })

  it('[HH-SCH-13][HH-A11Y-02] the simple list: each visit once, in time order, with the free time left per worker', async () => {
    show(api())
    await screen.findByTestId('board-lanes')
    fireEvent.click(screen.getByRole('button', { name: 'List' }))
    const list = screen.getByTestId('board-list')
    const entries = within(list).getAllByTestId('board-entry')
    expect(entries.map((e) => e.getAttribute('data-visit'))).toEqual([V1, V2])
    expect(entries.every((e) => e.getAttribute('draggable') === 'false')).toBe(true)
    expect(within(list).getByTestId('board-list-capacity').textContent).toContain('Synthetic Ann: Free: 6 h 30 min')
    expect(within(list).getByTestId('board-list-capacity').textContent).toContain(
      'Synthetic Owner: No working hours set',
    )
  })

  it('[HH-OPS-03][T42][HH-API-04] a stale move shows the current values; redo sends the current version; nothing is retried', async () => {
    const posts: { url: string; init: RequestInit }[] = []
    let answer = 0
    const fetchImpl = api((url, init) => {
      if (init?.method !== 'POST') return undefined
      posts.push({ url, init })
      answer += 1
      if (answer === 1)
        return json(409, {
          error: {
            code: 'STALE_VERSION',
            fieldErrors: [],
            current: {
              version: 4,
              values: { state: 'confirmed', localDate: '2026-11-04', windowStart: '10:00', windowEnd: '11:00' },
            },
          },
        })
      return json(200, {})
    })
    show(fetchImpl)
    const entry = await within(await screen.findByRole('region', { name: 'Synthetic Ann' })).findByRole('button', {
      name: /Estimate visit/,
    })
    fireEvent.click(entry)
    const panel = screen.getByTestId('board-selected')
    // Opening a visit moves focus to it.
    await waitFor(() => expect(document.activeElement).toBe(within(panel).getByRole('heading', { level: 2 })))
    fireEvent.click(within(panel).getByRole('button', { name: 'Move' }))
    const form = within(panel).getByRole('form', { name: 'Move this visit' })
    // The keyboard alternative to dragging: one day later.
    fireEvent.click(within(form).getByRole('button', { name: 'One day later' }))
    expect((within(form).getByLabelText('Date') as HTMLInputElement).value).toBe('2026-11-05')
    fireEvent.click(within(form).getByRole('button', { name: 'Save the new window' }))
    const banner = await within(form).findByTestId('conflict-banner')
    const rows = within(banner)
      .getAllByRole('row')
      .slice(1)
      .map((r) => [...r.querySelectorAll('th, td')].map((c) => c.textContent))
    expect(rows).toEqual([
      ['Date', '2026-11-04', '2026-11-05'],
      ['Arrival window starts', '10:00', '09:00'],
      ['Arrival window ends', '11:00', '10:00'],
      ['Visit state', 'Confirmed', 'Confirmed'],
    ])
    expect(posts).toHaveLength(1)
    const first = posts[0]?.init.headers as Record<string, string>
    expect(first['if-match']).toBe('"3"')
    expect(first['idempotency-key']).toMatch(/^staff-/)
    fireEvent.click(within(banner).getByRole('button', { name: 'Review and redo my change' }))
    expect(within(form).queryByTestId('conflict-banner')).toBeNull()
    expect(posts).toHaveLength(1)
    fireEvent.click(within(form).getByRole('button', { name: 'Save the new window' }))
    await screen.findByText('The new window is saved.')
    const second = posts[1]?.init.headers as Record<string, string>
    expect(second['if-match']).toBe('"4"')
    expect(second['idempotency-key']).not.toBe(first['idempotency-key'])
    expect(JSON.parse(String(posts[1]?.init.body))).toEqual({
      localDate: '2026-11-05',
      windowStart: '09:00',
      windowEnd: '10:00',
      startOffset: null,
      endOffset: null,
    })
  })

  it('[T42][HH-SCH-04] a refused move says the booking stays as it was, with the alternatives', async () => {
    const fetchImpl = api((_url, init) =>
      init?.method === 'POST'
        ? json(409, {
            error: {
              code: 'CONFLICT',
              fieldErrors: [{ field: `workers.${ANN.id}`, code: 'WORKER_BOOKED' }],
              alternatives: { workers: [BEN], equipment: [], periods: [] },
            },
          })
        : undefined,
    )
    show(fetchImpl)
    fireEvent.click(
      await within(await screen.findByRole('region', { name: 'Synthetic Ann' })).findByRole('button', {
        name: /Estimate visit/,
      }),
    )
    fireEvent.click(within(screen.getByTestId('board-selected')).getByRole('button', { name: 'Move' }))
    const form = screen.getByRole('form', { name: 'Move this visit' })
    fireEvent.change(within(form).getByLabelText('Arrival window starts'), { target: { value: '14:00' } })
    fireEvent.change(within(form).getByLabelText('Arrival window ends'), { target: { value: '15:00' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Save the new window' }))
    const alert = await within(form).findByRole('alert')
    expect(alert.textContent).toContain('Nothing was changed: the booking stays exactly as it was.')
    expect(within(alert).getByTestId('capacity-alternatives').textContent).toContain('Synthetic Ben')
  })

  it('[HH-A11Y-02][OWN-DEC-119] dragging to another day only fills the Move form; nothing is saved until Save', async () => {
    const fetchImpl = api()
    show(fetchImpl)
    await screen.findByTestId('board-lanes')
    fireEvent.click(screen.getByRole('button', { name: 'Week' }))
    await waitFor(() => expect(within(lane('Synthetic Ann')).getAllByTestId('board-day')).toHaveLength(7))
    const ann = lane('Synthetic Ann')
    const item = within(ann).getByTestId('board-entry')
    expect(item.getAttribute('draggable')).toBe('true')
    const data = new Map<string, string>()
    const dataTransfer = {
      setData: (k: string, v: string) => data.set(k, v),
      getData: (k: string) => data.get(k) ?? '',
      effectAllowed: '',
      dropEffect: '',
    }
    fireEvent.dragStart(item, { dataTransfer })
    const thursday = within(ann)
      .getAllByTestId('board-day')
      .find((d) => d.getAttribute('data-date') === '2026-11-05') as HTMLElement
    expect(thursday.getAttribute('data-drop')).toBe('ok')
    // Another worker's lane is not a drop target here: reassigning is its own action.
    const owner = within(lane('Synthetic Owner'))
      .getAllByTestId('board-day')
      .find((d) => d.getAttribute('data-date') === '2026-11-05') as HTMLElement
    expect(owner.getAttribute('data-drop')).toBeNull()
    fireEvent.dragOver(thursday, { dataTransfer })
    fireEvent.drop(thursday, { dataTransfer })
    const form = await screen.findByRole('form', { name: 'Move this visit' })
    expect((within(form).getByLabelText('Date') as HTMLInputElement).value).toBe('2026-11-05')
    expect(within(form).getByRole('status').textContent).toBe(
      'Ready to move to Thu, Nov 5, 2026: check the times, then save.',
    )
    expect(fetchImpl.mock.calls.some(([, i]) => i?.method === 'POST')).toBe(false)
  })

  it('[HH-SCH-06] Confirm is offered only when the server offers it; the blockers are listed', async () => {
    show(
      api((url) =>
        url.startsWith('/api/v1/staff/schedule')
          ? json(
              200,
              board('day', [
                estimate(),
                work(),
                work({
                  id: 'v3',
                  confirmationBlockers: [],
                  actions: { changeWindow: true, confirm: true, offerWindows: false },
                }),
              ]),
            )
          : undefined,
      ),
    )
    const pending = await within(
      await screen.findByRole('region', { name: 'Not assigned to a worker yet' }),
    ).findAllByRole('button', {
      name: /Work visit/,
    })
    fireEvent.click(pending[0] as HTMLElement)
    let panel = screen.getByTestId('board-selected')
    expect(within(panel).getByTestId('board-blockers').textContent).toContain('Not ready to confirm')
    expect(within(panel).queryByRole('button', { name: 'Confirm with workers' })).toBeNull()
    fireEvent.click(pending[1] as HTMLElement)
    panel = screen.getByTestId('board-selected')
    expect(within(panel).getByRole('button', { name: 'Confirm with workers' })).toBeTruthy()
    // Closing returns focus to the entry that opened it.
    fireEvent.click(within(panel).getByRole('button', { name: 'Close the visit' }))
    await waitFor(() => expect(document.activeElement).toBe(pending[1]))
  })

  it('[RULE-DECIDED-VALUES-ACTIVE] without the business zone the board says it is not configured', async () => {
    show(
      api((url) =>
        url.startsWith('/api/v1/staff/schedule')
          ? json(503, { error: { code: 'NOT_CONFIGURED', fieldErrors: [] } })
          : undefined,
      ),
    )
    await screen.findByText('The business time zone is not configured, so the board cannot be shown.')
  })

  it('[HH-LANG-02] the board in Spanish', async () => {
    show(api(), 'es')
    await screen.findByRole('heading', { level: 1, name: 'Tablero de programación' })
    expect(within(lane('Synthetic Ann')).getByTestId('board-capacity').textContent).toBe('Libre: 6 h 30 min')
    expect(screen.getByRole('button', { name: 'Semana' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Lista' })).toBeTruthy()
  })
})

describe('the board route (TSK-0065)', () => {
  const session = {
    staffUserId: 'u-office',
    displayName: 'Synthetic office',
    email: 'office@example.test',
    locale: 'en',
    roles: ['office'],
    mfaEnrolled: false,
    mfaRecommended: false,
    csrfToken: 'synthetic-csrf-token',
    navigation: { home: 'queue', items: ['queue', 'schedule'], search: [] },
  }
  it('[HH-SCH-13] /schedule/<visit> (a queue link) opens the board on that visit, open', async () => {
    const fetchImpl = api(
      (url) => (url === '/api/v1/staff/auth/session' ? json(200, session) : undefined),
      (url) =>
        url.startsWith('/api/v1/staff/schedule') ? json(200, { ...board('day'), focusVisitId: V1 }) : undefined,
    )
    render(<App path={`/staff/schedule/${V1}`} base="/staff/" fetchImpl={fetchImpl} navigate={vi.fn()} />)
    const panel = await screen.findByTestId('board-selected')
    expect(within(panel).getByRole('heading', { level: 2 }).textContent).toBe('Estimate visit · Project HH-SYN-0001')
    expect(fetchImpl.mock.calls.map(([u]) => String(u))).toContain(`/api/v1/staff/schedule?view=day&visitId=${V1}`)
    expect(screen.getByRole('link', { name: 'Scheduling board' }).getAttribute('aria-current')).toBe('page')
  })
})
