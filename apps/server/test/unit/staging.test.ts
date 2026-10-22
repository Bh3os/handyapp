// Staging Tools configuration and contract (TSK-0141; HH-OPS-05, OWN-DEC-191, HH-LANG-03). Values are synthetic.
import { LABEL_FAMILIES } from '@handyhub/i18n'
import { describe, expect, it } from 'vitest'
import { ConfigError, loadConfig, stagingToolsEnvironment } from '../../src/config.js'
import { MODULES } from '../../src/modules/index.js'
import {
  CLEARED_CATEGORIES,
  CLEARED_TABLES,
  NOT_AVAILABLE,
  PRESERVED,
  SCENARIOS,
  SELECTIVE_TABLES,
} from '../../src/modules/staging/index.js'
import { KEPT_TABLES, REMOVED_CATEGORIES } from '../../src/modules/staging/reset.js'
import { GATE_USERS } from '../fixtures/env.js'

const DB = 'postgres://synthetic@127.0.0.1/none'

describe('STAGING_TOOLS (TSK-0141, HH-OPS-05)', () => {
  it('[HH-OPS-05] is off by default, on only when set explicitly, and refused in production', () => {
    expect(loadConfig({ HANDYHUB_ENV: 'ci' }).stagingTools).toBe(false)
    expect(loadConfig({ HANDYHUB_ENV: 'ci', STAGING_TOOLS: 'on' }).stagingTools).toBe(true)
    expect(() => loadConfig({ HANDYHUB_ENV: 'ci', STAGING_TOOLS: 'yes' })).toThrow(ConfigError)
    expect(() => loadConfig({ HANDYHUB_ENV: 'production', DATABASE_URL: DB, STAGING_TOOLS: 'on' })).toThrow(
      /refused in production/,
    )
  })

  it('[HH-OPS-05] identifies staging only with the flag and the access gate; never production', () => {
    const staging = loadConfig({
      HANDYHUB_ENV: 'staging',
      DATABASE_URL: DB,
      ACCESS_GATE_USERS: GATE_USERS,
      STAGING_TOOLS: 'on',
    })
    expect(stagingToolsEnvironment(staging).identified).toBe(true)
    expect(stagingToolsEnvironment({ ...staging, accessGate: { enabled: false } }).identified).toBe(false)
    expect(stagingToolsEnvironment({ ...staging, stagingTools: false }).identified).toBe(false)
    const production = loadConfig({ HANDYHUB_ENV: 'production', DATABASE_URL: DB })
    expect(stagingToolsEnvironment({ ...production, stagingTools: true }).identified).toBe(false)
  })

  it('[HH-OPS-05] a local or ci reset needs DATABASE_URL on this machine (loopback or socket), never a remote one', () => {
    const local = (url?: string) =>
      stagingToolsEnvironment(
        loadConfig({ HANDYHUB_ENV: 'ci', STAGING_TOOLS: 'on', ...(url ? { DATABASE_URL: url } : {}) }),
      )
    expect(local(DB).identified).toBe(true)
    expect(local('postgres:///none?host=/var/run/postgresql').identified).toBe(true)
    for (const url of [undefined, 'postgres://synthetic@db.example.test/none', 'postgres://synthetic@10.0.0.5/none']) {
      const r = local(url)
      expect(r.identified, String(url)).toBe(false)
      expect(r.checks.find((c) => c.id === 'database_host')?.ok, String(url)).toBe(false)
    }
  })
})

describe('the reset’s table lists and the contract (TSK-0141)', () => {
  it('[HH-OPS-05] each table is in exactly one list', () => {
    const all = [...CLEARED_TABLES, ...SELECTIVE_TABLES, ...Object.values(PRESERVED), ...KEPT_TABLES]
    expect(new Set(all).size).toBe(all.length)
    expect(CLEARED_TABLES).not.toContain('platform.audit_events')
    expect(Object.values(CLEARED_CATEGORIES).flat()).toEqual(CLEARED_TABLES)
  })

  it('[HH-OPS-05] the contract marks every staging route STAGING ONLY, Owner-scoped and audited', () => {
    const routes = MODULES.find((m) => m.name === 'staging')?.routes ?? []
    expect(routes.map((r) => r.operationId).sort()).toEqual([
      'getStagingTestData',
      'resetStagingTestData',
      'setReusableTestAccount',
    ])
    for (const r of routes) expect(r.description).toMatch(/STAGING ONLY/)
    const reset = routes.find((r) => r.operationId === 'resetStagingTestData')
    expect(reset?.freshAuthMinutes).toBeGreaterThan(0)
    expect(reset?.idempotency).toBe('required')
  })

  it('[HH-LANG-03] every code the screen shows has an EN and ES label family', () => {
    expect([...LABEL_FAMILIES.stagingRemoved]).toEqual([...REMOVED_CATEGORIES])
    expect([...LABEL_FAMILIES.stagingKept]).toEqual(Object.keys(PRESERVED))
    expect([...LABEL_FAMILIES.stagingScenario]).toEqual([...SCENARIOS])
    expect(Object.keys(NOT_AVAILABLE).every((s) => (SCENARIOS as readonly string[]).includes(s))).toBe(true)
    expect(LABEL_FAMILIES.auditArea).toContain('staging')
  })
})
