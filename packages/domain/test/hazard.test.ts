// Stop Work, Report Hazard and issue reports (TSK-0077; HH-WORK-08, HH-WORK-09, HH-WORK-13, HH-CHG-04, OWN-DEC-80,
// OWN-DEC-143, RULE-SAFETY-GATES, RULE-HUMAN-REVIEW).
import { describe, expect, it } from 'vitest'
import {
  affectedPackages,
  effectiveSeverity,
  GUIDANCE_CODES,
  HAZARD_GUIDANCE,
  HAZARD_KINDS,
  HAZARD_REVIEWER,
  holdCategoryOf,
  ISSUE_CATEGORIES,
  onSiteResolutionProblems,
  pausesJob,
  reportVisibility,
  writesCriticalHold,
} from '../src/hazard.js'

const done = { whatHappened: 'x', steps: 'x', materials: 'x', howChecked: 'x', withinTrainingAndScope: true }

describe('[HH-WORK-09][RULE-SAFETY-GATES] every hazard is critical and writes its hold', () => {
  it('a hazard, an unsafe condition and a critical issue write a critical hold; nothing sent makes a hazard less', () => {
    for (const hazard of HAZARD_KINDS) {
      expect(effectiveSeverity({ kind: 'hazard', severity: 'minor' })).toBe('critical')
      expect(writesCriticalHold({ kind: 'hazard', severity: effectiveSeverity({ kind: 'hazard' }) }), hazard).toBe(true)
    }
    expect(effectiveSeverity({ kind: 'issue', category: 'unsafe_condition', severity: 'minor' })).toBe('critical')
    expect(writesCriticalHold({ kind: 'issue', severity: 'critical' })).toBe(true)
    expect(writesCriticalHold({ kind: 'issue', severity: 'major' })).toBe(false)
    expect(effectiveSeverity({ kind: 'issue', category: 'weather' })).toBe('major')
  })

  it('each hazard maps to a critical hold category and names its reviewer; guidance never offers a repair', () => {
    expect(HAZARD_KINDS.map(holdCategoryOf)).toEqual([
      'gas_leak',
      'live_wiring',
      'hazardous_material',
      'structural',
      'licensed_trade',
      'other',
      'other',
    ])
    for (const h of HAZARD_KINDS) {
      expect(HAZARD_REVIEWER[h]).toBeTruthy()
      expect(HAZARD_GUIDANCE[h].length).toBeGreaterThan(0)
    }
    // HH-WORK-13: a gas leak means evacuate and call from a safe place; live wiring is never touched.
    expect(HAZARD_GUIDANCE.gas_leak).toEqual(
      expect.arrayContaining(['evacuate_call_from_safe_place', 'never_gas_repair']),
    )
    expect(HAZARD_GUIDANCE.live_wiring).toContain('never_touch_wiring')
    expect(GUIDANCE_CODES.some((c) => /repair_steps|procedure|resolve/.test(c))).toBe(false)
  })

  it('a running job pauses; any other state stays as it is', () => {
    expect(pausesJob('in_progress')).toBe(true)
    for (const s of ['pending_preparation', 'ready', 'paused', 'closed']) expect(pausesJob(s)).toBe(false)
  })
})

describe('[HH-CHG-04] only the affected work stops, unless it cannot be separated safely', () => {
  const pkgs = [
    { id: 'a', state: 'in_progress' },
    { id: 'b', state: 'planned' },
    { id: 'c', state: 'complete' },
  ]
  it('named packages stop alone; none named stops every package that is not complete', () => {
    expect(affectedPackages({ hazard: 'other_unsafe' }, ['b'], pkgs)).toEqual(['b'])
    expect(affectedPackages({ hazard: 'other_unsafe' }, [], pkgs)).toEqual(['a', 'b'])
    expect(affectedPackages({ hazard: 'licensed_trade' }, ['a'], pkgs)).toEqual(['a'])
  })
  it('a gas leak, live wiring, hazardous material, a structural concern or an injury stops the whole job', () => {
    for (const hazard of ['gas_leak', 'live_wiring', 'hazardous_material', 'structural', 'injury'] as const)
      expect(affectedPackages({ hazard }, ['b'], pkgs), hazard).toEqual(['a', 'b'])
  })
})

describe('[HH-WORK-08][OWN-DEC-80] an on-site resolution only within training and scope, with no open safety hold', () => {
  it('never for a hazard, a critical issue, an unsafe condition or an incident', () => {
    expect(
      onSiteResolutionProblems({ kind: 'hazard', severity: 'critical' }, done, { unresolvedSafetyHolds: 0 }),
    ).toEqual(['RESOLVE_ON_SITE_NOT_OFFERED'])
    for (const category of ['unsafe_condition', 'incident'] as const)
      expect(
        onSiteResolutionProblems({ kind: 'issue', category, severity: 'minor' }, done, { unresolvedSafetyHolds: 0 }),
      ).toEqual(['RESOLVE_ON_SITE_NOT_OFFERED'])
    expect(
      onSiteResolutionProblems({ kind: 'issue', category: 'weather', severity: 'critical' }, done, {
        unresolvedSafetyHolds: 0,
      }),
    ).toEqual(['RESOLVE_ON_SITE_NOT_OFFERED'])
  })
  it('names every missing condition otherwise; nothing missing allows it', () => {
    const issue = { kind: 'issue' as const, category: 'material_problem' as const, severity: 'minor' as const }
    expect(onSiteResolutionProblems(issue, done, { unresolvedSafetyHolds: 0 })).toEqual([])
    expect(
      onSiteResolutionProblems(
        issue,
        { ...done, withinTrainingAndScope: false, steps: ' ' },
        { unresolvedSafetyHolds: 1 },
      ),
    ).toEqual(['SAFETY_HOLD_OPEN', 'NOT_WITHIN_TRAINING_AND_SCOPE', 'RESOLUTION_INCOMPLETE'])
  })
})

describe('[HH-INC-02][OWN-DEC-143] injury and incident details are restricted', () => {
  it('an injury hazard and an incident issue are restricted_incident; everything else is internal', () => {
    expect(reportVisibility({ hazard: 'injury' })).toBe('restricted_incident')
    expect(reportVisibility({ category: 'incident' })).toBe('restricted_incident')
    for (const hazard of HAZARD_KINDS.filter((h) => h !== 'injury'))
      expect(reportVisibility({ hazard })).toBe('internal_operational')
    for (const category of ISSUE_CATEGORIES.filter((c) => c !== 'incident'))
      expect(reportVisibility({ category })).toBe('internal_operational')
  })
})
