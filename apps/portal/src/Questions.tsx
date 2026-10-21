// Questions from HandyHub on the project's Overview (TSK-0051; HH-LEAD-03, HH-LEAD-06, HH-COM-02, HH-SEC-05, C04,
// OWN-DEC-98, OWN-DEC-101, RULE-LANGUAGES).
// - Each question exactly as HandyHub wrote it, whether it waits on the customer ("Waiting on you") and a clear Reply
//   action. A reply takes text, optional photos and, for a measurement, "I'm not sure". After sending: "Reply
//   received—HandyHub will review it"; the other questions stay open.
// - The reply draft (text, "I'm not sure", the photos already received and the upload capability) and its
//   idempotency key are kept in sessionStorage until the server accepts the reply, so a failed upload, a failed send,
//   a tab switch or a reload never loses them, and a retried send records one reply.
// - Photos are checked by the server like request photos; each shows its state (uploading, checking, received, not
//   accepted). Within the reopen period a "Closed—no response" request takes the reply, which reopens it; after the
//   period the page says a new request is the way.
// - The notice links to `#question-<id>`: that question is brought into view with its reply form open.
// English only, from the customer catalog; wording no decision gives is PROPOSED (OQ-PORTAL-WORDING).
import { Button, Field, StateView, StatusBadge } from '@handyhub/ui'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { newKey, portalWrites, type Fetch, type Question, type QuestionList } from './api'
import { t, when } from './labels'

type DraftPhoto = {
  id: string | null
  name: string
  state: 'uploading' | 'quarantined' | 'ready' | 'rejected' | 'failed'
}
type Draft = {
  text: string
  notSure: boolean
  capability: string | null
  photos: DraftPhoto[]
  key: string | null
}
const EMPTY: Draft = { text: '', notSure: false, capability: null, photos: [], key: null }
const store = (reference: string, id: string) => `hh.portal.reply.${reference}.${id}`
function loadDraft(reference: string, id: string): Draft {
  try {
    const raw = window.sessionStorage.getItem(store(reference, id))
    if (!raw) return EMPTY
    const d = JSON.parse(raw) as Partial<Draft>
    return {
      text: typeof d.text === 'string' ? d.text : '',
      notSure: d.notSure === true,
      capability: typeof d.capability === 'string' ? d.capability : null,
      // An upload that was under way when the page closed did not finish: it is not kept as received.
      photos: Array.isArray(d.photos)
        ? d.photos.filter((p) => p && typeof p.id === 'string' && p.state !== 'uploading')
        : [],
      key: typeof d.key === 'string' ? d.key : null,
    }
  } catch {
    return EMPTY
  }
}
function saveDraft(reference: string, id: string, d: Draft) {
  try {
    if (d.text || d.notSure || d.photos.length || d.capability || d.key)
      window.sessionStorage.setItem(store(reference, id), JSON.stringify(d))
    else window.sessionStorage.removeItem(store(reference, id))
  } catch {
    // Storage blocked: the draft lives only on the page.
  }
}

const PHOTO_LABEL = {
  uploading: 'portal.questions.photo.uploading',
  quarantined: 'portal.questions.photo.processing',
  ready: 'portal.questions.photo.received',
  rejected: 'portal.questions.photo.rejected',
  failed: 'portal.questions.photo.failed',
} as const

function ReplyForm({
  reference,
  q,
  maxLength,
  fetchImpl,
  onSent,
}: {
  reference: string
  q: Question
  maxLength: number
  fetchImpl: Fetch
  onSent: (reopened: boolean) => Promise<void>
}) {
  const ids = useId()
  const [draft, setDraft] = useState<Draft>(() => loadDraft(reference, q.id))
  const [pending, setPending] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const latest = useRef(draft)
  latest.current = draft
  useEffect(() => saveDraft(reference, q.id, draft), [reference, q.id, draft])
  const update = (fn: (d: Draft) => Draft) => setDraft((d) => fn(d))

  // Photos still being checked: their state is read again until it settles.
  const checking = draft.capability && draft.photos.some((p) => p.state === 'quarantined')
  useEffect(() => {
    if (!checking || !draft.capability) return
    const cap = draft.capability
    const timer = window.setTimeout(async () => {
      const r = await portalWrites.listPhotos(fetchImpl, cap)
      if (!r.ok) return
      update((d) => ({
        ...d,
        photos: d.photos.map((p) => {
          const found = r.data.photos.find((x) => x.id === p.id)
          return found ? { ...p, state: found.state } : p
        }),
      }))
    }, 1500)
    return () => window.clearTimeout(timer)
  }, [checking, draft.capability, draft.photos, fetchImpl])

  async function capability(): Promise<string | null> {
    if (latest.current.capability) return latest.current.capability
    const r = await portalWrites.startUpload(fetchImpl, reference, q.id)
    if (!r.ok) return null
    update((d) => ({ ...d, capability: r.data.capability }))
    latest.current = { ...latest.current, capability: r.data.capability }
    return r.data.capability
  }

  async function addPhotos(files: FileList | null) {
    if (!files || files.length === 0) return
    setProblem(null)
    let cap = await capability()
    if (!cap) return setProblem(t('portal.questions.photo.unavailable'))
    for (const file of Array.from(files)) {
      const slot = `${file.name}-${Date.now()}`
      update((d) => ({ ...d, photos: [...d.photos, { id: null, name: slot, state: 'uploading' }] }))
      const type = file.type || 'application/octet-stream'
      let r = await portalWrites.uploadPhoto(fetchImpl, cap, file, type)
      // A kept capability that has since expired answers like a missing one: start a new one once and try again.
      if (!r.ok && r.failure === 'unavailable' && !latest.current.photos.some((p) => p.id)) {
        latest.current = { ...latest.current, capability: null }
        update((d) => ({ ...d, capability: null }))
        const fresh = await capability()
        if (fresh) {
          cap = fresh
          r = await portalWrites.uploadPhoto(fetchImpl, cap, file, type)
        }
      }
      update((d) => ({
        ...d,
        photos: d.photos.map((p) =>
          p.name !== slot
            ? p
            : r.ok
              ? { id: r.data.id, name: file.name, state: r.data.state }
              : { id: null, name: file.name, state: 'failed' },
        ),
      }))
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  async function remove(p: DraftPhoto) {
    if (p.id && draft.capability) await portalWrites.removePhoto(fetchImpl, draft.capability, p.id)
    update((d) => ({ ...d, photos: d.photos.filter((x) => x !== p) }))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const photoIds = draft.photos.flatMap((p) =>
      p.id && (p.state === 'ready' || p.state === 'quarantined') ? [p.id] : [],
    )
    if (!draft.text.trim() && !draft.notSure && photoIds.length === 0) return setProblem(t('portal.questions.empty'))
    const key = draft.key ?? newKey()
    update((d) => ({ ...d, key }))
    setPending(true)
    setProblem(null)
    const r = await portalWrites.reply(
      fetchImpl,
      reference,
      q.id,
      {
        ...(draft.text.trim() ? { text: draft.text } : {}),
        ...(draft.notSure ? { notSure: true } : {}),
        ...(photoIds.length ? { photoIds } : {}),
      },
      key,
      photoIds.length ? draft.capability : null,
    )
    setPending(false)
    if (r.ok) {
      saveDraft(reference, q.id, EMPTY)
      setDraft(EMPTY)
      await onSent(r.data.reopened)
      return
    }
    // A refusal is final for this key (a new attempt gets a new one); the draft stays either way.
    if (r.failure === 'refused') {
      update((d) => ({ ...d, key: null }))
      const codes = r.codes
      return setProblem(
        codes.includes('sensitive_content')
          ? t('portal.questions.cardNumber')
          : codes.includes('ALREADY_ANSWERED')
            ? t('portal.questions.alreadyAnswered')
            : codes.includes('REOPEN_PERIOD_ENDED') || codes.includes('REQUEST_CLOSED')
              ? t('portal.questions.closed')
              : t('portal.questions.failed'),
      )
    }
    setProblem(r.failure === 'expired' ? t('portal.expired.title') : t('portal.questions.failed'))
  }

  return (
    <form className="portal-reply" aria-label={t('portal.questions.replyTo')} onSubmit={(e) => void submit(e)}>
      <Field
        multiline
        label={t('portal.questions.yourReply')}
        maxLength={maxLength}
        value={draft.text}
        onChange={(e) => update((d) => ({ ...d, text: e.target.value }))}
      />
      {q.kind === 'measurement' ? (
        <label className="portal-reply__check">
          <input
            type="checkbox"
            checked={draft.notSure}
            onChange={(e) => update((d) => ({ ...d, notSure: e.target.checked }))}
          />{' '}
          {t('portal.questions.notSure')}
        </label>
      ) : null}
      <div className="portal-reply__photos">
        <label htmlFor={`${ids}-photos`} className="hh-field__label">
          {t('portal.questions.photos')}
        </label>
        <input
          id={`${ids}-photos`}
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          aria-describedby={`${ids}-photos-hint`}
          onChange={(e) => void addPhotos(e.target.files)}
        />
        <p id={`${ids}-photos-hint`} className="hh-field__hint">
          {t('portal.questions.photosHint')}
        </p>
        {draft.photos.length ? (
          <ul className="portal-reply__list" aria-label={t('portal.questions.photosAdded')}>
            {draft.photos.map((p, i) => (
              <li key={`${p.id ?? p.name}-${i}`}>
                {t('portal.questions.photo.item', { n: i + 1 })}: {t(PHOTO_LABEL[p.state])}{' '}
                {p.state !== 'uploading' ? (
                  <Button variant="quiet" onClick={() => void remove(p)}>
                    {t('portal.questions.photo.remove', { n: i + 1 })}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <p className="hh-small hh-muted">{t('portal.questions.safety')}</p>
      {problem ? (
        <p className="portal-reply__problem" role="alert">
          {problem}
        </p>
      ) : null}
      <Button
        type="submit"
        pending={pending}
        {...(draft.photos.some((p) => p.state === 'uploading')
          ? { disabledReason: t('portal.questions.photo.wait') }
          : {})}
      >
        {t('portal.questions.send')}
      </Button>
    </form>
  )
}

export function Questions({
  reference,
  data,
  fetchImpl,
  onChanged,
}: {
  reference: string
  data: QuestionList
  fetchImpl: Fetch
  onChanged: () => Promise<void>
}) {
  const [open, setOpen] = useState<string | null>(null)
  const [received, setReceived] = useState<{ id: string; reopened: boolean } | null>(null)
  // The notice's link (and the Reply action above) names one question: bring it into view with its reply open.
  const handled = useRef(false)
  const questions = useRef(data.questions)
  questions.current = data.questions
  useEffect(() => {
    const openFromHash = () => {
      const m = /^#question-([0-9a-f-]{36})$/i.exec(window.location.hash)
      if (!m) return
      const id = (m[1] as string).toLowerCase()
      if (questions.current.some((q) => q.id === id && q.canReply)) setOpen(id)
      window.setTimeout(() => document.getElementById(`question-${id}`)?.scrollIntoView({ block: 'start' }), 0)
    }
    if (!handled.current) {
      handled.current = true
      openFromHash()
    }
    window.addEventListener('hashchange', openFromHash)
    return () => window.removeEventListener('hashchange', openFromHash)
  }, [])
  if (data.questions.length === 0) return null
  return (
    <section className="portal-section" aria-labelledby="portal-questions">
      <h3 id="portal-questions" className="hh-h3">
        {t('portal.questions.title')}
      </h3>
      {data.replyWindow === 'reopen' && data.reopenUntil ? (
        <p>{t('portal.questions.reopenUntil', { time: when(data.reopenUntil) })}</p>
      ) : null}
      {data.replyWindow === 'period_ended' ? (
        <StateView
          kind="empty"
          title={t('portal.questions.periodEnded')}
          action={
            <a className="hh-button" href="/request">
              {t('portal.questions.newRequest')}
            </a>
          }
        />
      ) : null}
      <ol className="portal-questions">
        {data.questions.map((q) => (
          <li key={q.id} id={`question-${q.id}`} className="portal-questions__item" tabIndex={-1}>
            <p className="portal-questions__text">{q.text}</p>
            <p className="hh-small hh-muted">
              <StatusBadge tone={q.state === 'waiting' ? 'warning' : 'success'}>
                {t(q.state === 'waiting' ? 'portal.waiting.customer' : 'portal.questions.answered')}
              </StatusBadge>{' '}
              {t('portal.questions.asked', { time: when(q.askedAt) })}
            </p>
            {received?.id === q.id ? (
              <StateView
                kind="success"
                title={t('portal.questions.received')}
                {...(received.reopened ? { children: <p>{t('portal.questions.reopened')}</p> } : {})}
              />
            ) : null}
            {q.reply ? (
              <div className="portal-questions__reply">
                <p className="hh-small">
                  <strong>{t('portal.questions.yourReplyAt', { time: when(q.reply.at) })}</strong>
                </p>
                {q.reply.text !== null ? <p className="portal-questions__text">{q.reply.text}</p> : null}
                {q.reply.notSure ? <p>{t('portal.questions.notSure')}</p> : null}
                {q.reply.photos.received + q.reply.photos.processing + q.reply.photos.failed > 0 ? (
                  <p className="hh-small hh-muted">
                    {t('portal.questions.replyPhotos', {
                      count: q.reply.photos.received + q.reply.photos.processing + q.reply.photos.failed,
                    })}
                  </p>
                ) : null}
              </div>
            ) : null}
            {q.canReply ? (
              open === q.id ? (
                <ReplyForm
                  reference={reference}
                  q={q}
                  maxLength={data.maxLength}
                  fetchImpl={fetchImpl}
                  onSent={async (reopened) => {
                    setOpen(null)
                    setReceived({ id: q.id, reopened })
                    await onChanged()
                  }}
                />
              ) : (
                <Button aria-expanded={false} onClick={() => setOpen(q.id)}>
                  {t('portal.action.reply')}
                </Button>
              )
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  )
}
