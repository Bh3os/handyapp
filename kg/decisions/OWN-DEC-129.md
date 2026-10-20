---
id: OWN-DEC-129
type: decision
title: Bird handles SMS and the business phone number; email stays on Resend
status: active
area: messaging
links:
  supersedes: []
  uses: ["[[INT-Bird]]", "[[INT-Resend]]"]
source: "owner answer 2026-10-20"
---
Owner, 2026-10-20: "i'm gonna use bird for the phone number and masseges". The owner then chose: SMS and the phone number on Bird; email stays on Resend.

This decision has three effects:
- Bird replaces Telnyx for outbound and inbound texts and for the business phone number. Bird webhooks feed the unified inbox ([[OWN-DEC-120]]).
- Resend keeps sending email, including receipts, codes and links, and handles inbound email.
- Every earlier Telnyx reference is superseded by this decision.
