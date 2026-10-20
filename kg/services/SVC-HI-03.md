---
id: SVC-HI-03
type: service
title: "Driveway Pressure Washing"
status: active
area: business
links:
  decided_by: ["[[OWN-DEC-04]]", "[[OWN-DEC-33]]", "[[OWN-DEC-84]]", "[[OWN-DEC-51]]", "[[OWN-DEC-102]]", "[[OWN-DEC-108]]"]
  uses: ["[[SOP-HI-03]]", "[[FACT-INVENTORY-HI-03]]", "[[FACT-PRICING-PER-JOB]]", "[[FACT-SVC-EXCLUDED-SCOPE]]"]
  constrained_by: ["[[RULE-HUMAN-REVIEW]]", "[[RULE-SAFETY-GATES]]", "[[RULE-NO-INVENTED-FACTS]]", "[[FACT-SVC-EXCLUDED-SCOPE]]", "[[FACT-SVC-SUSPECTED-HAZMAT]]", "[[FACT-SVC-ACCESS-EQUIPMENT]]"]
  part_of: ["[[C01]]", "[[C02]]"]
  related: ["[[FACT-PRICING-HI-03]]", "[[FACT-AGREEMENT-HI-03]]", "[[FACT-SERVICE-AREA]]", "[[FACT-BRAND-IDENTITY]]", "[[FACT-SVC-NAMES]]", "[[HH-SVC-01]]", "[[HH-SVC-02]]", "[[HH-SVC-03]]", "[[HH-SVC-04]]", "[[OWN-DEC-91]]", "[[OWN-DEC-99]]", "[[OWN-DEC-127]]"]
source: "guide 6.2; vault 04-service-registry HI-03; spec section 17 HI-03; Standard Of Operations/sop-driveway-cleaning.md; Main Plans/Home Improvement Business.md"
---
Category: Home Improvement. Catalog name (guide 6.2): Driveway Pressure Washing. Canonical name (spec Appendix B): Driveway Pressure Washing & Surface Restoration. Slug: `driveway-cleaning`. Brand and service area: [[FACT-BRAND-IDENTITY]], [[FACT-SERVICE-AREA]]; naming: [[FACT-SVC-NAMES]].

In the launch set: all 26 services are in scope and launch ([[OWN-DEC-04]], [[OWN-DEC-33]]); reported capability is not proof of insurance, qualifications or equipment. Worker checklist: [[SOP-HI-03]] (active, pending competent review for production use, [[OWN-DEC-108]]). Pricing: each job is priced individually on its own estimate ([[FACT-PRICING-PER-JOB]]); the vault price list [[FACT-PRICING-HI-03]] is superseded. Tools and materials: [[FACT-INVENTORY-HI-03]]. Draft agreement clauses: [[FACT-AGREEMENT-HI-03]] (attorney review; customers approve the estimate terms of [[OWN-DEC-127]]).

Vault files: SOP `Standard Of Operations/sop-driveway-cleaning.md`; Pricing `Pricing/pricing-driveway-cleaning.md`; Inventory `Required inventory/inventory-driveway-cleaning.md`; Agreement `Service Agreements/contract-driveway-cleaning.md`; main plan `Main Plans/Home Improvement Business.md` ("🚗 3. Driveway Pressure Washing & Surface Restoration").

- aliases (registry 04, label **FACT**): "3. Driveway Pressure Washing & Surface Restoration" (plan heading); "Driveway Pressure Washing" (pricing, inventory, agreement and SOP titles); "industrial pressure washing service" (plan overview); "high-pressure concrete cleaning and surface restoration services" and "Hydraulic Cleansing" (agreement); website headline "Eradicate Oil Stains, Mildew, and Black Mold—Instant Curb Appeal Restored" (tagline); file stems pricing-/inventory-/contract-/sop-driveway-cleaning (source: plan §3 L35-39; pricing L1; inventory L1; agreement L1, L4, L6; SOP L1)

## Customer description

No owner-approved customer description exists in the sources. Service-page content is drafted from the service files: staging shows the drafts, production shows only versions the owner approves and publishes ([[OWN-DEC-84]], amended 2026-10-12). Pages state the service's limits ([[OWN-DEC-51]]) and never invent prices, completion times, credentials or guarantees ([[RULE-NO-INVENTED-FACTS]]).

- customer-facing description (registry 04, label **FACT** + **PROPOSED**): Draft website copy only, not approved. Unreviewed claims: "Eradicate Oil Stains, Mildew, and Black Mold" (the agreement says some stains may be permanent, C-HI03-04); "rendering slippery walkways completely safe again"; "eco-safe surfactants" (C-HI03-V02); bio-shield "keeping your driveway cleaner for three times longer" (C-HI03-05). PROPOSED neutral summary (owner + handyhub-marketing review): pressure washing of concrete driveways and walkways, with stain pre-treatment where approved; some stains may not lift fully (source: plan §3 L36-45; agreement §1 L8)

Purpose (SOP section 1):

Clean concrete driveways and walkways of organic growth and treat motor-oil stains with pressure washing and approved stain pre-treatment, for the canonical service HI-03 Driveway Pressure Washing & Surface Restoration, while protecting people, pets, adjacent property and drainage (source: spec Appendix B; spec HI-03.INT, HI-03.SAF; 04 HI-03 "customer-facing description", PROPOSED neutral summary; original procedure Options A and B in section 12). No outcome is promised: some stains may not lift fully (source: agreement "Stain Limitations"; 31 section 3.5 rule 5). This SOP has no repair or sealing step even though the canonical name says "Surface Restoration" (C-HI03-10).

### Draft plan copy (`Main Plans/Home Improvement Business.md`; not approved, claims unverified)

*Target Headline for Website: Eradicate Oil Stains, Mildew, and Black Mold—Instant Curb Appeal Restored*

The intense humidity and variable weather transitions of the Kentuckiana region cause concrete driveways, sidewalks, and entry brick steps to rapidly breed slick green algae and deep black mold spores . Beyond looking unpolished, a dirt-caked driveway acts like a sponge for automotive oil leaks and chemical stains. Our industrial pressure washing service blasts out deeply embedded grime layers, transforming your property’s primary curb appeal while rendering slippery walkways completely safe again.

- [ ] **Targeted Chemical Pre-Treatment:** We spray industrial, eco-safe surfactants and grease-lifters over stubborn motor oil drips, rust lines, and heavy organic mold patches.
- [ ] **Uniform Rotary Surface Cleaning:** We don't use standard, streaky wand nozzles that leave zebra stripes. We deploy heavy-duty circular surface cleaning decks that distribute high-pressure water evenly at 3,000 PSI.
- [ ] **Perimeter Wand Flushing:** We use high-pressure turbo nozzles to meticulously detail edges, curb transitions, tight wall corners, and concrete expansion joints.
- [ ] **Anti-Fungal Bio-Shield Spray:** We apply a final, post-wash sanitizing mist to kill microscopic mold roots deep inside concrete pores, keeping your driveway cleaner for three times longer.

Claims the main plan flags for this service (each `unverified`, not publishable until approved):

- "Eradicate Oil Stains, Mildew, and Black Mold—Instant Curb Appeal Restored": Headline - Remove (Outcome guarantee; mold is a hazardous-material boundary; contract says stains "may leave permanent concrete shading shadows") (reviewer: Attorney + safety reviewer)
- "rendering slippery walkways completely safe again": GUAR, SAFE - Remove (reviewer: Attorney)
- "keeping your driveway cleaner for three times longer": GUAR, SCOPE - Remove claim; show the add-on only if approved (reviewer: Attorney)
- "We spray industrial, eco-safe surfactants": ENV, SAFE - Remove (reviewer: Attorney + SDS review)

## Request questions

- Guide 6.2 extra inputs / review needs: Surface/area, stains, drainage/water, sensitive surroundings.
- Spec intake (HI-03.INT): surface type/condition, area, drainage, nearby doors/windows/landscaping, stain types, water source, weather.
- Answers follow [[OWN-DEC-91]] and [[HH-SVC-03]]: units shown beside each measurement, approximate values allowed, and "I don't know" stays unknown, never zero, safe or approved. The sources set no per-service unit list.
- Estimate route: online when the details and photos are enough, a site visit when inspection or measurements are needed ([[OWN-DEC-99]], [[HH-SVC-04]]); a customer preference for a remote estimate never overrides a required site or qualification review.

## Included work (SOP section 2, "In scope")

As written in the original procedure (section 12), pending review:
- Option A: chemical pre-treatment and rotary surface cleaning of concrete with organic growth; it is the only whole-surface path, so a driveway without growth has no written path (source: original Option A; C-HI03-08).
- Option B: spot treatment of motor-oil stains on concrete, matching the pricing line "Heavy Motor Oil Extraction Surcharge" (source: original Option B; pricing file).
- Surfaces: concrete only, as the steps are written; any other hardscape surface needs its own approved method (source: 04 section 5.4 rule (b), PROPOSED; C-HI03-08).

## Excluded work and limits

HandyHub never performs licensed or unsafe scope: [[FACT-SVC-EXCLUDED-SCOPE]]; suspected hazardous material: [[FACT-SVC-SUSPECTED-HAZMAT]]; access equipment: [[FACT-SVC-ACCESS-EQUIPMENT]].

### SOP section 2, "Out of scope"

- Not covered - pending review (C-HI03-03): perimeter wand detailing, which the agreement includes "as outlined in" this SOP; no step, nozzle or quality check exists.
- Not covered - pending review (C-HI03-05): the post-wash bio-shield spray, sold as an option in pricing and described as included in the main plan; no product, SDS or step exists.
- Not covered - pending review: rust-line treatment promised in the main plan; no product or step exists (source: 31 section 10).
- Not covered - pending review (C-HI03-08): sidewalks, entry brick steps, patios and courtyards of other materials, and a general wash path for surfaces without growth or oil, all sold in the main plan or pricing; pavers and brick are not offered unless assessed (source: 04 HI-03 "exclusions").
- Not covered - pending review (C-HI03-V01): old or set-in oil saturation; Option B is written for a fresh oil spot.
- Not offered under this SOP until the owner decides (source: 04 HI-03 "exclusions", GAP): sealing, crack repair, painted or coated surfaces, wood decks and fences (PT-02 preparation or an owner-decided line, Q-04-09), siding and roofs.

### SOP section 2, "Do not perform"

Universal entries 1 to 8 are the 31 SOP standard section 3.3 list; entries 9 to 11 are the HI-03 seeds of 31 section 10. All are PROPOSED wording (HUMAN REVIEW: qualified safety professional and licensing reviewer).

| # | Do not | Reason class | Instead | Source |
|---|---|---|---|---|
| 1 | Electrical, plumbing, gas or HVAC work outside the approved scope or requiring a licensed trade | Licensed trade | Stop and escalate; refer | spec START-011; master section 1.3 |
| 2 | Structural work (cutting, removing, sistering or adding load-bearing members, ledgers, footings or framing) unless it is in the approved scope with the required qualified review | Structural | Stop and escalate | spec START-011; master section 1.3 |
| 3 | Disturb suspect asbestos, lead paint or mold | Hazardous material | Stop and escalate | spec START-011 "suspect hazardous materials"; owner facts 2026-10-02 "Unknown is not safe" |
| 4 | Work that is not in the approved scope or an approved change order | Out of scope | Record the customer request; change order | spec JOB-005, JOB-010, FIN-008, AT-033 |
| 5 | Work at height or use access equipment beyond the approved height and access policy | Policy | Stop and escalate | spec HI-06.SAF "beyond approved height/access policy"; DW-04.TLS |
| 6 | Mix or sequence chemicals in any way the approved step and the product SDS do not allow | Hazardous material | Stop and escalate | spec CL-01.SAF "never mix incompatible chemicals" |
| 7 | Record, photograph or send customer passwords, master codes or site access codes outside the app's secured fields | Policy | Use the app's secured fields | spec COM-002; owner facts 2026-10-02; 27 AUTH-009 |
| 8 | Promise results, warranties, safety, health or code compliance to the customer | Policy | Use approved wording only (section 17) | master sections 1.4, 17 and 29; spec CL-07.SAF |
| 9 | Wash with people or pets in the wash zone | Policy | Keep them out, or stop | spec HI-03.SAF "exclude people/pets"; X-11 |
| 10 | Continue on damaged substrate | Policy | Stop, record (JOB-004) and escalate | spec HI-03.SAF "stop for damaged substrate" |
| 11 | Pressure-wash painted or coated surfaces before they are assessed; suspected asbestos / lead paint / mold: stop and escalate | Hazardous material | Stop and escalate | spec START-011; 31 section 10 (older-paint RISK) |

- exclusions (registry 04, label **FACT** + **GAP** + **OPEN QUESTION**): Agreement stain limitation: decades-old oil saturation, heavy rust and battery-acid burns may leave permanent shading. GAP: sealing; crack repair; painted/coated surfaces; pavers/brick unless assessed (C-HI03-08); wood decks/fences (PT-02 preparation or an owner-decided line); siding/roofs; rust removal although the plan promises it. OPEN QUESTION for owner (source: agreement §1 L8; plan L42; C-HI03-08)

## Hazards and human-review flags

- Spec hazards (HI-03.HAZ): high-pressure injection injury, slips, flying debris, chemicals, electrical proximity, property damage, runoff.
- Spec stop-work guidance (HI-03.SAF): exclude people/pets; test inconspicuous area; use surface-appropriate pressure; protect electrical/openings/landscape; manage runoff; stop for damaged substrate.
- permit/license flags (registry 04, label **GAP** + **OPEN QUESTION**): None set; unknown applicability must not default to "no permit". OPEN QUESTIONS (no conclusion drawn): discharge of wash water containing hypochlorite, degreaser and oil to storm drains or soil (HUMAN REVIEW: municipal stormwater/sewer authority + attorney); label use and any applicator credential for biocide/algaecide claims (state pesticide regulator); backflow protection at the customer spigot (water utility or plumbing inspector); local noise/operating hours; insurance for etching, overspray and plant damage (insurance broker) (source: owner facts L4, L21; risk-triage playbook L13; plan L45; inventory L5; agreement §2 L12)
- Reviewers named in the vault files' front matter: qualified safety reviewer; owner; Spanish translation reviewer; local authority (runoff and disposal rules); CPA (tax treatment); safety reviewer (PPE/hazmat); attorney licensed in KY/IN; insurance broker; qualified safety professional (exclusion zone). Boundaries: [[RULE-HUMAN-REVIEW]].

### Required worker qualifications (SOP section 4)

TBD — requires review by safety-liability-manager and a qualified person; owner to approve.
- PROPOSED: qualification tags for pressure washing and chemical cleaning, required before assignment (source: spec SCH-003; 04 HI-03 "applicable software workflow"; Q-04-13).
- Review of the product SDS summaries before handling chemicals, recorded per worker (source: 29 section 8.2 row 11; spec START-004).
- The registry lists no licensed-trade boundary for this service (source: 04 section 6.3, licensed boundaries "none of the eight", PROPOSED); any electrical, plumbing or gas need is out of scope (Do not perform entry 1). This is not a finding that no registration, permit or credential applies: the registry's open questions on wash-water discharge, biocide label use and applicator credentials, backflow protection and operating hours stay with the authorities named there (source: 04 section 6.3; spec HND-005).

### Hazards (SOP section 9)

Draft service risk class (PROPOSED, 04 section 6.2): high-risk / specialist review for high-pressure injection, the hypochlorite soft-wash mix, electrical proximity and runoff, until the pressure-washing and chemical modules are approved. Hazard classes: pressure, chemical, electrical, heat-weather. Job-level classification stays with risk triage (31 section 3.2). Controls are listed in hierarchy order (safety-liability-manager: "eliminate, substitute, engineer, administratively control, then PPE") and are all pending qualified review.

| Hazard | Source | Controls (pending review) | Stop-work trigger | Reviewer |
|---|---|---|---|---|
| High-pressure injection injury | spec HI-03.HAZ; original Option B nozzle step (C-HI03-01) | Method selected from manufacturer instructions and by the reviewer; RECOMMENDATION: the rotary surface cleaner rather than a hand-held concentrated nozzle where it does the job; exclusion zone; qualification tag; PPE by qualified selection | Anyone enters the wash zone; equipment damaged | Qualified safety professional |
| Slips | spec HI-03.HAZ | Keep people and pets off wet and treated areas; further controls TBD - pending safety review | Unsafe footing for workers or occupants | Qualified safety professional |
| Flying debris | spec HI-03.HAZ | Exclusion zone; PPE by qualified selection | Anyone in the wash zone | Qualified safety professional |
| Chemicals (hypochlorite soft-wash mix, surfactant, degreaser, poultice, fuel) | spec HI-03.HAZ; inventory file (C-HI03-02) | Approved products with a reviewed SDS only; mixing only as the label states; no combining beyond the SDS; PPE from the SDS by the reviewer; spill provisions in the vehicle safety kit | No reviewed SDS; a spill or exposure (incident, section 20) | Qualified safety professional |
| Electrical proximity | spec HI-03.HAZ, HI-03.SAF | Protect electrical fixtures, outlets and openings before washing; no washing toward electrical fixtures, outlets or meters until they are protected (31 section 7.2 rank 4) | A fixture, outlet or meter cannot be protected | Qualified safety professional |
| Property damage (etching, striping, plants, vehicles, openings) | spec HI-03.HAZ, HI-03.QAC | Arrival photos of the existing condition; test area; surface-appropriate pressure; protection of landscaping and openings | The test shows etching, striping or damage; damaged substrate | Qualified safety professional; insurance broker |
| Runoff | spec HI-03.HAZ, HI-03.MAT | Rinse-water controls; destination per the local authority (Q-29-10); no conclusion on discharge rules here | Runoff cannot be controlled | Local authority; qualified safety professional |
| Gas engine (fuel, exhaust near openings, noise) | 04 HI-03 "hazards" (not on the card; unassessed) | TBD — requires review by safety-liability-manager and a qualified person; owner to approve. | TBD | Qualified safety professional |
| Weather, temperature and heat | X-27; spec HI-03.INT "weather", BRF-008 | Weather and heat module (does not exist yet) | Severe weather or unsafe heat or cold (section 10) | Qualified safety professional |
| Mold wording: exterior mildew vs suspected mold growth | X-06; original Option A heading | Option A treats "mold" on exterior concrete while the section 10 rule stops work for possible mold; which growth Option A may treat waits for the company definition (Q-31-10); the stop rule is not relaxed meanwhile | Possible mold growth (section 10) | Qualified mold assessor or industrial hygienist |
| Occupants, children and pets | X-11; spec HI-03.SAF "exclude people/pets" | Exclusion zone; customer preparation (section 5) | Anyone enters the wash zone | Qualified safety professional |

## Warranty or callback

- warranty or callback policy (registry 04, label **GAP** + **OPEN QUESTION**): None in any file. The plan implies durability ("keeping your driveway cleaner for three times longer") with no basis, while the agreement limits stain outcomes. OPEN QUESTION: owner + KY/IN attorney; return visits classified per CX-007/QA-010; nothing invented (source: plan L45; agreement §1 L8; spec CX-007, QA-010)
