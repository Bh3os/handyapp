---
title: "Service agreement - Professional Residential Interior Painting (PT-01)"
service_id: PT-01
service_slug: interior-painting
canonical_name: "Professional Residential Interior Painting"
category: "Painting"
doc_type: contract
status: template-draft
authority: supporting
owner_approved: false
human_review:
  - "attorney licensed in KY/IN"
  - "owner"
  - "insurance broker"
  - "CPA (deposit, draw schedule and tax treatment, C-PT01-03)"
  - "EPA RRP-certified renovator (lead-safe information for older homes, Q-30-18)"
registry: "AI Development Plans/04-service-registry.md#PT-01"
last_reviewed: 2026-10-03
---

# 📜 Service Agreement: Residential Interior Painting (Kentuckiana)

> [!warning] Draft — not owner-approved
> Canonical service: **PT-01 — Professional Residential Interior Painting** · [Registry entry](../AI%20Development%20Plans/04-service-registry.md#PT-01)
> Draft, attorney review required, not for signature. DRAFT TEMPLATE — NOT LEGAL ADVICE. Must be reviewed and adapted by an attorney licensed in Kentucky and/or Indiana before any use. Placeholders such as [Your Company Name] must be replaced with the registered legal entity name (not yet confirmed). The review notes at the end are not part of the agreement text. See [30 Service agreement standards](../AI%20Development%20Plans/30-service-agreement-standards.md).
> Review notes for this file: see "Review notes and cross-references" at the end.

tags: #legal/contract #painting/interior #operations

This Service Agreement is entered into by and between **[Your Painting Company Name]** (hereinafter "Company") and **[Client Full Name]** (hereinafter "Client") for professional interior painting services.

## 1. Scope of Work & Color Selection
* **Inclusions:** Service strictly covers the surface preparation, priming, and application of a minimum of two (2) coats of paint to the designated interior areas as outlined in the `sop-interior-painting.md` micro-checklist.
* **Color Confirmation Waiver:** Client is solely responsible for final color choices, sheens (e.g., eggshell, satin, semi-gloss), and brand selection. Once the Client signs off on a color swatch, any change of mind after paint application will be treated as a new project and billed as a paid change order.
* **Exclusions:** Moving heavy electronic home theater setups, pianos, or fine art collections must be handled by the Client prior to crew arrival.

## 2. Pricing & Progress Draw Schedule
* **Total Project Fee:** The agreed total for the defined workspace is **\$[Amount]**.
* **Payment Milestones:**
	- **Draw 1 (Retainer):** 30% non-refundable deposit to secure the calendar date and procure paint materials.
	- **Draw 2 (Prep & Prime):** 40% due upon completion of masking, drywall patching, and priming.
	- **Draw 3 (Completion):** 30% due immediately upon final walkthrough inspection on the final day.

## 3. Lockout & Late Cancellation
* **24-Hour Notice:** Client must provide at least 24 hours' notice to cancel or reschedule a session. Failure to do so, or failure to provide home entry when the crew arrives, will incur a flat **\$50 Late Cancellation/Lockout Fee** to cover crew downtime and I-65 bridge toll expenses.

**Client Signature:** _______________________  **Date:** _______________
**Company Representative Signature:** ______________________  **Date:** _______________

---

## Review notes and cross-references (added 2026-10-03)

*Added during the AI orchestrator repository audit. Not part of the original content; original text above is unchanged. These notes are not agreement text: they add no term and are not for signature. Every disposition below belongs to an attorney licensed in Kentucky and/or Indiana and the owner, decided for each state separately.*

**Related files:** [Registry entry](../AI%20Development%20Plans/04-service-registry.md#PT-01) · [Pricing](../Pricing/pricing-interior-painting.md) · [Inventory](../Required%20inventory/inventory-interior-painting.md) · [SOP](../Standard%20Of%20Operations/sop-interior-painting.md) · [Requirements spec (service card PT-01)](../Requierments/HandyHub_Requirements_Specification_Reconstructed.md) · [Main plan](../Main%20Plans/Painting%20Business.md) · [Gap analysis](../AI%20Development%20Plans/02-gap-analysis.md)

### Clause checklist (per 30 Service agreement standards)
Statuses copy the PT-01 column of [30](../AI%20Development%20Plans/30-service-agreement-standards.md) section 4.2: 2 present, 5 partial, 5 present with conflicts, 12 missing, 1 not applicable.

| # | Clause (30 section 4.1) | Status in this template | Note (IDs) |
|---|---|---|---|
| 1 | Parties and legal entity | partial | Preamble placeholders "[Your Painting Company Name]" and "[Client Full Name]" (orig. L4): a generic painting-company placeholder instead of the HandyHub legal entity, which is not confirmed (C-PT01-11; Q-30-02) |
| 2 | Property, date and estimate-version identification | missing | No service address, date or accepted estimate version (X-01) |
| 3 | Scope reference | present - conflicts (C-PT01-04, C-PT01-06, X-03) | "Inclusions" (orig. L7) defines scope by the internal file `sop-interior-painting.md` ("micro-checklist"), an unapproved, editable draft (X-03). It names "priming" while that SOP spot-primes patches only (C-PT01-04), and the SOP covers walls only, so the ceilings, trim, baseboards, doors and closets sold in pricing may fall outside the agreement as written; effect not determined (C-PT01-06) |
| 4 | Exclusions | present | "Exclusions" (orig. L9): heavy home-theater setups, pianos and fine art are moved by the client before arrival. No exclusion for older-coating (lead) work, mold or moisture remediation, wallpaper removal, larger drywall repair, exterior surfaces or electrical and HVAC device work; the owner decides which become customer-visible ([04](../AI%20Development%20Plans/04-service-registry.md#PT-01) "exclusions") |
| 5 | Customer responsibilities and preparation | present | Same clause (orig. L9). No occupant, child or pet preparation (X-11) and no condition record for customer-supplied paint (X-22; spec START-009) |
| 6 | Access | present - conflicts (C-PT01-08) | "24-Hour Notice" (orig. L19) charges a fee when home entry is not provided; the fee has no pricing source |
| 7 | Concealed and pre-existing conditions | missing | No stop, document and notify term for concealed damage or moisture found while patching (spec JOB-004, FIN-008) |
| 8 | Hazardous-material discovery and stop-work | missing | No notice that work stops for suspected lead-containing coatings, asbestos or mold, although the incorporated SOP sands existing paint; lead-safe information for older homes is a jurisdiction question (30 section 8 row 12; Q-30-18) |
| 9 | Change orders | partial | "Color Confirmation Waiver" (orig. L8) routes a color change of mind after application to "a paid change order"; no general change-order term (spec FIN-008) |
| 10 | Schedule, weather and delays | missing | - |
| 11 | Cancellation and reschedule | present - conflicts (C-PT01-08) | "24-Hour Notice" (orig. L19): a notice period and a flat fee found only in this agreement; fee policy undecided (Q-30-10) |
| 12 | Term and termination (recurring or master only) | n/a | One-off service |
| 13 | Price, minimum and tax reference | partial | "Total Project Fee" placeholder (orig. L12) is not tied to the room tiers, add-ons or an accepted estimate version (X-01); the \$150 job minimum is not disclosed (spec CX-001); tax treatment not stated |
| 14 | Deposits and prepayment | present - conflicts (C-PT01-03, X-04) | "Draw 1 (Retainer)" (orig. L14): a non-refundable deposit on every job, while deposits apply only to larger jobs under a configurable policy that is undecided (spec FIN-002; Q-30-08) |
| 15 | Payment terms and methods | present - conflicts (C-PT01-03) | "Payment Milestones" (orig. L13-L16): a retainer plus two fixed draws on every job; accepted payment methods not stated (owner facts 2026-10-02: electronic invoices with cash and check acceptance; a received check is not cleared money) |
| 16 | Late payment | missing | - |
| 17 | Warranty and callback | missing | No warranty or callback clause and no approved policy (Q-30-07). The SOP incorporated by "Inclusions" opens with outcome-guarantee wording that may be read as a customer term; effect not determined (C-PT01-07). No warranty wording is drafted here |
| 18 | Limitation of liability, waivers, releases | partial | "Color Confirmation Waiver" (orig. L8): a labeled waiver that relies on a color sign-off no SOP step records (30 section 5 row 27; Q-30-11) |
| 19 | Insurance and credential statements | missing | Q-30-12 |
| 20 | Photo and marketing consent separation | missing | spec REC-003 |
| 21 | Privacy | missing | - |
| 22 | Dispute resolution | missing | - |
| 23 | Governing law (KY vs IN) | missing | - |
| 24 | Signatures and e-acceptance | partial | Blank signature and date lines (orig. L21-L22); no printed name, title or signer authority |
| 25 | Bilingual version precedence | missing | No Spanish version |

### Clauses requiring attorney review
Rows 27, 55 and 67 of [30](../AI%20Development%20Plans/30-service-agreement-standards.md) section 5. Quoted only to flag them, not to adopt them; amounts and percentages inside the quotes are elided with "..." because these notes restate no amount (36 section 3.0 rule 6). The disposition (keep, revise or remove) is an attorney and owner decision for Kentucky and for Indiana separately; the jurisdiction questions are 30 section 8 rows 4 (cancellation rights), 5 (deposits and forfeiture), 6 (charges for customer default) and 12 (lead-safe information for older homes).

| Quote (short) | Location | Concern | IDs | Reviewer |
|---|---|---|---|---|
| "Color Confirmation Waiver: Client is solely responsible for final color choices, sheens (e.g., eggshell, satin, semi-gloss), and brand selection. Once the Client signs off on a color swatch, any change of mind after paint application will be treated as a new project and billed as a paid change order." | "Color Confirmation Waiver", orig. L8 (30 section 5 row 27) | Waiver and change-order trigger. No SOP step records the color sign-off the clause relies on (30 section 3.2 rule 5); the draft SOP now lists that record as a precondition, pending review | - | Attorney; owner |
| "Failure to do so, or failure to provide home entry when the crew arrives, will incur a flat ... Late Cancellation/Lockout Fee to cover crew downtime and I-65 bridge toll expenses." | "24-Hour Notice", orig. L19 (30 section 5 row 55) | Cancellation and no-access fee that exists in no price list; the toll premise is unverified and cannot apply to every job | C-PT01-08 | Owner; attorney |
| "Draw 1 (Retainer): ... non-refundable deposit to secure the calendar date and procure paint materials." | "Payment Milestones", orig. L14 (30 section 5 row 67) | Non-refundable deposit on every job, including small rooms; deposit policy undecided | C-PT01-03 (critical), X-04 | Owner; attorney; CPA |

### Placeholders to resolve
- `[Your Painting Company Name]` (orig. L4) -> registered legal entity name from the company profile setting (not confirmed; Q-30-02; HUMAN REVIEW: attorney, CPA).
- `[Client Full Name]` (orig. L4) -> customer record plus signer authority (AUTH-028; Q-30-20).
- `$[Amount]` in "Total Project Fee" (orig. L12) -> total of the accepted estimate version. Price, any minimum adjustment, tax, deposit and payment schedule come from the estimate, never from agreement text (30 section 3.2 rule 2).
- Signature and date lines (orig. L21-L22) -> acceptance record (AUTH-027); no printed name, title or signer authority is shown. **HUMAN REVIEW: attorney.**
- Fields with no placeholder at all: service address and state, estimate number and version, scheduled date or window, customer contact and notice address, printed names and titles, document language, template version and effective date, acceptance method (30 section 6; AGR-004; X-01).

### Flags for controlled cleanup (not edited)
- Scope by file reference: "as outlined in the `sop-interior-painting.md` micro-checklist" (orig. L7) incorporates an internal, editable SOP file whose current version is a draft not approved for field use. Scope should come from the accepted estimate lines plus a versioned scope schedule (30 section 3.2 rule 4; AGR-003; X-03).
- A clause that relies on a procedure: the "Color Confirmation Waiver" (orig. L8) relies on a color-swatch sign-off; the draft SOP now lists that record as a precondition, but no approved SOP version contains it yet (30 section 3.2 rule 5).
- Milestones without evidence: "Draw 2 (Prep & Prime)" (orig. L15) falls due on completion of "masking, drywall patching, and priming", while the SOP spot-primes patches only (C-PT01-04) and defines no milestone evidence; the draft SOP now proposes photos at that stage. "Draw 3 (Completion)" (orig. L16) relies on a "final walkthrough inspection"; the draft SOP proposes recording the walkthrough outcome (spec QA-004). Payment timing stays an owner and attorney decision (Q-30-09).
- Unverified premise inside a clause: "I-65 bridge toll expenses" (orig. L19); no vault file records crew routes or tolls (C-PT01-08; the same premise is owner question Q-28-17 in [28](../AI%20Development%20Plans/28-pricing-estimating-and-job-costing.md)). Not corrected in place.
- Body `tags:` line (orig. L2): it stays in the body ([36](../AI%20Development%20Plans/36-file-modification-plan.md) D-36-06, which supersedes the "move to frontmatter" note in 30 section 6); converting it to a YAML list is a deferred owner decision (36 section 5.4 item 24).
- Title drift: the H1 "Service Agreement: Residential Interior Painting (Kentuckiana)" drops "Professional" (C-PT01-11). The frontmatter title uses the canonical name; the H1 changes only through the [34](../AI%20Development%20Plans/34-naming-and-migration-plan.md) naming plan with attorney review.

### Issues affecting this file
| ID | Severity | Issue (short) | Reviewer / owner |
|---|---|---|---|
| C-PT01-03 | Critical | A non-refundable retainer and fixed progress draws on every job vs the undecided, larger-jobs-only deposit policy (spec FIN-002) | Owner; attorney licensed in KY/IN; bookkeeper (deposit accounting) |
| C-PT01-04 | High | Full primer coat promised in the main plan vs SOP spot priming only; "Inclusions" names "priming" | Owner |
| C-PT01-05 | High | Zero-VOC paint promised by default in the main plan vs brand selection by the client under the "Color Confirmation Waiver" | Owner; marketing reviewer; attorney (environmental claims) |
| C-PT01-06 | High | Ceilings, trim, baseboards, doors and closets are priced but have no SOP procedure, while "Inclusions" ties scope to that SOP | Owner; lead painter; attorney (contract-scope effect) |
| C-PT01-07 | High | Outcome guarantees without a warranty policy; "Inclusions" incorporates the SOP whose opening sentence guarantees outcomes | Attorney licensed in KY/IN; owner |
| C-PT01-08 | High | The late-cancellation and lockout fee exists only in this agreement, with an unverified toll premise | Owner; attorney licensed in KY/IN |
| C-PT01-11 | Low | Service and company naming drift: generic painting-company placeholder; the H1 drops "Professional" | Owner (attorney for the entity name) |
| C-PT03-09 | High | (evidence; owned by PT-03) The PT-03 upfront deposit and fixed payment schedule vs the undecided deposit policy; the register cites this agreement's retainer draw as evidence | Owner; attorney; bookkeeper |
| X-01 | High | No agreement identifies the property, service date or accepted estimate version | Attorney licensed in KY/IN |
| X-03 | High | Contract scope defined by reference to an unapproved, editable internal file (here the SOP "micro-checklist") | Attorney licensed in KY/IN |
| X-04 | Medium | Deposit terms are keyed to service type, not job size | Owner; attorney licensed in KY/IN; CPA |
| X-11 | High | No SOP or agreement protects occupants, children or pets from active work hazards | Qualified safety professional |
| X-22 | Medium | Customer-supplied products (here: paint when the client selects the brand) have no common acceptance, defect or liability rule | Attorney licensed in KY/IN |

### Open questions
- **Q-30-08** (owner; attorney; CPA): deposit policy - threshold, amount, timing, refundability, forfeiture triggers and approval authority. This agreement fixes a non-refundable retainer and two progress draws on every job (C-PT01-03; X-04). Same decision as Q-28-09.
- **Q-30-10** (owner; attorney): cancellation, rescheduling, lockout and no-access policy, and whether the "24-Hour Notice" fee survives into the fee schedule, with what trigger, wording and premise (C-PT01-08). Fee part shared with Q-28-07.
- Related: **Q-30-02** (owner; attorney; CPA) the registered legal entity for the placeholders; **Q-30-07** (owner; attorney; quality assistant) whether any warranty and callback policy applies to PT-01 (none is drafted here); **Q-30-09** (owner; attorney; CPA) payment terms and the draw schedule; **Q-30-11** (attorney; insurance broker) whether the "Color Confirmation Waiver" or any other waiver is used; **Q-30-12** (owner; insurance broker) insurance actually held; **Q-30-18** (owner; EPA RRP-certified renovator; attorney) where lead-safe work information for older homes is acknowledged; **Q-30-22** (owner; attorney; CPA) refund and credit policy, including the non-refundable retainer (30 section 5 row 67). Register questions without a Q-number, all in [02](../AI%20Development%20Plans/02-gap-analysis.md): C-PT01-04 (owner) full prime coat, spot-prime only or a separate option; C-PT01-06 (owner; attorney) whether ceilings, trim, doors and closets fall inside "Inclusions" as written.

### Revision history
| Date | Change | Author |
|---|---|---|
| 2026-10-03 | Added frontmatter, status callout and review notes (clause checklist, attorney-review list, placeholders, cleanup flags); agreement text, headings, numbering and signature lines unchanged | AI orchestrator (Claude) |
