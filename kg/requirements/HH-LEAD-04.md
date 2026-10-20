---
id: HH-LEAD-04
type: requirement
title: Potential hazards become review holds; closed requests keep their history
status: active
priority: P0
area: intake
links:
  decided_by: ["[[OWN-DEC-82]]", "[[OWN-DEC-100]]", "[[OWN-DEC-70]]", "[[OWN-DEC-74]]"]
  depends_on: ["[[HH-PRIV-01]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]", "[[RULE-HUMAN-REVIEW]]", "[[RULE-AI-WAVE2]]"]
  uses: ["[[ENT-Hold]]", "[[ENT-Request]]", "[[FACT-RETENTION-SCHEDULE]]"]
  tested_by: ["[[T40]]"]
  part_of: ["[[S02]]"]
source: "guide 12.2 HH-LEAD-04; OWN-DEC-82, OWN-DEC-100, OWN-DEC-70"
---
- A potential hazard or restricted scope found at intake becomes a review hold (or the job-level Hold / Ready control with a note), never a declaration that the site is safe, by AI or anyone else. The uncertainty stays visible to staff.
- Closing a lost, declined, not-a-fit or no-response request keeps its source, reason and history. It follows the retention schedule ([[FACT-RETENTION-SCHEDULE]]): it enters the owner deletion-review queue when its period ends and is never deleted automatically.
