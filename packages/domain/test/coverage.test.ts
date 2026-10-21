// Coverage rules from a synthetic ZCTA-to-county file (TSK-0022; HH-CUS-03, OWN-DEC-37, OWN-DEC-88). Every ZIP and
// county here is synthetic (RULE-SYNTHETIC-DATA); real rules come only from the official file.
import { describe, expect, it } from 'vitest'
import { CoverageSourceError, deriveRules, parseZctaCountyFile, zip5 } from '../src/coverage.js'

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
    expect(rules).toEqual([
      { zip5: '99901', disposition: 'in_coverage', counties: ['KY:Alpha'] },
      { zip5: '99902', disposition: 'boundary', counties: ['KY:Alpha'] },
      { zip5: '99903', disposition: 'in_coverage', counties: ['IN:Gamma'] },
      { zip5: '99904', disposition: 'out_of_coverage', counties: [] },
      { zip5: '99905', disposition: 'out_of_coverage', counties: [] },
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
