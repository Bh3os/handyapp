---
id: HH-LEAD-02
type: requirement
title: Staff qualification and the four request actions
status: active
priority: P0
area: intake
links:
  decided_by: ["[[OWN-DEC-116]]", "[[OWN-DEC-99]]", "[[OWN-DEC-100]]", "[[OWN-DEC-82]]"]
  depends_on: ["[[HH-LEAD-01]]", "[[HH-CUS-03]]"]
  constrained_by: ["[[RULE-HUMAN-REVIEW]]", "[[RULE-SERVER-AUTHZ]]", "[[RULE-AI-WAVE2]]"]
  uses: ["[[ENT-Request]]", "[[ENT-CoverageRule]]", "[[ENT-Hold]]"]
  tested_by: ["[[T07]]", "[[T40]]", "[[T30]]"]
  part_of: ["[[S02]]", "[[C04]]"]
source: "guide 12.2 HH-LEAD-02, 23 (request states); OWN-DEC-116, OWN-DEC-99, OWN-DEC-100"
---
- Staff qualify each request by checking coverage, service fit, missing essential facts, urgency, the need for a site visit, staff and equipment eligibility, and risk flags. Classification is done by staff; AI classification stays off.
- The request screen offers four actions: **Ask a Question** ([[HH-LEAD-03]]), **Prepare Online Estimate**, **Arrange Estimate Visit** ([[HH-LEAD-07]]) and **Not a Fit** ([[HH-LEAD-08]]).
- Each outcome is recorded with its reason, as request states: `received → reviewing → needs_information / needs_site_visit / ready_for_estimate → estimated`, or terminal `declined / outside_scope / not_served / withdrawn`, plus `closed_no_response` ([[HH-LEAD-06]]).
- Internal notes stay separate from customer-visible messages.
- Unresolved requirements found during qualification use the job-level Hold / Ready control or a review hold ([[HH-LEAD-04]]).
