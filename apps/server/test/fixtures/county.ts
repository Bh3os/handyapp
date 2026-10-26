// The site checks a first visit confirmation needs (TSK-0127, final owner amendments 2026-10-22; TSK-0126,
// OWN-DEC-167). Tests whose subject is not those checks record them directly, as staff would through
// POST /staff/properties/:propertyId/county-verification, /staff/projects/:projectId/site-contact and
// /staff/projects/:projectId/coverage-acceptance (tested in confirmation-preconditions.test.ts and
// site-checks.test.ts). The county is one of coverage.area (OWN-DEC-37); the property, the customer's contact and the
// staff member are the test's own synthetic records.
import type { Db, Tx } from '@handyhub/db'
import { sql } from 'kysely'

/**
 * Records a verified in-area county for the current address version of the project's property and, unless told
 * otherwise, the other two site checks: the customer designated as their own site contact with both authorities,
 * and the coverage accepted (SERVED; nothing for a county outside the area).
 */
export async function verifyCountyOf(
  db: Db | Tx,
  projectId: string,
  opts: { verifiedBy?: string; state?: string; county?: string; inArea?: boolean; siteChecks?: boolean } = {},
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
  if (opts.siteChecks ?? true) await recordSiteChecksOf(db, projectId)
}

/**
 * Records the site contact (the customer, both authorities) and, for a county inside the area, the SERVED coverage
 * acceptance on the property's current county check; by a live Owner or Office of the test's own staff.
 */
export async function recordSiteChecksOf(db: Db | Tx, projectId: string): Promise<void> {
  const staff = sql`(SELECT g.staff_user_id FROM identity.role_grants g
    WHERE g.kind = 'role' AND g.name IN ('owner', 'office') AND g.ended_at IS NULL ORDER BY g.effective_from, g.id LIMIT 1)`
  const contact = await sql`
    INSERT INTO crm.project_site_contacts
      (project_id, version, designation, contact_id, full_name, phone_e164, email, authority, source, recorded_by)
    SELECT pj.id,
      coalesce((SELECT max(version) FROM crm.project_site_contacts WHERE project_id = pj.id), 0) + 1,
      'customer', c.id, c.full_name, c.phone_e164, c.email, ARRAY['property_access', 'visit_coordination'],
      'customer_call', ${staff}
    FROM crm.projects pj
    JOIN LATERAL (SELECT * FROM crm.contacts k WHERE k.customer_id = pj.customer_id
                  ORDER BY k.is_primary DESC, k.created_at LIMIT 1) c ON true
    WHERE pj.id = ${projectId}`.execute(db)
  if (Number(contact.numAffectedRows ?? 0) !== 1) throw new Error(`no customer contact for project ${projectId}`)
  await sql`
    INSERT INTO crm.project_coverage_acceptances (project_id, county_verification_id, outcome, accepted_by)
    SELECT pj.id, v.id, 'served', ${staff}
    FROM crm.projects pj, LATERAL crm.current_county_verification(pj.property_id) v
    WHERE pj.id = ${projectId} AND v.id IS NOT NULL AND v.in_area`.execute(db)
}
