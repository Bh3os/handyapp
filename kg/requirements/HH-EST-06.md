---
id: HH-EST-06
type: requirement
title: "Customer approves the exact published version"
status: active
priority: P0
area: approval
links:
  decided_by: ["[[OWN-DEC-103]]", "[[OWN-DEC-96]]", "[[OWN-DEC-110]]", "[[OWN-DEC-127]]", "[[OWN-DEC-72]]"]
  depends_on: ["[[HH-EST-04]]", "[[HH-ID-07]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-Approval]]", "[[ENT-EstimateVersion]]", "[[ENT-Contact]]", "[[ENT-PolicyVersion]]"]
  tested_by: ["[[T33]]", "[[T17]]"]
  part_of: ["[[C05]]"]
source: "guide 13.2 HH-EST-06; OWN-DEC-103, OWN-DEC-110, OWN-DEC-127"
---
- Approval requires verified project access: a verified contact for this project ([[HH-ID-07]]). A reference number or an unverified link grants nothing.
- Before approving, the customer sees the complete written or uploaded estimate, the full readable terms ([[HH-EST-13]]), the payment term, the selected options, the final total and any deposit.
- The checkbox "I have read and accept the estimate terms" is unchecked by default. The customer types their full name and presses "Approve Estimate". A GET request or link preview never approves anything.
- The approval record ([[ENT-Approval]]) stores: the exact estimate version (or the published document version and its hash), the terms version ID and content hash, the payment-terms text and version shown, the privacy-notice version, the selected options, the approved total in cents, any deposit amount, the typed full name, the verified contact and access grant used, the acceptance mechanism and the server timestamp.
- Only necessary security metadata is kept, as the audit practice defines (for example IP address and user agent); no invasive device fingerprinting.
- On staging, approvals are clearly marked TEST and the terms carry the banner "TEST — wording pending owner approval for real customer use".
- After approval the customer sees "Estimate approved—scheduling is next." Approval never confirms an appointment, reserves capacity or marks a deposit paid.
