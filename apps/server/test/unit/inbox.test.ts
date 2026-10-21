// Inbound parsing, reply tokens and the Resend body reader (TSK-0049; HH-COM-07, HH-COM-10, INT-Bird, INT-Resend,
// RULE-SYNTHETIC-DATA). No network: the reader gets a scripted fetch.
import { describe, expect, it } from 'vitest'
import { ConfigError } from '../../src/config.js'
import { newReplyToken, REPLY_TOKEN, replyAddress, replyTokensIn } from '../../src/modules/inbox/index.js'
import {
  bareAddress,
  FakeInboundReader,
  htmlToText,
  messageIds,
  parseBirdInboundSms,
  parseResendInboundEmail,
  ResendInboundReader,
} from '../../src/providers/inbound.js'
import { inboundAddress, readProviderSettings } from '../../src/providers/settings.js'
import { Secret } from '../../src/providers/types.js'

const ADDRESS = { local: 'replies', domain: 'inbound.example.test' }
const apiKey = new Secret(['re', 'synthetic', 'reader', 'key'].join('_'))

describe('per-project reply tokens (TSK-0049, HH-COM-07)', () => {
  it('[HH-COM-07] tokens are random, lower-case base32 and found only on the configured receiving address', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => newReplyToken()))
    expect(tokens.size).toBe(200)
    for (const t of tokens) expect(t).toMatch(REPLY_TOKEN)
    const token = [...tokens][0] as string
    expect(replyAddress(ADDRESS, token)).toBe(`replies+${token}@inbound.example.test`)
    expect(
      replyTokensIn(
        [
          `Replies+${token.toUpperCase()}@Inbound.Example.test`,
          `other+${token}@inbound.example.test`,
          `replies+${token}@elsewhere.example.test`,
          'replies+short@inbound.example.test',
        ],
        ADDRESS,
      ),
    ).toEqual([token])
    // While no receiving address is configured nothing is read as a token.
    expect(replyTokensIn([replyAddress(ADDRESS, token)], null)).toEqual([])
  })

  it('[HH-COM-07] INBOUND_EMAIL_ADDRESS is a plain address; unset means reply tokens are not configured', () => {
    expect(inboundAddress(' Replies@Inbound.Example.test ')).toEqual(ADDRESS)
    expect(inboundAddress(undefined)).toBeNull()
    expect(() => inboundAddress('replies+x@inbound.example.test')).toThrow(ConfigError)
    expect(() => inboundAddress('not an address')).toThrow(ConfigError)
    expect(readProviderSettings({ HANDYHUB_ENV: 'staging' }).inbound.emailAddress).toBeNull()
  })
})

describe('inbound payloads (TSK-0049, HH-COM-10, INT-Bird, INT-Resend)', () => {
  it('[HH-COM-10] a Bird sms.received keeps the body, the numbers and attachment metadata only', () => {
    expect(
      parseBirdInboundSms({
        type: 'sms.received',
        data: {
          sms_id: 'sms_synthetic_1',
          from: '+15025550101',
          to: '+15025550199',
          text: 'Synthetic body',
          attachments: [{ content_type: 'image/jpeg', size: 1200, url: 'https://media.example.test/a' }],
        },
      }),
    ).toEqual({
      smsId: 'sms_synthetic_1',
      from: '+15025550101',
      to: '+15025550199',
      text: 'Synthetic body',
      attachments: [{ contentType: 'image/jpeg', size: 1200 }],
    })
    expect(parseBirdInboundSms({ data: { sms_id: 'x', from: 'not-a-number', text: 'x' } })).toBeNull()
    expect(parseBirdInboundSms({ data: { from: '+15025550101', text: 'x' } })).toBeNull()
  })

  it('[HH-COM-10] a Resend email.received gives the bare sender, every recipient and no attachment names', () => {
    const parsed = parseResendInboundEmail({
      type: 'email.received',
      data: {
        email_id: 'em-synthetic-1',
        from: 'Pat Synthetic <Pat@Example.test>',
        to: ['replies+abc@inbound.example.test'],
        cc: ['Someone <cc@example.test>'],
        received_for: ['forwarded@example.test'],
        subject: 'Synthetic subject',
        message_id: '<m1@mail.example.test>',
        attachments: [{ id: 'a1', filename: 'private-name.pdf', content_type: 'application/pdf' }],
      },
    })
    expect(parsed).toEqual({
      emailId: 'em-synthetic-1',
      from: 'pat@example.test',
      to: ['replies+abc@inbound.example.test', 'cc@example.test', 'forwarded@example.test'],
      subject: 'Synthetic subject',
      messageId: '<m1@mail.example.test>',
      attachments: [{ contentType: 'application/pdf', size: null }],
    })
    expect(JSON.stringify(parsed)).not.toContain('private-name')
    expect(parseResendInboundEmail({ data: { email_id: 'x', from: 'nobody' } })).toBeNull()
    expect(bareAddress('a@b.example')).toBe('a@b.example')
    expect(bareAddress('two@a.example, three@b.example')).toBeNull()
    expect(messageIds('<a@x.example>  <b@y.example> junk')).toEqual(['<a@x.example>', '<b@y.example>'])
  })

  it('[HH-COM-10] HTML-only email becomes plain text with scripts and tags removed', () => {
    expect(
      htmlToText(
        '<html><head><title>t</title></head><body><p>Hi&nbsp;there</p><script>alert(1)</script>Line<br>two &amp; more</body></html>',
      ),
    ).toBe('Hi there\nLine\ntwo & more')
  })
})

describe('the Resend body reader (TSK-0049, HH-COM-10, T71)', () => {
  const scripted = (status: number, body: unknown) => {
    const calls: { url: string; init: RequestInit | undefined }[] = []
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init })
      return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch
    return { calls, fetchImpl }
  }

  it('[HH-COM-10] reads the body and headers with the API key; temporary failures retry, others fail', async () => {
    const ok = scripted(200, { text: 'Synthetic', html: null, headers: { 'In-Reply-To': '<m@x.example>' } })
    const reader = new ResendInboundReader({ apiKey, apiBaseUrl: 'https://api.resend.example' }, ok.fetchImpl)
    expect(await reader.read('em-1')).toEqual({
      outcome: 'ok',
      text: 'Synthetic',
      html: null,
      headers: { 'in-reply-to': '<m@x.example>' },
    })
    expect(ok.calls[0]?.url).toBe('https://api.resend.example/emails/receiving/em-1')
    expect((ok.calls[0]?.init?.headers as Record<string, string>)['authorization']).toBe(`Bearer ${apiKey.reveal()}`)
    const busy = new ResendInboundReader(
      { apiKey, apiBaseUrl: 'https://api.resend.example' },
      scripted(503, {}).fetchImpl,
    )
    expect(await busy.read('em-1')).toEqual({ outcome: 'retryable_error', errorCode: 'http_503' })
    const missing = new ResendInboundReader(
      { apiKey, apiBaseUrl: 'https://api.resend.example' },
      scripted(404, { name: 'not_found' }).fetchImpl,
    )
    expect(await missing.read('em-1')).toEqual({ outcome: 'failed', errorCode: 'http_404_not_found' })
    expect(await missing.read('../etc')).toEqual({ outcome: 'failed', errorCode: 'invalid_request' })
    const down = new ResendInboundReader({ apiKey, apiBaseUrl: 'https://api.resend.example' }, (async () => {
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } })
    }) as typeof fetch)
    expect(await down.read('em-1')).toMatchObject({ outcome: 'retryable_error' })
  })

  it('[RULE-SYNTHETIC-DATA] the fake reads only the synthetic payload and contacts nobody', async () => {
    const fake = new FakeInboundReader()
    expect(await fake.read('em-2', { data: { text: 'From the test payload' } })).toEqual({
      outcome: 'ok',
      text: 'From the test payload',
      html: null,
      headers: {},
    })
    expect(fake.calls).toEqual(['em-2'])
  })
})
