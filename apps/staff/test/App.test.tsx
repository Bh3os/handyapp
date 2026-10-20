import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App, routeOf } from '../src/App'

afterEach(cleanup)

const json = (status: number, body: unknown) =>
  new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('HandyHub staff skeleton (TSK-0001, HH-AUD-01)', () => {
  it('renders the brand from the staff catalog', () => {
    render(<App path="/staff/sign-in" base="/staff/" fetchImpl={vi.fn()} navigate={vi.fn()} />)
    expect(screen.getByText('HandyHub staff')).toBeTruthy()
  })
})

describe('staff text from the catalogs (TSK-0008, HH-LANG-02)', () => {
  it('[HH-LANG-02] renders the sign-in page from the Spanish staff catalog', () => {
    render(<App locale="es" path="/staff/sign-in" base="/staff/" fetchImpl={vi.fn()} navigate={vi.fn()} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Inicio de sesión del personal' })).toBeTruthy()
    expect(screen.getByText('HandyHub para el personal')).toBeTruthy()
  })
})

describe('staff sign-in screens (TSK-0014, HH-STAFF-01)', () => {
  it('[HH-STAFF-01] routes /sign-in, /invite/:token and /reset/:token below the base', () => {
    expect(routeOf('/staff/sign-in', '/staff/')).toEqual({ page: 'sign-in' })
    expect(routeOf('/staff/invite/abc_DEF-123', '/staff/')).toEqual({
      page: 'set-password',
      purpose: 'invite',
      token: 'abc_DEF-123',
    })
    expect(routeOf('/staff/reset/xyz', '/staff/')).toEqual({ page: 'set-password', purpose: 'reset', token: 'xyz' })
    expect(routeOf('/staff/', '/staff/')).toEqual({ page: 'home' })
  })

  it('[HH-STAFF-01] a failed sign-in shows the generic message; Forgot password? shows the neutral confirmation', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(401, { error: { code: 'INVALID_CREDENTIALS', fieldErrors: [] } }))
      .mockResolvedValueOnce(json(202, { accepted: true }))
    render(<App path="/staff/sign-in" base="/staff/" fetchImpl={fetchImpl} navigate={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'someone@example.test' } })
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'wrong value' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('The email or password is not correct.'),
    )
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('/api/v1/auth/sign-in')

    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'someone@example.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
    await waitFor(() => expect(screen.getByText(/If that email belongs to a staff account/)).toBeTruthy())
  })

  it('[HH-STAFF-01] an expired link says so and offers the way back', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(json(410, { error: { code: 'LINK_INVALID', fieldErrors: [] } }))
    render(<App path="/staff/reset/expired-token" base="/staff/" fetchImpl={fetchImpl} navigate={vi.fn()} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Choose a new password' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText(/New password/), { target: { value: 'a long enough passphrase here' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save password' }))
    await waitFor(() => expect(screen.getByText(/This link has expired or was already used/)).toBeTruthy())
  })
})

describe('optional MFA and CSRF in the staff app (TSK-0015, HH-STAFF-01, HH-SEC-02)', () => {
  it('[HH-STAFF-01] asks for the authenticator code after the password when MFA is enrolled', async () => {
    const session = {
      staffUserId: 'u1',
      displayName: 'Synthetic Owner',
      email: 'owner@example.test',
      locale: 'en',
      roles: ['owner'],
      mfaEnrolled: true,
      mfaRecommended: false,
      csrfToken: 'synthetic-csrf-token',
    }
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(202, { mfaRequired: true }))
      .mockResolvedValueOnce(json(200, session))
      .mockResolvedValue(json(200, session))
    const navigate = vi.fn()
    render(<App path="/staff/sign-in" base="/staff/" fetchImpl={fetchImpl} navigate={navigate} />)
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'owner@example.test' } })
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'a long enough passphrase' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: 'Enter your authenticator code' })).toBeTruthy(),
    )
    fireEvent.change(screen.getByLabelText(/Authenticator code/), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/staff/'))
    const [url, init] = fetchImpl.mock.calls[1] as [string, RequestInit]
    expect(url).toBe('/api/v1/auth/mfa/verify')
    expect(JSON.parse(String(init.body))).toEqual({ code: '123456' })
  })
})
