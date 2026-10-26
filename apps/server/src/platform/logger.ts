// Structured logger (TSK-0011; RULE-SERVER-AUTHZ, HH-SEC-04, HH-SEC-06). pino, JSON lines, with:
// - fixed redaction paths for credentials in request and response headers;
// - deep, key-based redaction of every logged object through the shared secret-field schema (./redact.ts), so
//   passwords, tokens, codes and access instructions never reach a log line at any depth;
// - the current request ID on every line (./request-context.ts);
// - request lines that carry the path only: query strings can hold sign-in and access codes, and the single-use token
//   of a staff invite or reset link (`/invite/<token>`, `/reset/<token>`, also below /staff) is masked in the path;
// - errors without the driver's free-text fields: a PostgreSQL error's `detail`, `where`, `hint` or query parameters
//   quote the values a statement held, for example `Key (email)=(...) already exists` (TSK-0109, docs/security/
//   review-2026.md LINK-1, LOG-2).
import pino, { type DestinationStream, type Logger, type LoggerOptions, stdSerializers } from 'pino'
import { redact, REDACTED } from './redact.js'
import { currentContext } from './request-context.js'

export type { Logger } from 'pino'

export const LOG_REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
]

/** A staff invite or reset link's token in a path: the path keeps its shape, the token never reaches a log line. */
const LINK_TOKEN_PATH = /\/(invite|reset)\/[^/?#]+/g

/** The path of `url` as it may be logged: no query string, and no link token. */
export function loggablePath(url: string | undefined): string {
  const [path = ''] = (url ?? '').split('?')
  return path.replace(LINK_TOKEN_PATH, `/$1/${REDACTED}`)
}

/** Error fields of the PostgreSQL driver that quote statement values; the SQLSTATE `code`, `constraint` stay. */
const DRIVER_TEXT_FIELDS = ['detail', 'where', 'hint', 'internalQuery', 'query', 'parameters'] as const

function serializeError(err: Error): Record<string, unknown> {
  const kept = Object.entries(stdSerializers.err(err)).filter(
    ([field]) => !(DRIVER_TEXT_FIELDS as readonly string[]).includes(field),
  )
  return redact(Object.fromEntries(kept))
}

type RequestLike = { method?: string; url?: string; host?: string; ip?: string; socket?: { remotePort?: number } }
type ReplyLike = { statusCode?: number }

/** Request, reply and error serializers; pino runs them after formatters.log, so their output is redacted here. */
export const LOG_SERIALIZERS = {
  req: (req: RequestLike) =>
    redact({
      method: req.method,
      path: loggablePath(req.url),
      host: req.host,
      remoteAddress: req.ip,
      remotePort: req.socket?.remotePort,
    }),
  res: (res: ReplyLike) => ({ statusCode: res.statusCode }),
  err: serializeError,
}

export type LoggerConfig = { level?: LoggerOptions['level']; name?: string }

export function loggerOptions(config: LoggerConfig = {}): LoggerOptions {
  return {
    level: config.level ?? 'info',
    ...(config.name ? { name: config.name } : {}),
    redact: { paths: LOG_REDACT_PATHS, censor: REDACTED },
    serializers: LOG_SERIALIZERS,
    formatters: { log: (object) => redact(object) },
    mixin: () => {
      const ctx = currentContext()
      return ctx ? { requestId: ctx.requestId } : {}
    },
  }
}

export function createLogger(config: LoggerConfig = {}, destination?: DestinationStream): Logger {
  return destination ? pino(loggerOptions(config), destination) : pino(loggerOptions(config))
}
