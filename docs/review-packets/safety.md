# Review packet: safety reviewer

Prepared 2026-10-22 by TSK-0143 for OWN-DEC-186. Status: waiting for review. Nothing in this packet certifies any procedure, site or worker as safe; every item is a question or a sign-off for you.

## 1. Who this is for
A qualified safety professional, with an experienced tradesperson for the trade-specific steps (OWN-DEC-17). The owner first asked for an AI expert check; "an AI check does not replace the competent review the vault requires" (OQ-SAFETY-REVIEW). OSHA, structural, licensed electrical, plumbing, HVAC and gas work, hazardous materials (asbestos, lead, mold) and injury are human-review boundaries (RULE-HUMAN-REVIEW). Wording that also reaches customers (the "Work we don't do" limits) goes to the attorney too ([attorney.md](attorney.md) A-09).

## 2. What HandyHub is (from the knowledge graph)
- FACT: a residential home-services business (brand HandyHub of ODD JOBS & MORE LLC, Kentucky, FACT-LEGAL-ENTITY) with 26 services in cleaning, drywall, painting and home improvement (OWN-DEC-04), all in the launch set (OWN-DEC-33), in eleven counties of Kentucky and Southern Indiana (FACT-SERVICE-AREA).
- FACT: initially two employees; the owner also works in the field; subcontractors later, trained by the owner on each service's safety procedure as paid time (OWN-DEC-05, OWN-DEC-28, OQ-SUBCONTRACTOR-POLICY). Staff use English or Spanish; customer output is English (OWN-DEC-79).
- FACT: visits every day, 8 AM–10 PM (FACT-HOURS). Lone work: no interval check-ins; a worker alone records only Arrived and Finished (OWN-DEC-149).
- FACT: never performed, in any of the 26 services: licensed gas, electrical (line-voltage), plumbing or HVAC work, structural work, and hazardous-material work (asbestos, lead, mold) (FACT-SVC-EXCLUDED-SCOPE, RULE-HUMAN-REVIEW). The software gives no procedure for them: "Licensed-trade and hazardous work gets no procedure and routes to a hold" (OWN-DEC-108).
- FACT: access equipment: ladders only, no roof-edge work (FACT-SVC-ACCESS-EQUIPMENT). Eight higher-risk tasks are referred out: joist sistering, fixture boxing, biocide fogging, appliance pull-out, gas burner-port clearing, acid grout-haze removal, mounting over fireplaces, roof-edge gutter guards (FACT-SVC-REFER-OUT-TASKS).
- FACT: the software runs only on private staging with synthetic data until the owner's go decision (OWN-DEC-191). On staging the job checklist may run on SOP versions pending review, under a "Pending competent review" banner; production needs your sign-off (OWN-DEC-108).

## 3. Materials to review
| Material | Where |
| --- | --- |
| Each SOP version as workers see it: the six checklist stages, its HOLD, GATE and FLAG controls (the hazard checks), its stop-work, escalation and incident section, and its open questions | staging staff app: a job packet's SOP checklist, and the SOP sign-off screen; repository `packages/db/seed/sops.json` (generated from the `SOP-*` nodes by `tools/import-sops.mjs`) |
| The original vault SOP files (all `status: draft-not-field-approved`, `owner_approved: false`) | repository `sources/vault/Standard Of Operations/` (frozen) |
| Rules common to every service | nodes FACT-SVC-STOP-WORK-RULE, FACT-SVC-ESCALATION-PATH, FACT-SVC-INCIDENT-REPORTING, FACT-SVC-SUSPECTED-HAZMAT, FACT-SVC-HOME-AGE-LIMITS, FACT-SVC-EXCLUDED-SCOPE |
| Hold rules | nodes ENT-Hold, HH-WORK-02, HH-WORK-09, HH-INC-03, OWN-DEC-38, OWN-DEC-137 |
| Spanish staff text | repository `packages/i18n/src/catalogs/staff.es.json` (with `staff.en.json`) |

Staging access (link and a tester sign-in) comes from the owner separately.

## 4. The 26 SOP versions pending competent review
Every version below was imported verbatim from its `SOP-*` node in state `pending_competent_review`, with Spanish status `pending` (no Spanish SOP text exists yet, TSK-0103). Digests are the first 12 hex characters of the SHA-256 the database stores for the content and for the hazard checks (the HOLD, GATE and FLAG controls plus the stop-work section); the staff app shows the full digests and the version number on each packet (migration 0050). A sign-off covers that exact version: any later change of content is a new version, pending again.

| SOP | SOP title | Vault source file | Content | Hazard checks | HOLD/GATE/FLAG controls | Stop-work section items | Open questions | Review state | Spanish |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SOP-CL-01 | Routine House Cleaning | `Standard Of Operations/sop Routine Cleaning Checklist.md` | `85e0103b9b95` | `f79e11fbafb1` | 10 | 11 | 9 | pending competent review | pending |
| SOP-CL-02 | Elite Deep Cleaning Service | `Standard Of Operations/sop Deep Cleaning CheckList.md` | `9d822eea4119` | `7c72aab6fd84` | 20 | 11 | 10 | pending competent review | pending |
| SOP-CL-03 | Move-In & Move-Out Cleaning | `Standard Of Operations/sop Move-In and Move-Out Cleaning Checklist.md` | `7a52d2f078c5` | `a3a134af8b7e` | 17 | 11 | 12 | pending competent review | pending |
| SOP-CL-04 | Post-Construction & Post-Renovation Cleaning | `Standard Of Operations/sop Post-Construction Cleaning Checklist.md` | `747875b068b0` | `0fa680505f3d` | 18 | 23 | 13 | pending competent review | pending |
| SOP-CL-05 | Airbnb Turnover & Vacation Rental Management | `Standard Of Operations/sop Airbnb Cleaning and Turnover Checklist.md` | `3aab1c47afe8` | `b898ac8cfedd` | 14 | 21 | 11 | pending competent review | pending |
| SOP-CL-06 | Hotel-Style Luxury Housekeeping | `Standard Of Operations/sop Hotel-Style Housekeeping Checklist.md` | `a2679eb5aaf0` | `44b19b7a8c2d` | 14 | 25 | 11 | pending competent review | pending |
| SOP-CL-07 | Air Duct & Ventilation Cleaning | `Standard Of Operations/sop Air Duct and Vent Cleaning Checklist.md` | `8bb56f382be4` | `132ad24de611` | 16 | 11 | 10 | pending competent review | pending |
| SOP-DW-01 | Professional Patching, Repair & Handyman Services | `Standard Of Operations/sop drywall-patching.md` | `794f590093d7` | `bcdd38b3268b` | 16 | 20 | 12 | pending competent review | pending |
| SOP-DW-02 | Texture Matching & Popcorn Ceiling Removal | `Standard Of Operations/sop popcorn-removal.md` | `259ba2efb6f1` | `a39897022ab2` | 16 | 21 | 15 | pending competent review | pending |
| SOP-DW-03 | Residential Remodeling & Home Additions | `Standard Of Operations/sop drywall-remodeling.md` | `f115b098e3c9` | `2b5c302b9772` | 15 | 20 | 14 | pending competent review | pending |
| SOP-DW-04 | High-Volume Residential New Construction | `Standard Of Operations/sop new-construction.md` | `0b55b3d2c92e` | `14a7a25a8c70` | 11 | 23 | 10 | pending competent review | pending |
| SOP-HI-01 | Precision Picture Hanging & Art Installation | `Standard Of Operations/sop-picture-hanging.md` | `906d10dc6dcf` | `ee141f1d516f` | 13 | 15 | 10 | pending competent review | pending |
| SOP-HI-02 | Deep-Clean Barbecue & Grill Maintenance | `Standard Of Operations/sop-grill-cleaning.md` | `88150713d094` | `b3bb0874ee76` | 10 | 11 | 7 | pending competent review | pending |
| SOP-HI-03 | Driveway Pressure Washing & Surface Restoration | `Standard Of Operations/sop-driveway-cleaning.md` | `18abeba25777` | `a1310381a616` | 12 | 19 | 9 | pending competent review | pending |
| SOP-HI-04 | Professional TV Wall Mounting & Wire Hiding | `Standard Of Operations/sop-tv-mounting.md` | `63a77f1c8d9f` | `8e897b7f6299` | 9 | 21 | 4 | pending competent review | pending |
| SOP-HI-05 | Door Hardware & Smart Lock Installation | `Standard Of Operations/sop-smart-locks.md` | `ecdf509dc3c6` | `39525264f504` | 6 | 14 | 7 | pending competent review | pending |
| SOP-HI-06 | Gutter Maintenance & Leaf Protection | `Standard Of Operations/sop-gutter-maintenance.md` | `4d359a8b240d` | `a8a3050fed51` | 7 | 18 | 7 | pending competent review | pending |
| SOP-HI-07 | Attic Insulation Upgrades | `Standard Of Operations/sop-attic-insulation.md` | `73e8f321ec89` | `33e696e9d98e` | 5 | 19 | 13 | pending competent review | pending |
| SOP-HI-08 | Closet & Shelving System Installation | `Standard Of Operations/sop-closet-shelving.md` | `746e0b386e70` | `ad091700ae7f` | 7 | 14 | 13 | pending competent review | pending |
| SOP-HI-09 | Custom Trim & Architectural Molding Installation | `Standard Of Operations/sop-trim-molding.md` | `c92dc9cba7e8` | `9cbc36cf3d18` | 12 | 14 | 15 | pending competent review | pending |
| SOP-HI-10 | Structural Fence Maintenance & Structural Repairs | `Standard Of Operations/sop-fence-repair.md` | `46059fe17019` | `76ea33080be6` | 9 | 22 | 9 | pending competent review | pending |
| SOP-HI-11 | Structural Deck Maintenance & Deck Board Repairs | `Standard Of Operations/sop-deck-repair.md` | `906172fd0ec3` | `6d6a4e78e1a5` | 8 | 22 | 11 | pending competent review | pending |
| SOP-PT-01 | Professional Residential Interior Painting | `Standard Of Operations/sop-interior-painting.md` | `7e77925901f9` | `5e19171719cf` | 9 | 22 | 4 | pending competent review | pending |
| SOP-PT-02 | Outdoor Deck & Fence Staining and Sealing | `Standard Of Operations/sop-deck-staining.md` | `0629e93bd4ef` | `b221e3d4f15c` | 16 | 23 | 12 | pending competent review | pending |
| SOP-PT-03 | Brick Limewashing & Elastomeric Masonry Coatings | `Standard Of Operations/sop-brick-limewashing.md` | `ede9e11fe374` | `834a43b1f128` | 17 | 22 | 12 | pending competent review | pending |
| SOP-PT-04 | Wallpaper Removal & Surface Restoration | `Standard Of Operations/sop-wallpaper-removal.md` | `0cf5e49f04ec` | `bbf7ae060057` | 11 | 21 | 5 | pending competent review | pending |

Common to all 26 (FACT-SVC-ESCALATION-PATH, FACT-SVC-INCIDENT-REPORTING): section 19 (escalation) and section 20 (incident reporting) have the same text in every SOP; section 10 (stop-work rule) has the same text in 22 SOPs, and SOP-DW-04, SOP-HI-06, SOP-HI-10 and SOP-HI-11 word it differently and keep their own text (FACT-SVC-STOP-WORK-RULE). "HOLD, GATE and FLAG lines are review controls added on 2026-10-03, pending qualified review: a HOLD placed before a step must be cleared before that step starts." (SOP-HI-01). Some holds wait for policies only you can set, for example "an approved height and access policy (ladder setup, inspection and fall controls, selected by the qualified safety professional)" (FACT-SVC-ACCESS-EQUIPMENT).

## 5. Questions and items for review

### S-01 Competent review of each SOP version
- **Question:** for each of the 26 versions in section 4, is the procedure acceptable for real work as written, or what must change (task-specific manufacturer instructions, hazards, qualifications, applicable requirements, emergency arrangements, Spanish translation, per OWN-DEC-17)? Who reviewed each one, with what qualification?
- **Unblocks:** OQ-SAFETY-REVIEW, OWN-DEC-17, OWN-DEC-108, OWN-DEC-33, HH-PKT-03, the 26 `SOP-*` nodes.
- **Current rule:** "No field SOP becomes active for real work before competent review"; "An unknown condition is treated as unsafe: gate checks fail closed." (OWN-DEC-17). In production a work package whose pinned version is not approved "cannot become ready" (migration 0050, `sop.pendingReview.productionBlocked`). The owner records your sign-off in the staff app on the exact version: reviewer name, qualification and what was reviewed; it is kept as entered and never changed.
- **Launch gate:** PRODUCTION, per service: no real job of a service starts until its version is signed off.

### S-02 Hazard templates: the HOLD, GATE and FLAG controls
- **Question:** are the controls of each SOP (count in section 4) the right ones, are any missing, and which policy should fill the holds that wait for one (height and access policy, first-response arrangements, PPE)? Which controls may only a qualified person clear?
- **Unblocks:** OQ-SAFETY-REVIEW, OWN-DEC-108, FACT-SVC-ACCESS-EQUIPMENT.
- **Launch gate:** PRODUCTION, per service (with S-01).

### S-03 The stop-work rule and stop-work rights
- **Question:** is the stop-work rule below complete and correctly worded? Should the non-retaliation promise be written into the rule text?
- **Unblocks:** FACT-SVC-STOP-WORK-RULE, HH-WORK-09, RULE-SAFETY-GATES.
- **Current text (section 10 of 22 SOPs, PROPOSED wording):**
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
- **Decided rights:** owner, 2026-10-05: "Should the safety procedures promise that nobody is punished for stopping work for safety reasons?" = "Yes (Recommended)". "Stop Work and Report Hazard are available on every screen of an active job, to every assigned worker, online or offline. Stopping needs nobody's permission." (HH-WORK-09). No role, flag, setting or AI can bypass or weaken the Start Job gate, stop-work rights or critical holds (RULE-SAFETY-GATES).
- **Launch gate:** PRODUCTION (part of every SOP version).

### S-04 Escalation procedure: owner first, 911 immediately for emergencies
- **Question:** is the procedure below adequate for every service, and how should it be reconciled with section 19 of the SOPs (which is still PROPOSED wording)?
- **Unblocks:** OWN-DEC-172, FACT-SVC-ESCALATION-PATH, HH-PKT-09, HH-WORK-13, TSK-0129.
- **Decided procedure (OWN-DEC-172, owner's wording):**
  > For all non-life-threatening problems, employees must stop the affected work, make the area safe if they can do so without risk, and contact the Owner first.
  >
  > Employees must call 911 immediately without waiting for Owner approval if there is an actual or reasonably suspected immediate threat to life or serious injury, including serious medical emergencies, fire, dangerous gas leaks, or other imminent hazards.
  >
  > Employees must never delay emergency assistance to obtain permission.
  >
  > Notify the Owner as soon as it is safe.

  Owner unreachable and no emergency: the affected work stays paused, the area is secured if safe and the problem is documented; if it becomes dangerous, call 911. Every job packet shows "Call Owner — Report a Problem" and "Call 911 — Immediate Emergency"; Call 911 always works without a network (HH-PKT-09). Owner decisions "cannot override mandatory legal requirements, emergency procedures, employee safety protections, or worker qualification restrictions."
- **Section 19 of every SOP (PROPOSED, pending qualified review), first two steps:** "1. Stop the affected work and keep yourself, occupants and pets away from the hazard; do not try to fix, move or disturb it" and "2. Emergency (fire, gas odor, injury, electrical contact, structural movement): call emergency services first, then `<owner decision: emergency contact>`". OWN-DEC-172 fills the two placeholders (911 for emergencies, then the owner; the owner's number is read from the owner's staff profile and is never in the repository).
- **Also review:** after a non-critical stop clearly ends (storm passed, dog secured), the owner answered that the "Lead worker on site" decides to resume (FACT-SVC-ESCALATION-PATH); critical holds clear only with a recorded qualified assessment.
- **Launch gate:** PRODUCTION (every job packet).

### S-05 Emergencies: gas leaks and exposed wiring
- **Question:** is the guidance below correct and sufficient?
- **Unblocks:** OWN-DEC-80, HH-WORK-13.
- **Current rule (HH-WORK-13):** "A suspected gas leak shows: evacuate immediately and contact emergency services or the gas utility from a safe location. Workers never attempt gas repairs." "Exposed, potentially live wiring is never handled by the worker." Both create a critical hold in the same transaction as the report and never offer a resolve-on-site option. "Emergency action never waits for the Owner or for the app." A worker may resolve a problem without the owner only within their training, qualifications, approved scope and approved SOP, with no unresolved safety hold (OWN-DEC-80).
- **Launch gate:** PRODUCTION.

### S-06 Hold release and void rules
- **Question:** are the release and void rules below adequate? In particular: who counts as a "qualified assessor" for each hold kind; is the stuck owner-raised critical hold (RISK below) acceptable until a second administrator exists; and is a second person's confirmation enough for voiding a critical hold entered in error?
- **Unblocks:** OQ-SAFETY-REVIEW ("the hold release and void rules"), OWN-DEC-38, OWN-DEC-137, ENT-Hold, HH-WORK-02, HH-INC-03.
- **Current rules:**
  - A critical hold is written in the same database transaction as the hazard report, under the job lock; starting work always needs an online readiness check, and offline use can never skip a hold (RULE-SAFETY-GATES).
  - Kinds: critical safety hold (hazard report, gas leak, live wiring, hazardous material, structural, licensed-trade scope); job-level Hold / Ready with a note for unresolved requirements. States `open → under_review → resolved / canceled_as_error` (ENT-Hold).
  - "A checkbox, acknowledgment, customer signature, timer, AI output or generic Owner override can never clear an unverified hazardous condition, an unavailable critical control, or a legal or competence requirement." A critical hold is released only "with recorded resolution evidence and the reviewer who assessed it (a qualified person where the hazard needs one)" (HH-WORK-02).
  - "Nobody, of any role, releases a hold they raised. A hold is released only by an administrator with a fresh sign-in, a reason, the evidence and the qualified assessor's qualification." (OWN-DEC-38). Since OWN-DEC-137 the self-release ban applies to critical safety holds only; the owner can set Ready on any job-level Hold / Ready note, including one the owner set.
  - Void: "Voiding a hold (entered in error only) needs, for a critical hold, a second person's confirmation where one exists." (OWN-DEC-38).
  - Resuming: "the hold resolved with evidence by someone with the authority the hold names (never the person who raised it); refreshed scope or SOP where needed; a new packet version; each worker's new review; and the Start Work gate passing again online." "Resolving an app flag is never a certification that the site is safe or a legal conclusion, and the app never says so." (HH-INC-03).
  - RISK (OWN-DEC-38): with one administrator, "a hold the owner raises cannot be released until a second administrator exists, so that job stays blocked." The remedy is a new owner decision creating a second administrator, never a weaker rule.
- **Launch gate:** PRODUCTION.

### S-07 The three Start Work administrative exceptions
- **Question:** confirm that the boundary below is safe: only three administrative requirements may be excepted, and nothing safety-related.
- **Unblocks:** OWN-DEC-68 ("A qualified safety professional's confirmation of this boundary before production").
- **Current rule (OWN-DEC-68):** (1) customer not present, when the scope is approved and unattended access explicitly authorized, access instructions confirmed and a contact available; "The worker still completes the site inspection and safety checks; only the customer walkthrough may be deferred"; (2) before-photos captured but the upload failed; (3) deposit paid but bookkeeping pending, independently verified. "Safety, legal, qualification, approved scope, work authorization and access permission can never be waived."
- **Launch gate:** PRODUCTION.

### S-08 Hazardous materials and home-age screening
- **Question:** are the screening limits and the stop rule below adequate, and are they the right trigger for each affected service?
- **Unblocks:** FACT-SVC-SUSPECTED-HAZMAT, FACT-SVC-HOME-AGE-LIMITS, OWN-DEC-66.
- **Current rules:** "when a worker suspects asbestos, lead or mold, the affected work stops (fixed rule) and the job is cancelled with a refund; HandyHub does no sampling or testing." No paint-disturbing work in homes built before 1978 on HI-09, DW-01, DW-02, DW-03, PT-01, PT-02, PT-03 and PT-04; popcorn removal (DW-02) only in homes built in 1981 or later; an unknown year is not treated as safe (the customer looks it up first). "These are screening limits, not legal determinations". RISK: the DW-02 vault files still name 1980; the owner's 1981 limit governs. Customers are never asked to inspect hazards or to do hazardous preparation (OWN-DEC-98, OWN-DEC-84).
- **Launch gate:** PRODUCTION (affected services).

### S-09 Work HandyHub never performs, and the limits wording
- **Question:** is the list below complete for the 26 services, and is the field wording of each service's "Do not perform" list (quoted in its `SVC-*` node, PROPOSED) and the website's "Work we don't do" text correct? Where exactly is the boundary for SVC-HI-10 "Fence Maintenance & Structural Repairs" and SVC-HI-11 "Deck Maintenance & Board Repairs", given that structural work is never performed?
- **Unblocks:** FACT-SVC-EXCLUDED-SCOPE, OWN-DEC-51, FACT-SVC-REFER-OUT-TASKS.
- **Never performed (FACT-SVC-EXCLUDED-SCOPE):** licensed gas work; licensed electrical (line-voltage) work; licensed plumbing; licensed HVAC; structural work; hazardous-material work (asbestos, lead, mold). Workers never attempt gas repairs or handle exposed, potentially live wiring (OWN-DEC-80). The staff app says so in English and Spanish (`sop.humanReview.body`, section S-12).
- **Launch gate:** PRODUCTION (per service, with S-01).

### S-10 Incident reporting and first response
- **Question:** is the incident text below adequate, and what first-response (first-aid) arrangements should the company approve? They are "not yet defined; pending qualified safety review".
- **Unblocks:** FACT-SVC-INCIDENT-REPORTING, OWN-DEC-124, HH-INC-01.
- **Current text (section 20 of all 26 SOPs, PROPOSED):** "Report every injury, property damage, near miss, customer conflict, tool or equipment failure and suspected hazardous-material exposure on the incident form"; "An injured person comes first: call emergency services; give only the first aid that the company's approved first-response arrangements cover (not yet defined; pending qualified safety review); medical decisions belong to emergency services and medical professionals"; "Do not guess causes or discuss fault or liability with the customer; refer those questions to the owner"; "Keep injury and medical details out of customer-visible notes and messages"; "Report as soon as it is safe and before the job is closed."
- **Launch gate:** PRODUCTION.

### S-11 Lone work
- **Question:** is "Only at arrive and finish" (OWN-DEC-149) acceptable for a worker alone on a job, or which services or conditions need more?
- **Unblocks:** OWN-DEC-149, FACT-SVC-ESCALATION-PATH. An answer that asks for more becomes a new owner decision.
- **Launch gate:** NONE STATED.

### S-12 Spanish safety text
- **Question:** is the Spanish text below accurate and unambiguous for workers? Do you want a human review record added to the Spanish safety versions (OWN-DEC-79 allows it as an optional, separate status)?
- **Unblocks:** OWN-DEC-172 item 6, OWN-DEC-79, HH-LANG-04, HH-PKT-04, HH-PKT-09, TSK-0103.
- **Policy (OWN-DEC-79):** Spanish safety text is translated during development and released as "AI-reviewed" only after a separate comparison against the approved English version (warnings, PPE, prohibited actions, measurements, step order, stop-work conditions); it is never labelled "human-reviewed" or "safety-certified"; a failed check keeps that procedure pending and "the affected work stays blocked" for Spanish-reading workers. A new English version invalidates the Spanish release.
- **Items to review:**
  1. The owner's Spanish escalation instruction, shown exactly as given in the Spanish staff portal (OWN-DEC-172 item 6): "Si ocurre un problema, detén el trabajo afectado y llama primero al propietario para recibir instrucciones. Si hay una emergencia médica grave, un incendio, una fuga peligrosa de gas o cualquier peligro inmediato para la vida, llama al 911 sin esperar autorización. Avisa al propietario cuando sea seguro hacerlo."
  2. The 26 SOP versions: no Spanish text exists yet (Spanish status `pending` in section 4). The staff app shows "Revisión de seguridad en español pendiente: el texto del SOP se muestra en inglés." (`sop.spanishPending`). Under TSK-0103, unreleased Spanish safety text blocks Start Work for a Spanish-locale worker. The Spanish versions come to you for review when they exist.
  3. Spanish staff-app safety strings already in `staff.es.json` (English source in brackets):
     - `packet.emergencyNeverWait`: "En una emergencia, actúe primero: detenga el trabajo afectado, mantenga a las personas alejadas y llame a los servicios de emergencia. Nunca espere a esta aplicación ni al Propietario." [In an emergency, act first: stop the affected work, keep people away and call emergency services. Never wait for this app or for the Owner.]
     - `sop.humanReview.body`: "Los trabajos eléctricos, de plomería, de HVAC o de gas que requieren licencia, los trabajos estructurales y los materiales peligrosos (asbesto, plomo, moho) no tienen procedimiento aquí. Deténgase, mantenga la retención y escale para una revisión humana." [Licensed electrical, plumbing, HVAC or gas work, structural work and hazardous materials (asbestos, lead, mold) have no procedure here. Stop, keep the hold and escalate for human review.]
     - `sop.pendingReview.body`: "Esta versión del SOP todavía no tiene la aprobación de una revisión competente. Úsela solo en el entorno privado de pruebas; deténgase y escale cualquier condición insegura, inesperada o fuera del alcance." [This SOP version has no competent-review sign-off yet. Follow it only on private staging; stop and escalate for any unsafe, unexpected or out-of-scope condition.]
     - `enum.requestRefusal.OWN_CRITICAL_HOLD`: "Nadie libera una retención de seguridad crítica que haya levantado." [Nobody releases a critical safety hold they raised.]
     - `enum.hazardCategory.*`: "Material peligroso (asbesto, plomo, moho)", "Trabajo de oficio con licencia (electricidad, plomería, HVAC, gas)", "Estructural", "Requisito de permiso o licencia", "Otra preocupación de seguridad".
     - `request.holdsHint`: "Un posible peligro o un alcance restringido queda visible aquí hasta que el Propietario lo resuelva con una nota e indique quién lo revisó. Nadie declara que el lugar es seguro." [A potential hazard or restricted scope stays visible here until the Owner resolves it with a note and names who reviewed it. Nobody declares the site safe.]
- **Launch gate:** FEATURE: blocks Start Work for Spanish-reading workers until the Spanish safety text is released; English work is not blocked by it.

### S-13 After-job care notes withheld for safety
- **Question:** which after-job care instructions are safety-critical and need your validation before customers see them, and are the validated ones correct?
- **Unblocks:** OWN-DEC-180 item 6 ("Any safety-critical instructions requiring qualified review must remain unpublished until properly validated"), OWN-DEC-81, HH-QA-05, TSK-0132.
- **Current state:** the care notes for the 26 services are drafted; product-dependent lines (drying, curing, cleaning, waiting times) come only from stored manufacturer guidance and are never invented (OWN-DEC-81). The list of notes withheld for safety comes from the final report of TSK-0132 (not built yet); the owner forwards it to you.
- **Launch gate:** FEATURE: a withheld note stays unpublished; the service page is not blocked.

### S-14 Licenses, certifications and permits that affect safety
- **Question:** which services need a worker qualification, certification or permit before work starts (for example for heights, insulation, coatings or pressure washing), so the job-level Hold / Ready note can name it? The legal side is the attorney's ([attorney.md](attorney.md) A-08).
- **Unblocks:** OQ-PERMITS-LICENSING, OWN-DEC-82, OWN-DEC-18.
- **Current rule:** an unresolved requirement is a blocking Hold on the affected job; nothing claims a license (OQ-PERMITS-LICENSING).
- **Launch gate:** FEATURE (per job).

## 6. Sign-off
One row per SOP version (record the version number and the content digest the staff app shows), then one row per common item.

| Item | Approved / Changed / Not my area | Reviewer (name and qualification) | Date |
| --- | --- | --- | --- |
| S-01 SOP-CL-01 Routine House Cleaning (version ____, content `85e0103b9b95`) | | | |
| S-01 SOP-CL-02 Elite Deep Cleaning Service (version ____, content `9d822eea4119`) | | | |
| S-01 SOP-CL-03 Move-In & Move-Out Cleaning (version ____, content `7a52d2f078c5`) | | | |
| S-01 SOP-CL-04 Post-Construction & Post-Renovation Cleaning (version ____, content `747875b068b0`) | | | |
| S-01 SOP-CL-05 Airbnb Turnover & Vacation Rental Management (version ____, content `3aab1c47afe8`) | | | |
| S-01 SOP-CL-06 Hotel-Style Luxury Housekeeping (version ____, content `a2679eb5aaf0`) | | | |
| S-01 SOP-CL-07 Air Duct & Ventilation Cleaning (version ____, content `8bb56f382be4`) | | | |
| S-01 SOP-DW-01 Professional Patching, Repair & Handyman Services (version ____, content `794f590093d7`) | | | |
| S-01 SOP-DW-02 Texture Matching & Popcorn Ceiling Removal (version ____, content `259ba2efb6f1`) | | | |
| S-01 SOP-DW-03 Residential Remodeling & Home Additions (version ____, content `f115b098e3c9`) | | | |
| S-01 SOP-DW-04 High-Volume Residential New Construction (version ____, content `0b55b3d2c92e`) | | | |
| S-01 SOP-HI-01 Precision Picture Hanging & Art Installation (version ____, content `906d10dc6dcf`) | | | |
| S-01 SOP-HI-02 Deep-Clean Barbecue & Grill Maintenance (version ____, content `88150713d094`) | | | |
| S-01 SOP-HI-03 Driveway Pressure Washing & Surface Restoration (version ____, content `18abeba25777`) | | | |
| S-01 SOP-HI-04 Professional TV Wall Mounting & Wire Hiding (version ____, content `63a77f1c8d9f`) | | | |
| S-01 SOP-HI-05 Door Hardware & Smart Lock Installation (version ____, content `ecdf509dc3c6`) | | | |
| S-01 SOP-HI-06 Gutter Maintenance & Leaf Protection (version ____, content `4d359a8b240d`) | | | |
| S-01 SOP-HI-07 Attic Insulation Upgrades (version ____, content `73e8f321ec89`) | | | |
| S-01 SOP-HI-08 Closet & Shelving System Installation (version ____, content `746e0b386e70`) | | | |
| S-01 SOP-HI-09 Custom Trim & Architectural Molding Installation (version ____, content `c92dc9cba7e8`) | | | |
| S-01 SOP-HI-10 Structural Fence Maintenance & Structural Repairs (version ____, content `46059fe17019`) | | | |
| S-01 SOP-HI-11 Structural Deck Maintenance & Deck Board Repairs (version ____, content `906172fd0ec3`) | | | |
| S-01 SOP-PT-01 Professional Residential Interior Painting (version ____, content `7e77925901f9`) | | | |
| S-01 SOP-PT-02 Outdoor Deck & Fence Staining and Sealing (version ____, content `0629e93bd4ef`) | | | |
| S-01 SOP-PT-03 Brick Limewashing & Elastomeric Masonry Coatings (version ____, content `ede9e11fe374`) | | | |
| S-01 SOP-PT-04 Wallpaper Removal & Surface Restoration (version ____, content `0cf5e49f04ec`) | | | |
| S-02 Hazard controls (all SOPs) | | | |
| S-03 Stop-work rule and rights | | | |
| S-04 Escalation procedure | | | |
| S-05 Gas leaks and exposed wiring | | | |
| S-06 Hold release rules | | | |
| S-06 Hold void rules | | | |
| S-07 Start Work exceptions boundary | | | |
| S-08 Hazardous materials and home-age limits | | | |
| S-09 Never-performed work and limits wording | | | |
| S-10 Incident reporting and first response | | | |
| S-11 Lone work | | | |
| S-12 Spanish escalation instruction (OWN-DEC-172) | | | |
| S-12 Spanish staff-app safety strings | | | |
| S-13 Care notes withheld for safety | | | |
| S-14 Qualifications and permits | | | |

## 7. What is NOT claimed
- No SOP, checklist or hazard control is approved, certified or field-tested; all 26 are pending competent review, and the vault files are drafts (`draft-not-field-approved`).
- No site, worker or job is declared safe: "Nobody declares the site safe." Resolving a hold is never a safety certification or a legal conclusion (HH-INC-03).
- Spanish safety text is never called "human-reviewed" or "safety-certified" (OWN-DEC-79).
- No license, certification, permit, insurance, OSHA compliance or warranty beyond the decided 90-day workmanship warranty is claimed.
- HandyHub never performs licensed electrical, plumbing, HVAC or gas work, structural work or hazardous-material work, and the software gives no procedure for them.

## 8. Launch gates of this packet
| Gate | Items |
| --- | --- |
| PRODUCTION | S-01 and S-02 (per service), S-03, S-04, S-05, S-06, S-07, S-08, S-09, S-10 |
| FEATURE | S-12 (Spanish-reading workers), S-13 (withheld care notes), S-14 (per-job Hold) |
| NONE STATED | S-11 |
