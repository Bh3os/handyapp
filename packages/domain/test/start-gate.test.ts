// The Start Work gate and its three administrative exceptions (TSK-0073, TSK-0074; HH-WORK-01, HH-WORK-02, HH-WORK-03,
// HH-WORK-04, T40, T45, T46, OWN-DEC-68, RULE-SAFETY-GATES). Ids are synthetic.
import { describe, expect, it } from 'vitest'
import {
  apply,
  EXCEPTABLE,
  EXCEPTION_REQUIREMENT,
  effectiveExceptionState,
  evaluateStartGate,
  exceptionRequestProblems,
  GATE_EXCEPTION_KINDS,
  GATE_EXCEPTION_MACHINE,
  HOLD_MACHINE,
  START_GATE_CODES,
  START_GATE_ITEMS,
  startAllowed,
  type FoundMissing,
  type GateExceptionFacts,
  type GateExceptionState,
  type StartGateCode,
} from '../src/index.js'
import { pairs } from './helpers.js'

const NOW = new Date('2026-10-21T15:00:00Z')
const CODES = Object.keys(START_GATE_CODES) as StartGateCode[]
const one = (code: StartGateCode, ref: string | null = null): FoundMissing => ({ code, ref })

describe('[HH-WORK-01] the gate lists every prerequisite and names every missing item', () => {
  it('lists the ten prerequisites in order, all met when nothing is missing: ready', () => {
    const r = evaluateStartGate([])
    expect(r.items.map((i) => i.item)).toEqual([...START_GATE_ITEMS])
    expect(r.items.every((i) => i.state === 'met')).toBe(true)
    expect(r.outcome).toBe('ready')
    expect(startAllowed(r)).toBe(true)
  })

  it('names every missing item at once, with its resolution owner, under its own prerequisite', () => {
    const r = evaluateStartGate([
      one('PACKET_NOT_ACKNOWLEDGED'),
      one('LOADOUT_BLOCKED', 'wp-1'),
      one('DEPOSIT_REQUIRED'),
    ])
    expect(r.outcome).toBe('blocked')
    const byItem = Object.fromEntries(r.items.map((i) => [i.item, i]))
    expect(byItem['scope_acknowledged']?.missing).toEqual([
      expect.objectContaining({ code: 'PACKET_NOT_ACKNOWLEDGED', severity: 'attention', resolutionOwner: 'worker' }),
    ])
    expect(byItem['critical_resources']?.missing[0]).toMatchObject({ ref: 'wp-1', resolutionOwner: 'owner' })
    expect(byItem['deposit']?.state).toBe('missing')
    expect(r.items.filter((i) => i.state === 'missing')).toHaveLength(3)
  })

  it.each([
    [['PACKET_NOT_VIEWED'], 'needs_attention'],
    [['SPANISH_SAFETY_REVIEW_PENDING'], 'requires_review'],
    [['SPANISH_SAFETY_REVIEW_PENDING', 'HAZARDS_NOT_REVIEWED'], 'requires_review'],
    [['CRITICAL_HOLD_OPEN', 'SOP_PENDING_COMPETENT_REVIEW'], 'blocked'],
  ] as const)('%j is %s, and never starts', (codes, outcome) => {
    const r = evaluateStartGate(codes.map((c) => one(c)))
    expect(r.outcome).toBe(outcome)
    expect(startAllowed(r)).toBe(false)
  })

  it('every single missing code alone keeps the gate shut', () => {
    for (const code of CODES) expect(startAllowed(evaluateStartGate([one(code, 'ref')])), code).toBe(false)
  })
})

describe('[HH-WORK-02][HH-WORK-03][T45] only three exceptions exist; each covers exactly its own requirement', () => {
  it('there are exactly three kinds, one requirement each, and each covers exactly one code', () => {
    expect([...GATE_EXCEPTION_KINDS]).toEqual([
      'customer_not_present',
      'before_photo_upload_failed',
      'deposit_bookkeeping_pending',
    ])
    expect(EXCEPTABLE).toEqual({
      customer_not_present: ['CUSTOMER_NOT_PRESENT'],
      before_photo_upload_failed: ['BEFORE_PHOTOS_MISSING'],
      deposit_bookkeeping_pending: ['DEPOSIT_REQUIRED'],
    })
    for (const k of GATE_EXCEPTION_KINDS)
      for (const c of EXCEPTABLE[k]) expect(START_GATE_CODES[c].item).toBe(EXCEPTION_REQUIREMENT[k])
  })

  it('no hold, safety, SOP, language, scope, assignment, resource or access code is exceptable', () => {
    const never: StartGateCode[] = [
      'CRITICAL_HOLD_OPEN',
      'JOB_ON_HOLD',
      'REVIEW_HOLD_OPEN',
      'HAZARDS_NOT_REVIEWED',
      'LOADOUT_BLOCKED',
      'LOADOUT_NOT_CONFIGURED',
      'SOP_NOT_CONFIGURED',
      'SOP_PENDING_COMPETENT_REVIEW',
      'SPANISH_SAFETY_REVIEW_PENDING',
      'SCOPE_NOT_ACCEPTED',
      'NOT_ASSIGNED',
      'ACCESS_NOT_AVAILABLE',
      'PROPERTY_NOT_CONFIRMED',
      'SITE_CONDITION_DIFFERS',
      'DEPOSIT_REQUIREMENT_MISSING',
    ]
    const covered = Object.values(EXCEPTABLE).flat()
    for (const c of never) expect(covered, c).not.toContain(c)
    // Every exception at once never opens a gate with any of them.
    const all = GATE_EXCEPTION_KINDS.map((kind, i) => ({ id: `ex-${i}`, kind, workPackageIds: ['wp-1'] }))
    for (const c of never) {
      const r = evaluateStartGate([one(c, 'wp-1')], all)
      expect(r.outcome, c).not.toBe('ready')
      expect(r.exceptionsUsed).toEqual([])
    }
  })

  it('an approved exception covers its own code; the gate is ready only when nothing else is missing', () => {
    const missing = [one('CUSTOMER_NOT_PRESENT'), one('DEPOSIT_REQUIRED')]
    const r = evaluateStartGate(missing, [{ id: 'ex-1', kind: 'customer_not_present' }])
    expect(r.items.find((i) => i.item === 'site_identity')?.state).toBe('excepted')
    expect(r.outcome).toBe('blocked')
    const both = evaluateStartGate(missing, [
      { id: 'ex-1', kind: 'customer_not_present' },
      { id: 'ex-2', kind: 'deposit_bookkeeping_pending' },
    ])
    expect(both).toMatchObject({ outcome: 'ready', exceptionsUsed: ['ex-1', 'ex-2'] })
  })

  it('a before-photo exception covers only the work packages whose photos it names', () => {
    const missing = [one('BEFORE_PHOTOS_MISSING', 'wp-1'), one('BEFORE_PHOTOS_MISSING', 'wp-2')]
    const r = evaluateStartGate(missing, [{ id: 'ex', kind: 'before_photo_upload_failed', workPackageIds: ['wp-1'] }])
    expect(r.outcome).toBe('needs_attention')
    expect(r.items.find((i) => i.item === 'before_photos')?.missing.map((m) => m.exceptionId)).toEqual(['ex', null])
  })

  it('a request is refused unless the records show its requirement missing and its conditions met', () => {
    const base = { scopeAccepted: true, accessInstructions: true, alreadyLive: false, depositDueCents: null }
    const cnp = { kind: 'customer_not_present', authorization: 'Synthetic text', contact: 'Synthetic' } as const
    expect(exceptionRequestProblems(cnp, { ...base, missing: [one('CUSTOMER_NOT_PRESENT')] })).toEqual([])
    expect(exceptionRequestProblems(cnp, { ...base, missing: [one('SITE_CHECK_MISSING')] })).toEqual([
      'SITE_CHECK_FIRST',
    ])
    expect(
      exceptionRequestProblems(cnp, { ...base, accessInstructions: false, alreadyLive: true, missing: [] }),
    ).toEqual(['ALREADY_REQUESTED', 'ACCESS_INSTRUCTIONS_MISSING', 'REQUIREMENT_NOT_MISSING'])
    const photos = {
      kind: 'before_photo_upload_failed',
      workPackageIds: ['wp-1'],
      photosOnDevice: 3,
      failure: 'Synthetic: no signal',
    } as const
    expect(exceptionRequestProblems(photos, { ...base, missing: [one('BEFORE_PHOTOS_MISSING', 'wp-2')] })).toEqual([
      'PHOTOS_NOT_PENDING',
    ])
    const deposit = {
      kind: 'deposit_bookkeeping_pending',
      provider: 'square',
      transactionReference: 'SYN-1',
      amountCents: 20_000,
    } as const
    expect(
      exceptionRequestProblems(deposit, { ...base, missing: [one('DEPOSIT_REQUIRED')], depositDueCents: 25_000 }),
    ).toEqual(['AMOUNT_BELOW_DEPOSIT'])
    expect(exceptionRequestProblems(deposit, { ...base, missing: [one('DEPOSIT_REQUIREMENT_MISSING')] })).toEqual([
      'DEPOSIT_NOT_DUE',
    ])
  })
})

describe('[HH-WORK-03] exception states: the Owner approves; it ends with the visit or a relevant change', () => {
  const facts: GateExceptionFacts = {
    requestedBy: 'worker-a',
    actorId: 'owner-o',
    kind: 'customer_not_present',
    followUpOwnerId: 'owner-o',
    followUpDue: '2026-10-23',
    reason: 'Synthetic',
  }
  const run = (state: GateExceptionState, event: Parameters<typeof apply<'gate_exception.lifecycle'>>[1], f = facts) =>
    apply({ machine: 'gate_exception.lifecycle', state, version: 1 }, event, {
      actor: event === 'approve' || event === 'decline' ? 'staff' : 'system',
      expectedVersion: 1,
      now: NOW,
      facts: f,
    })
  for (const { state, event, transition } of pairs(GATE_EXCEPTION_MACHINE)) {
    it(`${event} from ${state} is ${transition ? `allowed, to ${transition.to}` : 'refused'}`, () => {
      expect(run(state, event).ok).toBe(transition !== undefined)
    })
  }

  it('the requester never approves their own request; the follow-up and the provider check are required', () => {
    expect(run('requested', 'approve', { ...facts, actorId: 'worker-a' })).toMatchObject({ ok: false })
    expect(run('requested', 'approve', { ...facts, followUpDue: '' })).toMatchObject({ ok: false })
    const deposit = { ...facts, kind: 'deposit_bookkeeping_pending' } as const
    expect(run('requested', 'approve', deposit)).toMatchObject({ ok: false })
    expect(run('requested', 'approve', { ...deposit, providerVerified: true })).toMatchObject({ ok: true })
  })

  it('expires when the visit ends, and is invalidated by scope, site, access or assignment changes', () => {
    const e = { state: 'approved' as const, expiresAt: new Date('2026-10-22T04:00:00Z') }
    const live = { now: NOW, visitState: 'arrived', changedSections: [], requesterAssigned: true }
    expect(effectiveExceptionState(e, live)).toEqual({ state: 'approved', ending: null })
    expect(effectiveExceptionState(e, { ...live, now: new Date('2026-10-22T04:00:00Z') }).state).toBe('expired')
    expect(effectiveExceptionState(e, { ...live, visitState: 'completed' }).ending).toBe('visit_ended')
    expect(effectiveExceptionState(e, { ...live, changedSections: ['scope'] }).ending).toBe('scope_changed')
    expect(effectiveExceptionState(e, { ...live, changedSections: ['holds'] }).ending).toBe('site_changed')
    expect(effectiveExceptionState(e, { ...live, changedSections: ['site_access'] }).ending).toBe('access_changed')
    expect(effectiveExceptionState(e, { ...live, requesterAssigned: false }).ending).toBe('assignment_changed')
    // A schedule or photo change is not relevant.
    expect(effectiveExceptionState(e, { ...live, changedSections: ['schedule', 'evidence'] }).state).toBe('approved')
    expect(effectiveExceptionState({ ...e, state: 'declined' }, { ...live, visitState: 'completed' }).state).toBe(
      'declined',
    )
  })
})

describe('[HH-WORK-02] a critical safety hold needs evidence and a qualified reviewer, never its raiser', () => {
  const run = (facts: Parameters<typeof apply<'hold.lifecycle'>>[2]['facts']) =>
    apply({ machine: 'hold.lifecycle', state: 'under_review', version: 2 }, 'resolve', {
      actor: 'staff',
      expectedVersion: 2,
      now: NOW,
      facts,
    })
  const ok = {
    kind: 'critical_safety',
    raisedBy: 'worker-a',
    actorId: 'owner-o',
    resolutionNote: 'Synthetic: the utility made the line safe.',
    reviewer: 'Synthetic Reviewer',
    evidence: 'Synthetic: the utility service ticket',
    reviewerQualification: 'Synthetic: licensed technician',
  } as const
  it('resolves with all of them, refuses without each', () => {
    expect(HOLD_MACHINE.transitions.find((t) => t.event === 'resolve')).toBeDefined()
    expect(run(ok)).toMatchObject({ ok: true, to: 'resolved' })
    const codes = (f: object) => {
      const r = run({ ...ok, ...f })
      return r.ok ? [] : r.problems.map((p) => p.code)
    }
    expect(codes({ evidence: ' ' })).toContain('EVIDENCE_REQUIRED')
    expect(codes({ reviewerQualification: undefined })).toContain('QUALIFICATION_REQUIRED')
    expect(codes({ actorId: 'worker-a' })).toContain('OWN_CRITICAL_HOLD')
  })
})
