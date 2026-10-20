---
id: FACT-INVENTORY-DW-03
type: fact
title: "Required tools and materials for Remodeling & Home Additions (DW-03)"
status: active
area: field
links:
  part_of: ["[[SVC-DW-03]]"]
  related: ["[[SOP-DW-03]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]", "[[RULE-NO-INVENTED-FACTS]]"]
source: "vault Required inventory/inventory-drywall-remodeling.md; spec section 17 DW-03.TLS/.MAT; Standard Of Operations/sop drywall-remodeling.md sections 6-8"
---
Required tools, materials and PPE for [[SVC-DW-03]] and [[SOP-DW-03]]. The vault inventory is a draft checklist (`Required inventory/inventory-drywall-remodeling.md`, `owner_approved: false`): quantities, stock levels, vendors, reorder points and ratings are not defined, and brand or rating words are kept as written, not approved. A missing critical tool, material or PPE item blocks the affected tasks ([[RULE-SAFETY-GATES]]).

## Inventory checklist as written (`Required inventory/inventory-drywall-remodeling.md`)

A complete hardware layout tailored for full residential remodeling setups, basement buildouts, and structural wall partitions.

#### 🏗️ 1. Framing & Heavy Installation Hardware
- [ ] **Laser Level System:** 360-degree green beam self-leveling laser with tripod mounting to establish true plumb lines.
- [ ] **Heavy-Duty Stud Fasteners:** Electric framing nailers or heavy-duty impact drivers for securing top and bottom tracking plates.
- [ ] **Drywall Panel Lift (The Jack):** Telescopic rolling panel lift capable of cradle-holding and lifting 12-foot sheets up to 11-foot high ceilings safely.
- [ ] **Drywall Stilts (Magnesium Stilts):** Adjustable 18-to-30 inch professional stilts for fast high-wall hanging and seamless taping without moving ladders.

#### 🧽 2. Complete Taping & Corner Bead Station
- [ ] **Drywall Mud Mixer:** Heavy-duty, high-torque corded mud mixer drill with a chrome-plated carbon steel mixing paddle (for whipping buckets flat).
- [ ] **Corner Bead Crimper Tool:** For fast mechanical attachment of outside metal corner beads without screws.
- [ ] **Mud Hogs & Hawks:** 13-inch aluminum hawks and internal/external specialized corner tools.
- [ ] **Full Taping Knives Set:** 6", 8", 10", 12", and 14-inch blue steel taping knives with flexible handles.

#### 🧴 3. Specialized Board & Consumables Stock
- [ ] **Premium Joint Tape Stock:** 5 rolls of heavy-duty fibrous paper joint tape (best for structural code strength on structural renovations).
- [ ] **Specialty Technical Panels:**
	- [ ] **Greenboard / Purpleboard:** 1/2-inch mold and moisture resistant sheets for bathrooms.
	- [ ] **Type X Sheets:** 5/8-inch fire-rated sheets for garage ceiling separation lines.
- [ ] **Corner Bead Inventory:** 10 pieces of 10-foot straight outside metal beads and 5 pieces of flexible archway vinyl beads.

Proposed additions in the vault file (from the SOP and spec cross-check; pending owner and safety review, nothing approved for purchase or use): PPE per the card's tools and hazard rows (dust from cutting and sanding; heavy-panel handling; overhead and elevated work) - selection by qualified safety professional (PROPOSED); `vehicle-safety` kit reference: first-aid kit, fire extinguisher, eyewash, spill kit and SDS access as review items - contents by qualified safety professional (PROPOSED); SDS register entry for each chemical product used (joint compounds; insulation and generator fuel only if approved) (PROPOSED); Chalk line (PROPOSED); Studs and track, wood or steel per the approved plans (PROPOSED - framing only behind the SOP's structural hold (C-DW03-01)); Solid wood blocking (backing) (PROPOSED); Structural wood screws and concrete anchors for plates (HOLD - structural scope needs engineer or building official (C-DW03-01); type and size only from the approved plans and the fastener manufacturer); Tool for setting concrete anchors in slabs - type by owner and qualified safety professional (HOLD - with the anchors above (C-DW03-01)); Standard 1/2-inch drywall sheets (PROPOSED); Drywall screws, type and length per the board manufacturer and any listed assembly (PROPOSED); Screw guns able to set heads as the "Fastener Pattern" step requires (PROPOSED); Saws and cutting tools for board and framing (PROPOSED); Joint compounds named in the steps: "multi-purpose joint compound", "topping compound", "lightweight mud" (PROPOSED - a chemical product without a reviewed SDS is not carried to a job (29 section 8.3, PROPOSED; HUMAN REVIEW: qualified safety professional)); Sanding sponges ("fine 180-grit sponge") (PROPOSED); Work light for the light test (PROPOSED); Vacuum (dust class set by the safety reviewer), damp-wipe cloths and broom (PROPOSED); Plastic isolation curtains with supports and tape, as the agreement's "Dust Containment" clause describes (PROPOSED - pending the owner's containment standard and qualified safety review); Floor and surface protection for the work area (PROPOSED); Debris containers and bags for construction waste (offcuts, empty compound containers, used protection) (PROPOSED); Ladders or other access equipment for ceiling and high-wall work - per approved height/access policy (none exists, 02 G-005) (PROPOSED); Dump trailer for demolition debris - rent-or-buy candidate (Q-29-08) (HOLD - demolition is on hold pending lead and asbestos screening (C-DW03-02)); Insulation as sold in the pricing add-on (HOLD - only if the owner approves the insulation add-on and a reviewed SOP step exists (C-DW03-04)); Portable generator and water hauling - rent-or-buy candidate (Q-29-08) (HOLD - pending the owner's decision on the utilities surcharge and qualified safety review of generator use (carbon monoxide)).

## Service-card defaults (spec section 17, DW-03)

- Tools and equipment (DW-03.TLS): framing tools, saws, screw guns, lifts, taping/finishing tools, lasers, access equipment, PPE.
- Materials and consumables (DW-03.MAT): studs/track, drywall type, screws, tape, compound, corner bead, backing, protection.

## SOP section 6, "PPE" (`Standard Of Operations/sop drywall-remodeling.md`)

TBD - pending safety review. No PPE type, class or respirator is selected here (source: 31 section 3.5 rule 6; risk-triage playbook "do not invent respirator selection, fit-test clearance").

- The card lists "PPE" without detail; neither the inventory nor the original steps list any PPE (source: spec DW-03.TLS; 04 DW-03 PPE; C-DW03-08).
- Dust from cutting, sanding and any demolition: respiratory and eye protection are selected by the qualified safety professional from a task hazard assessment and the product SDS (source: spec DW-03.HAZ "dust"; 04 DW-03 PPE).
- Heavy panels, overhead work, stilts and the panel lift: protection pending qualified safety review (source: spec DW-03.HAZ "heavy panels, lifts", "falls"; C-DW03-08).
- Insulation is not installed under this SOP; if the owner adds it, skin and respiratory protection for it come from the reviewer first (source: C-DW03-04).
- PPE is the last layer after elimination, substitution, engineering and administrative controls (source: safety-liability-manager "Prefer the hierarchy of controls: eliminate, substitute, engineer, administratively control, then PPE.").

## SOP section 7, "Tools and equipment" (`Standard Of Operations/sop drywall-remodeling.md`)

- Layout: a chalk line (original "Plumb Line Layout" step; not stocked) and the "Laser Level System" (source: spec DW-03.TLS "lasers"; inventory file).
- Framing tools: "Electric framing nailers or heavy-duty impact drivers" (inventory "Heavy-Duty Stud Fasteners"); a tool for setting concrete anchors in slabs is not stocked, and its type is decided by the owner and the qualified safety professional (source: spec DW-03.TLS "framing tools"; original "Fastening Tracks" step; C-DW03-10).
- Saws and cutting tools for board and framing: not stocked; proposed in the inventory (source: spec DW-03.TLS "saws").
- Screw guns: the card lists them and the inventory lists impact drivers only; whether those set heads as the "Fastener Pattern" step requires is an owner and job-planner decision (source: spec DW-03.TLS "screw guns"; original "Fastener Pattern" step).
- Lifts and access equipment: "Drywall Panel Lift (The Jack)" and "Drywall Stilts" (inventory); ladders are not stocked. All are used only per their manufacturers' instructions and an approved height and access policy, which does not exist yet (02 G-005; X-12; C-DW03-08) (source: spec DW-03.TLS "lifts", "access equipment").
- Taping and finishing tools: mud mixer, corner bead crimper, hawks and corner tools, taping knives (inventory); the steps name "a 6-inch knife" and "a wide 12-inch or 14-inch knife" (source: spec DW-03.TLS "taping/finishing tools"; original steps).
- Inspection light: the "commercial halogen work light" of "The Light Test" step; not stocked (source: original step; C-DW03-10).
- Cleanup: vacuum, cloths and broom for "Site Cleanup"; not stocked; the vacuum's dust class is set by the safety reviewer (source: original step; 29 section 5.2 kit `dust-control`).
- Generator: only if the owner keeps the agreement's generator provision and a qualified safety professional approves its use and placement (source: agreement "Active Utilities Mandatory" clause; C-DW03-V01; 29 sections 3.2 and 9.2, rent-or-buy candidate, Q-29-08).
- Required, optional, rental and proposed items are listed in the inventory.

## SOP section 8, "Materials and consumables" (`Standard Of Operations/sop drywall-remodeling.md`)

- Studs and track, wood or steel, per the approved plans; not stocked (source: spec DW-03.MAT "studs/track"; main plan "wood or steel stud wall partitions"; C-DW03-10).
- Plate fasteners: the "Fastening Tracks" step names "structural wood screws (for wood joists) or concrete anchors (for basement floor slabs)"; type, size and spacing come only from the approved plans and the fastener manufacturer, and they stay on the structural HOLD while the structural scope is undecided (source: original step; risk-triage playbook "do not invent ... anchor load ratings"; C-DW03-01).
- Backing: solid wood blocking (source: original "Fire-Blocking & Blocking" step; spec DW-03.MAT "backing").
- Drywall type per the board allocation map and the approved plans: standard board (not stocked), moisture-resistant board and fire-rated Type X board (source: original "Board Allocation Map"; spec DW-03.MAT "drywall type"; DW-03.SAF "use correct board/system"; inventory file).
- Drywall screws: not stocked; type and length per the board manufacturer and any listed assembly (source: spec DW-03.MAT "screws"; original "Fastener Pattern" step).
- Tape: paper joint tape (inventory "Premium Joint Tape Stock") (source: spec DW-03.MAT "tape").
- Compound: "multi-purpose joint compound", "topping compound" and "lightweight mud" are named in the steps; none is stocked; products per the approved product list with an SDS (source: spec DW-03.MAT "compound"; original Phase 3 and Phase 4 steps; 31 section 3.5 rule 8).
- Corner bead: metal or composite per the step, while the agreement specifies "metal corner beads"; the approved material is an owner decision, and a substitution that affects specification or customer expectation needs approval (source: spec DW-03.MAT "corner bead"; JOB-007; C-DW03-V02).
- Protection: floor and surface protection for the work area; the containment curtains that the agreement describes are not covered (section 2) (source: spec DW-03.MAT "protection"; APXA-002; C-DW03-03).
- Every chemical product, such as joint compound, needs a reviewed SDS before it is carried to a job (source: 29 section 8.3, PROPOSED; 02 G-008).
- Customer-supplied materials: none is named; if a customer supplies board or other material, record its condition, model and quantity before installation (source: spec START-009; 29 section 9.1).
