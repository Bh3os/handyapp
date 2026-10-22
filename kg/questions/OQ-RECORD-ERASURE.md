---
id: OQ-RECORD-ERASURE
type: question
title: What a deleted request that never became a job keeps, and its erasure
status: superseded
area: privacy
links:
  related: ["[[OWN-DEC-70]]", "[[OWN-DEC-71]]", "[[HH-PRIV-05]]", "[[HH-PRIV-03]]", "[[HH-DATA-09]]", "[[FACT-RETENTION-SCHEDULE]]", "[[TSK-0100]]"]
  superseded_by: ["[[OWN-DEC-176]]"]
source: "TSK-0100 (apps/server/src/modules/privacy/targets.ts requestTarget)"
---
**Answered by [[OWN-DEC-176]] (2026-10-21).**

**Question:** when the Owner deletes a request that never became a job ([[OWN-DEC-70]], 2 years after closure), what remains? Its rows are linked to append-only history (decisions, response events, notes, consent records, message deliveries, the review entry) and to the project, customer, contact and property records that other records may still need.

- **Who answers:** the owner (what may remain); the attorney for whether a reference-only remainder is acceptable ([[RULE-HUMAN-REVIEW]]).
- **Built (TSK-0100):** erasure of estimates never accepted (versions, lines, internal costs and notes, documents, the customer's responses and selections, and their stored files) and the login-account deletion of [[OWN-DEC-71]]. The database lets only the transaction that writes the deletion log entry remove those rows (migration 0058).
- **Until answered:** the Delete action on a request is refused ("the software does not delete this kind of record yet") and offers Archive or Keep longer; a deletion request lists the customer's requests as retained for that reason.
- **PROPOSED (not decided):** the request's description, answers, photos (and their stored files), notes and conversations are removed; the request keeps its reference, dates and states; the project keeps its reference; the customer's name, contact values and address are erased when no kept record needs them; consent records stay as evidence of permission.
