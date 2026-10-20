// Two origins against PostgreSQL 16 (TSK-0017; OWN-DEC-133, HH-ARC-06, HH-ARC-07, HH-SEC-02, FACT-DOMAIN). One server
// answers a synthetic public host and a synthetic staff host; accounts and pages are synthetic (RULE-SYNTHETIC-DATA).
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ApiModule } from '../../src/api/route.js'
import { buildApp } from '../../src/app.js'
import { apiModules } from '../../src/modules/index.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { startCustomerSession } from '../../src/modules/identity/customer-sessions.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { testConfig } from '../fixtures/env.js'

const PUBLIC = 'public.example.test'
const STAFF = 'staff.example.test'
const OWNER = 'owner-origins@example.test'
const pw = ['synthetic', 'origins', 'passphrase', '1'].join(' ')
const INLINE = 'document.documentElement.dataset.synthetic = "1"'

// A synthetic customer route: who the customer surface sees as the caller.
const WHOAMI: ApiModule = {
  name: 'synthetic-whoami',
  routes: [
    {
      method: 'GET',
      path: '/customer/synthetic/whoami',
      operationId: 'getSyntheticWhoami',
      summary: 'Synthetic customer route (tests only)',
      description: 'Customer only; answers the caller kind.',
      actors: ['customer'],
      permission: 'payment.view',
      kind: 'read',
      idempotency: 'none',
      expectedVersion: 'none',
      rateLimit: 'none',
      audit: 'none',
      pagination: false,
      test: 'test/integration/two-origins.test.ts',
      schema: { response: { 200: { type: 'object', properties: { kind: { type: 'string' } } } } },
      resource: async () => ({ projectId: 'project-o' }),
      handler: async ({ actor }) => ({ body: { kind: actor.kind } }),
    },
  ],
}

let t: TestDatabase
let app: FastifyInstance
let single: FastifyInstance
let dirs: string

type Res = {
  statusCode: number
  headers: Record<string, unknown>
  body: string
  json: () => ReturnType<typeof JSON.parse>
}
const on =
  (instance: () => FastifyInstance) =>
  (host: string, url: string, init: { method?: string; headers?: Record<string, string>; payload?: object } = {}) =>
    instance().inject({
      method: (init.method ?? 'GET') as 'GET',
      url,
      headers: { host, ...(init.headers ?? {}) },
      ...(init.payload ? { payload: init.payload } : {}),
    }) as Promise<Res>
const req = on(() => app)

beforeAll(async () => {
  t = await createTestDatabase()
  dirs = mkdtempSync(join(tmpdir(), 'origins-'))
  const site = join(dirs, 'site')
  const staff = join(dirs, 'staff')
  const portal = join(dirs, 'portal')
  for (const d of [site, join(staff, 'assets'), portal]) mkdirSync(d, { recursive: true })
  writeFileSync(
    join(site, 'index.html'),
    `<!doctype html><title>Site</title><h1>Synthetic site</h1><script>${INLINE}</script>`,
  )
  writeFileSync(join(site, 'request.html'), '<!doctype html><title>Request</title><h1>Synthetic request</h1>')
  writeFileSync(join(staff, 'index.html'), '<!doctype html><title>Staff</title><div id="root">Synthetic staff</div>')
  writeFileSync(join(staff, 'assets', 'app.js'), 'export {}')
  writeFileSync(join(portal, 'index.html'), '<!doctype html><title>Portal</title><div id="root">Synthetic portal</div>')
  writeFileSync(join(dirs, 'outside.txt'), 'outside')

  const modules = [...apiModules({ secureCookies: false, mfaKey: null }), WHOAMI]
  const config = { ...testConfig({ PUBLIC_ORIGIN: `http://${PUBLIC}`, STAFF_ORIGIN: `http://${STAFF}` }) }
  app = await buildApp({
    config: { ...config, siteDir: site, staffDir: staff, portalDir: portal },
    api: { db: t.db, modules },
  })
  // A provider webhook stands in for /webhooks/bird and /webhooks/resend (registered by boot.ts).
  app.post('/webhooks/synthetic', async () => ({ received: true }))
  single = await buildApp({
    config: { ...testConfig(), siteDir: site, staffDir: staff, portalDir: portal },
    api: { db: t.db, modules },
  })
  await withTx(t.db, async (tx) => {
    const owner = await createStaffUser(tx, {
      email: OWNER,
      displayName: 'Origins Owner',
      locale: 'en',
      role: 'owner',
      issuedBy: 'test',
    })
    await setPasswordHash(tx, owner.id, await hashPassword(pw))
  })
})
afterAll(async () => {
  await app?.close()
  await single?.close()
  await t?.drop()
  if (dirs) rmSync(dirs, { recursive: true, force: true })
})

const signIn = () =>
  req(STAFF, '/api/v1/staff/auth/sign-in', { method: 'POST', payload: { email: OWNER, password: pw } })
const customerCookie = async () => {
  const s = await withTx(t.db, (tx) =>
    startCustomerSession(tx, {
      contactRef: 'contact:o',
      via: 'grant',
      projectIds: ['project-o'],
      verifiedAt: new Date(),
    }),
  )
  return `__Host-hh_customer=${s.token}`
}

describe('API surfaces by host (TSK-0017, HH-ARC-06)', () => {
  it('[HH-ARC-06][OWN-DEC-133] the staff API on the public host is 404; on the staff host it answers', async () => {
    const wrong = await req(PUBLIC, '/api/v1/staff/auth/session')
    expect(wrong.statusCode).toBe(404)
    expect(wrong.json().error.code).toBe('NOT_FOUND')
    const signInOnPublic = await req(PUBLIC, '/api/v1/staff/auth/sign-in', {
      method: 'POST',
      payload: { email: OWNER, password: pw },
    })
    expect(signInOnPublic.statusCode).toBe(404)
    expect(signInOnPublic.headers['set-cookie']).toBeUndefined()
    expect((await req(STAFF, '/api/v1/staff/auth/session')).statusCode).toBe(401)
  })

  it('[HH-ARC-06] the public and customer APIs on the staff host are 404', async () => {
    const form = await req(STAFF, '/api/v1/public/request-form')
    expect(form.statusCode).toBe(404)
    expect(form.json().error.code).toBe('NOT_FOUND')
    expect((await req(PUBLIC, '/api/v1/public/request-form')).statusCode).not.toBe(404)
    expect((await req(STAFF, '/api/v1/customer/synthetic/whoami')).statusCode).toBe(404)
    expect((await req(PUBLIC, '/api/v1/customer/synthetic/whoami')).statusCode).toBe(401)
  })

  it('[HH-ARC-06] an unknown host serves nothing but the health checks', async () => {
    for (const url of ['/', '/api/v1/staff/auth/session', '/api/v1/public/request-form', '/staff/', '/portal/'])
      expect((await req('other.example.test', url)).statusCode, url).toBe(404)
    expect((await req('other.example.test', '/healthz')).statusCode).toBe(200)
    expect((await req(STAFF, '/healthz')).statusCode).toBe(200)
  })

  it('[HH-ARC-06] provider webhooks answer on the public host only', async () => {
    expect((await req(PUBLIC, '/webhooks/synthetic', { method: 'POST', payload: {} })).statusCode).toBe(200)
    expect((await req(STAFF, '/webhooks/synthetic', { method: 'POST', payload: {} })).statusCode).toBe(404)
  })
})

describe('host-only cookies and separate sessions (TSK-0017, HH-ARC-06, HH-SEC-02)', () => {
  it('[HH-ARC-06] a staff cookie is host-only, so the browser never sends it to the public host', async () => {
    const res = await signIn()
    expect(res.statusCode).toBe(200)
    const cookie = String(res.headers['set-cookie'])
    expect(cookie).toMatch(/^hh_staff=/)
    // No Domain attribute: the cookie belongs to the staff host alone (RFC 6265 host-only), never to a parent domain.
    expect(cookie).not.toMatch(/domain=/i)
    expect(cookie).toMatch(/SameSite=Strict/i)
  })

  it('[HH-ARC-06] a staff session presented on the public host is never a caller there', async () => {
    const res = await signIn()
    const cookie = String(res.headers['set-cookie']).split(';')[0] as string
    expect((await req(STAFF, '/api/v1/staff/auth/session', { headers: { cookie } })).statusCode).toBe(200)
    expect((await req(PUBLIC, '/api/v1/staff/auth/session', { headers: { cookie } })).statusCode).toBe(404)
    const whoami = await req(PUBLIC, '/api/v1/customer/synthetic/whoami', { headers: { cookie } })
    expect(whoami.statusCode).toBe(401)
    expect(whoami.json().error.code).toBe('UNAUTHENTICATED')
  })

  it('[HH-ARC-06] a customer session never reaches the staff API, on either host or a single host', async () => {
    const cookie = await customerCookie()
    const own = await req(PUBLIC, '/api/v1/customer/synthetic/whoami', { headers: { cookie } })
    expect(own.json()).toEqual({ kind: 'customer' })
    expect((await req(STAFF, '/api/v1/staff/auth/session', { headers: { cookie } })).statusCode).toBe(401)
    const one = on(() => single)
    expect((await one('localhost', '/api/v1/staff/auth/session', { headers: { cookie } })).statusCode).toBe(401)
    expect((await one('localhost', '/api/v1/customer/synthetic/whoami', { headers: { cookie } })).json()).toEqual({
      kind: 'customer',
    })
  })

  it('[HH-ARC-06] on a single host a staff session still never acts as a customer', async () => {
    const res = await signIn()
    const cookie = String(res.headers['set-cookie']).split(';')[0] as string
    const one = on(() => single)
    expect((await one('localhost', '/api/v1/staff/auth/session', { headers: { cookie } })).statusCode).toBe(200)
    expect((await one('localhost', '/api/v1/customer/synthetic/whoami', { headers: { cookie } })).statusCode).toBe(401)
  })
})

describe('no CORS (TSK-0017, HH-ARC-07)', () => {
  it('[HH-ARC-07] a preflight request gets no CORS allowance on either host', async () => {
    const preflight = {
      method: 'OPTIONS',
      headers: {
        origin: 'https://attacker.example.test',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type, x-csrf-token',
      },
    }
    for (const [host, url] of [
      [STAFF, '/api/v1/staff/auth/sign-in'],
      [PUBLIC, '/api/v1/public/requests'],
      [PUBLIC, '/api/v1/staff/auth/sign-in'],
      [PUBLIC, '/'],
    ] as const) {
      const res = await req(host, url, preflight)
      expect(res.statusCode, `${host}${url}`).toBeGreaterThanOrEqual(400)
      for (const name of Object.keys(res.headers)) expect(name, `${host}${url}`).not.toMatch(/^access-control-/)
    }
  })

  it('[HH-ARC-07] a cross-site write is refused even with a session, and gets no CORS header', async () => {
    const res = await req(STAFF, '/api/v1/staff/auth/sign-in', {
      method: 'POST',
      headers: { origin: `http://${PUBLIC}`, 'sec-fetch-site': 'same-site' },
      payload: { email: OWNER, password: pw },
    })
    expect(res.statusCode).toBe(403)
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })
})

describe('pages by host (TSK-0017, HH-ARC-06)', () => {
  it('[HH-ARC-06] the staff host serves the staff app at its root and its /staff asset paths', async () => {
    for (const url of ['/', '/sign-in', '/invite/abc', '/staff/sign-in']) {
      const res = await req(STAFF, url)
      expect(res.statusCode, url).toBe(200)
      expect(res.body, url).toContain('Synthetic staff')
    }
    expect((await req(STAFF, '/staff/assets/app.js')).body).toBe('export {}')
    expect((await req(STAFF, '/assets/missing.js')).statusCode).toBe(404)
    expect((await req(STAFF, '/portal/')).body).toContain('Synthetic staff')
  })

  it('[HH-ARC-06] the public host serves the site and /portal, never the staff app', async () => {
    expect((await req(PUBLIC, '/')).body).toContain('Synthetic site')
    expect((await req(PUBLIC, '/request')).body).toContain('Synthetic request')
    expect((await req(PUBLIC, '/portal/')).body).toContain('Synthetic portal')
    expect((await req(PUBLIC, '/portal/account')).body).toContain('Synthetic portal')
    expect((await req(PUBLIC, '/portal')).statusCode).toBe(302)
    for (const url of ['/staff/', '/staff/sign-in', '/staff/assets/app.js'])
      expect((await req(PUBLIC, url)).statusCode, url).toBe(404)
  })

  it('[HH-ARC-06] a single host serves the staff app under /staff, the portal and the site', async () => {
    const one = on(() => single)
    expect((await one('127.0.0.1:4310', '/staff')).statusCode).toBe(302)
    expect((await one('127.0.0.1:4310', '/staff/sign-in')).body).toContain('Synthetic staff')
    expect((await one('127.0.0.1:4310', '/staff/assets/app.js')).body).toBe('export {}')
    expect((await one('127.0.0.1:4310', '/portal/')).body).toContain('Synthetic portal')
    expect((await one('127.0.0.1:4310', '/')).body).toContain('Synthetic site')
  })

  it('[HH-SEC-02] a path never reaches a file outside the served directory', async () => {
    for (const url of [
      '/..%2foutside.txt',
      '/%2e%2e/outside.txt',
      '/staff/..%2f..%2foutside.txt',
      '/portal/%2e%2e%2f%2e%2e%2foutside.txt',
    ])
      for (const host of [PUBLIC, STAFF]) {
        const res = await req(host, url)
        expect(res.body, `${host}${url}`).not.toBe('outside')
      }
  })
})

describe('security headers (TSK-0017, HH-SEC-02)', () => {
  it('[HH-SEC-02] every response denies framing and carries a same-origin CSP with the inline script hash', async () => {
    const hash = createHash('sha256').update(INLINE).digest('base64')
    for (const [host, url] of [
      [PUBLIC, '/'],
      [PUBLIC, '/portal/'],
      [STAFF, '/'],
      [STAFF, '/api/v1/staff/auth/session'],
    ] as const) {
      const res = await req(host, url)
      expect(res.headers['x-frame-options'], url).toBe('DENY')
      expect(res.headers['x-content-type-options'], url).toBe('nosniff')
      const csp = String(res.headers['content-security-policy'])
      expect(csp).toContain("frame-ancestors 'none'")
      expect(csp).toContain("default-src 'self'")
      expect(csp).toContain(`script-src 'self' 'sha256-${hash}'`)
      expect(csp).not.toContain('unsafe-inline')
    }
  })

  it('[HH-SEC-02] private routes send no referrer and are noindex; the public site keeps a referrer origin', async () => {
    for (const [host, url] of [
      [STAFF, '/'],
      [STAFF, '/sign-in'],
      [PUBLIC, '/portal/'],
      [PUBLIC, '/api/v1/public/request-form'],
    ] as const) {
      const res = await req(host, url)
      expect(res.headers['referrer-policy'], `${host}${url}`).toBe('no-referrer')
      expect(res.headers['x-robots-tag'], `${host}${url}`).toBe('noindex, nofollow')
    }
    expect((await req(PUBLIC, '/')).headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
  })

  it('[HH-SEC-02] no HSTS over plain http in ci (staging and production: test/unit/hosts.test.ts)', async () => {
    expect((await req(PUBLIC, '/')).headers['strict-transport-security']).toBeUndefined()
  })

  it('[HH-SEC-02] robots.txt on the staff host disallows everything', async () => {
    const res = await req(STAFF, '/robots.txt')
    expect(res.statusCode).toBe(200)
    expect(res.body).toBe('User-agent: *\nDisallow: /\n')
  })
})
