// Boot, health checks and the access gate over real HTTP against PostgreSQL 16 (TSK-0003; OWN-DEC-73,
// RULE-SYNTHETIC-DATA). A fresh migrated database per file comes from @handyhub/db/testing.
import { createTestDatabase, testDatabaseUrl, type TestDatabase } from '@handyhub/db/testing'
import type { FastifyInstance } from 'fastify'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { boot } from '../../src/boot.js'
import { ConfigError } from '../../src/config.js'
import { basic, GATE_USERS, gatePassword } from '../fixtures/env.js'

let testDb: TestDatabase
let app: FastifyInstance
let base: string

beforeAll(async () => {
  testDb = await createTestDatabase()
  const started = await boot({
    HANDYHUB_ENV: 'staging',
    DATABASE_URL: testDb.url,
    ACCESS_GATE_USERS: GATE_USERS,
    PORT: '0',
  })
  app = started.app
  base = started.address
})

afterAll(async () => {
  await app?.close()
  await testDb?.drop()
})

describe('staging boot behind the gate (TSK-0003, OWN-DEC-73)', () => {
  it('[OWN-DEC-73] the gate denies a request without credentials', async () => {
    const res = await fetch(`${base}/`)
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toMatch(/^Basic realm="HandyHub staging"/)
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    const api = await fetch(`${base}/api/requests`, {
      method: 'POST',
      body: '{}',
      headers: { 'content-type': 'application/json' },
    })
    expect(api.status).toBe(401)
  })

  it('[OWN-DEC-73] /healthz answers publicly with no private data', async () => {
    const res = await fetch(`${base}/healthz`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
  })

  it('[OWN-DEC-73] /readyz answers behind the gate: database reachable, every migration applied', async () => {
    const res = await fetch(`${base}/readyz`, { headers: { authorization: basic('owner', gatePassword(1)) } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ready', checks: { database: 'ok', migrations: 'ok' } })
  })

  it("[HH-PRIV-01] boot schedules today's retention scan once (TSK-0099)", async () => {
    const key = `retention.review_scan:day:${new Date().toISOString().slice(0, 10)}:1`
    await expect
      .poll(
        async () =>
          (await testDb.db.selectFrom('platform.jobs').select('job_key').where('job_key', '=', key).execute()).length,
      )
      .toBe(1)
  })

  it('[HH-NFR-03] the server survives its database connections being ended (a PostgreSQL restart) (TSK-0107)', async () => {
    // As a restart ends them: every server process of this server's pool (API and job worker) on this file's own
    // database is terminated, never another agent's or test's.
    const ended = async () => {
      const admin = new pg.Client({ connectionString: testDatabaseUrl(), application_name: 'handyapp-tsk0107-admin' })
      await admin.connect()
      try {
        const { rows } = await admin.query(
          `SELECT pg_terminate_backend(pid, 5000) FROM pg_stat_activity
            WHERE datname = $1 AND application_name = 'handyapp-server'`,
          [testDb.name],
        )
        return rows.length
      } finally {
        await admin.end()
      }
    }
    const ready = async () =>
      (await fetch(`${base}/readyz`, { headers: { authorization: basic('owner', gatePassword(1)) } })).status
    expect(await ready()).toBe(200)
    await expect.poll(ended).toBeGreaterThan(0)
    // The worker keeps ticking on the same pool; the API answers from new connections.
    await new Promise((r) => setTimeout(r, 1500))
    await expect.poll(ready).toBe(200)
    const signIn = await fetch(`${base}/api/v1/staff/auth/session`, {
      headers: { authorization: basic('owner', gatePassword(1)) },
    })
    expect(signIn.status).toBe(401)
  })

  it('[RULE-SYNTHETIC-DATA] robots.txt disallows everything on staging', async () => {
    const res = await fetch(`${base}/robots.txt`, { headers: { authorization: basic('tester1', gatePassword(2)) } })
    expect(await res.text()).toBe('User-agent: *\nDisallow: /\n')
  })
})

describe('boot refuses a missing required variable (TSK-0003, RULE-SYNTHETIC-DATA)', () => {
  it('[RULE-SYNTHETIC-DATA] fails before listening when a required variable is missing', async () => {
    await expect(boot({ PORT: '0' })).rejects.toBeInstanceOf(ConfigError)
    await expect(boot({ HANDYHUB_ENV: 'staging', ACCESS_GATE_USERS: GATE_USERS, PORT: '0' })).rejects.toThrow(
      'DATABASE_URL is required in staging',
    )
    await expect(boot({ HANDYHUB_ENV: 'staging', DATABASE_URL: testDb.url, PORT: '0' })).rejects.toThrow(
      /ACCESS_GATE_USERS is required in staging/,
    )
  })

  it('[HH-OPS-05] a production server records its environment mark, or does not start (TSK-0141)', async () => {
    const dead = new URL(testDb.url)
    dead.port = '1'
    await expect(boot({ HANDYHUB_ENV: 'production', DATABASE_URL: dead.toString(), PORT: '0' })).rejects.toThrow(
      /production server refused to start/,
    )
    // A migrated database is marked production at boot, for good (a staging reset is then refused on it).
    const prod = await createTestDatabase()
    try {
      const started = await boot({ HANDYHUB_ENV: 'production', DATABASE_URL: prod.url, PORT: '0' }, { worker: false })
      await started.app.close()
      const marks = await prod.db.selectFrom('staging.environment_marks').select('environment').execute()
      expect(marks.map((m) => m.environment)).toEqual(['production'])
    } finally {
      await prod.drop()
    }
  })

  it('[RULE-SYNTHETIC-DATA] readiness fails on an unreachable database', async () => {
    const dead = new URL(testDb.url)
    dead.port = '1'
    const started = await boot({ HANDYHUB_ENV: 'ci', DATABASE_URL: dead.toString(), PORT: '0' })
    try {
      const res = await fetch(`${started.address}/readyz`)
      expect(res.status).toBe(503)
      expect(await res.json()).toEqual({ status: 'not_ready', checks: { database: 'fail', migrations: 'fail' } })
    } finally {
      await started.app.close()
    }
  })
})
