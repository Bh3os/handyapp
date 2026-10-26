// First-visit site checks (TSK-0126; OWN-DEC-167, OWN-DEC-179, OWN-DEC-206, HH-SCH-06). Pure.
import { describe, expect, it } from 'vitest'
import {
  addressProblems,
  confirmedCoverage,
  contactAuthorized,
  SITE_CHECKS,
  SITE_CONTACT_AUTHORITIES,
} from '../src/index.js'

const standard = { category: 'standard' as const, counties: ['KY:Jefferson'] }
const at = (street: string, state = 'KY') => ({ street, state })

describe('[HH-SCH-06][OWN-DEC-167] first-visit site checks (TSK-0126)', () => {
  it('[OWN-DEC-167] three checks: the address, the site contact and the coverage', () => {
    expect(SITE_CHECKS).toEqual(['address', 'site_contact', 'coverage'])
  })

  it('[OWN-DEC-167] a valid physical address in its ZIP’s state has no problem; an unlisted ZIP is never one', () => {
    expect(addressProblems(at('100 Synthetic Test Way'), standard)).toEqual([])
    expect(addressProblems(at('100 Synthetic Test Way', 'ky '), standard)).toEqual([])
    expect(addressProblems(at('100 Synthetic Test Way', 'OH'), { category: null, counties: [] })).toEqual([])
    // A ZIP the dataset ties to counties of both states is fine in either.
    const both = { category: null, counties: ['KY:Jefferson', 'IN:Clark'] }
    expect(addressProblems(at('1 Test Rd', 'IN'), both)).toEqual([])
    // Words that only contain the letters of a PO box are not one.
    expect(addressProblems(at('12 Apollo Boxwood Ct'), standard)).toEqual([])
  })

  it('[OWN-DEC-179] invalid addresses: a PO box street, a mailing ZIP, a ZIP of another state', () => {
    for (const street of ['PO Box 12', 'P.O. Box 12', 'p o box 9', 'Post Office Box 4', 'POB 77'])
      expect(addressProblems(at(street), standard), street).toEqual(['ADDRESS_PO_BOX'])
    const mailing = (category: 'po_box' | 'unique') => ({ category, counties: ['KY:Jefferson'] })
    expect(addressProblems(at('1 Test Rd'), mailing('po_box'))).toEqual(['ADDRESS_MAILING_ZIP'])
    expect(addressProblems(at('1 Test Rd'), mailing('unique'))).toEqual(['ADDRESS_MAILING_ZIP'])
    expect(addressProblems(at('1 Test Rd', 'IN'), standard)).toEqual(['ADDRESS_ZIP_STATE_MISMATCH'])
    expect(addressProblems(at('PO Box 1', 'IN'), mailing('po_box'))).toEqual([
      'ADDRESS_PO_BOX',
      'ADDRESS_MAILING_ZIP',
      'ADDRESS_ZIP_STATE_MISMATCH',
    ])
  })

  it('[OWN-DEC-179][OWN-DEC-206] a verified county gives SERVED or OUTSIDE; EDGE and UNKNOWN stay ZIP screening', () => {
    expect(confirmedCoverage(true)).toBe('served')
    expect(confirmedCoverage(false)).toBe('outside')
  })

  it('[OWN-DEC-167] a site contact is authorized for access or coordination only, never for money or contracts', () => {
    expect(SITE_CONTACT_AUTHORITIES).toEqual(['property_access', 'visit_coordination'])
    expect(contactAuthorized([])).toBe(false)
    expect(contactAuthorized(['property_access'])).toBe(true)
    expect(contactAuthorized(['visit_coordination'])).toBe(true)
    expect(contactAuthorized(['approve_changes'])).toBe(false)
  })
})
