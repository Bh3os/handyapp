// A property's time zone on the server (TSK-0123; OWN-DEC-159, FACT-TIMEZONE, HH-SCH-02, HH-DATA-06, ENT-Property).
// - Derived when the property is created and again when its address changes: from the active coverage rule of its ZIP
//   (the counties the ZIP lies in) and the configured county list (geo.county_time_zones), only when every county
//   maps to one zone (@handyhub/domain deriveZone). Otherwise the zone is unknown and the database flags it in the
//   staff queue (migration 0066); nothing is planned or sent on a guessed zone.
// - Verified by Office or the Owner from the county of the verified address (the property route), with a reason.
// - Every state goes to the append-only history crm.property_time_zones and is mirrored on crm.properties.
import type { Db, Tx } from '@handyhub/db'
import { deriveZone, type CountyZone, type ZoneDerivation } from '@handyhub/domain'
import { zip5 } from '@handyhub/domain/coverage'
import { sql } from 'kysely'
import type { Config } from '../../platform/config/index.js'

type Reader = Db | Tx

/** The configured county list, or null while geo.county_time_zones is NOT CONFIGURED. */
export function countyZones(config: Config): CountyZone[] | null {
  const entry = config.get('geo.county_time_zones')
  return entry.state === 'CONFIGURED' ? entry.value.counties.map((c) => ({ ...c })) : null
}

/** The active coverage rule of a ZIP (its disposition and the area counties it reaches), or null. */
async function zipRule(db: Reader, zip: string) {
  const z = zip5(zip)
  if (!z) return null
  const row = await db
    .selectFrom('platform.coverage_rules as r')
    .innerJoin('platform.coverage_rule_sets as s', 's.version', 'r.rule_set')
    .select(['r.disposition', 'r.counties'])
    .where('s.status', '=', 'active')
    .where('r.zip5', '=', z)
    .executeTakeFirst()
  return row
    ? { disposition: row.disposition as 'in_coverage' | 'boundary' | 'out_of_coverage', counties: row.counties }
    : null
}

/**
 * The zone a property at this ZIP gets from the coverage rules and the county list. A failed lookup never blocks the
 * write that asked (a request is never refused for it): the zone is then unknown, flagged like any other.
 */
export async function derivePropertyZone(tx: Tx, zip: string, config: Config): Promise<ZoneDerivation> {
  await sql`SAVEPOINT zone_lookup`.execute(tx)
  try {
    const rule = await zipRule(tx, zip)
    await sql`RELEASE SAVEPOINT zone_lookup`.execute(tx)
    return deriveZone(rule, countyZones(config))
  } catch {
    await sql`ROLLBACK TO SAVEPOINT zone_lookup`.execute(tx)
    return deriveZone(null, null)
  }
}

/** The zone columns a new property is created with (the history's first version is written by the database). */
export const newPropertyZone = (d: ZoneDerivation) => ({
  time_zone: d.zone,
  time_zone_status: d.status,
  time_zone_basis: d.basis,
  time_zone_counties: d.counties,
  time_zone_version: 1,
})

export type ZoneState = {
  readonly zone: string | null
  readonly status: 'unknown' | 'derived' | 'verified'
  readonly basis: string
  readonly counties: readonly string[]
}

/**
 * Records the next zone version of a property (history first, then the mirror on crm.properties; the database refuses
 * any other order). The caller holds the property lock and bumps the property version. Returns the zone version, or
 * the current one when nothing changed.
 */
export async function recordPropertyZone(
  tx: Tx,
  property: { id: string; zoneVersion: number; zone: string | null; state: ZoneState },
  next: ZoneState & { readonly reason?: string | null; readonly recordedBy?: string | null },
): Promise<number> {
  const same =
    property.state.zone === next.zone &&
    property.state.status === next.status &&
    property.state.basis === next.basis &&
    JSON.stringify([...property.state.counties]) === JSON.stringify([...next.counties])
  if (same) return property.zoneVersion
  const version = property.zoneVersion + 1
  await tx
    .insertInto('crm.property_time_zones')
    .values({
      property_id: property.id,
      zone_version: version,
      time_zone: next.zone,
      status: next.status,
      basis: next.basis,
      counties: [...next.counties],
      previous_zone: property.zone,
      reason: next.reason ?? null,
      recorded_by: next.recordedBy ?? null,
    })
    .execute()
  await tx
    .updateTable('crm.properties')
    .set({
      time_zone: next.zone,
      time_zone_status: next.status,
      time_zone_basis: next.basis,
      time_zone_counties: [...next.counties],
      time_zone_version: version,
    })
    .where('id', '=', property.id)
    .execute()
  return version
}

/** A property's zone history for staff, newest first. */
export async function zoneHistory(db: Reader, propertyId: string) {
  return db
    .selectFrom('crm.property_time_zones')
    .select([
      'zone_version',
      'time_zone',
      'status',
      'basis',
      'counties',
      'previous_zone',
      'reason',
      'recorded_by',
      'recorded_at',
    ])
    .where('property_id', '=', propertyId)
    .orderBy('zone_version', 'desc')
    .execute()
}
