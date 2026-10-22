// County URLs, the sitemap, robots.txt and the not-found and error pages against PostgreSQL 16 (TSK-0023; HH-CUS-04,
// HH-CUS-05, T08, OWN-DEC-37, OWN-DEC-57, OWN-DEC-73). The site directory holds synthetic pages; the registry is the
// real seed in a test database. Host names are synthetic (RULE-SYNTHETIC-DATA).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDb, loadServiceSeed, syncServices, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { countySlug, SERVICE_AREA } from '@handyhub/domain/areas'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { testConfig } from '../fixtures/env.js'
import { createStaffUser } from '../../src/modules/identity/accounts.js'
import { recordPolicyVersion } from '../../src/platform/config/index.js'

const NOINDEX = '<meta name="robots" content="noindex, nofollow" />'
const page = (h1: string, head = '') => `<!doctype html><html><head>${head}<title>t</title></head><h1>${h1}</h1></html>`

const siteDir = mkdtempSync(join(tmpdir(), 'site-search-'))
mkdirSync(join(siteDir, 'services'))
mkdirSync(join(siteDir, 'areas'))
writeFileSync(join(siteDir, 'index.html'), page('Synthetic home'))
writeFileSync(join(siteDir, 'services.html'), page('Synthetic catalog'))
writeFileSync(join(siteDir, 'areas.html'), page('Synthetic areas'))
writeFileSync(join(siteDir, 'request.html'), page('Synthetic request form', NOINDEX))
writeFileSync(join(siteDir, '404.html'), page('Synthetic not found', NOINDEX))
writeFileSync(join(siteDir, '500.html'), page('Synthetic error', NOINDEX))
for (const slug of ['drywall-patching', 'interior-painting', 'routine-cleaning'])
  writeFileSync(join(siteDir, 'services', `${slug}.html`), page(`Synthetic ${slug}`))
// A stray county page in the build, without approved local content: never served, never listed (OWN-DEC-57).
writeFileSync(join(siteDir, 'areas', 'oldham-county-ky.html'), page('Synthetic unverified county page'))

let t: TestDatabase
let ci: FastifyInstance
let production: FastifyInstance
let split: FastifyInstance
beforeAll(async () => {
  t = await createTestDatabase()
  // The registry publishes every quality-reviewed version (TSK-0132, OWN-DEC-180). For the environment rule: DW-01 is
  // moved back to staging only, CL-01 to a draft; PT-01 stays published with its reviewed, approved version.
  await syncServices(t.db, loadServiceSeed())
  await t.db.updateTable('catalog.services').set({ public_status: 'staging' }).where('id', '=', 'SVC-DW-01').execute()
  await t.db.updateTable('catalog.services').set({ public_status: 'draft' }).where('id', '=', 'SVC-CL-01').execute()
  await t.db
    .updateTable('catalog.services')
    .set({ public_status: 'published', published_version: 1 })
    .where('id', '=', 'SVC-PT-01')
    .execute()
  // TSK-0142: production is indexed only in launch phase 3. This throwaway database is moved there by a synthetic
  // Owner, one step at a time (phase 1 noindex is tested in launch-phase.test.ts).
  await withTx(t.db, async (tx) => {
    const owner = await createStaffUser(tx, {
      email: 'owner-search@example.test',
      displayName: 'Synthetic owner',
      locale: 'en',
      role: 'owner',
      issuedBy: 'test',
    })
    await tx
      .updateTable('identity.staff_users')
      .set({ status: 'active', activated_at: new Date() })
      .where('id', '=', owner.id)
      .execute()
    for (const phase of ['invited_customers', 'public'] as const)
      await recordPolicyVersion(tx, {
        key: 'launch.phase',
        value: { phase },
        sourceIds: ['TEST-SYNTHETIC'],
        changedBy: owner.id,
        reason: 'synthetic test configuration',
      })
  })
  ci = await buildApp({ config: { ...testConfig(), siteDir }, api: { db: t.db } })
  ci.get('/synthetic-failure', async () => {
    throw new Error('synthetic page failure')
  })
  production = await buildApp({
    config: { ...testConfig(), env: 'production', noindex: false, siteDir },
    api: { db: t.db },
  })
  split = await buildApp({
    config: {
      ...testConfig({ PUBLIC_ORIGIN: 'https://public.example.test', STAFF_ORIGIN: 'https://staff.example.test' }),
      env: 'production',
      noindex: false,
      siteDir,
    },
    api: { db: t.db },
  })
})
afterAll(async () => {
  await ci?.close()
  await production?.close()
  await split?.close()
  await t?.drop()
  rmSync(siteDir, { recursive: true, force: true })
})

const locs = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1] ?? '').pathname)

describe('county URLs (TSK-0023, HH-CUS-04, T08)', () => {
  it('[HH-CUS-04][T08] every county URL without its own page answers 301 to its anchor on the Areas page', async () => {
    for (const c of SERVICE_AREA) {
      const slug = countySlug(c)
      const res = await ci.inject({ method: 'GET', url: `/areas/${slug}` })
      expect(res.statusCode, slug).toBe(301)
      expect(res.headers['location'], slug).toBe(`/areas#${slug}`)
    }
    expect((await ci.inject({ method: 'GET', url: '/areas/jefferson-county-in' })).headers['location']).toBe(
      '/areas#jefferson-county-in',
    )
    // Earlier forms of the same URL keep working.
    for (const url of ['/areas/Jefferson-County-KY', '/areas/jefferson-county-ky/', '/areas/jefferson-county-ky.html'])
      expect((await ci.inject({ method: 'GET', url })).headers['location'], url).toBe('/areas#jefferson-county-ky')
  })

  it('[T08][OWN-DEC-57] a built county page without approved local content is never served', async () => {
    const res = await ci.inject({ method: 'GET', url: '/areas/oldham-county-ky' })
    expect(res.statusCode).toBe(301)
    expect(res.body).not.toContain('Synthetic unverified county page')
  })

  it('[HH-CUS-04] a county outside the service area has no URL: the not-found page', async () => {
    for (const url of ['/areas/lake-county-in', '/areas/jefferson-county-oh', '/areas/x/y']) {
      const res = await ci.inject({ method: 'GET', url })
      expect(res.statusCode, url).toBe(404)
      expect(res.body, url).toContain('Synthetic not found')
    }
    expect((await ci.inject({ method: 'GET', url: '/areas' })).statusCode).toBe(200)
  })

  it('[HH-CUS-04] the site lists exactly the counties of the coverage.area configuration (migration 0015)', async () => {
    const row = await t.db
      .selectFrom('platform.policy_version')
      .select(['value'])
      .where('key', '=', 'coverage.area')
      .orderBy('version', 'desc')
      .executeTakeFirstOrThrow()
    const configured = (row.value as { counties: { state: string; county: string }[] }).counties
    expect(SERVICE_AREA.map((c) => ({ state: c.state, county: c.county }))).toEqual(configured)
  })
})

describe('sitemap.xml (TSK-0023, HH-CUS-04, HH-CUS-05)', () => {
  it('[HH-CUS-05][T08] lists only existing, public, indexable pages, with the services shown in this environment', async () => {
    const res = await ci.inject({ method: 'GET', url: '/sitemap.xml' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toMatch(/^application\/xml/)
    expect(res.body).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www.sitemaps.org/)
    expect(locs(res.body)).toEqual([
      '/',
      '/areas',
      '/services',
      '/services/drywall-patching',
      '/services/interior-painting',
    ])
    // Absolute URLs on the request's own origin in ci.
    expect(res.body).toContain('<loc>http://localhost/</loc>')
  })

  it('[HH-CUS-05][OWN-DEC-180] production lists only the published services with an approved version', async () => {
    const res = await production.inject({ method: 'GET', url: '/sitemap.xml', headers: { host: 'www.example.test' } })
    expect(locs(res.body)).toEqual(['/', '/areas', '/services', '/services/interior-painting'])
    expect(res.body).toContain('<loc>https://www.example.test/areas</loc>')
    expect(res.headers['x-robots-tag']).toBeUndefined()
  })

  it('[HH-CUS-05] two origins: the sitemap uses PUBLIC_ORIGIN, and the staff host has none', async () => {
    const pub = await split.inject({ method: 'GET', url: '/sitemap.xml', headers: { host: 'public.example.test' } })
    expect(pub.statusCode).toBe(200)
    expect(pub.body).toContain('<loc>https://public.example.test/</loc>')
    const staff = await split.inject({ method: 'GET', url: '/sitemap.xml', headers: { host: 'staff.example.test' } })
    expect(staff.statusCode).toBe(404)
  })

  it('[HH-CUS-05] without a database no service page is listed, as none is served', async () => {
    const noDb = await buildApp({ config: { ...testConfig(), siteDir } })
    expect(locs((await noDb.inject({ method: 'GET', url: '/sitemap.xml' })).body)).toEqual(['/', '/areas', '/services'])
    await noDb.close()
  })
})

describe('robots.txt and noindex (TSK-0023, HH-CUS-05, OWN-DEC-73)', () => {
  it('[HH-CUS-05] production robots.txt names the sitemap and keeps crawlers off the API', async () => {
    const res = await split.inject({ method: 'GET', url: '/robots.txt', headers: { host: 'public.example.test' } })
    expect(res.statusCode).toBe(200)
    expect(res.body).toBe('User-agent: *\nDisallow: /api/\n\nSitemap: https://public.example.test/sitemap.xml\n')
    const staff = await split.inject({ method: 'GET', url: '/robots.txt', headers: { host: 'staff.example.test' } })
    expect(staff.body).toBe('User-agent: *\nDisallow: /\n')
  })

  it('[HH-CUS-05][RULE-SYNTHETIC-DATA] outside production robots.txt disallows everything', async () => {
    expect((await ci.inject({ method: 'GET', url: '/robots.txt' })).body).toBe('User-agent: *\nDisallow: /\n')
  })

  it('[HH-CUS-05] in production private routes and request drafts are noindex; public pages are indexable', async () => {
    for (const url of ['/request', '/request?service=SVC-DW-01', '/portal/', '/staff/', '/access/x', '/project/x'])
      expect((await production.inject({ method: 'GET', url })).headers['x-robots-tag'], url).toBe('noindex, nofollow')
    for (const url of ['/', '/areas', '/services', '/sitemap.xml'])
      expect((await production.inject({ method: 'GET', url })).headers['x-robots-tag'], url).toBeUndefined()
  })
})

describe('not-found and error pages (TSK-0023, HH-CUS-05)', () => {
  it('[HH-CUS-05] a missing public page answers 404 with the site not-found page', async () => {
    for (const url of ['/no-such-page', '/services/routine-cleaning', '/services/routine-cleaning.html']) {
      const res = await ci.inject({ method: 'GET', url })
      expect(res.statusCode, url).toBe(404)
      expect(res.headers['content-type'], url).toMatch(/^text\/html/)
      expect(res.body, url).toContain('Synthetic not found')
      expect(res.headers['cache-control'], url).toBe('no-store')
    }
  })

  it('[HH-CUS-05] a missing asset or API route keeps its plain answer, never the page', async () => {
    const asset = await ci.inject({ method: 'GET', url: '/_astro/missing.js' })
    expect(asset.statusCode).toBe(404)
    expect(asset.body).not.toContain('Synthetic not found')
    const api = await ci.inject({ method: 'GET', url: '/api/v1/public/no-such-route' })
    expect(api.statusCode).toBe(404)
    expect(api.json().error.code).toBe('NOT_FOUND')
  })

  it('[HH-CUS-05] a failing public page answers 500 with the site error page, naming no cause', async () => {
    const res = await ci.inject({ method: 'GET', url: '/synthetic-failure' })
    expect(res.statusCode).toBe(500)
    expect(res.body).toContain('Synthetic error')
    expect(res.body).not.toContain('synthetic page failure')
  })

  it('[HH-CUS-05] while the database is down a service page answers 503 with the error page; the sitemap a plain 503', async () => {
    const down = createDb('postgres://synthetic:synthetic@127.0.0.1:1/none', { max: 1 })
    const app = await buildApp({ config: { ...testConfig(), siteDir }, api: { db: down } })
    const service = await app.inject({ method: 'GET', url: '/services/drywall-patching' })
    expect(service.statusCode).toBe(503)
    expect(service.body).toContain('Synthetic error')
    // A crawler retries a 503 later; an incomplete sitemap is never sent.
    const sitemap = await app.inject({ method: 'GET', url: '/sitemap.xml' })
    expect(sitemap.statusCode).toBe(503)
    expect(sitemap.body).toBe('Unavailable')
    await app.close()
    await down.destroy()
  })
})
