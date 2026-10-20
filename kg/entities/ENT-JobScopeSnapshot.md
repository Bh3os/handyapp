---
id: ENT-JobScopeSnapshot
type: entity
title: "Job scope snapshot"
status: active
area: field
links:
  decided_by: ["[[OWN-DEC-105]]"]
source: "vault 05 JobScopeSnapshot; guide 22.1 EstimateRevision"
---
An immutable copy of the approved scope and price on the job.

**Fields:** version; source (approval or change order); lines, options, exclusions, totals in cents; terms version; content hash.

**Invariants:** version 1 comes from the approval; each approved change order adds a version; earlier versions are never edited.

**Who may change:** nobody; created only by approval transactions.
