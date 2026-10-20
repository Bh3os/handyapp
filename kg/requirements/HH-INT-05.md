---
id: HH-INT-05
type: requirement
title: Anonymous draft uploads use an expiring capability scoped to that draft
status: active
priority: P0
area: intake
links:
  depends_on: ["[[HH-INT-10]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-Photo]]", "[[ENT-Request]]", "[[INT-R2]]"]
  tested_by: ["[[T15]]"]
  part_of: ["[[C02]]"]
source: "guide 7.2 HH-INT-05"
---
- Before submission, uploads use an expiring capability scoped to one draft. It cannot read existing customer records, other drafts, or any private object list.
- On submission the server binds attachment ownership to the new request and project; the client cannot choose the owner.
- The draft capability is consumed or rotated when the request is finalized. Retrying a failed photo from the receipt ([[HH-INT-12]]) uses a capability scoped to that request only.
