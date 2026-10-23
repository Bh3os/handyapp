---
id: OQ-CHANGE-ORDER-DETAILS
type: question
title: The change-order drafting details no decision gives
status: open
area: approval
links:
  related: ["[[HH-CHG-01]]", "[[HH-CHG-02]]", "[[HH-WORK-07]]", "[[ENT-ChangeOrder]]", "[[OWN-DEC-108]]", "[[OWN-DEC-145]]", "[[OWN-DEC-168]]", "[[OWN-DEC-169]]", "[[OWN-DEC-203]]", "[[TSK-0081]]", "[[TSK-0082]]", "[[FACT-CHANGE-ORDER-VALIDITY]]", "[[OWN-DEC-204]]"]
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
- **PROPOSED, publication (TSK-0082 part 1):**
  - Validity: 7 calendar days counted like the estimate validity: to 11:59:59 PM business time on the 7th day after the day it was sent ([[FACT-CHANGE-ORDER-VALIDITY]]). The Owner may set 1 to 6 days with a written reason; nobody sets more than 7.
  - Owner approval: over the threshold when the change itself (charges minus credits, either way) or the revised project value is over $2,500.00, or the project's other open (sent, unexpired) change orders together with it are over it; every credit line counts as a discretionary credit with the change order's reason, so every change order with a credit goes to the Owner while no materiality is configured ([[OWN-DEC-204]]).
  - A change order is sent only against the job's current approved scope; a version priced against an older one is revised first.
  - Revise: replaces a sent version with a new draft (the sent one is superseded and can no longer be approved); reissue: a new draft after a version expired, was withdrawn or was rejected. Both copy the content and lines and price them again.
  - The automatic proposed-change notice links to the project's Documents tab and carries no amount.
- **PROPOSED, the customer's decision (TSK-0082 part 2):**
  - Approval in the portal follows the estimate approval ([[HH-EST-06]], [[HH-EST-07]], [[HH-ID-07]]): a freshly verified session, the exact version by the digest of its content, the revised total, a box (unchecked by default) accepting the change under the estimate terms the job was accepted under, and the typed full name. No new terms version is shown; the job's accepted terms are copied to each new scope snapshot.
  - Declining is "Reject" with an optional reason (at most 2,000 characters), through the same matrix row as approving ("Approve a change order"; the matrix names no separate decline action) with the same fresh verification. A rejected change authorizes nothing; staff may revise it into a new version.
  - In person: the assigned worker sends a one-time code (the existing code message) to the customer contact's verified email, or verified phone with the SMS opt-in; the customer reads it out and types their name on the worker's phone. The project's customer contact (the request's) is the person identified. A staff-verified identity without a code is not offered yet (no decision says how staff verify an identity). In-person rejection is not offered; the customer declines in the portal.
  - Only one change order of a job is approved at a time: each is priced against the job's current approved scope, so after one is approved, the others issued against the earlier scope cannot be approved and are revised (shown to the customer as "waiting for an updated version").
  - An approved change adds the next scope snapshot: the earlier lines plus the change's lines (each naming the change order), its scope and hazards added to the scope texts, the subtotal and total moved by the charges and credits, the discount, deposit and terms unchanged. The packet gets one new version (a critical scope change), so assigned workers acknowledge again.
  - No customer or staff message is sent on approval or rejection yet: the 21 owner templates have none (staff see the decision on the job's change orders).
- **PROPOSED, the screens (TSK-0082 part 2):**
  - Portal Documents tab: a "Change orders" section after the estimates. It shows the original estimate's total, the current approved total, and each change order that was sent: reason, scope, schedule, lines (credits as negative amounts), the approved total before it, what it adds or credits, and the new total if approved. An open one offers Approve Change (box and typed name) and Decline Change (optional reason); a stale verification shows the code step in place.
  - Status wording for the customer: "Waiting for your decision", "Approved", "Declined", "Expired", "Withdrawn", "Replaced by a newer version". One priced before another change was approved says HandyHub is updating it.
  - The worker's change-order page: an "in person" panel (send the code by email or text, the customer's code, the box, the customer's typed name) and each version's recorded decision (who approved, when, how, and who recorded it).
- **Until answered:** the PROPOSED details above are used; each is a small change to the nodes or the code.
