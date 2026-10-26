---
id: HH-CUS-04
type: requirement
title: County content only for approved coverage with authentic local detail
status: active
priority: P0
area: site
links:
  decided_by: ["[[OWN-DEC-57]]", "[[OWN-DEC-37]]", "[[OWN-DEC-48]]"]
  depends_on: ["[[HH-CUS-03]]"]
  constrained_by: ["[[RULE-NO-INVENTED-FACTS]]"]
  uses: ["[[FACT-SERVICE-AREA]]", "[[ENT-CoverageRule]]"]
  tested_by: ["[[T08]]"]
  part_of: ["[[C01]]"]
source: "guide 5.1 HH-CUS-04; OWN-DEC-57, OWN-DEC-48, OWN-DEC-37"
---
- County content exists only for counties in the approved service area ([[FACT-SERVICE-AREA]]).
- A consolidated Areas page carries one section per county with an anchor: its towns, the kinds of work, the request action and the ZIP check.
- A dedicated county page is published only with authentic local content: 2–3 real, useful local lines. Unverified or thin county pages stay unpublished and are absent from navigation and the sitemap.
- A county URL without its own page answers 301 to its anchor on the Areas page, so earlier county URLs never break. The sitemap lists only pages that exist; the footer links to the page or the anchor.
- The site and its structured data name the counties and the state only, never a street, a city of residence or a ZIP code for the business.
- Publishing a page never expands operational coverage; coverage comes only from the coverage configuration.

**Limitation (owner input; reviewer: Owner):** No county has approved local content ([[OWN-DEC-57]]), so no county page is published and every county links to its section of the Areas page; the rule that would publish one is tested in the domain package only.
