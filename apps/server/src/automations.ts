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
  estimateReminderFailureItem,
  estimateReminderRecordCheck,
  estimateReminderValues,
  estimateResponseNoticeAutomations,
} from './modules/estimates/index.js'
import { onTheWayAutomation } from './modules/field/index.js'
import { caseOpenedNoticeAutomation } from './modules/cases/index.js'
import {
  depositInvoiceAutomation,
  depositQueueAutomation,
  invoiceDocumentAutomation,
  invoiceDraftAutomation,
  invoiceReadyAutomation,
} from './modules/finance/index.js'
import { deliveryStatusAutomation, linkHostsOf, releaseAutomation } from './modules/notifications/index.js'
import { photoProcessAutomation } from './modules/photos/index.js'
import { fieldPhotoProcessAutomation } from './modules/field-photos/photos.js'
import { queueAutomations } from './modules/queue/index.js'
import { receiptEmailAutomation } from './modules/requests/receipt-email.js'
import { responseClockAutomation } from './modules/requests/response-clock.js'
import { accessLinkAutomation } from './modules/access/link-message.js'
import {
  questionAutomations,
  questionRecordCheck,
  questionReminderFailureItem,
  questionReminderValues,
} from './modules/questions/index.js'
import { customerAutomations } from './modules/customers/index.js'
import {
  inboxIntakeAutomation,
  replyFailureItem,
  replyRecordCheck,
  replyValues,
  type InboundAddress,
} from './modules/inbox/index.js'
import { contactChangedNoticeAutomation } from './modules/accounts/notice.js'
import { retentionReviewAutomation } from './modules/retention/index.js'
import {
  appointmentChangedAutomation,
  appointmentConfirmedAutomation,
  appointmentReminderAutomations,
  appointmentReminderFailureItem,
  appointmentReminderRecordCheck,
  appointmentReminderValues,
  estimateVisitConfirmedAutomation,
  estimateVisitOptionsAutomation,
  scheduleChangeStaffAutomation,
  visitCancelledAutomation,
  windowOfferExpiryAutomation,
  workVisitOptionsAutomation,
} from './modules/visits/index.js'
import { notAFitNoticeAutomation } from './modules/requests/not-a-fit-notice.js'
import { workPausedDraftAutomation, workPausedRecordCheck } from './modules/hazards/index.js'
import { objectErasureAutomation } from './modules/privacy/log.js'
import type { CodeKeySettings } from './modules/identity/index.js'
import type { RecordChecks, ReleaseFailureItem, ReleaseValues } from './modules/notifications/index.js'
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
 * draft or scheduled automatic reminder is about: an estimate reminder's version (TSK-0060, TSK-0121, HH-EST-14), a
 * staff reply's project and contact (TSK-0050), a question reminder's question (TSK-0051, HH-LEAD-06) and an
 * appointment reminder's visit (TSK-0067, HH-COM-11). A feature whose deliveries need a check adds its record type
 * here, never a second registration.
 */
export const RELEASE_RECORD_CHECKS: RecordChecks = {
  estimate_version: estimateReminderRecordCheck,
  project: replyRecordCheck,
  question: questionRecordCheck,
  visit: appointmentReminderRecordCheck,
  // TSK-0077: a released work-paused notice is sent only while its report's critical hold still blocks.
  hazard_report: workPausedRecordCheck,
}

/**
 * The delivery issue of a failed message sent by notify.release: a staff reply's (TSK-0050), and each routine
 * reminder's (TSK-0051, TSK-0067; TSK-0121 adds the estimate reminder's).
 */
export const releaseFailureItem: ReleaseFailureItem = async (tx, row) =>
  (await replyFailureItem(tx, row)) ??
  (await questionReminderFailureItem(tx, row)) ??
  (await appointmentReminderFailureItem(tx, row)) ??
  (await estimateReminderFailureItem(tx, row))

/**
 * The values notify.release reads at send time, by message (TSK-0120: the staff reply; TSK-0121: the three automatic
 * reminders in their owner wording).
 */
export function releaseValues(publicSiteUrl: string | undefined): ReleaseValues {
  const sources = [
    replyValues(publicSiteUrl),
    estimateReminderValues(publicSiteUrl),
    questionReminderValues(publicSiteUrl),
    appointmentReminderValues(publicSiteUrl),
  ]
  return async (tx, row) => {
    for (const source of sources) {
      const values = await source(tx, row)
      if (values !== undefined) return values
    }
    return undefined
  }
}

export function buildAutomations(deps: AutomationDeps): Automation[] {
  // TSK-0119 (HH-COM-13): links in messages may point only at the configured public and staff origins.
  const linkHosts = linkHostsOf(deps.publicSiteUrl, deps.staffAppUrl)
  // TSK-0120: the visit notices' senders and the public site's base URL for their portal links.
  const visitNotices = {
    providers: {
      email: deps.providers.email,
      sms: deps.providers.sms,
      replyAddress: deps.replyAddress ?? null,
      linkHosts,
    },
    publicSiteUrl: deps.publicSiteUrl,
  }
  return [
    staffLinkEmailAutomation(deps),
    // TSK-0048: provider statuses and SMS keywords from the stored webhook receipts.
    deliveryStatusAutomation(),
    // TSK-0031: quarantined request photos are checked again before they may be served.
    photoProcessAutomation(deps.providers.storage),
    // TSK-0076: quarantined field photos are checked again before they may be served or shared.
    fieldPhotoProcessAutomation(deps.providers.storage),
    // TSK-0054: quarantined estimate documents are checked again before they may be used or served.
    estimateDocumentProcessAutomation(deps.providers.storage),
    // TSK-0055: a published estimate version expires at the end of its validity; publishing sends the automatic
    // estimate-ready notice (FACT-AUTOMATIC-MESSAGES #8).
    estimateExpiryAutomation(),
    estimateReadyAutomation({
      providers: {
        email: deps.providers.email,
        sms: deps.providers.sms,
        replyAddress: deps.replyAddress ?? null,
        linkHosts,
      },
      publicSiteUrl: deps.publicSiteUrl,
    }),
    // TSK-0056: a customer's Request Changes or Decline notifies the responsible staff member (wording NOT CONFIGURED).
    ...estimateResponseNoticeAutomations({
      providers: { email: deps.providers.email, sms: null, linkHosts },
      staffAppUrl: deps.staffAppUrl,
    }),
    // TSK-0093 (HH-INC-04): damage, injury and disputes notify every active Owner (wording NOT CONFIGURED).
    caseOpenedNoticeAutomation({
      providers: { email: deps.providers.email, sms: null, linkHosts },
      staffAppUrl: deps.staffAppUrl,
    }),
    // TSK-0060, TSK-0121: the automatic unanswered-estimate reminder, scheduled from the version's successful delivery
    // and sent by notify.release with its send-time record check (HH-COM-05).
    ...estimateReminderAutomations(),
    // TSK-0050: staff-released messages (a staff reply's Send; released reminders), each at its release time: inside
    // the daily contact hours for those held to them. A reply is rechecked against its contact at send time, and its
    // failed delivery opens a delivery issue with Retry.
    // TSK-0051: released question reminders are rechecked against their question (answered or closed: cancelled) and
    // their failed delivery opens a delivery issue on the request.
    // The one `notify.release` registration: every record type's send-time check is listed here.
    releaseAutomation(
      { email: deps.providers.email, sms: deps.providers.sms, replyAddress: deps.replyAddress ?? null, linkHosts },
      // TSK-0120: a staff reply's email values are read from the reply at send time (replyValues); TSK-0121: so are
      // the automatic reminders' (releaseValues).
      {
        recordChecks: RELEASE_RECORD_CHECKS,
        failureItem: releaseFailureItem,
        values: releaseValues(deps.publicSiteUrl),
      },
    ),
    // TSK-0058: each approval's receipt PDF, issued once, and the automatic approval receipt message
    // (FACT-AUTOMATIC-MESSAGES #9; wording NOT CONFIGURED: each delivery records template_not_configured).
    approvalReceiptDocumentAutomation(deps.providers.storage),
    // TSK-0049: its email replies to the project's reply address.
    approvalReceiptNoticeAutomation({
      providers: {
        email: deps.providers.email,
        sms: deps.providers.sms,
        replyAddress: deps.replyAddress ?? null,
        linkHosts,
      },
      publicSiteUrl: deps.publicSiteUrl,
    }),
    // TSK-0077: a committed Stop Work drafts the Owner-released work-paused notice (never automatic, OWN-DEC-152).
    workPausedDraftAutomation(),
    // TSK-0041: action queue items from the modules' committed events.
    ...queueAutomations(),
    // TSK-0059: an approval whose job needs a deposit opens its deposit_due item (deposits to collect, S01).
    depositQueueAutomation(),
    // TSK-0085: the approval prepares the job's final invoice draft; an issued invoice's PDF is stored once; its
    // automatic customer notice (invoice ready, FACT-AUTOMATIC-MESSAGES #18; deposit invoice, #16) sends once.
    invoiceDraftAutomation(),
    invoiceDocumentAutomation(deps.providers.storage),
    invoiceReadyAutomation(visitNotices),
    depositInvoiceAutomation(visitNotices),
    // TSK-0032: the automatic receipt email, once per saved request (HH-INT-20); email only.
    receiptEmailAutomation({
      providers: { email: deps.providers.email, sms: null, replyAddress: deps.replyAddress ?? null, linkHosts },
    }),
    // TSK-0120: the automatic not-a-fit notice after an authorized staff member's formal decision (#7, OWN-DEC-209).
    notAFitNoticeAutomation({
      providers: {
        email: deps.providers.email,
        sms: deps.providers.sms,
        replyAddress: deps.replyAddress ?? null,
        linkHosts,
      },
      publicSiteUrl: deps.publicSiteUrl,
    }),
    // TSK-0043: a meaningful customer message whose delivery succeeded stops the first-response clock.
    responseClockAutomation(),
    // TSK-0034: the secure project access link, once per grant, by email and (with the SMS opt-in) by text.
    accessLinkAutomation({
      providers: {
        email: deps.providers.email,
        sms: deps.providers.sms,
        replyAddress: deps.replyAddress ?? null,
        linkHosts,
      },
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
    // TSK-0036, TSK-0120: the notice to the old and the new email after an account's sign-in email changed (HH-ID-11,
    // account_email_changed of OWN-DEC-151).
    contactChangedNoticeAutomation({ providers: { email: deps.providers.email, sms: null, linkHosts } }),
    // TSK-0099: the daily retention scan opens Owner deletion-review entries; it never deletes anything.
    retentionReviewAutomation(),
    // TSK-0063: an offer's hold ends at its expiry (OWN-DEC-144); the automatic estimate-visit options, estimate-visit
    // confirmed and work appointment confirmed notices (FACT-AUTOMATIC-MESSAGES #5, #6, #12). TSK-0120: their values
    // are wired, and publishing work-visit windows sends the work-appointment windows notice (#11, OWN-DEC-156).
    windowOfferExpiryAutomation(),
    estimateVisitOptionsAutomation(visitNotices),
    workVisitOptionsAutomation(visitNotices),
    estimateVisitConfirmedAutomation(visitNotices),
    appointmentConfirmedAutomation(visitNotices),
    // TSK-0066: a committed reschedule or reassignment notifies the customer once (#13); every committed change
    // notifies the affected workers (staff notice, wording NOT CONFIGURED). TSK-0120: a committed cancellation sends
    // the visit-cancelled notice (#14; its transaction already cancelled the visit's waiting reminders).
    appointmentChangedAutomation(visitNotices),
    visitCancelledAutomation(visitNotices),
    scheduleChangeStaffAutomation({
      providers: { email: deps.providers.email, sms: null, linkHosts },
      staffAppUrl: deps.staffAppUrl,
    }),
    // TSK-0070: an assigned worker's accepted On my way sends the automatic on-the-way notice once (#15; TSK-0120 wires
    // the values of its owner-authorized wording, OWN-DEC-209).
    onTheWayAutomation(visitNotices),
    // TSK-0067, TSK-0121: the automatic appointment reminder of each confirmed visit's window, 24 hours before it; its
    // send-time check is the visit entry of RELEASE_RECORD_CHECKS.
    ...appointmentReminderAutomations(),
    // TSK-0051: the automatic question notice and staff reply notice, the reminder clock from the notice's successful
    // send (TSK-0121: the one automatic reminder) and the "may close" queue item.
    ...questionAutomations({
      providers: {
        email: deps.providers.email,
        sms: deps.providers.sms,
        replyAddress: deps.replyAddress ?? null,
        linkHosts,
      },
      publicSiteUrl: deps.publicSiteUrl,
      staffAppUrl: deps.staffAppUrl,
    }),
    // TSK-0100: the stored files of a record the Owner deleted are removed after the deletion committed.
    objectErasureAutomation(deps.providers.storage),
  ]
}
