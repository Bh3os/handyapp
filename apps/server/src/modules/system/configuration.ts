// The configuration view (TSK-0101; S08, HH-NFR-02, RULE-DECIDED-VALUES-ACTIVE, RULE-NO-INVENTED-FACTS): every
// configuration key with its active version, its value (or NOT CONFIGURED), the graph ids it cites and whether it is a
// PROPOSED reading; the AI module's state; and which environment variables are set, by name only. A variable's value
// is never read into the view, so a secret cannot reach the screen, a log or the response.
import type { Db } from '@handyhub/db'
import { ENV_VARS } from '../../config.js'
import { aiModule, loadConfig, type ConfigEntry, type ConfigKey } from '../../platform/config/index.js'
import { PROVIDER_ENV_VARS } from '../../providers/settings.js'

export type ConfigField = { path: string; value: string | number | boolean }

export type ConfigurationEntry = {
  key: ConfigKey
  state: 'CONFIGURED' | 'NOT_CONFIGURED'
  version: number | null
  sourceIds: string[]
  proposed: boolean
  effectiveFrom: Date | null
  /** The value as dotted paths and plain values; money stays integer cents, rates basis points. */
  fields: ConfigField[]
}

export type VariableGroup = 'server' | 'providers'
export type VariableState = { name: string; group: VariableGroup; set: boolean; secret: boolean }

export type ConfigurationView = {
  loadedAt: Date
  entries: ConfigurationEntry[]
  aiModule: 'AI_DISABLED'
  /** Null when this process was not given its environment (reported as unknown, never as set). */
  variables: VariableState[] | null
}

/** A stored value as path and value pairs, in the stored order; list items are numbered from 1. */
export function flatten(value: unknown, path = ''): ConfigField[] {
  if (value === null || value === undefined) return []
  if (Array.isArray(value)) return value.flatMap((v, i) => flatten(v, `${path}[${i + 1}]`))
  if (typeof value === 'object')
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => flatten(v, path ? `${path}.${k}` : k))
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return [{ path: path || 'value', value }]
  return []
}

function toEntry(e: ConfigEntry<ConfigKey>): ConfigurationEntry {
  if (e.state === 'NOT_CONFIGURED')
    return {
      key: e.key,
      state: e.state,
      version: e.version,
      sourceIds: [...e.sourceIds],
      proposed: false,
      effectiveFrom: null,
      fields: [],
    }
  return {
    key: e.key,
    state: e.state,
    version: e.version,
    sourceIds: [...e.sourceIds],
    proposed: e.proposed,
    effectiveFrom: e.effectiveFrom,
    fields: flatten(e.value),
  }
}

/**
 * Which server and provider variables are set, by name. Only the presence of a value is read; the descriptions in
 * the repository mark which ones are secrets.
 */
export function variableStates(env: Readonly<Record<string, string | undefined>>): VariableState[] {
  const states = (vars: Record<string, string>, group: VariableGroup): VariableState[] =>
    Object.entries(vars).map(([name, description]) => ({
      name,
      group,
      set: (env[name] ?? '').trim() !== '',
      secret: /\bSecret\.$/.test(description),
    }))
  return [...states(ENV_VARS, 'server'), ...states(PROVIDER_ENV_VARS, 'providers')]
}

export async function configurationView(
  db: Db,
  variables: readonly VariableState[] | null,
  now = new Date(),
): Promise<ConfigurationView> {
  const config = await loadConfig(db)
  return {
    loadedAt: now,
    entries: config.entries().map(toEntry),
    aiModule: aiModule(config).state,
    variables: variables ? variables.map((v) => ({ ...v })) : null,
  }
}
