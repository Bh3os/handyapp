// The receipt page content (TSK-0032; HH-INT-12, HH-INT-07, OWN-DEC-94, T01, T13). Shown only for a record built from
// the server's confirmation of the save (receipt.ts): "Your request is in." in the owner's wording, the reference with
// a Copy button, the project at a glance as submitted, the photos received, processing and failed shown separately
// (a failed photo can be retried here while this page still holds it, under the request's own upload capability, so
// no new request is needed), "What happens next?" from configuration, and Return Home. English only.
// The contact-verification panel, View My Request and Create an Account arrive with their flows (TSK-0033, TSK-0034);
// no action is shown before it works.
// - A request the key had already created (TSK-0030) shows its reference and says so; nothing else about it is known
//   here, so no glance and no photo count is shown for it.
import { customerTranslator, type CustomerKey } from '@handyhub/i18n'
import { Button, StatusBadge } from '@handyhub/ui'
import { useCallback, useEffect, useRef, useState, type Ref } from 'react'
import { problemValues, STATE_LABEL, STATE_TONE, uploadPhotoFile, type PhotoLimits } from './photos.js'
import { countsFromServer, nextStepsText, type PhotoCounts, type ReceiptRecord } from './receipt.js'

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

/**
 * The receipt's photos: the counts the server recorded, the failed photos this page still holds, and Retry under the
 * request's upload capability. While photos are processing their states are read again until each is settled.
 */
export function useReceiptPhotos() {
  const [counts, setCounts] = useState<PhotoCounts | null>(null)
  const [failed, setFailed] = useState<ReceiptPhoto[]>([])
  const [capability, setCapability] = useState<string | null>(null)
  const notStored = useRef(0)
  notStored.current = failed.length

  const start = useCallback(
    (init: { counts: PhotoCounts | null; failed: ReceiptPhoto[]; capability: string | null }) => {
      setCounts(init.counts)
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
    setCounts(countsFromServer(photos, notStored.current))
  }, [])

  const retry = useCallback(
    async (key: string) => {
      const item = failed.find((i) => i.key === key)
      if (!item || !capability) return
      const set = (patch: Partial<ReceiptPhoto>) =>
        setFailed((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)))
      set({ state: 'uploading' })
      const r = await uploadPhotoFile(item.file, capability)
      if (!r.ok) return set({ state: 'failed', problem: r.problem })
      // Stored: no longer a failed photo; the server's own count says where it is now.
      notStored.current = Math.max(0, notStored.current - 1)
      setFailed((list) => list.filter((i) => i.key !== key))
      setCounts((c) =>
        c
          ? {
              ...c,
              failed: Math.max(0, c.failed - 1),
              ...(r.state === 'complete' ? { received: c.received + 1 } : { processing: c.processing + 1 }),
            }
          : c,
      )
      URL.revokeObjectURL(item.preview)
      await refresh(capability)
    },
    [failed, capability, refresh],
  )

  const processing = (counts?.processing ?? 0) > 0
  useEffect(() => {
    if (!processing || !capability) return
    const timer = window.setInterval(() => void refresh(capability), 1500)
    return () => window.clearInterval(timer)
  }, [processing, capability, refresh])

  return { counts, failed, canRetry: capability !== null, start, retry }
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
  photos,
  limits,
}: {
  counts: PhotoCounts
  photos: ReceiptPhotos | null
  limits: PhotoLimits | null
}) {
  const values = problemValues(limits)
  const held = photos?.canRetry ? photos.failed : []
  return (
    <section className="hh-receipt__section" aria-labelledby="hh-receipt-photos">
      <h3 id="hh-receipt-photos" className="hh-h3">
        {t('request.receipt.photos.title')}
      </h3>
      <ul className="hh-receipt__counts" aria-live="polite">
        <li>{t('request.receipt.photos.received', { count: counts.received })}</li>
        <li>{t('request.receipt.photos.processing', { count: counts.processing })}</li>
        <li>{t('request.receipt.photos.failed', { count: counts.failed })}</li>
      </ul>
      {held.length ? (
        <>
          <p>{t('request.receipt.photos.retryHint')}</p>
          <ul className="hh-request__photo-list">
            {held.map((item, n) => (
              <li key={item.key} className="hh-request__photo" data-state={item.state}>
                <img src={item.preview} alt={t('request.photos.alt', { n: n + 1 })} width={96} height={96} />
                <div className="hh-request__photo-info">
                  <StatusBadge tone={STATE_TONE[item.state]}>{t(STATE_LABEL[item.state])}</StatusBadge>
                  {item.problem ? <p className="hh-field__error">{t(item.problem, values)}</p> : null}
                  {item.problem !== 'request.photos.problem.too_many' ? (
                    <div className="hh-request__actions">
                      <Button
                        variant="secondary"
                        pending={item.state === 'uploading'}
                        onClick={() => void photos?.retry(item.key)}
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
}: {
  record: ReceiptRecord
  /** The live photos of the page that sent the request; null after a reload (the counts then stay as recorded). */
  photos?: ReceiptPhotos | null
  limits?: PhotoLimits | null
  headingRef?: Ref<HTMLHeadingElement>
}) {
  const counts = photos?.counts ?? record.photos
  const timing = record.glance.some((e) => e.id === 'timing')
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
        <Photos counts={counts} photos={photos} limits={limits} />
      ) : null}

      <section className="hh-receipt__section" aria-labelledby="hh-receipt-next">
        <h3 id="hh-receipt-next" className="hh-h3">
          {t('request.receipt.next.title')}
        </h3>
        <p>{nextStepsText(record.facts)}</p>
        <p>{t('request.receipt.separate')}</p>
      </section>

      <a className="hh-button hh-button--secondary" href="/">
        {t('request.home')}
      </a>
    </section>
  )
}
