// API framework against PostgreSQL 16 (TSK-0010; HH-API-01, HH-API-04, HH-API-05, RULE-SERVER-AUTHZ). A synthetic
// widget module exercises idempotency, expected versions, pagination, response stripping and audit.
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { testConfig } from '../fixtures/env.js'
import { createWidgetTable, testActor, WIDGETS } from '../fixtures/widgets.js'

let t: TestDatabase
let app: FastifyInstance
const owner = { 'x-test-actor': 'owner' }

beforeAll(async () => {
  t = await createTestDatabase()
  await createWidgetTable(t.db)
  app = await buildApp({ config: testConfig(), api: { db: t.db, modules: [WIDGETS], resolveActor: testActor } })
})
afterAll(async () => {
  await app?.close()
  await t?.drop()
})

const count = async (table: string) =>
  Number((await sql<{ n: string }>`SELECT count(*) AS n FROM ${sql.raw(table)}`.execute(t.db)).rows[0]?.n)

const create = (key: string, payload: Record<string, unknown>) =>
  app.inject({ method: 'POST', url: '/api/v1/widgets', headers: { ...owner, 'idempotency-key': key }, payload })

describe('idempotency keys (TSK-0010, HH-API-04)', () => {
  it('[HH-API-04][T11] a replayed key returns the stored response and writes nothing new', async () => {
    const first = await create('synthetic-key-replay-1', { name: 'Alpha' })
    expect(first.statusCode).toBe(201)
    expect(first.headers['etag']).toBe('"1"')
    const again = await create('synthetic-key-replay-1', { name: 'Alpha' })
    expect(again.statusCode).toBe(201)
    expect(again.headers['idempotent-replayed']).toBe('true')
    expect(again.json()).toEqual(first.json())
    expect(await count('public.api_widgets')).toBe(1)
    const events = await t.db.selectFrom('platform.audit_events').select(['action', 'request_id']).execute()
    expect(events.map((e) => e.action)).toEqual(['widget.create'])
  })

  it('[HH-API-04][T11] the same key with a changed body is a 409 and writes nothing', async () => {
    const res = await create('synthetic-key-replay-1', { name: 'Changed' })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('IDEMPOTENCY_CONFLICT')
    expect(await count('public.api_widgets')).toBe(1)
  })

  it('[HH-API-04] a missing key is refused; keys are scoped by actor and operation', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/widgets',
      headers: owner,
      payload: { name: 'No key' },
    })
    expect(res.json().error.code).toBe('IDEMPOTENCY_KEY_REQUIRED')
    const row = await t.db
      .selectFrom('platform.idempotency_keys')
      .select(['actor_key', 'operation', 'response_status'])
      .executeTakeFirstOrThrow()
    expect(row).toEqual({ actor_key: 'staff:staff-synthetic-owner', operation: 'createWidget', response_status: 201 })
  })

  it('[HH-API-04][T34] concurrent duplicates create one record', async () => {
    const before = await count('public.api_widgets')
    const results = await Promise.all(
      Array.from({ length: 5 }, () => create('synthetic-key-concurrent', { name: 'Beta' })),
    )
    expect(results.map((r) => r.statusCode)).toEqual([201, 201, 201, 201, 201])
    expect(new Set(results.map((r) => r.json().id)).size).toBe(1)
    expect(await count('public.api_widgets')).toBe(before + 1)
  })

  it('[HH-API-04] a failed write stores no key, so the retry runs again', async () => {
    const before = await count('public.api_widgets')
    const failed = await create('synthetic-key-failure', { name: 'Gamma', fail: true })
    expect(failed.statusCode).toBe(500)
    expect(await count('public.api_widgets')).toBe(before)
    const retry = await create('synthetic-key-failure', { name: 'Gamma', fail: true })
    expect(retry.headers['idempotent-replayed']).toBeUndefined()
  })
})

describe('expected versions (TSK-0010, HH-API-04)', () => {
  it('[HH-API-04] a stale version is a 409 with the current values and changes nothing', async () => {
    const created = (await create('synthetic-key-version', { name: 'Delta' })).json() as { id: number }
    const url = `/api/v1/widgets/${created.id}`
    const ok = await app.inject({
      method: 'PATCH',
      url,
      headers: { ...owner, 'if-match': '"1"' },
      payload: { name: 'Delta 2' },
    })
    expect(ok.statusCode).toBe(200)
    expect(ok.headers['etag']).toBe('"2"')
    const stale = await app.inject({
      method: 'PATCH',
      url,
      headers: { ...owner, 'if-match': '"1"' },
      payload: { name: 'Lost update' },
    })
    expect(stale.statusCode).toBe(409)
    expect(stale.json().error).toMatchObject({
      code: 'STALE_VERSION',
      current: { version: 2, values: { name: 'Delta 2' } },
    })
    const missing = await app.inject({ method: 'PATCH', url, headers: owner, payload: { name: 'No version' } })
    expect(missing.statusCode).toBe(428)
    const row = await sql<{ name: string }>`SELECT name FROM public.api_widgets WHERE id = ${created.id}`.execute(t.db)
    expect(row.rows[0]?.name).toBe('Delta 2')
  })
})

describe('pagination, stripping and caching (TSK-0010, HH-API-05, HH-API-01)', () => {
  it('[HH-API-05] the page size is capped and the cursor walks every row once', async () => {
    await sql`INSERT INTO public.api_widgets (name) SELECT 'Bulk ' || g FROM generate_series(1, 120) g`.execute(t.db)
    const total = await count('public.api_widgets')
    const first = await app.inject({ url: '/api/v1/widgets?limit=500', headers: owner })
    const body = first.json() as { items: { id: number }[]; nextCursor: string }
    expect(body.items).toHaveLength(100)
    const second = await app.inject({ url: `/api/v1/widgets?limit=500&cursor=${body.nextCursor}`, headers: owner })
    const rest = second.json() as { items: { id: number }[]; nextCursor: string | null }
    expect(rest.items).toHaveLength(total - 100)
    expect(rest.nextCursor).toBeNull()
    expect(new Set([...body.items, ...rest.items].map((w) => w.id)).size).toBe(total)
    expect(first.headers['cache-control']).toBe('private, no-store')
  })

  it('[HH-API-01][HH-ARC-04] unknown response fields are stripped', async () => {
    const res = await app.inject({ url: '/api/v1/widgets/1', headers: owner })
    expect(res.statusCode).toBe(200)
    expect(Object.keys(res.json()).sort()).toEqual(['id', 'name', 'version'])
    expect(res.body).not.toContain('internal')
  })

  it('[RULE-SERVER-AUTHZ][T19] a missing record and a record outside a customer scope answer the same not-found', async () => {
    const missing = await app.inject({ url: '/api/v1/widgets/999999', headers: owner })
    const outside = await app.inject({ url: '/api/v1/widgets/1', headers: { 'x-test-actor': 'customer' } })
    for (const res of [missing, outside]) {
      expect(res.statusCode).toBe(404)
      expect(res.json().error).toMatchObject({
        code: 'NOT_FOUND',
        message: 'We could not find what you were looking for.',
      })
    }
  })
})
