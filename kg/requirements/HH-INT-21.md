---
id: HH-INT-21
type: requirement
title: Project record created automatically at submission, with secure access instructions sent
status: active
priority: P0
area: intake
links:
  decided_by: ["[[OWN-DEC-97]]", "[[OWN-DEC-95]]"]
  depends_on: ["[[HH-INT-10]]", "[[HH-ID-04]]", "[[HH-ID-09]]", "[[HH-COM-06]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-Project]]", "[[ENT-Request]]", "[[ENT-ProjectAccessGrant]]", "[[INT-Resend]]", "[[INT-Bird]]"]
  tested_by: ["[[T01]]", "[[T19]]", "[[T20]]"]
  part_of: ["[[C03]]"]
source: "OWN-DEC-97"
---
- Saving a request creates its project record in the same transaction. Staff review it afterwards. The project is not a job and not an appointment.
- "View My Request" on the receipt opens the project through verified, secure access; private information shows only after contact verification ([[HH-INT-13]]).
- Secure project-access instructions are sent automatically (an access link is an automatic-message exception, [[HH-COM-06]]). No staff action is needed to open project access.
- The guest link is single-project: it grants access to that project only ([[HH-ID-04]]). Account-wide history needs a verified identity plus authorized record links.
- A new submission with the same email or phone never reveals earlier projects.
- Expired links offer a safe way to request new access ([[HH-ID-09]]).
- Registering later links the verified request to the account without duplicating records ([[HH-ID-10]]).
