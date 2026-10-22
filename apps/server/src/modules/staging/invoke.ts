// In-process route calls for the fresh test data (TSK-0141; HH-OPS-05, RULE-SERVER-AUTHZ). The generator acts through
// the server's own routes, never through table writes of its own, so every record it creates passes the same
// business rules, guards, configuration checks and audit as one made in the apps:
// - the caller's kind must be one the route allows; the route's resource facts are read and the policy decides
//   (deny by default), with the same fresh-sign-in requirement the route declares;
// - the route's handler runs inside the given transaction, with the record scope of the caller, and its audit
//   events are written to the append-only audit log in that transaction;
// - a route refusal (ApiError) is returned to the generator as the refusal it is, never as a success.
// What the HTTP layer adds on top (schema validation, idempotency records, rate limits, CSRF) does not apply to a call
// that never leaves the process; the generator builds complete, valid bodies itself.
import { randomUUID } from 'node:crypto'
import type { Tx } from '@handyhub/db'
import { localDate } from '@handyhub/domain/request-form'
import { dataScope, decide, type Actor, type Allow } from '@handyhub/policy'
import type { FastifyRequest } from 'fastify'
import { ApiError } from '../../api/errors.js'
import { requireFreshAuth } from '../../api/fresh-auth.js'
import { AUTHENTICATION, type ApiContext, type ApiResult, type RouteDef } from '../../api/route.js'
import { audit, type AuditActor } from '../../platform/audit.js'
import { loadConfig } from '../../platform/config/index.js'

export type Caller = { actor: Actor; authenticatedAt?: Date; cookie?: string }

export type Call = {
  params?: Record<string, string>
  body?: unknown
  query?: Record<string, unknown>
  /** The If-Match version for routes that require one. */
  version?: number
  as: Caller
}

const QUIET_LOG = { info() {}, warn() {}, error() {}, debug() {}, trace() {}, fatal() {}, child: () => QUIET_LOG }

function auditActorOf(actor: Actor): AuditActor {
  switch (actor.kind) {
    case 'staff':
      return { kind: 'staff', id: actor.userId, roles: actor.roles }
    case 'customer':
      return { kind: 'customer', id: actor.contactId }
    case 'guest':
      return { kind: 'guest' }
    case 'ai':
      return { kind: 'system', process: 'ai-disabled' }
  }
}

export type Invoke = (tx: Tx, operationId: string, call: Call) => Promise<ApiResult>

/** A caller of the given routes, by operationId, inside a transaction; every call is correlated to requestId. */
export function routeInvoker(routes: readonly RouteDef[], requestId: string): Invoke {
  const byId = new Map(routes.map((r) => [r.operationId, r]))
  let seq = 0
  return async (tx, operationId, call) => {
    const route = byId.get(operationId)
    if (!route) throw new Error(`fresh test data: no route ${operationId}`)
    const { actor } = call.as
    if (actor.kind === 'ai' || !route.actors.includes(actor.kind)) throw new ApiError('FORBIDDEN')
    const n = ++seq
    const headers = {
      'idempotency-key': `staging-fresh-data-${randomUUID()}`,
      // Records that keep the client (an approval's security metadata) name this in-process generator, never a browser.
      'user-agent': 'HandyHub staging fresh-test-data generator',
      ...(call.version === undefined ? {} : { 'if-match': `"${call.version}"` }),
      ...(call.as.cookie ? { cookie: call.as.cookie } : {}),
    }
    const req = {
      id: `${requestId}:${n}`,
      method: route.method,
      url: route.path,
      params: call.params ?? {},
      query: call.query ?? {},
      body: call.body,
      headers,
      // The calls never leave the process: the client is the server itself.
      raw: { headers, socket: { remoteAddress: '127.0.0.1' } },
      ip: '127.0.0.1',
      log: QUIET_LOG,
    } as unknown as FastifyRequest
    const resource = route.resource ? await route.resource({ req, actor, db: tx }) : {}
    if (resource === null) throw new ApiError('NOT_FOUND')
    const now = new Date()
    let decision: Allow | null = null
    if (route.permission !== AUTHENTICATION) {
      const zone = route.businessDate ? (await loadConfig(tx)).get('business.timezone') : null
      const facts = route.decisionContext ? await route.decisionContext({ req, actor, db: tx }) : {}
      const d = decide(actor, route.permission, resource, {
        now,
        online: true,
        ...facts,
        ...(zone?.state === 'CONFIGURED' ? { today: localDate(now, zone.value.zone) } : {}),
      })
      if (d.effect === 'deny')
        throw new ApiError(d.reason === 'FRESH_AUTH_REQUIRED' ? 'FRESH_AUTH_REQUIRED' : 'FORBIDDEN', {
          fieldErrors: [{ field: 'policy', code: d.reason, message: '' }],
        })
      decision = d
    }
    if (route.freshAuthMinutes !== undefined) requireFreshAuth(call.as.authenticatedAt, route.freshAuthMinutes)
    const scope = dataScope(actor, route.permission === AUTHENTICATION ? null : route.permission, now)
    const record = (event: Parameters<ApiContext['audit']>[0]) =>
      audit.record(tx, {
        ...event,
        action: event.action ?? route.audit,
        actor: auditActorOf(actor),
        requestId: req.id,
      })
    const ctx: ApiContext = {
      req,
      actor,
      decision,
      scope,
      db: tx,
      tx: route.kind === 'write' ? tx : undefined,
      authenticatedAt: call.as.authenticatedAt,
      page: undefined,
      expectedVersion: () => {
        if (call.version === undefined) throw new ApiError('PRECONDITION_REQUIRED')
        return call.version
      },
      audit: async (event) => void (await record(event)),
      auditAlways: async (event) => void (await record(event)),
    }
    const result = await route.handler(ctx)
    if (result.refusal) throw result.refusal
    return result
  }
}
