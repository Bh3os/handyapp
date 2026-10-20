import { inspect } from 'node:util'
import { describe, expect, it } from 'vitest'
import { ConfigError } from '../../../src/config.js'
import { destinationPolicy, maskDestination } from '../../../src/providers/destinations.js'
import { providerStatus } from '../../../src/providers/index.js'
import { birdApiBaseUrl, readProviderSettings } from '../../../src/providers/settings.js'

const key = (label: string) => ['synthetic', label, 'key', '4e7a90c1'].join('_')

describe('provider settings (TSK-0013, HH-AUD-05, RULE-SYNTHETIC-DATA)', () => {
  it('defaults to the fakes in local and ci and to NOT CONFIGURED in staging and production', () => {
    const ci = readProviderSettings({ HANDYHUB_ENV: 'ci' })
    expect([ci.email.adapter, ci.sms.adapter, ci.storage.adapter]).toEqual(['fake', 'fake', 'fake'])
    for (const env of ['staging', 'production']) {
      const s = readProviderSettings({ HANDYHUB_ENV: env })
      expect([s.email.adapter, s.sms.adapter, s.storage.adapter]).toEqual([
        'not_configured',
        'not_configured',
        'not_configured',
      ])
      expect(providerStatus(s).inbound).toEqual({ bird: 'not_configured', resend: 'not_configured' })
    }
  })

  it('refuses the fakes outside local and ci, so staging never claims a fake send', () => {
    expect(() => readProviderSettings({ HANDYHUB_ENV: 'staging', EMAIL_PROVIDER: 'fake' })).toThrow(ConfigError)
    expect(() => readProviderSettings({ HANDYHUB_ENV: 'production', SMS_PROVIDER: 'fake' })).toThrow(/local and ci/)
    expect(() => readProviderSettings({ HANDYHUB_ENV: 'ci', STORAGE_PROVIDER: 's3' })).toThrow(/fake or r2/)
  })

  it('names the missing variables of a selected provider and never prints a credential', () => {
    const partial = readProviderSettings({
      HANDYHUB_ENV: 'staging',
      EMAIL_PROVIDER: 'resend',
      SMS_PROVIDER: 'bird',
      BIRD_API_KEY: key('bird'),
    })
    expect(partial.email).toEqual({ adapter: 'not_configured', missing: ['RESEND_API_KEY', 'EMAIL_FROM'] })
    expect(partial.sms).toEqual({ adapter: 'not_configured', missing: ['BIRD_SMS_FROM'] })
    const full = readProviderSettings({
      HANDYHUB_ENV: 'staging',
      EMAIL_PROVIDER: 'resend',
      RESEND_API_KEY: key('resend'),
      EMAIL_FROM: 'notices@example.test',
      SMS_PROVIDER: 'bird',
      BIRD_API_KEY: `bk_us1_${key('bird')}`,
      BIRD_SMS_FROM: '+15025550100',
      STORAGE_PROVIDER: 'r2',
      R2_ACCOUNT_ID: 'synthetic-account',
      R2_BUCKET: 'synthetic-bucket',
      R2_ACCESS_KEY_ID: key('r2id'),
      R2_SECRET_ACCESS_KEY: key('r2secret'),
      BIRD_WEBHOOK_SECRET: key('whbird'),
      TEST_EMAIL_DESTINATIONS: 'Owner.Test@example.test',
      TEST_PHONE_DESTINATIONS: '+15025550199',
    })
    expect([full.email.adapter, full.sms.adapter, full.storage.adapter]).toEqual(['resend', 'bird', 'r2'])
    const printed = `${JSON.stringify(full)} ${inspect(full, { depth: 5 })}`
    for (const k of ['resend', 'bird', 'r2id', 'r2secret', 'whbird']) expect(printed).not.toContain(key(k))
    expect(full.testDestinations.emails).toEqual(['owner.test@example.test'])
    expect(() => readProviderSettings({ HANDYHUB_ENV: 'ci', TEST_PHONE_DESTINATIONS: '5025550100' })).toThrow(
      /invalid entry/,
    )
  })

  it('derives the Bird regional host from the API key', () => {
    expect(birdApiBaseUrl('bk_eu1_x')).toBe('https://eu1.platform.bird.com')
    expect(birdApiBaseUrl('bk_us1_x')).toBe('https://us1.platform.bird.com')
  })
})

describe('approved test destinations (TSK-0013, HH-AUD-05)', () => {
  const lists = { emails: ['owner.test@example.com'], phones: ['+15025559999'] }
  it('allows only the approved list in staging, plus synthetic ones in local and ci, and everything in production', () => {
    const staging = destinationPolicy({ environment: 'staging', testDestinations: lists })
    expect(staging.allows('email', 'OWNER.TEST@example.com')).toBe(true)
    expect(staging.allows('email', 'someone@example.test')).toBe(false)
    expect(staging.allows('phone', '+15025559999')).toBe(true)
    expect(staging.allows('phone', '+15025550100')).toBe(false)
    const ci = destinationPolicy({ environment: 'ci', testDestinations: lists })
    expect(ci.allows('email', 'someone@example.test')).toBe(true)
    expect(ci.allows('email', 'someone@gmail.com')).toBe(false)
    expect(ci.allows('phone', '+15025550100')).toBe(true)
    expect(ci.allows('phone', '+15025551234')).toBe(false)
    expect(destinationPolicy({ environment: 'production', testDestinations: lists }).allows('email', 'a@b.co')).toBe(
      true,
    )
  })

  it('masks destinations for logs', () => {
    expect(maskDestination('email', 'person@example.test')).toBe('p***@example.test')
    expect(maskDestination('phone', '+15025550123')).toBe('***23')
  })
})
