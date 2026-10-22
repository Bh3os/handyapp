// Environment marks (TSK-0141; HH-OPS-05, OWN-DEC-191, RULE-SYNTHETIC-DATA). Every server start and every migration
// run records which environment it identified itself as on this database (staging.environment_marks, migration 0070).
// The database then takes part in the staging check of Reset Test Data: a database marked production even once is
// never reset, and one that was never marked as staging, local or ci is not positively identified either.
import { sql } from 'kysely'
import type { Db, Tx } from './client.js'

export const MARK_ENVIRONMENTS = ['local', 'ci', 'staging', 'production'] as const

/**
 * The staging database's name (render.yaml databaseName): handyhub_staging_db, or with the random 4-character suffix
 * Render appends each time the database is recreated (handyhub_staging_db_vdqz). No production database uses the
 * prefix. A staging reset runs only on a database whose name matches: the server checks it and the database itself
 * refuses a staging run elsewhere (staging.environment_database_ok, migration 0070, the same pattern).
 */
export const STAGING_DATABASE_PATTERN = /^handyhub_staging_db(_[a-z0-9]{4})?$/

/** Whether a database name is the staging database's. */
export const isStagingDatabaseName = (name: string): boolean => STAGING_DATABASE_PATTERN.test(name)

const LOOPBACK_HOSTS = new Set(['localhost', '::1', '[::1]'])

/**
 * Whether a connection string reaches PostgreSQL on this machine only: a loopback host (localhost, 127.0.0.0/8, ::1)
 * or a local socket (no host, or a host parameter that is a directory). Every host of a multi-host string must be.
 */
export function isLocalDatabaseUrl(url: string | undefined): boolean {
  if (!url || !URL.canParse(url)) return false
  const u = new URL(url)
  const loopback = (h: string) => LOOPBACK_HOSTS.has(h.toLowerCase()) || /^127(\.\d{1,3}){3}$/.test(h)
  const param = u.searchParams.get('host')
  if (param !== null) return param.split(',').every((h) => h.startsWith('/') || loopback(h))
  if (u.hostname === '') return true
  return u.hostname.split(',').every(loopback)
}
export type MarkEnvironment = (typeof MARK_ENVIRONMENTS)[number]
export type MarkSource = 'server_boot' | 'migration'

/**
 * Records the environment unless the latest mark already names it. A database that served production refuses a test
 * mark (the database's own guard): the error is returned as 'refused', never swallowed into a success.
 */
export async function recordEnvironmentMark(
  db: Db | Tx,
  environment: MarkEnvironment,
  source: MarkSource,
): Promise<'recorded' | 'unchanged' | 'refused'> {
  if (!(MARK_ENVIRONMENTS as readonly string[]).includes(environment)) throw new Error('unknown environment')
  const latest = await db
    .selectFrom('staging.environment_marks')
    .select('environment')
    .orderBy('seq', 'desc')
    .limit(1)
    .executeTakeFirst()
  if (latest?.environment === environment) return 'unchanged'
  try {
    await db.insertInto('staging.environment_marks').values({ environment, source }).execute()
    return 'recorded'
  } catch (err) {
    if ((err as { code?: string }).code === '23001') return 'refused'
    throw err
  }
}

export type DatabaseIdentity = {
  /** Positively identified as a test database: a staging, local or ci mark and never a production mark. */
  identified: boolean
  /** Whether production ever identified itself on this database. */
  servedProduction: boolean
  /** The environments marked, oldest first, without repeats. */
  marks: MarkEnvironment[]
  /** current_database(): a staging reset needs a name matching STAGING_DATABASE_PATTERN. */
  database: string
}

/** What the database says about itself (the same test the reset's database guard applies). */
export async function databaseIdentity(db: Db | Tx): Promise<DatabaseIdentity> {
  const rows = await db.selectFrom('staging.environment_marks').select('environment').orderBy('seq').execute()
  const { rows: ok } = await sql<{
    identified: boolean
    database: string
  }>`SELECT staging.database_identified() AS identified, current_database() AS database`.execute(db)
  const marks = [...new Set(rows.map((r) => r.environment as MarkEnvironment))]
  return {
    identified: ok[0]?.identified === true,
    servedProduction: marks.includes('production'),
    marks,
    database: ok[0]?.database ?? '',
  }
}
