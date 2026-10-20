// Staging access gate and noindex (TSK-0003; OWN-DEC-73, RULE-SYNTHETIC-DATA). Credentials are synthetic.
import { describe, expect, it } from 'vitest'
import { FailureLimiter, networkKey, readBasicCredentials } from '../../src/access-gate.js'
import { buildApp, NOINDEX_ROBOTS } from '../../src/app.js'
import type { ReadinessCheck } from '../../src/health.js'
import { basic, GATE_USERS, gatePassword, testConfig } from '../fixtures/env.js'

const readyStub: ReadinessCheck = {
  check: async () => ({ ready: true, checks: { database: 'ok', migrations: 'ok' } }),
  close: async () => undefined,
}
const gated = (limiter?: FailureLimiter) =>
  buildApp({
    config: testConfig({ ACCESS_GATE_USERS: GATE_USERS }),
    readiness: readyStub,
    ...(limiter ? { gateLimiter: limiter } : {}),
  })

describe('staging access gate (TSK-0003, OWN-DEC-73)', () => {
  it('[OWN-DEC-73] denies every route without credentials with a Basic challenge', async () => {
    const app = await gated()
    for (const url of ['/', '/readyz', '/robots.txt', '/api/anything', '/files/x.jpg', '/healthz/../readyz']) {
      const res = await app.inject({ method: 'GET', url })
      expect(res.statusCode, url).toBe(401)
      expect(res.headers['www-authenticate']).toBe('Basic realm="HandyHub ci", charset="UTF-8"')
      expect(res.json()).toMatchObject({ code: 'ACCESS_GATE_REQUIRED' })
    }
    const post = await app.inject({ method: 'POST', url: '/api/requests', payload: { a: 1 } })
    expect(post.statusCode).toBe(401)
    await app.close()
  })

  it('[OWN-DEC-73] lets a named tester through and keeps only /healthz public', async () => {
    const app = await gated()
    const ok = await app.inject({
      method: 'GET',
      url: '/readyz',
      headers: { authorization: basic('tester1', gatePassword(2)) },
    })
    expect(ok.statusCode).toBe(200)
    const wrong = await app.inject({
      method: 'GET',
      url: '/readyz',
      headers: { authorization: basic('owner', gatePassword(2)) },
    })
    expect(wrong.statusCode).toBe(401)
    const health = await app.inject({ method: 'GET', url: '/healthz' })
    expect(health.statusCode).toBe(200)
    expect(health.json()).toEqual({ status: 'ok' })
    await app.close()
  })

  it('[OWN-DEC-73] blocks a network after 30 failures, even with valid credentials, until the window ends', async () => {
    let now = 0
    const app = await gated(new FailureLimiter(30, 15 * 60 * 1000, () => now))
    const bad = { authorization: basic('owner', gatePassword(9)) }
    for (let i = 0; i < 30; i++) expect((await app.inject({ url: '/', headers: bad })).statusCode).toBe(401)
    const blocked = await app.inject({ url: '/', headers: bad })
    expect(blocked.statusCode).toBe(429)
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0)
    const good = { authorization: basic('owner', gatePassword(1)) }
    expect((await app.inject({ url: '/readyz', headers: good })).statusCode).toBe(429)
    now += 15 * 60 * 1000
    expect((await app.inject({ url: '/readyz', headers: good })).statusCode).toBe(200)
    await app.close()
  })

  it('reads Basic credentials and keys IPv6 clients by their /64', () => {
    expect(readBasicCredentials(basic('a', 'b:c'))).toEqual({ name: 'a', password: 'b:c' })
    expect(readBasicCredentials('Bearer x')).toBeNull()
    expect(networkKey('2001:db8:1:2:3:4:5:6')).toBe('2001:db8:1:2::/64')
    expect(networkKey('2001:db8::1')).toBe('2001:db8:0:0::/64')
    expect(networkKey('::ffff:192.0.2.7')).toBe('192.0.2.7')
  })
})

describe('staging stays out of search (TSK-0003, RULE-SYNTHETIC-DATA)', () => {
  it('[RULE-SYNTHETIC-DATA] every response carries X-Robots-Tag noindex, including the challenge', async () => {
    const app = await gated()
    for (const url of ['/', '/healthz']) {
      expect((await app.inject({ url })).headers['x-robots-tag'], url).toBe('noindex, nofollow')
    }
    const robots = await app.inject({ url: '/robots.txt', headers: { authorization: basic('owner', gatePassword(1)) } })
    expect(robots.statusCode).toBe(200)
    expect(robots.body).toBe(NOINDEX_ROBOTS)
    expect(robots.headers['x-robots-tag']).toBe('noindex, nofollow')
    await app.close()
  })

  it('[RULE-SYNTHETIC-DATA] readiness reports a missing database without private data', async () => {
    const app = await buildApp({ config: testConfig() })
    const res = await app.inject({ url: '/readyz' })
    expect(res.statusCode).toBe(503)
    expect(res.json()).toEqual({
      status: 'not_ready',
      checks: { database: 'not_configured', migrations: 'not_configured' },
    })
    await app.close()
  })
})
