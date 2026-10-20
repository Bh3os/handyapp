---
id: SVC-CL-07
type: service
title: "Air Duct & Ventilation Cleaning"
status: active
area: business
links:
  decided_by: ["[[OWN-DEC-04]]", "[[OWN-DEC-33]]", "[[OWN-DEC-84]]", "[[OWN-DEC-51]]", "[[OWN-DEC-102]]", "[[OWN-DEC-108]]"]
  uses: ["[[SOP-CL-07]]", "[[FACT-INVENTORY-CL-07]]", "[[FACT-PRICING-PER-JOB]]", "[[FACT-SVC-EXCLUDED-SCOPE]]"]
  constrained_by: ["[[RULE-HUMAN-REVIEW]]", "[[RULE-SAFETY-GATES]]", "[[RULE-NO-INVENTED-FACTS]]", "[[FACT-SVC-EXCLUDED-SCOPE]]", "[[FACT-SVC-SUSPECTED-HAZMAT]]", "[[FACT-SVC-ACCESS-EQUIPMENT]]", "[[FACT-SVC-REFER-OUT-TASKS]]", "[[FACT-SVC-CL07-SCOPE]]"]
  part_of: ["[[C01]]", "[[C02]]"]
  related: ["[[FACT-PRICING-CL-07]]", "[[FACT-AGREEMENT-CL-07]]", "[[FACT-SERVICE-AREA]]", "[[FACT-BRAND-IDENTITY]]", "[[FACT-SVC-NAMES]]", "[[HH-SVC-01]]", "[[HH-SVC-02]]", "[[HH-SVC-03]]", "[[HH-SVC-04]]", "[[OWN-DEC-91]]", "[[OWN-DEC-99]]", "[[OWN-DEC-127]]"]
source: "guide 6.2; vault 04-service-registry CL-07; spec section 17 CL-07; Standard Of Operations/sop Air Duct and Vent Cleaning Checklist.md; Main Plans/Cleaning Business.md"
---
Category: Cleaning. Catalog name (guide 6.2): Air Duct & Ventilation Cleaning. Canonical name (spec Appendix B): Air Duct & Ventilation Cleaning. Slug: `air-duct-cleaning`. Brand and service area: [[FACT-BRAND-IDENTITY]], [[FACT-SERVICE-AREA]]; naming: [[FACT-SVC-NAMES]].

In the launch set: all 26 services are in scope and launch ([[OWN-DEC-04]], [[OWN-DEC-33]]); reported capability is not proof of insurance, qualifications or equipment. Worker checklist: [[SOP-CL-07]] (active, pending competent review for production use, [[OWN-DEC-108]]). Pricing: each job is priced individually on its own estimate ([[FACT-PRICING-PER-JOB]]); the vault price list [[FACT-PRICING-CL-07]] is superseded. Tools and materials: [[FACT-INVENTORY-CL-07]]. Draft agreement clauses: [[FACT-AGREEMENT-CL-07]] (attorney review; customers approve the estimate terms of [[OWN-DEC-127]]).

Vault files: SOP `Standard Of Operations/sop Air Duct and Vent Cleaning Checklist.md`; Pricing `Pricing/pricing-air-duct-cleaning.md`; Inventory `Required inventory/inventory-air-duct-cleaning.md`; Agreement `Service Agreements/contract-air-duct-cleaning.md`; main plan `Main Plans/Cleaning Business.md` ("💨 7. Air Duct & Ventilation Cleaning").

- aliases (registry 04, label **FACT**): "Air Duct & Ventilation Cleaning" (main plan heading); "Clean Air, Lower Energy Bills—Professional HVAC & Vent Restoration" (website headline; implies HVAC repair scope); "ventilation cleaning service" (main plan body); "Air Duct & Vent Cleaning" (pricing and inventory titles); `sop Air Duct and Vent Cleaning Checklist.md` and "Air Duct & Vent Cleaning Micro-Checklist" (SOP file name and title); expected agreement `contract-air-duct-cleaning.md` (does not exist) (source: main plan L98-99, L102; pricing L1; inventory L1; SOP L1; Service Agreements folder)

## Customer description

No owner-approved customer description exists in the sources. Service-page content is drafted from the service files: staging shows the drafts, production shows only versions the owner approves and publishes ([[OWN-DEC-84]], amended 2026-10-12). Pages state the service's limits ([[OWN-DEC-51]]) and never invent prices, completion times, credentials or guarantees ([[RULE-NO-INVENTED-FACTS]]).

- customer-facing description (registry 04, label **FACT** + **OPEN QUESTION** + **PROPOSED**): Draft copy (unapproved; to be rewritten from spec scope): ducts as "breeding grounds for dust mites, pet dander, mold spores, and allergens"; negative-pressure extraction; filter replacement; grille/register washing; vacuum extraction from main ducts; bathroom and range-hood exhaust fans; "Air quality optimization". Flags: "Clean Air, Lower Energy Bills", "breathe pure, clean air" and allergen/mold-spore removal are unsupported air-quality, health and energy claims the card forbids (C-CL07-02, C-CL07-01). PROPOSED basis for a rewrite: cleaning of accessible registers/returns and authorized duct scope with HEPA/negative-pressure equipment, filter installed if included, limitations documented; no air-quality, health or energy claims (source: main plan L99-109; spec CL-07.SAF, CL-07.QAC)

Purpose (SOP section 1):

- Clean the accessible supply and return registers, grilles and the duct scope authorized on the approved estimate with negative-pressure and HEPA equipment, install a filter where included, restore the system and document limitations, for canonical service CL-07 Air Duct & Ventilation Cleaning (source: spec Appendix B; spec CL-07.TLS, CL-07.QAC; 04 CL-07 "customer-facing description", PROPOSED basis for a rewrite).
- This SOP describes how the work is done and promises no outcome: no indoor-air-quality, health, energy-saving or mold-removal result is claimed (source: spec CL-07.SAF "do not make unsupported indoor-air-quality claims"; C-CL07-01; C-CL07-02; 31 section 3.5 rule 5).
- The H1 above keeps the file's original title ("Air Duct & Vent Cleaning"); the frontmatter carries the canonical identity (source: 04 section 4 alias map).

### Draft plan copy (`Main Plans/Cleaning Business.md`; not approved, claims unverified)

*Target Headline for Website: Clean Air, Lower Energy Bills—Professional HVAC & Vent Restoration*

Out of sight should not mean out of mind. Your HVAC system continuously circulates air throughout your home, and over time, main air ducts become heavy breeding grounds for dust mites, pet dander, mold spores, and allergens. This ruins interior air quality and forces your AC unit to work harder, increasing your energy bills. Our ventilation cleaning service uses high-powered negative pressure extraction to clear your ductwork, letting your family breathe pure, clean air.

- [ ] **Filter replacement:** Removing clogged, dusty air filters and installing brand new HVAC or AC filters.
- [ ] **Grille and register scrubbing:** Washing the metal vent covers and intake grilles to eliminate visible dust buildup.
- [ ] **Hose and vacuum extraction:** Utilizing specialized vacuum equipment to pull dust and debris out of main air ducts.
- [ ] **Exhaust fan clearing:** Cleaning out greasy or dusty exhaust fans in bathrooms and kitchen range hoods.
- [ ] **Air quality optimization:** Removing allergens, mold spores, and pet dander from the ventilation pathway to improve breathing conditions.

Claims the main plan flags for this service (each `unverified`, not publishable until approved):

- "Clean Air, Lower Energy Bills—Professional HVAC & Vent Restoration": Headline - Remove (Indoor-air and savings claims; "HVAC ... Restoration" implies licensed HVAC scope (CL-07.SAF)) (reviewer: Attorney + licensed HVAC technician (scope wording))
- "letting your family breathe pure, clean air": HEALTH - Remove (reviewer: Attorney)
- "Removing allergens, mold spores, and pet dander": HEALTH, SAFE - Remove (reviewer: Attorney + safety reviewer)
- "forces your AC unit to work harder, increasing your energy bills": ENV (savings) - Remove (reviewer: Attorney)

## Request questions

- Guide 6.2 extra inputs / review needs: System/vents, access, contamination reports, specialist equipment/capability.
- Spec intake (CL-07.INT): HVAC system type, accessible registers/returns, reported concern, filter size, suspected mold/pest/contamination, equipment capability.
- Answers follow [[OWN-DEC-91]] and [[HH-SVC-03]]: units shown beside each measurement, approximate values allowed, and "I don't know" stays unknown, never zero, safe or approved. The sources set no per-service unit list.
- Estimate route: online when the details and photos are enough, a site visit when inspection or measurements are needed ([[OWN-DEC-99]], [[HH-SVC-04]]); a customer preference for a remote estimate never overrides a required site or qualification review.
- Service conditions: [[FACT-SVC-CL07-SCOPE]] (which duct-cleaning parts are offered).

## Included work (SOP section 2, "In scope")

- The 11 original steps in section 12, in four phases: system shutdown and containment; grille removal, grille washing and boot vacuuming; agitation (on hold), negative-pressure extraction and residential exhaust fans; filter swap and a "Fan Only" system test (source: section 12).
- Supply and return grilles on walls and ceilings as the approved estimate lists them; grilles that need access equipment stay blocked until an approved height and access policy exists (source: SOP "Grille Removal"; spec CL-07.HAZ "ladder"; X-12). The pricing file's Model A counts wall registers only; which register locations are priced is an owner decision and does not change this SOP (C-CL07-V02).
- Filter replacement only where the approved estimate includes it (source: spec CL-07.QAC "filter installed if included").
- These steps match the main plan's process list (filter replacement, grille and register scrubbing, vacuum extraction, exhaust fan clearing) except "Air quality optimization", which no step can evidence (source: main plan section 7; C-CL07-01; C-CL07-02).

## Excluded work and limits

HandyHub never performs licensed or unsafe scope: [[FACT-SVC-EXCLUDED-SCOPE]]; suspected hazardous material: [[FACT-SVC-SUSPECTED-HAZMAT]]; access equipment: [[FACT-SVC-ACCESS-EQUIPMENT]]. Referred out at launch for this service: biocide fogging ([[FACT-SVC-REFER-OUT-TASKS]]).

### SOP section 2, "Out of scope"

- Not covered - pending review (C-CL07-03): antimicrobial or biocide fogging, sold as "Anti-Microbial Sanitize Fogging" in the pricing file and stocked as a sanitizer "For fogging"; not performable until a specific product with label directions and SDS is approved (31 section 10 CL-07).
- Not covered - pending review (C-CL07-04): dryer-vent exhaust line cleaning, sold in the pricing file.
- Not covered - pending review (C-CL07-05; X-23): commercial kitchen exhaust - the pricing file's "Commercial Range Exhaust Hood (Kitchens)" and the inventory's degreaser for "commercial kitchen ventilation lines".
- Not covered - pending review (C-CL07-07): cutting, patching or sealing access openings in the plenum or trunk lines (inventory patching-tape line) and connecting equipment to the furnace (pricing base-fee line); licensed HVAC only.
- Not covered - pending review (C-CL07-V03): the "Base Inspection" and "testing system lines" named in the pricing file's base-fee line. The pre-work screens in section 12 are safety holds, not that inspection, and they certify nothing.
- Not covered - pending review (C-CL07-01; C-CL07-02): "Air quality optimization" and the removal of "allergens, mold spores, and pet dander" promised in the main plan.
- Not covered (04 CL-07 "exclusions", PROPOSED): coil, blower and air-handler cleaning, pending licensing review; range-hood filters, which belong to CL-02 under the PROPOSED hood and grille boundary (04 section 5; Q-04-15).
- Not covered (04 CL-07 "hazards"): work inside attics or crawlspaces; no step covers access, heat or insulation contact there.

### SOP section 2, "Do not perform"

*Entries 1-8 are the universal PROPOSED wording of 31 SOP standard section 3.3; entries 9-15 are the CL-07 seeds of 31 section 10 and the 04 CL-07 card. Each entry gives the action, the reason class and what to do instead. HUMAN REVIEW: qualified safety professional and licensing reviewer.*

1. Electrical, plumbing, gas or HVAC work outside the approved scope or requiring a licensed trade. Licensed trade: stop and escalate (source: spec START-011 "unapproved electrical/plumbing/gas/structural scope"; master section 1.3).
2. Structural work, meaning cutting, removing, sistering or adding load-bearing members, ledgers, footings or framing, unless it is in the approved scope with the required qualified review. Structural: stop and escalate (source: START-011; master section 1.3).
3. Disturbing suspect asbestos, lead paint or mold. Hazardous material: stop and escalate (source: START-011 "suspect hazardous materials"; owner facts L20 "Unknown is not safe").
4. Work that is not in the approved scope or an approved change order. Out of scope: record the customer's request instead (source: JOB-005, JOB-010, FIN-008, AT-033).
5. Working at height or using access equipment beyond the approved height and access policy. Policy: stop and escalate (source: HI-06.SAF "beyond approved height/access policy"; DW-04.TLS "scaffolds/stilts only under approved policy").
6. Mixing or sequencing chemicals in any way the approved step and the product SDS do not allow. Hazardous material: stop and escalate (source: CL-01.SAF "never mix incompatible chemicals"; X-09).
7. Recording, photographing or sending customer passwords, master codes or site access codes outside the app's secured fields. Policy: keep them only in the app's secured fields (source: COM-002; owner facts L17; 27 AUTH-009).
8. Promising results, warranties, safety, health or code compliance to the customer. Policy: refer such questions to the owner (source: master sections 1.4, 17 and 29; CL-07.SAF "do not make unsupported indoor-air-quality claims").
9. Making indoor-air-quality, health or energy claims, for example "clean air", allergen or mold-spore removal, or lower energy bills. Policy: describe only the steps performed and the limitations recorded, and refer questions to the owner (source: spec CL-07.SAF "do not make unsupported indoor-air-quality claims"; C-CL07-02; 31 section 10 CL-07).
10. Suspected asbestos / lead paint / mold: stop and escalate (source: spec START-011). For CL-07 this covers suspect duct wrap, tape or mastic and suspected mold growth in ducts, boots, registers or the air handler; mold remediation of any kind - agitating, vacuuming, treating or fogging suspected growth - is not performed. Hazardous material: stop and refer (source: spec CL-07.SAF; 31 section 10 CL-07 "no mold remediation"; 04 CL-07 "hazards"; C-CL07-01).
11. Cutting, patching or sealing access openings in the plenum or trunk lines, and connecting any equipment to the furnace. Licensed trade or permit question (open): licensed HVAC only (source: 31 section 10 CL-07 "plenum access holes and furnace connections: licensed HVAC only"; spec CL-07.SAF "scope requiring licensed HVAC work"; C-CL07-07; HUMAN REVIEW: licensing authority for the municipality, licensed HVAC contractor).
12. Fogging, misting or spraying any sanitizer, disinfectant or biocide into the duct system. Hazardous material: not performable until a specific product with label directions for duct use and its SDS are approved (source: 31 section 10 CL-07; C-CL07-03; HUMAN REVIEW: qualified safety professional; state pesticide regulator for label use and applicator questions).
13. Dryer-vent exhaust line cleaning. Out of scope: record the request and refer it to the owner (source: 31 section 10 CL-07; C-CL07-04).
14. Commercial kitchen exhaust work (hoods, fan paths, ducts). Out of scope: record the request and refer it to the owner (source: 31 section 10 CL-07; C-CL07-05; X-23).
15. Work on furnace gas components, or on HVAC equipment beyond the steps in section 12, including coil, blower or air-handler cleaning. Licensed trade: stop and refer (source: 04 CL-07 "exclusions", PROPOSED; 04 section 5 "Licensed electrical, plumbing, gas and HVAC work"; entry 1).

- exclusions (registry 04, label **GAP** + **PROPOSED**): None in any file (GAP). Card-implied: scope requiring licensed HVAC work, significant mold, asbestos-containing material, damaged ducts. PROPOSED boundaries: residential range-hood filters = CL-02, hood fan and duct = CL-07; commercial kitchen exhaust excluded unless the owner decides (X-23); coil/blower/air-handler cleaning, plenum cutting and furnace connection out of scope pending licensing review; dryer vents and fogging held until a reviewed SOP exists (source: spec CL-07.SAF; pricing L28-30; inventory L14; SOP L16)

## Hazards and human-review flags

- Spec hazards (CL-07.HAZ): electrical/mechanical equipment, dust/allergens, sharp duct edges, ladder, suspect mold/contamination, damage to duct lining.
- Spec stop-work guidance (CL-07.SAF): system off/isolation per procedure; do not make unsupported indoor-air-quality claims; stop on suspected significant mold, asbestos-containing material, damaged ducts or scope requiring licensed HVAC work.
- permit/license flags (registry 04, label **OPEN QUESTION**): None in files. OPEN QUESTION: is cutting/patching plenum access holes or connecting to the furnace licensed HVAC or permit work in the specific KY/IN municipality (unknown must not default to no permit); does the sanitizer label permit HVAC-duct use, and does paid application need a state pesticide applicator credential (KY and IN separately); commercial kitchen exhaust fire-code or certification duties; mold and asbestos referral thresholds; insurance for HVAC-adjacent and chemical work. HUMAN REVIEW: municipal/state licensing authority, licensed HVAC contractor, state pesticide regulator, local fire code official, qualified mold assessor, accredited asbestos inspector, insurance broker, KY/IN attorney (source: inventory L5, L14; pricing L16, L29-30; owner facts; risk-triage playbook)
- Reviewers named in the vault files' front matter: qualified safety reviewer; owner; Spanish translation reviewer; licensed trade professional; licensed HVAC contractor; licensed electrician; mold assessor; accredited asbestos inspector; CPA (tax treatment); attorney licensed in KY/IN (product, outcome and commercial wording); qualified safety professional (add-on hazards); licensed HVAC contractor (furnace connection and system testing scope); insurance broker (commercial and chemical scope); safety reviewer (PPE/hazmat); licensed HVAC contractor (plenum access materials); licensed electrician (isolation devices, if adopted); state pesticide regulator (sanitizer label use and applicator credential); attorney licensed in KY/IN (product claims); attorney licensed in KY/IN; insurance broker. Boundaries: [[RULE-HUMAN-REVIEW]].

### Required worker qualifications (SOP section 4)

- TBD — requires review by safety-liability-manager and a qualified person; owner to approve. No company qualification tags or training records exist yet (source: 31 section 3.1 row 4, GAP); what qualifications a CL-07 worker needs is an open owner decision (source: 30 section 10.2; Q-30-14).
- Tasks that may be licensed HVAC or electrical work - plenum access openings, furnace connection, the isolation method - are not done by HandyHub workers unless a licensed professional and the licensing review say otherwise (source: C-CL07-07; C-CL07-06; HUMAN REVIEW: licensing authority, licensed HVAC contractor, licensed electrician).
- Expertise gap: no HandyHub skill covers HVAC, mechanical or mold work; a licensed HVAC contractor and a mold professional act as human reviewers (source: 04 CL-07 "responsible skill / business role").
- Manual handling and two-person tasks (moving the vacuum unit, compressor and hoses): TBD - requires qualified safety reviewer review (source: spec BRF-008 "manual handling"; inventory "heavy portable system").
- With two employees, a worker never clears their own hold (source: 31 section 8.3 rule 3).

### Hazards (SOP section 9)

*Draft entries from the spec card and the CL-07 files. Severity, PPE and final controls for every entry are TBD by the qualified safety professional (HUMAN REVIEW). Controls are listed in hierarchy order - eliminate, substitute, engineer, administrative, PPE - as drafts only (source: safety-liability-manager skill).*

| # | Hazard | Source | Draft controls (pending review) | Stop-work trigger | IDs |
|---|---|---|---|---|---|
| 1 | Electrical and mechanical equipment: the HVAC system, range-hood and bathroom fans, powered tools | spec CL-07.HAZ "electrical/mechanical equipment"; SOP "System Shutdown", "Exhaust Systems" | System off and isolated per procedure (CL-07.SAF); isolation point, lockout against re-energizing, verification and restore pending licensed review; fans confirmed off and unable to start before hands or tools go in | Isolation cannot be confirmed; damaged wiring or equipment; work that needs licensed HVAC or electrical scope | C-CL07-06, X-07 |
| 2 | Whole-home power interruption, if "the main circuit breaker" means the home's main breaker (ASSUMPTION; it may mean the HVAC circuit) | SOP "System Shutdown"; 04 CL-07 "hazards" | Customer told and accepts before isolation; equipment power source confirmed so nothing is re-energized mid-job | Customer does not accept; anything in the home depends on uninterrupted power | C-CL07-06 |
| 3 | Dust and allergens released into rooms through open registers | spec CL-07.HAZ "dust/allergens"; SOP "Containment", "Agitation Run" | Containment method decided by the reviewer (pending); occupants and pets kept out; PPE TBD | Containment cannot be set up as the reviewer requires | C-CL07-V01, X-11 |
| 4 | Suspect mold or other biological contamination, including pest debris | spec CL-07.HAZ "suspect mold/contamination"; CL-07.INT "suspected mold/pest/contamination"; SOP "Agitation Run" ("mold spores") | Pre-work screens with photos (section 12); do not disturb; company mold definition pending (Q-31-10); no mold remediation | Suspected significant mold (CL-07.SAF); other contamination as an unsafe condition (section 10) | C-CL07-01, X-06 |
| 5 | Suspect asbestos-containing material, for example older duct wrap, tape or mastic (unverified per house) | spec CL-07.SAF "asbestos-containing material"; 04 CL-07 "hazards" | Old-property screening module (31 section 5.8, pending); do not disturb | Any suspect material | - |
| 6 | Damaged ducts or duct lining, including damage caused by tools | spec CL-07.HAZ "damage to duct lining"; CL-07.SAF "damaged ducts" | Duct-type and lining check before rotary brushes or air whips; tools only as their manufacturer allows for that duct type | Damaged duct or lining; duct type unknown or not approved for the tool | - |
| 7 | Sharp duct and grille edges | spec CL-07.HAZ "sharp duct edges" | Cut protection per the reviewer (PPE TBD) | Unsafe condition (section 10) | - |
| 8 | Ladder and height: ceiling grilles and ceiling-mounted fans; a loose ceiling grille can fall | spec CL-07.HAZ "ladder"; SOP "Grille Removal" ("walls and ceilings"); C-CL07-08 | Blocked until an approved height and access policy exists (02 G-005); reinstall, secure and count every grille before the system test | No approved access method; a grille or fastener that cannot be secured | X-12, C-CL07-08 |
| 9 | Compressed air from air whips and the compressor | inventory air-whip line ("Run by an air compressor") | Agitation on hold; eye and face, hose and flying-debris controls per the reviewer and the tool manufacturer | Unsafe condition (section 10) | C-CL07-01 |
| 10 | Licensed HVAC scope: plenum access openings, furnace connection | spec CL-07.SAF "scope requiring licensed HVAC work"; inventory patching-tape line; pricing base-fee line | Not performed; refer (Do not perform 11) | Any need to cut, patch or seal an opening or to connect to the furnace | C-CL07-07 |
| 11 | Gas furnace interface (OPEN QUESTION) | 04 CL-07 "hazards" ("gas furnace interface"); 31 section 7.2 rank 7 | No work on gas components (Do not perform 15) | Gas odor: emergency (section 19, step 2); any gas-component request | - |
| 12 | Grease on range-hood fan blades | SOP "Exhaust Systems"; inventory degreaser line | Residential hood fans only; scraping as the step states; any degreaser only as an approved product with a reviewed SDS | Commercial kitchen exhaust (not covered) | C-CL07-05 |
| 13 | Biocide fogging and occupant exposure (not performed) | pricing fogging add-on; inventory sanitizer line | Not covered; not performable until a product, its label directions and SDS are approved | Any request to fog (Do not perform 12) | C-CL07-03 |
| 14 | Manual handling of the vacuum unit, compressor and hoses | inventory duct-vacuum line ("Truck-mounted or heavy portable system"); spec BRF-008 "manual handling" | Handling method TBD by the reviewer | Unsafe condition (section 10) | - |
| 15 | Occupants, children and pets near open registers, equipment and hoses | X-11; spec CX-005 | Keep them out of the work area; shared module pending (31 section 5.8) | Unsafe condition; aggressive occupant or animal (section 10) | X-11 |

## Warranty or callback

- warranty or callback policy (registry 04, label **GAP** + **OPEN QUESTION**): None, and none may be invented (GAP). OPEN QUESTION: any callback policy (owner + attorney); returns classified per CX-007 and QA-010 (source: spec CX-007, QA-010)
- Governed now by: the 90-day workmanship warranty of [[FACT-WARRANTY]] ([[OWN-DEC-135]]), counted from the reviewed completion date; a claim opens a case with return-visit punch items ([[HH-QA-07]]). No warranty exclusions are defined; any come only from attorney review ([[OQ-ATTORNEY-TERMS]]).
