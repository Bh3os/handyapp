// The configuration keys and the exact shape of each value (TSK-0007; ENT-PolicyVersion, RULE-DECIDED-VALUES-ACTIVE).
// This file holds no business value: the values are versioned rows in platform.policy_version, seeded by migration
// 0005 from the fact and decision nodes they cite. Every row read from the database is validated strictly against
// its key's shape; an unknown key, an unknown field or a wrong type fails closed. Money is integer cents.

export class ConfigShapeError extends Error {
  override name = 'ConfigShapeError'
}

type Parser<T> = (v: unknown, path: string) => T

const fail = (path: string, what: string): never => {
  throw new ConfigShapeError(`${path}: ${what}`)
}
const int =
  (min = 0, max = Number.MAX_SAFE_INTEGER): Parser<number> =>
  (v, p) =>
    typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max
      ? v
      : fail(p, `expected a whole number from ${min} to ${max}`)
const bool: Parser<boolean> = (v, p) => (typeof v === 'boolean' ? v : fail(p, 'expected true or false'))
const exactly =
  <const T extends string | number | boolean>(value: T): Parser<T> =>
  (v, p) =>
    v === value ? value : fail(p, `expected ${JSON.stringify(value)}`)
const oneOf =
  <const T extends string>(values: readonly T[]): Parser<T> =>
  (v, p) =>
    typeof v === 'string' && (values as readonly string[]).includes(v)
      ? (v as T)
      : fail(p, `expected ${values.join(' | ')}`)
const text: Parser<string> = (v, p) => (typeof v === 'string' && v.trim() !== '' ? v : fail(p, 'expected text'))
const clock: Parser<string> = (v, p) =>
  typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : fail(p, 'expected HH:MM')
const listOf =
  <T>(item: Parser<T>): Parser<T[]> =>
  (v, p) => {
    if (!Array.isArray(v) || v.length === 0) return fail(p, 'expected a non-empty list')
    const out = v.map((x, i) => item(x, `${p}[${i}]`))
    if (new Set(out.map((x) => JSON.stringify(x))).size !== out.length) fail(p, 'duplicate entries')
    return out
  }
const shape =
  <S extends Record<string, Parser<unknown>>>(fields: S): Parser<{ readonly [K in keyof S]: ReturnType<S[K]> }> =>
  (v, p) => {
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return fail(p, 'expected an object')
    const o = v as Record<string, unknown>
    for (const k of Object.keys(o)) if (!(k in fields)) fail(`${p}.${k}`, 'unknown field')
    const out: Record<string, unknown> = {}
    for (const [k, parse] of Object.entries(fields)) {
      if (!Object.hasOwn(o, k)) fail(`${p}.${k}`, 'missing')
      out[k] = parse(o[k], `${p}.${k}`)
    }
    return out as { readonly [K in keyof S]: ReturnType<S[K]> }
  }
const hours = int(0, 24 * 366)
const messageCode: Parser<string> = (v, p) =>
  typeof v === 'string' && /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(v) ? v : fail(p, 'expected a message type code')
const contactHoursOnly = { contactHoursOnly: bool }

/** Every configuration key with the parser of its value. Adding a key needs a migration that seeds it. */
export const CONFIG_KEYS = {
  'deposit.rule': shape({
    comparison: exactly('greater_than'),
    thresholdCents: int(),
    percentBps: int(1, 10_000),
    base: exactly('final_total_after_discount'),
    rounding: exactly('half_up'),
  }),
  'discount.rule': shape({
    percentBps: int(1, 10_000),
    categories: listOf(oneOf(['military', 'senior', 'returning_customer'])),
    perJob: exactly('one_largest'),
    appliedTo: exactly('subtotal'),
  }),
  'discount.eligibility_verification': shape({ method: text }),
  'tax.mode': shape({ mode: oneOf(['no_tax_line']) }),
  'estimate.validity': shape({ days: int(1, 365), from: exactly('published') }),
  'estimate.publishing_roles': shape({ roles: listOf(oneOf(['owner', 'office', 'estimator', 'worker'])) }),
  'payment.term_default': shape({ term: oneOf(['due_on_receipt']) }),
  'payment.methods': shape({
    methods: listOf(oneOf(['square_payment_link', 'square_tap_to_pay', 'cash', 'check', 'zelle', 'cash_app', 'chime'])),
    surcharge: exactly(false),
  }),
  'payment.instructions': shape({ placeholder: bool, zelle: text, cashApp: text, chime: text, checkPayee: text }),
  'cancellation.rules': shape({ rescheduleFree: bool, noticeHours: hours, lateCancellationCents: int() }),
  'contact.hours': shape({ days: exactly('every_day'), open: clock, close: clock }),
  'business.timezone': shape({ zone: text }),
  'reminders.cadences': shape({
    unansweredEstimate: shape({ firstHours: hours, finalHours: hours, ...contactHoursOnly }),
    unansweredQuestion: shape({
      firstHours: hours,
      finalHours: hours,
      closeAfterFinalHours: hours,
      ...contactHoursOnly,
    }),
    appointment: shape({ hoursBefore: hours, ...contactHoursOnly }),
    satisfaction: shape({ daysAfterCompletion: int(0, 366), ...contactHoursOnly }),
    unpaidInvoice: shape({ firstHours: hours, finalHours: hours, ...contactHoursOnly }),
    repeatService: shape({ schedule: exactly('customer_agreed'), ...contactHoursOnly }),
  }),
  'request.reopen_period': shape({ days: int(0, 3660) }),
  'response.target': shape({ minutes: int(1, 24 * 60), countedWithin: exactly('contact_hours') }),
  'session.timings': shape({
    staffInviteLinkHours: hours,
    passwordResetLinkHours: hours,
    oneTimeCodeMinutes: int(1, 24 * 60),
    customerSessionIdleMinutes: int(1, 24 * 60),
    customerSessionMaxHours: hours,
    staffSessionIdleMinutes: int(1, 24 * 60),
    requestDraftDays: int(0, 366),
  }),
  'uploads.limits': shape({
    maxFileBytes: int(1),
    maxRequestPhotos: int(0, 100),
    requestPhotoTypes: listOf(oneOf(['image/jpeg', 'image/png', 'image/webp'])),
  }),
  'business.name': shape({ documentName: text, brand: text }),
  'business.mailing_address': shape({ lines: listOf(text) }),
  'business.public_contact': shape({ phone: text, email: text }),
  // TSK-0016: attempt, resend and per-client limits for one-time codes (PROPOSED values, HH-ID-06, HH-INT-11) and the
  // fresh-verification window (HH-ID-07). The code lifetime is session.timings.oneTimeCodeMinutes.
  'verification.limits': shape({
    codeDigits: int(6, 10),
    maxAttemptsPerCode: int(1, 20),
    resendCooldownSeconds: int(0, 3600),
    maxCodesPerDestinationPerHour: int(1, 100),
    maxCodesPerClientPerHour: int(1, 1000),
    maxFailedAttemptsPerClientPerHour: int(1, 10_000),
    freshVerificationMinutes: int(1, 24 * 60),
  }),
  // FACT-AUTOMATIC-MESSAGES (TSK-0047): the one list of messages that send without staff release. Codes are message
  // types of modules/notifications, which refuses an unknown code when it reads the list.
  'messages.automatic': shape({
    customer: listOf(messageCode),
    staffAccount: listOf(messageCode),
    staffNotifications: listOf(messageCode),
  }),
  // RULE-AI-WAVE2: only `false` is a valid value; the database refuses anything else as well.
  'ai.module': shape({ enabled: exactly(false) }),
} as const satisfies Record<string, Parser<unknown>>

export type ConfigKey = keyof typeof CONFIG_KEYS
export type ConfigValue<K extends ConfigKey> = ReturnType<(typeof CONFIG_KEYS)[K]>

export function isConfigKey(key: string): key is ConfigKey {
  return Object.hasOwn(CONFIG_KEYS, key)
}

/** Validates a stored value against its key's shape; throws ConfigShapeError naming the bad field. */
export function parseValue<K extends ConfigKey>(key: K, value: unknown): ConfigValue<K> {
  return CONFIG_KEYS[key](value, key) as ConfigValue<K>
}
