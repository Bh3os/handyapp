// Service registry against PostgreSQL 16 (TSK-0019, TSK-0132; HH-SVC-01, HH-SVC-02, HH-CUS-02, OWN-DEC-84,
// OWN-DEC-180).
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  isQualityReviewed,
  loadServiceSeed,
  isPublicServiceSlug,
  publicServices,
  registryServices,
  runSeeders,
  SEEDERS,
  syncServices,
} from '../../src/index.js'
import type { ServiceSeed } from '../../src/services.js'
import { createTestDatabase, type TestDatabase } from '../../src/testing.js'

let t: TestDatabase
const seed = loadServiceSeed()
// The same registry before the quality review: no reviewed content, every service a draft (synthetic variant).
const unreviewed = seed.map((s) => ({ ...s, publicStatus: 'draft' as const, content: { description: null } }))

beforeAll(async () => {
  t = await createTestDatabase()
})
afterAll(async () => {
  await t?.drop()
})

describe('service registry (TSK-0019, HH-SVC-01, HH-SVC-02)', () => {
  it('[HH-SVC-01] loads the 26 services once; a repeated load changes nothing', async () => {
    expect(seed.every(isQualityReviewed)).toBe(true)
    const first = await syncServices(t.db, unreviewed)
    expect(first.created).toHaveLength(26)
    const again = await syncServices(t.db, unreviewed)
    expect(again).toEqual({ created: [], versioned: [], unchanged: seed.map((s) => s.id) })
    const all = await registryServices(t.db)
    expect(all.map((s) => s.code)).toEqual(seed.map((s) => s.code))
    expect(all.every((s) => s.version === 1 && s.public_status === 'draft')).toBe(true)
  })

  it('[HH-SVC-02][OWN-DEC-84] an unpublished service is absent from public reads in every environment', async () => {
    for (const env of ['local', 'ci', 'staging', 'production'] as const) {
      expect(await publicServices(t.db, env), env).toEqual([])
    }
    await t.db.updateTable('catalog.services').set({ public_status: 'staging' }).where('id', '=', 'SVC-DW-01').execute()
    expect((await publicServices(t.db, 'staging')).map((s) => s.id)).toEqual(['SVC-DW-01'])
    expect(await publicServices(t.db, 'production')).toEqual([])
  })

  it('[HH-CUS-02][OWN-DEC-180] the quality-reviewed versions are approved by OWN-DEC-180 and published everywhere', async () => {
    const result = await syncServices(t.db, seed)
    expect(result.versioned).toHaveLength(26)
    const services = await t.db.selectFrom('catalog.services').selectAll().orderBy('id').execute()
    expect(services.every((s) => s.public_status === 'published' && s.published_version === 2)).toBe(true)
    const versions = await t.db
      .selectFrom('catalog.service_versions')
      .select(['service_id', 'version', 'approved_by', 'approved_at'])
      .orderBy('service_id')
      .orderBy('version')
      .execute()
    expect(versions.filter((v) => v.version === 1).every((v) => v.approved_at === null)).toBe(true)
    expect(versions.filter((v) => v.version === 2).every((v) => v.approved_by === 'OWN-DEC-180' && v.approved_at)).toBe(
      true,
    )
    for (const env of ['local', 'ci', 'staging', 'production'] as const) {
      const listed = await publicServices(t.db, env)
      expect(listed, env).toHaveLength(26)
      expect(
        listed.every((s) => s.version === 2 && typeof s.description === 'string'),
        env,
      ).toBe(true)
    }
    expect(await isPublicServiceSlug(t.db, 'production', 'interior-painting')).toBe(true)
    // A repeated load changes nothing; the approval is recorded once.
    expect((await syncServices(t.db, seed)).unchanged).toHaveLength(26)
  })

  it('[HH-SVC-01][OWN-DEC-180] unreviewed changed content becomes a new version that production never shows', async () => {
    const changed = seed.map((s): ServiceSeed =>
      s.id === 'SVC-DW-01'
        ? {
            ...s,
            publicStatus: 'draft' as const,
            content: {
              ...s.content,
              description: 'Synthetic unreviewed text.',
              review: { decision: 'none', task: 'none', reviewedOn: 'none' },
            },
          }
        : s,
    )
    const result = await syncServices(t.db, changed)
    expect(result.versioned).toEqual(['SVC-DW-01'])
    expect(result.unchanged).toHaveLength(25)
    const versions = await t.db
      .selectFrom('catalog.service_versions')
      .select(['version', 'approved_by'])
      .where('service_id', '=', 'SVC-DW-01')
      .orderBy('version')
      .execute()
    expect(versions).toEqual([
      { version: 1, approved_by: null },
      { version: 2, approved_by: 'OWN-DEC-180' },
      { version: 3, approved_by: null },
    ])
    const dw = async (env: 'staging' | 'production') =>
      (await publicServices(t.db, env)).find((s) => s.id === 'SVC-DW-01')
    expect((await dw('production'))?.version).toBe(2)
    expect((await dw('staging'))?.version).toBe(3)
    // A sync never resets the publication: the published version stays the reviewed one.
    const svc = await t.db.selectFrom('catalog.services').selectAll().where('id', '=', 'SVC-DW-01').executeTakeFirst()
    expect(svc).toMatchObject({ public_status: 'published', published_version: 2, current_version: 3 })
    // Back to the reviewed content: a new reviewed version, approved and published again.
    expect((await syncServices(t.db, seed)).versioned).toEqual(['SVC-DW-01'])
    expect((await dw('production'))?.version).toBe(4)
  })

  it('[HH-CUS-02][OWN-DEC-180] production never shows a published version that carries no approval', async () => {
    await t.db.updateTable('catalog.services').set({ published_version: 1 }).where('id', '=', 'SVC-PT-01').execute()
    expect((await publicServices(t.db, 'production')).some((s) => s.id === 'SVC-PT-01')).toBe(false)
    expect(await isPublicServiceSlug(t.db, 'production', 'interior-painting')).toBe(false)
    expect(await isPublicServiceSlug(t.db, 'staging', 'interior-painting')).toBe(true)
    await t.db.updateTable('catalog.services').set({ published_version: 2 }).where('id', '=', 'SVC-PT-01').execute()
    expect(await isPublicServiceSlug(t.db, 'production', 'interior-painting')).toBe(true)
  })

  it('[HH-SVC-01] versions are immutable and never deleted; codes never change', async () => {
    await expect(
      t.db
        .updateTable('catalog.service_versions')
        .set({ name: 'Edited in place' })
        .where('service_id', '=', 'SVC-CL-01')
        .execute(),
    ).rejects.toThrow(/immutable/)
    await expect(
      t.db.deleteFrom('catalog.service_versions').where('service_id', '=', 'SVC-CL-01').execute(),
    ).rejects.toThrow(/never deleted/)
    await expect(
      t.db
        .updateTable('catalog.service_versions')
        .set({ approved_by: 'someone-else' })
        .where('service_id', '=', 'SVC-DW-01')
        .where('version', '=', 2)
        .execute(),
    ).rejects.toThrow(/immutable/)
    const renamed = seed.map((s) => (s.id === 'SVC-CL-01' ? { ...s, code: 'CL-99' } : s))
    await expect(syncServices(t.db, renamed)).rejects.toThrow(/code never changes/)
    await expect(
      sql`insert into catalog.services (id, code, category, slug, current_version) values ('SVC-XX-01', 'XX-02', 'cleaning', 'x', 1)`.execute(
        t.db,
      ),
    ).rejects.toThrow()
  })

  it('[HH-SVC-02] a service cannot be published without an approved version reference', async () => {
    await expect(
      t.db
        .updateTable('catalog.services')
        .set({ public_status: 'published', published_version: null })
        .where('id', '=', 'SVC-CL-02')
        .execute(),
    ).rejects.toThrow()
  })

  it('[HH-SVC-01][OWN-DEC-180] the seeders load the registry with the reviewed versions published', async () => {
    const fresh = await createTestDatabase()
    try {
      await runSeeders(fresh.db, SEEDERS, { environment: 'ci' })
      const all = await registryServices(fresh.db)
      expect(all).toHaveLength(26)
      expect(all.every((s) => s.public_status === 'published' && s.version === 1)).toBe(true)
      expect(await publicServices(fresh.db, 'production')).toHaveLength(26)
    } finally {
      await fresh.drop()
    }
  })
})
