// Portal wording checked against actual behaviour (TSK-0150; OWN-DEC-199, HH-PORT-02, HH-PORT-03, HH-PORT-06).
//
// The register of every customer sentence TSK-0150 corrected or added: the catalog key, the exact sentence, what the
// software does that makes it true, and the tests that pin that behaviour (each carries the TSK-0150 tag). The review
// behind it (which sentences were checked, which stay owner wording with a PROPOSED change) is in
// OQ-PORTAL-WORDING-DETAILS. A catalog edit that changes one of these sentences fails here until the register and its
// pinning test change with it; removed sentences stay removed.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CATALOGS } from '@handyhub/i18n'
import { describe, expect, it } from 'vitest'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

type Checked = {
  /** The customer catalog key. */
  readonly key: string
  /** The exact sentence. */
  readonly text: string
  /** What the software does that makes it true. */
  readonly behaviour: string
  /** Tests (repository paths) that pin that behaviour; each names TSK-0150. */
  readonly pinnedBy: readonly string[]
}

const SERVER = 'apps/server/test/integration'
const PORTAL = 'apps/portal/test'

const CHECKED: readonly Checked[] = [
  // Customer actions and who is waiting (HH-PORT-02).
  {
    key: 'portal.step.arrival_recorded',
    text: 'HandyHub recorded that your visit has arrived.',
    behaviour: 'A recorded "Arrived" (visit state arrived) before work starts; "is on the way" is only en route.',
    pinnedBy: [`${SERVER}/my-day.test.ts`, `${PORTAL}/App.test.tsx`, 'packages/domain/test/portal.test.ts'],
  },
  {
    key: 'portal.payment.invoice.due',
    text: 'Invoice balance due: {amount}.',
    behaviour:
      'The issued final invoices’ remaining balance; with it the Overview asks to pay unless a pending check covers it.',
    pinnedBy: [`${SERVER}/invoices.test.ts`, `${PORTAL}/App.test.tsx`],
  },
  {
    key: 'portal.payment.none.text',
    text: 'Your deposit and invoice amounts appear here once HandyHub shares them.',
    behaviour: 'The Overview payment summary shows the deposit and the invoice balance; no estimate amount.',
    pinnedBy: [`${PORTAL}/App.test.tsx`],
  },
  // Estimate approval and expiry.
  {
    key: 'portal.estimate.approval.reason.terms_not_current',
    text: "The estimate terms changed after this version was sent, so this version can't be approved.",
    behaviour: 'Approval accepts only the current recorded terms (TERMS_NOT_CURRENT); the page offers none.',
    pinnedBy: [`${SERVER}/estimate-approval.test.ts`, `${PORTAL}/Estimate.test.tsx`],
  },
  {
    key: 'portal.estimate.changes.hint',
    text: 'Your message goes to HandyHub staff. This version stays as it is until HandyHub sends a new one, withdraws it or it expires.',
    behaviour: 'A change request leaves the version published with its end of validity unchanged.',
    pinnedBy: [`${SERVER}/portal-estimates.test.ts`],
  },
  {
    key: 'portal.estimate.approve.failure.not_configured',
    text: "This estimate can't be approved here yet. Please try again later or contact HandyHub.",
    behaviour: 'A 503 comes from the terms or the deposit rule not being configured; the sentence names neither.',
    pinnedBy: [`${PORTAL}/Estimate.test.tsx`],
  },
  {
    key: 'portal.estimate.receipt.preparing',
    text: 'Your approval receipt is being prepared. It appears here once it is ready.',
    behaviour: 'The receipt is made by a retried job; no time is promised.',
    pinnedBy: [`${SERVER}/approval-receipt.test.ts`],
  },
  {
    key: 'portal.documents.none.text',
    text: 'Estimates, your approval receipt, change orders and invoices appear here once HandyHub shares them.',
    behaviour: 'The Documents tab lists estimates (with the approval receipt), change orders and invoices only.',
    pinnedBy: [`${SERVER}/portal-tabs.test.ts`],
  },
  // Change orders.
  {
    key: 'portal.changeOrders.status.blocked',
    text: "Can't be decided",
    behaviour: 'An issued version priced before another approved change (canDecide false) takes no decision.',
    pinnedBy: [`${PORTAL}/ChangeOrders.test.tsx`],
  },
  {
    key: 'portal.changeOrders.waitingForUpdate',
    text: "Another change was approved after this one was priced, so this version can't be approved or declined. Only a new version from HandyHub can be decided.",
    behaviour: 'No new version is made by itself; staff revise it against the new approved scope.',
    pinnedBy: [`${PORTAL}/ChangeOrders.test.tsx`, `${SERVER}/change-orders.test.ts`],
  },
  {
    key: 'portal.changeOrders.failure.scope_changed',
    text: "Another change was approved first, so this version can't be approved or declined. Only a new version from HandyHub can be decided.",
    behaviour: 'APPROVED_SCOPE_CHANGED: the loser stays issued, blocked, at its version until staff revise it.',
    pinnedBy: [`${SERVER}/change-orders.test.ts`],
  },
  // Confirmed versus preferred appointments.
  {
    key: 'portal.appointment.confirmed.title',
    text: 'Your visits',
    behaviour: 'The list keeps confirmed, under-way, completed and canceled visits.',
    pinnedBy: [`${PORTAL}/AppointmentRequests.test.tsx`],
  },
  {
    key: 'portal.appointment.none.title',
    text: 'No upcoming appointment',
    behaviour: 'Shown when no live (not completed, not canceled) visit exists, also after past visits.',
    pinnedBy: [`${PORTAL}/App.test.tsx`],
  },
  // Payment state.
  {
    key: 'portal.payments.receiptVoided',
    text: 'Receipt {number} (payment {payment}): this payment was returned or voided, so it no longer counts.',
    behaviour: 'Shown for a returned or voided payment; the receipt itself is never voided.',
    pinnedBy: [`${SERVER}/invoices.test.ts`],
  },
  // Completed versus open projects, and the account pages.
  {
    key: 'portal.projects.section.archivedEmpty',
    text: 'Cancelled projects, and projects closed before any work was completed, appear here.',
    behaviour: 'A closed project with a completed job is in Project History; canceled or closed without one is here.',
    pinnedBy: ['packages/domain/test/portal.test.ts'],
  },
  {
    key: 'portal.projects.empty.text',
    text: 'Projects linked to your account appear here.',
    behaviour: 'An account lists only the projects linked to it; opening a link starts a separate session.',
    pinnedBy: [`${SERVER}/customer-dashboard.test.ts`],
  },
  {
    key: 'portal.claim.text',
    text: "Have another HandyHub request? Enter its request reference from your receipt and the email or mobile phone on that request. If that email or phone was confirmed on the request, we'll send a one-time code there, and the project is added only after you enter it.",
    behaviour: 'A code is sent only to a contact verified on that request; an unverified match sends nothing.',
    pinnedBy: [`${SERVER}/customer-dashboard.test.ts`],
  },
  {
    key: 'portal.preferences.channel.text',
    text: 'Request This Service Again and a request for a saved property start with this choice. You can still change it on the request.',
    behaviour:
      'Only the account-started request forms read the account (and its preference); a plain request does not.',
    pinnedBy: ['apps/site/test/request-again.test.ts'],
  },
  {
    key: 'portal.properties.intro',
    text: 'Give the places from your requests a name, then start a new request from one. The addresses come from your projects; if one has changed, correct it on your next request.',
    behaviour: 'The saved addresses are those of the account’s verified requests, whether or not work was done.',
    pinnedBy: [`${SERVER}/customer-saved-properties.test.ts`],
  },
  {
    key: 'portal.messages.none.text',
    text: "Your conversation with HandyHub about this project appears here. Automatic notices aren't shown here.",
    behaviour: 'The Messages tab lists the project conversation only, never the automatic emails and texts.',
    pinnedBy: [`${SERVER}/portal-tabs.test.ts`],
  },
  {
    key: 'portal.photos.none.text',
    text: 'Photos you upload on your project page appear here, along with before and after photos HandyHub shares with you.',
    behaviour: 'The Photos tab lists portal uploads and shared photos; email or text attachments are not listed.',
    pinnedBy: [`${SERVER}/portal-tabs.test.ts`],
  },
  {
    key: 'access.help.done',
    text: 'Thanks. HandyHub will review your message and, if these details match a HandyHub request or account, contact you using the details we have on file.',
    behaviour: 'Asking opens an Owner review item and sends nothing by itself.',
    pinnedBy: [`${SERVER}/account-security.test.ts`],
  },
  // Organization accounts (TSK-0118): what a membership really grants.
  {
    key: 'portal.organizations.privilege.approve',
    text: 'Can approve, decline or ask for changes to estimates and change orders, and choose or change appointment times',
    behaviour:
      'approve covers estimate approve, decline and request changes, change-order decisions, choosing a window and ' +
      'reschedule or cancellation requests (ORGANIZATION_ACTIONS); there is no appointment approval.',
    pinnedBy: [`${PORTAL}/Organizations.test.tsx`, 'apps/server/test/unit/portal-actions.test.ts'],
  },
  {
    key: 'portal.organizations.scope.approve',
    text: 'Allow approving, declining or asking for changes to estimates and change orders, and choosing or changing appointment times',
    behaviour: 'The same approve privilege, as the administrator grants it.',
    pinnedBy: [`${PORTAL}/Organizations.test.tsx`],
  },
  {
    key: 'portal.organizations.privilege.view',
    text: 'Can see the shared projects, except their messages',
    behaviour: 'A member reads the workspace, but the Messages tab and questions are refused to every member.',
    pinnedBy: [`${SERVER}/customer-organizations.test.ts`],
  },
  {
    key: 'portal.organizations.done.accepted',
    text: 'You joined {organization}. The projects it shares with you are on your projects page.',
    behaviour: 'A member sees only the projects in their own scope, never the organization’s other projects.',
    pinnedBy: [`${PORTAL}/Organizations.test.tsx`, `${SERVER}/customer-organizations.test.ts`],
  },
  {
    key: 'portal.organizations.done.withdrawn',
    text: 'The invitation to {email} is withdrawn.',
    behaviour: 'Withdrawing an invitation ends an invitation that never granted access.',
    pinnedBy: [`${PORTAL}/Organizations.test.tsx`],
  },
]

/** Sentences removed because nothing in the software makes them true. */
const REMOVED = ['portal.documents.others'] as const

const catalog = CATALOGS['customer.en'] as Record<string, string>

describe('portal wording checked against behaviour (TSK-0150, OWN-DEC-199)', () => {
  it('[HH-PORT-02][HH-PORT-03] each corrected sentence is in the catalog exactly as registered', () => {
    for (const c of CHECKED) expect(catalog[c.key], c.key).toBe(c.text)
    expect(new Set(CHECKED.map((c) => c.key)).size).toBe(CHECKED.length)
  })

  it('[HH-PORT-06] each names the tests that pin its behaviour, and each of those tests carries the TSK-0150 tag', () => {
    for (const c of CHECKED) {
      expect(c.pinnedBy.length, c.key).toBeGreaterThan(0)
      for (const path of c.pinnedBy) {
        const file = join(ROOT, path)
        expect(existsSync(file), `${c.key}: ${path}`).toBe(true)
        expect(readFileSync(file, 'utf8'), `${c.key}: ${path}`).toContain('TSK-0150')
      }
    }
  })

  it('a sentence nothing makes true stays out of the catalog', () => {
    for (const key of REMOVED) expect(catalog[key], key).toBeUndefined()
  })
})
