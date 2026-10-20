import { describe, expect, it } from 'vitest'
import { isSecretField, redact, REDACTED } from '../../src/platform/redact.js'

// Secret-looking values are built at runtime so the secret scanner never sees a literal (RULE-SYNTHETIC-DATA).
const secret = (label: string) => ['synthetic', label, 'value', '7f3a'].join('-')

describe('secret-field redaction (TSK-0011, RULE-SERVER-AUTHZ, HH-SEC-06)', () => {
  it('recognises secret fields in any case or separator style, and keeps ordinary fields', () => {
    for (const k of [
      'password',
      'newPassword',
      'password_hash',
      'sessionToken',
      'refresh-token',
      'clientSecret',
      'Authorization',
      'cookie',
      'code',
      'otp',
      'accessCode',
      'access_code',
      'Access-Instructions',
      'gateCode',
      'messageBody',
    ])
      expect(isSecretField(k), k).toBe(true)
    for (const k of ['serviceCode', 'zip_code', 'postalCode', 'status', 'email', 'tokenCount', 'passwordChangedAt'])
      expect(isSecretField(k), k).toBe(false)
  })

  it('redacts at any depth, inside arrays, and the values of change entries naming a secret field', () => {
    const input = {
      status: 'sent',
      contact: { name: 'Test Customer', credentials: [{ password: secret('pw') }] },
      changes: [
        { field: 'status', from: 'draft', to: 'sent' },
        { field: 'accessInstructions', from: secret('old'), to: secret('new') },
      ],
      headers: { authorization: secret('auth') },
    }
    const out = redact(input)
    expect(out).toEqual({
      status: 'sent',
      contact: { name: 'Test Customer', credentials: [{ password: REDACTED }] },
      changes: [
        { field: 'status', from: 'draft', to: 'sent' },
        { field: 'accessInstructions', from: REDACTED, to: REDACTED },
      ],
      headers: { authorization: REDACTED },
    })
    expect(JSON.stringify(out)).not.toMatch(/synthetic-/)
    expect(input.contact.credentials[0]?.password).toBe(secret('pw'))
  })

  it('survives cycles and keeps shared references that are not cycles', () => {
    const shared = { status: 'ok' }
    const cyclic: Record<string, unknown> = { a: shared, b: shared }
    cyclic['self'] = cyclic
    expect(redact(cyclic)).toEqual({ a: { status: 'ok' }, b: { status: 'ok' }, self: REDACTED })
  })
})
