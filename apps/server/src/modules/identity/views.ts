// Session views of the staff sign-in API (TSK-0014, TSK-0015): what a signed-in staff member sees about their own
// session. Never a hash or a secret; the CSRF token goes back in X-CSRF-Token on unsafe requests.
import type { Db, Tx } from '@handyhub/db'
import { NAV_IDS, navigationFor, SEARCH_SCOPES, STAFF_ROLES } from '@handyhub/policy'
import { mfaState } from './mfa.js'
import { csrfTokenFor, type LiveSession } from './sessions.js'

export const sessionView = {
  type: 'object',
  additionalProperties: false,
  required: [
    'staffUserId',
    'displayName',
    'email',
    'locale',
    'roles',
    'mfaEnrolled',
    'mfaRecommended',
    'csrfToken',
    'navigation',
  ],
  properties: {
    staffUserId: { type: 'string' },
    displayName: { type: ['string', 'null'] },
    email: { type: 'string' },
    locale: { type: 'string', enum: ['en', 'es'] },
    roles: { type: 'array', items: { type: 'string', enum: [...STAFF_ROLES] } },
    mfaEnrolled: { type: 'boolean' },
    // MFA is optional; Owner and Office accounts without it see a recommendation (HH-STAFF-01).
    mfaRecommended: { type: 'boolean' },
    // Sent back in X-CSRF-Token on every unsafe request of this session (TSK-0015).
    csrfToken: { type: 'string' },
    // The staff app's menu for these roles, derived from the permission matrix (TSK-0040; deny by default). A menu is
    // a convenience only: every request is still decided on the server.
    navigation: {
      type: 'object',
      additionalProperties: false,
      required: ['home', 'items', 'search'],
      properties: {
        home: { type: ['string', 'null'], enum: [...NAV_IDS, null] },
        items: { type: 'array', items: { type: 'string', enum: [...NAV_IDS] } },
        search: { type: 'array', items: { type: 'string', enum: SEARCH_SCOPES.map((s) => s.id) } },
      },
    },
  },
} as const

export const mfaPendingView = {
  type: 'object',
  additionalProperties: false,
  required: ['mfaRequired'],
  properties: { mfaRequired: { type: 'boolean', enum: [true] } },
} as const

export function viewOf(
  s: Pick<LiveSession, 'staffUserId' | 'displayName' | 'email' | 'locale' | 'roles' | 'mfaEnrolled' | 'csrfToken'> &
    Partial<Pick<LiveSession, 'capabilities'>>,
) {
  return {
    staffUserId: s.staffUserId,
    displayName: s.displayName,
    email: s.email,
    locale: s.locale,
    roles: s.roles,
    mfaEnrolled: s.mfaEnrolled,
    mfaRecommended: !s.mfaEnrolled && (s.roles.includes('owner') || s.roles.includes('office')),
    csrfToken: s.csrfToken,
    navigation: navigationFor(s.roles, s.capabilities ?? []),
  }
}

/** The session view of a user right after a session (re)starts, with the new session's CSRF token. */
export async function freshView(db: Db | Tx, staffUserId: string, sessionToken: string) {
  const user = await db
    .selectFrom('identity.staff_users')
    .select(['display_name', 'email', 'locale'])
    .where('id', '=', staffUserId)
    .executeTakeFirstOrThrow()
  const grants = await db
    .selectFrom('identity.role_grants')
    .select(['kind', 'name'])
    .where('staff_user_id', '=', staffUserId)
    .where('ended_at', 'is', null)
    .execute()
  const roles = grants.filter((g) => g.kind === 'role').map((g) => g.name)
  const capabilities = grants.filter((g) => g.kind === 'capability').map((g) => g.name)
  return viewOf({
    staffUserId,
    displayName: user.display_name,
    email: user.email,
    locale: user.locale === 'es' ? 'es' : 'en',
    roles,
    capabilities,
    mfaEnrolled: (await mfaState(db, staffUserId)).enrolled,
    csrfToken: csrfTokenFor(sessionToken),
  })
}
