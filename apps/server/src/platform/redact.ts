// Schema-based redaction of secret fields (TSK-0011; RULE-SERVER-AUTHZ, HH-SEC-06, HH-SEC-04, OWN-DEC-123).
// One schema of secret field names serves the audit writer and the logger: passwords, tokens, one-time and access
// codes, access instructions, raw secrets, credentials in headers and sensitive message contents. Keys match after
// normalisation (case, '_' and '-' ignored), so `accessCode`, `access_code` and `Access-Code` are the same field.
// A change entry such as { field: 'password', from, to } has its values redacted too.

export const REDACTED = '[REDACTED]'

/** Normalised field names that are always secret. */
export const SECRET_FIELDS: readonly string[] = [
  'password',
  'passwordhash',
  'passcode',
  'pin',
  'token',
  'secret',
  'apikey',
  'authorization',
  'cookie',
  'setcookie',
  'otp',
  'code',
  'onetimecode',
  'verificationcode',
  'signincode',
  'resetcode',
  'accesscode',
  'accessinstructions',
  'gatecode',
  'lockboxcode',
  'alarmcode',
  'cardnumber',
  'cvv',
  'cvc',
  'messagebody',
  'messagecontent',
  'messagetext',
]

/** Normalised suffixes that make a field secret, for example `sessionToken`, `clientSecret`, `newPassword`. */
export const SECRET_SUFFIXES: readonly string[] = [
  'password',
  'passwordhash',
  'token',
  'secret',
  'apikey',
  'accesscode',
  'onetimecode',
  'verificationcode',
  'accessinstructions',
]

const CHANGE_VALUE_KEYS = new Set(['from', 'to', 'old', 'new', 'value', 'before', 'after'])
const MAX_DEPTH = 20

export function normaliseKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function isSecretField(key: string): boolean {
  const k = normaliseKey(key)
  return SECRET_FIELDS.includes(k) || SECRET_SUFFIXES.some((s) => k.endsWith(s))
}

/** A deep copy of plain data with every secret field's value replaced by '[REDACTED]'. Input is never mutated. */
export function redact<T>(value: T): T {
  return walk(value, 0, new WeakSet()) as T
}

function walk(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value === null || typeof value !== 'object') return value
  if (depth > MAX_DEPTH || seen.has(value)) return REDACTED
  seen.add(value)
  try {
    if (Array.isArray(value)) return value.map((v) => walk(v, depth + 1, seen))
    // Only plain data is walked; other class instances (Date, Buffer, Error, a request object) pass through unchanged,
    // and the logger's serializers turn requests, replies and errors into plain objects that are redacted in turn.
    const proto: unknown = Object.getPrototypeOf(value)
    if (proto !== Object.prototype && proto !== null) return value
    const obj = value as Record<string, unknown>
    const namedField = typeof obj['field'] === 'string' && isSecretField(obj['field'])
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) {
      if (isSecretField(k) || (namedField && CHANGE_VALUE_KEYS.has(normaliseKey(k)))) out[k] = REDACTED
      else out[k] = walk(v, depth + 1, seen)
    }
    return out
  } finally {
    seen.delete(value)
  }
}
