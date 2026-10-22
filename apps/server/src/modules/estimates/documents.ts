// Upload an Estimate: the documents of an uploaded estimate version and the agree-confirmation (TSK-0054; HH-EST-11,
// HH-SEC-05, ENT-Document, ENT-EstimateVersion, INT-R2, FACT-UPLOAD-LIMITS, OWN-DEC-102, OWN-DEC-146,
// RULE-SERVER-AUTHZ, RULE-NO-INVENTED-FACTS).
// - Staff upload the estimate as a PDF or Word (.docx) original. The server checks the real content
//   (document-content.ts), the declared type and the per-file size of uploads.limits (15 MiB, the photo limit's
//   maxFileBytes: FACT-UPLOAD-LIMITS applies one per-file limit to photos and documents), stores the original once
//   under an opaque key in the private bucket (R2, or the fake in local and ci) and quarantines it; the
//   estimate_document.process job checks the stored bytes again and marks it ready or rejected. The original is never
//   changed: its SHA-256 is kept and checked again whenever it is read.
// - The customer views a PDF, never the original: for a PDF original the server stores a copy of the same bytes as
//   the customer PDF; for a Word original no faithful converter exists in this deployment (no office suite in the
//   image, and no third-party conversion service may be used), so staff supply the PDF of the same document and the
//   version is not ready ("PDF required") until they do. Nothing pretends a conversion happened.
// - The amounts are the structured fields of the version (its lines and server-computed totals, model.ts): they are
//   never read or guessed from a document. Before publishing, staff confirm that the document and the structured
//   amounts agree; the confirmation names the customer PDF it was given for and is cleared by any later save or upload.
// - Authorization is decided here through the policy (estimate.draft, Owner and Estimator). Only draft and in-review
//   versions take documents; the database refuses any document change once the version is past review (migration
//   0030). Lock order: the version row first, then its documents, in every writer and in the processing job.
import { createHash, randomUUID } from 'node:crypto'
import type { Db, Tx } from '@handyhub/db'
import { decide, type StaffActor } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError, type FieldError } from '../../api/errors.js'
import type { Automation } from '../../platform/automation.js'
import { loadConfig, type Config } from '../../platform/config/index.js'
import { outbox } from '../../platform/outbox.js'
import type { ObjectStorage } from '../../providers/index.js'
import {
  documentProblems,
  DOCX_TYPE,
  ESTIMATE_DOCUMENT_TYPES,
  PDF_TYPE,
  type DocumentProblem,
} from './document-content.js'
import { EDITABLE_STATES, isUuid } from './model.js'
import { refreshEstimateApprovals } from './owner-approval.js'

export const ESTIMATE_DOCUMENT_UPLOADED_EVENT = 'estimate_document.uploaded'
export const DOCUMENT_ROLES = ['original', 'customer_pdf'] as const
export type DocumentRole = (typeof DOCUMENT_ROLES)[number]
export const DOCUMENT_STATES = ['quarantined', 'ready', 'rejected', 'replaced'] as const
export type DocumentState = (typeof DOCUMENT_STATES)[number]
export const DOCUMENT_SOURCES = ['uploaded', 'copy_of_original', 'supplied'] as const
/** The types each role accepts: the original is a PDF or Word document; the customer document is always a PDF. */
export const ROLE_TYPES: Record<DocumentRole, readonly string[]> = {
  original: ESTIMATE_DOCUMENT_TYPES,
  customer_pdf: [PDF_TYPE],
}

export type UploadProblem = DocumentProblem | 'too_large' | 'empty' | 'type_not_allowed'

export class DocumentError extends Error {
  override name = 'DocumentError'
  constructor(readonly problem: UploadProblem | 'not_configured' | 'storage_not_configured') {
    super(problem)
  }
}

export type EstimateDocumentView = {
  id: string
  role: DocumentRole
  source: (typeof DOCUMENT_SOURCES)[number]
  contentType: string
  byteSize: number
  sha256: string
  state: DocumentState
  rejectionReason: string | null
  uploadedAt: string
}

/** The current documents of a version: its original and the customer PDF (null where none is current). */
export type CurrentDocuments = { original: EstimateDocumentView | null; customerPdf: EstimateDocumentView | null }

type Reader = Db | Tx

const COLUMNS = [
  'id',
  'role',
  'source',
  'content_type',
  'byte_size',
  'sha256',
  'state',
  'rejection_reason',
  'uploaded_at',
] as const
type Row = {
  id: string
  role: string
  source: string
  content_type: string
  byte_size: number
  sha256: string
  state: string
  rejection_reason: string | null
  uploaded_at: Date
}
const view = (r: Row): EstimateDocumentView => ({
  id: r.id,
  role: r.role as DocumentRole,
  source: r.source as EstimateDocumentView['source'],
  contentType: r.content_type,
  byteSize: r.byte_size,
  sha256: r.sha256,
  state: r.state as DocumentState,
  rejectionReason: r.rejection_reason,
  uploadedAt: r.uploaded_at.toISOString(),
})

const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')
const field = (f: string, code: string): FieldError => ({ field: f, code, message: '' })

/** The per-file limit of uploads.limits (FACT-UPLOAD-LIMITS), or null while NOT CONFIGURED. */
export function documentLimits(config: Config): { maxFileBytes: number } | null {
  const l = config.get('uploads.limits')
  return l.state === 'CONFIGURED' ? { maxFileBytes: l.value.maxFileBytes } : null
}

/** The current (not replaced) original and customer PDF of a version. */
export async function currentDocuments(db: Reader, versionId: string): Promise<CurrentDocuments> {
  const rows = await db
    .selectFrom('estimating.estimate_documents')
    .select(COLUMNS)
    .where('version_id', '=', versionId)
    .where('state', 'in', ['quarantined', 'ready', 'rejected'])
    .execute()
  const of = (role: DocumentRole) => {
    const r = rows.find((x) => x.role === role)
    return r ? view(r) : null
  }
  return { original: of('original'), customerPdf: of('customer_pdf') }
}

/** True while a Word original has no ready or processing customer PDF: "PDF required" (HH-EST-11). */
export function pdfRequired(docs: CurrentDocuments): boolean {
  return (
    docs.original !== null &&
    docs.original.contentType === DOCX_TYPE &&
    (docs.customerPdf === null || docs.customerPdf.state === 'rejected')
  )
}

/** What the staff builder shows of an uploaded version's documents (null fields where there is none yet). */
export async function documentsView(db: Reader, versionId: string, config: Config) {
  const docs = await currentDocuments(db, versionId)
  const v = await db
    .selectFrom('estimating.estimate_versions as v')
    .leftJoin('identity.staff_users as s', 's.id', 'v.agreement_confirmed_by')
    .select(['v.agreement_document_id', 'v.agreement_confirmed_by', 'v.agreement_confirmed_at', 's.display_name'])
    .where('v.id', '=', versionId)
    .executeTakeFirstOrThrow()
  const limits = documentLimits(config)
  return {
    original: docs.original,
    customerPdf: docs.customerPdf,
    pdfRequired: pdfRequired(docs),
    agreement:
      v.agreement_document_id && v.agreement_confirmed_by && v.agreement_confirmed_at
        ? {
            confirmedBy: { id: v.agreement_confirmed_by, name: v.display_name ?? null },
            confirmedAt: v.agreement_confirmed_at.toISOString(),
            documentId: v.agreement_document_id,
            current: docs.customerPdf?.id === v.agreement_document_id,
          }
        : null,
    maxFileBytes: limits?.maxFileBytes ?? null,
    types: [...ESTIMATE_DOCUMENT_TYPES],
  }
}

type LockedVersion = {
  id: string
  project_id: string
  state: string
  authoring_method: string
  row_version: number
  total_cents: string | null
}

/** The version row locked for a document write, authorized and checked: an uploaded version still being edited. */
async function lockUploadedVersion(tx: Tx, actor: StaffActor, versionId: string): Promise<LockedVersion> {
  if (!isUuid(versionId)) throw new ApiError('NOT_FOUND')
  const v = await tx
    .selectFrom('estimating.estimate_versions')
    .select(['id', 'project_id', 'state', 'authoring_method', 'row_version', 'total_cents'])
    .where('id', '=', versionId)
    .forUpdate()
    .executeTakeFirst()
  if (!v) throw new ApiError('NOT_FOUND')
  if (
    decide(actor, 'estimate.draft', { projectId: v.project_id }, { now: new Date(), online: true }).effect !== 'allow'
  )
    throw new ApiError('FORBIDDEN')
  if (v.authoring_method !== 'uploaded')
    throw new ApiError('CONFLICT', { fieldErrors: [field('authoringMethod', 'NOT_UPLOADED_METHOD')] })
  if (!(EDITABLE_STATES as readonly string[]).includes(v.state))
    throw new ApiError('CONFLICT', { fieldErrors: [field('state', 'VERSION_NOT_EDITABLE')] })
  return v
}

/** Clears the agree-confirmation and moves the row version on (any document change needs a new confirmation). */
async function touchVersion(tx: Tx, actor: StaffActor, v: LockedVersion): Promise<number> {
  const rowVersion = v.row_version + 1
  await tx
    .updateTable('estimating.estimate_versions')
    .set({
      agreement_document_id: null,
      agreement_confirmed_by: null,
      agreement_confirmed_at: null,
      updated_by: actor.userId,
      updated_at: new Date(),
      row_version: rowVersion,
    })
    .where('id', '=', v.id)
    .execute()
  // TSK-0130 (HH-EST-16): a changed customer document is a scope change for an open Owner approval.
  await refreshEstimateApprovals(tx, actor, v.id)
  return rowVersion
}

/**
 * Checks and stores one document of an uploaded version. Throws DocumentError naming the problem (nothing is stored
 * then), or ApiError for a refused write. The same bytes sent again for the same role return the current document,
 * so a retried upload never duplicates it; any other upload needs the version's current row version.
 */
export async function uploadEstimateDocument(
  tx: Tx,
  actor: StaffActor,
  input: {
    versionId: string
    role: DocumentRole
    bytes: Uint8Array
    declaredType: string
    storage: ObjectStorage | null
    expectedRowVersion: () => number
    requestId: string
  },
): Promise<{ document: EstimateDocumentView; created: boolean; rowVersion: number }> {
  const v = await lockUploadedVersion(tx, actor, input.versionId)
  const limits = documentLimits(await loadConfig(tx))
  if (!limits) throw new DocumentError('not_configured')
  if (!input.storage) throw new DocumentError('storage_not_configured')
  const declared = input.declaredType.split(';')[0]?.trim().toLowerCase() ?? ''
  if (!ROLE_TYPES[input.role].includes(declared)) throw new DocumentError('type_not_allowed')
  if (input.bytes.length === 0) throw new DocumentError('empty')
  if (input.bytes.length > limits.maxFileBytes) throw new DocumentError('too_large')
  const problem = documentProblems(input.bytes, declared)[0]
  if (problem) throw new DocumentError(problem)

  const docs = await currentDocuments(tx, v.id)
  const hash = sha256(input.bytes)
  const current = input.role === 'original' ? docs.original : docs.customerPdf
  if (current && current.sha256 === hash && current.state !== 'rejected')
    return { document: current, created: false, rowVersion: v.row_version }
  if (input.role === 'customer_pdf') {
    // Only a Word original needs a supplied PDF; a PDF original's customer copy is made by the server.
    if (!docs.original) throw new ApiError('CONFLICT', { fieldErrors: [field('role', 'DOCUMENT_MISSING')] })
    if (docs.original.contentType !== DOCX_TYPE)
      throw new ApiError('CONFLICT', { fieldErrors: [field('role', 'PDF_NOT_NEEDED')] })
  }
  const expected = input.expectedRowVersion()
  if (expected !== v.row_version) throw new ApiError('STALE_VERSION', { current: { version: v.row_version } })

  // The current documents this upload replaces are kept, marked replaced. A new original also replaces the customer
  // PDF, which belonged to the old original.
  const replaces = input.role === 'original' ? DOCUMENT_ROLES : (['customer_pdf'] as const)
  await tx
    .updateTable('estimating.estimate_documents')
    .set({ state: 'replaced', replaced_at: sql<Date>`now()` })
    .where('version_id', '=', v.id)
    .where('role', 'in', [...replaces])
    .where('state', 'in', ['quarantined', 'ready', 'rejected'])
    .execute()

  const store = async (row: {
    id: string
    role: DocumentRole
    source: EstimateDocumentView['source']
    derivedFrom: string | null
  }) => {
    // Opaque key: no name, address or file name; the object is written once and never overwritten.
    const key = `estimates/documents/${row.id}`
    await (input.storage as ObjectStorage).put(key, input.bytes, declared)
    const inserted = await tx
      .insertInto('estimating.estimate_documents')
      .values({
        id: row.id,
        version_id: v.id,
        project_id: v.project_id,
        role: row.role,
        source: row.source,
        derived_from: row.derivedFrom,
        object_key: key,
        content_type: declared,
        byte_size: input.bytes.length,
        sha256: hash,
        visibility: row.role === 'original' ? 'staff' : 'customer',
        uploaded_by: actor.userId,
      })
      .returning(COLUMNS)
      .executeTakeFirstOrThrow()
    await outbox.add(tx, {
      type: ESTIMATE_DOCUMENT_UPLOADED_EVENT,
      aggregate: { type: 'estimate_document', id: row.id },
      payload: { documentId: row.id },
      idempotencyKey: `${ESTIMATE_DOCUMENT_UPLOADED_EVENT}:${row.id}`,
      requestId: input.requestId,
    })
    return view(inserted)
  }
  const id = randomUUID()
  const document = await store({
    id,
    role: input.role,
    source: input.role === 'original' ? 'uploaded' : 'supplied',
    derivedFrom: null,
  })
  if (input.role === 'original' && declared === PDF_TYPE)
    await store({ id: randomUUID(), role: 'customer_pdf', source: 'copy_of_original', derivedFrom: id })
  return { document, created: true, rowVersion: await touchVersion(tx, actor, v) }
}

/**
 * Gives or withdraws the agree-confirmation of an uploaded version: the staff member confirms that the document and
 * the structured amounts (lines, total, deposit, validity) agree. Giving it needs the original and the customer PDF
 * processed and ready and the totals computed; it is recorded for that customer PDF only.
 */
export async function setAgreement(
  tx: Tx,
  actor: StaffActor,
  versionId: string,
  confirmed: boolean,
  expectedRowVersion: number,
): Promise<{ rowVersion: number }> {
  const v = await lockUploadedVersion(tx, actor, versionId)
  if (expectedRowVersion !== v.row_version) throw new ApiError('STALE_VERSION', { current: { version: v.row_version } })
  const rowVersion = v.row_version + 1
  if (!confirmed) {
    await touchVersion(tx, actor, v)
    return { rowVersion }
  }
  const docs = await currentDocuments(tx, v.id)
  if (docs.original?.state !== 'ready' || docs.customerPdf?.state !== 'ready')
    throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('confirmed', 'DOCUMENT_NOT_READY')] })
  if (v.total_cents === null)
    throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('confirmed', 'TOTALS_INCOMPLETE')] })
  await tx
    .updateTable('estimating.estimate_versions')
    .set({
      agreement_document_id: docs.customerPdf.id,
      agreement_confirmed_by: actor.userId,
      agreement_confirmed_at: new Date(),
      updated_by: actor.userId,
      updated_at: new Date(),
      row_version: rowVersion,
    })
    .where('id', '=', v.id)
    .execute()
  await refreshEstimateApprovals(tx, actor, v.id)
  return { rowVersion }
}

/** An integrity failure: the stored object no longer matches the hash recorded when it was uploaded. */
export class DocumentIntegrityError extends Error {
  override name = 'DocumentIntegrityError'
}

/**
 * The bytes of one document of a version, checked against the SHA-256 recorded at upload; null for a document that
 * is not this version's or never passed processing (quarantined, rejected). The caller authorizes the read first.
 */
export async function readEstimateDocument(
  db: Reader,
  input: { versionId: string; documentId: string; storage: ObjectStorage | null },
): Promise<{ bytes: Uint8Array; contentType: string; sha256: string; role: DocumentRole } | null> {
  if (!input.storage || !isUuid(input.documentId)) return null
  const row = await db
    .selectFrom('estimating.estimate_documents')
    .select(['object_key', 'content_type', 'sha256', 'role', 'state', 'processed_at', 'rejection_reason'])
    .where('id', '=', input.documentId)
    .where('version_id', '=', input.versionId)
    .executeTakeFirst()
  // Ready documents, and replaced ones that had passed processing (the history of the version).
  const passed =
    row &&
    (row.state === 'ready' || (row.state === 'replaced' && row.processed_at !== null && row.rejection_reason === null))
  if (!row || !passed) return null
  const { bytes } = await input.storage.get(row.object_key)
  if (sha256(bytes) !== row.sha256) throw new DocumentIntegrityError('stored estimate document does not match its hash')
  return { bytes, contentType: row.content_type, sha256: row.sha256, role: row.role as DocumentRole }
}

/** The processing step: a quarantined document is checked again from storage before it may be used or served. */
export function estimateDocumentProcessAutomation(storage: ObjectStorage | null): Automation {
  return {
    name: 'estimate_document.process',
    trigger: { kind: 'event', eventTypes: [ESTIMATE_DOCUMENT_UPLOADED_EVENT] },
    identity: 'system.media',
    inputs: { description: 'the document id of the estimate_document.uploaded event', version: 1 },
    idempotency: 'only a quarantined document is processed; a processed or replaced one is left as it is',
    effect: 'marks a quarantined estimate document ready or rejected after checking the stored bytes',
    retry: { maxAttempts: 5, baseDelayMs: 2_000, maxDelayMs: 120_000 },
    timeoutMs: 60_000,
    exceptionOwner: 'estimator',
    audit: { action: 'estimate_document.processed' },
    handle: async ({ tx, job }) => {
      const id = job.target.id
      if (!id || !isUuid(id)) return 'cancelled'
      const owner = await tx
        .selectFrom('estimating.estimate_documents')
        .select('version_id')
        .where('id', '=', id)
        .executeTakeFirst()
      if (!owner) return 'cancelled'
      // The version first, then the document: the same lock order as uploads and saves.
      await tx
        .selectFrom('estimating.estimate_versions')
        .select('id')
        .where('id', '=', owner.version_id)
        .forShare()
        .executeTakeFirst()
      const row = await tx
        .selectFrom('estimating.estimate_documents')
        .select(['id', 'object_key', 'content_type', 'sha256', 'state', 'derived_from'])
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirst()
      if (!row || row.state !== 'quarantined') return 'cancelled'
      if (!storage) throw new DocumentError('storage_not_configured')
      const { bytes } = await storage.get(row.object_key)
      let problem: string | undefined = sha256(bytes) === row.sha256 ? undefined : 'malformed'
      if (!problem && row.derived_from) {
        // A customer copy holds exactly the bytes of its original.
        const original = await tx
          .selectFrom('estimating.estimate_documents')
          .select('sha256')
          .where('id', '=', row.derived_from)
          .executeTakeFirst()
        if (original?.sha256 !== row.sha256) problem = 'malformed'
      }
      problem ??= documentProblems(bytes, row.content_type)[0]
      await tx
        .updateTable('estimating.estimate_documents')
        .set(
          problem
            ? { state: 'rejected', rejection_reason: problem, processed_at: sql<Date>`now()` }
            : { state: 'ready', processed_at: sql<Date>`now()` },
        )
        .where('id', '=', id)
        .execute()
      return 'done'
    },
  }
}
