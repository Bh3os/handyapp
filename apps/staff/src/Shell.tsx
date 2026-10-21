// The staff app shell (TSK-0040; S00 step 4, S01, HH-STAFF-06, HH-OPS-04, HH-LANG-02, HH-BASE-01): the frame every
// staff screen plugs into. Landmarks (banner, navigation, search, main) with a skip link; the menu the server sent for
// the person's roles (deny by default: an id the app does not know, or one the server did not send, is never shown
// and its screen says it is not part of the role); the EN/ES switch saved on the person's staff identity; an offline
// indicator; and the search box only for roles whose matrix grants allow searching. The server decides every request.
import type { StaffKey } from '@handyhub/i18n'
import { Button, Field, StateView } from '@handyhub/ui'
import { useEffect, useState, type FormEvent, type MouseEvent, type ReactNode } from 'react'

type T = (key: StaffKey, values?: Record<string, string | number>) => string

/** The screens the app knows, in the policy package's ids (packages/policy NAV_ITEMS). */
export const NAV_LABELS = {
  queue: 'nav.queue',
  'my-day': 'nav.my-day',
  requests: 'nav.requests',
  customers: 'nav.customers',
  estimates: 'nav.estimates',
  schedule: 'nav.schedule',
  inbox: 'nav.inbox',
  payments: 'nav.payments',
  cases: 'nav.cases',
  staff: 'nav.staff',
  audit: 'nav.audit',
  retention: 'nav.retention',
  dashboard: 'nav.dashboard',
  health: 'nav.health',
  settings: 'nav.settings',
} as const satisfies Record<string, StaffKey>
export type NavId = keyof typeof NAV_LABELS
const SEARCH_LABELS = {
  requests: 'search.scope.requests',
  customers: 'search.scope.customers',
} as const satisfies Record<string, StaffKey>
type SearchScope = keyof typeof SEARCH_LABELS

export type Navigation = { home: string | null; items: string[]; search: string[] }

const isNav = (id: string): id is NavId => Object.hasOwn(NAV_LABELS, id)
const isScope = (id: string): id is SearchScope => Object.hasOwn(SEARCH_LABELS, id)

/** The menu items to show: only ids the server sent that the app knows (deny by default). */
export function menuOf(navigation: Navigation | undefined): NavId[] {
  return (navigation?.items ?? []).filter(isNav)
}

/** Whether the browser is online, following its online and offline events. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}

export interface ShellProps {
  t: T
  name: string
  locale: 'en' | 'es'
  navigation: Navigation | undefined
  /** The screen shown, for aria-current: a nav id, 'account' or 'search'. */
  current: string
  go: (to: string) => void
  /** The href of an in-app path, for real links that open in a new tab too. */
  href: (to: string) => string
  onLocale: (locale: 'en' | 'es') => Promise<boolean>
  onSignOut: () => void
  signingOut: boolean
  children: ReactNode
}

export function Shell(props: ShellProps) {
  const { t, navigation, current, go, href } = props
  const online = useOnline()
  const menu = menuOf(navigation)
  const scopes = (navigation?.search ?? []).filter(isScope)
  const link = (to: string) => ({
    href: href(to),
    onClick: (e: MouseEvent<HTMLAnchorElement>) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
      e.preventDefault()
      go(to)
    },
  })

  function search(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const q = String(new FormData(e.currentTarget).get('q') ?? '').trim()
    if (q) go(`/search?q=${encodeURIComponent(q)}`)
  }

  return (
    <div className="staff-shell">
      <a className="staff-shell__skip" href="#staff-main">
        {t('shell.skip')}
      </a>
      <header className="staff-shell__bar">
        <a className="staff-shell__brand" {...link('/')}>
          {t('app.title')}
        </a>
        {scopes.length > 0 ? (
          <form role="search" className="staff-shell__search" onSubmit={search} aria-label={t('search.label')}>
            <Field
              label={t('search.label')}
              name="q"
              type="search"
              hint={t('search.hint', { scopes: scopes.map((s) => t(SEARCH_LABELS[s])).join(', ') })}
            />
            <Button type="submit" variant="secondary">
              {t('search.submit')}
            </Button>
          </form>
        ) : null}
        <div className="staff-shell__user">
          <LanguageSwitch t={t} locale={props.locale} onLocale={props.onLocale} />
          <p className="staff-shell__name">{t('home.signedInAs', { name: props.name })}</p>
          <Button variant="secondary" pending={props.signingOut} onClick={props.onSignOut}>
            {t('home.signOut')}
          </Button>
        </div>
      </header>
      <nav className="staff-shell__nav" aria-label={t('shell.navLabel')}>
        <ul>
          {menu.map((id) => (
            <li key={id}>
              <a {...link(id === navigation?.home ? '/' : `/${id}`)} aria-current={current === id ? 'page' : undefined}>
                {t(NAV_LABELS[id])}
              </a>
            </li>
          ))}
          <li>
            <a {...link('/account')} aria-current={current === 'account' ? 'page' : undefined}>
              {t('nav.account')}
            </a>
          </li>
        </ul>
      </nav>
      <main id="staff-main" className="staff-shell__main" tabIndex={-1}>
        {online ? null : (
          <StateView kind="offline" title={t('offline.title')}>
            <p>{t('offline.body')}</p>
          </StateView>
        )}
        {props.children}
      </main>
    </div>
  )
}

function LanguageSwitch({
  t,
  locale,
  onLocale,
}: {
  t: T
  locale: 'en' | 'es'
  onLocale: (locale: 'en' | 'es') => Promise<boolean>
}) {
  const [failed, setFailed] = useState(false)
  const [pending, setPending] = useState(false)
  return (
    <div className="staff-shell__language">
      <label htmlFor="staff-language">{t('language.label')}</label>
      <select
        id="staff-language"
        value={locale}
        disabled={pending}
        onChange={async (e) => {
          const next = e.currentTarget.value === 'es' ? 'es' : 'en'
          setPending(true)
          setFailed(!(await onLocale(next)))
          setPending(false)
        }}
      >
        <option value="en" lang="en">
          {t('language.en')}
        </option>
        <option value="es" lang="es">
          {t('language.es')}
        </option>
      </select>
      {failed ? (
        <p className="hh-field__error" role="alert">
          {t('language.saveFailed')}
        </p>
      ) : null}
    </div>
  )
}

/** A screen of the menu that is not built yet, or one the person's role does not include (deny by default). */
export function Screen({ t, id, allowed }: { t: T; id: string; allowed: boolean }) {
  if (!allowed || !isNav(id))
    return (
      <section className="staff-screen">
        <StateView kind="blocked" title={t('shell.notAllowed')} />
      </section>
    )
  return (
    <section className="staff-screen" aria-labelledby="staff-screen-title">
      <h1 id="staff-screen-title" className="hh-h3">
        {t(NAV_LABELS[id])}
      </h1>
      <StateView kind="empty" title={t('shell.notBuilt')}>
        <p>{t('shell.notBuiltBody')}</p>
      </StateView>
    </section>
  )
}

export function SearchScreen({ t, query }: { t: T; query: string }) {
  return (
    <section className="staff-screen" aria-labelledby="staff-screen-title">
      <h1 id="staff-screen-title" className="hh-h3">
        {t('search.heading', { query })}
      </h1>
      <StateView kind="empty" title={t('search.unavailable')} />
    </section>
  )
}
