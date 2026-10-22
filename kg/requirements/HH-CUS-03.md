---
id: HH-CUS-03
type: requirement
title: ZIP coverage checker with four outcomes that never blocks a request
status: active
priority: P0
area: site
links:
  decided_by: ["[[OWN-DEC-88]]", "[[OWN-DEC-37]]", "[[OWN-DEC-100]]", "[[OWN-DEC-73]]", "[[OWN-DEC-179]]"]
  depends_on: ["[[HH-INT-16]]", "[[HH-LEAD-02]]"]
  constrained_by: ["[[RULE-NO-INVENTED-FACTS]]", "[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-CoverageRule]]", "[[ENT-Request]]", "[[FACT-SERVICE-AREA]]"]
  tested_by: ["[[T07]]"]
  part_of: ["[[C01]]", "[[C02]]"]
source: "guide 5.1 HH-CUS-03; OWN-DEC-88, OWN-DEC-37, OWN-DEC-100"
---
The checker uses the same configured coverage rules ([[FACT-SERVICE-AREA]]) as staff qualification and scheduling. It never invents coverage. It returns one of four outcomes, each with this exact message:

| Outcome | Message |
| --- | --- |
| served | "We serve your area. Tell us about your project." |
| near the boundary | "You may be within our service area. Send your request and we'll confirm the address." |
| outside the usual area | "Outside our usual coverage? You can still request an estimate—we'll check whether we can help." |
| unknown | "We couldn't confirm this ZIP. You can still submit your request for review." |

- A "Continue with Request" button is available for every outcome, including outside the usual area.
- The ZIP is carried into the request form ([[HH-INT-16]]) and the coverage outcome is saved with the request for staff review. Correcting the ZIP rechecks coverage without clearing other answers.
- An invalid ZIP format shows a correction message and no outcome.
- If the lookup fails, the page explains the problem and still allows submission for manual review; the request stores the outcome `unknown`.
- Coverage is area eligibility only. It never confirms an appointment, date availability, price or travel charge. A ZIP that spans the boundary needs exact-address review before any appointment is confirmed.
- Staff, not the checker, decide whether an outside-area request can be accepted ([[HH-LEAD-08]]).
- The checker works behind the staging access gate: the site's call to the coverage API sends the credentials the gate needs. An end-to-end test runs the check with the gate enabled.

**Changed by [[OWN-DEC-179]] (2026-10-21):** outcomes come from the owner's ZIP dataset and the verified address county: SERVED, EDGE, OUTSIDE, UNKNOWN (mapped to the four messages above).
