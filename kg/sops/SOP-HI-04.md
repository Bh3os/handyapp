---
id: SOP-HI-04
type: sop
title: "SOP HI-04: Professional TV Wall Mounting & Wire Hiding"
status: active
area: field
links:
  part_of: ["[[SVC-HI-04]]", "[[S07]]"]
  decided_by: ["[[OWN-DEC-108]]", "[[OWN-DEC-109]]", "[[OWN-DEC-17]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]", "[[RULE-HUMAN-REVIEW]]", "[[RULE-NO-INVENTED-FACTS]]", "[[FACT-SVC-STOP-WORK-RULE]]"]
  uses: ["[[FACT-INVENTORY-HI-04]]", "[[FACT-SVC-PHOTO-MINIMUM]]", "[[FACT-SVC-ESCALATION-PATH]]", "[[FACT-SVC-INCIDENT-REPORTING]]"]
source: "vault Standard Of Operations/sop-tv-mounting.md; OWN-DEC-108"
---
Worker checklist for [[SVC-HI-04]] (Professional TV Wall Mounting & Wire Hiding). Status: active for the job checklist under [[OWN-DEC-108]], pending competent review for production use ([[OWN-DEC-17]]). The vault file is a draft (`status: draft-not-field-approved`, `owner_approved: false`).

Source file: `Standard Of Operations/sop-tv-mounting.md`. Each group below names the source heading its steps come from, and every step keeps the vault wording (link targets removed). The original procedure is section 12; the other sections were added in the vault on 2026-10-03 from the spec and the SOP standard, pending review. HOLD, GATE and FLAG lines are review controls added on 2026-10-03, pending qualified review: a HOLD placed before a step must be cleared before that step starts. An "Evidence" line lists the photo, measurement or note that the step's own wording asks for; a step without one names none.

Required steps cannot be skipped ([[OWN-DEC-108]]); the completion sequence is [[OWN-DEC-109]] and the minimum photo rule is [[FACT-SVC-PHOTO-MINIMUM]]. Tools, materials and PPE: [[FACT-INVENTORY-HI-04]]. Safety gates: [[RULE-SAFETY-GATES]].

## 1. Site preparation and property protection

### From "5. Customer and property preparation"

PROPOSED for owner approval; customer-facing wording goes through 30 and 32.
- The TV, the mount (where the customer supplies it) and their model and weight documents are on site (source: 04 HI-04 "customer preparation requirements"; spec HI-04.INT).
- The mounting height and location are decided and the outlet location is known (source: 04 HI-04; spec HI-04.INT "desired height", "outlet/low-voltage situation").
- Furniture is cleared from the work area; children and pets are kept away from the work area and the lift (source: 04 HI-04; spec CX-005; X-11).
- Option B: the customer supplies functional HDMI cables of sufficient length (source: agreement "Hardware Sufficiency" clause, itself under attorney review).
- Every job re-confirms access, occupants, pets, parking, hazards and work-area conditions (source: spec CX-005).

## 2. Setup and required measurements/checks

### From "3. Preconditions"

- This SOP is not active: no job uses it until competent review and owner activation (source: owner facts 2026-10-02; 31 section 2.1).
- An approved estimate version exists for the job; Option B is performed only when it is an itemized line of that version (source: spec CX-003, EST-005; agreement "Component Clause").
- Intake recorded: TV size, weight and model; mount model; wall and substrate; stud layout; desired height; cable plan; outlet and low-voltage situation (source: spec HI-04.INT).
  - Evidence: note
- Customer-supplied TV and mount: visible condition, model and quantity recorded before installation; a missing or rejected item blocks the affected task (source: spec START-009, JOB-004; 29 section 9.1, PROPOSED).
  - Evidence: note
- TV and mount ratings checked against the manufacturer documentation before any drilling (source: spec HI-04.SAF "verify mount/TV ratings"; section 12 hold, C-HI04-01).
- The wall is drywall over wood studs; any other substrate stops the job for an on-site assessment (source: original Option A heading; 02 C-HI04-07).
- A second person is scheduled when the lift needs one; the threshold is TBD by the owner and the qualified safety reviewer (source: spec HI-04.SAF "two-person lift when needed", spec HI-04.TLS "lift help"; 02 C-HI04-01).
- Option B: the low-voltage permission status for the municipality is recorded before start; unknown does not mean that no permit is needed (source: spec HI-04.MAT "if permitted", START-010; 04 HI-04 permit and license flags; handyhub-risk-triage playbook "unknown applicability must not default to no permit").
  - Evidence: note
- Property-age screening before cutting older wall finishes is not part of the HI-04 intake (02 G-049); until it exists, suspected hazardous material means stop (source: spec START-011; Q-31-07).
- Ladder work only under an approved height and access policy, which does not exist yet (source: 02 G-005; X-12).
- Before leaving: confirm the correct job, customer, address and time; read the latest changes; review scope and exclusions; review hazards and safety; load critical tools, equipment and materials; check customer-supplied items; confirm required documents and approvals (source: spec APXA-001).
- Before starting: complete the required safety, PPE and site checks; confirm materials and models; acknowledge the SOP and hazards; start only when Ready or an authorized exception is documented (source: spec APXA-003, START-004).
  - Evidence: note

### From "11. Setup"

- On arrival: confirm the address, work area and contact; identify pets and occupants; inspect the actual site against the briefing; capture the required existing-condition photos; protect the work area; identify utilities and emergency constraints relevant to the task (source: spec APXA-002).
  - Evidence: photo
- Confirm that the site matches the briefing, or record the differences; material differences trigger Risk Triage or supervisor review (source: spec START-007).
  - Evidence: note
- Existing-condition photos of the wall area and of the customer's TV and mount, with the START-009 record (source: spec START-008, START-009).
  - Evidence: photo, note
- Protect the floor and furnishings below the work area, for example with a drop cloth (source: spec HI-04.HAZ "wall damage"; spec APXA-002 "protect work area"; 29 section 7.3).
- Keep children and pets out of the work area and the lift path (source: X-11; spec CX-005).
- Ladder set-up only under an approved height and access policy: TBD (source: 02 G-005; X-12).
- Safety, PPE and site checks complete and the SOP hazards acknowledged before starting (source: spec APXA-003, START-004).
  - Evidence: note

## 3. Service-specific work steps

### From "12. Step-by-step procedure" (introduction)

*Original procedure, verbatim and in its original order. HOLD and FLAG lines are added drafts pending qualified review (31 section 10). A hold placed before a step must be satisfied before that step starts; a hold or flag placed after a step limits or flags "the step above" (36 D-36-17).*

### From "12. Step-by-step procedure / 🚨 Problem Option A: Mounting into Standard Wood Framing Studs"

- [ ] **Center Locating:** Run a deep-scanning stud finder to locate both edges of the wood stud. Mark the exact center column line with a pencil.

> HOLD (C-HI04-01): before "Pilot Hole Boring" below, record the TV and mount model, size, weight and rated capacity from the manufacturer documentation and compare them; STOP and escalate if the TV exceeds the mount rating or if the wall, substrate or fasteners are not what the mount instructions require. Release: section 10. Pending qualified review. (source: spec HI-04.SAF "verify mount/TV ratings; use structural attachment per instructions"; spec START-009)

> HOLD (C-HI04-V01): before any hole is bored in "Pilot Hole Boring" below, the customer confirms the marked mounting height and position; record a photo and the acknowledgement. Release: section 10. Pending owner review. (source: spec HI-04.INT "desired height"; 02 C-HI04-V01)

> HOLD (C-HI04-09): before any hole is bored in "Pilot Hole Boring" below, check the marked drilling locations for hidden electrical, plumbing and gas services with the stocked scanner used per its manufacturer instructions, and record the result. Whether the stocked scanner detects wiring or pipes is not stated (section 7); where its manufacturer instructions do not cover them, a scan that finds nothing does not clear the risk and counts as uncertain. If anything is uncertain, STOP and escalate. Release: section 10. Pending qualified review. (source: spec HI-04.HAZ "drilling into hidden utilities"; spec HI-04.SAF "stop on uncertain substrate/utilities"; spec START-011; inventory file; 02 C-HI04-02; owner facts 2026-10-02 "Unknown is not safe")

- [ ] **Pilot Hole Boring:** Use a bubble level to align the metal TV wall bracket template flat against the wall. Bore 2.5-inch deep pilot holes directly into the center of the studs using a wood drill bit.

> FLAG: UNSOURCED - verify against manufacturer instructions. "Bore 2.5-inch deep pilot holes" in the step above is not taken from a mount or fastener instruction; those instructions govern hole depth and bit size. The step stays unchanged until a qualified reviewer replaces it. (source: 31 section 10; spec section 17 "Service-card defaults never override ... manufacturer instruction")

- [ ] **Lag Bolt Driving:** Secure the bracket frame tightly using heavy-duty lag bolts driven in with an impact socket wrench. Verify absolute plumbness.

> FLAG (C-HI04-09): "Verify absolute plumbness" in the step above is not the card's "level" check (spec HI-04.QAC); fastening and tightening follow the mount manufacturer's instructions (spec HI-04.SAF "use structural attachment per instructions"). The post-mount checks are in section 13. Pending owner and quality review.

> HOLD (C-HI04-01): the procedure above ends at the wall bracket; no step covers attaching the TV, lifting it or hanging it. Do not lift or hang the TV under this SOP until the owner confirms the hang is in scope and a reviewer writes that step from the mount manufacturer's instructions; no step is invented here. Any hang step must include the card's "two-person lift when needed". Release: section 10. Pending qualified review. (source: spec HI-04.SAF; agreement "Component Clause"; 31 section 10)

### From "12. Step-by-step procedure / 🚨 Problem Option B: In-Wall Low-Voltage Cable Hiding"

- [ ] **Cutout Mapping:** Trace the outline of a plastic low-voltage entry box directly below the TV bracket and another box 12 inches above the floor level.

> HOLD (C-HI04-02): before "Drywall Cutout" below, run a hidden-service check of both traced openings with the stocked scanner per its manufacturer instructions, and record the result; any uncertainty = STOP and escalate. Where those instructions do not cover wiring or pipes, a scan that finds nothing does not clear the risk and counts as uncertain (section 7). Release: section 10. Pending qualified review. (source: 02 C-HI04-02; spec HI-04.SAF "stop on uncertain substrate/utilities"; spec START-011; owner facts 2026-10-02 "Unknown is not safe")

- [ ] **Drywall Cutout:** Use a drywall hand saw to carefully cut out both rectangles, ensuring no stud interference.
- [ ] **Conduit Fish Tape Run:** Drop a flexible fiberglass fish tape down through the top wall cavity cutout until it exits the bottom opening. Secure HDMI and media cables to the tape and pull them cleanly up behind the drywall.

> HOLD (C-HI04-08): during the step above, if the fish tape meets blocking, insulation or any pipe or vent, STOP - do not bore or cut; record the condition (JOB-004) and escalate. Release: section 10. Pending qualified and building-official review. (source: 02 C-HI04-08; 31 section 10)

> HOLD (C-HI04-06): the step above routes low-voltage HDMI and media cables only; never route a power cord or line-voltage wiring inside the wall - refer it to a licensed electrician. Release: section 10. Pending licensed-electrician review. (source: spec HI-04.SAF "do not perform unlicensed line-voltage work"; spec HI-04.MAT)

- [ ] **Faceplate Installation:** Secure brush-style wall plates over both openings for a clean finish.

## 4. Quality checks

### From "13. Quality checkpoints"

| Check | Source | Evidence | Inspector |
|---|---|---|---|
| Secure mount, per the mount manufacturer's instructions | spec HI-04.QAC "secure mount"; C-HI04-01 | Photo of the bracket fasteners before anything hides them; a photo is evidence, not proof of hidden fastening (handyhub-quality-assistant playbook) | TBD - self-check or supervisor (Q-31-15) |
| Correct hardware: fasteners and mount as the instructions specify | spec HI-04.QAC "correct hardware" | Mount model and fasteners used, recorded | TBD (Q-31-15) |
| Level (the original "Verify absolute plumbness" stays in section 12 and is flagged) | spec HI-04.QAC "level" | Check result recorded | TBD (Q-31-15) |
| Articulation clearance for articulating mounts | spec HI-04.QAC "articulation clearance"; C-HI04-09 | Check result recorded; no articulating-mount step exists yet | TBD (Q-31-15) |
| Cables managed within the approved scope; low-voltage cables only | spec HI-04.QAC "cables managed within approved scope"; spec HI-04.SAF | Photo of both faceplates (Option B) | TBD (Q-31-15) |
| TV powers and functions, only if the customer authorizes a test | spec HI-04.QAC "TV powers/functions if customer authorizes test" | Test result, or "not authorized", recorded | TBD (Q-31-15) |

- The job cannot be marked complete until each required check is answered or an exception is recorded (source: spec QA-001; AT-039).
  - Evidence: note
- A failed check becomes a punch item or an escalation; a worker's self-check does not replace a required supervisor inspection (source: handyhub-quality-assistant playbook).

## 5. Cleanup and waste handling

### From "14. Cleanup"

- Clean the area, remove protection, account for tools and materials, and restore components altered within scope (source: spec APXA-005, QA-002).
- Remove drilling and cutout dust; take cleanup photos where they are required for dusty work (source: spec QA-002).
  - Evidence: photo
- Record what happens to leftover parts, packaging and old hardware of customer-supplied products (source: 29 section 9.1).
  - Evidence: note

### From "15. Waste handling"

TBD — requires review by safety-liability-manager and a qualified person; owner to approve.
- Waste streams to classify: drywall pieces and dust from the Option B cutouts, packaging and unused hardware; destination and who pays are owner decisions (source: original "Drywall Cutout" step; 31 section 3.1; 02 G-078).
- Suspect hazardous-material waste is not handled without an approved policy (source: 31 section 3.1; spec START-011).

## 6. Final checks, completion photos and walkthrough

### From "16. Photo requirements (before / during / after)"

- Before: existing condition of the wall area; the customer's TV and mount with model information (source: spec START-008, START-009, APXA-002).
- During: the marked mounting height and position confirmed by the customer (section 12 hold, C-HI04-V01); the bracket fasteners before anything hides them (source: 04 HI-04 "completion evidence", PROPOSED); any concealed condition or obstruction found (source: spec JOB-004).
- After: the finished mount and, for Option B, both faceplates, with each photo mapped to its work area or task (source: spec QA-003).
  - Evidence: photo
- Photos are internal-only by default and avoid people, documents and valuables not needed for the work (source: spec REC-002; 31 section 3.5 rule 7).
- The required photo set, and whether Start Job is blocked without it: TBD - owner (source: spec START-008).

### From "17. Customer communication"

- Arrival and completion updates use approved templates only; until approved they are drafts (source: 31 section 3.1).
- Before drilling, confirm the marked height and position with the customer (section 12 hold, C-HI04-V01).
- Run a TV function test only with the customer's authorization, and record the result (source: spec HI-04.QAC).
  - Evidence: note
- Walkthrough: record accepted, accepted with punch items, unavailable or disputed (source: spec QA-004, APXA-006).
  - Evidence: note
- Blocked work: use only the approved "work blocked" message; never send incident details or access codes by text or email (source: spec NTF-007, COM-002).
- A request for line-voltage work, for example an outlet or power routed in the wall, is not performed; it is referred to a licensed electrician. Customer wording: TBD - licensed electrician and attorney (source: 02 C-HI04-06).
- Do not repeat the agreement's "Structural Guarantee", the main plan's "absolute structural safety" or "completely wireless appearance", or any load, safety or code-compliance promise (source: C-HI04-01, C-HI04-06; Do-not-perform entry 8).
- Explain the invoice and payment next step without unauthorized promises (source: spec APXA-006).

### From "18. Completion criteria"

- Every section 13 check is answered with evidence, or an exception is recorded (source: spec QA-001, AT-039).
  - Evidence: note
- After photos are captured and mapped to the work (source: spec QA-003).
  - Evidence: photo
- Cleanup is done, protection removed, and tools and materials accounted for (source: spec QA-002, APXA-005).
- The property is left secured (source: 31 section 3.1).
- The walkthrough outcome is recorded (source: spec QA-004, APXA-006).
  - Evidence: note
- No hold from sections 10 and 12 is open, and unresolved issues, incidents and change requests are submitted before the job closes (source: spec APXA-007, JOB-012).

## Stop-work triggers, escalation and incidents (service-specific)

### From "10. Stop-work conditions"

The general stop-work rule is [[FACT-SVC-STOP-WORK-RULE]]. Service-specific triggers:

HI-04 stop triggers (spec HI-04.SAF first, then the register holds; all pending qualified review):
- The mount or TV ratings are not verified, or the TV exceeds the mount rating (source: spec HI-04.SAF "verify mount/TV ratings"; C-HI04-01).
- The attachment cannot follow the mount instructions (source: spec HI-04.SAF "use structural attachment per instructions").
- The work would need line-voltage electrical work (source: spec HI-04.SAF "do not perform unlicensed line-voltage work"; C-HI04-06).
- The lift needs two people and only one is available (source: spec HI-04.SAF "two-person lift when needed").
- The substrate or hidden utilities are uncertain (source: spec HI-04.SAF "stop on uncertain substrate/utilities"; C-HI04-02).
- The fish tape meets blocking, insulation or any pipe or vent: do not bore or cut (source: 31 section 10; C-HI04-08).
- The wall is masonry, plaster or lath, or metal stud, or the mount is at a fireplace: not covered; stop and request an on-site assessment (source: 02 C-HI04-07).
- The customer-supplied TV, mount or cables are missing, damaged or without model information (source: spec START-009; spec JOB-004 "missing customer-supplied item").
- Option B: the low-voltage permission status is not recorded (source: spec START-010; spec HI-04.MAT "if permitted").
- Every hold is released only by a named role with recorded evidence (source: 31 section 8.3 rule 1; risk-triage playbook L17). Critical holds clear only with a recorded qualified assessment and are never overridden (source: 31 section 8.3 rule 2); which holds below are critical is pending (Q-27-15).
  - Evidence: note

Service holds (inserted in section 12). Release roles are PROPOSED from the reviewers named in the 02 register rows; all are TBD - requires qualified safety reviewer review:

| Hold | Where in section 12 | Release role and evidence (PROPOSED) |
|---|---|---|
| C-HI04-01: TV and mount ratings | Before "Pilot Hole Boring" | Qualified safety professional; TV and mount model, weight and rated capacity recorded from the manufacturer documentation |
| C-HI04-V01: customer confirms the marked height and position | Before "Pilot Hole Boring" | The customer's acknowledgement and photo recorded; release role TBD - owner |
| C-HI04-09: hidden services before drilling | Before "Pilot Hole Boring" | Qualified safety professional; scan result recorded, and a recorded assessment wherever the result is uncertain |
| C-HI04-01: no TV lift or hang under this SOP | After "Lag Bolt Driving" | Owner scope decision, then a hang step written by a qualified reviewer from the mount manufacturer's instructions |
| C-HI04-02: hidden services before the cutouts | Before "Drywall Cutout" | Qualified safety professional; scan result recorded, and a recorded assessment wherever the result is uncertain |
| C-HI04-08: obstruction in the cable path | After "Conduit Fish Tape Run" | Qualified safety professional, with the local building official before any boring or cutting through blocking is considered |
| C-HI04-06: low-voltage cables only | After "Conduit Fish Tape Run" | Not released under this SOP; line-voltage work is referred to a licensed electrician |

### From "19. Escalation"

General path: [[FACT-SVC-ESCALATION-PATH]].

HI-04 routes (contacts are owner decisions, Q-31-05):
- Line-voltage request or exposed wiring: stop that task; the office refers it to a licensed electrician (C-HI04-06).
- Blocking, fire blocking, a pipe or a vent in the cable path: stop; the owner obtains review by the local building official before any boring or cutting is considered (C-HI04-08).
- Fireplace, masonry or another uncovered substrate: stop; on-site assessment; licensed gas professional where a gas appliance is present (C-HI04-07).

### From "20. Incident reporting"

General path: [[FACT-SVC-INCIDENT-REPORTING]].

- HI-04 examples: a TV or mount that drops or falls, damage to the wall or to the customer's property, contact with hidden wiring or pipes, and a ladder incident (source: spec JOB-008; spec HI-04.HAZ).

## Spanish translation status (section 22)

| Field | Value |
|---|---|
| Spanish version | Not started |
| Source English version | None yet; no `sop_version` is assigned (31 section 3.2, Tier B) |
| Translator (role) | `<owner decision>`; an AI draft is allowed only when marked `Draft - unreviewed` (COM-006) |
| Bilingual reviewer (role) | `<owner decision: qualified bilingual reviewer>` (Q-31-02) |
| Safety glossary version | None exists yet (GAP; HND-006) |
| Last review | Not reviewed |
| Notes | English only; this SOP contains no Arabic or Spanish text |

## Open questions in the source SOP

- **Q-31-08** (owner and relevant reviewers): is fireplace mounting for HI-04 offered at all, or referred out?
- C-HI04-01 condition in 02 (owner): does HI-04 include attaching and hanging the TV, or only mounting the bracket (agreement "Component Clause")? If it does, a reviewer writes the hang step from the mount manufacturer's instructions, with the two-person threshold set by the owner and the qualified safety professional; if not, it becomes a customer-visible exclusion.
- C-HI04-06 in 02 (licensed electrician and attorney): which customer requests count as line-voltage work, and how is any exclusion worded?
- Related: **Q-31-05** (owner) emergency and escalation contacts for sections 19 and 20; **Q-31-07** (owner, EPA RRP-certified renovator, accredited asbestos inspector) property-age thresholds for lead and asbestos screening before cutouts; **Q-31-09** (owner and qualified safety professional) the height and access policy; **Q-31-15** (owner) which QA checks need a supervisor rather than a self-check.
