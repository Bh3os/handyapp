// The verification states of a contact channel (TSK-0033; HH-INT-13, HH-ID-06, ENT-Contact, OWN-DEC-96). Pure
// functions; synthetic values only.
import { describe, expect, it } from 'vitest'
import { MODULES } from '../../src/modules/index.js'
import {
  codeState,
  effectiveState,
  subjectRef,
  VERIFICATION_STATES,
} from '../../src/modules/verification/contact-verification.js'

const NOW = new Date('2026-10-21T12:00:00Z')
const code = (over: Partial<Parameters<typeof codeState>[0]> = {}) => ({
  destination: 'customer@example.test',
  consumed_at: null,
  superseded_at: null,
  expires_at: new Date(NOW.getTime() + 5 * 60_000),
  attempts: 0,
  max_attempts: 5,
  ...over,
})

describe('code and channel states (TSK-0033, HH-INT-13, HH-ID-06)', () => {
  it('[HH-INT-13] a code is pending, used, out of attempts, or expired when it ran out or was replaced', () => {
    expect(codeState(code(), NOW)).toBe('pending')
    expect(codeState(code({ consumed_at: NOW }), NOW)).toBe('used')
    expect(codeState(code({ attempts: 5 }), NOW)).toBe('failed')
    expect(codeState(code({ expires_at: NOW }), NOW)).toBe('expired')
    expect(codeState(code({ superseded_at: NOW }), NOW)).toBe('expired')
  })

  it('[HH-INT-13][HH-ID-06] the shown state follows the latest code of the current value; verified stays verified', () => {
    expect(effectiveState('unverified', undefined, NOW)).toBe('unverified')
    expect(effectiveState('pending', code(), NOW)).toBe('pending')
    // A code that simply ran out shows as expired before anyone tries it.
    expect(effectiveState('pending', code({ expires_at: new Date(NOW.getTime() - 1) }), NOW)).toBe('expired')
    expect(effectiveState('pending', code({ attempts: 5 }), NOW)).toBe('failed')
    // A new code after an expired or failed one is pending again.
    expect(effectiveState('failed', code(), NOW)).toBe('pending')
    expect(effectiveState('verified', code({ attempts: 5 }), NOW)).toBe('verified')
    expect(effectiveState('pending', undefined, NOW)).toBe('expired')
    expect(VERIFICATION_STATES).toEqual(['unverified', 'pending', 'verified', 'expired', 'failed'])
  })

  it('[HH-INT-13] email and phone are separate code subjects of the contact', () => {
    expect(subjectRef('c-1', 'email')).toBe('contact:c-1:email')
    expect(subjectRef('c-1', 'phone')).toBe('contact:c-1:phone')
  })

  it('[RULE-SERVER-AUTHZ][HH-INT-13] every receipt route needs the receipt capability and records its writes', () => {
    const routes = MODULES.find((m) => m.name === 'verification')?.routes ?? []
    expect(routes.map((r) => `${r.method} ${r.path}`)).toEqual([
      'GET /public/request-receipt/contact',
      'POST /public/request-receipt/contact/codes',
      'POST /public/request-receipt/contact/verify',
      'POST /public/request-receipt/account-offer/decline',
    ])
    for (const r of routes) {
      expect(r.resource).toBeDefined()
      expect(r.actors).toEqual(['guest', 'customer'])
      if (r.kind === 'write') expect(r.audit).not.toBe('none')
    }
  })
})
