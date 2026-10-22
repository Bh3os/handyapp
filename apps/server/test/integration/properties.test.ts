// Property records and the protected access-code store against PostgreSQL 16 (TSK-0045; HH-CRM-02, HH-CRM-03, T28,
// T43, T49, HH-SEC-04, RULE-SERVER-AUTHZ). Every staff member, customer, address and code here is synthetic
// (RULE-SYNTHETIC-DATA); the key and the codes are built at runtime so no literal looks like a credential.
import { randomUUID } from 'node:crypto'
import { Writable } from 'node:stream'
import { loadServiceSeed, syncServices, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import type { StaffRole } from '@handyhub/policy'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { localDate } from '@handyhub/domain/request-form'
import type { ApiModule } from '../../src/api/route.js'
import { buildApp } from '../../src/app.js'
import { apiModules } from '../../src/modules/index.js'
import { loadConfig } from '../../src/platform/config/index.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { startCustomerSession } from '../../src/modules/identity/customer-sessions.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { createLogger } from '../../src/platform/logger.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { testConfig } from '../fixtures/env.js'
import { signInWithMfa, TEST_MFA_KEY } from '../fixtures/staff-mfa.js'

const ROLES: readonly StaffRole[] = ['owner', 'office', 'estimator', 'worker']
const pw = ['synthetic', 'properties', 'passphrase', '45'].join(' ')
const KEY = ['synthetic', 'access', 'code', 'sealing', 'key', 'for', 'tests', 'only'].join('-')
// Distinctive synthetic codes, so a scan cannot match anything else by chance.
const code = (n: number) => ['SYNX', String(4700 + n), 'QV', String(n)].join('-')

let t: TestDatabase
let app: FastifyInstance
let bare: FastifyInstance
let logs = ''
const staff = {} as Record<StaffRole, { id: string; cookie: string; csrf: string }>

type Submitted = { reference: string; requestId: string; projectId: string; contactId: string; propertyId: string }

let ip = 40
async function submit(street: string, zip = '40045'): Promise<Submitted> {
  const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': `synthetic-properties-${randomUUID()}`, 'x-forwarded-for': `198.51.100.${++ip}` },
    payload: {
      formVersion: 'test-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic property-records request: a small drywall dent.',
      property: { street, unit: 'Unit 2', city: 'Testville', state: 'KY', zip, propertyType: 'house' },
      timing: { preferredDate: future, flexible: false, needHelpToday: false, windows: ['any_time'] },
      estimatePreference: 'let_handyhub_decide',
      contact: {
        fullName: 'Sam Synthetic Owner',
        email: `property-${randomUUID()}@example.test`,
        phone: '(502) 555-0145',
        preferredChannel: 'email',
      },
      smsOptIn: false,
      marketingOptIn: false,
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  const reference = res.json<{ reference: string }>().reference
  const r = await t.db
    .selectFrom('intake.requests')
    .select(['id', 'project_id', 'contact_id', 'property_id'])
    .where('reference', '=', reference)
    .executeTakeFirstOrThrow()
  return { reference, requestId: r.id, projectId: r.project_id, contactId: r.contact_id, propertyId: r.property_id }
}

const get = (url: string, cookie?: string, server = app) =>
  server.inject({ method: 'GET', url: `/api/v1${url}`, headers: cookie ? { cookie } : {} })
function write(
  role: StaffRole,
  method: 'POST' | 'PUT',
  url: string,
  payload: Record<string, unknown>,
  opts: { version?: number; idempotent?: boolean; server?: FastifyInstance } = {},
) {
  return (opts.server ?? app).inject({
    method,
    url: `/api/v1${url}`,
    headers: {
      cookie: staff[role].cookie,
      'x-csrf-token': staff[role].csrf,
      ...(opts.idempotent === false ? {} : { 'idempotency-key': `synthetic-properties-write-${randomUUID()}` }),
      ...(opts.version === undefined ? {} : { 'if-match': `"${opts.version}"` }),
    },
    payload,
  })
}

type View = {
  id: string
  version: number
  address: { street: string; unit: string | null; city: string; state: string; zip: string }
  addressVersion: number
  propertyType: string
  details: {
    detail: string
    value: string | null
    recorded: boolean
    source: string | null
    confirmedAt: string | null
  }[]
  formerAddresses: { addressVersion: number; address: { street: string } }[]
  requests: { reference: string; address: { street: string }; formerAddress: boolean }[]
  customers: { id: string }[]
  accessCodes: {
    visible: boolean
    store: string
    items: { id: string; version: number; kind: string; label: string | null; reveals: number; lastRevealed: unknown }[]
    removed: { id: string; reason: string }[]
  }
  history: { detail: string; action: string; reason: string }[]
  actions: { edit: boolean; setAccessCodes: boolean; revealAccessCodes: boolean }
}
const view = async (role: StaffRole, propertyId: string, server = app) => {
  const res = await get(`/staff/properties/${propertyId}`, staff[role].cookie, server)
  expect(res.statusCode, res.body).toBe(200)
  return res.json<View>()
}
const reveal = (role: StaffRole, propertyId: string, codeId: string, server = app) =>
  write(
    role,
    'POST',
    `/staff/properties/${propertyId}/access-codes/${codeId}/reveal`,
    {},
    { idempotent: false, server },
  )
const addCode = (role: StaffRole, propertyId: string, body: Record<string, unknown>, server = app) =>
  write(role, 'POST', `/staff/properties/${propertyId}/access-codes`, body, { idempotent: false, server })

async function customerCookie(contactRef: string, projectIds: string[]) {
  const s = await withTx(t.db, (tx) =>
    startCustomerSession(tx, { contactRef, via: 'grant', projectIds, verifiedAt: new Date() }),
  )
  return `__Host-hh_customer=${s.token}`
}

async function signInAll(server: FastifyInstance) {
  const out = {} as Record<StaffRole, { id: string; cookie: string; csrf: string }>
  for (const role of ROLES) {
    const res = await signInWithMfa(server, {
      method: 'POST',
      url: '/api/v1/staff/auth/sign-in',
      payload: { email: `${role}-properties@example.test`, password: pw },
    })
    expect(res.statusCode, res.body).toBe(200)
    const cookie = String(res.headers['set-cookie']).split(';')[0] as string
    const session = await server.inject({ method: 'GET', url: '/api/v1/staff/auth/session', headers: { cookie } })
    out[role] = { id: staff[role]?.id ?? '', cookie, csrf: session.json<{ csrfToken: string }>().csrfToken }
  }
  return out
}

beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
  const stream = new Writable({
    write(chunk: Buffer, _enc, cb) {
      logs += chunk.toString()
      cb()
    },
  })
  // Every log line at the most detailed level, so the scan below sees whatever the server would ever write.
  app = await buildApp({
    config: testConfig({ ACCESS_CODE_ENCRYPTION_KEY: KEY, TRUST_PROXY_HOPS: '1' }),
    api: { db: t.db, storage: new FakeObjectStorage() },
    logger: createLogger({ level: 'trace' }, stream),
  })
  // The same server without the key: the access-code store is NOT CONFIGURED.
  bare = await buildApp({ config: testConfig({ TRUST_PROXY_HOPS: '1' }), api: { db: t.db } })
  const hash = await hashPassword(pw)
  for (const role of ROLES) {
    const id = await withTx(t.db, async (tx) => {
      const user = await createStaffUser(tx, {
        email: `${role}-properties@example.test`,
        displayName: `Synthetic Properties ${role}`,
        locale: 'en',
        role,
        issuedBy: 'test',
      })
      await setPasswordHash(tx, user.id, hash)
      return user.id
    })
    staff[role] = { id, cookie: '', csrf: '' }
  }
  const sessions = await signInAll(app)
  for (const role of ROLES) staff[role] = { ...sessions[role], id: staff[role].id }
})
afterAll(async () => {
  await app?.close()
  await bare?.close()
  await t?.drop()
})

describe('property record: details, last-confirmed dates and address history (TSK-0045, HH-CRM-02)', () => {
  let s: Submitted

  it('[HH-CRM-02] the record shows the address and type with their source and when they were given', async () => {
    s = await submit('45 Synthetic Record Lane')
    const v = await view('owner', s.propertyId)
    expect(v.address).toEqual({
      street: '45 Synthetic Record Lane',
      unit: 'Unit 2',
      city: 'Testville',
      state: 'KY',
      zip: '40045',
    })
    expect(v.addressVersion).toBe(1)
    const address = v.details.find((d) => d.detail === 'address')
    expect(address).toMatchObject({ recorded: true, source: 'request_form', value: null })
    expect(address?.confirmedAt).not.toBeNull()
    expect(v.details.find((d) => d.detail === 'property_type')).toMatchObject({ source: 'request_form' })
    // A detail never recorded says so: no source, no date, never an empty value presented as known.
    expect(v.details.find((d) => d.detail === 'occupants_pets')).toEqual({
      detail: 'occupants_pets',
      value: null,
      recorded: false,
      source: null,
      confirmedAt: null,
      confirmedBy: null,
    })
    expect(v.formerAddresses).toEqual([])
    expect(v.requests).toEqual([expect.objectContaining({ reference: s.reference, formerAddress: false })])
    expect(v.customers).toHaveLength(1)
    expect(v.actions).toEqual({
      edit: true,
      setAccessCodes: true,
      revealAccessCodes: true,
      verifyCounty: true,
      verifyTimeZone: true,
    })
  })

  it('[HH-CRM-02][RULE-SERVER-AUTHZ] roles: estimator reads without codes; a worker reaches no property; customers never', async () => {
    const est = await view('estimator', s.propertyId)
    expect(est.accessCodes).toEqual({ visible: false, store: 'available', items: [], removed: [] })
    expect(est.actions).toEqual({
      edit: false,
      setAccessCodes: false,
      revealAccessCodes: false,
      verifyCounty: false,
      verifyTimeZone: false,
    })
    // No visit assignment exists yet: a worker sees no property (the address follows the visit window, OWN-DEC-40).
    expect((await get(`/staff/properties/${s.propertyId}`, staff.worker.cookie)).statusCode).toBe(403)
    // An altered ID finds nothing; a customer session never reaches the staff surface.
    expect((await get(`/staff/properties/${randomUUID()}`, staff.owner.cookie)).statusCode).toBe(404)
    const customer = await customerCookie(s.contactId, [s.projectId])
    expect([401, 404]).toContain((await get(`/staff/properties/${s.propertyId}`, customer)).statusCode)
  })

  it('[HH-CRM-02] an address change keeps the old one as a former address; the request keeps the address it was sent with', async () => {
    const before = await view('office', s.propertyId)
    // Office needs a written reason.
    const noReason = await write(
      'office',
      'PUT',
      `/staff/properties/${s.propertyId}/address`,
      { street: '46 Synthetic Moved Road', city: 'Testville', state: 'KY', zip: '40046', source: 'customer_call' },
      { version: before.version },
    )
    expect(noReason.statusCode).toBe(400)
    const stale = await write(
      'office',
      'PUT',
      `/staff/properties/${s.propertyId}/address`,
      {
        street: '46 Synthetic Moved Road',
        city: 'Testville',
        state: 'KY',
        zip: '40046',
        source: 'customer_call',
        reason: 'Customer moved',
      },
      { version: before.version + 5 },
    )
    expect(stale.statusCode).toBe(409)
    expect(stale.json<{ error: { code: string } }>().error.code).toBe('STALE_VERSION')
    const ok = await write(
      'office',
      'PUT',
      `/staff/properties/${s.propertyId}/address`,
      {
        street: '46 Synthetic Moved Road',
        unit: null,
        city: 'Testville',
        state: 'ky',
        zip: '40046',
        source: 'customer_call',
        reason: 'Customer called: the street was entered wrong',
      },
      { version: before.version },
    )
    expect(ok.statusCode, ok.body).toBe(200)
    const v = await view('office', s.propertyId)
    expect(v.address).toEqual({
      street: '46 Synthetic Moved Road',
      unit: null,
      city: 'Testville',
      state: 'KY',
      zip: '40046',
    })
    expect(v.addressVersion).toBe(2)
    expect(v.formerAddresses).toEqual([
      expect.objectContaining({
        addressVersion: 1,
        address: expect.objectContaining({ street: '45 Synthetic Record Lane' }),
      }),
    ])
    expect(v.details.find((d) => d.detail === 'address')).toMatchObject({ source: 'customer_call' })
    // The request keeps its address and is marked as made at a former address; its original submission is unchanged.
    expect(v.requests).toEqual([
      expect.objectContaining({
        reference: s.reference,
        address: expect.objectContaining({ street: '45 Synthetic Record Lane' }),
        formerAddress: true,
      }),
    ])
    const record = await get(`/staff/requests/${s.requestId}`, staff.office.cookie)
    expect(record.json<{ original: { property: { street: string } } }>().original.property.street).toBe(
      '45 Synthetic Record Lane',
    )
    expect(v.history[0]).toMatchObject({
      detail: 'address',
      action: 'changed',
      reason: 'Customer called: the street was entered wrong',
    })
    // The audit names the change and the reason, never the address.
    const events = await t.db
      .selectFrom('platform.audit_events')
      .select(['summary', 'reason'])
      .where('action', '=', 'property.edit_address')
      .where('target_id', '=', s.propertyId)
      .execute()
    expect(events).toHaveLength(1)
    expect(JSON.stringify(events)).not.toContain('Synthetic Moved Road')
    expect(JSON.stringify(events)).not.toContain('Synthetic Record Lane')
  })

  it('[HH-CRM-02] the database refuses an address change that skips the history', async () => {
    await expect(
      sql`UPDATE crm.properties SET street = '47 Synthetic Skip Street' WHERE id = ${s.propertyId}`.execute(t.db),
    ).rejects.toThrow(/ADDRESS_HISTORY/)
    await expect(
      sql`DELETE FROM crm.property_addresses WHERE property_id = ${s.propertyId}`.execute(t.db),
    ).rejects.toThrow()
  })

  it('[HH-CRM-02] details record their source and confirmation; codes never go in them', async () => {
    let v = await view('owner', s.propertyId)
    const set = await write(
      'owner',
      'PUT',
      `/staff/properties/${s.propertyId}/details/occupants_pets`,
      { value: 'Two synthetic cats; keep the back door closed.', source: 'customer_message', reason: 'Customer email' },
      { version: v.version },
    )
    expect(set.statusCode, set.body).toBe(200)
    v = await view('owner', s.propertyId)
    expect(v.details.find((d) => d.detail === 'occupants_pets')).toMatchObject({
      value: 'Two synthetic cats; keep the back door closed.',
      recorded: true,
      source: 'customer_message',
    })
    // A code in an ordinary field is refused (HH-CRM-03): it belongs in the protected store.
    const leak = await write(
      'owner',
      'PUT',
      `/staff/properties/${s.propertyId}/details/access_notes`,
      { value: 'Side gate, code 4821#', source: 'customer_call', reason: 'Customer call' },
      { version: v.version },
    )
    expect(leak.statusCode).toBe(400)
    expect(leak.json<{ error: { fieldErrors: { code: string }[] } }>().error.fieldErrors[0]?.code).toBe(
      'looks_like_access_code',
    )
    const confirm = await write(
      'owner',
      'POST',
      `/staff/properties/${s.propertyId}/details/occupants_pets/confirm`,
      { source: 'site_visit', reason: 'Seen on the estimate visit' },
      { version: v.version },
    )
    expect(confirm.statusCode, confirm.body).toBe(200)
    v = await view('owner', s.propertyId)
    expect(v.details.find((d) => d.detail === 'occupants_pets')).toMatchObject({ source: 'site_visit' })
    const notRecorded = await write(
      'owner',
      'POST',
      `/staff/properties/${s.propertyId}/details/restricted_areas/confirm`,
      { source: 'site_visit', reason: 'Checked' },
      { version: v.version },
    )
    expect(notRecorded.statusCode).toBe(409)
    const clear = await write(
      'owner',
      'PUT',
      `/staff/properties/${s.propertyId}/details/occupants_pets`,
      { value: null, source: 'customer_call', reason: 'The cats moved out' },
      { version: v.version },
    )
    expect(clear.statusCode, clear.body).toBe(200)
    v = await view('owner', s.propertyId)
    expect(v.details.find((d) => d.detail === 'occupants_pets')).toMatchObject({ value: null, recorded: false })
    expect(v.history.slice(0, 3).map((h) => `${h.detail}:${h.action}`)).toEqual([
      'occupants_pets:cleared',
      'occupants_pets:confirmed',
      'occupants_pets:changed',
    ])
    // Workers and estimators never edit the profile.
    const est = await write(
      'estimator',
      'PUT',
      `/staff/properties/${s.propertyId}/type`,
      { propertyType: 'townhouse', source: 'site_visit', reason: 'Seen on site' },
      { version: v.version },
    )
    expect(est.statusCode).toBe(403)
    const type = await write(
      'office',
      'PUT',
      `/staff/properties/${s.propertyId}/type`,
      { propertyType: 'townhouse', source: 'site_visit', reason: 'Seen on site' },
      { version: v.version },
    )
    expect(type.statusCode, type.body).toBe(200)
    expect((await view('office', s.propertyId)).propertyType).toBe('townhouse')
  })
})

describe('the protected access-code store (TSK-0045, HH-CRM-03, T28)', () => {
  let s: Submitted
  let codeId: string

  it('[HH-CRM-03] a code is sealed at rest and masked in the record', async () => {
    s = await submit('48 Synthetic Gate Court', '40048')
    const res = await addCode('office', s.propertyId, {
      kind: 'gate',
      label: 'Back gate',
      value: code(1),
      source: 'customer_call',
      reason: 'Customer called with the gate code',
    })
    expect(res.statusCode, res.body).toBe(201)
    codeId = res.json<{ id: string }>().id
    const row = await t.db
      .selectFrom('crm.access_instruction_secrets')
      .selectAll()
      .where('id', '=', codeId)
      .executeTakeFirstOrThrow()
    expect(row.sealed_value).toMatch(/^v1\./)
    expect(JSON.stringify(row)).not.toContain(code(1))
    const v = await view('office', s.propertyId)
    expect(v.accessCodes.items).toEqual([
      expect.objectContaining({ id: codeId, kind: 'gate', label: 'Back gate', reveals: 0, lastRevealed: null }),
    ])
    expect(JSON.stringify(v)).not.toContain(code(1))
  })

  it('[HH-CRM-03] a label or reason that repeats the code is refused; the sealed value opens under no other row', async () => {
    const label = await addCode('owner', s.propertyId, {
      kind: 'lockbox',
      label: `Box ${code(2)}`,
      value: code(2),
      source: 'customer_call',
      reason: 'New lockbox',
    })
    expect(label.statusCode).toBe(400)
    const reason = await addCode('owner', s.propertyId, {
      kind: 'lockbox',
      value: code(2),
      source: 'customer_call',
      reason: `Customer said ${code(2)}`,
    })
    expect(reason.statusCode).toBe(400)
    // A sealed value copied onto another code row does not open there.
    const other = await addCode('owner', s.propertyId, {
      kind: 'door',
      value: code(3),
      source: 'customer_call',
      reason: 'Front door',
    })
    expect(other.statusCode, other.body).toBe(201)
    const otherId = other.json<{ id: string }>().id
    await sql`ALTER TABLE crm.access_instruction_secrets DISABLE TRIGGER access_instruction_secrets_guard`.execute(t.db)
    await sql`UPDATE crm.access_instruction_secrets SET sealed_value =
      (SELECT sealed_value FROM crm.access_instruction_secrets WHERE id = ${codeId}) WHERE id = ${otherId}`.execute(
      t.db,
    )
    await sql`ALTER TABLE crm.access_instruction_secrets ENABLE TRIGGER access_instruction_secrets_guard`.execute(t.db)
    const swapped = await reveal('owner', s.propertyId, otherId)
    expect(swapped.statusCode).toBe(409)
    expect(swapped.body).not.toContain(code(1))
    const removed = await write(
      'owner',
      'POST',
      `/staff/properties/${s.propertyId}/access-codes/${otherId}/remove`,
      { reason: 'Test row cleaned up' },
      { version: 1 },
    )
    expect(removed.statusCode, removed.body).toBe(200)
  })

  it('[T28][HH-CRM-03][RULE-SERVER-AUTHZ] the Owner and Office reveal, each reveal audited; unassigned and estimator reveals are refused', async () => {
    const owner = await reveal('owner', s.propertyId, codeId)
    expect(owner.statusCode, owner.body).toBe(200)
    expect(owner.json()).toMatchObject({ id: codeId, kind: 'gate', label: 'Back gate', value: code(1) })
    expect(owner.headers['cache-control']).toBe('no-store')
    const office = await reveal('office', s.propertyId, codeId)
    expect(office.statusCode, office.body).toBe(200)
    const { hideAt, revealedAt } = office.json<{ hideAt: string; revealedAt: string }>()
    expect(new Date(hideAt).getTime() - new Date(revealedAt).getTime()).toBe(60_000)

    // A worker with no assignment at this property (no visit assignment exists yet), and an estimator: refused.
    for (const role of ['worker', 'estimator'] as const) {
      const denied = await reveal(role, s.propertyId, codeId)
      expect(denied.statusCode, role).toBe(403)
      expect(denied.body).not.toContain(code(1))
    }
    // Every reveal is recorded and audited: who, when, which code; never the value.
    const events = await t.db
      .selectFrom('platform.audit_events')
      .select(['actor_id', 'actor_roles', 'target_id', 'summary', 'result'])
      .where('action', '=', 'access_code.reveal')
      .where('target_id', '=', codeId)
      .orderBy('seq')
      .execute()
    expect(events.map((e) => [e.actor_id, e.result])).toEqual([
      [staff.owner.id, 'succeeded'],
      [staff.office.id, 'succeeded'],
    ])
    const rows = await t.db
      .selectFrom('crm.access_code_reveals')
      .select(['staff_id'])
      .where('secret_id', '=', codeId)
      .orderBy('revealed_at')
      .execute()
    expect(rows.map((r) => r.staff_id).sort()).toEqual([staff.owner.id, staff.office.id].sort())
    const v = await view('owner', s.propertyId)
    expect(v.accessCodes.items.find((c) => c.id === codeId)).toMatchObject({ reveals: 2 })
    // The reveal is never stored for idempotency, and no reveal row or audit event holds the value.
    const kept = await t.db
      .selectFrom('platform.idempotency_keys')
      .select('response_body')
      .where('operation', '=', 'revealAccessCode')
      .execute()
    expect(kept).toEqual([])
    expect(JSON.stringify(events)).not.toContain(code(1))
  })

  it('[HH-CRM-03] replace erases the old value; confirm keeps it; a removed code is erased and never revealed', async () => {
    let v = await view('owner', s.propertyId)
    let c = v.accessCodes.items.find((x) => x.id === codeId) as View['accessCodes']['items'][number]
    const replaced = await write(
      'owner',
      'PUT',
      `/staff/properties/${s.propertyId}/access-codes/${codeId}`,
      { value: code(4), source: 'customer_message', reason: 'The customer changed the gate code' },
      { version: c.version, idempotent: false },
    )
    expect(replaced.statusCode, replaced.body).toBe(200)
    expect((await reveal('owner', s.propertyId, codeId)).json<{ value: string }>().value).toBe(code(4))
    v = await view('owner', s.propertyId)
    c = v.accessCodes.items.find((x) => x.id === codeId) as typeof c
    const confirmed = await write(
      'office',
      'POST',
      `/staff/properties/${s.propertyId}/access-codes/${codeId}/confirm`,
      { source: 'site_visit', reason: 'Worked at the visit' },
      { version: c.version },
    )
    expect(confirmed.statusCode, confirmed.body).toBe(200)
    const removed = await write(
      'office',
      'POST',
      `/staff/properties/${s.propertyId}/access-codes/${codeId}/remove`,
      { reason: 'Customer removed the gate' },
      { version: c.version + 1 },
    )
    expect(removed.statusCode, removed.body).toBe(200)
    const row = await t.db
      .selectFrom('crm.access_instruction_secrets')
      .select(['sealed_value', 'removed_at', 'removal_reason'])
      .where('id', '=', codeId)
      .executeTakeFirstOrThrow()
    expect(row.sealed_value).toBeNull()
    expect(row.removal_reason).toBe('Customer removed the gate')
    expect((await reveal('owner', s.propertyId, codeId)).statusCode).toBe(404)
    v = await view('owner', s.propertyId)
    expect(v.accessCodes.items.find((x) => x.id === codeId)).toBeUndefined()
    expect(v.accessCodes.removed.map((x) => x.id)).toContain(codeId)
    // The database keeps the record: never deleted, never revived.
    await expect(sql`DELETE FROM crm.access_instruction_secrets WHERE id = ${codeId}`.execute(t.db)).rejects.toThrow()
    await expect(
      sql`UPDATE crm.access_instruction_secrets SET removed_at = NULL WHERE id = ${codeId}`.execute(t.db),
    ).rejects.toThrow(/ACCESS_CODE_REMOVED/)
  })

  it('[HH-CRM-03] without ACCESS_CODE_ENCRYPTION_KEY the store is NOT CONFIGURED: no entry, no reveal, removal still works', async () => {
    const live = await addCode('owner', s.propertyId, {
      kind: 'alarm',
      value: code(5),
      source: 'customer_call',
      reason: 'Alarm panel code',
    })
    expect(live.statusCode, live.body).toBe(201)
    const id = live.json<{ id: string }>().id
    const sessions = await signInAll(bare)
    const saved = { ...staff }
    try {
      for (const role of ROLES) staff[role] = { ...sessions[role], id: saved[role].id }
      const v = await view('owner', s.propertyId, bare)
      expect(v.accessCodes.store).toBe('not_configured')
      expect(v.accessCodes.items.map((c) => c.id)).toContain(id)
      const add = await addCode(
        'owner',
        s.propertyId,
        {
          kind: 'alarm',
          value: code(6),
          source: 'customer_call',
          reason: 'Another code',
        },
        bare,
      )
      expect(add.statusCode).toBe(503)
      expect(add.json<{ error: { code: string } }>().error.code).toBe('NOT_CONFIGURED')
      const shown = await reveal('owner', s.propertyId, id, bare)
      expect(shown.statusCode).toBe(503)
      expect(shown.body).not.toContain(code(5))
      const removed = await write(
        'owner',
        'POST',
        `/staff/properties/${s.propertyId}/access-codes/${id}/remove`,
        { reason: 'No longer needed' },
        { version: 1, server: bare },
      )
      expect(removed.statusCode, removed.body).toBe(200)
    } finally {
      for (const role of ROLES) staff[role] = saved[role]
    }
  })
})

describe('the code is absent from every other response, record and log (TSK-0045, T28, T43, T49, HH-SEC-04)', () => {
  it('[T28][T43][T49][HH-SEC-04][HH-CRM-03] only the reveal carries the code: no other response, table, audit event or log line does', async () => {
    const s = await submit('49 Synthetic Scan Street', '40049')
    const secret = code(9)
    const add = await addCode('owner', s.propertyId, {
      kind: 'key_location',
      label: 'Spare key',
      value: secret,
      source: 'customer_message',
      reason: 'Customer wrote where the spare key is',
    })
    expect(add.statusCode, add.body).toBe(201)
    expect(add.body).not.toContain(secret)
    const codeId = add.json<{ id: string }>().id
    const shown = await reveal('owner', s.propertyId, codeId)
    expect(shown.json<{ value: string }>().value).toBe(secret)

    // Every other response a role can get about this property, its customer, request and project.
    const customer = await customerCookie(s.contactId, [s.projectId])
    const customerId = (
      await t.db
        .selectFrom('intake.requests')
        .select('customer_id')
        .where('id', '=', s.requestId)
        .executeTakeFirstOrThrow()
    ).customer_id
    const responses = await Promise.all([
      ...ROLES.map((role) => get(`/staff/properties/${s.propertyId}`, staff[role].cookie)),
      get(`/staff/customers/${customerId}`, staff.owner.cookie),
      get('/staff/customers', staff.owner.cookie),
      get(`/staff/requests/${s.requestId}`, staff.owner.cookie),
      get('/staff/requests', staff.owner.cookie),
      get('/staff/queue', staff.owner.cookie),
      get(`/customer/projects/${s.reference}`, customer),
      get('/customer/access/session', customer),
    ])
    for (const r of responses) expect(r.body).not.toContain(secret)
    // The customer projection of the project never carries access codes at all.
    expect(responses.at(-2)?.body ?? '').not.toMatch(/access.?code|sealed/i)

    // Every text column of every application table: the plain value is stored nowhere (sealed only).
    const columns = await sql<{ table_schema: string; table_name: string; column_name: string }>`
      SELECT c.table_schema, c.table_name, c.column_name FROM information_schema.columns c
      JOIN information_schema.tables tb ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
      WHERE tb.table_type = 'BASE TABLE'
        AND c.table_schema NOT IN ('pg_catalog', 'information_schema')
        AND c.data_type IN ('text', 'character varying', 'jsonb', 'json', 'ARRAY')`.execute(t.db)
    expect(columns.rows.length).toBeGreaterThan(50)
    const hits: string[] = []
    for (const c of columns.rows) {
      const found = await sql<{
        n: string
      }>`SELECT count(*)::text AS n FROM ${sql.table(`${c.table_schema}.${c.table_name}`)}
        WHERE ${sql.ref(c.column_name)}::text LIKE ${`%${secret}%`}`.execute(t.db)
      if (found.rows[0]?.n !== '0') hits.push(`${c.table_schema}.${c.table_name}.${c.column_name}`)
    }
    expect(hits).toEqual([])
    // Nothing the server logged, at the most detailed level, holds it.
    expect(logs.length).toBeGreaterThan(0)
    expect(logs).not.toContain(secret)
  })
})

describe('the reveal rule is decided with the business date (TSK-0045, T28)', () => {
  it('[T28][HH-CRM-03] an assigned worker passes only on the visit date: the server supplies today in the business time zone', async () => {
    // A probe route with the reveal's permission and facts a visit assignment would give (visits arrive with
    // TSK-0061/TSK-0062): the worker is assigned now, and the visit date comes from the path.
    const probe: ApiModule = {
      name: 'probe',
      routes: [
        {
          method: 'POST',
          path: '/staff/probe-reveal/:day',
          operationId: 'probeReveal',
          summary: 'Probe',
          description: 'Test only.',
          actors: ['staff'],
          permission: 'access_code.reveal',
          kind: 'write',
          idempotency: 'none',
          expectedVersion: 'none',
          rateLimit: 'none',
          audit: 'probe.reveal',
          pagination: false,
          test: 'test/integration/properties.test.ts',
          businessDate: true,
          resource: async ({ req, actor }) => ({
            assignments:
              actor.kind === 'staff'
                ? [
                    {
                      staffUserId: actor.userId,
                      from: new Date(Date.now() - 3_600_000),
                      to: new Date(Date.now() + 3_600_000),
                    },
                  ]
                : [],
            visitDate: (req.params as { day: string }).day,
          }),
          schema: {
            params: {
              type: 'object',
              additionalProperties: false,
              required: ['day'],
              properties: { day: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' } },
            },
            body: { type: 'object', additionalProperties: false, properties: {} },
            response: {
              200: {
                type: 'object',
                additionalProperties: false,
                required: ['ok'],
                properties: { ok: { type: 'boolean' } },
              },
            },
          },
          handler: async (ctx) => {
            await ctx.audit({ target: { type: 'probe' } })
            return { body: { ok: true } }
          },
        },
      ],
    }
    const probed = await buildApp({
      config: testConfig(),
      api: { db: t.db, modules: [...apiModules({ secureCookies: false, mfaKey: TEST_MFA_KEY }), probe] },
    })
    try {
      const sessions = await signInAll(probed)
      const zone = (await loadConfig(t.db)).get('business.timezone')
      expect(zone.state).toBe('CONFIGURED')
      const today = localDate(new Date(), zone.state === 'CONFIGURED' ? zone.value.zone : 'UTC')
      const tomorrow = localDate(
        new Date(Date.now() + 86_400_000),
        zone.state === 'CONFIGURED' ? zone.value.zone : 'UTC',
      )
      const call = (day: string) =>
        probed.inject({
          method: 'POST',
          url: `/api/v1/staff/probe-reveal/${day}`,
          headers: { cookie: sessions.worker.cookie, 'x-csrf-token': sessions.worker.csrf },
          payload: {},
        })
      expect((await call(today)).statusCode).toBe(200)
      expect((await call(tomorrow)).statusCode).toBe(403)
    } finally {
      await probed.close()
    }
  })
})
