---
id: HH-DATA-05
type: requirement
title: Operational, visit, hold, quality and financial states kept separate
status: active
priority: P0
area: platform
links:
  depends_on: ["[[HH-STATE-01]]"]
  uses: ["[[ENT-Job]]", "[[ENT-Visit]]", "[[ENT-Hold]]", "[[ENT-Invoice]]"]
  tested_by: ["[[T23]]", "[[T56]]"]
source: "guide 22.2"
---
- A job's operational state, its visits' states, its hold state, its quality state and its financial state are stored and changed separately.
- "Paid" never means complete; "complete" never means paid; "paused" never deletes or cancels confirmed scheduling history.
- Screens and reports derive each status from its own state and show them side by side (for example the customer's separate payment summary, [[HH-STATE-01]]).
