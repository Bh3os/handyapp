// The staging log email sender (TSK-0112; HH-COM-03, HH-AUD-05, RULE-SYNTHETIC-DATA, OWN-DEC-152 section 14).
// Addresses and texts are synthetic.
import { Writable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { ConfigError } from '../../../src/config.js'
import { providerViews } from '../../../src/modules/system/health.js'
import { createLogger } from '../../../src/platform/logger.js'
import { createProviders, isTestProvider, providerStatus } from '../../../src/providers/index.js'
import { LogEmailSender, STAGING_EMAIL_LOGGED } from '../../../src/providers/log-email.js'
import { PROVIDER_ENV_VARS, readProviderSettings } from '../../../src/providers/settings.js'

const OWNER = 'owner-synthetic@example.test'
const OTHER = 'someone-else@example.test'
const key = (label: string) => ['synthetic', label, 'key', '7c21'].join('_')

function capture() {
  const lines: Record<string, unknown>[] = []
  const raw: string[] = []
  const stream = new Writable({
    write(chunk, _enc, done) {
      raw.push(String(chunk))
      lines.push(JSON.parse(String(chunk)) as Record<string, unknown>)
      done()
    },
  })
  return { lines, raw, log: createLogger({ level: 'info' }, stream) }
}

const message = (to: string, n = 1) => ({
  to,
  subject: 'Your HandyHub staff account',
  text: `Set your password: https://staging.example.test/staff/invite/synthetic-link-${n}`,
  html: '<p>html is never logged</p>',
  tags: [{ name: 'kind', value: 'staff_invite' }],
  idempotencyKey: `test:log-email:${n}`,
})

describe('EMAIL_PROVIDER=log settings (TSK-0112, HH-AUD-05)', () => {
  it('[HH-AUD-05] production refuses to start with EMAIL_PROVIDER=log', () => {
    const production = { HANDYHUB_ENV: 'production', EMAIL_PROVIDER: 'log', TEST_EMAIL_DESTINATIONS: OWNER }
    expect(() => readProviderSettings(production)).toThrow(ConfigError)
    expect(() => readProviderSettings(production)).toThrow(/EMAIL_PROVIDER=log is allowed only in local, ci, staging/)
    expect(() => readProviderSettings({ HANDYHUB_ENV: 'production', EMAIL_PROVIDER: 'log' })).toThrow(ConfigError)
  })

  it('[HH-AUD-05] staging accepts it with approved test addresses; without them it is NOT CONFIGURED', () => {
    const staging = readProviderSettings({
      HANDYHUB_ENV: 'staging',
      EMAIL_PROVIDER: 'log',
      TEST_EMAIL_DESTINATIONS: OWNER,
    })
    expect(staging.email).toEqual({ adapter: 'log' })
    expect(providerStatus(staging).email).toEqual({ provider: 'log' })
    // The health screen shows it as a test provider, never as the real email provider.
    expect(providerViews(staging).find((v) => v.channel === 'email')).toMatchObject({ mode: 'fake', provider: null })
    expect(readProviderSettings({ HANDYHUB_ENV: 'staging', EMAIL_PROVIDER: 'log' }).email).toEqual({
      adapter: 'not_configured',
      missing: ['TEST_EMAIL_DESTINATIONS'],
    })
    expect(
      readProviderSettings({ HANDYHUB_ENV: 'ci', EMAIL_PROVIDER: 'log', TEST_EMAIL_DESTINATIONS: OWNER }).email,
    ).toEqual({ adapter: 'log' })
    expect(createProviders(staging).inboundEmail).toBeNull()
    expect(PROVIDER_ENV_VARS.EMAIL_PROVIDER).toMatch(/log \(staging, local and ci; refused in production\)/)
  })

  it('leaves the other email choices as they were', () => {
    expect(() => readProviderSettings({ HANDYHUB_ENV: 'staging', EMAIL_PROVIDER: 'fake' })).toThrow(/local and ci/)
    expect(() => readProviderSettings({ HANDYHUB_ENV: 'staging', EMAIL_PROVIDER: 'smtp' })).toThrow(ConfigError)
    expect(readProviderSettings({ HANDYHUB_ENV: 'staging' }).email.adapter).toBe('not_configured')
  })
})

describe('the log email sender (TSK-0112, HH-COM-03, OWN-DEC-152 section 14)', () => {
  it('[HH-COM-03] logs one STAGING_EMAIL_LOGGED warn line with the address, subject and plain-text body only', async () => {
    const out = capture()
    const sender = new LogEmailSender([OWNER.toUpperCase()], out.log)
    const outcome = await sender.send(message(OWNER))
    expect(outcome).toMatchObject({ outcome: 'accepted', status: 'queued' })
    expect(outcome.outcome === 'accepted' && outcome.providerMessageId).toMatch(/^log-email-[0-9a-f-]{36}$/)
    expect(out.lines).toHaveLength(1)
    const line = out.lines[0] as Record<string, unknown>
    expect(line['msg']).toBe(STAGING_EMAIL_LOGGED)
    expect(line['level']).toBe(40)
    expect(line['to']).toBe(OWNER)
    expect(line['subject']).toBe('Your HandyHub staff account')
    expect(line['text']).toContain('/staff/invite/synthetic-link-1')
    expect(out.raw.join('')).not.toMatch(/html is never logged|staff_invite|test:log-email/)
    // A repeat with the same key answers with the first result and logs nothing new.
    expect(await sender.send(message(OWNER))).toEqual(outcome)
    expect(out.lines).toHaveLength(1)
  })

  it('[HH-AUD-05] an address that is not an approved test address is suppressed and nothing of it is logged', async () => {
    const out = capture()
    const sender = new LogEmailSender([OWNER], out.log)
    expect(await sender.send(message(OTHER, 2))).toEqual({ outcome: 'suppressed', reason: 'not_on_test_allowlist' })
    expect(out.raw).toEqual([])
    // Through the configured providers the destination guard suppresses first: its line masks the address and
    // carries neither the subject nor the body, and no STAGING_EMAIL_LOGGED line is written.
    const settings = readProviderSettings({
      HANDYHUB_ENV: 'staging',
      EMAIL_PROVIDER: 'log',
      TEST_EMAIL_DESTINATIONS: OWNER,
    })
    const providers = createProviders(settings, { logger: out.log })
    expect(providers.email?.provider).toBe('log')
    expect(await providers.email?.send(message(OTHER, 3))).toEqual({
      outcome: 'suppressed',
      reason: 'not_on_test_allowlist',
    })
    const all = out.raw.join('')
    expect(all).not.toContain(STAGING_EMAIL_LOGGED)
    expect(all).not.toContain(OTHER)
    expect(all).not.toMatch(/synthetic-link-3|Your HandyHub staff account/)
  })

  it('[RULE-SYNTHETIC-DATA] never logs a provider credential, and counts as a test provider', async () => {
    const out = capture()
    const env = {
      HANDYHUB_ENV: 'staging',
      EMAIL_PROVIDER: 'log',
      TEST_EMAIL_DESTINATIONS: OWNER,
      RESEND_API_KEY: key('resend'),
      BIRD_WEBHOOK_SECRET: key('whbird'),
    }
    const providers = createProviders(readProviderSettings(env), { logger: out.log })
    await providers.email?.send(message(OWNER, 4))
    expect(out.lines).toHaveLength(1)
    expect(out.raw.join('')).not.toMatch(/synthetic_resend|synthetic_whbird/)
    expect(Object.keys(out.lines[0] as object).sort()).toEqual(
      ['hostname', 'level', 'msg', 'pid', 'subject', 'text', 'time', 'to'].sort(),
    )
    expect(isTestProvider('log')).toBe(true)
    expect(isTestProvider('fake')).toBe(true)
    expect(isTestProvider('resend')).toBe(false)
    expect(isTestProvider(null)).toBe(false)
  })
})
