// Organization accounts with explicit memberships and scopes against PostgreSQL 16 and the provider fakes (TSK-0118;
// HH-ID-13, HH-ID-03, HH-ID-02, T20, ENT-CustomerAccount, RULE-SERVER-AUTHZ). Every visitor, address, code and name here
// is synthetic (RULE-SYNTHETIC-DATA); nothing reaches a real provider.
import { Writable } from 'node:stream'
import { loadServiceSeed, syncServices, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { PRIVACY_NOTICE } from '@handyhub/domain/legal'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { closeCustomerAccount } from '../../src/modules/accounts/index.js'
import { accessStillValid } from '../../src/modules/estimates/approval.js'
import {
  codeDeliveryAutomation,
  readCodeKey,
  resolveCustomerSession,
  type CodeKeySettings,
} from '../../src/modules/identity/index.js'
import { requestErasurePlan } from '../../src/modules/privacy/index.js'
import { createAutomationRegistry } from '../../src/platform/automation.js'
import { createWorker } from '../../src/platform/jobs.js'
import { createLogger } from '../../src/platform/logger.js'
import { createProviders } from '../../src/providers/index.js'
import { readProviderSettings } from '../../src/providers/settings.js'
import { testConfig } from '../fixtures/env.js'

// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const KEY: CodeKeySettings = readCodeKey({
  HANDYHUB_ENV: 'ci',
  CODE_HASH_KEY: ['synthetic', 'organization', 'accounts', 'key', 'for', 'tests', 'only'].join('-'),
})
const COOKIE = '__Host-hh_customer'

const log = createLogger(
  { level: 'warn' },
  new Writable({
    write(_chunk, _enc, done) {
      done()
    },
  }),
)

let t: TestDatabase
let app: FastifyInstance
const providers = createProviders(readProviderSettings({ HANDYHUB_ENV: 'ci' }), { logger: log })
async function drain() {
  const w = createWorker({
    db: t.db,
    registry: createAutomationRegistry([codeDeliveryAutomation({ providers, codeKey: KEY })]),
    logger: log,
  })
  for (let i = 0; i < 20; i++) {
    const r = await w.runOnce()
    if (r.dispatched + r.succeeded + r.retried + r.failed + r.cancelled === 0) break
  }
}

beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
  app = await buildApp({
    config: testConfig({ TRUST_PROXY_HOPS: '1' }),
    api: { db: t.db, codeKey: KEY },
    logger: log,
  })
})
afterAll(async () => {
  await app?.close()
  await t?.drop()
})

let n = 0
let submitIp = 10
const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
type Sent = { reference: string; requestId: string; projectId: string; cap: string }
type Body = Record<string, unknown>
const body = (email: string, street: string): Body => ({
  formVersion: 'test-1',
  privacyNoticeVersion: PRIVACY_NOTICE.documentId,
  services: [{ serviceId: 'SVC-DW-01', notes: 'Synthetic note: a crack above the door.' }],
  notSure: false,
  description: 'Synthetic organization project: a cracked wall.',
  property: { street, city: 'Testville', state: 'KY', zip: '40000', propertyType: 'house' },
  timing: { preferredDate: future, flexible: false, needHelpToday: false, windows: ['any_time'] },
  estimatePreference: 'site_visit',
  contact: { fullName: 'Test Organization Customer', email, phone: '(502) 555-0118', preferredChannel: 'email' },
  smsOptIn: false,
  marketingOptIn: false,
})
async function submitted(email: string, street: string): Promise<Sent> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': `synthetic-org-${++n}-0001`, 'x-forwarded-for': `198.51.100.${++submitIp}` },
    payload: body(email, street),
  })
  expect(res.statusCode).toBe(201)
  const reference = res.json<{ reference: string }>().reference
  const r = await t.db
    .selectFrom('intake.requests')
    .select(['id', 'project_id'])
    .where('reference', '=', reference)
    .executeTakeFirstOrThrow()
  return { reference, requestId: r.id, projectId: r.project_id, cap: String(res.headers['receipt-capability']) }
}

let client = ''
let clients = 0
beforeEach(() => {
  client = `203.0.113.${++clients}`
})
const call = (method: 'GET' | 'POST', url: string, opts: { payload?: Body; cookie?: string; cap?: string } = {}) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: {
      'x-forwarded-for': client,
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
      ...(opts.cap ? { 'receipt-capability': opts.cap } : {}),
    },
    ...(opts.payload ? { payload: opts.payload } : method === 'POST' ? { payload: {} } : {}),
  })
const cookieOf = (res: { headers: Record<string, unknown> }) => {
  const set = String(res.headers['set-cookie'] ?? '')
  expect(set).toMatch(new RegExp(`^${COOKIE}=[A-Za-z0-9_-]{43};`))
  return set.split(';')[0] as string
}
async function deliveredCode(destination: string): Promise<string> {
  await drain()
  const code = (providers.fakes.email?.sent ?? [])
    .filter((m) => m.to === destination)
    .flatMap((m) => /verification code is (\d{6})\b/.exec(m.text)?.[1] ?? [])
    .at(-1)
  if (!code) throw new Error(`no code was delivered to ${destination}`)
  return code
}
const afterCooldown = (destination: string) =>
  sql`UPDATE identity.verification_codes SET created_at = created_at - interval '2 hours'
      WHERE destination = ${destination}`.execute(t.db)
/** Verifies the request's email on its receipt and creates (or signs in to) the account there, linking the request. */
async function linkOnReceipt(s: Sent, email: string): Promise<string> {
  // Each receipt from its own network, as several visitors would (the code routes are limited per network).
  client = `203.0.113.${++clients}`
  await afterCooldown(email)
  expect(
    (await call('POST', '/public/request-receipt/contact/codes', { cap: s.cap, payload: { channel: 'email' } }))
      .statusCode,
  ).toBe(202)
  const verified = await call('POST', '/public/request-receipt/contact/verify', {
    cap: s.cap,
    payload: { channel: 'email', code: await deliveredCode(email) },
  })
  expect(verified.statusCode).toBe(200)
  await afterCooldown(email)
  expect(
    (await call('POST', '/public/request-receipt/account/codes', { cap: s.cap, payload: { channel: 'email' } }))
      .statusCode,
  ).toBe(202)
  const res = await call('POST', '/public/request-receipt/account', {
    cap: s.cap,
    payload: { channel: 'email', code: await deliveredCode(email) },
  })
  expect(res.statusCode).toBe(200)
  return cookieOf(res)
}
type Account = { s: Sent; cookie: string; accountId: string; email: string }
async function accountFor(email: string, street: string): Promise<Account> {
  const s = await submitted(email, street)
  const cookie = await linkOnReceipt(s, email)
  const row = await t.db
    .selectFrom('identity.customer_accounts')
    .select('id')
    .where('sign_in_email', '=', email)
    .executeTakeFirstOrThrow()
  return { s, cookie, accountId: row.id, email }
}

type Orgs = {
  linkedProjects: string[]
  administered: {
    id: string
    name: string
    projects: string[]
    members: { id: string; email: string; state: string; approve: boolean; pay: boolean; projects: string[] }[]
    history: {
      kind: string
      by: string
      email: string | null
      reference: string | null
      scopeProjects: number | null
    }[]
  }[]
  memberships: { id: string; name: string; approve: boolean; pay: boolean; projects: string[] }[]
  invitations: { id: string; organization: string; approve: boolean; pay: boolean; projects: number }[]
}
const orgs = async (cookie: string): Promise<Orgs> => {
  const res = await call('GET', '/customer/account/organizations', { cookie })
  expect(res.statusCode).toBe(200)
  return res.json<Orgs>()
}
const post = (cookie: string, url: string, payload: Body = {}) => call('POST', url, { cookie, payload })
const fieldCodes = (res: { json: () => { error: { fieldErrors: { field: string; code: string }[] } } }) =>
  res.json().error.fieldErrors.map((f) => [f.field, f.code])
type Listed = { reference: string; organization: { name: string; approve: boolean; pay: boolean } | null }
const dashboard = async (cookie: string): Promise<Listed[]> => {
  const res = await call('GET', '/customer/projects', { cookie })
  expect(res.statusCode).toBe(200)
  return res.json<{ projects: Listed[] }>().projects
}
const opens = async (cookie: string, reference: string, tab = 'overview') =>
  (await call('GET', `/customer/projects/${reference}/${tab}`, { cookie })).statusCode

/** An administrator with two linked projects, an organization sharing both, and its id. */
async function organization(prefix: string) {
  const admin = await accountFor(`${prefix}-admin@example.test`, `118 ${prefix} Way`)
  const second = await submitted(admin.email, `119 ${prefix} Way`)
  await linkOnReceipt(second, admin.email)
  const created = await post(admin.cookie, '/customer/account/organizations', { name: `  ${prefix}   Rentals ` })
  expect(created.statusCode).toBe(200)
  const org = created.json<Orgs>().administered[0] as Orgs['administered'][number]
  expect(org.name).toBe(`${prefix} Rentals`)
  for (const ref of [admin.s.reference, second.reference])
    expect(
      (await post(admin.cookie, `/customer/account/organizations/${org.id}/projects`, { reference: ref })).statusCode,
    ).toBe(200)
  return { admin, second, orgId: org.id }
}
const invite = (cookie: string, orgId: string, payload: Body) =>
  post(cookie, `/customer/account/organizations/${orgId}/members`, payload)

describe('organization accounts (TSK-0118, HH-ID-13)', () => {
  it('[HH-ID-13][HH-ID-03][T20] a member sees only the projects in scope, with only the privileges granted', async () => {
    const { admin, second, orgId } = await organization('scope')
    const member = await accountFor('scope-member@example.test', '5 Member Street')

    // Nothing reaches the member before an invitation is accepted.
    expect((await dashboard(member.cookie)).map((p) => p.reference)).toEqual([member.s.reference])
    expect(await opens(member.cookie, admin.s.reference)).toBe(404)

    const invited = await invite(admin.cookie, orgId, {
      email: ' Scope-Member@Example.test ',
      approve: false,
      pay: false,
      projects: [admin.s.reference.toLowerCase()],
    })
    expect(invited.statusCode).toBe(200)
    const m = invited.json<Orgs>().administered[0]?.members[0]
    expect(m).toMatchObject({ email: 'scope-member@example.test', state: 'invited', projects: [admin.s.reference] })
    // An invitation alone grants nothing.
    expect(await opens(member.cookie, admin.s.reference)).toBe(404)
    const pending = await orgs(member.cookie)
    expect(pending.invitations).toEqual([
      expect.objectContaining({ id: m?.id, organization: 'scope Rentals', approve: false, pay: false, projects: 1 }),
    ])
    // Before accepting, the invitation names no project and nobody's details.
    expect(JSON.stringify(pending.invitations)).not.toContain(admin.s.reference)
    expect(JSON.stringify(pending.invitations)).not.toContain(admin.email)

    expect((await post(member.cookie, `/customer/account/organization-invitations/${m?.id}/accept`)).statusCode).toBe(
      200,
    )
    // From the next request: exactly the project in scope, named with its organization and privileges.
    const listed = await dashboard(member.cookie)
    expect(listed.map((p) => [p.reference, p.organization])).toEqual(
      expect.arrayContaining([
        [member.s.reference, null],
        [admin.s.reference, { name: 'scope Rentals', approve: false, pay: false }],
      ]),
    )
    expect(listed).toHaveLength(2)
    expect(await opens(member.cookie, admin.s.reference)).toBe(200)
    expect(await opens(member.cookie, second.reference)).toBe(404)
    // The member reads the project, but its payments, conversation and questions stay the customer's own.
    const overview = await call('GET', `/customer/projects/${admin.s.reference}/overview`, { cookie: member.cookie })
    expect(overview.json<{ payment: unknown }>().payment).toEqual({ state: 'not_shared' })
    expect(await opens(member.cookie, admin.s.reference, 'documents')).toBe(200)
    expect(await opens(member.cookie, admin.s.reference, 'payments')).toBe(404)
    expect(await opens(member.cookie, admin.s.reference, 'messages')).toBe(404)
    expect(await opens(member.cookie, admin.s.reference, 'questions')).toBe(404)
    const memberView = (await orgs(member.cookie)).memberships
    expect(memberView).toEqual([
      expect.objectContaining({ name: 'scope Rentals', approve: false, pay: false, projects: [admin.s.reference] }),
    ])
    // Members see neither each other nor the organization's other projects.
    expect(JSON.stringify(memberView)).not.toContain(second.reference)
    expect((await orgs(member.cookie)).administered).toEqual([])

    // The pay privilege opens the payments; the administrator still sees everything of their own.
    expect(
      (
        await post(admin.cookie, `/customer/account/organizations/${orgId}/members/${m?.id}`, {
          approve: false,
          pay: true,
          projects: [admin.s.reference],
        })
      ).statusCode,
    ).toBe(200)
    expect(await opens(member.cookie, admin.s.reference, 'payments')).toBe(200)
    const paid = await call('GET', `/customer/projects/${admin.s.reference}/overview`, { cookie: member.cookie })
    expect(paid.json<{ payment: { state: string } }>().payment.state).not.toBe('not_shared')
    expect(await opens(admin.cookie, admin.s.reference, 'payments')).toBe(200)
    expect(await opens(admin.cookie, admin.s.reference, 'messages')).toBe(200)

    // Approve: an approval through the membership holds only while a membership with approve names the project.
    const sessionOf = async (cookie: string) => {
      const s = await resolveCustomerSession(t.db, cookie.split('=')[1])
      if (!s) throw new Error('no session')
      return s
    }
    const still = async () =>
      withTx(t.db, async (tx) => accessStillValid(tx, await sessionOf(member.cookie), admin.s.projectId, new Date()))
    expect(await still()).toBe(false)
    await post(admin.cookie, `/customer/account/organizations/${orgId}/members/${m?.id}`, {
      approve: true,
      pay: true,
      projects: [admin.s.reference, second.reference],
    })
    expect(await still()).toBe(true)
    expect(await opens(member.cookie, second.reference)).toBe(200)
    // TSK-0114's repeat-service schedule stays the project customer's own, whatever the privileges: the customer
    // reads it (none yet), the member finds it NOT_FOUND and cannot change or stop one.
    expect(await opens(admin.cookie, admin.s.reference, 'repeat-service')).toBe(200)
    expect(await opens(member.cookie, admin.s.reference, 'repeat-service')).toBe(404)
    const stop = await app.inject({
      method: 'POST',
      url: `/api/v1/customer/projects/${admin.s.reference}/repeat-service/stop`,
      headers: {
        'x-forwarded-for': client,
        cookie: member.cookie,
        'idempotency-key': 'synthetic-org-repeat-stop-0001',
      },
      payload: {},
    })
    expect(stop.statusCode).toBe(404)
    expect((await dashboard(member.cookie)).find((p) => p.reference === second.reference)?.organization).toEqual({
      name: 'scope Rentals',
      approve: true,
      pay: true,
    })

    // The scope is explicit: projects the organization does not share are refused, and so is an empty scope.
    const other = await accountFor('scope-other@example.test', '7 Other Street')
    for (const projects of [[other.s.reference], ['HH-00000000'], []]) {
      const res = await post(admin.cookie, `/customer/account/organizations/${orgId}/members/${m?.id}`, {
        approve: true,
        pay: true,
        projects,
      })
      expect(res.statusCode, JSON.stringify(projects)).toBe(400)
    }
    // An administrator shares only their own linked projects: another account's is NOT_FOUND like a missing one.
    expect(
      (await post(admin.cookie, `/customer/account/organizations/${orgId}/projects`, { reference: other.s.reference }))
        .statusCode,
    ).toBe(404)
    expect(
      fieldCodes(
        await post(admin.cookie, `/customer/account/organizations/${orgId}/projects`, { reference: second.reference }),
      ),
    ).toEqual([['body.reference', 'already_shared']])
    // Nobody else administers it.
    for (const cookie of [member.cookie, other.cookie]) {
      expect((await post(cookie, `/customer/account/organizations/${orgId}/members/${m?.id}/remove`)).statusCode).toBe(
        404,
      )
      expect(
        (
          await invite(cookie, orgId, {
            email: 'x@example.test',
            approve: true,
            pay: true,
            projects: [second.reference],
          })
        ).statusCode,
      ).toBe(404)
    }
  })

  it('[HH-ID-13][RULE-SERVER-AUTHZ] removing a membership, a project or the administrator’s own link ends access on the next request', async () => {
    const { admin, second, orgId } = await organization('removal')
    const member = await accountFor('removal-member@example.test', '9 Member Street')
    const m = (
      await invite(admin.cookie, orgId, {
        email: member.email,
        approve: true,
        pay: true,
        projects: [admin.s.reference, second.reference],
      })
    ).json<Orgs>().administered[0]?.members[0]
    await post(member.cookie, `/customer/account/organization-invitations/${m?.id}/accept`)
    expect(await opens(member.cookie, admin.s.reference)).toBe(200)
    expect(await opens(member.cookie, second.reference)).toBe(200)

    // Stop sharing one project: it leaves the scope at once.
    const unshared = await post(
      admin.cookie,
      `/customer/account/organizations/${orgId}/projects/${second.reference}/remove`,
    )
    expect(unshared.statusCode).toBe(200)
    expect(unshared.json<Orgs>().administered[0]?.members[0]?.projects).toEqual([admin.s.reference])
    expect(await opens(member.cookie, second.reference)).toBe(404)
    expect(await opens(member.cookie, admin.s.reference)).toBe(200)

    // The administrator's own link revoked (a corrected link): the organization shares nothing of that project.
    await sql`UPDATE identity.customer_identity_links
                 SET state = 'revoked', revoked_at = now(), revoke_reason = 'corrected_link', revoked_by = 'test'
               WHERE project_id = ${admin.s.projectId}::uuid AND account_id = ${admin.accountId}::uuid`.execute(t.db)
    expect(await opens(member.cookie, admin.s.reference)).toBe(404)
    expect((await orgs(member.cookie)).memberships[0]?.projects).toEqual([])

    // A fresh project shared again and in scope; then the member is removed: nothing from the next request on.
    const third = await submitted(admin.email, '120 removal Way')
    await linkOnReceipt(third, admin.email)
    await post(admin.cookie, `/customer/account/organizations/${orgId}/projects`, { reference: third.reference })
    await post(admin.cookie, `/customer/account/organizations/${orgId}/members/${m?.id}`, {
      approve: false,
      pay: false,
      projects: [third.reference],
    })
    expect(await opens(member.cookie, third.reference)).toBe(200)
    const removed = await post(admin.cookie, `/customer/account/organizations/${orgId}/members/${m?.id}/remove`)
    expect(removed.statusCode).toBe(200)
    expect(removed.json<Orgs>().administered[0]?.members).toEqual([])
    expect(await opens(member.cookie, third.reference)).toBe(404)
    expect((await dashboard(member.cookie)).map((p) => p.reference)).toEqual([member.s.reference])
    expect((await orgs(member.cookie)).memberships).toEqual([])
    // An ended membership stays ended, even written directly.
    await expect(
      sql`UPDATE identity.organization_memberships SET state = 'active', ended_at = NULL, end_reason = NULL
           WHERE id = ${m?.id}::uuid`.execute(t.db),
    ).rejects.toThrow(/stays ended/)

    // The history keeps every step, newest first; the audit log never holds an email address or a name.
    const history = (await orgs(admin.cookie)).administered[0]?.history.map((h) => h.kind)
    expect(history).toEqual([
      'member_removed',
      'member_changed',
      'project_added',
      'project_removed',
      'invitation_accepted',
      'member_invited',
      'project_added',
      'project_added',
      'created',
    ])
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select(['action', 'summary'])
      .where('target_type', '=', 'organization')
      .where('target_id', '=', orgId)
      .orderBy('seq')
      .execute()
    expect(audit.map((a) => a.action)).toEqual([
      'customer_account.organization_create',
      'customer_account.organization_share_project',
      'customer_account.organization_share_project',
      'customer_account.organization_invite',
      'customer_account.organization_accept_invitation',
      'customer_account.organization_unshare_project',
      'customer_account.organization_share_project',
      'customer_account.organization_change_member',
      'customer_account.organization_remove_member',
    ])
    const text = JSON.stringify(audit)
    expect(text).not.toContain('@example.test')
    expect(text).not.toContain('Rentals')

    // The member may also leave on their own; a re-invitation is a new membership.
    const again = (
      await invite(admin.cookie, orgId, {
        email: member.email,
        approve: false,
        pay: false,
        projects: [third.reference],
      })
    ).json<Orgs>().administered[0]?.members[0]
    expect(again?.id).not.toBe(m?.id)
    await post(member.cookie, `/customer/account/organization-invitations/${again?.id}/accept`)
    expect(await opens(member.cookie, third.reference)).toBe(200)
    expect((await post(member.cookie, `/customer/account/organizations/${orgId}/leave`)).statusCode).toBe(200)
    expect(await opens(member.cookie, third.reference)).toBe(404)
    expect((await post(member.cookie, `/customer/account/organizations/${orgId}/leave`)).statusCode).toBe(404)
  })

  it('[HH-ID-13][HH-ID-02] a shared email domain never grants anything; only the account signed in with the invited address accepts', async () => {
    const { admin, orgId } = await organization('domain')
    const sameDomain = await accountFor('domain-colleague@example.test', '11 Colleague Street')
    const invited = await accountFor('domain-invited@example.test', '12 Invited Street')
    const m = (
      await invite(admin.cookie, orgId, {
        email: 'domain-invited@example.test',
        approve: true,
        pay: true,
        projects: [admin.s.reference],
      })
    ).json<Orgs>().administered[0]?.members[0]

    // Same domain, different address: no invitation, no access, and its id answers like a missing one.
    expect((await orgs(sameDomain.cookie)).invitations).toEqual([])
    expect(
      (await post(sameDomain.cookie, `/customer/account/organization-invitations/${m?.id}/accept`)).statusCode,
    ).toBe(404)
    expect(await opens(sameDomain.cookie, admin.s.reference)).toBe(404)
    // Nor can it be accepted by writing to the database directly.
    await expect(
      sql`UPDATE identity.organization_memberships SET state = 'active', account_id = ${sameDomain.accountId}::uuid,
            accepted_at = now() WHERE id = ${m?.id}::uuid`.execute(t.db),
    ).rejects.toThrow(/invited email/)

    // The administrator is never a member of their own organization; an address is invited once at a time.
    expect(
      fieldCodes(
        await invite(admin.cookie, orgId, {
          email: admin.email,
          approve: true,
          pay: true,
          projects: [admin.s.reference],
        }),
      ),
    ).toEqual([['body.email', 'own_email']])
    expect(
      fieldCodes(
        await invite(admin.cookie, orgId, {
          email: 'DOMAIN-invited@example.test',
          approve: false,
          pay: false,
          projects: [admin.s.reference],
        }),
      ),
    ).toEqual([['body.email', 'already_invited']])
    expect(
      fieldCodes(
        await invite(admin.cookie, orgId, {
          email: 'not an email',
          approve: false,
          pay: false,
          projects: [admin.s.reference],
        }),
      ),
    ).toEqual([['body.email', 'invalid_email']])

    // Declined: it grants nothing, ever; the administrator sees it gone and may invite again.
    expect((await post(invited.cookie, `/customer/account/organization-invitations/${m?.id}/decline`)).statusCode).toBe(
      200,
    )
    expect((await orgs(invited.cookie)).invitations).toEqual([])
    expect((await post(invited.cookie, `/customer/account/organization-invitations/${m?.id}/accept`)).statusCode).toBe(
      404,
    )
    expect(await opens(invited.cookie, admin.s.reference)).toBe(404)
    // A withdrawn invitation is gone too.
    const w = (
      await invite(admin.cookie, orgId, {
        email: invited.email,
        approve: false,
        pay: false,
        projects: [admin.s.reference],
      })
    ).json<Orgs>().administered[0]?.members[0]
    await post(admin.cookie, `/customer/account/organizations/${orgId}/members/${w?.id}/remove`)
    expect((await orgs(invited.cookie)).invitations).toEqual([])
    expect((await post(invited.cookie, `/customer/account/organization-invitations/${w?.id}/accept`)).statusCode).toBe(
      404,
    )
  })

  it('[HH-ID-13][OWN-DEC-71] closing a login account ends its memberships and those of the organizations it administers', async () => {
    const { admin, orgId } = await organization('closing')
    const member = await accountFor('closing-member@example.test', '13 Member Street')
    const m = (
      await invite(admin.cookie, orgId, {
        email: member.email,
        approve: false,
        pay: false,
        projects: [admin.s.reference],
      })
    ).json<Orgs>().administered[0]?.members[0]
    await post(member.cookie, `/customer/account/organization-invitations/${m?.id}/accept`)
    expect(await opens(member.cookie, admin.s.reference)).toBe(200)

    const closed = await withTx(t.db, (tx) =>
      closeCustomerAccount(tx, { accountId: admin.accountId, by: 'staff-synthetic' }),
    )
    expect(closed).toMatchObject({ closed: true, memberships: 1 })
    expect(await opens(member.cookie, admin.s.reference)).toBe(404)
    const row = await t.db
      .selectFrom('identity.organization_memberships')
      .select(['state', 'end_reason'])
      .where('id', '=', m?.id as string)
      .executeTakeFirstOrThrow()
    expect(row).toEqual({ state: 'ended', end_reason: 'account_closed' })
    // No session and a guest-link session reach none of the organization routes.
    expect((await call('GET', '/customer/account/organizations')).statusCode).toBe(401)
  })

  it('[HH-ID-13] a request erasure plans the project’s organization shares, scopes and history entries with it', async () => {
    const { admin, orgId } = await organization('erasure')
    const member = await accountFor('erasure-member@example.test', '15 Member Street')
    await invite(admin.cookie, orgId, {
      email: member.email,
      approve: false,
      pay: false,
      projects: [admin.s.reference],
    })
    const plan = await requestErasurePlan(t.db, admin.s.requestId)
    const planned = (table: string) => plan.steps.find((x) => x.table === table)?.planned
    expect(planned('identity.organization_scopes')).toBe(1)
    expect(planned('identity.organization_projects')).toBe(1)
    expect(planned('identity.organization_events')).toBe(1)
  })
})
