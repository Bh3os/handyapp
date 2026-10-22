// Restore checks (TSK-0106; HH-NFR-03 "Restore needed: isolated restore, integrity checks, deletion and suppression
// replay, provider reconciliation, controlled resume", T72, HH-PRIV-03). Read-only: nothing here writes.
// - databaseFingerprint: per table its row count and an order-independent checksum of its rows, per foreign key the
//   number of rows that use it (the relationships: customers, projects, estimate versions, photos, payments and the
//   rest), and the append-only triggers. Two fingerprints of the same data are equal whatever the physical row order.
// - compareFingerprints: what differs between two fingerprints. Against the backup's own fingerprint a restore shows
//   no difference; against the damaged or live database it lists the data the backup does not hold (missing data).
// - integrityChecks: the migration ledger matches the migrations on disk, every constraint is validated, every
//   identity or serial sequence is past its column's largest value (no duplicate keys after the resume), and the
//   append-only triggers exist.
// Values never leave the database: a checksum is an md5 of md5s, and only names, counts and checksums are returned.
import { listMigrations, planMigrations, type Db, type Tx } from '@handyhub/db'
import { sql } from 'kysely'

export type TableFingerprint = { rows: number; checksum: string }

export type DatabaseFingerprint = {
  /** `schema.table` → its rows. */
  tables: Record<string, TableFingerprint>
  /** `schema.table.constraint` (foreign keys) → the rows whose key columns are all set. */
  relationships: Record<string, number>
  /** `schema.table.trigger` of every append-only trigger, sorted. */
  appendOnlyTriggers: string[]
  /** The applied migration versions, in order. */
  migrations: string[]
}

export type FingerprintDifference =
  | { kind: 'table_missing' | 'table_added'; name: string }
  | { kind: 'rows'; name: string; before: number; after: number }
  | { kind: 'content'; name: string }
  | { kind: 'relationship'; name: string; before: number | null; after: number | null }
  | { kind: 'append_only_trigger_missing' | 'append_only_trigger_added'; name: string }
  | { kind: 'migrations'; before: string[]; after: string[] }

export type IntegrityCheck = { id: string; ok: boolean; details: string[] }

/** Schemas that belong to PostgreSQL itself, never to the application. */
const SYSTEM_SCHEMAS = sql`('pg_catalog', 'information_schema', 'pg_toast')`

type Conn = Db | Tx

async function baseTables(db: Conn): Promise<{ schema: string; table: string }[]> {
  const { rows } = await sql<{ schema: string; table: string }>`SELECT n.nspname AS schema, c.relname AS table
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p') AND n.nspname NOT IN ${SYSTEM_SCHEMAS} AND n.nspname NOT LIKE 'pg_temp%'
    ORDER BY 1, 2`.execute(db)
  return rows
}

/** The fingerprint of a database's data and relationships (see the header). */
export async function databaseFingerprint(db: Conn): Promise<DatabaseFingerprint> {
  const tables: Record<string, TableFingerprint> = {}
  for (const { schema, table } of await baseTables(db)) {
    const { rows } = await sql<{ rows: string; checksum: string }>`SELECT count(*)::text AS rows,
        md5(coalesce(string_agg(h, '' ORDER BY h), '')) AS checksum
      FROM (SELECT md5(t::text) AS h FROM ${sql.table(`${schema}.${table}`)} t) x`.execute(db)
    tables[`${schema}.${table}`] = { rows: Number(rows[0]?.rows ?? 0), checksum: rows[0]?.checksum ?? '' }
  }

  const { rows: fks } = await sql<{ schema: string; table: string; name: string; columns: string[] }>`SELECT
      n.nspname AS schema, c.relname AS table, k.conname AS name,
      array_agg(a.attname::text ORDER BY u.ord) AS columns
    FROM pg_constraint k
    JOIN pg_class c ON c.oid = k.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL unnest(k.conkey) WITH ORDINALITY AS u(attnum, ord)
    JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = u.attnum
    WHERE k.contype = 'f' AND n.nspname NOT IN ${SYSTEM_SCHEMAS}
    GROUP BY n.nspname, c.relname, k.conname
    ORDER BY 1, 2, 3`.execute(db)
  const relationships: Record<string, number> = {}
  for (const fk of fks) {
    const set = sql.join(
      fk.columns.map((col) => sql`${sql.ref(col)} IS NOT NULL`),
      sql` AND `,
    )
    const { rows } = await sql<{ n: string }>`SELECT count(*)::text AS n FROM ${sql.table(`${fk.schema}.${fk.table}`)}
      WHERE ${set}`.execute(db)
    relationships[`${fk.schema}.${fk.table}.${fk.name}`] = Number(rows[0]?.n ?? 0)
  }

  const { rows: triggers } = await sql<{ name: string }>`SELECT n.nspname || '.' || c.relname || '.' || t.tgname AS name
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE NOT t.tgisinternal AND p.proname = 'reject_append_only_change'
    ORDER BY 1`.execute(db)

  return {
    tables,
    relationships,
    appendOnlyTriggers: triggers.map((t) => t.name),
    migrations: await appliedVersions(db),
  }
}

async function appliedVersions(db: Conn): Promise<string[]> {
  const { rows } = await sql<{ t: string | null }>`SELECT to_regclass('platform.schema_migration')::text AS t`.execute(
    db,
  )
  if (!rows[0]?.t) return []
  const applied = await sql<{
    version: string
  }>`SELECT version FROM platform.schema_migration ORDER BY version`.execute(db)
  return applied.rows.map((r) => r.version)
}

/** What differs from `before` to `after`; empty when the two hold the same data and relationships. */
export function compareFingerprints(before: DatabaseFingerprint, after: DatabaseFingerprint): FingerprintDifference[] {
  const out: FingerprintDifference[] = []
  const names = [...new Set([...Object.keys(before.tables), ...Object.keys(after.tables)])].sort()
  for (const name of names) {
    const a = before.tables[name]
    const b = after.tables[name]
    if (!b) out.push({ kind: 'table_missing', name })
    else if (!a) out.push({ kind: 'table_added', name })
    else if (a.rows !== b.rows) out.push({ kind: 'rows', name, before: a.rows, after: b.rows })
    else if (a.checksum !== b.checksum) out.push({ kind: 'content', name })
  }
  const rels = [...new Set([...Object.keys(before.relationships), ...Object.keys(after.relationships)])].sort()
  for (const name of rels) {
    const a = before.relationships[name] ?? null
    const b = after.relationships[name] ?? null
    if (a !== b) out.push({ kind: 'relationship', name, before: a, after: b })
  }
  const was = new Set(before.appendOnlyTriggers)
  const is = new Set(after.appendOnlyTriggers)
  for (const name of was) if (!is.has(name)) out.push({ kind: 'append_only_trigger_missing', name })
  for (const name of is) if (!was.has(name)) out.push({ kind: 'append_only_trigger_added', name })
  if (before.migrations.join(',') !== after.migrations.join(','))
    out.push({ kind: 'migrations', before: before.migrations, after: after.migrations })
  return out
}

/** The integrity checks of a restored database (see the header); `migrationsDir` is for tests. */
export async function integrityChecks(db: Conn, options: { migrationsDir?: string } = {}): Promise<IntegrityCheck[]> {
  const checks: IntegrityCheck[] = []

  // The ledger matches the files on disk: nothing pending, nothing changed or missing (the same rule as migrate()).
  try {
    const onDisk = await listMigrations(options.migrationsDir)
    const { rows } = await sql<{
      t: string | null
    }>`SELECT to_regclass('platform.schema_migration')::text AS t`.execute(db)
    const applied = rows[0]?.t
      ? (
          await sql<{
            version: string
            file: string
            checksum: string
          }>`SELECT version, file, checksum FROM platform.schema_migration ORDER BY version`.execute(db)
        ).rows
      : []
    const pending = planMigrations(onDisk, applied).map((m) => m.file)
    checks.push({
      id: 'migrations',
      ok: applied.length > 0 && pending.length === 0,
      details: applied.length === 0 ? ['no migration ledger'] : pending.map((f) => `pending ${f}`),
    })
  } catch (err) {
    checks.push({ id: 'migrations', ok: false, details: [(err as Error).message] })
  }

  // Every constraint is validated (a restore that skipped or deferred a check would leave NOT VALID ones).
  const { rows: invalid } = await sql<{ name: string }>`SELECT n.nspname || '.' || c.relname || '.' || k.conname AS name
    FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE NOT k.convalidated AND n.nspname NOT IN ${SYSTEM_SCHEMAS} ORDER BY 1`.execute(db)
  checks.push({ id: 'constraints_validated', ok: invalid.length === 0, details: invalid.map((r) => r.name) })

  // Every identity or serial sequence is past its column's largest value.
  const { rows: seqCols } = await sql<{ schema: string; table: string; column: string; seq: string }>`SELECT
      table_schema AS schema, table_name AS table, column_name AS column,
      pg_get_serial_sequence(format('%I.%I', table_schema, table_name), column_name) AS seq
    FROM information_schema.columns
    WHERE table_schema NOT IN ${SYSTEM_SCHEMAS}
      AND pg_get_serial_sequence(format('%I.%I', table_schema, table_name), column_name) IS NOT NULL
    ORDER BY 1, 2, 3`.execute(db)
  const behind: string[] = []
  for (const s of seqCols) {
    const { rows } = await sql<{ max: string | null; last: string; called: boolean }>`SELECT
        (SELECT max(${sql.ref(s.column)})::text FROM ${sql.table(`${s.schema}.${s.table}`)}) AS max,
        last_value::text AS last, is_called AS called FROM ${sql.raw(s.seq)}`.execute(db)
    const r = rows[0]
    if (!r || r.max === null) continue
    // The next value is last + 1 once called, otherwise last itself.
    const next = BigInt(r.last) + (r.called ? 1n : 0n)
    if (next <= BigInt(r.max)) behind.push(`${s.schema}.${s.table}.${s.column}`)
  }
  checks.push({ id: 'sequences_ahead', ok: behind.length === 0, details: behind })

  // The append-only tables keep their guard (audit, deletion log, consent, payments and the rest).
  const fp = await sql<{ n: string }>`SELECT count(*)::text AS n FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE NOT t.tgisinternal AND p.proname = 'reject_append_only_change'`.execute(db)
  const triggers = Number(fp.rows[0]?.n ?? 0)
  checks.push({ id: 'append_only_triggers', ok: triggers > 0, details: [`${triggers} append-only triggers`] })

  return checks
}
