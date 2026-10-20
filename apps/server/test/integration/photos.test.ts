// Request photos against PostgreSQL 16 and the fake object storage (TSK-0031; HH-INT-04, HH-INT-05, HH-INT-06, HH-INT-07,
// HH-SEC-05, T13, T14, T15). Every image is built in code and every visitor is synthetic (RULE-SYNTHETIC-DATA).
import { loadServiceSeed, syncServices } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import type { CustomerActor, StaffActor } from '@handyhub/policy'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import type { RequestActor } from '../../src/api/route.js'
import { contentProblems, photoProcessAutomation, sniff } from '../../src/modules/photos/index.js'
import { createAutomationRegistry } from '../../src/platform/automation.js'
import { createWorker } from '../../src/platform/jobs.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { testConfig } from '../fixtures/env.js'
import { jpeg, pdf, png, webp } from '../fixtures/images.js'

const MiB = 1024 * 1024
let t: TestDatabase
let app: FastifyInstance
const storage = new FakeObjectStorage()
let ip = 1
const nextIp = () => `203.0.113.${(ip = (ip % 250) + 1)}`

const staff: StaffActor = {
  kind: 'staff',
  userId: 'staff-synthetic-office',
  roles: ['office'],
  capabilities: [],
  status: 'active',
  freshAuth: false,
}
let customerProject = ''
const customer = (): CustomerActor => ({
  kind: 'customer',
  contactId: 'contact-synthetic',
  projectAccess: [{ projectId: customerProject, via: 'grant' }],
  freshVerification: false,
})
const resolveActor = async (req: { headers: Record<string, unknown> }): Promise<RequestActor> => {
  const who = req.headers['x-test-actor']
  if (who === 'staff') return { actor: staff }
  if (who === 'customer') return { actor: customer() }
  return { actor: { kind: 'guest' } }
}

beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
  app = await buildApp({ config: testConfig({ TRUST_PROXY_HOPS: '1' }), api: { db: t.db, storage, resolveActor } })
})
afterAll(async () => {
  await app?.close()
  await t?.drop()
})

const newDraft = async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/public/request-drafts',
    headers: { 'x-forwarded-for': nextIp() },
  })
  expect(res.statusCode).toBe(201)
  return res.json<{
    capability: string
    expiresAt: string
    limits: { maxFileBytes: number; maxPhotos: number; types: string[] }
  }>()
}
const upload = (capability: string, bytes: Buffer, type: string) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/public/request-drafts/photos',
    headers: { 'upload-capability': capability, 'content-type': type, 'x-forwarded-for': nextIp() },
    payload: bytes,
  })
const list = (capability: string) =>
  app.inject({
    method: 'GET',
    url: '/api/v1/public/request-drafts/photos',
    headers: { 'upload-capability': capability },
  })
const process = () =>
  createWorker({ db: t.db, registry: createAutomationRegistry([photoProcessAutomation(storage)]) }).runOnce()
const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
const requestBody = (photoDraft?: string) => ({
  formVersion: 'test-1',
  privacyNoticeVersion: 'draft-test-1',
  services: [],
  notSure: true,
  description: 'Synthetic project with photos.',
  property: { street: '100 Synthetic Way', city: 'Testville', state: 'KY', zip: '40000', propertyType: 'house' },
  timing: { preferredDate: future, flexible: false, needHelpToday: false, windows: ['mornings'] },
  estimatePreference: 'let_handyhub_decide',
  contact: {
    fullName: 'Test Customer',
    email: 'photos@example.test',
    phone: '(502) 555-0150',
    preferredChannel: 'email',
  },
  smsOptIn: false,
  marketingOptIn: false,
  ...(photoDraft ? { photoDraft } : {}),
})

describe('draft upload capability (TSK-0031, HH-INT-05)', () => {
  it('is created for one draft with the configured limits and draft period, and only its hash is stored', async () => {
    const d = await newDraft()
    expect(d.capability).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(d.limits).toEqual({
      maxFileBytes: 15 * MiB,
      maxPhotos: 10,
      types: ['image/jpeg', 'image/png', 'image/webp'],
    })
    expect(Math.round((Date.parse(d.expiresAt) - Date.now()) / 86_400_000)).toBe(7)
    const rows = await t.db.selectFrom('intake.upload_capabilities').selectAll().execute()
    expect(JSON.stringify(rows)).not.toContain(d.capability)
  })

  it("[T15] another draft's photos, unknown or missing capabilities and existing projects answer like missing records", async () => {
    const a = await newDraft()
    const b = await newDraft()
    const photo = (await upload(a.capability, png(1), 'image/png')).json<{ id: string }>()
    expect((await list(b.capability)).json()).toEqual({ photos: [] })
    const removeWithB = await app.inject({
      method: 'DELETE',
      url: `/api/v1/public/request-drafts/photos/${photo.id}`,
      headers: { 'upload-capability': b.capability },
    })
    expect(removeWithB.statusCode).toBe(404)
    for (const headers of [{}, { 'upload-capability': 'x'.repeat(43) }, { 'upload-capability': 'short' }]) {
      const res = await app.inject({ method: 'GET', url: '/api/v1/public/request-drafts/photos', headers })
      expect(res.statusCode).toBe(404)
      expect(res.json().error.code).toBe('NOT_FOUND')
    }
    const submitted = await app.inject({
      method: 'POST',
      url: '/api/v1/public/requests',
      headers: { 'idempotency-key': 'synthetic-photos-t15-0001', 'x-forwarded-for': nextIp() },
      payload: requestBody(),
    })
    const requestId = (
      await t.db
        .selectFrom('intake.requests')
        .select('id')
        .where('reference', '=', submitted.json().reference)
        .executeTakeFirstOrThrow()
    ).id
    const asGuest = await app.inject({
      method: 'GET',
      url: `/api/v1/customer/requests/${requestId}/photos`,
      headers: { 'upload-capability': a.capability },
    })
    const missing = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/requests/00000000-0000-4000-8000-000000000000/photos',
    })
    expect([asGuest.statusCode, missing.statusCode]).toEqual([404, 404])
    expect(asGuest.json().error.code).toBe(missing.json().error.code)
  })
})

describe('server-side validation of photos (TSK-0031, HH-INT-06, T14)', () => {
  it('accepts JPEG, PNG and WebP, quarantined until processing marks them ready; a repeat is the same photo', async () => {
    const d = await newDraft()
    const results = [
      await upload(d.capability, jpeg(), 'image/jpeg'),
      await upload(d.capability, png(2), 'image/png'),
      await upload(d.capability, webp(), 'image/webp'),
    ]
    expect(results.map((r) => r.statusCode)).toEqual([201, 201, 201])
    expect(results.map((r) => r.json().state)).toEqual(['quarantined', 'quarantined', 'quarantined'])
    const again = await upload(d.capability, png(2), 'image/png')
    expect(again.statusCode).toBe(200)
    expect(again.json().id).toBe(results[1]?.json().id)
    await process()
    expect((await list(d.capability)).json().photos.map((p: { state: string }) => p.state)).toEqual([
      'ready',
      'ready',
      'ready',
    ])
  })

  it('accepts a 15 MiB JPEG and refuses one byte more, using the configured limit', async () => {
    const d = await newDraft()
    expect((await upload(d.capability, jpeg(15 * MiB), 'image/jpeg')).statusCode).toBe(201)
    const over = await upload(d.capability, jpeg(15 * MiB + 1), 'image/jpeg')
    expect(over.statusCode).toBe(413)
    expect(over.json().error.code).toBe('PAYLOAD_TOO_LARGE')
  })

  it('refuses a PDF, a non-image, a mismatched type, appended data and markup, storing nothing', async () => {
    const d = await newDraft()
    const before = await t.db.selectFrom('intake.photos').select('id').execute()
    expect((await upload(d.capability, pdf(), 'application/pdf')).statusCode).toBe(415)
    expect((await upload(d.capability, pdf(), 'image/jpeg')).statusCode).toBe(415)
    const mismatch = await upload(d.capability, png(3), 'image/jpeg')
    expect(mismatch.statusCode).toBe(400)
    expect(mismatch.json().error.fieldErrors[0].code).toBe('type_mismatch')
    const polyglot = await upload(
      d.capability,
      Buffer.concat([png(4), Buffer.from('<script>alert(1)</script>')]),
      'image/png',
    )
    expect(polyglot.json().error.fieldErrors[0].code).toBe('trailing_data')
    const truncated = await upload(d.capability, png(5).subarray(0, 30), 'image/png')
    expect(truncated.json().error.fieldErrors[0].code).toBe('malformed')
    expect(await t.db.selectFrom('intake.photos').select('id').execute()).toHaveLength(before.length)
  })

  it('refuses an 11th photo; a removed photo frees its place', async () => {
    const d = await newDraft()
    const ids: string[] = []
    for (let i = 0; i < 10; i++) ids.push((await upload(d.capability, png(100 + i), 'image/png')).json().id)
    const eleventh = await upload(d.capability, png(200), 'image/png')
    expect(eleventh.statusCode).toBe(400)
    expect(eleventh.json().error.fieldErrors[0].code).toBe('too_many')
    const removed = await app.inject({
      method: 'DELETE',
      url: `/api/v1/public/request-drafts/photos/${ids[0]}`,
      headers: { 'upload-capability': d.capability },
    })
    expect(removed.json()).toEqual({ removed: true })
    expect((await upload(d.capability, png(200), 'image/png')).statusCode).toBe(201)
  })

  it('the content check recognises types by their bytes, never by name', () => {
    expect([sniff(png()), sniff(jpeg()), sniff(webp()), sniff(pdf())]).toEqual([
      'image/png',
      'image/jpeg',
      'image/webp',
      null,
    ])
    expect(contentProblems(png(), 'image/png')).toEqual([])
    expect(contentProblems(Buffer.concat([jpeg(), Buffer.from('<?php echo 1; ?>')]), 'image/jpeg')).toEqual([
      'trailing_data',
      'unsafe_content',
    ])
  })
})

describe('submission binds the draft photos; reads are authorized and short-lived (TSK-0031, HH-INT-07, HH-SEC-05, T13)', () => {
  it('[T13] binds ready and processing photos to the request, reports them, and consumes the draft capability', async () => {
    const d = await newDraft()
    const ready = (await upload(d.capability, png(300), 'image/png')).json()
    await process()
    const processing = (await upload(d.capability, png(301), 'image/png')).json()
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/public/requests',
      headers: { 'idempotency-key': 'synthetic-photos-t13-0001', 'x-forwarded-for': nextIp() },
      payload: requestBody(d.capability),
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().photos).toEqual({ received: 1, processing: 1, failed: 0 })
    const request = await t.db
      .selectFrom('intake.requests')
      .select(['id', 'project_id', 'original_submission'])
      .where('reference', '=', res.json().reference)
      .executeTakeFirstOrThrow()
    expect(JSON.stringify(request.original_submission)).not.toContain(d.capability)
    const bound = await t.db
      .selectFrom('intake.photos')
      .select(['id', 'request_id', 'project_id'])
      .where('id', 'in', [ready.id, processing.id])
      .execute()
    expect(bound.every((p) => p.request_id === request.id && p.project_id === request.project_id)).toBe(true)
    // The draft capability is used up: no more uploads or reads with it.
    expect((await upload(d.capability, png(302), 'image/png')).statusCode).toBe(404)
    expect((await list(d.capability)).statusCode).toBe(404)

    // Staff and the project's customer read the photos; only the ready one has a short-lived signed URL.
    customerProject = request.project_id
    for (const who of ['staff', 'customer']) {
      const read = await app.inject({
        method: 'GET',
        url: `/api/v1/${who}/requests/${request.id}/photos`,
        headers: { 'x-test-actor': who },
      })
      expect(read.statusCode).toBe(200)
      const photos = read.json().photos as { id: string; state: string; url: string | null }[]
      expect(photos.map((p) => [p.state, p.url === null])).toEqual([
        ['ready', false],
        ['quarantined', true],
      ])
      expect(photos[0]?.url).toContain('expires=')
      expect(read.headers['cache-control']).toBe('private, no-store')
    }
    customerProject = 'project-someone-else'
    const other = await app.inject({
      method: 'GET',
      url: `/api/v1/customer/requests/${request.id}/photos`,
      headers: { 'x-test-actor': 'customer' },
    })
    expect(other.statusCode).toBe(404)
  })

  it('a request is saved even when its photo capability is unknown or expired (a photo failure never loses it)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/public/requests',
      headers: { 'idempotency-key': 'synthetic-photos-lost-0001', 'x-forwarded-for': nextIp() },
      payload: requestBody('y'.repeat(43)),
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().photos).toEqual({ received: 0, processing: 0, failed: 0 })
  })

  it('originals never change and photo records are never deleted', async () => {
    const d = await newDraft()
    const p = (await upload(d.capability, png(400), 'image/png')).json()
    await expect(
      t.db.updateTable('intake.photos').set({ byte_size: 1 }).where('id', '=', p.id).execute(),
    ).rejects.toThrow(/PHOTO_ORIGINAL/)
    await expect(t.db.deleteFrom('intake.photos').where('id', '=', p.id).execute()).rejects.toThrow(/PHOTO_KEPT/)
  })
})
