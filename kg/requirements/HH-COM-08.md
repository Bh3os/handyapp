---
id: HH-COM-08
type: requirement
title: Staff reply from the project through the customer's preferred permitted channel
status: active
priority: P0
area: messaging
links:
  decided_by: ["[[OWN-DEC-120]]", "[[OWN-DEC-154]]"]
  depends_on: ["[[HH-COM-07]]", "[[HH-COM-02]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-Message]]", "[[ENT-ConsentPreference]]", "[[ENT-Photo]]", "[[INT-Bird]]", "[[INT-Resend]]"]
  tested_by: ["[[T66]]"]
  part_of: ["[[S06]]"]
  related: ["[[OWN-DEC-211]]", "[[HH-COM-16]]"]
source: "OWN-DEC-120"
---
- Staff reply from the project. Pressing **Send** is the release action.
- The reply uses the customer's preferred permitted channel. If it is unavailable (no permission, unverified, or opted out), the composer shows another permitted option for staff to choose; the system never switches channels silently.
- Reply drafts are kept; retries never send duplicates.
- Attachments are validated by type and size, and project-access permissions apply to them.
- Internal notes are written in a separate field and never sent.

**Changed by [[OWN-DEC-154]] (2026-10-21):** the reply shows in the portal and is emailed at once at any hour; a text waits for the recipient's permitted local hours ([[HH-COM-15]]).

**Changed by [[OWN-DEC-211]] (2026-10-22):** workers' Spanish notes and proposed replies go through the Owner/Office review queue of [[HH-COM-16]]; only Owner or Office send the English reply.
