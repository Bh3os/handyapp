// Coverage lookup and rule sets (TSK-0022; HH-CUS-03, HH-INT-16, ENT-CoverageRule, OWN-DEC-37, OWN-DEC-88).
// - lookupCoverage: the one rule set the public checker, request submission and staff share. No active rule set, or a
//   ZIP the active set does not list, is the unknown outcome; nothing is ever guessed, and no outcome blocks anything.
// - importRuleSet: derives a proposed rule set from the Census ZCTA-to-county file and the coverage.area version.
// - approveRuleSet: records the owner's confirmation (OQ-SERVICE-AREA-ZIPS) and makes the set active, superseding the
//   previous one, in one transaction.
import { createHash } from 'node:crypto'
import type { Db, Tx } from '@handyhub/db'
import {
  deriveRules,
  parseZctaCountyFile,
  zip5,
  type CoverageOutcome,
  type DerivedRule,
} from '@handyhub/domain/coverage'
import { loadConfig, requireConfigured } from '../../platform/config/index.js'

export type CoverageResult = {
  outcome: CoverageOutcome
  /** The active rule set that answered; null while no rule set is active (NOT CONFIGURED). */
  ruleSet: number | null
}

/** The outcome for a ZIP. An invalid format is the caller's problem; here it is simply unknown. */
export async function lookupCoverage(db: Db | Tx, zip: string): Promise<CoverageResult> {
  const z = zip5(zip)
  const active = await db
    .selectFrom('platform.coverage_rule_sets')
    .select('version')
    .where('status', '=', 'active')
    .executeTakeFirst()
  if (!active) return { outcome: 'unknown', ruleSet: null }
  if (!z) return { outcome: 'unknown', ruleSet: active.version }
  const rule = await db
    .selectFrom('platform.coverage_rules')
    .select('disposition')
    .where('rule_set', '=', active.version)
    .where('zip5', '=', z)
    .executeTakeFirst()
  return { outcome: (rule?.disposition as CoverageOutcome | undefined) ?? 'unknown', ruleSet: active.version }
}

export type ImportSummary = {
  version: number
  areaVersion: number
  counts: Record<DerivedRule['disposition'], number>
  /** The ZIPs in coverage or on the boundary, for the owner to review before approving. */
  inArea: DerivedRule[]
}

const CHUNK = 1000

/** Adds a proposed rule set derived from the file and the active coverage.area. */
export async function importRuleSet(
  tx: Tx,
  input: { fileText: string; source: string; createdBy: string },
): Promise<ImportSummary> {
  const area = requireConfigured((await loadConfig(tx)).get('coverage.area'))
  const rules = deriveRules(parseZctaCountyFile(input.fileText), area.value.counties)
  const last = await tx
    .selectFrom('platform.coverage_rule_sets')
    .select((eb) => eb.fn.max('version').as('max'))
    .executeTakeFirst()
  const version = Number(last?.max ?? 0) + 1
  await tx
    .insertInto('platform.coverage_rule_sets')
    .values({
      version,
      source: input.source,
      source_sha256: createHash('sha256').update(input.fileText).digest('hex'),
      area_version: area.version,
      created_by: input.createdBy,
    })
    .execute()
  for (let i = 0; i < rules.length; i += CHUNK)
    await tx
      .insertInto('platform.coverage_rules')
      .values(rules.slice(i, i + CHUNK).map((r) => ({ rule_set: version, ...r })))
      .execute()
  const counts = { in_coverage: 0, boundary: 0, out_of_coverage: 0 }
  for (const r of rules) counts[r.disposition]++
  return {
    version,
    areaVersion: area.version,
    counts,
    inArea: rules.filter((r) => r.disposition !== 'out_of_coverage'),
  }
}

export class RuleSetError extends Error {
  override name = 'RuleSetError'
}

/** Activates a proposed rule set with the owner's confirmation; the previous active set is superseded. */
export async function approveRuleSet(
  tx: Tx,
  input: { version: number; approvedBy: string; sources: readonly string[] },
): Promise<{ superseded: number | null }> {
  if (input.sources.length === 0 || input.sources.some((s) => !/^[A-Z][A-Z0-9-]+$/.test(s)))
    throw new RuleSetError('cite the owner decision that confirms the ZIP list, for example OWN-DEC-151')
  const set = await tx
    .selectFrom('platform.coverage_rule_sets')
    .select(['status', 'area_version'])
    .where('version', '=', input.version)
    .forUpdate()
    .executeTakeFirst()
  if (!set) throw new RuleSetError(`rule set ${input.version} does not exist`)
  if (set.status !== 'proposed') throw new RuleSetError(`rule set ${input.version} is ${set.status}, not proposed`)
  const area = requireConfigured((await loadConfig(tx)).get('coverage.area'))
  if (area.version !== set.area_version)
    throw new RuleSetError(`rule set ${input.version} was derived from an older coverage.area; import it again`)
  const previous = await tx
    .updateTable('platform.coverage_rule_sets')
    .set({ status: 'superseded' })
    .where('status', '=', 'active')
    .returning('version')
    .executeTakeFirst()
  await tx
    .updateTable('platform.coverage_rule_sets')
    .set({
      status: 'active',
      approved_by: input.approvedBy,
      approval_sources: [...input.sources],
      approved_at: new Date(),
    })
    .where('version', '=', input.version)
    .execute()
  return { superseded: previous?.version ?? null }
}
