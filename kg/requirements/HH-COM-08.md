---
id: HH-COM-08
type: requirement
title: Staff reply from the project through the customer's preferred permitted channel
status: active
priority: P0
area: messaging
links:
  decided_by: ["[[OWN-DEC-120]]"]
  depends_on: ["[[HH-COM-07]]", "[[HH-COM-02]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-Message]]", "[[ENT-ConsentPreference]]", "[[ENT-Photo]]", "[[INT-Bird]]", "[[INT-Resend]]"]
  tested_by: ["[[T66]]"]
  part_of: ["[[S06]]"]
source: "OWN-DEC-120"
---
- Staff reply from the project. Pressing **Send** is the release action.
- The reply uses the customer's preferred permitted channel. If it is unavailable (no permission, unverified, or opted out), the composer shows another permitted option for staff to choose; the system never switches channels silently.
- Reply drafts are kept; retries never send duplicates.
- Attachments are validated by type and size, and project-access permissions apply to them.
- Internal notes are written in a separate field and never sent.
