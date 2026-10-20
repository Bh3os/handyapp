---
id: HH-PKT-01
type: requirement
title: "One complete, versioned job packet before departure and Start Work"
status: active
priority: P0
area: field
links:
  decided_by: ["[[OWN-DEC-108]]", "[[OWN-DEC-121]]", "[[OWN-DEC-82]]", "[[OWN-DEC-80]]", "[[OWN-DEC-81]]", "[[OWN-DEC-40]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]", "[[RULE-NO-INVENTED-FACTS]]", "[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-JobPacket]]", "[[ENT-Job]]", "[[ENT-Visit]]", "[[ENT-Property]]", "[[ENT-SOPVersion]]", "[[ENT-Hold]]", "[[ENT-AccessInstructionSecret]]"]
  tested_by: ["[[T43]]"]
  part_of: ["[[S07]]", "[[C08]]"]
source: "guide 15.1 HH-PKT-01 (packet table); OWN-DEC-40, 80, 81, 82, 108, 121"
---
Before departure and before Start Work, each assigned worker gets one complete, versioned job packet ([[ENT-JobPacket]]). Critical information never requires searching other screens or outside chat messages.

| Section | Contents | Visibility and freshness |
| --- | --- | --- |
| Identity and visit | Job and project reference, services, date and window, visit purpose, assigned workers, lead, current state | Current server state and last-synced time |
| Property and site | Verified address and unit, a plain directions link to a maps app, parking and loading, access window, authorized site contact | Address only from visit confirmation through the service day; access codes are never in the packet: revealed separately online ([[HH-OFF-02]]) |
| Occupants and environment | Pets, children or occupancy concerns, restricted spaces, sensitive surfaces, utility availability | Operational facts only, with source and last-confirmed date |
| Approved scope | Accepted estimate version, work areas, quantities and specifications, selected options, exclusions, approved change orders | Immutable accepted snapshots plus current approved deltas |
| Prior evidence | Customer photos, survey notes, existing condition, relevant earlier-job information | Only relevant authorized items |
| SOP checklist | The job-specific checklist from the approved SOP versions of the selected services ([[HH-WORK-11]]) | Exact versions pinned; review state and translation state shown |
| Hazards and controls | Service and site hazards, required PPE and controls, stop conditions, manufacturer or SDS references where they exist | Unknown stays unresolved; review state explicit |
| Tools and equipment | Critical and optional items, sizes or models, quantities, condition checks, reserved items | Availability and loaded or verified state |
| Materials | Approved items, specification, color or model, quantities, supplier, customer-supplied items, substitution limits | On-hand, reserved or loaded status; quantities never invented |
| Dependencies | Job-level Hold / Ready state and its note, approval state, deposit state, access, multi-visit or cure dependencies | Blocking status, owner, resolution evidence |
| Pre-work evidence | Required arrival, existing-condition and setup photos, measurements, product or model checks | Capture checklist and missing items |
| Communication and emergency | Owner escalation contact, site contact, emergency process ([[HH-WORK-13]]), Report Hazard and Stop Work | One tap away; the packet never suggests waiting for the app during an emergency |
| Completion preview | Required after-photos, owner quality review, cleanup, walkthrough, approved care notes | Known before starting |
