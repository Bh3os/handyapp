// Owner Dashboard -> Staging Tools -> Test Data Management (TSK-0141; HH-OPS-05, HH-LANG-02). Responses are
// synthetic; the server decides everything, these tests check what the screen shows and sends.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/App'
import type { StagingStatus } from '../src/StagingTools'

afterEach(cleanup)

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const session = (locale: 'en' | 'es' = 'en') => ({
  staffUserId: 'u-owner',
  displayName: 'Synthetic owner',
  email: 'owner@example.test',
  locale,
  roles: ['owner'],
  mfaEnrolled: false,
  mfaRecommended: false,
  csrfToken: 'synthetic-csrf-token',
  navigation: { home: 'queue', items: ['queue', 'dashboard'], search: [] },
})

const STATUS: StagingStatus = {
  environment: 'staging',
  identified: true,
  checks: [
    { id: 'environment', ok: true },
    { id: 'flag', ok: true },
    { id: 'access_gate', ok: true },
    { id: 'database_marked', ok: true },
    { id: 'database_never_production', ok: true },
  ],
  running: false,
  confirmationPhrase: 'RESET TEST DATA',
  freshAuthMinutes: 5,
  removed: [
    { id: 'requests', count: 4 },
    { id: 'estimates', count: 2 },
    { id: 'stored_files', count: 0 },
  ],
  total: 6,
  preserved: [{ id: 'services', count: 26 }],
  reusableAccounts: [],
  freshData: [
    { id: 'guest_customer_request', available: true, task: null },
    { id: 'change_order', available: false, task: 'TSK-0081' },
  ],
  runs: [],
  testAccounts: [
    {
      id: 'customer',
      kind: 'customer',
      role: null,
      email: 'oat-customer@example.test',
      name: 'TEST DATA (fictional) Customer',
      state: 'not_created',
      reusable: false,
      mfaEnrolled: null,
      receivesEmail: true,
    },
    {
      id: 'guest_customer',
      kind: 'guest',
      role: null,
      email: 'oat-guest@example.test',
      name: 'TEST DATA (fictional) Guest',
      state: 'no_account',
      reusable: null,
      mfaEnrolled: null,
      receivesEmail: false,
    },
    {
      id: 'worker',
      kind: 'staff',
      role: 'worker',
      email: 'oat-worker@example.test',
      name: 'Test Worker (fictional)',
      state: 'not_created',
      reusable: null,
      mfaEnrolled: false,
      receivesEmail: true,
    },
  ],
}

function api(responses: Record<string, (init?: RequestInit) => Response>, locale: 'en' | 'es' = 'en') {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    for (const [prefix, answer] of Object.entries(responses)) if (url.startsWith(prefix)) return answer(init)
    return json(200, session(locale))
  })
}

describe('Staging Tools on the Owner Dashboard (TSK-0141, HH-OPS-05)', () => {
  it('[HH-OPS-05] is absent where the server has no staging routes (production)', async () => {
    const fetchImpl = api({ '/api/v1/staff/staging/test-data': () => json(404, { error: { code: 'NOT_FOUND' } }) })
    render(<App path="/staff/dashboard" base="/staff/" fetchImpl={fetchImpl} />)
    await screen.findByRole('heading', { level: 1 })
    await vi.waitFor(() =>
      expect(fetchImpl.mock.calls.some(([u]) => String(u).includes('/staff/staging/test-data'))).toBe(true),
    )
    expect(screen.queryByText('Staging Tools')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reset Test Data' })).toBeNull()
  })

  it('[HH-OPS-05] shows STAGING / TEST MODE, the counts, and confirms only with the typed words', async () => {
    let sent: unknown = null
    const fetchImpl = api({
      '/api/v1/staff/staging/test-data/reset': (init) => {
        sent = JSON.parse(String(init?.body))
        return json(200, {
          runId: 'r1',
          seq: '1',
          mode: 'reset',
          state: 'completed',
          removed: [{ id: 'requests', count: 4 }],
          preservedBefore: [],
          preservedAfter: [],
          checks: [{ id: 'nothing_left_to_send', ok: true, details: [] }],
          errors: [],
          storedFileJobs: 0,
          seeding: null,
        })
      },
      '/api/v1/staff/staging/test-data': () => json(200, STATUS),
    })
    render(<App path="/staff/dashboard" base="/staff/" fetchImpl={fetchImpl} />)
    expect(await screen.findByText('STAGING / TEST MODE')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Test Data Management' })).toBeTruthy()
    expect(
      within(screen.getByTestId('staging-removed')).getByText('Projects, service requests and questions: 4'),
    ).toBeTruthy()
    expect(screen.getByText('Change order: not available yet (TSK-0081)')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Reset Test Data' }))
    const dialog = await screen.findByTestId('reset-dialog')
    expect(within(dialog).getByText('6 test records in total')).toBeTruthy()
    const confirm = screen.getByRole('button', { name: 'Delete test data' })
    fireEvent.click(confirm)
    expect(sent).toBeNull()
    fireEvent.change(within(dialog).getByLabelText('Type RESET TEST DATA to confirm'), {
      target: { value: 'RESET TEST DATA' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Delete test data' }))
    expect(await screen.findByText('Reset completed.')).toBeTruthy()
    expect(sent).toEqual({ confirmation: 'RESET TEST DATA', freshData: false })
  })

  it('[HH-LANG-02][OWN-DEC-208] stays English on the Owner Dashboard when the Owner reads Spanish (TSK-0102)', async () => {
    const fetchImpl = api({ '/api/v1/staff/staging/test-data': () => json(200, STATUS) }, 'es')
    render(<App path="/staff/dashboard" base="/staff/" fetchImpl={fetchImpl} />)
    expect(await screen.findByText('STAGING / TEST MODE')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reset Test Data' })).toBeTruthy()
  })

  it('[HH-OPS-06] lists the test accounts without any credential and creates them with a reason (TSK-0142)', async () => {
    let sent: unknown = null
    const fetchImpl = api({
      '/api/v1/staff/staging/test-accounts': (init) => {
        sent = JSON.parse(String(init?.body))
        return json(200, {
          outcomes: [
            { id: 'customer', outcome: 'created', step: null, codes: [] },
            { id: 'guest_customer', outcome: 'no_account', step: null, codes: [] },
            { id: 'worker', outcome: 'created', step: null, codes: [] },
          ],
          accounts: [],
        })
      },
      '/api/v1/staff/staging/test-data': () => json(200, STATUS),
    })
    render(<App path="/staff/dashboard" base="/staff/" fetchImpl={fetchImpl} />)
    const section = await screen.findByTestId('staging-test-accounts')
    expect(within(screen.getByTestId('test-account-worker')).getByText(/oat-worker@example\.test/)).toBeTruthy()
    expect(
      within(screen.getByTestId('test-account-guest_customer')).getByText(
        'Not an approved test address: email cannot arrive',
      ),
    ).toBeTruthy()
    expect(section.textContent).not.toMatch(/password:/i)
    fireEvent.click(within(section).getByRole('button', { name: 'Create the test accounts' }))
    expect(await screen.findByText('Staff (Worker): created')).toBeTruthy()
    expect(sent).toEqual({ reason: 'Owner Acceptance Testing on staging' })
  })
})
