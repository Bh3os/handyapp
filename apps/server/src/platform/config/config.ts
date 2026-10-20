// Typed configuration accessor (TSK-0007; ENT-PolicyVersion, RULE-DECIDED-VALUES-ACTIVE, RULE-NO-INVENTED-FACTS).
//
// - `config.get(key)` returns either the configured value with its version and source ids, or NOT_CONFIGURED. The
//   result is a union: a caller cannot read `.value` without first checking `state`, so a missing fact can never be
//   used as if it were a default (type-enforced). `requireConfigured` turns NOT_CONFIGURED into a narrow error for the
//   one output that needs the value.
// - A key with no active row is NOT_CONFIGURED as well (fail closed); a stored value that does not match its key's
//   shape, or a stored key this code does not know, refuses to load.
// - `recordPolicyVersion` adds a new version and supersedes the active one in the same transaction; rows are never
//   edited or deleted (the database refuses both). Callers authorize it first (policy action policy_values.change).
// - `policyVersion` reads an older version that a record pinned.
import { type Db, type Tx, withTx } from '@handyhub/db'
import { sql } from 'kysely'
import { type ConfigKey, type ConfigValue, isConfigKey, parseValue, CONFIG_KEYS } from './keys.js'

export type Configured<K extends ConfigKey> = {
  readonly state: 'CONFIGURED'
  readonly key: K
  readonly value: ConfigValue<K>
  readonly version: number
  readonly sourceIds: readonly string[]
  /** The value is a PROPOSED reading of the owner's answer, still to be confirmed. */
  readonly proposed: boolean
  readonly effectiveFrom: Date
}

export type NotConfigured<K extends ConfigKey> = {
  readonly state: 'NOT_CONFIGURED'
  readonly key: K
  /** The NOT CONFIGURED version row, or null when no row exists for the key. */
  readonly version: number | null
  /** The open fact or question that explains why the value is missing. */
  readonly sourceIds: readonly string[]
}

export type ConfigEntry<K extends ConfigKey> = Configured<K> | NotConfigured<K>

export class ConfigNotConfiguredError extends Error {
  override name = 'ConfigNotConfiguredError'
  readonly code = 'NOT_CONFIGURED'
  constructor(
    readonly key: ConfigKey,
    readonly sourceIds: readonly string[],
  ) {
    super(`${key} is NOT CONFIGURED (${sourceIds.join(', ') || 'no source'})`)
  }
}

export class ConfigLoadError extends Error {
  override name = 'ConfigLoadError'
}

export type Config = {
  get<K extends ConfigKey>(key: K): ConfigEntry<K>
  /** Every key, in registry order. */
  entries(): ConfigEntry<ConfigKey>[]
}

type Row = {
  key: string
  version: number
  state: string
  value: unknown
  proposed: boolean
  source_ids: string[]
  effective_from: Date
}

function toEntry(row: Row): ConfigEntry<ConfigKey> {
  if (!isConfigKey(row.key)) throw new ConfigLoadError(`unknown configuration key in the database: ${row.key}`)
  if (row.state === 'not_configured') {
    return { state: 'NOT_CONFIGURED', key: row.key, version: row.version, sourceIds: row.source_ids }
  }
  if (row.state !== 'configured') throw new ConfigLoadError(`${row.key} v${row.version}: unknown state ${row.state}`)
  return {
    state: 'CONFIGURED',
    key: row.key,
    value: parseValue(row.key, row.value),
    version: row.version,
    sourceIds: row.source_ids,
    proposed: row.proposed,
    effectiveFrom: row.effective_from,
  }
}

const COLUMNS = ['key', 'version', 'state', 'value', 'proposed', 'source_ids', 'effective_from'] as const

/** Reads every active version once; the returned Config is an immutable snapshot. */
export async function loadConfig(db: Db | Tx): Promise<Config> {
  const rows = (await db
    .selectFrom('platform.policy_version')
    .select(COLUMNS)
    .where('status', '=', 'active')
    .execute()) as Row[]
  const byKey = new Map<string, ConfigEntry<ConfigKey>>()
  for (const row of rows) byKey.set(row.key, toEntry(row))
  const get = <K extends ConfigKey>(key: K): ConfigEntry<K> =>
    (byKey.get(key) as ConfigEntry<K> | undefined) ?? { state: 'NOT_CONFIGURED', key, version: null, sourceIds: [] }
  return {
    get,
    entries: () => (Object.keys(CONFIG_KEYS) as ConfigKey[]).map((k) => get(k)),
  }
}

/** The value, or a ConfigNotConfiguredError for the one output that cannot be produced without it. */
export function requireConfigured<K extends ConfigKey>(entry: ConfigEntry<K>): Configured<K> {
  if (entry.state === 'NOT_CONFIGURED') throw new ConfigNotConfiguredError(entry.key, entry.sourceIds)
  return entry
}

/** A specific version of a key, as a record pinned it; null when that version does not exist. */
export async function policyVersion<K extends ConfigKey>(
  db: Db | Tx,
  key: K,
  version: number,
): Promise<ConfigEntry<K> | null> {
  const row = (await db
    .selectFrom('platform.policy_version')
    .select(COLUMNS)
    .where('key', '=', key)
    .where('version', '=', version)
    .executeTakeFirst()) as Row | undefined
  return row ? (toEntry(row) as ConfigEntry<K>) : null
}

export type NewVersion<K extends ConfigKey> = {
  key: K
  /** The new value, or null to record that the value is NOT CONFIGURED. */
  value: ConfigValue<K> | null
  /** The decision or fact node ids this version cites; at least one. */
  sourceIds: readonly string[]
  /** Who made the change (a staff user id, or `migration:<n>`). */
  changedBy: string
  reason: string
  effectiveFrom?: Date
  proposed?: boolean
}

/** Adds the next version of a key and supersedes the active one, in one transaction. Returns the new version. */
export async function recordPolicyVersion<K extends ConfigKey>(db: Db | Tx, change: NewVersion<K>): Promise<number> {
  if (change.sourceIds.length === 0) throw new ConfigLoadError('a policy version cites at least one source id')
  if (change.reason.trim() === '') throw new ConfigLoadError('a policy version change needs a reason')
  // Validate before writing: a value that does not match its key's shape is never stored.
  const value = change.value === null ? null : parseValue(change.key, change.value)
  return withTx(db, async (trx) => {
    // Serialize changes per key; the unique active index refuses a concurrent second active row anyway.
    await sql`SELECT pg_advisory_xact_lock(hashtext(${`policy_version:${change.key}`}))`.execute(trx)
    const latest = await trx
      .selectFrom('platform.policy_version')
      .select((eb) => eb.fn.max('version').as('max'))
      .where('key', '=', change.key)
      .executeTakeFirst()
    const next = Number(latest?.max ?? 0) + 1
    await trx
      .updateTable('platform.policy_version')
      .set({ status: 'superseded' })
      .where('key', '=', change.key)
      .where('status', '=', 'active')
      .execute()
    await trx
      .insertInto('platform.policy_version')
      .values({
        key: change.key,
        version: next,
        state: value === null ? 'not_configured' : 'configured',
        value: value === null ? null : JSON.stringify(value),
        proposed: change.proposed ?? false,
        source_ids: [...change.sourceIds],
        changed_by: change.changedBy,
        change_reason: change.reason,
        ...(change.effectiveFrom ? { effective_from: change.effectiveFrom } : {}),
      })
      .execute()
    return next
  })
}

/** The AI module's state (RULE-AI-WAVE2): disabled unless a configured value says otherwise, which none can. */
export function aiModule(config: Config): { readonly state: 'AI_DISABLED'; readonly enabled: false } {
  const entry = config.get('ai.module')
  if (entry.state === 'CONFIGURED' && entry.value.enabled !== false) {
    throw new ConfigLoadError('ai.module cannot be enabled before the owner approves plan 33')
  }
  return { state: 'AI_DISABLED', enabled: false }
}
