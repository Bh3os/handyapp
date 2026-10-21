// The appointment reminder panel of the scheduling board (TSK-0067; HH-COM-11, HH-COM-05, HH-COM-09, OWN-DEC-78,
// OWN-DEC-107). The API is a synthetic stand-in (RULE-SYNTHETIC-DATA).
import { staffTranslator } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AppointmentReminders,
  type AppointmentReminder,
  type AppointmentRemindersView,
} from '../src/AppointmentReminders'

afterEach(cleanup)

const VISIT = '11111111-1111-4111-8111-111111111111'
const D1 = '33333333-3333-4333-8333-333333333333'
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const draft = (over: Partial<AppointmentReminder> = {}): AppointmentReminder => ({
  id: D1,
  windowVersion: 1,
  current: true,
  state: 'draft',
  channel: 'email',
  reason: null,
  content: {
    visitWindow: 'Friday, October 30, 2026, 9:00 AM EDT – 10:00 AM EDT (America/Kentucky/Louisville)',
    serviceAddress: '1 Synthetic Way, Testville, KY 40000',
    preparationSteps: 'Synthetic: please clear a path to the ceiling.',
  },
  draftedAt: '2026-10-29T13:00:00.000Z',
  releasedAt: null,
  releasedBy: null,
  sendAt: null,
  cancelledAt: null,
  cancelledBy: null,
  actions: { release: true, dismiss: true },
  ...over,
})
const remindersView = (over: Partial<AppointmentRemindersView> = {}): AppointmentRemindersView => ({
  visitId: VISIT,
  visitState: 'confirmed',
  cadence: {
    state: 'CONFIGURED',
    proposed: false,
    hoursBefore: 24,
    contactHoursOnly: true,
    draftAt: '2026-10-29T13:00:00.000Z',
  },
  stoppedBy: null,
  reminders: [draft()],
  ...over,
})

function renderPanel(fetchImpl: ReturnType<typeof vi.fn>, locale: 'en' | 'es' = 'en') {
  const { t } = staffTranslator(locale)
  render(<AppointmentReminders t={t} fetchImpl={fetchImpl as unknown as typeof fetch} visitId={VISIT} />)
}

describe('[HH-COM-11] the appointment reminder panel', () => {
  it('[OWN-DEC-107][OWN-DEC-78] shows the draft with its date and window, address and preparation; Send releases it', async () => {
    const sent = remindersView({
      reminders: [
        draft({
          state: 'queued',
          releasedAt: '2026-10-29T14:00:00.000Z',
          releasedBy: { id: 'staff-1', name: 'Synthetic Office' },
          sendAt: '2026-10-29T14:00:00.000Z',
          actions: { release: false, dismiss: false },
        }),
      ],
    })
    const fetchImpl = vi.fn(async (url: string) =>
      url.endsWith('/release') ? json(200, sent) : json(200, remindersView()),
    )
    renderPanel(fetchImpl)
    const panel = await screen.findByTestId('appointment-reminders')
    expect(within(panel).getByRole('heading', { name: 'Appointment reminder' })).toBeTruthy()
    expect(within(panel).getByText(/nothing is sent until you send it/)).toBeTruthy()
    expect(within(panel).getByText(/^Drafted 24 hours before the arrival window/)).toBeTruthy()
    const list = within(panel).getByRole('list', { name: 'Appointment reminder' })
    expect(within(list).getByText('Reminder by Email')).toBeTruthy()
    expect(within(list).getByText('Draft, not sent')).toBeTruthy()
    expect(within(list).getByText('1 Synthetic Way, Testville, KY 40000')).toBeTruthy()
    expect(within(list).getByText('Synthetic: please clear a path to the ceiling.')).toBeTruthy()
    expect(within(list).getByText(/9:00 AM EDT/)).toBeTruthy()
    fireEvent.click(within(panel).getByRole('button', { name: 'Send reminder' }))
    await screen.findByText('Released for delivery. Its outcome shows here.')
    const [url, init] = fetchImpl.mock.calls[1] as unknown as [string, RequestInit]
    expect(url).toBe(`/api/v1/staff/appointment-reminders/${D1}/release`)
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['idempotency-key']).toMatch(/^staff-/)
    expect(within(panel).getByText('Sending')).toBeTruthy()
    expect(within(panel).getByText(/^Sent by Synthetic Office, /)).toBeTruthy()
    // HH-COM-09: a released reminder waits for the contact hours, and the panel says when it sends.
    expect(within(panel).getByText(/^Waiting for the contact hours: it sends /)).toBeTruthy()
    expect(within(panel).queryByRole('button', { name: 'Send reminder' })).toBeNull()
  })

  it('[HH-COM-05][T65] a refused release names the reason and reloads: a canceled appointment', async () => {
    const stopped = remindersView({
      visitState: 'canceled',
      stoppedBy: 'visit_canceled',
      reminders: [
        draft({
          state: 'cancelled',
          reason: 'visit_canceled',
          cancelledAt: '2026-10-29T14:00:00.000Z',
          cancelledBy: 'system',
          actions: { release: false, dismiss: false },
        }),
      ],
    })
    let loads = 0
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith('/release'))
        return json(409, {
          error: { code: 'CONFLICT', fieldErrors: [{ field: 'reminder', code: 'visit_canceled', message: '' }] },
        })
      return json(200, ++loads === 1 ? remindersView() : stopped)
    })
    renderPanel(fetchImpl)
    fireEvent.click(await screen.findByRole('button', { name: 'Send reminder' }))
    await screen.findByText('The reminder was not sent')
    await screen.findByText('No reminder for this appointment now: The appointment was canceled.')
    expect(screen.getByText('Reason: The appointment was canceled')).toBeTruthy()
    expect(screen.getByText(/^Cancelled /)).toBeTruthy()
  })

  it('changed details say so; an earlier window’s reminder is marked; no preparation steps are made up', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.endsWith('/release')
        ? json(409, {
            error: { code: 'CONFLICT', fieldErrors: [{ field: 'reminder', code: 'details_changed', message: '' }] },
          })
        : json(
            200,
            remindersView({
              reminders: [
                draft({
                  id: '44444444-4444-4444-8444-444444444444',
                  windowVersion: 1,
                  current: false,
                  state: 'cancelled',
                  reason: 'visit_rescheduled',
                  cancelledAt: '2026-10-29T14:00:00.000Z',
                  cancelledBy: 'system',
                  actions: { release: false, dismiss: false },
                }),
                draft({ windowVersion: 2, content: { ...draft().content, preparationSteps: null } }),
              ],
            }),
          ),
    )
    renderPanel(fetchImpl)
    await screen.findByText('For an earlier date or window')
    expect(screen.getByText('Reason: The appointment moved to another date or window')).toBeTruthy()
    expect(screen.getByText('None were given with the offered windows.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Send reminder' }))
    await screen.findByText(/The address or the preparation steps changed\. The reminder now shows/)
  })

  it('dismiss keeps the draft as dismissed, with who dismissed it', async () => {
    const dismissed = remindersView({
      reminders: [
        draft({
          state: 'cancelled',
          reason: 'dismissed',
          cancelledAt: '2026-10-29T14:00:00.000Z',
          cancelledBy: { id: 'staff-1', name: 'Synthetic Owner' },
          actions: { release: false, dismiss: false },
        }),
      ],
    })
    const fetchImpl = vi.fn(async (url: string) =>
      url.endsWith('/dismiss') ? json(200, dismissed) : json(200, remindersView()),
    )
    renderPanel(fetchImpl)
    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss' }))
    await screen.findByText('Dismissed. The draft is kept and will not be sent.')
    expect(screen.getByText(/^Dismissed by Synthetic Owner, /)).toBeTruthy()
  })

  it('[RULE-DECIDED-VALUES-ACTIVE] NOT CONFIGURED says so; a failed send reads not sent; no access shows nothing', async () => {
    const fetchImpl = vi.fn(async () =>
      json(
        200,
        remindersView({
          cadence: { state: 'NOT_CONFIGURED' },
          reminders: [
            draft({ state: 'failed', reason: 'template_not_configured', actions: { release: false, dismiss: false } }),
          ],
        }),
      ),
    )
    renderPanel(fetchImpl)
    await screen.findByText('The reminder interval is not configured, so no reminder is drafted.')
    expect(screen.getByText('Not sent')).toBeTruthy()
    expect(screen.getByText('Reason: No approved wording for this message yet (not configured)')).toBeTruthy()
    cleanup()
    const denied = vi.fn(async () => json(403, { error: { code: 'FORBIDDEN', fieldErrors: [] } }))
    renderPanel(denied)
    await vi.waitFor(() => expect(denied).toHaveBeenCalled())
    expect(screen.queryByTestId('appointment-reminders')).toBeNull()
  })

  it('[HH-LANG-03] Spanish staff see the panel in Spanish', async () => {
    renderPanel(
      vi.fn(async () => json(200, remindersView())),
      'es',
    )
    const panel = await screen.findByTestId('appointment-reminders')
    expect(within(panel).getByRole('heading', { name: 'Recordatorio de la cita' })).toBeTruthy()
    expect(within(panel).getByRole('button', { name: 'Enviar recordatorio' })).toBeTruthy()
    expect(within(panel).getByText('Dirección')).toBeTruthy()
  })
})
