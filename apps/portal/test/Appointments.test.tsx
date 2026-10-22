// Offered windows and confirmed visits in the portal (TSK-0063; HH-LEAD-07, HH-SCH-11, HH-SCH-04, T37, T38,
// OWN-DEC-99, OWN-DEC-144, RULE-LANGUAGES). The API is a synthetic stand-in; every reference, window and text is
// invented for the test (RULE-SYNTHETIC-DATA). Windows are read in the property's zone, whatever this machine's is.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from '../src/App'
import { parseOverview, parseTab, type Fetch } from '../src/api'

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
})

const REF = 'HH-7K2M9Q4D'
const NOW = '2026-10-21T15:00:00.000Z'
const SENT = '2026-10-20T14:00:00.000Z'
const ZONE = 'America/Kentucky/Louisville'
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const head = { reference: REF, refreshedAt: NOW, refreshSeconds: 0 }
const window1 = {
  position: 1,
  localDate: '2026-11-04',
  start: '09:00',
  end: '10:00',
  timeZone: ZONE,
  startsAt: '2026-11-04T14:00:00.000Z',
  endsAt: '2026-11-04T15:00:00.000Z',
}
const window2 = {
  ...window1,
  position: 2,
  start: '13:00',
  end: '14:00',
  startsAt: '2026-11-04T18:00:00.000Z',
  endsAt: '2026-11-04T19:00:00.000Z',
}
const openOffer = {
  number: 1,
  purpose: 'estimate_visit',
  status: 'open',
  offeredAt: '2026-10-21T14:00:00.000Z',
  expiresAt: '2026-10-22T14:00:00.000Z',
  windows: [window1, window2],
}
const confirmed = {
  number: 1,
  purpose: 'estimate_visit',
  status: 'confirmed',
  window: { ...window2, position: undefined },
  address: { street: '12 Synthetic Lane', unit: null, city: 'Testville', state: 'KY', zip: '40000' },
  preparationInstructions: 'Synthetic: clear the hallway.',
  // TSK-0066: the customer's request of the appointment and what they may ask for now.
  request: null,
  actions: { requestReschedule: true, requestCancellation: true },
}
const tab = (offers: unknown[], appointments: unknown[]) => ({ ...head, state: 'listed', offers, appointments })
const overview = (appointment: unknown) => ({
  reference: REF,
  services: ['Patching & Repair'],
  notSure: false,
  submittedAt: SENT,
  status: {
    situation: 'site_visit',
    step: 'choose_visit_window',
    waitingOn: 'customer',
    nextAction: 'choose_visit_window',
    since: SENT,
    text: null,
  },
  timeline: [{ kind: 'received', at: SENT, text: null }],
  appointment,
  payment: { state: 'none' },
  refreshedAt: NOW,
  refreshSeconds: 0,
})

type Call = { url: string; init?: RequestInit }
function api(answers: { appointments: () => Response; select?: () => Response; other?: () => Response }) {
  const calls: Call[] = []
  const fetchImpl: Fetch = async (input, init) => {
    calls.push({ url: input, ...(init ? { init } : {}) })
    if (input.endsWith('/select')) return (answers.select ?? (() => json(500, {})))()
    if (input.endsWith('/other-times')) return (answers.other ?? (() => json(500, {})))()
    if (input.endsWith('/appointments')) return answers.appointments()
    if (input.endsWith('/overview')) return json(200, overview(null))
    return json(200, { ...head, state: 'none' })
  }
  return { fetchImpl, calls }
}
const open = (fetchImpl: Fetch) => render(<App path={`/portal/p/${REF}/appointments`} fetchImpl={fetchImpl} />)

describe('[HH-SCH-11][HH-LEAD-07] choosing an offered window', () => {
  it('[HH-SCH-11][OWN-DEC-144] lists the held windows in the property zone and selects one with an idempotency key', async () => {
    let selected = false
    const { fetchImpl, calls } = api({
      appointments: () => json(200, selected ? tab([], [confirmed]) : tab([openOffer], [])),
      select: () => {
        selected = true
        return json(200, tab([], [confirmed]))
      },
    })
    open(fetchImpl)
    // The first render of the file also loads the app's modules: under a loaded parallel run that alone can pass the
    // default 1 s wait, so this first read waits longer (the assertions are unchanged).
    const offer = await screen.findByTestId('window-offer', undefined, { timeout: 5_000 })
    expect(within(offer).getByRole('heading', { name: 'Choose a time for your estimate visit' })).toBeTruthy()
    expect(within(offer).getByTestId('offer-held').textContent).toMatch(/^These times are held for you until /)
    expect(
      within(offer)
        .getAllByTestId('offer-window')
        .map((w) => w.querySelector('p')?.textContent),
    ).toEqual([
      'Wednesday, November 4, 2026, arrival between 9:00 AM EST and 10:00 AM EST',
      'Wednesday, November 4, 2026, arrival between 1:00 PM EST and 2:00 PM EST',
    ])
    fireEvent.click(within(offer).getAllByRole('button', { name: 'Choose this time' })[1] as HTMLElement)
    const card = await screen.findByTestId('appointment')
    expect(card.textContent).toContain('Estimate visit')
    expect(card.textContent).toContain('Confirmed')
    expect(within(card).getByTestId('appointment-window').textContent).toBe(
      'Wednesday, November 4, 2026, arrival between 1:00 PM EST and 2:00 PM EST',
    )
    expect(card.textContent).toContain('12 Synthetic Lane, Testville, KY 40000')
    expect(card.textContent).toContain('Synthetic: clear the hallway.')
    expect(card.textContent).toContain("It doesn't approve a price.")
    const post = calls.find((c) => c.url.endsWith('/select'))
    expect(post?.url).toBe(`/api/v1/customer/projects/${REF}/window-offers/1/select`)
    expect(JSON.parse(String(post?.init?.body))).toEqual({ position: 2 })
    expect((post?.init?.headers as Record<string, string>)['idempotency-key']).toMatch(/^portal-[0-9a-f]{32}$/)
  })

  it('[T38][HH-SCH-04] a window that can no longer be kept says so and shows the offer as it is now', async () => {
    const { fetchImpl, calls } = api({
      appointments: () => json(200, tab([openOffer], [])),
      select: () =>
        json(409, {
          error: {
            code: 'CONFLICT',
            message: '',
            requestId: 'r',
            retryable: false,
            fieldErrors: [{ field: 'body.position', code: 'WINDOW_UNAVAILABLE', message: '' }],
          },
        }),
    })
    open(fetchImpl)
    const offer = await screen.findByTestId('window-offer')
    const reads = () => calls.filter((c) => c.url.endsWith('/appointments')).length
    const before = reads()
    fireEvent.click(within(offer).getAllByRole('button', { name: 'Choose this time' })[0] as HTMLElement)
    expect((await screen.findByTestId('offer-message')).textContent).toBe(
      'That time is no longer available. Choose another time or request other times.',
    )
    await waitFor(() => expect(reads()).toBeGreaterThan(before))
  })

  it('[HH-SCH-11][OWN-DEC-99] asks for other times with an optional note, without restarting', async () => {
    let asked = false
    const { fetchImpl, calls } = api({
      appointments: () => json(200, tab([asked ? { ...openOffer, status: 'other_times_requested' } : openOffer], [])),
      other: () => {
        asked = true
        return json(200, tab([{ ...openOffer, status: 'other_times_requested' }], []))
      },
    })
    open(fetchImpl)
    const offer = await screen.findByTestId('window-offer')
    fireEvent.click(within(offer).getByRole('button', { name: 'None of these times work? Request other times' }))
    fireEvent.change(within(offer).getByLabelText(/Times that work better for you/), {
      target: { value: 'Synthetic: evenings' },
    })
    fireEvent.click(within(offer).getByRole('button', { name: 'Request other times' }))
    expect(await screen.findByText('You asked for other times. HandyHub will offer new times.')).toBeTruthy()
    const post = calls.find((c) => c.url.endsWith('/other-times'))
    expect(JSON.parse(String(post?.init?.body))).toEqual({ note: 'Synthetic: evenings' })
  })

  it('[OWN-DEC-144] an expired offer says the times are no longer held and offers no button', async () => {
    const { fetchImpl } = api({ appointments: () => json(200, tab([{ ...openOffer, status: 'expired' }], [])) })
    open(fetchImpl)
    const offer = await screen.findByTestId('window-offer')
    expect(offer.textContent).toContain('These times are no longer held. HandyHub will offer new times.')
    expect(within(offer).queryByRole('button', { name: 'Choose this time' })).toBeNull()
  })
})

describe('[HH-PORT-06][T37] the views are parsed strictly', () => {
  it('[HH-PORT-06] an Appointments answer that is not its declared view is a failure, never shown as data', () => {
    expect(parseTab('appointments', tab([openOffer], []))).not.toBeNull()
    expect(parseTab('appointments', tab([], []))).toBeNull()
    expect(parseTab('appointments', tab([{ ...openOffer, status: 'held' }], []))).toBeNull()
    expect(parseTab('appointments', tab([], [{ ...confirmed, purpose: 'job' }]))).toBeNull()
    expect(parseTab('appointments', { ...head, state: 'listed', offers: [openOffer] })).toBeNull()
  })

  it('[T37] the Overview shows the confirmed visit beside the status; the next action opens the Appointments tab', async () => {
    expect(parseOverview(overview(confirmed))?.appointment?.purpose).toBe('estimate_visit')
    expect(parseOverview(overview({ ...confirmed, status: 'tentative' }))).toBeNull()
    const fetchImpl: Fetch = async (input) =>
      input.endsWith('/overview') ? json(200, overview(confirmed)) : json(200, { ...head, state: 'none' })
    render(<App path={`/portal/p/${REF}`} fetchImpl={fetchImpl} />)
    const section = await screen.findByRole('region', { name: 'Appointment' })
    expect((await within(section).findByTestId('appointment')).textContent).toContain('12 Synthetic Lane')
    const next = screen.getByTestId('next-action')
    expect(within(next).getByRole('link', { name: 'Choose a visit window' }).getAttribute('href')).toBe(
      `/portal/p/${REF}/appointments`,
    )
  })
})

describe('[HH-SCH-05][HH-SCH-06] a time that cannot be confirmed yet is never shown as booked (TSK-0064)', () => {
  const refusal = (fieldErrors: { field: string; code: string }[]) => () =>
    json(409, {
      error: {
        code: 'CONFLICT',
        message: '',
        requestId: 'r',
        retryable: false,
        fieldErrors: fieldErrors.map((f) => ({ ...f, message: '' })),
      },
    })
  const workOffer = { ...openOffer, purpose: 'work_visit' }

  it('[HH-SCH-06][HH-FIN-02][T36] the deposit is due: the deposit wording, nothing booked, the times still offered', async () => {
    const { fetchImpl } = api({
      appointments: () => json(200, tab([workOffer], [])),
      select: refusal([
        { field: 'body.position', code: 'SCHEDULING_NOT_READY' },
        { field: 'deposit', code: 'DEPOSIT_REQUIRED' },
      ]),
    })
    open(fetchImpl)
    const offer = await screen.findByTestId('window-offer')
    fireEvent.click(within(offer).getAllByRole('button', { name: 'Choose this time' })[0] as HTMLElement)
    expect((await screen.findByTestId('offer-message')).textContent).toBe(
      "This time can't be confirmed until your deposit is received, so nothing is booked yet. Please pay your deposit so we can confirm your work appointment. Payment does not guarantee a particular date.",
    )
    expect(screen.queryByTestId('appointment')).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Choose this time' })).toHaveLength(2)
  })

  it('[HH-SCH-06][T40] another precondition is unmet: a neutral message naming no hold', async () => {
    const { fetchImpl } = api({
      appointments: () => json(200, tab([workOffer], [])),
      select: refusal([{ field: 'body.position', code: 'SCHEDULING_NOT_READY' }]),
    })
    open(fetchImpl)
    const offer = await screen.findByTestId('window-offer')
    fireEvent.click(within(offer).getAllByRole('button', { name: 'Choose this time' })[1] as HTMLElement)
    expect((await screen.findByTestId('offer-message')).textContent).toBe(
      "This time can't be confirmed yet, so nothing is booked. HandyHub needs to finish reviewing your project first.",
    )
    expect(screen.queryByTestId('appointment')).toBeNull()
  })
})
