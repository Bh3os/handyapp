// The automatic secure access message (TSK-0034; HH-INT-21, HH-COM-06, OWN-DEC-97, FACT-AUTOMATIC-MESSAGES #3,
// INT-Resend, INT-Bird, HH-ID-08, T01). The message `project.access_link` of the notifications module, triggered by the
// committed request.submitted event (the grant issued in the submission's transaction) and, for a later reissue
// (TSK-0035), by project.access_requested naming the grant. No staff action is needed.
// - At send time it rechecks the grant: revoked or expired sends nothing ('stale').
// - The link is derived again from the code key and the grant's nonce, so a retried job renders the same link under
//   the same provider key; the link is never stored, logged or carried in the outbox. It opens /access with the token
//   in the fragment, which no browser sends to a server (HH-ID-08).
// - Recipients: the grant's contact by email, and by text too when the request gave the SMS opt-in (the send-time
//   consent recheck still suppresses a text after STOP); the customer's preferred channel is marked preferred.
// - The wording is a released template version of project.access_link. No owner wording exists for it (OWN-DEC-97
//   gives what it does, not its text), so none is seeded: every delivery records template_not_configured and staff get
//   a delivery issue with Retry, while the request and its grant stay saved (OQ-ACCESS-LINK-WORDING). Nothing is shown
//   as sent that was not. Without a public site URL the link value is left out, so a template that needs it fails
//   visibly (template_values_missing) instead of linking somewhere invented.
import type { Automation } from '../../platform/automation.js'
import type { CodeKeySettings } from '../identity/index.js'
import { notificationAutomation, type Destination, type NotificationProviders } from '../notifications/index.js'
import { accessLink, accessToken, grantForSend } from './grants.js'

export const ACCESS_LINK_MESSAGE_KEY = 'project.access_link'
export const ACCESS_REQUESTED_EVENT = 'project.access_requested'

export type AccessLinkDeps = {
  providers: NotificationProviders
  codeKey: CodeKeySettings
  /** The public site's base URL (PUBLIC_ORIGIN, or the local server); undefined while not configured. */
  publicSiteUrl: string | undefined
}

export function accessLinkAutomation(deps: AccessLinkDeps): Automation {
  return notificationAutomation({
    messageKey: ACCESS_LINK_MESSAGE_KEY,
    providers: deps.providers,
    resolve: async ({ tx, job }) => {
      const id = job.target.id
      if (!id) return 'stale'
      const grant =
        job.eventType === ACCESS_REQUESTED_EVENT
          ? await grantForSend(tx, { grantId: id })
          : await grantForSend(tx, { requestId: id, reason: 'submission' })
      // No grant (NOT CONFIGURED when the request was saved), or one that no longer opens anything: nothing is sent.
      if (!grant || grant.revoked || grant.expiresAt.getTime() <= Date.now()) return 'stale'
      const r = await tx
        .selectFrom('intake.requests as r')
        .innerJoin('crm.contacts as c', 'c.id', 'r.contact_id')
        .select([
          'r.reference',
          'r.project_id',
          'r.responsible_staff_id',
          'r.preferred_channel',
          'r.sms_opt_in',
          'c.email',
          'c.phone_e164',
        ])
        .where('r.id', '=', grant.requestId)
        .executeTakeFirst()
      if (!r) return 'stale'
      const destinations: Destination[] = [
        {
          channel: 'email',
          destination: r.email,
          permission: r.preferred_channel === 'email' ? 'preferred' : 'permitted',
        },
        ...(r.sms_opt_in
          ? [
              {
                channel: 'sms' as const,
                destination: r.phone_e164,
                permission: r.preferred_channel === 'text' ? ('preferred' as const) : ('permitted' as const),
              },
            ]
          : []),
      ]
      const values: Record<string, string> =
        deps.codeKey.state === 'configured' && deps.publicSiteUrl
          ? { accessLink: accessLink(deps.publicSiteUrl, accessToken(deps.codeKey.key, grant.id, grant.nonce)) }
          : {}
      return {
        subjectKey: `grant:${grant.id}`,
        record: { type: 'project', id: grant.projectId },
        recipients: [{ kind: 'customer_contact', id: grant.contactId, destinations }],
        values,
        failureItem: { reference: r.reference, projectId: r.project_id, assignedStaffId: r.responsible_staff_id },
      }
    },
  })
}
