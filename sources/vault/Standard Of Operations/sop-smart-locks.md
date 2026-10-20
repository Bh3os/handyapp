---
title: "SOP: Door Hardware & Smart Lock Installation"
service_id: HI-05
service_slug: smart-locks
canonical_name: "Door Hardware & Smart Lock Installation"
category: "Home Improvement"
doc_type: sop
status: draft-not-field-approved
authority: supporting
owner_approved: false
human_review:
  - "qualified safety reviewer"
  - "owner"
  - "Spanish translation reviewer"
  - "privacy owner (credentials and access codes)"
  - "attorney licensed in KY/IN (credentials and access codes)"
  - "building official or fire marshal (fire-rated or egress doors; open question)"
registry: "AI Development Plans/04-service-registry.md#HI-05"
last_reviewed: 2026-10-03
---

# 🚪 SOP: Door Hardware & Smart Lock Installation

> [!warning] Draft — not owner-approved
> Canonical service: **HI-05 — Door Hardware & Smart Lock Installation** · [Registry entry](../AI%20Development%20Plans/04-service-registry.md#HI-05)
> Not approved for field use. No SOP is active until competent review of task-specific manufacturer instructions, hazards, qualifications, applicable requirements, emergency arrangements and the Spanish translation (owner facts 2026-10-02). Workers must stop work and escalate for any unsafe, unexpected or out-of-scope condition. Standard: [31 SOP standard](../AI%20Development%20Plans/31-sop-standard.md).
> Review notes for this file: see "Review notes and cross-references" at the end.

## 1. Purpose

- Adjust misaligned deadbolts and strike plates, and set up smart keyless locks, for the canonical service HI-05 Door Hardware & Smart Lock Installation (source: spec Appendix B; original procedure in section 12).
- Intended result, as the spec card's quality checks define it: "smooth latch/deadbolt, secure attachment, door closes/locks, customer controls codes/accounts, old keys/hardware disposition confirmed" (source: spec HI-05.QAC).

## 2. Scope

### In scope
- Problem Option A: adjusting misaligned deadbolts and strike plates (source: original procedure, section 12).
- Problem Option B: setting up smart Wi-Fi keyless access locks; its network-pairing and code step is held under the credential rule (C-HI05-01) (source: original procedure, section 12; [31](../AI%20Development%20Plans/31-sop-standard.md) section 5.8).

### Out of scope
- Not covered - pending review (C-HI05-07): extraction of old lock mechanisms, which the agreement lists among its "Inclusions" and the main plan calls "Old Mechanism Extraction"; no step covers removing the old lock or the disposition of old keys and hardware (source: agreement clause 1; main plan section 5).
- Not covered - pending review (C-HI05-V01): standard lockset, deadbolt and handle replacement, which the pricing file sells as "Standard Lockset / Deadbolt Replacement"; not bookable until an SOP option is approved (source: pricing file).
- Not covered - pending review (C-HI05-09): new bores and re-bores (the inventory lists a boring jig and hole saws; the main plan promises to "re-bore misaligned strike plate cavities"); no approved price or procedure (source: inventory file; main plan section 5).
- Out of scope until the owner decides: mortise locks; re-keying or key cutting; door planing or rehanging; frame or structural repair; hardwired access control; fire-rated or egress door hardware (source: [04](../AI%20Development%20Plans/04-service-registry.md#HI-05) HI-05 exclusions, OPEN QUESTION).

### Do not perform
| # | Do not | Reason class | Instead | Source |
|---|---|---|---|---|
| 1 | Electrical, plumbing, gas or HVAC work outside the approved scope or requiring a licensed trade | Licensed trade | Stop and escalate; refer | Spec START-011 "unapproved electrical/plumbing/gas/structural scope"; master section 1.3 (31 section 3.3) |
| 2 | Structural work, meaning cutting, removing, sistering or adding load-bearing members, ledgers, footings or framing, unless it is in the approved scope with the required qualified review | Structural | Stop and escalate | Spec START-011; master section 1.3 (31 section 3.3) |
| 3 | Disturbing suspect asbestos, lead paint or mold; for HI-05 this includes chiseling, filing or boring pre-1978 or unknown-age painted doors and frames while the old-property screening is unresolved | Hazardous material | Stop and escalate | Spec START-011 "suspect hazardous materials"; owner facts 2026-10-02 "Unknown is not safe"; risk-triage playbook ("A pre-1978 painted surface is not cleared by a customer saying it looks safe"); 04 HI-05 hazards and permit/license flags; 31 section 5.8 |
| 4 | Work that is not in the approved scope or an approved change order | Out of scope | Record the customer request; change order | Spec JOB-005, JOB-010, FIN-008, AT-033 (31 section 3.3) |
| 5 | Working at height or using access equipment beyond the approved height and access policy | Policy | Stop and escalate | Spec HI-06.SAF; DW-04.TLS (31 section 3.3) |
| 6 | Mixing or sequencing chemicals in any way the approved step and the product SDS do not allow | Policy (chemicals) | Use only label and SDS directions | Spec CL-01.SAF; X-09 (31 section 3.3) |
| 7 | Recording, photographing or sending customer passwords, master codes or site access codes outside the app's secured fields | Policy (privacy) | The customer enters codes on their own device (section 12 hold) | Spec COM-002; owner facts 2026-10-02; [27](../AI%20Development%20Plans/27-roles-and-permissions.md) AUTH-009 |
| 8 | Promising results, warranties, safety, health or code compliance to the customer | Policy | Use approved wording only | Master sections 1.4, 17 and 29; spec CL-07.SAF (31 section 3.3) |
| 9 | Leaving the property with a door that does not close and lock | Security (treated as a critical hold) | Stop and escalate; the contingency if a new lock fails is an OPEN QUESTION for the owner | Spec HI-05.SAF "do not leave property unsecured"; 31 sections 8.4 and 10 |
| 10 | Changing locks without verified authority of the requester (owner, tenant, landlord, host) | Policy; legal question (how authority is verified is an OPEN QUESTION) | Do not start; escalate | 31 section 10; 04 HI-05 permit/license flags (attorney) |
| 11 | Installing or connecting mains-powered (hardwired) access control | Licensed trade | Refer; out of scope | 31 section 10; 04 HI-05 exclusions |
| 12 | Modifying, boring or changing hardware on fire-rated or egress doors without review | Code or permit question (OPEN QUESTION) | Stop and escalate | 31 section 10; 04 HI-05 hazards (building official or fire marshal) |

## 3. Preconditions

- This SOP is a draft and is not active; no job is dispatched under it until the owner records approval after competent review (source: owner facts 2026-10-02; spec HND-004; 04 section 2.4).
- Before leaving: confirm job, customer, address and time; review scope, exclusions, hazards and safety; load critical tools and materials; check customer-supplied items; confirm required documents and approvals (source: spec APXA-001).
- Intake complete: door material/thickness, existing bore/backset, lock model, handing, strike alignment, Wi-Fi/app needs, customer account/privacy (source: spec HI-05.INT).
- The lock supplier is recorded on the estimate (customer, HandyHub stock or job purchase; Q-29-14). A customer-supplied lock gets a record of visible condition, model and quantity before installation (source: spec START-009; [29](../AI%20Development%20Plans/29-inventory-and-procurement.md) section 9.1).
- For Option B, the customer or an authorized representative is present to create and own the app account and all codes; the absent-customer case (for example a remote rental host) is an OPEN QUESTION (source: 04 HI-05 prerequisites, PROPOSED; C-HI05-01).
- The requester's authority to change the locks is confirmed; how it is verified is an OPEN QUESTION for the attorney (source: 04 HI-05 prerequisites; 31 section 10).
- Permit, license and qualification flags: none is set for HI-05. Whether locksmith or security-hardware licensing applies in each Kentucky and Indiana municipality is an OPEN QUESTION, and unknown applicability does not default to "no permit". Start Job stays blocked where admin policy marks a requirement (source: spec START-010; 04 HI-05 permit/license flags; risk-triage playbook).
- A door suspected to be fire-rated or an egress door is not started without review (source: 31 section 10; OPEN QUESTION).
- Old-property screening for painted doors and frames (property age, older paint) is pending (source: 31 section 5.8; 04 HI-05 hazards). Until it is resolved, Do not perform entry 3 (section 2) applies before any chiseling, filing or boring of a painted door or frame in a home built before 1978 or of unknown build year; a customer statement does not clear it (source: owner facts 2026-10-02 "Unknown is not safe"; risk-triage playbook "A pre-1978 painted surface is not cleared by a customer saying it looks safe").
- Start only when the job shows Ready or an authorized exception is documented (source: spec APXA-003).

## 4. Required worker qualifications

- TBD — requires review by safety-liability-manager and a qualified person; owner to approve. No qualification policy exists (source: 31 section 3.1, GAP).
- Locksmith or security-hardware licensing per municipality is an OPEN QUESTION for the legal-compliance-administrator, an attorney and the municipal licensing office; no conclusion is drawn here (source: 04 HI-05 permit/license flags).
- The worker follows this SOP and the lock manufacturer's instructions (source: spec APXA-004).

## 5. Customer and property preparation

PROPOSED from the intake fields; customer-facing wording goes through [30](../AI%20Development%20Plans/30-service-agreement-standards.md) and [32](../AI%20Development%20Plans/32-website-and-customer-experience.md) (source: 04 HI-05 customer preparation requirements; spec HI-05.INT):
- the compatible lock is on site;
- the customer or an authorized representative is present with their own phone and account;
- a Wi-Fi bridge is available if the lock model needs one;
- all existing keys are available;
- the customer has decided what happens to the old hardware.

Every job re-confirms that access, occupants, pets, parking, hazards and work-area conditions are still current (source: spec CX-005).

## 6. PPE

- TBD - pending safety review. The card lists "pinch/cut, drilling" hazards (spec HI-05.HAZ) but no PPE, and neither the inventory file nor this SOP lists any; selection by a qualified safety professional (source: 31 section 3.5 rule 6; 29 section 7.3).

## 7. Tools and equipment

- Card tools: "screwdrivers, drill/driver, bits, chisels, measuring tools, templates, file, vacuum" (source: spec HI-05.TLS).
- Listed in the inventory file: wood chisels set (used by Option A "Chisel Recess Modification"); boring jig template kit and bi-metal hole saws (unused: no approved boring procedure, C-HI05-09); wood rasp and sanding files (unused by this SOP) (source: inventory file).
- Not listed in the inventory file: screwdrivers and driver bits (Option A unscrews the strike plate), drill/driver and bits (Option A drives the screws), measuring tools and a vacuum; a mallet for chiseling is to be confirmed by the reviewer (C-HI05-10; proposed in the inventory file) (source: 29 sections 5.2 and 7.4).
- Pre-use checks per the tool manufacturer, including charged-battery checks for cordless tools (source: spec BRF-009).
- Vehicle safety kit (first-aid kit, fire extinguisher, eyewash, spill kit): contents set by the qualified safety professional (X-10) (source: 29 D-29-08).

## 8. Materials and consumables

- Card materials: "lock/hardware, screws, strike plate, batteries, approved shims/wood filler if included" (source: spec HI-05.MAT).
- Lock unit: who supplies it is undefined (Q-29-14). A customer-supplied lock needs the START-009 record, and its compatibility is checked against the manufacturer's instructions before the old lock is removed (hold in section 12) (source: spec START-009; 31 section 10).
- Listed in the inventory file: "Heavy-Duty 3-inch Exterior Wood Framing Screws" (Option A "Screw Reinforcement"); drive-in latches and faceplates (unused by this SOP); graphite or dry-silicone lubricant (unused by this SOP; SDS required, and a chemical product without a reviewed SDS is not carried to a job, 29 section 8.3, PROPOSED); AA and AAA lithium batteries (chemistry and storage per the lock manufacturer; hazardous-material flag) (source: inventory file).
- Not listed: strike plates; approved shims and wood filler, only if included in the approved scope (C-HI05-10).
- Substitutions only as an approved substitution (source: spec JOB-007).

## 9. Hazards

Draft entries for the qualified safety professional; no control below is approved. Controls follow the hierarchy of controls: eliminate, substitute, engineer, administrative, then PPE (source: safety-liability-manager skill).

| Hazard | Source | Draft controls (pending review) | Stop or escalate when | Reviewer |
|---|---|---|---|---|
| Pinch and cut (chisels, door edges, hardware) | Spec HI-05.HAZ | TBD - pending safety review; PPE in section 6 | An unsafe condition arises (section 10) | Qualified safety professional |
| Drilling | Spec HI-05.HAZ | TBD - pending safety review; no boring procedure is approved (C-HI05-09) | Any new bore or re-bore would be needed | Qualified safety professional; owner |
| Door damage | Spec HI-05.HAZ | Existing-condition photos before work (spec START-008; X-02); protect the work area (spec APXA-002) | Damage found before work: record it (spec JOB-004) | Owner |
| Security and privacy; account credentials | Spec HI-05.HAZ, HI-05.SAF | The customer creates and controls the account, password and codes; codes are never recorded, photographed or sent (31 section 5.8, PROPOSED; spec COM-002) | Any request that the worker set, hold or record codes or passwords | Privacy owner; attorney |
| Property left unsecured or customer locked out | Spec HI-05.SAF; 04 HI-05 hazards | Compatibility check before the old lock is removed; final function test before leaving (holds in section 12) | The lock does not close, lock or operate, including emergency and manual operation | Owner (contingency); qualified safety professional |
| Painted doors and frames in older homes disturbed by chiseling, filing or boring | 04 HI-05 hazards; agreement "older homes" | Old-property screening questions (31 section 5.8); suspect lead paint is not disturbed (spec START-011) | Property age unknown or suspect lead paint | EPA RRP-certified renovator (applicability is an OPEN QUESTION) |
| Lithium batteries | Inventory file; 29 section 8.1 | Storage, charging and transport per the manufacturer and the reviewer | TBD - pending safety review | Qualified safety professional |
| Aerosol lubricant | Inventory file; 29 section 8.1 | SDS required; not carried to a job without a reviewed SDS (29 section 8.3, PROPOSED) | TBD - pending safety review | Qualified safety professional |
| Fire-rated or egress doors | 04 HI-05 hazards (GAP); 31 section 10 | No modification without review | A door is suspected to be fire-rated or an egress door | Building official or fire marshal (OPEN QUESTION) |
| Structural movement of the door frame | Agreement "Structural Frame Waiver"; C-HI05-05 | Do not diagnose; record the condition (spec JOB-004) | Visible frame or structural movement | Structural engineer only where signs of structural movement are observed |
| Occupants, children and pets near the work | X-11; spec APXA-002 "identify pets/occupants" | Keep them away from the hazard (31 section 8.5); occupant module pending (31 section 5.8) | Aggressive occupant or animal (spec START-011) | Qualified safety professional |

## 10. Stop-work conditions

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

Service-specific stop triggers and holds for HI-05 (pending qualified review):
- Card rule: "protect customer credentials; have customer control personal account/password; verify emergency/manual operation; do not leave property unsecured" (source: spec HI-05.SAF).
- HOLD (C-HI05-02): do not leave the property unsecured. If the door cannot be closed and locked, or emergency and manual operation cannot be verified, stop and escalate; the contingency is an OPEN QUESTION for the owner. Treated as a critical hold: an acknowledgment or a customer signature does not clear it (source: spec HI-05.SAF; 31 section 8.4 rule 3; job-planner playbook).
- HOLD (C-HI05-02): compatibility (door thickness, bore/backset, handing, lock model) is confirmed before the old lock is removed; on a mismatch the old lock is not removed and the job is escalated. Cleared only by the authorized role with an override record (source: spec HI-05.INT, PERM-006; 31 sections 8.4 rule 5 and 10).
- HOLD (C-HI05-01): the Option B network-pairing and code step is held under the credential rule; cleared only after privacy owner and attorney review of the step (source: 31 sections 5.8 and 10).
- Stop on a door suspected to be fire-rated or an egress door; review by the building official or fire marshal (OPEN QUESTION) (source: 31 section 10; 04 HI-05 stop-work conditions, PROPOSED).
- Stop on visible frame or structural movement: record the condition (spec JOB-004) and escalate; do not diagnose (source: 04 HI-05 stop-work conditions, PROPOSED; C-HI05-05).
- Stop where the requester's authority to change the locks is unclear (source: 31 section 10; OPEN QUESTION).

## 11. Setup

- On arrival: confirm address, work area and contact; identify pets and occupants; inspect the actual site against the briefing; capture the required existing-condition photos; protect the work area (source: spec APXA-002).
- Before starting: complete the required safety, PPE and site checks; confirm materials and models; acknowledge the SOP and hazards; start only when Ready or an authorized exception is documented (source: spec APXA-003, START-004).
- Customer-supplied lock: record visible condition, model and quantity (source: spec START-009).
- Door and floor protection and staging details: TBD — requires review by safety-liability-manager and a qualified person; owner to approve.

## 12. Step-by-step procedure

*Original procedure text below is unchanged and in its original order. HOLD and FLAG lines are added review items pending qualified review; they never replace or reword a step (source: 31 section 9.2; 36 section 3.4).*

### 🚨 Problem Option A: Adjusting Misaligned Deadbolts & Strike Plates
- [ ] **Drag Inspection:** Close the door and manually turn the lock thumb-turn. Identify if the deadbolt rubs against the top, bottom, or back of the strike plate cavity.
- [ ] **Chisel Recess Modification:** Unscrew the metal strike plate from the door frame. Use a sharp 1/2-inch wood chisel to chip away wood fibers to widen the cavity recess in the direction of the bolt drag.
- [ ] **Screw Reinforcement:** Reinstall the strike plate using heavy 3-inch wood screws driven deep into the structural jack studs (this stabilizes the loose frame and prevents future settling misalignment).

> FLAG (C-HI05-05): outcome claim in the step above - "this stabilizes the loose frame and prevents future settling misalignment" - is unverified and conflicts with the agreement's "Structural Frame Waiver". Do not repeat it to customers. Do not diagnose foundation settling; record visible frame movement (spec JOB-004) and escalate (section 10). Owner and attorney review. (source: 31 section 10)

> HOLD (C-HI05-02): before leaving after the steps above, check with the door closed that it latches and locks and that the deadbolt moves smoothly, including manual operation; do not leave the property unsecured - if the door cannot be locked, stop and escalate (section 19). Pending qualified review. (source: spec HI-05.SAF, HI-05.QAC; 31 section 10)

### 🚨 Problem Option B: Setting Up Smart Wi-Fi Keyless Access Locks

> HOLD (C-HI05-02): before the old lock is removed and before the step below, confirm compatibility - door thickness, bore/backset, handing and lock model - against the lock manufacturer's instructions; on any mismatch, do not remove the old lock; stop and escalate. Pending qualified review. (source: spec HI-05.INT; 31 section 10)

> FLAG (C-HI05-07): no step covers removing the old lock or recording what happens to old keys and hardware; not covered - pending review (section 2).

- [ ] **Hardware Assembly:** Mount the smart lock exterior keypad and interior motorized deadbolt unit uniformly, ensuring the wires clear the latch spindle paths without pinching.
- [ ] **Motor Calibration:** Run the smart lock's automatic calibration loop. The lock will shoot the deadbolt out multiple times to confirm zero friction or electronic motor drag.
- [ ] **Network Pairing:** Pair the lock to the home Wi-Fi hub, configure temporary guest access pin codes, and test remote lock/unlock commands via the client's smartphone.

> HOLD (C-HI05-01): the step above is held (not performed as written) pending privacy owner and attorney review. Until then the credential rule applies (31 section 5.8, PROPOSED): the customer creates and owns the app account and enters the Wi-Fi password and all master and guest codes on their own device; the worker may point to the manufacturer's setup steps; codes and passwords are never recorded, photographed or sent. (source: spec HI-05.SAF, HI-05.QAC, COM-002; owner facts 2026-10-02)

> HOLD (C-HI05-02): before leaving, final function test with the door closed - key, thumb-turn, and keypad and app where in scope - including emergency and manual operation per the lock manufacturer; do not leave the property unsecured. If the lock fails, stop and escalate (section 19); the contingency is an OPEN QUESTION for the owner. An acknowledgment does not clear this hold. Pending qualified review. (source: spec HI-05.SAF, HI-05.QAC; 31 section 10)

## 13. Quality checkpoints

Observable checks from the spec card; the worker answers each check or records an exception (source: spec HI-05.QAC, QA-001). A worker's self-check does not replace a supervisor inspection where one is required (source: quality-assistant playbook).

| Check | Evidence | Source |
|---|---|---|
| Smooth latch and deadbolt operation (key, thumb-turn, and keypad and app where in scope) | Function-test record | Spec HI-05.QAC; 04 HI-05 completion evidence |
| Secure attachment of the hardware | After photos that show no codes or account screens | Spec HI-05.QAC, REC-002, COM-002 |
| Door closes and locks; emergency and manual operation verified per the lock manufacturer | Function-test record (hold in section 12) | Spec HI-05.QAC, HI-05.SAF |
| Customer controls codes and accounts | Customer confirmation; no code or password value in any record | Spec HI-05.QAC, COM-002; 27 AUTH-009 (PROPOSED) |
| Old keys and hardware disposition confirmed | Disposition record (customer keeps or disposed per policy - OPEN QUESTION, C-HI05-07) | Spec HI-05.QAC |

## 14. Cleanup

- Clean the area, remove protection, account for tools and materials, and restore components altered within scope (source: spec APXA-005, QA-002).
- Wood chips and dust from chiseling: vacuum per the card's tool list; a vacuum is not yet in the inventory (C-HI05-10) (source: spec HI-05.TLS).
- Record what happens to packaging, leftover lock parts and old hardware (source: 29 section 9.1; spec HI-05.QAC).

## 15. Waste handling

- Waste streams: wood chips and dust, packaging, removed hardware, used batteries, lubricant residue. Destinations and disposal rules: TBD — requires review by safety-liability-manager and a qualified person; owner to approve. Battery handling per the manufacturer and the reviewer (source: 29 section 8.1).
- Hazardous waste is not handled without an approved policy (source: 31 section 3.1; [02](../AI%20Development%20Plans/02-gap-analysis.md) G-078).
- Disposition of removed hardware and old keys follows an owner policy that does not exist yet (OPEN QUESTION; C-HI05-07); record it (source: spec HI-05.QAC).

## 16. Photo requirements (before / during / after)

All photos are internal-only by default and never show keypad codes, app or account screens, or people and documents not needed for the work (source: spec REC-002, COM-002; 31 section 3.5 rule 7).
- Before: existing-condition photos of the door, frame and existing hardware (source: spec START-008; X-02, because the agreement disclaims prior conditions).
- During: concealed damage, frame damage or other unexpected conditions, with severity (source: spec JOB-004).
- After: interior and exterior hardware photos mapped to the door (source: spec QA-003; 04 HI-05 completion evidence).

## 17. Customer communication

- Arrival and completion updates are drafts; the worker or admin controls the send (source: spec UXE-008).
- Walkthrough: record the outcome - accepted, accepted with punch items, unavailable or disputed (source: spec QA-004).
- The customer confirms they hold all codes and the account (source: spec HI-05.QAC).
- Never send codes, passwords, internal notes or incident details by SMS or email (source: spec COM-002).
- Care and warranty notes come only from an approved template; no HI-05 warranty or callback position exists yet (Q-30-07), and manufacturer-warranty handling is undefined (source: spec QA-008; 04 HI-05 warranty or callback policy).
- Do not repeat the flagged claim that the screws prevent future settling (C-HI05-05); make no security or outcome promises (source: 31 section 3.3 entry 8).
- Blocked work: use only the approved "work blocked" message (source: spec NTF-007).

## 18. Completion criteria

- Every check in section 13 is answered or has a recorded exception (source: spec QA-001).
- The door closes and locks, emergency and manual operation are verified, and the property is secured (source: spec HI-05.SAF, HI-05.QAC).
- The customer controls all codes and accounts; no code or password appears in any record (source: spec HI-05.QAC, COM-002).
- Old keys and hardware disposition is recorded (source: spec HI-05.QAC).
- After photos are captured and mapped (QA-003); cleanup is done (QA-002); the walkthrough outcome is recorded (QA-004) (source: spec QA-002 to QA-004).
- A customer-supplied lock has its START-009 record (source: spec START-009).
- Closeout: unresolved issues and incident or change follow-ups are submitted; the job closes only when the required operational and financial steps are complete (source: spec APXA-006, APXA-007).

## 19. Escalation

> 1. Stop the affected work and keep yourself, occupants and pets away from the hazard; do not try to fix, move or disturb it (source: spec START-011; risk-triage playbook L7).
> 2. Emergency (fire, gas odor, injury, electrical contact, structural movement): call emergency services first, then `<owner decision: emergency contact>` (source: spec BRF-013).
> 3. Only if policy allows and it is safe, take the minimum action needed to prevent immediate injury or property damage, and record why and what you did (source: spec JOB-006).
> 4. Report in the app with Stop Work / Report Hazard: type, photos and severity (source: spec JOB-004, UXE-004). Before the job has started, record No Start / Blocked instead of starting (source: spec SCH-008, AT-030).
> 5. Escalate with one tap to `<owner decision: escalation order>`; the item enters the owner/supervisor queue (source: spec UXE-002, JOB-012).
> 6. Wait for release by the role named in the hold, with evidence recorded. Critical holds clear only with a recorded qualified assessment (source: owner facts 2026-10-02; 27 Roles and permissions section 6.3).
> 7. Tell the customer only what the approved "work blocked" message says; never send incident details or access codes by text or email (source: spec NTF-007, COM-002).
> 8. Resume only after the briefing is updated and re-acknowledged, with a change order if scope or price changes (source: spec START-002, FIN-008, JOB-005).

Service-specific (pending review):
- A lock that fails after the old one is removed, or a door that cannot be locked: stop and escalate; minimal stabilization only if a policy allows it (source: spec JOB-006). The contingency and the stabilization policy are owner decisions not yet made (OPEN QUESTION; [02](../AI%20Development%20Plans/02-gap-analysis.md) G-005).

## 20. Incident reporting

> - Report every injury, property damage, near miss, customer conflict, tool or equipment failure and suspected hazardous-material exposure on the incident form (source: spec JOB-008).
> - An injured person comes first: call emergency services; give only the first aid that the company's approved first-response arrangements cover (not yet defined; pending qualified safety review); medical decisions belong to emergency services and medical professionals (source: master section 1.3; safety-liability-manager skill "prioritize immediate safety and emergency response over paperwork").
> - Record facts, photos and actions taken. Do not guess causes or discuss fault or liability with the customer; refer those questions to the owner (source: spec AIR-012 boundary "liability admissions require human review").
> - Keep injury and medical details out of customer-visible notes and messages (source: spec PERM-003, COM-002).
> - Report as soon as it is safe and before the job is closed (source: spec Appendix A APXA-007). High-severity incidents go to the escalation queue (source: spec AT-035, JOB-012).

Service-specific: suspected exposure of a customer code or password (seen, recorded, photographed or sent): TBD - requires privacy owner review (source: 31 section 5.8 credentials module).

## 21. Linked files

- [Registry entry HI-05](../AI%20Development%20Plans/04-service-registry.md#HI-05)
- [Pricing](../Pricing/pricing-smart-locks.md)
- [Inventory](../Required%20inventory/inventory-smart-locks.md)
- [Agreement](../Service%20Agreements/contract-smart-locks.md)
- [Requirements spec (service card HI-05; Appendix A)](../Requierments/HandyHub_Requirements_Specification_Reconstructed.md)
- [Main plan, section 5](../Main%20Plans/Home%20Improvement%20Business.md)
- Standards: [31 SOP standard](../AI%20Development%20Plans/31-sop-standard.md) · [27 Roles and permissions](../AI%20Development%20Plans/27-roles-and-permissions.md) (AUTH-009) · [29 Inventory and procurement](../AI%20Development%20Plans/29-inventory-and-procurement.md)

## 22. Spanish translation status

| Field | Value |
|---|---|
| Spanish version | Not started |
| Source English version | `<none: no sop_version assigned yet>` |
| Translator (role) | `<owner decision>`; an AI draft is allowed only when marked `Draft - unreviewed` (COM-006) |
| Bilingual reviewer (role) | `<owner decision: qualified bilingual reviewer>` (Q-31-02) |
| Safety glossary version | None exists yet (GAP; HND-006) |
| Last review | None |
| Notes | No Arabic or Spanish text in this file |

---

## Review notes and cross-references (added 2026-10-03)

*Added during the AI orchestrator repository audit. Not part of the original content; original text above is unchanged.*

**Related files:** [Registry entry](../AI%20Development%20Plans/04-service-registry.md#HI-05) · [Pricing](../Pricing/pricing-smart-locks.md) · [Inventory](../Required%20inventory/inventory-smart-locks.md) · [Agreement](../Service%20Agreements/contract-smart-locks.md) · [Requirements spec (service card HI-05)](../Requierments/HandyHub_Requirements_Specification_Reconstructed.md) · [Main plan](../Main%20Plans/Home%20Improvement%20Business.md) · [Gap analysis](../AI%20Development%20Plans/02-gap-analysis.md)

### Issues affecting this file
| ID | Severity | Issue (short) | Reviewer / owner |
|---|---|---|---|
| C-HI05-01 | critical | Workers program master/guest codes and pair Wi-Fi, but the spec requires customer control of credentials. HOLD after "Network Pairing" (section 12); section 10 | Privacy/data owner; attorney licensed in KY and IN; owner |
| C-HI05-02 | critical | SOP has no manual/emergency-operation check and no "do not leave property unsecured" hold. HOLDs: compatibility check before "Hardware Assembly"; secured-door check after Option A; final function test after Option B (section 12); section 10 | Qualified safety professional; owner (contingency policy) |
| C-HI05-05 | high | SOP claims the reinforcement "prevents future settling misalignment"; the contract disclaims settling. FLAG after "Screw Reinforcement" (section 12) | Attorney (KY/IN); structural engineer only where signs of structural movement are observed |
| C-HI05-07 | medium | Old-lock extraction is promised but has no SOP step, and old keys/hardware disposition is missing. Not covered (section 2); FLAG before "Hardware Assembly" | Owner; qualified safety professional |
| C-HI05-09 | medium | New-bore/re-bore capability is stocked and marketed, but pricing excludes boring and the SOP has no procedure. Not covered (section 2) | Owner; qualified safety professional; building official for fire-rated doors |
| C-HI05-10 | medium | Tools required by the SOP and spec card are missing from inventory (section 7) | Lead Worker / owner |
| C-HI05-V01 | medium | Standard lockset, deadbolt and handle replacement is priced, but the SOP has no installation procedure for non-smart hardware. Not covered (section 2) | Owner; qualified safety professional |
| X-02 | high | Pre-existing-condition clauses in at least 13 contracts depend on proof that only one SOP (CL-05) collects (before photos, section 16) | KY/IN attorney |
| X-10 | high | No emergency kit in any inventory and no incident step in any SOP (sections 7 and 20) | Qualified safety professional |
| X-11 | high | No SOP or contract protects occupants, children or pets from active work hazards (0/26 SOPs, 0/25 contracts) (sections 9 and 11) | Qualified safety professional |

### Open questions
- **Q-31-01** (owner): who are the competent reviewers for this SOP (qualified safety professional; privacy owner and attorney for credential handling; building official or fire marshal for rated or egress doors), and how is their competence evidenced?
- **31 section 10** (owner): what is the contingency if a new lock fails after the old one is removed, and who approves leaving the site?
- **04 HI-05 card** (attorney): how is the requester's authority to change locks verified (owner, tenant, landlord, rental host)?
- **04 HI-05 card** (privacy owner; attorney): how are Wi-Fi/app credentials and codes handled when the customer cannot be present, for example a remote rental host (C-HI05-01)?
- **04 HI-05 card** (legal-compliance-administrator; attorney; municipal licensing office): does locksmith or security-hardware licensing apply in the Kentucky and Indiana municipalities served? No conclusion is drawn here.
- **31 section 10** (building official or fire marshal; owner): will HandyHub work on fire-rated or egress doors at all?
- **04 HI-05 card** (EPA RRP-certified renovator): does the RRP rule apply to chiseling, filing or boring pre-1978 painted doors and frames? No conclusion is drawn here.

### Revision history
| Date | Change | Author |
|---|---|---|
| 2026-10-03 | Added frontmatter, status callout, standard sections and review notes; original text unchanged | AI orchestrator (Claude) |
