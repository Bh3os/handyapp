// Cases on the staff app (TSK-0093; HH-QA-06, HH-INC-01, HH-INC-02, HH-INC-04, OWN-DEC-143, RULE-HUMAN-REVIEW). The
// API is a synthetic stand-in; every name, note and reference is synthetic (RULE-SYNTHETIC-DATA).
import { staffTranslator, type StaffLocale } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CasePage, JobIncidents, ProjectCases, type CaseView, type RestrictedSection } from '../src/Cases'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const CASE = '11111111-1111-4111-8111-111111111193'
const PROJECT = '22222222-2222-4222-8222-222222222293'
const JOB = '33333333-3333-4333-8333-333333333393'
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const refused = (code = 'FORBIDDEN') =>
  json(403, { error: { code, message: '', fieldErrors: [], requestId: 'r', retryable: false } })
const href = (to: string) => `/staff${to}`
const t = (locale: StaffLocale) => staffTranslator(locale).t

const SUMMARY = {
  id: CASE,
  number: 7,
  projectId: PROJECT,
  projectReference: 'HH-SYNTH093',
  restricted: true,
  kind: 'injury',
  state: 'reported',
  reportedAt: '2026-10-22T14:00:00.000Z',
  closedAt: null,
  version: 3,
}
function detail(over: Partial<NonNullable<CaseView['detail']>> = {}): NonNullable<CaseView['detail']> {
  return {
    jobId: JOB,
    incidentType: 'injury',
    category: null,
    severity: null,
    source: 'worker_report',
    reportedBy: null,
    assignedTo: null,
    dueOn: null,
    reviewer: { id: 'owner-1', name: 'Synthetic Owner' },
    reviewAreas: ['injury', 'insurance'],
    hold: null,
    holdOptions: [],
    resolution: null,
    resolvedAt: null,
    recheckRequired: false,
    recheck: null,
    followUps: [],
    customerUpdates: [
      {
        id: 'u-1',
        kind: 'acknowledgment',
        body: 'We received your report and recorded it for review.',
        state: 'draft',
        draftedBy: { id: 'owner-1', name: 'Synthetic Owner' },
        draftedAt: '2026-10-22T14:05:00.000Z',
        releasedAt: null,
        version: 1,
      },
    ],
    notes: [],
    attachments: [],
    referrals: [],
    history: [{ event: 'report', from: null, to: 'reported', by: null, note: null, at: '2026-10-22T14:00:00.000Z' }],
    actions: { events: ['triage'], manage: true, linkHold: true, recheck: false, refer: true, restricted: true },
    ...over,
  }
}
const SECTION: RestrictedSection = {
  caseId: CASE,
  number: 7,
  projectReference: 'HH-SYNTH093',
  kind: 'injury',
  incidentType: 'injury',
  state: 'reported',
  reportedBy: { id: 'ann', name: 'Synthetic Ann' },
  reportedAt: '2026-10-22T14:00:00.000Z',
  report: {
    occurredAt: null,
    whatHappened: 'Synthetic: a cut while scoring drywall.',
    peopleAffected: null,
    workAreas: 'Synthetic hallway',
    immediateActions: null,
    medicalDetail: null,
  },
  notes: [],
  attachments: [],
}

describe('the case page (TSK-0093, HH-INC-02, OWN-DEC-143)', () => {
  it('[HH-INC-02] Office reads a restricted case as its status only and never asks for the restricted section', async () => {
    const urls: string[] = []
    const fetchImpl = vi.fn(async (url: string) => {
      urls.push(url)
      if (url.endsWith(`/staff/cases/${CASE}`)) return json(200, { ...SUMMARY, kind: null, detail: null })
      return refused()
    }) as unknown as typeof fetch
    render(<CasePage t={t('en')} locale="en" fetchImpl={fetchImpl} caseId={CASE} href={href} />)
    await screen.findByText('This is a restricted case. You can see that it exists and its status only.')
    expect(screen.getByTestId('case-kind').textContent).toContain('Restricted case')
    expect(screen.getByTestId('case-state').textContent).toBe('Reported')
    expect(screen.queryByTestId('case-restricted')).toBeNull()
    expect(urls).toEqual([`/api/v1/staff/cases/${CASE}`])
  })

  it('[HH-INC-02] the reporting worker reads their own report (the case itself is refused to them)', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.endsWith('/restricted') ? json(200, SECTION) : refused(),
    ) as unknown as typeof fetch
    render(<CasePage t={t('es')} locale="es" fetchImpl={fetchImpl} caseId={CASE} href={href} />)
    const section = await screen.findByTestId('case-restricted')
    expect(within(section).getByText('Synthetic: a cut while scoring drywall.')).toBeTruthy()
    expect(within(section).getByText('Detalles restringidos del incidente')).toBeTruthy()
    expect(screen.getByTestId('case-kind').textContent).toContain('Lesión')
    expect(screen.queryByTestId('case-handling')).toBeNull()
  })

  it('[HH-INC-04][RULE-HUMAN-REVIEW] the Owner sees the review areas, no referral claimed, and releases a reviewed update', async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, ...(init ? { init } : {}) })
      if (url.endsWith('/restricted')) return json(200, SECTION)
      if (url.endsWith(`/staff/cases/${CASE}`)) return json(200, { ...SUMMARY, detail: detail() })
      if (url.endsWith('/staff/cases/assignees'))
        return json(200, { staff: [{ id: 'office-1', name: 'Synthetic Office' }] })
      if (url.includes('/case-customer-updates/u-1/actions/release'))
        return json(200, { updateId: 'u-1', kind: 'acknowledgment', state: 'released', version: 2 })
      return refused()
    }) as unknown as typeof fetch
    render(<CasePage t={t('en')} locale="en" fetchImpl={fetchImpl} caseId={CASE} href={href} />)
    expect((await screen.findByTestId('case-review-areas')).textContent).toBe(
      'Needs human review: Injury, Insurance. The Owner is the reviewer and decides any professional referral.',
    )
    expect(screen.getByTestId('case-reviewer').textContent).toBe('Synthetic Owner')
    expect(within(screen.getByTestId('case-referrals')).getByText('No referral recorded.')).toBeTruthy()
    // No control decides fault, liability, coverage or compensation.
    expect(screen.queryByRole('button', { name: /fault|liab|compensat|refund|cover/i })).toBeNull()
    const updates = screen.getByTestId('case-customer-updates')
    expect(within(updates).getByText('Draft, not shown to the customer')).toBeTruthy()
    fireEvent.click(within(updates).getByRole('button', { name: 'Release to the customer' }))
    await waitFor(() => expect(calls.some((c) => c.url.includes('/actions/release'))).toBe(true))
    const release = calls.find((c) => c.url.includes('/actions/release'))
    expect(release?.init?.method).toBe('POST')
    expect((release?.init?.headers as Record<string, string>)['if-match']).toBe('"1"')
    expect(within(screen.getByTestId('case-events')).getByRole('button', { name: 'Triage' })).toBeTruthy()
  })

  it('[HH-INC-04] a refusal for fault or compensation wording is explained in the staff language', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/restricted')) return json(200, SECTION)
      if (url.endsWith(`/staff/cases/${CASE}`))
        return json(200, { ...SUMMARY, detail: detail({ customerUpdates: [] }) })
      if (url.endsWith('/staff/cases/assignees')) return json(200, { staff: [] })
      if (url.endsWith('/customer-updates') && init?.method === 'POST')
        return json(400, {
          error: {
            code: 'VALIDATION_FAILED',
            message: '',
            fieldErrors: [{ field: 'body.detail', code: 'FORBIDDEN_WORDING', message: '' }],
            requestId: 'r',
            retryable: false,
          },
        })
      return refused()
    }) as unknown as typeof fetch
    render(<CasePage t={t('es')} locale="es" fetchImpl={fetchImpl} caseId={CASE} href={href} />)
    const updates = await screen.findByTestId('case-customer-updates')
    fireEvent.change(within(updates).getByLabelText('Actualización'), { target: { value: 'progress' } })
    fireEvent.change(within(updates).getByLabelText('Detalle', { exact: false }), {
      target: { value: 'Synthetic wording' },
    })
    fireEvent.click(within(updates).getByRole('button', { name: 'Preparar la actualización' }))
    expect((await within(updates).findByRole('alert')).textContent).toContain('el Dueño decide eso')
  })
})

describe('recording and reporting (TSK-0093, HH-QA-06, HH-INC-01)', () => {
  it('[HH-QA-06] a duplicate complaint offers "add to existing case", which adds the text to that case', async () => {
    const calls: { url: string; body: unknown }[] = []
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      calls.push({ url, body })
      if (url.endsWith(`/staff/projects/${PROJECT}/cases`)) return json(200, { cases: [] })
      if (url.endsWith('/staff/cases/assignees'))
        return json(200, { staff: [{ id: 'office-1', name: 'Synthetic Office' }] })
      if (url.endsWith('/complaints'))
        return json(409, {
          error: {
            code: 'CONFLICT',
            message: '',
            fieldErrors: [{ field: 'body.category', code: 'DUPLICATE_OPEN_CASE', message: '' }],
            requestId: 'r',
            retryable: false,
            current: { version: 2, values: { caseId: CASE, number: 7, state: 'open' } },
          },
        })
      if (url.endsWith(`/staff/cases/${CASE}/notes`))
        return json(201, { noteId: 'n-1', writtenAt: '2026-10-22T15:00:00.000Z' })
      return refused()
    }) as unknown as typeof fetch
    render(<ProjectCases t={t('en')} locale="en" fetchImpl={fetchImpl} projectId={PROJECT} href={href} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Record a complaint' }))
    const form = screen.getByTestId('complaint-form')
    await waitFor(() => expect(within(form).getByLabelText('Assigned to')).toBeTruthy())
    fireEvent.change(within(form).getByLabelText('Due date'), { target: { value: '2026-10-30' } })
    fireEvent.change(within(form).getByLabelText('What the customer said'), {
      target: { value: 'Synthetic: the patch shows again.' },
    })
    fireEvent.click(within(form).getByRole('button', { name: 'Record the complaint' }))
    const offer = await within(form).findByTestId('add-to-existing')
    expect(offer.textContent).toContain('Case #7 is open for this category.')
    fireEvent.click(within(offer).getByRole('button', { name: 'Add to the existing case' }))
    await waitFor(() => expect(calls.some((c) => c.url.endsWith(`/staff/cases/${CASE}/notes`))).toBe(true))
    expect(calls.find((c) => c.url.endsWith('/notes'))?.body).toEqual({
      body: 'Synthetic: the patch shows again.',
      source: 'call',
    })
  })

  it('[HH-INC-01] a worker reports quickly from the job: the safety path comes first, the report is factual', async () => {
    const calls: { url: string; body: unknown }[] = []
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      if (url.endsWith('/incident-reports')) return json(200, { reports: [] })
      if (url.endsWith('/incidents'))
        return json(201, { caseId: CASE, number: 8, kind: 'damage', state: 'reported', version: 1 })
      return refused()
    }) as unknown as typeof fetch
    render(<JobIncidents t={t('en')} locale="en" fetchImpl={fetchImpl} jobId={JOB} href={href} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Report an incident' }))
    const form = screen.getByTestId('incident-form')
    expect(within(form).getByText(/Stop Work \/ Report Hazard/)).toBeTruthy()
    fireEvent.change(within(form).getByLabelText('What happened'), { target: { value: 'property_damage' } })
    fireEvent.change(within(form).getByLabelText('What happened, in facts', { exact: false }), {
      target: { value: 'Synthetic: a scuff on the door frame.' },
    })
    fireEvent.click(within(form).getByRole('button', { name: 'Send the report' }))
    expect(await screen.findByRole('status')).toBeTruthy()
    expect(calls.find((c) => c.url.endsWith(`/staff/jobs/${JOB}/incidents`))?.body).toEqual({
      type: 'property_damage',
      whatHappened: 'Synthetic: a scuff on the door frame.',
    })
  })
})
