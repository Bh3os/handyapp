// The Owner Dashboard's figures from recorded data (TSK-0096; HH-FIN-18, HH-DATA-10, S11, T73, OWN-DEC-125,
// OWN-DEC-173, OWN-DEC-175, OWN-DEC-204, OWN-DEC-205, RULE-MONEY-CENTS, RULE-NO-INVENTED-FACTS).
// - Each figure is computed from its supporting records: the rows a figure opens are the rows it counts or adds, so
//   the drill-down list always matches the figure (a count is its rows, an amount the sum of their cents).
// - The money figures read their report definition's included states (@handyhub/domain REPORT_DEFINITIONS): invoiced
//   revenue is final invoices issued, partially paid or paid (the deposit invoice left out: the final invoice credits
//   it); money received is payments recorded, reconciled or cleared, once per payment, by method (pending checks,
//   returned and voided payments left out); pending checks are checks received or deposited; refunds are refunds that
//   succeeded and credits are credits issued or applied (write-offs left out); fees and payouts are the hand-recorded
//   Square records; outstanding balances are what issued final invoices still ask for, from their ledger.
// - Periods are calendar dates in the business time zone, from the local midnight of the first date to the local
//   midnight after the last. Date columns (received on, incurred on, paid out on, visit date) compare as dates.
// - Missing data is never zero: a share or an average of nothing is unavailable; job costs are incomplete while any
//   cost line is (labor and burden from the Owner-entered rates, TSK-0131); return-work costs are recorded so far, never
//   final; the write-off presentation is NOT CONFIGURED (the CPA's or the Owner's decision).
// - Gross margin (TSK-0131, OWN-DEC-189): the same jobs counted by whether their margin is final, and flagged below
//   job_margin.target only when it is (advisory); with no target configured the flag is NOT CONFIGURED.
// - Cases show counts, kinds, states and assignees only: what happened, medical details and notes stay on the case.
// PROPOSED (OQ-DASHBOARD-DETAILS): what each figure counts and which date places a record in a period.
import type { Db, Tx } from '@handyhub/db'
import {
  addLocalDays,
  DASHBOARD_PAYMENT_METHODS,
  known,
  localDateOf,
  NOT_CONFIGURED,
  PENDING_PAYMENT_STATES,
  RECEIVED_PAYMENT_STATES,
  resolveLocalTime,
  sumFigures,
  UNAVAILABLE,
  incomplete,
  type FigureValue,
  type LocalDate,
} from '@handyhub/domain'
import type { StaffActor } from '@handyhub/policy'
import { sql } from 'kysely'
import { requestDeadlines } from '../privacy/deadlines.js'
import { responseReport } from '../requests/response-clock.js'
import { jobCostsView } from '../job-costs/store.js'
import { marginTarget } from '../job-margin/margin.js'
import { loadConfig } from '../../platform/config/index.js'

type Reader = Db | Tx

/** Where a row opens in the staff app: a screen, and the record below it when there is one. */
export type RowLink = { screen: string; id: string | null }

/** One supporting record of a figure, with what it adds (cents or minutes) when the figure is an amount. */
export type DrillRow = {
  id: string
  /** The record's own reference (a project, estimate, invoice or case number), never personal content. */
  reference: string | null
  /** The date or time that places it in the period, or its due date. */
  on: string | null
  state: string | null
  cents: number | null
  minutes: number | null
  link: RowLink | null
}

export type Source = { rows: DrillRow[]; value: FigureValue }
export type Sources = Map<string, Source>

/** The instants of a period of business-zone dates: [local midnight of `from`, local midnight after `to`). */
export type Range = { from: LocalDate; to: LocalDate; start: Date; end: Date }

/** The first instant of a local date (a midnight that a clock change skips resolves to when the day resumes). */
export function startOfLocalDay(date: LocalDate, zone: string): Date {
  const r = resolveLocalTime(date, '00:00', zone)
  if (r.kind === 'unique') return r.at.instant
  if (r.kind === 'repeated') return r.earlier.instant
  const resumed = resolveLocalTime(date, r.resumesAt, zone)
  if (resumed.kind === 'unique') return resumed.at.instant
  if (resumed.kind === 'repeated') return resumed.earlier.instant
  throw new Error(`no start of ${date} in ${zone}`)
}

export function rangeOf(from: LocalDate, to: LocalDate, zone: string): Range {
  return { from, to, start: startOfLocalDay(from, zone), end: startOfLocalDay(addLocalDays(to, 1), zone) }
}

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null)
const dateText = (d: Date | string | null): string | null =>
  d === null ? null : typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10)
const row = (r: Partial<DrillRow> & { id: string }): DrillRow => ({
  reference: null,
  on: null,
  state: null,
  cents: null,
  minutes: null,
  link: null,
  ...r,
})
const count = (rows: DrillRow[]): Source => ({ rows, value: known(rows.length) })
const amount = (rows: DrillRow[]): Source => ({ rows, value: known(rows.reduce((s, r) => s + (r.cents ?? 0), 0)) })
const sharePoints = (part: number, whole: number): FigureValue =>
  whole === 0 ? UNAVAILABLE : known(Math.round((part * 10_000) / whole))
const VERIFIED = [...RECEIVED_PAYMENT_STATES]
const PENDING = [...PENDING_PAYMENT_STATES]

// --- Figures counted as things stand ------------------------------------------------------------------------------

/** One open case by assignee (cases.open_by_assignee is shown once per staff member). */
export type AssigneeFigure = { staffUserId: string; name: string | null; source: Source }

export async function nowSources(db: Reader, now: Date, zone: string) {
  const out: Sources = new Map()
  const today = localDateOf(now, zone)

  const requests = await db
    .selectFrom('intake.requests')
    .select(['id', 'reference', 'submitted_at', 'state'])
    .where('state', '=', 'received')
    .orderBy('submitted_at')
    .orderBy('id')
    .execute()
  out.set(
    'overview.new_requests',
    count(
      requests.map((r) =>
        row({
          id: r.id,
          reference: r.reference,
          on: iso(r.submitted_at),
          state: r.state,
          link: { screen: 'requests', id: r.id },
        }),
      ),
    ),
  )

  const latest = await latestSentVersions(db)
  out.set(
    'overview.estimates_awaiting',
    count(latest.filter((e) => e.state === 'published').map((e) => estimateRow(e))),
  )

  const approvals = await db
    .selectFrom('estimating.publication_approvals')
    .select(['id', 'reference', 'state', 'requested_at', 'proposed_total_cents'])
    .where('state', '=', 'pending')
    .orderBy('requested_at')
    .orderBy('id')
    .execute()
  out.set(
    'overview.owner_approvals',
    count(
      approvals.map((a) =>
        row({ id: a.id, reference: a.reference, on: iso(a.requested_at), state: a.state, link: QUEUE }),
      ),
    ),
  )

  const scheduled = await sql<{ job_id: string; reference: string; starts_at: Date }>`
    SELECT DISTINCT ON (v.job_id) v.job_id, p.reference, v.starts_at
      FROM work.visits v JOIN crm.projects p ON p.id = v.project_id
     WHERE v.state = 'confirmed' AND v.job_id IS NOT NULL AND v.starts_at >= ${now}
     ORDER BY v.job_id, v.starts_at`.execute(db)
  out.set(
    'overview.scheduled_jobs',
    count(
      sortByOn(
        scheduled.rows.map((v) =>
          row({
            id: v.job_id,
            reference: v.reference,
            on: iso(v.starts_at),
            state: 'confirmed',
            link: { screen: 'schedule', id: null },
          }),
        ),
      ),
    ),
  )

  const reviews = await sql<{ job_id: string; reference: string; state: string; created_at: Date }>`
    SELECT DISTINCT ON (r.job_id) r.job_id, p.reference, r.state, r.created_at
      FROM quality.reviews r JOIN crm.projects p ON p.id = r.project_id
     WHERE r.state IN ('pending', 'in_review', 'pending_recheck')
     ORDER BY r.job_id, r.created_at DESC`.execute(db)
  out.set(
    'overview.awaiting_review',
    count(
      sortByOn(
        reviews.rows.map((r) =>
          row({
            id: r.job_id,
            reference: r.reference,
            on: iso(r.created_at),
            state: r.state,
            link: { screen: 'quality-reviews', id: r.job_id },
          }),
        ),
      ),
    ),
  )

  // Outstanding balances from the ledger; overdue once the due date (the latest revised one, else the date issued:
  // due on receipt, FACT-PAYMENT-DUE) is before today in the business zone.
  const balances = await sql<{
    id: string
    number: string | null
    issued_at: Date
    state: string
    reference: string
    remaining: string
    revised_due_on: string | null
  }>`
    SELECT i.id, i.number, i.issued_at, i.state, p.reference,
           GREATEST(0, i.total_cents - finance.invoice_credits_cents(i.id) - finance.invoice_written_off_cents(i.id)
                    - finance.invoice_paid_cents(i.id, ${sql.val(VERIFIED)}::text[]))::text AS remaining,
           (SELECT s.due_on::text FROM finance.invoice_collection_steps s
             WHERE s.invoice_id = i.id AND s.kind = 'revised_due_date'
             ORDER BY s.recorded_at DESC, s.id DESC LIMIT 1) AS revised_due_on
      FROM finance.invoices i JOIN crm.projects p ON p.id = i.project_id
     WHERE i.kind = 'final' AND i.state IN ('issued', 'partially_paid')
     ORDER BY i.issued_at, i.id`.execute(db)
  const owed = balances.rows
    .map((b) => {
      const dueOn = b.revised_due_on ?? localDateOf(new Date(b.issued_at), zone)
      return {
        overdue: dueOn < today,
        row: row({
          id: b.id,
          reference: b.number ?? b.reference,
          on: dueOn,
          state: b.state,
          cents: Number(b.remaining),
          link: { screen: 'invoice-reminders', id: b.id },
        }),
      }
    })
    .filter((b) => (b.row.cents ?? 0) > 0)
  const overdue = owed.filter((b) => b.overdue).map((b) => b.row)
  out.set('overview.overdue_invoices', count(overdue))
  out.set('payments.outstanding', amount(owed.map((b) => b.row)))
  out.set('payments.overdue', amount(overdue))

  const decisions = await db
    .selectFrom('ops.queue_items')
    .select(['id', 'subject_id', 'reference', 'opened_at', 'reason'])
    .where('type', '=', 'invoice_overdue_decision')
    .where('resolved_at', 'is', null)
    .orderBy('opened_at')
    .orderBy('id')
    .execute()
  out.set(
    'overview.overdue_decisions',
    count(
      decisions.map((d) =>
        row({
          id: d.id,
          reference: d.reference,
          on: iso(d.opened_at),
          state: d.reason,
          link: { screen: 'invoice-reminders', id: d.subject_id },
        }),
      ),
    ),
  )

  const cases = await db
    .selectFrom('quality.cases as c')
    .innerJoin('crm.projects as p', 'p.id', 'c.project_id')
    .leftJoin('identity.staff_users as u', 'u.id', 'c.assigned_to')
    .select([
      'c.id',
      'c.number',
      'c.kind',
      'c.state',
      'c.reported_at',
      'c.assigned_to',
      'u.display_name',
      'p.reference',
    ])
    .where('c.state', '<>', 'closed')
    .orderBy('c.reported_at')
    .orderBy('c.id')
    .execute()
  const caseRow = (c: (typeof cases)[number]) =>
    row({
      id: c.id,
      reference: `${c.reference} #${c.number}`,
      on: iso(c.reported_at),
      state: `${c.kind}:${c.state}`,
      link: { screen: 'cases', id: c.id },
    })
  out.set('overview.open_cases', count(cases.map(caseRow)))
  out.set(
    'cases.open_complaints',
    count(cases.filter((c) => c.kind === 'complaint' && c.state !== 'resolved').map(caseRow)),
  )
  out.set(
    'cases.open_damage_injury',
    count(cases.filter((c) => c.kind === 'damage' || c.kind === 'injury').map(caseRow)),
  )
  out.set('cases.open_unassigned', count(cases.filter((c) => c.assigned_to === null).map(caseRow)))
  const assignees = new Map<string, AssigneeFigure>()
  for (const c of cases) {
    if (!c.assigned_to) continue
    const a = assignees.get(c.assigned_to) ?? {
      staffUserId: c.assigned_to,
      name: c.display_name,
      source: count([]),
    }
    a.source = count([...a.source.rows, caseRow(c)])
    assignees.set(c.assigned_to, a)
  }

  const followUps = await db
    .selectFrom('quality.case_follow_ups as f')
    .innerJoin('quality.cases as c', 'c.id', 'f.case_id')
    .innerJoin('crm.projects as p', 'p.id', 'c.project_id')
    .select(['f.id', 'f.case_id', 'f.due_on', 'f.state', 'c.number', 'p.reference'])
    .where('f.state', '=', 'open')
    .where('f.due_on', '<', today)
    .orderBy('f.due_on')
    .orderBy('f.id')
    .execute()
  out.set(
    'cases.overdue_follow_ups',
    count(
      followUps.map((x) =>
        row({
          id: x.id,
          reference: `${x.reference} #${x.number}`,
          on: dateText(x.due_on),
          state: x.state,
          link: { screen: 'cases', id: x.case_id },
        }),
      ),
    ),
  )

  const punch = await db
    .selectFrom('quality.punch_items as i')
    .innerJoin('crm.projects as p', 'p.id', 'i.project_id')
    .select(['i.id', 'i.job_id', 'i.state', 'i.due_on', 'p.reference'])
    .where('i.state', 'in', ['open', 'corrected'])
    .orderBy('i.due_on')
    .orderBy('i.id')
    .execute()
  out.set(
    'quality.open_punch_items',
    count(
      punch.map((i) =>
        row({
          id: i.id,
          reference: i.reference,
          on: dateText(i.due_on),
          state: i.state,
          link: { screen: 'quality-reviews', id: i.job_id },
        }),
      ),
    ),
  )

  const checks = await db
    .selectFrom('finance.payments as y')
    .innerJoin('crm.projects as p', 'p.id', 'y.project_id')
    .select(['y.id', 'y.job_id', 'y.state', 'y.received_on', 'y.amount_cents', 'p.reference'])
    .where('y.method', '=', 'check')
    .where('y.state', 'in', PENDING)
    .orderBy('y.received_on')
    .orderBy('y.id')
    .execute()
  const checkRows = checks.map((y) =>
    row({
      id: y.id,
      reference: y.reference,
      on: dateText(y.received_on),
      state: y.state,
      cents: Number(y.amount_cents),
      link: { screen: 'payments', id: y.job_id },
    }),
  )
  out.set('payments.pending_checks_count', count(checkRows))
  out.set('payments.pending_checks', amount(checkRows))

  // Privacy requests: the internal deadlines (FACT-BUSINESS-CALENDAR) and the legal deadline, apart (OWN-DEC-205).
  const privacy = await db
    .selectFrom('privacy.privacy_requests')
    .select(['id', 'reference', 'state', 'submitted_at'])
    .where('state', 'in', ['received', 'under_review'])
    .orderBy('submitted_at')
    .orderBy('id')
    .execute()
  const deadlines = await requestDeadlines(
    db,
    privacy.map((p) => p.id),
    now,
  )
  const privacyRow = (p: (typeof privacy)[number], on: string | null) =>
    row({ id: p.id, reference: p.reference, on, state: p.state, link: { screen: 'privacy', id: null } })
  out.set('overview.privacy_open', count(privacy.map((p) => privacyRow(p, deadlines.get(p.id)?.targetOn ?? null))))
  out.set(
    'overview.privacy_overdue',
    count(
      privacy
        .filter((p) =>
          (deadlines.get(p.id)?.alerts ?? []).some((a) => a === 'acknowledgment_overdue' || a === 'completion_overdue'),
        )
        .map((p) => privacyRow(p, deadlines.get(p.id)?.targetOn ?? null)),
    ),
  )
  out.set(
    'overview.privacy_legal_overdue',
    count(
      privacy
        .filter((p) => (deadlines.get(p.id)?.alerts ?? []).includes('legal_deadline_overdue'))
        .map((p) => privacyRow(p, deadlines.get(p.id)?.legalDeadline.on ?? null)),
    ),
  )

  // The target gross margin in force (TSK-0131): basis points, or NOT CONFIGURED.
  const target = marginTarget(await loadConfig(db)).targetBps
  out.set('costs.margin_target', { rows: [], value: target === null ? NOT_CONFIGURED : known(target) })

  return { sources: out, assignees: [...assignees.values()] }
}

const QUEUE: RowLink = { screen: 'queue', id: null }
const sortByOn = (rows: DrillRow[]) =>
  rows.sort((a, b) => ((a.on ?? '') < (b.on ?? '') ? -1 : (a.on ?? '') > (b.on ?? '') ? 1 : a.id < b.id ? -1 : 1))

type LatestVersion = {
  estimate_id: string
  number: string
  version_id: string
  state: string
  first_published_at: Date
}

/** Each estimate once: its latest version sent to the customer, and when its first version was sent. */
async function latestSentVersions(db: Reader): Promise<LatestVersion[]> {
  const r = await sql<LatestVersion>`
    SELECT e.id AS estimate_id, e.number, l.id AS version_id, l.state, f.first_published_at
      FROM estimating.estimates e
      JOIN LATERAL (SELECT v.id, v.state FROM estimating.estimate_versions v
                     WHERE v.estimate_id = e.id AND v.state NOT IN ('draft', 'in_review')
                     ORDER BY v.version DESC LIMIT 1) l ON true
      JOIN LATERAL (SELECT min(v.published_at) AS first_published_at FROM estimating.estimate_versions v
                     WHERE v.estimate_id = e.id AND v.state NOT IN ('draft', 'in_review')) f ON true
     ORDER BY f.first_published_at, e.id`.execute(db)
  return r.rows
}
const estimateRow = (e: LatestVersion) =>
  row({
    id: e.estimate_id,
    reference: e.number,
    on: iso(e.first_published_at),
    state: e.state,
    link: { screen: 'estimates', id: e.version_id },
  })

// --- Figures counted over a period --------------------------------------------------------------------------------

export async function periodSources(db: Reader, actor: StaffActor, range: Range, now: Date): Promise<Sources> {
  const out: Sources = new Map()
  const inRange = (d: Date) => d.getTime() >= range.start.getTime() && d.getTime() < range.end.getTime()

  // Customer response: the figures of the first-response report, and the requests behind them.
  const report = await responseReport(db, { from: range.start, to: range.end }, now)
  const clocks = await db
    .selectFrom('intake.response_clocks as k')
    .innerJoin('intake.requests as r', 'r.id', 'k.request_id')
    .select([
      'k.request_id',
      'k.started_at',
      'k.due_at',
      'k.stopped_at',
      'k.business_minutes',
      'k.within_target',
      'r.reference',
    ])
    .where('k.started_at', '>=', range.start)
    .where('k.started_at', '<', range.end)
    .orderBy('k.started_at')
    .orderBy('k.request_id')
    .execute()
  const clockRow = (k: (typeof clocks)[number]) =>
    row({
      id: k.request_id,
      reference: k.reference,
      on: iso(k.started_at),
      state:
        k.due_at === null
          ? 'not_configured'
          : k.business_minutes !== null
            ? k.within_target
              ? 'within_target'
              : 'answered'
            : 'awaiting',
      minutes: k.business_minutes,
      link: { screen: 'requests', id: k.request_id },
    })
  const measurable = clocks.filter((k) => k.due_at !== null)
  const answered = measurable.filter((k) => k.business_minutes !== null)
  const decided = measurable.filter((k) => k.stopped_at !== null || (k.due_at as Date).getTime() <= now.getTime())
  const minutesOr = (v: number | null): FigureValue => (v === null ? UNAVAILABLE : known(v))
  out.set('response.received', { rows: clocks.map(clockRow), value: known(report.received) })
  out.set('response.answered', { rows: answered.map(clockRow), value: known(report.answered) })
  out.set('response.awaiting', {
    rows: measurable.filter((k) => k.business_minutes === null).map(clockRow),
    value: known(report.awaiting),
  })
  out.set('response.within_target', {
    rows: answered.filter((k) => k.within_target === true).map(clockRow),
    value: known(report.withinTarget),
  })
  out.set('response.within_target_share', {
    rows: decided.map(clockRow),
    value: minutesOr(report.withinTargetShareBps),
  })
  out.set('response.average_minutes', {
    rows: answered.map(clockRow),
    value: minutesOr(report.averageBusinessMinutes),
  })
  out.set('response.median_minutes', {
    rows: answered.map(clockRow),
    value: minutesOr(report.medianBusinessMinutes),
  })
  out.set('response.not_configured', {
    rows: clocks.filter((k) => k.due_at === null).map(clockRow),
    value: known(report.notConfigured),
  })

  // Estimates first sent in the period, once each (revisions count under it), by their latest sent version.
  const sent = (await latestSentVersions(db)).filter((e) => inRange(new Date(e.first_published_at)))
  const outcome = (state: string) =>
    state === 'accepted'
      ? 'approved'
      : state === 'declined' || state === 'expired' || state === 'withdrawn'
        ? state
        : 'awaiting'
  out.set('estimates.sent', count(sent.map(estimateRow)))
  for (const o of ['approved', 'declined', 'expired', 'withdrawn', 'awaiting'] as const)
    out.set(`estimates.${o}`, count(sent.filter((e) => outcome(e.state) === o).map(estimateRow)))

  // Job quality: jobs that became operationally complete (the review passed) in the period; the first decision of
  // each review (pass, or punch items required) decided in it; return visits dated in it.
  const passed = await sql<{ job_id: string; reference: string; passed_at: Date }>`
    SELECT DISTINCT ON (r.job_id) r.job_id, p.reference, r.passed_at
      FROM quality.reviews r JOIN crm.projects p ON p.id = r.project_id
     WHERE r.passed_at >= ${range.start} AND r.passed_at < ${range.end}
     ORDER BY r.job_id, r.passed_at`.execute(db)
  const completed = sortByOn(
    passed.rows.map((r) =>
      row({
        id: r.job_id,
        reference: r.reference,
        on: iso(r.passed_at),
        state: 'passed',
        link: { screen: 'quality-reviews', id: r.job_id },
      }),
    ),
  )
  out.set('quality.completed_jobs', count(completed))
  const firsts = await sql<{ review_id: string; job_id: string; reference: string; to_state: string; at: Date }>`
    SELECT * FROM (
      SELECT DISTINCT ON (e.review_id) e.review_id, r.job_id, p.reference, e.to_state, e.at
        FROM quality.review_events e
        JOIN quality.reviews r ON r.id = e.review_id
        JOIN crm.projects p ON p.id = r.project_id
       WHERE e.event IN ('pass', 'require_punch') AND e.punch_item_id IS NULL
       ORDER BY e.review_id, e.seq) first
     WHERE first.at >= ${range.start} AND first.at < ${range.end}
     ORDER BY first.at, first.review_id`.execute(db)
  const decidedRows = firsts.rows.map((e) =>
    row({
      id: e.review_id,
      reference: e.reference,
      on: iso(e.at),
      state: e.to_state,
      link: { screen: 'quality-reviews', id: e.job_id },
    }),
  )
  const passedFirst = decidedRows.filter((r) => r.state === 'passed')
  out.set('quality.reviews_decided', count(decidedRows))
  out.set('quality.reviews_passed_first', count(passedFirst))
  out.set('quality.pass_rate', { rows: decidedRows, value: sharePoints(passedFirst.length, decidedRows.length) })
  const returns = await db
    .selectFrom('work.visits as v')
    .innerJoin('crm.projects as p', 'p.id', 'v.project_id')
    .select(['v.id', 'v.local_date', 'v.state', 'p.reference'])
    .where('v.purpose', '=', 'return_work')
    .where('v.state', 'not in', ['canceled', 'expired'])
    .where('v.local_date', '>=', range.from)
    .where('v.local_date', '<=', range.to)
    .orderBy('v.local_date')
    .orderBy('v.id')
    .execute()
  out.set(
    'quality.return_visits',
    count(
      returns.map((v) =>
        row({
          id: v.id,
          reference: v.reference,
          on: dateText(v.local_date),
          state: v.state,
          link: { screen: 'visit-times', id: v.id },
        }),
      ),
    ),
  )

  // Invoiced revenue: final invoices issued in the period (invoiced).
  const issued = await db
    .selectFrom('finance.invoices as i')
    .innerJoin('crm.projects as p', 'p.id', 'i.project_id')
    .select(['i.id', 'i.number', 'i.state', 'i.issued_at', 'i.total_cents', 'p.reference'])
    .where('i.kind', '=', 'final')
    .where('i.state', 'in', ['issued', 'partially_paid', 'paid'])
    .where('i.issued_at', '>=', range.start)
    .where('i.issued_at', '<', range.end)
    .orderBy('i.issued_at')
    .orderBy('i.id')
    .execute()
  const invoiceRows = issued.map((i) =>
    row({
      id: i.id,
      reference: i.number ?? i.reference,
      on: iso(i.issued_at),
      state: i.state,
      cents: Number(i.total_cents),
      link: { screen: 'invoice-reminders', id: i.id },
    }),
  )
  out.set('payments.invoices_issued', count(invoiceRows))
  out.set('payments.invoiced', amount(invoiceRows))

  // Money received: verified payments received in the period, once per payment, by method.
  const payments = await db
    .selectFrom('finance.payments as y')
    .innerJoin('crm.projects as p', 'p.id', 'y.project_id')
    .select(['y.id', 'y.job_id', 'y.method', 'y.state', 'y.received_on', 'y.amount_cents', 'p.reference'])
    .where('y.state', 'in', VERIFIED)
    .where('y.received_on', '>=', range.from)
    .where('y.received_on', '<=', range.to)
    .orderBy('y.received_on')
    .orderBy('y.id')
    .execute()
  const paymentRow = (y: (typeof payments)[number]) =>
    row({
      id: y.id,
      reference: y.reference,
      on: dateText(y.received_on),
      state: `${y.method}:${y.state}`,
      cents: Number(y.amount_cents),
      link: { screen: 'payments', id: y.job_id },
    })
  const byMethod = DASHBOARD_PAYMENT_METHODS.map((m) => {
    const s = amount(payments.filter((y) => y.method === m).map(paymentRow))
    out.set(`payments.received.${m}`, s)
    return s
  })
  // The total is the methods added together: one basis (combinable), so it equals the sum of the rows.
  out.set('payments.received', {
    rows: payments.map(paymentRow),
    value: sumFigures(
      'payments_received',
      byMethod.map((s) => s.value),
    ),
  })

  // Refunds that succeeded and credits issued or applied, by the date the Owner approved them; write-offs apart.
  const adjustments = await db
    .selectFrom('finance.refunds as f')
    .innerJoin('crm.projects as p', 'p.id', 'f.project_id')
    .select(['f.id', 'f.job_id', 'f.type', 'f.state', 'f.approved_at', 'f.amount_cents', 'p.reference'])
    .where((eb) =>
      eb.or([
        eb.and([eb('f.type', '=', 'refund'), eb('f.state', '=', 'succeeded')]),
        eb.and([eb('f.type', '=', 'credit'), eb('f.state', 'in', ['issued', 'applied'])]),
      ]),
    )
    .where('f.approved_at', '>=', range.start)
    .where('f.approved_at', '<', range.end)
    .orderBy('f.approved_at')
    .orderBy('f.id')
    .execute()
  const adjustmentRow = (f: (typeof adjustments)[number]) =>
    row({
      id: f.id,
      reference: f.reference,
      on: iso(f.approved_at),
      state: f.state,
      cents: Number(f.amount_cents),
      link: { screen: 'payments', id: f.job_id },
    })
  out.set('payments.refunds', amount(adjustments.filter((f) => f.type === 'refund').map(adjustmentRow)))
  out.set('payments.credits', amount(adjustments.filter((f) => f.type === 'credit').map(adjustmentRow)))
  // NOT CONFIGURED: how write-offs are presented (bad debt, a revenue reduction, ...) is the CPA's or the Owner's.
  out.set('payments.write_offs', { rows: [], value: NOT_CONFIGURED })

  const fees = await db
    .selectFrom('finance.provider_fees')
    .select(['id', 'incurred_on', 'amount_cents', 'reference', 'provider'])
    .where('incurred_on', '>=', range.from)
    .where('incurred_on', '<=', range.to)
    .orderBy('incurred_on')
    .orderBy('id')
    .execute()
  out.set(
    'payments.fees',
    amount(
      fees.map((x) =>
        row({
          id: x.id,
          reference: x.reference,
          on: dateText(x.incurred_on),
          state: x.provider,
          cents: Number(x.amount_cents),
        }),
      ),
    ),
  )
  const payouts = await db
    .selectFrom('finance.payouts')
    .select(['id', 'paid_out_on', 'amount_cents', 'reference', 'provider'])
    .where('paid_out_on', '>=', range.from)
    .where('paid_out_on', '<=', range.to)
    .orderBy('paid_out_on')
    .orderBy('id')
    .execute()
  out.set(
    'payments.payouts',
    amount(
      payouts.map((x) =>
        row({
          id: x.id,
          reference: x.reference,
          on: dateText(x.paid_out_on),
          state: x.provider,
          cents: Number(x.amount_cents),
        }),
      ),
    ),
  )

  // Job costs of the jobs completed in the period: complete only once every cost line is (never zero for unknown).
  const costRows: DrillRow[] = []
  const marginRows: (DrillRow & { flag: string; reviewed: boolean })[] = []
  let allComplete = true
  for (const job of completed) {
    const v = await jobCostsView(db, actor, job.id)
    const actual = v.totals.actual
    if (actual.state !== 'complete') allComplete = false
    marginRows.push({
      ...row({
        id: job.id,
        reference: job.reference,
        on: job.on,
        state: v.margin.actual.state === 'complete' ? v.margin.flag : 'incomplete',
        cents: v.margin.actual.grossProfitCents,
        link: { screen: 'job-costs', id: job.id },
      }),
      flag: v.margin.flag,
      reviewed: v.margin.reviewed,
    })
    costRows.push(
      row({
        id: job.id,
        reference: job.reference,
        on: job.on,
        state: actual.state,
        cents: actual.cents,
        link: { screen: 'job-costs', id: job.id },
      }),
    )
  }
  const recordedCents = costRows.reduce((s, r) => s + (r.cents ?? 0), 0)
  out.set('costs.jobs', count(costRows))
  out.set('costs.complete', count(costRows.filter((r) => r.state === 'complete')))
  out.set('costs.incomplete', count(costRows.filter((r) => r.state !== 'complete')))
  out.set('costs.recorded', {
    rows: costRows,
    value: allComplete ? known(recordedCents) : incomplete(recordedCents),
  })
  const returnCosts = await db
    .selectFrom('quality.return_work_costs as k')
    .innerJoin('quality.return_work as w', 'w.id', 'k.return_work_id')
    .innerJoin('crm.projects as p', 'p.id', 'w.project_id')
    .select(['k.id', 'k.kind', 'k.amount_cents', 'k.recorded_at', 'w.case_id', 'p.reference'])
    .where('k.voided_at', 'is', null)
    .where('k.recorded_at', '>=', range.start)
    .where('k.recorded_at', '<', range.end)
    .orderBy('k.recorded_at')
    .orderBy('k.id')
    .execute()
  const returnRows = returnCosts.map((k) =>
    row({
      id: k.id,
      reference: k.reference,
      on: iso(k.recorded_at),
      state: k.kind,
      cents: Number(k.amount_cents),
      link: { screen: 'cases', id: k.case_id },
    }),
  )
  // Recorded so far, never final (HH-QA-08): always incomplete.
  out.set('costs.return_work', {
    rows: returnRows,
    value: incomplete(returnRows.reduce((s, r) => s + (r.cents ?? 0), 0)),
  })

  // Gross margin of the same jobs (TSK-0131): flagged below the target only when the margin is final (advisory).
  const plain = (rows: typeof marginRows): DrillRow[] => rows.map(({ flag: _f, reviewed: _r, ...r }) => r)
  const finalRows = marginRows.filter((r) => r.state !== 'incomplete')
  const below = marginRows.filter((r) => r.flag === 'below_target')
  out.set('costs.margin_final', count(plain(finalRows)))
  out.set('costs.margin_incomplete', count(plain(marginRows.filter((r) => r.state === 'incomplete'))))
  const targetSet = marginTarget(await loadConfig(db)).targetBps !== null
  const flagged = (rows: typeof marginRows): Source =>
    targetSet ? count(plain(rows)) : { rows: [], value: NOT_CONFIGURED }
  out.set('costs.below_target', flagged(below))
  out.set('costs.below_target_unreviewed', flagged(below.filter((r) => !r.reviewed)))
  return out
}
