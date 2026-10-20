---
id: HH-ARC-04
type: requirement
title: Separate customer and staff projections of the same records
status: active
priority: P0
area: security
links:
  decided_by: ["[[OWN-DEC-106]]", "[[OWN-DEC-117]]", "[[OWN-DEC-124]]"]
  depends_on: ["[[HH-ARC-03]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-Photo]]", "[[ENT-Document]]", "[[ENT-Case]]"]
  tested_by: ["[[T24]]", "[[T68]]"]
  part_of: ["[[C06]]"]
source: "guide 3.1; OWN-DEC-106"
---
- The server builds a customer projection and a staff projection of each record. The customer projection is an allow-list of customer-facing fields.
- Never sent to a customer browser (not merely hidden with CSS): internal notes, access secrets and codes, costs and margin, employee records, restricted incident and case details, internal photos, internal messages, and attachments unrelated to that customer's project.
- Internal photos are inaccessible to customers by URL or ID, not just absent from the page ([[OWN-DEC-106]]).
- Staff projections are also scoped by role: restricted incident and financial fields are removed for roles without that permission, in lists as well as detail screens ([[HH-OPS-02]]).
- A deny-list test checks that no forbidden field appears in any customer response.
