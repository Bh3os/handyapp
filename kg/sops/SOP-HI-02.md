---
id: SOP-HI-02
type: sop
title: "SOP HI-02: Deep-Clean Barbecue & Grill Maintenance"
status: active
area: field
links:
  part_of: ["[[SVC-HI-02]]", "[[S07]]"]
  decided_by: ["[[OWN-DEC-108]]", "[[OWN-DEC-109]]", "[[OWN-DEC-17]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]", "[[RULE-HUMAN-REVIEW]]", "[[RULE-NO-INVENTED-FACTS]]", "[[FACT-SVC-STOP-WORK-RULE]]"]
  uses: ["[[FACT-INVENTORY-HI-02]]", "[[FACT-SVC-PHOTO-MINIMUM]]", "[[FACT-SVC-ESCALATION-PATH]]", "[[FACT-SVC-INCIDENT-REPORTING]]"]
source: "vault Standard Of Operations/sop-grill-cleaning.md; OWN-DEC-108"
---
Worker checklist for [[SVC-HI-02]] (Deep-Clean Barbecue & Grill Maintenance). Status: active for the job checklist under [[OWN-DEC-108]], pending competent review for production use ([[OWN-DEC-17]]). The vault file is a draft (`status: draft-not-field-approved`, `owner_approved: false`).

Source file: `Standard Of Operations/sop-grill-cleaning.md`. Each group below names the source heading its steps come from, and every step keeps the vault wording (link targets removed). The original procedure is section 12; the other sections were added in the vault on 2026-10-03 from the spec and the SOP standard, pending review. HOLD, GATE and FLAG lines are review controls added on 2026-10-03, pending qualified review: a HOLD placed before a step must be cleared before that step starts. An "Evidence" line lists the photo, measurement or note that the step's own wording asks for; a step without one names none.

Required steps cannot be skipped ([[OWN-DEC-108]]); the completion sequence is [[OWN-DEC-109]] and the minimum photo rule is [[FACT-SVC-PHOTO-MINIMUM]]. Tools, materials and PPE: [[FACT-INVENTORY-HI-02]]. Safety gates: [[RULE-SAFETY-GATES]].

## 1. Site preparation and property protection

### From "5. Customer and property preparation"

- The customer grants access to the main gas line safety shut-off valve or propane tank regulator before work begins (source: agreement "Gas Isolation" clause).
- PROPOSED for the preparation checklist (not yet in the agreement): grill turned off and cool before arrival (the cool-down period is set by safety review, not here); work area clear; water and power access; pets and children kept away from the work area; make and model information ready (source: 04 HI-02 "customer preparation requirements"; spec HI-02.INT; X-11).
- Every job re-confirms access, occupants, pets, parking, hazards and work-area conditions (source: spec CX-005).
- HandyHub's own pre-start checks are never moved onto the customer (source: 30 section 4.1 clause 5).

## 2. Setup and required measurements/checks

### From "3. Preconditions"

*Dispatch and Start Job gates for this service (source: spec APXA-001, APXA-003; 31 section 3.1 row 3). Every item is pending review.*

- Intake complete: grill fuel type, make/model, condition, location, access to water/power, customer expectations, corrosion/damage (source: spec HI-02.INT).
- An approved estimate version covers the tasks in section 2; start only when Ready or an authorized exception is documented (source: spec CX-003; APXA-003).
  - Evidence: note
- The grill manufacturer's instructions for the specific unit are available (source: spec section 17 card note "manufacturer instructions"; 04 HI-02 "prerequisites").
- Every cleaning product is on an approved product list with a reviewed SDS; a chemical product without a reviewed SDS is not carried to the job (source: 29 section 8.3 interim rule, PROPOSED; X-09). No product is approved yet: TBD - requires qualified safety reviewer review.
- The customer has granted access to the main gas shut-off valve or propane tank regulator (source: agreement "Gas Isolation" clause).
- The unit is cool and off before any work starts (source: spec HI-02.SAF "confirm unit is cool/off"; hold in section 12).
- Licensed-task and permit flags: where policy marks a task as needing a licensed trade or permit, Start Job stays blocked until that prerequisite is approved (source: spec START-010; 04 HI-02 "permit/license flags").
- Before this SOP can be activated, the named reviewers approve: the fuel-restore and leak-verification decision and method (C-HI02-03); the port-clearing method (C-HI02-04); the rinse, dry and residue-check method (C-HI02-02); the scald controls (section 12) (source: 31 section 10 HI-02; owner facts L20).

### From "11. Setup"

- On arrival: confirm address, work area and contact; identify pets and occupants; inspect the actual site against the briefing; capture required existing-condition photos; protect the work area; identify utilities and emergency constraints relevant to the task (source: spec APXA-002).
  - Evidence: photo
- Protect surrounding surfaces with protective coverings and absorbents; types TBD (source: spec HI-02.MAT).
- Isolate-verify-restore: "System Tear-down" closes the propane tank or gas line valves, but verification and restoration are not defined, and the shared isolate-verify-restore module does not exist yet (source: X-07; C-HI02-03; 31 section 5.8).
- Ventilation adequate for the approved products (source: spec HI-02.SAF "ventilate").
- Staging of the soak bin, heat source and products: TBD — requires review by safety-liability-manager and a qualified person; owner to approve.
- Before starting: complete the required safety, PPE and site checks; acknowledge the SOP and hazards; start only when Ready or an authorized exception is documented (source: spec APXA-003; START-004).
  - Evidence: note

## 3. Service-specific work steps

### From "12. Step-by-step procedure" (introduction)

*The original procedure lines below are unchanged and in their original order. Lines starting with "HOLD" or "FLAG" were added on 2026-10-03; they are pending review and never replace the step text. No burn-off, ignition or flame test is part of this procedure (source: 31 section 10 HI-02; X-10).*

### From "12. Step-by-step procedure / 📋 Standard Operational Detailing Execution"

> HOLD (precondition; spec HI-02.SAF; 02 G-047): before "System Tear-down", confirm the unit is cool and off ("confirm unit is cool/off"). No cool-down period is set here (TBD - requires qualified safety reviewer review). If the unit is hot or on, or its state cannot be confirmed, do not start; escalate (section 19).

> HOLD (precondition; C-HI02-08, X-02; pending the START-008 configuration): before "System Tear-down", record the unit's existing condition with photos and notes: cookbox, grates, flavorizer bars, heat shields, burners and any part that looks rusted through, cracked or decayed. If a damaged burner, valve, hose or regulator, a gas odor or a suspected leak is found, do not start; follow section 10.

> HOLD (precondition; X-07; spec HI-02.SAF): before "System Tear-down", have the grill manufacturer's instructions for this unit; fuel and power are isolated only as they describe ("isolate fuel/power per manufacturer"). Never disconnect, loosen or modify a gas line, hose, regulator, valve or fitting (section 2, Do not perform 9-11). Whether closing a fixed natural-gas supply valve is licensed work in the municipality is an open licensing question (04 HI-02 "permit/license flags"; HUMAN REVIEW: municipal licensing authority, licensed gas fitter or plumber). Pending review.

- [ ] **System Tear-down:** Turn off the propane tank or gas line valves. Dismantle all internal grates, flavorizer bars, heat shields, and grease trays.

> HOLD (C-HI02-05): disassembly is limited to the parts named in the step above until the disassembly boundary is decided; the agreement's "Full system tear-down" does not extend it. Grease-tray contents are not cleaned or disposed of under this SOP (section 2, Out of scope; section 15). Pending review.

> HOLD (scald control; precondition; spec HI-02.HAZ "hot surfaces"; 31 section 10 HI-02): before "The Chemical Bath", a qualified safety reviewer approves the heat source, the handling and draining of hot water and the PPE for the "boiling water solution", and the degreaser is an approved product used only as its label and SDS allow (section 8). Until then the step below is not performed. Pending review.

- [ ] **The Chemical Bath:** Submerge all removed grates and shields into a heavy plastic utility bin filled with a boiling water solution mixed with non-toxic, carbon-stripping eco-degreaser. Let soak for 30 minutes.

> FLAG: UNSOURCED - verify against manufacturer instructions: the soak time ("30 minutes") and the "boiling water solution" in the step above come from no product label or SDS (31 section 3.5 rule 3). The "non-toxic" wording is unverified and is not repeated to the customer (C-HI02-01).

- [ ] **Cookbox Scraping:** Use a heavy-duty plastic putty scraper and a wire block brush to manually scrape caked carbon crust off the interior walls of the cookbox down to raw aluminum/metal.

> FLAG (C-HI02-07): the step above names a plastic putty scraper, while the inventory stocks carbon-steel scrapers; spec HI-02.TLS asks for "non-damaging detailing tools". Use the scraper the step names. Whether scraping "down to raw aluminum/metal" suits this cookbox's finish depends on the grill manufacturer's care instructions (RISK, unverified). Pending review.

- [ ] **Burner Tube Purging:** Wire-brush the outside of stainless steel burner tubes. Use a small drill bit or paperclip to clear out single clogged gas vent ports to ensure a uniform flame pattern.

> HOLD (C-HI02-04): in the step above, clearing gas vent ports with "a small drill bit or paperclip" is held pending review of the grill manufacturer's instructions; a drill bit may enlarge or alter ports (RISK, unverified). Until a reviewer records the manufacturer's method, ports are not cleared; note clogged ports for the supervisor and the customer (section 17). "To ensure a uniform flame pattern" is not a promise to the customer. Whether burner-port clearing is offered at all is open (Q-31-08). Pending review.

> HOLD (precondition; C-HI02-02; spec HI-02.QAC "surfaces clean/dry"): before "Exterior Polishing" ("Reassemble all components"), rinse, dry and check for residue every soaked or chemically cleaned part as the approved product label directs. The label method is not available yet because no product is approved: TBD - requires qualified safety reviewer review. Do not reassemble a part that has not passed this check. Pending review.

- [ ] **Exterior Polishing:** Reassemble all components. Spray the exterior hood and shelves with specialized stainless steel polish, buffing along the grain line with a fresh microfiber cloth.

> HOLD (C-HI02-03; X-07): the step above reassembles the grill, but no step restores the fuel supply or checks for leaks. Do not reopen the valves closed in "System Tear-down" and do not light the grill until a reviewer writes the restore and leak-verification method (HUMAN REVIEW: qualified gas appliance technician or licensed gas professional; grill manufacturer instructions). A leak or damaged gas part means: shut off, tag out of service, tell the customer, escalate. A supervisor, not the worker alone, verifies the result (quality-assistant playbook). Until then the fuel supply stays off and the customer is told so in approved wording (section 17). Whether HandyHub restores fuel at all is an open question (C-HI02-03). Pending review.

## 4. Quality checks

### From "13. Quality checkpoints"

*From spec HI-02.QAC. The worker cannot mark the job complete without answering the required checks or recording an exception (source: spec QA-001). Which checks need a second person rather than a self-check is open (Q-31-15).*

| Check | Source | Inspector | Evidence |
|---|---|---|---|
| Components reassembled correctly | spec HI-02.QAC | Worker; supervisor where policy requires (Q-31-15) | After photos mapped to components (QA-003) |
| Burner ports unobstructed where in scope | spec HI-02.QAC | Worker | Port clearing is on hold (C-HI02-04): record "held - not cleared" and note clogged ports |
| No leaks or loose parts introduced | spec HI-02.QAC | Supervisor, not the worker alone (quality-assistant playbook) | Result of the reviewer-approved verification (C-HI02-03); until it exists: "not inspected - held", fuel left off, customer told |
| Surfaces clean and dry; no chemical residue on parts that touch food | spec HI-02.QAC; agreement "food-surface safe post-rinsing" | Worker; method by the reviewer | Checklist answer per the approved label method (C-HI02-02) |
| No loose wire bristles left on cooking grates (PROPOSED, RISK) | 02 G-047 | Worker | Checklist answer; method TBD - requires quality and safety review |
| Area restored | spec HI-02.QAC; QA-002 | Worker | Cleanup photo where required (QA-002) |

- A customer signature or acknowledgement does not clear an unresolved safety hold (source: quality-assistant playbook "A signed customer form does not clear an unresolved safety hold.").
  - Evidence: note
- Missing evidence is recorded as unknown, not as a pass (source: quality-assistant playbook).
  - Evidence: note

## 5. Cleanup and waste handling

### From "14. Cleanup"

- Clean the area, remove waste and protection, and account for tools and materials (source: spec APXA-005; QA-002; HI-02.QAC "area restored").
- Restore utilities and components altered within scope (source: spec APXA-005), except the fuel supply, which stays off under the C-HI02-03 hold until the approved method exists; the customer is told (section 17).
- Return unused materials (source: spec APXA-007).

### From "15. Waste handling"

- Waste streams: degreaser wastewater from the soak bin; grease and carbon scrapings; used cloths, pads and absorbents; empty product containers (source: spec HI-02.SAF "control chemicals/waste"; 04 HI-02 "permit/license flags"; 29 section 8.2 item 10).
- No disposal method or destination is approved: contain chemicals, wastewater and grease, and dispose of them only by the method the reviewer approves for the municipality (source: 31 section 3.1 row 15; Q-29-10; HUMAN REVIEW: local sewer or stormwater utility; qualified safety professional).
- Cloths used with the stainless protective oil: disposal rule pending the reviewer's SDS classification (source: 29 sections 8.1 and 8.2 item 10).
- Grease-tray contents: not covered (section 2).

## 6. Final checks, completion photos and walkthrough

### From "16. Photo requirements (before / during / after)"

- Before: existing-condition photos of the cookbox, grates, flavorizer bars, heat shields and burners before disassembly. PROPOSED for HI-02 because the agreement's "Pre-existing Defects" clause relies on them; whether they are required is the START-008 configuration decision (source: C-HI02-08; X-02; spec START-008; 04 HI-02 "completion evidence").
  - Evidence: photo
- During: concealed or unexpected conditions, for example a rusted-through burner tube or a cracked part, with photos and severity (source: spec JOB-004; UXE-006; agreement "Pre-existing Defects" examples).
- After: photos mapped to components - cookbox, grates, burners, exterior (source: spec QA-003; 04 HI-02 "completion evidence").
  - Evidence: photo
- Every photo is internal-only by default; marketing use needs separate consent (source: spec REC-002, REC-003). Avoid people, documents and valuables not needed for the work (source: 31 section 3.5 rule 7).

### From "17. Customer communication"

- Arrival and completion updates are drafts; the worker or admin controls the send (source: spec UXE-008).
- Record the walkthrough outcome: accepted, accepted with punch items, unavailable or disputed (source: spec QA-004).
  - Evidence: note
- Care notes only from approved product or manufacturer data; none are approved yet (source: spec QA-008).
- Held items, told in approved wording: ports not cleared (C-HI02-04); fuel supply left off and why (C-HI02-03); defects found, such as rusted-through burner tubes, cracked flavorizer bars or decayed heat shields, are recorded and reported, and repair is not offered (Do not perform 10; section 2, Out of scope) (source: section 12 holds; agreement "Pre-existing Defects" examples). The worker gives no gas-restore or relighting instructions (source: 31 section 3.5 rule 4). Wording TBD - owner and qualified safety reviewer.
  - Evidence: note
- Blocked work: only the approved "work blocked" message; no incident details or access codes by text or email (source: spec NTF-007, COM-002).
- What not to say: "non-toxic", "eco-safe", "sanitizes", "safe, consistent gas flow", "showroom condition", "Factory Shine", or any lifespan, health or safety outcome (source: C-HI02-01; C-HI02-V02; C-HI02-04; main plan section 2; 32 register A row 2 and register B rows 27, 28, 43, 44).

### From "18. Completion criteria"

- Required QA checks answered or an exception recorded (source: spec QA-001; section 13).
  - Evidence: note
- After photos mapped to components (source: spec QA-003).
  - Evidence: photo
- Cleanup and waste handling done as approved (source: spec QA-002; sections 14 and 15).
- Tools and materials accounted for (source: spec APXA-005).
- Fuel status recorded: either the reviewer-approved restore and leak-verification result with supervisor verification, or "fuel left off - customer told" under the C-HI02-03 hold (source: C-HI02-03; APXA-005).
  - Evidence: note
- Open holds, defects and punch items recorded; walkthrough outcome recorded (source: spec QA-004; APXA-006).
  - Evidence: note
- The job closes only when the required operational and financial steps are complete (source: spec APXA-007).

## Stop-work triggers, escalation and incidents (service-specific)

### From "10. Stop-work conditions"

The general stop-work rule is [[FACT-SVC-STOP-WORK-RULE]]. Service-specific triggers:

*Standard block copied verbatim from 31 SOP standard section 8.5 (PROPOSED wording; HUMAN REVIEW: qualified safety professional; attorney licensed in KY and/or IN for the "right to stop work" sentence; bilingual reviewer for Spanish).*

**Service stop triggers and holds (HI-02).** Card stop guidance (spec HI-02.SAF): "confirm unit is cool/off; isolate fuel/power per manufacturer; avoid modifying gas components beyond scope; ventilate; control chemicals/waste".

| Trigger or hold | Action | Cleared by (evidence) | Source |
|---|---|---|---|
| Unit hot or on, or its state cannot be confirmed | Do not start; escalate | Unit confirmed cool and off | spec HI-02.SAF |
| Grill manufacturer's instructions for this unit not available | Do not start "System Tear-down"; escalate | Instructions for the unit obtained and recorded | spec HI-02.SAF "isolate fuel/power per manufacturer"; X-07 |
| Gas odor, suspected leak, or a damaged burner, valve, hose or regulator | Gas odor: emergency (section 19, step 2). Leak or damaged gas part: shut off, tag out of service, tell the customer, escalate | Qualified gas appliance technician or licensed gas professional; supervisor verification | C-HI02-03; 31 section 10 HI-02; 04 HI-02 "stop-work conditions" |
| Customer asks for gas-component repair or disconnection | Do not perform; record the request; refer | Owner (referral) | Do not perform 9-11 |
| Scald control for "The Chemical Bath" ("boiling water solution") | Held: the step is not performed | Qualified safety reviewer approves the heat source, the handling and draining of hot water and the PPE; degreaser approved with a reviewed SDS | 31 section 10 HI-02; spec HI-02.HAZ "hot surfaces" |
| Port clearing in "Burner Tube Purging" | Held: ports are not cleared | Manufacturer method recorded by a reviewer | C-HI02-04 |
| Rinse, dry and residue check before reassembly | Held: parts are not reassembled until checked | Approved product label method | C-HI02-02 |
| Fuel restore and leak verification after reassembly | Held: the fuel supply stays off and the customer is told | Reviewer-written method; supervisor verification | C-HI02-03 |
| Chemical product without a reviewed SDS, or a mix the SDS does not allow | Do not use | Reviewed SDS and approved product | 29 section 8.3; X-09 |
| Work area cannot be ventilated as the product SDS requires | Stop the chemical step; escalate | Qualified safety reviewer | spec HI-02.SAF "ventilate" |
| Chemicals, wastewater or grease cannot be contained | Stop; escalate | Approved disposal method | spec HI-02.SAF "control chemicals/waste"; Q-29-10 |
| Fire, smoke or flare-up | Emergency (section 19, step 2) | Emergency services; incident report (section 20) | spec HI-02.HAZ; X-10 |

Critical holds cannot be overridden by any role; they clear only with a recorded qualified assessment. Unapproved gas scope is a critical class (source: 31 section 8.3 rule 2).

### From "19. Escalation"

General path: [[FACT-SVC-ESCALATION-PATH]].

*Standard block copied verbatim from 31 section 8.5 (PROPOSED wording; HUMAN REVIEW: qualified safety professional).*

**HI-02 escalation routes (owner decisions pending, Q-31-05):** a gas leak, a damaged gas part or a gas-component request goes to the owner, then to a qualified gas appliance technician or licensed gas professional (source: C-HI02-03; 04 HI-02 "responsible skill / business role"). Chemical exposure: emergency response first, then the incident form (section 20); first-aid references only from the reviewed SDS (source: 29 section 8.2 item 7). Contacts: `<owner decision: emergency contact>` and `<owner decision: escalation order>` (Q-31-05).

### From "20. Incident reporting"

General path: [[FACT-SVC-INCIDENT-REPORTING]].

*Standard block copied verbatim from 31 section 8.5 (PROPOSED wording). HUMAN REVIEW: attorney licensed in KY and/or IN for the fault and liability sentence; insurance broker for any insurer-notification step added later.*

- HI-02 examples to report: burns or scalds, cuts, chemical exposure, a fire or flare-up, a gas leak, damage to the customer's grill or property (source: spec HI-02.HAZ; JOB-008).

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

- Q-31-08 (owner and relevant reviewers): is burner-port clearing offered at all, or referred out?
- C-HI02-03 open question (02 register): does HandyHub restore the fuel supply at all, or leave it off for the customer?
- Q-31-05 (owner): emergency and escalation contacts, escalation order and after-hours coverage for a two-person team.
- Q-31-11 (owner; qualified safety professional): emergency kit contents, SDS register owner, chemical storage and transport.
- Q-31-15 (owner): which checks (fuel status, reassembly) need a supervisor rather than the worker's self-check while there are two employees?
- Q-31-02 (owner): who is the qualified bilingual reviewer for the Spanish safety text?
- Q-29-10 (local authority; safety reviewer): disposal destinations and rules for degreaser wastewater, grease and carbon in each service municipality.
