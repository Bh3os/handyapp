// The customer's decision on an issued change order (TSK-0082 part 2; HH-CHG-02, HH-CHG-03, HH-PORT-05, HH-ID-07,
// HH-OFF-04, HH-DATA-03, HH-DATA-08, T44, T53, ENT-ChangeOrder, ENT-JobScopeSnapshot, OWN-DEC-108, OWN-DEC-168,
// OWN-DEC-169, OWN-DEC-203, RULE-MONEY-CENTS, RULE-SERVER-AUTHZ). Migration 0088 keeps the records true.
// - The identified customer approves only the exact current version: the issued version, before its valid-until time,
//   by the digest of the content they viewed (fixed when it was issued), its revised total in cents, the estimate
//   terms the job was accepted under (shown, the box ticked, unchecked by default) and their typed full name. Expired,
//   withdrawn, superseded and rejected versions are never approved; a version priced against an older approved scope
//   (another change was approved since) is refused, and staff revise it.
// - Two ways to identify the customer (HH-CHG-02): the portal, with the rules of the estimate approval (a session
//   whose verification is fresh, read again with the access it came through inside the transaction); or in person on
//   the assigned worker's phone, with a one-time code sent to the contact's verified email or phone (purpose
//   change_order_approval, for this version only). A signature never identifies the customer and is not accepted.
//   Both are online only (HH-OFF-04): nothing here is queued offline.
// - One transaction under the job's row lock, so approvals of the job's change orders apply one at a time and a second
//   approval of the same version finds the first: the version moves to approved, the job's next scope snapshot is
//   written (the previous lines and texts plus the change's lines, its scope and hazards; the subtotal and total moved
//   by the charges and credits, OWN-DEC-203; the discount and terms unchanged), the decision is recorded and the job's
//   packet is refreshed in the same transaction: the new scope version is a critical change, so the workers'
//   acknowledgments no longer satisfy the gate (HH-DATA-08, T44). The steps the change named stop waiting (an approved
//   change is no longer open). A repeat by the same contact for the same total answers with the first approval.
// - Rejecting (portal only, an optional reason) records the decision and releases the waiting steps; it never
//   authorizes the change (HH-CHG-03). A worker's or customer's request is never a decision.
import { createHash } from 'node:crypto'
import type { Db, Tx } from '@handyhub/db'
import { CHANGE_ORDER_MACHINE, effectiveChangeOrderState, transition } from '@handyhub/domain'
import type { CustomerActor, DataScope } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError, type FieldError } from '../../api/errors.js'
import { loadConfig } from '../../platform/config/index.js'
import { accessStillValid, canonicalJson, FULL_NAME_MAX, stillFresh } from '../estimates/approval.js'
import { validityZone } from '../estimates/customer.js'
import type { CustomerSession } from '../identity/index.js'
import { issueCode, maskForCustomer, verifyCode, type CodeKeySettings } from '../identity/index.js'
import { currentConsent } from '../notifications/index.js'
import { refreshJobPacket } from '../packets/content.js'
import { findProject } from '../records/index.js'
import { customerContent, digestOf } from './publish.js'
import { baseSnapshot, type VersionRow } from './store.js'

type Reader = Db | Tx

/** The one-time code of an in-person approval (identity/codes.ts). */
export const IN_PERSON_CODE_PURPOSE = 'change_order_approval' as const
/** PROPOSED: at most 2000 characters for a rejection reason (no owner value), like a change order's own reason. */
export const REJECTION_REASON_MAX = 2000

const field = (f: string, code: string): FieldError => ({ field: f, code, message: '' })
const conflict = (f: string, code: string) => new ApiError('CONFLICT', { fieldErrors: [field(f, code)] })
const invalid = (f: string, code: string) => new ApiError('VALIDATION_FAILED', { fieldErrors: [field(f, code)] })
const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')
const num = (v: string | number | bigint | null | undefined) => (v === null || v === undefined ? null : Number(v))
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null)
const subjectRef = (versionId: string) => `change_order_version:${versionId}`

async function dbNow(db: Reader): Promise<Date> {
  const r = await sql<{ now: Date }>`SELECT now() AS now`.execute(db)
  return new Date((r.rows[0] as { now: Date }).now)
}

/** The states a customer sees: a version that reached them (issued once), never a draft or a review. */
const CUSTOMER_VISIBLE = (v: { issued_at: Date | null }) => v.issued_at !== null

// ---------------------------------------------------------------------------------------------------------------------
// Reading

export type CustomerChangeOrderLine = {
  position: number
  kind: string
  description: string
  quantity: string | null
  unit: string | null
  unitPriceCents: number | null
  amountCents: number | null
}

export type CustomerChangeOrder = {
  reference: string
  number: number
  version: number
  /** The state the customer sees: issued (open for a decision), approved, rejected, expired, withdrawn, superseded. */
  status: string
  reason: string
  scope: string
  scheduleImpact: string | null
  lines: CustomerChangeOrderLine[]
  approvedTotalCents: number
  chargesCents: number
  creditsCents: number
  revisedTotalCents: number
  sentAt: string
  validUntil: string
  decidedAt: string | null
  decision: { kind: 'approved' | 'rejected'; method: string; at: string } | null
  /** While open: what the approval names (the digest of this content and the terms the job was accepted under). */
  approval: {
    canDecide: boolean
    /** Why it cannot be approved now: another change was approved since it was priced (staff revise it). */
    blockedBy: 'APPROVED_SCOPE_CHANGED' | null
    contentDigest: string
    termsDocumentId: string
    termsSha256: string
  } | null
}

export type CustomerChangeOrders = {
  reference: string
  /** The accepted estimate the job came from: never changed by a change order (OWN-DEC-169). */
  original: { estimateNumber: string; version: number; totalCents: number } | null
  /** The current authorized total: the latest approved scope (the original plus every approved change order). */
  currentTotalCents: number | null
  /** TSK-0150: the zone each "Valid until" is shown in, as on the estimate (property zone, or business time). */
  validUntilZone: { zone: string; business: boolean } | null
  changeOrders: CustomerChangeOrder[]
}

type JobRow = { id: string; project_id: string; reference: string }

async function terms(db: Reader, jobId: string) {
  return db
    .selectFrom('work.job_scope_snapshots')
    .select(['id', 'version', 'total_cents', 'terms_document_id', 'terms_sha256'])
    .where('job_id', '=', jobId)
    .orderBy('version', 'desc')
    .limit(1)
    .executeTakeFirst()
}

/** The latest version of each change order that reached the customer, newest change order first. */
async function customerVersions(db: Reader, jobId: string) {
  const rows = (await db
    .selectFrom('work.change_order_versions as v')
    .innerJoin('work.change_orders as c', 'c.id', 'v.change_order_id')
    .selectAll('v')
    .select(['c.number'])
    .where('v.job_id', '=', jobId)
    .where('v.issued_at', 'is not', null)
    .orderBy('c.number', 'desc')
    .orderBy('v.version', 'desc')
    .execute()) as unknown as (VersionRow & { number: number; decided_at: Date | null })[]
  const seen = new Set<string>()
  return rows.filter((r) => CUSTOMER_VISIBLE(r) && !seen.has(r.change_order_id) && seen.add(r.change_order_id))
}

/** The project's change orders as the verified customer sees them (Documents tab), or null outside the scope. */
export async function customerChangeOrders(
  db: Reader,
  scope: DataScope,
  reference: string,
): Promise<CustomerChangeOrders | null> {
  const project = await findProject(db, scope, { reference })
  if (!project) return null
  const job = await db.selectFrom('work.jobs').select('id').where('project_id', '=', project.id).executeTakeFirst()
  const validUntilZone = await validityZone(db, project.id, await loadConfig(db))
  if (!job)
    return { reference: project.reference, original: null, currentTotalCents: null, validUntilZone, changeOrders: [] }
  const original = await db
    .selectFrom('work.job_scope_snapshots as s')
    .innerJoin('estimating.approvals as a', 'a.id', 's.approval_id')
    .innerJoin('estimating.estimates as e', 'e.id', 'a.estimate_id')
    .select(['e.number', 'a.version', 's.total_cents'])
    .where('s.job_id', '=', job.id)
    .where('s.version', '=', 1)
    .executeTakeFirst()
  const latest = await terms(db, job.id)
  const now = await dbNow(db)
  const decisions = await db
    .selectFrom('work.change_order_decisions')
    .select(['version_id', 'decision', 'method', 'created_at'])
    .where('job_id', '=', job.id)
    .execute()
  const byVersion = new Map(decisions.map((d) => [d.version_id, d]))
  const out: CustomerChangeOrder[] = []
  for (const v of await customerVersions(db, job.id)) {
    const ref = `${project.reference}-C${v.number}`
    const content = await customerContent(db, v, ref)
    const status = effectiveChangeOrderState(v.state, v.valid_until, now)
    const d = byVersion.get(v.id)
    const open = status === 'issued'
    out.push({
      reference: ref,
      number: v.number,
      version: v.version,
      status,
      reason: v.reason,
      scope: v.scope,
      scheduleImpact: v.schedule_impact,
      lines: content.lines,
      approvedTotalCents: Number(v.base_total_cents),
      chargesCents: Number(v.charges_cents),
      creditsCents: Number(v.credits_cents),
      revisedTotalCents: Number(v.revised_total_cents),
      sentAt: iso(v.issued_at) as string,
      validUntil: iso(v.valid_until) as string,
      decidedAt: iso(v.decided_at),
      decision: d
        ? { kind: d.decision as 'approved' | 'rejected', method: d.method, at: d.created_at.toISOString() }
        : null,
      approval:
        open && latest
          ? {
              canDecide: latest.id === v.base_snapshot_id,
              blockedBy: latest.id === v.base_snapshot_id ? null : 'APPROVED_SCOPE_CHANGED',
              contentDigest: v.content_sha256 as string,
              termsDocumentId: latest.terms_document_id,
              termsSha256: latest.terms_sha256,
            }
          : null,
    })
  }
  return {
    reference: project.reference,
    original: original
      ? { estimateNumber: original.number, version: original.version, totalCents: Number(original.total_cents) }
      : null,
    currentTotalCents: latest ? Number(latest.total_cents) : null,
    validUntilZone,
    changeOrders: out,
  }
}

/**
 * TSK-0150 (HH-PORT-02, OWN-DEC-199): whether a change order of the project waits for the customer's decision: its
 * latest issued version is open (not expired) and can be decided now (priced on the current approved scope). The
 * Overview then asks the customer to review the change instead of saying HandyHub has the next step.
 */
export async function changeOrderAwaitingDecision(db: Reader, projectId: string): Promise<boolean> {
  const job = await db.selectFrom('work.jobs').select('id').where('project_id', '=', projectId).executeTakeFirst()
  if (!job) return false
  const latest = await terms(db, job.id)
  if (!latest) return false
  const now = await dbNow(db)
  return (await customerVersions(db, job.id)).some(
    (v) => effectiveChangeOrderState(v.state, v.valid_until, now) === 'issued' && v.base_snapshot_id === latest.id,
  )
}

// ---------------------------------------------------------------------------------------------------------------------
// The decision

export type CustomerIdentification =
  | {
      method: 'portal'
      contactRef: string
      session: CustomerSession
      clientAddress: string | null
      userAgent: string | null
    }
  | {
      method: 'in_person_code'
      contactRef: string
      codeId: string
      channel: 'email' | 'sms'
      capturedBy: string
      verifiedAt: Date
      clientAddress: string | null
      userAgent: string | null
    }

export type ApproveInput = {
  contentDigest: string
  totalCents: number
  termsDocumentId: string
  termsSha256: string
  acceptTerms: boolean
  fullName: string
  idempotencyKey: string
  testMark: boolean
}

export type DecisionResult = {
  created: boolean
  decisionId: string
  decision: 'approved' | 'rejected'
  changeOrderId: string
  versionId: string
  reference: string
  version: number
  at: Date
  revisedTotalCents: number
  /** An approval: the job's new scope snapshot version and the packet version that carries it. */
  scopeVersion: number | null
  packetVersion: number | null
}

type Locked = { job: JobRow; v: VersionRow & { decided_at: Date | null }; number: number; reference: string }

/** Locks the job, then the change order's version by its number (the change-order lock order). Null: no such one. */
async function lockTarget(tx: Tx, projectId: string, number: number, version: number): Promise<Locked | null> {
  const head = await tx
    .selectFrom('work.change_orders')
    .select(['id', 'job_id', 'number'])
    .where('project_id', '=', projectId)
    .where('number', '=', number)
    .executeTakeFirst()
  if (!head) return null
  const job = await tx
    .selectFrom('work.jobs as j')
    .innerJoin('crm.projects as p', 'p.id', 'j.project_id')
    .select(['j.id', 'j.project_id', 'p.reference'])
    .where('j.id', '=', head.job_id)
    .forUpdate('j')
    .executeTakeFirstOrThrow()
  const v = (await tx
    .selectFrom('work.change_order_versions')
    .selectAll()
    .where('change_order_id', '=', head.id)
    .where('version', '=', version)
    .forUpdate()
    .executeTakeFirst()) as unknown as (VersionRow & { decided_at: Date | null }) | undefined
  // A version that never reached the customer does not exist for them.
  if (!v || v.issued_at === null) return null
  return { job, v, number: head.number, reference: `${job.reference}-C${head.number}` }
}

async function existingDecision(tx: Reader, t: Locked): Promise<DecisionResult & { contactRef: string }> {
  const d = await tx
    .selectFrom('work.change_order_decisions as d')
    .leftJoin('work.job_scope_snapshots as s', 's.id', 'd.scope_snapshot_id')
    .select([
      'd.id',
      'd.decision',
      'd.created_at',
      'd.contact_ref',
      'd.revised_total_cents',
      's.version as scope_version',
    ])
    .where('d.version_id', '=', t.v.id)
    .executeTakeFirstOrThrow()
  return {
    created: false,
    decisionId: d.id,
    decision: d.decision as 'approved' | 'rejected',
    changeOrderId: t.v.change_order_id,
    versionId: t.v.id,
    reference: t.reference,
    version: t.v.version,
    at: d.created_at,
    revisedTotalCents: Number(d.revised_total_cents),
    scopeVersion: d.scope_version ?? null,
    packetVersion: null,
    contactRef: d.contact_ref,
  }
}

const withoutContact = (d: DecisionResult & { contactRef: string }): DecisionResult => ({
  created: d.created,
  decisionId: d.decisionId,
  decision: d.decision,
  changeOrderId: d.changeOrderId,
  versionId: d.versionId,
  reference: d.reference,
  version: d.version,
  at: d.at,
  revisedTotalCents: d.revisedTotalCents,
  scopeVersion: d.scopeVersion,
  packetVersion: d.packetVersion,
})

/** The checks every decision makes before anything is written; returns the time and the open version's digest. */
async function checkOpen(tx: Tx, t: Locked, wanted: 'approved' | 'rejected', contactRef: string, totalCents?: number) {
  const now = await dbNow(tx)
  if (t.v.state === 'approved' || t.v.state === 'rejected') {
    const first = await existingDecision(tx, t)
    if (
      t.v.state === wanted &&
      first.contactRef === contactRef &&
      (totalCents === undefined || first.revisedTotalCents === totalCents)
    ) {
      return { now, replay: withoutContact(first) }
    }
    throw conflict('version', `VERSION_${t.v.state.toUpperCase()}`)
  }
  const status = effectiveChangeOrderState(t.v.state, t.v.valid_until, now)
  if (status !== 'issued') throw conflict('version', `VERSION_${status.toUpperCase()}`)
  // The digest fixed at issue is the content the customer was shown; the stored content still matches it.
  const digest = digestOf(await customerContent(tx, t.v, t.reference))
  if (digest !== t.v.content_sha256) throw new Error(`change-order version ${t.v.id}: content differs from its digest`)
  return { now, replay: null, digest }
}

async function checkIdentification(tx: Tx, t: Locked, who: CustomerIdentification, now: Date) {
  if (who.method !== 'portal') return
  // The project row before the access is read again: the lock order of a customer merge or a request relink.
  await tx.selectFrom('crm.projects').select('id').where('id', '=', t.job.project_id).forUpdate().execute()
  if (!(await stillFresh(tx, who.session.id, now)))
    throw new ApiError('FORBIDDEN', { fieldErrors: [field('verification', 'FRESH_VERIFICATION_REQUIRED')] })
  if (!(await accessStillValid(tx, who.session, t.job.project_id, now)))
    throw new ApiError('FORBIDDEN', { fieldErrors: [field('access', 'ACCESS_REVOKED')] })
}

function identificationColumns(who: CustomerIdentification) {
  const meta = {
    contact_ref: who.contactRef,
    method: who.method,
    client_address: who.clientAddress ? who.clientAddress.slice(0, 100) : null,
    user_agent: who.userAgent ? who.userAgent.slice(0, 400) : null,
  }
  return who.method === 'portal'
    ? {
        ...meta,
        access_via: who.session.via,
        grant_id: who.session.via === 'grant' ? who.session.grantId : null,
        account_id: who.session.via === 'account' ? who.session.accountId : null,
        customer_session_id: who.session.id,
        verified_at: who.session.verifiedAt,
      }
    : {
        ...meta,
        verification_code_id: who.codeId,
        code_channel: who.channel,
        captured_by: who.capturedBy,
        verified_at: who.verifiedAt,
      }
}

type SnapshotLine = Record<string, unknown>

/** The job's next scope snapshot: the previous approved scope plus the approved change (see the header). */
async function writeSnapshot(tx: Tx, t: Locked, now: Date) {
  const prev = await tx
    .selectFrom('work.job_scope_snapshots')
    .selectAll()
    .where('id', '=', t.v.base_snapshot_id)
    .executeTakeFirstOrThrow()
  const lines = await tx
    .selectFrom('work.change_order_lines as l')
    .leftJoin('work.work_packages as w', 'w.id', 'l.work_package_id')
    .leftJoin('catalog.services as s', 's.id', 'w.service_id')
    .select([
      'l.position',
      'l.kind',
      'l.description',
      'l.quantity_milli',
      'l.unit',
      'l.unit_price_cents',
      'l.amount_cents',
      's.code',
    ])
    .where('l.version_id', '=', t.v.id)
    .orderBy('l.position')
    .execute()
  const content = await customerContent(tx, t.v, t.reference)
  const added: SnapshotLine[] = lines.map((l, i) => ({
    position: l.position,
    kind: l.kind,
    serviceCode: l.code ?? null,
    description: l.description,
    quantity: content.lines[i]?.quantity ?? null,
    unit: l.unit,
    unitPriceCents: num(l.unit_price_cents),
    amountCents: num(l.amount_cents),
    changeOrder: t.reference,
    changeOrderVersion: t.v.version,
  }))
  const prevTexts = prev.texts as Record<string, unknown>
  const list = (k: string) => (Array.isArray(prevTexts[k]) ? (prevTexts[k] as string[]) : [])
  const texts = {
    ...prevTexts,
    changeOrderScope: [...list('changeOrderScope'), `${t.reference}: ${t.v.scope}`],
    changeOrderHazards: t.v.hazards
      ? [...list('changeOrderHazards'), `${t.reference}: ${t.v.hazards}`]
      : list('changeOrderHazards'),
  }
  const allLines = [...(prev.lines as SnapshotLine[]), ...added]
  const charges = Number(t.v.charges_cents)
  const credits = Number(t.v.credits_cents)
  const subtotal = Number(prev.subtotal_cents) + charges - credits
  const total = Number(t.v.revised_total_cents)
  const snapshot = {
    changeOrder: t.reference,
    changeOrderVersion: t.v.version,
    contentSha256: t.v.content_sha256,
    previousVersion: prev.version,
    lines: allLines,
    texts,
    options: prev.selected_options,
    subtotalCents: subtotal,
    discountCents: Number(prev.discount_cents),
    totalCents: total,
    terms: { documentId: prev.terms_document_id, sha256: prev.terms_sha256 },
  }
  return tx
    .insertInto('work.job_scope_snapshots')
    .values({
      job_id: t.job.id,
      version: prev.version + 1,
      source: 'change_order',
      change_order_version_id: t.v.id,
      approval_id: null,
      estimate_version_id: prev.estimate_version_id,
      lines: JSON.stringify(allLines),
      texts: JSON.stringify(texts),
      exclusions: prev.exclusions,
      selected_options: prev.selected_options,
      subtotal_cents: subtotal,
      discount_cents: Number(prev.discount_cents),
      total_cents: total,
      terms_document_id: prev.terms_document_id,
      terms_sha256: prev.terms_sha256,
      content_sha256: sha256(canonicalJson(snapshot)),
      created_at: now,
    })
    .returning(['id', 'version'])
    .executeTakeFirstOrThrow()
}

/**
 * Approves one exact issued version in the caller's transaction (see the header). Refusals write nothing: NOT_FOUND
 * outside the project or for a version that never reached the customer; CONFLICT naming the version's status
 * (VERSION_EXPIRED, _WITHDRAWN, _SUPERSEDED, _REJECTED, _APPROVED for another contact or total), APPROVED_SCOPE_CHANGED,
 * CONTENT_MISMATCH or TERMS_NOT_SHOWN; VALIDATION_FAILED for an unticked box, an empty name or a total that is not the
 * version's; FORBIDDEN FRESH_VERIFICATION_REQUIRED or ACCESS_REVOKED for a portal session that no longer qualifies.
 * The caller authorizes the action and records the audit event; an in-person caller verified the code first.
 */
export async function approveChangeOrder(
  tx: Tx,
  t: Locked,
  input: ApproveInput,
  who: CustomerIdentification,
): Promise<DecisionResult> {
  const fullName = input.fullName.trim().replace(/\s+/g, ' ')
  const open = await checkOpen(tx, t, 'approved', who.contactRef, input.totalCents)
  if (open.replay) return open.replay
  const { now, digest } = open
  if (input.contentDigest !== digest) throw conflict('body.contentDigest', 'CONTENT_MISMATCH')
  const latest = await terms(tx, t.job.id)
  if (!latest) throw conflict('job', 'SCOPE_MISSING')
  if (input.termsDocumentId !== latest.terms_document_id || input.termsSha256 !== latest.terms_sha256)
    throw conflict('body.termsDocumentId', 'TERMS_NOT_SHOWN')
  if (input.acceptTerms !== true) throw invalid('body.acceptTerms', 'required')
  if (fullName.length === 0 || fullName.length > FULL_NAME_MAX) throw invalid('body.fullName', 'required')
  if (input.totalCents !== Number(t.v.revised_total_cents)) throw invalid('body.totalCents', 'TOTAL_MISMATCH')
  const moved = transition(CHANGE_ORDER_MACHINE, { state: 'issued', version: t.v.row_version }, 'approve', {
    actor: 'customer',
    expectedVersion: t.v.row_version,
    now,
    facts: { validUntil: t.v.valid_until as Date, baseCurrent: latest.id === t.v.base_snapshot_id },
  })
  if (!moved.ok) throw conflict('version', moved.problems?.[0]?.code ?? moved.code)
  await checkIdentification(tx, t, who, now)

  await tx
    .updateTable('work.change_order_versions')
    .set({ state: moved.to, decided_at: now, row_version: t.v.row_version + 1 })
    .where('id', '=', t.v.id)
    .execute()
  const snapshot = await writeSnapshot(tx, t, now)
  const decision = await tx
    .insertInto('work.change_order_decisions')
    .values({
      change_order_id: t.v.change_order_id,
      version_id: t.v.id,
      job_id: t.job.id,
      project_id: t.job.project_id,
      version: t.v.version,
      decision: 'approved',
      content_sha256: digest,
      base_snapshot_id: t.v.base_snapshot_id,
      charges_cents: Number(t.v.charges_cents),
      credits_cents: Number(t.v.credits_cents),
      revised_total_cents: Number(t.v.revised_total_cents),
      terms_document_id: latest.terms_document_id,
      terms_sha256: latest.terms_sha256,
      terms_accepted: true,
      full_name: fullName,
      scope_snapshot_id: snapshot.id,
      ...identificationColumns(who),
      test_mark: input.testMark,
      idempotency_key: input.idempotencyKey,
      created_at: now,
    })
    .returning(['id', 'created_at'])
    .executeTakeFirstOrThrow()
  // One packet version with the change (a critical scope change: acknowledgments must be given again, T44).
  const packet = await refreshJobPacket(tx, t.job.id, now)
  return {
    created: true,
    decisionId: decision.id,
    decision: 'approved',
    changeOrderId: t.v.change_order_id,
    versionId: t.v.id,
    reference: t.reference,
    version: t.v.version,
    at: decision.created_at,
    revisedTotalCents: Number(t.v.revised_total_cents),
    scopeVersion: snapshot.version,
    packetVersion: packet?.version ?? null,
  }
}

/** Rejects one exact issued version through the portal (see the header). */
export async function rejectChangeOrder(
  tx: Tx,
  t: Locked,
  input: { contentDigest: string; reason: string | null; idempotencyKey: string; testMark: boolean },
  who: CustomerIdentification & { method: 'portal' },
): Promise<DecisionResult> {
  const open = await checkOpen(tx, t, 'rejected', who.contactRef)
  if (open.replay) return open.replay
  const { now, digest } = open
  if (input.contentDigest !== digest) throw conflict('body.contentDigest', 'CONTENT_MISMATCH')
  const reason = input.reason?.trim() ? input.reason.trim() : null
  if (reason && reason.length > REJECTION_REASON_MAX) throw invalid('body.reason', 'TOO_LONG')
  const moved = transition(CHANGE_ORDER_MACHINE, { state: 'issued', version: t.v.row_version }, 'reject', {
    actor: 'customer',
    expectedVersion: t.v.row_version,
    now,
    facts: { validUntil: t.v.valid_until as Date },
  })
  if (!moved.ok) throw conflict('version', moved.problems?.[0]?.code ?? moved.code)
  await checkIdentification(tx, t, who, now)
  await tx
    .updateTable('work.change_order_versions')
    .set({ state: moved.to, decided_at: now, row_version: t.v.row_version + 1 })
    .where('id', '=', t.v.id)
    .execute()
  const decision = await tx
    .insertInto('work.change_order_decisions')
    .values({
      change_order_id: t.v.change_order_id,
      version_id: t.v.id,
      job_id: t.job.id,
      project_id: t.job.project_id,
      version: t.v.version,
      decision: 'rejected',
      content_sha256: digest,
      base_snapshot_id: t.v.base_snapshot_id,
      charges_cents: Number(t.v.charges_cents),
      credits_cents: Number(t.v.credits_cents),
      revised_total_cents: Number(t.v.revised_total_cents),
      reason,
      ...identificationColumns(who),
      test_mark: input.testMark,
      idempotency_key: input.idempotencyKey,
      created_at: now,
    })
    .returning(['id', 'created_at'])
    .executeTakeFirstOrThrow()
  return {
    created: true,
    decisionId: decision.id,
    decision: 'rejected',
    changeOrderId: t.v.change_order_id,
    versionId: t.v.id,
    reference: t.reference,
    version: t.v.version,
    at: decision.created_at,
    revisedTotalCents: Number(t.v.revised_total_cents),
    scopeVersion: null,
    packetVersion: null,
  }
}

/** The portal's target: the change order by its project reference and number, within the customer's scope. */
export async function lockCustomerTarget(
  tx: Tx,
  scope: DataScope,
  ref: { reference: string; number: number; version: number },
): Promise<Locked> {
  const project = await findProject(tx, scope, { reference: ref.reference })
  const t = project ? await lockTarget(tx, project.id, ref.number, ref.version) : null
  if (!t) throw new ApiError('NOT_FOUND')
  return t
}

/** The in-person target: the change order's current version (staff routes name the change order by its ID). */
export async function lockStaffTarget(tx: Tx, changeOrderId: string, version: number): Promise<Locked> {
  const head = await tx
    .selectFrom('work.change_orders')
    .select(['project_id', 'number'])
    .where('id', '=', changeOrderId)
    .executeTakeFirst()
  const t = head ? await lockTarget(tx, head.project_id, head.number, version) : null
  if (!t) throw new ApiError('NOT_FOUND')
  return t
}

export type PortalDecisionInput = { session: CustomerSession; actor: CustomerActor }

// ---------------------------------------------------------------------------------------------------------------------
// In person: the one-time code to the customer's verified contact

type ContactRow = {
  id: string
  email: string
  phone_e164: string
  email_verification: string
  email_verified_value: string | null
  phone_verification: string
  phone_verified_value: string | null
}

/** The project's customer contact (the request's), with what its verification proved. */
async function projectContact(db: Reader, projectId: string): Promise<ContactRow | undefined> {
  return db
    .selectFrom('intake.requests as r')
    .innerJoin('crm.contacts as c', 'c.id', 'r.contact_id')
    .select([
      'c.id',
      'c.email',
      'c.phone_e164',
      'c.email_verification',
      'c.email_verified_value',
      'c.phone_verification',
      'c.phone_verified_value',
    ])
    .where('r.project_id', '=', projectId)
    .executeTakeFirst()
}

/** The verified destination of a channel: the exact value its verification proved; a text needs the SMS opt-in. */
async function verifiedDestination(db: Reader, c: ContactRow, channel: 'email' | 'sms'): Promise<string | null> {
  if (channel === 'email')
    return c.email_verification === 'verified' && c.email_verified_value === c.email.toLowerCase()
      ? c.email_verified_value
      : null
  if (c.phone_verification !== 'verified' || c.phone_verified_value !== c.phone_e164) return null
  return (await currentConsent(db, 'sms', c.phone_e164, 'transactional_sms')) === 'granted' ? c.phone_e164 : null
}

/** Where an in-person code can go now (masked), for the worker's screen. */
export async function inPersonChannels(db: Reader, projectId: string) {
  const c = await projectContact(db, projectId)
  if (!c) return []
  const out: { channel: 'email' | 'sms'; sentTo: string }[] = []
  for (const channel of ['email', 'sms'] as const) {
    const d = await verifiedDestination(db, c, channel)
    if (d) out.push({ channel, sentTo: maskForCustomer(channel, d) })
  }
  return out
}

/**
 * Sends the in-person approval code for the change order's open version to the customer's verified contact. Refused
 * (nothing sent) when the version is not open for a decision or the channel is not verified for this contact.
 */
export async function sendInPersonCode(
  tx: Tx,
  key: CodeKeySettings,
  changeOrderId: string,
  input: { version: number; channel: 'email' | 'sms'; clientIp?: string; requestId: string },
) {
  const t = await lockStaffTarget(tx, changeOrderId, input.version)
  const open = await checkOpen(tx, t, 'approved', '\u0000')
  if (open.replay) throw conflict('version', 'VERSION_APPROVED')
  const c = await projectContact(tx, t.job.project_id)
  const destination = c ? await verifiedDestination(tx, c, input.channel) : null
  if (!destination) throw conflict('body.channel', 'CONTACT_NOT_VERIFIED')
  const issued = await issueCode(tx, key, {
    purpose: IN_PERSON_CODE_PURPOSE,
    channel: input.channel,
    destination,
    subjectRef: subjectRef(t.v.id),
    ...(input.clientIp ? { clientIp: input.clientIp } : {}),
    requestId: input.requestId,
  })
  if (issued.status === 'not_configured')
    throw new ApiError('NOT_CONFIGURED', { fieldErrors: issued.missing.map((m) => field('code', m)) })
  if (issued.status === 'rate_limited')
    throw new ApiError('RATE_LIMITED', { headers: { 'retry-after': String(issued.retryAfterSeconds) } })
  if (issued.status === 'invalid_destination') throw conflict('body.channel', 'CONTACT_NOT_VERIFIED')
  return { versionId: t.v.id, channel: input.channel, sentTo: issued.maskedDestination, expiresAt: issued.expiresAt }
}

/**
 * The in-person approval: every check of the approval first (nothing consumed when one fails), then the code. A wrong
 * code answers `invalid_code` with the attempt counted (the caller commits it); a right one approves.
 */
export async function approveInPerson(
  tx: Tx,
  key: CodeKeySettings,
  changeOrderId: string,
  input: ApproveInput & { version: number; channel: 'email' | 'sms'; code: string; clientIp?: string },
  staff: { userId: string },
  meta: { clientAddress: string | null; userAgent: string | null },
): Promise<{ ok: true; result: DecisionResult } | { ok: false }> {
  const t = await lockStaffTarget(tx, changeOrderId, input.version)
  const c = await projectContact(tx, t.job.project_id)
  if (!c) throw conflict('body.channel', 'CONTACT_NOT_VERIFIED')
  // A repeat after the approval answers with it, without spending another code.
  if (t.v.state === 'approved') {
    const first = await existingDecision(tx, t)
    if (first.contactRef === c.id && first.revisedTotalCents === input.totalCents) {
      return { ok: true, result: withoutContact(first) }
    }
  }
  const destination = await verifiedDestination(tx, c, input.channel)
  if (!destination) throw conflict('body.channel', 'CONTACT_NOT_VERIFIED')
  // Dry checks: the same ones the approval makes, before the code is spent.
  const open = await checkOpen(tx, t, 'approved', c.id, input.totalCents)
  if (!open.replay) {
    if (input.contentDigest !== open.digest) throw conflict('body.contentDigest', 'CONTENT_MISMATCH')
    const latest = await terms(tx, t.job.id)
    if (latest && latest.id !== t.v.base_snapshot_id) throw conflict('version', 'APPROVED_SCOPE_CHANGED')
    if (input.acceptTerms !== true) throw invalid('body.acceptTerms', 'required')
    if (!input.fullName.trim()) throw invalid('body.fullName', 'required')
    if (input.totalCents !== Number(t.v.revised_total_cents)) throw invalid('body.totalCents', 'TOTAL_MISMATCH')
  }
  const verified = await verifyCode(tx, key, {
    purpose: IN_PERSON_CODE_PURPOSE,
    destination,
    subjectRef: subjectRef(t.v.id),
    code: input.code,
    ...(input.clientIp ? { clientIp: input.clientIp } : {}),
  })
  if (!verified.ok) return { ok: false }
  const result = await approveChangeOrder(tx, t, input, {
    method: 'in_person_code',
    contactRef: c.id,
    codeId: verified.codeId,
    channel: verified.channel,
    capturedBy: staff.userId,
    verifiedAt: verified.verifiedAt,
    clientAddress: meta.clientAddress,
    userAgent: meta.userAgent,
  })
  return { ok: true, result }
}

/** What the worker's phone shows for an in-person approval of the open version (null when none is open). */
export async function inPersonApproval(db: Reader, v: VersionRow, jobId: string, projectId: string) {
  const now = await dbNow(db)
  if (effectiveChangeOrderState(v.state, v.valid_until, now) !== 'issued' || !v.content_sha256) return null
  const latest = await baseSnapshot(db, jobId)
  const scope = await terms(db, jobId)
  if (!latest || !scope) return null
  return {
    contentDigest: v.content_sha256,
    totalCents: Number(v.revised_total_cents),
    termsDocumentId: scope.terms_document_id,
    termsSha256: scope.terms_sha256,
    blockedBy: latest.id === v.base_snapshot_id ? null : ('APPROVED_SCOPE_CHANGED' as const),
    channels: await inPersonChannels(db, projectId),
  }
}
