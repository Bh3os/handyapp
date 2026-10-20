---
title: "Inventory & Tools: Door Hardware & Smart Lock Installation"
service_id: HI-05
service_slug: smart-locks
canonical_name: "Door Hardware & Smart Lock Installation"
category: "Home Improvement"
doc_type: inventory
status: draft
authority: supporting
owner_approved: false
human_review:
  - "owner"
  - "safety reviewer (PPE/hazmat)"
registry: "AI Development Plans/04-service-registry.md#HI-05"
last_reviewed: 2026-10-03
---

# 📦 Inventory & Tools: Door Hardware & Smart Lock Installation

> [!warning] Draft — not owner-approved
> Canonical service: **HI-05 — Door Hardware & Smart Lock Installation** · [Registry entry](../AI%20Development%20Plans/04-service-registry.md#HI-05)
> Checklist only — quantities, stock levels, preferred vendors and reorder points are not yet defined. Proposed additions from the SOP and spec-card cross-check are listed at the end, pending owner and safety review. See [29 Inventory and procurement](../AI%20Development%20Plans/29-inventory-and-procurement.md).
> Legacy artifacts: Arabic text in this file is a non-authoritative brainstorm remnant (canonical currency USD, launch market KY/IN, languages EN/ES). It is kept unchanged pending an owner decision on cleanup.
> Review notes for this file: see "Review notes and cross-references" at the end.

## 🧳 A. Wood Chisels & Boring Templates (أدوات تفصيل الأبواب والنجارة)
- [ ] **Professional Premium Wood Chisels Set:** 1/2-inch, 3/4-inch, and 1-inch sharp chisels (for widening strike plate recesses).
- [ ] **Door Lock Installation Boring Jig Template Kit:** Fixed frame guide for boring brand-new deadbolt holes safely.
- [ ] **Bi-Metal Hole Saws Set:** 2-1/8 inch (for main face bore) and 1-inch (for edge latch bore) saw attachments.
- [ ] **Handheld Wood Rasp & Sanding Files:** For filing down rough grain margins inside door frame edges.

## 🛠️ B. Hardware Stock & Fasteners (المسامير والكوالين الذكية)
- [ ] **Heavy-Duty 3-inch Exterior Wood Framing Screws:** To anchor metal strike plates straight into the jack studs.
- [ ] **Replacement Drive-In Latches & Faceplates Assortment:** Rounded and square corner options.
- [ ] **Lubricating Graphite Spray / Dry Silicone Lubricant:** For smoothing sticky key cylinders and latch movements.
- [ ] **AA & AAA Premium Lithium Battery Packs (Bulk Supply):** Essential for initial smart lock calibration setups.

## Categorization of listed items (added 2026-10-03)

*Every item listed above, classified on the two axes of [29](../AI%20Development%20Plans/29-inventory-and-procurement.md) section 3.1 (PROPOSED DECISION D-29-01). Classes and sources are proposals for owner review; nothing here approves an item for purchase or use, and the list above stays a checklist, not a stock record (29 D-29-02).*

| Item (as listed above) | Item class | Default source / custody | Hazmat / SDS needed | Shelf-life / expiry | SOP step that uses it | Notes |
|---|---|---|---|---|---|---|
| Professional Premium Wood Chisels Set | `tool` | `unknown` (proposed kit `core-handyman`, 29 section 5.4) | No | n/a | Option A "Chisel Recess Modification" | Sizes as listed are original values, not approved specifications (29 D-29-02). Card hazard "pinch/cut" (spec HI-05.HAZ): PPE pending safety review |
| Door Lock Installation Boring Jig Template Kit | `tool` | `unknown` | No | n/a | None - unused by the current SOP | No approved boring procedure or price (C-HI05-09). "safely" in the description is the original wording, not a safety approval; card hazard "drilling" (spec HI-05.HAZ). Kept; use only under an approved procedure |
| Bi-Metal Hole Saws Set | `tool` | `unknown` | No | n/a | None - unused by the current SOP | No approved boring procedure or price (C-HI05-09); no drill/driver is listed to run them (C-HI05-10). Sizes are original values, not approved specifications. Kept; use only under an approved procedure |
| Handheld Wood Rasp & Sanding Files | `tool` | `unknown` | No | n/a | None - unused by the current SOP | Card tool ("file", spec HI-05.TLS) with no SOP step |
| Heavy-Duty 3-inch Exterior Wood Framing Screws | `consumable_incorporated` | `unknown` (stock or buy per job: Q-29-06) | No | n/a | Option A "Screw Reinforcement" | Length is an original value, not an approved specification (29 D-29-02); the SOP's claim about what these screws achieve is flagged in the SOP |
| Replacement Drive-In Latches & Faceplates Assortment | `consumable_incorporated` | `unknown` (Q-29-06) | No | n/a | None - unused by the current SOP | Door-edge latch parts, not the strike plate named in spec HI-05.MAT (C-HI05-10) |
| Lubricating Graphite Spray / Dry Silicone Lubricant | `consumable_incorporated` (stays in the lock after use, 29 section 3.3 rule 4; owner to confirm) | `unknown` (Q-29-06) | Yes - SDS required (TBD) | TBD - per product label or SDS | None - unused by the current SOP | SDS required. Interim rule (29 section 8.3, PROPOSED): a chemical product without a reviewed SDS is not carried to a job (HUMAN REVIEW: qualified safety professional). Apply to a lock only as that lock's manufacturer allows; no compatibility is declared here |
| AA & AAA Premium Lithium Battery Packs (Bulk Supply) | `consumable_incorporated` | `unknown` (Q-29-06) | Yes - SDS required (TBD) | TBD - per battery manufacturer | Option B "Motor Calibration" (per this file's description; the SOP does not name batteries) | Chemistry and storage per lock manufacturer; hazmat flag (storage, charging and transport per manufacturer and reviewer, 29 section 8.1) |

Notes:
- The Arabic text in heading B reportedly mentions smart locks, but no lock unit is listed (gloss unverified; bilingual reviewer; C-HI05-11). Whether HandyHub ever stocks locks is Q-29-14.
- Customer keys and access secrets are custody items governed by [27](../AI%20Development%20Plans/27-roles-and-permissions.md) section 4.6, not inventory (29 section 9.1).

## Proposed additions from SOP and spec-card cross-check (pending owner and safety review)

*No quantities, brands, vendors, ratings or PPE classes are proposed. Each line stays PROPOSED until the owner, and for PPE and hazardous products a qualified safety professional, approves it (36 section 5.7).*

| Item | Item class | Required by (source) | Reason | Status |
|---|---|---|---|---|
| Screwdriver and driver-bit set | `tool` | Spec HI-05.TLS "screwdrivers"; SOP Option A "Unscrew the metal strike plate from the door frame."; 29 section 5.2 (`core-handyman`) | Not listed (C-HI05-10) | PROPOSED |
| Drill/driver with bits | `tool` | Spec HI-05.TLS "drill/driver, bits"; SOP Option A "driven deep into the structural jack studs" | Not listed; the listed hole saws also need a drill (C-HI05-10) | PROPOSED |
| Measuring tools (tape, backset gauge) | `tool` | Spec HI-05.TLS "measuring tools"; spec HI-05.INT "existing bore/backset" | Not listed (C-HI05-10) | PROPOSED |
| Vacuum | `tool` or `specialty_equipment` (29 section 3.3 rule 3) | Spec HI-05.TLS "vacuum"; 29 section 5.2 (`dust-control`) | Not listed (C-HI05-10) | PROPOSED |
| Mallet or hammer for chiseling | `tool` | 29 sections 5.2 and 7.4 (implied by the Option A chisel step) | Not listed; to be confirmed by the SOP reviewer | PROPOSED |
| Strike plates | `consumable_incorporated` | Spec HI-05.MAT "strike plate" | Not listed; the listed latches and faceplates are door-edge parts (C-HI05-10) | PROPOSED |
| Approved shims and wood filler, only if included in the approved scope | `consumable_incorporated` | Spec HI-05.MAT "approved shims/wood filler if included" | Not listed; wood filler is a chemical product: SDS required before use (29 section 8.3) | PROPOSED |
| Lock unit (lock/hardware); default source `customer_provided` or `job_purchase` pending Q-29-14 | `consumable_incorporated` | Spec HI-05.MAT "lock/hardware"; SOP Option B "Hardware Assembly"; 29 section 9.1 | Not listed and supply source undefined. A customer-supplied lock is a job line, never stock, and needs a START-009 record of condition, model and quantity before installation (X-22) | PROPOSED |
| PPE for the card's pinch/cut and drilling hazards - selection by qualified safety professional | `ppe` | Spec HI-05.HAZ "pinch/cut, drilling"; 29 section 7.3 | No PPE in the card, the SOP or this file | PROPOSED |
| `vehicle-safety` kit reference: first-aid kit, fire extinguisher, eyewash and spill kit as review items | Kit reference (contents set by the safety reviewer) | 29 section 5.2 and D-29-08; X-10 | No emergency kit in any inventory | PROPOSED |
| SDS register entry for each chemical product and the batteries (lubricant; wood filler if adopted) | Record field, not an item | [02](../AI%20Development%20Plans/02-gap-analysis.md) G-008; 29 section 8.2 control 1 | No SDS reference in this file | PROPOSED |

---

## Review notes and cross-references (added 2026-10-03)

*Added during the AI orchestrator repository audit. Not part of the original content; original text above is unchanged.*

**Related files:** [Registry entry](../AI%20Development%20Plans/04-service-registry.md#HI-05) · [Pricing](../Pricing/pricing-smart-locks.md) · [Agreement](../Service%20Agreements/contract-smart-locks.md) · [SOP](../Standard%20Of%20Operations/sop-smart-locks.md) · [Requirements spec (service card HI-05)](../Requierments/HandyHub_Requirements_Specification_Reconstructed.md) · [Main plan](../Main%20Plans/Home%20Improvement%20Business.md) · [Gap analysis](../AI%20Development%20Plans/02-gap-analysis.md)

### Issues affecting this file
| ID | Severity | Issue (short) | Reviewer / owner |
|---|---|---|---|
| C-HI05-09 | medium | New-bore/re-bore capability is stocked and marketed, but pricing excludes boring and the SOP has no procedure (boring jig and hole saws noted above) | Owner; qualified safety professional; building official for fire-rated doors |
| C-HI05-10 | medium | Tools required by the SOP and spec card are missing from inventory (proposed additions above) | Lead Worker / owner |
| C-HI05-11 | low | Arabic headings in pricing and inventory in an English/Spanish operation | EN/ES reviewer; owner on retention |
| X-10 | high | No emergency kit in any inventory and no incident step in any SOP | Qualified safety professional |
| X-22 | medium | Customer-supplied products (TVs, brackets, cables, closet kits, paint, locks, restock) have no common acceptance, defect or liability rule | KY/IN attorney |

### Open questions
- **Q-29-14** (owner): which products HandyHub supplies as standard, including smart locks and other lock hardware, and which models; otherwise the customer supplies the lock. This also answers whether the section B heading's mention of smart locks reflects stock (C-HI05-11).
- **Q-29-09** (owner): who is the qualified safety professional who selects PPE, authors SDS summaries and defines the vehicle safety kit?
- **Q-29-05** (owner; job planner drafts): initial kit contents, par levels, minimum stock and reorder points (kit `core-handyman` for HI-05).

### Revision history
| Date | Change | Author |
|---|---|---|
| 2026-10-03 | Added frontmatter, status callout, categorization and proposed-additions tables, and review notes; original text unchanged | AI orchestrator (Claude) |
