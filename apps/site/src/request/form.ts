// The request wizard's form model (TSK-0026; HH-INT-01, HH-INT-09, C02). Pure functions, shared by the React island
// and its unit tests:
// - the wizard's values are plain strings and booleans, so every input keeps exactly what the visitor typed;
// - toBody() turns them into the submission body, and validate() checks it with the same JSON schema and the same
//   semantic checks as the server (@handyhub/domain/request-form); the server still validates independently;
// - every problem is a field path (`contact.phone`) owned by one step, so the wizard can show it next to its field.
import {
  CONTACT_CHANNELS,
  ESTIMATE_PREFERENCES,
  localDate,
  MAX_SERVICES,
  questionPlan,
  PROPERTY_TYPES,
  REQUEST_FORM_SCHEMA,
  semanticProblems,
  TIME_WINDOWS,
  type ServiceQuestion,
  type SubmitBody,
} from '@handyhub/domain/request-form'
import type { CustomerKey } from '@handyhub/i18n'
import { Ajv } from 'ajv'

export { CONTACT_CHANNELS, ESTIMATE_PREFERENCES, MAX_SERVICES, PROPERTY_TYPES, questionPlan, TIME_WINDOWS }
export type { ServiceQuestion }

/** A service as the form offers it: registry name, category and its questions (GET /api/v1/public/services). */
export type FormService = { id: string; name: string; category: string; questions: ServiceQuestion[] }

/** An answer as typed: the customer's words, or "I don't know" (stored as unknown, never zero). */
export type AnswerInput = { text: string; unknown: boolean }

/** The key of an answer: the service ID for a service's own question, empty for a shared one. */
export function answerKey(serviceId: string | undefined, question: string): string {
  return `${serviceId ?? ''}/${question}`
}

export const STEPS = ['services', 'job', 'property', 'contact', 'review'] as const
export type StepId = (typeof STEPS)[number]

export type FormValues = {
  services: string[]
  /** Optional notes per selected service (HH-SVC-03). */
  notes: Record<string, string>
  /** Answers by answerKey(). */
  answers: Record<string, AnswerInput>
  notSure: boolean
  otherServicesText: string
  description: string
  street: string
  unit: string
  city: string
  state: string
  zip: string
  propertyType: string
  preferredDate: string
  flexible: boolean
  needHelpToday: boolean
  windows: string[]
  estimatePreference: string
  fullName: string
  email: string
  phone: string
  preferredChannel: string
}

export const EMPTY_VALUES: FormValues = {
  services: [],
  notes: {},
  answers: {},
  notSure: false,
  otherServicesText: '',
  description: '',
  street: '',
  unit: '',
  city: '',
  state: '',
  zip: '',
  propertyType: '',
  preferredDate: '',
  flexible: false,
  needHelpToday: false,
  windows: [],
  estimatePreference: '',
  fullName: '',
  email: '',
  phone: '',
  preferredChannel: '',
}

/** Which step shows each field (body paths without the `body.` prefix, matched by their first segments). */
const FIELD_STEP: [RegExp, StepId][] = [
  [/^(services|notSure|otherServicesText)(\.|$)/, 'services'],
  [/^(description|answers)(\.|$)/, 'job'],
  [/^(property|timing)(\.|$)/, 'property'],
  [/^(contact|estimatePreference|smsOptIn|marketingOptIn)(\.|$)/, 'contact'],
]

export function stepOf(field: string): StepId {
  return FIELD_STEP.find(([re]) => re.test(field))?.[1] ?? 'review'
}

/** The form version and privacy-notice version sent with every submission. */
export type FormMeta = { formVersion: string; privacyNoticeVersion: string; startedAt?: number; website?: string }

const optional = (s: string) => (s.trim() === '' ? undefined : s)

/** The answers the plan asks for: typed text, or unknown; a question left empty is simply not answered. */
export function answersFor(v: FormValues, services: readonly FormService[]): NonNullable<SubmitBody['answers']> {
  const selected = v.services.flatMap((id) => services.filter((s) => s.id === id))
  const plan = questionPlan(selected)
  const out: NonNullable<SubmitBody['answers']> = []
  const add = (serviceId: string | undefined, q: ServiceQuestion) => {
    const a = v.answers[answerKey(serviceId, q.key)]
    if (!a) return
    const base = { ...(serviceId ? { serviceId } : {}), question: q.key }
    if (a.unknown) out.push({ ...base, kind: 'unknown' })
    else if (a.text.trim()) out.push({ ...base, kind: 'text', text: a.text })
  }
  for (const q of plan.shared) add(undefined, q)
  for (const group of plan.perService) for (const q of group.questions) add(group.serviceId, q)
  return out
}

export function toBody(v: FormValues, meta: FormMeta, services: readonly FormService[] = []): SubmitBody {
  const answers = answersFor(v, services)
  const body: SubmitBody = {
    formVersion: meta.formVersion,
    privacyNoticeVersion: meta.privacyNoticeVersion,
    services: v.services.map((serviceId) => ({
      serviceId,
      ...(optional(v.notes[serviceId] ?? '') ? { notes: v.notes[serviceId] } : {}),
    })),
    ...(answers.length ? { answers } : {}),
    notSure: v.notSure,
    property: {
      street: v.street,
      city: v.city,
      state: v.state,
      zip: v.zip,
      propertyType: v.propertyType as SubmitBody['property']['propertyType'],
      ...(optional(v.unit) ? { unit: v.unit } : {}),
    },
    timing: {
      flexible: v.flexible,
      needHelpToday: v.needHelpToday,
      windows: v.windows as SubmitBody['timing']['windows'],
      ...(optional(v.preferredDate) && !v.flexible ? { preferredDate: v.preferredDate } : {}),
    },
    estimatePreference: v.estimatePreference as SubmitBody['estimatePreference'],
    contact: {
      fullName: v.fullName,
      email: v.email.trim(),
      phone: v.phone,
      preferredChannel: v.preferredChannel as SubmitBody['contact']['preferredChannel'],
    },
    // The SMS opt-in and the separate marketing permission are their own choices (TSK-0029); unchecked by default.
    smsOptIn: false,
    marketingOptIn: false,
  }
  if (optional(v.description)) body.description = v.description
  if (optional(v.otherServicesText)) body.otherServicesText = v.otherServicesText
  if (meta.startedAt !== undefined) body.startedAt = meta.startedAt
  if (meta.website) body.website = meta.website
  return body
}

export type Problem = { field: string; code: string }

type AjvIssue = { instancePath: string; keyword: string; params: Record<string, unknown> }

let compiled: ReturnType<Ajv['compile']> | undefined
function schemaCheck(body: unknown): Problem[] {
  compiled ??= new Ajv({ allErrors: true, strict: false }).compile(REQUEST_FORM_SCHEMA)
  if (compiled(body)) return []
  return ((compiled.errors ?? []) as AjvIssue[]).map((e) => {
    const path = e.instancePath.replace(/^\//, '').replace(/\//g, '.')
    const extra =
      e.keyword === 'required'
        ? String(e.params['missingProperty'] ?? '')
        : e.keyword === 'additionalProperties'
          ? String(e.params['additionalProperty'] ?? '')
          : ''
    return { field: [path, extra].filter(Boolean).join('.'), code: e.keyword }
  })
}

/** Every problem with the values, schema first, then the semantic checks; one problem per field. */
export function validate(
  v: FormValues,
  meta: FormMeta,
  opts: { now: Date; zone: string; services: readonly FormService[] },
): Problem[] {
  const body = toBody(v, meta, opts.services)
  const problems = schemaCheck(body)
  // An empty value is "required", not "too short", "wrong format" or "choose one of the options".
  for (const p of problems)
    if (['enum', 'minLength', 'pattern'].includes(p.code) && valueAt(body, p.field) === '') p.code = 'required'
  if (problems.length === 0) {
    const today = localDate(opts.now, opts.zone)
    const knownServices = new Set(opts.services.map((x) => x.id))
    const questions = new Map(opts.services.map((x) => [x.id, x.questions.map((q) => q.key)]))
    for (const p of semanticProblems(body, { today, knownServices, questions }))
      problems.push({ field: p.field.replace(/^body\./, ''), code: p.code })
  }
  const seen = new Set<string>()
  return problems.filter((p) => (seen.has(p.field) ? false : (seen.add(p.field), true)))
}

function valueAt(body: unknown, field: string): unknown {
  let at: unknown = body
  for (const part of field.split('.'))
    at = at && typeof at === 'object' ? (at as Record<string, unknown>)[part] : undefined
  return at
}

/** A server field error (`body.contact.phone`) as a wizard problem. */
export function fromServer(fieldErrors: readonly { field: string; code: string }[]): Problem[] {
  return fieldErrors.map((f) => ({ field: f.field.replace(/^body\./, ''), code: f.code }))
}

/** The customer catalog key of a problem's message (same kinds as the server's field messages). */
export function problemKey(code: string): CustomerKey {
  switch (code) {
    case 'required':
      return 'error.field.required'
    case 'type':
      return 'error.field.type'
    case 'format':
    case 'pattern':
      return 'error.field.format'
    case 'maxLength':
    case 'maxItems':
    case 'maximum':
      return 'error.field.tooLong'
    case 'minLength':
    case 'minItems':
    case 'minimum':
      return 'error.field.tooShort'
    case 'enum':
    case 'const':
      return 'error.field.choice'
    case 'additionalProperties':
      return 'error.field.unknown'
    default:
      return 'error.field.invalid'
  }
}
