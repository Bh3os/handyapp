---
id: SOP-CL-07
type: sop
title: "SOP CL-07: Air Duct & Ventilation Cleaning"
status: active
area: field
links:
  part_of: ["[[SVC-CL-07]]", "[[S07]]"]
  decided_by: ["[[OWN-DEC-108]]", "[[OWN-DEC-109]]", "[[OWN-DEC-17]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]", "[[RULE-HUMAN-REVIEW]]", "[[RULE-NO-INVENTED-FACTS]]", "[[FACT-SVC-STOP-WORK-RULE]]"]
  uses: ["[[FACT-INVENTORY-CL-07]]", "[[FACT-SVC-PHOTO-MINIMUM]]", "[[FACT-SVC-ESCALATION-PATH]]", "[[FACT-SVC-INCIDENT-REPORTING]]"]
source: "vault Standard Of Operations/sop Air Duct and Vent Cleaning Checklist.md; OWN-DEC-108"
---
Worker checklist for [[SVC-CL-07]] (Air Duct & Ventilation Cleaning). Status: active for the job checklist under [[OWN-DEC-108]], pending competent review for production use ([[OWN-DEC-17]]). The vault file is a draft (`status: draft-not-field-approved`, `owner_approved: false`).

Source file: `Standard Of Operations/sop Air Duct and Vent Cleaning Checklist.md`. Each group below names the source heading its steps come from, and every step keeps the vault wording (link targets removed). The original procedure is section 12; the other sections were added in the vault on 2026-10-03 from the spec and the SOP standard, pending review. HOLD, GATE and FLAG lines are review controls added on 2026-10-03, pending qualified review: a HOLD placed before a step must be cleared before that step starts. An "Evidence" line lists the photo, measurement or note that the step's own wording asks for; a step without one names none.

Required steps cannot be skipped ([[OWN-DEC-108]]); the completion sequence is [[OWN-DEC-109]] and the minimum photo rule is [[FACT-SVC-PHOTO-MINIMUM]]. Tools, materials and PPE: [[FACT-INVENTORY-CL-07]]. Safety gates: [[RULE-SAFETY-GATES]].

Section 12 phases listed under another stage because their heading names only that stage's work: Phase 1 to stage 1. All other phases stay in stage 3 in their original order.

## 1. Site preparation and property protection

### From "5. Customer and property preparation"

- No CL-07 file defines customer preparation (source: 04 CL-07 "customer preparation requirements", GAP).
- PROPOSED for the preparation checklist, wording for owner and attorney approval: clear access to all registers, returns and the air handler; filter size; occupants or pets with respiratory sensitivity; acceptance of a power interruption; items near vents moved or covered (source: 04 CL-07 "customer preparation requirements"; spec CL-07.INT).
- PROPOSED: occupants, children and pets stay out of rooms with open registers and away from equipment and hoses while work runs (source: X-11; spec CX-005; 31 section 5.8 occupants module, pending).
- Every job re-confirms access, occupants, pets, parking, hazards and work-area conditions (source: spec CX-005).
- HandyHub's own pre-start checks are never moved onto the customer (source: 30 section 4.1 clause 5).

### From "12. Step-by-step procedure / 🛠️ Phase 1: System Isolation & Property Protection"

> HOLD (precondition; C-CL07-V03; spec CL-07.INT, CL-07.SAF): before "System Shutdown" below, confirm the intake facts ("HVAC system type, accessible registers/returns, reported concern, filter size, suspected mold/pest/contamination, equipment capability") against the site, and photograph the air-handler area where it is accessible, each accessible register and return, and any visible ductwork; do not enter an attic or crawlspace for this screen (section 2, Out of scope). If you see suspected significant mold, suspect asbestos-containing material (for example older duct wrap, tape or mastic), damaged ducts, or work that needs a licensed HVAC professional, do not start: record it and escalate (section 10). This screen is a safety hold, not the "Base Inspection" named in the pricing file, and it certifies nothing. Pending review.

> HOLD (precondition; C-CL07-06; X-07; spec CL-07.SAF "system off/isolation per procedure"): before "System Shutdown" below, note that the isolation method is under review by a licensed HVAC contractor or electrician: which breaker the step means (the home's main breaker or the HVAC equipment's own circuit), lockout against re-energizing, verification and restore are not yet defined. The isolation requirement stays in force; do not skip it and do not improvise another method. Do not switch off any circuit breaker until the customer has been told that power will be interrupted and has accepted it; if the customer does not accept, or anything in the home depends on uninterrupted power, do not start and escalate (section 19). Confirm before isolation how the vacuum, drill and compressor are powered, so nothing is re-energized mid-job. Pending review.

- [ ] **System Shutdown:** Turn off the HVAC system at the thermostat and switch off the main circuit breaker to ensure operator safety.
- [ ] **Containment:** Lay plastic drop cloths over all furniture, flooring, and beds directly beneath or near air vents to catch dislodged soot.

> FLAG (C-CL07-V01; X-11): the step above relies on drop cloths to "catch dislodged soot" that falls into rooms, and "Grille Removal" below opens every register, while the inventory stocks foam block-off plugs and magnetic vent seals for sealing registers under negative pressure, which no step uses. The containment method for "Agitation Run" and "Vacuum Extraction" is unresolved pending qualified safety review (equipment manufacturer instructions; licensed HVAC contractor for any access openings); no method is written here. Keep occupants, children and pets out of rooms with open registers while the work runs (spec CX-005; X-11). Pending review.

## 2. Setup and required measurements/checks

### From "3. Preconditions"

*Dispatch and Start Job gates for this service (source: spec APXA-001, APXA-003; 31 section 3.1 row 3). Every item is pending review.*

- Intake complete: "HVAC system type, accessible registers/returns, reported concern, filter size, suspected mold/pest/contamination, equipment capability" (source: spec CL-07.INT).
  - Evidence: note
- Suspected mold or another hazardous condition at intake blocks a firm quote and routes the job to a site assessment first (source: estimate-assistant playbook "Missing hazardous-condition decisions block a firm quote."; 04 CL-07 "estimating method").
- An approved estimate version covers the tasks in section 2; start only when Ready or an authorized exception is documented. Work listed under "Out of scope" is not performed even if it was quoted (source: spec CX-003; APXA-003; 28 PRC-042, PROPOSED).
  - Evidence: note
- CL-07 is not bookable until an approved agreement or scope schedule is active; the agreement file is a structure-only skeleton (source: 30 AGR-031, PROPOSED; 02 G-001).
- Licensed-task and specialist holds: where policy flags plenum access, a furnace connection, suspected mold, suspected asbestos or biocide use, Start Job stays blocked until the prerequisite is approved (source: spec START-010; 04 CL-07 "prerequisites", PROPOSED; C-CL07-07).
- Equipment capability documented: whether the negative-pressure HEPA vacuum, compressor and drill are owned or rented, and how they are powered while the HVAC system is isolated (source: spec CL-07.INT "equipment capability"; owner facts 2026-10-02 "Reported capability is not documentary proof of ... equipment"; C-CL07-06).
  - Evidence: note
- The customer has been told that power will be interrupted and has accepted it; wording pending owner and attorney review (source: 04 CL-07 "prerequisites" and "customer preparation requirements"; C-CL07-06).
- Height and access: grilles and fans that need access equipment stay blocked until an approved height and access policy exists (source: spec CL-07.HAZ "ladder"; 02 G-005; X-12; 31 section 8.4 rule 4; job-planner playbook "A missing ladder or unverified permit keeps affected tasks blocked.").
- Every chemical product carried has a reviewed SDS; none is approved yet, so none is carried (source: 29 section 8.3 interim rule, PROPOSED; X-09).
- Before this SOP can be activated, the named reviewers approve: the isolation method (C-CL07-06); the "Agitation Run" step and the company mold definition (C-CL07-01; Q-31-10); the containment method (C-CL07-V01); the duct-type and tool check before agitation; the licensed-scope boundary (C-CL07-07); the filter specification (HVAC review) (source: 31 section 10 CL-07; owner facts L20).

### From "11. Setup"

- On arrival: confirm address, work area and contact; identify pets and occupants; inspect the actual site against the briefing; capture required existing-condition photos; protect the work area; identify utilities and emergency constraints relevant to the task (source: spec APXA-002).
  - Evidence: photo
- Pre-work screen with photos before any step, and a second screen at each opened register before boot vacuuming (holds in section 12; source: C-CL07-V03; spec CL-07.SAF).
- Protection and containment: drop cloths per "Containment"; the containment method is unresolved (source: SOP "Containment"; C-CL07-V01).
- Isolate-verify-restore: "System Shutdown" isolates the system, but the isolation point, verification and restoration are not defined, and the shared isolate-verify-restore module does not exist yet (source: X-07; C-CL07-06; 31 section 5.8).
- Staging of the vacuum unit, hoses, compressor and access equipment: TBD — requires review by safety-liability-manager and a qualified person; owner to approve.
- Before starting: complete the required safety, PPE and site checks; acknowledge the SOP and hazards; start only when Ready or an authorized exception is documented (source: spec APXA-003; START-004).
  - Evidence: note

## 3. Service-specific work steps

### From "12. Step-by-step procedure" (introduction)

*The original procedure lines below are unchanged and in their original order. Lines starting with "HOLD" or "FLAG" were added on 2026-10-03; they are pending review and never replace the step text. A hold placed before a step must be satisfied before that step starts; a hold placed after a step limits or suspends the step above it.*

### From "12. Step-by-step procedure / 🌀 Phase 2: Dismantling & Ultrasonic/Manual Washing"

> HOLD (precondition; X-12; spec CL-07.HAZ "ladder"; 02 G-005): before "Grille Removal" below, grilles on ceilings, and any grille you cannot reach while standing on the floor, need access equipment under an approved height and access policy; none exists and no ladder is stocked. Until it exists, leave those grilles in place and record them as not done (section 13). Pending review.

- [ ] **Grille Removal:** Unscrew and carefully remove all supply (output) and return (intake) vent grilles from walls and ceilings.
- [ ] **Deep Scrubbing:** Submerge metal grilles in warm, soapy water; scrub away grease, dust build-up, and nicotine film, then dry them completely.

> HOLD (precondition; spec CL-07.SAF; X-06): before "Boot Vacuuming" below, look into each opened register boot and photograph it. If you see suspected mold growth, suspect asbestos-containing material, a damaged duct or damaged duct lining, do not vacuum or disturb that opening: record it and escalate (section 10). Until the company mold definition exists, suspected mold growth is treated as a critical hold (31 section 8.4 rule 2; Q-31-10). Pending review.

- [ ] **Boot Vacuuming:** Use a vacuum brush attachment to clean out the immediate metal "boot" connection inside the wall before deep duct entry.

### From "12. Step-by-step procedure / 🌬️ Phase 3: Deep Agitation & Negative Pressure Extraction"

> FLAG (C-CL07-V01): the containment method for "Agitation Run" and "Vacuum Extraction" below is unresolved - pending safety review (see the flag under "Containment"). No containment or negative-pressure method is written here.

> HOLD (precondition; spec CL-07.HAZ "damage to duct lining"; 31 section 10 CL-07): before "Agitation Run" below, record the duct type and the condition of any duct lining at each opened register, and confirm from the brush and air-whip manufacturers' instructions that the tool suits that duct type. If the duct type is unknown, the lining is damaged or the tool is not approved for it, do not insert the tool: record the limitation (section 13) and escalate. Pending review.

- [ ] **Agitation Run:** Insert flexible rotary cleaning brushes or pneumatic air whips deep into each individual duct line to break up caked-on dust and mold spores.

> HOLD (C-CL07-01, critical; X-06): the step above is held pending review by a qualified safety professional and a mold assessor. It treats breaking up "mold spores" as routine work, while spec CL-07.SAF says "stop on suspected significant mold, asbestos-containing material, damaged ducts or scope requiring licensed HVAC work". Until the reviewers release the step and the company mold definition exists (Q-31-10), the step is not performed; wherever mold growth is suspected, do not agitate, vacuum or treat it - stop and escalate (section 10). Mold remediation is not performed under this SOP (section 2, Do not perform 10). Pending review.

> HOLD (precondition; C-CL07-07; spec CL-07.SAF "scope requiring licensed HVAC work"): before "Vacuum Extraction" below, note that the step does not say how the vacuum is attached to the trunk line, and no attachment method is approved. Do not cut, patch or seal an opening in the plenum or a trunk line, and do not connect any equipment to the furnace: whether that is licensed HVAC or permit work in the job's municipality is open, and only a licensed HVAC professional does it if the licensing review allows it (Do not perform 11; HUMAN REVIEW: licensing authority for the municipality, licensed HVAC contractor). If extraction needs either, stop and escalate. Pending review.

- [ ] **Vacuum Extraction:** Run a heavy-duty negative pressure truck-mounted or portable HEPA vacuum system attached to the trunk line to suck out all loose debris.

> HOLD (C-CL07-03, critical): no fogging, misting or spraying of any sanitizer, disinfectant or biocide follows the step above. The pricing file sells antimicrobial fogging "after vacuuming", but fogging is not covered by this SOP and is not performable until a specific product with label directions for duct use and its SDS are approved, with occupant, pet and re-entry controls set by the reviewer (31 section 10 CL-07; 29 section 8.2 item 9; HUMAN REVIEW: qualified safety professional; state pesticide regulator). Pending review.

> HOLD (precondition; spec CL-07.HAZ "electrical/mechanical equipment"; X-07; X-12): before "Exhaust Systems" below, confirm that the range-hood fan and the bathroom extractor fan are off and isolated so they cannot start while hands or tools are in them; whether "System Shutdown" covers them depends on the isolation method under review (C-CL07-06). If isolation cannot be confirmed, do not put hands or tools into the fan; escalate. A ceiling-mounted fan you cannot reach while standing on the floor needs access equipment under the height and access policy, which does not exist yet: leave it and record it as not done (section 13). Pending review.

- [ ] **Exhaust Systems:** Meticulously scrape caked grease from kitchen range hood exhaust fan blades; vacuum dust out of bathroom extractor fans.

> FLAG (C-CL07-05; X-23; C-CL07-04): the step above covers residential kitchen range-hood fan blades and bathroom extractor fans only. Commercial kitchen exhaust (hoods, fan paths and ducts) is not covered (C-CL07-05; X-23), and dryer-vent lines are not covered (C-CL07-04). Under the PROPOSED boundary, range-hood filters belong to CL-02 and hood fans and ducts to CL-07 (04 section 5; Q-04-15). The step names no chemical; any degreaser must be an approved product with a reviewed SDS (29 section 8.3). Pending review.

### From "12. Step-by-step procedure / 🔄 Phase 4: Filtration Swap & Air Verification"

> HOLD (precondition; spec CL-07.QAC "filter installed if included"; spec CL-07.INT "filter size"): before "Filter Removal" below, confirm that filter replacement is included in the approved estimate and that the replacement filter is on site and matches the size recorded at intake. If not, leave the existing filter in place, record it as a limitation (section 13) and tell the customer (section 17). Pending review.

- [ ] **Filter Removal:** Pull out the old, clogged HVAC air filter and seal it immediately in a plastic bag to prevent dust release.
- [ ] **New Filter Install:** Verify the correct dimensions and directional airflow arrow, then slide in a brand-new, high-MERV-rated air filter.

> FLAG (31 section 10 CL-07; HUMAN REVIEW: licensed HVAC contractor): "high-MERV-rated air filter" in the step above is not a selection rule. The filter's rating must suit this system as the HVAC equipment manufacturer specifies (system compatibility, HVAC review); no rating is set here. A customer-supplied filter needs a START-009 record (section 8). Pending review.

> HOLD (precondition; C-CL07-08; spec CL-07.QAC "system restored"; spec APXA-005): before "System Test" below, reinstall and secure every grille removed in "Grille Removal" in its original location, and count the grilles against the number removed; a loose ceiling grille is a falling-object risk. A grille or fastener that cannot be secured is recorded and escalated, and the test does not run until it is resolved. Confirm that no tool, hose, rod or whip remains in the ductwork, the air handler or a fan, and that everyone is clear of them, before power is restored; power is restored only by the isolation method under review (C-CL07-06; X-07). Pending review.

- [ ] **System Test:** Restore power, run the system on "Fan Only" mode for 5 minutes, and verify that zero residual dust particles blow out into the clean property.

> FLAG (31 section 10 CL-07; C-CL07-02): "verify that zero residual dust particles blow out into the clean property" in the step above is not measurable. It is not a pass criterion and is never said to the customer; record what was observed and document limitations instead (spec CL-07.QAC; section 13). FLAG: UNSOURCED - verify against manufacturer instructions: the "5 minutes" run time and the "Fan Only" test come from no HVAC equipment manufacturer instruction (31 section 3.5 rule 3; HUMAN REVIEW: licensed HVAC contractor). Pending review.

## 4. Quality checks

### From "13. Quality checkpoints"

*From spec CL-07.QAC. The worker cannot mark the job complete without answering the required checks or recording an exception (source: spec QA-001). Which checks need a second person rather than a self-check is open (Q-31-15).*

| Check | Source | Inspector | Evidence |
|---|---|---|---|
| Registers and accessible duct scope completed as approved: each register recorded as done, held or not done, with the reason | spec CL-07.QAC "registers/accessible duct scope completed" | Worker; supervisor where policy requires (Q-31-15) | After photos mapped to registers and areas (QA-003) |
| Every removed grille reinstalled, secured and counted against the number removed | C-CL07-08; spec CL-07.QAC "system restored" | Worker | Count recorded; after photos |
| Debris controlled | spec CL-07.QAC "debris controlled" | Worker | Cleanup photos (QA-002); method per the containment decision (C-CL07-V01) |
| Filter installed if included, in the size recorded at intake, with the airflow direction the step names | spec CL-07.QAC "filter installed if included"; SOP "New Filter Install" | Worker | Photo of the installed filter, or "not included" / "not replaced" recorded |
| System restored: power restored by the reviewed isolation method and the thermostat returned to the customer's setting | spec CL-07.QAC "system restored"; APXA-005 | Worker; supervisor where policy requires | Checklist answer; until the isolation method exists, "method pending review" is recorded (C-CL07-06) |
| Limitations and unresolved conditions documented: held steps, grilles or fans not reached, suspected conditions found, filter not replaced | spec CL-07.QAC "limitations and unresolved conditions documented" | Worker | Notes and photos (JOB-004) |
| "Fan Only" run: what was observed, not a measurement | SOP "System Test" (flagged); 31 section 10 CL-07 | Worker | Observation note; no air-quality value is recorded or claimed |

- A customer signature or acknowledgement does not clear an unresolved safety hold (source: quality-assistant playbook "A signed customer form does not clear an unresolved safety hold.").
  - Evidence: note
- Missing evidence is recorded as unknown, not as a pass (source: quality-assistant playbook).
  - Evidence: note

## 5. Cleanup and waste handling

### From "14. Cleanup"

- Clean the area, remove waste, drop cloths and any containment, and account for tools and materials, including rods, whips, hoses and any plugs or seals used (source: spec APXA-005; QA-002).
- Restore utilities and components altered within scope (source: spec APXA-005), with power restored only by the isolation method under review (C-CL07-06).
- Return unused materials (source: spec APXA-007).

### From "15. Waste handling"

- Waste streams: debris collected by the HEPA vacuum; used filters, bagged as "Filter Removal" states; grease scraped from range-hood fan blades; used drop cloths; grille wash water (source: section 12; 29 section 8.2 item 10 "used filters").
- No disposal method or destination is approved: contain each stream and dispose of it only by the method the reviewer approves for the municipality (source: 31 section 3.1 row 15; Q-29-10; HUMAN REVIEW: qualified safety professional; local authority).
- If suspected mold or suspect asbestos-containing material was found, its debris is not handled under this SOP until a qualified reviewer decides (source: spec CL-07.SAF; section 10).

## 6. Final checks, completion photos and walkthrough

### From "16. Photo requirements (before / during / after)"

- Before: existing-condition photos of the work areas, registers, grilles, any visible ductwork and the accessible air-handler area, including the pre-work screens in section 12 (source: spec APXA-002 "capture required existing-condition photos"; START-008; C-CL07-V03).
  - Evidence: photo
- During: concealed or unexpected conditions - suspected mold, suspect material, damaged ducts or lining - with photos and severity (source: spec JOB-004; UXE-006).
- After: photos mapped to registers and areas, the reinstalled grilles and the installed filter (source: spec QA-003; 04 CL-07 "completion evidence"). An inspection camera is used only if the owner approves it (source: 04 CL-07 "completion evidence", PROPOSED).
  - Evidence: photo
- Every photo is internal-only by default; marketing use needs separate consent (source: spec REC-002, REC-003). Avoid people, documents and valuables not needed for the work (source: 31 section 3.5 rule 7).

### From "17. Customer communication"

- Arrival and completion updates are drafts; the worker or admin controls the send (source: spec UXE-008).
- Before "System Shutdown", the customer is told that power will be interrupted, in approved wording (source: C-CL07-06; 04 CL-07 "customer preparation requirements"; wording TBD - owner and attorney).
- Record the walkthrough outcome: accepted, accepted with punch items, unavailable or disputed (source: spec QA-004).
  - Evidence: note
- Care notes only from approved product or manufacturer data; none are approved yet (source: spec QA-008).
- Limitations, told in approved wording: held steps, grilles or fans not reached, suspected conditions found and referred, filter not replaced (source: spec CL-07.QAC; section 12 holds). Wording TBD - owner and qualified safety reviewer.
- Blocked work: only the approved "work blocked" message; no incident details or access codes by text or email (source: spec NTF-007, COM-002).
- What not to say: "Clean Air, Lower Energy Bills", "breathe pure, clean air", "Removing allergens, mold spores, and pet dander", "kill lingering mold spores", "eco-friendly", "zero residual dust particles", or any air-quality, health, energy-saving or mold-removal outcome (source: spec CL-07.SAF; C-CL07-01; C-CL07-02; C-CL07-03; 32 register A row 26 and register B rows 8, 9 and 60).

### From "18. Completion criteria"

- Required QA checks answered or an exception recorded (source: spec QA-001; section 13).
  - Evidence: note
- After photos mapped to registers and areas (source: spec QA-003).
  - Evidence: photo
- Every removed grille reinstalled, secured and counted (source: C-CL07-08; spec CL-07.QAC).
- Filter status recorded: installed as included, not included, or not replaced with the reason (source: spec CL-07.QAC "filter installed if included").
  - Evidence: note
- System restored, or the restore status recorded under the C-CL07-06 hold (source: spec CL-07.QAC "system restored"; APXA-005).
  - Evidence: note
- Cleanup and waste handling done as approved; tools and materials accounted for (source: spec QA-002; APXA-005; sections 14 and 15).
- Limitations, open holds and punch items recorded; walkthrough outcome recorded (source: spec CL-07.QAC; QA-004; APXA-006).
  - Evidence: note
- The job closes only when the required operational and financial steps are complete (source: spec APXA-007).

## Stop-work triggers, escalation and incidents (service-specific)

### From "10. Stop-work conditions"

The general stop-work rule is [[FACT-SVC-STOP-WORK-RULE]]. Service-specific triggers:

*Standard block copied verbatim from 31 SOP standard section 8.5 (PROPOSED wording; HUMAN REVIEW: qualified safety professional; attorney licensed in KY and/or IN for the "right to stop work" sentence; bilingual reviewer for Spanish).*

**Service stop triggers and holds (CL-07).** Card stop guidance (spec CL-07.SAF): "system off/isolation per procedure; do not make unsupported indoor-air-quality claims; stop on suspected significant mold, asbestos-containing material, damaged ducts or scope requiring licensed HVAC work".

| Trigger or hold | Action | Cleared by (evidence) | Source |
|---|---|---|---|
| Suspected significant mold; until the company mold definition exists, any suspected mold growth in ducts, boots, registers or the air handler | Do not agitate, vacuum or disturb it; stop the affected work; photos; escalate | Qualified mold assessor and qualified safety professional (critical hold) | spec CL-07.SAF; C-CL07-01; 31 section 8.4 rule 2 |
| Suspect asbestos-containing material, for example duct wrap, tape or mastic | Do not disturb; stop; escalate | Accredited asbestos inspector (critical hold) | spec CL-07.SAF; 31 section 8.3 rule 2 |
| Damaged ducts or duct lining; duct type unknown or not approved for the brush or air whip | Do not insert tools; record; escalate | Qualified safety reviewer; licensed HVAC contractor for duct damage | spec CL-07.SAF, CL-07.HAZ; 31 section 10 CL-07 |
| Scope requiring licensed HVAC work: plenum or trunk-line openings, furnace connection, work on HVAC equipment beyond section 12 | Do not perform; record the request; refer | Licensing review; licensed HVAC contractor (critical class) | spec CL-07.SAF; C-CL07-07; 31 section 8.3 rule 2 |
| Isolation not confirmed, or power cannot be interrupted safely (the customer has not accepted, or something depends on uninterrupted power) | Do not start, or stop the affected step; escalate | Licensed HVAC contractor or electrician (method); owner | spec CL-07.SAF "system off/isolation per procedure"; C-CL07-06; X-07 |
| Containment cannot be set up as the reviewer requires | Do not agitate or extract | Qualified safety professional | C-CL07-V01; spec CL-07.QAC "debris controlled" |
| Grilles or fans that need access equipment | Leave them in place; record as not done | Approved height and access policy | spec CL-07.HAZ "ladder"; X-12; 02 G-005 |
| A request for fogging, dryer-vent cleaning or commercial kitchen exhaust work | Do not perform; record; refer to the owner | Owner, after SOP, licensing and SDS review | C-CL07-03; C-CL07-04; C-CL07-05; 28 PRC-042 |
| A chemical product without a reviewed SDS | Do not use | Reviewed SDS and approved product | 29 section 8.3 |
| Gas odor | Emergency (section 19, step 2) | Emergency services; incident report (section 20) | 31 section 8.5; 04 CL-07 "hazards" |

Critical holds cannot be overridden by any role; they clear only with a recorded qualified assessment. Suspect hazardous material and unapproved HVAC scope are critical classes, and suspected mold growth is treated as critical until the company mold definition exists (source: 31 section 8.3 rule 2 and section 8.4 rule 2).

### From "19. Escalation"

General path: [[FACT-SVC-ESCALATION-PATH]].

*Standard block copied verbatim from 31 section 8.5 (PROPOSED wording; HUMAN REVIEW: qualified safety professional).*

**CL-07 escalation routes (owner decisions pending, Q-31-05):** suspected significant mold goes to the owner, then a qualified mold assessor; suspect asbestos-containing material to an accredited asbestos inspector; licensed HVAC scope, damaged ducts or HVAC equipment concerns to a licensed HVAC contractor; isolation or electrical concerns to a licensed electrician or HVAC contractor; a gas odor is an emergency (step 2) (source: 04 CL-07 "permit/license flags" HUMAN REVIEW list; C-CL07-01; C-CL07-06; C-CL07-07). Contacts: `<owner decision: emergency contact>` and `<owner decision: escalation order>` (Q-31-05).

### From "20. Incident reporting"

General path: [[FACT-SVC-INCIDENT-REPORTING]].

*Standard block copied verbatim from 31 section 8.5 (PROPOSED wording). HUMAN REVIEW: attorney licensed in KY and/or IN for the fault and liability sentence; insurance broker for any insurer-notification step added later.*

- CL-07 examples to report: cuts from duct or grille edges; eye or face injury from compressed-air whips or debris; a fall from access equipment; exposure to dust or a suspected hazardous material; damage to ducts, duct lining, grilles, HVAC equipment or customer property; harm caused by the power interruption (source: spec CL-07.HAZ; C-CL07-06; JOB-008).

## Spanish translation status (section 22)

| Field | Value |
|---|---|
| Spanish version | Not started |
| Source English version | None yet (draft; `sop_version` not assigned) |
| Translator (role) | `<owner decision>` |
| Bilingual reviewer (role) | `<owner decision: qualified bilingual reviewer>` (Q-31-02) |
| Safety glossary version | None exists yet (GAP; HND-006) |
| Last review | - |
| Notes | The steps contain no Arabic or other non-English text. Safety text (holds, stop-work, escalation) needs a human-reviewed translation before any Spanish use (owner facts 2026-10-02). |

## Open questions in the source SOP

- Q-31-08 (owner and relevant reviewers): is biocide fogging offered at all, or referred out?
- Q-30-14 (owner; licensed HVAC contractor; attorney): is CL-07 offered at launch? What is in scope versus licensed HVAC work, what is charged if work stops at the inspection, and are filters, dryer vents, fogging and commercial hoods offered?
- Q-31-10 (owner; qualified mold assessor): what is the company definition of mold growth versus cleanable mildew, and the stop rule? It decides when the "Agitation Run" hold can be released.
- Q-31-09 (owner; qualified safety professional): the height and access policy that releases ceiling grilles and ceiling-mounted fans.
- Q-31-07 (owner; accredited asbestos inspector; EPA RRP-certified renovator): which property-age thresholds trigger asbestos screening for duct wrap, tape or mastic?
- Q-04-15 (owner; licensed HVAC contractor): is the hood and grille split between CL-02 and CL-07 confirmed, and are commercial hoods excluded?
- Q-31-05 (owner): emergency and escalation contacts, escalation order and after-hours coverage for a two-person team.
- Q-31-15 (owner): which checks (grille count, system restore, isolation) need a supervisor rather than the worker's self-check?
- Q-31-02 (owner): who is the qualified bilingual reviewer for the Spanish safety text?
- Q-29-10 (local authority; safety reviewer): disposal destinations and rules for extracted debris and used filters in each service municipality.
