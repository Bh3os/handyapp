// AI suggestions for staff against PostgreSQL 16, with AI disabled (TSK-0117; HH-AUTO-03, HH-AUTO-04, RULE-AI-WAVE2,
// OWN-DEC-74, RULE-SERVER-AUTHZ). Every registered use has its route; each request goes through the TSK-0116 gateway,
// is refused with AI_DISABLED first, answered with the manual path and audited without contents, and nothing leaves
// the process. Who may ask is the policy's decision on the person, before the gateway decides it again. Staff are
// synthetic (RULE-SYNTHETIC-DATA).
import { withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { decide, type StaffActor, type StaffRole } from '@handyhub/policy'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../../src/app.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { AI_ASSIST_RATE_LIMIT } from '../../src/modules/ai-assist/index.js'
import { AI_USES } from '../../src/platform/ai/index.js'
import { testConfig } from '../fixtures/env.js'
import { signInWithMfa } from '../fixtures/staff-mfa.js'

const pw = ['synthetic', 'ai', 'assistance', 'passphrase', '117'].join(' ')
const PEOPLE = ['owner', 'office', 'estimator', 'worker'] as const satisfies readonly StaffRole[]
type Person = (typeof PEOPLE)[number]

let t: TestDatabase
let app: FastifyInstance
const cookies = {} as Record<Person, string>
const csrf = {} as Record<Person, string>
const ids = {} as Record<Person, string>
const email = (p: Person) => `${p}-ai-assistance@example.test`

async function signIn(p: Person): Promise<[string, string]> {
  const res = await signInWithMfa(app, {
    method: 'POST',
    url: '/api/v1/staff/auth/sign-in',
    payload: { email: email(p), password: pw },
  })
  expect(res.statusCode, res.body).toBe(200)
  const cookie = String(res.headers['set-cookie']).split(';')[0] as string
  const session = await app.inject({ method: 'GET', url: '/api/v1/staff/auth/session', headers: { cookie } })
  return [cookie, session.json<{ csrfToken: string }>().csrfToken]
}

const ask = (who: Person, use: string) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/staff/ai/uses/${use}/suggestions`,
    headers: { cookie: cookies[who], 'x-csrf-token': csrf[who] },
  })

const auditRows = (who: Person, use: string) =>
  t.db
    .selectFrom('platform.audit_events')
    .select(['actor_kind', 'action', 'target_type', 'target_id', 'result', 'reason', 'summary'])
    .where('actor_id', '=', ids[who])
    .where('action', '=', 'ai.assist')
    .where('target_id', '=', use)
    .execute()

beforeAll(async () => {
  t = await createTestDatabase()
  app = await buildApp({ config: testConfig(), api: { db: t.db } })
  const hash = await hashPassword(pw)
  await withTx(t.db, async (tx) => {
    for (const p of PEOPLE) {
      const user = await createStaffUser(tx, {
        email: email(p),
        displayName: `Synthetic ${p}`,
        locale: 'en',
        role: p,
        issuedBy: 'test',
      })
      await setPasswordHash(tx, user.id, hash)
      ids[p] = user.id
    }
  })
  for (const p of PEOPLE) [cookies[p], csrf[p]] = await signIn(p)
})
afterAll(async () => {
  await app?.close()
  await t?.drop()
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('AI suggestions for staff stay refused (TSK-0117, RULE-AI-WAVE2)', () => {
  it('[HH-AUTO-03][RULE-AI-WAVE2][RULE-SERVER-AUTHZ] every use is refused with its manual path, audited, and sends nothing', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    for (const p of PEOPLE) {
      const actor: StaffActor = {
        kind: 'staff',
        userId: ids[p],
        roles: [p],
        capabilities: [],
        status: 'active',
        freshAuth: true,
      }
      for (const use of AI_USES) {
        const res = await ask(p, use.id)
        const permitted = decide(actor, use.requestAction, {}, { now: new Date(), online: true }).effect === 'allow'
        const rows = await auditRows(p, use.id)
        if (!permitted) {
          // The policy refuses the person before the gateway is reached: nothing to ask, nothing recorded.
          expect(res.statusCode, `${p} ${use.id}`).toBe(403)
          expect(rows, `${p} ${use.id}`).toEqual([])
          continue
        }
        expect(res.statusCode, `${p} ${use.id} ${res.body}`).toBe(200)
        const body = res.json<{ outcome: string; reasons: string[]; manualPath: string }>()
        expect(body.outcome).toBe('refused')
        expect(body.reasons[0]).toBe('AI_DISABLED')
        expect(body.reasons).toEqual(
          expect.arrayContaining([
            'BOUNDS_NOT_CONFIGURED',
            'DESTINATION_NOT_CONFIGURED',
            'INSTRUCTIONS_NOT_CONFIGURED',
          ]),
        )
        expect(body.reasons.includes('REVIEW_NOT_CONFIGURED'), use.id).toBe(use.reviewAction === null)
        expect(body.manualPath).toBe(use.manualPath)
        expect(rows, `${p} ${use.id}`).toHaveLength(1)
        expect(rows[0]).toMatchObject({
          actor_kind: 'staff',
          action: 'ai.assist',
          target_type: 'ai_use',
          result: 'denied',
          summary: { use: use.id, inputFields: [] },
        })
        expect(rows[0]?.reason).toMatch(/^AI_DISABLED, /)
      }
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('[RULE-SERVER-AUTHZ] the Owner reaches every use; a Worker none outside an assigned record', async () => {
    for (const use of AI_USES) expect((await ask('owner', use.id)).statusCode, use.id).toBe(200)
    for (const use of AI_USES) expect((await ask('worker', use.id)).statusCode, use.id).toBe(403)
  })

  it('[RULE-AI-WAVE2] an unregistered use has no route, and a request without a staff session is refused', async () => {
    expect((await ask('owner', 'estimate.approve')).statusCode).toBe(404)
    const anonymous = await app.inject({ method: 'POST', url: '/api/v1/staff/ai/uses/request.classify/suggestions' })
    expect([401, 403]).toContain(anonymous.statusCode)
  })

  it('[HH-SEC-01][HH-SEC-03] one staff member cannot fill the audit log: requests are rate limited (TSK-0109 AI-1)', async () => {
    const before = (await auditRows('estimator', 'request.classify')).length
    const statuses: number[] = []
    for (let i = 0; i <= AI_ASSIST_RATE_LIMIT.limit; i += 1)
      statuses.push((await ask('estimator', 'request.classify')).statusCode)
    // Every earlier request of this person counts in the same window, so the limit is reached at the latest here.
    expect(statuses.at(-1)).toBe(429)
    expect(statuses.filter((s) => s === 200).length).toBeLessThanOrEqual(AI_ASSIST_RATE_LIMIT.limit)
    // A limited request is refused before the gateway: it writes no audit entry.
    const after = (await auditRows('estimator', 'request.classify')).length
    expect(after - before).toBe(statuses.filter((s) => s === 200).length)
  })
})
