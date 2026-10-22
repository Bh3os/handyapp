// Coverage rules from a synthetic ZCTA-to-county file (TSK-0022; HH-CUS-03, OWN-DEC-37, OWN-DEC-88). Every ZIP and
// county here is synthetic (RULE-SYNTHETIC-DATA); real rules come only from the official file.
import { describe, expect, it } from 'vitest'
import {
  COVERAGE_CODE,
  countDataset,
  countDiscrepancies,
  CoverageSourceError,
  datasetCanonicalText,
  datasetRule,
  deriveRules,
  duplicateZips,
  isMailingZip,
  parseZctaCountyFile,
  verifyDataset,
  zip5,
  type DatasetEntry,
} from '../src/coverage.js'

const HEADER =
  'OID_ZCTA5_20|GEOID_ZCTA5_20|NAMELSAD_ZCTA5_20|AREALAND_ZCTA5_20|AREAWATER_ZCTA5_20|MTFCC_ZCTA5_20|CLASSFP_ZCTA5_20|' +
  'FUNCSTAT_ZCTA5_20|OID_COUNTY_20|GEOID_COUNTY_20|NAMELSAD_COUNTY_20|AREALAND_COUNTY_20|AREAWATER_COUNTY_20|' +
  'MTFCC_COUNTY_20|CLASSFP_COUNTY_20|FUNCSTAT_COUNTY_20|AREALAND_PART|AREAWATER_PART'
const row = (zcta: string, county: string, name: string, land: number) =>
  `1|${zcta}|ZCTA5 ${zcta}|10|0|G6350|B5|S|2|${county}|${name}|10|0|G4020|H1|A|${land}|0`
const SYNTHETIC_FILE = [
  HEADER,
  row('99901', '21901', 'Alpha County', 100), // wholly inside
  row('99902', '21901', 'Alpha County', 60), // partly inside
  row('99902', '21902', 'Beta County', 40),
  row('99903', '18903', 'Gamma County', 100), // inside, other state
  row('99904', '21902', 'Beta County', 100), // outside
  row('99905', '21901', 'Alpha County', 0), // water-only sliver inside, land outside
  row('99905', '47905', 'Delta County', 50),
  '|||||||||5|21902|Beta County|10|0|G4020|H1|A|5|0', // county part outside every ZCTA
  '',
].join('\r\n')
const AREA = [
  { state: 'KY', county: 'Alpha' },
  { state: 'IN', county: 'Gamma' },
]

describe('coverage rules (TSK-0022, HH-CUS-03, OWN-DEC-37)', () => {
  it('[HH-CUS-03] a ZIP or ZIP+4 is read as five digits; anything else has no outcome', () => {
    expect(zip5('40000')).toBe('40000')
    expect(zip5(' 40000-1234 ')).toBe('40000')
    for (const bad of ['4000', '400001', 'abcde', '40000-12', '']) expect(zip5(bad), bad).toBeNull()
  })

  it('[OWN-DEC-37][HH-CUS-03] dispositions derive from the counties: wholly inside, partly inside, outside', () => {
    const rules = deriveRules(parseZctaCountyFile(SYNTHETIC_FILE), AREA)
    const none = { zip_category: null }
    expect(rules).toEqual([
      { zip5: '99901', disposition: 'in_coverage', counties: ['KY:Alpha'], reason: 'source_inside', ...none },
      { zip5: '99902', disposition: 'boundary', counties: ['KY:Alpha'], reason: 'source_partly_inside', ...none },
      { zip5: '99903', disposition: 'in_coverage', counties: ['IN:Gamma'], reason: 'source_inside', ...none },
      { zip5: '99904', disposition: 'out_of_coverage', counties: [], reason: 'source_outside', ...none },
      { zip5: '99905', disposition: 'out_of_coverage', counties: [], reason: 'source_outside', ...none },
    ])
  })

  it('[OWN-DEC-37] a county name matches only in its own state', () => {
    const rules = deriveRules(parseZctaCountyFile(SYNTHETIC_FILE), [{ state: 'IN', county: 'Alpha' }])
    expect(rules.find((r) => r.zip5 === '99901')?.disposition).toBe('out_of_coverage')
  })

  it('[RULE-NO-INVENTED-FACTS] a file that is not the relationship file is refused', () => {
    expect(() => parseZctaCountyFile('ZIP|COUNTY\n40000|Alpha')).toThrow(CoverageSourceError)
    expect(() => parseZctaCountyFile(HEADER)).toThrow(/no ZCTA rows/)
    expect(() => parseZctaCountyFile(`${HEADER}\n1|9990|x|1|0|G|B|S|2|21901|Alpha County|1|0|G|H|A|1|0`)).toThrow(
      /line 2/,
    )
  })
})

// A synthetic candidate dataset in the shape of OWN-DEC-179 (TSK-0127): the 999xx ZIPs and Alpha / Gamma counties are
// synthetic (RULE-SYNTHETIC-DATA).
const DATASET: DatasetEntry[] = [
  { zip5: '99901', category: 'standard', counties: ['KY:Alpha'] },
  { zip5: '99902', category: 'standard', counties: ['KY:Alpha'] },
  { zip5: '99904', category: 'standard', counties: ['KY:Alpha'] },
  { zip5: '99906', category: 'po_box', counties: ['KY:Alpha'] },
  { zip5: '99907', category: 'unique', counties: ['KY:Alpha'] },
  { zip5: '99908', category: null, counties: ['IN:Gamma', 'KY:Alpha'] },
  { zip5: '99909', category: 'standard', counties: ['KY:Alpha'] },
]

describe('the owner ZIP dataset (TSK-0127, OWN-DEC-179)', () => {
  it('[OWN-DEC-179] the four outcomes carry the owner’s codes (PROPOSED mapping)', () => {
    expect(COVERAGE_CODE).toEqual({
      in_coverage: 'SERVED',
      boundary: 'EDGE',
      out_of_coverage: 'OUTSIDE',
      unknown: 'UNKNOWN',
    })
  })

  it('[OWN-DEC-179] the recount counts unique, one-county by category and multi-county by state; differences named', () => {
    const counted = countDataset(DATASET)
    expect(counted).toEqual({
      unique: 7,
      singleCounty: { total: 6, standard: 4, poBox: 1, unique: 1 },
      multiCounty: { total: 1, byState: { 'IN+KY': 1 } },
    })
    expect(countDiscrepancies(counted, counted)).toEqual([])
    expect(countDiscrepancies({ ...counted, unique: 8 }, counted)).toEqual(['unique: stated 8, counted 7'])
    expect(duplicateZips([...DATASET, { zip5: '99901', category: 'standard', counties: ['KY:Alpha'] }])).toEqual([
      '99901',
    ])
    expect(countDataset([...DATASET, DATASET[0] as DatasetEntry]).unique).toBe(7)
  })

  it('[OWN-DEC-179] the canonical text lists each ZIP once in ZIP order with its category and counties', () => {
    expect(datasetCanonicalText([DATASET[5] as DatasetEntry, DATASET[0] as DatasetEntry])).toBe(
      '99901|standard|KY:Alpha\n99908||IN:Gamma+KY:Alpha',
    )
  })

  it('[OWN-DEC-179][OQ-READINGS-2026-10-21] dataset alone: one county SERVED, several EDGE, PO Box and Unique UNKNOWN', () => {
    expect(DATASET.map((e) => [e.zip5, datasetRule(e).disposition, datasetRule(e).reason])).toEqual([
      ['99901', 'in_coverage', 'dataset_one_county'],
      ['99902', 'in_coverage', 'dataset_one_county'],
      ['99904', 'in_coverage', 'dataset_one_county'],
      ['99906', 'unknown', 'mailing_zip'],
      ['99907', 'unknown', 'mailing_zip'],
      ['99908', 'boundary', 'dataset_several_counties'],
      ['99909', 'in_coverage', 'dataset_one_county'],
    ])
    expect(isMailingZip('po_box') && isMailingZip('unique') && !isMailingZip('standard') && !isMailingZip(null)).toBe(
      true,
    )
  })

  it('[OWN-DEC-179][RULE-NO-INVENTED-FACTS] the source verifies the dataset and every discrepancy is reported', () => {
    const { rules, discrepancies } = verifyDataset(parseZctaCountyFile(SYNTHETIC_FILE), AREA, DATASET)
    const by = Object.fromEntries(rules.map((r) => [r.zip5, [r.disposition, r.reason, r.zip_category]]))
    expect(by).toEqual({
      '99901': ['in_coverage', 'source_inside', 'standard'],
      '99902': ['boundary', 'source_partly_inside', 'standard'],
      '99903': ['in_coverage', 'source_inside', null],
      '99904': ['out_of_coverage', 'source_outside', 'standard'],
      '99905': ['out_of_coverage', 'source_outside', null],
      '99906': ['unknown', 'mailing_zip', 'po_box'],
      '99907': ['unknown', 'mailing_zip', 'unique'],
      '99908': ['boundary', 'source_missing', null],
      '99909': ['boundary', 'source_missing', 'standard'],
    })
    expect(discrepancies.map((d) => [d.zip5, d.kind])).toEqual([
      ['99902', 'source_partly_outside'],
      ['99903', 'missing_from_dataset'],
      ['99904', 'source_outside'],
      ['99908', 'missing_from_source'],
      ['99909', 'missing_from_source'],
    ])
  })

  it('[OWN-DEC-179] a county the source names differently from the dataset is a reported mismatch', () => {
    const { discrepancies } = verifyDataset(parseZctaCountyFile(SYNTHETIC_FILE), AREA, [
      { zip5: '99903', category: 'standard', counties: ['KY:Alpha'] },
      { zip5: '99901', category: 'standard', counties: ['KY:Beta'] },
    ])
    expect(discrepancies.filter((d) => d.kind !== 'missing_from_dataset').map((d) => [d.zip5, d.kind])).toEqual([
      ['99901', 'county_not_in_area'],
      ['99901', 'county_mismatch'],
      ['99903', 'county_mismatch'],
    ])
  })
})
