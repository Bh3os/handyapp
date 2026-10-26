// AI assistance for staff, in its disabled state (TSK-0117; HH-AUTO-03, HH-AUTO-04, RULE-AI-WAVE2, OWN-DEC-74,
// OWN-DEC-20, OWN-DEC-211, RULE-SERVER-AUTHZ).
//   POST /staff/ai/uses/<use>/suggestions   ask for a suggestion of one registered use (platform/ai/registry.ts)
// AI stays off in every environment until the owner approves plan 33 and a provider: every request goes through the
// gateway of TSK-0116, which refuses it (AI_DISABLED first, then every other unmet guardrail), answers with the use's
// manual path and records the refusal (ai.assist, denied) in this route's transaction. Nothing is sent anywhere: there
// is no provider, model, key or network call, and no record is read for a refused request (the use's inputs would be
// loaded only once a use could be allowed). The staff screens show the manual path only (AiAssist.tsx); they never
// call these routes while AI is disabled.
// - One route per use, so the framework decides the use's request action on the person before anything runs, and the
//   gateway decides it again (authorization outside the model). The decision has no record facts: roles whose cell is
//   limited to assigned or own records (a Worker's packet, an Estimator's own threads) are refused, which is the safe
//   side until plan 33 says which record each use reads.
// - A suggestion, once one could exist, is reviewed by a person holding the use's review action
//   (platform/ai/review.ts reviewSuggestion) and is never applied by the server; no route reviews one yet, since none
//   can be produced.
import type { StaffActor } from '@handyhub/policy'
import { ApiError } from '../../api/errors.js'
import type { ApiContext, ApiModule, RouteDef } from '../../api/route.js'
import { AI_USES, ASSIST_REFUSALS, type AiUse, requestAssist } from '../../platform/ai/index.js'

const TEST = 'test/integration/ai-assistance.test.ts'

function staff(ctx: ApiContext): StaffActor {
  if (ctx.actor.kind !== 'staff') throw new ApiError('FORBIDDEN')
  return ctx.actor
}

const REFUSED = {
  type: 'object',
  additionalProperties: false,
  required: ['outcome', 'reasons', 'manualPath'],
  properties: {
    outcome: { type: 'string', enum: ['refused'] },
    reasons: { type: 'array', items: { type: 'string', enum: [...ASSIST_REFUSALS] } },
    policyReason: { type: 'string' },
    manualPath: { type: ['string', 'null'] },
  },
} as const

/** `request.classify` -> `RequestClassify`, for the operation IDs. */
const pascal = (id: string) =>
  id
    .split(/[._]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('')

function suggestionRoute(use: AiUse): RouteDef {
  return {
    method: 'POST',
    path: `/staff/ai/uses/${use.id}/suggestions`,
    operationId: `requestAiSuggestion${pascal(use.id)}`,
    summary: `Ask for an AI suggestion: ${use.description}`,
    description:
      `Staff with ${use.requestAction}. AI is disabled in every environment (RULE-AI-WAVE2): the request is always ` +
      'refused, with AI_DISABLED first and every other unmet guardrail (bounds, privacy destination and fixed ' +
      'instructions are NOT CONFIGURED' +
      (use.reviewAction === null ? '; no review action exists for this use' : '') +
      '), and answered with the manual path: ' +
      use.manualPath +
      ' Nothing is sent to any provider and no record is read. The refusal is audited (ai.assist, denied) with the ' +
      'use and the reasons only.',
    actors: ['staff'],
    permission: use.requestAction,
    kind: 'write',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'ai.assist',
    pagination: false,
    test: TEST,
    schema: { response: { 200: REFUSED } },
    handler: async (ctx) => {
      const actor = staff(ctx)
      const result = await requestAssist(
        ctx.tx ?? ctx.db,
        { use: use.id, actor, resource: {}, ctx: { now: new Date(), online: true }, inputs: {} },
        undefined,
        (event) => ctx.audit(event),
      )
      return { body: result, headers: { 'cache-control': 'no-store' } }
    },
  }
}

export function aiAssistModule(): ApiModule {
  return { name: 'ai', routes: AI_USES.map(suggestionRoute) }
}
