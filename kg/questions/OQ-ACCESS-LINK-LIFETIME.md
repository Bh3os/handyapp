---
id: OQ-ACCESS-LINK-LIFETIME
type: question
title: How long a customer's secure project-access link works
status: open
area: identity
links:
  related: ["[[HH-ID-06]]", "[[HH-ID-04]]", "[[OWN-DEC-141]]", "[[FACT-SESSION-TIMINGS]]", "[[ENT-ProjectAccessGrant]]", "[[TSK-0034]]"]
source: "TSK-0034 (2026-10-21): HH-ID-06 names 24 hours as a configurable engineering default; OWN-DEC-141 accepted 24 hours for staff links only"
---
**Question:** how long should the single-project access link sent at submission keep working before the customer has to ask for a new one?

- **Who answers:** the owner.
- **Known:** [[HH-ID-06]] gives "a project access invitation expires after 24 hours (configurable engineering default)"; [[OWN-DEC-141]] accepted 24 hours for staff invite and reset links, and 30 minutes idle / 8 hours for customer sessions. A session started from the link follows the customer session timings, whatever the link's lifetime.
- **Until answered (TSK-0034):** the configuration key `access.grants` holds `linkHours: 24`, marked PROPOSED (`proposed = true`, migration 0033). An expired link opens nothing (the same neutral page as an unknown link); the safe way to ask for a new one is [[TSK-0035]] ([[HH-ID-09]]).
