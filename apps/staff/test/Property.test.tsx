// The property record in the staff app (TSK-0045; HH-CRM-02, HH-CRM-03, T28, RULE-LANGUAGES). The API is a synthetic
// stand-in (RULE-SYNTHETIC-DATA); the code value is built at runtime.
import { staffTranslator } from '@handyhub/i18n'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PropertyRecord, type PropertyDetailView } from '../src/Property'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const ID = '55555555-5555-4555-8555-555555555555'
const CODE_ID = '66666666-6666-4666-8666-666666666666'
const VALUE = ['SYNX', '4745', 'QV'].join('-')
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function view(over: Partial<PropertyDetailView> = {}): PropertyDetailView {
  const ref = { id: 's-1', name: 'Synthetic Office' }
  return {
    id: ID,
    version: 3,
    address: { street: '46 Synthetic Moved Road', unit: null, city: 'Testville', state: 'KY', zip: '40046' },
    addressVersion: 2,
    propertyType: 'house',
    timeZone: 'America/Kentucky/Louisville',
    zone: {
      zone: 'America/Kentucky/Louisville',
      status: 'verified',
      basis: 'verified_county',
      family: 'eastern',
      counties: ['KY:Jefferson'],
      version: 2,
    },
    zoneHistory: [],
    coverage: 'unknown',
    createdAt: '2026-10-20T14:00:00.000Z',
    details: [
      {
        detail: 'address',
        value: null,
        recorded: true,
        source: 'customer_call',
        confirmedAt: '2026-10-21T10:00:00.000Z',
        confirmedBy: ref,
      },
      {
        detail: 'property_type',
        value: null,
        recorded: true,
        source: 'request_form',
        confirmedAt: '2026-10-20T14:00:00.000Z',
        confirmedBy: null,
      },
      { detail: 'site_contact', value: null, recorded: false, source: null, confirmedAt: null, confirmedBy: null },
      { detail: 'access_windows', value: null, recorded: false, source: null, confirmedAt: null, confirmedBy: null },
      {
        detail: 'access_notes',
        value: 'Use the side gate.',
        recorded: true,
        source: 'customer_message',
        confirmedAt: '2026-10-21T11:00:00.000Z',
        confirmedBy: ref,
      },
      { detail: 'parking_loading', value: null, recorded: false, source: null, confirmedAt: null, confirmedBy: null },
      { detail: 'occupants_pets', value: null, recorded: false, source: null, confirmedAt: null, confirmedBy: null },
      { detail: 'restricted_areas', value: null, recorded: false, source: null, confirmedAt: null, confirmedBy: null },
      { detail: 'utilities', value: null, recorded: false, source: null, confirmedAt: null, confirmedBy: null },
      {
        detail: 'customer_preparation',
        value: null,
        recorded: false,
        source: null,
        confirmedAt: null,
        confirmedBy: null,
      },
      { detail: 'site_flags', value: null, recorded: false, source: null, confirmedAt: null, confirmedBy: null },
    ],
    formerAddresses: [
      {
        addressVersion: 1,
        address: { street: '45 Synthetic Record Lane', unit: 'Unit 2', city: 'Testville', state: 'KY', zip: '40045' },
        source: 'request_form',
        from: '2026-10-20T14:00:00.000Z',
        until: '2026-10-21T10:00:00.000Z',
        recordedBy: null,
      },
    ],
    customers: [{ id: 'cu-1', displayName: 'Synthetic Customer', status: 'active', relationship: 'requester' }],
    requests: [
      {
        id: 'r-1',
        reference: 'HH-7K2M9Q4D',
        state: 'received',
        submittedAt: '2026-10-20T14:00:00.000Z',
        address: { street: '45 Synthetic Record Lane', unit: 'Unit 2', city: 'Testville', state: 'KY', zip: '40045' },
        formerAddress: true,
      },
    ],
    accessCodes: {
      visible: true,
      store: 'available',
      items: [
        {
          id: CODE_ID,
          version: 1,
          kind: 'gate',
          label: 'Back gate',
          source: 'customer_call',
          confirmedAt: '2026-10-21T10:00:00.000Z',
          confirmedBy: ref,
          createdAt: '2026-10-21T10:00:00.000Z',
          createdBy: ref,
          lastRevealed: null,
          reveals: 0,
        },
      ],
      removed: [],
    },
    history: [
      {
        at: '2026-10-21T10:00:00.000Z',
        detail: 'address',
        action: 'changed',
        source: 'customer_call',
        by: ref,
        reason: 'The street was entered wrong',
      },
    ],
    actions: { edit: true, setAccessCodes: true, revealAccessCodes: true, verifyTimeZone: true },
    ...over,
  }
}

type Handler = (url: string, init?: RequestInit) => Response | undefined
function api(v = view(), write?: Handler) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method && init.method !== 'GET') return write?.(url, init) ?? json(500, {})
    return json(200, v)
  })
}
function renderRecord(fetchImpl: ReturnType<typeof api>, locale: 'en' | 'es' = 'en') {
  const { t } = staffTranslator(locale)
  return render(
    <PropertyRecord
      t={t}
      locale={locale}
      fetchImpl={fetchImpl as unknown as typeof fetch}
      id={ID}
      go={vi.fn()}
      href={(to) => `/staff${to}`}
    />,
  )
}

describe('the property record (TSK-0045, HH-CRM-02)', () => {
  it('[HH-CRM-02] the address with its former address, each detail with its source and last confirmation', async () => {
    renderRecord(api())
    await screen.findByRole('heading', { level: 1, name: 'Property 46 Synthetic Moved Road, Testville, KY 40046' })
    const address = screen.getByRole('region', { name: 'Service address' })
    expect(within(address).getByText(/Last confirmed .* \(Customer by phone, Synthetic Office\)/)).toBeTruthy()
    expect(within(address).getByText('45 Synthetic Record Lane, Unit 2, Testville, KY 40045')).toBeTruthy()
    expect(within(address).getByText(/Last confirmed .* \(Request form, the customer\)/)).toBeTruthy()
    const details = screen.getByRole('region', { name: 'Property details' })
    const notes = within(details).getByRole('article', { name: 'Access instructions (no codes)' })
    expect(within(notes).getByText('Use the side gate.')).toBeTruthy()
    expect(within(notes).getByText(/Customer in writing/)).toBeTruthy()
    const pets = within(details).getByRole('article', { name: 'Occupants and pets' })
    expect(within(pets).getByText('Not recorded')).toBeTruthy()
    expect(within(pets).getByText('Not recorded.')).toBeTruthy()
    // The request keeps the address it was sent with, marked as a former address.
    const requests = screen.getByRole('region', { name: 'Requests at this property' })
    expect(within(requests).getByText('Former address')).toBeTruthy()
    expect(within(requests).getByRole('link', { name: 'Request HH-7K2M9Q4D' }).getAttribute('href')).toBe(
      '/staff/requests/r-1',
    )
    const history = screen.getByRole('region', { name: 'Change history' })
    expect(within(history).getByText(/Reason: The street was entered wrong/)).toBeTruthy()
  })

  it('[HH-CRM-02] a detail edit sends the value, its source, the reason and the property version', async () => {
    const write = vi.fn(() => json(200, { id: ID, version: 4 }))
    renderRecord(api(view(), write))
    const details = await screen.findByRole('region', { name: 'Property details' })
    const pets = within(details).getByRole('article', { name: 'Occupants and pets' })
    fireEvent.click(within(pets).getByRole('button', { name: 'Edit Occupants and pets' }))
    fireEvent.change(within(pets).getByLabelText('Occupants and pets'), { target: { value: 'One synthetic dog' } })
    fireEvent.change(within(pets).getByLabelText(/Reason/), { target: { value: 'Customer call' } })
    fireEvent.click(within(pets).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(write).toHaveBeenCalled())
    const [url, init] = write.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`/api/v1/staff/properties/${ID}/details/occupants_pets`)
    expect(JSON.parse(String(init.body))).toEqual({
      value: 'One synthetic dog',
      source: 'customer_call',
      reason: 'Customer call',
    })
    expect((init.headers as Record<string, string>)['if-match']).toBe('"3"')
  })

  it('[HH-CRM-02][RULE-LANGUAGES] Spanish staff text', async () => {
    renderRecord(api(), 'es')
    await screen.findByRole('heading', { level: 1, name: 'Propiedad 46 Synthetic Moved Road, Testville, KY 40046' })
    expect(screen.getByRole('region', { name: 'Dirección del servicio' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Códigos de acceso' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Mostrar código' })).toBeTruthy()
  })
})

describe('access codes in the property record (TSK-0045, HH-CRM-03, T28)', () => {
  it('[HH-CRM-03][T28] masked by default; a reveal shows the value for a short time, then hides it again', async () => {
    const write = vi.fn((url: string) =>
      url.endsWith('/reveal')
        ? json(200, {
            id: CODE_ID,
            kind: 'gate',
            label: 'Back gate',
            value: VALUE,
            revealedAt: new Date().toISOString(),
            hideAt: new Date(Date.now() + 200).toISOString(),
          })
        : undefined,
    )
    renderRecord(api(view(), write))
    const codes = await screen.findByRole('region', { name: 'Access codes' })
    const item = within(codes).getByRole('listitem', { name: 'Gate code: Back gate' })
    expect(within(item).getByText('Hidden')).toBeTruthy()
    expect(document.body.textContent).not.toContain(VALUE)
    fireEvent.click(within(item).getByRole('button', { name: 'Reveal code' }))
    await within(item).findByText(VALUE)
    const [url, init] = write.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`/api/v1/staff/properties/${ID}/access-codes/${CODE_ID}/reveal`)
    // No idempotency key: a reveal is never stored for replay.
    expect((init.headers as Record<string, string>)['idempotency-key']).toBeUndefined()
    // The displayed copy goes away by itself, and nothing is kept in browser storage.
    await waitFor(() => expect(document.body.textContent).not.toContain(VALUE), { timeout: 2000 })
    expect(within(item).getByText('Hidden')).toBeTruthy()
    expect(window.localStorage.length).toBe(0)
    expect(window.sessionStorage.length).toBe(0)
  })

  it('[HH-CRM-03] Hide and a hidden tab drop the revealed value at once', async () => {
    const write = vi.fn(() =>
      json(200, {
        id: CODE_ID,
        kind: 'gate',
        label: 'Back gate',
        value: VALUE,
        revealedAt: new Date().toISOString(),
        hideAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    )
    renderRecord(api(view(), write))
    const item = await screen.findByRole('listitem', { name: 'Gate code: Back gate' })
    fireEvent.click(within(item).getByRole('button', { name: 'Reveal code' }))
    await within(item).findByText(VALUE)
    fireEvent.click(within(item).getByRole('button', { name: 'Hide' }))
    expect(document.body.textContent).not.toContain(VALUE)
    fireEvent.click(within(item).getByRole('button', { name: 'Reveal code' }))
    await within(item).findByText(VALUE)
    const state = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(document.body.textContent).not.toContain(VALUE)
    state.mockRestore()
  })

  it('[HH-CRM-03] entering a code sends no idempotency key; a refused reveal says why', async () => {
    const write = vi.fn((url: string) =>
      url.endsWith('/reveal')
        ? json(403, { error: { code: 'FORBIDDEN', fieldErrors: [] } })
        : json(201, { id: 'new', version: 1, createdAt: '2026-10-21T12:00:00.000Z' }),
    )
    renderRecord(api(view(), write))
    const codes = await screen.findByRole('region', { name: 'Access codes' })
    const form = within(codes).getByRole('form', { name: 'Add an access code' })
    fireEvent.change(within(form).getByLabelText('Code or key location'), { target: { value: VALUE } })
    fireEvent.change(within(form).getByLabelText(/Reason/), { target: { value: 'Customer call' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Save code' }))
    await waitFor(() => expect(write).toHaveBeenCalled())
    const [url, init] = write.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`/api/v1/staff/properties/${ID}/access-codes`)
    expect((init.headers as Record<string, string>)['idempotency-key']).toBeUndefined()
    expect(JSON.parse(String(init.body))).toMatchObject({ kind: 'gate', value: VALUE, source: 'customer_call' })
    const item = within(codes).getByRole('listitem', { name: 'Gate code: Back gate' })
    fireEvent.click(within(item).getByRole('button', { name: 'Reveal code' }))
    await within(item).findByText(/Only the owner, the office, or the worker assigned to today's visit/)
  })

  it('[HH-CRM-03] NOT CONFIGURED: the store says so and offers no entry or reveal; roles without access see no section', async () => {
    renderRecord(api(view({ accessCodes: { ...view().accessCodes, store: 'not_configured' } })))
    const codes = await screen.findByRole('region', { name: 'Access codes' })
    expect(within(codes).getByText(/The access-code store is not set up yet/)).toBeTruthy()
    expect(within(codes).queryByRole('button', { name: 'Reveal code' })).toBeNull()
    expect(within(codes).queryByRole('form', { name: 'Add an access code' })).toBeNull()
    expect(within(codes).getByRole('button', { name: 'Remove code' })).toBeTruthy()
    cleanup()
    renderRecord(
      api(
        view({
          accessCodes: { visible: false, store: 'available', items: [], removed: [] },
          actions: { edit: false, setAccessCodes: false, revealAccessCodes: false, verifyTimeZone: false },
        }),
      ),
    )
    await screen.findByRole('region', { name: 'Property details' })
    expect(screen.queryByRole('region', { name: 'Access codes' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Edit/ })).toBeNull()
  })
})
