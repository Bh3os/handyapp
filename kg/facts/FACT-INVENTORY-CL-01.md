---
id: FACT-INVENTORY-CL-01
type: fact
title: "Required tools and materials for Routine House Cleaning (CL-01)"
status: active
area: field
links:
  part_of: ["[[SVC-CL-01]]"]
  related: ["[[SOP-CL-01]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]", "[[RULE-NO-INVENTED-FACTS]]"]
source: "vault Required inventory/inventory-routine-cleaning.md; spec section 17 CL-01.TLS/.MAT; Standard Of Operations/sop Routine Cleaning Checklist.md sections 6-8"
---
Required tools, materials and PPE for [[SVC-CL-01]] and [[SOP-CL-01]]. The vault inventory is a draft checklist (`Required inventory/inventory-routine-cleaning.md`, `owner_approved: false`): quantities, stock levels, vendors, reorder points and ratings are not defined, and brand or rating words are kept as written, not approved. A missing critical tool, material or PPE item blocks the affected tasks ([[RULE-SAFETY-GATES]]).

## Inventory checklist as written (`Required inventory/inventory-routine-cleaning.md`)

#### 🧴 A. The Chemical Arsenal (المنظفات الكيميائية اليومية)
- [ ] **PH-Neutral All-Purpose Cleaner (pH 7):** Safe, non-streaking concentrate for daily wiping of granite, quartz, marble, and sealed wood.
- [ ] **Ammonia-Free Glass Cleaner:** For smudge-free maintenance of mirrors, interior glass doors, and light fixtures.
- [ ] **Mild Bathroom Disinfectant Spray:** For regular sanitization of sinks, counter surfaces, and toilet seats.
- [ ] **Standard Toilet Bowl Cleaner (Liquid):** For routine interior toilet bowl scrubbing.
- [ ] **Eco-Friendly Fabric Refresh Spray:** To mist over fabric couches and bedsheets for a clean, subtle scent.

#### 🧳 B. Hardware & Everyday Tools (الأدوات والحقيبة اليومية)
- [ ] **Lightweight Commercial Upright Vacuum:** For fast vacuuming of carpets, large rugs, and loose crumbs.
- [ ] **Standard Microfiber Flat Mop System:** With 3x washable pads for quick, daily hard floor damp mopping.
- [ ] **Standard Cleaning Caddy:** A plastic hand tray to carry sprays, scrapers, and cloths from room to room.
- [ ] **Color-Coded Microfiber Cloths (Daily Supply):**
	- [ ] **Red:** Toilets only.
	- [ ] **Yellow:** Bathroom sinks and counters.
	- [ ] **Green:** Kitchen counters and tables.
	- [ ] **Blue:** Mirrors, glass, and polishing chrome.
- [ ] **Soft Bristle Detail Brushes:** For removing loose dust around faucet bases and keypads.
- [ ] **Extendable Swiffer/Microfiber Feather Duster:** For regular, light dusting of reachable shelves and picture frames.

#### 🛡️ C. PPE & Basic Safety (أدوات الحماية)
- [ ] **Light Disposable Nitrile Gloves:** To protect hands during routine spraying and wiping.
- [ ] **Disposable Shoe Booties:** Worn over cleaners' shoes to prevent tracking dirt into the client's home.
- [ ] **Clear Plastic Trash Liners (Bulk):** Small and medium sizes for relining bathroom and room bins.

Proposed additions in the vault file (from the SOP and spec cross-check; pending owner and safety review, nothing approved for purchase or use): PPE for cleaning-chemical use and for sharps and biohazard surprises - selection by qualified safety professional (PROPOSED); `vehicle-safety` kit reference: first-aid kit, fire extinguisher, eyewash, spill kit as review items (PROPOSED); SDS register field for each chemical product above (all-purpose cleaner, glass cleaner, bathroom disinfectant, toilet bowl cleaner, fabric refresh spray) and for the chemical additions below (PROPOSED); Wet-floor sign (PROPOSED); Sharps container - type and handling method by qualified safety professional (PROPOSED - review item); Toilet brush (PROPOSED); Slip-on microfiber sleeve for fan blades (PROPOSED); Lint roller (PROPOSED); Disinfectant wipes - approved product with reviewed SDS (PROPOSED); Stainless steel polish or other material-specific cleaner - approved product with reviewed SDS (PROPOSED); Non-scratch scrub pad - type per the surface care instructions (PROPOSED); Upholstery attachment for the vacuum (PROPOSED); Disinfectant floor cleaner for bathrooms - approved product with reviewed SDS (PROPOSED); Trash liners sized for kitchen bins (PROPOSED); Multi-surface sanitizer - approved product with reviewed SDS (REVIEW - stock it or document a substitute (owner; spec JOB-007)); Anti-static microfiber cloth for screens (REVIEW - stock it or document a substitute (owner; spec JOB-007)); Waffle-weave cloth (REVIEW - stock it or document a substitute (owner; spec JOB-007)).

## Service-card defaults (spec section 17, CL-01)

- Tools and equipment (CL-01.TLS): vacuum, mop, microfiber system, bathroom/kitchen tools, PPE.
- Materials and consumables (CL-01.MAT): approved cleaners/disinfectants, bags, cloths, consumables.

## SOP section 6, "PPE" (`Standard Of Operations/sop Routine Cleaning Checklist.md`)

TBD - pending safety review.

- The spec card lists "PPE" without detail. The inventory lists light disposable nitrile gloves only; its shoe booties protect the customer's floors, not the worker (source: spec CL-01.TLS; inventory file; 29 section 3.4).
- Selection by a qualified safety professional from the approved products' SDSs and the card hazards (chemical mixing, sharps and biohazard surprises), including whether eye protection or cut-resistant gloves are needed. No PPE type is selected here (source: 04 CL-01 "PPE"; 29 section 5.2 `ppe-base`; 31 section 3.5 rule 6).
- Tasks the review must cover: spraying and wiping with cleaning products (Phases 2 to 4); scrubbing toilets and sinks (Phases 3 and 4); gathering trash and lifting cushions where hidden sharps may be (Phase 5); mopping with the bathroom floor disinfectant (Phase 5) (source: section 12).
- Footwear: whether disposable booties may be worn on wet or freshly mopped floors is a slip question for the reviewer (source: spec CL-01.HAZ "slips"; RISK, unverified).

## SOP section 7, "Tools and equipment" (`Standard Of Operations/sop Routine Cleaning Checklist.md`)

- From the original steps: extension duster ("Cobwebs"); slip-on microfiber sleeve ("Ceiling Fans"); anti-static microfiber cloth ("Electronics"); lint roller ("Decor"); a brush for the toilet bowl ("Toilet"); waffle-weave cloth ("Vanity"); vacuum, with an upholstery attachment implied by "Upholstery" (ASSUMPTION); damp microfiber mop ("Mopping") (source: section 12; 04 CL-01 "required tools").
- From the spec card: vacuum, mop, microfiber system, bathroom/kitchen tools, PPE (source: spec CL-01.TLS).
- Stocked in the inventory: lightweight upright vacuum; microfiber flat mop system with washable pads; cleaning caddy; colour-coded microfiber cloths; soft-bristle detail brushes; extendable duster (source: inventory file).
- The inventory's colour-coded cloth system (red for toilets only; yellow for bathroom sinks and counters; green for kitchen counters and tables; blue for mirrors, glass and chrome) is not referenced by any step. Whether the SOP adopts it as a cross-contamination control is for the owner and the qualified safety reviewer (OPEN QUESTION) (source: inventory file; 29 section 7.4 row CL-01).
- Needed but not stocked: fan-blade sleeve, lint roller, toilet brush, scrub pad, upholstery attachment and wet-floor sign, plus a sharps container as a review item; all are proposed in the inventory file's review section (source: 29 section 7.4; C-CL01-07).
- No ladder or step stool is stocked or permitted (source: section 2, Do not perform 10; 04 CL-01 "required tools").
- Pre-use inspection of the vacuum per its manufacturer's instructions (source: 31 section 3.1 row 7).
- Kits (PROPOSED): `cleaning-core`, `ppe-base`, `vehicle-safety` (source: 29 section 5.4).

## SOP section 8, "Materials and consumables" (`Standard Of Operations/sop Routine Cleaning Checklist.md`)

- Spec card: approved cleaners/disinfectants, bags, cloths, consumables (source: spec CL-01.MAT).
- The original steps name product types, not approved products: a disinfectant wipe ("High-Touch Wiping"); a material-specific cleaner such as stainless steel polish ("Large Appliances"); a multi-surface sanitizer ("Counters & Backsplash"); glass cleaner ("Vanity"); disinfectant floor cleaner for bathrooms ("Mopping"); fresh liners ("Trash Bins") (source: section 12).
- Stocked in the inventory: pH-neutral all-purpose cleaner, ammonia-free glass cleaner, mild bathroom disinfectant spray, liquid toilet bowl cleaner, fabric refresh spray (no step uses it), and trash liners in small and medium sizes (source: inventory file).
- Not stocked: disinfectant wipes, stainless polish, multi-surface sanitizer, bathroom floor disinfectant and kitchen-size liners (source: C-CL01-07; 29 section 7.4). Any substitution affecting specification, safety or customer expectation, for example the bathroom spray in place of disinfectant wipes, needs approval (source: spec JOB-007).
- Every chemical product: hazardous-material flag and SDS link TBD; dilution and use only as the approved product label states; never mixed or sequenced in a way the SDSs do not allow (source: 29 section 8.2 items 1 and 8; spec CL-01.SAF; 31 section 3.5 rules 3 and 8).
- Fragranced products, such as the inventory's fabric refresh spray, are used only with the customer's consent, given the allergy intake; product claims such as "Eco-Friendly" are not repeated to customers (source: spec CL-01.INT; 29 section 8.2 item 12).
- Customer-provided products, where a preference or allergy requires them: see section 3 (source: spec START-009; 29 section 5.4 row CL-01).
