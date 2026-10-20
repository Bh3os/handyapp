---
id: HH-WORK-04
type: requirement
title: "Start rechecks every gate in the start transaction"
status: active
priority: P0
area: safety
links:
  decided_by: ["[[OWN-DEC-121]]"]
  depends_on: ["[[HH-DATA-04]]", "[[HH-API-04]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]"]
  uses: ["[[ENT-StartGateEvaluation]]", "[[ENT-Job]]", "[[ENT-JobPacket]]", "[[ENT-Acknowledgment]]", "[[ENT-GateException]]"]
  tested_by: ["[[T46]]"]
  part_of: ["[[S07]]"]
source: "guide 16.1 HH-WORK-04"
---
- Start Work runs as one transaction under the job lock: it re-evaluates every prerequisite of [[HH-WORK-01]] and the packet version, then commits the job and task state, the worker or team, the server timestamp, the packet, scope and SOP versions, the acknowledgments and any approved exception.
- A green preflight screen never authorizes a later start: if anything changed (a new hold, a packet version, an assignment), the start is refused with the current missing items.
- A hazard report and its critical hold commit under the same job lock, so a start never commits against a hold raised a moment earlier.
- A start shortcut from a list, notification or offline screen cannot bypass the briefing or the gate.
