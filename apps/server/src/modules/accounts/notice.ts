// The notice after a customer account's sign-in email changed (TSK-0036, TSK-0120; HH-ID-11, HH-COM-05, HH-COM-06,
// FACT-AUTOMATIC-MESSAGES #21, OWN-DEC-151, OWN-DEC-152, OWN-DEC-198, INT-Resend, RULE-SERVER-AUTHZ). The message
// account.contact_changed of the notifications module (account security), triggered only by the committed
// customer_account.contact_changed event of a completed change (both the authority over the account and the code to
// the new email were proven).
// - TSK-0120: it goes to the old and to the new verified address (MESSAGE 21), once each per change: the change is the
//   subject and each address its own delivery, so a retried job or a redelivered event sends nothing more. The new
//   address is the one this change set: the old value the account's next change recorded, or the sign-in email now.
// - It carries no link, code or account detail: the first name ("Hi there," without one), when the change happened in
//   the contact's own zone (else the business zone) and the support contact (FACT-PUBLIC-CONTACT: the labelled
//   placeholders while it is NOT CONFIGURED). A change whose old value is gone (the account closed since) sends
//   nothing ('stale'). Account security notices are never held by quiet hours; they go when the change commits.
import type { Automation } from '../../platform/automation.js'
import { loadConfig } from '../../platform/config/index.js'
import { isSupportedZone } from '@handyhub/domain'
import {
  businessZone,
  dateText,
  firstNameOf,
  notificationAutomation,
  present,
  supportContactText,
  timeText,
  zoneLabel,
  type NotificationProviders,
  type Recipient,
} from '../notifications/index.js'
import { CONTACT_CHANGED_MESSAGE_KEY } from './accounts.js'

export function contactChangedNoticeAutomation(deps: { providers: NotificationProviders }): Automation {
  return notificationAutomation({
    messageKey: CONTACT_CHANGED_MESSAGE_KEY,
    providers: deps.providers,
    resolve: async ({ tx, job }) => {
      const id = job.target.id
      if (!id) return 'stale'
      const change = await tx
        .selectFrom('identity.customer_account_changes as ch')
        .innerJoin('identity.customer_accounts as a', 'a.id', 'ch.account_id')
        .innerJoin('crm.contacts as c', 'c.id', 'a.contact_id')
        .select([
          'ch.id',
          'ch.account_id',
          'ch.old_value',
          'ch.created_at',
          'a.sign_in_email',
          'c.id as contactId',
          'c.full_name',
          'c.time_zone',
        ])
        .where('ch.id', '=', id)
        .executeTakeFirst()
      if (!change?.old_value) return 'stale'
      // The address this change set: what the next email change replaced, or the account's sign-in email now.
      const next = await tx
        .selectFrom('identity.customer_account_changes')
        .select('old_value')
        .where('account_id', '=', change.account_id)
        .where('kind', '=', 'email_changed')
        .where('created_at', '>', change.created_at)
        .orderBy('created_at')
        .limit(1)
        .executeTakeFirst()
      const newValue = next ? next.old_value : change.sign_in_email
      const config = await loadConfig(tx)
      const zone = isSupportedZone(change.time_zone) ? change.time_zone : businessZone(config)
      const at = new Date(change.created_at)
      const recipients: Recipient[] = [
        {
          kind: 'customer_contact',
          id: change.contactId,
          destinations: [{ channel: 'email', destination: change.old_value, permission: 'preferred' }],
        },
        ...(newValue && newValue !== change.old_value
          ? [
              {
                kind: 'customer_contact' as const,
                id: change.contactId,
                destinations: [{ channel: 'email' as const, destination: newValue, permission: 'preferred' as const }],
              },
            ]
          : []),
      ]
      return {
        subjectKey: `account_change:${change.id}`,
        record: { type: 'customer_account', id: change.account_id },
        recipients,
        values: present({
          customerName: firstNameOf(change.full_name),
          changeDate: zone ? dateText(at, zone) : null,
          changeTime: zone ? timeText(at, zone) : null,
          timeZone: zone ? zoneLabel(at, zone) : null,
          supportContact: supportContactText(config),
        }),
      }
    },
  })
}
