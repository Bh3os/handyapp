// Customer projections and the customer surface contract (TSK-0037; HH-ARC-04, HH-PORT-01, HH-DATA-07, T24).
import { describe, expect, it } from 'vitest'
import type { JsonSchema, RouteDef } from '../../src/api/route.js'
import { MODULES } from '../../src/modules/index.js'
import {
  CUSTOMER_PHOTO,
  CUSTOMER_VIEWS,
  customerView,
  forbiddenForCustomer,
  listOf,
  PROJECT_GLANCE,
  ProjectionError,
} from '../../src/modules/records/index.js'

const routes = MODULES.flatMap((m) => m.routes)
/** Every property name anywhere in a schema. */
function fieldNames(schema: unknown, out: string[] = []): string[] {
  if (!schema || typeof schema !== 'object') return out
  const s = schema as Record<string, unknown>
  if (s['properties'] && typeof s['properties'] === 'object')
    for (const [k, v] of Object.entries(s['properties'] as Record<string, unknown>)) {
      out.push(k)
      fieldNames(v, out)
    }
  for (const k of ['items', 'anyOf', 'oneOf', 'allOf', 'additionalProperties']) {
    const v = s[k]
    if (Array.isArray(v)) for (const x of v) fieldNames(x, out)
    else fieldNames(v, out)
  }
  return out
}
const success = (r: RouteDef): JsonSchema[] =>
  Object.entries(r.schema.response)
    .filter(([status]) => Number(status) < 300)
    .map(([, s]) => s)

describe('customer projections (TSK-0037, HH-ARC-04, T24)', () => {
  it('[T24][HH-ARC-04] no public or customer surface response declares an internal field (deny-list)', () => {
    // The staff surface answers only on the staff host (its sign-in routes take guests, who become staff).
    const reachable = routes.filter((r) => !r.path.startsWith('/staff/'))
    expect(reachable.length).toBeGreaterThan(10)
    const leaks = reachable.flatMap((r) =>
      success(r).flatMap((s) =>
        fieldNames(s)
          .filter(forbiddenForCustomer)
          .map((f) => `${r.operationId}: ${f}`),
      ),
    )
    expect(leaks).toEqual([])
  })

  it('[HH-ARC-04][HH-PORT-01] every customer surface route answers with exactly one declared customer view', () => {
    const customerRoutes = routes.filter((r) => r.path.startsWith('/customer/'))
    expect(customerRoutes.map((r) => r.operationId).sort()).toEqual(
      ['getCustomerAccess', 'getCustomerProject', 'listCustomerRequestPhotos'].sort(),
    )
    for (const r of customerRoutes) {
      const view = r.projection ? CUSTOMER_VIEWS.get(r.projection.name) : undefined
      expect(view, r.operationId).toBeDefined()
      if (!view) continue
      expect(r.projection?.entity).toBe(view.entity)
      const shapes = [
        view.schema,
        ...Object.keys((success(r)[0]?.['properties'] ?? {}) as object).map((k) => listOf(k, view)),
      ]
      for (const s of success(r)) expect(shapes, r.operationId).toContainEqual(s)
    }
  })

  it('[HH-ARC-04] a view copies only its allow-listed fields; anything else on the record stays on the server', () => {
    const record = {
      id: 'photo-1',
      state: 'ready',
      contentType: 'image/png',
      byteSize: 10,
      rejectionReason: null,
      url: 'https://storage.example.test/signed',
      objectKey: 'requests/photos/photo-1',
      visibility: 'internal',
    }
    expect(CUSTOMER_PHOTO.project(record)).toEqual({
      id: 'photo-1',
      state: 'ready',
      contentType: 'image/png',
      byteSize: 10,
      rejectionReason: null,
      url: 'https://storage.example.test/signed',
    })
    const glance = PROJECT_GLANCE.project({
      reference: 'HH-0000TEST',
      submittedAt: new Date('2026-10-21T12:00:00Z'),
      requestState: 'new',
      services: ['Drywall'],
      notSure: false,
    })
    expect(glance).toEqual({
      reference: 'HH-0000TEST',
      submittedAt: '2026-10-21T12:00:00.000Z',
      requestState: 'new',
      services: ['Drywall'],
      notSure: false,
    })
    expect(PROJECT_GLANCE.schema).toMatchObject({ additionalProperties: false, required: Object.keys(glance) })
  })

  it('[HH-ARC-04][HH-DATA-07] a customer view cannot list an internal field', () => {
    for (const field of ['internalNote', 'costCents', 'marginCents', 'accessCode', 'objectKey', 'responsibleStaff'])
      expect(() => customerView('bad', 'Project', { [field]: { type: 'string' } }, () => ({ [field]: '' }))).toThrow(
        ProjectionError,
      )
    for (const field of ['reference', 'submittedAt', 'services', 'url', 'contentType'])
      expect(forbiddenForCustomer(field), field).toBe(false)
  })
})
