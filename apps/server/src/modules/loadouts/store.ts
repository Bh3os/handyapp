// Loadout records (TSK-0071; HH-PKT-05, HH-PKT-06, ENT-WorkPackage, ENT-Hold, OQ-LOADOUT-DETAILS).
// - ensureLoadoutPins() pins the current loadout version of each work package's service on the job's packages that
//   have none yet (migration 0063: set once, never changed), in the caller's transaction. The packet refresh calls it,
//   so the first read of a job's packet or loadout after a version exists pins it; a service without a version stays
//   NOT CONFIGURED (no row) and nothing is made up for it.
// - jobLoadout() reads a job's packages with their pinned list, every item's latest statement and the task blocks.
// - packageLoadoutReadiness() and jobLoadoutReadiness() say where each package's loadout stands (@handyhub/domain
//   loadoutReadiness): the loadout page, My Day (TSK-0070) and the Start Work gate (TSK-0073) read the same answer.
// - syncShortageItem() keeps the job's one loadout_shortage queue item in line with its blocking task blocks, in the
//   same transaction as whatever opened or ended one.
import type { Db, Tx } from '@handyhub/db'
import {
  BLOCKING_HOLD_STATES,
  loadoutReadiness,
  type LoadoutContent,
  type LoadoutReadiness,
  type LoadoutStatus,
} from '@handyhub/domain'
import { sql } from 'kysely'
import { openQueueItem, resolveQueueItem } from '../queue/index.js'

type Reader = Db | Tx

/** Pins the current loadout version on the job's work packages that have none; returns how many were pinned. */
export async function ensureLoadoutPins(tx: Tx, jobId: string): Promise<number> {
  const res = await sql<{ work_package_id: string }>`
    INSERT INTO work.work_package_loadouts (work_package_id, project_id, job_id, service_id, loadout_version_id)
    SELECT w.id, w.project_id, w.job_id, w.service_id, v.id
    FROM work.work_packages w
    JOIN catalog.loadout_versions v ON v.service_id = w.service_id AND v.superseded_at IS NULL
    WHERE w.job_id = ${jobId}
      AND NOT EXISTS (SELECT 1 FROM work.work_package_loadouts l WHERE l.work_package_id = w.id)
    ORDER BY w.position
    ON CONFLICT (work_package_id) DO NOTHING
    RETURNING work_package_id`.execute(tx)
  return res.rows.length
}

export type LoadoutPackage = {
  workPackageId: string
  projectId: string
  serviceId: string
  serviceCode: string
  position: number
  state: string
  pin: {
    loadoutVersionId: string
    inventoryId: string
    version: number
    sourceFile: string
    contentSha256: string
    pinnedAt: Date
    content: LoadoutContent
  } | null
}

/** The job's work packages, in order, with the loadout version pinned on each (null: NOT CONFIGURED). */
export async function loadoutPackages(db: Reader, jobId: string): Promise<LoadoutPackage[]> {
  const rows = await db
    .selectFrom('work.work_packages as w')
    .innerJoin('catalog.services as s', 's.id', 'w.service_id')
    .leftJoin('work.work_package_loadouts as l', 'l.work_package_id', 'w.id')
    .leftJoin('catalog.loadout_versions as v', 'v.id', 'l.loadout_version_id')
    .select([
      'w.id',
      'w.project_id',
      'w.service_id',
      's.code',
      'w.position',
      'w.state',
      'l.pinned_at',
      'v.id as version_id',
      'v.inventory_id',
      'v.version',
      'v.source_file',
      'v.content_sha256',
      'v.content',
    ])
    .where('w.job_id', '=', jobId)
    .orderBy('w.position')
    .orderBy('w.id')
    .execute()
  return rows.map((r) => ({
    workPackageId: r.id,
    projectId: r.project_id,
    serviceId: r.service_id,
    serviceCode: r.code,
    position: r.position,
    state: r.state,
    pin:
      r.version_id && r.pinned_at
        ? {
            loadoutVersionId: r.version_id,
            inventoryId: r.inventory_id as string,
            version: r.version as number,
            sourceFile: r.source_file as string,
            contentSha256: r.content_sha256 as string,
            pinnedAt: r.pinned_at,
            content: r.content as unknown as LoadoutContent,
          }
        : null,
  }))
}

export type LatestCheck = {
  id: string
  workPackageId: string
  itemKey: string
  status: LoadoutStatus
  note: string | null
  substitute: string | null
  impacts: string[] | null
  holdId: string | null
  recordedBy: { id: string; name: string | null }
  recordedAt: Date
}

/** The latest statement about every item of the job's packages. */
export async function latestChecks(db: Reader, jobId: string): Promise<LatestCheck[]> {
  const rows = await db
    .selectFrom('work.loadout_checks as c')
    .innerJoin('identity.staff_users as u', 'u.id', 'c.recorded_by')
    .select([
      'c.id',
      'c.work_package_id',
      'c.item_key',
      'c.status',
      'c.note',
      'c.substitute',
      'c.impacts',
      'c.hold_id',
      'c.recorded_by',
      'u.display_name',
      'c.recorded_at',
    ])
    .distinctOn(['c.work_package_id', 'c.item_key'])
    .where('c.job_id', '=', jobId)
    .orderBy('c.work_package_id')
    .orderBy('c.item_key')
    .orderBy('c.recorded_at', 'desc')
    .orderBy('c.id', 'desc')
    .execute()
  return rows.map((r) => ({
    id: r.id,
    workPackageId: r.work_package_id,
    itemKey: r.item_key,
    status: r.status as LoadoutStatus,
    note: r.note,
    substitute: r.substitute,
    impacts: r.impacts,
    holdId: r.hold_id,
    recordedBy: { id: r.recorded_by, name: r.display_name },
    recordedAt: r.recorded_at,
  }))
}

export type TaskBlock = {
  id: string
  workPackageId: string
  projectId: string
  itemKey: string
  state: string
  version: number
  note: string
  raisedBy: { id: string; name: string | null }
  raisedAt: Date
  reviewStartedAt: Date | null
  resolutionNote: string | null
  reviewer: string | null
  resolvedAt: Date | null
  cancelReason: string | null
  canceledAt: Date | null
}

/** The task blocks of the job's work packages, oldest first (all states: the resolved ones are history). */
export async function taskBlocks(db: Reader, jobId: string): Promise<TaskBlock[]> {
  const rows = await db
    .selectFrom('work.holds as h')
    .innerJoin('work.work_packages as w', 'w.id', 'h.scope_id')
    .innerJoin('identity.staff_users as u', 'u.id', 'h.raised_by')
    .select([
      'h.id',
      'h.scope_id',
      'h.project_id',
      'h.source_ref',
      'h.state',
      'h.version',
      'h.note',
      'h.raised_by',
      'u.display_name',
      'h.raised_at',
      'h.review_started_at',
      'h.resolution_note',
      'h.reviewer',
      'h.resolved_at',
      'h.cancel_reason',
      'h.canceled_at',
    ])
    .where('h.kind', '=', 'task_block')
    .where('h.scope_type', '=', 'work_package')
    .where('w.job_id', '=', jobId)
    .orderBy('h.raised_at')
    // Blocks raised by one statement share its time: then in list order (the item key), so the order is stable.
    .orderBy(sql`substring(h.source_ref from 6)::int`)
    .orderBy('h.id')
    .execute()
  return rows.map((r) => ({
    id: r.id,
    workPackageId: r.scope_id,
    projectId: r.project_id,
    itemKey: r.source_ref.slice('item:'.length),
    state: r.state,
    version: r.version,
    note: r.note,
    raisedBy: { id: r.raised_by, name: r.display_name },
    raisedAt: r.raised_at,
    reviewStartedAt: r.review_started_at,
    resolutionNote: r.resolution_note,
    reviewer: r.reviewer,
    resolvedAt: r.resolved_at,
    cancelReason: r.cancel_reason,
    canceledAt: r.canceled_at,
  }))
}

export const isBlocking = (b: { state: string }) => (BLOCKING_HOLD_STATES as readonly string[]).includes(b.state)

const latestMap = (checks: readonly LatestCheck[], workPackageId: string) =>
  new Map(checks.filter((c) => c.workPackageId === workPackageId).map((c) => [c.itemKey, c.status]))

/** Where one work package's loadout stands, from its pinned list, the latest statements and its task blocks. */
export function packageLoadoutReadiness(
  p: LoadoutPackage,
  checks: readonly LatestCheck[],
  blocks: readonly TaskBlock[],
): LoadoutReadiness {
  return loadoutReadiness({
    content: p.pin?.content ?? null,
    latest: latestMap(checks, p.workPackageId),
    blockingHolds: blocks.filter((b) => b.workPackageId === p.workPackageId && isBlocking(b)).map((b) => b.id),
  })
}

/** Where the loadout of each of the job's work packages stands (in the caller's transaction when given one). */
export async function jobLoadoutReadiness(
  db: Reader,
  jobId: string,
): Promise<{ workPackageId: string; serviceCode: string; readiness: LoadoutReadiness }[]> {
  const [packages, checks, blocks] = [
    await loadoutPackages(db, jobId),
    await latestChecks(db, jobId),
    await taskBlocks(db, jobId),
  ]
  return packages.map((p) => ({
    workPackageId: p.workPackageId,
    serviceCode: p.serviceCode,
    readiness: packageLoadoutReadiness(p, checks, blocks),
  }))
}

/** One loadout_shortage queue item per job while any of its task blocks blocks; resolved when none does. */
export async function syncShortageItem(tx: Tx, jobId: string): Promise<'open' | 'resolved'> {
  const first = await tx
    .selectFrom('work.holds as h')
    .innerJoin('work.work_packages as w', 'w.id', 'h.scope_id')
    .innerJoin('crm.projects as p', 'p.id', 'h.project_id')
    .innerJoin('work.jobs as j', 'j.id', 'w.job_id')
    .select(['h.raised_at', 'p.id as project_id', 'p.reference', 'j.operational_state'])
    .where('h.kind', '=', 'task_block')
    .where('w.job_id', '=', jobId)
    .where('h.state', 'in', [...BLOCKING_HOLD_STATES])
    .orderBy('h.raised_at')
    .limit(1)
    .executeTakeFirst()
  if (!first) {
    await resolveQueueItem(tx, { type: 'loadout_shortage', subjectId: jobId, resolution: 'blocks_cleared' })
    return 'resolved'
  }
  await openQueueItem(tx, {
    type: 'loadout_shortage',
    subjectId: jobId,
    reason: 'critical_shortage',
    projectId: first.project_id,
    reference: first.reference,
    status: first.operational_state,
    assignedStaffId: null,
    openedAt: first.raised_at,
  })
  return 'open'
}
