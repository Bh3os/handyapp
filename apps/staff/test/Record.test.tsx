// The request record and the requests list (TSK-0042; HH-LEAD-01, HH-LEAD-02, HH-LEAD-08, HH-SVC-04, OWN-DEC-100,
// RULE-LANGUAGES). The API is a synthetic stand-in (RULE-SYNTHETIC-DATA).
import { staffTranslator } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RequestRecord } from '../src/Record'
import { RequestsScreen } from '../src/Requests'
import { REQUEST_ID, requestDetail } from './request-fixture'

afterEach(cleanup)

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

type Handler = (url: string, init?: RequestInit) => Response | undefined
function api(detail = requestDetail(), write?: Handler) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method && init.method !== 'GET') return write?.(url, init) ?? json(500, {})
    if (url.endsWith('/photos'))
      return json(200, { photos: [{ id: 'p1', state: 'quarantined', contentType: 'image/jpeg', url: null }] })
    if (url.endsWith('/assignees')) return json(200, { staff: [{ id: 'staff-1', name: 'Synthetic Office' }] })
    return json(200, detail)
  })
}
function renderRecord(fetchImpl: ReturnType<typeof api>, locale: 'en' | 'es' = 'en') {
  const { t } = staffTranslator(locale)
  return render(
    <RequestRecord
      t={t}
      locale={locale}
      fetchImpl={fetchImpl as unknown as typeof fetch}
      id={REQUEST_ID}
      go={vi.fn()}
      href={(to) => `/staff${to}`}
    />,
  )
}

describe('the original request view (TSK-0042, HH-LEAD-01)', () => {
  it('[HH-LEAD-01] shows what the customer sent, read-only, with separate email and phone badges', async () => {
    renderRecord(api())
    await screen.findByRole('heading', { level: 1, name: 'Request HH-7K2M9Q4D' })
    const original = screen.getByTestId('original-request')
    expect(within(original).queryAllByRole('textbox')).toEqual([])
    expect(within(original).queryAllByRole('button')).toEqual([])
    expect(within(original).getByText(/Patching & Repair — Synthetic service note/)).toBeTruthy()
    expect(within(original).getByText('Damage size: about 6 in')).toBeTruthy()
    expect(within(original).getByText("Colors: I don't know")).toBeTruthy()
    expect(within(original).getByText('Email: Verified')).toBeTruthy()
    expect(within(original).getByText('Phone: Unverified')).toBeTruthy()
    expect(within(original).getByText('Outside the service area; staff decide')).toBeTruthy()
    expect(within(original).getByText(/100 Synthetic Way, Testville, KY 40000/)).toBeTruthy()
    expect(await within(original).findByText('Being checked')).toBeTruthy()
    expect(screen.getByText('Exactly as the customer sent it. It cannot be edited.')).toBeTruthy()
    expect(screen.getByText('Qualify the request and choose an action')).toBeTruthy()
  })

  it('[HH-LEAD-01][RULE-LANGUAGES] Spanish staff see Spanish labels; the original text stays as sent', async () => {
    renderRecord(api(), 'es')
    await screen.findByRole('heading', { level: 1, name: 'Solicitud HH-7K2M9Q4D' })
    expect(screen.getByText('Solicitud original')).toBeTruthy()
    expect(screen.getByText('Synthetic description of the work.')).toBeTruthy()
  })
})

describe('the four actions (TSK-0042, HH-LEAD-02, HH-LEAD-08, OWN-DEC-100)', () => {
  it('[HH-LEAD-08] Not a Fit shows the English customer text and sends the category, reason, version and key', async () => {
    const write = vi.fn<Handler>(() =>
      json(200, { requestId: REQUEST_ID, outcome: 'moved', state: 'not_served', version: 2, projectState: 'closed' }),
    )
    const fetchImpl = api(requestDetail(), write)
    renderRecord(fetchImpl, 'es')
    fireEvent.click(await screen.findByRole('button', { name: 'No es adecuado' }))
    fireEvent.change(screen.getByLabelText('Categoría del motivo'), { target: { value: 'coverage' } })
    fireEvent.change(screen.getByLabelText(/Motivo en lenguaje sencillo/), {
      target: { value: 'the property is outside the area we serve.' },
    })
    expect(
      screen.getByText(
        "Thank you for considering HandyHub. We're unable to take on this project because the property is outside the area we serve.",
      ),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar: No es adecuado' }))
    await waitFor(() => expect(write).toHaveBeenCalled())
    const [url, init] = write.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`/api/v1/staff/requests/${REQUEST_ID}/actions/not-a-fit`)
    expect(JSON.parse(String(init.body))).toEqual({
      category: 'coverage',
      customerReason: 'the property is outside the area we serve.',
    })
    const headers = init.headers as Record<string, string>
    expect(headers['if-match']).toBe('"1"')
    expect(headers['idempotency-key']).toMatch(/^staff-[0-9a-f]{32}$/)
  })

  it('[HH-LEAD-02] a refusal names what is missing; the form keeps what was typed', async () => {
    const write: Handler = () =>
      json(409, {
        error: { code: 'CONFLICT', fieldErrors: [{ field: 'qualification', code: 'QUALIFICATION_INCOMPLETE' }] },
      })
    renderRecord(api(requestDetail(), write))
    fireEvent.click(await screen.findByRole('button', { name: 'Prepare Online Estimate' }))
    // One work package per service of the request is proposed.
    expect(screen.getAllByRole('checkbox', { checked: true })).toHaveLength(2)
    fireEvent.change(screen.getByLabelText('Add a service'), { target: { value: 'SVC-HI-01' } })
    expect(screen.getAllByRole('checkbox', { checked: true })).toHaveLength(3)
    fireEvent.change(screen.getByLabelText('Internal note (staff only, optional)'), {
      target: { value: 'Synthetic draft note' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm: Prepare Online Estimate' }))
    await screen.findByText('Record every qualification point first.')
    expect((screen.getByLabelText('Internal note (staff only, optional)') as HTMLTextAreaElement).value).toBe(
      'Synthetic draft note',
    )
  })

  it('[HH-LEAD-02] a stale version shows the conflict banner instead of overwriting', async () => {
    const write: Handler = () =>
      json(409, {
        error: {
          code: 'STALE_VERSION',
          fieldErrors: [],
          current: { version: 3, values: { state: 'needs_information', responsibleStaffId: null } },
        },
      })
    renderRecord(api(requestDetail(), write))
    fireEvent.click(await screen.findByRole('button', { name: 'Ask a Question' }))
    expect(screen.getByText(/no message is sent to the customer now/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm: Ask a Question' }))
    expect(await screen.findByTestId('conflict-banner')).toBeTruthy()
  })

  it('[HH-LEAD-08] an action the server says is closed shows why it is unavailable', async () => {
    renderRecord(
      api(
        requestDetail({
          state: 'not_served',
          nextStep: 'closed',
          actions: {
            askQuestion: false,
            prepareOnlineEstimate: false,
            arrangeEstimateVisit: false,
            notAFit: false,
            assign: true,
            qualify: true,
            addNote: true,
            recordConversation: true,
          },
        }),
      ),
    )
    const button = await screen.findByRole('button', { name: 'Not a Fit' })
    expect((button as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getAllByText('Not available for this request now, or not part of your role.')).toHaveLength(4)
    expect(screen.getByText('Closed; the history is kept')).toBeTruthy()
  })
})

describe('the requests list (TSK-0042, HH-LEAD-01)', () => {
  it('[HH-LEAD-01] lists requests with their status and opens one in place', async () => {
    const fetchImpl = vi.fn(async () =>
      json(200, {
        items: [
          {
            id: REQUEST_ID,
            reference: 'HH-7K2M9Q4D',
            state: 'received',
            submittedAt: '2026-10-20T15:00:00.000Z',
            services: ['DW-01'],
            customerName: 'Synthetic Customer',
            city: 'Testville',
            coverage: 'unknown',
            needHelpToday: true,
            spamSuspected: false,
            responsibleStaff: null,
          },
        ],
        nextCursor: null,
      }),
    )
    const go = vi.fn()
    const { t } = staffTranslator('en')
    render(
      <RequestsScreen
        t={t}
        locale="en"
        fetchImpl={fetchImpl as unknown as typeof fetch}
        go={go}
        href={(to) => `/staff${to}`}
      />,
    )
    const item = await screen.findByRole('listitem', { name: 'Request HH-7K2M9Q4D' })
    expect(within(item).getByText('Needs help today')).toBeTruthy()
    expect(fetchImpl).toHaveBeenCalledWith('/api/v1/staff/requests?state=open', expect.anything())
    fireEvent.click(within(item).getByRole('link', { name: 'Open request' }))
    expect(go).toHaveBeenCalledWith(`/requests/${REQUEST_ID}`)
  })
})

describe('the first-response clock and review holds (TSK-0043, HH-LEAD-04, HH-LEAD-05, OWN-DEC-116)', () => {
  const hold = {
    id: '33333333-3333-4333-8333-333333333333',
    kind: 'review',
    category: 'licensed_trade',
    note: 'Synthetic: old wiring near the wall.',
    state: 'under_review' as const,
    version: 2,
    raisedBy: { id: 'staff-1', name: 'Synthetic Office' },
    raisedAt: '2026-10-20T15:05:00.000Z',
    reviewStartedBy: { id: 'staff-1', name: 'Synthetic Office' },
    reviewStartedAt: '2026-10-20T15:10:00.000Z',
    resolutionNote: null,
    reviewer: null,
    resolvedBy: null,
    resolvedAt: null,
    cancelReason: null,
    canceledBy: null,
    canceledAt: null,
    actions: { startReview: false, resolve: true, cancel: true },
  }

  it('[HH-LEAD-05][OWN-DEC-115] shows the clock in business minutes, labelled an internal target, never a promise', async () => {
    renderRecord(
      api(
        requestDetail({
          responseClock: {
            ...(requestDetail().responseClock as NonNullable<ReturnType<typeof requestDetail>['responseClock']>),
            state: 'paused',
            remainingMinutes: 40,
            resumesAt: '2026-10-21T12:00:00.000Z',
          },
        }),
      ),
    )
    const clock = await screen.findByTestId('response-clock')
    expect(clock.textContent).toMatch(/40 minutes left; paused outside daily hours until Wed,? 8:00\sAM/)
    expect(clock.textContent).toContain('Internal response target, not a customer promise')
    expect(
      screen.getByText(/stops only when a meaningful response is sent or a completed conversation is recorded/),
    ).toBeTruthy()
  })

  it('[HH-LEAD-05][OWN-DEC-116] records a completed conversation with its outcome', async () => {
    const write = vi.fn<Handler>(() =>
      json(201, { id: 'c1', occurredAt: '2026-10-20T15:20:00.000Z', responseClock: null }),
    )
    renderRecord(api(requestDetail(), write))
    const form = await screen.findByRole('form', { name: 'Record a completed conversation' })
    fireEvent.change(within(form).getByLabelText('How you spoke with the customer'), { target: { value: 'phone' } })
    fireEvent.change(within(form).getByLabelText(/Outcome \(staff only\)/), {
      target: { value: 'Synthetic: photos to follow.' },
    })
    fireEvent.click(within(form).getByRole('button', { name: 'Record a completed conversation' }))
    await waitFor(() => expect(write).toHaveBeenCalled())
    const [url, init] = write.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`/api/v1/staff/requests/${REQUEST_ID}/conversations`)
    expect(JSON.parse(String(init.body))).toEqual({ channel: 'phone', outcome: 'Synthetic: photos to follow.' })
    expect(await screen.findByText('Conversation recorded.')).toBeTruthy()
  })

  it('[HH-LEAD-04] risk flags needing attention name the hazards, which the qualification sends', async () => {
    const write = vi.fn<Handler>(() => json(200, { revision: 1, missingChecks: [], holdsOpened: ['h1'] }))
    renderRecord(api(requestDetail(), write))
    const group = await screen.findByRole('group', { name: 'Risk flags' })
    expect(within(group).queryByText('What is the potential hazard about?')).toBeNull()
    fireEvent.click(within(group).getByLabelText('Needs attention'))
    fireEvent.click(within(group).getByLabelText('Hazardous material (asbestos, lead, mold)'))
    fireEvent.change(within(group).getByLabelText('Note (optional)'), {
      target: { value: 'Synthetic: peeling paint.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save qualification' }))
    await waitFor(() => expect(write).toHaveBeenCalled())
    const body = JSON.parse(String((write.mock.calls[0] as [string, RequestInit])[1].body)) as {
      checks: Record<string, unknown>
    }
    expect(body.checks['risk_flags']).toEqual({
      outcome: 'attention',
      note: 'Synthetic: peeling paint.',
      hazards: ['hazardous_material'],
    })
    expect(body.checks['coverage']).toEqual({ outcome: 'not_checked' })
  })

  it('[HH-LEAD-04][T40][RULE-SAFETY-GATES] an open hold blocks the estimate path and the Owner resolves it with a note and the reviewer', async () => {
    const write = vi.fn<Handler>(() =>
      json(200, { holdId: hold.id, state: 'resolved', version: 3, requestId: REQUEST_ID }),
    )
    renderRecord(
      api(
        requestDetail({
          holds: [hold],
          estimateBlockedByHolds: true,
          actions: { ...requestDetail().actions, prepareOnlineEstimate: false, arrangeEstimateVisit: false },
        }),
        write,
      ),
    )
    const holds = await screen.findByRole('region', { name: 'Review holds' })
    expect(within(holds).getByText('Licensed trade work (electrical, plumbing, HVAC, gas)')).toBeTruthy()
    expect(within(holds).getByText('Under review')).toBeTruthy()
    expect(within(holds).getByText('Estimating is blocked until every review hold is resolved.')).toBeTruthy()
    const estimate = screen.getByRole('button', { name: 'Prepare Online Estimate' }) as HTMLButtonElement
    expect(estimate.disabled).toBe(true)
    expect(screen.getAllByText('Estimating is blocked until every review hold is resolved.').length).toBeGreaterThan(1)
    fireEvent.click(within(holds).getByRole('button', { name: 'Resolve' }))
    const form = within(holds).getByRole('form', { name: 'Resolve' })
    fireEvent.change(within(form).getByLabelText(/How it was resolved/), { target: { value: 'Synthetic resolution.' } })
    fireEvent.change(within(form).getByLabelText(/Who reviewed it/), { target: { value: 'Synthetic Owner' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Confirm: resolve the hold' }))
    await waitFor(() => expect(write).toHaveBeenCalled())
    const [url, init] = write.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`/api/v1/staff/holds/${hold.id}/actions/resolve`)
    expect(JSON.parse(String(init.body))).toEqual({
      resolutionNote: 'Synthetic resolution.',
      reviewer: 'Synthetic Owner',
    })
    expect((init.headers as Record<string, string>)['if-match']).toBe('"2"')
  })

  it('[HH-LEAD-04][RULE-LANGUAGES] the holds read in Spanish for a Spanish-speaking staff member', async () => {
    renderRecord(api(requestDetail({ holds: [hold], estimateBlockedByHolds: true })), 'es')
    const holds = await screen.findByRole('region', { name: 'Retenciones para revisión' })
    expect(within(holds).getByText('En revisión')).toBeTruthy()
  })
})
