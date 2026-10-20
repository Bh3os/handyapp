---
id: OWN-DEC-39
type: decision
title: Record when the customer first opens the estimate link (date and time only)
status: active
area: approval
links:
  related: ["[[HH-PORT-03]]", "[[HH-COM-02]]"]
  uses: ["[[ENT-EstimateVersion]]"]
  part_of: ["[[C05]]"]
source: "vault-own-decisions.md OWN-DEC-39; project chat 2026-10-05"
---
Owner wording (in-chat question, 2026-10-05): "When a customer opens their estimate link, should the system record that it was viewed (date and time only), so your office knows to follow up?" answered "Yes, record viewed (Recommended)".

Effect:
- The estimate is marked "Viewed" with the date and time of the first opening of the estimate link, only from an authenticated session or a verified link bound to that estimate version.
- Later opens are not recorded. No device, network address or location of the open is kept (ASSUMPTION drawn from "date and time only").
- No email-open tracking is used.

Open:
- Whether the privacy notice must mention this record: [[OQ-ATTORNEY-PRIVACY]].
