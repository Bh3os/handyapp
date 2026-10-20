// The request form contract (TSK-0025, TSK-0026; C02, HH-INT-09, OWN-DEC-90..93, OWN-DEC-56, OWN-DEC-61, OWN-DEC-139).
// One definition for both sides: the server validates submissions with this JSON schema and these checks, and the
// request wizard validates the same way before sending, so the two never disagree (manipulated data is still
// rejected by the server). Codes, never labels: the wizard shows the English wording from the i18n catalog.

export const PROPERTY_TYPES = ['house', 'apartment_condo', 'townhouse', 'rental_short_term'] as const
export const TIME_WINDOWS = ['mornings', 'afternoons', 'evenings', 'weekends', 'any_time'] as const
export const ESTIMATE_PREFERENCES = ['online', 'site_visit', 'let_handyhub_decide'] as const
export const CONTACT_CHANNELS = ['email', 'call', 'text'] as const
/** At most 5 distinct services per request (OWN-DEC-90); more are described in free text. */
export const MAX_SERVICES = 5

const text = (max: number, min = 1) => ({ type: 'string', minLength: min, maxLength: max }) as const

export const REQUEST_FORM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'formVersion',
    'privacyNoticeVersion',
    'services',
    'notSure',
    'property',
    'timing',
    'estimatePreference',
    'contact',
    'smsOptIn',
    'marketingOptIn',
  ],
  properties: {
    formVersion: { type: 'string', pattern: '^[A-Za-z0-9._-]{1,40}$' },
    privacyNoticeVersion: { type: 'string', pattern: '^[A-Za-z0-9._-]{1,40}$' },
    services: {
      type: 'array',
      maxItems: MAX_SERVICES,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['serviceId'],
        properties: { serviceId: { type: 'string', pattern: '^SVC-[A-Z]{2}-[0-9]{2}$' }, notes: text(2000) },
      },
    },
    notSure: { type: 'boolean' },
    otherServicesText: text(2000),
    description: text(5000),
    answers: {
      type: 'array',
      maxItems: 100,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['question', 'kind'],
        properties: {
          serviceId: { type: 'string', pattern: '^SVC-[A-Z]{2}-[0-9]{2}$' },
          question: { type: 'string', pattern: '^[a-z][a-z0-9_]{0,63}$' },
          kind: { type: 'string', enum: ['number', 'text', 'unknown'] },
          number: { type: 'number', minimum: 0, maximum: 1_000_000 },
          text: text(2000),
          unit: { type: 'string', pattern: '^[a-z][a-z0-9_]{0,23}$' },
          approximate: { type: 'boolean' },
        },
      },
    },
    property: {
      type: 'object',
      additionalProperties: false,
      required: ['street', 'city', 'state', 'zip', 'propertyType'],
      properties: {
        street: text(200),
        unit: text(50),
        city: text(100),
        state: { type: 'string', pattern: '^[A-Za-z]{2}$' },
        zip: { type: 'string', pattern: '^[0-9]{5}(-[0-9]{4})?$' },
        propertyType: { type: 'string', enum: PROPERTY_TYPES },
      },
    },
    timing: {
      type: 'object',
      additionalProperties: false,
      required: ['flexible', 'needHelpToday', 'windows'],
      properties: {
        preferredDate: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' },
        flexible: { type: 'boolean' },
        needHelpToday: { type: 'boolean' },
        windows: { type: 'array', maxItems: 5, uniqueItems: true, items: { type: 'string', enum: TIME_WINDOWS } },
      },
    },
    estimatePreference: { type: 'string', enum: ESTIMATE_PREFERENCES },
    contact: {
      type: 'object',
      additionalProperties: false,
      required: ['fullName', 'email', 'phone', 'preferredChannel'],
      properties: {
        fullName: text(200),
        email: { type: 'string', minLength: 3, maxLength: 254, pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$' },
        phone: { type: 'string', minLength: 7, maxLength: 30, pattern: '^[0-9 ()+.-]+$' },
        preferredChannel: { type: 'string', enum: CONTACT_CHANNELS },
      },
    },
    smsOptIn: { type: 'boolean' },
    marketingOptIn: { type: 'boolean' },
    // Quiet spam controls (HH-INT-11): a field people never see, and when the form was opened (ms since epoch).
    website: { type: 'string', maxLength: 500 },
    startedAt: { type: 'integer', minimum: 0 },
    // The photo upload capability of the draft (TSK-0031): the server binds that draft's photos to the new request.
    // A secret: never stored with the original submission.
    photoDraft: { type: 'string', pattern: '^[A-Za-z0-9_-]{43}$' },
  },
} as const

export const REQUEST_RECEIPT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'reference', 'submittedAt'],
  properties: {
    status: { type: 'string', enum: ['received'] },
    reference: { type: 'string' },
    submittedAt: { type: 'string', format: 'date-time' },
    // The draft's photos as bound to the request (TSK-0031, HH-INT-07): received, still processing, and failed.
    photos: {
      type: 'object',
      additionalProperties: false,
      required: ['received', 'processing', 'failed'],
      properties: {
        received: { type: 'integer' },
        processing: { type: 'integer' },
        failed: { type: 'integer' },
      },
    },
  },
} as const

export type Answer = {
  serviceId?: string
  question: string
  kind: 'number' | 'text' | 'unknown'
  number?: number
  text?: string
  unit?: string
  approximate?: boolean
}

export type SubmitBody = {
  formVersion: string
  privacyNoticeVersion: string
  services: { serviceId: string; notes?: string }[]
  notSure: boolean
  otherServicesText?: string
  description?: string
  answers?: Answer[]
  property: {
    street: string
    unit?: string
    city: string
    state: string
    zip: string
    propertyType: (typeof PROPERTY_TYPES)[number]
  }
  timing: {
    preferredDate?: string
    flexible: boolean
    needHelpToday: boolean
    windows: (typeof TIME_WINDOWS)[number][]
  }
  estimatePreference: (typeof ESTIMATE_PREFERENCES)[number]
  contact: { fullName: string; email: string; phone: string; preferredChannel: (typeof CONTACT_CHANNELS)[number] }
  smsOptIn: boolean
  marketingOptIn: boolean
  website?: string
  startedAt?: number
  photoDraft?: string
}

/** A field problem: `field` is the body path (`body.contact.phone`), `code` the JSON-schema keyword. */
export type FormFieldError = { field: string; code: string; message: string }

/** A US number as E.164, or null. */
export function normalizeUsPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10 && /^[2-9]/.test(digits)) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1') && /^[2-9]/.test(digits.slice(1))) return `+${digits}`
  return null
}

/** Today's date (YYYY-MM-DD) in a time zone. */
export function localDate(now: Date, zone: string): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  )
  return `${p['year']}-${p['month']}-${p['day']}`
}

const field = (name: string, code: string): FormFieldError => ({ field: `body.${name}`, code, message: '' })

/** The checks JSON schema cannot express; every problem is reported at once, next to its field (HH-INT-09). */
/**
 * A service-specific question (TSK-0027; HH-SVC-03). The wording is the service's own intake input from the registry
 * (guide 6.2, the SVC-* nodes), shown verbatim; nothing is added to it. Answers are the customer's own words, or
 * "I don't know", stored as unknown. No question asks for a number: the nodes give no units, so measured answers stay
 * free text until the owner approves question schemas with units (PROPOSED).
 */
export type ServiceQuestion = { key: string; label: string }

/** Intake inputs that are staff review items or rules, never questions for the customer (HH-SVC-03, HI-05). */
const STAFF_ONLY = /\breview\b|coordination|capability|credentials/i

export function questionKey(label: string): string {
  const k = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64)
  return /^[a-z]/.test(k) ? k : `q_${k}`.slice(0, 64)
}

/** The questions of one service, from its registry intake inputs, in their order, without duplicates. */
export function serviceQuestions(intake: { guideInputs: readonly string[] }): ServiceQuestion[] {
  const out: ServiceQuestion[] = []
  for (const raw of intake.guideInputs) {
    const label = raw.trim()
    if (!label || STAFF_ONLY.test(label)) continue
    const key = questionKey(label)
    if (!out.some((q) => q.key === key)) out.push({ key, label })
  }
  return out
}

/**
 * Which questions to ask for the selected services: a question several of them share is asked once (answered
 * without a service ID); the rest are grouped by service.
 */
export function questionPlan(selected: readonly { id: string; questions: readonly ServiceQuestion[] }[]): {
  shared: ServiceQuestion[]
  perService: { serviceId: string; questions: ServiceQuestion[] }[]
} {
  const count = new Map<string, number>()
  for (const s of selected) for (const q of s.questions) count.set(q.key, (count.get(q.key) ?? 0) + 1)
  const shared: ServiceQuestion[] = []
  for (const s of selected)
    for (const q of s.questions) if ((count.get(q.key) ?? 0) > 1 && !shared.some((x) => x.key === q.key)) shared.push(q)
  return {
    shared,
    perService: selected.map((s) => ({
      serviceId: s.id,
      questions: s.questions.filter((q) => (count.get(q.key) ?? 0) === 1),
    })),
  }
}

export function semanticProblems(
  body: SubmitBody,
  opts: {
    today: string
    knownServices: ReadonlySet<string>
    /** Question keys per service (from the registry); when given, every answer must be one of the plan's questions. */
    questions?: ReadonlyMap<string, readonly string[]>
  },
) {
  const p: FormFieldError[] = []
  const ids = body.services.map((s) => s.serviceId)
  if (new Set(ids).size !== ids.length) p.push(field('services', 'uniqueItems'))
  if (ids.length > MAX_SERVICES) p.push(field('services', 'maxItems'))
  body.services.forEach((s, i) => {
    if (!opts.knownServices.has(s.serviceId)) p.push(field(`services.${i}.serviceId`, 'enum'))
  })
  if (!body.notSure && ids.length === 0) p.push(field('services', 'required'))
  // One required project description (HH-SVC-03).
  if (!body.description?.trim()) p.push(field('description', 'required'))
  const plan = opts.questions
    ? questionPlan(
        ids.map((id) => ({ id, questions: (opts.questions?.get(id) ?? []).map((key) => ({ key, label: key })) })),
      )
    : undefined
  const seen = new Set<string>()
  ;(body.answers ?? []).forEach((a, i) => {
    const at = `answers.${i}`
    if (a.serviceId !== undefined && !ids.includes(a.serviceId)) p.push(field(`${at}.serviceId`, 'enum'))
    else if (plan) {
      const allowed =
        a.serviceId === undefined
          ? plan.shared.map((q) => q.key)
          : (plan.perService.find((x) => x.serviceId === a.serviceId)?.questions ?? []).map((q) => q.key)
      if (!allowed.includes(a.question)) p.push(field(`${at}.question`, 'enum'))
      // No question has a unit yet, so no answer is a number (unknown stays unknown, never zero).
      if (a.kind === 'number') p.push(field(`${at}.kind`, 'enum'))
    }
    const key = `${a.serviceId ?? ''}/${a.question}`
    if (seen.has(key)) p.push(field(`${at}.question`, 'uniqueItems'))
    seen.add(key)
    if ((a.kind === 'number') !== (a.number !== undefined))
      p.push(field(`${at}.number`, a.kind === 'number' ? 'required' : 'invalid'))
    if ((a.kind === 'text') !== (a.text !== undefined))
      p.push(field(`${at}.text`, a.kind === 'text' ? 'required' : 'invalid'))
    if (a.kind !== 'number' && (a.unit !== undefined || a.approximate !== undefined))
      p.push(field(`${at}.unit`, 'invalid'))
  })
  const t = body.timing
  if (t.flexible === (t.preferredDate !== undefined))
    p.push(field('timing.preferredDate', t.flexible ? 'invalid' : 'required'))
  if (t.preferredDate !== undefined) {
    const valid = !Number.isNaN(Date.parse(`${t.preferredDate}T00:00:00Z`))
    // Tomorrow or later, in the property's local time (OWN-DEC-92).
    if (!valid || t.preferredDate <= opts.today) p.push(field('timing.preferredDate', 'minimum'))
  }
  if (t.windows.includes('any_time') && t.windows.length > 1) p.push(field('timing.windows', 'invalid'))
  if (!normalizeUsPhone(body.contact.phone)) p.push(field('contact.phone', 'format'))
  return p
}
