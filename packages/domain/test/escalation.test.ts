// The escalation procedure: the Owner's number format and contact state (TSK-0129; HH-PKT-09, OWN-DEC-172). Every
// number is a synthetic 555-01XX number (RULE-SYNTHETIC-DATA).
import { describe, expect, it } from 'vitest'
import {
  CALL_911,
  displayOwnerPhone,
  ESCALATION_ACTIONS,
  normalizeOwnerPhone,
  ownerContactOf,
} from '../src/escalation.js'

describe('[HH-PKT-09][OWN-DEC-172] the Owner number and Call 911', () => {
  it('accepts a North American number as typed and stores +1 and ten digits', () => {
    for (const typed of [
      '(502) 555-0142',
      '502-555-0142',
      '502.555.0142',
      '5025550142',
      '1 502 555 0142',
      '+1 502 555 0142',
    ])
      expect(normalizeOwnerPhone(typed), typed).toBe('+15025550142')
  })

  it('refuses what is not a North American number; nothing is guessed', () => {
    for (const typed of [
      '',
      '555-0142',
      '+44 20 7946 0958',
      '(102) 555-0142',
      '(502) 155-0142',
      'call me',
      '502 555 01423',
    ])
      expect(normalizeOwnerPhone(typed), typed).toBeNull()
  })

  it('shows the number and its phone link; an empty or malformed one is NOT CONFIGURED', () => {
    expect(displayOwnerPhone('+15025550142')).toBe('(502) 555-0142')
    expect(ownerContactOf('+15025550142')).toEqual({
      state: 'configured',
      phone: '+15025550142',
      display: '(502) 555-0142',
      tel: 'tel:+15025550142',
    })
    expect(ownerContactOf(null)).toEqual({ state: 'not_configured' })
    expect(ownerContactOf('5025550142')).toEqual({ state: 'not_configured' })
  })

  it('Call 911 is a plain phone link that needs nothing else; three actions are recorded', () => {
    expect(CALL_911).toBe('tel:911')
    expect(ESCALATION_ACTIONS).toEqual(['call_owner', 'call_911', 'owner_unreachable'])
  })
})
