// The job checklist on site (TSK-0075; HH-WORK-11, HH-WORK-05, HH-WORK-12, T47, OWN-DEC-108, RULE-SAFETY-GATES).
// Opened from the job packet: /checklist/<job id>.
// - Per work package, the pinned SOP version's six stages in order with every step verbatim; a stage opens once every
//   step of the earlier stages is completed or skipped. Each step shows what it asks for (photo, measurement, note),
//   the controls to clear first, its state and who recorded it; the buttons are the actions the server offers now.
// - Completing records the evidence the step asks for (photos chosen from the job's field photos of that package);
//   skipping and reopening need a reason. A skipped required step stays visible and blocks completion.
// - Nothing can be done before the worker's own Start Work, while the job is not in progress, or while a hold is open:
//   the server says why. Progress is kept on the server, so the checklist resumes where it stopped.
// - Handoff: a note for whoever continues (optionally a named worker).
// - The SOP text is English as imported. A Spanish-reading worker sees the Spanish text of a version released as
//   AI-reviewed after its separate comparison (TSK-0103, OWN-DEC-79), labelled as such; otherwise the English text
//   with "Spanish safety review pending" (Start Work stays blocked for them, the server decides).
import type { StaffKey, StaffLocale } from '@handyhub/i18n'
import { Button, Field, StateView, StatusBadge } from '@handyhub/ui'
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react'
import { call, idempotencyKey, type ApiErrorBody, type Fetch } from './api'
import { CompletionPanel } from './Completion'
import { codeLabel } from './Requests'

type T = (key: StaffKey, values?: Record<string, string | number | Date>) => string
type StaffRef = { id: string; name: string | null }

export type ChecklistStep = {
  stepId: string
  text: string
  /** The Spanish text, only from a version released as AI-reviewed. */
  textEs: string | null
  line: number | null
  required: boolean
  evidence: ('photo' | 'measurement' | 'note')[]
  holdBefore: string[]
  /** The open change orders this step waits for (their numbers, TSK-0081). */
  waitsForChangeOrders: number[]
  state: 'not_started' | 'in_progress' | 'paused' | 'completed' | 'skipped'
  version: number
  measurement: string | null
  note: string | null
  photoIds: string[]
  skipReason: string | null
  worker: StaffRef | null
  completedBy: StaffRef | null
  completedAt: string | null
  actions: string[]
}
export type ChecklistData = {
  jobId: string
  reference: string
  jobState: string
  blockers: string[]
  packages: {
    workPackageId: string
    code: string
    state: string
    sop: {
      versionId: string
      title: string | null
      pendingReview: boolean
      spanishStatus: 'ai_reviewed' | 'pending'
      titleEs: string | null
    } | null
    currentStage: number
    summary: {
      steps: number
      completed: number
      skipped: number
      requiredSkipped: number
      requiredOpen: number
      complete: boolean
    }
    stages: {
      stage: number
      key: string
      heading: string
      headingEs: string | null
      open: boolean
      steps: ChecklistStep[]
    }[]
  }[]
  photos: { id: string; workPackageId: string; phase: string; areaLabel: string | null; uploadedAt: string }[]
  handoffs: {
    id: string
    workPackageId: string | null
    from: StaffRef
    to: StaffRef | null
    note: string
    at: string
  }[]
  workers: StaffRef[]
  actions: { handoff: boolean }
}

export function checklistError(t: T, e: ApiErrorBody): string {
  if (e.code === 'STALE_VERSION') return t('checklist.stale')
  if (e.fieldErrors.length) return e.fieldErrors.map((f) => codeLabel(t, 'checklistRefusal', f.code)).join(' ')
  try {
    return t(`error.${e.code}` as StaffKey)
  } catch {
    return t('error.INTERNAL')
  }
}

const tone = (s: ChecklistStep['state']) =>
  s === 'completed' ? 'success' : s === 'skipped' ? 'warning' : s === 'not_started' ? 'neutral' : 'info'
const who = (r: StaffRef | null) => (r ? (r.name ?? r.id) : '')

export function ChecklistPage({
  t,
  locale = 'en',
  fetchImpl,
  jobId,
  href,
}: {
  t: T
  locale?: StaffLocale
  fetchImpl: Fetch
  jobId: string
  href: (to: string) => string
}) {
  const [data, setData] = useState<ChecklistData | null | undefined>(undefined)
  const [refused, setRefused] = useState<ApiErrorBody | null>(null)
  const base = `/staff/jobs/${encodeURIComponent(jobId)}/checklist`
  const load = useCallback(async () => {
    const r = await call<ChecklistData>(fetchImpl, base)
    if (r.ok) setData(r.data)
    else {
      setRefused(r.error)
      setData(null)
    }
  }, [fetchImpl, base])
  useEffect(() => {
    void load()
  }, [load])

  if (data === undefined) return <StateView kind="loading" title={t('common.loading')} />
  if (!data)
    return (
      <StateView kind="blocked" title={refused?.code === 'NOT_FOUND' ? t('error.NOT_FOUND') : t('checklist.refused')} />
    )
  return (
    <section className="staff-screen" aria-labelledby="checklist-title" data-testid="checklist">
      <h1 id="checklist-title" className="hh-h3">
        {t('checklist.title', { reference: data.reference })}
      </h1>
      <p>
        <a href={href(`/packets/${data.jobId}`)}>{t('checklist.backToPacket')}</a>{' '}
        <a href={href(`/job-photos/${data.jobId}`)}>{t('checklist.photos')}</a> ·{' '}
        <a href={href(`/change-orders/${data.jobId}`)} data-testid="checklist-change-orders-link">
          {t('checklist.changeOrders')}
        </a>
      </p>
      {data.blockers.length ? (
        <StateView kind="blocked" title={t('checklist.blocked')}>
          <ul data-testid="checklist-blockers">
            {data.blockers.map((b) => (
              <li key={b}>{codeLabel(t, 'checklistRefusal', b)}</li>
            ))}
          </ul>
        </StateView>
      ) : null}
      {data.packages.map((p) => {
        // The Spanish text of a released version for a Spanish-reading worker; the English text otherwise.
        const spanish = locale === 'es' && p.sop?.spanishStatus === 'ai_reviewed'
        return (
          <section key={p.workPackageId} className="staff-request__section" data-testid="checklist-package">
            <h2 className="staff-queue__heading">
              {codeLabel(t, 'service', p.code)} · {p.code}
            </h2>
            {p.sop?.pendingReview ? (
              <StateView kind="empty" title={t('sop.pendingReview.title')}>
                <p>{t('sop.pendingReview.body')}</p>
              </StateView>
            ) : null}
            {!p.sop ? <StateView kind="blocked" title={t('sop.notConfigured.title')} /> : null}
            {p.sop && spanish ? (
              <p className="staff-request__hint" data-testid="checklist-language">
                <StatusBadge tone="info">{t('sop.aiReviewed')}</StatusBadge> {t('checklist.spanishShown')}
              </p>
            ) : null}
            {p.sop && !spanish ? (
              <p className="staff-request__hint" data-testid="checklist-language">
                {t('checklist.englishOnly')}
              </p>
            ) : null}
            {p.sop && locale === 'es' && !spanish ? (
              <StateView kind="blocked" title={t('sop.spanishNotReleased')} />
            ) : null}
            {p.state === 'blocked' ? <StateView kind="blocked" title={t('checklist.packageBlocked')} /> : null}
            <p data-testid="checklist-summary">
              {t('checklist.summary', {
                completed: p.summary.completed,
                steps: p.summary.steps,
                skipped: p.summary.requiredSkipped,
              })}
            </p>
            {p.stages.map((st) => (
              <details key={st.stage} open={st.stage === p.currentStage} data-testid="checklist-stage">
                <summary>
                  {t('sop.stageTitle', { n: st.stage, stage: codeLabel(t, 'sopStage', st.key) })}{' '}
                  {st.open ? null : <StatusBadge tone="neutral">{t('checklist.locked')}</StatusBadge>}
                </summary>
                {st.steps.length === 0 ? <p className="staff-request__hint">{t('sop.noStep')}</p> : null}
                <ol className="staff-request__list">
                  {st.steps.map((s) => (
                    <Step
                      key={s.stepId}
                      t={t}
                      fetchImpl={fetchImpl}
                      base={base}
                      workPackageId={p.workPackageId}
                      step={s}
                      spanish={spanish}
                      photos={data.photos.filter((f) => f.workPackageId === p.workPackageId)}
                      onDone={load}
                    />
                  ))}
                </ol>
              </details>
            ))}
          </section>
        )
      })}
      <section className="staff-request__section" aria-label={t('checklist.handoffs')}>
        <h2 className="staff-queue__heading">{t('checklist.handoffs')}</h2>
        {data.handoffs.length === 0 ? <p className="staff-request__hint">{t('checklist.noHandoffs')}</p> : null}
        <ul className="staff-request__list" data-testid="checklist-handoffs">
          {data.handoffs.map((h) => (
            <li key={h.id}>
              {t('checklist.handoffLine', {
                from: who(h.from),
                to: h.to ? who(h.to) : t('checklist.anyone'),
                at: new Date(h.at).toLocaleString(),
              })}
              <p className="staff-request__note">{h.note}</p>
            </li>
          ))}
        </ul>
        {data.actions.handoff ? <Handoff t={t} fetchImpl={fetchImpl} base={base} data={data} onDone={load} /> : null}
      </section>
      {/* TSK-0083: the walkthrough and Finished, below the checklist. */}
      <CompletionPanel t={t} fetchImpl={fetchImpl} jobId={data.jobId} />
    </section>
  )
}

function Step({
  t,
  fetchImpl,
  base,
  workPackageId,
  step,
  spanish,
  photos,
  onDone,
}: {
  t: T
  fetchImpl: Fetch
  base: string
  workPackageId: string
  step: ChecklistStep
  spanish: boolean
  photos: ChecklistData['photos']
  onDone: () => Promise<void>
}) {
  const ids = useId()
  const [measurement, setMeasurement] = useState(step.measurement ?? '')
  const [note, setNote] = useState(step.note ?? '')
  const [reason, setReason] = useState('')
  const [chosen, setChosen] = useState<string[]>(step.photoIds)
  const [pending, setPending] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const needsReason = step.actions.some((a) => a === 'skip' || a === 'reopen')
  const canComplete = step.actions.includes('complete')

  async function send(event: string) {
    setPending(event)
    const r = await call(fetchImpl, `${base}/steps/${event}`, {
      method: 'POST',
      body: {
        workPackageId,
        stepId: step.stepId,
        version: step.version,
        ...(event === 'complete' && measurement.trim() ? { measurement } : {}),
        ...(event === 'complete' && note.trim() ? { note } : {}),
        ...(event === 'complete' && chosen.length ? { photoIds: chosen } : {}),
        ...((event === 'skip' || event === 'reopen') && reason.trim() ? { reason } : {}),
      },
      headers: { 'idempotency-key': idempotencyKey() },
    })
    setPending(null)
    if (!r.ok) return setProblem(checklistError(t, r.error))
    setProblem(null)
    setReason('')
    await onDone()
  }

  return (
    <li className="staff-request__decision" data-testid="checklist-step" data-step={step.stepId}>
      <p>
        <StatusBadge tone={tone(step.state)}>{codeLabel(t, 'checklistStepState', step.state)}</StatusBadge>{' '}
        {step.required ? <StatusBadge tone="info">{t('sop.required')}</StatusBadge> : null}{' '}
        <span className="staff-request__hint">{t('sop.itemId', { id: step.stepId })}</span>
      </p>
      <p lang={spanish && step.textEs !== null ? 'es' : 'en'}>
        {(spanish && step.textEs !== null ? step.textEs : step.text).split('\n').map((l, i) => (
          <span key={i}>
            {i > 0 ? <br /> : null}
            {l}
          </span>
        ))}
      </p>
      {step.holdBefore.length ? (
        <p className="staff-request__hint">{t('sop.holdBefore', { ids: step.holdBefore.join(', ') })}</p>
      ) : null}
      {step.waitsForChangeOrders.length ? (
        <p className="staff-request__hint" role="note" data-testid="checklist-step-waits">
          <StatusBadge tone="warning">{codeLabel(t, 'checklistRefusal', 'WAITS_FOR_CHANGE_ORDER')}</StatusBadge>{' '}
          {t('checklist.waitsForChange', { numbers: step.waitsForChangeOrders.map((n) => `C${n}`).join(', ') })}
        </p>
      ) : null}
      {step.evidence.length ? (
        <p className="staff-request__hint">
          {t('checklist.asks', { evidence: step.evidence.map((e) => codeLabel(t, 'sopEvidence', e)).join(', ') })}
        </p>
      ) : null}
      {step.skipReason && step.state === 'skipped' ? (
        <p className="staff-request__hint">{t('checklist.skippedBecause', { reason: step.skipReason })}</p>
      ) : null}
      {step.completedBy ? (
        <p className="staff-request__hint">{t('checklist.completedBy', { name: who(step.completedBy) })}</p>
      ) : step.worker ? (
        <p className="staff-request__hint">{t('checklist.lastBy', { name: who(step.worker) })}</p>
      ) : null}
      {canComplete && step.evidence.includes('measurement') ? (
        <Field
          label={t('checklist.measurement')}
          name={`${ids}-measurement`}
          maxLength={200}
          value={measurement}
          onChange={(e) => setMeasurement(e.target.value)}
        />
      ) : null}
      {canComplete && step.evidence.includes('note') ? (
        <Field
          label={t('checklist.note')}
          name={`${ids}-note`}
          multiline
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      ) : null}
      {canComplete && step.evidence.includes('photo') ? (
        photos.length ? (
          <fieldset>
            <legend>{t('checklist.choosePhotos')}</legend>
            {photos.map((f) => (
              <label key={f.id} className="staff-loadout__choice">
                <input
                  type="checkbox"
                  checked={chosen.includes(f.id)}
                  onChange={(e) => setChosen((c) => (e.target.checked ? [...c, f.id] : c.filter((x) => x !== f.id)))}
                />{' '}
                {t('checklist.photoOption', {
                  phase: f.phase,
                  label: f.areaLabel ?? '',
                  at: new Date(f.uploadedAt).toLocaleTimeString(),
                })}
              </label>
            ))}
          </fieldset>
        ) : (
          <p className="staff-request__hint">{t('checklist.noPhotos')}</p>
        )
      ) : null}
      {needsReason ? (
        <Field
          label={t('checklist.reason')}
          name={`${ids}-reason`}
          maxLength={1000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      ) : null}
      {problem ? (
        <p role="alert" className="hh-field__error">
          {problem}
        </p>
      ) : null}
      {step.actions.length ? (
        <div className="hh-button-row">
          {step.actions.map((a) => (
            <Button
              key={a}
              variant={a === 'complete' ? 'primary' : 'secondary'}
              pending={pending === a}
              onClick={() => void send(a)}
            >
              {codeLabel(t, 'checklistEvent', a)}
            </Button>
          ))}
        </div>
      ) : null}
    </li>
  )
}

function Handoff({
  t,
  fetchImpl,
  base,
  data,
  onDone,
}: {
  t: T
  fetchImpl: Fetch
  base: string
  data: ChecklistData
  onDone: () => Promise<void>
}) {
  const ids = useId()
  const [note, setNote] = useState('')
  const [to, setTo] = useState('')
  const [pending, setPending] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  async function submit(e: FormEvent) {
    e.preventDefault()
    setPending(true)
    const r = await call(fetchImpl, `${base}/handoffs`, {
      method: 'POST',
      body: { note, ...(to ? { toWorkerId: to } : {}) },
      headers: { 'idempotency-key': idempotencyKey() },
    })
    setPending(false)
    if (!r.ok) return setProblem(checklistError(t, r.error))
    setProblem(null)
    setNote('')
    await onDone()
  }
  return (
    <form className="staff-loadout__form" onSubmit={(e) => void submit(e)} aria-label={t('checklist.handoff')}>
      <Field
        label={t('checklist.handoffNote')}
        name="handoffNote"
        multiline
        required
        maxLength={2000}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="hh-field">
        <label className="hh-field__label" htmlFor={`${ids}-to`}>
          {t('checklist.handoffTo')}
        </label>
        <select id={`${ids}-to`} className="hh-field__control" value={to} onChange={(e) => setTo(e.target.value)}>
          <option value="">{t('checklist.anyone')}</option>
          {data.workers.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name ?? w.id}
            </option>
          ))}
        </select>
      </div>
      {problem ? (
        <p role="alert" className="hh-field__error">
          {problem}
        </p>
      ) : null}
      <Button type="submit" pending={pending}>
        {t('checklist.handoff')}
      </Button>
    </form>
  )
}
