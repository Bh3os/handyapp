---
id: SVC-CL-04
type: service
title: "Post-Construction Cleaning"
status: active
area: business
links:
  decided_by: ["[[OWN-DEC-04]]", "[[OWN-DEC-33]]", "[[OWN-DEC-84]]", "[[OWN-DEC-51]]", "[[OWN-DEC-102]]", "[[OWN-DEC-108]]"]
  uses: ["[[SOP-CL-04]]", "[[FACT-INVENTORY-CL-04]]", "[[FACT-PRICING-PER-JOB]]", "[[FACT-SVC-EXCLUDED-SCOPE]]", "[[FACT-SVC-LEFT-ITEMS]]", "[[FACT-SVC-LARGE-CLEANING-JOBS]]"]
  constrained_by: ["[[RULE-HUMAN-REVIEW]]", "[[RULE-SAFETY-GATES]]", "[[RULE-NO-INVENTED-FACTS]]", "[[FACT-SVC-EXCLUDED-SCOPE]]", "[[FACT-SVC-SUSPECTED-HAZMAT]]", "[[FACT-SVC-ACCESS-EQUIPMENT]]", "[[FACT-SVC-REFER-OUT-TASKS]]", "[[FACT-SVC-RESIDENTIAL-ONLY]]"]
  part_of: ["[[C01]]", "[[C02]]"]
  related: ["[[FACT-PRICING-CL-04]]", "[[FACT-AGREEMENT-CL-04]]", "[[FACT-SERVICE-AREA]]", "[[FACT-BRAND-IDENTITY]]", "[[FACT-SVC-NAMES]]", "[[HH-SVC-01]]", "[[HH-SVC-02]]", "[[HH-SVC-03]]", "[[HH-SVC-04]]", "[[OWN-DEC-91]]", "[[OWN-DEC-99]]", "[[OWN-DEC-127]]"]
source: "guide 6.2; vault 04-service-registry CL-04; spec section 17 CL-04; Standard Of Operations/sop Post-Construction Cleaning Checklist.md; Main Plans/Cleaning Business.md"
---
Category: Cleaning. Catalog name (guide 6.2): Post-Construction Cleaning. Canonical name (spec Appendix B): Post-Construction & Post-Renovation Cleaning. Slug: `post-construction`. Brand and service area: [[FACT-BRAND-IDENTITY]], [[FACT-SERVICE-AREA]]; naming: [[FACT-SVC-NAMES]].

In the launch set: all 26 services are in scope and launch ([[OWN-DEC-04]], [[OWN-DEC-33]]); reported capability is not proof of insurance, qualifications or equipment. Worker checklist: [[SOP-CL-04]] (active, pending competent review for production use, [[OWN-DEC-108]]). Pricing: each job is priced individually on its own estimate ([[FACT-PRICING-PER-JOB]]); the vault price list [[FACT-PRICING-CL-04]] is superseded. Tools and materials: [[FACT-INVENTORY-CL-04]]. Draft agreement clauses: [[FACT-AGREEMENT-CL-04]] (attorney review; customers approve the estimate terms of [[OWN-DEC-127]]).

Vault files: SOP `Standard Of Operations/sop Post-Construction Cleaning Checklist.md`; Pricing `Pricing/pricing-post-construction.md`; Inventory `Required inventory/inventory-post-construction.md`; Agreement `Service Agreements/contract-post-construction.md`; main plan `Main Plans/Cleaning Business.md` ("🏗️ 4. Post-Construction & Post-Renovation Cleaning").

- aliases (registry 04, label **FACT**): "Post-Construction & Post-Renovation Cleaning" (main plan heading); "Post-Construction division" (main plan body); "Eradicate Construction Dust and Turn Your Renovation into a Masterpiece" (website headline); "Post-Construction Cleaning" (pricing title); "Post-Construction" (inventory title); "Master Service Agreement: Post-Construction Cleaning" and "Commercial Service Agreement" (agreement title and body); `post-construction.md` "micro-checklist" (agreement scope reference; no such file exists); `sop Post-Construction Cleaning Checklist.md` and "Post-Construction Micro-Checklist" (SOP file name and title); phase names (pricing / SOP / agreement): "Rough Interior Clean (Dust Pull & Debris Removal)" / "Heavy Rough Clean & Dry Dust Pull" / "Rough Clean", "Detail Clean (Scraping, Peeling, Wiping)" / "Detailed Scraping & Film Removal" / "Detail Clean", "Final Touch & Touch-Up Buff" / "Final Buffing, Polish & Turnover" / "Final Touch"; "All-In Commercial Bundle" / "All-In Bundle Total" (source: main plan L53-54, L57; pricing L1, L15, L19, L23, L27; inventory L1; agreement L1, L4, §1 L7-11; SOP L1, L4, L9, L16)

## Customer description

No owner-approved customer description exists in the sources. Service-page content is drafted from the service files: staging shows the drafts, production shows only versions the owner approves and publishes ([[OWN-DEC-84]], amended 2026-10-12). Pages state the service's limits ([[OWN-DEC-51]]) and never invent prices, completion times, credentials or guarantees ([[RULE-NO-INVENTED-FACTS]]).

- customer-facing description (registry 04, label **FACT** + **OPEN QUESTION** + **PROPOSED**): Draft copy (unapproved): removal of fine drywall dust, sawdust and plaster residue after contractors leave, using HEPA vacuums and scraping tools; paint, plaster and tape residue removal from floors and glass; film and sticker removal from new fixtures; dust removal from fixtures, vents and walls; buffing and polishing surfaces, metals and floors. Flags: "industrial-grade" division and "safe, clean, and ready for immediate occupancy" exceed the card's turnover standard (C-CL04-06); vents, floor scraping, floor buffing and cabinet exteriors are not in the SOP (C-CL04-10); homeowner-targeted copy vs a commercial agreement (C-CL04-11). PROPOSED basis for a rewrite: staged cleaning of construction dust and residues in areas released by all trades, to a turnover standard (source: main plan L54-64; spec CL-04.QAC)

Purpose (SOP section 1):

- Detail and final cleaning of construction dust, debris and residues after construction or renovation, in passes (rough clean and dust pull; detailed scraping and film removal; final wipe-down, polish and turnover), only in areas that all trades have released, to the turnover standard of the approved estimate (source: spec Appendix B "Post-Construction & Post-Renovation Cleaning"; spec CL-04.QAC "fine dust removed in passes ... site ready for turnover"; 04 customer-facing description, PROPOSED basis; 04 section 5.2 rule (a); original Phases 1 to 3 in section 12).
- "Ready for turnover" is a cleaning standard. This SOP makes no safety, health, air-quality, occupancy-readiness or damage-free promise to the customer (source: 31 section 3.5 rule 5; spec CL-04.QAC; risk-triage skill "never certify site safety").
- Proposed risk class: elevated; high-risk / specialist review for silica-generating dust, work "Above 12 ft", acid treatment and suspect lead or asbestos debris. Pending qualified safety review (source: 04 CL-04 hazards, PROPOSED draft risk class; safety-liability-manager risk classification).

### Draft plan copy (`Main Plans/Cleaning Business.md`; not approved, claims unverified)

*Target Headline for Website: Eradicate Construction Dust and Turn Your Renovation into a Masterpiece*

Once the contractors leave, a layer of ultra-fine, abrasive drywall dust, sawdust, and plaster residue settles on every single surface—including inside light fixtures and inside vents. Standard house cleaning tools will simply spread this white film around. Our industrial-grade Post-Construction division utilizes specialized HEPA filtration vacuums and scraping tools to extract fine particulates and make your brand-new renovation safe, clean, and ready for immediate occupancy.

- [ ] **Fine dust extraction:** Vacuuming and wiping down microscopic drywall and sawdust that settles on all surfaces.
- [ ] **Paint and adhesive removal:** Carefully scraping off paint splatters, plaster droplets, and tape residue from floors and glass.
- [ ] **Label and sticker peeling:** Removing protective films, barcodes, and manufacturing stickers from newly installed fixtures.
- [ ] **Airborne particle cleanup:** Wiping down light fixtures, vents, and walls where construction dust clings.
- [ ] **Final polish:** Buffing and polishing brand new surfaces, metals, and floors so they are ready for immediate occupancy.

Claims the main plan flags for this service (each `unverified`, not publishable until approved):

- "Eradicate Construction Dust and Turn Your Renovation into a Masterpiece": Headline - Reword (Absolute outcome) (reviewer: Attorney)
- "make your brand-new renovation safe, clean, and ready for immediate occupancy": GUAR, SAFE - Remove (reviewer: Attorney)
- "Our industrial-grade Post-Construction division": CAP - Remove (reviewer: Owner)

## Request questions

- Guide 6.2 extra inputs / review needs: Dust/debris, area, trade completion, surfaces, phases.
- Spec intake (CL-04.INT): construction complete status, dust/debris type, surfaces, paint/adhesive residue, contractor punch activity, occupancy readiness.
- Answers follow [[OWN-DEC-91]] and [[HH-SVC-03]]: units shown beside each measurement, approximate values allowed, and "I don't know" stays unknown, never zero, safe or approved. The sources set no per-service unit list.
- Estimate route: online when the details and photos are enough, a site visit when inspection or measurements are needed ([[OWN-DEC-99]], [[HH-SVC-04]]); a customer preference for a remote estimate never overrides a required site or qualification review.
- Service conditions: [[FACT-SVC-RESIDENTIAL-ONLY]] (residential work only at launch); [[FACT-SVC-LEFT-ITEMS]] (items left behind); [[FACT-SVC-LARGE-CLEANING-JOBS]] (jobs needing 3-5 people).

## Included work (SOP section 2, "In scope")

- The original steps in section 12, in their three phases: HEPA vacuuming, debris gathering and window-track vacuuming; paint and plaster removal from glass, film and sticker peeling, adhesive removal, cabinetry interiors, and fixtures and hardware; wall damp-wipe, metal polish, double floor clean and the air check (source: original Phases 1 to 3). Each step runs only after the holds in section 12 are released.
- Only areas released for cleaning by all trades, with the trades finished in the target zones (source: spec CL-04.SAF "confirm area released for cleaning"; agreement "Construction Complete"; 04 section 5.2 rule (a), PROPOSED).
- Confirming on site, for every job, the intake facts: "construction complete status, dust/debris type, surfaces, paint/adhesive residue, contractor punch activity, occupancy readiness" (source: spec CL-04.INT, verbatim; spec CX-005).

## Excluded work and limits

HandyHub never performs licensed or unsafe scope: [[FACT-SVC-EXCLUDED-SCOPE]]; suspected hazardous material: [[FACT-SVC-SUSPECTED-HAZMAT]]; access equipment: [[FACT-SVC-ACCESS-EQUIPMENT]]. Referred out at launch for this service: acid grout-haze removal ([[FACT-SVC-REFER-OUT-TASKS]]).

### SOP section 2, "Out of scope"

- Not covered - pending review (C-CL04-10): floor scraping. The inventory stocks floor scrapers for use "before flooring installation" and the main plan promises scraping "from floors and glass", but no step scrapes floors.
- Not covered - pending review (C-CL04-10): vents and registers. The main plan promises "Wiping down light fixtures, vents, and walls" and the card checks "vents/fixtures/surfaces detailed as scoped", but no step covers vents; duct interiors belong to CL-07 (04 section 5.1).
- Not covered - pending review (C-CL04-10): floor buffing. The main plan promises "Buffing and polishing brand new surfaces, metals, and floors"; the Phase 3 floor step vacuums and mops, and no buffing equipment is stocked.
- Not covered - pending review (C-CL04-10): cabinet exteriors. The pricing file sells "washing new cabinets inside/out"; the "Cabinetry Interior" step covers drawer and shelf interiors.
- Not covered - pending review (C-CL04-02): acid grout-haze treatment. The agreement's "Chemical Use" clause authorizes phosphoric acid on grout lines and the inventory stocks it, but no reviewed step exists; nothing is done with it under this SOP (31 section 10; Q-31-08).
- Work "Above 12 ft" (pricing "High Ceiling Scaffolding Work"): OPEN QUESTION whether it is in scope, excluded or subcontracted; decided by the owner with the qualified safety professional (31 section 10; 02 C-CL04-01).
- Not covered - pending owner decision (04 CL-04 exclusions, GAP): exterior glass, haul-away of construction debris, and any suspect hazardous debris.
- Trade cleanup inside a HandyHub drywall or painting job (that job's own debris, containment removal and dust) stays in that job and is not sold again as a CL-04 phase (source: 04 section 5.2 rules (a) and (d), PROPOSED; spec QA-002).

### SOP section 2, "Do not perform"

Each entry: prohibited work - reason class - what to do instead (source). PROPOSED wording; HUMAN REVIEW: qualified safety professional and licensing reviewer (31 section 3.3).

1. Electrical, plumbing, gas or HVAC work outside the approved scope or requiring a licensed trade - licensed trade - stop and escalate (source: spec START-011 "unapproved electrical/plumbing/gas/structural scope"; master section 1.3).
2. Structural work, meaning cutting, removing, sistering or adding load-bearing members, ledgers, footings or framing, unless it is in the approved scope with the required qualified review - structural - stop and escalate (source: spec START-011; master section 1.3).
3. Suspected asbestos / lead paint / mold: stop and escalate (source: spec START-011). Do not disturb suspect material, including renovation dust and debris that may contain it - hazardous material ("Unknown is not safe", owner facts 2026-10-02).
4. Work that is not in the approved scope or an approved change order - out of scope - record the customer's request instead (source: spec JOB-005, JOB-010, FIN-008, AT-033).
5. Working at height or using access equipment beyond the approved height and access policy - policy - stop and escalate (source: spec HI-06.SAF "beyond approved height/access policy"; DW-04.TLS "scaffolds/stilts only under approved policy").
6. Mixing or sequencing chemicals in any way the approved step and the product SDS do not allow - hazardous material - stop and escalate (source: 31 section 3.3, from CL-01.SAF "never mix incompatible chemicals").
7. Recording, photographing or sending customer passwords, master codes or site access codes outside the app's secured fields - policy - use the app's secured fields only (source: spec COM-002; owner facts 2026-10-02; 27 AUTH-009).
8. Promising results, warranties, safety, health or code compliance to the customer, including "zero dust", air quality, a safe site, readiness for occupancy or scratch-free glass - policy - refer the question to the owner (source: master sections 1.4, 17 and 29; spec CL-04.QAC).
9. Working amid unsafe active construction, or in an area not released for cleaning - safety - do not start; record No Start / Blocked with evidence and escalate (source: spec CL-04.SAF "confirm area released for cleaning; do not work amid unsafe active construction"; spec SCH-008).
10. Any acid treatment, including phosphoric-acid grout-haze removal - hazardous material - not performed until an SDS-based reviewed step exists (source: 31 section 10; C-CL04-02).
11. Touching exposed or unfinished wiring, open electrical boxes or unfinished fixtures - licensed trade - stop and escalate (source: spec CL-04.HAZ "unfinished electrical/fixtures"; spec START-011; C-CL04-04).

- exclusions (registry 04, label **GAP** + **PROPOSED**): None defined in CL-04 files (GAP). PROPOSED boundaries: cleanup of HandyHub's own drywall and painting jobs (own debris, containment removal, broom-clean) stays inside those jobs (QA-002), and CL-04 sells only detail and final cleaning of areas released by all trades; construction-glass scraping assigned to one service under one attorney-reviewed clause (X-17); duct interiors are CL-07; suspect hazardous debris, haul-away, exterior glass and work above 12 ft need owner decisions (source: spec QA-002; agreement §2 L14; pricing L17, L21, L34)

## Hazards and human-review flags

- Spec hazards (CL-04.HAZ): fine dust, silica/wood dust, sharp debris, unfinished electrical/fixtures, ladders, chemicals.
- Spec stop-work guidance (CL-04.SAF): confirm area released for cleaning; do not work amid unsafe active construction; respiratory/dust control; sharps management; verify power/water safety.
- permit/license flags (registry 04, label **OPEN QUESTION**): None in files. OPEN QUESTION: municipal business licensing (KY/IN); EPA RRP applicability to cleaning renovation dust in pre-1978 housing and the evidence needed from the renovator; handling/referral for suspect asbestos debris (KY and IN separately); respiratory-protection, silica-housekeeping and ladder/scaffold training obligations; construction-debris disposal rules; GC certificate-of-insurance requirements; commercial vs consumer terms and the 1.5% per month interest. HUMAN REVIEW: Legal & Compliance Administrator, EPA RRP-certified renovator, licensed asbestos inspector, qualified safety professional, local solid-waste authority, insurance broker, KY/IN attorney (source: owner facts; inventory L17; pricing L17, L34; agreement L4, §4 L23)
- Reviewers named in the vault files' front matter: qualified safety reviewer; owner; Spanish translation reviewer; licensed trade professional (renovation dust may carry lead or asbestos; electrical and HVAC questions); qualified safety professional (silica and respirable dust); EPA RRP-certified renovator; accredited asbestos inspector; attorney licensed in KY/IN (glass waiver evidence and site-safety clause); CPA (tax treatment); qualified safety professional (height and access line); attorney licensed in KY/IN (commercial terms and fee wording); safety reviewer (PPE/hazmat); attorney licensed in KY/IN; insurance broker; qualified safety professional (site-safety and chemical clauses); CPA (late interest and commercial tax treatment). Boundaries: [[RULE-HUMAN-REVIEW]].

### Required worker qualifications (SOP section 4)

TBD — requires review by safety-liability-manager and a qualified person; owner to approve.

- No company qualification policy exists yet (source: 31 section 3.1, section 4 row "owner policy (none yet: GAP)").
- Qualification tags and training for dust control and any respiratory protection the reviewer requires (selection, fit testing, medical evaluation and program), access equipment, blade scraping of glass, sharps handling, and recognizing suspect hazardous debris (recognizing it and stopping, not handling it) are decided by the qualified safety professional (source: spec CL-04.HAZ, CL-04.TLS; spec SCH-003 "worker capability/qualification tags"; 04 CL-04 PPE "Respirator selection, fit testing, medical evaluation and silica exposure assessment undocumented").
- No electrical, HVAC, acid, abatement or structural work is performed under this SOP (section 2, Do not perform).
- Crew size is planned per job; the business starts with two employees (owner facts 2026-10-02), and the pricing file's crew size is an unapproved benchmark (source: job-planner playbook "Do not treat the two-person team as two independent crews when the job needs both.").

### Hazards (SOP section 9)

Seeded from the spec card and the verified findings; every control is pending qualified review, and controls are listed in hierarchy order (eliminate, substitute, engineer, administrative, PPE). No limit, distance, setting or time is set here.

| Hazard | Where in this SOP | Controls (pending qualified review) | PPE | Stop-work trigger | Escalation and reviewer | Related finding (severity) |
|---|---|---|---|---|---|---|
| Fine dust, silica/wood dust (spec CL-04.HAZ) | "HEPA Vacuuming", "Bulk Debris" (dry sweeping), "Window Tracks", "Double Floor Clean" | Engineering controls already in the steps: HEPA vacuuming and the dust-binding rinse. Dry sweeping without the stocked sweeping compound is held: DUST-CONTROL METHOD PENDING SAFETY REVIEW. The method (HEPA capture, wet methods or dry sweeping) and the respiratory decision belong to the qualified safety professional | Section 6; the inventory's "Mandatory" respirator statement stays | No dust-control decision recorded; suspected hazardous-material exposure is an incident (spec JOB-008) | Qualified safety professional (OSHA respiratory protection and silica applicability not concluded) | C-CL04-03 (critical) |
| Lead or asbestos in renovation dust and debris (04 CL-04 hazards; spec START-011 "suspect hazardous materials") | Every step that vacuums, sweeps, wipes or bags renovation dust or debris | Eliminate: screen build year and renovation history before dispatch; leave suspect dust and debris undisturbed; stop and escalate. HEPA capture does not clear suspect material (29 section 8.1) | Not a PPE matter: stop | Pre-1978 or unknown-age home where painted surfaces or older materials were disturbed; debris suspected to contain asbestos | EPA RRP-certified renovator; accredited asbestos inspector | X-13 (high) |
| Sharp debris and blades (spec CL-04.HAZ "sharp debris") | "Bulk Debris" (drywall pieces, wood shavings), "Paint & Plaster Removal" (blades) | Sharps management by the reviewer's method (spec CL-04.SAF); sharps container and cut protection proposed in the inventory; used blades handled as sharps (section 15) | Cut protection pending review (section 6) | Unsafe condition | Qualified safety professional | C-CL04-04 (critical) |
| Unfinished electrical and fixtures; site power (spec CL-04.HAZ "unfinished electrical/fixtures"; CL-04.SAF "verify power/water safety") | "Fixtures & Hardware" (light bulbs, switches, outlets); wet steps ("Wall Damp-Wipe", "Double Floor Clean") and water applied after "Window Tracks"; the vacuum on temporary or permanent power | ELECTRICAL - REVIEW: no contact with exposed or unfinished wiring, open boxes or unfinished fixtures; the cleaning method for switches, outlets and bulbs is set by the qualified reviewer; power and water verified safe first | Section 6 | Exposed or unfinished wiring, open boxes, damaged fixtures, unsafe temporary power, water near energized equipment | Qualified safety professional; licensed electrician for any electrical work | C-CL04-04 (critical) |
| Ladders and height (spec CL-04.HAZ "ladders") | "HEPA Vacuuming" (ceilings), "Fixtures & Hardware" (light bulbs); pricing work "Above 12 ft" | Access only with equipment and methods approved under a height and access policy, which does not exist yet (02 G-005); the steps or parts of steps that need it stay on hold | Set by the reviewer | No approved access means | Qualified safety professional | C-CL04-01 (critical); X-12 (high) |
| Chemicals (spec CL-04.HAZ "chemicals") | "Adhesive Removal", "Double Floor Clean", "Metal Polish"; the stocked phosphoric acid (no step) | SDS register; no product without a reviewed SDS; mixing only as the label states; no acid step; the acid is not packed with the CL-02 chlorine-based product (29 section 8.3, PROPOSED) | Per the reviewed SDS (section 6) | Unsafe condition; exposure is an incident | Qualified safety professional | C-CL04-02 (critical) |
| Active construction and other trades (spec CL-04.SAF) | Every step; floor scraping "before flooring installation" (inventory) implies work while trades are still active | Area release before each phase visit; no work amid unsafe active construction; No Start / Blocked with evidence (spec SCH-008) | Section 6 | Area not released; unsafe active construction | Supervisor; qualified safety professional | C-CL04-04 (critical) |
| Glass damage from blade scraping (property damage) | "Paint & Plaster Removal" | Pre-work glass inspection with photos before any blade touches the glass; method per the glass and window manufacturers' instructions; "safely" in the step is not a verified property | Not applicable; cut protection under sharps | Glass condition not recorded; manufacturer instructions restrict blade use | Owner; attorney (waiver evidence) | C-CL04-05 (critical); X-02 (high); X-17 (medium) |
| Manual handling of construction debris | "Bulk Debris"; pricing Phase 1 "pulling construction trash" | Controls set by the reviewer (spec BRF-008 "manual handling") | Section 6 | Unsafe condition | Qualified safety professional | None registered |
| Slips on wet floors and dust films | "Double Floor Clean", "Wall Damp-Wipe" | Controls set by the reviewer | Footwear pending review (section 6) | Unsafe condition | Qualified safety professional | None registered |
| HVAC operation for the "Air Check" | "Air Check" | Who runs the HVAC system for the check is undefined; no HVAC work under this SOP; duct interiors belong to CL-07 (04 section 5.1) | Not applicable | HVAC work outside the approved scope (section 10 block) | Owner; licensed HVAC professional for any HVAC question | None registered (04 CL-04 quality checklist, GAP) |
| Occupants, children and pets | Released areas and routes through the property | Keep them out of the active work area; occupant and pet module pending review (31 section 5.8) | Not applicable | Unsafe condition for occupants or pets (spec START-011) | Qualified safety professional | X-11 (high) |

## Warranty or callback

- warranty or callback policy (registry 04, label **GAP** + **OPEN QUESTION**): None (GAP); no re-clean or punch policy for dust resettled by other trades. OPEN QUESTION: any such policy needs owner approval and attorney review; returns linked and classified per CX-007 and QA-010 (source: spec CX-007, QA-010)
- Governed now by: the 90-day workmanship warranty of [[FACT-WARRANTY]] ([[OWN-DEC-135]]), counted from the reviewed completion date; a claim opens a case with return-visit punch items ([[HH-QA-07]]). No warranty exclusions are defined; any come only from attorney review ([[OQ-ATTORNEY-TERMS]]).
