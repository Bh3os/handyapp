# Review packet: CPA

Prepared 2026-10-22 by TSK-0143 for OWN-DEC-186. Status: waiting for review. Nothing in this packet is a tax or accounting conclusion; every item is a question for you.

## 1. Who this is for
The owner's CPA (RULE-HUMAN-REVIEW: tax and accounting close are human-review boundaries). Retention periods and the mailing-address question go to the attorney too ([attorney.md](attorney.md) A-04, A-14); answer the tax, accounting and payroll side.

## 2. What HandyHub is (from the knowledge graph)
- FACT: HandyHub is the customer-facing brand of ODD JOBS & MORE LLC, a Kentucky limited liability company; the assumed name "HandyHub" is not filed (FACT-LEGAL-ENTITY). Estimates and invoices print "Handyhub LLC" (FACT-BUSINESS-NAME); its relation to the LLC is open (OQ-LEGAL-ENTITY-NAME, with the attorney).
- FACT: a residential home-services business with 26 services: cleaning (7), drywall (4), painting (4), home improvement (11) (OWN-DEC-04). The list is in [insurance.md](insurance.md) section 4.
- FACT: service area, eleven whole counties in two states (FACT-SERVICE-AREA): Kentucky: Jefferson, Oldham, Bullitt, Shelby, Meade; Indiana: Clark, Floyd, Harrison, Scott, Washington, Jefferson. Each state needs its own tax assessment (OWN-DEC-37). Not registered to do business in Indiana yet (OQ-INDIANA-REGISTRATION).
- FACT: initially two employees; the owner holds every office role and also works in the field; subcontractors later, paid outside the app (OWN-DEC-05, OWN-DEC-28, OWN-DEC-188). The app holds no payroll and no pay rates.
- FACT: money in the software is integer cents; each line is rounded half-up to the cent and totals equal the sum of the displayed amounts (RULE-MONEY-CENTS, OWN-DEC-83).
- FACT: the software runs only on private staging with synthetic data until the owner's go decision; launch in three phases (OWN-DEC-191).

## 3. Materials to review
| Material | Where |
| --- | --- |
| Estimate terms v1.0 (deposit, payment due, payment methods, no tax line) | staging `/portal/terms/estimate-terms-1`; repository `packages/domain/src/legal.ts` (`ESTIMATE_TERMS`) |
| Retention schedule | node FACT-RETENTION-SCHEDULE; privacy policy section "How long we keep information" (staging `/privacy`) |
| Tables mapped to retention categories | [docs/data-inventory.md](../data-inventory.md) |
| Owner Dashboard and CSV exports (payments by method, outstanding balances) | staging staff app, Owner Dashboard (OWN-DEC-125) |

Staging access (link and tester sign-in) comes from the owner separately.

## 4. Questions

### C-01 Sales tax on the 26 services, in Kentucky and in Indiana
- **Question:** which HandyHub services, in Kentucky and in Indiana, are subject to sales tax; how must tax appear on estimates and invoices; and what registration, collection and filing are needed before the first taxable invoice?
- **Unblocks:** OQ-TAX-CPA, FACT-TAX-NO-LINE, OWN-DEC-83, OWN-DEC-128, OWN-DEC-03.
- **Current rule (FACT-TAX-NO-LINE):** "tax calculation disabled; estimates and invoices show no separate tax line and charge no tax automatically; the approved final price is shown clearly." The owner: "This is a software setting, not a determination that every service is tax-exempt. Any applicable tax treatment will be confirmed separately with the accountant." (OWN-DEC-83). An earlier interim answer (add 6% on Kentucky cleaning, shown separately; owner answer 2026-10-05T19:22) was replaced and is not in use.
- **Until answered:** tax stays disabled; nothing states or implies exemption; no rate is invented.
- **Launch gate:** NONE STATED (OQ-TAX-CPA is not among the go prerequisites of OQ-GO-DECISION). RISK: real invoices issued before your answer carry no tax line. RECOMMENDATION: answer before Phase 2 (invited customers).

### C-02 Deposits: when are they revenue?
- **Question:** how and when should deposits be recognized as revenue, and how should a deposit be shown when it is credited to the final invoice?
- **Unblocks:** OWN-DEC-189 item 10 ("Exclude deposits from revenue until they are appropriately recognized, and avoid double-counting payments"; "the recognition rule is the CPA's"), FACT-DEPOSIT-RULE, OWN-DEC-110, HH-FIN-20.
- **Current rule (FACT-DEPOSIT-RULE):** when the final approved total is over $1,000.00 the deposit is 20% of that total, rounded half-up to the cent; due before confirmed work scheduling and paid before materials are bought; credited once toward the final invoice; satisfied by a verified payment (a check only once cleared) or an owner-only waiver that never marks it paid or reduces the price.
- **Launch gate:** FEATURE (the job-margin view shows provisional margins as provisional until the rule is set).

### C-03 Retained cancellation amounts and refunds
- **Question:** how should a retained late-cancellation amount (from a deposit, or invoiced where permitted) and the refunded remainder be recorded?
- **Unblocks:** OWN-DEC-161 item 9 ("Provide a clear cancellation breakdown and maintain accurate refund, accounting, and audit records"), FACT-CANCELLATION-RULES, TSK-0140, TSK-0089.
- **Current decided rule (OWN-DEC-161, FACT-CANCELLATION-RULES):** a late cancellation of a confirmed work visit: the fee is capped at $50.00; a deposit under $50.00 is kept and the difference is never invoiced; a deposit of $50.00 or more keeps at most $50.00 and the rest is refunded; with no deposit the $50.00 is invoiced only where legally permitted and disclosed and accepted in advance. Enforcement waits for the attorney ([attorney.md](attorney.md) A-03). Refunds are owner-only.
- **Launch gate:** FEATURE (with the attorney's A-03).

### C-04 Job gross margin: definitions
- **Question:** are the margin formula and the direct-cost categories below sound for this business, how should "employee burden" be computed, and what belongs in overhead rather than direct job cost?
- **Unblocks:** OWN-DEC-189 item 15 ("Allow the CPA to review and refine accounting definitions and target margins later"), FACT-MARGIN-TARGET, HH-FIN-17, HH-FIN-20, TSK-0131.
- **Current decided rule (OWN-DEC-189):** "Calculate job gross margin as `(Net Job Revenue - Direct Job Costs) / Net Job Revenue × 100`." Direct costs: direct labor, employee burden where known, materials, subcontractors, equipment rentals, disposal and directly attributable job expenses. Net revenue accounts for approved discounts, change orders, credits and refunds. Overhead and business net profit stay separate. Labor cost needs a cost rate the owner enters per worker; until then labor cost and the margin show as incomplete, never zero. Target 30%, an advisory flag only: "The 30% threshold is a provisional business management target, not a guaranteed industry benchmark."
- **Launch gate:** NONE STATED (an internal management view).

### C-05 Retention periods: tax and accounting minimums
- **Question:** do the periods below meet the federal, Kentucky and Indiana tax, accounting and payroll record minimums? Which period applies to the kinds that have none yet?
- **Unblocks:** OQ-RETENTION-REVIEW, OWN-DEC-70, OWN-DEC-177, FACT-RETENTION-SCHEDULE, TSK-0138.
- **Current schedule (FACT-RETENTION-SCHEDULE, configurable; nothing is deleted automatically):** invoices, payments, receipts, refunds and reconciliation records 7 years after the relevant tax return is filed or the tax is paid, whichever is later; accepted estimates, work authorizations, contracts and change orders 10 years after final job closeout; customer and property profiles while active, then 7 years after the last completed service; unaccepted estimates 2 years after expiration or closure; requests that never become jobs 2 years after closure; audit records 7 years as a review threshold (OWN-DEC-164). Provisional (OWN-DEC-177): staff accounts 7 years after departure; consent records 5 years after the last relevant use; settings and content history (approved terms, pricing rules, templates) while retained records depend on them; technical logs 90 days.
- **Still NOT CONFIGURED (OWN-DEC-177):** action-queue items, technical records other than logs, the deletion-review entries, and the copies vendors keep (Bird, Resend, Cloudflare R2, Render backups).
- **Launch gate:** FEATURE: "Have the CPA and attorney confirm applicable record-retention periods before enabling irreversible production deletion." (OWN-DEC-177).

### C-06 Accounting checks before a record is deleted
- **Question:** which financial records and reconciliation obligations must be checked before any customer record is deleted, and which must never be deleted within their period?
- **Unblocks:** OWN-DEC-201 (I4), OWN-DEC-70, TSK-0152.
- **Current decided rule (OWN-DEC-201 I4):** "Before deleting a record, check relevant accounting systems for linked payments, deposits, invoices, refunds, and reconciliation obligations. Do not assume an unrecorded external payment exists. Escalate unresolved financial discrepancies for authorized review." Issued invoices, payments and signed approvals use Archive, Void or an audited correction, never ordinary deletion (OWN-DEC-70). Payments taken outside the software are recorded by hand, so the software cannot rule out an unrecorded one.
- **Launch gate:** FEATURE (with C-05).

### C-07 Subcontractor tax forms
- **Question:** which tax forms must be on file for a subcontractor before the first job (the owner named a W-9), which year-end information returns follow from paying them outside the app, and what records the business must keep for that?
- **Unblocks:** OQ-SUBCONTRACTOR-POLICY, OWN-DEC-188, OWN-DEC-186 ("subcontractor tax forms").
- **Current rule:** subcontractors are paid outside the software; the app records their sign-in, assigned jobs and per-worker Arrived and Finished times only, with no pay rates, payroll or subcontractor payments (OWN-DEC-188). When the owner wants subcontractor cost in job costing, it is entered as a direct job cost.
- **Launch gate:** NONE STATED. RECOMMENDATION: answer before the first subcontractor job. Worker classification is also asked of the attorney ([attorney.md](attorney.md) A-16).

### C-08 Mailing address on invoices
- **Question:** is a business address required on invoices or receipts for tax purposes?
- **Unblocks:** OWN-DEC-183, FACT-BUSINESS-ADDRESS.
- **Current rule:** the owner enters the address in Business settings; it is never in the repository; until entered documents omit the line (OWN-DEC-183).
- **Launch gate:** NONE STATED.

### C-09 PROPOSED (not in OWN-DEC-186): payment records kept by hand
- **Question:** are the fields recorded for each payment enough for bookkeeping and reconciliation of every method the business accepts?
- **Unblocks:** FACT-PAYMENT-METHODS, OWN-DEC-111, OWN-DEC-138.
- **Current rule (FACT-PAYMENT-METHODS):** methods: card through a Square payment link created in the Square app, in-person card or digital wallet with Square Tap to Pay, cash, check, Zelle, Cash App and Chime. No Square integration; authorized staff record every payment by hand (invoice, method, amount in cents, date, collector, transaction reference). Checks stay pending until cleared and only the owner marks a check cleared, never one they collected. No surcharge. Payment details for Zelle, Cash App, Chime and the check payee are placeholders (FACT-PAYMENT-INSTRUCTIONS).
- **Launch gate:** NONE STATED.

### C-10 PROPOSED (not in OWN-DEC-186): the name on invoices
- **Question:** for tax reporting, should invoices and receipts print the legal entity name ODD JOBS & MORE LLC rather than "Handyhub LLC"? The legal side is the attorney's ([attorney.md](attorney.md) A-06).
- **Unblocks:** OQ-LEGAL-ENTITY-NAME, FACT-BUSINESS-NAME.
- **Launch gate:** NONE STATED.

## 5. Sign-off
| Item | Approved as written / Changed / Not my area | Reviewer | Date |
| --- | --- | --- | --- |
| C-01 Sales tax, Kentucky | | | |
| C-01 Sales tax, Indiana | | | |
| C-01 Tax display on estimates and invoices | | | |
| C-02 Deposit revenue recognition | | | |
| C-03 Retained cancellation amounts and refunds | | | |
| C-04 Margin formula and cost categories | | | |
| C-05 Retention periods (tax, accounting, payroll) | | | |
| C-05 Periods for the unscheduled kinds | | | |
| C-06 Checks before deletion | | | |
| C-07 Subcontractor tax forms | | | |
| C-08 Address on invoices | | | |
| C-09 Payment record fields | | | |
| C-10 Name on invoices | | | |

## 6. What is NOT claimed
- No tax treatment is claimed: no service is described as taxable or exempt, no rate is used, and no document states or implies exemption (FACT-TAX-NO-LINE).
- The 30% margin target is a provisional management target, not a benchmark (OWN-DEC-189).
- No payroll, pay rate or worker classification is decided by the software (OWN-DEC-188, OWN-DEC-05).
- No license, registration, insurance or warranty beyond the decided 90-day workmanship warranty (wording pending the attorney) is claimed.

## 7. Launch gates of this packet
| Gate | Items |
| --- | --- |
| PRODUCTION | none stated in the graph |
| FEATURE | C-02 (final margins), C-03 (late-cancellation accounting, with the attorney), C-05 and C-06 (irreversible deletion) |
| NONE STATED | C-01 (RISK and RECOMMENDATION above), C-04, C-07, C-08, C-09, C-10 |
