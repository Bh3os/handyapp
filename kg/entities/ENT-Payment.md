---
id: ENT-Payment
type: entity
title: "Payment (tender)"
status: active
area: payments
links:
  decided_by: ["[[OWN-DEC-111]]", "[[OWN-DEC-67]]"]
  constrained_by: ["[[RULE-MONEY-CENTS]]"]
source: "guide 22.1 Payment/Tender; 23 (Check tender)"
---
Money received and recorded by staff.

**Fields:** method (Square link card, Square Tap to Pay, cash, check, Zelle, Cash App, Chime); amount in cents; currency; date; collector; transaction reference (Square payment ID, check number); payer; status; adjustments.

**States:** cash and digital: `recorded → reconciled`; check: `received → deposited → cleared`, `received / deposited → returned / voided`; adjustments (reversal, void, returned) appended.

**Invariants:** recorded only after verification; never from a redirect or claim; method plus reference unique; never edited or deleted; the collector cannot clear or reconcile their own collection (PROPOSED).

**Who may change:** Owner and Office record; workers with the collect capability record their own on-site collections; reversals Owner-only.
