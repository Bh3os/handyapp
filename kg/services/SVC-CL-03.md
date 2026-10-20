---
id: SVC-CL-03
type: service
title: "Move-In/Move-Out Cleaning"
status: active
area: business
links:
  decided_by: ["[[OWN-DEC-04]]", "[[OWN-DEC-33]]", "[[OWN-DEC-84]]", "[[OWN-DEC-51]]", "[[OWN-DEC-102]]", "[[OWN-DEC-108]]"]
  uses: ["[[SOP-CL-03]]", "[[FACT-INVENTORY-CL-03]]", "[[FACT-PRICING-PER-JOB]]", "[[FACT-SVC-EXCLUDED-SCOPE]]", "[[FACT-SVC-LEFT-ITEMS]]", "[[FACT-SVC-LARGE-CLEANING-JOBS]]"]
  constrained_by: ["[[RULE-HUMAN-REVIEW]]", "[[RULE-SAFETY-GATES]]", "[[RULE-NO-INVENTED-FACTS]]", "[[FACT-SVC-EXCLUDED-SCOPE]]", "[[FACT-SVC-SUSPECTED-HAZMAT]]", "[[FACT-SVC-ACCESS-EQUIPMENT]]"]
  part_of: ["[[C01]]", "[[C02]]"]
  related: ["[[FACT-PRICING-CL-03]]", "[[FACT-AGREEMENT-CL-03]]", "[[FACT-SERVICE-AREA]]", "[[FACT-BRAND-IDENTITY]]", "[[FACT-SVC-NAMES]]", "[[HH-SVC-01]]", "[[HH-SVC-02]]", "[[HH-SVC-03]]", "[[HH-SVC-04]]", "[[OWN-DEC-91]]", "[[OWN-DEC-99]]", "[[OWN-DEC-127]]"]
source: "guide 6.2; vault 04-service-registry CL-03; spec section 17 CL-03; Standard Of Operations/sop Move-In and Move-Out Cleaning Checklist.md; Main Plans/Cleaning Business.md"
---
Category: Cleaning. Catalog name (guide 6.2): Move-In/Move-Out Cleaning. Canonical name (spec Appendix B): Move-In & Move-Out Cleaning. Slug: `move-in-out`. Brand and service area: [[FACT-BRAND-IDENTITY]], [[FACT-SERVICE-AREA]]; naming: [[FACT-SVC-NAMES]].

In the launch set: all 26 services are in scope and launch ([[OWN-DEC-04]], [[OWN-DEC-33]]); reported capability is not proof of insurance, qualifications or equipment. Worker checklist: [[SOP-CL-03]] (active, pending competent review for production use, [[OWN-DEC-108]]). Pricing: each job is priced individually on its own estimate ([[FACT-PRICING-PER-JOB]]); the vault price list [[FACT-PRICING-CL-03]] is superseded. Tools and materials: [[FACT-INVENTORY-CL-03]]. Draft agreement clauses: [[FACT-AGREEMENT-CL-03]] (attorney review; customers approve the estimate terms of [[OWN-DEC-127]]).

Vault files: SOP `Standard Of Operations/sop Move-In and Move-Out Cleaning Checklist.md`; Pricing `Pricing/pricing-move-in-out.md`; Inventory `Required inventory/inventory-move-in-move-out.md`; Agreement `Service Agreements/contract-move-in-out.md`; main plan `Main Plans/Cleaning Business.md` ("📦 3. Move-In & Move-Out Cleaning").

- aliases (registry 04, label **FACT**): "Move-In & Move-Out Cleaning" (main plan heading); "Move-In/Move-Out service" (main plan body); "Flawless Vacant Property Turnovers for Absolute Peace of Mind" (website headline); "Move-In / Move-Out Cleaning" (pricing and agreement titles); "vacant property turnover cleaning" (agreement body); `inventory-move-in-move-out.md` and "Move-In / Move-Out" (inventory file name and title); `move-in-move-out.md` (agreement scope reference; no such file exists); `sop Move-In and Move-Out Cleaning Checklist.md` and "Move-In / Move-Out Micro-Checklist" (SOP file name and title); master-prompt drift examples `move-in-out`, `move-in-move-out`, `move in/out`, `move-in and move-out` (source: main plan L38-39, L42; pricing L1; inventory L1; agreement L1, L4, §2 L11; SOP L1; master prompt section 3)

## Customer description

No owner-approved customer description exists in the sources. Service-page content is drafted from the service files: staging shows the drafts, production shows only versions the owner approves and publishes ([[OWN-DEC-84]], amended 2026-10-12). Pages state the service's limits ([[OWN-DEC-51]]) and never invent prices, completion times, credentials or guarantees ([[RULE-NO-INVENTED-FACTS]]).

- customer-facing description (registry 04, label **FACT** + **OPEN QUESTION** + **PROPOSED**): Draft copy (unapproved): vacant-property turnover for tenants and landlords - top-to-bottom cleaning of the empty space, interiors and exteriors of wardrobes, drawers and kitchen cabinets, doors, frames, knobs and baseboards, interior window panes, frames and tracks, "Deposit recovery preparation". Flags: "guarantee the return of your security deposit" and "absolute top-to-bottom sterilization" conflict with the agreement's deposit disclaimer and with the SOP and inventory (C-CL03-03); baseboard washing is not in the SOP (C-CL03-04). PROPOSED basis for a rewrite: cleaning of a vacant property's cabinets, fixtures and floors as scoped, with pre-existing damage documented separately and no deposit-return promise (source: main plan L39-49; agreement §2 L12; spec CL-03.QAC)

Purpose (SOP section 1):

- Clean a vacant property - ceilings and high areas, fixtures and return vents, closets, interior windows and doors, kitchen, bathrooms and floors - as written in section 12, for canonical service CL-03 Move-In & Move-Out Cleaning, within the approved estimate, with pre-existing damage documented separately from the cleaning result (source: spec Appendix B; spec CL-03.QAC "pre-existing damage separated from cleaning result"; 04 "customer-facing description", PROPOSED neutral basis).
- This SOP describes how the work is done and promises no outcome: no security-deposit result and no "sterilization". The agreement's "Deposit Sign-off" clause disclaims the deposit outcome (source: C-CL03-03; 31 section 3.5 rule 5).

### Draft plan copy (`Main Plans/Cleaning Business.md`; not approved, claims unverified)

*Target Headline for Website: Flawless Vacant Property Turnovers for Absolute Peace of Mind*

Moving is stressful enough without having to worry about scrubbing down an old house or sanitizing a new one. Whether you are a tenant trying to guarantee the return of your security deposit, or a landlord prepping a vacant property for a premium listing, our Move-In/Move-Out service delivers an absolute top-to-bottom sterilization. We clean every square inch of the vacant space so it looks, smells, and feels brand new.

- [ ] **Empty space detailing:** Deep cleaning the entire property from top to bottom while it is completely vacant.
- [ ] **Fixture and cabinet sanitization:** Washing the interiors and exteriors of all built-in wardrobes, drawers, and kitchen cabinets.
- [ ] **Baseboard and door washing:** Scrubbing down doors, frames, knobs, and baseboards to remove scuffs and fingerprints.
- [ ] **Window tracks and glass:** Cleaning interior window panes, frames, and tracks to maximize natural light.
- [ ] **Deposit recovery preparation:** Restoring the property to pristine condition to help tenants secure their security deposits.

Claims the main plan flags for this service (each `unverified`, not publishable until approved):

- "Flawless Vacant Property Turnovers for Absolute Peace of Mind": Headline - Reword (Absolute claims) (reviewer: Attorney)
- "guarantee the return of your security deposit"; "help tenants secure their security deposits": GUAR - Remove (reviewer: Attorney)
- "delivers an absolute top-to-bottom sterilization": HEALTH - Remove (reviewer: Attorney + safety reviewer)

## Request questions

- Guide 6.2 extra inputs / review needs: Vacancy, utilities, move date, cabinets/appliances, access.
- Spec intake (CL-03.INT): vacant/occupied status, rooms, cabinets/appliances, lease/landlord checklist if supplied, utilities/water availability.
- Answers follow [[OWN-DEC-91]] and [[HH-SVC-03]]: units shown beside each measurement, approximate values allowed, and "I don't know" stays unknown, never zero, safe or approved. The sources set no per-service unit list.
- Estimate route: online when the details and photos are enough, a site visit when inspection or measurements are needed ([[OWN-DEC-99]], [[HH-SVC-04]]); a customer preference for a remote estimate never overrides a required site or qualification review.
- Service conditions: [[FACT-SVC-LEFT-ITEMS]] (items left behind); [[FACT-SVC-LARGE-CLEANING-JOBS]] (jobs needing 3-5 people).

## Included work (SOP section 2, "In scope")

- The five original phases in section 12: high clearance (ceilings and corners, fixtures, return vents); built-ins and glass (closets and shelving, interior windows, doors and frames); kitchen (cabinets and drawers, oven and range, refrigerator and freezer, countertops and sinks); bathroom (toilet, shower and tub, mirrors and vanities); floors (edge vacuuming, mopping) (source: section 12).
- Vacant properties only, as the original note in section 3 states (source: original note; agreement "Condition of Property" clause).
- Intake facts the estimate and the job rely on: vacant/occupied status, rooms, cabinets/appliances, lease/landlord checklist if supplied, utilities/water availability (source: spec CL-03.INT).

## Excluded work and limits

HandyHub never performs licensed or unsafe scope: [[FACT-SVC-EXCLUDED-SCOPE]]; suspected hazardous material: [[FACT-SVC-SUSPECTED-HAZMAT]]; access equipment: [[FACT-SVC-ACCESS-EQUIPMENT]].

### SOP section 2, "Out of scope"

- Not covered - pending review (C-CL03-04): baseboard washing, which the agreement ("Turnover Standard": "bare floors, baseboards, interior window tracks, and empty cabinets") and the main plan ("Baseboard and door washing") promise; "Edge Vacuuming" only vacuums "baseboard gaps". The 02 register proposes a draft "Baseboards: wipe/wash" step for the owner's scope decision; it is not added here (source: 31 section 10 CL-03; 36 row 100).
- Not covered - pending review (C-CL03-05): exterior window glass, which the pricing file sells as an add-on. No step, equipment or height control exists; it is not performed until SOP, equipment and safety review (source: 02 register C-CL03-05).
- Not covered - pending review (31 section 10 CL-03): floor stripping and drain clearing. The inventory stocks a "Concentrated Floor Stripper / Tile Cleaner" and a "Commercial Drain Opening Gel", but no step strips floors or unclogs drains; "Shower & Tub" cleans drains only (source: inventory file; 04 CL-03 "exclusions").
- Not covered - pending review (OPEN QUESTION, Q-04-05): occupied move-outs. The spec intake asks for "vacant/occupied status", but every CL-03 file assumes a vacant property (source: spec CL-03.INT; 04 section 5.1 rule (e)).
- Not covered: removing, hauling or discarding furniture, trash, boxes or personal items left in the property. Any removal needs a change order the customer approves before the extra work and recorded authority to discard (source: agreement "Trash Surcharge" clause; spec FIN-008; 28 section 3.5; Q-30-17).
- Candidates for owner decision, not covered by any step (PROPOSED): exterior and garage, wall washing, carpet shampooing, appliance moving, biohazard and pest cleanup, junk removal (source: 04 CL-03 "exclusions").

### SOP section 2, "Do not perform"

*Entries 1-8 are the universal PROPOSED wording of 31 SOP standard section 3.3; entries 9-13 are CL-03 entries from 31 section 10, 36 row 100, the spec card and the register. Each entry gives the action, the reason class and what to do instead. HUMAN REVIEW: qualified safety professional and licensing reviewer.*

1. Electrical, plumbing, gas or HVAC work outside the approved scope or requiring a licensed trade. Licensed trade: stop and escalate (source: spec START-011 "unapproved electrical/plumbing/gas/structural scope"; master section 1.3).
2. Structural work, meaning cutting, removing, sistering or adding load-bearing members, ledgers, footings or framing, unless it is in the approved scope with the required qualified review. Structural: stop and escalate (source: START-011; master section 1.3).
3. Disturbing suspect asbestos, lead paint or mold. Hazardous material: stop and escalate (source: START-011 "suspect hazardous materials"; owner facts L20 "Unknown is not safe").
4. Work that is not in the approved scope or an approved change order. Out of scope: record the customer's request instead (source: JOB-005, JOB-010, FIN-008, AT-033).
5. Working at height or using access equipment beyond the approved height and access policy. Policy: stop and escalate (source: HI-06.SAF "beyond approved height/access policy"; DW-04.TLS "scaffolds/stilts only under approved policy").
6. Mixing or sequencing chemicals in any way the approved step and the product SDS do not allow. Hazardous material: stop and escalate (source: CL-01.SAF "never mix incompatible chemicals"; X-09).
7. Recording, photographing or sending customer passwords, master codes or site access codes outside the app's secured fields. Policy: keep them only in the app's secured fields (source: COM-002; owner facts L17; 27 AUTH-009).
8. Promising results, warranties, safety, health or code compliance to the customer. Policy: refer such questions to the owner (source: master sections 1.4, 17 and 29; CL-07.SAF "do not make unsupported indoor-air-quality claims").
9. Discarding, removing or giving away property left in the unit by a tenant or anyone else without recorded authority and an approved change order. Policy and open legal question: record the items with photos and escalate (source: 31 section 10 CL-03 "no discarding of tenant property without recorded authority (OPEN QUESTION)"; Q-30-17; HUMAN REVIEW: attorney licensed in KY/IN).
10. Clearing blocked drains, mechanically or with the drain-opening gel listed in the inventory. Out of scope, with an open plumbing-boundary question: record the condition and refer (source: 31 section 10 CL-03 "Not covered"; 04 CL-03 "permit/license flags" - drain-opening chemicals versus plumber referral; HUMAN REVIEW: licensed plumber).
11. Suspected asbestos / lead paint / mold: stop and escalate (source: spec START-011). This service dusts ceilings that may carry textures of unknown composition, scrubs sills, tracks and doors that may carry older paint, and works in vacant homes where moisture can go unnoticed (source: 31 section 7.2 rank 1; 04 CL-03 "hazards"; 31 section 5.8 mold module).
12. Cleaning exterior window glass, which the pricing file sells as an add-on. Out of scope and height policy: record the request and refer it to the owner (source: C-CL03-05).
13. Leaving the property unsecured at exit. Policy, critical hold: secure the property and record the lock-up; if it cannot be secured, escalate before leaving (source: spec CL-03.SAF "secure property at exit"; 31 section 8.4 rule 3).

- exclusions (registry 04, label **GAP** + **PROPOSED**): None stated (GAP). Implied: exterior windows only as an add-on; the security-deposit outcome is disclaimed. Candidates for owner decision (PROPOSED): occupied homes, exterior and garage, wall washing, carpet shampooing, appliance moving, biohazard and pests, junk removal, floor stripping/refinishing, drain clearing. PROPOSED boundary: CL-03 = vacant property; an occupied move-out needs an owner decision on code and scope (source: pricing L29; agreement §2 L12; inventory L6-7)

## Hazards and human-review flags

- Spec hazards (CL-03.HAZ): slips, unknown debris/sharps, chemicals, ladder, unsecured property.
- Spec stop-work guidance (CL-03.SAF): initial walkthrough for damage/hazards; photograph pre-existing issues if required; control sharps/chemicals; secure property at exit.
- permit/license flags (registry 04, label **OPEN QUESTION**): None in files. OPEN QUESTION: hauling and disposal of left-behind items (local rules, vehicle capacity); authority to discard property a tenant left (landlord-tenant rules, written authorization); drain-opening chemicals vs plumber referral; deposit-return and "sterilization" advertising claims; enforceability of the customer vacancy warranty, percentage surcharge, "Utility Fine" and waiting fee; lead-safe cleaning practice in pre-1978 units; business licensing, insurance and sales tax as for CL-01. HUMAN REVIEW: Legal & Compliance Administrator, KY/IN attorney, licensed plumber, EPA RRP-qualified reviewer, CPA (source: agreement §1 L7-8, §3 L16-17; inventory L7, L15; main plan L42, L49; owner facts)
- Reviewers named in the vault files' front matter: qualified safety reviewer; owner; Spanish translation reviewer; accredited asbestos inspector (ceiling textures of unknown composition); EPA RRP-certified renovator (older painted surfaces); attorney licensed in KY/IN (left-behind property; stop-work and incident wording); CPA (tax treatment); attorney licensed in KY/IN (surcharge, fee, penalty and fine wording); safety reviewer (PPE/hazmat); licensed plumber (drain-opening product and drain scope); attorney licensed in KY/IN (discarding items left by past tenants); attorney licensed in KY/IN; insurance broker. Boundaries: [[RULE-HUMAN-REVIEW]].

### Required worker qualifications (SOP section 4)

- TBD — requires review by safety-liability-manager and a qualified person; owner to approve. No company qualification tags or training records exist yet (source: 31 section 3.1 row 4, GAP).
- Chemical handling and hazard communication for the approved products, per the reviewer's program (source: 29 section 8.2 item 11; spec START-004).
- Ladder or other access-equipment use only under the approved height and access policy, once it exists (source: X-12; Q-31-09).
- Crew: the pricing file's "Ideal Crew Size" names two cleaners, which commits both initial employees to one job; scheduling does not treat them as two crews (source: pricing file; owner facts 2026-10-02; job-planner playbook "Do not treat the two-person team as two independent crews when the job needs both"). Whether one worker may enter a vacant property alone is TBD - requires owner and qualified safety reviewer review (source: 04 CL-03 "hazards", personal security in a vacant property).
- With two employees, a worker never clears their own hold (source: 31 section 8.3 rule 3).

### Hazards (SOP section 9)

*Draft entries from the spec card and the CL-03 files. Severity, PPE and final controls for every entry are TBD by the qualified safety professional (HUMAN REVIEW). Controls are listed in hierarchy order - eliminate, substitute, engineer, administrative, PPE - as drafts only (source: safety-liability-manager skill). Draft service risk class (PROPOSED): elevated; high-risk / specialist review for exterior windows at height, disposal of left-behind property and drain-opening chemicals; stop-work on biohazard, pests or unsafe utilities (source: 04 section 6.2 row CL-03).*

| # | Hazard | Source | Draft controls (pending review) | Stop-work trigger | IDs |
|---|---|---|---|---|---|
| 1 | Unknown debris and sharps left by previous occupants | spec CL-03.HAZ "unknown debris/sharps"; CL-03.SAF "control sharps/chemicals"; inventory bags "For throwing away forgotten bulky items left by past tenants" | Initial walkthrough before cleaning (section 12 hold); sharps not handled until the reviewer's sharps rule and container exist; cut protection per the PPE review | Sharps or biohazard found | C-CL03-07, C-CL03-02 |
| 2 | Chemical exposure: concentrates, floor stripper, drain-opening gel, adhesive remover, oven and soap-scum products, "an industrial cleaner" | spec CL-03.HAZ "chemicals"; inventory section A; SOP "Deep Mopping" | Approved products with a reviewed SDS only; label dilution only; no mixing (Do not perform 6); ventilation per the SDS; PPE per the review | Product without a reviewed SDS; a mix the SDS does not allow; ventilation not possible | C-CL03-02 |
| 3 | Slips: wet floors mopped twice, freezer defrost water, stripper residue | spec CL-03.HAZ "slips"; SOP "Deep Mopping", "Refrigerator & Freezer"; inventory floor stripper | Wet-floor sign (proposed in the inventory); contain defrost water (method TBD); mop backward toward the exit, as "Deep Mopping" already directs | Unsafe condition (section 10) | C-CL03-06 |
| 4 | Height: skylight frames, high corners, ceiling fans, hanging fixtures, track lighting | spec CL-03.HAZ "ladder"; CL-03.TLS "ladder/extension as needed"; SOP "Ceilings & Corners", "Fixtures" | Prefer extension tools from floor level; a ladder or other access equipment only under the approved height and access policy, which does not exist yet | Task needs access equipment and no approved policy or equipment exists | X-12 |
| 5 | Electrical contact while damp-wiping ceiling fans, hanging fixtures and track lighting | SOP "Fixtures"; 31 section 10 CL-03 ("power off first", RISK) | Power off before dusting and damp-wiping (section 12 hold); isolation and verification method TBD; no electrical work (Do not perform 1) | Power state cannot be confirmed off; damaged fixture, exposed wiring or sparking | X-07 |
| 6 | Ceiling textures and older painted surfaces of unknown composition (possible asbestos or lead) | 31 section 7.2 rank 1 (CL-03 ceiling clearing over textures of unknown composition, RISK); 04 CL-03 "hazards" (painted sills, doors and ceilings in older homes) | Do not brush, wipe, scrape or vacuum textured, damaged or deteriorating ceilings; do not scrape or sand deteriorating paint (section 12 holds); old-property screening questions (04 section 6.2) | Suspect material present and its composition unknown | - |
| 7 | Pests and biological contamination: cocoons, dead insects, droppings, infestation | SOP "Ceilings & Corners", "Windows"; 04 CL-03 "hazards"; 31 section 10 CL-03 (RISK) | Stop and escalate on droppings or infestation (section 12 hold) | Droppings, nests, live infestation or biohazard | - |
| 8 | Mold and moisture in a vacant property | 31 section 5.8 (the mold module lists CL-03); stop-work block (section 10) | Do not disturb suspected mold; company mold definition pending (Q-31-10) | Suspected mold growth, moisture or an active leak | - |
| 9 | Unsecured vacant property and personal security | spec CL-03.HAZ "unsecured property"; CL-03.SAF "secure property at exit"; 04 CL-03 "hazards" | Secure the property at exit and record the lock-up (section 12 hold); lone-entry rule TBD (section 4) | Property cannot be secured; unexpected people on site; an aggressive person or animal | C-CL03-07 |
| 10 | Utilities off: darkness, no hot water, unsafe heat or cold | pricing "Utilities Off Fine" line; agreement "Utility Fine" clause; 04 CL-03 "hazards" | Utilities confirmed before the visit (section 3); headlamps and work lights (inventory); work with utilities off is an owner decision | Unsafe utilities; unsafe heat or cold (section 10) | - |
| 11 | Freezer turned off with no restore step; appliance end state | SOP "Refrigerator & Freezer"; spec APXA-005 "restore utilities/components altered within scope" | End state per the customer's recorded instruction (section 12 hold) | No end-state instruction recorded | X-07 |
| 12 | Garbage disposal near the hands | SOP "Countertops & Sinks"; 04 CL-03 "hazards" (garbage-disposal splash guard) | Disposal switched off before the splash guard is scrubbed; hands never inside the disposal; isolation method TBD (RISK; the same rule 31 section 10 proposes for CL-01) | Disposal cannot be confirmed off | - |
| 13 | Gas appliances (oven and range) | SOP "Oven & Range"; spec START-011 | No gas work (Do not perform 1) | Gas odor: emergency (section 19, step 2) | - |
| 14 | Heavy left-behind items (manual handling) | agreement "Trash Surcharge" clause ("furniture remnants"); 04 CL-03 "hazards" | Not removed or hauled under this SOP, and heavy items are not moved (section 2); handling method TBD if the owner adds removal | Heavy items block the work area | - |
| 15 | Extension-cord trips and cord condition | inventory "Extension Cord"; 04 CL-03 "hazards" | Cord inspection and routing TBD (section 7) | Damaged cord or outlet | - |
| 16 | Others on site: movers, contractors, occupants, children, pets | agreement "Access Delays" clause ("movers or contractors present on-site"); X-11; spec CX-005 | Keep others out of wet and chemical work areas; shared occupants module pending (31 section 5.8) | Aggressive occupant or animal (section 10) | X-11 |

## Warranty or callback

- warranty or callback policy (registry 04, label **GAP** + **OPEN QUESTION**): None (GAP). The agreement disclaims the security-deposit outcome ("does not guarantee the return of a security deposit"). OPEN QUESTION: any re-clean window after a landlord inspection (owner + attorney; none invented); returns linked and classified per CX-007 and QA-010 (source: agreement §2 L12; spec CX-007, QA-010)
