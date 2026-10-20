// API registration (TSK-0010; HH-API-01, HH-API-03, HH-API-04, HH-API-05, HH-ARC-02, RULE-SERVER-AUTHZ). One
// encapsulated Fastify scope under /api/v1 holds every module's routes. For each request it:
// - validates params, query and body against the route's schemas (unknown fields are refused) and serializes the
//   response through the route's explicit response schema (undeclared fields are stripped);
// - resolves the caller, checks the route's actor kinds and asks the policy (deny by default); a customer or guest
//   outside their scope gets the same NOT_FOUND as a missing record (T19);
// - runs reads without a transaction and writes inside one, with the idempotency record and the audit events
//   committing together with the write;
// - answers every error in the one safe envelope, in the audience's language, and sets Cache-Control: private,
//   no-store unless a route says otherwise.
import { timingSafeEqual } from 'node:crypto'
import type { Db, Tx } from '@handyhub/db'
import { withTx } from '@handyhub/db'
import type { StaffLocale } from '@handyhub/i18n'
import { decide, type Actor, type Allow } from '@handyhub/policy'
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { audit, type AuditActor } from '../platform/audit.js'
import { currentContext } from '../platform/request-context.js'
import { ApiError, type ErrorEnvelope, type FieldError } from './errors.js'
import { requireFreshAuth } from './fresh-auth.js'
import { actorKey, claim, readIdempotencyKey, requestHash, store, type IdempotencyScope } from './idempotency.js'
import { errorMessage, fieldKind, fieldMessage, type Audience } from './messages.js'
import { PAGE_QUERY_PROPERTIES, pageRequest } from './pagination.js'
import {
  AUTHENTICATION,
  routeProblems,
  RouteContractError,
  type ActorKind,
  type ApiContext,
  type ApiModule,
  type ApiResult,
  type RequestActor,
  type ResolveActor,
  type RouteDef,
} from './route.js'
import { etag, parseIfMatch } from './version.js'

export const API_PREFIX = '/api/v1'
export const DEFAULT_CACHE_CONTROL = 'private, no-store'

export interface ApiOptions {
  /** The business database; without one every API route answers UNAVAILABLE. */
  db: Db | undefined
  modules: readonly ApiModule[]
  /** Resolves the caller; the session layer (TSK-0014) supplies it. Default: every caller is a guest. */
  resolveActor?: ResolveActor
}

const GUEST: RequestActor = { actor: { kind: 'guest' } }

declare module 'fastify' {
  interface FastifyRequest {
    /** Who will read an error answer: set once the caller is known (customer English by default). */
    apiAudience?: Audience
    /** The caller, resolved before validation so validation errors use the caller's language too. */
    apiActor?: RequestActor
  }
}

function audienceOf(actor: Actor, locale: StaffLocale | undefined): Audience {
  return actor.kind === 'staff' ? { kind: 'staff', locale: locale ?? 'en' } : { kind: 'customer' }
}

function auditActor(actor: Actor): AuditActor {
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

function actorKind(actor: Actor): ActorKind | 'ai' {
  return actor.kind
}

/** The envelope for an error; field errors get their message in the audience's language. */
export function envelope(error: ApiError, audience: Audience, requestId: string): ErrorEnvelope {
  return {
    error: {
      code: error.code,
      message: errorMessage(audience, error.code),
      fieldErrors: (error.options.fieldErrors ?? []).map((f) => ({
        ...f,
        message: fieldMessage(audience, fieldKind(f.code)),
      })),
      requestId,
      retryable: error.retryable,
      ...(error.options.current ? { current: error.options.current } : {}),
    },
  }
}

type AjvIssue = { instancePath?: string; keyword: string; params?: Record<string, unknown> }

/** Fastify's validation failure as field errors: `body.name`, `querystring.limit`, `params.id`. */
function validationFieldErrors(err: FastifyError): FieldError[] {
  const where = err.validationContext ?? 'body'
  return ((err.validation ?? []) as AjvIssue[]).map((v) => {
    const path = (v.instancePath ?? '').replace(/^\//, '').replace(/\//g, '.')
    const extra =
      v.keyword === 'required'
        ? String(v.params?.['missingProperty'] ?? '')
        : v.keyword === 'additionalProperties'
          ? String(v.params?.['additionalProperty'] ?? '')
          : ''
    const field = [where, path, extra].filter(Boolean).join('.')
    return { field, code: v.keyword, message: '' }
  })
}

/** Maps any thrown error to an ApiError; unexpected errors become INTERNAL and reveal nothing. */
function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err
  const e = err as FastifyError
  if (e?.validation) return new ApiError('VALIDATION_FAILED', { fieldErrors: validationFieldErrors(e) })
  switch (e?.code) {
    case 'FST_ERR_CTP_BODY_TOO_LARGE':
      return new ApiError('PAYLOAD_TOO_LARGE')
    case 'FST_ERR_CTP_INVALID_MEDIA_TYPE':
      return new ApiError('UNSUPPORTED_MEDIA_TYPE')
    case 'FST_ERR_CTP_EMPTY_JSON_BODY':
    case 'FST_ERR_CTP_INVALID_JSON_BODY':
      return new ApiError('VALIDATION_FAILED')
  }
  if (e instanceof SyntaxError || e?.statusCode === 400) return new ApiError('VALIDATION_FAILED')
  return new ApiError('INTERNAL')
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * CSRF protection for cookie sessions (HH-SEC-02), on top of SameSite=Strict cookies: a state-changing request from
 * another site is refused. Browsers send Sec-Fetch-Site and Origin; a request with neither is not a browser request
 * riding on someone's cookies.
 */
export function csrfGuard(req: FastifyRequest): void {
  if (SAFE_METHODS.has(req.method)) return
  const site = req.headers['sec-fetch-site']
  if (typeof site === 'string' && site !== 'same-origin' && site !== 'none') throw new ApiError('FORBIDDEN')
  const origin = req.headers.origin
  if (typeof origin === 'string' && origin !== 'null') {
    const host = URL.canParse(origin) ? new URL(origin).host : ''
    if (host !== req.headers.host) throw new ApiError('FORBIDDEN')
  } else if (origin === 'null') throw new ApiError('FORBIDDEN')
}

function querySchema(route: RouteDef) {
  if (!route.pagination) return route.schema.querystring
  const base = (route.schema.querystring ?? { type: 'object', additionalProperties: false, properties: {} }) as {
    properties?: Record<string, unknown>
  }
  return { ...base, properties: { ...(base.properties ?? {}), ...PAGE_QUERY_PROPERTIES } }
}

function refuseKind(kind: ActorKind | 'ai'): ApiError {
  if (kind === 'guest') return new ApiError('UNAUTHENTICATED')
  if (kind === 'customer') return new ApiError('NOT_FOUND')
  return new ApiError('FORBIDDEN')
}

async function runRoute(route: RouteDef, db: Db, req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
  const { actor, authenticatedAt } = req.apiActor ?? GUEST

  const kind = actorKind(actor)
  if (kind === 'ai' || !route.actors.includes(kind)) throw refuseKind(kind)

  const resource = route.resource ? await route.resource({ req, actor, db }) : {}
  if (resource === null) throw new ApiError('NOT_FOUND')
  let decision: Allow | null = null
  if (route.permission !== AUTHENTICATION) {
    const body = req.body as { reason?: unknown } | undefined
    const reason = typeof body?.reason === 'string' ? body.reason : undefined
    const d = decide(actor, route.permission, resource, {
      now: new Date(),
      online: true,
      ...(reason ? { reason } : {}),
    })
    if (d.effect === 'deny') {
      req.log.warn({ action: d.action, reason: d.reason }, 'AUTHZ_DENIED')
      if (actor.kind !== 'staff' || d.reason === 'NOT_FOUND') throw new ApiError('NOT_FOUND')
      if (d.reason === 'REASON_REQUIRED')
        throw new ApiError('VALIDATION_FAILED', {
          fieldErrors: [{ field: 'body.reason', code: 'required', message: '' }],
        })
      throw new ApiError(d.reason === 'FRESH_AUTH_REQUIRED' ? 'FRESH_AUTH_REQUIRED' : 'FORBIDDEN')
    }
    decision = d
  }

  if (route.freshAuthMinutes !== undefined) requireFreshAuth(authenticatedAt, route.freshAuthMinutes)

  const page = route.pagination ? pageRequest(req.query as { limit?: number; cursor?: string }) : undefined
  const requestId = currentContext()?.requestId ?? req.id
  let audited = 0
  const context = (tx: Tx | undefined): ApiContext => ({
    req,
    actor,
    decision,
    db,
    tx,
    authenticatedAt,
    page,
    expectedVersion: () => parseIfMatch(req.headers['if-match']),
    audit: async (event) => {
      if (!tx) throw new Error(`${route.operationId}: audit events are recorded inside a write route`)
      await audit.record(tx, { ...event, action: event.action ?? route.audit, actor: auditActor(actor), requestId })
      audited++
    },
    auditAlways: async (event) => {
      await withTx(db, (own) =>
        audit.record(own, { ...event, action: event.action ?? route.audit, actor: auditActor(actor), requestId }),
      )
      audited++
    },
  })

  let result: ApiResult & { replayed?: boolean }
  if (route.kind === 'read') {
    result = await route.handler(context(undefined))
  } else {
    if (route.expectedVersion === 'required') parseIfMatch(req.headers['if-match'])
    const scope: IdempotencyScope | undefined =
      route.idempotency === 'required'
        ? {
            actorKey: actorKey(actor),
            operation: route.operationId,
            key: readIdempotencyKey(req.headers['idempotency-key']),
            bodyHash: requestHash({ params: req.params, query: req.query, body: req.body }),
          }
        : undefined
    result = await withTx(db, async (tx) => {
      if (scope) {
        const stored = await claim(tx, scope)
        if (stored) return { status: stored.status, body: stored.body, replayed: true }
      }
      const out = await route.handler(context(tx))
      if (route.audit !== 'none' && audited === 0)
        throw new Error(`${route.operationId}: a write route must record its audit event`)
      if (scope) await store(tx, scope, { status: out.status ?? 200, body: out.body }, requestId)
      return out
    })
  }

  reply.status(result.status ?? 200)
  if (result.headers) reply.headers(result.headers)
  if (result.version !== undefined) reply.header('etag', etag(result.version))
  if (result.replayed) reply.header('idempotent-replayed', 'true')
  return reply.send(result.body)
}

/** Registers every module's routes under /api/v1. Throws RouteContractError when a route's contract is incomplete. */
export async function registerApi(app: FastifyInstance, options: ApiOptions): Promise<void> {
  const problems = options.modules.flatMap((m) => m.routes.flatMap(routeProblems))
  const ids = options.modules.flatMap((m) => m.routes.map((r) => r.operationId))
  for (const id of new Set(ids))
    if (ids.filter((i) => i === id).length > 1) problems.push(`duplicate operationId ${id}`)
  if (problems.length) throw new RouteContractError(problems.join('\n'))
  const resolveActor = options.resolveActor ?? (async () => GUEST)

  await app.register(
    async (api) => {
      api.addHook('onRequest', async (req) => {
        csrfGuard(req)
        const resolved = await resolveActor(req)
        req.apiActor = resolved
        req.apiAudience = audienceOf(resolved.actor, resolved.locale)
        // CSRF token (TSK-0015): an unsafe request authenticated by a cookie session carries the session's token.
        if (resolved.csrfToken !== undefined && !SAFE_METHODS.has(req.method)) {
          const sent = req.headers['x-csrf-token']
          const a = Buffer.from(typeof sent === 'string' ? sent : '')
          const b = Buffer.from(resolved.csrfToken)
          if (a.length !== b.length || !timingSafeEqual(a, b)) throw new ApiError('CSRF_TOKEN_INVALID')
        }
      })

      api.addHook('onSend', async (_req, reply, payload) => {
        if (!reply.hasHeader('cache-control')) reply.header('cache-control', DEFAULT_CACHE_CONTROL)
        return payload
      })

      api.setErrorHandler(async (err, req, reply) => {
        const error = toApiError(err)
        if (error.code === 'INTERNAL') req.log.error({ err }, 'API_INTERNAL_ERROR')
        if (error.options.headers) reply.headers(error.options.headers)
        return reply
          .status(error.status)
          .type('application/json; charset=utf-8')
          .send(envelope(error, req.apiAudience ?? { kind: 'customer' }, req.id))
      })

      api.setNotFoundHandler(async (req, reply) =>
        reply.status(404).send(envelope(new ApiError('NOT_FOUND'), req.apiAudience ?? { kind: 'customer' }, req.id)),
      )

      for (const mod of options.modules) {
        for (const route of mod.routes) {
          api.route({
            method: route.method,
            url: route.path,
            schema: {
              ...(route.schema.params ? { params: route.schema.params } : {}),
              ...(querySchema(route) ? { querystring: querySchema(route) } : {}),
              ...(route.schema.body ? { body: route.schema.body } : {}),
              response: route.schema.response,
            },
            handler: async (req, reply) => {
              if (!options.db) throw new ApiError('UNAVAILABLE')
              return runRoute(route, options.db, req, reply)
            },
          })
        }
      }
    },
    { prefix: API_PREFIX },
  )
}
