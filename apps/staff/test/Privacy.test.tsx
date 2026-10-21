// The privacy requests screen in the staff app (TSK-0100; HH-PRIV-03, ENT-PrivacyRequest, OWN-DEC-71, OWN-DEC-113).
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
const NOT_RECORDED = ['complaints', 'disputes', 'issued_invoices']

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
    expect(within(detail).getByText('Response deadline: not configured')).toBeTruthy()
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
    for (const label of ['Unresolved complaints', 'Disputes', 'Issued invoices'])
      fireEvent.click(within(detail).getByLabelText(`I checked: ${label} (none found)`))
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
      confirmedChecks: ['complaints', 'disputes', 'issued_invoices'],
      closeAccess: true,
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
