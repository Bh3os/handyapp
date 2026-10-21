// Customer and contact records, candidate matches and visibility classes against PostgreSQL 16 (TSK-0044; HH-CRM-01,
// HH-ID-02, HH-STAFF-05, T21, T24, T57, RULE-SERVER-AUTHZ). Every staff member, customer, address, note and number
// here is synthetic (RULE-SYNTHETIC-DATA).
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { loadServiceSeed, syncServices, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { SMS_DISCLOSURE } from '@handyhub/domain/legal'
import type { StaffRole } from '@handyhub/policy'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { MODULES } from '../../src/modules/index.js'
import { candidateMatchAutomation, detectCandidates } from '../../src/modules/customers/index.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { startCustomerSession } from '../../src/modules/identity/customer-sessions.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { recordConsent } from '../../src/modules/notifications/index.js'
import { createAutomationRegistry } from '../../src/platform/automation.js'
import { createWorker } from '../../src/platform/jobs.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { testConfig } from '../fixtures/env.js'

const ROLES: readonly StaffRole[] = ['owner', 'office', 'estimator', 'worker']
const pw = ['synthetic', 'customers', 'passphrase', '44'].join(' ')
// A synthetic test card number (the well-known checksum example), built from parts.
const CARD = ['4111', '1111', '1111', '1111'].join(' ')

let t: TestDatabase
let app: FastifyInstance
const staff = {} as Record<StaffRole, { id: string; cookie: string; csrf: string }>

type Submitted = {
  reference: string
  requestId: string
  projectId: string
  contactId: string
  customerId: string
}
type Contact = { fullName: string; email: string; phone: string }
type Address = { street: string; unit?: string; zip: string }

let ip = 10
let n = 0
async function submit(
  contact: Contact,
  address: Address = { street: `${++n} Synthetic Way`, zip: '40000' },
  extra: { smsOptIn?: boolean; marketingOptIn?: boolean } = {},
): Promise<Submitted> {
  const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': `synthetic-customers-${randomUUID()}`, 'x-forwarded-for': `198.51.100.${++ip}` },
    payload: {
      formVersion: 'test-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic customer-records request: a small drywall dent.',
      property: { ...address, city: 'Testville', state: 'KY', propertyType: 'house' },
      timing: { preferredDate: future, flexible: false, needHelpToday: false, windows: ['any_time'] },
      estimatePreference: 'let_handyhub_decide',
      contact: { ...contact, preferredChannel: 'email' },
      smsOptIn: extra.smsOptIn ?? false,
      ...(extra.smsOptIn ? { smsDisclosureVersion: SMS_DISCLOSURE.documentId } : {}),
      marketingOptIn: extra.marketingOptIn ?? false,
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  const reference = res.json<{ reference: string }>().reference
  const r = await t.db
    .selectFrom('intake.requests')
    .select(['id', 'project_id', 'contact_id', 'customer_id'])
    .where('reference', '=', reference)
    .executeTakeFirstOrThrow()
  return { reference, requestId: r.id, projectId: r.project_id, contactId: r.contact_id, customerId: r.customer_id }
}

const worker = () => createWorker({ db: t.db, registry: createAutomationRegistry([candidateMatchAutomation()]) })
const get = (url: string, cookie?: string) =>
  app.inject({ method: 'GET', url: `/api/v1${url}`, headers: cookie ? { cookie } : {} })
function write(
  role: StaffRole,
  method: 'POST' | 'PUT',
  url: string,
  payload: Record<string, unknown>,
  version?: number,
) {
  return app.inject({
    method,
    url: `/api/v1${url}`,
    headers: {
      cookie: staff[role].cookie,
      'x-csrf-token': staff[role].csrf,
      'idempotency-key': `synthetic-customers-write-${randomUUID()}`,
      ...(version === undefined ? {} : { 'if-match': `"${version}"` }),
    },
    payload,
  })
}

type Record_ = {
  id: string
  displayName: string
  version: number
  contacts: {
    id: string
    email: string
    phone: string
    version: number
    verification: { email: string; phone: string }
    permissions: Record<string, { state: string; since: string | null }>
    consentHistory: { purpose: string; channel: string; granted: boolean; source: string; ownRecord: boolean }[]
  }[]
  projects: { reference: string; requests: { reference: string }[] }[]
  documents: { state: string }
  payments: { state: string }
  notes: { id: string; visibility: string; masked: boolean; body: string | null; author: unknown; source: string }[]
  candidates: {
    visible: boolean
    items: { id: string; version: number; customer: { id: string }; reasons: string[]; status: string }[]
  }
  timeline: { kind: string; codes: string[]; reference: string | null }[]
  actions: Record<string, unknown>
}
const record = async (role: StaffRole, customerId: string) => {
  const res = await get(`/staff/customers/${customerId}`, staff[role].cookie)
  expect(res.statusCode, res.body).toBe(200)
  return res.json<Record_>()
}
const matchesOf = (customerId: string) =>
  t.db
    .selectFrom('crm.candidate_matches')
    .selectAll()
    .where((eb) => eb.or([eb('customer_id', '=', customerId), eb('candidate_customer_id', '=', customerId)]))
    .execute()
const openItem = (customerId: string) =>
  t.db
    .selectFrom('ops.queue_items')
    .select(['id', 'reason', 'reference'])
    .where('type', '=', 'candidate_match')
    .where('subject_id', '=', customerId)
    .where('resolved_at', 'is', null)
    .executeTakeFirst()
async function customerCookie(contactRef: string, projectIds: string[]) {
  const s = await withTx(t.db, (tx) =>
    startCustomerSession(tx, { contactRef, via: 'grant', projectIds, verifiedAt: new Date() }),
  )
  return `__Host-hh_customer=${s.token}`
}

beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
  app = await buildApp({
    config: testConfig({ TRUST_PROXY_HOPS: '1' }),
    api: { db: t.db, storage: new FakeObjectStorage() },
  })
  const hash = await hashPassword(pw)
  for (const role of ROLES) {
    const id = await withTx(t.db, async (tx) => {
      const user = await createStaffUser(tx, {
        email: `${role}-customers@example.test`,
        displayName: `Synthetic Customers ${role}`,
        locale: 'en',
        role,
        issuedBy: 'test',
      })
      await setPasswordHash(tx, user.id, hash)
      return user.id
    })
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/staff/auth/sign-in',
      payload: { email: `${role}-customers@example.test`, password: pw },
    })
    expect(res.statusCode).toBe(200)
    const cookie = String(res.headers['set-cookie']).split(';')[0] as string
    const session = await app.inject({ method: 'GET', url: '/api/v1/staff/auth/session', headers: { cookie } })
    staff[role] = { id, cookie, csrf: session.json<{ csrfToken: string }>().csrfToken }
  }
})
afterAll(async () => {
  await app?.close()
  await t?.drop()
})

describe('shared contacts are candidate matches for review, never links (TSK-0044, HH-ID-02, T21)', () => {
  let landlord: Submitted
  let tenant: Submitted

  it('[T21][HH-ID-02][HH-ID-01] a shared email makes a suggestion and a review item; both customers stay separate', async () => {
    landlord = await submit({
      fullName: 'Pat Synthetic Landlord',
      email: 'shared-t21@example.test',
      phone: '(502) 555-0101',
    })
    tenant = await submit({
      fullName: 'Robin Synthetic Tenant',
      email: 'Shared-T21@Example.test',
      phone: '(502) 555-0102',
    })
    const customersBefore = await t.db.selectFrom('crm.customers').select('id').execute()
    await worker().runOnce()
    const [match, ...rest] = await matchesOf(tenant.customerId)
    expect(rest).toEqual([])
    expect(match).toMatchObject({
      customer_id: tenant.customerId,
      candidate_customer_id: landlord.customerId,
      reasons: ['email'],
      status: 'open',
      detected_by: 'request_submission',
    })
    // Nothing is linked, merged or moved: each request keeps its own customer, contact, project and property.
    expect(landlord.customerId).not.toBe(tenant.customerId)
    const contacts = await t.db
      .selectFrom('crm.contacts')
      .select(['id', 'customer_id'])
      .where('id', 'in', [landlord.contactId, tenant.contactId])
      .execute()
    expect(new Map(contacts.map((c) => [c.id, c.customer_id]))).toEqual(
      new Map([
        [landlord.contactId, landlord.customerId],
        [tenant.contactId, tenant.customerId],
      ]),
    )
    const projects = await t.db
      .selectFrom('crm.projects')
      .select(['id', 'customer_id'])
      .where('customer_id', 'in', [landlord.customerId, tenant.customerId])
      .execute()
    expect(projects.map((p) => [p.id, p.customer_id]).sort()).toEqual(
      [
        [landlord.projectId, landlord.customerId],
        [tenant.projectId, tenant.customerId],
      ].sort(),
    )
    expect((await t.db.selectFrom('crm.customers').select('id').execute()).length).toBe(customersBefore.length)
    const statuses = await t.db
      .selectFrom('crm.customers')
      .select('status')
      .where('id', 'in', [landlord.customerId, tenant.customerId])
      .execute()
    expect(statuses.map((s) => s.status)).toEqual(['active', 'active'])
    // No access to the other customer's project: no grant, and the tenant's session finds nothing of the landlord's.
    const grants = await t.db
      .selectFrom('identity.project_access_grants')
      .select('id')
      .where('project_id', '=', landlord.projectId)
      .where('contact_id', '=', tenant.contactId)
      .execute()
    expect(grants).toEqual([])
    const cookie = await customerCookie(tenant.contactId, [tenant.projectId])
    expect((await get(`/customer/projects/${landlord.reference}`, cookie)).statusCode).toBe(404)
    const session = await get('/customer/access/session', cookie)
    expect(session.json()).toEqual({ projects: [{ reference: tenant.reference }] })
    // A review item for staff, opening the customer record.
    expect(await openItem(tenant.customerId)).toMatchObject({
      reason: 'possible_duplicate',
      reference: tenant.reference,
    })
    const queue = await get('/staff/queue?type=candidate_match', staff.office.cookie)
    expect(queue.statusCode, queue.body).toBe(200)
    const item = queue
      .json<{ items: { link: string; reason: string }[] }>()
      .items.find((i) => i.link.endsWith(tenant.customerId))
    expect(item).toMatchObject({ reason: 'possible_duplicate', link: `/customers/${tenant.customerId}` })
  })

  it('[T21][HH-ID-02] both records show the labelled suggestion to staff who may see suggestions, never to a worker', async () => {
    const view = await record('office', tenant.customerId)
    expect(view.candidates.visible).toBe(true)
    expect(view.candidates.items).toEqual([
      expect.objectContaining({ customer: expect.objectContaining({ id: landlord.customerId }), reasons: ['email'] }),
    ])
    const other = await record('estimator', landlord.customerId)
    expect(other.candidates.items.map((m) => m.customer.id)).toEqual([tenant.customerId])
    expect((await record('owner', tenant.customerId)).timeline.map((e) => e.kind)).toContain('candidate_detected')
    expect((await get(`/staff/customers/${tenant.customerId}`, staff.worker.cookie)).statusCode).toBe(403)
    expect((await get('/staff/customers', staff.worker.cookie)).statusCode).toBe(403)
  })

  it('[T21][HH-ID-02] a shared phone and a shared address suggest too; a shared domain or a name alone never do', async () => {
    const a = await submit({ fullName: 'Sam Synthetic One', email: 'one-t21@example.test', phone: '(502) 555-0111' })
    const phone = await submit({ fullName: 'Sam Synthetic Two', email: 'two-t21@example.test', phone: '502.555.0111' })
    const place = { street: '77 Synthetic Court', unit: 'B', zip: '40001' }
    const b = await submit(
      { fullName: 'Lee Synthetic Three', email: 'three-t21@example.test', phone: '(502) 555-0113' },
      place,
    )
    const address = await submit(
      { fullName: 'Kim Synthetic Four', email: 'four-t21@example.test', phone: '(502) 555-0114' },
      { street: '77 synthetic court', unit: 'b', zip: '40001-1234' },
    )
    const sameUnitOther = await submit(
      { fullName: 'Kim Synthetic Five', email: 'five-t21@example.test', phone: '(502) 555-0115' },
      { street: '77 Synthetic Court', unit: 'C', zip: '40001' },
    )
    const domain = await submit({
      fullName: 'Sam Synthetic One',
      email: 'other-t21@example.test',
      phone: '(502) 555-0116',
    })
    await worker().runOnce()
    expect((await matchesOf(phone.customerId)).map((m) => [m.candidate_customer_id, m.reasons])).toEqual([
      [a.customerId, ['phone']],
    ])
    expect((await matchesOf(address.customerId)).map((m) => [m.candidate_customer_id, m.reasons])).toEqual([
      [b.customerId, ['address']],
    ])
    // A different unit is a different address; the same email domain and the same name are not suggestions.
    expect(await matchesOf(sameUnitOther.customerId)).toEqual([])
    expect(await matchesOf(domain.customerId)).toEqual([])
  })

  it('[HH-ID-02] a replayed detection changes nothing: one suggestion per pair, no new events', async () => {
    const before = await t.db.selectFrom('crm.candidate_match_events').select('id').execute()
    await withTx(t.db, (tx) => detectCandidates(tx, tenant.customerId, 'request_submission'))
    await withTx(t.db, (tx) => detectCandidates(tx, landlord.customerId, 'request_submission'))
    expect(await matchesOf(tenant.customerId)).toHaveLength(1)
    expect(await t.db.selectFrom('crm.candidate_match_events').select('id').execute()).toHaveLength(before.length)
  })

  it('[T21][HH-ID-02][RULE-SERVER-AUTHZ] “not the same customer” needs a reason, is audited and changes neither record', async () => {
    const view = await record('office', tenant.customerId)
    const match = view.candidates.items[0] as Record_['candidates']['items'][number]
    const path = `/staff/customers/${tenant.customerId}/candidates/${match.id}/dismiss`
    expect((await write('office', 'POST', path, {}, match.version)).statusCode).toBe(400)
    expect((await write('estimator', 'POST', path, { reason: 'x' }, match.version)).statusCode).toBe(403)
    expect((await write('office', 'POST', path, { reason: 'Landlord and tenant' })).statusCode).toBe(428)
    expect((await write('office', 'POST', path, { reason: 'Landlord and tenant' }, 99)).statusCode).toBe(409)
    // From the other customer's record, or an unrelated one, the same suggestion is reached only through its pair.
    const unrelated = await submit({
      fullName: 'Unrelated Synthetic',
      email: 'unrelated-t21@example.test',
      phone: '(502) 555-0120',
    })
    const elsewhere = `/staff/customers/${unrelated.customerId}/candidates/${match.id}/dismiss`
    expect((await write('office', 'POST', elsewhere, { reason: 'x' }, match.version)).statusCode).toBe(404)
    const res = await write('office', 'POST', path, { reason: 'Landlord and tenant' }, match.version)
    expect(res.statusCode, res.body).toBe(200)
    const [row] = await matchesOf(tenant.customerId)
    expect(row?.status).toBe('dismissed')
    expect(await openItem(tenant.customerId)).toBeUndefined()
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select(['actor_id', 'reason', 'summary'])
      .where('action', '=', 'customer.dismiss_candidate')
      .execute()
    expect(audit).toEqual([expect.objectContaining({ actor_id: staff.office.id, reason: 'Landlord and tenant' })])
    expect(JSON.stringify(audit)).not.toContain('shared-t21')
    const again = await write('office', 'POST', path, { reason: 'Again' }, match.version + 1)
    expect(again.json().error.fieldErrors[0].code).toBe('CANDIDATE_NOT_OPEN')
    const after = await t.db
      .selectFrom('crm.contacts')
      .select('customer_id')
      .where('id', '=', tenant.contactId)
      .executeTakeFirstOrThrow()
    expect(after.customer_id).toBe(tenant.customerId)
  })

  it('[T21][HH-ID-02] newly shared details reopen a dismissed pair for review, still without linking anything', async () => {
    const view = await record('office', tenant.customerId)
    const contact = view.contacts[0] as Record_['contacts'][number]
    const res = await write(
      'office',
      'PUT',
      `/staff/customers/${tenant.customerId}/contacts/${contact.id}`,
      {
        fullName: 'Robin Synthetic Tenant',
        email: contact.email,
        phone: '(502) 555-0101',
        preferredChannel: 'email',
        reason: 'Customer gave a new number by phone',
      },
      contact.version,
    )
    expect(res.statusCode, res.body).toBe(200)
    await worker().runOnce()
    const [row] = await matchesOf(tenant.customerId)
    expect(row).toMatchObject({ status: 'open', reasons: ['email', 'phone'] })
    expect(await openItem(tenant.customerId)).toBeDefined()
    const events = await t.db
      .selectFrom('crm.candidate_match_events')
      .select('event')
      .where('match_id', '=', row?.id as string)
      .orderBy('recorded_at')
      .execute()
    expect(events.map((e) => e.event)).toEqual(['detected', 'dismissed', 'reopened'])
  })
})

describe('the customer record (TSK-0044, HH-CRM-01)', () => {
  let c: Submitted

  beforeAll(async () => {
    c = await submit(
      { fullName: 'Casey Synthetic Record', email: 'record-crm01@example.test', phone: '(502) 555-0130' },
      { street: '130 Synthetic Lane', zip: '40002' },
      { smsOptIn: true, marketingOptIn: true },
    )
    // A STOP reply later withdrew the SMS opt-in for the number (recorded by destination, TSK-0048).
    await withTx(t.db, (tx) =>
      recordConsent(tx, {
        purpose: 'transactional_sms',
        channel: 'sms',
        destination: '+15025550130',
        granted: false,
        source: 'sms_keyword',
        recordedBy: 'system:test',
        evidence: { keyword: 'STOP' },
      }),
    )
  })

  it('[HH-CRM-01] separate email and phone verification, the SMS opt-in with its opt-out, marketing separately, projects and history', async () => {
    const view = await record('office', c.customerId)
    expect(view.displayName).toBe('Casey Synthetic Record')
    const [contact] = view.contacts
    expect(contact?.verification).toEqual({ email: 'unverified', phone: 'unverified' })
    expect(contact?.permissions['sms']?.state).toBe('withdrawn')
    expect(contact?.permissions['marketingEmail']?.state).toBe('granted')
    expect(contact?.permissions['marketingSms']?.state).toBe('granted')
    expect(contact?.consentHistory.map((h) => [h.purpose, h.channel, h.granted, h.source, h.ownRecord])).toEqual(
      expect.arrayContaining([
        ['transactional_sms', 'sms', false, 'sms_keyword', false],
        ['transactional_sms', 'sms', true, 'request_form', true],
        ['marketing', 'email', true, 'request_form', true],
        ['marketing', 'sms', true, 'request_form', true],
      ]),
    )
    expect(view.projects).toEqual([
      expect.objectContaining({
        reference: c.reference,
        requests: [expect.objectContaining({ reference: c.reference })],
      }),
    ])
    expect(view.documents).toEqual({ state: 'not_available' })
    expect(view.payments).toEqual({ state: 'not_available' })
    const kinds = view.timeline.map((e) => e.kind)
    expect(kinds).toEqual(expect.arrayContaining(['request_submitted', 'consent_granted', 'consent_withdrawn']))
    // Verifying the email later never marks the phone (OWN-DEC-96).
    await t.db
      .updateTable('crm.contacts')
      .set({ email_verification: 'verified', email_verified_value: 'record-crm01@example.test' })
      .where('id', '=', c.contactId)
      .execute()
    expect((await record('office', c.customerId)).contacts[0]?.verification).toEqual({
      email: 'verified',
      phone: 'unverified',
    })
  })

  it('[HH-CRM-01][RULE-SERVER-AUTHZ] staff edit contact details with a reason; a changed value is unverified again; history kept', async () => {
    const view = await record('office', c.customerId)
    const contact = view.contacts[0] as Record_['contacts'][number]
    const path = `/staff/customers/${c.customerId}/contacts/${contact.id}`
    const body = {
      fullName: 'Casey Synthetic Record',
      email: 'record-crm01-new@example.test',
      phone: '(502) 555-0130',
      preferredChannel: 'email',
      reason: 'Customer asked by phone to use a new email',
    }
    expect((await write('office', 'PUT', path, { ...body, reason: undefined }, contact.version)).statusCode).toBe(400)
    expect((await write('estimator', 'PUT', path, body, contact.version)).statusCode).toBe(403)
    expect((await write('office', 'PUT', path, body, contact.version + 5)).statusCode).toBe(409)
    // Text needs a current SMS opt-in for the number (withdrawn by STOP here).
    const text = await write('office', 'PUT', path, { ...body, preferredChannel: 'text' }, contact.version)
    expect(text.statusCode).toBe(400)
    expect(text.json().error.fieldErrors[0]).toMatchObject({
      field: 'body.preferredChannel',
      code: 'sms_opt_in_required',
    })
    const res = await write('office', 'PUT', path, body, contact.version)
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json()).toEqual({ id: contact.id, version: contact.version + 1 })
    const after = await record('office', c.customerId)
    expect(after.contacts[0]).toMatchObject({
      email: 'record-crm01-new@example.test',
      verification: { email: 'unverified', phone: 'unverified' },
    })
    const change = await t.db
      .selectFrom('crm.record_changes')
      .select(['fields', 'previous', 'current', 'reason', 'changed_by'])
      .where('record_id', '=', contact.id)
      .executeTakeFirstOrThrow()
    expect(change).toEqual({
      fields: ['email'],
      previous: { email: 'record-crm01@example.test' },
      current: { email: 'record-crm01-new@example.test' },
      reason: 'Customer asked by phone to use a new email',
      changed_by: staff.office.id,
    })
    expect(after.timeline.find((e) => e.kind === 'contact_changed')?.codes).toEqual(['email'])
    // The audit names the field and the reason, never the personal data.
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select(['summary', 'reason'])
      .where('action', '=', 'customer.edit_contact')
      .where('target_id', '=', contact.id)
      .execute()
    expect(audit).toHaveLength(1)
    expect(JSON.stringify(audit)).not.toContain('record-crm01')
    await expect(sql`UPDATE crm.record_changes SET reason = 'x'`.execute(t.db)).rejects.toThrow(/APPEND_ONLY/)
  })

  it('[HH-CRM-01] staff edit the display name with a reason; a merged record is never edited', async () => {
    const view = await record('owner', c.customerId)
    const path = `/staff/customers/${c.customerId}`
    const res = await write('owner', 'PUT', path, { displayName: 'Casey S. Record', reason: 'Spelling' }, view.version)
    expect(res.statusCode, res.body).toBe(200)
    expect((await record('owner', c.customerId)).displayName).toBe('Casey S. Record')
    const other = await submit({
      fullName: 'Survivor Synthetic',
      email: 'survivor-crm01@example.test',
      phone: '(502) 555-0131',
    })
    await t.db
      .updateTable('crm.customers')
      .set({ status: 'merged', merged_into_id: other.customerId })
      .where('id', '=', c.customerId)
      .execute()
    const merged = await write('owner', 'PUT', path, { displayName: 'Again', reason: 'x' }, view.version + 1)
    expect(merged.statusCode).toBe(409)
    expect(merged.json().error.fieldErrors[0].code).toBe('CUSTOMER_MERGED')
    await t.db
      .updateTable('crm.customers')
      .set({ status: 'active', merged_into_id: null })
      .where('id', '=', c.customerId)
      .execute()
  })

  it('[HH-CRM-01][ENT-ConsentPreference] staff record the customer’s opt-out; the send-time state follows; staff never opt in', async () => {
    const contactId = c.contactId
    const path = `/staff/customers/${c.customerId}/contacts/${contactId}/withdrawals`
    expect(
      (await write('office', 'POST', path, { purpose: 'transactional_sms', channel: 'email', reason: 'x' })).statusCode,
    ).toBe(400)
    expect(
      (await write('office', 'POST', path, { purpose: 'marketing', channel: 'sms', granted: true, reason: 'x' }))
        .statusCode,
    ).toBe(400)
    const res = await write('office', 'POST', path, {
      purpose: 'marketing',
      channel: 'email',
      reason: 'Asked by phone',
    })
    expect(res.json()).toEqual({ state: 'withdrawn', recorded: true })
    const again = await write('office', 'POST', path, { purpose: 'marketing', channel: 'email', reason: 'Asked again' })
    expect(again.json()).toEqual({ state: 'withdrawn', recorded: false })
    const view = await record('office', c.customerId)
    expect(view.contacts[0]?.permissions['marketingEmail']?.state).toBe('withdrawn')
    expect(view.contacts[0]?.permissions['marketingSms']?.state).toBe('granted')
    const rows = await t.db
      .selectFrom('platform.consent_records')
      .select(['source', 'granted', 'recorded_by', 'subject_id'])
      .where('source', '=', 'staff_recorded')
      .execute()
    expect(rows).toEqual([
      { source: 'staff_recorded', granted: false, recorded_by: staff.office.id, subject_id: contactId },
    ])
  })

  it('[HH-CRM-01][T68] altered IDs find nothing; a contact is reached only through its own customer', async () => {
    expect((await get(`/staff/customers/${randomUUID()}`, staff.owner.cookie)).statusCode).toBe(404)
    expect((await get(`/staff/customers/${c.projectId}`, staff.owner.cookie)).statusCode).toBe(404)
    const other = await submit({
      fullName: 'Other Synthetic',
      email: 'other-crm01@example.test',
      phone: '(502) 555-0132',
    })
    const res = await write(
      'owner',
      'PUT',
      `/staff/customers/${other.customerId}/contacts/${c.contactId}`,
      { fullName: 'X', email: 'x@example.test', phone: '(502) 555-0133', preferredChannel: 'email', reason: 'x' },
      1,
    )
    expect(res.statusCode).toBe(404)
    // A customer session reaches no staff record.
    const cookie = await customerCookie(c.contactId, [c.projectId])
    expect((await get(`/staff/customers/${c.customerId}`, cookie)).statusCode).toBe(401)
  })

  it('[HH-CRM-01] the list searches by name, exact email, phone and reference inside the scope', async () => {
    const find = async (q: string) =>
      (await get(`/staff/customers?q=${encodeURIComponent(q)}`, staff.office.cookie))
        .json<{ items: { id: string; possibleDuplicates: number | null }[] }>()
        .items.map((i) => i.id)
    expect(await find('Casey S.')).toEqual([c.customerId])
    expect(await find('record-crm01-new@example.test')).toEqual([c.customerId])
    expect(await find('example.test')).not.toContain(c.customerId)
    expect(await find('502-555-0130')).toEqual([c.customerId])
    expect(await find(c.reference.toLowerCase())).toEqual([c.customerId])
    const page = await get('/staff/customers?limit=2', staff.estimator.cookie)
    expect(page.statusCode).toBe(200)
    expect(page.json<{ items: unknown[]; nextCursor: string | null }>().nextCursor).not.toBeNull()
  })
})

describe('visibility classes on notes and attachments (TSK-0044, HH-STAFF-05, OWN-DEC-143)', () => {
  let c: Submitted
  const notes = {} as Record<'internal' | 'incident' | 'financial' | 'requestIncident', string>
  const TEXT = {
    internal: 'SYNTHETIC-NOTE-0044-internal: side gate sticks.',
    incident: 'SYNTHETIC-NOTE-0044-incident: neighbour dispute details.',
    financial: 'SYNTHETIC-NOTE-0044-financial: margin details.',
    request: 'SYNTHETIC-NOTE-0044-request-incident: damage details.',
  }

  beforeAll(async () => {
    c = await submit({ fullName: 'Drew Synthetic Notes', email: 'notes-0044@example.test', phone: '(502) 555-0140' })
    const add = async (role: StaffRole, body: string, visibility?: string) => {
      const res = await write(role, 'POST', `/staff/customers/${c.customerId}/notes`, {
        body,
        ...(visibility ? { visibility } : {}),
      })
      expect(res.statusCode, res.body).toBe(201)
      return res.json<{ id: string }>().id
    }
    notes.internal = await add('office', TEXT.internal)
    notes.incident = await add('office', TEXT.incident, 'restricted_incident')
    notes.financial = await add('owner', TEXT.financial, 'restricted_financial')
    const res = await write('owner', 'POST', `/staff/requests/${c.requestId}/notes`, {
      body: TEXT.request,
      visibility: 'restricted_incident',
    })
    expect(res.statusCode, res.body).toBe(201)
    notes.requestIncident = res.json<{ id: string }>().id
  })

  it('[HH-STAFF-05] a note is internal by default; a customer-shared note and a card number are refused', async () => {
    const row = await t.db
      .selectFrom('crm.customer_notes')
      .select('visibility')
      .where('id', '=', notes.internal)
      .executeTakeFirstOrThrow()
    expect(row.visibility).toBe('internal_operational')
    const path = `/staff/customers/${c.customerId}/notes`
    expect((await write('office', 'POST', path, { body: 'x', visibility: 'customer_shared' })).statusCode).toBe(400)
    const card = await write('office', 'POST', path, { body: `Paid with ${CARD}` })
    expect(card.statusCode).toBe(400)
    expect(card.json().error.fieldErrors[0]).toMatchObject({ field: 'body.body', code: 'sensitive_content' })
    const requestCard = await write('office', 'POST', `/staff/requests/${c.requestId}/notes`, { body: CARD })
    expect(requestCard.json().error.fieldErrors[0].code).toBe('sensitive_content')
    expect((await write('worker', 'POST', path, { body: 'x' })).statusCode).toBe(403)
    await expect(sql`UPDATE crm.customer_notes SET body = 'x'`.execute(t.db)).rejects.toThrow(/APPEND_ONLY/)
    await expect(
      sql`INSERT INTO crm.customer_notes (customer_id, author_staff_id, visibility, body)
          VALUES (${c.customerId}, ${staff.owner.id}, 'customer_shared', 'x')`.execute(t.db),
    ).rejects.toThrow(/customer_notes_visibility_check/)
    // The note's text is never audited.
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select('summary')
      .where('action', '=', 'customer.add_note')
      .execute()
    expect(JSON.stringify(audit)).not.toContain('SYNTHETIC-NOTE-0044')
  })

  it('[HH-STAFF-05][OWN-DEC-143] restricted incident detail: Office sees that it exists, never its text; the Owner reads it, audited', async () => {
    const office = await record('office', c.customerId)
    const byId = new Map(office.notes.map((x) => [x.id, x]))
    expect(byId.get(notes.internal)).toMatchObject({ masked: false, body: TEXT.internal })
    for (const id of [notes.incident, notes.financial, notes.requestIncident])
      expect(byId.get(id)).toMatchObject({ masked: true, body: null, author: null })
    expect(JSON.stringify(office)).not.toContain('SYNTHETIC-NOTE-0044-incident')
    expect(JSON.stringify(office)).not.toContain('SYNTHETIC-NOTE-0044-financial')
    expect(JSON.stringify(office)).not.toContain('SYNTHETIC-NOTE-0044-request-incident')
    const request = await get(`/staff/requests/${c.requestId}`, staff.office.cookie)
    expect(request.json<{ notes: { masked: boolean; body: string | null }[] }>().notes).toEqual([
      expect.objectContaining({ masked: true, body: null, visibility: 'restricted_incident' }),
    ])
    const estimator = await record('estimator', c.customerId)
    expect(estimator.notes.filter((x) => !x.masked).map((x) => x.id)).toEqual([notes.internal])

    const before = await t.db
      .selectFrom('platform.audit_events')
      .select('id')
      .where('action', '=', 'incident.view_restricted')
      .execute()
    const owner = await record('owner', c.customerId)
    expect(owner.notes.every((x) => !x.masked)).toBe(true)
    expect(owner.notes.map((x) => x.body)).toEqual(expect.arrayContaining(Object.values(TEXT)))
    const events = await t.db
      .selectFrom('platform.audit_events')
      .select(['actor_id', 'target_id', 'summary'])
      .where('action', '=', 'incident.view_restricted')
      .execute()
    expect(events.length).toBe(before.length + 1)
    expect(events.at(-1)).toMatchObject({ actor_id: staff.owner.id, target_id: c.customerId })
    expect(JSON.stringify(events)).not.toContain('SYNTHETIC-NOTE-0044')
  })

  it('[HH-STAFF-05][T57] a restricted photo is listed only for a role that reads its class; new photos start internal', async () => {
    const photo = async (visibility?: string) => {
      const cap = randomUUID()
      await t.db
        .insertInto('intake.upload_capabilities')
        .values({
          id: cap,
          token_hash: createHash('sha256').update(randomBytes(32)).digest('hex'),
          scope: 'request',
          request_id: c.requestId,
          expires_at: new Date(Date.now() + 3_600_000),
        })
        .execute()
      const id = randomUUID()
      await t.db
        .insertInto('intake.photos')
        .values({
          id,
          capability_id: cap,
          request_id: c.requestId,
          project_id: c.projectId,
          object_key: `requests/photos/synthetic-0044-${id}`,
          content_type: 'image/png',
          byte_size: 1044,
          sha256: createHash('sha256').update(id).digest('hex'),
          state: 'ready',
          uploader_kind: 'staff',
          ...(visibility ? { visibility } : {}),
        })
        .execute()
      return id
    }
    const internal = await photo()
    const incident = await photo('restricted_incident')
    const financial = await photo('restricted_financial')
    const row = await t.db
      .selectFrom('intake.photos')
      .select('visibility')
      .where('id', '=', internal)
      .executeTakeFirstOrThrow()
    expect(row.visibility).toBe('internal_operational')
    const ids = async (role: StaffRole) =>
      (await get(`/staff/requests/${c.requestId}/photos`, staff[role].cookie))
        .json<{ photos: { id: string }[] }>()
        .photos.map((p) => p.id)
    expect(await ids('office')).toEqual([internal])
    expect(await ids('estimator')).toEqual([internal])
    expect((await ids('owner')).sort()).toEqual([internal, incident, financial].sort())
    const cookie = await customerCookie(c.contactId, [c.projectId])
    expect((await get(`/customer/requests/${c.requestId}/photos`, cookie)).json()).toEqual({ photos: [] })
  })

  it('[T24][HH-STAFF-05][HH-ARC-04] no customer endpoint returns a note, a suggestion or another customer’s details', async () => {
    const cookie = await customerCookie(c.contactId, [c.projectId])
    const routes = MODULES.flatMap((m) => m.routes).filter((r) => r.method === 'GET' && r.path.startsWith('/customer/'))
    expect(routes.length).toBeGreaterThan(0)
    const fill = (path: string) =>
      path
        .replace(':reference', c.reference)
        .replace(':requestId', c.requestId)
        .replace(':projectId', c.projectId)
        .replace(/:[A-Za-z]+/g, c.customerId)
    const leaked = [
      'SYNTHETIC-NOTE-0044',
      'internal_operational',
      'restricted',
      'candidate',
      'shared-t21',
      'Synthetic Landlord',
    ]
    for (const route of routes) {
      const res = await get(fill(route.path), cookie)
      expect([route.path, res.statusCode < 500]).toEqual([route.path, true])
      for (const text of leaked) expect([route.path, res.body.includes(text)]).toEqual([route.path, false])
    }
  })
})
