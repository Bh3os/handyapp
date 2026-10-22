---
id: HH-PKT-09
type: requirement
title: "Escalation actions in every job packet"
status: active
priority: P0
area: safety
links:
  decided_by: ["[[OWN-DEC-172]]"]
  depends_on: ["[[HH-PKT-01]]", "[[HH-WORK-13]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]", "[[RULE-HUMAN-REVIEW]]"]
  uses: ["[[FACT-SVC-ESCALATION-PATH]]", "[[ENT-StaffUser]]", "[[ENT-JobPacket]]", "[[ENT-IssueReport]]"]
  tested_by: ["[[T48]]"]
  part_of: ["[[S07]]", "[[C08]]"]
source: "OWN-DEC-172 (new behaviour; no guide id)"
---
- Every job packet shows two prominent actions: "Call Owner — Report a Problem" and "Call 911 — Immediate Emergency". Call 911 is always present and works without a network.
- The Owner's number is read from the Owner's staff profile, where the Owner enters it; it is never stored in the repository. While it is empty the Call Owner action says NOT CONFIGURED and to call 911 in an emergency.
- The packet states the procedure of [[OWN-DEC-172]] in English and, in the Spanish staff portal, the owner's Spanish instruction exactly as given.
- Emergency guidance never suggests waiting for the Owner or the app; Owner decisions never override mandatory safety, legal or qualification protections.
- Incident reports, escalation actions, Owner decisions and authorizations are recorded.
