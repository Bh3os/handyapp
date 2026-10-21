// The scoped search of a privacy request (TSK-0100; HH-PRIV-03, ENT-PrivacyRequest, OWN-DEC-71, OWN-DEC-113,
// OWN-DEC-70, FACT-RETENTION-SCHEDULE, RULE-HUMAN-REVIEW, OQ-PRIVACY-REQUESTS, OQ-RECORD-ERASURE). For one customer
// and the verified contact who asked, every record kind the software holds about them, counted (never copied), each
// with what a deletion would do and why:
// - delete: the requester's login account and preferences (none are stored yet), their live sessions and project
//   access links (revoked; OWN-DEC-71: separate from business records), and estimates never accepted that nothing
//   blocks (targets.ts).
// - retain, with the reason and, where the software records the start of the period, until when: signed approvals
//   and accepted estimates (protected evidence), estimates under a hold or still open, requests (their erasure is not
//   performed yet, OQ-RECORD-ERASURE), photos, job and safety records, the customer profile needed by kept records,
//   consent records (evidence of permission), audit entries (7 years each, OWN-DEC-142) and the privacy requests.
// - visits (TSK-0066): the committed change history of the requester's visits (work.visit_changes: reschedules,
//   reassignments and cancellations with the FACT-CANCELLATION-RULES outcome in cents, which is a computed outcome,
//   never a charge or refund) is part of the job records and retained with them; the requester's own Request to
//   Reschedule / Request Cancellation rows (work.visit_change_requests) are counted with their requests, retained as
//   the record of what they asked (append-only, migration 0059; PROPOSED). Neither names an estimate version, so
//   neither blocks nor is removed with an estimate never accepted.
// - job packets (TSK-0069, migration 0061): the packet versions of the requester's jobs, what staff viewed and every
//   print or PDF export are job records, retained with them (append-only; the packet holds no access code and no
//   price). They name a job, never an estimate version: an estimate never accepted has no job (a job is protected
//   evidence that blocks the estimate's deletion), so they are never removed with one.
// - appointment reminders (TSK-0067, migration 0060): the reminder deliveries of the requester's visits (drafts,
//   released, sent or cancelled; record 'visit') stay with the visits in the job records. They name a visit, never an
//   estimate version, so an estimate deleted from the same project leaves them as they are (targets.ts removes only
//   the unreleased reminder drafts of the estimate's own versions).
// - exclude: other contacts of the same customer (third-party data, PROPOSED: neither exported nor deleted here). The
//   search covers the requester's own projects: those of their requests and of their login accounts' links.
// - financial records: the deposit records and recorded payments of the requester's projects (TSK-0064) are
//   protected evidence and retained; invoices are not recorded yet, and a payment taken outside the software cannot be
//   ruled out: with the complaint, dispute, claim and other hold checks the software cannot run, the Owner confirms
//   them before any deletion (never treated as none found).
// An unpaid balance never blocks closing login access (OWN-DEC-113): no balance is read here.
import type { Db, Tx } from '@handyhub/db'
import { REQUEST_CLOSED_STATES } from '@handyhub/domain'
import { sql } from 'kysely'
import { loadConfig } from '../../platform/config/index.js'
import { CATEGORY_DEFINITIONS, NOT_RECORDED_CHECKS, type RetentionCategory } from '../retention/schedule.js'
import { estimateTarget, financialEvidence, type CheckOutcome, type DeletionCheck } from './targets.js'

type Reader = Db | Tx

export const PLAN_CATEGORIES = [
  'login_account',
  'access_links',
  'account_preferences',
  'unaccepted_estimates',
  'accepted_agreements',
  'requests',
  'photos',
  'job_records',
  'safety_records',
  'customer_profile',
  'consent_records',
  'audit_log',
  'privacy_requests',
  'third_party_contacts',
  'financial_records',
] as const
export type PlanCategory = (typeof PLAN_CATEGORIES)[number]

export const DISPOSITIONS = ['delete', 'retain', 'exclude', 'none_stored', 'not_recorded'] as const
export type Disposition = (typeof DISPOSITIONS)[number]

export const RETAIN_REASONS = [
  'protected_evidence',
  'retention_period',
  'hold',
  'active_record',
  'needed_by_retained',
  'erasure_not_available',
  'consent_evidence',
  'third_party',
  'request_record',
] as const
export type RetainReason = (typeof RETAIN_REASONS)[number]

export type PlanItem = {
  category: PlanCategory
  disposition: Disposition
  count: number
  reason: RetainReason | null
  /** The schedule category that keeps it, and its configured years. */
  retention: RetentionCategory | null
  years: number | null
  /** Until when, where the software records the start of the period; null otherwise. */
  reviewAt: string | null
}

export type PlanSubject = { customerId: string; contactId: string; accountIds: readonly string[] }

export type Plan = {
  items: PlanItem[]
  checks: CheckOutcome[]
  /** The not-recorded checks the Owner confirms before a deletion. */
  confirm: DeletionCheck[]
  /** What a confirmed deletion request removes now. */
  deletable: {
    estimates: { id: string; reference: string; projectId: string }[]
    accountIds: string[]
    grantIds: string[]
    sessions: number
  }
}

const n = (v: unknown) => Number(v ?? 0)
const UTC_YEARS = (d: Date, years: number) =>
  new Date(Date.UTC(d.getUTCFullYear() + years, d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes()))

/** The requester's sign-in accounts that are still open (their own accounts only, never another contact's). */
export async function requesterAccounts(
  db: Reader,
  subject: Omit<PlanSubject, 'accountIds'>,
  extra: readonly string[],
) {
  const rows = await db
    .selectFrom('identity.customer_accounts')
    .select('id')
    .where('customer_id', '=', subject.customerId)
    .where('state', '=', 'active')
    .where((eb) =>
      eb.or([eb('contact_id', '=', subject.contactId), ...(extra.length ? [eb('id', 'in', [...extra])] : [])]),
    )
    .execute()
  return rows.map((r) => r.id)
}

export async function customerPlan(db: Reader, subject: PlanSubject, now = new Date()): Promise<Plan> {
  const config = await loadConfig(db)
  const yearsOf = (c: RetentionCategory): number | null => {
    const key = CATEGORY_DEFINITIONS[c].configKey
    if (!key) return null
    const e = config.get(key)
    return e.state === 'CONFIGURED' && 'years' in e.value ? (e.value as { years: number }).years : null
  }
  const items: PlanItem[] = []
  const add = (
    category: PlanCategory,
    disposition: Disposition,
    count: number,
    reason: RetainReason | null = null,
    retention: RetentionCategory | null = null,
    reviewAt: Date | null = null,
  ) => {
    if (count === 0 && disposition !== 'none_stored' && disposition !== 'not_recorded') return
    items.push({
      category,
      disposition,
      count,
      reason,
      retention,
      years: retention ? yearsOf(retention) : null,
      reviewAt: reviewAt ? reviewAt.toISOString() : null,
    })
  }

  // The requester's own projects: those of the requests they made (another contact's projects of the same customer
  // are third-party records, PROPOSED), and those their login accounts are linked to.
  const projects = await db
    .selectFrom('crm.projects as p')
    .select(['p.id', 'p.reference', 'p.state'])
    .where('p.customer_id', '=', subject.customerId)
    .where((eb) =>
      eb.or([
        eb.exists(
          eb
            .selectFrom('intake.requests as rq')
            .select('rq.id')
            .whereRef('rq.project_id', '=', 'p.id')
            .where('rq.contact_id', '=', subject.contactId),
        ),
        ...(subject.accountIds.length
          ? [
              eb.exists(
                eb
                  .selectFrom('identity.customer_identity_links as l')
                  .select('l.id')
                  .whereRef('l.project_id', '=', 'p.id')
                  .where('l.account_id', 'in', [...subject.accountIds]),
              ),
            ]
          : []),
      ]),
    )
    .execute()
  const projectIds = projects.map((p) => p.id)
  const inProjects = projectIds.length ? projectIds : ['00000000-0000-0000-0000-000000000000']

  // Login account, sessions and project access links of the requester.
  const accountIds = await requesterAccounts(db, subject, subject.accountIds)
  add('login_account', accountIds.length ? 'delete' : 'none_stored', accountIds.length)
  const grants = await db
    .selectFrom('identity.project_access_grants')
    .select('id')
    .where('contact_id', '=', subject.contactId)
    .where('project_id', 'in', inProjects)
    .where('revoked_at', 'is', null)
    .where('expires_at', '>', now)
    .execute()
  const grantIds = grants.map((g) => g.id)
  const sessions = n(
    (
      await db
        .selectFrom('identity.customer_sessions')
        .select(sql<string>`count(*)::text`.as('n'))
        .where('revoked_at', 'is', null)
        .where('expires_at', '>', now)
        .where((eb) =>
          eb.or([
            eb('contact_ref', '=', subject.contactId),
            ...(accountIds.length ? [eb('account_id', 'in', accountIds)] : []),
            ...(grantIds.length ? [eb('grant_id', 'in', grantIds)] : []),
          ]),
        )
        .executeTakeFirstOrThrow()
    ).n,
  )
  add('access_links', 'delete', grantIds.length + sessions)
  // No account preferences are stored by this software yet (TSK-0113).
  add('account_preferences', 'none_stored', 0)

  // Estimates: never accepted and unblocked go; accepted ones are protected evidence; the rest wait.
  const estimates = await db
    .selectFrom('estimating.estimates')
    .select(['id', 'number', 'project_id'])
    .where('project_id', 'in', inProjects)
    .orderBy('number')
    .execute()
  const deletableEstimates: Plan['deletable']['estimates'] = []
  let accepted = 0
  let held = 0
  let open = 0
  for (const e of estimates) {
    const t = await estimateTarget(db, e.id, { now })
    if (t.blockers.includes('protected_evidence')) accepted += 1
    else if (t.blockers.includes('hold_found')) held += 1
    else if (t.blockers.length > 0) open += 1
    else deletableEstimates.push({ id: e.id, reference: e.number, projectId: e.project_id })
  }
  add('unaccepted_estimates', 'delete', deletableEstimates.length)
  add('unaccepted_estimates', 'retain', held, 'hold', 'unaccepted_estimates')
  add('unaccepted_estimates', 'retain', open, 'active_record', 'unaccepted_estimates')
  add('accepted_agreements', 'retain', accepted, 'protected_evidence', 'accepted_agreements')

  // Requests: open ones are in use; closed ones without a job keep their history (OQ-RECORD-ERASURE).
  const requests = await db
    .selectFrom('intake.requests as r')
    .select([
      'r.id',
      'r.state',
      'r.project_id',
      sql<boolean>`EXISTS (SELECT 1 FROM work.jobs j WHERE j.project_id = r.project_id)`.as('has_job'),
      sql<Date | null>`(SELECT max(d.decided_at) FROM intake.request_decisions d
                         WHERE d.request_id = r.id AND d.to_state = r.state)`.as('closed_at'),
    ])
    .where('r.customer_id', '=', subject.customerId)
    .where('r.project_id', 'in', inProjects)
    .execute()
  const closed = requests.filter((r) => (REQUEST_CLOSED_STATES as readonly string[]).includes(r.state) && !r.has_job)
  const withJob = requests.filter((r) => r.has_job)
  const active = requests.length - closed.length - withJob.length
  const lostYears = yearsOf('requests_not_converted')
  const closedEnds = closed.map((r) => (r.closed_at && lostYears !== null ? UTC_YEARS(r.closed_at, lostYears) : null))
  const lastEnd = closedEnds.every((d): d is Date => d !== null)
    ? closedEnds.reduce<Date | null>((a, b) => (a && a.getTime() > b.getTime() ? a : b), null)
    : null
  add('requests', 'retain', closed.length, 'erasure_not_available', 'requests_not_converted', lastEnd)
  add('requests', 'retain', withJob.length, 'needed_by_retained', 'accepted_agreements')
  add('requests', 'retain', active, 'active_record', 'requests_not_converted')

  const requestIds = requests.map((r) => r.id)
  const inRequests = requestIds.length ? requestIds : ['00000000-0000-0000-0000-000000000000']
  const photos = n(
    (
      await db
        .selectFrom('intake.photos')
        .select(sql<string>`count(*)::text`.as('n'))
        .where('request_id', 'in', inRequests)
        .executeTakeFirstOrThrow()
    ).n,
  )
  add('photos', 'retain', photos, 'needed_by_retained', 'job_records')

  const jobs = n(
    (
      await db
        .selectFrom('work.jobs')
        .select(sql<string>`count(*)::text`.as('n'))
        .where('project_id', 'in', inProjects)
        .executeTakeFirstOrThrow()
    ).n,
  )
  const visits = n(
    (
      await db
        .selectFrom('work.visits')
        .select(sql<string>`count(*)::text`.as('n'))
        .where('project_id', 'in', inProjects)
        .executeTakeFirstOrThrow()
    ).n,
  )
  // The committed change history of those visits (TSK-0066) stays with the job records.
  const visitChanges = n(
    (
      await db
        .selectFrom('work.visit_changes')
        .select(sql<string>`count(*)::text`.as('n'))
        .where('project_id', 'in', inProjects)
        .executeTakeFirstOrThrow()
    ).n,
  )
  // The packet versions, views and exports of those jobs (TSK-0069) stay with the job records.
  const packets = n(
    (
      await sql<{ n: string }>`SELECT (
          (SELECT count(*) FROM work.job_packets k JOIN work.jobs j ON j.id = k.job_id
            WHERE j.project_id = ANY(${sql.val(inProjects)}::uuid[]))
        + (SELECT count(*) FROM work.job_packet_views k JOIN work.jobs j ON j.id = k.job_id
            WHERE j.project_id = ANY(${sql.val(inProjects)}::uuid[]))
        + (SELECT count(*) FROM work.job_packet_exports k JOIN work.jobs j ON j.id = k.job_id
            WHERE j.project_id = ANY(${sql.val(inProjects)}::uuid[])))::text AS n`.execute(db)
    ).rows[0]?.n,
  )
  // The appointment reminders of those visits (TSK-0067: message deliveries of the visit record) stay with them.
  const visitReminders = await db
    .selectFrom('platform.message_deliveries as d')
    .innerJoin('work.visits as v', (j) => j.on(sql<boolean>`v.id::text = d.record_id`))
    .select('d.id')
    .where('d.record_type', '=', 'visit')
    .where('d.message_key', '=', 'reminder.appointment')
    .where('v.project_id', 'in', inProjects)
    .execute()
  add(
    'job_records',
    'retain',
    jobs + visits + visitChanges + packets + visitReminders.length,
    'active_record',
    'job_records',
  )
  // The requester's own change requests of their visits (TSK-0066, HH-PORT-04): the record of what they asked.
  const changeRequests = n(
    (
      await db
        .selectFrom('work.visit_change_requests')
        .select(sql<string>`count(*)::text`.as('n'))
        .where('project_id', 'in', inProjects)
        .where('requested_by_contact', '=', subject.contactId)
        .executeTakeFirstOrThrow()
    ).n,
  )
  add('requests', 'retain', changeRequests, 'request_record', 'job_records')

  const holds = await db.selectFrom('work.holds').select(['state']).where('project_id', 'in', inProjects).execute()
  const openHolds = holds.filter((h) => h.state === 'open' || h.state === 'under_review').length
  add('safety_records', 'retain', openHolds, 'hold', 'safety_records')
  add('safety_records', 'retain', holds.length - openHolds, 'retention_period', 'safety_records')

  const contacts = await db
    .selectFrom('crm.contacts')
    .select(['id', 'email_normalized', 'phone_e164'])
    .where('customer_id', '=', subject.customerId)
    .execute()
  const requester = contacts.find((c) => c.id === subject.contactId)
  const properties = n(
    (
      await db
        .selectFrom('crm.customer_properties')
        .select(sql<string>`count(*)::text`.as('n'))
        .where('customer_id', '=', subject.customerId)
        .executeTakeFirstOrThrow()
    ).n,
  )
  add('customer_profile', 'retain', 1 + (requester ? 1 : 0) + properties, 'needed_by_retained', 'customer_profiles')
  add('third_party_contacts', 'exclude', contacts.length - (requester ? 1 : 0), 'third_party')

  const destinations = [requester?.email_normalized, requester?.phone_e164].filter((d): d is string => Boolean(d))
  const consents = destinations.length
    ? n(
        (
          await db
            .selectFrom('platform.consent_records')
            .select(sql<string>`count(*)::text`.as('n'))
            .where('destination', 'in', destinations)
            .executeTakeFirstOrThrow()
        ).n,
      )
    : 0
  add('consent_records', 'retain', consents, 'consent_evidence', 'not_scheduled')

  const versionIds = estimates.length
    ? (
        await db
          .selectFrom('estimating.estimate_versions')
          .select('id')
          .where(
            'estimate_id',
            'in',
            estimates.map((e) => e.id),
          )
          .execute()
      ).map((v) => v.id)
    : []
  // The audit entries of the projects' visits and change requests (TSK-0065, TSK-0066), of their jobs (the job packet
  // entries name the job, TSK-0069) and of the visits' appointment reminders (TSK-0067) are counted with the rest.
  const visitTargets = projectIds.length
    ? [
        ...(await db.selectFrom('work.visits').select('id').where('project_id', 'in', projectIds).execute()),
        ...(await db
          .selectFrom('work.visit_change_requests')
          .select('id')
          .where('project_id', 'in', projectIds)
          .execute()),
        ...(await db.selectFrom('work.jobs').select('id').where('project_id', 'in', projectIds).execute()),
        ...visitReminders,
      ].map((v) => v.id)
    : []
  const targets = [...projectIds, ...requestIds, ...versionIds, ...estimates.map((e) => e.id), ...visitTargets]
  const audits = targets.length
    ? n(
        (
          await db
            .selectFrom('platform.audit_events')
            .select(sql<string>`count(*)::text`.as('n'))
            .where('target_id', 'in', targets)
            .executeTakeFirstOrThrow()
        ).n,
      )
    : 0
  add('audit_log', 'retain', audits, 'retention_period', 'audit_log')

  const privacyRequests = n(
    (
      await db
        .selectFrom('privacy.privacy_requests')
        .select(sql<string>`count(*)::text`.as('n'))
        .where('customer_id', '=', subject.customerId)
        .executeTakeFirstOrThrow()
    ).n,
  )
  add('privacy_requests', 'retain', privacyRequests, 'request_record', 'not_scheduled')
  // Deposit records and recorded payments (TSK-0064) are protected evidence; no invoice is recorded yet (TSK-0085)
  // and a payment taken outside the software cannot be ruled out: the Owner checks those.
  let payments = 0
  let deposits = 0
  for (const projectId of projectIds) {
    const f = await financialEvidence(db, { projectId })
    payments += f.payments
    deposits += f.deposits
  }
  add('financial_records', 'retain', payments + deposits, 'protected_evidence', 'financial_records')
  add('financial_records', 'not_recorded', 0, null, 'financial_records')

  const checks: CheckOutcome[] = [
    openHolds > 0
      ? { check: 'open_holds', result: 'found', count: openHolds }
      : { check: 'open_holds', result: 'none_found' },
    ...NOT_RECORDED_CHECKS.map((check) => ({ check: check as DeletionCheck, result: 'not_recorded' as const })),
    { check: 'issued_invoices', result: 'not_recorded' },
    payments > 0
      ? { check: 'payments', result: 'found', count: payments }
      : { check: 'payments', result: 'not_recorded' },
  ]
  return {
    items,
    checks,
    confirm: checks.filter((c) => c.result === 'not_recorded').map((c) => c.check),
    deletable: { estimates: deletableEstimates, accountIds, grantIds, sessions },
  }
}
