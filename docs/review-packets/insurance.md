# Review packet: insurance broker

Prepared 2026-10-22 by TSK-0143 for OWN-DEC-186. Status: waiting for review. Nothing in this packet says or implies that HandyHub is insured; every item is a question for you.

## 1. Who this is for
The owner's insurance broker (RULE-HUMAN-REVIEW: insurance is a human-review boundary). The owner's answers so far: "Not yet - getting quotes", "I will find an insurance by myself", "leave the insurance part for me" (owner answers 2026-10-05T16:18, 17:27, in OQ-INSURANCE-EVIDENCE).

## 2. What HandyHub is (from the knowledge graph)
- FACT: HandyHub is the customer-facing brand of ODD JOBS & MORE LLC, a Kentucky limited liability company; the assumed name "HandyHub" is not filed (FACT-LEGAL-ENTITY). Estimates and invoices print "Handyhub LLC" (FACT-BUSINESS-NAME); its relation to the LLC is open (OQ-LEGAL-ENTITY-NAME). The named insured is a question for you and the attorney.
- FACT: residential work only at launch, for homeowners, renters, landlords and short-term rental hosts (FACT-CUSTOMERS-SERVED), in eleven whole counties of Kentucky (Jefferson, Oldham, Bullitt, Shelby, Meade) and Indiana (Clark, Floyd, Harrison, Scott, Washington, Jefferson) (FACT-SERVICE-AREA). Not registered to do business in Indiana yet (OQ-INDIANA-REGISTRATION).
- FACT: people: initially two employees; the owner also works in the field; subcontractors later, who must show proof of their own insurance before their first job and are paid outside the app (OWN-DEC-05, OWN-DEC-28, OQ-SUBCONTRACTOR-POLICY, OWN-DEC-188).
- FACT: visits every day, 8 AM–10 PM, by appointment (FACT-HOURS). Workers sometimes work alone; they check in only at arrival and finish (OWN-DEC-149).
- FACT: HandyHub never performs licensed gas, electrical, plumbing, HVAC or structural work and never removes hazardous materials (asbestos, lead, mold) (FACT-SVC-EXCLUDED-SCOPE). It uses ladders only and does no roof-edge work (FACT-SVC-ACCESS-EQUIPMENT). Eight higher-risk tasks are referred out: joist sistering, fixture boxing, biocide fogging, appliance pull-out, gas burner-port clearing, acid grout-haze removal, mounting over fireplaces, roof-edge gutter guards (FACT-SVC-REFER-OUT-TASKS).
- FACT: screening limits: no paint-disturbing work in homes built before 1978 on HI-09, DW-01, DW-02, DW-03, PT-01 to PT-04; popcorn removal only in homes built in 1981 or later; a suspected asbestos, lead or mold condition stops the work and the job is cancelled with a refund; HandyHub does no sampling or testing (FACT-SVC-HOME-AGE-LIMITS, FACT-SVC-SUSPECTED-HAZMAT).
- FACT: the software runs only on private staging with synthetic data until the owner's go decision; launch in three phases (OWN-DEC-191).

## 3. Materials to review
| Material | Where |
| --- | --- |
| The 26 services and what each excludes | section 4 below; each service page on staging `/services/...`; nodes SVC-* ("Do not perform" lists) |
| Each service's procedure (SOP), pending competent safety review | [safety.md](safety.md) section 4; staff app job packet on staging |
| Incident, damage and injury handling | nodes OWN-DEC-124, FACT-SVC-INCIDENT-REPORTING |
| Retention of incident records and photos | node FACT-RETENTION-SCHEDULE; [docs/data-inventory.md](../data-inventory.md) |
| Warranty and cancellation rules | [attorney.md](attorney.md) A-03, A-05 |

Staging access comes from the owner separately.

## 4. The 26 services (OWN-DEC-04, OWN-DEC-33)
| Code | Service | Notes from the graph |
| --- | --- | --- |
| SVC-CL-01 | Routine House Cleaning | |
| SVC-CL-02 | Deep Cleaning | appliance pull-out referred out |
| SVC-CL-03 | Move-In/Move-Out Cleaning | |
| SVC-CL-04 | Post-Construction Cleaning | residential only; acid grout-haze removal referred out |
| SVC-CL-05 | Airbnb Turnover | |
| SVC-CL-06 | Hotel-Style Housekeeping | |
| SVC-CL-07 | Air Duct & Ventilation Cleaning | biocide fogging referred out; licensed HVAC work excluded (FACT-SVC-EXCLUDED-SCOPE) |
| SVC-DW-01 | Patching & Repair | pre-1978 limit; licensed plumbing, electrical, gas and HVAC excluded |
| SVC-DW-02 | Texture Matching & Popcorn Removal | pre-1978 limit; popcorn removal only from 1981 |
| SVC-DW-03 | Remodeling & Home Additions | pre-1978 limit |
| SVC-DW-04 | Residential New Construction | residential only |
| SVC-HI-01 | Picture Hanging & Art Installation | mounting over fireplaces referred out |
| SVC-HI-02 | Barbecue & Grill Cleaning/Maintenance | gas burner-port clearing referred out |
| SVC-HI-03 | Driveway Pressure Washing | |
| SVC-HI-04 | TV Mounting & Wire Hiding | mounting over fireplaces referred out; no line-voltage electrical work |
| SVC-HI-05 | Door Hardware & Smart Locks | |
| SVC-HI-06 | Gutter Maintenance & Leaf Protection | ladders only, no roof edge; roof-edge gutter guards referred out |
| SVC-HI-07 | Attic Insulation | fixture boxing referred out |
| SVC-HI-08 | Closet & Shelving Installation | |
| SVC-HI-09 | Trim & Architectural Molding | pre-1978 limit |
| SVC-HI-10 | Fence Maintenance & Structural Repairs | name says "Structural"; HandyHub performs no structural work (see I-02) |
| SVC-HI-11 | Deck Maintenance & Board Repairs | joist sistering referred out |
| SVC-PT-01 | Residential Interior Painting | pre-1978 limit |
| SVC-PT-02 | Deck & Fence Staining/Sealing | pre-1978 limit |
| SVC-PT-03 | Brick Limewashing & Masonry Coatings | pre-1978 limit |
| SVC-PT-04 | Wallpaper Removal & Surface Restoration | pre-1978 limit |

## 5. Questions

### I-01 Coverages the business needs
- **Question:** which coverages should the business hold for this operation (the graph names general liability, workers and vehicles), with what limits, and which are required by Kentucky or Indiana before employees work?
- **Unblocks:** OQ-INSURANCE-EVIDENCE, OWN-DEC-04, OWN-DEC-33.
- **Current rule:** "nothing says or implies the business is insured; terms v1.0 contain no insurance statement" (OQ-INSURANCE-EVIDENCE). "Insurance is confirmed only from policy documents." (OWN-DEC-04).
- **Launch gate:** PRODUCTION: a service is offered for real work only when "insurance is confirmed" (OWN-DEC-33); OQ-INSURANCE-EVIDENCE is among the go-decision prerequisites (OQ-GO-DECISION).

### I-02 Does the policy cover each of the 26 services in both states?
- **Question:** for each service in section 4, is the activity covered in Kentucky and in Indiana, and are there exclusions the business must know (heights and ladders, pressure washing, attic work, drywall and popcorn removal, fence and deck repairs, smart-lock and door-hardware installation, wall mounting)? How should the name "Fence Maintenance & Structural Repairs" be read by an insurer, given that HandyHub never performs structural work?
- **Unblocks:** OQ-INSURANCE-EVIDENCE, OWN-DEC-33.
- **Current rule:** reported capability is never proof of insurance, qualifications or equipment (OWN-DEC-04).
- **Launch gate:** PRODUCTION, per service.

### I-03 Proof a subcontractor provides before the first job
- **Question:** what proof of a subcontractor's own insurance should the business collect before the first job, what should it show, and how should it be renewed or re-checked?
- **Unblocks:** OQ-INSURANCE-EVIDENCE, OQ-SUBCONTRACTOR-POLICY.
- **Current rule:** owner answer 2026-10-05T16:29: subcontractors show proof of their own insurance before their first job. No subcontractor-specific workflow is built and no certificate tracking exists (OWN-DEC-82 removed credential uploads and expiry reminders).
- **Launch gate:** NONE STATED. RECOMMENDATION: answer before the first subcontractor job.

### I-04 Vehicles
- **Question:** what vehicle coverage applies when the owner, employees or subcontractors drive to jobs and carry tools and materials?
- **Unblocks:** OQ-INSURANCE-EVIDENCE (owner answer 2026-10-05T17:27 [Vehicles]).
- **Launch gate:** PRODUCTION (part of I-01).

### I-05 What the insurer needs after damage, injury or a dispute
- **Question:** what must be recorded and preserved after property damage, an injury or a dispute, how soon must the insurer be notified, and is there anything staff must or must not say to the customer beyond the rules below?
- **Unblocks:** OWN-DEC-124, FACT-SVC-INCIDENT-REPORTING, HH-INC-01, HH-INC-02.
- **Current decided rules:** damage, injury and disputes are flagged to the owner promptly; "The Owner handles any insurer, attorney, or other professional referral; the system never decides fault, admits liability, or promises compensation." (OWN-DEC-124). Records relevant to a case are kept under a hold. The incident rules in every SOP (PROPOSED wording, pending qualified review, FACT-SVC-INCIDENT-REPORTING): report every injury, property damage, near miss, customer conflict, tool or equipment failure and suspected hazardous-material exposure; "Record facts, photos and actions taken. Do not guess causes or discuss fault or liability with the customer; refer those questions to the owner"; keep injury and medical details out of customer-visible notes.
- **Launch gate:** NONE STATED. RECOMMENDATION: answer with I-01.

### I-06 Record retention the insurer may require
- **Question:** does the insurer require incident records, photos, checklists, change orders or approvals to be kept longer than the schedule below, and when should an "insurance hold" be placed on records?
- **Unblocks:** OQ-RETENTION-REVIEW, FACT-RETENTION-SCHEDULE, OWN-DEC-70.
- **Current schedule:** ordinary safety acknowledgments and incident records 10 years after closure; job photos, operational messages, checklists and arrival/finish times 7 years after job closeout; accepted estimates, authorizations, contracts and change orders 10 years after final job closeout. "Longer legal, tax, insurance or contractual requirements override these defaults." Before any deletion the system checks for legal or insurance holds, which block it (FACT-RETENTION-SCHEDULE).
- **Launch gate:** FEATURE (irreversible deletion stays off until the CPA and the attorney confirm the periods, OWN-DEC-177).

### I-07 The 90-day workmanship warranty
- **Question:** does offering a 90-day workmanship warranty, counted from the reviewed completion date, affect coverage, and should return visits under it be reported to the insurer?
- **Unblocks:** OWN-DEC-135, FACT-WARRANTY.
- **Current rule:** the warranty is decided; its wording and exclusions wait for the attorney ([attorney.md](attorney.md) A-05). A warranty claim opens a case with return-visit punch items (OWN-DEC-135).
- **Launch gate:** FEATURE (the next estimate-terms version).

### I-08 PROPOSED (not in OWN-DEC-186): unattended access and property access codes
- **Question:** is there a coverage consequence when workers enter a home with no customer present or hold property access codes?
- **Unblocks:** OWN-DEC-68 (unattended access is allowed only when the customer approved the scope and explicitly authorized it), FACT-RETENTION-SCHEDULE (access codes removed when no longer needed).
- **Launch gate:** NONE STATED.

### I-09 PROPOSED (not in OWN-DEC-186): money collected in the field
- **Question:** is coverage needed for cash and checks collected by field employees?
- **Unblocks:** FACT-PAYMENT-METHODS (cash, check and Square Tap to Pay collected by the owner and field employees with an explicit permission, OWN-DEC-138).
- **Launch gate:** NONE STATED.

### I-10 PROPOSED (not in OWN-DEC-186): customer data held in the software
- **Question:** is coverage needed for the customer personal data, photos and access codes the software stores with its vendors (Render, Cloudflare R2, Bird, Resend)?
- **Unblocks:** OWN-DEC-72 (vendor list), HH-PRIV-01.
- **Launch gate:** NONE STATED.

## 6. Sign-off
| Item | Approved / Changed / Not my area | Reviewer | Date |
| --- | --- | --- | --- |
| I-01 Coverages and limits | | | |
| I-02 Coverage per service, Kentucky | | | |
| I-02 Coverage per service, Indiana | | | |
| I-03 Subcontractor proof | | | |
| I-04 Vehicles | | | |
| I-05 Incident, damage and injury records | | | |
| I-06 Retention required by the insurer | | | |
| I-07 Warranty | | | |
| I-08 Unattended access | | | |
| I-09 Field collections | | | |
| I-10 Customer data | | | |

Policy documents themselves are never stored in this public repository; the owner keeps them and records the confirmation (OWN-DEC-04).

## 7. What is NOT claimed
- Nothing says or implies that the business, its workers or its subcontractors are insured, bonded or licensed (OQ-INSURANCE-EVIDENCE, OQ-PERMITS-LICENSING).
- No warranty beyond the decided 90-day workmanship warranty, whose wording waits for the attorney; no guarantee, limitation of liability or damage-claim procedure is written (OWN-DEC-127).
- Nobody, staff or software, decides fault, admits liability or promises compensation (OWN-DEC-124).
- No safety certification: resolving a hold "is never a certification that the site is safe or a legal conclusion" (HH-INC-03).

## 8. Launch gates of this packet
| Gate | Items |
| --- | --- |
| PRODUCTION | I-01, I-02 (per service), I-04 |
| FEATURE | I-06 (irreversible deletion), I-07 (next terms version) |
| NONE STATED | I-03, I-05, I-08, I-09, I-10 |
