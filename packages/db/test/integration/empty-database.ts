// Shared by empty-database-1 and -2.test.ts: each file gets its own migrated database and must not see the other's
// writes, whichever runs first (TSK-0004).
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { listMigrations } from '../../src/index.js'
import { createTestDatabase, type TestDatabase } from '../../src/testing.js'

export function emptyDatabaseSuite(fileLabel: string) {
  let t: TestDatabase
  beforeAll(async () => {
    t = await createTestDatabase()
  })
  afterAll(async () => {
    await t.drop()
  })

  describe(`fresh database per test file, ${fileLabel} (TSK-0004, HH-ARC-01)`, () => {
    it("starts fully migrated with no rows outside the migration table and no other file's writes", async () => {
      const { rows } = await sql<{ name: string }>`
        SELECT n.nspname || '.' || c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind IN ('r', 'p') AND n.nspname NOT IN ('pg_catalog', 'information_schema')
          AND n.nspname NOT LIKE 'pg\\_%' ORDER BY 1`.execute(t.db)
      // Later migrations add tables (TSK-0019 on); a fresh database holds rows only in the migration table.
      expect(rows.map((r) => r.name)).toContain('platform.schema_migration')
      for (const { name } of rows.filter((r) => r.name !== 'platform.schema_migration')) {
        const count = await sql<{ n: string }>`SELECT count(*) AS n FROM ${sql.table(name)}`.execute(t.db)
        expect(count.rows[0]?.n, name).toBe('0')
      }
      const applied = await t.db.selectFrom('platform.schema_migration').select('file').orderBy('version').execute()
      expect(applied.map((r) => r.file)).toEqual((await listMigrations()).map((m) => m.file))
      expect(t.name).toMatch(/^hh_test_[0-9a-f]{16}$/)
      const current = await sql<{ db: string }>`SELECT current_database() AS db`.execute(t.db)
      expect(current.rows[0]?.db).toBe(t.name)
    })

    it("keeps this file's writes inside its own database", async () => {
      await sql`CREATE TABLE public.scratch (file text NOT NULL)`.execute(t.db)
      await sql`INSERT INTO public.scratch VALUES (${fileLabel})`.execute(t.db)
      const { rows } = await sql<{ file: string }>`SELECT file FROM public.scratch`.execute(t.db)
      expect(rows).toEqual([{ file: fileLabel }])
    })
  })
}
