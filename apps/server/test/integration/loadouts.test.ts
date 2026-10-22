// Loadout confirmation and critical shortages against PostgreSQL 16 (TSK-0071; HH-PKT-05, HH-PKT-06, HH-WORK-01,
// HH-WORK-02, T43, T45, ENT-WorkPackage, ENT-Hold, ENT-JobPacket, ENT-AuditEvent, OQ-LOADOUT-DETAILS,
// RULE-SAFETY-GATES, RULE-SERVER-AUTHZ, RULE-NO-INVENTED-FACTS). Staff, customers, working hours, addresses and notes
// are synthetic (RULE-SYNTHETIC-DATA); the estimate terms version recorded below is a fixture of this throwaway
// database. The loadout lists are the real imported seed (business configuration, not synthetic data).
// - Start Work itself is TSK-0073: here the database's own backstop (migration 0063) is exercised directly, by moving
//   a work package to in_progress the way the start transaction will.
import { randomUUID } from 'node:crypto'
import {
  createDb,
  loadLoadoutSeed,
  loadServiceSeed,
  loadSopSeed,
  syncLoadouts,
  syncServices,
  syncSops,
  withTx,
  type Db,
} from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { addLocalDays, localDateOf, type LoadoutContent } from '@handyhub/domain'
import { ESTIMATE_TERMS } from '@handyhub/domain/legal'
import { decide, type StaffActor } from '@handyhub/policy'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { startCustomerSession } from '../../src/modules/identity/customer-sessions.js'
import { readCodeKey, type CodeKeySettings } from '../../src/modules/identity/index.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { recordPolicyVersion } from '../../src/platform/config/index.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { verifyCountyOf } from '../fixtures/county.js'
import { testConfig } from '../fixtures/env.js'

const ZONE = 'America/Kentucky/Louisville'
const KEY: CodeKeySettings = readCodeKey({
  HANDYHUB_ENV: 'ci',
  CODE_HASH_KEY: ['synthetic', 'loadouts', 'code', 'key', 'for', 'tests', 'only', '0071'].join('-'),
})
const pw = ['synthetic', 'loadouts', 'passphrase', '71'].join(' ')
const SIGNED_IN = ['owner', 'office', 'estimator', 'ann', 'ben'] as const
type Person = (typeof SIGNED_IN)[number]
const SEED = loadLoadoutSeed()
const seedItems = (serviceId: string) =>
  (SEED.find((l) => l.serviceId === serviceId)?.content as unknown as LoadoutContent).groups.flatMap((g) => g.items)
/** The CL-01 list's PPE group (as the file heads it) and its first item: the critical PPE of T45. */
const PPE = (() => {
  const content = SEED.find((l) => l.serviceId === 'SVC-CL-01')?.content as unknown as LoadoutContent
  const group = content.groups.find((g) => (g.heading ?? '').includes('PPE'))
  const item = group?.items[0]
  if (!item) throw new Error('CL-01 lists a PPE item')
  return item
})()

let t: TestDatabase
let wide: Db
let app: FastifyInstance
const cookies = {} as Record<Person, string>
const csrf = {} as Record<Person, string>
const ids = {} as Record<Person, string>
const actors = {} as Record<Person, StaffActor>

const today = () => localDateOf(new Date(), ZONE)
const day = (n: number) => addLocalDays(today(), n)
const WEEK = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, start: '08:00', end: '20:00' }))

async function signIn(p: Person): Promise<[string, string]> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/staff/auth/sign-in',
    headers: { 'x-forwarded-for': '198.51.100.171' },
    payload: { email: `${p}-loadouts@example.test`, password: pw },
  })
  expect(res.statusCode, res.body).toBe(200)
  const cookie = String(res.headers['set-cookie']).split(';')[0] as string
  const session = await app.inject({ method: 'GET', url: '/api/v1/staff/auth/session', headers: { cookie } })
  return [cookie, session.json<{ csrfToken: string }>().csrfToken]
}

let seq = 0
const key = (what: string) => `synthetic-${what}-${String(++seq).padStart(6, '0')}-${randomUUID()}`
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

beforeAll(async () => {
  t = await createTestDatabase()
  wide = createDb(t.url, { max: 8, applicationName: 'loadouts-test' })
  await syncServices(t.db, loadServiceSeed())
  await syncSops(t.db, loadSopSeed())
  await syncLoadouts(t.db, SEED)
  app = await buildApp({
    config: testConfig({ TRUST_PROXY_HOPS: '1' }),
    api: { db: wide, codeKey: KEY, storage: new FakeObjectStorage() },
  })
  const hash = await hashPassword(pw)
  await withTx(t.db, async (tx) => {
    for (const p of SIGNED_IN) {
      const role = p === 'ann' || p === 'ben' ? 'worker' : p
      const user = await createStaffUser(tx, {
        email: `${p}-loadouts@example.test`,
        displayName: `Synthetic ${p}`,
        locale: p === 'ben' ? 'es' : 'en',
        role,
        issuedBy: 'test',
      })
      await setPasswordHash(tx, user.id, hash)
      ids[p] = user.id
    }
  })
  for (const p of SIGNED_IN) [cookies[p], csrf[p]] = await signIn(p)
  for (const p of SIGNED_IN)
    actors[p] = {
      kind: 'staff',
      userId: ids[p],
      roles: [p === 'ann' || p === 'ben' ? 'worker' : p],
      capabilities: [],
      status: 'active',
      freshAuth: false,
    }
  for (const c of ['ann', 'ben'] as const) {
    const res = await staffWrite('owner', 'PUT', `/api/v1/staff/workers/${ids[c]}/working-hours`, { periods: WEEK }, 0)
    expect(res.statusCode, res.body).toBe(200)
  }
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
})
afterAll(async () => {
  await app?.close()
  await wide?.destroy()
  await t?.drop()
})

const ALL_OK = Object.fromEntries(
  ['coverage', 'service_fit', 'essential_facts', 'urgency', 'site_visit_need', 'staff_equipment', 'risk_flags'].map(
    (c) => [c, { outcome: 'ok' }],
  ),
)
const SERVICES = ['SVC-DW-01', 'SVC-CL-01'] as const
type Project = { requestId: string; projectId: string; reference: string; cookie: string }
let ip = 40

/** A qualified synthetic request with a DW-01 and a CL-01 work package, and a verified customer session. */
async function project(): Promise<Project> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': key('submit'), 'x-forwarded-for': `198.51.100.${++ip}` },
    payload: {
      formVersion: 'test-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: SERVICES.map((serviceId) => ({ serviceId })),
      notSure: false,
      description: 'Synthetic loadout project.',
      answers: [],
      property: {
        street: `${++seq} Synthetic Loadout Lane`,
        city: 'Testville',
        state: 'ky',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'site_visit',
      contact: {
        fullName: 'Synthetic Loadout Customer',
        email: `loadouts-${seq}-${randomUUID().slice(0, 8)}@example.test`,
        phone: '(502) 555-0171',
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
    .select(['r.id', 'r.project_id', 'r.contact_id'])
    .where('r.reference', '=', reference)
    .executeTakeFirstOrThrow()
  // TSK-0127: staff's address and county check, which a first confirmation needs.
  await verifyCountyOf(t.db, row.project_id)
  const grant = await t.db
    .selectFrom('identity.project_access_grants')
    .select('id')
    .where('request_id', '=', row.id)
    .executeTakeFirstOrThrow()
  expect(
    (await staffWrite('owner', 'PUT', `/api/v1/staff/requests/${row.id}/qualification`, { checks: ALL_OK }, 0))
      .statusCode,
  ).toBe(200)
  const moved = await staffWrite(
    'owner',
    'POST',
    `/api/v1/staff/requests/${row.id}/actions/estimate-visit`,
    { customerExplanation: 'We need to see the synthetic rooms.', workPackages: [...SERVICES] },
    1,
  )
  expect(moved.statusCode, moved.body).toBe(200)
  const s = await withTx(t.db, (tx) =>
    startCustomerSession(tx, {
      contactRef: row.contact_id,
      via: 'grant',
      projectIds: [row.project_id],
      verifiedAt: new Date(),
      grantId: grant.id,
    }),
  )
  return { requestId: row.id, projectId: row.project_id, reference, cookie: `__Host-hh_customer=${s.token}` }
}

/** Approves one synthetic line per work package ($12.50 each: no deposit); returns the job. */
async function approve(p: Project): Promise<string> {
  const created = await staffWrite('estimator', 'POST', `/api/v1/staff/projects/${p.projectId}/estimates`, {})
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
      lines: v.workPackages.map((w, n) => ({
        kind: 'base',
        workPackageId: w.id,
        description: `Synthetic work ${n + 1}`,
        quantity: '1',
        unit: 'job',
        unitPriceCents: 625,
      })),
      texts: { exclusions: ['Synthetic: moving furniture'] },
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
  const base = `/api/v1/customer/projects/${p.reference}/estimates/${c.number}/versions/1`
  const d = (await app.inject({ method: 'GET', url: base, headers: { cookie: p.cookie } })).json<{
    approval: { contentDigest: string; selection: { totalCents: number; deposit: { amountCents: number | null } } }
  }>()
  const res = await app.inject({
    method: 'POST',
    url: `${base}/approve`,
    headers: {
      cookie: p.cookie,
      'idempotency-key': key('approve'),
      'x-forwarded-for': `2001:db8:71:${++ip}::1`,
      'user-agent': 'SyntheticBrowser/1.0 (test)',
    },
    payload: {
      contentDigest: d.approval.contentDigest,
      options: [],
      totalCents: d.approval.selection.totalCents,
      depositCents: d.approval.selection.deposit.amountCents,
      termsDocumentId: ESTIMATE_TERMS.documentId,
      termsSha256: ESTIMATE_TERMS.contentSha256,
      acceptTerms: true,
      fullName: 'Synthetic Loadout Customer',
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (
    await t.db.selectFrom('work.jobs').select('id').where('project_id', '=', p.projectId).executeTakeFirstOrThrow()
  ).id
}

/** A work visit planned by Office and confirmed with one worker. */
async function bookedVisit(p: Project, date: string, worker: Person): Promise<void> {
  const planned = await staffWrite('office', 'POST', `/api/v1/staff/projects/${p.projectId}/visits`, {
    purpose: 'service',
    localDate: date,
    windowStart: '09:00',
    windowEnd: '10:00',
    expectedDurationMinutes: 60,
    travelBufferMinutes: 30,
    preparationBufferMinutes: 0,
    requiredWorkers: 1,
    equipment: [],
  })
  expect(planned.statusCode, planned.body).toBe(201)
  const all = planned.json<{ visits: { id: string; version: number }[] }>().visits
  const v = all[all.length - 1] as { id: string; version: number }
  const res = await staffWrite(
    'office',
    'POST',
    `/api/v1/staff/visits/${v.id}/confirm`,
    { workerIds: [ids[worker]] },
    v.version,
  )
  expect(res.statusCode, res.body).toBe(200)
}

type Item = {
  key: string
  name: string | null
  lines: string[]
  criticality: string
  current: { status: string; substitute: string | null; impacts: string[] | null; note: string | null } | null
}
type Block = {
  holdId: string
  itemKey: string
  itemName: string | null
  state: string
  version: number
  note: string
  owner: { role: string; action: string }
  actions: { startReview: boolean; resolve: boolean; cancel: boolean }
}
type Pkg = {
  workPackageId: string
  serviceCode: string
  loadout: { inventoryId: string; version: number; sourceFile: string } | null
  readiness: { state: string; unconfirmed: string[]; reported: string[]; blocks: string[] }
  groups: { heading: string | null; items: Item[]; notes: unknown[] }[]
  proposed: { lines: string[] } | null
  blocks: Block[]
}
type View = { jobId: string; packetVersion: number; packages: Pkg[]; actions: { record: boolean } }

async function loadout(who: Person, jobId: string): Promise<View> {
  const res = await staffGet(who, `/api/v1/staff/jobs/${jobId}/loadout`)
  expect(res.statusCode, res.body).toBe(200)
  return res.json<View>()
}
const pkgOf = (v: View, code: string) => {
  const p = v.packages.find((x) => x.serviceCode === code)
  if (!p) throw new Error(`no ${code} package`)
  return p
}
const items = (p: Pkg) => p.groups.flatMap((g) => g.items)
const check = (
  who: Person,
  jobId: string,
  workPackageId: string,
  list: { key: string; status: string; note?: string }[],
) => staffWrite(who, 'POST', `/api/v1/staff/jobs/${jobId}/loadout/checks`, { workPackageId, items: list })
const block = (who: Person, holdId: string, action: string, body: unknown, version: number) =>
  staffWrite(who, 'POST', `/api/v1/staff/loadout-blocks/${holdId}/actions/${action}`, body, version)

/** Moves a work package to in_progress the way the Start Work transaction will (TSK-0073), then rolls it back. */
async function tryStart(workPackageId: string): Promise<'started' | string> {
  const rollback = new Error('rollback')
  try {
    await t.db.transaction().execute(async (tx) => {
      await tx.updateTable('work.work_packages').set({ state: 'in_progress' }).where('id', '=', workPackageId).execute()
      throw rollback
    })
  } catch (e) {
    if (e === rollback) return 'started'
    return (e as Error).message
  }
  return 'started'
}

describe('the loadout of each work package (TSK-0071, HH-PKT-05, T43)', () => {
  let p: Project
  let jobId: string
  beforeAll(async () => {
    p = await project()
    jobId = await approve(p)
    await bookedVisit(p, day(3), 'ann')
  })

  it('[HH-PKT-05][T43] each package lists its inventory file verbatim, pinned once, every item required, no quantity added', async () => {
    const v = await loadout('ann', jobId)
    expect(v.actions.record).toBe(true)
    expect(v.packages.map((x) => x.serviceCode).sort()).toEqual(['CL-01', 'DW-01'])
    for (const code of ['DW-01', 'CL-01']) {
      const pkg = pkgOf(v, code)
      expect(pkg.loadout).toMatchObject({ inventoryId: `FACT-INVENTORY-${code}`, version: 1 })
      expect(pkg.loadout?.sourceFile).toMatch(/^Required inventory\//)
      const expected = seedItems(`SVC-${code}`)
      expect(items(pkg).map((i) => [i.key, i.lines])).toEqual(expected.map((i) => [i.key, i.lines]))
      for (const i of items(pkg)) {
        expect(i.criticality).toBe('required')
        expect(Object.keys(i)).not.toContain('quantity')
        expect(i.current).toBeNull()
      }
      // The proposed additions are shown as such and are never items.
      expect(pkg.proposed?.lines[0]).toMatch(/^Proposed additions/)
      expect(pkg.readiness).toMatchObject({ state: 'not_confirmed', blocks: [] })
      expect(pkg.readiness.unconfirmed).toEqual(expected.map((i) => i.key))
    }
    // The packet carries the lists (the items only) in its tools, equipment and materials section.
    const packet = (await staffGet('ann', `/api/v1/staff/jobs/${jobId}/packet`)).json<{
      materials: { state: string; packages: { serviceCode: string; state: string; items: { name: string | null }[] }[] }
    }>()
    expect(packet.materials.state).toBe('listed')
    expect(packet.materials.packages.find((x) => x.serviceCode === 'CL-01')?.items.map((i) => i.name)).toEqual(
      seedItems('SVC-CL-01').map((i) => i.name),
    )
    // A later import of changed content is a new version; the job keeps the version pinned on it.
    const changed = SEED.map((l) =>
      l.serviceId === 'SVC-DW-01' ? { ...l, contentSha256: 'f'.repeat(64), title: `${l.title} (synthetic change)` } : l,
    )
    expect((await syncLoadouts(t.db, changed)).versioned).toEqual(['FACT-INVENTORY-DW-01'])
    expect(pkgOf(await loadout('owner', jobId), 'DW-01').loadout?.version).toBe(1)
    await syncLoadouts(t.db, SEED)
    expect(
      (await t.db.selectFrom('work.work_package_loadouts').selectAll().where('job_id', '=', jobId).execute()).length,
    ).toBe(2)
  })

  it('[HH-PKT-05][RULE-SERVER-AUTHZ] only assigned workers state; office reads; an unassigned worker reaches nothing', async () => {
    const office = await loadout('office', jobId)
    expect(office.actions.record).toBe(false)
    const dw = pkgOf(office, 'DW-01')
    expect((await check('office', jobId, dw.workPackageId, [{ key: '1', status: 'loaded' }])).statusCode).toBe(403)
    expect((await staffGet('ben', `/api/v1/staff/jobs/${jobId}/loadout`)).statusCode).toBe(403)
    expect((await check('ben', jobId, dw.workPackageId, [{ key: '1', status: 'loaded' }])).statusCode).toBe(403)
    expect((await staffGet('ann', `/api/v1/staff/jobs/${randomUUID()}/loadout`)).statusCode).toBe(404)
    expect(
      decide(
        actors.ann,
        'job.record_loadout',
        { projectId: p.projectId, assignments: [] },
        { now: new Date(), online: true },
      ).effect,
    ).toBe('deny')
  })

  it('[HH-PKT-05] a worker confirms what is loaded; only listed items, each once; confirmed loaded is ready', async () => {
    const dw = pkgOf(await loadout('ann', jobId), 'DW-01')
    const keys = items(dw).map((i) => i.key)
    expect((await check('ann', jobId, dw.workPackageId, [{ key: '999', status: 'loaded' }])).statusCode).toBe(400)
    expect(
      (
        await check('ann', jobId, dw.workPackageId, [
          { key: '1', status: 'loaded' },
          { key: '1', status: 'missing' },
        ])
      ).statusCode,
    ).toBe(400)
    expect((await check('ann', jobId, randomUUID(), [{ key: '1', status: 'loaded' }])).statusCode).toBe(400)
    const res = await check(
      'ann',
      jobId,
      dw.workPackageId,
      keys.map((k) => ({ key: k, status: 'loaded' })),
    )
    expect(res.statusCode, res.body).toBe(201)
    expect(res.json()).toMatchObject({ recorded: keys.length, blocksRaised: [], blocksOpen: [], readiness: 'ready' })
    const after = pkgOf(await loadout('ann', jobId), 'DW-01')
    expect(after.readiness.state).toBe('ready')
    expect(items(after).every((i) => i.current?.status === 'loaded')).toBe(true)
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select(['action', 'summary'])
      .where('action', '=', 'loadout.check')
      .where('target_id', '=', dw.workPackageId)
      .where('result', '=', 'succeeded')
      .executeTakeFirstOrThrow()
    expect(audit.summary).toMatchObject({ jobId, loaded: keys.length, missing: 0, blocksRaised: 0, readiness: 'ready' })
  })
})

describe('critical shortages block the task, never quietly (TSK-0071, HH-PKT-06, HH-WORK-02, T45)', () => {
  let p: Project
  let jobId: string
  let cl: Pkg
  let dw: Pkg
  let holdId: string
  const NOTE = 'Synthetic: the box in the van is empty'
  beforeAll(async () => {
    p = await project()
    jobId = await approve(p)
    await bookedVisit(p, day(4), 'ann')
    const v = await loadout('ann', jobId)
    cl = pkgOf(v, 'CL-01')
    dw = pkgOf(v, 'DW-01')
    const loaded = await check(
      'ann',
      jobId,
      dw.workPackageId,
      items(dw).map((i) => ({ key: i.key, status: 'loaded' })),
    )
    expect(loaded.statusCode, loaded.body).toBe(201)
  })

  it('[HH-PKT-06][T45][HH-WORK-01] a missing critical PPE item raises a task block on that work package only', async () => {
    const before = (await staffGet('ann', `/api/v1/staff/jobs/${jobId}/packet`)).json<{ packet: { version: number } }>()
    const res = await check('ann', jobId, cl.workPackageId, [{ key: PPE.key, status: 'missing', note: NOTE }])
    expect(res.statusCode, res.body).toBe(201)
    const body = res.json<{ blocksRaised: string[]; readiness: string; packetVersion: number }>()
    expect(body.blocksRaised).toHaveLength(1)
    expect(body.readiness).toBe('blocked')
    holdId = body.blocksRaised[0] as string
    const hold = await t.db.selectFrom('work.holds').selectAll().where('id', '=', holdId).executeTakeFirstOrThrow()
    expect(hold).toMatchObject({
      kind: 'task_block',
      scope_type: 'work_package',
      scope_id: cl.workPackageId,
      project_id: p.projectId,
      request_id: null,
      category: 'critical_resource',
      source: 'loadout',
      source_ref: `item:${PPE.key}`,
      state: 'open',
      raised_by: ids.ann,
      note: `${PPE.name}: ${NOTE}`,
    })
    // The statement names the block it raised: written together, in one transaction.
    const stated = await t.db
      .selectFrom('work.loadout_checks')
      .selectAll()
      .where('work_package_id', '=', cl.workPackageId)
      .where('item_key', '=', PPE.key)
      .execute()
    expect(stated).toHaveLength(1)
    expect(stated[0]).toMatchObject({ status: 'missing', hold_id: holdId, note: NOTE, recorded_by: ids.ann })
    // Reporting it again keeps the one block.
    const again = await check('ann', jobId, cl.workPackageId, [{ key: PPE.key, status: 'damaged' }])
    expect(again.json()).toMatchObject({ blocksRaised: [], blocksOpen: [holdId] })

    const v = await loadout('ann', jobId)
    expect(pkgOf(v, 'CL-01').readiness).toMatchObject({ state: 'blocked', blocks: [holdId] })
    expect(pkgOf(v, 'CL-01').blocks[0]).toMatchObject({
      holdId,
      itemKey: PPE.key,
      itemName: PPE.name,
      state: 'open',
      owner: { role: 'owner', action: 'provide_item_or_approve_substitute' },
      actions: { startReview: false, resolve: false, cancel: false },
    })
    // The other work package is unaffected.
    expect(pkgOf(v, 'DW-01').readiness).toMatchObject({ state: 'ready', blocks: [] })
    // Start Work is blocked for that work package only (the database's own backstop, migration 0063).
    expect(await tryStart(cl.workPackageId)).toMatch(/cannot start while a task block is open/)
    expect(await tryStart(dw.workPackageId)).toBe('started')
    // A visit confirmation is never blocked by a task block (HH-SCH-06, migration 0057).
    expect(
      (await sql<{ n: number }>`SELECT work.confirmation_blocking_holds(${p.projectId}::uuid) AS n`.execute(t.db))
        .rows[0]?.n,
    ).toBe(0)
    // The packet has a new, critical version naming the block.
    const packet = (await staffGet('ann', `/api/v1/staff/jobs/${jobId}/packet`)).json<{
      packet: { version: number; critical: boolean }
      holds: { kind: string; category: string; state: string }[]
    }>()
    expect(packet.packet.version).toBeGreaterThan(before.packet.version)
    expect(packet.holds).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'task_block', category: 'critical_resource' })]),
    )
    const versions = await t.db
      .selectFrom('work.job_packets')
      .select(['version', 'critical', 'changes'])
      .where('job_id', '=', jobId)
      .orderBy('version', 'desc')
      .execute()
    const raisedIn = versions.find((x) =>
      (x.changes as { code: string; ref: string | null }[]).some(
        (c) => c.code === 'hold_added' && c.ref === 'critical_resource',
      ),
    )
    expect(raisedIn?.critical).toBe(true)
    // The block's owner sees it in the action queue; Office and workers do not.
    const queue = (await staffGet('owner', '/api/v1/staff/queue')).json<{
      items: { type: string; reason: string; action: string; link: string }[]
    }>()
    expect(queue.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'loadout_shortage',
          reason: 'critical_shortage',
          action: 'review_shortage',
          link: `/loadouts/${jobId}`,
        }),
      ]),
    )
    const office = (await staffGet('office', '/api/v1/staff/queue')).json<{ items: { type: string }[] }>()
    expect(office.items.map((i) => i.type)).not.toContain('loadout_shortage')
    // The audit records counts, never the note.
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select('summary')
      .where('action', '=', 'loadout.check')
      .where('target_id', '=', cl.workPackageId)
      .execute()
    expect(JSON.stringify(audit)).not.toContain('Synthetic: the box')
  })

  it('[HH-WORK-02][T45][RULE-SAFETY-GATES] no checkbox, later statement, override or generic hold route clears it', async () => {
    // A worker's later "loaded" is recorded but releases nothing.
    const loaded = await check('ann', jobId, cl.workPackageId, [{ key: PPE.key, status: 'loaded' }])
    expect(loaded.json()).toMatchObject({ blocksOpen: [holdId], readiness: 'blocked' })
    await check('ann', jobId, cl.workPackageId, [{ key: PPE.key, status: 'missing' }])
    // The generic hold routes handle intake review holds only: a task block is not theirs to move.
    for (const action of ['start-review', 'resolve', 'cancel'])
      expect(
        (
          await staffWrite(
            'owner',
            'POST',
            `/api/v1/staff/holds/${holdId}/actions/${action}`,
            action === 'resolve'
              ? { resolutionNote: 'Synthetic', reviewer: 'Synthetic' }
              : action === 'cancel'
                ? { reason: 'Synthetic' }
                : {},
            1,
          )
        ).statusCode,
      ).toBe(404)
    // No override exists for any role.
    for (const who of ['owner', 'office'] as const)
      for (const action of ['work.override_gate', 'hold.override_critical'] as const)
        expect(decide(actors[who], action, { projectId: p.projectId }, { now: new Date(), online: true }).effect).toBe(
          'deny',
        )
    // A worker cannot act on the block; Office starts the review (PROPOSED cell) but cannot resolve it.
    expect((await block('ann', holdId, 'start-review', {}, 1)).statusCode).toBe(403)
    expect((await block('office', holdId, 'start-review', {}, 9)).statusCode).toBe(409)
    const started = await block('office', holdId, 'start-review', {}, 1)
    expect(started.statusCode, started.body).toBe(200)
    expect(
      (await block('office', holdId, 'resolve', { resolution: 'item_provided', resolutionNote: 'x', reviewer: 'x' }, 2))
        .statusCode,
    ).toBe(403)
    // The latest statement is "missing": the item is not provided.
    const notProvided = await block(
      'owner',
      holdId,
      'resolve',
      { resolution: 'item_provided', resolutionNote: 'Synthetic: brought a box', reviewer: 'Synthetic Owner' },
      2,
    )
    expect(notProvided.statusCode).toBe(409)
    expect(notProvided.json<{ error: { fieldErrors: { code: string }[] } }>().error.fieldErrors[0]?.code).toBe(
      'ITEM_NOT_CONFIRMED_LOADED',
    )
    // A substitute that affects the customer is a change order: NOT CONFIGURED until change orders exist.
    const customer = await block(
      'owner',
      holdId,
      'resolve',
      {
        resolution: 'substitute_approved',
        resolutionNote: 'Synthetic: other gloves',
        reviewer: 'Synthetic Owner',
        substitute: 'Synthetic gloves of another kind',
        impacts: ['specification'],
        customerAffected: true,
      },
      2,
    )
    expect(customer.statusCode).toBe(409)
    expect(
      customer.json<{ error: { fieldErrors: { code: string }[] } }>().error.fieldErrors.map((f) => f.code),
    ).toEqual(['CHANGE_ORDER_REQUIRED'])
    // Never "equivalent" without naming it.
    const unnamed = await block(
      'owner',
      holdId,
      'resolve',
      { resolution: 'substitute_approved', resolutionNote: 'Synthetic', reviewer: 'Synthetic Owner' },
      2,
    )
    expect(unnamed.json<{ error: { fieldErrors: { code: string }[] } }>().error.fieldErrors.map((f) => f.code)).toEqual(
      ['SUBSTITUTE_REQUIRED', 'IMPACTS_REQUIRED'],
    )
    expect(await tryStart(cl.workPackageId)).toMatch(/cannot start while a task block is open/)
    // Database: the statements are append-only and a block is never deleted.
    await expect(
      sql`UPDATE work.loadout_checks SET status = 'loaded' WHERE work_package_id = ${cl.workPackageId}`.execute(t.db),
    ).rejects.toThrow()
    await expect(sql`DELETE FROM work.holds WHERE id = ${holdId}`.execute(t.db)).rejects.toThrow()
  })

  it('[HH-PKT-06][HH-WORK-02] the Owner resolves it once the item is stated loaded; Start Work is no longer blocked by it', async () => {
    const loaded = await check('ann', jobId, cl.workPackageId, [{ key: PPE.key, status: 'loaded' }])
    expect(loaded.statusCode).toBe(201)
    const res = await block(
      'owner',
      holdId,
      'resolve',
      { resolution: 'item_provided', resolutionNote: 'Synthetic: a new box was loaded', reviewer: 'Synthetic Owner' },
      2,
    )
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json()).toMatchObject({ holdId, state: 'resolved', version: 3, jobId })
    const v = pkgOf(await loadout('ann', jobId), 'CL-01')
    expect(v.blocks[0]).toMatchObject({ state: 'resolved' })
    expect(v.readiness.state).toBe('not_confirmed')
    expect(await tryStart(cl.workPackageId)).toBe('started')
    const item = await t.db
      .selectFrom('ops.queue_items')
      .select(['resolution'])
      .where('type', '=', 'loadout_shortage')
      .where('subject_id', '=', jobId)
      .executeTakeFirstOrThrow()
    expect(item.resolution).toBe('blocks_cleared')
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select(['action', 'summary'])
      .where('target_id', '=', holdId)
      .where('result', '=', 'succeeded')
      .orderBy('seq')
      .execute()
    expect(audit.map((a) => a.action)).toEqual(['loadout.block_start_review', 'loadout.block_resolve'])
    expect(JSON.stringify(audit)).not.toContain('a new box')
  })

  it('[HH-PKT-06] a substitute is named with what it affects, never marked equivalent silently; an error is cancelled', async () => {
    const [second, third] = items(cl).filter((i) => i.key !== PPE.key)
    if (!second || !third) throw new Error('CL-01 lists more items')
    const raised = await check('ann', jobId, cl.workPackageId, [
      { key: second.key, status: 'damaged' },
      { key: third.key, status: 'missing' },
    ])
    const [subBlock, errBlock] = raised.json<{ blocksRaised: string[] }>().blocksRaised
    if (!subBlock || !errBlock) throw new Error('two blocks')
    expect((await block('owner', subBlock, 'start-review', {}, 1)).statusCode).toBe(200)
    const sub = await block(
      'owner',
      subBlock,
      'resolve',
      {
        resolution: 'substitute_approved',
        resolutionNote: 'Synthetic: approved for this visit',
        reviewer: 'Synthetic Owner',
        substitute: 'Synthetic substitute item',
        impacts: ['appearance', 'specification'],
        customerAffected: false,
      },
      2,
    )
    expect(sub.statusCode, sub.body).toBe(200)
    const row = await t.db
      .selectFrom('work.loadout_checks')
      .selectAll()
      .where('hold_id', '=', subBlock)
      .where('status', '=', 'substitute_approved')
      .executeTakeFirstOrThrow()
    expect(row).toMatchObject({
      substitute: 'Synthetic substitute item',
      impacts: ['appearance', 'specification'],
      recorded_by: ids.owner,
      item_key: second.key,
    })
    // Cancelling as entered in error needs the reason; the item still needs a "loaded" statement.
    expect((await block('owner', errBlock, 'cancel', { reason: ' ' }, 1)).statusCode).toBe(400)
    expect(
      (await block('owner', errBlock, 'cancel', { reason: 'Synthetic: it was in the other bag' }, 1)).statusCode,
    ).toBe(200)
    const v = pkgOf(await loadout('ann', jobId), 'CL-01')
    expect(items(v).find((i) => i.key === second.key)?.current).toMatchObject({
      status: 'substitute_approved',
      substitute: 'Synthetic substitute item',
    })
    expect(items(v).find((i) => i.key === third.key)?.current?.status).toBe('missing')
    expect(v.readiness.state).toBe('not_confirmed')
    expect(v.readiness.unconfirmed).toContain(third.key)
    expect(v.readiness.unconfirmed).not.toContain(second.key)
    expect(v.blocks.map((b) => b.state)).toEqual(['resolved', 'resolved', 'canceled_as_error'])
    // Every remaining required item loaded: the package is ready.
    const rest = items(v)
      .filter((i) => v.readiness.unconfirmed.includes(i.key))
      .map((i) => ({ key: i.key, status: 'loaded' }))
    expect((await check('ann', jobId, cl.workPackageId, rest)).json()).toMatchObject({ readiness: 'ready' })
  })
})
