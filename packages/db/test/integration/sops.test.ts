// SOP versions against PostgreSQL 16 (TSK-0068; HH-PKT-03, ENT-SOPVersion, ENT-WorkPackage, OWN-DEC-17,
// RULE-NO-INVENTED-FACTS, RULE-SAFETY-GATES). Reviewer names are synthetic.
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  loadServiceSeed,
  loadSopSeed,
  loadSpanishSopSeed,
  runSeeders,
  SEEDERS,
  syncServices,
  syncSops,
  syncSpanishSops,
  type SpanishSopSeed,
} from '../../src/index.js'
import { createTestDatabase, type TestDatabase } from '../../src/testing.js'

let t: TestDatabase
const seed = loadSopSeed()

beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
})
afterAll(async () => {
  await t?.drop()
})

const current = (sopId: string) =>
  t.db
    .selectFrom('catalog.sop_versions')
    .selectAll()
    .where('sop_id', '=', sopId)
    .where('review_state', '<>', 'superseded')
    .executeTakeFirstOrThrow()

describe('SOP versions (TSK-0068, HH-PKT-03, ENT-SOPVersion)', () => {
  it('[HH-PKT-03] imports the 26 SOP versions unchanged, pending competent review; a repeated load changes nothing', async () => {
    const first = await syncSops(t.db, seed)
    expect(first.created).toHaveLength(26)
    expect(first.pinned).toBe(0)
    const rows = await t.db.selectFrom('catalog.sop_versions').selectAll().orderBy('sop_id').execute()
    expect(rows).toHaveLength(26)
    for (const [i, row] of rows.entries()) {
      const s = seed[i]
      expect(row).toMatchObject({
        sop_id: s?.id,
        service_id: s?.serviceId,
        version: 1,
        title: s?.title,
        source_file: s?.sourceFile,
        review_state: 'pending_competent_review',
        content_sha256: s?.contentSha256,
        hazard_sha256: s?.hazardSha256,
        quality_sha256: s?.qualitySha256,
        signed_off_at: null,
      })
      // The stored checklist is the seed's, line for line.
      expect(row.content).toEqual(s?.content)
    }
    const again = await syncSops(t.db, seed)
    expect(again).toEqual({ created: [], versioned: [], unchanged: seed.map((s) => s.id), pinned: 0 })
  })

  it('[OWN-DEC-17] a version is immutable, never deleted, and never imported as approved', async () => {
    const v = await current('SOP-HI-01')
    await expect(
      sql`UPDATE catalog.sop_versions SET content = '{"stages":[],"stopWork":[],"openQuestions":[]}' WHERE id = ${v.id}`.execute(
        t.db,
      ),
    ).rejects.toThrow()
    await expect(
      sql`UPDATE catalog.sop_versions SET title = 'Synthetic other title', row_version = row_version + 1 WHERE id = ${v.id}`.execute(
        t.db,
      ),
    ).rejects.toThrow(/immutable/)
    await expect(sql`DELETE FROM catalog.sop_versions WHERE id = ${v.id}`.execute(t.db)).rejects.toThrow(
      /never deleted/,
    )
    // Approved needs the sign-off record.
    await expect(
      sql`UPDATE catalog.sop_versions SET review_state = 'approved', row_version = row_version + 1 WHERE id = ${v.id}`.execute(
        t.db,
      ),
    ).rejects.toThrow()
    await expect(
      sql`INSERT INTO catalog.sop_versions (sop_id, service_id, version, title, source_file, source_sha256, content,
            content_sha256, hazard_sha256, quality_sha256, review_state)
          SELECT sop_id, service_id, 99, title, source_file, source_sha256, content, content_sha256, hazard_sha256,
            quality_sha256, 'approved' FROM catalog.sop_versions WHERE sop_id = 'SOP-HI-01'`.execute(t.db),
    ).rejects.toThrow(/pending competent review/)
  })

  it('[OWN-DEC-17] a recorded sign-off is kept as entered and never changed', async () => {
    const v = await current('SOP-HI-02')
    const owner = await sql<{ id: string }>`
      INSERT INTO identity.staff_users (email, display_name)
      VALUES ('owner-sops-db@example.test', 'Synthetic Owner') RETURNING id`.execute(t.db)
    const ownerId = owner.rows[0]?.id as string
    await t.db
      .updateTable('catalog.sop_versions')
      .set({
        review_state: 'approved',
        reviewer_name: 'Synthetic Reviewer',
        reviewer_qualification: 'Synthetic qualification',
        review_note: 'Synthetic: reviewed this exact version.',
        signed_off_by: ownerId,
        signed_off_at: new Date(),
        row_version: v.row_version + 1,
      })
      .where('id', '=', v.id)
      .execute()
    await expect(
      t.db
        .updateTable('catalog.sop_versions')
        .set({ reviewer_name: 'Synthetic Someone Else', row_version: v.row_version + 2 })
        .where('id', '=', v.id)
        .execute(),
    ).rejects.toThrow(/never changed/)
    await expect(
      t.db
        .updateTable('catalog.sop_versions')
        .set({ review_state: 'pending_competent_review', row_version: v.row_version + 2 })
        .where('id', '=', v.id)
        .execute(),
    ).rejects.toThrow()
  })

  it('[HH-PKT-03] changed content is the next version pending review; the old one is superseded and kept', async () => {
    const before = await current('SOP-HI-02')
    expect(before.review_state).toBe('approved')
    const changed = seed.map((s) =>
      s.id === 'SOP-HI-02' ? { ...s, title: `${s.title} (synthetic change)`, contentSha256: 'a'.repeat(64) } : s,
    )
    const r = await syncSops(t.db, changed)
    expect(r.versioned).toEqual(['SOP-HI-02'])
    const after = await current('SOP-HI-02')
    expect(after).toMatchObject({ version: 2, review_state: 'pending_competent_review', signed_off_at: null })
    const old = await t.db
      .selectFrom('catalog.sop_versions')
      .selectAll()
      .where('id', '=', before.id)
      .executeTakeFirstOrThrow()
    // The superseded version keeps its sign-off record; a superseded version is final.
    expect(old).toMatchObject({ review_state: 'superseded', reviewer_name: 'Synthetic Reviewer' })
    expect(old.superseded_at).not.toBeNull()
    await expect(
      t.db
        .updateTable('catalog.sop_versions')
        .set({ review_state: 'approved', row_version: old.row_version + 1 })
        .where('id', '=', old.id)
        .execute(),
    ).rejects.toThrow(/final/)
    // Back to the committed content: a third version, again pending review.
    const back = await syncSops(t.db, seed)
    expect(back.versioned).toEqual(['SOP-HI-02'])
    expect((await current('SOP-HI-02')).version).toBe(3)
  })

  it('[HH-PKT-03] one SOP per service, and only its own service', async () => {
    await expect(
      sql`INSERT INTO catalog.sop_versions (sop_id, service_id, version, title, source_file, source_sha256, content,
            content_sha256, hazard_sha256, quality_sha256)
          SELECT 'SOP-HI-03', 'SVC-HI-04', 50, title, source_file, source_sha256, content, content_sha256,
            hazard_sha256, quality_sha256 FROM catalog.sop_versions WHERE sop_id = 'SOP-HI-04' LIMIT 1`.execute(t.db),
    ).rejects.toThrow()
    await expect(
      sql`INSERT INTO catalog.sop_versions (sop_id, service_id, version, title, source_file, source_sha256, content,
            content_sha256, hazard_sha256, quality_sha256)
          SELECT sop_id, service_id, 50, title, source_file, source_sha256, content, content_sha256,
            hazard_sha256, quality_sha256 FROM catalog.sop_versions WHERE sop_id = 'SOP-HI-04' LIMIT 1`.execute(t.db),
    ).rejects.toThrow(/sop_versions_current/)
  })

  it('the seeders load the SOP versions after the service registry', async () => {
    expect(SEEDERS.map((s) => s.name)).toEqual([
      'service-registry',
      'sop-versions',
      'sop-spanish-versions',
      'loadout-versions',
    ])
    const fresh = await createTestDatabase()
    try {
      await runSeeders(fresh.db, SEEDERS, { environment: 'ci' })
      const n = await fresh.db
        .selectFrom('catalog.sop_versions')
        .select(sql<number>`count(*)::int`.as('n'))
        .executeTakeFirstOrThrow()
      expect(n.n).toBe(26)
      const es = await fresh.db
        .selectFrom('catalog.sop_spanish_versions')
        .select(sql<number>`count(*)::int`.as('n'))
        .executeTakeFirstOrThrow()
      expect(es.n).toBe(loadSpanishSopSeed().length)
    } finally {
      await fresh.drop()
    }
  })
})

describe('Spanish SOP versions (TSK-0103, HH-LANG-04, HH-PKT-04)', () => {
  const spanishSeed = loadSpanishSopSeed()
  const hi05 = spanishSeed.find((s) => s.sopId === 'SOP-HI-05') as SpanishSopSeed
  const status = async (versionId: string) =>
    (await sql<{ s: string }>`SELECT catalog.sop_spanish_status(${versionId}::uuid) AS s`.execute(t.db)).rows[0]?.s

  it('[HH-PKT-04] records each comparison against the English version it was made for; a repeated load changes nothing', async () => {
    expect(hi05.releaseStatus).toBe('ai_reviewed')
    const v = await current('SOP-HI-05')
    expect(await status(v.id)).toBe('pending')
    const r = await syncSpanishSops(t.db, [hi05])
    expect(r).toEqual({ recorded: ['SOP-HI-05'], unchanged: [], unmatched: [] })
    expect(await status(v.id)).toBe('ai_reviewed')
    const row = await t.db
      .selectFrom('catalog.sop_spanish_versions')
      .selectAll()
      .where('sop_version_id', '=', v.id)
      .executeTakeFirstOrThrow()
    expect(row).toMatchObject({
      sop_id: 'SOP-HI-05',
      english_content_sha256: v.content_sha256,
      translation_method: 'ai_translation',
      comparison_tool: hi05.check.tool,
      release_status: 'ai_reviewed',
    })
    expect(row.results).toEqual(hi05.check.results)
    expect(row.content).toEqual(hi05.content)
    expect(await syncSpanishSops(t.db, [hi05])).toEqual({ recorded: [], unchanged: ['SOP-HI-05'], unmatched: [] })
  })

  it('[HH-LANG-04] a new English version stays pending in Spanish until it is compared again', async () => {
    const stale = { ...hi05, englishContentSha256: 'd'.repeat(64) }
    expect(await syncSpanishSops(t.db, [stale])).toEqual({ recorded: [], unchanged: [], unmatched: ['SOP-HI-05'] })
    // Another English version of the same SOP has no Spanish row: pending.
    const other = await current('SOP-HI-06')
    expect(await status(other.id)).toBe('pending')
  })

  it('[HH-LANG-04][T45] the database refuses a release without a passing comparison, and keeps comparisons as made', async () => {
    const v = await current('SOP-HI-05')
    const insert = (over: Record<string, unknown>) =>
      t.db
        .insertInto('catalog.sop_spanish_versions')
        .values({
          sop_version_id: v.id,
          sop_id: 'SOP-HI-05',
          english_content_sha256: v.content_sha256,
          title: 'Synthetic',
          content: JSON.stringify(hi05.content),
          content_sha256: 'e'.repeat(64),
          translation_sha256: 'f'.repeat(64),
          comparison_tool: 'compare-safety-es@1',
          checked_on: '2026-10-23',
          results: JSON.stringify(hi05.check.results),
          release_status: 'ai_reviewed',
          ...over,
        })
        .execute()
    // A failed category, a recorded problem or an ambiguous flag is never released.
    await expect(insert({ results: JSON.stringify({ ...hi05.check.results, warnings: 'fail' }) })).rejects.toThrow(
      /sop_spanish_versions_release/,
    )
    await expect(insert({ ambiguous: JSON.stringify([{ item: '3.2', note: 'Synthetic ambiguity' }]) })).rejects.toThrow(
      /sop_spanish_versions_release/,
    )
    await expect(
      insert({ problems: JSON.stringify([{ category: 'ppe', item: '3.2', detail: 'synthetic' }]) }),
    ).rejects.toThrow(/sop_spanish_versions_release/)
    // A category missing from the results.
    const five = Object.fromEntries(Object.entries(hi05.check.results).filter(([c]) => c !== 'stop_work'))
    await expect(insert({ results: JSON.stringify(five), release_status: 'pending' })).rejects.toThrow()
    // Compared with another English text than the version it names.
    await expect(insert({ english_content_sha256: 'a'.repeat(64) })).rejects.toThrow(/exact English version/)
    // A failed comparison is kept as pending, and the latest comparison decides.
    await insert({
      results: JSON.stringify({ ...hi05.check.results, measurements_units: 'fail' }),
      problems: JSON.stringify([{ category: 'measurements_units', item: '3.3', detail: 'synthetic' }]),
      release_status: 'pending',
    })
    expect(await status(v.id)).toBe('pending')
    await expect(
      sql`UPDATE catalog.sop_spanish_versions SET release_status = 'ai_reviewed' WHERE sop_version_id = ${v.id}`.execute(
        t.db,
      ),
    ).rejects.toThrow(/kept as compared/)
    await expect(
      sql`DELETE FROM catalog.sop_spanish_versions WHERE sop_version_id = ${v.id}`.execute(t.db),
    ).rejects.toThrow(/kept as compared/)
  })
})
