// One Owner write with its fresh sign-in (TSK-0100; ROLE-OWNER "sensitive actions need a fresh sign-in and a reason",
// TSK-0015 password re-entry). Each attempt carries an idempotency key; FRESH_AUTH_REQUIRED asks for the password, and
// the same write is then sent once more. The refusal's codes come back to the screen, which labels them.
import type { StaffKey } from '@handyhub/i18n'
import { Button, Field } from '@handyhub/ui'
import { useRef, useState, type FormEvent } from 'react'
import { call, idempotencyKey, type ApiErrorBody, type Fetch } from './api'

type T = (key: StaffKey, values?: Record<string, string | number>) => string

export type OwnerWriteResult<R> = { ok: true; data: R } | { ok: false; error: ApiErrorBody }

export function useOwnerWrite(fetchImpl: Fetch, onSession?: (s: { csrfToken: string }) => void) {
  const key = useRef<string | null>(null)
  const [pending, setPending] = useState(false)
  const [reauth, setReauth] = useState<null | (() => Promise<void>)>(null)
  const [reauthFailed, setReauthFailed] = useState(false)

  async function send<R>(
    path: string,
    body: unknown,
    done: (r: OwnerWriteResult<R>) => void,
    headers: Record<string, string> = {},
    method: 'POST' | 'PUT' = 'POST',
  ): Promise<void> {
    setPending(true)
    key.current = key.current ?? idempotencyKey()
    const r = await call<R>(fetchImpl, path, {
      method,
      body,
      headers: { 'idempotency-key': key.current, ...headers },
    })
    setPending(false)
    if (r.ok || r.status < 500) key.current = null
    if (!r.ok && r.error.code === 'FRESH_AUTH_REQUIRED') {
      setReauth(() => () => send(path, body, done, headers, method))
      return
    }
    setReauth(null)
    done(r.ok ? { ok: true, data: r.data } : { ok: false, error: r.error })
  }

  async function confirmPassword(password: string): Promise<boolean> {
    const r = await call<{ csrfToken: string }>(fetchImpl, '/staff/auth/reauth', { method: 'POST', body: { password } })
    if (!r.ok) {
      setReauthFailed(true)
      return false
    }
    setReauthFailed(false)
    onSession?.(r.data)
    const retry = reauth
    setReauth(null)
    if (retry) await retry()
    return true
  }

  return {
    send,
    pending,
    reauth: reauth !== null,
    reauthFailed,
    confirmPassword,
    cancel: () => setReauth(null),
  }
}

export type OwnerWrite = ReturnType<typeof useOwnerWrite>

/** The password prompt of a write that needs a fresh sign-in. */
export function ReauthForm({ t, w }: { t: T; w: OwnerWrite }) {
  const [password, setPassword] = useState('')
  if (!w.reauth) return null
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (await w.confirmPassword(password)) setPassword('')
  }
  return (
    <form className="staff-auth__form" onSubmit={(e) => void submit(e)} data-testid="owner-reauth">
      <p>{t('privacy.reauthIntro')}</p>
      <Field
        label={t('signIn.password')}
        name="password"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        {...(w.reauthFailed ? { error: t('privacy.reauthFailed') } : {})}
      />
      <div className="hh-button-row">
        <Button type="submit">{t('security.reauthSubmit')}</Button>
        <Button variant="quiet" onClick={w.cancel}>
          {t('staffAdmin.cancel')}
        </Button>
      </div>
    </form>
  )
}
