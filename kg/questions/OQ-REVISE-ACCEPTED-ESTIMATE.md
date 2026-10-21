---
id: OQ-REVISE-ACCEPTED-ESTIMATE
type: question
title: How an accepted estimate is changed - a new estimate version or a change order
status: open
area: estimates
links:
  related: ["[[HH-EST-04]]", "[[HH-PORT-05]]", "[[HH-CHG-02]]", "[[HH-EST-10]]", "[[OWN-DEC-118]]", "[[TSK-0055]]"]
source: "TSK-0055 (2026-10-21): HH-EST-04 and HH-PORT-05 read differently for an accepted estimate"
---
**Question:** once the customer has accepted an estimate, is a change to it a new version of the same estimate (published, then approved again) or always a change order? [[HH-EST-04]] says "any edit to a published or accepted version creates a new version that needs its own approval", while [[HH-PORT-05]] says accepted scope or price changes need a change order that staff publish and the customer approves ([[HH-CHG-02]]), and [[HH-EST-10]] keeps accepted work from being recalculated.

- **Who answers:** the owner.
- **Known:** an accepted version is never edited in place; either path keeps the original approval and needs a new customer approval of the exact version ([[OWN-DEC-118]], [[OWN-DEC-103]]). At most one approval of an estimate is effective ([[ENT-Estimate]]).
- **Until answered (PROPOSED):** Revise is refused for an estimate that has an accepted version (refusal ESTIMATE_ACCEPTED: "changes to accepted work go through a change order"); published, declined, expired, withdrawn and superseded versions can be revised. No estimate is accepted in the software before the approval task (TSK-0057), so nothing depends on the answer yet.
