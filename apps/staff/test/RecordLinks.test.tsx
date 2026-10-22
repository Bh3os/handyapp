// Human-reviewed merges and relinks in the staff app (TSK-0046; HH-CRM-04, HH-ID-02, T21, T29, RULE-LANGUAGES). The
// API is a synthetic stand-in (RULE-SYNTHETIC-DATA).
import { staffTranslator } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { routeOf } from '../src/App'
import { CustomerRecord, type CustomerDetail } from '../src/Customers'
import {
  MergeReview,
  RelinkRequest,
  type MergePreview,
  type RecordSummary,
  type RelinkPreview,
} from '../src/RecordLinks'

afterEach(cleanup)

const A = '33333333-3333-4333-8333-333333333333'
const B = '44444444-4444-4444-8444-444444444444'
const REQUEST = '55555555-5555-4555-8555-555555555555'
const DIGEST = 'a'.repeat(64)
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function summary(id: string, name: string, reference: string): RecordSummary {
  return {
    id,
    displayName: name,
    status: 'active',
    version: 1,
    createdAt: '2026-10-20T14:00:00.000Z',
    contacts: [
      {
        id: `c-${id}`,
        customerId: id,
        fullName: name,
        email: 'synthetic-links@example.test',
        phone: '+15025550146',
        verification: { email: 'verified', phone: 'unverified' },
      },
    ],
    properties: [
      {
        id: `p-${id}`,
        customerId: id,
        street: '1 Synthetic Way',
        unit: null,
        city: 'Testville',
        state: 'KY',
        zip: '40046',
      },
    ],
    projects: [
      {
        id: `pr-${id}`,
        reference,
        state: 'open',
        customerId: id,
        requests: [{ id: `r-${id}`, reference, state: 'received', submittedAt: '2026-10-20T14:00:00.000Z' }],
      },
    ],
    access: { liveGrants: 1, liveSessions: 0 },
  }
}
const merge = (over: Partial<MergePreview> = {}): MergePreview => ({
  source: summary(A, 'Synthetic Duplicate', 'HH-7K2M9Q4D'),
  survivor: summary(B, 'Synthetic Survivor', 'HH-8K2M9Q4E'),
  suggestion: { id: 'm-1', status: 'open', reasons: ['email', 'phone'] },
  documents: { state: 'not_available' },
  payments: { state: 'not_available' },
  blocked: null,
  previewDigest: DIGEST,
  ...over,
})
const tr = (locale: 'en' | 'es' = 'en') => staffTranslator(locale).t

describe('the merge review (TSK-0046, HH-CRM-04)', () => {
  it('[HH-CRM-04][T29] shows both records with projects, documents and payments, and confirms with the reason and the digest', async () => {
    const go = vi.fn()
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return json(200, { linkId: 'l-1', access: {} })
      return json(200, merge())
    })
    render(
      <MergeReview
        t={tr()}
        locale="en"
        fetchImpl={fetchImpl as unknown as typeof fetch}
        id={A}
        into={B}
        go={go}
        href={(to) => `/staff${to}`}
      />,
    )
    await screen.findByRole('heading', { level: 1, name: 'Review merge' })
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(`/api/v1/staff/customers/${A}/merge-preview?into=${B}`)
    expect(screen.getByText(/Nothing is merged automatically/)).toBeTruthy()
    const source = screen.getByRole('region', { name: 'Record to merge: Synthetic Duplicate' })
    expect(within(source).getByText(/Project HH-7K2M9Q4D/)).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Record that stays: Synthetic Survivor' })).toBeTruthy()
    expect(screen.getAllByText('Not available yet: these records are added in a later release.')).toHaveLength(2)
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'Same person, two requests' } })
    fireEvent.click(screen.getByRole('button', { name: 'Merge records' }))
    await waitFor(() => expect(go).toHaveBeenCalledWith(`/customers/${B}`))
    const [url, init] = fetchImpl.mock.calls.find((c) => c[1]?.method === 'POST') as unknown as [string, RequestInit]
    expect(url).toBe(`/api/v1/staff/customers/${A}/merge`)
    expect(JSON.parse(String(init.body))).toEqual({
      survivorId: B,
      reason: 'Same person, two requests',
      previewDigest: DIGEST,
    })
    expect((init.headers as Record<string, string>)['idempotency-key']).toMatch(/^staff-/)
  })

  it('[HH-CRM-04] a stale preview is refused and shown again; a blocked pair has no confirmation; the records can be swapped', async () => {
    let posted = 0
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posted++
        return json(409, { error: { code: 'CONFLICT', fieldErrors: [{ field: 'state', code: 'PREVIEW_STALE' }] } })
      }
      return json(200, url.includes(`/customers/${B}/`) ? merge({ blocked: 'CUSTOMER_MERGED' }) : merge())
    })
    render(
      <MergeReview
        t={tr()}
        locale="en"
        fetchImpl={fetchImpl as unknown as typeof fetch}
        id={A}
        into={B}
        go={vi.fn()}
        href={(to) => `/staff${to}`}
      />,
    )
    await screen.findByRole('button', { name: 'Merge records' })
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'Same person' } })
    fireEvent.click(screen.getByRole('button', { name: 'Merge records' }))
    await screen.findByText('The records changed since this preview. Check the updated preview and confirm again.')
    expect(posted).toBe(1)
    expect(fetchImpl.mock.calls.filter((c) => !c[1]?.method || c[1].method === 'GET').length).toBeGreaterThan(1)
    fireEvent.click(screen.getByRole('button', { name: 'Keep the other record instead' }))
    await screen.findByText('One of these records is already merged into another one.')
    expect(screen.queryByRole('button', { name: 'Merge records' })).toBeNull()
    expect(String(fetchImpl.mock.calls.at(-1)?.[0])).toBe(`/api/v1/staff/customers/${B}/merge-preview?into=${A}`)
  })

  it('[HH-CRM-04][RULE-LANGUAGES] Spanish staff review the merge in Spanish', async () => {
    const fetchImpl = vi.fn(async () => json(200, merge()))
    render(
      <MergeReview
        t={tr('es')}
        locale="es"
        fetchImpl={fetchImpl as unknown as typeof fetch}
        id={A}
        into={B}
        go={vi.fn()}
        href={(to) => `/staff${to}`}
      />,
    )
    await screen.findByRole('heading', { level: 1, name: 'Revisar combinación' })
    expect(screen.getByRole('button', { name: 'Combinar registros' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Registro que permanece: Synthetic Survivor' })).toBeTruthy()
  })
})

describe('linking a request to another customer (TSK-0046, HH-CRM-04, OWN-DEC-116)', () => {
  it('[HH-CRM-04][T29] finds the customer, shows the preview with a correction notice, and confirms with the reason', async () => {
    const go = vi.fn()
    const preview: RelinkPreview = {
      request: { id: REQUEST, reference: 'HH-9K2M9Q4F', state: 'received' },
      project: { id: 'pr-x', reference: 'HH-9K2M9Q4F', state: 'open' },
      original: { id: A, displayName: 'Synthetic Tenant' },
      from: summary(A, 'Synthetic Tenant', 'HH-9K2M9Q4F'),
      to: summary(B, 'Synthetic Landlord', 'HH-8K2M9Q4E'),
      correction: true,
      revokes: { grants: 1, sessions: 2 },
      documents: { state: 'not_available' },
      payments: { state: 'not_available' },
      blocked: null,
      previewDigest: DIGEST,
    }
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return json(200, { linkId: 'l-2', access: {} })
      if (url.includes('/staff/customers?q='))
        return json(200, {
          items: [
            { id: B, displayName: 'Synthetic Landlord', status: 'active', email: 'x@example.test', city: 'Testville' },
          ],
          nextCursor: null,
        })
      return json(200, preview)
    })
    render(
      <RelinkRequest
        t={tr()}
        locale="en"
        fetchImpl={fetchImpl as unknown as typeof fetch}
        requestId={REQUEST}
        go={go}
        href={(to) => `/staff${to}`}
      />,
    )
    expect(screen.getByText(/The requester never gets access to that customer's other projects/)).toBeTruthy()
    fireEvent.change(screen.getByRole('searchbox', { name: /Find the customer/ }), { target: { value: 'Landlord' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Choose Synthetic Landlord' }))
    await screen.findByText('Sent under: Synthetic Tenant', { exact: false })
    expect(String(fetchImpl.mock.calls.at(-1)?.[0])).toBe(`/api/v1/staff/requests/${REQUEST}/relink-preview?to=${B}`)
    expect(
      screen.getByText('This corrects an earlier link: 1 guest link and 2 sessions issued since then will be revoked.'),
    ).toBeTruthy()
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'Linked to the wrong customer' } })
    fireEvent.click(screen.getByRole('button', { name: 'Link the request' }))
    await waitFor(() => expect(go).toHaveBeenCalledWith(`/customers/${B}`))
    const [url, init] = fetchImpl.mock.calls.find((c) => c[1]?.method === 'POST') as unknown as [string, RequestInit]
    expect(url).toBe(`/api/v1/staff/requests/${REQUEST}/relink`)
    expect(JSON.parse(String(init.body))).toEqual({
      customerId: B,
      reason: 'Linked to the wrong customer',
      previewDigest: DIGEST,
    })
  })
})

function record(over: Partial<CustomerDetail> = {}): CustomerDetail {
  return {
    id: B,
    displayName: 'Synthetic Survivor',
    status: 'active',
    mergedIntoId: null,
    mergedInto: null,
    provenance: 'request_submission',
    language: 'en',
    createdAt: '2026-10-20T14:00:00.000Z',
    version: 1,
    contacts: [
      {
        id: 'c-own',
        customerId: B,
        fullName: 'Synthetic Survivor',
        email: 'survivor@example.test',
        phone: '+15025550146',
        preferredChannel: 'email',
        timeZone: { state: 'unknown', zone: null, family: null },
        isPrimary: true,
        version: 1,
        verification: { email: 'verified', phone: 'unverified' },
        permissions: {
          sms: { state: 'none', since: null },
          marketingEmail: { state: 'none', since: null },
          marketingSms: { state: 'none', since: null },
        },
        consentHistory: [],
      },
      {
        id: 'c-merged',
        customerId: A,
        fullName: 'Synthetic Duplicate',
        email: 'duplicate@example.test',
        phone: '+15025550146',
        preferredChannel: 'email',
        timeZone: { state: 'unknown', zone: null, family: null },
        isPrimary: true,
        version: 1,
        verification: { email: 'unverified', phone: 'unverified' },
        permissions: {
          sms: { state: 'none', since: null },
          marketingEmail: { state: 'none', since: null },
          marketingSms: { state: 'none', since: null },
        },
        consentHistory: [],
      },
    ],
    properties: [],
    projects: [
      {
        id: 'pr-a',
        reference: 'HH-7K2M9Q4D',
        state: 'open',
        createdAt: '2026-10-20T14:00:00.000Z',
        customerId: A,
        currentCustomerId: B,
        requests: [],
      },
    ],
    documents: { state: 'not_available' },
    payments: { state: 'not_available' },
    notes: [],
    candidates: {
      visible: true,
      items: [
        {
          id: 'm-2',
          version: 1,
          customer: { id: A, displayName: 'Synthetic Other', status: 'active' },
          reasons: ['phone'],
          status: 'open',
          detectedAt: '2026-10-20T14:01:00.000Z',
          lastReview: null,
        },
      ],
    },
    links: [
      {
        id: 'l-1',
        kind: 'merge',
        state: 'current',
        from: { id: A, displayName: 'Synthetic Duplicate' },
        to: { id: B, displayName: 'Synthetic Survivor' },
        requestReference: null,
        reason: 'Same person, two requests',
        by: { id: 's-1', name: 'Synthetic Office' },
        at: '2026-10-20T15:00:00.000Z',
        correction: false,
        access: { grantsRevoked: 0, sessionsRevoked: 0, projectsAdded: 0 },
        reversal: null,
      },
      {
        id: 'l-0',
        kind: 'request_relink',
        state: 'reversed',
        from: { id: A, displayName: 'Synthetic Duplicate' },
        to: { id: B, displayName: 'Synthetic Survivor' },
        requestReference: 'HH-7K2M9Q4D',
        reason: 'Earlier link',
        by: { id: 's-1', name: 'Synthetic Office' },
        at: '2026-10-20T14:30:00.000Z',
        correction: false,
        access: { grantsRevoked: 0, sessionsRevoked: 0, projectsAdded: 0 },
        reversal: {
          by: { id: 's-2', name: 'Synthetic Owner' },
          at: '2026-10-20T14:40:00.000Z',
          reason: 'Not this customer',
          access: { grantsRevoked: 1, sessionsRevoked: 1, projectsAdded: 0 },
        },
      },
    ],
    timeline: [],
    timelineTruncated: false,
    actions: {
      edit: true,
      addNote: true,
      recordWithdrawal: true,
      reviewCandidates: true,
      merge: true,
      relink: true,
      reverseLinks: true,
      noteVisibilities: ['internal_operational'],
    },
    ...over,
  }
}
function renderRecord(view: CustomerDetail, write?: (url: string, init: RequestInit) => Response) {
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) =>
    init?.method && init.method !== 'GET' ? (write?.(url, init) ?? json(500, {})) : json(200, view),
  )
  render(
    <CustomerRecord
      t={tr()}
      locale="en"
      fetchImpl={fetchImpl as unknown as typeof fetch}
      id={view.id}
      go={vi.fn()}
      href={(to) => `/staff${to}`}
    />,
  )
  return fetchImpl
}

describe('merges and relinks on the customer record (TSK-0046, HH-CRM-04)', () => {
  it('[HH-CRM-04][HH-ID-02] a suggestion opens the merge review (a link, never a merge); merged-in records are labelled and read-only', async () => {
    renderRecord(record())
    const box = await screen.findByRole('region', { name: 'Possible duplicates' })
    expect(within(box).queryByRole('button', { name: /merge/i })).toBeNull()
    expect(within(box).getByRole('link', { name: 'Review merge' }).getAttribute('href')).toBe(
      `/staff/customers/${B}/merge?into=${A}`,
    )
    const merged = screen.getByRole('article', { name: 'Synthetic Duplicate' })
    expect(within(merged).getByText(/From a record merged into this one/)).toBeTruthy()
    expect(within(merged).queryByRole('button', { name: 'Edit contact' })).toBeNull()
    expect(
      within(screen.getByRole('article', { name: 'Synthetic Survivor' })).getByRole('button', { name: 'Edit contact' }),
    ).toBeTruthy()
    const projects = screen.getByRole('region', { name: 'Projects and requests' })
    expect(within(projects).getByText(/Linked to this customer from another record/)).toBeTruthy()
  })

  it('[T29][HH-CRM-04] the Owner reverses a current link with a reason; a reversed link shows its reversal and no action', async () => {
    const write = vi.fn((url: string) =>
      url.endsWith('/reverse') ? json(200, { linkId: 'l-1', access: {} }) : json(500, {}),
    )
    renderRecord(record(), write)
    const history = await screen.findByRole('region', { name: 'Merges and relinks' })
    const current = within(history).getByRole('listitem', {
      name: 'Synthetic Duplicate merged into Synthetic Survivor',
    })
    expect(within(current).getByText('In effect')).toBeTruthy()
    expect(within(current).getByText(/Same person, two requests/)).toBeTruthy()
    const reversed = within(history).getByRole('listitem', {
      name: 'Request HH-7K2M9Q4D linked from Synthetic Duplicate to Synthetic Survivor',
    })
    expect(within(reversed).getByText(/Reversed by Synthetic Owner/)).toBeTruthy()
    expect(within(reversed).getByText(/1 guest link and 1 session revoked/)).toBeTruthy()
    expect(within(reversed).queryByRole('button', { name: 'Reverse' })).toBeNull()
    fireEvent.change(within(current).getByLabelText(/Reason/), { target: { value: 'Not the same person' } })
    fireEvent.click(within(current).getByRole('button', { name: 'Reverse' }))
    await waitFor(() => expect(write).toHaveBeenCalled())
    const [url, init] = write.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/v1/staff/customer-links/l-1/reverse')
    expect(JSON.parse(String(init.body))).toEqual({ reason: 'Not the same person' })
  })

  it('[HH-CRM-04][RULE-SERVER-AUTHZ] Office sees the history but cannot reverse; a merged record points to its survivor', async () => {
    renderRecord(
      record({
        id: A,
        displayName: 'Synthetic Duplicate',
        status: 'merged',
        mergedIntoId: B,
        mergedInto: { id: B, displayName: 'Synthetic Survivor' },
        actions: { ...record().actions, edit: false, merge: false, reverseLinks: false },
      }),
    )
    await screen.findByText('This record was merged into another one and is no longer edited.')
    const banner = screen.getByText('Merged into:').closest('p') as HTMLElement
    expect(within(banner).getByRole('link', { name: 'Synthetic Survivor' }).getAttribute('href')).toBe(
      `/staff/customers/${B}`,
    )
    expect(screen.getByRole('region', { name: 'Merges and relinks' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Reverse' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Review merge' })).toBeNull()
  })

  it('[HH-CRM-04] the merge and relink steps have their own addresses', () => {
    expect(routeOf(`/staff/customers/${A}/merge?into=${B}`, '/staff/')).toEqual({
      page: 'record-step',
      screen: 'customers',
      id: A,
      step: 'merge',
      params: { into: B },
    })
    expect(routeOf(`/staff/requests/${REQUEST}/relink`, '/staff/')).toMatchObject({
      page: 'record-step',
      screen: 'requests',
      id: REQUEST,
      step: 'relink',
    })
  })
})
