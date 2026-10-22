// Coverage rules (TSK-0022; HH-CUS-03, ENT-CoverageRule, FACT-SERVICE-AREA, OWN-DEC-37, OWN-DEC-88). Pure functions
// shared by the server, its import command and the site:
// - the four outcomes and the ZIP format;
// - deriving a ZIP's disposition from the official Census ZCTA-to-county relationship file and the configured
//   counties (OWN-DEC-37: the ZIP list is derived from that file, never typed by hand or guessed). A ZCTA whose land
//   lies wholly in the area is in coverage, partly in it is boundary (the address is checked), and otherwise out of
//   coverage. A ZIP that is not a ZCTA in the file gets no rule, so it stays unknown and staff check it.
// - TSK-0127 (OWN-DEC-179, HH-CUS-03): the owner's candidate ZIP dataset (its ZIP codes, their category and every
//   service-county association) as versioned policy data, seeded by migration 0067. Its recount, its canonical text
//   (hashed into the dataset version), the rules it gives on its own while no geographic verification source is
//   configured, and its verification against the Census file once one is supplied, with every discrepancy reported.
//   PO Box and Unique ZIPs are mailing ZIPs: they never prove that a property is covered.
// Nothing here holds a ZIP code or a county: both come from configuration, the seeded dataset and the supplied file.

/** The four outcomes (OWN-DEC-88); the same values are stored on the property and the request. */
export const COVERAGE_OUTCOMES = ['in_coverage', 'boundary', 'out_of_coverage', 'unknown'] as const
export type CoverageOutcome = (typeof COVERAGE_OUTCOMES)[number]
export type Disposition = Exclude<CoverageOutcome, 'unknown'>

/**
 * OWN-DEC-179's names for the four outcomes. PROPOSED mapping (OQ-READINGS-2026-10-21 item 7): SERVED = served,
 * EDGE = near the boundary, OUTSIDE = outside the usual area, UNKNOWN = unknown; the owner's messages stay (OWN-DEC-88).
 */
export const COVERAGE_CODE = {
  in_coverage: 'SERVED',
  boundary: 'EDGE',
  out_of_coverage: 'OUTSIDE',
  unknown: 'UNKNOWN',
} as const satisfies Record<CoverageOutcome, string>
export type CoverageCode = (typeof COVERAGE_CODE)[CoverageOutcome]

/** The ZIP categories of OWN-DEC-179. PO Box and Unique ZIPs receive mail only: never proof of a property's place. */
export const ZIP_CATEGORIES = ['standard', 'po_box', 'unique'] as const
export type ZipCategory = (typeof ZIP_CATEGORIES)[number]
export const isMailingZip = (category: ZipCategory | null) => category === 'po_box' || category === 'unique'

/**
 * Why a ZIP has its outcome (PROPOSED codes, shown to staff). From a rule:
 * - dataset_one_county: a Standard ZIP the owner's dataset ties to one service county (SERVED; no source verified it);
 * - dataset_several_counties: a ZIP the dataset ties to several service counties (EDGE: the address decides);
 * - mailing_zip: a PO Box or Unique ZIP (UNKNOWN: a physical service address is needed);
 * - source_inside / source_partly_inside / source_outside: the verification source places the ZIP's land wholly,
 *   partly or not at all in the area (SERVED, EDGE, OUTSIDE);
 * - source_missing: a dataset ZIP the verification source does not list (EDGE).
 * Without a rule: not_listed (the active set has no rule for the ZIP), not_configured (no active rule set) and
 * lookup_failed (the lookup failed; the request is still saved), each UNKNOWN.
 */
export const COVERAGE_REASONS = [
  'dataset_one_county',
  'dataset_several_counties',
  'mailing_zip',
  'source_inside',
  'source_partly_inside',
  'source_outside',
  'source_missing',
  'not_listed',
  'not_configured',
  'lookup_failed',
] as const
export type CoverageReason = (typeof COVERAGE_REASONS)[number]
export type RuleReason = Exclude<CoverageReason, 'not_listed' | 'not_configured' | 'lookup_failed'>

/** The reason of a rule recorded before reasons existed (migration 0015 rule sets, all from the source file). */
export const legacyReason = (d: CoverageOutcome): RuleReason =>
  d === 'in_coverage'
    ? 'source_inside'
    : d === 'boundary'
      ? 'source_partly_inside'
      : d === 'out_of_coverage'
        ? 'source_outside'
        : 'mailing_zip'

/** A US ZIP code, five digits with an optional +4; coverage reads the first five. */
export const ZIP_PATTERN = '^[0-9]{5}(-[0-9]{4})?$'
const ZIP = new RegExp(ZIP_PATTERN)

/** The five-digit ZIP of a valid ZIP or ZIP+4, otherwise null (an invalid format gets no outcome). */
export function zip5(input: string): string | null {
  const z = input.trim()
  return ZIP.test(z) ? z.slice(0, 5) : null
}

export type AreaCounty = { readonly state: string; readonly county: string }

/** 'KY:Jefferson': a county named with its state, as rules record it. */
export const countyKey = (c: AreaCounty) => `${c.state}:${c.county}`

/** State FIPS codes of the states the area may name (OWN-DEC-03: Kentucky and Indiana). */
export const STATE_FIPS: Readonly<Record<string, string>> = { '21': 'KY', '18': 'IN' }

export type ZctaCountyPart = { zcta: string; state: string | null; county: string; landArea: number }

export class CoverageSourceError extends Error {
  override name = 'CoverageSourceError'
}

const COLUMNS = ['GEOID_ZCTA5_20', 'GEOID_COUNTY_20', 'NAMELSAD_COUNTY_20', 'AREALAND_PART'] as const

/**
 * Parses the Census 2020 ZCTA-to-county relationship file (pipe-delimited, one row per ZCTA and county part; columns
 * found by their header names). Rows without a ZCTA (county parts outside every ZCTA) are skipped.
 */
export function parseZctaCountyFile(text: string): ZctaCountyPart[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/)
  const header = (lines[0] ?? '').split('|')
  const at = Object.fromEntries(COLUMNS.map((c) => [c, header.indexOf(c)])) as Record<(typeof COLUMNS)[number], number>
  for (const c of COLUMNS) if (at[c] < 0) throw new CoverageSourceError(`the file has no ${c} column`)
  const parts: ZctaCountyPart[] = []
  for (const [i, line] of lines.slice(1).entries()) {
    if (line.trim() === '') continue
    const f = line.split('|')
    const zcta = f[at.GEOID_ZCTA5_20] ?? ''
    if (zcta === '') continue
    const geoid = f[at.GEOID_COUNTY_20] ?? ''
    const name = f[at.NAMELSAD_COUNTY_20] ?? ''
    const land = Number(f[at.AREALAND_PART])
    if (!/^[0-9]{5}$/.test(zcta) || !/^[0-9]{5}$/.test(geoid) || !name || !Number.isFinite(land) || land < 0)
      throw new CoverageSourceError(`line ${i + 2} is not a ZCTA-to-county row`)
    parts.push({
      zcta,
      state: STATE_FIPS[geoid.slice(0, 2)] ?? null,
      county: name.replace(/ County$/, ''),
      landArea: land,
    })
  }
  if (parts.length === 0) throw new CoverageSourceError('the file has no ZCTA rows')
  return parts
}

export type DerivedRule = {
  zip5: string
  disposition: CoverageOutcome
  counties: string[]
  /** The dataset's category of the ZIP; null when the ZIP is not in the dataset or the dataset names none. */
  zip_category: ZipCategory | null
  reason: RuleReason
}

/** One rule per ZCTA in the file, from the configured counties. Water-only parts count only when there is no land. */
export function deriveRules(parts: readonly ZctaCountyPart[], area: readonly AreaCounty[]): DerivedRule[] {
  const inArea = new Set(area.map(countyKey))
  const byZip = new Map<string, ZctaCountyPart[]>()
  for (const p of parts) byZip.set(p.zcta, [...(byZip.get(p.zcta) ?? []), p])
  const rules: DerivedRule[] = []
  for (const [zip, all] of [...byZip].sort(([a], [b]) => a.localeCompare(b))) {
    const land = all.filter((p) => p.landArea > 0)
    const counted = land.length ? land : all
    const keys = counted.map((p) => (p.state ? `${p.state}:${p.county}` : null))
    const inside = [...new Set(keys.filter((k): k is string => k !== null && inArea.has(k)))].sort()
    const disposition: Disposition =
      inside.length === 0
        ? 'out_of_coverage'
        : keys.every((k) => k !== null && inArea.has(k))
          ? 'in_coverage'
          : 'boundary'
    rules.push({ zip5: zip, disposition, counties: inside, zip_category: null, reason: legacyReason(disposition) })
  }
  return rules
}

// ---------------------------------------------------------------------------------------------------------------
// The owner's candidate ZIP dataset (TSK-0127; OWN-DEC-179).

/** One ZIP of the dataset: its category (null where the dataset names none) and every service county it lists. */
export type DatasetEntry = { zip5: string; category: ZipCategory | null; counties: readonly string[] }

/** The counts OWN-DEC-179 states for its dataset, recounted on import (rule 2). */
export type DatasetCounts = {
  unique: number
  singleCounty: { total: number; standard: number; poBox: number; unique: number }
  multiCounty: { total: number; byState: Record<string, number> }
}

/** Recounts a dataset: unique ZIPs, the single-county ZIPs by category, and the multi-county ZIPs by state. */
export function countDataset(entries: readonly DatasetEntry[]): DatasetCounts {
  const byZip = new Map(entries.map((e) => [e.zip5, e]))
  const all = [...byZip.values()]
  const single = all.filter((e) => e.counties.length === 1)
  const multi = all.filter((e) => e.counties.length > 1)
  const byState: Record<string, number> = {}
  for (const e of multi) {
    const states = [...new Set(e.counties.map((c) => c.split(':')[0] ?? ''))].sort().join('+')
    byState[states] = (byState[states] ?? 0) + 1
  }
  return {
    unique: all.length,
    singleCounty: {
      total: single.length,
      standard: single.filter((e) => e.category === 'standard').length,
      poBox: single.filter((e) => e.category === 'po_box').length,
      unique: single.filter((e) => e.category === 'unique').length,
    },
    multiCounty: { total: multi.length, byState },
  }
}

/** Every difference between the counts a dataset states and its recount, as "path: stated N, counted M". */
export function countDiscrepancies(stated: DatasetCounts, counted: DatasetCounts): string[] {
  const out: string[] = []
  const walk = (path: string, a: unknown, b: unknown) => {
    if (typeof a === 'number' || typeof b === 'number') {
      if (a !== b) out.push(`${path}: stated ${String(a ?? 0)}, counted ${String(b ?? 0)}`)
      return
    }
    const ao = (a ?? {}) as Record<string, unknown>
    const bo = (b ?? {}) as Record<string, unknown>
    for (const k of [...new Set([...Object.keys(ao), ...Object.keys(bo)])].sort())
      walk(path ? `${path}.${k}` : k, ao[k], bo[k])
  }
  walk('', stated, counted)
  return out
}

/** ZIPs that appear more than once in a list of entries (a dataset lists each ZIP once). */
export function duplicateZips(entries: readonly DatasetEntry[]): string[] {
  const seen = new Set<string>()
  const dups = new Set<string>()
  for (const e of entries) (seen.has(e.zip5) ? dups : seen).add(e.zip5)
  return [...dups].sort()
}

/**
 * The canonical text of a dataset, hashed into its version (migration 0067 computes the same text in SQL): one line
 * per ZIP in ZIP order, `zip|category|county+county`, the counties in the order the dataset lists them.
 */
export function datasetCanonicalText(entries: readonly DatasetEntry[]): string {
  return [...entries]
    .sort((a, b) => a.zip5.localeCompare(b.zip5))
    .map((e) => `${e.zip5}|${e.category ?? ''}|${e.counties.join('+')}`)
    .join('\n')
}

/**
 * The rule a dataset ZIP gets while no geographic verification source is configured (PROPOSED reading of
 * OWN-DEC-179, OQ-READINGS-2026-10-21 item 7, with the dataset standing in for the source): a PO Box or Unique ZIP is
 * UNKNOWN; a ZIP tied to several service counties is EDGE; a Standard ZIP tied to one service county is SERVED. The
 * final result for a property comes from its verified address at confirmation (OWN-DEC-167).
 */
export function datasetRule(e: DatasetEntry): DerivedRule {
  const counties = [...e.counties].sort()
  if (isMailingZip(e.category))
    return { zip5: e.zip5, disposition: 'unknown', counties, zip_category: e.category, reason: 'mailing_zip' }
  if (counties.length > 1)
    return {
      zip5: e.zip5,
      disposition: 'boundary',
      counties,
      zip_category: e.category,
      reason: 'dataset_several_counties',
    }
  return { zip5: e.zip5, disposition: 'in_coverage', counties, zip_category: e.category, reason: 'dataset_one_county' }
}

export type DatasetDiscrepancy = {
  zip5: string
  kind:
    | 'missing_from_dataset'
    | 'missing_from_source'
    | 'county_mismatch'
    | 'source_partly_outside'
    | 'source_outside'
    | 'county_not_in_area'
  /** The dataset's service counties for the ZIP (empty when it is not in the dataset). */
  dataset: string[]
  /** The source's service counties for the ZIP (empty when the source places none in the area or lacks the ZIP). */
  source: string[]
}

/**
 * Verifies the dataset against the Census ZCTA-to-county file (OWN-DEC-179 rules 1, 4, 7, 13): the source decides
 * each ZIP it lists (wholly inside SERVED, partly EDGE, outside OUTSIDE); a dataset ZIP the source does not list is
 * EDGE; a ZIP the source places in the area that the dataset misses is added from the source; PO Box and Unique ZIPs
 * stay UNKNOWN whatever the source says. Every difference is reported, never filled silently.
 */
export function verifyDataset(
  parts: readonly ZctaCountyPart[],
  area: readonly AreaCounty[],
  dataset: readonly DatasetEntry[],
): { rules: DerivedRule[]; discrepancies: DatasetDiscrepancy[] } {
  const fromSource = new Map(deriveRules(parts, area).map((r) => [r.zip5, r]))
  const inArea = new Set(area.map(countyKey))
  const listed = new Map(dataset.map((e) => [e.zip5, e]))
  const rules: DerivedRule[] = []
  const discrepancies: DatasetDiscrepancy[] = []
  for (const zip of [...new Set([...fromSource.keys(), ...listed.keys()])].sort()) {
    const src = fromSource.get(zip)
    const entry = listed.get(zip)
    const datasetCounties = entry ? [...entry.counties].sort() : []
    const report = (kind: DatasetDiscrepancy['kind']) =>
      discrepancies.push({ zip5: zip, kind, dataset: datasetCounties, source: src?.counties ?? [] })
    if (entry && datasetCounties.some((c) => !inArea.has(c))) report('county_not_in_area')
    if (!entry) {
      if (src && src.disposition !== 'out_of_coverage') report('missing_from_dataset')
      if (src) rules.push(src)
      continue
    }
    if (isMailingZip(entry.category)) {
      rules.push(datasetRule(entry))
      continue
    }
    if (!src) {
      report('missing_from_source')
      rules.push({ ...datasetRule(entry), disposition: 'boundary', reason: 'source_missing' })
      continue
    }
    if (src.disposition === 'out_of_coverage') report('source_outside')
    else {
      if (src.disposition === 'boundary') report('source_partly_outside')
      if (src.counties.join('+') !== datasetCounties.join('+')) report('county_mismatch')
    }
    rules.push({ ...src, zip_category: entry.category })
  }
  return { rules, discrepancies }
}
