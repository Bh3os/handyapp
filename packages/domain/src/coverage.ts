// Coverage rules (TSK-0022; HH-CUS-03, ENT-CoverageRule, FACT-SERVICE-AREA, OWN-DEC-37, OWN-DEC-88). Pure functions
// shared by the server, its import command and the site:
// - the four outcomes and the ZIP format;
// - deriving a ZIP's disposition from the official Census ZCTA-to-county relationship file and the configured
//   counties (OWN-DEC-37: the ZIP list is derived from that file, never typed by hand or guessed). A ZCTA whose land
//   lies wholly in the area is in coverage, partly in it is boundary (the address is checked), and otherwise out of
//   coverage. A ZIP that is not a ZCTA in the file gets no rule, so it stays unknown and staff check it.
// Nothing here holds a ZIP code or a county: both come from configuration and the supplied file.

/** The four outcomes (OWN-DEC-88); the same values are stored on the property and the request. */
export const COVERAGE_OUTCOMES = ['in_coverage', 'boundary', 'out_of_coverage', 'unknown'] as const
export type CoverageOutcome = (typeof COVERAGE_OUTCOMES)[number]
export type Disposition = Exclude<CoverageOutcome, 'unknown'>

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

export type DerivedRule = { zip5: string; disposition: Disposition; counties: string[] }

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
    rules.push({ zip5: zip, disposition, counties: inside })
  }
  return rules
}
