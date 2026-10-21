// Customer records in the staff app (TSK-0044; HH-CRM-01, HH-ID-02, HH-STAFF-05, RULE-LANGUAGES). The API is a
// synthetic stand-in (RULE-SYNTHETIC-DATA).
import { staffTranslator } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CustomerRecord, CustomersScreen, type CustomerDetail } from '../src/Customers'

afterEach(cleanup)

const ID = '33333333-3333-4333-8333-333333333333'
const OTHER = '44444444-4444-4444-8444-444444444444'
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function detail(over: Partial<CustomerDetail> = {}): CustomerDetail {
  return {
    id: ID,
    displayName: 'Synthetic Customer',
    status: 'active',
    mergedIntoId: null,
    mergedInto: null,
    provenance: 'request_submission',
    language: 'en',
    createdAt: '2026-10-20T14:00:00.000Z',
    version: 1,
    contacts: [
      {
        id: 'c-1',
        customerId: ID,
        fullName: 'Synthetic Customer',
        email: 'synthetic@example.test',
        phone: '+15025550144',
        preferredChannel: 'email',
        isPrimary: true,
        version: 1,
        verification: { email: 'verified', phone: 'unverified' },
        permissions: {
          sms: { state: 'withdrawn', since: '2026-10-20T15:00:00.000Z' },
          marketingEmail: { state: 'none', since: null },
          marketingSms: { state: 'none', since: null },
        },
        consentHistory: [
          {
            purpose: 'transactional_sms',
            channel: 'sms',
            granted: false,
            source: 'sms_keyword',
            disclosureVersion: null,
            recordedAt: '2026-10-20T15:00:00.000Z',
            ownRecord: false,
          },
          {
            purpose: 'transactional_sms',
            channel: 'sms',
            granted: true,
            source: 'request_form',
            disclosureVersion: 'sms-disclosure-1',
            recordedAt: '2026-10-20T14:00:00.000Z',
            ownRecord: true,
          },
        ],
      },
    ],
    properties: [],
    projects: [
      {
        id: 'p-1',
        reference: 'HH-7K2M9Q4D',
        state: 'open',
        createdAt: '2026-10-20T14:00:00.000Z',
        customerId: ID,
        currentCustomerId: ID,
        requests: [{ id: 'r-1', reference: 'HH-7K2M9Q4D', state: 'received', submittedAt: '2026-10-20T14:00:00.000Z' }],
      },
    ],
    documents: { state: 'not_available' },
    payments: { state: 'not_available' },
    notes: [
      {
        id: 'n-1',
        source: 'customer',
        requestReference: null,
        visibility: 'internal_operational',
        masked: false,
        body: 'Synthetic internal note',
        author: { id: 's-1', name: 'Synthetic Office' },
        createdAt: '2026-10-20T16:00:00.000Z',
      },
      {
        id: 'n-2',
        source: 'customer',
        requestReference: null,
        visibility: 'restricted_incident',
        masked: true,
        body: null,
        author: null,
        createdAt: '2026-10-20T17:00:00.000Z',
      },
    ],
    candidates: {
      visible: true,
      items: [
        {
          id: 'm-1',
          version: 1,
          customer: { id: OTHER, displayName: 'Synthetic Neighbour', status: 'active' },
          reasons: ['email', 'name'],
          status: 'open',
          detectedAt: '2026-10-20T14:01:00.000Z',
          lastReview: null,
        },
      ],
    },
    timeline: [
      {
        at: '2026-10-20T14:00:00.000Z',
        kind: 'request_submitted',
        actor: { kind: 'customer', name: null },
        reference: 'HH-7K2M9Q4D',
        codes: [],
        channel: null,
        state: 'received',
      },
    ],
    timelineTruncated: false,
    links: [],
    actions: {
      edit: true,
      addNote: true,
      recordWithdrawal: true,
      reviewCandidates: true,
      merge: true,
      relink: true,
      reverseLinks: false,
      noteVisibilities: ['internal_operational', 'restricted_incident', 'restricted_financial'],
    },
    ...over,
  }
}

type Handler = (url: string, init?: RequestInit) => Response | undefined
function api(view = detail(), write?: Handler) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method && init.method !== 'GET') return write?.(url, init) ?? json(500, {})
    return json(200, view)
  })
}
function renderRecord(fetchImpl: ReturnType<typeof api>, locale: 'en' | 'es' = 'en') {
  const { t } = staffTranslator(locale)
  return render(
    <CustomerRecord
      t={t}
      locale={locale}
      fetchImpl={fetchImpl as unknown as typeof fetch}
      id={ID}
      go={vi.fn()}
      href={(to) => `/staff${to}`}
    />,
  )
}

describe('the customer record (TSK-0044, HH-CRM-01)', () => {
  it('[HH-CRM-01] separate email and phone verification, the SMS opt-in with its opt-out, and no fake documents', async () => {
    renderRecord(api())
    await screen.findByRole('heading', { level: 1, name: 'Customer Synthetic Customer' })
    const contact = screen.getByRole('article', { name: 'Synthetic Customer' })
    expect(within(contact).getByText('Email: Verified')).toBeTruthy()
    expect(within(contact).getByText('Phone: Unverified')).toBeTruthy()
    expect(within(contact).getByText(/^Withdrawn since/)).toBeTruthy()
    expect(
      within(contact).getByText(/Texts \(SMS opt-in\) by Text: Withdrawn \(Text reply \(STOP or START\)/),
    ).toBeTruthy()
    expect(within(contact).getByText('Recorded for the same email or number outside this contact.')).toBeTruthy()
    expect(screen.getAllByText('Not available yet: these records are added in a later release.')).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'Request HH-7K2M9Q4D' }).getAttribute('href')).toBe('/staff/requests/r-1')
  })

  it('[HH-STAFF-05] each note shows its class; a restricted note arrives masked and shows no text', async () => {
    renderRecord(api())
    const notes = await screen.findByRole('region', { name: 'Notes' })
    const [internal, restricted] = within(notes).getAllByRole('listitem')
    expect(within(internal as HTMLElement).getByText('Internal')).toBeTruthy()
    expect(within(internal as HTMLElement).getByText('Synthetic internal note')).toBeTruthy()
    expect(within(internal as HTMLElement).getByText(/Synthetic Office/)).toBeTruthy()
    expect(within(restricted as HTMLElement).getByText('Restricted: incident')).toBeTruthy()
    expect(within(restricted as HTMLElement).getByText('Restricted note: not shown to your role.')).toBeTruthy()
    expect(within(restricted as HTMLElement).queryByText(/Synthetic Office/)).toBeNull()
    // The new note's class is internal unless chosen; a note is never customer-shared.
    const select = within(notes).getByLabelText('Visibility') as HTMLSelectElement
    expect(select.value).toBe('internal_operational')
    expect([...select.options].map((o) => o.value)).not.toContain('customer_shared')
    expect(within(notes).getByText('Never write passwords, access codes or card numbers in a note.')).toBeTruthy()
  })

  it('[HH-ID-02][T21] a possible duplicate is a labelled suggestion; dismissing needs a reason and sends the version', async () => {
    const write = vi.fn((url: string) => (url.endsWith('/dismiss') ? json(200, { id: 'm-1', version: 2 }) : undefined))
    const fetchImpl = api(detail(), write)
    renderRecord(fetchImpl)
    const box = await screen.findByRole('region', { name: 'Possible duplicates' })
    expect(within(box).getByText(/Suggestions only: a shared email, phone or address is never proof/)).toBeTruthy()
    const item = within(box).getByRole('listitem', { name: 'Possible duplicate: Synthetic Neighbour' })
    expect(within(item).getByText('Shares: Same email, Same name')).toBeTruthy()
    expect(within(item).getByText('Waiting for review')).toBeTruthy()
    expect(within(box).queryByRole('button', { name: /merge/i })).toBeNull()
    fireEvent.change(within(item).getByLabelText(/Reason/), { target: { value: 'Landlord and tenant' } })
    fireEvent.click(within(item).getByRole('button', { name: 'Not the same customer' }))
    await waitFor(() => expect(write).toHaveBeenCalled())
    const [url, init] = write.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`/api/v1/staff/customers/${ID}/candidates/m-1/dismiss`)
    expect(JSON.parse(String(init.body))).toEqual({ reason: 'Landlord and tenant' })
    expect((init.headers as Record<string, string>)['if-match']).toBe('"1"')
  })

  it('[HH-CRM-01][HH-ID-02] a role without suggestions or edits sees neither', async () => {
    renderRecord(
      api(
        detail({
          candidates: { visible: false, items: [] },
          actions: {
            edit: false,
            addNote: false,
            recordWithdrawal: false,
            reviewCandidates: false,
            merge: false,
            relink: false,
            reverseLinks: false,
            noteVisibilities: [],
          },
        }),
      ),
    )
    await screen.findByRole('heading', { level: 1, name: 'Customer Synthetic Customer' })
    expect(screen.queryByRole('region', { name: 'Possible duplicates' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit contact' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add note' })).toBeNull()
    expect(screen.queryByLabelText('Visibility')).toBeNull()
  })

  it('[HH-CRM-01][RULE-LANGUAGES] Spanish staff see the record in Spanish; the stored values stay as they are', async () => {
    renderRecord(api(), 'es')
    await screen.findByRole('heading', { level: 1, name: 'Cliente Synthetic Customer' })
    expect(screen.getByRole('region', { name: 'Posibles duplicados' })).toBeTruthy()
    expect(screen.getAllByText('Restringida: incidente').length).toBeGreaterThan(0)
    expect(screen.getByText('Nota restringida: no se muestra a su función.')).toBeTruthy()
    expect(screen.getByText('Synthetic internal note')).toBeTruthy()
  })
})

describe('the customers list (TSK-0044, HH-CRM-01)', () => {
  it('[HH-CRM-01][HH-ID-02] searches on the server and shows open suggestions as a count, never as a link', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      json(200, {
        items: [
          {
            id: ID,
            displayName: 'Synthetic Customer',
            status: 'active',
            createdAt: '2026-10-20T14:00:00.000Z',
            contactName: 'Synthetic Customer',
            email: 'synthetic@example.test',
            phone: '+15025550144',
            city: 'Testville',
            projects: 1,
            possibleDuplicates: url.includes('q=') ? 1 : 0,
          },
        ],
        nextCursor: null,
      }),
    )
    const { t } = staffTranslator('en')
    render(
      <CustomersScreen
        t={t}
        locale="en"
        fetchImpl={fetchImpl as unknown as typeof fetch}
        go={vi.fn()}
        href={(to) => `/staff${to}`}
      />,
    )
    await screen.findByRole('heading', { level: 2, name: 'Synthetic Customer' })
    expect(screen.queryByText('1 possible duplicate')).toBeNull()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search customers' }), {
      target: { value: 'synthetic@example.test' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    await screen.findByText('1 possible duplicate')
    expect(String(fetchImpl.mock.calls.at(-1)?.[0])).toBe('/api/v1/staff/customers?q=synthetic%40example.test')
    expect(screen.getByRole('link', { name: 'Open customer' }).getAttribute('href')).toBe(`/staff/customers/${ID}`)
  })
})
