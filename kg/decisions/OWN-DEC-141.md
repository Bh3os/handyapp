---
id: OWN-DEC-141
type: decision
title: "Sign-in, link and draft timings"
status: active
area: identity
links:
  related: ["[[OWN-DEC-114]]", "[[OWN-DEC-96]]"]
  uses: ["[[FACT-SESSION-TIMINGS]]"]
source: "owner answers 2026-10-20 (coordinator session)"
---
Owner wording (2026-10-20): Q: "Sign-in and link timings (currently engineering defaults you never confirmed): staff invite link 24 hours, one-time code 10 minutes, customer session 30 minutes idle / 8 hours max, staff sign-out after 30 minutes idle, request drafts kept 7 days. Accept?" Answer: "Accept these defaults".

Effect:
- Staff invite and password-reset links expire after 24 hours and are single-use.
- One-time codes expire after 10 minutes.
- Customer sessions end after 30 minutes idle or 8 hours in total.
- Staff sessions end after 30 minutes idle.
- Saved request drafts are kept 7 days.

Answers [[OQ-SESSION-EXPIRY]].
