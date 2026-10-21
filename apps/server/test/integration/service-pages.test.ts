// Service pages are served only for services the public site may show (TSK-0021; HH-CUS-02, HH-SVC-02, OWN-DEC-84).
// The site directory holds synthetic pages; the registry is the real seed in a test database.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isPublicServiceSlug, loadServiceSeed, syncServices } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { testConfig } from '../fixtures/env.js'

const siteDir = mkdtempSync(join(tmpdir(), 'site-services-'))
mkdirSync(join(siteDir, 'services'))
writeFileSync(join(siteDir, 'services.html'), '<!doctype html><title>t</title><h1>Synthetic catalog</h1>')
for (const slug of ['drywall-patching', 'interior-painting', 'routine-cleaning'])
  writeFileSync(join(siteDir, 'services', `${slug}.html`), `<!doctype html><title>t</title><h1>Synthetic ${slug}</h1>`)

let t: TestDatabase
let ci: FastifyInstance
let production: FastifyInstance
beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
  // DW-01 shown on staging; PT-01 approved and published for production; CL-01 stays a draft.
  await t.db.updateTable('catalog.services').set({ public_status: 'staging' }).where('id', '=', 'SVC-DW-01').execute()
  await t.db
    .updateTable('catalog.services')
    .set({ public_status: 'published', published_version: 1 })
    .where('id', '=', 'SVC-PT-01')
    .execute()
  ci = await buildApp({ config: { ...testConfig(), siteDir }, api: { db: t.db } })
  production = await buildApp({ config: { ...testConfig(), env: 'production', siteDir }, api: { db: t.db } })
})
afterAll(async () => {
  await ci?.close()
  await production?.close()
  await t?.drop()
  rmSync(siteDir, { recursive: true, force: true })
})

describe('service pages by publication state (TSK-0021)', () => {
  it('[HH-CUS-02][OWN-DEC-84] ci and staging serve staged and published services; a draft is a 404', async () => {
    const dw = await ci.inject({ method: 'GET', url: '/services/drywall-patching' })
    expect(dw.statusCode).toBe(200)
    expect(dw.body).toContain('Synthetic drywall-patching')
    expect(dw.headers['cache-control']).toBe('no-cache')
    expect((await ci.inject({ method: 'GET', url: '/services/interior-painting' })).statusCode).toBe(200)
    expect((await ci.inject({ method: 'GET', url: '/services/routine-cleaning' })).statusCode).toBe(404)
    expect((await ci.inject({ method: 'GET', url: '/services/routine-cleaning.html' })).statusCode).toBe(404)
    expect((await ci.inject({ method: 'GET', url: '/services/no-such-service' })).statusCode).toBe(404)
    expect((await ci.inject({ method: 'GET', url: '/services' })).statusCode).toBe(200)
  })

  it('[HH-CUS-02][OWN-DEC-84] production serves only owner-approved, published services', async () => {
    expect((await production.inject({ method: 'GET', url: '/services/interior-painting' })).statusCode).toBe(200)
    expect((await production.inject({ method: 'GET', url: '/services/drywall-patching' })).statusCode).toBe(404)
    expect((await production.inject({ method: 'GET', url: '/services/routine-cleaning' })).statusCode).toBe(404)
  })

  it('[HH-SVC-02] the page rule matches the public service list, environment by environment', async () => {
    expect(await isPublicServiceSlug(t.db, 'staging', 'drywall-patching')).toBe(true)
    expect(await isPublicServiceSlug(t.db, 'local', 'interior-painting')).toBe(true)
    expect(await isPublicServiceSlug(t.db, 'production', 'drywall-patching')).toBe(false)
    expect(await isPublicServiceSlug(t.db, 'production', 'interior-painting')).toBe(true)
    expect(await isPublicServiceSlug(t.db, 'ci', 'routine-cleaning')).toBe(false)
  })

  it('[HH-CUS-02] without a database no service page is served (unknown is not safe)', async () => {
    const noDb = await buildApp({ config: { ...testConfig(), siteDir } })
    expect((await noDb.inject({ method: 'GET', url: '/services/drywall-patching' })).statusCode).toBe(404)
    await noDb.close()
  })
})
