---
id: HH-EST-16
type: requirement
title: "Owner approval before publishing estimates and change orders above the threshold"
status: active
priority: P0
area: estimates
links:
  decided_by: ["[[OWN-DEC-173]]", "[[OWN-DEC-189]]", "[[OWN-DEC-204]]"]
  depends_on: ["[[HH-EST-04]]", "[[HH-CHG-02]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]", "[[RULE-MONEY-CENTS]]"]
  uses: ["[[FACT-OWNER-APPROVAL-THRESHOLD]]", "[[FACT-MARGIN-TARGET]]", "[[ENT-EstimateVersion]]", "[[ENT-ChangeOrder]]", "[[ENT-QueueItem]]", "[[ENT-AuditEvent]]", "[[ENT-PolicyVersion]]"]
  tested_by: ["[[T31]]", "[[T32]]", "[[T26]]"]
  part_of: ["[[S04]]", "[[S11]]"]
source: "OWN-DEC-173 (new behaviour; no guide id)"
---
- Publishing an estimate whose final proposed total exceeds [[FACT-OWNER-APPROVAL-THRESHOLD]], or a change order whose absolute adjustment or revised total authorized project value exceeds it, is refused on the server until the Owner approves that exact version.
- The Owner Dashboard approval queue shows the reference, proposed price, estimated labor and material costs, expected gross profit and margin when available, discounts, change-order adjustments, the reason approval is needed and the preparer. The Owner approves or rejects with comments; the decision, time and version are recorded.
- Any later change to pricing or scope invalidates the approval. Splitting work into several estimates or change orders to stay under the threshold is detected and routed to the Owner (PROPOSED test: documents for the same project published within the estimate validity whose combined total exceeds the threshold).
- Unusually large discounts or credits and negative-margin estimates are flagged for owner review at any total ([[OQ-READINGS-2026-10-21]]).
- The Owner may change the threshold; the change is an audited configuration version. Owner-only financial actions stay owner-only.

**Changed by [[OWN-DEC-204]] (2026-10-22):** the PROPOSED splitting test and the "unusually large" flag above are replaced: splitting is detected across the project's whole history of related estimates, work orders and change orders; the value checked is the current effective contract value plus the proposed change, without double counting superseded estimates, replaced revisions or earlier adjustments; adjustments are judged by substance, not document type; the Owner approves discretionary discounts outside the 10% policy, material discretionary credits (PROPOSED, configurable: every discretionary credit until an amount is set), refunds and threshold adjustments; authorized staff may make documented clerical or calculation corrections that bypass no approval; every credit, correction, discount and approval keeps an auditable reason. An Owner-published estimate counts as approved only with an authenticated publication that records approval evidence. Boundary tests at $2,500.00 and $2,500.01, integer cents.
