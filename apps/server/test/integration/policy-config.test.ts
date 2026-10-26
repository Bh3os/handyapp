// Configuration against the migrated database (TSK-0007; ENT-PolicyVersion, RULE-DECIDED-VALUES-ACTIVE,
// RULE-NO-INVENTED-FACTS, RULE-AI-WAVE2, HH-FIN-01, T02, T58). Each test file gets its own fresh database.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  aiModule,
  CONFIG_KEYS,
  type ConfigKey,
  loadConfig,
  policyVersion,
  recordPolicyVersion,
  requireConfigured,
} from '../../src/platform/config/index.js'

const KG = new URL('../../../../kg/', import.meta.url)
const nodeFile = (id: string) =>
  readdirSync(KG, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => new URL(`${d.name}/${id}.md`, KG))
    .find((u) => existsSync(u))
const nodeStatus = (id: string) => /^status:\s*(\S+)/m.exec(readFileSync(nodeFile(id) as URL, 'utf8'))?.[1]

let t: TestDatabase
beforeAll(async () => {
  t = await createTestDatabase()
})
afterAll(async () => {
  await t?.drop()
})

describe('seeded configuration (TSK-0007, RULE-DECIDED-VALUES-ACTIVE)', () => {
  it('every key has exactly one active version, and every active value matches its shape', async () => {
    const config = await loadConfig(t.db)
    const entries = config.entries()
    expect(entries.map((e) => e.key)).toEqual(Object.keys(CONFIG_KEYS))
    // TSK-0119: messages.automatic version 2 (migration 0065, OWN-DEC-152); TSK-0121 adds the reminders as version 3
    // (migration 0075, OWN-DEC-153).
    // TSK-0123: migration 0066 recorded the decided business time zone as its second version (OWN-DEC-159).
    // Every key is at version 1 except these: TSK-0121 (migration 0075) recorded the automatic reminder cadences
    // (OWN-DEC-153) and messages.automatic version 3; TSK-0144 (migration 0073) recorded the owner's sign-off of
    // estimate terms v1.0 as its second version (OWN-DEC-187); TSK-0091 (migration 0097) recorded the unpaid-invoice
    // reminders (OWN-DEC-210): reminders.cadences version 3 and messages.automatic version 4. TSK-0139 (migration 0104)
    // recorded the decided window hours as request.window_hours version 2 (OWN-DEC-170). TSK-0125 (migration 0105)
    // recorded the customer's choice of one discount and how eligibility is verified (OWN-DEC-165): discount.rule and
    // discount.eligibility_verification version 2. TSK-0140 (migration 0115) recorded the cancellation rules of
    // OWN-DEC-161, OWN-DEC-163 and OWN-DEC-195 as cancellation.rules version 2. TSK-0124 (migration 0119) recorded the
    // decided 24-hour guest link and the reissue limit (OWN-DEC-160, OWN-DEC-198 F5) as access.grants and
    // access.recovery version 2. TSK-0133 (migration 0126) recorded the request form's SMS opt-in in the owner's wording
    // (OWN-DEC-190) and the SMS terms with the real message types: legal.sms_disclosure and legal.sms_terms version 2.
    // TSK-0153 (migration 0135) recorded the 30-second refresh approved as built (OWN-DEC-192 F7) as portal.refresh
    // version 2.
    const expected: Record<string, number> = {
      'access.grants': 2,
      'access.recovery': 2,
      'cancellation.rules': 2,
      'messages.automatic': 4,
      'business.timezone': 2,
      'reminders.cadences': 3,
      'legal.estimate_terms': 2,
      'request.window_hours': 2,
      'discount.rule': 2,
      'discount.eligibility_verification': 2,
      'legal.sms_disclosure': 2,
      'legal.sms_terms': 2,
      'portal.refresh': 2,
    }
    for (const e of entries) expect(e.version, e.key).toBe(expected[e.key] ?? 1)
  })

  it('every seeded value carries source ids that are nodes of the graph', async () => {
    const rows = await t.db.selectFrom('platform.policy_version').select(['key', 'source_ids']).execute()
    for (const r of rows) {
      expect(r.source_ids.length, r.key).toBeGreaterThan(0)
      for (const id of r.source_ids) expect(nodeFile(id), `${r.key} cites ${id}`).toBeDefined()
    }
  })

  it('[HH-EST-05][OWN-DEC-192] no key approved as built is still PROPOSED; only keys no decision covers are', async () => {
    const config = await loadConfig(t.db)
    // The Rules Review approved F7 as built (OWN-DEC-192) and decided the link values in F5 (OWN-DEC-198).
    for (const key of ['portal.refresh', 'access.grants', 'access.recovery'] as const) {
      const entry = config.get(key)
      expect(entry, key).toMatchObject({ state: 'CONFIGURED', proposed: false })
      expect(
        entry.sourceIds.some((id) => id === 'OWN-DEC-192' || id === 'OWN-DEC-198'),
        key,
      ).toBe(true)
    }
    expect(config.get('portal.refresh')).toMatchObject({ version: 2, value: { pollSeconds: 30 } })
    expect(await policyVersion(t.db, 'portal.refresh', 1)).toMatchObject({ version: 1, proposed: true })
    // What stays PROPOSED: values no rule of the Rules Review covers, and the legal drafts awaiting the attorney.
    expect(
      config
        .entries()
        .filter((e) => e.state === 'CONFIGURED' && e.proposed)
        .map((e) => e.key)
        .sort(),
    ).toEqual([
      'legal.privacy_notice',
      'legal.sms_disclosure',
      'legal.sms_terms',
      'legal.website_terms',
      'owner_approval.discretionary_credit',
      'payment.square_link_hosts',
      'verification.limits',
    ])
  })

  it('seeds every fact the task names, and an open fact only as NOT CONFIGURED', async () => {
    const task = readFileSync(nodeFile('TSK-0007') as URL, 'utf8')
    const uses = [...(/^\s*uses:(.*)$/m.exec(task)?.[1] ?? '').matchAll(/\[\[(FACT-[A-Z0-9-]+)\]\]/g)].map(
      (m) => m[1] as string,
    )
    expect(uses.length).toBeGreaterThan(5)
    const config = await loadConfig(t.db)
    const entries = config.entries()
    for (const fact of uses) {
      const citing = entries.filter((e) => e.sourceIds.includes(fact))
      expect(citing.length, `${fact} is seeded`).toBeGreaterThan(0)
      if (nodeStatus(fact) === 'open')
        for (const e of citing) expect(e.state, `${e.key} (${fact})`).toBe('NOT_CONFIGURED')
    }
    // A configured value never cites only open facts or questions.
    for (const e of entries.filter((x) => x.state === 'CONFIGURED')) {
      expect(
        e.sourceIds.some((id) => nodeStatus(id) !== 'open'),
        e.key,
      ).toBe(true)
    }
  })

  it('reading an open fact yields NOT_CONFIGURED (FACT-BUSINESS-ADDRESS, FACT-PUBLIC-CONTACT)', async () => {
    const config = await loadConfig(t.db)
    // TSK-0140: the numbers of the repeated-cancellation review are not decided (OQ-CANCELLATION-RULES-DETAILS).
    for (const key of ['business.mailing_address', 'business.public_contact', 'cancellation.repeat_review'] as const) {
      expect(config.get(key)).toMatchObject({ state: 'NOT_CONFIGURED', version: 1 })
      expect(() => requireConfigured(config.get(key))).toThrow(/NOT CONFIGURED/)
    }
  })

  it('holds the decided values, money in integer cents (HH-FIN-01, OWN-DEC-104, T58)', async () => {
    const c = await loadConfig(t.db)
    const v = <K extends ConfigKey>(k: K) => requireConfigured(c.get(k)).value
    expect(v('deposit.rule')).toEqual({
      comparison: 'greater_than',
      thresholdCents: 100000,
      percentBps: 2000,
      base: 'final_total_after_discount',
      rounding: 'half_up',
    })
    // TSK-0125 (OWN-DEC-165): one 10% discount per job, chosen by the customer; how eligibility is verified.
    expect(v('discount.rule')).toEqual({
      percentBps: 1000,
      categories: ['military', 'senior', 'returning_customer'],
      perJob: 'one_customer_choice',
      appliedTo: 'subtotal',
    })
    expect(v('discount.eligibility_verification')).toEqual({
      military: { eligible: ['service_member', 'veteran', 'military_spouse'], check: 'staff_visual' },
      senior: { fromAge: 60, check: 'staff_visual' },
      returningCustomer: { withinMonths: 12, check: 'matched_completed_jobs' },
      documentsKept: false,
      ownerReview: true,
    })
    expect(v('tax.mode')).toEqual({ mode: 'no_tax_line' })
    expect(v('estimate.validity')).toEqual({ days: 14, from: 'published' })
    // TSK-0082 (FACT-CHANGE-ORDER-VALIDITY, OWN-DEC-168).
    expect(v('change_order.validity')).toEqual({ days: 7, from: 'published' })
    expect(v('estimate.publishing_roles').roles).toEqual(['owner', 'estimator'])
    expect(v('payment.term_default')).toEqual({ term: 'due_on_receipt' })
    expect(v('payment.methods').surcharge).toBe(false)
    expect(v('payment.instructions')).toEqual({
      placeholder: true,
      zelle: '[Payment email or phone]',
      cashApp: '[$Cashtag]',
      chime: '[Payment handle or details]',
      checkPayee: '[Payee name]',
    })
    // TSK-0140 (OWN-DEC-161, OWN-DEC-163, OWN-DEC-195): version 2 states how the capped fee and the exceptions apply.
    expect(v('cancellation.rules')).toEqual({
      rescheduleFree: true,
      noticeHours: 24,
      lateCancellationCents: 5000,
      depositBelowFee: 'keep_deposit_only',
      noDepositInvoice: 'only_if_disclosed_and_accepted',
      estimateVisits: 'never_charged',
      rescheduleInitiator: 'required',
      feeEnforcement: 'attorney_approval_pending',
    })
    expect(v('contact.hours')).toEqual({ days: 'every_day', open: '08:00', close: '22:00' })
    // TSK-0114 (OWN-DEC-148): a recurring schedule change applies beyond 24 hours; inside it, the cancellation rules.
    expect(v('repeat_service.change_notice')).toEqual({ hours: 24, withinNotice: 'cancellation_rules' })
    // TSK-0121 (OWN-DEC-153, FACT-REMINDER-CADENCES): one automatic 3-day estimate reminder, one automatic 3-day question
    // reminder ("Closed—no response" 24 hours after it was actually sent, OWN-DEC-208), the 24-hour appointment reminder.
    expect(v('reminders.cadences')).toEqual({
      unansweredEstimate: { afterDeliveryHours: 72, release: 'automatic' },
      unansweredQuestion: { afterDeliveryHours: 72, closeAfterReminderHours: 24, release: 'automatic' },
      appointment: { hoursBefore: 24, release: 'automatic' },
      satisfaction: { daysAfterCompletion: 2, release: 'staff' },
      unpaidInvoice: { firstDaysAfterDue: 3, secondDaysAfterDue: 7, release: 'automatic', followUp: 'staff' },
      repeatService: { schedule: 'customer_agreed', release: 'staff' },
    })
    // TSK-0122 (OWN-DEC-154, OWN-DEC-207, OWN-DEC-190): emails at any hour, texts in the recipient's permitted hours,
    // the unknown-zone fallback 9 AM–9 PM Eastern, and live texts off until A2P 10DLC.
    expect(v('messages.delivery_hours')).toEqual({ email: 'any_hour', text: 'recipient_permitted_hours' })
    expect(v('sms.unknown_zone_hours')).toEqual({ open: '09:00', close: '21:00', zone: 'America/Kentucky/Louisville' })
    expect(v('sms.live_delivery')).toEqual({ enabled: false })
    // TSK-0115 (HH-OFF-08): no offline action beyond the minimal set until the Owner turns one on.
    expect(v('field.offline_actions')).toEqual({ actions: [] })
    expect(v('request.reopen_period')).toEqual({ days: 30 })
    // TSK-0131 (FACT-MARGIN-TARGET, OWN-DEC-189): the advisory target gross margin per job, 30%.
    expect(v('job_margin.target')).toEqual({ targetBps: 3000 })
    expect(v('response.target')).toEqual({ minutes: 60, countedWithin: 'contact_hours' })
    expect(v('session.timings').oneTimeCodeMinutes).toBe(10)
    expect(v('uploads.limits')).toEqual({
      maxFileBytes: 15 * 1024 * 1024,
      maxRequestPhotos: 10,
      requestPhotoTypes: ['image/jpeg', 'image/png', 'image/webp'],
    })
    expect(v('business.name').documentName).toBe('Handyhub LLC')
  })

  it('[OWN-DEC-159] the business time zone is decided: America/Kentucky/Louisville, no longer PROPOSED (TSK-0123)', async () => {
    const zone = (await loadConfig(t.db)).get('business.timezone')
    expect(zone).toMatchObject({ state: 'CONFIGURED', proposed: false, value: { zone: 'America/Kentucky/Louisville' } })
  })
})

describe('versioned, append-only policy data (TSK-0007, ENT-PolicyVersion)', () => {
  it('a change is a new version citing its source; the old version stays readable for pinned records', async () => {
    const next = await recordPolicyVersion(t.db, {
      key: 'estimate.validity',
      value: { days: 21, from: 'published' },
      sourceIds: ['OWN-DEC-34'],
      changedBy: 'staff-synthetic-owner',
      reason: 'Synthetic test change',
    })
    expect(next).toBe(2)
    const c = await loadConfig(t.db)
    expect(c.get('estimate.validity')).toMatchObject({ state: 'CONFIGURED', version: 2, value: { days: 21 } })
    expect(await policyVersion(t.db, 'estimate.validity', 1)).toMatchObject({ version: 1, value: { days: 14 } })
    const statuses = await t.db
      .selectFrom('platform.policy_version')
      .select(['version', 'status'])
      .where('key', '=', 'estimate.validity')
      .orderBy('version')
      .execute()
    expect(statuses).toEqual([
      { version: 1, status: 'superseded' },
      { version: 2, status: 'active' },
    ])
  })

  it('refuses a value that does not match its shape, a change without a source or reason', async () => {
    await expect(
      recordPolicyVersion(t.db, {
        key: 'deposit.rule',
        value: { thresholdCents: 1.5 } as never,
        sourceIds: ['OWN-DEC-104'],
        changedBy: 'x',
        reason: 'x',
      }),
    ).rejects.toThrow()
    await expect(
      recordPolicyVersion(t.db, {
        key: 'tax.mode',
        value: { mode: 'no_tax_line' },
        sourceIds: [],
        changedBy: 'x',
        reason: 'x',
      }),
    ).rejects.toThrow(/source/)
    expect((await loadConfig(t.db)).get('deposit.rule').version).toBe(1)
  })

  it('the database refuses edits and deletes of any version', async () => {
    await expect(
      sql`UPDATE platform.policy_version SET value = '{"mode":"x"}' WHERE key = 'tax.mode'`.execute(t.db),
    ).rejects.toThrow(/append-only/)
    await expect(sql`DELETE FROM platform.policy_version WHERE key = 'tax.mode'`.execute(t.db)).rejects.toThrow(
      /append-only/,
    )
    await expect(
      sql`UPDATE platform.policy_version SET status = 'superseded', changed_by = 'x' WHERE key = 'tax.mode'`.execute(
        t.db,
      ),
    ).rejects.toThrow(/append-only/)
  })

  it('the database refuses a second active version and a configured row without a value', async () => {
    await expect(
      sql`INSERT INTO platform.policy_version (key, version, state, value, source_ids, changed_by)
          VALUES ('tax.mode', 9, 'configured', '{"mode":"no_tax_line"}', ARRAY['OWN-DEC-83'], 'x')`.execute(t.db),
    ).rejects.toThrow(/policy_version_one_active/)
    await expect(
      sql`INSERT INTO platform.policy_version (key, version, state, value, status, source_ids, changed_by)
          VALUES ('tax.mode', 9, 'configured', NULL, 'superseded', ARRAY['OWN-DEC-83'], 'x')`.execute(t.db),
    ).rejects.toThrow(/policy_version_value_matches_state/)
  })
})

describe('AI disabled (TSK-0007, RULE-AI-WAVE2)', () => {
  it('is seeded off, reads as AI_DISABLED, and the database refuses enabling it', async () => {
    expect(aiModule(await loadConfig(t.db))).toEqual({ state: 'AI_DISABLED', enabled: false })
    await expect(
      sql`INSERT INTO platform.policy_version (key, version, state, value, status, source_ids, changed_by)
          VALUES ('ai.module', 2, 'configured', '{"enabled": true}', 'superseded', ARRAY['RULE-AI-WAVE2'], 'x')`.execute(
        t.db,
      ),
    ).rejects.toThrow(/policy_version_ai_disabled/)
    await expect(
      recordPolicyVersion(t.db, {
        key: 'ai.module',
        value: { enabled: true } as never,
        sourceIds: ['RULE-AI-WAVE2'],
        changedBy: 'x',
        reason: 'x',
      }),
    ).rejects.toThrow()
  })
})
