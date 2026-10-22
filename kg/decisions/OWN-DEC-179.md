---
id: OWN-DEC-179
type: decision
title: "Service-area ZIP dataset and the SERVED / EDGE / OUTSIDE / UNKNOWN coverage outcomes"
status: active
area: site
links:
  uses: ["[[FACT-SERVICE-AREA]]", "[[ENT-CoverageRule]]"]
  related: ["[[OWN-DEC-37]]", "[[OWN-DEC-88]]", "[[OWN-DEC-167]]", "[[HH-CUS-03]]", "[[OWN-DEC-206]]"]
source: "owner answers 2026-10-21 R8-Q2"
---
Owner answer (round 8, question 2): the owner-supplied ZIP dataset, with authorization to implement it without further owner approval. The dataset is business data supplied by the owner and is kept here in full.

> # ADDENDUM — HANDYHUB ZIP CODE DATASET
>
> This ZIP-code dataset is part of my previous implementation instructions.
>
> **Do not request a CSV file, additional ZIP lists, or Owner approval.** Use the data below to implement, verify, test, and deploy the service-area checker to private staging.
>
> ## 1. Approved Service Counties
>
> **Kentucky:** Jefferson, Oldham, Bullitt, Shelby, Meade.
>
> **Indiana:** Clark, Floyd, Harrison, Scott, Washington, Jefferson.
>
> These 11 counties are the official HandyHub standard service area.
>
> ## 2. ZIP Codes Associated With One Service County
>
> ### Jefferson County, KY
> **Standard:** 40041, 40118, 40202, 40203, 40204, 40205, 40206, 40207, 40208, 40209, 40210, 40211, 40212, 40213, 40214, 40215, 40216, 40217, 40218, 40219, 40220, 40222, 40223, 40228, 40242, 40243, 40258, 40272, 40291, 40293, 40299
> **PO Box:** 40018, 40025, 40027, 40201, 40221, 40224, 40231, 40232, 40233, 40250, 40251, 40252, 40253, 40255, 40256, 40257, 40259, 40261, 40268, 40269, 40270, 40285, 40290, 40295, 40298
> **Unique:** 40225, 40266, 40280, 40281, 40282, 40283, 40287, 40289, 40292, 40294, 40296, 40297
>
> ### Oldham County, KY
> **Standard:** 40010, 40014, 40026, 40031, 40055, 40056, 40077
> **Unique:** 40032
>
> ### Bullitt County, KY
> **Standard:** 40013, 40047, 40109, 40150, 40165, 40177
> **PO Box:** 40110, 40129
> **Unique:** 40166
>
> ### Shelby County, KY
> **Standard:** 40003, 40019, 40022, 40046, 40057, 40065, 40067, 40076, 40601
> **PO Box:** 40066
>
> ### Meade County, KY
> **Standard:** 40104, 40108, 40117, 40121, 40142, 40146, 40155, 40157, 40161, 40175, 40176
>
> ### Clark County, IN
> **Standard:** 47104, 47111, 47129, 47130, 47141, 47143, 47162, 47163
> **PO Box:** 47131, 47190
> **Unique:** 47132, 47133, 47134, 47144, 47199
>
> ### Floyd County, IN
> **Standard:** 47150
> **PO Box:** 47146, 47151
>
> ### Harrison County, IN
> **Standard:** 47110, 47112, 47114, 47135, 47142, 47160, 47161, 47166
> **PO Box:** 47107
>
> ### Scott County, IN
> **Standard:** 47102
>
> ### Washington County, IN
> **Standard:** 47108, 47120, 47125, 47145, 47167, 47281
>
> ### Jefferson County, IN
> **Standard:** 47043, 47224, 47227, 47231, 47243, 47250
>
> ## 3. ZIP Codes Associated With Multiple Service Counties
> Retain every listed county association for these ZIP codes.
>
> ### Kentucky
> | ZIP | Associated counties |
> |---|---|
> | 40023 | Jefferson + Shelby |
> | 40245 | Jefferson + Shelby |
> | 40059 | Jefferson + Oldham |
> | 40241 | Jefferson + Oldham |
> | 40068 | Oldham + Shelby |
> | 40071 | Bullitt + Shelby |
> | 40229 | Jefferson + Bullitt |
>
> ### Indiana
> | ZIP | Associated counties |
> |---|---|
> | 47106 | Clark + Floyd + Washington |
> | 47165 | Clark + Floyd + Washington |
> | 47115 | Harrison + Washington |
> | 47164 | Harrison + Washington |
> | 47117 | Floyd + Harrison |
> | 47122 | Floyd + Harrison |
> | 47124 | Floyd + Harrison |
> | 47136 | Floyd + Harrison |
> | 47119 | Clark + Floyd |
> | 47172 | Clark + Floyd |
> | 47126 | Clark + Scott + Washington |
> | 47138 | Scott + Jefferson |
> | 47230 | Scott + Jefferson |
> | 47147 | Clark + Scott + Jefferson |
> | 47170 | Scott + Washington |
> | 47177 | Clark + Scott |
>
> ## 4. Mandatory Implementation Rules
> 1. **Import and verify the full candidate dataset** rather than assuming every listed ZIP is automatically valid for physical service addresses.
> 2. The existing review specification identifies 169 unique candidate ZIP codes. Recalculate and validate the unique count during import; report discrepancies rather than silently filling missing entries.
> 3. The 11 approved counties—not the ZIP codes alone—define HandyHub's official geographic coverage.
> 4. Use reliable current geographic and address-validation sources to determine the actual county of each service property.
> 5. Automatically classify a verified property within an approved county as `SERVED`, without further Owner approval for standard coverage.
> 6. Classify a verified property outside all approved counties as `OUTSIDE`. Owner approval is only required if staff requests an exception to serve that property.
> 7. Use `EDGE` or `UNKNOWN` when reliable geographic verification cannot establish coverage.
> 8. Recognize PO Box and Unique ZIP categories. Require a physical service address; don't treat a mailing ZIP as proof of property coverage.
> 9. Support all four customer-facing outcomes: `SERVED`, `EDGE`, `OUTSIDE`, and `UNKNOWN`.
> 10. Allow customers to submit requests even when coverage is uncertain. Do not promise that submitting a request guarantees service.
> 11. Integrate the results into the existing public website, estimate-request form, customer project record, staff dashboard, and visit-confirmation process.
> 12. Keep the first-visit address verification and site-contact requirements, but do not add manual Owner approval for already verified addresses within the standard 11-county service area.
> 13. Validate, correct, or supplement the candidate list from authoritative sources where needed. Do not reject a genuinely covered physical address simply because its ZIP was missing from this initial list.
> 14. Preserve audit history and geographic dataset versions.
> 15. Run automated and end-to-end tests, fix failures, and deploy the functional checker to the existing private staging environment.
> 16. Do not enable production services or expose real customer data without the existing production-release authorization.
>
> ## Final Authorization
> I authorize Claude Code to implement and activate the verified standard service-area ZIP checker in private staging without additional Owner approval.
> Do not create an unnecessary approval queue for individual ZIP codes.
> Do not leave the checker in a permanently unconfigured or always-unknown state.
> Automatically handle confidently verified standard service addresses and route only genuinely uncertain or exceptional cases for review.
> Complete the implementation, testing, and staging deployment using the requirements and ZIP data provided here.

Effect:
- The 11 approved counties define coverage ([[FACT-SERVICE-AREA]]): Kentucky Jefferson, Oldham, Bullitt, Shelby, Meade; Indiana Clark, Floyd, Harrison, Scott, Washington, Jefferson, as whole counties ([[OWN-DEC-37]]).
- The ZIP list is the candidate dataset. Count rechecked from the answer on 2026-10-21: 169 unique ZIP codes, no duplicates; 146 tied to one county (94 Standard, 33 PO Box, 19 Unique) and 23 tied to several service counties (7 in Kentucky, 16 in Indiana). It is imported as a versioned dataset with its categories and every county association, then verified against authoritative current geographic sources (for example the Census ZCTA-to-county relationship of [[OWN-DEC-37]]); discrepancies are reported, never filled silently; a genuinely covered physical address is never rejected only because its ZIP is missing from the list.
- Outcomes: SERVED for a verified property inside an approved county (automatic, no owner approval); OUTSIDE for a verified property outside all of them (owner approval only when staff ask for an exception); EDGE or UNKNOWN when verification cannot establish coverage. PROPOSED mapping to the customer messages of [[OWN-DEC-88]], which stay: SERVED = served, EDGE = near the boundary, OUTSIDE = outside the usual area, UNKNOWN = unknown.
- PO Box and Unique ZIPs are mailing ZIPs, never proof of coverage; a physical service address is required. PROPOSED: a ZIP-only check returns SERVED only for a ZIP whose area lies wholly in approved counties according to the verified source, EDGE when it also reaches other counties, UNKNOWN for PO Box and Unique ZIPs and for ZIPs that cannot be verified; the final result comes from the verified property address at confirmation ([[OWN-DEC-167]]).
- Requests can always be sent, even when coverage is uncertain, and sending one never promises service. The result is used on the public site, the request form, the project record, the staff dashboard and visit confirmation.
- No owner approval for verified addresses inside the 11 counties and no approval queue for individual ZIPs; the checker is never left NOT CONFIGURED or always unknown. On staging the dataset is active without a separate approval step (the owner's authorization replaces the rule-set approval of [[TSK-0022]] for this dataset); production follows the existing release authorization. Dataset versions and audit history are kept.
- Answers [[OQ-SERVICE-AREA-ZIPS]]. Built by [[TSK-0127]].

**Confirmed by [[OWN-DEC-206]] (2026-10-22), amended:** the four-outcome ZIP classification above is approved, but a ZIP-only result is preliminary screening: staff verify the complete property address and county before confirming service-area eligibility and the first applicable appointment; EDGE and UNKNOWN requests are never rejected for the ZIP alone; a ZIP match is never presented as address verification.
