// Staff app (TSK-0014; HH-STAFF-01, OWN-DEC-114): sign-in, "Forgot password?", setting a password from an invite or
// reset link, and the signed-in shell (TSK-0040: role navigation, EN/ES switch, offline indicator, search box) with
// Sign out (TSK-0053: the estimates list and the estimate builder; TSK-0065: the scheduling board; TSK-0098: the audit log; TSK-0099: the retention reviews; TSK-0100: Delete or Archive, the deletion log and privacy requests; TSK-0069: the job packet and the worker's packet list on My Day). Text comes from the staff catalogs (HH-LANG-02); the signed-in staff member's stored locale replaces the
// default once the session is known, and switching it keeps every open form as it is (HH-OPS-04).
import { staffTranslator, type StaffKey, type StaffLocale } from '@handyhub/i18n'
import { Button, Card, Field, StateView } from '@handyhub/ui'
import { useEffect, useState, type FormEvent } from 'react'
import { call, setCsrfToken, type ApiErrorBody, type Fetch } from './api'
import { AuditLogScreen } from './AuditLog'
import { EstimatePublishingSetting } from './EstimateLifecycle'
import { EstimateBuilder, EstimatesScreen } from './Estimates'
import { CustomerRecord, CustomersScreen } from './Customers'
import { InboxRecord, InboxScreen } from './Inbox'
import { PropertyRecord } from './Property'
import { JobDepositPage } from './JobDeposit'
import { JobPacketPage, MyJobPackets } from './JobPacket'
import { QueueHome } from './Queue'
import { MergeReview, RelinkRequest } from './RecordLinks'
import { RequestRecord } from './Record'
import { RequestsScreen } from './Requests'
import { PrivacyScreen } from './Privacy'
import { RetentionScreen } from './Retention'
import { ScheduleBoard } from './Schedule'
import { SearchScreen, Screen, Shell, type Navigation } from './Shell'
import { StaffScreen } from './StaffManagement'
import { ConfigurationScreen, HealthScreen } from './System'

type Session = {
  staffUserId: string
  displayName: string | null
  email: string
  locale: StaffLocale
  roles: string[]
  mfaEnrolled: boolean
  mfaRecommended: boolean
  csrfToken: string
  /** The menu for these roles, decided on the server from the permission matrix (TSK-0040). */
  navigation?: Navigation
}

/** PROPOSED password minimum (apps/server/src/modules/identity/passwords.ts PASSWORD_MIN_LENGTH). */
const PASSWORD_MIN = 15

export type Route =
  | { page: 'home' }
  | { page: 'sign-in' }
  | { page: 'set-password'; purpose: 'invite' | 'reset'; token: string }
  | { page: 'account' }
  | { page: 'search'; query: string }
  | { page: 'screen'; id: string }
  /** A record below a screen, as the action queue's deep links open it (TSK-0041): `/<screen>/<record id>`. */
  | { page: 'record'; screen: string; id: string }
  /** A step on a record (TSK-0046): `/customers/<id>/merge?into=<id>`, `/requests/<id>/relink`. */
  | { page: 'record-step'; screen: string; id: string; step: 'merge' | 'relink'; params: Record<string, string> }

/** The page for a path (with its query) below the app's base (/staff/ when served by the server). */
export function routeOf(path: string, base = '/'): Route {
  const [pathname = '', search = ''] = path.split('?', 2)
  const rest = pathname.startsWith(base) ? pathname.slice(base.length - 1) : pathname
  const m = /^\/(invite|reset)\/([A-Za-z0-9_-]{1,100})\/?$/.exec(rest)
  if (m) return { page: 'set-password', purpose: m[1] as 'invite' | 'reset', token: m[2] as string }
  if (/^\/sign-in\/?$/.test(rest)) return { page: 'sign-in' }
  if (/^\/account\/?$/.test(rest)) return { page: 'account' }
  if (/^\/search\/?$/.test(rest)) return { page: 'search', query: new URLSearchParams(search).get('q') ?? '' }
  const step = /^\/([a-z-]{1,40})\/([0-9a-fA-F-]{36})\/(merge|relink)\/?$/.exec(rest)
  if (step)
    return {
      page: 'record-step',
      screen: step[1] as string,
      id: (step[2] as string).toLowerCase(),
      step: step[3] as 'merge' | 'relink',
      params: Object.fromEntries(new URLSearchParams(search)),
    }
  const record = /^\/([a-z-]{1,40})\/([0-9a-fA-F-]{36})\/?$/.exec(rest)
  if (record) return { page: 'record', screen: record[1] as string, id: (record[2] as string).toLowerCase() }
  const screen = /^\/([a-z-]{1,40})\/?$/.exec(rest)
  if (screen) return { page: 'screen', id: screen[1] as string }
  return { page: 'home' }
}

const signedInPage = (route: Route) => route.page !== 'sign-in' && route.page !== 'set-password'

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

/**
 * The app's base at run time (TSK-0017): the build's base (/staff/) on the single staging host, where the app lives
 * under /staff; '/' on staff.handyhub247.com, where it is the whole host (the server serves the same files at both).
 */
export function runtimeBase(pathname: string, buildBase = '/'): string {
  const bare = buildBase.replace(/\/$/, '')
  return bare && (pathname === bare || pathname.startsWith(`${bare}/`)) ? `${bare}/` : '/'
}

export interface AppProps {
  locale?: StaffLocale
  /** The current path; defaults to the browser location. */
  path?: string
  /** The app's base path; defaults to runtimeBase() of the browser location. */
  base?: string
  fetchImpl?: Fetch
  navigate?: (to: string) => void
}

export function App({ locale: initialLocale = 'en', path, base, fetchImpl, navigate }: AppProps) {
  const appBase = base ?? runtimeBase(window.location.pathname, import.meta.env.BASE_URL || '/')
  const doFetch: Fetch = fetchImpl ?? ((...a) => fetch(...a))
  const [current, setCurrent] = useState(() => path ?? `${window.location.pathname}${window.location.search}`)
  const href = (to: string) => `${appBase.replace(/\/$/, '')}${to}`
  const go = (to: string) => {
    const target = href(to)
    if (navigate) navigate(target)
    else window.history.pushState(null, '', target)
    setCurrent(target)
  }
  const route = routeOf(current, appBase)
  const needsSession = signedInPage(route)
  const [session, setSessionState] = useState<Session | null | undefined>(needsSession ? undefined : null)
  const [signingOut, setSigningOut] = useState(false)
  // Every session response carries the session's CSRF token for unsafe requests (TSK-0015).
  const setSession = (s: Session | null | undefined) => {
    setCsrfToken(s?.csrfToken ?? null)
    setSessionState(s)
  }
  const locale = session?.locale ?? initialLocale
  const t = useT(locale)

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  // The browser's back and forward buttons move between screens too.
  useEffect(() => {
    if (path !== undefined) return
    const pop = () => setCurrent(`${window.location.pathname}${window.location.search}`)
    window.addEventListener('popstate', pop)
    return () => window.removeEventListener('popstate', pop)
  }, [path])

  useEffect(() => {
    if (!needsSession || session) return
    let live = true
    void call<Session>(doFetch, '/staff/auth/session').then((r) => {
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
  }, [needsSession])

  async function signOut() {
    setSigningOut(true)
    await call(doFetch, '/staff/auth/sign-out', { method: 'POST' })
    setSigningOut(false)
    setSession(null)
    go('/sign-in')
  }

  /** Saves the staff locale on the person's staff identity (HH-OPS-04); the screen re-renders in place. */
  async function changeLocale(next: 'en' | 'es'): Promise<boolean> {
    const r = await call<Session>(doFetch, '/staff/auth/session/locale', { method: 'PUT', body: { locale: next } })
    if (!r.ok) return false
    setSession(r.data)
    return true
  }

  if (needsSession && session) {
    const nav = session.navigation
    const shown =
      route.page === 'screen'
        ? route.id
        : route.page === 'record' || route.page === 'record-step'
          ? // A property record sits below the customer records (TSK-0045): the same menu entry and permission.
            route.screen === 'properties'
            ? 'customers'
            : // A job packet (TSK-0069) is reached from My Day or the board; the server decides who may open it.
              route.screen === 'packets'
              ? nav?.items.includes('my-day')
                ? 'my-day'
                : 'schedule'
              : route.screen
          : route.page === 'home'
            ? (nav?.home ?? 'home')
            : route.page
    const allowed = (nav?.items ?? []).includes(shown)
    return (
      <div className="staff-app" lang={locale}>
        <Shell
          t={t}
          name={session.displayName ?? session.email}
          locale={locale}
          navigation={nav}
          current={shown}
          go={go}
          href={href}
          onLocale={changeLocale}
          onSignOut={() => void signOut()}
          signingOut={signingOut}
        >
          {route.page === 'account' ? (
            <Account
              t={t}
              fetchImpl={doFetch}
              session={session}
              onSession={setSession}
              onSignedOut={() => (setSession(null), go('/sign-in'))}
            />
          ) : route.page === 'search' ? (
            <SearchScreen t={t} query={route.query} />
          ) : route.page === 'home' && !nav?.home ? (
            <StateView kind="blocked" title={t('shell.noNavigation')} />
          ) : shown === 'queue' && allowed && route.page !== 'record' ? (
            <QueueHome
              t={t}
              locale={locale}
              fetchImpl={doFetch}
              go={go}
              href={href}
              staffUserId={session.staffUserId}
            />
          ) : route.page === 'screen' && shown === 'health' && allowed ? (
            <HealthScreen t={t} locale={locale} fetchImpl={doFetch} go={go} href={href} />
          ) : route.page === 'screen' && shown === 'settings' && allowed ? (
            <>
              <ConfigurationScreen t={t} locale={locale} fetchImpl={doFetch} go={go} href={href} />
              <EstimatePublishingSetting t={t} fetchImpl={doFetch} />
            </>
          ) : route.page === 'screen' && shown === 'staff' && allowed ? (
            <StaffScreen
              t={t}
              locale={locale}
              fetchImpl={doFetch}
              onSession={(s) => setSession({ ...session, ...(s as Partial<Session>) })}
            />
          ) : route.page === 'screen' && shown === 'audit' && allowed ? (
            <AuditLogScreen t={t} locale={locale} fetchImpl={doFetch} />
          ) : route.page === 'screen' && shown === 'retention' && allowed ? (
            <RetentionScreen
              t={t}
              locale={locale}
              fetchImpl={doFetch}
              onSession={(s) => setSession({ ...session, ...(s as Partial<Session>) })}
            />
          ) : route.page === 'screen' && shown === 'privacy' && allowed ? (
            <PrivacyScreen
              t={t}
              locale={locale}
              fetchImpl={doFetch}
              onSession={(s) => setSession({ ...session, ...(s as Partial<Session>) })}
            />
          ) : route.page === 'record' && route.screen === 'packets' ? (
            <JobPacketPage key={route.id} t={t} locale={locale} fetchImpl={doFetch} jobId={route.id} />
          ) : (route.page === 'screen' || route.page === 'home') && shown === 'my-day' && allowed ? (
            <MyJobPackets t={t} fetchImpl={doFetch} href={href} />
          ) : route.page === 'screen' && shown === 'schedule' && allowed ? (
            <ScheduleBoard t={t} locale={locale} fetchImpl={doFetch} go={go} href={href} />
          ) : route.page === 'record' && route.screen === 'schedule' && allowed ? (
            // A queue item's link to a visit (TSK-0097 visit_flagged): the board opens on that visit (TSK-0065).
            <ScheduleBoard
              key={route.id}
              t={t}
              locale={locale}
              fetchImpl={doFetch}
              go={go}
              href={href}
              focusVisitId={route.id}
            />
          ) : shown === 'requests' && allowed && route.page === 'screen' ? (
            <RequestsScreen t={t} locale={locale} fetchImpl={doFetch} go={go} href={href} />
          ) : shown === 'estimates' && allowed && route.page === 'screen' ? (
            <EstimatesScreen t={t} locale={locale} fetchImpl={doFetch} go={go} href={href} />
          ) : route.page === 'record' && route.screen === 'estimates' && allowed ? (
            <EstimateBuilder key={route.id} t={t} fetchImpl={doFetch} id={route.id} go={go} href={href} />
          ) : shown === 'customers' && allowed && route.page === 'screen' ? (
            <CustomersScreen t={t} locale={locale} fetchImpl={doFetch} go={go} href={href} />
          ) : route.page === 'record' && route.screen === 'customers' && allowed ? (
            <CustomerRecord
              key={route.id}
              t={t}
              locale={locale}
              fetchImpl={doFetch}
              id={route.id}
              go={go}
              href={href}
            />
          ) : shown === 'inbox' && allowed && route.page === 'screen' ? (
            <InboxScreen t={t} locale={locale} fetchImpl={doFetch} go={go} href={href} />
          ) : route.page === 'record' && route.screen === 'inbox' && allowed ? (
            <InboxRecord key={route.id} t={t} locale={locale} fetchImpl={doFetch} id={route.id} go={go} href={href} />
          ) : route.page === 'record-step' && route.screen === 'customers' && route.step === 'merge' && allowed ? (
            <MergeReview
              key={`${route.id}-${route.params['into'] ?? ''}`}
              t={t}
              locale={locale}
              fetchImpl={doFetch}
              id={route.id}
              into={route.params['into'] ?? ''}
              go={go}
              href={href}
            />
          ) : route.page === 'record-step' && route.screen === 'requests' && route.step === 'relink' && allowed ? (
            <RelinkRequest
              key={route.id}
              t={t}
              locale={locale}
              fetchImpl={doFetch}
              requestId={route.id}
              go={go}
              href={href}
            />
          ) : route.page === 'record' && route.screen === 'properties' && allowed ? (
            <PropertyRecord
              key={route.id}
              t={t}
              locale={locale}
              fetchImpl={doFetch}
              id={route.id}
              go={go}
              href={href}
            />
          ) : route.page === 'record' && route.screen === 'payments' && allowed ? (
            <JobDepositPage key={route.id} t={t} fetchImpl={doFetch} jobId={route.id} />
          ) : route.page === 'record' && route.screen === 'requests' && allowed ? (
            <RequestRecord key={route.id} t={t} locale={locale} fetchImpl={doFetch} id={route.id} go={go} href={href} />
          ) : (
            <Screen t={t} id={shown} allowed={allowed} />
          )}
        </Shell>
      </div>
    )
  }

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
        ) : (
          <StateView kind="loading" title={t('common.loading')} />
        )}
      </main>
    </div>
  )
}

type T = ReturnType<typeof useT>

function SignIn({ t, fetchImpl, onSignedIn }: { t: T; fetchImpl: Fetch; onSignedIn: (s: Session) => void }) {
  const [mode, setMode] = useState<'sign-in' | 'forgot' | 'sent' | 'mfa'>('sign-in')
  const [useRecovery, setUseRecovery] = useState(false)
  const [error, setError] = useState<ApiErrorBody | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setPending(true)
    setError(null)
    if (mode === 'forgot') {
      const r = await call(fetchImpl, '/staff/auth/password/forgot', {
        method: 'POST',
        body: { email: form.get('email') },
      })
      setPending(false)
      if (r.ok) setMode('sent')
      else setError(r.error)
      return
    }
    if (mode === 'mfa') {
      const value = form.get('code')
      const r = await call<Session>(fetchImpl, '/staff/auth/mfa/verify', {
        method: 'POST',
        body: useRecovery ? { recoveryCode: value } : { code: value },
      })
      setPending(false)
      if (r.ok) onSignedIn(r.data)
      else setError(r.error)
      return
    }
    const r = await call<Session | { mfaRequired: true }>(fetchImpl, '/staff/auth/sign-in', {
      method: 'POST',
      body: { email: form.get('email'), password: form.get('password') },
    })
    setPending(false)
    if (r.ok && r.status === 202) setMode('mfa')
    else if (r.ok) onSignedIn(r.data as Session)
    else setError(r.error)
  }

  if (mode === 'mfa')
    return (
      <section className="staff-auth">
        <h1 className="hh-h3">{t('mfa.heading')}</h1>
        <p>{t('mfa.intro')}</p>
        {error ? <StateView kind="error" title={errorText(t, error)} /> : null}
        <form className="staff-auth__form" onSubmit={(e) => void submit(e)} noValidate>
          <Field
            key={useRecovery ? 'recovery' : 'code'}
            label={useRecovery ? t('mfa.recoveryCode') : t('mfa.code')}
            name="code"
            autoComplete="one-time-code"
            inputMode={useRecovery ? 'text' : 'numeric'}
            required
          />
          <Button type="submit" pending={pending}>
            {t('mfa.submit')}
          </Button>
        </form>
        <Button variant="quiet" onClick={() => (setError(null), setUseRecovery(!useRecovery))}>
          {useRecovery ? t('mfa.useCode') : t('mfa.useRecovery')}
        </Button>
      </section>
    )

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
    const r = await call(fetchImpl, '/staff/auth/password/set', { method: 'POST', body: { token, password } })
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

/** The person's own account: who is signed in, Sign out everywhere and optional MFA (TSK-0014, TSK-0015). */
function Account({
  t,
  fetchImpl,
  session,
  onSession,
  onSignedOut,
}: {
  t: T
  fetchImpl: Fetch
  session: Session
  onSession: (s: Session) => void
  onSignedOut: () => void
}) {
  const [pending, setPending] = useState(false)
  async function signOutEverywhere() {
    setPending(true)
    await call(fetchImpl, '/staff/auth/sessions/revoke-all', { method: 'POST' })
    setPending(false)
    onSignedOut()
  }
  return (
    <section className="staff-auth">
      <h1 className="hh-h3">{t('nav.account')}</h1>
      <p>{t('home.signedInAs', { name: session.displayName ?? session.email })}</p>
      <div className="hh-button-row">
        <Button variant="secondary" pending={pending} onClick={() => void signOutEverywhere()}>
          {t('security.signOutEverywhere')}
        </Button>
      </div>
      <Security t={t} fetchImpl={fetchImpl} session={session} onSession={onSession} />
    </section>
  )
}

/** Optional MFA (TSK-0015): enrol an authenticator app, confirm it, keep the recovery codes; or remove it. */
function Security({
  t,
  fetchImpl,
  session,
  onSession,
}: {
  t: T
  fetchImpl: Fetch
  session: Session
  onSession: (s: Session) => void
}) {
  const [step, setStep] = useState<'idle' | 'reauth' | 'secret' | 'codes'>('idle')
  const [after, setAfter] = useState<'enroll' | 'disable'>('enroll')
  const [secret, setSecret] = useState('')
  const [codes, setCodes] = useState<string[]>([])
  const [error, setError] = useState<ApiErrorBody | null>(null)

  async function act(kind: 'enroll' | 'disable') {
    setError(null)
    setAfter(kind)
    const r = await call<{ secret: string }>(
      fetchImpl,
      kind === 'enroll' ? '/staff/auth/mfa/enroll' : '/staff/auth/mfa/disable',
      {
        method: 'POST',
      },
    )
    if (r.ok && kind === 'enroll') {
      setSecret((r.data as { secret: string }).secret)
      setStep('secret')
    } else if (r.ok) {
      onSession({
        ...session,
        mfaEnrolled: false,
        mfaRecommended: session.roles.some((x) => x === 'owner' || x === 'office'),
      })
      setStep('idle')
    } else if (r.error.code === 'FRESH_AUTH_REQUIRED') setStep('reauth')
    else setError(r.error)
  }

  async function reauth(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const r = await call<Session>(fetchImpl, '/staff/auth/reauth', {
      method: 'POST',
      body: { password: new FormData(e.currentTarget).get('password') },
    })
    if (!r.ok) return setError(r.error)
    onSession(r.data)
    setStep('idle')
    await act(after)
  }

  async function confirm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const r = await call<{ recoveryCodes: string[]; session: Session }>(fetchImpl, '/staff/auth/mfa/confirm', {
      method: 'POST',
      body: { code: new FormData(e.currentTarget).get('code') },
    })
    if (!r.ok) return setError(r.error)
    setCodes(r.data.recoveryCodes)
    onSession(r.data.session)
    setStep('codes')
  }

  return (
    <Card title={t('security.heading')} headingLevel={2}>
      {session.mfaRecommended ? <StateView kind="stale" title={t('security.recommended')} /> : null}
      {error ? <StateView kind="error" title={errorText(t, error)} /> : null}
      {step === 'reauth' ? (
        <form className="staff-auth__form" onSubmit={(e) => void reauth(e)} noValidate>
          <p>{t('security.reauthIntro')}</p>
          <Field
            label={t('signIn.password')}
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
          <Button type="submit">{t('security.reauthSubmit')}</Button>
        </form>
      ) : step === 'secret' ? (
        <form className="staff-auth__form" onSubmit={(e) => void confirm(e)} noValidate>
          <p>{t('security.secretIntro')}</p>
          <p>
            {t('security.secretLabel')}: <code>{secret}</code>
          </p>
          <Field label={t('mfa.code')} name="code" autoComplete="one-time-code" inputMode="numeric" required />
          <Button type="submit">{t('security.confirm')}</Button>
        </form>
      ) : step === 'codes' ? (
        <div>
          <p>{t('security.recoveryIntro')}</p>
          <ul className="staff-auth__codes">
            {codes.map((c) => (
              <li key={c}>
                <code>{c}</code>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="staff-auth">
          <p>{session.mfaEnrolled ? t('security.enrolled') : t('security.notEnrolled')}</p>
          {session.mfaEnrolled ? (
            <Button variant="danger" onClick={() => void act('disable')}>
              {t('security.disable')}
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => void act('enroll')}>
              {t('security.enroll')}
            </Button>
          )}
        </div>
      )}
    </Card>
  )
}
