// Error messages in the audience's language (TSK-0010; HH-API-03, RULE-LANGUAGES). Customers and guests get the
// English customer catalog; staff get their staff locale. The keys are listed literally so the catalog checker sees
// them as used.
import { customerTranslator, staffTranslator, type CustomerKey, type StaffKey, type StaffLocale } from '@handyhub/i18n'
import type { ErrorCode } from './errors.js'

const ERROR_KEYS: Record<ErrorCode, CustomerKey & StaffKey> = {
  VALIDATION_FAILED: 'error.VALIDATION_FAILED',
  IDEMPOTENCY_KEY_REQUIRED: 'error.IDEMPOTENCY_KEY_REQUIRED',
  UNAUTHENTICATED: 'error.UNAUTHENTICATED',
  INVALID_CREDENTIALS: 'error.INVALID_CREDENTIALS',
  FORBIDDEN: 'error.FORBIDDEN',
  FRESH_AUTH_REQUIRED: 'error.FRESH_AUTH_REQUIRED',
  CSRF_TOKEN_INVALID: 'error.CSRF_TOKEN_INVALID',
  LINK_INVALID: 'error.LINK_INVALID',
  NOT_FOUND: 'error.NOT_FOUND',
  METHOD_NOT_ALLOWED: 'error.METHOD_NOT_ALLOWED',
  STALE_VERSION: 'error.STALE_VERSION',
  IDEMPOTENCY_CONFLICT: 'error.IDEMPOTENCY_CONFLICT',
  CONFLICT: 'error.CONFLICT',
  PAYLOAD_TOO_LARGE: 'error.PAYLOAD_TOO_LARGE',
  UNSUPPORTED_MEDIA_TYPE: 'error.UNSUPPORTED_MEDIA_TYPE',
  PRECONDITION_REQUIRED: 'error.PRECONDITION_REQUIRED',
  RATE_LIMITED: 'error.RATE_LIMITED',
  INTERNAL: 'error.INTERNAL',
  NOT_CONFIGURED: 'error.NOT_CONFIGURED',
  UNAVAILABLE: 'error.UNAVAILABLE',
}

/** Field-error kinds, from the JSON-schema keyword that failed. */
const FIELD_KEYS = {
  required: 'error.field.required',
  type: 'error.field.type',
  format: 'error.field.format',
  tooLong: 'error.field.tooLong',
  tooShort: 'error.field.tooShort',
  choice: 'error.field.choice',
  unknown: 'error.field.unknown',
  passwordCommon: 'error.field.passwordCommon',
  invalid: 'error.field.invalid',
} as const satisfies Record<string, CustomerKey & StaffKey>
export type FieldErrorKind = keyof typeof FIELD_KEYS

export type Audience = { kind: 'customer' } | { kind: 'staff'; locale: StaffLocale }

function translate(audience: Audience, key: CustomerKey & StaffKey): string {
  return audience.kind === 'staff' ? staffTranslator(audience.locale).t(key) : customerTranslator().t(key)
}

export function errorMessage(audience: Audience, code: ErrorCode): string {
  return translate(audience, ERROR_KEYS[code])
}

export function fieldMessage(audience: Audience, kind: FieldErrorKind): string {
  return translate(audience, FIELD_KEYS[kind])
}

/** Maps a JSON-schema keyword to the field-error kind. */
export function fieldKind(keyword: string): FieldErrorKind {
  switch (keyword) {
    case 'required':
      return 'required'
    case 'type':
      return 'type'
    case 'format':
    case 'pattern':
      return 'format'
    case 'maxLength':
    case 'maxItems':
    case 'maximum':
    case 'maxProperties':
      return 'tooLong'
    case 'minLength':
    case 'minItems':
    case 'minimum':
      return 'tooShort'
    case 'enum':
    case 'const':
      return 'choice'
    case 'additionalProperties':
      return 'unknown'
    case 'passwordCommon':
      return 'passwordCommon'
    default:
      return 'invalid'
  }
}
