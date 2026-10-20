// Session lifecycle and MFA building blocks (TSK-0015; HH-SEC-02, HH-STAFF-01, HH-STAFF-03).
import { describe, expect, it } from 'vitest'
import { ApiError } from '../../src/api/errors.js'
import { requireFreshAuth } from '../../src/api/fresh-auth.js'
import { currentCode, matchStep, seal, unseal } from '../../src/modules/identity/mfa.js'
import { csrfTokenFor } from '../../src/modules/identity/sessions.js'
import { newToken } from '../../src/modules/identity/tokens.js'
import { Secret } from '../../src/providers/types.js'

const key = new Secret(['synthetic', 'unit', 'test', 'sealing', 'key', 'value'].join('-'))

describe('MFA secrets and codes (TSK-0015, HH-STAFF-01)', () => {
  it('[HH-STAFF-01] seals the TOTP secret with AES-256-GCM and refuses a tampered value', () => {
    const sealed = seal(key, 'JBSWY3DPEHPK3PXP')
    expect(sealed).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
    expect(sealed).not.toContain('JBSWY3DPEHPK3PXP')
    expect(unseal(key, sealed)).toBe('JBSWY3DPEHPK3PXP')
    const parts = sealed.split('.')
    const tampered = [parts[0], parts[1], parts[2], `${parts[3]?.slice(0, -2)}AA`].join('.')
    expect(() => unseal(key, tampered)).toThrow()
    expect(() => unseal(new Secret('another-synthetic-key-of-enough-length'), sealed)).toThrow()
  })

  it('[HH-STAFF-01] accepts the current code within one step of drift and nothing else', () => {
    const secret = 'JBSWY3DPEHPK3PXP'
    const now = 1_760_000_000_000
    const step = Math.floor(now / 30_000)
    expect(matchStep(secret, currentCode(secret, now), now)).toBe(step)
    expect(matchStep(secret, currentCode(secret, now - 30_000), now)).toBe(step - 1)
    expect(matchStep(secret, currentCode(secret, now + 90_000), now)).toBeNull()
    expect(matchStep(secret, 'abcdef', now)).toBeNull()
  })
})

describe('CSRF token and fresh authentication (TSK-0015, HH-SEC-02, HH-STAFF-03)', () => {
  it('[HH-SEC-02] the CSRF token is derived from the session token and differs per session', () => {
    const a = newToken()
    expect(csrfTokenFor(a)).toBe(csrfTokenFor(a))
    expect(csrfTokenFor(a)).not.toBe(csrfTokenFor(newToken()))
    expect(csrfTokenFor(a)).not.toContain(a)
  })

  it('[HH-STAFF-03] requireFreshAuth refuses an old or missing authentication', () => {
    const now = new Date('2026-10-20T12:00:00Z')
    expect(() => requireFreshAuth(new Date('2026-10-20T11:58:00Z'), 5, now)).not.toThrow()
    expect(() => requireFreshAuth(new Date('2026-10-20T11:54:00Z'), 5, now)).toThrow(ApiError)
    expect(() => requireFreshAuth(undefined, 5, now)).toThrow(expect.objectContaining({ code: 'FRESH_AUTH_REQUIRED' }))
  })
})
