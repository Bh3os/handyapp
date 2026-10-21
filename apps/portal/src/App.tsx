// HandyHub customer portal (TSK-0001 skeleton; TSK-0038 workspace frame). Customer text comes from the English customer
// catalog (TSK-0008, RULE-LANGUAGES): the portal has no language choice. Pages below /portal/ (the build's base):
//   /portal/               the projects this session opens
//   /portal/p/<reference>  one project's workspace, on its Overview
//   /portal/p/<reference>/<tab>  the same workspace on its Messages, Documents, Photos, Appointments or Payments tab
//                                (TSK-0039)
//   /portal/p/<reference>/documents/<estimate number>/<version>  one estimate version in the Documents tab (TSK-0056)
//   /portal/terms/<document id>  the estimate terms on a page of their own (TSK-0056, HH-EST-13)
//   /portal/p/<reference>/privacy  your data and privacy requests about this project's customer (TSK-0100)
// Every read is authorized and scoped on the server; the page only shows what the customer views return.
import { customerTranslator } from '@handyhub/i18n'
import { useCallback, useEffect, useState } from 'react'
import { REFERENCE, WORKSPACE_TABS, type Fetch, type WorkspaceTab } from './api'
import { PrivacyPage } from './Privacy'
import { Projects } from './Projects'
import { TermsPage } from './Terms'
import { Workspace } from './Workspace'

export type PortalRoute =
  | { page: 'projects' }
  /** `tab` is absent on the Overview, the project page itself; `estimate` names a version in the Documents tab. */
  | { page: 'project'; reference: string; tab?: WorkspaceTab; estimate?: { number: string; version: number } }
  | { page: 'terms'; documentId: string }
  /** TSK-0100: the privacy requests page of a project (not a workspace tab: the six tabs stay as decided). */
  | { page: 'privacy'; reference: string }

/** An estimate number as the server issues it (migration 0026): the project reference and E<n>. */
const ESTIMATE_NUMBER = /^HH-[0-9A-HJKMNP-TV-Z]{8}-E[1-9][0-9]{0,3}$/

const isTab = (v: string): v is WorkspaceTab => (WORKSPACE_TABS as readonly string[]).includes(v)

/** The page for a path below /portal/; anything unknown is the projects page. */
export function routeOf(pathname: string): PortalRoute {
  const rest = pathname.replace(/^\/portal(?=\/|$)/, '')
  const terms = /^\/terms\/([a-z][a-z0-9-]{0,38}[0-9])\/?$/.exec(rest)
  if (terms) return { page: 'terms', documentId: terms[1] as string }
  const doc = /^\/p\/([^/]+)\/documents\/([^/]+)\/([1-9][0-9]{0,3})\/?$/.exec(rest)
  if (doc) {
    const reference = decodeURIComponent(doc[1] as string).toUpperCase()
    const number = decodeURIComponent(doc[2] as string).toUpperCase()
    if (REFERENCE.test(reference) && ESTIMATE_NUMBER.test(number) && number.startsWith(`${reference}-`))
      return { page: 'project', reference, tab: 'documents', estimate: { number, version: Number(doc[3]) } }
  }
  const m = /^\/p\/([^/]+)(?:\/([a-z]+))?\/?$/.exec(rest)
  if (m) {
    const reference = decodeURIComponent(m[1] as string).toUpperCase()
    const tab = m[2]
    if (REFERENCE.test(reference)) {
      if (tab === undefined) return { page: 'project', reference }
      if (tab === 'privacy') return { page: 'privacy', reference }
      if (isTab(tab)) return { page: 'project', reference, tab }
    }
  }
  return { page: 'projects' }
}

const browserFetch: Fetch = (input, init) => fetch(input, init)

export function App({ path, fetchImpl = browserFetch }: { path?: string; fetchImpl?: Fetch }) {
  const { t } = customerTranslator()
  const [current, setCurrent] = useState(() => path ?? window.location.pathname)
  // Back and Forward between tabs: the address bar leads, the page follows.
  useEffect(() => {
    const onPop = () => setCurrent(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  const navigate = useCallback((to: string) => {
    if (window.location.pathname !== to) window.history.pushState(null, '', to)
    setCurrent(to)
  }, [])
  const route = routeOf(current)
  return (
    <div className="portal" lang="en">
      <header className="portal__bar">
        <p className="portal__brand">{t('portal.title')}</p>
      </header>
      <main lang="en" className="portal__main">
        {route.page === 'terms' ? (
          <TermsPage documentId={route.documentId} />
        ) : route.page === 'privacy' ? (
          <PrivacyPage key={route.reference} reference={route.reference} fetchImpl={fetchImpl} />
        ) : route.page === 'project' ? (
          <Workspace
            key={route.reference}
            reference={route.reference}
            tab={route.tab ?? 'overview'}
            estimate={route.estimate}
            onNavigate={navigate}
            fetchImpl={fetchImpl}
          />
        ) : (
          <Projects fetchImpl={fetchImpl} />
        )}
      </main>
    </div>
  )
}
