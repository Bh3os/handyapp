// Optional customer accounts in the browser (TSK-0036; HH-ID-10, HH-ID-11, HH-ID-03, HH-INT-14, OWN-DEC-63,
// RULE-SERVER-AUTHZ, RULE-LANGUAGES). Pure functions and the API calls, shared by the React islands and their tests.
// - There is no password: sign-in sends a one-time code to the email or mobile phone the customer types, and the
//   server answers every well-formed request the same way, so the page never says whether an account exists.
// - Enrollment (Create an Account) starts from the receipt (its capability header) or from the project's guest-link
//   session (its cookie): a code goes to a contact value that is already verified, and the account exists only after
//   that code is entered.
// - The session is an HttpOnly cookie set by the server; nothing here stores a token, a code or a contact value.
import { customerTranslator, type CustomerKey } from '@handyhub/i18n'
import { CAPABILITY_HEADER, problemNotice, type Channel, type Fetch, type Notice } from '../request/verification.js'

const t = (key: CustomerKey, values?: Record<string, string | number>) => customerTranslator().t(key, values)

export type AccountSummary = {
  email: string | null
  phone: string | null
  projects: string[]
  freshVerification: boolean
  emailChange: 'available' | 'not_configured'
}
export type EnrollChannel = { channel: Channel; destination: string }
export type Sent = { sentTo: string; expiresAt: string }

export type Result<T> =
  | { ok: true; data: T }
  /** `field`: the first field error's code, when the server named one (for example invalid_code). */
  | { ok: false; status: number; notice: Notice; field?: string }

const isChannel = (c: unknown): c is Channel => c === 'email' || c === 'phone'

export function parseAccount(raw: unknown): AccountSummary | null {
  const a = raw as Record<string, unknown> | null
  if (!a || typeof a !== 'object') return null
  const email = a['email']
  const phone = a['phone']
  if ((email !== null && typeof email !== 'string') || (phone !== null && typeof phone !== 'string')) return null
  const projects = a['projects']
  if (!Array.isArray(projects)) return null
  const refs: string[] = []
  for (const p of projects as { reference?: unknown }[]) {
    if (typeof p?.reference !== 'string') return null
    refs.push(p.reference)
  }
  if (typeof a['freshVerification'] !== 'boolean') return null
  const change = a['emailChange']
  if (change !== 'available' && change !== 'not_configured') return null
  return { email, phone, projects: refs, freshVerification: a['freshVerification'], emailChange: change }
}

const accountOf = (data: unknown) => parseAccount((data as { account?: unknown } | null)?.account ?? null)

function parseSent(data: unknown): Sent | null {
  const sent = (data as { sent?: { destination?: unknown; expiresAt?: unknown } } | null)?.sent
  return typeof sent?.destination === 'string' && typeof sent.expiresAt === 'string'
    ? { sentTo: sent.destination, expiresAt: sent.expiresAt }
    : null
}

export function parseEnrollChannels(raw: unknown): EnrollChannel[] | null {
  const list = (raw as { channels?: unknown } | null)?.channels
  if (!Array.isArray(list)) return null
  const out: EnrollChannel[] = []
  for (const c of list as Record<string, unknown>[]) {
    if (!c || !isChannel(c['channel']) || typeof c['destination'] !== 'string') return null
    out.push({ channel: c['channel'], destination: c['destination'] })
  }
  return out
}

/**
 * The server's refusals in the customer's words. A wrong code and an unknown contact are the same refusal, and a
 * sending that is not configured says so for everyone; none of these says whether an account exists.
 */
export function accountNotice(r: { status: number; notice: Notice; field?: string }): Notice {
  if (r.field === 'invalid_contact') return { key: 'access.recover.error.contact' }
  if (r.field === 'not_verified') return { key: 'account.enroll.notVerified' }
  if (r.field === 'invalid_email') return { key: 'request.verify.error.invalidEmail' }
  if (r.field === 'unchanged') return { key: 'account.email.unchanged' }
  if (r.field === 'email_in_use') return { key: 'account.email.inUse' }
  if (r.status === 403) return { key: 'account.email.confirmFirst' }
  if (r.status === 503) return { key: 'account.notConfigured' }
  return r.notice
}

/** The sign-in form's client-side check (the server checks again). */
export function contactProblem(contact: string): CustomerKey | null {
  return contact.trim() ? null : 'access.recover.error.contact'
}

/** "Sent" text of a sign-in code: neutral, because the server never says whether a code went. */
export function signInSentText(minutes: number): string {
  return t('account.signIn.sent', { minutes })
}

async function call<T>(
  fetchImpl: Fetch,
  url: string,
  init: { method: 'GET' | 'POST'; body?: unknown; capability?: string },
  read: (data: unknown) => T | null,
): Promise<Result<T>> {
  let res: Response
  try {
    res = await fetchImpl(url, {
      method: init.method,
      credentials: 'same-origin',
      headers: {
        accept: 'application/json',
        ...(init.capability ? { [CAPABILITY_HEADER]: init.capability } : {}),
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    })
  } catch {
    return { ok: false, status: 0, notice: { key: 'request.verify.error.failed' } }
  }
  const data = res.status === 204 ? null : ((await res.json().catch(() => null)) as unknown)
  if (res.ok) {
    const parsed = read(data)
    return parsed !== null
      ? { ok: true, data: parsed }
      : { ok: false, status: res.status, notice: { key: 'request.verify.error.failed' } }
  }
  const problem = data as Parameters<typeof problemNotice>[1]
  const field = problem?.error?.fieldErrors?.[0]?.code
  return {
    ok: false,
    status: res.status,
    notice: problemNotice(res.status, problem, res.headers.get('retry-after')),
    ...(typeof field === 'string' ? { field } : {}),
  }
}

/** Where an enrollment starts: the receipt (its capability) or the project's guest-link session. */
export type EnrollFrom = { kind: 'receipt'; capability: string } | { kind: 'link' }

const enrollBase = (from: EnrollFrom) =>
  from.kind === 'receipt' ? '/api/v1/public/request-receipt/account' : '/api/v1/customer/account/enrollment'
const capOf = (from: EnrollFrom) => (from.kind === 'receipt' ? { capability: from.capability } : {})

export const accountApi = {
  /** The signed-in account; null without an account session (signed out, or a guest-link session). */
  account: async (f: Fetch): Promise<Result<AccountSummary | null>> => {
    const r = await call(f, '/api/v1/customer/account', { method: 'GET' }, parseAccount)
    return !r.ok && (r.status === 401 || r.status === 404) ? { ok: true, data: null } : r
  },
  sendSignInCode: (f: Fetch, contact: string) =>
    call(f, '/api/v1/public/account/sign-in/codes', { method: 'POST', body: { contact: contact.trim() } }, (data) => {
      const d = data as { accepted?: unknown; codeMinutes?: unknown } | null
      return d?.accepted === true && typeof d.codeMinutes === 'number' ? { minutes: d.codeMinutes } : null
    }),
  signIn: (f: Fetch, contact: string, code: string) =>
    call(
      f,
      '/api/v1/public/account/sign-in',
      { method: 'POST', body: { contact: contact.trim(), code: code.trim() } },
      accountOf,
    ),
  signOut: (f: Fetch) =>
    call(f, '/api/v1/customer/session/sign-out', { method: 'POST', body: {} }, () => true as const),
  sendEmailCode: (f: Fetch, email: string) =>
    call(f, '/api/v1/customer/account/email/codes', { method: 'POST', body: { email: email.trim() } }, parseSent),
  changeEmail: (f: Fetch, email: string, code: string) =>
    call(
      f,
      '/api/v1/customer/account/email',
      { method: 'POST', body: { email: email.trim(), code: code.trim() } },
      accountOf,
    ),
  /** The channels a guest-link session can create an account with (the receipt reads them from its own status). */
  linkChannels: (f: Fetch) => call(f, '/api/v1/customer/account/enrollment', { method: 'GET' }, parseEnrollChannels),
  sendEnrollCode: (f: Fetch, from: EnrollFrom, channel: Channel) =>
    call(f, `${enrollBase(from)}/codes`, { method: 'POST', body: { channel }, ...capOf(from) }, parseSent),
  enroll: (f: Fetch, from: EnrollFrom, channel: Channel, code: string) =>
    call(f, enrollBase(from), { method: 'POST', body: { channel, code: code.trim() }, ...capOf(from) }, accountOf),
}
