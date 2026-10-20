// Health checks (TSK-0003). `/healthz` is the public liveness check Render polls: no database call and no private
// data. `/readyz` (behind the gate on staging) reports whether the database answers and every migration is applied.
import { createDb, pendingMigrations, type Db } from '@handyhub/db'
import { sql } from 'kysely'

export type CheckResult = 'ok' | 'fail' | 'not_configured' | 'pending'
export interface Readiness {
  ready: boolean
  checks: { database: CheckResult; migrations: CheckResult }
}
export interface ReadinessCheck {
  check: () => Promise<Readiness>
  /** Releases the connection pool, if one was opened. */
  close: () => Promise<void>
}

/** Readiness against a database URL; undefined means no database is configured (allowed in local and ci only). */
export function databaseReadiness(databaseUrl: string | undefined, db?: Db): ReadinessCheck {
  if (databaseUrl === undefined) {
    return {
      check: async () => ({ ready: false, checks: { database: 'not_configured', migrations: 'not_configured' } }),
      close: async () => undefined,
    }
  }
  const conn = db ?? createDb(databaseUrl, { max: 2, applicationName: 'handyapp-readiness' })
  const check = async (): Promise<Readiness> => {
    let database: CheckResult = 'ok'
    try {
      await sql`select 1`.execute(conn)
    } catch {
      database = 'fail'
    }
    let migrations: CheckResult = 'fail'
    if (database === 'ok') {
      try {
        migrations = (await pendingMigrations(databaseUrl)).length === 0 ? 'ok' : 'pending'
      } catch {
        migrations = 'fail'
      }
    }
    return { ready: database === 'ok' && migrations === 'ok', checks: { database, migrations } }
  }
  // A pool passed in belongs to the caller; only a pool opened here is destroyed here.
  return { check, close: async () => (db ? undefined : conn.destroy()) }
}
