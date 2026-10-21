// Project access links without a database (TSK-0034; HH-ID-04, HH-ID-08, HH-INT-21, FACT-AUTOMATIC-MESSAGES #3).
// Synthetic keys and values only (RULE-SYNTHETIC-DATA).
import { describe, expect, it } from 'vitest'
import { publicSiteUrl } from '../../src/config.js'
import { accessLink, accessToken } from '../../src/modules/access/grants.js'
import { ACCESS_LINK_MESSAGE_KEY } from '../../src/modules/access/link-message.js'
import { messageType, templateProblems } from '../../src/modules/notifications/index.js'
import { Secret } from '../../src/providers/types.js'
import { testConfig } from '../fixtures/env.js'

const KEY = new Secret('synthetic-unit-access-key-'.repeat(2))
const GRANT = '00000000-0000-4000-8000-000000000034'

describe('the link token (TSK-0034, HH-ID-04, HH-ID-08)', () => {
  it('[HH-ID-04][HH-ID-08] 256 bits, base64url, derived from the key and the grant’s nonce only', () => {
    const token = accessToken(KEY, GRANT, '0'.repeat(32))
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    // The same grant and nonce give the same link (a retried send); any other input gives another.
    expect(accessToken(KEY, GRANT, '0'.repeat(32))).toBe(token)
    expect(accessToken(KEY, GRANT, '1'.repeat(32))).not.toBe(token)
    expect(accessToken(new Secret('another-synthetic-access-key-'.repeat(2)), GRANT, '0'.repeat(32))).not.toBe(token)
  })

  it('[HH-ID-08] the link opens /access with the token in the fragment, never in the path or query', () => {
    const token = accessToken(KEY, GRANT, '2'.repeat(32))
    expect(accessLink('https://public.example.test/', token)).toBe(`https://public.example.test/access#${token}`)
    const url = new URL(accessLink('https://public.example.test', token))
    expect([url.pathname, url.search]).toEqual(['/access', ''])
  })

  it('[HH-INT-21] the link base is PUBLIC_ORIGIN, or the local server; otherwise NOT CONFIGURED', () => {
    expect(
      publicSiteUrl(
        testConfig({ PUBLIC_ORIGIN: 'http://public.localhost:4312', STAFF_ORIGIN: 'http://staff.localhost:4312' }),
      ),
    ).toBe('http://public.localhost:4312')
    expect(publicSiteUrl(testConfig({ PORT: '4310', HOST: '127.0.0.1' }))).toBe('http://127.0.0.1:4310')
    expect(publicSiteUrl({ ...testConfig({ PORT: '4310' }), env: 'staging' })).toBeUndefined()
    expect(publicSiteUrl(testConfig({ PORT: '0' }))).toBeUndefined()
  })
})

describe('the access message (TSK-0034, HH-COM-06, FACT-AUTOMATIC-MESSAGES #3)', () => {
  it('[HH-COM-06][HH-INT-21] project.access_link is triggered by the saved request or a reissue, and only it carries the link', () => {
    const type = messageType(ACCESS_LINK_MESSAGE_KEY)
    expect(type.triggerEvents).toEqual(['request.submitted', 'project.access_requested'])
    expect(type.variables).toEqual({ accessLink: 'credential' })
    // A template may put the link in the body, never in an email subject.
    const draft = {
      messageKey: ACCESS_LINK_MESSAGE_KEY,
      channel: 'email' as const,
      locale: 'en' as const,
      subject: 'Synthetic {accessLink}',
      body: 'Synthetic {accessLink}',
      translationReview: 'source' as const,
    }
    expect(templateProblems(draft)).toEqual(['the subject never carries {accessLink}'])
    expect(templateProblems({ ...draft, subject: 'Synthetic subject' })).toEqual([])
  })
})
