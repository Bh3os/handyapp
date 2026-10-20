---
id: FACT-UPLOAD-LIMITS
type: fact
title: Customer request photos: up to 10, JPEG/PNG/WebP, 15 MiB each, no PDFs
status: active
area: intake
links:
  decided_by: ["[[OWN-DEC-62]]", "[[OWN-DEC-91]]", "[[OWN-DEC-146]]"]
  related: ["[[OQ-UPLOAD-SIZE-UNIT]]", "[[HH-INT-06]]", "[[OWN-DEC-102]]"]
source: "OWN-DEC-62, 91; guide HH-INT-06"
---
**Current value ([[OWN-DEC-146]]):** 15 MB per file (implemented as 15 MiB); up to 10 photos per request.

**Value:** at most 10 photos per request in total; JPEG, PNG or WebP; at most 15 MiB each; no PDFs; photos optional.

- The owner's words say "up to 15 MB each" ([[OWN-DEC-91]]); the vault decision and the guide say 15 MiB ([[OWN-DEC-62]], [[HH-INT-06]]). Implemented as 15 MiB (15 × 1,048,576 bytes), which also admits every 15 MB file ([[OQ-UPLOAD-SIZE-UNIT]]).
- Validated on the server by content signature, size and count.
- Staff estimate documents (PDF or Word) are a separate staff-only upload with their own limits ([[OWN-DEC-102]]).
