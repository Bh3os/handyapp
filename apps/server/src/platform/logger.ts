// Structured logger (TSK-0011; RULE-SERVER-AUTHZ, HH-SEC-04, HH-SEC-06). pino, JSON lines, with:
// - fixed redaction paths for credentials in request and response headers;
// - deep, key-based redaction of every logged object through the shared secret-field schema (./redact.ts), so
//   passwords, tokens, codes and access instructions never reach a log line at any depth;
// - the current request ID on every line (./request-context.ts);
// - request lines that carry the path only: query strings can hold sign-in and access codes.
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

type RequestLike = { method?: string; url?: string; host?: string; ip?: string; socket?: { remotePort?: number } }
type ReplyLike = { statusCode?: number }

/** Request, reply and error serializers; pino runs them after formatters.log, so their output is redacted here. */
export const LOG_SERIALIZERS = {
  req: (req: RequestLike) =>
    redact({
      method: req.method,
      path: (req.url ?? '').split('?')[0],
      host: req.host,
      remoteAddress: req.ip,
      remotePort: req.socket?.remotePort,
    }),
  res: (res: ReplyLike) => ({ statusCode: res.statusCode }),
  err: (err: Error) => redact({ ...stdSerializers.err(err) }),
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
