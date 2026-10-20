---
title: "Inventory Checklist: Post-Construction"
service_id: CL-04
service_slug: post-construction
canonical_name: "Post-Construction & Post-Renovation Cleaning"
category: "Cleaning"
doc_type: inventory
status: draft
authority: supporting
owner_approved: false
human_review:
  - "owner"
  - "safety reviewer (PPE/hazmat)"
registry: "AI Development Plans/04-service-registry.md#CL-04"
last_reviewed: 2026-10-03
---

# 🏗️ Inventory Checklist: Post-Construction
> [!warning] Draft — not owner-approved
> Canonical service: **CL-04 — Post-Construction & Post-Renovation Cleaning** · [Registry entry](../AI%20Development%20Plans/04-service-registry.md#CL-04)
> Checklist only — quantities, stock levels, preferred vendors and reorder points are not yet defined. Proposed additions from the SOP and spec-card cross-check are listed at the end, pending owner and safety review. See [29 Inventory and procurement](../AI%20Development%20Plans/29-inventory-and-procurement.md).
> Legacy artifacts: Arabic text in this file is a non-authoritative brainstorm remnant (canonical currency USD, launch market KY/IN, languages EN/ES). It is kept unchanged pending an owner decision on cleanup.
> Review notes for this file: see "Review notes and cross-references" at the end.


## 🧴 A. The Chemical Arsenal (المنظفات الكيميائية)
- [ ] **Phosphoric Acid Cleaners (Muriatic-free):** For removing heavy cement film, plaster drops, and grout haze from tiles.

> FLAG (C-CL04-02, critical): CHEMICAL - SDS + REVIEWED SOP STEP REQUIRED; NOT ACTIVE. No SOP step uses the product in the line above, and it is not used until a reviewed SOP step written from its SDS and label exists; nobody mixes or dilutes it except as that label states. The agreement's "Chemical Use" clause, which authorizes acid treatment of grout lines, is under attorney and safety review; whether acid grout-haze removal is offered at all is an open owner decision (Q-31-08). A chemical product without a reviewed SDS is not carried to a job, and until segregation groups exist this acid is not packed in the same caddy or container as the CL-02 chlorine-based product; that separates products and declares no pair compatible ([29](../AI%20Development%20Plans/29-inventory-and-procurement.md) section 8.3, PROPOSED). HUMAN REVIEW: qualified safety professional. Item kept as listed. (source: [02](../AI%20Development%20Plans/02-gap-analysis.md) C-CL04-02; 29 sections 8.1 to 8.3)

- [ ] **Industrial-Grade Adhesive & Silicone Remover:** To break down window caulking and glue film lines.
- [ ] **Dust-Binding Mop Solution:** Anti-static chemical additive mixed with water to prevent drywall dust from floating back into the air.

## 🧳 B. Hardware & Essential Tools (الأدوات والمعدات)
- [ ] **Industrial HEPA Wet/Dry Vacuum (Class M):** Specifically rated to trap ultra-fine silica and drywall dust without burning the motor.
- [ ] **Professional Window Squeegees & Scrapers (4-inch):** With sharp carbon steel replacement blades to pop off paint droplets from glass at a 45-degree angle.
- [ ] **Floor Scraper Tools:** For removing drywall drops stuck to bare subfloors before flooring installation.
- [ ] **Fine Dust Sweeping Compound:** Wax/oil-based grit sprinkled on floors before sweeping to lock fine dust down.
- [ ] **Microfiber Duster Sleeves (Bulk Supply):** Drywall dust destroys cloths instantly; you will need at least 20-30 cloths per job.

## 🛡️ C. PPE & Safety (أدوات الحماية)
- [ ] **NIOSH-Approved N95 / P100 Dust Respirator Masks:** Mandatory to protect workers' lungs from airborne silica dust particles.

> FLAG (C-CL04-03, critical): the line above stays mandatory. The SOP's dry dust pull and sweeping steps carry a "DUST-CONTROL METHOD PENDING SAFETY REVIEW" hold; respirator type, selection, fit testing, medical evaluation and the respiratory program, and whether silica exposure applies, are decided by the qualified safety professional (OSHA applicability not concluded here). No field SOP is active until competent review (owner facts 2026-10-02). (source: spec CL-04.TLS "PPE/respiratory protection as plan requires"; CL-04.SAF "respiratory/dust control"; 29 section 7.2 item 1; [31](../AI%20Development%20Plans/31-sop-standard.md) section 10 CL-04)

- [ ] **ANSI-Approved Safety Glasses:** To protect eyes during overhead ceiling drywall dust vacuuming.

## Categorization of listed items (added 2026-10-03)

Two axes per [29](../AI%20Development%20Plans/29-inventory-and-procurement.md) D-29-01: item class (what it is) and default source or custody (where it comes from). Counts, sizes, ratings, descriptions and claims in the list above are kept verbatim and are not approved values (29 section 2.3). The "Mandatory" respirator statement also stays verbatim and is never treated as optional ([36](../AI%20Development%20Plans/36-file-modification-plan.md) D-36-08). The Arabic parentheticals in headings A, B and C are kept verbatim (C-CL04-13).

| Item (as listed above) | Item class | Default source / custody | Hazmat / SDS needed | Shelf-life / expiry | SOP step that uses it | Notes |
|---|---|---|---|---|---|---|
| Phosphoric Acid Cleaners (Muriatic-free) | `consumable_supply` | `unknown` | Yes - SDS required (TBD) | Per product label (TBD) | None: unused by the current SOP | No reviewed step (C-CL04-02): flagged in the list above and not used until an SDS-based reviewed SOP step exists. "Muriatic-free" and the described uses ("heavy cement film, plaster drops, and grout haze") are product descriptions, not verified properties; grout and stone compatibility per the product label (spec CL-04.QAC "residues treated without damage"). Interim separation note below this table. A chemical product without a reviewed SDS is not carried to a job (29 section 8.3, PROPOSED; HUMAN REVIEW: qualified safety professional) |
| Industrial-Grade Adhesive & Silicone Remover | `consumable_supply` | `unknown` | Yes - SDS required (TBD) | Per product label (TBD) | "Adhesive Removal" (the step names "an adhesive remover (like Goo Gone)") | "Industrial-Grade" names no product, and the brand in the SOP step is a quotation of the original, not an approved product ([31](../AI%20Development%20Plans/31-sop-standard.md) section 3.5 rule 8). Breaking down "window caulking" has no SOP step. Surface compatibility per the product label and the finish manufacturer (spec CL-04.MAT "surface-safe residue removers"; CL-04.QAC "residues treated without damage"). A chemical product without a reviewed SDS is not carried to a job (29 section 8.3, PROPOSED; HUMAN REVIEW: qualified safety professional) |
| Dust-Binding Mop Solution | `consumable_supply` | `unknown` | Yes - SDS required (TBD) | Per product label (TBD) | "Double Floor Clean" ("a specialized dust-binding floor rinse") | "Anti-static" and "to prevent drywall dust from floating back into the air" are product descriptions, not verified properties. Mixing with water only as the product label states (29 section 8.2 control 8); compatibility with the installed floor finish per the floor manufacturer. A chemical product without a reviewed SDS is not carried to a job (29 section 8.3, PROPOSED; HUMAN REVIEW: qualified safety professional) |
| Industrial HEPA Wet/Dry Vacuum (Class M) | `specialty_equipment` | `unknown` | No | Not applicable; filters and bags per manufacturer (TBD) | "HEPA Vacuuming", "Window Tracks", "Double Floor Clean" | Kit `dust-control` (29 section 5.2 lists the "Class M wet/dry vacuum (CL-04)"). "(Class M)" and "Specifically rated to trap ultra-fine silica and drywall dust" are rating claims to verify against manufacturer data; the dust class needed for this work is set by the safety reviewer (29 section 5.2; HUMAN REVIEW: qualified safety professional). An engineering control: it does not replace the reviewer's dust-control and respiratory decision (C-CL04-03) and does not clear suspect lead or asbestos debris (29 section 8.1). Runs on site power, whose safety is pending review (spec CL-04.SAF "verify power/water safety"). Collected dust is a waste stream (SOP section 15) |
| Professional Window Squeegees & Scrapers (4-inch) | `tool` (squeegees, scraper holders); `consumable_supply` (replacement blades) | `unknown` | No | Not applicable; blades replaced per manufacturer (TBD) | "Paint & Plaster Removal" (scraper); squeegees unused by the current SOP (no glass-washing step) | "4-inch" and "at a 45-degree angle" are kept verbatim, not approved values; method per the glass and window manufacturers' instructions. The SOP holds blade scraping until a pre-work glass inspection with photos is recorded. The "sharp carbon steel replacement blades" are sharps: cut protection and a sharps container are proposed below (spec CL-04.SAF "sharps management") |
| Floor Scraper Tools | `tool` | `unknown` | No | Not applicable | None: unused by the current SOP (the SOP lists floor scraping as not covered, pending review) | Scraping "before flooring installation" implies work while other trades are still active; the SOP requires each area to be released for cleaning first (spec CL-04.SAF "confirm area released for cleaning; do not work amid unsafe active construction"). Hand protection pending qualified safety review |
| Fine Dust Sweeping Compound | `consumable_supply` | `unknown` | Yes - SDS required (TBD) | Per manufacturer (TBD) | None by name: the "Bulk Debris" step sweeps without it | Listed by 29 section 8.1 under fibers and dusts. Whether this compound, HEPA capture or wet methods replace dry sweeping is part of the dust-control decision (C-CL04-03; HUMAN REVIEW: qualified safety professional). A "Wax/oil-based" grit on finished floors needs a compatibility check against the floor finish (pending review). A chemical product without a reviewed SDS is not carried to a job (29 section 8.3, PROPOSED; HUMAN REVIEW: qualified safety professional) |
| Microfiber Duster Sleeves (Bulk Supply) | `consumable_supply` | `unknown` | No | Not applicable | Wipe-downs in "Cabinetry Interior" and "Fixtures & Hardware" | The cloth count per job is kept verbatim and is not an approved quantity (29 section 2.1); the CL-04 template quantity rule carries the higher consumption this line describes (29 section 3.3 rule 6), with square feet as the quantity driver (29 section 5.4). The flat mop that "Wall Damp-Wipe" uses is a separate proposed item |
| NIOSH-Approved N95 / P100 Dust Respirator Masks | `ppe` | `unknown` (personal issue per worker, 29 section 3.2) | No | Per manufacturer (TBD) | None: unused by the current SOP steps (the restructured SOP lists respiratory protection in its section 6, pending review) | stays mandatory; type, selection and fit pending qualified safety review (C-CL04-03). Selection and dust method pending safety review (C-CL04-03): the SOP's dry dust pull and sweeping steps are held until the reviewer decides. "NIOSH-Approved" is verified on the actual product bought. Respiratory protection is task PPE added after the reviewer's exposure and control decision, never baseline issue (29 section 5.2) |
| ANSI-Approved Safety Glasses | `ppe` | `unknown` (personal issue per worker, 29 section 3.2) | No | Per manufacturer (TBD) | None: unused by the current SOP steps (section 6 of the SOP, pending review) | Kit `ppe-base` (29 section 5.2 lists "safety glasses (CL-04)"). "ANSI-Approved" is verified on the actual product bought; selection pending qualified safety review. No splash protection is listed for the chemical products (proposed below) |

Interim (29 section 8.3, PROPOSED): the phosphoric acid product in this list is not packed in the same caddy or container as the CL-02 chlorine-based product pending SDS review; this separates products and declares no pair compatible (HUMAN REVIEW: qualified safety professional).

Customer-provided items: none is named in the CL-04 pricing, inventory, agreement or SOP files. The agreement's "On-Site Safety" clause makes the client provide site power and running water; these are site conditions verified on arrival (spec CL-04.SAF "verify power/water safety"), not inventory. If a customer or general contractor supplies an item, its job line gets source `customer_provided` and a START-009 condition record (29 section 9.1).

Rental equipment: the pricing file's "High Ceiling Scaffolding Work (Above 12 ft)" line names "painters ladders or rolling scaffolding" under a "rental/hazard fee", so rolling scaffolding is a rental candidate (29 section 9.2). Nothing is listed here; rent or buy is an owner decision (Q-29-08), and no access equipment is used before an approved height and access policy exists ([02](../AI%20Development%20Plans/02-gap-analysis.md) G-005).

Kits (PROPOSED, 29 section 5.4): `cleaning-core`, `dust-control`, `access-height`, `ppe-base`, `vehicle-safety`. 29 section 5.2 also records that the `cleaning-core` kit lacks a wet-floor sign and a sharps container.

## Proposed additions from SOP and spec-card cross-check (pending owner and safety review)

No quantity, brand, vendor, rating, setting or PPE class is proposed. Nothing below is approved for purchase or use (29 D-29-02). No product or equipment is added for acid grout-haze treatment: that work has no reviewed step (C-CL04-02).

| Item | Item class | Required by (source) | Reason | Status |
|---|---|---|---|---|
| Respiratory protection and eye or face splash protection per the card's tools and safety rows - selection by qualified safety professional | `ppe` | spec CL-04.TLS "PPE/respiratory protection as plan requires"; CL-04.HAZ "fine dust, silica/wood dust", "chemicals"; CL-04.SAF "respiratory/dust control" | Respirators and safety glasses are listed, but no splash protection for chemical steps, and selection, fit and the respiratory program are undocumented (C-CL04-03) | PROPOSED - pending qualified safety review |
| Chemical-resistant gloves - selection by qualified safety professional, per each product SDS | `ppe` | spec CL-04.HAZ "chemicals"; 29 section 7.3 row CL-04 ("no chemical gloves"); SOP steps "Adhesive Removal", "Metal Polish", "Double Floor Clean" | not listed | PROPOSED - pending qualified safety review; gloves do not activate the acid line, which stays without a reviewed step (C-CL04-02) |
| Cut-resistant gloves - selection by qualified safety professional | `ppe` | spec CL-04.HAZ "sharp debris"; CL-04.SAF "sharps management"; 29 section 7.3 row CL-04; SOP steps "Bulk Debris" and "Paint & Plaster Removal" | not listed | PROPOSED - pending qualified safety review |
| `vehicle-safety` kit reference: first-aid kit, fire extinguisher, eyewash, spill kit and SDS access as review items - contents by qualified safety professional | kit reference | 29 section 5.2 and D-29-08; X-10 | No emergency kit in any inventory | PROPOSED |
| SDS register entry for each chemical product in this list (phosphoric acid cleaner, adhesive and silicone remover, dust-binding mop solution, sweeping compound) and in the proposed additions (metal polish, general-purpose and glass cleaners) | record field | [02](../AI%20Development%20Plans/02-gap-analysis.md) G-008; 29 section 8.2 control 1; X-09 | No SDS on file for any product | PROPOSED |
| Access equipment for ceilings, high fixtures and beams (ladder or rolling scaffold) - per approved height/access policy (none exists, [02](../AI%20Development%20Plans/02-gap-analysis.md) G-005) | `specialty_equipment` | spec CL-04.HAZ "ladders"; SOP steps "HEPA Vacuuming" ("Vacuum ceilings") and "Fixtures & Hardware" ("light bulbs"); pricing "High Ceiling Scaffolding Work (Above 12 ft)"; kit `access-height` | None listed (C-CL04-01; X-12) | PROPOSED - pending qualified safety review; rolling scaffolding is a rental candidate (pricing "rental/hazard fee"; 29 section 9.2); rent or buy is Q-29-08 |
| Microfiber flat mop for walls | `tool` | SOP step "Wall Damp-Wipe" ("a slightly damp microfiber flat mop") | not listed (C-CL04-12) | PROPOSED |
| Floor mop and bucket | `tool` | SOP step "Double Floor Clean" ("then mop"); spec CL-04.TLS "floor tools" | not listed (C-CL04-12) | PROPOSED |
| Broom and dustpan | `tool` | SOP step "Bulk Debris" ("Sweep and gather"); spec CL-04.TLS "floor tools"; [04](../AI%20Development%20Plans/04-service-registry.md#CL-04) required tools | only the sweeping compound is listed (C-CL04-12) | PROPOSED; the dust-control decision may change the method (C-CL04-03) |
| Metal polish, surface-specific | `consumable_supply` | SOP step "Metal Polish" ("stainless steel appliances, chrome faucets, and brass hardware") | not listed (C-CL04-12) | PROPOSED; SDS required; product per the fixture manufacturer's care instructions |
| General-purpose and glass cleaners | `consumable_supply` | spec CL-04.MAT "cleaners"; SOP steps "Cabinetry Interior" and "Fixtures & Hardware" | only the acid, the remover and the mop additive are listed (C-CL04-12) | PROPOSED; SDS required |
| Trash or contractor bags | `consumable_supply` | spec CL-04.MAT "bags"; SOP step "Bulk Debris" ("gather any remaining construction debris"); pricing Phase 1 "pulling construction trash" | not listed (C-CL04-12) | PROPOSED; disposal destination pending (02 G-157; Q-29-10) |
| Replacement HEPA filters and vacuum bags | `consumable_supply` | spec CL-04.MAT "filters"; 29 section 5.2 `dust-control` ("replacement filters and bags (CL-04.MAT 'filters')") | not listed (C-CL04-12) | PROPOSED; type per the vacuum manufacturer; used filters and bags are a waste stream (29 section 8.2 control 10) |
| Sharps container for used blades and sharp debris | `consumable_supply` | spec CL-04.SAF "sharps management"; inventory "sharp carbon steel replacement blades"; 29 section 7.3 row CL-04 | not listed | PROPOSED - pending qualified safety review; disposal destination Q-29-10 |
| Power-safety equipment for corded tools on temporary or permanent site power - selection by qualified safety professional | `tool` | spec CL-04.SAF "verify power/water safety"; agreement "On-Site Safety" ("active temporary or permanent electrical power"); 29 section 7.3 row CL-04 ("power safety (pending review)") | not listed | PROPOSED - pending qualified safety review |
| Photo device for the required before, during and after photos | `tool` | 29 section 7.4 row CL-04 ("photo device"); spec START-008, QA-003 | not listed | PROPOSED |


---

## Review notes and cross-references (added 2026-10-03)

*Added during the AI orchestrator repository audit. Not part of the original content; original text above is unchanged. The two FLAG lines in the list are review additions placed directly under the lines they concern.*

**Related files:** [Registry entry](../AI%20Development%20Plans/04-service-registry.md#CL-04) · [Pricing](../Pricing/pricing-post-construction.md) · [Agreement](../Service%20Agreements/contract-post-construction.md) · [SOP](../Standard%20Of%20Operations/sop%20Post-Construction%20Cleaning%20Checklist.md) · [Requirements spec (service card CL-04)](../Requierments/HandyHub_Requirements_Specification_Reconstructed.md) · [Main plan](../Main%20Plans/Cleaning%20Business.md) · [Gap analysis](../AI%20Development%20Plans/02-gap-analysis.md)

### Issues affecting this file
| ID | Severity | Issue (short) | Reviewer / owner |
|---|---|---|---|
| C-CL04-01 | critical | Height work is required and priced, but no access equipment or height controls exist; access equipment is proposed per the height and access policy | HUMAN REVIEW: qualified safety professional (ladder and scaffold practice; OSHA applicability not concluded) |
| C-CL04-02 | critical | The agreement authorizes phosphoric-acid treatment that no SOP step defines; the acid line is flagged "CHEMICAL - SDS + REVIEWED SOP STEP REQUIRED; NOT ACTIVE" | HUMAN REVIEW: qualified safety professional (SDS and PPE) with the product manufacturer's instructions; attorney (authorization wording) |
| C-CL04-03 | critical | Respirators are "Mandatory" here while the SOP prescribes dry methods with no respiratory or dust controls; the line is kept verbatim and flagged | HUMAN REVIEW: qualified safety professional (OSHA respiratory protection and silica applicability not concluded) |
| C-CL04-12 | medium | SOP-required items missing from this list (proposed additions) | Owner; job planner drafts the loadout |
| C-CL04-13 | medium | Arabic parentheticals in headings A, B and C; each repeats the English heading (proposed English gloss for owner confirmation: "chemical cleaners", "tools and equipment", "protective equipment") | Owner; bilingual reviewer named by the owner |
| X-09 | high | A chemical program with no SDS, compatibility, storage, transport, spill or disposal rule; here the acid, the remover, the mop additive and the sweeping compound | HUMAN REVIEW: qualified safety professional (hazmat transport applicability not concluded) |
| X-10 | high | No emergency kit in any inventory and no incident step in any SOP; `vehicle-safety` kit reference proposed | HUMAN REVIEW: qualified safety professional |
| X-12 | high | No shared height and access standard; no access equipment in this list | HUMAN REVIEW: qualified safety professional |

### Open questions
- **Q-29-08** (owner; HUMAN REVIEW: attorney, insurance broker): is the rolling scaffolding that the pricing file names for work "Above 12 ft" rented or bought, from whom, and who may sign rental agreements?
- **Q-29-09** (owner): who is the qualified safety professional who selects PPE and respiratory protection, approves access equipment, authors SDS summaries and segregation groups, and defines the vehicle safety kit?
- **Q-31-08** (owner and the relevant reviewers): is acid grout-haze removal offered at all, or referred out? The phosphoric acid line depends on the answer.
- **02 C-CL04-03** (owner; HUMAN REVIEW: qualified safety professional): is dry sweeping acceptable, or are HEPA or wet methods required? The sweeping compound and the respirator line depend on the answer.
- **Q-29-05** (owner; job planner drafts): initial kit contents, par levels, minimum stock and reorder points for CL-04, including the cloth count per job.
- **Q-29-10** (local authority; safety reviewer): disposal destinations and rules for construction debris, used blades, filters and bags with collected dust, and chemical residues.
- **Q-31-09** (owner; HUMAN REVIEW: qualified safety professional): height and access policy, on which the access equipment line depends.
- **Q-31-11** (owner; HUMAN REVIEW: qualified safety professional): emergency kit contents and the SDS register owner.
- **36 section 5.4 item 21, C-CL04-13** (owner; qualified English/Spanish reviewer): remove the Arabic parentheticals in headings A to C, and add Spanish only through reviewed translation?

### Revision history
| Date | Change | Author |
|---|---|---|
| 2026-10-03 | Added frontmatter, status callout (with legacy-artifact line), two FLAG lines under the acid and respirator lines, categorization and proposed-additions tables, and review notes (R1, R2, R5, R3); original text unchanged | AI orchestrator (Claude) |
