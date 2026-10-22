// Human-reviewed merges and relinks with the Owner's reversal against PostgreSQL 16 (TSK-0046; HH-CRM-04, HH-ID-02,
// HH-SEC-06, T21, T29, RULE-SERVER-AUTHZ). Every staff member, customer, address and number here is synthetic
// (RULE-SYNTHETIC-DATA).
import { randomUUID } from 'node:crypto'
import { loadServiceSeed, syncServices, withTx, type Tx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { dataScope, type Actor, type StaffRole } from '@handyhub/policy'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { issueGrant, parseContact, requestReissue } from '../../src/modules/access/index.js'
import { candidateMatchAutomation, findCandidates, staffCustomerView } from '../../src/modules/customers/index.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { startCustomerSession } from '../../src/modules/identity/customer-sessions.js'
import { readCodeKey, type CodeKeySettings } from '../../src/modules/identity/index.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { releaseTemplateVersion } from '../../src/modules/notifications/index.js'
import { createAutomationRegistry } from '../../src/platform/automation.js'
import { createWorker } from '../../src/platform/jobs.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { testConfig } from '../fixtures/env.js'
import { signInWithMfa } from '../fixtures/staff-mfa.js'

const ROLES: readonly StaffRole[] = ['owner', 'office', 'estimator', 'worker']
const pw = ['synthetic', 'record', 'links', 'passphrase', '46'].join(' ')
const KEY: CodeKeySettings = readCodeKey({ HANDYHUB_ENV: 'ci', CODE_HASH_KEY: 'synthetic-record-links-key-'.repeat(2) })

let t: TestDatabase
let app: FastifyInstance
const staff = {} as Record<StaffRole, { id: string; cookie: string; csrf: string }>

type Submitted = { reference: string; requestId: string; projectId: string; contactId: string; customerId: string }
type Contact = { fullName: string; email: string; phone: string }

let ip = 10
let n = 0
async function submit(contact: Contact, street = `${++n} Synthetic Link Way`): Promise<Submitted> {
  const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': `synthetic-links-${randomUUID()}`, 'x-forwarded-for': `198.51.100.${++ip}` },
    payload: {
      formVersion: 'test-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic record-links request: a small drywall dent.',
      property: { street, city: 'Testville', state: 'KY', zip: '40046', propertyType: 'house' },
      timing: { preferredDate: future, flexible: false, needHelpToday: false, windows: ['any_time'] },
      estimatePreference: 'let_handyhub_decide',
      contact: { ...contact, preferredChannel: 'email' },
      smsOptIn: false,
      marketingOptIn: false,
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
const post = (role: StaffRole, url: string, payload: Record<string, unknown>) =>
  app.inject({
    method: 'POST',
    url: `/api/v1${url}`,
    headers: {
      cookie: staff[role].cookie,
      'x-csrf-token': staff[role].csrf,
      'idempotency-key': `synthetic-links-write-${randomUUID()}`,
    },
    payload,
  })

type Summary = {
  id: string
  status: string
  contacts: { id: string; customerId: string }[]
  projects: { id: string; reference: string; customerId: string; requests: { id: string }[] }[]
  access: { liveGrants: number; liveSessions: number }
}
type MergePreview = {
  source: Summary
  survivor: Summary
  suggestion: { id: string; status: string } | null
  documents: { state: string }
  payments: { state: string }
  blocked: string | null
  previewDigest: string
}
type RelinkPreview = {
  from: Summary
  to: Summary
  original: { id: string }
  correction: boolean
  revokes: { grants: number; sessions: number }
  documents: { state: string }
  payments: { state: string }
  blocked: string | null
  previewDigest: string
}
type Access = { grantsRevoked: string[]; sessionsRevoked: string[]; projectsAdded: number; moved: string[] }
type View = {
  id: string
  status: string
  mergedInto: { id: string } | null
  contacts: { id: string; customerId: string }[]
  projects: { id: string; reference: string; customerId: string; currentCustomerId: string }[]
  notes: { id: string; body: string | null }[]
  candidates: { items: { id: string; status: string; lastReview: { reason: string } | null }[] }
  links: {
    id: string
    kind: string
    state: string
    reason: string
    correction: boolean
    access: { grantsRevoked: number; sessionsRevoked: number; projectsAdded: number }
    reversal: { reason: string } | null
  }[]
  timeline: { kind: string }[]
  actions: { merge: boolean; relink: boolean; reverseLinks: boolean; edit: boolean }
}
const view = async (role: StaffRole, customerId: string) => {
  const res = await get(`/staff/customers/${customerId}`, staff[role].cookie)
  expect(res.statusCode, res.body).toBe(200)
  return res.json<View>()
}
const mergePreview = async (role: StaffRole, source: string, into: string) => {
  const res = await get(`/staff/customers/${source}/merge-preview?into=${into}`, staff[role].cookie)
  expect(res.statusCode, res.body).toBe(200)
  return res.json<MergePreview>()
}
const relinkPreview = async (role: StaffRole, requestId: string, to: string) => {
  const res = await get(`/staff/requests/${requestId}/relink-preview?to=${to}`, staff[role].cookie)
  expect(res.statusCode, res.body).toBe(200)
  return res.json<RelinkPreview>()
}
const audits = (action: string, targetId: string) =>
  t.db
    .selectFrom('platform.audit_events')
    .select(['actor_id', 'reason', 'summary', 'result'])
    .where('action', '=', action)
    .where('target_id', '=', targetId)
    .execute()

async function grantFor(s: Submitted) {
  const issued = await withTx(t.db, (tx) =>
    issueGrant(tx, KEY, {
      projectId: s.projectId,
      contactId: s.contactId,
      requestId: s.requestId,
      reason: 'submission',
    }),
  )
  if (!issued) throw new Error('grant not issued')
  const session = await withTx(t.db, (tx) =>
    startCustomerSession(tx, {
      contactRef: s.contactId,
      via: 'grant',
      projectIds: [s.projectId],
      verifiedAt: new Date(),
      grantId: issued.grant.id,
    }),
  )
  return { grantId: issued.grant.id, sessionId: session.sessionId, cookie: `__Host-hh_customer=${session.token}` }
}
const grantRow = (id: string) =>
  t.db
    .selectFrom('identity.project_access_grants')
    .select(['project_id', 'contact_id', 'revoked_at', 'revoke_reason'])
    .where('id', '=', id)
    .executeTakeFirstOrThrow()
const sessionRow = (id: string) =>
  t.db
    .selectFrom('identity.customer_sessions')
    .select(['project_ids', 'revoked_at', 'revoke_reason'])
    .where('id', '=', id)
    .executeTakeFirstOrThrow()

/**
 * A fingerprint of every row in every table that references a customer or a project (found from the catalog, so a
 * later table such as invoices or payments is covered the day it is added), for the given customers and projects.
 */
async function referencingRows(customerIds: string[], projectIds: string[]): Promise<Record<string, string>> {
  const fks = await sql<{ tbl: string; col: string; ref: string }>`
    SELECT c.conrelid::regclass::text AS tbl, a.attname AS col, c.confrelid::regclass::text AS ref
      FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
     WHERE c.contype = 'f' AND c.confrelid IN ('crm.customers'::regclass, 'crm.projects'::regclass)
     ORDER BY 1, 2`.execute(t.db)
  const out: Record<string, string> = {}
  for (const fk of fks.rows) {
    const ids = fk.ref === 'crm.customers' ? customerIds : projectIds
    const r = await sql<{ h: string }>`
      SELECT md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) AS h
        FROM ${sql.table(fk.tbl)} AS x WHERE ${sql.ref(`x.${fk.col}`)} = ANY(${ids}::uuid[])`.execute(t.db)
    out[`${fk.tbl}.${fk.col}`] = r.rows[0]?.h ?? ''
  }
  return out
}
// What a link step itself writes: the merged mark on the customer, the link, the suggestion, its queue item and a
// revoked guest link.
const LINK_WRITES = [
  'crm.customers.merged_into_id',
  'crm.record_links.',
  'crm.candidate_matches.',
  'crm.candidate_match_events.',
  'ops.queue_items.',
  'identity.project_access_grants.',
]
const untouched = (a: Record<string, string>) =>
  Object.fromEntries(Object.entries(a).filter(([k]) => !LINK_WRITES.some((w) => k.startsWith(w))))

beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
  app = await buildApp({
    config: testConfig({ TRUST_PROXY_HOPS: '1' }),
    api: { db: t.db, storage: new FakeObjectStorage() },
  })
  const hash = await hashPassword(pw)
  for (const role of ROLES) {
    const id = await withTx(t.db, async (tx: Tx) => {
      const user = await createStaffUser(tx, {
        email: `${role}-links@example.test`,
        displayName: `Synthetic Links ${role}`,
        locale: 'en',
        role,
        issuedBy: 'test',
      })
      await setPasswordHash(tx, user.id, hash)
      return user.id
    })
    const res = await signInWithMfa(app, {
      method: 'POST',
      url: '/api/v1/staff/auth/sign-in',
      payload: { email: `${role}-links@example.test`, password: pw },
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

describe('merges are human-reviewed, non-destructive and reversible by the Owner (TSK-0046, HH-CRM-04, T29)', () => {
  let first: Submitted
  let duplicate: Submitted
  let firstAccess: Awaited<ReturnType<typeof grantFor>>
  let duplicateAccess: Awaited<ReturnType<typeof grantFor>>
  let linkId = ''
  let before: Record<string, string>

  it('[T21][HH-ID-02][HH-CRM-04] a shared email and phone only suggest: nothing is merged until staff confirm', async () => {
    first = await submit({ fullName: 'Ari Synthetic Merge', email: 'merge-t29@example.test', phone: '(502) 555-0146' })
    duplicate = await submit({
      fullName: 'Ari Synthetic Merge',
      email: 'Merge-T29@example.test',
      phone: '502 555 0146',
    })
    await worker().runOnce()
    firstAccess = await grantFor(first)
    duplicateAccess = await grantFor(duplicate)
    const suggestion = await t.db
      .selectFrom('crm.candidate_matches')
      .select(['status', 'reasons'])
      .where('customer_id', '=', duplicate.customerId)
      .executeTakeFirstOrThrow()
    expect(suggestion).toEqual({ status: 'open', reasons: ['email', 'phone', 'name'] })
    expect(await t.db.selectFrom('crm.record_links').select('id').execute()).toEqual([])
    const statuses = await t.db
      .selectFrom('crm.customers')
      .select('status')
      .where('id', 'in', [first.customerId, duplicate.customerId])
      .execute()
    expect(statuses.map((s) => s.status)).toEqual(['active', 'active'])
  })

  it('[HH-CRM-04][RULE-SERVER-AUTHZ] the preview shows both records with projects, documents and payments, to those who may merge', async () => {
    const p = await mergePreview('office', duplicate.customerId, first.customerId)
    expect(p.blocked).toBeNull()
    expect(p.source.projects.map((x) => x.reference)).toEqual([duplicate.reference])
    expect(p.survivor.projects.map((x) => x.reference)).toEqual([first.reference])
    expect(p.source.contacts.map((c) => c.id)).toEqual([duplicate.contactId])
    expect(p.source.access).toEqual({ liveGrants: 1, liveSessions: 1 })
    expect(p.documents).toEqual({ state: 'not_available' })
    expect(p.payments).toEqual({ state: 'not_available' })
    expect(p.suggestion).toMatchObject({ status: 'open' })
    expect(p.previewDigest).toMatch(/^[0-9a-f]{64}$/)
    // The estimator may see the record but not merge; a worker sees neither.
    const path = `/staff/customers/${duplicate.customerId}/merge-preview?into=${first.customerId}`
    expect((await get(path, staff.estimator.cookie)).statusCode).toBe(403)
    expect((await get(path, staff.worker.cookie)).statusCode).toBe(403)
    expect(
      (await get(`/staff/customers/${randomUUID()}/merge-preview?into=${first.customerId}`, staff.office.cookie))
        .statusCode,
    ).toBe(404)
  })

  it('[HH-CRM-04][RULE-SERVER-AUTHZ] a merge needs the permission, a reason and the preview as confirmed', async () => {
    const p = await mergePreview('office', duplicate.customerId, first.customerId)
    const path = `/staff/customers/${duplicate.customerId}/merge`
    const body = {
      survivorId: first.customerId,
      reason: 'Same person sent two requests',
      previewDigest: p.previewDigest,
    }
    expect((await post('office', path, { ...body, reason: undefined })).statusCode).toBe(400)
    expect((await post('office', path, { survivorId: first.customerId, reason: 'x' })).statusCode).toBe(400)
    expect((await post('estimator', path, body)).statusCode).toBe(403)
    expect((await post('worker', path, body)).statusCode).toBe(403)
    const stale = await post('office', path, { ...body, previewDigest: '0'.repeat(64) })
    expect(stale.statusCode).toBe(409)
    expect(stale.json()).toMatchObject({ error: { fieldErrors: [{ code: 'PREVIEW_STALE' }] } })
    const same = await post('office', `/staff/customers/${first.customerId}/merge`, body)
    expect(same.statusCode).toBe(400)
    expect(await t.db.selectFrom('crm.record_links').select('id').execute()).toEqual([])
  })

  it('[T29][HH-CRM-04][HH-SEC-06] Office merges: original IDs, history and financial links kept; access rechecked, never widened', async () => {
    before = await referencingRows([first.customerId, duplicate.customerId], [first.projectId, duplicate.projectId])
    const p = await mergePreview('office', duplicate.customerId, first.customerId)
    const res = await post('office', `/staff/customers/${duplicate.customerId}/merge`, {
      survivorId: first.customerId,
      reason: 'Same person sent two requests',
      previewDigest: p.previewDigest,
    })
    expect(res.statusCode, res.body).toBe(200)
    const out = res.json<{ linkId: string; access: Access }>()
    linkId = out.linkId
    expect(out.access).toMatchObject({ grantsRevoked: [], sessionsRevoked: [], projectsAdded: 0 })
    expect(out.access.moved).toEqual([duplicate.projectId])

    // Every row that references either customer or project is exactly as it was: nothing re-parented or deleted,
    // so invoices, payments, approvals and documents hanging off them stay linked.
    expect(
      untouched(
        await referencingRows([first.customerId, duplicate.customerId], [first.projectId, duplicate.projectId]),
      ),
    ).toEqual(untouched(before))
    const projects = await t.db
      .selectFrom('crm.projects')
      .select(['id', 'customer_id'])
      .where('id', 'in', [first.projectId, duplicate.projectId])
      .execute()
    expect(new Map(projects.map((x) => [x.id, x.customer_id]))).toEqual(
      new Map([
        [first.projectId, first.customerId],
        [duplicate.projectId, duplicate.customerId],
      ]),
    )
    const merged = await t.db
      .selectFrom('crm.customers')
      .select(['status', 'merged_into_id'])
      .where('id', '=', duplicate.customerId)
      .executeTakeFirstOrThrow()
    expect(merged).toEqual({ status: 'merged', merged_into_id: first.customerId })

    // Access: both guest links still name their own project and contact; no session reaches anything new.
    expect(await grantRow(firstAccess.grantId)).toMatchObject({ project_id: first.projectId, revoked_at: null })
    expect(await grantRow(duplicateAccess.grantId)).toMatchObject({ project_id: duplicate.projectId, revoked_at: null })
    expect((await sessionRow(duplicateAccess.sessionId)).project_ids).toEqual([duplicate.projectId])
    expect((await get(`/customer/projects/${first.reference}`, duplicateAccess.cookie)).statusCode).toBe(404)
    expect((await get(`/customer/projects/${duplicate.reference}`, firstAccess.cookie)).statusCode).toBe(404)
    expect((await get(`/customer/projects/${duplicate.reference}`, duplicateAccess.cookie)).statusCode).toBe(200)

    // Audited with the reason, the preview and the recheck.
    const [event, ...more] = await audits('customer.merge', linkId)
    expect(more).toEqual([])
    expect(event).toMatchObject({
      actor_id: staff.office.id,
      reason: 'Same person sent two requests',
      result: 'succeeded',
    })
    expect(event?.summary).toMatchObject({
      kind: 'merge',
      sourceCustomerId: duplicate.customerId,
      survivorId: first.customerId,
      previewDigest: p.previewDigest,
      access: { projectsAdded: 0 },
    })
    // The suggestion is kept, marked merged, and its review item is resolved.
    const suggestion = await t.db
      .selectFrom('crm.candidate_matches')
      .select('status')
      .where('customer_id', '=', duplicate.customerId)
      .executeTakeFirstOrThrow()
    expect(suggestion.status).toBe('merged')
    const item = await t.db
      .selectFrom('ops.queue_items')
      .select('id')
      .where('type', '=', 'candidate_match')
      .where('subject_id', '=', duplicate.customerId)
      .where('resolved_at', 'is', null)
      .executeTakeFirst()
    expect(item).toBeUndefined()
  })

  it('[T29][HH-CRM-04] the survivor shows both records; the merged record is history and is not edited', async () => {
    const survivor = await view('office', first.customerId)
    expect(survivor.projects.map((x) => [x.reference, x.customerId, x.currentCustomerId]).sort()).toEqual(
      [
        [first.reference, first.customerId, first.customerId],
        [duplicate.reference, duplicate.customerId, first.customerId],
      ].sort(),
    )
    expect(survivor.contacts.map((c) => [c.id, c.customerId])).toEqual([
      [first.contactId, first.customerId],
      [duplicate.contactId, duplicate.customerId],
    ])
    expect(survivor.links).toEqual([
      expect.objectContaining({ id: linkId, kind: 'merge', state: 'current', reason: 'Same person sent two requests' }),
    ])
    expect(survivor.timeline.map((e) => e.kind)).toContain('customer_merged')
    expect(survivor.actions).toMatchObject({ merge: true, relink: true, reverseLinks: false })
    expect((await view('owner', first.customerId)).actions.reverseLinks).toBe(true)
    const old = await view('office', duplicate.customerId)
    expect(old).toMatchObject({ status: 'merged', mergedInto: { id: first.customerId } })
    expect(old.projects.map((x) => x.currentCustomerId)).toEqual([first.customerId])
    expect(old.actions).toMatchObject({ edit: false, merge: false })
    const note = await post('office', `/staff/customers/${duplicate.customerId}/notes`, { body: 'Synthetic note' })
    expect(note.statusCode).toBe(409)
    // The request record shows the survivor; the request itself keeps its original customer.
    const request = await get(`/staff/requests/${duplicate.requestId}`, staff.office.cookie)
    expect(request.json<{ customer: { id: string } }>().customer.id).toBe(first.customerId)
    const row = await t.db
      .selectFrom('intake.requests')
      .select('customer_id')
      .where('id', '=', duplicate.requestId)
      .executeTakeFirstOrThrow()
    expect(row.customer_id).toBe(duplicate.customerId)
  })

  it('[HH-ID-02][HH-CRM-04] a merged record makes no new suggestions: its survivor represents it', async () => {
    expect(await withTx(t.db, (tx) => findCandidates(tx, duplicate.customerId))).toEqual(new Map())
    expect([...(await withTx(t.db, (tx) => findCandidates(tx, first.customerId))).keys()]).not.toContain(
      duplicate.customerId,
    )
  })

  it('[HH-CRM-04] a merged record is not merged again, and nothing merges into it', async () => {
    const p = await mergePreview('office', first.customerId, duplicate.customerId)
    expect(p.blocked).toBe('CUSTOMER_MERGED')
    const res = await post('office', `/staff/customers/${first.customerId}/merge`, {
      survivorId: duplicate.customerId,
      reason: 'Wrong way round',
      previewDigest: p.previewDigest,
    })
    expect(res.statusCode).toBe(409)
    expect(res.json()).toMatchObject({ error: { fieldErrors: [{ code: 'CUSTOMER_MERGED' }] } })
  })

  let laterNote = ''
  let laterRequestNote = ''
  let issuedDuring: Awaited<ReturnType<typeof grantFor>>
  it('[T29][HH-CRM-04][RULE-SERVER-AUTHZ] only the Owner reverses; later legitimate activity stays where it was made', async () => {
    // Later activity while merged: a note on the survivor, a note on the merged record's request and a new guest
    // link on the merged record's project.
    const n1 = await post('office', `/staff/customers/${first.customerId}/notes`, { body: 'Synthetic later note' })
    expect(n1.statusCode, n1.body).toBe(201)
    laterNote = n1.json<{ id: string }>().id
    const n2 = await post('office', `/staff/requests/${duplicate.requestId}/notes`, { body: 'Synthetic request note' })
    expect(n2.statusCode, n2.body).toBe(201)
    laterRequestNote = n2.json<{ id: string }>().id
    issuedDuring = await grantFor(duplicate)

    const path = `/staff/customer-links/${linkId}/reverse`
    expect((await post('office', path, { reason: 'Not the same person' })).statusCode).toBe(403)
    expect((await post('owner', path, {})).statusCode).toBe(400)
    const res = await post('owner', path, { reason: 'Not the same person: two family members' })
    expect(res.statusCode, res.body).toBe(200)
    const access = res.json<{ access: Access }>().access
    // The correction revokes what was issued while the mistaken merge stood; earlier access stays.
    expect(access.grantsRevoked).toEqual([issuedDuring.grantId])
    expect(access.sessionsRevoked).toEqual([issuedDuring.sessionId])
    expect(access.projectsAdded).toBe(0)
    expect(await grantRow(issuedDuring.grantId)).toMatchObject({ revoke_reason: 'corrected_link' })
    expect(await grantRow(duplicateAccess.grantId)).toMatchObject({ revoked_at: null })
    expect(await grantRow(firstAccess.grantId)).toMatchObject({ revoked_at: null })
    expect((await get(`/customer/projects/${duplicate.reference}`, issuedDuring.cookie)).statusCode).toBe(401)
    expect((await get(`/customer/projects/${duplicate.reference}`, duplicateAccess.cookie)).statusCode).toBe(200)

    const restored = await t.db
      .selectFrom('crm.customers')
      .select(['status', 'merged_into_id'])
      .where('id', '=', duplicate.customerId)
      .executeTakeFirstOrThrow()
    expect(restored).toEqual({ status: 'active', merged_into_id: null })
    const survivor = await view('owner', first.customerId)
    expect(survivor.projects.map((x) => x.reference)).toEqual([first.reference])
    expect(survivor.notes.map((x) => x.id)).toContain(laterNote)
    expect(survivor.links[0]).toMatchObject({
      id: linkId,
      state: 'reversed',
      reversal: { reason: 'Not the same person: two family members' },
    })
    const back = await view('owner', duplicate.customerId)
    expect(back.projects.map((x) => [x.reference, x.currentCustomerId])).toEqual([
      [duplicate.reference, duplicate.customerId],
    ])
    expect(back.notes.map((x) => x.id)).toContain(laterRequestNote)
    expect(back.timeline.map((e) => e.kind)).toEqual(expect.arrayContaining(['customer_merged', 'link_reversed']))
    // The suggestion is closed as reviewed: not the same customer, with the Owner's reason.
    expect(back.candidates.items).toEqual([
      expect.objectContaining({
        status: 'dismissed',
        lastReview: expect.objectContaining({ reason: 'Not the same person: two family members' }),
      }),
    ])
    // Every row referencing the two records is as before, apart from the later activity and the revoked link.
    const after = untouched(
      await referencingRows([first.customerId, duplicate.customerId], [first.projectId, duplicate.projectId]),
    )
    const changed = Object.keys(after).filter((k) => after[k] !== untouched(before)[k])
    expect(changed.sort()).toEqual(
      ['crm.customer_notes.customer_id', 'intake.request_notes.project_id', 'intake.request_notes.request_id'].filter(
        (k) => k in after,
      ),
    )
    const [event] = await audits('customer.reverse_link_change', linkId)
    expect(event).toMatchObject({ actor_id: staff.owner.id, reason: 'Not the same person: two family members' })
    expect(event?.summary).toMatchObject({ kind: 'merge', access: { grantsRevoked: [issuedDuring.grantId] } })
    const again = await post('owner', path, { reason: 'Again' })
    expect(again.statusCode).toBe(409)
    expect(again.json()).toMatchObject({ error: { fieldErrors: [{ code: 'LINK_REVERSED' }] } })
  })
})

describe('relinking a request never widens access; a correction revokes what the mistake allowed (TSK-0046, T29)', () => {
  let landlord: Submitted
  let tenant: Submitted
  let tenantAccess: Awaited<ReturnType<typeof grantFor>>
  let landlordAccess: Awaited<ReturnType<typeof grantFor>>
  let firstLink = ''

  it('[T29][HH-CRM-04][OWN-DEC-116] linking a request to an existing customer gives the requester none of its earlier projects', async () => {
    landlord = await submit({
      fullName: 'Lou Synthetic Owner',
      email: 'landlord-t29@example.test',
      phone: '(502) 555-0156',
    })
    tenant = await submit({
      fullName: 'Tam Synthetic Renter',
      email: 'tenant-t29@example.test',
      phone: '(502) 555-0157',
    })
    landlordAccess = await grantFor(landlord)
    tenantAccess = await grantFor(tenant)
    const p = await relinkPreview('office', tenant.requestId, landlord.customerId)
    expect(p).toMatchObject({
      correction: false,
      blocked: null,
      original: { id: tenant.customerId },
      from: { id: tenant.customerId },
      to: { id: landlord.customerId },
      documents: { state: 'not_available' },
      payments: { state: 'not_available' },
    })
    expect(
      (
        await get(
          `/staff/requests/${tenant.requestId}/relink-preview?to=${landlord.customerId}`,
          staff.estimator.cookie,
        )
      ).statusCode,
    ).toBe(403)
    const path = `/staff/requests/${tenant.requestId}/relink`
    expect(
      (await post('estimator', path, { customerId: landlord.customerId, reason: 'x', previewDigest: p.previewDigest }))
        .statusCode,
    ).toBe(403)
    expect(
      (await post('office', path, { customerId: landlord.customerId, previewDigest: p.previewDigest })).statusCode,
    ).toBe(400)
    const res = await post('office', path, {
      customerId: landlord.customerId,
      reason: 'The landlord asked for this work',
      previewDigest: p.previewDigest,
    })
    expect(res.statusCode, res.body).toBe(200)
    const out = res.json<{ linkId: string; access: Access }>()
    firstLink = out.linkId
    expect(out.access).toMatchObject({
      grantsRevoked: [],
      sessionsRevoked: [],
      projectsAdded: 0,
      moved: [tenant.projectId],
    })

    // Staff see the request under the landlord now; the tenant's record keeps the link's history.
    const l = await view('office', landlord.customerId)
    expect(l.projects.map((x) => x.reference)).toContain(tenant.reference)
    const tv = await view('office', tenant.customerId)
    expect(tv.projects).toEqual([])
    expect(tv.links).toEqual([expect.objectContaining({ id: firstLink, kind: 'request_relink', state: 'current' })])
    const request = await get(`/staff/requests/${tenant.requestId}`, staff.office.cookie)
    expect(request.json<{ customer: { id: string } }>().customer.id).toBe(landlord.customerId)

    // The tenant reaches only the project they sent; the landlord's contacts gain nothing.
    expect((await get(`/customer/projects/${tenant.reference}`, tenantAccess.cookie)).statusCode).toBe(200)
    expect((await get(`/customer/projects/${landlord.reference}`, tenantAccess.cookie)).statusCode).toBe(404)
    expect((await get(`/customer/projects/${tenant.reference}`, landlordAccess.cookie)).statusCode).toBe(404)
    const grants = await t.db
      .selectFrom('identity.project_access_grants')
      .select(['project_id', 'contact_id'])
      .where('revoked_at', 'is', null)
      .where((eb) => eb.or([eb('contact_id', '=', tenant.contactId), eb('contact_id', '=', landlord.contactId)]))
      .execute()
    expect(grants.map((g) => [g.contact_id, g.project_id]).sort()).toEqual(
      [
        [tenant.contactId, tenant.projectId],
        [landlord.contactId, landlord.projectId],
      ].sort(),
    )
    const [event] = await audits('request.correct_link', firstLink)
    expect(event).toMatchObject({ actor_id: staff.office.id, reason: 'The landlord asked for this work' })
    expect(event?.summary).toMatchObject({
      kind: 'request_relink',
      correction: false,
      toCustomerId: landlord.customerId,
    })
  })

  let during: Awaited<ReturnType<typeof grantFor>>
  let correction = ''
  it('[T29][HH-CRM-04] correcting the mistaken link revokes the access issued while it stood, and keeps the rest', async () => {
    during = await grantFor(tenant)
    const p = await relinkPreview('office', tenant.requestId, tenant.customerId)
    expect(p).toMatchObject({
      correction: true,
      revokes: { grants: 1, sessions: 1 },
      from: { id: landlord.customerId },
    })
    const res = await post('office', `/staff/requests/${tenant.requestId}/relink`, {
      customerId: tenant.customerId,
      reason: 'Linked to the wrong customer: the tenant asked',
      previewDigest: p.previewDigest,
    })
    expect(res.statusCode, res.body).toBe(200)
    const out = res.json<{ linkId: string; access: Access }>()
    correction = out.linkId
    expect(out.access.grantsRevoked).toEqual([during.grantId])
    expect(out.access.sessionsRevoked).toEqual([during.sessionId])
    expect((await get(`/customer/projects/${tenant.reference}`, during.cookie)).statusCode).toBe(401)
    expect((await get(`/customer/projects/${tenant.reference}`, tenantAccess.cookie)).statusCode).toBe(200)
    expect(await grantRow(landlordAccess.grantId)).toMatchObject({ revoked_at: null })
    const tv = await view('office', tenant.customerId)
    expect(tv.projects.map((x) => x.reference)).toEqual([tenant.reference])
    expect(tv.links.map((l) => [l.id, l.state, l.correction])).toEqual([
      [correction, 'current', true],
      [firstLink, 'replaced', false],
    ])
    const [event] = await audits('request.correct_link', correction)
    expect(event?.summary).toMatchObject({ correction: true, access: { grantsRevoked: [during.grantId] } })
    // The same customer again: nothing to link.
    const again = await relinkPreview('office', tenant.requestId, tenant.customerId)
    expect(again.blocked).toBe('SAME_CUSTOMER')
    const same = await post('office', `/staff/requests/${tenant.requestId}/relink`, {
      customerId: tenant.customerId,
      reason: 'Again',
      previewDigest: again.previewDigest,
    })
    expect(same.json()).toMatchObject({ error: { fieldErrors: [{ code: 'SAME_CUSTOMER' }] } })
  })

  it('[T29][HH-CRM-04] the Owner reverses only a request’s current link, and the request goes back where it was', async () => {
    const old = await post('owner', `/staff/customer-links/${firstLink}/reverse`, { reason: 'Undo the first link' })
    expect(old.statusCode).toBe(409)
    expect(old.json()).toMatchObject({ error: { fieldErrors: [{ code: 'LINK_NOT_CURRENT' }] } })
    // Reversing the correction puts the request back under the landlord (the link before it), and revokes what was
    // issued since the correction.
    const since = await grantFor(tenant)
    const res = await post('owner', `/staff/customer-links/${correction}/reverse`, {
      reason: 'The correction was wrong',
    })
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json<{ access: Access }>().access.grantsRevoked).toEqual([since.grantId])
    const l = await view('owner', landlord.customerId)
    expect(l.projects.map((x) => x.reference)).toContain(tenant.reference)
    expect((await get(`/customer/projects/${landlord.reference}`, tenantAccess.cookie)).statusCode).toBe(404)
    // Now the first link is current again and the Owner can reverse it too.
    const first = await post('owner', `/staff/customer-links/${firstLink}/reverse`, { reason: 'Undo the first link' })
    expect(first.statusCode, first.body).toBe(200)
    expect((await view('owner', tenant.customerId)).projects.map((x) => x.reference)).toEqual([tenant.reference])
    expect((await get(`/customer/projects/${tenant.reference}`, tenantAccess.cookie)).statusCode).toBe(200)
  })

  it('[T29][HH-CRM-04] links never move records: the database refuses re-parenting and keeps every link row', async () => {
    await expect(
      sql`UPDATE crm.projects SET customer_id = ${landlord.customerId}::uuid WHERE id = ${tenant.projectId}::uuid`.execute(
        t.db,
      ),
    ).rejects.toThrow(/RECORD_LINKED_NOT_MOVED/)
    await expect(
      sql`UPDATE crm.contacts SET customer_id = ${landlord.customerId}::uuid WHERE id = ${tenant.contactId}::uuid`.execute(
        t.db,
      ),
    ).rejects.toThrow(/RECORD_LINKED_NOT_MOVED/)
    await expect(sql`DELETE FROM crm.record_links WHERE id = ${firstLink}::uuid`.execute(t.db)).rejects.toThrow(
      /never deleted/,
    )
    await expect(
      sql`UPDATE crm.record_links SET reason = 'changed' WHERE id = ${firstLink}::uuid`.execute(t.db),
    ).rejects.toThrow(/keeps what it records/)
    await expect(
      sql`UPDATE crm.record_links SET reverse_reason = 'again', reversed_at = now() WHERE id = ${firstLink}::uuid`.execute(
        t.db,
      ),
    ).rejects.toThrow(/stays reversed/)
    // A customer is never merged into a merged customer (no chains that loop).
    const a = await submit({
      fullName: 'Chain Synthetic A',
      email: 'chain-a-t29@example.test',
      phone: '(502) 555-0158',
    })
    const b = await submit({
      fullName: 'Chain Synthetic B',
      email: 'chain-b-t29@example.test',
      phone: '(502) 555-0159',
    })
    await sql`UPDATE crm.customers SET status = 'merged', merged_into_id = ${b.customerId}::uuid WHERE id = ${a.customerId}::uuid`.execute(
      t.db,
    )
    await expect(
      sql`UPDATE crm.customers SET status = 'merged', merged_into_id = ${a.customerId}::uuid WHERE id = ${b.customerId}::uuid`.execute(
        t.db,
      ),
    ).rejects.toThrow(/survivor that is not merged/)
  })
})

describe('the links meet main’s access recovery and data scope (TSK-0046 with TSK-0035 and TSK-0037, T29)', () => {
  // The neutral recovery (HH-ID-09) needs the access-link wording released; synthetic text only.
  const releaseAccessWording = () =>
    withTx(t.db, async (tx) => {
      for (const channel of ['email', 'sms'] as const)
        await releaseTemplateVersion(tx, {
          messageKey: 'project.access_link',
          channel,
          locale: 'en',
          subject: channel === 'email' ? 'Synthetic test access' : null,
          body: 'SYNTHETIC TEST TEMPLATE {accessLink}',
          translationReview: 'source',
          sourceIds: ['TSK-0035'],
          releasedBy: 'test',
        })
    })
  const reissue = (reference: string, email: string) =>
    withTx(t.db, (tx) =>
      requestReissue(tx, KEY, {
        reference,
        contact: parseContact(email) as NonNullable<ReturnType<typeof parseContact>>,
        requestId: `synthetic-links-reissue-${randomUUID()}`,
      }),
    )
  const relink = async (requestId: string, to: string, reason: string) => {
    const p = await relinkPreview('office', requestId, to)
    const res = await post('office', `/staff/requests/${requestId}/relink`, {
      customerId: to,
      reason,
      previewDigest: p.previewDigest,
    })
    expect(res.statusCode, res.body).toBe(200)
    return { preview: p, out: res.json<{ linkId: string; access: Access }>() }
  }

  it('[T29][HH-CRM-04][HH-ID-09] a link reissued while a mistaken relink stood names the project’s own contact, and the correction revokes it', async () => {
    await releaseAccessWording()
    const holder = await submit({
      fullName: 'Rae Synthetic Holder',
      email: 'holder-reissue-t29@example.test',
      phone: '(502) 555-0161',
    })
    const sender = await submit({
      fullName: 'Sol Synthetic Sender',
      email: 'sender-reissue-t29@example.test',
      phone: '(502) 555-0162',
    })
    const before = await grantFor(sender)
    await relink(sender.requestId, holder.customerId, 'Synthetic: thought to be the holder’s work')

    // Access never follows the link: the holder's contact gets no link for the sender's project; the sender's does.
    expect(await reissue(sender.reference, 'holder-reissue-t29@example.test')).toMatchObject({
      status: 'withheld',
      why: 'no_match',
    })
    const during = await reissue(sender.reference, 'sender-reissue-t29@example.test')
    expect(during).toMatchObject({ status: 'issued', projectId: sender.projectId })
    const duringId = (during as { grantId: string }).grantId
    expect(
      await t.db
        .selectFrom('identity.project_access_grants')
        .select(['project_id', 'contact_id', 'issued_reason'])
        .where('id', '=', duringId)
        .executeTakeFirstOrThrow(),
    ).toEqual({ project_id: sender.projectId, contact_id: sender.contactId, issued_reason: 'reissue' })

    // The correction revokes the reissued link (issued while the mistake stood) and keeps the earlier one.
    const { preview, out } = await relink(
      sender.requestId,
      sender.customerId,
      'Synthetic: linked to the wrong customer',
    )
    expect(preview).toMatchObject({ correction: true, revokes: { grants: 1, sessions: 0 } })
    expect(out.access.grantsRevoked).toEqual([duringId])
    expect(out.access.sessionsRevoked).toEqual([])
    expect(await grantRow(duringId)).toMatchObject({ revoke_reason: 'corrected_link' })
    expect(await grantRow(before.grantId)).toMatchObject({ revoked_at: null })
    expect(await sessionRow(before.sessionId)).toMatchObject({ revoked_at: null })
    expect((await get(`/customer/projects/${sender.reference}`, before.cookie)).statusCode).toBe(200)

    // The rightful contact asks again through the neutral recovery: a corrected link never blocks a new one.
    expect(await reissue(sender.reference, 'sender-reissue-t29@example.test')).toMatchObject({
      status: 'issued',
      projectId: sender.projectId,
    })
  })

  it('[HH-DATA-01][HH-CRM-04] the staff record shows linked and merged projects only inside the caller’s scope', async () => {
    const keeper = await submit({
      fullName: 'Kit Synthetic Keeper',
      email: 'keeper-scope-t29@example.test',
      phone: '(502) 555-0163',
    })
    const moved = await submit({
      fullName: 'Mo Synthetic Moved',
      email: 'moved-scope-t29@example.test',
      phone: '(502) 555-0164',
    })
    await relink(moved.requestId, keeper.customerId, 'Synthetic: the keeper asked for this work')
    const now = new Date()
    const owner: Actor = {
      kind: 'staff',
      userId: staff.owner.id,
      roles: ['owner'],
      capabilities: [],
      status: 'active',
      freshAuth: false,
    }
    const all = await staffCustomerView(t.db, dataScope(owner, 'customer.view', now), keeper.customerId, owner)
    expect(all?.projects.map((p) => p.reference).sort()).toEqual([keeper.reference, moved.reference].sort())
    // A scope limited to the keeper's own project finds the keeper but not the project linked to it.
    const limited = dataScope(
      {
        kind: 'customer',
        contactId: keeper.contactId,
        projectAccess: [{ projectId: keeper.projectId, via: 'grant' }],
        freshVerification: true,
      },
      null,
      now,
    )
    const view = await staffCustomerView(t.db, limited, keeper.customerId, owner)
    expect(view?.projects.map((p) => p.reference)).toEqual([keeper.reference])
    // A worker's scope reaches no customer record at all.
    const worker: Actor = { ...owner, userId: staff.worker.id, roles: ['worker'] }
    expect(await staffCustomerView(t.db, dataScope(worker, 'customer.view', now), keeper.customerId, worker)).toBeNull()
  })
})
