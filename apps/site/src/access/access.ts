// The access link landing in the browser (TSK-0034; HH-ID-05, HH-ID-08, HH-ID-04, HH-INT-21, RULE-SERVER-AUTHZ,
// RULE-LANGUAGES). Pure functions and the API calls, shared by the React island and its unit tests.
// - The link is /access#<token>. The fragment never reaches a server, so the page's own GET reads and changes
//   nothing. On load the page moves the token into this tab's sessionStorage and removes it from the address bar and
//   the history entry (history.replaceState), so it is not left in the URL, bookmarks, screenshots or a referrer.
// - Nothing is sent until the visitor presses Open; the token then travels only in POST bodies. The server answers
//   where a code can go (masked), sends a code when asked, and opens the project only after the code is entered.
// - After the exchange the token is forgotten: the server-side session (an HttpOnly cookie) opens the project.
// - TSK-0035 (HH-ID-09): a link that opens nothing may ask for a new one (reissue, POST body only); every accepted
//   request has one answer, so the page never says whether a request or contact exists.
import { customerTranslator, type CustomerKey } from '@handyhub/i18n'
import { problemNotice, type Channel, type Fetch, type Notice } from '../request/verification.js'

const t = (key: CustomerKey, values?: Record<string, string | number>) => customerTranslator().t(key, values)

/** The link token as the server issues it (43 base64url characters). */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/
/** PROPOSED key name: the token of the link this tab opened, until the exchange. */
export const TOKEN_STORAGE_KEY = 'hh.access-link'

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
type HistoryLike = Pick<History, 'replaceState'>

/** The token of a fragment (`#<token>`), or null. */
export function tokenFromHash(hash: string): string | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  return TOKEN_PATTERN.test(raw) ? raw : null
}

/**
 * Moves the fragment's token into this tab's storage and clears it from the address bar and the history entry.
 * Returns the token to use: the new one, or the one this tab kept from an earlier visit (a reload).
 */
export function takeToken(
  loc: { hash: string; pathname: string },
  storage: StorageLike | null,
  history: HistoryLike | null,
): string | null {
  const fresh = tokenFromHash(loc.hash)
  if (loc.hash) history?.replaceState(null, '', loc.pathname)
  if (fresh) {
    try {
      storage?.setItem(TOKEN_STORAGE_KEY, fresh)
    } catch {
      // Storage blocked: the token is still used for this visit.
    }
    return fresh
  }
  let kept: string | null
  try {
    kept = storage?.getItem(TOKEN_STORAGE_KEY) ?? null
  } catch {
    kept = null
  }
  return kept && TOKEN_PATTERN.test(kept) ? kept : null
}

/** Forgets the token (after the exchange, or when the server says it opens nothing). */
export function forgetToken(storage: StorageLike | null): void {
  try {
    storage?.removeItem(TOKEN_STORAGE_KEY)
  } catch {
    // Nothing to forget.
  }
}

export function tabStorage(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

export type AccessChannel = { channel: Channel; destination: string }
export type ProjectGlance = {
  reference: string
  submittedAt: string
  requestState: string
  services: string[]
  notSure: boolean
}
export type Result<T> =
  | { ok: true; data: T }
  /** `field`: the first field error's code, when the server named one (for example code_ended). */
  | { ok: false; status: number; notice: Notice; field?: string }

const isChannel = (c: unknown): c is Channel => c === 'email' || c === 'phone'

export function parseChannels(raw: unknown): AccessChannel[] | null {
  const list = (raw as { channels?: unknown } | null)?.channels
  if (!Array.isArray(list)) return null
  const out: AccessChannel[] = []
  for (const c of list as Record<string, unknown>[]) {
    if (!c || !isChannel(c['channel']) || typeof c['destination'] !== 'string') return null
    out.push({ channel: c['channel'], destination: c['destination'] })
  }
  return out
}

export function parseGlance(raw: unknown): ProjectGlance | null {
  const g = raw as Record<string, unknown> | null
  if (!g || typeof g !== 'object') return null
  if (typeof g['reference'] !== 'string' || typeof g['submittedAt'] !== 'string') return null
  if (typeof g['requestState'] !== 'string' || typeof g['notSure'] !== 'boolean') return null
  const services = g['services']
  if (!Array.isArray(services) || !services.every((s) => typeof s === 'string')) return null
  return {
    reference: g['reference'],
    submittedAt: g['submittedAt'],
    requestState: g['requestState'],
    services: services as string[],
    notSure: g['notSure'],
  }
}

/** The project's state in the customer's words: only the label the owner's journey gives (C03); none otherwise. */
export function stateLabel(requestState: string): string | null {
  return requestState === 'received' ? t('access.project.state.received') : null
}

/** "Sent" date in English; the browser's own time zone. */
export function sentText(submittedAt: string): string {
  const d = new Date(submittedAt)
  if (Number.isNaN(d.getTime())) return ''
  return t('access.project.sent', { date: new Intl.DateTimeFormat('en-US', { dateStyle: 'long' }).format(d) })
}

async function call<T>(
  fetchImpl: Fetch,
  url: string,
  init: { method: 'GET' | 'POST'; body?: unknown },
  read: (data: unknown) => T | null,
): Promise<Result<T>> {
  let res: Response
  try {
    res = await fetchImpl(url, {
      method: init.method,
      credentials: 'same-origin',
      headers: {
        accept: 'application/json',
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    })
  } catch {
    return { ok: false, status: 0, notice: { key: 'request.verify.error.failed' } }
  }
  const data = (await res.json().catch(() => null)) as unknown
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

/**
 * The recovery form's refusals in the customer's words (TSK-0035, HH-ID-09). The server answers every well-formed
 * request the same way, so these only ever concern the form itself, the network's limit or a sending that is not
 * configured; none says whether a request or contact exists.
 */
export function recoveryNotice(r: { status: number; notice: Notice; field?: string }): Notice {
  if (r.field === 'invalid_contact') return { key: 'access.recover.error.contact' }
  if (r.field === 'required') return { key: 'access.recover.error.reference' }
  if (r.status === 503) return { key: 'access.recover.notConfigured' }
  return r.notice
}

/** The fields of the recovery form; the reference only when this tab holds no old link. */
export type RecoveryForm = { contact: string; reference: string }

/** Client-side checks before sending (the server checks again): which fields are empty. */
export function recoveryProblems(form: RecoveryForm, withReference: boolean): ('contact' | 'reference')[] {
  return [
    ...(withReference && !form.reference.trim() ? (['reference'] as const) : []),
    ...(!form.contact.trim() ? (['contact'] as const) : []),
  ]
}

const BASE = '/api/v1/public/access'

export const accessApi = {
  open: (f: Fetch, token: string) => call(f, `${BASE}/open`, { method: 'POST', body: { token } }, parseChannels),
  send: (f: Fetch, token: string, channel: Channel) =>
    call(f, `${BASE}/codes`, { method: 'POST', body: { token, channel } }, (data) => {
      const sent = (data as { sent?: { destination?: unknown; expiresAt?: unknown } } | null)?.sent
      return typeof sent?.destination === 'string' && typeof sent.expiresAt === 'string'
        ? { sentTo: sent.destination, expiresAt: sent.expiresAt }
        : null
    }),
  exchange: (f: Fetch, token: string, channel: Channel, code: string) =>
    call(f, `${BASE}/exchange`, { method: 'POST', body: { token, channel, code: code.trim() } }, (data) => {
      const ref = (data as { project?: { reference?: unknown } } | null)?.project?.reference
      return typeof ref === 'string' ? { reference: ref } : null
    }),
  /**
   * Asks for a new link (TSK-0035): the old link this tab holds, or the reference, and the contact on the request.
   * The token travels only in the POST body. Every accepted request has the same answer.
   */
  reissue: (f: Fetch, input: { token: string | null; reference: string; contact: string }) =>
    call(
      f,
      `${BASE}/reissue`,
      {
        method: 'POST',
        body: {
          ...(input.token ? { token: input.token } : { reference: input.reference.trim() }),
          contact: input.contact.trim(),
        },
      },
      (data) => ((data as { accepted?: unknown } | null)?.accepted === true ? { accepted: true as const } : null),
    ),
  /** The projects this browser's session opens; an empty list without a session. */
  session: async (f: Fetch): Promise<Result<string[]>> => {
    const r = await call(f, '/api/v1/customer/access/session', { method: 'GET' }, (data) => {
      const list = (data as { projects?: { reference?: unknown }[] } | null)?.projects
      return Array.isArray(list) && list.every((p) => typeof p?.reference === 'string')
        ? list.map((p) => p.reference as string)
        : null
    })
    return !r.ok && r.status === 401 ? { ok: true, data: [] } : r
  },
  project: (f: Fetch, reference: string) =>
    call(f, `/api/v1/customer/projects/${encodeURIComponent(reference)}`, { method: 'GET' }, parseGlance),
}
