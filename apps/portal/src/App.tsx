// HandyHub customer portal (TSK-0001 skeleton; TSK-0038 workspace frame). Customer text comes from the English customer
// catalog (TSK-0008, RULE-LANGUAGES): the portal has no language choice. Pages below /portal/ (the build's base):
//   /portal/               the projects this session opens
//   /portal/p/<reference>  one project's workspace (Overview; the other tabs arrive with TSK-0039)
// Every read is authorized and scoped on the server; the page only shows what the customer views return.
import { customerTranslator } from '@handyhub/i18n'
import { REFERENCE, type Fetch } from './api'
import { Projects } from './Projects'
import { Workspace } from './Workspace'

export type PortalRoute = { page: 'projects' } | { page: 'project'; reference: string }

/** The page for a path below /portal/; anything unknown is the projects page. */
export function routeOf(pathname: string): PortalRoute {
  const rest = pathname.replace(/^\/portal(?=\/|$)/, '')
  const m = /^\/p\/([^/]+)\/?$/.exec(rest)
  if (m) {
    const reference = decodeURIComponent(m[1] as string).toUpperCase()
    if (REFERENCE.test(reference)) return { page: 'project', reference }
  }
  return { page: 'projects' }
}

const browserFetch: Fetch = (input, init) => fetch(input, init)

export function App({ path, fetchImpl = browserFetch }: { path?: string; fetchImpl?: Fetch }) {
  const { t } = customerTranslator()
  const route = routeOf(path ?? window.location.pathname)
  return (
    <div className="portal" lang="en">
      <header className="portal__bar">
        <p className="portal__brand">{t('portal.title')}</p>
      </header>
      <main lang="en" className="portal__main">
        {route.page === 'project' ? (
          <Workspace key={route.reference} reference={route.reference} fetchImpl={fetchImpl} />
        ) : (
          <Projects fetchImpl={fetchImpl} />
        )}
      </main>
    </div>
  )
}
