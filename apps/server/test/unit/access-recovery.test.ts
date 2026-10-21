// Access recovery and secret hygiene without a database (TSK-0035; HH-ID-09, HH-ID-08, HH-ID-06). Synthetic values only
// (RULE-SYNTHETIC-DATA).
import { describe, expect, it } from 'vitest'
import { routeProblems } from '../../src/api/route.js'
import { isPrivatePath } from '../../src/hosts.js'
import {
  ACCESS_REISSUE_RATE_LIMIT,
  NO_REISSUE_AFTER,
  parseContact,
  REISSUE_ACCEPTED,
  reissueRoute,
} from '../../src/modules/access/recovery.js'
import { CONFIG_KEYS } from '../../src/platform/config/keys.js'
import { isSecretField } from '../../src/platform/redact.js'

describe('the reissue request (TSK-0035, HH-ID-09)', () => {
  it('[HH-ID-09] the typed contact is an email or a US phone, as stored; anything else is refused before any lookup', () => {
    expect(parseContact(' A.Person@Example.TEST ')).toEqual({ channel: 'email', value: 'a.person@example.test' })
    expect(parseContact('(502) 555-0101')).toEqual({ channel: 'phone', value: '+15025550101' })
    expect(parseContact('+1 502 555 0101')).toEqual({ channel: 'phone', value: '+15025550101' })
    for (const bad of ['', 'someone', 'a@b', '555-0101', '(102) 555-0101']) expect(parseContact(bad), bad).toBeNull()
  })

  it('[HH-ID-09][HH-INT-11] one fixed answer, a contract with a network limit, and an audit action', () => {
    const route = reissueRoute({ codeKey: { state: 'not_configured', missing: ['CODE_HASH_KEY'] } })
    expect(routeProblems(route)).toEqual([])
    expect(route.rateLimit).toEqual(ACCESS_REISSUE_RATE_LIMIT)
    expect(Object.keys(route.schema.response)).toEqual(['202'])
    expect(REISSUE_ACCEPTED).toEqual({ accepted: true })
    // Staff revocations and account deletion are not undone on request (PROPOSED).
    expect([...NO_REISSUE_AFTER]).toEqual(['staff_revoked', 'account_deleted'])
  })

  it('[HH-ID-06] the per-project limit is a configuration value with a strict shape', () => {
    const parse = CONFIG_KEYS['access.recovery']
    expect(parse({ maxReissuesPerProjectPerDay: 3 }, 'v')).toEqual({ maxReissuesPerProjectPerDay: 3 })
    expect(() => parse({ maxReissuesPerProjectPerDay: 0 }, 'v')).toThrow()
    expect(() => parse({ maxReissuesPerProjectPerDay: 3, extra: 1 }, 'v')).toThrow()
  })
})

describe('access secrets stay out of referrers, search and logs (TSK-0035, HH-ID-08)', () => {
  it('[HH-ID-08] the access page is private under every name it can be fetched by', () => {
    for (const url of ['/access', '/access/', '/access.html']) expect(isPrivatePath('public', url), url).toBe(true)
    expect(isPrivatePath('public', '/accessibility')).toBe(false)
    expect(isPrivatePath('public', '/services/drywall-repair')).toBe(false)
  })

  it('[HH-ID-08] the fields that carry a link token or a code are redacted wherever they would be logged', () => {
    for (const field of ['token', 'code', 'accessToken', 'sessionToken', 'cookie', 'set-cookie'])
      expect(isSecretField(field), field).toBe(true)
  })
})
