---
title: "Service agreement - Post-Construction & Post-Renovation Cleaning (CL-04)"
service_id: CL-04
service_slug: post-construction
canonical_name: "Post-Construction & Post-Renovation Cleaning"
category: "Cleaning"
doc_type: contract
status: template-draft
authority: supporting
owner_approved: false
human_review:
  - "attorney licensed in KY/IN"
  - "owner"
  - "insurance broker"
  - "qualified safety professional (site-safety and chemical clauses)"
  - "CPA (late interest and commercial tax treatment)"
registry: "AI Development Plans/04-service-registry.md#CL-04"
last_reviewed: 2026-10-03
---

# 📜 Master Service Agreement: Post-Construction Cleaning
> [!warning] Draft — not owner-approved
> Canonical service: **CL-04 — Post-Construction & Post-Renovation Cleaning** · [Registry entry](../AI%20Development%20Plans/04-service-registry.md#CL-04)
> Draft, attorney review required, not for signature. DRAFT TEMPLATE — NOT LEGAL ADVICE. Must be reviewed and adapted by an attorney licensed in Kentucky and/or Indiana before any use. Placeholders such as [Your Company Name] must be replaced with the registered legal entity name (not yet confirmed). The review notes at the end are not part of the agreement text. See [30 Service agreement standards](../AI%20Development%20Plans/30-service-agreement-standards.md).
> Legacy artifacts: the per-square-metre option in this file is a non-authoritative brainstorm remnant (canonical currency USD, launch market KY/IN, languages EN/ES). It is kept unchanged pending an owner decision on cleanup.
> Review notes for this file: see "Review notes and cross-references" at the end.


This Commercial Service Agreement is entered into by and between **[Your Cleaning Company Name]** ("Company") and **[Contractor / Developer / Property Owner Name]** ("Client").

## 1. Milestone Phase Execution
The cleaning scope will be billed and executed across the checked milestones outlined in the `post-construction.md` micro-checklist:
* [ ] **Phase 1: Rough Clean** - \$[Amount]
* [ ] **Phase 2: Detail Clean** - \$[Amount]
* [ ] **Phase 3: Final Touch** - \$[Amount]
* [ ] **All-In Bundle Total:** **\$[Amount]** for a total area of **[Sq. Ft / Sq. M]**.

## 2. Contractor/Client Responsibilities
* **Construction Complete:** All primary trades (painters, floor installers, plumbers) must be completely finished with their work in target zones before the Company begins detailed polishing.
* **On-Site Safety:** Client must ensure the site is safe, clear of structural hazards, and possesses active temporary or permanent electrical power and running water lines.

## 3. Specialized Scraping & Material Waiver
* **Glass Scraping:** The Company utilizes specialized carbon-steel safety scrapers to remove paint and plaster droplets from glass surfaces. Client signs a waiver releasing the Company from liability for fine hairline scratches on windows if glass has manufacturing defects or pre-existing debris under protective films.
* **Chemical Use:** Client approves the use of phosphoric acid treatments on industrial tile grout lines to lift grout haze.

## 4. Commercial Payment Terms
* **Invoicing Net Terms:** Invoices will be issued upon completion of each phase milestone. Payment must be received within **[Net 15 / Net 30]** days of invoice presentation.
* **Late Interest:** Late payments will accumulate interest at a rate of 1.5% per month on outstanding balances.

**Client Representative Signature:** _______________________  **Date:** _______________
**Company Representative Signature:** ______________________  **Date:** _______________

---

## Review notes and cross-references (added 2026-10-03)

*Added during the AI orchestrator repository audit. Not part of the original content and not part of the agreement text; original text above is unchanged. Clause text, headings, numbering and signature lines are not edited; every disposition is an attorney and owner decision, made for Kentucky and for Indiana separately.*

**Related files:** [Registry entry](../AI%20Development%20Plans/04-service-registry.md#CL-04) · [Pricing](../Pricing/pricing-post-construction.md) · [Inventory](../Required%20inventory/inventory-post-construction.md) · [SOP](../Standard%20Of%20Operations/sop%20Post-Construction%20Cleaning%20Checklist.md) · [Requirements spec (service card CL-04)](../Requierments/HandyHub_Requirements_Specification_Reconstructed.md) · [Main plan](../Main%20Plans/Cleaning%20Business.md) · [Gap analysis](../AI%20Development%20Plans/02-gap-analysis.md)

**Template family:** this is a commercial service agreement ("This Commercial Service Agreement") with a contractor, developer or property owner. Commercial template families stay inactive until the owner decides which customer types are offered at launch ([30](../AI%20Development%20Plans/30-service-agreement-standards.md) D-30-14, PROPOSED; Q-30-04). The party placeholder includes "Property Owner", while the main plan markets this service to homeowners, so the audience is undefined: AUDIENCE UNDEFINED - ATTORNEY REVIEW ([02](../AI%20Development%20Plans/02-gap-analysis.md) C-CL04-11). Whether homeowners need a separate consumer agreement is an open question for the attorney. Flow-down terms, indemnity, insurance certificates, retainage and payment timing with builders and developers are professional-review items for the attorney and the insurance broker (30 section 8 row 23).

### Clause checklist (per 30 Service agreement standards)
Statuses copy the CL-04 column of [30](../AI%20Development%20Plans/30-service-agreement-standards.md) section 4.2 (present 1, partial 2, present - conflicts 7, missing 15, n/a 0). "Present" never means approved.

| # | Clause (30 section 4.1) | Status in this template | Note (IDs) |
|---|---|---|---|
| 1 | Parties and legal entity | present - conflicts (C-CL04-11) | `[Your Cleaning Company Name]` ("Company") and `[Contractor / Developer / Property Owner Name]` ("Client") (orig. L4). A commercial agreement that a homeowner ("Property Owner") could sign; the H1 calls it a "Master Service Agreement" and the body a "Commercial Service Agreement"; entity type, assumed name and signer capacity are not stated (Q-30-02, Q-30-20) |
| 2 | Property, date and estimate-version identification | missing | No project address, state, estimate number or version, or phase schedule (X-01) |
| 3 | Scope reference | present - conflicts (C-CL04-09, X-03) | "Milestone Phase Execution" (orig. L7) defines scope by "the checked milestones outlined in the `post-construction.md` micro-checklist", a file that does not exist (BROKEN SCOPE REFERENCE); the SOP is a different, internal file. Scope comes from the accepted estimate version, not from internal checklists (30 AGR-003; spec CX-004, EST-007); which instrument defines contractual scope is an attorney question. The phase checkboxes (orig. L8-L11) are options to identify on the estimate (spec EST-005) |
| 4 | Exclusions | missing | No exclusions. Candidates for owner decision: exterior glass, duct interiors (the CL-07 boundary), suspect hazardous debris, haul-away, and work "Above 12 ft" in the pricing file ([04](../AI%20Development%20Plans/04-service-registry.md#CL-04) exclusions, GAP); the SOP's Do-not-perform list is the input |
| 5 | Customer responsibilities and preparation | present - conflicts (C-CL04-04) | "Construction Complete" (orig. L14) and "On-Site Safety" (orig. L15). The site-safety clause moves the safety check onto the client and cannot replace HandyHub's own pre-start check (spec START-007; 30 section 4.1 row 5); "detailed polishing" is undefined, so Phase 1 may take place while trades are still active; no area-release step (spec CL-04.SAF "confirm area released for cleaning") |
| 6 | Access (incl. no-access charges) | missing | No access method, site contact, keys or no-access rule; area release and walkthrough dates with the general contractor are not addressed (04 CL-04 customer preparation requirements, GAP) |
| 7 | Concealed and pre-existing conditions | present - conflicts (C-CL04-05, X-02) | "Glass Scraping" (orig. L18) turns liability on glass "manufacturing defects or pre-existing debris under protective films", evidence that no SOP step collected; the restructured SOP now proposes a pre-work glass inspection with photos, pending review. No stop, photo or change-order path for other conditions found on site |
| 8 | Hazardous-material discovery and stop-work | present - conflicts (C-CL04-02, C-CL04-04) | "Chemical Use" (orig. L19) has the client approve phosphoric acid treatment that no SOP step, SDS or compatibility control supports; "On-Site Safety" (orig. L15) shifts site safety. No customer-facing notice that work stops for suspect asbestos or lead in renovation dust and debris, unsafe active construction or unsafe power (spec START-011; CL-04.SAF) |
| 9 | Change orders | missing | No term. The pricing file's conditional high-ceiling fee has no line here; a fee triggered after signature needs an approved change order (C-CL04-08; spec FIN-008) |
| 10 | Schedule, weather and delays | missing | No term; phase visits depend on the trades finishing and on area release (spec SCH-002) |
| 11 | Cancellation and reschedule | missing | Policy undecided (Q-30-10) |
| 12 | Term and termination (recurring or master only) | missing | A "Master Service Agreement" (H1) with no term, renewal, suspension or termination; 30 section 4.1 row 12 covers "any commercial master" |
| 13 | Price, minimum and tax reference | present - conflicts (C-CL04-08, C-CL04-13) | Phase and bundle checkboxes with `[Amount]` placeholders written after a dollar sign (orig. L8-L11), not tied to an estimate version; the pricing file's high-ceiling fee has no line (C-CL04-08); the `[Sq. Ft / Sq. M]` area placeholder offers metres (C-CL04-13). No minimum reference (spec BIZ-003, FIN-001; Q-28-04, Q-28-19) and no tax reference (30 section 8 row 22) |
| 14 | Deposits and prepayment | missing | No term; large-job deposit policy undecided (owner facts 2026-10-02; Q-30-08); retainage not addressed (30 section 8 row 11) |
| 15 | Payment terms and methods | partial | "Invoicing Net Terms" (orig. L22): invoices "upon completion of each phase milestone" and `[Net 15 / Net 30]`. Progress invoices with a due-date policy fit spec FIN-003; accepted methods (electronic invoices, cash, check; no payment provider selected) are not stated (owner facts 2026-10-02; Q-30-09); terms for homeowner customers are undecided (C-CL04-11) |
| 16 | Late payment | present | "Late Interest" (orig. L23): present as draft text only, not approved. No owner payment-terms decision exists; limits for consumer and commercial accounts and disclosure are questions per state (30 section 5 row 73; 30 section 8 row 7; Q-30-09) |
| 17 | Warranty and callback | missing | No warranty, re-clean or punch policy, for example for dust resettled by other trades (04 CL-04 warranty or callback policy, GAP); none is proposed here (Q-30-07); return visits are classified under spec CX-007 and QA-010 |
| 18 | Limitation of liability, waivers, releases | present - conflicts (C-CL04-05, X-17) | Heading "3. Specialized Scraping & Material Waiver" and "Glass Scraping" (orig. L17-L18): a waiver and release that relies on pre-work glass evidence the SOP did not collect; no separate waiver form exists in the vault; the opposite logic to the DW-04 glass clause (X-17); 30 section 5 row 30; Q-30-11 |
| 19 | Insurance and credential statements | missing | None stated; certificate-of-insurance requests from general contractors or developers need a process (30 section 4.1 row 19; 04 CL-04 prerequisites); none may be added until the compliance register supports it (Q-30-12) |
| 20 | Photo and marketing consent separation | missing | No term; pre-work glass photos would be operational records, internal by default (spec REC-002) |
| 21 | Privacy | missing | No term |
| 22 | Dispute resolution | missing | No term |
| 23 | Governing law (KY vs IN) | missing | Decided per property state by the attorney (Q-30-05) |
| 24 | Signatures and e-acceptance | partial | "Client Representative" and "Company Representative" signature and date lines (orig. L25-L26); no printed name, title or signer authority (Q-30-06). Whether these signatures are the "waiver" that the glass clause says the client signs is an attorney question (02 C-CL04-05) |
| 25 | Bilingual version precedence | missing | No Spanish version (Q-30-13) |

### Clauses requiring attorney review
From [30](../AI%20Development%20Plans/30-service-agreement-standards.md) section 5 (rows 30, 73, 81, 82 and 93). Quoted only to flag them; the quotes are not endorsed, and the interest rate is elided ("...") because this review adds no amount or percentage. Each item is decided for Kentucky and for Indiana separately.

| Quote (short) | Location | Concern | IDs | Reviewer |
|---|---|---|---|---|
| "## 3. Specialized Scraping & Material Waiver" / "Client signs a waiver releasing the Company from liability for fine hairline scratches on windows if glass has manufacturing defects or pre-existing debris under protective films." | Heading 3 and "Glass Scraping", orig. L17-L18 (30 section 5 row 30) | ATTORNEY REVIEW REQUIRED - DO NOT USE (02 C-CL04-05). Waiver and release that relies on pre-work glass evidence the SOP never collected; no waiver form exists; the SOP step calls scraping "safely" | C-CL04-05 (critical), X-17, X-02 | Attorney |
| "Late Interest: Late payments will accumulate interest at a rate of ... per month on outstanding balances." | "Late Interest", orig. L23 (30 section 5 row 73) | Late interest: consumer and commercial limits unknown; no owner payment-terms decision; a homeowner could sign these commercial terms | None registered; related C-CL04-11 | Attorney; CPA |
| "On-Site Safety: Client must ensure the site is safe, clear of structural hazards, and possesses active temporary or permanent electrical power and running water lines." | "On-Site Safety", orig. L15 (30 section 5 row 81) | Risk shifting: cannot replace HandyHub's own pre-start check (spec START-007; risk-triage playbook "Signing a checkbox cannot bypass an unresolved structural hazard."). Kept unchanged; it does not replace the SOP's area-release, power and water checks | C-CL04-04 (critical) | Attorney; qualified safety professional |
| "Chemical Use: Client approves the use of phosphoric acid treatments on industrial tile grout lines to lift grout haze." | "Chemical Use", orig. L19 (30 section 5 row 82) | Chemical authorization with no SOP step, SDS or compatibility control: CHEMICAL - SDS + REVIEWED SOP STEP REQUIRED; NOT ACTIVE (02 C-CL04-02). Whether acid grout-haze removal is offered at all is Q-31-08 | C-CL04-02 (critical) | Qualified safety professional; attorney |
| "This Commercial Service Agreement" | Opening sentence, orig. L4 (30 section 5 row 93) | Commercial scope wording with no commercial policy; insurance and tax treatment differ by customer type; the party placeholder lets a homeowner sign commercial terms (AUDIENCE UNDEFINED - ATTORNEY REVIEW) | X-23, C-CL04-11 | Owner; attorney; insurance broker; CPA |

### Placeholders to resolve
- `[Your Cleaning Company Name]` (orig. L4) -> registered legal entity name (not confirmed; Q-30-02); resolves from the company profile setting. "Cleaning Company" suggests a division name, which is an OPEN QUESTION (30 section 6). HUMAN REVIEW: attorney, CPA.
- `[Contractor / Developer / Property Owner Name]` (orig. L4) -> customer record (commercial) plus signer authority (AUTH-028); which customer types are offered (Q-30-04) and who may sign (Q-30-20) are owner and attorney decisions.
- Phase checkboxes `[ ]` (orig. L8-L11) -> options selected on the accepted estimate (spec EST-005; estimator).
- `[Amount]` (orig. L8-L11, written after a dollar sign) -> accepted estimate version (spec EST-004; owner and estimator); no placeholder may survive into a sent document (AGR-026).
- `[Sq. Ft / Sq. M]` (orig. L11) -> estimate quantities in square feet, with the area basis stated (28 section 3.3); the metric option is a legacy artifact (C-CL04-13).
- `[Net 15 / Net 30]` (orig. L22) -> payment-terms matrix (owner; HUMAN REVIEW: attorney, CPA; Q-30-09, Q-28-19).
- Signature and date lines (orig. L25-L26) -> acceptance record (AUTH-027); printed name, title and signer authority are missing. HUMAN REVIEW: attorney.
- Fields with no placeholder at all: project address and state; estimate number and version; phase dates or windows; document language; template version (X-01; 30 section 6; AGR-004).

### Flags for controlled cleanup (not edited)
- Reference to a nonexistent file: "`post-construction.md` micro-checklist" (orig. L7) - BROKEN SCOPE REFERENCE (C-CL04-09). No such file exists in the vault; the SOP file is `sop Post-Construction Cleaning Checklist.md`, titled "Post-Construction Micro-Checklist". Replaced only through the architecture change that takes scope from the accepted estimate (30 AGR-003; [36](../AI%20Development%20Plans/36-file-modification-plan.md) section 5.5 item 28), not corrected in place.
- Square-metre option: `[Sq. Ft / Sq. M]` (orig. L11) (C-CL04-13; 36 section 5.4 item 20). HUMAN REVIEW: attorney for any change to agreement text.
- Instrument name: "Master Service Agreement" in the H1 against "Commercial Service Agreement" in the opening sentence (orig. L1, L4); two names for one instrument (04 CL-04 aliases). HUMAN REVIEW: attorney.
- No AI citation residue, Arabic text or SAR amount was found in this template.

### Issues affecting this file
| ID | Severity | Issue (short) | Reviewer / owner |
|---|---|---|---|
| C-CL04-02 | critical | "Chemical Use" (orig. L19) authorizes phosphoric-acid treatment that no SOP step defines | HUMAN REVIEW: qualified safety professional (SDS and PPE) with the product manufacturer's instructions; attorney (authorization wording) |
| C-CL04-04 | critical | "On-Site Safety" (orig. L15) shifts site safety to the client, while the SOP lacked the card's stop-work controls; the clause cannot replace HandyHub's pre-start check | HUMAN REVIEW: qualified safety professional; attorney (client site-safety clause) |
| C-CL04-05 | critical | Glass-scratch waiver (orig. L17-L18) depends on pre-work evidence the SOP never collected | HUMAN REVIEW: attorney (Kentucky and Indiana separately) |
| C-CL04-09 | high | Scope incorporates a nonexistent `post-construction.md` (orig. L7) | Owner (scope decision); HUMAN REVIEW: attorney |
| C-CL04-11 | high | Commercial terms ("Commercial Service Agreement", net terms, monthly interest) while the service is marketed to homeowners and the party placeholder includes "Property Owner" | HUMAN REVIEW: attorney licensed in KY and IN; owner |
| C-CL04-08 | medium | The pricing file's high-ceiling surcharge has no line here; this template bills only checked milestones (orig. L7-L11) | Owner; HUMAN REVIEW: attorney |
| C-CL04-13 | medium | Square-metre option in the area placeholder (orig. L11) | Owner |
| X-01 | high | No agreement identifies the property, service date or accepted estimate version | HUMAN REVIEW: KY/IN attorney |
| X-02 | high | Pre-existing-condition clause (glass, orig. L18) depends on proof the SOP did not collect; the restructured SOP proposes a glass inspection with photos before any blade scraping, pending review | HUMAN REVIEW: KY/IN attorney |
| X-03 | high | Scope defined by reference to an editable internal file, here one that does not exist (orig. L7) | HUMAN REVIEW: KY/IN attorney |
| X-11 | high | No term addresses occupants, children or pets near active work | HUMAN REVIEW: qualified safety professional |
| X-16 | medium | A customer buying two services signs inconsistent terms; this template adds net terms and monthly late interest (orig. L22-L23) | HUMAN REVIEW: KY/IN attorney |
| X-17 | medium | Glass scraping carries opposite waivers in DW-04 and here (orig. L18) | HUMAN REVIEW: KY/IN attorney |
| X-23 | medium | Commercial scope wording without a commercial policy ("Commercial Service Agreement", orig. L4) | HUMAN REVIEW: attorney; CPA; insurance broker |

### Open questions
- **Q-30-04** (owner; HUMAN REVIEW: attorney): which customer types are offered at launch (homeowners, general contractors, developers), and so is a commercial CL-04 family needed, a consumer one, or both?
- **Q-30-09** (owner; HUMAN REVIEW: attorney, CPA): payment terms by customer type, including per-phase invoicing and net terms, and whether any late fee or interest applies, decided per state.
- **Q-30-11** (HUMAN REVIEW: attorney; insurance broker): should the glass-scratch waiver or any other limitation be used, and what pre-work evidence would it require?
- **Q-31-08** (owner and the relevant reviewers): is acid grout-haze removal offered at all, or referred out? The "Chemical Use" clause depends on the answer.
- **Q-04-07** (owner; HUMAN REVIEW: attorney): which single service scrapes construction glass, under which attorney-reviewed clause (X-17)?
- **Q-28-19** (owner; HUMAN REVIEW: attorney, CPA): for commercial customers, does the job minimum (spec BIZ-003, FIN-001) apply, and which net terms, retainage, late interest and exemption certificates apply?
- **Q-30-08** (owner; HUMAN REVIEW: attorney, CPA): deposit policy for large post-construction projects.
- **Q-30-07** (owner; HUMAN REVIEW: attorney): is any re-clean or callback policy offered for dust resettled by other trades? None is assumed.
- **Q-30-12** (owner; HUMAN REVIEW: insurance broker): what insurance is actually held, and how are certificate requests from general contractors handled?
- **Q-30-02** (owner; HUMAN REVIEW: attorney, CPA): registered legal entity and assumed name, and whether "Cleaning Company" is a separate entity or division.
- **Q-30-05** (HUMAN REVIEW: attorney): governing law, venue and dispute mechanism per property state.
- **30 section 8 rows 7, 10 and 23** (HUMAN REVIEW: attorney; CPA; insurance broker; Kentucky and Indiana separately): late-interest limits and disclosure; enforceability of the glass waiver; flow-down, indemnity, insurance certificates, retainage and payment timing with builders and developers.

### Revision history
| Date | Change | Author |
|---|---|---|
| 2026-10-03 | Added frontmatter, status callout (with legacy-artifact line) and review notes with template-family note, clause checklist, attorney-review list, placeholders and cleanup flags (R1, R2, R7, R3); original text unchanged | AI orchestrator (Claude) |
