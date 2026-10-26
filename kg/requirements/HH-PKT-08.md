---
id: HH-PKT-08
type: requirement
title: "Visit-day data access for the workers assigned to the visit"
status: active
priority: P0
area: field
links:
  decided_by: ["[[OWN-DEC-171]]", "[[OWN-DEC-196]]"]
  depends_on: ["[[HH-CRM-03]]", "[[HH-DATA-08]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-Visit]]", "[[ENT-Reservation]]", "[[ENT-JobPacket]]", "[[ENT-AccessInstructionSecret]]", "[[ENT-Contact]]", "[[ENT-AuditEvent]]"]
  tested_by: ["[[T28]]", "[[T44]]"]
  part_of: ["[[S07]]"]
source: "OWN-DEC-171 (new behaviour; no guide id)"
---
- Before the visit day a worker assigned to the visit sees job type, date, arrival window, tools, materials, SOPs, hazards, safety guidance and the general service area, never the full address, personal phone numbers or access codes.
- On the visit day the assigned workers see the customer's first name, the verified address, the site contact's phone when needed for coordination, and access codes only after an explicit, authenticated, audited reveal.
- The access ends at the end of the property's local service day, at once on removal, offboarding or cancellation, and moves with a reschedule. The Owner may grant a temporary extension with a reason and an automatic expiry.
- The server enforces every rule (hidden fields are never the control); codes never go into push notifications, texts, emails or logs; offline copies expire with the access as far as technically possible.
- Calls and messages to the site contact go through an authorized action and stay with the project.

Built by [[TSK-0128]] (2026-10-26); the PROPOSED details (service area, first name, extension limits, offline trimming) and the call action still to build are in [[OQ-WORKER-ACCESS-DETAILS]].
