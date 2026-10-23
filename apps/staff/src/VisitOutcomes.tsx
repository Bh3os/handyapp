// Visit outcomes (TSK-0078; HH-SCH-09, HH-WORK-03). On My Day the assigned worker records one explicit outcome with a
// note: a delay, no access, the customer absent, weather, missing resources or a readiness issue. Each opens a staff
// follow-up; only "no access" ends the visit. No outcome finishes a visit or starts work: customer absence still needs
// the customer present or the Owner-approved exception at Start Work. The follow-up page (the queue item's link) shows
// the outcome to the Owner and Office, who record what was done. Staff text in English and Spanish.
import type { StaffKey } from '@handyhub/i18n'
import { Button, Field, StateView } from '@handyhub/ui'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { call, idempotencyKey, type Fetch } from './api'
import { codeLabel } from './Requests'

type T = (key: StaffKey, values?: Record<string, string | number>) => string

export const VISIT_OUTCOME_KINDS = [
  'delay',
  'no_access',
  'customer_absent',
  'weather',
  'missing_resources',
  'readiness_issue',
] as const
export type VisitOutcomeKind = (typeof VISIT_OUTCOME_KINDS)[number]
export type RecordedOutcome = { outcomeId: string; kind: VisitOutcomeKind; recordedAt: string; followedUp: boolean }

/** What each outcome does to the visit, as the worker and the office read it. */
const EFFECT: Readonly<Record<VisitOutcomeKind, StaffKey>> = {
  delay: 'visitOutcome.effect.delay',
  no_access: 'visitOutcome.effect.no_access',
  customer_absent: 'visitOutcome.effect.customer_absent',
  weather: 'visitOutcome.effect.weather',
  missing_resources: 'visitOutcome.effect.missing_resources',
  readiness_issue: 'visitOutcome.effect.readiness_issue',
}

const refusal = (t: T, code: string | undefined) =>
  code ? codeLabel(t, 'visitOutcomeRefusal', code) : t('visitOutcome.failed')

/** Record a visit outcome on My Day: the kind, a note, and what it does. */
export function VisitOutcomeForm<V>({
  t,
  fetchImpl,
  visitId,
  outcomes,
  onRecorded,
}: {
  t: T
  fetchImpl: Fetch
  visitId: string
  outcomes: readonly RecordedOutcome[]
  onRecorded: (visit: V | null) => void
}) {
  const ids = useId()
  const [kind, setKind] = useState<VisitOutcomeKind | null>(null)
  const [note, setNote] = useState('')
  const [pending, setPending] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [done, setDone] = useState<VisitOutcomeKind | null>(null)
  // One key per attempt, kept for its retries.
  const key = useRef<string | null>(null)
  async function submit() {
    if (!kind || !note.trim()) return
    setPending(true)
    setProblem(null)
    key.current ??= idempotencyKey()
    const r = await call<{ visit: V | null }>(fetchImpl, `/staff/visits/${encodeURIComponent(visitId)}/outcomes`, {
      method: 'POST',
      headers: { 'idempotency-key': key.current },
      body: { kind, note: note.trim() },
    })
    setPending(false)
    if (r.ok || r.status > 0) key.current = null
    if (!r.ok) return setProblem(r.status === 0 ? t('visitOutcome.offline') : refusal(t, r.error.fieldErrors[0]?.code))
    setDone(kind)
    setKind(null)
    setNote('')
    onRecorded(r.data.visit)
  }
  const blocked = !kind ? t('visitOutcome.needsKind') : !note.trim() ? t('visitOutcome.needsNote') : undefined
  return (
    <details className="staff-request__section" data-testid="visit-outcome">
      <summary>{t('visitOutcome.title')}</summary>
      {outcomes.length > 0 ? (
        <ul data-testid="visit-outcome-list">
          {outcomes.map((o) => (
            <li key={o.outcomeId}>
              {codeLabel(t, 'visitOutcomeKind', o.kind)}
              {' · '}
              {t(o.followedUp ? 'visitOutcome.followedUp' : 'visitOutcome.waiting')}
            </li>
          ))}
        </ul>
      ) : null}
      <fieldset aria-labelledby={`${ids}-kind`}>
        <legend id={`${ids}-kind`}>{t('visitOutcome.kind')}</legend>
        {VISIT_OUTCOME_KINDS.map((k) => (
          <label key={k} className="staff-loadout__choice">
            <input type="radio" name={`${ids}-kind`} checked={kind === k} onChange={() => setKind(k)} />{' '}
            {codeLabel(t, 'visitOutcomeKind', k)}
          </label>
        ))}
      </fieldset>
      {kind ? <p className="staff-request__hint">{t(EFFECT[kind])}</p> : null}
      <Field
        label={t('visitOutcome.note')}
        hint={t('visitOutcome.noteHint')}
        name="visitOutcomeNote"
        multiline
        maxLength={2000}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <Button pending={pending} {...(blocked ? { disabledReason: blocked } : {})} onClick={() => void submit()}>
        {t('visitOutcome.record')}
      </Button>
      {done ? (
        <p role="status" data-testid="visit-outcome-recorded">
          {t('visitOutcome.recorded', { kind: codeLabel(t, 'visitOutcomeKind', done) })}
        </p>
      ) : null}
      {problem ? (
        <p role="alert" className="hh-field__error">
          {problem}
        </p>
      ) : null}
    </details>
  )
}

type OutcomeView = {
  outcomeId: string
  visitId: string
  reference: string
  kind: VisitOutcomeKind
  note: string
  visitState: string
  visitNow: string
  localDate: string
  recordedBy: { id: string; name: string | null }
  recordedAt: string
  followUp: { by: { id: string; name: string | null }; at: string; note: string } | null
  actions: { followUp: boolean }
}

/** One outcome and its follow-up, opened from the staff queue (the Owner and Office). */
export function VisitOutcomePage({ t, fetchImpl, outcomeId }: { t: T; fetchImpl: Fetch; outcomeId: string }) {
  const [view, setView] = useState<OutcomeView | null | 'failed'>(null)
  const [note, setNote] = useState('')
  const [pending, setPending] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const load = useCallback(async () => {
    const r = await call<OutcomeView>(fetchImpl, `/staff/visit-outcomes/${encodeURIComponent(outcomeId)}`)
    setView(r.ok ? r.data : 'failed')
  }, [fetchImpl, outcomeId])
  useEffect(() => {
    void load()
  }, [load])
  if (view === null) return <StateView kind="loading" title={t('visitOutcome.loading')} />
  if (view === 'failed') return <StateView kind="error" title={t('visitOutcome.unavailable')} />
  async function followUp() {
    setPending(true)
    const r = await call<OutcomeView>(fetchImpl, `/staff/visit-outcomes/${encodeURIComponent(outcomeId)}/follow-up`, {
      method: 'POST',
      headers: { 'idempotency-key': idempotencyKey() },
      body: { note: note.trim() },
    })
    setPending(false)
    if (!r.ok) return setProblem(refusal(t, r.error.fieldErrors[0]?.code))
    setProblem(null)
    setView(r.data)
  }
  return (
    <section className="staff-request__section" data-testid="visit-outcome-page">
      <h1 className="hh-h2">
        {t('visitOutcome.pageTitle', { kind: codeLabel(t, 'visitOutcomeKind', view.kind), reference: view.reference })}
      </h1>
      <dl className="staff-sop__facts">
        <dt>{t('visitOutcome.visitDate')}</dt>
        <dd>{view.localDate}</dd>
        <dt>{t('visitOutcome.recordedBy')}</dt>
        <dd>
          {t('visitOutcome.byAt', {
            name: view.recordedBy.name ?? t('queue.unnamed'),
            at: new Date(view.recordedAt).toLocaleString(),
          })}
        </dd>
        <dt>{t('visitOutcome.visitState')}</dt>
        <dd>
          {codeLabel(t, 'visitState', view.visitState)} → {codeLabel(t, 'visitState', view.visitNow)}
        </dd>
        <dt>{t('visitOutcome.note')}</dt>
        <dd>{view.note}</dd>
      </dl>
      <p className="staff-request__hint">{t(EFFECT[view.kind])}</p>
      {view.followUp ? (
        <p data-testid="visit-outcome-follow-up">
          {t('visitOutcome.followUpDone', {
            name: view.followUp.by.name ?? t('queue.unnamed'),
            at: new Date(view.followUp.at).toLocaleString(),
            note: view.followUp.note,
          })}
        </p>
      ) : view.actions.followUp ? (
        <div>
          <Field
            label={t('visitOutcome.followUpNote')}
            hint={t('visitOutcome.followUpHint')}
            name="followUpNote"
            multiline
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button
            pending={pending}
            {...(!note.trim() ? { disabledReason: t('visitOutcome.needsNote') } : {})}
            onClick={() => void followUp()}
          >
            {t('visitOutcome.followUpRecord')}
          </Button>
        </div>
      ) : null}
      {problem ? (
        <p role="alert" className="hh-field__error">
          {problem}
        </p>
      ) : null}
    </section>
  )
}
