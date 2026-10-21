// The staff sign-in, reset and link limits count the client's network as the trusted proxies saw it (HH-SEC-02,
// RULE-SERVER-AUTHZ, TRUST_PROXY_HOPS), the same address the API rate limiter and the access gate read. Behind Render
// every request arrives from a proxy, so counting the socket peer would put every staff member in one bucket.
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { RATE_RULES, type RateRule } from '../../src/modules/identity/rate-limit.js'
import { hashToken } from '../../src/modules/identity/tokens.js'
import { testConfig } from '../fixtures/env.js'

let t: TestDatabase
let behindProxy: FastifyInstance
let direct: FastifyInstance

beforeAll(async () => {
  t = await createTestDatabase()
  behindProxy = await buildApp({ config: testConfig({ TRUST_PROXY_HOPS: '1' }), api: { db: t.db } })
  direct = await buildApp({ config: testConfig(), api: { db: t.db } })
})
afterAll(async () => {
  await behindProxy?.close()
  await direct?.close()
  await t?.drop()
})

async function hits(rule: RateRule, network: string): Promise<number> {
  const rows = await t.db
    .selectFrom('identity.rate_limits')
    .select('hits')
    .where('bucket', '=', rule.bucket)
    .where('key_hash', '=', hashToken(`${rule.bucket}|${network}`))
    .execute()
  return rows.reduce((n, r) => n + r.hits, 0)
}

const post = (app: FastifyInstance, url: string, payload: object, forwardedFor?: string) =>
  app.inject({
    method: 'POST',
    url: `/api/v1${url}`,
    payload,
    ...(forwardedFor ? { headers: { 'x-forwarded-for': forwardedFor } } : {}),
  })
const forgot = { email: 'nobody-network@example.test' }
// An unknown link token: refused, but the attempt is counted first.
const unknownLink = { token: ['synthetic', 'unknown', 'link', 'token'].join('-'), password: 'x' }

describe('staff auth limits count the client network (HH-SEC-02, TRUST_PROXY_HOPS)', () => {
  it('[HH-SEC-02] behind a trusted proxy, two clients count apart and the proxy address counts nothing', async () => {
    expect((await post(behindProxy, '/staff/auth/password/forgot', forgot, '198.51.100.41')).statusCode).toBe(202)
    expect((await post(behindProxy, '/staff/auth/password/forgot', forgot, '198.51.100.42')).statusCode).toBe(202)
    expect((await post(behindProxy, '/staff/auth/password/set', unknownLink, '198.51.100.41')).statusCode).toBe(410)
    expect(await hits(RATE_RULES.resetNetwork, '198.51.100.41')).toBe(1)
    expect(await hits(RATE_RULES.resetNetwork, '198.51.100.42')).toBe(1)
    expect(await hits(RATE_RULES.linkNetwork, '198.51.100.41')).toBe(1)
    expect(await hits(RATE_RULES.resetNetwork, '127.0.0.1')).toBe(0)
    expect(await hits(RATE_RULES.linkNetwork, '127.0.0.1')).toBe(0)
  })

  it('[HH-SEC-02] a failed sign-in counts against the client network the proxy saw', async () => {
    const res = await post(
      behindProxy,
      '/staff/auth/sign-in',
      { email: 'nobody-network@example.test', password: 'wrong' },
      '198.51.100.43',
    )
    expect(res.statusCode).toBe(401)
    expect(await hits(RATE_RULES.signInNetwork, '198.51.100.43')).toBe(1)
    expect(await hits(RATE_RULES.signInNetwork, '127.0.0.1')).toBe(0)
  })

  it('[HH-SEC-02] without a trusted proxy a forged X-Forwarded-For changes nothing: the socket peer counts', async () => {
    expect((await post(direct, '/staff/auth/password/forgot', forgot, '198.51.100.44')).statusCode).toBe(202)
    expect(await hits(RATE_RULES.resetNetwork, '198.51.100.44')).toBe(0)
    expect(await hits(RATE_RULES.resetNetwork, '127.0.0.1')).toBe(1)
  })

  it('[HH-SEC-02] behind one trusted proxy, only the entry it appended counts: a prefix the client wrote is ignored', async () => {
    expect(
      (await post(behindProxy, '/staff/auth/password/forgot', forgot, '203.0.113.9, 198.51.100.45')).statusCode,
    ).toBe(202)
    expect(await hits(RATE_RULES.resetNetwork, '198.51.100.45')).toBe(1)
    expect(await hits(RATE_RULES.resetNetwork, '203.0.113.9')).toBe(0)
  })
})
