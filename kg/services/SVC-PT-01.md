---
id: SVC-PT-01
type: service
title: "Residential Interior Painting"
status: active
area: business
links:
  decided_by: ["[[OWN-DEC-04]]", "[[OWN-DEC-33]]", "[[OWN-DEC-84]]", "[[OWN-DEC-51]]", "[[OWN-DEC-102]]", "[[OWN-DEC-108]]", "[[OWN-DEC-66]]"]
  uses: ["[[SOP-PT-01]]", "[[FACT-INVENTORY-PT-01]]", "[[FACT-PRICING-PER-JOB]]", "[[FACT-SVC-EXCLUDED-SCOPE]]"]
  constrained_by: ["[[RULE-HUMAN-REVIEW]]", "[[RULE-SAFETY-GATES]]", "[[RULE-NO-INVENTED-FACTS]]", "[[FACT-SVC-EXCLUDED-SCOPE]]", "[[FACT-SVC-SUSPECTED-HAZMAT]]", "[[FACT-SVC-ACCESS-EQUIPMENT]]", "[[FACT-SVC-HOME-AGE-LIMITS]]"]
  part_of: ["[[C01]]", "[[C02]]"]
  related: ["[[FACT-PRICING-PT-01]]", "[[FACT-AGREEMENT-PT-01]]", "[[FACT-SERVICE-AREA]]", "[[FACT-BRAND-IDENTITY]]", "[[FACT-SVC-NAMES]]", "[[HH-SVC-01]]", "[[HH-SVC-02]]", "[[HH-SVC-03]]", "[[HH-SVC-04]]", "[[OWN-DEC-91]]", "[[OWN-DEC-99]]", "[[OWN-DEC-127]]"]
source: "guide 6.2; vault 04-service-registry PT-01; spec section 17 PT-01; Standard Of Operations/sop-interior-painting.md; Main Plans/Painting Business.md"
---
Category: Painting. Catalog name (guide 6.2): Residential Interior Painting. Canonical name (spec Appendix B): Professional Residential Interior Painting. Slug: `interior-painting`. Brand and service area: [[FACT-BRAND-IDENTITY]], [[FACT-SERVICE-AREA]]; naming: [[FACT-SVC-NAMES]].

In the launch set: all 26 services are in scope and launch ([[OWN-DEC-04]], [[OWN-DEC-33]]); reported capability is not proof of insurance, qualifications or equipment. Worker checklist: [[SOP-PT-01]] (active, pending competent review for production use, [[OWN-DEC-108]]). Pricing: each job is priced individually on its own estimate ([[FACT-PRICING-PER-JOB]]); the vault price list [[FACT-PRICING-PT-01]] is superseded. Tools and materials: [[FACT-INVENTORY-PT-01]]. Draft agreement clauses: [[FACT-AGREEMENT-PT-01]] (attorney review; customers approve the estimate terms of [[OWN-DEC-127]]).

Vault files: SOP `Standard Of Operations/sop-interior-painting.md`; Pricing `Pricing/pricing-interior-painting.md`; Inventory `Required inventory/inventory-interior-painting.md`; Agreement `Service Agreements/contract-interior-painting.md`; main plan `Main Plans/Painting Business.md` ("🏠 1. Professional Residential Interior Painting").

- aliases (registry 04, label **FACT**): plan heading "1. Professional Residential Interior Painting"; website headline "Transform Your Living Spaces with Flawless, Crisp Cut-Lines"; pricing title "Regional Pricing: Residential Interior Painting (Kentuckiana)", tags `#painting/interior`, `#market/louisville` (narrower than the KY + IN area); inventory title "Inventory & Tools: Residential Interior Painting", tag `#service/interior`; agreement title "Service Agreement: Residential Interior Painting (Kentuckiana)", tag `#painting/interior`, SOP reference `sop-interior-painting.md` "micro-checklist"; SOP title "SOP: Premium Residential Interior Painting" ("Premium" replaces "Professional"); party placeholder `[Your Painting Company Name]` (C-PT01-11) (source: plan L7-8; pricing L1-2; inventory L1-2; agreement L1-2, L4, L7; SOP L1; MOC Dashboard)

## Customer description

No owner-approved customer description exists in the sources. Service-page content is drafted from the service files: staging shows the drafts, production shows only versions the owner approves and publishes ([[OWN-DEC-84]], amended 2026-10-12). Pages state the service's limits ([[OWN-DEC-51]]) and never invent prices, completion times, credentials or guarantees ([[RULE-NO-INVENTED-FACTS]]).

- customer-facing description (registry 04, label **FACT** + **PROPOSED**): Draft plan copy (unapproved): "showroom-quality results", "absolutely zero mess left behind", "laser-straight cut-lines", "a high-hiding foundation primer followed by a minimum of two coats of premium, eco-friendly (Zero-VOC) latex paint" - a full primer coat conflicts with SOP spot priming (C-PT01-04), Zero-VOC by default conflicts with client brand choice (C-PT01-05), guarantee wording has no policy (C-PT01-07). PROPOSED neutral text: interior wall, ceiling and trim painting with furniture and floor protection, minor surface repair, spot priming of repairs and two coats of the customer-approved product, color and sheen (source: plan L8-17)

Purpose (SOP section 1):

- PROPOSED purpose, for owner and attorney review: protect the room and its contents, repair minor wall defects, spot-prime the repairs and apply the customer-approved paint, color and sheen to the interior walls in the approved scope, for PT-01 Professional Residential Interior Painting (source: spec Appendix B; spec PT-01.INT; original phases in section 12; 02 C-PT01-07 "propose a neutral purpose line for review").
- This SOP makes no outcome, safety, health or warranty promise to the customer; quality is judged by the observable checks in section 13 (source: 31 section 3.5 rule 5; spec QA-001).

Original opening statement, kept verbatim and flagged:

This Standard Operating Procedure guarantees flawless multi-coat interior coverage, razor-sharp cut-lines, and absolute property protection during residential transformations.

> FLAG: outcome claim - owner and attorney review (C-PT01-07). The sentence above promises "flawless" coverage, "razor-sharp" cut-lines and "absolute property protection", but no warranty or acceptance policy exists (Q-30-07), and the agreement's "Inclusions" clause incorporates this file by reference, so the sentence may be read as a customer term (effect not determined; HUMAN REVIEW: attorney licensed in KY/IN). It stays verbatim until a reviewed SOP version replaces it (31 section 5.2; Q-31-16). It is not a quality standard: section 13 lists the checks.

### Draft plan copy (`Main Plans/Painting Business.md`; not approved, claims unverified)

*Target Headline for Website: Transform Your Living Spaces with Flawless, Crisp Cut-Lines*

Your home is your sanctuary, and nothing updates a room faster or adds more immediate value than a premium coat of paint. Whether you want to brighten up a dark living room, create a modern accent wall in your master bedroom, or refresh your entire home with a clean, cohesive color palette, our interior painting specialists deliver showroom-quality results. Operating with maximum care, we treat your home with the utmost respect, ensuring crisp lines, rich colors, and absolutely zero mess left behind.

* **White-Glove Site Protection:** We move heavy furniture to the center of the room and cover all flooring, fixtures, and personal belongings with premium canvas drop cloths and protective plastic sheeting.
* **Surface Defect Repair:** Before a single drop of paint is applied, our team patches wall dents, repairs minor drywall cracks, and sands surfaces perfectly flat to ensure a smooth finish.
* **Precision Edge Cutting:** We don't rely on sloppy shortcuts. Our artisans execute sharp, laser-straight cut-lines along all baseboards, trim moldings, window frames, and ceiling borders.
* **Premium Multi-Coat Finish:** We apply a high-hiding foundation primer followed by a minimum of two coats of premium, eco-friendly (Zero-VOC) latex paint, providing rich color depth and long-lasting washability.

Claims the main plan flags for this service (each `unverified`, not publishable until approved):

- "Transform Your Living Spaces with Flawless, Crisp Cut-Lines": Headline - Reword; add disclosure ("Flawless"; older-coating disclosure missing (PT-01.HAZ "dust/lead in older coatings")) (reviewer: Attorney; EPA RRP-qualified reviewer for the disclosure)
- "absolutely zero mess left behind": GUAR - Remove (reviewer: Attorney)
- "premium, eco-friendly (Zero-VOC) latex paint": ENV - Remove unless the product is specified per job (reviewer: Attorney)
- "We apply a high-hiding foundation primer": SCOPE - Reword (reviewer: Owner)

## Request questions

- Guide 6.2 extra inputs / review needs: Rooms/surfaces, dimensions/condition, colors, occupancy, trim/ceilings.
- Spec intake (PT-01.INT): rooms/areas, colors/finish, paint brand/product if specified, wall condition, furniture/occupancy, repair scope.
- Answers follow [[OWN-DEC-91]] and [[HH-SVC-03]]: units shown beside each measurement, approximate values allowed, and "I don't know" stays unknown, never zero, safe or approved. The sources set no per-service unit list.
- Estimate route: online when the details and photos are enough, a site visit when inspection or measurements are needed ([[OWN-DEC-99]], [[HH-SVC-04]]); a customer preference for a remote estimate never overrides a required site or qualification review.
- Service conditions: [[FACT-SVC-HOME-AGE-LIMITS]] (home-age limits apply to this service).

## Included work (SOP section 2, "In scope")

- Room preparation and protection: moving lightweight furniture out, shifting and wrapping heavy furniture, floor protection, removing cover plates and masking trim (source: original Phase 1).
- Surface restoration: inspecting walls, filling nail holes, dents and cracks with spackle, sanding and spot-priming the repairs, subject to the older-coating HOLD before "Pole Sanding" (source: original Phase 2; section 12, C-PT01-01).
- Minor wall repair up to an owner-set size; larger repairs become DW-01 lines on the same estimate, with one minimum per bundle (source: 04 section 5.3 rule (a), PROPOSED; `<owner decision: patch-size threshold>`; Q-04-08).
- Cutting in along the ceiling boundary and the taped trim lines, and rolling the wall fields with the customer-approved product, color and sheen (source: original Phases 3 and 4; spec PT-01.INT "colors/finish, paint brand/product if specified").
- Tape removal, refitting the removed plates and covers, an inspection sweep with touch-up, and site restoration (source: original Phase 5).

## Excluded work and limits

HandyHub never performs licensed or unsafe scope: [[FACT-SVC-EXCLUDED-SCOPE]]; suspected hazardous material: [[FACT-SVC-SUSPECTED-HAZMAT]]; access equipment: [[FACT-SVC-ACCESS-EQUIPMENT]].

### SOP section 2, "Out of scope"

- Painting ceilings: Not covered - pending review (C-PT01-06). Pricing sells "Add Ceiling"; this SOP treats the ceiling only as a cut-line boundary.
- Painting trim, baseboards, window casings, doors and door frames: Not covered - pending review (C-PT01-06). This SOP masks them; pricing sells "Walls + Trim & Baseboards" and "Walls + Trim, Baseboards & Doors".
- Closet interiors: Not covered - pending review (C-PT01-06). Pricing sells "Closet Interiors".
- A full primer coat over the walls: Not covered - pending review (C-PT01-04). This SOP spot-primes raw spackle patches; the main plan promises a "high-hiding foundation primer" and the agreement's "Inclusions" clause names "priming". The owner decides: full coat, spot-prime only or a separate option (spec EST-005).
- Spray application: not covered; the spec card allows a sprayer only "if approved", and no approval exists (source: spec PT-01.TLS; 04 PT-01 "required tools").
- Wallpaper removal (PT-04), drywall repair above the patch-size threshold (DW-01), exterior surfaces, lead hazard work or abatement, mold or moisture remediation, and electrical or HVAC device work: no step covers them; the owner decides which become customer-visible exclusions (source: 04 PT-01 "exclusions").
- Moving heavy home-theater setups, pianos and fine art collections: the customer's task before arrival (source: agreement "Exclusions" clause, itself under attorney review).

### SOP section 2, "Do not perform"

PROPOSED entries, pending review by the qualified safety professional and the licensing reviewer (source: 31 section 3.3; spec UXE-010).

| # | Do not | Reason class | Source | Instead |
|---|---|---|---|---|
| 1 | Electrical, plumbing, gas or HVAC work outside the approved scope or requiring a licensed trade | Licensed trade | spec START-011 "unapproved electrical/plumbing/gas/structural scope"; master section 1.3 | Stop and escalate; the office refers the work |
| 2 | Structural work, meaning cutting, removing, sistering or adding load-bearing members, ledgers, footings or framing, unless it is in the approved scope with the required qualified review | Structural | spec START-011; master section 1.3 | Stop and escalate |
| 3 | Disturbing suspect asbestos, lead paint or mold: stop and escalate | Hazardous material | spec START-011 "suspect hazardous materials"; owner facts 2026-10-02 "Unknown is not safe" | Leave it undisturbed; stop and escalate |
| 4 | Work that is not in the approved scope or an approved change order | Out of scope | spec JOB-005, JOB-010, FIN-008, AT-033 | Record the customer's request; change order |
| 5 | Working at height or using access equipment beyond the approved height and access policy | Policy | spec HI-06.SAF "beyond approved height/access policy"; spec DW-04.TLS "scaffolds/stilts only under approved policy" | Stop; no height and access policy exists yet (02 G-005; X-12; C-PT01-02) |
| 6 | Mixing or sequencing chemicals in any way the approved step and the product SDS do not allow | Policy | spec CL-01.SAF "never mix incompatible chemicals"; X-09 | Stop and escalate; mixing or dilution only as the label states (29 section 8.2 control 8) |
| 7 | Recording, photographing or sending customer passwords, master codes or site access codes outside the app's secured fields | Policy (privacy) | spec COM-002; owner facts 2026-10-02; 27 AUTH-009 | Use the secured fields only |
| 8 | Promising results, warranties, safety, health or code compliance to the customer | Policy | master sections 1.4, 17 and 29; spec CL-07.SAF | Refer the question to the owner (section 17) |
| 9 | Sanding, scraping or any other aggressive disturbance of existing coatings before the older-coating assessment; a build year before 1978 or unknown means no disturbance until a qualified person records the lead disposition | Hazardous material | spec PT-01.SAF "assess older coatings before aggressive disturbance"; 31 section 10; C-PT01-01 | Stop; HOLD before "Pole Sanding" (section 12); escalate |
| 10 | Electrical device work beyond removing and refitting cover plates: never touch wiring, devices or thermostat controls | Licensed trade | 31 section 10; C-PT01-V01; 04 PT-01 "permit/license flags" | Stop; report a damaged device or exposed wiring; the office refers the work to a licensed electrician or HVAC professional |
| 11 | Suspected asbestos / lead paint / mold: stop and escalate (source: spec START-011), including old paint textures and joint compound met by sanding and moisture-damaged drywall found while patching | Hazardous material | spec START-011; 36 section 3.4 rule 5; X-13 | Leave it undisturbed; stop and escalate |
| 12 | Spray application without a recorded approval | Policy | spec PT-01.TLS "sprayer if approved"; 04 PT-01 "required tools" | Brush and roll as in section 12 |
| 13 | Moving heavy home-theater setups, pianos or fine art collections | Out of scope | agreement "Exclusions" clause (under attorney review) | Do not move them; record and escalate |

- exclusions (registry 04, label **FACT** + **GAP** + **PROPOSED**): Agreement §1: client moves heavy home-theater electronics, pianos and fine art before arrival; a color change after application is a new project billed as a change order. GAP: lead hazard work, mold/moisture remediation, wallpaper removal (PT-04), drywall repair beyond minor (DW-01), exterior surfaces, electrical/HVAC device work, furniture weight limits. PROPOSED boundary (owner decides): PT-01 includes repairs up to an owner-set patch size, larger repairs become DW-01 lines on the same estimate with one minimum; trim painting is a PT-01 line (source: agreement L8-9; plan L15; registry boundary rules)

## Hazards and human-review flags

- Spec hazards (PT-01.HAZ): ladders, VOC/chemical exposure, dust/lead in older coatings, slips, customer property damage.
- Spec stop-work guidance (PT-01.SAF): ventilate; protect contents; assess older coatings before aggressive disturbance; ladder controls; follow product instructions.
- permit/license flags (registry 04, label **OPEN QUESTION** + **GAP**): None in any PT-01 file. OPEN QUESTION (HUMAN REVIEW): whether EPA RRP applies when sanding or scraping painted surfaces in pre-1978 housing and whether HandyHub holds or will obtain firm/renovator certification (EPA RRP-certified renovator + attorney); painting-contractor registration in each KY/IN municipality (legal-compliance-administrator; unknown must not default to "no permit"); thermostat-face removal must not extend to wiring or HVAC controls (licensed electrician/HVAC); insurance not referenced (broker; no coverage asserted) (source: owner facts; risk-triage playbook; SOP L9; spec HND-005)
- Reviewers named in the vault files' front matter: qualified safety reviewer; owner; Spanish translation reviewer; licensed trade professional (EPA RRP-certified renovator); accredited asbestos inspector (old textures and joint compound, X-13); licensed electrician or HVAC professional (thermostat-face handling, C-PT01-V01); attorney licensed in KY/IN (flagged outcome-guarantee sentence, C-PT01-07); CPA (tax treatment); attorney licensed in KY/IN (deposit and fee policy, C-PT01-03, C-PT01-08); qualified safety professional (high-ceiling surcharge, C-PT01-02); safety reviewer (PPE/hazmat); EPA RRP-certified renovator (older-coating dust controls, C-PT01-01); qualified English/Spanish reviewer (Arabic headings, C-PT01-12); attorney licensed in KY/IN; insurance broker; CPA (deposit, draw schedule and tax treatment, C-PT01-03); EPA RRP-certified renovator (lead-safe information for older homes, Q-30-18). Boundaries: [[RULE-HUMAN-REVIEW]].

### Required worker qualifications (SOP section 4)

TBD — requires review by safety-liability-manager and a qualified person; owner to approve.
- No company qualification policy or capability tags exist yet (source: 31 section 3.1; spec SCH-003).
- Work that disturbs existing coatings in a home built before 1978 or of unknown age: renovator and firm certification requirements are not determined; until they are, the HOLD before "Pole Sanding" applies (source: 04 PT-01 "permit/license flags"; spec START-010; Q-31-07).
- Ladder and access-equipment use follows the future height and access policy, including who may use which equipment (source: X-12; Q-31-09).
- Moving heavy furniture: whether two people are required and any weight limit are owner and qualified-safety-reviewer decisions; none exists yet (source: original "Furniture Consolidation" step; 04 PT-01 "hazards" and "exclusions"; owner facts 2026-10-02 "Initially two employees").
- Spray application: not approved, so no qualification is defined (source: spec PT-01.TLS "sprayer if approved").

### Hazards (SOP section 9)

Severity and the order of controls (eliminate, substitute, engineer, administrative, then PPE) are set by the qualified safety professional: TBD (source: 31 section 3.1; safety-liability-manager skill "Prefer the hierarchy of controls").

| Hazard | Source | Draft controls (pending review) | Stop-work trigger | Reviewer |
|---|---|---|---|---|
| Lead dust from sanding or scraping existing coatings | spec PT-01.HAZ "dust/lead in older coatings"; original "Pole Sanding"; C-PT01-01; X-13 | Build year recorded at intake; HOLD before "Pole Sanding" for homes built before 1978 or of unknown age; no abatement or lead-safe method is given here | Build year before 1978 or unknown; a suspected lead-containing coating | EPA RRP-certified renovator; attorney (applicability) |
| Asbestos in old textures or joint compound disturbed by sanding | original "Pole Sanding" ("remove old paint textures"); risk-triage playbook (potential asbestos goes to competent assessment); X-13 | Leave suspect material undisturbed; stop and escalate | Suspect texture or compound | Accredited asbestos inspector |
| Falls from ladders or other access equipment at the ceiling cut-line and in high rooms | spec PT-01.HAZ "ladders"; spec PT-01.SAF "ladder controls"; original "Ceiling and Trim Cut"; pricing "High Ceiling Surcharge"; C-PT01-02; X-12 | Access equipment only under an approved height and access policy (none exists; 02 G-005); HOLD before "Ceiling and Trim Cut" | No policy, work beyond it, or no suitable access equipment on site | Qualified safety professional |
| VOC and chemical exposure of workers and occupants from paint, primer, spackle and cleaner | spec PT-01.HAZ "VOC/chemical exposure"; spec PT-01.SAF "ventilate", "follow product instructions"; inventory chemical lines | Reviewed SDS on file; ventilation and re-occupancy per the label; occupants kept out (HOLD before "Defect Patching") | No SDS; ventilation not possible as the label requires; occupants cannot be kept out | Qualified safety professional |
| Sanding dust in the room and on contents | spec PT-01.TLS "sanding/HEPA vacuum"; original "Pole Sanding" | HEPA capture and dust control TBD - pending safety review; contents wrapped in Phase 1 | TBD | Qualified safety professional |
| Slips and trips on drop cloths, film and tools | spec PT-01.HAZ "slips"; original "Floor Defense" ("Secure edges ... to prevent sliding") | The original step secures cloth edges; other controls TBD | TBD | Qualified safety professional |
| Damage to customer property: furniture, floors, fixtures, drips | spec PT-01.HAZ "customer property damage"; spec PT-01.SAF "protect contents"; original Phase 1 | Protection steps in Phase 1; existing-condition photos (spec START-008) | Contents cannot be protected; damage found before or during work (spec JOB-004) | Owner |
| Manual handling of heavy furniture | original "Furniture Consolidation" ("Shift heavy furniture (sofas, large tables)"); 04 PT-01 "hazards" | Weight limit and two-person rule TBD; items the agreement excludes are not moved | TBD | Qualified safety professional |
| Exposed electrical devices or thermostat wiring after cover removal | original "Hardware Removal"; C-PT01-V01; 04 PT-01 "permit/license flags" | Cover plates only; no wiring, device or control work; damaged items reported; everything removed is refitted (section 12 holds) | Damaged device, exposed wiring, or a task beyond removing and refitting covers | Licensed electrician or HVAC professional; qualified safety professional |
| Occupants, children and pets near wet paint, tools and products | X-11; inventory "Zero-VOC Odor-Free Paints" line (nursery rooms) | Kept out of the work area; re-occupancy per the label | Occupants or pets cannot be kept away | Qualified safety professional |
| Moisture or suspected mold found while patching | spec JOB-004; spec START-011 | Stop, photograph and escalate; no remediation | Moisture, soft or stained drywall, suspected mold | Qualified safety professional (company mold rule pending, Q-31-10) |

## Warranty or callback

- warranty or callback policy (registry 04, label **GAP** + **OPEN QUESTION**): No warranty or callback policy and none is proposed here; SOP "guarantees" and plan "absolutely zero mess" are not a policy (C-PT01-07; HUMAN REVIEW: attorney). Care/cure notes via QA-008; return visits classified per CX-007 and QA-010 (source: SOP L3; plan L11; spec QA-008, CX-007, QA-010)
