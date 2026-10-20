---
id: HH-WORK-02
type: requirement
title: "Hard holds cannot be cleared by a checkbox or any override"
status: active
priority: P0
area: safety
links:
  decided_by: ["[[OWN-DEC-82]]", "[[OWN-DEC-38]]", "[[OWN-DEC-80]]", "[[OWN-DEC-17]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]", "[[RULE-HUMAN-REVIEW]]"]
  uses: ["[[ENT-Hold]]", "[[ENT-AuditEvent]]"]
  tested_by: ["[[T45]]", "[[T40]]", "[[T54]]"]
  part_of: ["[[S07]]", "[[S01]]"]
source: "guide 16.1 HH-WORK-02; 23 (Hold); OWN-DEC-38, OWN-DEC-82"
---
- A checkbox, acknowledgment, customer signature, timer, AI output or generic Owner override can never clear an unverified hazardous condition, an unavailable critical control, or a legal or competence requirement.
- A critical safety hold is released only with recorded resolution evidence and the reviewer who assessed it (a qualified person where the hazard needs one); hold states `open → under_review → resolved / canceled_as_error` ([[ENT-Hold]]).
- Nobody releases a safety hold they raised. With one administrator, a hold the Owner raised stays open until a second administrator exists; the rule is never relaxed.
- The job-level Hold / Ready control carries a note naming the unresolved requirement. While it is on Hold the job cannot be confirmed or started. It is cleared only with a note recording how the requirement was resolved. PROPOSED: the Owner clears it, since the owner checks requirements outside the software. OPEN QUESTION: whether the self-release rule above also applies to this job-level Hold.
- Every hold change is audited.
