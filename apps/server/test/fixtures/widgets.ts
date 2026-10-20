// A synthetic API module for the framework tests (TSK-0010). Widgets live in a test-only table; nothing here is a
// business record. Staff routes use ROLE-MATRIX actions the Owner holds: customer.view (read) and customer.edit (write).
import type { Db } from '@handyhub/db'
import type { StaffActor } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError } from '../../src/api/errors.js'
import { pageSchema, toPage } from '../../src/api/pagination.js'
import type { ApiModule, RequestActor, RouteDef } from '../../src/api/route.js'
import { assertVersion } from '../../src/api/version.js'

export const OWNER: StaffActor = {
  kind: 'staff',
  userId: 'staff-synthetic-owner',
  roles: ['owner'],
  capabilities: [],
  status: 'active',
  freshAuth: false,
}
export const WORKER: StaffActor = { ...OWNER, userId: 'staff-synthetic-worker', roles: ['worker'] }

export async function createWidgetTable(db: Db): Promise<void> {
  await sql`CREATE TABLE public.api_widgets (
    id serial PRIMARY KEY,
    name text NOT NULL,
    version integer NOT NULL DEFAULT 1,
    internal_note text NOT NULL DEFAULT 'internal: never sent'
  )`.execute(db)
}

const widget = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'name', 'version'],
  properties: { id: { type: 'integer' }, name: { type: 'string' }, version: { type: 'integer' } },
} as const

const idParams = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: { id: { type: 'integer', minimum: 1 } },
} as const

const TEST = 'test/integration/api.test.ts'

/** The framework always supplies tx on writes and page on paginated reads; this narrows the type. */
function need<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('missing framework context')
  return value
}

type WidgetRow = { id: number; name: string; version: number; internal_note: string }

const routes: RouteDef[] = [
  {
    method: 'POST',
    path: '/staff/widgets',
    operationId: 'createWidget',
    summary: 'Create a widget',
    description: 'Synthetic write: one row and one audit event per idempotency key.',
    actors: ['staff'],
    permission: 'customer.edit',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'none',
    rateLimit: { bucket: 'staff-write', limit: 60, windowSeconds: 60 },
    audit: 'widget.create',
    pagination: false,
    test: TEST,
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['name'],
        properties: { name: { type: 'string', minLength: 1, maxLength: 40 }, fail: { type: 'boolean' } },
      },
      response: { 201: widget },
    },
    handler: async ({ tx, req, audit }) => {
      const body = req.body as { name: string; fail?: boolean }
      const row = await sql<WidgetRow>`INSERT INTO public.api_widgets (name) VALUES (${body.name}) RETURNING *`.execute(
        need(tx),
      )
      const created = row.rows[0] as WidgetRow
      await audit({ target: { type: 'widget', id: String(created.id), version: 1 } })
      if (body.fail) throw new Error('synthetic failure after the insert: SELECT secret FROM somewhere')
      return { status: 201, body: created, version: created.version }
    },
  },
  {
    method: 'PATCH',
    path: '/staff/widgets/:id',
    operationId: 'renameWidget',
    summary: 'Rename a widget',
    description: 'Synthetic write with an expected version (If-Match).',
    actors: ['staff'],
    permission: 'customer.edit',
    kind: 'write',
    idempotency: 'none',
    expectedVersion: 'required',
    rateLimit: 'none',
    audit: 'widget.rename',
    pagination: false,
    test: TEST,
    schema: {
      params: idParams,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['name'],
        properties: { name: { type: 'string', minLength: 1, maxLength: 40 } },
      },
      response: { 200: widget },
    },
    handler: async ({ tx, req, expectedVersion, audit }) => {
      const { id } = req.params as { id: number }
      const { name } = req.body as { name: string }
      const current = (
        await sql<WidgetRow>`SELECT * FROM public.api_widgets WHERE id = ${id} FOR UPDATE`.execute(need(tx))
      ).rows[0]
      if (!current) throw new ApiError('NOT_FOUND')
      assertVersion(expectedVersion(), current.version, { name: current.name })
      const next = (
        await sql<WidgetRow>`UPDATE public.api_widgets SET name = ${name}, version = version + 1 WHERE id = ${id} RETURNING *`.execute(
          need(tx),
        )
      ).rows[0] as WidgetRow
      await audit({
        target: { type: 'widget', id: String(id), version: next.version },
        summary: { changes: [{ field: 'name', from: current.name, to: name }] },
      })
      return { body: next, version: next.version }
    },
  },
  {
    method: 'GET',
    path: '/staff/widgets',
    operationId: 'listWidgets',
    summary: 'List widgets',
    description: 'Synthetic paginated read, ordered by id.',
    actors: ['staff'],
    permission: 'customer.view',
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'none',
    pagination: true,
    test: TEST,
    schema: { response: { 200: pageSchema(widget) } },
    handler: async ({ db, page }) => {
      const after = Number(need(page).after?.[0] ?? 0)
      const rows = (
        await sql<WidgetRow>`SELECT * FROM public.api_widgets WHERE id > ${after} ORDER BY id LIMIT ${need(page).limit + 1}`.execute(
          db,
        )
      ).rows
      return { body: toPage(rows, need(page), (r) => [r.id]) }
    },
  },
  {
    method: 'GET',
    path: '/staff/widgets/:id',
    operationId: 'getWidget',
    summary: 'Read a widget',
    description: 'Synthetic read; the internal note is never declared, so it never leaves the server.',
    actors: ['staff', 'customer'],
    permission: 'customer.view',
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'none',
    pagination: false,
    test: TEST,
    schema: { params: idParams, response: { 200: widget } },
    resource: async ({ req, db }) => {
      const { id } = req.params as { id: number }
      const found = await sql<{ id: number }>`SELECT id FROM public.api_widgets WHERE id = ${id}`.execute(db)
      return found.rows.length ? {} : null
    },
    handler: async ({ db, req }) => {
      const { id } = req.params as { id: number }
      const row = (await sql<WidgetRow>`SELECT * FROM public.api_widgets WHERE id = ${id}`.execute(db)).rows[0]
      if (!row) throw new ApiError('NOT_FOUND')
      return { body: row, version: row.version }
    },
  },
]

export const WIDGETS: ApiModule = { name: 'widgets', routes }

/** Resolves the caller from a test header: x-test-actor = owner | worker | customer | guest, x-test-locale = es. */
export async function testActor(req: {
  headers: Record<string, string | string[] | undefined>
}): Promise<RequestActor> {
  const who = req.headers['x-test-actor']
  const locale = req.headers['x-test-locale'] === 'es' ? 'es' : 'en'
  if (who === 'owner') return { actor: OWNER, locale }
  if (who === 'worker') return { actor: WORKER, locale }
  if (who === 'customer')
    return { actor: { kind: 'customer', contactId: 'contact-synthetic', projectAccess: [], freshVerification: false } }
  return { actor: { kind: 'guest' } }
}
