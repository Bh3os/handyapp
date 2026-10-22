// The automatic on-the-way notice (TSK-0070; HH-PORT-07, HH-COM-05, HH-COM-06, T65, FACT-AUTOMATIC-MESSAGES #12,
// OWN-DEC-107, INT-Resend, INT-Bird).
// - Triggered only by the committed visit.on_my_way event of an assigned worker's accepted tap (never by time), once
//   per visit: the visit is the subject, so retries and repeated taps never send a second notice.
// - At send time the visit is read again: a visit that is no longer on the way (canceled before the send cannot
//   happen once on the way, but arrived or completed since, or reassigned to nobody) sends nothing (stale).
// - It carries the assigned workers' first names (the first word of each display name; a worker without one is left
//   out, never invented) and the confirmed arrival window in the property's zone, in English (RULE-LANGUAGES). There
//   is no ETA, no live location and no tracking link. Its wording is the owner-authorized on_the_way (OWN-DEC-209);
//   TSK-0120 supplies its values (first name, visit reference, window, project link), so the email is sent; a failed
//   delivery is a staff delivery issue with Retry and the visit stays on the way.
import { firstName } from '@handyhub/domain'
import type { Automation } from '../../platform/automation.js'
import {
  firstNameOf,
  notificationAutomation,
  portalLink,
  valuesFor,
  type NotificationProviders,
} from '../notifications/index.js'
import { destinationsOf, requestOf, visitValues } from '../visits/offers.js'

export const ON_THE_WAY_NOTICE = 'visit.on_the_way'

export type OnTheWayDeps = {
  providers: NotificationProviders
  /** TSK-0120: the public site's base URL for the portal link; undefined while not configured. */
  publicSiteUrl?: string | undefined
}

export function onTheWayAutomation(deps: OnTheWayDeps): Automation {
  return notificationAutomation({
    messageKey: ON_THE_WAY_NOTICE,
    providers: deps.providers,
    resolve: async ({ tx, job }) => {
      const p = job.payload as { visitId?: unknown } | null
      const id = typeof p?.visitId === 'string' && /^[0-9a-f-]{36}$/i.test(p.visitId) ? p.visitId : null
      if (!id) return 'stale'
      const v = await tx.selectFrom('work.visits').selectAll().where('id', '=', id).executeTakeFirst()
      if (!v || v.state !== 'en_route') return 'stale'
      const team = await tx
        .selectFrom('work.reservations as r')
        .innerJoin('identity.staff_users as u', 'u.id', 'r.staff_user_id')
        .select(['u.display_name', 'r.role'])
        .where('r.visit_id', '=', v.id)
        .where('r.resource', '=', 'worker')
        .where('r.kind', '=', 'confirmed')
        .where('r.ended_at', 'is', null)
        .orderBy('r.role')
        .orderBy('u.display_name')
        .execute()
      if (team.length === 0) return 'stale'
      const names = team
        .sort((a, b) => (a.role === b.role ? 0 : a.role === 'lead' ? -1 : 1))
        .flatMap((m) => {
          const n = firstName(m.display_name)
          return n ? [n] : []
        })
      const r = await requestOf(tx, v.project_id)
      if (!r) return 'stale'
      return {
        subjectKey: `visit_on_my_way:${v.id}`,
        record: { type: 'visit', id: v.id },
        recipients: [{ kind: 'customer_contact', id: r.contactId, destinations: destinationsOf(r) }],
        // Customer messages are English (RULE-LANGUAGES). TSK-0120: the owner-authorized wording's values (OWN-DEC-209:
        // the visit reference, the team's first names and the confirmed window; never a location).
        values: valuesFor(ON_THE_WAY_NOTICE, {
          customerName: firstNameOf(r.full_name),
          workerFirstNames: names.length ? names.join(', ') : null,
          ...visitValues(v, r.reference),
          projectLink: portalLink(deps.publicSiteUrl, r.reference),
        }),
        failureItem: { reference: r.reference, projectId: v.project_id, assignedStaffId: r.responsible_staff_id },
      }
    },
  })
}
