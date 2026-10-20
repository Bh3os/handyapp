---
id: SOP-DW-02
type: sop
title: "SOP DW-02: Texture Matching & Popcorn Ceiling Removal"
status: active
area: field
links:
  part_of: ["[[SVC-DW-02]]", "[[S07]]"]
  decided_by: ["[[OWN-DEC-108]]", "[[OWN-DEC-109]]", "[[OWN-DEC-17]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]", "[[RULE-HUMAN-REVIEW]]", "[[RULE-NO-INVENTED-FACTS]]", "[[FACT-SVC-STOP-WORK-RULE]]"]
  uses: ["[[FACT-INVENTORY-DW-02]]", "[[FACT-SVC-PHOTO-MINIMUM]]", "[[FACT-SVC-ESCALATION-PATH]]", "[[FACT-SVC-INCIDENT-REPORTING]]"]
source: "vault Standard Of Operations/sop popcorn-removal.md; OWN-DEC-108"
---
Worker checklist for [[SVC-DW-02]] (Texture Matching & Popcorn Ceiling Removal). Status: active for the job checklist under [[OWN-DEC-108]], pending competent review for production use ([[OWN-DEC-17]]). The vault file is a draft (`status: draft-not-field-approved`, `owner_approved: false`).

Source file: `Standard Of Operations/sop popcorn-removal.md`. Each group below names the source heading its steps come from, and every step keeps the vault wording (link targets removed). The original procedure is section 12; the other sections were added in the vault on 2026-10-03 from the spec and the SOP standard, pending review. HOLD, GATE and FLAG lines are review controls added on 2026-10-03, pending qualified review: a HOLD placed before a step must be cleared before that step starts. An "Evidence" line lists the photo, measurement or note that the step's own wording asks for; a step without one names none.

Required steps cannot be skipped ([[OWN-DEC-108]]); the completion sequence is [[OWN-DEC-109]] and the minimum photo rule is [[FACT-SVC-PHOTO-MINIMUM]]. Tools, materials and PPE: [[FACT-INVENTORY-DW-02]]. Safety gates: [[RULE-SAFETY-GATES]].

Section 12 phases listed under another stage because their heading names only that stage's work: Phase 1 to stage 1. All other phases stay in stage 3 in their original order.

## 1. Site preparation and property protection

### From "5. Customer and property preparation"

- The agreement makes the client "completely remove all electronics, personal items, clothes, and furniture from the target rooms before the crew arrives", while the "Total Masking" step has the crew "Remove all furniture from the zone." Verify the room is empty on arrival and record any exception; who moves furniture, and at what price, is an owner decision (source: agreement "Total Room Evacuation"; C-DW02-14; spec START-007).
  - Evidence: note
- PROPOSED customer checklist, sent with the appointment reminder once the owner and attorney approve the wording: rooms emptied; occupants and pets plan; HVAC shutdown consent and its scope; access for a multi-visit job; disclose the build year, any prior testing and whether the ceiling was painted (source: 04 DW-02 customer preparation requirements, GAP; spec NTF-004, NTF-005; DW-02.INT).
- Occupied home: occupants, children and pets are kept out of the contained area; the occupant and pet module is pending qualified safety review (source: spec DW-02.INT "occupied status"; APXA-002; X-11; 31 section 5.8).
- HVAC off in an occupied home: no temperature limit or duration is set here; the plan is pending owner, attorney (consent wording) and qualified safety review (source: C-DW02-V01).
- A customer's statement or signature never clears a hold, and a customer-provided test log counts only once the owner and an accredited asbestos inspector define what record releases work (source: risk-triage playbook "Unknown popcorn-ceiling material is not cleared by wet scraping."; owner facts 2026-10-02 "acknowledgment cannot bypass critical holds"; Q-30-18).
  - Evidence: note

### From "12. Step-by-step procedure / 🕒 Phase 1: High-Risk Containment Setup"

> HOLD (C-DW02-03, X-13) - before the first step below ("Asbestos Verification") and before any step that wets, scrapes, sands or tapes over the ceiling texture, including sealing ceiling vents in "HVAC Isolation": build year unknown = HOLD; untested texture = HOLD at any property age until a qualified reviewer sets the screening rule (04 DW-02 prerequisites, PROPOSED); painted texture in a pre-1978 or unknown-age home = HOLD for EPA RRP review. Do not disturb the ceiling; stop and escalate. Wet methods do not clear suspect material ("Unknown popcorn-ceiling material is not cleared by wet scraping"). Release only by the qualified reviewer named in section 10. Pending qualified review. (source: spec DW-02.SAF, DW-02.HAZ, DW-02.INT; 31 section 10; risk-triage playbook; owner facts 2026-10-02 "Unknown is not safe")

> HOLD (C-DW02-02) - before the first step below: no HandyHub worker collects, cuts or sends samples of the texture; the testing role is undefined. The record that releases work (who sampled, which lab, which result) is not yet defined by the owner with an accredited asbestos inspector, so a test log alone does not release the ceiling (04 DW-02 status; Q-30-18). Positive or inconclusive result = BLOCKED: release only on documented clearance from a qualified asbestos professional accepted by the owner; never on the basis of encapsulation in place (related C-DW02-01: the agreement's resumption clause is under attorney review). Pending qualified review. (source: 31 section 10; spec DW-02.SAF, START-010)

- [ ] **Asbestos Verification:** Confirm if the home was built before 1980. If yes, stop work and verify asbestos testing logs before disturbing the ceiling matrix.
  - Evidence: note

> FLAG (C-DW02-03): UNSOURCED threshold - reviewer to confirm (not a manufacturer value). The "1980" build year in the step above has no cited source. The existing stop stays in force until a qualified reviewer replaces it; the holds above add the unknown-year, untested-texture and painted-texture cases and do not relax it. The step text is unchanged. HUMAN REVIEW: accredited asbestos inspector; EPA RRP-certified renovator (Q-31-07). (source: 31 section 10; 36 section 3.4 rule 8)

> HOLD (X-12, C-DW02-12) - before "HVAC Isolation" below and every later step that needs a ladder, platform or staging rather than a pole tool from the floor, for example sealing ceiling vents, hanging the wall curtains, the Phase 3 hand work, priming and texture spraying, and any ceiling above the height the pricing file surcharges: access only with equipment and methods approved under a height and access policy, which does not exist yet (02 G-005); the inventory lists no access equipment beyond the scraper poles. Until the policy exists those steps stay on hold (31 section 8.4). Pending qualified review. (source: spec DW-02.TLS "access equipment", DW-02.HAZ "falls", DW-02.SAF "height controls")

- [ ] **HVAC Isolation:** Turn off the home's heating/cooling system entirely and seal all air intake/output vents tightly with plastic film and painters tape.

> HOLD (C-DW02-V01, X-07): the step above is limited by the signed consent. The agreement's "HVAC Shutdown Consent" covers "the scraping and sanding phases", while the step turns the system off "entirely" and no step restores it, including through the drying waits in Phase 4. Confirm the HVAC state against the signed consent at each phase change and record any exception (spec START-007, JOB-009). How long the HVAC may stay off, who restores it and when, and an occupant and worker temperature plan are pending owner, attorney (consent wording) and qualified safety review; no limit is set here (related X-27). No company isolate-verify-restore module exists yet (X-07; 31 section 5.8). Unsealing the vents and restoring the HVAC belong to closeout (section 14). Pending qualified review. (source: agreement "HVAC Shutdown Consent"; 02 C-DW02-V01; 31 section 10)

- [ ] **Total Masking:** Remove all furniture from the zone. Line the entire floor with thick heavy plastic sheeting (6 mil thickness). Run a continuous 3-mil plastic curtain along all walls, overlapping the floor sheets by 12 inches to form a complete static dust envelope.

> FLAG (C-DW02-14): VERIFY CLIENT PREP / record exception. The agreement makes the client remove "all electronics, personal items, clothes, and furniture" before the crew arrives, while the step above has the crew "Remove all furniture from the zone." Until the owner decides who moves furniture and at what price, verify on arrival that the rooms are empty as the agreement requires and record any exception (spec START-007). The step text is unchanged. (source: agreement "Total Room Evacuation"; 02 C-DW02-14)

## 2. Setup and required measurements/checks

### From "3. Preconditions"

All pending qualified review. A precondition that is not met keeps the affected tasks blocked (source: job-planner playbook "A missing ladder or unverified permit keeps affected tasks blocked.").

- On-site assessment before a firm quote; no firm quote until the hazardous-material disposition (asbestos result and the lead or painted-texture decision) is recorded (source: 04 DW-02 estimating method, PROPOSED; estimate-assistant playbook "Missing hazardous-condition decisions block a firm quote.").
  - Evidence: note
- Screening recorded before dispatch: approximate build year or "unknown" (spec BRF-003 "approximate age if known"), prior testing and who performed it, texture type and whether the texture is painted (spec DW-02.INT). Unknown is not safe: an unknown build year is a hold (source: owner facts 2026-10-02; 31 SOP-022, PROPOSED).
  - Evidence: note
- The record that releases work (who sampled, which lab, which result) is not yet defined by the owner with an accredited asbestos inspector, and no HandyHub sampling takes place (source: 04 DW-02 status; Q-30-18; C-DW02-02). The result is stored as a START-010 prerequisite and an SCH-001 readiness flag (source: 04 DW-02 prerequisites, PROPOSED).
  - Evidence: note
- Permit, licence or qualification flags: where admin policy marks the job, Start Job is blocked until the prerequisite is approved (source: spec START-010). Abatement, notification and disposal requirements after a positive result, and whether EPA RRP applies to painted texture, are OPEN QUESTIONS per Kentucky and Indiana municipality; unknown applicability must not default to "no permit" (source: 04 DW-02 permit/license flags; risk-triage playbook).
- Signed HVAC shutdown consent on file; its scope is "during the scraping and sanding phases" (source: agreement "HVAC Shutdown Consent"; C-DW02-V01).
- Customer preparation as agreed: rooms emptied before the crew arrives, verified on arrival (source: agreement "Total Room Evacuation"; C-DW02-14).
- Fixture isolation method, respiratory protection and dust-control decision, and height and access policy approved by the qualified reviewers; until they exist, the steps they gate stay on hold (source: section 12 holds; 31 section 8.4).
- Before leaving: confirm job, customer, address and time; read the latest changes; review scope, exclusions, hazards and safety; load critical tools, equipment and materials; confirm required documents and approvals (source: spec APXA-001).
- Before starting: complete the required safety, PPE and site checks; confirm materials; acknowledge the SOP and hazards; start only when Ready or an authorized exception is documented (source: spec APXA-003). High-risk flags may require separate checkboxes or supervisor confirmation (source: spec START-004).
  - Evidence: note
- Materials readiness: missing material may block start, for example primer, disposal bags, setting compound or mesh tape, which are not stocked (source: spec START-006; C-DW02-12).
- Multi-visit planning: the drying wait between skim passes ("Allow 12–24 hours to dry") means return visits; the job planner plans them and keeps the HVAC state within the signed consent across visits (source: original step "Drying & Ridge Scraping"; 04 DW-02 labor assumptions; job-planner playbook "drying/cure waits"; C-DW02-V01).

### From "11. Setup"

- On arrival: confirm address, work area and contact; identify pets and occupants; inspect the actual site against the briefing; capture the required existing-condition photos; protect the work area; identify utilities and emergency constraints relevant to the task (source: spec APXA-002).
  - Evidence: photo
- Pre-start site check: record any difference from the briefing, including rooms not emptied as agreed; material differences trigger Risk Triage or supervisor review (source: spec START-007; C-DW02-14).
  - Evidence: note
- Confirm that the hazardous-material disposition and the other section 3 preconditions are recorded before any setup step touches the ceiling (source: section 3; spec START-010).
  - Evidence: note
- Existing-condition photos before any work: the whole ceiling, existing cracks, fixtures and vents (source: spec START-008, BRF-012; X-02; section 16).
  - Evidence: photo
- Containment: the "HVAC Isolation" and "Total Masking" steps in section 12; keep protection and containment in place during work (source: spec APXA-004 "keep protection/containment"; DW-02.SAF "isolate area; control dust").
- PROPOSED, pending review: record the HVAC state before switching it off, so that it can be restored at closeout (source: spec APXA-005 "restore utilities/components altered within scope"; 31 section 5.8 isolate-verify-restore module; C-DW02-09).
  - Evidence: note
- Fixture isolation and protection only by the approved method (section 12 hold; C-DW02-04).

## 3. Service-specific work steps

### From "12. Step-by-step procedure" (introduction)

*Original procedure, verbatim and in its original order; the original phase headings are demoted one level with their text unchanged. The HOLD and FLAG lines are additions pending qualified review: a precondition hold sits directly before the step it gates, and a hold or flag that suspends, limits or flags a step sits directly after it (36 D-36-17). They never replace or reword a step.*

### From "12. Step-by-step procedure / 💧 Phase 2: Hydraulic Softening & Scraping"

> HOLD (C-DW02-04) - before "Misting Protocol" below and any wetting of the ceiling: the ceiling light fixtures and circuits in the work zone are electrically isolated and protected by a method approved in qualified safety review; no electrical work beyond the approved scope, and no fixture removal without a licensed electrician. If isolation cannot be confirmed, or water reaches a fixture or electrical box, stop and escalate. Pending qualified review. (source: spec DW-02.SAF "de-energize/protect fixtures as needed", DW-02.HAZ "electrical fixtures, water exposure"; 31 section 10)

> HOLD (C-DW02-05) - before "Misting Protocol" below and every later step that scrapes, mixes, sands or sprays: respiratory protection, other PPE and the dust-control plan must be decided by a qualified safety professional; none is selected here and none is stocked. Until that decision exists these steps stay on hold (31 section 8.4). The containment envelope and the HEPA-connected sander are engineering controls; they do not replace the reviewer's decision and do not clear suspect material. Pending qualified review. (source: spec DW-02.TLS "PPE/respiratory equipment per plan"; original intro "hazardous dust protocol"; risk-triage playbook "do not invent respirator selection, fit-test clearance"; 31 section 10)

- [ ] **Misting Protocol:** Fill a clean garden pump sprayer with warm water mixed with 2 tablespoons of liquid dish soap (helps break surface tension). Lightly mist a 5x5 foot test section. *Do not over-saturate; excess water will degrade the underlying drywall core paper.*

> FLAG: UNSOURCED - verify against manufacturer instructions. "2 tablespoons of liquid dish soap" in the step above has no product-label source; any wetting agent and its mixing come only from the approved product label and SDS (29 section 8.2 control 8). The step text is unchanged. (source: 31 section 10)

- [ ] **Soak Window:** Allow the water to absorb into the acoustic texture for 15 minutes.

> FLAG: UNSOURCED - verify against manufacturer instructions. The "15 minutes" soak time in the step above has no source. The step text is unchanged. (source: 31 section 10)

- [ ] **Slicing Scraping:** Use a 10-inch or 12-inch floor scraper or specialty ceiling blade mounted on an extension pole. Hold the blade at a shallow 15-degree angle. Fluidly slice away the wet popcorn slurry, allowing it to drop onto the plastic. Keep the blade flat to avoid gouging the paper facing.

### From "12. Step-by-step procedure / 🩹 Phase 3: Structural Re-Taping & Structural Repairs"

> FLAG (C-DW02-07): the heading above says "Structural Re-Taping & Structural Repairs", but structural repair is outside this SOP (section 2, Do not perform). Under this draft the steps below are limited to drywall tape and fastener defects, pending review; the agreement disclaims "structural ceiling joist cracks", and no price line or change order covers repairs. The heading is kept verbatim. (source: 31 section 10; 02 C-DW02-07)

- [ ] **Exposing Defects:** Meticulously inspect the newly bared ceiling drywall. Locate split joint tapes, loose rusted nails, or structural framing sagging.

> HOLD (C-DW02-07) - before "Fastener Tightening" below: if the inspection above finds structural framing sagging or framing movement, STOP - do not fasten, tape or skim over it; photograph it, record it (spec JOB-004) and escalate for supervisor or structural engineer review. A loose or "bouncy" area that may be framing movement is treated the same way until it is reviewed. Repairs beyond the approved scope need an approved change order before work proceeds (spec FIN-008). Pending qualified review. (source: 02 C-DW02-07; 31 section 10; spec START-011)

- [ ] **Fastener Tightening:** Drive new 1-1/4 inch drywall screws into any loose or bouncy ceiling joist sectors. Punch down any popping old nails.
- [ ] **Seam Re-Tape:** Strip away any peeling old paper tape. Apply fresh fiberglass mesh tape over cracked seams and apply a structural coat of setting compound.

### From "12. Step-by-step procedure / 🍳 Phase 4: Skim Coating to Level 5 Finish"

> FLAG (C-DW02-13, X-26): TIER-DEPENDENT STEPS - owner to confirm. Pricing Tier 1 includes a "single coat skim" and Tier 2 "two to three" passes, while the steps below apply two passes to every ceiling. "Level 5" has no shared definition; the finish target comes from the approved estimate (spec DW-02.INT "finish target"; DW-02.QAC "smooth/texture finish meets target"). "This eliminates any minor structural waves in the ceiling joists." is an outcome statement, not a structural assessment. Steps unchanged. (source: 31 section 10; 02 C-DW02-13, X-26)

- [ ] **First Skim Pass:** Mix lightweight joint compound slightly thin (pancake batter consistency). Use an 18-inch or 24-inch skimming blade or a large trowel to pull a uniform layer across the entire ceiling plane.
- [ ] **Drying & Ridge Scraping:** Allow 12–24 hours to dry. Use a wide taping knife held at a 45-degree angle to scrape down all tracking lines and ridges.
- [ ] **Second Skim Pass:** Apply a second, ultra-thin coat of compound perpendicular (90 degrees opposite) to the direction of the first pass. This eliminates any minor structural waves in the ceiling joists.

### From "12. Step-by-step procedure / 🌬️ Phase 5: Sanding & Artisanal Texture Spraying (Optional)"

- [ ] **Dustless Sanding:** Connect a specialized drywall pole-sander to a HEPA dust-extraction vacuum. Sand the entire ceiling plane with 150-grit or 220-grit mesh paper until completely flat.
- [ ] **The Level 5 Choice:** If the client ordered a smooth modern finish, check with light, wipe dust, and apply primer.
- [ ] **Texture Spray Application:** If matching a wall profile (e.g., Orange Peel/Knockdown), fill a mechanical compressor hopper gun with texture compound. Adjust air pressure to match the speckle size exactly. Spray in consistent overlapping circular sweeps.

> FLAG (C-DW02-15): the step above sprays an Orange Peel or Knockdown texture on the ceiling, chosen to match "a wall profile"; texturing the walls themselves and Skip-Trowel have no step (section 2, Out of scope). "match the speckle size exactly" is not an acceptance criterion: the check is "smooth/texture finish meets target" against the finish target in the approved estimate (spec DW-02.QAC). The compressor and hopper gun are set up only per their manufacturers' instructions; no pressure is set here. The step text is unchanged. (source: 02 C-DW02-15; spec DW-02.QAC)

- [ ] **Knockdown Execution:** For knockdown textures, wait 10–15 minutes for the sprayed droplets to partially harden, then gently glide a wide rubber wipe blade flat across the peaks to flatten them uniformly.

> FLAG: UNSOURCED - verify against manufacturer instructions. The "10–15 minutes" wait in the step above has no source; the texture product's own instructions govern. The step text is unchanged. (source: 31 section 10)

> HOLD (C-DW02-09): the procedure above ends at texture; no step removes the containment, cleans up, handles the debris, unseals the vents or restores the HVAC. The job is not complete until the closeout items in sections 14 to 16 and 18 are done or an exception is recorded (spec QA-002, APXA-005). The closeout items are PROPOSED, pending review. (source: 02 C-DW02-09; 31 section 10)

## 4. Quality checks

### From "13. Quality checkpoints"

A worker cannot mark the job complete without answering these checks or recording an exception (source: spec QA-001). Photos cannot prove hidden conditions: do not infer hazardous-material clearance, structural adequacy or electrical safety from an image (source: quality-assistant playbook).

| Check (spec DW-02.QAC) | How it is verified (pending review) | Evidence | Inspector |
|---|---|---|---|
| Approved texture removed/matched | Texture removed from the whole approved area; where texture is sprayed, compared with the finish target in the approved estimate. "exactly" and "perfectly" are not acceptance criteria (C-DW02-15) | After photos per room or area (spec QA-003) | Worker self-check; whether a supervisor inspects is Q-31-15 |
| Substrate not damaged beyond repair scope | Gouges, paper-facing damage and concealed defects found after scraping are recorded; repairs beyond the approved scope only by change order (spec FIN-008; C-DW02-07) | Photos of each repaired area (04 DW-02 completion evidence, PROPOSED) | Worker; supervisor for anything structural |
| Smooth/texture finish meets target | Smooth path: the original "check with light" before priming; texture path: compared with the target. The finish level is the one in the approved estimate; "Level 5" has no shared definition yet (X-26), and the number of skim passes is tier-dependent (C-DW02-13) | Finish photos taken at the light check (04 DW-02, PROPOSED) | Worker; whether a supervisor inspects is Q-31-15 |
| Containment cleanup documented | Containment removed and the area cleaned; vents unsealed and the HVAC restored as altered within scope (spec QA-002, APXA-005; C-DW02-09) | Cleanup photos (spec QA-002 "Cleanup photos may be required for dusty/dirty services") | Worker |

## 5. Cleanup and waste handling

### From "14. Cleanup"

- Containment removal sequence and HEPA cleanup method: TBD - pending qualified safety review (source: 02 C-DW02-09; spec QA-002).
- Clean the area; remove waste and protection; account for tools and materials; restore utilities or components altered within scope: unseal the vents and restore the HVAC altered in "HVAC Isolation" (source: spec APXA-005; C-DW02-09). Who restores the HVAC and when, between phases or at the end, is pending owner, attorney and safety review (C-DW02-V01).
- Cleanup photos may be required for dusty work (source: spec QA-002); see section 16.
  - Evidence: photo
- The agreement's "Final Walkthrough" clause makes final payment due before the containment is removed; completion includes containment removal (spec QA-002 "Completion includes cleanup, debris/waste handling and removal of protection/containment as appropriate."), and the clause is under attorney review (see the agreement review notes).

### From "15. Waste handling"

TBD — requires review by safety-liability-manager and a qualified person; owner to approve.

- Waste from the steps: scraped texture slurry, used plastic sheeting and tape, collected sanding dust, compound and texture residues and empty containers (source: original steps in section 12; spec QA-002 "debris/waste handling"; DW-02.MAT "disposal bags").
- Containers, destination and who pays: owner decision with the local rules of the actual municipality (source: 31 section 3.1, waste row; 29 Q-29-10). The pricing file calls the work "disposal intensive" but prices no disposal (28 section 8).
- Suspect or positive material is not bagged, moved or removed by HandyHub; disposal after a positive result is part of the open abatement and permit question (source: section 2, Do not perform; spec START-011; 04 DW-02 permit/license flags).

## 6. Final checks, completion photos and walkthrough

### From "16. Photo requirements (before / during / after)"

- Before: arrival and existing-condition photos; start is blocked until they are captured or an authorized reason is recorded (source: spec START-008). Include the ceiling texture before any wetting, existing cracks (the agreement's "Pre-existing Cracks" clause depends on this evidence), fixtures, vents and the HVAC state (source: 04 DW-02 completion evidence, PROPOSED; X-02; spec BRF-012).
  - Evidence: photo, note
- During: containment in place; concealed conditions found after scraping, recorded with photos and severity (source: spec APXA-004; JOB-004); repaired areas (source: 04 DW-02 completion evidence, PROPOSED).
  - Evidence: note
- After: photos mapped to rooms or areas (source: spec QA-003): the finished ceiling, containment removed and the area cleaned (source: spec QA-002), vents unsealed.
  - Evidence: photo
- The hazardous-material result is a document record, not a photo; a photo of the texture never establishes clearance (source: quality-assistant playbook "Do not infer hidden fasteners, structural adequacy, hazardous-material clearance or electrical safety from an image.").
  - Evidence: photo, note
- Privacy: internal-only by default; avoid people, documents and valuables not needed for the work (source: spec REC-002; 31 section 3.5 rule 7).

### From "17. Customer communication"

- Arrival and completion updates use approved templates; a blocked job, including a hazardous-material hold, uses only the approved "work blocked" message, with no incident details or access codes by text or email (source: spec NTF-007, COM-002).
- Do not tell the customer whether the ceiling contains asbestos or lead, and make no health, air-quality or safety statement; refer questions to the owner (source: C-DW02-10; 31 section 3.5 rule 5; section 2, Do not perform item 8).
- HVAC: tell the customer when the HVAC is switched off and when it is restored, within the signed consent and in approved wording (source: agreement "HVAC Shutdown Consent"; C-DW02-V01).
- Walkthrough: record the outcome as accepted, accepted with punch items, unavailable or disputed (source: spec QA-004).
  - Evidence: note
- Care and handoff notes come only from approved product data (source: spec QA-008; quality-assistant playbook "Prepare handoff instructions from approved product data").
- Do not promise a "flawless" finish, a perfect texture match, crack-free results or a warranty (source: section 2, Do not perform item 8; C-DW02-15).
- Explain the invoice and payment next step without unauthorized promises (source: spec APXA-006); the agreement's payment timing is under attorney review (see the agreement review notes).

### From "18. Completion criteria"

Done means all of the following, recorded in the job (source: spec QA-001 to QA-004; DW-02.QAC; APXA-005 to APXA-007):

- Every section 13 check answered, or an exception recorded (QA-001).
  - Evidence: note
- After photos mapped to rooms or areas (QA-003).
  - Evidence: photo
- Containment removed and cleanup done, with containment cleanup documented (QA-002; DW-02.QAC "containment cleanup documented").
  - Evidence: note
- Waste handled by the approved method (section 15).
- Vents unsealed and the HVAC restored as altered within scope (APXA-005; C-DW02-09).
- Tools and materials accounted for (APXA-005, APXA-007).
- Walkthrough outcome recorded, with punch items (QA-004).
  - Evidence: note
- Unresolved issues, incidents and change requests submitted before the job is closed (APXA-007).
- Final completion is a human sign-off; the quality review only recommends readiness (source: quality-assistant playbook "Recommend readiness for human sign-off; do not set final completion").
  - Evidence: note

## Stop-work triggers, escalation and incidents (service-specific)

### From "10. Stop-work conditions"

The general stop-work rule is [[FACT-SVC-STOP-WORK-RULE]]. Service-specific triggers:

Service-specific stop triggers and holds (all pending qualified review; release roles per 31 section 8.3):

- Card guidance, verbatim: "do not disturb suspect hazardous material without required evaluation/testing/authorization; isolate area; control dust; de-energize/protect fixtures as needed; height controls" (source: spec DW-02.SAF).
- HOLD C-DW02-03, screening before the first step: build year unknown = HOLD; untested texture = HOLD at any property age until a qualified reviewer sets the screening rule (04 DW-02 prerequisites, PROPOSED); painted texture in a pre-1978 or unknown-age home = HOLD for EPA RRP review. The original "1980" stop stays in force until a qualified reviewer replaces it. Release: an accredited asbestos inspector or an EPA RRP-certified renovator, as the case requires, with the owner.
- HOLD C-DW02-02, positive or inconclusive result = BLOCKED: release only on documented clearance from a qualified asbestos professional accepted by the owner; no HandyHub sampling; never resume because the material was encapsulated in place (related C-DW02-01; the agreement's resumption clause is under attorney review).
  - Evidence: note
- HOLD C-DW02-04, fixtures: no wetting until the ceiling fixtures and circuits in the work zone are isolated and protected by an approved method; if isolation cannot be confirmed, or water reaches a fixture or electrical box, stop. Release: qualified safety professional; licensed electrician for any fixture removal.
- HOLD C-DW02-05, dust and respiratory protection: the scraping, mixing, sanding and spraying steps stay on hold until the qualified safety professional's respiratory and dust-control decision exists; a hold caused by a missing policy cannot be released by override (31 section 8.4).
- HOLD X-12, access: steps that need ladders, platforms or staging stay on hold until the height and access policy exists (31 section 8.4).
- STOP C-DW02-07, structure: structural framing sagging or framing movement found after scraping = STOP, photograph, record (spec JOB-004), supervisor or engineer review; no fastening, taping or skimming over it.
  - Evidence: note
- HOLD C-DW02-V01, HVAC: the HVAC state must match the signed consent at each phase change, and any exception is recorded; heat or cold for occupants and workers while the HVAC is off is a stop trigger under the "unsafe heat or cold" line of the block above.
  - Evidence: note
- Suspect hazardous material, a structural concern and unapproved electrical scope are critical holds that no role can override; they clear only with a recorded qualified assessment (31 section 8.3).
  - Evidence: note

### From "19. Escalation"

General path: [[FACT-SVC-ESCALATION-PATH]].

Service roles for DW-02 (contacts and escalation order are owner decisions, Q-31-05):

- Suspect asbestos, test results and sampling questions: accredited asbestos inspector (C-DW02-02, C-DW02-03).
- Painted texture in an older or unknown-age home: EPA RRP-certified renovator (C-DW02-03).
- Ceiling fixtures and circuits: licensed electrician (C-DW02-04).
- Sagging framing or framing movement: supervisor, then structural engineer (C-DW02-07).
- Dust, respiratory protection, access equipment, and heat or cold while the HVAC is off: qualified safety professional (C-DW02-05, X-12, C-DW02-V01).
- HVAC consent scope, testing and resumption terms: owner, with the attorney (C-DW02-V01; agreement review notes).

### From "20. Incident reporting"

General path: [[FACT-SVC-INCIDENT-REPORTING]].

- For this service, report at least: suspected exposure to texture dust or debris before a hazardous-material disposition was recorded, water reaching a fixture or an electrical shock, a fall from access equipment, a slip on wet sheeting, a containment failure, and compressor or hopper-gun failure (source: spec JOB-008 "suspected hazardous-material exposure", "tool/equipment failure"; DW-02.HAZ).

## Spanish translation status (section 22)

| Field | Value |
|---|---|
| Spanish version | Not started |
| Source English version | None; no approved English version exists |
| Translator (role) | `<owner decision>`; an AI draft is allowed only when marked `Draft - unreviewed` (spec COM-006) |
| Bilingual reviewer (role) | `<owner decision: qualified bilingual reviewer>` (Q-31-02) |
| Safety glossary version | None exists yet (GAP; spec HND-006) |
| Last review | None |
| Notes | No Spanish text exists for this service (02 G-012). This SOP contains no Arabic text; the Arabic heading is in the inventory file. |

## Open questions in the source SOP

- **Q-31-07** (owner; HUMAN REVIEW: EPA RRP-certified renovator, accredited asbestos inspector): which property-age thresholds trigger lead and asbestos screening for DW-02, what replaces the unsourced "1980" threshold, and does HandyHub hold or plan EPA RRP certification?
- **Q-30-18** (owner; HUMAN REVIEW: accredited asbestos inspector, EPA RRP-certified renovator, attorney): who collects samples of suspect texture, which lab, what record releases work, and where is lead-safe work information acknowledged?
- **Q-31-01** (owner): who are the competent reviewers for this SOP (qualified safety professional, asbestos inspector, RRP renovator, licensed electrician, structural engineer), and how is their competence evidenced?
- **Q-31-05** (owner): emergency and escalation contacts and escalation order for a two-person team.
- **Q-31-09** (owner; HUMAN REVIEW: qualified safety professional): height and access policy for hand work at the ceiling and for high ceilings.
- **Q-31-10** (owner; HUMAN REVIEW: qualified mold assessor): company definition of mold growth and the stop rule, for moisture or mold uncovered after scraping.
- **Q-31-11** (owner; HUMAN REVIEW: qualified safety professional): emergency kit contents and the SDS register owner.
- **Q-31-15** (owner): do the finish and texture checks need a supervisor rather than the worker's self-check?
- **Q-31-16** (owner; HUMAN REVIEW: attorney): who approves replacement wording for the promissory intro line?
- **Q-31-02** (owner): who is the qualified bilingual reviewer for the Spanish version?
- **02 C-DW02-V01** (owner; HUMAN REVIEW: attorney, qualified safety reviewer): should the HVAC stay off for the whole job, which needs revised consent, or be restored between scraping and sanding as the consent implies? Who restores it, when, and for how long may it stay off in an occupied home?
- **02 C-DW02-14** (owner): who moves furniture, the client or the crew, and at what price?
- **02 C-DW02-13** (owner): Tier 1 with one skim pass or two?
- **04 DW-02 card, exclusions** (owner): is wall texture matching, including Skip-Trowel, part of DW-02?
- **04 DW-02 card, permit/license flags** (HUMAN REVIEW: accredited asbestos inspector, attorney, applicable Kentucky and Indiana environmental agencies): abatement, notification and disposal requirements after a positive result, decided per state and municipality.
