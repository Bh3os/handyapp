// Route contract (TSK-0010; HH-API-01, HH-ARC-02, RULE-SERVER-AUTHZ). Every API route declares its contract and its
// policy metadata; registration refuses a route that leaves any of it out, so later features get validation, the
// error shape, authorization, idempotency, versions, pagination, audit and the OpenAPI entry by declaring them.
import type { Db, Tx } from '@handyhub/db'
import type { StaffLocale } from '@handyhub/i18n'
import type { Action, Actor, Allow, Resource } from '@handyhub/policy'
import type { FastifyRequest } from 'fastify'
import type { AuditEventInput } from '../platform/audit.js'
import type { PageRequest } from './pagination.js'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
export type ActorKind = 'staff' | 'customer' | 'guest'
export type JsonSchema = Record<string, unknown>

/** The caller as the session layer resolved it (sessions arrive with TSK-0014; until then every caller is a guest). */
export type RequestActor = { actor: Actor; locale?: StaffLocale }
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
  /** Reads outside a transaction. */
  db: Db
  /** Write routes: the business transaction; the idempotency record and audit events commit with it. */
  tx: Tx | undefined
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

export type ApiResult = { status?: number; body: unknown; version?: number; headers?: Record<string, string> }

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
  expectedVersion: 'required' | 'none'
  rateLimit: RateLimit
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
  /** The record facts the policy needs; null answers NOT_FOUND. Default: no facts. */
  resource?: (ctx: Pick<ApiContext, 'req' | 'actor' | 'db'>) => Promise<Resource | null>
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
  if (route.pagination && route.method !== 'GET') p.push(`${id}: only GET routes paginate`)
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
  for (const part of ['params', 'querystring', 'body'] as const)
    checkObjects(route.schema[part], `${id} ${part}`, 'input', p)
  for (const [status, s] of Object.entries(route.schema.response))
    checkObjects(s, `${id} response ${status}`, 'response', p)
  return p
}
