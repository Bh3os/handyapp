// Call 911 and Call Owner on every job screen, and the Owner's escalation number (TSK-0129; HH-PKT-09, HH-WORK-13,
// HH-OFF-03, OWN-DEC-172, OWN-DEC-208). The API is a synthetic stand-in; the number is a synthetic 555-01XX number
// (RULE-SYNTHETIC-DATA).
import { staffTranslator, type StaffLocale } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  EscalationActions,
  EscalationProcedure,
  flushPendingEscalations,
  OwnerEscalationPhone,
  pendingEscalationCount,
  rememberOwnerContact,
} from '../src/Escalation'
import { StopWorkPanel } from '../src/StopWork'

beforeEach(() => window.localStorage.clear())
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.localStorage.clear()
})

const JOB = '22222222-2222-4222-8222-222222222129'
const VISIT = '11111111-1111-4111-8111-111111111129'
const OWNER = {
  state: 'configured' as const,
  phone: '+15025550142',
  display: '(502) 555-0142',
  tel: 'tel:+15025550142',
}
/** The owner's Spanish instruction, verbatim (OWN-DEC-172 item 6). */
const OWNER_SPANISH =
  'Si ocurre un problema, detén el trabajo afectado y llama primero al propietario para recibir instrucciones. Si hay una emergencia médica grave, un incendio, una fuga peligrosa de gas o cualquier peligro inmediato para la vida, llama al 911 sin esperar autorización. Avisa al propietario cuando sea seguro hacerlo.'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
type Post = { url: string; body: Record<string, unknown>; key: string | null }
/** A server that records escalation taps (or, offline, cannot be reached). */
function server(state: { online: boolean }, posts: Post[] = []) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (!state.online) throw new TypeError('Failed to fetch')
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
    posts.push({ url, body, key: new Headers(init?.headers).get('idempotency-key') })
    return json(201, {
      clientId: body['clientId'],
      jobId: JOB,
      action: body['action'],
      alreadyRecorded: false,
      workStaysPaused: body['action'] === 'owner_unreachable',
      owner: OWNER,
      emergency: { call911: 'tel:911' },
    })
  })
}
const actions = (fetchImpl: typeof fetch, locale: StaffLocale = 'en', owner: typeof OWNER | null = null) =>
  render(
    <EscalationActions
      t={staffTranslator(locale).t}
      fetchImpl={fetchImpl}
      jobId={JOB}
      visitId={VISIT}
      {...(owner ? { owner } : {})}
    />,
  )

describe('[HH-PKT-09][HH-WORK-13][OWN-DEC-172] Call 911 and Call Owner', () => {
  it('emergency: Call 911 comes first and never depends on the Owner, the network or the server', () => {
    for (const owner of [OWNER, null]) {
      if (!owner) window.localStorage.clear()
      const fetchImpl = vi.fn()
      const { container, unmount } = actions(fetchImpl as unknown as typeof fetch, 'en', owner)
      const call = screen.getByRole('link', { name: 'Call 911 — Immediate Emergency' })
      expect(call.getAttribute('href')).toBe('tel:911')
      expect(container.querySelector('a, button')).toBe(call)
      expect(
        screen.getByText(/Call 911 immediately, without waiting for Owner approval, if there is an actual or/),
      ).toBeTruthy()
      // Nothing was fetched to show it.
      expect(fetchImpl).not.toHaveBeenCalled()
      unmount()
    }
  })

  it('non-emergency: Call Owner dials the number the Owner entered; the tap is recorded after the call started', async () => {
    const posts: Post[] = []
    actions(server({ online: true }, posts) as unknown as typeof fetch, 'en', OWNER)
    const link = screen.getByRole('link', { name: 'Call Owner — Report a Problem' })
    expect(link.getAttribute('href')).toBe('tel:+15025550142')
    expect(screen.getByTestId('escalation-owner-number').textContent).toBe('(502) 555-0142')
    expect(screen.getByText(/For every problem that is not life-threatening/)).toBeTruthy()
    fireEvent.click(link)
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]?.url).toBe(`/api/v1/staff/jobs/${JOB}/escalation-calls`)
    expect(posts[0]?.body).toMatchObject({ action: 'call_owner', visitId: VISIT })
    expect(posts[0]?.key).toBe(`escalation-${String(posts[0]?.body['clientId'])}`)
    await waitFor(() => expect(pendingEscalationCount()).toBe(0))
  })

  it('Owner number missing: Call Owner says NOT CONFIGURED and to call 911; Call 911 stays first', () => {
    rememberOwnerContact({ state: 'not_configured' })
    actions(vi.fn() as unknown as typeof fetch)
    expect(screen.queryByRole('link', { name: 'Call Owner — Report a Problem' })).toBeNull()
    expect(screen.getByTestId('escalation-owner-not-configured').textContent).toBe(
      "Call Owner: the Owner's number is not in the app yet (NOT CONFIGURED). In an emergency, call 911.",
    )
    expect(screen.getByRole('link', { name: 'Call 911 — Immediate Emergency' }).getAttribute('href')).toBe('tel:911')
  })

  it('a phone that never received the contact says so instead of guessing', () => {
    actions(vi.fn() as unknown as typeof fetch)
    expect(screen.getByTestId('escalation-owner-not-configured').textContent).toContain(
      "the Owner's number is not on this phone yet",
    )
  })

  it('offline: the kept contact still dials; the tap waits on the phone and is sent once with its own UUID', async () => {
    rememberOwnerContact(OWNER)
    const state = { online: false }
    const posts: Post[] = []
    const fetchImpl = server(state, posts) as unknown as typeof fetch
    actions(fetchImpl)
    fireEvent.click(screen.getByRole('link', { name: 'Call 911 — Immediate Emergency' }))
    await waitFor(() => expect(pendingEscalationCount()).toBe(1))
    state.online = true
    expect(await flushPendingEscalations(fetchImpl)).toBe(1)
    expect(await flushPendingEscalations(fetchImpl)).toBe(0)
    expect(posts).toHaveLength(1)
    expect(posts[0]?.body).toMatchObject({ action: 'call_911', visitId: VISIT })
    expect(pendingEscalationCount()).toBe(0)
  })

  it('Owner unreachable: the work stays paused, it is recorded, and Call 911 is never gated or delayed', async () => {
    const posts: Post[] = []
    actions(server({ online: true }, posts) as unknown as typeof fetch, 'en', OWNER)
    fireEvent.click(screen.getByRole('button', { name: 'I could not reach the Owner' }))
    const said = screen.getByTestId('escalation-unreachable')
    // Shown at once, before the server answers.
    expect(within(said).getByText(/keep the affected work paused, secure the area if it is safe/)).toBeTruthy()
    expect(within(said).getByText(/call 911 immediately/)).toBeTruthy()
    expect(
      await within(said).findByText('Recorded. The affected work stays paused until the Owner decides.'),
    ).toBeTruthy()
    expect(posts[0]?.body).toMatchObject({ action: 'owner_unreachable' })
    const call = screen.getByRole('link', { name: 'Call 911 — Immediate Emergency' })
    expect(call.getAttribute('href')).toBe('tel:911')
    expect(call.getAttribute('aria-disabled')).toBeNull()
  })

  it('[HH-LANG-04] Spanish: the owner’s Spanish instruction exactly as given, on the actions and in the procedure', () => {
    actions(vi.fn() as unknown as typeof fetch, 'es', OWNER)
    expect(screen.getByRole('link', { name: 'Llamar al 911 — Emergencia inmediata' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Llamar al propietario — Reportar un problema' })).toBeTruthy()
    // Together the two notes are the owner's instruction, word for word, in its order.
    const notes = [
      screen.getByText(/^Si ocurre un problema/).textContent,
      screen.getByText(/^Si hay una emergencia médica grave/).textContent,
    ].join(' ')
    expect(notes).toBe(OWNER_SPANISH)
    cleanup()
    render(<EscalationProcedure t={staffTranslator('es').t} />)
    expect(screen.getByText(OWNER_SPANISH)).toBeTruthy()
  })

  it('[HH-WORK-09] Stop Work shows Call 911 first, then Call Owner, without loading anything', () => {
    rememberOwnerContact(OWNER)
    const fetchImpl = vi.fn()
    const { container } = render(
      <StopWorkPanel t={staffTranslator('en').t} fetchImpl={fetchImpl as unknown as typeof fetch} jobId={JOB} />,
    )
    const links = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(links.slice(0, 2)).toEqual(['tel:911', 'tel:+15025550142'])
    fireEvent.click(screen.getByRole('button', { name: 'Stop Work / Report Hazard' }))
    fireEvent.click(screen.getByLabelText('Other unsafe condition'))
    // The guidance names the Owner's number too.
    expect(within(screen.getByTestId('stop-guidance')).getByTestId('escalation-call-owner')).toBeTruthy()
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('[HH-PKT-09] the Owner enters the escalation number on their own account', () => {
  const own = (over: Record<string, unknown> = {}) => ({
    state: 'NOT_CONFIGURED',
    phone: null,
    display: null,
    version: 0,
    updatedAt: null,
    ...over,
  })

  it('NOT CONFIGURED until entered; saving sends the version shown and needs a fresh sign-in', async () => {
    const puts: { body: unknown; ifMatch: string | null }[] = []
    let fresh = false
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/v1/staff/profile/escalation-phone' && (init?.method ?? 'GET') === 'GET') return json(200, own())
      if (url === '/api/v1/staff/auth/reauth') {
        fresh = true
        return json(200, { csrfToken: 'c2' })
      }
      if (url === '/api/v1/staff/profile/escalation-phone' && init?.method === 'PUT') {
        if (!fresh) return json(403, { error: { code: 'FRESH_AUTH_REQUIRED', fieldErrors: [] } })
        puts.push({ body: JSON.parse(String(init.body)), ifMatch: new Headers(init.headers).get('if-match') })
        return json(200, own({ state: 'CONFIGURED', phone: '+15025550142', display: '(502) 555-0142', version: 1 }))
      }
      return json(404, { error: { code: 'NOT_FOUND', fieldErrors: [] } })
    })
    render(<OwnerEscalationPhone t={staffTranslator('en').t} fetchImpl={fetchImpl as unknown as typeof fetch} />)
    expect((await screen.findByTestId('escalation-phone-current')).textContent).toContain('NOT CONFIGURED')
    fireEvent.change(screen.getByLabelText('Your phone number'), { target: { value: '(502) 555-0142' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save number' }))
    const reauth = await screen.findByTestId('owner-reauth')
    fireEvent.change(within(reauth).getByLabelText(/password/i), { target: { value: 'synthetic passphrase' } })
    fireEvent.submit(reauth)
    expect(await screen.findByText('In every job packet now: (502) 555-0142')).toBeTruthy()
    expect(puts).toEqual([{ body: { phone: '(502) 555-0142' }, ifMatch: '"0"' }])
  })

  it('a number the server refuses is said; another role sees nothing', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) =>
      (init?.method ?? 'GET') === 'GET'
        ? json(200, own())
        : json(400, {
            error: { code: 'VALIDATION_FAILED', fieldErrors: [{ field: 'body.phone', code: 'invalidPhone' }] },
          }),
    )
    render(<OwnerEscalationPhone t={staffTranslator('en').t} fetchImpl={fetchImpl as unknown as typeof fetch} />)
    fireEvent.change(await screen.findByLabelText('Your phone number'), { target: { value: '555-0142' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save number' }))
    expect(await screen.findByText('Enter a US phone number with its area code.')).toBeTruthy()
    cleanup()
    const refused = vi.fn(async () => json(403, { error: { code: 'FORBIDDEN', fieldErrors: [] } }))
    const { container } = render(
      <OwnerEscalationPhone t={staffTranslator('en').t} fetchImpl={refused as unknown as typeof fetch} />,
    )
    await waitFor(() => expect(refused).toHaveBeenCalled())
    expect(container.textContent).toBe('')
  })
})
