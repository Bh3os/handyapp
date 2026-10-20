---
id: ENT-TimeStamp
type: entity
title: "Arrived and Finished timestamp"
status: active
area: field
links:
  decided_by: ["[[OWN-DEC-69]]"]
source: "guide 22.1 TimeEvent/Entry; OWN-DEC-69"
---
Per-worker visit timestamps.

**Fields:** worker; job; visit; type (arrived, finished); recorded time (device and server); original value and correction with reason and corrector.

**Invariants:** separate per worker; a missing value is flagged, never invented; corrections keep the original; no payroll calculation.

**Who may change:** the worker taps; the Owner corrects.
