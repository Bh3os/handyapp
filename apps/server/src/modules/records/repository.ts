// Scoped repository helpers (TSK-0037; HH-DATA-01, HH-PORT-01, HH-DATA-07, HH-STAFF-04, RULE-SERVER-AUTHZ). Every
// helper takes the caller's DataScope (ApiContext.scope, from @handyhub/policy dataScope()) and writes it into the
// query, so the data layer itself refuses what is outside it: a project, request or photo reached by an altered ID,
// or through a session for another project, is not found (the route answers NOT_FOUND, like a missing record) and
// nothing is read or changed. A child record is reached only through the project it actually belongs to: the photo
// through its request, the request through its project, the project through the scope.
import type { Database, Db, Tx } from '@handyhub/db'
import { REFERENCE_PATTERN } from '@handyhub/domain/request-form'
import type { DataScope } from '@handyhub/policy'
import type { Expression, ExpressionBuilder, SqlBool } from 'kysely'
import { projectInScope } from '../../platform/data-scope.js'

type Reader = Db | Tx
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The project a reference (HH-XXXX) or ID names, when it lies in the scope; null otherwise. */
export async function findProject(
  db: Reader,
  scope: DataScope,
  by: { reference: string } | { id: string },
): Promise<{ id: string; reference: string } | null> {
  let q = db.selectFrom('crm.projects as p').select(['p.id', 'p.reference']).where(projectInScope('p.id', scope))
  if ('reference' in by) {
    if (!REFERENCE_PATTERN.test(by.reference)) return null
    q = q.where('p.reference', '=', by.reference)
  } else {
    if (!UUID.test(by.id)) return null
    q = q.where('p.id', '=', by.id)
  }
  return (await q.executeTakeFirst()) ?? null
}

/**
 * The references of the projects a customer scope names (a guest link: one; an account: its linked projects), in
 * the scope's order. Only an explicit list of projects is listed: a staff `all` scope is never dumped here (HH-API-05).
 */
export async function scopedProjectReferences(db: Reader, scope: DataScope): Promise<string[]> {
  if (scope.kind !== 'projects' || scope.projectIds.length === 0) return []
  const rows = await db
    .selectFrom('crm.projects as p')
    .select(['p.id', 'p.reference'])
    .where(projectInScope('p.id', scope))
    .execute()
  const byId = new Map(rows.map((r) => [r.id, r.reference]))
  return scope.projectIds.flatMap((id) => byId.get(id) ?? [])
}

/** A request with its project, when the project lies in the scope; null for any other or unknown request. */
export async function findRequest(
  db: Reader,
  scope: DataScope,
  requestId: string,
): Promise<{ id: string; projectId: string; reference: string } | null> {
  if (!UUID.test(requestId)) return null
  const row = await db
    .selectFrom('intake.requests as r')
    .innerJoin('crm.projects as p', 'p.id', 'r.project_id')
    .select(['r.id', 'r.project_id', 'r.reference'])
    .where('r.id', '=', requestId)
    .where(projectInScope('r.project_id', scope))
    .executeTakeFirst()
  return row ? { id: row.id, projectId: row.project_id, reference: row.reference } : null
}

/**
 * Media a customer may see (HH-DATA-07, OWN-DEC-106): what the customer uploaded, or what staff shared through the
 * audited share action. Internal is the default visibility, so every other photo (internal, restricted incident) is
 * absent from customer reads by URL and by ID.
 */
export function customerVisiblePhoto(eb: ExpressionBuilder<Database, 'intake.photos'>): Expression<SqlBool> {
  return eb.or([
    eb('intake.photos.uploader_kind', '=', 'customer'),
    eb('intake.photos.visibility', '=', 'customer_shared'),
  ])
}

export type PhotoRow = {
  id: string
  state: string
  contentType: string
  byteSize: number
  rejectionReason: string | null
}

/**
 * The photos of a request inside the scope, oldest first (removed ones never). `audience: 'customer'` keeps only the
 * customer-visible ones. An out-of-scope or unknown request: null.
 */
export async function requestPhotos(
  db: Reader,
  scope: DataScope,
  requestId: string,
  audience: 'customer' | 'staff',
): Promise<PhotoRow[] | null> {
  const request = await findRequest(db, scope, requestId)
  if (!request) return null
  let q = db
    .selectFrom('intake.photos')
    .select(['id', 'state', 'content_type', 'byte_size', 'rejection_reason'])
    .where('request_id', '=', request.id)
    .where('project_id', '=', request.projectId)
    .where('state', '<>', 'removed')
  if (audience === 'customer') q = q.where(customerVisiblePhoto)
  const rows = await q.orderBy('uploaded_at').orderBy('id').execute()
  return rows.map((r) => ({
    id: r.id,
    state: r.state,
    contentType: r.content_type,
    byteSize: r.byte_size,
    rejectionReason: r.rejection_reason,
  }))
}
