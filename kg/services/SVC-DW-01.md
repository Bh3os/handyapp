---
id: SVC-DW-01
type: service
title: "Patching & Repair"
status: active
area: business
links:
  decided_by: ["[[OWN-DEC-04]]", "[[OWN-DEC-33]]", "[[OWN-DEC-84]]", "[[OWN-DEC-51]]", "[[OWN-DEC-102]]", "[[OWN-DEC-108]]", "[[OWN-DEC-66]]"]
  uses: ["[[SOP-DW-01]]", "[[FACT-INVENTORY-DW-01]]", "[[FACT-PRICING-PER-JOB]]", "[[FACT-SVC-EXCLUDED-SCOPE]]"]
  constrained_by: ["[[RULE-HUMAN-REVIEW]]", "[[RULE-SAFETY-GATES]]", "[[RULE-NO-INVENTED-FACTS]]", "[[FACT-SVC-EXCLUDED-SCOPE]]", "[[FACT-SVC-SUSPECTED-HAZMAT]]", "[[FACT-SVC-ACCESS-EQUIPMENT]]", "[[FACT-SVC-HOME-AGE-LIMITS]]", "[[FACT-SVC-DW01-REPAIR-SCOPE]]"]
  part_of: ["[[C01]]", "[[C02]]"]
  related: ["[[FACT-PRICING-DW-01]]", "[[FACT-AGREEMENT-DW-01]]", "[[FACT-SERVICE-AREA]]", "[[FACT-BRAND-IDENTITY]]", "[[FACT-SVC-NAMES]]", "[[HH-SVC-01]]", "[[HH-SVC-02]]", "[[HH-SVC-03]]", "[[HH-SVC-04]]", "[[OWN-DEC-91]]", "[[OWN-DEC-99]]", "[[OWN-DEC-127]]"]
source: "guide 6.2; vault 04-service-registry DW-01; spec section 17 DW-01; Standard Of Operations/sop drywall-patching.md; Main Plans/Dry Wall Business.md"
---
Category: Drywall. Catalog name (guide 6.2): Patching & Repair. Canonical name (spec Appendix B): Professional Patching, Repair & Handyman Services. Slug: `drywall-patching`. Brand and service area: [[FACT-BRAND-IDENTITY]], [[FACT-SERVICE-AREA]]; naming: [[FACT-SVC-NAMES]].

In the launch set: all 26 services are in scope and launch ([[OWN-DEC-04]], [[OWN-DEC-33]]); reported capability is not proof of insurance, qualifications or equipment. Worker checklist: [[SOP-DW-01]] (active, pending competent review for production use, [[OWN-DEC-108]]). Pricing: each job is priced individually on its own estimate ([[FACT-PRICING-PER-JOB]]); the vault price list [[FACT-PRICING-DW-01]] is superseded. Tools and materials: [[FACT-INVENTORY-DW-01]]. Draft agreement clauses: [[FACT-AGREEMENT-DW-01]] (attorney review; customers approve the estimate terms of [[OWN-DEC-127]]).

Vault files: SOP `Standard Of Operations/sop drywall-patching.md`; Pricing `Pricing/pricing-drywall-patching.md`; Inventory `Required inventory/inventory-drywall-patching.md`; Agreement `Service Agreements/contract-drywall-patching.md`; main plan `Main Plans/Dry Wall Business.md` ("🩹 1. Professional Patching, Repair & Handyman Services").

- aliases (registry 04, label **FACT** + **OPEN QUESTION**): plan heading "1. Professional Patching, Repair & Handyman Services"; website headline "Flawless Wall & Ceiling Repairs in a Single Day"; pricing title "Regional Pricing: Patching & Handyman Repairs (Kentuckiana)"; inventory title "Inventory & Tools: Patching & Handyman Repairs", tag `#service/patching`; agreement title "Service Agreement: Drywall Patching & Repairs (Kentuckiana)", scope phrase "localized drywall repair and patching services"; agreement SOP reference `sop-drywall-patching.md` (no such file); SOP title "SOP: Meticulous Drywall Patching & Repairs"; SOP file `sop drywall-patching.md` (space, not hyphen); party placeholder `[Your Drywall Company Name]`. Whether "Handyman Services" reaches beyond drywall (overlap with HI-01..HI-11) is an owner question (C-DW01-14) (source: plan L8-9; pricing L1; inventory L1-2; agreement L1, L4, L7; SOP L1; MOC Dashboard)

## Customer description

No owner-approved customer description exists in the sources. Service-page content is drafted from the service files: staging shows the drafts, production shows only versions the owner approves and publishes ([[OWN-DEC-84]], amended 2026-10-12). Pages state the service's limits ([[OWN-DEC-51]]) and never invent prices, completion times, credentials or guarantees ([[RULE-NO-INVENTED-FACTS]]).

- customer-facing description (registry 04, label **FACT** + **PROPOSED**): Draft plan copy (unapproved): headline above plus "rapid-response", "cleanly, quickly, and invisibly", "completely undetectable", "prevent future sagging or cracking" - time and outcome claims with no approved basis (C-DW01-05). PROPOSED neutral text: repair of localized wall and ceiling drywall damage (holes, cracks, utility cut-outs): cut out, back, patch, tape, feather and sand; primer, texture match and paint only when included in the approved estimate (source: plan L9-18)

Purpose (SOP section 1):

- Repair localized drywall damage (holes, cracks, utility cut-outs) by cutting out, backing, patching, taping, feathering, sanding and priming, as written in section 12, for DW-01 Professional Patching, Repair & Handyman Services (source: spec Appendix B; 04 customer-facing description, PROPOSED neutral text).
- Texture matching and painting are not covered (section 2); whether primer is included is an owner decision (C-DW01-07; Q-28-21).
- This draft makes no outcome promise to the customer and is not field-approved (source: 31 section 3.5 rule 5; owner facts 2026-10-02).

Original intro statement, kept verbatim:

This Standard Operating Procedure ensures that all minor to medium wall and ceiling punctures, water damages, and stress cracks are repaired to an invisible finish in a single visit.

> FLAG: outcome claim - owner and attorney review (C-DW01-05). The statement above promises work "repaired to an invisible finish in a single visit". The spec's completion standard is "flat/feathered finish appropriate to scope, texture match within agreed tolerance" (spec DW-01.QAC), finish-level terms have no shared definition (X-26), and no step states the drying or recoat times that a single visit would need. The statement stays verbatim until an approved SOP version replaces it (Q-31-16).

> FLAG (C-DW01-08): scope gap - large panel patch. The statement above limits this SOP to "minor to medium" damage, while the pricing file also sells a "Large Panel Patch" bracket for "Serious water damage or ceiling leaks"; no step covers large or overhead panels (section 2).

### Draft plan copy (`Main Plans/Dry Wall Business.md`; not approved, claims unverified)

*Target Headline for Website: Flawless Wall & Ceiling Repairs in a Single Day*

Life happens, and your walls bear the brunt of it. Whether a plumber had to cut into your ceiling to fix a pipe leak, a moving crew gouged a hallway corner, or a heavy door handle punched a neat hole through your drywall, leaving damaged drywall exposed ruins your home’s visual appeal. Our rapid-response patching and repair service is designed to fix these structural blemishes cleanly, quickly, and invisibly.

* **Precision Extraction:** We cut away crumbling, unstable, or water-damaged drywall back to the center of the structural studs to ensure a rock-solid foundation for the fix.
* **Structural Bridging:** We secure sturdy wood backing or mesh-tape support bridges across the opening to prevent future sagging or cracking.
* **Seamless Blending:** We apply high-performance setting compounds (hot-mud) in thin, layered skins, meticulously feathering out the edges so the transition patch is completely undetectable.
* **Surface Priming:** We sand the patch perfectly flat and apply a high-quality primer coat, leaving your wall fully prepped for final paint matching.

Claims the main plan flags for this service (each `unverified`, not publishable until approved):

- "Flawless Wall & Ceiling Repairs in a Single Day": Headline - Remove (Quality and time promise) (reviewer: Attorney)
- "Our rapid-response patching and repair service": CAP - Remove (reviewer: Owner)
- "the transition patch is completely undetectable": GUAR - Remove (reviewer: Attorney)
- "to prevent future sagging or cracking": GUAR - Remove (reviewer: Attorney)

## Request questions

- Guide 6.2 extra inputs / review needs: Damage size/count/cause, moisture, texture, painting inclusion.
- Spec intake (DW-01.INT): hole/damage size/location, cause of damage, active leak status, wall/ceiling type, texture/finish, paint responsibility.
- Answers follow [[OWN-DEC-91]] and [[HH-SVC-03]]: units shown beside each measurement, approximate values allowed, and "I don't know" stays unknown, never zero, safe or approved. The sources set no per-service unit list.
- Estimate route: online when the details and photos are enough, a site visit when inspection or measurements are needed ([[OWN-DEC-99]], [[HH-SVC-04]]); a customer preference for a remote estimate never overrides a required site or qualification review.
- Service conditions: [[FACT-SVC-HOME-AGE-LIMITS]] (home-age limits apply to this service); [[FACT-SVC-DW01-REPAIR-SCOPE]] (general handyman repairs included in this service).

## Included work (SOP section 2, "In scope")

- Localized wall damage within the "minor to medium" scope of the original intro: squaring, cutting out, backing, inserting and fastening a replacement panel, taping, two coats, sanding, light inspection, dust wiping and priming, as written in section 12 (source: original intro; section 12).
- Ceiling punctures named in the original intro: only after an approved height and access policy and reviewed overhead controls exist; until then those tasks stay blocked (source: spec DW-01.HAZ "ladder for ceilings"; 02 G-005; X-12; section 3).
- Water damages named in the original intro: only after the leak or water source is confirmed resolved and the moisture and mold checks are clear (source: spec DW-01.SAF; HOLDs at the start of section 12).
- Intake facts the estimate and the job rely on: hole/damage size/location, cause of damage, active leak status, wall/ceiling type, texture/finish, paint responsibility (source: spec DW-01.INT).

## Excluded work and limits

HandyHub never performs licensed or unsafe scope: [[FACT-SVC-EXCLUDED-SCOPE]]; suspected hazardous material: [[FACT-SVC-SUSPECTED-HAZMAT]]; access equipment: [[FACT-SVC-ACCESS-EQUIPMENT]].

### SOP section 2, "Out of scope"

- Not covered - pending review (C-DW01-04): texture matching, which the agreement "Texture Disclaimer" clause promises ("expert texture matching"). No step applies texture; "Dust-Controlled Sanding" only blends the feathered edges into the existing texture (source: 31 section 10).
- Not covered - pending review (C-DW01-08): large panel patches as priced in the pricing file "Large Panel Patch" bracket ("Serious water damage or ceiling leaks", "structural cutting to joists", "hanging fresh replacement panels"), and any overhead panel work. Placeholder: "Large panel / ceiling patch - PENDING competent review" (source: 02 C-DW01-08).
- Not covered - pending review (C-DW01-07): painting and color matching, sold in the pricing file as the "Paint & Primer Match Add-on" and excluded by the agreement unless itemized; no painting step exists. Whether primer is included is an owner decision (Q-28-21).
- No step covers mold remediation, hazardous-material work, or leak, plumbing or electrical repair; such conditions stop the work and are referred. Customer-facing exclusions are an owner and attorney decision (source: 04 exclusions row, GAP; spec EST-003; X-06).
- Owner question: whether "Handyman Services" in the canonical name reaches beyond drywall repair (source: 04 aliases row).

### SOP section 2, "Do not perform"

PROPOSED entries, pending review by the qualified safety professional and the licensing reviewer (source: 31 section 3.3 and section 10; spec UXE-010).

| # | Do not | Reason class | Source | Instead |
|---|---|---|---|---|
| 1 | Electrical, plumbing, gas or HVAC work outside the approved scope or requiring a licensed trade | Licensed trade | spec START-011 "unapproved electrical/plumbing/gas/structural scope"; master section 1.3 | Stop and escalate; the office refers the work |
| 2 | Structural work, meaning cutting, removing, sistering or adding load-bearing members, ledgers, footings or framing, unless it is in the approved scope with the required qualified review | Structural | spec START-011; master section 1.3 | Stop and escalate |
| 3 | Disturbing suspect asbestos, lead paint or mold: stop and escalate | Hazardous material | spec START-011 "suspect hazardous materials"; owner facts 2026-10-02 "Unknown is not safe" | Leave it undisturbed; stop and escalate |
| 4 | Work that is not in the approved scope or an approved change order | Out of scope | spec JOB-005, JOB-010, FIN-008, AT-033 | Record the customer's request; change order |
| 5 | Working at height or using access equipment beyond the approved height and access policy | Policy | spec HI-06.SAF "beyond approved height/access policy"; spec DW-04.TLS "scaffolds/stilts only under approved policy" | Stop; no height and access policy exists yet (02 G-005; X-12) |
| 6 | Mixing or sequencing chemicals in any way the approved step and the product SDS do not allow | Policy | spec CL-01.SAF "never mix incompatible chemicals"; X-09 | Stop and escalate; mix compounds and use primer only as the product label and SDS direct |
| 7 | Recording, photographing or sending customer passwords, master codes or site access codes outside the app's secured fields | Policy (privacy) | spec COM-002; owner facts 2026-10-02; 27 AUTH-009 | Use the secured fields only |
| 8 | Promising results, warranties, safety, health or code compliance to the customer | Policy | master sections 1.4, 17 and 29; spec CL-07.SAF "do not make unsupported indoor-air-quality claims" | Refer the question to the owner (section 17) |
| 9 | Structural load-bearing work, including stud replacement and framing remediation for foundation movement, even where the agreement's "Exclusions" clause would let it be "itemized as a paid add-on" | Structural | 31 section 10; agreement "Exclusions" clause (C-DW01-02, critical, recorded in the agreement review notes) | Stop and escalate; whether DW-01 ever offers such work is an owner, attorney and structural engineer decision |
| 10 | Relocating, repairing or extending electrical wiring or plumbing found in or behind the opening | Licensed trade | 31 section 10; spec START-010, START-011 | Stop and escalate; the office refers the work to a licensed trade |
| 11 | Suspected asbestos / lead paint / mold: stop and escalate (source: spec START-011). This service cuts, scores and sands existing painted drywall, plaster, compound and texture and repairs water damage | Hazardous material | spec START-011; 36 section 3.4 rule 5; section 12 "Clean Cut" and "Dust-Controlled Sanding"; X-06; X-13 | Leave it undisturbed; stop and escalate (HOLDs in section 12) |

- exclusions (registry 04, label **FACT** + **GAP** + **PROPOSED**): Agreement §1 excludes "Structural load-bearing stud replacement, framing remediation for foundational shifting, and final aesthetic color-matching paint coats" but adds "unless explicitly itemized as a paid add-on", which makes structural work purchasable (C-DW01-02; HUMAN REVIEW: structural engineer, building department, attorney). Pricing: paint excluded unless the client supplies it. GAP: no exclusion for mold remediation, hazardous-material work, leak/plumbing/electrical repair or texture beyond agreed tolerance (EST-003). PROPOSED boundary (owner decides): wall texture matching beyond the patch is a DW-01 line item and DW-02 covers ceilings; color-match painting follows PT-01 rules (source: agreement L8; pricing L15, L29; spec EST-003; registry boundary rules)

## Hazards and human-review flags

- Spec hazards (DW-01.HAZ): hidden utilities, silica/dust, ladder for ceilings, possible mold/moisture, sharp tools.
- Spec stop-work guidance (DW-01.SAF): confirm leak/source resolved; scan before cutting; isolate dust; stop on mold/suspect hazardous material or extensive concealed damage.
- permit/license flags (registry 04, label **OPEN QUESTION** + **GAP**): None recorded in any DW-01 file. OPEN QUESTION (HUMAN REVIEW): whether EPA RRP applies when cutting or sanding painted surfaces in pre-1978 homes (EPA RRP-certified renovator + attorney); local contractor/handyman registration in each KY/IN municipality served (legal-compliance-administrator + attorney; unknown must not default to "no permit"); wiring, plumbing or gas found behind a patch = licensed trade and a START-010 hold (licensed electrician/plumber); the structural add-on in agreement §1 needs structural-engineer and building-department review before any sale (source: owner facts; risk-triage playbook; spec START-010, HND-005; agreement L8)
- Reviewers named in the vault files' front matter: qualified safety reviewer; owner; Spanish translation reviewer; licensed trade professional; EPA RRP-certified renovator; accredited asbestos inspector; mold assessor; CPA (tax treatment); attorney licensed in KY/IN (fee and outcome wording); qualified safety professional (hazard flags); safety reviewer (PPE/hazmat); attorney licensed in KY/IN; insurance broker; structural engineer. Boundaries: [[RULE-HUMAN-REVIEW]].

### Required worker qualifications (SOP section 4)

TBD — requires review by safety-liability-manager and a qualified person; owner to approve.
- No company qualification policy or capability tags exist yet; tags are enforced by scheduling and Start Job (source: 31 section 3.1; spec SCH-003, START-010; Q-31-01).
- Inputs for that review: cutting and scoring with knives and saws (spec DW-01.HAZ "sharp tools"); ladder work for ceilings (spec DW-01.HAZ); whether EPA RRP certification applies to cutting or sanding painted surfaces in pre-1978 homes, an open question for an EPA RRP-certified renovator and an attorney (Q-31-07; 04 permit/license flags row).
- Lone work: the inventory file describes a "single-technician mobile repair rig"; no limit yet on patch size or overhead work for one person (OPEN QUESTION; owner with the qualified safety professional).

### Hazards (SOP section 9)

Draft entries for the qualified safety professional; severity and the final controls, in the order eliminate, substitute, engineer, administrative, then PPE, are set by that reviewer (source: 31 section 3.1 row 9; safety-liability-manager "Prefer the hierarchy of controls"; Q-31-18).

| Hazard | Source | Draft controls (pending review) | Stop-work trigger | Reviewer |
|---|---|---|---|---|
| Hidden utilities (wiring, pipes) behind the patch | spec DW-01.HAZ "hidden utilities"; section 12 "Structural Scan" | Scan before cutting (spec DW-01.SAF); HOLD before "Clean Cut"; no relocation of services (section 2) | A service in the cut path or an uncertain scan result | Qualified safety professional; licensed electrician or plumber for any service found |
| Silica and other dust from cutting, mixing and sanding | spec DW-01.HAZ "silica/dust"; section 12 "Clean Cut", "Dust-Controlled Sanding" | Isolate dust (spec DW-01.SAF); isolation method, HEPA use and dust class set by the reviewer; PPE TBD (section 6) | Dust cannot be kept out of occupied areas | Qualified safety professional (whether respirable-silica rules apply is not concluded) |
| Ladder work for ceilings; overhead panel handling | spec DW-01.HAZ "ladder for ceilings"; pricing file "Ceiling Repair Premium" and "Large Panel Patch" | Only under an approved height and access policy, which does not exist (02 G-005; X-12); no overhead procedure (C-DW01-08) | No approved policy or no suitable access equipment | Qualified safety professional |
| Possible mold and moisture; active leaks | spec DW-01.HAZ "possible mold/moisture"; pricing file "Serious water damage or ceiling leaks" | Leak or source confirmed resolved; moisture check method set by the reviewer; HOLDs at the start of section 12 and after "Clean Cut" | Active leak, wet material or suspected mold growth; suspected mold is a critical hold until the company mold definition exists (Q-31-10; X-06) | Qualified mold assessor or industrial hygienist |
| Sharp tools | spec DW-01.HAZ "sharp tools"; section 12 "Clean Cut", "Beveling Edges" | Tool and blade handling per manufacturer instructions; PPE TBD (section 6) | TBD - qualified safety reviewer | Qualified safety professional |
| Older painted drywall, plaster, compound or texture (possible lead paint or asbestos) | section 12 "Clean Cut" and "Dust-Controlled Sanding"; spec DW-01.SAF "suspect hazardous material"; X-13 | Build year recorded; unknown or pre-1978 = HOLD for RRP review; suspect material is not disturbed | Suspect hazardous material (spec START-011) | EPA RRP-certified renovator; accredited asbestos inspector |
| Extensive concealed damage or damaged framing found after opening | spec DW-01.SAF; section 12 "Clean Cut" | HOLD after "Clean Cut": inspect the cavity and record findings (spec JOB-004) | Extensive concealed damage or a structural concern (critical hold, 31 section 8.3) | Qualified safety professional; structural engineer for framing |
| Setting compound, ready-mix compound and primer-sealer (chemical products) | inventory file; section 12 "First Coat (Setting Mud)" and "Sealing Primer" | Reviewed SDS before use; label directions only | A product without a reviewed SDS is not used | Qualified safety professional |
| Occupants, children and pets near the work and its dust | X-11; spec APXA-002 "identify pets/occupants" | Kept away from the work area (section 5) | Aggressive occupant or animal (spec START-011) | Qualified safety professional |

## Warranty or callback

- warranty or callback policy (registry 04, label **GAP** + **OPEN QUESTION**): No warranty or callback policy exists and none is proposed here. Agreement §1 disclaims a "100% molecular texture blend" yet states "seamless flat feathering will be achieved"; plan claims "prevent future sagging or cracking" (C-DW01-05; HUMAN REVIEW: attorney). Return visits must be linked and classified (CX-007, QA-010); care notes via QA-008 (source: agreement L9; plan L16-17; spec CX-007, QA-008, QA-010)
- Governed now by: the 90-day workmanship warranty of [[FACT-WARRANTY]] ([[OWN-DEC-135]]), counted from the reviewed completion date; a claim opens a case with return-visit punch items ([[HH-QA-07]]). No warranty exclusions are defined; any come only from attorney review ([[OQ-ATTORNEY-TERMS]]).
