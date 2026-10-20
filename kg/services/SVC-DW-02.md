---
id: SVC-DW-02
type: service
title: "Texture Matching & Popcorn Removal"
status: active
area: business
links:
  decided_by: ["[[OWN-DEC-04]]", "[[OWN-DEC-33]]", "[[OWN-DEC-84]]", "[[OWN-DEC-51]]", "[[OWN-DEC-102]]", "[[OWN-DEC-108]]", "[[OWN-DEC-66]]"]
  uses: ["[[SOP-DW-02]]", "[[FACT-INVENTORY-DW-02]]", "[[FACT-PRICING-PER-JOB]]", "[[FACT-SVC-EXCLUDED-SCOPE]]"]
  constrained_by: ["[[RULE-HUMAN-REVIEW]]", "[[RULE-SAFETY-GATES]]", "[[RULE-NO-INVENTED-FACTS]]", "[[FACT-SVC-EXCLUDED-SCOPE]]", "[[FACT-SVC-SUSPECTED-HAZMAT]]", "[[FACT-SVC-ACCESS-EQUIPMENT]]", "[[FACT-SVC-HOME-AGE-LIMITS]]"]
  part_of: ["[[C01]]", "[[C02]]"]
  related: ["[[FACT-PRICING-DW-02]]", "[[FACT-AGREEMENT-DW-02]]", "[[FACT-SERVICE-AREA]]", "[[FACT-BRAND-IDENTITY]]", "[[FACT-SVC-NAMES]]", "[[HH-SVC-01]]", "[[HH-SVC-02]]", "[[HH-SVC-03]]", "[[HH-SVC-04]]", "[[OWN-DEC-91]]", "[[OWN-DEC-99]]", "[[OWN-DEC-127]]"]
source: "guide 6.2; vault 04-service-registry DW-02; spec section 17 DW-02; Standard Of Operations/sop popcorn-removal.md; Main Plans/Dry Wall Business.md"
---
Category: Drywall. Catalog name (guide 6.2): Texture Matching & Popcorn Removal. Canonical name (spec Appendix B): Texture Matching & Popcorn Ceiling Removal. Slug: `popcorn-removal`. Brand and service area: [[FACT-BRAND-IDENTITY]], [[FACT-SERVICE-AREA]]; naming: [[FACT-SVC-NAMES]].

In the launch set: all 26 services are in scope and launch ([[OWN-DEC-04]], [[OWN-DEC-33]]); reported capability is not proof of insurance, qualifications or equipment. Worker checklist: [[SOP-DW-02]] (active, pending competent review for production use, [[OWN-DEC-108]]). Pricing: each job is priced individually on its own estimate ([[FACT-PRICING-PER-JOB]]); the vault price list [[FACT-PRICING-DW-02]] is superseded. Tools and materials: [[FACT-INVENTORY-DW-02]]. Draft agreement clauses: [[FACT-AGREEMENT-DW-02]] (attorney review; customers approve the estimate terms of [[OWN-DEC-127]]).

Vault files: SOP `Standard Of Operations/sop popcorn-removal.md`; Pricing `Pricing/pricing-popcorn-removal.md`; Inventory `Required inventory/inventory-popcorn-removal.md`; Agreement `Service Agreements/contract-popcorn-removal.md`; main plan `Main Plans/Dry Wall Business.md` ("🪒 2. Texture Matching & Popcorn Ceiling Removal").

- aliases (registry 04, label **FACT**): plan heading "2. Texture Matching & Popcorn Ceiling Removal"; website headline "Modernize Your Home—Ditch the Outdated Popcorn Ceilings"; plan body "texture removal and remodeling service" ("remodeling" overlaps DW-03); pricing title "Regional Pricing: Popcorn Ceiling & Texture Modernization"; inventory title "Inventory & Tools: Popcorn Ceiling Removal & Texturing", tag `#service/popcorn-removal`; agreement title "Service Agreement: Popcorn Ceiling Removal & Modernization", scope phrase "heavy containment scraping and ceiling updating services"; SOP title "SOP: Popcorn Ceiling Removal & Texture Matching"; SOP file `sop popcorn-removal.md` (space); party placeholder `[Your Drywall Company Name]`. Cleaning-template residue, not aliases: "2-cleaner" crew label (inventory L4) and "Total Cleanable Area" (agreement L16) (C-DW02-16) (source: plan L22-23, L26; pricing L1; inventory L1-4; agreement L1, L4, L16; SOP L1; MOC Dashboard)

## Customer description

No owner-approved customer description exists in the sources. Service-page content is drafted from the service files: staging shows the drafts, production shows only versions the owner approves and publishes ([[OWN-DEC-84]], amended 2026-10-12). Pages state the service's limits ([[OWN-DEC-51]]) and never invent prices, completion times, credentials or guarantees ([[RULE-NO-INVENTED-FACTS]]).

- customer-facing description (registry 04, label **FACT** + **PROPOSED**): Draft plan copy (unapproved): the service "safely strips away these old finishes ... while improving interior air quality", "completely sealing floors, walls, and light fixtures to trap all scraping dust", "Level 5 mirror finish", matching "perfectly"; asbestos, lead and testing are never mentioned (C-DW02-10, C-DW02-15). PROPOSED neutral text: removal of acoustic ("popcorn") ceiling texture after the required hazardous-material evaluation, then a smooth skim finish or spray texture as selected in the approved estimate; wall texture matching only if the owner keeps it in DW-02 scope (source: plan L23-32)

Purpose (SOP section 1):

A labor-intensive, hazardous dust protocol designed to safely scrape texture and restore ceilings to a flawless modern finish while protecting residential interiors.

> FLAG: outcome claim - owner and attorney review (C-DW02-10). The original intro line above is kept verbatim. "safely", "flawless modern finish" and "protecting residential interiors" are safety and outcome claims that no control in this draft supports yet; the same line calls the work "hazardous dust", while no PPE, testing role or lead control exists (C-DW02-05, C-DW02-03). It is not a promise to the customer. Replacement wording is decided only through a new SOP version (31 section 5; Q-31-16).

- Remove acoustic ("popcorn") ceiling texture only after the required hazardous-material evaluation is recorded, then finish the ceiling smooth or with a sprayed Orange Peel or Knockdown texture, as selected in the approved estimate (source: spec Appendix B "Texture Matching & Popcorn Ceiling Removal"; 04 DW-02 customer-facing description, PROPOSED neutral text; spec DW-02.SAF; original Phases 2 to 5 in section 12).
- This SOP makes no safety, health, air-quality, finish or crack-free promise to the customer (source: 31 section 3.5 rule 5).
- Proposed risk class: high-risk / specialist review for any ceiling of unknown composition, any home of unknown age or older than the reviewer's threshold, and any painted texture; stop-work on a positive or inconclusive result (source: safety-liability-manager risk classification; 31 section 7.2 ranks 1 and 2; 04 DW-02 status, PROPOSED).
- Wall texture matching, which the canonical name includes, has no step here (section 2, Out of scope) (source: 04 DW-02 service slug and exclusions; C-DW02-15).

### Draft plan copy (`Main Plans/Dry Wall Business.md`; not approved, claims unverified)

*Target Headline for Website: Modernize Your Home—Ditch the Outdated Popcorn Ceilings*

Old, heavy "popcorn" or acoustic spray-on ceiling textures are relic design choices of past decades. Not only do they make modern interiors look dated, but they also act as aggressive traps for dust, cooking grease, allergens, and spiderwebs, making them almost impossible to clean. Our comprehensive texture removal and remodeling service safely strips away these old finishes, dramatically modernizing your home while improving interior air quality.

* **Elite Dust Containment:** We isolate the target rooms by installing heavy, thick plastic sheeting barriers across entryways, completely sealing floors, walls, and light fixtures to trap all scraping dust.
* **Safe Hydraulic Stripping:** We use a calculated water-misting system to soften the old acoustic texture, allowing us to safely slice and scrape the substrate clean off without gouging the delicate drywall backing beneath.
* **Level 5 Skim Coating:** Once bare, we apply multiple thin coats of premium joint compound over the entire ceiling area, converting it into a smooth, luxurious Level 5 mirror finish.
* **Artisanal Texture Matching:** If your walls require a specific texture blend (such as Orange Peel, Knockdown, or Skip-Trowel) to match existing layouts, we utilize calibrated hopper spray lines to match the pattern perfectly.

Claims the main plan flags for this service (each `unverified`, not publishable until approved):

- "Modernize Your Home—Ditch the Outdated Popcorn Ceilings": Headline - Hold until the hazard disclosure is approved (No testing disclosure; DW-02.HAZ "suspect asbestos in older textures, lead paint") (reviewer: Asbestos/lead-qualified professional + attorney)
- "safely strips away these old finishes, dramatically modernizing your home while improving interior air quality": SAFE, HEALTH - Remove; add approved testing disclosure (reviewer: Asbestos/lead-qualified professional + attorney)
- "to match the pattern perfectly": GUAR - Remove "perfectly" (reviewer: Attorney)

## Request questions

- Guide 6.2 extra inputs / review needs: Area/age if known, prior testing/coatings, occupancy/height; material review.
- Spec intake (DW-02.INT): home/ceiling age, prior testing, area/height, texture type, paint/coating, occupied status, finish target.
- Answers follow [[OWN-DEC-91]] and [[HH-SVC-03]]: units shown beside each measurement, approximate values allowed, and "I don't know" stays unknown, never zero, safe or approved. The sources set no per-service unit list.
- Estimate route: online when the details and photos are enough, a site visit when inspection or measurements are needed ([[OWN-DEC-99]], [[HH-SVC-04]]); a customer preference for a remote estimate never overrides a required site or qualification review.
- Service conditions: [[FACT-SVC-HOME-AGE-LIMITS]] (home-age limits apply to this service).

## Included work (SOP section 2, "In scope")

- Containment setup, HVAC isolation within the signed consent, wetting and scraping of the ceiling texture, re-taping and re-fastening of drywall defects within the approved repair scope, skim coating, sanding, priming and sprayed Orange Peel or Knockdown texture, as section 12 describes (source: original Phases 1 to 5; pricing Tier 1 and Tier 2 "Inclusions").
- All of it only after the hazardous-material disposition is recorded (section 3) and the holds in section 12 are released (source: spec DW-02.SAF "do not disturb suspect hazardous material without required evaluation/testing/authorization").
- Confirming on site, for every job, the intake facts: home/ceiling age, prior testing, area/height, texture type, paint/coating, occupied status, finish target (source: spec DW-02.INT; CX-005).

## Excluded work and limits

HandyHub never performs licensed or unsafe scope: [[FACT-SVC-EXCLUDED-SCOPE]]; suspected hazardous material: [[FACT-SVC-SUSPECTED-HAZMAT]]; access equipment: [[FACT-SVC-ACCESS-EQUIPMENT]].

### SOP section 2, "Out of scope"

- Not covered - pending review (C-DW02-15): wall texture matching and Skip-Trowel texture. The main plan promises them and the inventory stocks a compound "for Orange Peel, Knockdown, or Skip-Trowel patterns", while the steps spray Orange Peel or Knockdown on the ceiling only. Whether wall texture matching belongs to DW-02 or is a DW-01 line item is an owner decision (04 DW-02 exclusions, PROPOSED boundary).
- Not covered - pending review (C-DW02-07): structural repair. The Phase 3 heading says "Structural Repairs", the agreement disclaims "structural ceiling joist cracks", and no price line or change order covers repairs; sagging framing or framing movement is a stop condition (section 10).
- Not covered - pending review (C-DW02-09): closeout. No original step removes the containment, cleans up, handles the debris, unseals the vents or restores the HVAC; sections 14, 15 and 18 hold PROPOSED items.
- Not covered - pending review (C-DW02-02): asbestos sampling or testing. The agreement sells "Company testing" and the pricing file a testing surcharge, but no step, qualified role, lab or chain of custody exists; no HandyHub sampling.
- Not covered - pending review (C-DW02-12): work that needs ladders, platforms or staging, including ceilings above the height that the pricing file surcharges for "rolling staging/scaffolding logistics"; no height and access policy or equipment exists (X-12).
- Never performed under this SOP (04 DW-02 exclusions; section 2, Do not perform): asbestos abatement, encapsulation or removal of suspect material (the agreement leaves abatement to a separate firm at the client's expense); lead hazard work; electrical work on fixtures.
- Not covered - pending owner decision (04 DW-02 exclusions, GAP): finish painting after the primer coat; no step covers it.

### SOP section 2, "Do not perform"

Each entry: prohibited work - reason class - what to do instead (source). PROPOSED wording; HUMAN REVIEW: qualified safety professional and licensing reviewer (31 section 3.3).

1. Electrical, plumbing, gas or HVAC work outside the approved scope or requiring a licensed trade - licensed trade - stop and escalate (source: spec START-011 "unapproved electrical/plumbing/gas/structural scope"; master section 1.3).
2. Structural work, meaning cutting, removing, sistering or adding load-bearing members, ledgers, footings or framing, unless it is in the approved scope with the required qualified review - structural - stop and escalate (source: spec START-011; master section 1.3).
3. Suspected asbestos / lead paint / mold: stop and escalate (source: spec START-011). Do not disturb suspect material - hazardous material ("Unknown is not safe", owner facts 2026-10-02).
4. Work that is not in the approved scope or an approved change order - out of scope - record the customer's request instead (source: spec JOB-005, JOB-010, FIN-008, AT-033).
5. Working at height or using access equipment beyond the approved height and access policy - policy - stop and escalate (source: spec HI-06.SAF "beyond approved height/access policy"; DW-04.TLS "scaffolds/stilts only under approved policy").
6. Mixing or sequencing chemicals in any way the approved step and the product SDS do not allow - hazardous material - stop and escalate (source: 31 section 3.3, from CL-01.SAF "never mix incompatible chemicals").
7. Recording, photographing or sending customer passwords, master codes or site access codes outside the app's secured fields - policy - use the app's secured fields only (source: spec COM-002; owner facts 2026-10-02; 27 AUTH-009).
8. Promising results, warranties, safety, health or code compliance to the customer, including air-quality claims, a "flawless" finish or a perfect texture match - policy - refer the question to the owner (source: master sections 1.4, 17 and 29; C-DW02-10, C-DW02-15).
9. Disturbing suspect hazardous material without required evaluation/testing/authorization - hazardous material - leave it undisturbed; stop and escalate (source: spec DW-02.SAF, verbatim; 31 section 10).
10. Asbestos abatement or encapsulation, and collecting, cutting or sending samples of the texture - hazardous material - refer; no HandyHub sampling until the testing role is defined (source: 31 section 10; C-DW02-02; related C-DW02-01).
11. Removing, disconnecting or rewiring ceiling fixtures - licensed trade - a licensed electrician does it (source: 31 section 10 "no fixture removal without a licensed electrician"; C-DW02-04).
12. Repairing sagging or moving framing or joists - structural - stop, photograph, record and escalate (source: C-DW02-07; spec START-011).

- exclusions (registry 04, label **FACT** + **GAP** + **PROPOSED**): Asbestos abatement at the client's separate expense by a certified abatement sub-contractor (agreement §1; pricing "refer to a hazardous remediation sub-contractor"); structural joist cracks revealed after scraping (agreement §2). GAP: no exclusion for lead hazard work, fixture electrical work, painting, wall texture or repairs beyond scope; SOP Phase 3 "Structural Repairs" has no price or change-order route (C-DW02-07). PROPOSED boundary (owner decides): DW-02 = ceilings (popcorn removal and ceiling texture); wall texture matching = DW-01 line item (source: agreement L8, L13; pricing L32; SOP L16-19; registry boundary rules)

## Hazards and human-review flags

- Spec hazards (DW-02.HAZ): suspect asbestos in older textures, lead paint, falls, dust, electrical fixtures, water exposure.
- Spec stop-work guidance (DW-02.SAF): do not disturb suspect hazardous material without required evaluation/testing/authorization; isolate area; control dust; de-energize/protect fixtures as needed; height controls.
- permit/license flags (registry 04, label **OPEN QUESTION** + **GAP**): None in any DW-02 file. OPEN QUESTION (HUMAN REVIEW): who may collect samples of suspect asbestos texture, which lab and what chain of custody (accredited asbestos inspector, attorney, KY/IN environmental agencies); abatement, notification and disposal requirements after a positive result; whether EPA RRP applies to painted texture in pre-1978 homes (EPA RRP-certified renovator + attorney); disposal of texture debris and containment plastic; licensed electrician if fixtures must be removed. Encode as START-010 prerequisites; unknown must not default to "no permit" (source: owner facts; risk-triage playbook; spec START-010, HND-005; agreement L7-8)
- Reviewers named in the vault files' front matter: qualified safety reviewer; owner; Spanish translation reviewer; licensed trade professional (licensed electrician for ceiling fixtures); accredited asbestos inspector; EPA RRP-certified renovator; attorney licensed in KY/IN; structural engineer (framing findings); CPA (tax treatment); accredited asbestos inspector (testing surcharge line); qualified safety professional (high-ceiling access line); attorney licensed in KY/IN (testing and fee wording); safety reviewer (PPE/hazmat); insurance broker; qualified safety professional. Boundaries: [[RULE-HUMAN-REVIEW]].

### Required worker qualifications (SOP section 4)

TBD — requires review by safety-liability-manager and a qualified person; owner to approve.

- No company qualification policy exists yet (source: 31 section 3.1, section 4 row "owner policy (none yet: GAP)").
- Qualification tags and training for dust and respiratory protection, access equipment, compressor and hopper-gun operation, and recognizing suspect material (recognizing it and stopping, not sampling it) are decided by the qualified safety professional (source: spec DW-02.HAZ, DW-02.TLS; spec SCH-003 "worker capability/qualification tags").
- No sampling, abatement, encapsulation, electrical or structural work is performed under this SOP (section 2, Do not perform). Whether HandyHub holds or plans EPA RRP certification is an open question (Q-31-07).
- Crew size is not stated in the steps; the inventory assumes two workers. Whether a job needs both employees is planned per job (source: inventory intro line; job-planner playbook "Do not treat the two-person team as two independent crews when the job needs both.").

### Hazards (SOP section 9)

Seeded from the spec card and the verified findings; every control is pending qualified review, and controls are listed in hierarchy order (eliminate, substitute, engineer, administrative, PPE). No limit, distance, temperature, pressure or time is set here.

| Hazard | Where in this SOP | Controls (pending qualified review) | PPE | Stop-work trigger | Escalation and reviewer | Related finding (severity) |
|---|---|---|---|---|---|---|
| Suspect asbestos in older textures (spec DW-02.HAZ) | Every step that wets, scrapes, sands or tapes over the ceiling texture; "Asbestos Verification" | Eliminate: no disturbance until the disposition is recorded; no HandyHub sampling; positive or inconclusive = BLOCKED (section 12 holds). Wet methods do not clear suspect material ("Unknown popcorn-ceiling material is not cleared by wet scraping", risk-triage playbook) | Not a PPE matter: stop | Unknown build year; untested texture; positive or inconclusive result (section 10) | Accredited asbestos inspector; owner | C-DW02-02 (critical); C-DW02-03 (critical); X-13 (high) |
| Lead paint (spec DW-02.HAZ): painted texture or a painted ceiling | Scraping, sanding, skim preparation | Screen the build year and paint/coating at intake (spec DW-02.INT); painted texture in a pre-1978 or unknown-age home = HOLD for EPA RRP review (31 section 10) | Not a PPE matter: stop | Painted texture in a pre-1978 or unknown-age home | EPA RRP-certified renovator; attorney | C-DW02-03 (critical); X-13 (high) |
| Dust (spec DW-02.HAZ; the intro's "hazardous dust protocol") | Scraping, mixing, sanding, texture spraying, containment removal | Engineering: the containment envelope ("Total Masking") and the HEPA-connected pole sander ("Dustless Sanding"); administrative: keep containment in place until cleanup (spec APXA-004); the respiratory and dust-control decision rests with the reviewer | Section 6 (pending) | Containment breach; suspected hazardous-material exposure is an incident (spec JOB-008) | Qualified safety professional | C-DW02-05 (critical) |
| Electrical fixtures and water exposure (spec DW-02.HAZ) | "Misting Protocol", "Soak Window" and "Slicing Scraping" near ceiling light fixtures; plastic sheeting over fixtures, which the main plan describes | Eliminate or isolate: fixtures and circuits in the work zone isolated and protected before any wetting, by an approved method (section 12 hold); no electrical work; fixture removal only by a licensed electrician. Plastic over an energized fixture is an unassessed heat or fire risk (02 C-DW02-04) | Section 6 | Isolation not confirmed; water reaching a fixture or electrical box | Licensed electrician; qualified safety professional | C-DW02-04 (critical) |
| Falls (spec DW-02.HAZ) | Vent sealing, curtain hanging, hand work at the ceiling in Phase 3, priming, texture spraying; ceilings above the height the pricing file surcharges | Engineering: pole tools for scraping, skimming and sanding (inventory); access equipment only under an approved height and access policy, which does not exist yet (02 G-005) | Set by the reviewer | No approved access means: the affected steps stay on hold (31 section 8.4) | Qualified safety professional | X-12 (high); C-DW02-12 (high) |
| HVAC switched off for a multi-visit job: heat or cold for occupants and workers | "HVAC Isolation" through the drying waits in Phase 4 | Administrative: HVAC state matched to the signed consent at each phase change; duration and temperature plan pending review; vents unsealed and HVAC restored at closeout | Not applicable | "severe weather or unsafe heat or cold" (section 10 block) | Owner; attorney (consent); qualified safety professional (temperature) | C-DW02-V01 (medium); C-DW02-09 (high); X-07 (high) |
| Slips on wet slurry and plastic sheeting | "Slicing Scraping" ("allowing it to drop onto the plastic") | Controls set by the reviewer; debris handling in section 15 | Footwear pending review (section 6) | Unsafe condition (section 10 block) | Qualified safety professional | None registered |
| Structural sagging or framing movement revealed by scraping | "Exposing Defects", "Fastener Tightening" | Stop, photograph, record and review; no structural repair (section 2, Do not perform) | Not a PPE matter: stop | Sagging or framing movement (section 10) | Supervisor; structural engineer | C-DW02-07 (high) |
| Moisture or mold uncovered (spec drywall section intro: drywall work "can uncover moisture, mold") | After scraping; over-wetting ("excess water will degrade the underlying drywall core paper") | Do not over-saturate (original step); stop on moisture, an active leak or suspected mold (section 10 block); company mold definition pending (Q-31-10) | Section 6 | Moisture, active leak or suspected mold | Qualified mold assessor or industrial hygienist; owner | None registered |
| Compressor and hopper gun (inventory) | "Texture Spray Application" | Set up and operate only per the manufacturers' instructions; the inventory's settings are unapproved values | Section 6 | Tool or equipment failure (spec JOB-008) | Qualified safety professional | None registered |
| Chemical products: wetting agent, joint and texture compounds, primer | Misting, skimming, texture spraying, priming | SDS register; a product without a reviewed SDS is not carried to a job (29 section 8.3, PROPOSED); mixing only as the label states (29 section 8.2) | Per the reviewed SDS | Unsafe condition | Qualified safety professional | None registered (02 G-008) |
| Sharp blades: scraper, skimming blades, knives | Scraping, skimming, ridge scraping | Controls set by the reviewer | Hand protection pending review (section 6) | Unsafe condition | Qualified safety professional | None registered |
| Manual handling: furniture, if the crew moves it, and materials | "Total Masking" ("Remove all furniture from the zone") | Who moves furniture is an owner decision (C-DW02-14); controls set by the reviewer (spec BRF-008 "manual handling") | Section 6 | Unsafe condition | Qualified safety professional; owner | C-DW02-14 (medium) |
| Occupants, children and pets | Contained rooms and routes through the home | Keep them out of the active work area; occupant and pet module pending review (31 section 5.8) | Not applicable | Unsafe condition for occupants or pets; aggressive occupant or animal (spec START-011) | Qualified safety professional | X-11 (high) |

## Warranty or callback

- warranty or callback policy (registry 04, label **GAP** + **OPEN QUESTION**): No warranty or callback policy (cracking after skim coat, texture mismatch, flashing) and none is proposed here; plan promises matching "perfectly" (HUMAN REVIEW: attorney). Return visits classified per CX-007 and QA-010 (source: plan L32; spec CX-007, QA-010)
- Governed now by: the 90-day workmanship warranty of [[FACT-WARRANTY]] ([[OWN-DEC-135]]), counted from the reviewed completion date; a claim opens a case with return-visit punch items ([[HH-QA-07]]). No warranty exclusions are defined; any come only from attorney review ([[OQ-ATTORNEY-TERMS]]).
