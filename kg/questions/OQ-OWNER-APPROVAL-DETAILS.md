---
id: OQ-OWNER-APPROVAL-DETAILS
type: question
title: The Owner-approval details no decision gives
status: open
area: estimates
links:
  related: ["[[OWN-DEC-173]]", "[[HH-EST-16]]", "[[FACT-OWNER-APPROVAL-THRESHOLD]]", "[[FACT-MARGIN-TARGET]]", "[[OQ-READINGS-2026-10-21]]", "[[TSK-0130]]", "[[TSK-0082]]"]
source: "TSK-0130 (2026-10-22): OWN-DEC-173 and the final owner amendments of 2026-10-22 state the rules; the details below are PROPOSED"
---
**Question:** does the owner approve, or change, these PROPOSED details of the Owner approval before publishing?

- **Who answers:** the owner.
- **Decided, in use:** over the threshold (greater than 250000 cents; exactly $2,500.00 needs none) an estimate is published only with the Owner's approval of that exact version, decided in Owner Decisions with a comment, time and version; a later change of price or scope invalidates it; the Owner's own authenticated publication counts, writing the approval record and its audit event in the same transaction; splitting is checked across the project's history without counting superseded or replaced versions twice; discretionary discounts outside the approved 10%, discretionary credits, refunds and any adjustment over the threshold need the Owner; documented clerical or calculation corrections do not, and never take a document out of the threshold; the threshold is Owner configuration, versioned and audited.
- **PROPOSED, in use on private staging:**
  - "Material discretionary credit": every discretionary credit (`owner_approval.discretionary_credit`, from 1 cent, configurable).
  - The estimate value compared is the total after the decided discount; the highest total the customer could approve (base plus every option) is compared as well.
  - Splitting counts the other estimates of the same project by their latest version that reached the customer (the accepted total once accepted), expired ones included, withdrawn and declined ones not. Estimates of the same customer or property in another project are not counted.
  - A flagged document (negative margin from the known costs, a discretionary discount or credit, a refund, an undocumented correction) waits for the same approval before publishing, whatever its total.
  - Margin and gross profit are shown only when every base line has its labor and material cost; otherwise the known costs are shown as incomplete.
  - The threshold NOT CONFIGURED: every publication needs the Owner (fail closed).
  - Who may ask for an approval: the roles that may publish (the Owner's publishing policy); the Owner publishes instead of asking.
  - Approving or rejecting needs a written comment.
- **Waiting for later tasks:** change orders ([[TSK-0082]]) call the same evaluation and gate with their own facts (a credit as a positive magnitude with a negative effect; the revised total authorized project value never negative).
- **Until answered:** the PROPOSED details above are used; each is a configuration or small code change.
