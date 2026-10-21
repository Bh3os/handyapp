// The audit-log screen in the staff app (TSK-0098; HH-STAFF-08, HH-SEC-06, OWN-DEC-123, OWN-DEC-142). The API is a
// synthetic stand-in (RULE-SYNTHETIC-DATA): names, records and requests are test inputs, not business facts. The
// server decides visibility; these tests check the screen shows what it is given and sends the filters.
import { staffTranslator } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { auditQuery, AuditLogScreen, type AuditEntry, type AuditOverview } from '../src/AuditLog'

afterEach(cleanup)

const OWNER = '11111111-1111-4111-8111-111111111111'
const ANN = '22222222-2222-4222-8222-222222222222'
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const overview = (over: Partial<AuditOverview> = {}): AuditOverview => ({
  visibility: 'all',
  timeZone: 'America/Kentucky/Louisville',
  retention: {
    state: 'CONFIGURED',
    years: 7,
    afterPeriod: 'owner_deletion_review',
    automaticDeletion: false,
    holdsKeepRecords: true,
    version: 1,
    sourceIds: ['OWN-DEC-142', 'OQ-RETENTION-REVIEW'],
    awaitingConfirmation: true,
    pastPeriod: 0,
    oldestAt: '2026-10-01T15:00:00.000Z',
  },
  staff: [
    { id: OWNER, name: 'Synthetic Owner' },
    { id: ANN, name: 'Synthetic Ann' },
  ],
  ...over,
})
const entry = (over: Partial<AuditEntry> = {}): AuditEntry => ({
  id: '33333333-3333-4333-8333-333333333333',
  seq: '42',
  occurredAt: '2026-10-02T15:00:00.000Z',
  actor: { kind: 'staff', staffUserId: OWNER, name: 'Synthetic Owner', roles: ['owner'], process: null },
  action: 'staff.grant_role',
  area: 'staff',
  target: { type: 'staff_user', id: ANN, version: 3 },
  result: 'succeeded',
  reason: 'Synthetic grant',
  stepUpUsed: true,
  requestId: 'req-synthetic-1',
  changes: [
    { path: 'name', value: 'estimator' },
    { path: 'from', value: null },
    { path: 'accessCode', value: '[REDACTED]' },
  ],
  ...over,
})

function api(over: { overview?: AuditOverview; pages?: { items: AuditEntry[]; nextCursor: string | null }[] } = {}) {
  const pages = over.pages ?? [{ items: [entry()], nextCursor: null }]
  let page = 0
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith('/staff/audit-log')) return json(200, over.overview ?? overview())
    if (url.includes('/staff/audit-events')) {
      if (url.includes('from=2026-12-01')) return json(400, { error: { code: 'VALIDATION_FAILED', fieldErrors: [] } })
      return json(200, pages[Math.min(page++, pages.length - 1)])
    }
    return json(404, { error: { code: 'NOT_FOUND', fieldErrors: [] } })
  })
}

const t = staffTranslator('en').t

describe('audit-log screen (TSK-0098, HH-STAFF-08)', () => {
  it('[HH-STAFF-08][HH-SEC-06] shows who, when, the record, the reason and the redacted change summary', async () => {
    render(<AuditLogScreen t={t} locale="en" fetchImpl={api() as unknown as typeof fetch} />)
    const item = await screen.findByRole('listitem', { name: /Staff and sign-in: staff\.grant_role/ })
    expect(within(item).getByText('By: Synthetic Owner')).toBeTruthy()
    expect(within(item).getByText('Roles used: Owner')).toBeTruthy()
    expect(within(item).getByText(`Record: staff_user ${ANN}, version 3`)).toBeTruthy()
    expect(within(item).getByText('Reason: Synthetic grant')).toBeTruthy()
    expect(within(item).getByText('Fresh sign-in')).toBeTruthy()
    expect(within(item).getByText('Succeeded')).toBeTruthy()
    expect(within(item).getByText(/^When: /)).toBeTruthy()
    expect(within(item).getByText('[REDACTED]')).toBeTruthy()
    expect(within(item).getByText('none')).toBeTruthy()
    // Nothing to edit or delete: entries are append-only.
    expect(within(item).queryByRole('button')).toBeNull()
    expect(screen.getByText('You see every recorded action.')).toBeTruthy()
  })

  it('[HH-SEC-06] shows the retention rule as configured and the entries due for the owner review', async () => {
    render(
      <AuditLogScreen
        t={t}
        locale="en"
        fetchImpl={
          api({
            overview: overview({ retention: { ...overview().retention, pastPeriod: 2 } }),
          }) as unknown as typeof fetch
        }
      />,
    )
    expect(await screen.findByText(/Entries are kept 7 years, then go to the owner's deletion review/)).toBeTruthy()
    expect(screen.getByText('The retention periods await CPA and attorney confirmation.')).toBeTruthy()
    expect(
      screen.getByText("2 entries are past the retention period and due for the owner's deletion review."),
    ).toBeTruthy()
    expect(screen.getByText('Dates and times are in America/Kentucky/Louisville.')).toBeTruthy()
  })

  it('[HH-SEC-06] a missing retention period is NOT CONFIGURED, never a default', async () => {
    const r = overview().retention
    render(
      <AuditLogScreen
        t={t}
        locale="en"
        fetchImpl={
          api({
            overview: overview({
              retention: { ...r, state: 'NOT_CONFIGURED', years: null, afterPeriod: null, version: null },
            }),
          }) as unknown as typeof fetch
        }
      />,
    )
    expect(await screen.findByText('The retention period is not configured. Nothing is deleted.')).toBeTruthy()
    expect(screen.queryByText(/Entries are kept/)).toBeNull()
  })

  it('[HH-STAFF-08] Office: their own actions, no "who" filter and no review counts', async () => {
    render(
      <AuditLogScreen
        t={t}
        locale="en"
        fetchImpl={
          api({
            overview: overview({
              visibility: 'own',
              staff: [],
              retention: { ...overview().retention, pastPeriod: null, oldestAt: null },
            }),
          }) as unknown as typeof fetch
        }
      />,
    )
    expect(await screen.findByText(/You see the actions you performed yourself/)).toBeTruthy()
    expect(screen.queryByLabelText('Who')).toBeNull()
    expect(screen.queryByText(/past the retention period/)).toBeNull()
  })

  it('[HH-STAFF-08] sends the filters to the server and pages with the cursor', async () => {
    const fetchImpl = api({
      pages: [
        { items: [entry()], nextCursor: 'c1' },
        { items: [entry({ id: '44444444-4444-4444-8444-444444444444', action: 'staff.disable' })], nextCursor: null },
        { items: [], nextCursor: null },
      ],
    })
    render(<AuditLogScreen t={t} locale="en" fetchImpl={fetchImpl as unknown as typeof fetch} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Show more' }))
    expect(await screen.findByText('staff.disable')).toBeTruthy()
    expect(fetchImpl.mock.calls.map((c) => String(c[0]))).toContain('/api/v1/staff/audit-events?cursor=c1')
    fireEvent.change(await screen.findByLabelText('Who'), { target: { value: ANN } })
    fireEvent.change(screen.getByLabelText('Area'), { target: { value: 'staff' } })
    fireEvent.change(screen.getByLabelText('Result'), { target: { value: 'denied' } })
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Show entries' }))
    await waitFor(() =>
      expect(fetchImpl.mock.calls.map((c) => String(c[0]))).toContain(
        `/api/v1/staff/audit-events?area=staff&result=denied&actor=${ANN}&from=2026-10-01`,
      ),
    )
    expect(await screen.findByText('No entries match.')).toBeTruthy()
  })

  it('[HH-API-03] a refused filter says so', async () => {
    render(<AuditLogScreen t={t} locale="en" fetchImpl={api() as unknown as typeof fetch} />)
    await screen.findByText('staff.grant_role')
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-12-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Show entries' }))
    expect(await screen.findByText(/A filter is not valid/)).toBeTruthy()
  })

  it('[HH-STAFF-08] the query holds only the filters that are set', () => {
    expect(auditQuery({ area: '', result: '', actor: '', targetType: '', targetId: '', from: '', to: '' })).toBe(
      '/staff/audit-events',
    )
    expect(
      auditQuery({ area: '', result: '', actor: '', targetType: 'visit', targetId: ' v1 ', from: '', to: '' }, 'c2'),
    ).toBe('/staff/audit-events?targetType=visit&targetId=v1&cursor=c2')
  })

  it('[HH-LANG-02] renders in Spanish', async () => {
    render(<AuditLogScreen t={staffTranslator('es').t} locale="es" fetchImpl={api() as unknown as typeof fetch} />)
    expect(await screen.findByText('Ve todas las acciones registradas.')).toBeTruthy()
    expect(await screen.findByText('Por: Synthetic Owner')).toBeTruthy()
  })
})
