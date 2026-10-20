---
id: ENT-Project
type: entity
title: "Project"
status: active
area: portal
links:
  decided_by: ["[[OWN-DEC-97]]", "[[OWN-DEC-105]]", "[[OWN-DEC-106]]"]
source: "guide 22.1 Project"
---
The container that links one customer and property to requests, estimates, the job, visits, messages, documents, photos, invoices and cases.

**Fields:** reference; customer; property; services; responsible staff member; public progress state; payment term (default "Payment due on receipt" for new projects, or the agreed term).

**Invariants:** created automatically when a request is saved (not a job or appointment); at most one job per approved project; the customer view and the payment summary are separate projections of the same records.

**Who may change:** staff per role; the customer only through workspace actions.
