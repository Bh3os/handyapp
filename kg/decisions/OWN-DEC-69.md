---
id: OWN-DEC-69
type: decision
title: Arrival and finish timestamps per worker; no categorized time tracking or payroll
status: active
area: field
links:
  related: ["[[HH-WORK-06]]", "[[HH-FIN-16]]", "[[HH-FIN-17]]"]
  uses: ["[[ENT-Visit]]", "[[ENT-StaffUser]]"]
  constrained_by: ["[[RULE-HUMAN-REVIEW]]", "[[RULE-SAFETY-GATES]]"]
  part_of: ["[[S07]]"]
source: "vault-own-decisions.md OWN-DEC-69; two-websites-owner-resolutions.md R3; project chat 2026-10-12"
---
Owner wording (project chat, 2026-10-12): the owner chose "Not now" for categorized time tracking and wrote: "Keep time tracking simple. Record a separate timestamp for each assigned worker when they tap "Arrived" and "Finished." Calculate the elapsed visit duration and link it to the worker and job. Allow the owner to correct forgotten or incorrect timestamps, preserving the original values and recording the reason. Flag missing timestamps instead of inventing a duration. Export these records for the accountant. Do not calculate payroll, overtime, deductions, or paystubs. Arrival does not automatically start work or bypass the required Start Work checks."

Effect:
- Each assigned worker's tap on "Arrived" and "Finished" records a separate server timestamp; the elapsed visit duration is linked to the worker and the job.
- The owner may correct a forgotten or wrong timestamp; the original value and the reason are kept.
- A missing timestamp is flagged, never filled with an invented duration.
- The records export for the accountant.
- No categorized time tracking, payroll, overtime, deductions or paystubs; payroll stays outside the software.
- "Arrived" never starts work and never bypasses the Start Work checks.
