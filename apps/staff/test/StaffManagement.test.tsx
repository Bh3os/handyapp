// Staff management in the staff app (TSK-0097, TSK-0151; HH-STAFF-02, HH-STAFF-03, HH-STAFF-07, HH-FIN-11, OWN-DEC-123,
// OWN-DEC-200). The API is a
// synthetic stand-in (RULE-SYNTHETIC-DATA): names, emails and appointments are test inputs, not business facts.
import { staffTranslator } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StaffScreen, type MemberDetail, type MemberSummary } from '../src/StaffManagement'

afterEach(cleanup)

const OWNER = '11111111-1111-4111-8111-111111111111'
const ANN = '22222222-2222-4222-8222-222222222222'
const VISIT = '44444444-4444-4444-8444-444444444444'
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const refusal = (status: number, code: string, fieldCodes: string[] = []) =>
  json(status, {
    error: {
      code,
      message: '',
      requestId: 'r',
      retryable: false,
      fieldErrors: fieldCodes.map((c) => ({ field: 'staffUser', code: c, message: '' })),
    },
  })

const summary = (over: Partial<MemberSummary> = {}): MemberSummary => ({
  id: ANN,
  displayName: 'Synthetic Ann',
  email: 'ann@example.test',
  locale: 'en',
  status: 'active',
  self: false,
  roles: ['worker'],
  capabilities: [],
  invitedAt: '2026-10-01T15:00:00.000Z',
  activatedAt: '2026-10-01T16:00:00.000Z',
  disabledAt: null,
  passwordSet: true,
  mfaEnrolled: false,
  liveSessions: 1,
  upcomingAssignments: 1,
  flaggedAssignments: 0,
  permissionReviewOpen: false,
  version: 2,
  ...over,
})
const detail = (over: Partial<MemberDetail> = {}): MemberDetail => ({
  ...summary(),
  grants: [
    {
      id: '55555555-5555-4555-8555-555555555555',
      kind: 'role',
      name: 'worker',
      issuedBy: { staffUserId: OWNER, name: 'Synthetic Owner', system: false },
      reason: 'Synthetic hire',
      effectiveFrom: '2026-10-01T15:00:00.000Z',
      endedAt: null,
      endedBy: null,
      training: null,
    },
  ],
  permissionReview: null,
  statusHistory: [],
  assignments: [
    {
      reservationId: '66666666-6666-4666-8666-666666666666',
      visitId: VISIT,
      requestId: null,
      reference: 'HH-7K2M9Q4P',
      purpose: 'site_estimate',
      visitState: 'confirmed',
      role: 'lead',
      kind: 'confirmed',
      startsAt: '2026-11-04T13:30:00.000Z',
      endsAt: '2026-11-04T16:00:00.000Z',
      timeZone: 'America/Kentucky/Louisville',
      flags: [],
    },
  ],
  ...over,
})
const availability = { businessTimeZone: null, workers: [], equipment: [] }

function api(handlers: (url: string, init?: RequestInit) => Response | undefined) {
  const calls: { url: string; init?: RequestInit }[] = []
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, ...(init ? { init } : {}) })
    const handled = handlers(url, init)
    if (handled) return handled
    if (url === '/api/v1/staff/members') return json(200, { members: [summary()] })
    if (url === `/api/v1/staff/members/${ANN}`) return json(200, detail())
    if (url === '/api/v1/staff/availability') return json(200, availability)
    return json(404, { error: { code: 'NOT_FOUND', message: '', requestId: 'r', retryable: false, fieldErrors: [] } })
  })
  return { calls, fetchImpl: fetchImpl as unknown as typeof fetch }
}

describe('[HH-STAFF-07][HH-STAFF-02] the Staff screen', () => {
  it('[HH-STAFF-07] lists each person with roles, sign-in facts and upcoming assignments', async () => {
    const { fetchImpl } = api(() => undefined)
    const { t } = staffTranslator('en')
    render(<StaffScreen t={t} locale="en" fetchImpl={fetchImpl} onSession={() => {}} />)
    const card = await screen.findByTestId('staff-member')
    expect(within(card).getByRole('heading', { name: 'Synthetic Ann' })).toBeTruthy()
    expect(within(card).getByText('Active')).toBeTruthy()
    expect(within(card).getByTestId('staff-member-roles').textContent).toBe('Roles: Worker')
    expect(card.textContent).toContain('1 open session')
    expect(card.textContent).toContain('1 upcoming assignment, 0 flagged for review')
    // The capacity screen stays below, as a second-level section.
    expect(await screen.findByRole('heading', { level: 2, name: 'Staff availability and equipment' })).toBeTruthy()
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Staff'])
  })

  it('[HH-STAFF-03] a grant that needs a fresh sign-in asks for the password, then sends the grant once more', async () => {
    let grants = 0
    const sessions: unknown[] = []
    const { calls, fetchImpl } = api((url, init) => {
      if (url === `/api/v1/staff/members/${ANN}/grants` && init?.method === 'POST')
        return ++grants === 1
          ? refusal(403, 'FRESH_AUTH_REQUIRED')
          : json(201, detail({ roles: ['office', 'worker'], version: 3 }))
      if (url === '/api/v1/staff/auth/reauth') return json(200, { csrfToken: 'rotated-csrf' })
      return undefined
    })
    const { t } = staffTranslator('en')
    render(<StaffScreen t={t} locale="en" fetchImpl={fetchImpl} onSession={(s) => sessions.push(s)} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Manage Synthetic Ann' }))
    const record = await screen.findByTestId('staff-member-record')
    fireEvent.change(within(record).getByLabelText('Role or permission'), { target: { value: 'role:office' } })
    fireEvent.change(within(record).getAllByLabelText(/^Reason/)[0] as HTMLElement, {
      target: { value: 'Covers the desk' },
    })
    fireEvent.click(within(record).getByRole('button', { name: 'Give' }))
    const prompt = await within(record).findByTestId('staff-reauth')
    fireEvent.change(within(prompt).getByLabelText(/^Password/), { target: { value: 'synthetic entry' } })
    fireEvent.click(within(prompt).getByRole('button', { name: 'Confirm password' }))
    await waitFor(() => expect(within(record).getByRole('status').textContent).toContain('Given.'))
    const sent = calls.filter((c) => c.url.endsWith('/grants'))
    expect(sent).toHaveLength(2)
    expect(JSON.parse(String(sent[1]?.init?.body))).toEqual({ kind: 'role', name: 'office', reason: 'Covers the desk' })
    expect(sessions).toEqual([{ csrfToken: 'rotated-csrf' }])
  })

  it('[HH-STAFF-02][T27] disabling asks for confirmation, says what happens and reports the flagged appointments', async () => {
    const { calls, fetchImpl } = api((url, init) => {
      if (url === `/api/v1/staff/members/${ANN}/disable` && init?.method === 'POST')
        return json(200, {
          member: detail({ status: 'disabled', liveSessions: 0 }),
          sessionsRevoked: 2,
          linksInvalidated: 0,
          upcomingAssignments: 1,
          flagged: 1,
        })
      return undefined
    })
    const { t } = staffTranslator('es')
    render(<StaffScreen t={t} locale="es" fetchImpl={fetchImpl} onSession={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Gestionar a Synthetic Ann' }))
    const record = await screen.findByTestId('staff-member-record')
    fireEvent.click(within(record).getByRole('button', { name: 'Desactivar la cuenta' }))
    const confirm = within(record).getByTestId('staff-disable-confirm')
    expect(confirm.textContent).toContain('Las próximas citas siguen reservadas')
    fireEvent.click(within(confirm).getByRole('button', { name: 'Desactivar ahora' }))
    await waitFor(() =>
      expect(within(record).getAllByRole('status')[0]?.textContent).toBe(
        'Desactivada. 2 sesiones terminadas; 1 cita marcada para reasignar.',
      ),
    )
    expect(calls.find((c) => c.url.endsWith('/disable'))?.init?.body).toBe('{}')
    expect(within(record).getByRole('button', { name: 'Reactivar la cuenta' })).toBeTruthy()
  })

  it('[HH-STAFF-02] the Owner resets a lost authenticator with a reason; the person enrols again at sign-in (TSK-0154)', async () => {
    const enrolled = detail({ mfaEnrolled: true, liveSessions: 2 })
    const { calls, fetchImpl } = api((url, init) => {
      if (url === `/api/v1/staff/members/${ANN}`) return json(200, enrolled)
      if (url === `/api/v1/staff/members/${ANN}/mfa-reset` && init?.method === 'POST')
        return json(200, {
          member: detail({ mfaEnrolled: false, liveSessions: 0 }),
          sessionsRevoked: 2,
          recoveryCodesRemoved: 9,
        })
      return undefined
    })
    const { t } = staffTranslator('es')
    render(<StaffScreen t={t} locale="es" fetchImpl={fetchImpl} onSession={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Gestionar a Synthetic Ann' }))
    const record = await screen.findByTestId('staff-member-record')
    fireEvent.click(within(record).getByRole('button', { name: 'Restablecer autenticador' }))
    const confirm = within(record).getByTestId('staff-mfa-reset-confirm')
    expect(confirm.textContent).toContain('todas sus sesiones terminan de inmediato')
    fireEvent.change(within(confirm).getByLabelText(/^Motivo/), { target: { value: 'Perdió el teléfono' } })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Restablecer autenticador' }))
    await waitFor(() =>
      expect(within(record).getAllByRole('status')[0]?.textContent).toBe(
        'Se restableció el autenticador. Terminaron 2 sesiones; en el próximo inicio de sesión se configura un autenticador nuevo.',
      ),
    )
    expect(JSON.parse(String(calls.find((c) => c.url.endsWith('/mfa-reset'))?.init?.body))).toEqual({
      reason: 'Perdió el teléfono',
    })
    // Nothing to reset any more: the button is gone until the person enrols again.
    expect(within(record).queryByRole('button', { name: 'Restablecer autenticador' })).toBeNull()
  })

  it('[HH-FIN-11][HH-STAFF-03] the collect permission asks for the training and sends it with the grant (TSK-0151)', async () => {
    const { calls, fetchImpl } = api((url, init) =>
      url === `/api/v1/staff/members/${ANN}/grants` && init?.method === 'POST'
        ? json(201, detail({ capabilities: ['collect'], version: 3 }))
        : undefined,
    )
    const { t } = staffTranslator('en')
    render(<StaffScreen t={t} locale="en" fetchImpl={fetchImpl} onSession={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Manage Synthetic Ann' }))
    const record = await screen.findByTestId('staff-member-record')
    expect(within(record).queryByTestId('staff-training')).toBeNull()
    fireEvent.change(within(record).getByLabelText('Role or permission'), {
      target: { value: 'capability:collect' },
    })
    const training = within(record).getByTestId('staff-training')
    fireEvent.change(within(training).getByLabelText(/^Training completed on/), { target: { value: '2026-10-20' } })
    fireEvent.change(within(training).getByLabelText(/^What the training covered/), {
      target: { value: 'Synthetic: cash handling and receipts' },
    })
    fireEvent.change(within(record).getAllByLabelText(/^Reason/)[0] as HTMLElement, {
      target: { value: 'Collects on site' },
    })
    fireEvent.click(within(record).getByRole('button', { name: 'Give' }))
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/grants'))).toBe(true))
    expect(JSON.parse(String(calls.find((c) => c.url.endsWith('/grants'))?.init?.body))).toEqual({
      kind: 'capability',
      name: 'collect',
      reason: 'Collects on site',
      training: { completedOn: '2026-10-20', description: 'Synthetic: cash handling and receipts' },
    })
  })

  it('[HH-STAFF-02][HH-STAFF-03] a re-enabled person waits for the permission review; each grant is restored or declined (TSK-0151)', async () => {
    const earlier = {
      id: '77777777-7777-4777-8777-777777777777',
      kind: 'role' as const,
      name: 'office',
      issuedBy: { staffUserId: OWNER, name: 'Synthetic Owner', system: false },
      reason: 'Synthetic desk',
      effectiveFrom: '2026-09-01T15:00:00.000Z',
      endedAt: '2026-10-20T15:00:00.000Z',
      endedBy: { staffUserId: OWNER, name: 'Synthetic Owner', system: false },
      training: null,
    }
    const item = (id: string, name: string, grantId: string) => ({
      id,
      earlierGrantId: grantId,
      kind: 'role' as const,
      name,
      decision: null,
      decidedAt: null,
      decidedBy: null,
      reason: null,
      grantId: null,
    })
    const reviewing = detail({
      roles: [],
      permissionReviewOpen: true,
      grants: [{ ...earlier, id: '55555555-5555-4555-8555-555555555555', name: 'worker' }, earlier],
      permissionReview: {
        id: '88888888-8888-4888-8888-888888888888',
        openedAt: '2026-10-20T15:00:00.000Z',
        openedBy: { staffUserId: OWNER, name: 'Synthetic Owner', system: false },
        items: [
          item('99999999-9999-4999-8999-999999999991', 'worker', '55555555-5555-4555-8555-555555555555'),
          item('99999999-9999-4999-8999-999999999992', 'office', earlier.id),
        ],
      },
    })
    const { calls, fetchImpl } = api((url, init) => {
      if (url === '/api/v1/staff/members')
        return json(200, { members: [summary({ roles: [], permissionReviewOpen: true })] })
      if (url === `/api/v1/staff/members/${ANN}`) return json(200, reviewing)
      if (url.endsWith('/permission-review/restore') && init?.method === 'POST') return json(200, reviewing)
      if (url.endsWith('/permission-review/decline') && init?.method === 'POST') return json(200, reviewing)
      return undefined
    })
    const { t } = staffTranslator('en')
    render(<StaffScreen t={t} locale="en" fetchImpl={fetchImpl} onSession={() => {}} openId={ANN} />)
    const card = await screen.findByTestId('staff-member')
    expect(within(card).getByText('Permission review waiting')).toBeTruthy()
    expect(within(card).getByTestId('staff-member-roles').textContent).toBe('Roles: none')
    // The deep link opened the record: the review lists each earlier grant, nothing restored by itself.
    const review = await screen.findByTestId('staff-permission-review')
    expect(
      within(review)
        .getAllByTestId('staff-review-item')
        .map((i) => i.textContent),
    ).toEqual([
      expect.stringContaining('Worker waiting for your review'),
      expect.stringContaining('Office / Dispatcher waiting for your review'),
    ])
    fireEvent.change(within(review).getByLabelText(/^Reason for restoring or declining/), {
      target: { value: 'Back on the crew' },
    })
    fireEvent.click(within(review).getByRole('button', { name: 'Restore Worker' }))
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/restore'))).toBe(true))
    expect(JSON.parse(String(calls.find((c) => c.url.endsWith('/restore'))?.init?.body))).toEqual({
      itemId: '99999999-9999-4999-8999-999999999991',
      reason: 'Back on the crew',
    })
    fireEvent.click(
      await within(screen.getByTestId('staff-permission-review')).findByRole('button', {
        name: 'Decline Office / Dispatcher',
      }),
    )
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/decline'))).toBe(true))
    expect(JSON.parse(String(calls.find((c) => c.url.endsWith('/decline'))?.init?.body))).toEqual({
      itemId: '99999999-9999-4999-8999-999999999992',
    })
  })

  it('[HH-STAFF-03] a refusal is written out (the last active Owner stays)', async () => {
    const { fetchImpl } = api((url, init) =>
      url.endsWith('/grants/end') && init?.method === 'POST' ? refusal(409, 'CONFLICT', ['LAST_ROLE']) : undefined,
    )
    const { t } = staffTranslator('en')
    render(<StaffScreen t={t} locale="en" fetchImpl={fetchImpl} onSession={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Manage Synthetic Ann' }))
    const record = await screen.findByTestId('staff-member-record')
    fireEvent.click(within(record).getByRole('button', { name: 'End Worker' }))
    expect((await within(record).findByRole('alert')).textContent).toContain(
      'A person keeps at least one role. To remove access, disable the account.',
    )
  })
})
