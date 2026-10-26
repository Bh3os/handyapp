---
id: ENT-RetentionReview
type: entity
title: "Retention review entry"
status: active
area: privacy
links:
  decided_by: ["[[OWN-DEC-70]]"]
source: "OWN-DEC-70"
---
A record whose retention period ended, waiting in the Owner's deletion-review queue.

**Fields:** record reference; category; period end (whole years or, for technical logs and expired sessions and links, calendar days, [[TSK-0138]]); the rows the entry stands for when it is a batch (the expired sessions and links of one kind and month, PROPOSED in [[OQ-RETENTION-DEFAULTS-DETAILS]]); holds found (complaints, warranties, disputes, claims, investigations, unfiled tax returns, legal or insurance holds); decision (delete, archive, extend); actor; time; reason.

**Invariants:** nothing is deleted automatically; a hold blocks deletion of the record and related evidence; the log keeps no deleted personal content.

**Who may change:** the Owner.
