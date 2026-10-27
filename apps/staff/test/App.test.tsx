import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App, routeOf, runtimeBase } from '../src/App'

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

describe('two origins (TSK-0017, HH-ARC-06)', () => {
  it('[HH-ARC-06] the base is /staff/ under /staff on the single host and / on the staff host', () => {
    expect(runtimeBase('/staff/sign-in', '/staff/')).toBe('/staff/')
    expect(runtimeBase('/staff', '/staff/')).toBe('/staff/')
    expect(runtimeBase('/sign-in', '/staff/')).toBe('/')
    expect(runtimeBase('/staffing', '/staff/')).toBe('/')
    expect(runtimeBase('/sign-in', '/')).toBe('/')
    expect(routeOf('/invite/abc', runtimeBase('/invite/abc', '/staff/'))).toEqual({
      page: 'set-password',
      purpose: 'invite',
      token: 'abc',
    })
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
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('/api/v1/staff/auth/sign-in')

    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'someone@example.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
    await waitFor(() => expect(screen.getByText(/If that email belongs to a staff account/)).toBeTruthy())
  })

  it('[HH-SEC-04][HH-SEC-02] the link token leaves the address bar and history once read; the form keeps working (TSK-0109 LINK-1)', async () => {
    const token = ['synthetic', 'link', 'token', 'X1'].join('_')
    window.history.replaceState(null, '', `/staff/invite/${token}`)
    const fetchImpl = vi.fn().mockResolvedValueOnce(json(410, { error: { code: 'LINK_INVALID', fieldErrors: [] } }))
    render(<App base="/staff/" fetchImpl={fetchImpl} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Set your password' })).toBeTruthy()
    await waitFor(() => expect(window.location.pathname).toBe('/staff/invite'))
    expect(window.location.href).not.toContain(token)
    fireEvent.change(screen.getByLabelText(/New password/), { target: { value: 'a long enough passphrase here' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save password' }))
    await waitFor(() => expect(fetchImpl).toHaveBeenCalled())
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toMatchObject({ token })
    window.history.replaceState(null, '', '/')
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

describe('mandatory MFA and CSRF in the staff app (TSK-0015, TSK-0154, HH-STAFF-01, HH-SEC-02)', () => {
  it('[HH-STAFF-01] asks for the authenticator code after the password when MFA is enrolled', async () => {
    const session = {
      staffUserId: 'u1',
      displayName: 'Synthetic Owner',
      email: 'owner@example.test',
      locale: 'en',
      roles: ['owner'],
      mfaEnrolled: true,
      csrfToken: 'synthetic-csrf-token',
    }
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(202, { mfaRequired: true, step: 'verify' }))
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
    expect(url).toBe('/api/v1/staff/auth/mfa/verify')
    expect(JSON.parse(String(init.body))).toEqual({ code: '123456' })
  })

  it('[HH-STAFF-01][HH-SEC-02] an account without an authenticator sets one up before any staff screen', async () => {
    const session = {
      staffUserId: 'u2',
      displayName: 'Synthetic Worker',
      email: 'worker@example.test',
      locale: 'en',
      roles: ['worker'],
      mfaEnrolled: true,
      csrfToken: 'synthetic-csrf-token',
    }
    const setupKey = ['SYNTHETIC', 'SETUP', 'KEY'].join('')
    const codes = ['aaaa-bbbb-cccc-dddd', 'eeee-ffff-0000-1111']
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(202, { mfaRequired: true, step: 'enroll' }))
      .mockResolvedValueOnce(
        json(200, { secret: setupKey, otpauthUri: `otpauth://totp/HandyHub:worker?secret=${setupKey}` }),
      )
      .mockResolvedValueOnce(
        json(401, {
          error: { code: 'INVALID_CREDENTIALS', message: '', fieldErrors: [], requestId: 'r', retryable: false },
        }),
      )
      .mockResolvedValueOnce(json(200, { recoveryCodes: codes, session }))
      .mockResolvedValue(json(200, session))
    const navigate = vi.fn()
    render(<App path="/staff/sign-in" base="/staff/" fetchImpl={fetchImpl} navigate={navigate} />)
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'worker@example.test' } })
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'a long enough passphrase' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: 'Set up your authenticator app' })).toBeTruthy(),
    )
    await waitFor(() => expect(screen.getByTestId('mfa-secret').textContent).toBe(setupKey))
    expect(fetchImpl.mock.calls[1]?.[0]).toBe('/api/v1/staff/auth/mfa/enroll')
    fireEvent.change(screen.getByLabelText(/Authenticator code/), { target: { value: '000000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() =>
      expect(screen.getByText('That code is not correct or was already used. Enter the current code.')).toBeTruthy(),
    )
    fireEvent.change(screen.getByLabelText(/Authenticator code/), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: 'Save your recovery codes' })).toBeTruthy(),
    )
    expect(screen.getByTestId('mfa-recovery-codes').textContent).toContain(codes[0])
    // Nothing opens before the codes are acknowledged.
    expect(navigate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'I saved my recovery codes' }))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/staff/'))
    const [url, init] = fetchImpl.mock.calls[3] as [string, RequestInit]
    expect(url).toBe('/api/v1/staff/auth/mfa/confirm')
    expect(JSON.parse(String(init.body))).toEqual({ code: '123456' })
    // The enrolment never offers to skip the authenticator.
    expect(screen.queryByText(/recommended/i)).toBeNull()
  })

  it('[HH-SEC-02] says so when the server refuses sign-in because the MFA key is NOT CONFIGURED (fail closed)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      json(503, {
        error: {
          code: 'NOT_CONFIGURED',
          message: '',
          fieldErrors: [{ field: 'mfa', code: 'MFA_NOT_CONFIGURED', message: '' }],
          requestId: 'r',
          retryable: false,
        },
      }),
    )
    render(<App path="/staff/sign-in" base="/staff/" fetchImpl={fetchImpl} navigate={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'owner@example.test' } })
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'a long enough passphrase' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(screen.getByText(/MFA_ENCRYPTION_KEY/)).toBeTruthy())
  })
})
