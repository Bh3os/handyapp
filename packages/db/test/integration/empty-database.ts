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
        SELECT quote_ident(n.nspname) || '.' || quote_ident(c.relname) AS name
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind IN ('r', 'p') AND n.nspname NOT IN ('pg_catalog', 'information_schema')
          AND n.nspname NOT LIKE 'pg\\_%' ORDER BY 1`.execute(t.db)
      const names = rows.map((r) => r.name)
      expect(names).toContain('platform.schema_migration')
      expect(names).not.toContain('public.scratch')
      // Tables that hold only what their migrations seed: configuration (0005, 0008) and the owner-worded templates
      // (0008). Every row there must come from a migration; every other table is empty.
      const seeded = await sql<{ by: string }>`
        SELECT changed_by AS by FROM platform.policy_version
        UNION SELECT released_by FROM platform.message_template_versions
        UNION SELECT created_by FROM platform.coverage_zip_datasets
        UNION SELECT created_by FROM platform.coverage_rule_sets
        UNION SELECT actor_process FROM platform.audit_events`.execute(t.db)
      expect(seeded.rows.every((r) => r.by.startsWith('migration:'))).toBe(true)
      const orphanTemplates = await sql<{ n: number }>`
        SELECT count(*)::int AS n FROM platform.message_templates m WHERE NOT EXISTS (
          SELECT 1 FROM platform.message_template_versions v
          WHERE v.message_key = m.message_key AND v.channel = m.channel)`.execute(t.db)
      expect(orphanTemplates.rows[0]?.n).toBe(0)
      const seededTables = [
        'platform.schema_migration',
        'platform.policy_version',
        'platform.message_templates',
        'platform.message_template_versions',
        // TSK-0127 (migration 0067): the owner's ZIP dataset, the rule set derived from it, and their two audit events.
        'platform.coverage_zip_datasets',
        'platform.coverage_zip_entries',
        'platform.coverage_rule_sets',
        'platform.coverage_rules',
        'platform.audit_events',
      ]
      for (const name of names.filter((n) => !seededTables.includes(n))) {
        const count = await sql<{ n: number }>`SELECT count(*)::int AS n FROM ${sql.raw(name)}`.execute(t.db)
        expect(count.rows[0]?.n, name).toBe(0)
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
