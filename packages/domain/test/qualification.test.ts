// Qualification checks and the four request actions (TSK-0042; HH-LEAD-02, HH-LEAD-08, OWN-DEC-100, OWN-DEC-116).
import { describe, expect, it } from 'vitest'
import {
  ACTION_EVENTS,
  apply,
  NOT_A_FIT_CATEGORIES,
  NOT_A_FIT_EVENTS,
  QUALIFICATION_CHECKS,
  REQUEST_ACTIONS,
  REQUEST_MACHINE,
  unqualifiedChecks,
} from '../src/index.js'

describe('qualification (TSK-0042, HH-LEAD-02)', () => {
  it('[HH-LEAD-02] lists the checks of HH-LEAD-02 and reports every one still unchecked', () => {
    expect(QUALIFICATION_CHECKS).toEqual([
      'coverage',
      'service_fit',
      'essential_facts',
      'urgency',
      'site_visit_need',
      'staff_equipment',
      'risk_flags',
    ])
    expect(unqualifiedChecks(null)).toEqual([...QUALIFICATION_CHECKS])
    const all = Object.fromEntries(QUALIFICATION_CHECKS.map((c) => [c, { outcome: 'ok' as const }]))
    expect(unqualifiedChecks(all)).toEqual([])
    expect(unqualifiedChecks({ ...all, urgency: { outcome: 'not_checked' } })).toEqual(['urgency'])
    // "Needs attention" is an answer: it is recorded, not missing.
    expect(unqualifiedChecks({ ...all, risk_flags: { outcome: 'attention', note: 'Synthetic note' } })).toEqual([])
  })
})

describe('the four actions (TSK-0042, OWN-DEC-116, OWN-DEC-100)', () => {
  it('[HH-LEAD-02] are Ask a Question, Prepare Online Estimate, Arrange Estimate Visit and Not a Fit', () => {
    expect(REQUEST_ACTIONS).toEqual(['ask_question', 'prepare_online_estimate', 'arrange_estimate_visit', 'not_a_fit'])
    const events = new Set(REQUEST_MACHINE.transitions.map((t) => t.event))
    for (const e of Object.values(ACTION_EVENTS)) expect(events.has(e)).toBe(true)
  })

  it('[HH-LEAD-08] every Not a Fit category maps to a closing event that needs no further facts but the decision', () => {
    expect(Object.keys(NOT_A_FIT_EVENTS).sort()).toEqual([...NOT_A_FIT_CATEGORIES].sort())
    for (const category of NOT_A_FIT_CATEGORIES) {
      const r = apply({ machine: 'request.lifecycle', state: 'reviewing', version: 3 }, NOT_A_FIT_EVENTS[category], {
        actor: 'staff',
        expectedVersion: 3,
        now: new Date('2026-10-20T15:00:00Z'),
        facts: {
          notAFitCategory: category,
          reason: 'Synthetic plain-language reason',
          workAccepted: false,
          appointmentExists: false,
          moneyReceived: false,
        },
      })
      expect(r, category).toMatchObject({ ok: true, effects: ['customer_notice.not_a_fit'] })
    }
  })
})
