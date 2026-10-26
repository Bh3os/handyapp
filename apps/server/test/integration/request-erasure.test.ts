// The erasure of a request that never became a job, with a reference-and-dates remainder, against PostgreSQL 16
// (TSK-0137; HH-PRIV-08, HH-PRIV-05, T72, OWN-DEC-176, OWN-DEC-177, ENT-Request, ENT-ConsentPreference, ENT-Photo,
// ENT-Message, ENT-RetentionReview, RULE-SERVER-AUTHZ). Staff, customers, requests, photos and words are synthetic
// (RULE-SYNTHETIC-DATA); nothing reaches a provider. Time passing is a later scan clock: records are created now and
// never backdated. Nothing is deleted automatically: every erasure here is the Owner's Confirm Delete or a restore's
// re-application of a recorded one. Estimate terms are recorded as a synthetic in-effect fixture in this throwaway
// database only, so an estimate can be published; that is never a statement that the owner approved any wording.
import { randomUUID } from 'node:crypto'
import { loadServiceSeed, syncServices, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { addLocalDays, localDateOf } from '@handyhub/domain'
import { ESTIMATE_TERMS } from '@handyhub/domain/legal'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { startCustomerSession } from '../../src/modules/identity/customer-sessions.js'
import { readCodeKey, type CodeKeySettings } from '../../src/modules/identity/index.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import {
  addLocalYears,
  exportDeletions,
  objectErasureAutomation,
  OBJECT_ERASURE_AUTOMATION,
  reapplyDeletions,
  requestErasurePlan,
  UNRECORDED_DELETION_CHECKS,
} from '../../src/modules/privacy/index.js'
import { runRetentionScan } from '../../src/modules/retention/index.js'
import { recordPolicyVersion } from '../../src/platform/config/index.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { testConfig } from '../fixtures/env.js'
import { jpeg } from '../fixtures/images.js'
import { signInWithMfa } from '../fixtures/staff-mfa.js'

const KEY: CodeKeySettings = readCodeKey({
  HANDYHUB_ENV: 'ci',
  CODE_HASH_KEY: ['synthetic', 'erasure', 'code', 'key', 'for', 'tests', 'only', '0137'].join('-'),
})
const pw = (n: number) => ['synthetic', 'request', 'erasure', 'passphrase', String(n)].join(' ')
const PEOPLE = ['owner', 'office', 'estimator'] as const
type Person = (typeof PEOPLE)[number]
const email = (p: Person) => `${p}-erasure@example.test`

let t: TestDatabase
let app: FastifyInstance
const storage = new FakeObjectStorage()
const ids = {} as Record<Person, string>
const cookies = {} as Record<Person, string>
const csrf = {} as Record<Person, string>

const YEAR_MS = 365.25 * 24 * 3600 * 1000
const later = (years: number, days = 0) => new Date(Date.now() + years * YEAR_MS + days * 24 * 3600 * 1000)
const ALL_CHECKS = [...UNRECORDED_DELETION_CHECKS]
const ZONE = 'America/Kentucky/Louisville'

let seq = 0
const key = (what: string) => `synthetic-erasure-${what}-${String(++seq).padStart(6, '0')}-${randomUUID().slice(0, 8)}`
const get = (who: Person, url: string) =>
  app.inject({ method: 'GET', url: `/api/v1${url}`, headers: { cookie: cookies[who] } })
function write(who: Person, url: string, payload: unknown, version?: number, method: 'POST' | 'PUT' = 'POST') {
  return app.inject({
    method,
    url: `/api/v1${url}`,
    payload: payload as object,
    headers: {
      cookie: cookies[who],
      'x-csrf-token': csrf[who],
      'idempotency-key': key('write'),
      'x-forwarded-for': '198.51.100.137',
      ...(version === undefined ? {} : { 'if-match': `"${version}"` }),
    },
  })
}

beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
  app = await buildApp({ config: testConfig({ TRUST_PROXY_HOPS: '1' }), api: { db: t.db, storage, codeKey: KEY } })
  const hash = await hashPassword(pw(1))
  await withTx(t.db, async (tx) => {
    for (const p of PEOPLE) {
      const user = await createStaffUser(tx, {
        email: email(p),
        displayName: `Synthetic erasure ${p}`,
        locale: 'en',
        role: p,
        issuedBy: 'test',
      })
      await setPasswordHash(tx, user.id, hash)
      ids[p] = user.id
    }
  })
  for (const p of PEOPLE) {
    const res = await signInWithMfa(app, {
      method: 'POST',
      url: '/api/v1/staff/auth/sign-in',
      headers: { 'x-forwarded-for': '198.51.100.137' },
      payload: { email: email(p), password: pw(1) },
    })
    expect(res.statusCode, res.body).toBe(200)
    cookies[p] = String(res.headers['set-cookie']).split(';')[0] as string
    csrf[p] = res.json().csrfToken as string
  }
  await recordPolicyVersion(t.db, {
    key: 'legal.estimate_terms',
    value: {
      documentId: ESTIMATE_TERMS.documentId,
      status: 'approved',
      attorneyReviewed: true,
      preparedOn: ESTIMATE_TERMS.preparedOn,
      contentSha256: ESTIMATE_TERMS.contentSha256,
    } as never,
    sourceIds: ['TEST-SYNTHETIC'],
    changedBy: 'test',
    reason: 'synthetic test configuration',
  })
})
afterAll(async () => {
  await app?.close()
  await t?.drop()
})

type Submitted = {
  n: number
  requestId: string
  projectId: string
  reference: string
  customerId: string
  contactId: string
  propertyId: string
  grantId: string
  name: string
  email: string
  phone: string
  street: string
  description: string
}

let ip = 10
const nextIp = () => `198.51.100.${(ip = (ip % 250) + 1)}`

/** A synthetic request through the public API; with a photo uploaded to its draft, and the marketing permission. */
async function newRequest(options: { photo?: boolean } = {}): Promise<Submitted> {
  const n = ++seq
  let photoDraft: string | undefined
  if (options.photo) {
    const draft = await app.inject({
      method: 'POST',
      url: '/api/v1/public/request-drafts',
      headers: { 'x-forwarded-for': nextIp() },
    })
    expect(draft.statusCode, draft.body).toBe(201)
    photoDraft = draft.json<{ capability: string }>().capability
    const up = await app.inject({
      method: 'POST',
      url: '/api/v1/public/request-drafts/photos',
      headers: { 'upload-capability': photoDraft, 'content-type': 'image/jpeg', 'x-forwarded-for': nextIp() },
      payload: jpeg(),
    })
    expect(up.statusCode, up.body).toBe(201)
  }
  const tag = randomUUID().slice(0, 8)
  const name = `Synthetic Erasure Customer ${tag}`
  const mail = `erasure-${tag}@example.test`
  const phone = `+1502555${String(100 + (n % 100)).padStart(4, '0')}`
  const street = `${n} Synthetic Erasure ${tag} Way`
  const description = `Synthetic erasure description ${tag}.`
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': key('submit'), 'x-forwarded-for': nextIp() },
    payload: {
      formVersion: 'test-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description,
      answers: [],
      property: { street, city: 'Testville', state: 'ky', zip: '40000', propertyType: 'house' },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'online',
      contact: { fullName: name, email: mail, phone: `(502) 555-${phone.slice(-4)}`, preferredChannel: 'email' },
      smsOptIn: false,
      marketingOptIn: true,
      ...(photoDraft ? { photoDraft } : {}),
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  const { reference } = res.json<{ reference: string }>()
  const row = await t.db
    .selectFrom('intake.requests as r')
    .innerJoin('identity.project_access_grants as g', 'g.request_id', 'r.id')
    .select(['r.id', 'r.project_id', 'r.contact_id', 'r.customer_id', 'r.property_id', 'g.id as grant_id'])
    .where('r.reference', '=', reference)
    .executeTakeFirstOrThrow()
  return {
    n,
    requestId: row.id,
    projectId: row.project_id,
    reference,
    customerId: row.customer_id,
    contactId: row.contact_id,
    propertyId: row.property_id,
    grantId: row.grant_id,
    name,
    email: mail,
    phone,
    street,
    description,
  }
}

const versionOf = async (requestId: string) =>
  (
    await t.db
      .selectFrom('intake.requests')
      .select('state_version')
      .where('id', '=', requestId)
      .executeTakeFirstOrThrow()
  ).state_version

/** Not a fit: the request and its project close (the start of the 2-year period). */
async function notAFit(r: Submitted) {
  const res = await write(
    'office',
    `/staff/requests/${r.requestId}/actions/not-a-fit`,
    { category: 'coverage', customerReason: 'the property is outside the area we serve.' },
    await versionOf(r.requestId),
  )
  expect(res.statusCode, res.body).toBe(200)
}

/**
 * A withdrawn estimate on a request that then closed: the request goes to "ready for estimate", a question moves it to
 * "needs information" (so publishing leaves it there), the estimate is published and withdrawn, and the request is
 * declined Not a fit.
 */
async function closedWithWithdrawnEstimate(r: Submitted) {
  const ok = Object.fromEntries(
    ['coverage', 'service_fit', 'essential_facts', 'urgency', 'site_visit_need', 'staff_equipment', 'risk_flags'].map(
      (c) => [c, { outcome: 'ok' }],
    ),
  )
  const q = await write('owner', `/staff/requests/${r.requestId}/qualification`, { checks: ok }, 0, 'PUT')
  expect(q.statusCode, q.body).toBe(200)
  const ready = await write(
    'owner',
    `/staff/requests/${r.requestId}/actions/online-estimate`,
    { workPackages: ['SVC-DW-01'] },
    await versionOf(r.requestId),
  )
  expect(ready.statusCode, ready.body).toBe(200)
  const created = await write('estimator', `/staff/projects/${r.projectId}/estimates`, {})
  expect(created.statusCode, created.body).toBe(201)
  const { estimateId, versionId } = created.json<{ estimateId: string; versionId: string }>()
  const asked = await write(
    'office',
    `/staff/requests/${r.requestId}/questions`,
    { text: 'Synthetic: is the wall painted?', kind: 'general', noHazardInspection: true },
    await versionOf(r.requestId),
  )
  expect(asked.statusCode, asked.body).toBe(201)
  const view = (await get('estimator', `/staff/estimate-versions/${versionId}`)).json<{
    rowVersion: number
    workPackages: { id: string }[]
  }>()
  const saved = await write(
    'estimator',
    `/staff/estimate-versions/${versionId}/draft`,
    {
      lines: [
        {
          kind: 'base',
          workPackageId: view.workPackages[0]?.id,
          description: 'Patch the synthetic hole',
          quantity: '1',
          unit: 'each',
          unitPriceCents: 12_345,
        },
      ],
      texts: {},
    },
    view.rowVersion,
    'PUT',
  )
  expect(saved.statusCode, saved.body).toBe(200)
  const published = await write(
    'estimator',
    `/staff/estimate-versions/${versionId}/publish`,
    {},
    saved.json<{ rowVersion: number }>().rowVersion,
  )
  expect(published.statusCode, published.body).toBe(200)
  const withdrawn = await write(
    'estimator',
    `/staff/estimate-versions/${versionId}/withdraw`,
    { reason: 'Synthetic: the customer went elsewhere.' },
    published.json<{ rowVersion: number }>().rowVersion,
  )
  expect(withdrawn.statusCode, withdrawn.body).toBe(200)
  await notAFit(r)
  return { estimateId, versionId }
}

const scan = (now: Date) => withTx(t.db, (tx) => runRetentionScan(tx, { now, requestId: `req-${key('scan')}` }))
async function entryFor(recordId: string) {
  const row = await t.db
    .selectFrom('privacy.retention_reviews')
    .select(['id', 'record_ref'])
    .where('record_id', '=', recordId)
    .executeTakeFirst()
  if (!row) throw new Error(`no review entry for ${recordId}`)
  return row
}

const count = async (table: string, column: string, id: string) =>
  Number(
    (
      await sql<{
        n: string
      }>`SELECT count(*)::text AS n FROM ${sql.table(table)} WHERE ${sql.ref(column)}::text = ${id}`.execute(t.db)
    ).rows[0]?.n,
  )

/** Every table whose rows mention the text anywhere (the whole row as text). */
async function tablesMentioning(text: string): Promise<string[]> {
  const { rows } = await sql<{ t: string }>`
    SELECT table_schema || '.' || table_name AS t FROM information_schema.tables
     WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('pg_catalog', 'information_schema')
     ORDER BY 1`.execute(t.db)
  const found: string[] = []
  for (const { t: table } of rows) {
    const { rows: hit } = await sql<{ n: string }>`SELECT count(*)::text AS n FROM ${sql.table(table)} x
      WHERE strpos(lower(x::text), lower(${text})) > 0`.execute(t.db)
    if (Number(hit[0]?.n) > 0) found.push(table)
  }
  return found
}

type Preview = {
  status: { state: string }
  target: {
    record: { type: string; reference: string }
    exists: boolean
    permanent: boolean
    removes: { kind: string; count: number }[]
    keeps: { kind: string; count: number }[]
    blockers: string[]
    confirm: string[]
  }
}

describe('erasing a request that never became a job (TSK-0137, HH-PRIV-08)', () => {
  it('[HH-PRIV-08][HH-PRIV-05] Confirm Delete leaves only the reference, dates and status; stored files and access go; consent evidence moves', async () => {
    const other = await newRequest({ photo: true })
    const r = await newRequest({ photo: true })
    // The handling the request had: an internal note, a logged call, a published question and the customer's reply.
    const note = await write('office', `/staff/requests/${r.requestId}/notes`, {
      body: `Synthetic internal note about ${r.street}.`,
    })
    expect(note.statusCode, note.body).toBe(201)
    const call = await write('office', `/staff/requests/${r.requestId}/conversations`, {
      channel: 'phone',
      outcome: `Synthetic call with ${r.name}.`,
    })
    expect(call.statusCode, call.body).toBe(201)
    const asked = await write(
      'office',
      `/staff/requests/${r.requestId}/questions`,
      { text: 'Synthetic: how wide is the patch?', kind: 'general', noHazardInspection: true },
      await versionOf(r.requestId),
    )
    expect(asked.statusCode, asked.body).toBe(201)
    await t.db
      .insertInto('intake.question_replies')
      .values({
        question_id: asked.json<{ questionId: string }>().questionId,
        request_id: r.requestId,
        project_id: r.projectId,
        author_contact_id: r.contactId,
        body: `Synthetic reply from ${r.name}.`,
        not_sure: false,
        reopened_request: false,
      })
      .execute()
    const session = await withTx(t.db, (tx) =>
      startCustomerSession(tx, {
        contactRef: r.contactId,
        via: 'grant',
        projectIds: [r.projectId],
        verifiedAt: new Date(),
        grantId: r.grantId,
      }),
    )
    await notAFit(r)
    const photo = await t.db
      .selectFrom('intake.photos')
      .select(['id', 'object_key'])
      .where('request_id', '=', r.requestId)
      .executeTakeFirstOrThrow()
    expect(storage.objects.has(photo.object_key)).toBe(true)
    const submittedAt = (
      await t.db
        .selectFrom('intake.requests')
        .select('submitted_at')
        .where('id', '=', r.requestId)
        .executeTakeFirstOrThrow()
    ).submitted_at
    const closedAt = (
      await t.db
        .selectFrom('intake.request_decisions')
        .select('decided_at')
        .where('request_id', '=', r.requestId)
        .where('to_state', '=', 'not_served')
        .executeTakeFirstOrThrow()
    ).decided_at
    const consents = await t.db
      .selectFrom('platform.consent_records')
      .select(['id', 'destination', 'recorded_at'])
      .where('destination', 'in', [r.email, r.phone])
      .execute()
    expect(consents).toHaveLength(2)
    const otherBefore = {
      request: await count('intake.requests', 'id', other.requestId),
      photos: await count('intake.photos', 'request_id', other.requestId),
      consents: await count('platform.consent_records', 'destination', other.email),
      contact: await count('crm.contacts', 'id', other.contactId),
      property: await count('crm.properties', 'id', other.propertyId),
    }
    expect(otherBefore).toEqual({ request: 1, photos: 1, consents: 1, contact: 1, property: 1 })

    // Before: the name, address and words are on file in the request's records.
    expect(await tablesMentioning(r.name)).toEqual(expect.arrayContaining(['crm.contacts', 'crm.customers']))
    expect(await tablesMentioning(r.street)).toEqual(expect.arrayContaining(['crm.properties', 'intake.requests']))

    await scan(later(2, 2))
    const entry = await entryFor(r.requestId)
    expect(entry.record_ref).toBe(r.reference)
    const preview = await get('owner', `/staff/retention-reviews/${entry.id}/deletion`)
    expect(preview.statusCode, preview.body).toBe(200)
    const p = preview.json<Preview>()
    expect(p.target.record).toMatchObject({ type: 'request', reference: r.reference })
    expect(p.target.permanent).toBe(true)
    expect(p.target.blockers).toEqual([])
    expect(p.target.confirm.sort()).toEqual([...ALL_CHECKS].sort())
    for (const kind of ['request_submission', 'photos', 'internal_notes', 'project_record', 'stored_files'])
      expect(p.target.removes, kind).toContainEqual({ kind, count: 1 })
    for (const kind of ['request_answers', 'questions', 'conversations', 'handling_history', 'access_links'])
      expect(p.target.removes.find((x) => x.kind === kind)?.count ?? 0, kind).toBeGreaterThan(0)
    expect(p.target.removes.find((x) => x.kind === 'customer_profile')?.count ?? 0).toBeGreaterThanOrEqual(2)
    expect(p.target.removes.find((x) => x.kind === 'property_record')?.count ?? 0).toBeGreaterThanOrEqual(1)
    expect(p.target.removes).toContainEqual({ kind: 'sessions', count: 1 })
    expect(p.target.keeps).toContainEqual({ kind: 'request_remainder', count: 1 })
    expect(p.target.keeps).toContainEqual({ kind: 'consent_evidence', count: 2 })
    expect(p.target.keeps.map((k) => k.kind)).not.toContain('customer_profile')

    // Only the Owner may delete (RULE-SERVER-AUTHZ, HH-PRIV-05).
    const office = await write('office', `/staff/retention-reviews/${entry.id}/delete`, {
      reason: 'Synthetic.',
      confirmedChecks: ALL_CHECKS,
    })
    expect(office.statusCode).toBe(403)
    expect(await count('intake.requests', 'id', r.requestId)).toBe(1)

    const deleted = await write('owner', `/staff/retention-reviews/${entry.id}/delete`, {
      reason: 'Synthetic: past its period, reviewed.',
      confirmedChecks: ALL_CHECKS,
    })
    expect(deleted.statusCode, deleted.body).toBe(200)
    const deletionId = deleted.json<{ deletionId: string }>().deletionId

    // What remains: the reference, the creation and closure dates and the final status, kept apart.
    const remainder = await t.db
      .selectFrom('privacy.request_remainders')
      .selectAll()
      .where('request_id', '=', r.requestId)
      .executeTakeFirstOrThrow()
    expect(remainder).toMatchObject({
      reference: r.reference,
      final_state: 'not_served',
      deletion_id: deletionId,
    })
    expect(remainder.created_at.toISOString()).toBe(submittedAt.toISOString())
    expect(remainder.closed_at.toISOString()).toBe(closedAt.toISOString())
    expect(Object.keys(remainder).sort()).toEqual(
      ['closed_at', 'created_at', 'deletion_id', 'erased_at', 'final_state', 'reference', 'request_id'].sort(),
    )

    // The records are gone from the database: request, project, customer, contact, property and their children.
    for (const [table, column, id] of [
      ['intake.requests', 'id', r.requestId],
      ['crm.projects', 'id', r.projectId],
      ['crm.customers', 'id', r.customerId],
      ['crm.contacts', 'id', r.contactId],
      ['crm.properties', 'id', r.propertyId],
      ['intake.photos', 'id', photo.id],
      ['intake.request_notes', 'request_id', r.requestId],
      ['intake.request_conversations', 'request_id', r.requestId],
      ['intake.questions', 'request_id', r.requestId],
      ['intake.question_replies', 'request_id', r.requestId],
      ['intake.request_decisions', 'request_id', r.requestId],
      ['identity.project_access_grants', 'id', r.grantId],
      ['identity.customer_sessions', 'id', session.sessionId],
      ['intake.receipt_capabilities', 'request_id', r.requestId],
      ['platform.message_deliveries', 'project_id', r.projectId],
      ['ops.queue_items', 'project_id', r.projectId],
    ] as const)
      expect(await count(table, column, id), `${table} ${id}`).toBe(0)
    // The guest link no longer opens anything: the session is gone.
    const portal = await app.inject({
      method: 'GET',
      url: `/api/v1/customer/projects/${r.reference}`,
      headers: { cookie: `__Host-hh_customer=${session.token}` },
    })
    expect([401, 404]).toContain(portal.statusCode)

    // No table holds the name, the street or the description; the email and phone only in the compliance record.
    expect(await tablesMentioning(r.name)).toEqual([])
    expect(await tablesMentioning(r.street)).toEqual([])
    expect(await tablesMentioning(r.description)).toEqual([])
    expect(await tablesMentioning(r.email)).toEqual(['privacy.consent_evidence'])
    expect(await tablesMentioning(r.phone)).toEqual(['privacy.consent_evidence'])

    // Consent evidence moved, each with its review date: the last use plus 5 years in the business zone (PROPOSED).
    const evidence = await t.db
      .selectFrom('privacy.consent_evidence')
      .selectAll()
      .where('deletion_id', '=', deletionId)
      .orderBy('consent_seq')
      .execute()
    expect(evidence.map((e) => e.consent_id).sort()).toEqual(consents.map((c) => c.id).sort())
    for (const e of evidence) {
      expect(e.review_on).not.toBeNull()
      const onDate = String(e.review_on)
      expect(onDate).toBe(addLocalYears(localDateOf(e.last_used_at, ZONE), 5))
    }
    expect(await count('platform.consent_records', 'destination', r.email)).toBe(0)

    // The deletion log names the request with counts only, never the content.
    const log = await t.db
      .selectFrom('privacy.deletions')
      .selectAll()
      .where('id', '=', deletionId)
      .executeTakeFirstOrThrow()
    expect(log).toMatchObject({ record_type: 'request', record_ref: r.reference, project_id: r.projectId })
    expect((log.removed as Record<string, number>)['request_submission']).toBe(1)
    const listed = (await get('owner', '/staff/deletions')).json<{
      items: { record: { type: string; reference: string } }[]
    }>()
    expect(listed.items[0]?.record).toMatchObject({ type: 'request', reference: r.reference })

    // The stored photo goes after the commit, by the object erasure job.
    const job = await t.db
      .selectFrom('platform.jobs')
      .select(['payload', 'state'])
      .where('automation', '=', OBJECT_ERASURE_AUTOMATION)
      .where('target_id', '=', deletionId)
      .executeTakeFirstOrThrow()
    expect(job.state).toBe('queued')
    expect(String((job.payload as Record<string, unknown>)['keys'])).toContain(photo.object_key)
    await objectErasureAutomation(storage).handle({ job: { payload: job.payload } } as never)
    expect(storage.objects.has(photo.object_key)).toBe(false)

    // The entry reads as deleted; a second delete is refused.
    const after = (await get('owner', `/staff/retention-reviews/${entry.id}/deletion`)).json<Preview>()
    expect(after.status.state).toBe('deleted')
    expect(after.target.record.reference).toBe(r.reference)
    expect(after.target.blockers).toEqual(['already_deleted'])
    const again = await write('owner', `/staff/retention-reviews/${entry.id}/delete`, {
      reason: 'Synthetic.',
      confirmedChecks: ALL_CHECKS,
    })
    expect(again.statusCode).toBe(409)

    // Another project is never touched.
    expect({
      request: await count('intake.requests', 'id', other.requestId),
      photos: await count('intake.photos', 'request_id', other.requestId),
      consents: await count('platform.consent_records', 'destination', other.email),
      contact: await count('crm.contacts', 'id', other.contactId),
      property: await count('crm.properties', 'id', other.propertyId),
    }).toEqual(otherBefore)
    const otherPhoto = await t.db
      .selectFrom('intake.photos')
      .select('object_key')
      .where('request_id', '=', other.requestId)
      .executeTakeFirstOrThrow()
    expect(storage.objects.has(otherPhoto.object_key)).toBe(true)
  })

  it('[HH-PRIV-08] an estimate never accepted goes with the request; its own review entry is decided by the same deletion', async () => {
    const r = await newRequest()
    const e = await closedWithWithdrawnEstimate(r)
    const pdf = (
      await t.db
        .selectFrom('estimating.estimate_versions')
        .select('customer_pdf_object_key')
        .where('id', '=', e.versionId)
        .executeTakeFirstOrThrow()
    ).customer_pdf_object_key as string
    expect(storage.objects.has(pdf)).toBe(true)
    await scan(later(2, 2))
    const entry = await entryFor(r.requestId)
    const estimateEntry = await entryFor(e.estimateId)
    const p = (await get('owner', `/staff/retention-reviews/${entry.id}/deletion`)).json<Preview>()
    expect(p.target.blockers).toEqual([])
    expect(p.target.removes).toContainEqual({ kind: 'estimates', count: 1 })
    expect(p.target.removes).toContainEqual({ kind: 'estimate_versions', count: 1 })
    expect(p.target.removes).toContainEqual({ kind: 'estimate_lines', count: 1 })
    expect(p.target.removes.find((x) => x.kind === 'work_packages')?.count ?? 0).toBeGreaterThan(0)
    const deleted = await write('owner', `/staff/retention-reviews/${entry.id}/delete`, {
      reason: 'Synthetic: past its period.',
      confirmedChecks: ALL_CHECKS,
    })
    expect(deleted.statusCode, deleted.body).toBe(200)
    const deletionId = deleted.json<{ deletionId: string }>().deletionId
    expect(await count('estimating.estimates', 'id', e.estimateId)).toBe(0)
    expect(await count('estimating.estimate_versions', 'id', e.versionId)).toBe(0)
    expect(await count('work.work_packages', 'project_id', r.projectId)).toBe(0)
    const decided = (await get('owner', `/staff/retention-reviews/${estimateEntry.id}/deletion`)).json<Preview>()
    expect(decided.status.state).toBe('deleted')
    const job = await t.db
      .selectFrom('platform.jobs')
      .select('payload')
      .where('automation', '=', OBJECT_ERASURE_AUTOMATION)
      .where('target_id', '=', deletionId)
      .executeTakeFirstOrThrow()
    expect(String((job.payload as Record<string, unknown>)['keys'])).toContain(pdf)
    expect(await tablesMentioning('Patch the synthetic hole')).toEqual([])
  })

  it('[HH-PRIV-08][HH-PRIV-05] an open hold blocks the erasure and Archive is offered; nothing is deleted', async () => {
    const r = await newRequest()
    await t.db
      .insertInto('work.holds')
      .values({
        kind: 'review',
        scope_type: 'request',
        scope_id: r.requestId,
        project_id: r.projectId,
        request_id: r.requestId,
        category: 'other',
        note: 'Synthetic review hold',
        source: 'qualification',
        source_ref: 'qualification:1',
        raised_by: ids.office,
      })
      .execute()
    await notAFit(r)
    await scan(later(2, 2))
    const entry = await entryFor(r.requestId)
    const p = (await get('owner', `/staff/retention-reviews/${entry.id}/deletion`)).json<Preview>()
    expect(p.target.blockers).toEqual(['hold_found'])
    const refused = await write('owner', `/staff/retention-reviews/${entry.id}/delete`, {
      reason: 'Synthetic.',
      confirmedChecks: ALL_CHECKS,
    })
    expect(refused.statusCode).toBe(409)
    expect(refused.json<{ error: { fieldErrors: { code: string }[] } }>().error.fieldErrors.map((f) => f.code)).toEqual(
      ['HOLD_FOUND'],
    )
    for (const [table, column, id] of [
      ['intake.requests', 'id', r.requestId],
      ['crm.projects', 'id', r.projectId],
      ['crm.contacts', 'id', r.contactId],
    ] as const)
      expect(await count(table, column, id), table).toBe(1)
    expect(await count('privacy.request_remainders', 'request_id', r.requestId)).toBe(0)
    const archived = await write('owner', `/staff/retention-reviews/${entry.id}/archive`, {
      reason: 'Synthetic: kept while the hold is reviewed.',
    })
    expect(archived.statusCode, archived.body).toBe(200)
    expect(archived.json()).toMatchObject({ status: { state: 'archived' }, blockers: ['hold_found'] })
  })

  it('[HH-PRIV-08] a request still open, or one linked between customer records, is never erased', async () => {
    const open = await newRequest()
    expect((await requestErasurePlan(t.db, open.requestId)).preview.blockers).toContain('record_active')

    const linked = await newRequest()
    const target = await newRequest()
    await notAFit(linked)
    await t.db
      .insertInto('crm.record_links')
      .values({
        kind: 'request_relink',
        source_customer_id: linked.customerId,
        target_customer_id: target.customerId,
        request_id: linked.requestId,
        project_id: linked.projectId,
        reason: 'Synthetic relink',
        preview: JSON.stringify({}),
        correction: false,
        access_recheck: JSON.stringify({}),
        performed_by: ids.office,
      })
      .execute()
    const plan = await requestErasurePlan(t.db, linked.requestId)
    expect(plan.preview.blockers).toEqual(['linked_records'])
  })

  it('[HH-PRIV-08] records of other projects are never touched: a customer and property another project needs stay', async () => {
    const r = await newRequest()
    await notAFit(r)
    // A second project of the same customer at the same property (synthetic, inserted as staff entry would).
    const second = await t.db
      .insertInto('crm.projects')
      .values({
        reference: `HH-${randomUUID()
          .replace(/[^0-9]/g, '')
          .slice(0, 8)
          .padEnd(8, '1')}`,
        customer_id: r.customerId,
        property_id: r.propertyId,
        state: 'open',
        payment_term: 'due_on_receipt',
        payment_term_version: 1,
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    await scan(later(2, 2))
    const entry = await entryFor(r.requestId)
    const p = (await get('owner', `/staff/retention-reviews/${entry.id}/deletion`)).json<Preview>()
    expect(p.target.blockers).toEqual([])
    expect(p.target.keeps).toContainEqual({ kind: 'customer_profile', count: 1 })
    expect(p.target.keeps).toContainEqual({ kind: 'property_record', count: 1 })
    expect(p.target.keeps.map((k) => k.kind)).not.toContain('consent_evidence')
    expect(p.target.removes.map((k) => k.kind)).not.toContain('customer_profile')
    const deleted = await write('owner', `/staff/retention-reviews/${entry.id}/delete`, {
      reason: 'Synthetic: past its period.',
      confirmedChecks: ALL_CHECKS,
    })
    expect(deleted.statusCode, deleted.body).toBe(200)
    expect(await count('intake.requests', 'id', r.requestId)).toBe(0)
    expect(await count('crm.projects', 'id', r.projectId)).toBe(0)
    // The other project, its customer, contact, property and the consent records stay exactly as they were.
    expect(await count('crm.projects', 'id', second.id)).toBe(1)
    expect(await count('crm.customers', 'id', r.customerId)).toBe(1)
    expect(await count('crm.contacts', 'id', r.contactId)).toBe(1)
    expect(await count('crm.properties', 'id', r.propertyId)).toBe(1)
    expect(await count('platform.consent_records', 'destination', r.email)).toBe(1)
    expect(await count('privacy.consent_evidence', 'destination', r.email)).toBe(0)
  })

  it('[T72][HH-PRIV-08] a restore re-applies the erasure from the exported log, once', async () => {
    const r = await newRequest({ photo: true })
    await notAFit(r)
    await scan(later(2, 2))
    const entry = await entryFor(r.requestId)
    const deleted = await write('owner', `/staff/retention-reviews/${entry.id}/delete`, {
      reason: 'Synthetic: erased before a restore.',
      confirmedChecks: ALL_CHECKS,
    })
    expect(deleted.statusCode, deleted.body).toBe(200)
    const exported = (await exportDeletions(t.db)).filter((x) => x.recordType === 'request')
    const mine = exported.find((x) => x.recordId === r.requestId)
    expect(mine).toMatchObject({ recordType: 'request', recordRef: r.reference })
    expect(JSON.stringify(exported)).not.toContain(r.name)

    // A restored database holds a request erased after its backup: here, one never erased, named by an exported entry.
    const restored = await newRequest({ photo: true })
    await notAFit(restored)
    const photo = await t.db
      .selectFrom('intake.photos')
      .select('object_key')
      .where('request_id', '=', restored.requestId)
      .executeTakeFirstOrThrow()
    const original = {
      id: randomUUID(),
      reason: 'Synthetic: erased after the backup.',
      decidedAt: new Date().toISOString(),
    }
    const file = [
      ...(mine ? [mine] : []),
      { ...original, recordType: 'request' as const, recordId: restored.requestId, recordRef: restored.reference },
    ]
    const results = await withTx(t.db, (tx) =>
      reapplyDeletions(tx, file, { requestId: 'synthetic-restore', operator: 'test' }),
    )
    expect(results.map((x) => x.outcome)).toEqual(['absent', 'reapplied'])
    expect(await count('intake.requests', 'id', restored.requestId)).toBe(0)
    expect(await count('crm.contacts', 'id', restored.contactId)).toBe(0)
    const rest = await t.db
      .selectFrom('privacy.request_remainders as m')
      .innerJoin('privacy.deletions as d', 'd.id', 'm.deletion_id')
      .select(['m.reference', 'm.final_state', 'd.source', 'd.original_deletion_id', 'd.decided_by'])
      .where('m.request_id', '=', restored.requestId)
      .executeTakeFirstOrThrow()
    expect(rest).toMatchObject({
      reference: restored.reference,
      final_state: 'not_served',
      source: 'restore_reapply',
      original_deletion_id: original.id,
      decided_by: 'system.restore:test',
    })
    const job = await t.db
      .selectFrom('platform.jobs as j')
      .innerJoin('privacy.deletions as d', (jn) => jn.on(sql<boolean>`d.id::text = j.target_id`))
      .select('j.payload')
      .where('j.automation', '=', OBJECT_ERASURE_AUTOMATION)
      .where('d.original_deletion_id', '=', original.id)
      .executeTakeFirstOrThrow()
    expect(String((job.payload as Record<string, unknown>)['keys'])).toContain(photo.object_key)
    const twice = await withTx(t.db, (tx) => reapplyDeletions(tx, file, { requestId: 'synthetic-restore-2' }))
    expect(twice.map((x) => x.outcome)).toEqual(['absent', 'absent'])
  })

  it('[HH-PRIV-08] the database refuses to delete request rows outside an erasure', async () => {
    const r = await newRequest()
    await expect(
      sql`DELETE FROM intake.request_services WHERE request_id = ${r.requestId}`.execute(t.db),
    ).rejects.toThrow()
    await expect(sql`DELETE FROM intake.requests WHERE id = ${r.requestId}`.execute(t.db)).rejects.toThrow()
    // A deletion log entry of another transaction does not open the guards.
    const other = await t.db
      .selectFrom('privacy.deletions')
      .select('id')
      .where('record_type', '=', 'request')
      .executeTakeFirstOrThrow()
    await expect(
      withTx(t.db, async (tx) => {
        await sql`SELECT set_config('handyhub.erasure', ${other.id}, true)`.execute(tx)
        await sql`DELETE FROM intake.request_services WHERE request_id = ${r.requestId}`.execute(tx)
      }),
    ).rejects.toThrow()
    expect(await count('intake.request_services', 'request_id', r.requestId)).toBe(1)
    expect(addLocalYears('2028-02-29', 5)).toBe('2033-02-28')
    expect(addLocalYears(addLocalDays('2026-10-25', 1), 5)).toBe('2031-10-26')
  })
})
