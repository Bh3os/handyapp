// The staff address-and-county check a first visit confirmation needs (TSK-0127, final owner amendments 2026-10-22).
// Specs whose subject is not that check record it in the database, as staff would on the property record; the county
// is one of coverage.area (OWN-DEC-37) and every record is the spec's own synthetic data (RULE-SYNTHETIC-DATA).
import { createDb } from '@handyhub/db'

/** Records a verified in-area county for the current address version of the project's property. */
export async function verifyCountyOf(databaseUrl: string, projectId: string): Promise<void> {
  const db = createDb(databaseUrl, { max: 1, applicationName: 'e2e-county' })
  try {
    const property = await db
      .selectFrom('crm.projects as pj')
      .innerJoin('crm.properties as p', 'p.id', 'pj.property_id')
      .select(['p.id', 'p.address_version'])
      .where('pj.id', '=', projectId)
      .executeTakeFirstOrThrow()
    const area = await db
      .selectFrom('platform.policy_version')
      .select('version')
      .where('key', '=', 'coverage.area')
      .where('status', '=', 'active')
      .executeTakeFirstOrThrow()
    const staff = await db
      .selectFrom('identity.staff_users')
      .select('id')
      .orderBy('created_at')
      .limit(1)
      .executeTakeFirstOrThrow()
    await db
      .insertInto('crm.property_county_verifications')
      .values({
        property_id: property.id,
        address_version: property.address_version,
        state: 'KY',
        county: 'Jefferson',
        in_area: true,
        area_version: area.version,
        verified_by: staff.id,
      })
      .execute()
  } finally {
    await db.destroy()
  }
}
