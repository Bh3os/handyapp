// The routes of organization accounts (TSK-0118; HH-ID-13, HH-ID-03, RULE-SERVER-AUTHZ). See organizations.ts.
//   GET  /customer/account/organizations                                   the account's organizations and invitations
//   POST /customer/account/organizations                                   set one up (the account administers it)
//   POST /customer/account/organizations/:id/projects                      share one of the account's own projects
//   POST /customer/account/organizations/:id/projects/:reference/remove    stop sharing it (it leaves every scope)
//   POST /customer/account/organizations/:id/members                       invite an exact email with scope, privileges
//   POST /customer/account/organizations/:id/members/:member               change a membership's scope and privileges
//   POST /customer/account/organizations/:id/members/:member/remove        withdraw an invitation, remove a member
//   POST /customer/account/organizations/:id/leave                         a member leaves
//   POST /customer/account/organization-invitations/:id/accept             accept an invitation to the own sign-in email
//   POST /customer/account/organization-invitations/:id/decline            decline it
// Every route needs a live account session, like the account's other pages (saved-routes.ts): an organization is the
// account's own, not a project's, so the route reads the account, its organizations and memberships on every request,
// and anything outside them is NOT_FOUND like a missing one. A guest-link session is NOT_FOUND; no session is 401. What
// a member may then do on a project in scope is decided by the policy on the project's own routes (the organization
// table of @handyhub/policy). The audit log records which organization, membership and project changed and the
// privileges and scope size, never a name, an email address or anything the customer typed.
import { ApiError } from '../../api/errors.js'
import { AUTHENTICATION, type ApiContext, type RouteDef } from '../../api/route.js'
import { readSessionToken, resolveCustomerSession, type CustomerSession } from '../identity/index.js'
import { ACCOUNT_ORGANIZATIONS } from '../records/index.js'
import {
  acceptInvitation,
  accountOrganizations,
  changeMember,
  createOrganization,
  declineInvitation,
  inviteMember,
  leaveOrganization,
  ORGANIZATION_NAME_MAX,
  organizationNameOf,
  removeMember,
  shareProject,
  unshareProject,
} from './organizations.js'
import { ACCOUNT_SETTINGS_RATE_LIMIT } from './saved-routes.js'

const TEST = 'test/integration/customer-organizations.test.ts'

const ID = { type: 'string', minLength: 1, maxLength: 64 } as const
const REFERENCE_FIELD = { type: 'string', minLength: 1, maxLength: 40 } as const
const params = (...names: string[]) =>
  ({
    type: 'object',
    additionalProperties: false,
    required: names,
    properties: Object.fromEntries(names.map((n) => [n, n === 'reference' ? REFERENCE_FIELD : ID])),
  }) as const
const SCOPE_FIELDS = {
  approve: { type: 'boolean' },
  pay: { type: 'boolean' },
  // PROPOSED: a membership covers 1 to 50 of the organization's projects.
  projects: { type: 'array', minItems: 1, maxItems: 50, items: REFERENCE_FIELD },
} as const

const fieldError = (field: string, code: string, error: 'VALIDATION_FAILED' | 'CONFLICT' = 'VALIDATION_FAILED') =>
  new ApiError(error, { fieldErrors: [{ field, code, message: '' }] })

export function organizationRoutes(): RouteDef[] {
  const base = {
    actors: ['customer'],
    permission: AUTHENTICATION,
    expectedVersion: 'none',
    idempotency: 'none',
    pagination: false,
    test: TEST,
    projection: ACCOUNT_ORGANIZATIONS,
    resource: async (ctx: Pick<ApiContext, 'req' | 'db'>) => {
      const session = await resolveCustomerSession(ctx.db, readSessionToken(ctx.req))
      if (!session?.accountId) return null
      ctx.req.customerSession = session
      return {}
    },
  } as const
  const read = { ...base, kind: 'read', method: 'GET', rateLimit: 'none', audit: 'none' } as const
  const write = { ...base, kind: 'write', method: 'POST', rateLimit: ACCOUNT_SETTINGS_RATE_LIMIT } as const
  /** The session as the resource check found it; a write reads it again inside its transaction. */
  const sessionOf = async (ctx: ApiContext): Promise<CustomerSession & { accountId: string }> => {
    const s = ctx.tx ? await resolveCustomerSession(ctx.tx, readSessionToken(ctx.req)) : ctx.req.customerSession
    if (!s?.accountId) throw new ApiError('NOT_FOUND')
    return s as CustomerSession & { accountId: string }
  }
  const answer = async (ctx: ApiContext, accountId: string) => ({
    body: ACCOUNT_ORGANIZATIONS.project(await accountOrganizations(ctx.tx ?? ctx.db, accountId)),
  })
  const target = (organizationId: string) => ({ type: 'organization', id: organizationId })
  const p = (ctx: ApiContext) => ctx.req.params as { id: string; member?: string; reference?: string }
  const response = { response: { 200: ACCOUNT_ORGANIZATIONS.schema } }
  const tx = (ctx: ApiContext, name: string) => {
    if (!ctx.tx) throw new Error(`${name} runs in its write transaction`)
    return ctx.tx
  }
  const scopeOf = (b: { approve: boolean; pay: boolean; projects: string[] }) => ({
    approve: b.approve,
    pay: b.pay,
    references: b.projects.map((r) => r.trim().toUpperCase()),
  })

  const list: RouteDef = {
    ...read,
    path: '/customer/account/organizations',
    operationId: 'getAccountOrganizations',
    summary: 'Organizations',
    description:
      'For a live account session (HH-ID-13): the references of the account’s own linked projects (what it may ' +
      'share); the organizations it administers, each with the projects it shares, its open memberships (the ' +
      'invited email, invited or active, approve and pay, the projects in scope) and its history, newest first; the ' +
      'organizations it is a member of, each with its privileges and the projects the membership reaches now (never ' +
      'the other members or the other projects); and the open invitations to its own verified sign-in email, exactly ' +
      'that address (never its domain), each with the organization’s name, the privileges and how many projects ' +
      'they cover. A guest-link session is NOT_FOUND; no session is 401.',
    schema: response,
    handler: async (ctx) => answer(ctx, (await sessionOf(ctx)).accountId),
  }

  const create: RouteDef = {
    ...write,
    path: '/customer/account/organizations',
    operationId: 'createOrganization',
    summary: 'Set up an organization',
    description:
      `Sets up an organization named 1 to ${ORGANIZATION_NAME_MAX} characters (trimmed; else 400 invalid_name), ` +
      'administered by the signed-in account. It shares nothing and nobody is a member until the administrator says ' +
      'so. Answers the organizations.',
    audit: 'customer_account.organization_create',
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['name'],
        properties: { name: { type: 'string', minLength: 1, maxLength: 200 } },
      },
      ...response,
    },
    handler: async (ctx) => {
      const t = tx(ctx, 'createOrganization')
      const session = await sessionOf(ctx)
      const name = organizationNameOf((ctx.req.body as { name: string }).name)
      if (!name) throw fieldError('body.name', 'invalid_name')
      const out = await createOrganization(t, session.accountId, name)
      await ctx.audit({ target: target(out.organizationId), summary: { organization: out.organizationId } })
      return answer(ctx, session.accountId)
    },
  }

  const share: RouteDef = {
    ...write,
    path: '/customer/account/organizations/:id/projects',
    operationId: 'shareOrganizationProject',
    summary: 'Share a project with an organization',
    description:
      'Shares one of the administrator’s own linked projects (named by its reference) with an organization it ' +
      'administers. Another organization, a reference the account’s active links do not open, a revoked link or a ' +
      'missing one are the same NOT_FOUND (HH-ID-03); a project already shared is a 409 (body.reference, ' +
      'already_shared). Sharing reaches nobody by itself: a member reaches it only once their scope names it. ' +
      'Answers the organizations.',
    audit: 'customer_account.organization_share_project',
    schema: {
      params: params('id'),
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['reference'],
        properties: { reference: REFERENCE_FIELD },
      },
      ...response,
    },
    handler: async (ctx) => {
      const t = tx(ctx, 'shareOrganizationProject')
      const session = await sessionOf(ctx)
      const out = await shareProject(t, session.accountId, {
        organizationId: p(ctx).id,
        reference: (ctx.req.body as { reference: string }).reference.trim().toUpperCase(),
      })
      if (!out.ok) {
        if (out.why === 'already_shared') throw fieldError('body.reference', 'already_shared', 'CONFLICT')
        throw new ApiError('NOT_FOUND')
      }
      await ctx.audit({
        target: target(out.organizationId),
        summary: { organization: out.organizationId, project: out.projectId ?? null },
      })
      return answer(ctx, session.accountId)
    },
  }

  const unshare: RouteDef = {
    ...write,
    path: '/customer/account/organizations/:id/projects/:reference/remove',
    operationId: 'unshareOrganizationProject',
    summary: 'Stop sharing a project with an organization',
    description:
      'Stops sharing a project with an organization the account administers (NOT_FOUND otherwise): the project ' +
      'leaves every membership’s scope at once, so no member reaches it from their next request on. The project and ' +
      'its records stay exactly as they are. Answers the organizations.',
    audit: 'customer_account.organization_unshare_project',
    schema: { params: params('id', 'reference'), ...response },
    handler: async (ctx) => {
      const t = tx(ctx, 'unshareOrganizationProject')
      const session = await sessionOf(ctx)
      const out = await unshareProject(t, session.accountId, {
        organizationId: p(ctx).id,
        reference: (p(ctx).reference ?? '').trim().toUpperCase(),
      })
      if (!out.ok) throw new ApiError('NOT_FOUND')
      await ctx.audit({
        target: target(out.organizationId),
        summary: { organization: out.organizationId, project: out.projectId ?? null, scopesEnded: out.scopes ?? 0 },
      })
      return answer(ctx, session.accountId)
    },
  }

  const invite: RouteDef = {
    ...write,
    path: '/customer/account/organizations/:id/members',
    operationId: 'inviteOrganizationMember',
    summary: 'Invite a member',
    description:
      'Invites one exact email address to an organization the account administers (NOT_FOUND otherwise), with its ' +
      'scope (1 to 50 references of projects the organization shares; any other is a 400 body.projects ' +
      'invalid_scope) and its privileges (approve: estimate, change-order and appointment decisions; pay: balances, ' +
      'invoices and payment links). Not an email address: 400 (body.email, invalid_email); the administrator’s own ' +
      'sign-in email: 400 (own_email); an address already invited or a member: 409 (already_invited). Nothing is ' +
      'sent (no invitation wording is approved): the invitation waits on the dashboard of the account that signs in ' +
      'with exactly that address, and grants nothing until that account accepts it. A shared email domain never ' +
      'grants anything. Answers the organizations.',
    audit: 'customer_account.organization_invite',
    schema: {
      params: params('id'),
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['email', 'approve', 'pay', 'projects'],
        properties: { email: { type: 'string', minLength: 3, maxLength: 320 }, ...SCOPE_FIELDS },
      },
      ...response,
    },
    handler: async (ctx) => {
      const t = tx(ctx, 'inviteOrganizationMember')
      const session = await sessionOf(ctx)
      const body = ctx.req.body as { email: string; approve: boolean; pay: boolean; projects: string[] }
      const out = await inviteMember(t, session.accountId, {
        organizationId: p(ctx).id,
        email: body.email,
        ...scopeOf(body),
      })
      if (!out.ok) {
        if (out.why === 'not_found') throw new ApiError('NOT_FOUND')
        if (out.why === 'invalid_scope') throw fieldError('body.projects', 'invalid_scope')
        if (out.why === 'already_invited') throw fieldError('body.email', 'already_invited', 'CONFLICT')
        throw fieldError('body.email', out.why)
      }
      await ctx.audit({
        target: target(out.organizationId),
        summary: {
          organization: out.organizationId,
          membership: out.membershipId ?? null,
          approve: body.approve,
          pay: body.pay,
          scopeProjects: new Set(body.projects).size,
        },
      })
      return answer(ctx, session.accountId)
    },
  }

  const change: RouteDef = {
    ...write,
    path: '/customer/account/organizations/:id/members/:member',
    operationId: 'changeOrganizationMember',
    summary: 'Change a member’s scope and privileges',
    description:
      'Replaces the scope and the privileges of an open membership (invited or active) of an organization the ' +
      'account administers (NOT_FOUND otherwise; an ended one too), with the same scope rules as an invitation. A ' +
      'project taken out of the scope, or a privilege taken away, ends that access on the member’s next request. A ' +
      'change that changes nothing records nothing. Answers the organizations.',
    audit: 'customer_account.organization_change_member',
    schema: {
      params: params('id', 'member'),
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['approve', 'pay', 'projects'],
        properties: SCOPE_FIELDS,
      },
      ...response,
    },
    handler: async (ctx) => {
      const t = tx(ctx, 'changeOrganizationMember')
      const session = await sessionOf(ctx)
      const body = ctx.req.body as { approve: boolean; pay: boolean; projects: string[] }
      const out = await changeMember(t, session.accountId, {
        organizationId: p(ctx).id,
        membershipId: p(ctx).member ?? '',
        ...scopeOf(body),
      })
      if (!out.ok) {
        if (out.why === 'invalid_scope') throw fieldError('body.projects', 'invalid_scope')
        throw new ApiError('NOT_FOUND')
      }
      await ctx.audit({
        target: target(out.organizationId),
        summary: {
          organization: out.organizationId,
          membership: p(ctx).member ?? null,
          approve: body.approve,
          pay: body.pay,
          scopeProjects: new Set(body.projects).size,
          changed: out.changed ?? false,
        },
      })
      return answer(ctx, session.accountId)
    },
  }

  const remove: RouteDef = {
    ...write,
    path: '/customer/account/organizations/:id/members/:member/remove',
    operationId: 'removeOrganizationMember',
    summary: 'Withdraw an invitation or remove a member',
    description:
      'Ends an open membership of an organization the account administers (NOT_FOUND otherwise): an invitation is ' +
      'withdrawn, an active member removed, and the member reaches nothing of the organization from their next ' +
      'request on. The membership stays in the history; inviting the address again is a new invitation. Answers the ' +
      'organizations.',
    audit: 'customer_account.organization_remove_member',
    schema: { params: params('id', 'member'), ...response },
    handler: async (ctx) => {
      const t = tx(ctx, 'removeOrganizationMember')
      const session = await sessionOf(ctx)
      const out = await removeMember(t, session.accountId, {
        organizationId: p(ctx).id,
        membershipId: p(ctx).member ?? '',
      })
      if (!out.ok) throw new ApiError('NOT_FOUND')
      await ctx.audit({
        target: target(out.organizationId),
        summary: { organization: out.organizationId, membership: p(ctx).member ?? null, was: out.was ?? null },
      })
      return answer(ctx, session.accountId)
    },
  }

  const leave: RouteDef = {
    ...write,
    path: '/customer/account/organizations/:id/leave',
    operationId: 'leaveOrganization',
    summary: 'Leave an organization',
    description:
      'Ends the account’s own active membership of the organization (NOT_FOUND otherwise): it reaches nothing of the ' +
      'organization from its next request on. Answers the organizations.',
    audit: 'customer_account.organization_leave',
    schema: { params: params('id'), ...response },
    handler: async (ctx) => {
      const t = tx(ctx, 'leaveOrganization')
      const session = await sessionOf(ctx)
      const out = await leaveOrganization(t, session.accountId, p(ctx).id)
      if (!out.ok) throw new ApiError('NOT_FOUND')
      await ctx.audit({ target: target(out.organizationId), summary: { organization: out.organizationId } })
      return answer(ctx, session.accountId)
    },
  }

  const decide = (kind: 'accept' | 'decline'): RouteDef => ({
    ...write,
    path: `/customer/account/organization-invitations/:id/${kind}`,
    operationId: kind === 'accept' ? 'acceptOrganizationInvitation' : 'declineOrganizationInvitation',
    summary: kind === 'accept' ? 'Accept an organization invitation' : 'Decline an organization invitation',
    description:
      (kind === 'accept'
        ? 'Accepts an open invitation to the account’s own verified sign-in email (exactly that address): from the ' +
          'next request the account reaches the projects of its scope with its privileges. An account that is ' +
          'already a member of that organization: 409 (membership, already_member). '
        : 'Declines an open invitation to the account’s own verified sign-in email; it grants nothing, ever. ') +
      'Any other invitation (another address, its domain, a withdrawn or answered one) is NOT_FOUND like a missing ' +
      'one. Answers the organizations.',
    audit:
      kind === 'accept'
        ? 'customer_account.organization_accept_invitation'
        : 'customer_account.organization_decline_invitation',
    schema: { params: params('id'), ...response },
    handler: async (ctx) => {
      const t = tx(ctx, `${kind}OrganizationInvitation`)
      const session = await sessionOf(ctx)
      const id = p(ctx).id
      const out =
        kind === 'accept'
          ? await acceptInvitation(t, session.accountId, id)
          : await declineInvitation(t, session.accountId, id)
      if (!out.ok) {
        if (out.why === 'already_member') throw fieldError('membership', 'already_member', 'CONFLICT')
        throw new ApiError('NOT_FOUND')
      }
      await ctx.audit({
        target: target(out.organizationId),
        summary: { organization: out.organizationId, membership: id },
      })
      return answer(ctx, session.accountId)
    },
  })

  return [list, create, share, unshare, invite, change, remove, leave, decide('accept'), decide('decline')]
}
