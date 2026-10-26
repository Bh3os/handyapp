// A job's closeout and its follow-ups (TSK-0092; HH-QA-09, HH-QA-10, OWN-DEC-77, OWN-DEC-157, OWN-DEC-113,
// RULE-SERVER-AUTHZ). The page /closeout/<job>, from Owner Decisions ("Jobs to close"), the staff queue ("Follow-ups to
// release") and the quality review, for the Owner and Office.
// - Closeout: the job's state and, until it closes, every obligation still open, named. The Owner closes it once none
//   is left; the Owner alone reopens a closed job, with a fresh sign-in (the password prompt) and a reason. The history
//   lists every close (with its financial basis) and reopen (with its reason).
// - Follow-ups: the service-quality follow-up prepared after the Owner's review passed and the review requests, each
//   with its state and reason; staff release or cancel a draft. A case open on the project holds them. Review requests
//   are never automatic and never depend on the customer's answer; their wording is NOT CONFIGURED until the Owner
//   releases one. The customer's answers, as staff record them.
// The server decides every action again; a refusal names its reasons.
import type { StaffKey } from '@handyhub/i18n'
import { Button, Field, StateView, StatusBadge } from '@handyhub/ui'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { call, idempotencyKey, type ApiErrorBody, type Fetch } from './api'
import { reminderShownState, reminderTone } from './EstimateReminders'
import { ReauthForm, useOwnerWrite } from './OwnerWrite'
import { codeLabel } from './Requests'
import { useOnline } from './Shell'

type T = (key: StaffKey, values?: Record<string, string | number | Date>) => string
type StaffRef = { id: string; name: string | null }

export type FollowUpItem = {
  id: string
  kind: 'satisfaction' | 'review'
  state: string
  reason: string | null
  scheduledAt: string | null
  sentAt: string | null
  cancelledAt: string | null
  createdAt: string
}
export type CloseoutData = {
  jobId: string
  projectId: string
  projectReference: string
  jobState: string
  version: number
  obligations: string[]
  history: {
    id: string
    event: 'closed' | 'reopened'
    fromState: string
    financialBasis: string | null
    reason: string | null
    recordedBy: StaffRef
    recordedAt: string
  }[]
  followUps: {
    cadence: { state: 'CONFIGURED'; daysAfterCompletion: number } | { state: 'NOT_CONFIGURED' }
    satisfactionDueAt: string | null
    items: FollowUpItem[]
    satisfactionBlockedBy: string | null
    reviewBlockedBy: string | null
    reviewWording: 'CONFIGURED' | 'NOT_CONFIGURED'
    responses: { id: string; answer: string; note: string | null; recordedBy: StaffRef; recordedAt: string }[]
  }
  actions: {
    close: boolean
    reopen: boolean
    releaseFollowUps: boolean
    prepareReviewRequest: boolean
    recordResponse: boolean
  }
}

const ANSWERS = ['positive', 'mixed', 'negative'] as const

/** The labels of a refusal: every obligation it names, or the closeout refusal code. */
export function closeoutRefusal(t: T, err: ApiErrorBody): string {
  const labels = err.fieldErrors.map((f) => {
    const obligation = codeLabel(t, 'closeoutObligation', f.code)
    if (obligation !== f.code) return obligation
    const own = codeLabel(t, 'closeoutRefusal', f.code)
    return own !== f.code ? own : null
  })
  const named = labels.filter((l): l is string => l !== null)
  if (named.length) return named.join(' ')
  if (err.code === 'STALE_VERSION') return t('closeout.stale')
  if (err.code === 'FORBIDDEN') return t('closeout.forbidden')
  return t('closeout.refused')
}

/** A follow-up's reason: its stop or pause reason, or the delivery's own code. */
function reasonLabel(t: T, reason: string): string {
  const own = codeLabel(t, 'followUpBlock', reason)
  return own !== reason ? own : codeLabel(t, 'reminderReason', reason)
}

export function CloseoutPage({
  t,
  fetchImpl,
  jobId,
  href,
}: {
  t: T
  fetchImpl: Fetch
  jobId: string
  href: (to: string) => string
}) {
  const ids = useId()
  const online = useOnline()
  const [view, setView] = useState<CloseoutData | null | undefined>(undefined)
  const [refused, setRefused] = useState<ApiErrorBody | null>(null)
  const [note, setNote] = useState('')
  const [reason, setReason] = useState('')
  const [answer, setAnswer] = useState<(typeof ANSWERS)[number]>('positive')
  const [answerNote, setAnswerNote] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const key = useRef(new Map<string, string>())
  const owner = useOwnerWrite(fetchImpl)
  const base = `/staff/jobs/${encodeURIComponent(jobId)}`

  const load = useCallback(async () => {
    const r = await call<CloseoutData>(fetchImpl, `${base}/closeout`)
    if (r.ok && Array.isArray(r.data?.obligations)) setView(r.data)
    else {
      setRefused(r.ok ? null : r.error)
      setView(null)
    }
  }, [fetchImpl, base])
  useEffect(() => {
    void load()
  }, [load])

  /** One write with its idempotency key (kept for a retry after a server failure). */
  async function send(action: string, to: string, body: unknown, doneText: string): Promise<boolean> {
    setPending(action)
    setProblem(null)
    setDone(null)
    const idem = key.current.get(action) ?? idempotencyKey()
    key.current.set(action, idem)
    const r = await call<CloseoutData>(fetchImpl, to, { method: 'POST', body, headers: { 'idempotency-key': idem } })
    setPending(null)
    if (r.ok || r.status < 500) key.current.delete(action)
    if (!r.ok) {
      setProblem(closeoutRefusal(t, r.error))
      return false
    }
    setView(r.data)
    setDone(doneText)
    return true
  }

  /** The Owner's close or reopen: If-Match the job's version; a reopen asks for the password when needed. */
  function ownerSend(action: 'close' | 'reopen', body: unknown, doneText: string, after: () => void) {
    if (!view) return
    setProblem(null)
    setDone(null)
    void owner.send<CloseoutData>(
      `${base}/closeout/actions/${action}`,
      body,
      (r) => {
        if (!r.ok) return setProblem(closeoutRefusal(t, r.error))
        setView(r.data)
        setDone(doneText)
        after()
      },
      { 'if-match': `"${view.version}"` },
    )
  }

  if (view === undefined) return <StateView kind="loading" title={t('common.loading')} />
  if (!view)
    return (
      <StateView kind="blocked" title={refused?.code === 'NOT_FOUND' ? t('error.NOT_FOUND') : t('closeout.refused')} />
    )
  const when = (iso: string) => new Date(iso)
  const offline = !online ? { disabledReason: t('offline.needsConnection') } : {}
  const f = view.followUps
  const open = view.jobState === 'operationally_complete' || view.jobState === 'reopened'

  return (
    <section className="staff-screen staff-request" aria-labelledby={`${ids}-title`} data-testid="closeout">
      <h1 id={`${ids}-title`} className="hh-h3">
        {t('closeout.title', { reference: view.projectReference })}
      </h1>
      <p>
        <StatusBadge tone={view.jobState === 'closed' ? 'success' : 'neutral'}>
          {codeLabel(t, 'jobState', view.jobState)}
        </StatusBadge>{' '}
        <a href={href(`/quality-reviews/${view.jobId}`)}>{t('closeout.openReview')}</a>
        {' · '}
        <a href={href(`/payments/${view.jobId}`)}>{t('closeout.openPayments')}</a>
      </p>
      <p className="staff-request__hint">{t('closeout.hint')}</p>

      <section className="staff-request__section" aria-labelledby={`${ids}-closeout`}>
        <h2 id={`${ids}-closeout`} className="staff-queue__heading">
          {t('closeout.closeTitle')}
        </h2>
        {open && view.obligations.length ? (
          <>
            <p>{t('closeout.stillOpen')}</p>
            <ul data-testid="closeout-obligations">
              {view.obligations.map((o) => (
                <li key={o}>{codeLabel(t, 'closeoutObligation', o)}</li>
              ))}
            </ul>
          </>
        ) : open ? (
          <p data-testid="closeout-ready">{t('closeout.nothingOpen')}</p>
        ) : view.jobState === 'closed' ? (
          <p>{t('closeout.closed')}</p>
        ) : (
          <StateView kind="empty" title={t('closeout.notComplete')} />
        )}
        {view.actions.close ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              ownerSend('close', { note: note.trim() || null }, t('closeout.closedDone'), () => setNote(''))
            }}
            noValidate
            aria-label={t('closeout.closeTitle')}
          >
            <Field
              label={t('closeout.noteOptional')}
              name="closeNote"
              multiline
              maxLength={2000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <Button type="submit" pending={owner.pending} {...offline}>
              {t('closeout.close')}
            </Button>
          </form>
        ) : null}
        {view.actions.reopen ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (reason.trim() === '') return setProblem(t('closeout.reasonRequired'))
              ownerSend('reopen', { reason: reason.trim() }, t('closeout.reopenedDone'), () => setReason(''))
            }}
            noValidate
            aria-label={t('closeout.reopenTitle')}
          >
            <p className="staff-request__hint">{t('closeout.reopenHint')}</p>
            <Field
              label={t('closeout.reason')}
              name="reopenReason"
              multiline
              maxLength={2000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
            <Button type="submit" variant="secondary" pending={owner.pending} {...offline}>
              {t('closeout.reopen')}
            </Button>
          </form>
        ) : null}
        <ReauthForm t={t} w={owner} />
        {view.history.length ? (
          <>
            <h3 className="staff-queue__heading">{t('closeout.history')}</h3>
            <ul data-testid="closeout-history">
              {view.history.map((h) => (
                <li key={h.id}>
                  <strong>{codeLabel(t, 'closeoutEvent', h.event)}</strong>
                  {h.financialBasis ? ` · ${codeLabel(t, 'financialBasis', h.financialBasis)}` : ''}
                  <br />
                  {t('closeout.by', { name: h.recordedBy.name ?? t('queue.unnamed'), time: when(h.recordedAt) })}
                  {h.reason ? (
                    <>
                      <br />
                      {h.reason}
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

      <section className="staff-request__section" aria-labelledby={`${ids}-follow-ups`} data-testid="follow-ups">
        <h2 id={`${ids}-follow-ups`} className="staff-queue__heading">
          {t('closeout.followUpsTitle')}
        </h2>
        {f.cadence.state === 'CONFIGURED' ? (
          <p>{t('closeout.cadence', { days: f.cadence.daysAfterCompletion })}</p>
        ) : (
          <StateView kind="blocked" title={t('closeout.cadenceNotConfigured')} />
        )}
        {f.satisfactionDueAt ? <p>{t('closeout.dueAt', { time: when(f.satisfactionDueAt) })}</p> : null}
        {f.satisfactionBlockedBy ? (
          <p className="staff-request__hint" data-testid="satisfaction-blocked">
            {t('closeout.satisfactionBlocked', { reason: reasonLabel(t, f.satisfactionBlockedBy) })}
          </p>
        ) : null}
        {f.items.length ? (
          <ol className="staff-estimate__responses" aria-label={t('closeout.followUpList')}>
            {f.items.map((d) => {
              const state = reminderShownState(d)
              return (
                <li key={d.id} data-testid="follow-up">
                  <p>
                    <strong>{codeLabel(t, 'followUpKind', d.kind)}</strong>{' '}
                    <StatusBadge tone={reminderTone(state)}>{codeLabel(t, 'reminderState', state)}</StatusBadge>
                  </p>
                  {d.sentAt ? <p>{t('closeout.sentAt', { time: when(d.sentAt) })}</p> : null}
                  {d.reason ? <p>{t('closeout.reasonShown', { reason: reasonLabel(t, d.reason) })}</p> : null}
                  {d.state === 'draft' && view.actions.releaseFollowUps ? (
                    <div className="hh-button-row">
                      <Button
                        pending={pending === `release-${d.id}`}
                        onClick={() =>
                          void send(`release-${d.id}`, `${base}/follow-ups/${d.id}/release`, {}, t('closeout.released'))
                        }
                        {...offline}
                      >
                        {t('closeout.release', { kind: codeLabel(t, 'followUpKind', d.kind) })}
                      </Button>
                      <Button
                        variant="quiet"
                        pending={pending === `cancel-${d.id}`}
                        onClick={() =>
                          void send(`cancel-${d.id}`, `${base}/follow-ups/${d.id}/cancel`, {}, t('closeout.cancelled'))
                        }
                        {...offline}
                      >
                        {t('closeout.cancel')}
                      </Button>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ol>
        ) : (
          <p>{t('closeout.noFollowUps')}</p>
        )}

        <h3 className="staff-queue__heading">{t('closeout.reviewTitle')}</h3>
        <p className="staff-request__hint">{t('closeout.reviewHint')}</p>
        {f.reviewWording === 'NOT_CONFIGURED' ? (
          <StateView kind="blocked" title={t('closeout.reviewNotConfigured')} />
        ) : null}
        {view.actions.prepareReviewRequest ? (
          <Button
            variant="secondary"
            pending={pending === 'prepare'}
            onClick={() => void send('prepare', `${base}/follow-ups/review-request`, {}, t('closeout.prepared'))}
            {...offline}
          >
            {t('closeout.prepareReview')}
          </Button>
        ) : f.reviewBlockedBy && view.actions.releaseFollowUps ? (
          <p className="staff-request__hint" data-testid="review-blocked">
            {t('closeout.reviewBlocked', { reason: reasonLabel(t, f.reviewBlockedBy) })}
          </p>
        ) : null}

        <h3 className="staff-queue__heading">{t('closeout.responsesTitle')}</h3>
        {f.responses.length ? (
          <ul data-testid="satisfaction-responses">
            {f.responses.map((r) => (
              <li key={r.id}>
                <strong>{codeLabel(t, 'satisfactionAnswer', r.answer)}</strong>
                <br />
                {t('closeout.by', { name: r.recordedBy.name ?? t('queue.unnamed'), time: when(r.recordedAt) })}
                {r.note ? (
                  <>
                    <br />
                    {r.note}
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p>{t('closeout.noResponses')}</p>
        )}
        {view.actions.recordResponse ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void send(
                'respond',
                `${base}/satisfaction-responses`,
                { answer, note: answerNote.trim() || null },
                t('closeout.responseRecorded'),
              ).then((ok) => ok && setAnswerNote(''))
            }}
            noValidate
            aria-label={t('closeout.responseTitle')}
          >
            <p className="staff-request__hint">{t('closeout.responseHint')}</p>
            <div className="staff-queue__select">
              <label htmlFor={`${ids}-answer`}>{t('closeout.answer')}</label>
              <select
                id={`${ids}-answer`}
                value={answer}
                onChange={(e) => setAnswer(e.target.value as (typeof ANSWERS)[number])}
              >
                {ANSWERS.map((a) => (
                  <option key={a} value={a}>
                    {codeLabel(t, 'satisfactionAnswer', a)}
                  </option>
                ))}
              </select>
            </div>
            <Field
              label={t('closeout.noteOptional')}
              name="answerNote"
              multiline
              maxLength={2000}
              value={answerNote}
              onChange={(e) => setAnswerNote(e.target.value)}
            />
            <Button type="submit" variant="secondary" pending={pending === 'respond'} {...offline}>
              {t('closeout.recordResponse')}
            </Button>
          </form>
        ) : null}
      </section>
      {problem ? (
        <p role="alert" className="hh-field__error">
          {problem}
        </p>
      ) : null}
      {done ? (
        <p role="status" className="staff-request__hint">
          {done}
        </p>
      ) : null}
    </section>
  )
}
