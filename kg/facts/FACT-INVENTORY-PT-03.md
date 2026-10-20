---
id: FACT-INVENTORY-PT-03
type: fact
title: "Required tools and materials for Brick Limewashing & Masonry Coatings (PT-03)"
status: active
area: field
links:
  part_of: ["[[SVC-PT-03]]"]
  related: ["[[SOP-PT-03]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]", "[[RULE-NO-INVENTED-FACTS]]"]
source: "vault Required inventory/inventory-brick-limewashing.md; spec section 17 PT-03.TLS/.MAT; Standard Of Operations/sop-brick-limewashing.md sections 6-8"
---
Required tools, materials and PPE for [[SVC-PT-03]] and [[SOP-PT-03]]. The vault inventory is a draft checklist (`Required inventory/inventory-brick-limewashing.md`, `owner_approved: false`): quantities, stock levels, vendors, reorder points and ratings are not defined, and brand or rating words are kept as written, not approved. A missing critical tool, material or PPE item blocks the affected tasks ([[RULE-SAFETY-GATES]]).

## Inventory checklist as written (`Required inventory/inventory-brick-limewashing.md`)

tags: #inventory/tools #inventory/painting #service/brick-coatings

Heavy-duty exterior spraying and extensive masking equipment designed to tackle highly porous exterior brick envelopes [1.1.1، 1.1.4].

#### 🧴 A. The Masonry Coating Arsenal
- [ ] **Authentic Italian Slaked Lime Powder:** High-grade masonry lime mixed with natural earth pigments for authentic old-world limewashing.
- [ ] **High-Build Elastomeric Waterproof Coatings:** Heavy, flexible masonry paint designed to seal micro-cracks on exterior brick structures [1.1.1، 1.1.7].
- [ ] **Acid-Free Efflorescence Cleanser:** Specialty solution to dissolve crusty white salt deposits off old raw brick.

#### 🧳 B. Industrial Spraying & Mechanical Scrubbing Tools
- [ ] **Commercial Airless Sprayer (Heavy-Output):** High-horsepower unit capable of pumping thick, non-thinned elastomeric paint through 517 or 521 tip sizes.
- [ ] **Heavy-Nap Masonry Paint Rollers:** 1-1/4 inch thick wool/polyester roller naps designed to force wet coatings deep into mortar joints.
- [ ] **Large Masonry Block Brushes:** Extra-thick, heavy bristled brushes for manually rubbing slurry coats into textured brick profiles.
- [ ] **Stiff-Wire Hand Scrapers:** For physical rust, scale, and carbon crust removal before washing.

#### 🛡️ C. High-Volume Exterior Masking Hardware
- [ ] **Heavy-Duty Exterior Masking Film (3-mil):** Bulk rolls of clear plastic window shield wrap to seal glass against heavy spray drifts.
- [ ] **High-Adhesion Outdoor Masking Tape:** Specialized duct or poly tape designed to stick to rough brick and concrete surfaces without peeling in high wind.
- [ ] **Roof & Landscape Tarps:** Heavy canvas or vinyl drop sheets to slide under eaves and across driveway cement.

Proposed additions in the vault file (from the SOP and spec cross-check; pending owner and safety review, nothing approved for purchase or use): PPE for slaked lime, cleaning chemicals, pressure washing, airless spraying, wire brushing and overspray - selection by qualified safety professional (PROPOSED); Skin and eye protection for mixing and applying slaked lime - selection by qualified safety professional (PROPOSED (review item)); `vehicle-safety` kit reference (first-aid kit, fire extinguisher, eyewash, spill kit as review items; contents by the qualified safety professional) (PROPOSED); SDS register field for every chemical product above and below (PROPOSED); Masonry cleaner for mildew, named product - NO MIXING pending SDS-based selection (C-PT03-01) (PROPOSED (product selected from its SDS; no mixture approved)); Bleach (OPEN QUESTION - not proposed: is bleach used at all, alone or with which named product? HUMAN REVIEW: qualified safety professional using both products' labels and SDSs); Chemical pump sprayer, dedicated and labeled per chemical family (PROPOSED); Pressure washer - specification per manufacturer and masonry condition, pending review (PROPOSED); Garden hose and water supply for pre-wetting and washing (PROPOSED (owner decides the water source)); Barriers and exclusion-zone items for washing and spraying - types per safety reviewer (PROPOSED); Mixing buckets and mixer for the limewash slurry (PROPOSED); Damp sponge (PROPOSED); Roller frames and extension poles (PROPOSED); Stiff wire brush (PROPOSED); Plastic flashing or another roofline protection method - per roofing and safety review (PROPOSED (conditional on the access plan)); Landscape, plant, vehicle and adjacent-property protection coverings (PROPOSED); Rinse-water and runoff controls - types per safety reviewer and local authority (PROPOSED); Glass cleaner (PROPOSED); Razor scraper with replacement blades (PROPOSED); Access equipment: ladders, and the towable boom lift or hydraulic scissor lift named in pricing (rental candidate) - per approved height/access policy (none exists, 02 G-005); fall protection where that policy requires (PROPOSED (the lift is a rental candidate, 29 section 9.2; Q-29-08)); Crack and prep materials as specified by the approved coating system (PROPOSED (product per coating system)); Engine fuel and an approved fuel container, only if a gas-powered washer or sprayer is chosen (PROPOSED (conditional)).

## Service-card defaults (spec section 17, PT-03)

- Tools and equipment (PT-03.TLS): washing equipment, masonry prep tools, masking, spray/brush equipment, access equipment, PPE.
- Materials and consumables (PT-03.MAT): approved masonry cleaner, limewash/coating, crack/prep materials as specified, masking.

## SOP section 6, "PPE" (`Standard Of Operations/sop-brick-limewashing.md`)

TBD - pending safety review. Selection by the qualified safety professional (source: 31 section 3.5 rule 6). Inputs for that selection:
- The card lists PPE among the tools and requires "PPE/skin/eye protection" (source: spec PT-03.TLS, PT-03.SAF).
- Alkaline slaked lime during mixing, brushing and distressing (source: spec PT-03.HAZ "chemical/alkaline materials"; original Phase 3; 31 section 7.2 rank 11).
- The masonry cleaner and any bleach, the efflorescence cleanser and the glass cleaner: PPE from each SDS (source: 29 section 8.2 row 1; C-PT03-01).
- Pressure washing and airless spraying: injection and flying-debris hazards (source: spec PT-03.HAZ "pressure wash"; 31 section 7.2 rank 10; X-08).
- Wire brushing of brick and mortar: dust that may include crystalline silica; respiratory protection only as the reviewer selects after an exposure assessment (source: risk-triage playbook "silica/other dust"; 31 section 7.2 rank 12).
- Work at height: fall protection only as the approved height and access policy requires (source: spec PT-03.HAZ "falls"; X-12).
- The inventory lists no PPE; PPE lines are proposed additions there.

## SOP section 7, "Tools and equipment" (`Standard Of Operations/sop-brick-limewashing.md`)

| Item | Status | Used in | Source |
|---|---|---|---|
| Stiff wire brush | Not listed; the inventory lists "Stiff-Wire Hand Scrapers" (brush proposed) | Phase 1 "Efflorescence Scrape" | original step; inventory file |
| Chemical pump sprayer, dedicated and labeled | Not listed (proposed) | Phase 1 "Mildew Wash" (on hold) | original step; 29 section 8.2 rows 3 and 4 |
| Pressure washer and hoses | Not listed (proposed; C-PT03-03) | "High-Pressure Cleanse"; the light mist in "Artisanal Distressing" | spec PT-03.TLS "washing equipment"; original steps |
| Garden hose and water supply | Not listed; water source to be decided | "Saturating the Masonry"; washing steps | original steps |
| Mixing buckets and mixer | Not listed (proposed) | "Slaking Slurry Mix" | original step |
| Large masonry block brushes | Listed | "Masonry Brush Apply" | spec PT-03.TLS "spray/brush equipment"; inventory file |
| Damp sponge | Not listed (proposed) | "Artisanal Distressing" | original step |
| Commercial airless sprayer, heavy-output, with tips | Listed; tip size per the sprayer and coating manufacturer instructions (section 12 hold) | "Airless Spray Setup"; "Saturating Spray Pass" | spec PT-03.TLS; inventory file |
| Heavy-nap masonry roller naps; roller frames and extension poles | Naps listed; frames and poles not listed (proposed) | "Back-Rolling the Brick" | inventory file; 29 section 5.2 |
| Plastic flashing or another roofline protection method | Not listed (proposed; roof-edge work on hold) | "Roofline Protection" (on hold) | original step; C-PT03-04 |
| Roof and landscape tarps | Listed; no step uses them | None (landscape protection not covered, C-PT03-08) | inventory file |
| Razor scraper with fresh blades | Not listed (proposed) | "Overspray Scrape" | original step |
| Access equipment: ladders, and the towable boom lift or hydraulic scissor lift named in pricing (rental) | Not listed; per approved height and access policy (none exists, 02 G-005) | "Roofline Protection" and "Soffit Masking" (on hold); any upper-story work | spec PT-03.TLS "access equipment"; pricing "High-Reach Lift Rental Surcharge"; C-PT03-04; X-12 |
| Barriers for the wash and spray zones | Not listed (proposed) | Section 11 setup | X-08; X-11 |
| Vehicle safety kit (first-aid kit, fire extinguisher, eyewash, spill kit as review items) | Contents to be defined by the qualified safety professional | Every job | 29 D-29-08, INV-018; X-10 |

Inspect the pressure washer, airless sprayer, hoses and any access equipment before use per the manufacturer or rental-yard instructions; the inspection method is TBD (source: 31 section 3.1 row 7; spec START-005; 29 section 9.2 steps 5 and 6).

## SOP section 8, "Materials and consumables" (`Standard Of Operations/sop-brick-limewashing.md`)

| Material | Status | Hazmat / SDS | Used in | Source |
|---|---|---|---|---|
| Masonry cleaner for mildew | Not listed; no product named | Yes - SDS required; not carried to a job without a reviewed SDS (29 section 8.3, PROPOSED) | "Mildew Wash" (on hold, C-PT03-01) | spec PT-03.MAT "approved masonry cleaner"; original step |
| Bleach | Not listed; whether it is used at all is an open question (C-PT03-01) | Yes - SDS required; never combined with another product except as both SDSs and an approved step allow (Do not perform entry 6) | "Mildew Wash" (on hold) | original step |
| Acid-free efflorescence cleanser | Listed; no step uses it | Yes - SDS required | None | inventory file |
| Slaked lime powder with earth pigments | Listed | Yes - SDS required (alkaline, spec PT-03.HAZ) | "Slaking Slurry Mix"; "Masonry Brush Apply" | inventory file; original steps |
| Elastomeric masonry coating | Listed | Yes - SDS required | "Saturating Spray Pass"; "Back-Rolling the Brick" | inventory file; original steps |
| Crack and prep materials as specified by the coating system | Not listed (proposed) | Per product SDS | No step yet | spec PT-03.MAT "crack/prep materials as specified" |
| Masking film and outdoor tape | Listed | n/a | Phase 2 steps; "Film Strip" | spec PT-03.MAT "masking"; inventory file |
| Glass cleaner | Not listed (proposed) | Yes - SDS required | "Overspray Scrape" | original step |
| Water | Source to be confirmed (customer or HandyHub) | n/a | "Slaking Slurry Mix"; "Saturating the Masonry"; washing | original steps; 04 PT-03 customer preparation, GAP |
| Engine fuel, only if a gas-powered washer or sprayer is chosen | Not listed | Yes - SDS required | Washer or sprayer | 29 section 8.1 |

No limewash or elastomeric product has been selected; the product's technical data and SDS decide compatibility, application limits and any breathability claim (C-PT03-02). Whether each item comes from stock or is bought per job is an owner decision (Q-29-06); substitutions need approval (spec JOB-007).
