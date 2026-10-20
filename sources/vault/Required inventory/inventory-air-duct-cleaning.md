---
title: "Inventory Checklist: Air Duct & Vent Cleaning"
service_id: CL-07
service_slug: air-duct-cleaning
canonical_name: "Air Duct & Ventilation Cleaning"
category: "Cleaning"
doc_type: inventory
status: draft
authority: supporting
owner_approved: false
human_review:
  - "owner"
  - "safety reviewer (PPE/hazmat)"
  - "licensed HVAC contractor (plenum access materials)"
  - "licensed electrician (isolation devices, if adopted)"
  - "state pesticide regulator (sanitizer label use and applicator credential)"
  - "attorney licensed in KY/IN (product claims)"
registry: "AI Development Plans/04-service-registry.md#CL-07"
last_reviewed: 2026-10-03
---

# 💨 Inventory Checklist: Air Duct & Vent Cleaning

> [!warning] Draft — not owner-approved
> Canonical service: **CL-07 — Air Duct & Ventilation Cleaning** · [Registry entry](../AI%20Development%20Plans/04-service-registry.md#CL-07)
> Checklist only — quantities, stock levels, preferred vendors and reorder points are not yet defined. Proposed additions from the SOP and spec-card cross-check are listed at the end, pending owner and safety review. See [29 Inventory and procurement](../AI%20Development%20Plans/29-inventory-and-procurement.md).
> Legacy artifacts: Arabic text in this file (the parentheticals in both section headings) is a non-authoritative brainstorm remnant (canonical currency USD, launch market KY/IN, languages EN/ES). It is kept unchanged pending an owner decision on cleanup.
> Review notes for this file: see "Review notes and cross-references" at the end.


## 🧴 A. The Chemical Arsenal (المنظفات الكيميائية)
- [ ] **EPA-Registered Anti-Microbial Duct Sanitizer (e.g., Sporicidin or Benefect):** For fogging inside the system lines to kill mold, mildew, and bacteria spores.
- [ ] **Heavy Range-Exhaust Degreaser Solution:** For cutting caked soot and sticky grease out of commercial kitchen ventilation lines.

> FLAG (C-CL07-03, critical; C-CL07-01; C-CL07-05) - neither chemical above is carried to a job until the reviews named here are complete. The sanitizer's only stated use, fogging, is not performable until a specific product with label directions for duct use and its SDS are approved; no SOP step fogs, and "EPA-Registered" and "to kill mold, mildew, and bacteria spores" are unverified claims that stay internal (C-CL07-03; [29](../AI%20Development%20Plans/29-inventory-and-procurement.md) section 8.2 item 12). The spec stops work on suspected significant mold (spec CL-07.SAF; C-CL07-01). The degreaser is described for commercial kitchen ventilation lines, which are outside the documented residential scope (C-CL07-05). Interim rule (29 section 8.3, PROPOSED): a chemical product without a reviewed SDS is not carried to a job. HUMAN REVIEW: qualified safety professional; state pesticide regulator and attorney licensed in KY/IN (label use, applicator credential, claims). Added 2026-10-03.

## 🧳 B. Hardware & Specialty Machinery (الماكينات والمعدات)
- [ ] **Negative-Pressure High-HEPA Air Duct Vacuum:** Truck-mounted or heavy portable system producing at least 2,000–5,000 CFM (Cubic Feet per Minute) of airflow suction.
- [ ] **Flexible Rotary Button-Lock Duct Rods (Up to 40 ft):** Forward-spinning nylon rod paths driven by an electric power drill.
- [ ] **Pneumatic Air Whips & Skkipper Balls:** Run by an air compressor to forcefully dislodge dust film out of trunk corners.
- [ ] **HVAC Foam Block-Off Plugs:** For capping output register vents to maintain strong negative vacuum seal pull across lines.
- [ ] **Magnetic Vent Cover Seals:** To seal up grilles tightly during system negative suction extraction phases.
- [ ] **HVAC Sheet Metal Patching Tape & Foil Scrim:** For scaling up access holes sliced into the duct plenum trunk lines.

> FLAG (C-CL07-07; C-CL07-V01; C-CL07-06) - the patching tape and foil scrim exist "for scaling up access holes sliced into the duct plenum trunk lines": cutting or patching plenum access openings may be licensed HVAC work and is not performed until the licensing review decides; no SOP step uses these materials (C-CL07-07; HUMAN REVIEW: licensing authority for the municipality, licensed HVAC contractor). The block-off plugs and vent seals describe a sealed-register containment method that the SOP does not use; the containment method is unresolved pending qualified safety review (C-CL07-V01). The air whips need a compressor and the duct rods a drill, neither listed (proposed below); how they are powered while the HVAC system is isolated is not documented (C-CL07-06). Ratings, lengths and spellings above are kept as written and are not approved values ([29](../AI%20Development%20Plans/29-inventory-and-procurement.md) D-29-02). Added 2026-10-03.

## Categorization of listed items (added 2026-10-03)

*Added during the AI orchestrator repository audit; the checklist above is unchanged. Two-axis classification (item class and default source) per [29 Inventory and procurement](../AI%20Development%20Plans/29-inventory-and-procurement.md) D-29-01 (PROPOSED). Nothing here approves an item for purchase or use, and ratings, lengths, brand examples and claims in the list are not approved values (29 D-29-02). SOP step names refer to section 12 of the [SOP](../Standard%20Of%20Operations/sop%20Air%20Duct%20and%20Vent%20Cleaning%20Checklist.md).*

| Item (as listed above) | Item class | Default source / custody | Hazmat / SDS needed | Shelf-life / expiry | SOP step that uses it | Notes |
|---|---|---|---|---|---|---|
| EPA-Registered Anti-Microbial Duct Sanitizer (e.g., Sporicidin or Benefect) | consumable_supply | unknown (Q-29-01) | Yes - SDS required (TBD) | TBD - per product label or SDS | Unused by the current SOP: no fogging step (C-CL07-03) | Not performable until a product with label directions and SDS is approved (C-CL07-03, critical). "EPA-Registered", the brand examples and the kill claim are unverified, kept verbatim, and stay internal until substantiated from the label or registration record (29 section 8.2 item 12); brand examples are not an approved product or vendor list. Whether a label permits HVAC-duct use and whether paid application needs a state applicator credential are open, for Kentucky and Indiana separately ([30](../AI%20Development%20Plans/30-service-agreement-standards.md) section 8 row 14). Occupant, pet and re-entry controls for fogging are a reviewer item (29 section 8.2 item 9; X-11). Interim rule (29 section 8.3, PROPOSED): a chemical product without a reviewed SDS is not carried to a job (HUMAN REVIEW: qualified safety professional) |
| Heavy Range-Exhaust Degreaser Solution | consumable_supply | unknown (Q-29-01) | Yes - SDS required (TBD) | TBD - per product label or SDS | Unused by the current SOP: "Exhaust Systems" scrapes residential range-hood fan blades and names no chemical | Its stated purpose, "commercial kitchen ventilation lines", is outside the documented scope - pending owner decision (C-CL07-05; X-23; Q-04-11). Interim rule (29 section 8.3, PROPOSED): a chemical product without a reviewed SDS is not carried to a job (HUMAN REVIEW: qualified safety professional) |
| Negative-Pressure High-HEPA Air Duct Vacuum | specialty_equipment | unknown: owned or rented not documented (Q-29-01; Q-29-08) | Unknown - reviewer (power source not documented) | n/a (equipment; maintenance per manufacturer) | "Vacuum Extraction"; "Boot Vacuuming" uses a vacuum brush attachment, which is not listed | The airflow figure is an unapproved rating (29 D-29-02). Attachment to the trunk line is held: no access openings and no furnace connection (C-CL07-07). How the unit is powered while the HVAC system is isolated is not documented (C-CL07-06). Pre-use check and maintenance log per manufacturer (29 section 3.2). Manual handling of a "heavy portable system": method pending safety review (spec BRF-008 "manual handling") |
| Flexible Rotary Button-Lock Duct Rods (Up to 40 ft) | tool | unknown (Q-29-01) | No | n/a (reusable) | "Agitation Run" ("flexible rotary cleaning brushes"); the step is on hold (C-CL07-01) | The length is an unapproved value (29 D-29-02). The drive drill is not listed (proposed below). Suitability for the duct type and lining condition is checked against the tool manufacturer's instructions before use (spec CL-07.HAZ "damage to duct lining"; 31 section 10 CL-07) |
| Pneumatic Air Whips & Skkipper Balls | tool | unknown (Q-29-01) | No | n/a (reusable) | "Agitation Run" ("pneumatic air whips"); the step is on hold (C-CL07-01) | "Skkipper" is a probable typo, kept verbatim ([36](../AI%20Development%20Plans/36-file-modification-plan.md) section 5.4 item 23; Q-36-05). The compressor is not listed (proposed below). Compressed-air hazards (eyes and face, hose whip, flying debris): controls and PPE by the qualified safety professional. Duct-type suitability as for the rods |
| HVAC Foam Block-Off Plugs | tool (PROPOSED: reusable containment accessory; reclassify if single-use) | unknown (Q-29-01) | No | TBD - per manufacturer | Unused by the current SOP: no step seals registers (C-CL07-V01) | Containment method unresolved - pending safety review (C-CL07-V01); kept, nothing is removed |
| Magnetic Vent Cover Seals | tool (PROPOSED: reusable containment accessory; reclassify if single-use) | unknown (Q-29-01) | No | TBD - per manufacturer | Unused by the current SOP: no step seals registers (C-CL07-V01) | As for the block-off plugs (C-CL07-V01) |
| HVAC Sheet Metal Patching Tape & Foil Scrim | consumable_incorporated (a patch stays in the property) | unknown (Q-29-01) | Unknown - reviewer | TBD - per product label | Unused by the current SOP: no access-hole step (C-CL07-07) | Plenum access openings may be licensed HVAC work: not used until the licensing review decides (C-CL07-07; HUMAN REVIEW: licensing authority, licensed HVAC contractor). "scaling up" is a probable typo for "sealing up", kept verbatim ([04](../AI%20Development%20Plans/04-service-registry.md#CL-07) "inventory reference") |

## Proposed additions from SOP and spec-card cross-check (pending owner and safety review)

*Sources: spec card CL-07 (.TLS, .MAT, .HAZ, .SAF, .QAC), the SOP steps and holds, and 29 sections 5.4, 7.3 and 7.4. Nothing below is approved for purchase or use (29 D-29-02). No quantities, brands, vendors, ratings or PPE classes are given.*

| Item | Item class | Required by (source) | Reason | Status |
|---|---|---|---|---|
| PPE for dust and allergens, compressed-air whips, sharp duct and grille edges and grease scraping - selection by qualified safety professional | ppe | spec CL-07.TLS "PPE"; CL-07.HAZ "dust/allergens", "sharp duct edges"; kit `ppe-base` (29 section 5.4) | none listed (29 section 7.3) | PROPOSED |
| `vehicle-safety` kit reference: first-aid kit, fire extinguisher, eyewash, spill kit as review items | kit (contents by qualified safety professional) | 29 D-29-08 and section 5.2; X-10 | no emergency kit in any inventory | PROPOSED |
| SDS register field for each chemical product above (sanitizer, degreaser) | record field (not an item) | 02 G-008; 29 section 8.2 item 1; 29 D-29-03 | no SDS for either product | PROPOSED |
| Plastic drop cloths or other protective coverings | consumable_supply | SOP "Containment" ("Lay plastic drop cloths"); spec CL-07.MAT "protective coverings" | not listed | PROPOSED |
| Register and grille hand tools (screwdrivers or a driver-bit set) | tool | SOP "Grille Removal" ("Unscrew and carefully remove"); spec CL-07.TLS "register tools"; kit `core-handyman` (29 section 5.2) | not listed | PROPOSED |
| Ladder or other access equipment - per approved height/access policy (none exists, [02](../AI%20Development%20Plans/02-gap-analysis.md) G-005) | specialty_equipment | SOP "Grille Removal" ("from walls and ceilings"); spec CL-07.HAZ "ladder"; kit `access-height` (29 section 5.2); X-12 | not listed | PROPOSED - ceiling work stays blocked until the policy exists |
| Wash bin and scrub brushes for grilles | tool | SOP "Deep Scrubbing" ("Submerge metal grilles in warm, soapy water; scrub") | not listed | PROPOSED |
| Cleaning material approved for grilles and components | consumable_supply | SOP "Deep Scrubbing" ("soapy water"); spec CL-07.MAT "cleaning materials approved for components" | not listed | PROPOSED - product per label and SDS |
| Vacuum brush attachment | tool | SOP "Boot Vacuuming" ("Use a vacuum brush attachment") | the listed duct vacuum names no attachment | PROPOSED |
| Scraper for range-hood fan blades | tool | SOP "Exhaust Systems" ("scrape caked grease") | not listed | PROPOSED |
| Bags for used filters and debris | consumable_supply | SOP "Filter Removal" ("seal it immediately in a plastic bag"); spec CL-07.MAT "bags" | not listed | PROPOSED |
| Replacement HVAC filters - by customer-confirmed size; rating per the HVAC equipment manufacturer's specification | consumable_incorporated | SOP "New Filter Install"; spec CL-07.MAT "filters"; CL-07.INT "filter size"; CL-07.QAC "filter installed if included" | not listed; who supplies filters (HandyHub or customer) is undefined (29 section 5.4; Q-30-14) | PROPOSED - only if filter replacement is included; a customer-supplied filter is `customer_provided` with a START-009 record (29 section 9.1) |
| Air compressor for the air whips | specialty_equipment (motor-driven; pre-use checks per manufacturer) | inventory air-whip line ("Run by an air compressor") | implied, not listed | PROPOSED |
| Electric power drill for the duct rods | tool | inventory duct-rod line ("driven by an electric power drill"); kit `core-handyman` | implied, not listed | PROPOSED |
| Isolation or lockout devices | tool | SOP "System Shutdown"; spec CL-07.SAF "system off/isolation per procedure"; 29 section 7.3 row CL-07 ("Isolation and lockout means") | none listed (C-CL07-06) | ON HOLD - only if the isolation method adopted after licensed electrician or HVAC review uses them |
| Fogging equipment | - | pricing fogging add-on; sanitizer line above | fogging is not performable (C-CL07-03) | NOT ADDED |
| Dryer-vent cleaning kit | - | pricing dryer-vent add-on | no SOP covers dryer vents (C-CL07-04) | NOT ADDED - only if the owner offers dryer-vent cleaning after SOP review |

---

## Review notes and cross-references (added 2026-10-03)

*Added during the AI orchestrator repository audit. Not part of the original content; original text above is unchanged.* The two FLAG lines under the checklist sections, each marked "Added 2026-10-03", were added with these notes.

**Related files:** [Registry entry](../AI%20Development%20Plans/04-service-registry.md#CL-07) · [Pricing](../Pricing/pricing-air-duct-cleaning.md) · [Agreement (new structure-only skeleton)](../Service%20Agreements/contract-air-duct-cleaning.md) · [SOP](../Standard%20Of%20Operations/sop%20Air%20Duct%20and%20Vent%20Cleaning%20Checklist.md) · [Requirements spec (service card CL-07)](../Requierments/HandyHub_Requirements_Specification_Reconstructed.md) · [Main plan](../Main%20Plans/Cleaning%20Business.md) · [Gap analysis](../AI%20Development%20Plans/02-gap-analysis.md)

### Issues affecting this file

| ID | Severity | Issue (short) | Reviewer / owner |
|---|---|---|---|
| C-CL07-01 | critical | Mold treated as routine work vs spec stop-work on suspected mold; here the sanitizer line promises "to kill mold, mildew, and bacteria spores" (chemicals FLAG) | Qualified mold assessor or remediation professional; attorney licensed in KY/IN; insurance broker; owner |
| C-CL07-03 | critical | Biocide fogging sold and stocked; no SOP step, SDS, label check or occupant controls (chemicals FLAG; categorization notes) | Qualified safety professional (hazard communication, SDS); state pesticide regulator and attorney (label and applicator credential); insurance broker |
| C-CL07-05 | high | Commercial kitchen exhaust in pricing and inventory vs residential scope in plan and SOP (degreaser line) | Local fire code official; insurance broker; attorney licensed in KY/IN |
| C-CL07-07 | high | Inventory and pricing imply plenum access holes and a furnace connection; SOP silent; spec stops on licensed HVAC scope (patching-tape line; hardware FLAG) | Licensing authority for the municipality; licensed HVAC contractor; attorney licensed in KY/IN |
| C-CL07-06 | medium | SOP cuts the home's main breaker while the procedure relies on powered equipment; no isolation means stocked (proposed isolation devices on hold) | Licensed HVAC contractor or electrician; qualified safety professional |
| C-CL07-10 | medium | SAR currency and Arabic text in a USD, English/Spanish service (here: the Arabic heading parentheticals; legacy line in the status callout) | Owner; qualified English/Spanish reviewer |
| C-CL07-V01 | medium | Dust-containment methods conflict: the SOP removes every grille and relies on drop cloths; this file stocks plugs and seals to hold negative pressure (hardware FLAG) | Qualified safety professional; equipment manufacturer instructions; licensed HVAC contractor for any access openings |
| X-09 | high | A chemical program across at least 16 services with no SDS, compatibility, storage, transport, spill or chemical-disposal rule (here: two chemical products, no SDS) | Qualified safety professional (hazmat transport applicability not concluded) |
| X-10 | high | No emergency kit in any inventory and no incident step in any SOP | Qualified safety professional |
| X-12 | high | Height tiers differ by service with no shared access standard; no ladder here although the card flags "ladder" and the SOP removes ceiling grilles | Qualified safety professional |

### Open questions

- Q-29-09 (owner): who is the qualified safety professional who selects PPE and respiratory protection, approves ladders and access equipment, authors SDS summaries and defines the vehicle safety kit?
- Q-30-14 (owner; licensed HVAC contractor; attorney): is CL-07 offered at launch, and are filters, dryer vents, fogging and commercial hoods offered? The answer decides the filter, fogging and dryer-vent lines above.
- Q-31-08 (owner and relevant reviewers): is biocide fogging offered at all, or referred out?
- Q-29-08 (owner; attorney; insurance broker): is the duct vacuum (and the compressor) owned or rented, and from whom?
- Q-29-01 (owner; insurance broker): where are stock and equipment kept, including a truck-mounted unit? This sets the default source column above.
- Q-29-05 (owner; job planner drafts): initial kit contents, par levels, minimum stock and reorder points, if CL-07 is in the launch set.
- Q-29-10 (local authority; safety reviewer): disposal destinations and rules for extracted debris and used filters in each service municipality.
- Q-36-05 (owner; attorney): approve one logged hygiene pass for typos such as "Skkipper" in non-legal files?
- Q-36-04 (owner; qualified English/Spanish reviewer): remove the Arabic headings after the edit phase, or keep them as historical text?

### Revision history

| Date | Change | Author |
|---|---|---|
| 2026-10-03 | Added frontmatter, status callout with the legacy-artifact line, two FLAG lines, categorization, proposed additions and review notes (R1, R2, R5, R3); original text unchanged | AI orchestrator (Claude) |
