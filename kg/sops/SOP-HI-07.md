---
id: SOP-HI-07
type: sop
title: "SOP HI-07: Attic Insulation Upgrades"
status: active
area: field
links:
  part_of: ["[[SVC-HI-07]]", "[[S07]]"]
  decided_by: ["[[OWN-DEC-108]]", "[[OWN-DEC-109]]", "[[OWN-DEC-17]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]", "[[RULE-HUMAN-REVIEW]]", "[[RULE-NO-INVENTED-FACTS]]", "[[FACT-SVC-STOP-WORK-RULE]]"]
  uses: ["[[FACT-INVENTORY-HI-07]]", "[[FACT-SVC-PHOTO-MINIMUM]]", "[[FACT-SVC-ESCALATION-PATH]]", "[[FACT-SVC-INCIDENT-REPORTING]]"]
source: "vault Standard Of Operations/sop-attic-insulation.md; OWN-DEC-108"
---
Worker checklist for [[SVC-HI-07]] (Attic Insulation Upgrades). Status: active for the job checklist under [[OWN-DEC-108]], pending competent review for production use ([[OWN-DEC-17]]). The vault file is a draft (`status: draft-not-field-approved`, `owner_approved: false`).

Source file: `Standard Of Operations/sop-attic-insulation.md`. Each group below names the source heading its steps come from, and every step keeps the vault wording (link targets removed). The original procedure is section 12; the other sections were added in the vault on 2026-10-03 from the spec and the SOP standard, pending review. HOLD, GATE and FLAG lines are review controls added on 2026-10-03, pending qualified review: a HOLD placed before a step must be cleared before that step starts. An "Evidence" line lists the photo, measurement or note that the step's own wording asks for; a step without one names none.

Required steps cannot be skipped ([[OWN-DEC-108]]); the completion sequence is [[OWN-DEC-109]] and the minimum photo rule is [[FACT-SVC-PHOTO-MINIMUM]]. Tools, materials and PPE: [[FACT-INVENTORY-HI-07]]. Safety gates: [[RULE-SAFETY-GATES]].

## 1. Site preparation and property protection

### From "5. Customer and property preparation"

- PROPOSED customer checklist, sent with the appointment reminder once the owner and attorney approve the wording: clear path and space under the hatch; pets and occupants plan; disclose known leaks, pests, wiring and existing insulation (source: 04 HI-07 customer preparation requirements; spec NTF-005 "customer-preparation checklist"; CX-005).
- The crew, not the customer, protects the floor under the hatch (original "Site Masking" step); whether the hatch room is wrapped as the agreement says is an owner decision (C-HI07-08).
- On arrival, identify pets and occupants and keep them away from the active work area; the occupant and pet module is pending qualified safety review (source: spec APXA-002; X-11; 31 section 5.8).
- A customer's preparation or statement never replaces HandyHub's own pre-work inspection (source: 30 section 4.1 clause 5 "never moves HandyHub's own pre-start checks onto the customer"; risk-triage playbook "Signing a checkbox cannot bypass an unresolved structural hazard.").

## 2. Setup and required measurements/checks

### From "3. Preconditions"

All pending qualified review. A precondition that is not met keeps the affected tasks blocked (source: job-planner playbook "A missing ladder or unverified permit keeps affected tasks blocked.").

- On-site assessment before a firm quote: missing hazardous-condition decisions block a firm quote, and photos alone cannot establish hidden conditions (source: estimate-assistant playbook; 04 HI-07 estimating method, PROPOSED).
- The approved estimate records the product, the target coverage and depth, and the counts of eave bays and recessed lights; the fixed depth in section 12 is not the target (source: spec HI-07.QAC "target coverage/depth per approved plan"; 04 HI-07 prerequisites; C-HI07-06).
  - Evidence: note
- Pre-work inspection gate (C-HI07-01): pre-inspect moisture/electrical/combustion concerns; stop on mold, active leak or unsafe wiring; unknown or suspect existing insulation, for example vermiculite, is not disturbed (source: spec HI-07.SAF; 31 section 10). Release only by a recorded qualified assessment (31 section 8.3).
  - Evidence: note
- Attic controls (C-HI07-02): attic travel, fall-through, heat-stress, low-clearance and respiratory controls approved by a qualified safety professional; until they exist the attic steps stay on hold (source: spec HI-07.HAZ, HI-07.SAF; 31 sections 8.4 and 10).
- Combustion concerns found at the inspection (flues, vents, gas appliances): stop and refer to an HVAC or gas professional; clearances come only from manufacturer data or that professional and are never estimated (source: spec HI-07.SAF; 31 section 10; risk-triage playbook "Use manufacturer/SDS guidance").
- Permit, licence or qualification flags: where admin policy marks the job, Start Job is blocked until the prerequisite is approved (source: spec START-010). Whether retrofit insulation needs a permit or inspection is an OPEN QUESTION per Kentucky and Indiana municipality, and unknown applicability must not default to "no permit" (source: 04 HI-07 permit/license flags; risk-triage playbook).
- Before leaving: confirm job, customer, address and time; read the latest changes; review scope, exclusions, hazards and safety; load critical tools, equipment and materials; check rentals (the blower may be rented); confirm required documents and approvals (source: spec APXA-001).
- Before starting: complete the required safety, PPE and site checks; confirm materials; acknowledge the SOP and hazards; start only when Ready or an authorized exception is documented (source: spec APXA-003). High-risk flags may require separate checkboxes or supervisor confirmation (source: spec START-004).
  - Evidence: note
- Materials readiness: missing material may block start, for example an approved fixture-protection material, which is not stocked (source: spec START-006; C-HI07-V01).

### From "11. Setup"

- On arrival: confirm address, work area and contact; identify pets and occupants; inspect the actual site against the briefing; capture the required existing-condition photos; protect the work area; identify utilities and emergency constraints relevant to the task (source: spec APXA-002).
  - Evidence: photo
- Pre-start site check: record any difference from the briefing; material differences trigger Risk Triage or supervisor review (source: spec START-007).
  - Evidence: note
- Protection: the original "Site Masking" step (section 12) covers the floor under the hatch; keep protection and containment in place during work (source: spec APXA-004 "keep protection/containment"; containment standard C-HI07-08).
- Blower staging: outside, per the original step ("into the commercial blowing machine hopper outside"); set-up and pre-use check per the blower manufacturer (source: original step; 31 section 3.1, tools row "pre-use inspection per manufacturer").
- Pre-start evidence: existing-condition photos before start (source: spec START-008; section 16).
  - Evidence: photo

## 3. Service-specific work steps

### From "12. Step-by-step procedure" (introduction)

*Original procedure, verbatim and in its original order. The HOLD and FLAG lines are additions pending qualified review: a precondition hold sits directly before the step it gates, and a hold or flag that suspends, limits or flags a step sits directly after it (36 D-36-17). They never replace or reword a step.*

### From "12. Step-by-step procedure / 📋 Standard Operational Execution Flow"

> HOLD (C-HI07-01) - pre-work inspection gate, before the first step below ("Site Masking") and before any work in the attic: pre-inspect moisture/electrical/combustion concerns and record what is found with photos (spec HI-07.SAF; JOB-004). Stop on mold, active leak or unsafe wiring (spec HI-07.SAF). Release only by a recorded qualified assessment (31 section 8.3). Pending qualified review. (source: spec HI-07.SAF; 31 section 10)

> HOLD (C-HI07-01) - before the first step below: unknown or suspect existing insulation, for example vermiculite: do not disturb; stop; escalate. No HandyHub sampling; release only on documented clearance from a qualified asbestos professional accepted by the owner (31 section 7.2). Pending qualified review. (source: 31 section 10; spec START-011; owner facts 2026-10-02, EPA asbestos source)

- [ ] **Site Masking:** Cover the entire floor hallway directly beneath the attic hatch entry with plastic drops to trap loose blown fibers.

> HOLD (C-HI07-02) - before the step below ("Soffit Ventilation Baffle Placement") and every later attic step ("Fixtures Isolation", "Pneumatic Blow-In Application"): attic travel and fall-through, heat-stress, low-clearance and respiratory and skin protection controls must be approved by a qualified safety professional and in place. None is defined yet, and no temperature limit or respirator type is set here; until they exist the attic steps stay on hold (31 section 8.4). Pending qualified review. (source: spec HI-07.HAZ, HI-07.SAF, HI-07.TLS; 31 section 10; X-12, X-27)

- [ ] **Soffit Ventilation Baffle Placement:** Crawl into the low attic perimeter edges. Install plastic or styrofoam insulation baffles (rafter vents) directly into every single joist bay near the soffit vents. *Crucial: This ensures fresh airflow is not blocked by loose insulation, which causes roof ice dams.*
- [ ] **Fixtures Isolation:** Build protective fire-rated drywall boxes around the top of hot recessed can lights to isolate them from loose insulation elements.

> HOLD (C-HI07-03): the step above is held. Do not build or install fixture protection until a licensed electrician approves the method, materials and clearances from the fixture manufacturer's instructions and applicable requirements. This hold also limits the blow-in step below: if a fixture's type or rating is unknown, or it is damaged or not approved, stop, keep insulation out of the clearance zone and escalate; do not cover unsafe fixtures/vents (spec HI-07.SAF). Pending qualified review. (source: spec HI-07.SAF, HI-07.MAT "approved light/penetration protection materials"; spec section 17 intro; 31 section 10)

- [ ] **Pneumatic Blow-In Application:** Feed premium fiberglass or cellulose insulation bags into the commercial blowing machine hopper outside. The attic technician will direct the hose uniformly, filling the floor joists to a depth of 16–20 inches to hit the regional code target (R-49 to R-60 value).

> FLAG (C-HI07-06, C-HI07-05): UNSOURCED - verify against manufacturer instructions. "to a depth of 16–20 inches to hit the regional code target (R-49 to R-60 value)": the depth comes from the approved estimate and the selected product's coverage chart (spec HI-07.QAC "target coverage/depth per approved plan"), and the code-target wording is an unverified regulatory claim until local requirements are verified for each Kentucky and Indiana municipality. The step text above is unchanged. HUMAN REVIEW: owner; local building official; attorney.

## 4. Quality checks

### From "13. Quality checkpoints"

A worker cannot mark the job complete without answering these checks or recording an exception (source: spec QA-001). Photos cannot prove hidden conditions: do not infer hazardous-material clearance or electrical safety from an image (source: quality-assistant playbook).

| Check (spec HI-07.QAC) | How it is verified (pending review) | Evidence | Inspector |
|---|---|---|---|
| Target coverage/depth per approved plan | Measured at the depth markers against the depth and product in the approved estimate, not the fixed range in section 12 (C-HI07-06) | Depth-marker photos per area; product and bag-count record (04 HI-07 completion evidence, PROPOSED) | Worker self-check; whether a supervisor must inspect is Q-31-15 |
| Vents clear | Baffles in place at the eaves; soffit ventilation maintained (spec HI-07.SAF) | Baffle photos per eave run (04 HI-07, PROPOSED) | Worker |
| Fixtures protected as required | Only by a method a licensed electrician approved; unknown fixtures kept clear (C-HI07-03 hold) | Fixture-protection photos (04 HI-07, PROPOSED) | Worker; licensed electrician where the approved method requires it |
| Access/weatherstripping restored | Hatch closed and restored; weatherstripping restoration has no step yet (section 2, Out of scope) | Hatch photo (04 HI-07, PROPOSED) | Worker |
| No insulation contamination in living space | Living space checked after protection is removed (spec QA-002) | Living-space photos (04 HI-07, PROPOSED) | Worker; the customer walkthrough (spec QA-004) is not a safety inspection |

## 5. Cleanup and waste handling

### From "14. Cleanup"

- Remove the protection installed in the "Site Masking" step and check the living space for insulation contamination (source: spec QA-002; HI-07.QAC "no insulation contamination in living space").
- Clean the area; remove waste and protection; account for tools and materials; restore utilities or components altered within scope (source: spec APXA-005).
- Cleanup photos may be required for dusty work (source: spec QA-002); see section 16.
  - Evidence: photo
- Cleanup method and vacuum dust class: TBD - pending qualified safety review (source: spec HI-07.TLS "vacuum").

### From "15. Waste handling"

TBD — requires review by safety-liability-manager and a qualified person; owner to approve.

- Waste from the steps: empty insulation bags and used plastic sheeting (source: original steps "Site Masking" and "Pneumatic Blow-In Application"; spec QA-002 "debris/waste handling").
- Containers, destination and who pays: owner decision with the local rules of the actual municipality (source: 31 section 3.1, waste row; 29 section 8.2 control 10).
- Suspect hazardous material is not bagged, moved or removed (source: section 2, Do not perform; spec START-011).

## 6. Final checks, completion photos and walkthrough

### From "16. Photo requirements (before / during / after)"

- Before: arrival and existing-condition photos; start is blocked until they are captured or an authorized reason is recorded (source: spec START-008). Include what the pre-work inspection finds: moisture, wiring or fixture concerns, combustion concerns and existing insulation (source: spec HI-07.SAF; JOB-004).
  - Evidence: photo, note
- During: concealed conditions recorded with photos and severity (source: spec APXA-004; JOB-004); baffle and depth-marker placement (source: 04 HI-07 completion evidence, PROPOSED).
  - Evidence: note
- After: photos mapped to work areas or tasks (source: spec QA-003): depth markers per area, baffles per eave run, fixture protection, hatch and weatherstripping restored, living space clean (source: 04 HI-07 completion evidence, PROPOSED); cleanup photos where required (source: spec QA-002).
  - Evidence: photo
- Privacy: internal-only by default; avoid people, documents and valuables not needed for the work (source: spec REC-002; 31 section 3.5 rule 7).

### From "17. Customer communication"

- Arrival and completion updates use approved templates; a blocked job uses only the approved "work blocked" message, with no incident details or access codes by text or email (source: spec NTF-007, COM-002).
- Rot, water stains, active leaks, mold, wiring or combustion concerns: stop and escalate first (section 19); the customer is then told in approved wording. The agreement's notify-only clause is under attorney review (source: spec HI-07.SAF; C-HI07-01).
- Walkthrough: record the outcome as accepted, accepted with punch items, unavailable or disputed (source: spec QA-004).
  - Evidence: note
- Care and handoff notes come only from approved product data (source: spec QA-008; quality-assistant playbook "Prepare handoff instructions from approved product data").
- Do not state that the work meets a code, reaches an R-value standard or will lower energy bills, and make no warranty statement (source: section 2, Do not perform item 8; C-HI07-05).
- Explain the invoice and payment next step without unauthorized promises (source: spec APXA-006).

### From "18. Completion criteria"

Done means all of the following, recorded in the job (source: spec QA-001 to QA-004; HI-07.QAC; APXA-005 to APXA-007):

- Every section 13 check answered, or an exception recorded (QA-001).
  - Evidence: note
- After photos mapped to areas or tasks (QA-003).
  - Evidence: photo
- Protection removed and cleanup done, with no insulation contamination in the living space (QA-002; HI-07.QAC).
- Hatch and access restored (HI-07.QAC).
- Tools and materials accounted for; rentals returned (APXA-005, APXA-007).
- Walkthrough outcome recorded, with punch items (QA-004).
  - Evidence: note
- Unresolved issues, incidents and change requests submitted before the job is closed (APXA-007).
- Final completion is a human sign-off; the quality review only recommends readiness (source: quality-assistant playbook "Recommend readiness for human sign-off; do not set final completion").
  - Evidence: note

## Stop-work triggers, escalation and incidents (service-specific)

### From "10. Stop-work conditions"

The general stop-work rule is [[FACT-SVC-STOP-WORK-RULE]]. Service-specific triggers:

Service-specific stop triggers and holds (all pending qualified review; release roles per 31 section 8.3):

- Card guidance, verbatim: "pre-inspect moisture/electrical/combustion concerns; do not cover unsafe fixtures/vents; maintain soffit ventilation; use respiratory/skin protection; stop on mold, active leak or unsafe wiring" (source: spec HI-07.SAF).
- HOLD C-HI07-01, pre-work inspection gate before the first step: release only by a recorded qualified assessment. Suspect hazardous material and unapproved electrical, gas or HVAC scope are critical holds that no role can override (31 section 8.3); suspected mold is treated as critical until the company mold definition exists (31 section 8.4; Q-31-10).
  - Evidence: note
- HOLD C-HI07-01, unknown or suspect existing insulation (for example vermiculite): do not disturb; release only on documented clearance from a qualified asbestos professional accepted by the owner (31 section 7.2).
  - Evidence: note
- HOLD C-HI07-02, attic travel, heat, fall-through, low-clearance and respiratory controls: the attic steps stay on hold until a qualified safety professional approves the controls; a hold caused by a missing policy cannot be released by override (31 section 8.4).
- HOLD C-HI07-03, fixture protection: the "Fixtures Isolation" step is held until a licensed electrician approves the method; if a fixture's type or rating is unknown, stop and keep insulation out of the clearance zone.
- Combustion concern (flue, vent or gas appliance): stop and refer to an HVAC or gas professional (spec HI-07.HAZ "combustion/ventilation issues").

### From "19. Escalation"

General path: [[FACT-SVC-ESCALATION-PATH]].

Service roles for HI-07 (contacts and escalation order are owner decisions, Q-31-05):

- Wiring, junction boxes or recessed fixtures: licensed electrician (C-HI07-03).
- Flues, vents or gas appliances: HVAC or gas professional (spec HI-07.HAZ).
- Unknown or suspect existing insulation: accredited asbestos inspector (C-HI07-01).
- Mold: qualified mold assessor or industrial hygienist (X-06; Q-31-10).
- Heat, falls, low clearance and respiratory protection: qualified safety professional (C-HI07-02).
- Roof leaks or rafter rot: owner, for the referral decision (Q-30-15).
- Code, permit or R-value questions: owner, with the local building official (C-HI07-05).

### From "20. Incident reporting"

General path: [[FACT-SVC-INCIDENT-REPORTING]].

- For this service, report at least a fall or step-through of the ceiling, heat illness, insulation or dust exposure, and blower or hose failure (source: spec JOB-008; HI-07.HAZ "heat stress", "falls through ceiling", "dust/fibers").

## Spanish translation status (section 22)

| Field | Value |
|---|---|
| Spanish version | Not started |
| Source English version | None; no approved English version exists |
| Translator (role) | `<owner decision>`; an AI draft is allowed only when marked `Draft - unreviewed` (spec COM-006) |
| Bilingual reviewer (role) | `<owner decision: qualified bilingual reviewer>` (Q-31-02) |
| Safety glossary version | None exists yet (GAP; spec HND-006) |
| Last review | None |
| Notes | No Spanish text exists for this service (02 G-012). This SOP contains no Arabic text. |

## Open questions in the source SOP

- **Q-31-07** (owner; HUMAN REVIEW: EPA RRP-certified renovator, accredited asbestos inspector): which property-age thresholds trigger lead and asbestos screening for attic work, and does HandyHub hold or plan EPA RRP certification?
- **Q-31-08** (owner; HUMAN REVIEW: licensed electrician): is fixture boxing offered at all, or referred out?
- **Q-31-01** (owner): who are the competent reviewers for this SOP (qualified safety professional, licensed electrician, HVAC or gas professional, asbestos inspector), and how is their competence evidenced?
- **Q-31-05** (owner): emergency and escalation contacts and escalation order for attic work by a two-person team.
- **Q-31-09** (owner; HUMAN REVIEW: qualified safety professional): height and access policy for the hatch ladder and joist travel.
- **Q-31-10** (owner; HUMAN REVIEW: qualified mold assessor): company definition of mold growth and the stop rule.
- **Q-31-11** (owner; HUMAN REVIEW: qualified safety professional): emergency kit contents and the SDS register owner.
- **Q-31-15** (owner): do the depth and fixture-protection checks need a supervisor rather than the worker's self-check?
- **Q-31-02** (owner): who is the qualified bilingual reviewer for the Spanish version?
- **02 C-HI07-05** (owner; HUMAN REVIEW: local building official, attorney): which R-value target, if any, applies per Kentucky and Indiana municipality, and should this SOP name any code target at all?
- **02 C-HI07-08** (owner): which containment standard is intended: floor protection (this SOP) or a full hatch-room wrap (agreement)?
- **02 C-HI07-V01** (owner; HUMAN REVIEW: licensed electrician, local building official): is top-plate penetration sealing in scope at all?
- **02 C-HI07-12** (owner): which baffle materials are approved?
