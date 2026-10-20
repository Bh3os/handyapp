---
title: "Service agreement - Residential Remodeling & Home Additions (DW-03)"
service_id: DW-03
service_slug: drywall-remodeling
canonical_name: "Residential Remodeling & Home Additions"
category: "Drywall"
doc_type: contract
status: template-draft
authority: supporting
owner_approved: false
human_review:
  - "attorney licensed in KY/IN"
  - "owner"
  - "insurance broker"
  - "structural engineer or building official"
  - "EPA RRP-certified renovator"
  - "qualified safety professional (generator use)"
  - "CPA (draw schedule)"
registry: "AI Development Plans/04-service-registry.md#DW-03"
last_reviewed: 2026-10-03
---

# 📜 Service Agreement: Residential Remodeling & Additions
> [!warning] Draft — not owner-approved
> Canonical service: **DW-03 — Residential Remodeling & Home Additions** · [Registry entry](../AI%20Development%20Plans/04-service-registry.md#DW-03)
> Draft, attorney review required, not for signature. DRAFT TEMPLATE — NOT LEGAL ADVICE. Must be reviewed and adapted by an attorney licensed in Kentucky and/or Indiana before any use. Placeholders such as [Your Company Name] must be replaced with the registered legal entity name (not yet confirmed). The review notes at the end are not part of the agreement text. See [30 Service agreement standards](../AI%20Development%20Plans/30-service-agreement-standards.md).
> Review notes for this file: see "Review notes and cross-references" at the end.


This Service Agreement is entered into by **[Your Drywall Company Name]** ("Company") and **[Client Full Name]** ("Client") for custom residential renovations, basement build-outs, or room additions.

## 1. Scope of Remodeling Installation
* **Project Specifications:** Company will install framing, insulation [ ], technical gypsum panels, metal corner beads, and finish seams according to the checked specifications inside `pricing-drywall-remodeling.md`.
* **The Old-to-New Blend Waiver:** When tying new drywall lines into historic lath-and-plaster structures (common in older Louisville neighborhoods), the Company will feather compound seams up to 18 inches. Client understands that historic walls are rarely perfectly plumb or flat, and new walls will blend gradually to simulate visual flatness.

## 2. Utility & Operational Requirements
* **Active Utilities Mandatory:** The remodeling site must possess uninterrupted electrical power (120V / 20A circuit baseline for power tools) and clean running water. If utilities are disconnected, a **\$50 per day surcharge** will be added to cover portable generator and water hauling costs.
* **Dust Containment:** While the Company installs tight 3-mil clear plastic isolation curtains, drywall sanding creates fine dust. Client agrees to seal personal adjacent spaces and releases the Company from dust settling outside active work zones.

## 3. Progress Draw Payment Schedule
Total project contract price is fixed at **\$[Amount]**, to be paid across the following milestones:
* **Draw 1 (Retainer):** 30% due upon signing to procure drywall sheet pallets.
* **Draw 2 (Hanging Milestone):** 40% due upon completion of board hanging and corner bead installation.
* **Draw 3 (Completion):** 30% due immediately upon final mechanical sanding and cleanup handover.

**Client Signature:** _______________________  **Date:** _______________
**Company Representative Signature:** ______________________  **Date:** _______________

---

## Review notes and cross-references (added 2026-10-03)

*Added during the AI orchestrator repository audit. Not part of the original content and not part of the agreement text; original text above is unchanged. Clause text, headings, numbering, amounts, percentages and signature lines are not edited; every disposition is an attorney and owner decision, made for Kentucky and for Indiana separately.*

**Related files:** [Registry entry](../AI%20Development%20Plans/04-service-registry.md#DW-03) · [Pricing](../Pricing/pricing-drywall-remodeling.md) · [Inventory](../Required%20inventory/inventory-drywall-remodeling.md) · [SOP](../Standard%20Of%20Operations/sop%20drywall-remodeling.md) · [Requirements spec (service card DW-03)](../Requierments/HandyHub_Requirements_Specification_Reconstructed.md) · [Main plan](../Main%20Plans/Dry%20Wall%20Business.md) · [Gap analysis](../AI%20Development%20Plans/02-gap-analysis.md)

### Clause checklist (per 30 Service agreement standards)
Statuses copy the DW-03 column of [30](../AI%20Development%20Plans/30-service-agreement-standards.md) section 4.2 (present 1, partial 2, present - conflicts 5, missing 16, n/a 1). "Present" never means approved.

| # | Clause (30 section 4.1) | Status in this template | Note (IDs) |
|---|---|---|---|
| 1 | Parties and legal entity | partial | `[Your Drywall Company Name]` and `[Client Full Name]` placeholders (orig. L4); entity type, assumed name and signer capacity not stated; a "Drywall Company" name may suggest a separate entity or division (30 section 6, OPEN QUESTION; Q-30-02) |
| 2 | Property, date and estimate-version identification | missing | No service address, state, estimate number or version, or date (X-01) |
| 3 | Scope reference | present - conflicts (C-DW03-07) | "Project Specifications" (orig. L7) defines scope by "the checked specifications inside `pricing-drywall-remodeling.md`", an internal pricing file that carries the internal target margin and has checkboxes only on its add-on menu; no estimate-version reference (X-03; spec EST-007, FIN-007). The scope list names framing, which no price line covers (C-DW03-05), insulation as an unticked checkbox with no SOP step (C-DW03-04) and "metal corner beads" while other files allow composite or vinyl beads (C-DW03-V02). "room additions" (orig. L4) and framing carry no permit, inspection or structural boundary (C-DW03-01) |
| 4 | Exclusions | missing | No exclusions: electrical, plumbing and HVAC work, structural engineering, permit fees, painting, hazardous-material abatement and mold remediation are not addressed (04 DW-03 exclusions; spec EST-003, UXE-010) |
| 5 | Customer responsibilities and preparation | present | "Active Utilities Mandatory" and the client's duty to "seal personal adjacent spaces" (orig. L11-L12). Occupants, children and pets are not addressed (X-11), and there is no preparation checklist for furniture, access or pets (spec NTF-004; 04 DW-03 customer preparation). A customer duty never replaces HandyHub's own pre-start checks (30 section 4.1 row 5) |
| 6 | Access (incl. no-access charges) | missing | No term |
| 7 | Concealed and pre-existing conditions | missing | No term for conditions found when walls are opened, at tie-ins or in a gut renovation (spec JOB-004, FIN-008); no existing-condition photos before work (spec START-008) |
| 8 | Hazardous-material discovery and stop-work | missing | No customer-facing notice that work stops for suspected asbestos, lead-containing coatings, mold, damaged structure or unapproved utility work, although "The Old-to-New Blend Waiver" (orig. L8) targets "historic lath-and-plaster structures" (C-DW03-02; X-13; 30 section 8 row 12) |
| 9 | Change orders | missing | No term (spec FIN-008, JOB-005) |
| 10 | Schedule, weather and delays | missing | No term; drying waits between coats, inspections before concealment and utility interruptions are not addressed |
| 11 | Cancellation and reschedule | missing | No term; refund treatment of the "Draw 1 (Retainer)" is undefined (Q-30-10, Q-30-22) |
| 12 | Term and termination (recurring or master only) | n/a | One-time project |
| 13 | Price, minimum and tax reference | present - conflicts (C-DW03-07, C-DW03-V01) | Fixed `$[Amount]` (orig. L15) with scope and price defined by the incorporated pricing file (orig. L7); the per-day disconnected-utilities surcharge in "Active Utilities Mandatory" (orig. L11) exists only here, not in the pricing file (C-DW03-V01); framing is unpriced (C-DW03-05). No minimum disclosure (spec CX-001), tax or validity reference (BIZ-003, FIN-001, EST-004) |
| 14 | Deposits and prepayment | present - conflicts (C-DW03-06) | "Draw 1 (Retainer)" (orig. L16) is due on signing for every DW-03 job, while deposits apply only to larger jobs under a configurable, undecided policy (spec FIN-002, BIZ-006; owner facts 2026-10-02); refundability is silent (30 section 5 row 68; X-04) |
| 15 | Payment terms and methods | present - conflicts (C-DW03-06) | Three milestone draws (orig. L15-L18) are not mapped to progress invoices or QA milestones (spec FIN-003, QA-006; 02 G-094); the Draw 3 trigger "final mechanical sanding" (orig. L18) does not match the SOP's hand-sponge sanding (C-DW03-15); accepted methods are not stated: electronic invoices with cash or check, no payment provider selected (owner facts 2026-10-02; Q-30-09) |
| 16 | Late payment | missing | Decision needed (Q-30-09) |
| 17 | Warranty and callback | missing | No warranty or callback term. The main plan promises "perfectly level ceilings" and "eliminating joint shifting or structural settling cracks", while this template says new walls "blend gradually to simulate visual flatness" (orig. L8; C-DW03-09); no warranty is assumed (Q-30-07) |
| 18 | Limitation of liability, waivers, releases | present - conflicts (C-DW03-03, C-DW03-11) | "The Old-to-New Blend Waiver" (orig. L8) carries a waiver label and a feathering commitment that conflicts with the SOP ("up to" versus "at least"; C-DW03-11); the "Dust Containment" release (orig. L12) relies on isolation curtains that the SOP never installs and the inventory does not stock (C-DW03-03). 30 section 5 rows 26 and 31; Q-30-11 |
| 19 | Insurance and credential statements | missing | None stated; none may be added until the compliance register supports it (Q-30-12) |
| 20 | Photo and marketing consent separation | missing | No term; pre-concealment and tie-in photos are operational records, internal-only by default (spec DW-03.QAC, REC-002) |
| 21 | Privacy | missing | No term |
| 22 | Dispute resolution | missing | No term |
| 23 | Governing law (KY vs IN) | missing | Decided per property state by the attorney (Q-30-05); the template names "older Louisville neighborhoods" (orig. L8) but no state |
| 24 | Signatures and e-acceptance | partial | Blank signature and date lines (orig. L20-L21); no printed name, title or signer authority (Q-30-06) |
| 25 | Bilingual version precedence | missing | No Spanish version (Q-30-13) |

### Clauses requiring attorney review
From [30](../AI%20Development%20Plans/30-service-agreement-standards.md) section 5 (rows 26, 31, 59 and 68). Quoted only to flag them; the quotes are not endorsed, and amounts and percentages are referred to by clause name rather than repeated. Each item is decided for Kentucky and for Indiana separately.

| Quote (short) | Location | Concern | IDs | Reviewer |
|---|---|---|---|---|
| "The Old-to-New Blend Waiver" / "the Company will feather compound seams up to 18 inches" | "The Old-to-New Blend Waiver", orig. L8 (30 section 5 row 26) | Waiver label and a scope figure: the SOP says "at least 18 inches"; historic lath-and-plaster tie-ins need lead and asbestos screening before any disturbance; "(common in older Louisville neighborhoods)" is a regional statement with no source | C-DW03-11; C-DW03-02 (critical) | Attorney; EPA RRP-certified renovator |
| "Client agrees to seal personal adjacent spaces and releases the Company from dust settling outside active work zones." | "Dust Containment", orig. L12 (30 section 5 row 31) | Release; the isolation curtains it relies on are not in the SOP or the inventory, and a release must not rely on steps the SOP does not perform (30 section 4.1 row 18) | C-DW03-03 | Attorney; insurance broker |
| "If utilities are disconnected" ... "per day surcharge will be added to cover portable generator and water hauling costs." | "Active Utilities Mandatory", orig. L11 (30 section 5 row 59) | Surcharge not in the pricing file; generator use raises a carbon-monoxide control question; whether fixed charges for utilities are permitted and how they must be disclosed is jurisdiction-specific (30 section 8 row 6) | C-DW03-V01 | Owner; qualified safety professional; attorney |
| "Draw 1 (Retainer):" ... "due upon signing to procure drywall sheet pallets." | "Progress Draw Payment Schedule", orig. L16 (30 section 5 row 68) | Deposit with refundability silent; a hard-coded draw against a configurable, undecided deposit policy; enforceability and handling of deposits are jurisdiction-specific (30 section 8 row 5) | C-DW03-06 | Owner; attorney; CPA |

### Placeholders to resolve
- `[Your Drywall Company Name]` (orig. L4) -> registered legal entity name (not confirmed; Q-30-02); resolves from the company profile setting. Whether "Drywall Company" names a separate entity or division is an OPEN QUESTION (30 section 6). HUMAN REVIEW: attorney, CPA.
- `[Client Full Name]` (orig. L4) -> customer record plus signer authority (AUTH-028); who may sign is an attorney decision (Q-30-20).
- `$[Amount]` (orig. L15) -> price from the accepted estimate version; the minimum adjustment and tax also come from the estimate (30 section 4.1 row 13; spec EST-004). No placeholder may survive into a sent document (AGR-026).
- Insulation checkbox `[ ]` (orig. L7) -> selected option on the estimate (spec EST-005); insulation stays unavailable until the owner decides scope and a reviewed SOP step exists (C-DW03-04).
- Signature and date lines (orig. L20-L21) -> acceptance record (AUTH-027); printed name, title and signer authority are missing. HUMAN REVIEW: attorney.
- Fields with no placeholder at all: service address and state; estimate number and version; scheduled date or window; document language; template version (30 section 6; AGR-004).

### Flags for controlled cleanup (not edited)
- Scope by internal file: "according to the checked specifications inside `pricing-drywall-remodeling.md`" (orig. L7). The file exists but carries the internal "Target Margin" line (C-DW03-07); it is replaced only through the agreement architecture change, with scope taken from the accepted estimate version (AGR-003; X-03; Q-30-03).
- Framing (orig. L7): contracted but priced nowhere (C-DW03-05). Headers, load-bearing and addition framing need a structural engineer or building official, and permit and inspection responsibility is undecided (C-DW03-01; 30 section 8 row 3).
- "insulation [ ]" (orig. L7): no SOP step, inventory item or PPE covers insulation (C-DW03-04).
- "metal corner beads" (orig. L7): the SOP, pricing, main plan and inventory allow composite or vinyl beads (C-DW03-V02).
- "up to 18 inches" (orig. L8) versus the SOP's "at least 18 inches" (C-DW03-11).
- "tight 3-mil clear plastic isolation curtains" (orig. L12): no SOP step or inventory item provides them (C-DW03-03).
- "final mechanical sanding" (orig. L18): the SOP sands by hand with a sponge (C-DW03-15).
- Demolition: priced in the pricing file ("Old Drywall Demolition / Gutting") but outside this template's scope list and without hazardous-material terms; it is on hold pending lead and asbestos screening (C-DW03-02; 30 section 7).
- No AI citation residue, probable typo, Arabic text or square-metre option was found in this template.

### Issues affecting this file
| ID | Severity | Issue (short) | Reviewer / owner |
|---|---|---|---|
| C-DW03-01 | critical | No permit, inspection-before-concealment, utility or structural hold points despite framing, headers, additions and gut renovations; this template contracts "room additions" and framing (orig. L4, L7) with no permit, inspection or structural term | HUMAN REVIEW: local building department; licensed structural engineer; attorney; licensed MEP trades |
| C-DW03-02 | critical | Demolition and historic-plaster tie-ins without lead/asbestos screening, demolition procedure or disposal plan; "The Old-to-New Blend Waiver" (orig. L8) targets historic lath-and-plaster | HUMAN REVIEW: EPA RRP-certified renovator; asbestos-accredited professional; attorney |
| C-DW03-03 | high | The agreement promises containment curtains that the SOP and inventory do not have, and adds a dust release (orig. L12) | HUMAN REVIEW: attorney |
| C-DW03-04 | high | Insulation offered ("insulation [ ]", orig. L7) and sold in pricing but absent from SOP, inventory and PPE | Owner (scope); HUMAN REVIEW: building official (energy code/inspection), safety reviewer |
| C-DW03-05 | high | Framing is contracted (orig. L7) but priced nowhere | Owner |
| C-DW03-06 | high | Hard-coded three-draw schedule (orig. L16-L18) versus a configurable, undecided deposit policy | HUMAN REVIEW: attorney, owner |
| C-DW03-07 | high | The agreement incorporates the internal pricing file, with its target margin, as its specification (orig. L7) | HUMAN REVIEW: attorney |
| C-DW03-09 | high | Main-plan guarantees versus this template's hedge (orig. L8) and the spec's "project tolerance" | HUMAN REVIEW: attorney, owner; building official for the tile-backer claim |
| C-DW03-11 | medium | Feathering width: this template "up to 18 inches" (orig. L8) versus the SOP's "at least 18 inches" | Owner; HUMAN REVIEW: attorney |
| C-DW03-V01 | medium | The per-day disconnected-utilities surcharge (orig. L11) exists only in this template, not in the pricing file | Owner (fee); HUMAN REVIEW: attorney (fee wording); qualified safety reviewer (generator use) |
| C-DW03-15 | low | The Draw 3 trigger "final mechanical sanding" (orig. L18) versus the SOP's hand-sponge sanding | HUMAN REVIEW: attorney |
| C-DW03-V02 | low | This template specifies "metal corner beads" (orig. L7); the SOP, pricing, plan and inventory allow composite or vinyl beads | Owner; HUMAN REVIEW: attorney (contract wording) |
| X-01 | high | No agreement identifies the property, service date or accepted estimate version | HUMAN REVIEW: KY/IN attorney |
| X-03 | high | Contract scope is defined by reference to unapproved, editable internal files (orig. L7) | HUMAN REVIEW: KY/IN attorney |
| X-04 | medium | Deposit terms are keyed to service type, not job size, contrary to the large-jobs-only principle ("Draw 1 (Retainer)", orig. L16) | Owner; HUMAN REVIEW: attorney; CPA |
| X-11 | high | No SOP or contract protects occupants, children or pets from active work hazards (here: dust, lifts, cutting and opened walls in an occupied home) | HUMAN REVIEW: qualified safety professional |

### Open questions
- **Q-30-08** (owner; HUMAN REVIEW: attorney, CPA): deposit policy: threshold, amount, timing, refundability, forfeiture triggers and approval authority. Does any DW-03 job need a retainer at signing, and how do progress draws relate to it? Same decision as Q-28-09.
- **Q-30-15** (owner): referral policy for concealed conditions that no catalog service covers, such as mold remediation or foundation and structural problems found when walls are opened in a remodel.
- **Q-30-03** (attorney; owner): which agreement architecture replaces scope by internal file with a versioned scope from the accepted estimate (C-DW03-07, X-03)?
- **30 section 8 row 3** (HUMAN REVIEW: attorney; local licensing authority; permit office, for Kentucky and for Indiana separately): do contract-content, registration or licensing rules apply to home-improvement agreements that include framing, and who obtains any permit (C-DW03-01)?
- **30 section 8 row 12 / Q-30-18** (HUMAN REVIEW: EPA RRP-certified renovator; attorney): which lead-safe work information applies to tie-ins and demolition in older homes, and does it belong in the agreement, the estimate or a separate record?
- **30 section 8 row 11** (HUMAN REVIEW: attorney): do contractor lien rights or notices apply to larger DW-03 projects?
- **Q-30-07** (owner; HUMAN REVIEW: attorney): is any warranty or callback policy offered for tie-ins and joints, or none? None is assumed (C-DW03-09).
- **Q-30-10** (owner; HUMAN REVIEW: attorney): which agreement-only fees survive into the fee schedule, including the per-day utilities surcharge (C-DW03-V01; Q-28-07)?
- **Q-30-11** (HUMAN REVIEW: attorney; insurance broker): should the blend "waiver" and the dust release be used at all, and how do they interact with the insurance actually held?
- **Q-30-05** (HUMAN REVIEW: attorney): governing law, venue and dispute mechanism; does the property's state select the variant?
- **Q-30-02** (owner; HUMAN REVIEW: attorney, CPA): registered legal entity and assumed name; does `[Your Drywall Company Name]` imply a separate entity or division?

### Revision history
| Date | Change | Author |
|---|---|---|
| 2026-10-03 | Added frontmatter, status callout and review notes (clause checklist, attorney-review list, placeholders, cleanup flags, issues, open questions); original text unchanged | AI orchestrator (Claude) |
