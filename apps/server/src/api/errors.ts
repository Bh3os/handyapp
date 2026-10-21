// The stable, safe error envelope (TSK-0010; HH-API-03). Every API error is
//   { "error": { "code", "message", "fieldErrors", "requestId", "retryable" } }
// with a status code fixed per code. Messages are plain and in the audience's language (messages.ts). Errors never
// carry stack traces, queries, secrets or any sign that a record the caller may not see exists.

export const ERROR_CODES = {
  VALIDATION_FAILED: { status: 400, retryable: false },
  IDEMPOTENCY_KEY_REQUIRED: { status: 400, retryable: false },
  UNAUTHENTICATED: { status: 401, retryable: false },
  INVALID_CREDENTIALS: { status: 401, retryable: false },
  FORBIDDEN: { status: 403, retryable: false },
  FRESH_AUTH_REQUIRED: { status: 403, retryable: false },
  CSRF_TOKEN_INVALID: { status: 403, retryable: false },
  LINK_INVALID: { status: 410, retryable: false },
  NOT_FOUND: { status: 404, retryable: false },
  METHOD_NOT_ALLOWED: { status: 405, retryable: false },
  STALE_VERSION: { status: 409, retryable: false },
  IDEMPOTENCY_CONFLICT: { status: 409, retryable: false },
  CONFLICT: { status: 409, retryable: false },
  PAYLOAD_TOO_LARGE: { status: 413, retryable: false },
  UNSUPPORTED_MEDIA_TYPE: { status: 415, retryable: false },
  PRECONDITION_REQUIRED: { status: 428, retryable: false },
  RATE_LIMITED: { status: 429, retryable: true },
  INTERNAL: { status: 500, retryable: true },
  NOT_CONFIGURED: { status: 503, retryable: false },
  UNAVAILABLE: { status: 503, retryable: true },
} as const satisfies Record<string, { status: number; retryable: boolean }>

export type ErrorCode = keyof typeof ERROR_CODES

export type FieldError = { field: string; code: string; message: string }

export type ErrorEnvelope = {
  error: {
    code: ErrorCode
    message: string
    fieldErrors: FieldError[]
    requestId: string
    retryable: boolean
    /** STALE_VERSION only: the current version and values, so the client can show them (HH-API-04). */
    current?: { version: number; values?: Record<string, unknown> }
    /**
     * IDEMPOTENCY_CONFLICT on a route that declares it (the public request submission, HH-INT-10): the public
     * reference of what the key already created, so a browser whose earlier answer was lost gets it back.
     */
    existing?: ExistingResult
  }
}

/** What an idempotency key already created, as a conflict may name it: a public reference that grants nothing. */
export type ExistingResult = { reference: string }

/** An expected failure a handler or the framework raises; anything else becomes INTERNAL. */
export class ApiError extends Error {
  override name = 'ApiError'
  readonly status: number
  readonly retryable: boolean
  constructor(
    readonly code: ErrorCode,
    readonly options: {
      fieldErrors?: FieldError[]
      current?: { version: number; values?: Record<string, unknown> }
      existing?: ExistingResult
      headers?: Record<string, string>
    } = {},
  ) {
    super(code)
    this.status = ERROR_CODES[code].status
    this.retryable = ERROR_CODES[code].retryable
  }
}

/** JSON schema of the envelope, used as the response schema of every error status in the contract. */
export const ERROR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      additionalProperties: false,
      required: ['code', 'message', 'fieldErrors', 'requestId', 'retryable'],
      properties: {
        code: { type: 'string', enum: Object.keys(ERROR_CODES) },
        message: { type: 'string' },
        fieldErrors: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['field', 'code', 'message'],
            properties: { field: { type: 'string' }, code: { type: 'string' }, message: { type: 'string' } },
          },
        },
        requestId: { type: 'string' },
        retryable: { type: 'boolean' },
        current: {
          type: 'object',
          additionalProperties: false,
          required: ['version'],
          properties: { version: { type: 'integer' }, values: { type: 'object', additionalProperties: true } },
        },
        existing: {
          type: 'object',
          additionalProperties: false,
          required: ['reference'],
          properties: { reference: { type: 'string' } },
        },
      },
    },
  },
} as const
