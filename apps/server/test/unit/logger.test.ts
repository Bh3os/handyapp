import { Writable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { createLogger } from '../../src/platform/logger.js'
import { REDACTED } from '../../src/platform/redact.js'
import { runWithContext } from '../../src/platform/request-context.js'
import { testConfig } from '../fixtures/env.js'

const secret = (label: string) => ['synthetic', label, 'value', '91c2'].join('-')

function capture() {
  const lines: Record<string, unknown>[] = []
  let raw = ''
  const stream = new Writable({
    write(chunk: Buffer, _enc, cb) {
      raw += chunk.toString()
      for (const l of chunk.toString().split('\n').filter(Boolean)) lines.push(JSON.parse(l) as Record<string, unknown>)
      cb()
    },
  })
  return { stream, lines, raw: () => raw }
}

describe('redacting logger (TSK-0011, RULE-SERVER-AUTHZ, HH-SEC-04)', () => {
  it('never writes tokens, codes, passwords or access instructions, at any depth', () => {
    const out = capture()
    const log = createLogger({ level: 'info' }, out.stream)
    log.info(
      {
        password: secret('pw'),
        user: { sessionToken: secret('tok'), profile: { accessInstructions: secret('gate') } },
        attempts: [{ code: secret('otp') }],
        status: 'sent',
      },
      'sign-in attempt',
    )
    expect(out.raw()).not.toMatch(/synthetic-/)
    expect(out.lines[0]).toMatchObject({
      msg: 'sign-in attempt',
      status: 'sent',
      password: REDACTED,
      user: { sessionToken: REDACTED, profile: { accessInstructions: REDACTED } },
      attempts: [{ code: REDACTED }],
    })
  })

  it('stamps the current request ID on every line', () => {
    const out = capture()
    const log = createLogger({}, out.stream)
    runWithContext({ requestId: 'req-test-0001' }, () => log.info('inside'))
    log.info('outside')
    expect(out.lines[0]).toMatchObject({ msg: 'inside', requestId: 'req-test-0001' })
    expect(out.lines[1]?.['requestId']).toBeUndefined()
  })

  it('redacts credential headers in request logs and echoes the request ID', async () => {
    const out = capture()
    const app = await buildApp({ config: testConfig(), logger: createLogger({ level: 'info' }, out.stream) })
    app.get('/probe', async (req) => {
      req.log.info({ headers: req.headers }, 'probe')
      return { ok: true }
    })
    const res = await app.inject({
      method: 'GET',
      url: '/probe',
      headers: {
        authorization: `Bearer ${secret('bearer')}`,
        cookie: `sid=${secret('cookie')}`,
        'x-request-id': 'req-abc-12345',
      },
    })
    await app.close()
    expect(res.headers['x-request-id']).toBe('req-abc-12345')
    expect(out.raw()).not.toMatch(/synthetic-/)
    const probe = out.lines.find((l) => l['msg'] === 'probe')
    expect(probe).toMatchObject({ requestId: 'req-abc-12345', reqId: 'req-abc-12345' })
  })

  it('logs request paths without query strings and redacts secret properties of errors', async () => {
    const out = capture()
    const app = await buildApp({ config: testConfig(), logger: createLogger({ level: 'info' }, out.stream) })
    app.get('/sign-in/callback', async (req) => {
      const err = Object.assign(new Error('provider refused'), { token: secret('err-token'), code: 'E_TEST' })
      req.log.error({ err }, 'callback failed')
      return { ok: false }
    })
    await app.inject({ method: 'GET', url: `/sign-in/callback?code=${secret('query-code')}` })
    await app.close()
    expect(out.raw()).not.toMatch(/synthetic-/)
    const incoming = out.lines.find((l) => l['msg'] === 'incoming request')
    expect(incoming?.['req']).toMatchObject({ method: 'GET', path: '/sign-in/callback' })
    const failed = out.lines.find((l) => l['msg'] === 'callback failed')
    expect(failed?.['err']).toMatchObject({ type: 'Error', message: 'provider refused', token: REDACTED })
    const done = out.lines.find((l) => l['msg'] === 'request completed')
    expect(done?.['res']).toEqual({ statusCode: 200 })
  })

  it('replaces a malformed incoming request ID with a new one', async () => {
    const app = await buildApp({ config: testConfig() })
    const res = await app.inject({ method: 'GET', url: '/', headers: { 'x-request-id': 'bad id\n' } })
    await app.close()
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/)
  })
})
