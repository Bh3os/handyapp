// What the Owner's Delete action may delete, and what stops it (TSK-0100; HH-PRIV-05, HH-PRIV-03, HH-DATA-09,
// ENT-RetentionReview, FACT-RETENTION-SCHEDULE, OWN-DEC-70, OWN-DEC-71, OQ-RECORD-ERASURE, OQ-AUDIT-ENTRY-DELETION).
// - A target is one record the confirmation names: its reference, the attachments and linked rows removed with it,
//   the linked records that stay, whether the deletion is permanent, every check, and every reason it is blocked.
// - Checks: open holds on the record's project (found or none found), the protected evidence the software records
//   (signed approvals, their approval receipts, the jobs they created, the deposit records of those jobs: deposit
//   requirements, waivers and payment allocations, and recorded payments), and the kinds it does not record yet
//   (complaints, warranties, disputes, claims, investigations, unfiled tax returns, legal and insurance holds, issued
//   invoices). A check that is not recorded is never "none found": the Owner confirms each one before anything is
//   deleted. Payments: a recorded payment is found and blocks; none recorded is not "none found" (a payment taken
//   outside the software cannot be ruled out), so the Owner still confirms it.
// - Blockers: a hold found, protected evidence found (Archive, Void or an audited correction instead), a record still
//   in use, and a record type whose erasure this software does not perform: requests that never became jobs keep
//   their history until OQ-RECORD-ERASURE is answered, and audit entries are append-only for every role (ROLE-MATRIX
//   "Edit or delete audit events"; OQ-AUDIT-ENTRY-DELETION). A blocked deletion offers Archive.
// - Erasure of an estimate never accepted: its versions, lines, internal costs and notes, documents, the customer's
//   responses and selections are removed in the transaction that writes the deletion log entry (the database lets
//   only that transaction remove them, migration 0058); the stored files are removed after the commit by the
//   privacy.object_erasure job. So are its reminder drafts that nobody released (TSK-0060: waiting or cancelled,
//   never sent, no delivery event): they are the estimate's own data, not a message anyone received. The project, its
//   request (with its questions and replies, visits and window offers, messages and their links), the review entry,
//   the messages sent about the versions (the estimate-ready notice, a released reminder) and the audit entries stay
//   and keep only references; open queue items about the versions are resolved and their waiting jobs cancelled, and a
//   job or delivery that still names a version finds it gone and stops as stale. Job packets, their views and exports
//   (TSK-0069) name a job, and an estimate with a job is protected evidence, so none goes with an estimate; the
//   appointment reminders of the project's visits (TSK-0067) name the visit, not a version, and stay as they are.
import type { Db, Tx } from '@handyhub/db'
import { sql } from 'kysely'
import { HOLD_CHECKS, NOT_RECORDED_CHECKS } from '../retention/schedule.js'

type Reader = Db | Tx

export const TARGET_TYPES = ['estimate', 'request', 'audit_event', 'customer_account'] as const
export type TargetType = (typeof TARGET_TYPES)[number]

/** The checks a deletion runs or lists: the review's hold checks, then the protected evidence. */
export const DELETION_CHECKS = [
  ...HOLD_CHECKS,
  'signed_approvals',
  'approval_receipts',
  'jobs',
  'deposit_records',
  'issued_invoices',
  'payments',
] as const
export type DeletionCheck = (typeof DELETION_CHECKS)[number]
export type CheckResult = 'found' | 'none_found' | 'not_applicable' | 'not_recorded'
export type CheckOutcome = { check: DeletionCheck; result: CheckResult; count?: number }

/** Checks the software cannot run yet: the Owner confirms each before a deletion (never treated as none found). */
export const UNRECORDED_DELETION_CHECKS: readonly DeletionCheck[] = [
  ...NOT_RECORDED_CHECKS,
  // Issued invoices (finance.invoices, TSK-0085) and payments (finance.payments, TSK-0064) are recorded: one found
  // blocks; while none is recorded the Owner still checks for any issued or taken outside the software (PROPOSED).
  'issued_invoices',
  'payments',
]

export const BLOCKERS = [
  'hold_found',
  'protected_evidence',
  'record_active',
  'erasure_not_available',
  'audit_append_only',
  'record_missing',
  'already_deleted',
] as const
export type Blocker = (typeof BLOCKERS)[number]

export type Linked = { kind: string; count: number }

export type TargetPreview = {
  record: { type: TargetType; id: string; reference: string; projectId: string | null }
  exists: boolean
  /** The rows and stored files go; copies in backups stay until those backups expire (NOT CONFIGURED). */
  permanent: boolean
  /** Attachments and linked rows removed with the record. */
  removes: Linked[]
  /** Linked records that stay (they keep the reference only). */
  keeps: Linked[]
  checks: CheckOutcome[]
  blockers: Blocker[]
  /** The not-recorded checks the Owner must confirm before Confirm Delete. */
  confirm: DeletionCheck[]
}

const n = (v: unknown) => Number(v ?? 0)

async function openHolds(db: Reader, projectId: string | null): Promise<number | null> {
  if (!projectId) return null
  const r = await db
    .selectFrom('work.holds')
    .select(sql<string>`count(*)::text`.as('n'))
    .where('project_id', '=', projectId)
    .where('state', 'in', ['open', 'under_review'])
    .executeTakeFirstOrThrow()
  return n(r.n)
}

function holdChecks(open: number | null): CheckOutcome[] {
  return [
    open === null
      ? { check: 'open_holds', result: 'not_applicable' }
      : open > 0
        ? { check: 'open_holds', result: 'found', count: open }
        : { check: 'open_holds', result: 'none_found' },
    ...NOT_RECORDED_CHECKS.map((check) => ({ check: check as DeletionCheck, result: 'not_recorded' as const })),
  ]
}

const counted = (check: DeletionCheck, count: number): CheckOutcome =>
  count > 0 ? { check, result: 'found', count } : { check, result: 'none_found' }

/** An issued invoice or a recorded payment is found; none recorded is still the Owner's check. */
const invoiceAndPaymentChecks = (invoices: number, payments: number): CheckOutcome[] => [
  invoices > 0
    ? { check: 'issued_invoices', result: 'found', count: invoices }
    : { check: 'issued_invoices', result: 'not_recorded' },
  payments > 0
    ? { check: 'payments', result: 'found', count: payments }
    : { check: 'payments', result: 'not_recorded' },
]

export type FinancialEvidence = { receipts: number; deposits: number; payments: number; invoices: number }

/**
 * The approval receipts, deposit records (requirements, waivers, payment allocations) and recorded payments that
 * belong to the approvals of these estimate versions, or to a project: protected evidence (HH-DATA-09), never
 * deleted (Archive, Void or an audited correction instead).
 */
export async function financialEvidence(
  db: Reader,
  of: { versionIds: readonly string[] } | { projectId: string },
): Promise<FinancialEvidence> {
  if ('versionIds' in of && of.versionIds.length === 0) return { receipts: 0, deposits: 0, payments: 0, invoices: 0 }
  const approvals =
    'versionIds' in of
      ? sql`SELECT a.id FROM estimating.approvals a WHERE a.version_id = ANY(${sql.val([...of.versionIds])}::uuid[])`
      : sql`SELECT a.id FROM estimating.approvals a WHERE a.project_id = ${of.projectId}`
  const { rows } = await sql<{ receipts: string; deposits: string; payments: string; invoices: string }>`
    WITH a AS (${approvals}),
         d AS (SELECT d.id FROM finance.deposit_requirements d WHERE d.approval_id IN (SELECT id FROM a)),
         j AS (SELECT j.id FROM work.jobs j WHERE j.approval_id IN (SELECT id FROM a))
    SELECT
      (SELECT count(*) FROM estimating.approval_receipts r WHERE r.approval_id IN (SELECT id FROM a))::text AS receipts,
      ((SELECT count(*) FROM d)
        + (SELECT count(*) FROM finance.deposit_waivers w WHERE w.deposit_requirement_id IN (SELECT id FROM d))
        + (SELECT count(*) FROM finance.payment_allocations pa WHERE pa.deposit_requirement_id IN (SELECT id FROM d))
      )::text AS deposits,
      (SELECT count(*) FROM finance.payments p
        WHERE p.job_id IN (SELECT id FROM j)
           OR p.id IN (SELECT pa.payment_id FROM finance.payment_allocations pa
                        WHERE pa.deposit_requirement_id IN (SELECT id FROM d))
           ${'projectId' in of ? sql`OR p.project_id = ${of.projectId}` : sql``})::text AS payments,
      -- TSK-0085: issued invoices (a draft is working data, not evidence).
      (SELECT count(*) FROM finance.invoices i WHERE i.state <> 'draft' AND (i.job_id IN (SELECT id FROM j)
           ${'projectId' in of ? sql`OR i.project_id = ${of.projectId}` : sql``}))::text AS invoices`.execute(db)
  return {
    receipts: n(rows[0]?.receipts),
    deposits: n(rows[0]?.deposits),
    payments: n(rows[0]?.payments),
    invoices: n(rows[0]?.invoices),
  }
}

/**
 * The reminder drafts of these versions that nobody released (TSK-0060): waiting or cancelled, never sent, with no
 * delivery event and no message: the estimate's own data, removed with it. A released reminder or a sent notice is a
 * message record and stays.
 */
const unreleasedDrafts = (ids: readonly string[]) => sql`
  FROM platform.message_deliveries d
  WHERE d.record_type = 'estimate_version' AND d.record_id = ANY(${sql.val([...ids])}::text[])
    AND d.release = 'staff_released' AND d.released_by IS NULL AND d.state IN ('draft', 'cancelled')
    AND NOT EXISTS (SELECT 1 FROM platform.message_delivery_events e WHERE e.delivery_id = d.id)
    AND NOT EXISTS (SELECT 1 FROM comms.messages m WHERE m.delivery_id = d.id)`

async function versionMessages(db: Reader, ids: readonly string[]): Promise<{ drafts: number; kept: number }> {
  if (ids.length === 0) return { drafts: 0, kept: 0 }
  const { rows } = await sql<{ drafts: string; total: string }>`
    SELECT (SELECT count(*) ${unreleasedDrafts(ids)})::text AS drafts,
           (SELECT count(*) FROM platform.message_deliveries d WHERE d.record_type = 'estimate_version'
              AND d.record_id = ANY(${sql.val([...ids])}::text[]))::text AS total`.execute(db)
  const drafts = n(rows[0]?.drafts)
  return { drafts, kept: n(rows[0]?.total) - drafts }
}

function finish(p: Omit<TargetPreview, 'confirm'>): TargetPreview {
  const blockers = [...new Set(p.blockers)]
  return {
    ...p,
    blockers,
    confirm: p.checks.filter((c) => c.result === 'not_recorded').map((c) => c.check),
  }
}

/** The versions of an estimate with their states (a published version past its validity reads as expired). */
async function estimateVersions(db: Reader, estimateId: string, now: Date, lock: boolean) {
  let q = db
    .selectFrom('estimating.estimate_versions')
    .select(['id', 'state', 'valid_until', 'customer_pdf_object_key'])
    .where('estimate_id', '=', estimateId)
  if (lock) q = q.forUpdate()
  const rows = await q.execute()
  return rows.map((r) => ({
    ...r,
    effective:
      r.state === 'published' && r.valid_until && r.valid_until.getTime() <= now.getTime() ? 'expired' : r.state,
  }))
}

/** The estimate as the Delete confirmation names it; `lock` takes the estimate's row lock (inside the erasure). */
export async function estimateTarget(
  db: Reader,
  estimateId: string,
  options: { now?: Date; lock?: boolean } = {},
): Promise<TargetPreview> {
  const now = options.now ?? new Date()
  let q = db.selectFrom('estimating.estimates').select(['id', 'number', 'project_id']).where('id', '=', estimateId)
  if (options.lock) q = q.forUpdate()
  const e = await q.executeTakeFirst()
  if (!e) {
    return finish({
      record: { type: 'estimate', id: estimateId, reference: '', projectId: null },
      exists: false,
      permanent: true,
      removes: [],
      keeps: [],
      checks: [],
      blockers: ['record_missing'],
    })
  }
  const versions = await estimateVersions(db, e.id, now, options.lock ?? false)
  const ids = versions.map((v) => v.id)
  const count = async (table: string, column: string) => {
    if (ids.length === 0) return 0
    const { rows } = await sql<{ n: string }>`SELECT count(*)::text AS n FROM ${sql.table(table)}
      WHERE ${sql.ref(column)} = ANY(${sql.val(ids)}::uuid[])`.execute(db)
    return n(rows[0]?.n)
  }
  const documents = await db
    .selectFrom('estimating.estimate_documents')
    .select(['id', 'object_key'])
    .where('version_id', 'in', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
    .execute()
  const approvals = await count('estimating.approvals', 'version_id')
  const snapshots = await count('work.job_scope_snapshots', 'estimate_version_id')
  const jobs =
    ids.length === 0
      ? 0
      : n(
          (
            await sql<{ n: string }>`SELECT count(DISTINCT j.id)::text AS n FROM work.jobs j
              JOIN estimating.approvals a ON a.id = j.approval_id WHERE a.version_id = ANY(${sql.val(ids)}::uuid[])`.execute(
              db,
            )
          ).rows[0]?.n,
        )
  const evidence = await financialEvidence(db, { versionIds: ids })
  const messages = await versionMessages(db, ids)
  const accepted = versions.filter((v) => v.state === 'accepted').length
  const active = versions.filter((v) => ['draft', 'in_review', 'published'].includes(v.effective)).length
  const holds = await openHolds(db, e.project_id)
  const objects = versions.filter((v) => v.customer_pdf_object_key).length + documents.length
  const audits = n(
    (
      await db
        .selectFrom('platform.audit_events')
        .select(sql<string>`count(*)::text`.as('n'))
        .where((eb) =>
          eb.or([
            eb.and([eb('target_type', '=', 'estimate'), eb('target_id', '=', e.id)]),
            ...(ids.length ? [eb.and([eb('target_type', '=', 'estimate_version'), eb('target_id', 'in', ids)])] : []),
          ]),
        )
        .executeTakeFirstOrThrow()
    ).n,
  )
  const blockers: Blocker[] = []
  if ((holds ?? 0) > 0) blockers.push('hold_found')
  if (
    accepted > 0 ||
    approvals > 0 ||
    snapshots > 0 ||
    jobs > 0 ||
    evidence.receipts > 0 ||
    evidence.deposits > 0 ||
    evidence.payments > 0 ||
    evidence.invoices > 0
  )
    blockers.push('protected_evidence')
  if (active > 0) blockers.push('record_active')
  return finish({
    record: { type: 'estimate', id: e.id, reference: e.number, projectId: e.project_id },
    exists: true,
    permanent: true,
    removes: [
      { kind: 'estimate_versions', count: versions.length },
      { kind: 'estimate_lines', count: await count('estimating.estimate_lines', 'version_id') },
      { kind: 'estimate_line_costs', count: await count('estimating.estimate_line_costs', 'version_id') },
      { kind: 'estimate_internals', count: await count('estimating.estimate_version_internals', 'version_id') },
      { kind: 'estimate_documents', count: documents.length },
      { kind: 'customer_responses', count: await count('estimating.customer_responses', 'version_id') },
      { kind: 'saved_selections', count: await count('estimating.approval_selections', 'version_id') },
      { kind: 'reminder_drafts', count: messages.drafts },
      { kind: 'stored_files', count: objects },
    ],
    keeps: [
      { kind: 'project_and_request', count: 1 },
      { kind: 'message_records', count: messages.kept },
      { kind: 'audit_entries', count: audits },
    ],
    checks: [
      ...holdChecks(holds),
      counted('signed_approvals', Math.max(approvals, accepted)),
      counted('approval_receipts', evidence.receipts),
      counted('jobs', jobs),
      counted('deposit_records', evidence.deposits),
      ...invoiceAndPaymentChecks(evidence.invoices, evidence.payments),
    ],
    blockers,
  })
}

/** A request: shown with its checks; its erasure is not performed by this software yet (OQ-RECORD-ERASURE). */
export async function requestTarget(db: Reader, requestId: string): Promise<TargetPreview> {
  const r = await db
    .selectFrom('intake.requests')
    .select(['id', 'reference', 'project_id'])
    .where('id', '=', requestId)
    .executeTakeFirst()
  if (!r)
    return finish({
      record: { type: 'request', id: requestId, reference: '', projectId: null },
      exists: false,
      permanent: false,
      removes: [],
      keeps: [],
      checks: [],
      blockers: ['record_missing'],
    })
  const holds = await openHolds(db, r.project_id)
  const jobs = n(
    (
      await db
        .selectFrom('work.jobs')
        .select(sql<string>`count(*)::text`.as('n'))
        .where('project_id', '=', r.project_id)
        .executeTakeFirstOrThrow()
    ).n,
  )
  const approvals = n(
    (
      await db
        .selectFrom('estimating.approvals')
        .select(sql<string>`count(*)::text`.as('n'))
        .where('project_id', '=', r.project_id)
        .executeTakeFirstOrThrow()
    ).n,
  )
  const evidence = await financialEvidence(db, { projectId: r.project_id })
  const blockers: Blocker[] = ['erasure_not_available']
  if ((holds ?? 0) > 0) blockers.push('hold_found')
  if (
    approvals > 0 ||
    jobs > 0 ||
    evidence.receipts > 0 ||
    evidence.deposits > 0 ||
    evidence.payments > 0 ||
    evidence.invoices > 0
  )
    blockers.push('protected_evidence')
  return finish({
    record: { type: 'request', id: r.id, reference: r.reference, projectId: r.project_id },
    exists: true,
    permanent: false,
    removes: [],
    keeps: [{ kind: 'project_and_request', count: 1 }],
    checks: [
      ...holdChecks(holds),
      counted('signed_approvals', approvals),
      counted('approval_receipts', evidence.receipts),
      counted('jobs', jobs),
      counted('deposit_records', evidence.deposits),
      ...invoiceAndPaymentChecks(evidence.invoices, evidence.payments),
    ],
    blockers,
  })
}

/** An audit entry: append-only for every role (ROLE-MATRIX); Archive or keep longer (OQ-AUDIT-ENTRY-DELETION). */
export async function auditEntryTarget(db: Reader, eventId: string, projectId: string | null): Promise<TargetPreview> {
  const e = await db
    .selectFrom('platform.audit_events')
    .select(['id', 'seq', 'action'])
    .where('id', '=', eventId)
    .executeTakeFirst()
  const holds = await openHolds(db, projectId)
  return finish({
    record: {
      type: 'audit_event',
      id: eventId,
      reference: e ? `#${e.seq} ${e.action}` : '',
      projectId,
    },
    exists: Boolean(e),
    permanent: false,
    removes: [],
    keeps: [],
    checks: holdChecks(holds),
    blockers: e ? ['audit_append_only', ...((holds ?? 0) > 0 ? (['hold_found'] as const) : [])] : ['record_missing'],
  })
}

/** The preview of a record of the deletion-review queue. */
export async function targetOf(
  db: Reader,
  record: { type: string; id: string; projectId: string | null },
  options: { now?: Date; lock?: boolean } = {},
): Promise<TargetPreview> {
  switch (record.type) {
    case 'estimate':
      return estimateTarget(db, record.id, options)
    case 'request':
      return requestTarget(db, record.id)
    case 'audit_event':
      return auditEntryTarget(db, record.id, record.projectId)
    default:
      return finish({
        record: { type: 'request', id: record.id, reference: '', projectId: record.projectId },
        exists: false,
        permanent: false,
        removes: [],
        keeps: [],
        checks: [],
        blockers: ['erasure_not_available'],
      })
  }
}

export type ErasureResult = { removed: Record<string, number>; objectKeys: string[] }

/**
 * Erases an estimate that was never accepted, inside the transaction that wrote its deletion log entry (deletionId;
 * migration 0058 lets only that transaction remove the rows). The caller checked the blockers under the row lock.
 * Returns what was removed (counts) and the stored files to remove after the commit.
 */
export async function eraseEstimate(tx: Tx, input: { estimateId: string; deletionId: string }): Promise<ErasureResult> {
  if (!tx.isTransaction) throw new Error('eraseEstimate runs inside the deletion transaction (withTx)')
  const versions = await tx
    .selectFrom('estimating.estimate_versions')
    .select(['id', 'customer_pdf_object_key'])
    .where('estimate_id', '=', input.estimateId)
    .execute()
  const ids = versions.map((v) => v.id)
  const documents = ids.length
    ? await tx
        .selectFrom('estimating.estimate_documents')
        .select(['id', 'object_key'])
        .where('version_id', 'in', ids)
        .execute()
    : []
  const objectKeys = [
    ...versions.flatMap((v) => (v.customer_pdf_object_key ? [v.customer_pdf_object_key] : [])),
    ...documents.map((d) => d.object_key),
  ]
  await sql`SELECT set_config('handyhub.erasure', ${input.deletionId}, true)`.execute(tx)
  const removed: Record<string, number> = {}
  const del = async (kind: string, table: string, column: string) => {
    if (ids.length === 0) return void (removed[kind] = 0)
    const r =
      await sql`DELETE FROM ${sql.table(table)} WHERE ${sql.ref(column)} = ANY(${sql.val(ids)}::uuid[])`.execute(tx)
    removed[kind] = Number(r.numAffectedRows ?? 0)
  }
  await del('saved_selections', 'estimating.approval_selections', 'version_id')
  await del('customer_responses', 'estimating.customer_responses', 'version_id')
  await del('estimate_line_costs', 'estimating.estimate_line_costs', 'version_id')
  await del('estimate_internals', 'estimating.estimate_version_internals', 'version_id')
  await del('estimate_lines', 'estimating.estimate_lines', 'version_id')
  // The reminder drafts nobody released (TSK-0060), in this same transaction; released or sent messages stay.
  removed['reminder_drafts'] = ids.length
    ? Number((await sql`DELETE ${unreleasedDrafts(ids)}`.execute(tx)).numAffectedRows ?? 0)
    : 0
  // Versions and documents name each other (the agreement document, the version a document belongs to): one statement.
  if (ids.length) {
    const { rows } = await sql<{ documents: string; versions: string }>`
      WITH d AS (DELETE FROM estimating.estimate_documents WHERE version_id = ANY(${sql.val(ids)}::uuid[]) RETURNING 1),
           v AS (DELETE FROM estimating.estimate_versions WHERE id = ANY(${sql.val(ids)}::uuid[]) RETURNING 1)
      SELECT (SELECT count(*) FROM d)::text AS documents, (SELECT count(*) FROM v)::text AS versions`.execute(tx)
    removed['estimate_documents'] = n(rows[0]?.documents)
    removed['estimate_versions'] = n(rows[0]?.versions)
  } else {
    removed['estimate_documents'] = 0
    removed['estimate_versions'] = 0
  }
  await tx.deleteFrom('estimating.estimates').where('id', '=', input.estimateId).execute()
  await sql`SELECT set_config('handyhub.erasure', '', true)`.execute(tx)
  // Open follow-up items about these versions (a customer's response) have nothing left to handle.
  const subjects = [input.estimateId, ...ids]
  await tx
    .updateTable('ops.queue_items')
    .set({ resolved_at: sql<Date>`now()`, resolution: 'record_deleted', updated_at: sql<Date>`now()` })
    .where('subject_id', 'in', subjects)
    .where('resolved_at', 'is', null)
    .execute()
  // Jobs still waiting for these versions or documents (the validity expiry, document checks) have nothing to do.
  const targets = [...ids, ...documents.map((d) => d.id)]
  if (targets.length)
    await tx
      .updateTable('platform.jobs')
      .set({ state: 'cancelled', finished_at: sql<Date>`now()`, updated_at: sql<Date>`now()` })
      .where('state', '=', 'queued')
      .where('target_id', 'in', targets)
      .execute()
  removed['stored_files'] = objectKeys.length
  return { removed, objectKeys }
}
