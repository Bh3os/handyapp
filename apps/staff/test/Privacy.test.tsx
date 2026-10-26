// The privacy requests screen in the staff app (TSK-0100; HH-PRIV-03, ENT-PrivacyRequest, OWN-DEC-71, OWN-DEC-113;
// TSK-0136: HH-PRIV-07, OWN-DEC-175, the dates, alerts, extension and legal deadline; TSK-0152: OWN-DEC-201 I1, I3, the
// identity confirmation, the request recorded outside the portal and the corrections).
// The API is a synthetic stand-in (RULE-SYNTHETIC-DATA): names, references and counts are test inputs, not business
// facts; what is deleted or retained is whatever the server sends.
import { staffTranslator } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PrivacyScreen, privacyQuery, type PrivacyRequestDetail } from '../src/Privacy'

afterEach(cleanup)

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const t = staffTranslator('en').t
const NOT_RECORDED = ['complaints', 'disputes', 'claims']

const request = (over: Partial<PrivacyRequestDetail> = {}): PrivacyRequestDetail => ({
  id: '11111111-1111-4111-8111-111111111111',
  reference: 'PR-000001',
  kind: 'deletion',
  state: 'under_review',
  details: null,
  submittedAt: '2026-10-21T15:00:00.000Z',
  reviewStartedAt: '2026-10-21T16:00:00.000Z',
  decidedAt: null,
  version: 2,
  project: { reference: 'HH-SYNTH001' },
  customer: { name: 'Synthetic Customer' },
  contact: { name: 'Synthetic Customer', email: 'synthetic@example.test', phone: '+15025550100' },
  account: true,
  accessClosed: null,
  outcome: null,
  deadlines: {
    state: 'CONFIGURED',
    receivedOn: '2026-10-21',
    zone: 'America/Kentucky/Louisville',
    calendarVersion: 1,
    targetsVersion: 1,
    acknowledgedAt: '2026-10-21T15:00:00.000Z',
    acknowledgmentDueOn: '2026-10-26',
    substantiveAcknowledgedAt: '2026-10-21T16:00:00.000Z',
    targetDueOn: '2026-11-20',
    targetOn: '2026-11-20',
    extensions: [],
    legalDeadline: { on: null, note: null, recordedAt: null },
    today: '2026-10-22',
    alerts: [],
  },
  plan: {
    items: [
      {
        category: 'login_account',
        disposition: 'delete',
        count: 1,
        reason: null,
        retention: null,
        years: null,
        reviewAt: null,
      },
      {
        category: 'accepted_agreements',
        disposition: 'retain',
        count: 1,
        reason: 'protected_evidence',
        retention: 'accepted_agreements',
        years: 10,
        reviewAt: null,
      },
      {
        category: 'third_party_contacts',
        disposition: 'exclude',
        count: 1,
        reason: 'third_party',
        retention: null,
        years: null,
        reviewAt: null,
      },
      {
        category: 'financial_records',
        disposition: 'not_recorded',
        count: 0,
        reason: null,
        retention: 'financial_records',
        years: 7,
        reviewAt: null,
      },
    ],
    checks: [
      { check: 'open_holds', result: 'none_found' },
      ...NOT_RECORDED.map((check) => ({ check, result: 'not_recorded' })),
    ],
    confirm: NOT_RECORDED,
    deletable: {
      estimates: [{ id: 'e1', reference: 'HH-SYNTH001-E1', projectId: 'p1' }],
      accountIds: ['a1'],
      grantIds: [],
      sessions: 0,
    },
  },
  findings: null,
  identity: {
    risk: 'elevated',
    method: 'fresh_session_code',
    via: 'account',
    verifiedAt: '2026-10-21T14:55:00.000Z',
    check: null,
    note: null,
    recordedBy: null,
    confirmedAt: null,
    confirmedBy: null,
  },
  corrections: null,
  ...over,
})

function api(detail: PrivacyRequestDetail, answers: Record<string, (init?: RequestInit) => Response> = {}) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    for (const [suffix, answer] of Object.entries(answers)) if (url.endsWith(suffix)) return answer(init)
    if (url.includes('/staff/privacy-requests/') && (init?.method ?? 'GET') === 'GET') return json(200, detail)
    if (url.includes('/staff/privacy-requests')) return json(200, { items: [detail], nextCursor: null })
    return json(404, { error: { code: 'NOT_FOUND', fieldErrors: [] } })
  })
}

describe('privacy requests screen (TSK-0100, HH-PRIV-03)', () => {
  it('[HH-PRIV-03] lists requests and shows the scoped search: deleted, retained with why, others left out, not recorded', async () => {
    render(<PrivacyScreen t={t} locale="en" fetchImpl={api(request()) as unknown as typeof fetch} />)
    const list = await screen.findByRole('list', { name: 'Privacy requests' })
    const item = within(list).getByRole('listitem', { name: 'PR-000001: Deletion' })
    expect(within(item).getByText('Under review')).toBeTruthy()
    fireEvent.click(within(item).getByRole('button', { name: 'Open' }))
    const detail = await screen.findByTestId('privacy-detail')
    // The time is shown in the device's zone; the calendar dates never move with it.
    expect(within(detail).getByText(/^Substantive acknowledgment: review started /)).toBeTruthy()
    expect(
      within(detail).getByText(
        'Internal target: Nov 20, 2026. An internal customer-service commitment, not a legal deadline.',
      ),
    ).toBeTruthy()
    expect(within(detail).getByText(/^Legal deadline: not recorded/)).toBeTruthy()
    expect(within(detail).getByText(/Login account: 1/)).toBeTruthy()
    expect(within(detail).getByText(/Accepted estimates and approvals: 1 · protected evidence · 10 years/)).toBeTruthy()
    expect(within(detail).getByText(/Other contacts of this customer: 1 · another person's data/)).toBeTruthy()
    expect(within(detail).getByText('Not recorded: check it')).toBeTruthy()
    expect(within(detail).getByText('Deleting now: 1 estimate never accepted; 1 login account.')).toBeTruthy()
  })

  it('[HH-PRIV-03][T22] completing a deletion needs every check, a reason and the access choice; it is sent once', async () => {
    const decided = request({
      state: 'partially_completed',
      decidedAt: '2026-10-21T17:00:00.000Z',
      accessClosed: true,
      outcome: {
        deleted: [{ category: 'login_account', count: 1 }],
        retained: [request().plan.items[1] as PrivacyRequestDetail['plan']['items'][number]],
        excluded: [],
        exportReady: false,
        accessClosed: true,
      },
    })
    const fetchImpl = api(request(), { '/decision': () => json(200, decided) })
    render(<PrivacyScreen t={t} locale="en" fetchImpl={fetchImpl as unknown as typeof fetch} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Open' }))
    const detail = await screen.findByTestId('privacy-detail')
    const submit = within(detail).getByRole('button', { name: /^Record the decision/ }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    fireEvent.change(within(detail).getByLabelText('Reason (required)'), {
      target: { value: 'Synthetic: identity confirmed.' },
    })
    expect((within(detail).getByRole('button', { name: /^Record the decision/ }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    for (const label of ['Unresolved complaints', 'Disputes', 'Claims'])
      fireEvent.click(within(detail).getByLabelText(`I checked: ${label} (none found)`))
    // TSK-0152 (OWN-DEC-201 I1): a deletion is elevated: the Owner confirms the identity evidence first.
    expect(within(detail).getByText('Risk: elevated')).toBeTruthy()
    expect((within(detail).getByRole('button', { name: /^Record the decision/ }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    fireEvent.click(within(detail).getByLabelText(/^I checked the identity evidence above/))
    expect(
      (within(detail).getByLabelText(/^Close sign-in, sessions and project access links/) as HTMLInputElement).checked,
    ).toBe(true)
    fireEvent.click(within(detail).getByRole('button', { name: 'Record the decision' }))
    expect(await within(detail).findByText('Sign-in, sessions and project access links were closed.')).toBeTruthy()
    expect(within(detail).getByText('Deleted: Login account (1)')).toBeTruthy()
    const sent = fetchImpl.mock.calls.filter((c) => String(c[0]).endsWith('/decision'))
    expect(sent).toHaveLength(1)
    const init = sent[0]?.[1] as RequestInit & { headers: Record<string, string> }
    expect(JSON.parse(String(init.body))).toEqual({
      decision: 'complete',
      reason: 'Synthetic: identity confirmed.',
      confirmedChecks: ['complaints', 'disputes', 'claims'],
      closeAccess: true,
      identityConfirmed: true,
    })
    expect(init.headers['if-match']).toBe('"2"')
  })

  it('[HH-PRIV-03] a received request is reviewed first; a refusal is labelled', async () => {
    const fetchImpl = api(request({ state: 'received', reviewStartedAt: null, version: 1 }), {
      '/review': () =>
        json(409, { error: { code: 'CONFLICT', fieldErrors: [{ field: 'state', code: 'REVIEW_ALREADY_STARTED' }] } }),
    })
    render(<PrivacyScreen t={t} locale="en" fetchImpl={fetchImpl as unknown as typeof fetch} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Open' }))
    const detail = await screen.findByTestId('privacy-detail')
    expect(within(detail).queryByRole('form', { name: 'Your decision' })).toBeNull()
    fireEvent.click(within(detail).getByRole('button', { name: 'Start the review' }))
    expect(await within(detail).findByText('The review was already started.')).toBeTruthy()
  })

  it('[HH-PRIV-07] an overdue request is flagged; the Owner extends its target with a reason, sent once with the version', async () => {
    const overdue = request({
      deadlines: { ...request().deadlines, today: '2026-11-25', alerts: ['completion_overdue'] },
    })
    const fetchImpl = api(overdue, {
      '/extension': () => json(200, { version: 3, previous: '2026-11-20', current: '2026-12-10' }),
    })
    render(<PrivacyScreen t={t} locale="en" fetchImpl={fetchImpl as unknown as typeof fetch} requestId={overdue.id} />)
    const detail = await screen.findByTestId('privacy-detail')
    expect(within(detail).getByText('Internal target overdue')).toBeTruthy()
    expect(within(detail).getByText('Nothing is closed or declined when a date passes: you decide.')).toBeTruthy()
    const form = within(detail).getByTestId('privacy-extend')
    expect((within(form).getByRole('button', { name: /^Extend the target/ }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(within(form).getByLabelText('New target date'), { target: { value: '2026-12-10' } })
    fireEvent.change(within(form).getByLabelText('Reason the customer is told (required)'), {
      target: { value: 'Synthetic: records from an archived job.' },
    })
    fireEvent.click(within(form).getByRole('button', { name: 'Extend the target' }))
    expect(await within(form).findByText('The internal target is extended.')).toBeTruthy()
    const sent = fetchImpl.mock.calls.filter((c) => String(c[0]).endsWith('/extension'))
    expect(sent).toHaveLength(1)
    const init = sent[0]?.[1] as RequestInit & { headers: Record<string, string> }
    expect(JSON.parse(String(init.body))).toEqual({
      targetOn: '2026-12-10',
      reason: 'Synthetic: records from an archived job.',
    })
    expect(init.headers['if-match']).toBe('"2"')
  })

  it('[HH-PRIV-07] a recorded legal deadline and an extension are shown; a decided request offers no change', async () => {
    const done = request({
      state: 'completed',
      decidedAt: '2026-11-25T17:00:00.000Z',
      deadlines: {
        ...request().deadlines,
        targetOn: '2026-12-10',
        extensions: [
          {
            previousTargetOn: '2026-11-20',
            targetOn: '2026-12-10',
            reason: 'Synthetic: records from an archived job.',
            decidedAt: '2026-11-18T15:00:00.000Z',
          },
        ],
        legalDeadline: { on: '2026-12-05', note: 'Synthetic attorney note', recordedAt: '2026-11-01T15:00:00.000Z' },
      },
    })
    render(<PrivacyScreen t={t} locale="en" fetchImpl={api(done) as unknown as typeof fetch} requestId={done.id} />)
    const detail = await screen.findByTestId('privacy-detail')
    expect(within(detail).getByText(/^Internal target: Dec 10, 2026 \(first Nov 20, 2026\)/)).toBeTruthy()
    expect(within(detail).getByText(/^Extended from Nov 20, 2026 to Dec 10, 2026 .*: Synthetic: records/)).toBeTruthy()
    expect(within(detail).getByText('Legal deadline: Dec 5, 2026 (Synthetic attorney note)')).toBeTruthy()
    expect(within(detail).queryByTestId('privacy-extend')).toBeNull()
    expect(within(detail).queryByTestId('privacy-legal-deadline')).toBeNull()
  })

  it('[HH-PRIV-03][OWN-DEC-201] a correction shows its history; a protected record is corrected by a new entry', async () => {
    const correction = request({
      kind: 'correction',
      details: 'Synthetic: my phone is wrong on the invoice.',
      identity: { ...request().identity, risk: 'standard' },
      corrections: {
        changes: [{ record: 'contact', fields: ['phone'], changedAt: '2026-10-21T16:30:00.000Z' }],
        entries: [],
      },
    })
    const recorded = request({
      ...correction,
      corrections: {
        changes: correction.corrections?.changes ?? [],
        entries: [
          {
            id: 'c1',
            recordKind: 'invoice',
            recordRef: 'INV-SYNTH-1',
            correction: 'Synthetic: the phone on the issued invoice is outdated.',
            recordedAt: '2026-10-21T16:40:00.000Z',
            recordedBy: { id: 'o1', name: 'Synthetic Owner' },
          },
        ],
      },
    })
    const fetchImpl = api(correction, { '/corrections': () => json(200, recorded) })
    render(
      <PrivacyScreen t={t} locale="en" fetchImpl={fetchImpl as unknown as typeof fetch} requestId={correction.id} />,
    )
    const box = await screen.findByTestId('privacy-corrections')
    expect(within(box).getByText(/^Contact details changed on .*: phone$/)).toBeTruthy()
    fireEvent.change(within(box).getByLabelText('Record'), { target: { value: 'invoice' } })
    fireEvent.change(within(box).getByLabelText('Reference (estimate, invoice or entry number)'), {
      target: { value: 'INV-SYNTH-1' },
    })
    fireEvent.change(within(box).getByLabelText('The correction: what is wrong and what is right'), {
      target: { value: 'Synthetic: the phone on the issued invoice is outdated.' },
    })
    fireEvent.click(within(box).getByRole('button', { name: 'Record the correction' }))
    expect(await within(box).findByText(/^Invoice INV-SYNTH-1: Synthetic: the phone/)).toBeTruthy()
    const sent = fetchImpl.mock.calls.filter((c) => String(c[0]).endsWith('/corrections'))
    expect(JSON.parse(String((sent[0]?.[1] as RequestInit).body))).toEqual({
      recordKind: 'invoice',
      recordRef: 'INV-SYNTH-1',
      correction: 'Synthetic: the phone on the issued invoice is outdated.',
    })
    // A standard request needs no identity confirmation.
    expect(screen.queryByLabelText(/^I checked the identity evidence above/)).toBeNull()
  })

  it('[HH-PRIV-03][OWN-DEC-201] the Owner records a request verified outside the portal, with the check and a note', async () => {
    const recorded = request({
      state: 'received',
      reference: 'PR-000009',
      identity: {
        ...request().identity,
        method: 'staff_verified',
        via: 'owner',
        check: 'call_to_phone_on_file',
        note: 'Synthetic: called back on the number on file.',
        recordedBy: 'Synthetic Owner',
      },
    })
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/staff/privacy-requests') && init?.method === 'POST') return json(201, recorded)
      if (url.includes('/staff/privacy-requests')) return json(200, { items: [], nextCursor: null })
      return json(404, { error: { code: 'NOT_FOUND', fieldErrors: [] } })
    })
    render(<PrivacyScreen t={t} locale="en" fetchImpl={fetchImpl as unknown as typeof fetch} />)
    fireEvent.click(await screen.findByText('Record a request verified outside the portal'))
    const form = screen.getByRole('form', { name: 'Record a request verified outside the portal' })
    expect((within(form).getByRole('button', { name: /^Record the request/ }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(within(form).getByLabelText('Project reference'), { target: { value: 'HH-SYNTH001' } })
    fireEvent.change(within(form).getByLabelText('Email or phone on file'), {
      target: { value: 'synthetic@example.test' },
    })
    fireEvent.change(within(form).getByLabelText('Verification note (required)'), {
      target: { value: 'Synthetic: called back on the number on file.' },
    })
    fireEvent.click(within(form).getByRole('button', { name: 'Record the request' }))
    expect(await within(form).findByText('Request PR-000009 is recorded.')).toBeTruthy()
    const sent = fetchImpl.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === 'POST')
    expect(JSON.parse(String((sent[0]?.[1] as RequestInit).body))).toEqual({
      kind: 'export',
      project: 'HH-SYNTH001',
      contact: 'synthetic@example.test',
      check: 'call_to_phone_on_file',
      note: 'Synthetic: called back on the number on file.',
    })
  })

  it('[HH-PRIV-03] builds the query from the state and cursor only', () => {
    expect(privacyQuery('')).toBe('/staff/privacy-requests')
    expect(privacyQuery('received', 'c1')).toBe('/staff/privacy-requests?state=received&cursor=c1')
  })

  it('[HH-LANG-02] the screen is translated into Spanish', async () => {
    const es = staffTranslator('es').t
    render(<PrivacyScreen t={es} locale="es" fetchImpl={api(request()) as unknown as typeof fetch} />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Solicitudes de privacidad' })).toBeTruthy()
    expect(await screen.findByRole('listitem', { name: 'PR-000001: Eliminación' })).toBeTruthy()
  })
})
