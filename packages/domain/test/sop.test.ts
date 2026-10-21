// SOP versions and the SOP part of a work package's readiness (TSK-0068; HH-PKT-03, HH-WORK-11, ENT-SOPVersion,
// OWN-DEC-17, OWN-DEC-108, RULE-SAFETY-GATES). Reviewer names are synthetic.
import { describe, expect, it } from 'vitest'
import {
  apply,
  hazardControls,
  itemText,
  SOP_STAGES,
  SOP_VERSION_MACHINE,
  type SopContent,
  type SopItem,
  type SopReviewState,
  type SopSignOffFacts,
  sopReadiness,
  tableRows,
} from '../src/index.js'
import { pairs } from './helpers.js'

const NOW = new Date('2026-10-21T15:00:00Z')
const SIGNED: SopSignOffFacts = {
  reviewerName: 'Synthetic Reviewer',
  reviewerQualification: 'Synthetic qualification',
  reviewNote: 'Synthetic: reviewed this exact version.',
}
const run = (state: SopReviewState, event: 'sign_off' | 'supersede', facts: SopSignOffFacts = SIGNED) =>
  apply({ machine: 'sop_version.review', state, version: 1 }, event, {
    actor: event === 'supersede' ? 'system' : 'staff',
    expectedVersion: 1,
    now: NOW,
    facts,
  })

describe('SOP version review states (ENT-SOPVersion, OWN-DEC-17)', () => {
  for (const { state, event, transition } of pairs(SOP_VERSION_MACHINE)) {
    it(`${event} from ${state} is ${transition ? `allowed, to ${transition.to}` : 'refused'}`, () => {
      const r = run(state, event as 'sign_off' | 'supersede')
      if (transition) expect(r).toMatchObject({ ok: true, to: transition.to })
      else expect(r.ok).toBe(false)
    })
  }

  it('[HH-PKT-03] a sign-off names the reviewer, their qualification and what was reviewed', () => {
    const r = run('pending_competent_review', 'sign_off', { reviewerName: ' ', reviewNote: '' })
    expect(r.ok).toBe(false)
    if (!r.ok)
      expect(r.problems.map((p) => p.code)).toEqual(['REVIEWER_REQUIRED', 'QUALIFICATION_REQUIRED', 'REASON_REQUIRED'])
  })

  it('[HH-PKT-03] only staff sign off; only the system supersedes; superseded is final', () => {
    const asSystem = apply(
      { machine: 'sop_version.review', state: 'pending_competent_review', version: 1 },
      'sign_off',
      {
        actor: 'system',
        expectedVersion: 1,
        now: NOW,
        facts: SIGNED,
      },
    )
    expect(asSystem).toMatchObject({ ok: false, code: 'ACTOR_NOT_ALLOWED' })
    const asStaff = apply({ machine: 'sop_version.review', state: 'approved', version: 1 }, 'supersede', {
      actor: 'staff',
      expectedVersion: 1,
      now: NOW,
      facts: {},
    })
    expect(asStaff).toMatchObject({ ok: false, code: 'ACTOR_NOT_ALLOWED' })
    expect(SOP_VERSION_MACHINE.final).toEqual(['superseded'])
  })
})

describe('the SOP part of readiness (HH-PKT-03, OWN-DEC-17, OWN-DEC-108)', () => {
  it('[HH-PKT-03] no pinned SOP version is NOT CONFIGURED and blocks in every environment', () => {
    for (const environment of ['local', 'ci', 'staging', 'production'] as const)
      expect(sopReadiness({ pinned: false, signedOff: false, environment })).toEqual({
        ok: false,
        blockers: ['SOP_NOT_CONFIGURED'],
        pendingReviewBanner: false,
      })
  })

  it('[HH-PKT-03][OWN-DEC-108] pending competent review runs on staging under the banner and blocks production', () => {
    for (const environment of ['local', 'ci', 'staging'] as const)
      expect(sopReadiness({ pinned: true, signedOff: false, environment })).toEqual({
        ok: true,
        blockers: [],
        pendingReviewBanner: true,
      })
    expect(sopReadiness({ pinned: true, signedOff: false, environment: 'production' })).toEqual({
      ok: false,
      blockers: ['SOP_PENDING_COMPETENT_REVIEW'],
      pendingReviewBanner: true,
    })
  })

  it('[OWN-DEC-17] the competent-review sign-off is what production needs; no banner after it', () => {
    expect(sopReadiness({ pinned: true, signedOff: true, environment: 'production' })).toEqual({
      ok: true,
      blockers: [],
      pendingReviewBanner: false,
    })
  })
})

describe('verbatim items (HH-PKT-03, RULE-NO-INVENTED-FACTS)', () => {
  const step: SopItem = {
    id: '3.1',
    kind: 'step',
    section: null,
    line: 10,
    lines: ['- [ ] **Synthetic:** first line.', '\t- synthetic continuation', '  - Evidence: photo'],
    checkbox: true,
    evidence: ['photo'],
    required: true,
    holdBefore: [],
  }
  const control: SopItem = {
    id: '3.2',
    kind: 'control',
    section: null,
    line: 12,
    lines: ['> HOLD (X): synthetic.', '> second synthetic line.'],
    control: 'HOLD',
    ref: 'X',
  }
  const table: SopItem = {
    id: '4.1',
    kind: 'table',
    section: null,
    line: 20,
    lines: ['| Check | Evidence |', '|---|---|', '| Synthetic one | Note |'],
  }

  it('shows the lines without list, quote and evidence markers, and nothing else', () => {
    expect(itemText(step)).toBe('**Synthetic:** first line.\n- synthetic continuation')
    expect(itemText(control)).toBe('HOLD (X): synthetic.\nsecond synthetic line.')
    expect(tableRows(table)).toEqual({ header: ['Check', 'Evidence'], rows: [['Synthetic one', 'Note']] })
  })

  it('[HH-WORK-11] six ordered stages; the hazard checks are the stages’ controls', () => {
    expect(SOP_STAGES).toEqual([
      'site_preparation',
      'setup_checks',
      'work_steps',
      'quality_checks',
      'cleanup_waste',
      'final_checks',
    ])
    const content: SopContent = {
      stages: SOP_STAGES.map((key, i) => ({
        stage: i + 1,
        key,
        heading: key,
        items: i === 2 ? [step, control] : [],
      })),
      stopWork: [],
      openQuestions: [],
    }
    expect(hazardControls(content).map((c) => c.id)).toEqual(['3.2'])
  })
})
