// Test fixture (TSK-0123; OWN-DEC-159): records a synthetic verified zone on the property of a project, as staff do on
// the property record, directly in the test database. A request's property starts with an unknown zone (no county list
// is configured), and no visit is planned on an unknown zone; tests that plan visits verify it first. The county is a
// synthetic name, never a statement about which real county uses which zone.
import { withTx, type Db } from '@handyhub/db'
import { sql } from 'kysely'

export const SYNTHETIC_COUNTY = 'Synthetic'

/** Verifies the zone of the property of a project (by id) or of a property (by id); returns the zone version. */
export async function verifyPropertyZone(
  db: Db,
  of: { projectId: string } | { propertyId: string } | { requestId: string },
  zone = 'America/Kentucky/Louisville',
): Promise<number> {
  return withTx(db, async (tx) => {
    const row =
      'propertyId' in of
        ? await tx
            .selectFrom('crm.properties')
            .select(['id', 'state', 'time_zone', 'time_zone_version'])
            .where('id', '=', of.propertyId)
            .forUpdate()
            .executeTakeFirstOrThrow()
        : await tx
            .selectFrom('crm.properties as pr')
            .innerJoin('crm.projects as p', 'p.property_id', 'pr.id')
            .select(['pr.id', 'pr.state', 'pr.time_zone', 'pr.time_zone_version'])
            .where(
              'p.id',
              '=',
              'projectId' in of
                ? of.projectId
                : sql<string>`(SELECT project_id FROM intake.requests WHERE id = ${of.requestId}::uuid)`,
            )
            .forUpdate('pr')
            .executeTakeFirstOrThrow()
    const staff = await tx.selectFrom('identity.staff_users').select('id').orderBy('created_at').executeTakeFirst()
    const version = row.time_zone_version + 1
    const counties = [`${row.state}:${SYNTHETIC_COUNTY}`]
    await tx
      .insertInto('crm.property_time_zones')
      .values({
        property_id: row.id,
        zone_version: version,
        time_zone: zone,
        status: 'verified',
        basis: 'verified_county',
        counties,
        previous_zone: row.time_zone,
        reason: 'Synthetic test verification',
        recorded_by: staff?.id ?? null,
      })
      .execute()
    await tx
      .updateTable('crm.properties')
      .set({
        time_zone: zone,
        time_zone_status: 'verified',
        time_zone_basis: 'verified_county',
        time_zone_counties: counties,
        time_zone_version: version,
      })
      .where('id', '=', row.id)
      .execute()
    return version
  })
}
