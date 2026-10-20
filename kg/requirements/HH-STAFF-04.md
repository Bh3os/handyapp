---
id: HH-STAFF-04
type: requirement
title: Permissions enforced on every read, write, search, download, export, task and projection
status: active
priority: P0
area: staff
links:
  decided_by: ["[[OWN-DEC-115]]", "[[OWN-DEC-117]]"]
  depends_on: ["[[HH-ARC-03]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-RoleGrant]]"]
  tested_by: ["[[T26]]", "[[T68]]"]
  part_of: ["[[S01]]", "[[S03]]"]
source: "guide 10.2 HH-STAFF-04, access matrix; OWN-DEC-115, OWN-DEC-117"
---
- Every API read and write, search, list, download, export, background task and field projection checks the role matrix ([[ROLE-MATRIX]]) and record scope on the server. "Assigned" means an active assignment or explicitly approved job sharing; "scoped" means only the records and fields that role needs.
- Restricted fields (access codes, incident details, financial details, costs and margins) are masked or omitted in list results as well as detail screens.
- Requesting a hidden route directly is refused by the server.
- Future subcontractors receive only their assigned work packages and the necessary site information, never general CRM or finance access.
