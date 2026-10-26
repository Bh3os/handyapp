// The data inventory and the retention schedule's categories (TSK-0099; HH-PRIV-01, HH-DATA-09,
// FACT-RETENTION-SCHEDULE, OWN-DEC-70, OWN-DEC-142, RULE-NO-INVENTED-FACTS; TSK-0138: OWN-DEC-177).
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { LABEL_FAMILIES } from '@handyhub/i18n'
import { describe, expect, it } from 'vitest'
import {
  CATEGORY_DEFINITIONS,
  HOLD_CHECKS,
  PERIOD_CATEGORIES,
  RETENTION_CATEGORIES,
  holdChecksFor,
} from '../../src/modules/retention/index.js'
import { DATA_CLASSES, TABLES, endOfLife, renderDataInventory } from '../../src/modules/retention/inventory.js'
import { ConfigShapeError, parseValue } from '../../src/platform/config/index.js'

const KG = new URL('../../../../kg/', import.meta.url)
const nodeExists = (id: string) =>
  readdirSync(KG, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .some((d) => existsSync(new URL(`${d.name}/${id}.md`, KG)))

describe('data inventory (TSK-0099, HH-PRIV-01)', () => {
  it('[HH-PRIV-01] docs/data-inventory.md is generated from the annotations and up to date', () => {
    const committed = readFileSync(new URL('../../../../docs/data-inventory.md', import.meta.url), 'utf8')
    expect(committed).toBe(renderDataInventory())
  })

  it('[HH-PRIV-01] the generated schema lists exactly the annotated tables', () => {
    const schema = readFileSync(new URL('../../../../packages/db/src/schema.ts', import.meta.url), 'utf8')
    const tables = [
      ...(/export interface Database \{([\s\S]*?)\n\}/.exec(schema)?.[1] ?? '').matchAll(/'([a-z_.]+)':/g),
    ]
      .map((m) => m[1])
      .sort()
    expect(tables.length).toBeGreaterThan(70)
    expect(Object.keys(TABLES).sort()).toEqual(tables)
  })

  it('[HH-PRIV-01] every table names its classes, categories and an end of life; the ten decided classes are listed', () => {
    for (const [table, a] of Object.entries(TABLES)) {
      expect(a.holds.length, table).toBeGreaterThan(5)
      expect(a.classes.length, table).toBeGreaterThan(0)
      expect(a.categories.length, table).toBeGreaterThan(0)
      expect(endOfLife(a), table).toMatch(/\S/)
    }
    const decided = Object.values(DATA_CLASSES).filter((c) => !c.proposed)
    expect(decided.map((c) => c.name)).toEqual([
      'Contact',
      'Service address',
      'Interior and work photos',
      'Access secret',
      'Estimate and approval',
      'Payment reference',
      'Incident',
      'Worker timestamps',
      'Analytics',
      'Logs and audit',
    ])
    // HH-DATA-09: issued and accepted evidence is archived, voided or corrected, never deleted.
    for (const t of ['estimating.approvals', 'work.job_scope_snapshots'] as const)
      expect(endOfLife(TABLES[t])).toMatch(/^Archive, Void or audited correction/)
    // TSK-0135 (OWN-DEC-164): audit entries are never edited; past the period, Archive or the Owner's deletion.
    expect(endOfLife(TABLES['platform.audit_events'])).toMatch(
      /^Never edited; .*audit-retention workflow; never automatic$/,
    )
    // RULE-NO-INVENTED-FACTS: data the schedule does not name is NOT CONFIGURED, never given a period.
    expect(endOfLife(TABLES['platform.jobs'])).toMatch(/^NOT CONFIGURED/)
    expect(endOfLife(TABLES['crm.access_code_reveals'])).toMatch(/^NOT CONFIGURED/)
    // TSK-0138 (OWN-DEC-177): staff accounts, consent records and expired sessions go to the Owner's review; settings
    // history is kept while referenced.
    expect(TABLES['identity.staff_users'].categories).toEqual(['staff_accounts'])
    expect(TABLES['platform.consent_records'].categories).toEqual(['consent_records'])
    expect(TABLES['identity.staff_sessions'].categories).toEqual(['sessions_and_links'])
    for (const t of ['identity.staff_users', 'platform.consent_records', 'identity.staff_sessions'] as const)
      expect(endOfLife(TABLES[t]), t).toMatch(
        /^Owner's deletion review after the period; nothing deleted automatically/,
      )
    expect(endOfLife(TABLES['platform.message_templates'])).toMatch(/^Kept while retained records depend on it/)
  })

  it('[HH-PRIV-01] the document names every category, its configuration key and the vendors; no period is invented', () => {
    const doc = renderDataInventory()
    for (const id of RETENTION_CATEGORIES) expect(doc).toContain(`\`${id}\``)
    for (const id of PERIOD_CATEGORIES) expect(doc).toContain(`\`${CATEGORY_DEFINITIONS[id].configKey}\``)
    for (const v of ['Render', 'Cloudflare R2', 'Bird', 'Resend', 'Square']) expect(doc).toContain(v)
    // Every number of years in the document is one of the decided periods (2, 5, 7 or 10; the withdrawn 1-year rule),
    // and every number of days one of OWN-DEC-177's (30 and 90).
    const years = [...doc.matchAll(/(\d+)[- ]years?\b/g)].map((m) => Number(m[1]))
    expect(years.length).toBeGreaterThan(0)
    for (const y of years) expect([1, 2, 5, 7, 10]).toContain(y)
    const days = [...doc.matchAll(/(\d+)[- ]days?\b/g)].map((m) => Number(m[1]))
    expect(days.sort()).toEqual([30, 90])
  })
})

/** What starts each period (the seeded `after` values, migration 0056). */
const AFTER: Record<string, string> = {
  requests_not_converted: 'request_closed',
  unaccepted_estimates: 'estimate_expired_or_closed',
  customer_profiles: 'last_completed_service',
  accepted_agreements: 'final_job_closeout',
  financial_records: 'tax_return_filed_or_tax_paid',
  job_records: 'job_closeout',
  safety_records: 'closure',
  // TSK-0138 (OWN-DEC-177, migration 0108).
  staff_accounts: 'staff_departure',
  consent_records: 'last_relevant_use',
}

describe('retention categories (TSK-0099, FACT-RETENTION-SCHEDULE)', () => {
  it('[HH-PRIV-01] the categories, hold checks and record types have staff labels', () => {
    expect([...LABEL_FAMILIES.retentionCategory]).toEqual([...RETENTION_CATEGORIES])
    expect([...LABEL_FAMILIES.retentionPeriodCategory]).toEqual([...PERIOD_CATEGORIES])
    expect([...LABEL_FAMILIES.retentionHoldCheck]).toEqual([...HOLD_CHECKS])
    expect([...LABEL_FAMILIES.retentionNoPeriod]).toEqual(
      RETENTION_CATEGORIES.filter((c) => CATEGORY_DEFINITIONS[c].configKey === null),
    )
  })

  it('[HH-PRIV-01] every category cites graph nodes; the decided years are the shapes’ minimum', () => {
    for (const id of RETENTION_CATEGORIES) {
      const d = CATEGORY_DEFINITIONS[id]
      expect(d.id).toBe(id)
      for (const s of d.sources) expect(nodeExists(s), `${id} cites ${s}`).toBe(true)
      if (d.configKey === null) {
        expect(d.decidedYears, id).toBeNull()
        expect(d.scan, id).toBe('no_period')
        continue
      }
      // TSK-0138: settings history has no period; technical logs and expired sessions count calendar days.
      if (d.configKey === 'retention.settings_history') {
        expect(d.scan, id).toBe('while_referenced')
        expect([d.decidedYears, d.decidedDays], id).toEqual([null, undefined])
        continue
      }
      if (d.configKey === 'retention.technical_logs') {
        expect(d.decidedDays, id).toBe(90)
        const logs = (days: number) => ({ days, after: 'logged', securityEvidenceKeptLonger: true })
        expect(parseValue(d.configKey, logs(90))).toEqual(logs(90))
        expect(() => parseValue(d.configKey as 'retention.technical_logs', logs(89))).toThrow(ConfigShapeError)
        continue
      }
      if (d.configKey === 'retention.sessions_and_links') {
        // "up to 30 days": the decided days are the most the value accepts (PROPOSED).
        expect(d.decidedDays, id).toBe(30)
        const links = (days: number) => ({
          days,
          after: 'expired_or_ended',
          afterPeriod: 'owner_deletion_review',
          automaticDeletion: false,
          holdsKeepRecords: true,
        })
        expect(parseValue(d.configKey, links(30))).toEqual(links(30))
        expect(parseValue(d.configKey, links(7))).toEqual(links(7))
        expect(() => parseValue(d.configKey as 'retention.sessions_and_links', links(31))).toThrow(ConfigShapeError)
        expect(() =>
          parseValue(d.configKey as 'retention.sessions_and_links', { ...links(30), automaticDeletion: true }),
        ).toThrow(ConfigShapeError)
        continue
      }
      expect(d.decidedYears, id).not.toBeNull()
      if (d.configKey === 'retention.audit_log') continue
      const key = d.configKey as Exclude<
        typeof d.configKey,
        | 'retention.audit_log'
        | 'retention.settings_history'
        | 'retention.technical_logs'
        | 'retention.sessions_and_links'
      >
      const value = (years: number) => ({
        years,
        after: AFTER[id],
        afterPeriod: 'owner_deletion_review',
        automaticDeletion: false,
        holdsKeepRecords: true,
      })
      expect(parseValue(key, value(d.decidedYears as number))).toMatchObject({ years: d.decidedYears })
      expect(() => parseValue(key, value((d.decidedYears as number) - 1))).toThrow(ConfigShapeError)
    }
  })

  it('[HH-PRIV-01] hold checks never claim "none found" for what the software does not record', () => {
    const none = holdChecksFor(null, new Map())
    expect(none[0]).toEqual({ check: 'open_holds', result: 'not_applicable' })
    expect(none.slice(1).every((h) => h.result === 'not_recorded')).toBe(true)
    expect(holdChecksFor('p', new Map([['p', 2]]))[0]).toEqual({ check: 'open_holds', result: 'found', count: 2 })
    expect(holdChecksFor('p', new Map())[0]).toEqual({ check: 'open_holds', result: 'none_found' })
    expect(none.map((h) => h.check)).toEqual([...HOLD_CHECKS])
  })
})
