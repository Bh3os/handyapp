---
id: OWN-DEC-173
type: decision
title: "Owner approval before publishing estimates and change orders over $2,500.00 (configurable)"
status: active
area: estimates
links:
  constrained_by: ["[[RULE-SERVER-AUTHZ]]", "[[RULE-MONEY-CENTS]]"]
  uses: ["[[FACT-OWNER-APPROVAL-THRESHOLD]]"]
  related: ["[[OWN-DEC-28]]", "[[OWN-DEC-118]]", "[[OWN-DEC-76]]", "[[HH-EST-16]]"]
source: "owner answers 2026-10-21 R6-Q4"
---
Owner answer (round 6, question 4), option chosen "Owner approves over $2,500":

> Implement the following financial authorization policy for HandyHub:
>
> 1. Authorized Office and Estimator staff may create and prepare estimates and change orders within their assigned role permissions.
> 2. Estimates with a final proposed total greater than $2,500 require explicit Owner approval before publication to the customer.
> 3. Change orders require Owner approval before publication when either:
>    - The absolute financial adjustment exceeds $2,500, or
>    - The revised total authorized project value exceeds $2,500.
> 4. Prevent employees from splitting estimates or change orders into smaller transactions to bypass approval thresholds.
> 5. Calculate approval thresholds using the final proposed customer price after eligible discounts and applicable adjustments. Also flag unusually large discounts, credits, or negative-margin estimates for owner review, regardless of total.
> 6. Owner approval is required before publishing, not merely before the customer accepts the estimate.
> 7. Maintain an approval queue in the Owner dashboard showing: Job or estimate reference; Proposed price; Estimated labor and material costs; Expected gross profit and margin when available; Discounts; Change-order adjustments; Reason for approval; Employee who prepared the document.
> 8. Record the Owner's approval or rejection, timestamp, comments, and document version.
> 9. If staff modify pricing or scope after Owner approval, invalidate that approval and require reapproval where applicable.
> 10. Refunds, deposit waivers, and other existing Owner-only financial actions must remain Owner-only, regardless of dollar value.
> 11. Never permit staff to bypass mandatory safety, legal, or qualification restrictions.
> 12. Make the $2,500 threshold configurable by the Owner for future growth, with appropriate audit logging.
> 13. Enforce all approval rules on the server, not just in the user interface.
> 14. Test threshold boundaries, cumulative change orders, discounts, credits, role restrictions, and approval invalidation in private staging before production activation.
>
> Keep existing Owner-only permissions intact.

Effect:
- Office and Estimator staff create and prepare estimates and change orders within their role permissions ([[ROLE-MATRIX]] unchanged).
- An estimate whose final proposed total is greater than $2,500.00 needs the Owner's explicit approval before it is published. A change order needs it when the absolute adjustment exceeds $2,500.00 or the revised total authorized project value exceeds $2,500.00. Value and comparison: [[FACT-OWNER-APPROVAL-THRESHOLD]].
- The threshold uses the final customer price after eligible discounts and adjustments; splitting an estimate or change order to stay under it is prevented. Unusually large discounts or credits and negative-margin estimates are flagged for owner review whatever the total; "unusually large" has no owner definition yet ([[OQ-READINGS-2026-10-21]]).
- The approval comes before publishing, not merely before the customer accepts. The Owner Dashboard has an approval queue showing the reference, proposed price, estimated labor and material costs, expected gross profit and margin when available ([[OWN-DEC-189]]), discounts, change-order adjustments, the reason for approval and the preparer. The Owner's approval or rejection, time, comments and document version are recorded; a later change to pricing or scope invalidates the approval.
- Refunds, deposit waivers and other owner-only financial actions stay owner-only at any amount. Nobody bypasses safety, legal or qualification restrictions. The Owner may change the threshold, audited. All rules are enforced on the server.
- Reading (PROPOSED): an estimate the Owner prepares and publishes is approved by that act.
- Partly replaces [[OWN-DEC-118]] (publishing without a per-estimate owner approval) and [[OWN-DEC-28]] (limits NOT CONFIGURED). Answers [[OQ-MONETARY-LIMITS]]. Built by [[TSK-0130]]; change orders with [[TSK-0082]].
