---
id: HH-EST-04
type: requirement
title: "Estimate lifecycle, publishing permission and version history"
status: active
priority: P0
area: estimates
links:
  decided_by: ["[[OWN-DEC-118]]", "[[OWN-DEC-102]]", "[[OWN-DEC-95]]", "[[OWN-DEC-39]]", "[[OWN-DEC-173]]", "[[OWN-DEC-169]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-Estimate]]", "[[ENT-EstimateVersion]]", "[[ENT-AuditEvent]]", "[[FACT-AUTOMATIC-MESSAGES]]", "[[ROLE-MATRIX]]"]
  tested_by: ["[[T32]]", "[[T26]]"]
  part_of: ["[[S04]]", "[[C05]]"]
source: "guide 13.1 HH-EST-04; 23 (Estimate revision); OWN-DEC-102, OWN-DEC-118"
---
Version states: `draft → in_review → published → accepted / declined / expired / withdrawn / superseded` ([[ENT-EstimateVersion]]).

- Estimators and the Owner write or upload estimates and publish them directly; no Owner approval per estimate. Which roles may publish is a policy setting the Owner changes (default Estimator and Owner); a refusal follows a removed permission immediately. Other roles are refused on the server.
- Before publishing, the server validates scope, prices, total, options, exclusions, terms version, validity date and the applicable deposit; an uploaded document must be confirmed to match its structured amounts ([[HH-EST-11]]). Failures name each missing item.
- Publishing locks that version's customer terms. Any edit to a published or accepted version creates a new version that needs its own approval; nothing is ever silently edited. Publishing a new version marks the previous published version `superseded`.
- Estimators may save drafts, request review, publish, revise, expire, withdraw or record a customer's decline, within their permission. The Owner can view all estimates and revise any through a new version.
- Each version records who created, revised and published it, shown in the version history and written to the audit log.
- Publishing sends the automatic "Your HandyHub estimate is ready" notice ([[FACT-AUTOMATIC-MESSAGES]]) with no amounts in the email or text, only a secure link.
- The first time the customer opens the estimate is recorded with date and time only.
- An old link to a superseded, expired or withdrawn version shows that state and the route to the current version, or "Request an Updated Estimate" when none is available.
- An unanswered estimate gets staff-released reminder drafts ([[HH-EST-14]]).

**Changed by [[OWN-DEC-173]], [[OWN-DEC-169]] (2026-10-21):** publishing an estimate over $2,500.00 needs the Owner's approval first ([[HH-EST-16]]); an accepted estimate is never revised, only changed by change order.
