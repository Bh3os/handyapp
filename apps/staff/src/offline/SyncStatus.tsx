// What the phone holds that is not on the server yet, and the warnings before it could be lost (TSK-0080; HH-OFF-05,
// HH-OFF-06, HH-OFF-07, T27, T51, T52, OWN-DEC-121).
// - SyncStatus: the sync bar on every screen. It uploads by itself (app opened, connection back, every 30 seconds
//   while anything waits) and says what is waiting, what needs the Owner's review and what could not be uploaded.
//   Drafts another account saved on this phone are never uploaded as the signed-in person's: the Owner may upload
//   them for review only; anyone else is told to give the phone to the Owner.
// - SignOutWarning: before signing out with unsynced work, the choice to upload first or to sign out and keep it on
//   this phone. Nothing is erased without that choice.
// - UpdateBanner: a new version of the app waits until the person chooses to update; with unsynced work the banner
//   says so and offers to upload first. The update itself keeps the drafts (they live in this phone's storage).
import type { StaffKey } from '@handyhub/i18n'
import { Button, StatusBadge } from '@handyhub/ui'
import { useCallback, useEffect, useState } from 'react'
import type { Fetch } from '../api'
import { pendingStopCount } from '../StopWork'
import { offlineStore, type StoredDraft } from './store'
import { DRAFTS_CHANGED, isUnsynced, ownerOf, syncDrafts, type SyncSummary } from './sync'

type T = (key: StaffKey, values?: Record<string, string | number>) => string

export const RETRY_MS = 30_000
/** The window event the service worker registration sends when a new version waits (main.tsx). */
export const APP_UPDATE = 'hh-app-update'

let waitingVersion: ServiceWorker | null = null
/** A new version of the app is installed and waits (main.tsx): kept for the banner, which may mount later. */
export function announceUpdate(worker: ServiceWorker): void {
  waitingVersion = worker
  window.dispatchEvent(new CustomEvent(APP_UPDATE, { detail: worker }))
}

export type Counts = { waiting: number; failed: number; review: number; others: number }

/** What this phone holds for the signed-in account, and for others (stops included as waiting). */
export async function draftCounts(signedIn: string): Promise<Counts> {
  const all = await offlineStore()
    .listDrafts()
    .catch(() => [] as StoredDraft[])
  const mine = all.filter((d) => ownerOf(d, signedIn) === signedIn)
  return {
    waiting:
      mine.filter((d) => d.state === 'saved_on_phone' || d.state === 'pending_upload').length + pendingStopCount(),
    failed: mine.filter((d) => d.state === 'failed').length,
    review: mine.filter((d) => d.state === 'needs_review').length,
    others: all.filter((d) => ownerOf(d, signedIn) !== signedIn && isUnsynced(d)).length,
  }
}

function useCounts(signedIn: string) {
  const [counts, setCounts] = useState<Counts>({ waiting: 0, failed: 0, review: 0, others: 0 })
  const refresh = useCallback(async () => setCounts(await draftCounts(signedIn)), [signedIn])
  useEffect(() => {
    void refresh()
    const on = () => void refresh()
    window.addEventListener(DRAFTS_CHANGED, on)
    return () => window.removeEventListener(DRAFTS_CHANGED, on)
  }, [refresh])
  return { counts, refresh }
}

export function SyncStatus({
  t,
  fetchImpl,
  staffUserId,
  isOwner,
}: {
  t: T
  fetchImpl: Fetch
  staffUserId: string
  isOwner: boolean
}) {
  const { counts } = useCounts(staffUserId)
  const [pending, setPending] = useState(false)
  const [last, setLast] = useState<SyncSummary | null>(null)
  const upload = useCallback(
    async (recover = false) => {
      setPending(true)
      setLast(await syncDrafts(offlineStore(), fetchImpl, staffUserId, { recover }))
      setPending(false)
    },
    [fetchImpl, staffUserId],
  )
  // Automatic retries: now, when the connection returns, and every 30 seconds while the phone holds waiting drafts.
  useEffect(() => {
    let alive = true
    const tick = () => {
      void draftCounts(staffUserId).then((c) => {
        if (alive && c.waiting + c.failed > 0) void syncDrafts(offlineStore(), fetchImpl, staffUserId).then(setLast)
      })
    }
    tick()
    window.addEventListener('online', tick)
    const timer = window.setInterval(tick, RETRY_MS)
    return () => {
      alive = false
      window.removeEventListener('online', tick)
      window.clearInterval(timer)
    }
  }, [fetchImpl, staffUserId])
  if (counts.waiting + counts.failed + counts.review + counts.others === 0) return null
  return (
    <section className="hh-sync" data-testid="sync-status" aria-live="polite">
      <ul>
        {counts.waiting > 0 ? (
          <li data-testid="sync-waiting">
            <StatusBadge tone="warning">{t('sync.pendingUpload')}</StatusBadge>{' '}
            {t('sync.waiting', { count: counts.waiting })}
          </li>
        ) : null}
        {counts.failed > 0 ? (
          <li data-testid="sync-failed">
            <StatusBadge tone="danger">{t('sync.failedLabel')}</StatusBadge>{' '}
            {t('sync.failed', { count: counts.failed })}
          </li>
        ) : null}
        {counts.review > 0 ? (
          <li data-testid="sync-review">
            <StatusBadge tone="info">{t('sync.reviewLabel')}</StatusBadge> {t('sync.review', { count: counts.review })}
          </li>
        ) : null}
        {counts.others > 0 ? (
          <li data-testid="sync-others">{t(isOwner ? 'sync.othersOwner' : 'sync.others', { count: counts.others })}</li>
        ) : null}
      </ul>
      {last?.signedOut ? <p role="alert">{t('sync.signedOut')}</p> : null}
      {counts.waiting + counts.failed > 0 ? (
        <Button variant="secondary" pending={pending} onClick={() => void upload()}>
          {t('sync.uploadNow')}
        </Button>
      ) : null}
      {counts.others > 0 && isOwner ? (
        <Button variant="secondary" pending={pending} onClick={() => void upload(true)}>
          {t('sync.recover')}
        </Button>
      ) : null}
    </section>
  )
}

/** Before signing out with unsynced work (T52): upload first, or sign out and keep it on this phone. */
export function SignOutWarning({
  t,
  fetchImpl,
  staffUserId,
  onSignOut,
  onCancel,
}: {
  t: T
  fetchImpl: Fetch
  staffUserId: string
  onSignOut: () => void
  onCancel: () => void
}) {
  const { counts, refresh } = useCounts(staffUserId)
  const [pending, setPending] = useState(false)
  const left = counts.waiting + counts.failed
  return (
    <section
      role="alertdialog"
      aria-labelledby="hh-signout-warning"
      className="hh-warning"
      data-testid="signout-warning"
    >
      <h2 id="hh-signout-warning">{t('sync.signOutTitle')}</h2>
      <p>{left > 0 ? t('sync.signOutBody', { count: left }) : t('sync.allUploaded')}</p>
      <div className="hh-actions">
        {left > 0 ? (
          <Button
            pending={pending}
            onClick={() => {
              setPending(true)
              void syncDrafts(offlineStore(), fetchImpl, staffUserId)
                .then(refresh)
                .finally(() => setPending(false))
            }}
          >
            {t('sync.uploadNow')}
          </Button>
        ) : null}
        <Button variant={left > 0 ? 'secondary' : 'primary'} onClick={onSignOut}>
          {left > 0 ? t('sync.signOutKeep') : t('home.signOut')}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          {t('sync.cancel')}
        </Button>
      </div>
    </section>
  )
}

/** A new version of the app is ready (T52): updating waits for the person, after the warning about unsynced work. */
export function UpdateBanner({ t, fetchImpl, staffUserId }: { t: T; fetchImpl: Fetch; staffUserId: string }) {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(waitingVersion)
  const { counts, refresh } = useCounts(staffUserId)
  const [pending, setPending] = useState(false)
  useEffect(() => {
    const on = (e: Event) => setWaiting((e as CustomEvent<ServiceWorker>).detail)
    window.addEventListener(APP_UPDATE, on)
    return () => window.removeEventListener(APP_UPDATE, on)
  }, [])
  if (!waiting) return null
  const left = counts.waiting + counts.failed
  return (
    <section role="status" className="hh-warning" data-testid="app-update">
      <p>{t('sync.updateReady')}</p>
      {left > 0 ? <p data-testid="app-update-unsynced">{t('sync.updateUnsynced', { count: left })}</p> : null}
      <div className="hh-actions">
        {left > 0 ? (
          <Button
            pending={pending}
            onClick={() => {
              setPending(true)
              void syncDrafts(offlineStore(), fetchImpl, staffUserId)
                .then(refresh)
                .finally(() => setPending(false))
            }}
          >
            {t('sync.uploadFirst')}
          </Button>
        ) : null}
        <Button
          variant={left > 0 ? 'secondary' : 'primary'}
          onClick={() => waiting.postMessage({ type: 'SKIP_WAITING' })}
        >
          {t('sync.updateNow')}
        </Button>
      </div>
    </section>
  )
}
