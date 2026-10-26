// Owner Dashboard module (TSK-0096; HH-FIN-18, HH-FIN-16, HH-DATA-10, S11, T64, T73, OWN-DEC-125, RULE-MONEY-CENTS,
// RULE-NO-INVENTED-FACTS, RULE-SERVER-AUTHZ).
//   GET  /staff/dashboard             the figures of a period (dates in the business zone) and the previous period
//   GET  /staff/dashboard/records     the records behind one figure (they are what it counts or adds)
//   POST /staff/dashboard/exports     the dashboard as CSV, its totals equal to the screen's (fresh sign-in, audited)
//   POST /staff/accounting/exports    the accountant's CSV of one kind of record (fresh sign-in, reason, audited)
// - The dashboard and its CSV are dashboard.view / dashboard.export_csv (ROLE-MATRIX "Owner Dashboard and its CSV":
//   the Owner); every export also needs a sign-in within the last minutes (HH-FIN-16, T64 "bulk export"). The
//   accountant's files are export.accounting (F: the Owner, fresh sign-in and a reason).
// - Figures come from recorded data only; an unknown value is unavailable, incomplete or not configured, never zero.
// - Each export is audited with its period, dataset and row count, never its contents.
import type { Tx } from '@handyhub/db'
import type { AccountingDataset } from '@handyhub/domain'
import type { StaffActor } from '@handyhub/policy'
import { ApiError } from '../../api/errors.js'
import type { ApiContext, ApiModule, RouteDef } from '../../api/route.js'
import { loadConfig } from '../../platform/config/index.js'
import { FRESH_AUTH_MINUTES } from '../identity/sessions.js'
import { businessZone } from '../visits/visits.js'
import { accountingCsv } from './accounting.js'
import {
  ACCOUNTING_EXPORT_BODY,
  DASHBOARD_EXPORT_BODY,
  DASHBOARD_RECORDS,
  DASHBOARD_VIEW,
  EXPORT_FILE,
  PERIOD_QUERY,
  RECORDS_QUERY,
} from './schemas.js'
import { dashboardExport, dashboardRecords, dashboardView, DRILL_LIMIT, periodOf } from './view.js'

const TEST = 'test/integration/owner-dashboard.test.ts'
const CSV_TYPE = 'text/csv'
/** PROPOSED: 30 exports per staff member per hour, as for the Arrived/Finished file. */
export const EXPORT_RATE = { bucket: 'owner-export', limit: 30, windowSeconds: 3600 } as const

function staff(ctx: ApiContext): StaffActor {
  if (ctx.actor.kind !== 'staff') throw new ApiError('FORBIDDEN')
  return ctx.actor
}

const read = {
  method: 'GET',
  actors: ['staff'],
  kind: 'read',
  idempotency: 'none',
  expectedVersion: 'none',
  rateLimit: 'none',
  audit: 'none',
  pagination: false,
  permission: 'dashboard.view',
  test: TEST,
} as const
const exportRoute = {
  method: 'POST',
  actors: ['staff'],
  kind: 'write',
  idempotency: 'none',
  expectedVersion: 'none',
  rateLimit: EXPORT_RATE,
  pagination: false,
  test: TEST,
} as const

const SOURCES =
  'Every money figure names its report definition (basis, included and excluded states: GET /staff/reports/sources); ' +
  'figures of two bases are never added together. Invoiced revenue is final invoices issued (the deposit invoice ' +
  'left out: counted once, on the final invoice); money received is verified payments once each, by method; pending ' +
  'checks, refunds and credits, Square fees and payouts are apart. '

export function dashboardModule(): ApiModule {
  const view: RouteDef = {
    ...read,
    path: '/staff/dashboard',
    operationId: 'getOwnerDashboard',
    summary: 'The Owner Dashboard',
    description:
      'Staff with dashboard.view (the Owner). The figures of the period from `from` to `to` (dates in the business ' +
      'time zone, both included, at most 366 days, PROPOSED) beside the previous period of the same length, and the ' +
      'figures as things stand now: Overview, Customer response, Estimates, Job quality, Payments, Job costs and ' +
      'Cases (S11). ' +
      SOURCES +
      'A value is known, incomplete (the part known so far), unavailable (nothing to measure) or not configured; ' +
      'never a zero for missing data. Job costs are incomplete while labor and burden cost are NOT CONFIGURED; the ' +
      'accounting treatments (deposit revenue recognition, tax, write-off presentation) are NOT CONFIGURED. ' +
      'generatedAt is the last-updated time. Refusals: VALIDATION_FAILED RANGE_INVALID / RANGE_TOO_LONG, ' +
      'NOT_CONFIGURED BUSINESS_TIMEZONE_NOT_CONFIGURED.',
    schema: { querystring: PERIOD_QUERY, response: { 200: DASHBOARD_VIEW } },
    handler: async (ctx) => {
      const q = ctx.req.query as { from: string; to: string }
      const v = await dashboardView(ctx.db, staff(ctx), periodOf(q.from, q.to, 'querystring'))
      return { body: v, headers: { 'cache-control': 'no-store' } }
    },
  }

  const records: RouteDef = {
    ...read,
    path: '/staff/dashboard/records',
    operationId: 'getOwnerDashboardRecords',
    summary: 'The records behind one dashboard figure',
    description:
      'Staff with dashboard.view (the Owner). The supporting records of one figure for the period (or, with ' +
      '`previous`, the previous period; a figure counted as things stand has none): a count is its records and an ' +
      `amount the sum of their cents, so the list always matches the figure. At most ${DRILL_LIMIT} records are ` +
      'listed (PROPOSED); `total` and `totalCents` count every one. Each record gives its reference, date, state, ' +
      'cents or minutes and the staff screen that opens it; cases show their number, kind and state only (sensitive ' +
      'details stay on the case). `detail` is the staff member of the per-assignee figure. Refusals: ' +
      'VALIDATION_FAILED RANGE_INVALID / RANGE_TOO_LONG / UNKNOWN_FIGURE / NOT_A_PERIOD_FIGURE.',
    schema: { querystring: RECORDS_QUERY, response: { 200: DASHBOARD_RECORDS } },
    handler: async (ctx) => {
      const q = ctx.req.query as { from: string; to: string; figure: string; detail?: string; previous?: boolean }
      const body = await dashboardRecords(ctx.db, staff(ctx), {
        figure: q.figure,
        detail: q.detail?.toLowerCase() ?? null,
        period: periodOf(q.from, q.to, 'querystring'),
        previous: q.previous === true,
      })
      return { body, headers: { 'cache-control': 'no-store' } }
    },
  }

  const exportDashboard: RouteDef = {
    ...exportRoute,
    path: '/staff/dashboard/exports',
    operationId: 'exportOwnerDashboard',
    summary: 'The Owner Dashboard as CSV',
    description:
      'Staff with dashboard.export_csv (the Owner) and a sign-in within the last minutes (FRESH_AUTH_REQUIRED). ' +
      'One row per figure of the dashboard for the period, in screen order, with the same values: section, figure, ' +
      'report and basis, unit, scope, the period, state, value (integer cents, counts, minutes or basis points), ' +
      'the amount in US dollars, and the previous period beside it. Its totals equal the dashboard. Cells are ' +
      'protected against spreadsheet formulas. Audited with the period and row count. PROPOSED limit: 30 per ' +
      'staff member per hour.',
    permission: 'dashboard.export_csv',
    freshAuthMinutes: FRESH_AUTH_MINUTES,
    audit: 'dashboard.export_csv',
    schema: { body: DASHBOARD_EXPORT_BODY, response: { 200: EXPORT_FILE } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const b = ctx.req.body as { from: string; to: string }
      const period = periodOf(b.from, b.to, 'body')
      const out = await dashboardExport(tx, staff(ctx), period)
      await ctx.audit({
        target: { type: 'owner_dashboard', id: `${period.from}..${period.to}` },
        summary: { from: period.from, to: period.to, rows: out.view.figures.length },
      })
      return {
        body: {
          filename: `owner-dashboard-${period.from}-to-${period.to}.csv`,
          contentType: CSV_TYPE,
          rows: out.view.figures.length,
          csv: out.csv,
        },
        headers: { 'cache-control': 'no-store' },
      }
    },
  }

  const exportAccounting: RouteDef = {
    ...exportRoute,
    path: '/staff/accounting/exports',
    operationId: 'exportAccountingRecords',
    summary: "The accountant's CSV of one kind of record",
    description:
      'Staff with export.accounting (the Owner, with a fresh sign-in and a reason). One CSV file of the records of ' +
      '`dataset` in the period (dates in the business time zone, both included, at most 366 days): invoices (issued ' +
      'in it, with their ledger), payments (tenders received in it, every state), payment_allocations (made in it), ' +
      'refunds_credits_write_offs (requested in it, every state, as recorded), deposits (set in it), provider_fees ' +
      '(Square fees by date incurred), payouts (Square payouts by date paid out), job_costs (cost entries by date ' +
      'incurred, voided ones kept) and arrived_finished (the Arrived and Finished times of visits dated in it). ' +
      'Amounts in exact US dollars from integer cents. Only what the Owner reads on the staff screens: no access ' +
      'code, token, message text or case detail. Records only: no revenue recognition, tax treatment or write-off ' +
      'presentation is applied (NOT CONFIGURED), and the file never replaces an accounting system or the ' +
      "accountant's tax review. Audited with the dataset, period, row count and reason. PROPOSED limit: 30 per " +
      'staff member per hour.',
    permission: 'export.accounting',
    audit: 'accounting.export',
    schema: { body: ACCOUNTING_EXPORT_BODY, response: { 200: EXPORT_FILE } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const b = ctx.req.body as { dataset: AccountingDataset; from: string; to: string; reason: string }
      const period = periodOf(b.from, b.to, 'body')
      const zone = businessZone(await loadConfig(tx)).zone
      const out = await accountingCsv(tx, b.dataset, period, zone)
      await ctx.audit({
        target: { type: 'accounting_export', id: `${b.dataset}:${period.from}..${period.to}` },
        summary: { dataset: b.dataset, from: period.from, to: period.to, rows: out.rows },
        reason: b.reason.trim(),
      })
      return {
        body: {
          filename: `${b.dataset.replace(/_/g, '-')}-${period.from}-to-${period.to}.csv`,
          contentType: CSV_TYPE,
          rows: out.rows,
          csv: out.csv,
        },
        headers: { 'cache-control': 'no-store' },
      }
    },
  }

  return { name: 'dashboard', routes: [view, records, exportDashboard, exportAccounting] }
}

export const DASHBOARD_MODULE = dashboardModule()
