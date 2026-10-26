// The offline actions beyond the minimal set (TSK-0115; HH-OFF-08, OWN-DEC-121, RULE-SAFETY-GATES). Migration 0128
// seeds field.offline_actions with nothing turned on: HH-OFF-08 allows fuller offline workflows only after the threat,
// conflict, freshness and device controls are proven on staging. The Owner turns an action on (or off again) with a
// reason after walking those controls (docs/owner-acceptance-testing.md, section K); the database accepts nothing else.
// - checklist_step: a checklist step started, paused, resumed or completed on the phone without a connection, synced
//   through the field events (sync.ts) and applied there exactly as the online route applies it. Start Work, holds and
//   stop-work rights never move offline: a step still needs the worker's own online Start Work and no open hold.
import { OFFLINE_ACTIONS, OFFLINE_CHECKLIST_EVENTS, type OfflineAction } from '@handyhub/domain'
import type { Db, Tx } from '@handyhub/db'
import type { Config } from '../../platform/config/index.js'

type Reader = Db | Tx

/** The actions the Owner has turned on (none while the configuration says none). */
export function offlineActions(config: Config): OfflineAction[] {
  const entry = config.get('field.offline_actions')
  return entry.state === 'CONFIGURED' ? [...entry.value.actions] : []
}

/** The checklist events a phone may save offline now: none until the Owner turned checklist_step on. */
export function offlineChecklistEvents(config: Config): string[] {
  return offlineActions(config).includes('checklist_step') ? [...OFFLINE_CHECKLIST_EVENTS] : []
}

/** The setting as the Owner reads it: the version in force, what it turns on, when and why it was changed. */
export async function offlineActionsSetting(db: Reader) {
  const row = await db
    .selectFrom('platform.policy_version')
    .select(['version', 'value', 'created_at', 'change_reason', 'changed_by'])
    .where('key', '=', 'field.offline_actions')
    .where('status', '=', 'active')
    .executeTakeFirstOrThrow()
  const value = (typeof row.value === 'string' ? JSON.parse(row.value) : row.value) as { actions?: unknown } | null
  const actions = Array.isArray(value?.actions)
    ? OFFLINE_ACTIONS.filter((a) => (value.actions as unknown[]).includes(a))
    : []
  return {
    version: row.version,
    actions,
    available: [...OFFLINE_ACTIONS],
    changedAt: row.created_at.toISOString(),
    // A migration's reason is the seed's; the Owner's own reason once they changed it.
    reason: row.changed_by.startsWith('migration:') ? null : row.change_reason,
  }
}
