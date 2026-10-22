// A job's field photos (TSK-0076; HH-QA-05, HH-PORT-11, HH-PRIV-02, HH-DATA-07, HH-STAFF-05, OWN-DEC-109,
// RULE-LANGUAGES). Everything shown and every action offered comes from the server, which decides each one again.
// - The assigned worker on an arrived visit uploads before photos and, after their own Start Work, after photos of each
//   work package, with an optional area label and the before photo an after photo pairs with.
// - Every photo is internal until Owner or Office share it with the customer; stopping the share is PROPOSED.
// - Marketing publication is a separate permission: only the Owner records the customer's evidenced permission (or its
//   withdrawal) for the website under the configured publication notice; while the notice is NOT CONFIGURED nothing
//   can be recorded, and the page says so. Sharing never grants it.
// Staff text in English and Spanish.
import type { StaffKey, StaffLocale } from '@handyhub/i18n'
import { Button, Field, StateView, StatusBadge } from '@handyhub/ui'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { call, idempotencyKey, upload, type ApiErrorBody, type Fetch } from './api'
import { codeLabel } from './Requests'

type T = (key: StaffKey, values?: Record<string, string | number>) => string
type Phase = 'before' | 'after'
type Publication = { channel: string; granted: boolean; noticeVersion: string | null; recordedAt: string }
export type FieldPhotoView = {
  id: string
  workPackageId: string
  visitId: string
  visitNumber: number
  phase: Phase
  areaLabel: string | null
  pairOf: string | null
  state: 'quarantined' | 'ready' | 'rejected'
  rejectionReason: string | null
  visibility: string
  version: number
  uploadedAt: string
  uploadedBy: { id: string; name: string | null }
  sharedAt: string | null
  url: string | null
  publication: Publication[]
  actions: { share: boolean; stopSharing: boolean; recordPublication: boolean }
}
export type JobPhotosView = {
  jobId: string
  projectReference: string
  workPackages: { workPackageId: string; serviceCode: string }[]
  photos: FieldPhotoView[]
  uploadVisits: { visitId: string; visitNumber: number; after: boolean }[]
  publicationNotice: string | null
}

const STATE_TONE = { quarantined: 'info', ready: 'success', rejected: 'danger' } as const
const bcp47 = (locale: StaffLocale) => (locale === 'es' ? 'es-US' : 'en-US')
const when = (iso: string, locale: StaffLocale) =>
  new Intl.DateTimeFormat(bcp47(locale), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))

function problemText(t: T, e: ApiErrorBody): string {
  const codes = e.fieldErrors.length ? e.fieldErrors.map((f) => f.code) : [e.code]
  return codes.map((c) => codeLabel(t, 'fieldPhotoProblem', c)).join(' ')
}

function UploadForm({
  t,
  fetchImpl,
  view,
  visit,
  onDone,
}: {
  t: T
  fetchImpl: Fetch
  view: JobPhotosView
  visit: JobPhotosView['uploadVisits'][number]
  onDone: () => void
}) {
  const [pkg, setPkg] = useState(view.workPackages[0]?.workPackageId ?? '')
  const [phase, setPhase] = useState<Phase>(visit.after ? 'after' : 'before')
  const [area, setArea] = useState('')
  const [pair, setPair] = useState('')
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const befores = view.photos.filter((p) => p.phase === 'before' && p.workPackageId === pkg)
  async function chosen(file: File | undefined) {
    if (!file || !pkg) return
    setPending(true)
    const q = new URLSearchParams({ workPackageId: pkg, phase })
    if (area.trim()) q.set('areaLabel', area.trim())
    if (phase === 'after' && pair) q.set('pairOf', pair)
    const r = await upload(
      fetchImpl,
      `/staff/visits/${encodeURIComponent(visit.visitId)}/field-photos?${q.toString()}`,
      file,
      file.type || 'application/octet-stream',
    )
    setPending(false)
    if (!r.ok) return setMessage({ ok: false, text: `${t('photos.upload.failed')} ${problemText(t, r.error)}` })
    setMessage({ ok: true, text: t('photos.upload.done') })
    setArea('')
    onDone()
  }
  const fileId = `field-photo-${visit.visitId}`
  return (
    <form
      className="staff-loadout__form"
      aria-label={t('photos.upload.title', { visit: visit.visitNumber })}
      onSubmit={(e: FormEvent) => e.preventDefault()}
    >
      <fieldset>
        <legend>{t('photos.upload.title', { visit: visit.visitNumber })}</legend>
        <label className="hh-field__label" htmlFor={`${fileId}-pkg`}>
          {t('photos.upload.package')}
        </label>{' '}
        <select id={`${fileId}-pkg`} value={pkg} onChange={(e) => setPkg(e.target.value)}>
          {view.workPackages.map((w) => (
            <option key={w.workPackageId} value={w.workPackageId}>
              {codeLabel(t, 'service', w.serviceCode)}
            </option>
          ))}
        </select>
        {(['before', 'after'] as const).map((ph) => (
          <label key={ph} className="staff-loadout__choice">
            <input
              type="radio"
              name={`${fileId}-phase`}
              checked={phase === ph}
              disabled={ph === 'after' && !visit.after}
              onChange={() => setPhase(ph)}
            />
            {codeLabel(t, 'fieldPhotoPhase', ph)}
          </label>
        ))}
        {!visit.after ? <p className="staff-request__hint">{t('photos.upload.afterNeedsStart')}</p> : null}
        <Field
          label={t('photos.upload.area')}
          hint={t('photos.upload.areaHint')}
          name="areaLabel"
          maxLength={120}
          value={area}
          onChange={(e) => setArea(e.target.value)}
        />
        {phase === 'after' && befores.length ? (
          <>
            <label className="hh-field__label" htmlFor={`${fileId}-pair`}>
              {t('photos.upload.pair')}
            </label>{' '}
            <select id={`${fileId}-pair`} value={pair} onChange={(e) => setPair(e.target.value)}>
              <option value="">{t('photos.upload.noPair')}</option>
              {befores.map((b, i) => (
                <option key={b.id} value={b.id}>
                  {t('photos.beforeN', { n: i + 1 })}
                  {b.areaLabel ? ` — ${b.areaLabel}` : ''}
                </option>
              ))}
            </select>
          </>
        ) : null}
        <p>
          <label className="hh-field__label" htmlFor={fileId}>
            {t('photos.upload.file')}
          </label>{' '}
          <input
            id={fileId}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            disabled={pending}
            onChange={(e) => {
              void chosen(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </p>
        {message ? (
          <p role={message.ok ? 'status' : 'alert'} className={message.ok ? 'staff-request__hint' : 'hh-field__error'}>
            {message.text}
          </p>
        ) : null}
      </fieldset>
    </form>
  )
}

function PublicationForm({
  t,
  fetchImpl,
  photo,
  notice,
  onDone,
}: {
  t: T
  fetchImpl: Fetch
  photo: FieldPhotoView
  notice: string | null
  onDone: () => void
}) {
  const current = photo.publication.find((p) => p.channel === 'website')
  const granting = !current?.granted
  const key = useRef<string | null>(null)
  const [kind, setKind] = useState('signed_form')
  const [reference, setReference] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (granting && !notice) return <p className="staff-request__hint">{t('photos.publication.notConfigured')}</p>
  async function submit(e: FormEvent) {
    e.preventDefault()
    setPending(true)
    key.current ??= idempotencyKey()
    const r = await call(fetchImpl, `/staff/field-photos/${encodeURIComponent(photo.id)}/publication-permissions`, {
      method: 'POST',
      body: {
        purpose: 'marketing',
        channel: 'website',
        granted: granting,
        ...(granting ? { noticeVersion: notice } : {}),
        evidenceKind: kind,
        evidenceReference: reference.trim(),
      },
      headers: { 'idempotency-key': key.current },
    })
    setPending(false)
    key.current = null
    if (!r.ok) return setError(problemText(t, r.error))
    setError(null)
    setReference('')
    onDone()
  }
  const id = `publication-${photo.id}`
  return (
    <form
      className="staff-loadout__form"
      onSubmit={(e) => void submit(e)}
      aria-label={t(granting ? 'photos.publication.grantTitle' : 'photos.publication.withdrawTitle')}
    >
      <fieldset>
        <legend>{t(granting ? 'photos.publication.grantTitle' : 'photos.publication.withdrawTitle')}</legend>
        <p className="staff-request__hint">
          {granting
            ? t('photos.publication.grantHint', { notice: notice ?? '' })
            : t('photos.publication.withdrawHint')}
        </p>
        <label className="hh-field__label" htmlFor={`${id}-kind`}>
          {t('photos.publication.evidenceKind')}
        </label>{' '}
        <select id={`${id}-kind`} value={kind} onChange={(e) => setKind(e.target.value)}>
          {['signed_form', 'email', 'text_message'].map((k) => (
            <option key={k} value={k}>
              {codeLabel(t, 'publicationEvidence', k)}
            </option>
          ))}
        </select>
        <Field
          label={t('photos.publication.evidenceReference')}
          name="evidenceReference"
          required
          maxLength={300}
          value={reference}
          onChange={(e) => setReference(e.target.value)}
        />
        {error ? (
          <p role="alert" className="hh-field__error">
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="secondary" pending={pending}>
          {t(granting ? 'photos.publication.grant' : 'photos.publication.withdraw')}
        </Button>
      </fieldset>
    </form>
  )
}

function PhotoItem({
  t,
  locale,
  fetchImpl,
  photo,
  view,
  n,
  onDone,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  photo: FieldPhotoView
  view: JobPhotosView
  n: number
  onDone: () => void
}) {
  const key = useRef<string | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const befores = view.photos.filter((p) => p.phase === 'before' && p.workPackageId === photo.workPackageId)
  const pairIndex = photo.pairOf ? befores.findIndex((b) => b.id === photo.pairOf) : -1
  const website = photo.publication.find((p) => p.channel === 'website')
  async function sharing(stop: boolean) {
    setPending(true)
    key.current ??= idempotencyKey()
    const r = await call(
      fetchImpl,
      `/staff/field-photos/${encodeURIComponent(photo.id)}/actions/${stop ? 'stop-sharing' : 'share'}`,
      { method: 'POST', body: {}, headers: { 'idempotency-key': key.current, 'if-match': `"${photo.version}"` } },
    )
    setPending(false)
    key.current = null
    if (!r.ok) return setError(problemText(t, r.error))
    setError(null)
    onDone()
  }
  const label = photo.phase === 'before' ? t('photos.beforeN', { n }) : t('photos.afterN', { n })
  return (
    <li
      className="staff-photos__item"
      data-testid="field-photo"
      data-phase={photo.phase}
      data-visibility={photo.visibility}
    >
      {photo.url ? (
        <img src={photo.url} alt={photo.areaLabel ? `${label} — ${photo.areaLabel}` : label} loading="lazy" />
      ) : null}
      <p>
        <strong>{label}</strong>
        {photo.areaLabel ? ` — ${photo.areaLabel}` : ''}{' '}
        <StatusBadge tone={STATE_TONE[photo.state]}>{codeLabel(t, 'fieldPhotoState', photo.state)}</StatusBadge>{' '}
        <StatusBadge tone={photo.visibility === 'customer_shared' ? 'success' : 'neutral'}>
          {codeLabel(t, 'visibilityClass', photo.visibility)}
        </StatusBadge>
      </p>
      {photo.state === 'rejected' && photo.rejectionReason ? (
        <p className="hh-field__error">{codeLabel(t, 'photoRejection', photo.rejectionReason)}</p>
      ) : null}
      {pairIndex >= 0 ? <p>{t('photos.pairsWith', { n: pairIndex + 1 })}</p> : null}
      <p className="staff-request__hint">
        {t('photos.uploaded', {
          who: photo.uploadedBy.name ?? '',
          time: when(photo.uploadedAt, locale),
          visit: photo.visitNumber,
        })}
        {photo.sharedAt ? ` · ${t('photos.sharedAt', { time: when(photo.sharedAt, locale) })}` : ''}
      </p>
      <p className="staff-request__hint" data-testid="field-photo-publication">
        {website
          ? website.granted
            ? t('photos.publication.granted', { time: when(website.recordedAt, locale) })
            : t('photos.publication.withdrawn', { time: when(website.recordedAt, locale) })
          : t('photos.publication.none')}
      </p>
      {photo.actions.share ? (
        <Button variant="secondary" pending={pending} onClick={() => void sharing(false)}>
          {t('photos.share')}
        </Button>
      ) : null}
      {photo.actions.stopSharing ? (
        <Button variant="secondary" pending={pending} onClick={() => void sharing(true)}>
          {t('photos.stopSharing')}
        </Button>
      ) : null}
      {error ? (
        <p role="alert" className="hh-field__error">
          {error}
        </p>
      ) : null}
      {photo.actions.recordPublication ? (
        <PublicationForm t={t} fetchImpl={fetchImpl} photo={photo} notice={view.publicationNotice} onDone={onDone} />
      ) : null}
    </li>
  )
}

export function JobPhotosPage({
  t,
  locale,
  fetchImpl,
  jobId,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  jobId: string
}) {
  const [view, setView] = useState<JobPhotosView | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  const load = useCallback(async () => {
    const r = await call<JobPhotosView>(fetchImpl, `/staff/jobs/${encodeURIComponent(jobId)}/photos`)
    if (!r.ok) return setState('unavailable')
    setView(r.data)
    setState('ready')
  }, [fetchImpl, jobId])
  useEffect(() => void load(), [load])
  if (state === 'loading') return <StateView kind="loading" title={t('photos.loading')} />
  if (state === 'unavailable' || !view) return <StateView kind="error" title={t('photos.unavailable')} />
  return (
    <main className="staff-start" aria-labelledby="job-photos-title">
      <h1 id="job-photos-title">{t('photos.title', { reference: view.projectReference })}</h1>
      <p>{t('photos.intro')}</p>
      {view.uploadVisits.map((v) => (
        <UploadForm key={v.visitId} t={t} fetchImpl={fetchImpl} view={view} visit={v} onDone={() => void load()} />
      ))}
      {view.workPackages.map((w) => {
        const photos = view.photos.filter((p) => p.workPackageId === w.workPackageId)
        let b = 0
        let a = 0
        return (
          <section key={w.workPackageId} aria-labelledby={`photos-${w.workPackageId}`}>
            <h2 id={`photos-${w.workPackageId}`} className="staff-myday__sub">
              {codeLabel(t, 'service', w.serviceCode)}
            </h2>
            {photos.length === 0 ? <p>{t('photos.none')}</p> : null}
            <ul className="staff-photos" data-testid="field-photos">
              {photos.map((p) => (
                <PhotoItem
                  key={p.id}
                  t={t}
                  locale={locale}
                  fetchImpl={fetchImpl}
                  photo={p}
                  view={view}
                  n={p.phase === 'before' ? ++b : ++a}
                  onDone={() => void load()}
                />
              ))}
            </ul>
          </section>
        )
      })}
    </main>
  )
}
