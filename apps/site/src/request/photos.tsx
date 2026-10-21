// Request photos in the wizard (TSK-0031; HH-INT-04, HH-INT-05, HH-INT-06, HH-INT-07, T13). Photos are optional. The
// first chosen photo starts a draft upload capability on the server; each photo then uploads on its own with its own
// state (uploading, processing, saved, failed) and Remove and Retry. A failed photo never touches the text or the
// other photos, and the request can be sent without it. The limits shown and checked here come from the server's
// configuration (uploads.limits); the server checks everything again. English only (RULE-LANGUAGES).
import { customerTranslator, type CustomerKey } from '@handyhub/i18n'
import { Button, StatusBadge, type StatusTone } from '@handyhub/ui'
import { useCallback, useEffect, useRef, useState } from 'react'

export type PhotoLimits = { maxFileBytes: number; maxPhotos: number; types: string[] }
export type PhotoState = 'uploading' | 'processing' | 'complete' | 'failed'
export type PhotoItem = {
  key: string
  file: File
  preview: string
  state: PhotoState
  id?: string
  problem?: CustomerKey
}

const t = (key: CustomerKey, values?: Record<string, string | number>) => customerTranslator().t(key, values)
const TYPE_NAME: Record<string, string> = { 'image/jpeg': 'JPEG', 'image/png': 'PNG', 'image/webp': 'WebP' }
const typeNames = (types: string[]) => types.map((x) => TYPE_NAME[x] ?? x).join(', ')
const mb = (bytes: number) => Math.floor(bytes / (1024 * 1024))

export const STATE_LABEL: Record<PhotoState, CustomerKey> = {
  uploading: 'request.photos.state.uploading',
  processing: 'request.photos.state.processing',
  complete: 'request.photos.state.complete',
  failed: 'request.photos.state.failed',
}
export const STATE_TONE: Record<PhotoState, StatusTone> = {
  uploading: 'info',
  processing: 'info',
  complete: 'success',
  failed: 'danger',
}
/** Server field-error codes and statuses onto the customer's explanation. */
function problemOf(status: number, code: string | undefined): CustomerKey {
  if (status === 413) return 'request.photos.problem.too_large'
  if (status === 415) return 'request.photos.problem.type'
  if (status === 503) return 'request.photos.problem.unavailable'
  if (status === 429) return 'request.photos.problem.rate_limited'
  if (code === 'too_many') return 'request.photos.problem.too_many'
  if (
    code === 'type_mismatch' ||
    code === 'malformed' ||
    code === 'trailing_data' ||
    code === 'unsafe_content' ||
    code === 'empty'
  )
    return 'request.photos.problem.invalid'
  return 'request.photos.problem.network'
}
export type UploadResult =
  { ok: true; id: string; state: 'complete' | 'processing' } | { ok: false; problem: CustomerKey }

/**
 * Uploads one photo under a capability: the draft's, or after submission the request's own (TSK-0032, the receipt's
 * Retry). The server checks it again by its content.
 */
export async function uploadPhotoFile(file: File, capability: string): Promise<UploadResult> {
  try {
    const res = await fetch('/api/v1/public/request-drafts/photos', {
      method: 'POST',
      headers: { 'content-type': file.type || 'application/octet-stream', 'upload-capability': capability },
      body: file,
    })
    const data = (await res.json().catch(() => null)) as {
      id?: string
      state?: string
      error?: { fieldErrors?: { code: string }[] }
    } | null
    if ((res.status === 201 || res.status === 200) && data?.id)
      return { ok: true, id: data.id, state: data.state === 'ready' ? 'complete' : 'processing' }
    return { ok: false, problem: problemOf(res.status, data?.error?.fieldErrors?.[0]?.code) }
  } catch {
    return { ok: false, problem: 'request.photos.problem.network' }
  }
}

export const problemValues = (limits: PhotoLimits | null) =>
  limits
    ? { mb: mb(limits.maxFileBytes), max: limits.maxPhotos, types: typeNames(limits.types) }
    : { mb: 0, max: 0, types: '' }

/** The photo state of the wizard; it lives in the wizard so it survives moving between steps. */
export function usePhotos(limits: PhotoLimits | null) {
  const [items, setItems] = useState<PhotoItem[]>([])
  const [capability, setCapability] = useState<string | null>(null)
  const pending = useRef<Promise<string | null> | null>(null)
  const update = (key: string, patch: Partial<PhotoItem>) =>
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)))

  const ensureCapability = useCallback(async (): Promise<string | null> => {
    if (capability) return capability
    pending.current ??= fetch('/api/v1/public/request-drafts', {
      method: 'POST',
      headers: { accept: 'application/json' },
    })
      .then(async (r) => (r.status === 201 ? ((await r.json()) as { capability: string }).capability : null))
      .catch(() => null)
      .then((c) => {
        if (c) setCapability(c)
        else pending.current = null
        return c
      })
    return pending.current
  }, [capability])

  const upload = useCallback(
    async (item: PhotoItem) => {
      setItems((list) =>
        list.map((i) => {
          if (i.key !== item.key) return i
          const { problem: _gone, ...rest } = i
          void _gone
          return { ...rest, state: 'uploading' as const }
        }),
      )
      const cap = await ensureCapability()
      if (!cap) return update(item.key, { state: 'failed', problem: 'request.photos.problem.unavailable' })
      const r = await uploadPhotoFile(item.file, cap)
      if (r.ok) update(item.key, { id: r.id, state: r.state })
      else update(item.key, { state: 'failed', problem: r.problem })
    },
    [ensureCapability],
  )

  const add = (files: FileList | File[]) => {
    const fresh: PhotoItem[] = []
    let count = items.filter((i) => i.state !== 'failed').length
    for (const file of Array.from(files)) {
      const item: PhotoItem = {
        key: crypto.randomUUID(),
        file,
        preview: URL.createObjectURL(file),
        state: 'uploading',
      }
      // Convenience checks only; the server checks again by content.
      if (limits && !limits.types.includes(file.type)) item.problem = 'request.photos.problem.type'
      else if (limits && file.size > limits.maxFileBytes) item.problem = 'request.photos.problem.too_large'
      else if (limits && count >= limits.maxPhotos) item.problem = 'request.photos.problem.too_many'
      if (item.problem) item.state = 'failed'
      else count++
      fresh.push(item)
    }
    setItems((list) => [...list, ...fresh])
    for (const item of fresh) if (item.state === 'uploading') void upload(item)
  }

  const retry = (key: string) => {
    const item = items.find((i) => i.key === key)
    if (item) void upload(item)
  }

  const remove = async (key: string) => {
    const item = items.find((i) => i.key === key)
    if (!item) return
    if (item.id && capability)
      await fetch(`/api/v1/public/request-drafts/photos/${item.id}`, {
        method: 'DELETE',
        headers: { 'upload-capability': capability },
      }).catch(() => null)
    URL.revokeObjectURL(item.preview)
    setItems((list) => list.filter((i) => i.key !== key))
  }

  // Processing photos are checked by the server; poll their states until each is saved or refused.
  const processing = items.some((i) => i.state === 'processing')
  useEffect(() => {
    if (!processing || !capability) return
    const timer = window.setInterval(async () => {
      const res = await fetch('/api/v1/public/request-drafts/photos', {
        headers: { 'upload-capability': capability },
      }).catch(() => null)
      if (!res?.ok) return
      const { photos } = (await res.json()) as { photos: { id: string; state: string }[] }
      setItems((list) =>
        list.map((i) => {
          const p = photos.find((x) => x.id === i.id)
          if (!p || i.state !== 'processing') return i
          if (p.state === 'ready') return { ...i, state: 'complete' }
          if (p.state === 'rejected') return { ...i, state: 'failed', problem: 'request.photos.problem.invalid' }
          return i
        }),
      )
    }, 1500)
    return () => window.clearInterval(timer)
  }, [processing, capability])

  return { items, capability, add, retry, remove }
}

export type PhotosApi = ReturnType<typeof usePhotos>

export function PhotoUploader({ photos, limits }: { photos: PhotosApi; limits: PhotoLimits | null }) {
  const values = problemValues(limits)
  return (
    <section className="hh-request__photos" aria-labelledby="hh-photos-title">
      <h3 id="hh-photos-title" className="hh-h3">
        {t('request.photos.title')}
      </h3>
      <p className="hh-request__warning">{t('request.photos.warning')}</p>
      {limits ? (
        <>
          <p className="hh-field__hint" id="hh-photos-limits">
            {t('request.photos.limits', values)}
          </p>
          <label className="hh-button hh-button--secondary hh-request__file">
            {t('request.photos.add')}
            <input
              type="file"
              name="photos"
              multiple
              accept={limits.types.join(',')}
              aria-describedby="hh-photos-limits"
              className="hh-visually-hidden"
              onChange={(e) => {
                if (e.currentTarget.files?.length) photos.add(e.currentTarget.files)
                e.currentTarget.value = ''
              }}
            />
          </label>
        </>
      ) : (
        <p className="hh-muted">{t('request.photos.problem.unavailable')}</p>
      )}
      {photos.items.length ? (
        <ul className="hh-request__photo-list" aria-live="polite">
          {photos.items.map((item, n) => (
            <li key={item.key} className="hh-request__photo" data-state={item.state}>
              <img src={item.preview} alt={t('request.photos.alt', { n: n + 1 })} width={96} height={96} />
              <div className="hh-request__photo-info">
                <StatusBadge tone={STATE_TONE[item.state]}>{t(STATE_LABEL[item.state])}</StatusBadge>
                {item.problem ? <p className="hh-field__error">{t(item.problem, values)}</p> : null}
                <div className="hh-request__actions">
                  {item.state === 'failed' && item.problem !== 'request.photos.problem.too_many' ? (
                    <Button variant="secondary" onClick={() => photos.retry(item.key)}>
                      {t('request.photos.retry')}
                    </Button>
                  ) : null}
                  <Button variant="quiet" onClick={() => void photos.remove(item.key)}>
                    {t('request.photos.remove')}
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

/**
 * The photos on the final review (TSK-0030, HH-INT-19): each preview with its state, without controls (Edit opens the
 * step that has them). A failed photo is shown as failed: it is not sent with the request (HH-INT-07).
 */
export function PhotoReviewList({ items }: { items: readonly PhotoItem[] }) {
  return (
    <ul className="hh-request__photo-list">
      {items.map((item, n) => (
        <li key={item.key} className="hh-request__photo" data-state={item.state}>
          <img src={item.preview} alt={t('request.photos.alt', { n: n + 1 })} width={96} height={96} />
          <div className="hh-request__photo-info">
            <StatusBadge tone={STATE_TONE[item.state]}>{t(STATE_LABEL[item.state])}</StatusBadge>
          </div>
        </li>
      ))}
    </ul>
  )
}
