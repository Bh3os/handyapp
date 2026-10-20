---
id: OWN-DEC-60
type: decision
title: "Email provider: Resend"
status: active
area: messaging
links:
  related: ["[[HH-COM-03]]", "[[HH-COM-04]]", "[[HH-NFR-03]]"]
  uses: ["[[INT-Resend]]"]
  constrained_by: ["[[RULE-SYNTHETIC-DATA]]"]
  part_of: ["[[C03]]", "[[S06]]"]
source: "vault-own-decisions.md OWN-DEC-60; project chat 2026-10-12"
---
Owner wording (project chat, 2026-10-12): asked "Which should HandyHub use?" with Resend, Amazon SES, Postmark or no email for now, the owner chose Resend.

Effect:
- Customer email (receipts, verification codes, estimate and invoice links) goes through a Resend adapter behind the notification outbox ([[INT-Resend]]).
- The adapter reports a missing state until the owner's Resend account, verified sending domain and API key exist; the key is entered in the host's settings, never in chat or a file.
- Outside production, email goes only to allow-listed test addresses.
- Customer templates are English. Marketing email stays off and needs its own separate permission.
- Resend must be named in the privacy notice as a vendor.

Reaffirmed by [[OWN-DEC-129]]: email stays on Resend, including inbound email, while texts and the phone number move to Bird.

Open:
- The privacy notice naming the vendor (attorney): [[OQ-ATTORNEY-PRIVACY]].
