// A synthetic Census-format ZCTA-to-county relationship file (RULE-SYNTHETIC-DATA): the 999xx ZIPs do not exist, so
// no real ZIP is ever given a disposition by a test. County names are those of coverage.area (OWN-DEC-37), with state
// FIPS 21 (Kentucky) and 18 (Indiana); "Synthetic County" stands for any county outside the area.
export const RELATIONSHIP_HEADER =
  'OID_ZCTA5_20|GEOID_ZCTA5_20|NAMELSAD_ZCTA5_20|AREALAND_ZCTA5_20|AREAWATER_ZCTA5_20|MTFCC_ZCTA5_20|CLASSFP_ZCTA5_20|' +
  'FUNCSTAT_ZCTA5_20|OID_COUNTY_20|GEOID_COUNTY_20|NAMELSAD_COUNTY_20|AREALAND_COUNTY_20|AREAWATER_COUNTY_20|' +
  'MTFCC_COUNTY_20|CLASSFP_COUNTY_20|FUNCSTAT_COUNTY_20|AREALAND_PART|AREAWATER_PART'

const row = (zcta: string, geoid: string, county: string, land: number) =>
  `1|${zcta}|ZCTA5 ${zcta}|10|0|G6350|B5|S|2|${geoid}|${county}|10|0|G4020|H1|A|${land}|0`

/** 99901 in coverage, 99902 on the boundary, 99903 in coverage (Indiana), 99904 out of coverage; 99999 unlisted. */
export const SYNTHETIC_ZIPS = { inCoverage: '99901', boundary: '99902', outside: '99904', unlisted: '99999' } as const

export const SYNTHETIC_RELATIONSHIP_FILE = [
  RELATIONSHIP_HEADER,
  row('99901', '21901', 'Jefferson County', 100),
  row('99902', '21902', 'Oldham County', 70),
  row('99902', '21903', 'Synthetic County', 30),
  row('99903', '18904', 'Washington County', 100),
  row('99904', '21903', 'Synthetic County', 100),
  '',
].join('\n')

/**
 * ZIPs of the owner's dataset (OWN-DEC-179, migration 0067): business data from the decision, not personal data. Each
 * stands for one rule of the dataset-only rule set (verification NOT CONFIGURED).
 */
export const DATASET_ZIPS = {
  /** Jefferson County, KY, Standard: SERVED. */
  served: '40202',
  /** Floyd County, IN, Standard: SERVED. */
  servedIndiana: '47150',
  /** Jefferson + Oldham, KY: EDGE. */
  severalCounties: '40241',
  /** Clark + Floyd + Washington, IN: EDGE. */
  severalCountiesIndiana: '47106',
  /** Jefferson County, KY, PO Box: UNKNOWN. */
  poBox: '40201',
  /** Jefferson County, KY, Unique: UNKNOWN. */
  unique: '40225',
} as const
