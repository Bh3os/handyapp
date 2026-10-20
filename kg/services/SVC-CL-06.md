---
id: SVC-CL-06
type: service
title: "Hotel-Style Housekeeping"
status: active
area: business
links:
  decided_by: ["[[OWN-DEC-04]]", "[[OWN-DEC-33]]", "[[OWN-DEC-84]]", "[[OWN-DEC-51]]", "[[OWN-DEC-102]]", "[[OWN-DEC-108]]"]
  uses: ["[[SOP-CL-06]]", "[[FACT-INVENTORY-CL-06]]", "[[FACT-PRICING-PER-JOB]]", "[[FACT-SVC-EXCLUDED-SCOPE]]", "[[FACT-SVC-RECURRING-SERVICE]]", "[[FACT-SVC-LEFT-ITEMS]]", "[[FACT-SVC-LARGE-CLEANING-JOBS]]"]
  constrained_by: ["[[RULE-HUMAN-REVIEW]]", "[[RULE-SAFETY-GATES]]", "[[RULE-NO-INVENTED-FACTS]]", "[[FACT-SVC-EXCLUDED-SCOPE]]", "[[FACT-SVC-SUSPECTED-HAZMAT]]", "[[FACT-SVC-ACCESS-EQUIPMENT]]"]
  part_of: ["[[C01]]", "[[C02]]"]
  related: ["[[FACT-PRICING-CL-06]]", "[[FACT-AGREEMENT-CL-06]]", "[[FACT-SERVICE-AREA]]", "[[FACT-BRAND-IDENTITY]]", "[[FACT-SVC-NAMES]]", "[[HH-SVC-01]]", "[[HH-SVC-02]]", "[[HH-SVC-03]]", "[[HH-SVC-04]]", "[[OWN-DEC-91]]", "[[OWN-DEC-99]]", "[[OWN-DEC-127]]"]
source: "guide 6.2; vault 04-service-registry CL-06; spec section 17 CL-06; Standard Of Operations/sop Hotel-Style Housekeeping Checklist.md; Main Plans/Cleaning Business.md"
---
Category: Cleaning. Catalog name (guide 6.2): Hotel-Style Housekeeping. Canonical name (spec Appendix B): Hotel-Style Luxury Housekeeping. Slug: `hotel-housekeeping`. Brand and service area: [[FACT-BRAND-IDENTITY]], [[FACT-SERVICE-AREA]]; naming: [[FACT-SVC-NAMES]].

In the launch set: all 26 services are in scope and launch ([[OWN-DEC-04]], [[OWN-DEC-33]]); reported capability is not proof of insurance, qualifications or equipment. Worker checklist: [[SOP-CL-06]] (active, pending competent review for production use, [[OWN-DEC-108]]). Pricing: each job is priced individually on its own estimate ([[FACT-PRICING-PER-JOB]]); the vault price list [[FACT-PRICING-CL-06]] is superseded. Tools and materials: [[FACT-INVENTORY-CL-06]]. Draft agreement clauses: [[FACT-AGREEMENT-CL-06]] (attorney review; customers approve the estimate terms of [[OWN-DEC-127]]).

Vault files: SOP `Standard Of Operations/sop Hotel-Style Housekeeping Checklist.md`; Pricing `Pricing/pricing-hotel-housekeeping.md`; Inventory `Required inventory/inventory-hotel-housekeeping.md`; Agreement `Service Agreements/contract-hotel-housekeeping.md`; main plan `Main Plans/Cleaning Business.md` ("👔 6. Hotel-Style Luxury Housekeeping").

- aliases (registry 04, label **FACT**): "Hotel-Style Luxury Housekeeping" (main plan heading, pricing title); "Resort-Level Care and Butler-Grade Organization for Your Private Residence" (website headline); "subscription-based Hotel-Style Housekeeping" (main plan body); "Hotel-Style Housekeeping" (inventory title); "Subscription Agreement: Hotel-Style Housekeeping", "Monthly Subscription Agreement ... for premium, luxury residential care" and "luxury housekeeping package" (agreement); `hotel-housekeeping.md` "micro-checklist" (agreement scope reference; no such file exists); `sop Hotel-Style Housekeeping Checklist.md` and "Hotel-Style Housekeeping Micro-Checklist" (SOP file name and title); tier names "Silver Tier", "Gold Tier", "Elite Presidential Tier" (source: main plan L83-84, L87; pricing L1, L15, L19, L23; inventory L1; agreement L1, L4, §1 L7-10, §2 L13; SOP L1)

## Customer description

No owner-approved customer description exists in the sources. Service-page content is drafted from the service files: staging shows the drafts, production shows only versions the owner approves and publishes ([[OWN-DEC-84]], amended 2026-10-12). Pages state the service's limits ([[OWN-DEC-51]]) and never invent prices, completion times, credentials or guarantees ([[RULE-NO-INVENTED-FACTS]]).

- customer-facing description (registry 04, label **FACT** + **OPEN QUESTION** + **PROPOSED**): Draft copy (unapproved): subscription "5-star resort" housekeeping for high-net-worth households - laundry (washing, drying, folding, ironing), turndown with hospital corners, wardrobe organization, ambience (trash, tidying, flowers or diffusers), "Daily maintenance". Flags: "every single day" vs 2x/3x/Mon-Fri tiers (C-CL06-03); "highly trained housekeepers" without verified credentials (C-CL06-08); washing and drying are not in the SOP or agreement (C-CL06-04). PROPOSED basis for a rewrite: recurring residence care per an agreed plan, privacy rules, laundry/wardrobe tasks per instructions and secure closeout (source: main plan L84-94; spec CL-06.QAC)

Purpose (SOP section 1):

Recurring hotel-style housekeeping of a private residence for a resident who subscribes to a plan of visits: garment care within care labels, bed and linen presentation, light tidying and dusting, room scenting where the customer wants it, waste and floor care, and a secure closeout, done with strict privacy and without disturbing high-value items except for authorized care, for the canonical service CL-06 Hotel-Style Luxury Housekeeping (source: spec Appendix B; spec CL-06.INT, CL-06.SAF, CL-06.QAC; 04 CL-06 "customer-facing description", PROPOSED basis for a rewrite). No outcome is promised (source: 31 section 3.5 rule 5).

- The original file has no introduction line; its procedure is in section 12, unchanged. Its title calls it a "Micro-Checklist" and drops "Luxury" from the canonical name, which the frontmatter carries (source: 04 CL-06 "aliases").
- The agreement's scope sentence refers to a `hotel-housekeeping.md` micro-checklist, which does not exist; this file is the CL-06 SOP. The agreement reference changes only through attorney review (C-CL06-09; 30 section 6). This file keeps its name until the owner approves the rename to `sop-hotel-housekeeping.md` (34 step 2.10).

### Draft plan copy (`Main Plans/Cleaning Business.md`; not approved, claims unverified)

*Target Headline for Website: Resort-Level Care and Butler-Grade Organization for Your Private Residence*

For high-net-worth individuals, executives, and luxury estates, routine cleaning isn't enough—you require consistent, high-touch hospitality. Our subscription-based Hotel-Style Housekeeping brings the luxury of a 5-star resort into your private home. Operating with quiet discretion, our highly trained housekeepers manage your daily laundry, wardrobe curation, turndown services, and general ambiance, maintaining an immaculate residential environment every single day.

- [ ] **Premium laundry service:** Washing, drying, folding, and ironing clothes or delicate personal garments for the residents.
- [ ] **Turndown service:** Making beds using advanced hospitality techniques, hospital corners, and crisp linen presentation.
- [ ] **Wardrobe organization:** Color-coding, hanging, and neatly arranging clothing items inside closets and dressing rooms.
- [ ] **Ambience enhancement:** Emptying trash frequently, light tidying, organizing clutter, and arranging fresh flowers or room diffusers.
- [ ] **Daily maintenance:** Providing high-touch, consistent daily care to mirror the luxury experience of a five-star resort.

Claims the main plan flags for this service (each `unverified`, not publishable until approved):

- "Resort-Level Care and Butler-Grade Organization for Your Private Residence": Headline - Reword (Puffery; body capacity claims) (reviewer: Owner)
- "our highly trained housekeepers": CAP - Remove (reviewer: Owner)
- "maintaining an immaculate residential environment every single day": CAP - Reword per approved tier (reviewer: Owner)

## Request questions

- Guide 6.2 extra inputs / review needs: Rooms/property, standards/frequency, laundry/supplies/access.
- Spec intake (CL-06.INT): recurring service plan, privacy boundaries, laundry/wardrobe preferences, delicate items, access, preferred products.
- Answers follow [[OWN-DEC-91]] and [[HH-SVC-03]]: units shown beside each measurement, approximate values allowed, and "I don't know" stays unknown, never zero, safe or approved. The sources set no per-service unit list.
- Estimate route: online when the details and photos are enough, a site visit when inspection or measurements are needed ([[OWN-DEC-99]], [[HH-SVC-04]]); a customer preference for a remote estimate never overrides a required site or qualification review.
- Service conditions: [[FACT-SVC-RECURRING-SERVICE]] (recurring schedules); [[FACT-SVC-LEFT-ITEMS]] (items left behind); [[FACT-SVC-LARGE-CLEANING-JOBS]] (jobs needing 3-5 people).

## Included work (SOP section 2, "In scope")

As written in the original procedure (section 12), pending review:
- Phase 1: sorting clothing left around the room, ironing or steaming requested garments, hanging clothing and presenting shoes (source: original Phase 1).
- Phase 2: making beds with hospital corners, straightening the duvet and pillows, replacing used bath linens with fresh towels (source: original Phase 2).
- Phase 3: organizing daily clutter, dusting and wiping vanity items, nightstands and dressing tables, refreshing diffusers, misting linens and tending fresh flowers (source: original Phase 3).
- Phase 4: emptying, wiping and relining trash bins, vacuuming carpets and rugs, damp-mopping hard stone or wood floors (source: original Phase 4).
- Customer: a resident who contracts directly for a subscription of two or more visits a week; a host's long-stay guest is CL-05 when the host or manager is the customer (source: 04 section 5.1 rule (f) and routing chart, PROPOSED).

## Excluded work and limits

HandyHub never performs licensed or unsafe scope: [[FACT-SVC-EXCLUDED-SCOPE]]; suspected hazardous material: [[FACT-SVC-SUSPECTED-HAZMAT]]; access equipment: [[FACT-SVC-ACCESS-EQUIPMENT]].

### SOP section 2, "Out of scope"

- Not covered - pending review (C-CL06-04): washing, drying and folding laundry, sold in pricing ("standard laundry wash") and the main plan ("Premium laundry service"); the Phase 1 heading names "Laundry", but no step washes.
- Not covered - pending review (C-CL06-04): hand-washing silk or cashmere and dry-cleaning drop-offs, sold through the pricing "Fine Garments Surcharge"; garments in HandyHub's custody off site raise insurance and attorney questions.
- Not covered - pending review (C-CL06-07): "interior fridge maintenance" (Gold tier); there is no kitchen or fridge step and no rule on what may be discarded.
- Not covered - pending review (C-CL06-07, C-CL06-01): "organizing mail/packages" (Elite tier); there is no step, and a privacy boundary must come first (Do not perform entry 9).
- Not covered - pending review (C-CL06-07): "luxury bed adjustments" (Elite tier); Phase 2 may cover them, and the owner confirms (02 C-CL06-07).
- Tier scope (C-CL06-V01): the steps make no tier distinction, while pricing reserves closet organization, garment steaming and scent refreshing for the Gold tier and above; which steps each tier includes is an owner decision (Q-28-21; 04 SVC-011 task-inclusion matrix).
- Not offered under this SOP until the owner decides (exclusions are undefined in the files): cooking, childcare or pet care, art cleaning beyond dusting, and deep cleaning, which is routed to CL-02 (source: 04 CL-06 "exclusions", GAP; 04 section 5.1).

These items cannot be scheduled or performed until an approved version covers them (source: 31 SOP-029, PROPOSED).

### SOP section 2, "Do not perform"

Universal entries 1 to 8 are the 31 SOP standard section 3.3 list; entries 9 and 10 are the CL-06 seeds of 31 section 10, and entries 11 to 13 come from the spec card and the verified findings. All are PROPOSED wording (HUMAN REVIEW: qualified safety professional, licensing reviewer and privacy owner).

| # | Do not | Reason class | Instead | Source |
|---|---|---|---|---|
| 1 | Electrical, plumbing, gas or HVAC work outside the approved scope or requiring a licensed trade | Licensed trade | Stop and escalate; refer | spec START-011; master section 1.3 |
| 2 | Structural work (cutting, removing, sistering or adding load-bearing members, ledgers, footings or framing) unless it is in the approved scope with the required qualified review | Structural | Stop and escalate | spec START-011; master section 1.3 |
| 3 | Disturb suspect asbestos, lead paint or mold | Hazardous material | Stop and escalate | spec START-011 "suspect hazardous materials"; owner facts 2026-10-02 "Unknown is not safe" |
| 4 | Work that is not in the approved scope or an approved change order | Out of scope | Record the customer request; change order | spec JOB-005, JOB-010, FIN-008, AT-033 |
| 5 | Work at height or use access equipment beyond the approved height and access policy | Policy | Stop and escalate | spec HI-06.SAF "beyond approved height/access policy"; DW-04.TLS |
| 6 | Mix or sequence chemicals in any way the approved step and the product SDS do not allow | Hazardous material | Stop and escalate | spec CL-01.SAF "never mix incompatible chemicals" |
| 7 | Record, photograph or send customer passwords, master codes or site access codes outside the app's secured fields | Policy | Use the app's secured fields | spec COM-002; owner facts 2026-10-02; 27 AUTH-009 |
| 8 | Promise results, warranties, safety, health or code compliance to the customer | Policy | Use approved wording only (section 17) | master sections 1.4, 17 and 29; spec CL-07.SAF |
| 9 | Open, read, sort or photograph mail, documents or other personal records | Policy (privacy) | Leave them in place; escalate if a task seems to need them | spec CL-06.SAF "do not photograph/access personal records without need"; 31 section 10 CL-06 |
| 10 | Handle cash or jewelry beyond the customer's written authorization | Policy (property) | Leave them in place; record and escalate (section 19) | 31 section 10 CL-06; spec CL-06.SAF "escalation for valuables/damage" |
| 11 | Iron, steam or clean a garment or surface without a clear care label or care instructions, or against them | Policy (property) | Set the item aside and report it (section 17) | spec CL-06.SAF "follow garment/surface care labels"; 02 C-CL06-01 |
| 12 | Take garments or other customer property out of the residence (dry-cleaning drop-offs, errands) | Out of scope | Not covered - pending review (section 2) | pricing "Fine Garments Surcharge" line; 02 C-CL06-04 (custody; insurance broker and attorney review) |
| 13 | Leave the residence without securing it as the customer instructed (locks, alarm), or with keys unaccounted for | Policy (security) | Escalate before leaving, unless your own safety requires you to leave | spec CL-06.QAC "secure closeout"; 31 section 8.4 rule 3 |

- exclusions (registry 04, label **FACT** + **GAP** + **PROPOSED**): Agreement: staff "steam or iron garments but are not professional dry cleaners"; no liability for shrinkage or discoloration of delicate garments lacking clear care labels (a limitation, attorney review). Undefined (GAP): cooking, childcare or pet care, opening mail, handling cash or jewelry, art cleaning beyond dusting, deep cleaning (CL-02). PROPOSED boundary: CL-06 = recurring resident subscription of 2 or more visits a week (source: agreement §2 L14)

## Hazards and human-review flags

- Spec hazards (CL-06.HAZ): privacy/confidentiality, delicate/high-value property, chemical/surface damage, ergonomic strain.
- Spec stop-work guidance (CL-06.SAF): strict privacy; do not photograph/access personal records without need; follow garment/surface care labels; escalation for valuables/damage.
- permit/license flags (registry 04, label **OPEN QUESTION**): None in files. OPEN QUESTION: consumer subscription terms in KY and IN (100% prepayment capture, renewal, "no refunds" and "no partial monetary credit", termination); insurance for client property in HandyHub's care, custody or control and for garment errands (vehicle); background checks or confidentiality agreements; handling residents' mail and packages; municipal business licensing; taxability of subscriptions and pass-through dry-cleaning fees. HUMAN REVIEW: KY/IN attorney, insurance broker, business-privacy-data-owner, Legal & Compliance Administrator, CPA (source: pricing L9, L25, L30-31; agreement §3 L17-19; owner facts)
- Reviewers named in the vault files' front matter: qualified safety reviewer; owner; Spanish translation reviewer; privacy owner (personal records, mail, photos, keys and access codes); CPA (tax treatment); attorney licensed in KY/IN (prepayment, refund and skip terms, C-CL06-05, C-CL06-06); privacy owner (mail and package handling, C-CL06-01); insurance broker (garments in HandyHub custody, C-CL06-04); safety reviewer (PPE/hazmat); attorney licensed in KY/IN; insurance broker; privacy owner (confidentiality, personal records, mail, keys and photos); bookkeeper or CPA (prepayment capture, refunds and credits). Boundaries: [[RULE-HUMAN-REVIEW]].

### Required worker qualifications (SOP section 4)

TBD — requires review by safety-liability-manager and a qualified person; owner to approve.
- PROPOSED: before assignment, instruction on the privacy rules, garment care labels, steamer and iron use per the manufacturer instructions, and the product SDS summaries, recorded per worker (source: spec CL-06.SAF; 29 section 8.2 row 11; spec START-004).
- No training standard or credential is established for this service; the main plan's training claim has no record behind it and is not repeated to customers (source: owner facts 2026-10-02 "Reported capability is not documentary proof of insurance, qualifications or equipment"; 32 register B row 6).
- Background checks or confidentiality agreements for workers in private residences are an open question for the attorney; nothing here says they are required (source: 04 CL-06 "permit/license flags").
- Which qualification tags release this work for scheduling is an owner decision (source: spec SCH-003; Q-04-13).

### Hazards (SOP section 9)

Draft service risk class (PROPOSED, 04 section 6.2): routine with approved controls; elevated for steam and iron work, lone work and high-value property. Hazard classes: security-privacy, chemical. Job-level classification stays with risk triage (31 section 3.2). Controls are listed in hierarchy order (safety-liability-manager: "eliminate, substitute, engineer, administratively control, then PPE") and are all pending qualified review.

| Hazard | Source | Controls (pending review) | Stop-work trigger | Reviewer |
|---|---|---|---|---|
| Privacy and confidentiality: personal records, mail, documents, photos of private spaces | spec CL-06.HAZ "privacy/confidentiality", CL-06.SAF; pricing Elite "organizing mail/packages" (C-CL06-01) | Privacy boundaries recorded at intake; records and mail not opened, read or photographed (Do not perform entry 9); photos only as section 16 allows; codes only in secured fields | A task needs access to personal records or mail; a request to photograph documents | Privacy owner; attorney |
| Delicate and high-value property: garments, glass, perfume bottles, art, crystal, instruments | spec CL-06.HAZ "delicate/high-value property", CL-06.QAC; inventory brush line | Authorized care only; care labels and care instructions followed; damage reported at once | Damage found or caused; an item missing or out of place; care not authorized | Owner; insurance broker (claims questions) |
| Chemical and surface damage: polishes, conditioner, cleaners and mists on finishes, fabrics, stone and wood | spec CL-06.HAZ "chemical/surface damage" (C-CL06-02) | Approved products with a reviewed SDS; product and method per the surface's care instructions; no mixing (Do not perform entry 6) | No SDS; unknown finish; product unsuited to the surface | Qualified safety professional |
| Fragrance and essential-oil exposure of occupants and pets (allergy, sensitivity, preference) | original "Scent & Decor"; inventory scent mists (02 C-CL06-02) | Recorded fragrance preference and allergy check before use; SDS; no scent where the customer declined | Allergy or sensitivity reported or unknown; any reaction | Qualified safety professional; owner |
| Steam and iron burns | original "Ironing & Steaming"; inventory "High-wattage steamer" (02 C-CL06-02; not on the card) | Manufacturer instructions; burn protection and first-response provisions by the reviewer (X-10) | Damaged or faulty equipment; a burn (incident, section 20) | Qualified safety professional |
| Electrical load and cords: high-wattage steamer and iron on household circuits; charging cables | inventory steamer line; original "Clutter Management" (02 C-CL06-02) | Manufacturer instructions; cord and plug check before use; no work on electrical components (Do not perform entry 1) | Tripped circuit; damaged cord, plug or outlet | Qualified safety professional; licensed electrician for any electrical fault |
| Ergonomic strain: lifting mattress edges, carrying laundry, repetitive work | spec CL-06.HAZ "ergonomic strain"; original "Hospital Corners"; inventory tuck paddles (02 C-CL06-02) | Tuck paddles as the PROPOSED control; lifting method and limits by the reviewer (TBD) | Lifting beyond the approved method | Qualified safety professional |
| Slips on damp-mopped stone or wood floors in an occupied home | original "Silent Floor Care" (02 C-CL06-02) | Occupants and pets kept off damp floors; wet-floor sign (proposed) | Occupants or pets cannot be kept off a wet area | Qualified safety professional |
| Sharp items in bins; broken glass or dishes | original "Clutter Management" and "Immediate Trash Clear"; 04 CL-06 "hazards" (ASSUMPTION) | Handling method and any container TBD by the reviewer | A sharp or biohazard item found | Qualified safety professional |
| Lone work in a private residence | pricing Elite "Dedicated personal housekeeper on property"; 04 CL-06 "stop-work conditions" (GAP) | Check-in and escalation protocol TBD (section 3) | A threatening situation; no check-in possible | Qualified safety professional; owner |
| Occupants, children and pets during work | X-11 | Customer preparation (section 5); keep them away from wet floors, chemicals, steam and cords | Anyone enters the immediate work area during a hazardous step | Qualified safety professional |
| Keys, alarm and access codes | 04 CL-06 "prerequisites"; spec COM-002; 27 AUTH-009 | Secured fields only; key custody log; secure closeout (section 12) | A lost key; a code exposed; the residence cannot be secured | Privacy owner; owner |

## Warranty or callback

- warranty or callback policy (registry 04, label **GAP** + **OPEN QUESTION**): None (GAP). Makeup visits cover client-requested skips only, not quality complaints; company-missed visits are not addressed. OPEN QUESTION: any re-service policy needs owner approval and attorney review; returns classified per CX-007 and QA-010 (source: pricing L30; agreement §3 L18; spec CX-007, QA-010)
- Governed now by: the 90-day workmanship warranty of [[FACT-WARRANTY]] ([[OWN-DEC-135]]), counted from the reviewed completion date; a claim opens a case with return-visit punch items ([[HH-QA-07]]). No warranty exclusions are defined; any come only from attorney review ([[OQ-ATTORNEY-TERMS]]).
