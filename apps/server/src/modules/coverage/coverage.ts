// Coverage lookup and rule sets (TSK-0022; HH-CUS-03, HH-INT-16, ENT-CoverageRule, OWN-DEC-37, OWN-DEC-88).
// - lookupCoverage: the one rule set the public checker, request submission and staff share. No active rule set, or a
//   ZIP the active set does not list, is the unknown outcome; nothing is ever guessed, and no outcome blocks anything.
// - importRuleSet: derives a proposed rule set from the Census ZCTA-to-county file and the coverage.area version.
// - approveRuleSet: records the owner's confirmation (OQ-SERVICE-AREA-ZIPS) and makes the set active, superseding the
//   previous one, in one transaction.
// TSK-0127 (OWN-DEC-179): the owner's ZIP dataset (migration 0067) is the candidate list. The result names its reason
// and the ZIP's category, so staff see why (a PO Box or Unique ZIP never proves coverage). With a dataset, an import
// of the Census file verifies it: the source decides each ZIP it lists and every discrepancy is reported.
import { createHash } from 'node:crypto'
import type { Db, Tx } from '@handyhub/db'
import {
  countDataset,
  deriveRules,
  legacyReason,
  parseZctaCountyFile,
  verifyDataset,
  zip5,
  type CoverageOutcome,
  type CoverageReason,
  type DatasetCounts,
  type DatasetDiscrepancy,
  type DatasetEntry,
  type DerivedRule,
  type ZipCategory,
} from '@handyhub/domain/coverage'
import { loadConfig, requireConfigured } from '../../platform/config/index.js'

export type CoverageResult = {
  outcome: CoverageOutcome
  /** The active rule set that answered; null while no rule set is active (NOT CONFIGURED) or the lookup failed. */
  ruleSet: number | null
  reason: CoverageReason
  /** The ZIP's dataset category; null when the rule names none or there is no rule. */
  zipCategory: ZipCategory | null
  /** The service counties the rule names for the ZIP ('KY:Jefferson'). */
  counties: string[]
}

/** The outcome for a ZIP. An invalid format is the caller's problem; here it is simply unknown. */
export async function lookupCoverage(db: Db | Tx, zip: string): Promise<CoverageResult> {
  const z = zip5(zip)
  const active = await db
    .selectFrom('platform.coverage_rule_sets')
    .select('version')
    .where('status', '=', 'active')
    .executeTakeFirst()
  const none = { zipCategory: null, counties: [] }
  if (!active) return { outcome: 'unknown', ruleSet: null, reason: 'not_configured', ...none }
  if (!z) return { outcome: 'unknown', ruleSet: active.version, reason: 'not_listed', ...none }
  const rule = await db
    .selectFrom('platform.coverage_rules')
    .select(['disposition', 'reason', 'zip_category', 'counties'])
    .where('rule_set', '=', active.version)
    .where('zip5', '=', z)
    .executeTakeFirst()
  if (!rule) return { outcome: 'unknown', ruleSet: active.version, reason: 'not_listed', ...none }
  const outcome = rule.disposition as CoverageOutcome
  return {
    outcome,
    ruleSet: active.version,
    reason: (rule.reason as CoverageReason | null) ?? legacyReason(outcome),
    zipCategory: rule.zip_category as ZipCategory | null,
    counties: rule.counties,
  }
}

/** A dataset version's entries, in ZIP order. */
export async function datasetEntries(db: Db | Tx, version: number): Promise<DatasetEntry[]> {
  const rows = await db
    .selectFrom('platform.coverage_zip_entries')
    .select(['zip5', 'category', 'counties'])
    .where('dataset', '=', version)
    .orderBy('zip5')
    .execute()
  return rows.map((r) => ({ zip5: r.zip5, category: r.category as ZipCategory | null, counties: r.counties }))
}

/** The newest dataset version, or null when none was ever imported. */
export async function latestDataset(db: Db | Tx): Promise<number | null> {
  const row = await db
    .selectFrom('platform.coverage_zip_datasets')
    .select((eb) => eb.fn.max('version').as('max'))
    .executeTakeFirst()
  return row?.max == null ? null : Number(row.max)
}

export type DatasetStatus = {
  version: number
  source: string
  sha256: string
  stated: DatasetCounts
  counted: DatasetCounts
}

/** Each dataset version with the counts its source states and its recount (OWN-DEC-179 rule 2). */
export async function datasetStatus(db: Db | Tx): Promise<DatasetStatus[]> {
  const sets = await db
    .selectFrom('platform.coverage_zip_datasets')
    .select(['version', 'source', 'content_sha256', 'stated_counts'])
    .orderBy('version')
    .execute()
  const out: DatasetStatus[] = []
  for (const s of sets)
    out.push({
      version: s.version,
      source: s.source,
      sha256: s.content_sha256,
      stated: s.stated_counts as DatasetCounts,
      counted: countDataset(await datasetEntries(db, s.version)),
    })
  return out
}

export type ImportSummary = {
  version: number
  areaVersion: number
  /** The dataset the source file verified (null when no dataset exists: the file alone). */
  datasetVersion: number | null
  counts: Record<DerivedRule['disposition'], number>
  /** The ZIPs in coverage or on the boundary, for the owner to review before approving. */
  inArea: DerivedRule[]
  /** Every difference between the dataset and the source file (OWN-DEC-179 rules 2 and 13). */
  discrepancies: DatasetDiscrepancy[]
}

const CHUNK = 1000

/** Adds a proposed rule set derived from the file and the active coverage.area. */
export async function importRuleSet(
  tx: Tx,
  input: { fileText: string; source: string; createdBy: string },
): Promise<ImportSummary> {
  const area = requireConfigured((await loadConfig(tx)).get('coverage.area'))
  const parts = parseZctaCountyFile(input.fileText)
  const datasetVersion = await latestDataset(tx)
  const { rules, discrepancies } =
    datasetVersion === null
      ? { rules: deriveRules(parts, area.value.counties), discrepancies: [] }
      : verifyDataset(parts, area.value.counties, await datasetEntries(tx, datasetVersion))
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
      dataset_version: datasetVersion,
      verification: 'source_file',
    })
    .execute()
  for (let i = 0; i < rules.length; i += CHUNK)
    await tx
      .insertInto('platform.coverage_rules')
      .values(rules.slice(i, i + CHUNK).map((r) => ({ rule_set: version, ...r })))
      .execute()
  const counts = { in_coverage: 0, boundary: 0, out_of_coverage: 0, unknown: 0 }
  for (const r of rules) counts[r.disposition]++
  return {
    version,
    areaVersion: area.version,
    datasetVersion,
    counts,
    inArea: rules.filter((r) => r.disposition === 'in_coverage' || r.disposition === 'boundary'),
    discrepancies,
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
