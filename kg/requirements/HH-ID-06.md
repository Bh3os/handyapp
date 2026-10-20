---
id: HH-ID-06
type: requirement
title: Expiry and attempt limits for invitations, codes and project sessions
status: active
priority: P0
area: identity
links:
  decided_by: ["[[OWN-DEC-96]]", "[[OWN-DEC-103]]", "[[OWN-DEC-70]]"]
  depends_on: ["[[HH-ID-04]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-ProjectAccessGrant]]", "[[FACT-RETENTION-SCHEDULE]]"]
  tested_by: ["[[T18]]"]
  part_of: ["[[C03]]", "[[C05]]", "[[C06]]"]
source: "guide 8.2 HH-ID-06; OWN-DEC-96, OWN-DEC-103"
---
Configurable engineering defaults (the guide's proposal; not owner business facts, adjustable to the identity primitives used):
- an access invitation expires after 24 hours;
- a verification code lasts 10 minutes, with a bounded number of attempts and resends;
- a single-use session-establishment credential is exchanged for a project-scoped session with 30 minutes of inactivity expiry and 8 hours absolute expiry.

Behaviour on expiry:
- Expiry offers a safe reissue (a new code or link) without losing project state.
- When verification has expired during an estimate approval, a new code is offered without losing the customer's selected options, which are kept client- and server-side.
- Sessions and access links expire by these settings; no other retention applies to them.
