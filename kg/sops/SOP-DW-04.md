---
id: SOP-DW-04
type: sop
title: "SOP DW-04: High-Volume Residential New Construction"
status: active
area: field
links:
  part_of: ["[[SVC-DW-04]]", "[[S07]]"]
  decided_by: ["[[OWN-DEC-108]]", "[[OWN-DEC-109]]", "[[OWN-DEC-17]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]", "[[RULE-HUMAN-REVIEW]]", "[[RULE-NO-INVENTED-FACTS]]", "[[FACT-SVC-STOP-WORK-RULE]]"]
  uses: ["[[FACT-INVENTORY-DW-04]]", "[[FACT-SVC-PHOTO-MINIMUM]]", "[[FACT-SVC-ESCALATION-PATH]]", "[[FACT-SVC-INCIDENT-REPORTING]]"]
source: "vault Standard Of Operations/sop new-construction.md; OWN-DEC-108"
---
Worker checklist for [[SVC-DW-04]] (High-Volume Residential New Construction). Status: active for the job checklist under [[OWN-DEC-108]], pending competent review for production use ([[OWN-DEC-17]]). The vault file is a draft (`status: draft-not-field-approved`, `owner_approved: false`).

Source file: `Standard Of Operations/sop new-construction.md`. Each group below names the source heading its steps come from, and every step keeps the vault wording (link targets removed). The original procedure is section 12; the other sections were added in the vault on 2026-10-03 from the spec and the SOP standard, pending review. HOLD, GATE and FLAG lines are review controls added on 2026-10-03, pending qualified review: a HOLD placed before a step must be cleared before that step starts. An "Evidence" line lists the photo, measurement or note that the step's own wording asks for; a step without one names none.

Required steps cannot be skipped ([[OWN-DEC-108]]); the completion sequence is [[OWN-DEC-109]] and the minimum photo rule is [[FACT-SVC-PHOTO-MINIMUM]]. Tools, materials and PPE: [[FACT-INVENTORY-DW-04]]. Safety gates: [[RULE-SAFETY-GATES]].

Section 12 phases listed under another stage because their heading names only that stage's work: Phase 5 to stage 4. All other phases stay in stage 3 in their original order.

## 1. Site preparation and property protection

### From "5. Customer and property preparation"

- The customer is the general contractor or developer. For every job, confirm that access, hazards and work-area conditions are still current (source: spec CX-005; 04 DW-04 customer preparation requirements).
- Contractor preparation named in the draft agreement and pricing (unapproved text; HUMAN REVIEW: attorney): an enclosed structure with active, safe heating ("Drying Temperature Clause"); rough-in inspections passed and signed off before hanging ("Pre-requisite Trades Sign-off"); production areas free of delivery, framing and other trades' obstructions ("Standby Crew Fee"); a complete board count where the contractor supplies board (pricing "GC Material Discrepancy Surcharge") (source: the clauses as quoted; 04 DW-04 customer preparation requirements).
  - Evidence: note
- Delivery staging locations agreed with the general contractor before delivery (source: spec DW-04.INT "delivery staging"; original "Load Calculation" step).
- A site contact, site access and the site's emergency arrangements are recorded (source: spec BRF-002, BRF-013; 02 G-060, GAP).
  - Evidence: note
- Other trades, site visitors and anyone else on site are kept out of active work areas such as lift operation, cutting and sanding; the coordination method with the general contractor is TBD (source: X-11; 02 G-060).
- No site-readiness checklist or evidence capture for these items exists yet (GAP) (source: 04 DW-04 customer preparation requirements; spec START-007).

## 2. Setup and required measurements/checks

### From "3. Preconditions"

- Service status: DW-04 is not bookable until the HND-004 approvals and the owner's go/no-go on builder subcontract work (general contractor terms, capacity with two employees, insurance documentation, scaffold and stilt policy, fire- and sound-assembly verification) (source: 04 DW-04 active/inactive status; spec HND-004; owner facts 2026-10-02).
- Intake complete from the builder: builder plans, unit/room schedule, board types/thicknesses, fire/sound assemblies, delivery staging, inspections, finish level (source: spec DW-04.INT).
- An accepted estimate version and an attorney-approved agreement version for the project; the current agreement file is a draft template, not for signature (source: spec CX-003; 30 D-30-14, PROPOSED; agreement status callout).
- HOLD (DW-04.SAF; critical): every inspection required before cover is recorded as passed, with evidence, for each area before any board covers a cavity (section 12, after "Inspection Check") (source: spec DW-04.SAF "coordinate inspections; ... do not cover incomplete/failed inspections"; START-010; 31 section 8.3 rule 2).
  - Evidence: note
- HOLD (C-DW04-02): the assembly schedule from the builder plans is verified before hanging (section 12, before the Phase 2 steps) (source: spec DW-04.SAF "verify assembly specifications"; 31 section 10).
- The "Climate Verification" precondition in section 12 (sealed envelope; the stated internal temperature held for the stated period before mud application) is met and recorded before any mud work; it is not relaxed by the pricing file's winter surcharge (C-DW04-04). The method and record of the temperature evidence are PROPOSED for owner and quality review; no threshold beyond the original step is set here (source: original SOP Phase 1; 02 C-DW04-04; spec START-007).
  - Evidence: note
- Site readiness confirmed at the pre-start site check against what the draft agreement asks of the general contractor: an enclosed and heated structure, rough-in inspections passed and signed off, production areas free of delivery, framing and other trades' obstructions, and a complete board delivery where the contractor supplies board (source: agreement "Pre-requisite Trades Sign-off", "Drying Temperature Clause", "Standby Crew Fee"; pricing "GC Material Discrepancy Surcharge"; spec START-007). A contractor's commitment never replaces HandyHub's own checks (source: 30 section 4.1 row 5).
  - Evidence: note
- HOLD (C-DW04-01): no scaffold, stilt or other elevated work position until an approved height and access policy exists; panel lifts only with an equipment qualification and a pre-use inspection (section 12). Until the policy is approved, this hold cannot be released by override (source: spec DW-04.TLS, DW-04.SAF; 02 G-005; 31 section 8.4 rule 4).
- Critical tools and materials loaded and matched to the job. Several items the steps use are not yet in the inventory and are proposed there: panel lifts, collated screw strips, paper tape, joint compound, long-reach sanders, Class M extractors, pole sanders and the LED scanning bar (source: spec START-005, START-006; C-DW04-08).
- Builder-supplied board: count, type and visible condition recorded before hanging (source: spec START-009; 29 section 9.1).
  - Evidence: note
- Equipment qualification tags recorded for scheduling and checked before start (source: spec SCH-003, START-010; DW-04.SAF "equipment qualification").
  - Evidence: note
- Site safety arrangements with the general contractor (site orientation, emergency arrangements, coordination with other trades) recorded before work: TBD — requires review by safety-liability-manager and a qualified person; owner to approve. (source: 02 G-060 "no multi-employer site-safety coordination with the GC")
  - Evidence: note
- Weather and site conditions suitable at start; thresholds are set by the qualified safety professional, none here; if unsuitable, record No Start / Blocked (source: spec START-011 "severe weather", SCH-008; X-27).
  - Evidence: note
- Appendix A checks before leaving and before starting: correct job and address, latest changes, scope and exclusions, hazards, critical tools and materials loaded, customer-supplied items, approvals confirmed; start only when Ready or an authorized exception is documented (source: spec APXA-001, APXA-003).
  - Evidence: note

### From "11. Setup"

- On arrival: confirm the address, unit or lot, work area and site contact; park and access as the site allows; identify other trades and anyone else on site; inspect the site against the briefing (source: spec APXA-002).
- Site orientation and emergency arrangements with the general contractor before work: TBD (source: 02 G-060).
- Confirm the delivery staging locations agreed with the general contractor (source: spec DW-04.INT "delivery staging"; original "Load Calculation" step).
- Existing-condition photos before work, including windows, glass and finished surfaces next to the work areas, because the agreement's glass clause relies on documented pre-existing scratches (source: spec START-008, APXA-002; X-02).
  - Evidence: photo, note
- Inspection evidence for each area checked before hanging (section 12 hold) (source: spec START-010).
- Envelope and temperature checked and recorded before mud work (section 12 hold) (source: original "Climate Verification" step; C-DW04-04).
  - Evidence: note
- Pre-use inspection of panel lifts and powered equipment per the manufacturer's instructions (section 12 hold) (source: spec DW-04.SAF "equipment qualification").
- Dust extraction connected to the sanders before Phase 4 starts, as "Power Sander Deployment" requires (source: original Phase 4).
- Protect the work area; identify utilities and emergency constraints relevant to the task (source: spec APXA-002).
- Work areas kept clear of anyone who is not part of the crew (source: X-11).

## 3. Service-specific work steps

### From "12. Step-by-step procedure" (introduction)

All original procedure lines appear below verbatim and in their original order; the five original phase headings are demoted one level. Added lines start with `HOLD` or `FLAG` inside a quote block and are pending qualified review.

> HOLD (C-DW04-01): applies to every step below. No step is performed from a scaffold, on stilts or from any other elevated work position unless an approved height and access policy allows it. None exists yet (02 G-005; Q-31-09), so this hold cannot be released by override (31 section 8.4 rule 4). If a step cannot be done without working at height, stop and escalate (section 19). Pending qualified review. (source: spec DW-04.TLS "scaffolds/stilts only under approved policy"; DW-04.HAZ "falls, scaffold/stilt risk"; 31 section 10)

### From "12. Step-by-step procedure / 🕒 Phase 1: Bulk Material Logistics & Staging"

- [ ] **Load Calculation:** Coordinate with suppliers to deliver pre-calculated sheet counts directly into designated rooms via crane/boom truck, eliminating manual hauling times.

> HOLD (DW-04.SAF "safe staging/handling"): during the delivery in the step above, HandyHub workers stay clear of the supplier's crane or boom-truck lifting operation, which the supplier controls (RISK). Staging locations, stack placement in rooms and the way sheets are moved follow controls set by the qualified safety professional with the general contractor; no load, distance or stack height is set here. Stop and escalate if a delivery, a stack or a lift is unsafe. Pending qualified review. (source: spec DW-04.HAZ "material handling"; DW-04.SAF "safe staging/handling"; 31 section 10)

- [ ] **Climate Verification:** Ensure the building envelope is fully sealed (windows and doors installed). Internal building temperature must be maintained above 50°F (10°C) for 48 hours prior to mud application to prevent freeze-cracking.

> HOLD (C-DW04-04): the precondition in the step above stays in force as written and is not relaxed by pricing: the pricing file's "Winter Heat Surcharge" for sites without temporary heat is never a reason to apply mud where the step above is not met. If the envelope is not sealed, or the temperature condition is not met or cannot be shown, do not start mud work; record No Start / Blocked for that work and escalate (section 19). Record the temperature evidence before mud application (PROPOSED; the measurement method and the record are set by the owner and the quality reviewer, and no new threshold or device is set here). The draft agreement also asks the contractor to keep the heat through the sanding phase; whether this SOP adopts that is a reviewer decision. Pending qualified review. (source: spec START-007, SCH-008; 02 C-DW04-04; 31 section 10; agreement "Drying Temperature Clause")

- [ ] **Inspection Check:** Verify that electrical, plumbing, and HVAC rough-ins have passed municipal building code inspections before covering any wall frame cavity.

> HOLD (DW-04.SAF; critical): do not cover incomplete or failed inspections. Before the hanging steps of Phase 2 below, every inspection required before cover for the area is recorded as passed, with evidence: the electrical, plumbing and HVAC rough-ins named in the step above and any other pre-cover inspection that the builder's schedule or the local authority requires (no list is concluded here; HUMAN REVIEW: building official). If an inspection is incomplete or failed, or its evidence is missing, do not hang board over that area; record No Start / Blocked for it and escalate (section 19). This is a critical hold: no role can override it, and it clears only on recorded evidence that the inspection passed (31 section 8.3 rule 2). The contractor's sign-off commitment in the draft agreement ("Pre-requisite Trades Sign-off") does not replace this check. Pending qualified review. (source: spec DW-04.SAF "coordinate inspections; ... do not cover incomplete/failed inspections"; DW-04.INT "inspections"; START-010; 31 section 10)

### From "12. Step-by-step procedure / 🔨 Phase 2: Rapid Production Hanging Line"

> HOLD (C-DW04-02): before "Adhesive Layering" and every hanging step below: verify the assembly schedule from the builder plans for each unit or room before hanging: board types and thicknesses, fire- and sound-rated assemblies, and the fastening that the listed assembly and the board manufacturer require. If the plans or the schedule are missing, or the specified board or assembly does not match the site, do not hang; stop and escalate (section 19). Pending qualified review. HUMAN REVIEW: building official; manufacturer listed-assembly documentation. (source: spec DW-04.INT "builder plans, unit/room schedule, board types/thicknesses, fire/sound assemblies"; DW-04.SAF "verify assembly specifications"; 31 section 10)

- [ ] **Adhesive Layering:** Apply structural drywall adhesive beads in continuous zig-zag patterns along all center wood/metal framing studs right before hanging (reduces required screw counts by 30% and prevents future nail pops).

> FLAG (C-DW04-02): UNSOURCED - verify against manufacturer instructions. The screw-count reduction in the step above ("reduces required screw counts by 30%") has no source. Fastener type, spacing and count follow the board manufacturer's instructions and the listed fire- or sound-rated assembly in the builder plans, never this figure, and adhesive is used only where those allow it. "prevents future nail pops" is an outcome claim and is not repeated to the general contractor or anyone else. The step text above is unchanged. HUMAN REVIEW: building official; manufacturer listed-assembly documentation; design professional.

> HOLD (C-DW04-01): before "Panel Lifter System" below: mechanical panel lifts are operated only by a worker who holds the equipment qualification the owner sets, after a pre-use inspection per the manufacturer's instructions; both are pending review. Using the lifts for high ceilings is part of the pending height and access review, and handling the heavy sheets follows the qualified safety professional's controls. If any of these is missing, do not use the lift; stop and escalate (section 19). Pending qualified review. (source: spec DW-04.TLS "panel lifts/carts"; DW-04.SAF "equipment qualification"; DW-04.HAZ "material handling, falls"; 31 section 10)

- [ ] **Panel Lifter System:** Utilize mechanical panel lifts (drywall jacks) to hold heavy 12-foot or 14-foot sheets flat against high ceilings, maximizing installation speed.
- [ ] **Fastener Automation:** Use automated auto-feed drywall screw guns with collated screw strips to fasten boards at high velocity, ensuring consistent recess depths.

### From "12. Step-by-step procedure / 🧽 Phase 3: Automated Mechanical Taping & Boxing"

- [ ] **The Bazooka Run:** Utilize an automatic mechanical taper (Bazooka) to simultaneously feed, coat, and apply paper tape over all flat and internal corner joints in a single rapid pass.
- [ ] **Mechanical Boxing Lines:** Run a 7-inch mechanical flat box to apply the first bed coat over joints, followed immediately by mechanical corner finishers (flushers) for internal lines.
- [ ] **The Secondary Box Pass:** After 12 hours of drying, run a 10-inch or 12-inch mechanical flat box to distribute the secondary feathering coat over all seams at production speed.

> FLAG (04 DW-04 "SOP reference" row): UNSOURCED - verify against manufacturer instructions. "After 12 hours of drying" in the step above has no source; drying time depends on the compound and on site temperature and humidity, and comes from the compound manufacturer's instructions. The stated wait is never shortened on site and stays in force as written until a qualified reviewer replaces it; if the coat is not dry, the next pass waits. The step text above is unchanged. (source: 31 section 3.5 rule 3)

### From "12. Step-by-step procedure / 🌬️ Phase 4: Industrial Mechanical Sanding"

- [ ] **Power Sander Deployment:** Equip crew members with long-reach rotary drywall sanders (e.g., Festool Planex or Mirka Leros) linked directly to industrial M-class HEPA dust extractors.
- [ ] **Unified Grit Sequence:** Sand all production walls uniformly using 150-grit mesh discs, moving fluidly down rows without pausing to prevent circular groove marks.
- [ ] **Bead Buffing:** Use manual pole sanders to sand metal corner beads, exposing the clean metal edge line cleanly for sharp lines.

## 4. Quality checks

### From "12. Step-by-step procedure / ✨ Phase 5: Commercial QA Audit & Sign-Off"

- [ ] **Flashing Verification:** Inspect all walls using a 10,000-lumen LED scanning bar held parallel to the wall to catch "joint flashing" (shadow differences between paper and mud).
- [ ] **Punch-List Resolution:** Form a rapid-response team of 2 finishers to circle the building, resolving minor imperfections marked by inspectors within 2 hours.

> FLAG (C-DW04-05): capacity unverified - owner decision. The step above forms "a rapid-response team of 2 finishers" and sets a response "within 2 hours". HandyHub starts with two employees (owner facts 2026-10-02), so a separate team is not available, and the response time is a service-level commitment the owner has not approved; it is not stated to the general contractor or anyone else. Punch items are recorded with owner, due date and completion evidence (spec QA-005). The step text above is unchanged. HUMAN REVIEW: owner.

- [ ] **Turnover Protocol:** Issue an official, clean, paint-ready handover certificate to the general contractor to release milestone payment draws.

> FLAG (C-DW04-12): certification and payment wording - owner and attorney review. "Issue an official, clean, paint-ready handover certificate" in the step above implies a certification authority that no file establishes, and tying it "to release milestone payment draws" makes it a payment document under the draft agreement. Its name, wording and effect are decided by the owner and the attorney before this SOP is activated; until then the handover is recorded as the walkthrough outcome and the completion evidence (spec QA-004, QA-006). The step text above is unchanged. HUMAN REVIEW: attorney licensed in KY/IN; owner.

> FLAG (31 section 10; 02 G-060; C-DW04-01): no step in this SOP installs corner bead, cuts openings for electrical boxes or lights with the router, or works from scaffolds or stilts, although the spec card, the inventory or the main plan names them. They are not performed under this SOP (section 2, Out of scope). Pending owner decision and competent review.

### From "13. Quality checkpoints"

> Spec card DW-04.QAC (verbatim): "correct board/assembly placement, fastening/finish quality, corners/openings, production checklist, punch under lighting, clean handoff"

- Correct board and assembly placement against the verified assembly schedule from the builder plans (source: spec DW-04.QAC "correct board/assembly placement"; C-DW04-02).
- Fastening per the board manufacturer and the listed assembly, not the unsourced screw-count reduction (section 12 flag); finish quality to the finish level stated in the approved scope (source: spec DW-04.QAC "fastening/finish quality"; DW-04.INT "finish level"). A shared definition of finish levels does not exist yet (source: 04 DW-04 quality checklist row, GAP).
- Corners and openings checked (source: spec DW-04.QAC "corners/openings"; original "Bead Buffing" step).
- A production checklist per unit or room, recorded as the work proceeds; its format is TBD by the owner and the quality reviewer (source: spec DW-04.QAC "production checklist"; 04 DW-04 completion evidence, PROPOSED).
  - Evidence: note
- Punch under lighting: the "Flashing Verification" step under the scanning bar; punch items recorded with owner, due date and completion evidence (source: spec DW-04.QAC "punch under lighting"; QA-005).
  - Evidence: note
- Clean handoff: cleanup complete (section 14) and a handover note, including that glass was not cleaned where that applies (source: spec DW-04.QAC "clean handoff"; 04 DW-04 exclusions, PROPOSED).
- Each check is answered, or an exception recorded, before completion (source: spec QA-001). Whether a supervisor, not only the worker, inspects any check is an owner decision (Q-31-15); a worker's self-check does not replace a required supervisor inspection (source: quality-assistant playbook).
  - Evidence: note

## 5. Cleanup and waste handling

### From "14. Cleanup"

- Remove debris, offcuts and protection, and leave a clean handoff for the next trade (source: spec QA-002, APXA-005; DW-04.QAC "clean handoff").
- Account for tools and materials; return unused materials, and record what happens to leftover builder-supplied board (source: spec APXA-005, APXA-007; 29 section 9.1).
  - Evidence: note
- Restore anything altered within scope (source: spec APXA-005).

### From "15. Waste handling"

- Waste streams from the steps: board offcuts, empty compound containers, tape and packaging, sanding dust collected by the extractors, and adhesive tubes (source: original Phases 2 to 4; inventory file).
- Destination, containers and who removes the waste on a builder site, for example whether the general contractor's site containers may be used: TBD — requires review by safety-liability-manager and a qualified person; owner to approve. (source: spec QA-002 "debris/waste handling"; 02 G-060, G-078; Q-29-10)
- Adhesive tubes and compound residue: handling per the product SDS (source: 29 section 8.2 row 10).
- Hazardous waste is not handled without an approved policy (source: 31 section 3.1, section 15 minimum content).
- Whether disposal is charged is an owner pricing decision (source: 28 Q-28-15).

## 6. Final checks, completion photos and walkthrough

### From "16. Photo requirements (before / during / after)"

- Before: each unit or room as found, including windows, glass and finished surfaces next to the work area, and the staged board, with the START-009 record where the contractor supplied it (source: spec START-008, START-009, APXA-002; X-02).
  - Evidence: note
- During: inspection evidence for each area before it is covered; the temperature evidence before mud work (PROPOSED, C-DW04-04); any concealed condition, damage or site difference found (source: spec START-010, JOB-004; 04 DW-04 completion evidence, PROPOSED).
- After: each unit or room after the final pass and after punch work, mapped to the unit or room (source: spec QA-003; 04 DW-04 completion evidence "photos per unit/room (QA-003)").
  - Evidence: photo
- Photos are internal by default; marketing use needs separate consent; avoid people, documents and other trades' property not needed for the work (source: spec REC-002, REC-003; 31 section 3.5 rule 7).

### From "17. Customer communication"

- The customer is the general contractor or developer; arrival and completion updates use approved templates only (source: 31 section 3.1, section 17 minimum content; spec NTF-007, UXE-008).
- Walkthrough outcome recorded with the contractor's representative: accepted, accepted with punch items, unavailable or disputed (source: spec QA-004, APXA-006).
  - Evidence: note
- Care or cure notes come only from approved product data (source: spec QA-008).
- Do not promise speed, results, finish quality, a punch response time or code compliance, and do not repeat unapproved main-plan claims such as "flawless, paint-ready accuracy" or "a perfect wall template" (C-DW04-12, C-DW04-05) (source: section 2, Do not perform entry 8; 04 DW-04 customer-facing description).
- Do not issue any certificate or sign-off document beyond the wording the owner and the attorney approve (section 12 flag; C-DW04-12).
  - Evidence: note
- Report delays and blocked work in the app with evidence; tell the contractor only what the approved "work blocked" message says (source: spec JOB-004, SCH-008, NTF-007).
  - Evidence: note
- Explain the invoice and payment next step without making unauthorized promises (source: spec APXA-006).

### From "18. Completion criteria"

- Every section 13 check answered, or an exception recorded (source: spec QA-001).
  - Evidence: note
- Production checklist complete for each unit or room (source: spec DW-04.QAC "production checklist").
- Inspection evidence recorded for every covered area (source: spec START-010; DW-04.SAF).
  - Evidence: note
- After photos mapped to each unit or room (source: spec QA-003).
  - Evidence: photo
- Cleanup and waste handling complete; tools and materials accounted for (source: spec QA-002, APXA-005).
- Walkthrough outcome and punch items recorded with owner, due date and evidence (source: spec QA-004, QA-005, APXA-006).
  - Evidence: note
- No hold or stop-work item left unresolved (source: 31 section 8.3).
- An invoice for a unit block follows verified completion of that block (source: agreement "Invoices will be submitted upon completion of individual unit blocks"; spec FIN-003, QA-006; 04 DW-04 completion evidence, PROPOSED).
- Unresolved issues, incidents and change follow-ups submitted; the job closes only when the required operational and financial steps are complete (source: spec APXA-007).

## Stop-work triggers, escalation and incidents (service-specific)

### From "10. Stop-work conditions"

This SOP words its general stop-work rule differently from [[FACT-SVC-STOP-WORK-RULE]]; its own text, verbatim:

> **Stop-work rule (all HandyHub services).** You have the right to stop work. For any condition below, stop the affected work and escalate before continuing (source: spec START-011, JOB-004):
> - an unsafe condition for you, the customer, occupants, pets or the public;
> - concealed damage, substrate failure, moisture or an active leak;
> - suspect hazardous material, such as possible asbestos, lead paint or mold; do not disturb it;
> - electrical, plumbing, gas, HVAC or structural work that is not in the approved scope or needs a licensed trade;
> - an aggressive occupant or animal;
> - severe weather or unsafe heat or cold (source: spec BRF-008);
> - any material mismatch between the site and the briefing, approved scope, materials, access or approvals.
>
> Do not continue through an unsafe or restricted condition to keep the schedule (source: master section 12). A customer request, a checkbox or a signature does not clear a safety hold (source: owner facts 2026-10-02; risk-triage playbook L27). In an emergency, move people away and call emergency services first (source: spec BRF-013; risk-triage playbook L7). Then use Stop Work / Report Hazard in the app (source: spec UXE-004) and follow section 19.
> Spec card DW-04.SAF (verbatim): "coordinate inspections; verify assembly specifications; safe staging/handling; equipment qualification; do not cover incomplete/failed inspections"

Service holds and stop triggers (pending qualified review):
- HOLD (DW-04.SAF; critical): do not cover incomplete or failed inspections; no override; it clears only on recorded evidence that the inspection passed (sections 3 and 12).
  - Evidence: note
- HOLD (C-DW04-02): the assembly specifications from the builder plans are verified before hanging; stop if the plans, the schedule or the board do not match the site (section 12).
- HOLD (C-DW04-01): no scaffold, stilt or elevated work position without an approved height and access policy; panel lifts only with an equipment qualification and a pre-use inspection (section 12).
- HOLD (C-DW04-04): the "Climate Verification" precondition is kept as written and is not relaxed by pricing; if it is not met or cannot be shown, no mud work (section 12).
- Safe staging and handling: stop if a delivery, a stack or a lift is unsafe; stay clear of supplier lifting operations (source: spec DW-04.SAF "safe staging/handling"; 31 section 10).
- Equipment without the required qualification, or that fails its pre-use inspection: do not operate it (source: spec DW-04.SAF "equipment qualification").
- Incomplete framing or utilities found in the work area (source: spec DW-04.HAZ "incomplete framing/utilities").
- An unsafe condition from temporary heating units or from other trades' work (source: agreement "Drying Temperature Clause"; 04 DW-04 hazards; spec START-011).
- Severe weather or unsafe heat or cold (source: spec BRF-008; X-27).
- Anyone who is not part of the crew enters an active lift, cutting or sanding area (source: X-11).

### From "19. Escalation"

General path: [[FACT-SVC-ESCALATION-PATH]].

Service-specific routing (contacts are owner decisions, Q-31-05):
- Inspection incomplete, failed or without evidence: record No Start / Blocked for the affected areas and escalate to the owner, who takes it up with the general contractor; no board is hung there (source: section 12 hold; spec DW-04.SAF, SCH-008).
- Assembly specification missing or not matching the site: to the owner, who obtains the specification through the general contractor; assembly questions go to the building official or the design professional, and no conclusion is drawn here (source: section 12 hold; C-DW04-02).
- Unsafe delivery, staging or lifting by a supplier: stop, stay clear and escalate to the owner and the general contractor's site contact (source: spec DW-04.SAF "safe staging/handling").
- Temperature precondition not met: no mud work; escalate to the owner, who takes it up with the general contractor (source: section 12 hold; C-DW04-04).
- Any request to work from scaffolds, on stilts or at height: to the owner; not performed until the policy exists (source: C-DW04-01; Q-31-09).
- Hazards created by other trades or by temporary heating units: to the general contractor's site contact and the owner; no conclusion about site-safety duties is drawn here (source: 04 DW-04 hazards; HUMAN REVIEW: qualified safety professional (multi-employer site)).

### From "20. Incident reporting"

General path: [[FACT-SVC-INCIDENT-REPORTING]].

## Spanish translation status (section 22)

| Field | Value |
|---|---|
| Spanish version | Not started |
| Source English version | None yet: no `sop_version` is assigned to this draft |
| Translator (role) | `<owner decision>` |
| Bilingual reviewer (role) | `<owner decision: qualified bilingual reviewer>` (Q-31-02) |
| Safety glossary version | None exists yet (GAP; HND-006) |
| Last review | Not reviewed |
| Notes | The steps contain no Arabic or other non-English text; the emoji in the original H1 and in the five original phase headings, and the brand names in "Power Sander Deployment", are kept verbatim |

## Open questions in the source SOP

- **Q-31-09** (owner; qualified safety professional): height and access policy: maximum working heights, equipment types, and who may use lifts, scaffolds and stilts?
- **04 DW-04 card, active/inactive status** (owner; HUMAN REVIEW: attorney, insurance broker, qualified safety professional): go or no-go on builder subcontract work at launch, given the general contractor terms, the capacity of two employees, insurance documentation, the scaffold and stilt policy and assembly verification.
- **04 DW-04 card, permit/license flags** (owner; HUMAN REVIEW: building official): who verifies fire- and sound-rated assembly specifications and keeps inspection evidence before cover, and which pre-cover inspections apply in each municipality?
- **Q-30-04** (owner; HUMAN REVIEW: attorney): which customer types are offered at launch, and does this SOP cover commercial projects at all (C-DW04-09, X-23)?
- **Q-31-01** (owner): who are the competent reviewers (qualified safety professional; building official for assemblies and inspections), and how is their competence evidenced?
- **Q-31-05** (owner): emergency and escalation contacts, including the general contractor's site contact, and after-hours coverage for a two-person team.
- **Q-31-15** (owner): which section 13 checks need a supervisor rather than the worker's self-check?
- **Q-31-16** (owner; attorney): who approves replacement wording for the promissory original lines (the punch response time, the handover certificate)?
- **Q-31-18** (qualified safety professional; owner): which DW-04 holds are critical holds under the 31 section 8.4 rule? The inspection hold is critical under 31 section 8.3 rule 2.
- **Q-31-02** (owner): who is the qualified bilingual reviewer for the Spanish version?
