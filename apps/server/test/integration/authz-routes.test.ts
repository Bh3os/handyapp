// The authorization matrix over every route the running server registers (TSK-0108; HH-TEST-02, HH-STAFF-04,
// HH-ARC-03, T19, T26, T27, T64, ROLE-MATRIX, RULE-SERVER-AUTHZ, RULE-AI-WAVE2). The routes come from the booted
// server's own route table, never from a hand-written list, so a route added later without a contract, or one that
// answers a caller the matrix refuses, fails here. Each caller kind is checked against the policy data that
// matrix-sync.test.ts proves equal to ROLE-MATRIX:
// - who may call at all: no session, a customer session on the staff API, a staff session on the customer API, each
//   staff role (and two roles held together), a disabled account's earlier session, a signed-out session, a session
//   waiting for its second factor, and the disabled AI module; a refused caller is refused whatever it sends (the
//   probe below is invalid input, which a caller who passes reaches as VALIDATION_FAILED, so nothing ever runs);
// - the exact decision on every route that reads no record: each role's allow or refusal with its reason, a session
//   without a fresh sign-in on the Owner's fresh-sign-in actions, and nothing written by a refused write.
// Record scopes (assigned jobs, own projects, organization privileges, other customers) are authz-records.test.ts.
// Every staff member and value here is synthetic (RULE-SYNTHETIC-DATA).
import { randomUUID } from 'node:crypto'
import { withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import {
  ACTIONS,
  actionsFor,
  decide,
  MATRIX,
  type Action,
  type Actor,
  type StaffActor,
  type StaffRole,
} from '@handyhub/policy'
import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { API_PREFIX } from '../../src/api/register.js'
import { AUTHENTICATION, type RouteDef } from '../../src/api/route.js'
import { boot } from '../../src/boot.js'
import { stagingToolsEnvironment } from '../../src/config.js'
import { surfaceOf } from '../../src/hosts.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { startCustomerSession } from '../../src/modules/identity/customer-sessions.js'
import { apiModules } from '../../src/modules/index.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { visibleSections } from '../../src/modules/queue/index.js'
import { LOCAL_FILES_PATH } from '../../src/providers/disk/index.js'
import { testConfig } from '../fixtures/env.js'
import { sample, samplePath, sampleQuery } from '../fixtures/schema-sample.js'
import { signInWithMfa, TEST_MFA_KEY_TEXT } from '../fixtures/staff-mfa.js'

const pw = ['synthetic', 'authorization', 'matrix', 'passphrase', '108'].join(' ')
const ENV = { HANDYHUB_ENV: 'ci', MFA_ENCRYPTION_KEY: TEST_MFA_KEY_TEXT, STAGING_TOOLS: 'on', HOST: '127.0.0.1' }

/** Routes outside the API: each authenticates in its own way, named here with where that is tested. */
const NON_API: Record<string, string> = {
  'GET /healthz': 'liveness, no data (boot.test.ts)',
  'GET /readyz': 'readiness behind the gate (boot.test.ts)',
  'GET /robots.txt': 'public file (search.test.ts)',
  'GET /sitemap.xml': 'public file (search.test.ts)',
  'GET /*': 'static pages of each host (two-origins.test.ts)',
  'POST /webhooks/bird': 'Standard Webhooks signature (providers.test.ts)',
  'POST /webhooks/resend': 'Standard Webhooks signature (providers.test.ts)',
  [`GET ${LOCAL_FILES_PATH}*`]: 'local disk storage only: signed, expiring URLs (disk-storage.test.ts)',
  // Anything else below /api/v1: the API's own NOT_FOUND envelope.
  [`DELETE ${API_PREFIX}/*`]: 'API not found',
  [`GET ${API_PREFIX}/*`]: 'API not found',
  [`OPTIONS ${API_PREFIX}/*`]: 'API not found',
  [`PATCH ${API_PREFIX}/*`]: 'API not found',
  [`POST ${API_PREFIX}/*`]: 'API not found',
  [`PUT ${API_PREFIX}/*`]: 'API not found',
  [`SEARCH ${API_PREFIX}/*`]: 'API not found',
  [`TRACE ${API_PREFIX}/*`]: 'API not found',
  [`PROPFIND ${API_PREFIX}/*`]: 'API not found',
}

/**
 * The routes of a running server, read from its own route table (Fastify's printed radix tree: each line holds the
 * part of the path below its parent and the methods registered at it). HEAD answers through its GET route.
 */
function registeredRoutes(app: FastifyInstance): { method: string; path: string }[] {
  const out: { method: string; path: string }[] = []
  const stack: string[] = []
  for (const line of app.printRoutes({ commonPrefix: false }).split('\n')) {
    const at = line.search(/[├└]── /)
    if (at < 0) continue
    const depth = at / 4
    const m = /^(.*?)(?: \(([A-Z, ]+)\))?$/.exec(line.slice(at + 4)) as RegExpExecArray
    const part = m[1] ?? ''
    const path = depth > 0 ? (stack[depth - 1] ?? '') + part : part.startsWith('/') ? part : `/${part}`
    stack[depth] = path
    stack.length = depth + 1
    for (const method of (m[2] ?? '').split(', ').filter(Boolean)) if (method !== 'HEAD') out.push({ method, path })
  }
  return out
}

type Route = { def: RouteDef; url: string }
type Profile = {
  name: string
  cookie?: string
  csrf?: string
  /** What the staff API resolves: a complete staff session, a password-only one, or a guest (anything else). */
  staff?: StaffActor
  pending?: true
  /** The customer and public APIs resolve a customer session. */
  customer?: true
}
type Expected = { status: number; code: string; field?: string } | 'passes'

let t: TestDatabase
let server: FastifyInstance
let ai: FastifyInstance
let routes: Route[] = []
/** How many route contracts the server's modules declare. */
let contracts = 0
const profiles = {} as Record<
  | 'anonymous'
  | 'customer'
  | 'owner'
  | 'office'
  | 'estimator'
  | 'worker'
  | 'officeEstimator'
  | 'staleOwner'
  | 'disabled'
  | 'signedOut'
  | 'pending',
  Profile
>
const ids = {} as Record<string, string>

async function staffUser(email: string, roles: readonly StaffRole[]): Promise<string> {
  const hash = await hashPassword(pw)
  return withTx(t.db, async (tx) => {
    const user = await createStaffUser(tx, {
      email,
      displayName: `Synthetic ${email.split('@')[0]}`,
      locale: 'en',
      role: roles[0] as StaffRole,
      issuedBy: 'test',
    })
    for (const role of roles.slice(1))
      await tx
        .insertInto('identity.role_grants')
        .values({ staff_user_id: user.id, kind: 'role', name: role, issued_by: 'test' })
        .execute()
    await setPasswordHash(tx, user.id, hash)
    return user.id
  })
}

async function signedIn(name: string, roles: readonly StaffRole[]): Promise<Profile> {
  const email = `${name.toLowerCase()}-authz@example.test`
  const id = await staffUser(email, roles)
  ids[name] = id
  const res = await signInWithMfa(server, {
    method: 'POST',
    url: '/api/v1/staff/auth/sign-in',
    payload: { email, password: pw },
  })
  expect(res.statusCode, res.body).toBe(200)
  const cookie = String(res.headers['set-cookie']).split(';')[0] as string
  const session = await server.inject({ method: 'GET', url: '/api/v1/staff/auth/session', headers: { cookie } })
  return {
    name,
    cookie,
    csrf: session.json<{ csrfToken: string }>().csrfToken,
    staff: { kind: 'staff', userId: id, roles, capabilities: [], status: 'active', freshAuth: true },
  }
}

/** One request: the probe (invalid input) or a valid sample, with the profile's session. */
function send(app: FastifyInstance, p: Profile, r: Route, body: unknown, url = r.url) {
  const headers: Record<string, string> = { 'idempotency-key': `synthetic-authz-${randomUUID()}`, 'if-match': '"1"' }
  if (p.cookie) headers['cookie'] = p.cookie
  if (p.csrf) headers['x-csrf-token'] = p.csrf
  return app.inject({
    method: r.def.method,
    url,
    headers,
    ...(r.def.method === 'GET' || body === undefined ? {} : { payload: body as object }),
  })
}

/**
 * Invalid input for a route, so a caller who passes the authorization checks gets VALIDATION_FAILED and nothing runs:
 * a path parameter outside its pattern, an unknown body field or an unknown query parameter (every input object of a
 * contract refuses unknown fields). Null for the few routes that take no input at all.
 */
function probe(def: RouteDef): { url: string; body?: unknown } | null {
  const params = (def.schema.params?.['properties'] ?? {}) as Record<string, Record<string, unknown>>
  const constrained = Object.entries(params).find(([, s]) => s['pattern'] || s['enum'] || s['format'])?.[0]
  if (constrained) return { url: API_PREFIX + samplePath(def.path, def.schema.params, { [constrained]: '~probe~' }) }
  const url = API_PREFIX + samplePath(def.path, def.schema.params)
  if (def.schema.body) return { url, body: { probe_0108: true } }
  if (def.schema.querystring || def.pagination) return { url: `${url}?probe_0108=1` }
  return null
}

const refusal = (status: number, code: string, field?: string) => ({ status, code, ...(field ? { field } : {}) })

/** What the server must answer `p` on `def` before reading its input (ROLE-MATRIX through the policy data). */
function expectedBeforeInput(def: RouteDef, p: Profile): Expected {
  const surface = surfaceOf(def.path)
  if (surface === 'staff' && p.pending && !def.beforeSecondFactor)
    return refusal(401, 'UNAUTHENTICATED', 'MFA_REQUIRED')
  const kind = surface === 'staff' ? (p.staff ? 'staff' : 'guest') : p.customer ? 'customer' : 'guest'
  if (!def.actors.includes(kind))
    return kind === 'guest'
      ? refusal(401, 'UNAUTHENTICATED')
      : kind === 'customer'
        ? refusal(404, 'NOT_FOUND')
        : refusal(403, 'FORBIDDEN')
  if (
    kind === 'staff' &&
    def.permission !== AUTHENTICATION &&
    !actionsFor(p.staff?.roles ?? []).includes(def.permission)
  )
    return refusal(403, 'FORBIDDEN')
  return 'passes'
}

function outcome(res: LightMyRequestResponse) {
  const error = (res.json() as { error?: { code: string; fieldErrors: { code: string; field: string }[] } }).error
  const field = error?.fieldErrors.find((f) => f.code === 'MFA_REQUIRED')?.code
  return { status: res.statusCode, code: error?.code ?? '', ...(field ? { field } : {}) }
}

/** Runs `check` over `items`, a few at a time (one shared server and pool). */
async function inBatches<T>(items: readonly T[], check: (item: T) => Promise<void>, size = 12): Promise<void> {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(check))
}

beforeAll(async () => {
  t = await createTestDatabase()
  server = (await boot({ ...ENV, DATABASE_URL: t.url, PORT: '0' }, { worker: false })).app
  ai = await buildApp({
    config: testConfig({ STAGING_TOOLS: 'on', DATABASE_URL: t.url }),
    api: { db: t.db, resolveActor: async () => ({ actor: { kind: 'ai' } }) },
  })
  // The contracts of the routes, built as the server builds them; matched to the running routes below.
  const config = testConfig({ STAGING_TOOLS: 'on', DATABASE_URL: t.url })
  const defs = new Map<string, RouteDef>()
  const deps = { secureCookies: false, mfaKey: null, staging: stagingToolsEnvironment(config), environment: config.env }
  for (const m of apiModules(deps)) for (const def of m.routes) defs.set(`${def.method} ${API_PREFIX}${def.path}`, def)
  contracts = defs.size
  routes = registeredRoutes(server)
    .filter((r) => defs.has(`${r.method} ${r.path}`))
    .map((r) => {
      const def = defs.get(`${r.method} ${r.path}`) as RouteDef
      return { def, url: API_PREFIX + samplePath(def.path, def.schema.params) }
    })

  profiles.anonymous = { name: 'anonymous' }
  for (const role of ['owner', 'office', 'estimator', 'worker'] as const) profiles[role] = await signedIn(role, [role])
  profiles.officeEstimator = await signedIn('officeEstimator', ['office', 'estimator'])
  // A second Owner whose last password or second factor is older than the fresh sign-in window (5 minutes).
  const stale = await signedIn('staleOwner', ['owner'])
  await sql`UPDATE identity.staff_sessions SET authenticated_at = now() - interval '10 minutes'
             WHERE staff_user_id = ${ids['staleOwner']}::uuid AND revoked_at IS NULL`.execute(t.db)
  profiles.staleOwner = { ...stale, staff: { ...(stale.staff as StaffActor), freshAuth: false } }
  // A worker the Owner disables while their session is still open (T27): the earlier cookie is all they hold. The
  // stale Owner does it: disabling is never delayed by a fresh sign-in (ROLE-MATRIX "Y (never delayed)").
  const leaver = await signedIn('disabled', ['worker'])
  const DISABLE_REQUEST = 'synthetic-authz-disable-0108'
  const off = await server.inject({
    method: 'POST',
    url: `/api/v1/staff/members/${ids['disabled']}/disable`,
    headers: {
      cookie: profiles.staleOwner.cookie as string,
      'x-csrf-token': String(profiles.staleOwner.csrf),
      'idempotency-key': DISABLE_REQUEST,
    },
    payload: { reason: 'Synthetic offboarding in the authorization suite.' },
  })
  expect(off.statusCode, off.body).toBe(200)
  profiles.disabled = { name: 'disabled', cookie: leaver.cookie as string, csrf: leaver.csrf as string }
  const out = await signedIn('signedOut', ['office'])
  const signOut = await server.inject({
    method: 'POST',
    url: '/api/v1/staff/auth/sign-out',
    headers: { cookie: out.cookie as string, 'x-csrf-token': out.csrf as string },
  })
  expect(signOut.statusCode).toBeLessThan(300)
  profiles.signedOut = { name: 'signedOut', cookie: out.cookie as string, csrf: out.csrf as string }
  // A correct password and no second factor yet: the session waits for enrolment (OWN-DEC-202).
  ids['pending'] = await staffUser('pending-authz@example.test', ['owner'])
  const half = await server.inject({
    method: 'POST',
    url: '/api/v1/staff/auth/sign-in',
    payload: { email: 'pending-authz@example.test', password: pw },
  })
  expect(half.statusCode).toBe(202)
  profiles.pending = {
    name: 'pending',
    cookie: String(half.headers['set-cookie']).split(';')[0] as string,
    pending: true,
  }
  // A verified customer session (the project scope does not matter on these checks; authz-records.test.ts has them).
  const s = await withTx(t.db, (tx) =>
    startCustomerSession(tx, {
      contactRef: 'synthetic-authz-contact',
      via: 'grant',
      projectIds: [],
      verifiedAt: new Date(),
    }),
  )
  profiles.customer = { name: 'customer', cookie: `__Host-hh_customer=${s.token}`, customer: true }
}, 120_000)

afterAll(async () => {
  await ai?.close()
  await server?.close()
  await t?.drop()
})

describe('every route the running server registers is under the policy (TSK-0108, RULE-SERVER-AUTHZ)', () => {
  it('[RULE-SERVER-AUTHZ][HH-STAFF-04] each API route has a contract naming a matrix action or authentication; nothing else is served', () => {
    const running = registeredRoutes(server)
    const api = running.filter((r) =>
      routes.some((x) => x.def.method === r.method && API_PREFIX + x.def.path === r.path),
    )
    const other = running
      .filter((r) => !api.includes(r))
      .map((r) => `${r.method} ${r.path}`)
      .sort()
    // A route registered outside the contracts (no policy, no actor check) is not in this list: the suite fails.
    expect(other.filter((r) => !(r in NON_API))).toEqual([])
    // ...and every contract is served: the routes swept below are all of them.
    expect(routes.length).toBe(contracts)
    expect(routes.length).toBeGreaterThan(500)
    const known = new Set<string>(ACTIONS)
    for (const { def } of routes) {
      const where = `${def.method} ${def.path}`
      expect(def.permission === AUTHENTICATION || known.has(def.permission), where).toBe(true)
      // Staff routes serve staff (and, for signing in, a caller without a session); the customer and public
      // routes never read a staff session.
      if (surfaceOf(def.path) === 'staff' && def.permission !== AUTHENTICATION)
        expect(def.actors, where).toEqual(['staff'])
      if (surfaceOf(def.path) !== 'staff') expect(def.actors, where).not.toContain('staff')
    }
  })

  it('[ROLE-MATRIX] each caller kind a route lists can be allowed by some matrix column; no row refused to all has a route', () => {
    for (const { def } of routes) {
      if (def.permission === AUTHENTICATION) continue
      const row = MATRIX.find((r) => r.actions.includes(def.permission as Action))
      expect(row?.denyReason, `${def.method} ${def.path}`).toBeUndefined()
      for (const kind of def.actors) {
        const columns = kind === 'staff' ? (['owner', 'office', 'estimator', 'worker'] as const) : [kind]
        const someRule = columns.some((c) => row?.cells[c].rules[def.permission as Action] !== undefined)
        // TSK-0076: the photos of a request list guests so a guest's altered ID is a security event (T19).
        if (kind === 'guest' && def.path === '/customer/requests/:requestId/photos') continue
        expect([def.method, def.path, kind, someRule]).toEqual([def.method, def.path, kind, true])
      }
    }
  })
})

describe('who may call each route at all, whatever they send (TSK-0108, HH-TEST-02, T26, T27)', () => {
  const cases = [
    'anonymous',
    'customer',
    'owner',
    'office',
    'estimator',
    'worker',
    'officeEstimator',
    'disabled',
    'signedOut',
    'pending',
  ] as const

  for (const name of cases)
    it(`[HH-TEST-02][HH-STAFF-04] ${name}: refused before any input or record is read where the matrix refuses, through to validation elsewhere`, async () => {
      const p = profiles[name]
      const mismatches: string[] = []
      let passed = 0
      let refused = 0
      await inBatches(routes, async (r) => {
        const expected = expectedBeforeInput(r.def, p)
        const pr = probe(r.def)
        // A route without input lets a caller who passes run it: only the refusals are sent there.
        if (!pr && expected === 'passes') return
        const res = await send(server, p, r, pr?.body ?? {}, pr?.url ?? r.url)
        const got = outcome(res)
        if (expected === 'passes') {
          passed++
          if (got.code !== 'VALIDATION_FAILED')
            mismatches.push(`${r.def.method} ${r.def.path}: expected the input refusal, got ${JSON.stringify(got)}`)
        } else {
          refused++
          if (JSON.stringify(got) !== JSON.stringify(expected))
            mismatches.push(
              `${r.def.method} ${r.def.path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`,
            )
        }
      })
      expect(mismatches).toEqual([])
      expect(passed + refused).toBeGreaterThan(400)
    }, 120_000)

  it('[RULE-AI-WAVE2] the AI module is refused on every route, sign-in included: it holds no permission', async () => {
    const mismatches: string[] = []
    await inBatches(routes, async (r) => {
      const pr = probe(r.def)
      const got = outcome(await send(ai, { name: 'ai' }, r, pr?.body ?? {}, pr?.url ?? r.url))
      if (got.status !== 403 || got.code !== 'FORBIDDEN')
        mismatches.push(`${r.def.method} ${r.def.path}: ${JSON.stringify(got)}`)
    })
    expect(mismatches).toEqual([])
    for (const action of ACTIONS)
      expect(decide({ kind: 'ai' }, action, {}, { now: new Date(), online: true })).toMatchObject({
        effect: 'deny',
        reason: 'AI_DISABLED',
      })
  }, 120_000)
})

describe('the exact decision where no record decides it (TSK-0108, T26, T64, HH-STAFF-03)', () => {
  const STAFF = ['owner', 'office', 'estimator', 'worker', 'officeEstimator', 'staleOwner'] as const

  /** The answer the matrix gives `p` for `def` on a record described by `resource`, with the sample's reason. */
  function expectedDecision(def: RouteDef, p: Profile, resource: Record<string, string>, body: unknown): Expected {
    const reason = (body as { reason?: unknown } | undefined)?.reason
    const d = decide(p.staff as Actor, def.permission as Action, resource, {
      now: new Date(),
      online: true,
      ...(typeof reason === 'string' ? { reason } : {}),
    })
    if (d.effect === 'deny') {
      if (d.reason === 'REASON_REQUIRED') return refusal(400, 'VALIDATION_FAILED')
      return d.reason === 'FRESH_AUTH_REQUIRED' ? refusal(403, 'FRESH_AUTH_REQUIRED') : refusal(403, 'FORBIDDEN')
    }
    if (def.freshAuthMinutes !== undefined && !p.staff?.freshAuth) return refusal(403, 'FRESH_AUTH_REQUIRED')
    return REFINED[`${def.method} ${def.path}`]?.(p.staff as StaffActor) ?? 'passes'
  }

  /** Reads whose handler checks more than the schema says (a range in order, one of two fields), with valid values. */
  const QUERIES: Record<string, Record<string, string>> = {
    '/staff/reports/first-response': { from: '2031-01-01T00:00:00.000Z', to: '2031-02-01T00:00:00.000Z' },
    '/staff/access-help/lookup': { contact: 'synthetic-0108@example.test' },
  }

  /**
   * Reads that list records of several matrix rows and refuse a caller who holds none of them (the handler asks the
   * same policy data): Owner Decisions lists only the Owner's decision items (queue/items.ts visibleSections).
   */
  const REFINED: Record<string, (actor: StaffActor) => Expected> = {
    'GET /staff/queue/owner-decisions': (actor) =>
      visibleSections(actor).includes('owner_decisions') ? 'passes' : refusal(403, 'FORBIDDEN'),
  }

  /** A valid request: sampled path parameters (or the given ones), required query parameters and body. */
  function valid(r: Route, given: Record<string, string> = {}) {
    const query = sampleQuery(r.def.schema.querystring, QUERIES[r.def.path])
    const url = API_PREFIX + samplePath(r.def.path, r.def.schema.params, given) + query
    return { url, body: sample(r.def.schema.body) ?? (r.def.method === 'GET' ? undefined : {}) }
  }

  const written = async () => {
    const audit = await sql<{ n: number }>`SELECT count(*)::int AS n FROM platform.audit_events
                                             WHERE action NOT LIKE 'security.%'`.execute(t.db)
    const keys = await sql<{ n: number }>`SELECT count(*)::int AS n FROM platform.idempotency_keys`.execute(t.db)
    return [audit.rows[0]?.n, keys.rows[0]?.n]
  }

  /**
   * Sends each case the matrix refuses and checks the refusal and its reason; reads the matrix allows are sent too and
   * must not be refused. A write the matrix allows is not sent (it would run): the sweep above shows it passes.
   */
  async function check(
    cases: { r: Route; p: Profile; resource: Record<string, string>; given?: Record<string, string> }[],
  ) {
    const mismatches: string[] = []
    const before = await written()
    const refusals = cases.filter(
      (c) => expectedDecision(c.r.def, c.p, c.resource, valid(c.r, c.given).body) !== 'passes',
    )
    await inBatches(refusals, async ({ r, p, resource, given }) => {
      const v = valid(r, given)
      const expected = expectedDecision(r.def, p, resource, v.body)
      const got = outcome(await send(server, p, r, v.body, v.url))
      if (JSON.stringify(got) !== JSON.stringify(expected))
        mismatches.push(
          `${p.name} ${r.def.method} ${r.def.path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`,
        )
    })
    // Nothing a refused call sent was written: no audit event (beyond security events) and no idempotency record.
    expect(await written()).toEqual(before)
    const reads = cases.filter((c) => c.r.def.method === 'GET' && !refusals.includes(c))
    await inBatches(reads, async ({ r, p, given }) => {
      const v = valid(r, given)
      const got = outcome(await send(server, p, r, v.body, v.url))
      if (got.status === 400 || got.status === 401 || ['FORBIDDEN', 'FRESH_AUTH_REQUIRED'].includes(got.code))
        mismatches.push(`${p.name} ${r.def.method} ${r.def.path}: expected an allowed read, got ${JSON.stringify(got)}`)
    })
    expect(mismatches).toEqual([])
    return { refused: refusals.length, read: reads.length }
  }

  it('[T26][T64][HH-STAFF-04] each role on every staff route that reads no record: allowed, or refused with the matrix reason', async () => {
    const free = routes.filter(
      (r) => !r.def.resource && r.def.permission !== AUTHENTICATION && surfaceOf(r.def.path) === 'staff',
    )
    expect(free.length).toBeGreaterThan(60)
    const done = await check(STAFF.flatMap((name) => free.map((r) => ({ r, p: profiles[name], resource: {} }))))
    expect(done.refused).toBeGreaterThan(150)
    expect(done.read).toBeGreaterThan(50)
  }, 120_000)

  it('[T64][HH-STAFF-03][HH-STAFF-02] staff management: fresh sign-in and a reason for grants, never on oneself; other roles refused', async () => {
    const members = routes.filter((r) => r.def.path.startsWith('/staff/members/:staffUserId'))
    expect(members.length).toBeGreaterThan(8)
    const cases = STAFF.flatMap((name) =>
      members.flatMap((r) => [
        // On the worker's account, and on the caller's own account (SELF_GRANT: nobody grants themselves).
        {
          r,
          p: profiles[name],
          resource: { subjectStaffId: ids['worker'] as string },
          given: { staffUserId: ids['worker'] as string },
        },
        {
          r,
          p: profiles[name],
          resource: { subjectStaffId: ids[name] as string },
          given: { staffUserId: ids[name] as string },
        },
      ]),
    )
    const done = await check(cases)
    expect(done.refused).toBeGreaterThan(50)
  }, 120_000)
})
