// The person's review of an AI suggestion (TSK-0117; HH-AUTO-03, OWN-DEC-14, OWN-DEC-211, RULE-HUMAN-REVIEW,
// RULE-AI-WAVE2, RULE-SERVER-AUTHZ). AI is disabled, so no suggestion can exist outside these tests: each one here is
// built by the TSK-0116 output contract from a synthetic answer, never by a model. They show that, were AI on, every
// suggestion would need a staff member holding the use's review action to accept it, that accepting applies nothing,
// and that even an enabled module would refuse every use while its plan-33 values stay NOT CONFIGURED.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Actor, DecisionContext, Resource, StaffActor, StaffRole } from '@handyhub/policy'
import { decide } from '@handyhub/policy'
import { describe, expect, it } from 'vitest'
import {
  AI_USES,
  assessAssist,
  parseSuggestion,
  reviewSuggestion,
  type AiSuggestion,
  type AiUse,
} from '../../src/platform/ai/index.js'

const NOW = new Date('2026-10-20T15:00:00Z')
const LATER = new Date('2026-10-20T15:05:00Z')
const ctx: DecisionContext = { now: NOW, online: true, today: '2026-10-20' }
const staff = (userId: string, roles: StaffRole[]): StaffActor => ({
  kind: 'staff',
  userId,
  roles,
  capabilities: [],
  status: 'active',
  freshAuth: true,
})
const owner = staff('owner-117', ['owner'])
const office = staff('office-117', ['office'])
const estimator = staff('estimator-117', ['estimator'])
const worker = staff('worker-117', ['worker'])
const resource: Resource = { projectId: 'project-117' }

/** A suggestion as the contract would accept it, from a synthetic answer (no model). */
function suggestion(u: AiUse, over: Record<string, unknown> = {}): AiSuggestion {
  const parsed = parseSuggestion(
    {
      status: 'proposed',
      recordIds: ['record-117'],
      facts: ['Synthetic fact.'],
      assumptions: ['Synthetic assumption.'],
      missingInputs: [],
      output: 'Synthetic suggested text.',
      proposedActions: [...u.proposedActions],
      nextStep: 'A person reviews it.',
      ...over,
    },
    {
      use: u.id,
      recordIds: ['record-117'],
      source: { provider: 'none', model: 'none', version: '0' },
      asOf: NOW,
      timeZone: 'America/Kentucky/Louisville',
    },
  )
  if (!parsed.ok) throw new Error(`${u.id}: ${parsed.refusal}`)
  return parsed.suggestion
}
const use = (id: string): AiUse => AI_USES.find((u) => u.id === id) as AiUse
const reviewable = AI_USES.filter((u) => u.reviewAction !== null)

describe('every suggestion needs a staff member’s acceptance (TSK-0117, HH-AUTO-03, OWN-DEC-14)', () => {
  it('[HH-AUTO-03][RULE-SERVER-AUTHZ] only a staff member holding the use’s review action may accept or reject it', () => {
    for (const u of reviewable) {
      const s = suggestion(u)
      for (const actor of [owner, office, estimator, worker]) {
        const allowed = decide(actor, u.reviewAction as never, resource, ctx).effect === 'allow'
        const got = reviewSuggestion(actor, s, resource, ctx, { verdict: 'accept' }, LATER)
        expect(got.ok, `${u.id} ${actor.roles[0]}`).toBe(allowed)
        expect(reviewSuggestion(actor, s, resource, ctx, { verdict: 'reject' }, LATER).ok).toBe(allowed)
      }
    }
  })

  it('[RULE-AI-WAVE2] the AI never reviews, and no customer or guest reviews a suggestion (no customer-visible AI)', () => {
    // A verified customer of this very project: the policy lets them reply on its thread, never review a suggestion.
    const customer: Actor = {
      kind: 'customer',
      contactId: 'contact-117',
      projectAccess: [{ projectId: 'project-117', via: 'account' }],
      freshVerification: true,
    }
    const others: Actor[] = [{ kind: 'ai' }, { kind: 'guest' }, customer]
    for (const u of reviewable) {
      for (const actor of others) {
        const got = reviewSuggestion(actor, suggestion(u), resource, ctx, { verdict: 'accept' }, LATER)
        expect(got.ok, `${u.id} ${actor.kind}`).toBe(false)
      }
    }
    const reply = suggestion(use('reply.draft'))
    expect(decide(customer, 'message.reply', resource, ctx).effect).toBe('allow')
    expect(reviewSuggestion(customer, reply, resource, ctx, { verdict: 'accept' }, LATER)).toEqual({
      ok: false,
      refusal: 'STAFF_ONLY',
    })
    expect(reviewSuggestion({ kind: 'ai' }, reply, resource, ctx, { verdict: 'accept' }, LATER)).toEqual({
      ok: false,
      refusal: 'AI_DISABLED',
    })
  })

  it('[OWN-DEC-14] accepting makes it verified by the person, keeps the suggestion as it came, and applies nothing', () => {
    for (const u of reviewable) {
      const s = suggestion(u)
      const got = reviewSuggestion(owner, s, resource, ctx, { verdict: 'accept' }, LATER)
      expect(got).toEqual({
        ok: true,
        reviewed: {
          use: u.id,
          status: 'verified',
          reviewedBy: owner.userId,
          reviewedAt: LATER,
          text: s.output,
          edited: false,
          nextAction: u.reviewAction,
          suggestion: s,
          applied: false,
        },
      })
    }
  })

  it('[OWN-DEC-211] an edited English draft keeps the suggestion beside it; a rejection leaves only the manual path', () => {
    const s = suggestion(use('staff_note.translate'), { output: 'Synthetic English draft.' })
    const edited = reviewSuggestion(office, s, resource, ctx, { verdict: 'accept', text: 'Office wording.' }, LATER)
    expect(edited).toMatchObject({
      ok: true,
      reviewed: { status: 'verified', text: 'Office wording.', edited: true, nextAction: 'message.review_proposal' },
    })
    expect(s.output).toBe('Synthetic English draft.')
    // Sending stays the reviewer's own Send (TSK-0155): accepting a draft never sends or applies it.
    expect((edited as { reviewed: { applied: boolean } }).reviewed.applied).toBe(false)
    expect(reviewSuggestion(worker, s, resource, ctx, { verdict: 'accept' }, LATER)).toMatchObject({ ok: false })

    const rejected = reviewSuggestion(office, s, resource, ctx, { verdict: 'reject' }, LATER)
    expect(rejected).toMatchObject({
      ok: true,
      reviewed: { status: 'rejected', text: null, edited: false, nextAction: null, applied: false },
    })
  })

  it('[OWN-DEC-14] a blocked suggestion can only be rejected, and an empty edit is refused', () => {
    const blocked = suggestion(use('request.classify'), { status: 'blocked' })
    expect(reviewSuggestion(owner, blocked, resource, ctx, { verdict: 'accept' }, LATER)).toEqual({
      ok: false,
      refusal: 'BLOCKED_SUGGESTION',
    })
    expect(reviewSuggestion(owner, blocked, resource, ctx, { verdict: 'reject' }, LATER).ok).toBe(true)
    expect(
      reviewSuggestion(owner, suggestion(use('reply.draft')), resource, ctx, { verdict: 'accept', text: ' ' }, LATER),
    ).toEqual({ ok: false, refusal: 'EMPTY_TEXT' })
  })

  it('[HH-AUTO-03] a use without a review action can never be accepted', () => {
    const packet = use('packet.draft')
    expect(packet.reviewAction).toBeNull()
    for (const actor of [owner, office]) {
      expect(reviewSuggestion(actor, suggestion(packet), resource, ctx, { verdict: 'accept' }, LATER)).toEqual({
        ok: false,
        refusal: 'REVIEW_NOT_CONFIGURED',
      })
    }
  })
})

describe('the staff screens show the manual path of every reviewable use (TSK-0117, HH-AUTO-04)', () => {
  it('[HH-AUTO-04] each use a person can review has its off note on a staff screen, and the packet draft has none', () => {
    const screens = readFileSync(join(import.meta.dirname, '../../../staff/src/AiAssist.tsx'), 'utf8')
    for (const u of AI_USES) expect(screens.includes(`'${u.id}':`), u.id).toBe(u.reviewAction !== null)
  })
})

describe('even an enabled module would refuse every use until plan 33 (TSK-0117, RULE-AI-WAVE2)', () => {
  it('[RULE-AI-WAVE2][RULE-NO-INVENTED-FACTS] with the kill switch hypothetically on, NOT CONFIGURED values still refuse', () => {
    // ai.module can only be off (its parser and a database CHECK refuse anything else): this state is hypothetical.
    const on = { state: 'AI_ENABLED', enabled: true } as never
    for (const u of AI_USES) {
      const r = assessAssist(on, u.id, owner, resource, ctx)
      expect(r.reasons, u.id).not.toContain('AI_DISABLED')
      expect(r.reasons, u.id).toEqual(
        expect.arrayContaining(['BOUNDS_NOT_CONFIGURED', 'DESTINATION_NOT_CONFIGURED', 'INSTRUCTIONS_NOT_CONFIGURED']),
      )
      expect(r.manualPath).toBe(u.manualPath)
    }
  })
})
