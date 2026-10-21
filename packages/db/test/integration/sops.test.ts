// SOP versions against PostgreSQL 16 (TSK-0068; HH-PKT-03, ENT-SOPVersion, ENT-WorkPackage, OWN-DEC-17,
// RULE-NO-INVENTED-FACTS, RULE-SAFETY-GATES). Reviewer names are synthetic.
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadServiceSeed, loadSopSeed, runSeeders, SEEDERS, syncServices, syncSops } from '../../src/index.js'
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
        spanish_status: 'pending',
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
    expect(SEEDERS.map((s) => s.name)).toEqual(['service-registry', 'sop-versions'])
    const fresh = await createTestDatabase()
    try {
      await runSeeders(fresh.db, SEEDERS, { environment: 'ci' })
      const n = await fresh.db
        .selectFrom('catalog.sop_versions')
        .select(sql<number>`count(*)::int`.as('n'))
        .executeTakeFirstOrThrow()
      expect(n.n).toBe(26)
    } finally {
      await fresh.drop()
    }
  })
})
