// The site checks a first visit confirmation needs (TSK-0127, final owner amendments 2026-10-22; TSK-0126,
// OWN-DEC-167). Specs whose subject is not those checks record them in the database, as staff would on the property
// record and the project's visits: the address-and-county check, the customer designated as their own site contact
// with both authorities, and the SERVED coverage accepted. The county is one of coverage.area (OWN-DEC-37) and every
// record is the spec's own synthetic data (RULE-SYNTHETIC-DATA).
import { createDb } from '@handyhub/db'

/** Records a verified in-area county for the current address version of the project's property, and the other checks. */
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
    const staff = { id: await checker(db) }
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
    await recordSiteChecks(databaseUrl, projectId)
  } finally {
    await db.destroy()
  }
}

/**
 * An Office account of the fixtures, for a spec that records the checks before any Owner or Office exists (the site
 * checks are written by a live Owner or Office, migration 0106). It has no sign-in and is never an Owner, so the staff
 * sign-in spec still finds none.
 */
async function fixtureOffice(db: ReturnType<typeof createDb>): Promise<string> {
  const user = await db
    .insertInto('identity.staff_users')
    .values({ email: 'e2e-site-checks-fixture@example.test', display_name: 'E2E Site Checks Fixture', locale: 'en' })
    .returning('id')
    .executeTakeFirstOrThrow()
  await db
    .insertInto('identity.role_grants')
    .values({ staff_user_id: user.id, kind: 'role', name: 'office', issued_by: 'e2e:site-checks', reason: null })
    .execute()
  return user.id
}

/** The staff member who records the checks: the first live Owner or Office, else the fixtures' own Office. */
async function checker(db: ReturnType<typeof createDb>): Promise<string> {
  const grant = await db
    .selectFrom('identity.role_grants')
    .select('staff_user_id')
    .where('kind', '=', 'role')
    .where('name', 'in', ['owner', 'office'])
    .where('ended_at', 'is', null)
    .orderBy('effective_from')
    .orderBy('id')
    .limit(1)
    .executeTakeFirst()
  return grant?.staff_user_id ?? fixtureOffice(db)
}

/** The site contact (the customer, both authorities) and the SERVED coverage on the current county check. */
export async function recordSiteChecks(databaseUrl: string, projectId: string): Promise<void> {
  const db = createDb(databaseUrl, { max: 1, applicationName: 'e2e-site-checks' })
  try {
    const staff = { staff_user_id: await checker(db) }
    const contact = await db
      .selectFrom('crm.projects as pj')
      .innerJoin('crm.contacts as c', 'c.customer_id', 'pj.customer_id')
      .select(['c.id', 'c.full_name', 'c.phone_e164', 'c.email'])
      .where('pj.id', '=', projectId)
      .orderBy('c.is_primary', 'desc')
      .orderBy('c.created_at')
      .limit(1)
      .executeTakeFirstOrThrow()
    const last = await db
      .selectFrom('crm.project_site_contacts')
      .select((eb) => eb.fn.max('version').as('v'))
      .where('project_id', '=', projectId)
      .executeTakeFirst()
    await db
      .insertInto('crm.project_site_contacts')
      .values({
        project_id: projectId,
        version: Number(last?.v ?? 0) + 1,
        designation: 'customer',
        contact_id: contact.id,
        full_name: contact.full_name,
        phone_e164: contact.phone_e164,
        email: contact.email,
        authority: ['property_access', 'visit_coordination'],
        source: 'customer_call',
        recorded_by: staff.staff_user_id,
      })
      .execute()
    const check = await db
      .selectFrom('crm.projects as pj')
      .innerJoin('crm.properties as p', 'p.id', 'pj.property_id')
      .innerJoin('crm.property_county_verifications as v', (j) =>
        j.onRef('v.property_id', '=', 'p.id').onRef('v.address_version', '=', 'p.address_version'),
      )
      .select(['v.id', 'v.in_area'])
      .where('pj.id', '=', projectId)
      .orderBy('v.seq', 'desc')
      .limit(1)
      .executeTakeFirst()
    if (check?.in_area)
      await db
        .insertInto('crm.project_coverage_acceptances')
        .values({
          project_id: projectId,
          county_verification_id: check.id,
          outcome: 'served',
          accepted_by: staff.staff_user_id,
        })
        .execute()
  } finally {
    await db.destroy()
  }
}
