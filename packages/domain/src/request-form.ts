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
export function semanticProblems(body: SubmitBody, opts: { today: string; knownServices: ReadonlySet<string> }) {
  const p: FormFieldError[] = []
  const ids = body.services.map((s) => s.serviceId)
  if (new Set(ids).size !== ids.length) p.push(field('services', 'uniqueItems'))
  if (ids.length > MAX_SERVICES) p.push(field('services', 'maxItems'))
  body.services.forEach((s, i) => {
    if (!opts.knownServices.has(s.serviceId)) p.push(field(`services.${i}.serviceId`, 'enum'))
  })
  if (!body.notSure && ids.length === 0) p.push(field('services', 'required'))
  if ((body.notSure || ids.length === 0) && !body.description?.trim()) p.push(field('description', 'required'))
  const seen = new Set<string>()
  ;(body.answers ?? []).forEach((a, i) => {
    const at = `answers.${i}`
    if (a.serviceId !== undefined && !ids.includes(a.serviceId)) p.push(field(`${at}.serviceId`, 'enum'))
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
