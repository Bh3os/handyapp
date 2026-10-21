// The retention reviews screen in the staff app (TSK-0099; HH-PRIV-01, HH-DATA-09, ENT-RetentionReview, OWN-DEC-70,
// OQ-RETENTION-REVIEW). The API is a synthetic stand-in (RULE-SYNTHETIC-DATA): references and dates are test inputs,
// not business facts; the periods shown are whatever the server sends.
import { staffTranslator } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RetentionScreen, reviewsQuery, type RetentionOverview, type ReviewEntry } from '../src/Retention'

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

  it('[HH-PRIV-01][HH-DATA-09] lists each entry with its hold checks and offers no delete or edit control', async () => {
    render(<RetentionScreen t={t} locale="en" fetchImpl={api() as unknown as typeof fetch} />)
    const list = await screen.findByRole('list', { name: 'Review entries' })
    const item = within(list).getByRole('listitem', { name: 'Request: HH-SYNTH-0001' })
    expect(within(item).getByText('Hold found: deletion is blocked')).toBeTruthy()
    expect(within(item).getByText('Category: Requests that never became jobs')).toBeTruthy()
    expect(within(item).getByText('2 years under retention.requests_not_converted, version 1')).toBeTruthy()
    expect(within(item).getByText('1 found: deletion is blocked')).toBeTruthy()
    expect(within(item).getAllByText('Not recorded in the software: check before deciding')).toHaveLength(8)
    expect(within(list).queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: /delete|archive/i })).toBeNull()
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

  it('[HH-LANG-02] the screen is fully translated into Spanish', async () => {
    const es = staffTranslator('es').t
    render(<RetentionScreen t={es} locale="es" fetchImpl={api() as unknown as typeof fetch} />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Revisiones de conservación' })).toBeTruthy()
    expect(screen.getByText('2 años desde el cierre de la solicitud; luego, su revisión de eliminación.')).toBeTruthy()
  })
})
