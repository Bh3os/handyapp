---
id: OWN-DEC-105
type: decision
title: After approval: one job, automatic approval receipt, work windows
status: active
area: approval
links:
  related: ["[[OWN-DEC-103]]", "[[OWN-DEC-104]]", "[[OWN-DEC-119]]", "[[HH-EST-08]]", "[[HH-EST-10]]", "[[HH-SCH-04]]", "[[HH-SCH-05]]", "[[HH-SCH-06]]", "[[HH-BASE-06]]"]
  uses: ["[[FACT-AUTOMATIC-MESSAGES]]", "[[ENT-Job]]", "[[ENT-Visit]]"]
source: "owner-answers-verbatim 2026-10-12T18:53:23.426Z [5.4 After]; decision-briefs 2026-10-12T18:53:59"
---
Owner, 2026-10-12, journey Step 5.4, after approval.

Question asked:
> Step 5.4 - After approval: the approved estimate becomes a job (one job per project, with lines kept exactly as approved). The customer sees 'Approved - next: schedule your work' and, once the deposit is settled, 2–3 proposed work windows to pick from (same rules as the estimate visit: recheck on select, confirm only after reserving). An approval receipt (with a PDF copy of the approved estimate and terms) sends automatically. OK?

Owner wording:
> Yes, with these refinements:
>
> - Create one job for the approved project, preserving the exact estimate/document revision, selected options, scope, exclusions, total, and terms. Retries must not create duplicate jobs.
> - Send the approval receipt automatically, including a PDF of the approved estimate and terms. Also keep these available through verified project access.
> - Show the correct next step:
>   - **Deposit required:** “Estimate approved—pay your deposit to proceed with scheduling.”
>   - **No deposit required, satisfied, or owner-waived:** “Estimate approved—choose your work appointment.”
> - Staff propose 2–3 feasible windows based on assigned workers, job duration, travel, and required resources. Let customers request other times.
> - Recheck capacity when a window is selected. Confirm only after successfully reserving all required workers/resources; otherwise offer alternatives.
> - Show the confirmed date, arrival window, property address, and preparation instructions, then send an automatic confirmation.
> - One job may have multiple visits. Later scope or price changes require an approved change order; never overwrite the original approval.
>
> Implement, test, and publish on private staging using test notifications.

Effect:
- Approval creates exactly one job for the project, keeping the exact estimate/document revision, selected options, scope, exclusions, total and terms; retries never duplicate it.
- The approval receipt sends automatically with a PDF of the approved estimate and terms (for an uploaded estimate, the published PDF plus a terms PDF or one combined PDF), and both stay available through verified project access ([[FACT-AUTOMATIC-MESSAGES]]). It goes by text and email when the customer gave both (owner answer 2026-10-05T17:41, "yes text and mail").
- Next-step text: deposit required and not yet satisfied: "Estimate approved—pay your deposit to proceed with scheduling." No deposit, satisfied or owner-waived: "Estimate approved—choose your work appointment."
- Staff propose 2–3 feasible windows from assigned workers, job duration, travel and required resources; the customer can request other times.
- Selecting a window rechecks capacity; confirmation only after all required workers and resources are reserved, otherwise alternatives (one reservation mechanism, [[OWN-DEC-119]]).
- The confirmed date, arrival window, property address and preparation instructions show in the project and an automatic confirmation is sent.
- One job may have several visits. Later scope or price changes need an approved change order ([[OWN-DEC-108]]); the original approval is never overwritten.

Links: uses [[FACT-AUTOMATIC-MESSAGES]], [[ENT-Job]], [[ENT-Visit]].
