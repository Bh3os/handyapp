---
id: HH-ARC-01
type: requirement
title: One authoritative relational business datastore for both websites
status: active
priority: P0
area: platform
links:
  decided_by: ["[[OWN-DEC-59]]", "[[OWN-DEC-130]]", "[[OWN-DEC-13]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-Customer]]", "[[ENT-Project]]", "[[ENT-Job]]", "[[ENT-Payment]]", "[[ENT-Message]]", "[[INT-Square]]", "[[INT-Bird]]", "[[INT-Resend]]"]
  tested_by: ["[[T01]]", "[[T23]]"]
  related: ["[[ARCH-STACK]]"]
source: "guide 3.1; OWN-DEC-59, OWN-DEC-130, OWN-DEC-67, OWN-DEC-111"
---
- The public site with customer portal and the staff app read and write one relational business database. There is no second database, no separate customer or job history per website, and no manual copying of records between them.
- Customer, property, request, project, accepted estimate version, appointment, job, invoice and payment stay separate records in that database ([[OWN-DEC-13]]).
- External providers may be the authority for their own transaction state; the linked business record is still kept and reconciled in the central database:
  - Square card payments are taken outside the software and recorded by hand with the Square payment ID; the business record is the recorded, verified payment, never the provider's screen ([[OWN-DEC-67]], [[OWN-DEC-111]]).
  - Bird (texts, phone) and Resend (email) report delivery and inbound messages through verified webhooks; their outcome is stored against the business message record ([[OWN-DEC-129]], [[OWN-DEC-120]]).
- The datastore technology is chosen in [[ARCH-STACK]] ([[OWN-DEC-130]]).

Sources of truth (guide 3.4), each owned by one record set and read by every screen that shows it:

| Concern | Authority | Read by |
| --- | --- | --- |
| Service and availability policy | Approved service registry | Both websites; request router and dispatch |
| Coverage | Approved coverage configuration | Public ZIP checker, staff qualification, booking |
| Customer/contact | Customer and contact records plus verified identity links | Request, account, CRM |
| Property | Property record with a job-specific snapshot | Customer project, staff briefing |
| Approved scope and price | Accepted estimate revision plus approved change orders | Customer project, worker packet, invoice |
| Appointment | Committed visit and assignment records | Customer visit screen, dispatch, worker My Day |
| Work progress | Valid job, task and hold events | Staff operations and the filtered customer timeline |
| Payment | Verified payment evidence plus allocation and reconciliation | Invoice and staff finance views |
| SOP and hazard controls | Approved versioned operational content | Staff preparation and execution only |
