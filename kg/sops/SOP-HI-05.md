---
id: SOP-HI-05
type: sop
title: "SOP HI-05: Door Hardware & Smart Lock Installation"
status: active
area: field
links:
  part_of: ["[[SVC-HI-05]]", "[[S07]]"]
  decided_by: ["[[OWN-DEC-108]]", "[[OWN-DEC-109]]", "[[OWN-DEC-17]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]", "[[RULE-HUMAN-REVIEW]]", "[[RULE-NO-INVENTED-FACTS]]", "[[FACT-SVC-STOP-WORK-RULE]]"]
  uses: ["[[FACT-INVENTORY-HI-05]]", "[[FACT-SVC-PHOTO-MINIMUM]]", "[[FACT-SVC-ESCALATION-PATH]]", "[[FACT-SVC-INCIDENT-REPORTING]]"]
source: "vault Standard Of Operations/sop-smart-locks.md; OWN-DEC-108"
---
Worker checklist for [[SVC-HI-05]] (Door Hardware & Smart Lock Installation). Status: active for the job checklist under [[OWN-DEC-108]], pending competent review for production use ([[OWN-DEC-17]]). The vault file is a draft (`status: draft-not-field-approved`, `owner_approved: false`).

Source file: `Standard Of Operations/sop-smart-locks.md`. Each group below names the source heading its steps come from, and every step keeps the vault wording (link targets removed). The original procedure is section 12; the other sections were added in the vault on 2026-10-03 from the spec and the SOP standard, pending review. HOLD, GATE and FLAG lines are review controls added on 2026-10-03, pending qualified review: a HOLD placed before a step must be cleared before that step starts. An "Evidence" line lists the photo, measurement or note that the step's own wording asks for; a step without one names none.

Required steps cannot be skipped ([[OWN-DEC-108]]); the completion sequence is [[OWN-DEC-109]] and the minimum photo rule is [[FACT-SVC-PHOTO-MINIMUM]]. Tools, materials and PPE: [[FACT-INVENTORY-HI-05]]. Safety gates: [[RULE-SAFETY-GATES]].

## 1. Site preparation and property protection

### From "5. Customer and property preparation"

PROPOSED from the intake fields; customer-facing wording goes through 30 and 32 (source: 04 HI-05 customer preparation requirements; spec HI-05.INT):
- the compatible lock is on site;
- the customer or an authorized representative is present with their own phone and account;
- a Wi-Fi bridge is available if the lock model needs one;
- all existing keys are available;
- the customer has decided what happens to the old hardware.

Every job re-confirms that access, occupants, pets, parking, hazards and work-area conditions are still current (source: spec CX-005).

## 2. Setup and required measurements/checks

### From "3. Preconditions"

- This SOP is a draft and is not active; no job is dispatched under it until the owner records approval after competent review (source: owner facts 2026-10-02; spec HND-004; 04 section 2.4).
  - Evidence: note
- Before leaving: confirm job, customer, address and time; review scope, exclusions, hazards and safety; load critical tools and materials; check customer-supplied items; confirm required documents and approvals (source: spec APXA-001).
- Intake complete: door material/thickness, existing bore/backset, lock model, handing, strike alignment, Wi-Fi/app needs, customer account/privacy (source: spec HI-05.INT).
- The lock supplier is recorded on the estimate (customer, HandyHub stock or job purchase; Q-29-14). A customer-supplied lock gets a record of visible condition, model and quantity before installation (source: spec START-009; 29 section 9.1).
  - Evidence: note
- For Option B, the customer or an authorized representative is present to create and own the app account and all codes; the absent-customer case (for example a remote rental host) is an OPEN QUESTION (source: 04 HI-05 prerequisites, PROPOSED; C-HI05-01).
- The requester's authority to change the locks is confirmed; how it is verified is an OPEN QUESTION for the attorney (source: 04 HI-05 prerequisites; 31 section 10).
- Permit, license and qualification flags: none is set for HI-05. Whether locksmith or security-hardware licensing applies in each Kentucky and Indiana municipality is an OPEN QUESTION, and unknown applicability does not default to "no permit". Start Job stays blocked where admin policy marks a requirement (source: spec START-010; 04 HI-05 permit/license flags; risk-triage playbook).
- A door suspected to be fire-rated or an egress door is not started without review (source: 31 section 10; OPEN QUESTION).
- Old-property screening for painted doors and frames (property age, older paint) is pending (source: 31 section 5.8; 04 HI-05 hazards). Until it is resolved, Do not perform entry 3 (section 2) applies before any chiseling, filing or boring of a painted door or frame in a home built before 1978 or of unknown build year; a customer statement does not clear it (source: owner facts 2026-10-02 "Unknown is not safe"; risk-triage playbook "A pre-1978 painted surface is not cleared by a customer saying it looks safe").
- Start only when the job shows Ready or an authorized exception is documented (source: spec APXA-003).
  - Evidence: note

### From "11. Setup"

- On arrival: confirm address, work area and contact; identify pets and occupants; inspect the actual site against the briefing; capture the required existing-condition photos; protect the work area (source: spec APXA-002).
  - Evidence: photo
- Before starting: complete the required safety, PPE and site checks; confirm materials and models; acknowledge the SOP and hazards; start only when Ready or an authorized exception is documented (source: spec APXA-003, START-004).
  - Evidence: note
- Customer-supplied lock: record visible condition, model and quantity (source: spec START-009).
  - Evidence: note
- Door and floor protection and staging details: TBD — requires review by safety-liability-manager and a qualified person; owner to approve.

## 3. Service-specific work steps

### From "12. Step-by-step procedure" (introduction)

*Original procedure text below is unchanged and in its original order. HOLD and FLAG lines are added review items pending qualified review; they never replace or reword a step (source: 31 section 9.2; 36 section 3.4).*

### From "12. Step-by-step procedure / 🚨 Problem Option A: Adjusting Misaligned Deadbolts & Strike Plates"

- [ ] **Drag Inspection:** Close the door and manually turn the lock thumb-turn. Identify if the deadbolt rubs against the top, bottom, or back of the strike plate cavity.
- [ ] **Chisel Recess Modification:** Unscrew the metal strike plate from the door frame. Use a sharp 1/2-inch wood chisel to chip away wood fibers to widen the cavity recess in the direction of the bolt drag.
- [ ] **Screw Reinforcement:** Reinstall the strike plate using heavy 3-inch wood screws driven deep into the structural jack studs (this stabilizes the loose frame and prevents future settling misalignment).

> FLAG (C-HI05-05): outcome claim in the step above - "this stabilizes the loose frame and prevents future settling misalignment" - is unverified and conflicts with the agreement's "Structural Frame Waiver". Do not repeat it to customers. Do not diagnose foundation settling; record visible frame movement (spec JOB-004) and escalate (section 10). Owner and attorney review. (source: 31 section 10)

> HOLD (C-HI05-02): before leaving after the steps above, check with the door closed that it latches and locks and that the deadbolt moves smoothly, including manual operation; do not leave the property unsecured - if the door cannot be locked, stop and escalate (section 19). Pending qualified review. (source: spec HI-05.SAF, HI-05.QAC; 31 section 10)

### From "12. Step-by-step procedure / 🚨 Problem Option B: Setting Up Smart Wi-Fi Keyless Access Locks"

> HOLD (C-HI05-02): before the old lock is removed and before the step below, confirm compatibility - door thickness, bore/backset, handing and lock model - against the lock manufacturer's instructions; on any mismatch, do not remove the old lock; stop and escalate. Pending qualified review. (source: spec HI-05.INT; 31 section 10)

> FLAG (C-HI05-07): no step covers removing the old lock or recording what happens to old keys and hardware; not covered - pending review (section 2).

- [ ] **Hardware Assembly:** Mount the smart lock exterior keypad and interior motorized deadbolt unit uniformly, ensuring the wires clear the latch spindle paths without pinching.
- [ ] **Motor Calibration:** Run the smart lock's automatic calibration loop. The lock will shoot the deadbolt out multiple times to confirm zero friction or electronic motor drag.
- [ ] **Network Pairing:** Pair the lock to the home Wi-Fi hub, configure temporary guest access pin codes, and test remote lock/unlock commands via the client's smartphone.

> HOLD (C-HI05-01): the step above is held (not performed as written) pending privacy owner and attorney review. Until then the credential rule applies (31 section 5.8, PROPOSED): the customer creates and owns the app account and enters the Wi-Fi password and all master and guest codes on their own device; the worker may point to the manufacturer's setup steps; codes and passwords are never recorded, photographed or sent. (source: spec HI-05.SAF, HI-05.QAC, COM-002; owner facts 2026-10-02)

> HOLD (C-HI05-02): before leaving, final function test with the door closed - key, thumb-turn, and keypad and app where in scope - including emergency and manual operation per the lock manufacturer; do not leave the property unsecured. If the lock fails, stop and escalate (section 19); the contingency is an OPEN QUESTION for the owner. An acknowledgment does not clear this hold. Pending qualified review. (source: spec HI-05.SAF, HI-05.QAC; 31 section 10)

## 4. Quality checks

### From "13. Quality checkpoints"

Observable checks from the spec card; the worker answers each check or records an exception (source: spec HI-05.QAC, QA-001). A worker's self-check does not replace a supervisor inspection where one is required (source: quality-assistant playbook).

| Check | Evidence | Source |
|---|---|---|
| Smooth latch and deadbolt operation (key, thumb-turn, and keypad and app where in scope) | Function-test record | Spec HI-05.QAC; 04 HI-05 completion evidence |
| Secure attachment of the hardware | After photos that show no codes or account screens | Spec HI-05.QAC, REC-002, COM-002 |
| Door closes and locks; emergency and manual operation verified per the lock manufacturer | Function-test record (hold in section 12) | Spec HI-05.QAC, HI-05.SAF |
| Customer controls codes and accounts | Customer confirmation; no code or password value in any record | Spec HI-05.QAC, COM-002; 27 AUTH-009 (PROPOSED) |
| Old keys and hardware disposition confirmed | Disposition record (customer keeps or disposed per policy - OPEN QUESTION, C-HI05-07) | Spec HI-05.QAC |

## 5. Cleanup and waste handling

### From "14. Cleanup"

- Clean the area, remove protection, account for tools and materials, and restore components altered within scope (source: spec APXA-005, QA-002).
- Wood chips and dust from chiseling: vacuum per the card's tool list; a vacuum is not yet in the inventory (C-HI05-10) (source: spec HI-05.TLS).
- Record what happens to packaging, leftover lock parts and old hardware (source: 29 section 9.1; spec HI-05.QAC).
  - Evidence: note

### From "15. Waste handling"

- Waste streams: wood chips and dust, packaging, removed hardware, used batteries, lubricant residue. Destinations and disposal rules: TBD — requires review by safety-liability-manager and a qualified person; owner to approve. Battery handling per the manufacturer and the reviewer (source: 29 section 8.1).
- Hazardous waste is not handled without an approved policy (source: 31 section 3.1; 02 G-078).
- Disposition of removed hardware and old keys follows an owner policy that does not exist yet (OPEN QUESTION; C-HI05-07); record it (source: spec HI-05.QAC).
  - Evidence: note

## 6. Final checks, completion photos and walkthrough

### From "16. Photo requirements (before / during / after)"

All photos are internal-only by default and never show keypad codes, app or account screens, or people and documents not needed for the work (source: spec REC-002, COM-002; 31 section 3.5 rule 7).
- Before: existing-condition photos of the door, frame and existing hardware (source: spec START-008; X-02, because the agreement disclaims prior conditions).
  - Evidence: photo
- During: concealed damage, frame damage or other unexpected conditions, with severity (source: spec JOB-004).
- After: interior and exterior hardware photos mapped to the door (source: spec QA-003; 04 HI-05 completion evidence).
  - Evidence: photo

### From "17. Customer communication"

- Arrival and completion updates are drafts; the worker or admin controls the send (source: spec UXE-008).
- Walkthrough: record the outcome - accepted, accepted with punch items, unavailable or disputed (source: spec QA-004).
  - Evidence: note
- The customer confirms they hold all codes and the account (source: spec HI-05.QAC).
- Never send codes, passwords, internal notes or incident details by SMS or email (source: spec COM-002).
- Care and warranty notes come only from an approved template; no HI-05 warranty or callback position exists yet (Q-30-07), and manufacturer-warranty handling is undefined (source: spec QA-008; 04 HI-05 warranty or callback policy).
- Do not repeat the flagged claim that the screws prevent future settling (C-HI05-05); make no security or outcome promises (source: 31 section 3.3 entry 8).
- Blocked work: use only the approved "work blocked" message (source: spec NTF-007).

### From "18. Completion criteria"

- Every check in section 13 is answered or has a recorded exception (source: spec QA-001).
  - Evidence: note
- The door closes and locks, emergency and manual operation are verified, and the property is secured (source: spec HI-05.SAF, HI-05.QAC).
- The customer controls all codes and accounts; no code or password appears in any record (source: spec HI-05.QAC, COM-002).
  - Evidence: note
- Old keys and hardware disposition is recorded (source: spec HI-05.QAC).
  - Evidence: note
- After photos are captured and mapped (QA-003); cleanup is done (QA-002); the walkthrough outcome is recorded (QA-004) (source: spec QA-002 to QA-004).
  - Evidence: photo, note
- A customer-supplied lock has its START-009 record (source: spec START-009).
  - Evidence: note
- Closeout: unresolved issues and incident or change follow-ups are submitted; the job closes only when the required operational and financial steps are complete (source: spec APXA-006, APXA-007).

## Stop-work triggers, escalation and incidents (service-specific)

### From "10. Stop-work conditions"

The general stop-work rule is [[FACT-SVC-STOP-WORK-RULE]]. Service-specific triggers:

Service-specific stop triggers and holds for HI-05 (pending qualified review):
- Card rule: "protect customer credentials; have customer control personal account/password; verify emergency/manual operation; do not leave property unsecured" (source: spec HI-05.SAF).
- HOLD (C-HI05-02): do not leave the property unsecured. If the door cannot be closed and locked, or emergency and manual operation cannot be verified, stop and escalate; the contingency is an OPEN QUESTION for the owner. Treated as a critical hold: an acknowledgment or a customer signature does not clear it (source: spec HI-05.SAF; 31 section 8.4 rule 3; job-planner playbook).
- HOLD (C-HI05-02): compatibility (door thickness, bore/backset, handing, lock model) is confirmed before the old lock is removed; on a mismatch the old lock is not removed and the job is escalated. Cleared only by the authorized role with an override record (source: spec HI-05.INT, PERM-006; 31 sections 8.4 rule 5 and 10).
  - Evidence: note
- HOLD (C-HI05-01): the Option B network-pairing and code step is held under the credential rule; cleared only after privacy owner and attorney review of the step (source: 31 sections 5.8 and 10).
- Stop on a door suspected to be fire-rated or an egress door; review by the building official or fire marshal (OPEN QUESTION) (source: 31 section 10; 04 HI-05 stop-work conditions, PROPOSED).
- Stop on visible frame or structural movement: record the condition (spec JOB-004) and escalate; do not diagnose (source: 04 HI-05 stop-work conditions, PROPOSED; C-HI05-05).
  - Evidence: note
- Stop where the requester's authority to change the locks is unclear (source: 31 section 10; OPEN QUESTION).

### From "19. Escalation"

General path: [[FACT-SVC-ESCALATION-PATH]].

Service-specific (pending review):
- A lock that fails after the old one is removed, or a door that cannot be locked: stop and escalate; minimal stabilization only if a policy allows it (source: spec JOB-006). The contingency and the stabilization policy are owner decisions not yet made (OPEN QUESTION; 02 G-005).

### From "20. Incident reporting"

General path: [[FACT-SVC-INCIDENT-REPORTING]].

Service-specific: suspected exposure of a customer code or password (seen, recorded, photographed or sent): TBD - requires privacy owner review (source: 31 section 5.8 credentials module).

## Spanish translation status (section 22)

| Field | Value |
|---|---|
| Spanish version | Not started |
| Source English version | `<none: no sop_version assigned yet>` |
| Translator (role) | `<owner decision>`; an AI draft is allowed only when marked `Draft - unreviewed` (COM-006) |
| Bilingual reviewer (role) | `<owner decision: qualified bilingual reviewer>` (Q-31-02) |
| Safety glossary version | None exists yet (GAP; HND-006) |
| Last review | None |
| Notes | No Arabic or Spanish text in this file |

## Open questions in the source SOP

- **Q-31-01** (owner): who are the competent reviewers for this SOP (qualified safety professional; privacy owner and attorney for credential handling; building official or fire marshal for rated or egress doors), and how is their competence evidenced?
- **31 section 10** (owner): what is the contingency if a new lock fails after the old one is removed, and who approves leaving the site?
- **04 HI-05 card** (attorney): how is the requester's authority to change locks verified (owner, tenant, landlord, rental host)?
- **04 HI-05 card** (privacy owner; attorney): how are Wi-Fi/app credentials and codes handled when the customer cannot be present, for example a remote rental host (C-HI05-01)?
- **04 HI-05 card** (legal-compliance-administrator; attorney; municipal licensing office): does locksmith or security-hardware licensing apply in the Kentucky and Indiana municipalities served? No conclusion is drawn here.
- **31 section 10** (building official or fire marshal; owner): will HandyHub work on fire-rated or egress doors at all?
- **04 HI-05 card** (EPA RRP-certified renovator): does the RRP rule apply to chiseling, filing or boring pre-1978 painted doors and frames? No conclusion is drawn here.
