// The automatic receipt email (TSK-0032; HH-INT-20, HH-INT-10, HH-COM-06, OWN-DEC-95, FACT-AUTOMATIC-MESSAGES #1,
// INT-Resend, T01, T12, T65). The receipt is the automatic message `request.receipt` of the notifications module: one
// automation consumes the request's one `request.submitted` event (unique per request, HH-INT-10), so a double submit
// or a retried job never sends a second receipt; the delivery row is unique per request and destination, and its
// tuple hash is the provider's idempotency key.
// This file supplies the recipient and the values at send time, from the request as it is saved:
// - the reference, the selected services by their registry names, a brief summary of the customer's own description,
//   and the "What happens next?" wording from configuration (the same sentences as the receipt page, HH-INT-12);
// - no access code, link credential or private detail beyond what the customer submitted. The secure instructions for
//   viewing the request are the separate automatic access message (FACT-AUTOMATIC-MESSAGES #3, TSK-0034); until its
//   landing exists there is no truthful link, so `projectLink` is not supplied and a template that needs it fails
//   visibly (template_values_missing) instead of linking somewhere invented.
// The wording itself is a released template version of `request.receipt`. The owner has approved the receipt page's
// wording (OWN-DEC-94) and the email's content list (OWN-DEC-95), not an email text, so no version is seeded: the
// message stays NOT CONFIGURED (each delivery records template_not_configured and staff get a delivery issue with
// Retry) until the owner approves its wording (OQ-RECEIPT-EMAIL-WORDING). Nothing is shown as sent that was not.
// A failed delivery keeps the request saved and opens one delivery_failed queue item owned by the request's
// responsible staff member (unassigned until one is set: Office and the Owner see it), with Retry (retry.ts).
import { customerTranslator, type CustomerKey } from '@handyhub/i18n'
import { nextStepsLines } from '@handyhub/domain/request-form'
import type { Tx } from '@handyhub/db'
import type { Automation } from '../../platform/automation.js'
import { loadConfig, type Config } from '../../platform/config/index.js'
import { notificationAutomation, type NotificationProviders } from '../notifications/index.js'

export const RECEIPT_MESSAGE_KEY = 'request.receipt'

/** PROPOSED: the brief summary is the customer's description, cut at about 280 characters on a word boundary. */
export const SUMMARY_MAX_CHARS = 280

const t = (key: CustomerKey, values?: Record<string, string | number>) => customerTranslator().t(key, values)

/** The configured facts of the "What happens next?" wording; null values while NOT CONFIGURED. */
export function responseFacts(config: Config): {
  visitHours: { open: string; close: string } | null
  responseMinutes: number | null
} {
  const hours = config.get('contact.hours')
  const target = config.get('response.target')
  return {
    visitHours: hours.state === 'CONFIGURED' ? { open: hours.value.open, close: hours.value.close } : null,
    responseMinutes: target.state === 'CONFIGURED' ? target.value.minutes : null,
  }
}

/** The receipt's next steps as text: the response sentences, then "Your request is received. Pricing ...". */
export function nextStepsText(config: Config): string {
  const response = nextStepsLines(responseFacts(config))
    .map((l) => t(l.key as CustomerKey, l.values as Record<string, string | number> | undefined))
    .join(' ')
  return `${response}\n\n${t('request.receipt.separate')}`
}

/** A brief summary of the customer's own words; never anything they did not submit. */
export function briefSummary(text: string | null): string {
  const s = (text ?? '').replace(/\s+/g, ' ').trim()
  if (s.length <= SUMMARY_MAX_CHARS) return s
  const cut = s.slice(0, SUMMARY_MAX_CHARS)
  const space = cut.lastIndexOf(' ')
  return `${(space > SUMMARY_MAX_CHARS / 2 ? cut.slice(0, space) : cut).trimEnd()}…`
}

/** The values of one request's receipt (the declared variables of request.receipt, without projectLink). */
export async function receiptValues(tx: Tx, requestId: string, config: Config): Promise<Record<string, string> | null> {
  const r = await tx
    .selectFrom('intake.requests')
    .select(['reference', 'description', 'other_services_text', 'not_sure'])
    .where('id', '=', requestId)
    .executeTakeFirst()
  if (!r) return null
  const names = await tx
    .selectFrom('intake.request_services as s')
    .innerJoin('catalog.service_versions as v', (j) =>
      j.onRef('v.service_id', '=', 's.service_id').onRef('v.version', '=', 's.service_version'),
    )
    .select('v.name')
    .where('s.request_id', '=', requestId)
    .orderBy('s.position')
    .execute()
  const services = [...names.map((n) => n.name), ...(r.not_sure ? [t('request.services.notSure')] : [])]
  return {
    reference: r.reference,
    services: services.join(', '),
    summary: briefSummary(r.description ?? r.other_services_text),
    nextSteps: nextStepsText(config),
  }
}

export type ReceiptEmailDeps = { providers: NotificationProviders }

/**
 * The receipt automation. PROPOSED: a request flagged by the quiet spam controls still gets its receipt (the controls
 * never tell a sender anything, HH-INT-11); only a request that no longer exists sends nothing.
 */
export function receiptEmailAutomation(deps: ReceiptEmailDeps): Automation {
  return notificationAutomation({
    messageKey: RECEIPT_MESSAGE_KEY,
    providers: deps.providers,
    resolve: async ({ tx, job }) => {
      const id = job.target.id
      if (!id) return 'stale'
      const r = await tx
        .selectFrom('intake.requests as r')
        .innerJoin('crm.contacts as c', 'c.id', 'r.contact_id')
        .select([
          'r.id',
          'r.reference',
          'r.project_id',
          'r.responsible_staff_id',
          'r.preferred_channel',
          'c.id as contactId',
          'c.email',
        ])
        .where('r.id', '=', id)
        .executeTakeFirst()
      if (!r) return 'stale'
      const values = await receiptValues(tx, r.id, await loadConfig(tx))
      if (!values) return 'stale'
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
                // The receipt goes to the submitted email (FACT-AUTOMATIC-MESSAGES: the receipt is an email).
                permission: r.preferred_channel === 'email' ? 'preferred' : 'permitted',
              },
            ],
          },
        ],
        values,
        failureItem: { reference: r.reference, projectId: r.project_id, assignedStaffId: r.responsible_staff_id },
      }
    },
  })
}
