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
// - The link: the secure project-access landing does not exist yet (TSK-0034, HH-ID-05). Until it does there is no
//   truthful link, so `projectLink` is not supplied and every delivery records template_values_missing instead of
//   linking somewhere invented; nothing is shown as sent that was not. The landing task supplies `projectLink`.
import type { Tx } from '@handyhub/db'
import type { Automation } from '../../platform/automation.js'
import { notificationAutomation, type Destination, type NotificationProviders } from '../notifications/index.js'

export const ESTIMATE_READY_MESSAGE_KEY = 'estimate.ready'

export type EstimateReadyDeps = {
  providers: NotificationProviders
  /** The secure link into the project's verified access (TSK-0034); null while none exists. */
  projectLink?: (tx: Tx, projectId: string) => Promise<string | null>
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
        .innerJoin('intake.requests as r', 'r.project_id', 'v.project_id')
        .innerJoin('crm.contacts as c', 'c.id', 'r.contact_id')
        .select([
          'v.id',
          'v.project_id',
          'v.state',
          'v.valid_until',
          'c.id as contactId',
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
      const link = deps.projectLink ? await deps.projectLink(tx, v.project_id) : null
      return {
        subjectKey: `estimate_version:${v.id}`,
        record: { type: 'estimate_version', id: v.id },
        recipients: [{ kind: 'customer_contact', id: v.contactId, destinations }],
        values: link ? { projectLink: link } : {},
        // TSK-0049: the delivery records its project, so the email replies to the project's reply address.
        projectId: v.project_id,
      }
    },
  })
}
