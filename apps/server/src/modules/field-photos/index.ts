// Field photos module (TSK-0076; HH-QA-05, HH-PORT-11, HH-PRIV-02, HH-DATA-07, HH-STAFF-05, HH-SEC-05, T24, T57,
// T68, ENT-Photo, ENT-ConsentPreference, ENT-AuditEvent, OWN-DEC-106, OWN-DEC-109, RULE-SERVER-AUTHZ).
//   GET  /staff/jobs/:jobId/photos                               a job's field photos (job.view_packet)
//   POST /staff/visits/:visitId/field-photos                     one before or after photo (job.add_photo)
//   POST /staff/field-photos/:photoId/actions/share              share with the customer (media.share_with_customer)
//   POST /staff/field-photos/:photoId/actions/stop-sharing       stop sharing it (media.share_with_customer, PROPOSED)
//   POST /staff/field-photos/:photoId/publication-permissions    the customer's evidenced publication permission, or
//                                                                its withdrawal (media.mark_marketing_eligible)
//   GET  /customer/projects/:reference/photos/:photoId           one photo the customer may see: a fresh short link
// Documentation, customer sharing and marketing publication are three separate permissions (HH-PRIV-02): uploading
// documents (internal), sharing makes a photo visible to the customer of its project only, and only a recorded
// publication permission makes it marketing-eligible. Every write is audited; evidence references stay on their
// record, never in the audit summary.
import type { Tx } from '@handyhub/db'
import { decide, type StaffActor } from '@handyhub/policy'
import { ApiError } from '../../api/errors.js'
import type { ApiContext, ApiModule, RouteDef } from '../../api/route.js'
import { currentContext } from '../../platform/request-context.js'
import type { ObjectStorage } from '../../providers/index.js'
import { projectIdOf } from '../access/projects.js'
import { visitAssignments } from '../field/taps.js'
import { jobAssignments } from '../packets/assignments.js'
import { PHOTO_TYPES } from '../photos/content.js'
import { UPLOAD_TRANSPORT_LIMIT_BYTES } from '../photos/index.js'
import { PHOTO_LINK } from '../records/index.js'
import { BeforePhotoError, uploadFieldPhoto } from '../start/actions.js'
import {
  changeSharing,
  customerPhotoLink,
  jobFieldPhotos,
  PUBLICATION_CHANNELS,
  PUBLICATION_EVIDENCE,
  PUBLICATION_PURPOSES,
  publicationNotice,
  recordPublication,
  uploadVisits,
  type PublicationInput,
} from './photos.js'

export * from './photos.js'

const TEST = 'test/integration/field-photos.test.ts'
const UUID_PATTERN = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
const UUID_RE = new RegExp(UUID_PATTERN)
const UUID = { type: 'string', pattern: UUID_PATTERN } as const
const STR = { type: 'string' } as const
const STR_OR_NULL = { type: ['string', 'null'] } as const
const INT = { type: 'integer' } as const
const BOOL = { type: 'boolean' } as const
const TIME = { type: 'string', format: 'date-time' } as const
const TIME_OR_NULL = { type: ['string', 'null'], format: 'date-time' } as const
const TEXT = (max: number) => ({ type: 'string', minLength: 1, maxLength: max, pattern: '\\S' }) as const
const en = (values: readonly string[]) => ({ type: 'string', enum: [...values] }) as const
const obj = (properties: Record<string, unknown>) =>
  ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties }) as const
const input = (properties: Record<string, unknown>, optional: readonly string[] = []) =>
  ({
    type: 'object',
    additionalProperties: false,
    required: Object.keys(properties).filter((k) => !optional.includes(k)),
    properties,
  }) as const
const arr = (items: unknown) => ({ type: 'array', items }) as const

const PHOTO_PARAMS = obj({ photoId: UUID })
const PUBLICATION = obj({
  channel: en(PUBLICATION_CHANNELS),
  granted: BOOL,
  noticeVersion: STR_OR_NULL,
  recordedAt: TIME,
})
const STAFF_PHOTO = obj({
  id: STR,
  workPackageId: STR,
  visitId: STR,
  visitNumber: INT,
  phase: en(['before', 'after']),
  areaLabel: STR_OR_NULL,
  pairOf: STR_OR_NULL,
  state: en(['quarantined', 'ready', 'rejected']),
  rejectionReason: STR_OR_NULL,
  visibility: en(['internal_operational', 'restricted_incident', 'restricted_financial', 'customer_shared']),
  version: INT,
  uploadedAt: TIME,
  uploadedBy: obj({ id: STR, name: STR_OR_NULL }),
  sharedAt: TIME_OR_NULL,
  url: STR_OR_NULL,
  publication: arr(PUBLICATION),
  actions: obj({ share: BOOL, stopSharing: BOOL, recordPublication: BOOL }),
})
const JOB_PHOTOS = obj({
  jobId: STR,
  projectReference: STR,
  workPackages: arr(obj({ workPackageId: STR, serviceCode: STR })),
  photos: arr(STAFF_PHOTO),
  uploadVisits: arr(obj({ visitId: STR, visitNumber: INT, after: BOOL })),
  publicationNotice: STR_OR_NULL,
})
const UPLOAD_QUERY = input(
  {
    workPackageId: UUID,
    phase: en(['before', 'after']),
    areaLabel: TEXT(120),
    pairOf: UUID,
    deviceCapturedAt: TIME,
  },
  ['areaLabel', 'pairOf', 'deviceCapturedAt'],
)
const UPLOAD_RESULT = obj({
  photoId: STR,
  workPackageId: STR,
  phase: en(['before', 'after']),
  uploadedAt: TIME,
  created: BOOL,
})
const SHARE_RESULT = obj({ photoId: STR, shared: BOOL, version: INT })
const PUBLICATION_BODY = {
  oneOf: [
    input({
      purpose: en(PUBLICATION_PURPOSES),
      channel: en(PUBLICATION_CHANNELS),
      granted: { const: true },
      noticeVersion: { type: 'string', pattern: '^[a-z][a-z0-9-]{0,38}[0-9]$' },
      evidenceKind: en(PUBLICATION_EVIDENCE),
      evidenceReference: TEXT(300),
    }),
    input({
      purpose: en(PUBLICATION_PURPOSES),
      channel: en(PUBLICATION_CHANNELS),
      granted: { const: false },
      evidenceKind: en(PUBLICATION_EVIDENCE),
      evidenceReference: TEXT(300),
    }),
  ],
} as const
const PUBLICATION_RESULT = obj({
  photoId: STR,
  channel: en(PUBLICATION_CHANNELS),
  granted: BOOL,
  marketingEligible: BOOL,
  recordedAt: TIME,
})

function staff(ctx: ApiContext): StaffActor {
  if (ctx.actor.kind !== 'staff') throw new ApiError('FORBIDDEN')
  return ctx.actor
}
const requestIdOf = (ctx: ApiContext) => currentContext()?.requestId ?? ctx.req.id
const allowed = (actor: StaffActor, action: Parameters<typeof decide>[1], resource: Parameters<typeof decide>[2]) =>
  decide(actor, action, resource, { now: new Date(), online: true }).effect === 'allow'

const jobFacts: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { jobId } = req.params as { jobId: string }
  if (!UUID_RE.test(jobId)) return null
  const j = await db.selectFrom('work.jobs').select('project_id').where('id', '=', jobId).executeTakeFirst()
  return j ? { projectId: j.project_id, assignments: await jobAssignments(db, jobId) } : null
}
const visitFacts: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { visitId } = req.params as { visitId: string }
  if (!UUID_RE.test(visitId)) return null
  const v = await db.selectFrom('work.visits').select('project_id').where('id', '=', visitId).executeTakeFirst()
  return v ? { projectId: v.project_id, assignments: await visitAssignments(db, visitId) } : null
}
const photoFacts: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { photoId } = req.params as { photoId: string }
  if (!UUID_RE.test(photoId)) return null
  const p = await db.selectFrom('work.field_photos').select('project_id').where('id', '=', photoId).executeTakeFirst()
  return p ? { projectId: p.project_id } : null
}

function uploadError(err: unknown): never {
  if (!(err instanceof BeforePhotoError)) throw err
  if (err.problem === 'not_configured') throw new ApiError('UNAVAILABLE')
  if (err.problem === 'too_large') throw new ApiError('PAYLOAD_TOO_LARGE')
  if (err.problem === 'type_not_allowed' || err.problem === 'unsupported_type')
    throw new ApiError('UNSUPPORTED_MEDIA_TYPE')
  const where =
    err.problem === 'unknown_work_package'
      ? 'querystring.workPackageId'
      : err.problem === 'unknown_pair' || err.problem === 'pair_after_only'
        ? 'querystring.pairOf'
        : 'body'
  throw new ApiError('VALIDATION_FAILED', { fieldErrors: [{ field: where, code: err.problem, message: '' }] })
}

export function fieldPhotosModule(deps: { storage: ObjectStorage | null }): ApiModule {
  const list: RouteDef = {
    method: 'GET',
    path: '/staff/jobs/:jobId/photos',
    operationId: 'listJobFieldPhotos',
    summary: 'The field photos of a job',
    description:
      'Staff who view the job packet (job.view_packet: Owner, Office, the assigned Worker inside the access window). ' +
      'Every before and after photo of the job by work package, with its visit, area label, pair, processing state ' +
      '(quarantined, ready, rejected), visibility class, who uploaded it and when, and for a ready one a signed URL ' +
      'valid for minutes. A restricted photo is listed only for a role that reads its class. Per photo: the ' +
      'current publication permission per channel and the actions the caller may take (share, stop sharing: ' +
      'media.share_with_customer; record a publication permission: media.mark_marketing_eligible). Also the visits ' +
      'where the caller may upload now (assigned and arrived; after photos once their own work start is recorded) ' +
      'and the configured publication notice version (null while NOT CONFIGURED). An Estimator reads estimating ' +
      'scope only: FORBIDDEN here.',
    actors: ['staff'],
    permission: 'job.view_packet',
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'none',
    pagination: false,
    test: TEST,
    resource: jobFacts,
    schema: { params: obj({ jobId: UUID }), response: { 200: JOB_PHOTOS } },
    handler: async (ctx) => {
      const actor = staff(ctx)
      if (ctx.decision?.limit === 'estimating_scope') throw new ApiError('FORBIDDEN')
      const { jobId } = ctx.req.params as { jobId: string }
      const view = await jobFieldPhotos(ctx.db, ctx.scope, actor, jobId, deps.storage)
      if (!view) throw new ApiError('NOT_FOUND')
      const resource = { projectId: view.projectId }
      const share = allowed(actor, 'media.share_with_customer', resource)
      const publish = allowed(actor, 'media.mark_marketing_eligible', resource)
      return {
        body: {
          jobId: view.jobId,
          projectReference: view.projectReference,
          workPackages: view.workPackages,
          photos: view.photos.map((p) => ({
            ...p,
            uploadedAt: p.uploadedAt.toISOString(),
            sharedAt: p.sharedAt ? p.sharedAt.toISOString() : null,
            publication: p.publication.map((x) => ({ ...x, recordedAt: x.recordedAt.toISOString() })),
            actions: {
              share: share && p.state === 'ready' && p.visibility === 'internal_operational',
              stopSharing: share && p.visibility === 'customer_shared',
              recordPublication:
                publish &&
                p.state === 'ready' &&
                (p.visibility === 'internal_operational' || p.visibility === 'customer_shared'),
            },
          })),
          uploadVisits: allowed(actor, 'job.add_photo', {
            projectId: view.projectId,
            assignments: await jobAssignments(ctx.db, jobId),
          })
            ? await uploadVisits(ctx.db, jobId, actor.userId)
            : [],
          publicationNotice: await publicationNotice(ctx.db),
        },
        headers: { 'cache-control': 'no-store' },
      }
    },
  }

  const upload: RouteDef = {
    method: 'POST',
    path: '/staff/visits/:visitId/field-photos',
    operationId: 'uploadFieldPhoto',
    summary: 'Upload one before or after photo of a work package',
    description:
      'Staff with job.add_photo, assigned to this arrived visit. Raw JPEG, PNG or WebP bytes for the work package and ' +
      'phase in the query, with an optional area label (staff only, never shown to the customer) and, for an after ' +
      'photo, an optional before photo of the same work package it pairs with. Checked like request photos (the real ' +
      'content, the declared type and the size against uploads.limits; NOT CONFIGURED limits or storage answer ' +
      'UNAVAILABLE), stored once under an opaque key in the private bucket, quarantined until processing checks the ' +
      'stored original again, internal until Owner or Office share it. An after photo needs the uploader’s own work ' +
      'start on the visit (409 START_WORK_FIRST). The same bytes again for the same package and phase answer the ' +
      'same photo (200).',
    actors: ['staff'],
    permission: 'job.add_photo',
    kind: 'write',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: { bucket: 'field-photo-upload', limit: 120, windowSeconds: 3600 },
    audit: 'work.field_photo',
    pagination: false,
    test: TEST,
    resource: visitFacts,
    binaryBody: { contentTypes: PHOTO_TYPES, maxBytes: UPLOAD_TRANSPORT_LIMIT_BYTES },
    schema: {
      params: obj({ visitId: UUID }),
      querystring: UPLOAD_QUERY,
      response: { 201: UPLOAD_RESULT, 200: UPLOAD_RESULT },
    },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staff(ctx)
      const { visitId } = ctx.req.params as { visitId: string }
      const q = ctx.req.query as {
        workPackageId: string
        phase: 'before' | 'after'
        areaLabel?: string
        pairOf?: string
        deviceCapturedAt?: string
      }
      const bytes = Buffer.isBuffer(ctx.req.body) ? ctx.req.body : Buffer.alloc(0)
      let out: Awaited<ReturnType<typeof uploadFieldPhoto>>
      try {
        out = await uploadFieldPhoto(tx, actor, visitId, {
          phase: q.phase,
          workPackageId: q.workPackageId,
          bytes,
          declaredType: String(ctx.req.headers['content-type'] ?? ''),
          storage: deps.storage,
          requestId: requestIdOf(ctx),
          deviceCapturedAt: q.deviceCapturedAt,
          areaLabel: q.areaLabel,
          pairOf: q.pairOf,
        })
      } catch (err) {
        uploadError(err)
      }
      await ctx.audit({
        target: { type: 'field_photo', id: out.id },
        summary: {
          projectId: out.visit.projectId,
          visitId,
          workPackageId: q.workPackageId,
          phase: q.phase,
          paired: Boolean(q.pairOf),
          created: out.created,
        },
      })
      return {
        status: out.created ? 201 : 200,
        body: {
          photoId: out.id,
          workPackageId: q.workPackageId,
          phase: q.phase,
          uploadedAt: out.uploadedAt.toISOString(),
          created: out.created,
        },
      }
    },
  }

  const sharing = (to: 'share' | 'stop'): RouteDef => ({
    method: 'POST',
    path: `/staff/field-photos/:photoId/actions/${to === 'share' ? 'share' : 'stop-sharing'}`,
    operationId: to === 'share' ? 'shareFieldPhoto' : 'stopSharingFieldPhoto',
    summary: to === 'share' ? 'Share a field photo with the customer' : 'Stop sharing a field photo with the customer',
    description:
      to === 'share'
        ? 'Owner or Office (media.share_with_customer), with the version they saw. Makes one ready, internal field ' +
          'photo visible to the customer of its project in the Photos tab (HH-QA-05, HH-DATA-07); a quarantined, ' +
          'rejected or restricted photo is refused (409). Sharing never grants marketing or publication use ' +
          '(HH-PRIV-02). Audited with who and when.'
        : 'Owner or Office (media.share_with_customer), with the version they saw (PROPOSED). Makes a shared field ' +
          'photo internal again: the customer no longer reaches it by the tab, its ID or a new link (a link already ' +
          'issued expires within minutes). Audited with who and when.',
    actors: ['staff'],
    permission: 'media.share_with_customer',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'required',
    rateLimit: 'none',
    audit: to === 'share' ? 'media.share_with_customer' : 'media.stop_sharing',
    pagination: false,
    test: TEST,
    resource: photoFacts,
    schema: { params: PHOTO_PARAMS, body: input({}), response: { 200: SHARE_RESULT } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staff(ctx)
      const { photoId } = ctx.req.params as { photoId: string }
      const out = await changeSharing(tx, actor, photoId, ctx.expectedVersion(), to)
      await ctx.audit({
        target: { type: 'field_photo', id: photoId, version: out.version },
        summary: { projectId: out.project_id, jobId: out.job_id, from: out.from, to: out.visibility },
      })
      return {
        body: { photoId, shared: out.visibility === 'customer_shared', version: out.version },
        version: out.version,
      }
    },
  })

  const publication: RouteDef = {
    method: 'POST',
    path: '/staff/field-photos/:photoId/publication-permissions',
    operationId: 'recordPhotoPublication',
    summary: 'Record a customer’s permission to publish a field photo, or its withdrawal',
    description:
      'The Owner (media.mark_marketing_eligible: marketing use needs recorded consent). Records, for one ready field ' +
      'photo, the evidenced permission of the customer of its project to publish it for the purpose and channel ' +
      '(PROPOSED: marketing on the website), under the configured publication notice version (media.publication_' +
      'notice; NOT CONFIGURED: 503 NOT_CONFIGURED, nothing recorded; another version: 400), with how the customer ' +
      'gave it and a staff reference to the evidence. granted false records the customer’s withdrawal: new use ' +
      'stops at once. Append-only: the latest record per photo, purpose and channel is current. Sharing with the ' +
      'customer never creates one, and this never shares the photo. A restricted or unready photo: 409.',
    actors: ['staff'],
    permission: 'media.mark_marketing_eligible',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'media.publication_permission',
    pagination: false,
    test: TEST,
    resource: photoFacts,
    schema: { params: PHOTO_PARAMS, body: PUBLICATION_BODY, response: { 201: PUBLICATION_RESULT } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staff(ctx)
      const { photoId } = ctx.req.params as { photoId: string }
      const body = ctx.req.body as PublicationInput
      const out = await recordPublication(tx, actor, photoId, body)
      await ctx.audit({
        target: { type: 'field_photo', id: photoId },
        summary: {
          projectId: out.projectId,
          jobId: out.jobId,
          permissionId: out.id,
          purpose: body.purpose,
          channel: body.channel,
          granted: body.granted,
          noticeVersion: body.granted ? (body.noticeVersion ?? null) : null,
          evidenceKind: body.evidenceKind,
        },
      })
      return {
        status: 201,
        body: {
          photoId,
          channel: body.channel,
          granted: body.granted,
          marketingEligible: body.granted,
          recordedAt: out.recordedAt.toISOString(),
        },
      }
    },
  }

  const customerLink: RouteDef = {
    method: 'GET',
    path: '/customer/projects/:reference/photos/:photoId',
    operationId: 'getCustomerProjectPhoto',
    summary: 'Open one photo of the project',
    description:
      'The customer of a project the session opens (request.view, ROLE-MATRIX "V (own)"; TSK-0037 scope). One photo ' +
      'the customer may see, by its ID: their own ready upload or a ready before or after photo staff shared with ' +
      'them; a fresh signed URL valid for expiresInSeconds. An internal or restricted photo, another project’s ' +
      'photo, an unknown or malformed ID or reference all answer the same NOT_FOUND, exactly like a missing record ' +
      '(HH-PORT-11, OWN-DEC-106, T57). Never cached.',
    actors: ['customer'],
    permission: 'request.view',
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'none',
    pagination: false,
    test: TEST,
    resource: async ({ req, db }) => {
      const id = await projectIdOf(db, (req.params as { reference: string }).reference)
      return id ? { projectId: id } : null
    },
    projection: PHOTO_LINK,
    schema: {
      params: obj({
        reference: { type: 'string', minLength: 1, maxLength: 40 },
        photoId: { type: 'string', maxLength: 64 },
      }),
      response: { 200: PHOTO_LINK.schema },
    },
    handler: async (ctx) => {
      const { reference, photoId } = ctx.req.params as { reference: string; photoId: string }
      const link = await customerPhotoLink(ctx.db, ctx.scope, reference, photoId, deps.storage)
      if (!link) throw new ApiError('NOT_FOUND')
      return { body: PHOTO_LINK.project(link), headers: { 'cache-control': 'no-store' } }
    },
  }

  return { name: 'field-photos', routes: [list, upload, sharing('share'), sharing('stop'), publication, customerLink] }
}
