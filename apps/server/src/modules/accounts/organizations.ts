// Organization accounts with explicit memberships and scopes (TSK-0118; HH-ID-13, HH-ID-03, HH-ID-02, T20,
// ENT-CustomerAccount, ENT-CustomerIdentityLink, RULE-SERVER-AUTHZ). The customer side of a property manager, a
// landlord or a business: one signed-in account sets the organization up and administers it, shares projects of its
// own verified history with it, and invites people by their exact email address, each with a scope (the shared
// projects they reach) and privileges (approve, pay).
// - Everything is granted explicitly (HH-ID-13): a shared email domain, name, address or phone never grants or
//   suggests anything; an invitation is accepted only by the account that signed in with that very email (a code
//   proved it), and only after it says so. Before accepting, an invitation shows the organization's name, the
//   privileges and how many projects it covers, never the projects or anyone's details.
// - A membership never grants more than its scope, and an organization never more than its administrator holds: what
//   a member reaches is read on every request (identity/organization-access.ts), so removing a member, a project, a
//   scope entry or the administrator's own link ends the access on the next request.
// - What a member may do on a project in scope is the policy's organization table (@handyhub/policy organization.ts):
//   read it always; approve and pay only with those privileges; everything else stays the project customer's own.
// - Every change is in the organization's append-only history (identity.organization_events) and the audit log.
// PROPOSED (no owner value, OQ-ORGANIZATION-ACCOUNTS-DETAILS): one administrator (the account that set it up), names
// of 1 to 80 characters, invitations by email only and open until accepted, declined or withdrawn, at least one
// project per membership, members see neither each other nor the organization's other projects.
import type { Db, Tx } from '@handyhub/db'
import { REFERENCE_PATTERN } from '@handyhub/domain/request-form'
import { sql } from 'kysely'
import { normaliseDestination } from '../identity/index.js'
import { ORGANIZATION_EVENT_KINDS } from '../records/projections.js'

type Reader = Db | Tx

/** PROPOSED: an organization's name is 1 to 80 characters (trimmed, inner spaces collapsed). */
export const ORGANIZATION_NAME_MAX = 80
/** PROPOSED: the history lists the latest 200 entries. */
export const HISTORY_LIMIT = 200

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type Privileges = { approve: boolean; pay: boolean }

export type EventKind = (typeof ORGANIZATION_EVENT_KINDS)[number]
export type EventActor = 'administrator' | 'member' | 'handyhub'

export type MemberView = {
  id: string
  email: string
  state: 'invited' | 'active'
  approve: boolean
  pay: boolean
  projects: string[]
  invitedAt: Date
  acceptedAt: Date | null
}

export type HistoryEntry = {
  kind: EventKind
  by: EventActor
  at: Date
  email: string | null
  reference: string | null
  approve: boolean | null
  pay: boolean | null
  scopeProjects: number | null
}

export type AdministeredOrganization = {
  id: string
  name: string
  createdAt: Date
  projects: string[]
  members: MemberView[]
  history: HistoryEntry[]
}

export type MemberOrganization = {
  id: string
  name: string
  approve: boolean
  pay: boolean
  /** The projects this membership reaches right now (its scope, as far as the organization still shares them). */
  projects: string[]
  acceptedAt: Date
}

export type Invitation = {
  id: string
  organization: string
  approve: boolean
  pay: boolean
  projects: number
  invitedAt: Date
}

export type AccountOrganizations = {
  /** The references of the account's own linked projects: what it may share with an organization it administers. */
  linkedProjects: string[]
  administered: AdministeredOrganization[]
  memberships: MemberOrganization[]
  invitations: Invitation[]
}

const tidy = (s: string) => s.trim().replace(/\s+/g, ' ')
/** A name as kept: trimmed, inner spaces collapsed; null when empty or too long. */
export function organizationNameOf(raw: string): string | null {
  const n = tidy(raw)
  return n.length >= 1 && n.length <= ORGANIZATION_NAME_MAX ? n : null
}

/** An email exactly as an invitation keeps it (lower case, trimmed); null when it is not an email address. */
export const invitedEmailOf = (raw: string): string | null => normaliseDestination('email', raw)

/** The account's own active links, by reference (newest first): the projects it may share. */
async function linkedProjects(db: Reader, accountId: string): Promise<{ id: string; reference: string }[]> {
  return db
    .selectFrom('identity.customer_identity_links as l')
    .innerJoin('identity.customer_accounts as a', 'a.id', 'l.account_id')
    .innerJoin('crm.projects as p', 'p.id', 'l.project_id')
    .select(['p.id', 'p.reference'])
    .where('l.account_id', '=', accountId)
    .where('l.state', '=', 'active')
    .where('a.state', '=', 'active')
    .orderBy('p.created_at', 'desc')
    .orderBy('p.reference', 'desc')
    .execute()
}

async function signInEmail(db: Reader, accountId: string): Promise<string | null> {
  const a = await db
    .selectFrom('identity.customer_accounts')
    .select(['sign_in_email', 'state'])
    .where('id', '=', accountId)
    .executeTakeFirst()
  return a?.state === 'active' ? a.sign_in_email : null
}

async function sharedProjects(db: Reader, organizationId: string): Promise<{ id: string; reference: string }[]> {
  return db
    .selectFrom('identity.organization_projects as op')
    .innerJoin('crm.projects as p', 'p.id', 'op.project_id')
    .select(['p.id', 'p.reference'])
    .where('op.organization_id', '=', organizationId)
    .orderBy('op.added_at')
    .orderBy('p.reference')
    .execute()
}

async function scopeOf(db: Reader, membershipIds: readonly string[]) {
  if (membershipIds.length === 0) return new Map<string, string[]>()
  const rows = await db
    .selectFrom('identity.organization_scopes as s')
    .innerJoin('crm.projects as p', 'p.id', 's.project_id')
    .select(['s.membership_id', 'p.reference'])
    .where('s.membership_id', 'in', [...membershipIds])
    .orderBy('s.added_at')
    .orderBy('p.reference')
    .execute()
  const out = new Map<string, string[]>()
  for (const r of rows) out.set(r.membership_id, [...(out.get(r.membership_id) ?? []), r.reference])
  return out
}

async function historyOf(db: Reader, organizationId: string): Promise<HistoryEntry[]> {
  const rows = await db
    .selectFrom('identity.organization_events as e')
    .leftJoin('identity.organization_memberships as m', 'm.id', 'e.membership_id')
    .leftJoin('crm.projects as p', 'p.id', 'e.project_id')
    .select(['e.kind', 'e.actor', 'e.at', 'm.invited_email', 'p.reference', 'e.can_approve', 'e.can_pay'])
    .select('e.scope_projects')
    .where('e.organization_id', '=', organizationId)
    .orderBy('e.at', 'desc')
    .orderBy('e.id', 'desc')
    .limit(HISTORY_LIMIT)
    .execute()
  return rows.map((r) => ({
    kind: r.kind as EventKind,
    by: r.actor as EventActor,
    at: r.at,
    email: r.invited_email,
    reference: r.reference,
    approve: r.can_approve,
    pay: r.can_pay,
    scopeProjects: r.scope_projects,
  }))
}

/** The organizations an account administers, belongs to and is invited to, as it may see them. */
export async function accountOrganizations(db: Reader, accountId: string): Promise<AccountOrganizations> {
  const own = await linkedProjects(db, accountId)
  const orgs = await db
    .selectFrom('identity.organizations as o')
    .innerJoin('identity.customer_accounts as a', 'a.id', 'o.administrator_account_id')
    .select(['o.id', 'o.name', 'o.created_at'])
    .where('o.administrator_account_id', '=', accountId)
    .where('a.state', '=', 'active')
    .orderBy('o.created_at')
    .execute()
  const administered: AdministeredOrganization[] = []
  for (const o of orgs) {
    const members = await db
      .selectFrom('identity.organization_memberships')
      .select(['id', 'invited_email', 'state', 'can_approve', 'can_pay', 'invited_at', 'accepted_at'])
      .where('organization_id', '=', o.id)
      .where('state', '<>', 'ended')
      .orderBy('invited_at')
      .orderBy('id')
      .execute()
    const scopes = await scopeOf(
      db,
      members.map((m) => m.id),
    )
    administered.push({
      id: o.id,
      name: o.name,
      createdAt: o.created_at,
      projects: (await sharedProjects(db, o.id)).map((p) => p.reference),
      members: members.map((m) => ({
        id: m.id,
        email: m.invited_email,
        state: m.state as 'invited' | 'active',
        approve: m.can_approve,
        pay: m.can_pay,
        projects: scopes.get(m.id) ?? [],
        invitedAt: m.invited_at,
        acceptedAt: m.accepted_at,
      })),
      history: await historyOf(db, o.id),
    })
  }

  // The memberships, with what each reaches now (the same reading as the session's, organization-access.ts).
  const mine = await db
    .selectFrom('identity.organization_memberships as m')
    .innerJoin('identity.organizations as o', 'o.id', 'm.organization_id')
    .innerJoin('identity.customer_accounts as admin', 'admin.id', 'o.administrator_account_id')
    .select(['m.id', 'o.id as organization_id', 'o.name', 'm.can_approve', 'm.can_pay', 'm.accepted_at'])
    .where('m.account_id', '=', accountId)
    .where('m.state', '=', 'active')
    .where('admin.state', '=', 'active')
    .orderBy('m.accepted_at')
    .execute()
  const reachable = mine.length
    ? await db
        .selectFrom('identity.organization_scopes as s')
        .innerJoin('identity.organizations as o', 'o.id', 's.organization_id')
        .innerJoin('identity.customer_identity_links as l', (j) =>
          j.onRef('l.account_id', '=', 'o.administrator_account_id').onRef('l.project_id', '=', 's.project_id'),
        )
        .innerJoin('crm.projects as p', 'p.id', 's.project_id')
        .select(['s.membership_id', 'p.reference'])
        .where(
          's.membership_id',
          'in',
          mine.map((m) => m.id),
        )
        .where('l.state', '=', 'active')
        .orderBy('s.added_at')
        .orderBy('p.reference')
        .execute()
    : []
  const memberships = mine.map((m) => ({
    id: m.organization_id,
    name: m.name,
    approve: m.can_approve,
    pay: m.can_pay,
    projects: reachable.filter((r) => r.membership_id === m.id).map((r) => r.reference),
    acceptedAt: m.accepted_at as Date,
  }))

  return {
    linkedProjects: own.map((p) => p.reference),
    administered,
    memberships,
    invitations: await invitationsFor(db, accountId),
  }
}

/** The open invitations to the account's own verified sign-in email (exactly that address; never its domain). */
async function invitationsFor(db: Reader, accountId: string): Promise<Invitation[]> {
  const email = await signInEmail(db, accountId)
  if (!email) return []
  const rows = await db
    .selectFrom('identity.organization_memberships as m')
    .innerJoin('identity.organizations as o', 'o.id', 'm.organization_id')
    .innerJoin('identity.customer_accounts as admin', 'admin.id', 'o.administrator_account_id')
    .select(['m.id', 'o.name', 'm.can_approve', 'm.can_pay', 'm.invited_at'])
    .select((eb) =>
      eb
        .selectFrom('identity.organization_scopes as s')
        .select((x) => x.fn.countAll<string>().as('n'))
        .whereRef('s.membership_id', '=', 'm.id')
        .as('projects'),
    )
    .where('m.state', '=', 'invited')
    .where('m.invited_email', '=', email)
    .where('admin.state', '=', 'active')
    .where('o.administrator_account_id', '<>', accountId)
    .orderBy('m.invited_at')
    .execute()
  return rows.map((r) => ({
    id: r.id,
    organization: r.name,
    approve: r.can_approve,
    pay: r.can_pay,
    projects: Number(r.projects ?? 0),
    invitedAt: r.invited_at,
  }))
}

// ---------------------------------------------------------------------------------------------------------------
// Writes. Each runs in the route's transaction; an administrator's change locks its organization first, so two
// changes of one organization run one after the other.

async function event(
  tx: Tx,
  e: {
    organizationId: string
    kind: EventKind
    actor: EventActor
    membershipId?: string
    projectId?: string
    at: Date
  },
): Promise<void> {
  let privileges: { can_approve: boolean; can_pay: boolean; scope_projects: number } | null = null
  if (e.membershipId) {
    const m = await tx
      .selectFrom('identity.organization_memberships')
      .select(['can_approve', 'can_pay'])
      .select((eb) =>
        eb
          .selectFrom('identity.organization_scopes as s')
          .select((x) => x.fn.countAll<string>().as('n'))
          .where('s.membership_id', '=', e.membershipId as string)
          .as('n'),
      )
      .where('id', '=', e.membershipId)
      .executeTakeFirstOrThrow()
    privileges = { can_approve: m.can_approve, can_pay: m.can_pay, scope_projects: Number(m.n ?? 0) }
  }
  await tx
    .insertInto('identity.organization_events')
    .values({
      organization_id: e.organizationId,
      kind: e.kind,
      actor: e.actor,
      membership_id: e.membershipId ?? null,
      project_id: e.projectId ?? null,
      can_approve: privileges?.can_approve ?? null,
      can_pay: privileges?.can_pay ?? null,
      scope_projects: privileges?.scope_projects ?? null,
      at: e.at,
    })
    .execute()
}

/** The organization `accountId` administers, locked; null for any other (NOT_FOUND, like a missing one). */
async function administered(tx: Tx, accountId: string, organizationId: string) {
  if (!UUID.test(organizationId)) return null
  const o = await tx
    .selectFrom('identity.organizations as o')
    .innerJoin('identity.customer_accounts as a', 'a.id', 'o.administrator_account_id')
    .select(['o.id', 'o.version'])
    .where('o.id', '=', organizationId)
    .where('o.administrator_account_id', '=', accountId)
    .where('a.state', '=', 'active')
    .forUpdate('o')
    .executeTakeFirst()
  return o ?? null
}

export type OrgResult<W extends string> = { ok: true; organizationId: string } | { ok: false; why: W }

export async function createOrganization(
  tx: Tx,
  accountId: string,
  name: string,
  now = new Date(),
): Promise<{ ok: true; organizationId: string }> {
  const o = await tx
    .insertInto('identity.organizations')
    .values({ name, administrator_account_id: accountId, created_at: now, updated_at: now })
    .returning('id')
    .executeTakeFirstOrThrow()
  await event(tx, { organizationId: o.id, kind: 'created', actor: 'administrator', at: now })
  return { ok: true, organizationId: o.id }
}

/** Shares one of the administrator's own linked projects with the organization. */
export async function shareProject(
  tx: Tx,
  accountId: string,
  input: { organizationId: string; reference: string },
  now = new Date(),
): Promise<OrgResult<'not_found' | 'already_shared'> & { projectId?: string }> {
  const org = await administered(tx, accountId, input.organizationId)
  if (!org || !REFERENCE_PATTERN.test(input.reference)) return { ok: false, why: 'not_found' }
  const project = (await linkedProjects(tx, accountId)).find((p) => p.reference === input.reference)
  if (!project) return { ok: false, why: 'not_found' }
  const done = await tx
    .insertInto('identity.organization_projects')
    .values({ organization_id: org.id, project_id: project.id, added_at: now })
    .onConflict((oc) => oc.doNothing())
    .returning('project_id')
    .executeTakeFirst()
  if (!done) return { ok: false, why: 'already_shared' }
  await event(tx, {
    organizationId: org.id,
    kind: 'project_added',
    actor: 'administrator',
    projectId: project.id,
    at: now,
  })
  return { ok: true, organizationId: org.id, projectId: project.id }
}

/** Stops sharing a project: it leaves every member's scope at once. */
export async function unshareProject(
  tx: Tx,
  accountId: string,
  input: { organizationId: string; reference: string },
  now = new Date(),
): Promise<OrgResult<'not_found'> & { projectId?: string; scopes?: number }> {
  const org = await administered(tx, accountId, input.organizationId)
  if (!org || !REFERENCE_PATTERN.test(input.reference)) return { ok: false, why: 'not_found' }
  const project = (await sharedProjects(tx, org.id)).find((p) => p.reference === input.reference)
  if (!project) return { ok: false, why: 'not_found' }
  const scopes = await tx
    .deleteFrom('identity.organization_scopes')
    .where('organization_id', '=', org.id)
    .where('project_id', '=', project.id)
    .executeTakeFirst()
  await tx
    .deleteFrom('identity.organization_projects')
    .where('organization_id', '=', org.id)
    .where('project_id', '=', project.id)
    .execute()
  await event(tx, {
    organizationId: org.id,
    kind: 'project_removed',
    actor: 'administrator',
    projectId: project.id,
    at: now,
  })
  return { ok: true, organizationId: org.id, projectId: project.id, scopes: Number(scopes.numDeletedRows) }
}

/** The project ids of these references, all shared by the organization; null when one is not (or none is named). */
async function scopeIds(tx: Tx, organizationId: string, references: readonly string[]): Promise<string[] | null> {
  const shared = await sharedProjects(tx, organizationId)
  const wanted = [...new Set(references.map((r) => r.trim().toUpperCase()))]
  if (wanted.length === 0) return null
  const ids = wanted.map((r) => shared.find((p) => p.reference === r)?.id)
  return ids.every((id): id is string => id !== undefined) ? ids : null
}

async function setScope(
  tx: Tx,
  organizationId: string,
  membershipId: string,
  projectIds: readonly string[],
  now: Date,
) {
  await tx
    .deleteFrom('identity.organization_scopes')
    .where('membership_id', '=', membershipId)
    .where('project_id', 'not in', [...projectIds])
    .execute()
  await tx
    .insertInto('identity.organization_scopes')
    .values(
      projectIds.map((projectId) => ({
        membership_id: membershipId,
        organization_id: organizationId,
        project_id: projectId,
        added_at: now,
      })),
    )
    .onConflict((oc) => oc.doNothing())
    .execute()
}

export type InviteFailure = 'not_found' | 'invalid_email' | 'own_email' | 'already_invited' | 'invalid_scope'

/** Invites one exact email address with a scope of shared projects (at least one) and privileges. */
export async function inviteMember(
  tx: Tx,
  accountId: string,
  input: { organizationId: string; email: string; references: readonly string[] } & Privileges,
  now = new Date(),
): Promise<OrgResult<InviteFailure> & { membershipId?: string }> {
  const org = await administered(tx, accountId, input.organizationId)
  if (!org) return { ok: false, why: 'not_found' }
  const email = invitedEmailOf(input.email)
  if (!email) return { ok: false, why: 'invalid_email' }
  if (email === (await signInEmail(tx, accountId))) return { ok: false, why: 'own_email' }
  const ids = await scopeIds(tx, org.id, input.references)
  if (!ids) return { ok: false, why: 'invalid_scope' }
  const open = await tx
    .selectFrom('identity.organization_memberships')
    .select('id')
    .where('organization_id', '=', org.id)
    .where('invited_email', '=', email)
    .where('state', '<>', 'ended')
    .executeTakeFirst()
  if (open) return { ok: false, why: 'already_invited' }
  const m = await tx
    .insertInto('identity.organization_memberships')
    .values({
      organization_id: org.id,
      invited_email: email,
      can_approve: input.approve,
      can_pay: input.pay,
      invited_at: now,
      updated_at: now,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  await setScope(tx, org.id, m.id, ids, now)
  await event(tx, {
    organizationId: org.id,
    kind: 'member_invited',
    actor: 'administrator',
    membershipId: m.id,
    at: now,
  })
  return { ok: true, organizationId: org.id, membershipId: m.id }
}

async function openMembership(tx: Tx, organizationId: string, membershipId: string) {
  if (!UUID.test(membershipId)) return null
  const m = await tx
    .selectFrom('identity.organization_memberships')
    .select(['id', 'state', 'can_approve', 'can_pay', 'version'])
    .where('id', '=', membershipId)
    .where('organization_id', '=', organizationId)
    .where('state', '<>', 'ended')
    .forUpdate()
    .executeTakeFirst()
  return m ?? null
}

/** Changes an open membership's scope and privileges (an invitation's too, before it is accepted). */
export async function changeMember(
  tx: Tx,
  accountId: string,
  input: { organizationId: string; membershipId: string; references: readonly string[] } & Privileges,
  now = new Date(),
): Promise<OrgResult<'not_found' | 'invalid_scope'> & { changed?: boolean }> {
  const org = await administered(tx, accountId, input.organizationId)
  if (!org) return { ok: false, why: 'not_found' }
  const m = await openMembership(tx, org.id, input.membershipId)
  if (!m) return { ok: false, why: 'not_found' }
  const ids = await scopeIds(tx, org.id, input.references)
  if (!ids) return { ok: false, why: 'invalid_scope' }
  const before = (await scopeOf(tx, [m.id])).get(m.id) ?? []
  const after = await tx.selectFrom('crm.projects').select('reference').where('id', 'in', ids).execute()
  const sameScope = before.length === after.length && after.every((p) => before.includes(p.reference))
  const changed = !sameScope || m.can_approve !== input.approve || m.can_pay !== input.pay
  if (!changed) return { ok: true, organizationId: org.id, changed: false }
  await tx
    .updateTable('identity.organization_memberships')
    .set({ can_approve: input.approve, can_pay: input.pay, updated_at: now, version: m.version + 1 })
    .where('id', '=', m.id)
    .execute()
  await setScope(tx, org.id, m.id, ids, now)
  await event(tx, {
    organizationId: org.id,
    kind: 'member_changed',
    actor: 'administrator',
    membershipId: m.id,
    at: now,
  })
  return { ok: true, organizationId: org.id, changed: true }
}

/** Withdraws an invitation, or removes a member: their access ends on their next request. */
export async function removeMember(
  tx: Tx,
  accountId: string,
  input: { organizationId: string; membershipId: string },
  now = new Date(),
): Promise<OrgResult<'not_found'> & { was?: 'invited' | 'active' }> {
  const org = await administered(tx, accountId, input.organizationId)
  if (!org) return { ok: false, why: 'not_found' }
  const m = await openMembership(tx, org.id, input.membershipId)
  if (!m) return { ok: false, why: 'not_found' }
  const was = m.state as 'invited' | 'active'
  await tx
    .updateTable('identity.organization_memberships')
    .set({
      state: 'ended',
      end_reason: was === 'invited' ? 'withdrawn' : 'removed',
      ended_at: now,
      updated_at: now,
      version: m.version + 1,
    })
    .where('id', '=', m.id)
    .execute()
  await event(tx, {
    organizationId: org.id,
    kind: was === 'invited' ? 'invitation_withdrawn' : 'member_removed',
    actor: 'administrator',
    membershipId: m.id,
    at: now,
  })
  return { ok: true, organizationId: org.id, was }
}

/** An open invitation to the account's own sign-in email, locked; null for any other (NOT_FOUND). */
async function invitationTo(tx: Tx, accountId: string, membershipId: string) {
  if (!UUID.test(membershipId)) return null
  const email = await signInEmail(tx, accountId)
  if (!email) return null
  const m = await tx
    .selectFrom('identity.organization_memberships as m')
    .innerJoin('identity.organizations as o', 'o.id', 'm.organization_id')
    .innerJoin('identity.customer_accounts as admin', 'admin.id', 'o.administrator_account_id')
    .select(['m.id', 'm.organization_id', 'm.version'])
    .where('m.id', '=', membershipId)
    .where('m.state', '=', 'invited')
    .where('m.invited_email', '=', email)
    .where('admin.state', '=', 'active')
    .where('o.administrator_account_id', '<>', accountId)
    .forUpdate('m')
    .executeTakeFirst()
  return m ?? null
}

/** Accepts an invitation to the account's own sign-in email; from the next request it reaches the scope. */
export async function acceptInvitation(
  tx: Tx,
  accountId: string,
  membershipId: string,
  now = new Date(),
): Promise<OrgResult<'not_found' | 'already_member'>> {
  const m = await invitationTo(tx, accountId, membershipId)
  if (!m) return { ok: false, why: 'not_found' }
  const member = await tx
    .selectFrom('identity.organization_memberships')
    .select('id')
    .where('organization_id', '=', m.organization_id)
    .where('account_id', '=', accountId)
    .where('state', '=', 'active')
    .executeTakeFirst()
  if (member) return { ok: false, why: 'already_member' }
  await tx
    .updateTable('identity.organization_memberships')
    .set({ state: 'active', account_id: accountId, accepted_at: now, updated_at: now, version: m.version + 1 })
    .where('id', '=', m.id)
    .execute()
  await event(tx, {
    organizationId: m.organization_id,
    kind: 'invitation_accepted',
    actor: 'member',
    membershipId: m.id,
    at: now,
  })
  return { ok: true, organizationId: m.organization_id }
}

export async function declineInvitation(
  tx: Tx,
  accountId: string,
  membershipId: string,
  now = new Date(),
): Promise<OrgResult<'not_found'>> {
  const m = await invitationTo(tx, accountId, membershipId)
  if (!m) return { ok: false, why: 'not_found' }
  await tx
    .updateTable('identity.organization_memberships')
    .set({ state: 'ended', end_reason: 'declined', ended_at: now, updated_at: now, version: m.version + 1 })
    .where('id', '=', m.id)
    .execute()
  await event(tx, {
    organizationId: m.organization_id,
    kind: 'invitation_declined',
    actor: 'member',
    membershipId: m.id,
    at: now,
  })
  return { ok: true, organizationId: m.organization_id }
}

/** The member leaves the organization; its access ends on the next request. */
export async function leaveOrganization(
  tx: Tx,
  accountId: string,
  organizationId: string,
  now = new Date(),
): Promise<OrgResult<'not_found'>> {
  if (!UUID.test(organizationId)) return { ok: false, why: 'not_found' }
  const m = await tx
    .selectFrom('identity.organization_memberships')
    .select(['id', 'version'])
    .where('organization_id', '=', organizationId)
    .where('account_id', '=', accountId)
    .where('state', '=', 'active')
    .forUpdate()
    .executeTakeFirst()
  if (!m) return { ok: false, why: 'not_found' }
  await tx
    .updateTable('identity.organization_memberships')
    .set({ state: 'ended', end_reason: 'left', ended_at: now, updated_at: now, version: m.version + 1 })
    .where('id', '=', m.id)
    .execute()
  await event(tx, { organizationId, kind: 'member_left', actor: 'member', membershipId: m.id, at: now })
  return { ok: true, organizationId }
}

/**
 * When a login account closes (OWN-DEC-71): its memberships end, and so does every open membership of the
 * organizations it administers (an organization without its administrator shares nothing). Returns how many ended.
 */
export async function endMembershipsOfClosedAccount(tx: Tx, accountId: string, now = new Date()): Promise<number> {
  const ended = await tx
    .updateTable('identity.organization_memberships as m')
    .set({
      state: 'ended',
      end_reason: 'account_closed',
      ended_at: now,
      updated_at: now,
      version: sql<number>`m.version + 1`,
    })
    .where('m.state', '<>', 'ended')
    .where((eb) =>
      eb.or([
        eb('m.account_id', '=', accountId),
        eb(
          'm.organization_id',
          'in',
          eb.selectFrom('identity.organizations').select('id').where('administrator_account_id', '=', accountId),
        ),
      ]),
    )
    .returning(['m.id', 'm.organization_id'])
    .execute()
  for (const m of ended)
    await event(tx, {
      organizationId: m.organization_id,
      kind: 'membership_ended_account_closed',
      actor: 'handyhub',
      membershipId: m.id,
      at: now,
    })
  return ended.length
}
