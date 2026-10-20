---
id: SVC-HI-02
type: service
title: "Barbecue & Grill Cleaning/Maintenance"
status: active
area: business
links:
  decided_by: ["[[OWN-DEC-04]]", "[[OWN-DEC-33]]", "[[OWN-DEC-84]]", "[[OWN-DEC-51]]", "[[OWN-DEC-102]]", "[[OWN-DEC-108]]"]
  uses: ["[[SOP-HI-02]]", "[[FACT-INVENTORY-HI-02]]", "[[FACT-PRICING-PER-JOB]]", "[[FACT-SVC-EXCLUDED-SCOPE]]"]
  constrained_by: ["[[RULE-HUMAN-REVIEW]]", "[[RULE-SAFETY-GATES]]", "[[RULE-NO-INVENTED-FACTS]]", "[[FACT-SVC-EXCLUDED-SCOPE]]", "[[FACT-SVC-SUSPECTED-HAZMAT]]", "[[FACT-SVC-ACCESS-EQUIPMENT]]", "[[FACT-SVC-REFER-OUT-TASKS]]"]
  part_of: ["[[C01]]", "[[C02]]"]
  related: ["[[FACT-PRICING-HI-02]]", "[[FACT-AGREEMENT-HI-02]]", "[[FACT-SERVICE-AREA]]", "[[FACT-BRAND-IDENTITY]]", "[[FACT-SVC-NAMES]]", "[[HH-SVC-01]]", "[[HH-SVC-02]]", "[[HH-SVC-03]]", "[[HH-SVC-04]]", "[[OWN-DEC-91]]", "[[OWN-DEC-99]]", "[[OWN-DEC-127]]"]
source: "guide 6.2; vault 04-service-registry HI-02; spec section 17 HI-02; Standard Of Operations/sop-grill-cleaning.md; Main Plans/Home Improvement Business.md"
---
Category: Home Improvement. Catalog name (guide 6.2): Barbecue & Grill Cleaning/Maintenance. Canonical name (spec Appendix B): Deep-Clean Barbecue & Grill Maintenance. Slug: `grill-cleaning`. Brand and service area: [[FACT-BRAND-IDENTITY]], [[FACT-SERVICE-AREA]]; naming: [[FACT-SVC-NAMES]].

In the launch set: all 26 services are in scope and launch ([[OWN-DEC-04]], [[OWN-DEC-33]]); reported capability is not proof of insurance, qualifications or equipment. Worker checklist: [[SOP-HI-02]] (active, pending competent review for production use, [[OWN-DEC-108]]). Pricing: each job is priced individually on its own estimate ([[FACT-PRICING-PER-JOB]]); the vault price list [[FACT-PRICING-HI-02]] is superseded. Tools and materials: [[FACT-INVENTORY-HI-02]]. Draft agreement clauses: [[FACT-AGREEMENT-HI-02]] (attorney review; customers approve the estimate terms of [[OWN-DEC-127]]).

Vault files: SOP `Standard Of Operations/sop-grill-cleaning.md`; Pricing `Pricing/pricing-grill-cleaning.md`; Inventory `Required inventory/inventory-grill-cleaning.md`; Agreement `Service Agreements/contract-grill-cleaning.md`; main plan `Main Plans/Home Improvement Business.md` ("🥩 2. Deep-Clean Barbecue & Grill Maintenance").

- aliases (registry 04, label **FACT**): "2. Deep-Clean Barbecue & Grill Maintenance" (plan heading); "Barbecue & Grill Deep-Cleaning" (pricing, inventory, agreement and SOP titles); "premium barbecue detailing service" (plan overview); "professional barbecue detailing and carbon-stripping services" and "detailing event" (agreement); website headline "Restore Your Outdoor Grill to Factory Shine—Eco-Safe, Carbon-Stripping Service" (tagline); file stems pricing-/inventory-/contract-/sop-grill-cleaning (source: plan §2 L21-25; pricing L1; inventory L1; agreement L1, L4, L12; SOP L1)

## Customer description

No owner-approved customer description exists in the sources. Service-page content is drafted from the service files: staging shows the drafts, production shows only versions the owner approves and publishes ([[OWN-DEC-84]], amended 2026-10-12). Pages state the service's limits ([[OWN-DEC-51]]) and never invent prices, completion times, credentials or guarantees ([[RULE-NO-INVENTED-FACTS]]).

- customer-facing description (registry 04, label **FACT** + **PROPOSED**): Draft website copy only, not approved. Unreviewed claims: "Eco-Safe"; "non-toxic, eco-safe methods"; "sanitizes your grill" (C-HI02-V02); buildup "cuts your expensive grill’s lifespan in half"; "ensuring a safe, consistent gas flow"; insect-nest clearing (C-HI02-V03); steam brushes (C-HI02-09). PROPOSED neutral summary (owner + handyhub-marketing review): cleaning of a customer's grill (removable components, cookbox, burner ports where in scope, exterior polish) within the manufacturer's limits, with no gas-component repair (source: plan §2 L22-31)

Purpose (SOP section 1):

- Clean a customer's gas grill - removable components, cookbox, burner ports where in scope, and exterior polish - for canonical service HI-02 Deep-Clean Barbecue & Grill Maintenance, within the grill manufacturer's limits and the approved estimate, with no gas-component repair (source: spec Appendix B; 04 HI-02 "customer-facing description", PROPOSED neutral summary; spec HI-02.SAF).
- This SOP describes how the work is done and promises no outcome (source: 31 section 3.5 rule 5). "Maintenance" in the canonical name adds no repair work to this SOP: gas-component repair is not performed (Do not perform 10), and other repairs are not covered pending the owner's exclusions decision (source: C-HI02-10; 04 HI-02 "customer-facing description" and "exclusions"; section 2, Out of scope).

### Draft plan copy (`Main Plans/Home Improvement Business.md`; not approved, claims unverified)

*Target Headline for Website: Restore Your Outdoor Grill to Factory Shine—Eco-Safe, Carbon-Stripping Service*

Over months of grilling, stubborn grease layers, burnt food particles, and toxic carbon crust build up inside your barbecue pit. This buildup doesn't just create sudden flare-ups and uneven heating zones; it actively alters the flavor of your food and cuts your expensive grill’s lifespan in half. Our premium barbecue detailing service completely tears down, degreases, and sanitizes your grill using non-toxic, eco-safe methods, returning your outdoor cooking setup to showroom condition.

- [ ] **Dismantling & Component Soak:** We carefully remove grill grates, flavorizer bars, heat deflectors, and internal drip pans to submerge them in a heavy, carbon-liquefying hot bath.
- [ ] **Mechanical Scraping & Detailing:** We scrub the inner cookbox down to raw metal, utilizing specialized degreasing scrapers and steam brushes to dissolve baked-on grease webs.
- [ ] **Venturi Tube & Burner Clearance:** We clean out internal burner tube ports and clear obstructions from insect nests or ash blocks, ensuring a safe, consistent gas flow and uniform flame pattern.
- [ ] **Stainless Steel Exterior Polish:** We dry-wipe and buff all external hoods, side shelves, and control knobs using premium, streak-free stainless steel protective oils.

Claims the main plan flags for this service (each `unverified`, not publishable until approved):

- "Restore Your Outdoor Grill to Factory Shine—Eco-Safe, Carbon-Stripping Service": Headline - Remove "Factory Shine" and "Eco-Safe"; Hold chemical claims (Outcome promise; environmental claim) (reviewer: Attorney + SDS review)
- "using non-toxic, eco-safe methods": ENV, GUAR - Remove (reviewer: Attorney + SDS review)
- "lifespan in half" (statistic): HEALTH - Remove (reviewer: Marketing)
- "ensuring a safe, consistent gas flow and uniform flame pattern": SAFE (gas), GUAR - Remove the gas-safety assurance (reviewer: Licensed gas technician or appliance manufacturer instructions + attorney)
- "toxic carbon crust" ... "actively alters the flavor of your food": HEALTH - Remove or substantiate (reviewer: Attorney)

## Request questions

- Guide 6.2 extra inputs / review needs: Type/model, condition, fuel/power, access, scope.
- Spec intake (HI-02.INT): grill fuel type, make/model, condition, location, access to water/power, customer expectations, corrosion/damage.
- Answers follow [[OWN-DEC-91]] and [[HH-SVC-03]]: units shown beside each measurement, approximate values allowed, and "I don't know" stays unknown, never zero, safe or approved. The sources set no per-service unit list.
- Estimate route: online when the details and photos are enough, a site visit when inspection or measurements are needed ([[OWN-DEC-99]], [[HH-SVC-04]]); a customer preference for a remote estimate never overrides a required site or qualification review.

## Included work (SOP section 2, "In scope")

- The five original steps in section 12: tear-down of grates, flavorizer bars, heat shields and grease trays; chemical soak of removed grates and shields; cookbox scraping; burner tube exterior brushing and port clearing (port clearing on hold, C-HI02-04); reassembly and exterior polishing (source: section 12).
- These match the pricing tiers' "Inclusions" ("Full soak, cookbox scrape, burner purge, and exterior stainless steel polish."); the agreement's inclusions omit burner purging (source: pricing file; C-HI02-V01).
- Gas grills only: the first step turns off "the propane tank or gas line valves" (source: section 12; spec HI-02.INT "grill fuel type").

## Excluded work and limits

HandyHub never performs licensed or unsafe scope: [[FACT-SVC-EXCLUDED-SCOPE]]; suspected hazardous material: [[FACT-SVC-SUSPECTED-HAZMAT]]; access equipment: [[FACT-SVC-ACCESS-EQUIPMENT]]. Referred out at launch for this service: burner-port clearing ([[FACT-SVC-REFER-OUT-TASKS]]).

### SOP section 2, "Out of scope"

- Not covered - pending review (02 G-047; 31 section 10 HI-02): charcoal, pellet, electric and smoker grills; no step isolates power or handles these fuels.
- Not covered - pending review (C-HI02-V03): clearing insect nests or ash from venturi or burner tubes, which the main plan promises; the SOP only brushes tube exteriors and clears ports.
- Not covered - pending review (02 G-047; 31 section 10 HI-02): cleaning grease trays and disposing of their contents; the trays are removed in "System Tear-down", but no step cleans or empties them.
- Not covered - pending review (C-HI02-09): steam cleaning; the main plan promises "steam brushes" and the inventory stocks a steam brush, but no step uses steam.
- Not covered - pending review (C-HI02-V02): sanitizing; the main plan's "sanitizes your grill" is not supported by any step, product or check.
- Not covered - pending review (C-HI02-05): disassembly beyond the parts named in "System Tear-down"; the agreement's "Full system tear-down" is broader and the boundary is undecided.
- Not covered - pending review (X-23): commercial or food-service units ("Extremely Neglected Commercial Restorations" in the pricing file; no commercial policy; Q-04-11).
- Not covered (04 HI-02 "exclusions", OPEN QUESTION for the owner): parts replacement; igniter or electrical repair; rust or paint repair.

### SOP section 2, "Do not perform"

*Entries 1-8 are the universal PROPOSED entries of 31 SOP standard section 3.3, each with the reason class and what to do instead that 31 section 3.3 asks for; entries 9-12 are the HI-02 seeds of 31 section 10. HUMAN REVIEW: qualified safety professional and licensing reviewer.*

1. Electrical, plumbing, gas or HVAC work outside the approved scope or requiring a licensed trade. Licensed trade: stop and escalate (source: spec START-011 "unapproved electrical/plumbing/gas/structural scope"; master section 1.3).
2. Structural work, meaning cutting, removing, sistering or adding load-bearing members, ledgers, footings or framing, unless it is in the approved scope with the required qualified review. Structural: stop and escalate (source: START-011; master section 1.3).
3. Disturbing suspect asbestos, lead paint or mold. Hazardous material: stop and escalate (source: START-011 "suspect hazardous materials"; owner facts L20 "Unknown is not safe").
4. Work that is not in the approved scope or an approved change order. Out of scope: record the customer's request instead (source: JOB-005, JOB-010, FIN-008, AT-033).
5. Working at height or using access equipment beyond the approved height and access policy. Policy: stop and escalate (source: HI-06.SAF "beyond approved height/access policy"; DW-04.TLS "scaffolds/stilts only under approved policy").
6. Mixing or sequencing chemicals in any way the approved step and the product SDS do not allow. Hazardous material: stop and escalate (source: CL-01.SAF "never mix incompatible chemicals"; X-09).
7. Recording, photographing or sending customer passwords, master codes or site access codes outside the app's secured fields. Policy: keep them only in the app's secured fields (source: COM-002; owner facts L17; 27 AUTH-009).
8. Promising results, warranties, safety, health or code compliance to the customer. Policy: refer such questions to the owner (source: master sections 1.4, 17 and 29; CL-07.SAF "do not make unsupported indoor-air-quality claims").
9. Modifying gas components beyond scope; fuel and power are isolated only as the grill manufacturer's instructions describe. Licensed trade: stop and refer (source: spec HI-02.SAF "avoid modifying gas components beyond scope", "isolate fuel/power per manufacturer").
10. Gas-component repair of any kind (burner, valve, hose, regulator, manifold or igniter). Licensed trade: stop, record the request and refer (source: 31 section 10 HI-02 "no gas-component repair"; 04 HI-02 "stop-work conditions" and "exclusions", PROPOSED).
11. Disconnecting or reconnecting fixed natural-gas piping. Licensed trade or permit question (open): not performed pending licensing review (source: 04 HI-02 "permit/license flags", PROPOSED interim rule; HUMAN REVIEW: municipal licensing authority, licensed gas fitter or plumber).
12. Repeating to the customer the agreement's "completely non-toxic" chemical statement or any "non-toxic", "eco-safe", "sanitizes" or "safe, consistent gas flow" claim. Policy: describe only the steps actually performed and refer claim questions to the owner (source: 31 section 10 HI-02 flag; C-HI02-01; C-HI02-V02; C-HI02-04).

- exclusions (registry 04, label **GAP** + **OPEN QUESTION**): None listed. Agreement disclaims liability for pre-existing structural component failures found during cleaning (attorney review; X-02). OPEN QUESTION for owner: parts replacement; gas valve/regulator/hose/manifold repair; igniter or electrical repair; rust/paint repair; fuel types out of scope; commercial food-service units (X-23) (source: agreement §1 L9; pricing L21)

## Hazards and human-review flags

- Spec hazards (HI-02.HAZ): hot surfaces, sharp metal, grease/fire risk, gas connections, chemical exposure, slips.
- Spec stop-work guidance (HI-02.SAF): confirm unit is cool/off; isolate fuel/power per manufacturer; avoid modifying gas components beyond scope; ventilate; control chemicals/waste.
- permit/license flags (registry 04, label **GAP** + **OPEN QUESTION**): None set; unknown applicability must not default to "no permit". OPEN QUESTIONS (no conclusion drawn): whether closing or disconnecting a fixed natural-gas supply is licensed gas/plumbing work in the municipality (HUMAN REVIEW: municipal authority + licensed gas fitter/plumber; PROPOSED interim rule: no disconnection of fixed gas piping); disposal of degreaser wastewater and grease (local sewer/stormwater utility); health or fire-code duties for commercial units (health department, fire official); the express chemical warranty (KY/IN attorney); insurance for gas-appliance work (insurance broker) (source: owner facts L4, L21; risk-triage playbook L13; agreement §1 L8, §2 L13; pricing L21)
- Reviewers named in the vault files' front matter: qualified safety reviewer; owner; Spanish translation reviewer; licensed trade professional; qualified gas appliance technician; insurance broker; CPA (tax treatment); attorney licensed in KY/IN (hourly billing basis, commercial wording); insurance broker (commercial scope); safety reviewer (PPE/hazmat); attorney licensed in KY/IN (product claims); qualified gas appliance technician (leak-check method); attorney licensed in KY/IN; licensed gas professional; qualified safety professional (chemical and gas clauses). Boundaries: [[RULE-HUMAN-REVIEW]].

### Required worker qualifications (SOP section 4)

- TBD — requires review by safety-liability-manager and a qualified person; owner to approve. No company qualification tags or training records exist yet (source: 31 section 3.1 row 4, GAP).
- PROPOSED: a qualification tag for gas-appliance isolation, used by scheduling (source: 04 HI-02 "applicable software workflow"; spec SCH-003).
- Fuel restoration and leak verification: only a qualified person under an approved method, and a supervisor, not the worker alone, verifies the result (source: 31 section 7.2 rank 7; 31 section 10 HI-02; HUMAN REVIEW: qualified gas appliance technician or licensed gas professional).
- Expertise gap: no HandyHub skill covers gas appliances; manufacturer instructions and a qualified gas appliance technician fill it (source: 04 HI-02 "responsible skill / business role"; 02 G-075).
- Manual handling and any two-person tasks (large or built-in grill components, filled soak bins): TBD - requires qualified safety reviewer review (source: spec BRF-008 "manual handling").
- With two employees, a worker never clears their own hold (source: 31 section 8.3 rule 3).

### Hazards (SOP section 9)

*Draft entries from the spec card and the HI-02 files. Severity, PPE and final controls for every entry are TBD by the qualified safety professional (HUMAN REVIEW). Controls are listed in hierarchy order - eliminate, substitute, engineer, administrative, PPE - as drafts only (source: safety-liability-manager skill).*

| # | Hazard | Source | Draft controls (pending review) | Stop-work trigger | IDs |
|---|---|---|---|---|---|
| 1 | Hot surfaces on the unit and removed parts | spec HI-02.HAZ "hot surfaces"; HI-02.SAF "confirm unit is cool/off" | Confirm cool and off before work (section 12 hold); cool-down period TBD by the reviewer; PPE TBD | Unit hot or on, or its state cannot be confirmed | 02 G-047 |
| 2 | Scalds from the "boiling water solution" and from steam | SOP "The Chemical Bath"; inventory "high-temperature water vapor" | Scald-control hold before the step; heat source, handling and draining method TBD; steam not used until a reviewed step exists | No approved heat source or handling method | C-HI02-09 (steam) |
| 3 | Sharp metal | spec HI-02.HAZ "sharp metal"; scrapers and wire brushes | Cut protection per the reviewer (PPE TBD) | Unsafe condition (section 10) | - |
| 4 | Grease fire | spec HI-02.HAZ "grease/fire risk"; pricing file "heavy grease fire risk crust layers" | No burn-off, ignition or flame test in this SOP; fire-prevention and first-response provisions pending review; fire extinguisher as a review item in the `vehicle-safety` kit | Fire, smoke or flare-up: emergency (section 19) | X-10 |
| 5 | Gas connections: leak, fire | spec HI-02.HAZ "gas connections"; SOP "Turn off the propane tank or gas line valves" | Isolation only per manufacturer; no modification or repair (Do not perform 9-11); fuel restore and leak verification on hold; port-clearing method on hold | Gas odor, suspected leak, a damaged burner, valve, hose or regulator, or a request for gas-component repair | C-HI02-03, C-HI02-04, X-07 |
| 6 | Chemical exposure, including residue on parts that touch food | spec HI-02.HAZ "chemical exposure"; four products without SDS (inventory file) | Approved product with reviewed SDS only; ventilate (HI-02.SAF); label dilution only; rinse, dry and residue check before reassembly; PPE from the SDS | Product without a reviewed SDS; a mix the SDS does not allow; ventilation not possible | C-HI02-01, C-HI02-02, X-09 |
| 7 | Slips | spec HI-02.HAZ "slips" | Protective coverings and absorbents (HI-02.MAT); method TBD | Unsafe condition (section 10) | - |
| 8 | Manual handling of heavy components and filled soak bins | inventory "Heavy 27-gallon utility bins"; spec BRF-008 "manual handling" | Handling method TBD by the reviewer | Unsafe condition (section 10) | - |
| 9 | Occupants, children and pets near the work | X-11; spec CX-005 | Keep occupants and pets out of the work area; shared module pending (31 section 5.8) | Unsafe condition; aggressive occupant or animal (section 10) | X-11 |
| 10 | Insect nests in burner or venturi tubes (hazard unassessed) | main plan "insect nests"; 04 HI-02 "hazards" | Venturi and nest clearing not covered (section 2); controls TBD | Unsafe condition (section 10) | C-HI02-V03 |
| 11 | Powered parts of the unit, and powered tools near water | spec HI-02.SAF "isolate fuel/power per manufacturer"; inventory steam brush | Power isolation per manufacturer; steam brush unused until reviewed | Unsafe condition (section 10) | - |

## Warranty or callback

- warranty or callback policy (registry 04, label **FACT** + **OPEN QUESTION**): No workmanship warranty or callback policy. The agreement contains an express chemical warranty ("completely non-toxic and food-surface safe post-rinsing") with no product list or SDS (C-HI02-01). OPEN QUESTION: owner + KY/IN attorney decide the warranty position; care notes (QA-008) only from manufacturer data; return visits classified per CX-007/QA-010; nothing invented (source: agreement §1 L8; spec QA-008, QA-010, CX-007)
