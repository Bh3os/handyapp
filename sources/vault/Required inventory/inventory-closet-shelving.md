---
title: "Inventory & Tools: Closet & Shelving System Installation"
service_id: HI-08
service_slug: closet-shelving
canonical_name: "Closet & Shelving System Installation"
category: "Home Improvement"
doc_type: inventory
status: draft
authority: supporting
owner_approved: false
human_review:
  - "owner"
  - "safety reviewer (PPE/hazmat)"
  - "qualified English/Spanish reviewer (Arabic headings, C-HI08-13)"
registry: "AI Development Plans/04-service-registry.md#HI-08"
last_reviewed: 2026-10-03
---

# 📦 Inventory & Tools: Closet & Shelving System Installation

> [!warning] Draft — not owner-approved
> Canonical service: **HI-08 — Closet & Shelving System Installation** · [Registry entry](../AI%20Development%20Plans/04-service-registry.md#HI-08)
> Checklist only — quantities, stock levels, preferred vendors and reorder points are not yet defined. Proposed additions from the SOP and spec-card cross-check are listed at the end, pending owner and safety review. See [29 Inventory and procurement](../AI%20Development%20Plans/29-inventory-and-procurement.md).
> Legacy artifacts: Arabic text in this file (the parentheticals in both section headings) is a non-authoritative brainstorm remnant (canonical currency USD, launch market KY/IN, languages EN/ES). It is kept unchanged pending an owner decision on cleanup.
> Review notes for this file: see "Review notes and cross-references" at the end.


## 🧳 A. Track Systems & Mounting Anchors (أدوات ومسامير التثبيت الثقيلة)
- [ ] **Heavy-Duty Steel Wall Toggle Bolts (3/16" x 3"):** Capable of holding high load margins on open hollow drywall.
- [ ] **Self-Drilling Zinc Drywall Wall Anchors:** Fast thread variants for intermediate wall divider shelves.
- [ ] **Structural Wood Screws (2.5-inch T25 Star Drive):** For directly hitting framing studs with zero anchor flex.
- [ ] **Pre-Cut Wire Shelving Tracks & Clothing Rod End-Caps:** Standard sizes stocked inside the van rig.

## 🛠️ B. Levelling & Fastening Hardware (أدوات الموازنة والقطع)
- [ ] **360-Degree Self-Leveling Green Laser Level Line:** Projects exact horizontal anchor paths across multi-wall configurations.
- [ ] **Cordless Professional Hacksaw / Portaband Saw:** For clean cutting of metal wire shelving grids without jagged burrs.
- [ ] **Heavy-Duty Rubber Mallet:** For snapping vertical standard brackets into top track locks without marring.
- [ ] **Magnetic Stud Finder with Center Target Laser:** Isolates wood vs. metal stud backings.

## Categorization of listed items (added 2026-10-03)
| Item (as listed above) | Item class | Default source / custody | Hazmat / SDS needed | Shelf-life / expiry | SOP step that uses it | Notes |
|---|---|---|---|---|---|---|
| Heavy-Duty Steel Wall Toggle Bolts (3/16" x 3") | consumable_incorporated | unknown (owner decision, Q-29-06) | No | Not stated | Option A "Toggle Bolt Fastening" | "Capable of holding high load margins on open hollow drywall" is an unrated, unapproved load claim: use only within the anchor manufacturer's rating and spacing, recorded per job (C-HI08-03; spec HI-08.SAF "confirm load path/fastener rating") |
| Self-Drilling Zinc Drywall Wall Anchors | consumable_incorporated | unknown | No | Not stated | None - unused by the current SOP | Load rating not stated, and none may be assumed (risk-triage playbook: anchor load ratings are never invented); kept as listed |
| Structural Wood Screws (2.5-inch T25 Star Drive) | consumable_incorporated | unknown | No | Not stated | Option B "Direct Wood Driving" | The matching driver bit is not listed (proposed below). "zero anchor flex" is an unverified absolute claim (lead installer review); spacing per the system manufacturer (spec HI-08.SAF "follow manufacturer spacing") |
| Pre-Cut Wire Shelving Tracks & Clothing Rod End-Caps | consumable_incorporated | vehicle_stock ("stocked inside the van rig") | No | Not stated | Option A "Top Track Drilling" (metal top track); no step uses the rod end-caps | Pricing assumes client-supplied kits; whether van stock is resold, kept as spares or used for repairs is undecided (02 G-158; Q-29-14). Fitting stocked parts into a customer's system is a substitution that needs approval (spec JOB-007) |
| 360-Degree Self-Leveling Green Laser Level Line | tool | unknown | Unknown - reviewer (power source not stated) | n/a (tool) | Option A "Laser Level Baseline" | core-handyman kit (29 section 5.2); "exact horizontal anchor paths" is a description, not a verified accuracy |
| Cordless Professional Hacksaw / Portaband Saw | tool | unknown | Yes - SDS required (TBD) for the cordless battery pack | Battery condition per manufacturer (not stated) | None - unused by the current SOP (no cutting step) | The card allows a "saw if authorized" (spec HI-08.TLS). Cut wire and track ends are a sharp-edge hazard (HI-08.HAZ) and "no sharp projections" is a QA check (HI-08.QAC); "without jagged burrs" is not a verified control |
| Heavy-Duty Rubber Mallet | tool | unknown | No | n/a (tool) | None - unused by the current SOP (not named in any step) | core-handyman kit (29 section 5.2) |
| Magnetic Stud Finder with Center Target Laser | tool | unknown | Unknown - reviewer (power source not stated) | n/a (tool) | Option B "Stud Mapping", which names a "deep-scanning sensor" instead (C-HI08-10) | Not shown to locate utilities, which HI-08.SAF requires ("locate studs/utilities") (ASSUMPTION - confirm against manufacturer data). "Isolates wood vs. metal stud backings" is an unverified capability claim (owner, lead installer); metal studs are a stop condition for this service (31 section 10 HI-08) |

## Proposed additions from SOP and spec-card cross-check (pending owner and safety review)
| Item | Item class | Required by (source) | Reason | Status |
|---|---|---|---|---|
| PPE for drilling, cutting and handling wire shelving and metal track, lifting and ladder work, including eye protection (02 C-HI08-02) and hand protection where sharp edges are handled (29 section 5.2 ppe-base) - selection by qualified safety professional | ppe | spec HI-08.HAZ "drilling hidden utilities, sharp edges, lifting, ladder, falling loads"; the HI-08 card names no PPE (29 section 7.3) | not listed | PROPOSED |
| `vehicle-safety` kit reference: first-aid kit, fire extinguisher, eyewash and spill kit as review items; contents by qualified safety professional | kit (mixed classes) | 29 D-29-08 and section 5.2; X-10 | no emergency kit in any inventory | PROPOSED |
| SDS register field for chemical products and batteries | n/a (record field) | 02 G-008; 29 sections 2.1 (lithium batteries as SDS-type products) and 8.3 | no chemical product is listed today, but the cordless saw's battery pack (categorization above) needs an entry now; trim/patch or any other chemical product needs one before it is added (a chemical product without a reviewed SDS is not carried to a job) | PROPOSED |
| Scanner able to locate studs and utilities in the drilling and fastening path, used per its manufacturer instructions | tool | spec HI-08.SAF "locate studs/utilities"; HI-08.HAZ "drilling hidden utilities"; SOP "Stud Mapping" ("deep-scanning sensor"); 02 C-HI08-02; 29 section 5.2 core-handyman | the listed magnetic stud finder is not shown to locate utilities (C-HI08-10) | PROPOSED - model chosen by owner and lead installer |
| Drill/driver and a 1/2-inch drill bit | tool | SOP "Top Track Drilling" ("drill 1/2-inch holes through the drywall"); spec HI-08.TLS "drill/driver, bits" | not listed | PROPOSED - bit size to be confirmed against the toggle manufacturer's instructions |
| Impact driver | tool | SOP "Toggle Bolt Fastening" ("using an impact driver") | not listed | PROPOSED - tightening per the anchor manufacturer's instructions (C-HI08-03) |
| Driver bit matching the listed structural wood screws | tool | inventory item "Structural Wood Screws" above; spec HI-08.TLS "bits" | not listed | PROPOSED |
| Vertical shelf standards, wire shelf brackets, shelves and rods per the system manufacturer, where HandyHub supplies the system | consumable_incorporated | SOP "Standard Hanging"; spec HI-08.MAT "track/brackets/shelves/rods" | only tracks and rod end-caps are listed | PROPOSED - supply policy Q-29-14 |
| Manufacturer instructions and load data (rating, spacing) for the listed anchors and screws and for each kit installed | n/a (job-packet document) | spec HI-08.SAF "confirm load path/fastener rating ... follow manufacturer spacing"; spec BRF-011 "product instructions"; C-HI08-03 | no file holds rating or spacing data | PROPOSED |
| Measuring tools, including a means to check level and square | tool | spec HI-08.TLS "measuring tools"; SOP "Standard Hanging" ("verify perfect square alignment"); HI-08.QAC "level/plumb" | only the laser line is listed | PROPOSED |
| Hand tools per the core-handyman kit | tool | spec HI-08.TLS "hand tools"; 29 section 5.2 | only the rubber mallet is listed | PROPOSED - kit contents Q-29-05 |
| Ladder or step stool - per approved height/access policy (none exists, [02](../AI%20Development%20Plans/02-gap-analysis.md) G-005) | specialty_equipment | spec HI-08.HAZ "ladder"; X-12; 29 section 7.3 | not listed | PROPOSED |
| Vacuum and cleanup supplies | tool and consumable_supply | spec HI-08.QAC "area clean"; spec QA-002; 29 section 5.2 dust-control | not listed | PROPOSED |
| Trim/patch materials, only if included in the approved scope | consumable_incorporated | spec HI-08.MAT "trim/patch materials if included" | not listed; whether patching is included is an owner scope decision (04 HI-08 exclusions) | PROPOSED - any chemical product needs a reviewed SDS first (29 section 8.3) |
| Lumber or wooden shelves and a wood-cutting saw, only if wood shelving is in scope | consumable_incorporated and tool | pricing heading "Custom Heavy-Duty Garage/Pantry Slats (You supply lumber/shelves + labor)"; spec HI-08.TLS "saw if authorized" | not listed; no SOP step covers wood shelving (owner scope decision, C-HI08-05) | PROPOSED - only after the owner's scope decision |

### Customer-provided items (proposed section)
- Client-supplied modular kits ("Client-Supplied Modular Kits (e.g., ClosetMaid, IKEA, Elfa tracks)", pricing file): item class `consumable_incorporated`, source `customer_provided`; a job line only, never HandyHub stock (29 section 3.2). Before installation the worker records visible condition, model and quantity and checks the kit against its manufacturer instructions (spec START-009; 29 section 9.1); a missing or defective part is recorded as an unexpected condition (spec JOB-004). The acceptance, defect and liability rule is pending attorney review (X-22; Q-29-07). Status: PROPOSED.

---

## Review notes and cross-references (added 2026-10-03)

*Added during the AI orchestrator repository audit. Not part of the original content; original text above is unchanged.*

**Related files:** [Registry entry](../AI%20Development%20Plans/04-service-registry.md#HI-08) · [Pricing](../Pricing/pricing-closet-shelving.md) · [Agreement](../Service%20Agreements/contract-closet-shelving.md) · [SOP](../Standard%20Of%20Operations/sop-closet-shelving.md) · [Requirements spec (service card HI-08)](../Requierments/HandyHub_Requirements_Specification_Reconstructed.md) · [Main plan](../Main%20Plans/Home%20Improvement%20Business.md) · [Gap analysis](../AI%20Development%20Plans/02-gap-analysis.md)

### Issues affecting this file
| ID | Severity | Issue (short) | Reviewer / owner |
|---|---|---|---|
| C-HI08-03 | high | Fastening method prescribed without fastener rating, manufacturer spacing or load-path checks; this file's toggle line claims "high load margins" without a rating (Notes column above) | Owner; qualified safety professional; experienced lead installer (qualified reviewer) |
| C-HI08-10 | low | The SOP specifies a deep-scanning sensor; this file stocks a magnetic stud finder (scanner proposed above) | Owner; lead installer |
| C-HI08-13 | low | Arabic heading text in an English/Spanish operating document (legacy-artifact line in the status callout) | Bilingual EN/ES reviewer; owner |
| X-10 | high | No emergency kit in any inventory and no incident step in any SOP (`vehicle-safety` kit proposed above) | Owner; qualified safety professional |
| X-12 | high | No shared height and access standard; the HI-08 card flags ladder risk and no access equipment is listed (proposed above) | Owner; qualified safety professional |
| X-22 | medium | Customer-supplied products (here client modular kits) have no common acceptance, defect or liability rule (customer-provided section above) | Owner; attorney (KY/IN) |

### Open questions
- Q-29-14 (owner): which closet systems, if any, HandyHub supplies as standard, and which models; and whether the van-stocked tracks and rod end-caps are resold, kept as spares or used for repairs (02 G-158).
- From the register, C-HI08-10 (owner; lead installer): which scanner is standard, checked against manufacturer data for stud and utility detection.
- Q-29-05 (owner; job planner drafts): initial contents and par levels of the core-handyman, access-height, dust-control, ppe-base and vehicle-safety kits that HI-08 uses (29 section 5.4).
- Q-29-07 (owner; attorney licensed in KY and/or IN): acceptance and liability rule for customer-supplied kits (X-22).
- Q-29-09 (owner): who selects PPE and approves ladders and access equipment for this service.
- Q-31-09 (owner; qualified safety professional): the height and access policy that the proposed ladder or step stool depends on (X-12).
- Q-31-11 (owner; qualified safety professional): contents of the emergency kit (X-10).
- Q-36-04 (owner; qualified English/Spanish reviewer): remove or keep the Arabic heading text; the reviewer should also confirm whether the Arabic in heading B matches its English wording "Levelling & Fastening Hardware" (C-HI08-13).

### Revision history
| Date | Change | Author |
|---|---|---|
| 2026-10-03 | Added frontmatter, status callout with legacy-artifact line, categorization and proposed-additions tables, and review notes (R1, R2, R5, R3); original text unchanged | AI orchestrator (Claude) |
| 2026-10-03 | Independent review (2026-10-04): SDS register line aligned with the categorization table (the cordless saw's battery pack needs an SDS entry now); original text unchanged | AI reviewer (Claude) |
