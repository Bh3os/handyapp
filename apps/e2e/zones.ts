// The property zone of an e2e request (TSK-0123; OWN-DEC-159). A request's property starts with an unknown zone (no
// county list is configured), and no visit is planned on an unknown zone; specs that plan visits record a synthetic
// known zone first, straight in the e2e database: recorded as derived from a synthetic county (as a configured county
// list would derive it), so no staff row is needed and the first-Owner flow is never touched. The time-zones spec
// verifies a zone through the staff app itself. The county is a synthetic name, never a statement about which real
// county uses which zone.
import type { createDb } from '@handyhub/db'

type Db = ReturnType<typeof createDb>

export async function verifyPropertyZone(db: Db, projectId: string, zone = 'America/Kentucky/Louisville') {
  await db.transaction().execute(async (tx) => {
    const p = await tx
      .selectFrom('crm.properties as pr')
      .innerJoin('crm.projects as p', 'p.property_id', 'pr.id')
      .select(['pr.id', 'pr.state', 'pr.time_zone', 'pr.time_zone_version'])
      .where('p.id', '=', projectId)
      .forUpdate('pr')
      .executeTakeFirstOrThrow()
    const version = p.time_zone_version + 1
    const counties = [`${p.state}:Synthetic`]
    await tx
      .insertInto('crm.property_time_zones')
      .values({
        property_id: p.id,
        zone_version: version,
        time_zone: zone,
        status: 'derived',
        basis: 'zip_counties',
        counties,
        previous_zone: p.time_zone,
      })
      .execute()
    await tx
      .updateTable('crm.properties')
      .set({
        time_zone: zone,
        time_zone_status: 'derived',
        time_zone_basis: 'zip_counties',
        time_zone_counties: counties,
        time_zone_version: version,
      })
      .where('id', '=', p.id)
      .execute()
  })
}
