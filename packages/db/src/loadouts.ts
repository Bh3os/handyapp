// Loadout versions per service (TSK-0071; HH-PKT-05, HH-PKT-06, ENT-WorkPackage, RULE-NO-INVENTED-FACTS).
// - seed/loadouts.json comes from the 26 FACT-INVENTORY-* nodes through tools/import-loadouts.mjs: the vault inventory
//   file's groups, checklist items and review notes verbatim, with the vault file and line. syncLoadouts() loads it in
//   every environment (business configuration, not synthetic data), after the service registry: a new list is version
//   1, changed content (any line, the vault file or its hash) is the next version and supersedes the current one,
//   unchanged content is left alone. A work package keeps the version pinned on it (migration 0063); an import never
//   changes a pin, a confirmation or a task block.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Db, Tx } from './client.js'
import { PACKAGE_ROOT } from './migrate.js'

export const LOADOUTS_SEED_FILE = path.join(PACKAGE_ROOT, 'seed', 'loadouts.json')

/** One entry of seed/loadouts.json; `content` is the verbatim list (see @handyhub/domain LoadoutContent). */
export interface LoadoutSeed {
  id: string
  serviceId: string
  title: string
  sourceFile: string
  sourceSha256: string
  content: { groups: unknown[]; proposed: unknown }
  contentSha256: string
}

export function loadLoadoutSeed(file = LOADOUTS_SEED_FILE): LoadoutSeed[] {
  return (JSON.parse(readFileSync(file, 'utf8')) as { loadouts: LoadoutSeed[] }).loadouts
}

export type LoadoutSyncResult = { created: string[]; versioned: string[]; unchanged: string[] }

/** Loads the loadout versions in one transaction (the caller's, when it holds one). */
export async function syncLoadouts(
  db: Db | Tx,
  loadouts: readonly LoadoutSeed[],
  now = new Date(),
): Promise<LoadoutSyncResult> {
  const result: LoadoutSyncResult = { created: [], versioned: [], unchanged: [] }
  const run = async (trx: Tx | Db) => {
    for (const l of loadouts) {
      const current = await trx
        .selectFrom('catalog.loadout_versions')
        .select(['id', 'title', 'source_file', 'source_sha256', 'content_sha256'])
        .where('inventory_id', '=', l.id)
        .where('superseded_at', 'is', null)
        .forUpdate()
        .executeTakeFirst()
      if (
        current &&
        current.content_sha256 === l.contentSha256 &&
        current.title === l.title &&
        current.source_file === l.sourceFile &&
        current.source_sha256 === l.sourceSha256
      ) {
        result.unchanged.push(l.id)
        continue
      }
      if (current)
        await trx
          .updateTable('catalog.loadout_versions')
          .set({ superseded_at: now })
          .where('id', '=', current.id)
          .execute()
      const last = await trx
        .selectFrom('catalog.loadout_versions')
        .select((eb) => eb.fn.max('version').as('v'))
        .where('inventory_id', '=', l.id)
        .executeTakeFirst()
      await trx
        .insertInto('catalog.loadout_versions')
        .values({
          inventory_id: l.id,
          service_id: l.serviceId,
          version: (last?.v ?? 0) + 1,
          title: l.title,
          source_file: l.sourceFile,
          source_sha256: l.sourceSha256,
          content: JSON.stringify(l.content),
          content_sha256: l.contentSha256,
          created_at: now,
        })
        .execute()
      ;(current ? result.versioned : result.created).push(l.id)
    }
  }
  if (db.isTransaction) await run(db)
  else await db.transaction().execute(run)
  return result
}
