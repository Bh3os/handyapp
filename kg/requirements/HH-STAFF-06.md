---
id: HH-STAFF-06
type: requirement
title: "Staff home after sign-in by role: action queue, My Day or Owner Decisions"
status: active
priority: P0
area: staff
links:
  decided_by: ["[[OWN-DEC-115]]"]
  depends_on: ["[[HH-OPS-01]]", "[[HH-OPS-02]]", "[[HH-OFF-09]]", "[[HH-LEAD-05]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]", "[[RULE-LANGUAGES]]"]
  uses: ["[[ENT-QueueItem]]", "[[ENT-StaffUser]]"]
  part_of: ["[[S01]]"]
source: "OWN-DEC-115 (queue content owned by HH-OPS-01 and HH-OPS-02)"
---
After sign-in each staff member lands on the home of their role ([[OWN-DEC-115]]):
- Owner, Office/Dispatcher and Estimator: the action queue ([[HH-OPS-01]]), with its items ([[HH-OPS-02]]).
- Worker: My Day ([[HH-OFF-09]]).
- Owner, additionally: Owner Decisions ([[HH-OPS-01]]).

The queue's ordering, item types, item fields, response clock ([[HH-LEAD-05]]), masking and refresh behaviour are defined only in those nodes. The server enforces the role on every item.
