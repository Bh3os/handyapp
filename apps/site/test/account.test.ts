// Optional customer accounts in the browser (TSK-0036; HH-ID-10, HH-ID-11, HH-ID-03, HH-INT-14, OWN-DEC-63,
// OWN-DEC-87, RULE-NO-INVENTED-FACTS). Synthetic values only (RULE-SYNTHETIC-DATA).
import { readFileSync } from 'node:fs'
import { customerTranslator, type CustomerKey } from '@handyhub/i18n'
import { describe, expect, it } from 'vitest'
import { accountApi, accountNotice, contactProblem, parseAccount, parseEnrollChannels } from '../src/account/account.js'
import { enrollChannels } from '../src/request/ContactVerification.js'
import { copyProblems } from '../src/site/claims.js'
import type { ContactStatus, Fetch } from '../src/request/verification.js'

const { t } = customerTranslator()
const catalog = JSON.parse(
  readFileSync(new URL('../../../packages/i18n/src/catalogs/customer.en.json', import.meta.url), 'utf8'),
) as Record<string, string>
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const CAP = ['Synthetic', 'receipt', 'capability'].join('_').padEnd(43, 'x')

function fakeFetch(answer: { status: number; body?: unknown }) {
  const calls: { url: string; init: RequestInit }[] = []
  const f: Fetch = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response(answer.status === 204 ? null : JSON.stringify(answer.body ?? {}), {
      status: answer.status,
      headers: { 'content-type': 'application/json' },
    })
  }
  return { f, calls }
}
const ACCOUNT = {
  email: 'c***@example.test',
  phone: null,
  projects: [{ reference: 'HH-0000000A' }],
  freshVerification: true,
  emailChange: 'not_configured',
  texts: 'unavailable',
}

describe('the account answers are read defensively (TSK-0036)', () => {
  it('[HH-ID-10][HH-PORT-09] an account names its masked sign-in values and the references of its projects only', () => {
    expect(parseAccount(ACCOUNT)).toEqual({ ...ACCOUNT, projects: ['HH-0000000A'] })
    expect(parseAccount({ ...ACCOUNT, emailChange: 'maybe' })).toBeNull()
    // TSK-0149: whether codes can go by text is one of two words, never missing.
    expect(parseAccount({ ...ACCOUNT, texts: undefined })).toBeNull()
    expect(parseAccount({ ...ACCOUNT, projects: [{ id: 'x' }] })).toBeNull()
    expect(parseAccount(null)).toBeNull()
    expect(parseEnrollChannels({ channels: [{ channel: 'email', destination: 'c***@example.test' }] })).toEqual([
      { channel: 'email', destination: 'c***@example.test' },
    ])
    expect(parseEnrollChannels({ channels: [{ channel: 'fax', destination: 'x' }] })).toBeNull()
  })

  it('[HH-INT-14][HH-ID-10] the receipt offers only the verified values; the phone only when it can be texted', () => {
    const row = (state: string, available = true) => ({ destination: 'masked', state, available, change: null })
    const status = (email: string, phone: string, texts = true) =>
      ({ email: row(email), phone: row(phone, texts) }) as unknown as ContactStatus
    expect(enrollChannels(status('verified', 'unverified'))).toEqual([{ channel: 'email', destination: 'masked' }])
    expect(enrollChannels(status('pending', 'verified')).map((c) => c.channel)).toEqual(['phone'])
    expect(enrollChannels(status('verified', 'verified', false)).map((c) => c.channel)).toEqual(['email'])
    expect(enrollChannels(status('expired', 'failed'))).toEqual([])
  })
})

describe('the account calls (TSK-0036, HH-ID-10, HH-ID-11)', () => {
  it('[HH-ID-10] sign-in sends the typed contact and the code in POST bodies only; nothing goes in a URL', async () => {
    const sent = fakeFetch({ status: 202, body: { accepted: true, codeMinutes: 10 } })
    expect(await accountApi.sendSignInCode(sent.f, ' c@example.test ')).toEqual({ ok: true, data: { minutes: 10 } })
    expect(sent.calls[0]?.url).toBe('/api/v1/public/account/sign-in/codes')
    expect(JSON.parse(String(sent.calls[0]?.init.body))).toEqual({ contact: 'c@example.test' })
    const signed = fakeFetch({ status: 200, body: { account: ACCOUNT } })
    const r = await accountApi.signIn(signed.f, 'c@example.test', ' 123456 ')
    expect(r).toMatchObject({ ok: true, data: { projects: ['HH-0000000A'] } })
    expect(JSON.parse(String(signed.calls[0]?.init.body))).toEqual({ contact: 'c@example.test', code: '123456' })
    for (const c of [...sent.calls, ...signed.calls]) expect(c.url).not.toContain('example.test')
  })

  it('[HH-INT-14] the receipt enrollment carries the receipt capability; the guest-link one carries only the cookie', async () => {
    const receipt = fakeFetch({ status: 202, body: { sent: { destination: 'c***@example.test', expiresAt: 'x' } } })
    await accountApi.sendEnrollCode(receipt.f, { kind: 'receipt', capability: CAP }, 'email')
    expect(receipt.calls[0]?.url).toBe('/api/v1/public/request-receipt/account/codes')
    expect((receipt.calls[0]?.init.headers as Record<string, string>)['receipt-capability']).toBe(CAP)
    const link = fakeFetch({ status: 200, body: { account: ACCOUNT } })
    await accountApi.enroll(link.f, { kind: 'link' }, 'email', '123456')
    expect(link.calls[0]?.url).toBe('/api/v1/customer/account/enrollment')
    expect((link.calls[0]?.init.headers as Record<string, string>)['receipt-capability']).toBeUndefined()
    expect(link.calls[0]?.init.credentials).toBe('same-origin')
  })

  it('[HH-ID-11] no account session reads as signed out; Sign Out is a POST', async () => {
    expect(await accountApi.account(fakeFetch({ status: 401, body: {} }).f)).toEqual({ ok: true, data: null })
    expect(await accountApi.account(fakeFetch({ status: 404, body: {} }).f)).toEqual({ ok: true, data: null })
    const out = fakeFetch({ status: 204 })
    expect(await accountApi.signOut(out.f)).toEqual({ ok: true, data: true })
    expect(out.calls[0]).toMatchObject({ url: '/api/v1/customer/session/sign-out', init: { method: 'POST' } })
    // TSK-0149 (OWN-DEC-198 F2): Sign out everywhere is its own POST.
    const everywhere = fakeFetch({ status: 204 })
    expect(await accountApi.signOutEverywhere(everywhere.f)).toEqual({ ok: true, data: true })
    expect(everywhere.calls[0]).toMatchObject({
      url: '/api/v1/customer/account/sign-out-everywhere',
      init: { method: 'POST', credentials: 'same-origin' },
    })
  })

  it('[HH-ID-03][HH-ID-11] refusals in the customer’s words, none of which says whether an account exists', () => {
    const n = (field?: string, status = 400) =>
      accountNotice({ status, notice: { key: 'request.verify.error.failed' }, ...(field ? { field } : {}) })
    expect(n('invalid_contact')).toEqual({ key: 'access.recover.error.contact' })
    expect(n('not_verified')).toEqual({ key: 'account.enroll.notVerified' })
    // TSK-0149 (F4): the same words for every phone while texts cannot be used.
    expect(n('texts_unavailable')).toEqual({ key: 'account.textsUnavailable' })
    expect(n('email_in_use', 409)).toEqual({ key: 'account.email.inUse' })
    expect(n(undefined, 403)).toEqual({ key: 'account.email.confirmFirst' })
    expect(n(undefined, 503)).toEqual({ key: 'account.notConfigured' })
    expect(contactProblem('  ')).toBe('access.recover.error.contact')
    expect(contactProblem('c@example.test')).toBeNull()
  })
})

describe('the account wording (TSK-0036, HH-ID-03, HH-BASE-04, OWN-DEC-63, OWN-DEC-87)', () => {
  const keys = Object.keys(catalog).filter((k) => k.startsWith('account.'))
  const text = (key: string) => t(key as CustomerKey, { minutes: 10, reference: 'HH-0000000A' })

  it('[HH-ID-03] before a code is entered nothing says whether an account or earlier records exist', () => {
    for (const key of keys.filter((k) => k.startsWith('account.signIn.') || k.startsWith('account.enroll.')))
      expect(text(key), key).not.toMatch(/already have|existing|earlier|previous|we found|on file|welcome back/i)
    expect(text('account.signIn.sent')).toMatch(/^If these details belong to a HandyHub account/)
  })

  it('[HH-BASE-04][OWN-DEC-63] every sentence passes the copy lint; there is no password', () => {
    expect(keys.length).toBeGreaterThan(25)
    for (const key of keys) {
      expect(copyProblems(text(key)), key).toEqual([])
      expect(text(key), key).not.toMatch(/\$|book|guarantee|24\/7/i)
    }
    expect(text('account.signIn.text')).toMatch(/there is no password/)
  })

  it('[HH-INT-01][OWN-DEC-87] the entry choice keeps the owner’s words for Create an Account and Sign in', () => {
    expect(t('request.continue.account')).toBe('Create an Account')
    expect(t('request.continue.accountText')).toBe('Keep your projects in one place and make future requests easier.')
    expect(t('request.continue.signIn')).toBe('Already have an account? Sign in')
    const owner = readFileSync(new URL('../../../kg/decisions/OWN-DEC-87.md', import.meta.url), 'utf8')
    expect(owner).toContain('Already have an account? Sign in')
  })
})
