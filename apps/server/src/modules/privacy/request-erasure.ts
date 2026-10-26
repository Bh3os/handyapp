// The erasure of a request that never became a job, with a reference-and-dates remainder (TSK-0137; HH-PRIV-08,
// HH-PRIV-05, T72, OWN-DEC-176, OWN-DEC-177, OWN-DEC-70, ENT-Request, ENT-ConsentPreference, ENT-Photo, ENT-Message,
// ENT-RetentionReview, RULE-HUMAN-REVIEW). Never automatic: it runs only when the Owner confirms Delete on the
// request's review entry (decisions.ts) or when a restore re-applies that recorded decision (reapply.ts).
// - The plan: read under the request's and the project's row locks, it names every row that goes, by table, and the
//   counts the confirmation shows; the erasure deletes exactly those rows in the same transaction as the deletion log
//   entry (migration 0112 lets only that transaction delete them) and refuses (RECORD_CHANGED) when any count differs.
// - Removed (OWN-DEC-176 "Remove personal information"): the submission (description, answers, timing, preferences,
//   the original submission), its photos and their stored files, internal notes, logged calls, questions and replies,
//   conversations and messages with their deliveries and provider receipts, the handling history (decisions with their
//   notes, assignments, qualification, response clock and events, resolved holds, queue items), work packages,
//   discount requests, the estimates never accepted (targets.ts eraseEstimate) and their publication approvals, site
//   contacts and coverage acceptances, access links (guest links, receipt and upload links, account links to the
//   project), sessions started from those links, closed access-help requests naming the reference, waiting jobs
//   (cancelled), stored responses of earlier writes that name an erased record (idempotency records, kept after they
//   expire), the project record, and the customer, contact and property records when no kept record needs them.
// - Kept: the remainder (privacy.request_remainders: reference, creation date, closure date, final status and the
//   deletion log entry, kept apart from customer records), the review entry, the deletion log and the audit entries
//   (references only; audit entries follow their own retention workflow, OWN-DEC-164).
// - Records belonging to other projects are never touched: the customer and contact records stay as they are while
//   another project, request, login account, privacy request, message, site contact or link still names them, and the
//   property while another project, request or customer does; the project record (with its customer and property)
//   stays while a privacy request or a message of another project names it. Each is listed under what stays.
// - Consent evidence (OWN-DEC-176 "Consent records"): when the contact records go, the consent records of their email
//   and phone move to the restricted compliance record (privacy.consent_evidence) with their own review date, unless
//   another record on file uses that destination (then they stay, as that record's evidence). PROPOSED: the review
//   date is the last relevant use (the latest consent record or message sent to it) plus the consent-records period
//   configured in retention.consent_records (OWN-DEC-177, TSK-0138), as a calendar date in the business time zone;
//   nothing is deleted at that date. A period or zone NOT CONFIGURED leaves the date empty.
// - Blocked (Archive is offered): a hold or open case, protected evidence (an approval, a job, financial records), a
//   record still in use (the request or project not closed, an estimate still open, an open access-help request), and
//   linked records this erasure does not remove: site visits and their field records, cases, photo publication
//   permissions and links between customer records (PROPOSED, OQ-REQUEST-ERASURE-DETAILS). TSK-0152 (OWN-DEC-201 I4):
//   the accounting checks are found or none found in the accounting records, and an unresolved financial discrepancy
//   on the project blocks it until it is resolved in the reconciliation queue.
// - Search and caches: staff search reads the tables themselves and the server keeps no cache of request content, so
//   the rows' removal is their removal; queued jobs naming the erased records are cancelled and any job that runs
//   later finds them gone. Copies in backups stay until those backups expire (NOT CONFIGURED); a restore re-applies the
//   erasure from the exported deletion log (T72).
import type { Db, Tx } from '@handyhub/db'
import { localDateOf, REQUEST_CLOSED_STATES } from '@handyhub/domain'
import { sql, type RawBuilder } from 'kysely'
import { ApiError } from '../../api/errors.js'
import { loadConfig } from '../../platform/config/index.js'
import {
  accountingChecks,
  counted,
  eraseEstimate,
  estimateTarget,
  financialEvidence,
  financialRecordsFound,
  finish,
  holdChecks,
  openCases,
  openHolds,
  unreleasedDrafts,
  type Blocker,
  type Linked,
  type TargetPreview,
} from './targets.js'

type Reader = Db | Tx

/** One table's rows that go, named by a fixed condition (IDs read under the locks, or the erased parent's key). */
type Step = { kind: string; table: string; where: RawBuilder<unknown>; planned: number }

export type RequestErasurePlan = {
  preview: TargetPreview
  /** Present when the request exists. */
  request: {
    id: string
    reference: string
    projectId: string
    state: string
    submittedAt: Date
    closedAt: Date | null
  } | null
  estimates: { id: string; removes: Linked[] }[]
  /** The rows deleted after the estimates, in order (children before parents). */
  steps: Step[]
  /** Sessions named by a kept record (a privacy request, an account change): revoked and detached, not deleted. */
  revokedSessions: string[]
  /** Queued jobs naming the erased records: cancelled. */
  waitingJobs: string[]
  /** Consent records moved to the restricted compliance record, with the last use of each destination. */
  consent: { ids: string[]; lastUse: Record<string, Date> }
  /** Stored files of the photos (the estimates' files come from their erasure). */
  objectKeys: string[]
}

const n = (v: unknown) => Number(v ?? 0)
const uuids = (ids: readonly string[]) => sql`${sql.val([...ids])}::uuid[]`
const texts = (ids: readonly string[]) => sql`${sql.val([...ids])}::text[]`
const anyOf = (column: string, ids: readonly string[]) => sql`${sql.ref(column)} = ANY(${uuids(ids)})`
const eq = (column: string, id: string) => sql`${sql.ref(column)} = ${id}::uuid`

async function idsOf(db: Reader, query: RawBuilder<unknown>): Promise<string[]> {
  const { rows } = await sql<{ id: string }>`${query}`.execute(db)
  return rows.map((r) => r.id)
}

async function countOf(db: Reader, table: string, where: RawBuilder<unknown>): Promise<number> {
  const { rows } = await sql<{ n: string }>`SELECT count(*)::text AS n FROM ${sql.table(table)} WHERE ${where}`.execute(
    db,
  )
  return n(rows[0]?.n)
}

/** The same calendar date some years later (29 February becomes 28 February). */
export function addLocalYears(date: string, years: number): string {
  const y = Number(date.slice(0, 4)) + years
  const md = date.slice(5)
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
  return `${String(y).padStart(4, '0')}-${md === '02-29' && !leap ? '02-28' : md}`
}

/** Linked records a request's erasure does not remove: any one blocks it (PROPOSED). */
const LINKED_TABLES = [
  'work.visits',
  'work.window_offers',
  'work.visit_change_requests',
  'work.visit_changes',
  'work.time_stamps',
  'work.field_events',
  'work.visit_outcomes',
  'work.scheduling_tasks',
  'work.change_orders',
  'work.job_packets',
  'work.photo_publication_permissions',
  'quality.cases',
  'quality.reviews',
  'quality.satisfaction_responses',
] as const

/** Financial rows of the project: protected evidence (HH-DATA-09), never part of an erasure. */
const FINANCE_TABLES = [
  'finance.deposit_requirements',
  'finance.invoice_collection_steps',
  'finance.invoice_documents',
  'finance.invoices',
  'finance.payment_adjustments',
  'finance.payment_receipts',
  'finance.payments',
  'finance.reconciliation_items',
  'finance.refunds',
] as const

function missing(requestId: string, reference: string): RequestErasurePlan {
  return {
    preview: finish({
      record: { type: 'request', id: requestId, reference, projectId: null },
      exists: false,
      permanent: true,
      removes: [],
      keeps: reference ? [{ kind: 'request_remainder', count: 1 }] : [],
      checks: [],
      blockers: ['record_missing'],
    }),
    request: null,
    estimates: [],
    steps: [],
    revokedSessions: [],
    waitingJobs: [],
    consent: { ids: [], lastUse: {} },
    objectKeys: [],
  }
}

/**
 * What erasing a request would do, read now; with `lock`, under the request's and the project's row locks (the
 * erasure's own reading, inside its transaction).
 */
export async function requestErasurePlan(
  db: Reader,
  requestId: string,
  options: { now?: Date | undefined; lock?: boolean } = {},
): Promise<RequestErasurePlan> {
  const now = options.now ?? new Date()
  const lock = options.lock ?? false
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
  if (!UUID.test(requestId)) return missing(requestId, '')
  let rq = db
    .selectFrom('intake.requests')
    .select(['id', 'reference', 'project_id', 'customer_id', 'contact_id', 'property_id', 'state', 'submitted_at'])
    .where('id', '=', requestId)
  if (lock) rq = rq.forUpdate()
  const r = await rq.executeTakeFirst()
  if (!r) {
    const rest = await db
      .selectFrom('privacy.request_remainders')
      .select('reference')
      .where('request_id', '=', requestId)
      .executeTakeFirst()
    return missing(requestId, rest?.reference ?? '')
  }
  const R = r.id
  const P = r.project_id
  const C = r.customer_id
  const Pr = r.property_id
  let pq = db.selectFrom('crm.projects').select(['id', 'state']).where('id', '=', P)
  if (lock) pq = pq.forUpdate()
  const project = await pq.executeTakeFirstOrThrow()
  const closedAt =
    (
      await sql<{ at: Date | null }>`SELECT max(d.decided_at) AS at FROM intake.request_decisions d
        WHERE d.request_id = ${R} AND d.to_state = ${r.state}`.execute(db)
    ).rows[0]?.at ?? null

  // The checks and what blocks the erasure.
  const holds = await openHolds(db, P)
  const cases = await openCases(db, P)
  const count = (table: string, column: string, id: string) => countOf(db, table, eq(column, id))
  const jobs = await count('work.jobs', 'project_id', P)
  const approvals = await count('estimating.approvals', 'project_id', P)
  const evidence = await financialEvidence(db, { projectId: P })
  let financeRows = 0
  for (const table of FINANCE_TABLES) financeRows += await count(table, 'project_id', P)
  let linkedRows = 0
  for (const table of LINKED_TABLES) linkedRows += await count(table, 'project_id', P)
  linkedRows += await countOf(db, 'crm.record_links', sql`project_id = ${P}::uuid OR request_id = ${R}::uuid`)
  const blockers: Blocker[] = []
  if ((holds ?? 0) > 0) blockers.push('hold_found')
  if (approvals > 0 || jobs > 0 || financeRows > 0 || financialRecordsFound(evidence))
    blockers.push('protected_evidence')
  if (evidence.discrepancies > 0) blockers.push('financial_discrepancy')
  if (
    !(REQUEST_CLOSED_STATES as readonly string[]).includes(r.state) ||
    project.state !== 'closed' ||
    closedAt === null
  )
    blockers.push('record_active')
  if (linkedRows > 0) blockers.push('linked_records')

  // The estimates never accepted go with the request; anything that blocks one blocks the request.
  const estimateIds = (
    await db.selectFrom('estimating.estimates').select('id').where('project_id', '=', P).orderBy('number').execute()
  ).map((e) => e.id)
  const estimates: RequestErasurePlan['estimates'] = []
  const estimateRemoves = new Map<string, number>()
  for (const id of estimateIds) {
    const t = await estimateTarget(db, id, { now, lock })
    for (const b of t.blockers) if (!blockers.includes(b)) blockers.push(b)
    estimates.push({ id, removes: t.removes })
    for (const x of t.removes) estimateRemoves.set(x.kind, (estimateRemoves.get(x.kind) ?? 0) + x.count)
  }
  const versionIds = await idsOf(
    db,
    sql`SELECT id FROM estimating.estimate_versions WHERE estimate_id = ANY(${uuids(estimateIds)})`,
  )
  const draftIds = versionIds.length ? await idsOf(db, sql`SELECT d.id ${unreleasedDrafts(versionIds)}`) : []

  // The project's own rows.
  const questions = await idsOf(db, sql`SELECT id FROM intake.questions WHERE project_id = ${P}::uuid`)
  const replies = await idsOf(db, sql`SELECT id FROM intake.question_replies WHERE project_id = ${P}::uuid`)
  const uploads = await idsOf(
    db,
    sql`SELECT id FROM intake.upload_capabilities WHERE request_id = ${R}::uuid OR question_id = ANY(${uuids(questions)})`,
  )
  const photos = (
    await sql<{ id: string; object_key: string }>`SELECT id, object_key FROM intake.photos
      WHERE request_id = ${R}::uuid OR project_id = ${P}::uuid OR capability_id = ANY(${uuids(uploads)})`.execute(db)
  ).rows
  const holdIds = await idsOf(db, sql`SELECT id FROM work.holds WHERE project_id = ${P}::uuid`)
  const packages = await idsOf(db, sql`SELECT id FROM work.work_packages WHERE project_id = ${P}::uuid`)
  const conversations = await idsOf(db, sql`SELECT id FROM comms.conversations WHERE project_id = ${P}::uuid`)
  const messages = await idsOf(
    db,
    sql`SELECT id FROM comms.messages WHERE project_id = ${P}::uuid OR conversation_id = ANY(${uuids(conversations)})`,
  )
  const grants = await idsOf(db, sql`SELECT id FROM identity.project_access_grants WHERE project_id = ${P}::uuid`)
  const links = await idsOf(
    db,
    sql`SELECT id FROM identity.customer_identity_links WHERE project_id = ${P}::uuid OR request_id = ${R}::uuid`,
  )
  // Sessions started from the project's links, or guest sessions of this project only.
  const sessionRows = (
    await sql<{ id: string; named: boolean }>`
      SELECT s.id,
             (EXISTS (SELECT 1 FROM privacy.privacy_requests q WHERE q.session_id = s.id)
              OR EXISTS (SELECT 1 FROM identity.customer_account_changes c WHERE c.session_id = s.id)
              OR EXISTS (SELECT 1 FROM estimating.approvals a WHERE a.customer_session_id = s.id)
              OR EXISTS (SELECT 1 FROM work.change_order_decisions o WHERE o.customer_session_id = s.id)
              OR EXISTS (SELECT 1 FROM estimating.customer_responses x WHERE x.customer_session_id = s.id
                           AND x.project_id <> ${P}::uuid)) AS named
        FROM identity.customer_sessions s
       WHERE s.grant_id = ANY(${uuids(grants)})
          OR (s.via = 'grant' AND s.project_ids = ARRAY[${P}::text])`.execute(db)
  ).rows
  const sessions = sessionRows.filter((s) => !s.named).map((s) => s.id)
  const revokedSessions = sessionRows.filter((s) => s.named).map((s) => s.id)

  // Who else still needs the project, customer, contact and property records.
  const keep = (
    await sql<{ project: boolean; customer: boolean; property: boolean }>`
      WITH k AS (SELECT id FROM crm.contacts WHERE customer_id = ${C}::uuid),
           m AS (SELECT unnest(${uuids(messages)}) AS id)
      SELECT
        (EXISTS (SELECT 1 FROM privacy.privacy_requests q WHERE q.project_id = ${P}::uuid)
         OR EXISTS (SELECT 1 FROM comms.message_links l WHERE (l.from_project_id = ${P}::uuid
                      OR l.to_project_id = ${P}::uuid) AND l.message_id NOT IN (SELECT id FROM m))
         OR EXISTS (SELECT 1 FROM comms.messages x WHERE x.suggested_project_id = ${P}::uuid
                      AND x.id NOT IN (SELECT id FROM m))
         OR EXISTS (SELECT 1 FROM comms.messages x JOIN platform.message_deliveries d ON d.id = x.delivery_id
                     WHERE d.project_id = ${P}::uuid AND x.id NOT IN (SELECT id FROM m))
         -- TSK-0113: a later request sent again from this project names it.
         OR EXISTS (SELECT 1 FROM intake.request_repeats x WHERE x.source_project_id = ${P}::uuid
                      AND x.request_id <> ${R}::uuid)) AS project,
        (EXISTS (SELECT 1 FROM crm.projects p WHERE p.customer_id = ${C}::uuid AND p.id <> ${P}::uuid)
         OR EXISTS (SELECT 1 FROM intake.requests q WHERE q.customer_id = ${C}::uuid AND q.id <> ${R}::uuid)
         OR EXISTS (SELECT 1 FROM identity.customer_accounts a
                     WHERE a.customer_id = ${C}::uuid OR a.contact_id IN (SELECT id FROM k))
         OR EXISTS (SELECT 1 FROM privacy.privacy_requests q
                     WHERE q.customer_id = ${C}::uuid OR q.contact_id IN (SELECT id FROM k))
         OR EXISTS (SELECT 1 FROM crm.record_links l
                     WHERE l.source_customer_id = ${C}::uuid OR l.target_customer_id = ${C}::uuid)
         OR EXISTS (SELECT 1 FROM crm.customers c WHERE c.merged_into_id = ${C}::uuid)
         OR EXISTS (SELECT 1 FROM crm.customers c WHERE c.id = ${C}::uuid AND c.merged_into_id IS NOT NULL)
         OR EXISTS (SELECT 1 FROM comms.conversations v WHERE v.customer_id = ${C}::uuid AND v.project_id <> ${P}::uuid)
         OR EXISTS (SELECT 1 FROM comms.messages x WHERE (x.customer_id = ${C}::uuid OR x.contact_id IN (SELECT id FROM k))
                      AND x.id NOT IN (SELECT id FROM m))
         OR EXISTS (SELECT 1 FROM identity.customer_identity_links i
                     WHERE (i.customer_id = ${C}::uuid OR i.contact_id IN (SELECT id FROM k)) AND i.project_id <> ${P}::uuid)
         OR EXISTS (SELECT 1 FROM identity.project_access_grants g
                     WHERE g.contact_id IN (SELECT id FROM k) AND g.project_id <> ${P}::uuid)
         OR EXISTS (SELECT 1 FROM crm.project_site_contacts s
                     WHERE s.contact_id IN (SELECT id FROM k) AND s.project_id <> ${P}::uuid)
         OR EXISTS (SELECT 1 FROM intake.question_replies q
                     WHERE q.author_contact_id IN (SELECT id FROM k) AND q.project_id <> ${P}::uuid)
         OR EXISTS (SELECT 1 FROM work.visit_change_requests v WHERE v.requested_by_contact IN (SELECT id FROM k))
         OR EXISTS (SELECT 1 FROM work.photo_publication_permissions w WHERE w.customer_id = ${C}::uuid)) AS customer,
        (EXISTS (SELECT 1 FROM crm.projects p WHERE p.property_id = ${Pr}::uuid AND p.id <> ${P}::uuid)
         OR EXISTS (SELECT 1 FROM intake.requests q WHERE q.property_id = ${Pr}::uuid AND q.id <> ${R}::uuid)
         OR EXISTS (SELECT 1 FROM crm.customer_properties c
                     WHERE c.property_id = ${Pr}::uuid AND c.customer_id <> ${C}::uuid)
         OR EXISTS (SELECT 1 FROM work.visits v WHERE v.property_id = ${Pr}::uuid)) AS property`.execute(db)
  ).rows[0] as { project: boolean; customer: boolean; property: boolean }
  const keepProject = keep.project
  const keepCustomer = keepProject || keep.customer
  const keepProperty = keepProject || keep.property

  const contacts = await idsOf(db, sql`SELECT id FROM crm.contacts WHERE customer_id = ${C}::uuid`)
  // The erased contacts' email and phone values that no other record on file uses (their consent evidence moves).
  const destinations = keepCustomer
    ? []
    : (
        await sql<{ d: string }>`
          WITH v AS (
            SELECT DISTINCT d FROM crm.contacts c
              CROSS JOIN LATERAL (VALUES (c.email_normalized), (c.phone_e164), (lower(c.email_verified_value)),
                                         (c.phone_verified_value)) AS x(d)
             WHERE c.customer_id = ${C}::uuid AND d IS NOT NULL)
          SELECT v.d FROM v
           WHERE NOT EXISTS (SELECT 1 FROM crm.contacts o WHERE o.customer_id <> ${C}::uuid
                               AND v.d IN (o.email_normalized, o.phone_e164, lower(o.email_verified_value),
                                           o.phone_verified_value))
             AND NOT EXISTS (SELECT 1 FROM identity.customer_accounts a
                               WHERE v.d IN (lower(a.sign_in_email), a.sign_in_phone))
             AND NOT EXISTS (SELECT 1 FROM crm.project_site_contacts s WHERE s.project_id <> ${P}::uuid
                               AND v.d IN (lower(s.email), s.phone_e164))
             AND NOT EXISTS (SELECT 1 FROM identity.staff_users u WHERE lower(u.email) = v.d)
             AND NOT EXISTS (SELECT 1 FROM identity.staff_escalation_phones e WHERE e.phone = v.d)
           ORDER BY v.d`.execute(db)
      ).rows.map((x) => x.d)

  // Message deliveries: the project's, and (when the contacts go) those sent to them outside any project; never one a
  // kept message names, nor an estimate's reminder draft (removed with the estimate).
  const deliveries = await idsOf(
    db,
    sql`SELECT d.id FROM platform.message_deliveries d
         WHERE (d.project_id = ${P}::uuid
                OR (${!keepCustomer} AND d.project_id IS NULL AND d.recipient_kind = 'customer_contact'
                    AND d.recipient_id = ANY(${texts(contacts)})))
           AND d.id <> ALL(${uuids(draftIds)})
           AND NOT EXISTS (SELECT 1 FROM comms.messages x WHERE x.delivery_id = d.id AND x.id <> ALL(${uuids(messages)}))
           AND NOT EXISTS (SELECT 1 FROM finance.invoice_collection_steps f WHERE f.delivery_id = d.id)
           AND NOT EXISTS (SELECT 1 FROM quality.satisfaction_responses s WHERE s.delivery_id = d.id)`,
  )
  const receipts = await idsOf(
    db,
    sql`SELECT w.id FROM platform.webhook_receipts w
         WHERE (w.id IN (SELECT x.webhook_receipt_id FROM comms.messages x WHERE x.id = ANY(${uuids(messages)}))
                OR w.id IN (SELECT e.receipt_id FROM platform.message_delivery_events e
                             WHERE e.delivery_id = ANY(${uuids(deliveries)})))
           AND NOT EXISTS (SELECT 1 FROM comms.messages x WHERE x.webhook_receipt_id = w.id
                             AND x.id <> ALL(${uuids(messages)}))
           AND NOT EXISTS (SELECT 1 FROM platform.message_delivery_events e WHERE e.receipt_id = w.id
                             AND e.delivery_id <> ALL(${uuids(deliveries)}))`,
  )
  // An open request for access help naming the reference or an erased destination is still being handled.
  const openHelp = await countOf(
    db,
    'identity.access_help_requests',
    sql`state = 'open' AND (reference = ${r.reference} OR contact_value = ANY(${texts(destinations)}))`,
  )
  if (openHelp > 0 && !blockers.includes('record_active')) blockers.push('record_active')
  const help = await idsOf(
    db,
    sql`SELECT id FROM identity.access_help_requests
         WHERE state = 'closed' AND (reference = ${r.reference} OR contact_value = ANY(${texts(destinations)}))`,
  )
  const codes = await idsOf(
    db,
    sql`SELECT c.id FROM identity.verification_codes c WHERE c.destination = ANY(${texts(destinations)})
          AND NOT EXISTS (SELECT 1 FROM identity.customer_identity_links i WHERE i.evidence_code_id = c.id
                            AND i.id <> ALL(${uuids(links)}))
          AND NOT EXISTS (SELECT 1 FROM work.change_order_decisions o WHERE o.verification_code_id = c.id)`,
  )
  const matches = keepCustomer
    ? []
    : await idsOf(
        db,
        sql`SELECT id FROM crm.candidate_matches WHERE customer_id = ${C}::uuid OR candidate_customer_id = ${C}::uuid`,
      )
  const consentRows = destinations.length
    ? (
        await sql<{ id: string; destination: string; recorded_at: Date }>`
          SELECT id, destination, recorded_at FROM platform.consent_records
           WHERE destination = ANY(${texts(destinations)}) ORDER BY seq`.execute(db)
      ).rows
    : []
  // The last relevant use of each destination: its latest consent record or message sent to it.
  const lastUse: Record<string, Date> = {}
  const use = (destination: string, at: Date) => {
    const before = lastUse[destination]
    if (!before || before.getTime() < at.getTime()) lastUse[destination] = at
  }
  for (const c of consentRows) use(c.destination, c.recorded_at)
  if (consentRows.length) {
    const sent = await sql<{ destination: string; at: Date | null }>`
      SELECT destination, max(sent_at) AS at FROM platform.message_deliveries
       WHERE destination = ANY(${texts(destinations)}) AND sent_at IS NOT NULL
       GROUP BY destination`.execute(db)
    for (const s of sent.rows) if (s.at && lastUse[s.destination]) use(s.destination, new Date(s.at))
  }
  const named = [
    r.reference,
    R,
    P,
    ...estimateIds,
    ...versionIds,
    ...questions,
    ...replies,
    ...photos.map((p) => p.id),
    ...grants,
    ...(keepCustomer ? [] : [C, ...contacts]),
    ...(keepProperty ? [] : [Pr]),
  ]
  const mentions = sql`EXISTS (SELECT 1 FROM unnest(${texts(named)}) AS n(v)
    WHERE strpos(platform.idempotency_keys.response_body::text, n.v) > 0)`
  const queueSubjects = [
    R,
    P,
    ...questions,
    ...holdIds,
    ...(keepCustomer ? [] : [C, ...contacts]),
    ...(keepProperty ? [] : [Pr]),
  ]
  const queueItems = await idsOf(
    db,
    sql`SELECT id FROM ops.queue_items WHERE project_id = ${P}::uuid OR reference = ${r.reference}
          OR subject_id = ANY(${texts(queueSubjects)})`,
  )
  const jobTargets = [R, P, ...questions, ...replies, ...photos.map((p) => p.id), ...holdIds, ...deliveries]
  jobTargets.push(...draftIds, ...grants, ...messages)
  const waitingJobs = await idsOf(
    db,
    sql`SELECT id FROM platform.jobs WHERE state = 'queued' AND target_id = ANY(${texts(jobTargets)})`,
  )

  // The deletion order: children before parents.
  const plan: Omit<Step, 'planned'>[] = [
    { kind: 'publication_approvals', table: 'estimating.publication_approvals', where: eq('project_id', P) },
    { kind: 'discount_requests', table: 'estimating.discount_verifications', where: eq('project_id', P) },
    { kind: 'discount_requests', table: 'estimating.discount_requests', where: eq('project_id', P) },
    { kind: 'questions', table: 'intake.question_reply_photos', where: anyOf('reply_id', replies) },
    {
      kind: 'photos',
      table: 'intake.photos',
      where: anyOf(
        'id',
        photos.map((p) => p.id),
      ),
    },
    { kind: 'questions', table: 'intake.question_replies', where: anyOf('id', replies) },
    { kind: 'access_links', table: 'intake.upload_capabilities', where: anyOf('id', uploads) },
    { kind: 'questions', table: 'intake.questions', where: anyOf('id', questions) },
    { kind: 'request_answers', table: 'intake.request_services', where: eq('request_id', R) },
    { kind: 'request_answers', table: 'intake.request_answers', where: eq('request_id', R) },
    { kind: 'handling_history', table: 'intake.request_assignments', where: eq('request_id', R) },
    { kind: 'handling_history', table: 'intake.request_qualifications', where: eq('request_id', R) },
    { kind: 'internal_notes', table: 'intake.request_notes', where: eq('request_id', R) },
    { kind: 'handling_history', table: 'intake.request_decisions', where: eq('request_id', R) },
    { kind: 'conversations', table: 'intake.request_conversations', where: eq('request_id', R) },
    { kind: 'handling_history', table: 'intake.response_events', where: eq('request_id', R) },
    { kind: 'handling_history', table: 'intake.response_clocks', where: eq('request_id', R) },
    { kind: 'access_links', table: 'intake.receipt_capabilities', where: eq('request_id', R) },
    { kind: 'handling_history', table: 'work.holds', where: anyOf('id', holdIds) },
    { kind: 'work_packages', table: 'work.work_package_sop_pins', where: anyOf('work_package_id', packages) },
    { kind: 'work_packages', table: 'work.work_package_loadouts', where: anyOf('work_package_id', packages) },
    { kind: 'work_packages', table: 'work.work_packages', where: anyOf('id', packages) },
    { kind: 'handling_history', table: 'ops.queue_items', where: anyOf('id', queueItems) },
    { kind: 'conversations', table: 'comms.message_links', where: anyOf('message_id', messages) },
    { kind: 'conversations', table: 'comms.messages', where: anyOf('id', messages) },
    { kind: 'conversations', table: 'comms.conversations', where: anyOf('id', conversations) },
    { kind: 'conversations', table: 'comms.project_reply_tokens', where: eq('project_id', P) },
    { kind: 'message_deliveries', table: 'platform.message_delivery_events', where: anyOf('delivery_id', deliveries) },
    {
      kind: 'message_deliveries',
      table: 'platform.message_delivery_attempts',
      where: anyOf('delivery_id', deliveries),
    },
    { kind: 'message_deliveries', table: 'platform.message_deliveries', where: anyOf('id', deliveries) },
    { kind: 'message_deliveries', table: 'platform.webhook_receipts', where: anyOf('id', receipts) },
    // TSK-0118: the project's shares with organizations, the member scopes naming it and the history naming it.
    { kind: 'access_links', table: 'identity.organization_scopes', where: eq('project_id', P) },
    { kind: 'access_links', table: 'identity.organization_projects', where: eq('project_id', P) },
    { kind: 'access_links', table: 'identity.organization_events', where: eq('project_id', P) },
    { kind: 'access_links', table: 'identity.customer_identity_links', where: anyOf('id', links) },
    { kind: 'sessions', table: 'identity.customer_sessions', where: anyOf('id', sessions) },
    { kind: 'access_links', table: 'identity.project_access_grants', where: anyOf('id', grants) },
    { kind: 'project_details', table: 'crm.project_site_contacts', where: eq('project_id', P) },
    { kind: 'project_details', table: 'crm.project_coverage_acceptances', where: eq('project_id', P) },
    { kind: 'help_requests', table: 'identity.access_help_requests', where: anyOf('id', help) },
    // TSK-0113: the request's link to the earlier project it was sent again from.
    { kind: 'request_submission', table: 'intake.request_repeats', where: eq('request_id', R) },
    { kind: 'request_submission', table: 'intake.requests', where: eq('id', R) },
    // Stored responses of earlier writes (the idempotency records, kept after they expire) that name an erased record.
    { kind: 'stored_responses', table: 'platform.idempotency_keys', where: mentions },
  ]
  if (!keepProject) plan.push({ kind: 'project_record', table: 'crm.projects', where: eq('id', P) })
  if (!keepCustomer)
    plan.push(
      { kind: 'customer_profile', table: 'crm.candidate_match_events', where: anyOf('match_id', matches) },
      { kind: 'customer_profile', table: 'crm.candidate_matches', where: anyOf('id', matches) },
      { kind: 'customer_profile', table: 'crm.customer_notes', where: eq('customer_id', C) },
      { kind: 'customer_profile', table: 'crm.record_changes', where: eq('customer_id', C) },
      { kind: 'customer_profile', table: 'identity.verification_attempts', where: anyOf('code_id', codes) },
      { kind: 'customer_profile', table: 'identity.verification_codes', where: anyOf('id', codes) },
      { kind: 'customer_profile', table: 'crm.customer_properties', where: eq('customer_id', C) },
      { kind: 'customer_profile', table: 'crm.contacts', where: eq('customer_id', C) },
      { kind: 'customer_profile', table: 'crm.customers', where: eq('id', C) },
    )
  if (!keepProperty)
    plan.push(
      { kind: 'property_record', table: 'crm.access_code_reveals', where: eq('property_id', Pr) },
      { kind: 'property_record', table: 'crm.access_instruction_secrets', where: eq('property_id', Pr) },
      { kind: 'property_record', table: 'crm.property_addresses', where: eq('property_id', Pr) },
      { kind: 'property_record', table: 'crm.property_details', where: eq('property_id', Pr) },
      { kind: 'property_record', table: 'crm.property_changes', where: eq('property_id', Pr) },
      { kind: 'property_record', table: 'crm.property_time_zones', where: eq('property_id', Pr) },
      { kind: 'property_record', table: 'crm.property_county_verifications', where: eq('property_id', Pr) },
      // TSK-0113: a customer account's name for the property goes with it.
      { kind: 'property_record', table: 'identity.customer_saved_properties', where: eq('property_id', Pr) },
      // The customer's own link to it went with the customer above.
      {
        kind: 'property_record',
        table: 'crm.customer_properties',
        where: keepCustomer ? eq('property_id', Pr) : sql`property_id = ${Pr}::uuid AND customer_id <> ${C}::uuid`,
      },
      { kind: 'property_record', table: 'crm.properties', where: eq('id', Pr) },
    )
  const steps: Step[] = []
  for (const s of plan) steps.push({ ...s, planned: await countOf(db, s.table, s.where) })

  const removes = new Map<string, number>()
  const add = (kind: string, k: number) => removes.set(kind, (removes.get(kind) ?? 0) + k)
  for (const s of steps) add(s.kind, s.planned)
  add('waiting_jobs', waitingJobs.length)
  add('estimates', estimates.length)
  for (const [kind, k] of estimateRemoves) add(kind, k)
  add('stored_files', photos.length)
  const order = [
    'request_submission',
    'request_answers',
    'photos',
    'internal_notes',
    'questions',
    'conversations',
    'message_deliveries',
    'handling_history',
    'work_packages',
    'discount_requests',
    'estimates',
    'estimate_versions',
    'estimate_lines',
    'estimate_line_costs',
    'estimate_internals',
    'estimate_documents',
    'customer_responses',
    'saved_selections',
    'reminder_drafts',
    'publication_approvals',
    'project_details',
    'access_links',
    'sessions',
    'help_requests',
    'stored_responses',
    'waiting_jobs',
    'project_record',
    'customer_profile',
    'property_record',
    'stored_files',
  ]
  const audits = await countOf(
    db,
    'platform.audit_events',
    sql`target_id = ANY(${texts([R, P, ...estimateIds, ...versionIds, ...questions, ...holdIds])})`,
  )
  const keeps: Linked[] = [
    { kind: 'request_remainder', count: 1 },
    ...(keepProject ? [{ kind: 'project_record', count: 1 }] : []),
    ...(keepCustomer ? [{ kind: 'customer_profile', count: 1 }] : []),
    ...(keepProperty ? [{ kind: 'property_record', count: 1 }] : []),
    ...(revokedSessions.length ? [{ kind: 'revoked_sessions', count: revokedSessions.length }] : []),
    ...(consentRows.length ? [{ kind: 'consent_evidence', count: consentRows.length }] : []),
    { kind: 'audit_entries', count: audits },
  ]
  return {
    preview: finish({
      record: { type: 'request', id: R, reference: r.reference, projectId: P },
      exists: true,
      permanent: true,
      removes: order.flatMap((kind) =>
        removes.has(kind) && (removes.get(kind) ?? 0) > 0 ? [{ kind, count: removes.get(kind) ?? 0 }] : [],
      ),
      keeps,
      checks: [
        ...holdChecks(holds, cases),
        counted('signed_approvals', approvals),
        counted('approval_receipts', evidence.receipts),
        counted('jobs', jobs),
        counted('deposit_records', evidence.deposits),
        ...accountingChecks(evidence),
      ],
      blockers,
    }),
    request: { id: R, reference: r.reference, projectId: P, state: r.state, submittedAt: r.submitted_at, closedAt },
    estimates,
    steps,
    revokedSessions,
    waitingJobs,
    consent: { ids: consentRows.map((c) => c.id), lastUse },
    objectKeys: photos.map((p) => p.object_key),
  }
}

export type RequestErasureResult = {
  removed: Record<string, number>
  objectKeys: string[]
  /** The estimates erased with the request (their review entries are decided with it). */
  estimateIds: string[]
}

const changed = () =>
  new ApiError('CONFLICT', { fieldErrors: [{ field: 'record', code: 'RECORD_CHANGED', message: '' }] })

/**
 * Erases a request inside the transaction that wrote its deletion log entry (deletionId; migration 0112 lets only that
 * transaction delete the rows). The plan is read again under the row locks; anything that blocks it, or a count that
 * differs from the plan while deleting, refuses with RECORD_CHANGED and the whole transaction rolls back.
 */
export async function eraseRequest(
  tx: Tx,
  input: { requestId: string; deletionId: string; now?: Date },
): Promise<RequestErasureResult> {
  if (!tx.isTransaction) throw new Error('eraseRequest runs inside the deletion transaction (withTx)')
  const plan = await requestErasurePlan(tx, input.requestId, { now: input.now, lock: true })
  if (!plan.request || plan.preview.blockers.length > 0) throw changed()
  const permit = () => sql`SELECT set_config('handyhub.erasure', ${input.deletionId}, true)`.execute(tx)
  const removed: Record<string, number> = {}
  const add = (kind: string, k: number) => (removed[kind] = (removed[kind] ?? 0) + k)
  const objectKeys = [...plan.objectKeys]
  const run = async (s: Step) => {
    const r = await sql`DELETE FROM ${sql.table(s.table)} WHERE ${s.where}`.execute(tx)
    const k = Number(r.numAffectedRows ?? 0)
    if (k !== s.planned) throw changed()
    add(s.kind, k)
  }
  try {
    await permit()
    // Publication approvals name estimate versions: they go first.
    const first = plan.steps.filter((s) => s.table === 'estimating.publication_approvals')
    for (const s of first) await run(s)
    for (const e of plan.estimates) {
      const erased = await eraseEstimate(tx, { estimateId: e.id, deletionId: input.deletionId })
      for (const x of e.removes) if ((erased.removed[x.kind] ?? 0) !== x.count) throw changed()
      for (const [kind, k] of Object.entries(erased.removed)) add(kind, k)
      objectKeys.push(...erased.objectKeys)
      await permit()
    }
    add('estimates', plan.estimates.length)
    for (const s of plan.steps) if (!first.includes(s)) await run(s)

    // Sessions a kept record names: ended and detached from the links that go.
    if (plan.revokedSessions.length) {
      const r = await sql`UPDATE identity.customer_sessions
        SET grant_id = NULL, revoked_at = coalesce(revoked_at, now()), revoke_reason = coalesce(revoke_reason, 'record_erased')
        WHERE id = ANY(${uuids(plan.revokedSessions)})`.execute(tx)
      if (Number(r.numAffectedRows ?? 0) !== plan.revokedSessions.length) throw changed()
    }
    if (plan.waitingJobs.length) {
      const r = await tx
        .updateTable('platform.jobs')
        .set({ state: 'cancelled', finished_at: sql<Date>`now()`, updated_at: sql<Date>`now()` })
        .where('id', 'in', plan.waitingJobs)
        .where('state', '=', 'queued')
        .executeTakeFirst()
      if (Number(r.numUpdatedRows) !== plan.waitingJobs.length) throw changed()
    }
    add('waiting_jobs', plan.waitingJobs.length)

    // Consent evidence moves to the restricted compliance record with its own review date (OWN-DEC-176).
    if (plan.consent.ids.length) {
      // The consent-records period the Owner configured (OWN-DEC-177: 5 years after the last relevant use, TSK-0138).
      const config = await loadConfig(tx)
      const zone = config.get('business.timezone')
      const period = config.get('retention.consent_records')
      const years = period.state === 'CONFIGURED' ? period.value.years : null
      const reviewOn = (at: Date) =>
        zone.state === 'CONFIGURED' && years !== null ? addLocalYears(localDateOf(at, zone.value.zone), years) : null
      const rows = await tx
        .selectFrom('platform.consent_records')
        .selectAll()
        .where('id', 'in', plan.consent.ids)
        .orderBy('seq')
        .execute()
      if (rows.length !== plan.consent.ids.length) throw changed()
      await tx
        .insertInto('privacy.consent_evidence')
        .values(
          rows.map((c) => {
            const last = plan.consent.lastUse[c.destination] ?? c.recorded_at
            return {
              consent_id: c.id,
              consent_seq: c.seq,
              purpose: c.purpose,
              channel: c.channel,
              destination: c.destination,
              granted: c.granted,
              disclosure_version: c.disclosure_version,
              source: c.source,
              evidence: JSON.stringify(c.evidence ?? {}),
              recorded_by: c.recorded_by,
              recorded_at: c.recorded_at,
              last_used_at: last,
              review_on: reviewOn(last),
              policy_key: years === null ? null : 'retention.consent_records',
              policy_version: years === null ? null : period.version,
              deletion_id: input.deletionId,
            }
          }),
        )
        .execute()
      const d = await sql`DELETE FROM platform.consent_records WHERE id = ANY(${uuids(plan.consent.ids)})`.execute(tx)
      if (Number(d.numAffectedRows ?? 0) !== plan.consent.ids.length) throw changed()
    }

    const req = plan.request
    await tx
      .insertInto('privacy.request_remainders')
      .values({
        request_id: req.id,
        reference: req.reference,
        created_at: req.submittedAt,
        closed_at: req.closedAt as Date,
        final_state: req.state,
        deletion_id: input.deletionId,
      })
      .onConflict((oc) => oc.column('request_id').doNothing())
      .execute()
    await sql`SELECT set_config('handyhub.erasure', '', true)`.execute(tx)
  } catch (err) {
    // A row another transaction added meanwhile still names an erased record: refused, nothing kept.
    if ((err as { code?: string }).code === '23503') throw changed()
    throw err
  }
  removed['stored_files'] = objectKeys.length
  return { removed, objectKeys, estimateIds: plan.estimates.map((e) => e.id) }
}

/** The review entries of the estimates erased with a request: decided as deleted by the same deletion (TSK-0137). */
export async function decideErasedEstimates(
  tx: Tx,
  input: { estimateIds: readonly string[]; deletionId: string; reason: string; staffUserId: string; requestId: string },
): Promise<number> {
  if (input.estimateIds.length === 0) return 0
  const entries = await sql<{ id: string }>`
    SELECT rv.id FROM privacy.retention_reviews rv
     WHERE rv.record_type = 'estimate' AND rv.record_id = ANY(${uuids(input.estimateIds)})
       AND NOT EXISTS (SELECT 1 FROM privacy.retention_decisions d WHERE d.review_id = rv.id AND d.decision = 'delete')
     ORDER BY rv.seq`.execute(tx)
  for (const e of entries.rows)
    await tx
      .insertInto('privacy.retention_decisions')
      .values({
        review_id: e.id,
        decision: 'delete',
        reason: input.reason.trim(),
        deletion_id: input.deletionId,
        decided_by: input.staffUserId,
        request_id: input.requestId,
      })
      .execute()
  return entries.rows.length
}
