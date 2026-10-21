// ZIP coverage against PostgreSQL 16 (TSK-0022; HH-CUS-03, HH-INT-16, T07, OWN-DEC-37, OWN-DEC-88, OWN-DEC-73). ZIPs,
// files and visitors are synthetic (RULE-SYNTHETIC-DATA).
import { loadServiceSeed, syncServices, withTx, type Tx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { approveRuleSet, importRuleSet, lookupCoverage, RuleSetError } from '../../src/modules/coverage/coverage.js'
import { coverageOrUnknown } from '../../src/modules/requests/submit.js'
import { runWithContext } from '../../src/platform/request-context.js'
import { SYNTHETIC_RELATIONSHIP_FILE, SYNTHETIC_ZIPS } from '../fixtures/coverage.js'
import { basic, GATE_USERS, gatePassword, testConfig } from '../fixtures/env.js'

const MESSAGES = {
  in_coverage: 'We serve your area. Tell us about your project.',
  boundary: 'You may be within our service area. Send your request and we’ll confirm the address.',
  out_of_coverage: 'Outside our usual coverage? You can still request an estimate—we’ll check whether we can help.',
  unknown: "We couldn't confirm this ZIP. You can still submit your request for review.",
}
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
      privacyNoticeVersion: 'draft-test-1',
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
      'p.coverage_result as property',
      'p.coverage_rule_set as propertySet',
    ])
    .where('r.reference', '=', reference)
    .executeTakeFirstOrThrow()

describe('coverage area configuration (TSK-0022, OWN-DEC-37)', () => {
  it('[OWN-DEC-37] coverage.area is the eleven whole counties, and no ZIP is seeded', async () => {
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
    expect(area.source_ids).toContain('OWN-DEC-37')
    const rules = await sql<{ n: string }>`SELECT count(*) AS n FROM platform.coverage_rules`.execute(t.db)
    expect(rules.rows[0]?.n).toBe('0')
  })
})

describe('the ZIP check before any rule set is approved (TSK-0022, HH-CUS-03, OQ-SERVICE-AREA-ZIPS)', () => {
  it('[HH-CUS-03][T07] every ZIP is unknown while NOT CONFIGURED, and a request is still saved as unknown', async () => {
    const res = await check(SYNTHETIC_ZIPS.inCoverage)
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      zip: SYNTHETIC_ZIPS.inCoverage,
      outcome: 'unknown',
      configured: false,
      message: MESSAGES.unknown,
    })
    const sent = await submit(SYNTHETIC_ZIPS.inCoverage, 'synthetic-coverage-key-0001')
    expect(sent.statusCode).toBe(201)
    expect(await stored(sent.json().reference)).toEqual({
      request: 'unknown',
      requestSet: null,
      property: 'unknown',
      propertySet: null,
    })
  })

  it('[HH-CUS-03][T07] an invalid ZIP format is a correction, not an outcome', async () => {
    for (const zip of ['4000', 'abcde', '400001', '40000-1']) {
      const res = await check(zip)
      expect(res.statusCode, zip).toBe(400)
      expect(res.json().error.code).toBe('VALIDATION_FAILED')
      expect(res.json().error.fieldErrors[0].field).toBe('querystring.zip')
      expect(res.json().outcome).toBeUndefined()
    }
    expect((await app.inject({ url: '/api/v1/public/coverage' })).statusCode).toBe(400)
  })

  it('[OWN-DEC-37][RULE-NO-INVENTED-FACTS] an imported rule set is only proposed: the check stays unknown', async () => {
    const summary = await importSynthetic()
    expect(summary.counts).toEqual({ in_coverage: 2, boundary: 1, out_of_coverage: 1 })
    expect(summary.inArea.map((r) => [r.zip5, r.disposition, r.counties])).toEqual([
      ['99901', 'in_coverage', ['KY:Jefferson']],
      ['99902', 'boundary', ['KY:Oldham']],
      ['99903', 'in_coverage', ['IN:Washington']],
    ])
    expect((await check(SYNTHETIC_ZIPS.inCoverage)).json().outcome).toBe('unknown')
    const set = await t.db
      .selectFrom('platform.coverage_rule_sets')
      .selectAll()
      .where('version', '=', summary.version)
      .executeTakeFirstOrThrow()
    expect(set.status).toBe('proposed')
    expect(set.source_sha256).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('the four outcomes from an approved rule set (TSK-0022, HH-CUS-03, T07)', () => {
  beforeAll(async () => {
    await expect(inTx((tx) => approveRuleSet(tx, { version: 1, approvedBy: 'owner', sources: [] }))).rejects.toThrow(
      RuleSetError,
    )
    await inTx((tx) => approveRuleSet(tx, { version: 1, approvedBy: 'owner', sources: ['OWN-DEC-999'] }))
  })

  it('[HH-CUS-03][T07] served, boundary, outside and unknown each answer with the owner’s exact message', async () => {
    for (const [zip, outcome] of [
      [SYNTHETIC_ZIPS.inCoverage, 'in_coverage'],
      [`${SYNTHETIC_ZIPS.boundary}-1234`, 'boundary'],
      [SYNTHETIC_ZIPS.outside, 'out_of_coverage'],
      [SYNTHETIC_ZIPS.unlisted, 'unknown'],
    ] as const) {
      const res = await check(zip)
      expect(res.statusCode, zip).toBe(200)
      expect(res.json(), zip).toEqual({ zip: zip.slice(0, 5), outcome, configured: true, message: MESSAGES[outcome] })
      expect(res.headers['cache-control']).toBe('private, no-store')
    }
  })

  it('[T07] no outcome mentions an appointment, a date, a price or a travel charge', () => {
    for (const m of Object.values(MESSAGES)) expect(m).not.toMatch(APPOINTMENT_WORDS)
  })

  it('[HH-CUS-03][HH-INT-16][T07] every outcome still submits, and the request stores it with its rule set', async () => {
    for (const [i, [zip, outcome]] of [
      [SYNTHETIC_ZIPS.inCoverage, 'in_coverage'],
      [SYNTHETIC_ZIPS.boundary, 'boundary'],
      [SYNTHETIC_ZIPS.outside, 'out_of_coverage'],
      [SYNTHETIC_ZIPS.unlisted, 'unknown'],
    ].entries()) {
      const sent = await submit(zip as string, `synthetic-coverage-key-1${i}00`)
      expect(sent.statusCode, zip).toBe(201)
      expect(await stored(sent.json().reference)).toEqual({
        request: outcome,
        requestSet: 1,
        property: outcome,
        propertySet: 1,
      })
    }
  })

  it('[HH-CUS-03][T07] a failed lookup stores unknown and keeps the submission transaction usable', async () => {
    const result = await inTx(async (tx) => {
      const r = await coverageOrUnknown(tx, SYNTHETIC_ZIPS.inCoverage, async (db) => {
        await sql`SELECT * FROM platform.no_such_table`.execute(db)
        return { outcome: 'in_coverage', ruleSet: 1 }
      })
      const after = await lookupCoverage(tx, SYNTHETIC_ZIPS.inCoverage)
      return { r, after }
    })
    expect(result).toEqual({ r: { outcome: 'unknown', ruleSet: null }, after: { outcome: 'in_coverage', ruleSet: 1 } })
  })

  it('[OWN-DEC-37] a newer approved set supersedes the old one; records keep the set they were checked against', async () => {
    const next = await importSynthetic()
    await inTx((tx) => approveRuleSet(tx, { version: next.version, approvedBy: 'owner', sources: ['OWN-DEC-999'] }))
    const sets = await t.db
      .selectFrom('platform.coverage_rule_sets')
      .select(['version', 'status'])
      .orderBy('version')
      .execute()
    expect(sets).toEqual([
      { version: 1, status: 'superseded' },
      { version: 2, status: 'active' },
    ])
    expect(await lookupCoverage(t.db, SYNTHETIC_ZIPS.boundary)).toEqual({ outcome: 'boundary', ruleSet: 2 })
    await expect(
      inTx((tx) => approveRuleSet(tx, { version: 1, approvedBy: 'owner', sources: ['OWN-DEC-999'] })),
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

describe('the ZIP check behind the staging access gate (TSK-0022, OWN-DEC-73, OWN-DEC-88)', () => {
  it('[OWN-DEC-73][HH-CUS-03] the gate asks for credentials; with them the check answers', async () => {
    const gated = await buildApp({ config: testConfig({ ACCESS_GATE_USERS: GATE_USERS }), api: { db: t.db } })
    try {
      const url = `/api/v1/public/coverage?zip=${SYNTHETIC_ZIPS.inCoverage}`
      expect((await gated.inject({ url })).statusCode).toBe(401)
      const res = await gated.inject({ url, headers: { authorization: basic('tester1', gatePassword(2)) } })
      expect(res.statusCode).toBe(200)
      expect(res.json().outcome).toBe('in_coverage')
    } finally {
      await gated.close()
    }
  })
})
