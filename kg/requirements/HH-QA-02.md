---
id: HH-QA-02
type: requirement
title: "Owner reviews every job; punch-item rules decide invoice and closeout"
status: active
priority: P0
area: quality
links:
  decided_by: ["[[OWN-DEC-64]]", "[[OWN-DEC-109]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]"]
  uses: ["[[ENT-QAInspection]]", "[[ENT-PunchItem]]", "[[ENT-Job]]", "[[ENT-Invoice]]", "[[ROLE-OWNER]]"]
  tested_by: ["[[T55]]", "[[T56]]"]
  part_of: ["[[C09]]", "[[S01]]"]
source: "guide 19.1 HH-QA-02; 23 (QA); OWN-DEC-64 (supersedes the earlier no-review answer)"
---
- A worker's "Finished" moves the job to `ready_for_qa` ("Awaiting quality review"). It is never final customer acceptance and never closes finance.
- The Owner reviews every job before it counts as complete: scope, checklist, before/after evidence and walkthrough. A job the Owner performed is reviewed by the Owner and marked "self-review".
- QA states: `pending → in_review → passed / punch_required`; `punch_required → pending_recheck → passed`.
- Every problem found becomes a punch item ([[HH-QA-04]]) with an assigned owner, a due date and the required correction evidence.
- Minor finish or cleanup issues: the job stays open and the customer sees "Follow-up work". The Owner may issue an invoice if the approved payment terms allow it; invoicing never implies the unfinished work was accepted.
- Major defects, incomplete agreed scope, failed functional checks or safety concerns: the final invoice is blocked and the affected tasks return for correction. Safety concerns also block the affected work until properly resolved.
- Agreed deposit or progress invoices stay separate and follow their approved terms.
- The job cannot close until every punch item is corrected and passes re-check.
- Reviewer, results, evidence and timestamps are recorded.
