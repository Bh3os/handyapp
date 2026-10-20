---
id: FACT-INVENTORY-HI-05
type: fact
title: "Required tools and materials for Door Hardware & Smart Locks (HI-05)"
status: active
area: field
links:
  part_of: ["[[SVC-HI-05]]"]
  related: ["[[SOP-HI-05]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]", "[[RULE-NO-INVENTED-FACTS]]"]
source: "vault Required inventory/inventory-smart-locks.md; spec section 17 HI-05.TLS/.MAT; Standard Of Operations/sop-smart-locks.md sections 6-8"
---
Required tools, materials and PPE for [[SVC-HI-05]] and [[SOP-HI-05]]. The vault inventory is a draft checklist (`Required inventory/inventory-smart-locks.md`, `owner_approved: false`): quantities, stock levels, vendors, reorder points and ratings are not defined, and brand or rating words are kept as written, not approved. A missing critical tool, material or PPE item blocks the affected tasks ([[RULE-SAFETY-GATES]]).

## Inventory checklist as written (`Required inventory/inventory-smart-locks.md`)

#### 🧳 A. Wood Chisels & Boring Templates (أدوات تفصيل الأبواب والنجارة)
- [ ] **Professional Premium Wood Chisels Set:** 1/2-inch, 3/4-inch, and 1-inch sharp chisels (for widening strike plate recesses).
- [ ] **Door Lock Installation Boring Jig Template Kit:** Fixed frame guide for boring brand-new deadbolt holes safely.
- [ ] **Bi-Metal Hole Saws Set:** 2-1/8 inch (for main face bore) and 1-inch (for edge latch bore) saw attachments.
- [ ] **Handheld Wood Rasp & Sanding Files:** For filing down rough grain margins inside door frame edges.

#### 🛠️ B. Hardware Stock & Fasteners (المسامير والكوالين الذكية)
- [ ] **Heavy-Duty 3-inch Exterior Wood Framing Screws:** To anchor metal strike plates straight into the jack studs.
- [ ] **Replacement Drive-In Latches & Faceplates Assortment:** Rounded and square corner options.
- [ ] **Lubricating Graphite Spray / Dry Silicone Lubricant:** For smoothing sticky key cylinders and latch movements.
- [ ] **AA & AAA Premium Lithium Battery Packs (Bulk Supply):** Essential for initial smart lock calibration setups.

Proposed additions in the vault file (from the SOP and spec cross-check; pending owner and safety review, nothing approved for purchase or use): Screwdriver and driver-bit set (PROPOSED); Drill/driver with bits (PROPOSED); Measuring tools (tape, backset gauge) (PROPOSED); Vacuum (PROPOSED); Mallet or hammer for chiseling (PROPOSED); Strike plates (PROPOSED); Approved shims and wood filler, only if included in the approved scope (PROPOSED); Lock unit (lock/hardware); default source `customer_provided` or `job_purchase` pending Q-29-14 (PROPOSED); PPE for the card's pinch/cut and drilling hazards - selection by qualified safety professional (PROPOSED); `vehicle-safety` kit reference: first-aid kit, fire extinguisher, eyewash and spill kit as review items (PROPOSED); SDS register entry for each chemical product and the batteries (lubricant; wood filler if adopted) (PROPOSED).

## Service-card defaults (spec section 17, HI-05)

- Tools and equipment (HI-05.TLS): screwdrivers, drill/driver, bits, chisels, measuring tools, templates, file, vacuum.
- Materials and consumables (HI-05.MAT): lock/hardware, screws, strike plate, batteries, approved shims/wood filler if included.

## SOP section 6, "PPE" (`Standard Of Operations/sop-smart-locks.md`)

- TBD - pending safety review. The card lists "pinch/cut, drilling" hazards (spec HI-05.HAZ) but no PPE, and neither the inventory file nor this SOP lists any; selection by a qualified safety professional (source: 31 section 3.5 rule 6; 29 section 7.3).

## SOP section 7, "Tools and equipment" (`Standard Of Operations/sop-smart-locks.md`)

- Card tools: "screwdrivers, drill/driver, bits, chisels, measuring tools, templates, file, vacuum" (source: spec HI-05.TLS).
- Listed in the inventory file: wood chisels set (used by Option A "Chisel Recess Modification"); boring jig template kit and bi-metal hole saws (unused: no approved boring procedure, C-HI05-09); wood rasp and sanding files (unused by this SOP) (source: inventory file).
- Not listed in the inventory file: screwdrivers and driver bits (Option A unscrews the strike plate), drill/driver and bits (Option A drives the screws), measuring tools and a vacuum; a mallet for chiseling is to be confirmed by the reviewer (C-HI05-10; proposed in the inventory file) (source: 29 sections 5.2 and 7.4).
- Pre-use checks per the tool manufacturer, including charged-battery checks for cordless tools (source: spec BRF-009).
- Vehicle safety kit (first-aid kit, fire extinguisher, eyewash, spill kit): contents set by the qualified safety professional (X-10) (source: 29 D-29-08).

## SOP section 8, "Materials and consumables" (`Standard Of Operations/sop-smart-locks.md`)

- Card materials: "lock/hardware, screws, strike plate, batteries, approved shims/wood filler if included" (source: spec HI-05.MAT).
- Lock unit: who supplies it is undefined (Q-29-14). A customer-supplied lock needs the START-009 record, and its compatibility is checked against the manufacturer's instructions before the old lock is removed (hold in section 12) (source: spec START-009; 31 section 10).
- Listed in the inventory file: "Heavy-Duty 3-inch Exterior Wood Framing Screws" (Option A "Screw Reinforcement"); drive-in latches and faceplates (unused by this SOP); graphite or dry-silicone lubricant (unused by this SOP; SDS required, and a chemical product without a reviewed SDS is not carried to a job, 29 section 8.3, PROPOSED); AA and AAA lithium batteries (chemistry and storage per the lock manufacturer; hazardous-material flag) (source: inventory file).
- Not listed: strike plates; approved shims and wood filler, only if included in the approved scope (C-HI05-10).
- Substitutions only as an approved substitution (source: spec JOB-007).
