// Kysely client, generated types and withTx against a real PostgreSQL 16 (TSK-0004, HH-ARC-01).
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { withTx } from '../../src/index.js'
import { PACKAGE_ROOT } from '../../src/migrate.js'
import { createTestDatabase, type TestDatabase } from '../../src/testing.js'
import { introspect, renderSchema } from '../../src/typegen.js'

let t: TestDatabase
beforeAll(async () => {
  t = await createTestDatabase()
  await sql`CREATE TABLE public.tx_probe (n int PRIMARY KEY)`.execute(t.db)
})
afterAll(async () => {
  await t.drop()
})

const probe = async () =>
  (await sql<{ n: number }>`SELECT n FROM public.tx_probe ORDER BY n`.execute(t.db)).rows.map((r) => r.n)

describe('generated table types (TSK-0004)', () => {
  it('match what the migrations produce (run pnpm db:types after adding a migration)', async () => {
    const committed = await readFile(path.join(PACKAGE_ROOT, 'src', 'schema.ts'), 'utf8')
    const scratch = await createTestDatabase()
    try {
      expect(renderSchema(await introspect(scratch.url))).toBe(committed)
    } finally {
      await scratch.drop()
    }
  })

  it('type the migration table for Kysely queries', async () => {
    const row = await t.db
      .selectFrom('platform.schema_migration')
      .select(['version', 'file', 'checksum', 'applied_at', 'applied_by'])
      .where('version', '=', '0001')
      .executeTakeFirstOrThrow()
    expect(row).toMatchObject({ version: '0001', file: '0001_baseline.sql', applied_by: 'test-template' })
    expect(row.applied_at).toBeInstanceOf(Date)
  })
})

describe('pg pool settings (TSK-0004, RULE-MONEY-CENTS)', () => {
  it('runs sessions in UTC, keeps dates as text and bigint and numeric as exact strings', async () => {
    const { rows } = await sql<{ tz: string; d: string; ds: string[]; big: string; num: string; at: Date }>`
      SELECT current_setting('TimeZone') AS tz, DATE '2026-10-20' AS d, ARRAY[DATE '2026-01-02'] AS ds,
             9007199254740993::bigint AS big, 0.10::numeric(12, 2) AS num,
             TIMESTAMPTZ '2026-10-20 12:00:00+00' AS at`.execute(t.db)
    expect(rows[0]).toEqual({
      tz: 'UTC',
      d: '2026-10-20',
      ds: ['2026-01-02'],
      big: '9007199254740993',
      num: '0.10',
      at: new Date('2026-10-20T12:00:00Z'),
    })
  })
})

describe('withTx (TSK-0004)', () => {
  it('commits when the callback resolves and returns its value', async () => {
    const value = await withTx(t.db, async (trx) => {
      await sql`INSERT INTO public.tx_probe VALUES (1)`.execute(trx)
      return 'done'
    })
    expect(value).toBe('done')
    expect(await probe()).toEqual([1])
  })

  it('rolls everything back when the callback throws', async () => {
    await expect(
      withTx(t.db, async (trx) => {
        await sql`INSERT INTO public.tx_probe VALUES (2)`.execute(trx)
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(await probe()).toEqual([1])
  })

  it('joins an outer transaction instead of nesting, so an outer failure undoes inner writes', async () => {
    await expect(
      withTx(t.db, async (outer) => {
        await withTx(outer, async (inner) => {
          expect(inner).toBe(outer)
          await sql`INSERT INTO public.tx_probe VALUES (3)`.execute(inner)
        })
        throw new Error('outer fails')
      }),
    ).rejects.toThrow('outer fails')
    expect(await probe()).toEqual([1])
    await expect(withTx(t.db, (o) => withTx(o, async () => 1, { isolation: 'serializable' }))).rejects.toThrow(
      /joined transaction/,
    )
  })

  it('sets the requested isolation level', async () => {
    const level = await withTx(
      t.db,
      async (trx) =>
        (await sql<{ l: string }>`SELECT current_setting('transaction_isolation') AS l`.execute(trx)).rows[0]?.l,
      { isolation: 'serializable' },
    )
    expect(level).toBe('serializable')
  })
})
