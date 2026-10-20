// Session views of the staff sign-in API (TSK-0014, TSK-0015): what a signed-in staff member sees about their own
// session. Never a hash or a secret; the CSRF token goes back in X-CSRF-Token on unsafe requests.
import type { Db, Tx } from '@handyhub/db'
import { STAFF_ROLES } from '@handyhub/policy'
import { mfaState } from './mfa.js'
import { csrfTokenFor, type LiveSession } from './sessions.js'

export const sessionView = {
  type: 'object',
  additionalProperties: false,
  required: ['staffUserId', 'displayName', 'email', 'locale', 'roles', 'mfaEnrolled', 'mfaRecommended', 'csrfToken'],
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
  },
} as const

export const mfaPendingView = {
  type: 'object',
  additionalProperties: false,
  required: ['mfaRequired'],
  properties: { mfaRequired: { type: 'boolean', enum: [true] } },
} as const

export function viewOf(
  s: Pick<LiveSession, 'staffUserId' | 'displayName' | 'email' | 'locale' | 'roles' | 'mfaEnrolled' | 'csrfToken'>,
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
  }
}

/** The session view of a user right after a session (re)starts, with the new session's CSRF token. */
export async function freshView(db: Db | Tx, staffUserId: string, sessionToken: string) {
  const user = await db
    .selectFrom('identity.staff_users')
    .select(['display_name', 'email', 'locale'])
    .where('id', '=', staffUserId)
    .executeTakeFirstOrThrow()
  const roles = (
    await db
      .selectFrom('identity.role_grants')
      .select('name')
      .where('staff_user_id', '=', staffUserId)
      .where('kind', '=', 'role')
      .where('ended_at', 'is', null)
      .execute()
  ).map((r) => r.name)
  return viewOf({
    staffUserId,
    displayName: user.display_name,
    email: user.email,
    locale: user.locale === 'es' ? 'es' : 'en',
    roles,
    mfaEnrolled: (await mfaState(db, staffUserId)).enrolled,
    csrfToken: csrfTokenFor(sessionToken),
  })
}
