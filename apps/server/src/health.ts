// Health checks (TSK-0003). `/healthz` is the public liveness check Render polls: no database call and no private
// data. `/readyz` (behind the gate on staging) reports whether the database answers and every migration is applied.
// TSK-0109 (docs/security/review-2026.md AVAIL-2): the migration check opens a connection of its own and reads the
// migration files, and /readyz needs no sign-in in production, so each call is no longer one more connection: once
// every migration is applied the answer is kept for the life of the process (migrations only change with a new
// deploy, which starts a new process), and until then parallel calls share one check in flight.
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
export function databaseReadiness(
  databaseUrl: string | undefined,
  db?: Db,
  pending: (url: string) => Promise<readonly unknown[]> = pendingMigrations,
): ReadinessCheck {
  if (databaseUrl === undefined) {
    return {
      check: async () => ({ ready: false, checks: { database: 'not_configured', migrations: 'not_configured' } }),
      close: async () => undefined,
    }
  }
  const conn = db ?? createDb(databaseUrl, { max: 2, applicationName: 'handyapp-readiness' })
  let applied = false
  let inFlight: Promise<CheckResult> | null = null
  const migrationState = (): Promise<CheckResult> => {
    if (applied) return Promise.resolve('ok')
    inFlight ??= pending(databaseUrl)
      .then((list): CheckResult => (list.length === 0 ? 'ok' : 'pending'))
      .catch((): CheckResult => 'fail')
      .then((result) => {
        if (result === 'ok') applied = true
        inFlight = null
        return result
      })
    return inFlight
  }
  const check = async (): Promise<Readiness> => {
    let database: CheckResult = 'ok'
    try {
      await sql`select 1`.execute(conn)
    } catch {
      database = 'fail'
    }
    let migrations: CheckResult = 'fail'
    if (database === 'ok') migrations = await migrationState()
    return { ready: database === 'ok' && migrations === 'ok', checks: { database, migrations } }
  }
  // A pool passed in belongs to the caller; only a pool opened here is destroyed here.
  return { check, close: async () => (db ? undefined : conn.destroy()) }
}
