// My Day and the Arrived and Finished times (TSK-0070; HH-OFF-09, HH-SCH-08, HH-PORT-07, HH-WORK-06, T43, T47,
// OWN-DEC-121, OWN-DEC-149). The API is a synthetic stand-in (RULE-SYNTHETIC-DATA); names and addresses are synthetic.
import { staffTranslator } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setCsrfToken } from '../src/api'
import { MyDay, type MyDayVisit } from '../src/MyDay'
import { memoryStore, setOfflineStore } from '../src/offline/store'
import { VisitTimesPage, type VisitTimesView } from '../src/VisitTimes'

afterEach(cleanup)

const VISIT = '77777777-7777-4777-8777-777777777777'
const JOB = '88888888-8888-4888-8888-888888888888'
const ZONE = 'America/Kentucky/Louisville'
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const href = (to: string) => `/staff${to}`

const visit = (over: Partial<MyDayVisit> = {}): MyDayVisit => ({
  visitId: VISIT,
  number: 2,
  purpose: 'service',
  state: 'confirmed',
  version: 3,
  projectReference: 'HH-SYNTH-70',
  jobId: JOB,
  assignment: 'confirmed',
  role: 'lead',
  window: {
    localDate: '2026-11-05',
    start: '09:00',
    end: '10:00',
    timeZone: ZONE,
    startsAt: '2026-11-05T14:00:00.000Z',
    endsAt: '2026-11-05T15:00:00.000Z',
  },
  team: [
    { name: 'Synthetic Ann', role: 'lead' },
    { name: 'Synthetic Ben', role: 'member' },
  ],
  address: { street: '70 Synthetic Day Lane', unit: null, city: 'Testville', state: 'KY', zip: '40000' },
  directionsUrl: 'https://www.google.com/maps/dir/?api=1&destination=70%20Synthetic%20Day%20Lane',
  accessNotes: [
    {
      detail: 'access_notes',
      value: 'Synthetic: side gate',
      source: 'customer_call',
      confirmedAt: '2026-11-01T12:00:00Z',
    },
  ],
  preparation: { customerPreparation: 'Synthetic: clear the hallway', instructions: null },
  readiness: {
    packetVersion: 2,
    lastViewedVersion: null,
    changedSinceViewed: false,
    criticalSinceViewed: false,
    acknowledgment: 'required',
    blockers: [{ code: 'packet_not_viewed', count: 1 }],
  },
  mine: { departedAt: null, arrivedAt: null, finishedAt: null },
  next: 'on_my_way',
  onMyWayOpensAt: '2026-11-05T11:00:00.000Z',
  actions: { onMyWay: true, arrived: false, finished: false },
  ...over,
})
const day = (visits: MyDayVisit[]) => ({
  checkedAt: '2026-11-05T12:00:00.000Z',
  onMyWay: { state: 'configured', earliestMinutesBefore: 180 },
  visits,
})

/** Routes the synthetic API by path; the job packet list is empty. */
function api(routes: Record<string, (init?: RequestInit) => Response | Promise<Response>>) {
  return vi.fn(async (url: string | URL, init?: RequestInit) => {
    const path = String(url).replace('/api/v1', '')
    if (path === '/staff/my/job-packets') return json(200, { packets: [] })
    const route = routes[`${init?.method ?? 'GET'} ${path}`]
    return route ? route(init) : json(404, { error: { code: 'NOT_FOUND', fieldErrors: [] } })
  })
}

describe('My Day (TSK-0070)', () => {
  it('[HH-OFF-09][T43][OWN-DEC-40] today’s visit: window, address with a directions link, access notes, preparation, readiness and one 48 px next action; no ETA', async () => {
    const { t } = staffTranslator('en')
    const fetchImpl = api({ 'GET /staff/my/day': () => json(200, day([visit()])) })
    render(<MyDay t={t} locale="en" fetchImpl={fetchImpl as unknown as typeof fetch} href={href} />)
    const card = await screen.findByTestId('myday-visit')
    expect(screen.getByRole('heading', { level: 1, name: 'My Day' })).toBeTruthy()
    expect(within(card).getByRole('heading', { level: 2 }).textContent).toBe('09:00–10:00 · Project HH-SYNTH-70')
    expect(within(card).getByTestId('myday-address').textContent).toContain(
      '70 Synthetic Day Lane, Testville, KY 40000',
    )
    const directions = within(card).getByRole('link', { name: 'Directions' })
    expect(directions.getAttribute('href')).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\//)
    expect(directions.getAttribute('rel')).toBe('noopener noreferrer')
    expect(within(card).getByTestId('myday-access').textContent).toContain('Synthetic: side gate')
    expect(within(card).getByTestId('myday-preparation').textContent).toContain('Synthetic: clear the hallway')
    expect(within(card).getByTestId('myday-readiness').textContent).toContain('You have not viewed the job packet yet.')
    expect(within(card).getByTestId('myday-team').textContent).toBe('Team: Synthetic Ann (lead), Synthetic Ben')
    expect(within(card).getByRole('link', { name: 'Open the job packet' }).getAttribute('href')).toBe(
      `/staff/packets/${JOB}`,
    )
    const actions = within(card).getByTestId('myday-actions')
    const button = within(actions).getByRole('button', { name: 'On my way' })
    expect(button.className).toContain('staff-myday__action')
    expect(within(actions).getAllByRole('button')).toHaveLength(1)
    expect(document.body.textContent).not.toMatch(/\bETA\b|estimated arrival|minutes away/i)
  })

  it('[HH-OFF-09][HH-DATA-08][HH-PKT-06] readiness lists the worker’s own acknowledgment and the loadout, links the loadout, and never takes away the tap', async () => {
    const { t } = staffTranslator('en')
    const blocked = visit({
      readiness: {
        packetVersion: 4,
        lastViewedVersion: 3,
        changedSinceViewed: true,
        criticalSinceViewed: true,
        acknowledgment: 'invalidated',
        blockers: [
          { code: 'packet_critical_change', count: 1 },
          { code: 'packet_acknowledgment_ended', count: 1 },
          { code: 'loadout_blocked', count: 2 },
          { code: 'loadout_not_confirmed', count: 1 },
        ],
      },
    })
    const fetchImpl = api({ 'GET /staff/my/day': () => json(200, day([blocked])) })
    render(<MyDay t={t} locale="en" fetchImpl={fetchImpl as unknown as typeof fetch} href={href} />)
    const card = await screen.findByTestId('myday-visit')
    const readiness = within(card).getByTestId('myday-readiness').textContent
    expect(readiness).toContain('Your acknowledgment of the job packet no longer counts: review the current version.')
    expect(readiness).toContain('2 loadout shortages block services')
    expect(readiness).toContain('1 loadout not confirmed loaded yet')
    expect(within(card).getByRole('link', { name: 'Open the loadout' }).getAttribute('href')).toBe(
      `/staff/loadouts/${JOB}`,
    )
    // Readiness is not the Start Work check and never gates On my way (HH-SCH-08).
    expect(within(within(card).getByTestId('myday-actions')).getByRole('button', { name: 'On my way' })).toBeTruthy()
    cleanup()
    const es = staffTranslator('es').t
    render(
      <MyDay
        t={es}
        locale="es"
        fetchImpl={api({ 'GET /staff/my/day': () => json(200, day([blocked])) }) as unknown as typeof fetch}
        href={href}
      />,
    )
    expect((await screen.findByTestId('myday-readiness')).textContent).toContain(
      'Su confirmación del paquete de trabajo ya no cuenta',
    )
    expect(screen.getByRole('link', { name: 'Abrir la carga' })).toBeTruthy()
  })

  it('[HH-SCH-08][HH-WORK-06][OWN-DEC-149] the taps: On my way, then Arrived, then Finished, each the server’s answer; no check-in between', async () => {
    setCsrfToken('synthetic-csrf-token')
    const { t } = staffTranslator('en')
    const sent: { path: string; init?: RequestInit }[] = []
    const answer = (v: MyDayVisit) => (init?: RequestInit) => {
      sent.push({ path: v.state, ...(init ? { init } : {}) })
      return json(200, { recorded: true, visit: v })
    }
    const fetchImpl = api({
      'GET /staff/my/day': () => json(200, day([visit()])),
      [`POST /staff/visits/${VISIT}/on-my-way`]: answer(
        visit({
          state: 'en_route',
          mine: { departedAt: '2026-11-05T13:30:00.000Z', arrivedAt: null, finishedAt: null },
          next: 'arrived',
          actions: { onMyWay: false, arrived: true, finished: false },
        }),
      ),
      [`POST /staff/visits/${VISIT}/arrived`]: answer(
        visit({
          state: 'arrived',
          mine: { departedAt: '2026-11-05T13:30:00.000Z', arrivedAt: '2026-11-05T14:05:00.000Z', finishedAt: null },
          next: 'finished',
          actions: { onMyWay: false, arrived: false, finished: true },
        }),
      ),
    })
    render(<MyDay t={t} locale="en" fetchImpl={fetchImpl as unknown as typeof fetch} href={href} />)
    fireEvent.click(await screen.findByRole('button', { name: 'On my way' }))
    const arrived = await screen.findByRole('button', { name: 'Arrived' })
    expect(screen.getByTestId('myday-mine').textContent).toMatch(/^On my way at 8:30/)
    const first = sent[0]?.init
    expect(first?.method).toBe('POST')
    const headers = first?.headers as Record<string, string>
    expect(headers['idempotency-key']).toMatch(/.+/)
    expect(headers['x-csrf-token']).toBe('synthetic-csrf-token')
    expect(JSON.parse(String(first?.body))).toEqual({ deviceRecordedAt: expect.any(String) })
    fireEvent.click(arrived)
    const finished = await screen.findByRole('button', { name: 'Finished' })
    // Alone on site, only Finished is offered: no interval check-in (OWN-DEC-149); Arrived starts no work.
    expect(within(screen.getByTestId('myday-actions')).getAllByRole('button')).toEqual([finished])
    expect(screen.getByText('Arrived does not start work: Start Work runs its own online checks.')).toBeTruthy()
  })

  it('[HH-SCH-08][HH-OFF-03][T50] a refused tap says why and reloads the day; a tap without a connection is saved on this phone, not yet synchronized', async () => {
    const { t } = staffTranslator('en')
    let loads = 0
    const fetchImpl = api({
      'GET /staff/my/day': () => (loads++, json(200, day([visit()]))),
      [`POST /staff/visits/${VISIT}/on-my-way`]: () =>
        json(409, { error: { code: 'CONFLICT', fieldErrors: [{ field: 'visit', code: 'ON_MY_WAY_TOO_EARLY' }] } }),
    })
    render(<MyDay t={t} locale="en" fetchImpl={fetchImpl as unknown as typeof fetch} href={href} />)
    fireEvent.click(await screen.findByRole('button', { name: 'On my way' }))
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Refused: On my way opens closer to the arrival window.',
    )
    await waitFor(() => expect(loads).toBe(2))
    cleanup()
    const offline = api({ 'GET /staff/my/day': () => json(200, day([visit()])) })
    offline.mockImplementation(async (url: string | URL, init?: RequestInit) => {
      if (init?.method === 'POST') throw new TypeError('network down')
      const path = String(url).replace('/api/v1', '')
      return path === '/staff/my/day' ? json(200, day([visit()])) : json(200, { packets: [] })
    })
    const store = memoryStore()
    setOfflineStore(store)
    render(<MyDay t={t} locale="en" fetchImpl={offline as unknown as typeof fetch} href={href} />)
    fireEvent.click(await screen.findByRole('button', { name: 'On my way' }))
    const drafts = await screen.findByTestId('myday-drafts')
    expect(drafts.textContent).toContain('On my way at')
    expect(drafts.textContent).toContain('Saved on this phone')
    expect(within(drafts).getByRole('status').textContent).toBe(
      'Not yet synchronized. The office has not been notified of anything done on this phone. In an emergency call 911, then call the Owner.',
    )
    // Never shown as recorded: the visit is still waiting for On my way, and nothing claims the office knows.
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('button', { name: 'On my way' })).toBeTruthy()
    const [draft] = await store.listDrafts()
    expect(draft).toMatchObject({ kind: 'tap', visitId: VISIT, payload: { tap: 'on-my-way' }, state: 'saved_on_phone' })
    expect(Number.isNaN(Date.parse(draft?.deviceRecordedAt ?? ''))).toBe(false)
    setOfflineStore(null)
  })

  it('[HH-OFF-09] a tentative hold shows no address and nothing to record; early On my way says when it opens; Spanish labels', async () => {
    const { t } = staffTranslator('es')
    const hold = visit({
      visitId: '99999999-9999-4999-8999-999999999999',
      state: 'tentative',
      assignment: 'hold',
      team: [],
      address: null,
      directionsUrl: null,
      accessNotes: [],
      readiness: null,
      next: 'not_confirmed',
      onMyWayOpensAt: null,
      actions: { onMyWay: false, arrived: false, finished: false },
    })
    const early = visit({ next: 'wait', actions: { onMyWay: false, arrived: false, finished: false } })
    const fetchImpl = api({ 'GET /staff/my/day': () => json(200, day([early, hold])) })
    render(<MyDay t={t} locale="es" fetchImpl={fetchImpl as unknown as typeof fetch} href={href} />)
    const [first, second] = await screen.findAllByTestId('myday-visit')
    expect(within(first as HTMLElement).getByTestId('myday-next').textContent).toBe('En camino se abre a las 6:00 a.m.')
    expect(within(first as HTMLElement).queryByRole('button', { name: 'En camino' })).toBeNull()
    expect(within(second as HTMLElement).getByText('Provisional')).toBeTruthy()
    expect(within(second as HTMLElement).queryByTestId('myday-address')).toBeNull()
    expect(within(second as HTMLElement).queryByRole('button')).toBeNull()
  })
})

describe('Arrived and Finished times (TSK-0070)', () => {
  const view = (over: Partial<VisitTimesView> = {}): VisitTimesView => ({
    visitId: VISIT,
    number: 2,
    purpose: 'service',
    state: 'arrived',
    version: 6,
    projectReference: 'HH-SYNTH-70',
    window: {
      localDate: '2026-11-05',
      start: '09:00',
      end: '10:00',
      timeZone: ZONE,
      startsAt: '2026-11-05T14:00:00.000Z',
      endsAt: '2026-11-05T15:00:00.000Z',
    },
    dayEnded: true,
    workers: [
      {
        staffUserId: 'ann',
        name: 'Synthetic Ann',
        role: 'lead',
        assigned: true,
        departedAt: '2026-11-05T13:30:00.000Z',
        arrived: {
          status: 'corrected',
          at: '2026-11-05T14:00:00.000Z',
          recordedAt: '2026-11-05T14:05:00.000Z',
          deviceRecordedAt: null,
          corrections: [
            {
              correctedAt: '2026-11-05T14:00:00.000Z',
              previousAt: '2026-11-05T14:05:00.000Z',
              reason: 'Synthetic: tapped late',
              correctedBy: 'Synthetic Owner',
              createdAt: '2026-11-06T09:00:00.000Z',
            },
          ],
        },
        finished: {
          status: 'recorded',
          at: '2026-11-05T16:30:00.000Z',
          recordedAt: '2026-11-05T16:30:00.000Z',
          deviceRecordedAt: null,
          corrections: [],
        },
        durationMinutes: 150,
        flagged: false,
      },
      {
        staffUserId: 'ben',
        name: 'Synthetic Ben',
        role: 'member',
        assigned: true,
        departedAt: null,
        arrived: {
          status: 'recorded',
          at: '2026-11-05T14:20:00.000Z',
          recordedAt: '2026-11-05T14:20:00.000Z',
          deviceRecordedAt: null,
          corrections: [],
        },
        finished: { status: 'missing', at: null, recordedAt: null, deviceRecordedAt: null, corrections: [] },
        durationMinutes: null,
        flagged: true,
      },
    ],
    actions: { correct: true, export: true },
    ...over,
  })

  it('[HH-WORK-06][T47] each worker’s times: the missing one flagged, the correction beside the recorded value; the Owner corrects with a reason', async () => {
    const { t } = staffTranslator('en')
    let posted: unknown
    const fetchImpl = api({
      [`GET /staff/visits/${VISIT}/timestamps`]: () => json(200, view()),
      [`POST /staff/visits/${VISIT}/timestamps/corrections`]: (init) => {
        posted = JSON.parse(String(init?.body))
        return json(200, view({ state: 'completed' }))
      },
    })
    render(<VisitTimesPage t={t} locale="en" fetchImpl={fetchImpl as unknown as typeof fetch} visitId={VISIT} />)
    const rows = await screen.findAllByTestId('visit-times-row')
    expect(rows[0]?.textContent).toContain('Recorded: Nov 5, 2026, 9:05 AM')
    expect(rows[0]?.textContent).toContain('Synthetic: tapped late')
    expect(rows[0]?.textContent).toContain('150 minutes')
    expect(rows[1]?.textContent).toContain('Missing time')
    expect(rows[1]?.textContent).toContain('Not available: a time is missing')
    expect(document.body.textContent).not.toMatch(/\$|wage|overtime pay/i)
    fireEvent.change(screen.getByLabelText('Worker'), { target: { value: 'ben' } })
    fireEvent.change(screen.getByLabelText('Correct time'), { target: { value: '2026-11-05T11:30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save the correction' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Enter a reason.')
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Synthetic: forgot to tap Finished' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save the correction' }))
    await screen.findByText('Correction saved; the original value is kept.')
    expect(posted).toMatchObject({ staffUserId: 'ben', kind: 'finished', reason: 'Synthetic: forgot to tap Finished' })
    expect(typeof (posted as { at: string }).at).toBe('string')
  })

  it('[HH-WORK-06] only the Owner sees the times', async () => {
    const { t } = staffTranslator('en')
    const fetchImpl = api({
      [`GET /staff/visits/${VISIT}/timestamps`]: () => json(403, { error: { code: 'FORBIDDEN', fieldErrors: [] } }),
    })
    render(<VisitTimesPage t={t} locale="en" fetchImpl={fetchImpl as unknown as typeof fetch} visitId={VISIT} />)
    await screen.findByText('Only the Owner sees and corrects Arrived and Finished times.')
  })
})
