---
title: "Inventory Checklist: Airbnb Turnover"
service_id: CL-05
service_slug: airbnb-turnover
canonical_name: "Airbnb Turnover & Vacation Rental Management"
category: "Cleaning"
doc_type: inventory
status: draft
authority: supporting
owner_approved: false
human_review:
  - "owner"
  - "safety reviewer (PPE/hazmat)"
registry: "AI Development Plans/04-service-registry.md#CL-05"
last_reviewed: 2026-10-03
---

# 🛎️ Inventory Checklist: Airbnb Turnover

> [!warning] Draft — not owner-approved
> Canonical service: **CL-05 — Airbnb Turnover & Vacation Rental Management** · [Registry entry](../AI%20Development%20Plans/04-service-registry.md#CL-05)
> Checklist only — quantities, stock levels, preferred vendors and reorder points are not yet defined. Proposed additions from the SOP and spec-card cross-check are listed at the end, pending owner and safety review. See [29 Inventory and procurement](../AI%20Development%20Plans/29-inventory-and-procurement.md).
> Legacy artifacts: Arabic text in this file is a non-authoritative brainstorm remnant (canonical currency USD, launch market KY/IN, languages EN/ES). It is kept unchanged pending an owner decision on cleanup.
> Review notes for this file: see "Review notes and cross-references" at the end.


## 🧴 A. The Chemical Arsenal (المنظفات الكيميائية)
- [ ] **Hospital-Grade Fast-Acting Disinfectant Spray (1-minute kill claim):** For rapid sanitization of high-touch remote controls, lockboxes, and handles.
- [ ] **Fabric & Linen Wrinkle-Releaser Spray:** For smoothing out sheets on the bed instantly without using a heavy iron.
- [ ] **Premium Fabric Odor Neutralizer:** For spraying curtains and fabric couches to ensure a completely neutral scent for incoming guests.

## 🧳 B. Hardware & Essential Tools (الأدوات والمعدات)
- [ ] **The Mobile Turnover Caddy:** A structured organizer with handles to move fast from the kitchen to the bathroom in under 90 minutes.
- [ ] **Hair-Sticker Lint Rollers (Heavy-Duty):** For tracking and pulling out single stray hairs from crisp white sheets and towels before staging.
- [ ] **Digital Luggage Scale:** To weigh amenity restock boxes if tracking inventory levels.
- [ ] **Dedicated Laundry Bags (Color-Coded):** To separate dirty linens from clean, pre-pressed stock linens stored in your car vehicle.

## 📦 C. Hospitality Restock Inventory (مخزون الضيافة)
- [ ] **Hotel Toilet Paper Rolls:** Sourced in bulk with high-quality wrapping.
- [ ] **Mini Amenity Bottles:** Shampoos, conditioners, body washes, and individual hand soaps.
- [ ] **Kitchen Restocks:** Individually wrapped coffee pods, tea bags, sugar packs, and small sealed water bottles.
- [ ] **Snug-Fit Clear Trash Liners:** Keeps bins looking clean, clear, and modern.

> FLAG (C-CL05-05): section C items are customer-provided OR company stock - pending decision. The agreement's "Inventory Logistics" clause makes the host procure and store restock items in a locked supply closet on site, while this section lists them as HandyHub stock "Sourced in bulk" (Q-29-13). The list is not a purchase list (29 D-29-02, PROPOSED).

## Categorization of listed items (added 2026-10-03)

*Every item listed above, classified on the two axes of [29](../AI%20Development%20Plans/29-inventory-and-procurement.md) section 3.1 (PROPOSED DECISION D-29-01). Classes and sources are proposals for owner review; nothing here approves an item for purchase or use, and the list above stays a checklist, not a stock record (29 D-29-02).*

| Item (as listed above) | Item class | Default source / custody | Hazmat / SDS needed | Shelf-life / expiry | SOP step that uses it | Notes |
|---|---|---|---|---|---|---|
| Hospital-Grade Fast-Acting Disinfectant Spray (1-minute kill claim) | `consumable_supply` | `unknown` (proposed kit `cleaning-core`, 29 section 5.4) | Yes - SDS required (TBD) | TBD - per product label or SDS | Partial: Phase 3 "Disinfection" names "disinfectant wipes", not a spray (C-CL05-13) | "Hospital-Grade" and the "1-minute kill claim" are unverified label claims: internal only, never repeated to hosts or guests until substantiated from the product label or registration record (29 section 8.2 control 12); contact time only as the label states. Interim rule (29 section 8.3, PROPOSED): a chemical product without a reviewed SDS is not carried to a job (HUMAN REVIEW: qualified safety professional) |
| Fabric & Linen Wrinkle-Releaser Spray | `consumable_supply` | `unknown` | Yes - SDS required (TBD) | TBD - per product label or SDS | None - unused by the current SOP (it would support Phase 4 "Hotel Bed Tucking") | Interim rule (29 section 8.3, PROPOSED): a chemical product without a reviewed SDS is not carried to a job (HUMAN REVIEW: qualified safety professional); use on fabrics only as the label allows |
| Premium Fabric Odor Neutralizer | `consumable_supply` | `unknown` | Yes - SDS required (TBD) | TBD - per product label or SDS | None - unused by the current SOP (29 section 7.4 row CL-05) | "a completely neutral scent" is the original description, not an approved outcome. Interim rule (29 section 8.3, PROPOSED): a chemical product without a reviewed SDS is not carried to a job (HUMAN REVIEW: qualified safety professional) |
| The Mobile Turnover Caddy | `tool` | `unknown` (kit `cleaning-core`, 29 section 5.2) | No | n/a | Not named; carries supplies between rooms in every phase | The time stated in the description is an original value, not an approved productivity standard; time pressure is a card hazard (spec CL-05.HAZ) |
| Hair-Sticker Lint Rollers (Heavy-Duty) | `consumable_supply` (adhesive sheets are used up; owner to confirm) | `unknown` | No | n/a | Not named; supports the hair checks in Phase 3 "Bathroom Inspection" and Phase 4 "Hotel Bed Tucking" | Description kept verbatim |
| Digital Luggage Scale | `tool` | `unknown` | Unknown - reviewer (battery type not stated) | n/a | None - unused by the current SOP | "if tracking inventory levels": no par level, minimum stock or tracking exists for any item (29 section 2.1) |
| Dedicated Laundry Bags (Color-Coded) | `tool` (reusable; owner to confirm) | `unknown` | No | n/a | Phase 2 "Strip Linens" and "Towel Collection" (implied; the SOP names no bag) | The description keeps clean "pre-pressed stock linens stored in your car vehicle": a vehicle location (`vehicle_stock`, 29 section 3.2), although no vehicle is established (29 section 2.1). Linen ownership, par levels and the laundry model are undecided (C-CL05-12). Separation of soiled and clean linens and the possible carrying of pests between properties are safety review items (04 CL-05 hazards, ASSUMPTION; HUMAN REVIEW: qualified safety professional) |
| Hotel Toilet Paper Rolls | `consumable_incorporated` (left in the property for guests, 29 section 3.3 rule 4; owner to confirm) | `customer_provided` or `owned_stock`, pending Q-29-13 | No | n/a | Phase 4 "Amenity Refill" | Section C conflict (C-CL05-05). If host-supplied: a job line with a START-009 record, never HandyHub stock (29 section 9.1; X-22). "Sourced in bulk" is not a vendor relationship (29 section 2.1) |
| Mini Amenity Bottles | `consumable_incorporated` (owner to confirm) | `customer_provided` or `owned_stock`, pending Q-29-13 | Unknown - reviewer | TBD - per product label | Partial: Phase 4 "Amenity Refill" refills bathroom dispensers instead of placing bottles (C-CL05-13) | As for toilet paper (C-CL05-05; X-22) |
| Kitchen Restocks | `consumable_incorporated` (owner to confirm) | `customer_provided` or `owned_stock`, pending Q-29-13 | No | TBD - per package dates (food items) | Phase 4 "Kitchen Hospitality" (coffee pods, tea bags, sugar packets); the "small sealed water bottles" are unused by the SOP (29 section 7.4) | As for toilet paper (C-CL05-05; X-22) |
| Snug-Fit Clear Trash Liners | `consumable_supply` (29 section 3.4 classifies the CL-01 liners this way) | `customer_provided` or `owned_stock`, pending Q-29-13 | No | n/a | Phase 4 "Kitchen Hospitality" ("put fresh trash bags in all bins") | "Keeps bins looking clean, clear, and modern" is a description, not a standard. Emptying bins carries the card's sharps and biohazard hazard (spec CL-05.HAZ; SOP hold before "Kitchen Hospitality") |

Notes:
- Proposed kits for CL-05: `cleaning-core`, `ppe-base` and `vehicle-safety` (29 section 5.4); the quantity driver is the host-defined restock level per turnover (spec CL-05.INT "amenities/restock levels").
- Access codes, keys and fobs are custody items governed by [27](../AI%20Development%20Plans/27-roles-and-permissions.md) section 4.6 (AUTH-009, PROPOSED), not inventory (29 section 9.1).
- The Arabic words in headings A to C are kept verbatim and flagged (C-CL05-15); no translation of them is relied on here.

## Proposed additions from SOP and spec-card cross-check (pending owner and safety review)

*No quantities, brands, vendors, ratings or PPE classes are proposed. Each line stays PROPOSED until the owner, and for PPE and hazardous products a qualified safety professional, approves it (36 section 5.7). Restock, linen and laundry lines do not move procurement from the host to HandyHub: their source stays open until Q-29-13 and the laundry-model decision (C-CL05-05, C-CL05-12).*

| Item | Item class | Required by (source) | Reason | Status |
|---|---|---|---|---|
| Sharps container and biohazard kit - contents and use set by the qualified safety professional; a kit does not authorize biohazard cleanup beyond policy (SOP "Do not perform") | Kit reference (contents set by the safety reviewer) | Spec CL-05.HAZ "sharps/biohazard"; CL-05.SAF "escalate biohazard/damage"; 29 sections 5.2 (`cleaning-core`) and 7.3 row CL-05 | Not listed; the SOP handles stained bedding, drains and trash (C-CL05-01) | PROPOSED |
| PPE for the card's sharps, biohazard and chemical hazards - selection by qualified safety professional | `ppe` | Spec CL-05.TLS "PPE"; CL-05.HAZ "sharps/biohazard"; 29 section 7.3 row CL-05 | No PPE in this file or the SOP (C-CL05-01) | PROPOSED |
| Disinfectant wipes (approved product per SDS) | `consumable_supply` | SOP Phase 3 "Disinfection" ("Sanitize high-touch items with disinfectant wipes") | Only a spray is listed (C-CL05-13); SDS required before use (29 section 8.3) | PROPOSED |
| Toilet, sink and shower cleaning products (approved products per SDS) | `consumable_supply` | SOP Phase 3 "Bathroom Inspection" ("Deep-clean the toilet, sink, and shower"); spec CL-05.MAT "cleaners"; 29 section 7.4 row CL-05 | Not listed (C-CL05-13); SDS required before use; never mixed (31 section 3.3 entry 6) | PROPOSED |
| Toilet brush and scrub brushes | `tool` | SOP Phase 3 "Bathroom Inspection"; 29 section 7.4 row CL-05 ("bathroom cleaners and brushes") | Not listed (C-CL05-13) | PROPOSED |
| Kitchen surface cleaner (approved product per SDS) and cleaning cloths | `consumable_supply` | SOP Phase 3 "Kitchen Check" ("wipe down shelves and handle bars"); 29 section 7.4 row CL-05 ("kitchen cleaner") | Not listed (C-CL05-13); the kitchen standard itself is undefined (C-CL05-V01) | PROPOSED |
| Vacuum | `tool` or `specialty_equipment` (29 section 3.3 rule 3) | SOP Phase 5 "Floor Care" ("Vacuum and damp-mop all floors"); 29 section 5.2 (`cleaning-core`) | Not listed (C-CL05-13) | PROPOSED |
| Mop (bucket to be confirmed by the SOP reviewer) | `tool` | SOP Phase 5 "Floor Care" ("damp-mop"); 29 section 5.2 (`cleaning-core`) | Not listed (C-CL05-13) | PROPOSED |
| Laundry detergent; default source `customer_provided` or `owned_stock`, pending Q-29-13 and the laundry-model decision | `consumable_supply` | SOP Phase 2 "Laundry Sort"; spec CL-05.TLS "laundry resources as applicable"; 29 section 7.4 row CL-05 | Not listed; who supplies it depends on the laundry model (C-CL05-12); SDS required before use | PROPOSED |
| Paper towels; default source `customer_provided` or `owned_stock`, pending Q-29-13 | `consumable_incorporated` (restock left for guests; owner to confirm) | SOP Phase 4 "Kitchen Hospitality" ("Replenish ... paper towels"); 29 section 7.4 row CL-05 | Not listed; restock procurement undecided (C-CL05-05) | PROPOSED |
| Bathroom dispenser refills (shampoo, conditioner, body wash, hand soap); default source `customer_provided` or `owned_stock`, pending Q-29-13 | `consumable_incorporated` (owner to confirm) | SOP Phase 4 "Amenity Refill" ("Refill bathroom dispensers") | Only "Mini Amenity Bottles" are listed (C-CL05-13); restock procurement undecided (C-CL05-05) | PROPOSED |
| Linen and towel stock (sheets, pillowcases, duvet covers, towels); default source `customer_provided` or `owned_stock`, pending Q-29-13 and the laundry-model decision; a vehicle location would be `vehicle_stock` | Class to be set by the owner (reusable textiles that stay in the property; 29 section 3.3) | SOP Phase 4 "Hotel Bed Tucking" ("fresh, professionally laundered sheets"); spec CL-05.MAT "linens"; 29 section 7.4 row CL-05 ("linen stock") | Not listed as an item, only mentioned as "pre-pressed stock linens stored in your car vehicle"; ownership, par levels and the laundry model undecided (C-CL05-12) | PROPOSED |
| Inspection and photo device (app-capable) | `tool` | Spec CL-05.TLS "inspection/photo device"; SOP Phase 1 "Evidence Collection" and Phase 5 "Final Photo Wrap"; 29 section 7.4 row CL-05 | Not listed; photos are captured and kept in the app, never the camera roll or personal messages ([27](../AI%20Development%20Plans/27-roles-and-permissions.md) AUTH-034, PROPOSED; Q-27-16) | PROPOSED |
| Welcome book or guide - `customer_provided` (host item placed by the worker) | Customer-provided item, not stock | SOP Phase 4 "Staging Presentation" ("place the welcome book/guide center-stage") | Not listed; to be confirmed at intake with the host checklist (spec CL-05.INT "host checklist") | PROPOSED |
| `vehicle-safety` kit reference: first-aid kit, fire extinguisher, eyewash and spill kit as review items | Kit reference (contents set by the safety reviewer) | 29 section 5.2 and D-29-08; X-10 | No emergency kit in any inventory | PROPOSED |
| SDS register entry for each chemical product (the three listed sprays and every proposed cleaning product) | Record field, not an item | [02](../AI%20Development%20Plans/02-gap-analysis.md) G-008; 29 section 8.2 control 1; X-09 | No SDS reference in this file | PROPOSED |

---

## Review notes and cross-references (added 2026-10-03)

*Added during the AI orchestrator repository audit. Not part of the original content; original text above is unchanged.*

**Related files:** [Registry entry](../AI%20Development%20Plans/04-service-registry.md#CL-05) · [Pricing](../Pricing/pricing-airbnb-turnover.md) · [Agreement](../Service%20Agreements/contract-airbnb-turnover.md) · [SOP](../Standard%20Of%20Operations/sop%20Airbnb%20Cleaning%20and%20Turnover%20Checklist.md) · [Requirements spec (service card CL-05)](../Requierments/HandyHub_Requirements_Specification_Reconstructed.md) · [Main plan](../Main%20Plans/Cleaning%20Business.md) · [Gap analysis](../AI%20Development%20Plans/02-gap-analysis.md)

### Issues affecting this file
| ID | Severity | Issue (short) | Reviewer / owner |
|---|---|---|---|
| C-CL05-01 | critical | SOP and inventory omit the card's biohazard/sharps, access-code and lock-up controls (no PPE, sharps container or biohazard kit listed; proposed above) | Qualified safety professional (biohazard/sharps protocol); privacy owner (access codes) |
| C-CL05-05 | medium | Restock supplies: client procures vs HandyHub buys and stocks (section C; flag under section C) | Owner; CPA; attorney |
| C-CL05-12 | medium | Laundry model is inconsistent and unpriced ("pre-pressed stock linens stored in your car vehicle") | Owner |
| C-CL05-13 | medium | SOP-required items missing from inventory; item mismatches (proposed additions above) | Owner |
| C-CL05-15 | low | Arabic inventory headers vs English/Spanish requirement (headings A to C; legacy line in the callout) | Owner; qualified English/Spanish reviewer |
| X-09 | high | A chemical program across at least 16 services with no SDS, compatibility, storage, transport, spill or chemical-disposal rule (the three sprays in section A) | Qualified safety professional (hazmat transport applicability not concluded) |
| X-10 | high | No emergency kit in any inventory and no incident step in any SOP | Qualified safety professional |
| X-22 | medium | Customer-supplied products (TVs, brackets, cables, closet kits, paint, locks, restock) have no common acceptance, defect or liability rule (section C restock) | KY/IN attorney |

### Open questions
- **Q-29-13** (owner): does the host buy and store restock items (agreement) or does HandyHub (this file and the pricing file's "Option B")? Until answered, section C and the proposed restock lines stay "customer-provided OR company stock".
- **Q-29-09** (owner): who is the qualified safety professional who selects PPE, defines the sharps and biohazard kit and the vehicle safety kit, and authors the SDS summaries?
- **Q-29-05** (owner; job planner drafts): what are the initial contents and par levels of the `cleaning-core` kit for turnovers?
- **Q-29-10** (local authority; safety reviewer): what are the disposal rules for sharps, biohazard waste and chemical residues in each service municipality?
- **Q-29-01** (owner; insurance broker): where are stock and linens kept, and in which vehicles, given the "stored in your car vehicle" note?
- **02 C-CL05-12** (owner): which laundry model applies per host (on-site, HandyHub off-site or third-party), and who owns the linens and sets par levels?

### Revision history
| Date | Change | Author |
|---|---|---|
| 2026-10-03 | Added frontmatter, status callout, section C flag, categorization and proposed-additions tables, and review notes; original text unchanged | AI orchestrator (Claude) |
