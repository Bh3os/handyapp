// The approval transaction (TSK-0057; HH-EST-06, HH-EST-07, HH-EST-08, HH-ID-07, HH-API-04, HH-DATA-04, T17, T32,
// T33, T34, ENT-Approval, ENT-Job, ENT-JobScopeSnapshot, ENT-SchedulingTask, OWN-DEC-103, OWN-DEC-104, OWN-DEC-105,
// OWN-DEC-127, FACT-DEPOSIT-RULE, RULE-MONEY-CENTS, RULE-SERVER-AUTHZ, RULE-NO-INVENTED-FACTS).
// - The exact version: the customer approves a version by its number and the content digest of what they viewed
//   (versionContentDigest: SHA-256 over the version's canonical customer content and, for an uploaded estimate, the
//   published customer PDF's own hash). A different digest is refused; nothing is written.
// - The options and the total are the server's: the selected option lines (by position) are added to the base lines
//   using the version's own stored line amounts (accepted work is never repriced, HH-EST-10), with the discount share
//   and the deposit rule version the version pinned (FACT-DEPOSIT-RULE: over the threshold, the share of the final
//   total after the discount, rounded half-up, all in integer cents). The total and deposit the customer was shown
//   must equal that computation, otherwise the approval is refused with no record written (HH-EST-07).
// - The terms: the version's pinned terms must be the current recorded version of legal.estimate_terms, with the
//   wording this software holds for that ID (same content hash), and in effect for real customers. While they are not
//   (in every environment today: the key is NOT CONFIGURED until the owner's sign-off, OQ-TERMS-OWNER-APPROVAL),
//   approval answers NOT CONFIGURED and nothing is written: never a fake success.
// - Fresh verification (HH-ID-07): the route's policy check refuses a stale session first; inside the transaction the
//   session is read again under the database clock, and the access it came through is checked again (a grant not
//   revoked; an account link still active), so a revocation between the request and the write wins.
// - One transaction under the estimate's row lock, then the version's (the lifecycle's lock order): the version's move
//   to accepted, the approval, the project's move to approved, one job, its scope snapshot version 1, one scheduling
//   task, the work packages' job link and the committed event estimate.approved (the approval receipt, TSK-0058,
//   reads it). TSK-0068: each work package also pins its service's current SOP version (or records NOT CONFIGURED). Unique constraints back each "one" (one approval per version, one job per project and approval, one
//   scheduling task per job). A second call that finds the version already approved by the same verified contact
//   with the same options and total answers with that first approval (two tabs, a retry under a new key); anything
//   else is a CONFLICT. The same idempotency key is answered by the API's stored response (claim/store).
// - Approval never confirms an appointment, reserves capacity or marks a deposit paid (OWN-DEC-103, HH-EST-08).
import { createHash } from 'node:crypto'
import { pinJobSops, type Db, type Tx } from '@handyhub/db'
import { apply, type EstimateVersionState, type ProjectState } from '@handyhub/domain'
import { estimateTermsDocument, estimateTermsInEffect } from '@handyhub/domain/legal'
import { customerTranslator, type CustomerKey } from '@handyhub/i18n'
import { basisPoints, cents, estimateTotals } from '@handyhub/money'
import type { CustomerActor, DataScope } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError, type FieldError } from '../../api/errors.js'
import { loadConfig, policyVersion } from '../../platform/config/index.js'
import { outbox } from '../../platform/outbox.js'
import { currentContext } from '../../platform/request-context.js'
import type { CustomerSession } from '../identity/index.js'
import { currentVersion } from './lifecycle.js'
import { customerVersionContent, type CustomerVersionContent } from './projections.js'
import { customerVersionRow, customerVersionStatus, type CustomerVersionRef } from './responses.js'

type Reader = Db | Tx

/** The committed event of an approval: the approval receipt (TSK-0058) and staff notices read it. */
export const ESTIMATE_APPROVED_EVENT = 'estimate.approved'
/** PROPOSED: at most 200 characters for the typed full name (no owner value). */
export const FULL_NAME_MAX = 200

const field = (f: string, code: string): FieldError => ({ field: f, code, message: '' })
const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')

/** Canonical JSON: object keys sorted, arrays in order, so the same content always has the same digest. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`)
      .join(',')}}`
  return JSON.stringify(value ?? null)
}

type VersionPricing = {
  id: string
  estimate_id: string
  project_id: string
  version: number
  state: string
  valid_until: Date | null
  row_version: number
  authoring_method: string
  subtotal_cents: string | null
  discount_cents: string | null
  total_cents: string | null
  discount_percent_bps: number | null
  discount_rule_version: number | null
  deposit_state: string | null
  deposit_cents: string | null
  deposit_rule_version: number | null
  payment_term: string
  payment_term_version: number
  terms_version: string | null
  document_sha256: string | null
}

async function versionPricing(db: Reader, versionId: string, lock = false): Promise<VersionPricing | undefined> {
  const q = db
    .selectFrom('estimating.estimate_versions as v')
    .leftJoin('estimating.estimate_documents as d', (j) =>
      j
        .onRef('d.id', '=', 'v.agreement_document_id')
        .onRef('d.version_id', '=', 'v.id')
        .on('d.role', '=', 'customer_pdf')
        .on('d.state', '=', 'ready'),
    )
    .select([
      'v.id',
      'v.estimate_id',
      'v.project_id',
      'v.version',
      'v.state',
      'v.valid_until',
      'v.row_version',
      'v.authoring_method',
      'v.subtotal_cents',
      'v.discount_cents',
      'v.total_cents',
      'v.discount_percent_bps',
      'v.discount_rule_version',
      'v.deposit_state',
      'v.deposit_cents',
      'v.deposit_rule_version',
      'v.payment_term',
      'v.payment_term_version',
      'v.terms_version',
      'd.sha256 as document_sha256',
    ])
    .where('v.id', '=', versionId)
  return (lock ? q.forUpdate('v') : q).executeTakeFirst() as Promise<VersionPricing | undefined>
}

async function lineAmounts(db: Reader, versionId: string) {
  const rows = await db
    .selectFrom('estimating.estimate_lines')
    .select(['position', 'kind', 'amount_cents'])
    .where('version_id', '=', versionId)
    .orderBy('position')
    .execute()
  return rows.map((r) => ({ position: r.position, kind: r.kind, amountCents: Number(r.amount_cents) }))
}

/**
 * The digest of what the customer viewed: SHA-256 of the version's canonical customer content (every line, text,
 * total, the payment term, the dates and the pinned terms ID; not the state, which moves on, nor any signed link) and,
 * for an uploaded estimate, the SHA-256 of its published customer PDF. A published version never changes, so its
 * digest never does either. Null for a version that does not exist.
 */
export async function versionContentDigest(db: Reader, versionId: string): Promise<string | null> {
  const content = await customerVersionContent(db, versionId)
  const v = content ? await versionPricing(db, versionId) : undefined
  if (!content || !v) return null
  return digestOf(content, v.document_sha256)
}

function digestOf(content: CustomerVersionContent, documentSha256: string | null): string {
  // Everything but the state, which moves on (published, then accepted or expired) while the content stays.
  const rest: Partial<CustomerVersionContent> = { ...content }
  delete rest.state
  return sha256(canonicalJson({ content: rest, document: documentSha256 }))
}

export type SelectionTotals = {
  /** The selected option lines, by position, ascending. */
  options: number[]
  subtotalCents: number
  discountCents: number
  totalCents: number
  deposit: { state: 'required' | 'not_required'; amountCents: number | null }
  depositRuleVersion: number
}

export type SelectionProblem = 'NOT_AN_OPTION' | 'DEPOSIT_RULE_MISSING' | 'NOT_PRICED'

/**
 * The totals of the base lines plus the selected options, from the version's own stored line amounts and the
 * policy versions it pinned. With no option selected the result equals the version's stored totals (checked).
 */
async function totalsFor(
  db: Reader,
  v: VersionPricing,
  options: readonly number[],
): Promise<{ ok: true; totals: SelectionTotals } | { ok: false; problem: SelectionProblem }> {
  if (v.subtotal_cents === null || v.total_cents === null || v.deposit_rule_version === null)
    return { ok: false, problem: 'NOT_PRICED' }
  const lines = await lineAmounts(db, v.id)
  const selected = [...new Set(options)].sort((a, b) => a - b)
  const byPosition = new Map(lines.map((l) => [l.position, l]))
  if (
    selected.some((p) => !Number.isInteger(p) || byPosition.get(p) === undefined || byPosition.get(p)?.kind === 'base')
  )
    return { ok: false, problem: 'NOT_AN_OPTION' }
  const rule = await policyVersion(db, 'deposit.rule', v.deposit_rule_version)
  if (!rule || rule.state !== 'CONFIGURED') return { ok: false, problem: 'DEPOSIT_RULE_MISSING' }
  const counted = lines.filter((l) => l.kind === 'base' || selected.includes(l.position))
  const result = estimateTotals({
    lines: counted.map((l) => cents(l.amountCents)),
    discountPercent: v.discount_percent_bps === null ? null : basisPoints(v.discount_percent_bps),
    depositRule: { thresholdCents: cents(rule.value.thresholdCents), percent: basisPoints(rule.value.percentBps) },
  })
  if (!result.ok) return { ok: false, problem: 'NOT_PRICED' }
  const t = result.totals
  const deposit = t.deposit?.required
    ? { state: 'required' as const, amountCents: Number(t.deposit.amount) }
    : { state: 'not_required' as const, amountCents: null }
  if (selected.length === 0) {
    // The base offer computed here is exactly what publishing stored; anything else is a data fault, never shown.
    const stored = {
      subtotal: Number(v.subtotal_cents),
      total: Number(v.total_cents),
      deposit: v.deposit_cents === null ? null : Number(v.deposit_cents),
    }
    if (
      stored.subtotal !== Number(t.subtotal) ||
      stored.total !== Number(t.total) ||
      stored.deposit !== deposit.amountCents
    )
      throw new Error(`estimate version ${v.id}: stored totals differ from its lines`)
  }
  return {
    ok: true,
    totals: {
      options: selected,
      subtotalCents: Number(t.subtotal),
      discountCents: Number(t.discount),
      totalCents: Number(t.total),
      deposit,
      depositRuleVersion: v.deposit_rule_version,
    },
  }
}

const selectionProblem = (problem: SelectionProblem): ApiError =>
  problem === 'DEPOSIT_RULE_MISSING'
    ? new ApiError('NOT_CONFIGURED', { fieldErrors: [field('deposit', 'DEPOSIT_RULE_NOT_CONFIGURED')] })
    : new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body.options', problem)] })

async function dbNow(tx: Reader): Promise<Date> {
  const r = await sql<{ now: Date }>`SELECT now() AS now`.execute(tx)
  return new Date((r.rows[0] as { now: Date }).now)
}

/** The options a customer selected on a version (kept on the server, HH-ID-07), or none. */
export async function savedSelection(db: Reader, versionId: string, contactRef: string): Promise<number[]> {
  const row = await db
    .selectFrom('estimating.approval_selections')
    .select('options')
    .where('version_id', '=', versionId)
    .where('contact_ref', '=', contactRef)
    .executeTakeFirst()
  return row ? [...row.options].sort((a, b) => a - b) : []
}

/** The totals of a selection on a version, for the estimate view; null when they cannot be computed. */
export async function selectionTotals(
  db: Reader,
  versionId: string,
  options: readonly number[],
): Promise<SelectionTotals | null> {
  const v = await versionPricing(db, versionId)
  if (!v) return null
  const out = await totalsFor(db, v, options)
  return out.ok ? out.totals : null
}

/**
 * Saves the customer's selected options on the current version and answers the server's totals for them (the total
 * and any deposit shown before approving). Only the current version takes a selection; another status is a CONFLICT
 * naming it. Nothing here approves anything.
 */
export async function saveSelection(
  tx: Tx,
  actor: CustomerActor,
  scope: DataScope,
  input: CustomerVersionRef & { options: readonly number[] },
): Promise<{ versionId: string; totals: SelectionTotals }> {
  const found = await customerVersionRow(tx, scope, input)
  if (!found) throw new ApiError('NOT_FOUND')
  const v = await versionPricing(tx, found.id)
  if (!v) throw new ApiError('NOT_FOUND')
  const now = await dbNow(tx)
  const status = customerVersionStatus(v.state, v.valid_until, now)
  if (status !== 'current')
    throw new ApiError('CONFLICT', { fieldErrors: [field('version', `VERSION_${status.toUpperCase()}`)] })
  const out = await totalsFor(tx, v, input.options)
  if (!out.ok) throw selectionProblem(out.problem)
  await tx
    .insertInto('estimating.approval_selections')
    .values({ version_id: v.id, contact_ref: actor.contactId, options: out.totals.options, updated_at: now })
    .onConflict((oc) =>
      oc.columns(['version_id', 'contact_ref']).doUpdateSet({ options: out.totals.options, updated_at: now }),
    )
    .execute()
  return { versionId: v.id, totals: out.totals }
}

export type ApproveInput = CustomerVersionRef & {
  contentDigest: string
  options: readonly number[]
  totalCents: number
  depositCents: number | null
  termsDocumentId: string
  termsSha256: string
  acceptTerms: boolean
  fullName: string
  session: CustomerSession
  idempotencyKey: string
  clientAddress: string | null
  userAgent: string | null
  testMark: boolean
}

export type ApprovalResult = {
  created: boolean
  approvalId: string
  versionId: string
  jobId: string
  schedulingTaskId: string
  at: Date
  options: number[]
  subtotalCents: number
  discountCents: number
  totalCents: number
  deposit: { state: 'required' | 'not_required'; amountCents: number | null }
}

/** The approval recorded for a version, as the customer's view and the replay answer show it. */
export async function approvalOfVersion(db: Reader, versionId: string): Promise<ApprovalResult | null> {
  const a = await db
    .selectFrom('estimating.approvals as a')
    .innerJoin('work.jobs as j', 'j.approval_id', 'a.id')
    .innerJoin('work.scheduling_tasks as s', 's.job_id', 'j.id')
    .select([
      'a.id',
      'a.version_id',
      'a.created_at',
      'a.selected_options',
      'a.subtotal_cents',
      'a.discount_cents',
      'a.total_cents',
      'a.deposit_state',
      'a.deposit_cents',
      'j.id as job_id',
      's.id as scheduling_task_id',
    ])
    .where('a.version_id', '=', versionId)
    .executeTakeFirst()
  if (!a) return null
  return {
    created: false,
    approvalId: a.id,
    versionId: a.version_id,
    jobId: a.job_id,
    schedulingTaskId: a.scheduling_task_id,
    at: a.created_at,
    options: [...a.selected_options].sort((x, y) => x - y),
    subtotalCents: Number(a.subtotal_cents),
    discountCents: Number(a.discount_cents),
    totalCents: Number(a.total_cents),
    deposit:
      a.deposit_state === 'required'
        ? { state: 'required', amountCents: Number(a.deposit_cents) }
        : { state: 'not_required', amountCents: null },
  }
}

export type TermsCheck =
  | { ok: true; documentId: string; sha256: string; policyVersion: number }
  | { ok: false; code: 'TERMS_NOT_CONFIGURED' | 'TERMS_NOT_IN_EFFECT' | 'TERMS_NOT_CURRENT' }

/**
 * Whether a version's pinned terms may be accepted now: the current recorded version of legal.estimate_terms names
 * the same document, this software holds that document's wording with the recorded content hash, and the recorded
 * version is in effect for real customers (approved and attorney-reviewed, PROPOSED rule of estimateTermsInEffect).
 */
export async function termsForApproval(db: Reader, pinned: string | null): Promise<TermsCheck> {
  const entry = (await loadConfig(db)).get('legal.estimate_terms')
  const doc = estimateTermsDocument(pinned)
  if (entry.state !== 'CONFIGURED' || !doc || pinned === null) return { ok: false, code: 'TERMS_NOT_CONFIGURED' }
  if (entry.value.documentId !== pinned) return { ok: false, code: 'TERMS_NOT_CURRENT' }
  if (entry.value.contentSha256 !== doc.contentSha256) return { ok: false, code: 'TERMS_NOT_CONFIGURED' }
  if (!estimateTermsInEffect(entry.value)) return { ok: false, code: 'TERMS_NOT_IN_EFFECT' }
  return { ok: true, documentId: pinned, sha256: doc.contentSha256, policyVersion: entry.version }
}

const PAYMENT_TERM_TEXT: Record<string, CustomerKey> = { due_on_receipt: 'estimatePdf.paymentTerm.due_on_receipt' }

/** The access a session came through, read again at the moment of the write (HH-ID-07). */
async function accessStillValid(tx: Tx, session: CustomerSession, projectId: string, now: Date): Promise<boolean> {
  const live = await tx
    .selectFrom('identity.customer_sessions')
    .select(['revoked_at', 'expires_at', 'fresh_until'])
    .where('id', '=', session.id)
    .forShare()
    .executeTakeFirst()
  if (!live || live.revoked_at !== null || live.expires_at <= now) return false
  if (!session.projectIds.includes(projectId)) return false
  if (session.via === 'grant') {
    if (!session.grantId) return false
    const grant = await tx
      .selectFrom('identity.project_access_grants')
      .select(['project_id', 'revoked_at'])
      .where('id', '=', session.grantId)
      .forShare()
      .executeTakeFirst()
    return grant?.project_id === projectId && grant.revoked_at === null
  }
  if (!session.accountId) return false
  const link = await tx
    .selectFrom('identity.customer_identity_links as l')
    .innerJoin('identity.customer_accounts as a', 'a.id', 'l.account_id')
    .select('l.id')
    .where('l.account_id', '=', session.accountId)
    .where('l.project_id', '=', projectId)
    .where('l.state', '=', 'active')
    .where('a.state', '=', 'active')
    .forShare('l')
    .executeTakeFirst()
  return link !== undefined
}

/** Fresh enough by the database clock, read again inside the transaction (the policy checked it at the request). */
async function stillFresh(tx: Tx, sessionId: string, now: Date): Promise<boolean> {
  const row = await tx
    .selectFrom('identity.customer_sessions')
    .select('fresh_until')
    .where('id', '=', sessionId)
    .executeTakeFirst()
  return row !== undefined && row.fresh_until > now
}

const sameNumbers = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((x, i) => x === b[i])

/**
 * Approves one exact version in the caller's transaction. Refusals write nothing: NOT_FOUND outside the scope;
 * CONFLICT naming the version's status (with the current version to review, or none) for a version that cannot be
 * approved, the content digest, the terms or the project; NOT_CONFIGURED while the terms are not in effect;
 * VALIDATION_FAILED for options that are not options, a total or deposit that is not the server's, an unticked terms
 * box or an empty name; FORBIDDEN FRESH_VERIFICATION_REQUIRED or ACCESS_REVOKED when the session no longer qualifies.
 * The caller authorizes the action (estimate.approve) and records the audit event.
 */
export async function approveVersion(
  tx: Tx,
  actor: CustomerActor,
  scope: DataScope,
  input: ApproveInput,
): Promise<ApprovalResult> {
  if (!tx.isTransaction) throw new Error('approveVersion runs inside the business transaction (withTx)')
  const found = await customerVersionRow(tx, scope, input)
  if (!found) throw new ApiError('NOT_FOUND')
  // The lifecycle's lock order: the estimate first, then the version. A second tab or a race waits here.
  await tx.selectFrom('estimating.estimates').select('id').where('id', '=', found.estimate_id).forUpdate().execute()
  const v = await versionPricing(tx, found.id, true)
  if (!v) throw new ApiError('NOT_FOUND')
  const now = await dbNow(tx)
  const fullName = input.fullName.trim().replace(/\s+/g, ' ')
  const options = [...new Set(input.options)].sort((a, b) => a - b)

  // Already approved: the first approval answers a second tab or a retry under a new key, when it is the same
  // customer's same choice; anything else is a conflict that names the version's status.
  if (v.state === 'accepted') {
    const existing = await approvalOfVersion(tx, v.id)
    const by = await tx
      .selectFrom('estimating.approvals')
      .select(['contact_ref'])
      .where('version_id', '=', v.id)
      .executeTakeFirst()
    if (
      existing &&
      by?.contact_ref === actor.contactId &&
      sameNumbers(existing.options, options) &&
      existing.totalCents === input.totalCents
    )
      return existing
    throw new ApiError('CONFLICT', { fieldErrors: [field('version', 'VERSION_APPROVED')] })
  }

  const status = customerVersionStatus(v.state, v.valid_until, now)
  if (status !== 'current') {
    const current = await currentVersion(tx, v.estimate_id, now)
    throw new ApiError('CONFLICT', {
      fieldErrors: [field('version', `VERSION_${status.toUpperCase()}`)],
      ...(current && current.versionId !== v.id
        ? { current: { version: current.version, values: { number: found.number } } }
        : {}),
    })
  }

  const terms = await termsForApproval(tx, v.terms_version)
  if (!terms.ok)
    throw terms.code === 'TERMS_NOT_CURRENT'
      ? new ApiError('CONFLICT', { fieldErrors: [field('terms', terms.code)] })
      : new ApiError('NOT_CONFIGURED', { fieldErrors: [field('terms', terms.code)] })
  if (input.termsDocumentId !== terms.documentId || input.termsSha256 !== terms.sha256)
    throw new ApiError('CONFLICT', { fieldErrors: [field('body.termsDocumentId', 'TERMS_NOT_SHOWN')] })

  const content = await customerVersionContent(tx, v.id)
  if (!content) throw new ApiError('NOT_FOUND')
  const digest = digestOf(content, v.document_sha256)
  if (input.contentDigest !== digest)
    throw new ApiError('CONFLICT', { fieldErrors: [field('body.contentDigest', 'CONTENT_MISMATCH')] })

  if (input.acceptTerms !== true)
    throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body.acceptTerms', 'required')] })
  if (fullName.length === 0 || fullName.length > FULL_NAME_MAX)
    throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body.fullName', 'required')] })

  const priced = await totalsFor(tx, v, options)
  if (!priced.ok) throw selectionProblem(priced.problem)
  const totals = priced.totals
  if (totals.totalCents !== input.totalCents || totals.deposit.amountCents !== input.depositCents)
    throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body.totalCents', 'TOTAL_MISMATCH')] })

  // Fresh verification and the access used, read again at the moment of the write.
  if (!(await stillFresh(tx, input.session.id, now)))
    throw new ApiError('FORBIDDEN', { fieldErrors: [field('verification', 'FRESH_VERIFICATION_REQUIRED')] })
  if (!(await accessStillValid(tx, input.session, v.project_id, now)))
    throw new ApiError('FORBIDDEN', { fieldErrors: [field('access', 'ACCESS_REVOKED')] })

  // The project: open, with no job yet (one job per approved project).
  const project = await tx
    .selectFrom('crm.projects')
    .select(['id', 'state', 'state_version'])
    .where('id', '=', v.project_id)
    .forUpdate()
    .executeTakeFirstOrThrow()
  const hasJob = await tx.selectFrom('work.jobs').select('id').where('project_id', '=', v.project_id).executeTakeFirst()
  const projectMove = apply(
    { machine: 'project.lifecycle', state: project.state as ProjectState, version: project.state_version },
    'approve',
    { actor: 'system', expectedVersion: project.state_version, now, facts: { hasJob: hasJob !== undefined } },
  )
  if (!projectMove.ok)
    throw new ApiError('CONFLICT', { fieldErrors: [field('project', `PROJECT_${projectMove.code}`)] })

  // The version: published -> accepted, under the machine's guards (current and unexpired; the database checks too).
  const newer = await tx
    .selectFrom('estimating.estimate_versions')
    .select('id')
    .where('estimate_id', '=', v.estimate_id)
    .where('version', '>', v.version)
    .where('state', 'in', ['published', 'accepted'])
    .executeTakeFirst()
  const accepted = apply(
    { machine: 'estimate_version.lifecycle', state: v.state as EstimateVersionState, version: v.row_version },
    'accept',
    {
      actor: 'customer',
      expectedVersion: v.row_version,
      now,
      facts: { newerVersionPublished: newer !== undefined, ...(v.valid_until ? { validUntil: v.valid_until } : {}) },
    },
  )
  if (!accepted.ok) throw new ApiError('CONFLICT', { fieldErrors: [field('version', `VERSION_${accepted.code}`)] })
  await tx
    .updateTable('estimating.estimate_versions')
    .set({ state: accepted.to, state_changed_at: now, row_version: accepted.version })
    .where('id', '=', v.id)
    .execute()

  const config = await loadConfig(tx)
  const privacy = config.get('legal.privacy_notice')
  const termText = customerTranslator().t(PAYMENT_TERM_TEXT[v.payment_term] ?? 'estimatePdf.notProvided')
  const approval = await tx
    .insertInto('estimating.approvals')
    .values({
      project_id: v.project_id,
      estimate_id: v.estimate_id,
      version_id: v.id,
      version: v.version,
      content_sha256: digest,
      authoring_method: v.authoring_method,
      document_sha256: v.document_sha256,
      selected_options: totals.options,
      subtotal_cents: totals.subtotalCents,
      discount_cents: totals.discountCents,
      total_cents: totals.totalCents,
      deposit_state: totals.deposit.state,
      deposit_cents: totals.deposit.amountCents,
      deposit_rule_version: totals.depositRuleVersion,
      discount_rule_version: v.discount_rule_version,
      terms_document_id: terms.documentId,
      terms_sha256: terms.sha256,
      terms_policy_version: terms.policyVersion,
      payment_term: v.payment_term,
      payment_term_version: v.payment_term_version,
      payment_term_text: termText,
      privacy_notice_id: privacy.state === 'CONFIGURED' ? privacy.value.documentId : null,
      terms_accepted: true,
      full_name: fullName,
      contact_ref: actor.contactId,
      access_via: input.session.via,
      grant_id: input.session.via === 'grant' ? input.session.grantId : null,
      account_id: input.session.via === 'account' ? input.session.accountId : null,
      customer_session_id: input.session.id,
      verified_at: input.session.verifiedAt,
      method: 'portal',
      test_mark: input.testMark,
      client_address: input.clientAddress ? input.clientAddress.slice(0, 100) : null,
      user_agent: input.userAgent ? input.userAgent.slice(0, 400) : null,
      idempotency_key: input.idempotencyKey,
      created_at: now,
    })
    .returning(['id', 'created_at'])
    .executeTakeFirstOrThrow()

  await tx
    .updateTable('crm.projects')
    .set({ state: projectMove.to, state_version: projectMove.version })
    .where('id', '=', v.project_id)
    .execute()
  const job = await tx
    .insertInto('work.jobs')
    .values({ project_id: v.project_id, approval_id: approval.id, created_at: now })
    .returning('id')
    .executeTakeFirstOrThrow()

  // The job's scope snapshot version 1: the approved lines (base and selected options) and every customer text.
  const lines = content.lines.filter((l) => l.kind === 'base' || totals.options.includes(l.position))
  const texts = {
    assumptions: content.assumptions,
    exclusions: content.exclusions,
    customerResponsibilities: content.customerResponsibilities,
    dependencies: content.dependencies,
    scheduleAssumptions: content.scheduleAssumptions,
  }
  const snapshot = {
    estimateNumber: content.estimateNumber,
    version: content.version,
    contentSha256: digest,
    lines,
    texts,
    options: totals.options,
    subtotalCents: totals.subtotalCents,
    discountCents: totals.discountCents,
    totalCents: totals.totalCents,
    deposit: totals.deposit,
    terms: { documentId: terms.documentId, sha256: terms.sha256 },
  }
  await tx
    .insertInto('work.job_scope_snapshots')
    .values({
      job_id: job.id,
      version: 1,
      source: 'approval',
      approval_id: approval.id,
      estimate_version_id: v.id,
      lines: JSON.stringify(lines),
      texts: JSON.stringify(texts),
      exclusions: content.exclusions,
      selected_options: totals.options,
      subtotal_cents: totals.subtotalCents,
      discount_cents: totals.discountCents,
      total_cents: totals.totalCents,
      terms_document_id: terms.documentId,
      terms_sha256: terms.sha256,
      content_sha256: sha256(canonicalJson(snapshot)),
      created_at: now,
    })
    .execute()
  const task = await tx
    .insertInto('work.scheduling_tasks')
    .values({ job_id: job.id, project_id: v.project_id, created_at: now })
    .returning('id')
    .executeTakeFirstOrThrow()
  await tx
    .updateTable('work.work_packages')
    .set((eb) => ({ job_id: job.id, version: eb('version', '+', 1) }))
    .where('project_id', '=', v.project_id)
    .where('job_id', 'is', null)
    .execute()
  // TSK-0068 (HH-PKT-03): each work package of the job pins the current SOP version of its service, or records that
  // none exists (NOT CONFIGURED: the package cannot become ready until one is pinned).
  await pinJobSops(tx, { jobId: job.id, source: 'approval', at: now })
  // The selection was working data for this approval; the approval now holds it.
  await tx.deleteFrom('estimating.approval_selections').where('version_id', '=', v.id).execute()

  await outbox.add(tx, {
    type: ESTIMATE_APPROVED_EVENT,
    aggregate: { type: 'estimate_approval', id: approval.id },
    payload: { version: v.version, depositRequired: totals.deposit.state === 'required' },
    idempotencyKey: `${ESTIMATE_APPROVED_EVENT}:${approval.id}`,
    requestId: currentContext()?.requestId ?? `estimate-approval:${approval.id}`,
  })

  return {
    created: true,
    approvalId: approval.id,
    versionId: v.id,
    jobId: job.id,
    schedulingTaskId: task.id,
    at: approval.created_at,
    options: totals.options,
    subtotalCents: totals.subtotalCents,
    discountCents: totals.discountCents,
    totalCents: totals.totalCents,
    deposit: totals.deposit,
  }
}
