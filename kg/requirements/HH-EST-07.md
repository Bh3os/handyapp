---
id: HH-EST-07
type: requirement
title: "Approval validated in one transaction; retries create one approval"
status: active
priority: P0
area: approval
links:
  decided_by: ["[[OWN-DEC-103]]"]
  depends_on: ["[[HH-EST-06]]", "[[HH-API-04]]", "[[HH-DATA-04]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-Approval]]", "[[ENT-EstimateVersion]]", "[[ENT-Job]]"]
  tested_by: ["[[T33]]", "[[T34]]", "[[T32]]"]
  part_of: ["[[C05]]"]
source: "guide 13.2 HH-EST-07; OWN-DEC-103"
---
In one authoritative database transaction the server checks:
- the version is the current published version and is not expired, superseded, withdrawn, declined or already accepted;
- the validity date has not passed (business time zone, [[FACT-TIMEZONE]]);
- the actor holds verified access to this project, with fresh verification;
- the submitted options and total equal the server's computation for those options;
- the terms version shown is the current one.

Outcomes:
- An expired or superseded version is refused. The customer is shown the current version when one exists, otherwise "Request an Updated Estimate".
- A stale verification is answered with a new one-time code to the verified contact, without losing the selected options (kept on the client and the server).
- An altered total or option set is refused with no record written.
- Double clicks, two tabs and retries with the same idempotency key return the first result: exactly one approval, one job and one scheduling task. Unique constraints back this up; the same key with a different body is a conflict.
