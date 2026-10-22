// Restore rehearsal against a real dump (TSK-0106; T72, HH-NFR-03, HH-PRIV-03, HH-PRIV-05, HH-COM-05; runbook
// docs/runbooks/restore.md). Every record is fictional test data made by the staging fresh-data generator and the public
// routes (RULE-SYNTHETIC-DATA); the source and the restored databases are both throwaway test databases of this run.
// The rehearsal, in the order of the runbook:
//  1. the source holds customers, projects, estimate versions, photos, visits, payments and customer questions;
//  2. its fingerprint is taken and pg_dump writes the backup (custom format);
//  3. after the backup a deletion is confirmed (retention review), a STOP is recorded and a new request arrives;
//  4. the replay file is exported from the source (deletions and consent withdrawals since the backup);
//  5. pg_restore restores the backup into an empty, isolated database;
//  6. integrity checks pass and the restored data matches the backup's fingerprint, relationships included; the
//     comparison with the source lists the data the backup does not hold (missing data);
//  7. before the replay the deleted estimate is back and the number that said STOP could be texted again;
//  8. the replay re-applies both; a second replay changes nothing; the checks still pass.
// pg_dump and pg_restore (PostgreSQL 16 client) come from PG_BIN_DIR, else from PATH; missing, the test fails.
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { loadServiceSeed, loadSopSeed, recordEnvironmentMark, syncServices, syncSops, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { ESTIMATE_TERMS, PRIVACY_NOTICE, SMS_DISCLOSURE } from '@handyhub/domain/legal'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { readCodeKey, type CodeKeySettings } from '../../src/modules/identity/index.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { currentConsent, recordConsent, sendPermission } from '../../src/modules/notifications/consent.js'
import {
  exportConsentWithdrawals,
  parseExportedWithdrawals,
  reapplyConsentWithdrawals,
} from '../../src/modules/notifications/consent-replay.js'
import {
  deleteEntry,
  exportDeletions,
  parseExportedDeletions,
  reapplyDeletions,
  UNRECORDED_DELETION_CHECKS,
} from '../../src/modules/privacy/index.js'
import { runRetentionScan } from '../../src/modules/retention/index.js'
import { CONFIRMATION_PHRASE } from '../../src/modules/staging/index.js'
import { recordPolicyVersion } from '../../src/platform/config/index.js'
import { runWithContext } from '../../src/platform/request-context.js'
import {
  compareFingerprints,
  databaseFingerprint,
  integrityChecks,
  type DatabaseFingerprint,
} from '../../src/platform/restore.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { testConfig } from '../fixtures/env.js'
import { png } from '../fixtures/images.js'
import { signInWithMfa } from '../fixtures/staff-mfa.js'

const run = promisify(execFile)
const pgTool = (name: 'pg_dump' | 'pg_restore') =>
  process.env['PG_BIN_DIR'] ? join(process.env['PG_BIN_DIR'], name) : name

const KEY: CodeKeySettings = readCodeKey({
  HANDYHUB_ENV: 'ci',
  CODE_HASH_KEY: ['synthetic', 'restore', 'rehearsal', 'code', 'key', 'for', 'tests', 'only', '0106'].join('-'),
})
const pw = ['synthetic', 'restore', 'rehearsal', 'passphrase', '106'].join(' ')
const PEOPLE = ['owner', 'ann'] as const
type Person = (typeof PEOPLE)[number]
const WEEK = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, start: '08:00', end: '20:00' }))
const STOPPED = '+15025550177'
const YEAR_MS = 365.25 * 24 * 3600 * 1000

let source: TestDatabase
let restored: TestDatabase
let app: FastifyInstance
let dir = ''
const storage = new FakeObjectStorage()
const cookies = {} as Record<Person, string>
const csrf = {} as Record<Person, string>
const ids = {} as Record<Person, string>
let ip = 20
const nextIp = () => `198.51.100.${++ip}`

function staff(who: Person, method: 'POST' | 'PUT', url: string, payload: unknown, version?: number) {
  return app.inject({
    method,
    url: `/api/v1${url}`,
    payload: payload as object,
    headers: {
      cookie: cookies[who],
      'x-csrf-token': csrf[who],
      'idempotency-key': `synthetic-${randomUUID()}`,
      ...(version !== undefined ? { 'if-match': `"${version}"` } : {}),
    },
  })
}

const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
const requestBody = (email: string, photoDraft?: string) => ({
  formVersion: 'test-1',
  privacyNoticeVersion: PRIVACY_NOTICE.documentId,
  services: [],
  notSure: true,
  description: 'Synthetic restore rehearsal project (TEST DATA, fictional).',
  property: { street: '100 Synthetic Way', city: 'Testville', state: 'KY', zip: '40000', propertyType: 'house' },
  timing: { preferredDate: future, flexible: false, needHelpToday: false, windows: ['mornings'] },
  estimatePreference: 'let_handyhub_decide',
  contact: { fullName: 'Test Customer', email, phone: '(502) 555-0178', preferredChannel: 'email' },
  smsOptIn: false,
  marketingOptIn: false,
  ...(photoDraft ? { photoDraft } : {}),
})
const submit = (body: unknown) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': `synthetic-${randomUUID()}`, 'x-forwarded-for': nextIp() },
    payload: body as Record<string, unknown>,
  })

const count = async (t: TestDatabase, table: string, where = sql`true`) =>
  Number(
    (await sql<{ n: string }>`SELECT count(*)::text AS n FROM ${sql.table(table)} WHERE ${where}`.execute(t.db)).rows[0]
      ?.n ?? 0,
  )

beforeAll(async () => {
  source = await createTestDatabase()
  restored = await createTestDatabase({ migrated: false })
  dir = mkdtempSync(join(tmpdir(), 'hh-restore-rehearsal-'))
  await syncServices(source.db, loadServiceSeed())
  await syncSops(source.db, loadSopSeed())
  // A fixture of this throwaway database only (the approval scenarios need approved terms), never a statement that
  // the owner or an attorney approved anything.
  await recordPolicyVersion(source.db, {
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
  await recordEnvironmentMark(source.db, 'ci', 'migration')
  app = await buildApp({
    config: testConfig({ TRUST_PROXY_HOPS: '1', STAGING_TOOLS: 'on', DATABASE_URL: source.url }),
    api: { db: source.db, codeKey: KEY, storage },
  })
  const hash = await hashPassword(pw)
  await withTx(source.db, async (tx) => {
    for (const p of PEOPLE) {
      const user = await createStaffUser(tx, {
        email: `${p}-restore@example.test`,
        displayName: `Synthetic ${p}`,
        locale: 'en',
        role: p === 'ann' ? 'worker' : p,
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
      headers: { 'x-forwarded-for': '198.51.100.106' },
      payload: { email: `${p}-restore@example.test`, password: pw },
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
  const hours = await staff('owner', 'PUT', `/staff/workers/${ids.ann}/working-hours`, { periods: WEEK }, 0)
  expect(hours.statusCode, hours.body).toBe(200)
}, 120_000)

afterAll(async () => {
  await app?.close()
  await source?.drop()
  await restored?.drop()
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('restore rehearsal from a pg_dump backup (TSK-0106, T72, HH-NFR-03)', () => {
  const dump = () => join(dir, 'backup.dump')
  let atBackup: DatabaseFingerprint
  let backupAt: Date
  let deletedEstimate = ''
  let withdrawnEstimate = ''
  let replay: { deletions: unknown; consentWithdrawals: unknown } = { deletions: [], consentWithdrawals: [] }

  it('[T72] the source holds customers, projects, estimate versions, photos, visits, payments and customer questions', async () => {
    const seeded = await staff('owner', 'POST', '/staff/staging/test-data/reset', {
      confirmation: CONFIRMATION_PHRASE,
      freshData: true,
    })
    expect(seeded.statusCode, seeded.body).toBe(200)
    expect(seeded.json<{ state: string }>().state).toBe('completed')
    // A request with a photo, for the media relationships.
    const draft = await app.inject({
      method: 'POST',
      url: '/api/v1/public/request-drafts',
      headers: { 'x-forwarded-for': nextIp() },
    })
    expect(draft.statusCode, draft.body).toBe(201)
    const capability = draft.json<{ capability: string }>().capability
    const up = await app.inject({
      method: 'POST',
      url: '/api/v1/public/request-drafts/photos',
      headers: { 'upload-capability': capability, 'content-type': 'image/png', 'x-forwarded-for': nextIp() },
      payload: png(),
    })
    expect(up.statusCode, up.body).toBe(201)
    expect((await submit(requestBody('restore-photo@example.test', capability))).statusCode).toBe(201)
    // A number that opted in on the request form before the backup.
    await withTx(source.db, (tx) =>
      recordConsent(tx, {
        purpose: 'transactional_sms',
        channel: 'sms',
        destination: STOPPED,
        granted: true,
        source: 'request_form',
        disclosureVersion: SMS_DISCLOSURE.documentId,
        recordedBy: 'customer:contact-synthetic-restore',
      }),
    )
    // A published estimate is withdrawn before the backup (it is deleted after it, below).
    const v = await source.db
      .selectFrom('estimating.estimate_versions')
      .select(['id', 'estimate_id', 'row_version'])
      .where('state', '=', 'published')
      .orderBy('id')
      .executeTakeFirstOrThrow()
    const withdrawn = await staff(
      'owner',
      'POST',
      `/staff/estimate-versions/${v.id}/withdraw`,
      { reason: 'Synthetic: sent to the wrong project.' },
      v.row_version,
    )
    expect(withdrawn.statusCode, withdrawn.body).toBe(200)
    withdrawnEstimate = v.estimate_id
    for (const table of [
      'crm.customers',
      'crm.projects',
      'estimating.estimates',
      'estimating.estimate_versions',
      'intake.photos',
      'work.visits',
      'finance.payments',
      'finance.payment_allocations',
      'intake.questions',
      'platform.consent_records',
      'platform.audit_events',
    ])
      expect(await count(source, table), table).toBeGreaterThan(0)
  }, 120_000)

  it('[T72][HH-NFR-03] pg_dump writes the backup; its fingerprint is taken at the same moment', async () => {
    atBackup = await databaseFingerprint(source.db)
    backupAt = new Date()
    await run(pgTool('pg_dump'), ['--format=custom', '--no-password', `--file=${dump()}`, `--dbname=${source.url}`])
    expect(Object.keys(atBackup.relationships).length).toBeGreaterThan(50)
    // The fingerprint is order-independent and repeatable: taken again, nothing differs.
    expect(compareFingerprints(atBackup, await databaseFingerprint(source.db))).toEqual([])
  }, 120_000)

  it('[T72][HH-PRIV-05][HH-COM-05] after the backup: a confirmed deletion, a STOP and a new request', async () => {
    // The estimate withdrawn before the backup comes up for review two years later and the Owner deletes it.
    const v = { estimate_id: withdrawnEstimate }
    const later = new Date(Date.now() + 2 * YEAR_MS + 2 * 86_400_000)
    await withTx(source.db, (tx) => runRetentionScan(tx, { now: later, requestId: 'synthetic-restore-scan' }))
    const entry = await source.db
      .selectFrom('privacy.retention_reviews')
      .select('id')
      .where('record_id', '=', v.estimate_id)
      .executeTakeFirstOrThrow()
    const requestId = `synthetic-restore-delete-${randomUUID().slice(0, 8)}`
    const out = await runWithContext({ requestId }, () =>
      withTx(source.db, (tx) =>
        deleteEntry(tx, {
          reviewId: entry.id,
          staffUserId: ids.owner,
          reason: 'Synthetic: deleted after the backup.',
          confirmedChecks: [...UNRECORDED_DELETION_CHECKS],
          requestId,
        }),
      ),
    )
    expect(out.ok, JSON.stringify(out.ok ? null : out.blockers)).toBe(true)
    deletedEstimate = v.estimate_id
    expect(await count(source, 'estimating.estimates', sql`id = ${deletedEstimate}`)).toBe(0)
    // The number texts STOP.
    await withTx(source.db, (tx) =>
      recordConsent(tx, {
        purpose: 'transactional_sms',
        channel: 'sms',
        destination: STOPPED,
        granted: false,
        source: 'sms_keyword',
        evidence: { keyword: 'STOP' },
        recordedBy: 'system:sms_keyword',
      }),
    )
    expect(await currentConsent(source.db, 'sms', STOPPED, 'transactional_sms')).toBe('withdrawn')
    // A request that arrives after the backup: the backup cannot hold it.
    expect((await submit(requestBody('restore-after-backup@example.test'))).statusCode).toBe(201)
  }, 120_000)

  it('[T72][HH-PRIV-03] the replay file is exported from the source: references and withdrawals since the backup', async () => {
    const deletions = await exportDeletions(source.db, backupAt)
    const consentWithdrawals = await exportConsentWithdrawals(source.db, backupAt)
    expect(deletions.map((d) => [d.recordType, d.recordId])).toEqual([['estimate', deletedEstimate]])
    expect(consentWithdrawals.map((w) => [w.channel, w.destination, w.source])).toEqual([
      ['sms', STOPPED, 'sms_keyword'],
    ])
    // References only for deletions: never the deleted content.
    expect(JSON.stringify(deletions)).not.toContain('Synthetic restore rehearsal project')
    // Written and read back as the file the operator keeps.
    replay = JSON.parse(JSON.stringify({ deletions, consentWithdrawals }))
  })

  it('[T72][HH-NFR-03] pg_restore restores the backup into an isolated database; integrity checks pass and every relationship matches the backup', async () => {
    await run(pgTool('pg_restore'), ['--exit-on-error', '--no-password', `--dbname=${restored.url}`, dump()])
    const checks = await integrityChecks(restored.db)
    expect(checks.map((c) => c.id)).toEqual([
      'migrations',
      'constraints_validated',
      'sequences_ahead',
      'append_only_triggers',
    ])
    expect(checks.filter((c) => !c.ok)).toEqual([])
    const after = await databaseFingerprint(restored.db)
    expect(compareFingerprints(atBackup, after)).toEqual([])
    // The named relationships: customers to projects, estimate versions, photos, visits and payments.
    const rel = (prefix: string) =>
      Object.entries(after.relationships).filter(([k, n]) => k.startsWith(prefix) && n > 0).length
    for (const prefix of [
      'crm.projects.',
      'estimating.estimate_versions.',
      'intake.photos.',
      'work.visits.',
      'finance.payments.',
      'finance.payment_allocations.',
    ])
      expect(rel(prefix), prefix).toBeGreaterThan(0)
  }, 120_000)

  it('[T72] the comparison with the source records the data the backup does not hold', async () => {
    const missing = compareFingerprints(await databaseFingerprint(source.db), await databaseFingerprint(restored.db))
    const names = new Set(missing.map((d) => ('name' in d ? d.name : d.kind)))
    // The request that came after the backup, the deletion log entry and the STOP are not in the restored database.
    for (const name of ['intake.requests', 'privacy.deletions', 'platform.consent_records'])
      expect(names.has(name), name).toBe(true)
    expect(missing.find((d) => d.kind === 'rows' && d.name === 'intake.requests')).toMatchObject({
      before: (atBackup.tables['intake.requests']?.rows ?? 0) + 1,
      after: atBackup.tables['intake.requests']?.rows,
    })
  }, 120_000)

  it('[T72][HH-PRIV-03][HH-COM-05] before the replay the deleted estimate is back and the STOP is lost', async () => {
    expect(await count(restored, 'estimating.estimates', sql`id = ${deletedEstimate}`)).toBe(1)
    expect(await currentConsent(restored.db, 'sms', STOPPED, 'transactional_sms')).toBe('granted')
    expect(
      await sendPermission(restored.db, {
        channel: 'sms',
        destination: STOPPED,
        audience: 'customer',
        messageKey: 'question.notice',
      }),
    ).toEqual({ allowed: true })
  })

  it('[T72][HH-PRIV-03][HH-COM-05] the replay re-applies the deletion and the STOP; a second replay changes nothing', async () => {
    const deletions = parseExportedDeletions(JSON.stringify(replay.deletions))
    const withdrawals = parseExportedWithdrawals(replay.consentWithdrawals)
    const requestId = 'synthetic-restore-reapply'
    const apply = () =>
      runWithContext({ requestId }, () =>
        withTx(restored.db, async (tx) => ({
          deletions: await reapplyDeletions(tx, deletions, { requestId, operator: 'rehearsal' }),
          withdrawals: await reapplyConsentWithdrawals(tx, withdrawals, { operator: 'rehearsal' }),
        })),
      )
    const first = await apply()
    expect(first.deletions.map((r) => r.outcome)).toEqual(['reapplied'])
    expect(first.withdrawals.map((r) => r.outcome)).toEqual(['reapplied'])
    expect(await count(restored, 'estimating.estimates', sql`id = ${deletedEstimate}`)).toBe(0)
    expect(await currentConsent(restored.db, 'sms', STOPPED, 'transactional_sms')).toBe('withdrawn')
    expect(
      await sendPermission(restored.db, {
        channel: 'sms',
        destination: STOPPED,
        audience: 'customer',
        messageKey: 'question.notice',
      }),
    ).toEqual({ allowed: false, reason: 'sms_opted_out' })
    const reapplied = await restored.db
      .selectFrom('platform.consent_records')
      .select(['recorded_by', 'source', 'evidence'])
      .where('destination', '=', STOPPED)
      .orderBy('seq', 'desc')
      .executeTakeFirstOrThrow()
    expect(reapplied).toMatchObject({ recorded_by: 'system.restore:rehearsal', source: 'sms_keyword' })
    expect(reapplied.evidence).toMatchObject({ keyword: 'STOP', restoreOf: withdrawals[0]?.id })

    const second = await apply()
    expect(second.deletions.map((r) => r.outcome)).toEqual(['absent'])
    expect(second.withdrawals.map((r) => r.outcome)).toEqual(['present'])
    // Exported again from the restored database, the re-applied entries keep their original identity.
    expect((await exportConsentWithdrawals(restored.db, backupAt)).map((w) => w.id)).toEqual(
      withdrawals.map((w) => w.id),
    )
    expect((await exportDeletions(restored.db, backupAt)).map((d) => d.id)).toEqual(deletions.map((d) => d.id))
    expect((await integrityChecks(restored.db)).filter((c) => !c.ok)).toEqual([])
  }, 120_000)

  it('[HH-PRIV-03] an export file that is not a withdrawal list is refused before anything is applied', () => {
    expect(() => parseExportedWithdrawals({})).toThrow(/JSON list/)
    expect(() => parseExportedWithdrawals([{ id: 'nope' }])).toThrow(/entry 1/)
  })
})
