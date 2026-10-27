// The authorization matrix on real records, for every route that takes one (TSK-0108; HH-TEST-02, HH-STAFF-04,
// HH-ARC-03, HH-DATA-01, HH-ID-13, T19, T24, T26, T64, T68, ROLE-MATRIX, RULE-SERVER-AUTHZ). Two customers' projects,
// A and B, are taken through to an approved job with a confirmed visit today, A's worked by Ann and Cy (who holds the
// collect grant) and B's by Ben; the routes are the server's route contracts (authz-routes.test.ts proves they are
// exactly what the running server serves), and each is called with A's and with B's record IDs:
// - customer A against customer B, through a single-project link, an account and organization memberships of A with
//   each privilege: every route answers B exactly as a missing record and writes nothing; A's own records open as
//   the matrix's V cells say (an organization member only for what its privileges name), never naming B; a stale
//   verification is asked to verify again;
// - the assigned workers against the unassigned one, on every route whose Worker cell is A (assigned jobs only);
// - every other staff role on every route whose IDs the records name: the matrix's decision, with its reason, a
//   fresh sign-in (F) and a written reason where the matrix asks for them;
// - own records (Office's audit events) and shared caches (no answer is cacheable).
// Every staff member, customer, address, code and amount here is synthetic (RULE-SYNTHETIC-DATA).
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { createDb, loadServiceSeed, loadSopSeed, syncServices, syncSops, withTx, type Db } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { localClockOf, localDateOf, offsetMinutesAt, resolveLocalTime, resolveWindow } from '@handyhub/domain'
import { ESTIMATE_TERMS } from '@handyhub/domain/legal'
import {
  actionsFor,
  decide,
  rowFor,
  type Action,
  type CustomerActor,
  type OrganizationPrivilege,
  type ProjectAccess,
  type Resource,
  type StaffActor,
  type StaffRole,
} from '@handyhub/policy'
import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { API_PREFIX } from '../../src/api/register.js'
import { AUTHENTICATION, type RouteDef } from '../../src/api/route.js'
import { surfaceOf } from '../../src/hosts.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { startCustomerSession } from '../../src/modules/identity/customer-sessions.js'
import { readCodeKey, type CodeKeySettings } from '../../src/modules/identity/index.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { apiModules } from '../../src/modules/index.js'
import { recordPolicyVersion } from '../../src/platform/config/index.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { verifyCountyOf } from '../fixtures/county.js'
import { testConfig } from '../fixtures/env.js'
import { sample, samplePath, sampleQuery } from '../fixtures/schema-sample.js'
import { signInWithMfa } from '../fixtures/staff-mfa.js'
import { verifyPropertyZone } from '../fixtures/zones.js'

const ZONE = 'America/Kentucky/Louisville'
const KEY: CodeKeySettings = readCodeKey({
  HANDYHUB_ENV: 'ci',
  CODE_HASH_KEY: ['synthetic', 'authorization', 'records', 'key', 'for', 'tests', 'only', '0108'].join('-'),
})
const SEAL = ['synthetic', 'authorization', 'records', 'sealing', 'key', 'tests', '0108'].join('-')
const pw = ['synthetic', 'authorization', 'records', 'passphrase', '108'].join(' ')
const CODE = ['4', '1', '0', '8', '2'].join('')
const STAFF = ['owner', 'staleOwner', 'office', 'estimator', 'ann', 'ben', 'cy'] as const
type Person = (typeof STAFF)[number]
const ROLE: Record<Person, StaffRole> = {
  owner: 'owner',
  staleOwner: 'owner',
  office: 'office',
  estimator: 'estimator',
  ann: 'worker',
  ben: 'worker',
  cy: 'worker',
}

let t: TestDatabase
let wide: Db
let app: FastifyInstance
let routes: RouteDef[] = []
const cookies = {} as Record<Person, string>
const csrf = {} as Record<Person, string>
const ids = {} as Record<Person, string>

/** The record IDs of one project, by the names the route paths give their parameters. */
type Records = Record<string, string>
type Project = { ids: Records; contactId: string; customerId: string; cookie: string }
let A: Project
let B: Project
/** Customer sessions by how they reach project A (none reaches B). */
const customers = {} as Record<
  'link' | 'account' | 'member' | 'approver' | 'payer',
  { cookie: string; actor: CustomerActor }
>

let seq = 0
const key = (what: string) => `synthetic-authz-${what}-${++seq}-${randomUUID()}`

function staffWrite(who: Person, method: 'POST' | 'PUT', url: string, payload: unknown, version?: number) {
  return app.inject({
    method,
    url,
    payload: payload as object,
    headers: {
      cookie: cookies[who],
      'x-csrf-token': csrf[who],
      'idempotency-key': key('staff'),
      ...(version === undefined ? {} : { 'if-match': `"${version}"` }),
    },
  })
}
const staffGet = (who: Person, url: string) => app.inject({ method: 'GET', url, headers: { cookie: cookies[who] } })

const ALL_OK = Object.fromEntries(
  ['coverage', 'service_fit', 'essential_facts', 'urgency', 'site_visit_need', 'staff_equipment', 'risk_flags'].map(
    (c) => [c, { outcome: 'ok' }],
  ),
)

let ip = 20
/** A request through to an approved job ($12.50: no deposit), with an access code, a link session and its IDs. */
async function project(name: string): Promise<Project> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': key('submit'), 'x-forwarded-for': `198.51.100.${++ip}` },
    payload: {
      formVersion: 'test-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: `Synthetic authorization project ${name}.`,
      answers: [],
      property: {
        street: `${ip} Synthetic Matrix Lane`,
        city: 'Testville',
        state: 'ky',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'online',
      contact: {
        fullName: `Synthetic Customer ${name}`,
        email: `authz-${name.toLowerCase()}-${randomUUID().slice(0, 8)}@example.test`,
        phone: '(502) 555-0108',
        preferredChannel: 'email',
      },
      smsOptIn: false,
      marketingOptIn: false,
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  const { reference } = res.json<{ reference: string }>()
  const row = await t.db
    .selectFrom('intake.requests as r')
    .innerJoin('crm.projects as p', 'p.id', 'r.project_id')
    .select(['r.id', 'r.project_id', 'r.contact_id', 'r.state_version', 'p.property_id', 'p.customer_id'])
    .where('r.reference', '=', reference)
    .executeTakeFirstOrThrow()
  await verifyCountyOf(t.db, row.project_id)
  await verifyPropertyZone(t.db, { projectId: row.project_id }, ZONE)
  const grant = await t.db
    .selectFrom('identity.project_access_grants')
    .select('id')
    .where('request_id', '=', row.id)
    .executeTakeFirstOrThrow()
  const s = await withTx(t.db, (tx) =>
    startCustomerSession(tx, {
      contactRef: row.contact_id,
      via: 'grant',
      projectIds: [row.project_id],
      verifiedAt: new Date(),
      grantId: grant.id,
    }),
  )
  const cookie = `__Host-hh_customer=${s.token}`
  const p: Project = {
    ids: {
      reference,
      requestId: row.id,
      projectId: row.project_id,
      propertyId: row.property_id,
      customerId: row.customer_id,
    },
    contactId: row.contact_id,
    customerId: row.customer_id,
    cookie,
  }
  if (name === 'C') return p
  const qualified = await staffWrite(
    'owner',
    'PUT',
    `/api/v1/staff/requests/${row.id}/qualification`,
    { checks: ALL_OK },
    0,
  )
  expect(qualified.statusCode, qualified.body).toBe(200)
  const moved = await staffWrite(
    'owner',
    'POST',
    `/api/v1/staff/requests/${row.id}/actions/online-estimate`,
    { workPackages: ['SVC-DW-01'] },
    row.state_version,
  )
  expect(moved.statusCode, moved.body).toBe(200)
  const coded = await staffWrite('office', 'POST', `/api/v1/staff/properties/${row.property_id}/access-codes`, {
    kind: 'lockbox',
    label: 'Synthetic box',
    value: CODE,
    source: 'customer_call',
    reason: 'Synthetic: given by phone',
  })
  expect(coded.statusCode, coded.body).toBe(201)
  const created = await staffWrite('estimator', 'POST', `/api/v1/staff/projects/${row.project_id}/estimates`, {})
  expect(created.statusCode, created.body).toBe(201)
  const c = created.json<{ number: string; versionId: string }>()
  const v = (await staffGet('estimator', `/api/v1/staff/estimate-versions/${c.versionId}`)).json<{
    rowVersion: number
    workPackages: { id: string }[]
  }>()
  const saved = await staffWrite(
    'estimator',
    'PUT',
    `/api/v1/staff/estimate-versions/${c.versionId}/draft`,
    {
      lines: [
        {
          kind: 'base',
          workPackageId: v.workPackages[0]?.id,
          description: 'Patch the synthetic wall',
          quantity: '1',
          unit: 'patch',
          unitPriceCents: 1250,
        },
      ],
      texts: {},
    },
    v.rowVersion,
  )
  expect(saved.statusCode, saved.body).toBe(200)
  const pub = await staffWrite(
    'estimator',
    'POST',
    `/api/v1/staff/estimate-versions/${c.versionId}/publish`,
    {},
    saved.json<{ rowVersion: number }>().rowVersion,
  )
  expect(pub.statusCode, pub.body).toBe(200)
  const base = `/api/v1/customer/projects/${reference}/estimates/${c.number}/versions/1`
  const d = (await app.inject({ method: 'GET', url: base, headers: { cookie } })).json<{
    approval: { contentDigest: string; selection: { totalCents: number; deposit: { amountCents: number | null } } }
  }>()
  const approved = await app.inject({
    method: 'POST',
    url: `${base}/approve`,
    headers: { cookie, 'idempotency-key': key('approve'), 'user-agent': 'SyntheticBrowser/1.0 (test)' },
    payload: {
      contentDigest: d.approval.contentDigest,
      options: [],
      totalCents: d.approval.selection.totalCents,
      depositCents: d.approval.selection.deposit.amountCents,
      termsDocumentId: ESTIMATE_TERMS.documentId,
      termsSha256: ESTIMATE_TERMS.contentSha256,
      acceptTerms: true,
      fullName: `Synthetic Customer ${name}`,
    },
  })
  expect(approved.statusCode, approved.body).toBe(201)
  const job = await t.db
    .selectFrom('work.jobs')
    .select('id')
    .where('project_id', '=', row.project_id)
    .executeTakeFirstOrThrow()
  const code = await t.db
    .selectFrom('crm.access_instruction_secrets')
    .select('id')
    .where('property_id', '=', row.property_id)
    .executeTakeFirstOrThrow()
  const wp = await t.db
    .selectFrom('work.work_packages')
    .select('id')
    .where('project_id', '=', row.project_id)
    .executeTakeFirstOrThrow()
  Object.assign(p.ids, {
    jobId: job.id,
    codeId: code.id,
    workPackageId: wp.id,
    // Parameters whose name several record kinds share are named by the path segment before them.
    'estimates/:number': c.number,
    'versions/:version': '1',
    'estimate-versions/:versionId': c.versionId,
  })
  return p
}

/** A confirmed work visit today (the property's local date) for a team, written as the confirmation writes it. */
async function visitToday(p: Project, team: Person[], slot: number): Promise<string> {
  const date = localDateOf(new Date(), ZONE)
  const midnight = resolveLocalTime(date, '00:00', ZONE)
  if (midnight.kind !== 'unique') throw new Error('fixture midnight')
  const startsAt = new Date(midnight.at.instant.getTime() + slot * 20 * 60_000)
  const endsAt = new Date(startsAt.getTime() + 5 * 60_000)
  const w = resolveWindow({
    date,
    start: localClockOf(startsAt, ZONE),
    end: localClockOf(endsAt, ZONE),
    zone: ZONE,
    startOffsetMinutes: offsetMinutesAt(startsAt, ZONE),
    endOffsetMinutes: offsetMinutesAt(endsAt, ZONE),
  })
  if (!w.ok) throw new Error('fixture window')
  const window = w.window
  return withTx(t.db, async (tx) => {
    const v = await tx
      .insertInto('work.visits')
      .values({
        purpose: 'service',
        project_id: p.ids['projectId'] as string,
        job_id: p.ids['jobId'] as string,
        property_id: p.ids['propertyId'] as string,
        local_date: window.date,
        window_start: window.start,
        window_end: window.end,
        time_zone: ZONE,
        start_offset_minutes: window.startOffsetMinutes,
        end_offset_minutes: window.endOffsetMinutes,
        starts_at: window.startsAt,
        ends_at: window.endsAt,
        window_set_by: ids.office,
        expected_duration_minutes: 5,
        preparation_buffer_minutes: 0,
        travel_buffer_minutes: 0,
        required_workers: team.length,
        created_by: ids.office,
      })
      .returning(['id', 'version'])
      .executeTakeFirstOrThrow()
    for (const [i, worker] of team.entries())
      await tx
        .insertInto('work.reservations')
        .values({
          visit_id: v.id,
          resource: 'worker',
          staff_user_id: ids[worker],
          role: i === 0 ? 'lead' : 'member',
          kind: 'confirmed',
          starts_at: window.startsAt,
          ends_at: new Date(window.endsAt.getTime() + 5 * 60_000),
          time_zone: ZONE,
          assigned_by: ids.office,
        })
        .execute()
    await tx
      .updateTable('work.visits')
      .set({ state: 'confirmed', version: v.version + 1 })
      .where('id', '=', v.id)
      .execute()
    return v.id
  })
}

/** A customer account whose code-evidenced links name `linked` (as enrollment writes them), and its session. */
async function account(owner: Project, linked: Project[], email: string) {
  return withTx(t.db, async (tx) => {
    const now = new Date()
    const codeId = randomUUID()
    await tx
      .insertInto('identity.verification_codes')
      .values({
        id: codeId,
        purpose: 'account_sign_in',
        channel: 'email',
        destination: email,
        subject_ref: 'synthetic-authz-account',
        nonce: randomBytes(16).toString('hex'),
        code_digest: createHash('sha256').update(codeId).digest('hex'),
        max_attempts: 1,
        expires_at: new Date(now.getTime() + 600_000),
        request_id: 'synthetic-authz-account',
        created_at: now,
      })
      .execute()
    const accountId = randomUUID()
    await tx
      .insertInto('identity.customer_accounts')
      .values({
        id: accountId,
        sign_in_email: email,
        email_verified_at: now,
        customer_id: owner.customerId,
        contact_id: owner.contactId,
        enrolled_via: 'receipt_offer',
        created_at: now,
      })
      .execute()
    for (const p of linked)
      await tx
        .insertInto('identity.customer_identity_links')
        .values({
          id: randomUUID(),
          account_id: accountId,
          customer_id: p.customerId,
          contact_id: p.contactId,
          project_id: p.ids['projectId'] as string,
          request_id: p.ids['requestId'] as string,
          authority: 'owner',
          evidence: 'receipt_code',
          evidence_channel: 'email',
          evidence_code_id: codeId,
          state: 'active',
          decided_by: `customer_account:${accountId}`,
          decided_at: now,
        })
        .execute()
    const s = await startCustomerSession(tx, {
      contactRef: `customer_account:${accountId}`,
      via: 'account',
      projectIds: [],
      verifiedAt: now,
      account: { id: accountId, signInChannel: 'email' },
    })
    return { accountId, cookie: `__Host-hh_customer=${s.token}` }
  })
}

/** A member of the administrator's organization, scoped to project A, with the given privileges. */
async function member(organizationId: string, C: Project, name: string, privileges: OrganizationPrivilege[]) {
  const email = `authz-${name}@example.test`
  const m = await account(C, [], email)
  await withTx(t.db, async (tx) => {
    const row = await tx
      .insertInto('identity.organization_memberships')
      .values({
        organization_id: organizationId,
        invited_email: email,
        can_approve: privileges.includes('approve'),
        can_pay: privileges.includes('pay'),
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    await tx
      .updateTable('identity.organization_memberships')
      .set({ state: 'active', account_id: m.accountId, accepted_at: new Date() })
      .where('id', '=', row.id)
      .execute()
    await tx
      .insertInto('identity.organization_scopes')
      .values({ membership_id: row.id, organization_id: organizationId, project_id: A.ids['projectId'] as string })
      .execute()
  })
  return m.cookie
}

beforeAll(async () => {
  t = await createTestDatabase()
  wide = createDb(t.url, { max: 8, applicationName: 'authz-records-test' })
  await syncServices(t.db, loadServiceSeed())
  await syncSops(t.db, loadSopSeed())
  const config = testConfig({ TRUST_PROXY_HOPS: '1', ACCESS_CODE_ENCRYPTION_KEY: SEAL })
  app = await buildApp({ config, api: { db: wide, codeKey: KEY, storage: new FakeObjectStorage() } })
  routes = apiModules({ secureCookies: false, mfaKey: null, environment: config.env })
    .flatMap((m) => m.routes)
    .filter((r) => r.permission !== AUTHENTICATION)
  await recordPolicyVersion(t.db, {
    key: 'legal.estimate_terms',
    value: {
      documentId: ESTIMATE_TERMS.documentId,
      status: 'approved',
      attorneyReviewed: true,
      preparedOn: ESTIMATE_TERMS.preparedOn,
      contentSha256: ESTIMATE_TERMS.contentSha256,
    },
    sourceIds: ['TEST-SYNTHETIC'],
    changedBy: 'test',
    reason: 'synthetic test configuration',
  })
  const hash = await hashPassword(pw)
  await withTx(t.db, async (tx) => {
    for (const p of STAFF) {
      const user = await createStaffUser(tx, {
        email: `${p.toLowerCase()}-records@example.test`,
        displayName: `Synthetic ${p}`,
        locale: 'en',
        role: ROLE[p],
        issuedBy: 'test',
      })
      await setPasswordHash(tx, user.id, hash)
      ids[p] = user.id
    }
  })
  for (const p of STAFF) {
    const res = await signInWithMfa(app, {
      method: 'POST',
      url: '/api/v1/staff/auth/sign-in',
      headers: { 'x-forwarded-for': '198.51.100.108' },
      payload: { email: `${p.toLowerCase()}-records@example.test`, password: pw },
    })
    expect(res.statusCode, res.body).toBe(200)
    cookies[p] = String(res.headers['set-cookie']).split(';')[0] as string
    const session = await app.inject({
      method: 'GET',
      url: '/api/v1/staff/auth/session',
      headers: { cookie: cookies[p] },
    })
    csrf[p] = session.json<{ csrfToken: string }>().csrfToken
  }
  await sql`UPDATE identity.staff_sessions SET authenticated_at = now() - interval '10 minutes'
             WHERE staff_user_id = ${ids.staleOwner}::uuid AND revoked_at IS NULL`.execute(t.db)

  A = await project('A')
  B = await project('B')
  const C = await project('C')
  // Ann and Cy work A today, Ben works B; Cy holds the Owner's collect grant with its training record (OWN-DEC-200 H4).
  A.ids['visitId'] = await visitToday(A, ['ann', 'cy'], 1)
  B.ids['visitId'] = await visitToday(B, ['ben'], 2)
  await t.db
    .insertInto('identity.role_grants')
    .values({
      staff_user_id: ids.cy,
      kind: 'capability',
      name: 'collect',
      issued_by: ids.owner,
      reason: 'Synthetic: trained for on-site collection.',
      trained_on: '2026-01-15',
      training: 'Synthetic collection training.',
    })
    .execute()

  const projectA = A.ids['projectId'] as string
  const link = (privileges?: OrganizationPrivilege[]): ProjectAccess =>
    privileges ? { projectId: projectA, via: 'organization', privileges } : { projectId: projectA, via: 'grant' }
  const actor = (access: ProjectAccess): CustomerActor => ({
    kind: 'customer',
    contactId: 'synthetic',
    projectAccess: [access],
    freshVerification: true,
  })
  customers.link = { cookie: A.cookie, actor: actor(link()) }
  const admin = await account(A, [A], `authz-admin-${randomUUID().slice(0, 8)}@example.test`)
  customers.account = { cookie: admin.cookie, actor: actor({ projectId: projectA, via: 'account' }) }
  const org = await t.db
    .insertInto('identity.organizations')
    .values({ name: 'Synthetic Matrix Organization', administrator_account_id: admin.accountId })
    .returning('id')
    .executeTakeFirstOrThrow()
  await t.db
    .insertInto('identity.organization_projects')
    .values({ organization_id: org.id, project_id: projectA })
    .execute()
  customers.member = { cookie: await member(org.id, C, 'member', []), actor: actor(link([])) }
  customers.approver = { cookie: await member(org.id, C, 'approver', ['approve']), actor: actor(link(['approve'])) }
  customers.payer = { cookie: await member(org.id, C, 'payer', ['pay']), actor: actor(link(['pay'])) }
}, 180_000)

afterAll(async () => {
  await app?.close()
  await wide?.destroy()
  await t?.drop()
})

/** Parameter names several record kinds share: resolved only by the path segment before them. */
const SHARED_NAMES = new Set(['number', 'version', 'versionId', 'id'])

/** The project's IDs for the parameters of `def` that name one of its records. */
function recordIds(def: RouteDef, p: Project): Record<string, string> {
  const out: Record<string, string> = {}
  const parts = def.path.split('/')
  for (const [i, part] of parts.entries()) {
    if (!part.startsWith(':')) continue
    const name = part.slice(1)
    const scoped = p.ids[`${parts[i - 1]}/${part}`]
    // An estimate's version only under that estimate (a change order has versions too).
    const value =
      name === 'version' && !def.path.includes('/estimates/:number/')
        ? undefined
        : (scoped ?? (SHARED_NAMES.has(name) ? undefined : p.ids[name]))
    if (value !== undefined) out[name] = value
  }
  return out
}
/** Whether every record a route names is one of the project's (so its record lookup finds it). */
const named = (def: RouteDef, p: Project) =>
  Object.keys(recordIds(def, p)).length === [...def.path.matchAll(/:[A-Za-z0-9_]+/g)].length

/** A valid request on `p`'s records (sampled where the project has no such record). */
function request(def: RouteDef, p: Project) {
  const url =
    API_PREFIX + samplePath(def.path, def.schema.params, recordIds(def, p)) + sampleQuery(def.schema.querystring)
  return { url, body: sample(def.schema.body) ?? (def.method === 'GET' ? undefined : {}) }
}

let network = 0
/** Answers of the customer and staff APIs that a shared cache could keep (T68): none may be (checked last). */
const cacheable: string[] = []

async function send(def: RouteDef, cookie: string, csrfToken: string | undefined, p: Project, url?: string) {
  const r = request(def, p)
  const res = await app.inject({
    method: def.method,
    url: url ?? r.url,
    headers: {
      cookie,
      ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
      'idempotency-key': key('call'),
      'if-match': '"1"',
      'user-agent': 'SyntheticBrowser/1.0 (test)',
      // Customer rate limits count per network: each call comes from its own, so the limits never answer first.
      'x-forwarded-for': `2001:db8:108:${(++network).toString(16)}::1`,
    },
    ...(def.method === 'GET' ? {} : { payload: r.body as object }),
  })
  const cache = String(res.headers['cache-control'] ?? '')
  if (!/\bno-store\b/.test(cache) || /\bpublic\b/.test(cache)) cacheable.push(`${def.method} ${def.path}: ${cache}`)
  return res
}

function outcome(res: LightMyRequestResponse) {
  const json = String(res.headers['content-type']).startsWith('application/json')
  const error = json ? (res.json() as { error?: { code: string } }).error : undefined
  return { status: res.statusCode, code: error?.code ?? '' }
}
const strip = (body: string) => body.replace(/"requestId":"[^"]+"/, '')
/** Which of `p`'s record IDs and reference an answer names (its bytes, so a PDF is read too). */
const leaks = (res: LightMyRequestResponse, p: Project) =>
  Object.entries(p.ids)
    .filter(([name, value]) => value.length >= 8 && !name.includes('/') && res.rawPayload.includes(value))
    .map(([name]) => name)

const written = async () => {
  const counts = await sql<{ audit: number; keys: number }>`
    SELECT (SELECT count(*)::int FROM platform.audit_events WHERE action NOT LIKE 'security.%') AS audit,
           (SELECT count(*)::int FROM platform.idempotency_keys) AS keys`.execute(t.db)
  return counts.rows[0]
}
const securityEvents = async (projectId: string) =>
  (
    await sql<{ n: number }>`SELECT count(*)::int AS n FROM platform.audit_events
                              WHERE action = 'security.scope_denied' AND target_id = ${projectId}`.execute(t.db)
  ).rows[0]?.n ?? 0

async function inBatches<T>(items: readonly T[], check: (item: T) => Promise<void>, size = 8): Promise<void> {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(check))
}

/**
 * Customer routes that read inside the scope of a narrower matrix action than the one they are declared with
 * (TSK-0118): what stays the project customer's own (privacy requests, the repeat-service schedule) and selecting
 * options, which prepares an approval. The handler asks the policy data for that action's scope.
 */
const NARROWED: Record<string, Action> = {
  'GET /customer/projects/:reference/privacy-requests': 'privacy.request_export',
  'GET /customer/projects/:reference/repeat-service': 'service_series.change',
  'POST /customer/projects/:reference/estimates/:number/versions/:version/selection': 'estimate.approve',
}

const SESSIONS = ['link', 'account', 'member', 'approver', 'payer'] as const

describe('customer A against customer B on every customer route (TSK-0108, T19, T24, T68, HH-ID-13)', () => {
  const customerRoutes = () => routes.filter((r) => surfaceOf(r.path) === 'customer')

  it('[T19][HH-TEST-02] a link, an account and organization members of A reach nothing of B: the answer of a missing record, nothing written', async () => {
    const list = customerRoutes()
    expect(list.length).toBeGreaterThan(30)
    const mismatches: string[] = []
    const before = await written()
    const events = await securityEvents(B.ids['projectId'] as string)
    const missing: Project = { ...B, ids: { ...B.ids, reference: 'HH-0000TEST', requestId: randomUUID() } }
    for (const who of SESSIONS)
      await inBatches(list, async (def) => {
        const res = await send(def, customers[who].cookie, undefined, B)
        const none = await send(def, customers[who].cookie, undefined, missing)
        if (res.statusCode !== 404 || strip(res.body) !== strip(none.body))
          mismatches.push(`${who} ${def.method} ${def.path}: ${res.statusCode} ${res.body.slice(0, 120)}`)
      })
    expect(mismatches).toEqual([])
    expect(await written()).toEqual(before)
    // Each altered ID that names B's project is kept as a security event (T19).
    expect(await securityEvents(B.ids['projectId'] as string)).toBeGreaterThan(events)
  }, 120_000)

  it('[HH-ID-13][T24] on A, each session gets what the V cells and the organization privileges give it, and nothing more', async () => {
    type Case = { who: (typeof SESSIONS)[number]; def: RouteDef; allowed: boolean }
    const cases: Case[] = SESSIONS.flatMap((who) =>
      customerRoutes().map((def) => {
        const action = NARROWED[`${def.method} ${def.path}`] ?? (def.permission as Action)
        const d = decide(
          customers[who].actor,
          action,
          { projectId: A.ids['projectId'] as string },
          {
            now: new Date(),
            online: true,
            reason: 'Synthetic reason.',
          },
        )
        return { who, def, allowed: d.effect === 'allow' }
      }),
    )
    const mismatches: string[] = []
    const before = await written()
    const refused = cases.filter((c) => !c.allowed)
    await inBatches(refused, async ({ who, def }) => {
      const got = outcome(await send(def, customers[who].cookie, undefined, A))
      if (got.status !== 404 || got.code !== 'NOT_FOUND')
        mismatches.push(`${who} ${def.method} ${def.path}: refused by the matrix, got ${JSON.stringify(got)}`)
    })
    expect(await written()).toEqual(before)
    // An allowed write is not sent here (it would act on A); the feature tests run them.
    const reads = cases.filter((c) => c.allowed && c.def.method === 'GET')
    await inBatches(reads, async ({ who, def }) => {
      const res = await send(def, customers[who].cookie, undefined, A)
      const got = outcome(res)
      // A record the project does not have (a photo, an invoice) is NOT_FOUND; everything named opens.
      if (got.status !== (named(def, A) ? 200 : 404))
        mismatches.push(`${who} ${def.method} ${def.path}: allowed by the matrix, got ${JSON.stringify(got)}`)
      // Nothing of B's in any answer (T68: no row, count or file outside the caller's scope).
      for (const leak of leaks(res, B)) mismatches.push(`${who} ${def.method} ${def.path}: names B's ${leak}`)
    })
    expect(mismatches).toEqual([])
    expect(refused.length).toBeGreaterThan(40)
    expect(reads.length).toBeGreaterThan(40)
  }, 120_000)

  it('[HH-ID-07][T33] A’s own link with a verification older than the freshness window: every "V (fresh verification)" action asks for a new code and writes nothing', async () => {
    const grant = await t.db
      .selectFrom('identity.project_access_grants')
      .select('id')
      .where('request_id', '=', A.ids['requestId'] as string)
      .executeTakeFirstOrThrow()
    const s = await withTx(t.db, (tx) =>
      startCustomerSession(tx, {
        contactRef: A.contactId,
        via: 'grant',
        projectIds: [A.ids['projectId'] as string],
        verifiedAt: new Date(Date.now() - 86_400_000),
        grantId: grant.id,
      }),
    )
    const stale = `__Host-hh_customer=${s.token}`
    const fresh = customerRoutes().filter((def) =>
      rowFor(def.permission as Action)?.cells.customer.rules[def.permission as Action]?.conditions?.includes(
        'customer_fresh_verification',
      ),
    )
    expect(fresh.length).toBeGreaterThan(4)
    const before = await written()
    for (const def of fresh) {
      const res = await send(def, stale, undefined, A)
      const error = res.json<{ error: { code: string; fieldErrors: { code: string }[] } }>().error
      const got = [def.path, res.statusCode, error.code, error.fieldErrors.map((f) => f.code)]
      // On A's own project the verification is asked for first (the project is in scope, so this reveals nothing);
      // a record A does not have (a change order) may be not found instead.
      const asked = [def.path, 403, 'FORBIDDEN', ['FRESH_VERIFICATION_REQUIRED']]
      if (named(def, A) || res.statusCode !== 404) expect(got).toEqual(asked)
      else expect(got).toEqual([def.path, 404, 'NOT_FOUND', []])
    }
    expect(await written()).toEqual(before)
    // The same stale session still reads its own project.
    expect(
      (await app.inject({ url: `/api/v1/customer/projects/${A.ids['reference']}`, headers: { cookie: stale } }))
        .statusCode,
    ).toBe(200)
  })
})

/**
 * Staff reads that answer inside a narrower matrix decision than the route's own action: a preview of a change only
 * for who may make the change (customers/link-routes.ts asks the policy for it), and a limited cell (ROLE-MATRIX
 * "estimating scope", "site facts only") that the route's content goes beyond: the estimator's estimating scope has
 * no field photos (field-photos/index.ts); the worker's site facts come with the job packet, never the full
 * customer or property record; and a collecting worker's balance comes with the on-site collection view
 * (finance/index.ts), never the full deposit, invoice or adjustment views.
 */
const STAFF_NARROWED: Record<string, { action?: Action; refuses?: readonly string[] }> = {
  'GET /staff/customers/:customerId/merge-preview': { action: 'customer.merge' },
  'GET /staff/requests/:requestId/relink-preview': { action: 'request.correct_link' },
  'GET /staff/jobs/:jobId/photos': { refuses: ['estimating_scope'] },
  'GET /staff/customers/:customerId': { refuses: ['site_facts'] },
  'GET /staff/properties/:propertyId': { refuses: ['site_facts'] },
  'GET /staff/jobs/:jobId/deposit': { refuses: ['balance_only'] },
  'GET /staff/jobs/:jobId/invoices': { refuses: ['balance_only'] },
  'GET /staff/jobs/:jobId/finance-adjustments': { refuses: ['balance_only'] },
}

/** What the server must answer `who` on `def` for a record with these facts (ROLE-MATRIX through the policy data). */
function staffExpected(def: RouteDef, who: Person, resource: Resource, reason: string | undefined) {
  const actor: StaffActor = {
    kind: 'staff',
    userId: ids[who],
    roles: [ROLE[who]],
    capabilities: who === 'cy' ? ['collect'] : [],
    status: 'active',
    freshAuth: who !== 'staleOwner',
  }
  const narrowed = STAFF_NARROWED[`${def.method} ${def.path}`]
  const d = decide(actor, narrowed?.action ?? (def.permission as Action), resource, {
    now: new Date(),
    online: true,
    ...(narrowed?.action ? { reason: 'given' } : reason !== undefined ? { reason } : {}),
  })
  if (d.effect === 'deny') {
    if (d.reason === 'REASON_REQUIRED') return { status: 400, code: 'VALIDATION_FAILED' }
    return { status: 403, code: d.reason === 'FRESH_AUTH_REQUIRED' ? 'FRESH_AUTH_REQUIRED' : 'FORBIDDEN' }
  }
  if (d.limit !== undefined && narrowed?.refuses?.includes(d.limit)) return { status: 403, code: 'FORBIDDEN' }
  if (def.freshAuthMinutes !== undefined && !actor.freshAuth) return { status: 403, code: 'FRESH_AUTH_REQUIRED' }
  return 'allowed' as const
}

describe('the assigned workers against the unassigned one on every Worker "A" route (TSK-0108, T26, HH-STAFF-04)', () => {
  const assignedRoutes = () =>
    routes.filter(
      (r) =>
        surfaceOf(r.path) === 'staff' &&
        rowFor(r.permission as Action)?.cells.worker.rules[r.permission as Action]?.scope === 'assigned',
    )

  it('[T26][HH-TEST-02] Ben, assigned only to B, is refused every A route on A’s records; nothing is written', async () => {
    const list = assignedRoutes()
    expect(list.length).toBeGreaterThan(60)
    const mismatches: string[] = []
    const before = await written()
    await inBatches(list, async (def) => {
      const got = outcome(await send(def, cookies.ben, csrf.ben, A))
      // Refused for the assignment where the records are found; an ID the project does not have is not found.
      const ok = named(def, A) ? got.status === 403 && got.code === 'FORBIDDEN' : [403, 404].includes(got.status)
      if (!ok) mismatches.push(`${def.method} ${def.path}: ${JSON.stringify(got)}`)
    })
    expect(mismatches).toEqual([])
    expect(await written()).toEqual(before)
  }, 120_000)

  it('[T26][HH-FIN-03][HH-PKT-08] Ann and Cy, assigned to A today, read the A routes on A’s records (balances only with the collect grant), and none on B’s', async () => {
    const mismatches: string[] = []
    const now = Date.now()
    let allowed = 0
    let refused = 0
    const reads = assignedRoutes().filter((r) => r.method === 'GET')
    for (const who of ['ann', 'cy'] as const)
      await inBatches(reads, async (def) => {
        // The facts A's records give: the project, this worker's assignment today and, recording a payment, the
        // caller as its collector; a route that reads no record has none of them.
        const window = { staffUserId: ids[who], from: new Date(now - 3_600_000), to: new Date(now + 3_600_000) }
        const facts: Resource =
          def.resource && def.path.includes('/:')
            ? { projectId: A.ids['projectId'] as string, assignments: [window], collectedByStaffId: ids[who] }
            : {}
        const expected = staffExpected(def, who, facts, undefined)
        const res = await send(def, cookies[who], csrf[who], A)
        const own = outcome(res)
        if (expected === 'allowed') {
          allowed++
          if (own.status !== (named(def, A) ? 200 : 404))
            mismatches.push(`${who} A ${def.method} ${def.path}: ${JSON.stringify(own)}`)
          for (const leak of leaks(res, B)) mismatches.push(`${who} A ${def.method} ${def.path}: names B's ${leak}`)
        } else {
          refused++
          if (JSON.stringify(own) !== JSON.stringify(expected))
            mismatches.push(
              `${who} A ${def.method} ${def.path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(own)}`,
            )
        }
        const other = outcome(await send(def, cookies[who], csrf[who], B))
        if (![403, 404].includes(other.status))
          mismatches.push(`${who} B ${def.method} ${def.path}: ${JSON.stringify(other)}`)
      })
    expect(mismatches).toEqual([])
    expect(allowed).toBeGreaterThan(30)
    expect(refused).toBeGreaterThan(10)
  }, 120_000)

  it('[T68][HH-OFF-06] every staff read a worker may make that names no record (My Day, packets, own proposals) lists only their own job', async () => {
    const lists = routes.filter(
      (r) =>
        surfaceOf(r.path) === 'staff' &&
        r.method === 'GET' &&
        !r.path.includes('/:') &&
        actionsFor(['worker']).includes(r.permission as Action),
    )
    expect(lists.length).toBeGreaterThan(3)
    const mismatches: string[] = []
    for (const [who, other] of [
      ['ann', B],
      ['cy', B],
      ['ben', A],
    ] as const)
      for (const def of lists) {
        const res = await send(def, cookies[who], csrf[who], A)
        for (const leak of leaks(res, other)) mismatches.push(`${who} ${def.path}: names ${leak}`)
      }
    expect(mismatches).toEqual([])
    // The lists are not empty: Ann's day names A's visit (so the check above reads real content).
    const day = await send(routes.find((r) => r.path === '/staff/my/day') as RouteDef, cookies.ann, csrf.ann, A)
    expect(day.body).toContain(A.ids['visitId'])
  })
})

describe('every other role on every staff route whose records A names (TSK-0108, T26, T64, HH-STAFF-03)', () => {
  /** The roles whose cell for the action does not depend on the record (Y, F, —): the decision is exact. */
  function exact(def: RouteDef, who: Person): boolean {
    const rule = rowFor(def.permission as Action)?.cells[ROLE[who]].rules[def.permission as Action]
    return rule === undefined || (rule.scope === 'any' && !rule.conditions?.length)
  }

  it('[T26][T64] each refusal is the matrix’s, with a fresh sign-in and a reason where it asks; allowed reads open; nothing refused is written', async () => {
    const list = routes.filter((r) => surfaceOf(r.path) === 'staff' && r.resource && named(r, A))
    expect(list.length).toBeGreaterThan(80)
    const cases = STAFF.filter((who) => ROLE[who] !== 'worker').flatMap((who) =>
      list
        .filter((def) => exact(def, who))
        .map((def) => {
          const reason = (request(def, A).body as { reason?: unknown } | undefined)?.reason
          return { who, def, expected: staffExpected(def, who, {}, typeof reason === 'string' ? reason : undefined) }
        }),
    )
    const mismatches: string[] = []
    const before = await written()
    const refused = cases.filter((c) => c.expected !== 'allowed')
    await inBatches(refused, async ({ who, def, expected }) => {
      const got = outcome(await send(def, cookies[who], csrf[who], A))
      if (JSON.stringify(got) !== JSON.stringify(expected))
        mismatches.push(
          `${who} ${def.method} ${def.path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`,
        )
    })
    expect(await written()).toEqual(before)
    // An allowed write is not sent (it would run); the sweep in authz-routes.test.ts shows it passes the policy.
    const reads = cases.filter((c) => c.expected === 'allowed' && c.def.method === 'GET')
    await inBatches(reads, async ({ who, def }) => {
      const got = outcome(await send(def, cookies[who], csrf[who], A))
      if (got.status === 401 || got.status === 403)
        mismatches.push(`${who} ${def.method} ${def.path}: allowed by the matrix, got ${JSON.stringify(got)}`)
    })
    expect(mismatches).toEqual([])
    expect(refused.length).toBeGreaterThan(150)
    expect(reads.length).toBeGreaterThan(50)
  }, 180_000)

  it('[T64][HH-FIN-14] refunds, credits, write-offs, a deposit waiver and a reopening need the Owner, a fresh sign-in and a reason', async () => {
    const jobId = A.ids['jobId'] as string
    for (const path of ['refunds', 'credits', 'write-offs', 'deposit/waiver', 'closeout/actions/reopen']) {
      const def = routes.find((r) => r.path === `/staff/jobs/:jobId/${path}`) as RouteDef
      const url = `${API_PREFIX}/staff/jobs/${jobId}/${path}`
      expect(actionsFor(['office', 'estimator', 'worker']).includes(def.permission as Action), path).toBe(false)
      for (const who of ['office', 'estimator', 'ann', 'cy'] as const)
        expect([path, who, outcome(await send(def, cookies[who], csrf[who], A, url))]).toEqual([
          path,
          who,
          { status: 403, code: 'FORBIDDEN' },
        ])
      expect([path, outcome(await send(def, cookies.staleOwner, csrf.staleOwner, A, url))]).toEqual([
        path,
        { status: 403, code: 'FRESH_AUTH_REQUIRED' },
      ])
    }
  })
})

describe('own records (TSK-0108, ROLE-MATRIX "Own actions")', () => {
  it('[T26][HH-STAFF-04] Office reads only its own audit events, even when it asks for another person’s; the Owner reads them all', async () => {
    type Events = { items: { actor: { staffUserId: string | null } }[] }
    const actorsOf = async (who: Person, query: string) => {
      const res = await staffGet(who, `/api/v1/staff/audit-events?limit=100${query}`)
      expect(res.statusCode, res.body).toBe(200)
      return res.json<Events>().items.map((i) => i.actor.staffUserId)
    }
    const own = await actorsOf('office', '')
    expect(own.length).toBeGreaterThan(0)
    expect(new Set(own)).toEqual(new Set([ids.office]))
    expect(await actorsOf('office', `&actor=${ids.owner}`)).toEqual([])
    expect(new Set(await actorsOf('owner', ''))).toContain(ids.estimator)
  })
})

describe('a single-project link is not an account (TSK-0108, HH-ID-04, HH-ID-13)', () => {
  it('[HH-ID-04][T19] the account routes, outside enrolling one, answer a link session as missing and write nothing', async () => {
    const accountRoutes = apiModules({ secureCookies: false, mfaKey: null })
      .flatMap((m) => m.routes)
      .filter((r) => r.path.startsWith('/customer/account') && !r.path.startsWith('/customer/account/enrollment'))
    expect(accountRoutes.length).toBeGreaterThan(20)
    const before = await written()
    const mismatches: string[] = []
    for (const def of accountRoutes) {
      const got = outcome(await send(def, customers.link.cookie, undefined, A))
      if (got.status !== 404 || got.code !== 'NOT_FOUND')
        mismatches.push(`${def.method} ${def.path}: ${JSON.stringify(got)}`)
    }
    expect(mismatches).toEqual([])
    expect(await written()).toEqual(before)
  })
})

describe('cached answers (TSK-0108, T68, HH-API-05)', () => {
  it('[T68][HH-API-05] no answer above, allowed or refused, may be kept by a shared cache: every one is no-store, none public', () => {
    expect(network).toBeGreaterThan(1000)
    expect([...new Set(cacheable)]).toEqual([])
  })
})
