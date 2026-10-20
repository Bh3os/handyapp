// Request correlation (TSK-0011; HH-SEC-06). Every request runs inside a context holding its request ID, so log lines
// and audit events written while handling it carry the same ID without passing it through every call.
// Background work (jobs, outbox dispatch) runs its own context with its own correlation ID.
import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'

export type RequestContext = { requestId: string }

const storage = new AsyncLocalStorage<RequestContext>()

/** The current request or job context, if any. */
export function currentContext(): RequestContext | undefined {
  return storage.getStore()
}

export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn)
}

const INCOMING_ID = /^[A-Za-z0-9._-]{8,64}$/

/** An incoming X-Request-ID is kept when it is well formed; otherwise a new UUID is used. */
export function requestIdFrom(header: string | string[] | undefined): string {
  return typeof header === 'string' && INCOMING_ID.test(header) ? header : randomUUID()
}

/** Runs each request's lifecycle inside its context and echoes the ID in the X-Request-ID response header. */
export function registerRequestContext(app: FastifyInstance): void {
  app.addHook('onRequest', (req, reply, done) => {
    void reply.header('x-request-id', req.id)
    storage.run({ requestId: req.id }, done)
  })
}
