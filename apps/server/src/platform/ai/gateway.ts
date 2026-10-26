// The AI gateway: the one entry point a future AI assistance would go through (TSK-0116; HH-AUTO-04, RULE-AI-WAVE2,
// OWN-DEC-74, OWN-DEC-20, RULE-SERVER-AUTHZ). AI is disabled in every environment, so the gateway's only outcome is a
// refusal: it has no provider to call, holds no key and makes no network request, and its result type has no other
// case. Every request is still checked against every guardrail and written to the audit log as denied, with the
// manual path that does the same work without AI.
// - Kill switch: aiModule() reads ai.module from the configuration; the value can only be { enabled: false } (the
//   key's parser and a database CHECK refuse anything else), and an enabled value would refuse to load at all.
// - Authorization outside the model: the requester must hold the use's request action on the record (decide()).
// - Bounds, privacy destination, review action and instructions: NOT CONFIGURED values refuse the use.
// - The audit entry names the use, the reasons and the input field names, never input values (RULE-SERVER-AUTHZ).
import { type Db, type Tx, withTx } from '@handyhub/db'
import { decide, type DecisionContext, type DenyReason, type Resource, type StaffActor } from '@handyhub/policy'
import { audit } from '../audit.js'
import { aiModule, type Config, loadConfig } from '../config/index.js'
import type { AiInputValue } from './input.js'
import { aiUse } from './registry.js'

export type AssistRefusal =
  | 'AI_DISABLED'
  | 'UNKNOWN_USE'
  | 'NOT_PERMITTED'
  | 'REVIEW_NOT_CONFIGURED'
  | 'BOUNDS_NOT_CONFIGURED'
  | 'DESTINATION_NOT_CONFIGURED'
  | 'INSTRUCTIONS_NOT_CONFIGURED'

/** The gateway's only outcome while AI is wave 2: nothing was sent, and the manual path stays the way to do it. */
export type AssistRefused = {
  readonly outcome: 'refused'
  /** Every guardrail the request failed, AI_DISABLED first. */
  readonly reasons: readonly AssistRefusal[]
  /** The policy's reason when the requester lacks the use's request action. */
  readonly policyReason?: DenyReason
  /** The use's manual path; null for an unknown use. */
  readonly manualPath: string | null
}

export type AssistRequest = {
  readonly use: string
  readonly actor: StaffActor
  /** The record the inputs come from, as the server loaded it. */
  readonly resource: Resource
  readonly ctx: DecisionContext
  readonly inputs: Readonly<Record<string, AiInputValue>>
  readonly requestId?: string
}

/** Every guardrail `use` fails for `actor` on `resource`, given the module state. Pure; sends nothing. */
export function assessAssist(
  state: ReturnType<typeof aiModule>,
  useId: string,
  actor: StaffActor,
  resource: Resource,
  ctx: DecisionContext,
): Omit<AssistRefused, 'outcome'> {
  const reasons: AssistRefusal[] = []
  if (!state.enabled) reasons.push('AI_DISABLED')
  const use = aiUse(useId)
  if (!use) return { reasons: [...reasons, 'UNKNOWN_USE'], manualPath: null }
  const decision = decide(actor, use.requestAction, resource, ctx)
  const policyReason = decision.effect === 'deny' ? decision.reason : undefined
  if (policyReason !== undefined) reasons.push('NOT_PERMITTED')
  if (use.reviewAction === null) reasons.push('REVIEW_NOT_CONFIGURED')
  if (typeof use.bounds === 'object' && 'state' in use.bounds) reasons.push('BOUNDS_NOT_CONFIGURED')
  if (typeof use.destination === 'object' && 'state' in use.destination) reasons.push('DESTINATION_NOT_CONFIGURED')
  if (typeof use.instructions !== 'string') reasons.push('INSTRUCTIONS_NOT_CONFIGURED')
  return { reasons, ...(policyReason !== undefined ? { policyReason } : {}), manualPath: use.manualPath }
}

/**
 * Asks for AI assistance. Always refused while AI is wave 2, and always audited (result `denied`) in its own
 * transaction, or in the caller's when `db` is one. `config` may be passed when already loaded.
 */
export async function requestAssist(db: Db | Tx, req: AssistRequest, config?: Config): Promise<AssistRefused> {
  const state = aiModule(config ?? (await loadConfig(db)))
  const assessed = assessAssist(state, req.use, req.actor, req.resource, req.ctx)
  await withTx(db, (tx) =>
    audit.record(tx, {
      actor: { kind: 'staff', id: req.actor.userId, roles: req.actor.roles },
      action: 'ai.assist',
      target: { type: 'ai_use', id: req.use.slice(0, 100) },
      result: 'denied',
      reason: assessed.reasons.join(', '),
      summary: {
        use: req.use.slice(0, 100),
        reasons: [...assessed.reasons],
        ...(assessed.policyReason !== undefined ? { policyReason: assessed.policyReason } : {}),
        inputFields: Object.keys(req.inputs).map((k) => k.slice(0, 100)),
      },
      ...(req.requestId !== undefined ? { requestId: req.requestId } : {}),
    }),
  )
  return { outcome: 'refused', ...assessed }
}
