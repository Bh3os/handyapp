---
id: HH-WORK-02
type: requirement
title: "Hard holds cannot be cleared by a checkbox or any override"
status: active
priority: P0
area: safety
links:
  decided_by: ["[[OWN-DEC-82]]", "[[OWN-DEC-38]]", "[[OWN-DEC-80]]", "[[OWN-DEC-17]]", "[[OWN-DEC-137]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]", "[[RULE-HUMAN-REVIEW]]"]
  uses: ["[[ENT-Hold]]", "[[ENT-AuditEvent]]"]
  tested_by: ["[[T45]]", "[[T40]]", "[[T54]]"]
  part_of: ["[[S07]]", "[[S01]]"]
source: "guide 16.1 HH-WORK-02; 23 (Hold); OWN-DEC-38, OWN-DEC-82"
---
- A checkbox, acknowledgment, customer signature, timer, AI output or generic Owner override can never clear an unverified hazardous condition, an unavailable critical control, or a legal or competence requirement.
- A critical safety hold is released only with recorded resolution evidence and the reviewer who assessed it (a qualified person where the hazard needs one); hold states `open → under_review → resolved / canceled_as_error` ([[ENT-Hold]]).
- Nobody releases a critical safety hold (from a hazard report) they raised ([[OWN-DEC-38]]). With one administrator, a critical hold the Owner raised stays open until a second administrator exists; the rule is never relaxed.
- The job-level Hold / Ready control carries a note naming the unresolved requirement. While it is on Hold the job cannot be confirmed or started. The Owner sets Ready on any job-level Hold / Ready note, including one the Owner set, with a note recording how the requirement was resolved ([[OWN-DEC-137]]); the self-release rule above does not apply to it. Safety gates are unchanged ([[RULE-SAFETY-GATES]]).
- Every hold change is audited.
