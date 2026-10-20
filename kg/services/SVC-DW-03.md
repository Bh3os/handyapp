---
id: SVC-DW-03
type: service
title: "Remodeling & Home Additions"
status: active
area: business
links:
  decided_by: ["[[OWN-DEC-04]]", "[[OWN-DEC-33]]", "[[OWN-DEC-84]]", "[[OWN-DEC-51]]", "[[OWN-DEC-102]]", "[[OWN-DEC-108]]", "[[OWN-DEC-66]]"]
  uses: ["[[SOP-DW-03]]", "[[FACT-INVENTORY-DW-03]]", "[[FACT-PRICING-PER-JOB]]", "[[FACT-SVC-EXCLUDED-SCOPE]]"]
  constrained_by: ["[[RULE-HUMAN-REVIEW]]", "[[RULE-SAFETY-GATES]]", "[[RULE-NO-INVENTED-FACTS]]", "[[FACT-SVC-EXCLUDED-SCOPE]]", "[[FACT-SVC-SUSPECTED-HAZMAT]]", "[[FACT-SVC-ACCESS-EQUIPMENT]]", "[[FACT-SVC-HOME-AGE-LIMITS]]"]
  part_of: ["[[C01]]", "[[C02]]"]
  related: ["[[FACT-PRICING-DW-03]]", "[[FACT-AGREEMENT-DW-03]]", "[[FACT-SERVICE-AREA]]", "[[FACT-BRAND-IDENTITY]]", "[[FACT-SVC-NAMES]]", "[[HH-SVC-01]]", "[[HH-SVC-02]]", "[[HH-SVC-03]]", "[[HH-SVC-04]]", "[[OWN-DEC-91]]", "[[OWN-DEC-99]]", "[[OWN-DEC-127]]"]
source: "guide 6.2; vault 04-service-registry DW-03; spec section 17 DW-03; Standard Of Operations/sop drywall-remodeling.md; Main Plans/Dry Wall Business.md"
---
Category: Drywall. Catalog name (guide 6.2): Remodeling & Home Additions. Canonical name (spec Appendix B): Residential Remodeling & Home Additions. Slug: `drywall-remodeling`. Brand and service area: [[FACT-BRAND-IDENTITY]], [[FACT-SERVICE-AREA]]; naming: [[FACT-SVC-NAMES]].

In the launch set: all 26 services are in scope and launch ([[OWN-DEC-04]], [[OWN-DEC-33]]); reported capability is not proof of insurance, qualifications or equipment. Worker checklist: [[SOP-DW-03]] (active, pending competent review for production use, [[OWN-DEC-108]]). Pricing: each job is priced individually on its own estimate ([[FACT-PRICING-PER-JOB]]); the vault price list [[FACT-PRICING-DW-03]] is superseded. Tools and materials: [[FACT-INVENTORY-DW-03]]. Draft agreement clauses: [[FACT-AGREEMENT-DW-03]] (attorney review; customers approve the estimate terms of [[OWN-DEC-127]]).

Vault files: SOP `Standard Of Operations/sop drywall-remodeling.md`; Pricing `Pricing/pricing-drywall-remodeling.md`; Inventory `Required inventory/inventory-drywall-remodeling.md`; Agreement `Service Agreements/contract-drywall-remodeling.md`; main plan `Main Plans/Dry Wall Business.md` ("🔨 3. Residential Remodeling & Home Additions").

- aliases (registry 04, label **FACT**): plan heading "3. Residential Remodeling & Home Additions"; website headline "Custom Drywall Installations for Renovations & Extensions"; plan body "complete kitchen/bathroom gut renovation"; pricing title "Regional Pricing: Residential Remodeling & Additions"; inventory title "Inventory & Tools: Residential Remodeling & Additions", description "structural wall partitions"; agreement title "Service Agreement: Residential Remodeling & Additions", scope phrase "custom residential renovations, basement build-outs, or room additions"; agreement specification reference `pricing-drywall-remodeling.md` (internal pricing file, C-DW03-07); SOP title "SOP: Residential Remodeling & Structural Additions" (scope-changing drift, C-DW03-14); SOP file `sop drywall-remodeling.md` (space); party placeholder `[Your Drywall Company Name]` (source: plan L36-40; pricing L1; inventory L1, L3; agreement L1, L4, L7; SOP L1; MOC Dashboard)

## Customer description

No owner-approved customer description exists in the sources. Service-page content is drafted from the service files: staging shows the drafts, production shows only versions the owner approves and publishes ([[OWN-DEC-84]], amended 2026-10-12). Pages state the service's limits ([[OWN-DEC-51]]) and never invent prices, completion times, credentials or guarantees ([[RULE-NO-INVENTED-FACTS]]).

- customer-facing description (registry 04, label **FACT** + **PROPOSED**): Draft plan copy (unapproved): basement theaters, room division, "complete kitchen/bathroom gut renovation"; claims "straight corners, square walls, and perfectly level ceilings", boards that "actively prevent mold growth behind the tile lines" and "eliminating joint shifting or structural settling cracks" (C-DW03-09). PROPOSED neutral text: framing (non-structural unless the owner decides otherwise), board hanging, taping and finishing for owner-contracted renovations, basement finishing and additions, after required permits and inspections; licensed electrical, plumbing, HVAC and structural work by others unless separately approved (source: plan L37-46)

Purpose (SOP section 1):

A professional workflow guiding crews through framing extensions, installing technical panels, and integrating new drywall walls smoothly with old existing residential properties.

- This SOP covers how HandyHub workers lay out and fasten partition framing, select, hang and finish drywall, and blend new drywall into existing walls for **DW-03 Residential Remodeling & Home Additions**, only after the preconditions in section 3 and the holds in section 12 clear (source: spec Appendix B name; 04 DW-03 customer-facing description, PROPOSED neutral summary; original steps in section 12).
- It states how the work is done and promises no flatness, crack-free, mold-prevention, code-compliance or structural outcome to the customer (source: 31 section 3.5 rule 5; C-DW03-09).
- Proposed risk class, pending qualified safety review: high-risk / specialist review for framing in additions, headers or any load-bearing change, work at utility interfaces, tie-ins and demolition in older homes, and fire-rated assemblies; elevated for non-structural partitions and board hanging with lifts or stilts (source: safety-liability-manager risk classification; 04 DW-03 active/inactive status, PROPOSED).

> FLAG (C-DW03-14, C-DW03-01): the H1 says "Structural Additions" and the intro says "framing extensions", while the canonical name is "Residential Remodeling & Home Additions". "Structural work" is a hazard on the spec card (DW-03.HAZ), not an offered scope: structural framing is not performed under this SOP unless the owner decides otherwise and a structural engineer or building official approves it (section 2, Do not perform). The H1 and the intro stay verbatim; a title change is made only in a new SOP version (31 section 5). HUMAN REVIEW: owner; structural engineer or building official.

### Draft plan copy (`Main Plans/Dry Wall Business.md`; not approved, claims unverified)

*Target Headline for Website: Custom Drywall Installations for Renovations & Extensions*

Taking on a home remodel—like turning an unfinished, cold basement into a vibrant home theater, dividing a massive room into separate spaces, or tackling a complete kitchen/bathroom gut renovation—requires precise framing and clean drywall installation. Our residential remodeling service bridges the complex gap between old structural elements and crisp, new drywall additions, providing straight corners, square walls, and perfectly level ceilings.

* **Custom Wood/Metal Framing:** We build precise wood or steel stud wall partitions based on your new layout designs, incorporating true-square headers and door frames.
* **Moisture & Mold Protection:** We install dense, moisture-resistant "Greenboard" or ultra-protective "Purpleboard" panels in bathrooms, kitchens, and laundry rooms to actively prevent mold growth behind the tile lines.
* **Architectural Tie-Ins:** We expertly tape, mud, and feather structural joints where your new home addition connects to older lath-and-plaster or existing drywall structures, eliminating joint shifting or structural settling cracks.
* **Corner Bead Defending:** We fit heavy-duty steel or impact-resistant composite corner beads along all exposed wall edges to ensure impact protection against daily household traffic.

Claims the main plan flags for this service (each `unverified`, not publishable until approved):

- "Custom Drywall Installations for Renovations & Extensions": Headline - Candidate; limit body to drywall scope (Body implies general-contractor scope and permits) (reviewer: Legal-compliance (licensing, permits))
- "tackling a complete kitchen/bathroom gut renovation": SCOPE, SAFE - Limit copy to drywall scope (reviewer: Legal-compliance (licensing, permits))
- "providing straight corners, square walls, and perfectly level ceilings": GUAR - Remove "perfectly" (reviewer: Attorney)
- "incorporating true-square headers and door frames": SAFE (structural) - Hold (reviewer: Structural engineer + legal-compliance (permits))
- "to actively prevent mold growth behind the tile lines": GUAR, HEALTH - Remove (reviewer: Attorney + board and tile manufacturer instructions)

## Request questions

- Guide 6.2 extra inputs / review needs: Plans/areas, demolition and trade dependencies, scope/permit review.
- Spec intake (DW-03.INT): approved design/scope, framing locations, utilities, permits/inspections status, drywall type, moisture/fire requirements, finish level.
- Answers follow [[OWN-DEC-91]] and [[HH-SVC-03]]: units shown beside each measurement, approximate values allowed, and "I don't know" stays unknown, never zero, safe or approved. The sources set no per-service unit list.
- Estimate route: online when the details and photos are enough, a site visit when inspection or measurements are needed ([[OWN-DEC-99]], [[HH-SVC-04]]); a customer preference for a remote estimate never overrides a required site or qualification review.
- Service conditions: [[FACT-SVC-HOME-AGE-LIMITS]] (home-age limits apply to this service).

## Included work (SOP section 2, "In scope")

- Phase 1 as written in section 12: layout with chalk lines and a laser level, fastening top and bottom plates, and installing solid wood blocking for later mounted items, for non-structural partitions only and after the structural, permit, old-property and access holds in section 12 clear (source: original Phase 1; agreement "Project Specifications" clause "Company will install framing"; spec DW-03.INT "framing locations").
- Phases 2 to 5 as written in section 12: board selection and hanging, taping and corner beads, blending tie-ins, sanding, the light test and site cleanup (source: original Phases 2 to 5; agreement "technical gypsum panels, metal corner beads, and finish seams"; spec DW-03.MAT).
- Confirming on site, for every job, the intake facts: approved design/scope, framing locations, utilities, permits/inspections status, drywall type, moisture/fire requirements, finish level (source: spec DW-03.INT; CX-005).

## Excluded work and limits

HandyHub never performs licensed or unsafe scope: [[FACT-SVC-EXCLUDED-SCOPE]]; suspected hazardous material: [[FACT-SVC-SUSPECTED-HAZMAT]]; access equipment: [[FACT-SVC-ACCESS-EQUIPMENT]].

### SOP section 2, "Out of scope"

- Not covered - pending review (C-DW03-03): installing the "clear plastic isolation curtains" that the agreement's "Dust Containment" clause promises; no step sets up containment. The owner decides the containment standard with the qualified safety professional; until then the dust controls in sections 9 and 11 stay pending review.
- Not covered - pending review (C-DW03-04): insulation, which pricing sells as the "Insulation Install" add-on and the agreement offers as "insulation [ ]"; no step, material or PPE exists. It stays separate from HI-07 Attic Insulation. Whether DW-03 includes insulation is an owner decision; whether an inspection is required before cover is a question for the building official.
- Not covered - pending review (C-DW03-02): demolition and gutting, which pricing sells as "Old Drywall Demolition / Gutting"; no step covers demolition, hazardous-material screening or disposal, so demolition stays on hold until a hazardous-material policy and a reviewed demolition procedure exist.
- Not offered under this SOP unless the owner decides otherwise (04 DW-03 exclusions, PROPOSED): electrical, plumbing and HVAC work; structural engineering, headers and load-bearing changes; permit applications and fees (responsibility undecided, C-DW03-01); painting; hazardous-material abatement; mold remediation. Work for a general contractor or developer belongs to DW-04 under a reviewed subcontract, not to DW-03 (02 section 5.2, PROPOSED boundary).

### SOP section 2, "Do not perform"

Each entry: prohibited work - reason class - what to do instead (source). PROPOSED wording; HUMAN REVIEW: qualified safety professional and licensing reviewer (31 section 3.3).

1. Electrical, plumbing, gas or HVAC work outside the approved scope or requiring a licensed trade, including relocating any utility exposed by framing or a gut renovation - licensed trade - stop and escalate; relocations only by licensed trades (source: spec START-011 "unapproved electrical/plumbing/gas/structural scope"; master section 1.3; 31 section 10 DW-03).
2. Structural work, meaning cutting, removing, sistering or adding load-bearing members, ledgers, footings or framing, unless it is in the approved scope with the required qualified review - structural - stop and escalate (source: spec START-011; master section 1.3).
3. Suspected asbestos / lead paint / mold: stop and escalate (source: spec START-011). Do not cut, drill, sand or remove painted surfaces, old plaster or other suspect material in a pre-1978 or unknown-age home until a qualified person records a disposition - hazardous material ("Unknown is not safe", owner facts 2026-10-02; 31 sections 7.2 and 10).
4. Work that is not in the approved scope or an approved change order - out of scope - record the customer's request instead (source: spec JOB-005, JOB-010, FIN-008, AT-033).
5. Working at height or using access equipment, including stilts, the panel lift and ladders, beyond the approved height and access policy - policy - stop and escalate (source: HI-06.SAF "beyond approved height/access policy"; DW-04.TLS "scaffolds/stilts only under approved policy").
6. Mixing or sequencing chemicals in any way the approved step and the product SDS do not allow, including joint compounds - hazardous material - stop and escalate (source: 31 section 3.3, from CL-01.SAF "never mix incompatible chemicals").
7. Recording, photographing or sending customer passwords, master codes or site access codes outside the app's secured fields - policy - use the app's secured fields only (source: spec COM-002; owner facts 2026-10-02; 27 AUTH-009).
8. Promising results, warranties, safety, health or code compliance to the customer, including flatness, crack-free joints, mold prevention or code outcomes - policy - refer the question to the owner (source: master sections 1.4, 17 and 29; C-DW03-09).
9. Concealing unapproved utility work - licensed trade and inspection - do not hang board over it; stop and escalate (source: spec DW-03.SAF "do not conceal unapproved utility work").
10. Structural framing changes without approved plans, including headers, load-bearing walls and addition framing - structural - HOLD for a structural engineer or building official (source: 31 section 10 DW-03; C-DW03-01).
11. Demolition or gutting before a hazardous-material policy exists - hazardous material - do not quote or start; escalate (source: 31 section 10 DW-03; C-DW03-02).
12. Covering work that needs an inspection before the inspection is signed off - permit and inspection - stop and escalate (source: spec DW-03.SAF "inspections before concealment where required"; 31 section 8.3 rule 2).

- exclusions (registry 04, label **GAP** + **PROPOSED**): GAP: none listed; the agreement has only a blend limitation (§1 L8) and a dust release (§2 L12; HUMAN REVIEW: attorney). Missing: electrical/plumbing/HVAC work, structural engineering, permit fees, painting, hazardous-material abatement, mold remediation (EST-003 requires explicit exclusions). PROPOSED boundary (owner + attorney + building official decide): DW-03 when HandyHub contracts directly with the property owner, DW-04 only under a reviewed GC/developer subcontract; framing only in DW-03 behind the permit gate; insulation kept separate from HI-07 (source: agreement L8, L12; spec EST-003; registry boundary rules)

## Hazards and human-review flags

- Spec hazards (DW-03.HAZ): structural work, electrical/plumbing/HVAC interfaces, heavy panels, lifts, dust, falls, fire/moisture assemblies.
- Spec stop-work guidance (DW-03.SAF): verify approved plans/permit dependencies; do not conceal unapproved utility work; use correct board/system; lifting/team controls; inspections before concealment where required.
- permit/license flags (registry 04, label **OPEN QUESTION** + **GAP**): Spec requires permits/inspections status at intake and inspections before concealment; no DW-03 file mentions permits, licenses or inspections. OPEN QUESTION (HUMAN REVIEW): building permits for framing, basement finishing, additions and headers in each KY/IN municipality and who obtains them (building department, attorney); inspections required before concealment (building official); energy-code fit of the insulation add-on and fire separation for garage/boiler-room assemblies (building official); contractor registration (legal-compliance-administrator + attorney); whether EPA RRP applies to paint disturbed in pre-1978 homes; licensed trades for any utility relocation (source: spec DW-03.INT, DW-03.SAF, START-010, HND-005; owner facts; risk-triage playbook)
- Reviewers named in the vault files' front matter: qualified safety reviewer; owner; Spanish translation reviewer; licensed trade professional (electrical, plumbing and HVAC interfaces); structural engineer or building official (framing, headers, additions, inspections); accredited asbestos inspector; EPA RRP-certified renovator; CPA (tax treatment); attorney licensed in KY/IN (the agreement names this file as its specification); EPA RRP-certified renovator and accredited asbestos inspector (demolition line); safety reviewer (PPE/hazmat); structural engineer or building official (structural fasteners and anchors); attorney licensed in KY/IN; insurance broker; structural engineer or building official; qualified safety professional (generator use); CPA (draw schedule). Boundaries: [[RULE-HUMAN-REVIEW]].

### Required worker qualifications (SOP section 4)

TBD — requires review by safety-liability-manager and a qualified person; owner to approve.

- No company qualification policy exists yet (source: 31 section 3.1, section 4 row "owner policy (none yet: GAP)"; 02 G-059 "no worker qualifications (framing, stilts, lifts)").
- Qualification tags and training for framing, stilt use, panel-lift operation, team lifting and any concrete-anchoring tool are decided by the qualified safety professional (source: spec SCH-003 "worker capability/qualification tags"; C-DW03-08; 04 DW-03 hazards "concrete anchoring into basement slabs").
- Two-person tasks: ceiling panels and long sheets lifted as a team need both initial employees on the same task (source: spec DW-03.SAF "lifting/team controls"; 04 DW-03 labor assumptions; job-planner playbook "Do not treat the two-person team as two independent crews when the job needs both.").
- No licensed or specialist task is performed under this SOP: utility relocations, structural design or approval, and hazardous-material testing or abatement go to the named professionals (section 2, Do not perform).

### Hazards (SOP section 9)

Seeded from the spec card and the verified findings; every control is pending qualified review, and controls are listed in hierarchy order (eliminate, substitute, engineer, administrative, PPE). No limit, distance, load or height is set here.

| Hazard | Where in this SOP | Controls (pending qualified review) | PPE | Stop-work trigger | Escalation and reviewer | Related finding (severity) |
|---|---|---|---|---|---|---|
| Structural work (spec DW-03.HAZ) | Phase 1 framing, especially headers, load-bearing walls and additions | Eliminate: no structural change under this SOP without approved plans and a structural engineer's or building official's approval (precondition HOLD before Phase 1) | Not a PPE matter: hold | Unapproved structural scope (spec START-011) | Structural engineer or building official | C-DW03-01 (critical) |
| Electrical, plumbing and HVAC interfaces (spec DW-03.HAZ) | Fastening plates and blocking; hanging over framing; any cut into existing walls or ceilings; boiler rooms | Eliminate: no utility work or relocation (section 2); identify utilities relevant to the task on arrival (spec APXA-002); isolate-verify-restore module pending (X-07; 31 section 5.8); never conceal unapproved utility work (spec DW-03.SAF) | Section 6 | Unapproved utility work or an unknown service in the work area (spec START-011, DW-03.SAF) | Licensed electrician, plumber or HVAC professional | C-DW03-01 (critical); X-07 (high) |
| Heavy panels and team lifting (spec DW-03.HAZ "heavy panels") | "Hanging Sequence" (ceiling panels first); moving sheets | Engineering: the panel lift per its manufacturer; administrative: team-lifting controls set by the reviewer (spec DW-03.SAF "lifting/team controls"); both on HOLD until approved | Section 6 | Unsafe condition | Qualified safety professional | C-DW03-08 (high) |
| Lifts (spec DW-03.HAZ "lifts") | Ceiling hanging with the panel lift | Use only per the lift manufacturer's instructions, with a pre-use check and a qualification tag set by the reviewer (spec SCH-003) | Section 6 | Equipment defect or unsafe set-up; tool or equipment failure (spec JOB-008) | Qualified safety professional | C-DW03-08 (high) |
| Falls: ladders, stilts and other access equipment (spec DW-03.HAZ "falls") | Ceiling layout and top plates in Phase 1; high-wall and ceiling hanging, taping and sanding | Access equipment only under an approved height and access policy, which does not exist yet (02 G-005); until then the affected work stays on HOLD (31 section 8.4 rule 4) | Set by the reviewer | No approved access means: hold | Qualified safety professional | C-DW03-08 (high); X-12 (high) |
| Dust (spec DW-03.HAZ "dust") | Cutting, "Edge Sanding", "Site Cleanup", any demolition | Engineering: containment and dust capture set by the reviewer; the curtains the agreement promises are not covered yet (C-DW03-03); administrative: cleanup in section 14; the vacuum's dust class set by the reviewer | Respiratory and eye protection pending review (section 6) | Unsafe condition; suspected hazardous-material exposure is an incident (spec JOB-008) | Qualified safety professional | C-DW03-03 (high) |
| Fire and moisture assemblies (spec DW-03.HAZ "fire/moisture assemblies") | "Board Allocation Map": Type X for garage ceilings and boiler rooms; moisture-resistant board in wet areas | Board and system per the approved plans, any listed assembly and the board manufacturer (spec DW-03.SAF "use correct board/system"); fire separation and wet-area suitability confirmed by the building official and the manufacturer | Not a PPE matter | Board or system on site does not match the approved plans (spec START-011 "any material mismatch") | Building official; board manufacturer's instructions | None registered (04 DW-03 permit/license flags) |
| Suspect lead paint and asbestos in older homes (spec section 17 Drywall intro "suspect hazardous materials") | "The Old-to-New Merge" tie-in to horsehair plaster; any cut into existing finishes; demolition (sold in pricing) | Eliminate: do not disturb until a qualified person records a disposition (HOLD lines before Phase 1 and before the tie-in step); no HandyHub sampling until the testing role is defined (31 section 7.2) | Not a PPE matter: stop | Suspect hazardous material (spec START-011) | EPA RRP-certified renovator; accredited asbestos inspector | C-DW03-02 (critical); X-13 (high) |
| Moisture and mold (spec section 17 Drywall intro "moisture, mold") | Wet rooms, basements and walls opened in a gut renovation | Eliminate: no mold remediation (section 2); stop on suspected mold growth or an active leak; company mold definition pending (Q-31-10) | Not a PPE matter: stop | Suspected mold or moisture (section 10 block) | Qualified mold assessor or industrial hygienist | X-06 (high) |
| Concrete anchoring into slabs | "Fastening Tracks" ("concrete anchors (for basement floor slabs)") | Tool type, operation and operator qualification set by the owner and the reviewer; anchors only per the approved plans and the anchor manufacturer, on the structural HOLD | Section 6 | Unsafe condition; tool qualification not recorded | Qualified safety professional | C-DW03-01 (critical) |
| Portable generator (agreement "Active Utilities Mandatory" clause) | Only if utilities are disconnected | Not used until the owner decides the utilities policy and a qualified safety professional approves generator use and placement (carbon monoxide) | Not a PPE matter | Unsafe condition | Qualified safety professional | C-DW03-V01 (medium) |
| Chemical products: joint compounds (steps; proposed inventory) | Phases 3 and 4 | SDS register; a product without a reviewed SDS is not carried to a job (29 section 8.3, PROPOSED) | Per the reviewed SDS | Unsafe condition | Qualified safety professional | None registered (02 G-008) |
| Cutting and power tools (spec DW-03.TLS "framing tools, saws, screw guns") | Cutting board and framing; fastening | Tool use per the manufacturer; guards and pre-use checks pending review | Section 6 | Tool or equipment failure (spec JOB-008) | Qualified safety professional | None registered |
| Occupants, children and pets | Work areas inside an occupied home | Keep them away from active work, lifts, cutting and sanding; occupant and pet module pending review (X-11; 31 section 5.8) | Not applicable | Unsafe condition for occupants or pets; aggressive occupant or animal (spec START-011) | Qualified safety professional | X-11 (high) |
| Emergencies and first response | Every step | Vehicle safety kit pending definition (X-10); emergency contacts are owner decisions (Q-31-05) | Not applicable | Injury or emergency (section 19) | Qualified safety professional | X-10 (high) |

## Warranty or callback

- warranty or callback policy (registry 04, label **GAP** + **OPEN QUESTION**): No warranty or callback policy and none is proposed here; plan promises "perfectly level ceilings" and "eliminating joint shifting or structural settling cracks" while the agreement hedges that walls "blend gradually to simulate visual flatness" (C-DW03-09; HUMAN REVIEW: attorney). Return visits classified per CX-007 and QA-010 (source: plan L40, L45; agreement L8; spec CX-007, QA-010)
- Governed now by: the 90-day workmanship warranty of [[FACT-WARRANTY]] ([[OWN-DEC-135]]), counted from the reviewed completion date; a claim opens a case with return-visit punch items ([[HH-QA-07]]). No warranty exclusions are defined; any come only from attorney review ([[OQ-ATTORNEY-TERMS]]).
