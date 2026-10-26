// The audit-retention workflow against PostgreSQL 16 (TSK-0135; HH-SEC-08, HH-SEC-06, HH-STAFF-08, T26, T74,
// ENT-AuditEvent, ENT-RetentionReview, OWN-DEC-164, OWN-DEC-142, RULE-SERVER-AUTHZ, RULE-HUMAN-REVIEW). Staff, requests
// and audit entries are synthetic (RULE-SYNTHETIC-DATA). The old entries are written at fixed instants years in the
// past (an INSERT, which the append-only log accepts); the period checks with a chosen clock use fixed instants too.
// The tamper checks at the end change the log the way only a database superuser could (triggers off), and restore it.
import { randomUUID } from 'node:crypto'
import { loadServiceSeed, syncServices, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { decide, type Actor } from '@handyhub/policy'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import {
  AUDIT_CONFIRM_CHECKS,
  previewRange,
  retentionReviewAutomation,
  runRetentionScan,
  scanNow,
} from '../../src/modules/retention/index.js'
import { recordPolicyVersion } from '../../src/platform/config/index.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { testConfig } from '../fixtures/env.js'
import { signInWithMfa } from '../fixtures/staff-mfa.js'

const pw = (n: number) => ['synthetic', 'audit', 'retention', 'passphrase', String(n)].join(' ')
const PEOPLE = ['owner', 'office', 'estimator', 'worker'] as const
type Person = (typeof PEOPLE)[number]
const email = (p: Person) => `${p}-audit-retention@example.test`
/** A marker in the synthetic entries' summaries: it must never reach the trail or the audit of a deletion. */
const MARKER = `synthetic-content-${randomUUID().slice(0, 8)}`

let t: TestDatabase
let app: FastifyInstance
const ids = {} as Record<Person, string>
const cookies = {} as Record<Person, string>
const csrf = {} as Record<Person, string>

let n = 0
const key = () => `synthetic-audit-retention-${String(++n).padStart(6, '0')}-${randomUUID().slice(0, 8)}`
const get = (who: Person | null, url: string) =>
  app.inject({ method: 'GET', url: `/api/v1${url}`, headers: who ? { cookie: cookies[who] } : {} })
function post(who: Person, url: string, payload: unknown) {
  return app.inject({
    method: 'POST',
    url: `/api/v1${url}`,
    payload: payload as object,
    headers: {
      cookie: cookies[who],
      'x-csrf-token': csrf[who],
      'idempotency-key': key(),
      'x-forwarded-for': '198.51.100.135',
    },
  })
}
const codes = (res: { json: () => unknown }) =>
  (res.json() as { error: { fieldErrors?: { code: string }[] } }).error.fieldErrors?.map((f) => f.code) ?? []

/** The Owner's sign-in counts as fresh again (the route needs a password or factor within the last minutes). */
const fresh = () =>
  sql`UPDATE identity.staff_sessions SET authenticated_at = now()
       WHERE staff_user_id = ${ids.owner} AND revoked_at IS NULL`.execute(t.db)
const stale = () =>
  sql`UPDATE identity.staff_sessions SET authenticated_at = now() - interval '10 minutes'
       WHERE staff_user_id = ${ids.owner} AND revoked_at IS NULL`.execute(t.db)

/** Synthetic audit entries recorded one minute apart from a fixed instant, in one statement (consecutive seqs). */
async function oldEntries(count: number, at: string, target?: { type: string; id: string }): Promise<string[]> {
  const rows = await t.db
    .insertInto('platform.audit_events')
    .values(
      Array.from({ length: count }, (_, i) => ({
        occurred_at: new Date(Date.parse(at) + i * 60_000),
        actor_kind: 'system',
        actor_process: 'test:audit-retention',
        action: 'synthetic.probe',
        target_type: target?.type ?? 'synthetic_probe',
        target_id: target?.id ?? null,
        result: 'succeeded',
        summary: JSON.stringify({ note: MARKER, n: i }),
        request_id: 'synthetic-audit-retention',
      })),
    )
    .returning(sql<string>`seq::text`.as('seq'))
    .execute()
  return rows.map((r) => r.seq).sort((a, b) => Number(a) - Number(b))
}
const range = (seqs: readonly string[]) => ({ fromSeq: seqs[0] as string, toSeq: seqs[seqs.length - 1] as string })
const existing = async (seqs: readonly string[]) =>
  (
    await t.db
      .selectFrom('platform.audit_events')
      .select('seq')
      .where('seq', 'in', [...seqs])
      .execute()
  ).length
type Verification = { ok: boolean; mismatch: { at: string; seq: string } | null; deletions: number; archives: number }
const verify = async () => (await get('owner', '/staff/audit-retention/verification')).json<Verification>()

beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
  app = await buildApp({
    config: testConfig({ TRUST_PROXY_HOPS: '1' }),
    api: { db: t.db, storage: new FakeObjectStorage() },
  })
  const hash = await hashPassword(pw(1))
  await withTx(t.db, async (tx) => {
    for (const p of PEOPLE) {
      const user = await createStaffUser(tx, {
        email: email(p),
        displayName: `Synthetic audit retention ${p}`,
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
      headers: { 'x-forwarded-for': '198.51.100.135' },
      payload: { email: email(p), password: pw(1) },
    })
    expect(res.statusCode, res.body).toBe(200)
    cookies[p] = String(res.headers['set-cookie']).split(';')[0] as string
    csrf[p] = res.json().csrfToken as string
  }
})
afterAll(async () => {
  await app?.close()
  await t?.drop()
})

const REASON = 'Synthetic: past its period, no longer retention obligation.'

describe('who may archive or delete audit records (TSK-0135, HH-SEC-08, T26)', () => {
  it('[HH-SEC-08][T26][RULE-SERVER-AUTHZ] only the Owner, with a fresh sign-in and a reason; editing stays refused for every role', async () => {
    const seqs = await oldEntries(2, '2016-02-10T15:00:00Z')
    const body = { ...range(seqs), reason: REASON, confirmedChecks: [...AUDIT_CONFIRM_CHECKS] }
    for (const who of ['office', 'estimator', 'worker'] as const) {
      for (const url of [
        '/staff/audit-retention',
        `/staff/audit-retention/range?fromSeq=${body.fromSeq}&toSeq=${body.toSeq}`,
        '/staff/audit-retention/operations',
        '/staff/audit-retention/verification',
      ])
        expect((await get(who, url)).statusCode, `${who} ${url}`).toBe(403)
      expect((await post(who, '/staff/audit-retention/delete', body)).statusCode, `${who} delete`).toBe(403)
      const archive = { ...range(seqs), reason: REASON }
      expect((await post(who, '/staff/audit-retention/archive', archive)).statusCode, `${who} archive`).toBe(403)
    }
    expect((await get(null, '/staff/audit-retention')).statusCode).toBe(401)
    // The Owner without a fresh sign-in, then without a reason.
    await stale()
    try {
      const res = await post('owner', '/staff/audit-retention/delete', body)
      expect(res.statusCode).toBe(403)
      expect(res.json()).toMatchObject({ error: { code: 'FRESH_AUTH_REQUIRED' } })
    } finally {
      await fresh()
    }
    expect((await post('owner', '/staff/audit-retention/delete', { ...body, reason: '' })).statusCode).toBe(400)
    expect(await existing(seqs)).toBe(2)

    // The policy: the retention actions are the Owner's with a fresh sign-in and a reason; "Edit or delete audit
    // events" refuses every role, the Owner included.
    const owner = (freshAuth: boolean): Actor => ({
      kind: 'staff',
      userId: ids.owner,
      roles: ['owner'],
      capabilities: [],
      status: 'active',
      freshAuth,
    })
    const now = new Date()
    expect(decide(owner(true), 'audit.retention_delete', {}, { now, reason: 'r' }).effect).toBe('allow')
    expect(decide(owner(false), 'audit.retention_delete', {}, { now, reason: 'r' }).effect).toBe('deny')
    expect(decide(owner(true), 'audit.retention_delete', {}, { now }).effect).toBe('deny')
    for (const action of ['audit.edit', 'audit.delete'] as const)
      expect(decide(owner(true), action, {}, { now, reason: 'r' })).toMatchObject({
        effect: 'deny',
        reason: 'AUDIT_APPEND_ONLY',
      })
  })

  it('[HH-SEC-08][HH-SEC-06] the database refuses every other delete: no privilege, no operation, another transaction', async () => {
    const seqs = await oldEntries(1, '2016-03-10T15:00:00Z')
    const seq = seqs[0] as string
    await expect(sql`DELETE FROM platform.audit_events WHERE seq = ${seq}::bigint`.execute(t.db)).rejects.toThrow(
      /APPEND_ONLY|permission denied/,
    )
    await expect(
      sql`UPDATE platform.audit_events SET reason = 'x' WHERE seq = ${seq}::bigint`.execute(t.db),
    ).rejects.toThrow(/APPEND_ONLY|permission denied/)
    await expect(sql`SELECT platform.audit_retention_erase(${randomUUID()}::uuid)`.execute(t.db)).rejects.toThrow(
      /AUDIT_RETENTION_NOT_PERMITTED/,
    )
    // An operation row written by anyone but an active Owner, or for entries not past their period, is refused.
    const version = await t.db
      .selectFrom('platform.policy_version')
      .select(['version'])
      .where('key', '=', 'retention.audit_log')
      .orderBy('version', 'desc')
      .executeTakeFirstOrThrow()
    const insertOp = (by: string, at: string) =>
      withTx(t.db, async (tx) => {
        await sql`SELECT 1`.execute(tx)
        const seal = await tx.selectFrom('platform.audit_chain_seals').select('id').executeTakeFirst()
        await tx
          .insertInto('platform.audit_retention_operations')
          .values({
            kind: 'delete',
            from_seq: seq,
            to_seq: seq,
            event_count: 1,
            first_occurred_at: at,
            last_occurred_at: at,
            hash_before: Buffer.alloc(32),
            hash_after: Buffer.alloc(32),
            seal_id: seal?.id ?? randomUUID(),
            policy_key: 'retention.audit_log',
            policy_version: version.version,
            period_years: 7,
            time_zone: 'America/Kentucky/Louisville',
            hold_checks: '[]',
            reason: 'Synthetic.',
            authorized_by: by,
            authorized_roles: ['office'],
            fresh_auth_at: new Date(),
            request_id: 'synthetic-audit-retention',
          })
          .execute()
      })
    await expect(insertOp(ids.office, '2016-03-10T15:00:00Z')).rejects.toThrow(/only an active Owner/)
    await expect(insertOp(ids.owner, '2016-03-10T15:00:00Z')).rejects.toThrow(/names its range|seal/)
    expect(await existing(seqs)).toBe(1)
  })
})

describe('eligibility and holds (TSK-0135, HH-SEC-08)', () => {
  it('[HH-SEC-08][HH-SEC-06] an entry is eligible 7 calendar years after it was recorded, in the business time zone', async () => {
    // 12:00 EST on 9 March 2019 (17:00 UTC); 7 years later is 12:00 EDT on 9 March 2026 (16:00 UTC): a UTC count of
    // years would end an hour later.
    const seqs = await oldEntries(1, '2019-03-09T17:00:00Z')
    const r = { from: BigInt(seqs[0] as string), to: BigInt(seqs[0] as string) }
    const before = await previewRange(t.db, r, new Date('2026-03-09T15:59:59.999Z'))
    expect(before.notYetEligible).toBe(1)
    expect(before.range.periodEndsAt).toBe('2026-03-09T16:00:00.000Z')
    expect(before.blockers.archive).toContain('not_eligible')
    expect(before.blockers.delete).toContain('not_eligible')
    const at = await previewRange(t.db, r, new Date('2026-03-09T16:00:00.000Z'))
    expect(at.notYetEligible).toBe(0)
    expect(at.blockers).toEqual({ archive: [], delete: [] })
    expect(at.policy).toMatchObject({ state: 'CONFIGURED', years: 7, minimumYears: 7 })
    // The checks: no project, so no open-hold check applies; the rest are the Owner's confirmation, never "none found".
    expect(at.checks).toContainEqual({ check: 'open_holds', result: 'not_applicable' })
    expect(at.checks).toContainEqual({ check: 'legal_holds', result: 'not_recorded' })
    expect(at.checks).toContainEqual({ check: 'security_incidents', result: 'not_recorded' })
    expect(at.confirm).toEqual([...AUDIT_CONFIRM_CHECKS])
  })

  it('[HH-SEC-08] recent entries are refused; a period below 7 years leaves the workflow NOT CONFIGURED', async () => {
    const recent = await sql<{ seq: string }>`SELECT max(seq)::text AS seq FROM platform.audit_events
      WHERE occurred_at > now() - interval '1 day'`.execute(t.db)
    const seq = recent.rows[0]?.seq as string
    await fresh()
    const res = await post('owner', '/staff/audit-retention/archive', { fromSeq: seq, toSeq: seq, reason: REASON })
    expect(res.statusCode).toBe(409)
    expect(codes(res)).toContain('NOT_ELIGIBLE')

    const old = await oldEntries(1, '2016-04-10T15:00:00Z')
    await recordPolicyVersion(t.db, {
      key: 'retention.audit_log',
      value: { years: 5, afterPeriod: 'owner_deletion_review', automaticDeletion: false, holdsKeepRecords: true },
      sourceIds: ['TEST-SYNTHETIC'],
      changedBy: 'test',
      reason: 'synthetic: a period below the 7-year minimum',
    })
    try {
      const p = (await get('owner', `/staff/audit-retention/range?fromSeq=${old[0]}&toSeq=${old[0]}`)).json<{
        policy: { state: string }
        blockers: { delete: string[] }
      }>()
      expect(p.policy.state).toBe('NOT_CONFIGURED')
      expect(p.blockers.delete).toContain('not_configured')
    } finally {
      await recordPolicyVersion(t.db, {
        key: 'retention.audit_log',
        value: { years: 7, afterPeriod: 'owner_deletion_review', automaticDeletion: false, holdsKeepRecords: true },
        sourceIds: ['OWN-DEC-142', 'FACT-RETENTION-SCHEDULE', 'OWN-DEC-70', 'OQ-RETENTION-REVIEW'],
        changedBy: 'test',
        reason: 'synthetic: restore',
      })
    }
  })

  it('[HH-SEC-08][RULE-HUMAN-REVIEW] an open hold on the project blocks deletion and offers Archive; every check must be confirmed', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/public/requests',
      headers: { 'idempotency-key': key(), 'x-forwarded-for': '198.51.100.136' },
      payload: {
        formVersion: 'test-1',
        privacyNoticeVersion: 'privacy-notice-1',
        services: [{ serviceId: 'SVC-DW-01' }],
        notSure: false,
        description: 'Synthetic audit retention project.',
        answers: [],
        property: { street: '1 Synthetic Way', city: 'Testville', state: 'ky', zip: '40000', propertyType: 'house' },
        timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
        estimatePreference: 'site_visit',
        contact: {
          fullName: 'Synthetic Audit Retention Customer',
          email: 'audit-retention-customer@example.test',
          phone: '(502) 555-0101',
          preferredChannel: 'email',
        },
        smsOptIn: false,
        marketingOptIn: false,
      },
    })
    expect(res.statusCode, res.body).toBe(201)
    const request = await t.db
      .selectFrom('intake.requests')
      .select(['id', 'project_id'])
      .where('reference', '=', res.json<{ reference: string }>().reference)
      .executeTakeFirstOrThrow()
    await t.db
      .insertInto('work.holds')
      .values({
        kind: 'review',
        scope_type: 'request',
        scope_id: request.id,
        project_id: request.project_id,
        request_id: request.id,
        category: 'other',
        note: 'Synthetic review hold',
        source: 'qualification',
        source_ref: 'qualification:1',
        raised_by: ids.office,
      })
      .execute()
    const held = await oldEntries(3, '2016-05-10T15:00:00Z', { type: 'project', id: request.project_id })
    const preview = (await get('owner', `/staff/audit-retention/range?fromSeq=${held[0]}&toSeq=${held[2]}`)).json<{
      checks: { check: string; result: string; count?: number }[]
      blockers: { archive: string[]; delete: string[] }
    }>()
    expect(preview.checks).toContainEqual({ check: 'open_holds', result: 'found', count: 1 })
    expect(preview.blockers).toEqual({ archive: [], delete: ['hold_found'] })
    await fresh()
    const refused = await post('owner', '/staff/audit-retention/delete', {
      ...range(held),
      reason: REASON,
      confirmedChecks: [...AUDIT_CONFIRM_CHECKS],
    })
    expect(refused.statusCode).toBe(409)
    expect(codes(refused)).toEqual(['HOLD_FOUND'])
    expect(await existing(held)).toBe(3)
    // The refusal is audited as denied, with the range and the blocker.
    const denied = await t.db
      .selectFrom('platform.audit_events')
      .select(['summary', 'actor_id', 'step_up_used'])
      .where('action', '=', 'retention.audit_delete')
      .where('result', '=', 'denied')
      .orderBy('seq', 'desc')
      .executeTakeFirstOrThrow()
    expect(denied).toMatchObject({ actor_id: ids.owner, step_up_used: true })
    expect(denied.summary).toMatchObject({ fromSeq: held[0], toSeq: held[2], blockers: ['hold_found'] })

    // Without a hold, every check the software does not record must still be confirmed.
    const free = await oldEntries(2, '2016-06-10T15:00:00Z')
    const unconfirmed = await post('owner', '/staff/audit-retention/delete', {
      ...range(free),
      reason: REASON,
      confirmedChecks: AUDIT_CONFIRM_CHECKS.filter((c) => c !== 'legal_holds'),
    })
    expect(unconfirmed.statusCode).toBe(400)
    expect(unconfirmed.json()).toMatchObject({
      error: { fieldErrors: [{ field: 'body.confirmedChecks.legal_holds', code: 'CHECK_NOT_CONFIRMED' }] },
    })
    expect(await existing(free)).toBe(2)

    // Archive is offered instead: the held entries stay exactly as they are.
    const archived = await post('owner', '/staff/audit-retention/archive', { ...range(held), reason: REASON })
    expect(archived.statusCode, archived.body).toBe(200)
    expect(await existing(held)).toBe(3)
  })
})

describe('archive, deletion, the trail and the chain (TSK-0135, HH-SEC-08, T74)', () => {
  it('[HH-SEC-08][HH-SEC-06] the daily job seals the chain and never deletes; the queue opens entries in the business zone', async () => {
    const seqs = await oldEntries(2, '2016-07-10T15:00:00Z')
    const before = Number(
      (await sql<{ n: string }>`SELECT count(*)::text AS n FROM platform.audit_events`.execute(t.db)).rows[0]?.n,
    )
    await withTx(t.db, (tx) => scanNow(tx, 'synthetic-audit-retention-scan'))
    const after = Number(
      (await sql<{ n: string }>`SELECT count(*)::text AS n FROM platform.audit_events`.execute(t.db)).rows[0]?.n,
    )
    expect(after).toBeGreaterThanOrEqual(before)
    expect(await existing(seqs)).toBe(2)
    const seals = await t.db.selectFrom('platform.audit_chain_seals').select(['through_seq']).execute()
    expect(seals.length).toBeGreaterThanOrEqual(1)
    expect(seals.some((s) => BigInt(s.through_seq) >= BigInt(seqs[1] as string))).toBe(true)
    expect(retentionReviewAutomation().effect).toMatch(/never deletes/)
    const entries = await t.db
      .selectFrom('privacy.retention_reviews')
      .innerJoin('platform.audit_events as ae', 'ae.id', 'privacy.retention_reviews.record_id')
      .select(['period_ends_at', 'ae.occurred_at'])
      .where('ae.seq', 'in', seqs)
      .execute()
    expect(entries).toHaveLength(2)
    // 15:00 UTC on 10 July 2016 is 11:00 EDT; 7 years later 11:00 EDT is 15:00 UTC again.
    expect(new Date(entries[0]?.period_ends_at as Date).toISOString()).toMatch(/^2023-07-10T15:0[01]:00\.000Z$/)
    expect((await verify()).ok).toBe(true)
  })

  it('[HH-SEC-08][T74] archive keeps the entries, records the integrity evidence and takes their review entries out of the queue', async () => {
    const seqs = await oldEntries(3, '2016-08-10T15:00:00Z')
    await withTx(t.db, (tx) => runRetentionScan(tx, { requestId: 'synthetic-audit-retention-scan', limit: 10_000 }))
    await fresh()
    const res = await post('owner', '/staff/audit-retention/archive', { ...range(seqs), reason: REASON })
    expect(res.statusCode, res.body).toBe(200)
    const op = res.json<{ operation: Record<string, unknown>; deleted: number }>()
    expect(op.deleted).toBe(0)
    expect(op.operation).toMatchObject({
      kind: 'archive',
      ...range(seqs),
      count: 3,
      firstOccurredAt: '2016-08-10T15:00:00.000Z',
      lastOccurredAt: '2016-08-10T15:02:00.000Z',
      years: 7,
      timeZone: 'America/Kentucky/Louisville',
      reason: REASON,
      authorizedBy: { id: ids.owner },
      authorizedRoles: ['owner'],
      reviewEntries: 3,
    })
    expect(op.operation['hashBefore']).toMatch(/^[0-9a-f]{64}$/)
    expect(await existing(seqs)).toBe(3)
    const listed = (await get('owner', '/staff/retention-reviews?category=audit_log&status=archived&limit=100')).json<{
      items: { record: { reference: string } }[]
    }>()
    for (const s of seqs) expect(listed.items.some((i) => i.record.reference === `#${s} synthetic.probe`)).toBe(true)
    // A second archive of the same range is refused; the audit event names the range.
    const again = await post('owner', '/staff/audit-retention/archive', { ...range(seqs), reason: REASON })
    expect(again.statusCode).toBe(409)
    expect(codes(again)).toEqual(['ALREADY_ARCHIVED'])
    const v = await verify()
    expect(v).toMatchObject({ ok: true, mismatch: null })
    expect(v.archives).toBeGreaterThanOrEqual(1)
  })

  it('[HH-SEC-08][T74] deletion removes the range, keeps a trail without content, and the chain verifies across the boundary', async () => {
    const doomed = await oldEntries(4, '2016-09-10T15:00:00Z')
    // Entries after the range, sealed before the deletion: their seal is checked after the boundary.
    const after = await oldEntries(2, '2016-10-10T15:00:00Z')
    await withTx(t.db, (tx) => runRetentionScan(tx, { requestId: 'synthetic-audit-retention-scan', limit: 10_000 }))
    await withTx(t.db, (tx) => scanNow(tx, 'synthetic-audit-retention-seal'))
    await fresh()
    const res = await post('owner', '/staff/audit-retention/delete', {
      ...range(doomed),
      reason: REASON,
      confirmedChecks: [...AUDIT_CONFIRM_CHECKS],
    })
    expect(res.statusCode, res.body).toBe(200)
    const out = res.json<{ operation: { id: string; hashBefore: string; hashAfter: string }; deleted: number }>()
    expect(out.deleted).toBe(4)
    expect(await existing(doomed)).toBe(0)
    expect(await existing(after)).toBe(2)

    // The trail: who, why, the range, counts, times and the integrity evidence; never the deleted content.
    const trail = (await get('owner', '/staff/audit-retention/operations')).json<{ items: Record<string, unknown>[] }>()
    const row = trail.items.find((i) => i['id'] === out.operation.id)
    expect(row).toMatchObject({
      kind: 'delete',
      ...range(doomed),
      count: 4,
      firstOccurredAt: '2016-09-10T15:00:00.000Z',
      lastOccurredAt: '2016-09-10T15:03:00.000Z',
      reason: REASON,
      authorizedBy: { id: ids.owner },
      checksConfirmed: [...AUDIT_CONFIRM_CHECKS],
    })
    expect(JSON.stringify(trail)).not.toContain(MARKER)
    // The deletion is itself audited (in the main log) with the range and hashes, never the content.
    const audited = await t.db
      .selectFrom('platform.audit_events')
      .select(['summary', 'target_id', 'step_up_used', 'reason'])
      .where('action', '=', 'retention.audit_delete')
      .where('result', '=', 'succeeded')
      .executeTakeFirstOrThrow()
    expect(audited).toMatchObject({ target_id: out.operation.id, step_up_used: true, reason: REASON })
    expect(audited.summary).toMatchObject({
      ...range(doomed),
      count: 4,
      chainStart: out.operation.hashBefore,
      chainEnd: out.operation.hashAfter,
      deleted: 4,
    })
    expect(JSON.stringify(audited)).not.toContain(MARKER)
    // The review entries of the deleted entries read as deleted.
    const deleted = (await get('owner', '/staff/retention-reviews?category=audit_log&status=deleted&limit=100')).json<{
      items: { record: { reference: string } }[]
    }>()
    for (const s of doomed) expect(deleted.items.some((i) => i.record.reference === `#${s} synthetic.probe`)).toBe(true)
    // No second deletion over the same range; seqs are never renumbered.
    const remaining = await t.db
      .selectFrom('platform.audit_events')
      .select(sql<string>`seq::text`.as('seq'))
      .where('seq', 'in', after)
      .execute()
    expect(remaining.map((r) => r.seq).sort()).toEqual([...after].sort())

    const v = await verify()
    expect(v).toMatchObject({ ok: true, mismatch: null })
    expect(v.deletions).toBe(1)
    const overview = (await get('owner', '/staff/audit-retention')).json<{
      automaticDeletion: boolean
      operations: { deletions: number; deletedEvents: number }
      backups: string
    }>()
    expect(overview).toMatchObject({
      automaticDeletion: false,
      operations: { deletions: 1, deletedEvents: 4 },
      backups: 'NOT_CONFIGURED',
    })
  })

  it('[HH-SEC-08][T74] a changed or removed entry breaks the chain at the next seal or boundary', async () => {
    // Only a superuser or the table owner with its triggers off could do this; the chain shows it.
    const seqs = await oldEntries(2, '2016-11-10T15:00:00Z')
    await withTx(t.db, (tx) => scanNow(tx, 'synthetic-audit-retention-seal'))
    expect((await verify()).ok).toBe(true)
    const seq = seqs[0] as string
    const tamper = (statement: ReturnType<typeof sql>) =>
      withTx(t.db, async (tx) => {
        await sql`ALTER TABLE platform.audit_events DISABLE TRIGGER audit_events_no_update`.execute(tx)
        await sql`GRANT UPDATE ON platform.audit_events TO CURRENT_USER`.execute(tx)
        await statement.execute(tx)
        await sql`REVOKE UPDATE ON platform.audit_events FROM CURRENT_USER`.execute(tx)
        await sql`ALTER TABLE platform.audit_events ENABLE TRIGGER audit_events_no_update`.execute(tx)
      })
    await tamper(sql`UPDATE platform.audit_events SET reason = 'tampered' WHERE seq = ${seq}::bigint`)
    const broken = await verify()
    expect(broken.ok).toBe(false)
    expect(broken.mismatch).toMatchObject({ at: 'seal' })
    await tamper(sql`UPDATE platform.audit_events SET reason = NULL WHERE seq = ${seq}::bigint`)
    expect((await verify()).ok).toBe(true)
    // A refused operation while the chain is broken: nothing is written to the trail.
    await tamper(sql`UPDATE platform.audit_events SET reason = 'tampered' WHERE seq = ${seq}::bigint`)
    try {
      await fresh()
      const refused = await post('owner', '/staff/audit-retention/archive', { ...range(seqs), reason: REASON })
      expect(refused.statusCode).toBe(409)
      expect(codes(refused)).toEqual(['CHAIN_BROKEN'])
    } finally {
      await tamper(sql`UPDATE platform.audit_events SET reason = NULL WHERE seq = ${seq}::bigint`)
    }
    expect((await verify()).ok).toBe(true)
  })
})
