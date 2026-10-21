// The workspace tabs beside the Overview, read from the shared records (TSK-0039; HH-PORT-09, HH-PORT-01, HH-ARC-04,
// OWN-DEC-106, RULE-SERVER-AUTHZ). Every read goes through the caller's scope (TSK-0037): a project outside it is null,
// answered NOT_FOUND like a missing one. What each tab may say today (records/projections.ts):
// - Messages: the conversation is not shown in the portal yet (TSK-0050, TSK-0051); nothing is claimed absent.
// - Documents, Appointments, Payments: no customer document, visit or payment record exists yet, so none is shown.
// - Photos: the counts of the customer-visible photos (the customer's uploads, and photos staff shared) by state, the
//   same counts the receipt shows; the photos themselves, their URLs and IDs are not sent (viewing: TSK-0076).
import type { Db, Tx } from '@handyhub/db'
import type { DataScope } from '@handyhub/policy'
import { findProject, requestPhotos, type PhotoCounts } from '../records/index.js'
import { refreshSeconds } from './overview.js'

type Reader = Db | Tx

export const WORKSPACE_TABS = ['messages', 'documents', 'photos', 'appointments', 'payments'] as const
export type WorkspaceTab = (typeof WORKSPACE_TABS)[number]

type Head = { reference: string; refreshedAt: Date; refreshSeconds: number }
export type TabAnswer =
  | (Head & { tab: 'messages'; state: 'not_shown' })
  | (Head & { tab: 'documents' | 'appointments' | 'payments'; state: 'none' })
  | (Head & { tab: 'photos'; photos: PhotoCounts })

/** The customer-visible photos of the project's request, counted by state (removed ones never). */
async function photoCounts(db: Reader, scope: DataScope, projectId: string): Promise<PhotoCounts> {
  const r = await db.selectFrom('intake.requests').select('id').where('project_id', '=', projectId).executeTakeFirst()
  const rows = r ? ((await requestPhotos(db, scope, r.id, 'customer')) ?? []) : []
  return {
    received: rows.filter((p) => p.state === 'ready').length,
    processing: rows.filter((p) => p.state === 'quarantined').length,
    failed: rows.filter((p) => p.state === 'rejected').length,
  }
}

/** One tab of a project in the caller's scope; null for any other or unknown project. */
export async function projectTab(
  db: Reader,
  scope: DataScope,
  reference: string,
  tab: WorkspaceTab,
  now = new Date(),
): Promise<TabAnswer | null> {
  const project = await findProject(db, scope, { reference })
  if (!project) return null
  const head: Head = { reference: project.reference, refreshedAt: now, refreshSeconds: await refreshSeconds(db) }
  switch (tab) {
    case 'messages':
      return { ...head, tab, state: 'not_shown' }
    case 'photos':
      return { ...head, tab, photos: await photoCounts(db, scope, project.id) }
    default:
      return { ...head, tab, state: 'none' }
  }
}
