// Switching the staff language mid-work (TSK-0102; HH-OPS-04, HH-LANG-03, HH-BASE-03, T70, OWN-DEC-79). A worker on a
// job packet with the Stop Work form half filled, an opened packet section and offline work not yet uploaded switches
// to Spanish and back: the screen re-renders in place (nothing reloaded or remounted), what was typed stays, the
// offline drafts stay on the phone untouched, and the canonical values (version, quantity, unit, codes) are the same.
// The API is a synthetic stand-in; every id, name, address and note is synthetic (RULE-SYNTHETIC-DATA).
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/App'
import type { JobPacketView } from '../src/JobPacket'
import { memoryStore, setOfflineStore, type OfflineStore, type StoredDraft } from '../src/offline/store'

const ME = '11111111-1111-4111-8111-111111111102'
const JOB = '55555555-5555-4555-8555-555555555102'
const VISIT = '33333333-3333-4333-8333-333333333102'
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const session = (locale: 'en' | 'es') => ({
  staffUserId: ME,
  displayName: 'Synthetic Worker',
  email: 'worker-102@example.test',
  locale,
  roles: ['worker'],
  mfaEnrolled: true,
  mfaRecommended: false,
  csrfToken: 'synthetic-csrf-token',
  navigation: { home: 'my-day', items: ['my-day'], search: [] },
})

const PACKET = {
  job: { id: JOB, projectId: 'p102', projectReference: 'HH-SYNTH-102', jobState: 'ready' },
  packet: {
    id: 'k4',
    version: 4,
    contentSha256: 'b'.repeat(64),
    generatedAt: '2026-10-25T15:00:00.000Z',
    critical: false,
  },
  freshness: {
    firstGeneratedAt: '2026-10-24T15:00:00.000Z',
    lastUpdatedAt: '2026-10-25T15:00:00.000Z',
    checkedAt: '2026-10-25T16:00:00.000Z',
    latestVersion: 4,
    current: true,
  },
  review: {
    lastViewed: { version: 4, viewedAt: '2026-10-25T15:30:00.000Z' },
    fromVersion: 4,
    changes: [],
    critical: false,
  },
  services: [{ workPackageId: 'w1', serviceCode: 'DW-01', state: 'planned' }],
  visits: [
    {
      visitId: VISIT,
      number: 1,
      purpose: 'service',
      state: 'confirmed',
      localDate: '2026-11-05',
      windowStart: '09:00',
      windowEnd: '10:00',
      timeZone: 'America/Kentucky/Louisville',
      team: [{ staffUserId: ME, name: 'Synthetic Worker', role: 'lead' }],
      equipment: [],
      requested: [],
    },
  ],
  site: {
    propertyId: '66666666-6666-4666-8666-666666666102',
    address: { street: '102 Synthetic Lane', unit: null, city: 'Testville', state: 'KY', zip: '40000' },
    directionsUrl: null,
    propertyType: 'house',
    details: [],
    accessCodes: [],
  },
  occupants: [],
  scope: {
    version: 2,
    source: 'approval',
    createdAt: '2026-10-24T15:00:00.000Z',
    lines: [{ position: 1, kind: 'base', description: 'Patch the synthetic wall', quantity: '3', unit: 'sq ft' }],
    texts: { exclusions: [], assumptions: [] },
    history: [{ version: 2, source: 'approval', createdAt: '2026-10-24T15:00:00.000Z' }],
  },
  evidence: { photos: [] },
  sop: { packages: [], preWork: [], completion: [] },
  holds: [],
  dependencies: {
    approvedAt: '2026-10-24T15:00:00.000Z',
    deposit: { required: false, state: 'not_required' },
    jobState: 'ready',
    blockingHolds: 0,
    liveVisits: 1,
  },
  materials: { state: 'not_recorded', packages: [] },
  communication: {
    siteContact: null,
    escalationContact: { state: 'not_configured' },
    emergency: { call911: 'tel:911' },
    stopWork: [
      {
        workPackageId: 'w1',
        serviceCode: 'DW-01',
        items: [{ id: 'stop.1', text: 'Synthetic stop trigger.', line: 90 }],
      },
    ],
  },
  acknowledgments: {
    mine: { state: 'not_assigned', assigned: false, acknowledgment: null, invalidation: null, changesSince: [] },
    team: [],
  },
  actions: { revealAccessCodes: false, acknowledge: false },
} as unknown as JobPacketView

const draft = (id: string, kind: StoredDraft['kind'], payload: Record<string, unknown>): StoredDraft => ({
  id,
  kind,
  staffUserId: ME,
  jobId: JOB,
  visitId: VISIT,
  deviceRecordedAt: '2026-11-05T14:05:00.000Z',
  payload,
  state: 'saved_on_phone',
  attempts: 0,
})

/** The stand-in API: the session and its locale, the packet; field-event uploads find no network (offline work). */
function api() {
  let locale: 'en' | 'es' = 'en'
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url === '/api/v1/staff/auth/session/locale' && init?.method === 'PUT') {
      locale = (JSON.parse(String(init.body)) as { locale: 'en' | 'es' }).locale
      return json(200, session(locale))
    }
    if (url === '/api/v1/staff/auth/session') return json(200, session(locale))
    if (url === `/api/v1/staff/jobs/${JOB}/packet`) return json(200, PACKET)
    if (url === `/api/v1/staff/jobs/${JOB}/packet/views`) return json(200, { version: 4, viewedAt: 'x' })
    if (url.startsWith('/api/v1/staff/field-events')) throw new TypeError('Failed to fetch')
    return json(404, { error: { code: 'NOT_FOUND', fieldErrors: [] } })
  })
}

let store: OfflineStore
beforeEach(() => {
  store = memoryStore()
  setOfflineStore(store)
})
afterEach(() => {
  cleanup()
  setOfflineStore(null)
  document.documentElement.lang = ''
})

describe('switching the staff language mid-work (TSK-0102, HH-OPS-04)', () => {
  it('[HH-OPS-04][T70][HH-BASE-03] the draft, the packet position and the offline work survive a switch to Spanish and back', async () => {
    const offline = [
      draft('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaa102', 'tap', { tap: 'arrived' }),
      draft('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb102', 'note', { text: 'Synthetic note written offline' }),
    ]
    for (const d of offline) await store.putDraft(d)
    const fetchImpl = api()
    render(<App path={`/staff/packets/${JOB}`} base="/staff/" fetchImpl={fetchImpl} navigate={vi.fn()} />)

    const heading = await screen.findByRole('heading', { level: 1, name: /HH-SYNTH-102/ })
    const main = screen.getByRole('main')
    // Mid-form: the Stop Work form is open, a hazard is chosen and a description typed (nothing sent yet).
    fireEvent.click(within(main).getByRole('button', { name: 'Stop Work / Report Hazard' }))
    const form = within(main).getByRole('form', { name: 'Stop Work' })
    fireEvent.click(within(form).getByRole('radio', { name: 'Structural concern' }))
    fireEvent.change(within(form).getByLabelText(/What you see/), { target: { value: 'Synthetic crack, unsent' } })
    // Mid-packet: the worker opened the service's stop-work triggers.
    const triggers = main.querySelector('details') as HTMLDetailsElement
    triggers.open = true
    const packetReads = () =>
      fetchImpl.mock.calls.filter(([u]) => String(u) === `/api/v1/staff/jobs/${JOB}/packet`).length
    await waitFor(() => expect(packetReads()).toBe(1))

    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'es' } })
    await screen.findByRole('form', { name: 'Detener el trabajo' })
    await waitFor(() => expect(document.documentElement.lang).toBe('es'))

    // Re-rendered in place: the same packet element, not read again, the opened section still open.
    expect(screen.getByRole('heading', { level: 1, name: /HH-SYNTH-102/ })).toBe(heading)
    expect(heading.isConnected).toBe(true)
    expect(packetReads()).toBe(1)
    expect(triggers.isConnected && triggers.open).toBe(true)
    // The safety text a Spanish-reading worker sees is the released Spanish; the SOP trigger stays marked English.
    const spanishForm = within(main).getByRole('form', { name: 'Detener el trabajo' })
    expect(
      within(spanishForm).getByText(
        'Tienes derecho a detener el trabajo. No necesitas permiso de nadie. En una emergencia, llama primero al 911.',
      ),
    ).toBeTruthy()
    expect(within(main).getByText('Synthetic stop trigger.').getAttribute('lang')).toBe('en')
    // What was typed and chosen is kept.
    expect((within(spanishForm).getByRole('radio', { name: 'Problema estructural' }) as HTMLInputElement).checked).toBe(
      true,
    )
    expect((within(spanishForm).getByLabelText(/Lo que ves/) as HTMLTextAreaElement).value).toBe(
      'Synthetic crack, unsent',
    )
    // Canonical values are shown as they are: the version, the quantity and its unit, the service code.
    const line = within(main).getByText('Patch the synthetic wall').closest('tr') as HTMLTableRowElement
    expect([...line.cells].slice(0, 3).map((c) => c.textContent)).toEqual(['Patch the synthetic wall', '3', 'sq ft'])
    expect(within(main).getAllByText(/DW-01/).length).toBeGreaterThan(0)

    // Back to English: still the same form and values.
    fireEvent.change(screen.getByLabelText('Idioma'), { target: { value: 'en' } })
    const english = await screen.findByRole('form', { name: 'Stop Work' })
    expect((within(english).getByLabelText(/What you see/) as HTMLTextAreaElement).value).toBe(
      'Synthetic crack, unsent',
    )
    expect(packetReads()).toBe(1)

    // The offline work is still on the phone, unchanged: same events, same device times, nothing uploaded.
    await act(async () => undefined)
    const kept = (await store.listDrafts()).sort((a, b) => a.id.localeCompare(b.id))
    expect(kept.map((d) => [d.id, d.kind, d.payload, d.deviceRecordedAt])).toEqual(
      offline.map((d) => [d.id, d.kind, d.payload, d.deviceRecordedAt]),
    )
    for (const d of kept) expect(['saved_on_phone', 'pending_upload']).toContain(d.state)
    // Only the locale was written: no stop, no acknowledgment, no other record changed by the switch.
    const writes = fetchImpl.mock.calls
      .filter(([u, i]) => i?.method && i.method !== 'GET' && !String(u).includes('/field-events'))
      .map(([u, i]) => `${i?.method} ${String(u)}`)
    expect(writes.filter((w) => !w.endsWith('/packet/views'))).toEqual([
      'PUT /api/v1/staff/auth/session/locale',
      'PUT /api/v1/staff/auth/session/locale',
    ])
  })

  it('[OWN-DEC-208][OWN-DEC-162] the Owner Dashboard stays English when the Owner reads the staff app in Spanish', async () => {
    const owner = {
      ...session('es'),
      roles: ['owner'],
      navigation: { home: 'queue', items: ['queue', 'dashboard'], search: [] },
    }
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) =>
      String(input) === '/api/v1/staff/auth/session'
        ? json(200, owner)
        : json(404, { error: { code: 'NOT_FOUND', fieldErrors: [] } }),
    )
    render(<App path="/staff/dashboard" base="/staff/" fetchImpl={fetchImpl} navigate={vi.fn()} />)
    const title = await screen.findByRole('heading', { level: 1, name: 'Owner Dashboard' })
    expect(title.closest('[lang]')?.getAttribute('lang')).toBe('en')
    // The menu around it keeps the Owner's language.
    const nav = screen.getByRole('navigation', { name: 'Principal' })
    expect(within(nav).getByRole('link', { name: 'Panel del propietario' })).toBeTruthy()
    await waitFor(() => expect(document.documentElement.lang).toBe('es'))
  })
})
