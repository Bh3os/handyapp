---
id: ENT-CareInstruction
type: entity
title: "Care instruction version"
status: active
area: quality
links:
  decided_by: ["[[OWN-DEC-81]]"]
source: "OWN-DEC-81"
---
After-job care guidance per service.

**Fields:** service; version; general lines; product-dependent placeholders filled only from stored manufacturer guidance; flags for review; status; approver and time.

**States:** `proposed → approved → superseded`.

**Invariants:** customers see only approved versions for their completed services; no invented times, temperatures or chemical claims; a missing product guidance line is omitted and flagged; the version used is recorded on the completion summary.

**Who may change:** drafts by staff; approval by the Owner only, with a fresh sign-in and a reason.
