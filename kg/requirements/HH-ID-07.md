---
id: HH-ID-07
type: requirement
title: Fresh verification before approvals and access-contact changes
status: active
priority: P0
area: identity
links:
  decided_by: ["[[OWN-DEC-96]]", "[[OWN-DEC-103]]", "[[OWN-DEC-108]]"]
  depends_on: ["[[HH-ID-06]]", "[[HH-EST-06]]", "[[HH-EST-07]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-Approval]]", "[[ENT-ProjectAccessGrant]]", "[[ENT-Contact]]"]
  tested_by: ["[[T33]]"]
  part_of: ["[[C05]]", "[[C08]]"]
source: "guide 8.2 HH-ID-07; OWN-DEC-96, OWN-DEC-103, OWN-DEC-108"
---
- Approving an estimate or a change order, and changing an access contact, require verified contact ownership with fresh assurance. If the session's verification is older than the freshness limit (proposed 15 minutes, configurable), a new code is required.
- The approval is bound to the verified actor, the grant, the exact revision, the selected options and the displayed total. The approval content rules are in [[HH-EST-06]] and [[HH-EST-07]].
- A signature alone never identifies the customer; an in-person change-order approval uses a customer-specific approval flow.
- The server checks grant expiry and revocation again at the moment of the sensitive write.
