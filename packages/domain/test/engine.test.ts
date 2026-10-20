// Transition engine (TSK-0009; HH-STATE-01, HH-STATE-02, HH-DATA-05). Synthetic machines only.
import { describe, expect, it } from 'vitest'
import * as domain from '../src/index.js'
import {
  defineMachine,
  eventsFrom,
  MachineDefinitionError,
  PACKAGE_NAME,
  transition,
  type Guard,
} from '../src/index.js'

type JobFacts = { checklistDone?: boolean; noteGiven?: boolean }
const done: Guard<JobFacts> = (f) =>
  f.checklistDone ? null : { code: 'CHECKLIST_OPEN', message: 'Finish the checklist.' }
const note: Guard<JobFacts> = (f) => (f.noteGiven ? null : { code: 'NOTE_REQUIRED', message: 'Add a note.' })

// Two dimensions of one synthetic entity: operational and financial states are separate machines (HH-DATA-05).
const operational = defineMachine({
  entity: 'sample_job',
  dimension: 'operational',
  states: ['ready', 'working', 'complete'],
  initial: 'ready',
  final: ['complete'],
  transitions: [
    { event: 'start', from: ['ready'], to: 'working', actors: ['staff'] },
    {
      event: 'finish',
      from: ['working'],
      to: 'complete',
      actors: ['staff'],
      guards: [done, note],
      effects: ['qa.queue'],
    },
  ],
})
const financial = defineMachine({
  entity: 'sample_job',
  dimension: 'financial',
  states: ['unpaid', 'paid'],
  initial: 'unpaid',
  final: ['paid'],
  transitions: [{ event: 'record_full_payment', from: ['unpaid'], to: 'paid', actors: ['staff'] }],
})
const NOW = new Date('2026-10-20T15:00:00Z')
const ctx = (facts: JobFacts = {}, expectedVersion = 3) => ({
  actor: 'staff' as const,
  expectedVersion,
  now: NOW,
  facts,
})

describe('engine: named transitions only (TSK-0009, HH-STATE-01)', () => {
  it('exposes its public index with no generic set-status function', () => {
    expect(PACKAGE_NAME).toBe('@handyhub/domain')
    const names = Object.keys(domain).map((k) => k.toLowerCase())
    expect(names.filter((n) => /set_?(state|status)|force|override/.test(n))).toEqual([])
  })

  it('applies an allowed event: the target comes from the table and the version moves on', () => {
    expect(transition(operational, { state: 'ready', version: 3 }, 'start', ctx())).toEqual({
      ok: true,
      entity: 'sample_job',
      dimension: 'operational',
      event: 'start',
      from: 'ready',
      to: 'working',
      version: 4,
      effects: [],
    })
  })

  it('a caller cannot pick the target state', () => {
    // @ts-expect-error the context has no target: the table alone decides where an event goes
    const r = transition(operational, { state: 'ready', version: 3 }, 'start', { ...ctx(), to: 'complete' })
    expect(r.ok && r.to).toBe('working')
  })

  it('refuses an event that is not allowed from the current state, naming where it is allowed', () => {
    const r = transition(
      operational,
      { state: 'ready', version: 3 },
      'finish',
      ctx({ checklistDone: true, noteGiven: true }),
    )
    expect(r).toMatchObject({ ok: false, code: 'INVALID_TRANSITION', problems: [] })
    expect(!r.ok && r.message).toContain('allowed only from: working')
  })

  it('refuses unknown states and events, the wrong actor and a stale version, changing nothing', () => {
    expect(transition(operational, { state: 'lost' as 'ready', version: 3 }, 'start', ctx())).toMatchObject({
      ok: false,
      code: 'UNKNOWN_STATE',
    })
    expect(transition(operational, { state: 'ready', version: 3 }, 'jump' as 'start', ctx())).toMatchObject({
      ok: false,
      code: 'UNKNOWN_EVENT',
    })
    expect(
      transition(operational, { state: 'ready', version: 3 }, 'start', { ...ctx(), actor: 'customer' }),
    ).toMatchObject({ ok: false, code: 'ACTOR_NOT_ALLOWED' })
    expect(transition(operational, { state: 'ready', version: 3 }, 'start', ctx({}, 2))).toMatchObject({
      ok: false,
      code: 'STALE_VERSION',
    })
  })

  it('a refusal names every unmet requirement at once (HH-STATE-02)', () => {
    const r = transition(operational, { state: 'working', version: 3 }, 'finish', ctx())
    expect(r).toMatchObject({
      ok: false,
      code: 'GUARD_FAILED',
      problems: [
        { code: 'CHECKLIST_OPEN', message: 'Finish the checklist.' },
        { code: 'NOTE_REQUIRED', message: 'Add a note.' },
      ],
    })
    expect(
      transition(
        operational,
        { state: 'working', version: 3 },
        'finish',
        ctx({ checklistDone: true, noteGiven: true }),
      ),
    ).toMatchObject({ ok: true, to: 'complete', effects: ['qa.queue'] })
  })

  it('final states have no outgoing event', () => {
    expect(eventsFrom(operational, 'complete')).toEqual([])
    expect(eventsFrom(operational, 'ready')).toEqual(['start'])
  })
})

describe('engine: separate state dimensions (TSK-0009, HH-DATA-05)', () => {
  it('an event of one dimension is unknown to another: paid never means complete', () => {
    const paid = transition(financial, { state: 'unpaid', version: 1 }, 'record_full_payment', ctx({}, 1))
    expect(paid).toMatchObject({ ok: true, dimension: 'financial', to: 'paid' })
    expect(
      transition(operational, { state: 'working', version: 1 }, 'record_full_payment' as 'finish', ctx({}, 1)),
    ).toMatchObject({ ok: false, code: 'UNKNOWN_EVENT' })
    expect(
      transition(financial, { state: 'unpaid', version: 1 }, 'finish' as 'record_full_payment', ctx({}, 1)),
    ).toMatchObject({ ok: false, code: 'UNKNOWN_EVENT' })
  })

  it('each registered machine is one entity dimension, keyed <entity>.<dimension>', () => {
    for (const [key, m] of Object.entries(domain.MACHINES)) expect(key).toBe(`${m.entity}.${m.dimension}`)
  })
})

describe('engine: machine tables are validated at load (TSK-0009)', () => {
  const base = { entity: 'x', dimension: 'lifecycle', initial: 'a' } as const
  const bad: Array<[string, () => unknown]> = [
    ['duplicate state', () => defineMachine({ ...base, states: ['a', 'a'], final: [], transitions: [] })],
    [
      'unknown initial state',
      () => defineMachine({ ...base, initial: 'z' as 'a', states: ['a'], final: [], transitions: [] }),
    ],
    [
      'unknown target',
      () =>
        defineMachine({
          ...base,
          states: ['a'],
          final: [],
          transitions: [{ event: 'e', from: ['a'], to: 'z' as 'a', actors: ['staff'] }],
        }),
    ],
    [
      'event leaving a final state',
      () =>
        defineMachine({
          ...base,
          states: ['a', 'b'],
          final: ['b'],
          transitions: [
            { event: 'e', from: ['a'], to: 'b', actors: ['staff'] },
            { event: 'back', from: ['b'], to: 'a', actors: ['staff'] },
          ],
        }),
    ],
    [
      'same event twice from one state',
      () =>
        defineMachine({
          ...base,
          states: ['a', 'b', 'c'],
          final: [],
          transitions: [
            { event: 'e', from: ['a'], to: 'b', actors: ['staff'] },
            { event: 'e', from: ['a'], to: 'c', actors: ['staff'] },
          ],
        }),
    ],
    ['unreachable state', () => defineMachine({ ...base, states: ['a', 'b'], final: [], transitions: [] })],
    [
      'event with no actor',
      () =>
        defineMachine({
          ...base,
          states: ['a', 'b'],
          final: [],
          transitions: [{ event: 'e', from: ['a'], to: 'b', actors: [] }],
        }),
    ],
  ]
  for (const [what, define] of bad) {
    it(`refuses a table with ${what}`, () => {
      expect(define).toThrow(MachineDefinitionError)
    })
  }
})
