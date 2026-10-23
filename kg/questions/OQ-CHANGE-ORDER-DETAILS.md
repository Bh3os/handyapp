---
id: OQ-CHANGE-ORDER-DETAILS
type: question
title: The change-order drafting details no decision gives
status: open
area: approval
links:
  related: ["[[HH-CHG-01]]", "[[HH-CHG-02]]", "[[HH-WORK-07]]", "[[ENT-ChangeOrder]]", "[[OWN-DEC-108]]", "[[OWN-DEC-145]]", "[[OWN-DEC-168]]", "[[OWN-DEC-169]]", "[[OWN-DEC-203]]", "[[TSK-0081]]", "[[TSK-0082]]"]
source: "TSK-0081 (2026-10-23): HH-CHG-01, OWN-DEC-169 and OWN-DEC-203 state the rules; the details below are PROPOSED"
---
**Question:** does the owner approve, or change, these PROPOSED details of drafting change orders?

- **Who answers:** the owner.
- **Decided, in use:** an assigned worker drafts a change order with scope, prices in cents, reason and evidence; a draft binds nothing; an Estimator or the Owner reviews it; price lines are integer cents above $0.00, rounded once half-up, with no tax line and no minimum; a credit is its own line kind with a positive magnitude that lowers the total and never makes a negative charge; the accepted estimate and every scope snapshot stay unchanged ([[HH-CHG-01]], [[HH-CHG-02]], [[OWN-DEC-145]], [[OWN-DEC-169]], [[OWN-DEC-203]]).
- **PROPOSED, in use on private staging:**
  - Numbering: the project reference and -C<n>, per project, never reused.
  - Origin: a worker's draft is always a worker proposal; an Estimator or the Owner chooses customer request, estimator, emergency follow-up or worker proposal.
  - Who edits: the worker edits and withdraws only their own proposal while it is a draft; an Estimator or the Owner edits any draft, marks it reviewed, reopens it and withdraws it. Office reads change orders but does not draft them (the role matrix gives Office no change_order.draft).
  - When: from the job's creation until the work is operationally complete (pending preparation, ready, in progress, paused, awaiting quality review, reopened).
  - "Reviewed" needs every line priced, at least one line and the totals holding against the current approved total; a draft saved against an older approved scope is saved again before review.
  - Remaining charge for a credit: the revised total stays above $0.00 and never below the money the customer has paid on the job (payments not returned or voided, pending checks included); a larger reduction is refused at review and goes to the Owner's refund or credit path ([[OWN-DEC-203]]).
  - The change-order lines are not discounted: the approved discount stays as approved, and the revised total is the approved total plus the charges minus the credits. Deposit adjustments: none at drafting; the deposit stays as approved.
  - Waiting steps: the drafter names the checklist steps that depend on the change; while the change is a draft, reviewed or issued, those steps cannot start, resume, complete or reopen (they may be paused or skipped with a reason); every other approved step continues ([[HH-WORK-07]]). A withdrawn change releases them.
- **Waiting for [[TSK-0082]]:** publishing (Owner approval above $2,500.00), the customer's approval, the 7-day expiry, superseding versions, the new scope snapshot and packet version.
- **Until answered:** the PROPOSED details above are used; each is a small change to the nodes or the code.
