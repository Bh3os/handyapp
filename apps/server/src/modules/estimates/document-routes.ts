// Upload an Estimate and the customer PDF: the staff routes (TSK-0054; HH-EST-11, HH-SEC-05, HH-EST-01, ENT-Document,
// INT-R2, FACT-UPLOAD-LIMITS, RULE-SERVER-AUTHZ, RULE-NO-INVENTED-FACTS).
//   POST /staff/projects/:projectId/uploaded-estimates                 Upload an Estimate: a new uploaded draft
//   POST /staff/estimate-versions/:versionId/documents/original        the PDF or Word original (raw bytes)
//   POST /staff/estimate-versions/:versionId/documents/customer-pdf    the PDF of a Word original (raw bytes)
//   GET  /staff/estimate-versions/:versionId/documents/:documentId     one processed document (proxied download)
//   PUT  /staff/estimate-versions/:versionId/agreement                 the agree-confirmation, given or withdrawn
//   GET  /staff/estimate-versions/:versionId/customer-pdf              the generated customer PDF of the version
// - Every route needs estimate.draft (Owner, Estimator) on the version's project, decided on the server. A document is
//   served only through the server, after that check, with its SHA-256 checked again (storage keys are never shown).
// - The structured amounts are saved with the builder's draft route (routes.ts): an uploaded version is priced by the
//   same server code as a written one. Publishing is TSK-0055; it refuses an uploaded version without its ready
//   documents and the agree-confirmation (readiness.ts, and the database guard of migration 0030).
import { createHash } from 'node:crypto'
import type { Tx } from '@handyhub/db'
import { ApiError } from '../../api/errors.js'
import type { ApiContext, RouteDef } from '../../api/route.js'
import { currentContext } from '../../platform/request-context.js'
import type { ObjectStorage } from '../../providers/index.js'
import { syncEstimateItem } from '../queue/index.js'
import { UPLOAD_TRANSPORT_LIMIT_BYTES } from '../photos/index.js'
import { customerPdfInput, renderCustomerPdf } from './customer-pdf.js'
import { DOCX_TYPE, PDF_TYPE } from './document-content.js'
import {
  DocumentError,
  DocumentIntegrityError,
  readEstimateDocument,
  setAgreement,
  uploadEstimateDocument,
  type DocumentRole,
} from './documents.js'
import { createEstimate } from './model.js'
import { builderView, projectOf, staffActor, versionProjectOf } from './routes.js'
import {
  AGREEMENT_BODY,
  CREATE_RESULT,
  DOCUMENT_PARAMS,
  FILE,
  PROJECT_PARAMS,
  VERSION_PARAMS,
  VERSION_VIEW,
} from './schemas.js'

const TEST = 'test/integration/estimate-documents.test.ts'

export type EstimateDocumentDeps = {
  /** The private object storage (R2, or the fake in local and ci); null while NOT CONFIGURED. */
  storage: ObjectStorage | null
  /** Outside production every customer document carries the TEST mark (OWN-DEC-126). */
  testMark: boolean
}

function uploadError(err: unknown): never {
  if (err instanceof DocumentIntegrityError) throw new ApiError('INTERNAL')
  if (!(err instanceof DocumentError)) throw err
  if (err.problem === 'not_configured' || err.problem === 'storage_not_configured') throw new ApiError('UNAVAILABLE')
  if (err.problem === 'too_large') throw new ApiError('PAYLOAD_TOO_LARGE')
  if (err.problem === 'type_not_allowed' || err.problem === 'unsupported_type')
    throw new ApiError('UNSUPPORTED_MEDIA_TYPE')
  throw new ApiError('VALIDATION_FAILED', { fieldErrors: [{ field: 'body', code: err.problem, message: '' }] })
}

const common = {
  actors: ['staff'],
  permission: 'estimate.draft',
  rateLimit: 'none',
  pagination: false,
  test: TEST,
} as const

export function estimateDocumentRoutes(deps: EstimateDocumentDeps): RouteDef[] {
  const start: RouteDef = {
    ...common,
    method: 'POST',
    path: '/staff/projects/:projectId/uploaded-estimates',
    operationId: 'uploadEstimate',
    summary: 'Upload an Estimate',
    description:
      'Staff with estimate.draft, on an open project. Creates estimate <project reference>-E<n> with its first draft ' +
      'version, authored by upload (HH-EST-11): the PDF or Word document is uploaded next, and the total, options, ' +
      'deposit and validity are the structured amounts saved with the draft. No amount is read from a document; no ' +
      'message is sent.',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'none',
    audit: 'estimate.create',
    resource: projectOf,
    schema: {
      params: PROJECT_PARAMS,
      body: { type: 'object', additionalProperties: false, properties: {} },
      response: { 201: CREATE_RESULT },
    },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const { projectId } = ctx.req.params as { projectId: string }
      const created = await createEstimate(tx, staffActor(ctx), { projectId, authoringMethod: 'uploaded' })
      const requests = await tx.selectFrom('intake.requests').select('id').where('project_id', '=', projectId).execute()
      for (const r of requests) await syncEstimateItem(tx, r.id)
      await ctx.audit({
        target: { type: 'estimate_version', id: created.versionId, version: 1 },
        summary: {
          estimateId: created.estimateId,
          number: created.number,
          projectId,
          version: created.version,
          authoringMethod: 'uploaded',
        },
      })
      return { status: 201, body: { ...created, rowVersion: 1 }, version: 1 }
    },
  }

  const upload = (role: DocumentRole): RouteDef => ({
    ...common,
    method: 'POST',
    path: `/staff/estimate-versions/:versionId/documents/${role === 'original' ? 'original' : 'customer-pdf'}`,
    operationId: role === 'original' ? 'uploadEstimateOriginal' : 'uploadEstimateCustomerPdf',
    summary: role === 'original' ? 'Upload the estimate document' : 'Upload the PDF of a Word estimate',
    description:
      (role === 'original'
        ? 'Raw PDF or Word (.docx) bytes, the estimate as staff wrote it, for an uploaded draft or in-review version. ' +
          'The original is kept private and unchanged (its SHA-256 is recorded); for a PDF the server stores a copy ' +
          'of the same bytes as the customer PDF, and a Word original needs the PDF of the same document (no ' +
          'faithful converter runs in this deployment: "PDF required"). It replaces the current documents, which are kept. '
        : 'Raw PDF bytes: the customer PDF of the current Word original, which no converter in this deployment can ' +
          'produce faithfully. Refused while the original is a PDF (its copy is made by the server). ') +
      'The server checks the real content, the declared type and the per-file size of uploads.limits, stores the ' +
      'file once in the private bucket and quarantines it until processing passes it. Clears the agree-confirmation. ' +
      'The same bytes again return the current document unchanged; any other upload needs If-Match. Problems: 413 ' +
      'too large, 415 not an allowed type, 400 with a field error (type_mismatch, malformed, trailing_data, ' +
      'encrypted, active_content, empty), 409 not an uploaded version or not editable. Returns the builder view.',
    kind: 'write',
    idempotency: 'none',
    expectedVersion: 'required',
    audit: 'estimate.upload_document',
    binaryBody: {
      contentTypes: role === 'original' ? [PDF_TYPE, DOCX_TYPE] : [PDF_TYPE],
      maxBytes: UPLOAD_TRANSPORT_LIMIT_BYTES,
    },
    resource: versionProjectOf,
    schema: { params: VERSION_PARAMS, response: { 201: VERSION_VIEW, 200: VERSION_VIEW } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staffActor(ctx)
      const { versionId } = ctx.req.params as { versionId: string }
      const bytes = Buffer.isBuffer(ctx.req.body) ? ctx.req.body : Buffer.alloc(0)
      let out: Awaited<ReturnType<typeof uploadEstimateDocument>>
      try {
        out = await uploadEstimateDocument(tx, actor, {
          versionId,
          role,
          bytes,
          declaredType: String(ctx.req.headers['content-type'] ?? ''),
          storage: deps.storage,
          expectedRowVersion: () => ctx.expectedVersion(),
          requestId: currentContext()?.requestId ?? ctx.req.id,
        })
      } catch (err) {
        uploadError(err)
      }
      await ctx.audit({
        target: { type: 'estimate_version', id: versionId, version: out.rowVersion },
        summary: {
          documentId: out.document.id,
          role,
          contentType: out.document.contentType,
          byteSize: out.document.byteSize,
          sha256: out.document.sha256,
          created: out.created,
        },
      })
      const view = await builderView(tx, actor, versionId)
      return { status: out.created ? 201 : 200, body: view, version: view.rowVersion }
    },
  })

  const file: RouteDef = {
    ...common,
    method: 'GET',
    path: '/staff/estimate-versions/:versionId/documents/:documentId',
    operationId: 'getEstimateDocument',
    summary: 'An estimate document',
    description:
      'Staff with estimate.draft. The bytes of one processed document of the version (the private original or the ' +
      'customer PDF, also a replaced one that had passed processing), checked against the SHA-256 recorded at upload. ' +
      'A PDF opens inline; a Word document downloads. Quarantined and rejected documents are never served.',
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    audit: 'none',
    resource: versionProjectOf,
    binaryResponse: { contentTypes: [PDF_TYPE, DOCX_TYPE] },
    schema: { params: DOCUMENT_PARAMS, response: { 200: FILE } },
    handler: async (ctx) => {
      const { versionId, documentId } = ctx.req.params as { versionId: string; documentId: string }
      let doc: Awaited<ReturnType<typeof readEstimateDocument>>
      try {
        doc = await readEstimateDocument(ctx.db, { versionId, documentId, storage: deps.storage })
      } catch (err) {
        uploadError(err)
      }
      if (!doc) throw new ApiError('NOT_FOUND')
      const pdf = doc.contentType === PDF_TYPE
      return {
        body: Buffer.from(doc.bytes),
        headers: {
          'content-type': doc.contentType,
          'content-disposition': `${pdf ? 'inline' : 'attachment'}; filename="estimate-${doc.role === 'original' ? 'original' : 'customer'}.${pdf ? 'pdf' : 'docx'}"`,
          'x-content-sha256': doc.sha256,
        },
      }
    },
  }

  const agreement: RouteDef = {
    ...common,
    method: 'PUT',
    path: '/staff/estimate-versions/:versionId/agreement',
    operationId: 'confirmEstimateAgreement',
    summary: 'Confirm that the document and the amounts agree',
    description:
      'Staff with estimate.draft, on an uploaded draft or in-review version, with If-Match. confirmed: true records ' +
      'that the staff member checked that the document and the structured amounts (lines, total, deposit and ' +
      'validity) agree, for the current customer PDF; it needs both documents processed and ready and the totals ' +
      'computed. confirmed: false withdraws it. Saving the draft or uploading a document clears it; publishing an ' +
      'uploaded version without it is refused. Returns the builder view.',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'required',
    audit: 'estimate.confirm_agreement',
    resource: versionProjectOf,
    schema: { params: VERSION_PARAMS, body: AGREEMENT_BODY, response: { 200: VERSION_VIEW } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staffActor(ctx)
      const { versionId } = ctx.req.params as { versionId: string }
      const { confirmed } = ctx.req.body as { confirmed: boolean }
      const out = await setAgreement(tx, actor, versionId, confirmed, ctx.expectedVersion())
      const view = await builderView(tx, actor, versionId)
      await ctx.audit({
        target: { type: 'estimate_version', id: versionId, version: out.rowVersion },
        summary: { confirmed, documentId: view.documents?.agreement?.documentId ?? null },
      })
      return { body: view, version: out.rowVersion }
    },
  }

  const customerPdf: RouteDef = {
    ...common,
    method: 'GET',
    path: '/staff/estimate-versions/:versionId/customer-pdf',
    operationId: 'getCustomerEstimatePdf',
    summary: 'The customer PDF of an estimate version',
    description:
      'Staff with estimate.draft. The English customer PDF of the version, generated on the server from its stored ' +
      'customer-facing content and the active configuration only (no internal cost or note; anything NOT CONFIGURED ' +
      'is shown as not provided; outside production every page is marked TEST). Written and uploaded versions use the ' +
      'same renderer; an uploaded version names the SHA-256 of its customer document. A version still being edited ' +
      'is labelled a draft preview. Deterministic: the same stored data gives the same bytes. A published version ' +
      '(TSK-0055) answers the PDF stored when it was published, checked against its SHA-256 (x-content-sha256).',
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    audit: 'none',
    resource: versionProjectOf,
    binaryResponse: { contentTypes: [PDF_TYPE] },
    schema: { params: VERSION_PARAMS, response: { 200: FILE } },
    handler: async (ctx: ApiContext) => {
      const { versionId } = ctx.req.params as { versionId: string }
      const stored = await ctx.db
        .selectFrom('estimating.estimate_versions as v')
        .innerJoin('estimating.estimates as e', 'e.id', 'v.estimate_id')
        .select(['v.version', 'v.customer_pdf_object_key', 'v.customer_pdf_sha256', 'e.number'])
        .where('v.id', '=', versionId)
        .executeTakeFirst()
      if (!stored) throw new ApiError('NOT_FOUND')
      if (stored.customer_pdf_object_key && stored.customer_pdf_sha256) {
        // The PDF as published, never a re-render: configuration that changed later does not change it.
        if (!deps.storage) throw new ApiError('UNAVAILABLE')
        const { bytes } = await deps.storage.get(stored.customer_pdf_object_key)
        if (createHash('sha256').update(bytes).digest('hex') !== stored.customer_pdf_sha256)
          throw new ApiError('INTERNAL')
        return {
          body: Buffer.from(bytes),
          headers: {
            'content-type': PDF_TYPE,
            'content-disposition': `inline; filename="${stored.number}-v${stored.version}.pdf"`,
            'x-content-sha256': stored.customer_pdf_sha256,
          },
        }
      }
      const input = await customerPdfInput(ctx.db, versionId, { testMark: deps.testMark })
      if (!input) throw new ApiError('NOT_FOUND')
      return {
        body: await renderCustomerPdf(input),
        headers: {
          'content-type': PDF_TYPE,
          'content-disposition': `inline; filename="${input.content.estimateNumber}-v${input.content.version}.pdf"`,
        },
      }
    },
  }

  return [start, upload('original'), upload('customer_pdf'), file, agreement, customerPdf]
}
