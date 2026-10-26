// The output contract of an AI use (TSK-0116; OWN-DEC-14, HH-AUTO-03, HH-AUTO-04, RULE-NO-INVENTED-FACTS). A model's
// answer is untrusted data. It becomes a suggestion only if it has exactly the contract's fields, and a suggestion is
// never an action: it is not applied, carries no permission, and waits for the person the use names to review it.
// - The model writes only: status (draft, proposed or blocked), record IDs, facts, assumptions, missing inputs, the
//   output, proposed actions and the next step. "verified" is a person's status after review, never the model's.
// - The server writes the rest: the use, its source and version, the as-of time and zone, and the reviewer.
// - A field the contract does not name (for example `approved`, `role` or `authorizedBy`) refuses the whole answer.
// - Record IDs must be ones the server handed in, and proposed actions ones the use allows: never invented ones.
import type { Action } from '@handyhub/policy'
import { aiUse } from './registry.js'

export const SUGGESTION_STATUSES = ['draft', 'proposed', 'blocked'] as const
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number]

const MODEL_FIELDS = [
  'status',
  'recordIds',
  'facts',
  'assumptions',
  'missingInputs',
  'output',
  'proposedActions',
  'nextStep',
] as const

export type AiSuggestion = {
  readonly use: string
  readonly status: SuggestionStatus
  readonly recordIds: readonly string[]
  /** Which model and version wrote it; set by the server. */
  readonly source: { readonly provider: string; readonly model: string; readonly version: string }
  readonly asOf: Date
  readonly timeZone: string
  readonly facts: readonly string[]
  readonly assumptions: readonly string[]
  readonly missingInputs: readonly string[]
  readonly output: string
  readonly proposedActions: readonly Action[]
  /** The policy action of the person who must review it (the registry's review action). */
  readonly reviewer: Action | null
  readonly nextStep: string
  /** Always false: only a person applies a suggestion, through the route of the action they take. */
  readonly applied: false
}

/** What the server knows when an answer comes back; never read from the answer. */
export type SuggestionContext = {
  readonly use: string
  readonly recordIds: readonly string[]
  readonly source: AiSuggestion['source']
  readonly asOf: Date
  readonly timeZone: string
}

export type OutputRefusal =
  | 'UNKNOWN_USE'
  | 'NOT_AN_OBJECT'
  | 'UNEXPECTED_FIELD'
  | 'MISSING_FIELD'
  | 'BAD_STATUS'
  | 'VERIFIED_BY_PERSON_ONLY'
  | 'BAD_FIELD'
  | 'INVENTED_RECORD_ID'
  | 'ACTION_NOT_ALLOWED'

export type ParsedOutput =
  | { readonly ok: true; readonly suggestion: AiSuggestion }
  | { readonly ok: false; readonly refusal: OutputRefusal; readonly field?: string }

const refuse = (refusal: OutputRefusal, field?: string): ParsedOutput => ({
  ok: false,
  refusal,
  ...(field !== undefined ? { field } : {}),
})

const isTextList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string')

/** Turns a model's raw answer into a suggestion under the contract, or refuses it with the first reason. */
export function parseSuggestion(raw: unknown, ctx: SuggestionContext): ParsedOutput {
  const use = aiUse(ctx.use)
  if (!use) return refuse('UNKNOWN_USE')
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return refuse('NOT_AN_OBJECT')
  const proto: unknown = Object.getPrototypeOf(raw)
  if (proto !== Object.prototype && proto !== null) return refuse('NOT_AN_OBJECT')
  const answer = raw as Record<string, unknown>
  for (const key of Object.keys(answer)) {
    if (!(MODEL_FIELDS as readonly string[]).includes(key)) return refuse('UNEXPECTED_FIELD', key)
  }
  for (const key of MODEL_FIELDS) if (!Object.hasOwn(answer, key)) return refuse('MISSING_FIELD', key)

  const { status, recordIds, facts, assumptions, missingInputs, output, proposedActions, nextStep } = answer
  if (status === 'verified') return refuse('VERIFIED_BY_PERSON_ONLY', 'status')
  if (!(SUGGESTION_STATUSES as readonly unknown[]).includes(status)) return refuse('BAD_STATUS', 'status')
  for (const [field, v] of Object.entries({ recordIds, facts, assumptions, missingInputs, proposedActions })) {
    if (!isTextList(v)) return refuse('BAD_FIELD', field)
  }
  if (typeof output !== 'string') return refuse('BAD_FIELD', 'output')
  if (typeof nextStep !== 'string') return refuse('BAD_FIELD', 'nextStep')
  const ids = recordIds as string[]
  const invented = ids.find((id) => !ctx.recordIds.includes(id))
  if (invented !== undefined) return refuse('INVENTED_RECORD_ID', 'recordIds')
  const actions = proposedActions as string[]
  const disallowed = actions.find((a) => !(use.proposedActions as readonly string[]).includes(a))
  if (disallowed !== undefined) return refuse('ACTION_NOT_ALLOWED', 'proposedActions')

  return {
    ok: true,
    suggestion: Object.freeze({
      use: use.id,
      status: status as SuggestionStatus,
      recordIds: [...ids],
      source: { ...ctx.source },
      asOf: ctx.asOf,
      timeZone: ctx.timeZone,
      facts: [...(facts as string[])],
      assumptions: [...(assumptions as string[])],
      missingInputs: [...(missingInputs as string[])],
      output,
      proposedActions: actions as Action[],
      reviewer: use.reviewAction,
      nextStep,
      applied: false,
    }),
  }
}
