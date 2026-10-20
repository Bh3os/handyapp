---
id: SOP-PT-04
type: sop
title: "SOP PT-04: Wallpaper Removal & Surface Restoration"
status: active
area: field
links:
  part_of: ["[[SVC-PT-04]]", "[[S07]]"]
  decided_by: ["[[OWN-DEC-108]]", "[[OWN-DEC-109]]", "[[OWN-DEC-17]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]", "[[RULE-HUMAN-REVIEW]]", "[[RULE-NO-INVENTED-FACTS]]", "[[FACT-SVC-STOP-WORK-RULE]]"]
  uses: ["[[FACT-INVENTORY-PT-04]]", "[[FACT-SVC-PHOTO-MINIMUM]]", "[[FACT-SVC-ESCALATION-PATH]]", "[[FACT-SVC-INCIDENT-REPORTING]]"]
source: "vault Standard Of Operations/sop-wallpaper-removal.md; OWN-DEC-108"
---
Worker checklist for [[SVC-PT-04]] (Wallpaper Removal & Surface Restoration). Status: active for the job checklist under [[OWN-DEC-108]], pending competent review for production use ([[OWN-DEC-17]]). The vault file is a draft (`status: draft-not-field-approved`, `owner_approved: false`).

Source file: `Standard Of Operations/sop-wallpaper-removal.md`. Each group below names the source heading its steps come from, and every step keeps the vault wording (link targets removed). The original procedure is section 12; the other sections were added in the vault on 2026-10-03 from the spec and the SOP standard, pending review. HOLD, GATE and FLAG lines are review controls added on 2026-10-03, pending qualified review: a HOLD placed before a step must be cleared before that step starts. An "Evidence" line lists the photo, measurement or note that the step's own wording asks for; a step without one names none.

Required steps cannot be skipped ([[OWN-DEC-108]]); the completion sequence is [[OWN-DEC-109]] and the minimum photo rule is [[FACT-SVC-PHOTO-MINIMUM]]. Tools, materials and PPE: [[FACT-INVENTORY-PT-04]]. Safety gates: [[RULE-SAFETY-GATES]].

Section 12 phases listed under another stage because their heading names only that stage's work: Phase 1 to stage 1. All other phases stay in stage 3 in their original order.

## 1. Site preparation and property protection

### From "5. Customer and property preparation"

PROPOSED for owner approval; customer-facing wording goes through 30 and 32.
- Furniture, wall hangings and window treatments are moved away from the walls to be stripped (source: 04 PT-04 "customer preparation requirements", GAP).
- Children and pets are kept away from steam, chemicals and electrical boxes during the work (source: 04 PT-04; spec CX-005; X-11).
- Ventilation is possible where oil-based primer will be used (source: 04 PT-04; inventory "Oil-Based Stain-Blocking Primer"; ventilation per SDS).
- Running water is accessible on site (source: agreement "Running Hot Water" clause).
- Access is available for more than one visit because of the drying wait (source: 04 PT-04 "customer preparation requirements").
- The customer states the build year, if known, and any known leaks, past mold or other hazards (source: spec PT-04.INT "age"; 30 section 4.1 clause 5 "disclosures the customer is asked to make").
- The agreement's breaker-permission and power clause is under attorney and licensed-electrician review; it is not relied on to clear any electrical hold (source: 30 section 5 row 84; 30 section 3.2 rule 6).
- Every job re-confirms access, occupants, pets, parking, hazards and work-area conditions (source: spec CX-005).

### From "12. Step-by-step procedure / 🕒 Phase 1: Space Containment & Baseboard Masking"

- [ ] **Electrical Cut:** Turn off circuit breakers for wall outlets in the active room to prevent liquid shorts.

> HOLD (C-PT04-03): the step above is held. Who may switch breakers, and the isolation method, are pending licensed-electrician review; switching breakers alone is not a verified isolation. Before any wet or steam work near an outlet or switch box, the de-energized state is verified with an approved tester, by the method the licensed electrician approves; if it cannot be verified, STOP and escalate. Pending licensed-electrician and qualified safety review. (source: spec PT-04.SAF "protect/de-energize near outlets as appropriate"; 02 C-PT04-03; X-07; agreement "Active Electrical Isolation" clause, under attorney review)

- [ ] **Outlet Plugging:** Stuff wall electrical boxes with plastic bag scrapers and tape them shut tightly.

> HOLD (C-PT04-03): the step above is held. Nothing is placed inside an electrical box until a box-protection method is approved by a licensed electrician; no electrical procedure is written here. Pending licensed-electrician review. (source: 02 C-PT04-03; 31 section 10 PT-04)

- [ ] **Floor Protection:** Lay thick plastic sheeting along the floor edges, taping it securely over baseboards to catch sticky glue droplets and liquid runoff.

## 2. Setup and required measurements/checks

### From "3. Preconditions"

- This SOP is not active: no job uses it until competent review and owner activation (source: owner facts 2026-10-02; 31 section 2.1).
- An approved estimate version exists for the job, naming the walls, the finish level and whether any primer coat is included (source: spec CX-003, EST-005; spec PT-04.QAC "removed to agreed level", "primed if included"; C-PT04-06).
- Intake recorded: wallpaper type and layers, wall substrate, age, painted or unpainted wall, room area and desired finish (source: spec PT-04.INT).
  - Evidence: note
- Property age and older coatings: in a building built before 1978 or of unknown age, or where older joint compound or a coating is suspect, no scoring, scraping, scrubbing or sanding starts until a qualified person records a disposition. "A pre-1978 painted surface is not cleared by a customer saying it looks safe." (source: spec PT-04.SAF; 02 C-PT04-04; X-13; risk-triage playbook; Q-31-07).
  - Evidence: note
- Electrical isolation: no wet or steam work near an outlet or switch box until the isolation method approved by a licensed electrician is applied and the de-energized state is verified with an approved tester (source: spec PT-04.SAF "protect/de-energize near outlets as appropriate"; 02 C-PT04-03; X-07). The agreement's breaker-permission clause is under attorney and electrician review and does not replace this check.
- Steamer power: how the steamer is powered is pending licensed-electrician review; the agreement's "reachable junction box" wording is not a method (source: agreement "Active Electrical Isolation" clause; 02 C-PT04-03).
- Running water is available on site (source: agreement "Running Hot Water" clause).
- Access over more than one visit: walls dry completely after "Fresh Water Flush" before skim coating (source: original "Fresh Water Flush" step; 04 PT-04 "labor assumptions").
- Product labels and SDS for the stripper, adhesive remover, primer and compound are available and reviewed; a chemical product without a reviewed SDS is not carried to the job (source: 29 section 8.3, PROPOSED; X-09).
- Ladder work only under an approved height and access policy, which does not exist yet (source: spec PT-04.HAZ "ladder"; 02 G-005; X-12).
- Before leaving: confirm the correct job, customer, address and time; read the latest changes; review scope and exclusions; review hazards and safety; load critical tools, equipment and materials; check customer-supplied items; confirm required documents and approvals (source: spec APXA-001).
- Before starting: complete the required safety, PPE and site checks; confirm materials; acknowledge the SOP and hazards; start only when Ready or an authorized exception is documented (source: spec APXA-003, START-004).
  - Evidence: note

### From "11. Setup"

- On arrival: confirm the address, work area and contact; identify pets and occupants; inspect the actual site against the briefing; capture the required existing-condition photos; protect the work area; identify utilities and emergency constraints relevant to the task (source: spec APXA-002).
  - Evidence: photo
- Confirm that the site matches the briefing, or record the differences; material differences trigger Risk Triage or supervisor review (source: spec START-007).
  - Evidence: note
- Existing-condition photos of every wall to be stripped, including damage already present, before protection or work starts; the agreement's "Damage Disclaimer" depends on this evidence (source: spec START-008; X-02).
  - Evidence: photo
- Keep children and pets out of the work area (source: X-11; spec CX-005).
- Electrical isolation and box protection follow the holds in section 12, Phase 1; no wet or steam work starts until the de-energized state is verified (source: 02 C-PT04-03; X-07).
- Floor protection: the original "Floor Protection" step in section 12, Phase 1.
- The removal-method test comes before any scoring or saturation: section 12 hold before "Wall Scoring" (source: spec PT-04.SAF "test removal method"; 02 C-PT04-07).
- Ventilation set-up before any oil-based primer use, per the SDS: TBD - qualified safety reviewer (source: inventory "Oil-Based Stain-Blocking Primer"; 29 section 8.1).
- Ladder set-up only under an approved height and access policy: TBD (source: 02 G-005; X-12).
- Safety, PPE and site checks are complete and the SOP hazards acknowledged before starting (source: spec APXA-003, START-004).
  - Evidence: note

## 3. Service-specific work steps

### From "12. Step-by-step procedure" (introduction)

*Original procedure, verbatim and in its original order. HOLD and FLAG lines are added drafts pending qualified review (31 section 10). A hold placed before a step must be satisfied before that step starts; a hold or flag placed after a step limits or flags "the step above" (36 D-36-17).*

### From "12. Step-by-step procedure / 🪒 Phase 2: Perforation & Chemical Softening"

> HOLD (C-PT04-04): before "Wall Scoring" below, and before any scraping, scrubbing or sanding in the steps that follow, confirm the build year and the wall condition. Walls in a building built before 1978 or of unknown age, or suspect older joint compound, mean no disturbance until a qualified person records a disposition; STOP and escalate. Pending review by an EPA RRP-certified renovator and an accredited asbestos inspector. (source: spec PT-04.SAF "stop on suspect hazardous coating/material"; spec PT-04.INT "age, painted/unpainted wall"; 02 C-PT04-04; X-13; risk-triage playbook "A pre-1978 painted surface is not cleared by a customer saying it looks safe.")

> HOLD (C-PT04-07): before "Wall Scoring" below, run a test patch of the removal method and record the method decision (whether to score, how to apply the solution, whether steam is needed), with a photo. Pending owner and lead-technician review with the product instructions. (source: spec PT-04.SAF "test removal method"; spec PT-04.TLS "scorer only when appropriate"; 02 C-PT04-07 "test patch + method decision recorded")

- [ ] **Wall Scoring:** Use an ergonomic wallpaper scoring tool (like a Paper Tiger) to roll over the wallpaper using light pressure. Make circular patterns to puncture the outer vinyl layer *without piercing the drywall paper below*.

> FLAG (C-PT04-07): the step above is conditional: score only when appropriate, as the removal-method test decides; the card does not make scoring a default. Pending owner and lead-technician review. (source: spec PT-04.TLS "scorer only when appropriate"; 02 C-PT04-07)

- [ ] **Enzyme Mix:** Mix a warm water batch of professional enzyme-based wallpaper stripper (e.g., DIF brand) inside a clean garden pump sprayer.
- [ ] **Saturation Pass:** Spray the chemical solution generously over a 4x6 foot wall section. Allow the formula to absorb for 15 minutes to liquefy the old starched wheat paste beneath.

> FLAG (C-PT04-07): "generously" in the step above is in tension with the card's "avoid excessive saturation". Apply the solution per the product label, as the removal-method test decides; water or solution reaching an electrical box is a stop condition (section 10). The dwell time in the step above stays unchanged pending a label check. The same applies to the second spray in "Glue Stripping". Pending owner and lead-technician review. (source: spec PT-04.SAF "avoid excessive saturation"; 02 C-PT04-07 "per product label; avoid excessive saturation (spec)", "Dwell times unchanged pending label check")

### From "12. Step-by-step procedure / 💨 Phase 3: Steam Extraction & Damage-Free Scraping"

- [ ] **Steam Plate Apply:** If the glue is stubborn, hold a commercial wallpaper steam plate flat against the wet paper for 15-20 seconds to force moisture deep into the adhesive backing.
- [ ] **The Gentle Slide:** Use a wide, flexible, rounded-edge putty knife. Slide the blade under the softened paper seams at a shallow 15-degree angle. Fluidly lift the sheets away in large panels. *Never force or gouge the drywall.*

> HOLD (C-PT04-02): if suspected mold or moisture is found behind the paper lifted in the step above, STOP work on that wall, keep people and pets away, photograph it and escalate (JOB-004). Do not clean, scrape, remove or rebuild the affected material; the agreement's "paid change order" for reconstruction does not replace this stop. Pending review by a mold assessor and the qualified safety professional. (source: spec START-011 "suspect hazardous materials"; spec JOB-004; 02 C-PT04-02; X-06; 31 section 8.5 escalation step 1; Q-31-10)

### From "12. Step-by-step procedure / 🧼 Phase 4: Residual Glue Scraping & Wash"

- [ ] **Glue Stripping:** Spray the bare walls a second time with warm enzyme solution.
- [ ] **Scrubbing Grime:** Use a heavy-duty coarse abrasive sponge to scrub the walls down, pulling away sticky paste ribbons.
- [ ] **Fresh Water Flush:** Wipe down the bare walls using clean sponges and a bucket of pure warm water to remove all chemical residue. Let walls dry completely for 24 hours.

### From "12. Step-by-step procedure / ✨ Phase 5: Skim Coating & Final Sanding"

- [ ] **Torn Paper Seal:** If any minor brown drywall paper tore during removal, seal it immediately with an oil-based primer to prevent compound bubbling later.
- [ ] **Skim Coat Finish:** Apply a thin layer of lightweight joint compound (معجون) over rough spots, indents, and seams using a 10-inch or 12-inch taping knife.

> FLAG (C-PT04-11): the step above contains an Arabic word, kept verbatim as a legacy artifact; it is not a translation. Worker-facing text is English, with Spanish only through the reviewed translation workflow. Pending the owner's cleanup decision with the bilingual reviewer. (source: spec BIZ-002; owner facts 2026-10-02; 36 section 5.4 item 21)

- [ ] **Dustless Polish:** Sand the dry compound using 220-grit sponges or a HEPA dustless sander to leave a smooth Level 4 finish ready for interior primer.

> FLAG (C-PT04-04): "or a HEPA dustless sander" in the step above leaves dust capture optional; the dust-control method is pending qualified safety review, and the review may only strengthen it. The older-coating hold before "Wall Scoring" applies to sanding as well. (source: spec PT-04.SAF "control dust"; spec PT-04.TLS "sanding/HEPA vacuum"; 02 C-PT04-04)

> FLAG (X-26; C-PT04-06): "smooth Level 4 finish" in the step above has no shared definition or acceptance criteria yet, and the main plan's "flawless, paint-ready Level 4 finish" is not covered (section 2). Pending the owner's decision with an experienced drywall finisher. (source: 02 X-26, C-PT04-06)

> HOLD (C-PT04-03): the procedure above ends without restoring what Phase 1 altered. Before completion, anything placed in or over electrical boxes is removed and any circuit switched off is restored, by the method the licensed electrician approves; no restore procedure is written here. Pending licensed-electrician review. (source: spec APXA-005 "restore utilities/components altered within scope"; 02 C-PT04-03; X-07)

## 4. Quality checks

### From "13. Quality checkpoints"

| Check | Source | Evidence | Inspector |
|---|---|---|---|
| Wallpaper and adhesive removed to the agreed level | spec PT-04.QAC "wallpaper/adhesive removed to agreed level" | After photos per wall; the agreed level as recorded on the approved estimate (definition pending, X-26; C-PT04-06) | TBD - self-check or supervisor (Q-31-15) |
| Substrate repairs smooth | spec PT-04.QAC "substrate repairs smooth"; original "Dustless Polish" | Photo of the repaired areas; finish-level criteria pending (X-26) | TBD (Q-31-15) |
| Surface clean and dry, chemical residue removed | spec PT-04.QAC "surface clean/dry"; original "Fresh Water Flush" ("remove all chemical residue") | Check result recorded | TBD (Q-31-15) |
| Primed if included | spec PT-04.QAC "primed if included"; original "Torn Paper Seal" | Whether a primer coat is included is read from the approved estimate; spot seals of torn paper recorded | TBD (Q-31-15) |
| No unmanaged damage: every tear or gouge recorded with photos and either repaired within scope or raised for a change order | spec PT-04.QAC "no unmanaged damage"; original "The Gentle Slide" ("Never force or gouge the drywall."); spec FIN-008 | Tear and damage log with photos (04 PT-04 "completion evidence", PROPOSED) | TBD (Q-31-15) |
| Removal-method test recorded before scoring | spec PT-04.SAF "test removal method"; 02 C-PT04-07 | Test-patch photo and method decision | TBD (Q-31-15) |
| Electrical boxes cleared and circuits restored | spec APXA-005; 02 C-PT04-03 | Restore confirmation by the approved method | TBD - method by the licensed electrician |

- The job cannot be marked complete until each required check is answered or an exception is recorded (source: spec QA-001; AT-039).
  - Evidence: note
- A failed check becomes a punch item or an escalation; a worker's self-check does not replace a required supervisor inspection (source: handyhub-quality-assistant playbook).

## 5. Cleanup and waste handling

### From "14. Cleanup"

- Clean the area, remove protection, account for tools and materials, and restore utilities and components altered within scope (source: spec APXA-005, QA-002).
- Remove anything placed in or over electrical boxes and restore any circuit switched off, by the method the licensed electrician approves; record the restore (source: spec APXA-005; 02 C-PT04-03; X-07).
  - Evidence: note
- Lift the floor sheeting and tape together with the wet paper, adhesive residue and sanding dust they hold; the dust-capture method is pending safety review (source: original "Floor Protection"; spec QA-002; spec PT-04.SAF "control dust").
- Take cleanup photos where they are required for dusty or messy work (source: spec QA-002).
  - Evidence: photo

### From "15. Waste handling"

TBD — requires review by safety-liability-manager and a qualified person; owner to approve.
- Waste streams to classify: wet wallpaper; adhesive residue and wash water; joint compound scraps and sanding dust; rags and applicators wet with oil-based primer; used sheeting and tape. Destination and who pays are owner decisions (source: original steps in section 12; 31 section 3.1; 02 G-078; Q-29-10).
- Rags and applicators wet with oil-based primer are handled per the primer SDS; no method is set here (source: 29 section 8.1; X-09).
- Waste from suspect hazardous coatings or compound is not handled without an approved policy (source: 31 section 3.1; spec START-011).

## 6. Final checks, completion photos and walkthrough

### From "16. Photo requirements (before / during / after)"

- Before: every wall to be stripped, including damage already present, and the electrical boxes as found (source: spec START-008, APXA-002, APXA-005; X-02).
- During: the removal-method test and its result (section 12 hold, C-PT04-07); every tear or gouge in the drywall paper, for the damage log (source: spec PT-04.QAC "no unmanaged damage"); any suspected mold, moisture or other concealed condition (source: spec JOB-004; 02 C-PT04-02).
  - Evidence: note
- After: each wall after the final step, mapped to its work area (source: spec QA-003); the restored electrical boxes (source: spec APXA-005); cleanup where required (source: spec QA-002).
- Photos are internal-only by default and avoid people, documents and valuables not needed for the work (source: spec REC-002; 31 section 3.5 rule 7).
- The required photo set, and whether Start Job is blocked without it: TBD - owner (source: spec START-008).

### From "17. Customer communication"

- Arrival and completion updates use approved templates only; until approved they are drafts (source: 31 section 3.1).
- Before work starts, confirm the agreed walls and finish level with the customer, only as needed, and record the result of the removal-method test (source: spec APXA-003; spec PT-04.QAC "removed to agreed level"; 02 C-PT04-07).
  - Evidence: note
- If the glue needs another method, or tearing goes beyond minor tears, tell the customer before any added work; no price changes without a change order that the customer approves (source: spec FIN-008, JOB-005; pricing "Hourly Safe-Fallback Rate" and "Unprimed Drywall Fine" lines, under review).
- Suspected mold, a suspect older coating or an electrical problem: use only the approved "work blocked" message; never send incident details or access codes by text or email (source: spec NTF-007, COM-002).
- Do not repeat "damage-free", "flawless", "completely eradicate ... preventing future paint bubbling or peeling flaws" or any finish, safety or health promise (source: main plan section 4; 02 C-PT04-05, C-PT04-06; Do-not-perform entry 8).
- Primer and paint are applied under separate agreements; do not promise how later painting will turn out (source: agreement "Payment Due" clause).
- Walkthrough: record accepted, accepted with punch items, unavailable or disputed (source: spec QA-004, APXA-006).
  - Evidence: note
- Explain the invoice and payment next step without unauthorized promises (source: spec APXA-006).

### From "18. Completion criteria"

- Every section 13 check is answered with evidence, or an exception is recorded (source: spec QA-001, AT-039).
  - Evidence: note
- After photos are captured and mapped to the work (source: spec QA-003).
  - Evidence: photo
- Cleanup is done, protection removed, and tools and materials accounted for (source: spec QA-002, APXA-005).
- Anything placed in or over electrical boxes is removed and any circuit switched off is restored by the approved method (source: spec APXA-005; 02 C-PT04-03).
- The tear and damage log is complete, and every tear is repaired within scope or raised for a change order (source: spec PT-04.QAC "no unmanaged damage"; spec FIN-008).
  - Evidence: note
- The property is left secured (source: 31 section 3.1).
- The walkthrough outcome is recorded (source: spec QA-004, APXA-006).
  - Evidence: note
- No hold from sections 10 and 12 is open, and unresolved issues, incidents and change requests are submitted before the job closes (source: spec APXA-007, JOB-012).

## Stop-work triggers, escalation and incidents (service-specific)

### From "10. Stop-work conditions"

The general stop-work rule is [[FACT-SVC-STOP-WORK-RULE]]. Service-specific triggers:

PT-04 stop triggers (spec PT-04.SAF first, then the register holds; all pending qualified review):
- Suspect hazardous coating or material: walls in a building built before 1978 or of unknown age with no recorded disposition, or suspect older joint compound (source: spec PT-04.SAF "stop on suspect hazardous coating/material"; 02 C-PT04-04; X-13).
- Suspected mold or moisture behind removed paper: stop, photograph, escalate (source: spec JOB-004; 02 C-PT04-02; X-06).
- Electrical isolation not approved or not verified with an approved tester, water or solution reaching an electrical box, or exposed or damaged wiring (source: spec PT-04.SAF "protect/de-energize near outlets as appropriate"; 02 C-PT04-03; X-07).
- No approved power source for the steamer (source: 02 C-PT04-03).
- The removal method has not been tested, or the test shows that it damages the substrate (source: spec PT-04.SAF "test removal method"; 02 C-PT04-07).
- Saturation beyond what the product label and the method test allow (source: spec PT-04.SAF "avoid excessive saturation"; 02 C-PT04-07).
- Dust that cannot be controlled (source: spec PT-04.SAF "control dust").
- Tearing of the drywall paper face beyond minor tears: stop, photograph and record; any added repair or price goes through a change order that the customer approves before the work; the threshold is an owner decision (source: spec JOB-004, FIN-008, JOB-005; pricing "Unprimed Drywall Fine" line, under review).
  - Evidence: note
- Ladder work needed with no approved height and access policy (source: 02 G-005; X-12).
- A chemical product without a reviewed SDS or label (source: 29 section 8.3; X-09).
- Each hold names the role and the evidence that clear it: TBD - requires qualified safety reviewer review. Critical holds clear only with a recorded qualified assessment (source: 31 section 8.3).
  - Evidence: note

### From "19. Escalation"

General path: [[FACT-SVC-ESCALATION-PATH]].

PT-04 routes (contacts are owner decisions, Q-31-05):
- Electrical: the isolation cannot be verified, water reaches a box, or wiring is exposed or damaged: stop; the office refers it to a licensed electrician (02 C-PT04-03).
- Suspect older coating or compound: stop; the owner arranges assessment by an EPA RRP-certified renovator or an accredited asbestos inspector, per the owner's policy (02 C-PT04-04; Q-31-07; Q-30-18).
- Suspected mold or moisture: stop; assessment by a mold assessor; the referral path is an owner decision (02 C-PT04-02; Q-31-10).
- Tearing beyond minor tears, or a different removal method needed: stop that task; the owner or the estimator prepares a change order before any added work (spec FIN-008, JOB-005).

### From "20. Incident reporting"

General path: [[FACT-SVC-INCIDENT-REPORTING]].

- PT-04 examples: a steam or hot-water burn, an electrical shock or short, a chemical splash or exposure, a slip on wet sheeting, water damage to floors or other property, and a ladder incident (source: spec JOB-008; spec PT-04.HAZ).

## Spanish translation status (section 22)

| Field | Value |
|---|---|
| Spanish version | Not started |
| Source English version | None yet; no `sop_version` is assigned (31 section 3.2, Tier B) |
| Translator (role) | `<owner decision>`; an AI draft is allowed only when marked `Draft - unreviewed` (COM-006) |
| Bilingual reviewer (role) | `<owner decision: qualified bilingual reviewer>` (Q-31-02) |
| Safety glossary version | None exists yet (GAP; HND-006) |
| Last review | Not reviewed |
| Notes | English source text, except one Arabic word in the "Skim Coat Finish" step, kept verbatim and flagged (C-PT04-11); it is not a translation |

## Open questions in the source SOP

- **Q-31-07** (owner; EPA RRP-certified renovator; accredited asbestos inspector): which property-age thresholds trigger lead and asbestos screening for PT-04, and does HandyHub hold or plan EPA RRP certification?
- **Q-31-10** (owner; qualified mold assessor): what is the company definition of mold growth versus cleanable mildew, and what is the stop rule for staining found behind removed paper?
- C-PT04-03 in 02 (licensed electrician; owner): may workers switch breakers, which box-protection, verification and restore method applies, and how is the steamer powered?
- C-PT04-06 in 02 (owner; drywall finishing lead): spot touch-up or full skim, which acceptance criteria apply, and where does DW-01 drywall repair begin?
- Related: **Q-31-05** (owner) emergency and escalation contacts for sections 19 and 20; **Q-31-09** (owner; qualified safety professional) the height and access policy; **Q-31-15** (owner) which QA checks need a supervisor rather than a self-check; **Q-31-16** (owner; attorney) who approves replacement wording for the "damage-free" statement; **Q-31-02** (owner) the qualified bilingual reviewer.
