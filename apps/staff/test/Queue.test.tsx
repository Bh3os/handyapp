// The staff home: action queue and Owner Decisions (TSK-0041; HH-OPS-01, HH-OPS-02, HH-STAFF-06, HH-ARC-10). The API
// is a synthetic stand-in; every reference, name and id is invented for the test (RULE-SYNTHETIC-DATA).
import { staffTranslator } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App, routeOf } from '../src/App'
import { duration, mergeRefresh, QueueHome, type QueueItem, type QueuePage } from '../src/Queue'
import { businessDuration } from '../src/ResponseClock'
import { requestDetail } from './request-fixture'

afterEach(cleanup)

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const NOW = new Date('2026-10-20T15:00:00.000Z')
/** The refresh time as the screen writes it, in whatever zone the test machine runs. */
const AT = new Intl.DateTimeFormat('en-US', { timeStyle: 'short' }).format(NOW)
const REQUEST_ID = '11111111-1111-4111-8111-111111111111'

function item(over: Partial<QueueItem> = {}): QueueItem {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    type: 'new_request',
    subjectType: 'request',
    subjectId: REQUEST_ID,
    band: 'time_sensitive',
    reference: 'HH-7K2M9Q4D',
    status: 'received',
    assignee: null,
    openedAt: '2026-10-20T14:20:00.000Z',
    dueAt: null,
    clock: 'response_target',
    reason: 'new_request',
    masked: false,
    action: 'review_request',
    link: `/requests/${REQUEST_ID}`,
    version: 1,
    ...over,
  }
}

function page(items: QueueItem[], over: Partial<QueuePage> = {}): QueuePage {
  return {
    items,
    nextCursor: null,
    section: 'queue',
    sections: ['queue'],
    types: ['new_request', 'safety_hold', 'case_open'],
    refreshSeconds: 30,
    refreshedAt: NOW.toISOString(),
    ...over,
  }
}

const { t } = staffTranslator('en')
const props = (fetchImpl: typeof fetch, go = vi.fn()) => ({
  t,
  locale: 'en' as const,
  fetchImpl,
  go,
  href: (to: string) => `/staff${to}`,
  staffUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  now: () => NOW,
})

describe('the first-response clock on queue items (TSK-0043, HH-LEAD-05, OWN-DEC-115)', () => {
  it('[HH-LEAD-05] shows business minutes left or overdue, paused outside the daily hours, as an internal target', async () => {
    const clock = {
      state: 'paused' as const,
      startedAt: '2026-10-20T01:40:00.000Z',
      targetMinutes: 60,
      dueAt: '2026-10-20T12:40:00.000Z',
      remainingMinutes: 40,
      overdueMinutes: null,
      resumesAt: '2026-10-20T12:00:00.000Z',
      timeZone: 'America/Kentucky/Louisville',
      stoppedAt: null,
      stopKind: null,
      businessMinutes: null,
      withinTarget: null,
    }
    const overdue = { ...clock, state: 'overdue' as const, remainingMinutes: null, overdueMinutes: 75, resumesAt: null }
    const fetchImpl = vi.fn(async () =>
      json(
        200,
        page([
          item({ dueAt: clock.dueAt, responseClock: clock }),
          item({
            id: '00000000-0000-4000-8000-000000000002',
            reference: 'HH-8K2M9Q4D',
            dueAt: clock.dueAt,
            responseClock: overdue,
            reason: 'awaiting_first_response',
            status: 'needs_information',
          }),
        ]),
      ),
    )
    render(<QueueHome {...props(fetchImpl as unknown as typeof fetch)} />)
    expect(
      await screen.findByText(
        /40 minutes left; paused outside daily hours until Tue,? 8:00\sAM · Internal response target, not a customer promise/,
      ),
    ).toBeTruthy()
    const late = screen.getByText(/Overdue by 1 hour in daily hours/)
    expect(late.className).toBe('staff-queue__overdue')
    expect(screen.getByText('Waiting for a first meaningful response')).toBeTruthy()
  })
})

describe('the action queue screen (TSK-0041, HH-OPS-01, HH-OPS-02)', () => {
  it('[HH-OPS-02][HH-OPS-01] each item shows reference, status, assignee, due time, reason and one action that deep-links the record', async () => {
    const items = [
      item({
        id: '00000000-0000-4000-8000-000000000002',
        type: 'safety_hold',
        subjectType: 'hold',
        subjectId: '22222222-2222-4222-8222-222222222222',
        band: 'safety',
        reference: 'HH-AB12CD34',
        status: null,
        clock: null,
        reason: 'safety_hold',
        action: 'review_hold',
        link: '/schedule/22222222-2222-4222-8222-222222222222',
        assignee: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Synthetic Office' },
      }),
      item({ dueAt: '2026-10-20T14:50:00.000Z' }),
    ]
    const fetchImpl = vi.fn(async () => json(200, page(items)))
    const go = vi.fn()
    render(<QueueHome {...props(fetchImpl as unknown as typeof fetch, go)} />)
    const rows = await screen.findAllByRole('listitem', { name: /Safety hold|New request/ })
    expect(rows).toHaveLength(2)
    const [hold, request] = rows as [HTMLElement, HTMLElement]
    expect(within(hold).getByText('Safety')).toBeTruthy()
    expect(within(hold).getByText('Work is on a safety hold')).toBeTruthy()
    expect(within(hold).getByText('Assigned to Synthetic Office')).toBeTruthy()

    expect(within(request).getByText('New request waiting for a first response')).toBeTruthy()
    expect(within(request).getByText('Status: Received')).toBeTruthy()
    expect(within(request).getByText('Unassigned')).toBeTruthy()
    expect(
      within(request).getByText('Overdue by 10 minutes · Internal response target, not a customer promise'),
    ).toBeTruthy()
    expect(within(request).getByText('Opened 40 minutes ago')).toBeTruthy()
    // One action, and the reference is the deep link to the record.
    const action = within(request).getByRole('link', { name: 'Review request' })
    expect(action.getAttribute('href')).toBe(`/staff/requests/${REQUEST_ID}`)
    expect(within(request).getByRole('link', { name: 'HH-7K2M9Q4D' }).getAttribute('href')).toBe(
      `/staff/requests/${REQUEST_ID}`,
    )
    fireEvent.click(action)
    expect(go).toHaveBeenCalledWith(`/requests/${REQUEST_ID}`)
    expect(fetchImpl).toHaveBeenCalledWith('/api/v1/staff/queue', expect.anything())
    expect(screen.getByText(`Last refreshed ${AT}`, { exact: false })).toBeTruthy()
  })

  it('[HH-OPS-02][T26] a masked item shows only the generic reason and says its details are restricted', async () => {
    const fetchImpl = vi.fn(async () =>
      json(
        200,
        page([
          item({
            type: 'case_open',
            subjectType: 'case',
            reason: 'case_opened',
            masked: true,
            action: 'open_case',
            clock: null,
            status: null,
          }),
        ]),
      ),
    )
    render(<QueueHome {...props(fetchImpl as unknown as typeof fetch)} />)
    await screen.findByText('A case is open')
    expect(screen.getByText('Details are restricted to permitted roles.')).toBeTruthy()
    expect(screen.queryByText(/Injury|Damage|Dispute/)).toBeNull()
  })

  it('[HH-STAFF-06] the Owner also gets Owner Decisions; a role without them never asks for them', async () => {
    const owner = vi.fn(async (url: string) =>
      url.startsWith('/api/v1/staff/queue/owner-decisions')
        ? json(
            200,
            page(
              [
                item({
                  id: '00000000-0000-4000-8000-000000000009',
                  type: 'deposit_waiver',
                  subjectType: 'project',
                  reason: 'deposit_waiver_requested',
                  action: 'decide',
                  clock: null,
                  status: null,
                  link: '/payments/33333333-3333-4333-8333-333333333333',
                }),
              ],
              { section: 'owner_decisions', sections: ['queue', 'owner_decisions'], types: ['deposit_waiver'] },
            ),
          )
        : json(200, page([], { sections: ['queue', 'owner_decisions'] })),
    )
    render(<QueueHome {...props(owner as unknown as typeof fetch)} />)
    const section = (await screen.findByRole('heading', { level: 2, name: 'Owner Decisions' })).closest('section')
    if (!section) throw new Error('expected the Owner Decisions section')
    await within(section).findByText('Deposit waiver requested')
    expect(within(section).getByRole('link', { name: 'Decide' })).toBeTruthy()
    expect(screen.getByText('Nothing needs action right now.')).toBeTruthy()
    cleanup()

    const office = vi.fn(async (_url: string) => json(200, page([])))
    render(<QueueHome {...props(office as unknown as typeof fetch)} />)
    await screen.findByText('Nothing needs action right now.')
    expect(screen.queryByRole('heading', { name: 'Owner Decisions' })).toBeNull()
    expect(office.mock.calls.map(([u]) => u)).not.toContain('/api/v1/staff/queue/owner-decisions')
  })

  it('[HH-OPS-01] filters by item type, assignee and reference go to the server', async () => {
    const fetchImpl = vi.fn(async () => json(200, page([item()])))
    render(<QueueHome {...props(fetchImpl as unknown as typeof fetch)} />)
    await screen.findByText('New request waiting for a first response')
    const type = screen.getByLabelText('Item type') as HTMLSelectElement
    expect(Array.from(type.options).map((o) => o.textContent)).toEqual([
      'All types',
      'New request',
      'Safety hold',
      'Case',
    ])
    fireEvent.change(type, { target: { value: 'safety_hold' } })
    await waitFor(() =>
      expect(fetchImpl).toHaveBeenLastCalledWith('/api/v1/staff/queue?type=safety_hold', expect.anything()),
    )
    fireEvent.change(screen.getByLabelText('Assigned to'), { target: { value: 'me' } })
    await waitFor(() =>
      expect(fetchImpl).toHaveBeenLastCalledWith('/api/v1/staff/queue?type=safety_hold&assignee=me', expect.anything()),
    )
    fireEvent.change(screen.getByLabelText('Reference'), { target: { value: 'hh-7k2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }))
    await waitFor(() =>
      expect(fetchImpl).toHaveBeenLastCalledWith(
        '/api/v1/staff/queue?type=safety_hold&assignee=me&reference=HH-7K2',
        expect.anything(),
      ),
    )
  })

  it('[HH-ARC-10][HH-OPS-01] a refresh updates items in place, keeps typed text and focus, and holds new items behind a button', async () => {
    const first = item({ id: '00000000-0000-4000-8000-000000000003' })
    const gone = item({ id: '00000000-0000-4000-8000-000000000004', reference: 'HH-ZZ99ZZ99' })
    const newcomer = item({ id: '00000000-0000-4000-8000-000000000005', reference: 'HH-NEW00001' })
    let calls = 0
    const fetchImpl = vi.fn(async () => {
      calls++
      if (calls === 1) return json(200, page([first, gone], { refreshSeconds: 1 }))
      return json(
        200,
        page(
          [
            { ...first, assignee: { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: 'Synthetic Estimator' } },
            newcomer,
          ],
          {
            refreshSeconds: 1,
          },
        ),
      )
    })
    render(<QueueHome {...props(fetchImpl as unknown as typeof fetch)} />)
    const row = (await screen.findByRole('link', { name: 'HH-7K2M9Q4D' })).closest('li')
    const box = screen.getByLabelText('Reference') as HTMLInputElement
    box.focus()
    fireEvent.change(box, { target: { value: 'HH-UNSENT' } })

    const refresh = await screen.findByRole('button', { name: '1 new item — refresh' }, { timeout: 3000 })
    // The same row, updated in place; the resolved item is gone; the newcomer waits behind the button.
    expect(screen.getByRole('link', { name: 'HH-7K2M9Q4D' }).closest('li')).toBe(row)
    expect(screen.getByText('Assigned to Synthetic Estimator')).toBeTruthy()
    expect(screen.queryByText('HH-ZZ99ZZ99')).toBeNull()
    expect(screen.queryByText('HH-NEW00001')).toBeNull()
    expect(document.activeElement).toBe(box)
    expect(box.value).toBe('HH-UNSENT')

    fireEvent.click(refresh)
    await screen.findByRole('link', { name: 'HH-NEW00001' })
  })

  it('[HH-ARC-10] a failed refresh keeps the list and says it is stale', async () => {
    let calls = 0
    const fetchImpl = vi.fn(async () =>
      ++calls === 1
        ? json(200, page([item()], { refreshSeconds: 1 }))
        : json(503, { error: { code: 'UNAVAILABLE', fieldErrors: [] } }),
    )
    render(<QueueHome {...props(fetchImpl as unknown as typeof fetch)} />)
    await screen.findByText('New request waiting for a first response')
    await screen.findByText(`Refreshing failed. This list is from ${AT}.`, { exact: false }, { timeout: 3000 })
    expect(screen.getByText('New request waiting for a first response')).toBeTruthy()
  })

  it('[HH-OPS-01] deny by default: an item of a type the app has no label for is not shown', async () => {
    const fetchImpl = vi.fn(async () => json(200, page([item({ type: 'export_everything' }), item({ id: 'x' })])))
    render(<QueueHome {...props(fetchImpl as unknown as typeof fetch)} />)
    expect(await screen.findAllByRole('link', { name: 'Review request' })).toHaveLength(1)
  })

  it('[HH-LANG-02] the queue is in Spanish for a Spanish-speaking staff member', async () => {
    const fetchImpl = vi.fn(async () => json(200, page([item({ dueAt: '2026-10-20T15:30:00.000Z' })])))
    render(<QueueHome {...props(fetchImpl as unknown as typeof fetch)} t={staffTranslator('es').t} locale="es" />)
    await screen.findByText('Nueva solicitud en espera de una primera respuesta')
    expect(screen.getByRole('heading', { level: 1, name: 'Acciones pendientes' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Revisar solicitud' })).toBeTruthy()
    expect(screen.getByText('Vence en 30 minutos', { exact: false })).toBeTruthy()
  })

  it('merges a refresh: complete pages drop resolved items, partial pages keep them', () => {
    const a = item({ id: 'a' })
    const b = item({ id: 'b' })
    const c = item({ id: 'c' })
    expect(mergeRefresh([a, b], page([a, c]))).toEqual({ items: [a], fresh: [c] })
    expect(mergeRefresh([a, b], page([a, c], { nextCursor: 'more' }))).toEqual({ items: [a, b], fresh: [c] })
    expect(duration(t, 59 * 60_000)).toBe('59 minutes')
    expect(duration(t, 90 * 60_000)).toBe('1 hour')
    expect(duration(t, 72 * 3600_000)).toBe('3 days')
  })

  it('[HH-LEAD-05] words business time in hours, never in 24-hour days', () => {
    expect(businessDuration(t, 45)).toBe('45 minutes')
    expect(businessDuration(t, 90)).toBe('1 hour')
    // 50 business hours are more than three days of 08:00-22:00, so "2 days" would understate the wait.
    expect(businessDuration(t, 3000)).toBe('50 hours')
  })
})

describe('deep links open the record (TSK-0041, HH-OPS-02)', () => {
  const session = {
    staffUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    displayName: 'Synthetic owner',
    email: 'owner@example.test',
    locale: 'en',
    roles: ['owner'],
    mfaEnrolled: false,
    mfaRecommended: false,
    csrfToken: 'synthetic-csrf-token',
    navigation: { home: 'queue', items: ['queue', 'requests', 'schedule'], search: [] },
  }

  it('[HH-OPS-02] routes /<screen>/<id> to the record and shows the request', async () => {
    expect(routeOf(`/staff/requests/${REQUEST_ID}`, '/staff/')).toEqual({
      page: 'record',
      screen: 'requests',
      id: REQUEST_ID,
    })
    const fetchImpl = vi.fn(async (url: string) =>
      url.endsWith(`/staff/requests/${REQUEST_ID}`)
        ? json(200, requestDetail())
        : url.endsWith('/photos')
          ? json(200, { photos: [] })
          : json(200, session),
    )
    render(
      <App
        path={`/staff/requests/${REQUEST_ID}`}
        base="/staff/"
        fetchImpl={fetchImpl as unknown as typeof fetch}
        navigate={vi.fn()}
      />,
    )
    await screen.findByRole('heading', { level: 1, name: 'Request HH-7K2M9Q4D' })
    expect(screen.getByText('Received')).toBeTruthy()
    expect(screen.getByText(/Patching & Repair/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Requests' }).getAttribute('aria-current')).toBe('page')
    expect(fetchImpl).toHaveBeenCalledWith(`/api/v1/staff/requests/${REQUEST_ID}`, expect.anything())
  })

  it('[HH-OPS-02][T68] a record the server refuses or does not have says so, without detail', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.includes(`/staff/requests/${REQUEST_ID}`)
        ? json(404, { error: { code: 'NOT_FOUND', fieldErrors: [] } })
        : json(200, session),
    )
    render(
      <App
        path={`/staff/requests/${REQUEST_ID}`}
        base="/staff/"
        fetchImpl={fetchImpl as unknown as typeof fetch}
        navigate={vi.fn()}
      />,
    )
    await screen.findByText('This record was not found, or it is not part of your role.')
  })

  it('[HH-STAFF-04] a record below a screen outside the role is refused before anything is fetched', async () => {
    const fetchImpl = vi.fn(async (_url: string) =>
      json(200, { ...session, navigation: { home: 'my-day', items: ['my-day'], search: [] } }),
    )
    render(
      <App
        path={`/staff/requests/${REQUEST_ID}`}
        base="/staff/"
        fetchImpl={fetchImpl as unknown as typeof fetch}
        navigate={vi.fn()}
      />,
    )
    await screen.findByText('This screen is not part of your role.')
    expect(fetchImpl.mock.calls.map(([u]) => u)).toEqual(['/api/v1/staff/auth/session'])
  })
})

describe('Retry on a delivery issue (TSK-0032, HH-INT-20, HH-COM-02, T12)', () => {
  const DELIVERY_ID = '33333333-3333-4333-8333-333333333333'
  const failure = item({
    id: '00000000-0000-4000-8000-000000000032',
    type: 'delivery_failed',
    subjectType: 'message_delivery',
    subjectId: DELIVERY_ID,
    status: 'failed',
    clock: null,
    reason: 'delivery_not_configured',
    action: 'retry_delivery',
    link: `/inbox/${DELIVERY_ID}`,
  })

  it('[T12][HH-INT-20] the one action retries the message on the server and reloads the list', async () => {
    const calls: { url: string; method: string; headers: Record<string, string> }[] = []
    let retried = false
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? 'GET', headers: (init?.headers ?? {}) as Record<string, string> })
      if (url.endsWith('/retry')) {
        retried = true
        return json(200, { id: DELIVERY_ID, state: 'queued' })
      }
      return json(200, page(retried ? [] : [failure], { types: ['delivery_failed'] }))
    })
    render(<QueueHome {...props(fetchImpl as unknown as typeof fetch)} />)
    const row = await screen.findByRole('listitem', { name: /Delivery failure/ })
    expect(within(row).getByText('A message was not sent: its wording or channel is not configured')).toBeTruthy()
    // Retry is a button that acts here, not a link to a screen.
    expect(within(row).queryByRole('link', { name: 'Retry delivery' })).toBeNull()
    fireEvent.click(within(row).getByRole('button', { name: 'Retry delivery' }))
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/retry'))).toBe(true))
    const post = calls.find((c) => c.url.endsWith('/retry'))
    expect(post?.url).toBe(`/api/v1/staff/message-deliveries/${DELIVERY_ID}/retry`)
    expect(post?.method).toBe('POST')
    expect(post?.headers['idempotency-key']).toMatch(/^staff-[0-9a-f]{32}$/)
    // The list reloads; the item disappears once the server resolves it.
    await waitFor(() => expect(screen.queryByRole('listitem', { name: /Delivery failure/ })).toBeNull())
  })

  it('[T12] a refused retry says the message is not waiting for one', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.endsWith('/retry')
        ? json(409, { error: { code: 'CONFLICT', message: 'Conflict', retryable: false, fieldErrors: [] } })
        : json(200, page([failure], { types: ['delivery_failed'] })),
    )
    render(<QueueHome {...props(fetchImpl as unknown as typeof fetch)} />)
    const row = await screen.findByRole('listitem', { name: /Delivery failure/ })
    fireEvent.click(within(row).getByRole('button', { name: 'Retry delivery' }))
    expect(await within(row).findByText('This message is not waiting for a retry.')).toBeTruthy()
  })
})
