// The retention reviews screen in the staff app (TSK-0099; HH-PRIV-01, HH-DATA-09, ENT-RetentionReview, OWN-DEC-70,
// OQ-RETENTION-REVIEW; TSK-0100: HH-PRIV-05 Delete or Archive and the deletion log). The API is a synthetic stand-in (RULE-SYNTHETIC-DATA): references and dates are test inputs,
// not business facts; the periods shown are whatever the server sends.
import { staffTranslator } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  RetentionScreen,
  reviewsQuery,
  type DeletionLogItem,
  type DeletionPreview,
  type RetentionOverview,
  type ReviewEntry,
} from '../src/Retention'

afterEach(cleanup)

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const category = (id: string, over: Partial<RetentionOverview['categories'][number]> = {}) => ({
  id,
  configKey: `retention.${id}`,
  scan: 'scanned' as const,
  state: 'CONFIGURED' as const,
  years: 2,
  after: 'request_closed',
  version: 1,
  sourceIds: ['OWN-DEC-70', 'OQ-RETENTION-REVIEW'],
  entries: 1,
  ...over,
})

const overview = (over: Partial<RetentionOverview> = {}): RetentionOverview => ({
  automaticDeletion: false,
  awaitingConfirmation: true,
  timeZone: 'America/Kentucky/Louisville',
  categories: [
    category('requests_not_converted'),
    category('job_records', { scan: 'start_not_recorded', years: 7, after: 'job_closeout', entries: 0 }),
    category('audit_log', { state: 'NOT_CONFIGURED', years: null, after: null, entries: 0 }),
    category('not_scheduled', {
      configKey: null,
      scan: 'no_period',
      state: null,
      years: null,
      after: null,
      version: null,
      entries: 0,
    }),
  ],
  lastScanAt: '2026-10-21T00:00:05.000Z',
  nextScanAt: '2026-10-22T00:00:00.000Z',
  entries: 1,
  ...over,
})

const NOT_RECORDED = [
  'complaints',
  'warranties',
  'disputes',
  'claims',
  'investigations',
  'unfiled_tax_returns',
  'legal_holds',
  'insurance_holds',
].map((check) => ({ check, result: 'not_recorded' as const }))

const entry = (over: Partial<ReviewEntry> = {}): ReviewEntry => ({
  id: '44444444-4444-4444-8444-444444444444',
  seq: '7',
  category: 'requests_not_converted',
  record: {
    type: 'request',
    id: '55555555-5555-4555-8555-555555555555',
    reference: 'HH-SYNTH-0001',
    projectId: '66666666-6666-4666-8666-666666666666',
  },
  retentionStartedAt: '2024-10-01T15:00:00.000Z',
  periodEndsAt: '2026-10-01T15:00:00.000Z',
  years: 2,
  policy: { key: 'retention.requests_not_converted', version: 1 },
  holdChecks: [{ check: 'open_holds', result: 'found', count: 1 }, ...NOT_RECORDED],
  holdsFound: true,
  openedAt: '2026-10-21T00:00:05.000Z',
  openedBy: 'system.retention',
  ...over,
})

function api(pages: { items: ReviewEntry[]; nextCursor: string | null }[] = [{ items: [entry()], nextCursor: null }]) {
  let page = 0
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith('/staff/retention')) return json(200, overview())
    if (url.includes('/staff/deletions')) return json(200, { items: [], nextCursor: null })
    if (url.includes('/staff/retention-reviews')) {
      if (url.includes('category=audit_log')) return json(200, { items: [], nextCursor: null })
      return json(200, pages[Math.min(page++, pages.length - 1)])
    }
    return json(404, { error: { code: 'NOT_FOUND', fieldErrors: [] } })
  })
}

const t = staffTranslator('en').t

describe('retention reviews screen (TSK-0099, HH-PRIV-01)', () => {
  it('[HH-PRIV-01][HH-DATA-09] shows the schedule as configured and says nothing is deleted automatically', async () => {
    render(<RetentionScreen t={t} locale="en" fetchImpl={api() as unknown as typeof fetch} />)
    expect(await screen.findByText('The retention periods await CPA and attorney confirmation.')).toBeTruthy()
    expect(screen.getByText(/^Records whose retention period has ended wait here for your review\./)).toBeTruthy()
    expect(screen.getByText(/Nothing is deleted automatically/)).toBeTruthy()
    const schedule = screen.getByRole('list', { name: 'Retention schedule' })
    const requests = within(schedule).getByRole('listitem', { name: 'Requests that never became jobs' })
    expect(within(requests).getByText('2 years after the request closed, then your deletion review.')).toBeTruthy()
    expect(within(requests).getByText('Checked daily')).toBeTruthy()
    expect(within(requests).getByText('1 entry waiting')).toBeTruthy()
    const jobs = within(schedule).getByRole('listitem', { name: /^Job photos/ })
    expect(within(jobs).getByText('Not tracked yet: the start of the period is not recorded')).toBeTruthy()
    const audit = within(schedule).getByRole('listitem', { name: 'Audit-log records' })
    expect(within(audit).getByText('Not configured: nothing is reviewed or deleted.')).toBeTruthy()
    const other = within(schedule).getByRole('listitem', { name: 'Data the schedule does not name' })
    expect(
      within(other).getByText('Not configured: the schedule has no row for this data. Nothing is deleted.'),
    ).toBeTruthy()
    expect(screen.getByText(/^Last daily review: /)).toBeTruthy()
  })

  it('[HH-PRIV-01][HH-DATA-09] lists each entry with its hold checks; its only control opens the decision', async () => {
    render(<RetentionScreen t={t} locale="en" fetchImpl={api() as unknown as typeof fetch} />)
    const list = await screen.findByRole('list', { name: 'Review entries' })
    const item = within(list).getByRole('listitem', { name: 'Request: HH-SYNTH-0001' })
    expect(within(item).getByText('Hold found: deletion is blocked')).toBeTruthy()
    expect(within(item).getByText('Category: Requests that never became jobs')).toBeTruthy()
    expect(within(item).getByText('2 years under retention.requests_not_converted, version 1')).toBeTruthy()
    expect(within(item).getByText('1 found: deletion is blocked')).toBeTruthy()
    expect(within(item).getAllByText('Not recorded in the software: check before deciding')).toHaveLength(8)
    // Nothing is decided from the list itself: one button opens the confirmation.
    expect(
      within(list)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Delete, archive or keep…'])
    expect(screen.queryByRole('button', { name: /^(delete|archive|confirm delete)$/i })).toBeNull()
  })

  it('[HH-PRIV-01] filters by category on the server and pages with the cursor', async () => {
    const second = entry({ id: '77777777-7777-4777-8777-777777777777', holdsFound: false, holdChecks: NOT_RECORDED })
    const fetchImpl = api([
      { items: [entry()], nextCursor: 'c1' },
      { items: [{ ...second, record: { ...second.record, reference: 'HH-SYNTH-0002' } }], nextCursor: null },
    ])
    render(<RetentionScreen t={t} locale="en" fetchImpl={fetchImpl as unknown as typeof fetch} />)
    await screen.findByRole('listitem', { name: 'Request: HH-SYNTH-0001' })
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }))
    const added = await screen.findByRole('listitem', { name: 'Request: HH-SYNTH-0002' })
    expect(within(added).getByText('Awaiting your review')).toBeTruthy()
    expect(fetchImpl.mock.calls.map((c) => String(c[0])).some((u) => u.includes('cursor=c1'))).toBe(true)

    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'audit_log' } })
    fireEvent.click(screen.getByRole('button', { name: 'Show entries' }))
    expect(await screen.findByText('No record is past its retention period.')).toBeTruthy()
    await waitFor(() =>
      expect(fetchImpl.mock.calls.map((c) => String(c[0])).some((u) => u.includes('category=audit_log'))).toBe(true),
    )
  })

  it('[HH-PRIV-01] builds the query string from the category and cursor only', () => {
    expect(reviewsQuery('')).toBe('/staff/retention-reviews')
    expect(reviewsQuery('audit_log', 'abc')).toBe('/staff/retention-reviews?category=audit_log&cursor=abc')
  })

  it('[HH-PRIV-01] TSK-0138: the provisional defaults in years or days, settings history, logs and a batch entry', async () => {
    const categories = [
      category('staff_accounts', { years: 7, after: 'staff_departure', sourceIds: ['OWN-DEC-177'] }),
      category('sessions_and_links', { years: null, days: 30, after: 'expired_or_ended', entries: 1 }),
      category('settings_history', { scan: 'while_referenced', years: null, days: null, after: null, entries: 0 }),
      category('technical_logs', { scan: 'not_stored', years: null, days: 90, after: 'logged', entries: 0 }),
    ]
    const batch = entry({
      category: 'sessions_and_links',
      record: {
        type: 'expired_staff_links',
        id: '88888888-8888-4888-8888-888888888888',
        reference: '2025-01 (2)',
        projectId: null,
      },
      years: null,
      days: 30,
      count: 2,
      policy: { key: 'retention.sessions_and_links', version: 1 },
      holdsFound: false,
      holdChecks: [{ check: 'open_holds', result: 'not_applicable' }, ...NOT_RECORDED],
    })
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/staff/retention')) return json(200, overview({ categories }))
      if (url.includes('/staff/deletions')) return json(200, { items: [], nextCursor: null })
      // TSK-0135: the audit-retention section has its own screen tests (AuditRetention.test.tsx).
      if (url.includes('/staff/audit-retention')) return json(404, { error: { code: 'NOT_FOUND', fieldErrors: [] } })
      return json(200, { items: [batch], nextCursor: null })
    })
    render(<RetentionScreen t={t} locale="en" fetchImpl={fetchImpl as unknown as typeof fetch} />)
    const schedule = await screen.findByRole('list', { name: 'Retention schedule' })
    const staff = within(schedule).getByRole('listitem', { name: 'Staff accounts' })
    expect(
      within(staff).getByText(
        "7 years after the staff member's departure (access ends at once), then your deletion review.",
      ),
    ).toBeTruthy()
    const links = within(schedule).getByRole('listitem', { name: 'Login sessions and access links' })
    expect(
      within(links).getByText('30 days after the session or link expired or ended, then your deletion review.'),
    ).toBeTruthy()
    const history = within(schedule).getByRole('listitem', { name: 'Settings and content history' })
    expect(within(history).getByText(/^Kept while retained records depend on it;/)).toBeTruthy()
    expect(within(history).queryByText(/entr(y|ies) waiting/)).toBeNull()
    const logs = within(schedule).getByRole('listitem', { name: 'Technical logs' })
    expect(within(logs).getByText(/^Ordinary application logs: 90 days\. The hosting service keeps them/)).toBeTruthy()
    expect(within(logs).getByText("Not stored in the app's database")).toBeTruthy()

    const list = await screen.findByRole('list', { name: 'Review entries' })
    const item = within(list).getByRole('listitem', { name: 'Expired invite and reset links: 2025-01 (2)' })
    expect(within(item).getByText('30 days under retention.sessions_and_links, version 1')).toBeTruthy()
    expect(within(item).getByText('2 records in this entry')).toBeTruthy()
  })

  it('[HH-LANG-02] the screen is fully translated into Spanish', async () => {
    const es = staffTranslator('es').t
    render(<RetentionScreen t={es} locale="es" fetchImpl={api() as unknown as typeof fetch} />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Revisiones de conservación' })).toBeTruthy()
    expect(screen.getByText('2 años desde el cierre de la solicitud; luego, su revisión de eliminación.')).toBeTruthy()
  })
})

const PREVIEW_BASE: DeletionPreview = {
  entry: {
    id: '44444444-4444-4444-8444-444444444444',
    category: 'unaccepted_estimates',
    reference: 'HH-SYNTH-0001-E1',
    periodEndsAt: '2026-10-01T15:00:00.000Z',
  },
  status: { state: 'pending', until: null, decidedAt: null, reason: null },
  early: false,
  target: {
    record: {
      type: 'estimate',
      id: '55555555-5555-4555-8555-555555555555',
      reference: 'HH-SYNTH-0001-E1',
      projectId: null,
    },
    exists: true,
    permanent: true,
    removes: [
      { kind: 'estimate_versions', count: 1 },
      { kind: 'stored_files', count: 1 },
    ],
    keeps: [{ kind: 'project_and_request', count: 1 }],
    checks: [
      { check: 'open_holds', result: 'none_found' },
      { check: 'disputes', result: 'not_recorded' },
    ],
    blockers: [],
    confirm: ['disputes', 'issued_invoices'],
  },
}

const LOGGED: DeletionLogItem = {
  id: '88888888-8888-4888-8888-888888888888',
  seq: '1',
  record: { type: 'estimate', id: '55555555-5555-4555-8555-555555555555', reference: 'HH-SYNTH-0009-E1' },
  source: 'retention_review',
  reason: 'Synthetic: past its period.',
  early: false,
  permanent: true,
  removed: { estimate_versions: 1, stored_files: 1 },
  checksConfirmed: ['disputes'],
  decidedBy: { id: '99999999-9999-4999-8999-999999999999', name: 'Synthetic Owner' },
  decidedAt: '2026-10-21T15:00:00.000Z',
  original: null,
}

/** The decision API: the confirmation, the decision routes, the password re-entry; every call recorded. */
function decisionApi(preview: DeletionPreview, answers: Record<string, () => Response> = {}) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    for (const [suffix, answer] of Object.entries(answers)) if (url.endsWith(suffix)) return answer()
    if (url.endsWith('/staff/retention')) return json(200, overview())
    if (url.endsWith('/deletion')) return json(200, preview)
    if (url.includes('/staff/deletions')) return json(200, { items: [LOGGED], nextCursor: null })
    if (url.includes('/staff/retention-reviews') && (init?.method ?? 'GET') === 'GET')
      return json(200, { items: [entry({ category: 'unaccepted_estimates' })], nextCursor: null })
    return json(404, { error: { code: 'NOT_FOUND', fieldErrors: [] } })
  })
}

describe('the Delete confirmation, Archive and the deletion log (TSK-0100, HH-PRIV-05)', () => {
  it('[HH-PRIV-05] asks "Are you sure you want to delete this entry?" with the reference, what goes, what stays and permanence', async () => {
    const fetchImpl = decisionApi(PREVIEW_BASE, {
      '/delete': () => json(200, { status: { state: 'deleted' }, deletionId: LOGGED.id, blockers: [] }),
    })
    render(<RetentionScreen t={t} locale="en" fetchImpl={fetchImpl as unknown as typeof fetch} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Delete, archive or keep…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Are you sure you want to delete this entry?' })
    expect(await within(dialog).findByText('Estimate: HH-SYNTH-0001-E1')).toBeTruthy()
    expect(within(dialog).getByText(/^Deletion is permanent/)).toBeTruthy()
    expect(within(dialog).getByText('Estimate versions: 1')).toBeTruthy()
    expect(within(dialog).getByText('Stored files: 1')).toBeTruthy()
    expect(within(dialog).getByText('The project and its request: 1')).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeTruthy()
    // Confirm Delete waits for every check the software cannot run, and a reason.
    const confirm = within(dialog).getByRole('button', { name: /^Confirm Delete/ }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    fireEvent.click(within(dialog).getByLabelText('I checked: Disputes (none found)'))
    fireEvent.click(within(dialog).getByLabelText('I checked: Issued invoices (none found)'))
    fireEvent.change(within(dialog).getByLabelText('Reason (required)'), {
      target: { value: 'Synthetic: past its period.' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm Delete' }))
    expect(
      await within(dialog).findByText('Deleted. The deletion log keeps the reference and your reason.'),
    ).toBeTruthy()
    const sent = fetchImpl.mock.calls.find((c) => String(c[0]).endsWith('/delete'))
    expect(JSON.parse(String((sent?.[1] as RequestInit).body))).toEqual({
      reason: 'Synthetic: past its period.',
      confirmedChecks: ['disputes', 'issued_invoices'],
    })
    expect((sent?.[1] as RequestInit & { headers: Record<string, string> }).headers['idempotency-key']).toMatch(
      /^staff-/,
    )
    // The deletion log lists references only.
    const log = screen.getByRole('list', { name: 'Deletion log' })
    expect(within(log).getByText('Estimate: HH-SYNTH-0009-E1')).toBeTruthy()
    expect(within(log).getByText('Reason: Synthetic: past its period.')).toBeTruthy()
  })

  it('[HH-PRIV-05] a blocked deletion says why and offers Archive instead', async () => {
    const blocked: DeletionPreview = {
      ...PREVIEW_BASE,
      target: { ...PREVIEW_BASE.target, blockers: ['protected_evidence'], confirm: [] },
    }
    const fetchImpl = decisionApi(blocked, {
      '/archive': () =>
        json(200, { status: { state: 'archived' }, deletionId: null, blockers: ['protected_evidence'] }),
    })
    render(<RetentionScreen t={t} locale="en" fetchImpl={fetchImpl as unknown as typeof fetch} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Delete, archive or keep…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Are you sure you want to delete this entry?' })
    expect(await within(dialog).findByText('Deletion is blocked. Archive it instead, or keep it longer.')).toBeTruthy()
    expect(
      within(dialog).getByText(
        'It is protected evidence (a signed approval or a job): archive, void or correct it instead.',
      ),
    ).toBeTruthy()
    expect((within(dialog).getByRole('button', { name: /^Confirm Delete/ }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(within(dialog).getByLabelText('Reason (required)'), {
      target: { value: 'Synthetic: approval evidence.' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Archive instead' }))
    expect(await within(dialog).findByText('Archived: the record is kept as it is.')).toBeTruthy()
    expect(fetchImpl.mock.calls.some((c) => String(c[0]).endsWith('/delete'))).toBe(false)
  })

  it('[HH-PRIV-05] Confirm Delete asks for the password again when the sign-in is not fresh, then sends once more', async () => {
    let attempts = 0
    const fetchImpl = decisionApi(PREVIEW_BASE, {
      '/delete': () =>
        ++attempts === 1
          ? json(403, { error: { code: 'FRESH_AUTH_REQUIRED', fieldErrors: [] } })
          : json(200, { status: { state: 'deleted' }, deletionId: LOGGED.id, blockers: [] }),
      '/staff/auth/reauth': () => json(200, { csrfToken: 'synthetic-csrf' }),
    })
    render(<RetentionScreen t={t} locale="en" fetchImpl={fetchImpl as unknown as typeof fetch} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Delete, archive or keep…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Are you sure you want to delete this entry?' })
    await within(dialog).findByText('Estimate: HH-SYNTH-0001-E1')
    fireEvent.click(within(dialog).getByLabelText('I checked: Disputes (none found)'))
    fireEvent.click(within(dialog).getByLabelText('I checked: Issued invoices (none found)'))
    fireEvent.change(within(dialog).getByLabelText('Reason (required)'), { target: { value: 'Synthetic.' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm Delete' }))
    const reauth = await within(dialog).findByTestId('owner-reauth')
    fireEvent.change(within(reauth).getByLabelText('Password'), { target: { value: 'synthetic-pass' } })
    fireEvent.click(within(reauth).getByRole('button', { name: 'Confirm password' }))
    expect(
      await within(dialog).findByText('Deleted. The deletion log keeps the reference and your reason.'),
    ).toBeTruthy()
    expect(attempts).toBe(2)
  })

  it('[HH-LANG-02] the confirmation is translated into Spanish', async () => {
    const es = staffTranslator('es').t
    render(<RetentionScreen t={es} locale="es" fetchImpl={decisionApi(PREVIEW_BASE) as unknown as typeof fetch} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Eliminar, archivar o conservar…' }))
    expect(await screen.findByRole('dialog', { name: '¿Está seguro de que desea eliminar esta entrada?' })).toBeTruthy()
    expect(await screen.findByRole('button', { name: /^Confirmar eliminación/ })).toBeTruthy()
  })
})
