---
title: "Service agreement - Elite Deep Cleaning Service (CL-02)"
service_id: CL-02
service_slug: deep-cleaning
canonical_name: "Elite Deep Cleaning Service"
category: "Cleaning"
doc_type: contract
status: template-draft
authority: supporting
owner_approved: false
human_review:
  - "attorney licensed in KY/IN"
  - "owner"
  - "insurance broker"
  - "EPA RRP-certified renovator (paint chipping)"
  - "CPA (deposit treatment)"
  - "qualified safety professional (ladder and height clause)"
registry: "AI Development Plans/04-service-registry.md#CL-02"
last_reviewed: 2026-10-03
---

# 📜 Service Agreement: Deep Cleaning

> [!warning] Draft — not owner-approved
> Canonical service: **CL-02 — Elite Deep Cleaning Service** · [Registry entry](../AI%20Development%20Plans/04-service-registry.md#CL-02)
> Draft, attorney review required, not for signature. DRAFT TEMPLATE — NOT LEGAL ADVICE. Must be reviewed and adapted by an attorney licensed in Kentucky and/or Indiana before any use. Placeholders such as [Your Company Name] must be replaced with the registered legal entity name (not yet confirmed). The review notes at the end are not part of the agreement text. See [30 Service agreement standards](../AI%20Development%20Plans/30-service-agreement-standards.md).
> Review notes for this file: see "Review notes and cross-references" at the end.


This Service Agreement is executed between **[Your Cleaning Company Name]** ("Company") and **[Client Full Name]** ("Client") for a specialized, rigorous deep cleaning session.

## 1. Scope of Deep Cleaning
* **Inclusions:** Comprehensive interior cleaning as detailed in the `deep-cleaning.md` micro-checklist.
* **Add-ons Approved:** Includes interior oven [ ] / interior fridge [ ] / interior empty cabinets [ ] as checked.
* **Structural Limitations:** Cleaners will not wipe surfaces higher than a 12-foot extendable ladder or perform specialized structural restoration.

## 2. Pricing & Payment Structure
* **Pricing Model:** **[Flat Rate of \([Amount] / Hourly Rate of\)[Amount] per cleaner hour]**.
* **Initial Deposit:** A non-refundable deposit of **25%** is required to secure the deep cleaning calendar slot.
* **Final Payment:** The remaining balance must be paid immediately upon final walkthrough inspection on the day of service.

## 3. Pre-Service Environment Conditions
* **Clutter Clear:** Client agrees to clear major toys, clothes, and excessive clutter from floors and counters before the crew arrives. If the environment is heavily cluttered, an additional **\$30 Clutter Fee** will be added.
* **Water & Utilities:** The property must have running water, operational electricity, and functional HVAC systems. Failure to provide utilities will cancel the job, and the deposit will be forfeited.

## 4. Breakage & Satisfaction Guarantees
* **24-Hour Guarantee:** If any micro-detail from the checklist is missed, Client must report it within 24 hours. The Company will send a supervisor to rectify the specific area at no additional cost. No cash refunds will be processed.
* **Pre-existing Damage:** Company is not liable for structural wear-and-tear, old grout staining, or paint chipping that occurs during normal scrubbing protocols.

**Client Signature:** _______________________  **Date:** _______________
**Company Signature:** ______________________  **Date:** _______________

---

## Review notes and cross-references (added 2026-10-03)

*Added during the AI orchestrator repository audit. Not part of the original content and not part of the agreement text; the agreement text above is unchanged.*

**Related files:** [Registry entry](../AI%20Development%20Plans/04-service-registry.md#CL-02) · [Pricing](../Pricing/pricing-deep-cleaning.md) · [Inventory](../Required%20inventory/inventory-deep-cleaning.md) · [SOP](../Standard%20Of%20Operations/sop%20Deep%20Cleaning%20CheckList.md) · [Requirements spec (service card CL-02)](../Requierments/HandyHub_Requirements_Specification_Reconstructed.md) · [Main plan](../Main%20Plans/Cleaning%20Business.md) · [Gap analysis](../AI%20Development%20Plans/02-gap-analysis.md)

### Clause checklist (per 30 Service agreement standards)

*Statuses copy the CL-02 column of [30 Service agreement standards](../AI%20Development%20Plans/30-service-agreement-standards.md) section 4.2 (1 present, 3 partial, 8 present with conflicts, 12 missing, 1 not applicable). The checklist describes what an attorney must decide; it is not clause wording.*

| # | Clause (30 section 4.1) | Status in this template | Note (IDs) |
|---|---|---|---|
| 1 | Parties and legal entity | partial | "[Your Cleaning Company Name]" and "[Client Full Name]" placeholders (orig. L4); registered entity not confirmed (Q-30-02); signer authority not stated (Q-30-20) |
| 2 | Property, date and estimate-version identification | missing | No service address, scheduled date or accepted estimate version (X-01) |
| 3 | Scope reference | present - conflicts (C-CL02-07, C-CL02-01, X-03) | "Inclusions" (orig. L7) incorporates a `deep-cleaning.md` "micro-checklist" that does not exist (C-CL02-07), defining scope by an internal file name (X-03). "Add-ons Approved" (orig. L8) offers oven and fridge interiors as checkboxes although the SOP and the main plan include them (C-CL02-01), and has no box for the pricing file's wall-washing and blinds add-ons (C-CL02-10) |
| 4 | Exclusions | present - conflicts (C-CL02-05) | "Structural Limitations" (orig. L9) excludes work above a ladder limit and "specialized structural restoration", but implies ladder work that the inventory and SOP do not support (C-CL02-05); the SOP's Do-not-perform items (appliance connections, mold growth, duct interiors) are not stated (04 CL-02 "exclusions") |
| 5 | Customer responsibilities and preparation | present | "Clutter Clear" and "Water & Utilities" (orig. L17-L18). Not covered: refrigerator contents, fragile items, permission and limits for moving furniture and appliances, surface sensitivities, pets and occupants (04 CL-02 "customer preparation requirements"; X-11). The fee, cancellation and forfeiture consequences inside these clauses are rows 13, 11 and 14 |
| 6 | Access (incl. no-access charges) | missing | No access method, site contact or no-access rule |
| 7 | Concealed and pre-existing conditions | present - conflicts (C-CL02-06, X-02, X-15) | "Pre-existing Damage" (orig. L22) covers paint chipping "that occurs during normal scrubbing protocols", which is damage during service, not a pre-existing condition (C-CL02-06); it relies on prior-condition evidence that the SOP did not collect before this edit pass (SOP section 16 now proposes it; X-02); no stop, document, notify and change-order path (X-15) |
| 8 | Hazardous-material discovery and stop-work | missing | No customer-facing stop-work notice, although chemical exposure is a card hazard and the SOP now holds work for suspected mold growth, chipping paint and textured ceilings of unknown composition (spec CL-02.HAZ; SOP section 10) |
| 9 | Change orders | missing | No change-order term; add-ons not checked at acceptance need one (spec FIN-008, EST-005) |
| 10 | Schedule, weather and delays | missing | - |
| 11 | Cancellation and reschedule | present - conflicts (C-CL02-02) | "Water & Utilities" (orig. L18) cancels the job and forfeits the deposit when utilities are missing; no customer cancellation or reschedule terms (Q-30-10) |
| 12 | Term and termination (recurring or master relationships only) | n/a | One-time service |
| 13 | Price, minimum and tax reference | present - conflicts (C-CL02-10) | "Pricing Model" (orig. L12) is a malformed flat-or-hourly placeholder; the "Clutter Fee" in "Clutter Clear" (orig. L17) is priced only in the CL-01 pricing file (C-CL02-10); no minimum disclosure (CX-001) or tax reference. Pricing-side IDs (30 section 7): C-CL02-13, C-CL02-11 |
| 14 | Deposits and prepayment | present - conflicts (C-CL02-02, X-04) | "Initial Deposit" (orig. L13) applies to every deep clean, while spec FIN-002 says "The system must not assume every job requires a deposit."; the owner has not set deposit terms (Q-30-08) |
| 15 | Payment terms and methods | partial | "Final Payment" (orig. L14) falls due at the final walkthrough; no accepted methods (electronic invoice, cash, check per owner facts 2026-10-02); a received check is not cleared money |
| 16 | Late payment | missing | - |
| 17 | Warranty and callback | present - conflicts (X-16) | "24-Hour Guarantee" under "Breakage & Satisfaction Guarantees" (orig. L20-L21): unapproved callback promise with no SOP procedure; no decision staffs the "supervisor"; its refund restriction needs a refund and credit policy (Q-30-22); the heading names a breakage clause that does not exist (Q-30-07) |
| 18 | Limitation of liability, waivers, releases | present - conflicts (C-CL02-06, X-02) | "Pre-existing Damage" (orig. L22) limits liability for damage caused by the work; the spec requires surface testing; older-coating (lead) question (Q-30-11; Q-30-18) |
| 19 | Insurance and credential statements | missing | None present; none may be added without a supporting compliance record (Q-30-12) |
| 20 | Photo and marketing consent separation | missing | Existing-condition and after photos are proposed in the SOP; no consent wording (spec REC-003) |
| 21 | Privacy | missing | - |
| 22 | Dispute resolution | missing | - |
| 23 | Governing law (KY vs IN) | missing | Decided per property state by the attorney (Q-30-05) |
| 24 | Signatures and e-acceptance | partial | Blank signature and date lines (orig. L24-L25); no printed name, title, signer authority or e-acceptance (Q-30-06) |
| 25 | Bilingual version precedence | missing | No Spanish version (Q-30-13) |

### Clauses requiring attorney review

*Rows 4, 40, 58, 63, 64 and 90 of the 30 section 5 risky-clause register. Quoted to flag them, not to adopt them; disposition (keep, revise or remove) is an attorney and owner decision. Amounts and percentages are not restated here; they stand in the clause text above.*

| Quote (short) | Location | Concern | IDs | Reviewer |
|---|---|---|---|---|
| "If any micro-detail from the checklist is missed, Client must report it within 24 hours. The Company will send a supervisor to rectify the specific area at no additional cost. No cash refunds will be processed." | "24-Hour Guarantee" under the section 4 heading "Breakage & Satisfaction Guarantees", orig. L20-L21 (30 section 5 row 4) | Guarantee, claim window and refund restriction: unapproved callback promise with no SOP procedure; no decision staffs a "supervisor"; refunds need human review; the heading promises a breakage clause that does not exist | X-16 | Attorney licensed in KY/IN; owner; customer service and quality assistant (callback handling) |
| "Company is not liable for structural wear-and-tear, old grout staining, or paint chipping that occurs during normal scrubbing protocols." | "Pre-existing Damage", orig. L22 (row 40) | Limitation covering damage caused by the work; labelled "pre-existing"; the spec requires surface testing; possible older-coating (lead) question | C-CL02-06 | Attorney licensed in KY/IN; EPA RRP-certified renovator |
| "If the environment is heavily cluttered, an additional ... Clutter Fee will be added." | "Clutter Clear", orig. L17 (row 58) | Surcharge priced only in the CL-01 pricing file; "heavily cluttered" undefined; no approval step | C-CL02-10 | Owner |
| "A non-refundable deposit of ... is required to secure the deep cleaning calendar slot." | "Initial Deposit", orig. L13 (row 63) | Applies to every deep clean, including small apartments; FIN-002 forbids assuming every job needs a deposit; the owner has not set deposit terms | C-CL02-02 (critical), X-04 | Owner; attorney licensed in KY/IN; CPA |
| "Failure to provide utilities will cancel the job, and the deposit will be forfeited." | "Water & Utilities", orig. L18 (row 64) | Forfeiture trigger set without an owner policy | C-CL02-02 (critical) | Attorney licensed in KY/IN; owner |
| "Cleaners will not wipe surfaces higher than a 12-foot extendable ladder or perform specialized structural restoration." | "Structural Limitations", orig. L9 (row 90) | Implied scope (height work): implies ladder work that the inventory and SOP do not support | C-CL02-05 | Qualified safety professional; owner |

### Jurisdiction questions for the attorney (Kentucky and Indiana separately)

*Questions from 30 section 8, not conclusions; each is answered for Kentucky and for Indiana, and per municipality where it matters.*

- Row 5: are non-refundable or forfeitable deposits enforceable, and how must deposits be handled and disclosed ("Initial Deposit", orig. L13; "Water & Utilities", orig. L18)? (Attorney; CPA.)
- Row 9: which implied warranties apply to home services, can they be limited, and do written-warranty disclosure rules apply if a callback promise such as the "24-Hour Guarantee" (orig. L21) is kept? (Attorney.)
- Row 10: is the "Pre-existing Damage" limitation (orig. L22) enforceable in a consumer service contract, and how does it interact with the insurance actually held? (Attorney; insurance broker.)
- Row 12: which lead-safe work information and acknowledgements apply if CL-02 work can disturb painted surfaces in older homes (the paint-chipping wording at orig. L22), and do they belong in the agreement or a separate record? (EPA RRP-certified renovator; attorney.)

### Placeholders to resolve

- [Your Cleaning Company Name] (orig. L4) -> registered legal entity name, from the company profile setting (not confirmed; Q-30-02; HUMAN REVIEW: attorney, CPA).
- [Client Full Name] (orig. L4) -> customer record plus signer authority (AUTH-028); who may sign is an attorney decision (Q-30-20).
- Malformed pricing-model placeholder (orig. L12): `**[Flat Rate of \([Amount] / Hourly Rate of\)[Amount] per cleaner hour]**`, a wrapper around two amount fields -> the accepted estimate version (owner and estimator); no amount or pricing method is set in this file.
- The three add-on checkboxes `[ ]` in "Add-ons Approved" (orig. L8) -> the options selected on the accepted estimate (spec EST-005); estimator.
- Signature and date lines (orig. L24-L25) -> acceptance record (AUTH-027); HUMAN REVIEW: attorney.
- Fields with no placeholder at all (the AGR-004 identification block): service address and state, estimate number and version, scheduled date or window, printed names, titles and signer authority, document language, template version (X-01).

### Flags for controlled cleanup (not edited)

- Reference to a file that does not exist: `deep-cleaning.md` "micro-checklist" (orig. L7). By its title the intended target is the SOP `Standard Of Operations/sop Deep Cleaning CheckList.md` ("Deep Cleaning Micro-Checklist"), an unapproved, unversioned draft. Which SOP version, if any, the agreement incorporates is an attorney decision (C-CL02-07; X-03; AGR-003). No link is added inside clause text.
- Escape artifacts (`\(` and `\)`) inside the malformed pricing-model placeholder (orig. L12); corrected only in a logged cleanup with the attorney.
- The heading "4. Breakage & Satisfaction Guarantees" (orig. L20) names a breakage clause that does not exist beneath it (30 section 5 row 4).
- Label mismatch: "Pre-existing Damage" (orig. L22) also covers damage that "occurs during normal scrubbing protocols" (C-CL02-06).
- None found in this file: AI citation residue, probable typos inside clauses, square-metre options.

### Issues affecting this file

| ID | Severity | Issue (short) | Reviewer / owner |
|---|---|---|---|
| C-CL02-02 | critical | A deposit with forfeiture on every deep clean ("Initial Deposit", "Water & Utilities") conflicts with the configurable large-job deposit policy, which the owner has not set | Owner; attorney licensed in KY/IN |
| C-CL02-01 | high | Oven/fridge interiors (main plan and SOP), wall washing (main plan) and blinds (SOP) are presented as included but sold as paid add-ons ("Add-ons Approved") | Owner (scope and price decision); attorney licensed in KY/IN (customer-facing terms) |
| C-CL02-05 | high | The contract contemplates ladder work ("Structural Limitations"), but the inventory has no ladder and the SOP has no ladder controls | Qualified safety professional; owner |
| C-CL02-06 | high | The contract disclaims liability for paint chipping caused by "normal scrubbing", under a "Pre-existing Damage" label; the spec requires surface testing and no damage | Attorney licensed in KY/IN; EPA RRP-certified renovator |
| C-CL02-07 | high | Agreement scope incorporates a nonexistent checklist file | Attorney licensed in KY/IN |
| C-CL02-10 | medium | Contract and pricing disagree on pricing method, add-on list and fees | Owner; attorney licensed in KY/IN |
| X-01 | high | No agreement identifies the property, service date or accepted estimate version | Attorney licensed in KY/IN |
| X-02 | high | Pre-existing-condition clauses in at least 13 contracts depend on proof that only one SOP (CL-05) collects | Attorney licensed in KY/IN |
| X-03 | high | Contract scope is defined by reference to unapproved, editable internal files | Attorney licensed in KY/IN |
| X-04 | medium | Deposit terms are keyed to service type, not job size, contrary to the large-jobs-only principle | Owner; attorney licensed in KY/IN; CPA |
| X-11 | high | No SOP or contract protects occupants, children or pets from active work hazards | Qualified safety professional |
| X-15 | medium | Concealed-condition handling is written eight ways across 11 contracts | Attorney licensed in KY/IN |
| X-16 | medium | A customer who buys two services signs inconsistent terms (here: the callback reporting window) | Attorney licensed in KY/IN |

### Open questions

- Q-30-07 (owner; attorney; quality assistant): what warranty and callback policy applies to CL-02, if any? Until it is decided, the "24-Hour Guarantee" is not an approved commitment.
- Q-30-08 (owner; attorney, CPA): deposit policy - threshold, amount, timing, refundability, forfeiture triggers and approval authority (the same decision as Q-28-09).
- Q-30-22 (owner; attorney, CPA): refund and credit policy, including what replaces "No cash refunds will be processed".
- Q-30-02 (owner; attorney, CPA): which registered legal entity replaces "[Your Cleaning Company Name]"?
- Q-30-10 (owner; attorney): cancellation, rescheduling and no-access policy, including what happens when utilities are missing on arrival.
- Q-30-11 (attorney; insurance broker): should any limitation of liability be used, and how does it interact with the insurance actually held?
- Q-30-18 (owner; EPA RRP-certified renovator; attorney): where is lead-safe work information acknowledged, if CL-02 work can disturb older painted surfaces?
- Q-28-21 (owner): are oven and fridge interiors, wall washing and blinds included or add-ons? The answer sets the "Add-ons Approved" options.
- Q-31-09 (owner; qualified safety professional): the height and access policy that the ladder wording in "Structural Limitations" assumes.

### Revision history

| Date | Change | Author |
|---|---|---|
| 2026-10-03 | Added frontmatter, status callout and review notes (clause checklist, attorney-review list, jurisdiction questions, placeholders, cleanup flags) (R1, R2, R7, R3); clause text, numbering, amounts and signature lines unchanged | AI orchestrator (Claude) |
