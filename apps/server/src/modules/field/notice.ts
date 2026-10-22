// The automatic on-the-way notice (TSK-0070; HH-PORT-07, HH-COM-05, HH-COM-06, T65, FACT-AUTOMATIC-MESSAGES #12,
// OWN-DEC-107, INT-Resend, INT-Bird).
// - Triggered only by the committed visit.on_my_way event of an assigned worker's accepted tap (never by time), once
//   per visit: the visit is the subject, so retries and repeated taps never send a second notice.
// - At send time the visit is read again: a visit that is no longer on the way (canceled before the send cannot
//   happen once on the way, but arrived or completed since, or reassigned to nobody) sends nothing (stale).
// - It carries the assigned workers' first names (the first word of each display name; a worker without one is left
//   out, never invented) and the confirmed arrival window in the property's zone, in English (RULE-LANGUAGES). There
//   is no ETA, no live location and no tracking link. Its wording is not approved yet, so each delivery is recorded
//   as failed with template_not_configured and staff see the delivery issue with Retry; the visit stays on the way.
import { firstName, windowText } from '@handyhub/domain'
import type { Automation } from '../../platform/automation.js'
import { notificationAutomation, type NotificationProviders } from '../notifications/index.js'
import { destinationsOf, requestOf } from '../visits/offers.js'
import { storedWindow } from '../visits/visits.js'

export const ON_THE_WAY_NOTICE = 'visit.on_the_way'

export type OnTheWayDeps = { providers: NotificationProviders }

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
        // Customer messages are English (RULE-LANGUAGES); the secure project link is not supplied yet.
        values: {
          ...(names.length ? { workerFirstNames: names.join(', ') } : {}),
          arrivalWindow: windowText(storedWindow(v), 'en-US'),
        },
        failureItem: { reference: r.reference, projectId: v.project_id, assignedStaffId: r.responsible_staff_id },
      }
    },
  })
}
