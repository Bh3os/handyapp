---
title: "Service agreement - Move-In & Move-Out Cleaning (CL-03)"
service_id: CL-03
service_slug: move-in-out
canonical_name: "Move-In & Move-Out Cleaning"
category: "Cleaning"
doc_type: contract
status: template-draft
authority: supporting
owner_approved: false
human_review:
  - "attorney licensed in KY/IN"
  - "owner"
  - "insurance broker"
registry: "AI Development Plans/04-service-registry.md#CL-03"
last_reviewed: 2026-10-03
---

# 📜 Service Agreement: Move-In / Move-Out Cleaning

> [!warning] Draft — not owner-approved
> Canonical service: **CL-03 — Move-In & Move-Out Cleaning** · [Registry entry](../AI%20Development%20Plans/04-service-registry.md#CL-03)
> Draft, attorney review required, not for signature. DRAFT TEMPLATE — NOT LEGAL ADVICE. Must be reviewed and adapted by an attorney licensed in Kentucky and/or Indiana before any use. Placeholders such as [Your Company Name] must be replaced with the registered legal entity name (not yet confirmed). The review notes at the end are not part of the agreement text. See [30 Service agreement standards](../AI%20Development%20Plans/30-service-agreement-standards.md).
> Legacy artifacts: the per-square-metre option in this file ("Sq. M" in the "Final Pricing" placeholder) is a non-authoritative brainstorm remnant (canonical currency USD, launch market KY/IN, languages EN/ES). It is kept unchanged pending an owner decision on cleanup.
> Review notes for this file: see "Review notes and cross-references" at the end.


This Agreement governs the relationship between **[Your Cleaning Company Name]** ("Company") and **[Client Full Name]** ("Client") for vacant property turnover cleaning.

## 1. Absolute Vacancy Requirement
* **Condition of Property:** Client warrants that the property will be **100% vacant of furniture, personal items, and heavy trash bags** before the cleaning team arrives.
* **Trash Surcharge:** If heavy trash, discarded boxes, or furniture remnants are left behind for the Company to discard, a **25% Surcharge** will be added to the final bill to cover heavy disposal fees.

## 2. Inclusions & Inspection Standard
* **Turnover Standard:** Service covers absolute deep cleaning of bare floors, baseboards, interior window tracks, and empty cabinets as outlined in `move-in-move-out.md`.
* **Deposit Sign-off:** The Company cleans to professional leasing standards but does not guarantee the return of a security deposit, which is subject entirely to the landlord's subjective discretion.

## 3. Scheduling & Penalties
* **Final Pricing:** Based on the cleanable square footage of **[Insert Sq. Ft / Sq. M]** totaling **\$[Amount]**.
* **Utility Fine:** If electricity or running water is disconnected during service execution, a **\$50 Utility Surcharge** will apply due to specialized equipment operational constraints.
* **Access Delays:** If the team is delayed entry by movers or contractors present on-site, a waiting fee of **\$45 per hour** will be billed.

**Client Signature:** _______________________  **Date:** _______________
**Company Signature:** ______________________  **Date:** _______________

---

## Review notes and cross-references (added 2026-10-03)

*Added during the AI orchestrator repository audit. Not part of the original content and not part of the agreement text; the agreement text above is unchanged.*

**Related files:** [Registry entry](../AI%20Development%20Plans/04-service-registry.md#CL-03) · [Pricing](../Pricing/pricing-move-in-out.md) · [Inventory](../Required%20inventory/inventory-move-in-move-out.md) · [SOP](../Standard%20Of%20Operations/sop%20Move-In%20and%20Move-Out%20Cleaning%20Checklist.md) · [Requirements spec (service card CL-03)](../Requierments/HandyHub_Requirements_Specification_Reconstructed.md) · [Main plan](../Main%20Plans/Cleaning%20Business.md) · [Gap analysis](../AI%20Development%20Plans/02-gap-analysis.md)

### Clause checklist (per 30 Service agreement standards)

*Statuses copy the CL-03 column of [30 Service agreement standards](../AI%20Development%20Plans/30-service-agreement-standards.md) section 4.2 (0 present, 3 partial, 5 present with conflicts, 16 missing, 1 not applicable). The checklist describes what an attorney must decide; it is not clause wording.*

| # | Clause (30 section 4.1) | Status in this template | Note (IDs) |
|---|---|---|---|
| 1 | Parties and legal entity | partial | "[Your Cleaning Company Name]" and "[Client Full Name]" placeholders (orig. L4); registered entity not confirmed (Q-30-02). The client may be a tenant, a landlord or a property manager, and who may order, pay, authorize disposal and sign is undecided (Q-30-20; 04 CL-03 "prerequisites") |
| 2 | Property, date and estimate-version identification | missing | No service address, scheduled date or accepted estimate version (X-01) |
| 3 | Scope reference | present - conflicts (C-CL03-04, C-CL03-08, X-03) | "Turnover Standard" (orig. L11): scope is incorporated by the file name `move-in-move-out.md`, which does not exist (C-CL03-08; X-03); "baseboards" are promised but no SOP step washes them (C-CL03-04); "absolute deep cleaning" is undefined (30 section 5 row 15) |
| 4 | Exclusions | missing | No exclusions. Candidates for owner decision: occupied homes, exterior and garage, wall washing, carpet shampooing, appliance moving, biohazard and pests, junk removal, floor stripping, drain clearing (04 CL-03 "exclusions"). Exterior glass is sold in the pricing file but is outside this scope (C-CL03-05) |
| 5 | Customer responsibilities and preparation | present - conflicts (C-CL03-01) | "Condition of Property" (orig. L7) is a customer warranty of vacancy tied to the automatic "Trash Surcharge" (orig. L8) (30 section 5 rows 17 and 47). No item for utilities, access, the refrigerator and freezer end state or the landlord checklist (04 CL-03 "customer preparation requirements"); no item for occupants, children or pets (X-11) |
| 6 | Access (incl. no-access charges) | present - conflicts (C-CL03-10) | "Access Delays" (orig. L17) charges a waiting fee that the pricing file does not contain (C-CL03-10). No access method, lockbox handling or site contact; codes are never printed (COM-002). Policy undecided (Q-30-10) |
| 7 | Concealed and pre-existing conditions | missing | No stop, document, notify and change-order path. Pre-existing damage must be separated from the cleaning result (spec CL-03.QAC); the SOP collected no existing-condition photos before this edit pass (holds now proposed) |
| 8 | Hazardous-material discovery and stop-work | missing | No customer-facing stop-work notice, although unknown debris and sharps, chemicals and unsecured property are card hazards (spec CL-03.HAZ) and biohazard, pests or unsafe utilities stop the work (04 CL-03 "hazards") |
| 9 | Change orders | present - conflicts (C-CL03-01) | "Trash Surcharge" (orig. L8) adds a charge for disposal decided on arrival, without a change order the customer approves before the extra work (spec FIN-008; 28 D-28-08); the pricing file gives a range instead of this clause's fixed percentage |
| 10 | Schedule, weather and delays | missing | Delays caused by movers or contractors appear only as a fee ("Access Delays", orig. L17; row 6) |
| 11 | Cancellation and reschedule | missing | Cancellation and no-access policy undecided (Q-30-10) |
| 12 | Term and termination (recurring or master relationships only) | n/a | One-time service |
| 13 | Price, minimum and tax reference | present - conflicts (C-CL03-01, C-CL03-09, C-CL03-10, C-CL03-12) | "Final Pricing" (orig. L15) prices by "cleanable square footage" only, with no measurement method, while the pricing file also sells flat packages (C-CL03-10); the area placeholder offers square metres (C-CL03-12); "Trash Surcharge" and "Utility Fine" (orig. L8, L16) differ from the pricing file (C-CL03-01, C-CL03-09). No minimum disclosure (CX-001) and no tax reference |
| 14 | Deposits and prepayment | missing | Deposit policy undecided (Q-30-08) |
| 15 | Payment terms and methods | missing | No due date or accepted methods (electronic invoice, cash and check per owner facts 2026-10-02) |
| 16 | Late payment | missing | - |
| 17 | Warranty and callback | partial | "Deposit Sign-off" (orig. L12) disclaims the security-deposit outcome, which fits the no-guarantee rule (30 section 5 row 10), but "professional leasing standards" is undefined and the main plan promises the opposite (C-CL03-03). No re-clean or callback policy (Q-30-07) |
| 18 | Limitation of liability, waivers, releases | missing | No limitation clause; the "Deposit Sign-off" disclaimer is listed in 30 section 5 (row 10) (Q-30-11) |
| 19 | Insurance and credential statements | missing | None present; none may be added without a supporting compliance record (Q-30-12) |
| 20 | Photo and marketing consent separation | missing | Existing-condition and after photos are proposed in the SOP; no consent wording (REC-003) |
| 21 | Privacy | missing | No privacy-notice link; access codes are never printed (COM-002) |
| 22 | Dispute resolution | missing | Tenant, landlord and deposit disputes are foreseeable; the mechanism is an attorney decision (Q-30-05) |
| 23 | Governing law (KY vs IN) | missing | Decided per property state by the attorney (Q-30-05) |
| 24 | Signatures and e-acceptance | partial | Blank signature and date lines (orig. L19-L20); no printed name, title, signer authority or e-acceptance (Q-30-06) |
| 25 | Bilingual version precedence | missing | No Spanish version (Q-30-13) |

### Clauses requiring attorney review

*Rows 10, 15, 17, 46, 47 and 48 of the 30 section 5 risky-clause register. Quoted to flag them, not to adopt them; amounts and percentages are elided ("...") because the clause text above is unchanged. Disposition (keep, revise or remove) is an attorney and owner decision.*

| Quote (short) | Location | Concern | IDs | Reviewer |
|---|---|---|---|---|
| "The Company cleans to professional leasing standards but does not guarantee the return of a security deposit, which is subject entirely to the landlord's subjective discretion." | "Deposit Sign-off", orig. L12 (30 section 5 row 10) | Disclaimer of an outcome guarantee: consistent with the no-guarantee rule, but "professional leasing standards" is undefined, and the main plan promises the opposite (32 register B row 1) | C-CL03-03 | Attorney licensed in KY/IN (keep or revise); marketing copy through 32 |
| "Service covers absolute deep cleaning of bare floors, baseboards, interior window tracks, and empty cabinets as outlined in `move-in-move-out.md`." | "Turnover Standard", orig. L11 (30 section 5 row 15) | Absolute standard: "absolute" is undefined; baseboards are not in the SOP; the referenced file does not exist | C-CL03-04, C-CL03-08 | Attorney licensed in KY/IN |
| "## 1. Absolute Vacancy Requirement" / "Client warrants that the property will be ... vacant of furniture, personal items, and heavy trash bags before the cleaning team arrives." | Section 1 heading and "Condition of Property", orig. L6-L7 (30 section 5 row 17) | Customer warranty of complete vacancy; tied to the automatic trash surcharge (row 47) and to disposal of third-party property | C-CL03-01 (critical) | Attorney licensed in KY/IN; owner |
| "## 3. Scheduling & Penalties" / "Utility Fine: If electricity or running water is disconnected during service execution, a ... Utility Surcharge will apply due to specialized equipment operational constraints." | Section 3 heading and "Utility Fine", orig. L14, L16 (30 section 5 row 46) | Penalty and fine labels; the trigger differs from pricing ("electricity or hot water is turned off") | C-CL03-09 | Owner; attorney licensed in KY/IN |
| "Trash Surcharge: If heavy trash, discarded boxes, or furniture remnants are left behind for the Company to discard, a ... Surcharge will be added to the final bill to cover heavy disposal fees." | "Trash Surcharge", orig. L8 (30 section 5 row 47) | Automatic surcharge: pricing allows a percentage range at arrival; applied without a change order; disposal of third-party property | C-CL03-01 (critical) | Owner; attorney licensed in KY/IN |
| "If the team is delayed entry by movers or contractors present on-site, a waiting fee of ... per hour will be billed." | "Access Delays", orig. L17 (30 section 5 row 48) | Waiting fee that exists only in the agreement | C-CL03-10 | Owner; attorney licensed in KY/IN |

### Jurisdiction questions for the attorney (Kentucky and Indiana separately)

*Questions from 30 section 8, not conclusions; each is answered for Kentucky and for Indiana, and per municipality where it matters.*

- Row 6: are fixed charges for customer default, such as the "Trash Surcharge" (orig. L8), "Utility Fine" (orig. L16) and "Access Delays" waiting fee (orig. L17), permitted, and how must they be disclosed? (Attorney; owner.)
- Row 9: which implied warranties apply to home services, and can the "Deposit Sign-off" disclaimer (orig. L12) limit them? (Attorney.)
- Row 21: how must property that may belong to a tenant or others be handled and disposed of, as the "Trash Surcharge" clause (orig. L8) contemplates? (Attorney.)
- Row 26: do each state's rules on unfair or deceptive practices reach outcome statements in a signed agreement, such as "absolute deep cleaning" (orig. L11) and "professional leasing standards" (orig. L12), and what substantiation must be on file? (Attorney.)

### Placeholders to resolve

- `[Your Cleaning Company Name]` (orig. L4) -> registered legal entity name, from the company profile setting (not confirmed; Q-30-02; HUMAN REVIEW: attorney, CPA).
- `[Client Full Name]` (orig. L4) -> customer record plus signer authority (27 AUTH-028); for move-outs the tenant, landlord and property manager may differ, and who may sign is an attorney decision (Q-30-20).
- `[Insert Sq. Ft / Sq. M]` (orig. L15) -> estimate quantities in square feet with a recorded measurement method; the metric option is a legacy artifact (C-CL03-12).
- `[Amount]` in "Final Pricing" (orig. L15, written with an escaped dollar sign) -> the accepted estimate version (owner and estimator); no amount is set in this file.
- Signature and date lines (orig. L19-L20) -> acceptance record (27 AUTH-027); HUMAN REVIEW: attorney.
- Fields with no placeholder at all (the AGR-004 identification block): service address and state, estimate number and version, scheduled date or window, access method and site contact, who authorizes entry, payment and disposal, printed names, titles and signer authority, document language, template version (X-01).

### Flags for controlled cleanup (not edited)

- Scope incorporates `move-in-move-out.md` (orig. L11), a file that does not exist (C-CL03-08). The only plausible target is the unapproved draft SOP `sop Move-In and Move-Out Cleaning Checklist.md` (planned name `sop-move-in-out.md`, 34 step 2.7); renames do not change this clause (34 section 4.5). The reference is replaced only through the agreement architecture change (AGR-003; X-03), and no link is added inside clause text. OPEN QUESTION (attorney): which SOP version, if any, should the agreement incorporate?
- Square-metre option in `[Insert Sq. Ft / Sq. M]` (orig. L15) (C-CL03-12).
- Penalty and fine framing: the heading "Scheduling & Penalties" (orig. L14) and the label "Utility Fine" (orig. L16) (X-16; the application uses "fee", 28 section 3.7).
- "Absolute" wording: the heading "Absolute Vacancy Requirement" (orig. L6) and "absolute deep cleaning" (orig. L11) (30 section 5 rows 15 and 17).
- None found in this file: AI citation residue, probable typos inside clauses.

### Issues affecting this file

| ID | Severity | Issue (short) | Reviewer / owner |
|---|---|---|---|
| C-CL03-01 | critical | Leftover-items surcharge is a range in pricing but a fixed percentage in the contract, and is applied without a change order ("Trash Surcharge", orig. L8) | Owner; attorney licensed in KY/IN |
| C-CL03-04 | high | The agreement and main plan promise baseboard washing that the SOP does not include ("Turnover Standard", orig. L11) | Owner (scope decision); attorney licensed in KY/IN if the agreement is revised instead |
| C-CL03-05 | high | An exterior-window add-on is priced, but no procedure, equipment or height control exists (this agreement covers interior window tracks only) | Owner; qualified safety professional |
| C-CL03-08 | high | The agreement's scope incorporates a nonexistent checklist file (`move-in-move-out.md`, orig. L11) | Owner; attorney licensed in KY/IN |
| C-CL03-03 | medium | The main plan claims "absolute top-to-bottom sterilization" and frames the service around a deposit outcome this agreement disclaims ("Deposit Sign-off", orig. L12) | Owner; attorney licensed in KY/IN |
| C-CL03-09 | medium | Utility surcharge triggers differ between pricing and agreement ("Utility Fine", orig. L16) | Owner; attorney licensed in KY/IN |
| C-CL03-10 | medium | The agreement's waiting fee and square-foot-only pricing basis are not reflected in the pricing guide ("Access Delays" and "Final Pricing", orig. L15, L17) | Owner; attorney licensed in KY/IN |
| C-CL03-12 | medium | SAR prices, Arabic headings and metric units in a USD and square-foot Kentuckiana service (here: the square-metre option, orig. L15) | Owner; attorney licensed in KY/IN for the agreement text |
| C-CL03-14 | low | Service slug and name drift across files without an alias map (here: the `move-in-move-out` reference, orig. L11) | Owner (approves the registry alias map) |
| X-01 | high | No agreement identifies the property, service date or accepted estimate version | Attorney licensed in KY/IN |
| X-03 | high | Contract scope is defined by reference to unapproved, editable internal files (here: a file that does not exist) | Attorney licensed in KY/IN |
| X-11 | high | No SOP or contract protects occupants, children or pets from active work hazards | Qualified safety professional |
| X-16 | medium | A customer who buys two services signs inconsistent terms (here: "Penalties", "Utility Fine" and the waiting fee) | Attorney licensed in KY/IN |

### Open questions

- Q-30-10 (owner; attorney): cancellation, rescheduling, no-access and waiting policy, and which of this agreement's fees (if any) survive into the fee schedule. The fee part is shared with Q-28-07.
- Q-30-17 (owner; attorney): what are the rules for third-party property, including items left behind in move-outs? Until answered, nothing is discarded under this template.
- Q-30-20 (owner; attorney): who may sign for a customer when the tenant, landlord and property manager differ?
- Q-30-02 (owner; attorney, CPA): what is the registered legal entity that replaces "[Your Cleaning Company Name]"?
- Q-30-07 (owner; attorney; quality assistant): is there any re-clean or callback policy for CL-03 (for example after a landlord inspection)? None exists and none is invented here.
- Q-04-05 (owner): are occupied move-outs offered, and under CL-03 or CL-02? This decides whether the vacancy clauses stay.

### Revision history

| Date | Change | Author |
|---|---|---|
| 2026-10-03 | Added frontmatter, status callout and review notes; original text unchanged | AI orchestrator (Claude) |
