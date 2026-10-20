# Owner resolutions for the blocked and conflicting requirements (2026-10-12)

Slice 0 found nine requirements blocked on owner inputs and one conflict. The owner answered five rounds of questions
in the project chat on 2026-10-12. Each answer below is recorded in the vault decision log (OWN-DEC-64 to OWN-DEC-75)
and is binding for the build. Where a later answer changed an earlier one, the later answer governs and the change is
stated.

| Requirement            | Was                                    | Resolution                                                                       |
| ---------------------- | -------------------------------------- | -------------------------------------------------------------------------------- |
| HH-FIN-08, HH-FIN-09   | Blocked: Stripe connection undecided   | Not applicable: Square on staff phones, recorded by hand (R1); HH-FIN-10 applies |
| HH-WORK-03             | Blocked: no permitted-exception list   | Three administrative exceptions, worker requests, owner approves (R2)            |
| HH-WORK-06             | Blocked: timekeeping policy            | Arrival and finish timestamps per worker only; no payroll (R3)                   |
| HH-PRIV-01, HH-DATA-09 | Blocked: retention periods             | Owner retention schedule with a review queue, no automatic deletion (R4)         |
| HH-PRIV-03 (part)      | Customer deletion requests             | Owner deletes the account; protected records retained (R5)                       |
| HH-PRIV-04             | Blocked: attorney wording              | Complete drafts on staging marked "Draft - not reviewed by an attorney" (R6)     |
| HH-QA-02               | Conflict: "no review" versus the guide | Owner reviews every job; punch-item rules (R7); walkthrough record (R8)          |
| HH-AUTO-03, HH-AUTO-04 | Blocked: AI plan 33                    | AI stays off (Wave 2) (R9)                                                       |
| Staging (OWN-DEC-58)   | Public staging with an open form       | Whole staging behind an access gate for the owner and testers (R10)              |

Also recorded: staff release each customer email (R11) and the website facts the owner gave on 2026-10-05 (R12).

## R1 Payments: Square instead of Stripe (OWN-DEC-67; amends OWN-DEC-36)

- Square replaces Stripe. Card payments are taken on staff phones with Square (Tap to Pay); the deposit is requested with
  a secure payment link sent from the Square app's own feature. The customer may pay by any accepted method.
- HandyHub is not connected to Square: staff record each Square payment by hand with the Square payment ID. A deposit
  counts as paid only when the payment is verified in Square. HandyHub shows no Pay button of its own and stores no card
  data (HH-FIN-10).
- No card surcharge of any kind (the owner's attorney advised against it). The owner's earlier answers about a
  surcharge are withdrawn.
- The owner and field employees may collect payments, each with an explicit collect permission; every payment names
  its collector. Refunds stay with the owner.
- The website keeps the card provider unnamed ("credit or debit cards").

## R2 Start Work administrative exceptions (OWN-DEC-68; HH-WORK-03)

Only these three exceptions exist:

1. **Customer not present:** work may start when the customer has already approved the scope and explicitly authorized
   unattended access, the access instructions are confirmed and a contact is available. The worker still completes the
   required site inspection and safety checks; only the customer walkthrough may be deferred.
2. **Before-photos captured but upload failed:** all required photos were captured and remain on the device. The upload
   failure is recorded, the photos are marked pending synchronization and uploaded when connectivity returns. Missing
   photo capture cannot be waived.
3. **Deposit paid but bookkeeping pending:** the required deposit is independently verified through Square (or another
   approved payment provider) and the transaction reference is recorded with reconciliation pending. A customer's
   statement or screenshot is not enough; an unpaid required deposit stays blocking.

Process: an assigned worker submits the exception request with reason and evidence; only the owner approves. Approval
covers one requirement, one job and one visit, expires when the visit ends, never carries over, and is invalidated by a
relevant change in scope, site conditions, access, assignment or evidence. Each record holds the job, affected
requirement, reason, evidence, requester, owner approval, timestamp, follow-up owner and deadline. Pending upload or
reconciliation tasks stay open after the approval expires. Every approved exception appears in the owner's review
queue. Safety, legal, qualification, approved scope, work authorization and access permission can never be waived.

## R3 Worker time (OWN-DEC-69; HH-WORK-06)

No categorized time tracking now. Each assigned worker's tap on "Arrived" and "Finished" records a separate timestamp;
the elapsed visit duration is linked to the worker and the job. The owner may correct a forgotten or wrong timestamp;
the original value and the reason are kept. A missing timestamp is flagged, never invented. Records export for the
accountant. No payroll, overtime, deductions or paystubs. "Arrived" never starts work or bypasses the Start Work checks.

## R4 Retention schedule and deletion review (OWN-DEC-70; HH-PRIV-01, HH-DATA-09)

Configurable defaults, extendable by the owner; longer legal, tax, insurance or contractual requirements override them:

| Category                                                               | Retention                                                                                                        |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Requests that never become jobs                                        | 2 years after closure                                                                                            |
| Unaccepted estimates                                                   | 2 years after expiration or closure                                                                              |
| Customer and property profiles                                         | While active, then 7 years after the last completed service; identity needed by longer-kept records is preserved |
| Accepted estimates, work authorizations, contracts, change orders      | 10 years after final job closeout                                                                                |
| Invoices, payments, receipts, refunds, reconciliation records          | 7 years after the relevant tax return is filed or the tax is paid, whichever is later                            |
| Job photos, operational messages, checklists, arrival and finish times | 7 years after job closeout; evidence for an approval or contract follows that record's longer period             |
| Ordinary safety acknowledgments and incident records                   | 10 years after closure                                                                                           |
| Regulated employee medical or exposure records                         | Excluded from routine deletion; a separate reviewed schedule                                                     |
| Property access codes                                                  | Removed when no longer needed for authorized access                                                              |
| Sign-in sessions and access links                                      | Expire by their security settings                                                                                |

- Expired records enter the owner's deletion-review queue; nothing is deleted automatically. Before deletion the system
  checks for unresolved complaints, warranties, disputes, claims, investigations, unfiled tax returns, and legal or
  insurance holds; a hold blocks deletion of the record and its related evidence.
- No separate one-year contact-removal rule for lost requests (the owner's earlier one-year answer is withdrawn).
- The owner has a Delete action on individual entries. The confirmation reads "Are you sure you want to delete this
  entry?" with the record name or reference, the attachments and linked records affected, and whether deletion is
  permanent, with Cancel and Confirm Delete. Confirmation never bypasses a hold, a dispute, required retention or an
  essential linked record; a blocked deletion says why and offers Archive.
- Eligible records may be deleted early with a recorded reason. The log keeps actor, time, record reference and reason,
  not the deleted personal content.
- Issued invoices, payments, signed approvals and other protected evidence use Archive, Void or an audited correction,
  never ordinary deletion.

## R5 Customer account deletion (OWN-DEC-71; HH-PRIV-03 part)

The login account is deleted separately from business records. The owner sees what will be deleted, what is retained,
why, and the review date. On confirmation: sign-in, sessions and project-access links are revoked; eligible
unnecessary personal data and account preferences are deleted. Invoices and payments (7 years), accepted estimates and
authorizations (10 years) and incident records (10 years) stay, subject to longer requirements or holds; supporting
photos, messages and property details stay when their own schedule or a protected record requires them. Signed
approvals and issued financial documents are never rewritten. Retained records are restricted to authorized staff
with only the necessary identifying information. A hold blocks deletion of affected records, but account access can
still be disabled. Relationships are preserved without cascading into protected records. The owner, time, reason,
deleted categories and retained categories are recorded; retained records enter the review queue when their periods
end.

## R6 Privacy notice and website terms (OWN-DEC-72; HH-PRIV-04)

- Draft the complete English privacy notice and website terms now and show them on staging with "Draft - not reviewed
  by an attorney". No empty "pending review" pages.
- Describe only services actually used, verified in the implementation: Render hosting, Cloudflare R2 photo storage,
  ZITADEL staff sign-in, Telnyx texts, Resend email, Square payments (taken outside the software), each with its
  purpose.
- The privacy notice covers collected information, purposes, authorized staff and vendor access, photo handling,
  retention, customer requests and contact details. Marketing consent and permission to publish photos stay separate
  from service requests.
- The terms reflect the actual process: guest requests, optional accounts, estimates that need approval, separately
  confirmed appointments, approved scope changes, configured payment and deposit policies, no minimum job charge. No
  invented cancellation fees, warranties, liability waivers or refund rules.
- An attorney review checklist goes with the drafts. Production needs the reviewed pages, verified practices and
  documented owner approval. The policy version presented is recorded with each request and acceptance.

## R7 Quality review (OWN-DEC-64; HH-QA-02; supersedes the 2026-10-05 chat answer to Q-06-05)

- The owner reviews every job before it counts as complete. A job the owner performed is reviewed by the owner and
  marked "self-review".
- Every problem found becomes a punch item with an assigned owner, a due date and required correction evidence.
- Minor finish or cleanup issues: the job stays open and the customer sees "Follow-up work". The owner may issue an
  invoice if the approved payment terms allow it; invoicing must not imply that unfinished work was accepted.
- Major defects, incomplete agreed scope, failed functional checks or safety concerns: the final invoice is blocked and
  the affected tasks return for correction. Safety concerns also block the affected work until properly resolved.
- Agreed deposit or progress invoices stay separate and follow their approved terms.
- The job cannot close until every punch item is corrected and passes re-check. Reviewer, results, evidence and
  timestamps are recorded.

## R8 End-of-job walkthrough (OWN-DEC-75; HH-QA-03)

The walkthrough is recorded with the customer or their authorized representative: accepted, accepted with punch items,
customer unavailable, or disputed, with participant, worker, timestamp, comments and linked punch items. "Customer
unavailable" and no response are never acceptance; the completion summary and approved photos are shared through the
secure project link for later review. Disputed work goes to the owner. Customer acceptance never bypasses quality
checks or closes punch items. A signature is optional unless the approved service agreement requires it.

## R9 AI features (OWN-DEC-74; HH-AUTO-03, HH-AUTO-04)

AI stays off (Wave 2, OWN-DEC-20). The tested "AI disabled" state stays; guardrails are designed when the owner
approves plan 33 and a provider.

## R10 Staging access (OWN-DEC-73; replaces the public part of OWN-DEC-58)

- The whole staging environment is restricted to the owner and explicitly authorized testers by an access gate. Forms
  stay enabled behind it; submission APIs and file access are protected too.
- Normal customer and staff sign-in and permissions stay active inside staging, with separate test accounts per role.
- Staging keeps its own database, test records, test email and text destinations, and no real charges or customer
  messages. Only a minimal health check stays public, with no private data. Staging stays out of search indexing.
- Every implemented function stays available for the owner's manual tests: customers, requests, estimates and
  approvals, scheduling, job execution, uploads, invoices and administrative actions.

## R11 Customer emails (OWN-DEC-65)

Staff release each customer email (OWN-DEC-41 kept). One-time codes and secure links send immediately because they
expire within minutes or hours.

## R12 Website facts of 2026-10-05 (OWN-DEC-66)

The owner gave these facts in chat on 2026-10-05; they were published (handyhub-app PR #47) but never entered in the
decision log: free estimates, online or in person; the 20% deposit on estimates over $1,000 is paid before materials
are bought, the balance when the job is finished; 10% discounts for military members, seniors and returning customers,
one per job, the biggest applies; visits every day, 8 am to 10 pm, never 24/7; same-day service when there is an
opening, for an extra charge shown on the estimate; the home-age limits (no paint-disturbing work in homes built before
1978 on the listed services; popcorn removal only in homes built in 1981 or later); the customers served. R1 changes
the card wording to an unnamed provider.
