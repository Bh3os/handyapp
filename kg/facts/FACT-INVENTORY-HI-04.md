---
id: FACT-INVENTORY-HI-04
type: fact
title: "Required tools and materials for TV Mounting & Wire Hiding (HI-04)"
status: active
area: field
links:
  part_of: ["[[SVC-HI-04]]"]
  related: ["[[SOP-HI-04]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]", "[[RULE-NO-INVENTED-FACTS]]"]
source: "vault Required inventory/inventory-tv-mounting.md; spec section 17 HI-04.TLS/.MAT; Standard Of Operations/sop-tv-mounting.md sections 6-8"
---
Required tools, materials and PPE for [[SVC-HI-04]] and [[SOP-HI-04]]. The vault inventory is a draft checklist (`Required inventory/inventory-tv-mounting.md`, `owner_approved: false`): quantities, stock levels, vendors, reorder points and ratings are not defined, and brand or rating words are kept as written, not approved. A missing critical tool, material or PPE item blocks the affected tasks ([[RULE-SAFETY-GATES]]).

## Inventory checklist as written (`Required inventory/inventory-tv-mounting.md`)

#### 🛠️ A. Heavy Fasteners & Brackets (أدوات التثبيت والتعليق)
- [ ] **Heavy-Duty Structural Hex Lag Bolts (5/16" x 3"):** For direct anchoring into wood framing studs.
- [ ] **High-Tensile Metal Hollow-Wall Toggle Anchors:** Fallback hardware for steel stud commercial layouts.
- [ ] **Standard Flat, Tilting, and Full-Motion Articulated Brackets Assortment:** Stocked inside the van.
- [ ] **Low-Voltage In-Wall Cable Routing Boxes & Brush Faceplates:** For clean hidden wire entries.
- [ ] **High-Quality Black Zip-Ties & Hook-and-Loop Velcro Cable Wraps:** For rear cord bundling.

#### ⚙️ B. Specialized Drilling & Wire-Fishing Hardware (معدات ثقب وسحب الأسلاك)
- [ ] **Cordless Impact Driver with Magnetic Hex Socket Set:** For driving heavy lag bolts rapidly.
- [ ] **Wood Paddle Bits & Hole Saws:** 1-inch and 2-inch sizes for boring low-voltage wire pass-through paths.
- [ ] **Flexible Fiberglass Fish Tape Rods (15-foot):** For pulling HDMI lines behind residential drywall.
- [ ] **Drywall Hand Saw (Jab Saw):** For cutting precise plastic entry boxes out without fracturing board trims.
- [ ] **Digital Stud Scanner with Multi-Mode Edge/Center Detection:** Verifies wood vs. metal stud backings.

Proposed additions in the vault file (from the SOP and spec cross-check; pending owner and safety review, nothing approved for purchase or use): PPE for drilling, drywall cutting, heavy lift and ladder work - selection by qualified safety professional (PROPOSED); `vehicle-safety` kit reference: first-aid kit, fire extinguisher, eyewash, spill kit as review items (PROPOSED - contents by qualified safety professional); SDS register field for chemical products and batteries (PROPOSED); Pencil (PROPOSED); Bubble level (PROPOSED); Drill/driver with wood pilot bit (PROPOSED - bit type and size per the mount and fastener instructions); Torque and hand tools (PROPOSED); Tape measure (PROPOSED); Cable-pulling aid for attaching cables to the fish tape (PROPOSED); Ladder - per approved height/access policy (none exists, 02 G-005) (PROPOSED - type and rating by qualified safety professional); Drop cloth and floor protection (PROPOSED); Dust collection or vacuum for drilling and cutout dust (PROPOSED - dust class by qualified safety professional); Non-contact voltage detector (PROPOSED - pending safety review; not an adopted control); Masonry anchors and masonry tooling (ON HOLD - only if the masonry add-on is approved (C-HI04-07)); Soundbar mounting hardware (ON HOLD - scope decision (C-HI04-11)); In-wall conduit (ON HOLD - scope decision (C-HI04-14)); Lift help (second worker) (NOTE); Item (Status); TV (PROPOSED; acceptance and liability rule pending (X-22; Q-29-07)); Mount, where the customer supplies it (PROPOSED; same rule pending); HDMI and media cables (SOP Option B) (PROPOSED; same rule pending).

## Service-card defaults (spec section 17, HI-04)

- Tools and equipment (HI-04.TLS): stud scanner, level, drill/driver, torque/hand tools, socket set, fish tools for approved low-voltage path, ladder, lift help.
- Materials and consumables (HI-04.MAT): rated fasteners, customer/HandyHub mount, low-voltage pass-through components if permitted, cable management.

## SOP section 6, "PPE" (`Standard Of Operations/sop-tv-mounting.md`)

TBD - pending safety review.
- No PPE is listed in this SOP, the inventory file or the spec card (source: 04 HI-04 PPE row).
- Tasks that need a PPE decision by the qualified safety professional: drilling (dust), drywall cutting (dust and jab-saw cuts), heavy lift and ladder work (source: 04 HI-04 PPE row; spec HI-04.HAZ). No PPE type or class is selected here (source: 31 section 3.5 rule 6).

## SOP section 7, "Tools and equipment" (`Standard Of Operations/sop-tv-mounting.md`)

| Tool or equipment | Used in | Source | In the inventory file? |
|---|---|---|---|
| Stud scanner ("deep-scanning stud finder") | Center Locating; hidden-service checks (section 12 holds) | spec HI-04.TLS "stud scanner"; original step | Yes: "Digital Stud Scanner with Multi-Mode Edge/Center Detection", which "Verifies wood vs. metal stud backings"; whether it detects wiring or pipes is not stated (02 C-HI04-02) |
| Pencil | Center Locating | original step | No (C-HI04-13) |
| Bubble level | Pilot Hole Boring; level check (section 13) | original step; spec HI-04.TLS "level" | No (C-HI04-13) |
| Drill/driver with a wood drill bit | Pilot Hole Boring | original step "using a wood drill bit"; spec HI-04.TLS "drill/driver" | No: the file lists an impact driver, paddle bits and hole saws (C-HI04-13) |
| Impact driver with socket ("impact socket wrench") | Lag Bolt Driving | original step; spec HI-04.TLS "socket set" | Yes: "Cordless Impact Driver with Magnetic Hex Socket Set" |
| Torque and hand tools | Fastening per the mount instructions | spec HI-04.TLS "torque/hand tools" | No (C-HI04-13) |
| Tape measure | Cutout Mapping | original step (box position measured from the floor); 29 section 7.4 | No (C-HI04-13) |
| Drywall hand saw (jab saw) | Drywall Cutout | original step | Yes: "Drywall Hand Saw (Jab Saw)" |
| Fiberglass fish tape | Conduit Fish Tape Run | original step; spec HI-04.TLS "fish tools for approved low-voltage path" | Yes: "Flexible Fiberglass Fish Tape Rods (15-foot)" |
| Means of securing cables to the fish tape | Conduit Fish Tape Run | original step "Secure HDMI and media cables to the tape" | No (29 section 7.4) |
| Ladder | As needed | spec HI-04.TLS and HI-04.HAZ "ladder" | No: only under an approved height and access policy, which does not exist yet (02 G-005; X-12) |
| Lift help | Lifting the TV | spec HI-04.TLS "lift help" | Staffing, not inventory (29 section 7.3) |
| Wood paddle bits and hole saws | No step bores pass-through paths | inventory file | Yes: use only under an approved procedure (C-HI04-08) |
| Emergency kit (`vehicle-safety`: first-aid kit, fire extinguisher, eyewash, spill kit as review items) | Every job | 29 D-29-08; X-10 | No: contents by the qualified safety professional |
| Non-contact voltage detector | Support for the hidden-service checks | 02 C-HI04-02 | No: PROPOSED, pending safety review; not an adopted control |

- Pre-use inspection of power tools, the scanner and any ladder per the manufacturer instructions: TBD - qualified safety reviewer (source: 31 section 3.1).
- Critical tools are marked loaded before start, or an exception is recorded (source: spec START-005).

## SOP section 8, "Materials and consumables" (`Standard Of Operations/sop-tv-mounting.md`)

- Rated fasteners as the mount instructions specify; the inventory file lists "Heavy-Duty Structural Hex Lag Bolts", whose fit with each mount is unverified (source: spec HI-04.MAT "rated fasteners"; spec HI-04.SAF "use structural attachment per instructions"; inventory file).
- Mount: customer-supplied or HandyHub-supplied (source: spec HI-04.MAT "customer/HandyHub mount"); who supplies it is undecided (X-22; Q-29-14); a customer-supplied mount needs the START-009 record.
- Option B: low-voltage entry boxes and brush faceplates, only if permitted (source: spec HI-04.MAT "low-voltage pass-through components if permitted"; inventory file; pricing wire-hiding line).
- HDMI and media cables: customer-supplied (source: agreement "Hardware Sufficiency" clause).
- Cable management within the approved scope (source: spec HI-04.MAT "cable management", HI-04.QAC). The inventory lists zip ties and hook-and-loop wraps, but no step uses them yet.
- The inventory lists hollow-wall toggle anchors for metal-stud walls, which this SOP does not cover (source: inventory file; C-HI04-07).
- No chemical product is listed for HI-04 (source: 29 section 2.1).
- Any substitution that affects specification, safety, cost or customer expectation needs approval (source: spec JOB-007).
