---
id: SVC-HI-04
type: service
title: "TV Mounting & Wire Hiding"
status: active
area: business
links:
  decided_by: ["[[OWN-DEC-04]]", "[[OWN-DEC-33]]", "[[OWN-DEC-84]]", "[[OWN-DEC-51]]", "[[OWN-DEC-102]]", "[[OWN-DEC-108]]"]
  uses: ["[[SOP-HI-04]]", "[[FACT-INVENTORY-HI-04]]", "[[FACT-PRICING-PER-JOB]]", "[[FACT-SVC-EXCLUDED-SCOPE]]"]
  constrained_by: ["[[RULE-HUMAN-REVIEW]]", "[[RULE-SAFETY-GATES]]", "[[RULE-NO-INVENTED-FACTS]]", "[[FACT-SVC-EXCLUDED-SCOPE]]", "[[FACT-SVC-SUSPECTED-HAZMAT]]", "[[FACT-SVC-ACCESS-EQUIPMENT]]", "[[FACT-SVC-REFER-OUT-TASKS]]"]
  part_of: ["[[C01]]", "[[C02]]"]
  related: ["[[FACT-PRICING-HI-04]]", "[[FACT-AGREEMENT-HI-04]]", "[[FACT-SERVICE-AREA]]", "[[FACT-BRAND-IDENTITY]]", "[[FACT-SVC-NAMES]]", "[[HH-SVC-01]]", "[[HH-SVC-02]]", "[[HH-SVC-03]]", "[[HH-SVC-04]]", "[[OWN-DEC-91]]", "[[OWN-DEC-99]]", "[[OWN-DEC-127]]"]
source: "guide 6.2; vault 04-service-registry HI-04; spec section 17 HI-04; Standard Of Operations/sop-tv-mounting.md; Main Plans/Home Improvement Business.md"
---
Category: Home Improvement. Catalog name (guide 6.2): TV Mounting & Wire Hiding. Canonical name (spec Appendix B): Professional TV Wall Mounting & Wire Hiding. Slug: `tv-mounting`. Brand and service area: [[FACT-BRAND-IDENTITY]], [[FACT-SERVICE-AREA]]; naming: [[FACT-SVC-NAMES]].

In the launch set: all 26 services are in scope and launch ([[OWN-DEC-04]], [[OWN-DEC-33]]); reported capability is not proof of insurance, qualifications or equipment. Worker checklist: [[SOP-HI-04]] (active, pending competent review for production use, [[OWN-DEC-108]]). Pricing: each job is priced individually on its own estimate ([[FACT-PRICING-PER-JOB]]); the vault price list [[FACT-PRICING-HI-04]] is superseded. Tools and materials: [[FACT-INVENTORY-HI-04]]. Draft agreement clauses: [[FACT-AGREEMENT-HI-04]] (attorney review; customers approve the estimate terms of [[OWN-DEC-127]]).

Vault files: SOP `Standard Of Operations/sop-tv-mounting.md`; Pricing `Pricing/pricing-tv-mounting.md`; Inventory `Required inventory/inventory-tv-mounting.md`; Agreement `Service Agreements/contract-tv-mounting.md`; main plan `Main Plans/Home Improvement Business.md` ("📺 4. Professional TV Wall Mounting & Wire Hiding").

- aliases (registry 04, label **FACT**): "4. Professional TV Wall Mounting & Wire Hiding" (plan heading); "Professional TV Wall Mounting" (pricing, inventory, agreement and SOP titles, which drop "& Wire Hiding"); "TV wall mounting service" (plan overview); "secure flat-screen TV wall mounting and optional wire hiding" (agreement preamble); sub-scope labels "In-Wall Low-Voltage Wire Hiding" (plan, pricing), "In-Wall Low-Voltage Cable Hiding" (SOP) and "in-wall low-voltage cable fish lines" (agreement); website headline "Sleek, Ultra-Secure TV Mounting with Seamless Hidden Cable Routing" (tagline); file stems pricing-/inventory-/contract-/sop-tv-mounting (source: plan §4 L49-58; pricing L1, L22; inventory L1; agreement L1, L4, L11; SOP L1, L9)

## Customer description

No owner-approved customer description exists in the sources. Service-page content is drafted from the service files: staging shows the drafts, production shows only versions the owner approves and publishes ([[OWN-DEC-84]], amended 2026-10-12). Pages state the service's limits ([[OWN-DEC-51]]) and never invent prices, completion times, credentials or guarantees ([[RULE-NO-INVENTED-FACTS]]).

- customer-facing description (registry 04, label **FACT** + **PROPOSED**): Draft website copy only, not approved. Unreviewed claims: "Ultra-Secure"; "anchored with absolute structural safety"; bracket "anchored directly into a load-bearing column"; "completely wireless appearance" (C-HI04-06); "conduits" (C-HI04-14); height tuning (C-HI04-V01); consolidation of soundbars, streaming boxes and consoles (C-HI04-11). PROPOSED neutral summary (owner + handyhub-marketing review): mounting a customer's TV on a wall bracket fastened into verified framing, with optional low-voltage cable concealment where permitted; no electrical (line-voltage) work (source: plan §4 L50-59)

Purpose (SOP section 1):

- Fasten a TV wall bracket into wood framing studs (Option A) and, only where it is itemized on the approved estimate and permitted, route low-voltage cables inside the wall between two entry boxes (Option B), for HI-04 Professional TV Wall Mounting & Wire Hiding (source: spec Appendix B; original option headings in section 12; spec HI-04.MAT).
- No step yet covers attaching, lifting or hanging the TV (section 2; C-HI04-01).
- This SOP makes no load, safety or outcome promise to the customer (source: 31 section 3.5 rule 5).

### Draft plan copy (`Main Plans/Home Improvement Business.md`; not approved, claims unverified)

*Target Headline for Website: Sleek, Ultra-Secure TV Mounting with Seamless Hidden Cable Routing*

Ditch the bulky media console furniture and create a high-end, modern look by mounting your flat-screen TV flush against the wall. Attempting to mount a heavy modern screen by yourself can easily lead to uneven viewing angles or structural drywall failure if you miss a stud. Our TV wall mounting service ensures your screen is anchored with absolute structural safety using high-quality fixed, tilting, or full-motion articulated arm brackets.

- [ ] **True-Center Stud Anchoring:** We use advanced deep-scanning sensors to locate the exact center of structural wall studs, ensuring your TV bracket is anchored directly into a load-bearing column.
- [ ] **Aesthetic Ergonomic Height Tuning:** We verify perfect viewing angles relative to your seating layout, setting optimal screen heights before securing fasteners.
- [ ] **In-Wall Low-Voltage Wire Hiding:** We install professional in-wall cable pass-through conduits to run HDMI cords and low-voltage lines behind the drywall for a completely wireless appearance.
- [ ] **Peripheral Hardware Consolidation:** We mount and align attached soundbars, streaming media boxes, and gaming consoles neatly behind the screen array for a tidy setup.

Claims the main plan flags for this service (each `unverified`, not publishable until approved):

- "Sleek, Ultra-Secure TV Mounting with Seamless Hidden Cable Routing": Headline - Reword; state limit and add-on (Safety assurance; hidden routing is low-voltage only and a priced add-on) (reviewer: Licensed electrician (wording) + attorney)
- "ensures your screen is anchored with absolute structural safety": GUAR, SAFE - Remove (reviewer: Attorney + insurance broker)
- "for a completely wireless appearance": SAFE - Remove; state the low-voltage limit (reviewer: Licensed electrician + attorney)

## Request questions

- Guide 6.2 extra inputs / review needs: TV/mount models and weight, substrate, height, cable plan; trade-scope review.
- Spec intake (HI-04.INT): TV size/weight/model, mount model, wall/substrate, stud layout, desired height, cable plan, outlet/low-voltage situation.
- Answers follow [[OWN-DEC-91]] and [[HH-SVC-03]]: units shown beside each measurement, approximate values allowed, and "I don't know" stays unknown, never zero, safe or approved. The sources set no per-service unit list.
- Estimate route: online when the details and photos are enough, a site visit when inspection or measurements are needed ([[OWN-DEC-99]], [[HH-SVC-04]]); a customer preference for a remote estimate never overrides a required site or qualification review.

## Included work (SOP section 2, "In scope")

- Option A, "Mounting into Standard Wood Framing Studs": locating studs, boring pilot holes and lag-bolting the wall bracket on drywall over wood studs (source: original Option A; pricing "Standard Drywall Wood Studs" base lines).
- Option B, "In-Wall Low-Voltage Cable Hiding": two drywall cutouts, a fish-tape run for HDMI and media cables and two brush faceplates, only when it is an itemized line of the approved estimate and the low-voltage permission status is recorded (source: original Option B; spec HI-04.MAT "low-voltage pass-through components if permitted"; agreement "Component Clause"; 04 HI-04 permit and license flags).

## Excluded work and limits

HandyHub never performs licensed or unsafe scope: [[FACT-SVC-EXCLUDED-SCOPE]]; suspected hazardous material: [[FACT-SVC-SUSPECTED-HAZMAT]]; access equipment: [[FACT-SVC-ACCESS-EQUIPMENT]]. Referred out at launch for this service: fireplace mounting ([[FACT-SVC-REFER-OUT-TASKS]]).

### SOP section 2, "Out of scope"

- Attaching the TV to the bracket, lifting it and hanging it: Not covered - pending review (C-HI04-01). The agreement's "Component Clause" names only "mounting the screen bracket"; the owner confirms whether HI-04 includes the hang.
- Brick or concrete walls, fireplace mounts, plaster or wire-lath walls and metal-stud walls: Not covered - pending review (C-HI04-07) (source: pricing add-on menu; 31 section 10).
- Soundbar mounting (a priced add-on), streaming boxes and gaming consoles: Not covered - pending review (C-HI04-11) (source: pricing "Soundbar Mounting Integration"; main plan "Peripheral Hardware Consolidation").
- Installing in-wall conduit: Not covered - pending review (C-HI04-14). No step installs conduit, although the main plan promises "cable pass-through conduits" and the Option B step is titled "Conduit Fish Tape Run".
- Choosing screen height or viewing angle for the customer (main plan "Aesthetic Ergonomic Height Tuning"): Not covered - pending review (C-HI04-V01). Section 12 only adds a customer confirmation of the marked position before drilling.
- Old-mount removal, patching or painting, TV setup, and ceiling or outdoor mounts: no step covers them; the owner decides which become customer-visible exclusions (source: 04 HI-04 "exclusions", OPEN QUESTION).
- Line-voltage electrical work of any kind, for example outlets or power routed in walls: never performed under this SOP; see Do not perform (source: spec HI-04.SAF; 02 C-HI04-06).

### SOP section 2, "Do not perform"

PROPOSED entries, pending review by the qualified safety professional and the licensing reviewer (source: 31 section 3.3; spec UXE-010).

| # | Do not | Reason class | Source | Instead |
|---|---|---|---|---|
| 1 | Electrical, plumbing, gas or HVAC work outside the approved scope or requiring a licensed trade | Licensed trade | spec START-011 "unapproved electrical/plumbing/gas/structural scope"; master section 1.3 | Stop and escalate; the office refers the work |
| 2 | Structural work, meaning cutting, removing, sistering or adding load-bearing members, ledgers, footings or framing, unless it is in the approved scope with the required qualified review | Structural | spec START-011; master section 1.3 | Stop and escalate |
| 3 | Disturbing suspect asbestos, lead paint or mold: stop and escalate | Hazardous material | spec START-011 "suspect hazardous materials"; owner facts 2026-10-02 "Unknown is not safe" | Leave it undisturbed; stop and escalate |
| 4 | Work that is not in the approved scope or an approved change order | Out of scope | spec JOB-005, JOB-010, FIN-008, AT-033 | Record the customer's request; change order |
| 5 | Working at height or using access equipment beyond the approved height and access policy | Policy | spec HI-06.SAF "beyond approved height/access policy"; spec DW-04.TLS "scaffolds/stilts only under approved policy" | Stop; no height and access policy exists yet (02 G-005; X-12) |
| 6 | Mixing or sequencing chemicals in any way the approved step and the product SDS do not allow | Policy | spec CL-01.SAF "never mix incompatible chemicals"; X-09 | Stop and escalate; no chemical product is listed for HI-04 |
| 7 | Recording, photographing or sending customer passwords, master codes or site access codes outside the app's secured fields | Policy (privacy) | spec COM-002; owner facts 2026-10-02; 27 AUTH-009 | Use the secured fields only |
| 8 | Promising results, warranties, safety, health or code compliance to the customer | Policy | master sections 1.4, 17 and 29; spec CL-07.SAF | Refer the question to the owner (section 17) |
| 9 | Unlicensed line-voltage work, for example outlets or power routed in walls; the licensed electrician defines the boundary | Licensed trade | spec HI-04.SAF "do not perform unlicensed line-voltage work"; C-HI04-06 | Refer to a licensed electrician through the office |
| 10 | Boring through framing or fire blocking without an approved procedure | Structural | 31 section 10; C-HI04-08 | Stop; record the condition (JOB-004); escalate |
| 11 | Suspected asbestos / lead paint / mold: stop and escalate (source: spec START-011), including in wall finishes at the Option B cutouts and in insulation met by the fish tape | Hazardous material | spec START-011; 36 section 3.4 rule 5 | Stop and escalate |

- exclusions (registry 04, label **FACT** + **GAP** + **OPEN QUESTION**): Agreement: running low-voltage wire behind drywall is excluded unless itemized as a paid add-on, but nothing is itemized (C-HI04-05); spec: no unlicensed line-voltage work. GAP: outlet/power relocation or in-wall power kits; old-mount removal; patching/painting; TV setup; ceiling or outdoor mounts; masonry/fireplace mounts until a procedure exists. OPEN QUESTION for owner (source: agreement §1 L8; spec HI-04.SAF)

## Hazards and human-review flags

- Spec hazards (HI-04.HAZ): heavy lift, drilling into hidden utilities, ladder, electrical exposure, wall damage.
- Spec stop-work guidance (HI-04.SAF): verify mount/TV ratings; use structural attachment per instructions; do not perform unlicensed line-voltage work; two-person lift when needed; stop on uncertain substrate/utilities.
- permit/license flags (registry 04, label **GAP** + **OPEN QUESTION**): None set in any file. The card makes low-voltage components conditional ("if permitted") and bars unlicensed line-voltage work. OPEN QUESTIONS (no conclusion drawn): whether in-wall low-voltage routing or pass-through boxes need a licence, registration or permit in each KY/IN municipality (HUMAN REVIEW: legal-compliance-administrator + municipal electrical inspector/licensing office); line-voltage requests referred to a licensed electrician; fire-blocking penetrations (local building official); fireplace with a gas appliance (licensed gas professional). PROPOSED: START-010 flag on the wire-hiding line until verified (source: spec HI-04.MAT, HI-04.SAF, START-010; owner facts L21; risk-triage playbook L13)
- Reviewers named in the vault files' front matter: qualified safety reviewer; owner; Spanish translation reviewer; licensed trade professional (electrician); building official (fire blocking); CPA (tax treatment); safety reviewer (PPE/hazmat); attorney licensed in KY/IN; insurance broker; licensed electrician (line-voltage boundary). Boundaries: [[RULE-HUMAN-REVIEW]].

### Required worker qualifications (SOP section 4)

TBD — requires review by safety-liability-manager and a qualified person; owner to approve.
- No company qualification policy or capability tags exist yet (source: 31 section 3.1; spec SCH-003).
- Who may perform in-wall low-voltage work (Option B) is not defined (source: 02 G-049; spec START-010).
- Line-voltage electrical work is not performed under this SOP; it is referred to a licensed electrician (source: spec HI-04.SAF; C-HI04-06).
- Lifting the TV is a two-person task when needed (source: spec HI-04.SAF).

### Hazards (SOP section 9)

Severity and the order of controls (eliminate, substitute, engineer, administrative, then PPE) are set by the qualified safety professional: TBD (source: 31 section 3.1; safety-liability-manager skill "Prefer the hierarchy of controls").

| Hazard | Source | Draft controls (pending review) | Stop-work trigger | Reviewer |
|---|---|---|---|---|
| Heavy lift; TV fall or tip; occupants, children and pets nearby | spec HI-04.HAZ "heavy lift"; C-HI04-01; X-11 | Ratings check before drilling; no hang step until one is written from the mount instructions; two-person lift when needed; children and pets kept away | TV over the mount rating; the lift needs two people and one is present | Qualified safety professional |
| Drilling or cutting into hidden electrical, plumbing or gas services | spec HI-04.HAZ "drilling into hidden utilities"; C-HI04-02 | Hidden-service check before drilling and before the cutouts (section 12 holds) | Uncertain substrate or utilities (spec HI-04.SAF) | Qualified safety professional; licensed electrician |
| Electrical exposure at the line-voltage boundary | spec HI-04.HAZ "electrical exposure"; spec HI-04.SAF; C-HI04-06 | Line-voltage work is on the Do-not-perform list; low-voltage cables only | Any task that would need line-voltage work | Licensed electrician |
| Ladder work | spec HI-04.HAZ and HI-04.TLS "ladder"; X-12 | Ladder only under an approved height and access policy (none exists; 02 G-005) | No policy, or work beyond it | Qualified safety professional |
| Wall damage | spec HI-04.HAZ "wall damage" | Existing-condition photos (START-008); work-area protection (APXA-002) | Damaged or uncertain substrate (spec HI-04.SAF) | Owner |
| Boring or cutting into framing, fire blocking, insulation or plumbing vents | agreement "Wire Hiding Disclaimer"; inventory "Wood Paddle Bits & Hole Saws"; C-HI04-08 | No boring or cutting; an obstruction stops the run (section 12 hold) | The fish tape meets blocking, insulation, a pipe or a vent | Local building official (fire blocking); qualified safety professional |
| Dust from drilling and drywall cutouts | original "Drywall Cutout" step; 29 section 7.3 ("Drilling dust") | TBD - dust control and PPE pending safety review | TBD | Qualified safety professional |
| Cuts from the jab saw | inventory "Drywall Hand Saw (Jab Saw)"; 04 HI-04 hazards ("jab-saw cuts") | TBD - pending safety review | TBD | Qualified safety professional |
| Suspect hazardous material in older wall finishes or insulation | spec START-011; 04 HI-04 hazards (no property-age screen) | Leave it undisturbed; stop and escalate | Suspected asbestos, lead paint or mold | EPA RRP-certified renovator; accredited asbestos inspector |
| Fireplace or masonry mounting: heat, gas appliance, masonry | pricing "Brick/Concrete Wall Mounting (Fireplace Focus)"; C-HI04-07 | Not covered; on-site assessment | Any fireplace or masonry wall | Qualified safety professional; licensed gas professional where a gas appliance is present |

## Warranty or callback

- warranty or callback policy (registry 04, label **FACT** + **OPEN QUESTION**): The agreement's "Structural Guarantee" warrants fastening "completely meeting safety weight parameters" with no duration, remedy, exclusions or conditions, while the SOP never checks ratings or hangs the TV (C-HI04-01) and the warranted methods do not cover priced masonry mounts (C-HI04-04). OPEN QUESTION: owner + KY/IN attorney define or withdraw it; return visits classified per CX-007/QA-010; nothing invented (source: agreement §1 L7; spec CX-007, QA-010)
