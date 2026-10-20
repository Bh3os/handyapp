---
id: SVC-CL-05
type: service
title: "Airbnb Turnover"
status: active
area: business
links:
  decided_by: ["[[OWN-DEC-04]]", "[[OWN-DEC-33]]", "[[OWN-DEC-84]]", "[[OWN-DEC-51]]", "[[OWN-DEC-102]]", "[[OWN-DEC-108]]"]
  uses: ["[[SOP-CL-05]]", "[[FACT-INVENTORY-CL-05]]", "[[FACT-PRICING-PER-JOB]]", "[[FACT-SVC-EXCLUDED-SCOPE]]", "[[FACT-SVC-RECURRING-SERVICE]]", "[[FACT-SVC-LEFT-ITEMS]]", "[[FACT-SVC-LARGE-CLEANING-JOBS]]"]
  constrained_by: ["[[RULE-HUMAN-REVIEW]]", "[[RULE-SAFETY-GATES]]", "[[RULE-NO-INVENTED-FACTS]]", "[[FACT-SVC-EXCLUDED-SCOPE]]", "[[FACT-SVC-SUSPECTED-HAZMAT]]", "[[FACT-SVC-ACCESS-EQUIPMENT]]"]
  part_of: ["[[C01]]", "[[C02]]"]
  related: ["[[FACT-PRICING-CL-05]]", "[[FACT-AGREEMENT-CL-05]]", "[[FACT-SERVICE-AREA]]", "[[FACT-BRAND-IDENTITY]]", "[[FACT-SVC-NAMES]]", "[[HH-SVC-01]]", "[[HH-SVC-02]]", "[[HH-SVC-03]]", "[[HH-SVC-04]]", "[[OWN-DEC-91]]", "[[OWN-DEC-99]]", "[[OWN-DEC-127]]"]
source: "guide 6.2; vault 04-service-registry CL-05; spec section 17 CL-05; Standard Of Operations/sop Airbnb Cleaning and Turnover Checklist.md; Main Plans/Cleaning Business.md"
---
Category: Cleaning. Catalog name (guide 6.2): Airbnb Turnover. Canonical name (spec Appendix B): Airbnb Turnover & Vacation Rental Management. Slug: `airbnb-turnover`. Brand and service area: [[FACT-BRAND-IDENTITY]], [[FACT-SERVICE-AREA]]; naming: [[FACT-SVC-NAMES]].

In the launch set: all 26 services are in scope and launch ([[OWN-DEC-04]], [[OWN-DEC-33]]); reported capability is not proof of insurance, qualifications or equipment. Worker checklist: [[SOP-CL-05]] (active, pending competent review for production use, [[OWN-DEC-108]]). Pricing: each job is priced individually on its own estimate ([[FACT-PRICING-PER-JOB]]); the vault price list [[FACT-PRICING-CL-05]] is superseded. Tools and materials: [[FACT-INVENTORY-CL-05]]. Draft agreement clauses: [[FACT-AGREEMENT-CL-05]] (attorney review; customers approve the estimate terms of [[OWN-DEC-127]]).

Vault files: SOP `Standard Of Operations/sop Airbnb Cleaning and Turnover Checklist.md`; Pricing `Pricing/pricing-airbnb-turnover.md`; Inventory `Required inventory/inventory-airbnb-turnover.md`; Agreement `Service Agreements/contract-airbnb-turnover.md`; main plan `Main Plans/Cleaning Business.md` ("🛎️ 5. Airbnb Turnover & Vacation Rental Management").

- aliases (registry 04, label **FACT**): "Airbnb Turnover & Vacation Rental Management" (main plan heading); "5-Star Staging & Fast Turnovers for Premium Guest Reviews" (website headline); "Airbnb & Short-Term Rental Turnover" (pricing title); "Co-Hosting & Operational Management Add-ons" (pricing sub-offer); "Airbnb Turnover" (inventory title); "Operational Agreement: Airbnb & Vacation Rental Turnover" and "Operational Service Agreement ... for ongoing turnover management" (agreement title and body); `airbnb-turnover.md` (agreement scope reference; no such file exists); `sop Airbnb Cleaning and Turnover Checklist.md` and "Airbnb Cleaning & Turnover Micro-Checklist" (SOP file name and title) (source: main plan L68-69; pricing L1, L24; inventory L1; agreement L1, L4, §2 L11; SOP L1)

## Customer description

No owner-approved customer description exists in the sources. Service-page content is drafted from the service files: staging shows the drafts, production shows only versions the owner approves and publishes ([[OWN-DEC-84]], amended 2026-10-12). Pages state the service's limits ([[OWN-DEC-51]]) and never invent prices, completion times, credentials or guarantees ([[RULE-NO-INVENTED-FACTS]]).

- customer-facing description (registry 04, label **FACT** + **OPEN QUESTION** + **PROPOSED**): Draft copy (unapproved): turnovers between an 11:00 AM checkout and a 3:00 PM check-in as the host's "operational partner" - damage walkthrough with photos, linen and towel rotation (strip, wash, remake), "Fast-paced sanitization" including "Deep cleaning kitchens and bathrooms", amenity restocking, welcome staging. Flags: "ensure your next guests leave a glowing 5-star review" and "secure five-star reviews" are outcome promises (C-CL05-08); kitchen deep cleaning is not in the SOP (C-CL05-V01); the "Vacation Rental Management" scope is undefined (C-CL05-07). PROPOSED basis for a rewrite: between-guest clean and reset per the host checklist, linens and amenities, damage documented, property locked and host notified of exceptions (source: main plan L69-79; spec CL-05.QAC)

Purpose (SOP section 1):

- Clean and reset a short-term rental between guest stays for the canonical service CL-05 Airbnb Turnover & Vacation Rental Management: pre-clean inspection with damage photos, linen rotation, cleaning, restocking, staging and completion photos (source: spec Appendix B; original procedure in section 12; agreement "Standard Turnover" clause).
- Intended result, as the spec card's quality checks define it: "clean/reset checklist, linens/amenities, documented damage, staging standard, property locked and host notified of exceptions" (source: spec CL-05.QAC).
- The "Vacation Rental Management" part of the canonical name (co-hosting or property management) has no defined scope and is not covered by this SOP (source: 04 CL-05 exclusions row; 28 section 3.13).

### Draft plan copy (`Main Plans/Cleaning Business.md`; not approved, claims unverified)

*Target Headline for Website: 5-Star Staging & Fast Turnovers for Premium Guest Reviews*

In the vacation rental business, cleanliness directly impacts your booking revenue and host ranking. Between an 11:00 AM checkout and a 3:00 PM check-in, you need a flawless, fast-paced turnaround. We operate as your on-the-ground operational partner. We don't just clean the property; we inspect for guest damage, restock amenities, and stage the rental with professional hotel standards to ensure your next guests leave a glowing 5-star review.

- [ ] **Damage inspection:** Conducting a rapid visual walkthrough to document and photograph any guest damages for insurance claims.
- [ ] **Linen and towel rotation:** Stripping beds, washing dirty linens, and remaking beds with fresh, hotel-pressed sheets.
- [ ] **Fast-paced sanitization:** Deep cleaning kitchens and bathrooms within the tight window between checkout and check-in times.
- [ ] **Amenity restocking:** Replenishing essential guest supplies like toilet paper, soaps, shampoo, coffee pods, and tea bags.
- [ ] **Welcome staging:** Arranging decorative pillows, folding towels neatly, and setting up the space to secure five-star reviews.

Claims the main plan flags for this service (each `unverified`, not publishable until approved):

- "5-Star Staging & Fast Turnovers for Premium Guest Reviews": Headline - Remove review outcome (Review outcome; capacity ("Fast")) (reviewer: Owner + attorney)
- "to ensure your next guests leave a glowing 5-star review": REV - Remove (reviewer: Owner + attorney)
- "We operate as your on-the-ground operational partner" (property-management offer): SCOPE - Hold (reviewer: Attorney (licensing) + owner)
- "to document and photograph any guest damages for insurance claims": SCOPE, privacy - Reword without "for insurance claims"; photo handling per REC-002 (reviewer: Privacy owner + attorney)

## Request questions

- Guide 6.2 extra inputs / review needs: Turnover windows, unit size, linens/supplies, checklist, authorized host.
- Spec intake (CL-05.INT): checkout/check-in times, host checklist, linens, amenities/restock levels, damage-report rule, access/security codes policy.
- Answers follow [[OWN-DEC-91]] and [[HH-SVC-03]]: units shown beside each measurement, approximate values allowed, and "I don't know" stays unknown, never zero, safe or approved. The sources set no per-service unit list.
- Estimate route: online when the details and photos are enough, a site visit when inspection or measurements are needed ([[OWN-DEC-99]], [[HH-SVC-04]]); a customer preference for a remote estimate never overrides a required site or qualification review.
- Service conditions: [[FACT-SVC-RECURRING-SERVICE]] (recurring schedules); [[FACT-SVC-LEFT-ITEMS]] (items left behind); [[FACT-SVC-LARGE-CLEANING-JOBS]] (jobs needing 3-5 people).

## Included work (SOP section 2, "In scope")

- Phase 1: pre-clean damage scan, damage and extreme-mess photos, amenity check, thermostat setting and router check; photo delivery is held (section 12) (source: original procedure, section 12).
- Phase 2: stripping beds, collecting towels and starting a wash where laundry is done on site (source: original procedure, section 12; spec CL-05.TLS "laundry resources as applicable").
- Phase 3: high-touch disinfection, fridge shelves and handle bars (the guest-food discard is held, C-CL05-10) and bathroom cleaning (source: original procedure, section 12).
- Phase 4: bed making, amenity and kitchen restocking, trash bags and staging; who supplies restock items is undecided (Q-29-13) (source: original procedure, section 12).
- Phase 5: floors and completion photos; photo delivery is held (section 12) (source: original procedure, section 12).
- Lock-up check and exception notice to the host before leaving (hold added in section 12) (source: spec CL-05.SAF, CL-05.QAC).

## Excluded work and limits

HandyHub never performs licensed or unsafe scope: [[FACT-SVC-EXCLUDED-SCOPE]]; suspected hazardous material: [[FACT-SVC-SUSPECTED-HAZMAT]]; access equipment: [[FACT-SVC-ACCESS-EQUIPMENT]].

### SOP section 2, "Out of scope"

- Not covered - pending review (C-CL05-V01): kitchen deep cleaning, which the main plan sells ("Deep cleaning kitchens and bathrooms"); the only kitchen cleaning step here is the fridge in "Kitchen Check" (source: main plan section 5; 31 section 10).
- Not covered - pending review (OPEN QUESTION): pool and hot-tub areas of the "Luxury / Pool Property" type that the pricing file sells (source: pricing file; 31 section 10).
- Not covered - pending review (C-CL05-12): off-site laundering and linen supply, which the inventory file ("pre-pressed stock linens stored in your car vehicle") and Phase 4 ("professionally laundered sheets") assume; the laundry model is undecided (source: inventory file; 02 C-CL05-12).
- Not covered - pending review: co-hosting or property-management work and restock purchasing for the host, which the pricing file sells as add-ons ("Option A", "Option B"); not offered until legal and licensing review (source: pricing file; 28 section 3.13; Q-28-18, Q-29-13).
- Out of scope until the owner decides (candidates, PROPOSED): repairs (report and refer to a separate estimate), pest treatment, biohazard remediation, deep cleaning (CL-02) and guest communication (source: 04 CL-05 exclusions row).

### SOP section 2, "Do not perform"

| # | Do not | Reason class | Instead | Source |
|---|---|---|---|---|
| 1 | Electrical, plumbing, gas or HVAC work outside the approved scope or requiring a licensed trade | Licensed trade | Stop and escalate; refer | Spec START-011 "unapproved electrical/plumbing/gas/structural scope"; master section 1.3 (31 section 3.3) |
| 2 | Structural work, meaning cutting, removing, sistering or adding load-bearing members, ledgers, footings or framing, unless it is in the approved scope with the required qualified review | Structural | Stop and escalate | Spec START-011; master section 1.3 (31 section 3.3) |
| 3 | Disturbing suspect asbestos, lead paint or mold; suspected mold growth in a bathroom or elsewhere is reported, not remediated (the company mold definition is pending, Q-31-10) | Hazardous material | Stop and escalate | Spec START-011 "suspect hazardous materials"; owner facts 2026-10-02 "Unknown is not safe"; 31 section 5.8 (mold module lists CL-05) |
| 4 | Work that is not in the approved scope or an approved change order | Out of scope | Record the host's request; change order | Spec JOB-005, JOB-010, FIN-008, AT-033 (31 section 3.3) |
| 5 | Working at height or using access equipment beyond the approved height and access policy | Policy | Stop and escalate | Spec HI-06.SAF; DW-04.TLS (31 section 3.3) |
| 6 | Mixing or sequencing chemicals in any way the approved step and the product SDS do not allow | Policy (chemicals) | Use only label and SDS directions | Spec CL-01.SAF; X-09 (31 section 3.3) |
| 7 | Recording, photographing or sending customer passwords, master codes or site access codes outside the app's secured fields | Policy (privacy) | Use access information only in the app (section 12 holds) | Spec COM-002, CL-05.SAF "protect access codes"; owner facts 2026-10-02; 27 AUTH-009 (PROPOSED) |
| 8 | Promising results, warranties, safety, health or code compliance to the customer | Policy | Use approved wording only | Master sections 1.4, 17 and 29; spec CL-07.SAF (31 section 3.3) |
| 9 | Entering the unit or starting work while guests are present (PROPOSED) | Safety; policy | Do not enter; record the late checkout and escalate (section 19) | 31 section 10 (Do-not-perform seed); spec START-011 "aggressive occupants/animals" |
| 10 | Biohazard cleanup beyond policy: handling needles, sharps, blood or bodily fluids that no approved policy covers (no such policy exists in the vault) | Hazardous material (biohazard) | Stop that task and escalate | 31 section 10 (Do-not-perform seed); spec CL-05.HAZ, CL-05.SAF "escalate biohazard/damage"; C-CL05-01 |
| 11 | Discarding guest property, including perishable food left by guests, without an owner-approved guest-property policy | Policy; legal question | Record what was left; notify the host as an exception | Spec CL-05.SAF "never discard guest property without policy"; C-CL05-10; 02 G-005; 30 section 8 row 21 |
| 12 | Leaving the property unlocked or unsecured | Security (treated as a critical hold) | Stop and escalate | Spec CL-05.SAF "verify lockup"; 31 section 8.4 rule 3 |
| 13 | Repairing damage or urgent maintenance found during the turnover (for example an active leak or a lock that does not secure) | Out of scope; possibly licensed trade | Record with photos; report to the host; any repair needs a separate estimate or change order | Spec CL-05.SAF, JOB-004, FIN-008; 04 CL-05 exclusions row (PROPOSED) |
| 14 | Sending job photos by text message or from a personal account, or uploading them to a host's portal, before the owner decides the photo channels (PROPOSED) | Policy (privacy) | Capture and keep photos in the app (section 16) | 27 AUTH-034 and D-27-19 (PROPOSED); Q-27-16; 31 section 10 |

- exclusions (registry 04, label **GAP** + **PROPOSED**): None stated (GAP). The agreement's "not liable for subsequent damages caused by incoming guests" is a liability limitation, not a scope exclusion (attorney review). Candidates (PROPOSED, owner decision): repairs (report and refer to a separate HandyHub estimate), pest treatment, biohazard remediation, deep cleaning (CL-02), pool cleaning, guest communication, co-hosting/property management until legal review. PROPOSED boundary: CL-05 = between-guest turnover for a host; daily housekeeping for a long-stay guest needs a routing rule vs CL-06 (source: agreement §3 L16; pricing L20, L24-28)

## Hazards and human-review flags

- Spec hazards (CL-05.HAZ): time pressure, sharps/biohazard, guest property, security/access privacy, damaged items.
- Spec stop-work guidance (CL-05.SAF): protect access codes; never discard guest property without policy; escalate biohazard/damage; verify lockup and urgent maintenance.
- permit/license flags (registry 04, label **OPEN QUESTION**): None in files. OPEN QUESTION: whether co-hosting/property management with a revenue share is regulated property-management or real-estate activity in KY or IN; handling owner funds for supplies; sales/use tax on resold amenities and turnover services; use of the "Airbnb" mark in the service name and marketing; municipal business licensing; local short-term-rental rules stay host obligations; authorization for automatic card billing; key/code custody and coverage for cleaner-caused damage. HUMAN REVIEW: KY/IN attorney, real-estate licensing authority, CPA, Legal & Compliance Administrator, payment provider, insurance broker (source: pricing L24-28; agreement §4 L22; spec Appendix B; owner facts)
- Reviewers named in the vault files' front matter: qualified safety reviewer; owner; Spanish translation reviewer; privacy owner (access codes and photos); attorney licensed in KY/IN (guest-property policy); CPA (tax treatment); attorney licensed in KY/IN (revenue share and fee wording); safety reviewer (PPE/hazmat); attorney licensed in KY/IN; insurance broker; privacy owner (photos, access codes). Boundaries: [[RULE-HUMAN-REVIEW]].

### Required worker qualifications (SOP section 4)

- TBD — requires review by safety-liability-manager and a qualified person; owner to approve. No qualification policy exists (source: 31 section 3.1, GAP).
- Topics the reviewer decides on, from the card's hazards: sharps and biohazard awareness, safe use of the chemical products, and access-code and photo privacy (source: spec CL-05.HAZ, CL-05.SAF).
- The worker follows this SOP and the labels and reviewed SDS of approved products (source: spec APXA-004; 29 section 8.3).
- Safety content reaches workers in English or Spanish only after human review of the translation (source: owner facts 2026-10-02).

### Hazards (SOP section 9)

Draft entries for the qualified safety professional; no control below is approved. Controls follow the hierarchy of controls: eliminate, substitute, engineer, administrative, then PPE (source: safety-liability-manager skill).

| Hazard | Source | Draft controls (pending review) | Stop or escalate when | Reviewer |
|---|---|---|---|---|
| Sharps and biohazard (needles, razors, blood or bodily fluids in bedding, towels, bathrooms, drains, bins and trash) | Spec CL-05.HAZ "sharps/biohazard"; Phase 2 "Strip Linens", Phase 3 "Bathroom Inspection", Phase 4 "Kitchen Hospitality" | Do not handle; holds in section 12; PPE in section 6; sharps container and biohazard kit proposed in the inventory file (C-CL05-01) | Any needle, sharp, blood or bodily fluid is found or suspected | Qualified safety professional |
| Time pressure | Spec CL-05.HAZ "time pressure"; the agreement's completion window; same-day bookings in the pricing file | The schedule never overrides a hold or the stop-work rule (section 10); same-day capacity is an owner decision | Keeping the window would mean skipping a hold, a check or a safe method | Owner; qualified safety professional |
| Guest property | Spec CL-05.HAZ "guest property", CL-05.SAF | Nothing discarded without an owner-approved policy; items left behind are recorded (C-CL05-10) | Guest food or belongings are left in the unit | Owner; attorney licensed in KY/IN |
| Security and access privacy | Spec CL-05.HAZ "security/access privacy", CL-05.SAF; COM-002 | Codes only in the app's secured fields (AUTH-009, PROPOSED); photos never show codes; lock-up check before leaving (section 12) | A code is found written down at the property; an entry cannot be locked; a key or fob is missing | Privacy owner; owner |
| Damaged items and urgent maintenance | Spec CL-05.HAZ "damaged items", CL-05.SAF "escalate biohazard/damage; verify lockup and urgent maintenance" | Record with photos and severity (spec JOB-004); report, do not repair (section 2) | Damage, an active leak, a lock that does not secure or another urgent maintenance item | Owner |
| Chemical products (disinfectant, wrinkle releaser, odor neutralizer, cleaning products) | Inventory file; 29 section 8.1; X-09 | Approved products with a reviewed SDS only (29 section 8.3, PROPOSED); label directions; never mixed (section 2, item 6); ventilation per SDS | TBD - pending safety review | Qualified safety professional |
| Appliances checked in "Inventory Check" (hair dryers, iron, coffee machine) | Phase 1 "Inventory Check"; 04 CL-05 hazards (ASSUMPTION) | TBD - pending safety review; appliances are not repaired (section 2) | A damaged appliance or cord: record and report it (spec JOB-004) | Qualified safety professional |
| Manual handling (mattresses when stripping and making beds, laundry loads) | Phase 2 "Strip Linens", Phase 4 "Hotel Bed Tucking"; 04 CL-05 hazards (ASSUMPTION) | TBD - pending safety review | TBD - pending safety review | Qualified safety professional |
| Guests still present or aggressive occupants at entry | Spec START-011 "aggressive occupants/animals"; 04 CL-05 hazards (ASSUMPTION); the late-checkout charges in the pricing file and the agreement | Do not enter while guests are present (section 2, PROPOSED) | Guests are present, or an occupant or animal is aggressive | Qualified safety professional; owner |
| Possible pests in bedding, carried between properties in linens or the vehicle | 04 CL-05 hazards (ASSUMPTION); inventory file "stored in your car vehicle" | TBD - pending safety review | TBD - pending safety review | Qualified safety professional |
| Moisture or suspected mold in bathrooms | 31 section 5.8 (mold module lists CL-05); spec START-011 | Report, do not remediate; the company mold definition is pending (Q-31-10) | Suspected mold growth or an active leak (section 10) | Qualified mold assessor or industrial hygienist (31 section 5.8) |
| Gas appliances or fireplaces in some rentals | 04 CL-05 hazards ("report only") | Report only; no work on gas equipment (section 2, item 1) | Gas odor: emergency steps in section 19 | Qualified safety professional; licensed gas professional for any gas question |
| Pool and hot-tub areas | Pricing file "Luxury / Pool Property"; 04 CL-05 hazards | Out of scope pending an owner decision (section 2) | Any pool or hot-tub task is requested | Owner |
| Occupants, children and pets near the work | X-11; spec APXA-002 "identify pets/occupants" | Keep them away from the hazard (section 10 rule); occupant module pending (31 section 5.8) | An aggressive occupant or animal (spec START-011) | Qualified safety professional |

## Warranty or callback

- warranty or callback policy (registry 04, label **GAP** + **OPEN QUESTION**): None (GAP); no re-clean policy for host or guest cleanliness complaints. OPEN QUESTION: any policy needs owner approval and attorney review; returns linked and classified per CX-007 and QA-010 (source: spec CX-007, QA-010)
