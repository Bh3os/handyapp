// Return work of a case and the worker's return-visit punch items (TSK-0094; HH-QA-07, HH-QA-08, HH-FIN-17, T56,
// FACT-WARRANTY, OWN-DEC-135, RULE-HUMAN-REVIEW, RULE-MONEY-CENTS).
// - The case page shows the return work the server sent: the warranty window as the server reads it (the reviewed
//   completion date, the report date and whether the report is inside the 90 days), the classification, the Owner's
//   coverage and price decision, the linked return visits and return job, the return-visit punch items, the costs in
//   cents and the history. Every control is one the server offered (`actions`), and the server checks it again.
// - Nothing here applies coverage, an exclusion or a price: the Owner records a decision with a note, and chargeable
//   work is priced through its own estimate or change order. A return visit never reopens the original job.
// - The worker sees their own items on the return visit's Start Work screen and records a correction once they started
//   that visit through the gate.
import type { StaffKey, StaffLocale } from '@handyhub/i18n'
import { cents, centsFromDecimal, formatUsd } from '@handyhub/money'
import { Button, Field, StateView, StatusBadge } from '@handyhub/ui'
import { useCallback, useEffect, useId, useState, type FormEvent, type ReactNode } from 'react'
import { call, idempotencyKey, type ApiErrorBody, type Fetch } from './api'
import { codeLabel } from './Requests'

type T = (key: StaffKey, values?: Record<string, string | number>) => string
type StaffRef = { id: string; name: string | null }

/** HH-QA-07's classes (the server's list; a workmanship class is recorded by the warranty window). */
const CLASSES = [
  'open_punch',
  'workmanship_callback',
  'warranty_claim',
  'new_scope',
  'customer_change_or_damage',
  'product_issue',
  'unresolved',
] as const
const COVERAGE = ['covered', 'not_covered'] as const
const PRICE = ['no_charge', 'chargeable'] as const
const COST_KINDS = ['materials', 'purchase', 'rental', 'other'] as const

type Item = {
  id: string
  workPackageId: string | null
  area: string | null
  description: string
  requiredEvidence: string
  assignedTo: StaffRef | null
  dueOn: string | null
  state: string
  correctionNote: string | null
  correctedBy: StaffRef | null
  recheckNote: string | null
  version: number
  actions: { recheck: boolean }
}
type Cost = {
  id: string
  kind: string
  amountCents: number
  note: string
  recordedBy: StaffRef | null
  recordedAt: string | null
  voided: { reason: string | null; by: StaffRef | null; at: string | null } | null
  actions: { void: boolean }
}
export type ReturnWorkView = {
  caseId: string
  caseState: string
  originalJob: { jobId: string; state: string; projectReference: string } | null
  warranty: {
    reviewedCompletionOn: string | null
    lastDayOn: string | null
    reportedOn: string
    within: boolean | null
    days: number
    reviewState: string | null
  } | null
  workPackages: { id: string; code: string }[]
  workers: StaffRef[]
  returnWork: {
    id: string
    version: number
    classification: string
    classificationNote: string | null
    window: { reviewedCompletionOn: string | null; reportedOn: string | null; within: boolean | null }
    decision: {
      coverage: string
      price: string
      note: string | null
      decidedBy: StaffRef | null
      decidedAt: string | null
    } | null
    returnJob: { jobId: string; state: string; projectReference: string } | null
    visits: {
      visitId: string
      number: number
      state: string
      localDate: string | null
      windowStart: string
      windowEnd: string
    }[]
    items: Item[]
    costs: Cost[]
    totals: { costCents: number; laborMinutes: number; laborMinutesComplete: boolean; laborCost: 'incomplete' }
    history: {
      event: string
      subjectId: string | null
      actor: StaffRef | null
      note: string | null
      at: string | null
    }[]
  } | null
  actions: {
    classify: boolean
    decide: boolean
    planVisit: boolean
    linkVisit: boolean
    linkJob: boolean
    addItem: boolean
    addCost: boolean
  }
}

const bcp47 = (locale: StaffLocale) => (locale === 'es' ? 'es-US' : 'en-US')
const whenOf = (locale: StaffLocale) => (iso: string | null) =>
  iso ? new Intl.DateTimeFormat(bcp47(locale), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)) : ''
const nameOf = (t: T, r: StaffRef | null) => (r ? (r.name ?? t('cases.someone')) : t('cases.nobody'))
const usd = (c: number) => formatUsd(cents(c))

/** A refusal in words: the return-work codes, else the case codes, else the error code. */
export function returnWorkError(t: T, e: ApiErrorBody): string {
  if (e.fieldErrors.length)
    return e.fieldErrors
      .map((f) => {
        const own = codeLabel(t, 'returnWorkCode', f.code)
        return own === f.code ? codeLabel(t, 'caseCode', f.code) : own
      })
      .join(' ')
  try {
    return t(`error.${e.code}` as StaffKey)
  } catch {
    return t('error.INTERNAL')
  }
}

function useSend(fetchImpl: Fetch) {
  return useCallback(
    <R,>(path: string, body: unknown, opts: { method?: 'POST' | 'PUT'; version?: number } = {}) =>
      call<R>(fetchImpl, path, {
        method: opts.method ?? 'POST',
        body,
        headers: {
          'idempotency-key': idempotencyKey(),
          ...(opts.version === undefined ? {} : { 'if-match': `"${opts.version}"` }),
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

function Sub({ title, children, testId }: { title: string; children: ReactNode; testId?: string }) {
  const id = useId()
  return (
    <section aria-labelledby={id} data-testid={testId}>
      <h3 id={id} className="hh-h5">
        {title}
      </h3>
      {children}
    </section>
  )
}

/** The warranty window as the server read it (FACT-WARRANTY); a statement of dates, never of coverage. */
function Window({ t, view }: { t: T; view: ReturnWorkView }) {
  const w = view.warranty
  if (!w) return <p>{t('returnWork.window.noJob')}</p>
  return (
    <p data-testid="return-work-window">
      {w.reviewedCompletionOn === null
        ? t('returnWork.window.notReviewed')
        : t(w.within ? 'returnWork.window.within' : 'returnWork.window.after', {
            days: w.days,
            completed: w.reviewedCompletionOn,
            reported: w.reportedOn,
            last: w.lastDayOn ?? '',
          })}
    </p>
  )
}

function Classify({
  t,
  fetchImpl,
  view,
  onDone,
}: {
  t: T
  fetchImpl: Fetch
  view: ReturnWorkView
  onDone: () => void
}) {
  const send = useSend(fetchImpl)
  const [classification, setClassification] = useState(view.returnWork?.classification ?? 'workmanship_callback')
  const [note, setNote] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  async function submit(e: FormEvent) {
    e.preventDefault()
    const r = await send(
      `/staff/cases/${view.caseId}/return-work`,
      { classification, ...(note.trim() ? { note: note.trim() } : {}) },
      { method: 'PUT', version: view.returnWork?.version ?? 0 },
    )
    if (!r.ok) return setProblem(returnWorkError(t, r.error))
    setProblem(null)
    setNote('')
    onDone()
  }
  return (
    <form className="staff-loadout__form" onSubmit={(e) => void submit(e)} aria-label={t('returnWork.classify.title')}>
      <Select
        label={t('returnWork.classify.class')}
        name="returnWorkClass"
        value={classification}
        onChange={setClassification}
        options={CLASSES.map((c) => ({ value: c, label: codeLabel(t, 'returnWorkClass', c) }))}
      />
      <p className="staff-request__hint">{t('returnWork.classify.hint')}</p>
      <Field
        label={t('returnWork.classify.note')}
        name="returnWorkNote"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <Button type="submit" variant="secondary">
        {view.returnWork ? t('returnWork.classify.reclassify') : t('returnWork.classify.submit')}
      </Button>
      <Problem text={problem} />
    </form>
  )
}

function Decide({ t, fetchImpl, view, onDone }: { t: T; fetchImpl: Fetch; view: ReturnWorkView; onDone: () => void }) {
  const send = useSend(fetchImpl)
  const r = view.returnWork
  const [coverage, setCoverage] = useState(r?.decision?.coverage ?? 'covered')
  const [price, setPrice] = useState(r?.decision?.price ?? 'no_charge')
  const [note, setNote] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  if (!r) return null
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!r) return
    const res = await send(
      `/staff/return-work/${r.id}/actions/decide`,
      { coverage, price, note: note.trim() },
      { version: r.version },
    )
    if (!res.ok) return setProblem(returnWorkError(t, res.error))
    setProblem(null)
    setNote('')
    onDone()
  }
  return (
    <form className="staff-loadout__form" onSubmit={(e) => void submit(e)} aria-label={t('returnWork.decide.title')}>
      <Select
        label={t('returnWork.decide.coverage')}
        name="returnWorkCoverage"
        value={coverage}
        onChange={setCoverage}
        options={COVERAGE.map((c) => ({ value: c, label: codeLabel(t, 'returnWorkCoverage', c) }))}
      />
      <Select
        label={t('returnWork.decide.price')}
        name="returnWorkPrice"
        value={price}
        onChange={setPrice}
        options={PRICE.map((c) => ({ value: c, label: codeLabel(t, 'returnWorkPrice', c) }))}
      />
      <Field
        label={t('returnWork.decide.note')}
        name="returnWorkDecisionNote"
        required
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <p className="staff-request__hint">{t('returnWork.decide.hint')}</p>
      <Button type="submit" variant="secondary">
        {t('returnWork.decide.submit')}
      </Button>
      <Problem text={problem} />
    </form>
  )
}

function PlanVisit({ t, fetchImpl, id, onDone }: { t: T; fetchImpl: Fetch; id: string; onDone: () => void }) {
  const send = useSend(fetchImpl)
  const [localDate, setDate] = useState('')
  const [windowStart, setStart] = useState('')
  const [windowEnd, setEnd] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  async function submit(e: FormEvent) {
    e.preventDefault()
    const r = await send(`/staff/return-work/${id}/return-visits`, { localDate, windowStart, windowEnd })
    if (!r.ok) return setProblem(returnWorkError(t, r.error))
    setProblem(null)
    onDone()
  }
  return (
    <form className="staff-loadout__form" onSubmit={(e) => void submit(e)} aria-label={t('returnWork.visits.plan')}>
      <Field
        label={t('returnWork.visits.date')}
        name="returnVisitDate"
        type="date"
        required
        value={localDate}
        onChange={(e) => setDate(e.target.value)}
      />
      <Field
        label={t('returnWork.visits.start')}
        name="returnVisitStart"
        type="time"
        required
        value={windowStart}
        onChange={(e) => setStart(e.target.value)}
      />
      <Field
        label={t('returnWork.visits.end')}
        name="returnVisitEnd"
        type="time"
        required
        value={windowEnd}
        onChange={(e) => setEnd(e.target.value)}
      />
      <Button type="submit" variant="secondary">
        {t('returnWork.visits.plan')}
      </Button>
      <Problem text={problem} />
    </form>
  )
}

function Items({ t, fetchImpl, view, onDone }: { t: T; fetchImpl: Fetch; view: ReturnWorkView; onDone: () => void }) {
  const send = useSend(fetchImpl)
  const r = view.returnWork
  const [area, setArea] = useState('')
  const [workPackageId, setPackage] = useState('')
  const [description, setDescription] = useState('')
  const [requiredEvidence, setEvidence] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [dueOn, setDueOn] = useState('')
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [problem, setProblem] = useState<string | null>(null)
  if (!r) return null
  const code = (id: string | null) => view.workPackages.find((p) => p.id === id)?.code ?? ''
  async function add(e: FormEvent) {
    e.preventDefault()
    if (!r) return
    const res = await send(`/staff/return-work/${r.id}/items`, {
      ...(workPackageId ? { workPackageId } : {}),
      ...(area.trim() ? { area: area.trim() } : {}),
      description: description.trim(),
      requiredEvidence: requiredEvidence.trim(),
      assignedTo: assignedTo || view.workers[0]?.id,
      dueOn,
    })
    if (!res.ok) return setProblem(returnWorkError(t, res.error))
    setProblem(null)
    setDescription('')
    setEvidence('')
    onDone()
  }
  async function recheck(i: Item, passed: boolean) {
    const res = await send(
      `/staff/return-work-items/${i.id}/actions/recheck`,
      { passed, note: (notes[i.id] ?? '').trim() },
      { version: i.version },
    )
    if (!res.ok) return setProblem(returnWorkError(t, res.error))
    setProblem(null)
    onDone()
  }
  return (
    <Sub title={t('returnWork.items.title')} testId="return-work-items">
      {r.items.length === 0 ? <p>{t('returnWork.items.none')}</p> : null}
      <ul className="staff-request__list">
        {r.items.map((i) => (
          <li key={i.id} className="staff-request__decision" data-testid="return-work-item">
            <p>
              {i.description}{' '}
              <StatusBadge tone={i.state === 'rechecked' ? 'success' : 'warning'}>
                {codeLabel(t, 'punchState', i.state)}
              </StatusBadge>
            </p>
            <p className="staff-request__hint">
              {t('returnWork.items.line', {
                place: [code(i.workPackageId), i.area ?? ''].filter(Boolean).join(' · '),
                name: nameOf(t, i.assignedTo),
                date: i.dueOn ?? '',
              })}
            </p>
            <p className="staff-request__hint">{t('returnWork.items.evidence', { evidence: i.requiredEvidence })}</p>
            {i.correctionNote ? (
              <p className="staff-request__note">
                {t('returnWork.items.corrected', { name: nameOf(t, i.correctedBy), note: i.correctionNote })}
              </p>
            ) : null}
            {i.recheckNote ? <p className="staff-request__note">{i.recheckNote}</p> : null}
            {i.actions.recheck ? (
              <div className="hh-button-row">
                <Field
                  label={t('returnWork.items.recheckNote')}
                  name={`recheckNote-${i.id}`}
                  value={notes[i.id] ?? ''}
                  onChange={(e) => setNotes({ ...notes, [i.id]: e.target.value })}
                />
                <Button variant="secondary" onClick={() => void recheck(i, true)}>
                  {t('returnWork.items.pass')}
                </Button>
                <Button variant="secondary" onClick={() => void recheck(i, false)}>
                  {t('returnWork.items.fail')}
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {view.actions.addItem ? (
        <form className="staff-loadout__form" onSubmit={(e) => void add(e)} aria-label={t('returnWork.items.add')}>
          <Select
            label={t('returnWork.items.workPackage')}
            name="returnItemPackage"
            value={workPackageId}
            onChange={setPackage}
            options={[
              { value: '', label: t('returnWork.items.noPackage') },
              ...view.workPackages.map((p) => ({ value: p.id, label: p.code })),
            ]}
          />
          <Field
            label={t('returnWork.items.area')}
            name="returnItemArea"
            value={area}
            onChange={(e) => setArea(e.target.value)}
          />
          <Field
            label={t('returnWork.items.description')}
            name="returnItemDescription"
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <Field
            label={t('returnWork.items.requiredEvidence')}
            name="returnItemEvidence"
            required
            value={requiredEvidence}
            onChange={(e) => setEvidence(e.target.value)}
          />
          <Select
            label={t('returnWork.items.assignedTo')}
            name="returnItemAssignee"
            value={assignedTo || view.workers[0]?.id || ''}
            onChange={setAssignedTo}
            options={view.workers.map((w) => ({ value: w.id, label: w.name ?? w.id }))}
          />
          <Field
            label={t('returnWork.items.dueOn')}
            name="returnItemDue"
            type="date"
            required
            value={dueOn}
            onChange={(e) => setDueOn(e.target.value)}
          />
          <Button type="submit" variant="secondary">
            {t('returnWork.items.add')}
          </Button>
        </form>
      ) : null}
      <Problem text={problem} />
    </Sub>
  )
}

function Costs({
  t,
  locale,
  fetchImpl,
  view,
  onDone,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  view: ReturnWorkView
  onDone: () => void
}) {
  const send = useSend(fetchImpl)
  const when = whenOf(locale)
  const r = view.returnWork
  const [kind, setKind] = useState<string>('materials')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [problem, setProblem] = useState<string | null>(null)
  if (!r) return null
  async function add(e: FormEvent) {
    e.preventDefault()
    if (!r) return
    let amountCents: number
    try {
      amountCents = Number(centsFromDecimal(amount.trim()))
    } catch {
      return setProblem(t('returnWork.costs.amountInvalid'))
    }
    if (amountCents <= 0) return setProblem(t('returnWork.costs.amountInvalid'))
    const res = await send(`/staff/return-work/${r.id}/costs`, { kind, amountCents, note: note.trim() })
    if (!res.ok) return setProblem(returnWorkError(t, res.error))
    setProblem(null)
    setAmount('')
    setNote('')
    onDone()
  }
  async function voidCost(k: Cost) {
    const res = await send(`/staff/return-work-costs/${k.id}/actions/void`, { reason: (reasons[k.id] ?? '').trim() })
    if (!res.ok) return setProblem(returnWorkError(t, res.error))
    setProblem(null)
    onDone()
  }
  return (
    <Sub title={t('returnWork.costs.title')} testId="return-work-costs">
      <p data-testid="return-work-totals">
        {t('returnWork.costs.total', { amount: usd(r.totals.costCents) })} ·{' '}
        {t('returnWork.costs.labor', { minutes: r.totals.laborMinutes })}
      </p>
      <p className="staff-request__hint">{t('returnWork.costs.laborIncomplete')}</p>
      <ul className="staff-request__list">
        {r.costs.map((k) => (
          <li key={k.id}>
            {codeLabel(t, 'returnWorkCostKind', k.kind)} · {usd(k.amountCents)} · {k.note}{' '}
            <span className="staff-request__hint">
              {t('cases.byAt', { name: nameOf(t, k.recordedBy), time: when(k.recordedAt) })}
            </span>
            {k.voided ? (
              <p className="staff-request__hint">{t('returnWork.costs.voided', { reason: k.voided.reason ?? '' })}</p>
            ) : null}
            {k.actions.void ? (
              <div className="hh-button-row">
                <Field
                  label={t('returnWork.costs.voidReason')}
                  name={`voidReason-${k.id}`}
                  value={reasons[k.id] ?? ''}
                  onChange={(e) => setReasons({ ...reasons, [k.id]: e.target.value })}
                />
                <Button variant="secondary" onClick={() => void voidCost(k)}>
                  {t('returnWork.costs.void')}
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {view.actions.addCost ? (
        <form className="staff-loadout__form" onSubmit={(e) => void add(e)} aria-label={t('returnWork.costs.add')}>
          <Select
            label={t('returnWork.costs.kind')}
            name="returnCostKind"
            value={kind}
            onChange={setKind}
            options={COST_KINDS.map((c) => ({ value: c, label: codeLabel(t, 'returnWorkCostKind', c) }))}
          />
          <Field
            label={t('returnWork.costs.amount')}
            name="returnCostAmount"
            inputMode="decimal"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <Field
            label={t('returnWork.costs.note')}
            name="returnCostNote"
            required
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button type="submit" variant="secondary">
            {t('returnWork.costs.add')}
          </Button>
        </form>
      ) : null}
      <Problem text={problem} />
    </Sub>
  )
}

/** The return work of a case, on the case page (those who see the case detail). */
export function ReturnWorkSection({
  t,
  locale,
  fetchImpl,
  caseId,
  href,
  onChanged,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  caseId: string
  href: (path: string) => string
  onChanged?: () => void
}) {
  const [view, setView] = useState<ReturnWorkView | null>(null)
  const [phase, setPhase] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  const when = whenOf(locale)
  const load = useCallback(async () => {
    const r = await call<ReturnWorkView>(fetchImpl, `/staff/cases/${encodeURIComponent(caseId)}/return-work`)
    setView(r.ok ? r.data : null)
    setPhase(r.ok ? 'ready' : 'unavailable')
  }, [fetchImpl, caseId])
  useEffect(() => {
    void load()
  }, [load])
  const done = () => {
    void load()
    onChanged?.()
  }
  const id = useId()
  if (phase === 'loading') return <StateView kind="loading" title={t('returnWork.loading')} />
  if (phase === 'unavailable' || !view) return null
  const r = view.returnWork
  return (
    <section className="staff-request__section" aria-labelledby={id} data-testid="return-work">
      <h2 id={id} className="staff-queue__heading">
        {t('returnWork.title')}
      </h2>
      <Window t={t} view={view} />
      {view.originalJob ? (
        <p className="staff-request__hint" data-testid="return-work-original">
          {t('returnWork.original', {
            reference: view.originalJob.projectReference,
            state: codeLabel(t, 'jobState', view.originalJob.state),
          })}
        </p>
      ) : null}
      {r ? (
        <dl className="staff-system__fields">
          <div>
            <dt>{t('returnWork.classify.class')}</dt>
            <dd data-testid="return-work-class">{codeLabel(t, 'returnWorkClass', r.classification)}</dd>
          </div>
          {r.classificationNote ? (
            <div>
              <dt>{t('returnWork.classify.note')}</dt>
              <dd>{r.classificationNote}</dd>
            </div>
          ) : null}
          <div>
            <dt>{t('returnWork.decide.title')}</dt>
            <dd data-testid="return-work-decision">
              {r.decision
                ? `${codeLabel(t, 'returnWorkCoverage', r.decision.coverage)} · ${codeLabel(t, 'returnWorkPrice', r.decision.price)} · ${r.decision.note ?? ''} (${t('cases.byAt', { name: nameOf(t, r.decision.decidedBy), time: when(r.decision.decidedAt) })})`
                : t('returnWork.decide.none')}
            </dd>
          </div>
          {r.returnJob ? (
            <div>
              <dt>{t('returnWork.returnJob')}</dt>
              <dd>
                {r.returnJob.projectReference} · {codeLabel(t, 'jobState', r.returnJob.state)}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : (
        <p>{t('returnWork.none')}</p>
      )}
      <p className="staff-request__hint">{t('returnWork.noAutomaticCoverage')}</p>
      {view.actions.classify ? (
        <Classify key={r?.version ?? 0} t={t} fetchImpl={fetchImpl} view={view} onDone={done} />
      ) : null}
      {view.actions.decide ? (
        <Decide key={`d-${r?.version ?? 0}`} t={t} fetchImpl={fetchImpl} view={view} onDone={done} />
      ) : null}
      {r ? (
        <>
          <Sub title={t('returnWork.visits.title')} testId="return-work-visits">
            <p className="staff-request__hint">{t('returnWork.visits.hint')}</p>
            {r.visits.length === 0 ? <p>{t('returnWork.visits.none')}</p> : null}
            <ul className="staff-request__list">
              {r.visits.map((v) => (
                <li key={v.visitId}>
                  <a href={href(`/schedule/${v.visitId}`)}>
                    {t('returnWork.visits.line', {
                      number: v.number,
                      date: v.localDate ?? '',
                      start: v.windowStart,
                      end: v.windowEnd,
                    })}
                  </a>{' '}
                  <StatusBadge tone="neutral">{codeLabel(t, 'visitState', v.state)}</StatusBadge>
                </li>
              ))}
            </ul>
            {view.actions.planVisit ? <PlanVisit t={t} fetchImpl={fetchImpl} id={r.id} onDone={done} /> : null}
          </Sub>
          <Items key={`i-${r.version}-${r.items.length}`} t={t} fetchImpl={fetchImpl} view={view} onDone={done} />
          <Costs key={`c-${r.costs.length}`} t={t} locale={locale} fetchImpl={fetchImpl} view={view} onDone={done} />
          <Sub title={t('returnWork.history')}>
            <ol className="staff-request__list">
              {r.history.map((h, n) => (
                <li key={n}>
                  {codeLabel(t, 'returnWorkEvent', h.event)} ·{' '}
                  {t('cases.byAt', { name: nameOf(t, h.actor), time: when(h.at) })}
                  {h.note ? <p className="staff-request__note">{h.note}</p> : null}
                </li>
              ))}
            </ol>
          </Sub>
        </>
      ) : null}
    </section>
  )
}

type OwnItem = {
  id: string
  workPackageId: string | null
  area: string | null
  description: string
  requiredEvidence: string
  dueOn: string | null
  state: string
  correctionNote: string | null
  version: number
  actions: { correct: boolean }
}

/** The worker's own return-visit punch items on a job, with the correction once their return visit started. */
export function ReturnWorkItems({ t, fetchImpl, jobId }: { t: T; fetchImpl: Fetch; jobId: string }) {
  const send = useSend(fetchImpl)
  const [items, setItems] = useState<OwnItem[]>([])
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [problem, setProblem] = useState<string | null>(null)
  const id = useId()
  const load = useCallback(async () => {
    const r = await call<{ items: OwnItem[] }>(fetchImpl, `/staff/jobs/${encodeURIComponent(jobId)}/return-work-items`)
    setItems(r.ok ? r.data.items : [])
  }, [fetchImpl, jobId])
  useEffect(() => {
    void load()
  }, [load])
  if (items.length === 0) return null
  async function correct(i: OwnItem) {
    const r = await send(
      `/staff/return-work-items/${i.id}/actions/correct`,
      { note: (notes[i.id] ?? '').trim() },
      { version: i.version },
    )
    if (!r.ok) return setProblem(returnWorkError(t, r.error))
    setProblem(null)
    await load()
  }
  return (
    <section aria-labelledby={id} data-testid="return-work-own-items">
      <h2 id={id} className="staff-myday__sub">
        {t('returnWork.own.title')}
      </h2>
      <ul className="staff-request__list">
        {items.map((i) => (
          <li key={i.id} className="staff-request__decision">
            <p>
              {i.description}{' '}
              <StatusBadge tone={i.state === 'open' ? 'warning' : 'neutral'}>
                {codeLabel(t, 'punchState', i.state)}
              </StatusBadge>
            </p>
            <p className="staff-request__hint">
              {[i.area, t('returnWork.items.evidence', { evidence: i.requiredEvidence }), i.dueOn]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {i.state === 'open' && !i.actions.correct ? (
              <p className="staff-request__hint">{t('returnWork.own.startFirst')}</p>
            ) : null}
            {i.actions.correct ? (
              <div className="hh-button-row">
                <Field
                  label={t('returnWork.own.note')}
                  name={`correctionNote-${i.id}`}
                  value={notes[i.id] ?? ''}
                  onChange={(e) => setNotes({ ...notes, [i.id]: e.target.value })}
                />
                <Button variant="secondary" onClick={() => void correct(i)}>
                  {t('returnWork.own.correct')}
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <Problem text={problem} />
    </section>
  )
}
