// API framework without a database (TSK-0010; HH-API-01, HH-API-03, HH-API-05, HH-ARC-02, RULE-SERVER-AUTHZ).
import { readFileSync } from 'node:fs'
import type { Db } from '@handyhub/db'
import { describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { ApiError } from '../../src/api/errors.js'
import { envelope } from '../../src/api/register.js'
import { buildOpenApi, renderOpenApi } from '../../src/api/openapi.js'
import { decodeCursor, encodeCursor, MAX_PAGE_SIZE, pageRequest, toPage } from '../../src/api/pagination.js'
import { RouteContractError, routeProblems, type ApiModule, type RouteDef } from '../../src/api/route.js'
import { assertVersion, parseIfMatch } from '../../src/api/version.js'
import { MODULES } from '../../src/modules/index.js'
import { testConfig } from '../fixtures/env.js'
import { testActor, WIDGETS } from '../fixtures/widgets.js'

const route = (name: string) => WIDGETS.routes.find((r) => r.operationId === name) as RouteDef
const fakeDb = {} as Db
const CUSTOMER = { kind: 'customer' } as const

async function app(modules: readonly ApiModule[] = [WIDGETS], db: Db | null = fakeDb) {
  return buildApp({ config: testConfig(), api: { modules, resolveActor: testActor, ...(db ? { db } : {}) } })
}

describe('route contract (TSK-0010, HH-API-01, HH-ARC-02)', () => {
  it('[HH-API-01] the synthetic module declares a complete contract', () => {
    for (const r of WIDGETS.routes) expect(routeProblems(r), r.operationId).toEqual([])
  })

  it('[HH-API-01] refuses a route with missing metadata or a loose schema', () => {
    const bad: RouteDef = {
      ...route('createWidget'),
      test: '',
      audit: 'none',
      schema: { body: { type: 'object', properties: {} }, response: { 201: { type: 'object' } } },
    }
    expect(routeProblems(bad)).toEqual([
      'POST /staff/widgets: the covering test file is required',
      'POST /staff/widgets: write routes record an audit action',
      'POST /staff/widgets body: input objects need additionalProperties: false',
      'POST /staff/widgets response 201: response objects must list their properties',
    ])
    expect(routeProblems({ ...route('listWidgets'), schema: { response: { 200: { type: 'string' } } } })).toContain(
      'GET /staff/widgets: paginated responses have items and nextCursor',
    )
    expect(routeProblems({ ...route('listWidgets'), kind: 'write' })).toContain(
      'GET /staff/widgets: GET routes are reads and every other method is a write',
    )
  })

  it('[HH-API-04] only a route with an idempotency key describes an idempotency conflict (TSK-0030)', () => {
    const detail = () => ({ reference: 'HH-0000TEST' })
    expect(routeProblems({ ...route('createWidget'), idempotencyConflict: detail })).toEqual([])
    expect(routeProblems({ ...route('listWidgets'), idempotencyConflict: detail })).toContain(
      'GET /staff/widgets: only routes with an idempotency key describe an idempotency conflict',
    )
  })

  it('[HH-ARC-06] every route path starts with its surface (TSK-0017)', () => {
    expect(routeProblems({ ...route('listWidgets'), path: '/widgets' })).toContain(
      'GET /widgets: path starts with its surface: /public/, /customer/ or /staff/',
    )
    for (const path of ['/public/x', '/customer/x', '/staff/x'])
      expect(routeProblems({ ...route('listWidgets'), path })).toEqual([])
  })

  it('[HH-API-01][RULE-SERVER-AUTHZ] registration fails on an incomplete contract', async () => {
    const broken: ApiModule = { name: 'broken', routes: [{ ...route('getWidget'), permission: '' as never }] }
    await expect(app([broken])).rejects.toBeInstanceOf(RouteContractError)
  })

  it('[HH-API-01] openapi.json is generated from the routes and up to date', () => {
    const committed = readFileSync(new URL('../../openapi.json', import.meta.url), 'utf8')
    expect(committed).toBe(renderOpenApi(MODULES))
  })

  it('[HH-API-01] each operation carries actor, permission, idempotency, rate limit, audit and test', () => {
    const doc = buildOpenApi([WIDGETS]) as { paths: Record<string, Record<string, Record<string, unknown>>> }
    const create = doc.paths['/api/v1/staff/widgets']?.['post'] as Record<string, unknown>
    expect(create['x-handyhub']).toMatchObject({
      actors: ['staff'],
      permission: 'customer.edit',
      idempotency: 'required',
      rateLimit: { bucket: 'staff-write', limit: 60, windowSeconds: 60 },
      audit: 'widget.create',
      cache: 'private, no-store',
      test: 'test/integration/api.test.ts',
    })
    const names = (create['parameters'] as { name: string }[]).map((p) => p.name)
    expect(names).toContain('Idempotency-Key')
    const rename = doc.paths['/api/v1/staff/widgets/{id}']?.['patch'] as {
      parameters: { name: string }[]
      responses: object
    }
    expect(rename.parameters.map((p) => p.name)).toEqual(['id', 'If-Match'])
    expect(Object.keys(rename.responses)).toEqual(expect.arrayContaining(['200', '409', '428']))
    const list = doc.paths['/api/v1/staff/widgets']?.['get'] as { parameters: { name: string }[] }
    expect(list.parameters.map((p) => p.name)).toEqual(['limit', 'cursor'])
  })
})

describe('safe error envelope (TSK-0010, HH-API-03)', () => {
  it('[HH-API-03] an unknown API path answers the envelope with the request ID, privately cached', async () => {
    const a = await app()
    const res = await a.inject({ url: '/api/v1/nothing-here', headers: { 'x-request-id': 'synthetic-req-0001' } })
    expect(res.statusCode).toBe(404)
    expect(res.headers['cache-control']).toBe('private, no-store')
    expect(res.json()).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'We could not find what you were looking for.',
        fieldErrors: [],
        requestId: 'synthetic-req-0001',
        retryable: false,
      },
    })
    await a.close()
  })

  it('[HH-API-03][T10] validation names each field and refuses unknown fields; staff read it in Spanish', async () => {
    const a = await app()
    const res = await a.inject({
      method: 'POST',
      url: '/api/v1/staff/widgets',
      headers: { 'x-test-actor': 'owner', 'x-test-locale': 'es', 'idempotency-key': 'synthetic-key-0001' },
      payload: { name: 'x'.repeat(41), extra: ['injected'] },
    })
    expect(res.statusCode).toBe(400)
    const { error } = res.json() as { error: { code: string; message: string; fieldErrors: unknown[] } }
    expect(error.code).toBe('VALIDATION_FAILED')
    expect(error.message).toBe('Falta información o no es válida. Revise los campos marcados.')
    expect(error.fieldErrors).toEqual(
      expect.arrayContaining([
        { field: 'body.extra', code: 'additionalProperties', message: 'Este campo no se acepta.' },
        { field: 'body.name', code: 'maxLength', message: 'Este valor es demasiado largo o demasiado grande.' },
      ]),
    )
    await a.close()
  })

  it('[HH-API-03] malformed JSON and missing required fields are validation errors', async () => {
    const a = await app()
    const headers = {
      'x-test-actor': 'owner',
      'content-type': 'application/json',
      'idempotency-key': 'synthetic-key-0002',
    }
    const bad = await a.inject({ method: 'POST', url: '/api/v1/staff/widgets', headers, payload: '{"name":' })
    expect(bad.json().error.code).toBe('VALIDATION_FAILED')
    const missing = await a.inject({ method: 'POST', url: '/api/v1/staff/widgets', headers, payload: {} })
    expect(missing.json().error.fieldErrors[0]).toMatchObject({ field: 'body.name', code: 'required' })
    await a.close()
  })

  it('[HH-API-03] an unexpected failure reveals nothing and is retryable', async () => {
    const throwing: ApiModule = {
      name: 'throwing',
      routes: [
        {
          ...route('getWidget'),
          resource: async () => ({}),
          handler: async () => Promise.reject(new Error('SELECT password FROM x')),
        },
      ],
    }
    const a = await app([throwing])
    const res = await a.inject({ url: '/api/v1/staff/widgets/1', headers: { 'x-test-actor': 'owner' } })
    expect(res.statusCode).toBe(500)
    expect(res.body).not.toMatch(/SELECT|password|stack/i)
    expect(res.json().error).toMatchObject({ code: 'INTERNAL', retryable: true })
    await a.close()
  })

  it('[HH-API-03] without a database the API answers UNAVAILABLE', async () => {
    const a = await app([WIDGETS], null)
    const res = await a.inject({ url: '/api/v1/staff/widgets/1', headers: { 'x-test-actor': 'owner' } })
    expect(res.statusCode).toBe(503)
    expect(res.json().error.code).toBe('UNAVAILABLE')
    await a.close()
  })

  it('[HH-API-03][HH-INT-10] a conflict that names what its key created carries it; any other error does not (TSK-0030)', () => {
    const named = envelope(
      new ApiError('IDEMPOTENCY_CONFLICT', { existing: { reference: 'HH-0000TEST' } }),
      CUSTOMER,
      'r1',
    )
    expect(named.error).toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
      retryable: false,
      existing: { reference: 'HH-0000TEST' },
    })
    expect(Object.keys(envelope(new ApiError('IDEMPOTENCY_CONFLICT'), CUSTOMER, 'r2').error)).not.toContain('existing')
  })
})

describe('authorization at the enforcement point (TSK-0010, RULE-SERVER-AUTHZ)', () => {
  it('[RULE-SERVER-AUTHZ][T19][T26] guests are unauthenticated, customers see not-found, an unpermitted role is forbidden', async () => {
    const a = await app()
    const as = (who: string) => a.inject({ url: '/api/v1/staff/widgets', headers: { 'x-test-actor': who } })
    expect((await as('guest')).json().error.code).toBe('UNAUTHENTICATED')
    expect((await as('customer')).json().error.code).toBe('NOT_FOUND')
    const worker = await as('worker')
    expect(worker.statusCode).toBe(403)
    expect(worker.json().error.code).toBe('FORBIDDEN')
    await a.close()
  })
})

describe('pagination and versions (TSK-0010, HH-API-04, HH-API-05)', () => {
  it('[HH-API-05] caps the page size and round-trips an opaque cursor', () => {
    expect(pageRequest({ limit: 10_000 }).limit).toBe(MAX_PAGE_SIZE)
    expect(pageRequest(undefined).limit).toBe(25)
    expect(decodeCursor(encodeCursor([42, 'b']))).toEqual([42, 'b'])
    expect(() => decodeCursor('not*base64')).toThrow(ApiError)
    const page = toPage([1, 2, 3], { limit: 2, after: undefined }, (n) => [n])
    expect(page.items).toEqual([1, 2])
    expect(decodeCursor(page.nextCursor as string)).toEqual([2])
    expect(toPage([1], { limit: 2, after: undefined }, (n) => [n]).nextCursor).toBeNull()
  })

  it('[HH-API-04] If-Match is required and a stale version is a conflict with the current values', () => {
    expect(parseIfMatch('"3"')).toBe(3)
    expect(parseIfMatch('W/"7"')).toBe(7)
    expect(() => parseIfMatch(undefined)).toThrow(expect.objectContaining({ code: 'PRECONDITION_REQUIRED' }))
    expect(() => assertVersion(2, 3, { name: 'current' })).toThrow(
      expect.objectContaining({
        code: 'STALE_VERSION',
        options: { current: { version: 3, values: { name: 'current' } } },
      }),
    )
    expect(() => assertVersion(3, 3)).not.toThrow()
  })
})
