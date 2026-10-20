---
id: HH-SEC-05
type: requirement
title: Private media with short-lived authorized access; storage keys are not authorization
status: active
priority: P0
area: security
links:
  decided_by: ["[[OWN-DEC-106]]", "[[OWN-DEC-109]]"]
  depends_on: ["[[HH-DATA-07]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[INT-R2]]", "[[ENT-Photo]]", "[[ENT-Document]]"]
  tested_by: ["[[T14]]", "[[T15]]", "[[T57]]"]
source: "guide 25.1; OWN-DEC-106"
---
- Customer and job media are stored privately in object storage ([[INT-R2]]); no bucket or object is public.
- File access is granted only by the server after checking the record link and the caller's visibility (customer-shared, internal, restricted), as a short-lived signed URL or a proxied download.
- Storage keys and attachment IDs are not authorization: knowing one gives nothing. Object listing is impossible for clients, and orphaned or abandoned uploads are cleaned up so they cannot leak.
- Public marketing derivatives (for example a photo on the website) are separate files, created only after a separate recorded publication permission ([[OWN-DEC-109]]).
