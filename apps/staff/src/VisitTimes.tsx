// Arrived and Finished per worker, the Owner's corrections and the accountant's CSV (TSK-0070; HH-WORK-06, T47,
// OWN-DEC-69, RULE-HUMAN-REVIEW, RULE-NO-INVENTED-FACTS).
// - Each worker's own Arrived and Finished on one visit: recorded (the server's time), corrected (the value in force,
//   with the recorded value and every correction's reason kept beside it), not due yet, or missing (flagged; no
//   duration is made up). The duration shows only when both values exist.
// - The Owner corrects a forgotten or wrong value with a reason; the server refuses a future time or Finished before
//   Arrived. The export saves the CSV for the accountant (times only: nothing here computes pay, overtime or
//   deductions; payroll stays outside the software).
import type { StaffKey, StaffLocale } from '@handyhub/i18n'
import { Button, Field, ScrollArea, StateView, StatusBadge } from '@handyhub/ui'
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { call, idempotencyKey, type Fetch } from './api'
import { codeLabel } from './Requests'

type T = (key: StaffKey, values?: Record<string, string | number>) => string

type Stamp = {
  status: 'recorded' | 'corrected' | 'pending' | 'missing'
  at: string | null
  recordedAt: string | null
  deviceRecordedAt: string | null
  corrections: {
    correctedAt: string
    previousAt: string | null
    reason: string
    correctedBy: string | null
    createdAt: string
  }[]
}
export type VisitTimesView = {
  visitId: string
  number: number
  purpose: string
  state: string
  version: number
  projectReference: string
  window: { localDate: string; start: string; end: string; timeZone: string; startsAt: string; endsAt: string }
  dayEnded: boolean
  workers: {
    staffUserId: string
    name: string | null
    role: string | null
    assigned: boolean
    departedAt: string | null
    arrived: Stamp
    finished: Stamp
    durationMinutes: number | null
    flagged: boolean
  }[]
  actions: { correct: boolean; export: boolean }
}

const bcp47 = (locale: StaffLocale) => (locale === 'es' ? 'es-US' : 'en-US')
/** The refusals the server names for a correction or an export. */
const ERROR: Readonly<Record<string, StaffKey>> = {
  IN_FUTURE: 'times.error.IN_FUTURE',
  FINISHED_BEFORE_ARRIVED: 'times.error.FINISHED_BEFORE_ARRIVED',
  UNCHANGED: 'times.error.UNCHANGED',
  VISIT_NOT_STARTED: 'times.error.VISIT_NOT_STARTED',
  RANGE_TOO_LONG: 'times.error.RANGE_TOO_LONG',
  RANGE_INVALID: 'times.error.RANGE_INVALID',
}
const TONE = { recorded: 'neutral', corrected: 'info', pending: 'neutral', missing: 'danger' } as const

function at(iso: string | null, zone: string, locale: StaffLocale) {
  return iso
    ? new Intl.DateTimeFormat(bcp47(locale), { timeZone: zone, dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(iso),
      )
    : null
}

export function VisitTimesPage({
  t,
  locale,
  fetchImpl,
  visitId,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  visitId: string
}) {
  const ids = useId()
  const [view, setView] = useState<VisitTimesView | null | 'forbidden' | undefined>(undefined)
  const load = useCallback(async () => {
    const r = await call<VisitTimesView>(fetchImpl, `/staff/visits/${encodeURIComponent(visitId)}/timestamps`)
    setView(r.ok ? r.data : r.status === 403 ? 'forbidden' : null)
  }, [fetchImpl, visitId])
  useEffect(() => {
    void load()
  }, [load])
  if (view === undefined) return <StateView kind="loading" title={t('times.loading')} />
  if (view === 'forbidden') return <StateView kind="blocked" title={t('times.forbidden')} />
  if (view === null) return <StateView kind="error" title={t('times.failed')} />
  const zone = view.window.timeZone
  const value = (s: Stamp) => at(s.at, zone, locale) ?? t('times.none')
  return (
    <section className="staff-screen" aria-labelledby={`${ids}-title`} data-testid="visit-times">
      <h1 id={`${ids}-title`} className="hh-h3">
        {t('times.title', { reference: view.projectReference, number: view.number })}
      </h1>
      <p>
        {codeLabel(t, 'visitPurpose', view.purpose)} · {codeLabel(t, 'visitState', view.state)} ·{' '}
        {t('myday.window', { date: view.window.localDate, start: view.window.start, end: view.window.end, zone })}
      </p>
      <p className="staff-request__hint">{t('times.hint')}</p>
      {view.workers.length === 0 ? (
        <StateView kind="empty" title={t('times.noWorkers')} />
      ) : (
        <ScrollArea className="staff-times" label={t('times.caption')}>
          <table data-testid="visit-times-table">
            <caption className="hh-visually-hidden">{t('times.caption')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('times.worker')}</th>
                <th scope="col">{t('times.arrived')}</th>
                <th scope="col">{t('times.finished')}</th>
                <th scope="col">{t('times.duration')}</th>
              </tr>
            </thead>
            <tbody>
              {view.workers.map((w) => (
                <tr key={w.staffUserId} data-testid="visit-times-row">
                  <th scope="row">
                    {w.name ?? t('queue.unnamed')}
                    {w.flagged ? (
                      <>
                        {' '}
                        <StatusBadge tone="danger">{t('times.flagged')}</StatusBadge>
                      </>
                    ) : null}
                    {!w.assigned ? <p className="staff-request__hint">{t('times.noLongerAssigned')}</p> : null}
                  </th>
                  {([w.arrived, w.finished] as const).map((s, i) => (
                    <td key={i}>
                      <StatusBadge tone={TONE[s.status]}>{codeLabel(t, 'stampStatus', s.status)}</StatusBadge>{' '}
                      {value(s)}
                      {s.status === 'corrected' ? (
                        <p className="staff-request__hint">
                          {t('times.recordedValue', { value: at(s.recordedAt, zone, locale) ?? t('times.none') })}
                        </p>
                      ) : null}
                      {s.corrections.length > 0 ? (
                        <ul className="staff-request__hint">
                          {s.corrections.map((c) => (
                            <li key={c.createdAt}>
                              {t('times.correction', {
                                from: at(c.previousAt, zone, locale) ?? t('times.none'),
                                to: at(c.correctedAt, zone, locale) ?? '',
                                who: c.correctedBy ?? t('queue.unnamed'),
                                reason: c.reason,
                              })}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </td>
                  ))}
                  <td>
                    {w.durationMinutes === null ? t('times.noDuration') : t('times.minutes', { n: w.durationMinutes })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      )}
      {view.actions.correct && view.workers.length > 0 ? (
        <CorrectionForm t={t} fetchImpl={fetchImpl} view={view} onSaved={setView} />
      ) : null}
      {view.actions.export ? <TimesExport t={t} fetchImpl={fetchImpl} date={view.window.localDate} /> : null}
    </section>
  )
}

function CorrectionForm({
  t,
  fetchImpl,
  view,
  onSaved,
}: {
  t: T
  fetchImpl: Fetch
  view: VisitTimesView
  onSaved: (v: VisitTimesView) => void
}) {
  const ids = useId()
  const [worker, setWorker] = useState(view.workers[0]?.staffUserId ?? '')
  const [kind, setKind] = useState<'arrived' | 'finished'>('finished')
  const [when, setWhen] = useState('')
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [problem, setProblem] = useState<StaffKey | null>(null)
  const [saved, setSaved] = useState(false)
  const key = useRef<string | null>(null)
  async function submit(e: FormEvent) {
    e.preventDefault()
    setProblem(null)
    setSaved(false)
    const moment = new Date(when)
    if (!when || Number.isNaN(moment.getTime())) return setProblem('times.error.time')
    if (!reason.trim()) return setProblem('times.error.reason')
    setPending(true)
    key.current = key.current ?? idempotencyKey()
    const r = await call<VisitTimesView>(
      fetchImpl,
      `/staff/visits/${encodeURIComponent(view.visitId)}/timestamps/corrections`,
      {
        method: 'POST',
        headers: { 'idempotency-key': key.current },
        body: { staffUserId: worker, kind, at: moment.toISOString(), reason: reason.trim() },
      },
    )
    setPending(false)
    if (r.ok || r.status > 0) key.current = null
    if (r.ok) {
      setSaved(true)
      setReason('')
      return onSaved(r.data)
    }
    const code = r.error.fieldErrors[0]?.code
    setProblem((code ? ERROR[code] : undefined) ?? 'times.error.failed')
  }
  return (
    <form className="staff-request__section" aria-labelledby={`${ids}-h`} onSubmit={(e) => void submit(e)} noValidate>
      <h2 id={`${ids}-h`} className="staff-queue__heading">
        {t('times.correctTitle')}
      </h2>
      <p className="staff-request__hint">{t('times.correctHint', { zone: view.window.timeZone })}</p>
      <div className="staff-queue__select">
        <label htmlFor={`${ids}-worker`}>{t('times.worker')}</label>
        <select id={`${ids}-worker`} value={worker} onChange={(e) => setWorker(e.target.value)}>
          {view.workers.map((w) => (
            <option key={w.staffUserId} value={w.staffUserId}>
              {w.name ?? t('queue.unnamed')}
            </option>
          ))}
        </select>
      </div>
      <div className="staff-queue__select">
        <label htmlFor={`${ids}-kind`}>{t('times.which')}</label>
        <select id={`${ids}-kind`} value={kind} onChange={(e) => setKind(e.target.value as 'arrived' | 'finished')}>
          <option value="arrived">{t('times.arrived')}</option>
          <option value="finished">{t('times.finished')}</option>
        </select>
      </div>
      <Field label={t('times.when')} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
      <Field
        label={t('times.reason')}
        multiline
        maxLength={500}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      {problem ? (
        <p role="alert" className="hh-field__error">
          {t(problem)}
        </p>
      ) : null}
      {saved ? <p role="status">{t('times.saved')}</p> : null}
      <Button type="submit" pending={pending}>
        {t('times.correct')}
      </Button>
    </form>
  )
}

/** The accountant's CSV for a range of visit dates, saved as a file; audited by the server with its reason. */
function TimesExport({ t, fetchImpl, date }: { t: T; fetchImpl: Fetch; date: string }) {
  const ids = useId()
  const [from, setFrom] = useState(date)
  const [to, setTo] = useState(date)
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [problem, setProblem] = useState<StaffKey | null>(null)
  const [done, setDone] = useState<number | null>(null)
  async function submit(e: FormEvent) {
    e.preventDefault()
    setProblem(null)
    setDone(null)
    if (!reason.trim()) return setProblem('times.error.reason')
    setPending(true)
    const r = await call<{ filename: string; contentType: string; rows: number; csv: string }>(
      fetchImpl,
      '/staff/timestamps/exports',
      { method: 'POST', body: { from, to, reason: reason.trim() } },
    )
    setPending(false)
    if (!r.ok) {
      const code = r.error.fieldErrors[0]?.code
      return setProblem(
        r.error.code === 'FRESH_AUTH_REQUIRED'
          ? 'times.error.fresh'
          : ((code ? ERROR[code] : undefined) ?? 'times.error.failed'),
      )
    }
    const url = URL.createObjectURL(new Blob([r.data.csv], { type: `${r.data.contentType};charset=utf-8` }))
    const a = document.createElement('a')
    a.href = url
    a.download = r.data.filename
    document.body.append(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    setDone(r.data.rows)
  }
  return (
    <form className="staff-request__section" aria-labelledby={`${ids}-h`} onSubmit={(e) => void submit(e)} noValidate>
      <h2 id={`${ids}-h`} className="staff-queue__heading">
        {t('times.exportTitle')}
      </h2>
      <p className="staff-request__hint">{t('times.exportHint')}</p>
      <Field label={t('times.from')} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
      <Field label={t('times.to')} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      <Field
        label={t('times.exportReason')}
        maxLength={500}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      {problem ? (
        <p role="alert" className="hh-field__error">
          {t(problem)}
        </p>
      ) : null}
      {done !== null ? <p role="status">{t('times.exported', { n: done })}</p> : null}
      <Button type="submit" variant="secondary" pending={pending}>
        {t('times.export')}
      </Button>
    </form>
  )
}
