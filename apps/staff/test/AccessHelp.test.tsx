// Help with customer access on the staff app (TSK-0149; OWN-DEC-198 F2, F4, F5, HH-ID-11, HH-ID-09). The API is a
// synthetic stand-in; every value is synthetic (RULE-SYNTHETIC-DATA).
import { staffTranslator } from '@handyhub/i18n'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Fetch } from '../src/api'
import { AccessHelpScreen, helpRefusal, type HelpDetail, type HelpRequest } from '../src/AccessHelp'

afterEach(cleanup)

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const href = (p: string) => p
const REQUEST: HelpRequest = {
  id: '99999999-9999-4999-8999-999999999149',
  kind: 'project_link',
  channel: 'email',
  contact: 'help-synthetic@example.test',
  reference: 'HH-SYNTH149',
  createdAt: '2026-10-24T15:00:00.000Z',
  state: 'open',
  outcome: null,
  note: null,
  closedBy: null,
  closedAt: null,
  version: 1,
}
const DETAIL: HelpDetail = {
  ...REQUEST,
  matches: {
    accounts: [
      {
        id: 'acct-149',
        email: 'help-synthetic@example.test',
        phone: null,
        createdAt: '2026-10-20T15:00:00.000Z',
        liveSessions: 2,
        projects: ['HH-SYNTH149'],
        recovery: null,
      },
    ],
    projects: [
      {
        id: 'proj-149',
        reference: 'HH-SYNTH149',
        matchedBy: ['reference', 'email'],
        contact: { name: 'Synthetic Customer', email: 'help-synthetic@example.test', phone: '+15025550149' },
        link: { state: 'revoked', revokeReason: 'staff_revoked', expiresAt: '2026-10-25T15:00:00.000Z' },
        reissuesToday: 3,
        reissueLimit: 3,
      },
    ],
  },
}

describe('AccessHelpScreen (TSK-0149)', () => {
  it('[HH-ID-09][HH-ID-03] lists what visitors typed, never as proof; Spanish', async () => {
    const fetchImpl: Fetch = async () => json(200, { open: [REQUEST], closed: [] })
    render(<AccessHelpScreen t={staffTranslator('es').t} locale="es" fetchImpl={fetchImpl} href={href} />)
    const item = await screen.findByTestId('access-help-item')
    expect(item.textContent).toContain('Necesita un nuevo enlace del proyecto')
    expect(item.textContent).toContain('help-synthetic@example.test · HH-SYNTH149')
    expect(within(item).getByRole('link', { name: 'Abrir la solicitud' }).getAttribute('href')).toBe(
      `/access-help/${REQUEST.id}`,
    )
    expect(screen.getByText(/nunca envíe un enlace ni un código a lo que escribió/)).toBeTruthy()
  })

  it('[HH-ID-09][HH-ID-04] one request: its matches, a new link to the contact on file after identity checks, then close', async () => {
    const posts: [string, unknown][] = []
    let closed = false
    const fetchImpl: Fetch = async (input, init) => {
      if (init?.method !== 'POST')
        return json(200, closed ? { ...DETAIL, state: 'closed', outcome: 'access_restored' } : DETAIL)
      posts.push([String(input), JSON.parse(String(init.body))])
      if (String(input).endsWith('/close')) closed = true
      return String(input).endsWith('/access-link')
        ? json(201, { grantId: 'g', expiresAt: '2026-10-25T15:00:00.000Z', sentTo: 'h***@example.test' })
        : json(200, DETAIL)
    }
    render(
      <AccessHelpScreen
        t={staffTranslator('en').t}
        locale="en"
        fetchImpl={fetchImpl}
        href={href}
        requestId={REQUEST.id}
      />,
    )
    const project = await screen.findByTestId('access-help-project')
    expect(project.textContent).toContain('Link revoked · revoked by staff')
    expect(project.textContent).toContain('Matched by the reference, the email on the request')
    expect(project.textContent).toContain('3 of 3 new links asked for today')
    expect(screen.getByTestId('access-help-account').textContent).toContain('2 active sessions')
    const link = screen.getByTestId('access-help-link')
    fireEvent.click(within(link).getByRole('button', { name: 'Send a new link to the contact on file' }))
    fireEvent.click(within(link).getByRole('button', { name: 'Send a new link to the contact on file' }))
    expect(within(link).getByRole('alert').textContent).toBe('Fill in every field.')
    fireEvent.change(within(link).getByLabelText(/How you verified their identity/), {
      target: { value: 'Synthetic: called the number on file' },
    })
    fireEvent.click(within(link).getByRole('button', { name: 'Send a new link to the contact on file' }))
    await waitFor(() =>
      expect(within(link).getByRole('status').textContent).toBe('A new link is on its way to h***@example.test.'),
    )
    const close = screen.getByTestId('access-help-close')
    fireEvent.change(within(close).getByLabelText(/Note/), { target: { value: 'Synthetic: link sent' } })
    fireEvent.click(within(close).getByRole('button', { name: 'Close the request' }))
    await waitFor(() => expect(screen.queryByTestId('access-help-close')).toBeNull())
    expect(posts).toEqual([
      [
        '/api/v1/staff/projects/proj-149/access-link',
        { evidence: 'Synthetic: called the number on file', helpRequestId: REQUEST.id },
      ],
      [`/api/v1/staff/access-help/${REQUEST.id}/close`, { outcome: 'access_restored', note: 'Synthetic: link sent' }],
    ])
  })

  it('[HH-ID-11] the Owner ends every session with a reason and starts a recovery; refusals in words', async () => {
    const posts: [string, unknown][] = []
    const fetchImpl: Fetch = async (input, init) => {
      if (init?.method !== 'POST') return json(200, DETAIL)
      posts.push([String(input), JSON.parse(String(init.body))])
      if (String(input).endsWith('/recovery'))
        return json(409, { error: { code: 'CONFLICT', fieldErrors: [{ field: 'body.email', code: 'email_in_use' }] } })
      return json(200, { endedSessions: 2 })
    }
    render(
      <AccessHelpScreen
        t={staffTranslator('en').t}
        locale="en"
        fetchImpl={fetchImpl}
        href={href}
        requestId={REQUEST.id}
      />,
    )
    const signOut = await screen.findByTestId('access-help-sign-out')
    fireEvent.click(within(signOut).getByRole('button', { name: 'Sign out everywhere' }))
    fireEvent.change(within(signOut).getByLabelText(/Reason/), { target: { value: 'Synthetic: suspected compromise' } })
    fireEvent.click(within(signOut).getByRole('button', { name: 'Sign out everywhere' }))
    await waitFor(() => expect(within(signOut).getByRole('status').textContent).toBe('2 sessions ended.'))
    const recovery = screen.getByTestId('access-help-recovery')
    fireEvent.click(within(recovery).getByRole('button', { name: 'Start a recovery with a new email' }))
    fireEvent.change(within(recovery).getByLabelText(/New sign-in email/), {
      target: { value: 'new-synthetic@example.test' },
    })
    fireEvent.change(within(recovery).getByLabelText(/How you verified their identity/), {
      target: { value: 'Synthetic: in person' },
    })
    fireEvent.click(within(recovery).getByRole('button', { name: 'Start a recovery with a new email' }))
    await waitFor(() =>
      expect(within(recovery).getByRole('alert').textContent).toBe('Another account already signs in with that email.'),
    )
    expect(posts).toEqual([
      ['/api/v1/staff/customer-accounts/acct-149/sign-out-everywhere', { reason: 'Synthetic: suspected compromise' }],
      [
        '/api/v1/staff/customer-accounts/acct-149/recovery',
        { email: 'new-synthetic@example.test', evidence: 'Synthetic: in person', helpRequestId: REQUEST.id },
      ],
    ])
    const t = staffTranslator('en').t
    expect(helpRefusal(t, { code: 'FORBIDDEN', fieldErrors: [] })).toBe('Only the Owner can do this.')
  })
})
