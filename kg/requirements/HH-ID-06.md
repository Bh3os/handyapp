---
id: HH-ID-06
type: requirement
title: Expiry and attempt limits for invitations, codes and project sessions
status: active
priority: P0
area: identity
links:
  decided_by: ["[[OWN-DEC-96]]", "[[OWN-DEC-103]]", "[[OWN-DEC-70]]", "[[OWN-DEC-141]]", "[[OWN-DEC-150]]", "[[OWN-DEC-160]]"]
  depends_on: ["[[HH-ID-04]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-ProjectAccessGrant]]", "[[FACT-RETENTION-SCHEDULE]]", "[[FACT-SESSION-TIMINGS]]"]
  tested_by: ["[[T18]]"]
  part_of: ["[[C03]]", "[[C05]]", "[[C06]]"]
source: "guide 8.2 HH-ID-06; OWN-DEC-96, OWN-DEC-103, OWN-DEC-141"
---
Timings ([[FACT-SESSION-TIMINGS]], owner-accepted in [[OWN-DEC-141]]), stored as active configuration:
- a one-time verification code expires after 10 minutes, with a bounded number of attempts and resends;
- a single-use session-establishment credential is exchanged for a project-scoped session that ends after 30 minutes idle or 8 hours in total;
- a project access invitation expires after 24 hours (configurable engineering default; [[OWN-DEC-141]] set the same value for staff invite links).

Behaviour on expiry:
- Expiry offers a safe reissue (a new code or link) without losing project state.
- When verification has expired during an estimate approval, a new code is offered without losing the customer's selected options, which are kept client- and server-side.
- Sessions and access links expire by these settings; no other retention applies to them.

**Changed by [[OWN-DEC-160]] (2026-10-21):** the 24-hour guest link is decided; its expiry never closes or deletes the project.
