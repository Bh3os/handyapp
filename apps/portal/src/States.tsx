// Truthful states for every portal view (TSK-0038; HH-PORT-06, HH-ARC-10, T71): loading, the ended session, a
// project this session cannot open, a failed read, and the refresh line with its stale state. A failure is never shown
// as success, and stale data is never shown as current.
import type { CustomerKey } from '@handyhub/i18n'
import { Button, StateView } from '@handyhub/ui'
import type { Failure } from './api'
import type { Live } from './live'
import { clock, t } from './labels'

const FAILED: Record<Failure, { title: CustomerKey; text: CustomerKey }> = {
  expired: { title: 'portal.expired.title', text: 'portal.expired.text' },
  unavailable: { title: 'portal.unavailable.title', text: 'portal.unavailable.text' },
  failed: { title: 'portal.failed.title', text: 'portal.failed.text' },
}

/** The view before anything is shown: loading, or why nothing can be. */
export function NotShown<T>({
  live,
  loading,
  failedTitle,
  onRetry,
}: {
  live: Exclude<Live<T>, { phase: 'ready' }>
  loading: CustomerKey
  failedTitle?: CustomerKey
  onRetry: () => void
}) {
  if (live.phase === 'loading') return <StateView kind="loading" title={t(loading)} />
  const f = FAILED[live.failure]
  if (live.failure === 'expired')
    return (
      <StateView
        kind="blocked"
        title={t(f.title)}
        action={
          <a className="hh-button" href="/access">
            {t('portal.expired.action')}
          </a>
        }
      >
        <p>{t(f.text)}</p>
      </StateView>
    )
  if (live.failure === 'unavailable')
    return (
      <StateView kind="blocked" title={t(f.title)}>
        <p>{t(f.text)}</p>
      </StateView>
    )
  return (
    <StateView
      kind="error"
      title={t(failedTitle ?? f.title)}
      action={
        <Button variant="secondary" pending={live.retrying} onClick={onRetry}>
          {t('portal.refresh.retry')}
        </Button>
      }
    >
      <p>{t(f.text)}</p>
    </StateView>
  )
}

/** When the view last refreshed, a Refresh action, and the stale state after a failed refresh. */
export function RefreshLine({
  refreshedAt,
  stale,
  refreshing,
  onRefresh,
}: {
  refreshedAt: Date
  stale: boolean
  refreshing: boolean
  onRefresh: () => void
}) {
  return (
    <div className="portal-refresh">
      {stale ? (
        <StateView
          kind="stale"
          title={t('portal.refresh.stale.title')}
          action={
            <Button variant="secondary" pending={refreshing} onClick={onRefresh}>
              {t('portal.refresh.retry')}
            </Button>
          }
        >
          <p>{t('portal.refresh.stale.text', { time: clock(refreshedAt) })}</p>
        </StateView>
      ) : (
        <p className="portal-refresh__line hh-small">
          <span>{t('portal.refresh.updated', { time: clock(refreshedAt) })}</span>{' '}
          <Button variant="quiet" pending={refreshing} onClick={onRefresh}>
            {t('portal.refresh.action')}
          </Button>
        </p>
      )}
    </div>
  )
}
