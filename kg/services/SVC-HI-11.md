---
id: SVC-HI-11
type: service
title: "Deck Maintenance & Board Repairs"
status: active
area: business
links:
  decided_by: ["[[OWN-DEC-04]]", "[[OWN-DEC-33]]", "[[OWN-DEC-84]]", "[[OWN-DEC-51]]", "[[OWN-DEC-102]]", "[[OWN-DEC-108]]"]
  uses: ["[[SOP-HI-11]]", "[[FACT-INVENTORY-HI-11]]", "[[FACT-PRICING-PER-JOB]]", "[[FACT-SVC-EXCLUDED-SCOPE]]"]
  constrained_by: ["[[RULE-HUMAN-REVIEW]]", "[[RULE-SAFETY-GATES]]", "[[RULE-NO-INVENTED-FACTS]]", "[[FACT-SVC-EXCLUDED-SCOPE]]", "[[FACT-SVC-SUSPECTED-HAZMAT]]", "[[FACT-SVC-ACCESS-EQUIPMENT]]", "[[FACT-SVC-REFER-OUT-TASKS]]"]
  part_of: ["[[C01]]", "[[C02]]"]
  related: ["[[FACT-PRICING-HI-11]]", "[[FACT-AGREEMENT-HI-11]]", "[[FACT-SERVICE-AREA]]", "[[FACT-BRAND-IDENTITY]]", "[[FACT-SVC-NAMES]]", "[[HH-SVC-01]]", "[[HH-SVC-02]]", "[[HH-SVC-03]]", "[[HH-SVC-04]]", "[[OWN-DEC-91]]", "[[OWN-DEC-99]]", "[[OWN-DEC-127]]"]
source: "guide 6.2; vault 04-service-registry HI-11; spec section 17 HI-11; Standard Of Operations/sop-deck-repair.md; Main Plans/Home Improvement Business.md"
---
Category: Home Improvement. Catalog name (guide 6.2): Deck Maintenance & Board Repairs. Canonical name (spec Appendix B): Structural Deck Maintenance & Deck Board Repairs. Slug: `deck-repair`. Brand and service area: [[FACT-BRAND-IDENTITY]], [[FACT-SERVICE-AREA]]; naming: [[FACT-SVC-NAMES]].

In the launch set: all 26 services are in scope and launch ([[OWN-DEC-04]], [[OWN-DEC-33]]); reported capability is not proof of insurance, qualifications or equipment. Worker checklist: [[SOP-HI-11]] (active, pending competent review for production use, [[OWN-DEC-108]]). Pricing: each job is priced individually on its own estimate ([[FACT-PRICING-PER-JOB]]); the vault price list [[FACT-PRICING-HI-11]] is superseded. Tools and materials: [[FACT-INVENTORY-HI-11]]. Draft agreement clauses: [[FACT-AGREEMENT-HI-11]] (attorney review; customers approve the estimate terms of [[OWN-DEC-127]]).

Vault files: SOP `Standard Of Operations/sop-deck-repair.md`; Pricing `Pricing/pricing-deck-repair.md`; Inventory `Required inventory/inventory-deck-repair.md`; Agreement `Service Agreements/contract-deck-repair.md`; main plan `Main Plans/Home Improvement Business.md` ("🛋️ 11. Structural Deck Maintenance & Deck Board Repairs").

- aliases (registry 04, label **FACT**): Plan heading "11. Structural Deck Maintenance & Deck Board Repairs"; website headline "Ensure Backyard Safety—Professional Deck Structural Repairs and Board Replacements"; plan "specialized deck repair division"; pricing title "Regional Pricing: Structural Deck Repairs"; inventory, agreement and SOP titles "Structural Deck Maintenance & Repairs" (drift, C-HI11-10); agreement scope phrase "safety-focused residential deck repairs"; spec card "HI-11 — Structural Deck Maintenance & Deck Board Repairs"; inventory item misnamed "Drywall Lift Board Board Straightener" (a deck-board straightener). Not an alias: PT-02 deck staining (source: plan L148-152; pricing L1; inventory L1, L11; agreement L1, L4; SOP L1; spec Appendix B)

## Customer description

No owner-approved customer description exists in the sources. Service-page content is drafted from the service files: staging shows the drafts, production shows only versions the owner approves and publishes ([[OWN-DEC-84]], amended 2026-10-12). Pages state the service's limits ([[OWN-DEC-51]]) and never invent prices, completion times, credentials or guarantees ([[RULE-NO-INVENTED-FACTS]]).

- customer-facing description (registry 04, label **FACT** + **PROPOSED**): Current: draft website copy - crawl under the deck to inspect ledger boards, joist hangers and post connections; remove split, rotting or cupped boards; lay pressure-treated replacements with polymer-coated screws; replace weak stair steps and through-bolt loose handrails "into primary support posts"; claims the division "structurally reinforces existing sub-structures" and "restores the safety and lifespan" of the deck. Under-deck evaluation and reinforcement are not in the SOP (C-HI11-05). PROPOSED neutral summary for owner/legal approval: replacement of damaged deck boards and stair treads and tightening of loose handrail posts within the approved scope; framing, ledger or foundation problems found during work stop the job for a change order or referral (source: plan L149-158; spec HI-11.SAF)

Purpose (SOP section 1):

- This SOP covers how HandyHub workers replace rotted or cupped deck floorboards (Option A) and tighten a loose handrail post with a through-bolt (Option B) for **HI-11 Structural Deck Maintenance & Deck Board Repairs**, within the approved scope and only after access is restricted and the support under the work has been inspected; framing, ledger or foundation problems found during the work stop the job for a change order or a referral (source: spec Appendix B name; 04 HI-11 customer-facing description, PROPOSED neutral summary; spec HI-11.SAF; original steps in section 12).
- It states how the work is done and promises no outcome, safety, structural, lifespan or code-compliance result to the customer (source: 31 section 3.5 rule 5). The original file has no intro statement, so no original line is moved into this section.
- Proposed risk class: high-risk / specialist review, because unsafe deck structure routes to competent assessment (source: 04 HI-11 active/inactive status, PROPOSED; risk-triage playbook "Route potential lead/asbestos, unresolved leaks/rot, unsafe deck structure ... to competent assessment"; safety-liability-manager risk classification).

### Draft plan copy (`Main Plans/Home Improvement Business.md`; not approved, claims unverified)

*Target Headline for Website: Ensure Backyard Safety—Professional Deck Structural Repairs and Board Replacements*

An outdoor deck is a wonderful space for entertainment, but exposed wood joists and floorboards rot over time due to trapped moisture. Warped boards, unstable steps, and loose handrails are dangerous structural failures that can compromise guest safety. Our specialized deck repair division structurally reinforces existing sub-structures, replaces compromised boards with premium pressure-treated lumber, and restores the safety and lifespan of your deck footprint.

- [ ] **Sub-Frame Joist Evaluation:** We crawl underneath the deck frame to inspect structural ledger boards, joist hangers, and post connections for any hidden wood rot.
- [ ] **Failed Floorboard Extraction:** We back out rusted old screws and carefully remove split, rotting, or cupped wood floorboards without fracturing the surrounding framing.
- [ ] **Premium Lumber Integration:** We cut and lay fresh, moisture-resistant structural lumber replacements, fastening them down with exterior polymer-coated deck screws driven flush.
- [ ] **Stair Tread and Railing Tightening:** We replace weak stair steps and structurally reinforce loose handrails by installing heavy-duty structural through-bolts into primary support posts.

Claims the main plan flags for this service (each `unverified`, not publishable until approved):

- "Ensure Backyard Safety—Professional Deck Structural Repairs and Board Replacements": Headline - Remove "Ensure Backyard Safety"; Hold "Structural" (Safety outcome; structural boundary) (reviewer: Structural engineer + attorney)
- "restores the safety and lifespan of your deck footprint": GUAR, SAFE - Remove (reviewer: Structural engineer + attorney)
- "We crawl underneath the deck frame" (structural inspection): SAFE, SCOPE - Reword as visual observation with referral (reviewer: Structural engineer)
- "structurally reinforce loose handrails by installing heavy-duty structural through-bolts": SAFE (guardrail loads) - Hold (reviewer: Structural engineer or building official)

## Request questions

- Guide 6.2 extra inputs / review needs: Size/height, damaged boards/support reports, access; structural review.
- Spec intake (HI-11.INT): deck size/height, damaged boards/rails/stairs, framing condition, ledger/joist observations, material match, access.
- Answers follow [[OWN-DEC-91]] and [[HH-SVC-03]]: units shown beside each measurement, approximate values allowed, and "I don't know" stays unknown, never zero, safe or approved. The sources set no per-service unit list.
- Estimate route: online when the details and photos are enough, a site visit when inspection or measurements are needed ([[OWN-DEC-99]], [[HH-SVC-04]]); a customer preference for a remote estimate never overrides a required site or qualification review.

## Included work (SOP section 2, "In scope")

- Option A as written in section 12: backing out or cutting the fasteners of a rotted or cupped floorboard, removing the board, inspecting the exposed joist tops, and cutting, fitting and fastening a new pressure-treated board, only after the holds in sections 3 and 12 clear. The joist-sistering instruction inside "Joist Inspection" is suspended (section 12) (source: original SOP; agreement "Inclusions" clause "Extraction of failed floorboards"; pricing "Rotted / Cupped Floorboard Swap-Out").
- Option B as written in section 12: tightening a loose vertical handrail post by through-bolting it to the deck perimeter band joist, only after the fall-control hold clears; the connection method is under structural review (section 12 flags) (source: original SOP; agreement "Inclusions" clause "post through-bolting"; pricing "Structural Post Tightening / Safety Stabilization").
- Confirming on site, for every job, the intake facts: deck size/height, damaged boards/rails/stairs, framing condition, ledger/joist observations, material match, access (source: spec HI-11.INT; CX-005).
- Recording any decay, movement or other concealed condition found, with photos, as an unresolved structural concern (source: spec JOB-004; HI-11.QAC "unresolved structural concerns documented").

## Excluded work and limits

HandyHub never performs licensed or unsafe scope: [[FACT-SVC-EXCLUDED-SCOPE]]; suspected hazardous material: [[FACT-SVC-SUSPECTED-HAZMAT]]; access equipment: [[FACT-SVC-ACCESS-EQUIPMENT]]. Referred out at launch for this service: joist sistering ([[FACT-SVC-REFER-OUT-TASKS]]).

### SOP section 2, "Out of scope"

- Not covered - pending review (C-HI11-04): stair tread replacement and stair tightening. Pricing sells "Individual Step Tread Replacement", the agreement names "stair tightening as defined in `sop-deck-repair.md`", the main plan promises to "replace weak stair steps" and the Option B heading says "& Steps", but no step covers stairs. Not schedulable until a procedure is drafted and competently reviewed; offering, defining or withdrawing stair work is an owner decision (source: 31 section 10; the pricing, agreement and main-plan lines quoted; owner facts 2026-10-02).
- Not covered - pending review: railing, baluster and stair-stringer replacement (source: 31 section 10; spec HI-11.MAT "replacement rail/stair components"; main plan "Stair Tread and Railing Tightening").
- Not covered - pending review (C-HI11-05): the main plan's "Sub-Frame Joist Evaluation" ("We crawl underneath the deck frame to inspect structural ledger boards, joist hangers, and post connections") and its statement that the division "structurally reinforces existing sub-structures"; no step covers them, and a structural evaluation is a Do-not-perform entry below (source: main plan HI-11 section; 31 section 10).
- Not covered - pending review (C-HI11-06): ledger and joist-hanger work implied by the inventory (joist hangers and ledger screws "For framing code compliance"; an impact wrench "For compressing massive structural ledger bolts flat") (source: inventory file; spec HI-11.MAT "brackets/hangers only if approved").
- Not covered - pending review: straightening warped boards with the inventory's board straightener; no step uses it (source: inventory file; 29 section 7.4 HI-11 row).
- Not offered under this SOP unless the owner decides otherwise (04 HI-11 exclusions, GAP): footings; ledger re-attachment; full railing systems; new decks; composite or cedar boards; permits; staining (a PT-02 line on the same estimate, PROPOSED). Structural remediation found during the work proceeds only by an approved change order with qualified structural review, or by referral (source: agreement "Hidden Frame Rot Clause"; spec FIN-008; 30 Q-30-15).

### SOP section 2, "Do not perform"

Each entry: prohibited work - reason class - what to do instead (source).

Universal entries (31 section 3.3, PROPOSED wording; HUMAN REVIEW: qualified safety professional and licensing reviewer):

1. Electrical, plumbing, gas or HVAC work outside the approved scope or requiring a licensed trade (source: spec START-011 "unapproved electrical/plumbing/gas/structural scope"; master section 1.3).
2. Structural work, meaning cutting, removing, sistering or adding load-bearing members, ledgers, footings or framing, unless it is in the approved scope with the required qualified review (source: START-011; master section 1.3).
3. Disturbing suspect asbestos, lead paint or mold: stop and escalate (source: START-011 "suspect hazardous materials"; owner facts L20 "Unknown is not safe").
4. Work that is not in the approved scope or an approved change order; record customer requests instead (source: JOB-005, JOB-010, FIN-008, AT-033).
5. Working at height or using access equipment beyond the approved height and access policy (source: HI-06.SAF "beyond approved height/access policy"; DW-04.TLS "scaffolds/stilts only under approved policy").
6. Mixing or sequencing chemicals in any way the approved step and the product SDS do not allow (source: CL-01.SAF "never mix incompatible chemicals"; X-09).
7. Recording, photographing or sending customer passwords, master codes or site access codes outside the app's secured fields (source: COM-002; owner facts L17; 27 AUTH-009).
8. Promising results, warranties, safety, health or code compliance to the customer (source: master sections 1.4, 17 and 29; CL-07.SAF "do not make unsupported indoor-air-quality claims").

Service-specific entries (31 section 10 seeds and the spec card; pending review):

9. Work on major structural, ledger or foundation issues outside the approved repair - structural - stop and escalate for a change order or a referral (source: spec HI-11.SAF "stop for major structural/ledger/foundation issues outside approved repair"; 31 section 10).
10. Sistering, fastening to or loading a spongy or decayed joist, or any other in-field repair of decayed framing - structural - the sistering instruction in section 12 is suspended: stop, make safe (JOB-006), record (JOB-004), escalate (source: C-HI11-01; 31 section 10; risk-triage playbook "Do not provide DIY abatement or speculative structural repair instructions.").
11. An under-deck structural evaluation, or any statement that the deck, its framing, ledger, posts or guards are structurally adequate or safe - structural / out of scope - record observations with photos and refer (source: C-HI11-05; 31 section 10; quality-assistant playbook "Do not infer hidden fasteners, structural adequacy, hazardous-material clearance or electrical safety from an image.").
12. Installing joist hangers, ledger fasteners or ledger bolts - structural - only under an approved structural change order and a reviewed procedure; otherwise stop and escalate (source: spec HI-11.MAT "brackets/hangers only if approved"; C-HI11-06).
13. Removing or loading deck boards before access is restricted and the support has been inspected - fall-through and unstable framing - restrict access and inspect first; if the support is in doubt, stop (source: spec HI-11.SAF "restrict access; inspect support before loading/removing boards"; C-HI11-03).
14. Working at an elevated deck edge, an open board gap or a loose guard without the fall control that the approved height and access policy requires - height - stop and escalate (source: spec HI-11.SAF "use fall controls as applicable"; 31 sections 7.2 rank 3 and 10; X-12).
15. Suspected asbestos / lead paint / mold: stop and escalate (source: spec START-011). Here this covers painted or coated deck boards, rails and posts of older or unknown age before any step cuts, pries or drills them; the property-age screening threshold is an open question (Q-31-07; 04 section 6.2 old-property screening questions, Q-04-18).

- exclusions (registry 04, label **FACT** + **GAP** + **PROPOSED**): None explicit; the agreement routes structural frame remediation to a change order and discloses new-lumber color variance. Not stated: footings; ledger re-attachment; stair stringers; full railing systems; new decks; composite or cedar boards; permits; staining (PT-02). Boundary (PROPOSED): repair precedes PT-02 coating on one estimate with one minimum; staining timed by product instructions, not an invented cure period; one exterior-wood soundness checklist shared with HI-10 and PT-02 (source: agreement §1 L8, §2 L11; PT-02 agreement L12)

## Hazards and human-review flags

- Spec hazards (HI-11.HAZ): falls, unstable framing, nails/splinters, saws, heavy materials, concealed structural decay.
- Spec stop-work guidance (HI-11.SAF): restrict access; inspect support before loading/removing boards; stop for major structural/ledger/foundation issues outside approved repair; use fall controls as applicable.
- permit/license flags (registry 04, label **OPEN QUESTION**): None recorded; unknown applicability must not default to "no permit". OPEN QUESTIONS per KY/IN municipality: permit or inspection for joist, ledger, guard, stair or framing repairs; basis for the agreement's "Structural Code Compliance" and "regional safety codes" wording and the inventory's "framing code compliance"; qualification behind "structural carpenter"; fall-protection obligations on elevated decks; EPA RRP for painted decks or railings in pre-1978 housing. HUMAN REVIEW: building official, structural engineer, KY/IN attorney, qualified safety professional (source: agreement §1 L6, L8; inventory L7; pricing L6; spec HND-005, START-010; operating-context L21; risk-triage playbook L13)
- Reviewers named in the vault files' front matter: qualified safety reviewer; owner; Spanish translation reviewer; licensed trade professional (structural engineer or building official); CPA (tax treatment); structural engineer or building official (structural wording, HI-11.SAF); safety reviewer (PPE/hazmat); structural engineer or building official (joist hangers and ledger hardware, C-HI11-06); local building official and attorney licensed in KY/IN (code-compliance wording, C-HI11-02); qualified English/Spanish reviewer (Arabic headings, C-HI11-11); attorney licensed in KY/IN; insurance broker; structural engineer or building official (code-compliance and structural-remediation wording). Boundaries: [[RULE-HUMAN-REVIEW]].

### Required worker qualifications (SOP section 4)

- Qualification and training for deck board replacement, work at deck edges and openings, and the power tools in section 7: TBD — requires review by safety-liability-manager and a qualified person; owner to approve. (source: spec HI-11.SAF, SCH-003; Q-31-01)
- Structural determinations (joists, ledgers, beams, posts, guard connections) belong to a structural engineer or building official. The worker records observations with photos and does not certify structural adequacy or safety (source: 31 section 10, reviewers; quality-assistant playbook "Do not infer hidden fasteners, structural adequacy, hazardous-material clearance or electrical safety from an image."; risk-triage skill "never certify site safety").
- The "structural carpenter" named in the pricing file is not an established role or qualification (source: pricing "Hourly Repair Diagnostic Fallback" line; owner facts 2026-10-02 "Reported capability is not documentary proof of insurance, qualifications or equipment"; 04 HI-11 labor assumptions).
- Heavy materials (lumber stock, removed boards): lifting method and any second-person rule per the qualified safety professional (source: spec HI-11.HAZ "heavy materials").
- Whether deck repair needs a contractor registration, licence, permit or inspection in the property's Kentucky or Indiana municipality is an OPEN QUESTION, decided per jurisdiction and never assumed to be "none" (source: 04 HI-11 permit/license flags; HUMAN REVIEW: local building official and attorney).
- Qualification tags are recorded for scheduling and checked before start (source: spec SCH-003, START-010).

### Hazards (SOP section 9)

> Spec card HI-11.HAZ (verbatim): "falls, unstable framing, nails/splinters, saws, heavy materials, concealed structural decay"

| Hazard | Source | Where it arises | Controls (draft, hierarchy of controls; pending review) | Stop-work trigger | Reviewer |
|---|---|---|---|---|---|
| Falls from deck edges and stairs, and fall-through at openings left by removed boards | HI-11.HAZ "falls"; HI-11.SAF "use fall controls as applicable"; 31 section 7.2 rank 3 ("HI-11 boards removed on elevated decks"); C-HI11-03; X-12 | "Joist Inspection" (board pried up), "New Board Hanging", Option B at the deck perimeter | Restrict access and cover or barricade openings (section 12 holds); fall controls and access equipment per the height and access module, which does not exist yet: until it is approved, elevated work is held (31 section 7.2 rank 3; 02 G-005); no ladder, fall-protection or PPE selection by AI (31 section 3.5 rule 6) | An opening cannot be covered or barricaded; elevated work without an approved fall control | Qualified safety professional |
| Unstable framing and concealed structural decay | HI-11.HAZ "unstable framing", "concealed structural decay"; HI-11.SAF; C-HI11-01 | Any board removal or loading; "Joist Inspection" | Eliminate first: inspect the support before boards are removed or loaded (C-HI11-03); no in-field structural repair: the sistering instruction is suspended (C-HI11-01); stop, make safe (JOB-006), record (JOB-004), escalate | A spongy or decayed joist, ledger, beam or post; framing movement; a major structural, ledger or foundation issue outside the approved repair | Structural engineer or building official; qualified safety professional |
| Working at a loose guard rail | 31 section 10 "Working at a loose guard rail: fall control pending review"; 04 HI-11 hazards "working at a loose guard" | Option B | A loose guard cannot be relied on as fall protection; fall control pending review (section 12 hold) | No approved fall control at an elevated edge; the post or guard moves unexpectedly | Qualified safety professional; structural engineer or building official (guard connection) |
| Saws, including cutting fastener shafts with a reciprocating saw under a board | HI-11.HAZ "saws"; 04 HI-11 hazards | "Screw Extraction", "New Board Hanging" | Tool use per the manufacturer's instructions; PPE selected by the qualified safety professional | Injury: section 20 | Qualified safety professional |
| Nails, splinters and rusted fasteners | HI-11.HAZ "nails/splinters" | "Screw Extraction", removed boards | Removed boards and fasteners are collected so that none is left on the deck or in the yard (HI-11.QAC "trip hazards removed"); PPE per the reviewer | A puncture or cut: section 20 | Qualified safety professional |
| Heavy materials | HI-11.HAZ "heavy materials" | Lumber stock, removed boards | Lifting method and any second-person rule per the qualified safety professional | An unsafe lift (section 10) | Qualified safety professional |
| Drilling through the band joist near wiring, for example deck lighting | 04 HI-11 hazards "drilling through the band joist"; 04 HI-11 customer preparation "disclose deck-lighting wiring"; START-011 | "Boring Bolt Shafts" | The customer's disclosure is recorded (section 5); the worker looks for wiring along the post and band joist before drilling (section 12 hold) | Wiring in the drilling or cutting path: stop (START-011) | Qualified safety professional; licensed electrician only if wiring work would be needed |
| Crawling under the deck | 04 HI-11 hazards "crawling under the deck"; main plan "Sub-Frame Joist Evaluation" | No step (the under-deck evaluation is not covered) | Not part of this SOP; any visual check of the support from below follows the method the qualified safety professional sets (section 12 hold) | Any request to crawl under the deck to evaluate the structure: escalate | Qualified safety professional; structural engineer |
| Dust from cutting pressure-treated lumber | risk-triage playbook "silica/other dust"; inventory lumber line | "New Board Hanging" | Dust control and any PPE decided by the qualified safety professional; no respirator type is set here | Exposure symptoms: stop; incident report (section 20) | Qualified safety professional |
| Painted deck surfaces of older or unknown age | START-011; 04 section 6.2 (old-property screening questions for HI-11; Q-04-18) | Cutting, prying or drilling painted boards, rails or posts | Do not disturb suspect lead paint; the screening threshold is an open question (Q-31-07) | Suspect lead paint: stop and escalate (START-011) | EPA RRP-certified renovator (applicability not concluded) |
| Weather and heat | X-27; spec BRF-008, START-011 "severe weather" | All exterior work | Weather check at start and when conditions change; thresholds set by the reviewer, none here | Severe weather or unsafe heat or cold | Qualified safety professional (heat plan) |
| Occupants, children and pets near open board gaps and tools | X-11; spec CX-005 | Whole job | Kept off the deck area being worked and away from openings and tools (section 12 holds) | Anyone, including a pet, enters the restricted area | Qualified safety professional |

Severity ratings and final controls: TBD — requires review by safety-liability-manager and a qualified person; owner to approve.

## Warranty or callback

- warranty or callback policy (registry 04, label **GAP** + **OPEN QUESTION**): None defined; no warranty may be added without an owner-approved policy; returns classified under QA-010/CX-007. QA-008 care note: the 60-day staining wait has no product source (source: agreement §2 L11; spec QA-008, QA-010, CX-007)
- Governed now by: the 90-day workmanship warranty of [[FACT-WARRANTY]] ([[OWN-DEC-135]]), counted from the reviewed completion date; a claim opens a case with return-visit punch items ([[HH-QA-07]]). No warranty exclusions are defined; any come only from attorney review ([[OQ-ATTORNEY-TERMS]]).
