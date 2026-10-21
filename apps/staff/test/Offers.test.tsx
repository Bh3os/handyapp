// Window offers in the staff app (TSK-0063; HH-SCH-11, HH-LEAD-07, HH-SCH-04, OWN-DEC-99, OWN-DEC-144). The API is a
// synthetic stand-in (RULE-SYNTHETIC-DATA): names, windows and times are test inputs, not business facts. Times are
// read in the visit's zone, whatever this machine's zone is.
import { staffTranslator } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CapacityDay } from '../src/Capacity'
import { OfferWindows, VisitOffers, type Offer } from '../src/Offers'

afterEach(cleanup)

const ZONE = 'America/Kentucky/Louisville'
const VISIT = '44444444-4444-4444-8444-444444444444'
const OFFER = '55555555-5555-4555-8555-555555555555'
const ANN = '11111111-1111-4111-8111-111111111111'
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const day: CapacityDay = {
  date: '2026-11-04',
  timeZone: ZONE,
  timeZoneProposed: true,
  visitHours: { open: '08:00', close: '22:00', periods: [] },
  workers: [
    {
      id: ANN,
      name: 'Synthetic Ann',
      roles: ['worker'],
      eligibleFor: { estimateVisits: true, workVisits: true },
      scheduleVersion: 1,
      working: [],
      timeOff: [],
      reservations: [],
      free: [],
    },
  ],
  equipment: [],
}
const visit = {
  id: VISIT,
  purpose: 'site_estimate',
  version: 2,
  window: { localDate: '2026-11-04', start: '09:00', end: '10:00', timeZone: ZONE },
  requiredWorkers: 1,
  equipment: [],
}
const policy = { holdHours: 24, minWindows: 2, maxWindows: 3, proposed: false }

const offer = (over: Partial<Offer> = {}): Offer => ({
  id: OFFER,
  number: 1,
  state: 'open',
  held: true,
  version: 1,
  offeredBy: { id: 'o', name: 'Synthetic Office' },
  offeredAt: '2026-11-02T15:00:00.000Z',
  expiresAt: '2026-11-03T15:00:00.000Z',
  holdHours: 24,
  preparationInstructions: 'Synthetic: clear the hallway.',
  windows: [
    {
      position: 1,
      window: {
        localDate: '2026-11-04',
        start: '09:00',
        end: '10:00',
        timeZone: ZONE,
        startsAt: '2026-11-04T14:00:00.000Z',
        endsAt: '2026-11-04T15:00:00.000Z',
      },
      reservedRange: { startsAt: '2026-11-04T13:30:00.000Z', endsAt: '2026-11-04T16:00:00.000Z' },
    },
    {
      position: 2,
      window: {
        localDate: '2026-11-04',
        start: '13:00',
        end: '14:00',
        timeZone: ZONE,
        startsAt: '2026-11-04T18:00:00.000Z',
        endsAt: '2026-11-04T19:00:00.000Z',
      },
      reservedRange: { startsAt: '2026-11-04T17:30:00.000Z', endsAt: '2026-11-04T20:00:00.000Z' },
    },
  ],
  selectedPosition: null,
  closedAt: null,
  closedBy: null,
  closedReason: null,
  customerNote: null,
  noticeKey: 'estimate_visit.options',
  notices: [
    { messageKey: 'estimate_visit.options', channel: 'email', state: 'failed', errorCode: 'template_not_configured' },
  ],
  actions: { withdraw: true },
  ...over,
})

describe('[HH-SCH-11][OWN-DEC-144] offering windows held for the team', () => {
  it('[HH-SCH-11][OWN-DEC-99] offers the configured number of windows with the team and instructions, with the version shown', async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, ...(init ? { init } : {}) })
      if (url.startsWith('/api/v1/staff/capacity')) return json(200, day)
      return json(201, { visits: [] })
    })
    const onOffered = vi.fn()
    const { t } = staffTranslator('en')
    render(
      <OfferWindows
        t={t}
        locale="en"
        fetchImpl={fetchImpl as never}
        visit={visit}
        policy={policy}
        onOffered={onOffered}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Offer windows to the customer' }))
    const form = await screen.findByTestId('offer-windows')
    expect(form.textContent).toContain('Offer 2 to 3 windows. Each window holds the whole team for 24 hours')
    // Two windows to start with (the minimum), the first one the planned window; a third can be added, not a fourth.
    expect(within(form).getAllByTestId('offer-window')).toHaveLength(2)
    fireEvent.click(within(form).getByRole('button', { name: 'Add a window' }))
    expect(within(form).getAllByTestId('offer-window')).toHaveLength(3)
    expect(within(form).queryByRole('button', { name: 'Add a window' })).toBeNull()
    fireEvent.click(within(form).getAllByRole('button', { name: 'Remove this window' })[2] as HTMLElement)
    const second = within(form).getAllByTestId('offer-window')[1] as HTMLElement
    fireEvent.change(within(second).getByLabelText(/^Arrival window starts/), { target: { value: '13:00' } })
    fireEvent.change(within(second).getByLabelText(/^Arrival window ends/), { target: { value: '14:00' } })
    await within(form).findByText(/Synthetic Ann/)
    fireEvent.click(within(form).getByLabelText(/Synthetic Ann/))
    fireEvent.change(within(form).getByLabelText(/Preparation instructions/), {
      target: { value: 'Synthetic: clear the hallway.' },
    })
    fireEvent.click(within(form).getByRole('button', { name: 'Offer and hold these windows' }))
    await waitFor(() => expect(onOffered).toHaveBeenCalled())
    const post = calls.find((c) => c.url.endsWith('/offers'))
    expect(post?.url).toBe(`/api/v1/staff/visits/${VISIT}/offers`)
    expect(JSON.parse(String(post?.init?.body))).toEqual({
      windows: [
        { localDate: '2026-11-04', windowStart: '09:00', windowEnd: '10:00', startOffset: null, endOffset: null },
        { localDate: '2026-11-04', windowStart: '13:00', windowEnd: '14:00', startOffset: null, endOffset: null },
      ],
      workerIds: [ANN],
      equipmentIds: [],
      preparationInstructions: 'Synthetic: clear the hallway.',
    })
    const headers = post?.init?.headers as Record<string, string>
    expect(headers['if-match']).toBe('"2"')
    expect(headers['idempotency-key']).toBeTruthy()
  })

  it('[T38][HH-SCH-04] a refusal names each window and person; nothing was offered (Spanish)', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.startsWith('/api/v1/staff/capacity')) return json(200, day)
      return json(409, {
        error: {
          code: 'CONFLICT',
          message: '',
          requestId: 'r',
          retryable: false,
          fieldErrors: [{ field: `windows[1].workers.${ANN}`, code: 'WORKER_BOOKED', message: '' }],
          alternatives: { workers: [], equipment: [], periods: [] },
        },
      })
    })
    const { t } = staffTranslator('es')
    render(
      <OfferWindows
        t={t}
        locale="es"
        fetchImpl={fetchImpl as never}
        visit={visit}
        policy={policy}
        onOffered={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Ofrecer ventanas al cliente' }))
    const form = await screen.findByTestId('offer-windows')
    const [, start, end] = within(within(form).getAllByTestId('offer-window')[1] as HTMLElement).getAllByDisplayValue(
      /.*/,
    ) as HTMLInputElement[]
    fireEvent.change(start as HTMLInputElement, { target: { value: '13:00' } })
    fireEvent.change(end as HTMLInputElement, { target: { value: '14:00' } })
    await within(form).findByText(/Synthetic Ann/)
    fireEvent.click(within(form).getByLabelText(/Synthetic Ann/))
    fireEvent.click(within(form).getByRole('button', { name: 'Ofrecer y reservar estas ventanas' }))
    await within(form).findByText('Las ventanas no se ofrecieron')
    expect(form.textContent).toContain('Ventana 2: Synthetic Ann')
  })
})

describe('[HH-SCH-11][FACT-AUTOMATIC-MESSAGES] the offers of a visit', () => {
  const when = (iso: string) => iso.slice(0, 16)
  it('[OWN-DEC-144][FACT-AUTOMATIC-MESSAGES] shows the hold, the windows and the notice as it really went', () => {
    const { t } = staffTranslator('en')
    render(
      <VisitOffers t={t} locale="en" fetchImpl={vi.fn() as never} offers={[offer()]} when={when} onChanged={vi.fn()} />,
    )
    const item = screen.getByTestId('visit-offer')
    expect(item.textContent).toContain('Offer 1')
    expect(item.textContent).toContain('Offered')
    expect(within(item).getByTestId('offer-held').textContent).toBe('Held until 2026-11-03T15:00')
    expect(
      within(item)
        .getAllByTestId('offer-window-line')
        .map((l) => l.textContent),
    ).toEqual(['Window 1: Wed, Nov 4, 9:00 AM EST – 10:00 AM EST', 'Window 2: Wed, Nov 4, 1:00 PM EST – 2:00 PM EST'])
    expect(within(item).getByTestId('offer-notice').textContent).toContain(
      'Email: Not delivered (not sent: its wording is not configured)',
    )
    expect(item.textContent).toContain('Preparation instructions: Synthetic: clear the hallway.')
  })

  it('[HH-SCH-11] a work-visit offer says no notice is on the list; a selection and a note are shown (Spanish)', () => {
    const { t } = staffTranslator('es')
    render(
      <VisitOffers
        t={t}
        locale="es"
        fetchImpl={vi.fn() as never}
        offers={[
          offer({
            state: 'selected',
            held: false,
            selectedPosition: 2,
            noticeKey: null,
            notices: [],
            actions: { withdraw: false },
          }),
          offer({ id: 'other', number: 2, state: 'other_times_requested', customerNote: 'Synthetic: after six.' }),
        ]}
        when={when}
        onChanged={vi.fn()}
      />,
    )
    const [first, second] = screen.getAllByTestId('visit-offer') as HTMLElement[]
    expect(first?.textContent).toContain('Elegida por el cliente')
    expect(first?.textContent).toContain('(elegida por el cliente)')
    expect(first?.textContent).toContain('La lista no incluye ningún aviso automático')
    expect(within(first as HTMLElement).queryByRole('button', { name: 'Retirar esta oferta' })).toBeNull()
    expect(within(second as HTMLElement).getByTestId('offer-customer-note').textContent).toBe(
      'Nota del cliente: Synthetic: after six.',
    )
  })

  it('[HH-SCH-11] withdrawing sends the reason with the offer version', async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, ...(init ? { init } : {}) })
      return json(200, { visits: [] })
    })
    const onChanged = vi.fn()
    const { t } = staffTranslator('en')
    render(
      <VisitOffers
        t={t}
        locale="en"
        fetchImpl={fetchImpl as never}
        offers={[offer()]}
        when={when}
        onChanged={onChanged}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw this offer' }))
    fireEvent.change(screen.getByLabelText(/Reason for withdrawing/), { target: { value: 'Synthetic: crew changed' } })
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw and release the holds' }))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(calls[0]?.url).toBe(`/api/v1/staff/window-offers/${OFFER}/withdraw`)
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ reason: 'Synthetic: crew changed' })
    expect((calls[0]?.init?.headers as Record<string, string>)['if-match']).toBe('"1"')
  })
})
