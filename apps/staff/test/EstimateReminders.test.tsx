// The reminder panel of the staff builder (TSK-0060, TSK-0121; HH-EST-14, HH-COM-05, HH-COM-14, OWN-DEC-153). The API
// is a synthetic stand-in (RULE-SYNTHETIC-DATA).
import { staffTranslator } from '@handyhub/i18n'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EstimateReminders, reminderShownState, type Reminder, type RemindersView } from '../src/EstimateReminders'

afterEach(cleanup)

const V1 = '11111111-1111-4111-8111-111111111111'
const D1 = '33333333-3333-4333-8333-333333333333'
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
// Fixed instants far from the test run, so nothing depends on the clock: a due time in the future and one in the past.
const FUTURE = '2999-01-04T15:00:00.000Z'
const PAST = '2001-01-04T15:00:00.000Z'

const reminder = (over: Partial<Reminder> = {}): Reminder => ({
  id: D1,
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
const remindersView = (over: Partial<RemindersView> = {}): RemindersView => ({
  versionId: V1,
  cadence: {
    state: 'CONFIGURED',
    proposed: false,
    afterDeliveryHours: 72,
    deliveredAt: '2998-12-31T15:00:00.000Z',
    dueAt: FUTURE,
  },
  stoppedBy: null,
  reminders: [reminder()],
  ...over,
})

function renderPanel(fetchImpl: ReturnType<typeof vi.fn>, locale: 'en' | 'es' = 'en') {
  const { t } = staffTranslator(locale)
  render(<EstimateReminders t={t} fetchImpl={fetchImpl as unknown as typeof fetch} versionId={V1} />)
}

describe('[HH-EST-14][OWN-DEC-153] the estimate reminder panel', () => {
  it('shows the automatic reminder scheduled 3 days after delivery; nothing to release or dismiss', async () => {
    const fetchImpl = vi.fn(async () => json(200, remindersView()))
    renderPanel(fetchImpl)
    const panel = await screen.findByTestId('estimate-reminders')
    expect(within(panel).getByRole('heading', { name: 'Customer reminder' })).toBeTruthy()
    expect(within(panel).getByText(/sent automatically 3 days after the estimate was delivered/)).toBeTruthy()
    expect(within(panel).getByText(/^Delivered .*; the reminder is due /)).toBeTruthy()
    const item = within(panel).getByRole('list', { name: 'Customer reminder' })
    expect(within(item).getByText('Reminder by Email')).toBeTruthy()
    expect(within(item).getByText('Scheduled')).toBeTruthy()
    expect(within(item).getByText(/^Due /)).toBeTruthy()
    expect(within(panel).queryAllByRole('button')).toEqual([])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('[HH-COM-05] a stopped reminder names the reason; a sent one its time', async () => {
    renderPanel(
      vi.fn(async () =>
        json(
          200,
          remindersView({
            stoppedBy: 'accepted',
            reminders: [
              reminder({
                state: 'cancelled',
                reason: 'accepted',
                scheduledAt: null,
                cancelledAt: PAST,
                cancelledBy: 'system',
              }),
              reminder({ id: 'x', channel: 'sms', state: 'sent', scheduledAt: null, sentAt: PAST }),
            ],
          }),
        ),
      ),
    )
    await screen.findByText('Reminder stopped: The estimate was approved.')
    expect(screen.getByText('Reason: The estimate was approved')).toBeTruthy()
    expect(screen.getByText(/^Cancelled /)).toBeTruthy()
    expect(screen.getByText('Reminder by Text messages')).toBeTruthy()
    expect(screen.getByText(/^Sent /)).toBeTruthy()
  })

  it('[HH-COM-15] a text waiting for the permitted hours reads scheduled with its reason', async () => {
    renderPanel(
      vi.fn(async () =>
        json(200, remindersView({ reminders: [reminder({ channel: 'sms', reason: 'waiting_text_hours' })] })),
      ),
    )
    await screen.findByText('Scheduled')
    expect(screen.getByText("Reason: Waiting for the customer's permitted text hours")).toBeTruthy()
  })

  it('[RULE-DECIDED-VALUES-ACTIVE] NOT CONFIGURED and not yet delivered say so; a failed send reads not sent', async () => {
    renderPanel(
      vi.fn(async () =>
        json(
          200,
          remindersView({
            cadence: { state: 'NOT_CONFIGURED' },
            reminders: [reminder({ state: 'failed', reason: 'template_not_configured', scheduledAt: null })],
          }),
        ),
      ),
    )
    await screen.findByText('The reminder schedule is not configured, so no reminder is scheduled.')
    expect(screen.getByText('Not sent')).toBeTruthy()
    expect(screen.getByText('Reason: No approved wording for this message yet (not configured)')).toBeTruthy()
    cleanup()
    renderPanel(
      vi.fn(async () =>
        json(
          200,
          remindersView({
            cadence: { state: 'CONFIGURED', proposed: false, afterDeliveryHours: 72, deliveredAt: null, dueAt: null },
            reminders: [],
          }),
        ),
      ),
    )
    await screen.findByText(/has not been delivered successfully yet/)
    expect(screen.getByText('No reminder has been scheduled yet.')).toBeTruthy()
  })

  it('an earlier staff draft is listed as history', async () => {
    renderPanel(
      vi.fn(async () =>
        json(
          200,
          remindersView({
            reminders: [
              reminder({
                release: 'staff_released',
                state: 'cancelled',
                reason: 'replaced_by_automatic',
                scheduledAt: null,
                cancelledAt: PAST,
                cancelledBy: 'system',
              }),
            ],
          }),
        ),
      ),
    )
    await screen.findByText('Earlier staff draft')
    expect(screen.getByText('Reason: Replaced by the automatic reminder')).toBeTruthy()
  })

  it('a queued reminder due now reads Sending; due later, Scheduled', () => {
    expect(reminderShownState({ state: 'queued', scheduledAt: PAST })).toBe('queued')
    expect(reminderShownState({ state: 'queued', scheduledAt: FUTURE })).toBe('scheduled')
    expect(reminderShownState({ state: 'sent', scheduledAt: null })).toBe('sent')
    // Handed to the provider: it reads as sent, with its time.
    expect(reminderShownState({ state: 'queued', scheduledAt: null, sentAt: PAST })).toBe('sent')
  })

  it('[RULE-LANGUAGES] Spanish staff labels; nothing when the server refuses the list', async () => {
    renderPanel(
      vi.fn(async () => json(200, remindersView())),
      'es',
    )
    await screen.findByRole('heading', { name: 'Recordatorio al cliente' })
    expect(screen.getByText('Recordatorio por Correo electrónico')).toBeTruthy()
    expect(screen.getByText('Programado')).toBeTruthy()
    cleanup()
    const fetchImpl = vi.fn(async () => json(403, { error: { code: 'FORBIDDEN', fieldErrors: [] } }))
    renderPanel(fetchImpl)
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalled())
    expect(screen.queryByTestId('estimate-reminders')).toBeNull()
  })
})
