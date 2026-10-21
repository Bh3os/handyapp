// Caller resolution from the staff session cookie (TSK-0014; RULE-SERVER-AUTHZ, HH-SEC-02). A live session of an active
// staff user becomes a StaffActor with its current role grants; anything else is a guest. The staff locale comes from
// the account, so errors and screens use it.
import type { Db } from '@handyhub/db'
import type { Capability, StaffActor, StaffRole } from '@handyhub/policy'
import type { FastifyRequest } from 'fastify'
import type { RequestActor, ResolveActor } from '../../api/route.js'
import { readSessionToken, resolveSession, sessionStillLive, type CookieOptions, type LiveSession } from './sessions.js'

declare module 'fastify' {
  interface FastifyRequest {
    /** The live staff session of this request, when there is one. */
    staffSession?: LiveSession
    /** A session waiting for its second factor (TSK-0015): it acts for nobody; only MFA verification reads it. */
    staffPendingSession?: LiveSession
  }
}

const GUEST: RequestActor = { actor: { kind: 'guest' } }

export function staffActorOf(session: LiveSession): StaffActor {
  return {
    kind: 'staff',
    userId: session.staffUserId,
    roles: session.roles as StaffRole[],
    capabilities: session.capabilities as Capability[],
    status: 'active',
    freshAuth: session.freshAuth,
  }
}

export function staffSessionResolver(db: Db, cookies: CookieOptions): ResolveActor {
  return async (req: FastifyRequest) => {
    const token = readSessionToken(req.headers.cookie, cookies)
    if (!token) return GUEST
    const session = await resolveSession(db, token)
    if (!session) return GUEST
    if (session.state === 'mfa_pending') {
      req.staffPendingSession = session
      return GUEST
    }
    req.staffSession = session
    return {
      actor: staffActorOf(session),
      locale: session.locale,
      csrfToken: session.csrfToken,
      authenticatedAt: session.authenticatedAt,
      // TSK-0097: a business write checks again in its transaction that the account and session are still live.
      revalidate: (tx) => sessionStillLive(tx, session.staffUserId, session.sessionId),
    }
  }
}
