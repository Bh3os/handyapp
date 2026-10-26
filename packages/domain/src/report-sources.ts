// Report definitions with their declared source states (TSK-0095; HH-DATA-10, HH-FIN-17, HH-FIN-18, T73,
// OWN-DEC-125, OWN-DEC-189, RULE-MONEY-CENTS, RULE-NO-INVENTED-FACTS).
// - Every report, dashboard figure and export names its basis (what kind of money or count it shows) and the records
//   and states it reads, so a reader always knows whether a figure is an estimate, invoiced revenue, money received,
//   a pending check, a refund or credit, a fee, a payout (settlement), a balance, a cost or an estimated profit.
// - Figures of different bases are never added together: there is no "cash" figure made of pending checks, failed
//   charges, estimates, invoices, fees and payouts. combinable() is the one test the Owner Dashboard (TSK-0096) and job
//   margin (TSK-0131, the `job_margin` definition) use before they sum two figures.
// - Deposits are counted once: the deposit invoice is left out of invoiced revenue (the final invoice's total already
//   holds the whole price and credits the deposit), and money received counts each payment once, never an invoice's
//   paid amount beside its payments.
// - Unknown or missing data is shown as incomplete or unavailable, never as zero (`unknown`).
// The states are the database's own values (the CHECK constraints of the migrations); an integration test reads the
// constraints and fails when a declared state no longer exists. PROPOSED (OQ-JOB-COST-DETAILS): the bases, the
// definitions below and which states each includes; the CPA may refine the accounting definitions (OWN-DEC-189 item 15).

/** What a report shows: one basis per report (HH-FIN-17, HH-DATA-10). */
export const REPORT_BASES = [
  'estimates',
  'invoiced_revenue',
  'cash_received',
  'pending_payments',
  'refunds_and_credits',
  'provider_fees',
  'settlement',
  'balances',
  'job_costs',
  'estimated_profit',
] as const
export type ReportBasis = (typeof REPORT_BASES)[number]

/** One record type a report reads, and the values of its columns it includes (empty: every row). */
export type ReportSource = {
  /** The table, `schema.table`. */
  readonly record: string
  /** Column -> the values included; every listed column must match. */
  readonly where: Readonly<Record<string, readonly string[]>>
  /** How a row counts: once per row, or once per parent (an estimate's revisions count once). */
  readonly countsOnce?: 'per_row' | 'per_estimate' | 'per_payment'
}

export type ReportDefinition = {
  readonly id: string
  readonly basis: ReportBasis
  /** The records and states the report includes. */
  readonly includes: readonly ReportSource[]
  /** Records and states it explicitly leaves out, so a reader knows they are not in it. */
  readonly excludes: readonly ReportSource[]
  /** How a value that is not known is shown: never as zero. */
  readonly unknown: 'incomplete' | 'unavailable'
  /** The task that builds the report on screen (the definition is shared before the screen exists). */
  readonly builtBy: string
}

/** The verified payment states: recorded after verification, reconciled, or a check once the Owner cleared it. */
export const RECEIVED_PAYMENT_STATES = ['recorded', 'reconciled', 'cleared'] as const
/** A check received or deposited but not cleared: pending, never money received (HH-FIN-12). */
export const PENDING_PAYMENT_STATES = ['received', 'deposited'] as const
/** A returned or failed charge, or a payment voided in error: never counted as received. */
export const FAILED_PAYMENT_STATES = ['returned', 'voided'] as const

const PAYMENTS = 'finance.payments'
const INVOICES = 'finance.invoices'
const ISSUED_INVOICE_STATES = ['issued', 'partially_paid', 'paid'] as const

/** PROPOSED report definitions (OQ-JOB-COST-DETAILS), shared by the Owner Dashboard, its CSV and job costing. */
export const REPORT_DEFINITIONS = [
  {
    id: 'estimates_sent',
    basis: 'estimates',
    includes: [
      {
        record: 'estimating.estimate_versions',
        where: { state: ['published', 'accepted', 'declined', 'expired', 'withdrawn', 'superseded'] },
        countsOnce: 'per_estimate',
      },
    ],
    excludes: [{ record: 'estimating.estimate_versions', where: { state: ['draft', 'in_review'] } }],
    unknown: 'unavailable',
    builtBy: 'TSK-0096',
  },
  {
    id: 'invoiced',
    basis: 'invoiced_revenue',
    includes: [{ record: INVOICES, where: { kind: ['final'], state: [...ISSUED_INVOICE_STATES] } }],
    excludes: [
      { record: INVOICES, where: { state: ['draft', 'voided'] } },
      // The deposit is part of the final invoice's total and credited on it: counted once.
      { record: INVOICES, where: { kind: ['deposit'] } },
    ],
    unknown: 'unavailable',
    builtBy: 'TSK-0096',
  },
  {
    id: 'payments_received',
    basis: 'cash_received',
    includes: [{ record: PAYMENTS, where: { state: [...RECEIVED_PAYMENT_STATES] }, countsOnce: 'per_payment' }],
    excludes: [
      { record: PAYMENTS, where: { state: [...PENDING_PAYMENT_STATES] } },
      { record: PAYMENTS, where: { state: [...FAILED_PAYMENT_STATES] } },
      { record: 'finance.provider_fees', where: {} },
      { record: 'finance.payouts', where: {} },
    ],
    unknown: 'unavailable',
    builtBy: 'TSK-0096',
  },
  {
    id: 'pending_checks',
    basis: 'pending_payments',
    includes: [{ record: PAYMENTS, where: { method: ['check'], state: [...PENDING_PAYMENT_STATES] } }],
    excludes: [{ record: PAYMENTS, where: { state: [...RECEIVED_PAYMENT_STATES, ...FAILED_PAYMENT_STATES] } }],
    unknown: 'unavailable',
    builtBy: 'TSK-0096',
  },
  {
    id: 'refunds_and_credits',
    basis: 'refunds_and_credits',
    includes: [
      { record: 'finance.refunds', where: { type: ['refund'], state: ['succeeded'] } },
      { record: 'finance.refunds', where: { type: ['credit'], state: ['issued', 'applied'] } },
    ],
    excludes: [
      {
        record: 'finance.refunds',
        where: { state: ['requested', 'approved', 'processing', 'failed', 'needs_review', 'declined', 'voided'] },
      },
      { record: 'finance.refunds', where: { type: ['write_off'] } },
    ],
    unknown: 'unavailable',
    builtBy: 'TSK-0096',
  },
  {
    id: 'provider_fees',
    basis: 'provider_fees',
    includes: [{ record: 'finance.provider_fees', where: {} }],
    excludes: [],
    unknown: 'unavailable',
    builtBy: 'TSK-0096',
  },
  {
    id: 'payouts',
    basis: 'settlement',
    includes: [{ record: 'finance.payouts', where: {} }],
    excludes: [],
    unknown: 'unavailable',
    builtBy: 'TSK-0096',
  },
  {
    id: 'outstanding_balances',
    basis: 'balances',
    // What an issued final invoice still asks for, from its ledger (invoiced less credits, write-offs and confirmed
    // payments; a pending check never reduces it). Overdue balances are shown apart from the rest.
    includes: [{ record: INVOICES, where: { kind: ['final'], state: ['issued', 'partially_paid'] } }],
    excludes: [{ record: INVOICES, where: { state: ['draft', 'paid', 'voided'] } }],
    unknown: 'unavailable',
    builtBy: 'TSK-0096',
  },
  {
    id: 'job_costs',
    basis: 'job_costs',
    includes: [
      // Estimated: the internal costs of the accepted estimate version's counted lines (base and selected options).
      { record: 'estimating.estimate_line_costs', where: {} },
      // Actual: recorded cost entries that are not voided, and the Owner's confirmation of each category.
      { record: 'finance.job_costs', where: { state: ['recorded'] } },
      { record: 'finance.job_cost_events', where: { event: ['category_confirmed', 'category_reopened'] } },
      // Elapsed time per worker, Arrived to Finished with the Owner's corrections, on the job's own visits.
      { record: 'work.time_stamps', where: {} },
      { record: 'work.time_stamp_corrections', where: {} },
      { record: 'work.visits', where: { purpose: ['service', 'follow_up'] } },
    ],
    excludes: [
      { record: 'finance.job_costs', where: { state: ['voided'] } },
      // Return work is shown apart from the job's own costs (HH-QA-08).
      { record: 'quality.return_work_costs', where: {} },
      { record: 'work.visits', where: { purpose: ['return_work'] } },
      // Revenue and money are other reports' bases.
      { record: INVOICES, where: {} },
      { record: PAYMENTS, where: {} },
    ],
    unknown: 'incomplete',
    builtBy: 'TSK-0095',
  },
  {
    id: 'return_work_costs',
    basis: 'job_costs',
    includes: [
      { record: 'quality.return_work_costs', where: { state: ['recorded'] } },
      { record: 'work.visits', where: { purpose: ['return_work'] } },
    ],
    excludes: [{ record: 'quality.return_work_costs', where: { state: ['voided'] } }],
    unknown: 'incomplete',
    builtBy: 'TSK-0095',
  },
  {
    // TSK-0131 (HH-FIN-20, OWN-DEC-189): a job's gross margin. Revenue is the invoiced basis less refunds and credits
    // (never money received: a partial payment changes nothing; the deposit counts once, inside the final invoice);
    // costs are the job_costs report with labor and burden from the Owner-entered rates. Final only when every part is.
    id: 'job_margin',
    basis: 'estimated_profit',
    includes: [
      { record: INVOICES, where: { kind: ['final'], state: [...ISSUED_INVOICE_STATES] } },
      { record: 'finance.refunds', where: { type: ['refund'], state: ['succeeded'] } },
      { record: 'finance.refunds', where: { type: ['credit'], state: ['issued', 'applied'] } },
      // Estimated: the job's contract price (its latest scope snapshot) and the accepted version's internal costs.
      { record: 'work.job_scope_snapshots', where: {} },
      { record: 'estimating.estimate_line_costs', where: {} },
      { record: 'finance.job_costs', where: { state: ['recorded'] } },
      { record: 'finance.job_cost_events', where: { event: ['category_confirmed', 'category_reopened'] } },
      { record: 'finance.labor_cost_rates', where: {} },
      { record: 'work.time_stamps', where: {} },
      { record: 'work.time_stamp_corrections', where: {} },
      { record: 'work.visits', where: { purpose: ['service', 'follow_up'] } },
    ],
    excludes: [
      { record: INVOICES, where: { kind: ['deposit'] } },
      { record: INVOICES, where: { state: ['draft', 'voided'] } },
      // Money received is another basis; write-offs are NOT CONFIGURED (they leave the margin incomplete).
      { record: PAYMENTS, where: {} },
      { record: 'finance.refunds', where: { type: ['write_off'] } },
      { record: 'finance.job_costs', where: { state: ['voided'] } },
      { record: 'quality.return_work_costs', where: {} },
      { record: 'work.visits', where: { purpose: ['return_work'] } },
    ],
    unknown: 'incomplete',
    builtBy: 'TSK-0131',
  },
] as const satisfies readonly ReportDefinition[]

export type ReportId = (typeof REPORT_DEFINITIONS)[number]['id']

/**
 * Columns that are not stored but derived from a row: `state` of a cost entry is `voided` once it carries a void,
 * `recorded` before. Everything else is a real column with a CHECK constraint.
 */
export const DERIVED_STATE_RECORDS = ['finance.job_costs', 'quality.return_work_costs'] as const

export function reportDefinition(id: ReportId): ReportDefinition {
  const d = REPORT_DEFINITIONS.find((r) => r.id === id)
  if (!d) throw new Error(`no report definition ${id}`)
  return d
}

/** Two figures may be added together only when they share one basis (no mixed "cash", HH-DATA-10). */
export function combinable(a: ReportId, b: ReportId): boolean {
  return reportDefinition(a).basis === reportDefinition(b).basis
}

export type DefinitionProblem =
  | 'NO_SOURCES'
  | 'UNKNOWN_BASIS'
  | 'INCLUDED_AND_EXCLUDED'
  | 'CASH_INCLUDES_PENDING_OR_FAILED'
  | 'CASH_INCLUDES_OTHER_RECORDS'
  | 'INVOICED_INCLUDES_DEPOSIT_INVOICE'

/** What is wrong with a definition, by the HH-DATA-10 rules; an empty list when nothing is. */
export function definitionProblems(d: ReportDefinition): DefinitionProblem[] {
  const out: DefinitionProblem[] = []
  if (!(REPORT_BASES as readonly string[]).includes(d.basis)) out.push('UNKNOWN_BASIS')
  if (d.includes.length === 0) out.push('NO_SOURCES')
  // A value both included and excluded for the same record and column (with no other column narrowing either).
  for (const inc of d.includes)
    for (const exc of d.excludes) {
      if (inc.record !== exc.record) continue
      const cols = Object.keys(exc.where)
      if (cols.length !== 1 || Object.keys(inc.where).length !== 1) continue
      const col = cols[0] as string
      if ((inc.where[col] ?? []).some((v) => (exc.where[col] ?? []).includes(v))) out.push('INCLUDED_AND_EXCLUDED')
    }
  if (d.basis === 'cash_received') {
    if (d.includes.some((s) => s.record !== PAYMENTS)) out.push('CASH_INCLUDES_OTHER_RECORDS')
    const payments = d.includes.filter((s) => s.record === PAYMENTS)
    if (
      payments.some((s) => s.where['state'] === undefined) ||
      payments
        .flatMap((s) => s.where['state'] ?? [])
        .some((v) => !(RECEIVED_PAYMENT_STATES as readonly string[]).includes(v))
    )
      out.push('CASH_INCLUDES_PENDING_OR_FAILED')
  }
  // Invoiced revenue names the invoice kinds it counts, and never the deposit invoice (counted once, on the final).
  if (
    d.basis === 'invoiced_revenue' &&
    d.includes.some((s) => s.record === INVOICES && (s.where['kind'] ?? ['deposit']).includes('deposit'))
  )
    out.push('INVOICED_INCLUDES_DEPOSIT_INVOICE')
  return out
}

/** The definition as an API or a screen states it: its basis, what it includes and leaves out, and unknowns. */
export function sourceStatement(id: ReportId) {
  const d = reportDefinition(id)
  const shape = (s: ReportSource) => ({
    record: s.record,
    where: Object.entries(s.where).map(([column, values]) => ({ column, values: [...values] })),
    countsOnce: s.countsOnce ?? 'per_row',
  })
  return {
    id: d.id,
    basis: d.basis,
    includes: d.includes.map(shape),
    excludes: d.excludes.map(shape),
    unknown: d.unknown,
    builtBy: d.builtBy,
  }
}
export type SourceStatement = ReturnType<typeof sourceStatement>
