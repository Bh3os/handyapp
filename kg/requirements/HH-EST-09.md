---
id: HH-EST-09
type: requirement
title: "Request Changes and Decline keep history; silence never accepts"
status: active
priority: P0
area: approval
links:
  decided_by: ["[[OWN-DEC-103]]"]
  uses: ["[[ENT-EstimateVersion]]", "[[ENT-Message]]", "[[ENT-AuditEvent]]"]
  tested_by: ["[[T33]]"]
  part_of: ["[[C05]]", "[[S04]]"]
source: "guide 13.2 HH-EST-09; OWN-DEC-103"
---
- "Request Changes" and "Decline" stay available to the verified customer on a published version.
- Request Changes records the customer's message as a revision request on the project, notifies the responsible staff member and stops estimate reminders ([[HH-EST-14]]).
- Decline accepts an optional reason, sets the version to `declined`, keeps all evidence and creates a staff follow-up item.
- Customer questions create follow-up items and never change the estimate.
- An unanswered question or no response never accepts terms.
- The history of requests, declines and replies is append-only on the project.
