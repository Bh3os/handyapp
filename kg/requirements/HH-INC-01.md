---
id: HH-INC-01
type: requirement
title: "Incident record: factual, minimal, with hold and reviewer"
status: active
priority: P0
area: safety
links:
  decided_by: ["[[OWN-DEC-124]]", "[[OWN-DEC-80]]"]
  constrained_by: ["[[RULE-HUMAN-REVIEW]]", "[[RULE-SAFETY-GATES]]"]
  uses: ["[[ENT-Case]]", "[[ENT-Hold]]", "[[ENT-Photo]]"]
  tested_by: ["[[T54]]", "[[T48]]"]
  part_of: ["[[S10]]", "[[C08]]"]
source: "guide 18.2 HH-INC-01; 23 (Incident); OWN-DEC-124"
---
- Workers can report an incident quickly from the job screen. Incident types: injury, near miss, property damage, exposure concern, customer conflict, equipment failure, other.
- The record ([[ENT-Case]], kind incident) holds the factual report, affected people and work areas, timestamps, evidence, immediate actions, the current hold, the responsible reviewer and follow-up tasks. Medical and personal detail is kept to what is necessary.
- A safety issue triggers the stop-work path with the critical hold in the same transaction ([[HH-WORK-09]]). An ordinary complaint never automatically stops unrelated work.
- States: `reported → triaged → action_pending → resolution_review → closed`. Closing needs a recorded resolution; work hold resolution is evaluated separately ([[HH-INC-03]]).
