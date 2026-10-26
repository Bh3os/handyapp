// API registration (TSK-0010; HH-API-01, HH-API-03, HH-API-04, HH-API-05, HH-ARC-02, RULE-SERVER-AUTHZ). One
// encapsulated Fastify scope under /api/v1 holds every module's routes. For each request it:
// - validates params, query and body against the route's schemas (unknown fields are refused) and serializes the
//   response through the route's explicit response schema (undeclared fields are stripped);
// - resolves the caller, checks the route's actor kinds and asks the policy (deny by default); a customer or guest
//   outside their scope gets the same NOT_FOUND as a missing record (T19); a caller the route never serves (its kind,
//   or staff roles with no rule at all for its action) is refused before validation and any record read (TSK-0108);
// - runs reads without a transaction and writes inside one, with the idempotency record and the audit events
//   committing together with the write;
// - answers every error in the one safe envelope, in the audience's language, and sets Cache-Control: private,
//   no-store unless a route says otherwise.
// Every route belongs to one surface by its first path segment: /public, /customer or /staff (TSK-0017). A surface
// answers only on its own host (the staff API on the staff host; the public and customer APIs on the public host) and
// reads only its own session: the staff surface staff sessions, the public and customer surfaces customer sessions.
import { timingSafeEqual } from 'node:crypto'
import type { Db, Tx } from '@handyhub/db'
import { withTx } from '@handyhub/db'
import type { StaffLocale } from '@handyhub/i18n'
import { actionsFor, dataScope, decide, type Action, type Actor, type Allow, type Resource } from '@handyhub/policy'
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { HostConfig } from '../config.js'
import { hostSide, surfaceAllowed, surfaceOf } from '../hosts.js'
import { localDate } from '@handyhub/domain/request-form'
import { audit, type AuditActor } from '../platform/audit.js'
import { loadConfig } from '../platform/config/index.js'
import { currentContext } from '../platform/request-context.js'
import { ApiError, type ErrorEnvelope, type FieldError } from './errors.js'
import { requireFreshAuth } from './fresh-auth.js'
import { actorKey, claim, readIdempotencyKey, requestHash, store, type IdempotencyScope } from './idempotency.js'
import { errorMessage, fieldKind, fieldMessage, type Audience } from './messages.js'
import { PAGE_QUERY_PROPERTIES, pageRequest } from './pagination.js'
import { RateLimiter } from './rate-limit.js'
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
  /** Resolves the caller: one resolver for every surface (tests), or one per side so a staff session is never read on
   *  the public and customer surfaces and a customer session never on the staff surface. Default: every caller a guest. */
  resolveActor?: ResolveActor | SurfaceResolvers
  /** The two origins (TSK-0017); default one host for every surface. */
  hosts?: HostConfig
  /** Proxies in front of the service that append to X-Forwarded-For (rate limits key on the client network). */
  trustProxyHops?: number
  /** Rate limiter; tests pass their own. Default: PostgreSQL counters on `db`. */
  rateLimiter?: RateLimiter
}

const GUEST: RequestActor = { actor: { kind: 'guest' } }

/** What the request hooks read from a registered route (Fastify route config). */
type RouteConfig = {
  beforeSecondFactor: boolean
  actors: readonly ActorKind[]
  permission: RouteDef['permission']
}

/** The session readers per side: `staff` for /staff routes, `public` for /public and /customer routes. */
export interface SurfaceResolvers {
  staff: ResolveActor
  public: ResolveActor
}

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
      ...(error.options.existing ? { existing: error.options.existing } : {}),
      ...(error.options.alternatives ? { alternatives: error.options.alternatives } : {}),
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

/** A pre-MFA staff session asked for a route that needs the second factor (TSK-0154). */
export function mfaRequired(): ApiError {
  return new ApiError('UNAUTHENTICATED', { fieldErrors: [{ field: 'session', code: 'MFA_REQUIRED', message: '' }] })
}

function refuseKind(kind: ActorKind | 'ai'): ApiError {
  if (kind === 'guest') return new ApiError('UNAUTHENTICATED')
  if (kind === 'customer') return new ApiError('NOT_FOUND')
  return new ApiError('FORBIDDEN')
}

/**
 * TSK-0108 (HH-STAFF-04, HH-ARC-03, T19, T26): refuses, before the input is validated and before any record is read,
 * a caller whose kind the route never serves and a staff member none of whose roles has any rule for the route's
 * action (a Worker on an Owner-only route). Such a call is refused whatever it sends, so a hidden route requested
 * directly learns neither its input schema nor whether a record exists. The full decision on the record follows in
 * runRoute; this only answers early what no record could change.
 */
function refuseBeforeInput(req: FastifyRequest, route: RouteConfig, actor: Actor): void {
  const kind = actorKind(actor)
  if (kind === 'ai' || !route.actors.includes(kind)) throw refuseKind(kind)
  // A customer or guest outside the matrix is answered in runRoute, after the record is read, so the refusal is the
  // same NOT_FOUND as a missing record and is kept as a security event (T19).
  if (route.permission === AUTHENTICATION || actor.kind !== 'staff') return
  const permission: Action = route.permission
  if (actionsFor(actor.roles).includes(permission)) return
  const d = decide(actor, permission, {}, { now: new Date() })
  if (d.effect === 'allow') return
  req.log.warn({ action: d.action, reason: d.reason }, 'AUTHZ_DENIED')
  throw new ApiError('FORBIDDEN')
}

/**
 * A customer or guest asked for an existing record outside their scope (an altered ID, T19): answered exactly like a
 * missing record, and kept as a security event in the append-only audit log (its own transaction, so a read records
 * it too). Only the operation and the record's type and ID are written: never a token, code or the request body.
 */
async function recordScopeDenial(db: Db, req: FastifyRequest, actor: Actor, route: RouteDef, resource: Resource) {
  const projectId = resource.projectId
  if (projectId === undefined) return
  const requestId = currentContext()?.requestId ?? req.id
  await withTx(db, (tx) =>
    audit.record(tx, {
      actor: auditActor(actor),
      action: 'security.scope_denied',
      target: { type: 'project', id: projectId },
      result: 'denied',
      reason: 'outside_scope',
      summary: { operation: route.operationId, method: route.method },
      requestId,
    }),
  )
}

/**
 * Today in the business time zone (`business.timezone`), for rules that hold only on a date (the access-code reveal,
 * T28). NOT CONFIGURED: undefined, so such a rule is refused for a missing fact, never allowed.
 */
async function businessToday(db: Db, now: Date): Promise<string | undefined> {
  const zone = (await loadConfig(db)).get('business.timezone')
  return zone.state === 'CONFIGURED' ? localDate(now, zone.value.zone) : undefined
}

async function runRoute(
  route: RouteDef,
  db: Db,
  limiter: RateLimiter,
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const { actor, authenticatedAt } = req.apiActor ?? GUEST

  // TSK-0154 (OWN-DEC-202): a staff session that has not completed its second factor reaches only the routes that say
  // so (enrolment, the challenge, sign-out and the guest sign-in routes); every other route refuses it first.
  if (req.staffPendingSession && !route.beforeSecondFactor) throw mfaRequired()

  const kind = actorKind(actor)
  if (kind === 'ai' || !route.actors.includes(kind)) throw refuseKind(kind)

  // Counted before anything runs, in its own statement, so a refused or failed call still counts (HH-INT-11).
  if (route.rateLimit !== 'none' && route.rateLimit.enforcedBy !== 'handler') {
    const decision = await limiter.consume(route.rateLimit, limiter.callerKey(req, actor))
    if (!decision.allowed) {
      req.log.warn({ bucket: route.rateLimit.bucket }, 'RATE_LIMITED')
      throw new ApiError('RATE_LIMITED', { headers: { 'retry-after': String(decision.retryAfterSeconds) } })
    }
  }

  const resource = route.resource ? await route.resource({ req, actor, db }) : {}
  if (resource === null) throw new ApiError('NOT_FOUND')
  const now = new Date()
  let decision: Allow | null = null
  if (route.permission !== AUTHENTICATION) {
    const body = req.body as { reason?: unknown } | undefined
    const reason = typeof body?.reason === 'string' ? body.reason : undefined
    const today = route.businessDate ? await businessToday(db, now) : undefined
    const facts = route.decisionContext ? await route.decisionContext({ req, actor, db }) : {}
    const d = decide(actor, route.permission, resource, {
      now,
      online: true,
      ...facts,
      ...(reason ? { reason } : {}),
      ...(today ? { today } : {}),
    })
    if (d.effect === 'deny') {
      req.log.warn({ action: d.action, reason: d.reason }, 'AUTHZ_DENIED')
      // TSK-0056 (HH-ID-07): a customer acting on their own project with a verification older than the freshness
      // window is told so; the record is in their scope (scope is checked first), so this reveals nothing.
      if (actor.kind === 'customer' && d.reason === 'FRESH_VERIFICATION_REQUIRED')
        throw new ApiError('FORBIDDEN', {
          fieldErrors: [{ field: 'verification', code: 'FRESH_VERIFICATION_REQUIRED', message: '' }],
        })
      if (actor.kind !== 'staff' || d.reason === 'NOT_FOUND') {
        if (actor.kind !== 'staff') await recordScopeDenial(db, req, actor, route, resource)
        throw new ApiError('NOT_FOUND')
      }
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
  const scope = dataScope(actor, route.permission === AUTHENTICATION ? null : route.permission, now)
  const context = (tx: Tx | undefined): ApiContext => ({
    req,
    actor,
    decision,
    scope,
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
    const revalidate = route.permission === AUTHENTICATION ? undefined : req.apiActor?.revalidate
    result = await withTx(db, async (tx) => {
      // TSK-0097 (HH-STAFF-02): a staff account disabled, or a session revoked, while this request was on its way.
      if (revalidate && !(await revalidate(tx))) throw new ApiError('UNAUTHENTICATED')
      if (scope) {
        const stored = await claim(tx, scope, route.idempotencyConflict)
        if (stored) return { status: stored.status, body: stored.body, replayed: true }
      }
      const out = await route.handler(context(tx))
      if (route.audit !== 'none' && audited === 0)
        throw new Error(`${route.operationId}: a write route must record its audit event`)
      if (scope && !out.refusal) await store(tx, scope, { status: out.status ?? 200, body: out.body }, requestId)
      return out
    })
  }
  // Committed, then refused (ApiResult.refusal): answered by the error handler like any thrown ApiError.
  if (result.refusal) throw result.refusal

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
  const given = options.resolveActor ?? (async () => GUEST)
  const resolvers: SurfaceResolvers = typeof given === 'function' ? { staff: given, public: given } : given
  const hosts: HostConfig = options.hosts ?? { mode: 'single' }
  const limiter =
    options.rateLimiter ?? (options.db ? new RateLimiter(options.db, options.trustProxyHops ?? 0) : undefined)

  await app.register(
    async (api) => {
      api.addHook('onRequest', async (req) => {
        // The wrong host, an unknown host or no surface: the same 404 as a missing route, before any session is read.
        const surface = surfaceOf(req.url.slice(API_PREFIX.length))
        const side = req.hostSide ?? hostSide(hosts, req.headers.host)
        if (!surface || !surfaceAllowed(surface, side)) throw new ApiError('NOT_FOUND')
        csrfGuard(req)
        const resolved = await (surface === 'staff' ? resolvers.staff : resolvers.public)(req)
        req.apiActor = resolved
        req.apiAudience = audienceOf(resolved.actor, resolved.locale)
        // TSK-0154 (OWN-DEC-202): a staff session before its second factor reaches only the routes declared
        // beforeSecondFactor, refused here before validation so a malformed request learns nothing either (runRoute
        // checks again).
        const config = req.routeOptions.config as unknown as Partial<RouteConfig> | undefined
        if (req.staffPendingSession && config?.beforeSecondFactor !== true) throw mfaRequired()
        // CSRF token (TSK-0015): an unsafe request authenticated by a cookie session carries the session's token.
        if (resolved.csrfToken !== undefined && !SAFE_METHODS.has(req.method)) {
          const sent = req.headers['x-csrf-token']
          const a = Buffer.from(typeof sent === 'string' ? sent : '')
          const b = Buffer.from(resolved.csrfToken)
          if (a.length !== b.length || !timingSafeEqual(a, b)) throw new ApiError('CSRF_TOKEN_INVALID')
        }
        // TSK-0108: the caller's kind and roles against the route, before validation (the catch-all has no contract).
        if (config?.actors && config.permission) refuseBeforeInput(req, config as RouteConfig, resolved.actor)
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

      // Raw-byte bodies of binary routes (photos): kept as a Buffer for the handler; the route sets its own ceiling.
      const binaryTypes = [
        ...new Set(options.modules.flatMap((m) => m.routes.flatMap((r) => r.binaryBody?.contentTypes ?? []))),
      ]
      if (binaryTypes.length)
        api.addContentTypeParser(binaryTypes, { parseAs: 'buffer' }, (_req, body, done) => done(null, body))

      // Anything else below /api/v1, in any method (a CORS preflight too): the same 404 envelope, never a page.
      api.all('/*', async () => {
        throw new ApiError('NOT_FOUND')
      })

      for (const mod of options.modules) {
        for (const route of mod.routes) {
          api.route({
            ...(route.binaryBody ? { bodyLimit: route.binaryBody.maxBytes } : {}),
            method: route.method,
            url: route.path,
            config: {
              beforeSecondFactor: route.beforeSecondFactor === true,
              actors: route.actors,
              permission: route.permission,
            } satisfies RouteConfig,
            schema: {
              ...(route.schema.params ? { params: route.schema.params } : {}),
              ...(querySchema(route) ? { querystring: querySchema(route) } : {}),
              ...(route.schema.body ? { body: route.schema.body } : {}),
              response: route.schema.response,
            },
            handler: async (req, reply) => {
              if (!options.db || !limiter) throw new ApiError('UNAVAILABLE')
              return runRoute(route, options.db, limiter, req, reply)
            },
          })
        }
      }
    },
    { prefix: API_PREFIX },
  )
}
