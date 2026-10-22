---
id: FACT-ESTIMATE-VALIDITY
type: fact
title: A published estimate is valid for 14 days
status: active
area: estimates
links:
  decided_by: ["[[OWN-DEC-34]]", "[[OWN-DEC-102]]", "[[OWN-DEC-118]]", "[[OWN-DEC-159]]"]
  related: ["[[OWN-DEC-103]]"]
source: "OWN-DEC-34, 102, 103, 118; owner-answers-verbatim 2026-10-05T18:08 [Expired]"
---
**Changed by [[OWN-DEC-159]] (2026-10-21):** the expiry is stored as an explicit timestamp computed in business time and shown in the customer's local zone. Change orders have their own 7-day validity ([[FACT-CHANGE-ORDER-VALIDITY]]).

**Value:** 14 days from the moment the estimate version is published (sent) to the customer.

- Shown to the customer as a valid-until date; validated before publishing ([[OWN-DEC-118]]).
- Days are counted in [[FACT-TIMEZONE]]. PROPOSED: the version stays valid until 11:59:59 PM business time on the 14th day after publishing.
- After expiry the server refuses approval and offers the current version or "Request an Updated Estimate" ([[OWN-DEC-103]]). Whether an expired estimate is re-issued at the old price is decided case by case (owner answer 2026-10-05T18:08, "Decide each time"); a re-issue is a new version.
