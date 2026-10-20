---
id: SOP-HI-11
type: sop
title: "SOP HI-11: Structural Deck Maintenance & Deck Board Repairs"
status: active
area: field
links:
  part_of: ["[[SVC-HI-11]]", "[[S07]]"]
  decided_by: ["[[OWN-DEC-108]]", "[[OWN-DEC-109]]", "[[OWN-DEC-17]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]", "[[RULE-HUMAN-REVIEW]]", "[[RULE-NO-INVENTED-FACTS]]", "[[FACT-SVC-STOP-WORK-RULE]]"]
  uses: ["[[FACT-INVENTORY-HI-11]]", "[[FACT-SVC-PHOTO-MINIMUM]]", "[[FACT-SVC-ESCALATION-PATH]]", "[[FACT-SVC-INCIDENT-REPORTING]]"]
source: "vault Standard Of Operations/sop-deck-repair.md; OWN-DEC-108"
---
Worker checklist for [[SVC-HI-11]] (Structural Deck Maintenance & Deck Board Repairs). Status: active for the job checklist under [[OWN-DEC-108]], pending competent review for production use ([[OWN-DEC-17]]). The vault file is a draft (`status: draft-not-field-approved`, `owner_approved: false`).

Source file: `Standard Of Operations/sop-deck-repair.md`. Each group below names the source heading its steps come from, and every step keeps the vault wording (link targets removed). The original procedure is section 12; the other sections were added in the vault on 2026-10-03 from the spec and the SOP standard, pending review. HOLD, GATE and FLAG lines are review controls added on 2026-10-03, pending qualified review: a HOLD placed before a step must be cleared before that step starts. An "Evidence" line lists the photo, measurement or note that the step's own wording asks for; a step without one names none.

Required steps cannot be skipped ([[OWN-DEC-108]]); the completion sequence is [[OWN-DEC-109]] and the minimum photo rule is [[FACT-SVC-PHOTO-MINIMUM]]. Tools, materials and PPE: [[FACT-INVENTORY-HI-11]]. Safety gates: [[RULE-SAFETY-GATES]].

## 1. Site preparation and property protection

### From "5. Customer and property preparation"

- For every job, confirm that access, occupants, pets, parking, hazards and work-area conditions are current (source: spec CX-005).
- PROPOSED, pending owner review, sent with the appointment reminder: clear furniture, grills and planters from the work area; keep occupants and pets off the deck; access under the deck; disclose deck-lighting wiring (source: 04 HI-11 customer preparation, PROPOSED; spec NTF-005).
- A customer's disclosure, for example of deck-lighting wiring, never replaces HandyHub's own pre-start checks in sections 3 and 11 (source: 30 section 4.1 row 5 "never moves HandyHub's own pre-start checks onto the customer").
- Occupants, children and pets stay off the deck area being worked and away from open board gaps and tools until the work area is released (source: spec CX-005; X-11).

## 2. Setup and required measurements/checks

### From "3. Preconditions"

- HOLD (C-HI11-03): before any board is removed or loaded, access to the work area is restricted, the support is inspected and the means to cover or barricade openings are on site (section 12) (source: spec HI-11.SAF "restrict access; inspect support before loading/removing boards"; 31 section 10).
- HOLD (X-12): fall control at a loose guard rail and at elevated deck edges and openings is pending review. The height and access module does not exist yet; until it is approved, elevated work is held and this hold cannot be released by override, and the heights at which fall controls apply are set by the qualified safety professional, none here (source: 31 sections 5.8, 7.2 rank 3, 8.4 rule 4 and 10; 02 G-005; Q-31-09; job-planner playbook "A missing ladder or unverified permit keeps affected tasks blocked.").
- Structural scope decided: no structural repair (joist sistering, ledger, hanger, footing or stair-stringer work) is in scope unless the owner approves it with a qualified structural review; the referral path is an open question (source: 04 HI-11 prerequisites, OPEN QUESTION; Q-31-08; Q-30-15).
- Intake complete: deck size/height, damaged boards/rails/stairs, framing condition, ledger/joist observations, material match, access (source: spec HI-11.INT).
- Approved estimate version and scope; a site assessment of framing condition before a firm quote, because "Photos alone cannot establish hidden condition or load-bearing adequacy." (source: spec CX-003; 04 HI-11 estimating method; estimate-assistant playbook; 28 section 5.3).
- Permit or inspection status recorded where the owner's policy marks the job as needing it; unknown applicability does not default to "no permit" (source: spec START-010, HND-005; 04 HI-11 permit/license flags; risk-triage playbook "unknown applicability must not default to no permit"; HUMAN REVIEW: local building official).
  - Evidence: note
- High-risk service flag: supervisor confirmation at Start Job, PROPOSED (source: spec START-004 "High-risk service/site flags may require separate checkboxes or supervisor confirmation."; 04 HI-11 applicable software workflow, PROPOSED).
- Critical items loaded: the impact driver, reciprocating saw, drill with a long bit, hammer, rot probe and flashlight, and the access-restriction items, which are not yet in the inventory and are proposed there (source: spec START-005, START-006; C-HI11-08).
- Weather suitable at start; thresholds are set by the qualified safety professional, none here; if unsuitable, record No Start / Blocked (source: spec START-011 "severe weather", SCH-008; X-27).
  - Evidence: note
- Appendix A checks before leaving and before starting: correct job and address, latest changes, scope and exclusions, hazards, critical tools and materials loaded, approvals confirmed; start only when Ready or an authorized exception is documented (source: spec APXA-001, APXA-003).
  - Evidence: note

### From "11. Setup"

- On arrival: confirm the address, work area and site contact; park and access appropriately; identify pets and occupants; inspect the site against the briefing (source: spec APXA-002).
- Restrict access to the work area and keep occupants, children and pets off the deck area being worked; stage the barricade, caution tape and covers for openings before any board is removed (source: spec HI-11.SAF "restrict access"; C-HI11-03; X-11).
- Existing-condition photos before work: the deck area, each board, post and rail to be worked, and the access restriction in place (source: spec START-008, APXA-002; 04 HI-11 completion evidence, PROPOSED "before photos").
  - Evidence: photo
- Weather check before work; if unsuitable, record No Start / Blocked (source: spec START-011 "severe weather", SCH-008; X-27).
  - Evidence: note
- Protect the work area; identify utilities and emergency constraints relevant to the task, including any deck-lighting wiring the customer disclosed (source: spec APXA-002; 04 HI-11 customer preparation, PROPOSED).

## 3. Service-specific work steps

### From "12. Step-by-step procedure" (introduction)

All original procedure lines appear below verbatim and in their original order; the two original "Problem Option" headings are demoted one level. Added lines start with `HOLD` or `FLAG` inside a quote block and are pending qualified review.

> HOLD (HI-11.SAF): applies to every step below. Stop and escalate for any major structural, ledger or foundation issue outside the approved repair (section 19), and use fall controls as applicable: until the height and access policy is approved, work at an elevated deck edge or opening is held (section 10). Pending qualified review. (source: spec HI-11.SAF "stop for major structural/ledger/foundation issues outside approved repair; use fall controls as applicable"; 31 sections 7.2 rank 3 and 10; 02 G-005)

### From "12. Step-by-step procedure / 🚨 Problem Option A: Replacing Rotted or Cupped Deck Floorboards"

> HOLD (C-HI11-03): before the "Screw Extraction" and "Joist Inspection" steps below: restrict access to the work area and keep occupants, children and pets away; visually inspect the support under each board before it is removed or loaded; have the means to cover or barricade openings on site, and cover or barricade every opening left by a removed board until it is closed. If the support is in doubt, do not remove or load the board: stop and escalate (section 19). The inspection is a visual screening, not a structural evaluation (section 2, Do-not-perform entry 11); how and from where it is done, and the means of covering openings, are set by the qualified safety professional. The order of the steps below, which pry the board up before the joist is inspected, is under competent review. Pending qualified review. (source: spec HI-11.SAF "restrict access; inspect support before loading/removing boards"; HI-11.HAZ "falls, unstable framing"; 31 section 10; X-11)

- [ ] **Screw Extraction:** Locate rusted fasteners on the rotted board. Use an impact driver with a fresh bit to back them out. If stripped, use a reciprocating saw with a metal demolition blade to slide underneath the board and slice the nail/screw shafts flush with the joist top.
- [ ] **Joist Inspection:** Pry up the rotted floorboard. Inspect the exposed wood joist tops below for deep rot. If spongy, sister a fresh pressure-treated 2x4 block alongside the damaged joist for structural support.

> HOLD (C-HI11-01): the sistering instruction in the step above is suspended pending structural review: stop, make safe (JOB-006), record (JOB-004), escalate. If a joist top is spongy or shows deep rot, do not sister, fasten to or load it: keep the opening covered or barricaded, record the condition with photos and severity, and escalate for an approved change order (FIN-008) or a referral. A structural concern is a critical hold: it clears only with a recorded qualified assessment and is never overridden (31 section 8.3 rule 2). The step text above is unchanged. Pending qualified review. HUMAN REVIEW: structural engineer or building official. (source: spec HI-11.SAF "stop for major structural/ledger/foundation issues outside approved repair"; spec FIN-008; 31 section 10; risk-triage playbook "Do not provide DIY abatement or speculative structural repair instructions.")

- [ ] **New Board Hanging:** Cut a fresh pressure-treated floorboard to fit the opening, leaving a uniform 1/8-inch expansion gap on the sides. Fasten tightly using 3-inch exterior polymer-coated deck screws driven flush.

> FLAG (31 section 3.5 rule 3): UNSOURCED - verify against manufacturer instructions. The "1/8-inch expansion gap" and the "3-inch exterior polymer-coated deck screws" in the step above have no source; board spacing and fastener type, size and placement come from the board and fastener manufacturers' instructions (spec HI-11.QAC "fasteners correct"; 02 G-044). The step text above is unchanged.

### From "12. Step-by-step procedure / 🚨 Problem Option B: Tightening Loose Guard Handrails & Steps"

> HOLD (X-12): before the "Boring Bolt Shafts" step below: a loose guard cannot be relied on as fall protection, so fall control at the loose guard rail is pending review; until the qualified safety professional approves a fall control under the height and access policy, do not work at an elevated edge where the guard is loose. The access restriction and support inspection of the hold before Option A apply here as well. Before drilling, look for wiring, for example deck lighting, along the post and the band joist; if any is present, stop (section 10). Pending qualified review. (source: 31 section 10 "Working at a loose guard rail: fall control pending review"; spec HI-11.SAF "use fall controls as applicable"; spec START-011; APXA-002; 04 HI-11 hazards "drilling through the band joist")

- [ ] **Boring Bolt Shafts:** Drill a 1/2-inch clean hole entirely through the base of the loose vertical handrail post and the primary deck perimeter fascia band joist.
- [ ] **Through-Bolt Installation:** Hammer a heavy-duty, 5-inch galvanized carriage structural bolt through both timbers.

> FLAG (31 section 10): HYPOTHESIS - bolt length to be field-measured. The bolt named in the step above may be too short to leave thread for the washer and nut once it passes through both the post and the band joist; the inventory also stocks a longer bolt. Bolt length, the hole size in "Boring Bolt Shafts" and the connection method itself come from the reviewed method and the bolt manufacturer's data. Whether a single through-bolt is an acceptable guard-post connection is a question for the structural engineer or building official; no vault file states load criteria for guards (32 register B row 49, disposition "Hold"). The step text above is unchanged. HUMAN REVIEW: structural engineer or building official.

- [ ] **Torque Locking:** Fit a thick washer and nut onto the protruding bolt end behind the joist. Tighten securely using a socket wrench until the wood compresses slightly, completely eliminating any sway or play in the safety handrail.

> FLAG: outcome claim - owner and attorney review (31 section 10). "completely eliminating any sway or play in the safety handrail" in the step above is an absolute outcome judged by feel; guard adequacy cannot be verified by the worker or from photos. Do not repeat it to the customer (section 17). The stability check of section 13 is TBD by the reviewer, and the tightening point comes from the reviewed connection method and the bolt manufacturer's data. The step text above is unchanged. HUMAN REVIEW: structural engineer or building official; owner and attorney for the wording (Q-31-16).

> FLAG (C-HI11-04): the Option B heading names "Steps", but no step in this SOP covers stair treads, stair tightening, stringers, railings or balusters, although pricing, the agreement and the main plan sell stair work. NO APPROVED PROCEDURE: not schedulable until drafted and competently reviewed (section 2, Out of scope). Offering, defining or withdrawing stair and railing work is an owner decision. Pending owner decision and competent review.

## 4. Quality checks

### From "13. Quality checkpoints"

> Spec card HI-11.QAC (verbatim): "replaced elements secure/flush, stairs/rails stable, trip hazards removed, fasteners correct, unresolved structural concerns documented"

- Replaced elements secure and flush: each new board fastened with its screws driven flush, as "New Board Hanging" states (source: spec HI-11.QAC "replaced elements secure/flush"; section 12).
- Stairs and rails stable: for Option B, the tightened post; the stability check method is TBD by the reviewer and no load test or criterion is set here; the "any sway or play" wording of "Torque Locking" is flagged (section 12). Stairs are not covered (section 2) (source: spec HI-11.QAC "stairs/rails stable"; 32 register B row 49).
- Trip hazards removed: no raised fastener, loose or uneven board, cut stub, removed fastener or debris left on the deck (source: spec HI-11.QAC "trip hazards removed").
- Fasteners correct per the board, fastener and bolt manufacturers' instructions (source: spec HI-11.QAC "fasteners correct").
- Unresolved structural concerns documented: every decay, movement or damaged connection observed is recorded with photos and severity and reported through the approved wording, without a structural conclusion (source: spec HI-11.QAC "unresolved structural concerns documented"; JOB-004; quality-assistant playbook).
  - Evidence: note
- Each check is answered, or an exception recorded, before completion (source: spec QA-001). Whether a supervisor, not only the worker, inspects any check is an owner decision (Q-31-15); a worker's self-check does not replace a required supervisor inspection (source: quality-assistant playbook "Prevent a worker's self-check from replacing required supervisor inspection.").
  - Evidence: note

## 5. Cleanup and waste handling

### From "14. Cleanup"

- Remove the removed boards, fasteners, cut-offs, debris and protection, and restore the site (source: spec QA-002, APXA-005; HI-11.QAC "trip hazards removed").
- Barricades and covers come off only when no opening remains. If work pauses with an opening left, for example after a structural stop, the opening stays covered or barricaded and the customer is told through the approved wording; the make-safe policy itself does not exist yet (source: spec JOB-006, NTF-007; 31 section 5.8 make-safe module; X-11).
- Account for tools and materials; return unused materials (source: spec APXA-005, APXA-007).

### From "15. Waste handling"

- Removed boards, treated-wood offcuts and old fasteners: disposal destination and any rule for treated wood per the local authority; TBD — requires review by safety-liability-manager and a qualified person; owner to approve. (source: spec QA-002 "debris/waste handling"; 02 G-078; Q-29-10)
- Removed nails and screws are collected, not left on the deck or in the yard (source: spec HI-11.HAZ "nails/splinters"; HI-11.QAC "trip hazards removed").
- Hazardous waste is not handled without an approved policy (source: 31 section 3.1, section 15 minimum content).
- Whether disposal is charged is an owner pricing decision (source: 28 Q-28-15).

## 6. Final checks, completion photos and walkthrough

### From "16. Photo requirements (before / during / after)"

- Before: the deck area and each board, post and rail to be worked, and the access restriction in place (source: spec START-008, APXA-002; 04 HI-11 completion evidence, PROPOSED).
- During: concealed-condition photos of the exposed joists after a board is lifted, and any decay, movement or damaged connection found (source: spec JOB-004; 04 HI-11 completion evidence, PROPOSED "concealed-condition photos of exposed joists").
  - Evidence: photo
- After: per replaced element, mapped to the board, post or area (source: spec QA-003; 04 HI-11 completion evidence, PROPOSED "after photos per replaced element").
  - Evidence: photo
- Photos are internal by default; marketing use needs separate consent; avoid people, neighbors' property not needed for the work, documents and valuables (source: spec REC-002, REC-003; 31 section 3.5 rule 7).

### From "17. Customer communication"

- Arrival and completion updates use approved templates only (source: 31 section 3.1, section 17 minimum content; spec NTF-007, UXE-008).
- Walkthrough outcome recorded: accepted, accepted with punch items, unavailable or disputed (source: spec QA-004, APXA-006).
  - Evidence: note
- Unresolved structural concerns are told to the customer as observations with a referral, in approved wording, never as a structural conclusion or a statement that the deck is safe (source: spec HI-11.QAC; 32 register B row 42 "Reword as visual observation with referral"; quality-assistant playbook).
- Do not promise results, safety, structural soundness, lifespan or code compliance, and do not repeat unapproved claims such as "Ensure Backyard Safety", "restores the safety and lifespan of your deck footprint" or the "any sway or play" wording of "Torque Locking" (source: section 2, Do-not-perform entry 8; 32 register A row 11 and register B rows 41 and 49).
- Care notes, including when new lumber may be stained, come only from approved product data and templates; staining is PT-02 work (source: spec QA-008; 04 HI-11 exclusions "staining timed by product instructions, not an invented cure period").
- When work is blocked, tell the customer only what the approved "work blocked" message says (source: spec NTF-007).
- Explain the invoice and payment next step without making unauthorized promises (source: spec APXA-006).

### From "18. Completion criteria"

- Every section 13 check answered, or an exception recorded (source: spec QA-001).
  - Evidence: note
- After photos mapped to each replaced element (source: spec QA-003).
  - Evidence: photo
- No open board gap left uncovered: the access restriction comes off only when no opening remains, or stays in place with the customer informed (source: spec HI-11.SAF; section 14).
- Cleanup and waste handling complete; tools and materials accounted for (source: spec QA-002, APXA-005).
- Unresolved structural concerns documented and punch items recorded (source: spec HI-11.QAC, QA-005).
  - Evidence: note
- Walkthrough outcome recorded (source: spec QA-004, APXA-006).
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
> Spec card HI-11.SAF (verbatim): "restrict access; inspect support before loading/removing boards; stop for major structural/ledger/foundation issues outside approved repair; use fall controls as applicable"

Service holds and stop triggers (pending qualified review):
- HOLD (C-HI11-03): restrict access, inspect the support before boards are removed or loaded, and cover or barricade openings (sections 3 and 12); if the support is in doubt, stop.
- HOLD (C-HI11-01): a spongy or decayed joist: the sistering instruction is suspended; stop, make safe (JOB-006), record (JOB-004), escalate; no structural repair without an approved change order (FIN-008) and qualified structural review. A structural concern is a critical hold: it clears only with a recorded qualified assessment and is never overridden (source: 31 sections 8.3 rule 2 and 10).
  - Evidence: note
- Stop for major structural, ledger or foundation issues outside the approved repair (source: spec HI-11.SAF).
- HOLD (X-12): fall control at a loose guard rail and at elevated deck edges and openings is pending review; until the height and access policy is approved, this hold cannot be released by override (source: 31 sections 8.4 rule 4 and 10).
- Wiring, for example deck lighting, found in a drilling or cutting path: stop (source: spec START-011 "unapproved electrical/plumbing/gas/structural scope"; 04 HI-11 hazards).
- A customer request for stair, railing, baluster, stringer, ledger or under-deck work: not covered; record the request and escalate (source: spec JOB-010; section 2).
  - Evidence: note
- Severe weather or unsafe heat or cold (source: spec BRF-008; X-27).
- Anyone, including a pet, enters the restricted area or approaches an open board gap (source: X-11).
- Painted surfaces of older or unknown age: do not cut, pry or drill them; escalate (source: spec START-011; Q-31-07).

### From "19. Escalation"

General path: [[FACT-SVC-ESCALATION-PATH]].

Service-specific routing (contacts are owner decisions, Q-31-05):
- A spongy or decayed joist, ledger, beam or post, or framing movement: stop, make safe only as policy allows (JOB-006), record (JOB-004) and escalate to the owner for a change order or a referral; structural questions go to the structural engineer or building official (source: section 12 hold C-HI11-01; spec FIN-008; Q-30-15).
- Structural movement while people are on the deck: an emergency, step 2 above (source: 31 section 8.5 escalation block "structural movement").
- A fall-control or access question at an elevated edge, an opening or a loose guard: record No Start / Blocked for the affected tasks and escalate to the owner and the qualified safety professional (source: section 12 holds; spec SCH-008; Q-31-09).
- Wiring found in a drilling or cutting path: to the owner; a licensed electrician only if wiring work would be needed (source: spec START-011).
- Stair, railing, baluster, stringer or ledger requests: record them as customer requests and escalate to the owner (source: spec JOB-010; section 2).
- Suspect lead paint on painted deck surfaces of older or unknown age: to the owner for review by an EPA RRP-certified renovator; applicability is not concluded (source: spec START-011; Q-31-07).

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

- Q-31-08 — Is joist sistering offered at all, or referred out? Are stair tread replacement and stair tightening, railing and baluster work, ledger and joist-hanger work and an under-deck evaluation offered, defined or withdrawn? Owner; structural engineer or building official.
- Q-30-15 — What is the referral path when hidden rot, ledger or foundation problems are found and no catalog service covers the repair? Owner.
- Q-31-09 — Height and access policy: the deck heights and stairs at which fall controls and access equipment apply, the equipment types, and who may use them. Owner; qualified safety professional.
- Q-31-01 — Who are the competent reviewers (qualified safety professional; structural engineer or building official) and how is their competence evidenced? Owner.
- Q-31-05 — Emergency and escalation contacts, escalation order and after-hours coverage for a two-person team. Owner.
- Q-31-07 — Which property-age threshold triggers lead screening before painted deck boards, rails or posts are cut, pried or drilled? Owner; EPA RRP-certified renovator.
- Q-04-18 — Does the qualified safety professional confirm the old-property screening questions for HI-11? Qualified safety professional.
- Q-31-15 — Which section 13 checks, for example the stability of a tightened post, need a supervisor rather than the worker's self-check? Owner.
- Q-31-16 — Who approves replacement wording for the "any sway or play" line once the SOP is revised? Owner; attorney.
- Q-31-18 — Which HI-11 holds are critical holds under the 31 section 8.4 rule? Qualified safety professional; owner.
- Q-31-02 — Who is the qualified bilingual reviewer for the Spanish version? Owner.
