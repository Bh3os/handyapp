// The staff app shell (TSK-0040; HH-STAFF-06, HH-OPS-03, HH-OPS-04, HH-LANG-02, HH-BASE-01). Sessions are synthetic.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App, routeOf } from '../src/App'
import { ConflictBanner, conflictOf } from '../src/ConflictBanner'
import { staffTranslator } from '@handyhub/i18n'

afterEach(cleanup)

const json = (status: number, body: unknown) =>
  new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** A synthetic staff API: the session, an empty action queue (TSK-0041) and, for PUTs, `put`'s answer. */
const EMPTY_QUEUE = {
  items: [],
  nextCursor: null,
  section: 'queue',
  sections: ['queue'],
  types: ['new_request'],
  refreshSeconds: 30,
  refreshedAt: '2026-10-20T12:00:00.000Z',
}
const api = (body: unknown, put?: () => Response) =>
  vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'PUT' && put) return put()
    if (String(input).startsWith('/api/v1/staff/queue')) return json(200, EMPTY_QUEUE)
    // TSK-0070: a worker's home is My Day, which reads the day and the job packets.
    if (String(input).startsWith('/api/v1/staff/my/day'))
      return json(200, {
        checkedAt: '2026-11-05T12:00:00.000Z',
        onMyWay: { state: 'configured', earliestMinutesBefore: 180 },
        visits: [],
      })
    if (String(input).startsWith('/api/v1/staff/my/job-packets')) return json(200, { packets: [] })
    return json(200, body)
  })

const NAV = {
  owner: {
    home: 'queue',
    items: [
      'queue',
      'my-day',
      'requests',
      'customers',
      'estimates',
      'schedule',
      'inbox',
      'payments',
      'cases',
      'staff',
      'audit',
      'dashboard',
      'health',
      'settings',
    ],
    search: ['requests', 'customers'],
  },
  worker: { home: 'my-day', items: ['my-day'], search: [] },
}
const session = (role: 'owner' | 'worker', locale: 'en' | 'es' = 'en', navigation: unknown = NAV[role]) => ({
  staffUserId: `u-${role}`,
  displayName: `Synthetic ${role}`,
  email: `${role}@example.test`,
  locale,
  roles: [role],
  mfaEnrolled: false,
  mfaRecommended: false,
  csrfToken: 'synthetic-csrf-token',
  navigation,
})

const menu = () =>
  within(screen.getByRole('navigation', { name: /Main|Principal/ }))
    .getAllByRole('link')
    .map((a) => a.textContent)

describe('staff shell routes (TSK-0040)', () => {
  it('[HH-STAFF-06] routes screens, the account and search below the base', () => {
    expect(routeOf('/staff/', '/staff/')).toEqual({ page: 'home' })
    expect(routeOf('/staff/requests', '/staff/')).toEqual({ page: 'screen', id: 'requests' })
    expect(routeOf('/staff/account', '/staff/')).toEqual({ page: 'account' })
    expect(routeOf('/staff/search?q=Synthetic%20Way', '/staff/')).toEqual({ page: 'search', query: 'Synthetic Way' })
    expect(routeOf('/my-day', '/')).toEqual({ page: 'screen', id: 'my-day' })
  })
})

describe('navigation by role (TSK-0040, HH-STAFF-06)', () => {
  it('[HH-STAFF-06] the Owner sees the full menu, the queue as home and the search box', async () => {
    render(<App path="/staff/" base="/staff/" fetchImpl={api(session('owner'))} navigate={vi.fn()} />)
    await screen.findByRole('heading', { level: 1, name: 'Action queue' })
    expect(menu()).toEqual([
      'Action queue',
      'My Day',
      'Requests',
      'Customers',
      'Estimates',
      'Scheduling board',
      'Inbox',
      'Payments',
      'Cases',
      'Staff',
      'Audit log',
      'Owner Dashboard',
      'System health',
      'Configuration',
      'My account',
    ])
    expect(screen.getByRole('link', { name: 'Action queue' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('search')).toBeTruthy()
    expect(screen.getByText('Searches: Requests, Customers')).toBeTruthy()
    expect(screen.getByRole('banner')).toBeTruthy()
    expect(screen.getByRole('main')).toBeTruthy()
  })

  it('[HH-STAFF-06][HH-STAFF-04] a worker sees only My Day and no search; other screens say they are not part of the role', async () => {
    const fetchImpl = api(session('worker'))
    render(<App path="/staff/staff" base="/staff/" fetchImpl={fetchImpl} navigate={vi.fn()} />)
    await screen.findByText('This screen is not part of your role.')
    expect(menu()).toEqual(['My Day', 'My account'])
    expect(screen.queryByRole('search')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Staff' })).toBeNull()
  })

  it('[HH-STAFF-04] deny by default: unknown ids from the server and a missing menu show nothing', async () => {
    const odd = { home: 'admin', items: ['admin', 'my-day', 'export'], search: ['everything'] }
    render(<App path="/staff/admin" base="/staff/" fetchImpl={api(session('worker', 'en', odd))} navigate={vi.fn()} />)
    await screen.findByText('This screen is not part of your role.')
    expect(menu()).toEqual(['My Day', 'My account'])
    expect(screen.queryByRole('search')).toBeNull()
    cleanup()
    render(<App path="/staff/" base="/staff/" fetchImpl={api(session('worker', 'en', null))} navigate={vi.fn()} />)
    await screen.findByText('Your account has no screens yet. Ask the owner to check your role.')
    expect(menu()).toEqual(['My account'])
  })

  it('[HH-STAFF-06] menu links move between screens with the keyboard-reachable links, in place', async () => {
    const navigate = vi.fn()
    render(<App path="/staff/" base="/staff/" fetchImpl={api(session('owner'))} navigate={navigate} />)
    // TSK-0044 built the Customers screen and TSK-0065 the Scheduling board; Cases is still an unbuilt screen.
    const link = await screen.findByRole('link', { name: 'Scheduling board' })
    expect(link.getAttribute('href')).toBe('/staff/schedule')
    fireEvent.click(link)
    expect(navigate).toHaveBeenCalledWith('/staff/schedule')
    expect(screen.getByRole('heading', { level: 1, name: 'Scheduling board' })).toBeTruthy()
    expect(screen.queryByText('This screen is not available yet.')).toBeNull()
    fireEvent.click(screen.getByRole('link', { name: 'Cases' }))
    expect(navigate).toHaveBeenCalledWith('/staff/cases')
    expect(screen.getByText('This screen is not available yet.')).toBeTruthy()
    const customers = screen.getByRole('link', { name: 'Customers' })
    expect(customers.getAttribute('href')).toBe('/staff/customers')
    fireEvent.click(customers)
    expect(navigate).toHaveBeenCalledWith('/staff/customers')
    expect(screen.getByRole('heading', { level: 1, name: 'Customers' })).toBeTruthy()
    expect(screen.getByRole('searchbox', { name: 'Search customers' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Skip to main content' }).getAttribute('href')).toBe('#staff-main')
  })
})

describe('staff language switch (TSK-0040, HH-OPS-04, HH-LANG-02)', () => {
  it('[HH-OPS-04][T70] switching to Spanish saves it on the server and keeps what was typed', async () => {
    const fetchImpl = api(session('owner'), () => json(200, session('owner', 'es')))
    render(<App path="/staff/" base="/staff/" fetchImpl={fetchImpl} navigate={vi.fn()} />)
    const box = (await screen.findByRole('searchbox', { name: 'Search' })) as HTMLInputElement
    fireEvent.change(box, { target: { value: 'unsent synthetic draft' } })
    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'es' } })
    await screen.findByRole('heading', { level: 1, name: 'Acciones pendientes' })
    const [url, init] = fetchImpl.mock.calls.find(([, i]) => i?.method === 'PUT') as [string, RequestInit]
    expect(url).toBe('/api/v1/staff/auth/session/locale')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(String(init.body))).toEqual({ locale: 'es' })
    expect((init.headers as Record<string, string>)['x-csrf-token']).toBe('synthetic-csrf-token')
    expect((screen.getByRole('searchbox', { name: 'Buscar' }) as HTMLInputElement).value).toBe('unsent synthetic draft')
    // The page language is set by an effect after the Spanish render commits: wait for it.
    await waitFor(() => expect(document.documentElement.lang).toBe('es'))
    expect(menu()[0]).toBe('Acciones pendientes')
  })

  it('[HH-OPS-04] a failed save says so and keeps the current language', async () => {
    const fetchImpl = api(session('worker'), () => json(503, { error: { code: 'UNAVAILABLE', fieldErrors: [] } }))
    render(<App path="/staff/" base="/staff/" fetchImpl={fetchImpl} navigate={vi.fn()} />)
    fireEvent.change(await screen.findByLabelText('Language'), { target: { value: 'es' } })
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('The language could not be saved. Try again.'),
    )
    expect(screen.getByRole('heading', { level: 1, name: 'My Day' })).toBeTruthy()
  })
})

describe('offline indicator (TSK-0040, HH-BASE-01)', () => {
  it('[HH-BASE-01] going offline shows the offline state; coming back removes it', async () => {
    render(<App path="/staff/" base="/staff/" fetchImpl={api(session('worker'))} navigate={vi.fn()} />)
    await screen.findByRole('heading', { level: 1, name: 'My Day' })
    expect(screen.queryByText('You are offline.')).toBeNull()
    // The listeners attach in an effect that may not have run yet under load: repeat the (idempotent) event until the
    // state shows, so an event dispatched before the effect is not mistaken for a missing indicator.
    await waitFor(() => {
      act(() => void window.dispatchEvent(new Event('offline')))
      expect(screen.getByText('You are offline.')).toBeTruthy()
    })
    await waitFor(() => {
      act(() => void window.dispatchEvent(new Event('online')))
      expect(screen.queryByText('You are offline.')).toBeNull()
    })
  })
})

describe('conflict banner (TSK-0040, HH-OPS-03)', () => {
  const { t } = staffTranslator('en')
  it('[HH-OPS-03] reads a stale-version error and shows current values next to yours; nothing else is a conflict', () => {
    expect(conflictOf({ code: 'CONFLICT', fieldErrors: [] })).toBeNull()
    expect(conflictOf({ code: 'STALE_VERSION', fieldErrors: [] })).toBeNull()
    const conflict = conflictOf({
      code: 'STALE_VERSION',
      fieldErrors: [],
      current: { version: 4, values: { window: 'Morning', note: '' } },
    })
    expect(conflict).toEqual({ version: 4, values: { window: 'Morning', note: '' } })
    if (!conflict) throw new Error('expected a conflict')
    const onUseCurrent = vi.fn()
    const onRedo = vi.fn()
    render(
      <ConflictBanner
        t={t}
        conflict={conflict}
        fields={[
          { name: 'window', label: 'Arrival window', yours: 'Afternoon' },
          { name: 'note', label: 'Note', yours: 'Synthetic note' },
        ]}
        onUseCurrent={onUseCurrent}
        onRedo={onRedo}
      />,
    )
    expect(screen.getByText('Someone else changed this while you were editing.')).toBeTruthy()
    const rows = screen.getAllByRole('row').map((r) => Array.from(r.children).map((c) => c.textContent))
    expect(rows).toEqual([
      ['Field', 'Current', 'Yours'],
      ['Arrival window', 'Morning', 'Afternoon'],
      ['Note', '(empty)', 'Synthetic note'],
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Use the current values' }))
    expect(onUseCurrent).toHaveBeenCalledWith(conflict)
    fireEvent.click(screen.getByRole('button', { name: 'Review and redo my change' }))
    expect(onRedo).toHaveBeenCalledWith(conflict)
  })
})
