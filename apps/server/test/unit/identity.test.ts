// One-time code derivation, destinations and the session cookie (TSK-0016; HH-INT-13, HH-SEC-02, HH-ARC-06,
// RULE-LANGUAGES). Templates and database behaviour is in test/integration/customer-codes.test.ts.
import { describe, expect, it } from 'vitest'
import {
  CUSTOMER_COOKIE,
  maskForCustomer,
  normaliseDestination,
  readCodeKey,
  readSessionToken,
} from '../../src/modules/identity/index.js'
import { codeDigest, deriveCode, digestsEqual } from '../../src/modules/identity/keys.js'

const key = readCodeKey({ HANDYHUB_ENV: 'ci', CODE_HASH_KEY: 'synthetic-unit-code-key-'.repeat(2) })
if (key.state !== 'configured') throw new Error('key')

describe('code derivation (TSK-0016, HH-INT-13)', () => {
  it('derives the same fixed-length code for a row every time, and different codes for different rows', () => {
    const a = deriveCode(key.key, 'id-1', '0'.repeat(32), 6)
    expect(a).toMatch(/^\d{6}$/)
    expect(deriveCode(key.key, 'id-1', '0'.repeat(32), 6)).toBe(a)
    const many = new Set(Array.from({ length: 200 }, (_, i) => deriveCode(key.key, `id-${i}`, 'f'.repeat(32), 6)))
    expect(many.size).toBeGreaterThan(190)
  })

  it('compares keyed digests in constant time and never matches another code', () => {
    const d = codeDigest(key.key, 'id-1', '123456')
    expect(digestsEqual(d, codeDigest(key.key, 'id-1', '123456'))).toBe(true)
    expect(digestsEqual(d, codeDigest(key.key, 'id-1', '123457'))).toBe(false)
    expect(digestsEqual(d, codeDigest(key.key, 'id-2', '123456'))).toBe(false)
    expect(digestsEqual(d, '')).toBe(false)
  })

  it('local and ci without a key get a random per-process key; staging and production are NOT CONFIGURED', () => {
    expect(readCodeKey({ HANDYHUB_ENV: 'local' })).toMatchObject({ state: 'configured', ephemeral: true })
    expect(readCodeKey({ HANDYHUB_ENV: 'production' })).toEqual({ state: 'not_configured', missing: ['CODE_HASH_KEY'] })
    expect(String(key.key)).toBe('[REDACTED]')
  })
})

describe('destinations (TSK-0016, HH-INT-13)', () => {
  it('normalises e-mail and E.164 numbers and masks them for the receipt page', () => {
    expect(normaliseDestination('email', ' Jo@Example.TEST ')).toBe('jo@example.test')
    expect(normaliseDestination('sms', '+1 502-555-0100')).toBe('+15025550100')
    expect(normaliseDestination('sms', '502 555 0100')).toBeNull()
    expect(maskForCustomer('email', 'jo@example.test')).toBe('j***@example.test')
    expect(maskForCustomer('sms', '+15025550100')).toBe('***0100')
  })
})

describe('session cookie (TSK-0016, HH-ARC-06)', () => {
  it('reads only the __Host- customer cookie', () => {
    expect(CUSTOMER_COOKIE).toBe('__Host-hh_customer')
    expect(readSessionToken({ headers: { cookie: `a=1; ${CUSTOMER_COOKIE}=tok; b=2` } })).toBe('tok')
    expect(readSessionToken({ headers: { cookie: 'hh_customer=tok' } })).toBeUndefined()
    expect(readSessionToken({ headers: {} })).toBeUndefined()
  })
})
