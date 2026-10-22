// ZIP coverage against PostgreSQL 16 (TSK-0022, TSK-0127; HH-CUS-03, HH-CUS-04, HH-INT-16, T07, OWN-DEC-37,
// OWN-DEC-88, OWN-DEC-73, OWN-DEC-179). The owner's ZIP dataset is the one migration 0067 seeds; the Census-format
// file, addresses and visitors are synthetic (RULE-SYNTHETIC-DATA).
import { createHash } from 'node:crypto'
import { loadServiceSeed, syncServices, withTx, type Tx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { COVERAGE_CODE, countDataset, countDiscrepancies, datasetCanonicalText } from '@handyhub/domain/coverage'
import { SERVICE_AREA } from '@handyhub/domain/areas'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import {
  approveRuleSet,
  datasetEntries,
  datasetStatus,
  importRuleSet,
  lookupCoverage,
  RuleSetError,
} from '../../src/modules/coverage/coverage.js'
import { coverageOrUnknown } from '../../src/modules/requests/submit.js'
import { runWithContext } from '../../src/platform/request-context.js'
import { DATASET_ZIPS, SYNTHETIC_RELATIONSHIP_FILE, SYNTHETIC_ZIPS } from '../fixtures/coverage.js'
import { basic, GATE_USERS, gatePassword, testConfig } from '../fixtures/env.js'
import { PRIVACY_NOTICE } from '@handyhub/domain/legal'

const MESSAGES = {
  // PROPOSED wording (final owner amendments 2026-10-22): a ZIP match is screening, not address verification.
  in_coverage:
    'Your ZIP code looks like it’s in our service area. Tell us about your project, and we’ll confirm the address.',
  boundary: 'You may be within our service area. Send your request and we’ll confirm the address.',
  out_of_coverage: 'Outside our usual coverage? You can still request an estimate—we’ll check whether we can help.',
  unknown: "We couldn't confirm this ZIP. You can still submit your request for review.",
}
const MAILING_NOTE =
  'This ZIP code is used for mail only. Enter the ZIP code of the property where you need the work done.'
const APPOINTMENT_WORDS = /appointment|book|schedul|slot|price|\$|charge|fee|travel/i

let t: TestDatabase
let app: FastifyInstance
beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
  app = await buildApp({ config: testConfig({ TRUST_PROXY_HOPS: '1' }), api: { db: t.db } })
})
afterAll(async () => {
  await app?.close()
  await t?.drop()
})

const check = (zip: string) => app.inject({ url: `/api/v1/public/coverage?zip=${encodeURIComponent(zip)}` })
const inTx = <T>(fn: (tx: Tx) => Promise<T>) => runWithContext({ requestId: 'test:coverage' }, () => withTx(t.db, fn))
const importSynthetic = () =>
  inTx((tx) => importRuleSet(tx, { fileText: SYNTHETIC_RELATIONSHIP_FILE, source: 'synthetic', createdBy: 'test' }))

let ip = 40
const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
const submit = (zip: string, key: string) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': key, 'x-forwarded-for': `198.51.100.${++ip}` },
    payload: {
      formVersion: 'test-1',
      privacyNoticeVersion: PRIVACY_NOTICE.documentId,
      services: [],
      notSure: true,
      description: 'Synthetic project description.',
      property: { street: '100 Synthetic Way', city: 'Testville', state: 'KY', zip, propertyType: 'house' },
      timing: { preferredDate: future, flexible: false, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'let_handyhub_decide',
      contact: {
        fullName: 'Test Customer',
        email: `coverage-${ip}@example.test`,
        phone: '(502) 555-0101',
        preferredChannel: 'email',
      },
      smsOptIn: false,
      marketingOptIn: false,
    },
  })
const stored = async (reference: string) =>
  t.db
    .selectFrom('intake.requests as r')
    .innerJoin('crm.properties as p', 'p.id', 'r.property_id')
    .select([
      'r.coverage_result as request',
      'r.coverage_rule_set as requestSet',
      'r.coverage_reason as requestReason',
      'p.coverage_result as property',
      'p.coverage_rule_set as propertySet',
      'p.coverage_reason as propertyReason',
    ])
    .where('r.reference', '=', reference)
    .executeTakeFirstOrThrow()

describe('coverage area configuration (TSK-0022, OWN-DEC-37, OWN-DEC-179)', () => {
  it('[OWN-DEC-37][OWN-DEC-179][HH-CUS-04] coverage.area is the eleven whole counties the site names', async () => {
    const area = await t.db
      .selectFrom('platform.policy_version')
      .select(['value', 'source_ids'])
      .where('key', '=', 'coverage.area')
      .where('status', '=', 'active')
      .executeTakeFirstOrThrow()
    const counties = (area.value as { counties: { state: string; county: string }[] }).counties
    expect(counties.map((c) => `${c.state}:${c.county}`)).toEqual([
      'KY:Jefferson',
      'KY:Oldham',
      'KY:Bullitt',
      'KY:Shelby',
      'KY:Meade',
      'IN:Clark',
      'IN:Floyd',
      'IN:Harrison',
      'IN:Scott',
      'IN:Washington',
      'IN:Jefferson',
    ])
    expect(SERVICE_AREA.map((c) => `${c.state}:${c.county}`)).toEqual(counties.map((c) => `${c.state}:${c.county}`))
    expect(area.source_ids).toContain('OWN-DEC-37')
  })

  it('[OWN-DEC-179][RULE-NO-INVENTED-FACTS] the geographic verification source is NOT CONFIGURED', async () => {
    const row = await t.db
      .selectFrom('platform.policy_version')
      .select(['state', 'value', 'source_ids'])
      .where('key', '=', 'coverage.verification_source')
      .where('status', '=', 'active')
      .executeTakeFirstOrThrow()
    expect(row).toEqual({ state: 'not_configured', value: null, source_ids: ['OWN-DEC-179', 'OWN-DEC-37', 'TSK-0127'] })
  })
})

describe('the owner ZIP dataset (TSK-0127, OWN-DEC-179)', () => {
  it('[OWN-DEC-179] dataset v1 recounts to the stated 169 ZIPs (146 one-county: 94/33/19; 23 several: 7 KY, 16 IN)', async () => {
    const [status, ...more] = await datasetStatus(t.db)
    expect(more).toEqual([])
    if (!status) throw new Error('dataset v1 is missing')
    expect(status.counted).toEqual({
      unique: 169,
      singleCounty: { total: 146, standard: 94, poBox: 33, unique: 19 },
      multiCounty: { total: 23, byState: { KY: 7, IN: 16 } },
    })
    expect(countDiscrepancies(status.stated, status.counted)).toEqual([])
    expect(status.source).toMatch(/OWN-DEC-179/)
  })

  it('[OWN-DEC-179] every county association is kept, every county is one of the eleven, each has ZIPs', async () => {
    const entries = await datasetEntries(t.db, 1)
    const eleven = new Set(SERVICE_AREA.map((c) => `${c.state}:${c.county}`))
    expect(entries.flatMap((e) => e.counties).every((c) => eleven.has(c))).toBe(true)
    expect(new Set(entries.flatMap((e) => e.counties))).toEqual(eleven)
    expect(entries.find((e) => e.zip5 === DATASET_ZIPS.severalCountiesIndiana)).toEqual({
      zip5: DATASET_ZIPS.severalCountiesIndiana,
      category: null,
      counties: ['IN:Clark', 'IN:Floyd', 'IN:Washington'],
    })
    expect(entries.find((e) => e.zip5 === DATASET_ZIPS.poBox)?.category).toBe('po_box')
    expect(countDataset(entries).unique).toBe(entries.length)
  })

  it('[OWN-DEC-179] the dataset version carries the SHA-256 of its canonical text; rule set v1 cites it', async () => {
    const entries = await datasetEntries(t.db, 1)
    const sha = createHash('sha256').update(datasetCanonicalText(entries)).digest('hex')
    const [status] = await datasetStatus(t.db)
    expect(status?.sha256).toBe(sha)
    const set = await t.db
      .selectFrom('platform.coverage_rule_sets')
      .selectAll()
      .where('version', '=', 1)
      .executeTakeFirstOrThrow()
    expect(set).toMatchObject({
      status: 'active',
      dataset_version: 1,
      verification: 'not_configured',
      source_sha256: sha,
      approval_sources: ['OWN-DEC-179'],
      created_by: 'migration:0067',
    })
  })

  it('[OWN-DEC-179] the import and the activation are audited', async () => {
    const events = await t.db
      .selectFrom('platform.audit_events')
      .select(['action', 'actor_kind', 'actor_process', 'target_type', 'target_id', 'summary'])
      .where('action', 'like', 'coverage.%')
      .orderBy('seq')
      .execute()
    expect(events).toEqual([
      {
        action: 'coverage.import_dataset',
        actor_kind: 'system',
        actor_process: 'migration:0067',
        target_type: 'coverage_zip_dataset',
        target_id: '1',
        summary: expect.objectContaining({ zipCodes: 169, sources: ['OWN-DEC-179'] }),
      },
      {
        action: 'coverage.activate_rules',
        actor_kind: 'system',
        actor_process: 'migration:0067',
        target_type: 'coverage_rule_set',
        target_id: '1',
        summary: expect.objectContaining({
          in_coverage: 94,
          boundary: 23,
          unknown: 52,
          verification: 'not_configured',
        }),
      },
    ])
  })

  it('[OWN-DEC-179][ENT-CoverageRule] datasets and their entries are never edited or deleted', async () => {
    await expect(sql`UPDATE platform.coverage_zip_entries SET category = 'standard'`.execute(t.db)).rejects.toThrow(
      /APPEND_ONLY/,
    )
    await expect(sql`DELETE FROM platform.coverage_zip_entries`.execute(t.db)).rejects.toThrow(/APPEND_ONLY/)
    await expect(sql`DELETE FROM platform.coverage_zip_datasets`.execute(t.db)).rejects.toThrow(/APPEND_ONLY/)
  })

  it('[OWN-DEC-179] the database refuses a rule that lets a PO Box or Unique ZIP prove coverage', async () => {
    await expect(
      sql`INSERT INTO platform.coverage_rules (rule_set, zip5, disposition, counties, zip_category, reason)
          VALUES (1, '99990', 'in_coverage', ARRAY['KY:Jefferson'], 'po_box', 'dataset_one_county')`.execute(t.db),
    ).rejects.toThrow(/coverage_rules_mailing_zip_unknown/)
  })
})

describe('the four outcomes from the dataset alone, verification NOT CONFIGURED (TSK-0127, HH-CUS-03, T07)', () => {
  const cases = [
    [DATASET_ZIPS.served, 'in_coverage', 'dataset_one_county', false],
    [`${DATASET_ZIPS.servedIndiana}-1234`, 'in_coverage', 'dataset_one_county', false],
    [DATASET_ZIPS.severalCounties, 'boundary', 'dataset_several_counties', false],
    [DATASET_ZIPS.severalCountiesIndiana, 'boundary', 'dataset_several_counties', false],
    [DATASET_ZIPS.poBox, 'unknown', 'mailing_zip', true],
    [DATASET_ZIPS.unique, 'unknown', 'mailing_zip', true],
    [SYNTHETIC_ZIPS.unlisted, 'unknown', 'not_listed', false],
  ] as const

  it('[HH-CUS-03][T07][OWN-DEC-179] each ZIP answers its code and the owner’s exact message', async () => {
    for (const [zip, outcome, , mailing] of cases) {
      const res = await check(zip)
      expect(res.statusCode, zip).toBe(200)
      expect(res.json(), zip).toEqual({
        zip: zip.slice(0, 5),
        outcome,
        code: COVERAGE_CODE[outcome],
        configured: true,
        message: MESSAGES[outcome],
        note: mailing ? MAILING_NOTE : null,
      })
      expect(res.headers['cache-control']).toBe('private, no-store')
    }
  })

  it('[OWN-DEC-179] the lookup names the reason, the ZIP category and the counties', async () => {
    expect(await lookupCoverage(t.db, DATASET_ZIPS.severalCounties)).toEqual({
      outcome: 'boundary',
      ruleSet: 1,
      reason: 'dataset_several_counties',
      zipCategory: null,
      counties: ['KY:Jefferson', 'KY:Oldham'],
    })
    expect(await lookupCoverage(t.db, DATASET_ZIPS.unique)).toMatchObject({
      outcome: 'unknown',
      reason: 'mailing_zip',
      zipCategory: 'unique',
    })
    expect(await lookupCoverage(t.db, 'not-a-zip')).toMatchObject({ outcome: 'unknown', reason: 'not_listed' })
  })

  it('[T07] no outcome or note mentions an appointment, a date, a price or a travel charge', () => {
    for (const m of [...Object.values(MESSAGES), MAILING_NOTE]) expect(m).not.toMatch(APPOINTMENT_WORDS)
  })

  it('[HH-CUS-03][HH-INT-16][T07] every outcome still submits; request and property store it with its reason', async () => {
    for (const [i, [zip, outcome, reason]] of cases.entries()) {
      const sent = await submit(zip.slice(0, 5), `synthetic-coverage-key-2${i}00`)
      expect(sent.statusCode, zip).toBe(201)
      expect(await stored(sent.json().reference), zip).toEqual({
        request: outcome,
        requestSet: 1,
        requestReason: reason,
        property: outcome,
        propertySet: 1,
        propertyReason: reason,
      })
    }
  })

  it('[HH-CUS-03] an invalid ZIP format is a correction, not an outcome', async () => {
    for (const zip of ['4000', 'abcde', '400001', '40000-1']) {
      const res = await check(zip)
      expect(res.statusCode, zip).toBe(400)
      expect(res.json().error.code).toBe('VALIDATION_FAILED')
      expect(res.json().error.fieldErrors[0].field).toBe('querystring.zip')
      expect(res.json().outcome).toBeUndefined()
    }
    expect((await app.inject({ url: '/api/v1/public/coverage' })).statusCode).toBe(400)
  })

  it('[HH-CUS-03][T07] a failed lookup stores unknown and keeps the submission transaction usable', async () => {
    const result = await inTx(async (tx) => {
      const r = await coverageOrUnknown(tx, DATASET_ZIPS.served, async (db) => {
        await sql`SELECT * FROM platform.no_such_table`.execute(db)
        return lookupCoverage(db, DATASET_ZIPS.served)
      })
      const after = await lookupCoverage(tx, DATASET_ZIPS.served)
      return { r, after }
    })
    expect(result.r).toEqual({
      outcome: 'unknown',
      ruleSet: null,
      reason: 'lookup_failed',
      zipCategory: null,
      counties: [],
    })
    expect(result.after).toMatchObject({ outcome: 'in_coverage', ruleSet: 1, reason: 'dataset_one_county' })
  })
})

describe('verifying the dataset against a Census-format file (TSK-0022, TSK-0127, OWN-DEC-37, OWN-DEC-179)', () => {
  it('[OWN-DEC-179][RULE-NO-INVENTED-FACTS] the import verifies the dataset, reports every discrepancy, and is only proposed', async () => {
    const summary = await importSynthetic()
    expect(summary.version).toBe(2)
    expect(summary.datasetVersion).toBe(1)
    // The synthetic file lists none of the dataset's ZIPs: the 117 physical ones are EDGE (source_missing), the 52
    // mailing ZIPs stay UNKNOWN; its own ZIPs are decided by the file and reported as missing from the dataset.
    expect(summary.counts).toEqual({ in_coverage: 2, boundary: 118, out_of_coverage: 1, unknown: 52 })
    const kinds = summary.discrepancies.reduce<Record<string, number>>(
      (acc, d) => ({ ...acc, [d.kind]: (acc[d.kind] ?? 0) + 1 }),
      {},
    )
    expect(kinds).toEqual({ missing_from_source: 117, missing_from_dataset: 3 })
    expect(summary.discrepancies.filter((d) => d.kind === 'missing_from_dataset').map((d) => d.zip5)).toEqual([
      '99901',
      '99902',
      '99903',
    ])
    // Still proposed: the checker keeps answering from the active dataset set.
    expect((await check(DATASET_ZIPS.served)).json().outcome).toBe('in_coverage')
    expect((await check(SYNTHETIC_ZIPS.inCoverage)).json().outcome).toBe('unknown')
    const set = await t.db
      .selectFrom('platform.coverage_rule_sets')
      .selectAll()
      .where('version', '=', summary.version)
      .executeTakeFirstOrThrow()
    expect(set).toMatchObject({ status: 'proposed', dataset_version: 1, verification: 'source_file' })
    expect(set.source_sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('[OWN-DEC-37] approval needs a decision; the verified set supersedes the dataset set', async () => {
    await expect(inTx((tx) => approveRuleSet(tx, { version: 2, approvedBy: 'owner', sources: [] }))).rejects.toThrow(
      RuleSetError,
    )
    await inTx((tx) => approveRuleSet(tx, { version: 2, approvedBy: 'owner', sources: ['OWN-DEC-179'] }))
    const sets = await t.db
      .selectFrom('platform.coverage_rule_sets')
      .select(['version', 'status'])
      .orderBy('version')
      .execute()
    expect(sets).toEqual([
      { version: 1, status: 'superseded' },
      { version: 2, status: 'active' },
    ])
  })

  it('[HH-CUS-03][T07] served, boundary, outside and unknown each answer with the owner’s exact message', async () => {
    for (const [zip, outcome, reason] of [
      [SYNTHETIC_ZIPS.inCoverage, 'in_coverage', 'source_inside'],
      [`${SYNTHETIC_ZIPS.boundary}-1234`, 'boundary', 'source_partly_inside'],
      [SYNTHETIC_ZIPS.outside, 'out_of_coverage', 'source_outside'],
      [SYNTHETIC_ZIPS.unlisted, 'unknown', 'not_listed'],
      [DATASET_ZIPS.served, 'boundary', 'source_missing'],
      [DATASET_ZIPS.poBox, 'unknown', 'mailing_zip'],
    ] as const) {
      const res = await check(zip)
      expect(res.statusCode, zip).toBe(200)
      expect(res.json(), zip).toMatchObject({
        zip: zip.slice(0, 5),
        outcome,
        code: COVERAGE_CODE[outcome],
        configured: true,
        message: MESSAGES[outcome],
      })
      expect((await lookupCoverage(t.db, zip)).reason, zip).toBe(reason)
    }
  })

  it('[HH-CUS-03][HH-INT-16][T07] an outside ZIP still submits, and the request keeps the set it was checked against', async () => {
    const sent = await submit(SYNTHETIC_ZIPS.outside, 'synthetic-coverage-key-3000')
    expect(sent.statusCode).toBe(201)
    expect(await stored(sent.json().reference)).toEqual({
      request: 'out_of_coverage',
      requestSet: 2,
      requestReason: 'source_outside',
      property: 'out_of_coverage',
      propertySet: 2,
      propertyReason: 'source_outside',
    })
    await expect(
      inTx((tx) => approveRuleSet(tx, { version: 1, approvedBy: 'owner', sources: ['OWN-DEC-179'] })),
    ).rejects.toThrow(/superseded/)
  })

  it('[ENT-CoverageRule] rules and rule sets are never edited or deleted', async () => {
    await expect(sql`UPDATE platform.coverage_rules SET disposition = 'in_coverage'`.execute(t.db)).rejects.toThrow()
    await expect(sql`DELETE FROM platform.coverage_rules`.execute(t.db)).rejects.toThrow()
    await expect(sql`DELETE FROM platform.coverage_rule_sets`.execute(t.db)).rejects.toThrow()
    await expect(
      sql`UPDATE platform.coverage_rule_sets SET source = 'x' WHERE version = 2`.execute(t.db),
    ).rejects.toThrow(/proposed -> active -> superseded/)
    await expect(
      sql`UPDATE platform.coverage_rule_sets SET status = 'active' WHERE version = 1`.execute(t.db),
    ).rejects.toThrow()
  })
})

describe('the ZIP check behind the staging access gate (TSK-0022, TSK-0127, OWN-DEC-73, OWN-DEC-88)', () => {
  it('[OWN-DEC-73][HH-CUS-03] the gate asks for credentials; with them the check answers', async () => {
    const gated = await buildApp({ config: testConfig({ ACCESS_GATE_USERS: GATE_USERS }), api: { db: t.db } })
    try {
      const url = `/api/v1/public/coverage?zip=${SYNTHETIC_ZIPS.inCoverage}`
      expect((await gated.inject({ url })).statusCode).toBe(401)
      const res = await gated.inject({ url, headers: { authorization: basic('tester1', gatePassword(2)) } })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({ outcome: 'in_coverage', code: 'SERVED' })
    } finally {
      await gated.close()
    }
  })
})
