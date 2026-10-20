---
title: "Service agreement - Air Duct & Ventilation Cleaning (CL-07)"
service_id: CL-07
service_slug: air-duct-cleaning
canonical_name: "Air Duct & Ventilation Cleaning"
category: "Cleaning"
doc_type: contract
status: template-draft
authority: supporting
owner_approved: false
human_review:
  - "attorney licensed in KY/IN"
  - "owner"
  - "licensed HVAC contractor"
  - "insurance broker"
registry: "AI Development Plans/04-service-registry.md#CL-07"
last_reviewed: 2026-10-03
---

# Service Agreement Skeleton: Air Duct & Ventilation Cleaning (CL-07)

> [!warning] Draft — not owner-approved
> Canonical service: **CL-07 — Air Duct & Ventilation Cleaning** · [Registry entry](../AI%20Development%20Plans/04-service-registry.md#CL-07)
> Draft, attorney review required, not for signature. DRAFT TEMPLATE — NOT LEGAL ADVICE. Must be reviewed and adapted by an attorney licensed in Kentucky and/or Indiana before any use. Placeholders such as [Your Company Name] must be replaced with the registered legal entity name (not yet confirmed). The review notes at the end are not part of the agreement text. See [30 Service agreement standards](../AI%20Development%20Plans/30-service-agreement-standards.md).
> Skeleton for attorney drafting; it contains no agreement wording.
> Newly created on 2026-10-03 because no CL-07 agreement existed (02 G-001). CL-07 is not bookable until an approved version is active (AGR-031).
> Review notes for this file: see "Review notes and cross-references" at the end.

*Structure only, as specified in [30 Service agreement standards](../AI%20Development%20Plans/30-service-agreement-standards.md) section 10.2 (PROPOSED DECISION D-30-08) and [36 File modification plan](../AI%20Development%20Plans/36-file-modification-plan.md) section 3.11 (D-36-12). The 25 headings below follow the clause order of 30 section 4.1. Under each heading there is only a source-of-truth line, placeholders in code format for the person who decides, and, where relevant, spec service-card text quoted verbatim as drafting input. Nothing below is agreement wording, and nothing creates or allocates an obligation. Whether this file becomes a standalone agreement (option A) or the CL-07 scope schedule (option B) is the attorney's choice (30 section 2.2; Q-30-03). Drafting limits are in "Must not contain" after clause 25.*

## 1. Parties and legal entity

- Source of truth: company profile setting - registered legal name, entity type, any assumed name used with "HandyHub", notice address (Q-30-02); customer and contact records, including the signer's capacity (ENT-001; AUTH-028).
- `<owner decision: registered legal entity, entity type and assumed name>` · `<ATTORNEY: party identification and who may sign for the customer (Q-30-20)>`

## 2. Property, date and estimate-version identification

- Source of truth: property, estimate and appointment records - service address and state, estimate number and version, scheduled date or window (EST-001; CX-003).
- `<ATTORNEY: identification block>`

## 3. Scope reference

- Source of truth: the lines and selected options of the accepted estimate version (EST-002; EST-005) plus a versioned CL-07 scope schedule rendered from the estimate snapshot (RECT-003). The pricing, SOP and inventory files are internal and are never incorporated by file name (30 section 3.2 rule 4; D-30-04).
- Input, spec CL-07.QAC (verbatim): "registers/accessible duct scope completed, debris controlled, filter installed if included, system restored, limitations and unresolved conditions documented"
- `<owner decision: governing pricing model and the register locations that count (C-CL07-09, C-CL07-V02; Q-28-20); whether filter replacement is included and who supplies the filter (Q-30-14)>` · `<ATTORNEY: scope-reference wording>`

## 4. Exclusions

- Source of truth: registry exclusions and permit/license flags ([04 CL-07](../AI%20Development%20Plans/04-service-registry.md#CL-07) "exclusions" and "permit/license flags" rows); spec CL-07.SAF; job-specific exclusions on the estimate (EST-003).
- Input, spec CL-07.SAF (verbatim): "system off/isolation per procedure; do not make unsupported indoor-air-quality claims; stop on suspected significant mold, asbestos-containing material, damaged ducts or scope requiring licensed HVAC work"
- `<owner decision with the licensed HVAC contractor: CL-07 exclusion list - the 04 CL-07 proposal names coil, blower and air-handler cleaning, plenum access openings and furnace connection, mold remediation, fogging, dryer-vent and commercial kitchen exhaust work (Q-30-14; Q-04-15)>` · `<ATTORNEY: exclusions wording>`

## 5. Customer responsibilities and preparation

- Source of truth: the CL-07 preparation checklist version (CX-005; BRF-005); none exists yet (04 CL-07 "customer preparation requirements", GAP). A customer-supplied filter needs a START-009 condition record (29 section 9.1).
- Input, spec CL-07.INT (verbatim): "HVAC system type, accessible registers/returns, reported concern, filter size, suspected mold/pest/contamination, equipment capability"
- `<owner decision: preparation checklist - the 04 CL-07 proposal lists access to registers, returns and the air handler; filter size; occupants or pets with respiratory sensitivity; acceptance of a power interruption; items near vents>` · `<ATTORNEY: wording that keeps HandyHub's own pre-start checks with HandyHub (30 section 4.1 clause 5)>`

## 6. Access

- Source of truth: property record; access-secret rules (AUTH-009; COM-002); no-access policy (SCH-008).
- `<owner decision: no-access policy and fee-schedule reference (Q-30-10)>` · `<ATTORNEY: access wording; codes are never printed in the document>`

## 7. Concealed and pre-existing conditions

- Source of truth: change-order workflow and concealed-condition rules (FIN-008; JOB-004; JOB-006); existing-condition photos where configured (START-008); referral policy (Q-30-15).
- `<ATTORNEY: hidden-condition clause, for example ducts or duct lining found damaged once grilles are removed (CL-07.SAF "damaged ducts")>` · `<owner decision: referral policy for conditions no catalog service covers (Q-30-15)>`

## 8. Hazardous-material discovery and stop-work

- Source of truth: hazard library; spec CL-07.SAF; customer-facing stop-work notice version (START-010; START-011; BRF-007).
- Input, spec CL-07.SAF (verbatim): "stop on suspected significant mold, asbestos-containing material, damaged ducts or scope requiring licensed HVAC work"
- `<owner decision: who arranges and pays for mold assessment or asbestos testing, and what is charged when work stops at the inspection (Q-28-05; Q-30-14; C-CL07-V03)>` · `<ATTORNEY: stop-work notice; customer acknowledgements never clear a safety hold (30 section 3.2 rule 6)>`

## 9. Change orders

- Source of truth: change-order workflow (FIN-008; JOB-005; STM-004; RECT-004).
- `<ATTORNEY: change-order mechanism; an add-on is offered only as an estimate option or an approved change order, and only once its SOP is active (28 PRC-042)>`

## 10. Schedule, weather and delays

- Source of truth: scheduling records (CX-002; SCH-007); safety holds (START-011).
- `<ATTORNEY: scheduling, delay and company-initiated rescheduling wording>`

## 11. Cancellation and reschedule

- Source of truth: cancellation, reschedule and no-access policy version (CX-006; Q-30-10); refund and credit policy version (Q-30-22).
- `<owner decision: cancellation, reschedule and refund policy>` · `<ATTORNEY: wording by policy reference>`

## 12. Term and termination (recurring or master relationships only)

- Source of truth: recurring-service policy (CX-006). No CL-07 file describes a recurring plan.
- `<owner decision: not applicable unless a recurring or commercial master relationship is offered (Q-30-04)>`

## 13. Price, minimum and tax reference

- Source of truth: the accepted estimate version (EST-004), priced from the owner-approved price book of [28 Pricing, estimating and job costing](../AI%20Development%20Plans/28-pricing-estimating-and-job-costing.md); the minimum rule (BIZ-003; FIN-001; CX-001); tax configuration by service and state. The vault pricing file is an unapproved benchmark and is never incorporated (D-28-21).
- Price in this template: `[per approved estimate]` only.
- `<owner decision: governing pricing model and approved values (C-CL07-09; Q-28-20); charge, if any, when work stops at the inspection (Q-28-05); tax treatment per CPA determination for Kentucky and Indiana (Q-28-12)>` · `<ATTORNEY: price-reference wording>`

## 14. Deposits and prepayment

- Source of truth: deposit policy (BIZ-006; FIN-002; HND-003; Q-30-08). A received check is not cleared money (owner facts 2026-10-02).
- `<owner decision: whether any deposit applies to CL-07 jobs; threshold, amount and timing are undecided (Q-28-09)>`

## 15. Payment terms and methods

- Source of truth: payment-terms matrix (28 section 3.10; D-28-26); accepted-methods setting - electronic invoice, cash and check; no payment provider is selected (BIZ-007; owner facts 2026-10-02).
- `<owner decision: payment timing>` · `<ATTORNEY: payment-terms wording without automatic charging>`

## 16. Late payment

- Source of truth: late-payment policy by customer type and state.
- `<ATTORNEY: whether any late fee or interest applies, decided for Kentucky and Indiana separately>`

## 17. Warranty and callback

- Source of truth: owner-approved warranty and callback policy version (CX-007; QA-010; Q-30-07). None exists.
- `<owner decision: whether any warranty or callback policy applies to CL-07; nothing is stated or implied here until it is approved>`

## 18. Limitation of liability, waivers, releases

- Source of truth: attorney decision; insurance actually held (Q-30-11; Q-30-12).
- `<ATTORNEY: whether any limitation is used at all; it must not contradict safety duties or rely on steps the SOP does not perform>`

## 19. Insurance and credential statements

- Source of truth: compliance register (02 G-010). None exists.
- `<ATTORNEY: no statement unless a current document in the compliance register supports it; the insurance broker confirms any statement>`

## 20. Photo and marketing consent separation

- Source of truth: consent records (REC-002; REC-003; COM-004). The draft SOP treats register, duct and equipment photos as internal operational records by default.
- `<ATTORNEY: operational photo notice; marketing use only with separate, optional consent>`

## 21. Privacy

- Source of truth: privacy notice version ([13 Privacy and data governance](../AI%20Development%20Plans/13-privacy-data-governance.md)); AUTH-009.
- `<ATTORNEY: privacy-notice reference>`

## 22. Dispute resolution

- Source of truth: complaint workflow (CX-007; QA-009).
- `<ATTORNEY: dispute mechanism (Q-30-05)>`

## 23. Governing law (KY vs IN)

- Source of truth: the property's state from the Property record (BIZ-001); each state is decided separately (30 section 8; D-30-11).
- `<ATTORNEY: governing law and venue per property state>`

## 24. Signatures and e-acceptance

- Source of truth: acceptance record; send authority in [27 Roles and permissions](../AI%20Development%20Plans/27-roles-and-permissions.md) (STG-005; CX-003; AUTH-027).
- `<ATTORNEY: acceptance method and evidence of HandyHub's own assent (Q-30-06)>`

## 25. Bilingual version precedence

- Source of truth: template translation records (COM-006; HND-006).
- `<ATTORNEY: which language controls (Q-30-13); Spanish only after review by a qualified bilingual reviewer>`

## Must not contain

*Drafting limits for the attorney and the owner (30 section 10.2 item 4; 36 section 3.11 item 4). Each item names a class of text; none of it is drafted here.*

- Indoor-air-quality, health or energy-saving claims (spec CL-07.SAF "do not make unsupported indoor-air-quality claims"; C-CL07-02).
- Mold-kill, sanitizing or "EPA-registered" product claims (C-CL07-01; C-CL07-03; 29 section 8.2 item 12).
- Any price, SAR amount, percentage, guarantee, warranty or insurance statement (30 section 3.1; D-30-06).
- Any waiver, release, indemnity or limitation-of-liability text; whether any is used at all is the attorney's decision under clause 18.
- Licensing, permit or code-compliance statements (30 section 3.2 rule 7).
- "Zero dust" or other absolute outcomes; the draft SOP's "zero residual dust particles" wording is flagged as not measurable (31 section 10 CL-07).
- Incorporation of the pricing, SOP or inventory files by file name (30 section 3.2 rule 4).
- Commercial kitchen exhaust work, plenum access holes or furnace connection, fogging and dryer-vent work stay out of this skeleton until Q-30-14 is answered and the SOP, the licensing review and the product (SDS) review support them; this holds them for decision and does not remove them from the owner's catalog (30 section 10.2 item 4).

---

## Review notes and cross-references (added 2026-10-03)

*Added during the AI orchestrator repository audit. This file is new; these notes are not part of any agreement text.*

**Related files:** [Registry entry](../AI%20Development%20Plans/04-service-registry.md#CL-07) · [Pricing](../Pricing/pricing-air-duct-cleaning.md) · [Inventory](../Required%20inventory/inventory-air-duct-cleaning.md) · [SOP](../Standard%20Of%20Operations/sop%20Air%20Duct%20and%20Vent%20Cleaning%20Checklist.md) · [Requirements spec (service card CL-07)](../Requierments/HandyHub_Requirements_Specification_Reconstructed.md) · [Main plan](../Main%20Plans/Cleaning%20Business.md) · [Gap analysis](../AI%20Development%20Plans/02-gap-analysis.md) · [30 Service agreement standards](../AI%20Development%20Plans/30-service-agreement-standards.md)

### Clause status

- [30](../AI%20Development%20Plans/30-service-agreement-standards.md) section 4.2 records "none" for CL-07 against all 25 clauses, because no agreement existed. Every clause above is a placeholder; none is drafted (FACT: 30 section 4.2, CL-07 column).
- Gap G-001 (no CL-07 agreement) is only partly addressed by this skeleton and stays open until an approved version exists; flags are not fixes (02 D-02-04).
- Pricing drift against this file cannot be checked yet: 30 section 7 records "No agreement, so nothing to reconcile" for CL-07.

### Issues affecting this file

| ID | Severity | Issue (short) | Reviewer / owner |
|---|---|---|---|
| C-CL07-01 | critical | Mold treated as routine work vs spec stop-work on suspected mold (clauses 4 and 8; "Must not contain") | Qualified mold assessor or remediation professional; attorney licensed in KY/IN; insurance broker; owner |
| C-CL07-03 | critical | Biocide fogging sold and stocked; no SOP step, SDS, label check or occupant controls (held out of this skeleton) | Qualified safety professional (hazard communication, SDS); state pesticide regulator and attorney (label and applicator credential); insurance broker |
| C-CL07-02 | high | Website promises clean air and lower energy bills; spec forbids unsupported indoor-air-quality claims ("Must not contain") | Attorney licensed in KY/IN; owner |
| C-CL07-04 | high | Dryer-vent cleaning priced with no SOP, inventory, plan or spec coverage (held out) | Owner (scope); qualified safety professional |
| C-CL07-05 | high | Commercial kitchen exhaust in pricing and inventory vs residential scope in plan and SOP (held out) | Local fire code official; insurance broker; attorney licensed in KY/IN |
| C-CL07-07 | high | Inventory and pricing imply plenum access holes and a furnace connection; SOP silent; spec stops on licensed HVAC scope (clause 4) | Licensing authority for the municipality; licensed HVAC contractor; attorney licensed in KY/IN |
| C-CL07-06 | medium | SOP cuts the home's main breaker while the procedure relies on powered equipment; no customer notice of a power interruption (clause 5) | Licensed HVAC contractor or electrician; qualified safety professional |
| C-CL07-08 | medium | Grilles removed but never reinstalled; spec QA requires scope completed and system restored (clause 3 input) | Owner |
| C-CL07-09 | medium | Two pricing models with no selection rule (clauses 3 and 13) | Owner |
| C-CL07-10 | medium | SAR currency and Arabic text in a USD, English/Spanish service; no currency or Arabic text appears in this file ("Must not contain") | Owner; qualified English/Spanish reviewer |
| C-CL07-V01 | medium | Dust-containment methods conflict between the SOP and the inventory (relevant to the clause 3 input "debris controlled") | Qualified safety professional; equipment manufacturer instructions; licensed HVAC contractor for any access openings |
| C-CL07-V03 | medium | The pricing file's base fee is charged for an "Inspection" and "testing system lines" that no SOP step performs (clauses 8 and 13) | Owner; qualified safety professional; licensed HVAC contractor for any system testing |
| C-CL07-V02 | low | Model A charges only wall registers; the SOP works on grilles on walls and ceilings (clause 3) | Owner |
| X-06 | high | Mold is excluded, cleaned routinely, sold as an outcome, billed as a change order and a spec stop-work trigger (clause 8) | Qualified mold assessor or industrial hygienist; attorney (claims) |
| X-07 | high | Utility isolation is inconsistent across SOPs, never verified and mostly unrestored; no company isolate-verify-restore rule (clause 5) | Qualified safety professional; licensed electrician or HVAC professional |
| X-09 | high | A chemical program across at least 16 services with no SDS, compatibility, storage, transport, spill or chemical-disposal rule (fogging held out) | Qualified safety professional |
| X-10 | high | No emergency kit in any inventory and no incident step in any SOP | Qualified safety professional |
| X-11 | high | No SOP or contract protects occupants, children or pets from active work hazards (clause 5) | Qualified safety professional |
| X-12 | high | Height tiers differ by service with no shared access standard; the CL-07 card flags ladder work | Qualified safety professional |
| X-23 | medium | Commercial scope wording in 8 services without a commercial policy (commercial kitchen exhaust held out) | Attorney licensed in KY/IN; CPA; insurance broker; owner |

### Open questions

- Q-30-14 (owner; licensed HVAC contractor; attorney): is CL-07 offered at launch? What is in scope versus licensed HVAC work, what is charged if work stops at the inspection, and are filters, dryer vents, fogging and commercial hoods offered?
- Q-30-15 (owner): what is the referral policy for concealed conditions that no catalog service covers, including mold remediation?
- Q-30-03 (attorney; owner): which agreement architecture (30 section 2.2), and so whether this file becomes a standalone agreement or the CL-07 scope schedule?
- Q-30-02 (owner; attorney, CPA): what is the registered legal entity?
- Q-28-05 (owner; attorney through 30): does any charge apply to an inspection-only visit, such as a CL-07 stop for suspected mold?
- Q-04-15 (owner; licensed HVAC contractor): is the hood and grille split between CL-02 and CL-07 confirmed, and are commercial hoods excluded?

### Revision history

| Date | Change | Author |
|---|---|---|
| 2026-10-03 | Created as a structure-only skeleton (R11 as refined by 36 D-36-12; 30 section 10.2): frontmatter, status callout with the two skeleton lines, 25 clause headings with source-of-truth lines and placeholders, "Must not contain" list and review notes; no agreement wording, amount, guarantee, warranty or waiver text | AI orchestrator (Claude) |
