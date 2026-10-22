// Environment marks (TSK-0141; HH-OPS-05, OWN-DEC-191, RULE-SYNTHETIC-DATA). Every server start and every migration
// run records which environment it identified itself as on this database (staging.environment_marks, migration 0069).
// The database then takes part in the staging check of Reset Test Data: a database marked production even once is
// never reset, and one that was never marked as staging, local or ci is not positively identified either.
import { sql } from 'kysely'
import type { Db, Tx } from './client.js'

export const MARK_ENVIRONMENTS = ['local', 'ci', 'staging', 'production'] as const
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
}

/** What the database says about itself (the same test the reset's database guard applies). */
export async function databaseIdentity(db: Db | Tx): Promise<DatabaseIdentity> {
  const rows = await db.selectFrom('staging.environment_marks').select('environment').orderBy('seq').execute()
  const { rows: ok } = await sql<{ identified: boolean }>`SELECT staging.database_identified() AS identified`.execute(
    db,
  )
  const marks = [...new Set(rows.map((r) => r.environment as MarkEnvironment))]
  return { identified: ok[0]?.identified === true, servedProduction: marks.includes('production'), marks }
}
