---
id: SOP-HI-10
type: sop
title: "SOP HI-10: Structural Fence Maintenance & Structural Repairs"
status: active
area: field
links:
  part_of: ["[[SVC-HI-10]]", "[[S07]]"]
  decided_by: ["[[OWN-DEC-108]]", "[[OWN-DEC-109]]", "[[OWN-DEC-17]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]", "[[RULE-HUMAN-REVIEW]]", "[[RULE-NO-INVENTED-FACTS]]", "[[FACT-SVC-STOP-WORK-RULE]]"]
  uses: ["[[FACT-INVENTORY-HI-10]]", "[[FACT-SVC-PHOTO-MINIMUM]]", "[[FACT-SVC-ESCALATION-PATH]]", "[[FACT-SVC-INCIDENT-REPORTING]]"]
source: "vault Standard Of Operations/sop-fence-repair.md; OWN-DEC-108"
---
Worker checklist for [[SVC-HI-10]] (Structural Fence Maintenance & Structural Repairs). Status: active for the job checklist under [[OWN-DEC-108]], pending competent review for production use ([[OWN-DEC-17]]). The vault file is a draft (`status: draft-not-field-approved`, `owner_approved: false`).

Source file: `Standard Of Operations/sop-fence-repair.md`. Each group below names the source heading its steps come from, and every step keeps the vault wording (link targets removed). The original procedure is section 12; the other sections were added in the vault on 2026-10-03 from the spec and the SOP standard, pending review. HOLD, GATE and FLAG lines are review controls added on 2026-10-03, pending qualified review: a HOLD placed before a step must be cleared before that step starts. An "Evidence" line lists the photo, measurement or note that the step's own wording asks for; a step without one names none.

Required steps cannot be skipped ([[OWN-DEC-108]]); the completion sequence is [[OWN-DEC-109]] and the minimum photo rule is [[FACT-SVC-PHOTO-MINIMUM]]. Tools, materials and PPE: [[FACT-INVENTORY-HI-10]]. Safety gates: [[RULE-SAFETY-GATES]].

## 1. Site preparation and property protection

### From "5. Customer and property preparation"

- For every job, confirm that access, occupants, pets, parking, hazards and work-area conditions are current (source: spec CX-005).
- PROPOSED, pending owner review (source: 04 HI-10 customer preparation row): pets secured; yard and gate access; fence line cleared; private buried lines disclosed; neighbor notice on shared lines; people and pets kept clear of braces and wet concrete during the cure.
- A customer's disclosure of buried lines never replaces the utility-locate hold in section 3 (source: 30 section 4.1 row 5 "never moves HandyHub's own pre-start checks onto the customer").
- Occupants, children and pets stay away from the work area, open holes, wet concrete and braces (source: spec CX-005; X-11).

## 2. Setup and required measurements/checks

### From "3. Preconditions"

- HOLD (C-HI10-01): no digging, augering or ground-driven anchor work until utility-locate status and property authorization are recorded for this job. Who requests locates, the lead time and the form of evidence are owner decisions taken with the local authority's and utility-locate guidance for each Kentucky and Indiana municipality; no rule is concluded here (Q-31-08). Until the owner's utility-locate policy is approved, this hold cannot be released by override (31 section 8.4 rule 4). (source: spec HI-10.SAF "utility-location/permit policy before digging"; 02 G-005; 31 section 10)
  - Evidence: note
- Property authorization recorded before any work: the customer's authority to have this fence line repaired (the agreement relies on the client's representation of "legal ownership or neighbor approval"); stop on any boundary uncertainty (source: spec HI-10.SAF "verify scope/property authorization"; agreement "Boundary Disclaimer").
  - Evidence: note
- Intake complete: fence type/material, damaged posts/rails/pickets/gate, property-line assumptions, underground utility concerns, soil/access (source: spec HI-10.INT).
- Approved estimate version and scope; a site assessment before a firm quote for digging or structural work (source: spec CX-003; 04 HI-10 estimating method; 28 section 5.3).
- Permit, zoning or HOA status recorded where the owner's policy marks the job as needing it; unknown applicability does not default to "no permit" (source: spec START-010, HND-005; 04 HI-10 permit/license flags; risk-triage playbook "unknown applicability must not default to no permit"; HUMAN REVIEW: local permit office).
  - Evidence: note
- Critical items loaded: bracing lumber and stakes and the post level, which are not yet in the inventory and are proposed there (source: spec START-005, START-006; C-HI10-V01).
- Weather and ground suitable at start; thresholds are set by the qualified safety professional, none here; if unsuitable, record No Start / Blocked (source: spec START-011 "severe weather", SCH-008; X-27).
  - Evidence: note
- Appendix A checks before leaving and before starting: correct job and address, latest changes, scope and exclusions, hazards, critical tools and materials loaded, approvals confirmed; start only when Ready or an authorized exception is documented (source: spec APXA-001, APXA-003).
  - Evidence: note

### From "11. Setup"

- On arrival: confirm the address, work area and site contact; park and access appropriately; identify pets and occupants; inspect the site against the briefing (source: spec APXA-002).
- Confirm on site that the work area is the recorded fence line on the existing footprint, and that utility-locate status and property authorization are recorded before any digging (section 3 hold) (source: spec HI-10.SAF; APXA-002 "identify utilities/emergency constraints relevant to task").
  - Evidence: note
- Existing-condition photos before work: the fence line, each damaged post, rail and gate, and the locate record (source: spec START-008, APXA-002; 04 HI-10 completion evidence, PROPOSED).
  - Evidence: photo, note
- Weather and ground check before work; if unsuitable, record No Start / Blocked (source: spec START-011 "severe weather", SCH-008; X-27).
  - Evidence: note
- Work area kept clear of occupants, children and pets, including the area a leaning section could fall into (source: X-11; spec HI-10.HAZ "collapse/unstable sections").
- Bracing lumber, stakes and the post level staged before any excavation or rail removal (section 12 holds) (source: spec HI-10.SAF "brace unstable sections"; C-HI10-V01).
- Protect the work area; identify utilities and emergency constraints relevant to the task (source: spec APXA-002).

## 3. Service-specific work steps

### From "12. Step-by-step procedure" (introduction)

All original procedure lines appear below verbatim and in their original order; the two original "Problem Option" headings are demoted one level. Added lines start with `HOLD` or `FLAG` inside a quote block and are pending qualified review.

> HOLD (HI-10.SAF): applies to every step below. Stop and escalate on major structural or boundary uncertainty: the work area is not the recorded fence line on the existing footprint, ownership or authorization is disputed or unclear, or a section cannot be braced (section 19). Pending qualified review. (source: spec HI-10.SAF "verify scope/property authorization", "stop for major structural/boundary uncertainty"; agreement "Boundary Disclaimer"; 31 section 10)

> HOLD (C-HI10-01): before Option A below ("Slurry Excavation") and before any other digging, augering or ground-driven anchor work: do not dig until utility-locate status and property authorization are recorded for this job (section 3). This hold cannot be released by override until the owner's utility-locate policy is approved (31 section 8.4 rule 4). Who requests locates, the lead time and the evidence are owner decisions with the local authority's and utility-locate guidance (Q-31-08); no rule is concluded here. Pending qualified review. (source: spec HI-10.SAF "utility-location/permit policy before digging"; HI-10.HAZ "underground utilities"; 31 sections 7.2 rank 8 and 10)

### From "12. Step-by-step procedure / 🚨 Problem Option A: Stabilizing Leaning Posts (Concrete Collar Reinforcement)"

> HOLD (C-HI10-05): before the "Slurry Excavation" step below: brace or support the leaning section so that it cannot fall or shift while its post is excavated, and keep people and pets out of the area it could fall into. If it cannot be braced, stop and escalate. The order of "Slurry Excavation" and "Plumb Bracing" is under competent review (bracing before disturbance). Pending qualified review. (source: spec HI-10.SAF "brace unstable sections"; HI-10.HAZ "collapse/unstable sections"; 31 section 10)

- [ ] **Slurry Excavation:** Dig out a 24-inch deep cone-shaped trench around the base of the leaning wood fence post using a trenching spade, leaving the post undisturbed.

> FLAG (C-HI10-02): UNSOURCED - verify against manufacturer instructions. "24-inch deep" in the step above has no source. No vault file states a frost depth for any municipality, so whether this depth reaches "below regional frost lines" (agreement) or "below the frost line" (main plan) is unknown; the depth comes from the reviewed method, the product instructions and any local requirement, verified separately for each Kentucky and Indiana municipality. The trenching spade is not in the inventory (C-HI10-V01). The step text above is unchanged. HUMAN REVIEW: licensed trade professional (structural); local building official.

- [ ] **Plumb Bracing:** Push the leaning fence section back into a true vertical plumb line using a post level. Secure temporary structural wood 2x4 kick-braces to the post to hold it locked in place.

> FLAG (C-HI10-05): SEQUENCE UNDER REVIEW - the step above moves the section to plumb before the kick-braces are secured. Until competent review sets the order, the section stays braced or supported throughout (hold above); if it shifts, stop. Bracing lumber and the post level are not in the inventory and are critical items (C-HI10-V01). The step text above is unchanged. Pending qualified review.

- [ ] **Concrete Pouring:** Pour fast-setting concrete dry mix straight into the open trench around the post base. Pour 1–2 gallons of plain water directly over the dry powder. Use a metal digging bar to stab the mix to eliminate hidden air pockets. Let cure for 4 hours before removing temporary braces.

> FLAG (31 section 10): UNSOURCED - verify against manufacturer instructions. "1–2 gallons of plain water" and "cure for 4 hours" in the step above have no source; the water amount, the method of wetting the mix in place and the cure time come only from the concrete product's instructions (spec section 17: "Service-card defaults never override a site-specific hazard, manufacturer instruction, permit/licensing requirement, or approved change order."). The cure wait before the braces are removed is never shortened on site: it stays in force as written until a qualified reviewer replaces it. Dust and skin and eye contact controls for dry and wet mix come from the product SDS (sections 6 and 9). The step text above is unchanged. HUMAN REVIEW: qualified safety professional; licensed trade professional (structural).

> HOLD (X-11): during the cure wait in the step above, the filled hole, wet concrete and braces stay in the yard. Keep occupants, children and pets away from them; protection means, for example covers or caution tape, are chosen by the qualified safety professional, and the customer receives the cure and no-load note from the product instructions (spec QA-008). Whether the crew waits on site or returns to remove the braces is an owner decision (04 HI-10 labor assumptions). Pending qualified review. (source: 29 section 7.3 HI-10 row; spec QA-008)

### From "12. Step-by-step procedure / 🚨 Problem Option B: Replacing Broken Rails & Sagging Gates"

> HOLD (C-HI10-05): before the "Rail Extraction" step below: brace or support the section so that removing a rail cannot let the section or its pickets fall, and keep people and pets out of the area it could fall into. If it cannot be braced, stop and escalate. Pending qualified review. (source: spec HI-10.SAF "brace unstable sections"; HI-10.HAZ "collapse/unstable sections"; 31 section 10)

- [ ] **Rail Extraction:** Back out rusted fasteners and pull down broken horizontal 2x4 rails.
- [ ] **New Rail Setting:** Measure and cut fresh pressure-treated 2x4 rails. Secure them between posts using heavy galvanized steel fence brackets and outdoor polymer exterior screws.
  - Evidence: measurement
- [ ] **Gate Re-Squaring:** Screw a heavy steel anti-sag gate cable kit diagonally across the back framework of the gate. Tighten the central turnbuckle link until the gate lifts and closes smoothly without dragging the ground latch.

> FLAG (C-HI10-06, C-HI10-07): no step in this SOP covers picket replacement, post replacement, steel post splints or other ground-driven anchors, the gas auger, or gate hinge, latch and drop-rod replacement, although pricing, the agreement, the inventory or the main plan offer them. They are not performed under this SOP (section 2, Out of scope). Pending owner decision and competent review.

## 4. Quality checks

### From "13. Quality checkpoints"

> Spec card HI-10.QAC (verbatim): "stable posts/rails, aligned replacement pieces, gate functions, fasteners appropriate, site/backfill clean and safe"

- Posts and rails stable (source: spec HI-10.QAC "stable posts/rails"). When the braces may come off follows the cure wait in section 12, which stays in force until a qualified reviewer replaces it; the stability check method is TBD by the reviewer, and no load test is set here.
- Replacement pieces aligned with the existing fence line (source: spec HI-10.QAC "aligned replacement pieces").
- Gate functions: the "Gate Re-Squaring" step's own check that the gate "lifts and closes smoothly without dragging the ground latch" (source: spec HI-10.QAC "gate functions"; section 12).
- Fasteners appropriate per the bracket and fastener manufacturers' instructions (source: spec HI-10.QAC "fasteners appropriate").
- Site and backfill clean and safe: no open hole, loose brace, cut stub or debris left unprotected or undisclosed to the customer (source: spec HI-10.QAC "site/backfill clean and safe"; X-11).
- Each check is answered, or an exception recorded, before completion (source: spec QA-001). Whether a supervisor, not only the worker, inspects any check is an owner decision (Q-31-15); a worker's self-check does not replace a required supervisor inspection (source: quality-assistant playbook).
  - Evidence: note

## 5. Cleanup and waste handling

### From "14. Cleanup"

- Backfill and leave the site clean and safe (source: spec HI-10.QAC "site/backfill clean and safe").
- Remove debris, protection and markers, and restore the site (source: spec QA-002, APXA-005).
- Temporary braces come off only after the cure wait in section 12. If the crew leaves before then, the braces and the area stay protected and the customer has the cure and no-load note (source: section 12 holds; spec QA-008).
- Account for tools and materials; return unused materials (source: spec APXA-005, APXA-007).

### From "15. Waste handling"

- Excavated soil: backfilled or removed within the approved scope; destination for surplus soil: TBD — requires review by safety-liability-manager and a qualified person; owner to approve. (source: spec HI-10.QAC "site/backfill clean and safe"; QA-002; Q-29-10)
- Removed rails and pickets, old fasteners, empty concrete bags and treated-wood offcuts: disposal destination and any rule for treated wood per the local authority; TBD (source: spec QA-002 "debris/waste handling"; 02 G-078; Q-29-10).
- Concrete product residue and bags: handling per the product SDS (source: 29 section 8.2 row 10).
- Hazardous waste is not handled without an approved policy (source: 31 section 3.1, section 15 minimum content).
- Whether disposal is charged is an owner pricing decision (source: 28 Q-28-15).

## 6. Final checks, completion photos and walkthrough

### From "16. Photo requirements (before / during / after)"

- Before: the fence line and each damaged post, rail, picket and gate; the utility-locate record and marks and the authorization record before digging (source: spec START-008, APXA-002; 04 HI-10 completion evidence, PROPOSED).
  - Evidence: note
- During: post plumb and bracing before the pour; the collar after the pour; any concealed condition such as rot at or below grade, or a buried object found while digging (source: spec JOB-004; 04 HI-10 completion evidence, PROPOSED).
- After: rails, gate operation, backfill and site clean, mapped to each post, section and gate (source: spec QA-003; HI-10.QAC).
- Photos are internal by default; marketing use needs separate consent; avoid people, neighbors' property not needed for the work, documents and valuables (source: spec REC-002, REC-003; 31 section 3.5 rule 7).

### From "17. Customer communication"

- Arrival and completion updates use approved templates only (source: 31 section 3.1, section 17 minimum content; spec NTF-007, UXE-008).
- Cure and no-load note, for example on gate use or leaning on a repaired post; its content comes only from the concrete product's instructions (source: spec QA-008; 04 HI-10 completion evidence, PROPOSED).
- Walkthrough outcome recorded: accepted, accepted with punch items, unavailable or disputed (source: spec QA-004, APXA-006).
  - Evidence: note
- Do not promise results, permanence, wind-load performance, frost depth or code compliance, and do not repeat unapproved main-plan claims such as "like-new strength" or "below the frost line" (C-HI10-02) (source: section 2, Do not perform entry 8; 32 register B rows 39 and 40).
- Do not give an opinion on where the property line is or settle a neighbor question on site; refer it to the owner (source: agreement "Boundary Disclaimer"; spec HI-10.SAF).
- When work is blocked, tell the customer only what the approved "work blocked" message says (source: spec NTF-007).
- Explain the invoice and payment next step without making unauthorized promises (source: spec APXA-006).

### From "18. Completion criteria"

- Every section 13 check answered, or an exception recorded (source: spec QA-001).
  - Evidence: note
- After photos mapped to each post, section and gate (source: spec QA-003).
  - Evidence: photo
- Braces removed after the cure wait, or left protected with the customer informed (source: section 12; spec QA-008).
- Cleanup and waste handling complete; tools and materials accounted for (source: spec QA-002, APXA-005).
- Walkthrough outcome and any punch items recorded (source: spec QA-004, APXA-006).
  - Evidence: note
- No hold or stop-work item left unresolved (source: 31 section 8.3).
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
> Spec card HI-10.SAF (verbatim): "verify scope/property authorization; utility-location/permit policy before digging; brace unstable sections; stop for major structural/boundary uncertainty"

Service holds and stop triggers (pending qualified review):
- HOLD (C-HI10-01): no digging, augering or ground-driven anchors until utility-locate status and property authorization are recorded (sections 3 and 12).
  - Evidence: note
- HOLD (C-HI10-05): brace or support unstable sections before excavation or rail removal (section 12); if a section cannot be braced, stop (source: spec HI-10.SAF "brace unstable sections").
- Stop for major structural or boundary uncertainty (source: spec HI-10.SAF).
- A buried line, pipe, cable or other unexpected object found while digging: stop digging, keep people away and escalate; if it is damaged or leaking, treat it as an emergency (section 19) (source: spec HI-10.HAZ "underground utilities"; START-011; JOB-004).
- Non-wood or unknown fence materials: stop (source: 31 section 10).
- A post found rotted at or below grade, or another concealed condition: stop the affected work, record it with photos and escalate for a change order (source: spec JOB-004, FIN-008; 04 HI-10 estimating method).
  - Evidence: note
- Severe weather or unsafe heat or cold (source: spec BRF-008; X-27).
- Anyone, including a pet, enters the work area or reaches an open hole or brace (source: X-11).
- Painted components of older or unknown age: do not cut or pry them; escalate (source: spec START-011; Q-31-07).

### From "19. Escalation"

General path: [[FACT-SVC-ESCALATION-PATH]].

Service-specific routing (contacts are owner decisions, Q-31-05):
- Contact with, or damage to, a buried line: emergency services and the utility as the situation requires, then the owner; no conclusion about notification duties is drawn here (source: section 19 step 2; 31 section 7.2 rank 8; HUMAN REVIEW: local authority and utility-locate guidance).
- Utility-locate status missing or unclear before digging: record No Start / Blocked for the digging tasks and escalate to the owner (source: section 3 hold; spec SCH-008).
- Boundary dispute or doubt about authorization: to the owner, who takes legal questions to the attorney (source: agreement "Boundary Disclaimer"; spec HI-10.SAF).
- A section that cannot be braced, or rot at or below grade: to the owner for a change order or referral; structural questions to the licensed trade professional (structural) (source: spec FIN-008, JOB-004; 31 section 10).
- Pool-barrier gate or latch questions: to the owner, who consults the local building official (no conclusion drawn here) (source: 04 HI-10 permit/license flags).
- Suspect lead paint on older painted fence components: to the owner for review by an EPA RRP-certified renovator; applicability is not concluded (source: spec START-011; Q-31-07).

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
| Notes | The steps contain no Arabic or other non-English text; the emoji in the original H1 and the two original option headings are kept verbatim |

## Open questions in the source SOP

- Q-31-08 — Locate rules (owner and local authority): who requests utility locates, how far ahead, how the result is recorded, and are private buried lines covered? Are picket replacement, post replacement, steel post splints, the gas auger and gate hardware replacement offered at all, or withdrawn? Owner; local authority and utility-locate guidance; relevant reviewers.
- 30 section 8 row 15 / C-HI10-02 — Which frost-depth and code rules apply per municipality, and does any depth statement belong in customer documents? Local building official; attorney, for Kentucky and for Indiana separately.
- 04 HI-10 card, labor assumptions — After a concrete collar, does the crew wait out the cure on site or return to remove the braces? Owner.
- Q-31-01 — Who are the competent reviewers (qualified safety professional; licensed trade professional (structural)) and how is their competence evidenced? Owner.
- Q-31-05 — Emergency and escalation contacts, escalation order and after-hours coverage for a two-person team. Owner.
- Q-31-07 — Which property-age threshold triggers lead screening before painted fence components are cut or pried? Owner; EPA RRP-certified renovator.
- Q-31-15 — Which section 13 checks need a supervisor rather than the worker's self-check? Owner.
- Q-31-18 — Confirm the hazard order for dry concrete dust (rank 12) and which HI-10 holds are critical holds under the 31 section 8.4 rule. Qualified safety professional; owner.
- Q-31-02 — Who is the qualified bilingual reviewer for the Spanish version? Owner.
