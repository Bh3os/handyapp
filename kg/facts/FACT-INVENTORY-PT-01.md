---
id: FACT-INVENTORY-PT-01
type: fact
title: "Required tools and materials for Residential Interior Painting (PT-01)"
status: active
area: field
links:
  part_of: ["[[SVC-PT-01]]"]
  related: ["[[SOP-PT-01]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]", "[[RULE-NO-INVENTED-FACTS]]"]
source: "vault Required inventory/inventory-interior-painting.md; spec section 17 PT-01.TLS/.MAT; Standard Of Operations/sop-interior-painting.md sections 6-8"
---
Required tools, materials and PPE for [[SVC-PT-01]] and [[SOP-PT-01]]. The vault inventory is a draft checklist (`Required inventory/inventory-interior-painting.md`, `owner_approved: false`): quantities, stock levels, vendors, reorder points and ratings are not defined, and brand or rating words are kept as written, not approved. A missing critical tool, material or PPE item blocks the affected tasks ([[RULE-SAFETY-GATES]]).

## Inventory checklist as written (`Required inventory/inventory-interior-painting.md`)

tags: #inventory/tools #inventory/painting #service/interior

This inventory setup is optimized for residential interior crews to ensure a pristine canvas, sharp lines, and zero property mess.

#### 🧴 A. The Chemical Arsenal (المنظفات والدهانات الأساسية)
- [ ] **Premium Interior Latex Paint:** High-hiding flat, eggshell, satin, or semi-gloss finishes (Sherwin-Williams or PPG brands popular in Kentuckiana).
- [ ] **High-Hiding Latex Wall Primer:** Stain-blocking base layer to seal raw drywall repairs and spackle.
- [ ] **Zero-VOC Odor-Free Paints:** Stocked specifically for nursery rooms or allergy-sensitive clients.
- [ ] **Mild Wall Cleaner / TSP Substitute:** For wiping down greasy fingerprints or dust film before painting.

#### 🧳 B. Hardware & Application Tools (أدوات الفرد والقطع والدهان)
- [ ] **Professional Angled Sash Brushes:** 2.5-inch and 3-inch nylon/polyester blend chisel-trim brushes (essential for free-hand laser cut-lines).
- [ ] **Lint-Free Microfiber Roller Naps:** 3/8-inch nap (for standard smooth drywall) and 1/2-inch nap (for textured walls).
- [ ] **Heavy-Duty Roller Frames & Extension Poles:** 9-inch heavy-duty cages with 2-to-4 foot and 4-to-8 foot extendable fiberglass poles.
- [ ] **Stainless Steel Mud Pans & Putty Knives:** For on-the-spot minor wall patching.
- [ ] **Professional Paint Trays & Liners:** Heavy plastic trays with instant disposable tear-out liners.

#### 🛡️ C. Site Protection & Masking (حقيبة عزل وفرش الغرف)
- [ ] **Canvas Drop Cloths:** Minimum of 4 heavy-weight 9x12 and 4x15 runner cloths to cover hallways and hardwood floors.
- [ ] **Premium Painter's Tape Box:** 2-inch multi-surface tape (blue) and delicate surface tape (purple) for fresh walls.
- [ ] **Plastic Masking Film Roll:** 1-mil thick film with hand-held tape dispensers (for wrapping furniture clusters).
- [ ] **Sanding Sponges & Pole Sanding Discs:** 120-grit and 220-grit screens for smoothing wall surfaces.

Proposed additions in the vault file (from the SOP and spec cross-check; pending owner and safety review, nothing approved for purchase or use): PPE for sanding, primer and paint application, TSP-substitute use, ladder work and furniture moving - selection by qualified safety professional (PROPOSED); `vehicle-safety` kit reference: first-aid kit, fire extinguisher, eyewash, spill kit as review items (PROPOSED - contents by qualified safety professional); SDS register field for every chemical product above (latex paints, primer, Zero-VOC paints, TSP substitute) and for the proposed spackle and caulk (PROPOSED); Screwdriver or driver set for cover plates (PROPOSED); Labeled hardware bags (PROPOSED); Plastic putty knife (PROPOSED); High-intensity work light (PROPOSED); LED inspection light (PROPOSED; one light may serve both steps - owner decides); Lightweight spackle or patch filler (PROPOSED - SDS required before use (29 section 8.3)); Caulk (PROPOSED - SDS required; step pending the scope decision (C-PT01-06)); Tack cloth (PROPOSED); Pole sander head (PROPOSED); Cut pail (paint bucket) (PROPOSED); HEPA vacuum - dust class by qualified safety professional (PROPOSED - stocking it does not clear the SOP's older-coating hold (29 section 8.1; C-PT01-01); HUMAN REVIEW: EPA RRP-certified renovator for older-coating work); Ladders and access equipment - per approved height/access policy (none exists, 02 G-005) (PROPOSED - type and height range by qualified safety professional; maximum ceiling height served is open (Q-31-09)); Sprayer (NOT PROPOSED - only if spraying is approved); Item (Status); Paint (and primer, where specified) when the customer specifies the brand or product (PROPOSED; acceptance and liability rule pending (X-22; Q-29-07); who supplies paint and any material charge (Q-28-14)).

## Service-card defaults (spec section 17, PT-01)

- Tools and equipment (PT-01.TLS): brushes/rollers/sprayer if approved, ladders, sanding/HEPA vacuum, lighting, masking tools, PPE.
- Materials and consumables (PT-01.MAT): primer/paint, caulk/filler, tape/plastic/drop cloths, patch materials.

## SOP section 6, "PPE" (`Standard Of Operations/sop-interior-painting.md`)

TBD - pending safety review.
- No PPE is listed in this SOP or the inventory file; the spec card lists "PPE" only (source: spec PT-01.TLS; 04 PT-01 "PPE").
- Tasks that need a PPE decision by the qualified safety professional: sanding and dust (including any older coating, once the hold allows work), primer, paint, spackle and cleaner use (VOC and chemical exposure per SDS), ladder work, furniture moving and putty-knife work (source: spec PT-01.HAZ; 04 PT-01 "PPE"). No PPE type or class is selected here (source: 31 section 3.5 rule 6).

## SOP section 7, "Tools and equipment" (`Standard Of Operations/sop-interior-painting.md`)

| Tool or equipment | Used in | Source | In the inventory file? |
|---|---|---|---|
| Screwdriver or driver | Hardware Removal; Hardware Install | original steps ("Unscrew", "Re-screw") | No: proposed in the inventory review notes |
| Plastic putty knife | Trim Masking | original step | No: the inventory lists stainless steel putty knives only |
| High-intensity work light | Defect Patching | original step; spec PT-01.TLS "lighting" | No: proposed |
| Mud pans and putty knives | Defect Patching | inventory "Stainless Steel Mud Pans & Putty Knives" | Yes |
| Pole sander with sanding screens | Pole Sanding | original step; spec PT-01.TLS "sanding" | Partly: screens and poles are listed, the sander head is not |
| HEPA vacuum | Dust after "Pole Sanding"; Site Restoration ("vacuum up minor debris") | spec PT-01.TLS "sanding/HEPA vacuum"; original step | No: proposed; dust class by the qualified safety professional; it does not clear the older-coating hold |
| Angled sash brushes | Brush Loading; Ceiling and Trim Cut; Feathering the Cut | original steps; spec PT-01.TLS "brushes" | Yes |
| Paint bucket (cut pail) | Brush Loading | original step | No: proposed |
| Roller frame, extension pole, lint-free nap and tray with grid | Roller Load; The "W" Pattern; Fill & Back-Roll | original steps; spec PT-01.TLS "rollers" | Yes |
| LED inspection light | The Flashlight Sweep | original step; spec PT-01.TLS "lighting" | No: proposed |
| Masking tools: painter's tape and tape dispensers | Floor Defense; Trim Masking; Plastic Encapsulation | spec PT-01.TLS "masking tools"; original steps | Yes |
| Ladders and other access equipment | Ceiling and Trim Cut; any work above floor reach | spec PT-01.TLS "ladders"; spec PT-01.SAF "ladder controls"; pricing "High Ceiling Surcharge" | No: only under an approved height and access policy, none exists (02 G-005; C-PT01-02) |
| Sprayer | None | spec PT-01.TLS "sprayer if approved" | No: not approved and not used (Do-not-perform entry 12) |
| Emergency kit (`vehicle-safety`: first-aid kit, fire extinguisher, eyewash, spill kit as review items) | Every job | 29 D-29-08; X-10 | No: contents by the qualified safety professional |

- Pre-use inspection of any ladder, access equipment and power tool per the manufacturer instructions: TBD - qualified safety reviewer (source: 31 section 3.1).
- Critical tools are marked loaded before start, or an exception is recorded (source: spec START-005).

## SOP section 8, "Materials and consumables" (`Standard Of Operations/sop-interior-painting.md`)

- Paint: interior latex in the customer-approved color, sheen and product (source: spec PT-01.MAT "primer/paint"; spec PT-01.INT "paint brand/product if specified"; inventory "Premium Interior Latex Paint"; agreement "Color Confirmation Waiver"). Who supplies paint and any material charge are undecided (Q-28-14; X-22).
- Zero-VOC paint: stocked in the inventory "for nursery rooms or allergy-sensitive clients"; no selection rule exists, and its label claims stay internal until substantiated (source: inventory file; 29 section 8.2 control 12).
- Primer: high-hiding latex primer for spot priming raw spackle patches (source: original "Spot Priming"; inventory primer line; spec PT-01.MAT "primer/paint"). A full primer coat is not covered (section 2; C-PT01-04).
- Patch materials: lightweight spackle (source: original "Defect Patching"; spec PT-01.MAT "caulk/filler", "patch materials"); not in the inventory file.
- Caulk: on the spec card; no step uses it yet (source: spec PT-01.MAT "caulk/filler").
- Protection: canvas drop cloths, delicate surface tape, painter's tape and plastic masking film (source: original Phase 1; spec PT-01.MAT "tape/plastic/drop cloths"; inventory file).
- Abrasives and wipes: sanding screens for the pole sander and a dry microfiber tack cloth (source: original "Pole Sanding"; inventory "Sanding Sponges & Pole Sanding Discs"); the tack cloth is not in the inventory file.
- Labeled zip bags for screws (source: original "Hardware Removal"); not in the inventory file.
- Mild wall cleaner or TSP substitute: in the inventory; no step uses it (source: inventory file).
- Every chemical product (paint, primer, spackle, caulk, cleaner) needs a reviewed SDS before it is carried to a job (source: 29 section 8.3, PROPOSED; 02 G-008).
- Coats and recoat: no step states the number of coats or the recoat interval. Coats follow the approved estimate, whose painting basis includes coats; the agreement's "Inclusions" clause names a minimum number of coats, so a lower count needs owner and attorney review. Recoat and dry times come from the approved product label; none is set here (source: agreement "Inclusions" clause; spec EST-002; handyhub-estimate-assistant playbook "surface area/preparation/coats for painting"; C-PT01-04).
- Any substitution that affects appearance, specification, safety, cost or customer expectation needs approval (source: spec JOB-007).
