// Worker notes and proposed replies, and their Owner/Office review (TSK-0155; HH-COM-16, HH-COM-08, OWN-DEC-211,
// OWN-DEC-162, RULE-LANGUAGES, RULE-AI-WAVE2).
// - The worker (staff screens in Spanish or English): from an assigned job (/job-notes/<job>, linked from My Day) an
//   internal note, or a proposed customer reply kept as a draft or sent for review. Nothing the worker writes is sent
//   to the customer as written; the screen says so. My Day lists the worker's own proposals with their status (Draft,
//   Awaiting Review, Sent, Rejected), the reviewer's open question with its answer form, and the reason of a rejection.
// - The Owner and Office (/reply-proposals/<id>, the review item's link): the worker's original text (internal, never
//   sent), its history, and three actions: ask for clarification, reject with a reason, or write the English message
//   and send it with explicit approval (the project's reply composer: channels, hours and wording as for every reply).
// - No translation exists (wave 2 stays disabled): the reviewer writes the English message.
// The server decides every read and write; a refusal says why.
import type { StaffKey, StaffLocale } from '@handyhub/i18n'
import { Button, Field, StateView, StatusBadge, type StatusTone } from '@handyhub/ui'
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { call, idempotencyKey, type ApiErrorBody, type Fetch } from './api'
import { ReplyComposer } from './Inbox'
import { codeLabel } from './Requests'
import { useOnline } from './Shell'

type T = (key: StaffKey, values?: Record<string, string | number>) => string

export type ProposalStatus = 'draft' | 'awaiting_review' | 'sent' | 'rejected'
export type ProposalEvent = { kind: string; by: { id: string; name: string | null }; text: string | null; at: string }
export type OwnProposal = {
  id: string
  version: number
  jobId: string
  reference: string
  status: ProposalStatus
  text: string
  clarification: { question: string; askedAt: string } | null
  rejectReason: string | null
  createdAt: string
  submittedAt: string | null
  decidedAt: string | null
  events: ProposalEvent[]
  actions: { edit: boolean; submit: boolean; answer: boolean }
}
export type JobNotes = {
  jobId: string
  reference: string
  notes: { id: string; body: string; at: string }[]
  proposals: OwnProposal[]
  maxLength: number
}
export type ProposalReview = {
  id: string
  version: number
  status: ProposalStatus
  clarificationOpen: boolean
  project: { id: string; reference: string; state: string }
  customer: { id: string; displayName: string }
  jobId: string
  author: { id: string; name: string | null }
  originalText: string
  createdAt: string
  submittedAt: string | null
  rejectReason: string | null
  decided: { by: { id: string; name: string | null }; at: string } | null
  sentMessage: { id: string; conversationId: string } | null
  events: ProposalEvent[]
  actions: { clarify: boolean; reject: boolean; send: boolean }
  maxLength: number
}

export const PROPOSAL_TONE: Record<ProposalStatus, StatusTone> = {
  draft: 'neutral',
  awaiting_review: 'warning',
  sent: 'success',
  rejected: 'danger',
}

const bcp47 = (locale: StaffLocale) => (locale === 'es' ? 'es-US' : 'en-US')
const formatter = (locale: StaffLocale) =>
  new Intl.DateTimeFormat(bcp47(locale), { dateStyle: 'medium', timeStyle: 'short' })

/** The label of a refusal. */
function refusal(t: T, err: ApiErrorBody): string {
  const code = err.fieldErrors[0]?.code
  if (code === 'card_number') return t('inbox.cardNumber')
  if (code) {
    const label = codeLabel(t, 'proposalRefusal', code)
    if (label !== code) return label
  }
  if (err.code === 'FORBIDDEN') return t('shell.notAllowed')
  return t('proposal.refused')
}

/** One write with its idempotency key, kept for a retry after a server failure. */
function useWrite(fetchImpl: Fetch) {
  const keys = useRef(new Map<string, string>())
  return async function write<R>(
    action: string,
    path: string,
    body: unknown,
    method = 'POST',
    headers: Record<string, string> = {},
  ) {
    const key = keys.current.get(action) ?? idempotencyKey()
    keys.current.set(action, key)
    const r = await call<R>(fetchImpl, path, { method, body, headers: { 'idempotency-key': key, ...headers } })
    if (r.ok || r.status < 500) keys.current.delete(action)
    return r
  }
}

function History({ t, when, events }: { t: T; when: Intl.DateTimeFormat; events: ProposalEvent[] }) {
  if (events.length === 0) return null
  return (
    <ol className="staff-proposal__history" data-testid="proposal-history">
      {events.map((e, i) => (
        <li key={i}>
          <strong>{codeLabel(t, 'proposalEvent', e.kind)}</strong>
          {' · '}
          {t('proposal.by', { name: e.by.name ?? t('queue.unnamed'), time: when.format(new Date(e.at)) })}
          {e.text ? (
            <p className="staff-inbox__body" lang="">
              {e.text}
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  )
}

/** One of the worker's own proposals: status, text, the open question and what the worker may do. */
function OwnProposalItem({
  t,
  when,
  fetchImpl,
  proposal,
  maxLength,
  onChanged,
}: {
  t: T
  when: Intl.DateTimeFormat
  fetchImpl: Fetch
  proposal: OwnProposal
  maxLength: number
  onChanged: () => Promise<void>
}) {
  const ids = useId()
  const online = useOnline()
  const write = useWrite(fetchImpl)
  const [text, setText] = useState(proposal.text)
  const [answer, setAnswer] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const path = `/staff/reply-proposals/${encodeURIComponent(proposal.id)}`
  const offline = !online ? { disabledReason: t('offline.needsConnection') } : {}

  async function act(action: string, to: string, body: unknown, method = 'POST', headers: Record<string, string> = {}) {
    setPending(action)
    setProblem(null)
    const r = await write<OwnProposal>(action, to, body, method, headers)
    setPending(null)
    if (!r.ok) return setProblem(refusal(t, r.error))
    if (action === 'answer') setAnswer('')
    await onChanged()
  }

  return (
    <li className="staff-queue__item" aria-labelledby={`${ids}-h`} data-testid="own-proposal">
      <div className="staff-queue__head">
        <h3 id={`${ids}-h`} className="staff-queue__title">
          {t('proposal.mine.itemTitle', { reference: proposal.reference })}
        </h3>
        <StatusBadge tone={PROPOSAL_TONE[proposal.status]}>
          <span data-testid="proposal-status">{codeLabel(t, 'proposalStatus', proposal.status)}</span>
        </StatusBadge>
        {proposal.clarification ? <StatusBadge tone="info">{t('proposal.clarificationRequested')}</StatusBadge> : null}
      </div>
      <ul className="staff-queue__facts">
        <li>{t('proposal.createdAt', { time: when.format(new Date(proposal.createdAt)) })}</li>
      </ul>
      {proposal.actions.edit ? (
        <>
          <Field
            label={t('proposal.form.label')}
            hint={t('proposal.form.hint', { max: maxLength })}
            name={`${ids}-text`}
            multiline
            rows={3}
            maxLength={maxLength}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="hh-button-row">
            <Button
              variant="secondary"
              pending={pending === 'edit'}
              onClick={() =>
                void act('edit', path, { text }, 'PUT', {
                  'if-match': `"${proposal.version}"`,
                })
              }
              {...(!text.trim() ? { disabledReason: t('proposal.form.empty') } : offline)}
            >
              {t('proposal.saveDraft')}
            </Button>
            <Button
              pending={pending === 'submit'}
              onClick={() => void act('submit', `${path}/submit`, {})}
              {...(text !== proposal.text ? { disabledReason: t('proposal.saveFirst') } : offline)}
            >
              {t('proposal.submit')}
            </Button>
          </div>
        </>
      ) : (
        <p className="staff-inbox__body" lang="">
          {proposal.text}
        </p>
      )}
      {proposal.status === 'rejected' && proposal.rejectReason ? (
        <p data-testid="proposal-reject-reason">{t('proposal.rejectedBecause', { reason: proposal.rejectReason })}</p>
      ) : null}
      {proposal.status === 'sent' ? <p className="staff-request__hint">{t('proposal.sentNote')}</p> : null}
      {proposal.clarification ? (
        <form
          className="staff-auth__form"
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            void act('answer', `${path}/clarification-answer`, { text: answer })
          }}
          noValidate
        >
          <p role="status" data-testid="proposal-question">
            {t('proposal.question', { question: proposal.clarification.question })}
          </p>
          <Field
            label={t('proposal.answer.label')}
            name={`${ids}-answer`}
            multiline
            rows={3}
            maxLength={maxLength}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
          <Button
            type="submit"
            pending={pending === 'answer'}
            {...(!answer.trim() ? { disabledReason: t('proposal.form.empty') } : offline)}
          >
            {t('proposal.answer.submit')}
          </Button>
        </form>
      ) : null}
      <History t={t} when={when} events={proposal.events} />
      {problem ? (
        <p role="alert" className="hh-field__error">
          {problem}
        </p>
      ) : null}
    </li>
  )
}

/** My Day: the worker's own proposed replies and their status; nothing while they cannot be read. */
export function MyReplyProposals({ t, locale, fetchImpl }: { t: T; locale: StaffLocale; fetchImpl: Fetch }) {
  const ids = useId()
  const [mine, setMine] = useState<{ items: OwnProposal[]; maxLength: number } | null | undefined>(undefined)
  const load = useCallback(async () => {
    const r = await call<{ items: OwnProposal[]; maxLength: number }>(fetchImpl, '/staff/reply-proposals/mine')
    setMine(r.ok && Array.isArray(r.data?.items) ? r.data : null)
  }, [fetchImpl])
  useEffect(() => {
    void load()
  }, [load])
  if (!mine) return null
  const { items } = mine
  const when = formatter(locale)
  return (
    <section className="staff-request__section" aria-labelledby={`${ids}-title`} data-testid="my-reply-proposals">
      <h2 id={`${ids}-title`} className="staff-queue__heading">
        {t('proposal.mine.title')}
      </h2>
      <p className="staff-request__hint">{t('proposal.mine.hint')}</p>
      {items.length === 0 ? (
        <p>{t('proposal.mine.none')}</p>
      ) : (
        <ul className="staff-queue__list">
          {items.map((p) => (
            <OwnProposalItem
              key={`${p.id}-${p.version}`}
              t={t}
              when={when}
              fetchImpl={fetchImpl}
              proposal={p}
              maxLength={mine.maxLength}
              onChanged={load}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

/** A job's notes and proposed replies (the assigned worker). */
export function JobNotesPage({
  t,
  locale,
  fetchImpl,
  jobId,
  href,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  jobId: string
  href: (to: string) => string
}) {
  const ids = useId()
  const online = useOnline()
  const write = useWrite(fetchImpl)
  const [view, setView] = useState<JobNotes | null | undefined>(undefined)
  const [note, setNote] = useState('')
  const [proposal, setProposal] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const base = `/staff/jobs/${encodeURIComponent(jobId)}`
  const load = useCallback(async () => {
    const r = await call<JobNotes>(fetchImpl, `${base}/notes-and-replies`)
    setView(r.ok && typeof r.data?.jobId === 'string' ? r.data : null)
  }, [fetchImpl, base])
  useEffect(() => {
    void load()
  }, [load])
  if (view === undefined) return <StateView kind="loading" title={t('common.loading')} />
  if (view === null) return <StateView kind="blocked" title={t('proposal.job.unavailable')} />
  const when = formatter(locale)
  const offline = !online ? { disabledReason: t('offline.needsConnection') } : {}

  async function addNote(e: FormEvent) {
    e.preventDefault()
    setPending('note')
    setProblem(null)
    setNotice(null)
    const r = await write('note', `${base}/notes`, { body: note })
    setPending(null)
    if (!r.ok) return setProblem(refusal(t, r.error))
    setNote('')
    setNotice(t('proposal.note.saved'))
    await load()
  }
  async function propose(submit: boolean) {
    const action = submit ? 'propose-submit' : 'propose-draft'
    setPending(action)
    setProblem(null)
    setNotice(null)
    const r = await write(action, `${base}/reply-proposals`, { text: proposal, submit })
    setPending(null)
    if (!r.ok) return setProblem(refusal(t, r.error))
    setProposal('')
    setNotice(t(submit ? 'proposal.submitted' : 'proposal.draftSaved'))
    await load()
  }

  return (
    <section className="staff-screen staff-proposal" aria-labelledby={`${ids}-title`} data-testid="job-notes">
      <h1 id={`${ids}-title`} className="hh-h3">
        {t('proposal.job.title', { reference: view.reference })}
      </h1>
      <p>
        <a href={href(`/packets/${view.jobId}`)}>{t('myday.openPacket')}</a>
      </p>
      <p className="staff-request__hint">{t('proposal.job.intro')}</p>

      <section className="staff-request__section" aria-labelledby={`${ids}-note`}>
        <h2 id={`${ids}-note`} className="staff-queue__heading">
          {t('proposal.note.heading')}
        </h2>
        <p className="staff-request__hint">{t('proposal.note.hint')}</p>
        <form className="staff-auth__form" onSubmit={(e) => void addNote(e)} noValidate>
          <Field
            label={t('proposal.note.label')}
            name="note"
            multiline
            rows={3}
            maxLength={5000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button
            type="submit"
            pending={pending === 'note'}
            {...(!note.trim() ? { disabledReason: t('proposal.form.empty') } : offline)}
          >
            {t('proposal.note.save')}
          </Button>
        </form>
        {view.notes.length ? (
          <ul className="staff-queue__list" data-testid="job-notes-list">
            {view.notes.map((n) => (
              <li key={n.id} className="staff-queue__item">
                <p className="staff-queue__masked">{when.format(new Date(n.at))}</p>
                <p className="staff-inbox__body" lang="">
                  {n.body}
                </p>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="staff-request__section" aria-labelledby={`${ids}-proposal`}>
        <h2 id={`${ids}-proposal`} className="staff-queue__heading">
          {t('proposal.form.heading')}
        </h2>
        <p className="staff-request__hint">{t('proposal.form.intro')}</p>
        <Field
          label={t('proposal.form.label')}
          hint={t('proposal.form.hint', { max: view.maxLength })}
          name="proposal"
          multiline
          rows={4}
          maxLength={view.maxLength}
          value={proposal}
          onChange={(e) => setProposal(e.target.value)}
        />
        <div className="hh-button-row">
          <Button
            variant="secondary"
            pending={pending === 'propose-draft'}
            onClick={() => void propose(false)}
            {...(!proposal.trim() ? { disabledReason: t('proposal.form.empty') } : offline)}
          >
            {t('proposal.saveDraft')}
          </Button>
          <Button
            pending={pending === 'propose-submit'}
            onClick={() => void propose(true)}
            {...(!proposal.trim() ? { disabledReason: t('proposal.form.empty') } : offline)}
          >
            {t('proposal.submit')}
          </Button>
        </div>
        {view.proposals.length ? (
          <ul className="staff-queue__list">
            {view.proposals.map((p) => (
              <OwnProposalItem
                key={`${p.id}-${p.version}`}
                t={t}
                when={when}
                fetchImpl={fetchImpl}
                proposal={p}
                maxLength={view.maxLength}
                onChanged={load}
              />
            ))}
          </ul>
        ) : null}
      </section>
      {problem ? (
        <p role="alert" className="hh-field__error" data-testid="job-notes-problem">
          {problem}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="staff-request__hint" data-testid="job-notes-notice">
          {notice}
        </p>
      ) : null}
    </section>
  )
}

/** The Owner's and Office's review of one proposed reply (the review item's link). */
export function ReplyProposalPage({
  t,
  locale,
  fetchImpl,
  proposalId,
  href,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  proposalId: string
  href: (to: string) => string
}) {
  const ids = useId()
  const online = useOnline()
  const write = useWrite(fetchImpl)
  const [view, setView] = useState<ProposalReview | null | undefined>(undefined)
  const [question, setQuestion] = useState('')
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const path = `/staff/reply-proposals/${encodeURIComponent(proposalId)}`
  const load = useCallback(async () => {
    const r = await call<ProposalReview>(fetchImpl, path)
    setView(r.ok && typeof r.data?.id === 'string' ? r.data : null)
  }, [fetchImpl, path])
  useEffect(() => {
    void load()
  }, [load])
  if (view === undefined) return <StateView kind="loading" title={t('common.loading')} />
  if (view === null) return <StateView kind="error" title={t('proposal.review.unavailable')} />
  const when = formatter(locale)
  const offline = !online ? { disabledReason: t('offline.needsConnection') } : {}

  async function act(action: 'clarify' | 'reject', e: FormEvent) {
    e.preventDefault()
    setPending(action)
    setProblem(null)
    setNotice(null)
    const r = await write<ProposalReview>(
      action,
      action === 'clarify' ? `${path}/clarification` : `${path}/reject`,
      action === 'clarify' ? { text: question } : { reason },
    )
    setPending(null)
    if (!r.ok) {
      setProblem(refusal(t, r.error))
      return load()
    }
    setView(r.data)
    setQuestion('')
    setReason('')
    setNotice(t(action === 'clarify' ? 'proposal.review.asked' : 'proposal.review.rejected'))
  }

  return (
    <section className="staff-screen staff-proposal" aria-labelledby={`${ids}-title`} data-testid="proposal-review">
      <h1 id={`${ids}-title`} className="hh-h3">
        {t('proposal.review.title', { reference: view.project.reference })}
      </h1>
      <ul className="staff-queue__facts">
        <li>
          <a href={href(`/customers/${view.customer.id}`)}>{view.customer.displayName}</a>
        </li>
        <li>
          <StatusBadge tone={PROPOSAL_TONE[view.status]}>
            <span data-testid="proposal-status">{codeLabel(t, 'proposalStatus', view.status)}</span>
          </StatusBadge>
        </li>
        {view.clarificationOpen ? (
          <li>
            <StatusBadge tone="info">{t('proposal.clarificationRequested')}</StatusBadge>
          </li>
        ) : null}
        <li>{t('proposal.review.by', { name: view.author.name ?? t('queue.unnamed') })}</li>
      </ul>
      <section className="staff-request__section" aria-labelledby={`${ids}-original`}>
        <h2 id={`${ids}-original`} className="staff-queue__heading">
          {t('proposal.review.original')}
        </h2>
        <p className="staff-request__hint">{t('proposal.review.originalHint')}</p>
        <p className="staff-inbox__body" lang="" data-testid="proposal-original">
          {view.originalText}
        </p>
        <History t={t} when={when} events={view.events} />
        {view.status === 'rejected' && view.rejectReason ? (
          <p>{t('proposal.rejectedBecause', { reason: view.rejectReason })}</p>
        ) : null}
        {view.sentMessage ? (
          <p>
            <a href={href(`/inbox/${view.sentMessage.conversationId}`)}>{t('proposal.review.openConversation')}</a>
          </p>
        ) : null}
      </section>
      {view.actions.send ? (
        <ReplyComposer
          t={t}
          locale={locale}
          fetchImpl={fetchImpl}
          projectId={view.project.id}
          proposalId={view.id}
          onSent={load}
        />
      ) : null}
      {view.actions.clarify ? (
        <form className="staff-auth__form" onSubmit={(e) => void act('clarify', e)} noValidate>
          <h2 className="staff-queue__heading">{t('proposal.review.clarifyHeading')}</h2>
          <Field
            label={t('proposal.review.question')}
            hint={t('proposal.review.questionHint')}
            name="question"
            multiline
            rows={2}
            maxLength={view.maxLength}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <Button
            type="submit"
            variant="secondary"
            pending={pending === 'clarify'}
            {...(!question.trim() ? { disabledReason: t('proposal.form.empty') } : offline)}
          >
            {t('proposal.review.ask')}
          </Button>
        </form>
      ) : null}
      {view.actions.reject ? (
        <form className="staff-auth__form" onSubmit={(e) => void act('reject', e)} noValidate>
          <h2 className="staff-queue__heading">{t('proposal.review.rejectHeading')}</h2>
          <Field
            label={t('proposal.review.reason')}
            hint={t('proposal.review.reasonHint')}
            name="reason"
            multiline
            rows={2}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <Button
            type="submit"
            variant="secondary"
            pending={pending === 'reject'}
            {...(!reason.trim() ? { disabledReason: t('proposal.form.empty') } : offline)}
          >
            {t('proposal.review.reject')}
          </Button>
        </form>
      ) : null}
      {problem ? (
        <p role="alert" className="hh-field__error">
          {problem}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="staff-request__hint" data-testid="proposal-notice">
          {notice}
        </p>
      ) : null}
    </section>
  )
}
