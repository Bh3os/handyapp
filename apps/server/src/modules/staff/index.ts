// Staff management module (TSK-0097; HH-STAFF-02, HH-STAFF-03, HH-STAFF-07, T26, T27, ENT-StaffUser, ENT-RoleGrant,
// OWN-DEC-114, OWN-DEC-123, RULE-SERVER-AUTHZ). The Owner's staff screen:
//   GET  /staff/members                                   every staff member (staff.view, PROPOSED mapping)
//   GET  /staff/members/:staffUserId                      one member: grants, status history, upcoming assignments
//   POST /staff/members/:staffUserId/grants               grant a role or capability (staff.grant_role: fresh sign-in,
//                                                         reason, never oneself)
//   POST /staff/members/:staffUserId/grants/end           end a grant (staff.end_grant: protective, never delayed)
//   POST /staff/members/:staffUserId/disable              offboarding (staff.disable: never delayed)
//   POST /staff/members/:staffUserId/enable               re-enable (staff.enable: fresh sign-in and a reason); every
//                                                         earlier grant ends and waits in a permission review (TSK-0151)
//   POST /staff/members/:staffUserId/permission-review/restore  restore one earlier grant (staff.grant_role: fresh
//                                                         sign-in, reason, never oneself)
//   POST /staff/members/:staffUserId/permission-review/decline  decline one (staff.end_grant: protective)
//   POST /staff/members/:staffUserId/password-recovery    email a reset link (staff.start_password_recovery)
//   POST /staff/members/:staffUserId/mfa-reset            reset a lost authenticator (staff.reset_mfa: fresh sign-in,
//                                                         reason, never oneself; TSK-0154)
// Inviting stays POST /staff/invitations and revoking sessions POST /staff/:id/sessions/revoke (identity module);
// working days, hours and time off stay the capacity module's routes on its own tables (TSK-0062). Every write takes
// an idempotency key and records its audit event with the change (never a hash, token or link).
import type { Tx } from '@handyhub/db'
import { ApiError } from '../../api/errors.js'
import type { ApiContext, ApiModule, RouteDef } from '../../api/route.js'
import {
  declineGrant,
  disable,
  enable,
  endGrant,
  grant,
  listMembers,
  memberDetail,
  resetMfa,
  restoreGrant,
  startRecovery,
  type GrantKind,
  type Training,
} from './members.js'
import {
  DECLINE_BODY,
  DISABLE_BODY,
  DISABLED,
  EMPTY_BODY,
  ENABLE_BODY,
  ENABLED,
  END_GRANT_BODY,
  GRANT_BODY,
  LINK_SENT,
  MEMBER,
  MEMBER_PARAMS,
  MEMBERS,
  MFA_RESET,
  RESTORE_BODY,
} from './schemas.js'

const TEST = 'test/integration/staff-management.test.ts'

const staffActor = (ctx: ApiContext) => {
  if (ctx.actor.kind !== 'staff') throw new ApiError('FORBIDDEN')
  return ctx.actor
}

const subject: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { staffUserId } = req.params as { staffUserId: string }
  const user = await db.selectFrom('identity.staff_users').select('id').where('id', '=', staffUserId).executeTakeFirst()
  return user ? { subjectStaffId: user.id } : null
}

const write = {
  actors: ['staff'],
  kind: 'write',
  idempotency: 'required',
  expectedVersion: 'none',
  rateLimit: 'none',
  pagination: false,
  test: TEST,
  resource: subject,
} as const

const trimmed = (reason: string | undefined) => {
  const r = reason?.trim()
  return r ? r : null
}

async function detailOf(ctx: ApiContext, staffUserId: string) {
  return memberDetail(ctx.tx as Tx, staffActor(ctx).userId, staffUserId, new Date())
}

export function staffModule(): ApiModule {
  const list: RouteDef = {
    method: 'GET',
    path: '/staff/members',
    operationId: 'listStaffMembers',
    summary: 'Every staff member',
    description:
      'Owner only (staff.view; PROPOSED in the staff-management row). Every staff account, disabled ones too (their ' +
      'history is kept): name, login email, locale, status and its times, live roles and capabilities, whether a ' +
      'password is set and an authenticator enrolled, live sessions, and how many upcoming assignments the person ' +
      'has and how many are flagged for review. Never a hash, token or link.',
    actors: ['staff'],
    permission: 'staff.view',
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'none',
    pagination: false,
    test: TEST,
    schema: { response: { 200: MEMBERS } },
    handler: async (ctx) => ({ body: { members: await listMembers(ctx.db, staffActor(ctx).userId, new Date()) } }),
  }

  const detail: RouteDef = {
    method: 'GET',
    path: '/staff/members/:staffUserId',
    operationId: 'getStaffMember',
    summary: "One staff member's record",
    description:
      'Owner only (staff.view). The member with every role and capability grant (live and ended, who issued and ' +
      'ended it, the reason), the disabling and re-enabling history, and the upcoming assignments (reservations of ' +
      'visits) with their review flags.',
    actors: ['staff'],
    permission: 'staff.view',
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'none',
    pagination: false,
    test: TEST,
    resource: subject,
    schema: { params: MEMBER_PARAMS, response: { 200: MEMBER } },
    handler: async (ctx) => {
      const { staffUserId } = ctx.req.params as { staffUserId: string }
      return { body: await memberDetail(ctx.db, staffActor(ctx).userId, staffUserId, new Date()) }
    },
  }

  const grantRoute: RouteDef = {
    ...write,
    method: 'POST',
    path: '/staff/members/:staffUserId/grants',
    operationId: 'grantStaffRole',
    summary: 'Grant a role or capability',
    description:
      'Owner only, with a fresh sign-in and a written reason (ROLE-MATRIX staff.grant_role); nobody grants ' +
      'themselves anything. Roles: owner, office, estimator, worker (one person may hold several); capability: ' +
      'collect, only for someone holding the Worker role (PROPOSED), and only with the training it records ' +
      '(TSK-0151, OWN-DEC-200 H4: the date it was completed, not after today, and what it covered; PROPOSED). During ' +
      "a reactivated account's permission review, giving an earlier role or capability restores it. Takes effect on " +
      'the next request of that person. Refusals: NOT_FOUND, FRESH_AUTH_REQUIRED, FORBIDDEN (self), CONFLICT ' +
      '(ACCOUNT_DISABLED, GRANT_EXISTS, CAPABILITY_NEEDS_WORKER), VALIDATION_FAILED (TRAINING_REQUIRED, ' +
      'TRAINING_NOT_USED, TRAINING_DATE_FUTURE).',
    permission: 'staff.grant_role',
    audit: 'staff.grant_role',
    schema: { params: MEMBER_PARAMS, body: GRANT_BODY, response: { 201: MEMBER } },
    handler: async (ctx) => {
      const actor = staffActor(ctx)
      const { staffUserId } = ctx.req.params as { staffUserId: string }
      const body = ctx.req.body as { kind: GrantKind; name: string; reason: string; training?: Training }
      const out = await grant(ctx.tx as Tx, { actorId: actor.userId, staffUserId, ...body })
      const member = await detailOf(ctx, staffUserId)
      await ctx.audit({
        target: { type: 'staff_user', id: staffUserId, version: member.version },
        summary: {
          change: 'granted',
          kind: body.kind,
          name: body.name,
          grantId: out.grantId,
          roles: member.roles,
          ...(body.training ? { trainedOn: body.training.completedOn } : {}),
          ...(out.restored ? { restoredItem: out.restored, reviewClosed: out.reviewClosed } : {}),
        },
        reason: body.reason.trim(),
        stepUpUsed: true,
      })
      return { status: 201, body: member }
    },
  }

  const endRoute: RouteDef = {
    ...write,
    method: 'POST',
    path: '/staff/members/:staffUserId/grants/end',
    operationId: 'endStaffGrant',
    summary: 'End a role or capability grant',
    description:
      'Owner only (staff.end_grant; protective, never delayed by a fresh sign-in, PROPOSED mapping; ENT-RoleGrant). ' +
      'The grant is ended, never edited or deleted; the reason, when given, is audited. PROPOSED: the person keeps ' +
      'at least one role (disable the account instead). At least one active Owner always remains. Refusals: ' +
      'NOT_FOUND, CONFLICT (GRANT_NOT_LIVE, LAST_ROLE, LAST_OWNER).',
    permission: 'staff.end_grant',
    audit: 'staff.end_grant',
    schema: { params: MEMBER_PARAMS, body: END_GRANT_BODY, response: { 200: MEMBER } },
    handler: async (ctx) => {
      const actor = staffActor(ctx)
      const { staffUserId } = ctx.req.params as { staffUserId: string }
      const body = ctx.req.body as { kind: GrantKind; name: string; reason?: string }
      const out = await endGrant(ctx.tx as Tx, { actorId: actor.userId, staffUserId, kind: body.kind, name: body.name })
      const member = await detailOf(ctx, staffUserId)
      const reason = trimmed(body.reason)
      await ctx.audit({
        target: { type: 'staff_user', id: staffUserId, version: member.version },
        summary: { change: 'ended', kind: body.kind, name: body.name, grantId: out.grantId, roles: member.roles },
        ...(reason ? { reason } : {}),
      })
      return { body: member }
    },
  }

  const disableRoute: RouteDef = {
    ...write,
    method: 'POST',
    path: '/staff/members/:staffUserId/disable',
    operationId: 'disableStaffMember',
    summary: 'Disable an account (offboarding)',
    description:
      'Owner only (staff.disable; never delayed). In one transaction, after the in-flight writes of the person commit: ' +
      'the account is disabled (every later request and every queued or offline write from it is refused), every ' +
      'session is revoked, every open invite or reset link invalidated, the password cleared (PROPOSED) and the ' +
      'authenticator with its recovery codes removed (OWN-DEC-202: a re-enabled account enrols again); the ' +
      'upcoming assignments are flagged for reassignment and each flagged visit opens its action-queue item, never ' +
      'cancelled; job history and evidence stay. Refusals: NOT_FOUND, CONFLICT (ACCOUNT_DISABLED, LAST_OWNER, ' +
      'OWN_ACCOUNT, PROPOSED).',
    permission: 'staff.disable',
    audit: 'staff.disable',
    schema: { params: MEMBER_PARAMS, body: DISABLE_BODY, response: { 200: DISABLED } },
    handler: async (ctx) => {
      const actor = staffActor(ctx)
      const { staffUserId } = ctx.req.params as { staffUserId: string }
      const reason = trimmed((ctx.req.body as { reason?: string } | undefined)?.reason)
      const out = await disable(ctx.tx as Tx, { actorId: actor.userId, staffUserId, reason })
      const member = await detailOf(ctx, staffUserId)
      await ctx.audit({
        target: { type: 'staff_user', id: staffUserId, version: member.version },
        summary: {
          change: 'disabled',
          sessionsRevoked: out.sessionsRevoked,
          linksInvalidated: out.linksInvalidated,
          upcomingAssignments: out.upcoming,
          flagged: out.flagged,
          mfaRemoved: out.mfaRemoved,
          permissionReviewClosed: out.reviewClosed,
        },
        ...(reason ? { reason } : {}),
      })
      return {
        body: {
          member,
          sessionsRevoked: out.sessionsRevoked,
          linksInvalidated: out.linksInvalidated,
          upcomingAssignments: out.upcoming,
          flagged: out.flagged,
        },
      }
    },
  }

  const enableRoute: RouteDef = {
    ...write,
    method: 'POST',
    path: '/staff/members/:staffUserId/enable',
    operationId: 'enableStaffMember',
    summary: 'Re-enable a disabled account',
    description:
      'Owner only, with a fresh sign-in and a written reason (staff.enable, PROPOSED in the grant row; ENT-StaffUser). ' +
      'The account returns to active (invited when it never set a password) holding no role or capability: every ' +
      'grant it still held ends in the same transaction (kept as history) and waits in a permission review in the ' +
      'Owner Decisions until the Owner restores or declines each one (TSK-0151, OWN-DEC-200 H1, H3). A single-use ' +
      'reset (or invite) link is emailed through the outbox: the old password was cleared when it was disabled, and ' +
      'a new authenticator is enrolled at the next sign-in (OWN-DEC-202). Refusals: NOT_FOUND, FRESH_AUTH_REQUIRED, ' +
      'FORBIDDEN (self), CONFLICT (ACCOUNT_NOT_DISABLED).',
    permission: 'staff.enable',
    audit: 'staff.enable',
    schema: { params: MEMBER_PARAMS, body: ENABLE_BODY, response: { 200: ENABLED } },
    handler: async (ctx) => {
      const actor = staffActor(ctx)
      const { staffUserId } = ctx.req.params as { staffUserId: string }
      const { reason } = ctx.req.body as { reason: string }
      const out = await enable(ctx.tx as Tx, { actorId: actor.userId, staffUserId, reason })
      const member = await detailOf(ctx, staffUserId)
      await ctx.audit({
        target: { type: 'staff_user', id: staffUserId, version: member.version },
        summary: {
          change: 'enabled',
          status: out.status,
          linkSent: out.link,
          grantsEnded: out.grantsEnded,
          permissionReview: out.reviewId,
        },
        reason: reason.trim(),
        stepUpUsed: true,
      })
      return { body: { member, linkSent: out.link, grantsEnded: out.grantsEnded } }
    },
  }

  const recovery: RouteDef = {
    ...write,
    method: 'POST',
    path: '/staff/members/:staffUserId/password-recovery',
    operationId: 'startStaffPasswordRecovery',
    summary: 'Start password recovery for a staff member',
    description:
      'Owner only (staff.start_password_recovery; never delayed). Emails a single-use reset link (an invite link ' +
      'while the account is invited) through the outbox; earlier open links end. Setting the new password revokes ' +
      'every session. The Owner never sees a password or the link. Refusals: NOT_FOUND, CONFLICT (ACCOUNT_DISABLED).',
    permission: 'staff.start_password_recovery',
    audit: 'staff.start_password_recovery',
    schema: { params: MEMBER_PARAMS, body: EMPTY_BODY, response: { 200: LINK_SENT } },
    handler: async (ctx) => {
      const actor = staffActor(ctx)
      const { staffUserId } = ctx.req.params as { staffUserId: string }
      const out = await startRecovery(ctx.tx as Tx, { actorId: actor.userId, staffUserId })
      const member = await detailOf(ctx, staffUserId)
      await ctx.audit({
        target: { type: 'staff_user', id: staffUserId, version: member.version },
        summary: { linkSent: out.link },
      })
      return { body: { member, linkSent: out.link } }
    },
  }

  const mfaReset: RouteDef = {
    ...write,
    method: 'POST',
    path: '/staff/members/:staffUserId/mfa-reset',
    operationId: 'resetStaffMfa',
    test: 'test/integration/staff-mfa.test.ts',
    summary: "Reset a staff member's lost authenticator",
    description:
      'Owner only, with a fresh sign-in and a written reason, never for oneself (staff.reset_mfa, PROPOSED in the grant ' +
      'row; TSK-0154, OWN-DEC-202). Removes the authenticator and its recovery codes and revokes every session of the ' +
      'person at once; their next sign-in (with their password) enrols a new authenticator before any staff screen. MFA ' +
      "stays mandatory: nothing turns it off. An Owner's own lost authenticator: a recovery code, or the operations " +
      'command reset-mfa (PROPOSED). Refusals: NOT_FOUND, FRESH_AUTH_REQUIRED, FORBIDDEN (self), VALIDATION_FAILED ' +
      '(reason), CONFLICT (ACCOUNT_DISABLED, MFA_NOT_ENROLLED).',
    permission: 'staff.reset_mfa',
    audit: 'staff.mfa_reset',
    schema: { params: MEMBER_PARAMS, body: ENABLE_BODY, response: { 200: MFA_RESET } },
    handler: async (ctx) => {
      staffActor(ctx)
      const { staffUserId } = ctx.req.params as { staffUserId: string }
      const { reason } = ctx.req.body as { reason: string }
      const out = await resetMfa(ctx.tx as Tx, { staffUserId })
      const member = await detailOf(ctx, staffUserId)
      await ctx.audit({
        target: { type: 'staff_user', id: staffUserId, version: member.version },
        summary: {
          change: 'mfa_reset',
          sessionsRevoked: out.sessionsRevoked,
          recoveryCodesRemoved: out.recoveryCodesRemoved,
        },
        reason: reason.trim(),
        stepUpUsed: true,
      })
      return { body: { member, sessionsRevoked: out.sessionsRevoked, recoveryCodesRemoved: out.recoveryCodesRemoved } }
    },
  }

  const restore: RouteDef = {
    ...write,
    method: 'POST',
    path: '/staff/members/:staffUserId/permission-review/restore',
    operationId: 'restoreStaffGrant',
    summary: 'Restore an earlier grant in a permission review',
    description:
      'Owner only, with a fresh sign-in and a written reason, never for oneself (staff.grant_role; TSK-0151, ' +
      'OWN-DEC-200 H3). One earlier role or capability of a reactivated account is given again as a new grant that ' +
      'the review item names; the earlier grant stays ended, as history. A collect grant records the training again ' +
      '(PROPOSED). The review closes, and its Owner Decisions item resolves, once every earlier grant is restored or ' +
      'declined. Refusals: NOT_FOUND, FRESH_AUTH_REQUIRED, FORBIDDEN (self), CONFLICT (NO_OPEN_REVIEW, ' +
      'REVIEW_ITEM_DECIDED, GRANT_EXISTS, CAPABILITY_NEEDS_WORKER), VALIDATION_FAILED (TRAINING_REQUIRED, ' +
      'TRAINING_DATE_FUTURE).',
    permission: 'staff.grant_role',
    audit: 'staff.restore_grant',
    schema: { params: MEMBER_PARAMS, body: RESTORE_BODY, response: { 200: MEMBER } },
    handler: async (ctx) => {
      const actor = staffActor(ctx)
      const { staffUserId } = ctx.req.params as { staffUserId: string }
      const body = ctx.req.body as { itemId: string; reason: string; training?: Training }
      const out = await restoreGrant(ctx.tx as Tx, { actorId: actor.userId, staffUserId, ...body })
      const member = await detailOf(ctx, staffUserId)
      await ctx.audit({
        target: { type: 'staff_user', id: staffUserId, version: member.version },
        summary: {
          change: 'restored',
          kind: out.kind,
          name: out.name,
          itemId: body.itemId,
          grantId: out.grantId,
          roles: member.roles,
          reviewClosed: out.reviewClosed,
          ...(body.training ? { trainedOn: body.training.completedOn } : {}),
        },
        reason: body.reason.trim(),
        stepUpUsed: true,
      })
      return { body: member }
    },
  }

  const decline: RouteDef = {
    ...write,
    method: 'POST',
    path: '/staff/members/:staffUserId/permission-review/decline',
    operationId: 'declineStaffGrant',
    summary: 'Decline an earlier grant in a permission review',
    description:
      'Owner only (staff.end_grant; protective, no fresh sign-in, PROPOSED; TSK-0151, OWN-DEC-200 H3). One earlier ' +
      'role or capability of a reactivated account is not given back; the reason, when given, is kept and audited. ' +
      'PROPOSED: the last role is not declined while the person holds none (give a role or disable the account ' +
      'instead). Refusals: NOT_FOUND, CONFLICT (NO_OPEN_REVIEW, REVIEW_ITEM_DECIDED, LAST_ROLE).',
    permission: 'staff.end_grant',
    audit: 'staff.decline_grant',
    schema: { params: MEMBER_PARAMS, body: DECLINE_BODY, response: { 200: MEMBER } },
    handler: async (ctx) => {
      const actor = staffActor(ctx)
      const { staffUserId } = ctx.req.params as { staffUserId: string }
      const body = ctx.req.body as { itemId: string; reason?: string }
      const reason = trimmed(body.reason)
      const out = await declineGrant(ctx.tx as Tx, { actorId: actor.userId, staffUserId, itemId: body.itemId, reason })
      const member = await detailOf(ctx, staffUserId)
      await ctx.audit({
        target: { type: 'staff_user', id: staffUserId, version: member.version },
        summary: {
          change: 'declined',
          kind: out.kind,
          name: out.name,
          itemId: body.itemId,
          roles: member.roles,
          reviewClosed: out.reviewClosed,
        },
        ...(reason ? { reason } : {}),
      })
      return { body: member }
    },
  }

  return {
    name: 'staff',
    routes: [list, detail, grantRoute, endRoute, disableRoute, enableRoute, restore, decline, recovery, mfaReset],
  }
}
