---
id: ENT-Photo
type: entity
title: "Photo"
status: active
area: records
links:
  decided_by: ["[[OWN-DEC-109]]", "[[OWN-DEC-106]]", "[[OWN-DEC-62]]"]
  uses: ["[[INT-R2]]"]
source: "guide 22.1 Attachment; HH-SEC-05"
---
An image attachment from a customer request, a reply, or field work.

**Fields:** object key; owner record (request, project, task, case); uploader; type, size, hash; processing and upload state (uploading, processing, complete, failed; on device: saved on this phone, pending upload, synced); area or task label; before/after pairing; visibility class (internal, customer-shared, restricted incident); marketing permission link.

**Invariants:** private by default; staff photos internal unless shared through an audited action; internal photos inaccessible to customers by URL or ID; originals kept unchanged; marketing use needs a separate permission.

**Who may change:** uploaders create; staff with record access share; nobody edits content.
