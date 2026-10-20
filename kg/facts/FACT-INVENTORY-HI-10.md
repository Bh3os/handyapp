---
id: FACT-INVENTORY-HI-10
type: fact
title: "Required tools and materials for Fence Maintenance & Structural Repairs (HI-10)"
status: active
area: field
links:
  part_of: ["[[SVC-HI-10]]"]
  related: ["[[SOP-HI-10]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]", "[[RULE-NO-INVENTED-FACTS]]"]
source: "vault Required inventory/inventory-fence-repair.md; spec section 17 HI-10.TLS/.MAT; Standard Of Operations/sop-fence-repair.md sections 6-8"
---
Required tools, materials and PPE for [[SVC-HI-10]] and [[SOP-HI-10]]. The vault inventory is a draft checklist (`Required inventory/inventory-fence-repair.md`, `owner_approved: false`): quantities, stock levels, vendors, reorder points and ratings are not defined, and brand or rating words are kept as written, not approved. A missing critical tool, material or PPE item blocks the affected tasks ([[RULE-SAFETY-GATES]]).

## Inventory checklist as written (`Required inventory/inventory-fence-repair.md`)

#### 🧳 A. Stabilization Steel & Concrete Mixes (أدوات تدعيم الأعمدة والخرسانة)
- [ ] **Heavy-Gauge Galvanized Steel Fence Post Splints / EZ-Post Anchors:** Heavy metal plates driven into the ground to reinforce rotting posts.
- [ ] **Fast-Setting Concrete Mix (Sakrete / Quikrete red bag):** Sets hard in 20 minutes without prior mechanical mixing.
- [ ] **Exterior Polymer-Coated Framing Screws (3-inch T25):** High-torque structural screws resisting local wood rot acids.
- [ ] **Galvanized Steel Fence Bracket Hangers (2x4 clip sets):** For locking replacement rails between posts.
- [ ] **Anti-Sag Gate Cable Tensioner Kits:** Includes turnbuckles, braided steel cables, and corner structural brackets.

> FLAG (C-HI10-01, critical; C-HI10-06) - "Heavy-Gauge Galvanized Steel Fence Post Splints / EZ-Post Anchors" line: these are driven into the ground. Not authorized for use until utility-locate status and property authorization are recorded for the job, an approved SOP procedure exists (none does) and the qualified safety professional has reviewed it. Whether steel post splints are offered at all is an owner decision. Item kept as listed. (source: spec HI-10.SAF "utility-location/permit policy before digging"; HI-10.HAZ "underground utilities"; 02 C-HI10-01, C-HI10-06)

#### 🛠️ B. Digging & Demolition Hardware (معدات الحفر والخلع)
- [ ] **Manual Post-Hole Digger & Heavy Steel Digging Bar:** For cleaning out dirt, rocks, and root networks inside trenches.
- [ ] **Gas-Powered Handheld Post Hole Auger Machinery:** 2-stroke engine unit with an 8-inch auger bit (for rapid post-hole re-clearing).
- [ ] **Heavy-Duty Demolition Crowbar / Pry Wrecking Bar:** For stripping apart warped privacy pickets easily.
- [ ] **Cordless Reciprocating Saw (Sawzall):** With bi-metal demolition blades to slice rusted fence nails flush.

> FLAG (C-HI10-01, critical) - "Gas-Powered Handheld Post Hole Auger Machinery" line: not authorized for use until utility-locate status and property authorization are recorded for the job, an approved SOP step with controls exists (none does) and the qualified safety professional has reviewed it. Its engine fuel is not listed (see the proposed additions). The manual digging tools in this list are also used only after the SOP's utility-locate and property-authorization hold clears. Item kept as listed. (source: spec HI-10.SAF; 29 sections 7.2 item 10 and 7.3 HI-10 row; 02 C-HI10-01)

Proposed additions in the vault file (from the SOP and spec cross-check; pending owner and safety review, nothing approved for purchase or use): PPE for digging, cutting, drilling, lifting and concrete handling - selection by qualified safety professional (PROPOSED); `vehicle-safety` kit reference (first-aid kit, fire extinguisher, eyewash, spill kit as review items; contents by the qualified safety professional) (PROPOSED); SDS register field for the concrete mix and the auger fuel (PROPOSED); Utility-locate and property-authorization evidence (locate status and photo of the marks, authorization record) (PROPOSED); Trenching spade (PROPOSED); Post level (PROPOSED (critical item for START-005)); Bracing lumber and stakes for temporary kick-braces (PROPOSED (critical item for START-005 and START-006)); Clamps (PROPOSED); Water for the concrete pour, with a container or hose (PROPOSED (owner decides the source: `customer_provided` or HandyHub stock)); Cordless drill/driver and bits (PROPOSED); Tape measure (PROPOSED); Saw suitable for cutting rail stock to length - type per owner and safety reviewer (PROPOSED); Concrete tools - types per owner and safety reviewer (PROPOSED (only if concrete work stays in the approved scope)); Pressure-treated 2x4 rail stock (PROPOSED); Hole covers and caution tape for open holes and wet concrete - types per safety reviewer (PROPOSED); Engine fuel for the gas auger, as specified by the auger manufacturer (PROPOSED (only if the auger stays in use after review)); Approved fuel container - type per safety reviewer (PROPOSED (only if the auger stays in use after review)); Pickets and picket fasteners (species per approved estimate) (OPEN QUESTION - not proposed for purchase until the owner keeps picket work and a procedure is reviewed (C-HI10-06)); Gate hardware (hinges, latches, drop rods) (OPEN QUESTION - only if the owner keeps hardware replacement in scope (C-HI10-07)).

## Service-card defaults (spec section 17, HI-10)

- Tools and equipment (HI-10.TLS): post/rail tools, saw, drill/driver, digging tools, level, clamps, PPE, concrete tools if approved.
- Materials and consumables (HI-10.MAT): pressure-treated/cedar components, exterior structural fasteners, brackets, concrete if in scope, gate hardware.

## SOP section 6, "PPE" (`Standard Of Operations/sop-fence-repair.md`)

- TBD - pending safety review. PPE for the card hazards (underground utilities, collapse/unstable sections, saw/drill, heavy materials), for dry and wet concrete mix per the product SDS and for the gas auger if it stays in use is selected by the qualified safety professional; the inventory lists none (source: spec HI-10.TLS "PPE", HI-10.HAZ; inventory file; 29 section 7.3 HI-10 row "Concrete dust per SDS").
- Dust control and any respiratory protection for pouring dry mix are decided by the reviewer; no PPE class or respirator type is set here (source: 31 section 7.2 rank 12; risk-triage playbook "do not invent respirator selection").

## SOP section 7, "Tools and equipment" (`Standard Of Operations/sop-fence-repair.md`)

- Digging tools: the trenching spade named in "Slurry Excavation" (not in the inventory; proposed there) and the manual post-hole digger and digging bar listed in the inventory; used only after the section 3 hold clears (source: spec HI-10.TLS "digging tools"; inventory file; C-HI10-V01).
- Post level for "Plumb Bracing" (not in the inventory; proposed there as a critical item) (source: spec HI-10.TLS "level"; C-HI10-V01).
- Drill/driver and bits for "Rail Extraction", "New Rail Setting" and "Gate Re-Squaring" (not in the inventory; proposed there) (source: spec HI-10.TLS "drill/driver").
- Pry bar for "Rail Extraction" (source: inventory "Heavy-Duty Demolition Crowbar / Pry Wrecking Bar").
- Tape measure and a saw suitable for cutting rail stock for "New Rail Setting"; only a reciprocating saw with demolition blades is listed (source: spec HI-10.TLS "saw"; inventory file; both proposed there).
- Clamps (source: spec HI-10.TLS "clamps"; proposed in the inventory).
- Concrete tools only if approved (source: spec HI-10.TLS "concrete tools if approved").
- The gas-powered auger listed in the inventory is not used: no step or controls exist (section 2) (source: inventory auger line; C-HI10-01).
- Pre-use inspection of tools per the manufacturer's instructions (source: 31 section 3.1, section 7 minimum content).

## SOP section 8, "Materials and consumables" (`Standard Of Operations/sop-fence-repair.md`)

- Pressure-treated or cedar components: the pressure-treated 2x4 rail stock of "New Rail Setting" (not in the inventory; proposed there); species per the approved estimate (source: spec HI-10.MAT "pressure-treated/cedar components"; section 12 step).
- Exterior structural fasteners: the polymer-coated framing screws in the inventory; type and size per the bracket and fastener manufacturers' instructions (source: spec HI-10.MAT "exterior structural fasteners", HI-10.QAC "fasteners appropriate").
- Brackets: the galvanized fence bracket hangers in the inventory (source: spec HI-10.MAT "brackets").
- Concrete if in scope: the fast-setting concrete mix in the inventory. SDS required; a chemical product without a reviewed SDS is not carried to a job. Quantity per post from the product's yield; the pricing "Inclusions" quantity has no stated basis (source: spec HI-10.MAT "concrete if in scope"; 29 sections 5.4 and 8.3, PROPOSED; 04 HI-10 material assumptions).
- Water for the pour: source undefined (customer or HandyHub; owner decides); amount only per the product instructions (source: 29 section 5.4 HI-10 row "Water source undefined"; section 12 flag).
- Gate hardware: the anti-sag gate cable kits in the inventory; hinge, latch and drop-rod replacement is not covered (section 2) (source: spec HI-10.MAT "gate hardware"; C-HI10-07).
- Bracing lumber and stakes for the temporary braces (not in the inventory; proposed there as a critical item) (source: section 12 "Plumb Bracing"; pricing "temporary braces"; C-HI10-V01).
- Substitutions only with approval (source: spec JOB-007).
