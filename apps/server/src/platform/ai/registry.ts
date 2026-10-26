// The allowed-use registry of the AI module (TSK-0116; HH-AUTO-04, HH-AUTO-03, OWN-DEC-15, OWN-DEC-74, RULE-AI-WAVE2).
// AI stays disabled in every environment: nothing here calls a provider, and no provider, model or key exists in the
// repository. The registry is the closed list of what a future AI assistance may be asked to do, declared like the
// automations (platform/automation.ts), so every guardrail is in place before the owner approves plan 33:
// - the staff action the requester must hold, decided by the policy outside any model (RULE-SERVER-AUTHZ);
// - the named inputs it may receive, with where each comes from; everything else is dropped (data minimisation);
// - the actions a suggestion may propose, each still taken by a person through its own route and policy check;
// - the person's action that reviews and applies a suggestion (HH-AUTO-03: every consequential output is reviewed);
// - the manual path that does the same work without AI (HH-AUTO-04: a fallback for every AI-assisted step);
// - the bounds (steps, retries, cost, time), the privacy destination (which provider may receive the data) and the
//   fixed instructions: NOT CONFIGURED until the owner approves plan 33 and a provider (OWN-DEC-74). A use with any of
//   them NOT CONFIGURED is refused even if the module were enabled.
// The uses, their inputs and their actions are PROPOSED (OQ-AI-GUARDRAILS-DETAILS).
import type { Action } from '@handyhub/policy'
import { isSecretField, normaliseKey } from '../redact.js'

/** A guardrail value nobody has decided yet: refused, never defaulted (RULE-NO-INVENTED-FACTS). */
export type AiNotConfigured = { readonly state: 'NOT_CONFIGURED'; readonly sourceIds: readonly string[] }

const PLAN_33: AiNotConfigured = Object.freeze({ state: 'NOT_CONFIGURED', sourceIds: ['OWN-DEC-74', 'HH-AUTO-04'] })

/** Who wrote an input. Every input is data for the model, never instructions; customer text is untrusted evidence. */
export type AiProvenance = 'customer' | 'staff' | 'system'

/** The limits one run of a use must stay inside (HH-AUTO-04). Money in integer cents (RULE-MONEY-CENTS). */
export type AiBounds = {
  readonly maxModelSteps: number
  readonly maxToolSteps: number
  readonly maxRetries: number
  readonly maxCostCents: number
  readonly timeoutMs: number
}

/** Where a use's data may go (HH-AUTO-04 privacy destinations). */
export type AiDestination = { readonly provider: string; readonly region: string }

export type AiUse = {
  readonly id: string
  /** What it does, for staff (internal wording; nothing here is shown to a customer). */
  readonly description: string
  readonly sourceIds: readonly string[]
  /** The policy action the requester must hold on the record: the AI never reads what its requester may not. */
  readonly requestAction: Action
  /** The policy action of the person who reviews and applies a suggestion; null: no such action exists yet. */
  readonly reviewAction: Action | null
  /** The only inputs it may receive, by name, with their provenance. */
  readonly inputs: Readonly<Record<string, AiProvenance>>
  /** The actions a suggestion may propose. Proposing is not doing: a person takes each through its own route. */
  readonly proposedActions: readonly Action[]
  /** The manual path that does the same work without AI; it always stays available. */
  readonly manualPath: string
  readonly bounds: AiBounds | AiNotConfigured
  readonly destination: AiDestination | AiNotConfigured
  /** The fixed instructions; never built from inputs. Written and approved with TSK-0117. */
  readonly instructions: string | AiNotConfigured
}

type Declared = Omit<AiUse, 'bounds' | 'destination' | 'instructions'>

/** The uses HH-AUTO-03 names, and the Spanish-note drafts of OWN-DEC-166 and OWN-DEC-211 (PROPOSED shapes). */
const DECLARED: readonly Declared[] = [
  {
    id: 'request.classify',
    description: 'Suggest a service and next step for a new request.',
    sourceIds: ['HH-AUTO-03'],
    requestAction: 'request.view',
    reviewAction: 'request.qualify',
    inputs: {
      serviceCode: 'system',
      requestDescription: 'customer',
      propertyCity: 'customer',
      propertyState: 'customer',
    },
    proposedActions: ['request.qualify', 'request.ask_question', 'request.not_a_fit'],
    manualPath: 'Office or the Owner reads the request in the queue and qualifies it, asks a question or declines it.',
  },
  {
    id: 'reply.draft',
    description: "Draft a reply to a customer's message for staff to edit and send.",
    sourceIds: ['HH-AUTO-03', 'OWN-DEC-211'],
    requestAction: 'message.reply',
    reviewAction: 'message.reply',
    inputs: { threadMessages: 'customer', requestDescription: 'customer', projectStatus: 'system' },
    proposedActions: ['message.reply'],
    manualPath: 'Staff write the reply in the inbox from the approved templates.',
  },
  {
    id: 'estimate.draft',
    description: 'Draft estimate line descriptions and assumptions; never prices.',
    sourceIds: ['HH-AUTO-03'],
    requestAction: 'estimate.draft',
    reviewAction: 'estimate.draft',
    inputs: { serviceCode: 'system', requestDescription: 'customer', scopeNotes: 'staff' },
    proposedActions: ['estimate.draft'],
    manualPath: 'The Estimator or the Owner drafts the estimate in the estimate editor.',
  },
  {
    id: 'packet.draft',
    description: 'Draft job packet instructions from the scope and the service SOP.',
    sourceIds: ['HH-AUTO-03'],
    requestAction: 'job.view_packet',
    // No matrix row edits a packet's text: a reviewed packet draft has nowhere to go yet.
    reviewAction: null,
    inputs: { serviceCode: 'system', scopeNotes: 'staff', sopStepTitles: 'system' },
    proposedActions: [],
    manualPath: 'The packet is built from the job records and the active SOP, as today.',
  },
  {
    id: 'schedule.suggest',
    description: 'Suggest arrival windows to offer.',
    sourceIds: ['HH-AUTO-03'],
    requestAction: 'schedule.view_board',
    reviewAction: 'visit.offer_windows',
    inputs: { serviceCode: 'system', preferredWindows: 'customer', crewAvailability: 'system' },
    proposedActions: ['visit.offer_windows'],
    manualPath: 'Office offers windows from the scheduling board.',
  },
  {
    id: 'evidence.point_out',
    description: 'Point out checklist evidence that looks missing before the quality review.',
    sourceIds: ['HH-AUTO-03'],
    requestAction: 'quality.review',
    reviewAction: 'quality.review',
    inputs: { checklistSteps: 'system', stepNotes: 'staff' },
    proposedActions: ['quality.manage_punch_items'],
    manualPath: 'The Owner reviews the checklist and its evidence in the quality review.',
  },
  {
    id: 'performance.summarize',
    description: 'Summarize performance from dashboard totals.',
    sourceIds: ['HH-AUTO-03'],
    requestAction: 'dashboard.view',
    reviewAction: 'dashboard.view',
    inputs: { jobCountsByStatus: 'system', qualityOutcomes: 'system' },
    proposedActions: [],
    manualPath: 'The Owner reads the Owner Dashboard.',
  },
  {
    id: 'staff_note.translate',
    description: 'Draft an English version of a Spanish worker note or proposed reply, kept beside the original.',
    sourceIds: ['OWN-DEC-166', 'OWN-DEC-211'],
    requestAction: 'message.review_proposal',
    reviewAction: 'message.review_proposal',
    inputs: { workerNoteSpanish: 'staff' },
    proposedActions: ['message.review_proposal'],
    manualPath: 'Owner or Office reads the Spanish original and writes the approved English message (TSK-0155).',
  },
]

/** Every use, with the guardrail values plan 33 decides still NOT CONFIGURED. */
export const AI_USES: readonly AiUse[] = DECLARED.map((u) =>
  Object.freeze({ ...u, bounds: PLAN_33, destination: PLAN_33, instructions: PLAN_33 }),
)

export function aiUse(id: string): AiUse | undefined {
  return AI_USES.find((u) => u.id === id)
}

/**
 * Inputs that never reach a model, whatever a use declares (OWN-DEC-15: credentials, property access codes, card
 * details and private photos are never exposed; PROPOSED: contact details and documents are left out as well). Names
 * match after normalisation, like the redaction schema: every secret field, and any name containing these parts.
 */
export const FORBIDDEN_INPUT_PARTS: readonly string[] = [
  'password',
  'token',
  'secret',
  'credential',
  'apikey',
  'accesscode',
  'accessinstruction',
  'gatecode',
  'lockbox',
  'alarm',
  'card',
  'cvv',
  'cvc',
  'bank',
  'photo',
  'image',
  'video',
  'attachment',
  'document',
  'email',
  'phone',
  'street',
  'address',
  'fullname',
  'firstname',
  'lastname',
]

export function isForbiddenInput(name: string): boolean {
  const k = normaliseKey(name)
  return isSecretField(name) || FORBIDDEN_INPUT_PARTS.some((p) => k.includes(p))
}

export class AiRegistryError extends Error {
  override name = 'AiRegistryError'
}

/** Refuses a registry that breaks a guardrail; checked by the tests and at module load. */
export function validateRegistry(uses: readonly AiUse[]): void {
  const ids = new Set<string>()
  for (const u of uses) {
    if (ids.has(u.id)) throw new AiRegistryError(`${u.id}: declared twice`)
    ids.add(u.id)
    if (!/^[a-z][a-z_]*\.[a-z][a-z_]*$/.test(u.id)) throw new AiRegistryError(`${u.id}: id must be <area>.<verb>`)
    if (u.manualPath.trim() === '') throw new AiRegistryError(`${u.id}: a manual path is required`)
    if (Object.keys(u.inputs).length === 0) throw new AiRegistryError(`${u.id}: declares no inputs`)
    for (const name of Object.keys(u.inputs)) {
      if (isForbiddenInput(name)) throw new AiRegistryError(`${u.id}: input ${name} may never reach a model`)
    }
    if (u.proposedActions.length > 0 && u.reviewAction === null) {
      throw new AiRegistryError(`${u.id}: proposes actions without a review action`)
    }
  }
}

validateRegistry(AI_USES)
