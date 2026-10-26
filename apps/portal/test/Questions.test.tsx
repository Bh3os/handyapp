// Questions from HandyHub and writing in the project conversation (TSK-0051; HH-LEAD-03, HH-LEAD-06, HH-PORT-09,
// HH-COM-02, HH-SEC-05, OWN-DEC-98, OWN-DEC-101, RULE-LANGUAGES). The API is a synthetic stand-in; every reference
// and text is invented for the test (RULE-SYNTHETIC-DATA).
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/App'
import { parseQuestions, type Fetch } from '../src/api'

afterEach(() => {
  cleanup()
  window.sessionStorage.clear()
  window.history.replaceState(null, '', '/')
})

const REF = 'HH-7K2M9Q4D'
const NOW = '2026-10-21T15:00:00.000Z'
const SENT = '2026-10-20T14:00:00.000Z'
const Q1 = '11111111-1111-4111-8111-111111111111'
const Q2 = '22222222-2222-4222-8222-222222222222'
// The questions are read after the Overview says HandyHub asked some: two reads in a row, so the first find waits
// longer than the default second under a loaded test run.
const LOADED = { timeout: 5000 }
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const overview = (status: Record<string, unknown> = {}) => ({
  reference: REF,
  services: ['Patching & Repair'],
  notSure: false,
  submittedAt: SENT,
  status: {
    situation: 'more_information',
    step: 'answer_questions',
    waitingOn: 'customer',
    nextAction: 'reply',
    since: SENT,
    text: null,
    ...status,
  },
  timeline: [
    { kind: 'more_information', at: NOW, text: null },
    { kind: 'received', at: SENT, text: null },
  ],
  appointment: null,
  payment: { state: 'none' },
  refreshedAt: NOW,
  refreshSeconds: 0,
})
const questions = (over: Record<string, unknown> = {}) => ({
  reference: REF,
  refreshedAt: NOW,
  refreshSeconds: 0,
  questions: [
    {
      id: Q1,
      kind: 'measurement',
      notSureAllowed: true,
      text: 'Synthetic: how tall is the ceiling?',
      askedAt: NOW,
      state: 'waiting',
      canReply: true,
      reply: null,
    },
    {
      id: Q2,
      kind: 'general',
      notSureAllowed: false,
      text: 'Synthetic: when was it painted?',
      askedAt: NOW,
      state: 'waiting',
      canReply: true,
      reply: null,
    },
  ],
  replyWindow: 'open',
  reopenUntil: null,
  maxLength: 5000,
  ...over,
})

type Handler = (url: string, init?: RequestInit) => Response | undefined
function api(handlers: Handler[]) {
  const calls: { url: string; init?: RequestInit }[] = []
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, ...(init ? { init } : {}) })
    for (const h of handlers) {
      const r = h(url, init)
      if (r) return r
    }
    return json(404, { error: { code: 'NOT_FOUND', fieldErrors: [] } })
  })
  return { fetchImpl: fetchImpl as unknown as Fetch, calls }
}
const reads =
  (q: () => unknown = () => questions(), o: () => unknown = () => overview()): Handler =>
  (url, init) => {
    if (init?.method && init.method !== 'GET') return undefined
    if (url.endsWith('/overview')) return json(200, o())
    if (url.endsWith('/questions')) return json(200, q())
    if (url.endsWith('/messages'))
      return json(200, { reference: REF, refreshedAt: NOW, refreshSeconds: 0, messages: [] })
    return undefined
  }

describe('questions from HandyHub in the portal (TSK-0051, HH-LEAD-03, OWN-DEC-98)', () => {
  it('[HH-LEAD-03] each question as written, "Waiting on you", and a clear Reply; "I\'m not sure" only for a measurement', async () => {
    const { fetchImpl } = api([reads()])
    render(<App path={`/portal/p/${REF}`} fetchImpl={fetchImpl} />)
    const section = await screen.findByRole('region', { name: 'Questions from HandyHub' }, LOADED)
    expect(within(section).getByText('Synthetic: how tall is the ceiling?')).toBeTruthy()
    expect(within(section).getAllByText('Waiting on you')).toHaveLength(2)
    // The status's Reply now opens the first waiting question (it was inactive before questions existed).
    const next = screen.getByTestId('next-action')
    expect(within(next).getByRole('link', { name: 'Reply' }).getAttribute('href')).toBe(`#question-${Q1}`)
    const [first, second] = within(section).getAllByRole('button', { name: 'Reply' }) as [HTMLElement, HTMLElement]
    fireEvent.click(first)
    const form = within(section).getByRole('form', { name: "Reply to HandyHub's question" })
    expect(within(form).getByLabelText("I'm not sure")).toBeTruthy()
    expect(within(form).getByText(/Only share what you can see or photograph safely/)).toBeTruthy()
    void second
  })

  it('[HH-LEAD-03][HH-COM-02] a failed send keeps the reply and its key; the retry records it once: "Reply received—HandyHub will review it"', async () => {
    let fail = true
    const replies: RequestInit[] = []
    const write: Handler = (url, init) => {
      if (!url.endsWith(`/questions/${Q2}/replies`) || init?.method !== 'POST') return undefined
      replies.push(init)
      if (fail) return json(503, { error: { code: 'UNAVAILABLE', fieldErrors: [] } })
      return json(201, { questionId: Q2, state: 'answered', at: NOW, photos: 0, reopened: false })
    }
    const { fetchImpl } = api([write, reads()])
    render(<App path={`/portal/p/${REF}`} fetchImpl={fetchImpl} />)
    const section = await screen.findByRole('region', { name: 'Questions from HandyHub' }, LOADED)
    fireEvent.click(within(section).getAllByRole('button', { name: 'Reply' })[1] as HTMLElement)
    const form = within(section).getByRole('form', { name: "Reply to HandyHub's question" })
    // Not offered by HandyHub for this question: no "I'm not sure".
    expect(within(form).queryByLabelText("I'm not sure")).toBeNull()
    const text = '  Synthetic: last spring, I think.\n'
    fireEvent.change(within(form).getByLabelText('Your reply'), { target: { value: text } })
    fireEvent.click(within(form).getByRole('button', { name: 'Send reply' }))
    expect(await within(form).findByText(/Your reply wasn't sent\. Your text and photos are still here/)).toBeTruthy()
    const key = (replies[0]?.headers as Record<string, string>)['idempotency-key']
    expect(JSON.parse(String(replies[0]?.body))).toEqual({ text })
    expect(JSON.parse(window.sessionStorage.getItem(`hh.portal.reply.${REF}.${Q2}`) ?? '{}')).toMatchObject({
      text,
      key,
    })
    fail = false
    fireEvent.click(within(form).getByRole('button', { name: 'Send reply' }))
    expect(await within(section).findByText('Reply received—HandyHub will review it')).toBeTruthy()
    expect((replies[1]?.headers as Record<string, string>)['idempotency-key']).toBe(key)
    expect(window.sessionStorage.getItem(`hh.portal.reply.${REF}.${Q2}`)).toBeNull()
  })

  it('[HH-LEAD-06][T30] Closed—no response within the period: Reply reopens; after it, a new request is the way', async () => {
    const reopen = api([
      reads(
        () => questions({ replyWindow: 'reopen', reopenUntil: '2026-11-20T15:00:00.000Z' }),
        () => overview({ situation: 'closed_no_response', step: 'closed' }),
      ),
    ])
    render(<App path={`/portal/p/${REF}`} fetchImpl={reopen.fetchImpl} />)
    const section = await screen.findByRole('region', { name: 'Questions from HandyHub' }, LOADED)
    expect(
      within(section).getByText(
        /This request was closed because HandyHub didn't hear back\. Reply by .+ to reopen it\./,
      ),
    ).toBeTruthy()
    cleanup()
    const ended = api([
      reads(
        () => ({
          ...questions({ replyWindow: 'period_ended' }),
          questions: (questions().questions as { canReply: boolean }[]).map((q) => ({ ...q, canReply: false })),
        }),
        () => overview({ situation: 'closed_no_response', step: 'closed', waitingOn: 'nobody', nextAction: 'none' }),
      ),
    ])
    render(<App path={`/portal/p/${REF}`} fetchImpl={ended.fetchImpl} />)
    const closed = await screen.findByRole('region', { name: 'Questions from HandyHub' }, LOADED)
    expect(within(closed).getByText('This request is closed. To continue, send a new request.')).toBeTruthy()
    expect(within(closed).getByRole('link', { name: 'Send a new request' }).getAttribute('href')).toBe('/request')
    expect(within(closed).queryByRole('button', { name: 'Reply' })).toBeNull()
  })

  it('[HH-LEAD-03][OWN-DEC-197] "I\'m not sure" on any question HandyHub offered it for, not only a measurement (TSK-0148, E2)', async () => {
    const replies: string[] = []
    const write: Handler = (url, init) => {
      if (!url.endsWith(`/questions/${Q2}/replies`) || init?.method !== 'POST') return undefined
      replies.push(String(init.body))
      return json(201, { questionId: Q2, state: 'answered', at: NOW, photos: 0, reopened: false })
    }
    const offered = () => ({
      ...questions(),
      questions: (questions().questions as { id: string }[]).map((q) =>
        q.id === Q2 ? { ...q, notSureAllowed: true } : q,
      ),
    })
    const { fetchImpl } = api([write, reads(offered)])
    render(<App path={`/portal/p/${REF}`} fetchImpl={fetchImpl} />)
    const section = await screen.findByRole('region', { name: 'Questions from HandyHub' }, LOADED)
    fireEvent.click(within(section).getAllByRole('button', { name: 'Reply' })[1] as HTMLElement)
    const form = within(section).getByRole('form', { name: "Reply to HandyHub's question" })
    fireEvent.click(within(form).getByLabelText("I'm not sure"))
    fireEvent.click(within(form).getByRole('button', { name: 'Send reply' }))
    await waitFor(() => expect(replies).toEqual([JSON.stringify({ notSure: true })]))
  })

  it('[HH-LEAD-06][OWN-DEC-197] the period ending while the reply is written: the reply is kept and a new request is the way (TSK-0148, E5)', async () => {
    const write: Handler = (url, init) => {
      if (!url.endsWith(`/questions/${Q1}/replies`) || init?.method !== 'POST') return undefined
      return json(409, {
        error: { code: 'CONFLICT', fieldErrors: [{ field: 'state', code: 'REOPEN_PERIOD_ENDED', message: '' }] },
      })
    }
    const { fetchImpl } = api([
      write,
      reads(
        () => questions({ replyWindow: 'reopen', reopenUntil: NOW }),
        () => overview({ situation: 'closed_no_response', step: 'closed' }),
      ),
    ])
    render(<App path={`/portal/p/${REF}`} fetchImpl={fetchImpl} />)
    const section = await screen.findByRole('region', { name: 'Questions from HandyHub' }, LOADED)
    fireEvent.click(within(section).getAllByRole('button', { name: 'Reply' })[0] as HTMLElement)
    const form = within(section).getByRole('form', { name: "Reply to HandyHub's question" })
    fireEvent.change(within(form).getByLabelText('Your reply'), { target: { value: 'Synthetic: late answer.' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Send reply' }))
    const alert = await within(form).findByRole('alert')
    expect(alert.textContent).toContain('This request is closed. To continue, send a new request.')
    expect(within(alert).getByRole('link', { name: 'Send a new request' }).getAttribute('href')).toBe('/request')
    expect((within(form).getByLabelText('Your reply') as HTMLTextAreaElement).value).toBe('Synthetic: late answer.')
  })

  it('[HH-LEAD-03] an answer the view does not declare is a failure, never shown', () => {
    expect(parseQuestions(questions())).not.toBeNull()
    expect(
      parseQuestions({ ...questions(), questions: [{ ...questions().questions[0], notSureAllowed: 'yes' }] }),
    ).toBeNull()
    expect(parseQuestions({ ...questions(), replyWindow: 'maybe' })).toBeNull()
    expect(parseQuestions({ ...questions(), questions: [{ id: Q1, text: 'x' }] })).toBeNull()
  })
})

describe('writing to HandyHub in Messages (TSK-0051, HH-PORT-09)', () => {
  it('[HH-PORT-09][HH-COM-02] the message is sent as written with one key; a failure keeps it', async () => {
    let fail = true
    const sent: RequestInit[] = []
    const write: Handler = (url, init) => {
      if (!url.endsWith('/messages') || init?.method !== 'POST') return undefined
      sent.push(init)
      return fail
        ? json(503, { error: { code: 'UNAVAILABLE', fieldErrors: [] } })
        : json(201, { from: 'you', channel: 'portal', at: NOW })
    }
    const { fetchImpl } = api([write, reads()])
    render(<App path={`/portal/p/${REF}/messages`} fetchImpl={fetchImpl} />)
    const form = await screen.findByRole('form', { name: 'Write to HandyHub' }, LOADED)
    const text = 'Synthetic message:\n the side door sticks.'
    fireEvent.change(within(form).getByLabelText('Write to HandyHub'), { target: { value: text } })
    fireEvent.click(within(form).getByRole('button', { name: 'Send' }))
    expect(
      await within(form).findByText("Your message wasn't sent. It's still here, so you can try again."),
    ).toBeTruthy()
    expect((within(form).getByLabelText('Write to HandyHub') as HTMLTextAreaElement).value).toBe(text)
    fail = false
    fireEvent.click(within(form).getByRole('button', { name: 'Send' }))
    expect(await within(form).findByText('Message sent to HandyHub.')).toBeTruthy()
    await waitFor(() => expect(sent).toHaveLength(2))
    expect(JSON.parse(String(sent[1]?.body))).toEqual({ text })
    expect((sent[1]?.headers as Record<string, string>)['idempotency-key']).toBe(
      (sent[0]?.headers as Record<string, string>)['idempotency-key'],
    )
  })
})
