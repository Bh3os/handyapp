---
title: "Service agreement - Routine House Cleaning (CL-01)"
service_id: CL-01
service_slug: routine-cleaning
canonical_name: "Routine House Cleaning"
category: "Cleaning"
doc_type: contract
status: template-draft
authority: supporting
owner_approved: false
human_review:
  - "attorney licensed in KY/IN"
  - "owner"
  - "insurance broker"
  - "privacy owner (access codes)"
  - "qualified IT security reviewer (card-on-file data)"
  - "qualified safety professional (biohazard and mold exclusion)"
registry: "AI Development Plans/04-service-registry.md#CL-01"
last_reviewed: 2026-10-03
---

# 📜 Service Agreement: Routine Cleaning

> [!warning] Draft — not owner-approved
> Canonical service: **CL-01 — Routine House Cleaning** · [Registry entry](../AI%20Development%20Plans/04-service-registry.md#CL-01)
> Draft, attorney review required, not for signature. DRAFT TEMPLATE — NOT LEGAL ADVICE. Must be reviewed and adapted by an attorney licensed in Kentucky and/or Indiana before any use. Placeholders such as [Your Company Name] must be replaced with the registered legal entity name (not yet confirmed). The review notes at the end are not part of the agreement text. See [30 Service agreement standards](../AI%20Development%20Plans/30-service-agreement-standards.md).
> Review notes for this file: see "Review notes and cross-references" at the end.


This Service Agreement is entered into by and between **[Your Cleaning Company Name]** (hereinafter "Company") and **[Client Full Name]** (hereinafter "Client") for regular, recurring residential cleaning services.

## 1. Scope of Service
* **Inclusions:** Service will strictly adhere to the standard operating items listed in the `routine-cleaning.md` micro-checklist.
* **Exclusions:** Cleaners will not lift heavy objects (over 25 lbs), clean biohazards (feces, mold), or perform deep grease scraping under this routine contract.

## 2. Schedule & Access
* **Frequency:** Services will be performed on a **[Weekly / Bi-Weekly / Monthly]** basis.
* **Access:** Client will provide entry via **[Key / Lockbox Code / In-Person Entry]**. If the team arrives and is locked out, a **\$50 Lockout Fee** will apply automatically.

## 3. Financial Terms & Billing
* **Base Rate:** The agreed fee per visit is **\$[Amount]**.
* **Payment Authorization:** Payment is due immediately upon completion of each cleaning cycle. The Company is authorized to bill the Client’s card on file within 24 hours of service completion.
* **Cancellation Policy:** Client must provide at least **24 hours' notice** to reschedule or cancel a visit. Failure to do so will result in a flat **\$50 Late Cancellation Fee**.

## 4. Liability & Damage Policy
* **Breakage:** The Company is fully insured. Any accidental breakage or damage must be reported to the Company within 24 hours. Company liability is capped at a maximum of \$[Amount] per single item or limited to direct repair costs.
* **Solicitation:** Client agrees not to privately hire or solicit any employee of the Company for independent cleaning services for a period of one (1) year following termination of this contract.

**Client Signature:** _______________________  **Date:** _______________
**Company Signature:** ______________________  **Date:** _______________

---

## Review notes and cross-references (added 2026-10-03)

*Added during the AI orchestrator repository audit. Not part of the original content and not part of the agreement text; the agreement text above is unchanged.*

**Related files:** [Registry entry](../AI%20Development%20Plans/04-service-registry.md#CL-01) · [Pricing](../Pricing/pricing-routine-cleaning.md) · [Inventory](../Required%20inventory/inventory-routine-cleaning.md) · [SOP](../Standard%20Of%20Operations/sop%20Routine%20Cleaning%20Checklist.md) · [Requirements spec (service card CL-01)](../Requierments/HandyHub_Requirements_Specification_Reconstructed.md) · [Main plan](../Main%20Plans/Cleaning%20Business.md) · [Gap analysis](../AI%20Development%20Plans/02-gap-analysis.md)

### Clause checklist (per 30 Service agreement standards)

*Statuses copy the CL-01 column of [30 Service agreement standards](../AI%20Development%20Plans/30-service-agreement-standards.md) section 4.2 (1 present, 4 partial, 7 present with conflicts, 13 missing, 0 not applicable). The checklist describes what an attorney must decide; it is not clause wording.*

| # | Clause (30 section 4.1) | Status in this template | Note (IDs) |
|---|---|---|---|
| 1 | Parties and legal entity | partial | "[Your Cleaning Company Name]" and "[Client Full Name]" placeholders (orig. L4); registered entity not confirmed (Q-30-02); the customer's capacity (owner, tenant, landlord) and signer authority are not stated |
| 2 | Property, date and estimate-version identification | missing | No service address, scheduled date or window, or accepted estimate version (X-01) |
| 3 | Scope reference | present - conflicts (C-CL01-04, X-03) | "Inclusions" (orig. L7) incorporates the `routine-cleaning.md` "micro-checklist", which does not exist; the CL-01 SOP is an unapproved, unversioned draft under another file name (C-CL01-04). Scope is defined by an editable internal file instead of a versioned scope schedule from the accepted estimate (X-03; AGR-003) |
| 4 | Exclusions | present | "Exclusions" (orig. L8): heavy-object lifting above a stated weight, biohazards ("feces, mold") and deep grease scraping. Not customer-visible in the main plan or pricing (CX-004); the weight limit has no stated source; the line between routine bathroom cleaning and the excluded biohazards and mold is undefined (X-06; Q-31-10) |
| 5 | Customer responsibilities and preparation | missing | No preparation checklist: pets, occupants, fragile or valuable items, excluded rooms, allergies and fragrance consent, clutter (the pricing file's clutter fee has no defined threshold) (X-11; spec CX-005, CL-01.INT; 02 G-065) |
| 6 | Access (incl. no-access charges) | present - conflicts (C-CL01-05) | "Access" (orig. L12): key, lockbox code or in-person entry, plus an automatic lockout fee that is not in pricing and has no approval or evidence step (C-CL01-05). No key or code custody, return or rotation rule (02 G-115; spec COM-002; 27 AUTH-009); the code is resolved from the secured property record and never printed |
| 7 | Concealed and pre-existing conditions | missing | No stop, document, notify and change-order path; the "Breakage" clause (orig. L20) sets a customer reporting window for damage, not a process for conditions the crew finds |
| 8 | Hazardous-material discovery and stop-work | partial | "Exclusions" (orig. L8) excludes biohazards and mold but gives no customer-facing stop-work notice; the card stops work on "sharps/biohazard/unsafe animal/aggressive situation" (spec CL-01.SAF) |
| 9 | Change orders | missing | No change-order term; the pricing file's on-site clutter fee and any extra scope need an approved change order (spec FIN-008; C-CL01-05) |
| 10 | Schedule, weather and delays | partial | "Frequency" (orig. L11) placeholder only; no confirmation, company-initiated rescheduling or delay terms |
| 11 | Cancellation and reschedule | present - conflicts (C-CL01-05) | "Cancellation Policy" (orig. L17): a notice period and a flat late-cancellation fee that pricing does not contain; the cancellation policy is undecided (Q-30-10); no credit rule for skipped recurring visits (Q-30-22) |
| 12 | Term and termination (recurring or master relationships only) | missing | A recurring agreement with no term, renewal, pause or skip, termination notice or price-change notice; the "Solicitation" clause (orig. L21) runs from a termination the agreement never defines (02 G-065) |
| 13 | Price, minimum and tax reference | present - conflicts (C-CL01-01, C-CL01-05) | "Base Rate" (orig. L15) is a per-visit amount placeholder that names no pricing method; the pricing file's frequency discounts and surcharges are absent (C-CL01-05); no minimum disclosure (CX-001), although layout tiers and discounted visits in the pricing file fall below the job minimum (C-CL01-01); no tax reference |
| 14 | Deposits and prepayment | missing | Deposit policy undecided (Q-30-08); spec FIN-002 does not require a deposit on every job |
| 15 | Payment terms and methods | present - conflicts (C-CL01-03) | "Payment Authorization" (orig. L16): payment due on completion and card-on-file billing, while no payment provider or card-handling policy exists and the accepted methods are electronic invoice, cash and check (owner facts 2026-10-02; Q-30-09) |
| 16 | Late payment | missing | - |
| 17 | Warranty and callback | missing | No callback or re-clean policy; none may be invented, and the CL-02 re-clean clause does not carry over (Q-30-07; 04 CL-01 "warranty or callback policy") |
| 18 | Limitation of liability, waivers, releases | present - conflicts (X-16) | "Breakage" (orig. L20): a blank per-item liability cap and a customer damage-report window that exist in this agreement only (X-16; Q-30-11) |
| 19 | Insurance and credential statements | present - conflicts (C-CL01-02) | "The Company is fully insured." (orig. L20) with no policy or certificate on record (critical; Q-30-12; 02 G-129); never reused in any other document ([32](../AI%20Development%20Plans/32-website-and-customer-experience.md) section 4.1 rule 5) |
| 20 | Photo and marketing consent separation | missing | No photo clause; operational photos in an occupied home are internal-only by default, and marketing use needs separate consent (spec REC-002, REC-003) |
| 21 | Privacy | missing | No privacy notice reference; access codes and keys follow 27 AUTH-009 |
| 22 | Dispute resolution | missing | - |
| 23 | Governing law (KY vs IN) | missing | Decided per property state by the attorney (Q-30-05) |
| 24 | Signatures and e-acceptance | partial | Blank signature and date lines (orig. L23-L24); no printed name, title, signer authority or e-acceptance (Q-30-06) |
| 25 | Bilingual version precedence | missing | No Spanish version (Q-30-13) |

### Clauses requiring attorney review

*Rows 13, 43, 52, 53, 75 and 92 of the 30 section 5 risky-clause register. Quoted to flag them, not to adopt them; disposition (keep, revise or remove) is an attorney and owner decision. Fee amounts are not restated here (they stay in the clause text above).*

| Quote (short) | Location | Concern | IDs | Reviewer |
|---|---|---|---|---|
| "The Company is fully insured." | "Breakage", orig. L20 (30 section 5 row 13) | Insurance representation with no policy or certificate on record (owner facts L5: "Reported capability is not documentary proof of insurance"). FLAG: UNVERIFIED CLAIM - do not issue this agreement until a current certificate of insurance is on file and the broker and attorney approve the wording | C-CL01-02 (critical) | Insurance broker; attorney licensed in KY/IN |
| "Any accidental breakage or damage must be reported to the Company within 24 hours. Company liability is capped at a maximum of \$[Amount] per single item or limited to direct repair costs." | "## 4. Liability & Damage Policy" and "Breakage", orig. L19-L20 (30 section 5 row 43) | Blank liability cap and a customer time-bar; exists in this agreement only; a limitation must not contradict safety duties or rely on steps the SOP does not perform (30 section 4.1 clause 18) | X-16 | Attorney licensed in KY/IN; insurance broker |
| "If the team arrives and is locked out" ... "Lockout Fee will apply automatically." | "Access", orig. L12 (30 section 5 row 52) | Automatic fee; not in pricing; no approval or evidence step; amount unapproved | C-CL01-05 | Owner; attorney licensed in KY/IN |
| "Client must provide at least 24 hours' notice to reschedule or cancel a visit. Failure to do so will result in a flat" ... "Late Cancellation Fee." | "Cancellation Policy", orig. L17 (30 section 5 row 53) | Cancellation fee; not in pricing; cancellation policy undecided | C-CL01-05 | Owner; attorney licensed in KY/IN |
| "Payment Authorization: Payment is due immediately upon completion of each cleaning cycle. The Company is authorized to bill the Client’s card on file within 24 hours of service completion." | "Payment Authorization", orig. L16 (30 section 5 row 75) | Card-on-file authority with no payment provider or card-handling policy (owner facts L10). FLAG: PAYMENT METHOD NOT ESTABLISHED - pending provider selection and attorney review | C-CL01-03 | Attorney licensed in KY/IN; payment provider once selected; qualified IT security reviewer (card data) |
| "Solicitation: Client agrees not to privately hire or solicit any employee of the Company for independent cleaning services for a period of one (1) year following termination of this contract." | "Solicitation", orig. L21 (30 section 5 row 92) | Restrictive covenant in a consumer agreement; runs from a termination the agreement never defines (Q-30-16) | X-16 | Attorney licensed in KY/IN |

### Jurisdiction questions for the attorney (Kentucky and Indiana separately)

*Questions from 30 section 8, not conclusions; each is answered for Kentucky and for Indiana, and per municipality where it matters.*

- Row 6: may fixed charges for a lockout ("Access", orig. L12) and a late cancellation ("Cancellation Policy", orig. L17) be imposed on a consumer, and how must they be disclosed? (Attorney; owner.)
- Row 8: which consent, disclosure and cancellation rules apply to recurring charges and to billing a card on file ("Payment Authorization", orig. L16), and which payment-provider rules apply once a provider is selected? (Attorney; payment provider.)
- Row 10: are the per-item liability cap and the damage-report window ("Breakage", orig. L20) enforceable in a consumer service contract, and how do they interact with the insurance actually held? (Attorney; insurance broker.)
- Row 20: is the customer non-solicitation clause ("Solicitation", orig. L21) enforceable at all? (Attorney.)
- Row 25: what insurance statements may an agreement make, and what certificates may customers or municipalities require ("Breakage", orig. L20)? (Insurance broker; attorney.)
- Row 26: do each state's rules on unfair or deceptive practices reach the insurance statement in a signed agreement, and what substantiation must be on file before it is kept? (Attorney.)

### Placeholders to resolve

- [Your Cleaning Company Name] (orig. L4) -> registered legal entity name, from the company profile setting (not confirmed; Q-30-02; HUMAN REVIEW: attorney, CPA).
- [Client Full Name] (orig. L4) -> customer record plus signer authority (AUTH-028); who may sign is an attorney decision (Q-30-20).
- [Weekly / Bi-Weekly / Monthly] (orig. L11) -> the estimate or service plan (owner); recurring-plan terms are open (Q-28-18).
- [Key / Lockbox Code / In-Person Entry] (orig. L12) -> the property's access method; the code itself is resolved from the secured property record and never printed in a document (spec COM-002; 27 AUTH-009; HUMAN REVIEW: privacy owner).
- [Amount] in "Base Rate" (orig. L15, written with an escaped dollar sign) -> the accepted estimate version (owner and estimator); no amount is set in this file.
- [Amount] in "Breakage" (orig. L20) -> a liability cap only by attorney and insurance decision (Q-30-11; HUMAN REVIEW: attorney, insurance broker).
- Signature and date lines (orig. L23-L24) -> acceptance record (AUTH-027); HUMAN REVIEW: attorney.
- Fields with no placeholder at all (the AGR-004 identification block): service address and state, estimate number and version, scheduled date or window, printed names, titles and signer authority, document language, template version (X-01).

### Flags for controlled cleanup (not edited)

- Scope incorporates a file that does not exist: `routine-cleaning.md` (orig. L7). The CL-01 SOP is [sop Routine Cleaning Checklist](../Standard%20Of%20Operations/sop%20Routine%20Cleaning%20Checklist.md) (planned rename `sop-routine-cleaning.md`, 34 step 2.5), an unapproved draft. The reference is replaced only through the agreement architecture change (AGR-003; X-03); no link is added inside clause text, and which scope schedule or SOP version the agreement incorporates is an attorney decision (C-CL01-04).
- None found in this file: AI citation residue, probable typos inside clauses, square-metre options.

### Issues affecting this file

| ID | Severity | Issue (short) | Reviewer / owner |
|---|---|---|---|
| C-CL01-02 | critical | Agreement asserts the Company is "fully insured" without documentary proof ("Breakage", orig. L20) | Insurance broker; attorney licensed in KY/IN |
| C-CL01-01 | high | Flat-rate tiers and frequency discounts produce standalone visit totals below the job minimum (the "Base Rate" clause discloses no minimum) | Owner (minimum policy and its recurrence) |
| C-CL01-03 | high | Agreement authorizes card-on-file billing, but no payment provider or card-handling policy exists ("Payment Authorization", orig. L16) | Owner (payment method); attorney licensed in KY/IN; payment provider and a qualified IT security reviewer (card data) |
| C-CL01-04 | high | Agreement scope incorporates a checklist file that does not exist ("Inclusions", orig. L7) | Attorney licensed in KY/IN (incorporated terms change); owner (scope) |
| C-CL01-05 | medium | Fees and surcharges differ between agreement and pricing, and the on-site surcharge has no approval path | Owner; attorney licensed in KY/IN (fee enforceability) |
| X-01 | high | No agreement identifies the property, service date or accepted estimate version | Attorney licensed in KY/IN |
| X-03 | high | Contract scope is defined by reference to unapproved, editable internal files | Attorney licensed in KY/IN |
| X-11 | high | No SOP or contract protects occupants, children or pets from active work hazards (here: no customer-preparation clause) | Qualified safety professional |
| X-16 | medium | A customer who buys two services signs inconsistent terms (caps, insurance, reporting windows, termination, penalties) | Attorney licensed in KY/IN |

### Open questions

- Q-30-12 (owner; insurance broker): what insurance is actually held, and may this agreement mention it at all? Until a certificate is on file, "The Company is fully insured." is an unverified claim (C-CL01-02; 02 G-129).
- Q-30-09 (owner; attorney, CPA): payment terms for recurring visits and the card-on-file stance once a provider is selected; until then the accepted methods are electronic invoice, cash and check (owner facts 2026-10-02).
- Q-30-10 (owner; attorney): cancellation, rescheduling, lockout and no-access policy, and which of this agreement's fees, if any, survive into the fee schedule (shared with Q-28-07).
- Q-30-16 (owner; attorney): keep the non-solicitation clause in any form?
- Q-30-11 (attorney; insurance broker): should any limitation of liability be used, and how does it interact with the insurance actually held?
- Q-30-02 (owner; attorney, CPA): what registered legal entity replaces "[Your Cleaning Company Name]"?
- Q-30-07 (owner; attorney; quality assistant): is any callback or re-clean window offered for routine visits? None exists and none is invented here.
- C-CL01-04 (attorney; owner): which versioned scope schedule or SOP version, if any, replaces the `routine-cleaning.md` reference (AGR-003)?
- Q-28-18 (owner; attorney): recurring-plan terms for the term-and-termination clause: term, pause or skip, termination notice and price-change notice (02 G-065).

### Revision history

| Date | Change | Author |
|---|---|---|
| 2026-10-03 | Added frontmatter, status callout and review notes (R1, R2, R7, R3); agreement text unchanged | AI orchestrator (Claude) |
