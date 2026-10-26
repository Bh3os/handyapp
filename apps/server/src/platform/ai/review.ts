// Authorization outside the model (TSK-0116; HH-AUTO-04, HH-AUTO-03, OWN-DEC-15, RULE-SERVER-AUTHZ, RULE-AI-WAVE2).
// Whether a person may review a suggestion is the policy's decision on that person, the record the server loaded and
// the request's own facts. The suggestion contributes only which use it belongs to (set by the server, output.ts):
// nothing the model wrote reaches decide(), so model output can never grant, widen or stand in for a permission.
// Reviewing is not doing either: each action a suggestion proposes is taken by the person through its own route,
// where the policy decides it again.
import { type Actor, decide, type Decision, type DecisionContext, type Resource } from '@handyhub/policy'
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
