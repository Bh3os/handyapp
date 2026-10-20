// Staff app API client (TSK-0014). Same-origin JSON calls to /api/v1; the session cookie travels on its own
// (HttpOnly, never readable here). Errors come back in the one envelope (HH-API-03).
export type ApiErrorBody = {
  code: string
  fieldErrors: { field: string; code: string }[]
  /** STALE_VERSION only: the current version and values (HH-API-04), for the conflict banner. */
  current?: { version: number; values?: Record<string, unknown> }
}
export type ApiResponse<T> = { ok: true; status: number; data: T } | { ok: false; status: number; error: ApiErrorBody }

export type Fetch = typeof fetch

let csrfToken: string | null = null
/** The session's CSRF token (TSK-0015), sent in X-CSRF-Token on every unsafe request. */
export function setCsrfToken(token: string | null): void {
  csrfToken = token
}

export async function call<T>(
  fetchImpl: Fetch,
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<ApiResponse<T>> {
  let res: Response
  try {
    res = await fetchImpl(`/api/v1${path}`, {
      method: options.method ?? 'GET',
      credentials: 'same-origin',
      headers: {
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...((options.method ?? 'GET') !== 'GET' && csrfToken ? { 'x-csrf-token': csrfToken } : {}),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    })
  } catch {
    return { ok: false, status: 0, error: { code: 'UNAVAILABLE', fieldErrors: [] } }
  }
  const text = await res.text()
  const json = text ? (JSON.parse(text) as unknown) : null
  if (res.ok) return { ok: true, status: res.status, data: json as T }
  const error = (json as { error?: ApiErrorBody } | null)?.error ?? { code: 'INTERNAL', fieldErrors: [] }
  return { ok: false, status: res.status, error }
}
