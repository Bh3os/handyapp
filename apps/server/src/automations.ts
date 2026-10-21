// The declared automations the in-process worker runs (TSK-0012, HH-AUTO-01). Each later task appends its own
// declaration here; an incomplete one stops the server at boot.
import { staffLinkEmailAutomation, type LinkEmailDeps } from './modules/identity/link-email.js'
import {
  estimateDocumentProcessAutomation,
  estimateExpiryAutomation,
  estimateReadyAutomation,
  estimateResponseNoticeAutomations,
} from './modules/estimates/index.js'
import { depositQueueAutomation } from './modules/finance/index.js'
import { deliveryStatusAutomation } from './modules/notifications/index.js'
import { photoProcessAutomation } from './modules/photos/index.js'
import { queueAutomations } from './modules/queue/index.js'
import { receiptEmailAutomation } from './modules/requests/receipt-email.js'
import { responseClockAutomation } from './modules/requests/response-clock.js'
import { accessLinkAutomation } from './modules/access/link-message.js'
import { contactChangedNoticeAutomation } from './modules/accounts/notice.js'
import type { CodeKeySettings } from './modules/identity/index.js'
import type { Automation } from './platform/automation.js'
import type { Providers } from './providers/index.js'

export type AutomationDeps = LinkEmailDeps & {
  providers: Pick<Providers, 'email' | 'sms' | 'storage'>
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
    estimateReadyAutomation({ providers: { email: deps.providers.email, sms: deps.providers.sms } }),
    // TSK-0056: a customer's Request Changes or Decline notifies the responsible staff member (wording NOT CONFIGURED).
    ...estimateResponseNoticeAutomations({
      providers: { email: deps.providers.email, sms: null },
      staffAppUrl: deps.staffAppUrl,
    }),
    // TSK-0041: action queue items from the modules' committed events.
    ...queueAutomations(),
    // TSK-0059: an approval whose job needs a deposit opens its deposit_due item (deposits to collect, S01).
    depositQueueAutomation(),
    // TSK-0032: the automatic receipt email, once per saved request (HH-INT-20); email only.
    receiptEmailAutomation({ providers: { email: deps.providers.email, sms: null } }),
    // TSK-0043: a meaningful customer message whose delivery succeeded stops the first-response clock.
    responseClockAutomation(),
    // TSK-0034: the secure project access link, once per grant, by email and (with the SMS opt-in) by text.
    accessLinkAutomation({
      providers: { email: deps.providers.email, sms: deps.providers.sms },
      codeKey: deps.codeKey ?? { state: 'not_configured', missing: ['CODE_HASH_KEY'] },
      publicSiteUrl: deps.publicSiteUrl,
    }),
    // TSK-0036: the notice to the old email after an account's sign-in email changed (HH-ID-11); sends only once the
    // owner lists it as automatic and approves its wording (OQ-ACCOUNT-CONTACT-NOTICE).
    contactChangedNoticeAutomation({ providers: { email: deps.providers.email, sms: null } }),
  ]
}
