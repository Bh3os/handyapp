---
id: INT-R2
type: integration
title: Cloudflare R2 - photos and documents
status: active
area: platform
links:
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
source: "old repo field photos R2 (merged PR #49); OWN-DEC-102, OWN-DEC-106"
---
Private R2 buckets, reached through the S3 API, store:
- request photos and project photos (customer uploads, before/after photos and internal photos);
- estimate documents (uploaded PDF or Word originals and the customer PDF);
- invoices, receipts and care notes.

Every read is authorized on the server and served through short-lived signed URLs. Internal photos are never reachable by customers, by URL or by ID.

Uploads are checked for file type and size. Originals are never changed.
