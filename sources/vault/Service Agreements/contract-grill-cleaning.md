---
title: "Service agreement - Deep-Clean Barbecue & Grill Maintenance (HI-02)"
service_id: HI-02
service_slug: grill-cleaning
canonical_name: "Deep-Clean Barbecue & Grill Maintenance"
category: "Home Improvement"
doc_type: contract
status: template-draft
authority: supporting
owner_approved: false
human_review:
  - "attorney licensed in KY/IN"
  - "owner"
  - "insurance broker"
  - "licensed gas professional"
  - "qualified safety professional (chemical and gas clauses)"
registry: "AI Development Plans/04-service-registry.md#HI-02"
last_reviewed: 2026-10-03
---

# 📜 Service Agreement: Barbecue & Grill Deep-Cleaning

> [!warning] Draft — not owner-approved
> Canonical service: **HI-02 — Deep-Clean Barbecue & Grill Maintenance** · [Registry entry](../AI%20Development%20Plans/04-service-registry.md#HI-02)
> Draft, attorney review required, not for signature. DRAFT TEMPLATE — NOT LEGAL ADVICE. Must be reviewed and adapted by an attorney licensed in Kentucky and/or Indiana before any use. Placeholders such as [Your Company Name] must be replaced with the registered legal entity name (not yet confirmed). The review notes at the end are not part of the agreement text. See [30 Service agreement standards](../AI%20Development%20Plans/30-service-agreement-standards.md).
> Review notes for this file: see "Review notes and cross-references" at the end.

This Agreement governs the professional barbecue detailing and carbon-stripping services executed by **[Your Company Name]** ("Company") for **[Client Full Name]** ("Client").

## 1. Scope of Service & Chemical Usage
* **Inclusions:** Full system tear-down, chemical bath soaking, cookbox scraping, and exterior stainless steel buffing as outlined in `sop-grill-cleaning.md`.
* **Eco-Chemical Consent:** Client approves the use of industrial-strength carbon-stripping agents and degreasers on cooking surfaces. The Company warrants that all chemicals used are completely non-toxic and food-surface safe post-rinsing.
* **Pre-existing Defects:** Deep cleaning strips away built-up grease layers that may have been masking pre-existing structural issues (such as rusted-through burner tubes, cracked flavorizer bars, or decayed heat shields). The Company is not liable for structural component failures discovered during deep grease extraction.

## 2. Billing & Gas Shut-off Requirement
* **Agreed Flat Fee:** The fixed total for this detailing event is **\$[Amount]**.
* **Gas Isolation:** Client agrees to grant access to the main gas line safety shut-off valve or propane tank regulator before operations begin.

**Client Signature:** _______________________  **Date:** _______________
**Company Representative Signature:** ______________________  **Date:** _______________

---

## Review notes and cross-references (added 2026-10-03)

*Added during the AI orchestrator repository audit. Not part of the original content and not part of the agreement text; the agreement text above is unchanged.*

**Related files:** [Registry entry](../AI%20Development%20Plans/04-service-registry.md#HI-02) · [Pricing](../Pricing/pricing-grill-cleaning.md) · [Inventory](../Required%20inventory/inventory-grill-cleaning.md) · [SOP](../Standard%20Of%20Operations/sop-grill-cleaning.md) · [Requirements spec (service card HI-02)](../Requierments/HandyHub_Requirements_Specification_Reconstructed.md) · [Main plan](../Main%20Plans/Home%20Improvement%20Business.md) · [Gap analysis](../AI%20Development%20Plans/02-gap-analysis.md)

### Clause checklist (per 30 Service agreement standards)

*Statuses copy the HI-02 column of [30 Service agreement standards](../AI%20Development%20Plans/30-service-agreement-standards.md) section 4.2 (0 present, 4 partial, 5 present with conflicts, 15 missing, 1 not applicable). The checklist describes what an attorney must decide; it is not clause wording.*

| # | Clause (30 section 4.1) | Status in this template | Note (IDs) |
|---|---|---|---|
| 1 | Parties and legal entity | partial | "[Your Company Name]" and "[Client Full Name]" placeholders (orig. L4); registered entity not confirmed (Q-30-02); signer authority not stated |
| 2 | Property, date and estimate-version identification | missing | No service address, scheduled date or accepted estimate version (X-01) |
| 3 | Scope reference | present - conflicts (C-HI02-05, C-HI02-V01, X-03) | "Inclusions" (orig. L7): "Full system tear-down" is broader than the SOP's disassembly list (C-HI02-05); burner purging, which both pricing tiers include and the SOP performs, is not named (C-HI02-V01); scope is incorporated by the internal file name `sop-grill-cleaning.md`, an unapproved draft that is not field-approved (X-03) |
| 4 | Exclusions | missing | No exclusions; the registry lists parts replacement, gas valve, regulator, hose or manifold repair, igniter or electrical repair and fuel types out of scope as owner questions (04 HI-02 "exclusions") |
| 5 | Customer responsibilities and preparation | partial | "Gas Isolation" (orig. L13) only; no grill-off-and-cool, clear work area, water or power access, or pets and occupants item (X-11; 04 HI-02 "customer preparation requirements") |
| 6 | Access (incl. no-access charges) | partial | "Gas Isolation" (orig. L13) gives access to the shut-off valve or regulator; no access method, site contact or no-access rule |
| 7 | Concealed and pre-existing conditions | present - conflicts (C-HI02-08, X-02, X-15) | "Pre-existing Defects" (orig. L9) relies on prior-condition evidence that the SOP did not collect before this edit pass (SOP holds now proposed); no stop, document, notify and change-order path (X-15) |
| 8 | Hazardous-material discovery and stop-work | missing | No customer-facing stop-work notice, although gas connections and chemical exposure are card hazards (spec HI-02.HAZ) |
| 9 | Change orders | missing | No change-order term, including for any switch to the pricing file's hourly mode (C-HI02-06; FIN-008) |
| 10 | Schedule, weather and delays | missing | - |
| 11 | Cancellation and reschedule | missing | Cancellation and no-access policy undecided (Q-30-10) |
| 12 | Term and termination (recurring or master relationships only) | n/a | One-time service |
| 13 | Price, minimum and tax reference | present - conflicts (C-HI02-06) | "Agreed Flat Fee" (orig. L12) is a fixed total only, while the pricing file also bills hourly; no minimum disclosure (CX-001) or tax reference; the pricing file's "Chemical Surcharge" is absent (Q-28-21) |
| 14 | Deposits and prepayment | missing | Deposit policy undecided (Q-30-08) |
| 15 | Payment terms and methods | missing | No due date or accepted methods (electronic invoice, cash, check per owner facts 2026-10-02) |
| 16 | Late payment | missing | - |
| 17 | Warranty and callback | present - conflicts (C-HI02-01, C-HI02-02) | "Eco-Chemical Consent" (orig. L8) contains an express chemical warranty with no product list or SDS; its food-safety condition ("post-rinsing") depends on a rinse step the SOP lacked (C-HI02-02); no workmanship warranty or callback policy exists (Q-30-07) |
| 18 | Limitation of liability, waivers, releases | present - conflicts (C-HI02-08, X-02) | "Pre-existing Defects" disclaimer (orig. L9) relies on prior-condition evidence (Q-30-11) |
| 19 | Insurance and credential statements | missing | None present; none may be added without a supporting compliance record (Q-30-12) |
| 20 | Photo and marketing consent separation | missing | Arrival and after photos are proposed in the SOP; no consent wording (REC-003) |
| 21 | Privacy | missing | - |
| 22 | Dispute resolution | missing | - |
| 23 | Governing law (KY vs IN) | missing | Decided per property state by the attorney (Q-30-05) |
| 24 | Signatures and e-acceptance | partial | Blank signature and date lines (orig. L15-L16); no printed name, title, signer authority or e-acceptance (Q-30-06) |
| 25 | Bilingual version precedence | missing | No Spanish version (Q-30-13) |

### Clauses requiring attorney review

*Rows 2, 33 and 86 of the 30 section 5 risky-clause register. Quoted to flag them, not to adopt them; disposition (keep, revise or remove) is an attorney and owner decision.*

| Quote (short) | Location | Concern | IDs | Reviewer |
|---|---|---|---|---|
| "Client approves the use of industrial-strength carbon-stripping agents and degreasers on cooking surfaces. The Company warrants that all chemicals used are completely non-toxic and food-surface safe post-rinsing." | "Eco-Chemical Consent", orig. L8 (30 section 5 row 2) | Express warranty (chemical safety): no product list or SDS; the same line consents to industrial strippers; the SOP has no rinse step | C-HI02-01 (critical), C-HI02-02 (critical) | Attorney licensed in KY/IN; qualified safety professional (SDS) |
| "The Company is not liable for structural component failures discovered during deep grease extraction." | "Pre-existing Defects", orig. L9 (30 section 5 row 33) | Limitation for pre-existing defects; no arrival inspection or photos to show the prior condition | C-HI02-08, X-02 | Attorney licensed in KY/IN |
| "Client agrees to grant access to the main gas line safety shut-off valve or propane tank regulator before operations begin." | "Gas Isolation", orig. L13 (30 section 5 row 86) | Customer duty enabling gas isolation; no fuel-restore or leak-check step after reassembly | C-HI02-03 (critical) | Licensed gas professional; qualified safety professional; attorney licensed in KY/IN |

### Jurisdiction questions for the attorney (Kentucky and Indiana separately)

*Questions from 30 section 8, not conclusions; each is answered for Kentucky and for Indiana, and per municipality where it matters.*

- Row 3: does either state, or a municipality served, prescribe licenses, registrations, required contract contents or notices for home-improvement agreements, in particular where the customer permission in "Gas Isolation" (orig. L13) touches gas? (Attorney; local licensing authority; permit office.)
- Row 16: which tasks near the gas supply need a licensed gas professional in each state and municipality? (Licensing authority; licensed trades.)
- Row 26: do each state's rules on unfair or deceptive practices reach product-safety statements in a signed agreement, such as "completely non-toxic" (orig. L8), and what substantiation must be on file? (Attorney.)

### Placeholders to resolve

- [Your Company Name] (orig. L4) -> registered legal entity name, from the company profile setting (not confirmed; Q-30-02; HUMAN REVIEW: attorney, CPA).
- [Client Full Name] (orig. L4) -> customer record plus signer authority (AUTH-028); who may sign is an attorney decision (Q-30-20).
- [Amount] in "Agreed Flat Fee" (orig. L12, written with an escaped dollar sign) -> the accepted estimate version (owner and estimator); no amount is set in this file.
- Signature and date lines (orig. L15-L16) -> acceptance record (AUTH-027); HUMAN REVIEW: attorney.
- Fields with no placeholder at all (the AGR-004 identification block): service address and state, estimate number and version, scheduled date or window, printed names, titles and signer authority, document language, template version (X-01).

### Flags for controlled cleanup (not edited)

- Scope incorporates an internal file by name: `sop-grill-cleaning.md` (orig. L7). The file exists but is an unapproved draft SOP; the reference is replaced only through the agreement architecture change (AGR-003; X-03). No link is added inside clause text.
- The clause lead-in "Eco-Chemical Consent" (orig. L8) carries an environmental claim; its disposition follows the clause (C-HI02-01).
- None found in this file: AI citation residue, probable typos inside clauses, square-metre options.

### Issues affecting this file

| ID | Severity | Issue (short) | Reviewer / owner |
|---|---|---|---|
| C-HI02-01 | critical | Contract warrants "completely non-toxic" chemicals while the program uses industrial-strength strippers ("Eco-Chemical Consent", orig. L8) | Attorney licensed in KY/IN; qualified safety professional (SDS and hazard communication) |
| C-HI02-02 | critical | Contract makes food safety depend on rinsing; SOP has no rinse/dry step | Qualified safety professional; product label directions |
| C-HI02-05 | medium | Contract promises "Full system tear-down"; SOP and spec limit disassembly | Attorney licensed in KY/IN; qualified gas appliance technician |
| C-HI02-06 | medium | Pricing bills hourly for neglected/commercial units; contract only supports a fixed flat fee | Owner; attorney licensed in KY/IN |
| C-HI02-08 | medium | Pre-existing-defect liability disclaimer with no pre-inspection or arrival photos | Attorney licensed in KY/IN |
| C-HI02-V01 | medium | The agreement's inclusions omit burner purging, which every pricing tier includes and the SOP performs | Owner; attorney licensed in KY/IN |
| X-01 | high | No agreement identifies the property, service date or accepted estimate version | Attorney licensed in KY/IN |
| X-02 | high | Pre-existing-condition clauses in at least 13 contracts depend on proof that only one SOP (CL-05) collects | Attorney licensed in KY/IN |
| X-03 | high | Contract scope is defined by reference to unapproved, editable internal files | Attorney licensed in KY/IN |
| X-11 | high | No SOP or contract protects occupants, children or pets from active work hazards | Qualified safety professional |
| X-15 | medium | Concealed-condition handling is written eight ways across 11 contracts | Attorney licensed in KY/IN |

### Open questions

- Q-30-07 (owner; attorney; quality assistant): what warranty and callback policy applies to HI-02, if any? Until then no warranty statement is approved, including the chemical warranty in "Eco-Chemical Consent".
- Q-30-11 (attorney; insurance broker): should any limitation of liability, waiver or release be used, and how does it interact with the insurance actually held?
- Q-30-02 (owner; attorney, CPA): what is the registered legal entity that replaces "[Your Company Name]"?
- Q-31-08 (owner and relevant reviewers): is burner-port clearing offered at all? The answer decides whether burner purging belongs in the scope (C-HI02-V01).
- Q-28-21 (owner): is the pricing file's "Chemical Surcharge" an internal cost or a customer add-on that the agreement would have to show?

### Revision history

| Date | Change | Author |
|---|---|---|
| 2026-10-03 | Added frontmatter, status callout and review notes; original text unchanged | AI orchestrator (Claude) |
| 2026-10-03 | Independent review (2026-10-04): cleanup flag now calls "Eco-Chemical Consent" a clause lead-in, not a heading; agreement text unchanged | AI reviewer (Claude) |
