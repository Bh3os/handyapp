---
id: HH-CRM-04
type: requirement
title: Human-reviewed merges and relinks with preview, owner reversal and access recheck
status: active
priority: P0
area: records
links:
  decided_by: ["[[OWN-DEC-117]]", "[[OWN-DEC-116]]"]
  depends_on: ["[[HH-ID-02]]", "[[HH-SEC-06]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-Customer]]", "[[ENT-Property]]", "[[ENT-CustomerIdentityLink]]", "[[ENT-ProjectAccessGrant]]", "[[ENT-AuditEvent]]"]
  tested_by: ["[[T29]]", "[[T21]]"]
  part_of: ["[[S03]]", "[[S02]]"]
source: "guide 12.1 HH-CRM-04; OWN-DEC-117, OWN-DEC-116"
---
- Deduplication only offers candidate matches ([[HH-ID-02]]). Records are never merged automatically by email, phone, name or address.
- Office staff may propose or perform permitted duplicate merges and correct a request linked to the wrong customer. Each needs a required reason and creates an audit record.
- Before a merge, staff see both records and the affected projects, documents and payments.
- A merge links the records with a survivor and is never destructive: original IDs and aliases, relationships, provenance, history, approvals and financial evidence are kept.
- The owner can reverse a merge or relink without erasing later legitimate activity.
- Customer access is rechecked on every merge or relink. A mistaken link never exposes another customer's history; correcting it revokes the affected access (sessions, guest links and account links).
- Linking a request to an existing customer never grants the requester access to that customer's earlier projects.
