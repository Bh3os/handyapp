---
id: HH-INT-06
type: requirement
title: Request photo limits and server-side file validation
status: active
priority: P0
area: intake
links:
  decided_by: ["[[OWN-DEC-62]]", "[[OWN-DEC-91]]", "[[OWN-DEC-70]]", "[[OWN-DEC-146]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-Photo]]", "[[INT-R2]]", "[[FACT-RETENTION-SCHEDULE]]", "[[FACT-UPLOAD-LIMITS]]"]
  tested_by: ["[[T14]]"]
  part_of: ["[[C02]]"]
source: "guide 7.2 HH-INT-06; OWN-DEC-62, OWN-DEC-91"
---
- Up to **10 photos in total per request**, **JPEG, PNG or WebP**, **up to 15 MB each**, implemented as 15 MiB so no file the owner allows is refused ([[FACT-UPLOAD-LIMITS]], [[OWN-DEC-146]]). **No PDFs** or other document types from customers.
- The server validates the real content signature, the declared type, the size and the count; client checks are only a convenience. Oversized, disallowed or mismatched files are rejected with a clear explanation of the supported formats.
- New files are quarantined until scanning and processing finish, and cannot be fetched as approved evidence before then.
- Unnecessary location metadata is stripped from shared derivatives; the original is kept as evidence under the retention schedule ([[FACT-RETENTION-SCHEDULE]]).
- Uploads from phone cameras are tested on real formats.
- Staff estimate documents (PDF or Word) are a separate staff-only upload with their own type validation and the same 15 MB per-file limit ([[HH-EST-11]]).
