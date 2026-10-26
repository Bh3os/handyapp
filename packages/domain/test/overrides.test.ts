// Owner overrides never waive mandatory restrictions (TSK-0151; OWN-DEC-200 H7, RULE-SAFETY-GATES, HH-STAFF-03). Pure.
import { describe, expect, it } from 'vitest'
import {
  DISMISSABLE_FLAGS,
  MANDATORY_RESTRICTION_CATEGORIES,
  mandatoryRestriction,
  RESTRICTIONS,
} from '../src/index.js'

describe('[HH-STAFF-03] owner overrides (OWN-DEC-200 H7)', () => {
  it('[HH-STAFF-03] only working-hours and equipment flags are discretionary', () => {
    expect(DISMISSABLE_FLAGS).toEqual(['working_hours_changed', 'equipment_retired'])
    expect(mandatoryRestriction('working_hours_changed')).toBeNull()
    expect(mandatoryRestriction('equipment_retired')).toBeNull()
  })

  it('[HH-STAFF-03] a safety, legal, licensing, qualification or employee-protection restriction is refused', () => {
    expect(mandatoryRestriction('start_work_gate')).toBe('safety')
    expect(mandatoryRestriction('critical_hold')).toBe('safety')
    expect(mandatoryRestriction('time_off_recorded')).toBe('employee_protection')
    expect(mandatoryRestriction('account_disabled')).toBe('legal')
    expect(mandatoryRestriction('licensed_trade')).toBe('licensing')
    expect(mandatoryRestriction('reviewer_qualification')).toBe('qualification')
    for (const [restriction, kind] of Object.entries(RESTRICTIONS))
      if (kind !== 'discretionary')
        expect(MANDATORY_RESTRICTION_CATEGORIES).toContain(mandatoryRestriction(restriction))
  })

  it('[HH-STAFF-03] an unknown restriction is refused (fail closed)', () => {
    expect(mandatoryRestriction('something_new')).toBe('safety')
    expect(mandatoryRestriction('')).toBe('safety')
  })
})
