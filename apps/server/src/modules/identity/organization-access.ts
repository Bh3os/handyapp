// What an account reaches through its organization memberships (TSK-0118; HH-ID-13, HH-ID-03, RULE-SERVER-AUTHZ).
// Read on every request from the records as they are now, never kept in a session, so removing a membership, a
// project from the organization or from the member's scope, or the administrator's own link to the project ends the
// access on the very next request. A project reaches a member only while all of these hold:
// - the membership is active and the member's account is the one that accepted it;
// - the membership's scope names the project, and the organization still shares it (organization_projects);
// - the organization's administrator account is active and still holds an active, code-verified link to the project.
// So a membership never grants more than its scope, and an organization never more than its administrator holds.
// Several memberships reaching one project combine their privileges.
import type { Db, Tx } from '@handyhub/db'
import type { OrganizationPrivilege } from '@handyhub/policy'

/** One project an account reaches through its memberships, with the privileges they grant on it. */
export type OrganizationProjectAccess = {
  projectId: string
  privileges: OrganizationPrivilege[]
  /** The organizations it is shared through, by id (at least one), and their names in the same order. */
  organizationIds: string[]
  organizationNames: string[]
}

/**
 * The projects `accountId` reaches as an organization member (optionally only `projectId`), newest membership
 * first. With `lock`, the memberships, scope rows and the administrator's links are locked FOR SHARE, so a write that
 * acts through the access (an approval) and a concurrent removal are ordered.
 */
export async function organizationAccessOf(
  db: Db | Tx,
  accountId: string,
  options: { projectId?: string; lock?: boolean } = {},
): Promise<OrganizationProjectAccess[]> {
  let q = db
    .selectFrom('identity.organization_memberships as m')
    .innerJoin('identity.customer_accounts as member', 'member.id', 'm.account_id')
    .innerJoin('identity.organizations as o', 'o.id', 'm.organization_id')
    .innerJoin('identity.customer_accounts as admin', 'admin.id', 'o.administrator_account_id')
    .innerJoin('identity.organization_scopes as s', 's.membership_id', 'm.id')
    .innerJoin('identity.organization_projects as op', (j) =>
      j.onRef('op.organization_id', '=', 's.organization_id').onRef('op.project_id', '=', 's.project_id'),
    )
    .innerJoin('identity.customer_identity_links as l', (j) =>
      j.onRef('l.account_id', '=', 'o.administrator_account_id').onRef('l.project_id', '=', 's.project_id'),
    )
    .select(['s.project_id', 'm.organization_id', 'o.name', 'm.can_approve', 'm.can_pay'])
    .where('m.account_id', '=', accountId)
    .where('m.state', '=', 'active')
    .where('member.state', '=', 'active')
    .where('admin.state', '=', 'active')
    .where('l.state', '=', 'active')
    .orderBy('m.accepted_at', 'desc')
    .orderBy('s.project_id')
  if (options.projectId !== undefined) q = q.where('s.project_id', '=', options.projectId)
  if (options.lock) q = q.forShare(['m', 's', 'l'])
  const rows = await q.execute()
  const byProject = new Map<string, OrganizationProjectAccess>()
  for (const r of rows) {
    const a = byProject.get(r.project_id) ?? {
      projectId: r.project_id,
      privileges: [],
      organizationIds: [],
      organizationNames: [],
    }
    if (r.can_approve && !a.privileges.includes('approve')) a.privileges.push('approve')
    if (r.can_pay && !a.privileges.includes('pay')) a.privileges.push('pay')
    if (!a.organizationIds.includes(r.organization_id)) {
      a.organizationIds.push(r.organization_id)
      a.organizationNames.push(r.name)
    }
    byProject.set(r.project_id, a)
  }
  return [...byProject.values()].map((a) => ({ ...a, privileges: [...a.privileges].sort() }))
}
