---
id: HH-PKT-02
type: requirement
title: "Packet version, freshness and what changed since review"
status: active
priority: P0
area: field
links:
  decided_by: ["[[OWN-DEC-121]]", "[[OWN-DEC-119]]", "[[OWN-DEC-196]]"]
  depends_on: ["[[HH-DATA-08]]"]
  uses: ["[[ENT-JobPacket]]", "[[ENT-Acknowledgment]]"]
  tested_by: ["[[T43]]", "[[T44]]"]
  part_of: ["[[S07]]"]
source: "guide 15.1 HH-PKT-02"
---
- Every packet shows its version, generated and last-updated times, the source of each uncertain fact, and "What changed since you reviewed this?" against the version the worker last viewed.
- A critical change to scope, hazards, holds, SOP version or assignment creates a new packet version and invalidates the affected workers' acknowledgments and readiness until they review it again.
- Schedule changes and reassignments refresh the packet for affected workers ([[HH-SCH-07]]).

**Changed by [[OWN-DEC-196]] (2026-10-21):** any new or materially changed hazard, SOP, authorization restriction, site-access requirement or scope is critical; workers acknowledge before continuing.
