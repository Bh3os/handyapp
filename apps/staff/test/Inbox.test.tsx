// The unified inbox in the staff app (TSK-0049; HH-COM-07, HH-COM-10, HH-COM-01, T71, RULE-LANGUAGES). The API is a
// synthetic stand-in (RULE-SYNTHETIC-DATA).
import { staffTranslator } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InboxRecord, InboxScreen, type Conversation, type InboxStatus, type MessageDetail } from '../src/Inbox'

afterEach(cleanup)

const CONV = '55555555-5555-4555-8555-555555555555'
const MSG = '66666666-6666-4666-8666-666666666666'
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const STATUS: InboxStatus = {
  sms: { provider: 'bird', inbound: 'not_configured' },
  email: { provider: 'resend', inbound: 'configured', bodyReading: 'configured', replyTokens: 'not_configured' },
  unsupported: { count: 2, latestAt: '2026-10-20T15:00:00.000Z' },
  needsLinking: 1,
}
const CONVERSATION: Conversation = {
  id: CONV,
  project: { id: 'p-1', reference: 'HH-7K2M9Q4D', state: 'open' },
  customer: { id: 'cu-1', displayName: 'Synthetic Customer' },
  state: 'open',
  awaitingReply: true,
  handledAt: null,
  messages: [
    {
      id: 'm-1',
      direction: 'inbound',
      channel: 'email',
      from: 'synthetic@example.test',
      to: ['replies@inbound.example.test'],
      subject: 'Synthetic subject',
      body: 'Synthetic body\nsecond line',
      bodyState: 'received',
      bodyTruncated: false,
      attachments: [{ contentType: 'image/jpeg', size: 1000 }],
      keyword: null,
      receivedAt: '2026-10-20T15:00:00.000Z',
      linkState: 'matched',
      matchRule: 'reply_token',
      author: { kind: 'contact', id: 'c-1', name: 'Synthetic Customer' },
    },
  ],
  deliveries: [
    { id: 'd-1', messageKey: 'request.receipt', channel: 'email', state: 'delivered', at: '2026-10-20T14:00:00.000Z' },
  ],
  internal: { id: null, messages: [] },
}
const MESSAGE: MessageDetail = {
  id: MSG,
  version: 1,
  direction: 'inbound',
  channel: 'sms',
  from: '+15025550199',
  to: ['+15025550100'],
  subject: null,
  body: 'Synthetic: which visit?',
  bodyState: 'received',
  bodyTruncated: false,
  attachments: [],
  keyword: null,
  receivedAt: '2026-10-20T15:00:00.000Z',
  linkState: 'needs_linking',
  reason: 'shared_contact',
  matchRule: null,
  project: null,
  customer: null,
  conversationId: null,
  candidates: [
    {
      projectId: 'p-1',
      reference: 'HH-7K2M9Q4D',
      state: 'open',
      customerId: 'cu-1',
      customerName: 'Synthetic Landlord',
      verifiedContact: true,
      suggested: false,
    },
  ],
  history: [
    {
      fromState: null,
      toState: 'needs_linking',
      fromReference: null,
      toReference: null,
      rule: 'shared_contact',
      reason: null,
      staff: null,
      at: '2026-10-20T15:00:00.000Z',
    },
  ],
}

type Handler = (url: string, init?: RequestInit) => Response | undefined
function api(routes: Record<string, () => Response>, write?: Handler) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method && init.method !== 'GET') return write?.(url, init) ?? json(500, {})
    const path = url.split('?')[0] as string
    return routes[path]?.() ?? json(404, { error: { code: 'NOT_FOUND', fieldErrors: [] } })
  })
}
const t = staffTranslator('en').t

describe('the inbox screen (TSK-0049, HH-COM-10, HH-COM-07)', () => {
  it('[HH-COM-10][T71] shows "Inbound not configured" per channel and flags unsupported channels', async () => {
    const fetchImpl = api({
      '/api/v1/staff/inbox/status': () => json(200, STATUS),
      '/api/v1/staff/inbox/needs-linking': () =>
        json(200, {
          items: [
            {
              id: MSG,
              channel: 'sms',
              from: '+15025550199',
              subject: null,
              preview: 'Synthetic: which visit?',
              receivedAt: '2026-10-20T15:00:00.000Z',
              reason: 'shared_contact',
              attachments: 0,
              suggestion: null,
            },
          ],
          nextCursor: null,
        }),
      '/api/v1/staff/inbox/conversations': () => json(200, { items: [], nextCursor: null }),
    })
    render(
      <InboxScreen
        t={t}
        locale="en"
        fetchImpl={fetchImpl as unknown as typeof fetch}
        go={vi.fn()}
        href={(to) => `/staff${to}`}
      />,
    )
    expect(await screen.findByRole('listitem', { name: 'Texts (Bird): Inbound not configured' })).toBeTruthy()
    expect(screen.getByRole('listitem', { name: 'Email (Resend): Receiving' })).toBeTruthy()
    expect(screen.getByText(/BIRD_WEBHOOK_SECRET/)).toBeTruthy()
    expect(screen.getByRole('listitem', { name: 'Project reply addresses: Inbound not configured' })).toBeTruthy()
    expect(screen.getByText('2 messages arrived on unsupported channels')).toBeTruthy()
    const needs = await screen.findByRole('region', { name: 'Needs Linking (1)' })
    const item = await within(needs).findByRole('listitem', { name: 'Text from +15025550199' })
    expect(within(item).getByText('Several customers share this contact')).toBeTruthy()
    expect(within(item).getByRole('link', { name: 'Review and link' }).getAttribute('href')).toBe(`/staff/inbox/${MSG}`)
    expect(screen.getByText('No customer conversations yet.')).toBeTruthy()
  })

  it('[HH-COM-07] roles without the private list never ask for it', async () => {
    const fetchImpl = api({
      '/api/v1/staff/inbox/status': () => json(200, { ...STATUS, needsLinking: null }),
      '/api/v1/staff/inbox/conversations': () => json(200, { items: [], nextCursor: null }),
    })
    render(
      <InboxScreen t={t} locale="en" fetchImpl={fetchImpl as unknown as typeof fetch} go={vi.fn()} href={(to) => to} />,
    )
    await screen.findByRole('region', { name: 'Customer conversations' })
    expect(screen.queryByRole('region', { name: /Needs Linking/ })).toBeNull()
    expect(fetchImpl.mock.calls.map((c) => String(c[0]))).not.toContain('/api/v1/staff/inbox/needs-linking?limit=50')
  })
})

describe('a conversation and a Needs Linking message (TSK-0049, HH-COM-01, HH-COM-07)', () => {
  it('[HH-COM-01] customer messages as received, delivery states, and the separate internal conversation', async () => {
    const write = vi.fn(() => json(201, { id: 'i-1', conversationId: 'ic-1' }))
    const fetchImpl = api({ [`/api/v1/staff/inbox/conversations/${CONV}`]: () => json(200, CONVERSATION) }, write)
    render(
      <InboxRecord
        t={t}
        locale="en"
        fetchImpl={fetchImpl as unknown as typeof fetch}
        id={CONV}
        go={vi.fn()}
        href={(to) => `/staff${to}`}
      />,
    )
    await screen.findByRole('heading', { level: 1, name: 'Conversation HH-7K2M9Q4D' })
    const customer = screen.getByRole('region', { name: 'Customer messages' })
    const message = within(customer).getByRole('listitem', { name: 'Synthetic Customer' })
    expect(
      within(message).getByText('Synthetic body second line', { normalizer: (s) => s.replace(/\s+/g, ' ') }),
    ).toBeTruthy()
    expect(within(message).getByText("Matched by the project's reply address")).toBeTruthy()
    expect(within(message).getByText(/1 attachment was not imported/)).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Notifications sent' })).getByText('Delivered')).toBeTruthy()
    const internal = screen.getByRole('region', { name: 'Internal conversation' })
    expect(within(internal).getByText(/never reach the customer/)).toBeTruthy()
    fireEvent.change(within(internal).getByLabelText('New internal message'), {
      target: { value: 'Synthetic internal note' },
    })
    fireEvent.click(within(internal).getByRole('button', { name: 'Add internal message' }))
    await waitFor(() => expect(write).toHaveBeenCalled())
    const [url, init] = write.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/v1/staff/inbox/projects/p-1/internal-messages')
    expect(JSON.parse(String(init.body))).toEqual({ body: 'Synthetic internal note' })
  })

  it('[HH-COM-07][T21] a Needs Linking message is linked with a reason and its version; candidates are suggestions', async () => {
    const write = vi.fn(() =>
      json(200, {
        id: MSG,
        version: 2,
        linkState: 'linked',
        project: { id: 'p-1', reference: 'HH-7K2M9Q4D' },
        conversationId: CONV,
      }),
    )
    const fetchImpl = api({ [`/api/v1/staff/inbox/messages/${MSG}`]: () => json(200, MESSAGE) }, write)
    render(
      <InboxRecord
        t={t}
        locale="en"
        fetchImpl={fetchImpl as unknown as typeof fetch}
        id={MSG}
        go={vi.fn()}
        href={(to) => to}
      />,
    )
    await screen.findByRole('heading', { level: 1, name: 'Text from +15025550199' })
    expect(screen.getByText(/A shared email or phone or a name is never proof/)).toBeTruthy()
    const link = screen.getByRole('button', { name: 'Link message' }) as HTMLButtonElement
    expect(link.disabled).toBe(true)
    expect(screen.getByText('Enter a project reference and a reason.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Use HH-7K2M9Q4D' }))
    fireEvent.change(screen.getByLabelText('Reason (required)'), { target: { value: 'Confirmed by phone' } })
    fireEvent.click(screen.getByRole('button', { name: 'Link message' }))
    await waitFor(() => expect(write).toHaveBeenCalled())
    const [url, init] = write.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`/api/v1/staff/inbox/messages/${MSG}/link`)
    expect((init.headers as Record<string, string>)['if-match']).toBe('"1"')
    expect(JSON.parse(String(init.body))).toEqual({ projectReference: 'HH-7K2M9Q4D', reason: 'Confirmed by phone' })
  })

  it('[RULE-LANGUAGES] Spanish staff text', async () => {
    const es = staffTranslator('es').t
    const fetchImpl = api({ [`/api/v1/staff/inbox/messages/${MSG}`]: () => json(200, MESSAGE) })
    render(
      <InboxRecord
        t={es}
        locale="es"
        fetchImpl={fetchImpl as unknown as typeof fetch}
        id={MSG}
        go={vi.fn()}
        href={(to) => to}
      />,
    )
    await screen.findByRole('heading', { level: 1, name: 'Texto de +15025550199' })
    expect(screen.getAllByText('Varios clientes comparten este contacto').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Vincular mensaje' })).toBeTruthy()
  })

  it('[HH-COM-07] an unknown or out-of-scope ID shows not found', async () => {
    const fetchImpl = api({})
    render(
      <InboxRecord
        t={t}
        locale="en"
        fetchImpl={fetchImpl as unknown as typeof fetch}
        id={MSG}
        go={vi.fn()}
        href={(to) => to}
      />,
    )
    expect(await screen.findByText(/No conversation or inbound message has this ID/)).toBeTruthy()
  })
})
