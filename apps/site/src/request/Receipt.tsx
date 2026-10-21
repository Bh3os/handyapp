// The receipt page content (TSK-0032; HH-INT-12, HH-INT-07, OWN-DEC-94, T01, T13). Shown only for a record built from
// the server's confirmation of the save (receipt.ts): "Your request is in." in the owner's wording, the reference with
// a Copy button, the project at a glance as submitted, the photos received, processing and failed shown separately
// (a failed photo can be retried here while this page still holds it, under the request's own upload capability, so
// no new request is needed), "What happens next?" from configuration, and Return Home. English only.
// TSK-0033: the contact verification (masked email and phone, code entry, Resend, Change Contact) under this tab's
// receipt capability, then, once a contact is verified, the optional Create an Account offer with "No thanks".
// TSK-0034: View My Request (OWN-DEC-97) appears once this browser's session opens the request's project: after a
// code entered here, or a link already opened in this browser. It goes to /access, which shows the project only to
// that session; no action is shown before it works.
// - The counts the page learns (a Retry, a processing photo settling) are given to the wizard with the time they were
//   taken, which writes them back to the tab's record (receipt.ts). A page that cannot check again (after a reload the
//   capability is gone; it is never stored) shows them as of that time, never as current (T13).
// - The held photos are a live region, so a Retry that fails again is announced; after a Retry that succeeds, focus
//   moves to the next held photo's Retry, or to the "Your photos" heading (HH-A11Y-01).
// - A request the key had already created (TSK-0030) shows its reference and says so; nothing else about it is known
//   here, so no glance and no photo count is shown for it.
import { customerTranslator, type CustomerKey } from '@handyhub/i18n'
import { Button, StatusBadge } from '@handyhub/ui'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type Ref } from 'react'
import { problemValues, STATE_LABEL, STATE_TONE, uploadPhotoFile, type PhotoLimits } from './photos.js'
import { ContactVerification } from './ContactVerification.js'
import { accessApi } from '../access/access.js'
import {
  checkedAtText,
  countsFromServer,
  loadReceipt,
  nextStepsText,
  saveReceipt,
  tabStorage,
  withAccountDeclined,
  type PhotoCounts,
  type ReceiptRecord,
} from './receipt.js'

const t = (key: CustomerKey, values?: Record<string, string | number>) => customerTranslator().t(key, values)

/** A photo that never reached the server, still held by this page so it can be sent again. */
export type ReceiptPhoto = {
  key: string
  file: File
  preview: string
  state: 'failed' | 'uploading'
  problem?: CustomerKey
}

export type ReceiptPhotos = ReturnType<typeof useReceiptPhotos>

/** Photo counts and when they were taken (ISO time). */
export type CountsSnapshot = { counts: PhotoCounts; checkedAt: string }

/**
 * The receipt's photos: the counts the server recorded, the failed photos this page still holds, and Retry under the
 * request's upload capability. While photos are processing their states are read again until each is settled. Every
 * new count carries the time it was taken, so the wizard can keep the tab's record up to date (T13).
 */
export function useReceiptPhotos() {
  const [snapshot, setSnapshot] = useState<CountsSnapshot | null>(null)
  const [failed, setFailed] = useState<ReceiptPhoto[]>([])
  const [capability, setCapability] = useState<string | null>(null)
  const notStored = useRef(0)
  notStored.current = failed.length

  const start = useCallback(
    (init: {
      counts: PhotoCounts | null
      checkedAt?: string | undefined
      failed: ReceiptPhoto[]
      capability: string | null
    }) => {
      setSnapshot(init.counts ? { counts: init.counts, checkedAt: init.checkedAt ?? new Date().toISOString() } : null)
      setFailed(init.failed)
      setCapability(init.capability)
    },
    [],
  )

  const refresh = useCallback(async (cap: string) => {
    const res = await fetch('/api/v1/public/request-drafts/photos', { headers: { 'upload-capability': cap } }).catch(
      () => null,
    )
    if (!res?.ok) return
    const { photos } = (await res.json()) as { photos: { state: string }[] }
    setSnapshot({ counts: countsFromServer(photos, notStored.current), checkedAt: new Date().toISOString() })
  }, [])

  /** Sends a held photo again; true when it is now stored. */
  const retry = useCallback(
    async (key: string): Promise<boolean> => {
      const item = failed.find((i) => i.key === key)
      if (!item || !capability) return false
      const set = (patch: Partial<ReceiptPhoto>) =>
        setFailed((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)))
      set({ state: 'uploading' })
      const r = await uploadPhotoFile(item.file, capability)
      if (!r.ok) {
        set({ state: 'failed', problem: r.problem })
        return false
      }
      // Stored: no longer a failed photo; the server's own count says where it is now.
      notStored.current = Math.max(0, notStored.current - 1)
      setFailed((list) => list.filter((i) => i.key !== key))
      setSnapshot((s) =>
        s
          ? {
              counts: {
                ...s.counts,
                failed: Math.max(0, s.counts.failed - 1),
                ...(r.state === 'complete'
                  ? { received: s.counts.received + 1 }
                  : { processing: s.counts.processing + 1 }),
              },
              checkedAt: new Date().toISOString(),
            }
          : s,
      )
      URL.revokeObjectURL(item.preview)
      void refresh(capability)
      return true
    },
    [failed, capability, refresh],
  )

  const processing = (snapshot?.counts.processing ?? 0) > 0
  useEffect(() => {
    if (!processing || !capability) return
    const timer = window.setInterval(() => void refresh(capability), 1500)
    return () => window.clearInterval(timer)
  }, [processing, capability, refresh])

  return { snapshot, counts: snapshot?.counts ?? null, failed, canRetry: capability !== null, start, retry }
}

function CopyReference({ reference }: { reference: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(reference)
      setStatus('copied')
    } catch {
      setStatus('failed')
    }
  }
  return (
    <>
      <Button variant="secondary" aria-describedby="hh-receipt-reference" onClick={() => void copy()}>
        {t('request.receipt.copy')}
      </Button>
      <p role="status" className="hh-receipt__copy-status">
        {status === 'copied' ? t('request.receipt.copied') : status === 'failed' ? t('request.receipt.copyFailed') : ''}
      </p>
    </>
  )
}

function Photos({
  counts,
  checkedAt,
  photos,
  limits,
}: {
  counts: PhotoCounts
  /** When the counts were taken, shown when this page cannot check them again; null while they are current. */
  checkedAt: string | null
  photos: ReceiptPhotos | null
  limits: PhotoLimits | null
}) {
  const values = problemValues(limits)
  const held = photos?.canRetry ? photos.failed : []
  const headingRef = useRef<HTMLHeadingElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  // After a Retry that succeeds its photo leaves the list: focus goes to the next held photo's Retry, or to the
  // heading, instead of falling to the page (HH-A11Y-01).
  const focusAfter = useRef<{ key: string; next: string | null } | null>(null)
  useLayoutEffect(() => {
    const moved = focusAfter.current
    if (!moved || held.some((i) => i.key === moved.key)) return
    focusAfter.current = null
    const active = document.activeElement
    if (active && active !== document.body) return
    const next = moved.next
      ? listRef.current?.querySelector<HTMLButtonElement>(`li[data-photo="${CSS.escape(moved.next)}"] button`)
      : null
    ;(next ?? headingRef.current)?.focus()
  }, [held])
  const retry = async (key: string) => {
    const at = held.findIndex((i) => i.key === key)
    const others = held.filter((i) => i.key !== key && i.problem !== 'request.photos.problem.too_many')
    const next = others.find((_, n) => n >= at) ?? others[others.length - 1] ?? null
    focusAfter.current = { key, next: next?.key ?? null }
    if (!(await photos?.retry(key))) focusAfter.current = null
  }
  const asOf = checkedAt ? checkedAtText(checkedAt) : ''
  return (
    <section className="hh-receipt__section" aria-labelledby="hh-receipt-photos">
      <h3 id="hh-receipt-photos" ref={headingRef} tabIndex={-1} className="hh-h3">
        {t('request.receipt.photos.title')}
      </h3>
      <ul className="hh-receipt__counts" aria-live="polite">
        <li>{t('request.receipt.photos.received', { count: counts.received })}</li>
        <li>{t('request.receipt.photos.processing', { count: counts.processing })}</li>
        <li>{t('request.receipt.photos.failed', { count: counts.failed })}</li>
      </ul>
      {asOf ? (
        <p className="hh-field__hint" data-testid="receipt-photos-as-of">
          {t('request.receipt.photos.asOf', { time: asOf })}
        </p>
      ) : null}
      {held.length ? (
        <>
          <p>{t('request.receipt.photos.retryHint')}</p>
          <ul ref={listRef} className="hh-request__photo-list" aria-live="polite">
            {held.map((item, n) => (
              <li key={item.key} className="hh-request__photo" data-state={item.state} data-photo={item.key}>
                <img src={item.preview} alt={t('request.photos.alt', { n: n + 1 })} width={96} height={96} />
                <div className="hh-request__photo-info">
                  <StatusBadge tone={STATE_TONE[item.state]}>{t(STATE_LABEL[item.state])}</StatusBadge>
                  {item.problem ? <p className="hh-field__error">{t(item.problem, values)}</p> : null}
                  {item.problem !== 'request.photos.problem.too_many' ? (
                    <div className="hh-request__actions">
                      <Button
                        variant="secondary"
                        pending={item.state === 'uploading'}
                        onClick={() => void retry(item.key)}
                      >
                        {t('request.photos.retry')}
                      </Button>
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  )
}

export function Receipt({
  record,
  photos = null,
  limits = null,
  headingRef,
  onRecord,
}: {
  record: ReceiptRecord
  /** The live photos of the page that sent the request; null after a reload (the counts as last written back). */
  photos?: ReceiptPhotos | null
  limits?: PhotoLimits | null
  headingRef?: Ref<HTMLHeadingElement>
  /** Told the record this page saved (the account-offer answer), so the page that sent it writes back the same. */
  onRecord?: (record: ReceiptRecord) => void
}) {
  // The live counts while this page holds them, else the tab's record (the counts as last written back).
  const counts = photos?.snapshot?.counts ?? record.photos
  const takenAt = photos?.snapshot?.checkedAt ?? record.photosCheckedAt ?? null
  // Only a page holding the request's upload capability checks the counts again; any other shows when they were taken.
  const current = photos?.canRetry === true
  const timing = record.glance.some((e) => e.id === 'timing')
  const [declined, setDeclined] = useState(record.accountOffer === 'declined')
  const decline = () => {
    setDeclined(true)
    const storage = tabStorage()
    const next = withAccountDeclined(loadReceipt(storage, record.reference), record)
    saveReceipt(storage, next)
    onRecord?.(next)
  }
  const [canView, setCanView] = useState(false)
  useEffect(() => {
    let live = true
    void accessApi
      .session((input, init) => fetch(input, init))
      .then((r) => {
        if (live && r.ok && r.data.includes(record.reference)) setCanView(true)
      })
    return () => {
      live = false
    }
  }, [record.reference])
  return (
    <section className="hh-receipt" aria-labelledby="hh-receipt-title">
      <h2 id="hh-receipt-title" ref={headingRef} tabIndex={-1} className="hh-h2">
        {t('request.receipt.title')}
      </h2>
      <p>{t('request.receipt.thanks')}</p>
      <div className="hh-receipt__reference">
        <p id="hh-receipt-reference" className="hh-lead">
          {t('request.receipt.reference', { reference: record.reference })}
        </p>
        <CopyReference reference={record.reference} />
      </div>
      {record.already ? <p>{t('request.receipt.already')}</p> : null}

      {record.glance.length ? (
        <section className="hh-receipt__section" aria-labelledby="hh-receipt-glance">
          <h3 id="hh-receipt-glance" className="hh-h3">
            {t('request.receipt.glance')}
          </h3>
          <dl>
            {record.glance.map((e) => (
              <div key={e.id}>
                <dt>{e.label}</dt>
                <dd>
                  {e.lines.length > 1 ? (
                    <ul className="hh-request__review-lines">
                      {e.lines.map((l, i) => (
                        <li key={i}>{l}</li>
                      ))}
                    </ul>
                  ) : (
                    e.lines[0]
                  )}
                </dd>
              </div>
            ))}
          </dl>
          {timing ? <p className="hh-field__hint">{t('request.timing.note')}</p> : null}
        </section>
      ) : null}

      {counts && counts.received + counts.processing + counts.failed > 0 ? (
        <Photos counts={counts} checkedAt={current ? null : takenAt} photos={photos} limits={limits} />
      ) : null}

      <section className="hh-receipt__section" aria-labelledby="hh-receipt-next">
        <h3 id="hh-receipt-next" className="hh-h3">
          {t('request.receipt.next.title')}
        </h3>
        <p>{nextStepsText(record.facts)}</p>
        <p>{t('request.receipt.separate')}</p>
      </section>

      <ContactVerification
        capability={record.capability ?? null}
        declined={declined}
        onDecline={decline}
        onProjectAccess={() => setCanView(true)}
      />

      <div className="hh-request__actions">
        {canView ? (
          <a className="hh-button" href="/access">
            {t('request.receipt.viewRequest')}
          </a>
        ) : null}
        <a className="hh-button hh-button--secondary" href="/">
          {t('request.home')}
        </a>
      </div>
    </section>
  )
}
