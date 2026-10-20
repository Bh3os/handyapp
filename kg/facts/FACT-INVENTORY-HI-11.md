---
id: FACT-INVENTORY-HI-11
type: fact
title: "Required tools and materials for Deck Maintenance & Board Repairs (HI-11)"
status: active
area: field
links:
  part_of: ["[[SVC-HI-11]]"]
  related: ["[[SOP-HI-11]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]", "[[RULE-NO-INVENTED-FACTS]]"]
source: "vault Required inventory/inventory-deck-repair.md; spec section 17 HI-11.TLS/.MAT; Standard Of Operations/sop-deck-repair.md sections 6-8"
---
Required tools, materials and PPE for [[SVC-HI-11]] and [[SOP-HI-11]]. The vault inventory is a draft checklist (`Required inventory/inventory-deck-repair.md`, `owner_approved: false`): quantities, stock levels, vendors, reorder points and ratings are not defined, and brand or rating words are kept as written, not approved. A missing critical tool, material or PPE item blocks the affected tasks ([[RULE-SAFETY-GATES]]).

## Inventory checklist as written (`Required inventory/inventory-deck-repair.md`)

#### 🛠️ A. Structural Fasteners & Hardware (البراغي والمسامير الإنشائية)
- [ ] **Premium Polymer-Coated Exterior Deck Screws (2-1/2 inch and 3-inch):** Resists rust staining on pressure-treated wood.
- [ ] **Galvanized Heavy Carriage Through-Bolts (1/2" x 5" and 1/2" x 7"):** With large flat washers and hex nuts (for post tightening).
- [ ] **Heavy-Duty Joist Hangers & Structural Ledger Wood Screws (SD WS style):** For framing code compliance.
- [ ] **Pressure-Treated Structural Lumber Stock (Stored in Van):** Selection of 2x4 rails, 2x6 floorboards, and 4x4 framing chunks.

> FLAG (C-HI11-02, critical; C-HI11-06) - "Heavy-Duty Joist Hangers & Structural Ledger Wood Screws (SD WS style)" line: hold pending structural review (C-HI11-02). "For framing code compliance" is an unverified code-compliance claim with no code, permit or qualification basis; it is not for customer use (HUMAN REVIEW: local building official; attorney licensed in KY/IN). No SOP procedure covers ledger or joist-hanger work, and the spec card allows "brackets/hangers only if approved": use only under an approved structural change order and a reviewed procedure (C-HI11-06; HUMAN REVIEW: structural engineer or building official). Item kept as listed. (source: spec HI-11.MAT, HI-11.SAF; 02 C-HI11-02, C-HI11-06)

#### ⚙️ B. Heavy Extraction & Compression Tooling (أدوات الفك والشد والترميم)
- [ ] **Drywall Lift Board Board Straightener (Bow-Wrench style):** Heavy lever tool to forcefully straighten warped deck boards straight before locking screws.
- [ ] **High-Torque Cordless 1/2-inch Impact Wrench Set:** For compressing massive structural ledger bolts flat.
- [ ] **Heavy-Duty Wood Crowbars & Cat's Paw Nail Pullers:** For pulling up embedded rusted fasteners cleanly.
- [ ] **Cordless Circular Saw (7-1/4 inch brush blade):** For clean on-site square trimming of fresh replacement floorboards.

> FLAG (C-HI11-06, C-HI11-08, C-HI11-10) - "Drywall Lift Board Board Straightener (Bow-Wrench style)" is a deck-board straightener (29 section 3.4); the name, including the repeated "Board", is kept verbatim and flagged for a logged cleanup after the owner confirms (36 section 5.4 item 23). No SOP step straightens boards. "High-Torque Cordless 1/2-inch Impact Wrench Set": its stated purpose, "structural ledger bolts", has no SOP procedure, so ledger work with it is held like the hardware above (C-HI11-06); it is not the impact driver that the SOP's "Screw Extraction" step names (C-HI11-08; proposed below). Items kept as listed.

Proposed additions in the vault file (from the SOP and spec cross-check; pending owner and safety review, nothing approved for purchase or use): PPE for prying, cutting, drilling, hammering, handling heavy lumber and work near deck edges - selection by qualified safety professional (PROPOSED); `vehicle-safety` kit reference (first-aid kit, fire extinguisher, eyewash, spill kit as review items; contents by the qualified safety professional) (PROPOSED); SDS register field for chemical products and battery packs (PROPOSED); Impact driver with driver bits (PROPOSED (critical item for START-005)); Reciprocating saw with metal-cutting demolition blades (PROPOSED (critical item for START-005)); Rot probe or awl, and flashlight (PROPOSED (critical item for START-005)); Tape measure and square (PROPOSED); Gap spacers (PROPOSED); Drill with a long bit matching the through-bolt diameter (size per the reviewed connection method) (PROPOSED (critical item for START-005)); Hammer (PROPOSED); Socket wrench and sockets for the carriage-bolt nuts (PROPOSED); Clamps (PROPOSED); Ladder or other access equipment - per approved height/access policy (none exists, 02 G-005) (PROPOSED (selection and use pending the policy, Q-31-09)); Fall controls for open board gaps, deck edges and work at a loose guard - per approved height/access policy (none exists, 02 G-005); selection by qualified safety professional (PROPOSED); Access-restriction items: barricade, caution tape and temporary covers for open board gaps - types per safety reviewer (PROPOSED (critical item for START-005 once the SOP hold is approved)); Replacement rail and stair components (types per approved scope) (OPEN QUESTION - not proposed for purchase until the owner keeps stair or rail work and a procedure is reviewed).

## Service-card defaults (spec section 17, HI-11)

- Tools and equipment (HI-11.TLS): saws, drill/driver, pry tools, clamps, socket/bolt tools, ladder/access, PPE.
- Materials and consumables (HI-11.MAT): deck boards, structural/exterior screws/bolts, brackets/hangers only if approved, replacement rail/stair components.

## SOP section 6, "PPE" (`Standard Of Operations/sop-deck-repair.md`)

- TBD - pending safety review. PPE for the card hazards (falls, nails/splinters, saws, heavy materials) and any fall-protection equipment for deck edges, openings and a loose guard are selected by the qualified safety professional; the inventory lists none (source: spec HI-11.TLS "PPE", HI-11.HAZ, HI-11.SAF "use fall controls as applicable"; inventory file; 29 section 7.3 HI-11 row).
- No PPE class, fall-protection equipment, ladder or respirator type is set here; dust control for cutting pressure-treated lumber is decided by the reviewer (source: 31 section 3.5 rule 6; risk-triage playbook "do not invent respirator selection, fit-test clearance, anchor load ratings, ladder setup tolerances or chemical mixing ratios").

## SOP section 7, "Tools and equipment" (`Standard Of Operations/sop-deck-repair.md`)

> Spec card HI-11.TLS (verbatim): "saws, drill/driver, pry tools, clamps, socket/bolt tools, ladder/access, PPE"

- Impact driver with a fresh bit for "Screw Extraction"; the inventory lists an impact wrench set, a different tool, so the driver is proposed there (source: spec HI-11.TLS "drill/driver"; C-HI11-08).
- Reciprocating saw with a metal demolition blade for "Screw Extraction" (not in the inventory; proposed there) (source: spec HI-11.TLS "saws"; C-HI11-08).
- Pry tools for "Joist Inspection" ("Pry up the rotted floorboard"): the crowbars and cat's paw nail pullers in the inventory (source: spec HI-11.TLS "pry tools"; inventory file).
- Rot probe or awl and flashlight for the support inspection (not in the inventory; proposed there as critical items) (source: spec HI-11.SAF "inspect support before loading/removing boards"; 29 section 7.4 HI-11 row).
- Circular saw for "New Board Hanging" (inventory "Cordless Circular Saw"); tape measure and square to cut a board "to fit the opening", and gap spacers for the expansion gap (not in the inventory; proposed there) (source: spec HI-11.TLS "saws"; 29 section 7.4 HI-11 row).
- Drill with a long bit for "Boring Bolt Shafts", hammer for "Through-Bolt Installation" and socket wrench for "Torque Locking" (not in the inventory, which lists only an impact wrench set; proposed there) (source: spec HI-11.TLS "drill/driver", "socket/bolt tools"; C-HI11-08).
- Clamps (source: spec HI-11.TLS "clamps"; proposed in the inventory).
- Ladder or other access equipment only under the approved height and access policy, which does not exist yet (source: spec HI-11.TLS "ladder/access"; 02 G-005; X-12).
- Access-restriction items: barricade, caution tape and temporary covers for open board gaps (not in the inventory; proposed there) (source: spec HI-11.SAF "restrict access"; C-HI11-03).
- Not used by this SOP: the inventory's board straightener; ledger work with the impact wrench is not covered (section 2) (source: inventory file; C-HI11-06).
- Pre-use inspection of tools per the manufacturer's instructions (source: 31 section 3.1, section 7 minimum content).

## SOP section 8, "Materials and consumables" (`Standard Of Operations/sop-deck-repair.md`)

> Spec card HI-11.MAT (verbatim): "deck boards, structural/exterior screws/bolts, brackets/hangers only if approved, replacement rail/stair components"

- Deck boards: the pressure-treated floorboard stock in the inventory, for "New Board Hanging"; species, profile and material match per the approved estimate (source: spec HI-11.MAT "deck boards", HI-11.INT "material match"; 04 HI-11 material assumptions).
- Exterior deck screws: the polymer-coated deck screws in the inventory; type, size and placement per the board and fastener manufacturers' instructions, and the size in the step is flagged in section 12 (source: spec HI-11.MAT "structural/exterior screws/bolts", HI-11.QAC "fasteners correct").
- Carriage bolts, washers and nuts for Option B: the galvanized through-bolts in the inventory; length field-measured against the actual assembly (section 12 flag) (source: spec HI-11.MAT; 31 section 10).
- Brackets and hangers only if approved: the inventory's joist hangers and ledger screws are not used without an approved structural change order and a reviewed procedure (source: spec HI-11.MAT "brackets/hangers only if approved"; C-HI11-06).
- Pressure-treated 2x4 stock: the sistering instruction it served is suspended (section 12); it is not used for structural support until the structural review clears (source: C-HI11-01; 31 section 10).
- Replacement rail and stair components: not covered (section 2) (source: spec HI-11.MAT; C-HI11-04).
- No step uses a chemical product; any coating or sealant is PT-02 work, not part of this SOP (source: 29 section 2.1; 04 HI-11 exclusions).
- Substitutions only with approval (source: spec JOB-007).
