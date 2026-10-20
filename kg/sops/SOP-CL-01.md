---
id: SOP-CL-01
type: sop
title: "SOP CL-01: Routine House Cleaning"
status: active
area: field
links:
  part_of: ["[[SVC-CL-01]]", "[[S07]]"]
  decided_by: ["[[OWN-DEC-108]]", "[[OWN-DEC-109]]", "[[OWN-DEC-17]]", "[[OWN-DEC-149]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]", "[[RULE-HUMAN-REVIEW]]", "[[RULE-NO-INVENTED-FACTS]]", "[[FACT-SVC-STOP-WORK-RULE]]"]
  uses: ["[[FACT-INVENTORY-CL-01]]", "[[FACT-SVC-PHOTO-MINIMUM]]", "[[FACT-SVC-ESCALATION-PATH]]", "[[FACT-SVC-INCIDENT-REPORTING]]"]
source: "vault Standard Of Operations/sop Routine Cleaning Checklist.md; OWN-DEC-108"
---
Worker checklist for [[SVC-CL-01]] (Routine House Cleaning). Status: active for the job checklist under [[OWN-DEC-108]], pending competent review for production use ([[OWN-DEC-17]]). The vault file is a draft (`status: draft-not-field-approved`, `owner_approved: false`).

Source file: `Standard Of Operations/sop Routine Cleaning Checklist.md`. Each group below names the source heading its steps come from, and every step keeps the vault wording (link targets removed). The original procedure is section 12; the other sections were added in the vault on 2026-10-03 from the spec and the SOP standard, pending review. HOLD, GATE and FLAG lines are review controls added on 2026-10-03, pending qualified review: a HOLD placed before a step must be cleared before that step starts. An "Evidence" line lists the photo, measurement or note that the step's own wording asks for; a step without one names none.

Required steps cannot be skipped ([[OWN-DEC-108]]); the completion sequence is [[OWN-DEC-109]] and the minimum photo rule is [[FACT-SVC-PHOTO-MINIMUM]]. Tools, materials and PPE: [[FACT-INVENTORY-CL-01]]. Safety gates: [[RULE-SAFETY-GATES]].

## 1. Site preparation and property protection

### From "5. Customer and property preparation"

- The customer provides entry by key, lockbox code or in person, as the agreement records (source: agreement "Access" clause).
  - Evidence: note
- Every visit re-confirms access, occupants, pets, parking, hazards and work-area conditions (source: spec CX-005).
- PROPOSED for the preparation checklist (not yet in the agreement): pets secured or kept away from the rooms being cleaned; excluded rooms or items named; fragile or high-value items named or put away; product preferences and allergies, with consent before any fragranced product is used; priority areas; surfaces to be cleaned cleared of clutter, since the pricing file's clutter fee has no defined threshold (source: 04 CL-01 "customer preparation requirements"; spec CL-01.INT; X-11; C-CL01-05).
- HandyHub's own pre-start checks are never moved onto the customer (source: 30 section 4.1 clause 5).

## 2. Setup and required measurements/checks

### From "3. Preconditions"

*Dispatch and Start Job gates for this service (source: spec APXA-001, APXA-003; 31 section 3.1 row 3). Every item is pending review.*

- Intake complete: rooms, occupancy and pets, surfaces and materials, priority areas, excluded rooms or items, and product preferences or allergies if volunteered (source: spec CL-01.INT).
- An approved estimate version covers the rooms and tasks of the visit; start only when Ready or an authorized exception is documented (source: spec CX-003; APXA-003).
  - Evidence: note
- Every visit re-confirms access, occupants, pets, parking, hazards and work-area conditions, also for a repeat customer (source: spec CX-005).
- Access by key, lockbox code or in-person entry as recorded for the property. Codes are revealed only in the app's secured fields, and keys are custody items with an issue and return log; the key and code custody, return and rotation procedure is not yet written (source: agreement "Access" clause; 27 AUTH-009; spec COM-002; 02 G-065, G-115).
  - Evidence: note
- Every cleaning product is on an approved product list with a reviewed SDS; a chemical product without a reviewed SDS is not carried to the job. No product is approved yet: TBD - requires qualified safety reviewer review (source: 29 section 8.3 interim rule, PROPOSED; spec CL-01.SAF).
- A means to sign or control wet floors is loaded (source: spec CL-01.SAF "signage/control wet floors"); no wet-floor sign is stocked yet (inventory file, proposed additions).
- Customer-provided products, where a preference or allergy requires them: product and condition are recorded before use (source: spec START-009; 29 section 9.1).
  - Evidence: note
- Before this SOP can be activated, the named reviewers approve: the chemical, SDS and wet-floor controls (C-CL01-06); the sharps, biohazard and mold boundary (X-06); the fan and disposal holds (section 12); the arrangement for a cleaner working alone (02 G-065) (source: 31 section 10 CL-01; owner facts L20).

### From "11. Setup"

- Before leaving: confirm the job, customer, address and time; read the latest changes; verify access; review scope and exclusions; review hazards and safety; load critical tools and materials, including the means to sign wet floors; check customer-supplied items; confirm required documents and approvals (source: spec APXA-001).
- On arrival: confirm address, work area and contact; identify pets and occupants; inspect the actual site against the briefing; capture required existing-condition photos; protect the work area; identify utilities and emergency constraints relevant to the task (source: spec APXA-002).
  - Evidence: photo
- Entry: use the key, lockbox code or in-person entry recorded for the property; reveal codes only in the app; never write down, photograph or message a code (source: agreement "Access" clause; 27 AUTH-009; spec COM-002; Do not perform 7).
  - Evidence: note
- Ventilation adequate for the approved products, as their SDSs require: TBD — requires review by safety-liability-manager and a qualified person; owner to approve.
- Before starting: complete the required safety, PPE and site checks; acknowledge the SOP and hazards; start only when Ready or an authorized exception is documented (source: spec APXA-003; START-004).
  - Evidence: note
- The original "Phase 1: High-Level Dusting & Preparation" heading names preparation but holds only dusting tasks; setup is this section (source: 31 section 6.2 matrix, Setup partial).

## 3. Service-specific work steps

### From "12. Step-by-step procedure" (introduction)

*The original procedure lines below are unchanged and in their original order; the five original phase headings are demoted one level, text unchanged. Lines starting with "HOLD" or "FLAG" were added on 2026-10-03; they are pending review and never replace the step text.*

> HOLD (precondition; X-11; spec CL-01.SAF): before "Cobwebs" and every step below - occupants, children and pets are kept away from the rooms being worked, as confirmed on arrival (spec CX-005). An unsafe animal or an aggressive occupant or situation means stop, leave the area and escalate (section 19). Pending review.

### From "12. Step-by-step procedure / 🕒 Phase 1: High-Level Dusting & Preparation"

- [ ] **Cobwebs:** Scan with an extension duster along all ceiling corners, crown moldings, and upper door frames.

> HOLD (precondition; RISK; 31 section 10 CL-01): before "Ceiling Fans" - the fan is stopped and switched off before its blades are dusted. If it cannot be switched off, or its blades cannot be reached from the floor, do not dust it; record it and report it (section 17). No ladder or step stool unless the approved height and access policy allows it (section 2, Do not perform 10). Pending review.

- [ ] **Ceiling Fans:** Dust top and bottom of fan blades using a slip-on microfiber sleeve (no dust dropping on floors).
- [ ] **Light Fixtures:** Dust the exterior of hanging pendants and wall sconces; wipe bulb tops if cool.
- [ ] **Air Vents:** Dust the exterior slats of supply and return air vents.

### From "12. Step-by-step procedure / 🛋️ Phase 2: Bedrooms & Living Areas Detailing"

- [ ] **Horizontal Surfaces:** Dust nightstands, dressers, coffee tables, and desks; lift minor objects (remotes, books) to dust underneath—do not dust around them.
- [ ] **Electronics:** Dry-wipe TV screens with a clean anti-static microfiber cloth; dust the tops of soundbars and gaming consoles.
- [ ] **Decor:** Dust picture frames, mirrors, lampshades (using a lint roller if fabric), and decorative items.
- [ ] **Beds:** Strip blankets, pull sheets tight, tuck corners, fluff pillows, and lay the comforter/duvet perfectly flat without wrinkles.

> HOLD (precondition; C-CL01-06; spec CL-01.SAF): before "High-Touch Wiping" and every later step that uses a cleaning product ("Large Appliances", "Counters & Backsplash", "Sink Area", the Phase 4 steps and "Mopping") - use only products on the approved product list with a reviewed SDS, exactly as their labels direct, and never mix incompatible chemicals or mix or sequence products in a way the approved step and the SDSs do not allow ("never mix incompatible chemicals"; 31 section 3.3 entry 6). No product is approved and no SDS is reviewed yet, so a chemical product is not carried to the job until the qualified safety professional approves it (29 section 8.3 interim rule, PROPOSED). Ventilation as each SDS requires. Pending review.

- [ ] **High-Touch Wiping:** Wipe down all room light switches and main door handles with a disinfectant wipe.

### From "12. Step-by-step procedure / 🍳 Phase 3: Kitchen Surface Care"

- [ ] **Microwave:** Wipe down the rotating glass plate, roller ring, interior walls, ceiling, and exterior control pad.
- [ ] **Large Appliances:** Wipe down the front faces, handles, and touchscreens of the refrigerator, oven, and dishwasher using material-specific cleaner (e.g., stainless steel polish).
- [ ] **Stovetop:** Wipe down the stovetop surface, removing minor spills around burner caps.
- [ ] **Counters & Backsplash:** Clear counters, spray with multi-surface sanitizer, wipe completely, and wipe down the backsplash tiles.

> HOLD (precondition; RISK; 31 section 10 CL-01): before "Sink Area" - hands never go inside the garbage disposal, and the disposal is not run while the rim, drain basket or sink is cleaned (PROPOSED). Pending review.

- [ ] **Sink Area:** Scrub the sink basin, clear the drain basket, sanitize the garbage disposal rim, and polish the faucet fixture until streak-free.

### From "12. Step-by-step procedure / 🛁 Phase 4: Bathroom Sanitization"

> HOLD (precondition; C-CL01-06, X-06; spec CL-01.SAF): before "Toilet" and the other Phase 4 steps - if a biohazard (the agreement's "Exclusions" clause names feces), sharps or suspected mold growth is found, do not clean, disturb or handle it; stop and escalate ("stop and escalate on sharps/biohazard"). Where routine bathroom cleaning ends and the excluded biohazards and mold begin is undefined until the company mold and biohazard rule exists (X-06; Q-31-10); when in doubt, stop and escalate (owner facts 2026-10-02 "Unknown is not safe"). Pending review.

- [ ] **Toilet:** Scrub the interior bowl with a brush; wipe down the flush handle, toilet lid, seat (both sides), porcelain base, and behind the toilet tank.
- [ ] **Shower & Tub:** Wipe down shower walls, glass panels, and the bathtub rim to remove daily water spots.
- [ ] **Vanity:** Scrub the sink basin, wipe down the countertop, and polish the mirror with glass cleaner and a waffle-weave cloth.
- [ ] **Fixtures:** Wipe and polish all metal faucets, shower heads, and towel racks to remove water smudges.

> FLAG (C-CL01-V01): SCOPE CONFLICT - disinfection promised for showers/tubs/mirrors but not proceduralised. The main plan promises "Cleaning and disinfecting essential fixtures such as toilets, sinks, showers, tubs, and mirrors.", but the Phase 4 steps above wipe, scrub or polish and name no disinfectant, and the stocked bathroom disinfectant is designated only for sinks, counters and toilet seats (inventory file). Adding a reviewed disinfecting step with an approved product and its label directions, or narrowing the copy, is an owner decision. Until then, do not tell the customer that fixtures were disinfected or sanitized (section 17). Pending review.

### From "12. Step-by-step procedure / 🧹 Phase 5: Waste Management & Floor Care (Exit)"

> HOLD (precondition; C-CL01-06; spec CL-01.HAZ, CL-01.SAF): before "Trash Bins" and "Upholstery" - hidden sharps or biohazards can be in bins, bags and under cushions ("sharps/biohazard surprises"). Do not reach into bins or press trash down by hand, and look before reaching under cushions (PROPOSED; RISK). If sharps or a biohazard are seen or suspected, do not handle them; stop and escalate. Whether workers ever contain found sharps, and with what container and PPE, is for the qualified safety professional (inventory file, proposed additions). Pending review.

- [ ] **Trash Bins:** Gather trash from all rooms, tie bags, wipe down exterior bin lids if sticky, and place fresh liners.
- [ ] **Upholstery:** Vacuum the surfaces of fabric sofas, armchairs, and remove cushions to vacuum underneath if accessible.
- [ ] **Vacuuming:** Vacuum all carpets and rugs using overlapping straight lines; vacuum hard floors to remove loose crumbs and hair before mopping.

> HOLD (precondition; C-CL01-06; spec CL-01.SAF): before "Mopping" - place wet-floor signage or otherwise keep people and pets off the wet floor until it is dry ("signage/control wet floors"); the step's own "working backward out of each room" stays. No wet-floor sign is stocked yet (inventory file, proposed additions). If a wet floor cannot be signed or controlled, for example because occupants or pets cannot be kept away, do not mop that area; escalate. The bathroom floor cleaner is used only as an approved product with a reviewed SDS (chemical hold before "High-Touch Wiping"). Pending review.

- [ ] **Mopping:** Mop all hard floors with a damp microfiber mop, working backward out of each room (use disinfectant floor cleaner for bathrooms).
- [ ] **Final Look:** Stand at the doorway of each room to verify visual symmetry, straight lines, and zero missed spots.

> FLAG: outcome claim - owner and attorney review (31 section 10 CL-01). "zero missed spots" in the step above is the worker's inspection aim, not a promise to the customer, and it is not repeated in customer communication (section 17; 31 section 3.5 rule 5).

> HOLD (C-CL01-06; spec CL-01.QAC): the visual check in the step above does not cover the card's "no damage" and "rooms secured as found" checks; answer both in section 13 before the job is marked complete. Damage found or caused is reported as an incident (section 20). Pending review.

## 4. Quality checks

### From "13. Quality checkpoints"

*From spec CL-01.QAC. The worker cannot mark the job complete without answering the required checks or recording an exception (source: spec QA-001). Which checks need a second person rather than a self-check is open (Q-31-15).*

| Check | Source | Inspector | Evidence |
|---|---|---|---|
| Specified surfaces cleaned: the rooms and surfaces in the approved visit scope, with excluded rooms and items left untouched | spec CL-01.QAC; CL-01.INT | Worker; supervisor where policy requires (Q-31-15) | After photos mapped to rooms or areas (QA-003) |
| Floors complete | spec CL-01.QAC; steps "Vacuuming" and "Mopping" | Worker | After photos |
| Bathrooms and kitchen standard met: the Phase 3 and Phase 4 steps done; no disinfection result is claimed (C-CL01-V01) | spec CL-01.QAC | Worker | After photos |
| Trash handled | spec CL-01.QAC; step "Trash Bins" | Worker | Checklist answer |
| No damage | spec CL-01.QAC | Worker; damage found or caused is reported as an incident (section 20) | Checklist answer; internal photos of any damage |
| Rooms secured as found, including the entry used (lock, key or lockbox returned to its recorded state) | spec CL-01.QAC; agreement "Access" clause | Worker | Checklist answer; key return logged (27 AUTH-009) |
| Visual check from each doorway | step "Final Look" | Worker | Inspection aim only; "zero missed spots" is not a customer promise (FLAG in section 12) |

- A customer signature or acknowledgement does not clear an unresolved safety hold, and missing evidence is recorded as unknown, not as a pass (source: quality-assistant playbook "A signed customer form does not clear an unresolved safety hold." and "Missing photos are unknown evidence, not proof of defective work.").
  - Evidence: note

## 5. Cleanup and waste handling

### From "14. Cleanup"

*For a cleaning service, cleanup means the exit sequence and the crew's own equipment (source: 31 section 6.1).*

- Remove the wet-floor sign once the floor is dry; account for tools and materials; put back anything moved within scope (source: spec APXA-005; QA-002).
- Used cloths and mop pads: bagging and laundering method TBD — requires review by safety-liability-manager and a qualified person; owner to approve. Keeping toilet cloths apart is part of the open colour-system question (section 7).
- Return unused materials (source: spec APXA-007).
- Secure the property as found before leaving (section 13).

### From "15. Waste handling"

- Household trash ("Trash Bins"): the step ties the bags, but where they go (the customer's outdoor bin or removal by the crew) is not stated; TBD - owner decision (source: section 12; 31 section 3.1 row 15).
- Dirty mop water, chemical residues, used wipes and empty product containers: disposal per each product's SDS and the municipality's rules; no method is approved yet (source: 29 section 8.2 item 10; Q-29-10).
- Sharps and biohazards are not handled by the worker under this SOP: stop and escalate (section 10); their disposal method is decided by the reviewer and the local authority (source: spec CL-01.SAF; Q-29-10).

## 6. Final checks, completion photos and walkthrough

### From "16. Photo requirements (before / during / after)"

- Before: existing-condition photos where the briefing requires them, including damage found on arrival, which matters for the agreement's "Breakage" clause (source: spec APXA-002; START-008).
  - Evidence: photo
- During: unexpected conditions such as sharps, a biohazard, suspected mold or damage, recorded with photos and severity without touching the item (source: spec JOB-004; UXE-006).
  - Evidence: note
- After: photos mapped to rooms or areas (source: spec QA-003; 04 CL-01 "completion evidence").
  - Evidence: photo
- Privacy in an occupied home: every photo is internal-only by default; avoid people, documents, valuables and personal items not needed for the work; never photograph keys or access codes; marketing use needs separate consent (source: spec REC-002, REC-003; 31 section 3.5 rule 7; Do not perform 7).

### From "17. Customer communication"

- Arrival and completion updates are drafts; the worker or admin controls the send (source: spec UXE-008).
- Record the walkthrough outcome: accepted, accepted with punch items, unavailable or disputed; on unattended recurring visits "unavailable" is the expected outcome (source: spec QA-004; 04 CL-01 "completion evidence").
  - Evidence: note
- Report what was left undone and why, in approved wording: areas not reachable from the floor, fans that could not be switched off, heavy objects not moved, excluded biohazards or suspected mold, damage found (source: sections 10 and 12). Wording TBD - owner.
  - Evidence: note
- Requests for extra work, such as organizing clutter, appliance interiors or deep grease, are recorded as change requests; no price is agreed on site (source: spec JOB-005, FIN-008; C-CL01-05).
  - Evidence: note
- Blocked work: only the approved "work blocked" message; no incident details or access codes by text or email (source: spec NTF-007, COM-002).
- What not to say: that fixtures were disinfected or sanitized (C-CL01-V01); "zero missed spots" or any other outcome promise (31 section 10 CL-01); "Eco-Friendly" or other product claims (29 section 8.2 item 12); that the company is insured (C-CL01-02; 32 section 4.1 rule 5).

### From "18. Completion criteria"

- Required QA checks answered or an exception recorded (source: spec QA-001; section 13).
  - Evidence: note
- After photos mapped to rooms or areas (source: spec QA-003).
  - Evidence: photo
- Cleanup and waste handling done as approved (source: spec QA-002; sections 14 and 15).
- Tools and materials accounted for (source: spec APXA-005).
- Property secured as found, and the key or lockbox code returned to its recorded state (source: spec CL-01.QAC; 27 AUTH-009).
  - Evidence: note
- Open holds, items left undone, damage and punch items recorded; walkthrough outcome recorded (source: spec QA-004; APXA-006).
  - Evidence: note
- The job closes only when the required operational and financial steps are complete (source: spec APXA-007).

## Stop-work triggers, escalation and incidents (service-specific)

### From "10. Stop-work conditions"

The general stop-work rule is [[FACT-SVC-STOP-WORK-RULE]]. Service-specific triggers:

*Standard block copied verbatim from 31 SOP standard section 8.5 (PROPOSED wording; HUMAN REVIEW: qualified safety professional; attorney licensed in KY and/or IN for the "right to stop work" sentence; bilingual reviewer for Spanish).*

**Service stop triggers and holds (CL-01).** Card stop guidance (spec CL-01.SAF): "never mix incompatible chemicals; signage/control wet floors; stop and escalate on sharps/biohazard/unsafe animal/aggressive situation".

| Trigger or hold | Action | Cleared by (evidence) | Source |
|---|---|---|---|
| Product without a reviewed SDS, or a mix or sequence the SDSs do not allow | Do not use; escalate | Reviewed SDS and approved product | spec CL-01.SAF; 29 section 8.3; C-CL01-06 |
| A wet floor cannot be signed or controlled, for example because occupants or pets cannot be kept away | Do not mop that area; escalate | Signage or access control in place | spec CL-01.SAF; C-CL01-06 |
| Sharps or a biohazard seen or suspected, including in trash, under cushions or around the toilet | Stop; do not handle; escalate | Owner, with the qualified safety reviewer's approved method | spec CL-01.SAF; X-06 |
| Suspected mold growth | Stop; do not clean or disturb; escalate | Company mold rule (Q-31-10); qualified mold assessor | agreement "Exclusions" clause; X-06; 31 section 8.4 rule 2 |
| Unsafe animal | Stop; leave the area; escalate | Owner; the customer secures the animal | spec CL-01.SAF |
| Aggressive occupant or situation | Stop; leave; escalate; emergency services if anyone is in danger | Owner | spec CL-01.SAF; START-011 |
| Ceiling fan cannot be stopped and switched off | Do not dust the fan; report it | Fan off | 31 section 10 CL-01 (RISK) |
| Area not reachable from the floor | Do not use a ladder, step stool or furniture; leave and report | Approved height and access policy (Q-31-09) | 31 section 10 CL-01; 02 G-005 |
| Heavy object in the way | Do not lift; leave and report | Manual-handling rule | agreement "Exclusions" clause |
| Gas odor | Emergency (section 19, step 2) | Emergency services | spec START-011; 31 section 8.5 |

Critical holds cannot be overridden by any role; they clear only with a recorded qualified assessment (source: 31 section 8.3 rule 2). Under the PROPOSED classification rule of 31 section 8.4, the chemical compatibility and SDS hold behaves as a critical hold until the chemicals module is approved (rule 4), and suspected mold growth is treated as critical until the company mold definition exists (rule 2).

### From "19. Escalation"

General path: [[FACT-SVC-ESCALATION-PATH]].

*Standard block copied verbatim from 31 section 8.5 (PROPOSED wording; HUMAN REVIEW: qualified safety professional).*

**CL-01 escalation routes (owner decisions pending, Q-31-05):** sharps, a biohazard or suspected mold go to the owner, who decides with the qualified safety reviewer or a mold assessor (source: spec CL-01.SAF; X-06). Chemical exposure or splash: emergency response first, then the incident form (section 20); first-aid references only from the reviewed SDS (source: 29 section 8.2 item 7). An unsafe animal or an aggressive occupant: leave the area and escalate, and call emergency services if anyone is in danger (source: spec CL-01.SAF; BRF-013). A cleaner working alone: check-in and escalation arrangement TBD (source: 02 G-065). Contacts: `<owner decision: emergency contact>` and `<owner decision: escalation order>` (Q-31-05).

### From "20. Incident reporting"

General path: [[FACT-SVC-INCIDENT-REPORTING]].

*Standard block copied verbatim from 31 section 8.5 (PROPOSED wording). HUMAN REVIEW: attorney licensed in KY and/or IN for the fault and liability sentence; insurance broker for any insurer-notification step added later.*

- CL-01 examples to report: a slip or fall; a chemical splash or exposure; a cut or needle-stick from hidden sharps; an animal bite; breakage of the customer's property; an aggressive occupant (source: spec CL-01.HAZ, CL-01.SAF; JOB-008).

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

- Q-31-09 (owner; qualified safety professional): height and access policy - may cleaners ever use a step stool or ladder for CL-01, and what happens to areas out of reach from the floor?
- Q-31-10 (owner; qualified mold assessor): what is the company definition of mold growth versus cleanable mildew, and where does routine bathroom cleaning end and the excluded biohazard begin?
- C-CL01-V01 (owner): add a reviewed disinfecting step with an approved product, or narrow the main-plan copy?
- Q-31-11 (owner; qualified safety professional): emergency kit contents, SDS register owner, chemical storage and transport.
- Q-31-05 (owner): emergency and escalation contacts, escalation order and after-hours coverage, including a check-in for a cleaner working alone (02 G-065).
  > Governed now by [[OWN-DEC-149]]: no interval check-ins for lone work; the worker records only Arrived and Finished.
- Q-31-15 (owner): which checks ("no damage", "rooms secured as found") need a supervisor rather than the worker's self-check while there are two employees?
- Q-31-02 (owner): who is the qualified bilingual reviewer for the Spanish safety text?
- Q-29-10 (local authority; safety reviewer): disposal of mop water, chemical residues, sharps and biohazards in each service municipality.
- 02 G-065 (owner): the key and lockbox custody, return and rotation procedure, and the customer-preparation checklist (pets, valuables, excluded rooms, allergies and fragrance consent).
