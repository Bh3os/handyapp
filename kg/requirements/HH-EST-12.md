---
id: HH-EST-12
type: requirement
title: "Approval receipt with PDF and the correct next step"
status: active
priority: P0
area: approval
links:
  decided_by: ["[[OWN-DEC-105]]", "[[OWN-DEC-104]]", "[[OWN-DEC-126]]"]
  depends_on: ["[[HH-EST-08]]", "[[HH-COM-04]]"]
  uses: ["[[ENT-Approval]]", "[[ENT-Document]]", "[[ENT-Message]]", "[[FACT-AUTOMATIC-MESSAGES]]", "[[INT-Resend]]"]
  tested_by: ["[[T33]]", "[[T23]]"]
  part_of: ["[[C05]]", "[[C06]]"]
source: "OWN-DEC-105 (new behaviour; no guide id)"
---
- After approval the approval receipt sends automatically ([[FACT-AUTOMATIC-MESSAGES]]) with a PDF of the approved estimate and the terms version accepted. For an uploaded estimate it attaches the published PDF plus a terms PDF, or one combined PDF. Both documents stay available through verified project access in Documents.
- One receipt per approval: retries never send it twice; a delivery failure becomes a staff action item and never undoes the approval.
- The next step shown to the customer:
  - deposit required and not yet satisfied: "Estimate approved—pay your deposit to proceed with scheduling."
  - no deposit required, deposit satisfied, or owner waiver recorded: "Estimate approved—choose your work appointment."
- Then staff offer work windows ([[HH-SCH-11]]).
- On staging the PDFs carry "TEST — not a real invoice or estimate".
