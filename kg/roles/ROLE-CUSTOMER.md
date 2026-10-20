---
id: ROLE-CUSTOMER
type: role
title: "Customer (verified contact)"
status: active
area: portal
links:
  decided_by: ["[[OWN-DEC-96]]", "[[OWN-DEC-97]]", "[[OWN-DEC-103]]", "[[OWN-DEC-106]]", "[[OWN-DEC-113]]", "[[OWN-DEC-63]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  part_of: ["[[ROLE-MATRIX]]"]
source: "guide 5.2, 8; vault 27 ROLE-002; OWN-DEC-96, 97, 106"
---
A contact who has verified their email or phone for a project: a guest through a single-project grant ([[ENT-ProjectAccessGrant]]), or an optional account holder across their authorized linked projects ([[ENT-CustomerAccount]]).

- Uses the project workspace: messages, documents, shared photos, appointments, payments.
- Approves, declines or requests changes to estimates and change orders; selects offered windows; requests reschedule or cancellation; answers questions; requests export or deletion; manages repeat-service reminders and consent.
- Never sees internal notes, internal photos, costs, restricted incidents, access codes of others or other customers' records; altered IDs return the same response as missing objects.

Full permissions: [[ROLE-MATRIX]].
