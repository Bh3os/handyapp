---
id: SVC-CL-01
type: service
title: "Routine House Cleaning"
status: active
area: business
links:
  decided_by: ["[[OWN-DEC-04]]", "[[OWN-DEC-33]]", "[[OWN-DEC-84]]", "[[OWN-DEC-51]]", "[[OWN-DEC-102]]", "[[OWN-DEC-108]]"]
  uses: ["[[SOP-CL-01]]", "[[FACT-INVENTORY-CL-01]]", "[[FACT-PRICING-PER-JOB]]", "[[FACT-SVC-EXCLUDED-SCOPE]]", "[[FACT-SVC-RECURRING-SERVICE]]", "[[FACT-SVC-LEFT-ITEMS]]", "[[FACT-SVC-LARGE-CLEANING-JOBS]]"]
  constrained_by: ["[[RULE-HUMAN-REVIEW]]", "[[RULE-SAFETY-GATES]]", "[[RULE-NO-INVENTED-FACTS]]", "[[FACT-SVC-EXCLUDED-SCOPE]]", "[[FACT-SVC-SUSPECTED-HAZMAT]]", "[[FACT-SVC-ACCESS-EQUIPMENT]]"]
  part_of: ["[[C01]]", "[[C02]]"]
  related: ["[[FACT-PRICING-CL-01]]", "[[FACT-AGREEMENT-CL-01]]", "[[FACT-SERVICE-AREA]]", "[[FACT-BRAND-IDENTITY]]", "[[FACT-SVC-NAMES]]", "[[HH-SVC-01]]", "[[HH-SVC-02]]", "[[HH-SVC-03]]", "[[HH-SVC-04]]", "[[OWN-DEC-91]]", "[[OWN-DEC-99]]", "[[OWN-DEC-127]]"]
source: "guide 6.2; vault 04-service-registry CL-01; spec section 17 CL-01; Standard Of Operations/sop Routine Cleaning Checklist.md; Main Plans/Cleaning Business.md"
---
Category: Cleaning. Catalog name (guide 6.2): Routine House Cleaning. Canonical name (spec Appendix B): Routine House Cleaning. Slug: `routine-cleaning`. Brand and service area: [[FACT-BRAND-IDENTITY]], [[FACT-SERVICE-AREA]]; naming: [[FACT-SVC-NAMES]].

In the launch set: all 26 services are in scope and launch ([[OWN-DEC-04]], [[OWN-DEC-33]]); reported capability is not proof of insurance, qualifications or equipment. Worker checklist: [[SOP-CL-01]] (active, pending competent review for production use, [[OWN-DEC-108]]). Pricing: each job is priced individually on its own estimate ([[FACT-PRICING-PER-JOB]]); the vault price list [[FACT-PRICING-CL-01]] is superseded. Tools and materials: [[FACT-INVENTORY-CL-01]]. Draft agreement clauses: [[FACT-AGREEMENT-CL-01]] (attorney review; customers approve the estimate terms of [[OWN-DEC-127]]).

Vault files: SOP `Standard Of Operations/sop Routine Cleaning Checklist.md`; Pricing `Pricing/pricing-routine-cleaning.md`; Inventory `Required inventory/inventory-routine-cleaning.md`; Agreement `Service Agreements/contract-routine-cleaning.md`; main plan `Main Plans/Cleaning Business.md` ("🧹 1. Routine House Cleaning").

- aliases (registry 04, label **FACT**): "Routine House Cleaning" (main plan heading); "Consistent, Reliable Upkeep for a Beautiful, Stress-Free Home" (website headline); "Routine Cleaning" (pricing, inventory and agreement titles); "regular, recurring residential cleaning services" (agreement body); `routine-cleaning.md` "micro-checklist" (agreement scope reference; no such file exists); `sop Routine Cleaning Checklist.md` and "Routine Cleaning Micro-Checklist" (SOP file name and title) (source: main plan L8-9; pricing L1; inventory L1; agreement L1, L4, §1 L7; SOP L1)

## Customer description

No owner-approved customer description exists in the sources. Service-page content is drafted from the service files: staging shows the drafts, production shows only versions the owner approves and publishes ([[OWN-DEC-84]], amended 2026-10-12). Pages state the service's limits ([[OWN-DEC-51]]) and never invent prices, completion times, credentials or guarantees ([[RULE-NO-INVENTED-FACTS]]).

- customer-facing description (registry 04, label **FACT** + **OPEN QUESTION** + **PROPOSED**): Draft website copy (unapproved): recurring upkeep for busy households - dusting and wiping accessible surfaces, vacuuming and mopping, cleaning and disinfecting toilets, sinks, showers, tubs and mirrors, wiping appliance exteriors, counters and sink, emptying trash and relining bins. Flags: "every single week" vs weekly/bi-weekly/monthly options; "disinfecting" depends on an approved product and its label directions (C-CL01-V01); the minimum and exclusions are not shown (CX-001, CX-004). PROPOSED basis for a rewrite: recurring cleaning of agreed rooms and surfaces in an occupied home, with exclusions shown before booking (source: main plan L9-19; agreement §2 L11; spec CL-01.QAC)

Purpose (SOP section 1):

- Clean the agreed rooms and surfaces of an occupied home on a scheduled recurring visit - high dusting, bedroom and living-area surfaces, kitchen surfaces, bathrooms, trash and floors - for canonical service CL-01 Routine House Cleaning, within the approved estimate and each product's label directions (source: spec Appendix B; 04 CL-01 "customer-facing description", PROPOSED basis "recurring cleaning of agreed rooms and surfaces in an occupied home, with exclusions shown before booking"; spec CL-01.INT).
- This SOP describes how the work is done and promises no outcome. The original file has no intro statement (source: 31 section 3.5 rule 5).

### Draft plan copy (`Main Plans/Cleaning Business.md`; not approved, claims unverified)

*Target Headline for Website: Consistent, Reliable Upkeep for a Beautiful, Stress-Free Home*

Maintaining a tidy home shouldn't take over your weekends. Our Routine House Cleaning service is designed for busy families and professionals who want to come home to a fresh, organized space every single week. We handle the essential, day-to-day upkeep—dusting, vacuuming, sanitizing, and tidying—with consistent precision so you can reclaim your free time without sacrificing a clean living environment.

- [ ] **Dusting and wiping:** Removing dust from accessible surfaces including tables, shelves, countertops, and home appliances.
- [ ] **Floor care:** Vacuuming carpets and rugs alongside sweeping and mopping hard floor surfaces throughout the house.
- [ ] **Bathroom sanitization:** Cleaning and disinfecting essential fixtures such as toilets, sinks, showers, tubs, and mirrors.
- [ ] **Kitchen tidying:** Wiping down exterior surfaces of large appliances, cleaning countertops, and washing the sink area.
- [ ] **Waste management:** Emptying trash bins across all rooms and replacing them with fresh liners.

Claims the main plan flags for this service (each `unverified`, not publishable until approved):

- "Consistent, Reliable Upkeep for a Beautiful, Stress-Free Home": Headline - Candidate (Puffery) (reviewer: Marketing)

## Request questions

- Guide 6.2 extra inputs / review needs: Size/rooms, frequency, priorities, pets, condition.
- Spec intake (CL-01.INT): rooms, occupancy/pets, surfaces/materials, priority areas, excluded rooms/items, product preferences/allergies if volunteered.
- Answers follow [[OWN-DEC-91]] and [[HH-SVC-03]]: units shown beside each measurement, approximate values allowed, and "I don't know" stays unknown, never zero, safe or approved. The sources set no per-service unit list.
- Estimate route: online when the details and photos are enough, a site visit when inspection or measurements are needed ([[OWN-DEC-99]], [[HH-SVC-04]]); a customer preference for a remote estimate never overrides a required site or qualification review.
- Service conditions: [[FACT-SVC-RECURRING-SERVICE]] (recurring schedules); [[FACT-SVC-LEFT-ITEMS]] (items left behind); [[FACT-SVC-LARGE-CLEANING-JOBS]] (jobs needing 3-5 people).

## Included work (SOP section 2, "In scope")

- The twenty-three original steps in section 12, in five phases: high-level dusting; bedrooms and living areas; kitchen surface care; bathrooms; waste management and floor care (source: section 12).
- Visits at the frequency set in the agreement's "Frequency" clause; the recurring-plan terms are open (source: agreement "Frequency" clause; Q-28-18).
- Three steps are not in the main plan's customer-facing list ("What We Do"): the microwave interior ("Microwave"), bed making ("Beds") and upholstery vacuuming ("Upholstery"). Customer-visible scope must match the approved steps (source: main plan section 1; spec CX-004).
- The agreement's "Inclusions" clause incorporates the `routine-cleaning.md` "micro-checklist", a file that does not exist. This file, titled "Routine Cleaning Micro-Checklist", is the evident target, but it is an unapproved, unversioned draft; which scope schedule or SOP version the agreement may incorporate is an attorney decision (source: C-CL01-04; X-03; 30 section 6). The planned rename to `sop-routine-cleaning.md` waits for 34 step 2.5.

## Excluded work and limits

HandyHub never performs licensed or unsafe scope: [[FACT-SVC-EXCLUDED-SCOPE]]; suspected hazardous material: [[FACT-SVC-SUSPECTED-HAZMAT]]; access equipment: [[FACT-SVC-ACCESS-EQUIPMENT]].

### SOP section 2, "Out of scope"

- Not covered - pending review (C-CL01-V01): disinfecting showers, tubs and mirrors, which the main plan promises ("Cleaning and disinfecting essential fixtures such as toilets, sinks, showers, tubs, and mirrors."). The Phase 4 steps wipe, scrub or polish and name no disinfectant (FLAG in section 12).
- Not covered - pending review (C-CL01-05): organizing "excessive toys/clothes" before dusting, which the pricing file prices on site as the "High Clutter Fee"; extra work happens only through an approved change order (source: spec FIN-008, JOB-005).
- Not covered (agreement "Exclusions" clause): lifting heavy objects, cleaning biohazards ("feces, mold") and deep grease scraping (Do not perform 9, 11 and 12).
- Not covered - pending review (04 CL-01 "exclusions", PROPOSED boundary): restorative work such as heavy grease, appliance interiors other than the microwave and grout restoration, which belongs to CL-02; whether neglected or first-time homes start with CL-02 is an owner decision (Q-04-06).

### SOP section 2, "Do not perform"

*Entries 1-8 are the universal PROPOSED wording of 31 SOP standard section 3.3; entries 9-12 come from the CL-01 seeds of 31 section 10 and the agreement's "Exclusions" clause. Each entry gives the action, the reason class and what to do instead. HUMAN REVIEW: qualified safety professional and licensing reviewer.*

1. Electrical, plumbing, gas or HVAC work outside the approved scope or requiring a licensed trade. Licensed trade: stop and escalate (source: spec START-011 "unapproved electrical/plumbing/gas/structural scope"; master section 1.3).
2. Structural work, meaning cutting, removing, sistering or adding load-bearing members, ledgers, footings or framing, unless it is in the approved scope with the required qualified review. Structural: stop and escalate (source: START-011; master section 1.3).
3. Disturbing suspect asbestos, lead paint or mold. Hazardous material: stop and escalate (source: START-011 "suspect hazardous materials"; owner facts L20 "Unknown is not safe").
4. Work that is not in the approved scope or an approved change order. Out of scope: record the customer's request instead (source: JOB-005, JOB-010, FIN-008, AT-033).
5. Working at height or using access equipment beyond the approved height and access policy. Policy: stop and escalate (source: HI-06.SAF "beyond approved height/access policy"; DW-04.TLS "scaffolds/stilts only under approved policy").
6. Mixing or sequencing chemicals in any way the approved step and the product SDS do not allow. Hazardous material: stop and escalate (source: CL-01.SAF "never mix incompatible chemicals"; X-09).
7. Recording, photographing or sending customer passwords, master codes or site access codes outside the app's secured fields. Policy: keep them only in the app's secured fields (source: COM-002; owner facts L17; 27 AUTH-009).
8. Promising results, warranties, safety, health or code compliance to the customer. Policy: refer such questions to the owner (source: master sections 1.4, 17 and 29; CL-07.SAF "do not make unsupported indoor-air-quality claims").
9. Cleaning biohazards, such as feces, or suspected mold growth. Hazardous material and policy: stop and escalate. Where routine bathroom cleaning ends and these exclusions begin is undefined until the company mold and biohazard rule exists, so when in doubt, stop (source: agreement "Exclusions" clause; spec CL-01.SAF "stop and escalate on sharps/biohazard"; 31 section 10 CL-01; X-06; Q-31-10).
10. Using a ladder, a step stool or an improvised platform such as a chair or furniture, unless the approved height and access policy allows it. Policy (PROPOSED): dust only what the extension duster or the fan sleeve reaches from the floor; leave and report the rest (source: 31 section 10 CL-01 "ladders or step stools unless approved (PROPOSED)"; 02 G-005; Q-31-09).
11. Lifting or moving heavy objects that the agreement's "Exclusions" clause excludes. Policy: leave and report. The weight limit in that clause is unapproved; the manual-handling rule comes from the qualified safety professional (source: agreement "Exclusions" clause; spec BRF-008 "manual handling").
12. Deep grease scraping. Out of scope: record the request; it belongs to CL-02 or a change order (source: agreement "Exclusions" clause; 04 CL-01 "exclusions").

- exclusions (registry 04, label **FACT** + **PROPOSED**): Agreement only (not customer-visible in plan or pricing, CX-004): no lifting objects over 25 lbs; no cleaning of biohazards (feces, mold); no deep grease scraping. PROPOSED boundary: CL-01 = recurring maintenance of an occupied home; restorative work (appliance interiors, heavy grease, grout restoration) is CL-02 scope; one mold/biohazard threshold for all CL services (X-06) (source: agreement §1 L8; spec CX-004)

## Hazards and human-review flags

- Spec hazards (CL-01.HAZ): slips, chemical mixing, sharps/biohazard surprises, pets, fragile items.
- Spec stop-work guidance (CL-01.SAF): never mix incompatible chemicals; signage/control wet floors; stop and escalate on sharps/biohazard/unsafe animal/aggressive situation.
- permit/license flags (registry 04, label **OPEN QUESTION**): None in files; no electrical, plumbing, gas or structural task appears in the SOP (not a finding that no license applies). OPEN QUESTION: municipal business licensing per KY/IN municipality; a general liability policy before any "fully insured" wording; workers' compensation for the 2 employees; sales/use-tax applicability; enforceability of the non-solicitation clause, automatic lockout fee, late-cancellation fee and liability cap; card-on-file storage. HUMAN REVIEW: Legal & Compliance Administrator, KY/IN attorney, insurance broker, CPA, payment provider (source: owner facts; agreement §2 L12, §3 L16-17, §4 L20-21)
- Reviewers named in the vault files' front matter: qualified safety reviewer; owner; Spanish translation reviewer; privacy owner (access codes and photos); qualified mold assessor or industrial hygienist (mold and biohazard rule); CPA (tax treatment); attorney licensed in KY/IN (fee and surcharge wording); safety reviewer (PPE/hazmat); attorney licensed in KY/IN (product claims); attorney licensed in KY/IN; insurance broker; privacy owner (access codes); qualified IT security reviewer (card-on-file data); qualified safety professional (biohazard and mold exclusion). Boundaries: [[RULE-HUMAN-REVIEW]].

### Required worker qualifications (SOP section 4)

- TBD — requires review by safety-liability-manager and a qualified person; owner to approve. No company qualification tags or training records exist yet (source: 31 section 3.1 row 4, GAP).
- Chemical hazard communication: the worker acknowledges the reviewed SDS summaries for the products on the job, and the app records which summaries each worker acknowledged; the programme scope is the reviewer's decision (source: 29 section 8.2 item 11; spec START-004).
- Lone work: the pricing file's crew size allows one cleaner alone in an occupied home, and no lone-worker check-in or escalation rule exists. TBD - requires qualified safety reviewer review and an owner decision (source: pricing file "Ideal Crew Size"; 04 CL-01 "labor assumptions"; 02 G-065; Q-31-05).
- With two employees, a worker never clears their own hold (source: 31 section 8.3 rule 3).

### Hazards (SOP section 9)

*Draft entries from the spec card and the CL-01 files. Severity, PPE and final controls for every entry are TBD by the qualified safety professional (HUMAN REVIEW). Controls are drafts listed in hierarchy order - eliminate, substitute, engineer, administrative, PPE (source: safety-liability-manager skill).*

| # | Hazard | Source | Draft controls (pending review) | Stop-work trigger | IDs |
|---|---|---|---|---|---|
| 1 | Slips on wet floors | spec CL-01.HAZ "slips"; CL-01.SAF "signage/control wet floors"; step "Mopping" | Wet-floor signage or access control before mopping (section 12 hold); the step's own "working backward out of each room"; occupants and pets kept off until dry; footwear policy TBD | A wet floor cannot be signed or controlled | C-CL01-06 |
| 2 | Chemical mixing and exposure | spec CL-01.HAZ "chemical mixing"; CL-01.SAF "never mix incompatible chemicals"; five products without SDS (inventory file) | Approved products with reviewed SDS only; never mix or sequence products in a way the SDSs do not allow; label directions only; ventilation as the SDS requires; PPE from the SDS | Product without a reviewed SDS; a mix the SDS does not allow; ventilation not possible | C-CL01-06 |
| 3 | Sharps and biohazard surprises | spec CL-01.HAZ "sharps/biohazard surprises"; CL-01.SAF; steps "Trash Bins", "Upholstery", "Toilet" | Do not handle; stop and escalate (section 12 holds); container and PPE are review items | Sharps or a biohazard seen or suspected | C-CL01-06, X-06 |
| 4 | Pets and unsafe animals | spec CL-01.HAZ "pets"; CL-01.SAF "unsafe animal"; pricing file "Pet Hair Surcharge" | Pets kept away from the work area (preparation checklist, section 5); occupants, children and pets module pending (31 section 5.8) | Unsafe animal | X-11 |
| 5 | Fragile and high-value items | spec CL-01.HAZ "fragile items"; steps "Horizontal Surfaces" (lift minor objects) and "Decor" | Handling rule TBD by the reviewer; the "no damage" check (section 13); damage is reported as an incident (section 20) | Damage caused or found | C-CL01-06 |
| 6 | Aggressive occupant or situation; one cleaner alone in an occupied home | spec CL-01.SAF "aggressive situation"; pricing file "Ideal Crew Size" | Leave the area and escalate; lone-work check-in and escalation rule TBD (02 G-065) | Aggressive occupant or situation | - |
| 7 | Moving fan blades | step "Ceiling Fans"; 31 section 10 CL-01 (RISK) | Fan stopped and switched off before dusting (section 12 hold) | Fan cannot be switched off | - |
| 8 | Garbage disposal | step "Sink Area"; 31 section 10 CL-01 (RISK) | Hands never inside the disposal (section 12 hold) | Unsafe condition (section 10) | - |
| 9 | Light fixtures, bulbs and electronics | steps "Light Fixtures" ("wipe bulb tops if cool") and "Electronics"; 04 CL-01 "hazards" (ASSUMPTION) | The step's own "if cool" condition stays; any power-off or dry-method rule is TBD by the reviewer | Unsafe condition (section 10) | - |
| 10 | Overhead dusting without access equipment | steps "Cobwebs", "Ceiling Fans"; 04 CL-01 "required tools" (no ladder stocked or permitted) | Reach from the floor only; no ladder or step stool unless approved (Do not perform 10) | Area not reachable from the floor: leave and report | - |
| 11 | Mold and biohazard boundary | agreement "Exclusions" clause ("feces, mold"); X-06 | Stop and escalate when in doubt; company mold and biohazard rule pending (Q-31-10) | Suspected mold growth or a biohazard | X-06 |
| 12 | Fragrance and allergies | inventory fabric refresh spray; spec CL-01.INT "product preferences/allergies" | No fragranced product without consent; product only per its SDS | - | - |
| 13 | Manual handling | agreement "Exclusions" clause (heavy objects); step "Upholstery" (remove cushions) | Excluded heavy lifting not performed; manual-handling rule TBD (spec BRF-008) | - | - |
| 14 | Privacy and access secrets in an occupied home | spec section 17 cleaning note "privacy and exception handling are mandatory"; agreement "Access" clause | Codes only in the app's secured fields; photos avoid people, documents and valuables; key custody log (27 AUTH-009) | - | - |
| 15 | Gas odor near the stovetop | step "Stovetop"; spec START-011 | Emergency (section 19, step 2); no work on gas components (Do not perform 1) | Gas odor | - |

## Warranty or callback

- warranty or callback policy (registry 04, label **GAP** + **OPEN QUESTION**): None in CL-01 files (GAP); no re-clean window may be invented, and the CL-02 re-clean clause does not carry over. Return visits are linked to the original job and classified (CX-007, QA-010). OPEN QUESTION: does the owner want any routine re-clean window (owner decision, attorney review) (source: spec CX-007, QA-010)
- Governed now by: the 90-day workmanship warranty of [[FACT-WARRANTY]] ([[OWN-DEC-135]]), counted from the reviewed completion date; a claim opens a case with return-visit punch items ([[HH-QA-07]]). No warranty exclusions are defined; any come only from attorney review ([[OQ-ATTORNEY-TERMS]]).
