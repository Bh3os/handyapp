---
id: SVC-HI-01
type: service
title: "Picture Hanging & Art Installation"
status: active
area: business
links:
  decided_by: ["[[OWN-DEC-04]]", "[[OWN-DEC-33]]", "[[OWN-DEC-84]]", "[[OWN-DEC-51]]", "[[OWN-DEC-102]]", "[[OWN-DEC-108]]"]
  uses: ["[[SOP-HI-01]]", "[[FACT-INVENTORY-HI-01]]", "[[FACT-PRICING-PER-JOB]]", "[[FACT-SVC-EXCLUDED-SCOPE]]"]
  constrained_by: ["[[RULE-HUMAN-REVIEW]]", "[[RULE-SAFETY-GATES]]", "[[RULE-NO-INVENTED-FACTS]]", "[[FACT-SVC-EXCLUDED-SCOPE]]", "[[FACT-SVC-SUSPECTED-HAZMAT]]", "[[FACT-SVC-ACCESS-EQUIPMENT]]", "[[FACT-SVC-REFER-OUT-TASKS]]"]
  part_of: ["[[C01]]", "[[C02]]"]
  related: ["[[FACT-PRICING-HI-01]]", "[[FACT-AGREEMENT-HI-01]]", "[[FACT-SERVICE-AREA]]", "[[FACT-BRAND-IDENTITY]]", "[[FACT-SVC-NAMES]]", "[[HH-SVC-01]]", "[[HH-SVC-02]]", "[[HH-SVC-03]]", "[[HH-SVC-04]]", "[[OWN-DEC-91]]", "[[OWN-DEC-99]]", "[[OWN-DEC-127]]"]
source: "guide 6.2; vault 04-service-registry HI-01; spec section 17 HI-01; Standard Of Operations/sop-picture-hanging.md; Main Plans/Home Improvement Business.md"
---
Category: Home Improvement. Catalog name (guide 6.2): Picture Hanging & Art Installation. Canonical name (spec Appendix B): Precision Picture Hanging & Art Installation. Slug: `picture-hanging`. Brand and service area: [[FACT-BRAND-IDENTITY]], [[FACT-SERVICE-AREA]]; naming: [[FACT-SVC-NAMES]].

In the launch set: all 26 services are in scope and launch ([[OWN-DEC-04]], [[OWN-DEC-33]]); reported capability is not proof of insurance, qualifications or equipment. Worker checklist: [[SOP-HI-01]] (active, pending competent review for production use, [[OWN-DEC-108]]). Pricing: each job is priced individually on its own estimate ([[FACT-PRICING-PER-JOB]]); the vault price list [[FACT-PRICING-HI-01]] is superseded. Tools and materials: [[FACT-INVENTORY-HI-01]]. Draft agreement clauses: [[FACT-AGREEMENT-HI-01]] (attorney review; customers approve the estimate terms of [[OWN-DEC-127]]).

Vault files: SOP `Standard Of Operations/sop-picture-hanging.md`; Pricing `Pricing/pricing-picture-hanging.md`; Inventory `Required inventory/inventory-picture-hanging.md`; Agreement `Service Agreements/contract-picture-hanging.md`; main plan `Main Plans/Home Improvement Business.md` ("🖼️ 1. Precision Picture Hanging & Art Installation").

- aliases (registry 04, label **FACT**): "1. Precision Picture Hanging & Art Installation" (plan heading); "Picture Hanging & Art Installation" (pricing, inventory, agreement and SOP titles, which drop "Precision"); "localized artwork and mirror mounting services" (agreement preamble); "professional art installation service" (plan overview); "`sop-picture-hanging.md` micro-checklist" (agreement); website headline "Secure, Laser-Level Placement for Fine Art, Heavy Mirrors, and Gallery Walls" (tagline, not a name); file stems pricing-/inventory-/contract-/sop-picture-hanging (source: plan §1 L7-11; pricing L1; inventory L1; agreement L1, L4, L7; SOP L1)

## Customer description

No owner-approved customer description exists in the sources. Service-page content is drafted from the service files: staging shows the drafts, production shows only versions the owner approves and publishes ([[OWN-DEC-84]], amended 2026-10-12). Pages state the service's limits ([[OWN-DEC-51]]) and never invent prices, completion times, credentials or guarantees ([[RULE-NO-INVENTED-FACTS]]).

- customer-facing description (registry 04, label **FACT** + **PROPOSED**): Draft website copy only (headline, overview, 4 process bullets), not approved. Unreviewed claims: "guarantee perfect symmetry and spacing"; anchors "rated to hold up to 100+ lbs safely without sagging"; mirror "mounted safely above a mantel". PROPOSED neutral summary (owner + handyhub-marketing review): hanging framed art, canvases and mirrors on approved wall types, with placement approved by the customer before any drilling (source: plan §1 L8-17; C-HI01-02; C-HI01-V01)

Purpose (SOP section 1):

- Hang framed art, canvases and mirrors on the wall types this SOP covers, at a placement the customer approves, using hardware whose manufacturer rating fits the item weight and the substrate (source: spec Appendix B; spec HI-01.INT, HI-01.SAF, HI-01.QAC; agreement "Inclusions" clause).
- The original SOP has no intro statement. This draft makes no outcome promise and is not field-approved (source: 31 section 3.5 rule 5; owner facts 2026-10-02).

### Draft plan copy (`Main Plans/Home Improvement Business.md`; not approved, claims unverified)

*Target Headline for Website: Secure, Laser-Level Placement for Fine Art, Heavy Mirrors, and Gallery Walls*

A beautiful piece of art or a grand statement mirror can instantly elevate a room—but hanging them incorrectly can lead to crooked frames, damaged drywall, or catastrophic falls. Our professional art installation service eliminates the guesswork. Whether you need a heavy, ornate floor mirror mounted safely above a mantel, a seamless grid-pattern gallery wall of family photos, or fragile canvas paintings secured, we deliver pinpoint, laser-level accuracy that protects both your artwork and your walls.

- [ ] **Laser-Guided Layout Planning:** We map out exact dimensions using self-leveling laser lines to guarantee perfect symmetry and spacing before making any wall punctures.
- [ ] **Substrate & Stud Verification:** We scan your walls to locate structural studs or determine substrate composition (drywall, plaster, or raw brick) to select the perfect anchoring hardware.
- [ ] **Heavy-Duty Anchor Fastening:** We install professional toggle bolts, heavy-duty drywall anchors, or masonry sleeves rated to hold up to 100+ lbs safely without sagging.
- [ ] **Final Symmetrical Tuning:** We mount the artwork, verify level alignment under secondary light checks, and add bumper pads to protect your wall paint from back-frame scratching.

Claims the main plan flags for this service (each `unverified`, not publishable until approved):

- "Secure, Laser-Level Placement for Fine Art, Heavy Mirrors, and Gallery Walls": Headline - Reword ("Secure" and "Heavy Mirrors" imply a load assurance; body claims 100+ lb while the SOP stops at 50 lb) (reviewer: Safety reviewer)
- "rated to hold up to 100+ lbs safely without sagging": SAFE - Remove the number; manufacturer ratings only (reviewer: Safety reviewer)
- "to guarantee perfect symmetry and spacing": GUAR - Reword as a layout the customer approves (reviewer: Attorney)

## Request questions

- Guide 6.2 extra inputs / review needs: Count, size/weight, wall type, height, hardware/photos.
- Spec intake (HI-01.INT): wall type and thickness; item dimensions/weight; exact placement; stud/anchor availability; number of items; height/access; customer-supplied hardware.
- Answers follow [[OWN-DEC-91]] and [[HH-SVC-03]]: units shown beside each measurement, approximate values allowed, and "I don't know" stays unknown, never zero, safe or approved. The sources set no per-service unit list.
- Estimate route: online when the details and photos are enough, a site visit when inspection or measurements are needed ([[OWN-DEC-99]], [[HH-SVC-04]]); a customer preference for a remote estimate never overrides a required site or qualification review.

## Included work (SOP section 2, "In scope")

- Standard hollow drywall walls: Option A in section 12 (source: original SOP heading "Problem Option A").
- Raw brick or concrete fireplace mantel faces: Option B in section 12, only after the on-site assessment required under "Do not perform" (source: original SOP heading "Problem Option B"; 31 section 10).
- Per item: weight check and hardware selection, a level line at the customer's preferred height, fastening and bumper placement as written in section 12 (source: original SOP steps).
- Intake facts the estimate relies on: wall type and thickness; item dimensions/weight; exact placement; stud/anchor availability; number of items; height/access; customer-supplied hardware (source: spec HI-01.INT).

## Excluded work and limits

HandyHub never performs licensed or unsafe scope: [[FACT-SVC-EXCLUDED-SCOPE]]; suspected hazardous material: [[FACT-SVC-SUSPECTED-HAZMAT]]; access equipment: [[FACT-SVC-ACCESS-EQUIPMENT]]. Referred out at launch for this service: fireplace mounting ([[FACT-SVC-REFER-OUT-TASKS]]).

### SOP section 2, "Out of scope"

- Not covered - pending review (C-HI01-05): plaster, including historic plaster and plaster on lath, "soft brick", tile, metal-stud and other substrates without an approved procedure. Stop and request an on-site assessment (source: 02 C-HI01-05; agreement "Substrate Disclaimer" clause; main plan section 1).
- Not covered - pending review (C-HI01-02): items heavier than the Option A weight bands in section 12, and masonry items without the anchor manufacturer's rating recorded for the job (source: 31 section 10).
- Not covered - pending review (G-046): gallery-wall (multi-item) layout, which the pricing file sells as a "Bundle" and the main plan markets, but no step covers (source: 31 section 10; 02 G-046).
- Owner decision pending (OPEN QUESTION in the 04 exclusions row): ceiling-hung items; wall repair or painting; frame repair; removal or patching of old holes; patching or touch-up unless the approved scope includes it (source: spec HI-01.MAT "patching touch-up materials if included").

### SOP section 2, "Do not perform"

Universal entries (PROPOSED wording, 31 section 3.3; HUMAN REVIEW: qualified safety professional and licensing reviewer):
1. Electrical, plumbing, gas or HVAC work outside the approved scope or requiring a licensed trade (source: spec START-011 "unapproved electrical/plumbing/gas/structural scope"; master section 1.3).
2. Structural work, meaning cutting, removing, sistering or adding load-bearing members, ledgers, footings or framing, unless it is in the approved scope with the required qualified review (source: START-011; master section 1.3).
3. Disturbing suspect asbestos, lead paint or mold: stop and escalate (source: START-011 "suspect hazardous materials"; owner facts L20 "Unknown is not safe").
4. Work that is not in the approved scope or an approved change order; record customer requests instead (source: JOB-005, JOB-010, FIN-008, AT-033).
5. Working at height or using access equipment beyond the approved height and access policy (source: HI-06.SAF "beyond approved height/access policy"; DW-04.TLS "scaffolds/stilts only under approved policy").
6. Mixing or sequencing chemicals in any way the approved step and the product SDS do not allow (source: CL-01.SAF "never mix incompatible chemicals"; X-09).
7. Recording, photographing or sending customer passwords, master codes or site access codes outside the app's secured fields (source: COM-002; owner facts L17; 27 AUTH-009).
8. Promising results, warranties, safety, health or code compliance to the customer (source: master sections 1.4, 17 and 29; CL-07.SAF "do not make unsupported indoor-air-quality claims").

Service entries (seeds from 31 section 10 and the register; pending the same review):
- Electrical work of any kind for this service, including picture lights or any wiring. Reason: licensed trade. Instead: stop and escalate; the owner refers the request (source: 31 section 10; spec START-011).
- Fireplace-mantel installs before an on-site assessment of heat and gas-appliance proximity. Reason: hazard (RISK). Instead: stop and escalate; whether fireplace mounting is offered at all is Q-31-08 (source: 31 section 10).
- Suspected asbestos / lead paint / mold: stop and escalate (source: spec START-011). This service drills into walls that may carry older paint or historic plaster (source: agreement "Substrate Disclaimer" clause; X-13).
- Hanging an item heavier than the SOP's own Option A weight bands, or a masonry item without the anchor manufacturer's rating recorded for the job. Reason: out of scope and safety. Instead: stop and escalate (source: 31 section 10; C-HI01-02).

- exclusions (registry 04, label **GAP** + **OPEN QUESTION**): None explicit; scope only implied ("leveling, anchoring, and secure mounting of designated frames, canvases, or mirrors"). OPEN QUESTION for owner: items above an approved weight limit; ceiling-hung items; picture lights or any electrical work; unsupported substrates; wall repair/painting; frame repair; removal/patching of old holes (source: agreement §1 L7; spec EST-003, CX-004)

## Hazards and human-review flags

- Spec hazards (HI-01.HAZ): hidden electrical/plumbing, heavy-object handling, ladder work, fragile/high-value items, drilling dust.
- Spec stop-work guidance (HI-01.SAF): verify substrate; confirm fastener capacity; two-person lift when required; protect floor/wall; stop if hidden-service risk or wall condition is uncertain.
- permit/license flags (registry 04, label **GAP** + **OPEN QUESTION**): None set in any HI-01 file; unknown applicability must not default to "no permit". OPEN QUESTIONS (no conclusion drawn): handyman/home-improvement registration in each KY/IN municipality served (HUMAN REVIEW: legal-compliance-administrator + municipal licensing office); EPA RRP applicability when drilling or patching painted surfaces in pre-1978 homes (EPA RRP certified renovator); respirable-silica requirements for hammer-drilling masonry (qualified safety professional); coverage for customer property in HandyHub's care (insurance broker) (source: owner facts L4, L21; risk-triage playbook L13; spec START-010, HND-005)
- Reviewers named in the vault files' front matter: qualified safety reviewer; owner; Spanish translation reviewer; EPA RRP-certified renovator; CPA (tax treatment); safety reviewer (PPE/hazmat); attorney licensed in KY/IN; insurance broker; qualified safety professional. Boundaries: [[RULE-HUMAN-REVIEW]].

### Required worker qualifications (SOP section 4)

- TBD — requires review by safety-liability-manager and a qualified person; owner to approve.
- Inputs for that review: two-person lifts (spec HI-01.SAF); ladder work and hammer drilling into brick or concrete (spec HI-01.HAZ; section 12 Option B); qualification tags are enforced by scheduling and Start Job (spec SCH-003, START-010). No owner qualification policy exists (source: 31 section 3.1; Q-31-01).

### Hazards (SOP section 9)

Draft entries for the qualified safety professional; severity and final controls are TBD by that reviewer (source: 31 section 3.1 row 9; Q-31-18).

| Hazard | Source | Draft controls (pending review) | Stop-work trigger | Reviewer |
|---|---|---|---|---|
| Hidden electrical or plumbing services | Spec HI-01.HAZ; 04 hazards row | Hidden-service check before any hole, with the stocked scanner per its manufacturer instructions (HOLD in section 12) | Hidden-service risk or wall condition uncertain (spec HI-01.SAF) | Qualified safety professional |
| Heavy-object handling; falling items | Spec HI-01.HAZ | Weigh the item ("Weight Audit"); hardware from the manufacturer's rating; two-person lift when required (spec HI-01.SAF) | Item heavier than the SOP's bands, no recorded rating, or no second person for a two-person lift | Qualified safety professional; owner (maximum accepted weight) |
| Ladder work | Spec HI-01.HAZ, HI-01.TLS | Only under an approved height/access policy; none exists (02 G-005; X-12) | No approved policy or no suitable access equipment for the height | Qualified safety professional |
| Fragile or high-value items, glass | Spec HI-01.HAZ | Condition record before work (spec START-009); floor and wall protection (spec HI-01.SAF) | Damage found before work: record it (spec JOB-004) | Qualified safety professional; insurance broker (cover for customer property is an open question) |
| Drilling dust, including hammer drilling into brick or concrete | Spec HI-01.HAZ; section 12 Option B | Dust collection and PPE per the safety reviewer; whether respirable-silica requirements apply to hammer drilling into brick or concrete is an open question for the qualified safety professional, not concluded here (04 permit/license flags row) | - | Qualified safety professional |
| Older painted finishes and historic plaster (possible lead paint or asbestos) | Agreement "Substrate Disclaimer" clause; X-13 | Plaster is not covered (section 2); screening rule pending (Q-31-07) | Suspect hazardous material (spec START-011) | EPA RRP-certified renovator; accredited asbestos inspector |
| Fireplace heat and gas-appliance proximity above mantels | Section 12 Option B heading; 04 hazards row | On-site assessment before any mantel install ("Do not perform") | Gas odor: emergency path in section 19 | Qualified safety professional |
| Lead-containing anchor sleeves | Section 12 "Sleeve Setting" | Handling and SDS need per the safety reviewer (hazardous-material flag, not a lead-paint item) | - | Qualified safety professional |
| Occupants, children and pets near the work | X-11; spec APXA-002 | Keep them away from the work area (section 5) | Aggressive occupant or animal (spec START-011) | Qualified safety professional |

## Warranty or callback

- warranty or callback policy (registry 04, label **GAP** + **OPEN QUESTION**): None in any HI-01 file. Plan copy makes outcome promises ("guarantee perfect symmetry and spacing"; "without sagging") with no warranty basis (C-HI01-V01, C-HI01-02). OPEN QUESTION: owner + KY/IN attorney decide; return visits classified per CX-007/QA-010; nothing invented (source: plan L14, L16; spec CX-007, QA-010)
- Governed now by: the 90-day workmanship warranty of [[FACT-WARRANTY]] ([[OWN-DEC-135]]), counted from the reviewed completion date; a claim opens a case with return-visit punch items ([[HH-QA-07]]). No warranty exclusions are defined; any come only from attorney review ([[OQ-ATTORNEY-TERMS]]).
