---
id: ENT-Invoice
type: entity
title: "Invoice"
status: active
area: invoicing
links:
  decided_by: ["[[OWN-DEC-110]]", "[[OWN-DEC-126]]"]
  constrained_by: ["[[RULE-MONEY-CENTS]]"]
source: "guide 22.1 Invoice/InvoiceLine; 23 (Invoice)"
---
A billing document; contents per [[HH-FIN-04]].

**Fields (beyond contents):** kind (deposit, progress, final); Square payment link; delivery state; balance figures (derived); reminder state; overdue-owner-decision flag.

**States:** `draft → issued → partially_paid / paid`; controlled `voided`; credit and correction flow; overdue is a derived condition.

**Invariants:** issued invoices are immutable; issue needs the Owner's quality review; one per job unless an audited void-and-reissue; the deposit credits once; Paid only at $0.00 from confirmed payments and approved credits.

**Who may change:** Owner and Office issue (PROPOSED for Office); voids are Owner-only.
