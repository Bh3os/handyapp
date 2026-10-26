// Estimated versus actual costs of a job (TSK-0095; HH-FIN-17, HH-DATA-10, HH-QA-08, T73, ENT-Job, ENT-TimeStamp,
// OWN-DEC-69, OWN-DEC-188, OWN-DEC-189, RULE-MONEY-CENTS, RULE-NO-INVENTED-FACTS).
// - The cost lines are those of OWN-DEC-189: direct labor, employee burden where known, materials, approved purchases,
//   subcontractors (OWN-DEC-188, OWN-DEC-208: entered as a direct job cost when tracked), equipment rentals, disposal
//   and other directly attributable expenses. Overhead is never a job cost.
// - Estimated costs come from the accepted estimate version: the internal material and labor cost of each counted line
//   (the base lines and the selected options). The estimate records no other category, so the others are "not
//   estimated"; an approved change order adds scope without a cost estimate, so it leaves the estimate incomplete.
// - Actual costs are entries in integer cents per category; a category is final only once the Owner confirms it holds
//   every cost (an explicit $0.00 is a confirmed category with no entry). Labor is the elapsed Arrived-to-Finished time
//   per worker (OWN-DEC-69); its cost needs a labor cost rate and burden needs the employer's rate, and neither is
//   configured (TSK-0131 adds the Owner-entered rate), so both stay NOT CONFIGURED and the actual total incomplete.
// - Missing cost is never zero: a figure is complete, incomplete (with the part known), not recorded, not estimated or
//   not configured. A total is complete only when every line in it is; a variance exists only between two complete
//   figures. Return-work costs are reported apart from the job's own (HH-QA-08).
// - No margin, profit or target here: gross margin and the 30% advisory flag are TSK-0131's.
// PROPOSED (OQ-JOB-COST-DETAILS): the entry categories, the confirmation step, the entry limit and the date rule.

/** Categories recorded as cost entries (PROPOSED names for the OWN-DEC-189 kinds). */
export const JOB_COST_CATEGORIES = ['materials', 'purchase', 'subcontractor', 'rental', 'disposal', 'other'] as const
export type JobCostCategory = (typeof JOB_COST_CATEGORIES)[number]

/** Every line of the job cost report, in order: labor and burden are computed, never entered. */
export const JOB_COST_LINES = ['labor', 'burden', ...JOB_COST_CATEGORIES] as const
export type JobCostLine = (typeof JOB_COST_LINES)[number]

/** The lines the estimate builder records per line (estimating.estimate_line_costs). */
export const ESTIMATED_LINES = ['materials', 'labor'] as const satisfies readonly JobCostLine[]

/** PROPOSED: the largest single cost entry, in cents ($100,000.00), as for return-work costs. */
export const JOB_COST_MAX_CENTS = 10_000_000

/** The history of a job's costs (finance.job_cost_events). */
export const JOB_COST_EVENTS = ['cost_recorded', 'cost_voided', 'category_confirmed', 'category_reopened'] as const
export type JobCostEvent = (typeof JOB_COST_EVENTS)[number]

/** One figure of the report. Unknown is never zero. */
export type CostFigure =
  /** Every part is known: estimated on every counted line, or the Owner confirmed the category. */
  | { readonly state: 'complete'; readonly cents: number }
  /** Some is known and more may come: shown with the known part, labelled incomplete, never final. */
  | { readonly state: 'incomplete'; readonly knownCents: number }
  /** Nothing recorded yet. */
  | { readonly state: 'not_recorded' }
  /** The estimate records no figure of this kind. */
  | { readonly state: 'not_estimated' }
  /** It needs a value nobody configured (a labor cost rate, a burden rate). */
  | { readonly state: 'not_configured' }

export type CostFigureState = CostFigure['state']

/** One counted line of the accepted estimate version, with its internal costs (null: not entered). */
export type EstimatedLineCost = {
  readonly materialCents: number | null
  readonly laborCents: number | null
}

export type ActualEntry = { readonly category: JobCostCategory; readonly amountCents: number }

/** Elapsed time of one worker on one of the job's visits; null minutes: not known (missing or not finished). */
export type WorkerTime = { readonly staffUserId: string; readonly minutes: number | null }

export type JobCostFacts = {
  /** The counted lines of the accepted estimate version (empty: no estimate version, for example none accepted). */
  readonly estimateLines: readonly EstimatedLineCost[]
  /** Approved change orders on the job: they add scope without a cost estimate. */
  readonly changeOrders: number
  /** The live (not voided) entries. */
  readonly entries: readonly ActualEntry[]
  /** The categories the Owner confirmed complete, and not reopened since. */
  readonly confirmed: readonly JobCostCategory[]
  /** Elapsed time per worker on the job's own visits that started (never return visits). */
  readonly times: readonly WorkerTime[]
}

const sum = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0)

function assertCents(n: number, what: string) {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`${what} is not a non-negative integer of cents: ${n}`)
}

/** The estimated figure of a per-line cost: complete on every line, incomplete on some, not recorded on none. */
function estimatedOf(values: readonly (number | null)[], changeOrders: number): CostFigure {
  const known = values.filter((v): v is number => v !== null)
  for (const v of known) assertCents(v, 'an estimated line cost')
  if (known.length === 0) return { state: 'not_recorded' }
  if (known.length === values.length && changeOrders === 0) return { state: 'complete', cents: sum(known) }
  return { state: 'incomplete', knownCents: sum(known) }
}

/** The actual figure of an entry category: complete once confirmed, incomplete with entries, else not recorded. */
function actualOf(entries: readonly ActualEntry[], category: JobCostCategory, confirmed: boolean): CostFigure {
  const own = entries.filter((e) => e.category === category).map((e) => e.amountCents)
  for (const v of own) assertCents(v, 'a cost entry')
  if (confirmed) return { state: 'complete', cents: sum(own) }
  return own.length ? { state: 'incomplete', knownCents: sum(own) } : { state: 'not_recorded' }
}

/** The known cents of a figure (0 when nothing is known), for the known part of an incomplete total only. */
export function knownCents(f: CostFigure): number {
  return f.state === 'complete' ? f.cents : f.state === 'incomplete' ? f.knownCents : 0
}

/**
 * The total of some figures: complete only when every one is; otherwise incomplete with what is known, or not
 * recorded when nothing is. Lines that are not estimated are left out of an estimated total (the estimate has none).
 */
export function totalOf(figures: readonly CostFigure[]): CostFigure {
  const counted = figures.filter((f) => f.state !== 'not_estimated')
  if (counted.length === 0) return { state: 'not_estimated' }
  if (counted.every((f) => f.state === 'complete')) return { state: 'complete', cents: sum(counted.map(knownCents)) }
  if (counted.every((f) => f.state === 'not_recorded' || f.state === 'not_configured')) return { state: 'not_recorded' }
  return { state: 'incomplete', knownCents: sum(counted.map(knownCents)) }
}

/** Actual minus estimated, only between two complete figures (a provisional variance is never shown). */
export function varianceOf(estimated: CostFigure, actual: CostFigure): number | null {
  return estimated.state === 'complete' && actual.state === 'complete' ? actual.cents - estimated.cents : null
}

export type JobCostLineSummary = {
  readonly line: JobCostLine
  readonly estimated: CostFigure
  readonly actual: CostFigure
  readonly varianceCents: number | null
}

export type JobCostSummary = {
  readonly lines: readonly JobCostLineSummary[]
  readonly estimatedTotal: CostFigure
  readonly actualTotal: CostFigure
  readonly varianceCents: number | null
  /** The lines whose actual figure is not complete: why the actual total is incomplete. */
  readonly incompleteLines: readonly JobCostLine[]
  readonly labor: {
    /** Known elapsed minutes; complete only when every worker's time on every started visit is known. */
    readonly minutes: number
    readonly minutesComplete: boolean
    /** Workers on the job's started visits whose time is missing or not finished yet. */
    readonly unknownTimes: number
  }
}

/** The estimated-versus-actual summary of one job (see the header). */
export function summarizeJobCosts(f: JobCostFacts): JobCostSummary {
  const confirmed = new Set(f.confirmed)
  const unknownTimes = f.times.filter((t) => t.minutes === null).length
  const lines = JOB_COST_LINES.map((line): JobCostLineSummary => {
    let estimated: CostFigure
    let actual: CostFigure
    if (line === 'labor') {
      estimated = estimatedOf(
        f.estimateLines.map((l) => l.laborCents),
        f.changeOrders,
      )
      // Time is recorded; its cost needs the labor cost rate, which is NOT CONFIGURED (TSK-0131).
      actual = { state: 'not_configured' }
    } else if (line === 'burden') {
      estimated = { state: 'not_estimated' }
      actual = { state: 'not_configured' }
    } else {
      estimated =
        line === 'materials'
          ? estimatedOf(
              f.estimateLines.map((l) => l.materialCents),
              f.changeOrders,
            )
          : { state: 'not_estimated' }
      actual = actualOf(f.entries, line, confirmed.has(line))
    }
    return { line, estimated, actual, varianceCents: varianceOf(estimated, actual) }
  })
  const estimatedTotal = totalOf(lines.map((l) => l.estimated))
  const actualTotal = totalOf(lines.map((l) => l.actual))
  return {
    lines,
    estimatedTotal,
    actualTotal,
    varianceCents: varianceOf(estimatedTotal, actualTotal),
    incompleteLines: lines.filter((l) => l.actual.state !== 'complete').map((l) => l.line),
    labor: {
      minutes: sum(f.times.map((t) => t.minutes ?? 0)),
      minutesComplete: unknownTimes === 0,
      unknownTimes,
    },
  }
}

/** Why a cost entry is refused (the database checks the same). */
export type CostEntryProblem = 'AMOUNT_INVALID' | 'IN_FUTURE' | 'CATEGORY_CONFIRMED'

/** A cost entry: a positive amount up to the limit, dated on or before today in the business time zone. */
export function costEntryProblem(
  input: { readonly amountCents: number; readonly incurredOn: string },
  facts: { readonly today: string; readonly confirmed: boolean },
): CostEntryProblem | null {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents < 1 || input.amountCents > JOB_COST_MAX_CENTS)
    return 'AMOUNT_INVALID'
  if (input.incurredOn > facts.today) return 'IN_FUTURE'
  if (facts.confirmed) return 'CATEGORY_CONFIRMED'
  return null
}
