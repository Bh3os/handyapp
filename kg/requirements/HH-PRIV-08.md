---
id: HH-PRIV-08
type: requirement
title: "Erasing a request that never became a job leaves only reference, dates and status"
status: active
priority: P1
area: privacy
links:
  decided_by: ["[[OWN-DEC-176]]", "[[OWN-DEC-177]]"]
  depends_on: ["[[HH-PRIV-05]]"]
  constrained_by: ["[[RULE-HUMAN-REVIEW]]"]
  uses: ["[[FACT-RETENTION-SCHEDULE]]", "[[ENT-Request]]", "[[ENT-ConsentPreference]]", "[[ENT-Photo]]", "[[ENT-Message]]", "[[ENT-RetentionReview]]"]
  tested_by: ["[[T72]]"]
  part_of: ["[[C11]]"]
  related: ["[[OQ-REQUEST-ERASURE-DETAILS]]"]
source: "OWN-DEC-176 (new behaviour; no guide id)"
---
- After the retention eligibility check and the Owner's confirmation, a request that never became a job loses every personal field: name, contact values, address, descriptions and answers, photos and their files, notes, conversations, personal metadata, temporary files and access tokens.
- It keeps only the non-identifying reference, creation and closure dates, final status and non-identifying retention metadata.
- Identifiable consent evidence that must remain moves to a restricted compliance record with its own deadline.
- Removal covers the database, file storage, search indexes and caches; linked access is revoked; background jobs and stale indexes cannot bring data back; the retention log never repeats the deleted data; anonymous statistics stay separate and cannot rebuild the profile.
- Records belonging to other projects are never touched.
