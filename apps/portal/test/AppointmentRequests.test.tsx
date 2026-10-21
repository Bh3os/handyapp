// Request to Reschedule and Request Cancellation in the portal (TSK-0066; HH-PORT-04, OWN-DEC-107, RULE-LANGUAGES). The
// API is a synthetic stand-in; every reference, window and text is invented for the test (RULE-SYNTHETIC-DATA).
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from '../src/App'
import { parseTab, type Fetch } from '../src/api'

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
type Appointment = typeof confirmed
function api(appointments: () => unknown, answer: (call: Call) => Response) {
  const calls: Call[] = []
  const fetchImpl: Fetch = async (input, init) => {
    calls.push({ url: input, ...(init ? { init } : {}) })
    if (input.endsWith('-request')) return answer({ url: input, ...(init ? { init } : {}) })
    if (input.endsWith('/appointments')) return json(200, appointments())
    if (input.endsWith('/overview')) return json(200, overview(null))
    return json(200, { ...head, state: 'none' })
  }
  return { fetchImpl, calls }
}
const open = (fetchImpl: Fetch) => render(<App path={`/portal/p/${REF}/appointments`} fetchImpl={fetchImpl} />)
const awaiting = (a: Appointment, kind: 'reschedule' | 'cancellation') => ({
  ...a,
  request: { kind, status: 'awaiting_confirmation' },
  actions: { requestReschedule: false, requestCancellation: false },
})

describe('[HH-PORT-04][OWN-DEC-107] the customer asks to change a confirmed appointment', () => {
  it('[HH-PORT-04][T25] Request to Reschedule sends the reason and times; the appointment stays shown, awaiting staff', async () => {
    let asked = false
    const { fetchImpl, calls } = api(
      () => tab([], [asked ? awaiting(confirmed, 'reschedule') : confirmed]),
      () => {
        asked = true
        return json(200, tab([], [awaiting(confirmed, 'reschedule')]))
      },
    )
    open(fetchImpl)
    const item = await screen.findByTestId('appointment-item')
    fireEvent.click(within(item).getByRole('button', { name: 'Request to Reschedule' }))
    const form = within(item).getByTestId('appointment-request-form')
    fireEvent.change(within(form).getByLabelText('Reason (optional)'), { target: { value: 'Synthetic: a trip.' } })
    fireEvent.change(within(form).getByLabelText('Times that work better for you (optional)'), {
      target: { value: 'Synthetic: mornings' },
    })
    fireEvent.click(within(form).getByRole('button', { name: 'Send request to reschedule' }))
    const status = await screen.findByTestId('appointment-request')
    expect(status.textContent).toContain('Request received—awaiting staff confirmation.')
    expect(status.textContent).toContain('Your appointment stays as shown until HandyHub confirms a change.')
    // The confirmed appointment is still there, unchanged, with nothing more to ask meanwhile.
    const card = screen.getByTestId('appointment')
    expect(card.textContent).toContain('Confirmed')
    expect(within(card).getByTestId('appointment-window').textContent).toBe(
      'Wednesday, November 4, 2026, arrival between 1:00 PM EST and 2:00 PM EST',
    )
    expect(screen.queryByRole('button', { name: 'Request Cancellation' })).toBeNull()
    const post = calls.find((c) => c.url.endsWith('-request'))
    expect(post?.url).toBe(`/api/v1/customer/projects/${REF}/appointments/1/reschedule-request`)
    expect(JSON.parse(String(post?.init?.body))).toEqual({
      reason: 'Synthetic: a trip.',
      preferredTimes: 'Synthetic: mornings',
    })
    expect((post?.init?.headers as Record<string, string>)['idempotency-key']).toMatch(/^portal-[0-9a-f]{32}$/)
  })

  it('[HH-PORT-04] Request Cancellation shows no fee or refund term; a declined request says the appointment stays', async () => {
    let asked = false
    const { fetchImpl, calls } = api(
      () =>
        tab(
          [],
          [
            asked
              ? awaiting(confirmed, 'cancellation')
              : { ...confirmed, request: { kind: 'cancellation', status: 'declined' } },
          ],
        ),
      () => {
        asked = true
        return json(200, tab([], [awaiting(confirmed, 'cancellation')]))
      },
    )
    open(fetchImpl)
    const item = await screen.findByTestId('appointment-item')
    expect(within(item).getByTestId('appointment-request').textContent).toBe(
      'HandyHub could not make the change you asked for. Your appointment stays as shown.',
    )
    fireEvent.click(within(item).getByRole('button', { name: 'Request Cancellation' }))
    const form = within(item).getByTestId('appointment-request-form')
    expect(within(form).queryByLabelText('Times that work better for you (optional)')).toBeNull()
    expect(form.textContent).not.toMatch(/\$|fee|refund|charge/i)
    fireEvent.click(within(form).getByRole('button', { name: 'Send cancellation request' }))
    expect(await screen.findByText('Request received—awaiting staff confirmation.')).toBeTruthy()
    const post = calls.find((c) => c.url.endsWith('-request'))
    expect(post?.url).toBe(`/api/v1/customer/projects/${REF}/appointments/1/cancellation-request`)
    expect(JSON.parse(String(post?.init?.body))).toEqual({})
  })

  it('[HH-PORT-04] an appointment that can no longer be changed says so and shows what is current', async () => {
    let canceled = false
    const { fetchImpl } = api(
      () =>
        tab(
          [],
          [
            canceled
              ? { ...confirmed, status: 'canceled', actions: { requestReschedule: false, requestCancellation: false } }
              : confirmed,
          ],
        ),
      () => {
        canceled = true
        return json(409, {
          error: { code: 'CONFLICT', fieldErrors: [{ field: 'appointment', code: 'APPOINTMENT_NOT_CHANGEABLE' }] },
        })
      },
    )
    open(fetchImpl)
    const item = await screen.findByTestId('appointment-item')
    fireEvent.click(within(item).getByRole('button', { name: 'Request to Reschedule' }))
    fireEvent.click(within(item).getByRole('button', { name: 'Send request to reschedule' }))
    expect((await screen.findByTestId('appointment-request-message')).textContent).toBe(
      'This appointment can no longer be changed here. The page now shows what is current.',
    )
    expect((await screen.findByTestId('appointment')).textContent).toContain('Canceled')
  })

  it('[HH-PORT-06] an appointment without its number or actions is not the declared view', () => {
    const { number: _n, ...noNumber } = confirmed
    void _n
    expect(parseTab('appointments', tab([], [noNumber]))).toBeNull()
    expect(parseTab('appointments', tab([], [{ ...confirmed, request: { kind: 'other', status: 'x' } }]))).toBeNull()
    expect(parseTab('appointments', tab([], [confirmed]))).not.toBeNull()
  })
})
