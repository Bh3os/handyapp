// Property records (TSK-0045; HH-CRM-02, HH-CRM-03): the detail codes, the access-code guard for ordinary text and
// address comparison. Values are synthetic.
import { describe, expect, it } from 'vitest'
import {
  looksLikeAccessCode,
  PROPERTY_DETAILS,
  PROPERTY_TEXT_DETAILS,
  sameAddress,
  STAFF_DETAIL_SOURCES,
} from '../src/index.js'

describe('property records (TSK-0045)', () => {
  it('[HH-CRM-02] the address and type are structured; every other detail is text; staff never record request_form', () => {
    expect(PROPERTY_DETAILS.slice(0, 2)).toEqual(['address', 'property_type'])
    expect(PROPERTY_TEXT_DETAILS).toHaveLength(PROPERTY_DETAILS.length - 2)
    expect(PROPERTY_TEXT_DETAILS).not.toContain('address')
    expect(STAFF_DETAIL_SOURCES).not.toContain('request_form')
  })

  it('[HH-CRM-03] text that writes down an access code is recognised', () => {
    for (const text of [
      'Side gate, code 4821#',
      'Gate code: 48-21',
      'lockbox combo is 7 3 9',
      'PIN 0042',
      'Keypad 1234*',
    ])
      expect(looksLikeAccessCode(text), text).toBe(true)
    for (const text of [
      'Use the side gate; the code is in the protected store.',
      'Two cats, keep the back door closed.',
      'Park on 4th Street, unit 204.',
      'Code word for the dog: friendly',
    ])
      expect(looksLikeAccessCode(text), text).toBe(false)
  })

  it('[HH-CRM-02] the same address ignores case and spacing; a different unit is a different address', () => {
    const a = { street: '45 Synthetic Lane', unit: 'Unit 2', city: 'Testville', state: 'KY', zip: '40045' }
    expect(sameAddress(a, { ...a, street: ' 45  synthetic lane ', city: 'TESTVILLE' })).toBe(true)
    expect(sameAddress(a, { ...a, unit: null })).toBe(false)
    expect(sameAddress({ ...a, unit: null }, { ...a, unit: '' })).toBe(true)
  })
})
