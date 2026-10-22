// Upload an Estimate and the customer PDF against PostgreSQL 16 and the fake object storage (TSK-0054; HH-EST-11, T31,
// T32, HH-SEC-05, HH-EST-01, HH-EST-03, FACT-UPLOAD-LIMITS, OWN-DEC-102, RULE-SERVER-AUTHZ, RULE-MONEY-CENTS,
// RULE-NO-INVENTED-FACTS). Staff, customers, requests, amounts, documents and the test terms are synthetic
// (RULE-SYNTHETIC-DATA). Publishing is TSK-0055: publish() below moves a version on directly in the database, so the
// database guard of migration 0030 is what refuses or allows it.
import { createHash } from 'node:crypto'
import { loadServiceSeed, syncServices, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import type { CustomerActor } from '@handyhub/policy'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import {
  customerEstimateDocument,
  customerEstimateVersion,
  customerPdfInput,
  customerPdfModel,
  estimateDocumentProcessAutomation,
  publishReadiness,
  renderCustomerPdf,
} from '../../src/modules/estimates/index.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { createAutomationRegistry } from '../../src/platform/automation.js'
import { loadConfig, recordPolicyVersion, type ConfigKey } from '../../src/platform/config/index.js'
import { createWorker } from '../../src/platform/jobs.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { DOCX, docx, PDF, pdf, pdfText } from '../fixtures/documents.js'
import { testConfig } from '../fixtures/env.js'
import { png } from '../fixtures/images.js'
import { signInWithMfa } from '../fixtures/staff-mfa.js'

const MiB = 1024 * 1024
const pw = (n: number) => ['synthetic', 'upload', 'passphrase', 'number', String(n)].join(' ')
const PEOPLE = ['owner', 'office', 'estimator', 'worker'] as const
type Person = (typeof PEOPLE)[number]

let t: TestDatabase
let app: FastifyInstance
const storage = new FakeObjectStorage()
const cookies = {} as Record<Person, string>
const csrf = {} as Record<Person, string>
const staffId = {} as Record<Person, string>

async function signIn(p: Person): Promise<[string, string]> {
  const res = await signInWithMfa(app, {
    method: 'POST',
    url: '/api/v1/staff/auth/sign-in',
    payload: { email: `${p}-upload@example.test`, password: pw(1) },
  })
  expect(res.statusCode).toBe(200)
  const cookie = String(res.headers['set-cookie']).split(';')[0] as string
  const session = await app.inject({ method: 'GET', url: '/api/v1/staff/auth/session', headers: { cookie } })
  return [cookie, session.json<{ csrfToken: string }>().csrfToken]
}

beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
  app = await buildApp({ config: testConfig({ TRUST_PROXY_HOPS: '1' }), api: { db: t.db, storage } })
  const hash = await hashPassword(pw(1))
  await withTx(t.db, async (tx) => {
    for (const p of PEOPLE) {
      const user = await createStaffUser(tx, {
        email: `${p}-upload@example.test`,
        displayName: `Synthetic ${p}`,
        locale: 'en',
        role: p,
        issuedBy: 'test',
      })
      staffId[p] = user.id
      await setPasswordHash(tx, user.id, hash)
    }
  })
  for (const p of PEOPLE) [cookies[p], csrf[p]] = await signIn(p)
})
afterAll(async () => {
  await app?.close()
  await t?.drop()
})

let seq = 0
const key = (what: string) => `synthetic-${what}-${String(++seq).padStart(6, '0')}`
const get = (who: Person, url: string) => app.inject({ method: 'GET', url, headers: { cookie: cookies[who] } })
function write(who: Person, method: 'POST' | 'PUT', url: string, payload: unknown, version?: number) {
  return app.inject({
    method,
    url,
    payload: payload as object,
    headers: {
      cookie: cookies[who],
      'x-csrf-token': csrf[who],
      'idempotency-key': key('write'),
      ...(version === undefined ? {} : { 'if-match': `"${version}"` }),
    },
  })
}
function send(who: Person, url: string, bytes: Buffer, type: string, version?: number) {
  return app.inject({
    method: 'POST',
    url,
    payload: bytes,
    headers: {
      cookie: cookies[who],
      'x-csrf-token': csrf[who],
      'content-type': type,
      ...(version === undefined ? {} : { 'if-match': `"${version}"` }),
    },
  })
}

const ALL_OK = Object.fromEntries(
  ['coverage', 'service_fit', 'essential_facts', 'urgency', 'site_visit_need', 'staff_equipment', 'risk_flags'].map(
    (c) => [c, { outcome: 'ok' }],
  ),
)

let ip = 1
/** A synthetic request through the public API, qualified and moved on with Prepare Online Estimate (TSK-0042). */
async function readyRequest() {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': key('submit'), 'x-forwarded-for': `198.51.100.${++ip}` },
    payload: {
      formVersion: 'test-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }, { serviceId: 'SVC-PT-01' }],
      notSure: false,
      description: 'Synthetic upload project.',
      answers: [],
      property: { street: `${seq} Synthetic Way`, city: 'Testville', state: 'ky', zip: '40000', propertyType: 'house' },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'online',
      contact: {
        fullName: 'Synthetic Upload Customer',
        email: `upload-customer-${seq}@example.test`,
        phone: '(502) 555-0102',
        preferredChannel: 'email',
      },
      smsOptIn: false,
      marketingOptIn: false,
    },
  })
  expect(res.statusCode).toBe(201)
  const { reference } = res.json<{ reference: string }>()
  const row = await t.db
    .selectFrom('intake.requests')
    .select(['id', 'project_id', 'state_version'])
    .where('reference', '=', reference)
    .executeTakeFirstOrThrow()
  expect(
    (await write('owner', 'PUT', `/api/v1/staff/requests/${row.id}/qualification`, { checks: ALL_OK }, 0)).statusCode,
  ).toBe(200)
  const moved = await write(
    'owner',
    'POST',
    `/api/v1/staff/requests/${row.id}/actions/online-estimate`,
    { workPackages: ['SVC-DW-01', 'SVC-PT-01'] },
    row.state_version,
  )
  expect(moved.statusCode).toBe(200)
  return { id: row.id, projectId: row.project_id, reference }
}

type Doc = { id: string; role: string; source: string; contentType: string; sha256: string; state: string }
type View = {
  id: string
  estimateNumber: string
  state: string
  rowVersion: number
  authoringMethod: string
  lines: { id: string; kind: string; amountCents: number | null }[]
  totals: { subtotalCents: number; totalCents: number; depositState: string; depositCents: number | null } | null
  workPackages: { id: string; serviceCode: string }[]
  readiness: { ready: boolean; problems: { code: string; key?: string }[] }
  documents: {
    original: Doc | null
    customerPdf: Doc | null
    pdfRequired: boolean
    agreement: { confirmedBy: { id: string; name: string | null }; documentId: string; current: boolean } | null
    maxFileBytes: number | null
    types: string[]
  } | null
}

const view = async (who: Person, versionId: string) => {
  const res = await get(who, `/api/v1/staff/estimate-versions/${versionId}`)
  expect(res.statusCode).toBe(200)
  return res.json<View>()
}

/** A new estimate of a ready project: written (Write an Estimate) or uploaded (Upload an Estimate). */
async function newEstimate(method: 'written' | 'uploaded', projectId?: string) {
  const project = projectId ?? (await readyRequest()).projectId
  const path = method === 'written' ? 'estimates' : 'uploaded-estimates'
  const res = await write('estimator', 'POST', `/api/v1/staff/projects/${project}/${path}`, {})
  expect(res.statusCode).toBe(201)
  const created = res.json<{ estimateId: string; number: string; versionId: string; rowVersion: number }>()
  return { projectId: project, ...created }
}

/** The same structured amounts for both methods: what the document states, entered as lines (HH-EST-11). */
const amounts = (packages: { id: string }[]) => ({
  lines: [
    {
      kind: 'base',
      workPackageId: packages[0]?.id,
      description: 'Synthetic drywall repair as described in the estimate document',
      quantity: '1',
      unitPriceCents: 60_000,
    },
    {
      kind: 'base',
      workPackageId: packages[1]?.id,
      description: 'Synthetic interior painting as described in the estimate document',
      quantity: '1',
      unitPriceCents: 72_500,
    },
    {
      kind: 'add_on',
      workPackageId: packages[1]?.id,
      description: 'Synthetic trim option',
      quantity: '1',
      unitPriceCents: 9_999,
    },
  ],
  texts: { exclusions: ['Synthetic: moving furniture'] },
})

async function saveAmounts(versionId: string) {
  const v = await view('estimator', versionId)
  const res = await write(
    'estimator',
    'PUT',
    `/api/v1/staff/estimate-versions/${versionId}/draft`,
    amounts(v.workPackages),
    v.rowVersion,
  )
  expect(res.statusCode).toBe(200)
  return res.json<View>()
}

const original = (versionId: string) => `/api/v1/staff/estimate-versions/${versionId}/documents/original`
const customerPdfPath = (versionId: string) => `/api/v1/staff/estimate-versions/${versionId}/documents/customer-pdf`
const processDocuments = () =>
  createWorker({ db: t.db, registry: createAutomationRegistry([estimateDocumentProcessAutomation(storage)]) }).runOnce()
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')

async function upload(versionId: string, bytes: Buffer, type: string, path = original(versionId)) {
  const v = await view('estimator', versionId)
  const res = await send('estimator', path, bytes, type, v.rowVersion)
  expect(res.statusCode, res.body).toBe(201)
  return res.json<View>()
}
async function confirm(versionId: string, confirmed = true) {
  const v = await view('estimator', versionId)
  return write(
    'estimator',
    'PUT',
    `/api/v1/staff/estimate-versions/${versionId}/agreement`,
    { confirmed },
    v.rowVersion,
  )
}

/** Records a new active version of a key and returns a function that restores the old value. */
async function setConfig(k: ConfigKey, value: unknown) {
  const before = (await loadConfig(t.db)).get(k)
  await recordPolicyVersion(t.db, {
    key: k,
    value: value as never,
    sourceIds: ['TEST-SYNTHETIC'],
    changedBy: 'test',
    reason: 'synthetic test configuration',
  })
  return async () => {
    await recordPolicyVersion(t.db, {
      key: k,
      value: (before.state === 'CONFIGURED' ? before.value : null) as never,
      sourceIds: before.sourceIds.length ? [...before.sourceIds] : ['TEST-SYNTHETIC'],
      changedBy: 'test',
      reason: 'restore after a synthetic test',
    })
  }
}
const TEST_TERMS = {
  documentId: 'test-estimate-terms-1',
  status: 'draft',
  attorneyReviewed: false,
  preparedOn: '2026-10-21',
  contentSha256: '0'.repeat(64),
}

/**
 * Publishing in the database only, with the columns publishing writes (TSK-0055 publishVersion is tested in
 * estimate-lifecycle.test.ts): the guard decides exactly as it does for the lifecycle's own update.
 */
async function publish(versionId: string) {
  await t.db
    .updateTable('estimating.estimate_versions')
    .set({
      state: 'published',
      state_changed_at: new Date('2026-10-21T15:00:00Z'),
      published_at: new Date('2026-10-21T15:00:00Z'),
      published_by: staffId.estimator,
      validity_policy_version: 1,
      valid_until: new Date('2026-11-04T15:00:00Z'),
      terms_version: TEST_TERMS.documentId,
      customer_pdf_object_key: `estimates/published/${crypto.randomUUID()}`,
      customer_pdf_sha256: '0'.repeat(64),
      customer_pdf_byte_size: 1,
    })
    .where('id', '=', versionId)
    .execute()
}
const customer = (...projectIds: string[]): CustomerActor => ({
  kind: 'customer',
  contactId: 'contact-synthetic-upload',
  projectAccess: projectIds.map((projectId) => ({ projectId, via: 'grant' as const })),
  freshVerification: false,
})

/** An uploaded PDF estimate with the amounts saved, processed and confirmed. */
async function confirmedUpload(projectId?: string, bytes = pdf({ text: 'Synthetic uploaded estimate' })) {
  const e = await newEstimate('uploaded', projectId)
  await saveAmounts(e.versionId)
  await upload(e.versionId, bytes, PDF)
  await processDocuments()
  expect((await confirm(e.versionId)).statusCode).toBe(200)
  return e
}

describe('[HH-EST-11][T31] Upload an Estimate gives the same version record and customer projection as Write an Estimate', () => {
  it('the uploaded and the written estimate expose the same customer projection; the original is kept byte for byte', async () => {
    const r = await readyRequest()
    const written = await newEstimate('written', r.projectId)
    const writtenView = await saveAmounts(written.versionId)
    const bytes = pdf({ text: 'Synthetic estimate stating a total of $9,999.99 that is never read' })
    const uploaded = await confirmedUpload(r.projectId, bytes)
    const uploadedView = await view('estimator', uploaded.versionId)
    expect(uploadedView.authoringMethod).toBe('uploaded')

    // The same record: the same server-computed lines, totals and deposit (amounts never come from the document).
    const record = (v: View) => ({
      lines: v.lines.map((l) => [l.kind, l.amountCents]),
      totals: v.totals && { ...v.totals, computedAt: 'when saved' },
    })
    expect(record(uploadedView)).toEqual(record(writtenView))
    expect(uploadedView.totals).toMatchObject({
      subtotalCents: 132_500,
      totalCents: 132_500,
      depositState: 'required',
      depositCents: 26_500,
    })

    const restore = await setConfig('legal.estimate_terms', TEST_TERMS)
    try {
      expect(await publishReadiness(t.db, written.versionId)).toEqual({ ready: true, problems: [] })
      expect(await publishReadiness(t.db, uploaded.versionId)).toEqual({ ready: true, problems: [] })
    } finally {
      await restore()
    }
    await publish(written.versionId)
    await publish(uploaded.versionId)

    const actor = customer(r.projectId)
    const a = await customerEstimateVersion(t.db, actor, written.versionId)
    const b = await customerEstimateVersion(t.db, actor, uploaded.versionId)
    expect(a).not.toBeNull()
    expect(b).toEqual({ ...a, estimateNumber: uploaded.number })
    expect(Object.keys(b ?? {})).not.toContain('authoringMethod')

    // The original is unchanged: the stored object, its recorded hash and the staff download are the uploaded bytes.
    const docs = await t.db
      .selectFrom('estimating.estimate_documents')
      .select(['id', 'role', 'source', 'object_key', 'sha256', 'visibility', 'derived_from'])
      .where('version_id', '=', uploaded.versionId)
      .orderBy('role', 'desc')
      .execute()
    expect(docs.map((d) => [d.role, d.source, d.visibility])).toEqual([
      ['original', 'uploaded', 'staff'],
      ['customer_pdf', 'copy_of_original', 'customer'],
    ])
    const [orig, copy] = docs as [(typeof docs)[0], (typeof docs)[0]]
    expect(orig.sha256).toBe(sha(bytes))
    expect(Buffer.from((await storage.get(orig.object_key)).bytes).equals(bytes)).toBe(true)
    expect(copy.object_key).not.toBe(orig.object_key)
    expect(copy.derived_from).toBe(orig.id)
    expect(Buffer.from((await storage.get(copy.object_key)).bytes).equals(bytes)).toBe(true)
    const download = await get(
      'estimator',
      `/api/v1/staff/estimate-versions/${uploaded.versionId}/documents/${orig.id}`,
    )
    expect(download.statusCode).toBe(200)
    expect(download.headers['content-type']).toBe(PDF)
    expect(download.headers['x-content-sha256']).toBe(sha(bytes))
    expect(download.rawPayload.equals(bytes)).toBe(true)

    // The customer reads the customer copy (never the original's object), by a short-lived signed URL.
    const shared = await customerEstimateDocument(t.db, actor, uploaded.versionId, storage)
    expect(shared).toMatchObject({ contentType: PDF, sha256: sha(bytes), byteSize: bytes.length })
    expect(storage.resolveSignedUrl(shared?.url as string)).toEqual({ ok: true, method: 'GET', key: copy.object_key })
    expect(await customerEstimateDocument(t.db, actor, written.versionId, storage)).toBeNull()
    expect(await customerEstimateDocument(t.db, customer(crypto.randomUUID()), uploaded.versionId, storage)).toBeNull()

    // Both customer PDFs come from the same renderer and say the same, the uploaded one naming its document's hash.
    const pdfA = await customerPdfInput(t.db, written.versionId, { testMark: true })
    const pdfB = await customerPdfInput(t.db, uploaded.versionId, { testMark: true })
    if (!pdfA || !pdfB) throw new Error('both versions exist')
    const modelA = customerPdfModel(pdfA)
    const modelB = customerPdfModel(pdfB)
    expect(JSON.stringify(modelB.blocks).replaceAll(uploaded.number, 'N')).toBe(
      JSON.stringify(modelA.blocks)
        .replaceAll(written.number, 'N')
        .replace(
          '{"label":"Estimate terms","value":"test-estimate-terms-1"}',
          `{"label":"Estimate terms","value":"test-estimate-terms-1"},{"label":"Estimate document","value":"PDF, SHA-256 ${sha(bytes)}"}`,
        ),
    )
  })

  it('[T31] an upload without the agree-confirmation is refused; saving or replacing clears the confirmation', async () => {
    const e = await newEstimate('uploaded')
    let v = await view('estimator', e.versionId)
    expect(v.documents).toMatchObject({
      original: null,
      customerPdf: null,
      pdfRequired: false,
      agreement: null,
      maxFileBytes: 15 * MiB,
    })
    expect(v.readiness.problems.map((p) => p.code)).toEqual([
      'NOT_CONFIGURED',
      'NO_LINES',
      'DOCUMENT_MISSING',
      'AGREEMENT_NOT_CONFIRMED',
    ])

    // Confirming needs the documents processed and the totals computed.
    await upload(e.versionId, pdf(), PDF)
    v = await view('estimator', e.versionId)
    expect(v.readiness.problems.map((p) => p.code)).toContain('DOCUMENT_PROCESSING')
    const early = await confirm(e.versionId)
    expect(early.statusCode).toBe(400)
    expect(early.json()).toMatchObject({ error: { fieldErrors: [{ field: 'confirmed', code: 'DOCUMENT_NOT_READY' }] } })
    await processDocuments()
    const noTotals = await confirm(e.versionId)
    expect(noTotals.json()).toMatchObject({
      error: { fieldErrors: [{ field: 'confirmed', code: 'TOTALS_INCOMPLETE' }] },
    })
    await saveAmounts(e.versionId)

    // Not confirmed: publishing is refused by the database too.
    await expect(publish(e.versionId)).rejects.toThrow(/confirmation that the document and the amounts agree/)
    const ok = await confirm(e.versionId)
    expect(ok.statusCode).toBe(200)
    v = ok.json<View>()
    expect(v.documents?.agreement).toMatchObject({
      confirmedBy: { id: staffId.estimator, name: 'Synthetic estimator' },
      current: true,
    })
    expect(v.readiness.problems.map((p) => p.code)).toEqual(['NOT_CONFIGURED'])

    // A save of the amounts clears it; so does a new document; withdrawing it is recorded too.
    await saveAmounts(e.versionId)
    expect((await view('estimator', e.versionId)).documents?.agreement).toBeNull()
    expect((await confirm(e.versionId)).statusCode).toBe(200)
    await upload(e.versionId, pdf({ text: 'Synthetic revised document' }), PDF)
    v = await view('estimator', e.versionId)
    expect(v.documents?.agreement).toBeNull()
    expect(v.readiness.problems.map((p) => p.code)).toEqual([
      'NOT_CONFIGURED',
      'DOCUMENT_PROCESSING',
      'AGREEMENT_NOT_CONFIRMED',
    ])
    await processDocuments()
    expect((await confirm(e.versionId)).statusCode).toBe(200)
    expect((await confirm(e.versionId, false)).json<View>().documents?.agreement).toBeNull()
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select(['action', 'summary'])
      .where('target_id', '=', e.versionId)
      .orderBy('seq')
      .execute()
    expect(audit.map((a) => a.action)).toEqual([
      'estimate.create',
      'estimate.upload_document',
      'estimate.save_draft',
      'estimate.confirm_agreement',
      'estimate.save_draft',
      'estimate.confirm_agreement',
      'estimate.upload_document',
      'estimate.confirm_agreement',
      'estimate.confirm_agreement',
    ])
    // The replaced documents are kept.
    const states = await t.db
      .selectFrom('estimating.estimate_documents')
      .select(['role', 'state'])
      .where('version_id', '=', e.versionId)
      .orderBy('uploaded_at')
      .execute()
    expect(states.filter((s) => s.state === 'replaced')).toHaveLength(2)
  })

  it('[OWN-DEC-102] a Word original stays private: "PDF required" until the PDF of the same document is supplied', async () => {
    const e = await newEstimate('uploaded')
    await saveAmounts(e.versionId)
    const word = docx({ text: 'Synthetic Word estimate' })
    await upload(e.versionId, word, DOCX)
    await processDocuments()
    let v = await view('estimator', e.versionId)
    expect(v.documents?.original).toMatchObject({ contentType: DOCX, state: 'ready', sha256: sha(word) })
    expect(v.documents?.customerPdf).toBeNull()
    expect(v.documents?.pdfRequired).toBe(true)
    expect(v.readiness.problems.map((p) => p.code)).toEqual([
      'NOT_CONFIGURED',
      'PDF_REQUIRED',
      'AGREEMENT_NOT_CONFIRMED',
    ])
    // No conversion is pretended: nothing can be confirmed or published without the PDF.
    expect((await confirm(e.versionId)).statusCode).toBe(400)
    await expect(publish(e.versionId)).rejects.toThrow(/documents ready/)

    const supplied = pdf({ text: 'Synthetic PDF of the Word estimate' })
    await upload(e.versionId, supplied, PDF, customerPdfPath(e.versionId))
    await processDocuments()
    v = await view('estimator', e.versionId)
    expect(v.documents).toMatchObject({
      pdfRequired: false,
      customerPdf: { source: 'supplied', state: 'ready', sha256: sha(supplied) },
    })
    expect((await confirm(e.versionId)).statusCode).toBe(200)
    await publish(e.versionId)

    // The customer gets the supplied PDF; the Word original is never served to them.
    const shared = await customerEstimateDocument(t.db, customer(e.projectId), e.versionId, storage)
    expect(shared?.sha256).toBe(sha(supplied))
    const row = await t.db
      .selectFrom('estimating.estimate_documents')
      .select(['visibility', 'object_key'])
      .where('version_id', '=', e.versionId)
      .where('role', '=', 'original')
      .executeTakeFirstOrThrow()
    expect(row.visibility).toBe('staff')
    expect(storage.resolveSignedUrl(shared?.url as string)).not.toMatchObject({ key: row.object_key })
    // The staff download of the Word original is an attachment, byte for byte.
    const doc = v.documents?.original as Doc
    const res = await get('estimator', `/api/v1/staff/estimate-versions/${e.versionId}/documents/${doc.id}`)
    expect(res.headers['content-disposition']).toMatch(/^attachment;/)
    expect(res.rawPayload.equals(word)).toBe(true)
  })

  it('a PDF original needs no second PDF; a supplied PDF needs a Word original', async () => {
    const e = await newEstimate('uploaded')
    const v = await view('estimator', e.versionId)
    const none = await send('estimator', customerPdfPath(e.versionId), pdf(), PDF, v.rowVersion)
    expect(none.statusCode).toBe(409)
    expect(none.json()).toMatchObject({ error: { fieldErrors: [{ field: 'role', code: 'DOCUMENT_MISSING' }] } })
    const after = await upload(e.versionId, pdf(), PDF)
    const extra = await send('estimator', customerPdfPath(e.versionId), pdf({ text: 'Another' }), PDF, after.rowVersion)
    expect(extra.json()).toMatchObject({ error: { fieldErrors: [{ field: 'role', code: 'PDF_NOT_NEEDED' }] } })
    // The customer-PDF route takes PDFs only.
    expect((await send('estimator', customerPdfPath(e.versionId), docx(), DOCX, after.rowVersion)).statusCode).toBe(415)
  })
})

describe('[FACT-UPLOAD-LIMITS][HH-SEC-03] estimate documents are size-limited, type-checked and content-checked', () => {
  it('[OWN-DEC-146] accepts exactly 15 MiB and refuses one byte more; nothing is stored for a refused file', async () => {
    const e = await newEstimate('uploaded')
    const base = pdf()
    const sized = (size: number) =>
      Buffer.concat([base.subarray(0, 15), Buffer.from(`%${'s'.repeat(size - base.length - 2)}\n`), base.subarray(15)])
    const objects = storage.objects.size
    const big = await send('estimator', original(e.versionId), sized(15 * MiB + 1), PDF, 1)
    expect(big.statusCode).toBe(413)
    expect(storage.objects.size).toBe(objects)
    const exact = await send('estimator', original(e.versionId), sized(15 * MiB), PDF, 1)
    expect(exact.statusCode).toBe(201)
    expect(exact.json<View>().documents?.original).toMatchObject({ contentType: PDF, state: 'quarantined' })
  })

  it('refuses types that are not PDF or Word and content that does not match its declared type', async () => {
    const e = await newEstimate('uploaded')
    const url = original(e.versionId)
    const before = storage.objects.size
    expect((await send('estimator', url, png(), 'image/png', 1)).statusCode).toBe(415)
    expect((await send('estimator', url, Buffer.from('synthetic'), 'text/plain', 1)).statusCode).toBe(415)
    const cases: [Buffer, string, string][] = [
      [pdf(), DOCX, 'type_mismatch'],
      [docx(), PDF, 'type_mismatch'],
      [pdf({ catalog: '/OpenAction << /S /JavaScript /JS (app.alert 1) >>' }), PDF, 'active_content'],
      [docx({ mainType: 'application/vnd.ms-word.document.macroEnabled.main+xml' }), DOCX, 'active_content'],
      [pdf({ trailer: '/Encrypt 9 0 R' }), PDF, 'encrypted'],
      [pdf({ after: 'synthetic second file' }), PDF, 'trailing_data'],
      [Buffer.alloc(0), PDF, 'empty'],
    ]
    for (const [bytes, type, code] of cases) {
      const res = await send('estimator', url, bytes, type, 1)
      expect(res.statusCode, code).toBe(400)
      expect(res.json(), code).toMatchObject({ error: { fieldErrors: [{ field: 'body', code }] } })
    }
    const rows = await t.db
      .selectFrom('estimating.estimate_documents')
      .select('id')
      .where('version_id', '=', e.versionId)
      .execute()
    expect(rows).toEqual([])
    expect(storage.objects.size).toBe(before)
    expect((await view('estimator', e.versionId)).rowVersion).toBe(1)
  })

  it('a stored object that no longer matches its hash is refused by processing and never served', async () => {
    const e = await newEstimate('uploaded')
    const v = await upload(e.versionId, pdf({ text: 'Synthetic tamper check' }), PDF)
    const doc = v.documents?.original as Doc
    const key = await t.db
      .selectFrom('estimating.estimate_documents')
      .select('object_key')
      .where('id', '=', doc.id)
      .executeTakeFirstOrThrow()
    const stored = storage.objects.get(key.object_key)
    if (!stored) throw new Error('object missing')
    stored.bytes = Buffer.from(pdf({ text: 'Synthetic altered bytes' }))
    await processDocuments()
    const after = await view('estimator', e.versionId)
    expect(after.documents?.original).toMatchObject({ state: 'rejected' })
    expect(after.readiness.problems.map((p) => p.code)).toContain('DOCUMENT_REJECTED')
    expect(
      (await get('estimator', `/api/v1/staff/estimate-versions/${e.versionId}/documents/${doc.id}`)).statusCode,
    ).toBe(404)

    // A ready document altered later answers an error, never the altered bytes.
    const good = await confirmedUpload()
    const ready = (await view('estimator', good.versionId)).documents?.original as Doc
    const row = await t.db
      .selectFrom('estimating.estimate_documents')
      .select('object_key')
      .where('id', '=', ready.id)
      .executeTakeFirstOrThrow()
    const obj = storage.objects.get(row.object_key)
    if (!obj) throw new Error('object missing')
    const kept = obj.bytes
    obj.bytes = Buffer.from('synthetic altered')
    expect(
      (await get('estimator', `/api/v1/staff/estimate-versions/${good.versionId}/documents/${ready.id}`)).statusCode,
    ).toBe(500)
    obj.bytes = kept
  })

  it('a retried upload of the same bytes returns the current document; another file needs the current If-Match', async () => {
    const e = await newEstimate('uploaded')
    const bytes = pdf({ text: 'Synthetic retry' })
    const first = await send('estimator', original(e.versionId), bytes, PDF, 1)
    expect(first.statusCode).toBe(201)
    // The retry carries the version the first attempt was sent with.
    const retry = await send('estimator', original(e.versionId), bytes, PDF, 1)
    expect(retry.statusCode).toBe(200)
    expect(retry.json<View>().documents?.original?.id).toBe(first.json<View>().documents?.original?.id)
    const stale = await send('estimator', original(e.versionId), pdf({ text: 'Synthetic other' }), PDF, 1)
    expect(stale.statusCode).toBe(409)
    expect(stale.json()).toMatchObject({ error: { code: 'STALE_VERSION', current: { version: 2 } } })
    expect((await send('estimator', original(e.versionId), pdf({ text: 'Synthetic other' }), PDF)).statusCode).toBe(428)
    const rows = await t.db
      .selectFrom('estimating.estimate_documents')
      .select('id')
      .where('version_id', '=', e.versionId)
      .execute()
    expect(rows).toHaveLength(2)
  })
})

describe('[RULE-SERVER-AUTHZ][HH-SEC-05] only the Owner and Estimators upload, confirm and read documents', () => {
  it('refuses Office and Workers on every route; written versions take no documents; ids answer like missing records', async () => {
    const e = await confirmedUpload()
    const doc = (await view('estimator', e.versionId)).documents?.original as Doc
    for (const who of ['office', 'worker'] as const) {
      expect(
        (await write(who, 'POST', `/api/v1/staff/projects/${e.projectId}/uploaded-estimates`, {})).statusCode,
      ).toBe(403)
      expect((await send(who, original(e.versionId), pdf(), PDF, 1)).statusCode).toBe(403)
      expect((await send(who, customerPdfPath(e.versionId), pdf(), PDF, 1)).statusCode).toBe(403)
      expect(
        (await write(who, 'PUT', `/api/v1/staff/estimate-versions/${e.versionId}/agreement`, { confirmed: false }, 1))
          .statusCode,
      ).toBe(403)
      expect((await get(who, `/api/v1/staff/estimate-versions/${e.versionId}/documents/${doc.id}`)).statusCode).toBe(
        403,
      )
      expect((await get(who, `/api/v1/staff/estimate-versions/${e.versionId}/customer-pdf`)).statusCode).toBe(403)
    }
    const guest = await app.inject({
      method: 'GET',
      url: `/api/v1/staff/estimate-versions/${e.versionId}/documents/${doc.id}`,
    })
    expect(guest.statusCode).toBe(401)
    // The owner may read it.
    expect((await get('owner', `/api/v1/staff/estimate-versions/${e.versionId}/documents/${doc.id}`)).statusCode).toBe(
      200,
    )

    const written = await newEstimate('written')
    const refused = await send('estimator', original(written.versionId), pdf(), PDF, 1)
    expect(refused.statusCode).toBe(409)
    expect(refused.json()).toMatchObject({
      error: { fieldErrors: [{ field: 'authoringMethod', code: 'NOT_UPLOADED_METHOD' }] },
    })
    expect((await view('estimator', written.versionId)).documents).toBeNull()
    // Another version's document, an unknown version or document: like a missing record.
    expect(
      (await get('estimator', `/api/v1/staff/estimate-versions/${written.versionId}/documents/${doc.id}`)).statusCode,
    ).toBe(404)
    expect(
      (await get('estimator', `/api/v1/staff/estimate-versions/${e.versionId}/documents/${crypto.randomUUID()}`))
        .statusCode,
    ).toBe(404)
    expect((await send('estimator', original(crypto.randomUUID()), pdf(), PDF, 1)).statusCode).toBe(404)
  })
})

describe('[T32][HH-DATA-03] a published version keeps its documents and its confirmation', () => {
  it('refuses uploads, confirmation changes and any change to its stored documents', async () => {
    const e = await confirmedUpload()
    await publish(e.versionId)
    const v = await view('estimator', e.versionId)
    expect(v.state).toBe('published')
    const res = await send(
      'estimator',
      original(e.versionId),
      pdf({ text: 'Synthetic late change' }),
      PDF,
      v.rowVersion,
    )
    expect(res.statusCode).toBe(409)
    expect(res.json()).toMatchObject({ error: { fieldErrors: [{ field: 'state', code: 'VERSION_NOT_EDITABLE' }] } })
    const agree = await write(
      'estimator',
      'PUT',
      `/api/v1/staff/estimate-versions/${e.versionId}/agreement`,
      { confirmed: false },
      v.rowVersion,
    )
    expect(agree.statusCode).toBe(409)
    const docId = v.documents?.original?.id as string
    await expect(
      t.db
        .updateTable('estimating.estimate_documents')
        .set({ state: 'replaced', replaced_at: new Date() })
        .where('id', '=', docId)
        .execute(),
    ).rejects.toThrow(/immutable/)
    await expect(
      t.db
        .updateTable('estimating.estimate_documents')
        .set({ sha256: 'f'.repeat(64) })
        .where('id', '=', docId)
        .execute(),
    ).rejects.toThrow(/never changes/)
    await expect(t.db.deleteFrom('estimating.estimate_documents').where('id', '=', docId).execute()).rejects.toThrow(
      /never deleted/,
    )
    await expect(
      t.db
        .updateTable('estimating.estimate_versions')
        .set({ agreement_document_id: null, agreement_confirmed_by: null, agreement_confirmed_at: null })
        .where('id', '=', e.versionId)
        .execute(),
    ).rejects.toThrow(/immutable/)
  })
})

describe('[HH-EST-11][HH-EST-03] the customer PDF', () => {
  it('is generated on the server, in English, from customer-facing data only, and is deterministic', async () => {
    const e = await newEstimate('written')
    const v = await view('estimator', e.versionId)
    const body = amounts(v.workPackages)
    const res = await write(
      'estimator',
      'PUT',
      `/api/v1/staff/estimate-versions/${e.versionId}/draft`,
      {
        ...body,
        lines: body.lines.map((l, i) =>
          i === 0 ? { ...l, internalCost: { materialCostCents: 12_345, note: 'Synthetic secret cost note' } } : l,
        ),
        internal: { estimatorNotes: 'Synthetic confidential estimator note', markupAssumptions: 'Synthetic markup' },
      },
      v.rowVersion,
    )
    expect(res.statusCode).toBe(200)
    const first = await get('estimator', `/api/v1/staff/estimate-versions/${e.versionId}/customer-pdf`)
    expect(first.statusCode).toBe(200)
    expect(first.headers['content-type']).toBe(PDF)
    expect(first.headers['cache-control']).toBe('private, no-store')
    expect(first.rawPayload.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    const second = await get('owner', `/api/v1/staff/estimate-versions/${e.versionId}/customer-pdf`)
    expect(second.rawPayload.equals(first.rawPayload)).toBe(true)

    // The same input rendered readable: what the route serves, with the TEST mark (ci) and no internal value.
    const input = await customerPdfInput(t.db, e.versionId, { testMark: true })
    if (!input) throw new Error('the version exists')
    expect((await renderCustomerPdf(input)).equals(first.rawPayload)).toBe(true)
    const text = pdfText(await renderCustomerPdf(input, { compress: false }))
    for (const expected of [
      'TEST — not a real invoice or estimate',
      `Estimate ${e.number}`,
      'Handyhub LLC',
      'Synthetic Upload Customer',
      'Draft preview — not published',
      '14 days from publishing',
      '$1,325.00',
      'Deposit',
      '$265.00',
      'Optional add-on: Synthetic trim option',
      'Synthetic: moving furniture',
      'Payment due on receipt',
      'Not provided',
    ])
      expect(text, expected).toContain(expected)
    const all = text.join('\n')
    for (const hidden of [
      'Synthetic secret cost note',
      'Synthetic confidential estimator note',
      'Synthetic markup',
      '$123.45',
      'Synthetic estimator',
    ])
      expect(all, hidden).not.toContain(hidden)
    expect(all).not.toMatch(/tax|minimum|surcharge/i)
    // The mailing address is not configured: no address line, never the customer's address in its place.
    expect(text).not.toContain('Address')
    expect(await get('estimator', `/api/v1/staff/estimate-versions/${crypto.randomUUID()}/customer-pdf`)).toMatchObject(
      {
        statusCode: 404,
      },
    )
  })
})
