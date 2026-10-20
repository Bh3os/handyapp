---
id: HH-PORT-01
type: requirement
title: Project screens enforce record and field permissions on the server
status: active
priority: P0
area: portal
links:
  decided_by: ["[[OWN-DEC-106]]", "[[OWN-DEC-97]]"]
  depends_on: ["[[HH-ID-04]]", "[[HH-ARC-04]]", "[[HH-DATA-01]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-Project]]", "[[ENT-ProjectAccessGrant]]", "[[ENT-CustomerAccount]]"]
  tested_by: ["[[T19]]", "[[T24]]", "[[T68]]"]
  part_of: ["[[C06]]"]
source: "guide 9.2 HH-PORT-01; OWN-DEC-106"
---
- Every project screen and API enforces record and field permissions on the server, including child objects (invoices, messages, attachments, approvals) reached by altered IDs.
- A guest sees only the verified project of the grant. An account customer sees only explicitly authorized linked projects and properties.
- Customer responses are a customer projection: internal notes, costs and margins, access secrets, employee records, restricted incident details, internal photos and internal messages are never sent to the browser.
