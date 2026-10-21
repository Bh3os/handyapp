// The reply composer of the project conversation (TSK-0050; HH-COM-08, HH-COM-09, HH-COM-02, T66, OWN-DEC-120,
// RULE-LANGUAGES). The API is a synthetic stand-in (RULE-SYNTHETIC-DATA).
import { staffTranslator } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InboxRecord, type Conversation, type ReplyOptions } from '../src/Inbox'

afterEach(() => {
  cleanup()
  window.sessionStorage.clear()
})

const CONV = '55555555-5555-4555-8555-555555555555'
const PROJECT = '77777777-7777-4777-8777-777777777777'
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const OPTIONS: ReplyOptions = {
  contact: { id: 'c-1', name: 'Synthetic Customer' },
  preferred: 'email',
  options: [
    { channel: 'email', destination: 'synthetic@example.test', preferred: true, available: true, reason: 'available' },
    { channel: 'sms', destination: '+15025550100', preferred: false, available: false, reason: 'no_opt_in' },
  ],
  defaultChannel: 'email',
  contactHours: {
    state: 'closed',
    applies: true,
    open: '08:00',
    close: '22:00',
    zone: 'America/Kentucky/Louisville',
    sendAt: '2026-10-21T12:00:00.000Z',
  },
  templates: { email: 'not_configured', sms: 'not_configured' },
  maxLength: 2000,
}
const CONVERSATION: Conversation = {
  id: CONV,
  project: { id: PROJECT, reference: 'HH-7K2M9Q4D', state: 'open' },
  customer: { id: 'cu-1', displayName: 'Synthetic Customer' },
  state: 'open',
  awaitingReply: false,
  handledAt: null,
  messages: [
    {
      id: 'm-1',
      direction: 'outbound',
      channel: 'email',
      from: null,
      to: ['synthetic@example.test'],
      subject: null,
      body: 'Synthetic earlier reply.',
      bodyState: 'received',
      bodyTruncated: false,
      attachments: [],
      keyword: null,
      receivedAt: '2026-10-20T15:00:00.000Z',
      linkState: 'matched',
      matchRule: 'staff',
      author: { kind: 'staff', id: 's-1', name: 'Synthetic Office' },
      delivery: { id: 'd-1', state: 'failed', errorCode: 'template_not_configured', sendAt: null, retry: true },
    },
    {
      id: 'm-2',
      direction: 'outbound',
      channel: 'email',
      from: null,
      to: ['synthetic@example.test'],
      subject: null,
      body: 'Synthetic late reply.',
      bodyState: 'received',
      bodyTruncated: false,
      attachments: [],
      keyword: null,
      receivedAt: '2026-10-21T03:00:00.000Z',
      linkState: 'matched',
      matchRule: 'staff',
      author: { kind: 'staff', id: 's-1', name: 'Synthetic Office' },
      delivery: { id: 'd-2', state: 'queued', errorCode: null, sendAt: '2026-10-21T12:00:00.000Z', retry: false },
    },
  ],
  deliveries: [],
  internal: { id: null, messages: [] },
}

type Write = (url: string, init: RequestInit) => Response
function api(routes: Record<string, () => Response>, write?: Write) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method && init.method !== 'GET') return write?.(url, init) ?? json(500, {})
    const path = url.split('?')[0] as string
    return routes[path]?.() ?? json(404, { error: { code: 'NOT_FOUND', fieldErrors: [] } })
  })
}
const routes = (options: ReplyOptions = OPTIONS) => ({
  [`/api/v1/staff/inbox/conversations/${CONV}`]: () => json(200, CONVERSATION),
  [`/api/v1/staff/inbox/projects/${PROJECT}/reply-options`]: () => json(200, options),
})
const t = staffTranslator('en').t
const show = (fetchImpl: ReturnType<typeof api>, id = CONV, tr = t, locale: 'en' | 'es' = 'en') =>
  render(
    <InboxRecord
      t={tr}
      locale={locale}
      fetchImpl={fetchImpl as unknown as typeof fetch}
      id={id}
      go={vi.fn()}
      href={(to) => `/staff${to}`}
    />,
  )
const composer = () => screen.findByRole('region', { name: 'Reply to the customer' })

describe('the reply composer (TSK-0050, HH-COM-08, OWN-DEC-120)', () => {
  it('[HH-COM-08][HH-COM-09] the preferred permitted channel, the contact hours and missing wording are said before Send', async () => {
    show(api(routes()))
    const c = await composer()
    expect(within(c).getByText('To Synthetic Customer')).toBeTruthy()
    const email = within(c).getByRole('radio', { name: /Email to synthetic@example.test/ }) as HTMLInputElement
    const sms = within(c).getByRole('radio', { name: /Text to \+15025550100/ }) as HTMLInputElement
    expect(email.checked).toBe(true)
    expect(sms.disabled).toBe(true)
    expect(within(c).getByText(/no text opt-in/)).toBeTruthy()
    expect(within(c).getByTestId('reply-hours').textContent).toMatch(
      /^Outside contact hours \(08:00–22:00, America\/Kentucky\/Louisville\): the email or text waits until .+\. The reply shows on the customer's project page at once\.$/,
    )
    expect(within(c).getByText(/No approved wording for reply emails yet/)).toBeTruthy()
    const send = within(c).getByRole('button', { name: 'Send' }) as HTMLButtonElement
    expect(send.disabled).toBe(true)
    expect(within(c).getByText('Write the reply first.')).toBeTruthy()
  })

  it('[HH-COM-08][OWN-DEC-120] the preferred channel unavailable: staff choose a permitted one; nothing is picked for them', async () => {
    const fallback: ReplyOptions = {
      ...OPTIONS,
      preferred: 'text',
      options: [
        {
          channel: 'email',
          destination: 'synthetic@example.test',
          preferred: false,
          available: true,
          reason: 'available',
        },
        { channel: 'sms', destination: '+15025550100', preferred: true, available: false, reason: 'opted_out' },
      ],
      defaultChannel: null,
    }
    show(api(routes(fallback)))
    const c = await composer()
    expect(
      within(c).getByText(
        "The customer's preferred channel (Text) can't be used: the customer opted out. Choose another permitted channel.",
      ),
    ).toBeTruthy()
    const email = within(c).getByRole('radio', { name: /Email to/ }) as HTMLInputElement
    expect(email.checked).toBe(false)
    fireEvent.change(within(c).getByLabelText('Reply'), { target: { value: 'Synthetic reply.' } })
    expect(within(c).getByText('Choose how to send it.')).toBeTruthy()
    fireEvent.click(email)
    expect(email.checked).toBe(true)
    expect((within(c).getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('[T66][HH-COM-02] a failed Send keeps the draft and its key; the retry presents the same key and then clears the draft', async () => {
    let fail = true
    const write = vi.fn((url: string) => {
      if (url.endsWith('/replies'))
        return fail
          ? json(503, { error: { code: 'UNAVAILABLE', fieldErrors: [] } })
          : json(201, { id: 'm-3', conversationId: CONV, delivery: {} })
      return json(500, {})
    })
    show(api(routes(), write))
    const c = await composer()
    fireEvent.change(within(c).getByLabelText('Reply'), { target: { value: 'Synthetic: Tuesday works.' } })
    fireEvent.click(within(c).getByRole('button', { name: 'Send' }))
    expect(await within(c).findByText(/It is kept here; try again and it is sent only once/)).toBeTruthy()
    expect((within(c).getByLabelText('Reply') as HTMLTextAreaElement).value).toBe('Synthetic: Tuesday works.')
    // Kept across a reload of the screen too (a tab switch or the language switch).
    cleanup()
    show(api(routes(), write))
    const again = await composer()
    expect((within(again).getByLabelText('Reply') as HTMLTextAreaElement).value).toBe('Synthetic: Tuesday works.')
    fail = false
    fireEvent.click(within(again).getByRole('button', { name: 'Send' }))
    expect(await within(again).findByText("Reply sent. It is on the customer's project page.")).toBeTruthy()
    const sends = write.mock.calls.filter((call) => String(call[0]).endsWith('/replies')) as unknown as [
      string,
      RequestInit,
    ][]
    expect(sends).toHaveLength(2)
    const keys = sends.map(([, init]) => (init.headers as Record<string, string>)['idempotency-key'])
    expect(keys[0]).toBeTruthy()
    expect(keys[1]).toBe(keys[0])
    expect(JSON.parse(String(sends[0]?.[1].body))).toEqual({ body: 'Synthetic: Tuesday works.', channel: 'email' })
    expect(sends[0]?.[0]).toBe(`/api/v1/staff/inbox/projects/${PROJECT}/replies`)
    await waitFor(() => expect((within(again).getByLabelText('Reply') as HTMLTextAreaElement).value).toBe(''))
  })

  it('[HH-COM-02][HH-COM-09] each reply shows its delivery: when a held one sends, why a failed one did not, and Retry', async () => {
    const write = vi.fn(() => json(200, { id: 'd-1', state: 'queued' }))
    show(api(routes(), write))
    const thread = await screen.findByRole('region', { name: 'Customer messages' })
    const items = within(thread).getAllByRole('listitem', { name: 'Synthetic Office' })
    expect(within(items[0] as HTMLElement).getByText('Synthetic earlier reply.')).toBeTruthy()
    expect(within(items[0] as HTMLElement).getByText('Failed')).toBeTruthy()
    expect(
      within(items[0] as HTMLElement).getByText('Not sent: no approved wording for this message yet.'),
    ).toBeTruthy()
    expect(within(items[1] as HTMLElement).getByText('Queued')).toBeTruthy()
    expect(within(items[1] as HTMLElement).getByText(/^Sends at .+ \(contact hours\)\.$/)).toBeTruthy()
    expect(within(items[1] as HTMLElement).queryByRole('button', { name: 'Try again' })).toBeNull()
    fireEvent.click(within(items[0] as HTMLElement).getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(write).toHaveBeenCalled())
    expect((write.mock.calls[0] as unknown as [string])[0]).toBe('/api/v1/staff/message-deliveries/d-1/retry')
  })

  it('[HH-COM-08] a project with no message yet opens by its id with the composer that starts the conversation', async () => {
    show(
      api({
        [`/api/v1/staff/inbox/projects/${PROJECT}/conversation`]: () =>
          json(200, {
            conversationId: null,
            project: { id: PROJECT, reference: 'HH-7K2M9Q4D', state: 'open' },
            customer: { id: 'cu-1', displayName: 'Synthetic Customer' },
          }),
        [`/api/v1/staff/inbox/projects/${PROJECT}/reply-options`]: () => json(200, OPTIONS),
      }),
      PROJECT,
    )
    expect(await screen.findByRole('heading', { level: 1, name: 'Conversation HH-7K2M9Q4D' })).toBeTruthy()
    expect(screen.getByText('No messages on this project yet. Your reply starts the conversation.')).toBeTruthy()
    expect(await composer()).toBeTruthy()
  })

  it('[RULE-LANGUAGES][HH-COM-03] Spanish staff text; the reply hint says the customer is written to in English', async () => {
    const es = staffTranslator('es').t
    show(api(routes()), CONV, es, 'es')
    const c = await screen.findByRole('region', { name: 'Responder al cliente' })
    expect(within(c).getByRole('button', { name: 'Enviar' })).toBeTruthy()
    expect(within(c).getByText(/Escrita para el cliente, en inglés/)).toBeTruthy()
  })
})
