// The automatic "Your HandyHub estimate is ready" notice (TSK-0055; HH-EST-04, FACT-AUTOMATIC-MESSAGES #8,
// OWN-DEC-102, HH-COM-04, HH-COM-05, HH-COM-06, INT-Resend, INT-Bird, RULE-LANGUAGES).
// - The message type estimate.ready of the notifications module, triggered by the committed
//   estimate.version_published event. It sends only while it is on the configured automatic list (messages.automatic);
//   one delivery per version, channel and destination, so a retried job or a double publish never sends twice.
// - Its wording is the owner's (OWN-DEC-102: "Your HandyHub estimate is ready"), released as template version 1 by
//   migration 0008: no amount and no private detail, only the link into verified project access.
// - Rechecked at send time from the records as they are then: a version no longer published, or past its validity,
//   sends nothing (stale). The recipient is the contact of the project's request: email, and text when the customer
//   gave a number; the notifications module rechecks consent at send time (a text needs the SMS opt-in).
// - The link (TSK-0120): the project's portal page on the public site (`/portal/p/<reference>`), which shows the
//   estimate only to the project's verified customer. Without a configured public site there is no link and the
//   delivery records template_values_missing instead of linking somewhere invented.
// - TSK-0119: the owner-style wording (estimate_ready, OQ-MESSAGES-OUTSIDE-THE-21) greets the contact's first name
//   ("Hi there," without one, OWN-DEC-158) and names the estimate number; never an amount.
import type { Automation } from '../../platform/automation.js'
import {
  firstNameOf,
  notificationAutomation,
  portalLink,
  type Destination,
  type NotificationProviders,
} from '../notifications/index.js'

export const ESTIMATE_READY_MESSAGE_KEY = 'estimate.ready'

export type EstimateReadyDeps = {
  providers: NotificationProviders
  /** TSK-0120: the public site's base URL for the portal link; undefined while not configured (no link is made up). */
  publicSiteUrl?: string | undefined
}

export function estimateReadyAutomation(deps: EstimateReadyDeps): Automation {
  return notificationAutomation({
    messageKey: ESTIMATE_READY_MESSAGE_KEY,
    providers: deps.providers,
    resolve: async ({ tx, job }) => {
      const id = job.target.id
      if (!id) return 'stale'
      const v = await tx
        .selectFrom('estimating.estimate_versions as v')
        .innerJoin('estimating.estimates as e', 'e.id', 'v.estimate_id')
        .innerJoin('intake.requests as r', 'r.project_id', 'v.project_id')
        .innerJoin('crm.contacts as c', 'c.id', 'r.contact_id')
        .innerJoin('crm.projects as p', 'p.id', 'v.project_id')
        .select([
          'p.reference',
          'v.id',
          'v.project_id',
          'v.state',
          'v.valid_until',
          'e.number',
          'c.id as contactId',
          'c.full_name',
          'c.email',
          'c.phone_e164',
          'c.preferred_channel',
        ])
        .where('v.id', '=', id)
        .executeTakeFirst()
      if (!v || v.state !== 'published' || !v.valid_until || v.valid_until.getTime() <= Date.now()) return 'stale'
      const destinations: Destination[] = [
        {
          channel: 'email',
          destination: v.email,
          permission: v.preferred_channel === 'email' ? 'preferred' : 'permitted',
        },
        {
          channel: 'sms',
          destination: v.phone_e164,
          permission: v.preferred_channel === 'text' ? 'preferred' : 'permitted',
        },
      ]
      const link = portalLink(deps.publicSiteUrl, v.reference)
      return {
        subjectKey: `estimate_version:${v.id}`,
        record: { type: 'estimate_version', id: v.id },
        recipients: [{ kind: 'customer_contact', id: v.contactId, destinations }],
        values: {
          customerName: firstNameOf(v.full_name),
          estimateNumber: v.number,
          ...(link ? { projectLink: link } : {}),
        },
        // TSK-0049: the delivery records its project, so the email replies to the project's reply address.
        projectId: v.project_id,
      }
    },
  })
}
