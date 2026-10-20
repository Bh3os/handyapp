---
id: FACT-INVENTORY-PT-04
type: fact
title: "Required tools and materials for Wallpaper Removal & Surface Restoration (PT-04)"
status: active
area: field
links:
  part_of: ["[[SVC-PT-04]]"]
  related: ["[[SOP-PT-04]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]", "[[RULE-NO-INVENTED-FACTS]]"]
source: "vault Required inventory/inventory-wallpaper-removal.md; spec section 17 PT-04.TLS/.MAT; Standard Of Operations/sop-wallpaper-removal.md sections 6-8"
---
Required tools, materials and PPE for [[SVC-PT-04]] and [[SOP-PT-04]]. The vault inventory is a draft checklist (`Required inventory/inventory-wallpaper-removal.md`, `owner_approved: false`): quantities, stock levels, vendors, reorder points and ratings are not defined, and brand or rating words are kept as written, not approved. A missing critical tool, material or PPE item blocks the affected tasks ([[RULE-SAFETY-GATES]]).

## Inventory checklist as written (`Required inventory/inventory-wallpaper-removal.md`)

A restoration inventory profile mapping out adhesive-dissolving chemicals, steaming units, and fine skimming compound tools.

#### 🧴 A. Adhesive Dissolvers & Wall Finishers
- [ ] **Enzyme-Based Wallpaper Stripper Concentrate:** Professional liquid formula (e.g., DIF) that safely breaks down starched wheat paste and clay glues.
- [ ] **Liquid Adhesive Remover Spray:** For stripping remaining sticky paste patches after the paper sheets are pulled.
- [ ] **Oil-Based Stain-Blocking Primer:** To coat and seal exposed drywall brown backing paper, preventing joint compound bubbling.
- [ ] **Lightweight Ready-Mix Joint Compound (Mud):** For skimming damage or uneven seam tracks back to Level 4 flatness.

#### 🧳 B. Steamers, Scrapers & Scoring Machinery
- [ ] **Commercial Wallpaper Steam Machine:** High-capacity electric boiler tank fitted with a lightweight 8"x11" steam plate attachment.
- [ ] **Ergonomic Wallpaper Scoring Tools:** Handheld multi-wheel rolling perforators (e.g., Paper Tiger) to slice tiny holes in vinyl coats.
- [ ] **Flexible Wallpaper Scrapers (Rounded Edges):** 4-inch, 6-inch, and 8-inch putty knives with rounded corners to actively prevent gouging raw drywall sheets.
- [ ] **Coarse Heavy Abrasive Scrub Sponges:** Industrial scratch pads to scrub wet glue residue off wall planes cleanly.

#### 🛡️ C. Electric Safety & Floor Protection
- [ ] **Electrical Outlet Tester & Waterproof Tape:** To protect wall socket cavities from chemical fluid short circuits.
- [ ] **Heavy Plastic Floor Sheeting (4-mil):** To tape flat over baseboards, creating a deep lip funnel to catch slimy glue droplets and hot water drops.
- [ ] **Microfiber Tack Towels (Bulk Pack):** For wiping walls dry after the final freshwater flush phase.

Proposed additions in the vault file (from the SOP and spec cross-check; pending owner and safety review, nothing approved for purchase or use): PPE for steam and hot water, chemical products (per SDS), sanding dust and ladder work - selection by qualified safety professional (PROPOSED); `vehicle-safety` kit reference: first-aid kit, fire extinguisher, eyewash, spill kit as review items (PROPOSED - contents by qualified safety professional); SDS register field for chemical products (stripper, adhesive remover, primer, compound) (PROPOSED); Plastic bags (the SOP's "plastic bag scrapers") (ON HOLD - the step that uses them is held; nothing goes inside an electrical box until a licensed electrician approves a method (C-PT04-03)); Tape for securing sheeting over baseboards (PROPOSED); Garden pump sprayer, kept clean and labeled as a secondary container (PROPOSED - labeling rule pending safety review); Clean sponges and bucket (PROPOSED); Primer applicators (PROPOSED); Wide taping knife (the size the SOP's "Skim Coat Finish" step names) and mud pan (PROPOSED); Sanding sponges (the grit the SOP's "Dustless Polish" step names) (PROPOSED); HEPA vacuum for sanding dust and cleanup (PROPOSED - dust class by qualified safety professional; stocking it does not clear an older-coating hold (29 section 8.1)); Ladder or step stool - per approved height/access policy (none exists, 02 G-005) (PROPOSED - type and rating by qualified safety professional); Ventilation means for oil-based primer use (PROPOSED - need and type per the primer SDS and qualified safety review); Extension cord and cord protection for the steamer (PROPOSED - pending licensed-electrician and safety review; no type or rating proposed).

## Service-card defaults (spec section 17, PT-04)

- Tools and equipment (PT-04.TLS): scorer only when appropriate, steamer/sprayer, scrapers, sanding/HEPA vacuum, protection, PPE.
- Materials and consumables (PT-04.MAT): removal solution, water/control materials, joint compound, primer, protection.

## SOP section 6, "PPE" (`Standard Of Operations/sop-wallpaper-removal.md`)

TBD - pending safety review.
- The spec card lists "PPE" without detail; none is listed in this SOP or the inventory file (source: spec PT-04.TLS; 04 PT-04 PPE row).
- Tasks that need a PPE decision by the qualified safety professional: steam and hot water; the enzyme stripper and adhesive remover (per SDS); oil-based primer (per SDS); sanding dust of compound and of possibly older coatings; ladder work at ceiling borders (source: 04 PT-04 PPE row; spec PT-04.HAZ). No PPE type or class is selected here (source: 31 section 3.5 rule 6).

## SOP section 7, "Tools and equipment" (`Standard Of Operations/sop-wallpaper-removal.md`)

| Tool or equipment | Used in | Source | In the inventory file? |
|---|---|---|---|
| Scoring tool ("ergonomic wallpaper scoring tool") | Wall Scoring, only when the removal-method test calls for it | original step; spec PT-04.TLS "scorer only when appropriate" | Yes: "Ergonomic Wallpaper Scoring Tools" |
| Garden pump sprayer, clean | Enzyme Mix; Saturation Pass; Glue Stripping | original step; spec PT-04.TLS "steamer/sprayer" | No (29 section 7.4) |
| Steam machine with steam plate | Steam Plate Apply | original step; spec PT-04.TLS "steamer/sprayer" | Yes: "Commercial Wallpaper Steam Machine"; power source pending licensed-electrician review (C-PT04-03) |
| Wide, flexible, rounded-edge putty knife | The Gentle Slide | original step; spec PT-04.TLS "scrapers" | Yes: "Flexible Wallpaper Scrapers (Rounded Edges)" |
| Coarse abrasive sponge | Scrubbing Grime | original step | Yes: "Coarse Heavy Abrasive Scrub Sponges" |
| Clean sponges and a bucket | Fresh Water Flush | original step | No (29 section 7.4) |
| Primer applicator | Torn Paper Seal | original step (implied); 29 section 5.2 | No |
| Taping knife (the size the step names) and mud pan | Skim Coat Finish | original step; 29 section 5.2 (`drywall-finishing` kit) | No: the listed scrapers are smaller putty knives (29 section 7.4) |
| Sanding sponges (the grit the step names) or a HEPA dustless sander | Dustless Polish | original step; spec PT-04.TLS "sanding/HEPA vacuum" | No; the choice between them is flagged pending safety review (C-PT04-04) |
| HEPA vacuum | Dust control and cleanup | spec PT-04.TLS "sanding/HEPA vacuum"; spec PT-04.SAF "control dust" | No (29 section 5.2, `dust-control` kit) |
| Electrical outlet tester | Verifying the de-energized state (section 12 hold) | inventory file; 02 C-PT04-03 | Yes: "Electrical Outlet Tester & Waterproof Tape"; the tester type for verification is chosen by the licensed electrician; unused by the current steps |
| Plastic floor sheeting and tape | Floor Protection | original step; spec PT-04.TLS "protection" | Sheeting yes ("Heavy Plastic Floor Sheeting (4-mil)"); sheeting tape no |
| Ladder or step stool | Border and upper-wall work | spec PT-04.HAZ "ladder"; X-12 | No: only under an approved height and access policy (02 G-005) |
| Ventilation means | Torn Paper Seal (oil-based primer) | inventory "Oil-Based Stain-Blocking Primer"; 29 section 7.4 | No: need and type per the SDS, pending safety review |
| Extension cord and cord protection | Powering the steamer | agreement "Active Electrical Isolation" clause; 29 section 7.3 | No: pending licensed-electrician and safety review |
| Emergency kit (`vehicle-safety`: first-aid kit, fire extinguisher, eyewash, spill kit as review items) | Every job | 29 D-29-08; X-10 | No: contents by the qualified safety professional |

- Pre-use inspection of the steamer, sander, vacuum and any ladder per the manufacturer instructions: TBD - qualified safety reviewer (source: 31 section 3.1).
- Critical tools are marked loaded before start, or an exception is recorded (source: spec START-005).

## SOP section 8, "Materials and consumables" (`Standard Of Operations/sop-wallpaper-removal.md`)

- Removal solution: the enzyme-based wallpaper stripper listed in the inventory, mixed only as its label states; SDS reviewed before it is carried to a job (source: spec PT-04.MAT "removal solution"; inventory file; 29 sections 8.2 item 8 and 8.3).
- Liquid adhesive remover spray: listed in the inventory but unused by the current steps; same SDS rule (source: inventory file; 29 section 7.4).
- Water and control materials: clean water for the mix and the wash (source: spec PT-04.MAT "water/control materials"; original "Enzyme Mix" and "Fresh Water Flush").
- Joint compound: the lightweight ready-mix compound listed in the inventory (source: spec PT-04.MAT "joint compound"; inventory file; original "Skim Coat Finish").
- Primer: the oil-based stain-blocking primer listed in the inventory, for the spot seal of torn paper; oil-based, solvent and flammable class, with ventilation and disposal per its SDS, pending review (source: spec PT-04.MAT "primer"; inventory file; 29 section 8.1).
- Protection: plastic floor sheeting and tape (source: spec PT-04.MAT "protection"; original "Floor Protection").
- Plastic bags and tape for electrical boxes ("Outlet Plugging"): held; nothing goes inside a box until a method is approved (source: 02 C-PT04-03).
- Any substitution that affects specification, safety, cost or customer expectation needs approval (source: spec JOB-007).
- No customer-supplied material is named in the PT-04 files (source: 29 section 9.1).
