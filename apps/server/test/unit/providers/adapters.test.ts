import { describe, expect, it } from 'vitest'
import { BirdSmsSender, mapBirdEvent, mapBirdStatus } from '../../../src/providers/bird/index.js'
import { FakeObjectStorage, R2ObjectStorage, SIGNED_URL_MAX_SECONDS } from '../../../src/providers/r2/index.js'
import { mapResendEvent, ResendEmailSender } from '../../../src/providers/resend/index.js'
import { Secret } from '../../../src/providers/types.js'

const key = (label: string) => ['synthetic', label, 'key', '0b5d'].join('_')

type Call = { url: string; init: RequestInit }
function stubFetch(...answers: (Response | Error)[]) {
  const calls: Call[] = []
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    const next = answers.shift()
    if (!next) throw new Error('no scripted answer')
    if (next instanceof Error) throw next
    return next
  }) as unknown as typeof fetch
  return { impl, calls }
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const connectError = () => Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } })
const timeout = () => Object.assign(new Error('timed out'), { name: 'TimeoutError' })

const resend = (impl: typeof fetch) =>
  new ResendEmailSender(
    {
      adapter: 'resend',
      apiKey: new Secret(key('resend')),
      from: 'notices@example.test',
      replyTo: null,
      apiBaseUrl: 'https://api.resend.test',
    },
    impl,
  )
const bird = (impl: typeof fetch) =>
  new BirdSmsSender(
    {
      adapter: 'bird',
      apiKey: new Secret(key('bird')),
      from: '+15025550100',
      apiBaseUrl: 'https://us1.platform.bird.test',
    },
    impl,
  )
const email = {
  to: 'someone@example.test',
  subject: 'Synthetic',
  text: 'Synthetic body',
  idempotencyKey: 'job-1:receipt',
}
const sms = {
  to: '+15025550101',
  text: 'Synthetic text',
  category: 'transactional' as const,
  idempotencyKey: 'job-1:sms',
}

describe('Resend adapter (TSK-0013, INT-Resend)', () => {
  it('sends with Bearer authentication and the idempotency key, and maps the answers', async () => {
    const f = stubFetch(
      json(200, { id: 're_1' }),
      json(429, { name: 'rate_limit_exceeded' }),
      json(409, { name: 'concurrent_idempotent_requests' }),
      json(422, { name: 'validation_error', message: 'someone@example.test is invalid' }),
      json(200, {}),
      new Response('x', { status: 502 }),
    )
    const s = resend(f.impl)
    expect(await s.send(email)).toEqual({ outcome: 'accepted', providerMessageId: 're_1', status: 'queued' })
    const headers = f.calls[0]?.init.headers as Record<string, string>
    expect(f.calls[0]?.url).toBe('https://api.resend.test/emails')
    expect(headers['idempotency-key']).toBe('job-1:receipt')
    expect(headers['authorization']).toBe(`Bearer ${key('resend')}`)
    expect(JSON.parse(String(f.calls[0]?.init.body))).toMatchObject({
      from: 'notices@example.test',
      to: ['someone@example.test'],
    })
    expect(await s.send(email)).toEqual({ outcome: 'retryable_error', errorCode: 'http_429_rate_limit_exceeded' })
    expect(await s.send(email)).toMatchObject({ outcome: 'retryable_error' })
    const rejected = await s.send(email)
    expect(rejected).toEqual({ outcome: 'rejected', errorCode: 'http_422_validation_error' })
    expect(JSON.stringify(rejected)).not.toContain('someone@')
    expect(await s.send(email)).toEqual({ outcome: 'outcome_unknown', errorCode: 'malformed_response' })
    expect(await s.send(email)).toEqual({ outcome: 'retryable_error', errorCode: 'http_502' })
  })

  it('treats a connect failure as retryable and a timeout as an unknown outcome', async () => {
    const s = resend(stubFetch(connectError(), timeout()).impl)
    expect(await s.send(email)).toEqual({ outcome: 'retryable_error', errorCode: 'connect_econnrefused' })
    expect(await s.send(email)).toEqual({ outcome: 'outcome_unknown', errorCode: 'timeout' })
    expect(await s.send({ ...email, idempotencyKey: 'bad key!' })).toEqual({
      outcome: 'rejected',
      errorCode: 'invalid_request',
    })
  })

  it('maps webhook events onto delivery states', () => {
    expect(['email.sent', 'email.delivered', 'email.bounced', 'email.opened'].map(mapResendEvent)).toEqual([
      'sent',
      'delivered',
      'failed',
      null,
    ])
  })
})

describe('Bird SMS adapter (TSK-0013, INT-Bird)', () => {
  it('posts to /v1/sms/messages with the idempotency key and maps the answers', async () => {
    const f = stubFetch(
      json(202, { id: 'sms_1', status: 'accepted' }),
      json(409, { code: 'request_in_progress' }),
      json(409, { code: 'idempotency_key_reuse' }),
      json(402, { code: 'insufficient_balance' }),
      json(503, { code: 'IdempotencyUnavailable' }),
      timeout(),
    )
    const s = bird(f.impl)
    expect(await s.send(sms)).toEqual({ outcome: 'accepted', providerMessageId: 'sms_1', status: 'queued' })
    expect(f.calls[0]?.url).toBe('https://us1.platform.bird.test/v1/sms/messages')
    expect((f.calls[0]?.init.headers as Record<string, string>)['idempotency-key']).toBe('job-1:sms')
    expect(JSON.parse(String(f.calls[0]?.init.body))).toEqual({
      to: '+15025550101',
      from: '+15025550100',
      text: 'Synthetic text',
      category: 'transactional',
    })
    expect(await s.send(sms)).toEqual({ outcome: 'retryable_error', errorCode: 'http_409_request_in_progress' })
    expect(await s.send(sms)).toEqual({ outcome: 'rejected', errorCode: 'http_409_idempotency_key_reuse' })
    expect(await s.send(sms)).toEqual({ outcome: 'rejected', errorCode: 'http_402_insufficient_balance' })
    expect(await s.send(sms)).toMatchObject({ outcome: 'retryable_error' })
    expect(await s.send(sms)).toEqual({ outcome: 'outcome_unknown', errorCode: 'timeout' })
  })

  it('maps message statuses and sms.* events onto delivery states, ignoring unknown ones', () => {
    expect(
      ['accepted', 'sent', 'delivered', 'undelivered', 'expired', 'received', 'future'].map(mapBirdStatus),
    ).toEqual(['queued', 'sent', 'delivered', 'failed', 'failed', null, null])
    expect(['sms.delivered', 'sms.rejected', 'sms.received', 'sms_suppression.created'].map(mapBirdEvent)).toEqual([
      'delivered',
      'failed',
      null,
      null,
    ])
  })
})

describe('R2 storage (TSK-0013, INT-R2)', () => {
  const settings = {
    adapter: 'r2' as const,
    accountId: 'syntheticaccount',
    bucket: 'synthetic-bucket',
    accessKeyId: new Secret(key('r2id')),
    secretAccessKey: new Secret(key('r2secret')),
  }

  it('signs short-lived URLs on the private account endpoint without exposing the secret key', async () => {
    const r2 = new R2ObjectStorage(settings)
    const url = new URL(await r2.signedGetUrl('photos/abc123'))
    expect(url.host).toBe('synthetic-bucket.syntheticaccount.r2.cloudflarestorage.com')
    expect(url.pathname).toBe('/photos/abc123')
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300')
    expect(url.toString()).not.toContain(key('r2secret'))
    const put = new URL(await r2.signedPutUrl('photos/abc124', 'image/jpeg', { expiresInSeconds: 60 }))
    expect(put.searchParams.get('X-Amz-Expires')).toBe('60')
    await expect(r2.signedGetUrl('photos/abc123', { expiresInSeconds: SIGNED_URL_MAX_SECONDS + 1 })).rejects.toThrow(
      /expire within/,
    )
    await expect(r2.signedGetUrl('Photos/My House.jpg')).rejects.toThrow(/invalid object key/)
  })

  it('fake storage writes once and honours signature and expiry of its signed URLs', async () => {
    let now = 1_792_000_000_000
    const fake = new FakeObjectStorage(() => now)
    await fake.put('photos/one', new Uint8Array([1, 2, 3]), 'image/jpeg')
    await expect(fake.put('photos/one', new Uint8Array([9]), 'image/jpeg')).rejects.toThrow(/written once/)
    expect((await fake.get('photos/one')).bytes).toEqual(new Uint8Array([1, 2, 3]))
    const url = await fake.signedGetUrl('photos/one', { expiresInSeconds: 60 })
    expect(fake.resolveSignedUrl(url)).toEqual({ ok: true, method: 'GET', key: 'photos/one' })
    expect(fake.resolveSignedUrl(url.replace('photos/one', 'photos/two'))).toEqual({
      ok: false,
      reason: 'bad_signature',
    })
    now += 61_000
    expect(fake.resolveSignedUrl(url)).toEqual({ ok: false, reason: 'expired' })
  })
})
