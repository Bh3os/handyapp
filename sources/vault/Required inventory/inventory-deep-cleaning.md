---
title: "Inventory Checklist: Deep Cleaning"
service_id: CL-02
service_slug: deep-cleaning
canonical_name: "Elite Deep Cleaning Service"
category: "Cleaning"
doc_type: inventory
status: draft
authority: supporting
owner_approved: false
human_review:
  - "owner"
  - "safety reviewer (PPE/hazmat)"
  - "qualified mold assessor or industrial hygienist (mold product line)"
registry: "AI Development Plans/04-service-registry.md#CL-02"
last_reviewed: 2026-10-03
---

# ✨ Inventory Checklist: Deep Cleaning

> [!warning] Draft — not owner-approved
> Canonical service: **CL-02 — Elite Deep Cleaning Service** · [Registry entry](../AI%20Development%20Plans/04-service-registry.md#CL-02)
> Checklist only — quantities, stock levels, preferred vendors and reorder points are not yet defined. Proposed additions from the SOP and spec-card cross-check are listed at the end, pending owner and safety review. See [29 Inventory and procurement](../AI%20Development%20Plans/29-inventory-and-procurement.md).
> Legacy artifacts: Arabic text in this file (the three section headings) is a non-authoritative brainstorm remnant (canonical currency USD, launch market KY/IN, languages EN/ES). It is kept unchanged pending an owner decision on cleanup.
> Review notes for this file: see "Review notes and cross-references" at the end.


## 🧴 A. Heavy Chemical Arsenal (المنظفات الكيميائية القوية)
- [ ] **Heavy-Duty Alkaline Degreaser (pH 11-13):** Formulated to break down baked-on grease on range hoods, ovens, and stoves.
- [ ] **Acidic Limescale & Rust Remover (pH 1.5-3):** Phosphoric or citric acid base to melt thick hard water deposits, shower scum, and toilet ring crust. *Warning: Keep away from marble.*
- [ ] **Commercial Oven Cleaner Spray:** High-strength chemical to dissolve carbon buildup inside ovens.
- [ ] **Enzymatic Urine & Odor Destroyer:** To eliminate deeply embedded smells around toilet bases and pet zones.
- [ ] **Mold & Mildew Stain Blaster (Chlorine-Based):** For instantly bleaching mold out of dark bathroom grout lines.

## 🧳 B. Specialized Hardware & Heavy Tools (المعدات الثقيلة والتفصيلية)
- [ ] **Commercial HEPA Backpack Vacuum:** High-suction vacuum with a long cord, upholstery nozzle, and radiator crevice attachment to clean under furniture edges.
- [ ] **Dual-Bucket Mopping System (Wringer Combo):** Separates dirty wastewater from fresh chemical wash water to prevent re-soiling.
- [ ] **Heavy-Duty Tile Grout Scrub Brushes:** Stiff-bristled, V-shaped brushes designed to clean deep into grout tracks.
- [ ] **Non-Scratch White Scrub Pads (Bulk Pack):** For aggressive scrubbing of bathtubs, acrylic showers, and sinks without scratching.
- [ ] **Extendable High-Dusting Wand (Up to 12-16 ft):** With bendable microfiber sleeves to wrap around and clean high ceiling fan blades.
- [ ] **Stainless Steel Razor Blades & Holder:** Used carefully at a 45-degree angle to scrape sticker glue or hardened debris off tile or glass surfaces.

## 🛡️ C. Premium PPE & Hazard Safety (أدوات الحماية والتعامل مع الكيماويات)
- [ ] **Thick Industrial Rubber Gloves:** Elbow-length to shield forearms from harsh oven acids and splashing degreasers.
- [ ] **Safety Splash Goggles:** To protect eyes when spraying chemicals overhead onto ceiling fans, vents, or high shower tiles.
- [ ] **Heavy-Duty Contractor Trash Bags (3 mil):** Thick, puncture-resistant bags for heavy, damp kitchen or bathroom waste.

## Categorization of listed items (added 2026-10-03)

*Added during the AI orchestrator repository audit; the checklist above is unchanged. Two-axis classification (item class and default source) per [29 Inventory and procurement](../AI%20Development%20Plans/29-inventory-and-procurement.md) D-29-01 (PROPOSED). Nothing here approves an item for purchase or use; pH values, sizes, lengths, angles, thicknesses and pack descriptions in the list are not approved values (29 D-29-02). No customer-supplied or rental item is named in any CL-02 file (29 section 5.4).*

| Item (as listed above) | Item class | Default source / custody | Hazmat / SDS needed | Shelf-life / expiry | SOP step that uses it | Notes |
|---|---|---|---|---|---|---|
| Heavy-Duty Alkaline Degreaser (pH 11-13) | consumable_supply | unknown (Q-29-01) | Yes - SDS required (TBD) | TBD - per product label or SDS | SOP section 12, "Kitchen Prep" ("heavy-duty degreaser") | Caustic and alkaline family as the file describes it (29 section 8.1); the reviewer classifies it from the SDS. PPE for caustic products from the SDS (31 section 7.2 rank 11). Dilution and dwell only as the approved label states (29 section 8.2 item 8). Interim rule (29 section 8.3, PROPOSED): a chemical product without a reviewed SDS is not carried to a job (HUMAN REVIEW: qualified safety professional) |
| Acidic Limescale & Rust Remover (pH 1.5-3) | consumable_supply | unknown (Q-29-01) | Yes - SDS required (TBD) | TBD - per product label or SDS | SOP section 12, "Bathroom Prep" ("anti-limescale/mildew remover"; inferred - the only stocked limescale product), held | FLAG (C-CL02-03, critical): CHEMICAL COMPATIBILITY NOT REVIEWED - do not combine or sequence products until SDS review. "Bathroom Prep" applies an anti-limescale/mildew remover together with a toilet bowl cleaner, the only stocked mildew product is chlorine-based, and "De-scaling" later wraps vinegar-soaked cloths around the same faucet bases. "Keep away from marble" is kept verbatim; surface limits come from the label and SDS (spec CL-02.SAF "test sensitive surfaces"). Interim separation note below the table. Interim rule (29 section 8.3, PROPOSED): a chemical product without a reviewed SDS is not carried to a job (HUMAN REVIEW: qualified safety professional) |
| Commercial Oven Cleaner Spray | consumable_supply | unknown (Q-29-01) | Yes - SDS required (TBD) | TBD - per product label or SDS | Not named in any step; "Oven Interior" names no product (ASSUMPTION: used there) | Caustic and alkaline family as the files describe it (29 section 8.1); respiratory protection undetermined (29 section 7.3). Used inside an oven only as the oven manufacturer's instructions and the product label allow, with the oven off and cool (SOP hold). Interim rule (29 section 8.3, PROPOSED): a chemical product without a reviewed SDS is not carried to a job (HUMAN REVIEW: qualified safety professional) |
| Enzymatic Urine & Odor Destroyer | consumable_supply | unknown (Q-29-01) | Yes - SDS required (TBD) | TBD - per product label or SDS | Unused by the current SOP | Stocked but unused (29 section 7.4); kept, nothing removed. No SOP step covers "pet zones". Interim rule (29 section 8.3, PROPOSED): a chemical product without a reviewed SDS is not carried to a job (HUMAN REVIEW: qualified safety professional) |
| Mold & Mildew Stain Blaster (Chlorine-Based) | consumable_supply | unknown (Q-29-01) | Yes - SDS required (TBD) | TBD - per product label or SDS | SOP section 12, "Bathroom Prep" ("anti-limescale/mildew remover"; inferred - the only stocked mildew product) and possibly "Tile Grout" ("mildew and mold discoloration"; ASSUMPTION), both held | FLAG (C-CL02-03, critical): CHEMICAL COMPATIBILITY NOT REVIEWED - do not combine or sequence products until SDS review; chlorine and oxidizer family (29 section 8.1). FLAG (X-06): "For instantly bleaching mold" - no company definition yet separates cleanable surface staining from suspected mold growth, which is a stop-and-escalate condition (Q-31-10); no mold or sanitizing claim is made to customers (32 legal row L5). HUMAN REVIEW: qualified mold assessor or industrial hygienist; qualified safety professional. Interim separation note below the table. Interim rule (29 section 8.3, PROPOSED): a chemical product without a reviewed SDS is not carried to a job (HUMAN REVIEW: qualified safety professional) |
| Commercial HEPA Backpack Vacuum | specialty_equipment (PROPOSED: motor-driven shared asset with filter maintenance per manufacturer, 29 section 3.3 rule 3 and section 5.3) | unknown (Q-29-01) | No | n/a (reusable; filters per manufacturer) | SOP section 12, "Ceilings & Vents", "Tracks & Sills", "Upholstery Vacuuming" ("crevice tool"), "Edge Vacuuming" ("vacuum wand attachment") and "Behind Appliances" (held) | Shared high-value asset; reservation per job (29 section 5.3). Pre-use and cord inspection per the manufacturer's instructions (31 section 3.1 row 7). A HEPA vacuum does not clear a suspect-material hold: damaged or textured ceilings of unknown composition are not vacuumed (SOP hold; 29 section 8.1) |
| Dual-Bucket Mopping System (Wringer Combo) | tool | unknown (Q-29-01) | No | n/a (reusable; replacement per owner policy) | SOP section 12, "Double Mopping"; "Behind Appliances" ("mop", held) | Wastewater destination per the reviewer and the municipality (Q-29-10). Wet floors: wet-floor sign proposed below (spec CL-02.HAZ "slips") |
| Heavy-Duty Tile Grout Scrub Brushes | tool | unknown (Q-29-01) | No | n/a (reusable; replacement per owner policy) | SOP section 12, "Tile Grout" ("stiff detailing brush"); possibly "Tracks & Sills" ("detailing brush") | Stiff bristles on delicate grout, stone or coatings only after the surface test (spec CL-02.SAF "test sensitive surfaces") |
| Non-Scratch White Scrub Pads (Bulk Pack) | consumable_supply | unknown (Q-29-01) | No | n/a (consumed per job) | Not named in any step (scrubbing in "Oven Interior" may use them, ASSUMPTION) | "Non-Scratch" is the product's own description; suitability per surface is checked by the surface test (spec CL-02.SAF). "Bulk Pack" is not an approved quantity (29 D-29-02) |
| Extendable High-Dusting Wand (Up to 12-16 ft) | tool | unknown (Q-29-01) | No | n/a (reusable; sleeves per owner policy) | Unused by the current SOP: its stated use, ceiling fan blades, has no step (C-CL02-V01) | The length range is not an approved value (29 D-29-02). Whether extension tools are used for high areas is part of the height and access policy, which does not exist (C-CL02-05; 02 G-005). Any fan step needs safety review of overhead work first (C-CL02-V01) |
| Stainless Steel Razor Blades & Holder | tool (holder); blades consumable_supply | unknown (Q-29-01) | No | n/a | SOP section 12, "Shower Glass" ("glass scraper"), held for the surface test | The use angle in the description is an unsourced instruction, kept verbatim and not approved; surface and coating limits come from the manufacturer's care instructions (spec CL-02.SAF; C-CL02-08). Blade handling and used-blade disposal per the qualified safety reviewer; sharps container proposed below |
| Thick Industrial Rubber Gloves | ppe | unknown (Q-29-01) | No (glove material is chosen from each product's SDS) | TBD - per manufacturer | No step requires PPE; SOP section 6 is pending safety review | FLAG (C-CL02-03): "harsh oven acids" names the wrong hazard class - the stocked degreaser for ovens is alkaline (degreaser line above); type, material and length by the qualified safety professional from the SDSs, never invented (risk-triage playbook); kit `ppe-base` (29 section 5.2). This PPE heading is the comparison cited for the CL-03 inventory, which lists no PPE (C-CL03-02, owned by CL-03) |
| Safety Splash Goggles | ppe | unknown (Q-29-01) | No | TBD - per manufacturer | No step requires them (29 section 7.4) | The stated use ("spraying chemicals overhead onto ceiling fans, vents, or high shower tiles") describes an overhead exposure that no reviewed step covers (C-CL02-V01; C-CL02-03); eye protection type per SDS by the qualified safety professional; eyewash is a review item of the `vehicle-safety` kit (below) |
| Heavy-Duty Contractor Trash Bags (3 mil) | consumable_supply | unknown (Q-29-01) | No | n/a (consumed per job) | Not named in any step ("Trash Disinfection" relines household bins; liners are not stocked) | Misfiled under the PPE heading; correct class `consumable_supply` (29 section 3.4). The thickness is not an approved value (29 D-29-02). Waste destination per Q-29-10 |

**Notes (pending owner and safety review):**

- Interim: the chlorine-based product and the acid products are not packed in the same caddy or container pending SDS review; this separates products and declares no pair compatible ([29](../AI%20Development%20Plans/29-inventory-and-procurement.md) section 8.3). In this file that means the "Mold & Mildew Stain Blaster (Chlorine-Based)" and the "Acidic Limescale & Rust Remover (pH 1.5-3)", plus any vinegar carried for the SOP's "De-scaling" step (C-CL02-03).
- Kit dependency: CL-01 routine kit (spec CL-02.TLS "routine cleaning kit plus detail brushes, extension tools, approved steam/scrub equipment, PPE") - PROPOSED; undeclared in every CL-02 file (C-CL02-09). Proposed kits: `cleaning-core`, `access-height`, `ppe-base`, `vehicle-safety` (29 section 5.4).
- Respiratory protection and ventilation during the acid, chlorine-based, alkaline and oven-cleaner steps are not determined; the qualified safety professional decides from the SDSs (29 section 7.3; HUMAN REVIEW).

## Proposed additions from SOP and spec-card cross-check (pending owner and safety review)

*Sources: spec card CL-02 (.TLS, .MAT, .HAZ, .SAF), the SOP steps and holds, and 29 sections 7.3 and 7.4. Nothing below is approved for purchase or use (29 D-29-02). No quantities, brands, vendors, ratings or PPE classes are given. Every chemical product added here needs a reviewed SDS before it is carried to a job (29 section 8.3).*

| Item | Item class | Required by (source) | Reason | Status |
|---|---|---|---|---|
| PPE for chemical handling (acid, chlorine-based, alkaline and oven-cleaner products), blades and sharp appliance edges, and overhead work - selection by qualified safety professional; respiratory protection only if the reviewer requires it | ppe | spec CL-02.TLS "PPE"; CL-02.HAZ "chemical exposure", "sharp appliance edges"; kit `ppe-base` (29 sections 5.2 and 5.4) | the listed gloves and goggles are not matched to any SDS; respiratory protection undetermined (29 section 7.3) | PROPOSED |
| `vehicle-safety` kit reference: first-aid kit, fire extinguisher, eyewash, spill kit as review items | kit (contents by qualified safety professional) | 29 D-29-08 and section 5.2; X-10 | no emergency kit in any inventory | PROPOSED |
| SDS register field for each chemical product above (degreaser, limescale remover, oven cleaner, enzymatic odor product, chlorine-based mildew product) | record field (not an item) | 02 G-008; 29 section 8.2 item 1; 29 D-29-03 | no SDS for any product | PROPOSED |
| Separate caddies or containers for the chlorine-based product and the acid products | tool | 29 section 8.3 interim rule (PROPOSED) | no segregation means listed | PROPOSED |
| Toilet bowl cleaner | consumable_supply (chemical) | SOP "Bathroom Prep" ("thick toilet bowl cleaner"); 29 section 7.4 | only in the CL-01 kit | PROPOSED - SDS review first; "Bathroom Prep" compatibility hold (C-CL02-03) |
| Microfiber cloths | consumable_supply | SOP "Baseboards & Trim" ("damp microfiber cloth"), "Blinds" ("damp cloth"), "Glass" ("dry cloth"); spec CL-02.MAT "cloths" | not listed (C-CL02-09) | PROPOSED |
| Disinfectant | consumable_supply (chemical) | SOP "Doors" ("sanitize knobs"), "Drainage" ("flush with disinfectant"), "Trash Disinfection" ("Wash and sanitize") | not listed | PROPOSED - SDS review first; "Drainage" compatibility hold (C-CL02-03) |
| Blind-cleaning tool | tool | SOP "Blinds" ("blind-cleaning tool") | not listed | PROPOSED |
| Squeegee and glass cleaner | tool; consumable_supply (chemical) | SOP "Glass" ("squeegee flat"); 29 section 5.2 `cleaning-core` ("squeegee and glass cleaner (CL-02, CL-03)") | not listed | PROPOSED |
| Holding bins for refrigerator contents | tool | SOP "Refrigerator Interior" ("Remove all food items") | not listed; the food-handling rule is pending (SOP section 5) | PROPOSED |
| Hardware polish; leather protectant; wood conditioning polish | consumable_supply (chemical) | SOP "Cabinets" ("polish hardware/knobs") and "Leather/Wood Care" ("protectant", "conditioning polish") | not listed | PROPOSED - use held for the surface test and the customer's recorded instruction (SOP hold; C-CL02-08) |
| Specialized paste for shower glass | consumable_supply (chemical) | SOP "Shower Glass" ("specialized paste") | not listed | PROPOSED - surface test first (SOP hold) |
| Dirt-lifter solution for mopping | consumable_supply (chemical) | SOP "Double Mopping" ("dirt-lifter solution") | not listed | PROPOSED |
| Vinegar | consumable_supply (chemical) | SOP "De-scaling" ("vinegar-soaked cloths") | not listed | ON HOLD - not used with the other bathroom products until the SDS-based compatibility review (C-CL02-03) |
| Drain hair tool | tool | SOP "Drainage" ("pull out hair build-up"); 04 CL-02 "required tools" (inferred, ASSUMPTION) | not listed | PROPOSED |
| Bin liners | consumable_supply | SOP "Trash Disinfection" ("before relining") | contractor bags only (29 section 7.4) | PROPOSED |
| Wet-floor sign | tool | spec CL-02.HAZ "slips"; 29 section 7.3 row CL-02 | not listed | PROPOSED |
| Sharps container for used blades | tool | the razor blades listed above; spec CL-02.HAZ "sharp appliance edges"; 29 section 5.2 `cleaning-core` ("sharps container") | no used-blade disposal means listed | PROPOSED - type by the qualified safety reviewer |
| Ladder or step stool - per approved height/access policy (none exists, 02 G-005) | specialty_equipment | spec CL-02.HAZ "ladders"; CL-02.SAF "ladder controls"; agreement "Structural Limitations" clause; kit `access-height` (29 section 5.4) | no ladder listed although the agreement implies ladder work (C-CL02-05) | ON HOLD - height and access policy (C-CL02-05) |
| Appliance sliders or moving aids | tool | SOP "Behind Appliances" ("Pull out the stove and refrigerator (if safe)"); 04 CL-02 "required tools" (inferred, ASSUMPTION) | not listed | hold: appliance-movement policy (C-CL02-04) |
| Screwdriver for vent grilles | tool | SOP "Ceilings & Vents" ("remove vent grilles"); 29 section 5.2 `core-handyman` ("Screwdriver and driver-bit set") | not listed | ON HOLD - grille removal is not covered pending the CL-02 and CL-07 boundary (Q-04-15) |
| Approved steam/scrub equipment | specialty_equipment | spec CL-02.TLS "approved steam/scrub equipment" | not listed; no SOP step uses steam | ON HOLD - only if approved |

---

## Review notes and cross-references (added 2026-10-03)

*Added during the AI orchestrator repository audit. Not part of the original content; original text above is unchanged.*

**Related files:** [Registry entry](../AI%20Development%20Plans/04-service-registry.md#CL-02) · [Pricing](../Pricing/pricing-deep-cleaning.md) · [Agreement](../Service%20Agreements/contract-deep-cleaning.md) · [SOP](../Standard%20Of%20Operations/sop%20Deep%20Cleaning%20CheckList.md) · [Requirements spec (service card CL-02)](../Requierments/HandyHub_Requirements_Specification_Reconstructed.md) · [Main plan](../Main%20Plans/Cleaning%20Business.md) · [Gap analysis](../AI%20Development%20Plans/02-gap-analysis.md)

### Issues affecting this file

| ID | Severity | Issue (short) | Reviewer / owner |
|---|---|---|---|
| C-CL02-03 | critical | The SOP directs concurrent acid, chlorine and vinegar use with no chemical-compatibility control; this inventory mislabels oven chemistry (flags in the categorization table; interim separation note) | Qualified safety professional with product SDSs |
| C-CL02-05 | high | The contract contemplates ladder work, but this inventory has no ladder and the SOP has no ladder controls (ladder proposed ON HOLD) | Qualified safety professional; owner |
| C-CL02-09 | medium | SOP requires products and tools this inventory does not stock (proposed additions; kit dependency note) | Owner; job planner (loadout) |
| C-CL02-12 | medium | SAR prices and Arabic headings in a USD Kentuckiana price guide and inventory (legacy line in the callout) | Owner; qualified English/Spanish reviewer |
| C-CL02-V01 | medium | The main plan promises ceiling-fan detailing and microwave interiors, but the SOP has no step for either; the dusting wand and goggles in this file are described for fan work | Owner (scope); qualified safety professional before any fan step |
| C-CL03-02 | critical | (evidence; owned by CL-03) The CL-03 inventory has no PPE although it lists concentrated chemicals; this file's PPE heading is the comparison | Qualified safety professional |
| C-CL03-06 | medium | (evidence; owned by CL-03) The CL-03 inventory omits core equipment its SOP requires; this file is cited as the undeclared CL-02 kit that CL-03 builds on | Owner; job planner (loadout) |
| X-06 | high | Mold is excluded, cleaned routinely, sold as an outcome, billed as a change order, and is a spec stop-work trigger (here: the chlorine-based product "For instantly bleaching mold") | Qualified mold assessor or industrial hygienist; attorney licensed in KY/IN (claims) |
| X-09 | high | A chemical program across at least 16 services with no SDS, compatibility, storage, transport, spill or chemical-disposal rule (here: five chemical products, no SDS) | Qualified safety professional (hazmat transport applicability not concluded) |
| X-10 | high | No emergency kit in any inventory and no incident step in any SOP | Qualified safety professional |
| X-11 | high | No SOP or contract protects occupants, children or pets from active work hazards (here: no wet-floor or work-area control item) | Qualified safety professional |
| X-12 | high | Height tiers differ by service with no shared access standard; access equipment in 3 of 26 inventories, ladder/fall controls in 0 of 26 SOPs | Qualified safety professional |

C-CL02-04 (critical; appliance pull-out) is cited above only as the reason the appliance sliders stay on hold; it is tracked in the SOP's review notes.

### Open questions

- Q-29-09 (owner): who is the qualified safety professional who selects PPE and respiratory protection, approves ladders and access equipment, authors SDS summaries and segregation groups, and defines the vehicle safety kit?
- Q-29-05 (owner; job planner drafts): initial kit contents, par levels, minimum stock and reorder points, if CL-02 is in the launch set.
- Q-29-01 (owner; insurance broker): where are stock and tools kept (shop, storage, vehicles)? This sets the default source column above.
- Q-29-10 (local authority; safety reviewer): disposal destinations and rules for chemical residues, mop water and used blades in each service municipality.
- Q-31-09 (owner; qualified safety professional): the height and access policy, which decides whether a ladder or step stool is stocked.
- Q-31-10 (owner; qualified mold assessor): the line between mold growth and cleanable mildew, which decides how the chlorine-based mold product may be used.
- Q-31-08 (owner and relevant reviewers): is appliance pull-out offered at all? The answer decides whether moving aids are stocked.
- Q-36-04 (owner; qualified English/Spanish reviewer): remove the Arabic headings after the edit phase, or keep them as historical text?

### Revision history

| Date | Change | Author |
|---|---|---|
| 2026-10-03 | Added frontmatter, status callout with legacy-artifact line, categorization table with interim separation and kit-dependency notes, proposed additions and review notes (R1, R2, R5, R3); original text unchanged | AI orchestrator (Claude) |
