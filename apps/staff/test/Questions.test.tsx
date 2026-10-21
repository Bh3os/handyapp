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
      reminders: [
        { stage: 'first', state: 'not_scheduled', dueAt: null, sentAt: null, canRelease: false, deliveries: [] },
        { stage: 'final', state: 'not_scheduled', dueAt: null, sentAt: null, canRelease: false, deliveries: [] },
      ],
      reply: null,
    },
    {
      id: 'q-2',
      kind: 'general',
      text: 'Synthetic: please send a photo of the stain.',
      author: { id: 's-1', name: 'Synthetic Office' },
      publishedAt: '2026-10-19T15:00:00.000Z',
      state: 'answered',
      answeredAt: '2026-10-20T16:00:00.000Z',
      notice: { state: 'sent', sentAt: '2026-10-19T15:01:00.000Z', deliveries: [] },
      reminders: [
        {
          stage: 'first',
          state: 'draft',
          dueAt: '2026-10-20T15:01:00.000Z',
          sentAt: null,
          canRelease: true,
          deliveries: [{ id: 'd-2', channel: 'email', state: 'draft', errorCode: null, sendAt: null, retry: false }],
        },
        {
          stage: 'final',
          state: 'scheduled',
          dueAt: '2026-10-21T15:01:00.000Z',
          sentAt: null,
          canRelease: false,
          deliveries: [],
        },
      ],
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
  cadence: { firstHours: 24, finalHours: 48, closeAfterFinalHours: 24, contactHoursOnly: true },
  close: { allowed: true, available: false, reasons: ['FINAL_REMINDER_NOT_SENT'], availableAt: null },
  reopen: { days: 30, closedAt: null, until: null },
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
    expect(within(s).getByTestId('question-cadence').textContent).toMatch(/24 hours and 48 hours after the notice/)
    const items = within(s).getAllByRole('listitem', { name: /^Question published/ })
    expect(items).toHaveLength(2)
    const [first, second] = items as [HTMLElement, HTMLElement]
    expect(within(first).getByText('Synthetic: how tall is the ceiling?').getAttribute('lang')).toBe('en')
    expect(within(first).getByText('Measurement')).toBeTruthy()
    expect(within(first).getByText('Not sent')).toBeTruthy()
    expect(within(first).getByText(/a failed notice never counts as no response/)).toBeTruthy()
    expect(within(first).getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(within(first).getAllByText('Starts when the notice is sent')).toHaveLength(2)
    expect(within(second).getByRole('button', { name: 'Release First reminder' })).toBeTruthy()
    // The reply exactly as written, whitespace and all.
    expect(within(second).getByText((_, el) => el?.textContent === '  Synthetic reply, as written.\n')).toBeTruthy()
    expect(within(second).getByText(/1 photo:/)).toBeTruthy()
    // Closing is offered with the reason it is not possible yet.
    expect(within(s).getByText('The final reminder of every open question must actually be sent first.')).toBeTruthy()
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

  it('[HH-LEAD-06][HH-COM-09] Release a reminder draft; a refusal is written out in Spanish too', async () => {
    const write = vi.fn((url: string) =>
      url.endsWith('/reminders/first/release')
        ? json(409, { error: { code: 'CONFLICT', fieldErrors: [{ field: 'state', code: 'QUESTION_ANSWERED' }] } })
        : json(500, {}),
    )
    show(
      api(() => VIEW, write),
      'es',
    )
    const s = await screen.findByRole('region', { name: 'Preguntas al cliente' })
    fireEvent.click(within(s).getByRole('button', { name: 'Enviar Primer recordatorio' }))
    expect(
      await within(s).findByText('El cliente ya respondió esta pregunta; sus recordatorios se cancelaron.'),
    ).toBeTruthy()
    expect(write.mock.calls[0]?.[0]).toBe(`/api/v1/staff/requests/${REQ}/questions/q-2/reminders/first/release`)
  })

  it('[HH-LEAD-06][T30] Closed—no response once possible: confirmed with the version; the reopen period shows once closed', async () => {
    let view: QuestionsView = { ...VIEW, close: { allowed: true, available: true, reasons: [], availableAt: null } }
    const write = vi.fn((url: string) => {
      if (url.endsWith('/actions/close-no-response')) {
        view = {
          ...view,
          state: 'closed_no_response',
          reopen: { days: 30, closedAt: '2026-10-21T15:00:00.000Z', until: '2026-11-20T15:00:00.000Z' },
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
})
