// Kysely client, generated types and withTx against a real PostgreSQL 16 (TSK-0004, HH-ARC-01).
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { sql } from 'kysely'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb, withTx } from '../../src/index.js'
import { PACKAGE_ROOT } from '../../src/migrate.js'
import { createTestDatabase, testDatabaseUrl, type TestDatabase } from '../../src/testing.js'
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

describe('lost connections (TSK-0107, HH-NFR-03, HH-DATA-04)', () => {
  // The server processes of one pool are ended as a PostgreSQL restart ends them (pg_terminate_backend: "terminating
  // connection due to administrator command"), only this file's own pool, never another test's or the server's.
  const app = 'handyapp-tsk0107-lost'
  const terminate = async (pid?: number) => {
    const admin = new pg.Client({ connectionString: testDatabaseUrl(), application_name: 'handyapp-tsk0107-admin' })
    await admin.connect()
    try {
      const { rows } = await admin.query<{ pid: number }>(
        `SELECT pid FROM pg_stat_activity WHERE datname = $1 AND application_name = $2 AND ($3::int IS NULL OR pid = $3)`,
        [t.name, app, pid ?? null],
      )
      for (const r of rows) await admin.query('SELECT pg_terminate_backend($1, 5000)', [r.pid])
      return rows.length
    } finally {
      await admin.end()
    }
  }

  it('[HH-NFR-03] an idle connection ended by the server is replaced; the process keeps running', async () => {
    const lost: (string | undefined)[] = []
    const db = createDb(t.url, { max: 3, applicationName: app, onConnectionLost: (err) => lost.push(err.code) })
    try {
      // Three connections open and go back to the pool idle.
      await Promise.all([1, 2, 3].map(() => withTx(db, (trx) => sql`SELECT pg_sleep(0.05)`.execute(trx))))
      expect(await terminate()).toBe(3)
      // Without a listener, the first lost connection's 'error' event would have ended this process here.
      await expect.poll(() => lost.length).toBe(3)
      expect(new Set(lost)).toEqual(new Set(['57P01']))
      const { rows } = await sql<{ n: number }>`SELECT 1 AS n`.execute(db)
      expect(rows).toEqual([{ n: 1 }])
    } finally {
      await db.destroy()
    }
  })

  it('[HH-DATA-04] a transaction whose connection is lost half-way commits nothing; the next one succeeds', async () => {
    const db = createDb(t.url, { max: 2, applicationName: app })
    try {
      await expect(
        withTx(db, async (trx) => {
          await sql`INSERT INTO public.tx_probe VALUES (40)`.execute(trx)
          const { rows } = await sql<{ pid: number }>`SELECT pg_backend_pid() AS pid`.execute(trx)
          expect(await terminate(rows[0]?.pid)).toBe(1)
          await sql`INSERT INTO public.tx_probe VALUES (41)`.execute(trx)
        }),
      ).rejects.toThrow()
      expect(await probe()).not.toContain(40)
      await withTx(db, (trx) => sql`INSERT INTO public.tx_probe VALUES (42)`.execute(trx))
      expect(await probe()).toContain(42)
    } finally {
      await db.destroy()
      await sql`DELETE FROM public.tx_probe WHERE n >= 40`.execute(t.db)
    }
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
