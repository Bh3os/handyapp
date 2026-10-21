// System health and configuration view, without a database (TSK-0101; HH-NFR-02, T71, RULE-SERVER-AUTHZ).
import { LABEL_FAMILIES } from '@handyhub/i18n'
import { decide, navigationFor, NAV_IDS, STAFF_ROLES, type StaffActor } from '@handyhub/policy'
import { describe, expect, it } from 'vitest'
import { routeProblems } from '../../src/api/route.js'
import { ENV_VARS } from '../../src/config.js'
import { MODULES } from '../../src/modules/index.js'
import {
  flatten,
  HEALTH_CHECKS,
  HEALTH_METRICS,
  HEALTH_NOTES,
  HEALTH_STATUSES,
  systemModule,
  variableStates,
} from '../../src/modules/system/index.js'
import { PROVIDER_CHANNELS, PROVIDER_MODES, providerViews } from '../../src/modules/system/health.js'
import { CONFIG_KEYS } from '../../src/platform/config/index.js'
import { PROVIDER_ENV_VARS, readProviderSettings } from '../../src/providers/settings.js'
import { CONTENT_PROBLEMS } from '../../src/modules/photos/content.js'

const staff = (role: (typeof STAFF_ROLES)[number]): StaffActor => ({
  kind: 'staff',
  userId: `synthetic-${role}`,
  roles: [role],
  capabilities: [],
  status: 'active',
  freshAuth: false,
})

describe('system module contract (TSK-0101, HH-NFR-02)', () => {
  it('[HH-NFR-02] the staff catalogs label every check, status, metric, note, provider, rejection and configuration key', () => {
    expect([...LABEL_FAMILIES.healthCheck]).toEqual([...HEALTH_CHECKS])
    expect([...LABEL_FAMILIES.healthStatus]).toEqual([...HEALTH_STATUSES])
    expect([...LABEL_FAMILIES.healthMetric]).toEqual([...HEALTH_METRICS])
    expect([...LABEL_FAMILIES.healthNote]).toEqual([...HEALTH_NOTES])
    expect([...LABEL_FAMILIES.providerChannel]).toEqual([...PROVIDER_CHANNELS])
    expect([...LABEL_FAMILIES.providerMode]).toEqual([...PROVIDER_MODES])
    expect([...LABEL_FAMILIES.photoRejection]).toEqual([...CONTENT_PROBLEMS])
    expect([...LABEL_FAMILIES.configKey]).toEqual(Object.keys(CONFIG_KEYS))
  })

  it('[RULE-SERVER-AUTHZ][HH-NFR-02] both routes are Owner-only reads decided by the policy, listed in the contract', () => {
    const routes = systemModule().routes
    expect(routes.map((r) => `${r.method} ${r.path}`)).toEqual([
      'GET /staff/system/health',
      'GET /staff/system/configuration',
    ])
    for (const r of routes) {
      expect(routeProblems(r)).toEqual([])
      expect(r).toMatchObject({ permission: 'dashboard.view', actors: ['staff'], kind: 'read', audit: 'none' })
    }
    expect(MODULES.map((m) => m.name)).toContain('system')
    const now = new Date()
    expect(STAFF_ROLES.filter((role) => decide(staff(role), 'dashboard.view', {}, { now }).effect === 'allow')).toEqual(
      ['owner'],
    )
    // The menu shows System health exactly to the roles the server lets read it.
    for (const role of STAFF_ROLES) expect(navigationFor([role]).items.includes('health')).toBe(role === 'owner')
    expect(NAV_IDS).toContain('health')
  })
})

describe('configuration view helpers (TSK-0101, HH-NFR-02)', () => {
  it('[HH-NFR-02] a stored value becomes path and value pairs; money stays integer cents', () => {
    expect(
      flatten({ thresholdCents: 100000, base: 'final', list: [{ state: 'KY' }, 'x'], ok: false, none: null }),
    ).toEqual([
      { path: 'thresholdCents', value: 100000 },
      { path: 'base', value: 'final' },
      { path: 'list[1].state', value: 'KY' },
      { path: 'list[2]', value: 'x' },
      { path: 'ok', value: false },
    ])
    expect(flatten(null)).toEqual([])
  })

  it('[HH-NFR-02][T71] variables report only whether they are set, and mark the secrets', () => {
    const value = ['synthetic', 'value', 'never', 'shown'].join('-')
    const states = variableStates({ HANDYHUB_ENV: 'ci', RESEND_API_KEY: value, EMAIL_FROM: '  ' })
    expect(states).toHaveLength(Object.keys(ENV_VARS).length + Object.keys(PROVIDER_ENV_VARS).length)
    expect(JSON.stringify(states)).not.toContain(value)
    expect(states.find((s) => s.name === 'RESEND_API_KEY')).toEqual({
      name: 'RESEND_API_KEY',
      group: 'providers',
      set: true,
      secret: true,
    })
    // Blank is not set.
    expect(states.find((s) => s.name === 'EMAIL_FROM')?.set).toBe(false)
    expect(states.filter((s) => s.secret).map((s) => s.name)).toEqual([
      'DATABASE_URL',
      'ACCESS_GATE_USERS',
      'MFA_ENCRYPTION_KEY',
      'CODE_HASH_KEY',
      'RESEND_API_KEY',
      'RESEND_WEBHOOK_SECRET',
      'BIRD_API_KEY',
      'BIRD_WEBHOOK_SECRET',
      'R2_ACCESS_KEY_ID',
      'R2_SECRET_ACCESS_KEY',
    ])
  })

  it('[T71] providers show their mode and missing variable names; without settings every one is unknown', () => {
    expect(providerViews(readProviderSettings({ HANDYHUB_ENV: 'ci' })).map((p) => p.mode)).toEqual([
      'fake',
      'fake',
      'fake',
    ])
    expect(providerViews(readProviderSettings({ HANDYHUB_ENV: 'production' }))).toEqual([
      { channel: 'email', mode: 'not_configured', provider: null, missing: ['EMAIL_PROVIDER'] },
      { channel: 'sms', mode: 'not_configured', provider: null, missing: ['SMS_PROVIDER'] },
      { channel: 'storage', mode: 'not_configured', provider: null, missing: ['STORAGE_PROVIDER'] },
    ])
    expect(providerViews(null).every((p) => p.mode === 'unknown' && p.missing.length === 0)).toBe(true)
  })
})
