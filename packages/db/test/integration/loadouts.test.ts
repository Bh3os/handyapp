// Loadout versions against PostgreSQL 16 (TSK-0071; HH-PKT-05, ENT-WorkPackage, RULE-NO-INVENTED-FACTS): the 26 lists
// load verbatim, a repeated load changes nothing, changed content is a new version, and a version never changes.
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadLoadoutSeed, loadServiceSeed, syncLoadouts, syncServices } from '../../src/index.js'
import { createTestDatabase, type TestDatabase } from '../../src/testing.js'

let t: TestDatabase
const seed = loadLoadoutSeed()

beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
})
afterAll(async () => {
  await t?.drop()
})

describe('loadout versions (TSK-0071, HH-PKT-05)', () => {
  it('[HH-PKT-05] imports the 26 lists unchanged; a repeated load changes nothing', async () => {
    const first = await syncLoadouts(t.db, seed)
    expect(first.created).toHaveLength(26)
    const rows = await t.db.selectFrom('catalog.loadout_versions').selectAll().orderBy('inventory_id').execute()
    expect(rows).toHaveLength(26)
    for (const [i, row] of rows.entries()) {
      const s = seed[i]
      expect(row).toMatchObject({
        inventory_id: s?.id,
        service_id: s?.serviceId,
        version: 1,
        title: s?.title,
        source_file: s?.sourceFile,
        content_sha256: s?.contentSha256,
        superseded_at: null,
      })
      expect(row.content).toEqual(s?.content)
    }
    expect(await syncLoadouts(t.db, seed)).toEqual({ created: [], versioned: [], unchanged: seed.map((s) => s.id) })
  })

  it('[HH-PKT-05] changed content is the next version; the old one is superseded and final; nothing is deleted', async () => {
    const changed = seed.map((s) => (s.id === 'FACT-INVENTORY-HI-01' ? { ...s, contentSha256: 'e'.repeat(64) } : s))
    expect((await syncLoadouts(t.db, changed)).versioned).toEqual(['FACT-INVENTORY-HI-01'])
    const versions = await t.db
      .selectFrom('catalog.loadout_versions')
      .select(['id', 'version', 'superseded_at'])
      .where('inventory_id', '=', 'FACT-INVENTORY-HI-01')
      .orderBy('version')
      .execute()
    expect(versions.map((v) => [v.version, v.superseded_at !== null])).toEqual([
      [1, true],
      [2, false],
    ])
    const old = versions[0]?.id as string
    await expect(
      sql`UPDATE catalog.loadout_versions SET content = '{"groups":[{}]}' WHERE id = ${old}`.execute(t.db),
    ).rejects.toThrow(/immutable/)
    await expect(
      sql`UPDATE catalog.loadout_versions SET superseded_at = NULL WHERE id = ${old}`.execute(t.db),
    ).rejects.toThrow(/final/)
    await expect(sql`DELETE FROM catalog.loadout_versions WHERE id = ${old}`.execute(t.db)).rejects.toThrow(
      /never deleted/,
    )
    // Back to the seed: a third version, the seed's content again.
    expect((await syncLoadouts(t.db, seed)).versioned).toEqual(['FACT-INVENTORY-HI-01'])
  })
})
