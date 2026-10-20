---
id: OWN-DEC-109
type: decision
title: Worker completion sequence through owner quality review and handoff
status: active
area: quality
links:
  related: ["[[OWN-DEC-64]]", "[[OWN-DEC-68]]", "[[OWN-DEC-69]]", "[[OWN-DEC-75]]", "[[OWN-DEC-81]]", "[[OQ-CARE-NOTES-APPROVAL]]", "[[HH-QA-01]]", "[[HH-QA-02]]", "[[HH-QA-03]]", "[[HH-QA-04]]", "[[HH-QA-05]]", "[[HH-QA-09]]", "[[HH-WORK-06]]", "[[HH-PRIV-02]]"]
  uses: ["[[FACT-REMINDER-CADENCES]]", "[[ENT-Photo]]"]
source: "owner-answers-verbatim 2026-10-12T19:01:14.144Z [9 Complete]; decision-briefs 2026-10-12T19:02:18"
---
Owner, 2026-10-12, journey Step 9, completion.

Question asked:
> Step 9 - Completion: the worker takes 'after' photos, completes the checklist, and asks the customer to do a walkthrough on the phone ('Everything looks good' or 'I have a concern' with a note). Then staff review quality before the job is marked complete. Care notes (AI-drafted, approved by you) appear in Documents. A satisfaction check is drafted for +2 days (staff release). A concern opens a follow-up item instead of closing the job. OK?

Owner wording:
> Yes. Implement this complete worker sequence:
>
> 1. **Arrived:** Record the worker’s arrival timestamp.
> 2. **Safety checks:** Review site conditions, hazards, PPE, tools, and materials. Unresolved critical holds block work.
> 3. **Before photos:** Capture and upload the work areas and existing damage before starting. Label photos by area/task. Only the previously defined owner-approved upload-failure exception may allow locally captured photos to remain pending.
> 4. **Start Work:** After required checks and before-photo requirements pass, unlock the job-specific operational checklist.
> 5. **Perform the work:** Show ordered SOP steps for preparation, setup, service tasks, quality checks, and cleanup. Save each completed step and its required evidence.
> 6. **After photos:** Capture and upload the same areas after completion. Pair before/after photos where possible.
> 7. **Walkthrough:** Record “Everything looks good,” “Accepted with follow-up items,” “I have a concern,” or “Customer unavailable.” Capture comments and the customer/authorized representative’s identity. Absence or silence is not acceptance.
> 8. **Finished:** Record the worker’s finish timestamp and submit the job as “Awaiting quality review”—not automatically complete.
> 9. **Owner quality review:** Review scope, checklist, before/after evidence, and walkthrough. Problems become assigned punch items with due dates; unresolved items keep the job open until corrected and rechecked.
> 10. **Customer handoff:** Share selected before/after photos and approved, job-specific care notes in the project workspace. Prepare the satisfaction-check draft two days after reviewed completion; staff release it. Suppress it while a concern remains unresolved.
>
> Preserve original photos and checklist history. Customer sharing does not authorize marketing publication.
>
> Implement, test, and publish this workflow on private staging.

Effect:
- The worker sequence is fixed in the ten steps above; offline it is enforced too ([[OWN-DEC-121]]).
- Arrived and Finished record per-worker timestamps ([[OWN-DEC-69]]). Before photos are required; only the owner-approved upload-failure exception of [[OWN-DEC-68]] lets locally captured photos stay pending.
- Walkthrough outcomes: "Everything looks good", "Accepted with follow-up items", "I have a concern", "Customer unavailable" ([[OWN-DEC-75]]), with comments and the identity of the customer or authorized representative. Absence or silence is never acceptance.
- Finished sends the job to "Awaiting quality review", never to complete. The owner reviews every job ([[OWN-DEC-64]]); problems become assigned punch items with due dates, and unresolved items keep the job open until corrected and rechecked.
- Handoff shares selected before/after photos and approved, job-specific care notes ([[OWN-DEC-81]], [[OQ-CARE-NOTES-APPROVAL]]) in the workspace. The satisfaction-check draft is prepared two days after the reviewed completion ([[FACT-REMINDER-CADENCES]]), staff release it, and it is suppressed while a concern is unresolved.
- Original photos and checklist history are append-only. Sharing photos with the customer never grants marketing permission.

Links: uses [[FACT-REMINDER-CADENCES]], [[ENT-Photo]].
