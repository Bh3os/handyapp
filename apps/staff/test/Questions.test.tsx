// Questions to the customer on the request record (TSK-0051; HH-LEAD-03, HH-LEAD-06, HH-COM-02, HH-COM-09, OWN-DEC-98,
// OWN-DEC-101, RULE-LANGUAGES). The API is a synthetic stand-in (RULE-SYNTHETIC-DATA).
import { staffTranslator } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RequestQuestions, type QuestionsView } from '../src/Questions'

afterEach(() => {
  cleanup()
  window.sessionStorage.clear()
})

const REQ = '11111111-1111-4111-8111-111111111111'
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const VIEW: QuestionsView = {
  requestId: REQ,
  reference: 'HH-7K2M9Q4D',
  state: 'needs_information',
  version: 4,
  projectState: 'open',
  questions: [
    {
      id: 'q-1',
      kind: 'measurement',
      notSureAllowed: true,
      text: 'Synthetic: how tall is the ceiling?',
      author: { id: 's-1', name: 'Synthetic Office' },
      publishedAt: '2026-10-20T15:00:00.000Z',
      state: 'published',
      answeredAt: null,
      notice: {
        state: 'failed',
        sentAt: null,
        deliveries: [
          {
            id: 'd-1',
            channel: 'email',
            state: 'failed',
            errorCode: 'template_values_missing',
            sendAt: null,
            retry: true,
          },
        ],
      },
      reminder: { state: 'not_scheduled', dueAt: null, sentAt: null, deliveries: [] },
      reply: null,
    },
    {
      id: 'q-2',
      kind: 'general',
      notSureAllowed: false,
      text: 'Synthetic: please send a photo of the stain.',
      author: { id: 's-1', name: 'Synthetic Office' },
      publishedAt: '2026-10-19T15:00:00.000Z',
      state: 'answered',
      answeredAt: '2026-10-20T16:00:00.000Z',
      notice: { state: 'sent', sentAt: '2026-10-19T15:01:00.000Z', deliveries: [] },
      reminder: {
        state: 'scheduled',
        dueAt: '2026-10-22T15:01:00.000Z',
        sentAt: null,
        deliveries: [
          {
            id: 'd-2',
            channel: 'email',
            state: 'queued',
            errorCode: null,
            sendAt: '2026-10-22T15:01:00.000Z',
            retry: false,
          },
          {
            id: 'd-3',
            channel: 'sms',
            state: 'failed',
            errorCode: 'sms_disabled',
            sendAt: null,
            retry: false,
          },
        ],
      },
      reply: {
        text: '  Synthetic reply, as written.\n',
        notSure: false,
        at: '2026-10-20T16:00:00.000Z',
        reopenedRequest: false,
        photos: [{ id: 'p-1', state: 'ready' }],
      },
    },
  ],
  canPublish: true,
  repliesWaiting: true,
  canMarkReviewed: true,
  cadence: { afterDeliveryHours: 72, closeAfterReminderHours: 24 },
  close: { allowed: true, available: false, reasons: ['FINAL_REMINDER_NOT_SENT'], availableAt: null },
  reopen: { days: 30, closedAt: null, until: null, periodEnded: false, allowed: false },
  maxLength: 2000,
}

type Write = (url: string, init: RequestInit) => Response
function api(view: () => QuestionsView, write?: Write) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method && init.method !== 'GET') return write?.(url, init) ?? json(500, {})
    if (url === `/api/v1/staff/requests/${REQ}/questions`) return json(200, view())
    return json(404, { error: { code: 'NOT_FOUND', fieldErrors: [] } })
  })
}
const show = (fetchImpl: ReturnType<typeof api>, locale: 'en' | 'es' = 'en', onChanged = vi.fn(async () => {})) =>
  render(
    <RequestQuestions
      t={staffTranslator(locale).t}
      locale={locale}
      fetchImpl={fetchImpl as unknown as typeof fetch}
      requestId={REQ}
      onChanged={onChanged}
    />,
  )
const section = () => screen.findByRole('region', { name: 'Questions to the customer' })

describe('questions to the customer (TSK-0051, HH-LEAD-03, OWN-DEC-98)', () => {
  it('[HH-LEAD-03][HH-LEAD-06][HH-COM-02] each question as written, its notice (a failure with Retry), its reminders and the reply as written', async () => {
    show(api(() => VIEW))
    const s = await section()
    expect(within(s).getByText(/HandyHub has a question about your request\. View and reply securely\./)).toBeTruthy()
    expect(within(s).getByTestId('question-cadence').textContent).toMatch(
      /One reminder is sent automatically 72 hours after the notice was delivered/,
    )
    const items = within(s).getAllByRole('listitem', { name: /^Question published/ })
    expect(items).toHaveLength(2)
    const [first, second] = items as [HTMLElement, HTMLElement]
    expect(within(first).getByText('Synthetic: how tall is the ceiling?').getAttribute('lang')).toBe('en')
    expect(within(first).getByText('Measurement')).toBeTruthy()
    expect(within(first).getByText('Not sent')).toBeTruthy()
    expect(within(first).getByText(/a failed notice never counts as no response/)).toBeTruthy()
    expect(within(first).getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(within(first).getAllByText('Starts when the notice is sent')).toHaveLength(1)
    // TSK-0121: the one automatic reminder, scheduled; nothing to release. The text is kept off until A2P 10DLC.
    const reminder = within(second).getByTestId('question-reminder')
    expect(within(reminder).getByText('Scheduled')).toBeTruthy()
    expect(within(reminder).getByText(/^due /)).toBeTruthy()
    expect(
      within(reminder).getByText(/not sent: texts are off until the A2P 10DLC registration is complete/i),
    ).toBeTruthy()
    expect(within(second).queryByRole('button', { name: /Release/ })).toBeNull()
    // The reply exactly as written, whitespace and all.
    expect(within(second).getByText((_, el) => el?.textContent === '  Synthetic reply, as written.\n')).toBeTruthy()
    expect(within(second).getByText(/1 photo:/)).toBeTruthy()
    // Closing is offered with the reason it is not possible yet.
    expect(within(s).getByText('The reminder of every open question must actually be sent first.')).toBeTruthy()
  })

  it('[HH-LEAD-03][OWN-DEC-98] the hazard guard must be confirmed; Publish sends the version and keeps the draft and key across a failure', async () => {
    let fail = true
    const write = vi.fn((url: string) => {
      if (url.endsWith('/questions'))
        return fail
          ? json(503, { error: { code: 'UNAVAILABLE', fieldErrors: [] } })
          : json(201, { questionId: 'q-3', requestId: REQ, state: 'needs_information', version: 5, moved: false })
      return json(500, {})
    })
    const fetchImpl = api(() => VIEW, write)
    const onChanged = vi.fn(async () => {})
    show(fetchImpl, 'en', onChanged)
    const s = await section()
    const form = within(s).getByRole('form', { name: 'Ask the customer a question' })
    expect(within(form).getByText(/Never ask the customer to go into, open or inspect a hazardous area/)).toBeTruthy()
    fireEvent.change(within(form).getByLabelText(/^Question/), { target: { value: 'Synthetic: which wall is it?' } })
    fireEvent.click(within(form).getByLabelText(/Measurement/))
    const publish = within(form).getByRole('button', { name: 'Publish question' }) as HTMLButtonElement
    expect(publish.disabled).toBe(true)
    expect(within(form).getByText('Confirm the safety check first.')).toBeTruthy()
    fireEvent.click(within(form).getByLabelText('This question does not ask the customer to inspect a hazardous area.'))
    fireEvent.click(within(form).getByRole('button', { name: 'Publish question' }))
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1))
    const [, init] = write.mock.calls[0] as unknown as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    expect(headers['if-match']).toBe('"4"')
    expect(JSON.parse(String(init.body))).toEqual({
      text: 'Synthetic: which wall is it?',
      kind: 'measurement',
      notSureAllowed: true,
      noHazardInspection: true,
    })
    // The draft and its key survive the failure (and a reload of the section).
    const stored = JSON.parse(window.sessionStorage.getItem(`hh.staff.question-draft.${REQ}`) ?? '{}')
    expect(stored).toMatchObject({
      text: 'Synthetic: which wall is it?',
      kind: 'measurement',
      key: headers['idempotency-key'],
    })
    fail = false
    fireEvent.click(within(form).getByRole('button', { name: 'Publish question' }))
    await waitFor(() => expect(write).toHaveBeenCalledTimes(2))
    const [, retry] = write.mock.calls[1] as unknown as [string, RequestInit]
    expect((retry.headers as Record<string, string>)['idempotency-key']).toBe(headers['idempotency-key'])
    expect(await within(s).findByText('Question published. The customer is notified automatically.')).toBeTruthy()
    expect(onChanged).toHaveBeenCalled()
    expect(window.sessionStorage.getItem(`hh.staff.question-draft.${REQ}`)).toBeNull()
  })

  it('[HH-LEAD-06][OWN-DEC-153] the automatic reminder in Spanish staff labels', async () => {
    show(
      api(() => VIEW),
      'es',
    )
    const s = await screen.findByRole('region', { name: 'Preguntas al cliente' })
    expect(within(s).getByTestId('question-cadence').textContent).toMatch(
      /Se envía automáticamente un recordatorio 72 horas/,
    )
    expect(within(s).getAllByText('Recordatorio').length).toBeGreaterThan(0)
    expect(within(s).getByText('Programado')).toBeTruthy()
  })

  it('[HH-LEAD-06][T30] Closed—no response once possible: confirmed with the version; the reopen period shows once closed', async () => {
    let view: QuestionsView = { ...VIEW, close: { allowed: true, available: true, reasons: [], availableAt: null } }
    const write = vi.fn((url: string) => {
      if (url.endsWith('/actions/close-no-response')) {
        view = {
          ...view,
          state: 'closed_no_response',
          reopen: {
            days: 30,
            closedAt: '2026-10-21T15:00:00.000Z',
            until: '2026-11-20T15:00:00.000Z',
            periodEnded: false,
            allowed: true,
          },
        }
        return json(200, {
          requestId: REQ,
          outcome: 'moved',
          state: 'closed_no_response',
          version: 5,
          projectState: 'closed',
        })
      }
      return json(500, {})
    })
    show(api(() => view, write))
    const s = await section()
    fireEvent.click(within(s).getByRole('button', { name: 'Closed—no response' }))
    const form = within(s).getByRole('form', { name: 'Closed—no response' })
    expect(within(form).getByText(/Accepted, scheduled or paid work is never closed this way/)).toBeTruthy()
    fireEvent.click(within(form).getByRole('button', { name: 'Confirm: Closed—no response' }))
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1))
    const [, init] = write.mock.calls[0] as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>)['if-match']).toBe('"4"')
    expect(await within(s).findByText('Request closed: no response.')).toBeTruthy()
    expect(await within(s).findByText(/A customer reply until .+ reopens this request for review\./)).toBeTruthy()
  })

  it('[HH-LEAD-03][OWN-DEC-197] any question may offer "I\'m not sure"; a measurement always does (TSK-0148, E2)', async () => {
    const write = vi.fn(() =>
      json(201, { questionId: 'q-3', requestId: REQ, state: 'needs_information', version: 5, moved: false }),
    )
    show(api(() => VIEW, write))
    const s = await section()
    // The answered general question did not offer it; the measurement did.
    const items = within(s).getAllByRole('listitem', { name: /^Question published/ })
    expect(within(items[0] as HTMLElement).getByText("“I'm not sure” offered")).toBeTruthy()
    expect(within(items[1] as HTMLElement).queryByText("“I'm not sure” offered")).toBeNull()
    const form = within(s).getByRole('form', { name: 'Ask the customer a question' })
    const notSure = within(form).getByLabelText(
      /The customer may answer “I'm not sure” or “I don't know”/,
    ) as HTMLInputElement
    fireEvent.click(within(form).getByLabelText(/Measurement/))
    expect([notSure.checked, notSure.disabled]).toEqual([true, true])
    fireEvent.click(within(form).getByLabelText(/Measurement/))
    expect([notSure.checked, notSure.disabled]).toEqual([false, false])
    fireEvent.click(notSure)
    fireEvent.change(within(form).getByLabelText(/^Question/), { target: { value: 'Synthetic: what is above it?' } })
    fireEvent.click(within(form).getByLabelText('This question does not ask the customer to inspect a hazardous area.'))
    fireEvent.click(within(form).getByRole('button', { name: 'Publish question' }))
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1))
    const [, init] = write.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({
      text: 'Synthetic: what is above it?',
      kind: 'general',
      notSureAllowed: true,
      noHazardInspection: true,
    })
  })

  it('[HH-LEAD-06][OWN-DEC-208] a reminder that was not delivered asks for follow-up instead of closing (TSK-0148, E4)', async () => {
    const failed: QuestionsView = {
      ...VIEW,
      questions: VIEW.questions.map((q) =>
        q.id === 'q-1' ? { ...q, reminder: { state: 'failed', dueAt: null, sentAt: null, deliveries: [] } } : q,
      ),
      close: { allowed: true, available: false, reasons: ['REMINDER_FAILED'], availableAt: null },
    }
    show(api(() => failed))
    const s = await section()
    expect(within(s).getByText(/The reminder was not delivered\. Follow up with the customer another way/)).toBeTruthy()
    expect(
      within(s).getByText('The reminder was not delivered: follow up with the customer instead of closing.'),
    ).toBeTruthy()
  })

  it('[HH-LEAD-06][OWN-DEC-197] after the reopen period staff reopen with a written reason and the version (TSK-0148, E5)', async () => {
    let view: QuestionsView = {
      ...VIEW,
      state: 'closed_no_response',
      projectState: 'closed',
      canPublish: false,
      close: { allowed: true, available: false, reasons: ['INVALID_TRANSITION'], availableAt: null },
      reopen: {
        days: 30,
        closedAt: '2026-09-01T15:00:00.000Z',
        until: '2026-10-01T15:00:00.000Z',
        periodEnded: true,
        allowed: true,
      },
    }
    const write = vi.fn((url: string) => {
      if (!url.endsWith('/actions/reopen')) return json(500, {})
      view = { ...view, state: 'reviewing', projectState: 'open', reopen: { ...view.reopen, allowed: false } }
      return json(200, { requestId: REQ, state: 'reviewing', version: 5, projectState: 'open', afterPeriod: true })
    })
    const onChanged = vi.fn(async () => {})
    show(
      api(() => view, write),
      'en',
      onChanged,
    )
    const s = await section()
    expect(
      within(s).getByText(/The reopen period ended .+: a customer reply no longer reopens this request/),
    ).toBeTruthy()
    fireEvent.click(within(s).getByRole('button', { name: 'Reopen request' }))
    const form = within(s).getByRole('form', { name: 'Reopen request' })
    expect(within(form).getByText(/Nothing else is restored/)).toBeTruthy()
    const confirm = within(form).getByRole('button', { name: 'Confirm: Reopen request' }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    fireEvent.change(within(form).getByLabelText(/^Why it is reopened/), {
      target: { value: 'Synthetic: the customer called back.' },
    })
    fireEvent.click(within(form).getByRole('button', { name: 'Confirm: Reopen request' }))
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1))
    const [, init] = write.mock.calls[0] as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>)['if-match']).toBe('"4"')
    expect(JSON.parse(String(init.body))).toEqual({ reason: 'Synthetic: the customer called back.' })
    expect(await within(s).findByText('Request reopened for review.')).toBeTruthy()
    expect(onChanged).toHaveBeenCalled()
    expect(within(s).queryByRole('button', { name: 'Reopen request' })).toBeNull()
  })

  it('[RULE-LANGUAGES] the new labels in Spanish (TSK-0148)', async () => {
    show(
      api(() => ({ ...VIEW, state: 'closed_no_response', reopen: { ...VIEW.reopen, allowed: true } })),
      'es',
    )
    const s = await screen.findByRole('region', { name: 'Preguntas al cliente' })
    expect(within(s).getByText('Se ofrece “No estoy seguro”')).toBeTruthy()
    expect(within(s).getByRole('button', { name: 'Reabrir solicitud' })).toBeTruthy()
  })
})
