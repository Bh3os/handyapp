---
id: HH-FIN-18
type: requirement
title: "Owner Dashboard from recorded data, with drill-down and matching CSV"
status: active
priority: P0
area: ops
links:
  decided_by: ["[[OWN-DEC-125]]", "[[OWN-DEC-115]]"]
  depends_on: ["[[HH-DATA-10]]"]
  constrained_by: ["[[RULE-MONEY-CENTS]]", "[[RULE-SERVER-AUTHZ]]", "[[RULE-DECIDED-VALUES-ACTIVE]]"]
  uses: ["[[ENT-Request]]", "[[ENT-Estimate]]", "[[ENT-Job]]", "[[ENT-Invoice]]", "[[ENT-Payment]]", "[[ENT-Case]]", "[[FACT-RESPONSE-TARGET]]", "[[FACT-HOURS]]", "[[FACT-TIMEZONE]]", "[[ROLE-OWNER]]"]
  tested_by: ["[[T73]]"]
  part_of: ["[[S11]]"]
  related: ["[[OQ-DASHBOARD-DETAILS]]"]
source: "OWN-DEC-125 (new behaviour; guide 11.1 Reports, HH-FIN-17)"
---
Owner-only, in the staff design system, ready to use with no configuration step. Sections:
- **Overview:** new requests, estimates awaiting approval, scheduled jobs, jobs awaiting quality review, overdue invoices, open cases, each linking to its action.
- **Customer response:** requests received, time to first meaningful staff response, and the share answered within [[FACT-RESPONSE-TARGET]], measured only during business hours ([[FACT-HOURS]], [[FACT-TIMEZONE]]).
- **Estimates:** sent, approved, declined, expired, awaiting response; revisions count under one estimate.
- **Job quality:** completed jobs, review pass rate, outstanding punch items, return visits.
- **Payments:** invoices issued; confirmed payments by method (including Square link and Tap to Pay); pending checks; refunds; credits; outstanding balances; overdue balances shown separately.
- **Cases:** open complaints, damage and injury reports, assigned staff, overdue follow-ups; sensitive details restricted.

Rules:
- Date filters, comparison with the previous period, and a last-updated time.
- Every figure opens its supporting records.
- Recorded data only: invoiced amounts are distinct from money received; deposits are never counted twice; missing data shows "unavailable", never zero. Integer cents throughout.
- CSV export of the filtered reports with clear column names and totals equal to the dashboard figures; CSV-injection safe.

**Built by [[TSK-0096]] (2026-10-26):** `/dashboard` for the Owner, from recorded data with no configuration step: the six sections and a Job costs section, a period of business-zone dates beside the previous period, the last-updated time, every figure opening the records it counts (so a list always matches its figure), and the CSV written from the same figures (totals equal; formula-safe; a recent sign-in; audited). Invoiced is apart from money received; the deposit is counted once, on the final invoice; unknown values show unavailable, incomplete or not configured. PROPOSED details: [[OQ-DASHBOARD-DETAILS]].
