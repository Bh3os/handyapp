// The notice to the old value after a customer account's sign-in email changed (TSK-0036; HH-ID-11, HH-COM-05,
// HH-COM-06, FACT-AUTOMATIC-MESSAGES, INT-Resend, RULE-SERVER-AUTHZ). The message account.contact_changed of the
// notifications module, triggered by the committed customer_account.contact_changed event.
// - It is sent only while the owner's automatic list names it and its wording is released; neither exists yet
//   (OQ-ACCOUNT-CONTACT-NOTICE), and the change route refuses (NOT CONFIGURED) until both do, so no change ever
//   happens without its notice being possible. Nothing claims a notice was sent that was not.
// - The recipient is the old email recorded with the change, never the new one; the message carries no link, code or
//   account detail. A change whose old value is gone (the account closed since) sends nothing ('stale').
import type { Automation } from '../../platform/automation.js'
import { notificationAutomation, type NotificationProviders } from '../notifications/index.js'
import { CONTACT_CHANGED_MESSAGE_KEY } from './accounts.js'

export function contactChangedNoticeAutomation(deps: { providers: NotificationProviders }): Automation {
  return notificationAutomation({
    messageKey: CONTACT_CHANGED_MESSAGE_KEY,
    providers: deps.providers,
    resolve: async ({ tx, job }) => {
      const id = job.target.id
      if (!id) return 'stale'
      const change = await tx
        .selectFrom('identity.customer_account_changes')
        .select(['id', 'account_id', 'old_value'])
        .where('id', '=', id)
        .executeTakeFirst()
      if (!change?.old_value) return 'stale'
      return {
        subjectKey: `account_change:${change.id}`,
        record: { type: 'customer_account', id: change.account_id },
        recipients: [
          {
            kind: 'customer_contact',
            destinations: [{ channel: 'email', destination: change.old_value, permission: 'preferred' }],
          },
        ],
        values: {},
      }
    },
  })
}
