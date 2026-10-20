---
id: OWN-DEC-125
type: decision
title: Owner Dashboard from recorded data with matching CSV exports
status: active
area: ops
links:
  related: ["[[OWN-DEC-116]]", "[[OWN-DEC-122]]", "[[HH-DATA-10]]", "[[HH-FIN-16]]"]
  uses: ["[[FACT-RESPONSE-TARGET]]", "[[FACT-TIMEZONE]]"]
  constrained_by: ["[[RULE-MONEY-CENTS]]"]
source: "owner-answers-verbatim 2026-10-12T19:44:11.908Z [S11 Reports]; decision-briefs 2026-10-12T19:46:08"
---
Owner, 2026-10-12, staff journey S11, owner reports.

Question asked:
> Staff S11 - Reports for the Owner: a simple dashboard with requests received and response times (within the 1-hour target), estimates sent/approved/declined, jobs completed, quality-review results, invoices issued, payments received by method, outstanding balances, and open cases. Export to CSV. Numbers come only from recorded data (no projections). OK?

Owner wording:
> Yes. Build a clear, professional **Owner Dashboard** with:
>
> - **Overview:** new requests, estimates awaiting approval, scheduled jobs, jobs awaiting quality review, overdue invoices, and open cases—with links to take action.
> - **Customer response:** requests received, time to first meaningful staff response, and percentage answered within the one-hour target, measured during business hours.
> - **Estimates:** sent, approved, declined, expired, and awaiting response. Count revisions under the same estimate to avoid inflated totals.
> - **Job quality:** completed jobs, review pass rates, outstanding punch items, and return visits.
> - **Payments:** invoices issued, confirmed payments by method—including Square links and Tap to Pay—pending checks, refunds, credits, and outstanding balances. Show overdue balances separately.
> - **Cases:** open complaints, damage/injury reports, assigned staff, and overdue follow-ups, with sensitive details restricted.
>
> Include date filters, useful comparisons with the previous period, and a last-updated time. Every figure should open its supporting records.
>
> Use recorded data only. Clearly distinguish invoiced amounts from money received; deposits must not be counted twice. Missing data should appear as unavailable, not as zero.
>
> Provide CSV exports of the filtered reports with clear column names and totals that match the dashboard.
>
> Implement, verify the calculations, and publish on private staging. Keep it ready to use without another configuration or activation step.

Effect:
- Sections: Overview, Customer response, Estimates, Job quality, Payments and Cases, with the figures listed above; each figure opens its supporting records.
- Response time is the time to the first meaningful staff response ([[OWN-DEC-116]]) and the share answered within the 1-hour target, counted only in business hours ([[FACT-RESPONSE-TARGET]], [[FACT-TIMEZONE]]).
- Estimate revisions count under the same estimate; deposits are never counted twice; invoiced amounts are distinct from money received; payments by method include Square link and Tap to Pay.
- Date filters, comparison with the previous period and a last-updated time. Recorded data only; missing data shows as "unavailable", never zero.
- CSV exports of the filtered reports with clear column names and totals equal to the dashboard; cells are protected against spreadsheet formula injection.
- Owner-only per the role matrix, in integer cents, ready to use with no configuration step ([[OWN-DEC-122]]). Sensitive case details stay restricted.

Links: uses [[FACT-RESPONSE-TARGET]], [[FACT-TIMEZONE]]; constrained by [[RULE-MONEY-CENTS]].
