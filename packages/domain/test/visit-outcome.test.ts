// Visit outcomes (TSK-0078; HH-SCH-09, HH-WORK-03). Pure: no database.
import { describe, expect, it } from 'vitest'
import { VISIT_OUTCOME_KINDS, visitOutcome } from '../src/index.js'

const base = { visitState: 'arrived', workStarted: false, note: 'Synthetic: what the worker saw' }

describe('[HH-SCH-09] visit outcomes', () => {
  it('[HH-SCH-09] only no access changes the visit; every other outcome leaves it booked', () => {
    for (const kind of VISIT_OUTCOME_KINDS)
      expect(visitOutcome({ ...base, kind })).toEqual({ ok: true, visitTo: kind === 'no_access' ? 'no_access' : null })
  })

  it('[HH-SCH-09] recorded only on a booked visit not yet finished, always with a note', () => {
    for (const visitState of ['tentative', 'completed', 'canceled', 'expired', 'no_access'])
      expect(visitOutcome({ ...base, kind: 'delay', visitState })).toEqual({ ok: false, problem: 'VISIT_NOT_OPEN' })
    for (const visitState of ['confirmed', 'en_route', 'arrived'])
      expect(visitOutcome({ ...base, kind: 'delay', visitState }).ok).toBe(true)
    expect(visitOutcome({ ...base, kind: 'weather', note: '  ' })).toEqual({ ok: false, problem: 'NOTE_REQUIRED' })
    expect(visitOutcome({ ...base, kind: 'weather', note: 'x'.repeat(2001) })).toEqual({
      ok: false,
      problem: 'NOTE_TOO_LONG',
    })
  })

  it('[HH-SCH-09][HH-WORK-03] no access is refused once work started; customer absence never starts work', () => {
    expect(visitOutcome({ ...base, kind: 'no_access', workStarted: true })).toEqual({
      ok: false,
      problem: 'WORK_STARTED',
    })
    // Recorded, and the visit stays as it is: Start Work still needs the customer present or the exception.
    expect(visitOutcome({ ...base, kind: 'customer_absent' })).toEqual({ ok: true, visitTo: null })
  })
})
