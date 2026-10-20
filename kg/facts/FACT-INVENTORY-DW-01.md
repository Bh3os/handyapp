---
id: FACT-INVENTORY-DW-01
type: fact
title: "Required tools and materials for Patching & Repair (DW-01)"
status: active
area: field
links:
  part_of: ["[[SVC-DW-01]]"]
  related: ["[[SOP-DW-01]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]", "[[RULE-NO-INVENTED-FACTS]]"]
source: "vault Required inventory/inventory-drywall-patching.md; spec section 17 DW-01.TLS/.MAT; Standard Of Operations/sop drywall-patching.md sections 6-8"
---
Required tools, materials and PPE for [[SVC-DW-01]] and [[SOP-DW-01]]. The vault inventory is a draft checklist (`Required inventory/inventory-drywall-patching.md`, `owner_approved: false`): quantities, stock levels, vendors, reorder points and ratings are not defined, and brand or rating words are kept as written, not approved. A missing critical tool, material or PPE item blocks the affected tasks ([[RULE-SAFETY-GATES]]).

## Inventory checklist as written (`Required inventory/inventory-drywall-patching.md`)

tags: #inventory/tools #inventory/drywall #service/patching

This inventory setup is optimized for a single-technician mobile repair rig, focused on fast setup, rapid drying, and clean dust containment.

#### 🧳 1. The Mobile Hand Tool Caddy (الحقيبة اليدوية السريعة)
- [ ] **Stainless Steel Taping Knives Set:** 4-inch, 6-inch (for bedding), and 10-inch (for feathering).
- [ ] **Heavy-Duty Utility Knife:** With a bulk pack of carbon steel replacement blades (for scoring sheets).
- [ ] **Drywall Jab Saw:** Ergo-grip drywall hand saw with cross-ground teeth for swift plaster extraction.
- [ ] **Stainless Steel Mud Pan:** 12-inch or 14-inch pan with anti-slip grip and sharp scraping bars.
- [ ] **Tape Measure:** 25-foot heavy-duty magnetic tape measure.
- [ ] **Drywall Screw Gun / Cordless Drill:** 20V system with multiple Phillips #2 drywall dimper bits (automatically sets correct screw depth).

#### 🧴 2. Compounds & Consumables (المواد الكيميائية والمستهلكات)
- [ ] **Setting-Type Compounds (Hot-Mud):** 2 bags of Sheetrock Brand Easy Sand 20 and 2 bags of Easy Sand 45 (for fast same-day multi-coating).
- [ ] **Fiberglass Mesh Joint Tape:** 2 rolls of self-adhesive 2-inch wide tape (essential for micro-bridging patches).
- [ ] **Drywall Screws:** 5 lb tub of 1-1/4 inch coarse-thread screws (for wood studs) and fine-thread screws (for metal stud frameworks).
- [ ] **Replacement Drywall Panels Stock:** Stored in the van: 2'x2' and 4'x4' precut sheet squares of both 1/2-inch UltraLight and 5/8-inch Type X boards.
- [ ] **Drywall Primer-Sealer Spray / Can:** Quick-dry latex primer to seal patches instantly.

#### 🛡️ 3. Dust Containment & Clean-up (حماية موقع العمل)
- [ ] **Canvas Drop Cloths:** 2 premium heavy-weight 9x12 cloths to lay under the repair zone.
- [ ] **Pre-Taped Masking Film:** 2 rolls of plastic film with integrated painters tape for wall shielding.
- [ ] **Dual-Angled Sanding Sponges:** 5 pack of fine/medium grit sponges for micro-feather smoothing.
- [ ] **Cordless Handheld HEPA Vacuum:** For instant drywall dust cleanup around the patch before leaving.

Proposed additions in the vault file (from the SOP and spec cross-check; pending owner and safety review, nothing approved for purchase or use): PPE for cutting, mixing and sanding, overhead work and water-damaged material, including any respiratory protection the reviewer requires after the exposure and control decision - selection by qualified safety professional (PROPOSED); `vehicle-safety` kit reference: first-aid kit, fire extinguisher, eyewash, spill kit as review items; contents by qualified safety professional (PROPOSED); SDS register field for every chemical product or battery on this list (setting compounds, primer-sealer, the ready-mix compound proposed below, mesh-tape adhesive if the reviewer classes it, tool batteries) (PROPOSED); Stud and utility scanner able to locate studs and hidden wiring or pipes, per its manufacturer documentation (PROPOSED); Framing square and pencil (PROPOSED); Backing lumber or plywood slat (PROPOSED); Lightweight ready-mix joint compound (PROPOSED); Mixing container for setting compound, used as the compound manufacturer's instructions direct (PROPOSED); High-powered LED inspection light (PROPOSED); Microfiber cloths (PROPOSED); Primer applicator (brush or roller) for the can option (PROPOSED); Ladder or step platform for ceiling patches - per approved height/access policy (none exists, 02 G-005) (PROPOSED); Moisture check means for leak and water-damage repairs - type and use by qualified reviewer (PROPOSED - pending safety review); Texture tools and texture material - only if texture matching is confirmed as DW-01 scope (PROPOSED - conditional); Client-supplied paint - job record only, never stock (source `customer_provided`); condition, product and quantity recorded before use (spec START-009) (PROPOSED).

## Service-card defaults (spec section 17, DW-01)

- Tools and equipment (DW-01.TLS): utility knife/saw, drill/driver, taping knives, sanding/vacuum, light, measuring tools, PPE.
- Materials and consumables (DW-01.MAT): drywall, backing, screws, tape/mesh, joint compound, primer if included.

## SOP section 6, "PPE" (`Standard Of Operations/sop drywall-patching.md`)

TBD - pending safety review.
- A qualified safety professional selects PPE for the actual tasks after the higher-order controls: eliminate, substitute, engineer, administrative (source: 31 section 3.5 rule 6; safety-liability-manager "Prefer the hierarchy of controls").
- Tasks and hazards for that selection: cutting and scoring (section 12 "Clean Cut", "Beveling Edges"; spec DW-01.HAZ "sharp tools"); mixing compound and sanding (section 12 "First Coat (Setting Mud)", "Dust-Controlled Sanding"; spec DW-01.HAZ "silica/dust"); overhead and ceiling work (spec DW-01.HAZ "ladder for ceilings"); water-damaged material (spec DW-01.HAZ "possible mold/moisture"); primer application (product SDS).
- No PPE item, class, respirator or fall-protection equipment is selected in this draft; the spec card lists "PPE" without specifics (source: spec DW-01.TLS; C-DW01-01; risk-triage playbook "do not invent respirator selection, fit-test clearance, anchor load ratings, ladder setup tolerances or chemical mixing ratios").

## SOP section 7, "Tools and equipment" (`Standard Of Operations/sop drywall-patching.md`)

| Tool or equipment | Used in | Source | In the inventory file? |
|---|---|---|---|
| Stud finder or utility scanner | "Structural Scan"; HOLD before "Clean Cut" | spec DW-01.SAF "scan before cutting"; original step | No (C-DW01-11); whether a device detects wiring or pipes comes from its manufacturer documentation |
| Framing square and pencil | "Squaring the Patch" | original step; spec DW-01.TLS "measuring tools" | No (C-DW01-11) |
| Drywall hand saw (jab saw) and utility knife | "Clean Cut", "Stud Clearing", "Beveling Edges" | spec DW-01.TLS "utility knife/saw"; original steps | Yes: "Drywall Jab Saw", "Heavy-Duty Utility Knife" |
| Drill/driver (screw gun) | "Wood Backing Insertion", "Screw Fastening" | spec DW-01.TLS "drill/driver"; original steps | Yes: "Drywall Screw Gun / Cordless Drill" |
| Tape measure | "Sizing the Insert" | spec DW-01.TLS "measuring tools"; original step | Yes |
| Taping knives (a 6-inch knife; a 10-inch or 12-inch knife) | "First Coat (Setting Mud)", "Second Coat (Feather Coat)" | spec DW-01.TLS "taping knives"; original steps | Yes: "Stainless Steel Taping Knives Set" |
| Mud pan and a mixing container | The Phase 4 coats; "Mix a batch" in "First Coat (Setting Mud)" | original step | Mud pan: yes; mixing container: no (proposed in the inventory file) |
| Sanding sponge | "Dust-Controlled Sanding" | spec DW-01.TLS "sanding/vacuum"; original step | Yes: "Dual-Angled Sanding Sponges"; whether their grit matches the step is unverified |
| Cordless HEPA vacuum | No step uses it (C-DW01-11) | spec DW-01.TLS "sanding/vacuum"; inventory file | Yes; its use and the dust class needed are set by the qualified safety professional (29 section 5.2 `dust-control` kit) |
| High-powered LED light | "Flashlight Inspection" | spec DW-01.TLS "light"; original step | No (C-DW01-11) |
| Primer applicator for the can option | "Sealing Primer" | original step; 29 section 5.2 `paint-protection` kit | No; only the primer product is listed |
| Ladder or step platform for ceiling patches | No step; ceiling work is blocked (section 3) | spec DW-01.HAZ "ladder for ceilings" | No: only under an approved height and access policy, which does not exist (02 G-005; X-12) |
| Moisture check means for leak and water-damage repairs | HOLD before "Drop Cloths" | 29 section 7.3 ("Moisture check (recommendation pending review)"); spec DW-01.INT "active leak status" | No; type and use set by a qualified reviewer |
| Emergency kit (`vehicle-safety`: first-aid kit, fire extinguisher, eyewash, spill kit as review items) | Every job | 29 D-29-08; X-10 | No: contents by the qualified safety professional |
| PPE | See section 6 | spec DW-01.TLS "PPE" | No |

- Pre-use inspection of power tools, the scanner and any access equipment per the manufacturer instructions: TBD - qualified safety reviewer (source: 31 section 3.1 row 7).
- Critical tools are marked loaded before start, or an exception is recorded (source: spec START-005).

## SOP section 8, "Materials and consumables" (`Standard Of Operations/sop drywall-patching.md`)

- Drywall: precut replacement squares are stocked in the van; "Sizing the Insert" cuts the insert "from a fresh sheet" (source: spec DW-01.MAT "drywall"; inventory file "Replacement Drywall Panels Stock").
- Backing: the lumber or plywood slat of "Wood Backing Insertion" is not stocked (source: spec DW-01.MAT "backing"; C-DW01-11).
- Screws: drywall screws stocked; the fine-thread screws for metal studs are unused by the current steps (source: spec DW-01.MAT "screws"; inventory file).
- Tape/mesh: fiberglass mesh tape stocked; used in "Mesh Tape Application" (source: spec DW-01.MAT "tape/mesh"; inventory file).
- Joint compound: setting-type compound stocked; the lightweight ready-mix compound of "Second Coat (Feather Coat)" is not (C-DW01-11). Mix and use only as the product label and SDS direct; no ratio, set time or product is approved here (source: spec DW-01.MAT "joint compound"; 31 section 3.5 rules 3 and 8).
- Primer: primer-sealer stocked; the spec says "primer if included" while "Sealing Primer" primes every patch (source: spec DW-01.MAT; C-DW01-07).
- Microfiber cloths for "Dry Wiping": not stocked (source: original step; C-DW01-11).
- Client-supplied paint: condition, product and quantity recorded before use; the acceptance rule is pending (source: spec START-009; 29 section 9.1).
- Chemical products (compounds, primer-sealer) need a reviewed SDS before they are carried to a job (source: 29 section 8.3, PROPOSED; HUMAN REVIEW: qualified safety professional).
- Any substitution that affects appearance, specification, safety, cost or customer expectation needs approval according to policy (source: spec JOB-007).
