// The Owner's quality review on the staff app (TSK-0084; HH-QA-02, HH-QA-04, T55, T56, OWN-DEC-64). The API is a
// synthetic stand-in; every name, note and reference is synthetic (RULE-SYNTHETIC-DATA).
import { staffTranslator, type StaffLocale } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QualityReviewPage, type PunchItem, type QualityReviewData } from '../src/QualityReview'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const JOB = '33333333-3333-4333-8333-333333333384'
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const refused = (code = 'FORBIDDEN', fieldErrors: { field: string; code: string }[] = []) =>
  json(code === 'CONFLICT' ? 409 : 403, {
    error: {
      code,
      message: '',
      fieldErrors: fieldErrors.map((f) => ({ ...f, message: '' })),
      requestId: 'r',
      retryable: false,
    },
  })
const href = (to: string) => `/staff${to}`
const t = (locale: StaffLocale) => staffTranslator(locale).t

const ITEM: PunchItem = {
  id: 'p-1',
  workPackageId: 'wp-1',
  area: null,
  kind: 'defect',
  severity: 'major',
  description: 'Synthetic: seam shows through the paint',
  requiredEvidence: 'A synthetic after photo',
  assignedTo: { id: 'w-1', name: 'Synthetic Worker' },
  dueOn: '2026-10-30',
  holdId: null,
  state: 'open',
  createdBy: { id: 'o-1', name: 'Synthetic Owner' },
  createdAt: '2026-10-23T14:00:00.000Z',
  correctionNote: null,
  correctedBy: null,
  correctedAt: null,
  recheckNote: null,
  recheckedBy: null,
  recheckedAt: null,
  version: 1,
  actions: { correct: false, recheck: false },
}
function data(over: Partial<QualityReviewData> = {}): QualityReviewData {
  return {
    jobId: JOB,
    projectId: 'p',
    reference: 'HH-SYNTH084',
    jobState: 'ready_for_qa',
    review: {
      state: 'in_review',
      reviewer: { id: 'o-1', name: 'Synthetic Owner' },
      selfReview: false,
      results: null,
      note: null,
      startedAt: '2026-10-23T13:00:00.000Z',
      decidedAt: null,
      passedAt: null,
      version: 2,
    },
    gate: 'quality_review_not_recorded',
    scope: { version: 1, totalCents: 80_000, lines: ['Synthetic patch and paint'] },
    workPackages: [{ id: 'wp-1', code: 'DW-01', position: 1, state: 'planned' }],
    evidence: { beforePhotos: 2, afterPhotos: 1 },
    checklistRecorded: false,
    walkthroughRecorded: false,
    safetyHolds: [],
    workers: [{ id: 'w-1', name: 'Synthetic Worker' }],
    punchItems: [],
    history: [],
    actions: { start: false, addPunchItem: true, decide: true },
    ...over,
  }
}

describe('QualityReviewPage (TSK-0084)', () => {
  it('[HH-QA-02][T55] shows what to review, the gate, and refuses to decide without a result for every area', async () => {
    const fetchImpl = vi.fn(async () => json(200, data()))
    render(<QualityReviewPage t={t('en')} fetchImpl={fetchImpl} jobId={JOB} href={href} />)
    expect(await screen.findByRole('heading', { name: 'Quality review · HH-SYNTH084' })).toBeTruthy()
    expect(screen.getByTestId('quality-gate').textContent).toContain('No final invoice yet: the review is not decided')
    const toReview = screen.getByTestId('quality-to-review')
    expect(within(toReview).getByText('Synthetic patch and paint')).toBeTruthy()
    expect(within(toReview).getByText('2 before photos, 1 after photos.')).toBeTruthy()
    const form = screen.getByTestId('quality-decide')
    fireEvent.click(within(form).getByRole('button', { name: 'Record the review' }))
    expect(within(form).getByRole('alert').textContent).toBe('Record a result for every area.')
    // Nothing was sent: only the first read.
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('[HH-QA-04] a punch item: severity, required evidence, assignee and due date; the safety concern needs the hold', async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).endsWith('/punch-items') && init?.method === 'POST')
        return refused('CONFLICT', [{ field: 'body.holdId', code: 'SAFETY_HOLD_REQUIRED' }])
      return json(200, data({ punchItems: [ITEM], gate: 'blocked' }))
    })
    render(<QualityReviewPage t={t('en')} fetchImpl={fetchImpl} jobId={JOB} href={href} />)
    const item = await screen.findByTestId('punch-item')
    expect(item.textContent).toContain('Major')
    expect(item.textContent).toContain('Defect · DW-01')
    expect(item.textContent).toContain('Evidence required: A synthetic after photo · Assigned to Synthetic Worker')
    expect(screen.getByTestId('quality-gate').textContent).toContain(
      'A major item is open: the final invoice is blocked',
    )
    const add = screen.getByTestId('add-punch-item')
    fireEvent.change(within(add).getByLabelText('Kind'), { target: { value: 'safety_concern' } })
    expect(within(add).getByTestId('safety-hold-needed').textContent).toContain('Stop Work / Report Hazard')
    fireEvent.change(within(add).getByLabelText('The problem'), { target: { value: 'Synthetic loose outlet' } })
    fireEvent.change(within(add).getByLabelText('Correction evidence required'), { target: { value: 'A photo' } })
    fireEvent.change(within(add).getByLabelText('Due date'), { target: { value: '2026-10-30' } })
    fireEvent.click(within(add).getByRole('button', { name: 'Add a punch item' }))
    await waitFor(() => expect(within(add).getByRole('alert').textContent).toContain("the job's safety hold"))
  })

  it('[HH-QA-04] a worker sees only their own items, in Spanish, with the correction form', async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) =>
      String(url).endsWith('/quality-review')
        ? refused()
        : json(200, { punchItems: [{ ...ITEM, actions: { correct: true, recheck: false } }] }),
    )
    render(<QualityReviewPage t={t('es')} fetchImpl={fetchImpl} jobId={JOB} href={href} />)
    const own = await screen.findByTestId('own-punch-items')
    expect(within(own).getByRole('heading', { name: 'Sus elementos pendientes en este trabajo' })).toBeTruthy()
    expect(within(own).getByRole('button', { name: 'Registrar la corrección' })).toBeTruthy()
    expect(screen.queryByTestId('quality-decide')).toBeNull()
  })
})
