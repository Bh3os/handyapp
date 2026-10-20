// Service registry against PostgreSQL 16 (TSK-0019; HH-SVC-01, HH-SVC-02, OWN-DEC-84).
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  loadServiceSeed,
  publicServices,
  registryServices,
  runSeeders,
  SEEDERS,
  syncServices,
} from '../../src/index.js'
import { createTestDatabase, type TestDatabase } from '../../src/testing.js'

let t: TestDatabase
const seed = loadServiceSeed()

beforeAll(async () => {
  t = await createTestDatabase()
})
afterAll(async () => {
  await t?.drop()
})

describe('service registry (TSK-0019, HH-SVC-01, HH-SVC-02)', () => {
  it('[HH-SVC-01] loads the 26 services once; a repeated load changes nothing', async () => {
    const first = await syncServices(t.db, seed)
    expect(first.created).toHaveLength(26)
    const again = await syncServices(t.db, seed)
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

  it('[HH-SVC-01] changing content creates a new version; the approved version stays in production', async () => {
    await t.db
      .updateTable('catalog.service_versions')
      .set({ approved_at: new Date('2026-10-20T12:00:00Z'), approved_by: 'owner-synthetic' })
      .where('service_id', '=', 'SVC-DW-01')
      .where('version', '=', 1)
      .execute()
    await t.db
      .updateTable('catalog.services')
      .set({ public_status: 'published', published_version: 1 })
      .where('id', '=', 'SVC-DW-01')
      .execute()

    const changed = seed.map((s) => (s.id === 'SVC-DW-01' ? { ...s, aliases: [...s.aliases, 'Synthetic alias'] } : s))
    const result = await syncServices(t.db, changed)
    expect(result.versioned).toEqual(['SVC-DW-01'])
    expect(result.unchanged).toHaveLength(25)

    const versions = await t.db
      .selectFrom('catalog.service_versions')
      .select(['version', 'aliases'])
      .where('service_id', '=', 'SVC-DW-01')
      .orderBy('version')
      .execute()
    expect(versions.map((v) => v.version)).toEqual([1, 2])
    expect((await publicServices(t.db, 'production'))[0]?.version).toBe(1)
    expect((await publicServices(t.db, 'staging'))[0]?.version).toBe(2)
    // A sync never resets the owner's publication decision.
    const svc = await t.db.selectFrom('catalog.services').selectAll().where('id', '=', 'SVC-DW-01').executeTakeFirst()
    expect(svc).toMatchObject({ public_status: 'published', published_version: 1, current_version: 2 })
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
        .where('version', '=', 1)
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
      t.db.updateTable('catalog.services').set({ public_status: 'published' }).where('id', '=', 'SVC-CL-02').execute(),
    ).rejects.toThrow()
  })

  it('[HH-SVC-01] the seeders load the registry', async () => {
    const fresh = await createTestDatabase()
    try {
      await runSeeders(fresh.db, SEEDERS, { environment: 'ci' })
      expect(await registryServices(fresh.db)).toHaveLength(26)
    } finally {
      await fresh.drop()
    }
  })
})
