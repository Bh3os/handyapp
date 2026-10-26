// The Owner Dashboard view, its drill-down lists and its CSV (TSK-0096; HH-FIN-18, HH-DATA-10, S11, T73,
// OWN-DEC-125, RULE-MONEY-CENTS, RULE-NO-INVENTED-FACTS). One function computes the figures; the screen, every
// drill-down list and the CSV read it, so a list always matches its figure and the CSV's totals equal the screen's.
import type { Db, Tx } from '@handyhub/db'
import {
  DASHBOARD_FIGURES,
  dashboardCsv,
  dashboardFigure,
  dashboardPeriod,
  reportDefinition,
  type DashboardFigureDef,
  type DashboardPeriod,
  type ShownFigure,
} from '@handyhub/domain'
import type { StaffActor } from '@handyhub/policy'
import { ApiError, type FieldError } from '../../api/errors.js'
import { loadConfig } from '../../platform/config/index.js'
import { businessZone } from '../visits/visits.js'
import {
  nowSources,
  periodSources,
  rangeOf,
  type AssigneeFigure,
  type DrillRow,
  type Source,
  type Sources,
} from './figures.js'

type Reader = Db | Tx

const field = (f: string, code: string): FieldError => ({ field: f, code, message: '' })
const invalid = (f: string, code: string) => new ApiError('VALIDATION_FAILED', { fieldErrors: [field(f, code)] })

/** The period of a request, or VALIDATION_FAILED naming the field. */
export function periodOf(from: string, to: string, where: 'querystring' | 'body'): DashboardPeriod {
  const p = dashboardPeriod(from, to)
  if (p === 'RANGE_INVALID') throw invalid(`${where}.to`, 'RANGE_INVALID')
  if (p === 'RANGE_TOO_LONG') throw invalid(`${where}.to`, 'RANGE_TOO_LONG')
  return p
}

/**
 * The accounting treatments the software does not decide (RULE-HUMAN-REVIEW, OWN-DEC-189 item 15): how deposits are
 * recognized as revenue, tax treatment and how write-offs are presented. NOT CONFIGURED until the CPA or the Owner
 * decides; the dashboard never applies one.
 */
export const ACCOUNTING_TREATMENTS = {
  depositRevenueRecognition: 'not_configured',
  taxTreatment: 'not_configured',
  writeOffPresentation: 'not_configured',
} as const

type Computed = {
  zone: string
  period: DashboardPeriod
  current: Sources
  previous: Sources
  now: Sources
  assignees: AssigneeFigure[]
}

async function compute(db: Reader, actor: StaffActor, period: DashboardPeriod, at: Date): Promise<Computed> {
  const zone = businessZone(await loadConfig(db)).zone
  const current = await periodSources(db, actor, rangeOf(period.from, period.to, zone), at)
  const previous = await periodSources(db, actor, rangeOf(period.previous.from, period.previous.to, zone), at)
  const snapshot = await nowSources(db, at, zone)
  return { zone, period, current, previous, now: snapshot.sources, assignees: snapshot.assignees }
}

function sourceOf(c: Computed, def: DashboardFigureDef, which: 'current' | 'previous', detail: string | null) {
  if (def.perAssignee) return c.assignees.find((a) => a.staffUserId === detail)?.source ?? null
  const map = def.scope === 'now' ? c.now : which === 'current' ? c.current : c.previous
  const s = map.get(def.id)
  if (!s) throw new Error(`no source for ${def.id}`)
  return s
}

const valueOf = (c: Computed, def: DashboardFigureDef, which: 'current' | 'previous') =>
  (sourceOf(c, def, which, null) as Source).value

function shown(c: Computed): ShownFigure[] {
  const out: ShownFigure[] = []
  for (const def of DASHBOARD_FIGURES as readonly DashboardFigureDef[]) {
    const base = { id: def.id, section: def.section, unit: def.unit, scope: def.scope, report: def.report }
    if (def.perAssignee) {
      for (const a of c.assignees)
        out.push({ ...base, detail: { id: a.staffUserId, name: a.name }, current: a.source.value, previous: null })
      continue
    }
    out.push({
      ...base,
      detail: null,
      current: valueOf(c, def, 'current'),
      previous: def.scope === 'period' ? valueOf(c, def, 'previous') : null,
    })
  }
  return out
}

const reportOf = (def: { report: ShownFigure['report'] }) => {
  if (!def.report) return null
  const d = reportDefinition(def.report)
  return { id: d.id, basis: d.basis, unknown: d.unknown }
}

/** The dashboard for a period, as the screen shows it. */
export async function dashboardView(db: Reader, actor: StaffActor, period: DashboardPeriod, at = new Date()) {
  const c = await compute(db, actor, period, at)
  const figures = shown(c)
  return {
    period: { from: period.from, to: period.to, days: period.days, previous: { ...period.previous } },
    zone: c.zone,
    generatedAt: at.toISOString(),
    figures: figures.map((fig) => ({
      id: fig.id,
      section: fig.section,
      unit: fig.unit,
      scope: fig.scope,
      report: reportOf(fig),
      detail: fig.detail,
      current: fig.current,
      previous: fig.previous,
    })),
    accounting: { ...ACCOUNTING_TREATMENTS },
    figuresShown: figures,
  }
}
export type DashboardView = Awaited<ReturnType<typeof dashboardView>>

/** PROPOSED: a drill-down list shows at most 500 records; the figure and the totals still count every one. */
export const DRILL_LIMIT = 500

/** The records behind one figure (for a per-assignee figure, the staff member's), in the order they happened. */
export async function dashboardRecords(
  db: Reader,
  actor: StaffActor,
  input: { figure: string; detail: string | null; period: DashboardPeriod; previous: boolean },
  at = new Date(),
) {
  const def = dashboardFigure(input.figure)
  if (!def) throw invalid('querystring.figure', 'UNKNOWN_FIGURE')
  if (def.perAssignee && !input.detail) throw invalid('querystring.detail', 'required')
  if (input.previous && def.scope === 'now') throw invalid('querystring.previous', 'NOT_A_PERIOD_FIGURE')
  const c = await compute(db, actor, input.period, at)
  const s = sourceOf(c, def, input.previous ? 'previous' : 'current', input.detail)
  const rows: DrillRow[] = s?.rows ?? []
  return {
    figure: def.id,
    unit: def.unit,
    scope: def.scope,
    report: reportOf(def),
    detail: input.detail,
    period: input.previous
      ? { from: input.period.previous.from, to: input.period.previous.to }
      : { from: input.period.from, to: input.period.to },
    generatedAt: at.toISOString(),
    value: s?.value ?? { state: 'known' as const, value: 0 },
    total: rows.length,
    totalCents: def.unit === 'cents' ? rows.reduce((sum, r) => sum + (r.cents ?? 0), 0) : null,
    truncated: rows.length > DRILL_LIMIT,
    rows: rows.slice(0, DRILL_LIMIT),
  }
}

/** The dashboard's CSV for a period: written from the same figures, so its totals equal the screen's. */
export async function dashboardExport(db: Reader, actor: StaffActor, period: DashboardPeriod, at = new Date()) {
  const view = await dashboardView(db, actor, period, at)
  return { view, csv: dashboardCsv({ period, figures: view.figuresShown }) }
}
