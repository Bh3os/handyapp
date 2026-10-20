---
title: "Service agreement - Door Hardware & Smart Lock Installation (HI-05)"
service_id: HI-05
service_slug: smart-locks
canonical_name: "Door Hardware & Smart Lock Installation"
category: "Home Improvement"
doc_type: contract
status: template-draft
authority: supporting
owner_approved: false
human_review:
  - "attorney licensed in KY/IN"
  - "owner"
  - "insurance broker"
  - "privacy owner"
registry: "AI Development Plans/04-service-registry.md#HI-05"
last_reviewed: 2026-10-03
---

# 📜 Service Agreement: Door Hardware & Smart Lock Installation

> [!warning] Draft — not owner-approved
> Canonical service: **HI-05 — Door Hardware & Smart Lock Installation** · [Registry entry](../AI%20Development%20Plans/04-service-registry.md#HI-05)
> Draft, attorney review required, not for signature. DRAFT TEMPLATE — NOT LEGAL ADVICE. Must be reviewed and adapted by an attorney licensed in Kentucky and/or Indiana before any use. Placeholders such as [Your Company Name] must be replaced with the registered legal entity name (not yet confirmed). The review notes at the end are not part of the agreement text. See [30 Service agreement standards](../AI%20Development%20Plans/30-service-agreement-standards.md).
> Review notes for this file: see "Review notes and cross-references" at the end.


This Service Agreement is executed by **[Your Company Name]** ("Company") and **[Client Full Name]** ("Client") for structural door hardware upgrades and smart security integrations.

## 1. Scope & Mechanical Tuning
* **Inclusions:** Extraction of old lock mechanisms, strike plate re-alignment chiseling, and mounting of premium digital deadbolts as defined in `sop-smart-locks.md`.
* **The Structural Frame Waiver:** Many older homes in the Kentuckiana market have foundation settling, causing door frames to wrap or sag. While the Company executes expert chisel recess modifications, the Company is not responsible for ongoing structural home settling that may cause doors to wrap or throw locks out of true alignment months after installation.

## 2. Electronic Calibration & Network Disclaimers
* **Network Stability:** The Company will pair smart devices to the resident's Wi-Fi network and verify app connectivity. Ongoing network dropouts, weak signal range, or router reboots are the sole responsibility of the Client or their Internet Service Provider (ISP).

**Client Signature:** _______________________  **Date:** _______________
**Company Representative Signature:** ______________________  **Date:** _______________

---

## Review notes and cross-references (added 2026-10-03)

*Added during the AI orchestrator repository audit. Not part of the original content; original text above is unchanged.*

**Related files:** [Registry entry](../AI%20Development%20Plans/04-service-registry.md#HI-05) · [Pricing](../Pricing/pricing-smart-locks.md) · [Inventory](../Required%20inventory/inventory-smart-locks.md) · [SOP](../Standard%20Of%20Operations/sop-smart-locks.md) · [Requirements spec (service card HI-05)](../Requierments/HandyHub_Requirements_Specification_Reconstructed.md) · [Main plan](../Main%20Plans/Home%20Improvement%20Business.md) · [Gap analysis](../AI%20Development%20Plans/02-gap-analysis.md)

### Clause checklist (per 30 Service agreement standards)
*Statuses copy this file's column of [30](../AI%20Development%20Plans/30-service-agreement-standards.md) section 4.2: 0 present, 2 partial, 4 present with conflicts, 18 missing, 1 not applicable. "Present" means draft text exists; nothing here is approved.*

| # | Clause (30 section 4.1) | Status in this template | Note (IDs) |
|---|---|---|---|
| 1 | Parties and legal entity | partial | Entity and client placeholders in the preamble (orig. L4); the customer's capacity and authority to approve are not captured; Q-30-02 |
| 2 | Property, date and estimate-version identification | missing | No property, date or estimate version (X-01) |
| 3 | Scope reference | present - conflicts (C-HI05-04, C-HI05-07, C-HI05-08, X-03) | "Inclusions" (orig. L7): scope is defined by the internal file `sop-smart-locks.md` (X-03); old-lock extraction has no SOP step (C-HI05-07); only "premium digital deadbolts" are named while pricing sells standard hardware (C-HI05-08); strike-plate re-alignment is included here but priced as an add-on (C-HI05-04) |
| 4 | Exclusions | missing | No exclusion list; candidate exclusions are open questions in [04](../AI%20Development%20Plans/04-service-registry.md#HI-05) HI-05 (exclusions row) |
| 5 | Customer responsibilities and preparation | missing | No preparation checklist (04 HI-05 customer preparation, PROPOSED); occupants and pets not addressed (X-11) |
| 6 | Access (incl. no-access charges) | missing | No access method or no-access rule |
| 7 | Concealed and pre-existing conditions | present - conflicts (C-HI05-05, X-02, X-15) | "The Structural Frame Waiver" (orig. L8) disclaims settling while the SOP collects no existing-condition evidence (X-02); handled differently from other agreements (X-15); the SOP claims the screws prevent settling (C-HI05-05) |
| 8 | Hazardous-material discovery and stop-work | missing | No stop-work notice |
| 9 | Change orders | missing | No change-order clause |
| 10 | Schedule, weather and delays | missing | No schedule clause |
| 11 | Cancellation and reschedule | missing | No cancellation clause |
| 12 | Term and termination (recurring or master only) | n/a | Not a recurring or master relationship (30 section 4.2) |
| 13 | Price, minimum and tax reference | missing | No price field and no disclosure of the \$150 minimum (spec CX-001); pricing-side issues C-HI05-03 and C-HI05-06 (30 section 7) |
| 14 | Deposits and prepayment | missing | No deposit clause |
| 15 | Payment terms and methods | missing | No payment clause |
| 16 | Late payment | missing | No late-payment clause |
| 17 | Warranty and callback | missing | No statement until an owner-approved policy exists (Q-30-07) |
| 18 | Limitation of liability, waivers, releases | present - conflicts (C-HI05-05, C-HI05-01) | "The Structural Frame Waiver" (orig. L8) and the network-responsibility allocation (orig. L11); attorney-review rows below; Q-30-11 |
| 19 | Insurance and credential statements | missing | None present; none may be added without a supporting document in the compliance register |
| 20 | Photo and marketing consent separation | missing | No photo clause |
| 21 | Privacy | present - conflicts (C-HI05-01) | "Network Stability" (orig. L11): the Company pairs devices to the resident's Wi-Fi, while the spec card keeps the account and password under customer control (spec HI-05.SAF) and the clause standard says HandyHub never stores customers' device or account credentials (30 section 4.1 clause 21; [27](../AI%20Development%20Plans/27-roles-and-permissions.md) AUTH-009, PROPOSED) |
| 22 | Dispute resolution | missing | No dispute clause |
| 23 | Governing law (KY vs IN) | missing | Governing law and venue per property state, or as the attorney decides (30 section 4.1) |
| 24 | Signatures and e-acceptance | partial | Blank client and company signature and date lines (orig. L13-L14); no printed name, title, signer authority or e-acceptance |
| 25 | Bilingual version precedence | missing | No Spanish version (Q-30-13) |

### Clauses requiring attorney review
| Quote (short) | Location | Concern | IDs | Reviewer |
|---|---|---|---|---|
| "The Structural Frame Waiver: Many older homes in the Kentuckiana market have foundation settling, causing door frames to wrap or sag. ... the Company is not responsible for ongoing structural home settling that may cause doors to wrap or throw locks out of true alignment months after installation." | Clause 1, "The Structural Frame Waiver" (orig. L8); 30 section 5 row 23 | Waiver and disclaimer: unsupported regional generalization; the SOP claims the reinforcement "prevents future settling misalignment"; "wrap" probably means "warp" (HYPOTHESIS; flag, do not fix) | C-HI05-05 | Attorney licensed in KY and/or IN |
| "The Company will pair smart devices to the resident's Wi-Fi network and verify app connectivity. Ongoing network dropouts, weak signal range, or router reboots are the sole responsibility of the Client or their Internet Service Provider (ISP)." | Clause 2, "Network Stability" (orig. L11); 30 section 5 row 35 | Service commitment and responsibility allocation: pairing implies handling Wi-Fi credentials, which the spec card leaves under customer control | C-HI05-01 (critical) | Attorney licensed in KY and/or IN; privacy owner |

### Placeholders to resolve
- `[Your Company Name]` (orig. L4) -> registered legal entity name, from the company profile setting (not confirmed; Q-30-02). HUMAN REVIEW: attorney, CPA.
- `[Client Full Name]` (orig. L4) -> customer record plus signer authority (27 AUTH-028); who may sign is an attorney decision.
- Signature and date lines (orig. L13-L14) -> acceptance record (27 AUTH-027); there is no printed name, title or signer-authority line. HUMAN REVIEW: attorney.
- No price field: price, minimum adjustment and tax come from the accepted estimate version (30 section 4.1 clause 13; [28](../AI%20Development%20Plans/28-pricing-estimating-and-job-costing.md)).
- Fields with no placeholder at all: service address and state; estimate number and version; scheduled date or window; customer contact and notice address; language of the document; template version and effective date; acceptance method and consent record (identification block, AGR-004; 30 section 6).

### Flags for controlled cleanup (not edited)
- Probable typo "wrap" (twice; HYPOTHESIS: "warp") inside the waiver clause (orig. L8): flagged for the attorney; clause text is not corrected in place (30 section 6; 36 section 5.4 item 23; Q-36-05).
- Scope incorporated by internal file name: "as defined in `sop-smart-locks.md`" (orig. L7). The file exists but is an unapproved, editable draft that is not active (X-03); replaced only through the versioned scope-schedule change (AGR-003).
- "structural door hardware upgrades" (orig. L4): "structural" is used for hardware work, and the phrase is a name variant of the canonical service (C-HI05-12).
- No financial section; strike-plate re-alignment is included here while pricing charges it as an add-on (C-HI05-04; Q-28-21); the inclusions name digital deadbolts only while pricing also sells standard hardware (C-HI05-08) (30 section 7 row HI-05).

### Issues affecting this file
| ID | Severity | Issue (short) | Reviewer / owner |
|---|---|---|---|
| C-HI05-01 | critical | Workers program master/guest codes and pair Wi-Fi, but the spec requires customer control of credentials (clause "Network Stability", orig. L11) | Privacy/data owner; attorney licensed in KY and IN; owner |
| C-HI05-02 | critical | SOP has no manual/emergency-operation check and no "do not leave property unsecured" hold (this agreement includes extraction of the old lock, orig. L7) | Qualified safety professional; owner (contingency policy) |
| C-HI05-04 | high | Strike-plate realignment is a contract inclusion but an add-on in pricing (amount not restated) | Attorney; owner |
| C-HI05-05 | high | SOP claims the reinforcement "prevents future settling misalignment"; the contract disclaims settling | Attorney (KY/IN); structural engineer only where signs of structural movement are observed |
| C-HI05-07 | medium | Old-lock extraction is promised but has no SOP step, and old keys/hardware disposition is missing | Owner; qualified safety professional |
| C-HI05-08 | medium | Contract covers only digital deadbolts, while pricing sells standard locksets and handles | Attorney; owner |
| C-HI05-12 | low | Name and slug drift ("Smart Locks", "structural door hardware upgrades", slug omits door hardware) | Owner |
| X-01 | high | No agreement identifies the property, service date or accepted estimate version | KY/IN attorney |
| X-02 | high | Pre-existing-condition clauses in at least 13 contracts depend on proof that only one SOP (CL-05) collects | KY/IN attorney |
| X-03 | high | Contract scope is defined by reference to unapproved, editable internal files (20 of 25 contracts; 8 targets do not exist) | KY/IN attorney |
| X-11 | high | No SOP or contract protects occupants, children or pets from active work hazards (0/26 SOPs, 0/25 contracts) | Qualified safety professional |
| X-15 | medium | Concealed-condition handling is written eight ways across 11 contracts | KY/IN attorney |

### Open questions
- **Q-30-11** (attorney; insurance broker): should any limitation of liability, waiver or release be used, including "The Structural Frame Waiver" and the network-responsibility allocation, and how would it interact with the insurance actually held?
- **Q-30-02** (owner; attorney, CPA): what is the registered legal entity that replaces `[Your Company Name]`?
- **Q-28-21** (owner; agreement text through 30): is strike-plate re-alignment included in the installation or an add-on?
- **04 HI-05 card, permit/license flags** (attorney; privacy owner): how is the requester's authority to change locks verified (owner, tenant, landlord, rental host), and how are Wi-Fi/app credentials and access codes handled and retained? No conclusion is drawn here.

### Revision history
| Date | Change | Author |
|---|---|---|
| 2026-10-03 | Added frontmatter, status callout and review notes; original text unchanged | AI orchestrator (Claude) |
