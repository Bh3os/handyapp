// The declared automations the in-process worker runs (TSK-0012, HH-AUTO-01). Each later task appends its own
// declaration here; an incomplete one stops the server at boot.
import { staffLinkEmailAutomation, type LinkEmailDeps } from './modules/identity/link-email.js'
import {
  approvalReceiptDocumentAutomation,
  approvalReceiptNoticeAutomation,
  estimateDocumentProcessAutomation,
  estimateExpiryAutomation,
  estimateReadyAutomation,
  estimateReminderAutomations,
  estimateReminderRecordCheck,
  estimateResponseNoticeAutomations,
} from './modules/estimates/index.js'
import { onTheWayAutomation } from './modules/field/index.js'
import { depositQueueAutomation } from './modules/finance/index.js'
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
import { contactChangedNoticeAutomation } from './modules/accounts/notice.js'
import { retentionReviewAutomation } from './modules/retention/index.js'
import {
  appointmentChangedAutomation,
  appointmentConfirmedAutomation,
  estimateVisitConfirmedAutomation,
  estimateVisitOptionsAutomation,
  scheduleChangeStaffAutomation,
  windowOfferExpiryAutomation,
} from './modules/visits/index.js'
import type { CodeKeySettings } from './modules/identity/index.js'
import type { RecordChecks, ReleaseFailureItem } from './modules/notifications/index.js'
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

/**
 * The send-time record checks of the one `notify.release` registration (HH-COM-05), by the record type a released
 * draft is about: an estimate reminder's version (TSK-0060, HH-EST-14), a staff reply's project and contact
 * (TSK-0050) and a question reminder's question (TSK-0051, HH-LEAD-06). A feature whose released drafts need a check
 * adds its record type here, never a second registration.
 */
export const RELEASE_RECORD_CHECKS: RecordChecks = {
  estimate_version: estimateReminderRecordCheck,
  project: replyRecordCheck,
  question: questionRecordCheck,
}

/** The delivery issue of a failed released draft: a staff reply's (TSK-0050) or a question reminder's (TSK-0051). */
export const releaseFailureItem: ReleaseFailureItem = async (tx, row) =>
  (await replyFailureItem(tx, row)) ?? (await questionReminderFailureItem(tx, row))

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
    // TSK-0056: a customer's Request Changes or Decline notifies the responsible staff member (wording NOT CONFIGURED).
    ...estimateResponseNoticeAutomations({
      providers: { email: deps.providers.email, sms: null },
      staffAppUrl: deps.staffAppUrl,
    }),
    // TSK-0060: unanswered-estimate reminder drafts at the configured cadence (staff-released, never automatic), and
    // the send job of every released draft with its send-time record checks (HH-COM-05).
    ...estimateReminderAutomations({ publicSiteUrl: deps.publicSiteUrl }),
    // TSK-0050: staff-released messages (a staff reply's Send; released reminders), each at its release time: inside
    // the daily contact hours for those held to them. A reply is rechecked against its contact at send time, and its
    // failed delivery opens a delivery issue with Retry.
    // TSK-0051: released question reminders are rechecked against their question (answered or closed: cancelled) and
    // their failed delivery opens a delivery issue on the request.
    // The one `notify.release` registration: every record type's send-time check is listed here.
    releaseAutomation(
      { email: deps.providers.email, sms: deps.providers.sms, replyAddress: deps.replyAddress ?? null },
      { recordChecks: RELEASE_RECORD_CHECKS, failureItem: releaseFailureItem },
    ),
    // TSK-0058: each approval's receipt PDF, issued once, and the automatic approval receipt message
    // (FACT-AUTOMATIC-MESSAGES #9; wording NOT CONFIGURED: each delivery records template_not_configured).
    approvalReceiptDocumentAutomation(deps.providers.storage),
    // TSK-0049: its email replies to the project's reply address.
    approvalReceiptNoticeAutomation({
      providers: { email: deps.providers.email, sms: deps.providers.sms, replyAddress: deps.replyAddress ?? null },
    }),
    // TSK-0041: action queue items from the modules' committed events.
    ...queueAutomations(),
    // TSK-0059: an approval whose job needs a deposit opens its deposit_due item (deposits to collect, S01).
    depositQueueAutomation(),
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
    // TSK-0036: the notice to the old email after an account's sign-in email changed (HH-ID-11); sends only once the
    // owner lists it as automatic and approves its wording (OQ-ACCOUNT-CONTACT-NOTICE).
    contactChangedNoticeAutomation({ providers: { email: deps.providers.email, sms: null } }),
    // TSK-0099: the daily retention scan opens Owner deletion-review entries; it never deletes anything.
    retentionReviewAutomation(),
    // TSK-0063: an offer's hold ends at its expiry (OWN-DEC-144); the automatic estimate-visit options, estimate-visit
    // confirmed and work appointment confirmed notices (FACT-AUTOMATIC-MESSAGES #5, #6, #10; wording NOT CONFIGURED).
    windowOfferExpiryAutomation(),
    estimateVisitOptionsAutomation({ providers: { email: deps.providers.email, sms: deps.providers.sms } }),
    estimateVisitConfirmedAutomation({ providers: { email: deps.providers.email, sms: deps.providers.sms } }),
    appointmentConfirmedAutomation({ providers: { email: deps.providers.email, sms: deps.providers.sms } }),
    // TSK-0066: a committed reschedule or reassignment notifies the customer once (#11, wording NOT CONFIGURED); every
    // committed change notifies the affected workers (staff notice, wording NOT CONFIGURED).
    appointmentChangedAutomation({ providers: { email: deps.providers.email, sms: deps.providers.sms } }),
    scheduleChangeStaffAutomation({
      providers: { email: deps.providers.email, sms: null },
      staffAppUrl: deps.staffAppUrl,
    }),
    // TSK-0070: an assigned worker's accepted On my way sends the automatic on-the-way notice once (#12, wording NOT
    // CONFIGURED: each delivery records template_not_configured).
    onTheWayAutomation({ providers: { email: deps.providers.email, sms: deps.providers.sms } }),
    // TSK-0051: the automatic question notice and staff reply notice, the reminder clock from the notice's successful
    // send, the reminder drafts and the "may close" queue item.
    ...questionAutomations({
      providers: { email: deps.providers.email, sms: deps.providers.sms, replyAddress: deps.replyAddress ?? null },
      publicSiteUrl: deps.publicSiteUrl,
      staffAppUrl: deps.staffAppUrl,
    }),
  ]
}
