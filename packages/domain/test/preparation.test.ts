// Default preparation instructions and the unsafe-instruction check (TSK-0146; OWN-DEC-194 B7, HH-SCH-11, HH-CUS-02,
// OWN-DEC-84, OWN-DEC-98, RULE-HUMAN-REVIEW). The instruction sentences below are synthetic test inputs, never
// customer wording.
import { describe, expect, it } from 'vitest'
import {
  PREPARATION_RULES,
  preparationBasis,
  preparationProblems,
  servicePagePreparation,
  unsafeCode,
  visitPreparationText,
} from '../src/index.js'
import { SERVICE_CONTENT } from '../src/service-content.js'

const rules = (text: string) => preparationProblems(text).map((p) => p.rule)

describe('the unsafe-instruction check (OWN-DEC-194 B7, HH-CUS-02)', () => {
  it('[OWN-DEC-194][HH-CUS-02] every reviewed "Getting ready" step of the 26 services passes', () => {
    for (const [id, c] of Object.entries(SERVICE_CONTENT)) {
      expect(preparationProblems(servicePagePreparation(c.preparation)), id).toEqual([])
    }
  })

  it('[OWN-DEC-194][RULE-HUMAN-REVIEW] refuses hazardous preparation of every family', () => {
    expect(rules('Please scrape the peeling lead paint off the trim before we arrive.')).toEqual([
      'hazardous_materials',
    ])
    expect(rules('Remove the moldy drywall in the basement.')).toEqual(['hazardous_materials'])
    expect(rules('Sand down any popcorn ceiling that is loose.')).toEqual(['hazardous_materials'])
    expect(rules('Disconnect the gas line to the grill.')).toEqual(['licensed_trade'])
    expect(rules('Remove the old light fixture and cap the wires.')).toEqual(['licensed_trade', 'licensed_trade'])
    expect(rules('Open the electrical panel for us.')).toEqual(['licensed_trade'])
    expect(rules('Knock down the load-bearing wall between the rooms.')).toEqual(['structural'])
    expect(rules('Climb onto the roof and clear the gutters.')).toEqual(['heights_and_confined_spaces'])
    expect(rules('Go up into the attic and move the boxes.')).toEqual(['heights_and_confined_spaces'])
    expect(rules('Check the crawl space for a gas leak.')).toEqual(['hazard_inspection'])
    expect(rules('Inspect the attic before the visit.')).toEqual(['hazard_inspection'])
  })

  it('[OWN-DEC-194] a mention without the action, or a sentence telling the customer not to, passes', () => {
    expect(preparationProblems('Tell us about any past mold or known leaks.')).toEqual([])
    expect(preparationProblems('Move furniture away from the outlets.')).toEqual([])
    expect(preparationProblems('Please do not climb on the roof. We bring our own ladders.')).toEqual([])
    expect(preparationProblems("Don't disconnect anything; we shut off the gas valve ourselves.")).toEqual([])
    expect(preparationProblems('')).toEqual([])
    expect(preparationProblems(null)).toEqual([])
    // A negation reaches only its own sentence.
    expect(rules('Do not touch the ceiling. Remove the mold by the window.')).toEqual(['hazardous_materials'])
  })

  it('[OWN-DEC-194] each rule has its refusal code; the match is reported as written', () => {
    expect(PREPARATION_RULES.map(unsafeCode)).toEqual([
      'UNSAFE_HAZARDOUS_MATERIALS',
      'UNSAFE_LICENSED_TRADE',
      'UNSAFE_STRUCTURAL',
      'UNSAFE_HEIGHTS_AND_CONFINED_SPACES',
      'UNSAFE_HAZARD_INSPECTION',
    ])
    expect(preparationProblems('Then REWIRE the Outlet.')).toEqual([
      { rule: 'licensed_trade', match: 'REWIRE the Outlet' },
    ])
  })
})

describe('the default an offer starts from (OWN-DEC-194 B7)', () => {
  it('[OWN-DEC-194] the reviewed steps become one step per line; nothing is written for a service without them', () => {
    expect(servicePagePreparation(['Step one.', '  Step two. ', ''])).toBe('Step one.\nStep two.')
    expect(servicePagePreparation([])).toBeNull()
    expect(servicePagePreparation(undefined)).toBeNull()
  })

  it('[OWN-DEC-194] one service gives its default; several each under the service name; none gives nothing', () => {
    expect(visitPreparationText([{ name: 'Synthetic A', text: 'Do A.' }])).toBe('Do A.')
    expect(
      visitPreparationText([
        { name: 'Synthetic A', text: 'Do A.' },
        { name: 'Synthetic B', text: null },
        { name: 'Synthetic C', text: 'Do C.' },
      ]),
    ).toBe('Synthetic A:\nDo A.\n\nSynthetic C:\nDo C.')
    expect(visitPreparationText([{ name: 'Synthetic B', text: null }])).toBeNull()
    expect(visitPreparationText([])).toBeNull()
  })

  it('[OWN-DEC-194] the basis records whether staff kept, edited or wrote the instructions', () => {
    expect(preparationBasis('Do A.\nDo B.', 'Do A.\nDo B.')).toBe('default')
    expect(preparationBasis('  Do A.  \nDo B.\n', 'Do A.\nDo B.')).toBe('default')
    expect(preparationBasis('Do A only.', 'Do A.\nDo B.')).toBe('edited')
    expect(preparationBasis(null, 'Do A.')).toBe('edited')
    expect(preparationBasis('Do X.', null)).toBe('staff')
    expect(preparationBasis(undefined, null)).toBe('none')
  })
})
