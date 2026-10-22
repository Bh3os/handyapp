---
id: HH-PKT-07
type: requirement
title: "Packet export and printing exclude access secrets"
status: active
priority: P0
area: field
links:
  decided_by: ["[[OWN-DEC-121]]", "[[OWN-DEC-196]]"]
  depends_on: ["[[HH-CRM-03]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-JobPacket]]", "[[ENT-AccessInstructionSecret]]", "[[ENT-AuditEvent]]"]
  tested_by: ["[[T28]]", "[[T49]]"]
  part_of: ["[[S07]]"]
source: "guide 15.2 HH-PKT-07"
---
- Packet downloads and exports exclude access codes and other secret access credentials, always; they stay private to the assigned team.
- The offline packet follows [[HH-OFF-01]] and [[HH-OFF-02]].
- A printable packet carries its version and a freshness warning ("Printed <time>; check the app for changes"), and every export is audited with who, when and which version.

**Changed by [[OWN-DEC-196]] (2026-10-21):** prints show packet revision, generation time, job reference and that printed copies may be outdated.
