---
id: OWN-DEC-88
type: decision
title: ZIP coverage check with four outcomes, always allowing the request
status: active
area: site
links:
  related: ["[[OWN-DEC-37]]", "[[OWN-DEC-54]]", "[[OWN-DEC-73]]", "[[HH-CUS-03]]", "[[HH-LEAD-02]]", "[[OWN-DEC-179]]"]
  uses: ["[[FACT-SERVICE-AREA]]"]
source: "owner-answers-verbatim 2026-10-12T18:17:57.722Z [1.3 ZIP check]; decision-briefs 2026-10-12T18:18:58"
---
Partly replaced by [[OWN-DEC-179]] (2026-10-21): coverage comes from the owner's ZIP dataset and the 11 counties with the outcomes SERVED, EDGE, OUTSIDE and UNKNOWN.

Owner, 2026-10-12, journey Step 1.3, service-area check.

Question asked:
> Step 1.3 - Service-area check: customer types a ZIP and sees one of four answers (served / near the edge - we check the address / outside - you can still send the request / unknown - we confirm on review). Outside-area customers can still send a request. OK?

Owner wording:
> Yes, use all four coverage outcomes, but I tested the ZIP checker on staging and it isn’t working. Fix, test, and deploy the complete functionality now.
>
> Show these messages:
>
> - **Served:** “We serve your area. Tell us about your project.”
> - **Near the boundary:** “You may be within our service area. Send your request and we’ll confirm the address.”
> - **Outside the usual area:** “Outside our usual coverage? You can still request an estimate—we’ll check whether we can help.”
> - **Unknown:** “We couldn’t confirm this ZIP. You can still submit your request for review.”
>
> Keep “Continue with Request” available for every outcome, including outside-area customers. Preserve the ZIP in the form and save the coverage result with the request for staff review.
>
> Show a correction message for invalid ZIP formats. If the lookup fails, explain the issue and allow submission for manual review. Use the configured coverage rules; do not invent coverage.
>
> Coverage does not confirm an appointment, price, or travel charge. Staff review exceptions before booking.
>
> Verify all four outcomes, invalid input, lookup failure, ZIP preservation, and successful request submission. Preserve the existing design and staging password gate. Send me the review link and actual test results after deployment.

Effect:
- The ZIP check returns one of four outcomes and shows the exact messages above: served, near the boundary, outside the usual area, unknown.
- "Continue with Request" is shown for every outcome, outside-area included. The ZIP is carried into the form ([[OWN-DEC-92]]) and the coverage result is saved with the request for staff review.
- An invalid ZIP format shows a correction message. A lookup failure explains the problem, stores the unknown outcome and still allows the request to be submitted for manual review.
- Outcomes come only from the configured coverage rules ([[FACT-SERVICE-AREA]]); coverage is never invented, and it never confirms an appointment, price or travel charge. Staff, not the checker, decide outside-area requests ([[OWN-DEC-100]]).
- The check must work with the staging access gate enabled (the owner found it broken on staging; the brief suspected the gate refusing the coverage request). Tests cover all four outcomes, invalid input, lookup failure, ZIP preservation, a submission carrying the result, and an end-to-end run with the gate on.

Links: uses [[FACT-SERVICE-AREA]].
