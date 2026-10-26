// The Owner's approval before publishing over the threshold in the staff app (TSK-0130; HH-EST-16, OWN-DEC-173,
// FACT-MARGIN-TARGET, HH-LANG-03). The API is a synthetic stand-in (RULE-SYNTHETIC-DATA).
import { staffTranslator } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ApprovalThresholdSetting,
  EstimateOwnerApproval,
  PublicationApprovalQueue,
  type ApprovalRecord,
  type OwnerApprovalState,
} from '../src/OwnerApproval'

afterEach(cleanup)

const V1 = '11111111-1111-4111-8111-111111111111'
const A1 = '33333333-3333-4333-8333-333333333333'
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const ESTIMATOR = { id: 'staff-1', name: 'Synthetic Estimator' }

function record(over: Partial<ApprovalRecord> = {}): ApprovalRecord {
  return {
    id: A1,
    subjectType: 'estimate_version',
    subjectId: V1,
    projectId: 'p1',
    projectReference: 'HH-SYN1',
    reference: 'HH-SYN1-E1',
    documentVersion: 1,
    state: 'pending',
    basis: 'request',
    reasons: ['over_threshold'],
    flags: [],
    proposedTotalCents: 300_000,
    highestTotalCents: 300_000,
    subtotalCents: 300_000,
    discount: null,
    changeOrder: null,
    combinedProjectCents: 300_000,
    thresholdCents: 250_000,
    thresholdVersion: 1,
    linked: [],
    costs: {
      laborCents: 150_000,
      materialCents: 50_000,
      complete: true,
      grossProfitCents: 100_000,
      marginBps: 3333,
      targetBps: 3000,
      targetFlag: 'at_or_above_target',
    },
    requestedBy: ESTIMATOR,
    requestedAt: '2026-10-22T15:00:00.000Z',
    decidedBy: null,
    decidedAt: null,
    comment: null,
    invalidatedAt: null,
    invalidatedReason: null,
    usedAt: null,
    rowVersion: 1,
    ...over,
  }
}
function state(over: Partial<OwnerApprovalState> = {}): OwnerApprovalState {
  return {
    status: 'required',
    evaluation: {
      required: true,
      reasons: ['over_threshold'],
      flags: [],
      thresholdCents: 250_000,
      thresholdVersion: 1,
      proposedTotalCents: 300_000,
      highestTotalCents: 300_000,
      combinedProjectCents: 300_000,
      linked: [],
    },
    usedApprovalId: null,
    pendingApprovalId: null,
    records: [],
    actions: { request: true, decide: false, publishApproves: false },
    ...over,
  }
}
type View = { id: string; rowVersion: number; ownerApproval: OwnerApprovalState | null }

function renderPanel(v: View, fetchImpl: ReturnType<typeof vi.fn>, locale: 'en' | 'es' = 'en') {
  const { t } = staffTranslator(locale)
  const onView = vi.fn()
  render(<EstimateOwnerApproval t={t} fetchImpl={fetchImpl as unknown as typeof fetch} view={v} onView={onView} />)
  return { onView }
}

describe('EstimateOwnerApproval (TSK-0130, HH-EST-16)', () => {
  it('[HH-EST-16] shows why the Owner approves and asks with the row version seen', async () => {
    const asked = { id: V1, rowVersion: 4, ownerApproval: state({ status: 'pending' }) }
    const fetchImpl = vi.fn().mockResolvedValue(json(200, asked))
    const { onView } = renderPanel({ id: V1, rowVersion: 4, ownerApproval: state() }, fetchImpl)
    const panel = screen.getByTestId('owner-approval')
    expect(within(panel).getByText('Owner approval needed')).toBeTruthy()
    expect(within(panel).getByText('Over $2,500.00 (configuration version 1)')).toBeTruthy()
    expect(within(panel).getByText('The final proposed total is over the Owner approval threshold')).toBeTruthy()
    fireEvent.click(within(panel).getByRole('button', { name: 'Ask the Owner to approve' }))
    await waitFor(() => expect(onView).toHaveBeenCalledWith(asked))
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`/api/v1/staff/estimate-versions/${V1}/owner-approval`)
    expect((init.headers as Record<string, string>)['if-match']).toBe('"4"')
  })

  it('[HH-EST-16][FACT-MARGIN-TARGET] the Owner sees the costs and margin and decides with a comment', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(200, record({ state: 'approved' })))
      .mockResolvedValueOnce(json(200, { id: V1, rowVersion: 4, ownerApproval: state({ status: 'approved' }) }))
    renderPanel(
      {
        id: V1,
        rowVersion: 4,
        ownerApproval: state({
          status: 'pending',
          pendingApprovalId: A1,
          records: [record()],
          actions: { request: false, decide: true, publishApproves: true },
        }),
      },
      fetchImpl,
    )
    const decide = screen.getByTestId('owner-approval-decide')
    expect(within(decide).getByText('$1,000.00')).toBeTruthy()
    expect(within(decide).getByText('33.33%')).toBeTruthy()
    fireEvent.click(within(decide).getByRole('button', { name: 'Approve for publishing' }))
    expect(within(decide).getByText('Write a comment with the decision.')).toBeTruthy()
    expect(fetchImpl).not.toHaveBeenCalled()
    fireEvent.change(within(decide).getByLabelText('Comment'), { target: { value: 'Synthetic: checked.' } })
    fireEvent.click(within(decide).getByRole('button', { name: 'Approve for publishing' }))
    await waitFor(() => expect(screen.getByText('Approved. This exact version can now be published.')).toBeTruthy())
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`/api/v1/staff/publication-approvals/${A1}/decision`)
    expect(JSON.parse(String(init.body))).toEqual({ decision: 'approve', comment: 'Synthetic: checked.' })
    expect((init.headers as Record<string, string>)['if-match']).toBe('"1"')
  })

  it('[HH-EST-16] incomplete costs never show a margin; a refusal names its reason (Spanish)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      json(409, {
        error: {
          code: 'CONFLICT',
          fieldErrors: [{ field: 'ownerApproval', code: 'OWNER_APPROVAL_NOT_REQUIRED', message: '' }],
        },
      }),
    )
    renderPanel(
      {
        id: V1,
        rowVersion: 2,
        ownerApproval: state({
          status: 'pending',
          pendingApprovalId: A1,
          records: [
            record({
              costs: {
                laborCents: 10_000,
                materialCents: null,
                complete: false,
                grossProfitCents: null,
                marginBps: null,
                targetBps: 3000,
                targetFlag: 'incomplete',
              },
            }),
          ],
          actions: { request: false, decide: true, publishApproves: true },
        }),
      },
      fetchImpl,
      'es',
    )
    const decide = screen.getByTestId('owner-approval-decide')
    expect(within(decide).getAllByText('Costos incompletos')).toHaveLength(2)
    fireEvent.change(within(decide).getByLabelText('Comentario'), { target: { value: 'x' } })
    fireEvent.click(within(decide).getByRole('button', { name: 'Rechazar' }))
    await waitFor(() =>
      expect(screen.getByText('Esta versión no necesita la aprobación del Propietario.')).toBeTruthy(),
    )
  })
})

describe('PublicationApprovalQueue (TSK-0130, HH-EST-16)', () => {
  it('[HH-EST-16] lists each pending approval with price, costs, margin, discount, reason and preparer', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      json(200, {
        items: [record(), record({ id: 'a2', costs: null, discount: { category: 'senior', amountCents: 30_000 } })],
      }),
    )
    const { t } = staffTranslator('en')
    render(
      <PublicationApprovalQueue t={t} fetchImpl={fetchImpl as unknown as typeof fetch} go={vi.fn()} href={(x) => x} />,
    )
    const rows = await screen.findAllByTestId('approval-queue-item')
    expect(rows).toHaveLength(2)
    expect(within(rows[0] as HTMLElement).getByRole('link', { name: 'HH-SYN1-E1 version 1 (HH-SYN1)' })).toBeTruthy()
    expect(within(rows[0] as HTMLElement).getByText('33.33%')).toBeTruthy()
    // TSK-0131 (HH-FIN-20): the estimated margin against the target, advisory only.
    expect(within(rows[0] as HTMLElement).getByTestId('approval-margin-flag').textContent).toBe(
      'At or above the target margin (30.00%, advisory)',
    )
    expect(within(rows[1] as HTMLElement).getAllByText('No costs entered')).toHaveLength(2)
    expect(within(rows[1] as HTMLElement).getByText('$300.00')).toBeTruthy()
    expect(within(rows[1] as HTMLElement).getByText('Synthetic Estimator')).toBeTruthy()
  })

  it('is hidden when the server refuses it (not the Owner)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(403, { error: { code: 'FORBIDDEN', fieldErrors: [] } }))
    const { t } = staffTranslator('en')
    const { container } = render(
      <PublicationApprovalQueue t={t} fetchImpl={fetchImpl as unknown as typeof fetch} go={vi.fn()} href={(x) => x} />,
    )
    await waitFor(() => expect(fetchImpl).toHaveBeenCalled())
    expect(container.textContent).toBe('')
  })
})

describe('ApprovalThresholdSetting (TSK-0130, HH-EST-16)', () => {
  it('[HH-EST-16] the Owner changes the threshold in cents with a reason and the configuration version', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(200, { state: 'CONFIGURED', version: 1, thresholdCents: 250_000, sourceIds: [] }))
      .mockResolvedValueOnce(json(200, { state: 'CONFIGURED', version: 2, thresholdCents: 300_000, sourceIds: [] }))
    const { t } = staffTranslator('en')
    render(<ApprovalThresholdSetting t={t} fetchImpl={fetchImpl as unknown as typeof fetch} />)
    const section = await screen.findByTestId('approval-threshold')
    expect(within(section).getByText('Over $2,500.00 (configuration version 1)')).toBeTruthy()
    fireEvent.click(within(section).getByRole('button', { name: 'Save the threshold' }))
    expect(within(section).getByText('Write the reason for the change.')).toBeTruthy()
    fireEvent.change(within(section).getByLabelText('New threshold (USD)'), { target: { value: '3000.00' } })
    fireEvent.change(within(section).getByLabelText('Reason for the change'), { target: { value: 'Synthetic' } })
    fireEvent.click(within(section).getByRole('button', { name: 'Save the threshold' }))
    await waitFor(() => expect(within(section).getByText('The new threshold is in force.')).toBeTruthy())
    const [url, init] = fetchImpl.mock.calls[1] as [string, RequestInit]
    expect(url).toBe('/api/v1/staff/settings/approval-threshold')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(String(init.body))).toEqual({ thresholdCents: 300_000, reason: 'Synthetic' })
    expect((init.headers as Record<string, string>)['if-match']).toBe('"1"')
    expect(within(section).getByText('Over $3,000.00 (configuration version 2)')).toBeTruthy()
  })
})
