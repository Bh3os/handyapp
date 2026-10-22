// The appointment reminder panel of the scheduling board (TSK-0067, TSK-0121; HH-COM-11, HH-COM-05, HH-COM-14,
// OWN-DEC-153, OWN-DEC-107). The API is a synthetic stand-in (RULE-SYNTHETIC-DATA).
import { staffTranslator } from '@handyhub/i18n'
import { cleanup, render, screen, within } from '@testing-library/react'
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
// Fixed instants far from the test run, so nothing depends on the clock.
const FUTURE = '2999-01-04T15:00:00.000Z'
const PAST = '2001-01-04T15:00:00.000Z'

const reminder = (over: Partial<AppointmentReminder> = {}): AppointmentReminder => ({
  id: D1,
  windowVersion: 1,
  current: true,
  release: 'automatic',
  state: 'queued',
  channel: 'email',
  reason: null,
  scheduledAt: FUTURE,
  sentAt: null,
  cancelledAt: null,
  cancelledBy: null,
  ...over,
})
const remindersView = (over: Partial<AppointmentRemindersView> = {}): AppointmentRemindersView => ({
  visitId: VISIT,
  visitState: 'confirmed',
  cadence: { state: 'CONFIGURED', proposed: false, hoursBefore: 24, dueAt: FUTURE },
  stoppedBy: null,
  reminders: [reminder()],
  ...over,
})

function renderPanel(fetchImpl: ReturnType<typeof vi.fn>, locale: 'en' | 'es' = 'en') {
  const { t } = staffTranslator(locale)
  render(<AppointmentReminders t={t} fetchImpl={fetchImpl as unknown as typeof fetch} visitId={VISIT} />)
}

describe('[HH-COM-11][OWN-DEC-153] the appointment reminder panel', () => {
  it('shows the automatic reminder 24 hours before, scheduled; nothing to release or dismiss', async () => {
    renderPanel(vi.fn(async () => json(200, remindersView())))
    const panel = await screen.findByTestId('appointment-reminders')
    expect(within(panel).getByRole('heading', { name: 'Appointment reminder' })).toBeTruthy()
    expect(within(panel).getByText(/sent automatically 24 hours before the arrival window/)).toBeTruthy()
    expect(within(panel).getByText(/never the address/)).toBeTruthy()
    expect(within(panel).getByText(/^Sent automatically 24 hours before the arrival window: /)).toBeTruthy()
    const item = within(panel).getByTestId('appointment-reminder')
    expect(within(item).getByText('Reminder by Email')).toBeTruthy()
    expect(within(item).getByText('Scheduled')).toBeTruthy()
    expect(within(item).getByText(/^Due /)).toBeTruthy()
    expect(within(panel).queryAllByRole('button')).toEqual([])
  })

  it('[OWN-DEC-153] a reschedule cancels the earlier window; a late booking names why none is scheduled', async () => {
    renderPanel(
      vi.fn(async () =>
        json(
          200,
          remindersView({
            stoppedBy: null,
            reminders: [
              reminder({
                current: false,
                windowVersion: 1,
                state: 'cancelled',
                reason: 'visit_rescheduled',
                scheduledAt: null,
                cancelledAt: PAST,
                cancelledBy: 'system',
              }),
              reminder({ id: 'x', windowVersion: 2, state: 'sent', scheduledAt: null, sentAt: PAST }),
            ],
          }),
        ),
      ),
    )
    await screen.findByText('For an earlier date or window')
    expect(screen.getByText('Reason: The appointment moved to another date or window')).toBeTruthy()
    expect(screen.getByText(/^Sent .*2001/)).toBeTruthy()
    cleanup()
    renderPanel(vi.fn(async () => json(200, remindersView({ stoppedBy: 'booked_within_interval', reminders: [] }))))
    await screen.findByText(
      'No reminder for this appointment now: Booked less than 24 hours ahead: no 24-hour reminder.',
    )
  })

  it('[RULE-DECIDED-VALUES-ACTIVE] NOT CONFIGURED says so; a text kept off reads not sent with its reason', async () => {
    renderPanel(
      vi.fn(async () =>
        json(
          200,
          remindersView({
            cadence: { state: 'NOT_CONFIGURED' },
            reminders: [reminder({ channel: 'sms', state: 'failed', reason: 'sms_disabled', scheduledAt: null })],
          }),
        ),
      ),
    )
    await screen.findByText('The reminder interval is not configured, so no reminder is scheduled.')
    expect(screen.getByText('Not sent')).toBeTruthy()
    expect(screen.getByText('Reason: Texts are off until the A2P 10DLC registration is complete')).toBeTruthy()
  })

  it('nothing for a visit never confirmed without reminders; Spanish staff labels', async () => {
    const fetchImpl = vi.fn(async () => json(200, remindersView({ visitState: 'tentative', reminders: [] })))
    renderPanel(fetchImpl)
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalled())
    expect(screen.queryByTestId('appointment-reminders')).toBeNull()
    cleanup()
    renderPanel(
      vi.fn(async () => json(200, remindersView())),
      'es',
    )
    await screen.findByRole('heading', { name: 'Recordatorio de la cita' })
    expect(screen.getByText('Recordatorio por Correo electrónico')).toBeTruthy()
    expect(screen.getByText('Programado')).toBeTruthy()
  })
})
