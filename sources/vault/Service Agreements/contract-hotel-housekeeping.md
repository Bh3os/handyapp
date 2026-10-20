---
title: "Service agreement - Hotel-Style Luxury Housekeeping (CL-06)"
service_id: CL-06
service_slug: hotel-housekeeping
canonical_name: "Hotel-Style Luxury Housekeeping"
category: "Cleaning"
doc_type: contract
status: template-draft
authority: supporting
owner_approved: false
human_review:
  - "attorney licensed in KY/IN"
  - "owner"
  - "insurance broker"
  - "privacy owner (confidentiality, personal records, mail, keys and photos)"
  - "bookkeeper or CPA (prepayment capture, refunds and credits)"
registry: "AI Development Plans/04-service-registry.md#CL-06"
last_reviewed: 2026-10-03
---

# 📜 Subscription Agreement: Hotel-Style Housekeeping

> [!warning] Draft — not owner-approved
> Canonical service: **CL-06 — Hotel-Style Luxury Housekeeping** · [Registry entry](../AI%20Development%20Plans/04-service-registry.md#CL-06)
> Draft, attorney review required, not for signature. DRAFT TEMPLATE — NOT LEGAL ADVICE. Must be reviewed and adapted by an attorney licensed in Kentucky and/or Indiana before any use. Placeholders such as [Your Company Name] must be replaced with the registered legal entity name (not yet confirmed). The review notes at the end are not part of the agreement text. See [30 Service agreement standards](../AI%20Development%20Plans/30-service-agreement-standards.md).
> Review notes for this file: see "Review notes and cross-references" at the end.


This Monthly Subscription Agreement is entered into by **[Your Cleaning Company Name]** ("Company") and **[Resident Name]** ("Client") for premium, luxury residential care.

## 1. Selected Subscription Tier
Client selects the checked luxury housekeeping package defined in `pricing-hotel-housekeeping.md`:
* [ ] **Silver Tier** (2x visits/week) - \$[Amount] / month
* [ ] **Gold Tier** (3x visits/week) - \$[Amount] / month
* [ ] **Elite Presidential Tier** (5x visits/week) - \$[Amount] / month

## 2. Inclusions & Valet Standard
* **Premium Care:** Scope follows the detailed `hotel-housekeeping.md` micro-checklist, focusing on bed turndown, closet management, and cloth steaming.
* **Valet Limitation:** Cleaners will steam or iron garments but are not professional dry cleaners. Company is not liable for shrinkage or discoloration of fine delicate garments (e.g., pure silk, cashmere) lacking clear care labels.

## 3. Billing & Subscription Continuity
* **Upfront Billing:** Subscriptions are billed and captured **100% upfront on the 1st calendar day of each month**.
* **Skip & Cancellation Policy:** Subscription visits are fixed. If a Client requests to skip a scheduled visit day, no partial monetary credit is issued. Client may request a makeup hour block within 7 business days, subject to crew availability.
* **Termination:** Either party may terminate this subscription by providing fourteen (14) days written notice before the next monthly billing cycle.

**Client Signature:** _______________________  **Date:** _______________
**Company Signature:** ______________________  **Date:** _______________

---

## Review notes and cross-references (added 2026-10-03)

*Added during the AI orchestrator repository audit. Not part of the original content; original text above is unchanged.*

These notes are internal working notes, not agreement text, and are never sent to a customer. No clause above was edited; every disposition below is an attorney and owner decision, made for Kentucky and for Indiana separately ([30 Service agreement standards](../AI%20Development%20Plans/30-service-agreement-standards.md) section 8). Nothing here states what either state requires.

**Related files:** [Registry entry](../AI%20Development%20Plans/04-service-registry.md#CL-06) · [Pricing](../Pricing/pricing-hotel-housekeeping.md) · [Inventory](../Required%20inventory/inventory-hotel-housekeeping.md) · [SOP](../Standard%20Of%20Operations/sop%20Hotel-Style%20Housekeeping%20Checklist.md) · [Requirements spec (service card CL-06)](../Requierments/HandyHub_Requirements_Specification_Reconstructed.md) · [Main plan](../Main%20Plans/Cleaning%20Business.md) · [Gap analysis](../AI%20Development%20Plans/02-gap-analysis.md)

### Clause checklist (per 30 Service agreement standards)
Statuses copy the CL-06 column of 30 section 4.2 (0 present, 4 partial, 7 present with conflicts, 14 missing, 0 not applicable).

| # | Clause (30 section 4.1) | Status in this template | Note (IDs) |
|---|---|---|---|
| 1 | Parties and legal entity | partial | Opening paragraph: `[Your Cleaning Company Name]` and `[Resident Name]` only; the resident may not be the payer (30 section 6); no entity type, notice address or signer capacity (Q-30-02, Q-30-20) |
| 2 | Property, date and estimate-version identification | missing | No service address, start date, visit days or accepted estimate or plan version (X-01) |
| 3 | Scope reference | present - conflicts (C-CL06-09, C-CL06-10, C-CL06-V01, C-CL06-07, X-03) | The package is "defined in `pricing-hotel-housekeeping.md`", an internal file with a margin target, SAR conversions and price ranges (C-CL06-10); scope "follows the detailed `hotel-housekeeping.md` micro-checklist", a file that does not exist; the CL-06 SOP is `sop Hotel-Style Housekeeping Checklist.md` (C-CL06-09). Both tie customer scope to editable internal files (X-03). One scope sentence for every tier gives Silver the Gold-tier tasks (C-CL06-V01), and the fridge and mail/package inclusions sold in pricing have no SOP step (C-CL06-07) |
| 4 | Exclusions | present - conflicts (C-CL06-04) | "Valet Limitation" says staff "are not professional dry cleaners", while pricing sells dry-cleaning drop-offs and hand-washing through its "Fine Garments Surcharge" and the main plan sells washing and drying, none of which has an SOP step (C-CL06-04). Other exclusions are undefined: cooking, childcare or pet care, opening mail, handling cash or jewelry, art cleaning beyond dusting, deep cleaning (04 CL-06 "exclusions") |
| 5 | Customer responsibilities and preparation | missing | No privacy boundaries, off-limits rooms, care preferences, delicate-item list, preferred products or fragrance and allergy information, and nothing on pets and occupants (spec CL-06.INT; 04 CL-06 "customer preparation requirements"; X-11) |
| 6 | Access (incl. no-access charges) | missing | No key, lockbox or alarm handling and no no-access rule; an access clause must not print codes (30 section 4.1 clause 6; spec COM-002; 27 AUTH-009; Q-30-10) |
| 7 | Concealed and pre-existing conditions | missing | No existing-condition record for garments, finishes or high-value items before work |
| 8 | Hazardous-material discovery and stop-work | missing | No customer notice that work stops for unsafe or unexpected conditions (spec START-011) |
| 9 | Change orders | missing | No mechanism for tier changes, extra visits or added tasks (spec FIN-008) |
| 10 | Schedule, weather and delays | partial | Only "subject to crew availability" for makeup blocks; nothing on visits HandyHub misses, holidays or delays (04 CL-06 "warranty or callback policy"; Q-30-10) |
| 11 | Cancellation and reschedule | present - conflicts (C-CL06-05) | "Skip & Cancellation Policy" differs from the pricing file's "Cancellation/Skip Policy" (business days against days, an hour block against a visit, an availability caveat, "no partial monetary credit" against "no refunds"), while this agreement incorporates that pricing file (C-CL06-05; 30 section 5 row 71; Q-30-22) |
| 12 | Term and termination (recurring or master only) | partial | "Termination" sets a notice period before the next billing cycle; no term, renewal, proration, credit or price-change rule (30 section 5 row 72; Q-28-18); termination terms differ across the cleaning agreements (X-16) |
| 13 | Price, minimum and tax reference | present - conflicts (C-CL06-10, C-CL06-03) | Monthly `\$[Amount]` placeholders per tier tied to the incorporated pricing file, with no estimate or plan version (X-01); no disclosure of the job minimum or of how it applies to a monthly plan (spec CX-001; Q-28-04); no tax reference (CPA). The Elite tier's "(5x visits/week)" matches the pricing heading but not the main plan's "every single day" (C-CL06-03) |
| 14 | Deposits and prepayment | present - conflicts (C-CL06-06, X-04) | "Upfront Billing" makes a full monthly prepayment universal while the owner's payment policy is undecided; prepaying a plan period is a plan term, not a deposit (28 section 3.10); deposit and prepayment terms keyed to a service type (X-04) |
| 15 | Payment terms and methods | present - conflicts (C-CL06-06) | "billed and captured" implies card capture while no payment provider is selected; accepted methods are electronic invoices, cash and check (owner facts 2026-10-02; spec BIZ-007; Q-30-09; 27 Q-27-17) |
| 16 | Late payment | missing | - |
| 17 | Warranty and callback | missing | None; makeup blocks cover customer-requested skips only, not quality complaints or visits HandyHub misses (04 CL-06 "warranty or callback policy"; Q-30-07) |
| 18 | Limitation of liability, waivers, releases | present - conflicts (C-CL06-01, C-CL06-04) | "Valet Limitation" limits liability for delicate garments "lacking clear care labels", while the SOP had no care-label check (a draft hold now sits in the SOP, pending review) and pricing sells hand-washing (30 section 5 row 41; Q-30-11) |
| 19 | Insurance and credential statements | missing | None; insurance for property in HandyHub's care and for garment errands is an open question (04 CL-06 "permit/license flags"; Q-30-12) |
| 20 | Photo and marketing consent separation | missing | Nothing on photos inside a private residence, where the card limits photography to need (spec CL-06.SAF) |
| 21 | Privacy | missing | No confidentiality, personal-records, mail or photo clause although the card requires "strict privacy" (spec CL-06.SAF; C-CL06-01) |
| 22 | Dispute resolution | missing | - |
| 23 | Governing law (KY vs IN) | missing | - |
| 24 | Signatures and e-acceptance | partial | Blank signature and date lines only; no printed name, title, signer authority or e-acceptance |
| 25 | Bilingual version precedence | missing | No Spanish version |

### Clauses requiring attorney review
| Quote (short) | Location | Concern | IDs | Reviewer |
|---|---|---|---|---|
| "Cleaners will steam or iron garments but are not professional dry cleaners. Company is not liable for shrinkage or discoloration of fine delicate garments (e.g., pure silk, cashmere) lacking clear care labels." | Clause 2 "Valet Limitation", orig. L14 (30 section 5 row 41) | Limitation of liability; the SOP had no care-label check, which the spec card requires (a draft hold now precedes the ironing and steaming step, pending review); laundry and hand-washing are sold in pricing | C-CL06-01, C-CL06-04 | Attorney |
| "Subscriptions are billed and captured 100% upfront on the 1st calendar day of each month." | Clause 3 "Upfront Billing", orig. L17 (30 section 5 row 70) | "100%" prepayment and capture; no payment provider; cash and check are accepted | C-CL06-06 | Attorney; owner; bookkeeper |
| "If a Client requests to skip a scheduled visit day, no partial monetary credit is issued. Client may request a makeup hour block within 7 business days, subject to crew availability." | Clause 3 "Skip & Cancellation Policy", orig. L18 (30 section 5 row 71) | Credit restriction; the pricing file says "no refunds are issued" and "within 7 days"; refund requests need human review | C-CL06-05 | Attorney; owner |
| "Either party may terminate this subscription by providing fourteen (14) days written notice before the next monthly billing cycle." | Clause 3 "Termination", orig. L19 (30 section 5 row 72) | Termination and renewal; no proration, renewal or price-change rule | none in 30 section 5; X-16 covers termination terms that differ across agreements | Attorney |

### Placeholders to resolve
- `[Your Cleaning Company Name]` -> registered legal entity name (not confirmed; Q-30-02); resolves from the company profile setting (30 section 6). Whether a "cleaning company" is a separate entity or HandyHub itself is part of Q-30-02.
- `[Resident Name]` -> customer record; the resident may not be the payer, and who may sign is an attorney question (30 section 6; Q-30-20).
- Tier checkboxes `[ ]` (orig. L8-L10) -> the plan option selected on the accepted estimate (spec EST-005; 30 section 6).
- `\$[Amount]` (orig. L8, L9, L10) -> monthly plan price from the accepted estimate or plan version; the minimum adjustment and tax come from the estimate (30 section 4.1 clause 13; Q-28-04).
- Fields with no placeholder at all (30 section 6, AGR-004): service address and state; plan start date and visit days; estimate or plan number and version; customer contact and notice address; printed names, titles and signer authority; document language; template version and effective date; acceptance method and consent record.
- Signature and date lines: no printed name, title or signer authority (30 section 6; HUMAN REVIEW: attorney).

### Flags for controlled cleanup (not edited)
- Reference to a nonexistent file: the scope sentence names a `hotel-housekeeping.md` micro-checklist (orig. L13); the CL-06 SOP is `sop Hotel-Style Housekeeping Checklist.md`, which [34](../AI%20Development%20Plans/34-naming-and-migration-plan.md) step 2.10 would rename to `sop-hotel-housekeeping.md` (C-CL06-09; 30 section 6). The clause stays unchanged; the reference is replaced only through the agreement architecture change with the attorney (AGR-003; X-03).
- Incorporated internal file: the tier section names `pricing-hotel-housekeeping.md` (orig. L7), an unapproved benchmark file with a margin target and SAR conversions; replaced only with an attorney-approved customer-facing tier schedule (C-CL06-10; Q-30-03).
- The H1 drops "Luxury" from the canonical name, which the frontmatter carries; title changes follow the [34](../AI%20Development%20Plans/34-naming-and-migration-plan.md) waves.
- None of the other artifact types listed in 30 section 6 (AI citation residue, typos inside clauses, square-metre options, a body `tags:` line) occurs in this file.

### Issues affecting this file
| ID | Severity | Issue (short) | Reviewer / owner |
|---|---|---|---|
| C-CL06-01 | high | SOP omits the card's privacy, valuables, care-label and secure-closeout controls | Privacy owner; attorney |
| C-CL06-03 | high | Main plan promises daily service "every single day"; tiers offer 2, 3 or 5 visits per week | Owner |
| C-CL06-04 | high | Laundry washing, hand-washing and dry-cleaning errands are sold but excluded by contract wording and absent from the SOP | Attorney; insurance broker; owner |
| C-CL06-05 | high | Skip/makeup policy differs between pricing and contract | Attorney; owner |
| C-CL06-06 | high | 100% upfront "captured" billing vs no payment provider, cash/check acceptance and undecided payment-timing policy | Owner; bookkeeper or CPA; attorney |
| C-CL06-07 | high | Paid tier inclusions have no SOP coverage (fridge, mail/packages, bed adjustments) | Owner; privacy owner |
| C-CL06-09 | high | Contract scope incorporates a nonexistent `hotel-housekeeping.md` | Attorney |
| C-CL06-10 | medium | Contract incorporates the internal pricing guide (margins, SAR, ranges) by reference | Attorney |
| C-CL06-V01 | medium | Contract and SOP give every tier the Gold-tier inclusions (closet organization, garment steaming, scent) | Owner; attorney (contract scope wording) |
| X-01 | high | No agreement identifies the property, service date or accepted estimate version | KY/IN attorney |
| X-03 | high | Contract scope is defined by reference to unapproved, editable internal files (20 of 25 contracts; 8 targets do not exist) | KY/IN attorney |
| X-04 | medium | Deposit terms are keyed to service type, not job size, contrary to the large-jobs-only principle | Owner; attorney; CPA |
| X-11 | high | No SOP or contract protects occupants, children or pets from active work hazards | Qualified safety professional |
| X-16 | medium | A customer who buys two services signs inconsistent terms (caps, insurance, reporting windows, termination, penalties) | KY/IN attorney |

### Open questions
- Q-30-09 (owner; attorney; CPA): which payment terms apply to subscriptions, and is any card-on-file or automatic capture used once a provider is selected (with 27 Q-27-17)?
- Q-30-22 (owner; attorney; CPA): which refund and credit policy applies to skipped or missed visits and to termination, and may an agreement restrict refunds at all ("no partial monetary credit is issued")?
- Q-30-02 (owner; attorney; CPA): which registered legal entity contracts, and is `[Your Cleaning Company Name]` a separate entity or HandyHub?
- Q-30-20 (owner; attorney): who may sign when the resident is not the payer?
- Q-30-17 (owner; attorney): which rules apply to mail and packages, which the Elite tier includes (30 section 8 row 21)?
- Q-30-11 (attorney; insurance broker): should the garment limitation, or any limitation of liability, be used, and how does it interact with the insurance actually held?
- Q-30-12 (owner; insurance broker): what insurance is actually held, does it cover garments and other property in HandyHub's care (including any off-site errands), and may the agreement mention it?
- Q-30-07 (owner; attorney; quality assistant): is any re-service or callback offered for quality complaints, separate from skip makeups?
- Q-28-18 (owner; attorney; CPA): which plan terms apply to renewal, proration of partial months and price changes?
- Open questions recorded with C-CL06-04 and C-CL06-09 in 02 (owner; attorney; insurance broker): are washing, hand-washing and dry-cleaning errands offered, and which versioned customer-visible scope instrument replaces the file references?

### Revision history
| Date | Change | Author |
|---|---|---|
| 2026-10-03 | Added frontmatter, status callout and review notes (clause checklist, attorney-review list, placeholders, cleanup flags); clause text, numbering, amounts and signature lines unchanged | AI orchestrator (Claude) |
