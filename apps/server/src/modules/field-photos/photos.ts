// Field photos, customer sharing and photo publication permissions (TSK-0076; HH-QA-05, HH-PORT-11, HH-PRIV-02,
// HH-DATA-07, HH-STAFF-05, HH-SEC-05, T24, T57, T68, ENT-Photo, ENT-ConsentPreference, OWN-DEC-106, OWN-DEC-109,
// RULE-SERVER-AUTHZ). Migration 0080 is the database's own backstop for every rule here.
// - Documentation: before and after photos of a work package (uploadFieldPhoto, start/actions.ts) are internal,
//   quarantined until fieldPhotoProcessAutomation checks the stored original again, and never change.
// - Customer sharing: Owner or Office (media.share_with_customer) shares a ready, internal photo with the customer of
//   its project, or stops sharing it (PROPOSED); each is audited. Only shared photos reach the customer, through the
//   project they belong to, by short-lived signed URLs; every other photo is not found by URL or ID.
// - Marketing publication: a separate, per-photo permission (purpose, channel, notice version) that only the Owner
//   records (media.mark_marketing_eligible), with the customer's evidence, under the configured publication notice;
//   NOT CONFIGURED notice: nothing can be recorded. Sharing never creates one; a withdrawal stops new use at once.
import { createHash } from 'node:crypto'
import type { Db, Tx } from '@handyhub/db'
import { readsVisibility, type Actor, type DataScope, type StaffActor } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError } from '../../api/errors.js'
import type { Automation } from '../../platform/automation.js'
import { loadConfig } from '../../platform/config/index.js'
import { jobInScope, projectInScope } from '../../platform/data-scope.js'
import type { ObjectStorage } from '../../providers/index.js'
import { contentProblems } from '../photos/content.js'
import { PHOTO_URL_SECONDS } from '../photos/photos.js'
import { customerVisiblePhoto, findProject } from '../records/index.js'

type Reader = Db | Tx

export const FIELD_PHOTO_UPLOADED_EVENT = 'field_photo.uploaded'

export const PUBLICATION_PURPOSES = ['marketing'] as const
/** PROPOSED: the one decided publication use is the website's "Latest projects" (OWN-DEC-50). */
export const PUBLICATION_CHANNELS = ['website'] as const
export const PUBLICATION_EVIDENCE = ['signed_form', 'email', 'text_message'] as const
export type PublicationChannel = (typeof PUBLICATION_CHANNELS)[number]

// --- Processing ------------------------------------------------------------------------------------------------------

/** The processing step of field photos: the stored original is checked again before it may be served or shared. */
export function fieldPhotoProcessAutomation(storage: ObjectStorage | null): Automation {
  return {
    name: 'field_photo.process',
    trigger: { kind: 'event', eventTypes: [FIELD_PHOTO_UPLOADED_EVENT] },
    identity: 'system.media',
    inputs: { description: 'the photo id of the field_photo.uploaded event', version: 1 },
    idempotency: 'only a quarantined field photo is processed; a processed one is left as it is',
    effect: 'marks a quarantined field photo ready or rejected after checking the stored original',
    retry: { maxAttempts: 5, baseDelayMs: 2_000, maxDelayMs: 120_000 },
    timeoutMs: 30_000,
    exceptionOwner: 'owner',
    audit: { action: 'field_photo.processed' },
    handle: async ({ tx, job }) => {
      const id = job.target.id
      if (!id) return 'cancelled'
      const row = await tx
        .selectFrom('work.field_photos')
        .select(['id', 'object_key', 'content_type', 'sha256', 'state', 'version'])
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirst()
      if (!row || row.state !== 'quarantined') return 'cancelled'
      if (!storage) throw new Error('object storage is NOT CONFIGURED')
      const { bytes } = await storage.get(row.object_key)
      const sameBytes = createHash('sha256').update(bytes).digest('hex') === row.sha256
      const problem = sameBytes ? contentProblems(bytes, row.content_type)[0] : 'malformed'
      await tx
        .updateTable('work.field_photos')
        .set({
          ...(problem ? { state: 'rejected', rejection_reason: problem } : { state: 'ready' }),
          processed_at: sql<Date>`now()`,
          version: row.version + 1,
        })
        .where('id', '=', id)
        .execute()
      return 'done'
    },
  }
}

// --- Staff view ------------------------------------------------------------------------------------------------------

export type PublicationState = {
  channel: PublicationChannel
  granted: boolean
  noticeVersion: string | null
  recordedAt: Date
}

export type StaffFieldPhoto = {
  id: string
  workPackageId: string
  visitId: string
  visitNumber: number
  phase: 'before' | 'after'
  areaLabel: string | null
  pairOf: string | null
  state: 'quarantined' | 'ready' | 'rejected'
  rejectionReason: string | null
  visibility: string
  version: number
  uploadedAt: Date
  uploadedBy: { id: string; name: string | null }
  sharedAt: Date | null
  url: string | null
  publication: PublicationState[]
}

/** The latest publication record per photo and channel (the current state, ENT-ConsentPreference). */
export async function publicationStates(db: Reader, photoIds: readonly string[]) {
  const out = new Map<string, PublicationState[]>()
  if (photoIds.length === 0) return out
  const rows = await db
    .selectFrom('work.photo_publication_permissions')
    .select(['photo_id', 'channel', 'granted', 'notice_version', 'recorded_at', 'seq'])
    .where('photo_id', 'in', [...photoIds])
    .where('purpose', '=', 'marketing')
    .orderBy('seq', 'desc')
    .execute()
  for (const r of rows) {
    const list = out.get(r.photo_id) ?? []
    if (list.some((p) => p.channel === r.channel)) continue
    list.push({
      channel: r.channel as PublicationChannel,
      granted: r.granted,
      noticeVersion: r.notice_version,
      recordedAt: r.recorded_at,
    })
    out.set(r.photo_id, list)
  }
  return out
}

/** Whether a photo may be used for marketing on a channel now: only a current, recorded grant (never a share). */
export async function marketingEligible(db: Reader, photoId: string, channel: PublicationChannel): Promise<boolean> {
  return (await publicationStates(db, [photoId])).get(photoId)?.some((p) => p.channel === channel && p.granted) ?? false
}

/** The configured publication notice version, or null while NOT CONFIGURED. */
export async function publicationNotice(db: Reader): Promise<string | null> {
  const v = (await loadConfig(db)).get('media.publication_notice')
  return v.state === 'CONFIGURED' ? v.value.documentId : null
}

/**
 * A job's field photos inside the scope, by work package, oldest first, with signed URLs for ready ones. A photo of a
 * restricted class is listed only for a role that reads it (HH-STAFF-05). Out of scope or unknown job: null.
 */
export async function jobFieldPhotos(
  db: Reader,
  scope: DataScope,
  actor: Actor,
  jobId: string,
  storage: ObjectStorage | null,
) {
  const job = await db
    .selectFrom('work.jobs as j')
    .innerJoin('crm.projects as p', 'p.id', 'j.project_id')
    .select(['j.id', 'j.project_id', 'p.reference'])
    .where('j.id', '=', jobId)
    .where((eb) => eb.or([projectInScope('j.project_id', scope), jobInScope('j.id', scope)]))
    .executeTakeFirst()
  if (!job) return null
  const packages = await db
    .selectFrom('work.work_packages as w')
    .innerJoin('catalog.services as s', 's.id', 'w.service_id')
    .select(['w.id', 's.code'])
    .where('w.job_id', '=', job.id)
    .orderBy('w.position')
    .execute()
  const rows = await db
    .selectFrom('work.field_photos as f')
    .innerJoin('work.visits as v', 'v.id', 'f.visit_id')
    .innerJoin('identity.staff_users as u', 'u.id', 'f.staff_user_id')
    .select([
      'f.id',
      'f.work_package_id',
      'f.visit_id',
      'v.number',
      'f.phase',
      'f.area_label',
      'f.pair_of',
      'f.state',
      'f.rejection_reason',
      'f.visibility',
      'f.version',
      'f.uploaded_at',
      'f.staff_user_id',
      'u.display_name',
      'f.visibility_changed_at',
      'f.object_key',
      'f.project_id',
    ])
    .where('f.job_id', '=', job.id)
    .orderBy('f.uploaded_at')
    .orderBy('f.id')
    .execute()
  const now = new Date()
  const visible = rows.filter(
    (r) =>
      readsVisibility(actor, r.visibility, { projectId: r.project_id, ownerStaffId: r.staff_user_id }, now).allowed,
  )
  const pubs = await publicationStates(
    db,
    visible.map((r) => r.id),
  )
  const photos: StaffFieldPhoto[] = []
  for (const r of visible)
    photos.push({
      id: r.id,
      workPackageId: r.work_package_id,
      visitId: r.visit_id,
      visitNumber: r.number,
      phase: r.phase as 'before' | 'after',
      areaLabel: r.area_label,
      pairOf: r.pair_of,
      state: r.state as StaffFieldPhoto['state'],
      rejectionReason: r.rejection_reason,
      visibility: r.visibility,
      version: r.version,
      uploadedAt: r.uploaded_at,
      uploadedBy: { id: r.staff_user_id, name: r.display_name },
      sharedAt: r.visibility === 'customer_shared' ? r.visibility_changed_at : null,
      url:
        r.state === 'ready' && storage
          ? await storage.signedGetUrl(r.object_key, { expiresInSeconds: PHOTO_URL_SECONDS })
          : null,
      publication: pubs.get(r.id) ?? [],
    })
  return {
    jobId: job.id,
    projectId: job.project_id,
    projectReference: job.reference,
    workPackages: packages.map((p) => ({ workPackageId: p.id, serviceCode: p.code })),
    photos,
  }
}

/** The visits of a job where `staffUserId` may upload now: assigned and arrived; after photos once they started. */
export async function uploadVisits(db: Reader, jobId: string, staffUserId: string) {
  const rows = await db
    .selectFrom('work.visits as v')
    .innerJoin('work.reservations as r', 'r.visit_id', 'v.id')
    .leftJoin('work.work_starts as s', (j) =>
      j.onRef('s.visit_id', '=', 'v.id').on('s.staff_user_id', '=', staffUserId),
    )
    .select(['v.id', 'v.number', 's.id as start_id'])
    .where('v.job_id', '=', jobId)
    .where('v.state', '=', 'arrived')
    .where('r.staff_user_id', '=', staffUserId)
    .where('r.resource', '=', 'worker')
    .where('r.kind', '=', 'confirmed')
    .where('r.ended_at', 'is', null)
    .where(sql<boolean>`now() < ((v.local_date + 1)::timestamp AT TIME ZONE v.time_zone)`)
    .orderBy('v.number')
    .execute()
  return rows.map((r) => ({ visitId: r.id, visitNumber: r.number, after: r.start_id !== null }))
}

// --- Share with the customer ------------------------------------------------------------------------------------------

type PhotoRow = {
  id: string
  project_id: string
  job_id: string
  state: string
  visibility: string
  version: number
}

async function lockedPhoto(tx: Tx, photoId: string, expected: number): Promise<PhotoRow> {
  const row = await tx
    .selectFrom('work.field_photos')
    .select(['id', 'project_id', 'job_id', 'state', 'visibility', 'version'])
    .where('id', '=', photoId)
    .forUpdate()
    .executeTakeFirst()
  if (!row) throw new ApiError('NOT_FOUND')
  if (row.version !== expected)
    throw new ApiError('STALE_VERSION', {
      current: { version: row.version, values: { state: row.state, shared: row.visibility === 'customer_shared' } },
    })
  return row
}
const conflict = (code: string) => new ApiError('CONFLICT', { fieldErrors: [{ field: 'photo', code, message: '' }] })

/**
 * Shares one field photo with the customer of its project (share) or stops sharing it (stop). Only a ready, internal
 * photo is shared; a restricted one never. The database records who and when, and refuses any other role.
 */
export async function changeSharing(
  tx: Tx,
  actor: StaffActor,
  photoId: string,
  expected: number,
  to: 'share' | 'stop',
): Promise<PhotoRow & { from: string }> {
  const row = await lockedPhoto(tx, photoId, expected)
  if (to === 'share') {
    if (row.visibility === 'customer_shared') throw conflict('PHOTO_ALREADY_SHARED')
    if (row.visibility !== 'internal_operational') throw conflict('PHOTO_RESTRICTED')
    if (row.state !== 'ready') throw conflict('PHOTO_NOT_READY')
  } else if (row.visibility !== 'customer_shared') throw conflict('PHOTO_NOT_SHARED')
  const visibility = to === 'share' ? 'customer_shared' : 'internal_operational'
  const out = await tx
    .updateTable('work.field_photos')
    .set({
      visibility,
      visibility_changed_by: actor.userId,
      visibility_changed_at: sql<Date>`now()`,
      version: row.version + 1,
    })
    .where('id', '=', row.id)
    .returning(['id', 'project_id', 'job_id', 'state', 'visibility', 'version'])
    .executeTakeFirstOrThrow()
  return { ...out, from: row.visibility }
}

// --- Publication permission -----------------------------------------------------------------------------------------

export type PublicationInput = {
  purpose: 'marketing'
  channel: PublicationChannel
  granted: boolean
  noticeVersion?: string
  evidenceKind: (typeof PUBLICATION_EVIDENCE)[number]
  evidenceReference: string
}

/**
 * Records the customer's evidenced permission to publish one field photo, or its withdrawal (append-only; the latest
 * record per photo, purpose and channel is current). A grant names the configured notice version; while the notice is
 * NOT CONFIGURED nothing is recorded. A withdrawal needs a current grant and stops new use at once.
 */
export async function recordPublication(tx: Tx, actor: StaffActor, photoId: string, input: PublicationInput) {
  const photo = await tx
    .selectFrom('work.field_photos as f')
    .innerJoin('crm.projects as p', 'p.id', 'f.project_id')
    .select(['f.id', 'f.project_id', 'f.job_id', 'f.state', 'f.visibility', 'p.customer_id'])
    .where('f.id', '=', photoId)
    .forUpdate()
    .executeTakeFirst()
  if (!photo) throw new ApiError('NOT_FOUND')
  if (photo.visibility !== 'internal_operational' && photo.visibility !== 'customer_shared')
    throw conflict('PHOTO_RESTRICTED')
  if (photo.state !== 'ready') throw conflict('PHOTO_NOT_READY')
  const current = (await publicationStates(tx, [photoId])).get(photoId)?.find((p) => p.channel === input.channel)
  if (input.granted) {
    const notice = await publicationNotice(tx)
    if (!notice)
      throw new ApiError('NOT_CONFIGURED', {
        fieldErrors: [{ field: 'body.noticeVersion', code: 'PUBLICATION_NOTICE_NOT_CONFIGURED', message: '' }],
      })
    if (input.noticeVersion !== notice)
      throw new ApiError('VALIDATION_FAILED', {
        fieldErrors: [{ field: 'body.noticeVersion', code: 'NOTICE_VERSION_NOT_CURRENT', message: '' }],
      })
    if (current?.granted) throw conflict('PUBLICATION_ALREADY_GRANTED')
  } else if (!current?.granted) throw conflict('PUBLICATION_NOT_GRANTED')
  const row = await tx
    .insertInto('work.photo_publication_permissions')
    .values({
      photo_id: photo.id,
      project_id: photo.project_id,
      customer_id: photo.customer_id,
      purpose: input.purpose,
      channel: input.channel,
      granted: input.granted,
      notice_version: input.granted ? (input.noticeVersion ?? null) : null,
      evidence_kind: input.evidenceKind,
      evidence_reference: input.evidenceReference.trim(),
      recorded_by: actor.userId,
    })
    .returning(['id', 'recorded_at'])
    .executeTakeFirstOrThrow()
  return { id: row.id, recordedAt: row.recorded_at, projectId: photo.project_id, jobId: photo.job_id }
}

// --- Customer view ---------------------------------------------------------------------------------------------------

export type CustomerUpload = { id: string; state: string; uploadedAt: Date; url: string | null }
export type SharedPhoto = { id: string; sharedAt: Date; url: string | null }
export type SharedGroup = { service: string; before: SharedPhoto | null; after: SharedPhoto | null }

const signed = (storage: ObjectStorage | null, key: string) =>
  storage ? storage.signedGetUrl(key, { expiresInSeconds: PHOTO_URL_SECONDS }) : Promise.resolve(null)

/**
 * What the Photos tab shows of a project already in the caller's scope: the customer's own uploads (request and reply
 * photos) and the field photos staff shared, paired before/after where staff paired them and both are shared, each
 * labelled by its service. Nothing else is read: internal and restricted field photos are not selected at all.
 */
export async function customerPhotos(db: Reader, projectId: string, storage: ObjectStorage | null) {
  const uploads = await db
    .selectFrom('intake.photos')
    .select(['id', 'state', 'uploaded_at', 'object_key'])
    .where('project_id', '=', projectId)
    .where('state', '<>', 'removed')
    .where(customerVisiblePhoto)
    .orderBy('uploaded_at')
    .orderBy('id')
    .execute()
  const yours: CustomerUpload[] = []
  for (const u of uploads)
    yours.push({
      id: u.id,
      state: u.state,
      uploadedAt: u.uploaded_at,
      url: u.state === 'ready' ? await signed(storage, u.object_key) : null,
    })
  const shared = await db
    .selectFrom('work.field_photos as f')
    .innerJoin('work.work_packages as w', 'w.id', 'f.work_package_id')
    .innerJoin('catalog.service_versions as sv', (j) =>
      j.onRef('sv.service_id', '=', 'w.service_id').onRef('sv.version', '=', 'w.service_version'),
    )
    .select(['f.id', 'f.phase', 'f.pair_of', 'f.visibility_changed_at', 'f.object_key', 'sv.name', 'w.position'])
    .where('f.project_id', '=', projectId)
    .where('w.project_id', '=', projectId)
    .where('f.visibility', '=', 'customer_shared')
    .where('f.state', '=', 'ready')
    .orderBy('w.position')
    .orderBy('f.uploaded_at')
    .orderBy('f.id')
    .execute()
  const photo = async (r: (typeof shared)[number]): Promise<SharedPhoto> => ({
    id: r.id,
    sharedAt: r.visibility_changed_at ?? new Date(0),
    url: await signed(storage, r.object_key),
  })
  const byId = new Map(shared.map((r) => [r.id, r]))
  const paired = new Set<string>()
  for (const r of shared) if (r.phase === 'after' && r.pair_of && byId.has(r.pair_of)) paired.add(r.pair_of)
  const groups: SharedGroup[] = []
  for (const r of shared) {
    if (r.phase === 'before' && paired.has(r.id)) continue
    const before = r.phase === 'before' ? r : r.pair_of ? byId.get(r.pair_of) : undefined
    groups.push({
      service: r.name,
      before: before ? await photo(before) : null,
      after: r.phase === 'after' ? await photo(r) : null,
    })
  }
  return {
    yours,
    shared: groups,
    counts: {
      received: uploads.filter((p) => p.state === 'ready').length,
      processing: uploads.filter((p) => p.state === 'quarantined').length,
      failed: uploads.filter((p) => p.state === 'rejected').length,
    },
  }
}

/**
 * One photo the customer may see, by its ID inside a project of the caller's scope: their own upload (ready) or a
 * shared, ready field photo; a fresh signed URL. Any other photo (internal, restricted, another project's, unknown,
 * malformed) is null, answered NOT_FOUND exactly like a missing one (OWN-DEC-106).
 */
export async function customerPhotoLink(
  db: Reader,
  scope: DataScope,
  reference: string,
  photoId: string,
  storage: ObjectStorage | null,
): Promise<{ id: string; url: string; expiresInSeconds: number } | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(photoId) || !storage) return null
  const project = await findProject(db, scope, { reference })
  if (!project) return null
  const upload = await db
    .selectFrom('intake.photos')
    .select('object_key')
    .where('id', '=', photoId)
    .where('project_id', '=', project.id)
    .where('state', '=', 'ready')
    .where(customerVisiblePhoto)
    .executeTakeFirst()
  const field = upload
    ? undefined
    : await db
        .selectFrom('work.field_photos')
        .select('object_key')
        .where('id', '=', photoId)
        .where('project_id', '=', project.id)
        .where('visibility', '=', 'customer_shared')
        .where('state', '=', 'ready')
        .executeTakeFirst()
  const key = upload?.object_key ?? field?.object_key
  if (!key) return null
  return {
    id: photoId,
    url: await storage.signedGetUrl(key, { expiresInSeconds: PHOTO_URL_SECONDS }),
    expiresInSeconds: PHOTO_URL_SECONDS,
  }
}
