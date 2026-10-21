// The access link landing in the browser (TSK-0034; HH-ID-05, HH-ID-08, HH-ID-04, HH-INT-21, OWN-DEC-97,
// RULE-NO-INVENTED-FACTS). Synthetic values only (RULE-SYNTHETIC-DATA).
import { readFileSync } from 'node:fs'
import { customerTranslator } from '@handyhub/i18n'
import { describe, expect, it } from 'vitest'
import { copyProblems } from '../src/site/claims.js'
import {
  accessApi,
  forgetToken,
  parseChannels,
  parseGlance,
  sentText,
  stateLabel,
  takeToken,
  tokenFromHash,
  TOKEN_STORAGE_KEY,
} from '../src/access/access.js'
import type { Fetch } from '../src/request/verification.js'

const { t } = customerTranslator()
const catalog = JSON.parse(
  readFileSync(new URL('../../../packages/i18n/src/catalogs/customer.en.json', import.meta.url), 'utf8'),
) as Record<string, string>
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const TOKEN = 'Synthetic_access_link'.padEnd(43, 'x')

function memoryStorage() {
  const m = new Map<string, string>()
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  }
}
function fakeFetch(answer: { status: number; body?: unknown }) {
  const calls: { url: string; init: RequestInit }[] = []
  const f: Fetch = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response(JSON.stringify(answer.body ?? {}), {
      status: answer.status,
      headers: { 'content-type': 'application/json' },
    })
  }
  return { f, calls }
}

describe('the token leaves the address bar at once (TSK-0034, HH-ID-08, HH-ID-05)', () => {
  it('[HH-ID-08] the fragment’s token moves into this tab’s storage and the URL is replaced without it', () => {
    expect(TOKEN).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const storage = memoryStorage()
    const replaced: string[] = []
    const history = {
      replaceState: (_d: unknown, _u: string, url?: string | URL | null) => void replaced.push(String(url)),
    }
    expect(takeToken({ hash: `#${TOKEN}`, pathname: '/access' }, storage, history)).toBe(TOKEN)
    expect(replaced).toEqual(['/access'])
    expect(storage.m.get(TOKEN_STORAGE_KEY)).toBe(TOKEN)
    // A reload (no fragment) uses the kept token; a malformed fragment is cleared and opens nothing.
    expect(takeToken({ hash: '', pathname: '/access' }, storage, history)).toBe(TOKEN)
    expect(replaced).toEqual(['/access'])
    forgetToken(storage)
    expect(takeToken({ hash: '#not-a-token', pathname: '/access' }, storage, history)).toBeNull()
    expect(replaced).toEqual(['/access', '/access'])
    expect(tokenFromHash(`#${TOKEN}x`)).toBeNull()
    expect(takeToken({ hash: `#${TOKEN}`, pathname: '/access' }, null, null)).toBe(TOKEN)
  })

  it('[HH-ID-05][HH-ID-08] the token travels only in POST bodies, never in a URL', async () => {
    const { f, calls } = fakeFetch({
      status: 200,
      body: { channels: [{ channel: 'email', destination: 'c***@x.test' }] },
    })
    expect(await accessApi.open(f, TOKEN)).toEqual({
      ok: true,
      data: [{ channel: 'email', destination: 'c***@x.test' }],
    })
    await accessApi.send(f, TOKEN, 'email')
    await accessApi.exchange(f, TOKEN, 'email', ' 123456 ')
    expect(calls.map((c) => [c.url, c.init.method])).toEqual([
      ['/api/v1/public/access/open', 'POST'],
      ['/api/v1/public/access/codes', 'POST'],
      ['/api/v1/public/access/exchange', 'POST'],
    ])
    for (const c of calls) expect(c.url).not.toContain(TOKEN)
    expect(JSON.parse(String(calls[2]?.init.body))).toEqual({ token: TOKEN, channel: 'email', code: '123456' })
  })

  it('[HH-ID-04] no session reads as no projects; a link that opens nothing is a 404 the page shows neutrally', async () => {
    expect(await accessApi.session(fakeFetch({ status: 401, body: { error: { code: 'UNAUTHENTICATED' } } }).f)).toEqual(
      {
        ok: true,
        data: [],
      },
    )
    const gone = await accessApi.open(fakeFetch({ status: 404, body: { error: { code: 'NOT_FOUND' } } }).f, TOKEN)
    expect(gone.ok ? null : gone.status).toBe(404)
    expect(parseChannels({ channels: [{ channel: 'fax', destination: 'x' }] })).toBeNull()
    expect(parseGlance({ reference: 'HH-7K3QABCD' })).toBeNull()
  })
})

describe('the opened project in the customer’s words (TSK-0034, HH-INT-21, RULE-NO-INVENTED-FACTS)', () => {
  it('[HH-INT-21] only the journey’s own label is shown for a state; other states show none', () => {
    expect(stateLabel('received')).toBe('Request received · HandyHub will review the details')
    expect(stateLabel('reviewing')).toBeNull()
    expect(sentText('2026-10-21T12:00:00.000Z')).toMatch(/^Sent on October 2[01], 2026$/)
    expect(sentText('not a date')).toBe('')
    expect(t('request.receipt.viewRequest')).toBe('View My Request')
  })

  it('[RULE-NO-INVENTED-FACTS] the access page wording claims no price, booking, guarantee or hours', () => {
    for (const [key, text] of Object.entries(catalog).filter(([k]) => k.startsWith('access.'))) {
      expect(copyProblems(text), key).toEqual([])
      expect(text, key).not.toMatch(/\$|book|guarantee|24\/7|\d/i)
    }
  })
})
