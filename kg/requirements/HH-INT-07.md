---
id: HH-INT-07
type: requirement
title: Per-photo upload states; a failed photo never loses text or other photos
status: active
priority: P0
area: intake
links:
  decided_by: ["[[OWN-DEC-91]]", "[[OWN-DEC-94]]"]
  depends_on: ["[[HH-INT-06]]", "[[HH-INT-12]]"]
  constrained_by: ["[[RULE-NO-INVENTED-FACTS]]"]
  uses: ["[[ENT-Photo]]"]
  tested_by: ["[[T13]]"]
  part_of: ["[[C02]]", "[[C03]]"]
source: "guide 7.2 HH-INT-07; OWN-DEC-91, OWN-DEC-94"
---
- Each photo shows a preview with **Remove** and **Retry** controls and its own state: uploading, processing, complete or failed.
- A failed upload keeps all text, answers and successful photos, also when the customer navigates back.
- The request can be sent with failed photos excluded; the form shows a clear notice that they were not included.
- The receipt shows received, processing and failed photos separately, and failed photos can be retried from the receipt without sending a new request ([[HH-INT-12]]). A photo failure never loses the request.
