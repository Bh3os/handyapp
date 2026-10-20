---
id: SOP-HI-08
type: sop
title: "SOP HI-08: Closet & Shelving System Installation"
status: active
area: field
links:
  part_of: ["[[SVC-HI-08]]", "[[S07]]"]
  decided_by: ["[[OWN-DEC-108]]", "[[OWN-DEC-109]]", "[[OWN-DEC-17]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]", "[[RULE-HUMAN-REVIEW]]", "[[RULE-NO-INVENTED-FACTS]]", "[[FACT-SVC-STOP-WORK-RULE]]"]
  uses: ["[[FACT-INVENTORY-HI-08]]", "[[FACT-SVC-PHOTO-MINIMUM]]", "[[FACT-SVC-ESCALATION-PATH]]", "[[FACT-SVC-INCIDENT-REPORTING]]"]
source: "vault Standard Of Operations/sop-closet-shelving.md; OWN-DEC-108"
---
Worker checklist for [[SVC-HI-08]] (Closet & Shelving System Installation). Status: active for the job checklist under [[OWN-DEC-108]], pending competent review for production use ([[OWN-DEC-17]]). The vault file is a draft (`status: draft-not-field-approved`, `owner_approved: false`).

Source file: `Standard Of Operations/sop-closet-shelving.md`. Each group below names the source heading its steps come from, and every step keeps the vault wording (link targets removed). The original procedure is section 12; the other sections were added in the vault on 2026-10-03 from the spec and the SOP standard, pending review. HOLD, GATE and FLAG lines are review controls added on 2026-10-03, pending qualified review: a HOLD placed before a step must be cleared before that step starts. An "Evidence" line lists the photo, measurement or note that the step's own wording asks for; a step without one names none.

Required steps cannot be skipped ([[OWN-DEC-108]]); the completion sequence is [[OWN-DEC-109]] and the minimum photo rule is [[FACT-SVC-PHOTO-MINIMUM]]. Tools, materials and PPE: [[FACT-INVENTORY-HI-08]]. Safety gates: [[RULE-SAFETY-GATES]].

## 1. Site preparation and property protection

### From "5. Customer and property preparation"

- The customer clears all clothes, boxes and personal items out of the closet before the technician arrives (source: agreement "Closet Clearance" clause); the appointment confirmation and reminder carry this as the preparation checklist (source: spec NTF-004, NTF-005).
- The customer-supplied kit is on site, complete, with its manufacturer instructions (source: spec START-009; 29 section 9.1).
- Obstructions such as closet lights or outlets are identified at intake; HandyHub does not move them (source: spec HI-08.INT "obstructions"; Do not perform 10).
- Every job re-confirms access, occupants, pets, parking, hazards and work-area conditions (source: spec CX-005).

## 2. Setup and required measurements/checks

### From "3. Preconditions"

- The approved estimate version states the system model and who supplies it, the layout and dimensions, the desired heights, the wall or substrate, obstructions and the customer's expected load (source: spec HI-08.INT "wall/substrate, dimensions/layout, load expectation, system model, obstructions, desired heights"; CX-003).
- The substrate is drywall over a hollow cavity (Option A) or wood framing studs (Option B); any other substrate is a stop condition (section 10) (source: 31 section 10 HI-08).
- The system and anchor manufacturer's instructions, rated load and spacing are available for the job. If they are unknown, fastening does not start (source: spec HI-08.SAF "confirm load path/fastener rating ... follow manufacturer spacing"; C-HI08-03).
- The customer-supplied kit is on site; its visible condition, model and quantity are recorded, and missing or defective parts are recorded as an unexpected condition (source: spec START-009, JOB-004).
  - Evidence: note
- Critical tools are loaded or an exception is recorded, including a scanner able to locate studs and utilities (source: spec START-005; HI-08.SAF; inventory file, proposed additions).
  - Evidence: note
- The closet is cleared by the customer (source: agreement "Closet Clearance" clause). If it is not, record the access issue with evidence and escalate; the worker does not quote or apply any fee (source: spec SCH-008, JOB-004, JOB-005).
- The approximate build year is recorded ("unknown" is a valid value) so that older painted or textured walls are screened before drilling; the property-age thresholds are an open question (source: spec BRF-003 "approximate age if known"; 04 HI-08 hazards; Q-31-07).
  - Evidence: note
- Occupants, children and pets are identified and kept out of the work area (source: spec APXA-002 "identify pets/occupants", CX-005; X-11).
- Work at height happens only under an approved height and access policy, which does not exist yet (source: 02 G-005; X-12).
- Start only when Ready or an authorized exception is documented (source: spec APXA-003).
  - Evidence: note

### From "11. Setup"

- On arrival: confirm the address, work area and contact; identify pets and occupants; inspect the site against the briefing; capture the required existing-condition photos; protect the work area; identify the utilities and emergency constraints relevant to the task (source: spec APXA-002).
  - Evidence: photo
- Before starting: complete the required safety, PPE and site checks; confirm materials and models against the approved scope; acknowledge the SOP and hazards; start only when Ready or an authorized exception is documented (source: spec APXA-003).
  - Evidence: note
- Confirm the layout, dimensions and desired heights against the approved scope before "Laser Level Baseline"; a changed layout needs a change order (source: spec HI-08.INT; JOB-005; FIN-008).
- Check the customer-supplied kit against its manufacturer instructions and the START-009 record (source: spec START-009; 29 section 9.1).
  - Evidence: note
- Record the system and anchor manufacturer's rated load and spacing and the customer's expected load in the job record before any drilling (source: spec HI-08.SAF; C-HI08-03).
  - Evidence: note

## 3. Service-specific work steps

### From "12. Step-by-step procedure" (introduction)

Original procedure text is kept verbatim and in its original order. Lines that start with HOLD or FLAG are added draft controls pending qualified review (source: 31 section 10 HI-08). A HOLD placed before a step must be cleared before that step starts; a HOLD or FLAG placed after a step limits or flags the step above it.

### From "12. Step-by-step procedure / 🚨 Problem Option A: Securing Wire Track Systems into Drywall Hollows"

- [ ] **Laser Level Baseline:** Project a horizontal green laser line along the target back wall at the exact height required for the main support track.

> HOLD (C-HI08-02): before "Top Track Drilling" below, scan the drilling and fastening path for wiring, pipes, gas lines and other hidden services with a scanner able to locate them, used per its manufacturer instructions, and record the result. The listed magnetic stud finder is not shown to locate wiring or pipes (section 7; C-HI08-10); a scan with a device whose ability to detect them is not established does not clear the path and counts as inconclusive. If a service is detected, the result is inconclusive or the cavity cannot be cleared, STOP and escalate (section 19). Release: section 10. Pending qualified review. (source: spec HI-08.HAZ "drilling hidden utilities"; HI-08.SAF "locate studs/utilities"; owner facts 2026-10-02 "Unknown is not safe")

> HOLD (C-HI08-03): before "Top Track Drilling" below, confirm that the wall is drywall over a hollow cavity; metal studs, plaster, masonry and tile are not covered: STOP and escalate. Confirm the toggle anchor and track system manufacturer's rated load and spacing and record them with the customer's expected load; if either is unknown, or the expected load exceeds the rating, STOP. Release: section 10. Pending qualified review. (source: spec HI-08.SAF "confirm load path/fastener rating ... follow manufacturer spacing; do not overload wall/substrate"; 31 section 10 HI-08)

- [ ] **Top Track Drilling:** Align the metal top track, mark the pre-bored holes, and drill 1/2-inch holes through the drywall.
- [ ] **Toggle Bolt Fastening:** Push heavy-duty metal toggle anchors through the track holes, thread them into the drywall cavity until the spring-wings flip open, and drive the bolts tight using an impact driver.

> HOLD (C-HI08-03): the step above is limited by the anchor manufacturer's instructions: tighten per the anchor manufacturer instructions and at the spacing recorded for the job - pending review. "drive the bolts tight using an impact driver" sets no torque and does not override those instructions. (source: 02 C-HI08-03; spec section 17 "Service-card defaults never override a site-specific hazard, manufacturer instruction")

- [ ] **Standard Hanging:** Hang the vertical shelf standards into the top track, verify perfect square alignment, and clip wire shelf brackets into place.

### From "12. Step-by-step procedure / 🚨 Problem Option B: Anchor Locking into Natural Wood Framing Studs"

- [ ] **Stud Mapping:** Locate all vertical wood framing studs using a deep-scanning sensor; trace their center columns along the wall line.

> FLAG (C-HI08-10): the step above names a "deep-scanning sensor", while the inventory lists a "Magnetic Stud Finder with Center Target Laser"; which scanner is standard is an open question. Mapping studs is not the hidden-service check, which follows below. If the framing found is not wood, for example metal studs, STOP: Option B does not cover it. (source: inventory file; 31 section 10 HI-08)

> HOLD (C-HI08-02): before "Direct Wood Driving" below, scan the fastening path along each traced stud center for wiring, pipes, gas lines and other hidden services with a scanner able to locate them, used per its manufacturer instructions, and record the result. The listed magnetic stud finder is not shown to locate wiring or pipes (section 7; C-HI08-10); a scan with a device whose ability to detect them is not established does not clear the path and counts as inconclusive. If a service is detected, the result is inconclusive or the path cannot be cleared, STOP and escalate (section 19). Release: section 10. Pending qualified review. (source: spec HI-08.HAZ "drilling hidden utilities"; HI-08.SAF "locate studs/utilities"; owner facts 2026-10-02 "Unknown is not safe")

> HOLD (C-HI08-03): before "Direct Wood Driving" below, confirm the track system and fastener manufacturer's rated load and spacing and record them with the customer's expected load; if either is unknown, or the expected load exceeds the rating, STOP. Release: section 10. Pending qualified review. (source: spec HI-08.SAF "confirm load path/fastener rating ... follow manufacturer spacing; do not overload wall/substrate")

- [ ] **Direct Wood Driving:** Screw the main support tracks and vertical shelf standard lines directly into the centers of the wood studs using 2.5-inch structural wood screws without plastic anchors. This guarantees maximum load limits for heavy clothing arrays or garage storage boxes.

> FLAG: outcome claim - owner and attorney review (C-HI08-01). The sentence "This guarantees maximum load limits for heavy clothing arrays or garage storage boxes." in the step above is kept verbatim; it is not an approved claim and sets no load limit. Load limits come only from the manufacturer's ratings recorded for the job (spec HI-08.SAF "do not overload wall/substrate"); never repeat the claim to a customer (Do not perform 8). (source: 31 section 10 HI-08; 02 C-HI08-01)

## 4. Quality checks

### From "13. Quality checkpoints"

| Checkpoint | Source | Evidence | Inspector |
|---|---|---|---|
| Level and plumb: tracks, standards and shelves. "Standard Hanging" checks square alignment; pass criteria come from the system manufacturer, and no tolerance is set here | spec HI-08.QAC "level/plumb"; section 12 | Level-check photo (section 16) | TBD - self or supervisor (Q-31-15) |
| Secure fasteners: every anchor and screw installed and tightened per the manufacturer's instructions at the recorded spacing | spec HI-08.QAC "secure fasteners", HI-08.SAF | Fastener-location photos before components cover them | TBD - self or supervisor (Q-31-15) |
| Intended components installed: all components of the approved system per the kit instructions; missing or leftover parts recorded | spec HI-08.QAC "intended components installed"; START-009 | Installed-components photo; START-009 record | TBD - self or supervisor (Q-31-15) |
| Basic load/fit check within the manufacturer's rating; no load test or certification beyond it (C-HI08-01); method TBD by the qualified reviewer | spec HI-08.QAC "basic load/fit check", HI-08.SAF | Recorded rating, spacing and expected load | TBD - self or supervisor (Q-31-15) |
| No sharp projections | spec HI-08.QAC "no sharp projections" | Visual check recorded | TBD - self or supervisor (Q-31-15) |
| Area clean | spec HI-08.QAC "area clean"; QA-002 | After or cleanup photo | TBD - self or supervisor (Q-31-15) |

- The worker cannot mark the job complete without answering these checks or recording an exception (source: spec QA-001).
  - Evidence: note
- Photos cannot prove hidden fastener or load adequacy; a missing mounting verification needs inspection, not approval (source: quality-assistant playbook; 04 HI-08 completion evidence).

## 5. Cleanup and waste handling

### From "14. Cleanup"

- Vacuum drilling dust and remove debris and packaging from the work area (source: spec HI-08.QAC "area clean", QA-002).
- Remove protection, account for tools and materials, and restore components altered within scope (source: spec APXA-005).
- Return unused materials and record leftover customer-supplied parts (source: spec APXA-007; 29 section 9.1).
  - Evidence: note

### From "15. Waste handling"

- Expected waste from the current steps: drilling dust, kit packaging, leftover hardware and, if cutting is authorized, wire or track offcuts (source: section 12; inventory file).
- Destination, who removes the waste and any charge: TBD — owner decision; no waste policy exists (source: 31 section 3.1; 02 G-078).
- Removal or disposal of existing shelving is not covered (section 2).

## 6. Final checks, completion photos and walkthrough

### From "16. Photo requirements (before / during / after)"

- Before: arrival and existing-condition photos of the wall and closet, and the customer-supplied kit's condition and model (source: spec START-008, START-009, APXA-002).
  - Evidence: photo
- During: fastener locations before shelves or components cover them (source: 04 HI-08 completion evidence, PROPOSED; quality-assistant playbook).
- After: the level check, the installed components and the cleaned area, each tagged to its work area or task (source: spec QA-003; 04 HI-08 completion evidence).
- Photos are internal-only by default and avoid people, documents and valuables not needed for the work (source: spec REC-002; 31 section 3.5 rule 7).

### From "17. Customer communication"

- Arrival and completion updates are drafts; the worker or admin controls the send (source: spec UXE-008).
- Record the walkthrough outcome: accepted, accepted with punch items, unavailable or disputed (source: spec QA-004).
  - Evidence: note
- Care notes: give the customer the system and anchor manufacturer's rated load limits and care instructions from approved product data (source: spec QA-008; 02 C-HI08-01).
- Describe the method actually used, Option A (toggle anchors in drywall hollows) or Option B (screws into wood studs); the website copy that mixes them is flagged (source: C-HI08-11).
- Never state or "certify" a load capacity, and never repeat the "guarantee" or "certification" wording of the SOP, pricing file or main plan (source: Do not perform 8; C-HI08-01).
- Blocked work: tell the customer only what the approved "work blocked" message says (source: spec NTF-007, COM-002).
- Price or scope changes, including any fee, are not agreed on site without a recorded change order (source: spec JOB-005, FIN-008).

### From "18. Completion criteria"

- All section 13 checks answered or an exception recorded (source: spec QA-001).
  - Evidence: note
- After photos captured and mapped to tasks (source: spec QA-003).
  - Evidence: photo
- Cleanup done, protection removed, tools and materials accounted for (source: spec QA-002, APXA-005).
- Manufacturer rating, spacing and the customer's expected load recorded; care notes with the rated limits given (source: spec HI-08.SAF, QA-008).
  - Evidence: note
- Customer-supplied kit leftovers and any missing parts recorded (source: spec START-009; 29 section 9.1).
  - Evidence: note
- Walkthrough outcome recorded (source: spec QA-004).
  - Evidence: note
- Unresolved issues, incidents and change follow-ups submitted before the job is closed (source: spec APXA-007).
- The worker recommends completion for human sign-off; a customer signature does not clear an unresolved safety hold (source: quality-assistant playbook).
  - Evidence: note

## Stop-work triggers, escalation and incidents (service-specific)

### From "10. Stop-work conditions"

The general stop-work rule is [[FACT-SVC-STOP-WORK-RULE]]. Service-specific triggers:

**HI-08 stop triggers (draft, pending qualified review).** In addition, stop the affected work and escalate (section 19) when:
- a utility or other hidden service is detected in the drilling or fastening path, the scan is inconclusive, or the cavity cannot be cleared (source: spec HI-08.HAZ; HI-08.SAF "locate studs/utilities"; C-HI08-02);
- the system or anchor manufacturer's rated load or spacing is unknown, or the customer's expected load exceeds it (source: spec HI-08.SAF "confirm load path/fastener rating ... follow manufacturer spacing; do not overload wall/substrate"; C-HI08-03);
- the substrate is not drywall over a hollow cavity (Option A) or wood framing studs (Option B), for example metal studs, plaster, masonry or tile (source: 31 section 10 HI-08);
- closet lights, outlets or other electrical items are in the way of the layout (source: Do not perform 10; spec START-011);
- suspect hazardous material is found, or the build-year or surface screening is not cleared, before drilling older painted or textured walls (source: spec START-011; 04 HI-08 hazards);
- the customer-supplied kit is missing parts, damaged or not the approved model (source: spec START-009, JOB-004);
- the work needs a ladder or step stool and no approved height and access policy exists (source: spec HI-08.HAZ; 02 G-005; X-12);
- occupants or pets cannot be kept clear of the work area (source: X-11).

Release role and release evidence for each trigger: `<reviewer decision: release role and evidence>` (31 section 8.3). Which of these triggers are critical holds that no role can override is pending (Q-31-18).

### From "19. Escalation"

General path: [[FACT-SVC-ESCALATION-PATH]].

- HI-08 roles and contacts: `<owner decision: escalation order and contacts>` (Q-31-05).

### From "20. Incident reporting"

General path: [[FACT-SVC-INCIDENT-REPORTING]].

## Spanish translation status (section 22)

| Field | Value |
|---|---|
| Spanish version | Not started |
| Source English version | None: no `sop_version` assigned yet |
| Translator (role) | `<owner decision>`; an AI draft is allowed only when marked `Draft - unreviewed` (COM-006) |
| Bilingual reviewer (role) | `<owner decision: qualified bilingual reviewer>` (Q-31-02) |
| Safety glossary version | None exists yet (GAP; HND-006) |
| Last review | None |
| Notes | No Arabic or Spanish text in this file |

## Open questions in the source SOP

- From the register, C-HI08-05 (owner): are layout design and wooden or custom shelving launch scope? If yes, SOP sections and inventory items are drafted for review; if no, they are marked not offered.
- From the register, C-HI08-03 (owner; qualified safety professional; experienced lead installer): adopt a decision rule between Option A and Option B (studs where available; anchors only within the manufacturer's rating and spacing)?
- From the register, C-HI08-10 (owner; lead installer): which scanner is standard for stud and utility detection?
- Q-31-01 (owner): who are the competent reviewers for this SOP, and how is their competence evidenced?
- Q-31-07 (owner; EPA RRP-certified renovator; accredited asbestos inspector): which property-age thresholds trigger lead and asbestos screening before drilling older painted or textured walls?
- Q-31-09 (owner; qualified safety professional): the height and access policy that ladder or step-stool work depends on (X-12).
- Q-31-11 (owner; qualified safety professional): emergency kit contents (X-10).
- Q-31-05 (owner): emergency and escalation contacts and their order for sections 19 and 20.
- Q-31-15 (owner): which section 13 checks need a supervisor rather than a self-check.
- Q-31-16 (owner; attorney): who approves replacement wording for the flagged "guarantees" sentence in a revised SOP version.
- Q-31-18 (qualified safety professional; owner): which HI-08 holds are critical holds under 31 section 8.4.
- Q-31-02 (owner): who is the qualified bilingual reviewer for the Spanish version.
- Q-36-08 (31 owner; owner; qualified safety professional): accept the placement of precondition holds before the step they gate, as used in section 12 of this file.
