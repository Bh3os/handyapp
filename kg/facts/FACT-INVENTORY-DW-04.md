---
id: FACT-INVENTORY-DW-04
type: fact
title: "Required tools and materials for Residential New Construction (DW-04)"
status: active
area: field
links:
  part_of: ["[[SVC-DW-04]]"]
  related: ["[[SOP-DW-04]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]", "[[RULE-NO-INVENTED-FACTS]]"]
source: "vault Required inventory/inventory-new-construction.md; spec section 17 DW-04.TLS/.MAT; Standard Of Operations/sop new-construction.md sections 6-8"
---
Required tools, materials and PPE for [[SVC-DW-04]] and [[SOP-DW-04]]. The vault inventory is a draft checklist (`Required inventory/inventory-new-construction.md`, `owner_approved: false`): quantities, stock levels, vendors, reorder points and ratings are not defined, and brand or rating words are kept as written, not approved. A missing critical tool, material or PPE item blocks the affected tasks ([[RULE-SAFETY-GATES]]).

## Inventory checklist as written (`Required inventory/inventory-new-construction.md`)

tags: #inventory/tools #inventory/drywall #service/new-construction

This profile maps out the highly automated, mechanical tools required to run a high-velocity production drywall line at scale.

#### 🚀 1. The Automatic Taping Tool Suite (ATTs - أدوات الأتمتة الميكانيكية)
*These tools represent a major financial investment but increase production speed by 300%.*

> FLAG (C-DW04-12) - the italic note under the section 1 heading: UNVERIFIED CLAIM. Its production-speed figure is an unmeasured performance claim, not a production factor; it is not used for estimating, scheduling or marketing unless it is measured and approved (HUMAN REVIEW: owner; attorney for any customer-facing use). Whether HandyHub buys or rents this tool suite, which the note calls "a major financial investment", is an open owner decision (02 G-060; Q-29-08). Note kept as written.

- [ ] **Automatic Drywall Taper (The Bazooka):** Simultaneously feeds joint compound and paper tape directly over flat and corner joints at high velocity.
- [ ] **Mechanical Skimming Flat Boxes:** 7-inch, 10-inch, and 12-inch mechanical box assemblies to lay down perfectly measured, flat coats over joints.
- [ ] **Extendable Box Handles:** 3-to-5 foot extendable handles controlling flat box distribution pressure.
- [ ] **Automatic Loading Pump:** Heavy-duty compound pump fitted with a flat box filler nozzle and a bazooka gooseneck attachment to fill mechanical tools from 5-gallon buckets in seconds.
- [ ] **Corner Applicator & Corner Finishers (Flushers):** 3-inch and 3.5-inch flushers to instantly wipe and glaze internal 90-degree corners cleanly.

#### 🔨 2. High-Speed Production Fastening Tools
- [ ] **Collated Auto-Feed Drywall Screw Guns:** High-RPM cordless screw guns utilizing linked collated plastic screw strips (allows one-handed rapid fastening).
- [ ] **Drywall Router / Cutout Tool:** High-speed 30,000 RPM spiral-cut router tool with guide point bits to instantly zip open cutouts for electrical outlet boxes and canned lights after hanging.
- [ ] **Rolling Scaffold Towers:** 6-foot interior rolling scaffold bents (Baker Scaffolds) with lockable casters for fast multi-room ceiling production.

> FLAG (C-DW04-01, critical; X-12) - "Rolling Scaffold Towers" line: pending height/access policy and inspection step (C-DW04-01). Scaffolds may be used only under an approved policy (spec DW-04.TLS "scaffolds/stilts only under approved policy"); no such policy, inspection step, set-up method or qualification tag exists (02 G-005; Q-31-09), and no SOP step uses the towers. Not authorized for use until the qualified safety professional has reviewed them and the owner has approved the policy. Item kept as listed. (source: spec DW-04.TLS; DW-04.HAZ "falls, scaffold/stilt risk"; DW-04.SAF "equipment qualification"; 02 C-DW04-01)

#### 🧴 3. Industrial-Scale Bulk Consumables
- [ ] **Bulk Pallet Procurement:** Pre-ordered batches of 4'x12' panels (reduces joint counts on long production walls by 33%).
- [ ] **Drywall Structural Adhesive:** 2 cases of heavy-duty latex-based subfloor/drywall glue tubes with high-capacity caulking guns.
- [ ] **Industrial Power Sander Discs:** 1 box of 150-grit anti-clogging mesh sanding pads for automatic long-reach power sander units.

> FLAG (C-DW04-12) - "Bulk Pallet Procurement" line: the joint-count figure is an unmeasured claim, kept as written and not repeated or used for estimating. Board may also be supplied by the general contractor (pricing "material bulk ordered by GC"); such board is a customer-provided item whose count, type and visible condition are recorded before hanging (spec START-009; 29 section 9.1). Board types, thicknesses and lengths come from the builder plans (spec DW-04.INT), and the SOP's "Panel Lifter System" step uses longer sheets than the one size listed here. Item kept as listed.

Proposed additions in the vault file (from the SOP and spec cross-check; pending owner and safety review, nothing approved for purchase or use): PPE for power sanding, cutting, handling heavy sheets and any elevated work - selection by qualified safety professional (PROPOSED); `vehicle-safety` kit reference (first-aid kit, fire extinguisher, eyewash, spill kit as review items; contents by the qualified safety professional) (PROPOSED); SDS register field for chemical products (the listed adhesive; joint compound once added) (PROPOSED); Mechanical panel lifts (drywall jacks) (PROPOSED - per approved height/access policy (none exists, 02 G-005); qualification tag and pre-use inspection pending review (C-DW04-01)); Panel carts (PROPOSED); Thermometer for the temperature precondition (PROPOSED - type, accuracy and the record are set by the owner and the quality reviewer); Collated screw strips (PROPOSED - fastener type and length per the board manufacturer and the listed assembly); Paper joint tape (PROPOSED); Bulk joint compound (PROPOSED - chemical product: reviewed SDS before it is carried to a job (29 section 8.3); drying times per the manufacturer); Long-reach rotary drywall sanders (PROPOSED - the brand examples in the step are not an approved product list); Class M dust extractors (PROPOSED - dust class, filters and maintenance by the qualified safety professional); Manual pole sanders (PROPOSED); Metal corner bead (PROPOSED - who installs it is a scope decision: installation is "Not covered - pending review" in the SOP); Corner-bead installation tools (PROPOSED - only if the owner adds a reviewed installation step); LED scanning bar (PROPOSED - the output rating written in the step is not an approved value); Drywall cutting tools - types per owner (PROPOSED - cut hazards and PPE per safety review); Board in the types, thicknesses and lengths of the builder plans' board schedule (PROPOSED - quantities from the builder plans (29 section 5.4 DW-04 row)); Specialty assembly materials (fire- or sound-rated) per the builder plans (PROPOSED - per the builder plans and the listed assembly; HUMAN REVIEW: building official (assemblies)); START-009 delivery record for builder-supplied board (count, type, visible condition, photos) (PROPOSED (`customer_provided`)); Drywall stilts (OPEN QUESTION - only if an approved height/access policy allows them (none exists, 02 G-005; C-DW04-01; Q-31-09)).

## Service-card defaults (spec section 17, DW-04)

- Tools and equipment (DW-04.TLS): panel lifts/carts, screw guns, cutting tools, automatic finishing tools where used, scaffolds/stilts only under approved policy, PPE.
- Materials and consumables (DW-04.MAT): bulk drywall, screws, tape, compound, corner bead, specialty assemblies.

## SOP section 6, "PPE" (`Standard Of Operations/sop new-construction.md`)

- TBD - pending safety review. PPE for the card hazards (material handling, falls, scaffold/stilt risk, repetitive strain, dust, incomplete framing/utilities) and for power sanding, cutting and handling heavy sheets is selected by the qualified safety professional; the inventory lists none (source: spec DW-04.TLS "PPE", DW-04.HAZ; inventory file; 29 section 7.3 DW-04 row).
- Respiratory protection for sanding and cutting dust is decided by the reviewer together with the dust-control method. The Class M extraction in "Power Sander Deployment" is an engineering control, not a substitute for that decision; no respirator type is set here (source: original Phase 4; risk-triage playbook "do not invent respirator selection"; safety-liability-manager hierarchy of controls).
- Hearing protection near the high-speed router and power sanders, and fall protection where the height and access policy requires it, are reviewer decisions (source: inventory router line; original Phase 4; 04 DW-04 PPE row).

## SOP section 7, "Tools and equipment" (`Standard Of Operations/sop new-construction.md`)

- Panel lifts and carts: the mechanical panel lifts of "Panel Lifter System" (not in the inventory; proposed there) and panel carts for moving sheets (proposed in the inventory); lifts only with equipment qualification and a pre-use inspection (section 12 hold) (source: spec DW-04.TLS "panel lifts/carts"; C-DW04-08).
- Screw guns: the collated auto-feed screw guns in the inventory (source: spec DW-04.TLS "screw guns"; inventory file).
- Cutting tools: types per the owner; only the router is listed, and router cutouts are not covered (section 2) (source: spec DW-04.TLS "cutting tools").
- Automatic finishing tools where used: the automatic taper, flat boxes with extendable handles, loading pump and corner finishers in the inventory (source: spec DW-04.TLS "automatic finishing tools where used"; inventory file).
- Sanding and dust control: long-reach rotary sanders and Class M dust extractors for "Power Sander Deployment" and manual pole sanders for "Bead Buffing" (none in the inventory; proposed there). The brand examples in that step are kept verbatim and are not an approved product list (source: original Phase 4; 31 section 3.5 rule 8; C-DW04-08).
- Inspection lighting: the LED scanning bar of "Flashing Verification" (not in the inventory; proposed there); the output rating in the step is not an approved value (source: original Phase 5; spec DW-04.QAC "punch under lighting").
- Temperature measurement for the "Climate Verification" precondition: a thermometer is proposed in the inventory (source: 29 section 7.4 DW-04 row; C-DW04-04).
- Scaffolds and stilts only under an approved policy; the rolling scaffold towers in the inventory are not used (section 2) (source: spec DW-04.TLS; C-DW04-01).
- Box sizes, grit and ratings written in the steps are kept verbatim and are not approved values; pre-use inspection of tools and equipment follows the manufacturer's instructions (source: 31 section 3.1, section 7 minimum content; 29 section 2.3).

## SOP section 8, "Materials and consumables" (`Standard Of Operations/sop new-construction.md`)

- Bulk drywall in the types, thicknesses and lengths of the builder plans' schedule; the inventory lists one panel size, while "Panel Lifter System" uses longer sheets (source: spec DW-04.MAT "bulk drywall"; DW-04.INT "board types/thicknesses"; inventory "Bulk Pallet Procurement").
- Supplier: HandyHub (all-in jobs) or the general contractor (pricing "material bulk ordered by GC"); builder-supplied board is recorded before hanging and stays customer property (source: pricing benchmark lines; spec START-009; 29 section 9.1).
- Screws: collated screw strips for "Fastener Automation" (not in the inventory; proposed there); type, length and spacing per the board manufacturer and the listed assembly (source: spec DW-04.MAT "screws"; C-DW04-02).
- Tape and compound: paper tape and joint compound for Phase 3 (neither in the inventory; proposed there). Joint compound is a chemical product: it needs a reviewed SDS before it is carried to a job, and its drying times come from the manufacturer (source: spec DW-04.MAT "tape, compound"; 29 section 8.3, PROPOSED).
- Corner bead: metal corner bead (source: spec DW-04.MAT "corner bead"); installation is not covered (section 2).
- Specialty assemblies: fire- or sound-rated assembly materials per the builder plans and the listed assembly (source: spec DW-04.MAT "specialty assemblies"; HUMAN REVIEW: building official).
- Structural adhesive for "Adhesive Layering": SDS required; a chemical product without a reviewed SDS is not carried to a job (source: inventory "Drywall Structural Adhesive"; 29 section 8.3, PROPOSED).
- Sanding discs for "Unified Grit Sequence" (source: inventory "Industrial Power Sander Discs").
- Substitutions only with approval (source: spec JOB-007).
