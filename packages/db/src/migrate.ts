// Forward-only plain-SQL migration runner (TSK-0004, HH-ARC-01; ARCH-STACK). Adapted from the proven runner in
// Bh3os/handyhub-app (apps/server/src/platform/migrate.ts).
// - Files are `NNNN_name.sql` in packages/db/migrations; each runs once, in version order, in its own transaction.
// - Each applied file's SHA-256 checksum is recorded in platform.schema_migration. A changed or missing applied file,
//   a duplicate version, a misnamed file or a new file numbered below the latest applied one refuses the whole run
//   before anything is applied (no silent drift).
// - One migrator at a time: a session advisory lock is taken before the checksum table is touched.
import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

/** The package root (`src/` and `dist/` are both one level below it). */
export const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const MIGRATIONS_DIR = path.join(PACKAGE_ROOT, 'migrations')

const FILE_NAME = /^(\d{4})_[a-z0-9_]+\.sql$/
const LOCK_KEY = 'handyapp.migrate'

export type Migration = { version: string; file: string; sql: string; checksum: string }
export type MigrationResult = { applied: string[]; alreadyApplied: string[] }
export type MigrateOptions = { dir?: string; appliedBy?: string }

export class MigrationError extends Error {
  override name = 'MigrationError'
}

export function checksum(sql: string): string {
  return createHash('sha256').update(sql).digest('hex')
}

/** Reads the migration files in version order. Misnamed `.sql` files and duplicate versions are refused. */
export async function listMigrations(dir = MIGRATIONS_DIR): Promise<Migration[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()
  const seen = new Map<string, string>()
  const out: Migration[] = []
  for (const file of files) {
    const m = FILE_NAME.exec(file)
    if (!m) throw new MigrationError(`Migration file ${file} is not named NNNN_lowercase_name.sql`)
    const version = m[1] as string
    const other = seen.get(version)
    if (other) throw new MigrationError(`Migrations ${other} and ${file} share version ${version}`)
    seen.set(version, file)
    const sql = await readFile(path.join(dir, file), 'utf8')
    out.push({ version, file, sql, checksum: checksum(sql) })
  }
  return out
}

type Applied = { version: string; file: string; checksum: string }

/** Compares the files on disk with the applied rows; returns the migrations still to apply, in order. */
export function planMigrations(onDisk: Migration[], applied: Applied[]): Migration[] {
  const byVersion = new Map(onDisk.map((m) => [m.version, m]))
  for (const a of applied) {
    const m = byVersion.get(a.version)
    if (!m) throw new MigrationError(`Applied migration ${a.file} is missing from the migrations folder`)
    if (m.checksum !== a.checksum)
      throw new MigrationError(`Migration ${m.file} changed after it was applied (checksum mismatch); add a new file`)
  }
  const done = new Set(applied.map((a) => a.version))
  const latest = applied
    .map((a) => a.version)
    .sort()
    .at(-1)
  const pending = onDisk.filter((m) => !done.has(m.version))
  const early = latest === undefined ? undefined : pending.find((m) => m.version < latest)
  if (early)
    throw new MigrationError(
      `Migration ${early.file} is numbered below the latest applied version ${latest}; renumber it`,
    )
  return pending
}

async function readApplied(client: pg.Client): Promise<Applied[]> {
  const exists = await client.query<{ t: string | null }>("SELECT to_regclass('platform.schema_migration')::text AS t")
  if (!exists.rows[0]?.t) return []
  const res = await client.query<Applied>(
    'SELECT version, file, checksum FROM platform.schema_migration ORDER BY version',
  )
  return res.rows
}

/** Applies every pending migration in order. Throws MigrationError without applying anything when the plan is refused. */
export async function migrate(databaseUrl: string, options: MigrateOptions = {}): Promise<MigrationResult> {
  const dir = options.dir ?? MIGRATIONS_DIR
  const appliedBy = options.appliedBy ?? 'migrator'
  const onDisk = await listMigrations(dir)
  const client = new pg.Client({ connectionString: databaseUrl, application_name: 'handyapp-migrate' })
  await client.connect()
  let locked = false
  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [LOCK_KEY])
    locked = true
    await client.query('CREATE SCHEMA IF NOT EXISTS platform')
    await client.query(`CREATE TABLE IF NOT EXISTS platform.schema_migration (
      version text PRIMARY KEY CHECK (version ~ '^[0-9]{4}$'),
      file text NOT NULL UNIQUE,
      checksum text NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
      applied_at timestamptz NOT NULL DEFAULT now(),
      applied_by text NOT NULL)`)
    const applied = await readApplied(client)
    const pending = planMigrations(onDisk, applied)
    const result: MigrationResult = { applied: [], alreadyApplied: applied.map((a) => a.file) }
    for (const m of pending) {
      await client.query('BEGIN')
      try {
        await client.query(m.sql)
        await client.query(
          'INSERT INTO platform.schema_migration (version, file, checksum, applied_by) VALUES ($1, $2, $3, $4)',
          [m.version, m.file, m.checksum, appliedBy],
        )
        await client.query('COMMIT')
        result.applied.push(m.file)
      } catch (err) {
        await client.query('ROLLBACK')
        throw new MigrationError(`Migration ${m.file} failed: ${(err as Error).message}`, { cause: err })
      }
    }
    return result
  } finally {
    if (locked) await client.query('SELECT pg_advisory_unlock(hashtext($1))', [LOCK_KEY]).catch(() => undefined)
    await client.end()
  }
}

/** Files on disk that are not applied yet (readiness check). Refuses the same drift that migrate() refuses. */
export async function pendingMigrations(databaseUrl: string, dir = MIGRATIONS_DIR): Promise<string[]> {
  const onDisk = await listMigrations(dir)
  const client = new pg.Client({ connectionString: databaseUrl, application_name: 'handyapp-migrate' })
  await client.connect()
  try {
    return planMigrations(onDisk, await readApplied(client)).map((m) => m.file)
  } finally {
    await client.end()
  }
}
