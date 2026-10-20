// Environment schema (TSK-0003; OWN-DEC-73, RULE-SYNTHETIC-DATA). Values are synthetic.
import { inspect } from 'node:util'
import { describe, expect, it } from 'vitest'
import { ConfigError, ENV_VARS, loadConfig, parseAccessGateUsers, strongGatePassword } from '../../src/config.js'
import { GATE_USERS, gatePassword } from '../fixtures/env.js'

const DB = ['postgres://synthetic', 'synthetic@127.0.0.1:5432/synthetic'].join(':')

describe('environment schema (TSK-0003, OWN-DEC-73, RULE-SYNTHETIC-DATA)', () => {
  it('[RULE-SYNTHETIC-DATA] HANDYHUB_ENV is required and must be a known environment', () => {
    expect(() => loadConfig({})).toThrow(new ConfigError('HANDYHUB_ENV is required (local, ci, staging, production)'))
    expect(() => loadConfig({ HANDYHUB_ENV: 'prod' })).toThrow(/HANDYHUB_ENV must be one of/)
  })

  it('[RULE-SYNTHETIC-DATA] DATABASE_URL is required in staging and production, optional in local and ci', () => {
    expect(() => loadConfig({ HANDYHUB_ENV: 'production' })).toThrow('DATABASE_URL is required in production')
    expect(() => loadConfig({ HANDYHUB_ENV: 'staging', ACCESS_GATE_USERS: GATE_USERS })).toThrow(
      'DATABASE_URL is required in staging',
    )
    expect(loadConfig({ HANDYHUB_ENV: 'local' }).databaseUrl).toBeUndefined()
    expect(() => loadConfig({ HANDYHUB_ENV: 'ci', DATABASE_URL: 'mysql://x' })).toThrow(/postgres/)
  })

  it('[OWN-DEC-73] ACCESS_GATE_USERS is required in staging and refused in production', () => {
    expect(() => loadConfig({ HANDYHUB_ENV: 'staging', DATABASE_URL: DB })).toThrow(
      /ACCESS_GATE_USERS is required in staging/,
    )
    expect(() => loadConfig({ HANDYHUB_ENV: 'production', DATABASE_URL: DB, ACCESS_GATE_USERS: GATE_USERS })).toThrow(
      /refused in production/,
    )
    const staging = loadConfig({ HANDYHUB_ENV: 'staging', DATABASE_URL: DB, ACCESS_GATE_USERS: GATE_USERS })
    expect(staging.accessGate.enabled).toBe(true)
    expect(staging.noindex).toBe(true)
    expect(loadConfig({ HANDYHUB_ENV: 'ci' }).accessGate.enabled).toBe(false)
  })

  it('[OWN-DEC-73] production serves without the gate and without the staging noindex', () => {
    const prod = loadConfig({ HANDYHUB_ENV: 'production', DATABASE_URL: DB })
    expect(prod.accessGate.enabled).toBe(false)
    expect(prod.noindex).toBe(false)
  })

  it('[RULE-SYNTHETIC-DATA] errors name the variable and the entry, never a name or a password', () => {
    const weak = 'aaaaaaaaaaaaaaaa'
    const attempts = [
      `owner:${weak}`,
      `owner:${gatePassword(1)},owner:${gatePassword(2)}`,
      `:${gatePassword(1)}`,
      'nocolon',
    ]
    for (const raw of attempts) {
      let message = ''
      try {
        parseAccessGateUsers(raw)
      } catch (e) {
        message = (e as Error).message
      }
      expect(message).toMatch(/^ACCESS_GATE_USERS/)
      expect(message).not.toContain(weak)
      expect(message).not.toContain(gatePassword(1))
      expect(message).not.toContain('owner')
    }
  })

  it('[RULE-SYNTHETIC-DATA] a gate user never prints its password', () => {
    const [user] = parseAccessGateUsers(GATE_USERS)
    expect(JSON.stringify(user)).not.toContain(gatePassword(1))
    expect(inspect(user)).not.toContain(gatePassword(1))
    expect(user?.matches('owner', gatePassword(1))).toBe(true)
    expect(user?.matches('owner', gatePassword(2))).toBe(false)
  })

  it('applies the PROPOSED gate password strength rule', () => {
    expect(strongGatePassword(gatePassword(3))).toBe(true)
    expect(strongGatePassword('password12345678')).toBe(false)
    expect(strongGatePassword('short-A1!')).toBe(false)
  })

  it('validates PORT, TRUST_PROXY_HOPS and LOG_LEVEL and documents every variable by name', () => {
    expect(() => loadConfig({ HANDYHUB_ENV: 'ci', PORT: '70000' })).toThrow(/PORT must be a whole number/)
    expect(() => loadConfig({ HANDYHUB_ENV: 'ci', TRUST_PROXY_HOPS: '9' })).toThrow(/TRUST_PROXY_HOPS/)
    expect(() => loadConfig({ HANDYHUB_ENV: 'ci', LOG_LEVEL: 'loud' })).toThrow(/LOG_LEVEL/)
    expect(loadConfig({ HANDYHUB_ENV: 'ci' })).toMatchObject({ port: 3000, host: '127.0.0.1', trustProxyHops: 0 })
    expect(Object.keys(ENV_VARS).sort()).toEqual([
      'ACCESS_GATE_USERS',
      'BOOTSTRAP_OWNER_EMAIL',
      'BOOTSTRAP_OWNER_NAME',
      'DATABASE_URL',
      'HANDYHUB_ENV',
      'HOST',
      'LOG_LEVEL',
      'PORT',
      'SITE_DIR',
      'STAFF_APP_URL',
      'STAFF_DIR',
      'TRUST_PROXY_HOPS',
    ])
  })

  it('[HH-STAFF-01][HH-SEC-02] staff link URL, first Owner and cookie security per environment (TSK-0014)', () => {
    expect(loadConfig({ HANDYHUB_ENV: 'ci', PORT: '4310' })).toMatchObject({
      staffAppUrl: 'http://127.0.0.1:4310/staff',
      secureCookies: false,
      bootstrapOwner: null,
    })
    const staging = loadConfig({
      HANDYHUB_ENV: 'staging',
      DATABASE_URL: DB,
      ACCESS_GATE_USERS: GATE_USERS,
      BOOTSTRAP_OWNER_EMAIL: 'Owner-Synthetic@Example.test',
    })
    expect(staging).toMatchObject({
      staffAppUrl: undefined,
      secureCookies: true,
      bootstrapOwner: { email: 'owner-synthetic@example.test', displayName: null },
    })
    expect(() =>
      loadConfig({
        HANDYHUB_ENV: 'staging',
        DATABASE_URL: DB,
        ACCESS_GATE_USERS: GATE_USERS,
        STAFF_APP_URL: 'http://x.example',
      }),
    ).toThrow(/https/)
    expect(() => loadConfig({ HANDYHUB_ENV: 'ci', BOOTSTRAP_OWNER_EMAIL: 'not-an-email' })).toThrow(
      /BOOTSTRAP_OWNER_EMAIL/,
    )
  })
})
