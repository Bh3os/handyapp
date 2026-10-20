---
title: "Service agreement - Airbnb Turnover & Vacation Rental Management (CL-05)"
service_id: CL-05
service_slug: airbnb-turnover
canonical_name: "Airbnb Turnover & Vacation Rental Management"
category: "Cleaning"
doc_type: contract
status: template-draft
authority: supporting
owner_approved: false
human_review:
  - "attorney licensed in KY/IN"
  - "owner"
  - "insurance broker"
  - "privacy owner (photos, access codes)"
registry: "AI Development Plans/04-service-registry.md#CL-05"
last_reviewed: 2026-10-03
---

# 📜 Operational Agreement: Airbnb & Vacation Rental Turnover

> [!warning] Draft — not owner-approved
> Canonical service: **CL-05 — Airbnb Turnover & Vacation Rental Management** · [Registry entry](../AI%20Development%20Plans/04-service-registry.md#CL-05)
> Draft, attorney review required, not for signature. DRAFT TEMPLATE — NOT LEGAL ADVICE. Must be reviewed and adapted by an attorney licensed in Kentucky and/or Indiana before any use. Placeholders such as [Your Company Name] must be replaced with the registered legal entity name (not yet confirmed). The review notes at the end are not part of the agreement text. See [30 Service agreement standards](../AI%20Development%20Plans/30-service-agreement-standards.md).
> Review notes for this file: see "Review notes and cross-references" at the end.


This Operational Service Agreement is executed between **[Your Cleaning Company Name]** ("Company") and **[Host / Property Manager Name]** ("Client") for ongoing turnover management.

## 1. The Fast-Turnover Window
* **Operational Timeline:** Company guarantees completion of turnover protocols within the standard hospitality window of **11:00 AM to 3:00 PM** on checkout days, provided immediate property access is given.
* **Delay Surcharge:** If checkout is delayed by the host's guests, preventing entry past 11:15 AM, a **\$45 / hour waiting fee** will be charged to offset cleaner downtime.

## 2. Scope & Staging Protocol
* **Standard Turnover:** Follows the full criteria inside `airbnb-turnover.md` (Inspection + Linen Rotation + Cleaning + Amenity Restocking + Photo Documentation).
* **Inventory Logistics:** Client is responsible for procuring and storing all restock items (soaps, toilet rolls, coffee pods) in a locked supply closet on site. Company will manage restocking execution.

## 3. Damage Reporting & Photo Indemnity
* **Damage Scan:** Cleaners will conduct a visual scan during the first 10 minutes. If damages are discovered, photos will be sent instantly to the Client.
* **Platform Evidence:** The Company provides high-resolution photographic proof of completion for every turnover. Company is not liable for subsequent damages caused by incoming guests post-cleaning closure.

## 4. Flat Rates & Billing Logistics
* **Flat Rate Schedule:**
	* [Layout Size 1]: **\$[Amount]** per turnover event.
	* [Layout Size 2]: **\$[Amount]** per turnover event.
* **Billing Cycle:** Invoices are compiled weekly and billed automatically to the credit card or payment channel authorized on file every **[Monday / Friday]**.

**Client (Host) Signature:** _______________________  **Date:** _______________
**Company Signature:** ______________________  **Date:** _______________

---

## Review notes and cross-references (added 2026-10-03)

*Added during the AI orchestrator repository audit. Not part of the original content; original text above is unchanged.* These notes are not part of the agreement text and change no clause, amount, heading, numbering or signature line.

**Related files:** [Registry entry](../AI%20Development%20Plans/04-service-registry.md#CL-05) · [Pricing](../Pricing/pricing-airbnb-turnover.md) · [Inventory](../Required%20inventory/inventory-airbnb-turnover.md) · [SOP](../Standard%20Of%20Operations/sop%20Airbnb%20Cleaning%20and%20Turnover%20Checklist.md) · [Requirements spec (service card CL-05)](../Requierments/HandyHub_Requirements_Specification_Reconstructed.md) · [Main plan](../Main%20Plans/Cleaning%20Business.md) · [Gap analysis](../AI%20Development%20Plans/02-gap-analysis.md)

### Clause checklist (per 30 Service agreement standards)

*Statuses copy the CL-05 column of [30](../AI%20Development%20Plans/30-service-agreement-standards.md) section 4.2 (0 present, 3 partial, 8 present with conflicts, 14 missing, 0 not applicable). "Present" means draft text exists, unapproved and still subject to attorney review. Nothing in the agreement body was changed.*

| # | Clause (30 section 4.1) | Status in this template | Note (IDs) |
|---|---|---|---|
| 1 | Parties and legal entity | partial | Preamble (orig. L4): `[Your Cleaning Company Name]` and `[Host / Property Manager Name]` placeholders only; no entity type, notice address or capacity. A host or property manager may act for an owner, so authority to approve and sign must be recorded (Q-30-20; [27](../AI%20Development%20Plans/27-roles-and-permissions.md) AUTH-028, PROPOSED); contracting entity Q-30-02 |
| 2 | Property, date and estimate-version identification | missing | No property address, turnover schedule or accepted estimate version (X-01) |
| 3 | Scope reference | present - conflicts (C-CL05-09, X-03, C-CL05-V01, C-CL05-07) | "Standard Turnover" (orig. L11) incorporates `airbnb-turnover.md`, which does not exist (C-CL05-09), and defines scope by an internal, editable file (X-03); its "Cleaning" element points to an SOP whose only kitchen cleaning step is the fridge, while the main plan sells "Deep cleaning kitchens and bathrooms" (C-CL05-V01). The preamble's "ongoing turnover management" (orig. L4) leaves the "Vacation Rental Management" part of the canonical name undefined, and the pricing file's co-hosting offer has no clause (C-CL05-07) |
| 4 | Exclusions | missing | No exclusion list. Candidate exclusions are owner decisions in [04](../AI%20Development%20Plans/04-service-registry.md#CL-05) (exclusions row, PROPOSED): repairs, pest treatment, biohazard remediation, deep cleaning (CL-02), pool cleaning, guest communication, co-hosting until legal review. The "not liable for subsequent damages" sentence (orig. L16) is a liability limitation, not a scope exclusion |
| 5 | Customer responsibilities and preparation | present - conflicts (C-CL05-05, X-22, X-11) | "Inventory Logistics" (orig. L12): the client procures and stores restock items in a locked supply closet on site, while the pricing file's "Option B" and the inventory file have HandyHub buy or stock them (C-CL05-05; Q-29-13); no acceptance, defect or liability rule for host-supplied restock (X-22). No preparation checklist for linens, laundry facilities, trash location, welcome book, damage-report rule, guest-property rule or access-code policy (spec CL-05.INT; 04 CL-05 customer preparation requirements); occupants and pets not addressed (X-11) |
| 6 | Access | present - conflicts (C-CL05-02, C-CL05-04) | "Operational Timeline" (orig. L7) makes the window conditional on "immediate property access", and "Delay Surcharge" (orig. L8) charges for waiting when guests delay entry, with a trigger that differs from the pricing file's "Late Checkout Delay Fine" (C-CL05-04). No access method, key or lockbox handling, or code protection (spec CL-05.SAF "protect access codes"; COM-002; [27](../AI%20Development%20Plans/27-roles-and-permissions.md) AUTH-009, PROPOSED) |
| 7 | Concealed and pre-existing conditions | missing | "Damage Scan" (orig. L15) reports damage to the client but sets no stop, change-order or referral path for damage or urgent maintenance (spec CL-05.SAF "escalate biohazard/damage; verify lockup and urgent maintenance"; JOB-004, FIN-008; Q-30-15) |
| 8 | Hazardous-material discovery and stop-work | missing | No stop-work notice, although the card lists sharps and biohazard (spec CL-05.HAZ) and the completion window has no stop-work carve-out (C-CL05-02) |
| 9 | Change orders | missing | No change-order clause for extra tasks or the "extreme mess" the SOP photographs (spec FIN-008, JOB-005; Q-28-16) |
| 10 | Schedule, weather and delays | present - conflicts (C-CL05-02) | "Operational Timeline" (orig. L7): one fixed window for every property, against the per-property checkout and check-in times of spec CL-05.INT and the pricing file's longest turnover time; no capacity limit for two employees, no remedy and no stop-work carve-out |
| 11 | Cancellation and reschedule | missing | No term for a host cancelling a scheduled turnover, a guest cancellation or a failed access (Q-30-10) |
| 12 | Term and termination (recurring or master only) | missing | "ongoing turnover management" (orig. L4) is a recurring relationship with no term, renewal, termination notice or price-change rule; [30](../AI%20Development%20Plans/30-service-agreement-standards.md) section 4.1 clause 12 names CL-05 (Q-28-18) |
| 13 | Price, minimum and tax reference | present - conflicts (C-CL05-14, C-CL05-03) | "Flat Rate Schedule" (orig. L19-L21): two layout slots against four property types in the pricing file; the rush charge and the pricing file's "Option A" and "Option B" are absent (C-CL05-14). No disclosure of the \$150 minimum (spec CX-001), while the pricing file's smaller turnover fees fall below it (C-CL05-03; Q-28-04); no tax reference |
| 14 | Deposits and prepayment | missing | None; spec FIN-002 says the system must not assume every job requires a deposit (Q-30-08) |
| 15 | Payment terms and methods | present - conflicts (C-CL05-06) | "Billing Cycle" (orig. L22): automatic weekly billing to a card or payment channel on file, while no payment provider is selected and cash and checks are accepted (owner facts 2026-10-02; spec FIN-003 to FIN-005; Q-30-09, Q-28-10) |
| 16 | Late payment | missing | - |
| 17 | Warranty and callback | present - conflicts (C-CL05-02) | "Operational Timeline" (orig. L7): "Company guarantees completion of turnover protocols", with no remedy; no re-clean or callback policy exists for host or guest complaints (Q-30-07; spec CX-007, QA-010) |
| 18 | Limitation of liability, waivers, releases | present - conflicts (30 section 5 row 42) | The heading "Damage Reporting & Photo Indemnity" (orig. L14) labels a limitation as an indemnity; "Platform Evidence" (orig. L16) excludes liability for damage by incoming guests; nothing addresses damage caused by cleaners (Q-30-11) |
| 19 | Insurance and credential statements | missing | None made; none may be added without a document in the compliance register (Q-30-12). Custody of keys and codes and coverage for damage caused by cleaners are insurance broker questions ([04](../AI%20Development%20Plans/04-service-registry.md#CL-05) permit/license flags) |
| 20 | Photo and marketing consent separation | partial | "Damage Scan" and "Platform Evidence" (orig. L15-L16) promise damage photos "sent instantly" and "high-resolution photographic proof of completion for every turnover", with no photo class, channel or retention and no separate marketing consent (spec REC-002, REC-003; [27](../AI%20Development%20Plans/27-roles-and-permissions.md) AUTH-034, PROPOSED; Q-27-16) |
| 21 | Privacy | missing | No privacy notice; access codes, interior photos and guest property are not addressed (spec COM-002; AUTH-009; [30](../AI%20Development%20Plans/30-service-agreement-standards.md) section 8 row 19) |
| 22 | Dispute resolution | missing | - |
| 23 | Governing law (KY vs IN) | missing | Q-30-05 |
| 24 | Signatures and e-acceptance | partial | Blank client (host) and company signature and date lines (orig. L24-L25); no printed name, title, signer authority for a host or property manager (Q-30-20) or e-acceptance (Q-30-06) |
| 25 | Bilingual version precedence | missing | No Spanish version (Q-30-13) |

### Clauses requiring attorney review
| Quote (short) | Location | Concern | IDs | Reviewer |
|---|---|---|---|---|
| "Company guarantees completion of turnover protocols within the standard hospitality window of 11:00 AM to 3:00 PM on checkout days, provided immediate property access is given." | "Operational Timeline" clause, orig. L7 ([30](../AI%20Development%20Plans/30-service-agreement-standards.md) section 5 row 3) | Service-level guarantee with no remedy, capacity limit or stop-work carve-out; the pricing file allows "5+ Hours" for its largest property type; two employees; time pressure is a card hazard (spec CL-05.HAZ) | C-CL05-02 (critical) | HUMAN REVIEW: attorney licensed in KY/IN; owner (capacity) |
| "## 3. Damage Reporting & Photo Indemnity" / "Company is not liable for subsequent damages caused by incoming guests post-cleaning closure." | Clause 3 heading and "Platform Evidence" clause, orig. L14, L16 ([30](../AI%20Development%20Plans/30-service-agreement-standards.md) section 5 row 42) | "Indemnity" label over a limitation; the label does not match the content; nothing covers damage caused by cleaners | - | HUMAN REVIEW: attorney licensed in KY/IN; privacy owner (photos); insurance broker |
| "If checkout is delayed by the host's guests, preventing entry past 11:15 AM, a ... waiting fee will be charged to offset cleaner downtime." | "Delay Surcharge" clause, orig. L8 ([30](../AI%20Development%20Plans/30-service-agreement-standards.md) section 5 row 60) | The pricing file calls it a "Late Checkout Delay Fine" with a different trigger; billing increment and effect on the completion window undefined; whether such a fixed charge is permitted and how it must be disclosed is a question for Kentucky and Indiana separately ([30](../AI%20Development%20Plans/30-service-agreement-standards.md) section 8 row 6) | C-CL05-04 | Owner; HUMAN REVIEW: attorney licensed in KY/IN |
| "Billing Cycle: Invoices are compiled weekly and billed automatically to the credit card or payment channel authorized on file every [Monday / Friday]." | "Billing Cycle" clause, orig. L22 ([30](../AI%20Development%20Plans/30-service-agreement-standards.md) section 5 row 76) | Automatic billing while no payment provider is selected; cash and check are accepted; consent, disclosure and cancellation rules for recurring charges are a question for each state ([30](../AI%20Development%20Plans/30-service-agreement-standards.md) section 8 row 8) | C-CL05-06 | HUMAN REVIEW: attorney licensed in KY/IN; bookkeeper; payment provider once selected |
| "Follows the full criteria inside `airbnb-turnover.md` (Inspection + Linen Rotation + Cleaning + Amenity Restocking + Photo Documentation)." | "Standard Turnover" clause, orig. L11 (register flag, not a 30 section 5 row) | Scope defined by a file name that does not exist, and by an internal, editable SOP; the "Cleaning" element has no kitchen standard beyond the fridge | C-CL05-09, X-03, C-CL05-V01 | HUMAN REVIEW: attorney licensed in KY/IN; owner (scope) |
| "Client is responsible for procuring and storing all restock items (soaps, toilet rolls, coffee pods) in a locked supply closet on site. Company will manage restocking execution." | "Inventory Logistics" clause, orig. L12 (register flag, not a 30 section 5 row) | Conflicts with the inventory file's HandyHub restock stock and the pricing file's purchasing "using the owner's budget"; no acceptance, defect or liability rule for host-supplied restock | C-CL05-05, X-22 | Owner; HUMAN REVIEW: attorney licensed in KY/IN; CPA |
| "photos will be sent instantly to the Client." / "The Company provides high-resolution photographic proof of completion for every turnover." | "Damage Scan" and "Platform Evidence" clauses, orig. L15-L16 ([30](../AI%20Development%20Plans/30-service-agreement-standards.md) section 8 row 19) | Timing and evidence commitments with no approved photo channel, classification or retention; the SOP's photo-delivery steps are held until the channel decision ([27](../AI%20Development%20Plans/27-roles-and-permissions.md) Q-27-16; AUTH-034, PROPOSED) | - | HUMAN REVIEW: attorney licensed in KY/IN; privacy owner |
| "for ongoing turnover management" | Preamble, orig. L4 ([30](../AI%20Development%20Plans/30-service-agreement-standards.md) section 8 row 24) | The "Vacation Rental Management" part of the canonical name and the pricing file's co-hosting offer have no defined scope here; whether acting as a property manager or co-host triggers licensing or trust-account rules is a question for each state | C-CL05-07 | HUMAN REVIEW: attorney licensed in KY/IN; licensing authority; CPA |

### Placeholders to resolve
- `[Your Cleaning Company Name]` (orig. L4) -> registered legal entity name, from the company profile setting (contracting entity; not confirmed; Q-30-02). HUMAN REVIEW: attorney, CPA.
- `[Host / Property Manager Name]` (orig. L4) -> customer record plus an authority flag, because a host or property manager may act for an owner; who may sign is an attorney decision (Q-30-20; [27](../AI%20Development%20Plans/27-roles-and-permissions.md) AUTH-028, PROPOSED).
- `[Layout Size 1]`, `[Layout Size 2]` and `$[Amount]` (orig. L20-L21) -> estimate lines per property type (the pricing file has four types, C-CL05-14); amounts from the accepted estimate version (owner and estimator; [30](../AI%20Development%20Plans/30-service-agreement-standards.md) section 6).
- `[Monday / Friday]` (orig. L22) -> billing day from the payment-terms matrix; no payment provider is selected (Q-30-09).
- Signature and date lines (orig. L24-L25) -> acceptance record ([27](../AI%20Development%20Plans/27-roles-and-permissions.md) AUTH-027, PROPOSED); printed names, titles and signer authority are missing (HUMAN REVIEW: attorney).
- Fields with no placeholder at all: property address or addresses and state, estimate number and version, turnover schedule, customer contact and notice address, language of the document, template version and effective date, acceptance method and consent record ([30](../AI%20Development%20Plans/30-service-agreement-standards.md) section 6; AGR-004, PROPOSED; X-01).

### Flags for controlled cleanup (not edited)
- Reference to a file that does not exist: `airbnb-turnover.md` in the "Standard Turnover" clause (orig. L11). [34](../AI%20Development%20Plans/34-naming-and-migration-plan.md) maps this reference to the SOP's planned name in step 2.9, which waits for the slug decision (Q-32-09); renaming does not approve incorporating an unapproved, editable SOP by file name (X-03; C-CL05-09). It is replaced only through the versioned scope-schedule change (AGR-003); no link is added inside clause text ([36](../AI%20Development%20Plans/36-file-modification-plan.md) section 3.7 rule 5).
- The heading "Damage Reporting & Photo Indemnity" (orig. L14) does not match its content; any heading change is the attorney's.
- The H1 ("Operational Agreement: Airbnb & Vacation Rental Turnover") and the preamble's "Operational Service Agreement" differ from the canonical name; the frontmatter `title` follows the [36](../AI%20Development%20Plans/36-file-modification-plan.md) section 3.1 pattern, and use of the "Airbnb" mark is an attorney question ([32](../AI%20Development%20Plans/32-website-and-customer-experience.md) Q-32-09).
- No square-metre option, AI citation residue or Arabic text in this file.

### Issues affecting this file
| ID | Severity | Issue (short) | Reviewer / owner |
|---|---|---|---|
| C-CL05-02 | critical | Contract guarantees 11:00-3:00 completion, but pricing allows 5+ hour turnovers and the card uses per-property times ("Operational Timeline" clause) | HUMAN REVIEW: attorney; owner (capacity) |
| C-CL05-03 | high | Studio and 2-bedroom flat turnover fees are below the \$150 minimum; this template prices "per turnover event" and does not disclose the minimum ("Flat Rate Schedule") | Owner (authorized administrator) |
| C-CL05-06 | high | Automatic card-on-file billing vs no payment provider and cash/check acceptance ("Billing Cycle" clause) | HUMAN REVIEW: attorney; bookkeeper; owner |
| C-CL05-07 | high | Co-hosting/property-management revenue-share offer is absent from contract, SOP and card (preamble "ongoing turnover management") | HUMAN REVIEW: attorney (KY and IN licensing applicability); CPA |
| C-CL05-09 | high | Contract scope incorporates a nonexistent `airbnb-turnover.md` ("Standard Turnover" clause) | HUMAN REVIEW: attorney |
| C-CL05-V01 | high | Main plan sells "deep cleaning" of kitchens; the SOP's only kitchen cleaning step is the fridge ("Cleaning" element of "Standard Turnover") | Owner |
| C-CL05-05 | medium | Restock supplies: client procures vs HandyHub buys and stocks ("Inventory Logistics" clause) | Owner; CPA; HUMAN REVIEW: attorney |
| C-CL05-14 | medium | Contract omits pricing items (4 property types, rush fee, add-on options) ("Flat Rate Schedule") | Owner; HUMAN REVIEW: attorney |
| C-CL05-04 | low | Late-checkout charge: "Fine" at checkout time vs "waiting fee" after 11:15 AM ("Delay Surcharge" clause) | HUMAN REVIEW: attorney; owner |
| X-01 | high | No agreement identifies the property, service date or accepted estimate version | HUMAN REVIEW: attorney licensed in KY/IN |
| X-03 | high | Contract scope is defined by reference to unapproved, editable internal files (20 of 25 contracts; 8 targets do not exist) ("Standard Turnover" clause) | HUMAN REVIEW: attorney licensed in KY/IN |
| X-11 | high | No SOP or contract protects occupants, children or pets from active work hazards (0/26 SOPs, 0/25 contracts) | HUMAN REVIEW: qualified safety professional |
| X-16 | medium | A customer who buys two services signs inconsistent terms (caps, insurance, reporting windows, termination, penalties) | HUMAN REVIEW: attorney licensed in KY/IN |
| X-22 | medium | Customer-supplied products (TVs, brackets, cables, closet kits, paint, locks, restock) have no common acceptance, defect or liability rule ("Inventory Logistics" clause) | HUMAN REVIEW: attorney licensed in KY/IN |

### Open questions
- **Q-30-09** (owner; HUMAN REVIEW: attorney, CPA): what payment terms apply to hosts, is any late fee used, and what is the card-on-file stance once a payment provider is selected ("Billing Cycle" clause; shared with Q-28-10)?
- **Q-30-17** (owner; HUMAN REVIEW: attorney): what are the rules for third-party property, including guest food and items guests leave behind? The SOP's guest-food discard stays held until then.
- **Q-30-20** (owner; HUMAN REVIEW: attorney): who may sign for a customer when a host or property manager acts for an owner?
- **Q-30-02** (owner; HUMAN REVIEW: attorney, CPA): what registered legal entity replaces `[Your Cleaning Company Name]`?
- **Q-30-07** (owner; HUMAN REVIEW: attorney): is the completion guarantee kept in any form, and what re-clean or callback policy applies, if any?
- **Q-30-10** (owner; HUMAN REVIEW: attorney): which cancellation, no-access and waiting rules apply to turnovers, and does the waiting fee survive into the fee schedule?
- **Q-30-11** (HUMAN REVIEW: attorney; insurance broker): should the "not liable for subsequent damages" limitation be used at all, and what covers damage caused by cleaners?
- **Q-27-16** (owner; privacy owner; HUMAN REVIEW: attorney for agreement wording): which channels may deliver damage and completion photos to hosts, and how must the photo wording of clause 3 change?
- **30 section 8 row 24** (HUMAN REVIEW: attorney; licensing authority): does co-hosting or property management trigger licensing or trust-account rules in Kentucky or Indiana? No conclusion is drawn here.

### Revision history
| Date | Change | Author |
|---|---|---|
| 2026-10-03 | Added frontmatter, status callout and review notes; original text unchanged | AI orchestrator (Claude) |
