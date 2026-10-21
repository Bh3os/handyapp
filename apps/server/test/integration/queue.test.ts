// The staff action queue against PostgreSQL 16 (TSK-0041; HH-OPS-01, HH-OPS-02, HH-STAFF-06, T26, T68,
// RULE-SERVER-AUTHZ). Staff, requests and items are synthetic (RULE-SYNTHETIC-DATA).
import { loadServiceSeed, syncServices, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { PRIVACY_NOTICE } from '@handyhub/domain/legal'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import {
  newRequestQueueAutomation,
  openQueueItem,
  resolveQueueItem,
  type OpenQueueItemInput,
} from '../../src/modules/queue/index.js'
import { createAutomationRegistry } from '../../src/platform/automation.js'
import { createWorker } from '../../src/platform/jobs.js'
import { testConfig } from '../fixtures/env.js'

const pw = (n: number) => ['synthetic', 'queue', 'passphrase', 'number', String(n)].join(' ')
const PEOPLE = ['owner', 'office', 'office2', 'estimator', 'estimator2', 'worker'] as const
type Person = (typeof PEOPLE)[number]
const roleOf = (p: Person) => p.replace(/2$/, '') as 'owner' | 'office' | 'estimator' | 'worker'

let t: TestDatabase
let app: FastifyInstance
const ids = {} as Record<Person, string>
const cookies = {} as Record<Person, string>

type Item = {
  id: string
  type: string
  band: string
  reference: string | null
  status: string | null
  assignee: { id: string; name: string | null } | null
  reason: string
  masked: boolean
  action: string
  link: string
  dueAt: string | null
  clock: string | null
}
type ListBody = {
  items: Item[]
  nextCursor: string | null
  sections: string[]
  types: string[]
  refreshSeconds: number
}

beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
  app = await buildApp({ config: testConfig({ TRUST_PROXY_HOPS: '1' }), api: { db: t.db } })
  const hash = await hashPassword(pw(1))
  await withTx(t.db, async (tx) => {
    for (const p of PEOPLE) {
      const user = await createStaffUser(tx, {
        email: `${p}-queue@example.test`,
        displayName: `Synthetic ${p}`,
        locale: 'en',
        role: roleOf(p),
        issuedBy: 'test',
      })
      await setPasswordHash(tx, user.id, hash)
      ids[p] = user.id
    }
  })
  for (const p of PEOPLE) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/staff/auth/sign-in',
      payload: { email: `${p}-queue@example.test`, password: pw(1) },
    })
    expect(res.statusCode).toBe(200)
    cookies[p] = String(res.headers['set-cookie']).split(';')[0] as string
  }
})
afterAll(async () => {
  await app?.close()
  await t?.drop()
})

const get = (who: Person, url: string) => app.inject({ method: 'GET', url, headers: { cookie: cookies[who] } })
async function list(who: Person, query = '', section: 'queue' | 'owner-decisions' = 'queue'): Promise<ListBody> {
  const res = await get(who, `/api/v1/staff/${section === 'queue' ? 'queue' : 'queue/owner-decisions'}${query}`)
  expect(res.statusCode).toBe(200)
  return res.json<ListBody>()
}
const open = (input: OpenQueueItemInput) => withTx(t.db, (tx) => openQueueItem(tx, input))
const minutes = (n: number) => new Date(Date.now() + n * 60_000)
let seq = 0
/** A synthetic subject id that sorts nowhere in particular. */
const subject = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`

describe('who sees the queue (TSK-0041, HH-STAFF-06, HH-OPS-01, T26)', () => {
  let ownerOnly: string
  beforeAll(async () => {
    ownerOnly = (await open({ type: 'deposit_waiver', subjectId: subject(), reason: 'deposit_waiver_requested' })).id
    await open({ type: 'incident_notification', subjectId: subject(), reason: 'injury_reported' })
    await open({ type: 'case_open', subjectId: subject(), reason: 'case_opened', assignedStaffId: null })
  })

  it('[HH-STAFF-06][HH-OPS-01][T26] a worker never sees the queue, Owner Decisions or a request record', async () => {
    for (const url of ['/api/v1/staff/queue', '/api/v1/staff/queue/owner-decisions'])
      expect((await get('worker', url)).statusCode).toBe(403)
    // An unknown record answers NOT_FOUND to everyone; an existing one is refused to the worker (below).
    expect((await get('worker', `/api/v1/staff/requests/${subject()}/summary`)).statusCode).toBe(404)
  })

  it('[HH-OPS-01][T26] office never sees Owner Decisions items, in either list', async () => {
    const office = await list('office')
    expect(office.sections).toEqual(['queue'])
    // TSK-0044 added duplicate suggestions (customer.view_duplicates) to the queue.
    expect(office.types).toEqual([
      'new_request',
      'safety_hold',
      'visit_change_request',
      'delivery_failed',
      'case_open',
      'candidate_match',
      // TSK-0049: the private Needs Linking list (message.view_unmatched) and customer replies.
      'inbox_needs_linking',
      'customer_replied',
    ])
    expect(office.items.map((i) => i.type)).not.toContain('deposit_waiver')
    expect(office.items.map((i) => i.id)).not.toContain(ownerOnly)
    expect((await get('office', '/api/v1/staff/queue/owner-decisions')).statusCode).toBe(403)
    // A type filter naming an owner-only type returns nothing, not the owner's rows.
    expect((await list('office', '?type=deposit_waiver')).items).toEqual([])
  })

  it('[HH-STAFF-06][HH-OPS-01] the Owner has the queue and Owner Decisions, each with its own types', async () => {
    const queue = await list('owner')
    expect(queue.sections).toEqual(['queue', 'owner_decisions'])
    expect(queue.items.map((i) => i.type)).not.toContain('deposit_waiver')
    const decisions = await list('owner', '', 'owner-decisions')
    expect(decisions.types).toEqual([
      'deposit_waiver',
      'start_work_exception',
      'refund_request',
      'cancellation_outcome',
      'deletion_request',
      'invoice_overdue_decision',
      'cancellation_review',
      'incident_notification',
    ])
    expect(decisions.items.map((i) => [i.type, i.reason, i.action])).toEqual(
      expect.arrayContaining([
        ['deposit_waiver', 'deposit_waiver_requested', 'decide'],
        ['incident_notification', 'injury_reported', 'decide'],
      ]),
    )
    expect(decisions.refreshSeconds).toBe(30)
  })

  it('[HH-OPS-01][T26] an estimator sees requests and safety holds, but no cases and no Owner Decisions', async () => {
    const est = await list('estimator')
    expect(est.sections).toEqual(['queue'])
    // TSK-0044: duplicate suggestions, by the Estimator's PROPOSED customer.view_duplicates cell.
    // TSK-0049: customer replies on own threads; never the private Needs Linking list.
    expect(est.types).toEqual(['new_request', 'safety_hold', 'delivery_failed', 'candidate_match', 'customer_replied'])
    expect(est.items.map((i) => i.type)).not.toContain('case_open')
    expect((await get('estimator', '/api/v1/staff/queue/owner-decisions')).statusCode).toBe(403)
  })
})

describe('urgency order (TSK-0041, HH-OPS-01, OWN-DEC-115)', () => {
  it('[HH-OPS-01] safety, then today’s appointment changes, then overdue and time-sensitive by due time, then the rest', async () => {
    const who = { assignedStaffId: ids.office2 }
    const opened = minutes(-600)
    const made: Record<string, string> = {}
    const add = async (name: string, input: Omit<OpenQueueItemInput, 'subjectId'>) =>
      (made[name] = (await open({ ...who, ...input, subjectId: subject() })).id)
    await add('other', { type: 'case_open', reason: 'case_opened', openedAt: minutes(-900) })
    await add('dueLater', { type: 'delivery_failed', reason: 'delivery_failed', dueAt: minutes(30), openedAt: opened })
    await add('overdueOther', { type: 'case_open', reason: 'case_opened', dueAt: minutes(-5), openedAt: minutes(-60) })
    await add('noDue', { type: 'delivery_failed', reason: 'delivery_failed', openedAt: minutes(-1000) })
    await add('today', {
      type: 'visit_change_request',
      reason: 'reschedule_requested',
      band: 'today_change',
      openedAt: minutes(-1),
    })
    await add('dueSoon', { type: 'delivery_failed', reason: 'delivery_failed', dueAt: minutes(10), openedAt: opened })
    await add('safety', { type: 'safety_hold', reason: 'safety_hold', openedAt: minutes(-2) })
    await add('otherNewer', { type: 'case_open', reason: 'case_opened', openedAt: minutes(-100) })

    const body = await list('office', `?assignee=${ids.office2}`)
    expect(body.items.map((i) => Object.entries(made).find(([, id]) => id === i.id)?.[0])).toEqual([
      'safety',
      'today',
      'overdueOther',
      'dueSoon',
      'dueLater',
      'noDue',
      'other',
      'otherNewer',
    ])
    // The overdue item is read as time-sensitive whatever band it was opened in.
    expect(body.items.find((i) => i.id === made['overdueOther'])?.band).toBe('time_sensitive')

    // Paging two at a time gives the same order, each item exactly once (HH-API-05).
    const paged: string[] = []
    let cursor: string | null = null
    do {
      const q = `?assignee=${ids.office2}&limit=2${cursor ? `&cursor=${cursor}` : ''}`
      const page: ListBody = await list('office', q)
      expect(page.items.length).toBeLessThanOrEqual(2)
      paged.push(...page.items.map((i) => i.id))
      cursor = page.nextCursor
    } while (cursor)
    expect(paged).toEqual(body.items.map((i) => i.id))
  })
})

describe('item fields, masking and scope (TSK-0041, HH-OPS-02, T26, T68)', () => {
  it('[HH-OPS-02][T26] a case shows office only that it exists; the Owner sees its reason; the estimator nothing', async () => {
    const { id } = await open({ type: 'case_open', subjectId: subject(), reason: 'injury_reported' })
    const office = (await list('office', '?type=case_open')).items.find((i) => i.id === id)
    expect(office).toMatchObject({ reason: 'case_opened', masked: true, action: 'open_case' })
    expect(JSON.stringify(office)).not.toContain('injury')
    const owner = (await list('owner', '?type=case_open')).items.find((i) => i.id === id)
    expect(owner).toMatchObject({ reason: 'injury_reported', masked: false })
    expect((await list('estimator', '?type=case_open')).items).toEqual([])
  })

  it('[HH-OPS-02][T68] own-record grants list only the caller’s own items, before paging', async () => {
    const mine = (
      await open({
        type: 'delivery_failed',
        subjectId: subject(),
        reason: 'delivery_failed',
        assignedStaffId: ids.estimator,
      })
    ).id
    const theirs = (
      await open({
        type: 'delivery_failed',
        subjectId: subject(),
        reason: 'delivery_failed',
        assignedStaffId: ids.estimator2,
      })
    ).id
    const unassigned = (await open({ type: 'delivery_failed', subjectId: subject(), reason: 'delivery_failed' })).id
    const est = await list('estimator', '?type=delivery_failed&limit=100')
    expect(est.items.map((i) => i.id)).toEqual([mine])
    expect((await list('estimator2', '?type=delivery_failed')).items.map((i) => i.id)).toEqual([theirs])
    // Asking for another person's items or unassigned ones does not widen the scope.
    expect((await list('estimator', `?type=delivery_failed&assignee=${ids.estimator2}`)).items).toEqual([])
    expect((await list('estimator', '?type=delivery_failed&assignee=unassigned')).items).toEqual([])
    const office = (await list('office', '?type=delivery_failed&limit=100')).items.map((i) => i.id)
    expect(office).toEqual(expect.arrayContaining([mine, theirs, unassigned]))
  })

  it('[HH-OPS-02] each item carries reference, status, assignee, reason, one action and the deep link', async () => {
    const s = subject()
    await open({
      type: 'visit_change_request',
      subjectId: s,
      reason: 'cancellation_requested',
      reference: 'HH-AB12CD34',
      status: 'confirmed',
      assignedStaffId: ids.office,
      dueAt: minutes(45),
    })
    const [item] = (await list('office', '?reference=hh-ab12')).items
    expect(item).toMatchObject({
      type: 'visit_change_request',
      reference: 'HH-AB12CD34',
      status: 'confirmed',
      assignee: { id: ids.office, name: 'Synthetic office' },
      reason: 'cancellation_requested',
      action: 'review_change',
      link: `/schedule/${s}`,
      masked: false,
      clock: null,
    })
    const me = await list('office', '?assignee=me&type=visit_change_request')
    expect(me.items.map((i) => i.reference)).toContain('HH-AB12CD34')
    expect((await list('office', '?assignee=unassigned&type=visit_change_request')).items).toEqual([])
  })

  it('[T68] a tampered cursor or filter is refused, and lists are never cached', async () => {
    const forged = Buffer.from(JSON.stringify([0, 'x', 'y', 'z'])).toString('base64url')
    expect((await get('office', `/api/v1/staff/queue?cursor=${forged}`)).statusCode).toBe(400)
    expect((await get('office', '/api/v1/staff/queue?assignee=everyone')).statusCode).toBe(400)
    expect((await get('office', '/api/v1/staff/queue?type=export_all')).statusCode).toBe(400)
    const res = await get('office', '/api/v1/staff/queue')
    expect(res.headers['cache-control']).toBe('private, no-store')
    expect((await app.inject({ method: 'GET', url: '/api/v1/staff/queue' })).statusCode).toBe(401)
  })
})

describe('one item per subject; resolved items disappear (TSK-0041, HH-OPS-01, ENT-QueueItem)', () => {
  it('[HH-OPS-01] opening twice updates the one open item; resolving removes it; a new need opens a new item', async () => {
    const s = subject()
    const first = await open({ type: 'safety_hold', subjectId: s, reason: 'safety_hold' })
    const again = await open({ type: 'safety_hold', subjectId: s, reason: 'safety_hold' })
    expect(again).toEqual({ id: first.id, created: false })
    const moved = await open({ type: 'safety_hold', subjectId: s, reason: 'safety_hold', assignedStaffId: ids.office })
    expect(moved.id).toBe(first.id)
    const rows = await t.db
      .selectFrom('ops.queue_items')
      .select(['id', 'version'])
      .where('subject_id', '=', s)
      .execute()
    expect(rows).toEqual([{ id: first.id, version: 2 }])

    expect(
      await withTx(t.db, (tx) => resolveQueueItem(tx, { type: 'safety_hold', subjectId: s, resolution: 'released' })),
    ).toBe(true)
    expect((await list('office', '?type=safety_hold&limit=100')).items.map((i) => i.id)).not.toContain(first.id)
    const reopened = await open({ type: 'safety_hold', subjectId: s, reason: 'safety_hold' })
    expect(reopened.created).toBe(true)
    expect(reopened.id).not.toBe(first.id)

    // A resolved item is history: never edited, and no item is ever deleted.
    await expect(
      sql`UPDATE ops.queue_items SET reason = 'safety_hold', band = 'other' WHERE id = ${first.id}`.execute(t.db),
    ).rejects.toThrow(/history/)
    await expect(sql`DELETE FROM ops.queue_items WHERE id = ${reopened.id}`.execute(t.db)).rejects.toThrow(
      /never deleted/,
    )
  })

  it('[HH-OPS-01] a provider cannot open an undeclared type or reason', async () => {
    await expect(open({ type: 'export_all', subjectId: subject(), reason: 'x' })).rejects.toThrow(
      /Unknown queue item type/,
    )
    await expect(open({ type: 'safety_hold', subjectId: subject(), reason: 'injury_reported' })).rejects.toThrow(
      /not declared/,
    )
  })
})

describe('new requests feed the queue from the outbox (TSK-0041, HH-OPS-01, TSK-0012)', () => {
  const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
  const body = (spam = false) => ({
    formVersion: 'test-1',
    privacyNoticeVersion: PRIVACY_NOTICE.documentId,
    services: [{ serviceId: 'SVC-DW-01' }],
    notSure: false,
    description: 'Synthetic queue description.',
    property: { street: '200 Synthetic Way', city: 'Testville', state: 'ky', zip: '40000', propertyType: 'house' },
    timing: { preferredDate: future, flexible: false, needHelpToday: false, windows: ['mornings'] },
    estimatePreference: 'online',
    contact: {
      fullName: 'Queue Customer',
      email: 'queue-1@example.test',
      phone: '(502) 555-0199',
      preferredChannel: 'email',
    },
    smsOptIn: false,
    marketingOptIn: false,
    ...(spam ? { website: 'filled by a bot' } : {}),
  })
  const submit = (key: string, spam = false, ip = '198.51.100.7') =>
    app.inject({
      method: 'POST',
      url: '/api/v1/public/requests',
      headers: { 'idempotency-key': key, 'x-forwarded-for': ip },
      payload: body(spam),
    })
  const worker = () => createWorker({ db: t.db, registry: createAutomationRegistry([newRequestQueueAutomation()]) })

  it('[HH-OPS-01][HH-OPS-02] a submitted request opens one new-request item that deep-links its record', async () => {
    const res = await submit('synthetic-queue-key-0001')
    expect(res.statusCode).toBe(201)
    const { reference } = res.json<{ reference: string }>()
    const request = await t.db
      .selectFrom('intake.requests')
      .select(['id', 'project_id'])
      .where('reference', '=', reference)
      .executeTakeFirstOrThrow()
    await worker().runOnce()

    const [item] = (await list('office', `?reference=${reference}`)).items
    expect(item).toMatchObject({
      type: 'new_request',
      band: 'time_sensitive',
      reference,
      status: 'received',
      assignee: null,
      reason: 'new_request',
      action: 'review_request',
      link: `/requests/${request.id}`,
      clock: 'response_target',
      dueAt: null,
    })
    // The estimator (request.view, PROPOSED) sees it too; the deep link opens the record header.
    expect((await list('estimator', `?reference=${reference}`)).items).toHaveLength(1)
    const record = await get('office', `/api/v1/staff/requests/${request.id}/summary`)
    expect(record.statusCode).toBe(200)
    expect(record.json()).toMatchObject({
      id: request.id,
      reference,
      state: 'received',
      services: ['DW-01'],
      responsibleStaff: null,
    })
    expect(JSON.stringify(record.json())).not.toMatch(/Synthetic Way|queue-1@example|555-0199/)
    expect((await get('office', `/api/v1/staff/requests/${subject()}/summary`)).statusCode).toBe(404)
    expect((await get('worker', `/api/v1/staff/requests/${request.id}/summary`)).statusCode).toBe(403)

    // A replayed event leaves the one item as it was.
    await withTx(t.db, (tx) =>
      newRequestQueueAutomation().handle({
        tx,
        job: {
          id: 'replay',
          key: 'replay',
          automation: 'queue.new_request',
          attempt: 2,
          payload: {},
          eventId: null,
          eventType: 'request.submitted',
          target: { type: 'request', id: request.id },
          requestId: 'test-replay',
        },
        idempotencyKey: 'replay',
        log: app.log as never,
        signal: new AbortController().signal,
      }),
    )
    const rows = await t.db
      .selectFrom('ops.queue_items')
      .select(['version'])
      .where('subject_id', '=', request.id)
      .execute()
    expect(rows).toEqual([{ version: 1 }])
    const audits = await t.db
      .selectFrom('platform.audit_events')
      .select('action')
      .where('action', '=', 'queue.item_opened')
      .execute()
    expect(audits.length).toBeGreaterThanOrEqual(1)
  })

  it('[HH-OPS-01] a request the spam controls flagged is opened as flagged for review, never dropped', async () => {
    const res = await submit('synthetic-queue-key-0002', true, '198.51.100.8')
    const { reference } = res.json<{ reference: string }>()
    await worker().runOnce()
    const [item] = (await list('owner', `?reference=${reference}`)).items
    expect(item?.reason).toBe('new_request_flagged')
  })
})
