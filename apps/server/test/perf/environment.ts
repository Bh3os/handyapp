// The performance environment (TSK-0105; HH-NFR-01, RULE-SYNTHETIC-DATA): a throwaway, fully migrated PostgreSQL 16
// database, the real server listening on a loopback port, and the synthetic staff who use it. Everything here is
// fictional: staff names and addresses on reserved test domains, synthetic passphrases built at runtime, and the
// estimate terms version of a throwaway database (as the integration tests record it).
// - The staff mix is the PROPOSED one of OQ-PERF-BUDGET-DETAILS: 20 people signed in at once (1 Owner, 4 Office,
//   3 Estimators and 12 workers), each with their own session, as HH-NFR-01's "20 concurrent active users".
// - Workers keep the same PROPOSED synthetic hours every day (08:00 to 20:00), so the dataset can book visits.
import {
  createPool,
  loadLoadoutSeed,
  loadServiceSeed,
  loadSopSeed,
  syncLoadouts,
  syncServices,
  SERVER_POOL_CONNECT_TIMEOUT_MS,
  syncSops,
  withTx,
  type Database,
  type Db,
} from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { ESTIMATE_TERMS } from '@handyhub/domain/legal'
import type { StaffActor } from '@handyhub/policy'
import type { FastifyInstance } from 'fastify'
import { Kysely, PostgresDialect } from 'kysely'
import { buildApp } from '../../src/app.js'
import type { RouteDef } from '../../src/api/route.js'
import { apiModules } from '../../src/modules/index.js'
import { staffActorOf } from '../../src/modules/identity/actor.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { readCodeKey, type CodeKeySettings } from '../../src/modules/identity/index.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { readSessionToken, resolveSession } from '../../src/modules/identity/sessions.js'
import { recordPolicyVersion } from '../../src/platform/config/index.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { testConfig } from '../fixtures/env.js'
import { signInWithMfa, TEST_MFA_KEY } from '../fixtures/staff-mfa.js'

export type StaffRoleName = 'owner' | 'office' | 'estimator' | 'worker'

/** PROPOSED (OQ-PERF-BUDGET-DETAILS): who the 20 concurrent active users of HH-NFR-01 are. */
export const STAFF_MIX: Readonly<Record<StaffRoleName, number>> = { owner: 1, office: 4, estimator: 3, worker: 12 }

/** PROPOSED synthetic working hours for every worker, every day of the week. */
const WEEK = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, start: '08:00', end: '20:00' }))

export type StatementStats = { count: number; totalMs: number; maxMs: number }

export type StaffSession = { role: StaffRoleName; id: string; email: string; cookie: string; csrf: string }

export type PerfEnvironment = {
  t: TestDatabase
  db: Db
  app: FastifyInstance
  /** The listening server's origin, for real HTTP requests over loopback. */
  origin: string
  routes: readonly RouteDef[]
  codeKey: CodeKeySettings
  owner: StaffActor
  staff: StaffSession[]
  /** Statements the server's pool has run so far, and their time per statement text. */
  queries: { count: number; statements: Map<string, StatementStats> }
  freshOwner: () => Promise<StaffSession>
  close: () => Promise<void>
}

const passphrase = () => ['synthetic', 'performance', 'passphrase', '0105'].join(' ')

/** The one-time-code key of this throwaway environment, built at runtime (never a real key). */
const CODE_KEY: CodeKeySettings = readCodeKey({
  HANDYHUB_ENV: 'ci',
  CODE_HASH_KEY: ['synthetic', 'performance', 'code', 'key', 'for', 'tests', 'only', '0105'].join('-'),
})

export async function openPerfEnvironment(mix: Readonly<Record<StaffRoleName, number>> = STAFF_MIX) {
  const t = await createTestDatabase()
  const storage = new FakeObjectStorage()
  await syncServices(t.db, loadServiceSeed())
  await syncSops(t.db, loadSopSeed())
  await syncLoadouts(t.db, loadLoadoutSeed())
  await recordPolicyVersion(t.db, {
    key: 'legal.estimate_terms',
    value: {
      documentId: ESTIMATE_TERMS.documentId,
      status: 'approved',
      attorneyReviewed: true,
      preparedOn: ESTIMATE_TERMS.preparedOn,
      contentSha256: ESTIMATE_TERMS.contentSha256,
    } as never,
    sourceIds: ['TEST-SYNTHETIC'],
    changedBy: 'test',
    reason: 'synthetic test configuration',
  })
  // Synthetic client networks arrive through one proxy hop, so the public limits count each fictional client apart.
  const config = testConfig({ TRUST_PROXY_HOPS: '1' })
  // The server's own pool, as production builds it (app.ts: 10 connections, the connection wait limit), apart from
  // the generator's; every statement it runs is counted, so a measurement can report queries per request.
  const queries = { count: 0, statements: new Map<string, StatementStats>() }
  const serverDb: Db = new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: createPool(t.url, {
        applicationName: 'handyapp-api',
        connectionTimeoutMillis: SERVER_POOL_CONNECT_TIMEOUT_MS,
      }),
    }),
    log: (event) => {
      if (event.level !== 'query') return
      queries.count++
      // Statement text only (parameters are never kept): where the server's database time goes.
      const text = event.query.sql.replace(/\s+/g, ' ').slice(0, 240)
      const s = queries.statements.get(text) ?? { count: 0, totalMs: 0, maxMs: 0 }
      s.count++
      s.totalMs += event.queryDurationMillis
      s.maxMs = Math.max(s.maxMs, event.queryDurationMillis)
      queries.statements.set(text, s)
    },
  })
  const app = await buildApp({ config, api: { db: serverDb, codeKey: CODE_KEY, storage } })
  const routes = apiModules({
    secureCookies: config.secureCookies,
    mfaKey: TEST_MFA_KEY,
    storage,
    environment: config.env,
    trustProxyHops: config.trustProxyHops,
    codeKey: CODE_KEY,
  }).flatMap((m) => m.routes)
  const hash = await hashPassword(passphrase())
  const people: { role: StaffRoleName; email: string; id: string }[] = []
  await withTx(t.db, async (tx) => {
    for (const role of Object.keys(mix) as StaffRoleName[])
      for (let i = 1; i <= mix[role]; i++) {
        const email = `${role}-${i}-perf@example.test`
        const user = await createStaffUser(tx, {
          email,
          displayName: `Synthetic ${role} ${i}`,
          locale: 'en',
          role,
          issuedBy: 'test',
        })
        await setPasswordHash(tx, user.id, hash)
        people.push({ role, email, id: user.id })
      }
  })
  const signIn = async (p: (typeof people)[number], i: number): Promise<StaffSession> => {
    const res = await signInWithMfa(app, {
      method: 'POST',
      url: '/api/v1/staff/auth/sign-in',
      headers: { 'x-forwarded-for': `198.51.100.${10 + i}` },
      payload: { email: p.email, password: passphrase() },
    })
    if (res.statusCode !== 200) throw new Error(`perf sign-in ${p.email}: ${res.statusCode} ${res.body}`)
    const cookie = String(res.headers['set-cookie']).split(';')[0] as string
    const session = await app.inject({ method: 'GET', url: '/api/v1/staff/auth/session', headers: { cookie } })
    return { ...p, cookie, csrf: session.json<{ csrfToken: string }>().csrfToken }
  }
  const staff: StaffSession[] = []
  for (const [i, p] of people.entries()) staff.push(await signIn(p, i))
  const ownerSession = staff.find((s) => s.role === 'owner') as StaffSession
  const token = ownerSession && readSessionToken(ownerSession.cookie, { secure: config.secureCookies })
  const live = token ? await resolveSession(t.db, token) : null
  if (!live || live.state !== 'complete') throw new Error('perf: the Owner session did not complete')
  const owner = staffActorOf(live)
  for (const w of staff.filter((s) => s.role === 'worker')) {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/staff/workers/${w.id}/working-hours`,
      payload: { periods: WEEK },
      headers: {
        cookie: ownerSession.cookie,
        'x-csrf-token': ownerSession.csrf,
        'idempotency-key': `synthetic-perf-hours-${w.id}`,
        'if-match': '"0"',
      },
    })
    if (res.statusCode !== 200) throw new Error(`perf working hours: ${res.statusCode} ${res.body}`)
  }
  const origin = await app.listen({ host: '127.0.0.1', port: 0 })
  return {
    t,
    db: t.db,
    app,
    origin,
    routes,
    codeKey: CODE_KEY,
    owner,
    staff,
    queries,
    /** A new Owner sign-in, for the exports that need a recent one (fresh authentication). */
    freshOwner: async () => {
      const i = people.findIndex((p) => p.role === 'owner')
      const fresh = await signIn(people[i] as (typeof people)[number], i)
      staff[i] = fresh
      return fresh
    },
    close: async () => {
      await app.close()
      await serverDb.destroy()
      // PERF_KEEP_DB=1 keeps the throwaway database for query plans (drop it afterwards: dropdb <name>).
      if (process.env['PERF_KEEP_DB'] === '1') {
        process.stdout.write(`perf: kept database ${t.name}\n`)
        await t.db.destroy()
      } else await t.drop()
    },
  } satisfies PerfEnvironment
}
