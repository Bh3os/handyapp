---
id: FACT-CHANGE-ORDER-VALIDITY
type: fact
title: "A published change order is valid for 7 days"
status: active
area: approval
links:
  decided_by: ["[[OWN-DEC-168]]"]
  uses: ["[[FACT-TIMEZONE]]"]
source: "OWN-DEC-168; owner answers 2026-10-21 R5-Q3"
---
**Value:** 7 calendar days from publication to the customer, stored as an exact expiry timestamp computed under the business time-zone policy ([[FACT-TIMEZONE]]) and shown in the customer's local zone.

- The Owner may set a shorter period for a time-sensitive change order, with a documented reason and a clearly disclosed expiry; nothing extends it automatically.
- Estimates keep their own 14-day validity ([[FACT-ESTIMATE-VALIDITY]]).
