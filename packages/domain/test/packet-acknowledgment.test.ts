// Where a worker's packet acknowledgment stands (TSK-0072; HH-DATA-08, HH-WORK-10, HH-PKT-02, HH-CHG-03, T44,
// ENT-Acknowledgment, RULE-SAFETY-GATES).
import { describe, expect, it } from 'vitest'
import { ACKNOWLEDGMENT_STATES, acknowledgmentState } from '../src/packet.js'

describe('[HH-DATA-08][HH-WORK-10] packet acknowledgment state', () => {
  it('[HH-WORK-10][T44] a worker not assigned has nothing that counts, whatever they acknowledged before', () => {
    expect(
      acknowledgmentState({ assigned: false, latest: { version: 3, invalidated: false }, criticalVersions: [] }),
    ).toBe('not_assigned')
  })

  it('[HH-WORK-10][T44] a newly assigned worker without their own acknowledgment must review', () => {
    expect(acknowledgmentState({ assigned: true, latest: null, criticalVersions: [2, 5] })).toBe('required')
  })

  it('[HH-DATA-08][HH-PKT-02][T44] a later critical version ends the acknowledgment even before its end is recorded', () => {
    expect(
      acknowledgmentState({ assigned: true, latest: { version: 3, invalidated: false }, criticalVersions: [2, 4] }),
    ).toBe('invalidated')
    // A critical version at or before the acknowledged one does not.
    expect(
      acknowledgmentState({ assigned: true, latest: { version: 4, invalidated: false }, criticalVersions: [2, 4] }),
    ).toBe('acknowledged')
  })

  it('[HH-DATA-08] a recorded end (removed assignment, disabled account) is final for that acknowledgment', () => {
    expect(
      acknowledgmentState({ assigned: true, latest: { version: 4, invalidated: true }, criticalVersions: [] }),
    ).toBe('invalidated')
  })

  it('[HH-CHG-03] only the standing acknowledgment is a state that satisfies review', () => {
    expect(ACKNOWLEDGMENT_STATES).toEqual(['acknowledged', 'required', 'invalidated', 'not_assigned'])
  })
})
