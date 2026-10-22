// Route contract (TSK-0010; HH-API-01, HH-ARC-02, RULE-SERVER-AUTHZ). Every API route declares its contract and its
// policy metadata; registration refuses a route that leaves any of it out, so later features get validation, the
// error shape, authorization, idempotency, versions, pagination, audit and the OpenAPI entry by declaring them.
import type { Db, Tx } from '@handyhub/db'
import type { StaffLocale } from '@handyhub/i18n'
import type { Action, Actor, Allow, DataScope, DecisionContext, Resource } from '@handyhub/policy'
import type { FastifyRequest } from 'fastify'
import type { AuditEventInput } from '../platform/audit.js'
import type { ConflictDetail } from './idempotency.js'
import type { ApiError } from './errors.js'
import type { PageRequest } from './pagination.js'
import { surfaceOf } from '../hosts.js'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
export type ActorKind = 'staff' | 'customer' | 'guest'
export type JsonSchema = Record<string, unknown>

/** The caller as the session layer resolved it (sessions arrive with TSK-0014; until then every caller is a guest). */
export type RequestActor = {
  actor: Actor
  locale?: StaffLocale
  /** Cookie sessions: the CSRF token every unsafe request must carry in X-CSRF-Token (TSK-0015). */
  csrfToken?: string
  /** When the caller last entered a password or second factor (fresh authentication). */
  authenticatedAt?: Date
  /**
   * Staff sessions (TSK-0097, HH-STAFF-02): checks again, inside a business write's transaction, that the account is
   * still active and the session still live, and holds that until commit, so a write that raced an offboarding either
   * committed before it or is refused. False refuses the write as UNAUTHENTICATED.
   */
  revalidate?: (tx: Tx) => Promise<boolean>
}
export type ResolveActor = (req: FastifyRequest) => Promise<RequestActor>

/**
 * A route's rate limit. The framework counts every call before the handler runs, unless `enforcedBy` is 'handler':
 * the route's handler then applies the limit itself (staff sign-in, reset and link routes count failures or per
 * account and network, TSK-0014), and the declaration documents it in the contract.
 */
export type RateLimit =
  { bucket: string; limit: number; windowSeconds: number; enforcedBy?: 'framework' | 'handler' } | 'none'

export interface ApiContext {
  req: FastifyRequest
  actor: Actor
  /** The policy's allow; null on authentication routes, which authenticate the caller themselves. */
  decision: Allow | null
  /**
   * The records this caller reaches under the route's permission (TSK-0037, HH-DATA-01): every repository query takes
   * it, so an altered ID outside it finds nothing. A customer: the live projects of their session; a guest: nothing.
   */
  scope: DataScope
  /** Reads outside a transaction. */
  db: Db
  /** Write routes: the business transaction; the idempotency record and audit events commit with it. */
  tx: Tx | undefined
  /** When the caller last entered a password or second factor; undefined for callers without a staff session. */
  authenticatedAt: Date | undefined
  /** Paginated routes: the capped page size and the decoded cursor. */
  page: PageRequest | undefined
  /** The If-Match version; throws PRECONDITION_REQUIRED when absent (routes with expectedVersion: 'required'). */
  expectedVersion(): number
  /** Records an audit event in the route's transaction; the actor and default action come from the route. */
  audit(event: Omit<AuditEventInput, 'actor' | 'action'> & { action?: string }): Promise<void>
  /**
   * Records an audit event in its own transaction, so it is kept even when the route then fails (for example a
   * failed sign-in, which must be audited although nothing else is written).
   */
  auditAlways(event: Omit<AuditEventInput, 'actor' | 'action'> & { action?: string }): Promise<void>
}

/**
 * Authentication routes (sign-in, sign-out, password links) establish who the caller is, so the policy cannot decide
 * them by role; they authenticate the caller themselves and are listed as such in the contract.
 */
export const AUTHENTICATION = 'authentication' as const

export type ApiResult = {
  status?: number
  body: unknown
  version?: number
  headers?: Record<string, string>
  /**
   * A write route's refusal that must keep what its transaction recorded (for example a counted code attempt, so the
   * attempt limit holds): the transaction commits, nothing is stored for idempotency, and this error is answered
   * exactly as if it had been thrown. The route records its audit event (result denied) before returning it.
   */
  refusal?: ApiError
}

export interface RouteDef {
  method: HttpMethod
  /** Path below /api/v1, for example `/requests/:id`. */
  path: string
  operationId: string
  summary: string
  /** Who may call it at all; the policy decides the rest. */
  actors: readonly ActorKind[]
  /**
   * The ROLE-MATRIX action the policy decides on (deny by default), or AUTHENTICATION for sign-in routes. An action
   * whose rule needs a written reason reads it from the body's `reason` field.
   */
  permission: Action | typeof AUTHENTICATION
  /** Read routes run without a transaction; write routes inside one. */
  kind: 'read' | 'write'
  idempotency: 'required' | 'none'
  /**
   * Routes with an idempotency key only: what an IDEMPOTENCY_CONFLICT may name about the write the key already made,
   * read from its stored response (`existing` in the error envelope). Default: nothing. Only a value that grants
   * nothing belongs here, such as a public reference.
   */
  idempotencyConflict?: ConflictDetail
  expectedVersion: 'required' | 'none'
  rateLimit: RateLimit
  /** Owner-only and other sensitive actions: a password or second factor entered within this many minutes. */
  freshAuthMinutes?: number
  /**
   * TSK-0154 (OWN-DEC-202, MFA mandatory for every staff role): the route answers a staff session that has passed the
   * password but not yet the second factor. Only authentication routes may say so: enrolling the authenticator, the
   * challenge, sign-out, and the guest routes that never read a session (sign-in, password links). Every other route
   * refuses such a session with UNAUTHENTICATED (field `session`, code MFA_REQUIRED) before anything else runs.
   */
  beforeSecondFactor?: true
  /** The audit action recorded on success, or 'none' for reads. */
  audit: string | 'none'
  pagination: boolean
  /** The test file (relative to apps/server) that covers the route. */
  test: string
  /** Record scope and side effects in words, for the contract. */
  description: string
  schema: {
    params?: JsonSchema
    querystring?: JsonSchema
    body?: JsonSchema
    /** Explicit response schemas per success status: undeclared fields are stripped (HH-ARC-04). */
    response: Record<number, JsonSchema>
  }
  /**
   * A write route that takes raw bytes (for example a photo) instead of JSON: the accepted content types and the
   * transport ceiling in bytes. Any other content type answers UNSUPPORTED_MEDIA_TYPE; the business limits (size,
   * count) are checked by the handler from configuration.
   */
  binaryBody?: { contentTypes: readonly string[]; maxBytes: number }
  /**
   * Customer surface routes (/customer/): the customer view the response is built from (TSK-0037, HH-ARC-04;
   * modules/records/projections.ts). The response schema is that view's allow-list; nothing else reaches the browser.
   */
  projection?: { readonly name: string; readonly entity: string }
  /**
   * The policy also needs today's date in the business time zone (a rule that holds only on the visit date, such as
   * the access-code reveal, T28). Default: no date, so such a rule is refused.
   */
  businessDate?: true
  /**
   * A read that answers with file bytes (for example a PDF) instead of JSON: the content types its success response
   * may have. The handler returns a Buffer with its content type; errors keep the JSON envelope.
   */
  binaryResponse?: { contentTypes: readonly string[] }
  /** The record facts the policy needs; null answers NOT_FOUND. Default: no facts. */
  resource?: (ctx: Pick<ApiContext, 'req' | 'actor' | 'db'>) => Promise<Resource | null>
  /**
   * Request facts the policy needs beyond the record, read from the server's own data before deciding: the Owner's
   * estimate publishing policy (OWN-DEC-118, TSK-0055). The handler decides again inside its transaction.
   */
  decisionContext?: (ctx: Pick<ApiContext, 'req' | 'actor' | 'db'>) => Promise<Pick<DecisionContext, 'publishingRoles'>>
  handler: (ctx: ApiContext) => Promise<ApiResult>
}

export interface ApiModule {
  /** Module name (ARC-02 modules: identity, catalog, requests, estimates, ...). */
  name: string
  routes: readonly RouteDef[]
}

export class RouteContractError extends Error {
  override name = 'RouteContractError'
}

const AUDIT_ACTION = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/

/** Every object in an input schema refuses unknown fields; every object in a response schema lists its fields. */
function checkObjects(schema: unknown, where: string, mode: 'input' | 'response', problems: string[]): void {
  if (!schema || typeof schema !== 'object') return
  const s = schema as Record<string, unknown>
  if (s['type'] === 'object') {
    if (mode === 'input' && s['additionalProperties'] !== false)
      problems.push(`${where}: input objects need additionalProperties: false`)
    if (mode === 'response' && (s['properties'] === undefined || s['additionalProperties'] === true))
      problems.push(`${where}: response objects must list their properties`)
  }
  for (const [k, v] of Object.entries(s)) {
    if (k === 'properties' && v && typeof v === 'object')
      for (const [p, sub] of Object.entries(v)) checkObjects(sub, `${where}.${p}`, mode, problems)
    else if (k === 'items' || k === 'additionalProperties') checkObjects(v, `${where}[]`, mode, problems)
    else if ((k === 'anyOf' || k === 'oneOf' || k === 'allOf') && Array.isArray(v))
      v.forEach((sub, i) => checkObjects(sub, `${where}|${i}`, mode, problems))
  }
}

/** The problems with a route's contract; registration throws when there is any. */
export function routeProblems(route: RouteDef): string[] {
  const p: string[] = []
  const id = `${route.method} ${route.path}`
  if (!route.path.startsWith('/')) p.push(`${id}: path must start with /`)
  else if (!surfaceOf(route.path)) p.push(`${id}: path starts with its surface: /public/, /customer/ or /staff/`)
  if (!/^[a-z][A-Za-z0-9]*$/.test(route.operationId)) p.push(`${id}: operationId must be lowerCamelCase`)
  if (!route.summary) p.push(`${id}: summary is required`)
  if (!route.description) p.push(`${id}: description is required`)
  if (route.actors.length === 0) p.push(`${id}: at least one actor kind is required`)
  if (!route.permission) p.push(`${id}: permission is required`)
  if (!route.test || !/\.test\.ts$/.test(route.test)) p.push(`${id}: the covering test file is required`)
  const writes = route.method !== 'GET'
  if (writes !== (route.kind === 'write')) p.push(`${id}: GET routes are reads and every other method is a write`)
  if (route.kind === 'write' && route.audit === 'none') p.push(`${id}: write routes record an audit action`)
  if (route.audit !== 'none' && !AUDIT_ACTION.test(route.audit)) p.push(`${id}: audit action must be <area>.<verb>`)
  if (route.kind === 'read' && (route.idempotency !== 'none' || route.expectedVersion !== 'none'))
    p.push(`${id}: read routes take no idempotency key or expected version`)
  if (route.idempotencyConflict && route.idempotency !== 'required')
    p.push(`${id}: only routes with an idempotency key describe an idempotency conflict`)
  if (route.pagination && route.method !== 'GET') p.push(`${id}: only GET routes paginate`)
  if (route.beforeSecondFactor && (route.permission !== AUTHENTICATION || surfaceOf(route.path) !== 'staff'))
    p.push(`${id}: only staff authentication routes answer a session before its second factor`)
  if (route.rateLimit !== 'none' && (route.rateLimit.limit < 1 || route.rateLimit.windowSeconds < 1))
    p.push(`${id}: rate limit needs a positive limit and window`)
  const success = Object.keys(route.schema.response).map(Number)
  if (!success.some((s) => s >= 200 && s < 300)) p.push(`${id}: a 2xx response schema is required`)
  if (route.pagination) {
    const ok = Object.entries(route.schema.response).find(([s]) => s === '200')?.[1] as
      { properties?: Record<string, unknown> } | undefined
    if (!ok?.properties?.['items'] || !ok.properties['nextCursor'])
      p.push(`${id}: paginated responses have items and nextCursor`)
  }
  if (route.binaryBody) {
    if (route.kind !== 'write') p.push(`${id}: only write routes take a binary body`)
    if (route.schema.body) p.push(`${id}: a binary body has no JSON body schema`)
    if (route.binaryBody.contentTypes.length === 0 || route.binaryBody.maxBytes < 1)
      p.push(`${id}: a binary body names its content types and a positive size ceiling`)
    if (route.idempotency === 'required') p.push(`${id}: binary uploads deduplicate by content, not by idempotency key`)
  }
  if (route.binaryResponse && (route.kind !== 'read' || route.binaryResponse.contentTypes.length === 0))
    p.push(`${id}: a binary response is a read naming its content types`)
  for (const part of ['params', 'querystring', 'body'] as const)
    checkObjects(route.schema[part], `${id} ${part}`, 'input', p)
  for (const [status, s] of Object.entries(route.schema.response))
    checkObjects(s, `${id} response ${status}`, 'response', p)
  return p
}
