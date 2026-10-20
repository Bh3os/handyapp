---
id: HH-ID-12
type: requirement
title: Saved properties, preferences, Request This Service Again and authorized history
status: active
priority: P1
area: identity
links:
  decided_by: ["[[OWN-DEC-113]]", "[[OWN-DEC-71]]", "[[OWN-DEC-70]]"]
  depends_on: ["[[HH-ID-10]]", "[[HH-PRIV-03]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-CustomerAccount]]", "[[ENT-Property]]", "[[ENT-ConsentPreference]]", "[[FACT-RETENTION-SCHEDULE]]"]
  tested_by: ["[[T20]]"]
  part_of: ["[[C11]]"]
source: "guide 8.3 HH-ID-12; OWN-DEC-113, OWN-DEC-71"
---
- Account customers can name and save properties, set communication preferences (including changing or stopping repeat-service reminders), reuse request inputs, and view their authorized history.
- **"Request This Service Again"** reuses authorized property details while asking the customer to confirm they are still current. Mutable site and access details are confirmed for every new job. New pricing and appointments need staff review.
- Account closure is separate from record retention: closing login access never silently deletes financial, approval or incident evidence that the retention schedule requires, and an unpaid balance never automatically prevents closing login access. Deletion requests follow [[HH-PRIV-03]].
