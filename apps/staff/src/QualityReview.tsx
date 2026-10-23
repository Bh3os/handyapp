// The Owner's quality review of a job and its punch items (TSK-0084; HH-QA-02, HH-QA-04, HH-QA-09, HH-FIN-05, T55,
// T56, OWN-DEC-64, OWN-DEC-109, RULE-SAFETY-GATES, RULE-SERVER-AUTHZ). Opened from the Owner Decisions item of a job
// awaiting quality review, or the punch-items queue item: /quality-reviews/<job id>.
// - The Owner sees what to review (the approved scope, the work packages, the before/after photos, whether a checklist
//   and a walkthrough are recorded), starts the review, records each punch item (kind, place, required correction
//   evidence, worker, due date; a safety concern names the job's open safety hold), and records a result for each of
//   the four areas: passed, or punch work. The final invoice's gate is shown as the review gives it.
// - A worker the server refuses the review to sees only their own punch items on the job, to record the correction.
// - The Owner re-checks each corrected item: passed, or failed with the reason (the item opens again).
// The server decides every action again; a refusal names its reason.
import type { StaffKey } from '@handyhub/i18n'
import { Button, Field, StateView, StatusBadge } from '@handyhub/ui'
import { useCallback, useEffect, useId, useState, type FormEvent, type ReactNode } from 'react'
import { call, idempotencyKey, type ApiErrorBody, type Fetch } from './api'
import { codeLabel } from './Requests'

type T = (key: StaffKey, values?: Record<string, string | number | Date>) => string

const AREAS = ['scope', 'checklist', 'evidence', 'walkthrough'] as const
type Area = (typeof AREAS)[number]
const KINDS = ['finish', 'cleanup', 'defect', 'incomplete_scope', 'failed_check', 'safety_concern'] as const

type StaffRef = { id: string; name: string | null }
export type PunchItem = {
  id: string
  workPackageId: string | null
  area: string | null
  kind: string
  severity: 'minor' | 'major'
  description: string
  requiredEvidence: string
  assignedTo: StaffRef
  dueOn: string
  holdId: string | null
  state: 'open' | 'corrected' | 'rechecked'
  createdBy: StaffRef
  createdAt: string
  correctionNote: string | null
  correctedBy: StaffRef | null
  correctedAt: string | null
  recheckNote: string | null
  recheckedBy: StaffRef | null
  recheckedAt: string | null
  version: number
  actions: { correct: boolean; recheck: boolean }
}
export type QualityReviewData = {
  jobId: string
  projectId: string
  reference: string
  jobState: string
  review: {
    state: string
    reviewer: StaffRef | null
    selfReview: boolean
    results: Record<Area, 'ok' | 'problem'> | null
    note: string | null
    startedAt: string | null
    decidedAt: string | null
    passedAt: string | null
    version: number
  } | null
  gate: string
  scope: { version: number; totalCents: number; lines: string[] } | null
  workPackages: { id: string; code: string; position: number; state: string }[]
  evidence: { beforePhotos: number; afterPhotos: number }
  checklistRecorded: boolean
  checklist: {
    workPackageId: string
    code: string
    steps: number
    completed: number
    skipped: number
    requiredSkipped: number
    requiredOpen: number
    complete: boolean
  }[]
  walkthroughRecorded: boolean
  walkthrough: {
    outcome: string
    participantName: string | null
    participantRole: string | null
    comments: string | null
    caseNumber: number | null
    recordedAt: string
  } | null
  safetyHolds: { id: string; category: string; state: string; raisedAt: string }[]
  workers: StaffRef[]
  punchItems: PunchItem[]
  history: {
    event: string
    punchItemId: string | null
    from: string | null
    to: string
    actor: StaffRef
    note: string | null
    at: string
  }[]
  actions: { start: boolean; addPunchItem: boolean; decide: boolean }
}

/** The refusal in words: each field code of the quality routes, else the error code. */
export function qualityError(t: T, e: ApiErrorBody): string {
  if (e.code === 'STALE_VERSION') return t('quality.stale')
  if (e.fieldErrors.length) return e.fieldErrors.map((f) => codeLabel(t, 'qualityRefusal', f.code)).join(' ')
  try {
    return t(`error.${e.code}` as StaffKey)
  } catch {
    return t('error.INTERNAL')
  }
}

function useSend(fetchImpl: Fetch) {
  return useCallback(
    <R,>(path: string, body: unknown, version?: number) =>
      call<R>(fetchImpl, path, {
        method: 'POST',
        body,
        headers: {
          'idempotency-key': idempotencyKey(),
          ...(version === undefined ? {} : { 'if-match': `"${version}"` }),
        },
      }),
    [fetchImpl],
  )
}

function Problem({ text }: { text: string | null }) {
  return text ? (
    <p role="alert" className="hh-field__error">
      {text}
    </p>
  ) : null
}

function Select({
  label,
  name,
  value,
  onChange,
  options,
}: {
  label: string
  name: string
  value: string
  onChange: (v: string) => void
  options: readonly { value: string; label: string }[]
}) {
  const id = useId()
  return (
    <div className="hh-field">
      <label className="hh-field__label" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className="hh-field__control"
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function Section({ title, children, testId }: { title: string; children: ReactNode; testId?: string }) {
  const id = useId()
  return (
    <section className="staff-request__section" aria-labelledby={id} data-testid={testId}>
      <h2 id={id} className="staff-queue__heading">
        {title}
      </h2>
      {children}
    </section>
  )
}

const reviewTone = (state: string) =>
  state === 'passed' ? 'success' : state === 'punch_required' ? 'warning' : state === 'pending' ? 'neutral' : 'info'
const gateTone = (gate: string) => (gate === 'passed' ? 'success' : gate === 'blocked' ? 'danger' : 'warning')
const itemTone = (state: string) => (state === 'rechecked' ? 'success' : state === 'open' ? 'warning' : 'info')
const who = (r: StaffRef | null) => (r ? (r.name ?? r.id) : '')
const when = (iso: string) => new Date(iso).toLocaleString()

export function QualityReviewPage({
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
  const [data, setData] = useState<QualityReviewData | null | undefined>(undefined)
  const [own, setOwn] = useState<PunchItem[] | null>(null)
  const [refused, setRefused] = useState<ApiErrorBody | null>(null)
  const base = `/staff/jobs/${encodeURIComponent(jobId)}`

  const load = useCallback(async () => {
    const r = await call<QualityReviewData>(fetchImpl, `${base}/quality-review`)
    if (r.ok) {
      setData(r.data)
      return
    }
    // Not the Owner: the caller's own punch items on the job, when the server lets them see any.
    const mine = await call<{ punchItems: PunchItem[] }>(fetchImpl, `${base}/punch-items`)
    if (mine.ok) {
      setOwn(mine.data.punchItems)
      setData(null)
    } else {
      setRefused(r.error)
      setData(null)
    }
  }, [fetchImpl, base])
  useEffect(() => {
    void load()
  }, [load])

  if (data === undefined && !refused && own === null) return <StateView kind="loading" title={t('common.loading')} />
  if (own !== null)
    return (
      <section className="staff-screen" data-testid="own-punch-items">
        <h1 className="hh-h3">{t('quality.ownTitle')}</h1>
        {own.length === 0 ? <p className="staff-request__hint">{t('quality.noOwnItems')}</p> : null}
        <PunchList t={t} fetchImpl={fetchImpl} items={own} packages={[]} onDone={load} />
      </section>
    )
  if (!data)
    return (
      <StateView kind="blocked" title={refused?.code === 'NOT_FOUND' ? t('error.NOT_FOUND') : t('quality.refused')} />
    )

  return (
    <section className="staff-screen" aria-labelledby="quality-title" data-testid="quality-review">
      <h1 id="quality-title" className="hh-h3">
        {t('quality.title', { reference: data.reference })}
      </h1>
      <p>
        <StatusBadge tone="neutral">{codeLabel(t, 'jobState', data.jobState)}</StatusBadge>{' '}
        {data.review ? (
          <StatusBadge tone={reviewTone(data.review.state)}>
            {codeLabel(t, 'qualityReviewState', data.review.state)}
          </StatusBadge>
        ) : (
          <StatusBadge tone="neutral">{codeLabel(t, 'qualityReviewState', 'pending')}</StatusBadge>
        )}{' '}
        {data.review?.selfReview ? <StatusBadge tone="info">{t('quality.selfReview')}</StatusBadge> : null}
      </p>
      <p data-testid="quality-gate">
        {t('quality.gateLabel')}{' '}
        <StatusBadge tone={gateTone(data.gate)}>{codeLabel(t, 'qualityGate', data.gate)}</StatusBadge>
      </p>
      {data.review?.reviewer ? (
        <p className="staff-request__hint">{t('quality.reviewer', { name: who(data.review.reviewer) })}</p>
      ) : null}
      {data.actions.start ? <Start t={t} fetchImpl={fetchImpl} base={base} onDone={load} /> : null}

      <Section title={t('quality.toReview')} testId="quality-to-review">
        <dl className="staff-system__fields">
          <dt>{codeLabel(t, 'qualityArea', 'scope')}</dt>
          <dd>
            {data.scope ? (
              <ul className="staff-request__list">
                {data.scope.lines.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            ) : (
              t('quality.notRecorded')
            )}
            {data.workPackages.map((p) => p.code).join(', ')}
          </dd>
          <dt>{codeLabel(t, 'qualityArea', 'checklist')}</dt>
          <dd>
            {data.checklist.length ? (
              <ul className="staff-request__list" data-testid="quality-checklist">
                {data.checklist.map((c) => (
                  <li key={c.workPackageId}>
                    {t('quality.checklistLine', {
                      code: c.code,
                      completed: c.completed,
                      steps: c.steps,
                      skipped: c.requiredSkipped,
                      open: c.requiredOpen,
                    })}
                  </li>
                ))}
              </ul>
            ) : (
              t('quality.notRecorded')
            )}
          </dd>
          <dt>{codeLabel(t, 'qualityArea', 'evidence')}</dt>
          <dd>
            {t('quality.photos', { before: data.evidence.beforePhotos, after: data.evidence.afterPhotos })}{' '}
            <a href={href(`/job-photos/${data.jobId}`)}>{t('quality.openPhotos')}</a>
          </dd>
          <dt>{codeLabel(t, 'qualityArea', 'walkthrough')}</dt>
          <dd data-testid="quality-walkthrough">
            {data.walkthrough ? (
              <>
                {codeLabel(t, 'walkthroughOutcome', data.walkthrough.outcome)}
                {data.walkthrough.participantName
                  ? ` · ${data.walkthrough.participantName} (${codeLabel(t, 'participantRole', data.walkthrough.participantRole ?? '')})`
                  : ''}
                {data.walkthrough.caseNumber !== null
                  ? ` · ${t('quality.walkthroughCase', { number: data.walkthrough.caseNumber })}`
                  : ''}
                {data.walkthrough.comments ? <p className="staff-request__note">{data.walkthrough.comments}</p> : null}
              </>
            ) : (
              t('quality.notRecorded')
            )}
          </dd>
        </dl>
      </Section>

      <Section title={t('quality.punchItems')} testId="quality-punch-items">
        {data.punchItems.length === 0 ? <p className="staff-request__hint">{t('quality.noItems')}</p> : null}
        <PunchList t={t} fetchImpl={fetchImpl} items={data.punchItems} packages={data.workPackages} onDone={load} />
        {data.actions.addPunchItem ? (
          <AddPunchItem t={t} fetchImpl={fetchImpl} base={base} data={data} href={href} onDone={load} />
        ) : null}
      </Section>

      {data.review?.results ? (
        <Section title={t('quality.results')}>
          <dl className="staff-system__fields" data-testid="quality-results">
            {AREAS.map((a) => (
              <div key={a}>
                <dt>{codeLabel(t, 'qualityArea', a)}</dt>
                <dd>{codeLabel(t, 'areaResult', data.review?.results?.[a] ?? '')}</dd>
              </div>
            ))}
          </dl>
          {data.review.note ? <p className="staff-request__note">{data.review.note}</p> : null}
        </Section>
      ) : null}
      {data.actions.decide && data.review ? (
        <Decide t={t} fetchImpl={fetchImpl} base={base} version={data.review.version} onDone={load} />
      ) : null}

      {data.history.length ? (
        <Section title={t('quality.history')}>
          <ul className="staff-request__list" data-testid="quality-history">
            {data.history.map((h, i) => (
              <li key={i}>
                {codeLabel(t, 'qualityEvent', h.event)} · {who(h.actor)} · {when(h.at)}
                {h.note ? <span className="staff-request__hint"> — {h.note}</span> : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </section>
  )
}

function Start({ t, fetchImpl, base, onDone }: { t: T; fetchImpl: Fetch; base: string; onDone: () => Promise<void> }) {
  const send = useSend(fetchImpl)
  const [pending, setPending] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  async function start() {
    setPending(true)
    const r = await send(`${base}/quality-review/actions/start`, {})
    setPending(false)
    if (!r.ok) return setProblem(qualityError(t, r.error))
    setProblem(null)
    await onDone()
  }
  return (
    <div className="hh-button-row">
      <Button pending={pending} onClick={() => void start()}>
        {t('quality.start')}
      </Button>
      <Problem text={problem} />
    </div>
  )
}

function PunchList({
  t,
  fetchImpl,
  items,
  packages,
  onDone,
}: {
  t: T
  fetchImpl: Fetch
  items: PunchItem[]
  packages: QualityReviewData['workPackages']
  onDone: () => Promise<void>
}) {
  return (
    <ul className="staff-request__list">
      {items.map((i) => {
        const wp = packages.find((p) => p.id === i.workPackageId)
        return (
          <li key={i.id} className="staff-request__decision" data-testid="punch-item">
            <p>
              <StatusBadge tone={i.severity === 'major' ? 'danger' : 'warning'}>
                {codeLabel(t, 'punchSeverity', i.severity)}
              </StatusBadge>{' '}
              <StatusBadge tone={itemTone(i.state)}>{codeLabel(t, 'punchState', i.state)}</StatusBadge>{' '}
              <strong>{codeLabel(t, 'punchKind', i.kind)}</strong>
              {wp || i.area ? ` · ${[wp?.code, i.area].filter(Boolean).join(' · ')}` : ''}
            </p>
            <p className="staff-request__note">{i.description}</p>
            <p className="staff-request__hint">
              {t('quality.itemMeta', { evidence: i.requiredEvidence, name: who(i.assignedTo), due: i.dueOn })}
            </p>
            {i.correctionNote ? (
              <p className="staff-request__hint">
                {t('quality.corrected', { name: who(i.correctedBy), note: i.correctionNote })}
              </p>
            ) : null}
            {i.recheckNote ? (
              <p className="staff-request__hint">
                {t('quality.rechecked', { name: who(i.recheckedBy), note: i.recheckNote })}
              </p>
            ) : null}
            {i.actions.correct ? <Correct t={t} fetchImpl={fetchImpl} item={i} onDone={onDone} /> : null}
            {i.actions.recheck ? <Recheck t={t} fetchImpl={fetchImpl} item={i} onDone={onDone} /> : null}
          </li>
        )
      })}
    </ul>
  )
}

function Correct({
  t,
  fetchImpl,
  item,
  onDone,
}: {
  t: T
  fetchImpl: Fetch
  item: PunchItem
  onDone: () => Promise<void>
}) {
  const send = useSend(fetchImpl)
  const [note, setNote] = useState('')
  const [pending, setPending] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  async function submit(e: FormEvent) {
    e.preventDefault()
    setPending(true)
    const r = await send(`/staff/punch-items/${item.id}/actions/correct`, { note }, item.version)
    setPending(false)
    if (!r.ok) return setProblem(qualityError(t, r.error))
    setProblem(null)
    await onDone()
  }
  return (
    <form className="staff-loadout__form" onSubmit={(e) => void submit(e)} aria-label={t('quality.correct')}>
      <Field
        label={t('quality.correctionNote')}
        name="correctionNote"
        multiline
        required
        maxLength={1000}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <Problem text={problem} />
      <Button type="submit" pending={pending}>
        {t('quality.correct')}
      </Button>
    </form>
  )
}

function Recheck({
  t,
  fetchImpl,
  item,
  onDone,
}: {
  t: T
  fetchImpl: Fetch
  item: PunchItem
  onDone: () => Promise<void>
}) {
  const send = useSend(fetchImpl)
  const [note, setNote] = useState('')
  const [pending, setPending] = useState<'pass' | 'fail' | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  async function submit(passed: boolean) {
    setPending(passed ? 'pass' : 'fail')
    const r = await send(`/staff/punch-items/${item.id}/actions/recheck`, { passed, note }, item.version)
    setPending(null)
    if (!r.ok) return setProblem(qualityError(t, r.error))
    setProblem(null)
    await onDone()
  }
  return (
    <form className="staff-loadout__form" onSubmit={(e) => e.preventDefault()} aria-label={t('quality.recheck')}>
      <Field
        label={t('quality.recheckNote')}
        name="recheckNote"
        multiline
        required
        maxLength={1000}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <Problem text={problem} />
      <div className="hh-button-row">
        <Button pending={pending === 'pass'} onClick={() => void submit(true)}>
          {t('quality.recheckPass')}
        </Button>
        <Button variant="secondary" pending={pending === 'fail'} onClick={() => void submit(false)}>
          {t('quality.recheckFail')}
        </Button>
      </div>
    </form>
  )
}

function AddPunchItem({
  t,
  fetchImpl,
  base,
  data,
  href,
  onDone,
}: {
  t: T
  fetchImpl: Fetch
  base: string
  data: QualityReviewData
  href: (to: string) => string
  onDone: () => Promise<void>
}) {
  const send = useSend(fetchImpl)
  const [kind, setKind] = useState<string>('finish')
  const [description, setDescription] = useState('')
  const [evidence, setEvidence] = useState('')
  const [workPackageId, setWorkPackageId] = useState(data.workPackages[0]?.id ?? '')
  const [area, setArea] = useState('')
  const [assignedTo, setAssignedTo] = useState(data.workers[0]?.id ?? '')
  const [dueOn, setDueOn] = useState('')
  const [holdId, setHoldId] = useState(data.safetyHolds[0]?.id ?? '')
  const [pending, setPending] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const safety = kind === 'safety_concern'
  async function submit(e: FormEvent) {
    e.preventDefault()
    setPending(true)
    const r = await send(`${base}/quality-review/punch-items`, {
      kind,
      description,
      requiredEvidence: evidence,
      assignedTo,
      dueOn,
      ...(workPackageId ? { workPackageId } : {}),
      ...(area.trim() ? { area } : {}),
      ...(safety && holdId ? { holdId } : {}),
    })
    setPending(false)
    if (!r.ok) return setProblem(qualityError(t, r.error))
    setProblem(null)
    setDescription('')
    setEvidence('')
    setArea('')
    await onDone()
  }
  return (
    <form
      className="staff-loadout__form"
      onSubmit={(e) => void submit(e)}
      aria-label={t('quality.addItem')}
      data-testid="add-punch-item"
    >
      <h3 className="staff-queue__heading">{t('quality.addItem')}</h3>
      <Select
        label={t('quality.field.kind')}
        name="kind"
        value={kind}
        onChange={setKind}
        options={KINDS.map((k) => ({ value: k, label: codeLabel(t, 'punchKind', k) }))}
      />
      <p className="staff-request__hint">{t('quality.kindHint')}</p>
      {safety ? (
        data.safetyHolds.length ? (
          <Select
            label={t('quality.field.hold')}
            name="holdId"
            value={holdId}
            onChange={setHoldId}
            options={data.safetyHolds.map((h) => ({ value: h.id, label: `${h.category} · ${when(h.raisedAt)}` }))}
          />
        ) : (
          <p role="note" className="staff-request__hint" data-testid="safety-hold-needed">
            {t('quality.safetyHoldNeeded')} <a href={href(`/packets/${data.jobId}`)}>{t('quality.openJob')}</a>
          </p>
        )
      ) : null}
      <Field
        label={t('quality.field.description')}
        name="description"
        multiline
        required
        maxLength={1000}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <Field
        label={t('quality.field.requiredEvidence')}
        name="requiredEvidence"
        required
        maxLength={500}
        value={evidence}
        onChange={(e) => setEvidence(e.target.value)}
      />
      <Select
        label={t('quality.field.workPackage')}
        name="workPackageId"
        value={workPackageId}
        onChange={setWorkPackageId}
        options={[
          { value: '', label: t('quality.noWorkPackage') },
          ...data.workPackages.map((p) => ({ value: p.id, label: p.code })),
        ]}
      />
      <Field
        label={t('quality.field.area')}
        name="area"
        maxLength={120}
        value={area}
        onChange={(e) => setArea(e.target.value)}
      />
      <Select
        label={t('quality.field.assignedTo')}
        name="assignedTo"
        value={assignedTo}
        onChange={setAssignedTo}
        options={data.workers.map((w) => ({ value: w.id, label: w.name ?? w.id }))}
      />
      <Field
        label={t('quality.field.dueOn')}
        name="dueOn"
        type="date"
        required
        value={dueOn}
        onChange={(e) => setDueOn(e.target.value)}
      />
      <Problem text={problem} />
      <Button type="submit" pending={pending}>
        {t('quality.addItem')}
      </Button>
    </form>
  )
}

function Decide({
  t,
  fetchImpl,
  base,
  version,
  onDone,
}: {
  t: T
  fetchImpl: Fetch
  base: string
  version: number
  onDone: () => Promise<void>
}) {
  const send = useSend(fetchImpl)
  const [results, setResults] = useState<Record<Area, string>>({
    scope: '',
    checklist: '',
    evidence: '',
    walkthrough: '',
  })
  const [note, setNote] = useState('')
  const [pending, setPending] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (AREAS.some((a) => !results[a])) return setProblem(codeLabel(t, 'qualityRefusal', 'AREAS_NOT_REVIEWED'))
    setPending(true)
    const r = await send(
      `${base}/quality-review/actions/decide`,
      { results, ...(note.trim() ? { note } : {}) },
      version,
    )
    setPending(false)
    if (!r.ok) return setProblem(qualityError(t, r.error))
    setProblem(null)
    await onDone()
  }
  return (
    <form
      className="staff-loadout__form"
      onSubmit={(e) => void submit(e)}
      aria-label={t('quality.decide')}
      data-testid="quality-decide"
    >
      <h2 className="staff-queue__heading">{t('quality.decide')}</h2>
      <p className="staff-request__hint">{t('quality.decideHint')}</p>
      {AREAS.map((a) => (
        <Select
          key={a}
          label={codeLabel(t, 'qualityArea', a)}
          name={`result-${a}`}
          value={results[a]}
          onChange={(v) => setResults((r) => ({ ...r, [a]: v }))}
          options={[
            { value: '', label: t('quality.choose') },
            { value: 'ok', label: codeLabel(t, 'areaResult', 'ok') },
            { value: 'problem', label: codeLabel(t, 'areaResult', 'problem') },
          ]}
        />
      ))}
      <Field
        label={t('quality.field.note')}
        name="reviewNote"
        multiline
        maxLength={2000}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <Problem text={problem} />
      <Button type="submit" pending={pending}>
        {t('quality.decideSubmit')}
      </Button>
    </form>
  )
}
