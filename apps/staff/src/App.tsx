// Staff app (TSK-0014; HH-STAFF-01, OWN-DEC-114): sign-in, "Forgot password?", setting a password from an invite or
// reset link, and the signed-in shell with Sign out. Text comes from the staff catalogs (HH-LANG-02); the signed-in
// staff member's locale replaces the default once the session is known. Role navigation arrives with TSK-0040.
import { staffTranslator, type StaffKey, type StaffLocale } from '@handyhub/i18n'
import { Button, Card, Field, StateView } from '@handyhub/ui'
import { useEffect, useState, type FormEvent } from 'react'
import { call, type ApiErrorBody, type Fetch } from './api'

type Session = { staffUserId: string; displayName: string | null; email: string; locale: StaffLocale; roles: string[] }

/** PROPOSED password minimum (apps/server/src/modules/identity/passwords.ts PASSWORD_MIN_LENGTH). */
const PASSWORD_MIN = 15

export type Route =
  { page: 'home' } | { page: 'sign-in' } | { page: 'set-password'; purpose: 'invite' | 'reset'; token: string }

/** The page for a path below the app's base (/staff/ when served by the server). */
export function routeOf(path: string, base = '/'): Route {
  const rest = path.startsWith(base) ? path.slice(base.length - 1) : path
  const m = /^\/(invite|reset)\/([A-Za-z0-9_-]{1,100})\/?$/.exec(rest)
  if (m) return { page: 'set-password', purpose: m[1] as 'invite' | 'reset', token: m[2] as string }
  if (/^\/sign-in\/?$/.test(rest)) return { page: 'sign-in' }
  return { page: 'home' }
}

const FIELD_KEYS: Record<string, StaffKey> = {
  required: 'error.field.required',
  minLength: 'error.field.tooShort',
  maxLength: 'error.field.tooLong',
  passwordCommon: 'error.field.passwordCommon',
}

function useT(locale: StaffLocale) {
  return staffTranslator(locale).t
}

function errorText(t: ReturnType<typeof useT>, error: ApiErrorBody): string {
  const key = `error.${error.code}` as StaffKey
  try {
    return t(key)
  } catch {
    return t('error.INTERNAL')
  }
}

function fieldText(t: ReturnType<typeof useT>, error: ApiErrorBody | null, field: string): string | undefined {
  const f = error?.fieldErrors.find((e) => e.field === `body.${field}`)
  return f ? t(FIELD_KEYS[f.code] ?? 'error.field.invalid') : undefined
}

export interface AppProps {
  locale?: StaffLocale
  /** The current path; defaults to the browser location. */
  path?: string
  /** The app's base path; defaults to the build's base (/staff/). */
  base?: string
  fetchImpl?: Fetch
  navigate?: (to: string) => void
}

export function App({ locale: initialLocale = 'en', path, base, fetchImpl, navigate }: AppProps) {
  const appBase = base ?? (import.meta.env.BASE_URL || '/')
  const doFetch: Fetch = fetchImpl ?? ((...a) => fetch(...a))
  const [current, setCurrent] = useState(() => path ?? window.location.pathname)
  const go = (to: string) => {
    const target = `${appBase.replace(/\/$/, '')}${to}`
    if (navigate) navigate(target)
    else window.history.pushState(null, '', target)
    setCurrent(target)
  }
  const route = routeOf(current, appBase)
  const [session, setSession] = useState<Session | null | undefined>(route.page === 'home' ? undefined : null)
  const locale = session?.locale ?? initialLocale
  const t = useT(locale)

  useEffect(() => {
    if (route.page !== 'home') return
    let live = true
    void call<Session>(doFetch, '/auth/session').then((r) => {
      if (!live) return
      if (r.ok) setSession(r.data)
      else {
        setSession(null)
        go('/sign-in')
      }
    })
    return () => {
      live = false
    }
  }, [route.page])

  return (
    <div className="staff-app" lang={locale}>
      <header className="staff-app__bar">
        <p className="staff-app__brand">{t('app.title')}</p>
      </header>
      <main className="staff-app__main">
        {route.page === 'sign-in' ? (
          <SignIn t={t} fetchImpl={doFetch} onSignedIn={(s) => (setSession(s), go('/'))} />
        ) : route.page === 'set-password' ? (
          <SetPassword
            t={t}
            fetchImpl={doFetch}
            purpose={route.purpose}
            token={route.token}
            onDone={() => go('/sign-in')}
          />
        ) : session ? (
          <Home t={t} fetchImpl={doFetch} session={session} onSignedOut={() => (setSession(null), go('/sign-in'))} />
        ) : (
          <StateView kind="loading" title={t('common.loading')} />
        )}
      </main>
    </div>
  )
}

type T = ReturnType<typeof useT>

function SignIn({ t, fetchImpl, onSignedIn }: { t: T; fetchImpl: Fetch; onSignedIn: (s: Session) => void }) {
  const [mode, setMode] = useState<'sign-in' | 'forgot' | 'sent'>('sign-in')
  const [error, setError] = useState<ApiErrorBody | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setPending(true)
    setError(null)
    if (mode === 'forgot') {
      const r = await call(fetchImpl, '/auth/password/forgot', { method: 'POST', body: { email: form.get('email') } })
      setPending(false)
      if (r.ok) setMode('sent')
      else setError(r.error)
      return
    }
    const r = await call<Session>(fetchImpl, '/auth/sign-in', {
      method: 'POST',
      body: { email: form.get('email'), password: form.get('password') },
    })
    setPending(false)
    if (r.ok) onSignedIn(r.data)
    else setError(r.error)
  }

  if (mode === 'sent')
    return (
      <Card title={t('forgot.heading')} headingLevel={2}>
        <StateView kind="success" title={t('forgot.sent')} />
        <Button variant="quiet" onClick={() => setMode('sign-in')}>
          {t('forgot.back')}
        </Button>
      </Card>
    )

  return (
    <section className="staff-auth">
      <h1 className="hh-h3">{mode === 'forgot' ? t('forgot.heading') : t('signIn.heading')}</h1>
      {mode === 'forgot' ? <p>{t('forgot.intro')}</p> : null}
      {error && error.fieldErrors.length === 0 ? <StateView kind="error" title={errorText(t, error)} /> : null}
      <form className="staff-auth__form" onSubmit={(e) => void submit(e)} noValidate>
        <Field
          label={t('signIn.email')}
          name="email"
          type="email"
          autoComplete="username"
          required
          {...optional(fieldText(t, error, 'email'))}
        />
        {mode === 'sign-in' ? (
          <Field
            label={t('signIn.password')}
            name="password"
            type="password"
            autoComplete="current-password"
            required
            {...optional(fieldText(t, error, 'password'))}
          />
        ) : null}
        <Button type="submit" pending={pending}>
          {mode === 'forgot' ? t('forgot.submit') : t('signIn.submit')}
        </Button>
      </form>
      <Button variant="quiet" onClick={() => (setError(null), setMode(mode === 'forgot' ? 'sign-in' : 'forgot'))}>
        {mode === 'forgot' ? t('forgot.back') : t('signIn.forgot')}
      </Button>
    </section>
  )
}

const optional = (error: string | undefined) => (error === undefined ? {} : { error })

function SetPassword({
  t,
  fetchImpl,
  purpose,
  token,
  onDone,
}: {
  t: T
  fetchImpl: Fetch
  purpose: 'invite' | 'reset'
  token: string
  onDone: () => void
}) {
  const [error, setError] = useState<ApiErrorBody | null>(null)
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState(false)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const password = new FormData(e.currentTarget).get('password')
    setPending(true)
    setError(null)
    const r = await call(fetchImpl, '/auth/password/set', { method: 'POST', body: { token, password } })
    setPending(false)
    if (r.ok) setDone(true)
    else setError(r.error)
  }

  const heading = purpose === 'invite' ? t('setPassword.headingInvite') : t('setPassword.headingReset')
  if (done)
    return (
      <section className="staff-auth">
        <h1 className="hh-h3">{heading}</h1>
        <StateView
          kind="success"
          title={t('setPassword.done')}
          action={<Button onClick={onDone}>{t('signIn.submit')}</Button>}
        />
      </section>
    )
  if (error?.code === 'LINK_INVALID')
    return (
      <section className="staff-auth">
        <h1 className="hh-h3">{heading}</h1>
        <StateView
          kind="blocked"
          title={t('setPassword.invalid')}
          action={
            <Button variant="secondary" onClick={onDone}>
              {t('forgot.back')}
            </Button>
          }
        />
      </section>
    )
  return (
    <section className="staff-auth">
      <h1 className="hh-h3">{heading}</h1>
      {error && error.fieldErrors.length === 0 ? <StateView kind="error" title={errorText(t, error)} /> : null}
      <form className="staff-auth__form" onSubmit={(e) => void submit(e)} noValidate>
        <Field
          label={t('setPassword.password')}
          name="password"
          type="password"
          autoComplete="new-password"
          hint={t('setPassword.hint', { min: PASSWORD_MIN })}
          required
          {...optional(fieldText(t, error, 'password'))}
        />
        <Button type="submit" pending={pending}>
          {t('setPassword.submit')}
        </Button>
      </form>
    </section>
  )
}

function Home({
  t,
  fetchImpl,
  session,
  onSignedOut,
}: {
  t: T
  fetchImpl: Fetch
  session: Session
  onSignedOut: () => void
}) {
  const [pending, setPending] = useState(false)
  async function signOut() {
    setPending(true)
    await call(fetchImpl, '/auth/sign-out', { method: 'POST' })
    setPending(false)
    onSignedOut()
  }
  return (
    <section>
      <h1 className="hh-h3">{t('home.signedInAs', { name: session.displayName ?? session.email })}</h1>
      <Button variant="secondary" pending={pending} onClick={() => void signOut()}>
        {t('home.signOut')}
      </Button>
    </section>
  )
}
