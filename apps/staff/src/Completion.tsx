// The walkthrough and Finished (TSK-0083; HH-QA-01, HH-QA-03, HH-WORK-12, T55, OWN-DEC-75, OWN-DEC-109). Shown below
// the job checklist. What Finished still needs is listed (every problem named, never shown as a pass); the worker
// records the walkthrough outcome in the customer's presence, or "Customer unavailable" (which names nobody and is
// never acceptance); "I have a concern" goes to the Owner as a dispute case. Finished submits the job as "Awaiting
// quality review", never complete. The server decides every step again.
import type { StaffKey } from '@handyhub/i18n'
import { Button, Field, StateView } from '@handyhub/ui'
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react'
import { call, idempotencyKey, type ApiErrorBody, type Fetch } from './api'
import { codeLabel } from './Requests'
import { useOnline } from './Shell'

type T = (key: StaffKey, values?: Record<string, string | number | Date>) => string

const OUTCOMES = ['accepted', 'accepted_with_follow_up', 'disputed', 'customer_unavailable'] as const
type Outcome = (typeof OUTCOMES)[number]

export type CompletionData = {
  jobId: string
  jobState: string
  packages: { code: string; checklistComplete: boolean; beforePhotos: number; afterPhotos: number }[]
  problems: { code: string; workPackage?: string }[]
  submission: {
    submittedAt: string
    worker: { id: string; name: string | null }
    walkthrough: {
      outcome: Outcome
      participantName: string | null
      participantRole: string | null
      comments: string | null
      caseNumber: number | null
    }
  } | null
  actions: { submit: boolean }
}

function completionError(t: T, e: ApiErrorBody): string {
  if (e.fieldErrors.length) return e.fieldErrors.map((f) => codeLabel(t, 'completionProblem', f.code)).join(' ')
  try {
    return t(`error.${e.code}` as StaffKey)
  } catch {
    return t('error.INTERNAL')
  }
}

export function CompletionPanel({ t, fetchImpl, jobId }: { t: T; fetchImpl: Fetch; jobId: string }) {
  // TSK-0079 (HH-OFF-04): this action needs the server; offline it is refused, never queued.
  const online = useOnline()
  const ids = useId()
  const [data, setData] = useState<CompletionData | null>(null)
  const [outcome, setOutcome] = useState<Outcome>('accepted')
  const [name, setName] = useState('')
  const [role, setRole] = useState<'customer' | 'authorized_representative'>('customer')
  const [comments, setComments] = useState('')
  const [pending, setPending] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const base = `/staff/jobs/${encodeURIComponent(jobId)}/completion`
  const load = useCallback(async () => {
    const r = await call<CompletionData>(fetchImpl, base)
    setData(r.ok ? r.data : null)
  }, [fetchImpl, base])
  useEffect(() => {
    void load()
  }, [load])
  if (!data) return null
  const unavailable = outcome === 'customer_unavailable'

  async function submit(e: FormEvent) {
    e.preventDefault()
    setPending(true)
    const r = await call(fetchImpl, base, {
      method: 'POST',
      body: {
        outcome,
        ...(unavailable ? {} : { participantName: name, participantRole: role }),
        ...(comments.trim() ? { comments } : {}),
      },
      headers: { 'idempotency-key': idempotencyKey() },
    })
    setPending(false)
    if (!r.ok) return setProblem(completionError(t, r.error))
    setProblem(null)
    await load()
  }

  return (
    <section className="staff-request__section" aria-labelledby={`${ids}-title`} data-testid="completion">
      <h2 id={`${ids}-title`} className="staff-queue__heading">
        {t('completion.title')}
      </h2>
      {data.submission ? (
        <StateView kind="empty" title={t('completion.submitted')}>
          <p data-testid="completion-submitted">
            {t('completion.submittedLine', {
              outcome: codeLabel(t, 'walkthroughOutcome', data.submission.walkthrough.outcome),
              name: data.submission.worker.name ?? data.submission.worker.id,
              at: new Date(data.submission.submittedAt).toLocaleString(),
            })}
          </p>
          {data.submission.walkthrough.caseNumber !== null ? (
            <p>{t('completion.caseOpened', { number: data.submission.walkthrough.caseNumber })}</p>
          ) : null}
        </StateView>
      ) : (
        <>
          <ul className="staff-request__list" data-testid="completion-packages">
            {data.packages.map((p) => (
              <li key={p.code}>
                {t('completion.packageLine', {
                  code: p.code,
                  checklist: p.checklistComplete ? t('completion.done') : t('completion.notDone'),
                  before: p.beforePhotos,
                  after: p.afterPhotos,
                })}
              </li>
            ))}
          </ul>
          {data.problems.length ? (
            <StateView kind="blocked" title={t('completion.notYet')}>
              <ul data-testid="completion-problems">
                {data.problems.map((p, i) => (
                  <li key={i}>
                    {p.workPackage ? `${p.workPackage}: ` : ''}
                    {codeLabel(t, 'completionProblem', p.code)}
                  </li>
                ))}
              </ul>
            </StateView>
          ) : null}
          {data.actions.submit ? (
            <form className="staff-loadout__form" onSubmit={(e) => void submit(e)} aria-label={t('completion.title')}>
              <fieldset>
                <legend>{t('completion.walkthrough')}</legend>
                {OUTCOMES.map((o) => (
                  <label key={o} className="staff-loadout__choice">
                    <input
                      type="radio"
                      name={`${ids}-outcome`}
                      value={o}
                      checked={outcome === o}
                      onChange={() => setOutcome(o)}
                    />{' '}
                    {codeLabel(t, 'walkthroughOutcome', o)}
                  </label>
                ))}
              </fieldset>
              {unavailable ? (
                <p className="staff-request__hint">{t('completion.unavailableHint')}</p>
              ) : (
                <>
                  <Field
                    label={t('completion.participant')}
                    name="participantName"
                    required
                    maxLength={200}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                  <div className="hh-field">
                    <label className="hh-field__label" htmlFor={`${ids}-role`}>
                      {t('completion.participantRole')}
                    </label>
                    <select
                      id={`${ids}-role`}
                      className="hh-field__control"
                      value={role}
                      onChange={(e) => setRole(e.target.value as typeof role)}
                    >
                      <option value="customer">{codeLabel(t, 'participantRole', 'customer')}</option>
                      <option value="authorized_representative">
                        {codeLabel(t, 'participantRole', 'authorized_representative')}
                      </option>
                    </select>
                  </div>
                </>
              )}
              <Field
                label={t('completion.comments')}
                name="comments"
                multiline
                required={outcome === 'disputed' || outcome === 'accepted_with_follow_up'}
                maxLength={2000}
                value={comments}
                onChange={(e) => setComments(e.target.value)}
              />
              <p className="staff-request__hint">{t('completion.finishHint')}</p>
              {problem ? (
                <p role="alert" className="hh-field__error">
                  {problem}
                </p>
              ) : null}
              <Button
                type="submit"
                pending={pending}
                {...(!online ? { disabledReason: t('offline.needsConnection') } : {})}
              >
                {t('completion.submit')}
              </Button>
            </form>
          ) : null}
        </>
      )}
    </section>
  )
}
