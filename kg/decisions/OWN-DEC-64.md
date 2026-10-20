---
id: OWN-DEC-64
type: decision
title: Quality review of every job by the owner, with punch-item rules
status: active
area: quality
links:
  related: ["[[HH-QA-02]]", "[[HH-QA-04]]", "[[HH-QA-09]]", "[[HH-FIN-05]]", "[[ROLE-OWNER]]"]
  uses: ["[[ENT-Job]]", "[[ENT-Invoice]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]"]
  part_of: ["[[C09]]"]
source: "vault-own-decisions.md OWN-DEC-64; two-websites-owner-resolutions.md R7; project chat 2026-10-12"
---
Owner wording (project chat, 2026-10-12): the owner chose "Owner reviews every job" and, for jobs the owner performed, "I review it, marked 'self-review'". On failed reviews: "Every problem becomes a punch item with an assigned owner, due date, and required correction evidence. Minor finish or cleanup issues: the job stays open and the customer sees "Follow-up work." The owner may issue an invoice if the approved payment terms allow it. Invoicing must not imply that unfinished work was accepted. Major defects, incomplete agreed scope, failed functional checks, or safety concerns: block the final invoice and return affected tasks for correction. Safety concerns also block affected work until properly resolved. Previously agreed deposit or progress invoices remain separate and follow their approved terms. The job cannot close until all punch items are corrected and pass re-check. Record the reviewer, results, evidence, and timestamps."

Effect:
- After the worker's completion the job is "ready for QA" (shown as "Awaiting quality review") and the owner reviews every job before it counts as complete. A job the owner performed is reviewed by the owner and flagged "self-review".
- Every problem found becomes a punch item with an assigned owner, a due date and required correction evidence.
- Minor finish or cleanup issues: the job stays open and the customer sees "Follow-up work"; the owner may issue the invoice if the approved payment terms allow it, and the invoice never implies that unfinished work was accepted.
- Major defects, incomplete agreed scope, failed functional checks or safety concerns: the final invoice is blocked and the affected tasks return for correction. Safety concerns also block the affected work until properly resolved.
- Agreed deposit and progress invoices stay separate and follow their approved terms.
- The job cannot close until every punch item is corrected and passes re-check.
- Reviewer, results, evidence and timestamps are recorded.
- This replaces the owner's 2026-10-05 chat answer "Finishing a job don't need review".

Reaffirmed by [[OWN-DEC-109]] (completion sequence) and [[OWN-DEC-110]] (the invoice is issued only after the quality review).
