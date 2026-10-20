---
id: FACT-INVENTORY-PT-02
type: fact
title: "Required tools and materials for Deck & Fence Staining/Sealing (PT-02)"
status: active
area: field
links:
  part_of: ["[[SVC-PT-02]]"]
  related: ["[[SOP-PT-02]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]", "[[RULE-NO-INVENTED-FACTS]]"]
source: "vault Required inventory/inventory-deck-staining.md; spec section 17 PT-02.TLS/.MAT; Standard Of Operations/sop-deck-staining.md sections 6-8"
---
Required tools, materials and PPE for [[SVC-PT-02]] and [[SOP-PT-02]]. The vault inventory is a draft checklist (`Required inventory/inventory-deck-staining.md`, `owner_approved: false`): quantities, stock levels, vendors, reorder points and ratings are not defined, and brand or rating words are kept as written, not approved. A missing critical tool, material or PPE item blocks the affected tasks ([[RULE-SAFETY-GATES]]).

## Inventory checklist as written (`Required inventory/inventory-deck-staining.md`)

tags: #inventory/tools #inventory/painting #service/staining #exterior

An exterior-focused inventory built to strip failed older coatings, neutralize wood fibers, and spray deep waterproof oils.

#### 🧴 A. The Chemical Wood Restoration Suite
- [ ] **Heavy-Duty Sodium Hydroxide Wood Stripper:** Formulated to liquefy old latex/acrylic stains and weathered wood scales.
- [ ] **Oxalic Acid Wood Brightener & Neutralizer:** Vital chemical to reset wood pH balance and pull out deep iron/rust stains.
- [ ] **Premium Deep-Penetrating Oil-Based Stains:** Transparent, semi-transparent, or solid color outdoor stains [1.1.5، 1.1.7].
- [ ] **Eco-Safe Plant Protection Spray:** Anti-transpirant liquid shield to protect delicate garden beds from chemical run-offs.

> FLAG (C-PT02-01): "Eco-Safe" in the line above is an unsubstantiated product claim - HUMAN REVIEW: attorney; reconcile with the product SDS. It stays internal and is not repeated in customer or worker text (29 section 8.2 row 12). The SOP does not use this product; it pre-wets plants with plain water.

#### 🧳 B. Hydraulic Washers & Stain Spray Machinery
- [ ] **Gas-Powered Commercial Pressure Washer:** Delivering 2,500–3,000 PSI @ 2.5–3.5 GPM fitted with a 40-degree wide fan tip.
- [ ] **Industrial Chemical Pump Sprayers:** 2-gallon plastic sprayers with brass wands dedicated strictly to acid/stripper application.
- [ ] **Airless Spray Gun Unit (Exterior Rated):** Fitted with a 415 or 515 tip size for applying solid exterior stains or sealer coatings uniformly.
- [ ] **Thick Wood Staining Block Brushes:** 4-inch or 5-inch wide natural bristle brushes with long extension pole attachments (for rapid manual back-brushing).

#### 🛡️ C. Safety & Fire Prevention PPE (أدوات الأمان والوقاية)
- [ ] **Chemical-Resistant Elbow Gloves & Splash Goggles:** Mandatory when mixing or spraying heavy acidic brighteners.

> FLAG (C-PT02-02): the line above stays mandatory. PPE must also cover every other chemical step - pouring, spraying and washing off the sodium hydroxide stripper, spraying and brushing the oil-based stain, and brush cleaners - each per its SDS; type, selection and fit pending qualified safety review. No field SOP is active until competent review (owner facts 2026-10-02). (source: spec PT-02.HAZ "chemicals"; 29 section 7.3 row PT-02; 31 section 10 PT-02)

- [ ] **Water-Filled Metal Safety Buckets:** *Crucial safety hardware* used to instantly submerge oil-soaked rags to eliminate spontaneous combustion fires.
- [ ] **Yard Stakes & "Wet Stain" Caution Tape:** To seal off deck footpaths from pets and traffic during the 48-hour drying window.

Proposed additions in the vault file (from the SOP and spec cross-check; pending owner and safety review, nothing approved for purchase or use): Face and skin protection for the caustic stripper step - selection by qualified safety professional (PROPOSED); PPE for pressure washing, airless spraying, oil-stain application, brush cleaners and slips - selection by qualified safety professional (PROPOSED); `vehicle-safety` kit reference (first-aid kit, fire extinguisher, eyewash, spill kit as review items; contents by the qualified safety professional) (PROPOSED); SDS register field for every chemical product listed above and below (stripper, brightener, stains, plant spray, brush cleaner, fuel) (PROPOSED); Plastic masking film and tape (PROPOSED); Garden hose with nozzle, or a confirmed customer spigot (PROPOSED (owner decides the water source)); Digital moisture meter - type per reviewer (PROPOSED); Roller set: frame and extension pole, roller covers (PROPOSED); Rags or cloths (PROPOSED); Brush cleaner, selected and disposed of per its SDS - product by safety reviewer (PROPOSED); "Wet Paint/Stain" signs (PROPOSED); Exclusion-zone barriers for pressure washing and spraying - types per safety reviewer (PROPOSED); Runoff and rinse-water controls - types per safety reviewer and local authority (PROPOSED); Engine fuel for the gas washer, as specified by the washer manufacturer (PROPOSED); Approved fuel container - type per safety reviewer (PROPOSED); Ladder or access equipment - per approved height/access policy (none exists, 02 G-005) (PROPOSED (conditional)); Sanding tools with dust controls (OPEN QUESTION - not proposed until the owner keeps sanding in scope); Solid acrylic stain - approved product with SDS (OPEN QUESTION - not proposed until the owner offers the option); Sealer - approved product with SDS (OPEN QUESTION - not proposed until the owner defines sealing).

## Service-card defaults (spec section 17, PT-02)

- Tools and equipment (PT-02.TLS): washer with appropriate pressure, sanding tools, sprayer/brushes, moisture meter if used, masking, PPE.
- Materials and consumables (PT-02.MAT): cleaner/stripper/brightener, stain/sealer, masking/protection, rags with safe disposal controls.

## SOP section 6, "PPE" (`Standard Of Operations/sop-deck-staining.md`)

TBD - pending safety review. Selection by the qualified safety professional (source: 31 section 3.5 rule 6). Inputs for that selection:
- The card lists PPE without detail (source: spec PT-02.TLS).
- The inventory's only PPE line, "Chemical-Resistant Elbow Gloves & Splash Goggles", is "Mandatory when mixing or spraying heavy acidic brighteners"; it stays mandatory, and its type, selection and fit are pending qualified safety review (source: inventory file; C-PT02-02).
- PPE is needed for every chemical step, not only the acid step: pouring, spraying and washing off the sodium hydroxide stripper; the oxalic acid brightener; spraying and back-brushing the oil-based stain; brush cleaners; each per its SDS (source: 31 section 10 PT-02; C-PT02-02, critical).
- Hazards that need a selection: slips, pressure washing, chemicals, sanding dust (only if sanding is approved), flammable or oily rags, weather and heat (source: spec PT-02.HAZ).
- Pressure washing, airless spraying and oil-stain application need a selection per SDS (source: 04 PT-02 "PPE"; X-08; 31 section 7.2 rank 10); spray mist is a respiratory review item (source: 29 section 7.3 row PT-02); gas-engine noise is a review item for the same washer type (source: 04 HI-03 "PPE").

## SOP section 7, "Tools and equipment" (`Standard Of Operations/sop-deck-staining.md`)

| Item | Status | Used in | Source |
|---|---|---|---|
| Plastic pump sprayers, dedicated and labeled per chemical | Listed ("Industrial Chemical Pump Sprayers"); whether one sprayer serves both the acid and the stripper is unclear | Phase 2 "Stripper Application"; Phase 3 "pH Reset" | original steps; inventory file; 31 section 10 PT-02 (RISK) |
| Gas-powered pressure washer with a wide fan nozzle | Listed; its rated pressure is not confirmed as appropriate for wood (C-PT02-09) | Phase 2 "Low-Pressure Power Wash" | spec PT-02.TLS "washer with appropriate pressure"; inventory file |
| Digital moisture meter | Not listed (proposed in the inventory; C-PT02-08) | Phase 3 "Moisture Check" | original Phase 3; spec PT-02.TLS "moisture meter if used" |
| Stain brushes: the perimeter brush and the wide back-brushing brush named in the steps; extension poles | Listed ("Thick Wood Staining Block Brushes") | Phase 4 "Perimeter Cut" and "Mandatory Back-Brushing" | spec PT-02.TLS "sprayer/brushes"; inventory file |
| Roller set (frame, covers, extension pole) | Not listed (proposed) | Phase 4 "Bulk Spray/Roll" | original Phase 4; C-PT02-V02 |
| Airless sprayer | Listed ("Airless Spray Gun Unit"); tip sizes unverified; no injection or overspray control | Phase 4 "Bulk Spray/Roll" | spec PT-02.TLS; inventory file; X-08 |
| Garden hose and nozzle, or the customer's spigot | Not listed (proposed) | Phase 1 "Landscape Saturation"; Phase 2 "Dwell Monitor"; Phase 3 "Dwell & Deep Rinse" | original steps; C-PT02-V02 |
| Water-filled metal bucket | Listed ("Water-Filled Metal Safety Buckets") | Phase 5 "Oily Rags Disposal" | inventory file; spec PT-02.MAT "rags with safe disposal controls" |
| "Wet Paint/Stain" signs | Not listed; the inventory has stakes and caution tape instead | Phase 5 "Drying Signs" | original Phase 5; 29 section 7.4 |
| Exclusion-zone barriers for washing and spraying | Not listed (proposed; types per safety reviewer) | Section 11 setup | 02 C-PT02-09; X-08 |
| Sanding tools | Not listed; sanding is not covered (C-PT02-06) | None | spec PT-02.TLS "sanding tools" |
| Ladder or access equipment | Not listed; only if fence or under-deck work is approved, under the height and access policy (none exists, 02 G-005) | None today | pricing fence and under-deck lines; 29 section 7.4 |
| Vehicle safety kit (first-aid kit, fire extinguisher, eyewash, spill kit as review items) | Contents to be defined by the qualified safety professional | Every job | 29 D-29-08, INV-018; X-10 |
| Approved fuel container | Not listed (proposed) | Refuelling, method pending review | 29 section 7.2 item 10 |

Inspect the washer, sprayers, airless unit and moisture meter before use per the manufacturer instructions; the inspection method is TBD (source: 31 section 3.1 row 7; spec START-005).

## SOP section 8, "Materials and consumables" (`Standard Of Operations/sop-deck-staining.md`)

| Material | Status | Hazmat / SDS | Used in | Source |
|---|---|---|---|---|
| Sodium hydroxide wood stripper | Listed | Yes - SDS required; not carried to a job without a reviewed SDS (29 section 8.3, PROPOSED) | Phase 2 "Stripper Application" | original Phase 2; inventory file; C-PT02-02 |
| Oxalic acid wood brightener and neutralizer | Listed | Yes - SDS required; never shares a sprayer with the stripper unless both SDSs allow it (Do not perform entry 12) | Phase 3 "pH Reset" | original Phase 3; inventory file |
| Oil-based stain (transparent, semi-transparent or solid color) in the customer-approved color | Listed; no product, coverage rate or quantity approved | Yes - SDS required; oil-soaked rags are a fire hazard (section 15) | Phase 4 | original Phase 4; inventory file; spec PT-02.MAT "stain/sealer" |
| Plastic masking film and tape | Not listed (proposed) | n/a | Phase 1 "Siding & Glass Shielding" | original Phase 1; spec PT-02.MAT "masking/protection" |
| Rags and cloths | Not listed (proposed) | Oil-soaked rags: spec PT-02.HAZ "flammable/oily rags" | Phases 4 and 5 | original Phase 5; spec PT-02.MAT "rags with safe disposal controls" |
| Brush cleaner | Not listed (proposed) | Yes - SDS required; selection and disposal per SDS | Phase 5 "Oily Rags Disposal" | original Phase 5; C-PT02-V02 |
| Water | Source to be decided (HandyHub hose or the customer's spigot) | n/a | Phases 1 to 3 | original steps |
| Engine fuel | Not listed (proposed) | Yes - SDS required | Gas washer | 29 section 8.1 |
| Anti-transpirant plant protection spray | Listed in the inventory; unused by this SOP, which pre-wets plants with plain water | Yes - SDS required | None | inventory file; its product claim is not repeated (C-PT02-01) |
| Solid acrylic stain; sealer | Not covered; no product approved | n/a until a product is chosen | None | C-PT02-04; 31 section 10 PT-02 |

Whether each item comes from HandyHub stock or is bought per job is an owner decision (Q-29-06); substitutions, including any change of stain type or product, need approval (spec JOB-007).
