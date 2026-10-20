---
title: "Inventory Checklist: Routine Cleaning"
service_id: CL-01
service_slug: routine-cleaning
canonical_name: "Routine House Cleaning"
category: "Cleaning"
doc_type: inventory
status: draft
authority: supporting
owner_approved: false
human_review:
  - "owner"
  - "safety reviewer (PPE/hazmat)"
  - "attorney licensed in KY/IN (product claims)"
registry: "AI Development Plans/04-service-registry.md#CL-01"
last_reviewed: 2026-10-03
---

# 🧹 Inventory Checklist: Routine Cleaning

> [!warning] Draft — not owner-approved
> Canonical service: **CL-01 — Routine House Cleaning** · [Registry entry](../AI%20Development%20Plans/04-service-registry.md#CL-01)
> Checklist only — quantities, stock levels, preferred vendors and reorder points are not yet defined. Proposed additions from the SOP and spec-card cross-check are listed at the end, pending owner and safety review. See [29 Inventory and procurement](../AI%20Development%20Plans/29-inventory-and-procurement.md).
> Legacy artifacts: Arabic text in this file (in the three section headings) is a non-authoritative brainstorm remnant (canonical currency USD, launch market KY/IN, languages EN/ES). It is kept unchanged pending an owner decision on cleanup.
> Review notes for this file: see "Review notes and cross-references" at the end.


## 🧴 A. The Chemical Arsenal (المنظفات الكيميائية اليومية)
- [ ] **PH-Neutral All-Purpose Cleaner (pH 7):** Safe, non-streaking concentrate for daily wiping of granite, quartz, marble, and sealed wood.
- [ ] **Ammonia-Free Glass Cleaner:** For smudge-free maintenance of mirrors, interior glass doors, and light fixtures.
- [ ] **Mild Bathroom Disinfectant Spray:** For regular sanitization of sinks, counter surfaces, and toilet seats.
- [ ] **Standard Toilet Bowl Cleaner (Liquid):** For routine interior toilet bowl scrubbing.
- [ ] **Eco-Friendly Fabric Refresh Spray:** To mist over fabric couches and bedsheets for a clean, subtle scent.

## 🧳 B. Hardware & Everyday Tools (الأدوات والحقيبة اليومية)
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

## 🛡️ C. PPE & Basic Safety (أدوات الحماية)
- [ ] **Light Disposable Nitrile Gloves:** To protect hands during routine spraying and wiping.
- [ ] **Disposable Shoe Booties:** Worn over cleaners' shoes to prevent tracking dirt into the client's home.
- [ ] **Clear Plastic Trash Liners (Bulk):** Small and medium sizes for relining bathroom and room bins.

## Categorization of listed items (added 2026-10-03)

*Added during the AI orchestrator repository audit; the checklist above is unchanged. Two-axis classification (item class and default source) per [29 Inventory and procurement](../AI%20Development%20Plans/29-inventory-and-procurement.md) D-29-01 (PROPOSED). Nothing here approves an item for purchase or use, and sizes, counts, brands and claims in the list are not approved values (29 D-29-02). "SOP" means the [routine cleaning SOP](../Standard%20Of%20Operations/sop%20Routine%20Cleaning%20Checklist.md), section 12.*

| Item (as listed above) | Item class | Default source / custody | Hazmat / SDS needed | Shelf-life / expiry | SOP step that uses it | Notes |
|---|---|---|---|---|---|---|
| PH-Neutral All-Purpose Cleaner (pH 7) | consumable_supply | unknown (Q-29-01); customer_provided where the customer's product preference or allergy requires it (spec CL-01.INT; START-009) | Yes - SDS required (TBD) | TBD - per product label or SDS | No step names it; candidate for "Microwave" and "Counters & Backsplash" (the latter names a "multi-surface sanitizer", which is not stocked); a substitution needs approval (spec JOB-007) | "Safe, non-streaking" and the stone and sealed-wood uses are product claims, unverified; surface suitability comes from the product label and the surface care instructions. Never mixed or sequenced with another product in a way the SDSs do not allow (spec CL-01.SAF). Interim rule (29 section 8.3, PROPOSED): a chemical product without a reviewed SDS is not carried to a job (HUMAN REVIEW: qualified safety professional) |
| Ammonia-Free Glass Cleaner | consumable_supply | unknown (Q-29-01) | Yes - SDS required (TBD) | TBD - per product label or SDS | SOP "Vanity" ("polish the mirror with glass cleaner") | "Ammonia-Free" is a product description to confirm from the label and SDS; compatibility with the other products is never inferred from a name (29 section 8.3). Interim rule (29 section 8.3, PROPOSED): a chemical product without a reviewed SDS is not carried to a job (HUMAN REVIEW: qualified safety professional) |
| Mild Bathroom Disinfectant Spray | consumable_supply | unknown (Q-29-01) | Yes - SDS required (TBD) | TBD - per product label or SDS | No step names it: the Phase 4 steps name no disinfectant (C-CL01-V01), and "High-Touch Wiping" uses "a disinfectant wipe", which is not stocked; using this spray instead needs an approved substitution (spec JOB-007; C-CL01-07) | Its stated use ("sinks, counter surfaces, and toilet seats") does not cover the showers, tubs and mirrors that the main plan says are disinfected (C-CL01-V01). Disinfection claims and directions come only from the approved product label (29 section 8.2 item 12; HUMAN REVIEW: qualified safety professional; attorney licensed in KY/IN for claims). Interim rule (29 section 8.3, PROPOSED): a chemical product without a reviewed SDS is not carried to a job (HUMAN REVIEW: qualified safety professional) |
| Standard Toilet Bowl Cleaner (Liquid) | consumable_supply | unknown (Q-29-01) | Yes - SDS required (TBD) | TBD - per product label or SDS | SOP "Toilet" ("Scrub the interior bowl with a brush"; no toilet brush is stocked, proposed below) | Used in the same room as the disinfectant spray and the glass cleaner: never mixed or sequenced with them in a way the SDSs do not allow (spec CL-01.SAF "never mix incompatible chemicals"; 31 section 3.3 entry 6). Interim rule (29 section 8.3, PROPOSED): a chemical product without a reviewed SDS is not carried to a job (HUMAN REVIEW: qualified safety professional) |
| Eco-Friendly Fabric Refresh Spray | consumable_supply | unknown (Q-29-01) | Yes - SDS required (TBD) | TBD - per product label or SDS | Unused by the current SOP | FLAG: "Eco-Friendly" is an unsubstantiated environmental claim, kept verbatim; it stays internal until substantiated (29 sections 2.1 and 8.2 item 12; HUMAN REVIEW: attorney licensed in KY/IN). Misting couches and bedsheets with a scented product needs the customer's consent, given the allergy intake (spec CL-01.INT "product preferences/allergies"). Interim rule (29 section 8.3, PROPOSED): a chemical product without a reviewed SDS is not carried to a job (HUMAN REVIEW: qualified safety professional) |
| Lightweight Commercial Upright Vacuum | tool (motor-driven; specialty_equipment only if the owner treats it as a high-value asset, 29 section 3.3 rule 3) | unknown (Q-29-01) | No | n/a (reusable) | SOP "Vacuuming" and "Upholstery" | No upholstery attachment is listed (proposed below; the step names none, ASSUMPTION). Pre-use check per the vacuum manufacturer's instructions (31 section 3.1 row 7) |
| Standard Microfiber Flat Mop System | tool | unknown (Q-29-01) | No | n/a (reusable; pads washable) | SOP "Mopping" ("damp microfiber mop") | "3x washable pads" is an unapproved kit count (29 D-29-02). Whether pads are assigned by area, as the cloths are by colour, is not stated (OPEN QUESTION, owner). The SOP holds mopping until wet floors are signed or controlled; no wet-floor sign is stocked (proposed below) |
| Standard Cleaning Caddy | tool | unknown (Q-29-01) | No | n/a (reusable) | No step names it | The description mentions "scrapers", but no scraper is stocked or used by any step, and the agreement excludes "deep grease scraping"; the mention is not a stocking instruction |
| Color-Coded Microfiber Cloths (Daily Supply) | consumable_supply (washed and reused in CL-01, replaced by wear; 29 section 3.3 rule 6) | unknown (Q-29-01) | No | n/a (replaced by wear; rule per owner) | Partly: "Electronics" asks for "a clean anti-static microfiber cloth" and "Vanity" for "a waffle-weave cloth", which these cloths are not designated as (review items below); the other wiping steps name no cloth | The colour system (next four rows) is not referenced by any SOP step, so its cross-contamination purpose is not part of the procedure (29 section 7.4 row CL-01); adopting it in the SOP is an owner and safety-review decision. "Daily Supply" is not an approved quantity (29 D-29-02) |
| Red: Toilets only. | consumable_supply (colour-coded cloth) | unknown (Q-29-01) | No | n/a (replaced by wear) | Matches "Toilet"; the step names no cloth | Colour rule unused by the SOP (see the parent row) |
| Yellow: Bathroom sinks and counters. | consumable_supply (colour-coded cloth) | unknown (Q-29-01) | No | n/a (replaced by wear) | Matches "Vanity" (which names a waffle-weave cloth for the mirror) | Colour rule unused by the SOP (see the parent row) |
| Green: Kitchen counters and tables. | consumable_supply (colour-coded cloth) | unknown (Q-29-01) | No | n/a (replaced by wear) | Matches "Counters & Backsplash" | Colour rule unused by the SOP (see the parent row) |
| Blue: Mirrors, glass, and polishing chrome. | consumable_supply (colour-coded cloth) | unknown (Q-29-01) | No | n/a (replaced by wear) | Matches "Vanity" (mirror), "Sink Area" and "Fixtures" (polishing) | Colour rule unused by the SOP (see the parent row) |
| Soft Bristle Detail Brushes | tool | unknown (Q-29-01) | No | n/a (reusable) | Unused by the current SOP | Described for "faucet bases and keypads"; the sink and vanity "Scrub" steps name no scrub tool (a scrub pad is proposed below; type per the surface care instructions) |
| Extendable Swiffer/Microfiber Feather Duster | tool | unknown (Q-29-01) | No | n/a (reusable) | SOP "Cobwebs" ("extension duster"), "Light Fixtures" and "Air Vents"; partly, because it is described for "reachable shelves and picture frames", so its reach for ceiling corners and crown moldings is unverified | "Swiffer" is a brand name kept verbatim, not an approved product or vendor (29 D-29-02; Q-29-03). Dusting is done from the floor: no ladder or step stool is stocked or permitted until a height and access policy exists (SOP section 2, Do not perform; 02 G-005; Q-31-09) |
| Light Disposable Nitrile Gloves | ppe | unknown (Q-29-01) | No | TBD - per manufacturer | No step names PPE (SOP section 6 reads "TBD - pending safety review") | The only PPE listed. Whether these gloves suit each cleaning product, and whether eye protection or cut-resistant gloves are needed, is decided from the SDSs and the card hazards by the qualified safety professional (spec CL-01.TLS "PPE"; 29 section 5.2 `ppe-base`); "Light" is not a selected glove type |
| Disposable Shoe Booties | consumable_supply (property protection; filed under "PPE & Basic Safety", 29 section 3.4) | unknown (Q-29-01) | No | n/a (single use) | Unused by the current SOP | Protects the customer's floors, not the worker, so it is not PPE (29 section 3.3 rule 2). Whether booties are worn on wet or freshly mopped hard floors is a slip question for the qualified safety professional (spec CL-01.HAZ "slips"; RISK, unverified) |
| Clear Plastic Trash Liners (Bulk) | consumable_supply (filed under "PPE & Basic Safety", 29 section 3.4) | unknown (Q-29-01) | No | n/a (single use) | SOP "Trash Bins" ("place fresh liners") | "Small and medium sizes" only: no size for kitchen bins (proposed below; C-CL01-07). "Bulk" is not an approved quantity (29 D-29-02). Hidden sharps or biohazards in bins are a SOP hold (spec CL-01.HAZ "sharps/biohazard surprises") |

## Proposed additions from SOP and spec-card cross-check (pending owner and safety review)

*Sources: spec card CL-01 (.TLS, .MAT, .HAZ, .SAF), the SOP steps and holds, and 29 sections 5.2, 7.3 and 7.4. Nothing below is approved for purchase or use (29 D-29-02). No quantities, brands, vendors, ratings or PPE classes are given.*

| Item | Item class | Required by (source) | Reason | Status |
|---|---|---|---|---|
| PPE for cleaning-chemical use and for sharps and biohazard surprises - selection by qualified safety professional | ppe | spec CL-01.TLS "PPE"; CL-01.HAZ "chemical mixing", "sharps/biohazard surprises"; kit `ppe-base` (29 sections 5.2 and 5.4) | only light nitrile gloves are listed; eye protection and cut-resistant gloves are review candidates, not selections (29 section 5.2; 04 CL-01 "PPE") | PROPOSED |
| `vehicle-safety` kit reference: first-aid kit, fire extinguisher, eyewash, spill kit as review items | kit (contents by qualified safety professional) | 29 D-29-08 and section 5.2; X-10 | no emergency kit in any inventory | PROPOSED |
| SDS register field for each chemical product above (all-purpose cleaner, glass cleaner, bathroom disinfectant, toilet bowl cleaner, fabric refresh spray) and for the chemical additions below | record field (not an item) | 02 G-008; 29 section 8.2 item 1; 29 D-29-03 | no SDS for any product (X-09) | PROPOSED |
| Wet-floor sign | tool | spec CL-01.SAF "signage/control wet floors"; 29 section 5.2 (`cleaning-core`) and section 7.2 item 9 | not listed; the SOP holds mopping until wet floors are signed or controlled | PROPOSED |
| Sharps container - type and handling method by qualified safety professional | tool (review item) | spec CL-01.HAZ "sharps/biohazard surprises"; 29 section 5.2 (`cleaning-core`) and section 7.2 item 7 | not listed; the SOP says stop and escalate on sharps (spec CL-01.SAF); whether workers ever contain found sharps is the reviewer's decision, and disposal follows the municipality's rules (Q-29-10) | PROPOSED - review item |
| Toilet brush | tool | SOP "Toilet" ("Scrub the interior bowl with a brush"); 29 sections 5.2 and 7.4 | not listed (C-CL01-07) | PROPOSED |
| Slip-on microfiber sleeve for fan blades | tool | SOP "Ceiling Fans" ("using a slip-on microfiber sleeve"); 29 section 7.4 | not listed (C-CL01-07); the SOP holds fan dusting until the fan is stopped and switched off | PROPOSED |
| Lint roller | consumable_supply | SOP "Decor" ("using a lint roller if fabric"); 29 section 7.4 | not listed (C-CL01-07) | PROPOSED |
| Disinfectant wipes - approved product with reviewed SDS | consumable_supply | SOP "High-Touch Wiping" ("with a disinfectant wipe"); 29 section 7.4 | not listed (C-CL01-07); no substitution by the bathroom spray is documented (spec JOB-007) | PROPOSED |
| Stainless steel polish or other material-specific cleaner - approved product with reviewed SDS | consumable_supply | SOP "Large Appliances" ("material-specific cleaner (e.g., stainless steel polish)"); 29 section 7.4 | not listed (C-CL01-07) | PROPOSED |
| Non-scratch scrub pad - type per the surface care instructions | consumable_supply | SOP "Sink Area" and "Vanity" ("Scrub the sink basin"); 29 section 7.4 | not listed; only soft detail brushes | PROPOSED |
| Upholstery attachment for the vacuum | tool | SOP "Upholstery" ("Vacuum the surfaces of fabric sofas, armchairs"); 29 section 7.4 | not listed; the step names no attachment (ASSUMPTION, 04 CL-01 "required tools") | PROPOSED |
| Disinfectant floor cleaner for bathrooms - approved product with reviewed SDS | consumable_supply | SOP "Mopping" ("use disinfectant floor cleaner for bathrooms"); 29 section 7.4 | not listed (C-CL01-07) | PROPOSED |
| Trash liners sized for kitchen bins | consumable_supply | SOP "Trash Bins" ("Gather trash from all rooms"); 02 C-CL01-07 proposed resolution | listed sizes are small and medium only | PROPOSED |
| Multi-surface sanitizer - approved product with reviewed SDS | consumable_supply | SOP "Counters & Backsplash" ("spray with multi-surface sanitizer"); 04 CL-01 "required inventory" | partly covered: the all-purpose cleaner is a cleaner, not a sanitizer | REVIEW - stock it or document a substitute (owner; spec JOB-007) |
| Anti-static microfiber cloth for screens | consumable_supply | SOP "Electronics" ("a clean anti-static microfiber cloth"); 04 CL-01 "required inventory" | partly covered: no listed cloth is designated for screens | REVIEW - stock it or document a substitute (owner; spec JOB-007) |
| Waffle-weave cloth | consumable_supply | SOP "Vanity" ("a waffle-weave cloth"); 04 CL-01 "required inventory" | partly covered by the blue microfiber cloth | REVIEW - stock it or document a substitute (owner; spec JOB-007) |

---

## Review notes and cross-references (added 2026-10-03)

*Added during the AI orchestrator repository audit. Not part of the original content; original text above is unchanged.*

**Related files:** [Registry entry](../AI%20Development%20Plans/04-service-registry.md#CL-01) · [Pricing](../Pricing/pricing-routine-cleaning.md) · [Agreement](../Service%20Agreements/contract-routine-cleaning.md) · [SOP](../Standard%20Of%20Operations/sop%20Routine%20Cleaning%20Checklist.md) · [Requirements spec (service card CL-01)](../Requierments/HandyHub_Requirements_Specification_Reconstructed.md) · [Main plan](../Main%20Plans/Cleaning%20Business.md) · [Gap analysis](../AI%20Development%20Plans/02-gap-analysis.md)

### Issues affecting this file

| ID | Severity | Issue (short) | Reviewer / owner |
|---|---|---|---|
| C-CL01-07 | medium | SOP requires items the inventory does not stock (proposed additions above) | Owner; lead worker |
| C-CL01-09 | medium | Saudi riyal (SAR) prices and Arabic headings in a USD Kentuckiana price guide and inventory (here: Arabic in the three section headings, legacy-artifact line in the callout) | Owner (removal decision); qualified English/Spanish reviewer |
| C-CL01-V01 | medium | The main plan promises disinfecting showers, tubs and mirrors, but no SOP step or stocked product covers it (the bathroom spray's stated use excludes them) | Owner (scope); qualified safety professional (product and label use); attorney licensed in KY/IN (claim wording) |
| C-CL03-02 | critical | The inventory has no PPE although it lists concentrated chemicals and debris handling, which the spec requires PPE for (evidence; owned by CL-03: this file's PPE section is cited for comparison only - the CL-03 inventory has none) | Qualified safety professional (PPE selection from SDS, no invented respirator choices) |
| C-CL02-09 | medium | SOP requires products and tools the inventory does not stock (evidence; owned by CL-02: the CL-02 kit builds on this CL-01 kit, spec CL-02.TLS) | Owner; job planner (loadout) |
| C-CL03-06 | medium | The inventory omits the core equipment the SOP requires (evidence; owned by CL-03: the CL-03 kit builds on the CL-02 and CL-01 kits) | Owner; job planner (loadout) |
| X-09 | high | A chemical program across at least 16 services with no SDS, compatibility, storage, transport, spill or chemical-disposal rule (here: five chemical products, no SDS) | Qualified safety professional (hazmat transport applicability not concluded) |
| X-10 | high | No emergency kit in any inventory and no incident step in any SOP (here: `vehicle-safety` kit proposed above) | Qualified safety professional |

### Open questions

- Q-29-05 (owner; job planner drafts): what are the initial kit contents, par levels, minimum stock and reorder points for CL-01 if it is in the launch set?
- Q-29-09 (owner): who is the qualified safety professional who selects PPE, authors SDS summaries and segregation groups, and defines the vehicle safety kit?
- Q-29-01 (owner; insurance broker): where are stock and tools kept (shop, storage, vehicles)? This sets the default source column above.
- Q-29-10 (local authority; safety reviewer): disposal destinations and rules for mop water, chemical residues, sharps and biohazards in each service municipality.
- Q-31-11 (owner; qualified safety professional): emergency kit contents, SDS register owner, chemical storage and transport.
- C-CL01-V01 (owner): add a reviewed disinfecting step with an approved product, or narrow the main-plan copy? The answer decides whether a disinfectant for showers, tubs and mirrors is stocked.
- Q-36-04 (owner; qualified English/Spanish reviewer): remove the Arabic headings after the edit phase, or keep them as historical text?

### Revision history

| Date | Change | Author |
|---|---|---|
| 2026-10-03 | Added frontmatter, status callout, categorization, proposed additions and review notes (R1, R2, R5, R3); original text unchanged | AI orchestrator (Claude) |
