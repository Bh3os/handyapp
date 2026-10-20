---
id: SVC-DW-04
type: service
title: "Residential New Construction"
status: active
area: business
links:
  decided_by: ["[[OWN-DEC-04]]", "[[OWN-DEC-33]]", "[[OWN-DEC-84]]", "[[OWN-DEC-51]]", "[[OWN-DEC-102]]", "[[OWN-DEC-108]]"]
  uses: ["[[SOP-DW-04]]", "[[FACT-INVENTORY-DW-04]]", "[[FACT-PRICING-PER-JOB]]", "[[FACT-SVC-EXCLUDED-SCOPE]]"]
  constrained_by: ["[[RULE-HUMAN-REVIEW]]", "[[RULE-SAFETY-GATES]]", "[[RULE-NO-INVENTED-FACTS]]", "[[FACT-SVC-EXCLUDED-SCOPE]]", "[[FACT-SVC-SUSPECTED-HAZMAT]]", "[[FACT-SVC-ACCESS-EQUIPMENT]]", "[[FACT-SVC-RESIDENTIAL-ONLY]]"]
  part_of: ["[[C01]]", "[[C02]]"]
  related: ["[[FACT-PRICING-DW-04]]", "[[FACT-AGREEMENT-DW-04]]", "[[FACT-SERVICE-AREA]]", "[[FACT-BRAND-IDENTITY]]", "[[FACT-SVC-NAMES]]", "[[HH-SVC-01]]", "[[HH-SVC-02]]", "[[HH-SVC-03]]", "[[HH-SVC-04]]", "[[OWN-DEC-91]]", "[[OWN-DEC-99]]", "[[OWN-DEC-127]]"]
source: "guide 6.2; vault 04-service-registry DW-04; spec section 17 DW-04; Standard Of Operations/sop new-construction.md; Main Plans/Dry Wall Business.md"
---
Category: Drywall. Catalog name (guide 6.2): Residential New Construction. Canonical name (spec Appendix B): High-Volume Residential New Construction. Slug: `new-construction`. Brand and service area: [[FACT-BRAND-IDENTITY]], [[FACT-SERVICE-AREA]]; naming: [[FACT-SVC-NAMES]].

In the launch set: all 26 services are in scope and launch ([[OWN-DEC-04]], [[OWN-DEC-33]]); reported capability is not proof of insurance, qualifications or equipment. Worker checklist: [[SOP-DW-04]] (active, pending competent review for production use, [[OWN-DEC-108]]). Pricing: each job is priced individually on its own estimate ([[FACT-PRICING-PER-JOB]]); the vault price list [[FACT-PRICING-DW-04]] is superseded. Tools and materials: [[FACT-INVENTORY-DW-04]]. Draft agreement clauses: [[FACT-AGREEMENT-DW-04]] (attorney review; customers approve the estimate terms of [[OWN-DEC-127]]).

Vault files: SOP `Standard Of Operations/sop new-construction.md`; Pricing `Pricing/pricing-new-construction.md`; Inventory `Required inventory/inventory-new-construction.md`; Agreement `Service Agreements/contract-new-construction.md`; main plan `Main Plans/Dry Wall Business.md` ("🏗️ 4. High-Volume Residential New Construction").

- aliases (registry 04, label **FACT**): plan heading "4. High-Volume Residential New Construction"; website headline "Production-Grade Drywall Contracting for Developers & Builders"; plan body "Our new construction drywall division"; pricing title "Regional Pricing: High-Volume New Construction", tags `#drywall/production`, `#market/louisville`, section "Commercial/Developer Volume Breakdown"; inventory title "Inventory & Tools: High-Volume New Construction"; agreement title "Master Subcontract Agreement: New Construction Drywall" (HandyHub as "Subcontractor" to `[General Contractor / Developer Name]`); SOP title "SOP: High-Volume New Construction Drywall", tags `#sop/production`, `#high-volume`, phrases "optimized for commercial developers" and "Commercial QA Audit & Sign-Off" (scope drift, C-DW04-09); SOP file `sop new-construction.md` (space) (source: plan L50-54; pricing L1-2, L11; inventory L1-2; agreement L1, L4; SOP L1-4, L26; MOC Dashboard)

## Customer description

No owner-approved customer description exists in the sources. Service-page content is drafted from the service files: staging shows the drafts, production shows only versions the owner approves and publishes ([[OWN-DEC-84]], amended 2026-10-12). Pages state the service's limits ([[OWN-DEC-51]]) and never invent prices, completion times, credentials or guarantees ([[RULE-NO-INVENTED-FACTS]]).

- customer-facing description (registry 04, label **FACT** + **PROPOSED**): Draft B2B plan copy (unapproved): "specialized crews" that "hang, tape, and finish thousands of square feet of drywall every single week with flawless, paint-ready accuracy", "multi-family apartment complexes", automatic taping tools, rolling scaffolds and stilts - capacity, equipment and outcome claims unverified (C-DW04-05, C-DW04-12). PROPOSED neutral text: drywall hanging, taping and finishing for builders and developers on new residential construction under a reviewed subcontract, to the specified assemblies and finish level, once GC inspections and site-readiness conditions are met (source: plan L51-60)

Purpose (SOP section 1):

- This SOP covers how HandyHub workers hang, tape, finish and sand drywall in new residential construction for builders and developers for **DW-04 High-Volume Residential New Construction**: material staging, production hanging, mechanical taping and boxing, mechanical sanding, and a quality walk before handover to the general contractor (source: spec Appendix B name; 04 DW-04 customer-facing description, PROPOSED neutral text; original phases in section 12).
- It states how the work is done and promises no outcome, speed, finish quality or code-compliance result to the general contractor or anyone else (source: 31 section 3.5 rule 5).
- Proposed risk class: high-risk / specialist review, because the procedure involves high-ceiling work and possible elevated work, bulk material handling, multi-employer construction sites and fire- or sound-rated assemblies (source: safety-liability-manager risk classification; 31 section 7.2 ranks 3 and 9 and section 7.4 wave 1; RECOMMENDATION pending qualified review).
- Original intro statement, kept verbatim:

An automated, high-velocity operational procedure optimized for commercial developers and large-scale housing developments demanding extreme speed and tight quality margins.

> FLAG (C-DW04-09; X-23): scope wording - owner and attorney review. "optimized for commercial developers" in the intro above, and the Phase 5 heading "Commercial QA Audit & Sign-Off" in section 12, conflict with the canonical "Residential" name of DW-04. Commercial or multi-family projects may carry different licensing, code, insurance and safety obligations (OPEN QUESTION; nothing here states what Kentucky or Indiana requires), and no company policy covers commercial work yet (X-23). Until the owner decides (Q-30-04), the scope of this draft is the canonical one, new residential construction (spec Appendix B; 04 DW-04). "demanding extreme speed and tight quality margins" describes the market and is not a performance commitment. Text unchanged. HUMAN REVIEW: owner; attorney; building official.

### Draft plan copy (`Main Plans/Dry Wall Business.md`; not approved, claims unverified)

*Target Headline for Website: Production-Grade Drywall Contracting for Developers & Builders*

For custom luxury single-family builds, new neighborhood developments, or multi-family apartment complexes, maintaining tight build schedules while keeping finish standards exceptional is a constant balancing act. Our new construction drywall division is built strictly for high-volume, rapid-production environments. We combine organized material logistics with specialized crews to hang, tape, and finish thousands of square feet of drywall every single week with flawless, paint-ready accuracy.

* **High-Velocity Material Layout:** We map out bulk drywall delivery deliveries across multiple rooms, minimizing installation waist cutoffs and optimizing installation speed.
* **Automated Mechanical Taping:** Our finishing crews use industrial automatic taping tools (Bazookas and mechanical skimming boxes) to apply embedded joint tape and multiple coats of mud at lightning speed.
* **Scaffolding & Stilt Operations:** We utilize rolling scaffolding lines and drywall stilts to fluidly handle high-ceiling spaces, soaring entryways, and intricate multi-layered tray ceilings without slowing building momentum.
* **Strict Quality Walkthroughs:** Every finished room undergoes a rigorous inspection under high-intensity construction lighting to identify and resolve joint flashing flaws, ensuring painters get a perfect wall template.

Claims the main plan flags for this service (each `unverified`, not publishable until approved):

- "Production-Grade Drywall Contracting for Developers & Builders": Headline - Hold (Capacity and contractor-licensing scope with two employees) (reviewer: Owner + legal-compliance + insurance broker)
- "specialized crews" and "thousands of square feet of drywall every single week": CAP - Remove (reviewer: Owner)
- "multi-family apartment complexes": SCOPE, CAP - Hold (reviewer: Legal-compliance + insurance broker)

## Request questions

- Guide 6.2 extra inputs / review needs: Drawings/quantities, phase, access, contractor/inspection coordination.
- Spec intake (DW-04.INT): builder plans, unit/room schedule, board types/thicknesses, fire/sound assemblies, delivery staging, inspections, finish level.
- Answers follow [[OWN-DEC-91]] and [[HH-SVC-03]]: units shown beside each measurement, approximate values allowed, and "I don't know" stays unknown, never zero, safe or approved. The sources set no per-service unit list.
- Estimate route: online when the details and photos are enough, a site visit when inspection or measurements are needed ([[OWN-DEC-99]], [[HH-SVC-04]]); a customer preference for a remote estimate never overrides a required site or qualification review.
- Service conditions: [[FACT-SVC-RESIDENTIAL-ONLY]] (residential work only at launch).

## Included work (SOP section 2, "In scope")

- Phase 1 as written in section 12: coordinating supplier deliveries of sheets into designated rooms, verifying the climate precondition, and verifying rough-in inspections before any cavity is covered (source: original SOP; spec DW-04.INT "delivery staging, inspections").
- Phase 2: production hanging with adhesive, mechanical panel lifts and collated auto-feed screw guns, only after the holds in sections 3 and 12 clear (source: original SOP; agreement "Scope Metrics"; pricing "Production Hanging Only (No Taping)").
- Phase 3 and Phase 4: mechanical taping, boxing and sanding to the finish level stated in the approved scope (source: original SOP; spec DW-04.INT "finish level"; the agreement's "Scope Metrics" names "a standardized Level 4 paint-ready finish"; pricing "Production Taping & Mudding Only (Bazooka & Flat Box Lines)").
- Phase 5: flashing inspection under lighting, punch-list work and the handover to the general contractor, with the flags in section 12 (source: original SOP; spec DW-04.QAC "punch under lighting", "clean handoff").
- Confirming for every job the intake facts: builder plans, unit/room schedule, board types/thicknesses, fire/sound assemblies, delivery staging, inspections, finish level (source: spec DW-04.INT).

## Excluded work and limits

HandyHub never performs licensed or unsafe scope: [[FACT-SVC-EXCLUDED-SCOPE]]; suspected hazardous material: [[FACT-SVC-SUSPECTED-HAZMAT]]; access equipment: [[FACT-SVC-ACCESS-EQUIPMENT]].

### SOP section 2, "Out of scope"

- Not covered - pending review (02 G-060): installing corner bead. "Bead Buffing" sands metal corner beads that are assumed to be installed, and the spec card lists corner bead as a material, but no step installs it (source: 31 section 10; spec DW-04.MAT "corner bead").
- Not covered - pending review (02 G-060): cutting openings for electrical outlet boxes and can lights with the router listed in the inventory; no step and no electrical precaution exists (source: 31 section 10; inventory "Drywall Router / Cutout Tool").
- Not covered - pending review (C-DW04-01): any work from the rolling scaffold towers listed in the inventory or on the drywall stilts advertised in the main plan ("Scaffolding & Stilt Operations"); no step, policy or inspection exists (source: inventory; main plan; spec DW-04.TLS "scaffolds/stilts only under approved policy").
- Not covered - pending review: cleaning or scraping glass and windows. The agreement's "Glass/Window Scraping Waiver" refers to it, but no step covers it; the proposed boundary gives construction-glass scraping to one service (recommended CL-04), with DW-04 handing over with a note that glass was not cleaned (source: agreement clause; 04 DW-04 exclusions, PROPOSED).
- No step covers framing corrections, mechanical, electrical or plumbing changes, painting, final cleaning or fire-stopping; they are not performed under this SOP, and whether the agreement excludes them is an owner and attorney decision (source: 04 DW-04 exclusions, GAP; spec EST-003).
- Remodeling, additions or tie-ins to an existing structure are DW-03, not this SOP; which service applies is decided by the owner and the attorney from the contracting party (source: 04 DW-04 estimating method, PROPOSED). Suspect asbestos, lead paint or mold in any existing structure: stop and escalate (source: spec START-011; Do not perform entry 3).
- Commercial projects: pending the owner's decision on commercial work (Q-30-04; X-23); see the flag in section 1.

### SOP section 2, "Do not perform"

Each entry: prohibited work - reason class - what to do instead (source).

Universal entries (31 section 3.3, PROPOSED wording; HUMAN REVIEW: qualified safety professional and licensing reviewer):

1. Electrical, plumbing, gas or HVAC work outside the approved scope or requiring a licensed trade (source: spec START-011 "unapproved electrical/plumbing/gas/structural scope"; master section 1.3).
2. Structural work, meaning cutting, removing, sistering or adding load-bearing members, ledgers, footings or framing, unless it is in the approved scope with the required qualified review (source: START-011; master section 1.3).
3. Disturbing suspect asbestos, lead paint or mold: stop and escalate (source: START-011 "suspect hazardous materials"; owner facts L20 "Unknown is not safe").
4. Work that is not in the approved scope or an approved change order; record customer requests instead (source: JOB-005, JOB-010, FIN-008, AT-033).
5. Working at height or using access equipment beyond the approved height and access policy (source: HI-06.SAF "beyond approved height/access policy"; DW-04.TLS "scaffolds/stilts only under approved policy").
6. Mixing or sequencing chemicals in any way the approved step and the product SDS do not allow (source: CL-01.SAF "never mix incompatible chemicals"; X-09).
7. Recording, photographing or sending customer passwords, master codes or site access codes outside the app's secured fields (source: COM-002; owner facts L17; 27 AUTH-009).
8. Promising results, warranties, safety, health or code compliance to the customer (source: master sections 1.4, 17 and 29; CL-07.SAF "do not make unsupported indoor-air-quality claims").

Service-specific entries (31 section 10 seeds and the spec card; pending review):

9. Working from scaffolds or on stilts, or using any access equipment, outside an approved height and access policy - falls - do not use them; escalate (source: spec DW-04.TLS "scaffolds/stilts only under approved policy"; DW-04.HAZ "falls, scaffold/stilt risk"; C-DW04-01). No such policy exists yet (02 G-005; Q-31-09).
10. Covering incomplete or failed inspections: hanging board over any wall or ceiling cavity whose required inspections are not recorded as passed - concealment of uninspected work - stop, record No Start / Blocked for the affected area and escalate (source: spec DW-04.SAF "do not cover incomplete/failed inspections"; critical hold, 31 section 8.3 rule 2).
11. Hanging board in a fire- or sound-rated assembly before its assembly specification from the builder plans is verified, or fastening below what the board manufacturer and the listed assembly require - life safety and code - stop and escalate (source: spec DW-04.INT "fire/sound assemblies"; DW-04.SAF "verify assembly specifications"; C-DW04-02).
12. Operating panel lifts, automatic taping tools, power sanders, dust extractors or cutting tools without the equipment qualification the owner sets - equipment - do not operate them; escalate (source: spec DW-04.SAF "equipment qualification"; SCH-003).

- exclusions (registry 04, label **GAP** + **PROPOSED**): GAP: none stated (framing corrections, MEP changes, painting, cleaning and fire-stopping are not excluded; EST-003). Agreement §3 "Glass/Window Scraping Waiver" sits under a "Scaffolding Waiver" heading with no scaffold terms, and its logic is inverted (C-DW04-07; X-17). PROPOSED boundary (owner + attorney): construction-glass scraping belongs to one service (recommended CL-04); DW-04 hands over with a written note that glass was not cleaned (source: agreement L14-15; spec EST-003; registry boundary rules)

## Hazards and human-review flags

- Spec hazards (DW-04.HAZ): material handling, falls, scaffold/stilt risk, repetitive strain, dust, incomplete framing/utilities.
- Spec stop-work guidance (DW-04.SAF): coordinate inspections; verify assembly specifications; safe staging/handling; equipment qualification; do not cover incomplete/failed inspections.
- permit/license flags (registry 04, label **OPEN QUESTION** + **GAP**): MEP inspections are warranted by the GC and checked in the SOP, but no inspection evidence is recorded. OPEN QUESTION (HUMAN REVIEW): fire/sound assembly and other pre-cover inspections (building official; manufacturer listed assembly); contractor licensing/registration for new-construction, multi-family or commercial drywall in each KY/IN municipality (legal-compliance-administrator + attorney); insurance documentation and certificates GCs request (insurance broker; no coverage asserted); construction-site safety duties for scaffolds and multi-employer sites (qualified safety professional; no regulatory conclusion); late interest, retainage and lien-notice rights (attorney) (source: agreement L8, L20; SOP L9; spec DW-04.SAF, START-010, HND-005; legal-compliance SKILL)
- Reviewers named in the vault files' front matter: qualified safety reviewer; owner; Spanish translation reviewer; licensed trade professional (building official for fire- and sound-rated assemblies and inspections); qualified safety professional (multi-employer site; scaffolds, stilts and lifts); attorney licensed in KY/IN (handover certificate, payment-draw and outcome wording); CPA (tax treatment); attorney licensed in KY/IN (fee wording and builder payment terms); safety reviewer (PPE/hazmat); qualified safety professional (scaffold towers, panel lifts and stilts; C-DW04-01); qualified English/Spanish reviewer (Arabic heading, C-DW04-13); attorney licensed in KY/IN; insurance broker; CPA (late interest and builder tax exemptions); qualified safety professional (scaffold and site-safety terms). Boundaries: [[RULE-HUMAN-REVIEW]].

### Required worker qualifications (SOP section 4)

- Equipment qualification for mechanical panel lifts, automatic taping tools, power sanders with dust extractors and any cutting tool: TBD — requires review by safety-liability-manager and a qualified person; owner to approve. Qualification tags are recorded for scheduling and checked before start (source: spec DW-04.SAF "equipment qualification"; SCH-003, START-010; Q-31-01).
- Scaffolds, stilts and other access equipment: no worker is qualified to use them until the approved height and access policy defines training, inspection and qualification (source: spec DW-04.TLS; C-DW04-01; Q-31-09).
- Fire- and sound-rated assemblies: assembly specifications are verified against the builder plans and the listed assembly; who verifies them and keeps the inspection evidence is an open owner decision, and review by the building official for assemblies and inspections is required before this SOP is activated (source: spec DW-04.SAF "verify assembly specifications"; 04 DW-04 permit/license flags; 31 section 10 reviewers; HUMAN REVIEW: building official).
- Capacity: HandyHub starts with two employees. The original Phase 5 step forms "a rapid-response team of 2 finishers" and the main plan describes "specialized crews"; both exceed that capacity (C-DW04-05). A job that needs both employees is not two crews (source: owner facts 2026-10-02; job-planner playbook "Do not treat the two-person team as two independent crews when the job needs both.").
- Lifting and handling heavy sheets: lifting method and any two-person rule per the qualified safety professional (source: spec DW-04.HAZ "material handling", "repetitive strain").
- Contractor licensing or registration for new-construction, multi-family or commercial drywall in each Kentucky or Indiana municipality is an OPEN QUESTION, decided per jurisdiction and never assumed to be "none" (source: 04 DW-04 permit/license flags; risk-triage playbook "unknown applicability must not default to no permit"; HUMAN REVIEW: attorney and licensing authority).
- Site-specific orientation by the general contractor on a multi-employer site: TBD — requires review by safety-liability-manager and a qualified person; owner to approve. (source: 02 G-060; HUMAN REVIEW: qualified safety professional (multi-employer site))

### Hazards (SOP section 9)

> Spec card DW-04.HAZ (verbatim): "material handling, falls, scaffold/stilt risk, repetitive strain, dust, incomplete framing/utilities"

| Hazard | Source | Where it arises | Controls (draft, hierarchy of controls; pending review) | Stop-work trigger | Reviewer |
|---|---|---|---|---|---|
| Material handling: crane or boom-truck deliveries into rooms, heavy sheets and stacks | DW-04.HAZ "material handling"; 04 DW-04 hazards | "Load Calculation"; "Panel Lifter System" (12-foot or 14-foot sheets) | Workers stay clear of the supplier's lifting operation; staging, stacking and moving controls and any two-person lift rule are set by the qualified safety professional with the general contractor (hold in section 12) | An unsafe delivery, stack or lift | Qualified safety professional |
| Falls; scaffold and stilt risk | DW-04.HAZ "falls, scaffold/stilt risk"; C-DW04-01; X-12 | High ceilings ("Panel Lifter System"); scaffold towers in the inventory; stilts in the main plan | Eliminate first: no scaffold, stilt or elevated work position until an approved height and access policy exists (holds in section 12) | Any need to work at height without an approved method | Qualified safety professional (OSHA applicability not concluded) |
| Repetitive strain | DW-04.HAZ "repetitive strain" | Production pace across all phases ("high-velocity" wording in the intro and the steps) | Controls TBD by the qualified safety professional; the production pace in the original text is not a target | Pain or injury: stop; section 20 | Qualified safety professional |
| Dust | DW-04.HAZ "dust" | Phase 4 power and pole sanding; cutting | Engineering control in the step: sanders linked to Class M HEPA extractors; respiratory protection and the dust-control method are decided by the reviewer | Extraction not connected or not working | Qualified safety professional |
| Incomplete framing or utilities | DW-04.HAZ "incomplete framing/utilities" | Before hanging ("Inspection Check") | Critical inspection hold: no board over a cavity without recorded passed inspections (section 12) | Incomplete framing, open utility work, or a failed or missing inspection | Building official (no conclusion drawn here); owner |
| Fire- or sound-rated assembly built incorrectly (life safety, failed inspection) | C-DW04-02; DW-04.INT, DW-04.SAF; 31 section 7.2 rank 9 | Phase 2 hanging and fastening; the screw-count claim in "Adhesive Layering" | Assembly schedule verified before hanging; fastening per the manufacturer and the listed assembly, never the unsourced reduction (hold and flag in section 12) | Plans, schedule or specified board missing or not matching the site | Building official; design professional; manufacturer listed-assembly documentation |
| Temporary heating units on site (fire, carbon monoxide) | Agreement "Drying Temperature Clause" ("active, safe heating units"); 04 DW-04 hazards; X-27 | Winter work; "Climate Verification" | The general contractor provides the heat under the draft agreement; heater safety is coordinated with the contractor; controls set by the qualified safety professional (RISK, unverified) | An unsafe condition from a heating unit, such as suspected fumes: leave the area and escalate; emergency services first if anyone is affected | Qualified safety professional |
| Cold-site conditions for mud work | Original "Climate Verification" step; C-DW04-04; X-27 | Phase 3 and Phase 4 | Precondition kept as written and not relaxed by pricing; temperature evidence recorded (PROPOSED) | Precondition not met or not shown | Owner; qualified safety professional (heat and cold plan) |
| Electrical: cutting at outlet boxes and light openings; temporary site power | Inventory router line; 04 DW-04 hazards | Router cutouts (not covered); powered tools | No cutouts until a reviewed step exists (section 2); electrical work outside the approved scope is Do-not-perform entry 1 | Contact with or damage to wiring; exposed live parts | Licensed electrician; qualified safety professional |
| Noise | Inventory router line ("High-speed"); original Phase 4 power sanders | Cutting and sanding | Hearing protection per the reviewer (RISK, unverified) | - | Qualified safety professional |
| Chemical products: adhesive and joint compound | Inventory adhesive line; spec DW-04.MAT "compound"; 29 section 8.1 | "Adhesive Layering"; Phase 3 | Controls from the reviewed SDS; without a reviewed SDS the product is not carried to the job (29 section 8.3, PROPOSED) | Exposure symptoms: stop; section 20 | Qualified safety professional |
| Multi-employer site: other trades, debris, deliveries | Agreement "Standby Crew Fee" ("un-cleared debris from other trades"); 02 G-060 | All phases | Site orientation and coordination with the general contractor (TBD, G-060); others kept out of active work areas (X-11) | Debris or other trades' work makes the work area unsafe | Qualified safety professional (multi-employer site); attorney (allocation of responsibility) |
| Sharp tools and router bits | Spec DW-04.TLS "cutting tools"; 04 DW-04 PPE row ("high-speed router cutting") | Cutting | Tool use per the manufacturer; PPE per the reviewer | Injury: section 20 | Qualified safety professional |

Severity ratings and final controls: TBD — requires review by safety-liability-manager and a qualified person; owner to approve.

## Warranty or callback

- warranty or callback policy (registry 04, label **GAP** + **OPEN QUESTION**): No warranty or callback policy and none is proposed here; agreement bills punch hours caused by GC heat failure as a paid change order (§2 L12); the 2-hour punch response is not a warranty. HUMAN REVIEW: attorney. Return visits classified per CX-007 and QA-010 (source: agreement L12; SOP L28; spec CX-007, QA-010)
- Governed now by: the 90-day workmanship warranty of [[FACT-WARRANTY]] ([[OWN-DEC-135]]), counted from the reviewed completion date; a claim opens a case with return-visit punch items ([[HH-QA-07]]). No warranty exclusions are defined; any come only from attorney review ([[OQ-ATTORNEY-TERMS]]).
