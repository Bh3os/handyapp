// The staff address-and-county check a first visit confirmation needs (TSK-0127, final owner amendments 2026-10-22).
// Tests whose subject is not that check record it directly, as staff would through
// POST /staff/properties/:propertyId/county-verification (tested in confirmation-preconditions.test.ts). The county is
// one of coverage.area (OWN-DEC-37); the property and the staff member are the test's own synthetic records.
import type { Db, Tx } from '@handyhub/db'
import { sql } from 'kysely'

/** Records a verified in-area county for the current address version of the project's property. */
export async function verifyCountyOf(
  db: Db | Tx,
  projectId: string,
  opts: { verifiedBy?: string; state?: string; county?: string; inArea?: boolean } = {},
): Promise<void> {
  const res = await sql`
    INSERT INTO crm.property_county_verifications
      (property_id, address_version, state, county, in_area, area_version, verified_by)
    SELECT p.id, p.address_version, ${opts.state ?? 'KY'}, ${opts.county ?? 'Jefferson'}, ${opts.inArea ?? true},
      (SELECT version FROM platform.policy_version WHERE key = 'coverage.area' AND status = 'active'),
      coalesce(${opts.verifiedBy ?? null}::uuid, (SELECT id FROM identity.staff_users ORDER BY created_at LIMIT 1))
    FROM crm.projects pj JOIN crm.properties p ON p.id = pj.property_id
    WHERE pj.id = ${projectId}`.execute(db)
  if (Number(res.numAffectedRows ?? 0) !== 1) throw new Error(`no property for project ${projectId}`)
}
