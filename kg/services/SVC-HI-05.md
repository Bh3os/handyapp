---
id: SVC-HI-05
type: service
title: "Door Hardware & Smart Locks"
status: active
area: business
links:
  decided_by: ["[[OWN-DEC-04]]", "[[OWN-DEC-33]]", "[[OWN-DEC-84]]", "[[OWN-DEC-51]]", "[[OWN-DEC-102]]", "[[OWN-DEC-108]]"]
  uses: ["[[SOP-HI-05]]", "[[FACT-INVENTORY-HI-05]]", "[[FACT-PRICING-PER-JOB]]", "[[FACT-SVC-EXCLUDED-SCOPE]]"]
  constrained_by: ["[[RULE-HUMAN-REVIEW]]", "[[RULE-SAFETY-GATES]]", "[[RULE-NO-INVENTED-FACTS]]", "[[FACT-SVC-EXCLUDED-SCOPE]]", "[[FACT-SVC-SUSPECTED-HAZMAT]]", "[[FACT-SVC-ACCESS-EQUIPMENT]]"]
  part_of: ["[[C01]]", "[[C02]]"]
  related: ["[[FACT-PRICING-HI-05]]", "[[FACT-AGREEMENT-HI-05]]", "[[FACT-SERVICE-AREA]]", "[[FACT-BRAND-IDENTITY]]", "[[FACT-SVC-NAMES]]", "[[HH-SVC-01]]", "[[HH-SVC-02]]", "[[HH-SVC-03]]", "[[HH-SVC-04]]", "[[OWN-DEC-91]]", "[[OWN-DEC-99]]", "[[OWN-DEC-127]]"]
source: "guide 6.2; vault 04-service-registry HI-05; spec section 17 HI-05; Standard Of Operations/sop-smart-locks.md; Main Plans/Home Improvement Business.md"
---
Category: Home Improvement. Catalog name (guide 6.2): Door Hardware & Smart Locks. Canonical name (spec Appendix B): Door Hardware & Smart Lock Installation. Slug: `smart-locks`. Brand and service area: [[FACT-BRAND-IDENTITY]], [[FACT-SERVICE-AREA]]; naming: [[FACT-SVC-NAMES]].

In the launch set: all 26 services are in scope and launch ([[OWN-DEC-04]], [[OWN-DEC-33]]); reported capability is not proof of insurance, qualifications or equipment. Worker checklist: [[SOP-HI-05]] (active, pending competent review for production use, [[OWN-DEC-108]]). Pricing: each job is priced individually on its own estimate ([[FACT-PRICING-PER-JOB]]); the vault price list [[FACT-PRICING-HI-05]] is superseded. Tools and materials: [[FACT-INVENTORY-HI-05]]. Draft agreement clauses: [[FACT-AGREEMENT-HI-05]] (attorney review; customers approve the estimate terms of [[OWN-DEC-127]]).

Vault files: SOP `Standard Of Operations/sop-smart-locks.md`; Pricing `Pricing/pricing-smart-locks.md`; Inventory `Required inventory/inventory-smart-locks.md`; Agreement `Service Agreements/contract-smart-locks.md`; main plan `Main Plans/Home Improvement Business.md` ("🚪 5. Door Hardware & Smart Lock Installation").

- aliases (registry 04, label **FACT**): "5. Door Hardware & Smart Lock Installation" (plan heading; also the inventory, agreement and SOP titles); "Door Hardware & Smart Locks" (pricing title); "door hardware installation" (plan overview, "Our door hardware installation team"); "structural door hardware upgrades and smart security integrations" (agreement preamble); website headline "Upgrade Your Home Security with Premium Smart Locks & Modern Door Hardware" (tagline); file stems pricing-/inventory-/contract-/sop-smart-locks (source: plan §5 L63-67; pricing L1; inventory L1; agreement L1, L4; SOP L1)

## Customer description

No owner-approved customer description exists in the sources. Service-page content is drafted from the service files: staging shows the drafts, production shows only versions the owner approves and publishes ([[OWN-DEC-84]], amended 2026-10-12). Pages state the service's limits ([[OWN-DEC-51]]) and never invent prices, completion times, credentials or guarantees ([[RULE-NO-INVENTED-FACTS]]).

- customer-facing description (registry 04, label **FACT** + **PROPOSED**): Draft website copy only, not approved. Unreviewed claims: "outdated locks compromise your home security"; removal "without damaging the structural wood or fiberglass door veneer"; "ensuring zero mechanical drag"; third-party brand names (Nest, August, Schlage); "program emergency master codes", contrary to the card's customer-control rule. PROPOSED neutral summary (owner + handyhub-marketing review): replacing door locks and handles and installing smart locks, with the customer creating and keeping control of all codes and app accounts (source: plan §5 L64-73; spec HI-05.SAF)

Purpose (SOP section 1):

- Adjust misaligned deadbolts and strike plates, and set up smart keyless locks, for the canonical service HI-05 Door Hardware & Smart Lock Installation (source: spec Appendix B; original procedure in section 12).
- Intended result, as the spec card's quality checks define it: "smooth latch/deadbolt, secure attachment, door closes/locks, customer controls codes/accounts, old keys/hardware disposition confirmed" (source: spec HI-05.QAC).

### Draft plan copy (`Main Plans/Home Improvement Business.md`; not approved, claims unverified)

*Target Headline for Website: Upgrade Your Home Security with Premium Smart Locks & Modern Door Hardware*

Loose, squeaking door handles and outdated locks compromise your home security and lower its aesthetic value. For short-term rental hosts (Airbnb) and busy modern families in Kentuckiana, upgrading to keyless smart entries is a transformative convenience. Our door hardware installation team replaces old deadbolts and mechanisms with premium smart locks, providing smooth mechanical functionality, high-tech access control, and instant styling updates.

- [ ] **Old Mechanism Extraction:** We remove rusted handles, latch plates, and outdated cylinders without damaging the structural wood or fiberglass door veneer.
- [ ] **Bore Alignment Tuning:** We chisel and re-bore misaligned strike plate cavities to ensure the new latches sit perfectly flush and secure.
- [ ] **Smart Deadbolt Integration:** We mount precision smart hardware assemblies (such as Nest, August, or Schlage), ensuring zero mechanical drag when the motorized bolt shoots out.
- [ ] **Network Pairing Verification:** We connect the smart lock to your home Wi-Fi network, program emergency master codes, and calibrate remote mobile app functionality.

Claims the main plan flags for this service (each `unverified`, not publishable until approved):

- "Upgrade Your Home Security with Premium Smart Locks & Modern Door Hardware": Headline - Reword (Security outcome; customers must control their own codes (HI-05.SAF)) (reviewer: Privacy owner + IT security)
- "program emergency master codes": SAFE (credentials) - Remove (reviewer: Privacy owner + IT security)
- "without damaging the structural wood or fiberglass door veneer": GUAR - Remove (reviewer: Attorney)

## Request questions

- Guide 6.2 extra inputs / review needs: Door/lock model, dimensions, alignment, setup; no credentials in form.
- Spec intake (HI-05.INT): door material/thickness, existing bore/backset, lock model, handing, strike alignment, Wi-Fi/app needs, customer account/privacy.
- Answers follow [[OWN-DEC-91]] and [[HH-SVC-03]]: units shown beside each measurement, approximate values allowed, and "I don't know" stays unknown, never zero, safe or approved. The sources set no per-service unit list.
- Estimate route: online when the details and photos are enough, a site visit when inspection or measurements are needed ([[OWN-DEC-99]], [[HH-SVC-04]]); a customer preference for a remote estimate never overrides a required site or qualification review.

## Included work (SOP section 2, "In scope")

- Problem Option A: adjusting misaligned deadbolts and strike plates (source: original procedure, section 12).
- Problem Option B: setting up smart Wi-Fi keyless access locks; its network-pairing and code step is held under the credential rule (C-HI05-01) (source: original procedure, section 12; 31 section 5.8).

## Excluded work and limits

HandyHub never performs licensed or unsafe scope: [[FACT-SVC-EXCLUDED-SCOPE]]; suspected hazardous material: [[FACT-SVC-SUSPECTED-HAZMAT]]; access equipment: [[FACT-SVC-ACCESS-EQUIPMENT]].

### SOP section 2, "Out of scope"

- Not covered - pending review (C-HI05-07): extraction of old lock mechanisms, which the agreement lists among its "Inclusions" and the main plan calls "Old Mechanism Extraction"; no step covers removing the old lock or the disposition of old keys and hardware (source: agreement clause 1; main plan section 5).
- Not covered - pending review (C-HI05-V01): standard lockset, deadbolt and handle replacement, which the pricing file sells as "Standard Lockset / Deadbolt Replacement"; not bookable until an SOP option is approved (source: pricing file).
- Not covered - pending review (C-HI05-09): new bores and re-bores (the inventory lists a boring jig and hole saws; the main plan promises to "re-bore misaligned strike plate cavities"); no approved price or procedure (source: inventory file; main plan section 5).
- Out of scope until the owner decides: mortise locks; re-keying or key cutting; door planing or rehanging; frame or structural repair; hardwired access control; fire-rated or egress door hardware (source: 04 HI-05 exclusions, OPEN QUESTION).

### SOP section 2, "Do not perform"

| # | Do not | Reason class | Instead | Source |
|---|---|---|---|---|
| 1 | Electrical, plumbing, gas or HVAC work outside the approved scope or requiring a licensed trade | Licensed trade | Stop and escalate; refer | Spec START-011 "unapproved electrical/plumbing/gas/structural scope"; master section 1.3 (31 section 3.3) |
| 2 | Structural work, meaning cutting, removing, sistering or adding load-bearing members, ledgers, footings or framing, unless it is in the approved scope with the required qualified review | Structural | Stop and escalate | Spec START-011; master section 1.3 (31 section 3.3) |
| 3 | Disturbing suspect asbestos, lead paint or mold; for HI-05 this includes chiseling, filing or boring pre-1978 or unknown-age painted doors and frames while the old-property screening is unresolved | Hazardous material | Stop and escalate | Spec START-011 "suspect hazardous materials"; owner facts 2026-10-02 "Unknown is not safe"; risk-triage playbook ("A pre-1978 painted surface is not cleared by a customer saying it looks safe"); 04 HI-05 hazards and permit/license flags; 31 section 5.8 |
| 4 | Work that is not in the approved scope or an approved change order | Out of scope | Record the customer request; change order | Spec JOB-005, JOB-010, FIN-008, AT-033 (31 section 3.3) |
| 5 | Working at height or using access equipment beyond the approved height and access policy | Policy | Stop and escalate | Spec HI-06.SAF; DW-04.TLS (31 section 3.3) |
| 6 | Mixing or sequencing chemicals in any way the approved step and the product SDS do not allow | Policy (chemicals) | Use only label and SDS directions | Spec CL-01.SAF; X-09 (31 section 3.3) |
| 7 | Recording, photographing or sending customer passwords, master codes or site access codes outside the app's secured fields | Policy (privacy) | The customer enters codes on their own device (section 12 hold) | Spec COM-002; owner facts 2026-10-02; 27 AUTH-009 |
| 8 | Promising results, warranties, safety, health or code compliance to the customer | Policy | Use approved wording only | Master sections 1.4, 17 and 29; spec CL-07.SAF (31 section 3.3) |
| 9 | Leaving the property with a door that does not close and lock | Security (treated as a critical hold) | Stop and escalate; the contingency if a new lock fails is an OPEN QUESTION for the owner | Spec HI-05.SAF "do not leave property unsecured"; 31 sections 8.4 and 10 |
| 10 | Changing locks without verified authority of the requester (owner, tenant, landlord, host) | Policy; legal question (how authority is verified is an OPEN QUESTION) | Do not start; escalate | 31 section 10; 04 HI-05 permit/license flags (attorney) |
| 11 | Installing or connecting mains-powered (hardwired) access control | Licensed trade | Refer; out of scope | 31 section 10; 04 HI-05 exclusions |
| 12 | Modifying, boring or changing hardware on fire-rated or egress doors without review | Code or permit question (OPEN QUESTION) | Stop and escalate | 31 section 10; 04 HI-05 hazards (building official or fire marshal) |

- exclusions (registry 04, label **FACT** + **GAP** + **OPEN QUESTION**): Agreement disclaims only ongoing structural settling and network dropouts/router issues. GAP: mortise locks; re-keying or key cutting; door planing or rehanging; frame/structural repair; hardwired access control; fire-rated/egress door hardware; new bores until priced and proceduralized (C-HI05-09). OPEN QUESTION for owner (source: agreement §1 L8, §2 L11)

## Hazards and human-review flags

- Spec hazards (HI-05.HAZ): pinch/cut, drilling, door damage, security/privacy, account credentials.
- Spec stop-work guidance (HI-05.SAF): protect customer credentials; have customer control personal account/password; verify emergency/manual operation; do not leave property unsecured.
- permit/license flags (registry 04, label **GAP** + **OPEN QUESTION**): None set; unknown applicability must not default to "no permit". OPEN QUESTIONS (no conclusion drawn): locksmith or security-hardware licensing/registration in each KY/IN municipality (HUMAN REVIEW: legal-compliance-administrator + attorney + municipal licensing office); how the requester's authority to change locks is verified (owner, tenant, landlord, rental host) (attorney); egress or fire-rated door rules (building official, fire marshal); handling and retention of Wi-Fi/app credentials and access codes (business-privacy-data-owner + attorney); EPA RRP applicability to paint disturbance on pre-1978 doors and frames (EPA RRP certified renovator) (source: owner facts L4, L17, L21; risk-triage playbook L13)
- Reviewers named in the vault files' front matter: qualified safety reviewer; owner; Spanish translation reviewer; privacy owner (credentials and access codes); attorney licensed in KY/IN (credentials and access codes); building official or fire marshal (fire-rated or egress doors; open question); CPA (tax treatment); safety reviewer (PPE/hazmat); attorney licensed in KY/IN; insurance broker; privacy owner. Boundaries: [[RULE-HUMAN-REVIEW]].

### Required worker qualifications (SOP section 4)

- TBD — requires review by safety-liability-manager and a qualified person; owner to approve. No qualification policy exists (source: 31 section 3.1, GAP).
- Locksmith or security-hardware licensing per municipality is an OPEN QUESTION for the legal-compliance-administrator, an attorney and the municipal licensing office; no conclusion is drawn here (source: 04 HI-05 permit/license flags).
- The worker follows this SOP and the lock manufacturer's instructions (source: spec APXA-004).

### Hazards (SOP section 9)

Draft entries for the qualified safety professional; no control below is approved. Controls follow the hierarchy of controls: eliminate, substitute, engineer, administrative, then PPE (source: safety-liability-manager skill).

| Hazard | Source | Draft controls (pending review) | Stop or escalate when | Reviewer |
|---|---|---|---|---|
| Pinch and cut (chisels, door edges, hardware) | Spec HI-05.HAZ | TBD - pending safety review; PPE in section 6 | An unsafe condition arises (section 10) | Qualified safety professional |
| Drilling | Spec HI-05.HAZ | TBD - pending safety review; no boring procedure is approved (C-HI05-09) | Any new bore or re-bore would be needed | Qualified safety professional; owner |
| Door damage | Spec HI-05.HAZ | Existing-condition photos before work (spec START-008; X-02); protect the work area (spec APXA-002) | Damage found before work: record it (spec JOB-004) | Owner |
| Security and privacy; account credentials | Spec HI-05.HAZ, HI-05.SAF | The customer creates and controls the account, password and codes; codes are never recorded, photographed or sent (31 section 5.8, PROPOSED; spec COM-002) | Any request that the worker set, hold or record codes or passwords | Privacy owner; attorney |
| Property left unsecured or customer locked out | Spec HI-05.SAF; 04 HI-05 hazards | Compatibility check before the old lock is removed; final function test before leaving (holds in section 12) | The lock does not close, lock or operate, including emergency and manual operation | Owner (contingency); qualified safety professional |
| Painted doors and frames in older homes disturbed by chiseling, filing or boring | 04 HI-05 hazards; agreement "older homes" | Old-property screening questions (31 section 5.8); suspect lead paint is not disturbed (spec START-011) | Property age unknown or suspect lead paint | EPA RRP-certified renovator (applicability is an OPEN QUESTION) |
| Lithium batteries | Inventory file; 29 section 8.1 | Storage, charging and transport per the manufacturer and the reviewer | TBD - pending safety review | Qualified safety professional |
| Aerosol lubricant | Inventory file; 29 section 8.1 | SDS required; not carried to a job without a reviewed SDS (29 section 8.3, PROPOSED) | TBD - pending safety review | Qualified safety professional |
| Fire-rated or egress doors | 04 HI-05 hazards (GAP); 31 section 10 | No modification without review | A door is suspected to be fire-rated or an egress door | Building official or fire marshal (OPEN QUESTION) |
| Structural movement of the door frame | Agreement "Structural Frame Waiver"; C-HI05-05 | Do not diagnose; record the condition (spec JOB-004) | Visible frame or structural movement | Structural engineer only where signs of structural movement are observed |
| Occupants, children and pets near the work | X-11; spec APXA-002 "identify pets/occupants" | Keep them away from the hazard (31 section 8.5); occupant module pending (31 section 5.8) | Aggressive occupant or animal (spec START-011) | Qualified safety professional |

## Warranty or callback

- warranty or callback policy (registry 04, label **GAP** + **OPEN QUESTION**): None; only disclaimers for settling and network issues. Manufacturer vs workmanship warranty handling undefined (QA-008, QA-010). OPEN QUESTION: owner + KY/IN attorney; return visits classified per CX-007/QA-010; nothing invented (source: agreement §1 L8, §2 L11; spec QA-008, QA-010, CX-007)
