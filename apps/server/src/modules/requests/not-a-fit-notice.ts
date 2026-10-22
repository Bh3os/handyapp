// The automatic not-a-fit notice (TSK-0120; HH-COM-06, HH-COM-05, FACT-AUTOMATIC-MESSAGES #7, OWN-DEC-100,
// OWN-DEC-209, OWN-DEC-158, INT-Resend). The message decision.not_a_fit of the notifications module, triggered only by
// the committed decision.not_a_fit_published event that an authorized staff member's formal decision writes in its own
// transaction (staff-routes.ts): never by a draft, and never by a decision routed to the Owner for review.
// - At send time the request is read again: it must still be in the state that decision moved it to (a request reopened
//   since sends nothing, 'stale'). One notice per request: the request is the subject.
// - The owner-authorized wording (not_a_fit, OWN-DEC-209) is respectful and neutral and names no reason: the details
//   (the category and the customer text staff wrote) stay behind the project's portal page. Values: the first name
//   ("Hi there," without one), the request reference and the portal link; never an internal note.
import type { Automation } from '../../platform/automation.js'
import {
  firstNameOf,
  notificationAutomation,
  portalLink,
  present,
  type NotificationProviders,
} from '../notifications/index.js'

export const NOT_A_FIT_NOTICE = 'decision.not_a_fit'

export type NotAFitNoticeDeps = {
  providers: NotificationProviders
  /** The public site's base URL for the portal link; undefined while not configured (no link is made up). */
  publicSiteUrl?: string | undefined
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function notAFitNoticeAutomation(deps: NotAFitNoticeDeps): Automation {
  return notificationAutomation({
    messageKey: NOT_A_FIT_NOTICE,
    providers: deps.providers,
    resolve: async ({ tx, job }) => {
      const id = job.target.id
      if (!id || !UUID_RE.test(id)) return 'stale'
      const r = await tx
        .selectFrom('intake.requests as r')
        .innerJoin('crm.contacts as c', 'c.id', 'r.contact_id')
        .select([
          'r.id',
          'r.reference',
          'r.state',
          'r.project_id',
          'r.responsible_staff_id',
          'c.id as contactId',
          'c.full_name',
          'c.email',
          'c.phone_e164',
          'c.preferred_channel',
        ])
        .where('r.id', '=', id)
        .executeTakeFirst()
      if (!r) return 'stale'
      const decision = await tx
        .selectFrom('intake.request_decisions')
        .select(['action', 'to_state'])
        .where('request_id', '=', r.id)
        .orderBy('decided_at', 'desc')
        .orderBy('request_version', 'desc')
        .limit(1)
        .executeTakeFirst()
      // The formal decision still stands: its request is in the state it moved it to.
      if (!decision || decision.action !== 'not_a_fit' || decision.to_state !== r.state) return 'stale'
      return {
        subjectKey: `request:${r.id}`,
        record: { type: 'request', id: r.id },
        recipients: [
          {
            kind: 'customer_contact',
            id: r.contactId,
            destinations: [
              {
                channel: 'email',
                destination: r.email,
                permission: r.preferred_channel === 'email' ? 'preferred' : 'permitted',
              },
              ...(r.phone_e164
                ? [
                    {
                      channel: 'sms' as const,
                      destination: r.phone_e164,
                      permission: r.preferred_channel === 'text' ? ('preferred' as const) : ('permitted' as const),
                    },
                  ]
                : []),
            ],
          },
        ],
        values: present({
          customerName: firstNameOf(r.full_name),
          reference: r.reference,
          projectLink: portalLink(deps.publicSiteUrl, r.reference),
        }),
        failureItem: { reference: r.reference, projectId: r.project_id, assignedStaffId: r.responsible_staff_id },
        projectId: r.project_id,
      }
    },
  })
}
