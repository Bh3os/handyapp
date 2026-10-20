---
id: HH-ID-03
type: requirement
title: No disclosure of earlier records; access attaches only after verified linking
status: active
priority: P0
area: identity
links:
  decided_by: ["[[OWN-DEC-96]]", "[[OWN-DEC-97]]", "[[OWN-DEC-116]]", "[[OWN-DEC-117]]"]
  depends_on: ["[[HH-INT-13]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-CustomerIdentityLink]]", "[[ENT-Contact]]", "[[ENT-AuditEvent]]"]
  tested_by: ["[[T16]]", "[[T29]]"]
  part_of: ["[[C03]]", "[[S02]]"]
source: "guide 8.1 HH-ID-03; OWN-DEC-96, OWN-DEC-97, OWN-DEC-116"
---
- A new request using an existing email or phone reveals no earlier projects, account status or history, on the receipt, in emails or in any API response.
- Account or customer-wide access is attached only after verifying the exact contact or grant and a legitimate record relationship.
- Staff linking a request to an existing customer never by itself grants the requester access to earlier projects; access is rechecked on every link change ([[HH-CRM-04]]).
- Staff-assisted linking records the evidence, reason and actor in the audit log. It cannot rely only on someone knowing an address or an invoice number.
