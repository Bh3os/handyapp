---
id: ENT-Request
type: entity
title: "Request (lead)"
status: active
area: intake
links:
  decided_by: ["[[OWN-DEC-90]]", "[[OWN-DEC-93]]", "[[OWN-DEC-100]]", "[[OWN-DEC-101]]", "[[OWN-DEC-116]]"]
source: "guide 22.1 Request/Lead; 23 (Request)"
---
The customer's original submission and its working record.

**Fields:** reference (HH-XXXX); original inputs (services, answers with units, description, full address, property type, timing preferences, need-help-today, estimate preference, preferred channel, separate marketing permission); photos and upload states; coverage result; privacy-notice version; source; idempotency key; contact verification states; responsible staff member; first-response clock; follow-up items.

**States:** `received → reviewing → needs_information / needs_site_visit / ready_for_estimate → estimated`; terminal `declined / outside_scope / not_served / withdrawn`; "Closed—no response" reopenable within [[FACT-REOPEN-PERIOD]].

**Invariants:** the original submission is never edited; one request per idempotency key; Not a Fit needs a reason category; closing never auto-cancels accepted, scheduled or paid work.

**Who may change:** Office, Estimator and Owner.

**Built by [[TSK-0148]] (2026-10-26):** a "Closed—no response" request may also be reopened by authorized staff (`reopen_by_staff`, with a written reason, within or after [[FACT-REOPEN-PERIOD]]); it returns to review and nothing else is restored.
