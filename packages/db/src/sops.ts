// SOP versions and their pinning on work packages (TSK-0068; HH-PKT-03, HH-WORK-11, ENT-SOPVersion, ENT-WorkPackage,
// OWN-DEC-17, OWN-DEC-108, RULE-NO-INVENTED-FACTS, RULE-SAFETY-GATES).
// - seed/sops.json comes from the 26 SOP-* nodes through tools/import-sops.mjs: every checklist line verbatim, with the
//   vault file and line. syncSops() loads it in every environment (business configuration, not synthetic data), after
//   the service registry: a new SOP is version 1, changed content (any line, the vault file or its hash) is the next
//   version and supersedes the current one, unchanged content is left alone. Every new version is pending competent
//   review; an import never approves anything and never resets the Owner's sign-off of an unchanged version.
// - pinJobSops() pins the current SOP version on each unpinned work package of a job, in the caller's transaction (the
//   approval that creates the job). A service with no SOP version is recorded as NOT CONFIGURED for that package: no
//   checklist is made up, and the package cannot become ready until a version is pinned. An import later pins the new
//   current version on any unpinned package of a job that is still planned. A pinned version is never replaced here:
//   a job keeps the exact version (and hazard and quality digests) it was pinned with.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Db, Tx } from './client.js'
import { PACKAGE_ROOT } from './migrate.js'

export const SOPS_SEED_FILE = path.join(PACKAGE_ROOT, 'seed', 'sops.json')

/** One entry of seed/sops.json; `content` is the verbatim checklist (see @handyhub/domain SopContent). */
export interface SopSeed {
  id: string
  serviceId: string
  title: string
  sourceFile: string
  sourceSha256: string
  reviewState: 'pending_competent_review'
  spanishStatus: 'pending'
  content: { stages: unknown[]; stopWork: unknown[]; openQuestions: unknown[] }
  contentSha256: string
  hazardSha256: string
  qualitySha256: string
}

export function loadSopSeed(file = SOPS_SEED_FILE): SopSeed[] {
  return (JSON.parse(readFileSync(file, 'utf8')) as { sops: SopSeed[] }).sops
}

export type SopSyncResult = { created: string[]; versioned: string[]; unchanged: string[]; pinned: number }

/** Loads the SOP versions in one transaction, then pins them on the unpinned packages of planned jobs. */
export async function syncSops(db: Db | Tx, sops: readonly SopSeed[], now = new Date()): Promise<SopSyncResult> {
  const result: SopSyncResult = { created: [], versioned: [], unchanged: [], pinned: 0 }
  const run = async (trx: Tx | Db) => {
    for (const s of sops) {
      const current = await trx
        .selectFrom('catalog.sop_versions')
        .select(['id', 'version', 'title', 'source_file', 'source_sha256', 'content_sha256', 'row_version'])
        .where('sop_id', '=', s.id)
        .where('review_state', '<>', 'superseded')
        .forUpdate()
        .executeTakeFirst()
      if (
        current &&
        current.content_sha256 === s.contentSha256 &&
        current.title === s.title &&
        current.source_file === s.sourceFile &&
        current.source_sha256 === s.sourceSha256
      ) {
        result.unchanged.push(s.id)
        continue
      }
      if (current)
        await trx
          .updateTable('catalog.sop_versions')
          .set({ review_state: 'superseded', superseded_at: now, row_version: current.row_version + 1 })
          .where('id', '=', current.id)
          .execute()
      const last = await trx
        .selectFrom('catalog.sop_versions')
        .select((eb) => eb.fn.max('version').as('v'))
        .where('sop_id', '=', s.id)
        .executeTakeFirst()
      await trx
        .insertInto('catalog.sop_versions')
        .values({
          sop_id: s.id,
          service_id: s.serviceId,
          version: (last?.v ?? 0) + 1,
          title: s.title,
          source_file: s.sourceFile,
          source_sha256: s.sourceSha256,
          content: JSON.stringify(s.content),
          content_sha256: s.contentSha256,
          hazard_sha256: s.hazardSha256,
          quality_sha256: s.qualitySha256,
          created_at: now,
        })
        .execute()
      ;(current ? result.versioned : result.created).push(s.id)
    }
    // Packages of jobs that are still planned and were NOT CONFIGURED when their job was created.
    const unpinned = await trx
      .selectFrom('work.work_packages')
      .select('job_id')
      .distinct()
      .where('job_id', 'is not', null)
      .where('sop_version_id', 'is', null)
      .where('state', '=', 'planned')
      .execute()
    for (const u of unpinned)
      result.pinned += (await pinJobSops(trx, { jobId: u.job_id as string, source: 'import', at: now })).pinned.length
  }
  if (db.isTransaction) await run(db)
  else await db.transaction().execute(run)
  return result
}

export type PinOutcome = { workPackageId: string; serviceId: string; sopVersionId: string }
export type PinResult = { pinned: PinOutcome[]; notConfigured: { workPackageId: string; serviceId: string }[] }

/**
 * Pins the current SOP version of each service on the job's unpinned, planned work packages, in the caller's
 * transaction. `approval` records NOT CONFIGURED for a package whose service has no SOP version; `import` leaves such a
 * package as it is (its NOT CONFIGURED record already stands).
 */
export async function pinJobSops(
  tx: Db | Tx,
  input: { jobId: string; source: 'approval' | 'import'; at: Date },
): Promise<PinResult> {
  const out: PinResult = { pinned: [], notConfigured: [] }
  const packages = await tx
    .selectFrom('work.work_packages')
    .select(['id', 'project_id', 'service_id', 'version'])
    .where('job_id', '=', input.jobId)
    .where('sop_version_id', 'is', null)
    .where('state', '=', 'planned')
    .orderBy('position')
    .forUpdate()
    .execute()
  for (const p of packages) {
    const v = await tx
      .selectFrom('catalog.sop_versions')
      .select(['id', 'content_sha256', 'hazard_sha256', 'quality_sha256'])
      .where('service_id', '=', p.service_id)
      .where('review_state', '<>', 'superseded')
      .forShare()
      .executeTakeFirst()
    const pin = {
      work_package_id: p.id,
      project_id: p.project_id,
      job_id: input.jobId,
      service_id: p.service_id,
      source: input.source,
      pinned_at: input.at,
    }
    if (!v) {
      if (input.source === 'approval') {
        await tx
          .insertInto('work.work_package_sop_pins')
          .values({ ...pin, outcome: 'not_configured' })
          .execute()
        out.notConfigured.push({ workPackageId: p.id, serviceId: p.service_id })
      }
      continue
    }
    await tx
      .updateTable('work.work_packages')
      .set({ sop_version_id: v.id, sop_pinned_at: input.at, version: p.version + 1 })
      .where('id', '=', p.id)
      .execute()
    await tx
      .insertInto('work.work_package_sop_pins')
      .values({
        ...pin,
        outcome: 'pinned',
        sop_version_id: v.id,
        content_sha256: v.content_sha256,
        hazard_sha256: v.hazard_sha256,
        quality_sha256: v.quality_sha256,
      })
      .execute()
    out.pinned.push({ workPackageId: p.id, serviceId: p.service_id, sopVersionId: v.id })
  }
  return out
}
