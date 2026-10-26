// Authorization outside the model (TSK-0116; HH-AUTO-04, HH-AUTO-03, OWN-DEC-15, RULE-SERVER-AUTHZ, RULE-AI-WAVE2).
// Whether a person may review a suggestion is the policy's decision on that person, the record the server loaded and
// the request's own facts. The suggestion contributes only which use it belongs to (set by the server, output.ts):
// nothing the model wrote reaches decide(), so model output can never grant, widen or stand in for a permission.
// Reviewing is not doing either: each action a suggestion proposes is taken by the person through its own route,
// where the policy decides it again.
import {
  type Action,
  type Actor,
  decide,
  type Decision,
  type DecisionContext,
  type DenyReason,
  type Resource,
} from '@handyhub/policy'
import type { AiSuggestion } from './output.js'
import { aiUse } from './registry.js'

export type ReviewDecision =
  | Decision
  | { readonly effect: 'deny'; readonly action: string; readonly reason: 'REVIEW_NOT_CONFIGURED' | 'UNKNOWN_USE' }

/** Whether `actor` may review and apply `suggestion` on `resource` (the server's record, never the model's words). */
export function decideReview(
  actor: Actor,
  suggestion: Pick<AiSuggestion, 'use'>,
  resource: Resource,
  ctx: DecisionContext,
): ReviewDecision {
  const use = aiUse(suggestion.use)
  if (!use) return { effect: 'deny', action: suggestion.use, reason: 'UNKNOWN_USE' }
  if (use.reviewAction === null) return { effect: 'deny', action: use.id, reason: 'REVIEW_NOT_CONFIGURED' }
  return decide(actor, use.reviewAction, resource, ctx)
}

// The person's review step (TSK-0117; HH-AUTO-03, OWN-DEC-14, OWN-DEC-211, RULE-HUMAN-REVIEW). A suggestion takes
// effect only through a staff member who holds the use's review action: they accept it, as written or with their own
// edit, or reject it. "verified" is their status, never the model's. Accepting still applies nothing: the accepted
// text fills the manual path's own form, and the person then takes the action through its route, where the policy
// decides it again (a reply is still sent by the Send of the inbox or of the proposal review, OWN-DEC-211). The
// suggestion is kept unchanged beside the result, so the original and the reviewed text can be compared. While AI is
// disabled no suggestion can exist (the gateway refuses every request), so only the tests run this.

/** The person's verdict: accept the suggestion (as written, or with their edit of its text) or reject it. */
export type ReviewVerdict = { readonly verdict: 'accept'; readonly text?: string } | { readonly verdict: 'reject' }

export type ReviewedSuggestion = {
  readonly use: string
  /** verified: a staff member accepted it; rejected: it is dropped and the manual path is used as it is. */
  readonly status: 'verified' | 'rejected'
  readonly reviewedBy: string
  readonly reviewedAt: Date
  /** The accepted text: the suggestion's output, or the person's edit of it; null when rejected. */
  readonly text: string | null
  readonly edited: boolean
  /** The action the person takes next, through its own route and policy check; null when rejected. */
  readonly nextAction: Action | null
  /** The suggestion exactly as it came back, kept beside the reviewed text. */
  readonly suggestion: AiSuggestion
  /** Always false: reviewing is not doing. */
  readonly applied: false
}

export type ReviewRefusal =
  | DenyReason
  | 'REVIEW_NOT_CONFIGURED'
  | 'UNKNOWN_USE'
  // Only staff review suggestions: no customer-visible AI.
  | 'STAFF_ONLY'
  // A blocked suggestion has nothing to accept; it can only be rejected.
  | 'BLOCKED_SUGGESTION'
  | 'EMPTY_TEXT'

export type ReviewOutcome =
  { readonly ok: true; readonly reviewed: ReviewedSuggestion } | { readonly ok: false; readonly refusal: ReviewRefusal }

/** `actor`'s review of `suggestion` on `resource` at `at`: the policy decides on the person, never on the suggestion. */
export function reviewSuggestion(
  actor: Actor,
  suggestion: AiSuggestion,
  resource: Resource,
  ctx: DecisionContext,
  verdict: ReviewVerdict,
  at: Date,
): ReviewOutcome {
  const decision = decideReview(actor, suggestion, resource, ctx)
  if (decision.effect === 'deny') return { ok: false, refusal: decision.reason }
  if (actor.kind !== 'staff') return { ok: false, refusal: 'STAFF_ONLY' }
  const base = { use: suggestion.use, reviewedBy: actor.userId, reviewedAt: at, suggestion, applied: false as const }
  if (verdict.verdict === 'reject')
    return {
      ok: true,
      reviewed: Object.freeze({ ...base, status: 'rejected', text: null, edited: false, nextAction: null }),
    }
  if (suggestion.status === 'blocked') return { ok: false, refusal: 'BLOCKED_SUGGESTION' }
  const text = verdict.text ?? suggestion.output
  if (text.trim() === '') return { ok: false, refusal: 'EMPTY_TEXT' }
  return {
    ok: true,
    reviewed: Object.freeze({
      ...base,
      status: 'verified',
      text,
      edited: text !== suggestion.output,
      nextAction: decision.action,
    }),
  }
}
