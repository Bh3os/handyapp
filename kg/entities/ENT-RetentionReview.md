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

**Fields:** record reference; category; period end; holds found (complaints, warranties, disputes, claims, investigations, unfiled tax returns, legal or insurance holds); decision (delete, archive, extend); actor; time; reason.

**Invariants:** nothing is deleted automatically; a hold blocks deletion of the record and related evidence; the log keeps no deleted personal content.

**Who may change:** the Owner.
