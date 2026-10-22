// My Day taps and the per-worker timestamps (TSK-0070; HH-OFF-09, HH-SCH-08, HH-PORT-07, HH-WORK-06, T47,
// OWN-DEC-107, OWN-DEC-69, OWN-DEC-149). Staff IDs and times are synthetic.
import { describe, expect, it } from 'vitest'
import {
  correctionProblem,
  everyoneFinished,
  firstName,
  myDayActions,
  onMyWayOpensAt,
  tapDecision,
  workerTimes,
  type MyDayFacts,
} from '../src/index.js'

const STARTS = new Date('2026-11-05T14:00:00Z')
const OPENS = onMyWayOpensAt(STARTS, 180)
const at = (iso: string) => new Date(iso)
const base: MyDayFacts = {
  visitState: 'confirmed',
  reservation: 'confirmed',
  departed: false,
  arrived: false,
  finished: false,
  onMyWayOpensAt: OPENS,
  now: at('2026-11-05T12:00:00Z'),
}

describe('[HH-SCH-08][HH-OFF-09] On my way, Arrived and Finished', () => {
  it('[HH-SCH-08][OWN-DEC-107] On my way opens three hours before the window; time alone never records it', () => {
    expect(OPENS.toISOString()).toBe('2026-11-05T11:00:00.000Z')
    const early = { ...base, now: at('2026-11-05T10:59:59Z') }
    expect(myDayActions(early)).toEqual({ next: 'wait', onMyWay: false, arrived: false, finished: false })
    expect(tapDecision('on_my_way', early)).toBe('ON_MY_WAY_TOO_EARLY')
    expect(myDayActions(base)).toEqual({ next: 'on_my_way', onMyWay: true, arrived: false, finished: false })
    expect(tapDecision('on_my_way', base)).toBe('record')
    // A late departure is still the worker's own tap.
    expect(tapDecision('on_my_way', { ...base, now: at('2026-11-05T18:00:00Z') })).toBe('record')
    // NOT CONFIGURED: refused, never assumed.
    const unset = { ...base, onMyWayOpensAt: null }
    expect(myDayActions(unset).next).toBe('not_configured')
    expect(tapDecision('on_my_way', unset)).toBe('ON_MY_WAY_NOT_CONFIGURED')
  })

  it('[HH-SCH-08] repeated taps are idempotent; canceled, tentative and other visits refuse every tap', () => {
    expect(tapDecision('on_my_way', { ...base, visitState: 'en_route', departed: true })).toBe('repeat')
    for (const visitState of ['canceled', 'expired', 'no_access', 'tentative'])
      for (const tap of ['on_my_way', 'arrived', 'finished'] as const)
        expect(tapDecision(tap, { ...base, visitState })).toBe('VISIT_NOT_ACTIVE')
    // A tentative hold is not an assignment.
    expect(myDayActions({ ...base, reservation: 'hold' })).toMatchObject({ next: 'not_confirmed', onMyWay: false })
    expect(tapDecision('on_my_way', { ...base, reservation: 'hold' })).toBe('VISIT_NOT_ACTIVE')
  })

  it('[HH-SCH-08][HH-WORK-06] Arrived after On my way; Finished after the worker’s own Arrived', () => {
    expect(tapDecision('arrived', base)).toBe('ON_MY_WAY_FIRST')
    const enRoute = { ...base, visitState: 'en_route', departed: true }
    expect(myDayActions(enRoute)).toEqual({ next: 'arrived', onMyWay: false, arrived: true, finished: false })
    expect(tapDecision('arrived', enRoute)).toBe('record')
    expect(tapDecision('finished', enRoute)).toBe('ARRIVED_FIRST')
    // A second worker who has not left yet: On my way first, Arrived also offered.
    const second = { ...base, visitState: 'en_route' }
    expect(myDayActions(second)).toEqual({ next: 'on_my_way', onMyWay: true, arrived: true, finished: false })
    const onSite = { ...base, visitState: 'arrived', departed: true, arrived: true }
    expect(myDayActions(onSite)).toEqual({ next: 'finished', onMyWay: false, arrived: false, finished: true })
    expect(tapDecision('arrived', onSite)).toBe('repeat')
    expect(tapDecision('on_my_way', { ...onSite, departed: false })).toBe('ALREADY_ARRIVED')
    // A worker who joins an arrived visit records Arrived directly.
    expect(myDayActions({ ...base, visitState: 'arrived' })).toMatchObject({ next: 'arrived', arrived: true })
    const done = { ...onSite, finished: true }
    expect(myDayActions(done)).toEqual({ next: 'done', onMyWay: false, arrived: false, finished: false })
    expect(tapDecision('finished', done)).toBe('repeat')
  })

  it('[HH-WORK-06][T47] the visit completes when every assigned worker has Finished', () => {
    expect(everyoneFinished(['a', 'b'], new Set(['a']))).toBe(false)
    expect(everyoneFinished(['a', 'b'], new Set(['a', 'b']))).toBe(true)
    expect(everyoneFinished([], new Set(['a']))).toBe(false)
  })

  it('[HH-PORT-07] a notice carries first names only, never an invented one', () => {
    expect(firstName('Synthetic Ann Worker')).toBe('Synthetic')
    expect(firstName('  Ben ')).toBe('Ben')
    expect(firstName(null)).toBeNull()
    expect(firstName('   ')).toBeNull()
  })
})

describe('[HH-WORK-06][T47] timestamps per worker', () => {
  const arrivedA = { staffUserId: 'a', kind: 'arrived' as const, recordedAt: at('2026-11-05T14:05:00Z') }
  const arrivedB = { staffUserId: 'b', kind: 'arrived' as const, recordedAt: at('2026-11-05T14:20:00Z') }
  const finishedA = { staffUserId: 'a', kind: 'finished' as const, recordedAt: at('2026-11-05T16:35:30Z') }

  it('[HH-WORK-06][T47] separate records per worker; a forgotten Finished is flagged, never invented', () => {
    const during = workerTimes({
      assigned: ['a', 'b'],
      stamps: [arrivedA, arrivedB, finishedA],
      corrections: [],
      visitState: 'arrived',
      dayEnded: false,
    })
    expect(during.map((w) => [w.staffUserId, w.arrived.status, w.finished.status, w.durationMinutes])).toEqual([
      ['a', 'recorded', 'recorded', 150],
      ['b', 'recorded', 'pending', null],
    ])
    expect(during.some((w) => w.flagged)).toBe(false)
    const after = workerTimes({
      assigned: ['a', 'b'],
      stamps: [arrivedA, arrivedB, finishedA],
      corrections: [],
      visitState: 'arrived',
      dayEnded: true,
    })
    expect(after[1]).toMatchObject({ finished: { status: 'missing', at: null }, durationMinutes: null, flagged: true })
  })

  it('[HH-WORK-06][T47] the Owner’s correction keeps the original value and the reason', () => {
    const fixed = workerTimes({
      assigned: ['a', 'b'],
      stamps: [arrivedA, arrivedB, finishedA],
      corrections: [
        {
          staffUserId: 'b',
          kind: 'finished',
          correctedAt: at('2026-11-05T16:30:00Z'),
          previousAt: null,
          reason: 'Synthetic: forgot to tap Finished',
          createdAt: at('2026-11-06T09:00:00Z'),
        },
        {
          staffUserId: 'a',
          kind: 'arrived',
          correctedAt: at('2026-11-05T14:00:00Z'),
          previousAt: arrivedA.recordedAt,
          reason: 'Synthetic: tapped late',
          createdAt: at('2026-11-06T09:01:00Z'),
        },
      ],
      visitState: 'completed',
      dayEnded: true,
    })
    expect(fixed[0]).toMatchObject({
      arrived: { status: 'corrected', at: at('2026-11-05T14:00:00Z'), recordedAt: arrivedA.recordedAt },
      durationMinutes: 155,
      flagged: false,
    })
    expect(fixed[1]?.finished).toMatchObject({ status: 'corrected', recordedAt: null })
    expect(fixed[1]?.finished.corrections[0]?.reason).toBe('Synthetic: forgot to tap Finished')
    expect(fixed[1]?.durationMinutes).toBe(130)
  })

  it('[HH-WORK-06] corrections stay in the past and keep Arrived before Finished', () => {
    const [a] = workerTimes({
      assigned: ['a'],
      stamps: [arrivedA, finishedA],
      corrections: [],
      visitState: 'completed',
      dayEnded: false,
    })
    const now = at('2026-11-06T09:00:00Z')
    expect(correctionProblem('finished', at('2026-11-07T09:00:00Z'), a ?? null, now)).toBe('IN_FUTURE')
    expect(correctionProblem('finished', at('2026-11-05T13:00:00Z'), a ?? null, now)).toBe('FINISHED_BEFORE_ARRIVED')
    expect(correctionProblem('arrived', at('2026-11-05T17:00:00Z'), a ?? null, now)).toBe('FINISHED_BEFORE_ARRIVED')
    expect(correctionProblem('arrived', arrivedA.recordedAt, a ?? null, now)).toBe('UNCHANGED')
    expect(correctionProblem('arrived', at('2026-11-05T13:55:00Z'), a ?? null, now)).toBeNull()
  })

  it('[HH-WORK-06] a worker who never arrived is flagged once the visit arrived', () => {
    const [, b] = workerTimes({
      assigned: ['a', 'b'],
      stamps: [arrivedA],
      corrections: [],
      visitState: 'arrived',
      dayEnded: false,
    })
    expect(b).toMatchObject({ arrived: { status: 'missing' }, finished: { status: 'pending' }, flagged: true })
  })
})
