// Photos module (TSK-0031; HH-INT-04..07, HH-SEC-05, T13, T14, T15): the request wizard's draft uploads and the
// authorized reads of request photos.
//   POST   /public/request-drafts                  a new upload capability for one draft (token returned once)
//   POST   /public/request-drafts/photos           one photo (raw bytes) under the capability in Upload-Capability
//   GET    /public/request-drafts/photos           the capability's own photos and their states
//   DELETE /public/request-drafts/photos/:photoId  removes one of its own photos before submission
//   GET    /requests/:requestId/photos             staff, or the customer of the project: photos with signed URLs
// Every capability route answers NOT_FOUND for an unknown, expired or used capability and for another scope's photo,
// exactly like a missing record; there is no listing of storage objects.
import { ApiError } from '../../api/errors.js'
import type { ApiContext, ApiModule, RouteDef } from '../../api/route.js'
import { loadConfig } from '../../platform/config/index.js'
import { currentContext } from '../../platform/request-context.js'
import type { ObjectStorage } from '../../providers/index.js'
import { PHOTO_TYPES } from './content.js'
import {
  CAPABILITY_HEADER,
  createCapability,
  listPhotos,
  PhotoError,
  photoLimits,
  photoUrl,
  removePhoto,
  resolveCapability,
  uploadPhoto,
  type Capability,
} from './photos.js'

export * from './content.js'
export * from './photos.js'

/**
 * Transport ceiling for one upload body: a technical bound above any configured photo size, so the configured limit
 * (uploads.limits.maxFileBytes, 15 MiB) is what decides; it is not a business value. PROPOSED 32 MiB.
 */
export const UPLOAD_TRANSPORT_LIMIT_BYTES = 32 * 1024 * 1024
/** PROPOSED (no owner value): 20 drafts and 60 photo uploads per client network per hour. */
export const DRAFT_RATE_LIMIT = { bucket: 'public-request-draft', limit: 20, windowSeconds: 3600 } as const
export const UPLOAD_RATE_LIMIT = { bucket: 'public-photo-upload', limit: 60, windowSeconds: 3600 } as const

const PHOTO_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'state', 'contentType', 'byteSize', 'rejectionReason'],
  properties: {
    id: { type: 'string' },
    state: { type: 'string', enum: ['quarantined', 'ready', 'rejected'] },
    contentType: { type: 'string' },
    byteSize: { type: 'integer' },
    rejectionReason: { type: ['string', 'null'] },
  },
} as const
const LIMITS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['maxFileBytes', 'maxPhotos', 'types'],
  properties: {
    maxFileBytes: { type: 'integer' },
    maxPhotos: { type: 'integer' },
    types: { type: 'array', items: { type: 'string' } },
  },
} as const
const PHOTO_ID = { type: 'string', pattern: '^[0-9a-f-]{36}$' } as const

declare module 'fastify' {
  interface FastifyRequest {
    uploadCapability?: Capability
  }
}

/** The capability of the request, resolved for the policy step; null answers NOT_FOUND. */
async function capabilityResource(ctx: Pick<ApiContext, 'req' | 'db'>) {
  const cap = await resolveCapability(ctx.db, ctx.req.headers[CAPABILITY_HEADER])
  if (!cap) return null
  ctx.req.uploadCapability = cap
  return {}
}
const capOf = (ctx: ApiContext): Capability => {
  const cap = ctx.req.uploadCapability
  if (!cap) throw new ApiError('NOT_FOUND')
  return cap
}

function uploadError(err: unknown): never {
  if (!(err instanceof PhotoError)) throw err
  if (err.problem === 'not_configured' || err.problem === 'storage_not_configured') throw new ApiError('UNAVAILABLE')
  if (err.problem === 'too_large') throw new ApiError('PAYLOAD_TOO_LARGE')
  if (err.problem === 'type_not_allowed' || err.problem === 'unsupported_type')
    throw new ApiError('UNSUPPORTED_MEDIA_TYPE')
  throw new ApiError('VALIDATION_FAILED', { fieldErrors: [{ field: 'body', code: err.problem, message: '' }] })
}

const common = {
  actors: ['guest', 'customer'],
  // Adding photos is part of submitting a request (ROLE-MATRIX "Submit a request": Guest and Customer Y).
  permission: 'request.submit',
  expectedVersion: 'none',
  pagination: false,
  test: 'test/integration/photos.test.ts',
} as const

export function photosModule(deps: { storage: ObjectStorage | null }): ApiModule {
  const createDraft: RouteDef = {
    ...common,
    method: 'POST',
    path: '/public/request-drafts',
    operationId: 'createRequestDraft',
    summary: 'Start a photo upload draft',
    description:
      'Creates an upload capability scoped to one new draft, valid for the configured request-draft period ' +
      '(session.timings.requestDraftDays). The token is returned once; the server keeps only its hash. Also returns ' +
      'the configured photo limits (uploads.limits). It reaches no customer record, other draft or object list.',
    kind: 'write',
    idempotency: 'none',
    rateLimit: DRAFT_RATE_LIMIT,
    audit: 'request_draft.create',
    schema: {
      response: {
        201: {
          type: 'object',
          additionalProperties: false,
          required: ['capability', 'expiresAt', 'limits'],
          properties: { capability: { type: 'string' }, expiresAt: { type: 'string' }, limits: LIMITS_SCHEMA },
        },
      },
    },
    handler: async (ctx) => {
      if (!ctx.tx) throw new Error('createRequestDraft runs in its write transaction')
      const limits = photoLimits(await loadConfig(ctx.tx))
      if (!limits || !deps.storage) throw new ApiError('UNAVAILABLE')
      let created: Awaited<ReturnType<typeof createCapability>>
      try {
        created = await createCapability(ctx.tx, { scope: 'draft' })
      } catch (err) {
        uploadError(err)
      }
      await ctx.audit({ target: { type: 'upload_capability', id: created.capability.id } })
      return {
        status: 201,
        body: {
          capability: created.token,
          expiresAt: created.capability.expiresAt.toISOString(),
          limits: { maxFileBytes: limits.maxFileBytes, maxPhotos: limits.maxPhotos, types: [...limits.types] },
        },
      }
    },
  }

  const upload: RouteDef = {
    ...common,
    method: 'POST',
    path: '/public/request-drafts/photos',
    operationId: 'uploadRequestPhoto',
    summary: 'Upload one request photo',
    description:
      'Raw JPEG, PNG or WebP bytes under the Upload-Capability header. The server checks the real content, the ' +
      'declared type, the size and the count against uploads.limits, stores the original once in the private bucket ' +
      'and quarantines it until processing passes it. The same bytes again return the same photo. Problems: 413 too ' +
      'large, 415 not an allowed image, 400 with a field error (type_mismatch, malformed, trailing_data, ' +
      'unsafe_content, too_many, empty).',
    kind: 'write',
    idempotency: 'none',
    rateLimit: UPLOAD_RATE_LIMIT,
    audit: 'photo.upload',
    binaryBody: { contentTypes: PHOTO_TYPES, maxBytes: UPLOAD_TRANSPORT_LIMIT_BYTES },
    resource: capabilityResource,
    schema: { response: { 201: PHOTO_SCHEMA, 200: PHOTO_SCHEMA } },
    handler: async (ctx) => {
      if (!ctx.tx) throw new Error('uploadRequestPhoto runs in its write transaction')
      const bytes = Buffer.isBuffer(ctx.req.body) ? ctx.req.body : Buffer.alloc(0)
      let out: Awaited<ReturnType<typeof uploadPhoto>>
      try {
        out = await uploadPhoto(ctx.tx, {
          cap: capOf(ctx),
          bytes,
          declaredType: String(ctx.req.headers['content-type'] ?? ''),
          storage: deps.storage,
          requestId: currentContext()?.requestId ?? ctx.req.id,
        })
      } catch (err) {
        uploadError(err)
      }
      await ctx.audit({
        target: { type: 'photo', id: out.photo.id },
        summary: { contentType: out.photo.contentType, byteSize: out.photo.byteSize, created: out.created },
      })
      return { status: out.created ? 201 : 200, body: out.photo }
    },
  }

  const list: RouteDef = {
    ...common,
    method: 'GET',
    path: '/public/request-drafts/photos',
    operationId: 'listRequestDraftPhotos',
    summary: 'The photos of an upload draft',
    description: "The capability's own photos with their states (quarantined while processing, ready, rejected).",
    kind: 'read',
    idempotency: 'none',
    rateLimit: 'none',
    audit: 'none',
    resource: capabilityResource,
    schema: {
      response: {
        200: {
          type: 'object',
          additionalProperties: false,
          required: ['photos'],
          properties: { photos: { type: 'array', items: PHOTO_SCHEMA } },
        },
      },
    },
    handler: async (ctx) => ({ body: { photos: await listPhotos(ctx.db, capOf(ctx)) } }),
  }

  const remove: RouteDef = {
    ...common,
    method: 'DELETE',
    path: '/public/request-drafts/photos/:photoId',
    operationId: 'removeRequestDraftPhoto',
    summary: 'Remove a draft photo',
    description: 'Removes one of the capability’s own draft photos before submission. The stored original is kept.',
    kind: 'write',
    idempotency: 'none',
    rateLimit: 'none',
    audit: 'photo.remove',
    resource: capabilityResource,
    schema: {
      params: { type: 'object', additionalProperties: false, required: ['photoId'], properties: { photoId: PHOTO_ID } },
      response: {
        200: {
          type: 'object',
          additionalProperties: false,
          required: ['removed'],
          properties: { removed: { type: 'boolean' } },
        },
      },
    },
    handler: async (ctx) => {
      if (!ctx.tx) throw new Error('removeRequestDraftPhoto runs in its write transaction')
      const { photoId } = ctx.req.params as { photoId: string }
      if (!(await removePhoto(ctx.tx, capOf(ctx), photoId))) throw new ApiError('NOT_FOUND')
      await ctx.audit({ target: { type: 'photo', id: photoId } })
      return { body: { removed: true } }
    },
  }

  const requestPhotos: RouteDef = {
    method: 'GET',
    path: '/requests/:requestId/photos',
    operationId: 'listRequestPhotos',
    summary: 'Photos of a request',
    description:
      'Staff (request.view), or the verified customer of the request’s project. Every photo with its state; ready ' +
      'photos carry a signed URL valid for minutes. Quarantined and rejected photos are never served.',
    // Guests reach the policy too, so a guest (or a draft capability) gets the same NOT_FOUND as a missing record (T15).
    actors: ['staff', 'customer', 'guest'],
    permission: 'request.view',
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'none',
    pagination: false,
    test: 'test/integration/photos.test.ts',
    resource: async ({ req, db }) => {
      const { requestId } = req.params as { requestId: string }
      const r = await db
        .selectFrom('intake.requests')
        .select('project_id')
        .where('id', '=', requestId)
        .executeTakeFirst()
      return r ? { projectId: r.project_id } : null
    },
    schema: {
      params: {
        type: 'object',
        additionalProperties: false,
        required: ['requestId'],
        properties: { requestId: PHOTO_ID },
      },
      response: {
        200: {
          type: 'object',
          additionalProperties: false,
          required: ['photos'],
          properties: {
            photos: {
              type: 'array',
              items: {
                ...PHOTO_SCHEMA,
                required: [...PHOTO_SCHEMA.required, 'url'],
                properties: { ...PHOTO_SCHEMA.properties, url: { type: ['string', 'null'] } },
              },
            },
          },
        },
      },
    },
    handler: async (ctx) => {
      const { requestId } = ctx.req.params as { requestId: string }
      const rows = await ctx.db
        .selectFrom('intake.photos')
        .select(['id', 'state', 'content_type', 'byte_size', 'rejection_reason'])
        .where('request_id', '=', requestId)
        .where('state', '<>', 'removed')
        .orderBy('uploaded_at')
        .execute()
      const photos = []
      for (const r of rows)
        photos.push({
          id: r.id,
          state: r.state,
          contentType: r.content_type,
          byteSize: r.byte_size,
          rejectionReason: r.rejection_reason,
          url: r.state === 'ready' ? await photoUrl(ctx.db, { requestId, photoId: r.id, storage: deps.storage }) : null,
        })
      return { body: { photos } }
    },
  }

  return { name: 'photos', routes: [createDraft, upload, list, remove, requestPhotos] }
}
