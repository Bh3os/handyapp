// The launch phase in force (TSK-0142; HH-OPS-06, OWN-DEC-191). Read from configuration (launch.phase, migration 0076);
// whatever cannot be read is phase 1, so a missing row, a database error or an unknown value never opens anything.
import type { Db, Tx } from '@handyhub/db'
import { INITIAL_LAUNCH_PHASE, isLaunchPhase, type LaunchPhase } from '@handyhub/domain'

export type LaunchRow = {
  phase: LaunchPhase
  version: number | null
  changedAt: Date | null
  changedBy: string | null
  approval: string | null
}

/** The active launch.phase version; phase 1 (with version null) when none can be read. */
export async function readLaunchPhase(db: Db | Tx): Promise<LaunchRow> {
  const row = await db
    .selectFrom('platform.policy_version')
    .select(['version', 'value', 'state', 'created_at', 'changed_by', 'change_reason'])
    .where('key', '=', 'launch.phase')
    .where('status', '=', 'active')
    .executeTakeFirst()
  const phase = (row?.value as { phase?: unknown } | null | undefined)?.phase
  if (!row || row.state !== 'configured' || !isLaunchPhase(phase))
    return { phase: INITIAL_LAUNCH_PHASE, version: null, changedAt: null, changedBy: null, approval: null }
  return {
    phase,
    version: row.version,
    changedAt: row.created_at,
    changedBy: row.changed_by,
    approval: row.change_reason,
  }
}

/**
 * The phase for the checks made on every response (search indexing), kept for a few seconds. A failed read is phase 1
 * and is not kept. The Owner's change clears it at once in this process (one Render instance).
 */
export class LaunchGate {
  #cached: { phase: LaunchPhase; until: number } | null = null
  constructor(
    private readonly db: Db,
    private readonly ttlMs = 5000,
    private readonly now: () => number = Date.now,
  ) {}

  async phase(): Promise<LaunchPhase> {
    const t = this.now()
    if (this.#cached && this.#cached.until > t) return this.#cached.phase
    try {
      const { phase, version } = await readLaunchPhase(this.db)
      if (version !== null) this.#cached = { phase, until: t + this.ttlMs }
      return phase
    } catch {
      return INITIAL_LAUNCH_PHASE
    }
  }

  invalidate(): void {
    this.#cached = null
  }
}
