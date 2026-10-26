// The Owner Dashboard's figures and its CSV (TSK-0096; HH-FIN-18, HH-FIN-16, HH-DATA-10, S11, T73, OWN-DEC-125,
// OWN-DEC-173, OWN-DEC-175, OWN-DEC-204, OWN-DEC-205, RULE-MONEY-CENTS, RULE-NO-INVENTED-FACTS).
// - Every figure names its section, its unit (a count, cents, minutes or basis points), whether it is counted over the
//   chosen dates (`period`) or as things stand (`now`), and the report definition it reads (REPORT_DEFINITIONS:
//   basis, included and excluded source states). Figures of two report definitions are added only when combinable()
//   says they share a basis (addFigures): no mixed "cash".
// - A value is known (a count or an amount the records give, $0.00 included when nothing was recorded), incomplete
//   (the part known so far, never final), unavailable (nothing to measure: a share or an average of nothing) or not
//   configured (it needs a decision nobody made). Missing data is never shown as zero.
// - Periods are calendar dates in the business time zone, both ends included; the previous period is the same number
//   of days just before (calendar arithmetic, never 24-hour steps).
// - The CSV is written from the same figures the screen shows, so its totals equal the dashboard's; every cell is
//   protected against spreadsheet formulas (csvCell).
// PROPOSED (OQ-DASHBOARD-DETAILS): the figure list and what each counts, the 366-day limit and the CSV columns.
import { addLocalDays, isLocalDate, type LocalDate } from './local-time.js'
import { combinable, reportDefinition, type ReportBasis, type ReportId } from './report-sources.js'

export const DASHBOARD_SECTIONS = [
  'overview',
  'response',
  'estimates',
  'quality',
  'payments',
  'costs',
  'cases',
] as const
export type DashboardSection = (typeof DASHBOARD_SECTIONS)[number]

export const DASHBOARD_UNITS = ['count', 'cents', 'minutes', 'basis_points'] as const
export type DashboardUnit = (typeof DASHBOARD_UNITS)[number]

/** `period`: counted over the chosen dates (with the previous period beside it); `now`: as things stand. */
export const DASHBOARD_SCOPES = ['period', 'now'] as const
export type DashboardScope = (typeof DASHBOARD_SCOPES)[number]

/** The payment methods the ledger records (finance.payments.method), each with its own "received" figure. */
export const DASHBOARD_PAYMENT_METHODS = [
  'square_payment_link',
  'square_tap_to_pay',
  'cash',
  'check',
  'zelle',
  'cash_app',
  'chime',
] as const

export type DashboardFigureDef = {
  readonly id: string
  readonly section: DashboardSection
  readonly unit: DashboardUnit
  readonly scope: DashboardScope
  /** The report definition the figure reads; null for an operational count that is no money report. */
  readonly report: ReportId | null
  /** Shown once per staff member (open cases by assignee): the figure repeats with a detail. */
  readonly perAssignee?: true
}

const f = (
  id: string,
  section: DashboardSection,
  unit: DashboardUnit,
  scope: DashboardScope,
  report: ReportId | null = null,
): DashboardFigureDef => ({ id, section, unit, scope, report })

/** Every figure, in screen order (PROPOSED: OQ-DASHBOARD-DETAILS says what each counts). */
export const DASHBOARD_FIGURES = [
  // Overview: each links to the screen where it is acted on.
  f('overview.new_requests', 'overview', 'count', 'now'),
  f('overview.estimates_awaiting', 'overview', 'count', 'now', 'estimates_sent'),
  f('overview.owner_approvals', 'overview', 'count', 'now'),
  f('overview.scheduled_jobs', 'overview', 'count', 'now'),
  f('overview.awaiting_review', 'overview', 'count', 'now'),
  f('overview.overdue_invoices', 'overview', 'count', 'now', 'outstanding_balances'),
  f('overview.overdue_decisions', 'overview', 'count', 'now'),
  f('overview.open_cases', 'overview', 'count', 'now'),
  f('overview.privacy_open', 'overview', 'count', 'now'),
  f('overview.privacy_overdue', 'overview', 'count', 'now'),
  f('overview.privacy_legal_overdue', 'overview', 'count', 'now'),
  // Customer response: the first meaningful response, in business hours only.
  f('response.received', 'response', 'count', 'period'),
  f('response.answered', 'response', 'count', 'period'),
  f('response.awaiting', 'response', 'count', 'period'),
  f('response.within_target', 'response', 'count', 'period'),
  f('response.within_target_share', 'response', 'basis_points', 'period'),
  f('response.average_minutes', 'response', 'minutes', 'period'),
  f('response.median_minutes', 'response', 'minutes', 'period'),
  f('response.not_configured', 'response', 'count', 'period'),
  // Estimates sent in the period, once per estimate (revisions count under it), by where each stands now.
  f('estimates.sent', 'estimates', 'count', 'period', 'estimates_sent'),
  f('estimates.approved', 'estimates', 'count', 'period', 'estimates_sent'),
  f('estimates.declined', 'estimates', 'count', 'period', 'estimates_sent'),
  f('estimates.expired', 'estimates', 'count', 'period', 'estimates_sent'),
  f('estimates.withdrawn', 'estimates', 'count', 'period', 'estimates_sent'),
  f('estimates.awaiting', 'estimates', 'count', 'period', 'estimates_sent'),
  // Job quality.
  f('quality.completed_jobs', 'quality', 'count', 'period'),
  f('quality.reviews_decided', 'quality', 'count', 'period'),
  f('quality.reviews_passed_first', 'quality', 'count', 'period'),
  f('quality.pass_rate', 'quality', 'basis_points', 'period'),
  f('quality.open_punch_items', 'quality', 'count', 'now'),
  f('quality.return_visits', 'quality', 'count', 'period'),
  // Payments: invoiced is never money received; each basis stands alone.
  f('payments.invoices_issued', 'payments', 'count', 'period', 'invoiced'),
  f('payments.invoiced', 'payments', 'cents', 'period', 'invoiced'),
  ...DASHBOARD_PAYMENT_METHODS.map((m) =>
    f(`payments.received.${m}`, 'payments', 'cents', 'period', 'payments_received'),
  ),
  f('payments.received', 'payments', 'cents', 'period', 'payments_received'),
  f('payments.pending_checks_count', 'payments', 'count', 'now', 'pending_checks'),
  f('payments.pending_checks', 'payments', 'cents', 'now', 'pending_checks'),
  f('payments.refunds', 'payments', 'cents', 'period', 'refunds_and_credits'),
  f('payments.credits', 'payments', 'cents', 'period', 'refunds_and_credits'),
  f('payments.fees', 'payments', 'cents', 'period', 'provider_fees'),
  f('payments.payouts', 'payments', 'cents', 'period', 'payouts'),
  f('payments.outstanding', 'payments', 'cents', 'now', 'outstanding_balances'),
  f('payments.overdue', 'payments', 'cents', 'now', 'outstanding_balances'),
  f('payments.write_offs', 'payments', 'cents', 'period'),
  // Job costs of the jobs completed in the period: missing cost is incomplete, never zero.
  f('costs.jobs', 'costs', 'count', 'period', 'job_costs'),
  f('costs.complete', 'costs', 'count', 'period', 'job_costs'),
  f('costs.incomplete', 'costs', 'count', 'period', 'job_costs'),
  f('costs.recorded', 'costs', 'cents', 'period', 'job_costs'),
  f('costs.return_work', 'costs', 'cents', 'period', 'return_work_costs'),
  // Gross margin of the same jobs (TSK-0131, OWN-DEC-189): below the target only when final; an advisory flag.
  f('costs.margin_target', 'costs', 'basis_points', 'now', 'job_margin'),
  f('costs.margin_final', 'costs', 'count', 'period', 'job_margin'),
  f('costs.margin_incomplete', 'costs', 'count', 'period', 'job_margin'),
  f('costs.below_target', 'costs', 'count', 'period', 'job_margin'),
  f('costs.below_target_unreviewed', 'costs', 'count', 'period', 'job_margin'),
  // Cases: counts and assignees only; sensitive details stay on the case.
  f('cases.open_complaints', 'cases', 'count', 'now'),
  f('cases.open_damage_injury', 'cases', 'count', 'now'),
  f('cases.open_unassigned', 'cases', 'count', 'now'),
  f('cases.overdue_follow_ups', 'cases', 'count', 'now'),
  { ...f('cases.open_by_assignee', 'cases', 'count', 'now'), perAssignee: true },
] as const satisfies readonly DashboardFigureDef[]

export const DASHBOARD_FIGURE_IDS = DASHBOARD_FIGURES.map((d) => d.id)
export type DashboardFigureId = string

export function dashboardFigure(id: string): DashboardFigureDef | null {
  return (DASHBOARD_FIGURES as readonly DashboardFigureDef[]).find((d) => d.id === id) ?? null
}

/** A figure's value. Known and incomplete carry an integer; unavailable and not configured carry none (never 0). */
export const FIGURE_STATES = ['known', 'incomplete', 'unavailable', 'not_configured'] as const
export type FigureState = (typeof FIGURE_STATES)[number]
export type FigureValue = { readonly state: FigureState; readonly value: number | null }

export const known = (value: number): FigureValue => {
  if (!Number.isSafeInteger(value)) throw new Error(`a figure is an integer: ${value}`)
  return { state: 'known', value }
}
export const incomplete = (value: number): FigureValue => {
  if (!Number.isSafeInteger(value)) throw new Error(`a figure is an integer: ${value}`)
  return { state: 'incomplete', value }
}
export const UNAVAILABLE: FigureValue = { state: 'unavailable', value: null }
export const NOT_CONFIGURED: FigureValue = { state: 'not_configured', value: null }

/**
 * Two figures added together: refused unless both read report definitions of one basis (HH-DATA-10). The sum is
 * known only when both are; incomplete with the known parts when either is; unavailable or not configured otherwise.
 */
export function addFigures(
  a: { readonly report: ReportId; readonly value: FigureValue },
  b: { readonly report: ReportId; readonly value: FigureValue },
): FigureValue {
  if (!combinable(a.report, b.report)) throw new Error(`${a.report} and ${b.report} have different bases`)
  const states = [a.value.state, b.value.state]
  if (states.includes('not_configured')) return NOT_CONFIGURED
  if (states.includes('unavailable')) return UNAVAILABLE
  const sum = (a.value.value ?? 0) + (b.value.value ?? 0)
  return states.includes('incomplete') ? incomplete(sum) : known(sum)
}

/** The sum of figures that share one report definition's basis (no figure: a known zero of that report). */
export function sumFigures(report: ReportId, values: readonly FigureValue[]): FigureValue {
  return values.reduce<FigureValue>((acc, v) => addFigures({ report, value: acc }, { report, value: v }), known(0))
}

/** The report a figure reads, as a screen or a CSV states it. */
export function figureBasis(def: DashboardFigureDef): ReportBasis | null {
  return def.report ? reportDefinition(def.report).basis : null
}

// --- Periods ------------------------------------------------------------------------------------------------------

/** PROPOSED: one dashboard period or accounting export covers at most 366 calendar days. */
export const DASHBOARD_MAX_DAYS = 366

export type DashboardPeriod = {
  readonly from: LocalDate
  readonly to: LocalDate
  /** Calendar days, both ends included. */
  readonly days: number
  /** The same number of days just before `from`. */
  readonly previous: { readonly from: LocalDate; readonly to: LocalDate }
}

export type PeriodProblem = 'RANGE_INVALID' | 'RANGE_TOO_LONG'

const dayNumber = (d: LocalDate) => Math.round(Date.parse(`${d}T12:00:00Z`) / 86_400_000)

/** The period from `from` to `to` (dates in the business zone, both included) and the one before it. */
export function dashboardPeriod(from: string, to: string): DashboardPeriod | PeriodProblem {
  if (!isLocalDate(from) || !isLocalDate(to)) return 'RANGE_INVALID'
  const days = dayNumber(to) - dayNumber(from) + 1
  if (days < 1) return 'RANGE_INVALID'
  if (days > DASHBOARD_MAX_DAYS) return 'RANGE_TOO_LONG'
  return {
    from,
    to,
    days,
    previous: { from: addLocalDays(from, -days), to: addLocalDays(from, -1) },
  }
}

// --- CSV ----------------------------------------------------------------------------------------------------------

/** A CSV cell: quoted when needed, with a leading formula character neutralized (CSV injection, HH-FIN-16). */
export function csvCell(value: string | number | null): string {
  if (value === null) return ''
  let s = String(value)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) || s !== String(value) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Lines of cells as CSV text (CRLF line ends, as spreadsheets expect). */
export function csvText(header: readonly string[], rows: readonly (readonly (string | number | null)[])[]): string {
  return `${[header.join(','), ...rows.map((r) => r.map((c) => csvCell(c)).join(','))].join('\r\n')}\r\n`
}

/** Integer cents as US dollars with two decimals ("1234.56", "-0.50"): exact, no floating point. */
export function centsAsDollars(cents: number | null): string | null {
  if (cents === null) return null
  if (!Number.isSafeInteger(cents)) throw new Error(`cents are an integer: ${cents}`)
  const sign = cents < 0 ? '-' : ''
  const a = Math.abs(cents)
  return `${sign}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`
}

/** One figure as the dashboard shows it (the server's view, also the CSV's input). */
export type ShownFigure = {
  readonly id: string
  readonly section: DashboardSection
  readonly unit: DashboardUnit
  readonly scope: DashboardScope
  readonly report: ReportId | null
  /** The staff member of a per-assignee figure, else null. */
  readonly detail: { readonly id: string; readonly name: string | null } | null
  readonly current: FigureValue
  /** The previous period's value of a period figure; null for a `now` figure. */
  readonly previous: FigureValue | null
}

export const DASHBOARD_CSV_COLUMNS = [
  'section',
  'figure',
  'detail',
  'report',
  'basis',
  'unit',
  'scope',
  'period_from',
  'period_to',
  'state',
  'value',
  'amount_usd',
  'previous_from',
  'previous_to',
  'previous_state',
  'previous_value',
  'previous_amount_usd',
] as const

/** The dashboard as CSV: one row per figure, in screen order, with the same values (totals equal the dashboard). */
export function dashboardCsv(view: {
  readonly period: DashboardPeriod
  readonly figures: readonly ShownFigure[]
}): string {
  const usd = (fig: ShownFigure, v: FigureValue | null) =>
    fig.unit === 'cents' && v && v.value !== null ? centsAsDollars(v.value) : null
  return csvText(
    DASHBOARD_CSV_COLUMNS,
    view.figures.map((fig) => {
      const period = fig.scope === 'period'
      return [
        fig.section,
        fig.id,
        fig.detail ? (fig.detail.name ?? fig.detail.id) : null,
        fig.report,
        fig.report ? reportDefinition(fig.report).basis : null,
        fig.unit,
        fig.scope,
        period ? view.period.from : null,
        period ? view.period.to : null,
        fig.current.state,
        fig.current.value,
        usd(fig, fig.current),
        period ? view.period.previous.from : null,
        period ? view.period.previous.to : null,
        fig.previous?.state ?? null,
        fig.previous?.value ?? null,
        usd(fig, fig.previous),
      ]
    }),
  )
}

/** Parses this module's CSV back into rows of cells (for tests and checks; quoted cells, CRLF lines). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i] as string
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(cell)
      cell = ''
    } else if (c === '\r') continue
    else if (c === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

// --- Accounting exports (HH-FIN-16) ------------------------------------------------------------------------------

/** The accountant's files (PROPOSED columns: OQ-DASHBOARD-DETAILS). Arrived/Finished is the TSK-0070 export. */
export const ACCOUNTING_DATASETS = [
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
export type AccountingDataset = (typeof ACCOUNTING_DATASETS)[number]
