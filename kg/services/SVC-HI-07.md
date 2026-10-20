---
id: SVC-HI-07
type: service
title: "Attic Insulation"
status: active
area: business
links:
  decided_by: ["[[OWN-DEC-04]]", "[[OWN-DEC-33]]", "[[OWN-DEC-84]]", "[[OWN-DEC-51]]", "[[OWN-DEC-102]]", "[[OWN-DEC-108]]"]
  uses: ["[[SOP-HI-07]]", "[[FACT-INVENTORY-HI-07]]", "[[FACT-PRICING-PER-JOB]]", "[[FACT-SVC-EXCLUDED-SCOPE]]"]
  constrained_by: ["[[RULE-HUMAN-REVIEW]]", "[[RULE-SAFETY-GATES]]", "[[RULE-NO-INVENTED-FACTS]]", "[[FACT-SVC-EXCLUDED-SCOPE]]", "[[FACT-SVC-SUSPECTED-HAZMAT]]", "[[FACT-SVC-ACCESS-EQUIPMENT]]", "[[FACT-SVC-REFER-OUT-TASKS]]"]
  part_of: ["[[C01]]", "[[C02]]"]
  related: ["[[FACT-PRICING-HI-07]]", "[[FACT-AGREEMENT-HI-07]]", "[[FACT-SERVICE-AREA]]", "[[FACT-BRAND-IDENTITY]]", "[[FACT-SVC-NAMES]]", "[[HH-SVC-01]]", "[[HH-SVC-02]]", "[[HH-SVC-03]]", "[[HH-SVC-04]]", "[[OWN-DEC-91]]", "[[OWN-DEC-99]]", "[[OWN-DEC-127]]"]
source: "guide 6.2; vault 04-service-registry HI-07; spec section 17 HI-07; Standard Of Operations/sop-attic-insulation.md; Main Plans/Home Improvement Business.md"
---
Category: Home Improvement. Catalog name (guide 6.2): Attic Insulation. Canonical name (spec Appendix B): Attic Insulation Upgrades. Slug: `attic-insulation`. Brand and service area: [[FACT-BRAND-IDENTITY]], [[FACT-SERVICE-AREA]]; naming: [[FACT-SVC-NAMES]].

In the launch set: all 26 services are in scope and launch ([[OWN-DEC-04]], [[OWN-DEC-33]]); reported capability is not proof of insurance, qualifications or equipment. Worker checklist: [[SOP-HI-07]] (active, pending competent review for production use, [[OWN-DEC-108]]). Pricing: each job is priced individually on its own estimate ([[FACT-PRICING-PER-JOB]]); the vault price list [[FACT-PRICING-HI-07]] is superseded. Tools and materials: [[FACT-INVENTORY-HI-07]]. Draft agreement clauses: [[FACT-AGREEMENT-HI-07]] (attorney review; customers approve the estimate terms of [[OWN-DEC-127]]).

Vault files: SOP `Standard Of Operations/sop-attic-insulation.md`; Pricing `Pricing/pricing-attic-insulation.md`; Inventory `Required inventory/inventory-attic-insulation.md`; Agreement `Service Agreements/contract-attic-insulation.md`; main plan `Main Plans/Home Improvement Business.md` ("🌬️ 7. Attic Insulation Upgrades").

- aliases (registry 04, label **FACT**): Plan heading "7. Attic Insulation Upgrades"; website headline "Slash Energy Bills and Keep Your Home Comfortable—Premium Blow-In Attic Insulation"; pricing title "Regional Pricing: Attic Insulation Upgrades"; inventory title "Inventory & Tools: Attic Insulation Upgrades"; agreement title "Service Agreement: Attic Insulation Upgrades" and scope phrase "blown-in thermal attic insulation upgrades"; SOP title "SOP: Attic Insulation Upgrades"; spec card "HI-07 — Attic Insulation Upgrades"; unit-name drift "joist bay" (agreement, SOP) vs "rafter vent channel bay" (pricing). Not an alias: the DW-03 wall-cavity batt insulation add-on is a separate scope (source: plan L92-93; pricing L1, L22; inventory L1; agreement L1, L4, L8; SOP L1, L6; DW-03 pricing L25)

## Customer description

No owner-approved customer description exists in the sources. Service-page content is drafted from the service files: staging shows the drafts, production shows only versions the owner approves and publishes ([[OWN-DEC-84]], amended 2026-10-12). Pages state the service's limits ([[OWN-DEC-51]]) and never invent prices, completion times, credentials or guarantees ([[RULE-NO-INVENTED-FACTS]]).

- customer-facing description (registry 04, label **FACT** + **PROPOSED**): Current: draft website copy only - "Existing Insulation Audit"; styrofoam soffit baffles "to guarantee" open ventilation; fire-rated boxing of recessed lights; blow-in fiberglass or cellulose to "(R-49 to R-60 standard)". Savings, "guarantee" and code-type claims are unsubstantiated (C-HI07-07, C-HI07-05). PROPOSED neutral summary for owner/legal approval: on-site attic assessment first, then blown-in insulation to the coverage and depth in the approved estimate, with ventilation baffles and approved fixture protection (source: plan L93-102)

Purpose (SOP section 1):

- Install blown-in loose-fill fiberglass or cellulose insulation in an attic to the coverage and depth in the approved estimate, with soffit ventilation baffles and approved fixture protection, after an on-site assessment (source: spec Appendix B "Attic Insulation Upgrades"; 04 HI-07 customer-facing description, PROPOSED neutral summary; original steps in section 12).
- This SOP makes no outcome, energy-saving, R-value or code-compliance promise (source: 31 section 3.5 rule 5).
- Proposed risk class: high-risk / specialist review, because of attic wiring and heat, fall-through and suspect existing material (source: 04 HI-07 status, PROPOSED; safety-liability-manager risk classification).

### Draft plan copy (`Main Plans/Home Improvement Business.md`; not approved, claims unverified)

*Target Headline for Website: Slash Energy Bills and Keep Your Home Comfortable—Premium Blow-In Attic Insulation*

If your home struggles to keep a consistent temperature between floors or your heating bills surge during freezing winters, your attic insulation is likely failing or insufficient. Heat naturally escapes upward through your ceiling panels into uninsulated attic spaces. Our professional attic upgrade uses advanced blow-in technology to install deep protective layers of premium fiberglass or cellulose insulation, locking the conditioned air inside your living zones.

- [ ] **Existing Insulation Audit:** We map out structural attic spaces, locating voids, settled insulation, and areas damaged by historical moisture leaks.
- [ ] **Soffit Baffle Installation:** We mount specialized styrofoam insulation baffles along the roof eaves to guarantee that fresh air ventilation channels stay completely unblocked.
- [ ] **Recessed Light Boxing:** We build protective fire-rated enclosures around attic recessed can lights to isolate hot fixtures from loose insulation elements.
- [ ] **Volumetric Blow-In Injection:** We operate commercial pneumatic blowing machinery to distribute deep, fluffy layers of cellulose or fiberglass to achieve your targeted regional insulation value (R-49 to R-60 standard).

Claims the main plan flags for this service (each `unverified`, not publishable until approved):

- "Slash Energy Bills and Keep Your Home Comfortable—Premium Blow-In Attic Insulation": Headline - Remove savings claim (Universal savings claim) (reviewer: Attorney)
- "to guarantee that fresh air ventilation channels stay completely unblocked": GUAR - Remove (reviewer: Attorney)
- "R-49 to R-60 standard": SAFE (code claim) - Hold (reviewer: Local code official)
- "We build protective fire-rated enclosures around attic recessed can lights": SAFE (fire, electrical) - Hold (reviewer: Licensed electrician + local code official)

## Request questions

- Guide 6.2 extra inputs / review needs: Area/access, condition, moisture reports, ventilation/material review.
- Spec intake (HI-07.INT): attic access, area, existing insulation, moisture/pest history, ventilation, recessed lights, wiring, target insulation plan, material type.
- Answers follow [[OWN-DEC-91]] and [[HH-SVC-03]]: units shown beside each measurement, approximate values allowed, and "I don't know" stays unknown, never zero, safe or approved. The sources set no per-service unit list.
- Estimate route: online when the details and photos are enough, a site visit when inspection or measurements are needed ([[OWN-DEC-99]], [[HH-SVC-04]]); a customer preference for a remote estimate never overrides a required site or qualification review.

## Included work (SOP section 2, "In scope")

- Protecting the floor under the attic hatch, installing soffit ventilation baffles and blowing loose-fill fiberglass or cellulose insulation to the target in the approved estimate, as section 12 describes (source: original steps; spec HI-07.QAC "target coverage/depth per approved plan").
- Fixture protection around recessed lights, only by a method a licensed electrician approves; the step is on HOLD (source: spec HI-07.SAF, HI-07.MAT; C-HI07-03).
- Confirming on site, for every job, the intake facts: attic access, area, existing insulation, moisture/pest history, ventilation, recessed lights, wiring, target insulation plan, material type (source: spec HI-07.INT; CX-005).

## Excluded work and limits

HandyHub never performs licensed or unsafe scope: [[FACT-SVC-EXCLUDED-SCOPE]]; suspected hazardous material: [[FACT-SVC-SUSPECTED-HAZMAT]]; access equipment: [[FACT-SVC-ACCESS-EQUIPMENT]]. Referred out at launch for this service: fixture boxing ([[FACT-SVC-REFER-OUT-TASKS]]).

### SOP section 2, "Out of scope"

- Not covered - pending review (C-HI07-V01): sealing electrical wire holes through top plates with the stocked "Fire-Rated Fireproofing Caulk & Foam Spray". No step, price line or agreement scope covers it. HUMAN REVIEW: licensed electrician and local building official.
- Not covered - pending review (C-HI07-08): wrapping "the access hatch room in plastic sheeting", which the agreement promises; the "Site Masking" step covers the floor under the hatch only. The owner decides the containment standard.
- Not covered - pending review (04 HI-07 quality checklist): hatch insulation and weatherstripping restoration; spec HI-07.QAC "access/weatherstripping restored" has no step.
- Not offered under this SOP unless the owner decides otherwise (04 HI-07 exclusions, PROPOSED): removal of existing insulation; air sealing; ventilation or roof changes; roof or rafter repair (no catalog service; referral policy is Q-30-15); mold or pest remediation; hatch replacement. Wall-cavity batt insulation belongs to DW-03, not this service.

### SOP section 2, "Do not perform"

Each entry: prohibited work - reason class - what to do instead (source). PROPOSED wording; HUMAN REVIEW: qualified safety professional and licensing reviewer (31 section 3.3).

1. Electrical, plumbing, gas or HVAC work outside the approved scope or requiring a licensed trade - licensed trade - stop and escalate (source: spec START-011 "unapproved electrical/plumbing/gas/structural scope"; master section 1.3).
2. Structural work, meaning cutting, removing, sistering or adding load-bearing members, ledgers, footings or framing, unless it is in the approved scope with the required qualified review - structural - stop and escalate (source: spec START-011; master section 1.3).
3. Suspected asbestos / lead paint / mold: stop and escalate (source: spec START-011). Do not disturb suspect material, including unknown existing insulation - hazardous material ("Unknown is not safe", owner facts 2026-10-02).
4. Work that is not in the approved scope or an approved change order - out of scope - record the customer's request instead (source: spec JOB-005, JOB-010, FIN-008, AT-033).
5. Working at height or using access equipment, including the hatch ladder and joist travel, beyond the approved height and access policy - policy - stop and escalate (source: HI-06.SAF "beyond approved height/access policy"; DW-04.TLS "scaffolds/stilts only under approved policy").
6. Mixing or sequencing chemicals in any way the approved step and the product SDS do not allow - hazardous material - stop and escalate (source: 31 section 3.3, from CL-01.SAF "never mix incompatible chemicals").
7. Recording, photographing or sending customer passwords, master codes or site access codes outside the app's secured fields - policy - use the app's secured fields only (source: spec COM-002; owner facts 2026-10-02; 27 AUTH-009).
8. Promising results, warranties, safety, health or code compliance to the customer, including R-value, code-target or energy-saving outcomes - policy - refer the question to the owner (source: master sections 1.4, 17 and 29; C-HI07-05).
9. Covering unsafe fixtures or vents - licensed trade and fire hazard - stop, keep insulation out of the clearance zone, escalate (source: spec HI-07.SAF "do not cover unsafe fixtures/vents"; C-HI07-03).
10. Electrical, combustion, flue or gas-appliance work - licensed trade - stop and refer to a licensed electrician or an HVAC or gas professional (source: 31 section 10; spec HI-07.HAZ "electrical", "combustion/ventilation issues").
11. Removing existing insulation - out of scope and possible hazardous material - stop and escalate (source: 31 section 10).
12. Mold or pest remediation - hazardous material and out of scope - stop and refer (source: 31 section 10; spec HI-07.HAZ "pests/mold").

- exclusions (registry 04, label **FACT** + **GAP** + **PROPOSED**): Only implied: blown insulation "cannot fix active roof leaks". Not stated: removal of existing insulation; air sealing/fire-stopping of penetrations; electrical or fixture work; ventilation/roof changes; roof/rafter repair (no catalog service or referral path, X-05); mold/pest remediation; suspect hazardous material; hatch replacement. Boundary (PROPOSED): wall-cavity batt insulation stays in DW-03; one shared insulation handling/PPE module for HI-07 and DW-03 (source: agreement §2 L12; inventory L7; DW-03 pricing L25)

## Hazards and human-review flags

- Spec hazards (HI-07.HAZ): heat stress, low clearance, dust/fibers, electrical, falls through ceiling, pests/mold, combustion/ventilation issues.
- Spec stop-work guidance (HI-07.SAF): pre-inspect moisture/electrical/combustion concerns; do not cover unsafe fixtures/vents; maintain soffit ventilation; use respiratory/skin protection; stop on mold, active leak or unsafe wiring.
- permit/license flags (registry 04, label **OPEN QUESTION**): None recorded; unknown applicability must not default to "no permit". OPEN QUESTIONS per KY/IN municipality: permit/inspection for retrofit insulation; whether any R-value target, depth-marker or certificate rule applies (agreement and SOP claim "code" targets without a source); possible insulation-advertising rules for savings claims (unverified); fixture protection and combustion venting stay licensed-trade scope on the "Do not perform" list; insurance coverage for attic work unconfirmed. HUMAN REVIEW: KY/IN attorney, local building department, licensed electrician, HVAC/gas professional, insurance broker (source: agreement §1 L6-7; SOP L8; spec HND-005, START-010, UXE-010; operating-context L4-5, L21; risk-triage playbook L13)
- Reviewers named in the vault files' front matter: qualified safety reviewer; owner; Spanish translation reviewer; licensed trade professional (electrician; HVAC or gas); accredited asbestos inspector; local building official (code target wording); CPA (tax treatment); licensed electrician (can-light shield line); safety reviewer (PPE/hazmat); attorney licensed in KY/IN; insurance broker; local building department (code claims); qualified safety professional. Boundaries: [[RULE-HUMAN-REVIEW]].

### Required worker qualifications (SOP section 4)

TBD — requires review by safety-liability-manager and a qualified person; owner to approve.

- No company qualification policy exists yet (source: 31 section 3.1, section 4 row "owner policy (none yet: GAP)").
- Qualification tags and training for attic travel and fall-through, heat stress, respiratory protection and blower operation are decided by the qualified safety professional (source: spec HI-07.HAZ; inventory file; spec SCH-003 "worker capability/qualification tags").
- Two-person task: one person feeds the hopper outside while the attic technician directs the hose, so the job needs both initial employees (source: original "Pneumatic Blow-In Application" step; 04 HI-07 labor assumptions; job-planner playbook "Do not treat the two-person team as two independent crews when the job needs both.").
- No licensed task is performed under this SOP; electrical, combustion, flue and gas work go to licensed trades (section 2, Do not perform).

### Hazards (SOP section 9)

Seeded from the spec card and the verified findings; every control is pending qualified review, and controls are listed in hierarchy order (eliminate, substitute, engineer, administrative, PPE). No limit, distance or temperature is set here.

| Hazard | Where in this SOP | Controls (pending qualified review) | PPE | Stop-work trigger | Escalation and reviewer | Related finding (severity) |
|---|---|---|---|---|---|---|
| Heat stress (spec HI-07.HAZ) | Every attic step | Administrative: a heat plan (work/rest, hydration, scheduling) set by the reviewer (02 C-HI07-02; X-27) | Section 6 | "severe weather or unsafe heat or cold" (section 10 block) | Qualified safety professional | C-HI07-02 (critical); X-27 (high) |
| Low clearance (spec HI-07.HAZ) | "Crawl into the low attic perimeter edges" (baffle step) | Controls set by the reviewer | Head protection pending review (section 6) | Unsafe condition (section 10 block) | Qualified safety professional | C-HI07-02 (critical) |
| Falls through ceiling (spec HI-07.HAZ) | Every step that moves across joists | Engineering: walk boards or a joist-travel rule under an approved height and access policy, which does not exist yet (02 G-005; X-12) | Set by the reviewer | No approved access means: the attic steps stay on hold (31 section 8.4) | Qualified safety professional | C-HI07-02 (critical); X-12 (high) |
| Dust and fibers (spec HI-07.HAZ) | Blow-in, baffle placement, hatch area | Engineering: containment under the hatch (original "Site Masking" step); administrative: cleanup and living-space check (sections 13 and 14) | Respiratory and skin protection, coveralls (section 6) | Unsafe condition; suspected hazardous-material exposure is an incident (spec JOB-008) | Qualified safety professional | C-HI07-02 (critical) |
| Electrical: wiring, junction boxes, recessed fixtures (spec HI-07.HAZ) | Baffle and blow-in work; "Fixtures Isolation" | Eliminate: no electrical work (section 2); pre-work inspection and "do not cover unsafe fixtures/vents" (spec HI-07.SAF); fixture-protection step on HOLD (C-HI07-03) | Section 6 | "stop on ... unsafe wiring" (spec HI-07.SAF) | Licensed electrician | C-HI07-03 (critical); C-HI07-01 (critical) |
| Combustion and ventilation issues: flues, vents, gas appliances (spec HI-07.HAZ) | Blow-in near flues, vents or appliances | Eliminate: no combustion, flue or gas-appliance work (section 2); pre-work inspection of combustion concerns; do not cover vents; maintain soffit ventilation (spec HI-07.SAF) | Section 6 | Unapproved gas or HVAC scope (spec START-011); a combustion concern found at inspection | HVAC or gas professional | C-HI07-01 (critical) |
| Pests and mold (spec HI-07.HAZ) | Existing insulation, sheathing, rafters | Eliminate: no mold or pest remediation (section 2); pre-work inspection | Section 6 | "stop on mold" (spec HI-07.SAF); treated as critical until the company mold definition exists (31 section 8.4) | Qualified mold assessor or industrial hygienist; qualified safety professional | C-HI07-01 (critical); X-06 (high) |
| Suspect existing insulation, possible asbestos (for example vermiculite) | Baffle placement and blow-in over existing insulation | Eliminate: do not disturb; no HandyHub sampling (31 section 7.2) | Not a PPE matter: stop | Suspect hazardous material (spec START-011) | Accredited asbestos inspector | C-HI07-01 (critical); X-13 (high) |
| Active leaks, wet or rotted wood | Roof deck and rafters seen during the inspection | Do not insulate over an active leak; record with photos and escalate; roof or rafter repair is outside the catalog (referral policy Q-30-15) | Section 6 | "stop on ... active leak" (spec HI-07.SAF) | Owner (referral); qualified safety professional | C-HI07-01 (critical) |
| Older painted surfaces at the hatch or trim, only if they are disturbed | Hatch or trim work outside this SOP's steps | Screen the build year; if it is unknown or older than the threshold the reviewer sets, no sanding, scraping or cutting until a qualified person records a disposition (31 sections 5.8 and 7.2; Q-31-07) | Not a PPE matter: stop | Suspect lead paint (spec START-011) | EPA RRP-certified renovator | X-13 (high) |
| Blowing machine and hose (inventory) | "Pneumatic Blow-In Application" | Operate, inspect and maintain per the blower manufacturer's instructions; hopper-to-attic communication means pending review (02 C-HI07-02) | Section 6 | Tool or equipment failure (spec JOB-008); any unsafe condition | Qualified safety professional | C-HI07-02 (critical) |
| Chemical products: fire-rated caulk and foam, insulation products (inventory) | No step uses the caulk and foam (C-HI07-V01) | SDS register; a product without a reviewed SDS is not carried to a job (29 section 8.3, PROPOSED) | Per the reviewed SDS | Unsafe condition | Qualified safety professional | C-HI07-V01 (medium) |
| Ladder and hatch access | Hatch entry ("attic hatch entry") | Access equipment only under an approved height and access policy (02 G-005) | Set by the reviewer | No approved access means: hold | Qualified safety professional | X-12 (high) |
| Manual handling of insulation bags and the blower | Loading the hopper; moving the blower | Controls set by the reviewer (spec BRF-008 "manual handling") | Section 6 | Unsafe condition | Qualified safety professional | None registered |
| Occupants, children and pets | Hatch area inside the home, and any route the hose takes through the home (ASSUMPTION) | Keep them away from active work; occupant and pet module pending review (X-11; 31 section 5.8) | Not applicable | Unsafe condition for occupants or pets; aggressive occupant or animal (spec START-011) | Qualified safety professional | X-11 (high) |

## Warranty or callback

- warranty or callback policy (registry 04, label **GAP** + **OPEN QUESTION**): None in any HI-07 file; no warranty may be added without an owner-approved policy. Return visits (e.g., settling or coverage disputes) are classified under QA-010 and linked to the original job per CX-007 (source: spec QA-010, CX-007; pricing, inventory, agreement and SOP silent)
- Governed now by: the 90-day workmanship warranty of [[FACT-WARRANTY]] ([[OWN-DEC-135]]), counted from the reviewed completion date; a claim opens a case with return-visit punch items ([[HH-QA-07]]). No warranty exclusions are defined; any come only from attorney review ([[OQ-ATTORNEY-TERMS]]).
