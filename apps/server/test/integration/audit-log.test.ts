// The audit-log viewer against PostgreSQL 16 (TSK-0098; HH-SEC-06, HH-STAFF-08, T28, T64, T74, ENT-AuditEvent,
// FACT-RETENTION-SCHEDULE, OWN-DEC-123, OWN-DEC-142, OWN-DEC-70, RULE-SERVER-AUTHZ). Every account, password and
// secret-looking value is synthetic and built at runtime (RULE-SYNTHETIC-DATA); nothing reaches a provider.
import { randomUUID } from 'node:crypto'
import { withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { summaryFields } from '../../src/modules/audit/log.js'
import { audit } from '../../src/platform/audit.js'
import { loadConfig } from '../../src/platform/config/index.js'
import { REDACTED } from '../../src/platform/redact.js'
import { testConfig } from '../fixtures/env.js'

const pw = (n: number) => ['synthetic', 'audit', 'viewer', 'passphrase', String(n)].join(' ')
/** Secret-looking values, built from parts so the secret scanner never sees a literal. */
const secret = (label: string) => ['synthetic', label, 'audit', randomUUID().slice(0, 8)].join('-')
const PEOPLE = ['owner', 'office', 'estimator', 'worker'] as const
type Person = (typeof PEOPLE)[number]
const email = (p: Person) => `${p}-audit-viewer@example.test`

let t: TestDatabase
let app: FastifyInstance
const ids = {} as Record<Person, string>
type Auth = { cookie: string; csrf: string }
const auth = {} as Record<Person, Auth>
const secrets: string[] = []

async function signIn(p: Person): Promise<Auth> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/staff/auth/sign-in',
    headers: { 'x-forwarded-for': '198.51.100.198' },
    payload: { email: email(p), password: pw(1) },
  })
  expect(res.statusCode, res.body).toBe(200)
  return { cookie: String(res.headers['set-cookie']).split(';')[0] as string, csrf: res.json().csrfToken as string }
}
const get = (a: Auth | null, url: string) =>
  app.inject({ method: 'GET', url: `/api/v1${url}`, headers: a ? { cookie: a.cookie } : {} })
const send = (a: Auth, method: 'POST' | 'PUT', url: string, payload: unknown) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    payload: payload as object,
    headers: {
      cookie: a.cookie,
      'x-csrf-token': a.csrf,
      'idempotency-key': `synthetic-audit-viewer-${randomUUID()}`,
      'x-forwarded-for': '198.51.100.198',
    },
  })

type Entry = {
  id: string
  seq: string
  action: string
  area: string
  result: string
  reason: string | null
  stepUpUsed: boolean
  occurredAt: string
  actor: { kind: string; staffUserId: string | null; name: string | null; roles: string[] }
  target: { type: string; id: string | null; version: number | null }
  changes: { path: string; value: unknown }[]
}

/** Every entry a caller sees for a query, following the cursor. */
async function everything(a: Auth, query = ''): Promise<Entry[]> {
  const out: Entry[] = []
  let cursor: string | null = null
  do {
    const sep = query ? '&' : ''
    const res = await get(a, `/staff/audit-events?${query}${sep}limit=50${cursor ? `&cursor=${cursor}` : ''}`)
    expect(res.statusCode, res.body).toBe(200)
    const page = res.json() as { items: Entry[]; nextCursor: string | null }
    out.push(...page.items)
    cursor = page.nextCursor
  } while (cursor)
  return out
}

beforeAll(async () => {
  t = await createTestDatabase()
  app = await buildApp({ config: testConfig({ TRUST_PROXY_HOPS: '1' }), api: { db: t.db } })
  await withTx(t.db, async (tx) => {
    for (const p of PEOPLE) {
      const user = await createStaffUser(tx, {
        email: email(p),
        displayName: `Synthetic audit ${p}`,
        locale: 'en',
        role: p,
        issuedBy: 'test',
      })
      await setPasswordHash(tx, user.id, await hashPassword(pw(1)))
      ids[p] = user.id
    }
  })
  for (const p of PEOPLE) auth[p] = await signIn(p)
  secrets.push(pw(1), ...PEOPLE.flatMap((p) => [auth[p].cookie.split('=')[1] as string, auth[p].csrf]))

  // The Office user's own actions: a language change (audited with its from and to).
  expect((await send(auth.office, 'PUT', '/staff/auth/session/locale', { locale: 'es' })).statusCode).toBe(200)
  // The Owner's actions: a fresh sign-in, then a role grant to the Office user with a reason (staff.grant_role).
  const re = await app.inject({
    method: 'POST',
    url: '/api/v1/staff/auth/reauth',
    headers: { cookie: auth.owner.cookie, 'x-csrf-token': auth.owner.csrf, 'x-forwarded-for': '198.51.100.198' },
    payload: { password: pw(1) },
  })
  expect(re.statusCode, re.body).toBe(200)
  auth.owner = { cookie: String(re.headers['set-cookie']).split(';')[0] as string, csrf: re.json().csrfToken }
  secrets.push(auth.owner.cookie.split('=')[1] as string, auth.owner.csrf)
  const granted = await send(auth.owner, 'POST', `/staff/members/${ids.office}/grants`, {
    kind: 'role',
    name: 'estimator',
    reason: 'Synthetic audit viewer grant',
  })
  expect(granted.statusCode, granted.body).toBe(201)
  // The Owner starts a password recovery for the Worker: the link stays in the outbox, never in the audit log.
  expect((await send(auth.owner, 'POST', `/staff/members/${ids.worker}/password-recovery`, {})).statusCode).toBe(200)

  // A synthetic access-code reveal and message event recorded through the writer: secret fields are redacted.
  const code = secret('gate')
  const body = secret('message')
  const token = secret('token')
  secrets.push(code, body, token)
  await withTx(t.db, (tx) =>
    audit.record(tx, {
      actor: { kind: 'staff', id: ids.owner, roles: ['owner'] },
      action: 'access_code.reveal',
      target: { type: 'property', id: 'synthetic-property-1', version: 3 },
      summary: { accessCode: code, messageBody: body, changes: [{ field: 'token', from: null, to: token }] },
      requestId: 'req-synthetic-audit-viewer-1',
    }),
  )
  // A row stored before a field name joined the secret schema (inserted directly, bypassing the writer): the viewer
  // redacts it on the way out, and the stored row is never changed.
  const legacy = secret('legacy')
  secrets.push(legacy)
  await sql`INSERT INTO platform.audit_events (actor_kind, actor_id, actor_roles, action, target_type, target_id,
              result, summary, request_id)
            VALUES ('staff', ${ids.owner}, '{owner}', 'property.update', 'property', 'synthetic-property-1',
              'succeeded', ${JSON.stringify({ gateCode: legacy, note: 'kept' })}::jsonb, 'req-synthetic-audit-viewer-2')`.execute(
    t.db,
  )
})
afterAll(async () => {
  await app?.close()
  await t?.drop()
})

describe('who sees the audit log (TSK-0098, HH-SEC-06, HH-STAFF-08, ROLE-MATRIX audit.view)', () => {
  it('[HH-SEC-06][HH-STAFF-08] the Owner sees every entry, with who, when, the record and the change summary', async () => {
    const entries = await everything(auth.owner)
    const actors = new Set(entries.map((e) => e.actor.staffUserId))
    for (const p of ['owner', 'office'] as const) expect(actors.has(ids[p]), p).toBe(true)
    // Sign-ins are recorded by the signing-in caller (a guest until the password is checked) on the account.
    for (const p of PEOPLE)
      expect(
        entries.some((e) => e.action === 'staff.sign_in' && e.target.id === ids[p] && e.actor.kind === 'guest'),
        p,
      ).toBe(true)
    const locale = entries.find((e) => e.action === 'staff.locale_change')
    expect(locale).toMatchObject({
      area: 'staff',
      result: 'succeeded',
      actor: { kind: 'staff', staffUserId: ids.office, name: 'Synthetic audit office', roles: ['office'] },
      changes: [
        { path: 'to', value: 'es' },
        { path: 'from', value: 'en' },
      ],
    })
    expect(Date.parse(locale?.occurredAt ?? '')).not.toBeNaN()
    // Newest first, by the log's own sequence.
    const seqs = entries.map((e) => BigInt(e.seq))
    expect(seqs).toEqual([...seqs].sort((a, b) => (a > b ? -1 : a < b ? 1 : 0)))
    const overview = await get(auth.owner, '/staff/audit-log')
    expect(overview.statusCode).toBe(200)
    expect(overview.json()).toMatchObject({ visibility: 'all' })
    expect(
      overview
        .json()
        .staff.map((s: { id: string }) => s.id)
        .sort(),
    ).toEqual(PEOPLE.map((p) => ids[p]).sort())
  })

  it('[HH-SEC-06][HH-STAFF-08] Office sees only their own actions: never the Owner-only entries, whatever the filter', async () => {
    const entries = await everything(auth.office)
    expect(entries.length).toBeGreaterThan(0)
    expect(entries.every((e) => e.actor.kind === 'staff' && e.actor.staffUserId === ids.office)).toBe(true)
    expect(entries.map((e) => e.action)).toEqual(['staff.locale_change'])
    // Sign-ins are recorded by the guest caller, so they are the Owner's view (PROPOSED reading of "own actions").
    // The Owner's grant to this Office user, the recovery and the reveal are Owner-only entries.
    for (const action of ['staff.grant_role', 'staff.start_password_recovery', 'access_code.reveal'])
      expect(entries.some((e) => e.action === action)).toBe(false)
    // Asking for the Owner's entries, or for the record the Owner changed, reaches nothing.
    expect(await everything(auth.office, `actor=${ids.owner}`)).toEqual([])
    expect(
      (await everything(auth.office, `targetId=${ids.office}`)).every((e) => e.actor.staffUserId === ids.office),
    ).toBe(true)
    expect(await everything(auth.office, 'action=staff.grant_role')).toEqual([])
    // A crafted cursor below every sequence still reads inside the scope only.
    const crafted = Buffer.from(JSON.stringify(['9223372036854775807']), 'utf8').toString('base64url')
    const page = await get(auth.office, `/staff/audit-events?cursor=${crafted}`)
    expect(page.statusCode).toBe(200)
    expect(
      (page.json().items as Entry[]).every((e) => e.actor.staffUserId === ids.office && e.actor.kind === 'staff'),
    ).toBe(true)
    const overview = (await get(auth.office, '/staff/audit-log')).json()
    expect(overview).toMatchObject({ visibility: 'own', staff: [] })
    expect(overview.retention).toMatchObject({ pastPeriod: null, oldestAt: null })
  })

  it('[HH-SEC-06][T26] Estimators, Workers, customers and guests get no audit-log screen', async () => {
    for (const p of ['estimator', 'worker'] as const)
      for (const url of ['/staff/audit-log', '/staff/audit-events']) {
        const res = await get(auth[p], url)
        expect(res.statusCode, `${p} ${url}`).toBe(403)
      }
    for (const url of ['/staff/audit-log', '/staff/audit-events']) expect((await get(null, url)).statusCode).toBe(401)
  })

  it('[HH-SEC-06] entries cannot be edited or deleted through the API: no write route exists', async () => {
    const entry = (await everything(auth.owner))[0] as Entry
    for (const method of ['PUT', 'PATCH', 'DELETE', 'POST'] as const) {
      const res = await app.inject({
        method,
        url: `/api/v1/staff/audit-events/${entry.id}`,
        headers: { cookie: auth.owner.cookie, 'x-csrf-token': auth.owner.csrf },
        payload: {},
      })
      expect(res.statusCode, method).toBe(404)
    }
    await expect(sql`DELETE FROM platform.audit_events WHERE id = ${entry.id}::uuid`.execute(t.db)).rejects.toThrow(
      /APPEND_ONLY/,
    )
  })
})

describe('filters and paging (TSK-0098, HH-STAFF-08)', () => {
  it('[HH-STAFF-08] filters by area, action, result, actor, record and date; pages without overlap', async () => {
    const all = await everything(auth.owner)
    const staffArea = await everything(auth.owner, 'area=staff')
    expect(staffArea.length).toBeGreaterThan(0)
    expect(staffArea.every((e) => e.area === 'staff')).toBe(true)
    const grants = await everything(auth.owner, 'action=staff.grant_role')
    expect(grants).toHaveLength(1)
    const byActor = await everything(auth.owner, `actor=${ids.office}`)
    expect(byActor.map((e) => e.action)).toEqual(['staff.locale_change'])
    expect(await everything(auth.owner, `actor=${ids.estimator}`)).toEqual([])
    const byRecord = await everything(auth.owner, `targetType=property&targetId=synthetic-property-1`)
    expect(byRecord.map((e) => e.action).sort()).toEqual(['access_code.reveal', 'property.update'])
    expect(await everything(auth.owner, 'result=failed')).toEqual(all.filter((e) => e.result === 'failed'))
    // Today (in any zone) holds everything; a range in the past holds nothing.
    const today = new Date()
    const day = (d: Date) => d.toISOString().slice(0, 10)
    const from = day(new Date(today.getTime() - 2 * 86_400_000))
    const to = day(new Date(today.getTime() + 2 * 86_400_000))
    expect((await everything(auth.owner, `from=${from}&to=${to}`)).length).toBe(all.length)
    expect(await everything(auth.owner, 'from=2020-01-01&to=2020-01-31')).toEqual([])
    // Pages of two never overlap and together are the whole list.
    const seen: string[] = []
    let cursor: string | null = null
    do {
      const res = await get(auth.owner, `/staff/audit-events?limit=2${cursor ? `&cursor=${cursor}` : ''}`)
      const page = res.json() as { items: Entry[]; nextCursor: string | null }
      expect(page.items.length).toBeLessThanOrEqual(2)
      seen.push(...page.items.map((e) => e.id))
      cursor = page.nextCursor
    } while (cursor)
    expect(seen).toEqual(all.map((e) => e.id))
  })

  it('[HH-API-05] a bad date, range or cursor is a 400, never a database error', async () => {
    for (const q of [
      'from=2026-02-30',
      'to=2026-13-01',
      'from=2026-05-02&to=2026-05-01',
      `cursor=${Buffer.from(JSON.stringify(['x'])).toString('base64url')}`,
      `cursor=${Buffer.from(JSON.stringify(['1', '2'])).toString('base64url')}`,
      'area=Staff',
      'actor=not-a-staff-id',
      'surprise=1',
    ]) {
      const res = await get(auth.owner, `/staff/audit-events?${q}`)
      expect(res.statusCode, q).toBe(400)
      expect(res.json().error.code, q).toBe('VALIDATION_FAILED')
    }
  })
})

describe('no secret in any entry (TSK-0098, HH-SEC-06, T28, T74, HH-SEC-04)', () => {
  it('[T74][T28][HH-SEC-06] no password, session, CSRF token, access code, message or link in the viewer or the log', async () => {
    const shown = JSON.stringify(await everything(auth.owner))
    const stored = JSON.stringify(await t.db.selectFrom('platform.audit_events').selectAll().execute())
    for (const s of secrets) expect(shown, 'viewer').not.toContain(s)
    // The writer redacts; only the directly inserted legacy row holds its value, and the viewer still hides it.
    for (const s of secrets.slice(0, -1)) expect(stored, 'stored').not.toContain(s)
    expect(shown).not.toMatch(/argon2|passphrase/)
    const links = JSON.stringify(await t.db.selectFrom('identity.staff_links').select('token_hash').execute())
    for (const hash of links.match(/[0-9a-f]{64}/g) ?? []) expect(shown).not.toContain(hash)
    const reveal = (await everything(auth.owner, 'action=access_code.reveal'))[0] as Entry
    // PostgreSQL stores jsonb keys in its own order; the pairs are compared as a set.
    const pairs = (e: Entry) => e.changes.map((c) => `${c.path}=${String(c.value)}`).sort()
    expect(pairs(reveal)).toEqual(
      [
        `accessCode=${REDACTED}`,
        `messageBody=${REDACTED}`,
        'changes[1].field=token',
        `changes[1].from=${REDACTED}`,
        `changes[1].to=${REDACTED}`,
      ].sort(),
    )
    const legacy = (await everything(auth.owner, 'action=property.update'))[0] as Entry
    expect(pairs(legacy)).toEqual([`gateCode=${REDACTED}`, 'note=kept'])
  })

  it('[T64][T74] a sensitive Owner action is traceable: actor, time, record version, reason and fresh sign-in', async () => {
    const [grant] = await everything(auth.owner, 'action=staff.grant_role')
    expect(grant).toMatchObject({
      actor: { kind: 'staff', staffUserId: ids.owner, roles: ['owner'] },
      target: { type: 'staff_user', id: ids.office },
      reason: 'Synthetic audit viewer grant',
      stepUpUsed: true,
      result: 'succeeded',
    })
    expect(grant?.target.version).toEqual(expect.any(Number))
    expect(grant?.changes).toEqual(expect.arrayContaining([{ path: 'name', value: 'estimator' }]))
  })

  it('[HH-SEC-06] the summary flattening keeps nulls, numbers lists and caps long values', () => {
    expect(summaryFields({ from: null, to: 'x', roles: [], n: 2, ok: true, list: ['a', 'b'] })).toEqual([
      { path: 'from', value: null },
      { path: 'to', value: 'x' },
      { path: 'roles', value: null },
      { path: 'n', value: 2 },
      { path: 'ok', value: true },
      { path: 'list[1]', value: 'a' },
      { path: 'list[2]', value: 'b' },
    ])
    const long = summaryFields({ text: 'y'.repeat(600) })[0]?.value as string
    expect(long.length).toBe(501)
  })
})

describe('retention (TSK-0098, HH-SEC-06, FACT-RETENTION-SCHEDULE, OWN-DEC-142, OWN-DEC-70)', () => {
  it('[HH-SEC-06] 7 years is active configuration; nothing is deleted automatically', async () => {
    const entry = (await loadConfig(t.db)).get('retention.audit_log')
    expect(entry).toMatchObject({
      state: 'CONFIGURED',
      proposed: false,
      value: { years: 7, afterPeriod: 'owner_deletion_review', automaticDeletion: false, holdsKeepRecords: true },
    })
    expect(entry.sourceIds).toEqual(expect.arrayContaining(['OWN-DEC-142', 'FACT-RETENTION-SCHEDULE']))
  })

  it('[HH-SEC-06] an entry past the period is counted for the Owner deletion review and stays in the log', async () => {
    const before = (await get(auth.owner, '/staff/audit-log')).json()
    expect(before.retention).toMatchObject({
      state: 'CONFIGURED',
      years: 7,
      afterPeriod: 'owner_deletion_review',
      automaticDeletion: false,
      holdsKeepRecords: true,
      awaitingConfirmation: true,
      pastPeriod: 0,
    })
    // An entry recorded eight years ago (synthetic, inserted with its time).
    await sql`INSERT INTO platform.audit_events (occurred_at, actor_kind, actor_process, action, target_type, result,
                summary, request_id)
              VALUES (now() - interval '8 years', 'system', 'synthetic-test', 'automation.retry', 'job', 'succeeded',
                '{}'::jsonb, 'req-synthetic-audit-old-1')`.execute(t.db)
    const after = (await get(auth.owner, '/staff/audit-log')).json()
    expect(after.retention.pastPeriod).toBe(1)
    expect(Date.parse(after.retention.oldestAt)).toBeLessThan(Date.now() - 7 * 365 * 86_400_000)
    const old = await everything(auth.owner, 'action=automation.retry')
    expect(old).toHaveLength(1)
    expect(old[0]?.actor).toMatchObject({ kind: 'system', staffUserId: null, name: null })
  })
})
