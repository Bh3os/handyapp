---
id: HH-COM-15
type: requirement
title: "Email at any hour; texts only within the recipient's local permitted hours"
status: active
priority: P0
area: messaging
links:
  decided_by: ["[[OWN-DEC-154]]", "[[OWN-DEC-152]]", "[[OWN-DEC-159]]", "[[OWN-DEC-190]]"]
  depends_on: ["[[HH-COM-05]]", "[[HH-SCH-02]]"]
  uses: ["[[FACT-HOURS]]", "[[FACT-TIMEZONE]]", "[[ENT-Message]]", "[[ENT-ConsentPreference]]", "[[INT-Bird]]"]
  tested_by: ["[[T65]]"]
  part_of: ["[[S06]]"]
source: "OWN-DEC-154, OWN-DEC-152 section 3, OWN-DEC-159"
---
- Approved transactional emails and released staff replies send immediately, at any hour. Account security notices are never delayed by quiet hours.
- Non-urgent texts send only within the configured permitted hours (default 8 AM–10 PM, stricter rules win) in the recipient's local zone, Eastern or Central, from reliable location data. Outside them a text is queued for the next allowed time. Before sending it is rechecked for relevance, earlier delivery, consent and opt-out; obsolete reminders and expired scheduling notices are not sent.
- When the recipient's zone is unknown it is flagged for verification and never assumed Eastern. PROPOSED ([[OQ-READINGS-2026-10-21]]): until verified, a text is sent only within the hours valid in both zones (9 AM–10 PM Eastern).
- Urgent safety situations use the escalation procedure ([[OWN-DEC-172]]), never a quiet-hours bypass.
- Texts stay disabled until A2P 10DLC registration and consent are complete ([[OWN-DEC-190]]).
- Portal display never waits for email or text delivery.
