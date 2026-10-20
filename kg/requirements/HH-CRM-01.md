---
id: HH-CRM-01
type: requirement
title: Customer record with separate verification, channel and marketing permissions and history
status: active
priority: P0
area: records
links:
  decided_by: ["[[OWN-DEC-117]]", "[[OWN-DEC-96]]", "[[OWN-DEC-79]]"]
  depends_on: ["[[HH-ID-01]]", "[[HH-STAFF-04]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]", "[[RULE-LANGUAGES]]"]
  uses: ["[[ENT-Customer]]", "[[ENT-Contact]]", "[[ENT-ConsentPreference]]", "[[ENT-Property]]", "[[ENT-Project]]"]
  tested_by: ["[[T21]]", "[[T24]]"]
  part_of: ["[[S03]]"]
source: "guide 12.1 HH-CRM-01; OWN-DEC-117"
---
- A customer record has a stable ID, display name, contact details with separate email and phone verification, channel permissions (email, call, text, including opt-outs), a separate marketing permission with its consent history, authorized properties, projects and requests, documents, payments, and an activity history (timeline of messages and actions).
- Staff see only role-authorized records and timeline events; internal notes and restricted incidents stay private to permitted roles.
- Staff view and edit the record through the English or Spanish interface; customer-facing content stays English.
- Notes never hold passwords, access codes or payment card data.
