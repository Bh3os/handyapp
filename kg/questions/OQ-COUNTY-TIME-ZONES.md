---
id: OQ-COUNTY-TIME-ZONES
type: question
title: "The time zone of each service-area county (geo.county_time_zones)"
status: open
area: platform
links:
  related: ["[[OWN-DEC-159]]", "[[FACT-SERVICE-AREA]]", "[[FACT-TIMEZONE]]", "[[OWN-DEC-179]]", "[[TSK-0123]]", "[[TSK-0127]]"]
source: "TSK-0123 (2026-10-22): no authoritative county-to-zone list in the repository"
---
**Question:** which IANA zone does each of the 11 service-area counties ([[FACT-SERVICE-AREA]]) use, from an authoritative source (for example the US time-zone boundaries of 49 CFR Part 71)?

- **Why it matters:** [[OWN-DEC-159]] takes the appointment zone from the property's verified location. With a county list, a property whose ZIP code lies wholly in counties of one zone gets that zone automatically ("derived"); without it every property's zone is unknown until Office or the Owner verify it on the property record from the county of the verified address.
- **Until answered:** the configuration `geo.county_time_zones` is NOT CONFIGURED (migration 0066). No county's zone is written by Claude; every new property's zone is unknown and flagged in the staff queue (`property_time_zone`), and no visit is planned on it until staff verify it. The owner's county list of [[OWN-DEC-179]] names the counties but not their zones.
- **Who answers:** the owner, or an authoritative source the owner names. Once supplied, the list is recorded as a version of `geo.county_time_zones` (staff app, Business settings); each zone must be an Eastern or Central IANA zone.
