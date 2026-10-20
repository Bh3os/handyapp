---
id: HH-PORT-11
type: requirement
title: Photos tab shows customer uploads and staff-shared photos; internal photos are inaccessible
status: active
priority: P0
area: portal
links:
  decided_by: ["[[OWN-DEC-106]]", "[[OWN-DEC-109]]"]
  depends_on: ["[[HH-STAFF-05]]", "[[HH-SEC-05]]", "[[HH-PRIV-02]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-Photo]]", "[[INT-R2]]"]
  tested_by: ["[[T24]]", "[[T57]]", "[[T68]]"]
  part_of: ["[[C06]]", "[[C09]]"]
source: "OWN-DEC-106, OWN-DEC-109"
---
- The Photos tab shows the customer's own uploads and the before and after photos staff chose to share (paired where possible), with meaningful labels.
- Internal photos are inaccessible, not merely hidden: the server refuses them by URL, ID or storage key, and tests try direct access to an internal photo.
- The customer can upload photos a staff question asks for ([[HH-LEAD-03]]).
- Sharing a photo with the customer never authorizes marketing use; that needs a separate recorded permission.
