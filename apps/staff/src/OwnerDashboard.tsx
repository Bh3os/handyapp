// The Owner Dashboard (TSK-0096; HH-FIN-18, HH-FIN-16, HH-DATA-10, S11, T64, T73, OWN-DEC-125, RULE-MONEY-CENTS,
// RULE-NO-INVENTED-FACTS). The screen /dashboard, for the Owner; the server decides who may read it and computes every
// figure from recorded data.
// - A date range (dates in the business time zone, both included) with the previous period of the same length beside
//   each figure, and the last-updated time. PROPOSED default: this month so far.
// - Each figure says what it is: its value, or "so far (incomplete)", "unavailable" or "not configured", never $0.00
//   for missing data; a money figure names its basis (invoiced, money received, pending, fees, payouts, balances,
//   costs). Figures of different bases are never added here.
// - Every figure opens its supporting records (the same records the server counted), each linking to its screen.
// - The CSV of the dashboard and the accountant's files need a recent sign-in (the password prompt appears when the
//   server asks for it); the accountant's files also need a reason. Both are saved as files and audited by the server.
import type { StaffKey, StaffLocale } from '@handyhub/i18n'
import { cents, formatUsd } from '@handyhub/money'
import { Button, Field, StateView, StatusBadge } from '@handyhub/ui'
import { useCallback, useEffect, useId, useState, type FormEvent, type MouseEvent } from 'react'
import { call, type Fetch } from './api'
import { ReauthForm, useOwnerWrite } from './OwnerWrite'
import { codeLabel } from './Requests'

type T = (key: StaffKey, values?: Record<string, string | number>) => string

type FigureState = 'known' | 'incomplete' | 'unavailable' | 'not_configured'
export type Value = { state: FigureState; value: number | null }
export type DashboardFigure = {
  id: string
  section: string
  unit: 'count' | 'cents' | 'minutes' | 'basis_points'
  scope: 'period' | 'now'
  report: { id: string; basis: string; unknown: string } | null
  detail: { id: string; name: string | null } | null
  current: Value
  previous: Value | null
}
export type DashboardData = {
  period: { from: string; to: string; days: number; previous: { from: string; to: string } }
  zone: string
  generatedAt: string
  figures: DashboardFigure[]
  accounting: Record<string, string>
}
type RecordsData = {
  figure: string
  unit: DashboardFigure['unit']
  total: number
  totalCents: number | null
  truncated: boolean
  rows: {
    id: string
    reference: string | null
    on: string | null
    state: string | null
    cents: number | null
    minutes: number | null
    link: { screen: string; id: string | null } | null
  }[]
}

const SECTIONS = ['overview', 'response', 'estimates', 'quality', 'payments', 'costs', 'cases'] as const
/** The accountant's files (the server's list, @handyhub/domain ACCOUNTING_DATASETS). */
const DATASETS = [
  'invoices',
  'payments',
  'payment_allocations',
  'refunds_credits_write_offs',
  'deposits',
  'provider_fees',
  'payouts',
  'job_costs',
  'arrived_finished',
] as const

const pad = (n: number) => String(n).padStart(2, '0')
const dateOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** The value as the screen shows it: a known amount, the part known so far, or why there is none. */
export function valueText(t: T, unit: DashboardFigure['unit'], v: Value): string {
  if (v.state === 'unavailable' || v.state === 'not_configured' || v.value === null)
    return codeLabel(t, 'dashboardFigureState', v.state)
  const text =
    unit === 'cents'
      ? formatUsd(cents(v.value))
      : unit === 'minutes'
        ? t('dashboard.value.minutes', { minutes: v.value })
        : unit === 'basis_points'
          ? t('dashboard.value.percent', { percent: (v.value / 100).toFixed(2) })
          : String(v.value)
  return v.state === 'incomplete' ? t('dashboard.value.incomplete', { value: text }) : text
}

function figureName(t: T, f: { id: string; detail: DashboardFigure['detail'] }): string {
  if (f.detail) return t('dashboard.openByAssignee', { name: f.detail.name ?? t('dashboard.someone') })
  return codeLabel(t, 'dashboardFigure', f.id)
}

function saveFile(file: { filename: string; contentType: string; csv: string }) {
  const url = URL.createObjectURL(new Blob([file.csv], { type: `${file.contentType};charset=utf-8` }))
  const a = document.createElement('a')
  a.href = url
  a.download = file.filename
  document.body.append(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

type Props = {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  go: (to: string) => void
  href: (to: string) => string
  onSession?: (s: { csrfToken: string }) => void
  /** The date the range starts from (tests); the device's today otherwise. */
  today?: Date
}

export function OwnerDashboard({ t, locale, fetchImpl, go, href, onSession, today }: Props) {
  const ids = useId()
  const now = today ?? new Date()
  const [from, setFrom] = useState(dateOf(new Date(now.getFullYear(), now.getMonth(), 1)))
  const [to, setTo] = useState(dateOf(now))
  const [range, setRange] = useState({ from, to })
  const [data, setData] = useState<DashboardData | null | undefined>(undefined)
  const [problem, setProblem] = useState<string | null>(null)
  const [refused, setRefused] = useState(false)

  const load = useCallback(async () => {
    setData(undefined)
    setProblem(null)
    const r = await call<DashboardData>(fetchImpl, `/staff/dashboard?from=${range.from}&to=${range.to}`)
    if (!r.ok) {
      setRefused(r.status === 403 || r.status === 401)
      setProblem(r.error.fieldErrors[0]?.code ?? null)
      return setData(null)
    }
    // Anything but a dashboard is shown as not loaded, never as figures.
    setData(Array.isArray(r.data?.figures) ? r.data : null)
  }, [fetchImpl, range])
  useEffect(() => {
    void load()
  }, [load])

  const time = (iso: string) =>
    new Intl.DateTimeFormat(locale === 'es' ? 'es-US' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(iso),
    )

  function apply(e: FormEvent) {
    e.preventDefault()
    setRange({ from, to })
  }

  return (
    <section
      className="staff-screen staff-dashboard"
      aria-labelledby="staff-screen-title"
      data-testid="owner-dashboard"
    >
      <h1 id="staff-screen-title" className="hh-h3">
        {t('dashboard.title')}
      </h1>
      <form className="staff-dashboard__range" onSubmit={apply} noValidate>
        <Field label={t('dashboard.from')} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Field label={t('dashboard.to')} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <Button type="submit" variant="secondary">
          {t('dashboard.apply')}
        </Button>
      </form>
      {data === undefined ? (
        <StateView kind="loading" title={t('dashboard.loading')} />
      ) : data === null ? (
        refused ? (
          <StateView kind="blocked" title={t('dashboard.refused')} />
        ) : (
          <StateView
            kind="error"
            title={problem ? codeLabel(t, 'dashboardCode', problem) : t('dashboard.error')}
            action={<Button onClick={() => void load()}>{t('system.retry')}</Button>}
          />
        )
      ) : (
        <>
          <p className="staff-request__hint">
            {t('dashboard.periodNote', {
              from: data.period.from,
              to: data.period.to,
              days: data.period.days,
              previousFrom: data.period.previous.from,
              previousTo: data.period.previous.to,
              zone: data.zone,
            })}
          </p>
          <p role="status" className="staff-dashboard__updated">
            {t('dashboard.lastUpdated', { time: time(data.generatedAt) })}
          </p>
          <p className="staff-request__hint">{t('dashboard.sources')}</p>
          <p className="staff-request__hint" data-testid="dashboard-accounting">
            {t('dashboard.accounting')}
          </p>
          {SECTIONS.map((s) => {
            const figures = data.figures.filter((f) => f.section === s)
            return (
              <section key={s} className="staff-request__section" aria-labelledby={`${ids}-${s}`}>
                <h2 id={`${ids}-${s}`} className="staff-queue__heading">
                  {codeLabel(t, 'dashboardSection', s)}
                </h2>
                {figures.length === 0 ? (
                  <p className="staff-system__none">{t('dashboard.sectionNone')}</p>
                ) : (
                  <ul className="staff-dashboard__tiles">
                    {figures.map((f) => (
                      <Tile
                        key={`${f.id}:${f.detail?.id ?? ''}`}
                        t={t}
                        figure={f}
                        range={range}
                        fetchImpl={fetchImpl}
                        go={go}
                        href={href}
                      />
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
          <DashboardExport t={t} fetchImpl={fetchImpl} range={range} onSession={onSession} />
          <AccountantExport t={t} fetchImpl={fetchImpl} range={range} onSession={onSession} />
        </>
      )}
    </section>
  )
}

function Tile({
  t,
  figure: f,
  range,
  fetchImpl,
  go,
  href,
}: {
  t: T
  figure: DashboardFigure
  range: { from: string; to: string }
  fetchImpl: Fetch
  go: Props['go']
  href: Props['href']
}) {
  const [records, setRecords] = useState<RecordsData | null | undefined>(null)
  const name = figureName(t, f)
  async function open() {
    if (records) return setRecords(null)
    setRecords(undefined)
    const q = new URLSearchParams({ from: range.from, to: range.to, figure: f.id })
    if (f.detail) q.set('detail', f.detail.id)
    const r = await call<RecordsData>(fetchImpl, `/staff/dashboard/records?${q.toString()}`)
    setRecords(r.ok ? r.data : null)
  }
  const tone = f.current.state === 'known' ? null : f.current.state === 'incomplete' ? 'warning' : 'neutral'
  return (
    <li className="staff-dashboard__tile" data-figure={f.id} data-state={f.current.state}>
      <p className="staff-dashboard__name">{name}</p>
      <p className="staff-dashboard__value">{valueText(t, f.unit, f.current)}</p>
      {tone ? <StatusBadge tone={tone}>{codeLabel(t, 'dashboardFigureState', f.current.state)}</StatusBadge> : null}
      <ul className="staff-queue__facts">
        {f.report ? <li>{t('dashboard.basis', { basis: codeLabel(t, 'reportBasis', f.report.basis) })}</li> : null}
        {f.previous ? (
          <li>{t('dashboard.previous', { value: valueText(t, f.unit, f.previous) })}</li>
        ) : (
          <li>{t('dashboard.now')}</li>
        )}
      </ul>
      {f.current.state === 'not_configured' ? null : (
        <Button variant="quiet" onClick={() => void open()} aria-expanded={!!records}>
          {records ? t('dashboard.hideRecords') : t('dashboard.records')}
        </Button>
      )}
      {records === undefined ? <p role="status">{t('dashboard.loadingRecords')}</p> : null}
      {records ? <Records t={t} name={name} data={records} go={go} href={href} /> : null}
    </li>
  )
}

function Records({
  t,
  name,
  data,
  go,
  href,
}: {
  t: T
  name: string
  data: RecordsData
  go: Props['go']
  href: Props['href']
}) {
  if (data.rows.length === 0) return <p className="staff-system__none">{t('dashboard.recordsNone')}</p>
  const link = (l: { screen: string; id: string | null }) => `/${l.screen}${l.id ? `/${l.id}` : ''}`
  return (
    <div className="staff-dashboard__records">
      {data.truncated ? (
        <p className="staff-request__hint">
          {t('dashboard.recordsTruncated', { shown: data.rows.length, total: data.total })}
        </p>
      ) : null}
      <table className="staff-invoice__lines">
        <caption className="staff-request__hint">{t('dashboard.recordsCaption', { figure: name })}</caption>
        <thead>
          <tr>
            <th scope="col">{t('dashboard.col.reference')}</th>
            <th scope="col">{t('dashboard.col.date')}</th>
            <th scope="col">{t('dashboard.col.state')}</th>
            <th scope="col">{t('dashboard.col.amount')}</th>
            <th scope="col">{t('dashboard.col.open')}</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => (
            <tr key={r.id}>
              <td>{r.reference ?? r.id}</td>
              <td>{r.on ?? ''}</td>
              <td>{r.state ?? ''}</td>
              <td>
                {r.cents !== null
                  ? formatUsd(cents(r.cents))
                  : r.minutes !== null
                    ? t('dashboard.value.minutes', { minutes: r.minutes })
                    : ''}
              </td>
              <td>
                {r.link ? (
                  <a
                    href={href(link(r.link))}
                    onClick={(e: MouseEvent<HTMLAnchorElement>) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
                      e.preventDefault()
                      go(link(r.link as { screen: string; id: string | null }))
                    }}
                  >
                    {t('dashboard.open')}
                  </a>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
        {data.totalCents !== null ? (
          <tfoot>
            <tr>
              <th scope="row" colSpan={3}>
                {t('dashboard.recordsTotal', { count: data.total })}
              </th>
              <td>{formatUsd(cents(data.totalCents))}</td>
              <td />
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  )
}

type ExportFile = { filename: string; contentType: string; rows: number; csv: string }

/** The dashboard as CSV for the shown period: the same figures and totals; a recent sign-in; audited. */
function DashboardExport({
  t,
  fetchImpl,
  range,
  onSession,
}: {
  t: T
  fetchImpl: Fetch
  range: { from: string; to: string }
  onSession?: Props['onSession']
}) {
  const ids = useId()
  const w = useOwnerWrite(fetchImpl, onSession)
  const [done, setDone] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)
  function submit(e: FormEvent) {
    e.preventDefault()
    setDone(null)
    setFailed(false)
    void w.send<ExportFile>('/staff/dashboard/exports', { from: range.from, to: range.to }, (r) => {
      if (!r.ok) return setFailed(true)
      saveFile(r.data)
      setDone(r.data.rows)
    })
  }
  return (
    <section className="staff-request__section" aria-labelledby={`${ids}-h`}>
      <h2 id={`${ids}-h`} className="staff-queue__heading">
        {t('dashboard.export.title')}
      </h2>
      <p className="staff-request__hint">{t('dashboard.export.hint')}</p>
      <ReauthForm t={t} w={w} />
      {failed ? (
        <p role="alert" className="hh-field__error">
          {t('dashboard.export.failed')}
        </p>
      ) : null}
      {done !== null ? <p role="status">{t('dashboard.export.done', { n: done })}</p> : null}
      {!w.reauth ? (
        <form onSubmit={submit} noValidate aria-label={t('dashboard.export.title')}>
          <Button type="submit" variant="secondary" pending={w.pending}>
            {t('dashboard.export.button')}
          </Button>
        </form>
      ) : null}
    </section>
  )
}

/** The accountant's files for the shown period: one kind of record each, with a reason; audited. */
function AccountantExport({
  t,
  fetchImpl,
  range,
  onSession,
}: {
  t: T
  fetchImpl: Fetch
  range: { from: string; to: string }
  onSession?: Props['onSession']
}) {
  const ids = useId()
  const w = useOwnerWrite(fetchImpl, onSession)
  const [dataset, setDataset] = useState<(typeof DATASETS)[number]>('invoices')
  const [reason, setReason] = useState('')
  const [problem, setProblem] = useState<StaffKey | null>(null)
  const [done, setDone] = useState<number | null>(null)
  function submit(e: FormEvent) {
    e.preventDefault()
    setDone(null)
    setProblem(null)
    if (!reason.trim()) return setProblem('dashboard.accountant.reasonRequired')
    void w.send<ExportFile>(
      '/staff/accounting/exports',
      { dataset, from: range.from, to: range.to, reason: reason.trim() },
      (r) => {
        if (!r.ok) return setProblem('dashboard.export.failed')
        saveFile(r.data)
        setDone(r.data.rows)
      },
    )
  }
  return (
    <section className="staff-request__section" aria-labelledby={`${ids}-h`}>
      <h2 id={`${ids}-h`} className="staff-queue__heading">
        {t('dashboard.accountant.title')}
      </h2>
      <p className="staff-request__hint">{t('dashboard.accountant.hint')}</p>
      <ReauthForm t={t} w={w} />
      {problem ? (
        <p role="alert" className="hh-field__error">
          {t(problem)}
        </p>
      ) : null}
      {done !== null ? <p role="status">{t('dashboard.export.done', { n: done })}</p> : null}
      {!w.reauth ? (
        <form onSubmit={submit} noValidate aria-label={t('dashboard.accountant.title')}>
          <div className="hh-field">
            <label className="hh-field__label" htmlFor={`${ids}-dataset`}>
              {t('dashboard.accountant.dataset')}
            </label>
            <select
              id={`${ids}-dataset`}
              className="hh-field__control"
              value={dataset}
              onChange={(e) => setDataset(e.target.value as (typeof DATASETS)[number])}
            >
              {DATASETS.map((d) => (
                <option key={d} value={d}>
                  {codeLabel(t, 'accountingDataset', d)}
                </option>
              ))}
            </select>
          </div>
          <Field
            label={t('dashboard.accountant.reason')}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <Button type="submit" variant="secondary" pending={w.pending}>
            {t('dashboard.accountant.button')}
          </Button>
        </form>
      ) : null}
    </section>
  )
}
