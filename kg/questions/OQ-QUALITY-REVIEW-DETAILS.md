---
id: OQ-QUALITY-REVIEW-DETAILS
type: question
title: The quality review and punch-item details no decision gives
status: open
area: quality
links:
  related: ["[[HH-QA-02]]", "[[HH-QA-04]]", "[[HH-QA-09]]", "[[HH-FIN-05]]", "[[ENT-QAInspection]]", "[[ENT-PunchItem]]", "[[ENT-Job]]", "[[OWN-DEC-64]]", "[[OWN-DEC-109]]", "[[OWN-DEC-152]]", "[[ROLE-MATRIX]]", "[[RULE-SAFETY-GATES]]", "[[TSK-0084]]", "[[TSK-0083]]", "[[TSK-0092]]", "[[TSK-0094]]"]
source: "TSK-0084 (2026-10-23): OWN-DEC-64 and OWN-DEC-109 state the rules; the details below are PROPOSED or wait for later tasks"
---
**Question:** does the owner approve, or change, these PROPOSED details of the quality review and punch items?

- **Who answers:** the owner.
- **Decided, in use:** the Owner reviews every job before it counts as complete; a job the Owner worked on is marked "self-review"; every problem found becomes a punch item with an assigned person, a due date and the required correction evidence; finish or cleanup issues are minor, and the Owner may issue the final invoice while only they remain; defects, incomplete agreed scope, failed functional checks and safety concerns are major and block the final invoice; deposit invoices follow their own terms; the job cannot close until every punch item is corrected and passes re-check; reviewer, results and times are recorded ([[OWN-DEC-64]], [[OWN-DEC-109]]).
- **PROPOSED, in use on private staging:**
  - Areas and results: the Owner records "OK" or "Problem found" for each of the four areas (scope, checklist, before/after evidence, walkthrough) when deciding; a problem with no punch item is refused. No punch item and every area OK passes the review and the job becomes operationally complete ([[HH-QA-09]]); any punch item asks for punch work.
  - Moves the software makes: when the last open item is corrected the review waits for re-check; a failed re-check (with its reason) opens the item again and the review returns to punch work; a new item found while waiting for re-check does the same; the last passed re-check passes the review. A passed review is final: a later problem is a warranty case with return work ([[TSK-0094]]).
  - Who: the Owner starts, decides, records items and re-checks (`quality.review`, `quality.manage_punch_items`); an item is assigned to an active worker, who records the correction from the job while assigned to a live visit of it (`quality.correct_punch_item`, A). The person who corrected an item does not re-check it, except on a self-review.
  - Safety concerns: a safety-concern item names the job's open critical safety hold, written first by Stop Work / Report Hazard ([[TSK-0077]]); the hold blocks the affected work until it is released through its own path, and the item is re-checked only once the hold is resolved ([[RULE-SAFETY-GATES]]).
  - Final invoice with minor items: the Owner may issue; the only payment term configured is due on receipt, so the payment terms always allow it.
  - Queue: one Owner Decisions item per job while it awaits the review or the re-check; one action-queue item per job while any punch item is not re-checked, due at the end of the earliest due date in the business time zone and assigned to that item's worker (seen by the Owner).
  - Customer view: "Completion review" while awaiting the review, "Follow-up work" while punch items remain (never the item's words), "Work complete" once the review passed.
  - Correction evidence is the worker's written note; correction photos come with the return visit ([[TSK-0094]]).
- **Waiting for later tasks:** the worker's Finished that moves a job to "Awaiting quality review" and opens the review, the checklist and the walkthrough record ([[TSK-0083]], [[TSK-0075]]); the job-complete message (MESSAGE 16), which [[OWN-DEC-152]] sends only after the walkthrough and punch-list checks ([[TSK-0083]]); closing and reopening the job ([[TSK-0092]]); return visits and their linked punch work ([[TSK-0094]]).
- **Until answered:** the PROPOSED details above are used; each is a small change to the nodes or the code.

**Updated by [[TSK-0094]] (2026-10-25):** a later problem after a passed review is return work of a case, with its own return-visit punch items re-checked by the Owner; the passed review is never changed. Details in [[OQ-RETURN-WORK-DETAILS]].
