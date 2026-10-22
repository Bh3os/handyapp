---
id: OQ-INVOICE-LEDGER-DETAILS
type: question
title: The invoice and payment-ledger details no decision gives
status: open
area: invoicing
links:
  related: ["[[OWN-DEC-110]]", "[[OWN-DEC-111]]", "[[OWN-DEC-138]]", "[[OWN-DEC-152]]", "[[OWN-DEC-203]]", "[[HH-FIN-03]]", "[[HH-FIN-04]]", "[[HH-FIN-05]]", "[[HH-FIN-06]]", "[[HH-FIN-07]]", "[[HH-FIN-14]]", "[[HH-QA-02]]", "[[TSK-0084]]", "[[TSK-0085]]", "[[TSK-0086]]", "[[TSK-0087]]", "[[TSK-0089]]", "[[OQ-TAX-CPA]]", "[[OQ-ATTORNEY-TERMS]]", "[[OQ-LEGAL-ENTITY-NAME]]"]
source: "TSK-0085, TSK-0086 (2026-10-22): the decisions state the rules; the details below are PROPOSED"
---
**Question:** does the owner approve, or change, these PROPOSED details of invoicing and the payment ledger?

- **Who answers:** the owner; the accounting items with the CPA ([[OQ-TAX-CPA]]), the warranty wording with the attorney ([[OQ-ATTORNEY-TERMS]]).
- **Decided, in use:** the final invoice draft is prepared automatically from the approved estimate lines and selected options (and approved change orders once [[TSK-0082]] records them), with the approved discount as a totals row and no tax line; issuing waits for the Owner's quality review; Office or the Owner issue ([[OWN-DEC-138]]); "Payment due on receipt" as recorded with the approval; the deposit is credited once; the invoice-ready and deposit-invoice notices are automatic, without amounts ([[OWN-DEC-110]], [[OWN-DEC-152]]); a credit line is a positive magnitude with a negative effect ([[OWN-DEC-203]]); Paid only when confirmed payments and credits reach $0.00 ([[OWN-DEC-111]]).
- **NOT CONFIGURED, waiting:** the Owner's quality review ([[TSK-0084]]) is not built: `finance.invoice_quality_gate` answers `quality_review_not_recorded` for every job, so no final invoice can be issued yet; TSK-0084 replaces that one function with the review's outcome (`passed`; `owner_may_issue` for minor punch items, the Owner only; `blocked` for major defects). The Square payment link per invoice, the Payments tab and the payment receipt message are [[TSK-0087]]; voids, reissues, refunds, credits and write-offs as workflows are [[TSK-0089]].
- **PROPOSED, in use on private staging:**
  - Invoice numbers are the project reference and `-I<n>`, numbered per project at issue (a draft has none); never reused.
  - The draft is prepared on the approval's committed event and again when staff ask (after an approved change); a draft whose scope changed waits (`SCOPE_CHANGED`) until it is prepared again. A scope whose lines do not add up to its approved totals, or whose credits reach its charges, is refused and shown to staff, never adjusted.
  - The deposit invoice is prepared and issued by staff (invoice.issue) while the deposit is still due; it needs no quality review, has one line (the deposit the approval pinned, worded "Deposit for approved estimate <number>, version <n>") and is paid through the deposit (the deposit payments), never allocated to directly.
  - Issuing a final invoice waits while a deposit check is still pending, so the deposit credit is exactly the verified deposit money; a waived or unpaid deposit gives no credit; a verified deposit larger than the invoice is refused and routed to the Owner.
  - Invoice states: `partially_paid` once a confirmed payment is applied; a deposit credit alone leaves it `issued`.
  - A payment is applied up to what the invoice still asks for counting pending checks; the remainder of an overpayment (and of a deposit payment beyond the deposit) is unallocated money, one `unallocated_credit` item in Owner Decisions per job until TSK-0089's credit or refund decision.
  - A refund applies only to money its payment can still give (not applied elsewhere); an applied credit counts toward Paid; write-offs do not (accounting treatment with the CPA).
  - Square payouts and fees are recorded by hand by the Owner and Office (`payout.record`, `fee.record`, in the reconcile row of [[ROLE-MATRIX]]); a fee belongs to a Square card payment and/or a payout and never changes the customer payment.
  - The invoice PDF lists each accepted method: cards "(Square), through this invoice's Square payment link from HandyHub", Tap to Pay, cash, and the check, Zelle, Cash App and Chime handles as configured, labelled "Placeholder — not a payment destination" while they are placeholders; no surcharge is charged or mentioned (HH-CUS-07); the phone and email as "Placeholder — not provided yet"; the 90-day workmanship warranty in the words of the estimate terms with their note that the wording waits for attorney review.
  - The invoice notices link to the project's Documents tab; the deposit-invoice notice's job number is the project reference.
  - Deletion checks: an issued invoice is protected evidence (found blocks; none recorded is still the Owner's check, for invoices issued outside the software).
- **Human review (never decided here):** accounting treatment of refunds, credits, write-offs, fees and payouts (CPA); tax treatment of every service ([[OQ-TAX-CPA]]; no tax is charged and nothing is said about tax); the warranty wording and exclusions ([[OQ-ATTORNEY-TERMS]]); the legal entity name on invoices ([[OQ-LEGAL-ENTITY-NAME]]).
- **Until answered:** the PROPOSED details above are used; each is a configuration or small code change.
