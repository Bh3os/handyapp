---
id: ENT-EstimateVersion
type: entity
title: "Estimate version"
status: active
area: estimates
links:
  decided_by: ["[[OWN-DEC-102]]", "[[OWN-DEC-118]]", "[[OWN-DEC-34]]", "[[OWN-DEC-83]]"]
  constrained_by: ["[[RULE-MONEY-CENTS]]"]
source: "guide 22.1 EstimateRevision; 23 (Estimate revision)"
---
One complete, numbered offer. Contents are listed in [[HH-EST-01]].

**Fields (beyond the content):** authoring method; uploaded original (private) and customer PDF with hash; agree-confirmation; pinned policy versions; created, revised and published by; published, first-viewed and valid-until times.

**States:** `draft → in_review → published → accepted / declined / expired / withdrawn / superseded`.

**Invariants:** published and accepted versions are immutable; edits create a new version; only the current, unexpired published version can be approved; amounts are integer cents.

**Who may change:** Estimator and Owner (publishing per the publishing policy); the verified customer accepts or declines.
