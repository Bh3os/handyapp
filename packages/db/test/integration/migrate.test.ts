// The runner against a real PostgreSQL 16: each test gets an empty database without migrations.
import { mkdtemp, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import pg from 'pg'
import { afterEach, describe, expect, it } from 'vitest'
import { listMigrations, migrate, MigrationError, pendingMigrations } from '../../src/index.js'
import { createTestDatabase, type TestDatabase } from '../../src/testing.js'

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn()
})

async function emptyDb(): Promise<TestDatabase> {
  const t = await createTestDatabase({ migrated: false })
  cleanup.push(t.drop)
  return t
}
async function folder(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'hh-migrations-'))
  cleanup.push(() => rm(dir, { recursive: true, force: true }))
  await write(dir, files)
  return dir
}
async function write(dir: string, files: Record<string, string>) {
  for (const [name, sql] of Object.entries(files)) await writeFile(path.join(dir, name), sql)
}
async function query<T extends pg.QueryResultRow>(url: string, sql: string): Promise<T[]> {
  const c = new pg.Client({ connectionString: url })
  await c.connect()
  try {
    return (await c.query<T>(sql)).rows
  } finally {
    await c.end()
  }
}
const recorded = (url: string) =>
  query<{ version: string; file: string }>(
    url,
    'SELECT version, file FROM platform.schema_migration ORDER BY applied_at, version',
  )

describe('migration runner on PostgreSQL 16 (TSK-0004, HH-ARC-01)', () => {
  it('applies migrations in version order, once each, and records them in the checksum table', async () => {
    const t = await emptyDb()
    // 0002 and 0003 only work after 0001 created the table: a wrong order fails the run.
    const dir = await folder({
      '0003_c.sql': 'INSERT INTO t (n) VALUES (3);',
      '0001_a.sql': 'CREATE TABLE t (seq serial PRIMARY KEY, n int NOT NULL);',
      '0002_b.sql': 'INSERT INTO t (n) VALUES (2);',
    })
    expect(await pendingMigrations(t.url, dir)).toEqual(['0001_a.sql', '0002_b.sql', '0003_c.sql'])
    const first = await migrate(t.url, { dir, appliedBy: 'test' })
    expect(first.applied).toEqual(['0001_a.sql', '0002_b.sql', '0003_c.sql'])
    expect((await query<{ n: number }>(t.url, 'SELECT n FROM t ORDER BY seq')).map((r) => r.n)).toEqual([2, 3])
    const again = await migrate(t.url, { dir })
    expect(again).toEqual({ applied: [], alreadyApplied: ['0001_a.sql', '0002_b.sql', '0003_c.sql'] })
    expect(await recorded(t.url)).toHaveLength(3)

    await write(dir, { '0004_d.sql': 'INSERT INTO t (n) VALUES (4);' })
    expect((await migrate(t.url, { dir })).applied).toEqual(['0004_d.sql'])
    expect(await pendingMigrations(t.url, dir)).toEqual([])
  })

  it('refuses a changed applied migration and applies nothing else in that run', async () => {
    const t = await emptyDb()
    const dir = await folder({ '0001_a.sql': 'CREATE TABLE t (n int);' })
    await migrate(t.url, { dir })
    await write(dir, { '0001_a.sql': 'CREATE TABLE t (n bigint);', '0002_b.sql': 'CREATE TABLE u (n int);' })
    await expect(migrate(t.url, { dir })).rejects.toThrow(MigrationError)
    await expect(migrate(t.url, { dir })).rejects.toThrow(/0001_a\.sql changed after it was applied/)
    await expect(pendingMigrations(t.url, dir)).rejects.toThrow(/checksum mismatch/)
    expect(await query(t.url, "SELECT to_regclass('public.u') AS t")).toEqual([{ t: null }])
    expect(await recorded(t.url)).toEqual([{ version: '0001', file: '0001_a.sql' }])
  })

  it('refuses a deleted applied migration and a new file numbered below the latest applied one', async () => {
    const t = await emptyDb()
    const dir = await folder({ '0001_a.sql': 'SELECT 1;', '0003_c.sql': 'SELECT 3;' })
    await migrate(t.url, { dir })
    await write(dir, { '0002_b.sql': 'CREATE TABLE late (n int);' })
    await expect(migrate(t.url, { dir })).rejects.toThrow(/numbered below the latest applied version 0003/)
    await unlink(path.join(dir, '0002_b.sql'))
    await unlink(path.join(dir, '0001_a.sql'))
    await expect(migrate(t.url, { dir })).rejects.toThrow(/0001_a\.sql is missing/)
  })

  it('rolls back a failing migration completely and does not record it', async () => {
    const t = await emptyDb()
    const dir = await folder({
      '0001_a.sql': 'CREATE TABLE ok (n int);',
      '0002_b.sql': 'CREATE TABLE half (n int); SELECT * FROM no_such_table;',
    })
    await expect(migrate(t.url, { dir })).rejects.toThrow(/0002_b\.sql failed/)
    expect(await query(t.url, "SELECT to_regclass('public.half') AS t")).toEqual([{ t: null }])
    expect(await recorded(t.url)).toEqual([{ version: '0001', file: '0001_a.sql' }])
  })

  it('lets only one migrator run at a time, so concurrent runs apply each file once', async () => {
    const t = await emptyDb()
    const dir = await folder({
      '0001_a.sql': 'CREATE TABLE t (n int); SELECT pg_sleep(0.2);',
      '0002_b.sql': 'INSERT INTO t VALUES (1);',
    })
    const results = await Promise.all([migrate(t.url, { dir }), migrate(t.url, { dir }), migrate(t.url, { dir })])
    expect(results.flatMap((r) => r.applied).sort()).toEqual(['0001_a.sql', '0002_b.sql'])
    expect(await query(t.url, 'SELECT count(*)::int AS c FROM t')).toEqual([{ c: 1 }])
  })

  it('applies the repository migrations to an empty database', async () => {
    const t = await emptyDb()
    const result = await migrate(t.url)
    expect(result.applied).toEqual((await listMigrations()).map((x) => x.file))
    expect(await pendingMigrations(t.url)).toEqual([])
  })
})
