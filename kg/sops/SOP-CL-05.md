---
id: SOP-CL-05
type: sop
title: "SOP CL-05: Airbnb Turnover & Vacation Rental Management"
status: active
area: field
links:
  part_of: ["[[SVC-CL-05]]", "[[S07]]"]
  decided_by: ["[[OWN-DEC-108]]", "[[OWN-DEC-109]]", "[[OWN-DEC-17]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]", "[[RULE-HUMAN-REVIEW]]", "[[RULE-NO-INVENTED-FACTS]]", "[[FACT-SVC-STOP-WORK-RULE]]"]
  uses: ["[[FACT-INVENTORY-CL-05]]", "[[FACT-SVC-PHOTO-MINIMUM]]", "[[FACT-SVC-ESCALATION-PATH]]", "[[FACT-SVC-INCIDENT-REPORTING]]"]
source: "vault Standard Of Operations/sop Airbnb Cleaning and Turnover Checklist.md; OWN-DEC-108"
---
Worker checklist for [[SVC-CL-05]] (Airbnb Turnover & Vacation Rental Management). Status: active for the job checklist under [[OWN-DEC-108]], pending competent review for production use ([[OWN-DEC-17]]). The vault file is a draft (`status: draft-not-field-approved`, `owner_approved: false`).

Source file: `Standard Of Operations/sop Airbnb Cleaning and Turnover Checklist.md`. Each group below names the source heading its steps come from, and every step keeps the vault wording (link targets removed). The original procedure is section 12; the other sections were added in the vault on 2026-10-03 from the spec and the SOP standard, pending review. HOLD, GATE and FLAG lines are review controls added on 2026-10-03, pending qualified review: a HOLD placed before a step must be cleared before that step starts. An "Evidence" line lists the photo, measurement or note that the step's own wording asks for; a step without one names none.

Required steps cannot be skipped ([[OWN-DEC-108]]); the completion sequence is [[OWN-DEC-109]] and the minimum photo rule is [[FACT-SVC-PHOTO-MINIMUM]]. Tools, materials and PPE: [[FACT-INVENTORY-CL-05]]. Safety gates: [[RULE-SAFETY-GATES]].

Section 12 phases listed under another stage because their heading names only that stage's work: Phase 1 to stage 2. All other phases stay in stage 3 in their original order.

## 1. Site preparation and property protection

### From "5. Customer and property preparation"

PROPOSED from the intake fields; customer-facing wording goes through 30 and 32 (source: spec CL-05.INT; 04 CL-05 customer preparation requirements):
- checkout and check-in times for each turnover;
- the host checklist;
- linens and towels: who supplies them, par levels and whether laundry is done on site (C-CL05-12);
- amenities and restock levels, with restock items stored in the host's locked supply closet as the agreement's "Inventory Logistics" clause says (supply conflict, Q-29-13);
- the damage-report rule and the guest-property rule (C-CL05-10);
  - Evidence: note
- the access and security-codes policy: the host enters codes in the app's secured fields, never by text or email (spec COM-002; 31 section 5.8 credential rule, PROPOSED);
- trash and recycling location, welcome book, thermostat and Wi-Fi preferences, and parking (04 CL-05 customer preparation requirements, GAP).

Every turnover re-confirms that access, occupants, pets, parking, hazards and work-area conditions are still current (source: spec CX-005).

## 2. Setup and required measurements/checks

### From "3. Preconditions"

- This SOP is a draft and is not active; no job is dispatched under it until the owner records approval after competent review (source: owner facts 2026-10-02; spec HND-004; 04 section 2.4).
  - Evidence: note
- Before leaving: confirm job, customer, address and time; read the latest changes; verify access and parking; review scope, exclusions, hazards and safety; load critical tools, equipment and materials; check customer-supplied items; confirm required documents and approvals (source: spec APXA-001).
- Intake complete for the property: "checkout/check-in times, host checklist, linens, amenities/restock levels, damage-report rule, access/security codes policy" (source: spec CL-05.INT).
  - Evidence: note
- The host's guest-property rule (discard, hold or notify) is recorded at intake; until an owner-approved guest-property policy exists, no guest property is discarded (source: spec CL-05.SAF; 02 C-CL05-10; 02 G-005).
  - Evidence: note
- Access information is available only in the app's secured fields for the service day; it is never written into notes, messages or photos (source: spec CL-05.SAF "protect access codes", COM-002; 27 AUTH-009, PROPOSED).
- Checkout has happened: the agreement makes its window conditional on "immediate property access"; if guests are still present, the worker does not enter (Do not perform, item 9) (source: agreement "Operational Timeline" clause; 31 section 10).
- Restock items: who supplies them is undecided (Q-29-13). Host-supplied items stay in the host's locked supply closet under the agreement; missing items are recorded (source: agreement "Inventory Logistics" clause; spec START-009, JOB-004).
  - Evidence: note
- Same-day capacity: how many turnovers two employees can take in one day, and whether the pricing file's time caps mean elapsed time or person-hours, are owner decisions; scheduling must respect working hours and worker capability (source: spec SCH-003; 04 CL-05 labor assumptions).
- Permit, license and qualification flags: none is set for CL-05. Whether co-hosting or any other part of this service needs a license in Kentucky or Indiana is an OPEN QUESTION, and unknown applicability does not default to "no requirement" (source: spec START-010; 30 section 8 row 24; risk-triage playbook).
- Start only when the job shows Ready or an authorized exception is documented (source: spec APXA-003).
  - Evidence: note

### From "11. Setup"

- On arrival: confirm address, work area and contact; park and access appropriately; identify pets and occupants; inspect the actual site against the briefing; capture the required existing-condition photos; protect the work area; identify utilities and emergency constraints relevant to the task (source: spec APXA-002).
  - Evidence: photo
- Before starting: complete the required safety, PPE and site checks; acknowledge the SOP and hazards; start only when Ready or an authorized exception is documented (source: spec APXA-003, START-004).
  - Evidence: note
- Existing-condition evidence: the Phase 1 "Damage Scan" and "Evidence Collection" steps are the arrival record, captured in the app (source: spec START-008; 27 AUTH-034, PROPOSED).
  - Evidence: note
- Host-supplied restock and linens: record what is present and what is missing (source: spec START-009, JOB-004).
  - Evidence: note
- Staging of the caddy, supplies and laundry bags: TBD — requires review by safety-liability-manager and a qualified person; owner to approve.

### From "12. Step-by-step procedure / 📸 Phase 1: Pre-Clean Inspection & Host Verification"

> HOLD (C-CL05-01): before entry and before the "Damage Scan" step below - use access information only from the app's secured fields on the service day; never write down, photograph or send a door, lockbox or alarm code. Pending privacy owner review. (source: spec CL-05.SAF "protect access codes"; COM-002; 27 AUTH-009, PROPOSED)

> HOLD (31 section 10 seed, PROPOSED): before entry - if guests are still in the unit, do not enter; record the late checkout in the app and escalate (section 19). Pending qualified safety review. (source: 31 section 10 "do not enter while guests are present"; spec START-011 "aggressive occupants/animals")

- [ ] **Damage Scan:** Walk through all rooms looking for broken items, wall holes, stained furniture, or smoking odor.

> HOLD (C-CL05-01): if the walkthrough above finds needles, sharps, blood or bodily fluids, damage, or urgent maintenance such as an active leak or a lock that does not secure, do not handle, clean or repair it; record it with photos and severity in the app and escalate (section 19). Pending qualified review. (source: spec CL-05.HAZ; CL-05.SAF "escalate biohazard/damage; verify lockup and urgent maintenance"; JOB-004)

- [ ] **Evidence Collection:** Immediately take high-resolution photos of any guest damage or extreme mess and upload them to the host portal.
  - Evidence: photo

> HOLD (Q-27-16): the delivery part of the step above ("upload them to the host portal") is held until the owner and privacy owner decide the photo channels. Until then, capture the photos in the app, where they stay on the job record, internal-only by default, framed to avoid access codes, people, documents and valuables. Pending privacy owner review. (source: 31 section 10; 27 AUTH-034, PROPOSED; spec REC-002; Q-31-12)

- [ ] **Inventory Check:** Verify that high-value amenities (TV remotes, hair dryers, iron, coffee machine, key fobs) are present and working.
- [ ] **Thermostat & Tech:** Set the thermostat to the host's preferred guest welcome temperature; ensure the Wi-Fi router is online.

> FLAG (owner decision): "ensure the Wi-Fi router is online" in the step above - what "ensure" covers beyond checking and reporting is not defined in scope. Never record, photograph or send Wi-Fi or account passwords. (source: 31 section 5.8 credential rule, D-31-16, PROPOSED; 04 CL-05 customer preparation requirements "thermostat/Wi-Fi preferences")

## 3. Service-specific work steps

### From "12. Step-by-step procedure" (introduction)

*Original procedure text below is unchanged and in its original order. HOLD and FLAG lines are added review items pending qualified review; they never replace or reword a step (source: 31 section 9.2; 36 section 3.4). The agreement's completion window never overrides a hold or the stop-work rule in section 10 (source: 31 section 10).*

### From "12. Step-by-step procedure / 🛏️ Phase 2: Linen Stripping & Laundry Workflow"

> HOLD (C-CL05-01): before the "Strip Linens" and "Towel Collection" steps below - if needles, sharps, blood or bodily fluids are found or suspected in bedding, mattress protectors or towels, do not handle them; stop that task and escalate (section 19). PPE per section 6 (pending review). Pending qualified review. (source: spec CL-05.HAZ "sharps/biohazard"; CL-05.SAF "escalate biohazard/damage")

- [ ] **Strip Linens:** Remove all sheets, pillowcases, and duvet covers from beds; check mattress protectors for stains.
- [ ] **Towel Collection:** Gather all used bathroom towels, hand towels, and washcloths.
- [ ] **Laundry Sort:** Start the first wash load immediately (if laundry is done on-site) to maximize turnover time.

> FLAG (C-CL05-12): the laundry model is undecided - on-site machines (the step above), "professionally laundered" sheets (Phase 4) or clean linens carried in a vehicle (inventory file); linen ownership and par levels are not set. Owner decision. (source: 02 C-CL05-12; spec CL-05.INT "linens")

### From "12. Step-by-step procedure / 🧽 Phase 3: High-Touch Sanitization & Cleaning"

- [ ] **Disinfection:** Sanitize high-touch items with disinfectant wipes: TV remotes, lockbox dials, door handles, light switches, hair dryer handles.

> HOLD (C-CL05-01): the step above touches lockbox dials - never record, photograph or send a lockbox or door code. Pending privacy owner review. (source: spec CL-05.SAF "protect access codes"; COM-002; 27 AUTH-009, PROPOSED)

- [ ] **Kitchen Check:** Throw away any perishable food left in the fridge by previous guests; wipe down shelves and handle bars.

> HOLD (C-CL05-10): the discard part of the step above ("Throw away any perishable food left in the fridge by previous guests") is held until the owner sets a guest-property policy and the host's rule is recorded at intake. Until then, do not discard guest food or other guest property; record what was left and notify the host as an exception. Pending owner and attorney review. (source: spec CL-05.SAF "never discard guest property without policy"; CL-05.QAC "host notified of exceptions"; 31 section 10; Q-30-17)

> FLAG (C-CL05-V01): kitchen standard undefined - the step above is the only kitchen cleaning step (fridge shelves and handle bars), while the main plan sells "Deep cleaning kitchens and bathrooms"; which kitchen tasks belong to a standard turnover is an owner decision, and no step is drafted without review. (source: 02 C-CL05-V01; main plan section 5)

> HOLD (C-CL05-01): before the "Bathroom Inspection" step below - the sharps and biohazard hold of Phase 2 applies to the toilet, sink, shower, drain and floor: if anything of that kind is found or suspected, do not handle it; stop that task and escalate (section 19). Pending qualified review. (source: spec CL-05.HAZ, CL-05.SAF)

- [ ] **Bathroom Inspection:** Deep-clean the toilet, sink, and shower. *Crucial:* Meticulously inspect the shower drain and floor to ensure absolutely zero stray hairs remain.

### From "12. Step-by-step procedure / ☕ Phase 4: Staging & Hospitality Restocking"

- [ ] **Hotel Bed Tucking:** Make beds using fresh, professionally laundered sheets; ensure there are zero wrinkles and pillows are fluffed straight.
- [ ] **Amenity Refill:** Refill bathroom dispensers: toilet paper (fold the first sheet into a triangle), shampoo, conditioner, body wash, hand soap.

> HOLD (C-CL05-01): before the "Kitchen Hospitality" step below - if needles, sharps, blood or bodily fluids are found or suspected in bins or trash, do not handle them; stop that task and escalate (section 19). Pending qualified review. (source: spec CL-05.HAZ; 04 CL-05 PPE row)

- [ ] **Kitchen Hospitality:** Replenish coffee pods, tea bags, sugar packets, paper towels, and put fresh trash bags in all bins.
- [ ] **Staging Presentation:** Fold towels into uniform rolls or stacks; neatly arrange couch pillows; place the welcome book/guide center-stage.

### From "12. Step-by-step procedure / 🧹 Phase 5: Floor Exit & Photo Proof"

- [ ] **Floor Care:** Vacuum and damp-mop all floors, working your way backward completely out of the front door.
- [ ] **Final Photo Wrap:** Take wide-angle photos of the bedroom, bathroom, and kitchen setups and text them to the property owner as proof of readiness.
  - Evidence: photo

> HOLD (Q-27-16): the delivery part of the step above ("text them to the property owner") is held until the owner and privacy owner decide the photo channels. Until then, capture the photos in the app, mapped to the bedroom, bathroom and kitchen; they stay on the job record and are never sent from a personal phone or account. Pending privacy owner review. (source: 31 section 10; 27 AUTH-034, PROPOSED; spec REC-002, QA-003; Q-31-12)

> HOLD (C-CL05-01): before leaving, after the steps above - verify that every entry door is locked and that any physical key or fob is back in its recorded place; report urgent maintenance and other exceptions to the host as section 17 describes. Do not leave the property unsecured: if it cannot be locked, stop and escalate (section 19). Treated as a critical hold: an acknowledgment does not clear it. Pending qualified review. (source: spec CL-05.SAF "verify lockup and urgent maintenance"; CL-05.QAC "property locked and host notified of exceptions"; 31 section 8.4 rule 3; 27 AUTH-009, PROPOSED)

## 4. Quality checks

### From "13. Quality checkpoints"

Observable checks from the spec card; the worker answers each check or records an exception (source: spec CL-05.QAC, QA-001). A worker's self-check does not replace a supervisor inspection where one is required (source: quality-assistant playbook).

| Check | Evidence | Source |
|---|---|---|
| Clean and reset per the host checklist | Checklist answered per room or area | Spec CL-05.QAC, CL-05.INT "host checklist", QA-001 |
| Linens and amenities | Beds made, towels staged and amenities restocked to the host's levels; shortages recorded | Spec CL-05.QAC, CL-05.INT "amenities/restock levels" |
| Documented damage | Damage photos and notes on the job record, internal-only by default | Spec CL-05.QAC, JOB-004, REC-002 |
| Staging standard | After photos mapped to rooms | Spec CL-05.QAC, QA-003 |
| Property locked | Lock-up confirmation recorded (hold at the end of section 12) | Spec CL-05.QAC, CL-05.SAF |
| Host notified of exceptions | Exception note logged on the job and sent through the approved channel (Q-27-16) | Spec CL-05.QAC, JOB-009 |

- Kitchen standard: undefined (C-CL05-V01); no kitchen check beyond the "Kitchen Check" step is added until the owner decides.
- The "zero stray hairs" (Phase 3) and "zero wrinkles" (Phase 4) wording in section 12 is an internal target, not a customer promise; it stays verbatim and is never repeated to hosts or guests as a guarantee (source: 31 section 3.5 rule 5).

## 5. Cleanup and waste handling

### From "14. Cleanup"

- Clean the area, remove waste, account for tools and materials, and restore anything altered within scope (source: spec APXA-005, QA-002).
- The exit sequence is the original Phase 5 "Floor Care" step (working backward out of the front door), followed by the lock-up hold at the end of section 12.
- Soiled linens stay separate from clean linens, as the inventory file's color-coded laundry bags intend (source: inventory file).
- Physical keys or fobs used for entry go back to their recorded place (source: 27 AUTH-009, PROPOSED: physical keys are custody items with an issue and return log).
  - Evidence: note

### From "15. Waste handling"

- Waste streams: household trash and recycling from the unit, used wipes and cleaning residue, and packaging; perishable guest food is not discarded while its step is held (C-CL05-10). Destination: the trash and recycling location the host provides, an intake item not yet defined (04 CL-05 customer preparation requirements); otherwise TBD — requires review by safety-liability-manager and a qualified person; owner to approve.
- Sharps and biohazard waste is not handled without an approved policy; disposal rules per municipality are an open question (source: 31 section 3.1; 29 section 8.2 control 10; Q-29-10).
- Hazardous waste is not handled without an approved policy (source: 31 section 3.1; 02 G-078).

## 6. Final checks, completion photos and walkthrough

### From "16. Photo requirements (before / during / after)"

All photos are captured in the app and kept on the job record, internal-only by default; they never show access codes, guests or other people, documents or valuables not needed for the work (source: spec REC-002, COM-002; 31 section 3.5 rule 7; 27 AUTH-034, PROPOSED).
- Before: damage and extreme-mess photos from the Phase 1 damage scan (source: spec START-008; original Phase 1).
- During: sharps, biohazard, damage or urgent maintenance found, with severity (source: spec JOB-004).
- After: wide-angle completion photos of the bedroom, bathroom and kitchen (original Phase 5), mapped to the room (source: spec QA-003).
  - Evidence: photo
- Delivery to the host: held until the owner and privacy owner decide the channels (Q-27-16, Q-31-12); once decided, shares go only through the app's share or message functions (source: 27 AUTH-034, PROPOSED).

### From "17. Customer communication"

- The customer is the host or property manager. Arrival and completion updates are drafts, and the worker or admin controls the send (source: spec UXE-008; agreement preamble).
- Exceptions - damage, missing or broken amenities, guest items left behind, urgent maintenance and any lock-up problem - are reported to the host through the approved channel and logged on the job (source: spec CL-05.QAC "host notified of exceptions", JOB-009; Q-27-16).
  - Evidence: note
- Guest communication is a candidate exclusion for the owner to decide (source: 04 CL-05 exclusions row).
- Never send access codes, incident details or internal notes by SMS or email (source: spec COM-002).
- No promises of review outcomes, completion times or absolute results to hosts or guests (source: 31 section 3.3 entry 8; 31 section 3.5 rule 5).
- Blocked work: use only the approved "work blocked" message (source: spec NTF-007).
- Walkthrough: where the host or a representative is present, record the outcome - accepted, accepted with punch items, unavailable or disputed (source: spec QA-004).
  - Evidence: note

### From "18. Completion criteria"

- Every check in section 13 is answered or has a recorded exception (source: spec QA-001).
  - Evidence: note
- The property is locked and the host is notified of exceptions (source: spec CL-05.SAF, CL-05.QAC).
- Damage is documented, and completion photos are captured in the app and mapped to rooms (source: spec CL-05.QAC, QA-003).
  - Evidence: photo, note
- No guest property was discarded without policy; items left behind are recorded (source: spec CL-05.SAF).
  - Evidence: note
- No access code appears in any note, photo or message (source: spec COM-002; 27 AUTH-009, PROPOSED).
- Cleanup is done and the walkthrough outcome is recorded (source: spec QA-002, QA-004).
  - Evidence: note
- Host-supplied restock and linens have their START-009 record (source: spec START-009).
  - Evidence: note
- Closeout: unresolved issues and incident or change follow-ups are submitted; the job closes only when the required operational and financial steps are complete (source: spec APXA-006, APXA-007).

## Stop-work triggers, escalation and incidents (service-specific)

### From "10. Stop-work conditions"

The general stop-work rule is [[FACT-SVC-STOP-WORK-RULE]]. Service-specific triggers:

Service-specific stop triggers and holds for CL-05 (pending qualified review):
- Card rule: "protect access codes; never discard guest property without policy; escalate biohazard/damage; verify lockup and urgent maintenance" (source: spec CL-05.SAF).
- HOLD (C-CL05-01): needles, sharps, blood or bodily fluids found or suspected in bedding, towels, bathrooms, drains, bins or trash - do not handle them; stop that task and escalate (section 19). Cleanup beyond policy is not performed (section 2) (source: spec CL-05.HAZ, CL-05.SAF; 31 section 10).
- HOLD (C-CL05-01): access codes are used only from the app's secured fields and are never written, photographed or sent (source: spec CL-05.SAF; COM-002; 27 AUTH-009, PROPOSED).
- HOLD (C-CL05-01): do not leave the property unlocked. If it cannot be secured, stop and escalate; this is treated as a critical hold, so an acknowledgment or a signature does not clear it (source: spec CL-05.SAF "verify lockup"; 31 section 8.4 rule 3).
- HOLD (C-CL05-01): damage or urgent maintenance found (for example an active leak or a lock that does not secure) - record it with photos and severity and escalate; do not repair it (source: spec CL-05.SAF; JOB-004).
- HOLD (C-CL05-10): no guest property, including perishable food, is discarded until the owner sets a guest-property policy (source: spec CL-05.SAF; 31 section 10).
- HOLD (Q-27-16): photo delivery by host portal or text message is held; photos stay in the app (source: 31 section 10; 27 AUTH-034, PROPOSED).
- Guests still in the unit at arrival: do not enter; record the late checkout and escalate (PROPOSED) (source: 31 section 10).
  - Evidence: note
- The agreement's completion window and any late-checkout delay never override a hold or the stop-work rule (C-CL05-02) (source: 31 section 10; master section 12).
- Extreme mess or extra work beyond the standard turnover: record it with photos; extra work only after an approved change order (source: spec FIN-008, JOB-005; original Phase 1 "Evidence Collection").
  - Evidence: note

### From "19. Escalation"

General path: [[FACT-SVC-ESCALATION-PATH]].

Service-specific (pending review):
- Biohazard, damage, urgent maintenance, a lock that does not secure, a missing key or fob, or guests still present: stop the affected task and escalate; the host is told only through the approved channel (Q-27-16) (source: spec CL-05.SAF, CL-05.QAC; COM-002).
- Emergency and escalation contacts and the escalation order are owner decisions not yet made (Q-31-05) (source: 31 section 8.5).

### From "20. Incident reporting"

General path: [[FACT-SVC-INCIDENT-REPORTING]].

Service-specific (pending review):
- A needle-stick or contact with blood or bodily fluids is reported on the incident form as an injury or exposure; first response follows the company's approved arrangements, which are not yet defined, and medical decisions belong to medical professionals (source: spec JOB-008; 31 section 8.5).
- Property damage caused during the turnover is reported as an incident; fault and liability are not discussed with the host (source: spec JOB-008; 31 section 8.5).
- Suspected exposure of an access code (seen, recorded, photographed or sent): TBD - requires privacy owner review (source: 31 section 5.8 credentials module).

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

- **Q-31-12** (owner; privacy owner): which channels may deliver job photos to hosts (links to Q-27-16)? Until answered, the delivery parts of "Evidence Collection" and "Final Photo Wrap" stay held.
- **Q-27-16** (owner; privacy owner; HUMAN REVIEW: attorney for agreement wording): in-app share or portal link only, or also uploads to a host's own portal or messages from a business number?
- **Q-30-17** (owner; HUMAN REVIEW: attorney): what are the rules for third-party property, including guest food and items guests leave behind? The "Kitchen Check" discard stays held until then.
- **Q-29-13** (owner): does the host or HandyHub buy and store restock items?
- **Q-31-01** (owner): who are the competent reviewers for this SOP (qualified safety professional for sharps and biohazard; privacy owner for codes and photos; attorney for the guest-property policy), and how is their competence evidenced?
- **Q-31-05** (owner): what are the emergency and escalation contacts and the escalation order for a two-person team?
- **Q-31-10** (owner; qualified mold assessor): what is the company definition of mold growth versus cleanable mildew in bathrooms?
- **Q-31-02** (owner): who is the qualified bilingual reviewer for the Spanish safety text?
- **31 section 10** (owner; qualified safety professional): confirm the PROPOSED rule that workers never enter while guests are present, and decide what "Luxury / Pool Property" includes.
- **02 C-CL05-12 and C-CL05-V01** (owner): which laundry model applies per host, and which kitchen tasks belong to a standard turnover?
- **04 CL-05 card** (owner): how many same-day turnovers can two employees take, and are the pricing file's time caps elapsed time or person-hours (completion-window rule, 31 section 10)?
