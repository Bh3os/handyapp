---
id: FACT-INVENTORY-HI-02
type: fact
title: "Required tools and materials for Barbecue & Grill Cleaning/Maintenance (HI-02)"
status: active
area: field
links:
  part_of: ["[[SVC-HI-02]]"]
  related: ["[[SOP-HI-02]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]", "[[RULE-NO-INVENTED-FACTS]]"]
source: "vault Required inventory/inventory-grill-cleaning.md; spec section 17 HI-02.TLS/.MAT; Standard Of Operations/sop-grill-cleaning.md sections 6-8"
---
Required tools, materials and PPE for [[SVC-HI-02]] and [[SOP-HI-02]]. The vault inventory is a draft checklist (`Required inventory/inventory-grill-cleaning.md`, `owner_approved: false`): quantities, stock levels, vendors, reorder points and ratings are not defined, and brand or rating words are kept as written, not approved. A missing critical tool, material or PPE item blocks the affected tasks ([[RULE-SAFETY-GATES]]).

## Inventory checklist as written (`Required inventory/inventory-grill-cleaning.md`)

#### 🧴 A. Carbon-Stripping Chemicals (المنظفات الكيميائية المتخصصة)
- [ ] **Commercial-Grade Eco-Safe Degreaser Concentrate:** Non-toxic, food-surface safe formula to dissolve organic grease webs.
- [ ] **Industrial Carbon-Liquefying Oven & Grill Spray:** Heavy-duty cleaner to break down caked soot crust.
- [ ] **Premium Streak-Free Stainless Steel Protective Oil:** For exterior hood buffing and polishing.
- [ ] **Liquid Propane Valve Leak Detector Spray:** Soap-based solution to verify safe gas connections post-service.

#### 🧳 B. Scrapers, Soaking Stations & Hardware (أدوات الكشط والتنظيف)
- [ ] **Heavy-Duty Structural Plastic Soak Bins:** Heavy 27-gallon utility bins to submerge grates and flavorizer bars.
- [ ] **Stainless Steel Wire Block Brushes & Detail Brass Wire Brushes:** For purging burner vents.
- [ ] **Heavy-Gauge Carbon Steel Putty Scrapers (2-inch and 4-inch):** To scrape cookbox walls down to bare metal.
- [ ] **Handheld Industrial Steam Cleaning Brush:** Running high-temperature water vapor to flush out tight corners.
- [ ] **Microfiber Towels & Coarse Scratch Pads (Bulk Pack):** For mechanical washing and polishing.

Proposed additions in the vault file (from the SOP and spec cross-check; pending owner and safety review, nothing approved for purchase or use): PPE for chemical handling, hot surfaces and hot water, and sharp metal - selection by qualified safety professional (PROPOSED); `vehicle-safety` kit reference: first-aid kit, fire extinguisher, eyewash, spill kit as review items (PROPOSED); SDS register field for each chemical product above (degreaser, carbon spray, stainless oil, leak-detector spray) (PROPOSED); Fire extinguisher as a review item - type and size by qualified safety professional (PROPOSED - review item); Disassembly hand tools - types per the grill manufacturer's instructions (PROPOSED); Plastic putty scraper (PROPOSED); Port-clearing tool - only as the grill manufacturer's instructions allow (ON HOLD - no tool chosen until the manufacturer-instruction review (C-HI02-04)); Rinse hose (water from the property, access confirmed at intake) (PROPOSED); Wet/dry or HEPA vacuum as appropriate (PROPOSED); Protective coverings (PROPOSED); Absorbents (PROPOSED); Waste bags (PROPOSED); Closed container for degreaser wastewater and grease (PROPOSED); Heat source for the "boiling water solution" (ON HOLD - only if the qualified safety reviewer keeps the hot-water method); Out-of-service tag for a leaking or damaged gas part (PROPOSED - form and wording by qualified safety professional).

## Service-card defaults (spec section 17, HI-02)

- Tools and equipment (HI-02.TLS): scrapers, brushes, non-damaging detailing tools, wet/dry or HEPA vacuum as appropriate, steam/cleaning equipment, PPE.
- Materials and consumables (HI-02.MAT): approved degreaser/cleaner, cloths, bags, absorbents, protective coverings.

## SOP section 6, "PPE" (`Standard Of Operations/sop-grill-cleaning.md`)

TBD - pending safety review.

- The spec card lists "PPE" without detail, and the inventory lists none (source: spec HI-02.TLS; inventory file; 29 section 7.3).
- Selection by a qualified safety professional from the approved products' SDSs and the card hazards: hot surfaces, sharp metal, chemical exposure (source: 04 HI-02 "PPE"; spec HI-02.HAZ). No PPE type is selected here (source: 31 section 3.5 rule 6; risk-triage playbook).
- Tasks the review must cover: handling chemicals and soaked parts ("The Chemical Bath"); hot water ("boiling water solution"); scraping and wire brushing ("Cookbox Scraping", "Burner Tube Purging"); polishing products ("Exterior Polishing") (source: section 12).

## SOP section 7, "Tools and equipment" (`Standard Of Operations/sop-grill-cleaning.md`)

- From the original steps: heavy plastic utility bin; heavy-duty plastic putty scraper; wire block brush; "a small drill bit or paperclip" for gas vent ports (method on hold, C-HI02-04); fresh microfiber cloth (source: section 12).
- From the spec card: scrapers, brushes, non-damaging detailing tools, wet/dry or HEPA vacuum as appropriate, steam/cleaning equipment, PPE (source: spec HI-02.TLS).
- Stocked in the inventory: soak bins; stainless and brass wire brushes; carbon-steel putty scrapers, which conflict with the SOP's plastic scraper and "non-damaging detailing tools" (C-HI02-07); a handheld steam cleaning brush that no step uses (C-HI02-09) (source: inventory file).
- Needed but not stocked: disassembly hand tools, heat source, plastic scraper, port-clearing tool, rinse hose, vacuum; proposed in the inventory file's review section (source: 29 section 7.4).
- Pre-use inspection of powered equipment per its manufacturer's instructions (source: 31 section 3.1 row 7).
- Kits (PROPOSED): `dust-control`, `ppe-base`, `vehicle-safety` (source: 29 section 5.4).

## SOP section 8, "Materials and consumables" (`Standard Of Operations/sop-grill-cleaning.md`)

- Spec card: approved degreaser/cleaner, cloths, bags, absorbents, protective coverings (source: spec HI-02.MAT).
- Original steps: "non-toxic, carbon-stripping eco-degreaser" ("The Chemical Bath") and "specialized stainless steel polish" ("Exterior Polishing"). These name product types, not approved products; the "non-toxic" wording is unverified (source: section 12; C-HI02-01).
- Inventory: degreaser concentrate; industrial carbon-liquefying spray (no step uses it); stainless protective oil; leak-detector spray (no step uses it; C-HI02-03) (source: inventory file).
- Every chemical product: hazardous-material flag and SDS link TBD; dilution, water temperature and dwell time only as the approved product label states (source: 29 section 8.2 items 1 and 8; 31 section 3.5 rules 3 and 8).
- Any substitution affecting specification, safety or customer expectation needs approval (source: spec JOB-007).
- No customer-supplied or rental item is named in any HI-02 file; water and power come from the property where needed, with access confirmed at intake (source: 29 section 5.4; spec HI-02.INT "access to water/power").
