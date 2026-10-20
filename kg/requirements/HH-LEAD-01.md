---
id: HH-LEAD-01
type: requirement
title: New request record and original request view for staff
status: active
priority: P0
area: intake
links:
  decided_by: ["[[OWN-DEC-116]]", "[[OWN-DEC-92]]", "[[OWN-DEC-93]]", "[[OWN-DEC-96]]"]
  depends_on: ["[[HH-INT-19]]", "[[HH-INT-13]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]", "[[RULE-LANGUAGES]]"]
  uses: ["[[ENT-Request]]", "[[ENT-Project]]", "[[ENT-Photo]]", "[[ENT-StaffUser]]"]
  tested_by: ["[[T01]]", "[[T30]]"]
  part_of: ["[[S02]]"]
source: "guide 12.2 HH-LEAD-01; OWN-DEC-116"
---
- Each request keeps its original submission unchanged, its source (web form, call, manual entry), services, property, contact verification, attachments, preferred timing, the responsible staff member and its follow-up due time. Calls and manual leads use the same record with their source identified.
- Staff opening a request see the original request: selected services, answers, description, full address, timing preferences, photos and their upload status, the coverage outcome, and separate email and phone verification badges (all fields of [[HH-INT-19]]).
- Possible duplicate customers or properties appear as staff-only suggestions ([[HH-ID-02]]); staff link verified matching records or create new ones ([[HH-CRM-04]]).
- Exactly one staff member is responsible for the request; every reassignment is recorded.
- The request shows the next step, the responsible person and the follow-up due time. Decisions, messages, links and timestamps are kept in project history.
