// The reminders panel of the staff builder (TSK-0060; HH-EST-14, HH-COM-05, OWN-DEC-78, OWN-DEC-132). The API is a
// synthetic stand-in (RULE-SYNTHETIC-DATA).
import { staffTranslator } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EstimateReminders, type Reminder, type RemindersView } from '../src/EstimateReminders'

afterEach(cleanup)

const V1 = '11111111-1111-4111-8111-111111111111'
const D1 = '33333333-3333-4333-8333-333333333333'
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const draft = (over: Partial<Reminder> = {}): Reminder => ({
  id: D1,
  step: 'first',
  state: 'draft',
  channel: 'email',
  reason: null,
  draftedAt: '2026-10-22T15:00:00.000Z',
  releasedAt: null,
  releasedBy: null,
  cancelledAt: null,
  cancelledBy: null,
  actions: { release: true, dismiss: true },
  ...over,
})
const remindersView = (over: Partial<RemindersView> = {}): RemindersView => ({
  versionId: V1,
  cadence: {
    state: 'CONFIGURED',
    proposed: false,
    firstHours: 24,
    finalHours: 72,
    firstAt: '2026-10-22T15:00:00.000Z',
    finalAt: '2026-10-24T15:00:00.000Z',
  },
  stoppedBy: null,
  reminders: [draft()],
  ...over,
})

function renderPanel(fetchImpl: ReturnType<typeof vi.fn>, locale: 'en' | 'es' = 'en') {
  const { t } = staffTranslator(locale)
  render(<EstimateReminders t={t} fetchImpl={fetchImpl as unknown as typeof fetch} versionId={V1} />)
}

describe('[HH-EST-14] the estimate reminders panel', () => {
  it('[OWN-DEC-78] shows the draft and its schedule; Send releases it with an idempotency key', async () => {
    const sent = remindersView({
      reminders: [
        draft({
          state: 'queued',
          releasedAt: '2026-10-22T16:00:00.000Z',
          releasedBy: { id: 'staff-1', name: 'Synthetic Estimator' },
          actions: { release: false, dismiss: false },
        }),
      ],
    })
    const fetchImpl = vi.fn(async (url: string) =>
      url.endsWith('/release') ? json(200, sent) : json(200, remindersView()),
    )
    renderPanel(fetchImpl)
    const panel = await screen.findByTestId('estimate-reminders')
    expect(within(panel).getByRole('heading', { name: 'Customer reminders' })).toBeTruthy()
    expect(within(panel).getByText(/none is sent until you send it/)).toBeTruthy()
    expect(within(panel).getByText(/^First reminder drafted /)).toBeTruthy()
    const item = within(panel).getByRole('list', { name: 'Customer reminders' })
    expect(within(item).getByText('First reminder by Email')).toBeTruthy()
    expect(within(item).getByText('Draft, not sent')).toBeTruthy()
    fireEvent.click(within(panel).getByRole('button', { name: 'Send reminder' }))
    await screen.findByText('Sent for delivery. Its outcome shows here.')
    const [url, init] = fetchImpl.mock.calls[1] as unknown as [string, RequestInit]
    expect(url).toBe(`/api/v1/staff/estimate-reminders/${D1}/release`)
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['idempotency-key']).toMatch(/^staff-/)
    expect(within(panel).getByText('Sending')).toBeTruthy()
    expect(within(panel).getByText(/^Sent by Synthetic Estimator, /)).toBeTruthy()
    expect(within(panel).queryByRole('button', { name: 'Send reminder' })).toBeNull()
  })

  it('[HH-COM-05] a refused release names the stop reason and reloads the reminders', async () => {
    const stopped = remindersView({
      stoppedBy: 'accepted',
      reminders: [
        draft({
          state: 'cancelled',
          reason: 'accepted',
          cancelledAt: '2026-10-22T16:00:00.000Z',
          cancelledBy: 'system',
          actions: { release: false, dismiss: false },
        }),
      ],
    })
    let loads = 0
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith('/release'))
        return json(409, {
          error: { code: 'CONFLICT', fieldErrors: [{ field: 'reminder', code: 'accepted', message: '' }] },
        })
      return json(200, ++loads === 1 ? remindersView() : stopped)
    })
    renderPanel(fetchImpl)
    fireEvent.click(await screen.findByRole('button', { name: 'Send reminder' }))
    await screen.findByText('The reminder was not sent')
    expect(screen.getAllByText('The estimate was approved').length).toBeGreaterThan(0)
    await screen.findByText('Reminders stopped: The estimate was approved.')
    expect(screen.getByText('Reason: The estimate was approved')).toBeTruthy()
    expect(screen.getByText(/^Cancelled /)).toBeTruthy()
  })

  it('dismiss keeps the draft as dismissed, with who dismissed it', async () => {
    const dismissed = remindersView({
      reminders: [
        draft({
          state: 'cancelled',
          reason: 'dismissed',
          cancelledAt: '2026-10-22T16:00:00.000Z',
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
    expect(screen.getByText('Reason: Dismissed by staff')).toBeTruthy()
  })

  it('[RULE-DECIDED-VALUES-ACTIVE] says so when the schedule is NOT CONFIGURED; a failed send reads not sent', async () => {
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
    await screen.findByText('The reminder schedule is not configured, so no reminder is drafted.')
    expect(screen.getByText('Not sent')).toBeTruthy()
    expect(screen.getByText('Reason: No approved wording for this message yet (not configured)')).toBeTruthy()
  })

  it('[RULE-LANGUAGES] Spanish staff labels; nothing when the server refuses the list', async () => {
    renderPanel(
      vi.fn(async () => json(200, remindersView())),
      'es',
    )
    await screen.findByRole('heading', { name: 'Recordatorios al cliente' })
    expect(screen.getByText('Primer recordatorio por Correo electrónico')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Enviar recordatorio' })).toBeTruthy()
    cleanup()
    const fetchImpl = vi.fn(async () => json(403, { error: { code: 'FORBIDDEN', fieldErrors: [] } }))
    renderPanel(fetchImpl)
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalled())
    expect(screen.queryByTestId('estimate-reminders')).toBeNull()
  })
})
