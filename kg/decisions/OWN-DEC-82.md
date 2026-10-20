---
id: OWN-DEC-82
type: decision
title: No license, certification or training-tracking module at launch; a job-level Hold / Ready control instead
status: active
area: field
links:
  related: ["[[HH-EST-05]]", "[[HH-WORK-02]]", "[[HH-SCH-03]]", "[[HH-SCH-04]]", "[[HH-SCH-06]]"]
  uses: ["[[ENT-Hold]]", "[[ENT-Job]]"]
  tested_by: ["[[T40]]"]
  constrained_by: ["[[RULE-HUMAN-REVIEW]]", "[[RULE-SAFETY-GATES]]"]
  part_of: ["[[S05]]", "[[S07]]"]
source: "vault-own-decisions.md OWN-DEC-82; owner-answers-verbatim.md 2026-10-12T16:49"
---
Owner wording (project chat, 2026-10-12, answering whether any service needs a worker license, certification or permit): "Remove the dedicated license, certification, and training-tracking module from the launch scope. Do not build credential uploads, expiry reminders, or qualification dashboards. The owner will check applicable requirements outside the software. Keep a simple job-level "Hold / Ready" control with a note for unresolved requirements. Required legal or safety conditions still need resolution before affected work starts."

Effect:
- No credential uploads, expiry reminders or qualification dashboards are built.
- The owner checks licensing, certification and permit requirements outside the software; licensing stays a human-review boundary.
- Each job has a simple "Hold / Ready" control with a note for unresolved requirements. A job on Requirements Hold cannot be confirmed for scheduling or started until it is cleared with a note.
- Required legal or safety conditions still need resolution before the affected work starts; safety holds are unchanged.

Open:
- Which services need a license, certification or permit in each municipality: [[OQ-PERMITS-LICENSING]].
