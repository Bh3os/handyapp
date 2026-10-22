---
id: OWN-DEC-204
type: decision
title: "Owner financial approval final: effective contract value plus proposed changes, splitting detected across the project history, substance over document type, audited reasons"
status: active
area: estimates
links:
  constrained_by: ["[[RULE-SERVER-AUTHZ]]", "[[RULE-MONEY-CENTS]]"]
  uses: ["[[FACT-OWNER-APPROVAL-THRESHOLD]]", "[[FACT-PRICING-DISCOUNTS]]", "[[ENT-EstimateVersion]]", "[[ENT-ChangeOrder]]", "[[ENT-AuditEvent]]"]
  related: ["[[OWN-DEC-173]]", "[[OWN-DEC-165]]", "[[OWN-DEC-169]]", "[[OWN-DEC-203]]", "[[OWN-DEC-76]]", "[[OWN-DEC-118]]", "[[OQ-READINGS-2026-10-21]]", "[[HH-EST-16]]", "[[TSK-0130]]", "[[TSK-0082]]", "[[TSK-0096]]"]
source: "owner answers 2026-10-22 R14 item 5; R13-Q1 corrections 5 and 6"
---
Final confirmation, with amendment, of reading 5 of [[OQ-READINGS-2026-10-21]] (approval threshold, [[OWN-DEC-173]]).

Owner answer (round 13, question 1), corrections 5 and 6, verbatim:
> 5. Prevent financial approval bypass through splitting related project documents. Evaluate linked estimates and change orders across their relevant history, rather than limiting detection solely to one estimate-validity period.
> 6. Distinguish legitimate documented price corrections and credits from discretionary discounts, while preserving the Owner's previously approved financial authorization thresholds.

Owner answer (round 14, 2026-10-22), verbatim:
> Confirm all 13 readings, subject to the following final amendments.
> Item 5 — Owner financial approval and splitting detection
> Preserve the $2,500 approval threshold and the existing Owner-only refund and deposit-waiver permissions.
> When determining whether approval is required:
>
> 1. Evaluate the current effective contract value plus proposed changes.
> 2. Do not double-count superseded estimates, replaced revisions, or previous adjustment amounts.
> 3. Detect attempts to split one project into related smaller estimates, work orders, or change orders across the project's history.
> 4. Evaluate the substance of financial adjustments, not merely their document type.
> 5. Require Owner approval for discretionary discounts outside the approved 10% policy, material discretionary credits, refunds, and adjustments meeting the established financial thresholds.
> 6. Permit authorized staff to make genuine documented clerical or calculation corrections that do not bypass financial approvals or alter accepted contractual obligations without required customer approval.
> 7. Maintain an auditable reason for every credit, correction, discount, and approval.
>
> An Owner-created and Owner-published estimate may count as Owner-approved, provided the publication is authenticated and creates appropriate approval evidence.
> Use decimal-safe currency calculations and test boundary values, including exactly $2,500 and $2,500.01.

Effect:
- The threshold stays $2,500.00 with the "greater than" comparison of [[FACT-OWNER-APPROVAL-THRESHOLD]]; refunds and deposit waivers stay Owner-only at every amount ([[OWN-DEC-76]], [[OWN-DEC-118]]).
- Approval is evaluated on the project's current effective contract value (accepted estimate plus approved change orders) plus the proposed change. Superseded estimates, replaced revisions and earlier adjustment amounts are never counted twice.
- Splitting is detected across the project's whole history of related estimates, work orders and change orders, not only within one estimate-validity period. Replaces the PROPOSED test "documents of the same project inside one validity period" of [[HH-EST-16]].
- Adjustments are judged by substance, not document type: a credit dressed as a correction, or a discount entered as a line change, is treated as what it is.
- Owner approval is required for: a discretionary discount other than the approved 10% policy ([[OWN-DEC-165]], [[FACT-PRICING-DISCOUNTS]]); a material discretionary credit; a refund; an adjustment that meets the thresholds. "Material" has no owner-decided amount. PROPOSED (configurable, not decided): every discretionary credit needs Owner approval until the Owner sets an amount; the setting is an audited configuration version.
- Authorized staff may make genuine, documented clerical or calculation corrections, provided they bypass no approval and change no accepted contractual obligation without the customer approval it requires ([[OWN-DEC-169]] item 14).
- Every credit, correction, discount and approval carries an auditable reason.
- An estimate the Owner creates and publishes counts as Owner-approved only when the publication is authenticated (the Owner's MFA session, [[OWN-DEC-202]]) and records approval evidence (approver, time, document version). Confirms the PROPOSED reading of [[OWN-DEC-173]] with this condition.
- Money is integer cents ([[RULE-MONEY-CENTS]]), which is the decimal-safe calculation the owner asks for. Boundary tests: exactly $2,500.00 (250000 cents) needs no approval; $2,500.01 (250001 cents) needs it.
- Built by [[TSK-0130]]; change orders with [[TSK-0082]]; the approval queue on the Owner Dashboard with [[TSK-0096]].
