// The declared automations the in-process worker runs (TSK-0012, HH-AUTO-01). Each later task appends its own
// declaration here; an incomplete one stops the server at boot.
import { staffLinkEmailAutomation, type LinkEmailDeps } from './modules/identity/link-email.js'
import {
  estimateDocumentProcessAutomation,
  estimateExpiryAutomation,
  estimateReadyAutomation,
} from './modules/estimates/index.js'
import { deliveryStatusAutomation, releaseAutomation } from './modules/notifications/index.js'
import { photoProcessAutomation } from './modules/photos/index.js'
import { queueAutomations } from './modules/queue/index.js'
import { receiptEmailAutomation } from './modules/requests/receipt-email.js'
import { responseClockAutomation } from './modules/requests/response-clock.js'
import { accessLinkAutomation } from './modules/access/link-message.js'
import { questionAutomations, questionRecordCheck, questionReminderFailureItem } from './modules/questions/index.js'
import { customerAutomations } from './modules/customers/index.js'
import {
  inboxIntakeAutomation,
  replyFailureItem,
  replyRecordCheck,
  type InboundAddress,
} from './modules/inbox/index.js'
import type { CodeKeySettings } from './modules/identity/index.js'
import type { Automation } from './platform/automation.js'
import type { Providers } from './providers/index.js'

export type AutomationDeps = LinkEmailDeps & {
  providers: Pick<Providers, 'email' | 'sms' | 'storage'> & Partial<Pick<Providers, 'inboundEmail'>>
  /** TSK-0049: the receiving address of inbound email (INBOUND_EMAIL_ADDRESS); unset: no reply tokens. */
  replyAddress?: InboundAddress | null
  /** TSK-0034: the key the access links are derived with; unset: no grant exists to send. */
  codeKey?: CodeKeySettings
  /** TSK-0034: the public site's base URL for the access link; undefined while not configured. */
  publicSiteUrl?: string | undefined
}

export function buildAutomations(deps: AutomationDeps): Automation[] {
  return [
    staffLinkEmailAutomation(deps),
    // TSK-0048: provider statuses and SMS keywords from the stored webhook receipts.
    deliveryStatusAutomation(),
    // TSK-0031: quarantined request photos are checked again before they may be served.
    photoProcessAutomation(deps.providers.storage),
    // TSK-0054: quarantined estimate documents are checked again before they may be used or served.
    estimateDocumentProcessAutomation(deps.providers.storage),
    // TSK-0055: a published estimate version expires at the end of its validity; publishing sends the automatic
    // estimate-ready notice (FACT-AUTOMATIC-MESSAGES #8).
    estimateExpiryAutomation(),
    estimateReadyAutomation({
      providers: { email: deps.providers.email, sms: deps.providers.sms, replyAddress: deps.replyAddress ?? null },
    }),
    // TSK-0041: action queue items from the modules' committed events.
    ...queueAutomations(),
    // TSK-0032: the automatic receipt email, once per saved request (HH-INT-20); email only.
    receiptEmailAutomation({
      providers: { email: deps.providers.email, sms: null, replyAddress: deps.replyAddress ?? null },
    }),
    // TSK-0043: a meaningful customer message whose delivery succeeded stops the first-response clock.
    responseClockAutomation(),
    // TSK-0034: the secure project access link, once per grant, by email and (with the SMS opt-in) by text.
    accessLinkAutomation({
      providers: { email: deps.providers.email, sms: deps.providers.sms, replyAddress: deps.replyAddress ?? null },
      codeKey: deps.codeKey ?? { state: 'not_configured', missing: ['CODE_HASH_KEY'] },
      publicSiteUrl: deps.publicSiteUrl,
    }),
    // TSK-0044: duplicate suggestions (candidate matches) from submitted requests and changed contacts; never links.
    ...customerAutomations(),
    // TSK-0049: inbound email and texts into the unified inbox, matched to one project or left in Needs Linking.
    inboxIntakeAutomation({
      inboundEmail: deps.providers.inboundEmail ?? null,
      replyAddress: deps.replyAddress ?? null,
    }),
    // TSK-0050: staff-released messages (a staff reply's Send; released reminders), each at its release time: inside
    // the daily contact hours for those held to them. A reply is rechecked against its contact at send time, and its
    // failed delivery opens a delivery issue with Retry.
    // TSK-0051: released question reminders are rechecked against their question (answered or closed: cancelled) and
    // their failed delivery opens a delivery issue on the request.
    releaseAutomation(
      { email: deps.providers.email, sms: deps.providers.sms, replyAddress: deps.replyAddress ?? null },
      {
        recordChecks: { project: replyRecordCheck, question: questionRecordCheck },
        failureItem: async (tx, row) =>
          (await replyFailureItem(tx, row)) ?? (await questionReminderFailureItem(tx, row)),
      },
    ),
    // TSK-0051: the automatic question notice and staff reply notice, the reminder clock from the notice's successful
    // send, the reminder drafts and the "may close" queue item.
    ...questionAutomations({
      providers: { email: deps.providers.email, sms: deps.providers.sms, replyAddress: deps.replyAddress ?? null },
      publicSiteUrl: deps.publicSiteUrl,
      staffAppUrl: deps.staffAppUrl,
    }),
  ]
}
