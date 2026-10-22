// Mandatory MFA for every staff account against PostgreSQL 16 (TSK-0154; HH-STAFF-01, HH-SEC-02, HH-STAFF-02,
// HH-SEC-06, OWN-DEC-202, OWN-DEC-200, T22, T27, T74). The TOTP authenticator and recovery codes of TSK-0015 are now
// required for the Owner, Office/Dispatcher, Estimator and Worker alike: a password alone starts a session that reaches
// only enrolment, the challenge and sign-out; the Owner resets a lost authenticator; offboarding removes it; an
// Owner's own lost authenticator is recovered with a recovery code or the operations command. Accounts, keys and codes
// are synthetic (RULE-SYNTHETIC-DATA).
import { withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { STAFF_ROLES, type StaffRole } from '@handyhub/policy'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { issueLinkNow } from '../../src/modules/identity/links.js'
import { currentCode } from '../../src/modules/identity/mfa.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { recoverOwnerMfa } from '../../src/modules/identity/recovery.js'
import { MODULES } from '../../src/modules/index.js'
import { runWithContext } from '../../src/platform/request-context.js'
import { testConfig } from '../fixtures/env.js'
import { enrolledFactor, forgetFactor, rememberFactor, signInWithMfa, spendTotp } from '../fixtures/staff-mfa.js'

const emailOf = (role: StaffRole) => `${role}-mfa@example.test`
const pw = (n: number) => ['synthetic', 'mfa', 'staff', 'passphrase', String(n)].join(' ')
const SPARE_OWNER = 'second-owner-mfa@example.test'

let t: TestDatabase
let app: FastifyInstance
const ids = {} as Record<StaffRole | 'spare', string>

type Res = { statusCode: number; headers: Record<string, unknown>; body: string; json: <T = any>() => T } // eslint-disable-line @typescript-eslint/no-explicit-any
const cookieOf = (res: Res) => String(res.headers['set-cookie']).split(';')[0] as string
const post = (url: string, payload: unknown, headers: Record<string, string> = {}) =>
  app.inject({ method: 'POST', url: `/api/v1${url}`, payload: payload as object, headers }) as Promise<Res>
const get = (url: string, headers: Record<string, string> = {}) =>
  app.inject({ url: `/api/v1${url}`, headers }) as Promise<Res>
/** The password step only: the answer says which second-factor step follows. */
const password = (email: string, pass = pw(1)) => post('/staff/auth/sign-in', { email, password: pass })
/** A complete sign-in through the API (password, then enrolment or the code). */
async function signIn(email: string, pass = pw(1)) {
  const res = (await signInWithMfa(app, {
    method: 'POST',
    url: '/api/v1/staff/auth/sign-in',
    payload: { email, password: pass },
  })) as Res
  expect(res.statusCode, res.body).toBe(200)
  return { cookie: cookieOf(res), 'x-csrf-token': res.json<{ csrfToken: string }>().csrfToken }
}
const codesOf = (res: Res) =>
  res.json<{ error: { fieldErrors: { code: string }[] } }>().error.fieldErrors.map((f) => f.code)
const auditCount = async () =>
  Number(
    (
      await t.db
        .selectFrom('platform.audit_events')
        .select((eb) => eb.fn.countAll<string>().as('n'))
        .executeTakeFirstOrThrow()
    ).n,
  )
const auditOf = (action: string, targetId: string) =>
  t.db
    .selectFrom('platform.audit_events')
    .select(['action', 'result', 'reason', 'summary', 'actor_kind', 'step_up_used'])
    .where('action', '=', action)
    .where('target_id', '=', targetId)
    .orderBy('seq')
    .execute()
/** The operations command's transaction, with its correlation ID (as cli/staff-access.ts runs it). */
const ops = <T>(fn: (tx: Parameters<Parameters<typeof withTx>[1]>[0]) => Promise<T>) =>
  runWithContext({ requestId: `ops:test-${Date.now().toString(36)}` }, () => withTx(t.db, fn))
let seq = 0
const idem = () => ({ 'idempotency-key': `synthetic-mfa-${String(++seq).padStart(6, '0')}-${Date.now().toString(36)}` })

/** The routes a session before its second factor may reach: authentication only (beforeSecondFactor). */
const BEFORE_SECOND_FACTOR = [
  'staffSignIn',
  'staffSignOut',
  'staffForgotPassword',
  'staffSetPassword',
  'staffMfaEnroll',
  'staffMfaConfirm',
  'staffMfaVerify',
].sort()
const STAFF_ROUTES = MODULES.flatMap((m) => m.routes).filter((r) => r.path.startsWith('/staff/'))
const UUID = '00000000-0000-4000-8000-000000000154'

/** Every staff route outside BEFORE_SECOND_FACTOR answers this pre-MFA cookie MFA_REQUIRED; nothing is written. */
async function expectEveryStaffRouteRefused(cookie: string) {
  const before = await auditCount()
  const answered: string[] = []
  for (const route of STAFF_ROUTES) {
    if (BEFORE_SECOND_FACTOR.includes(route.operationId)) continue
    const res = (await app.inject({
      method: route.method,
      url: `/api/v1${route.path.replace(/:[A-Za-z]+/g, UUID)}`,
      headers: { cookie, ...idem(), 'if-match': '"1"' },
      ...(route.method === 'GET' ? {} : { payload: {} }),
    })) as Res
    if (res.statusCode !== 401 || codesOf(res).join() !== 'MFA_REQUIRED') answered.push(route.operationId)
  }
  expect(answered).toEqual([])
  expect(await auditCount()).toBe(before)
}

beforeAll(async () => {
  t = await createTestDatabase()
  app = await buildApp({ config: testConfig(), api: { db: t.db } })
  const hash = await hashPassword(pw(1))
  await withTx(t.db, async (tx) => {
    for (const role of STAFF_ROLES) {
      const user = await createStaffUser(tx, {
        email: emailOf(role),
        displayName: `Synthetic MFA ${role}`,
        locale: role === 'office' ? 'es' : 'en',
        role,
        issuedBy: 'test',
      })
      await setPasswordHash(tx, user.id, hash)
      ids[role] = user.id
    }
    const spare = await createStaffUser(tx, {
      email: SPARE_OWNER,
      displayName: 'Synthetic second Owner',
      locale: 'en',
      role: 'owner',
      issuedBy: 'test',
    })
    await setPasswordHash(tx, spare.id, hash)
    ids.spare = spare.id
  })
})
afterAll(async () => {
  await app?.close()
  await t?.drop()
})

describe('the route contract keeps every staff route behind the second factor (TSK-0154, OWN-DEC-202)', () => {
  it('[HH-SEC-02][RULE-SERVER-AUTHZ] only the authentication routes listed here answer a session before its second factor', () => {
    const marked = MODULES.flatMap((m) => m.routes)
      .filter((r) => r.beforeSecondFactor)
      .map((r) => r.operationId)
      .sort()
    expect(marked).toEqual(BEFORE_SECOND_FACTOR)
    for (const r of MODULES.flatMap((m) => m.routes).filter((x) => x.beforeSecondFactor))
      expect(r.permission).toBe('authentication')
    // The self-service "remove the authenticator" route of optional MFA is gone: nobody turns MFA off.
    expect(STAFF_ROUTES.map((r) => r.path)).not.toContain('/staff/auth/mfa/disable')
    expect(STAFF_ROUTES.length).toBeGreaterThan(50)
  })
})

describe('mandatory enrolment for every staff role (TSK-0154, HH-STAFF-01, HH-SEC-02)', () => {
  for (const role of STAFF_ROLES)
    it(`[HH-STAFF-01][HH-SEC-02] a ${role} without an authenticator reaches nothing until it is enrolled and confirmed`, async () => {
      const res = await password(emailOf(role))
      expect(res.statusCode).toBe(202)
      expect(res.json()).toEqual({ mfaRequired: true, step: 'enroll' })
      const cookie = cookieOf(res)
      await expectEveryStaffRouteRefused(cookie)
      expect(codesOf(await get('/staff/auth/session', { cookie }))).toEqual(['MFA_REQUIRED'])
      // An enrolment session cannot give a code instead of enrolling.
      expect((await post('/staff/auth/mfa/verify', { code: '000000' }, { cookie })).statusCode).toBe(401)
      const started = await post('/staff/auth/mfa/enroll', undefined, { cookie })
      expect(started.statusCode).toBe(200)
      const secret = started.json<{ secret: string; otpauthUri: string }>().secret
      expect(started.json<{ otpauthUri: string }>().otpauthUri).toMatch(/^otpauth:\/\/totp\/HandyHub:/)
      const sealed = await t.db
        .selectFrom('identity.staff_mfa')
        .select(['secret_sealed', 'confirmed_at'])
        .where('staff_user_id', '=', ids[role])
        .executeTakeFirstOrThrow()
      expect(sealed.secret_sealed).not.toContain(secret)
      expect(sealed.confirmed_at).toBeNull()
      // Still refused while enrolling.
      expect(codesOf(await get('/staff/members', { cookie }))).toEqual(['MFA_REQUIRED'])
      const wrong = await post('/staff/auth/mfa/confirm', { code: '000000' }, { cookie })
      expect(wrong.statusCode).toBe(401)
      expect((await auditOf('staff.mfa_enable', ids[role])).map((a) => a.result)).toEqual(['denied'])
      const confirmed = await post('/staff/auth/mfa/confirm', { code: currentCode(secret) }, { cookie })
      expect(confirmed.statusCode).toBe(200)
      const body = confirmed.json<{ recoveryCodes: string[]; session: { mfaEnrolled: boolean; roles: string[] } }>()
      expect(body.recoveryCodes).toHaveLength(10)
      expect(body.session).toMatchObject({ mfaEnrolled: true, roles: [role] })
      expect(body.session).not.toHaveProperty('mfaRecommended')
      const complete = cookieOf(confirmed)
      expect(complete).not.toBe(cookie)
      // The enrolment cookie is spent; the confirmed one is a complete session.
      expect((await get('/staff/auth/session', { cookie })).statusCode).toBe(401)
      expect((await get('/staff/auth/session', { cookie: complete })).json()).toMatchObject({ email: emailOf(role) })
      expect((await get('/staff/auth/mfa', { cookie: complete })).json()).toEqual({
        enrolled: true,
        pending: false,
        recoveryCodesLeft: 10,
        available: true,
      })
      // A complete session has its authenticator already: there is nothing to enrol.
      const csrf = (body.session as unknown as { csrfToken: string }).csrfToken
      expect(
        (await post('/staff/auth/mfa/enroll', undefined, { cookie: complete, 'x-csrf-token': csrf })).statusCode,
      ).toBe(409)
      const audits = await auditOf('staff.sign_in', ids[role])
      expect(audits.map((a) => a.summary)).toEqual([{ mfa: 'enroll' }])
      expect((await auditOf('staff.mfa_enroll_start', ids[role])).map((a) => a.result)).toEqual(['succeeded'])
      const enabled = await auditOf('staff.mfa_enable', ids[role])
      expect(enabled.map((a) => a.result)).toEqual(['denied', 'succeeded'])
      // T74: neither the secret nor a recovery code is written to the audit log.
      const all = JSON.stringify(await t.db.selectFrom('platform.audit_events').selectAll().execute())
      for (const s of [secret, ...body.recoveryCodes]) expect(all).not.toContain(s)
      // Keep this authenticator for the later tests (the helper's sign-ins compute its codes).
      rememberFactor(emailOf(role), secret, body.recoveryCodes)
    })
})

describe('the challenge once enrolled (TSK-0015, TSK-0154, HH-STAFF-01)', () => {
  it('[HH-STAFF-01][HH-SEC-02] the password starts a verify session that reaches nothing but the challenge', async () => {
    const res = await password(emailOf('worker'))
    expect(res.json()).toEqual({ mfaRequired: true, step: 'verify' })
    const cookie = cookieOf(res)
    await expectEveryStaffRouteRefused(cookie)
    // A verify session cannot restart enrolment (that would replace the authenticator).
    expect((await post('/staff/auth/mfa/enroll', undefined, { cookie })).statusCode).toBe(409)
    expect((await post('/staff/auth/mfa/verify', { code: '000000' }, { cookie })).statusCode).toBe(401)
    const code = await spendTotp(emailOf('worker'))
    const verified = await post('/staff/auth/mfa/verify', { code }, { cookie })
    expect(verified.statusCode).toBe(200)
    expect((await get('/staff/auth/session', { cookie: cookieOf(verified) })).json()).toMatchObject({
      roles: ['worker'],
      mfaEnrolled: true,
    })
    // A code is never accepted twice.
    const again = cookieOf(await password(emailOf('worker')))
    expect((await post('/staff/auth/mfa/verify', { code }, { cookie: again })).statusCode).toBe(401)
    const audits = await auditOf('staff.mfa_verify', ids.worker)
    expect(audits.map((a) => a.result)).toEqual(['denied', 'succeeded', 'denied'])
    // Sign-out works before the second factor too.
    expect((await post('/staff/auth/sign-out', undefined, { cookie: again })).statusCode).toBe(204)
    expect((await post('/staff/auth/mfa/verify', { code: '123456' }, { cookie: again })).statusCode).toBe(401)
  })

  it('[HH-STAFF-01][HH-SEC-06] a recovery code works once, and its use is audited', async () => {
    const recovery = enrolledFactor(emailOf('estimator'))?.recoveryCodes.shift() as string
    const first = cookieOf(await password(emailOf('estimator')))
    const used = await post('/staff/auth/mfa/verify', { recoveryCode: recovery }, { cookie: first })
    expect(used.statusCode).toBe(200)
    const second = cookieOf(await password(emailOf('estimator')))
    expect((await post('/staff/auth/mfa/verify', { recoveryCode: recovery }, { cookie: second })).statusCode).toBe(401)
    const audits = await auditOf('staff.mfa_verify', ids.estimator)
    expect(audits.map((a) => [a.result, a.summary])).toEqual([
      ['succeeded', { method: 'recovery_code', recoveryCodesLeft: 9 }],
      ['denied', {}],
    ])
    expect(JSON.stringify(audits)).not.toContain(recovery)
  })

  it('[HH-STAFF-03] fresh authentication still works with the authenticator code', async () => {
    const owner = await signIn(emailOf('owner'))
    await sql`UPDATE identity.staff_sessions SET authenticated_at = now() - interval '10 minutes' WHERE revoked_at IS NULL AND staff_user_id = ${ids.owner}`.execute(
      t.db,
    )
    const stale = await post(
      `/staff/members/${ids.worker}/mfa-reset`,
      { reason: 'Lost phone' },
      { ...owner, ...idem() },
    )
    expect(stale.json<{ error: { code: string } }>().error.code).toBe('FRESH_AUTH_REQUIRED')
    expect((await post('/staff/auth/reauth', { code: '000000' }, owner)).statusCode).toBe(401)
    const reauth = await post('/staff/auth/reauth', { code: await spendTotp(emailOf('owner')) }, owner)
    expect(reauth.statusCode).toBe(200)
    expect((await auditOf('staff.reauth', ids.owner)).at(-1)?.summary).toEqual({ method: 'totp' })
  }, 90_000)
})

describe('the Owner resets a lost authenticator (TSK-0154, HH-STAFF-02, OWN-DEC-202)', () => {
  it('[HH-STAFF-02][T26] only the Owner, with a fresh sign-in and a reason, never for themselves', async () => {
    const office = await signIn(emailOf('office'))
    const byOffice = await post(
      `/staff/members/${ids.worker}/mfa-reset`,
      { reason: 'Lost phone' },
      { ...office, ...idem() },
    )
    expect(byOffice.statusCode).toBe(403)
    const owner = await signIn(emailOf('owner'))
    const noReason = await post(`/staff/members/${ids.worker}/mfa-reset`, { reason: '' }, { ...owner, ...idem() })
    expect(noReason.statusCode).toBe(400)
    const self = await post(`/staff/members/${ids.owner}/mfa-reset`, { reason: 'Own phone' }, { ...owner, ...idem() })
    expect(self.statusCode).toBe(403)
    expect(
      await t.db
        .selectFrom('identity.staff_mfa')
        .select('staff_user_id')
        .where('staff_user_id', '=', ids.owner)
        .executeTakeFirst(),
    ).toBeDefined()
  })

  it('[HH-STAFF-02][T22] a reset removes the authenticator and its codes, ends every session and forces a new enrolment', async () => {
    const worker = await signIn(emailOf('worker'))
    const owner = await signIn(emailOf('owner'))
    const liveSessions = async () =>
      (
        await t.db
          .selectFrom('identity.staff_sessions')
          .select('id')
          .where('staff_user_id', '=', ids.worker)
          .where('revoked_at', 'is', null)
          .execute()
      ).length
    const live = await liveSessions()
    expect(live).toBeGreaterThan(0)
    const unused = (
      await t.db
        .selectFrom('identity.staff_recovery_codes')
        .select('id')
        .where('staff_user_id', '=', ids.worker)
        .where('used_at', 'is', null)
        .execute()
    ).length
    expect(unused).toBeGreaterThan(0)
    const res = await post(
      `/staff/members/${ids.worker}/mfa-reset`,
      { reason: 'Synthetic: lost the phone' },
      { ...owner, ...idem() },
    )
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json()).toMatchObject({
      sessionsRevoked: live,
      recoveryCodesRemoved: unused,
      member: { mfaEnrolled: false },
    })
    expect(await liveSessions()).toBe(0)
    expect((await get('/staff/auth/session', { cookie: worker.cookie })).statusCode).toBe(401)
    const rows = await t.db
      .selectFrom('identity.staff_recovery_codes')
      .select('id')
      .where('staff_user_id', '=', ids.worker)
      .execute()
    expect(rows).toEqual([])
    const [event] = await auditOf('staff.mfa_reset', ids.worker)
    expect(event).toMatchObject({
      result: 'succeeded',
      reason: 'Synthetic: lost the phone',
      actor_kind: 'staff',
      step_up_used: true,
      summary: { change: 'mfa_reset', sessionsRevoked: live, recoveryCodesRemoved: unused },
    })
    // Nothing left to reset; the next sign-in enrols.
    const again = await post(`/staff/members/${ids.worker}/mfa-reset`, { reason: 'Again' }, { ...owner, ...idem() })
    expect(codesOf(again)).toEqual(['MFA_NOT_ENROLLED'])
    expect((await password(emailOf('worker'))).json()).toEqual({ mfaRequired: true, step: 'enroll' })
    forgetFactor(emailOf('worker'))
    await signIn(emailOf('worker'))
    expect(enrolledFactor(emailOf('worker'))?.recoveryCodes).toHaveLength(10)
  })
})

describe('offboarding and reactivation (TSK-0154, HH-STAFF-02, OWN-DEC-200, OWN-DEC-202)', () => {
  it('[HH-STAFF-02][T27] disabling removes the authenticator; a re-enabled account sets a password and enrols again', async () => {
    const owner = await signIn(emailOf('owner'))
    const disabled = await post(
      `/staff/members/${ids.estimator}/disable`,
      { reason: 'Synthetic offboarding' },
      { ...owner, ...idem() },
    )
    expect(disabled.statusCode, disabled.body).toBe(200)
    const [event] = await auditOf('staff.disable', ids.estimator)
    expect(event?.summary).toMatchObject({ change: 'disabled', mfaRemoved: true })
    for (const table of ['identity.staff_mfa', 'identity.staff_recovery_codes'] as const)
      expect(
        await t.db.selectFrom(table).select('staff_user_id').where('staff_user_id', '=', ids.estimator).execute(),
      ).toEqual([])
    expect((await password(emailOf('estimator'))).statusCode).toBe(401)
    const enabled = await post(
      `/staff/members/${ids.estimator}/enable`,
      { reason: 'Synthetic return' },
      { ...owner, ...idem() },
    )
    expect(enabled.statusCode, enabled.body).toBe(200)
    // The old password was cleared at offboarding: the person sets a new one through a single-use link.
    expect((await password(emailOf('estimator'))).statusCode).toBe(401)
    const link = await withTx(t.db, (tx) =>
      issueLinkNow(tx, { staffUserId: ids.estimator, purpose: 'reset', issuedBy: 'test' }),
    )
    expect((await post('/staff/auth/password/set', { token: link.token, password: pw(2) })).statusCode).toBe(200)
    expect((await password(emailOf('estimator'), pw(2))).json()).toEqual({ mfaRequired: true, step: 'enroll' })
    forgetFactor(emailOf('estimator'))
    await signIn(emailOf('estimator'), pw(2))
  })
})

describe('accounts from before mandatory MFA (TSK-0154, migration 0071)', () => {
  it('[HH-STAFF-01][HH-SEC-02] the database refuses a complete session without a confirmed authenticator', async () => {
    const insert = withTx(t.db, (tx) =>
      tx
        .insertInto('identity.staff_sessions')
        .values({ staff_user_id: ids.spare, token_hash: 'a'.repeat(64), state: 'complete' })
        .execute(),
    )
    await expect(insert).rejects.toThrow(/second factor/)
  })

  it('[HH-STAFF-01] a session left from optional MFA acts for nobody and the account enrols at its next sign-in', async () => {
    // The state before migration 0071: a complete session of an account without an authenticator.
    const token = 'B'.repeat(43)
    const { createHash } = await import('node:crypto')
    await sql`ALTER TABLE identity.staff_sessions DISABLE TRIGGER staff_sessions_complete_needs_factor`.execute(t.db)
    try {
      await t.db
        .insertInto('identity.staff_sessions')
        .values({
          staff_user_id: ids.spare,
          token_hash: createHash('sha256').update(token).digest('hex'),
          state: 'complete',
        })
        .execute()
    } finally {
      await sql`ALTER TABLE identity.staff_sessions ENABLE TRIGGER staff_sessions_complete_needs_factor`.execute(t.db)
    }
    expect((await get('/staff/members', { cookie: `hh_staff=${token}` })).statusCode).toBe(401)
    const row = await t.db
      .selectFrom('identity.staff_sessions')
      .select(['revoked_at', 'revoke_reason'])
      .where('staff_user_id', '=', ids.spare)
      .executeTakeFirstOrThrow()
    expect(row.revoke_reason).toBe('mfa_required')
    expect((await password(SPARE_OWNER)).json()).toEqual({ mfaRequired: true, step: 'enroll' })
    // Its ID and role stay as they were.
    await signIn(SPARE_OWNER)
    expect(
      (
        await t.db.selectFrom('identity.role_grants').select('name').where('staff_user_id', '=', ids.spare).execute()
      ).map((g) => g.name),
    ).toEqual(['owner'])
  })
})

describe("the Owner's own lost authenticator (TSK-0154, PROPOSED in OWN-DEC-202)", () => {
  it('[HH-STAFF-01][HH-SEC-06] the operations recovery resets an Owner only, audited with its reason', async () => {
    const owner = await signIn(emailOf('owner'))
    const notOwner = await ops((tx) => recoverOwnerMfa(tx, { email: emailOf('office'), reason: 'Not allowed' }))
    expect(notOwner).toEqual({ outcome: 'not_an_owner' })
    const out = await ops((tx) =>
      recoverOwnerMfa(tx, { email: emailOf('owner'), reason: 'Synthetic: Owner lost phone and codes' }),
    )
    expect(out).toMatchObject({ outcome: 'reset', staffUserId: ids.owner })
    expect((await get('/staff/auth/session', { cookie: owner.cookie })).statusCode).toBe(401)
    const [event] = await auditOf('staff.mfa_reset', ids.owner)
    expect(event).toMatchObject({ actor_kind: 'system', reason: 'Synthetic: Owner lost phone and codes' })
    expect(await ops((tx) => recoverOwnerMfa(tx, { email: emailOf('owner'), reason: 'Again' }))).toEqual({
      outcome: 'not_enrolled',
    })
    // MFA stays on: the password alone still reaches only enrolment.
    expect((await password(emailOf('owner'))).json()).toEqual({ mfaRequired: true, step: 'enroll' })
    forgetFactor(emailOf('owner'))
    await signIn(emailOf('owner'))
  })
})

describe('no configuration makes MFA optional (TSK-0154, OWN-DEC-202)', () => {
  it('[HH-SEC-02] without MFA_ENCRYPTION_KEY every staff sign-in is refused (fail closed)', async () => {
    const plain = await buildApp({ config: testConfig({ MFA_ENCRYPTION_KEY: '' }), api: { db: t.db } })
    try {
      for (const role of STAFF_ROLES) {
        const res = (await plain.inject({
          method: 'POST',
          url: '/api/v1/staff/auth/sign-in',
          payload: { email: emailOf(role), password: pw(role === 'estimator' ? 2 : 1) },
        })) as Res
        expect(res.statusCode).toBe(503)
        expect(res.json<{ error: { code: string } }>().error.code).toBe('NOT_CONFIGURED')
        expect(codesOf(res)).toEqual(['MFA_NOT_CONFIGURED'])
        expect(res.headers['set-cookie']).toBeUndefined()
      }
    } finally {
      await plain.close()
    }
  })

  it('[HH-SEC-02] with the key, a correct password never completes a sign-in by itself', async () => {
    for (const role of STAFF_ROLES) {
      const res = await password(emailOf(role), role === 'estimator' ? pw(2) : pw(1))
      expect(res.statusCode).toBe(202)
      expect(res.json<{ mfaRequired: boolean }>().mfaRequired).toBe(true)
    }
  })
})
