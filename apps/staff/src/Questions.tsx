// Questions to the customer on the request record (TSK-0051; HH-LEAD-03, HH-LEAD-06, HH-COM-02, HH-COM-09, C04, S02,
// OWN-DEC-98, OWN-DEC-101).
// - The composer: the question exactly as the customer will read it (customer content is English, RULE-LANGUAGES),
//   whether it is a measurement (the customer may answer "I'm not sure"), and the hazard guard: a warning and a
//   required confirmation that the question never asks the customer to inspect a hazardous area. Publish is the
//   release: the automatic notice goes out with no second approval. The draft and its idempotency key are kept in
//   sessionStorage until the server accepts it, so a failure or a reload never loses it and a retry publishes once.
// - Each question: its text, author and time; its notice (sent, pending or failed, per channel, with Retry for a
//   definite failure: a failed notice never starts the reminder); its one automatic reminder (TSK-0121, OWN-DEC-153:
//   3 days after the notice was delivered; scheduled, sent, failed or cancelled, with Retry for a definite failure; an
//   email at any hour, a text inside the customer's permitted hours); and the customer's reply exactly as written,
//   "I'm not sure", its photos' states, and whether it reopened the request.
// - "Closed—no response": offered to the roles that may close, with the server's unmet requirements written out
//   while it is not possible yet, and the request's version (If-Match). The reopen period is shown once closed.
// - TSK-0148 (OWN-DEC-197 E2, E4, E5): the composer marks whether the customer may answer "I'm not sure" / "I don't
//   know" on any question (a measurement always may); a reminder that was not delivered says to follow up instead of
//   closing; a "Closed—no response" request can be reopened by the roles allowed to, with a written reason, also after
//   the reopen period.
// The server decides everything again; this screen only offers what it says is open now.
import type { StaffKey, StaffLocale } from '@handyhub/i18n'
import { Button, Field, StateView, StatusBadge, type StatusTone } from '@handyhub/ui'
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react'
import { call, idempotencyKey, type ApiErrorBody, type Fetch } from './api'
import { codeLabel } from './Requests'

type T = (key: StaffKey, values?: Record<string, string | number>) => string

type Delivery = {
  id: string
  channel: string
  state: string
  errorCode: string | null
  sendAt: string | null
  retry: boolean
}
export type QuestionsView = {
  requestId: string
  reference: string
  state: string
  version: number
  projectState: string
  questions: {
    id: string
    kind: 'general' | 'measurement'
    notSureAllowed: boolean
    text: string
    author: { id: string; name: string | null }
    publishedAt: string
    state: 'published' | 'answered'
    answeredAt: string | null
    notice: { state: 'pending' | 'sent' | 'failed'; sentAt: string | null; deliveries: Delivery[] }
    reminder: {
      state: string
      dueAt: string | null
      sentAt: string | null
      deliveries: Delivery[]
    }
    reply: {
      text: string | null
      notSure: boolean
      at: string
      reopenedRequest: boolean
      photos: { id: string; state: string }[]
    } | null
  }[]
  canPublish: boolean
  repliesWaiting: boolean
  canMarkReviewed: boolean
  cadence: { afterDeliveryHours: number; closeAfterReminderHours: number } | null
  close: { allowed: boolean; available: boolean; reasons: string[]; availableAt: string | null }
  reopen: {
    days: number | null
    closedAt: string | null
    until: string | null
    periodEnded: boolean
    allowed: boolean
  }
  maxLength: number
}

type Draft = { text: string; kind: 'general' | 'measurement'; notSure: boolean; key: string | null }
const EMPTY_DRAFT: Draft = { text: '', kind: 'general', notSure: false, key: null }
const draftStore = (requestId: string) => `hh.staff.question-draft.${requestId}`
function loadDraft(requestId: string): Draft {
  try {
    const raw = window.sessionStorage.getItem(draftStore(requestId))
    const d = raw ? (JSON.parse(raw) as Partial<Draft>) : null
    return {
      text: typeof d?.text === 'string' ? d.text : '',
      kind: d?.kind === 'measurement' ? 'measurement' : 'general',
      notSure: d?.notSure === true,
      key: typeof d?.key === 'string' ? d.key : null,
    }
  } catch {
    return EMPTY_DRAFT
  }
}
function saveDraft(requestId: string, d: Draft) {
  try {
    if (d.text || d.key) window.sessionStorage.setItem(draftStore(requestId), JSON.stringify(d))
    else window.sessionStorage.removeItem(draftStore(requestId))
  } catch {
    // Storage blocked: the draft lives only in the page.
  }
}

const NOTICE_TONE: Record<string, StatusTone> = { sent: 'success', pending: 'info', failed: 'danger' }
const REMINDER_TONE: Record<string, StatusTone> = {
  not_scheduled: 'neutral',
  scheduled: 'info',
  draft: 'warning',
  queued: 'info',
  sent: 'success',
  failed: 'danger',
  cancelled: 'neutral',
}

function refusalCodes(error: ApiErrorBody): string[] {
  return error.fieldErrors.length ? error.fieldErrors.map((f) => f.code) : [error.code]
}

export function RequestQuestions({
  t,
  locale,
  fetchImpl,
  requestId,
  requestVersion,
  onChanged,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  requestId: string
  /** The record's version: when another action changes the request, this section reads it again. */
  requestVersion?: number
  /** The request record reloads too: publishing or closing changes the request's state and version. */
  onChanged: () => Promise<void>
}) {
  const ids = useId()
  const [view, setView] = useState<QuestionsView | null | undefined>(undefined)
  const [draft, setDraft] = useState<Draft>(() => loadDraft(requestId))
  const [noHazard, setNoHazard] = useState(false)
  const [pending, setPending] = useState<string | null>(null)
  const [message, setMessage] = useState<{
    kind: 'success' | 'blocked' | 'error'
    title: string
    reasons?: string[]
  } | null>(null)
  const [closing, setClosing] = useState(false)
  const [closeNote, setCloseNote] = useState('')
  const [reopening, setReopening] = useState(false)
  const [reopenReason, setReopenReason] = useState('')
  const load = useCallback(async () => {
    const r = await call<QuestionsView>(fetchImpl, `/staff/requests/${encodeURIComponent(requestId)}/questions`)
    setView(r.ok && Array.isArray(r.data?.questions) ? r.data : null)
  }, [fetchImpl, requestId])
  useEffect(() => {
    void load()
  }, [load, requestVersion])
  useEffect(() => saveDraft(requestId, draft), [requestId, draft])

  const fmt = new Intl.DateTimeFormat(locale === 'es' ? 'es-US' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' })
  const when = (iso: string) => fmt.format(new Date(iso))

  async function post(path: string, body: unknown, opts: { key?: string; version?: number } = {}) {
    return call<unknown>(fetchImpl, path, {
      method: 'POST',
      body,
      headers: {
        'idempotency-key': opts.key ?? idempotencyKey(),
        ...(opts.version === undefined ? {} : { 'if-match': `"${opts.version}"` }),
      },
    })
  }
  const refused = (error: ApiErrorBody) =>
    setMessage(
      error.code === 'CONFLICT' || error.code === 'STALE_VERSION'
        ? {
            kind: 'blocked',
            title: t('request.refused'),
            reasons: refusalCodes(error).map((c) => codeLabel(t, 'requestRefusal', c)),
          }
        : { kind: 'error', title: t('request.saveFailed') },
    )

  async function publish(e: FormEvent) {
    e.preventDefault()
    if (!view || !draft.text.trim() || !noHazard) return
    // One key per draft: a retry after a failure publishes it once.
    const key = draft.key ?? idempotencyKey()
    setDraft({ ...draft, key })
    setPending('publish')
    const r = await post(
      `/staff/requests/${encodeURIComponent(requestId)}/questions`,
      {
        text: draft.text,
        kind: draft.kind,
        notSureAllowed: draft.kind === 'measurement' || draft.notSure,
        noHazardInspection: true,
      },
      { key, version: view.version },
    )
    setPending(null)
    if (!r.ok) {
      if (r.status < 500) setDraft({ ...draft, key: null })
      if (r.error.fieldErrors.some((f) => f.code === 'sensitive_content'))
        return setMessage({ kind: 'blocked', title: t('questions.cardNumber') })
      return refused(r.error)
    }
    setDraft(EMPTY_DRAFT)
    setNoHazard(false)
    setMessage({ kind: 'success', title: t('questions.published') })
    await Promise.all([load(), onChanged()])
  }

  async function act(name: string, path: string, body: unknown = {}, version?: number) {
    setPending(name)
    const r = await post(path, body, version === undefined ? {} : { version })
    setPending(null)
    if (!r.ok) {
      refused(r.error)
      await load()
      return false
    }
    return true
  }

  if (view === undefined) return null
  if (view === null)
    return (
      <section className="staff-request__section" aria-labelledby={`${ids}-questions`}>
        <h2 id={`${ids}-questions`} className="staff-queue__heading">
          {t('questions.title')}
        </h2>
        <StateView kind="error" title={t('questions.loadFailed')} />
      </section>
    )
  const base = `/staff/requests/${encodeURIComponent(requestId)}`
  return (
    <section className="staff-request__section" aria-labelledby={`${ids}-questions`}>
      <h2 id={`${ids}-questions`} className="staff-queue__heading">
        {t('questions.title')}
      </h2>
      <p className="staff-request__hint">{t('questions.noticeHint')}</p>
      {view.cadence ? (
        <p className="staff-request__hint" data-testid="question-cadence">
          {t('questions.cadence', {
            hours: view.cadence.afterDeliveryHours,
            close: view.cadence.closeAfterReminderHours,
          })}
        </p>
      ) : (
        <p className="staff-request__hint">{t('questions.cadenceNotConfigured')}</p>
      )}
      {message ? (
        <StateView
          kind={message.kind}
          title={message.title}
          {...(message.reasons ? { reasons: message.reasons } : {})}
        />
      ) : null}

      {view.questions.length === 0 ? <p>{t('questions.none')}</p> : null}
      <ol className="staff-questions">
        {view.questions.map((q) => (
          <li
            key={q.id}
            className="staff-questions__item"
            aria-label={t('questions.item', { time: when(q.publishedAt) })}
          >
            <p className="staff-questions__text" lang="en">
              {q.text}
            </p>
            <p className="staff-request__hint">
              <StatusBadge tone={q.state === 'answered' ? 'success' : 'warning'}>
                {codeLabel(t, 'questionState', q.state)}
              </StatusBadge>{' '}
              {q.kind === 'measurement' ? <StatusBadge>{codeLabel(t, 'questionKind', q.kind)}</StatusBadge> : null}{' '}
              {q.notSureAllowed ? <StatusBadge tone="info">{t('questions.notSureOffered')}</StatusBadge> : null}{' '}
              {t('questions.askedBy', { name: q.author.name ?? t('queue.unnamed'), time: when(q.publishedAt) })}
            </p>
            <div className="staff-questions__delivery">
              <p>
                <strong>{t('questions.notice')}</strong>{' '}
                <StatusBadge tone={NOTICE_TONE[q.notice.state] ?? 'neutral'}>
                  {codeLabel(t, 'questionNotice', q.notice.state)}
                </StatusBadge>{' '}
                {q.notice.sentAt ? t('questions.sentAt', { time: when(q.notice.sentAt) }) : null}
              </p>
              <Deliveries
                t={t}
                when={when}
                deliveries={q.notice.deliveries}
                onRetry={async (id) => {
                  if (await act(`retry-${id}`, `/staff/message-deliveries/${encodeURIComponent(id)}/retry`))
                    await load()
                }}
                pending={pending}
              />
              {q.notice.state === 'failed' ? (
                <p className="staff-request__hint">{t('questions.noticeFailedHint')}</p>
              ) : null}
            </div>
            <div className="staff-questions__reminders" data-testid="question-reminder">
              <p>
                <strong>{t('questions.reminder')}</strong>{' '}
                <StatusBadge tone={REMINDER_TONE[q.reminder.state] ?? 'neutral'}>
                  {codeLabel(t, 'reminderState', q.reminder.state)}
                </StatusBadge>{' '}
                {q.reminder.dueAt && q.reminder.state === 'scheduled'
                  ? t('questions.dueAt', { time: when(q.reminder.dueAt) })
                  : null}
                {q.reminder.sentAt ? t('questions.sentAt', { time: when(q.reminder.sentAt) }) : null}
              </p>
              <Deliveries
                t={t}
                when={when}
                deliveries={q.reminder.deliveries}
                pending={pending}
                onRetry={async (id) => {
                  if (await act(`retry-${id}`, `/staff/message-deliveries/${encodeURIComponent(id)}/retry`))
                    await load()
                }}
              />
              {q.reminder.state === 'failed' && q.state === 'published' ? (
                <p className="staff-request__hint">{t('questions.reminderFailedHint')}</p>
              ) : null}
            </div>
            {q.reply ? (
              <div className="staff-questions__reply">
                <p>
                  <strong>{t('questions.reply', { time: when(q.reply.at) })}</strong>{' '}
                  {q.reply.notSure ? <StatusBadge tone="info">{t('questions.notSure')}</StatusBadge> : null}{' '}
                  {q.reply.reopenedRequest ? <StatusBadge tone="warning">{t('questions.reopened')}</StatusBadge> : null}
                </p>
                {q.reply.text !== null ? (
                  <p className="staff-questions__text" lang="en">
                    {q.reply.text}
                  </p>
                ) : null}
                {q.reply.photos.length ? (
                  <p className="staff-request__hint">
                    {t('questions.replyPhotos', { count: q.reply.photos.length })}{' '}
                    {q.reply.photos.map((p) => codeLabel(t, 'photoState', p.state)).join(', ')}
                  </p>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ol>

      {view.canMarkReviewed ? (
        <Button
          variant="secondary"
          pending={pending === 'reviewed'}
          onClick={async () => {
            if (await act('reviewed', `${base}/questions/replies-reviewed`)) {
              setMessage({ kind: 'success', title: t('questions.reviewedDone') })
              await Promise.all([load(), onChanged()])
            }
          }}
        >
          {t('questions.markReviewed')}
        </Button>
      ) : null}

      {view.canPublish ? (
        <form className="staff-request__form" aria-label={t('questions.composer')} onSubmit={(e) => void publish(e)}>
          <Field
            multiline
            label={t('questions.text')}
            hint={t('questions.textHint')}
            required
            requiredText={t('request.required')}
            maxLength={view.maxLength}
            value={draft.text}
            onChange={(e) => setDraft({ ...draft, text: e.target.value })}
          />
          <label className="staff-request__package">
            <input
              type="checkbox"
              checked={draft.kind === 'measurement'}
              onChange={(e) => setDraft({ ...draft, kind: e.target.checked ? 'measurement' : 'general' })}
            />{' '}
            {t('questions.measurement')}
          </label>
          <label className="staff-request__package">
            <input
              type="checkbox"
              checked={draft.kind === 'measurement' || draft.notSure}
              disabled={draft.kind === 'measurement'}
              onChange={(e) => setDraft({ ...draft, notSure: e.target.checked })}
            />{' '}
            {t('questions.notSureAllowed')}
          </label>
          <div className="staff-questions__guard" role="note">
            <p>
              <strong>{t('questions.hazardTitle')}</strong> {t('questions.hazardWarning')}
            </p>
            <label className="staff-request__package">
              <input type="checkbox" required checked={noHazard} onChange={(e) => setNoHazard(e.target.checked)} />{' '}
              {t('questions.hazardConfirm')}
            </label>
          </div>
          <Button
            type="submit"
            pending={pending === 'publish'}
            {...(noHazard ? {} : { disabledReason: t('questions.hazardRequired') })}
          >
            {t('questions.publish')}
          </Button>
        </form>
      ) : null}

      {view.state === 'closed_no_response' && view.reopen.until ? (
        <p className="staff-request__hint">
          {t(view.reopen.periodEnded ? 'questions.reopenPeriodEnded' : 'questions.reopenUntil', {
            time: when(view.reopen.until),
          })}
        </p>
      ) : null}
      {view.reopen.allowed ? (
        <div className="staff-questions__close">
          <Button variant="secondary" aria-expanded={reopening} onClick={() => setReopening(!reopening)}>
            {t('questions.reopen')}
          </Button>
          {reopening ? (
            <form
              className="staff-request__form"
              aria-label={t('questions.reopen')}
              onSubmit={async (e) => {
                e.preventDefault()
                if (!reopenReason.trim()) return
                if (await act('reopen', `${base}/actions/reopen`, { reason: reopenReason }, view.version)) {
                  setReopening(false)
                  setReopenReason('')
                  setMessage({ kind: 'success', title: t('questions.reopenDone') })
                  await Promise.all([load(), onChanged()])
                }
              }}
            >
              <p className="staff-request__hint">{t('questions.reopenHint')}</p>
              <Field
                multiline
                label={t('questions.reopenReason')}
                required
                requiredText={t('request.required')}
                maxLength={2000}
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
              />
              <Button
                type="submit"
                pending={pending === 'reopen'}
                {...(reopenReason.trim() ? {} : { disabledReason: t('questions.reopenReasonRequired') })}
              >
                {t('request.confirm', { action: t('questions.reopen') })}
              </Button>
            </form>
          ) : null}
        </div>
      ) : null}
      {view.close.allowed && view.state === 'needs_information' ? (
        <div className="staff-questions__close">
          <Button
            variant="secondary"
            aria-expanded={closing}
            {...(view.close.available
              ? {}
              : {
                  disabledReason: view.close.availableAt
                    ? t('questions.closeFrom', { time: when(view.close.availableAt) })
                    : view.close.reasons.map((c) => codeLabel(t, 'requestRefusal', c)).join(' '),
                })}
            onClick={() => setClosing(!closing)}
          >
            {codeLabel(t, 'requestDecision', 'close_no_response')}
          </Button>
          {closing && view.close.available ? (
            <form
              className="staff-request__form"
              aria-label={codeLabel(t, 'requestDecision', 'close_no_response')}
              onSubmit={async (e) => {
                e.preventDefault()
                if (
                  await act(
                    'close',
                    `${base}/actions/close-no-response`,
                    closeNote.trim() ? { internalNote: closeNote } : {},
                    view.version,
                  )
                ) {
                  setClosing(false)
                  setCloseNote('')
                  setMessage({ kind: 'success', title: t('questions.closed') })
                  await Promise.all([load(), onChanged()])
                }
              }}
            >
              <p className="staff-request__hint">{t('questions.closeHint')}</p>
              <Field
                multiline
                label={t('request.internalNote')}
                hint={t('request.internalNoteHint')}
                maxLength={5000}
                value={closeNote}
                onChange={(e) => setCloseNote(e.target.value)}
              />
              <Button type="submit" pending={pending === 'close'}>
                {t('request.confirm', { action: codeLabel(t, 'requestDecision', 'close_no_response') })}
              </Button>
            </form>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function Deliveries({
  t,
  when,
  deliveries,
  onRetry,
  pending,
}: {
  t: T
  when: (iso: string) => string
  deliveries: readonly Delivery[]
  onRetry: (id: string) => Promise<void>
  pending: string | null
}) {
  if (!deliveries.length) return null
  return (
    <ul className="staff-questions__deliveries">
      {deliveries.map((d) => (
        <li key={d.id}>
          {codeLabel(t, 'messageChannel', d.channel)}: {codeLabel(t, 'deliveryState', d.state)}
          {d.errorCode ? ` (${codeLabel(t, 'deliveryError', d.errorCode)})` : ''}
          {d.state === 'queued' && d.sendAt ? ` ${t('questions.sendsAt', { time: when(d.sendAt) })}` : ''}
          {d.retry ? (
            <>
              {' '}
              <Button variant="quiet" pending={pending === `retry-${d.id}`} onClick={() => void onRetry(d.id)}>
                {t('queue.retry')}
              </Button>
            </>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
