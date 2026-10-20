---
id: FACT-INVENTORY-CL-05
type: fact
title: "Required tools and materials for Airbnb Turnover (CL-05)"
status: active
area: field
links:
  part_of: ["[[SVC-CL-05]]"]
  related: ["[[SOP-CL-05]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]", "[[RULE-NO-INVENTED-FACTS]]"]
source: "vault Required inventory/inventory-airbnb-turnover.md; spec section 17 CL-05.TLS/.MAT; Standard Of Operations/sop Airbnb Cleaning and Turnover Checklist.md sections 6-8"
---
Required tools, materials and PPE for [[SVC-CL-05]] and [[SOP-CL-05]]. The vault inventory is a draft checklist (`Required inventory/inventory-airbnb-turnover.md`, `owner_approved: false`): quantities, stock levels, vendors, reorder points and ratings are not defined, and brand or rating words are kept as written, not approved. A missing critical tool, material or PPE item blocks the affected tasks ([[RULE-SAFETY-GATES]]).

## Inventory checklist as written (`Required inventory/inventory-airbnb-turnover.md`)

#### 🧴 A. The Chemical Arsenal (المنظفات الكيميائية)
- [ ] **Hospital-Grade Fast-Acting Disinfectant Spray (1-minute kill claim):** For rapid sanitization of high-touch remote controls, lockboxes, and handles.
- [ ] **Fabric & Linen Wrinkle-Releaser Spray:** For smoothing out sheets on the bed instantly without using a heavy iron.
- [ ] **Premium Fabric Odor Neutralizer:** For spraying curtains and fabric couches to ensure a completely neutral scent for incoming guests.

#### 🧳 B. Hardware & Essential Tools (الأدوات والمعدات)
- [ ] **The Mobile Turnover Caddy:** A structured organizer with handles to move fast from the kitchen to the bathroom in under 90 minutes.
- [ ] **Hair-Sticker Lint Rollers (Heavy-Duty):** For tracking and pulling out single stray hairs from crisp white sheets and towels before staging.
- [ ] **Digital Luggage Scale:** To weigh amenity restock boxes if tracking inventory levels.
- [ ] **Dedicated Laundry Bags (Color-Coded):** To separate dirty linens from clean, pre-pressed stock linens stored in your car vehicle.

#### 📦 C. Hospitality Restock Inventory (مخزون الضيافة)
- [ ] **Hotel Toilet Paper Rolls:** Sourced in bulk with high-quality wrapping.
- [ ] **Mini Amenity Bottles:** Shampoos, conditioners, body washes, and individual hand soaps.
- [ ] **Kitchen Restocks:** Individually wrapped coffee pods, tea bags, sugar packs, and small sealed water bottles.
- [ ] **Snug-Fit Clear Trash Liners:** Keeps bins looking clean, clear, and modern.

> FLAG (C-CL05-05): section C items are customer-provided OR company stock - pending decision. The agreement's "Inventory Logistics" clause makes the host procure and store restock items in a locked supply closet on site, while this section lists them as HandyHub stock "Sourced in bulk" (Q-29-13). The list is not a purchase list (29 D-29-02, PROPOSED).

Proposed additions in the vault file (from the SOP and spec cross-check; pending owner and safety review, nothing approved for purchase or use): Sharps container and biohazard kit - contents and use set by the qualified safety professional; a kit does not authorize biohazard cleanup beyond policy (SOP "Do not perform") (PROPOSED); PPE for the card's sharps, biohazard and chemical hazards - selection by qualified safety professional (PROPOSED); Disinfectant wipes (approved product per SDS) (PROPOSED); Toilet, sink and shower cleaning products (approved products per SDS) (PROPOSED); Toilet brush and scrub brushes (PROPOSED); Kitchen surface cleaner (approved product per SDS) and cleaning cloths (PROPOSED); Vacuum (PROPOSED); Mop (bucket to be confirmed by the SOP reviewer) (PROPOSED); Laundry detergent; default source `customer_provided` or `owned_stock`, pending Q-29-13 and the laundry-model decision (PROPOSED); Paper towels; default source `customer_provided` or `owned_stock`, pending Q-29-13 (PROPOSED); Bathroom dispenser refills (shampoo, conditioner, body wash, hand soap); default source `customer_provided` or `owned_stock`, pending Q-29-13 (PROPOSED); Linen and towel stock (sheets, pillowcases, duvet covers, towels); default source `customer_provided` or `owned_stock`, pending Q-29-13 and the laundry-model decision; a vehicle location would be `vehicle_stock` (PROPOSED); Inspection and photo device (app-capable) (PROPOSED); Welcome book or guide - `customer_provided` (host item placed by the worker) (PROPOSED); `vehicle-safety` kit reference: first-aid kit, fire extinguisher, eyewash and spill kit as review items (PROPOSED); SDS register entry for each chemical product (the three listed sprays and every proposed cleaning product) (PROPOSED).

## Service-card defaults (spec section 17, CL-05)

- Tools and equipment (CL-05.TLS): cleaning kit, laundry resources as applicable, inspection/photo device, PPE.
- Materials and consumables (CL-05.MAT): linens, toiletries/restock items, cleaners, bags.

## SOP section 6, "PPE" (`Standard Of Operations/sop Airbnb Cleaning and Turnover Checklist.md`)

- TBD - pending safety review. The card lists "PPE" among the tools (spec CL-05.TLS) and "sharps/biohazard" among the hazards (spec CL-05.HAZ); the steps handle stained bedding, drains, bins and chemical products, and neither the inventory file nor this SOP lists any PPE (C-CL05-01). Selection by a qualified safety professional (source: 31 section 3.5 rule 6; 29 section 7.3).
- Chemical products: PPE as the reviewed SDS requires (source: 29 section 8.2).

## SOP section 7, "Tools and equipment" (`Standard Of Operations/sop Airbnb Cleaning and Turnover Checklist.md`)

- Card tools: "cleaning kit, laundry resources as applicable, inspection/photo device, PPE" (source: spec CL-05.TLS).
- Listed in the inventory file: turnover caddy; lint rollers (not named in a step; they support the hair checks); laundry bags (Phase 2, implied); digital luggage scale (unused by this SOP) (source: inventory file; 29 section 7.4).
- Not listed in the inventory file: vacuum and mop (Phase 5 "Floor Care"); toilet and scrub brushes (Phase 3 "Bathroom Inspection"); the inspection and photo device (Phase 1 "Evidence Collection", Phase 5 "Final Photo Wrap"); laundry resources (Phase 2 "Laundry Sort"). All are proposed in the inventory file (C-CL05-13) (source: 29 section 7.4 row CL-05).
- Photos are captured in the app, not the phone's camera roll (source: 27 AUTH-034, PROPOSED).
- Pre-use checks per the tool manufacturer, including charged-battery checks (source: spec BRF-009).
- Vehicle safety kit (first-aid kit, fire extinguisher, eyewash, spill kit): contents set by the qualified safety professional (X-10) (source: 29 D-29-08).

## SOP section 8, "Materials and consumables" (`Standard Of Operations/sop Airbnb Cleaning and Turnover Checklist.md`)

- Card materials: "linens, toiletries/restock items, cleaners, bags" (source: spec CL-05.MAT).
- Listed in the inventory file: a disinfectant spray (Phase 3 names disinfectant wipes instead); a wrinkle releaser and an odor neutralizer (unused by this SOP); restock items - toilet paper, mini amenity bottles (Phase 4 refills dispensers instead), kitchen restocks and trash liners (source: inventory file; 29 section 7.4).
- Not listed: disinfectant wipes; toilet, sink, shower and kitchen cleaning products; laundry detergent; paper towels; linen stock; dispenser refills. All are proposed in the inventory file (C-CL05-13).
- Supplier: restock items and linens are host-supplied or HandyHub stock, undecided (Q-29-13; C-CL05-12). Host-supplied items get a START-009 record of what is present before use (source: spec START-009; 29 section 9.1).
- Chemical products: an approved product per SDS only; a chemical product without a reviewed SDS is not carried to a job (29 section 8.3, PROPOSED); contact time and use exactly as the label states; never mixed (Do not perform, item 6). The inventory file's "1-minute kill claim" is an unverified label claim and is never repeated to hosts or guests (source: 29 section 8.2 control 12).
- Substitutions only as an approved substitution (source: spec JOB-007).
