// Staff sign-in building blocks (TSK-0014; HH-STAFF-01, HH-SEC-02).
import { describe, expect, it } from 'vitest'
import { checkPassword, hashPassword, needsRehash, verifyPassword } from '../../src/modules/identity/passwords.js'
import { clearedSessionCookie, readSessionToken, sessionCookie } from '../../src/modules/identity/sessions.js'
import { networkOf } from '../../src/modules/identity/rate-limit.js'
import { hashToken, newToken } from '../../src/modules/identity/tokens.js'

const phrase = (...w: string[]) => w.join(' ')

describe('password policy and hashing (TSK-0014, HH-STAFF-01)', () => {
  it('[HH-STAFF-01] is length-based and refuses common or context-only values', () => {
    expect(checkPassword('too short')).toBe('too_short')
    expect(checkPassword('x'.repeat(129))).toBe('too_long')
    expect(checkPassword('passwordpassword')).toBe('common')
    expect(checkPassword('abcabcabcabcabcabc')).toBe('common')
    expect(checkPassword('worker-synthetic2026!!', ['worker-synthetic@example.test'])).toBe('contains_context')
    expect(checkPassword(phrase('quiet', 'ladder', 'under', 'blue', 'porch'))).toBeNull()
  })

  it('[HH-SEC-02] hashes with argon2id and verifies in equal work for a missing hash', async () => {
    const secret = phrase('quiet', 'ladder', 'under', 'blue', 'porch')
    const hash = await hashPassword(secret)
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/)
    expect(needsRehash(hash)).toBe(false)
    expect(await verifyPassword(hash, secret)).toBe(true)
    expect(await verifyPassword(hash, `${secret}!`)).toBe(false)
    expect(await verifyPassword(null, secret)).toBe(false)
  })
})

describe('session cookies and tokens (TSK-0014, HH-SEC-02)', () => {
  it('[HH-SEC-02] uses a __Host- Secure cookie in staging and production and reads only well-formed tokens', () => {
    const token = newToken()
    expect(sessionCookie(token, { secure: true })).toBe(
      `__Host-hh_staff=${token}; Path=/; HttpOnly; SameSite=Strict; Secure`,
    )
    expect(clearedSessionCookie({ secure: false })).toBe('hh_staff=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0')
    expect(readSessionToken(`a=b; hh_staff=${token}`, { secure: false })).toBe(token)
    expect(readSessionToken(`hh_staff=${token}`, { secure: true })).toBeNull()
    expect(readSessionToken('hh_staff=not-a-token', { secure: false })).toBeNull()
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('keys IPv6 clients by their /64', () => {
    expect(networkOf('2001:db8:1:2:3:4:5:6')).toBe('2001:db8:1:2::/64')
    expect(networkOf('::ffff:192.0.2.1')).toBe('192.0.2.1')
  })
})
