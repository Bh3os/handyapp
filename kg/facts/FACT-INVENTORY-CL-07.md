---
id: FACT-INVENTORY-CL-07
type: fact
title: "Required tools and materials for Air Duct & Ventilation Cleaning (CL-07)"
status: active
area: field
links:
  part_of: ["[[SVC-CL-07]]"]
  related: ["[[SOP-CL-07]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]", "[[RULE-NO-INVENTED-FACTS]]"]
source: "vault Required inventory/inventory-air-duct-cleaning.md; spec section 17 CL-07.TLS/.MAT; Standard Of Operations/sop Air Duct and Vent Cleaning Checklist.md sections 6-8"
---
Required tools, materials and PPE for [[SVC-CL-07]] and [[SOP-CL-07]]. The vault inventory is a draft checklist (`Required inventory/inventory-air-duct-cleaning.md`, `owner_approved: false`): quantities, stock levels, vendors, reorder points and ratings are not defined, and brand or rating words are kept as written, not approved. A missing critical tool, material or PPE item blocks the affected tasks ([[RULE-SAFETY-GATES]]).

## Inventory checklist as written (`Required inventory/inventory-air-duct-cleaning.md`)

#### 🧴 A. The Chemical Arsenal (المنظفات الكيميائية)
- [ ] **EPA-Registered Anti-Microbial Duct Sanitizer (e.g., Sporicidin or Benefect):** For fogging inside the system lines to kill mold, mildew, and bacteria spores.
- [ ] **Heavy Range-Exhaust Degreaser Solution:** For cutting caked soot and sticky grease out of commercial kitchen ventilation lines.

> FLAG (C-CL07-03, critical; C-CL07-01; C-CL07-05) - neither chemical above is carried to a job until the reviews named here are complete. The sanitizer's only stated use, fogging, is not performable until a specific product with label directions for duct use and its SDS are approved; no SOP step fogs, and "EPA-Registered" and "to kill mold, mildew, and bacteria spores" are unverified claims that stay internal (C-CL07-03; 29 section 8.2 item 12). The spec stops work on suspected significant mold (spec CL-07.SAF; C-CL07-01). The degreaser is described for commercial kitchen ventilation lines, which are outside the documented residential scope (C-CL07-05). Interim rule (29 section 8.3, PROPOSED): a chemical product without a reviewed SDS is not carried to a job. HUMAN REVIEW: qualified safety professional; state pesticide regulator and attorney licensed in KY/IN (label use, applicator credential, claims). Added 2026-10-03.

#### 🧳 B. Hardware & Specialty Machinery (الماكينات والمعدات)
- [ ] **Negative-Pressure High-HEPA Air Duct Vacuum:** Truck-mounted or heavy portable system producing at least 2,000–5,000 CFM (Cubic Feet per Minute) of airflow suction.
- [ ] **Flexible Rotary Button-Lock Duct Rods (Up to 40 ft):** Forward-spinning nylon rod paths driven by an electric power drill.
- [ ] **Pneumatic Air Whips & Skkipper Balls:** Run by an air compressor to forcefully dislodge dust film out of trunk corners.
- [ ] **HVAC Foam Block-Off Plugs:** For capping output register vents to maintain strong negative vacuum seal pull across lines.
- [ ] **Magnetic Vent Cover Seals:** To seal up grilles tightly during system negative suction extraction phases.
- [ ] **HVAC Sheet Metal Patching Tape & Foil Scrim:** For scaling up access holes sliced into the duct plenum trunk lines.

> FLAG (C-CL07-07; C-CL07-V01; C-CL07-06) - the patching tape and foil scrim exist "for scaling up access holes sliced into the duct plenum trunk lines": cutting or patching plenum access openings may be licensed HVAC work and is not performed until the licensing review decides; no SOP step uses these materials (C-CL07-07; HUMAN REVIEW: licensing authority for the municipality, licensed HVAC contractor). The block-off plugs and vent seals describe a sealed-register containment method that the SOP does not use; the containment method is unresolved pending qualified safety review (C-CL07-V01). The air whips need a compressor and the duct rods a drill, neither listed (proposed below); how they are powered while the HVAC system is isolated is not documented (C-CL07-06). Ratings, lengths and spellings above are kept as written and are not approved values (29 D-29-02). Added 2026-10-03.

Proposed additions in the vault file (from the SOP and spec cross-check; pending owner and safety review, nothing approved for purchase or use): PPE for dust and allergens, compressed-air whips, sharp duct and grille edges and grease scraping - selection by qualified safety professional (PROPOSED); `vehicle-safety` kit reference: first-aid kit, fire extinguisher, eyewash, spill kit as review items (PROPOSED); SDS register field for each chemical product above (sanitizer, degreaser) (PROPOSED); Plastic drop cloths or other protective coverings (PROPOSED); Register and grille hand tools (screwdrivers or a driver-bit set) (PROPOSED); Ladder or other access equipment - per approved height/access policy (none exists, 02 G-005) (PROPOSED - ceiling work stays blocked until the policy exists); Wash bin and scrub brushes for grilles (PROPOSED); Cleaning material approved for grilles and components (PROPOSED - product per label and SDS); Vacuum brush attachment (PROPOSED); Scraper for range-hood fan blades (PROPOSED); Bags for used filters and debris (PROPOSED); Replacement HVAC filters - by customer-confirmed size; rating per the HVAC equipment manufacturer's specification (PROPOSED - only if filter replacement is included; a customer-supplied filter is `customer_provided` with a START-009 record (29 section 9.1)); Air compressor for the air whips (PROPOSED); Electric power drill for the duct rods (PROPOSED); Isolation or lockout devices (ON HOLD - only if the isolation method adopted after licensed electrician or HVAC review uses them); Fogging equipment (NOT ADDED); Dryer-vent cleaning kit (NOT ADDED - only if the owner offers dryer-vent cleaning after SOP review).

## Service-card defaults (spec section 17, CL-07)

- Tools and equipment (CL-07.TLS): appropriate negative-pressure/vacuum/brush tools for authorized scope, register tools, HEPA equipment, PPE.
- Materials and consumables (CL-07.MAT): filters, protective coverings, bags, cleaning materials approved for components.

## SOP section 6, "PPE" (`Standard Of Operations/sop Air Duct and Vent Cleaning Checklist.md`)

TBD - pending safety review.

- The spec card lists "PPE" without detail, and the inventory lists none (source: spec CL-07.TLS; inventory file; 29 section 7.3).
- Selection by a qualified safety professional; no PPE type, respirator or fit-test requirement is selected here (source: 31 section 3.5 rule 6; risk-triage playbook "do not invent respirator selection, fit-test clearance").
- Tasks the review must cover: dust and allergens during grille removal, boot vacuuming, agitation and extraction (spec CL-07.HAZ "dust/allergens"); compressed-air whips, including eyes and face, hose whip and flying debris (inventory air-whip line); sharp duct and grille edges (spec CL-07.HAZ "sharp duct edges"); scraping grease from range-hood fan blades ("Exhaust Systems"); handling and bagging used filters ("Filter Removal"); any chemical product, from its SDS (source: 04 CL-07 "PPE").
- Suspected significant mold or suspect asbestos-containing material is a stop condition, not a PPE decision (source: spec CL-07.SAF; section 10).

## SOP section 7, "Tools and equipment" (`Standard Of Operations/sop Air Duct and Vent Cleaning Checklist.md`)

- From the original steps: plastic drop cloths; tools to unscrew grilles; a wash container with warm soapy water and scrub brushes; a vacuum brush attachment; flexible rotary cleaning brushes and pneumatic air whips (agitation on hold); a negative-pressure truck-mounted or portable HEPA vacuum; a scraper for range-hood fan blades; a plastic bag for the old filter (source: section 12).
- From the spec card: "appropriate negative-pressure/vacuum/brush tools for authorized scope, register tools, HEPA equipment, PPE" (source: spec CL-07.TLS).
- Stocked in the inventory: negative-pressure HEPA duct vacuum; drill-driven rotary duct rods; compressor-driven air whips; foam block-off plugs and magnetic vent seals, which no step uses (C-CL07-V01); sheet-metal patching tape and foil scrim for plenum access openings, which no step uses (C-CL07-07) (source: inventory file).
- Needed but not stocked: register hand tools, drop cloths, access equipment under the height policy, wash bin and brushes, scraper, bags, replacement filters, compressor and drill; isolation devices only if the reviewed method uses them (source: 29 section 7.4 row CL-07; inventory file, proposed additions).
- Duct-type check before rotary brushes or air whips, against the tool manufacturer's instructions (source: 31 section 10 CL-07; spec CL-07.HAZ "damage to duct lining"; hold in section 12).
- Pre-use inspection of powered equipment per its manufacturer's instructions (source: 31 section 3.1 row 7).
- Kits (PROPOSED): `core-handyman`, `access-height`, `dust-control`, `ppe-base`, `vehicle-safety` (source: 29 section 5.4).
- No fogging equipment is used or stocked (source: C-CL07-03).

## SOP section 8, "Materials and consumables" (`Standard Of Operations/sop Air Duct and Vent Cleaning Checklist.md`)

- Spec card: "filters, protective coverings, bags, cleaning materials approved for components" (source: spec CL-07.MAT).
- Original steps: plastic drop cloths ("Containment"); warm soapy water with no product named ("Deep Scrubbing"); a plastic bag for the old filter ("Filter Removal"); a brand-new filter whose "high-MERV-rated" wording is flagged in section 12 ("New Filter Install") (source: section 12).
- Inventory: an antimicrobial duct sanitizer "For fogging" and a range-exhaust degreaser for commercial kitchen lines; no step uses either, and neither is carried to a job without a reviewed SDS (source: inventory file; C-CL07-03; C-CL07-05; 29 section 8.3).
- Filters: whether replacement is included and who supplies the filter (HandyHub or customer) is undefined; the size comes from intake (source: spec CL-07.INT "filter size"; 29 section 5.4 row CL-07; Q-30-14). A customer-supplied filter needs a START-009 record of its condition, model and quantity (source: spec START-009; 29 section 9.1).
- Every chemical product: hazardous-material flag and SDS link TBD; used only as the approved label states (source: 29 section 8.2 items 1 and 8; 31 section 3.5 rules 3 and 8).
- Any substitution affecting specification, safety or customer expectation needs approval (source: spec JOB-007).
