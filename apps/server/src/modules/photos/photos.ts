// Request photos (TSK-0031; HH-INT-04..07, HH-SEC-05, ENT-Photo, FACT-UPLOAD-LIMITS, OWN-DEC-62, OWN-DEC-146).
// - An upload capability is a random token for one draft (or, after submission, one request). It is created by the
//   wizard when the first photo is chosen, lives as long as the configured request draft (session.timings
//   .requestDraftDays), and reaches only its own photos: another scope's photo answers exactly like a missing one.
// - Limits come from configuration (uploads.limits): the per-file size, the number of photos per request and the
//   allowed types. NOT CONFIGURED limits refuse uploads instead of guessing.
// - The server checks the bytes (content.ts), stores the original once under an opaque key in the private bucket
//   (R2, or the fake in local and ci), and quarantines it; the photo.uploaded job checks it again and marks it ready or
//   rejected. Only ready photos are served, only by a short-lived signed URL, only after the caller was authorized.
// - On submission the draft's photos are bound to the new request and project by the server and the draft capability
//   is consumed.
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { Db, Tx } from '@handyhub/db'
import { sql } from 'kysely'
import type { Automation } from '../../platform/automation.js'
import { loadConfig, type Config } from '../../platform/config/index.js'
import { outbox } from '../../platform/outbox.js'
import type { ObjectStorage } from '../../providers/index.js'
import { contentProblems, type ContentProblem } from './content.js'

export const PHOTO_UPLOADED_EVENT = 'photo.uploaded'
export const CAPABILITY_HEADER = 'upload-capability'
/** Signed URLs for photos: PROPOSED 5 minutes (the storage adapter's default; no owner value). */
export const PHOTO_URL_SECONDS = 300

export type PhotoLimits = { maxFileBytes: number; maxPhotos: number; types: readonly string[] }
export type Capability = { id: string; scope: 'draft' | 'request'; requestId: string | null; expiresAt: Date }

export type UploadProblem = ContentProblem | 'too_large' | 'too_many' | 'empty' | 'type_not_allowed'

export class PhotoError extends Error {
  override name = 'PhotoError'
  constructor(readonly problem: UploadProblem | 'not_configured' | 'storage_not_configured') {
    super(problem)
  }
}

const hash = (token: string) => createHash('sha256').update(token, 'utf8').digest('hex')
const TOKEN = /^[A-Za-z0-9_-]{43}$/

export function photoLimits(config: Config): PhotoLimits | null {
  const l = config.get('uploads.limits')
  return l.state === 'CONFIGURED'
    ? { maxFileBytes: l.value.maxFileBytes, maxPhotos: l.value.maxRequestPhotos, types: l.value.requestPhotoTypes }
    : null
}

function draftLifetimeDays(config: Config): number | null {
  const t = config.get('session.timings')
  return t.state === 'CONFIGURED' && t.value.requestDraftDays > 0 ? t.value.requestDraftDays : null
}

/** A new capability; the token is returned once and only its hash is kept. */
export async function createCapability(
  tx: Tx,
  input: { scope: 'draft' } | { scope: 'request'; requestId: string },
  now: Date = new Date(),
): Promise<{ token: string; capability: Capability }> {
  const days = draftLifetimeDays(await loadConfig(tx))
  if (days === null) throw new PhotoError('not_configured')
  const token = randomBytes(32).toString('base64url')
  const id = randomUUID()
  const expiresAt = new Date(now.getTime() + days * 86_400_000)
  const requestId = input.scope === 'request' ? input.requestId : null
  await tx
    .insertInto('intake.upload_capabilities')
    .values({
      id,
      token_hash: hash(token),
      scope: input.scope,
      request_id: requestId,
      expires_at: expiresAt,
      created_at: now,
    })
    .execute()
  return { token, capability: { id, scope: input.scope, requestId, expiresAt } }
}

/** The open, unexpired capability for a token, or null (answered like a missing record). */
export async function resolveCapability(
  db: Db | Tx,
  token: unknown,
  now: Date = new Date(),
): Promise<Capability | null> {
  if (typeof token !== 'string' || !TOKEN.test(token)) return null
  const row = await db
    .selectFrom('intake.upload_capabilities')
    .select(['id', 'scope', 'request_id', 'expires_at'])
    .where('token_hash', '=', hash(token))
    .where('state', '=', 'open')
    .where('expires_at', '>', now)
    .executeTakeFirst()
  return row
    ? { id: row.id, scope: row.scope as 'draft' | 'request', requestId: row.request_id, expiresAt: row.expires_at }
    : null
}

export type PhotoView = {
  id: string
  state: 'quarantined' | 'ready' | 'rejected'
  contentType: string
  byteSize: number
  rejectionReason: string | null
}

const VIEW = ['id', 'state', 'content_type', 'byte_size', 'rejection_reason'] as const
const view = (r: {
  id: string
  state: string
  content_type: string
  byte_size: number
  rejection_reason: string | null
}): PhotoView => ({
  id: r.id,
  state: r.state as PhotoView['state'],
  contentType: r.content_type,
  byteSize: r.byte_size,
  rejectionReason: r.rejection_reason,
})

/** Photos of one capability's scope (a draft's own photos, or a request's photos for a request capability). */
export async function listPhotos(db: Db | Tx, cap: Capability): Promise<PhotoView[]> {
  let q = db.selectFrom('intake.photos').select(VIEW).where('state', '<>', 'removed')
  q =
    cap.scope === 'request' && cap.requestId
      ? q.where('request_id', '=', cap.requestId)
      : q.where('capability_id', '=', cap.id)
  return (await q.orderBy('uploaded_at').execute()).map(view)
}

async function activeCount(tx: Tx, cap: Capability): Promise<number> {
  let q = tx
    .selectFrom('intake.photos')
    .select((eb) => eb.fn.countAll<string>().as('n'))
    .where('state', 'in', ['quarantined', 'ready'])
  q =
    cap.scope === 'request' && cap.requestId
      ? q.where('request_id', '=', cap.requestId)
      : q.where('capability_id', '=', cap.id)
  return Number((await q.executeTakeFirst())?.n ?? 0)
}

/**
 * Checks and stores one photo. Throws PhotoError naming the problem (nothing is stored then). The same bytes sent
 * again to the same scope return the existing photo, so a retried upload never duplicates it.
 */
export async function uploadPhoto(
  tx: Tx,
  input: { cap: Capability; bytes: Uint8Array; declaredType: string; storage: ObjectStorage | null; requestId: string },
): Promise<{ photo: PhotoView; created: boolean }> {
  const limits = photoLimits(await loadConfig(tx))
  if (!limits) throw new PhotoError('not_configured')
  if (!input.storage) throw new PhotoError('storage_not_configured')
  const declared = input.declaredType.split(';')[0]?.trim().toLowerCase() ?? ''
  if (input.bytes.length === 0) throw new PhotoError('empty')
  if (input.bytes.length > limits.maxFileBytes) throw new PhotoError('too_large')
  if (!limits.types.includes(declared)) throw new PhotoError('type_not_allowed')
  const problems = contentProblems(input.bytes, declared)
  if (problems[0]) throw new PhotoError(problems[0])

  // One writer per scope at a time, so the count limit holds under concurrent uploads.
  await sql`SELECT pg_advisory_xact_lock(hashtext(${`photos:${input.cap.requestId ?? input.cap.id}`}))`.execute(tx)
  const sha256 = createHash('sha256').update(input.bytes).digest('hex')
  const existing = await tx
    .selectFrom('intake.photos')
    .select(VIEW)
    .where('capability_id', '=', input.cap.id)
    .where('sha256', '=', sha256)
    .where('state', '<>', 'removed')
    .executeTakeFirst()
  if (existing) return { photo: view(existing), created: false }
  if ((await activeCount(tx, input.cap)) >= limits.maxPhotos) throw new PhotoError('too_many')

  let projectId: string | null = null
  if (input.cap.scope === 'request' && input.cap.requestId) {
    const r = await tx
      .selectFrom('intake.requests')
      .select('project_id')
      .where('id', '=', input.cap.requestId)
      .executeTakeFirstOrThrow()
    projectId = r.project_id
  }
  const id = randomUUID()
  // Opaque key: no name, address or file name; the original is written once and never overwritten.
  const key = `requests/photos/${id}`
  await input.storage.put(key, input.bytes, declared)
  const row = await tx
    .insertInto('intake.photos')
    .values({
      id,
      capability_id: input.cap.id,
      request_id: input.cap.scope === 'request' ? input.cap.requestId : null,
      project_id: projectId,
      object_key: key,
      content_type: declared,
      byte_size: input.bytes.length,
      sha256,
      // A capability is held by the customer's own browser (draft or receipt): a customer upload (TSK-0037).
      uploader_kind: 'customer',
    })
    .returning(VIEW)
    .executeTakeFirstOrThrow()
  await outbox.add(tx, {
    type: PHOTO_UPLOADED_EVENT,
    aggregate: { type: 'photo', id },
    payload: { photoId: id },
    idempotencyKey: `${PHOTO_UPLOADED_EVENT}:${id}`,
    requestId: input.requestId,
  })
  return { photo: view(row), created: true }
}

/** Removes a photo of the capability's own draft before submission; false when it is not one of them. */
export async function removePhoto(tx: Tx, cap: Capability, photoId: string): Promise<boolean> {
  if (cap.scope !== 'draft') return false
  const r = await tx
    .updateTable('intake.photos')
    .set({ state: 'removed', removed_at: sql<Date>`now()` })
    .where('id', '=', photoId)
    .where('capability_id', '=', cap.id)
    .where('request_id', 'is', null)
    .where('state', '<>', 'removed')
    .executeTakeFirst()
  return Number(r.numUpdatedRows) > 0
}

export type PhotoSummary = { received: number; processing: number; failed: number }

/**
 * Binds a draft's photos to the request created from it (inside the submission transaction) and consumes the draft
 * capability. An unknown, expired or used token binds nothing: the request is saved anyway (a photo failure never
 * loses the request).
 */
export async function bindDraftPhotos(
  tx: Tx,
  input: { token: string | undefined; requestId: string; projectId: string },
): Promise<PhotoSummary & { bound: boolean }> {
  const summary = { received: 0, processing: 0, failed: 0, bound: false }
  const cap = await resolveCapability(tx, input.token)
  if (!cap || cap.scope !== 'draft') return summary
  const consumed = await tx
    .updateTable('intake.upload_capabilities')
    .set({ state: 'consumed', consumed_at: sql<Date>`now()`, request_id: input.requestId })
    .where('id', '=', cap.id)
    .where('state', '=', 'open')
    .executeTakeFirst()
  if (Number(consumed.numUpdatedRows) === 0) return summary
  summary.bound = true
  const rows = await tx
    .updateTable('intake.photos')
    .set({ request_id: input.requestId, project_id: input.projectId })
    .where('capability_id', '=', cap.id)
    .where('request_id', 'is', null)
    .where('state', '<>', 'removed')
    .returning('state')
    .execute()
  for (const r of rows) {
    if (r.state === 'ready') summary.received++
    else if (r.state === 'quarantined') summary.processing++
    else summary.failed++
  }
  return summary
}

/** A short-lived signed URL for a ready photo of a request; null for any other photo (missing, quarantined, rejected). */
export async function photoUrl(
  db: Db | Tx,
  input: { requestId: string; photoId: string; storage: ObjectStorage | null },
): Promise<string | null> {
  if (!input.storage) return null
  const row = await db
    .selectFrom('intake.photos')
    .select('object_key')
    .where('id', '=', input.photoId)
    .where('request_id', '=', input.requestId)
    .where('state', '=', 'ready')
    .executeTakeFirst()
  return row ? input.storage.signedGetUrl(row.object_key, { expiresInSeconds: PHOTO_URL_SECONDS }) : null
}

/** The processing step: the stored original is checked again before it may be served (quarantine release). */
export function photoProcessAutomation(storage: ObjectStorage | null): Automation {
  return {
    name: 'photo.process',
    trigger: { kind: 'event', eventTypes: [PHOTO_UPLOADED_EVENT] },
    identity: 'system.media',
    inputs: { description: 'the photo id of the photo.uploaded event', version: 1 },
    idempotency: 'only a quarantined photo is processed; a processed one is left as it is',
    effect: 'marks a quarantined photo ready or rejected after checking the stored original',
    retry: { maxAttempts: 5, baseDelayMs: 2_000, maxDelayMs: 120_000 },
    timeoutMs: 30_000,
    exceptionOwner: 'office',
    audit: { action: 'photo.processed' },
    handle: async ({ tx, job }) => {
      const id = job.target.id
      if (!id) return 'cancelled'
      const row = await tx
        .selectFrom('intake.photos')
        .select(['id', 'object_key', 'content_type', 'sha256', 'state'])
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirst()
      if (!row || row.state !== 'quarantined') return 'cancelled'
      if (!storage) throw new PhotoError('storage_not_configured')
      const { bytes } = await storage.get(row.object_key)
      const sameBytes = createHash('sha256').update(bytes).digest('hex') === row.sha256
      const problem = sameBytes ? contentProblems(bytes, row.content_type)[0] : 'malformed'
      await tx
        .updateTable('intake.photos')
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
