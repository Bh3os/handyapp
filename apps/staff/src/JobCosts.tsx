// A job's estimated versus actual costs (TSK-0095; HH-FIN-17, HH-DATA-10, HH-QA-08, T73, OWN-DEC-69, OWN-DEC-189,
// RULE-MONEY-CENTS, RULE-NO-INVENTED-FACTS). The page /job-costs/<job>, from the job's closeout, for the Owner.
// - Every cost line of OWN-DEC-189 with its estimated and actual figure as the server computed it. A figure always
//   says what it is: a final amount, the part known so far (incomplete), not recorded, not estimated or not
//   configured. Missing cost is never shown as $0.00; the only $0.00 is a category the Owner confirmed holds nothing.
//   A variance is shown only between two final figures.
// - Labor is the elapsed Arrived-to-Finished time per worker; its cost and the burden need rates that are NOT
//   CONFIGURED, so the actual total stays incomplete. No margin is shown (TSK-0131).
// - The Owner records cost entries in cents, voids one entered in error with a reason, confirms that a category holds
//   every cost and reopens it with a reason. Every control is one the server offered (`actions`); the server checks
//   it again.
// - Return-work costs are shown apart; the report states its sources.
import type { StaffKey, StaffLocale } from '@handyhub/i18n'
import { cents, centsFromDecimal, formatUsd } from '@handyhub/money'
import { Button, Field, StateView, StatusBadge } from '@handyhub/ui'
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react'
import { call, idempotencyKey, type ApiErrorBody, type Fetch } from './api'
import { codeLabel } from './Requests'

type T = (key: StaffKey, values?: Record<string, string | number>) => string
type StaffRef = { id: string; name: string | null }

/** The categories a cost entry may have (the server's list, @handyhub/domain JOB_COST_CATEGORIES). */
const CATEGORIES = ['materials', 'purchase', 'subcontractor', 'rental', 'disposal', 'other'] as const

type FigureState = 'complete' | 'incomplete' | 'not_recorded' | 'not_estimated' | 'not_configured'
export type Figure = { state: FigureState; cents: number | null }

export type JobCostsData = {
  jobId: string
  projectReference: string
  jobState: string
  estimate: { number: string | null; version: number | null } | null
  changeOrders: number
  lines: {
    line: string
    estimated: Figure
    actual: Figure
    varianceCents: number | null
    confirmed: { by: StaffRef | null; at: string | null } | null
    actions: { confirm: boolean; reopen: boolean }
  }[]
  totals: { estimated: Figure; actual: Figure; varianceCents: number | null; incompleteLines: string[] }
  labor: {
    minutes: number
    minutesComplete: boolean
    unknownTimes: number
    times: {
      visitId: string
      visitNumber: number
      localDate: string
      staffUserId: string
      name: string | null
      minutes: number | null
      flagged: boolean
    }[]
  }
  entries: {
    id: string
    category: string
    amountCents: number
    incurredOn: string
    note: string
    recordedBy: StaffRef | null
    recordedAt: string | null
    voided: { reason: string | null; by: StaffRef | null; at: string | null } | null
    actions: { void: boolean }
  }[]
  returnWork: { cost: Figure; entries: number; caseIds: string[] }
  history: {
    event: string
    category: string
    costId: string | null
    actor: StaffRef | null
    note: string | null
    at: string | null
  }[]
  report: { id: string; basis: string; unknown: string }
  actions: { record: boolean }
}

const usd = (c: number) => formatUsd(cents(c))
const bcp47 = (locale: StaffLocale) => (locale === 'es' ? 'es-US' : 'en-US')
const nameOf = (t: T, r: StaffRef | null) => (r ? (r.name ?? t('jobCosts.someone')) : t('jobCosts.someone'))

/** A figure in words: never a bare $0.00 for something not known. */
export function figureText(t: T, f: Figure): string {
  if (f.state === 'complete' && f.cents !== null) return usd(f.cents)
  if (f.state === 'incomplete' && f.cents !== null) return t('jobCosts.figure.incomplete', { amount: usd(f.cents) })
  return codeLabel(t, 'jobCostFigure', f.state)
}
const tone = (f: Figure) => (f.state === 'complete' ? 'success' : f.state === 'incomplete' ? 'warning' : 'neutral')

/** The local date today, as the date field's default (the server checks it again in the business time zone). */
function todayText(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** A refusal in words: the job-cost codes, else the error code. */
export function jobCostError(t: T, e: ApiErrorBody): string {
  const own = e.fieldErrors
    .map((f) => codeLabel(t, 'jobCostCode', f.code))
    .filter((l, i) => l !== e.fieldErrors[i]?.code)
  if (own.length) return own.join(' ')
  try {
    return t(`error.${e.code}` as StaffKey)
  } catch {
    return t('error.INTERNAL')
  }
}

export function JobCostsPage({
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
  const [view, setView] = useState<JobCostsData | null | undefined>(undefined)
  const [refused, setRefused] = useState<ApiErrorBody | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [category, setCategory] = useState<string>('materials')
  const [amount, setAmount] = useState('')
  const [incurredOn, setIncurredOn] = useState(todayText)
  const [note, setNote] = useState('')
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const base = `/staff/jobs/${encodeURIComponent(jobId)}`
  const when = (iso: string | null) =>
    iso ? new Intl.DateTimeFormat(bcp47(locale), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)) : ''

  const load = useCallback(async () => {
    const r = await call<JobCostsData>(fetchImpl, `${base}/costs`)
    if (r.ok && Array.isArray(r.data?.lines)) setView(r.data)
    else {
      setRefused(r.ok ? null : r.error)
      setView(null)
    }
  }, [fetchImpl, base])
  useEffect(() => {
    void load()
  }, [load])

  async function send(path: string, body: unknown): Promise<boolean> {
    const r = await call<JobCostsData>(fetchImpl, path, {
      method: 'POST',
      body,
      headers: { 'idempotency-key': idempotencyKey() },
    })
    if (!r.ok) {
      setProblem(jobCostError(t, r.error))
      return false
    }
    setProblem(null)
    setView(r.data)
    return true
  }

  async function add(e: FormEvent) {
    e.preventDefault()
    let amountCents: number
    try {
      amountCents = Number(centsFromDecimal(amount.trim()))
    } catch {
      return setProblem(t('jobCosts.add.amountInvalid'))
    }
    if (amountCents <= 0) return setProblem(t('jobCosts.add.amountInvalid'))
    if (await send(`${base}/costs`, { category, amountCents, incurredOn, note: note.trim() })) {
      setAmount('')
      setNote('')
    }
  }

  if (view === undefined) return <StateView kind="loading" title={t('common.loading')} />
  if (!view)
    return (
      <StateView kind="blocked" title={refused?.code === 'NOT_FOUND' ? t('error.NOT_FOUND') : t('jobCosts.refused')} />
    )
  const lineName = (l: string) => codeLabel(t, 'jobCostLine', l)

  return (
    <section className="staff-screen staff-request" aria-labelledby={`${ids}-title`} data-testid="job-costs">
      <h1 id={`${ids}-title`} className="hh-h3">
        {t('jobCosts.title', { reference: view.projectReference })}
      </h1>
      <p>
        <StatusBadge tone="neutral">{codeLabel(t, 'jobState', view.jobState)}</StatusBadge>{' '}
        <a href={href(`/closeout/${view.jobId}`)}>{t('jobCosts.openCloseout')}</a>
      </p>
      {/* HH-DATA-10: the report states what it shows and from which records. */}
      <p className="staff-request__hint" data-testid="job-costs-sources">
        {t('jobCosts.sources')}
      </p>
      <p className="staff-request__hint">{t('jobCosts.neverZero')}</p>
      {view.estimate ? (
        <p>{t('jobCosts.estimateFrom', { number: view.estimate.number ?? '', version: view.estimate.version ?? 1 })}</p>
      ) : (
        <p>{t('jobCosts.noEstimate')}</p>
      )}
      {view.changeOrders > 0 ? (
        <p className="staff-request__hint">{t('jobCosts.changeOrders', { count: view.changeOrders })}</p>
      ) : null}

      <div className="staff-job-costs__wrap">
        <table className="staff-invoice__lines" data-testid="job-costs-table">
          <caption className="staff-request__hint">{t('jobCosts.tableCaption')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('jobCosts.col.line')}</th>
              <th scope="col">{t('jobCosts.col.estimated')}</th>
              <th scope="col">{t('jobCosts.col.actual')}</th>
              <th scope="col">{t('jobCosts.col.variance')}</th>
            </tr>
          </thead>
          <tbody>
            {view.lines.map((l) => (
              <tr key={l.line} data-line={l.line} data-testid={`job-cost-line-${l.line}`}>
                <th scope="row">{lineName(l.line)}</th>
                <td>{figureText(t, l.estimated)}</td>
                <td>
                  <StatusBadge tone={tone(l.actual)}>{figureText(t, l.actual)}</StatusBadge>
                  {l.confirmed ? (
                    <span className="staff-request__hint">
                      {' '}
                      {t('jobCosts.confirmedBy', { name: nameOf(t, l.confirmed.by), time: when(l.confirmed.at) })}
                    </span>
                  ) : null}
                </td>
                <td>{l.varianceCents === null ? t('jobCosts.noVariance') : usd(l.varianceCents)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr data-testid="job-cost-total">
              <th scope="row">{t('jobCosts.total')}</th>
              <td>{figureText(t, view.totals.estimated)}</td>
              <td>
                <StatusBadge tone={tone(view.totals.actual)}>{figureText(t, view.totals.actual)}</StatusBadge>
              </td>
              <td>{view.totals.varianceCents === null ? t('jobCosts.noVariance') : usd(view.totals.varianceCents)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {view.totals.incompleteLines.length ? (
        <p data-testid="job-costs-incomplete">
          {t('jobCosts.incompleteLines', { lines: view.totals.incompleteLines.map(lineName).join(', ') })}
        </p>
      ) : null}
      <p className="staff-request__hint">{t('jobCosts.laborNotConfigured')}</p>

      <section className="staff-request__section" aria-labelledby={`${ids}-labor`} data-testid="job-costs-labor">
        <h2 id={`${ids}-labor`} className="staff-queue__heading">
          {t('jobCosts.labor.title')}
        </h2>
        <p>
          {t(view.labor.minutesComplete ? 'jobCosts.labor.minutes' : 'jobCosts.labor.minutesIncomplete', {
            minutes: view.labor.minutes,
            unknown: view.labor.unknownTimes,
          })}
        </p>
        {view.labor.times.length === 0 ? <p>{t('jobCosts.labor.none')}</p> : null}
        <ul className="staff-request__list">
          {view.labor.times.map((w) => (
            <li key={`${w.visitId}-${w.staffUserId}`}>
              <a href={href(`/visit-times/${w.visitId}`)}>
                {t('jobCosts.labor.visit', { number: w.visitNumber, date: w.localDate })}
              </a>{' '}
              · {w.name ?? t('jobCosts.someone')} ·{' '}
              {w.minutes === null ? (
                <StatusBadge tone="warning">
                  {t(w.flagged ? 'jobCosts.labor.missing' : 'jobCosts.labor.notFinished')}
                </StatusBadge>
              ) : (
                t('jobCosts.labor.workerMinutes', { minutes: w.minutes })
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="staff-request__section" aria-labelledby={`${ids}-entries`} data-testid="job-costs-entries">
        <h2 id={`${ids}-entries`} className="staff-queue__heading">
          {t('jobCosts.entries.title')}
        </h2>
        {view.entries.length === 0 ? <p>{t('jobCosts.entries.none')}</p> : null}
        <ul className="staff-request__list">
          {view.entries.map((k) => (
            <li key={k.id} data-testid="job-cost-entry">
              {codeLabel(t, 'jobCostLine', k.category)} · {usd(k.amountCents)} · {k.incurredOn} · {k.note}{' '}
              <span className="staff-request__hint">
                {t('jobCosts.byAt', { name: nameOf(t, k.recordedBy), time: when(k.recordedAt) })}
              </span>
              {k.voided ? (
                <p className="staff-request__hint">{t('jobCosts.entries.voided', { reason: k.voided.reason ?? '' })}</p>
              ) : null}
              {k.actions.void ? (
                <div className="hh-button-row">
                  <Field
                    label={t('jobCosts.entries.voidReason')}
                    name={`voidReason-${k.id}`}
                    value={reasons[k.id] ?? ''}
                    onChange={(e) => setReasons({ ...reasons, [k.id]: e.target.value })}
                  />
                  <Button
                    variant="secondary"
                    onClick={() =>
                      void send(`/staff/job-costs/${k.id}/actions/void`, { reason: (reasons[k.id] ?? '').trim() })
                    }
                  >
                    {t('jobCosts.entries.void')}
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        {view.actions.record ? (
          <form className="staff-loadout__form" onSubmit={(e) => void add(e)} aria-label={t('jobCosts.add.title')}>
            <CategorySelect t={t} value={category} onChange={setCategory} />
            <Field
              label={t('jobCosts.add.amount')}
              name="jobCostAmount"
              inputMode="decimal"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <Field
              label={t('jobCosts.add.incurredOn')}
              name="jobCostDate"
              type="date"
              required
              value={incurredOn}
              onChange={(e) => setIncurredOn(e.target.value)}
            />
            <Field
              label={t('jobCosts.add.note')}
              name="jobCostNote"
              required
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <Button type="submit" variant="secondary">
              {t('jobCosts.add.submit')}
            </Button>
          </form>
        ) : null}
      </section>

      {view.actions.record ? (
        <section className="staff-request__section" aria-labelledby={`${ids}-confirm`} data-testid="job-costs-confirm">
          <h2 id={`${ids}-confirm`} className="staff-queue__heading">
            {t('jobCosts.confirm.title')}
          </h2>
          <p className="staff-request__hint">{t('jobCosts.confirm.hint')}</p>
          <ul className="staff-request__list">
            {view.lines
              .filter((l) => l.actions.confirm || l.actions.reopen)
              .map((l) => (
                <li key={l.line}>
                  {lineName(l.line)}{' '}
                  {l.actions.confirm ? (
                    <Button
                      variant="secondary"
                      onClick={() => void send(`${base}/cost-categories/${l.line}/actions/confirm`, {})}
                    >
                      {t('jobCosts.confirm.button', { line: lineName(l.line) })}
                    </Button>
                  ) : (
                    <span className="hh-button-row">
                      <Field
                        label={t('jobCosts.confirm.reopenReason', { line: lineName(l.line) })}
                        name={`reopenReason-${l.line}`}
                        value={reasons[`reopen-${l.line}`] ?? ''}
                        onChange={(e) => setReasons({ ...reasons, [`reopen-${l.line}`]: e.target.value })}
                      />
                      <Button
                        variant="secondary"
                        onClick={() =>
                          void send(`${base}/cost-categories/${l.line}/actions/reopen`, {
                            reason: (reasons[`reopen-${l.line}`] ?? '').trim(),
                          })
                        }
                      >
                        {t('jobCosts.confirm.reopen', { line: lineName(l.line) })}
                      </Button>
                    </span>
                  )}
                </li>
              ))}
          </ul>
        </section>
      ) : null}
      {problem ? (
        <p role="alert" className="hh-field__error">
          {problem}
        </p>
      ) : null}

      <section className="staff-request__section" aria-labelledby={`${ids}-return`} data-testid="job-costs-return-work">
        <h2 id={`${ids}-return`} className="staff-queue__heading">
          {t('jobCosts.returnWork.title')}
        </h2>
        <p>{figureText(t, view.returnWork.cost)}</p>
        <p className="staff-request__hint">{t('jobCosts.returnWork.hint')}</p>
        <ul className="staff-request__list">
          {view.returnWork.caseIds.map((c, n) => (
            <li key={c}>
              <a href={href(`/cases/${c}`)}>{t('jobCosts.returnWork.case', { n: n + 1 })}</a>
            </li>
          ))}
        </ul>
      </section>

      <section className="staff-request__section" aria-labelledby={`${ids}-history`}>
        <h2 id={`${ids}-history`} className="staff-queue__heading">
          {t('jobCosts.history')}
        </h2>
        {view.history.length === 0 ? <p>{t('jobCosts.historyNone')}</p> : null}
        <ol className="staff-request__list">
          {view.history.map((h, n) => (
            <li key={n}>
              {codeLabel(t, 'jobCostEvent', h.event)} · {lineName(h.category)} ·{' '}
              {t('jobCosts.byAt', { name: nameOf(t, h.actor), time: when(h.at) })}
              {h.note ? <p className="staff-request__note">{h.note}</p> : null}
            </li>
          ))}
        </ol>
      </section>
    </section>
  )
}

function CategorySelect({ t, value, onChange }: { t: T; value: string; onChange: (v: string) => void }) {
  const id = useId()
  return (
    <div className="hh-field">
      <label className="hh-field__label" htmlFor={id}>
        {t('jobCosts.add.category')}
      </label>
      <select
        id={id}
        className="hh-field__control"
        name="jobCostCategory"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {codeLabel(t, 'jobCostLine', c)}
          </option>
        ))}
      </select>
    </div>
  )
}
