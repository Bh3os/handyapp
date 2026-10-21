// /portal: the projects this session opens (TSK-0038; HH-PORT-02, HH-PORT-06, HH-ARC-10, OWN-DEC-106). A guest link
// opens one project; an account (TSK-0036) its linked projects. Each shows its status and who is waiting.
import { StateView, StatusBadge } from '@handyhub/ui'
import { portalApi, type Fetch, type ProjectSummary } from './api'
import { SITUATION_LABEL, t, WAITING_LABEL } from './labels'
import { useLive } from './live'
import { NotShown, RefreshLine } from './States'

function Item({ p }: { p: ProjectSummary }) {
  return (
    <li className="portal-projects__item" aria-label={t('portal.project.title', { reference: p.reference })}>
      <h2 className="hh-h3">
        <a href={`/portal/p/${encodeURIComponent(p.reference)}`}>
          {t('portal.projects.open', { reference: p.reference })}
        </a>
      </h2>
      <p>{[...p.services, ...(p.notSure ? [t('request.services.notSure')] : [])].join(', ')}</p>
      <p>
        <strong>{t(SITUATION_LABEL[p.status.situation])}</strong>{' '}
        <StatusBadge tone={p.status.waitingOn === 'customer' ? 'warning' : 'neutral'}>
          {t(WAITING_LABEL[p.status.waitingOn])}
        </StatusBadge>
      </p>
    </li>
  )
}

export function Projects({ fetchImpl }: { fetchImpl: Fetch }) {
  const { live, refresh } = useLive(() => portalApi.projects(fetchImpl), 'projects')
  return (
    <>
      <h1 className="hh-h2">{t('portal.projects.title')}</h1>
      {live.phase !== 'ready' ? (
        <NotShown
          live={live}
          loading="portal.projects.loading"
          failedTitle="portal.projects.failed.title"
          onRetry={() => void refresh()}
        />
      ) : (
        <>
          <RefreshLine
            refreshedAt={live.refreshedAt}
            stale={live.stale}
            refreshing={live.refreshing}
            onRefresh={() => void refresh()}
          />
          {live.data.projects.length === 0 ? (
            <StateView kind="empty" title={t('portal.projects.empty.title')}>
              <p>{t('portal.projects.empty.text')}</p>
            </StateView>
          ) : (
            <ul className={live.stale ? 'portal-projects portal-section--stale' : 'portal-projects'}>
              {live.data.projects.map((p) => (
                <Item key={p.reference} p={p} />
              ))}
            </ul>
          )}
        </>
      )}
    </>
  )
}
