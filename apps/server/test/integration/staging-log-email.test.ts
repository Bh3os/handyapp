// The staging log email sender against PostgreSQL 16 (TSK-0112; HH-COM-03, HH-STAFF-01, HH-COM-14, OWN-DEC-152
// section 14). Staging has no email provider yet: with EMAIL_PROVIDER=log the first Owner's invite is written to the
// server log, where the operator reads the link. Accounts and addresses are synthetic.
import { Writable } from 'node:stream'
import { withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { buildAutomations } from '../../src/automations.js'
import { ensureBootstrapOwner } from '../../src/modules/identity/accounts.js'
import { isIntercepted, lifecycleOf } from '../../src/modules/notifications/lifecycle.js'
import { createAutomationRegistry } from '../../src/platform/automation.js'
import { createWorker, type Worker } from '../../src/platform/jobs.js'
import { createLogger } from '../../src/platform/logger.js'
import { runWithContext } from '../../src/platform/request-context.js'
import { createProviders } from '../../src/providers/index.js'
import { STAGING_EMAIL_LOGGED } from '../../src/providers/log-email.js'
import { readProviderSettings } from '../../src/providers/settings.js'
import { testConfig } from '../fixtures/env.js'

const OWNER = 'owner-staging-synthetic@example.test'
const pw = (n: number) => ['synthetic', 'staging', 'owner', 'passphrase', String(n)].join(' ')

let t: TestDatabase
let app: FastifyInstance
let worker: Worker
const lines: Record<string, unknown>[] = []

beforeAll(async () => {
  t = await createTestDatabase()
  app = await buildApp({ config: testConfig(), api: { db: t.db } })
  const stream = new Writable({
    write(chunk, _enc, done) {
      lines.push(JSON.parse(String(chunk)) as Record<string, unknown>)
      done()
    },
  })
  const settings = readProviderSettings({
    HANDYHUB_ENV: 'staging',
    EMAIL_PROVIDER: 'log',
    TEST_EMAIL_DESTINATIONS: OWNER,
  })
  const providers = createProviders(settings, { logger: createLogger({ level: 'info' }, stream) })
  worker = createWorker({
    db: t.db,
    registry: createAutomationRegistry(buildAutomations({ providers, staffAppUrl: 'http://127.0.0.1:4310/staff' })),
  })
})
afterAll(async () => {
  await app?.close()
  await t?.drop()
})

describe('EMAIL_PROVIDER=log on staging (TSK-0112, HH-COM-03, HH-STAFF-01)', () => {
  it('[HH-STAFF-01][HH-COM-03] the first Owner invite (staff_link.email) succeeds and its logged body holds the link', async () => {
    const outcome = await runWithContext({ requestId: 'test-staging-log-0001' }, () =>
      withTx(t.db, (tx) =>
        ensureBootstrapOwner(tx, { email: OWNER, displayName: 'Synthetic Owner', requestId: 'test-staging-log-0001' }),
      ),
    )
    expect(outcome).toBe('created')
    await worker.runOnce()
    const job = await t.db
      .selectFrom('platform.jobs')
      .select(['state'])
      .where('automation', '=', 'staff_link.email')
      .executeTakeFirstOrThrow()
    expect(job.state).toBe('succeeded')
    const logged = lines.filter((l) => l['msg'] === STAGING_EMAIL_LOGGED)
    expect(logged).toHaveLength(1)
    expect(logged[0]).toMatchObject({ to: OWNER, subject: 'Your HandyHub staff account', level: 40 })
    const token = /\/staff\/invite\/([A-Za-z0-9_-]{43})/.exec(String(logged[0]?.['text']))?.[1]
    expect(token).toBeDefined()
    // The logged link is the live one: the Owner sets a password with it and signs in.
    const set = await app.inject({
      method: 'POST',
      url: '/api/v1/staff/auth/password/set',
      payload: { token, password: pw(1) },
    })
    expect(set.statusCode).toBe(200)
    const signIn = await app.inject({
      method: 'POST',
      url: '/api/v1/staff/auth/sign-in',
      payload: { email: OWNER, password: pw(1) },
    })
    expect(signIn.statusCode).toBe(200)
  })

  it('[HH-COM-14] a delivery may record the provider log, a test provider, which is never shown as delivered', async () => {
    const defs = await sql<{ def: string }>`
      SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
       WHERE conname IN ('message_deliveries_provider_check', 'message_delivery_attempts_provider_check')`.execute(t.db)
    expect(defs.rows).toHaveLength(2)
    for (const r of defs.rows) expect(r.def).toContain("'log'")
    const row = {
      message_key: 'question.notice',
      state: 'delivered',
      provider: 'log',
      provider_message_id: 'log-email-1',
      error_code: null,
      scheduled_at: null,
    }
    expect(lifecycleOf(row)).toBe('PROVIDER_ACCEPTED')
    expect(isIntercepted(row)).toBe(true)
  })
})
