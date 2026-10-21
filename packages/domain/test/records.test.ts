// Visibility classes, candidate-match normalization and the note content guard (TSK-0044; HH-STAFF-05, HH-ID-02,
// HH-CRM-01). Every value is synthetic.
import { describe, expect, it } from 'vitest'
import {
  addressKey,
  DEFAULT_VISIBILITY,
  looksLikeCardNumber,
  nameKey,
  normalizeEmail,
  normalizePhone,
  NOTE_VISIBILITIES,
  sortReasons,
  suggests,
  VISIBILITY_CLASSES,
} from '../src/index.js'

describe('visibility classes (TSK-0044, HH-STAFF-05)', () => {
  it('[HH-STAFF-05] exactly the four classes; internal by default; a note is never customer-shared', () => {
    expect(VISIBILITY_CLASSES).toEqual([
      'internal_operational',
      'restricted_incident',
      'restricted_financial',
      'customer_shared',
    ])
    expect(DEFAULT_VISIBILITY).toBe('internal_operational')
    expect(NOTE_VISIBILITIES).not.toContain('customer_shared')
    expect(VISIBILITY_CLASSES).not.toContain('marketing')
  })
})

describe('conservative matching (TSK-0044, HH-ID-02)', () => {
  it('[HH-ID-02] an email changes only in case and spaces; dots, plus tags and the domain stay distinct', () => {
    expect(normalizeEmail('  Pat.Synthetic@Example.TEST ')).toBe('pat.synthetic@example.test')
    expect(normalizeEmail('patsynthetic@example.test')).not.toBe(normalizeEmail('pat.synthetic@example.test'))
    expect(normalizeEmail('pat+home@example.test')).not.toBe(normalizeEmail('pat@example.test'))
    expect(normalizeEmail('not an email')).toBeNull()
  })

  it('[HH-ID-02] a phone matches only the identical E.164 number; an address by street, unit and ZIP', () => {
    expect(normalizePhone('+15025550137')).toBe('+15025550137')
    expect(normalizePhone('502-555-0137')).toBeNull()
    expect(addressKey({ street: ' 12  Synthetic St. ', unit: null, zip: '40000-1234' })).toBe(
      addressKey({ street: '12 synthetic st', unit: '', zip: '40000' }),
    )
    expect(addressKey({ street: '12 Synthetic St', unit: 'A', zip: '40000' })).not.toBe(
      addressKey({ street: '12 Synthetic St', unit: 'B', zip: '40000' }),
    )
    expect(nameKey('  Pat   Synthetic ')).toBe('pat synthetic')
  })

  it('[HH-ID-02][T21] a name alone never suggests a match; email, phone or address do', () => {
    expect(suggests(['name'])).toBe(false)
    expect(suggests(['email'])).toBe(true)
    expect(suggests(['address', 'name'])).toBe(true)
    expect(sortReasons(['name', 'phone', 'email', 'phone'])).toEqual(['email', 'phone', 'name'])
  })
})

describe('note content guard (TSK-0044, HH-CRM-01)', () => {
  // A synthetic test number (the well-known checksum example), built from parts.
  const card = ['4111', '1111', '1111', '1111'].join(' ')
  it('[HH-CRM-01] a card-like number is refused; phone numbers and short codes are not', () => {
    expect(looksLikeCardNumber(`card ${card} exp`)).toBe(true)
    expect(looksLikeCardNumber(card.replace(/ /g, '-'))).toBe(true)
    expect(looksLikeCardNumber('Call (502) 555-0137 after 5.')).toBe(false)
    expect(looksLikeCardNumber(`${card.slice(0, -1)}2`)).toBe(false)
    expect(looksLikeCardNumber('Gate is on the left side.')).toBe(false)
  })
})
