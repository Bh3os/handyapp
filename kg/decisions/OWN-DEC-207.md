---
id: OWN-DEC-207
type: decision
title: "SMS time zone final: the recipient's verified zone; unknown zone falls back to 9 AM–9 PM Eastern for non-urgent texts; authentication codes never wait in the reminder queue"
status: active
area: messaging
links:
  uses: ["[[FACT-HOURS]]", "[[FACT-TIMEZONE]]", "[[ENT-ConsentPreference]]", "[[INT-Bird]]"]
  related: ["[[OWN-DEC-154]]", "[[OWN-DEC-159]]", "[[OWN-DEC-190]]", "[[OWN-DEC-178]]", "[[OQ-READINGS-2026-10-21]]", "[[HH-COM-15]]", "[[TSK-0122]]", "[[TSK-0123]]"]
source: "owner answers 2026-10-22 R14 item 8; R13-Q1 correction 3"
---
Final confirmation, with amendment, of reading 8 of [[OQ-READINGS-2026-10-21]] (unknown recipient zone, [[HH-COM-15]]).

Owner answer (round 13, question 1), correction 3, verbatim:
> 3. When the customer's time zone is unknown, use a conservative SMS delivery window that is safe for both Eastern and Central Time, or hold nonurgent messages until the time zone is established. Do not assume 10 PM Eastern is automatically appropriate for all customers.

Owner answer (round 14, 2026-10-22), verbatim:
> Confirm all 13 readings, subject to the following final amendments.
> Item 8 — SMS time zone
> Approve 9 AM–9 PM Eastern as the conservative fallback for nonurgent SMS when the recipient's actual local time zone cannot be established.
> Use the recipient's verified local time zone whenever available.
> Keep SMS consent, opt-outs, provider requirements, quiet-hour enforcement, A2P registration, and delivery controls intact.
> Do not delay time-sensitive authentication codes using ordinary reminder-queue logic; handle them through an approved and available authentication channel.

Effect:
- Non-urgent texts use the recipient's verified local time zone whenever it is known ([[OWN-DEC-154]], [[OWN-DEC-159]]).
- When the zone cannot be established, non-urgent texts go only between 9 AM and 9 PM Eastern (8 AM–8 PM Central). Replaces the PROPOSED 9 AM–10 PM Eastern of the reading. Outside that window a text queues for the next allowed time.
- SMS consent, opt-outs, provider requirements, quiet-hour enforcement, A2P 10DLC registration and delivery controls stay unchanged ([[OWN-DEC-190]]).
- Time-sensitive authentication codes are never delayed by the reminder queue or quiet-hour scheduling; they go at once through an approved, available authentication channel (email, or a text only where the SMS verification opt-in and A2P approval allow it, [[OWN-DEC-178]]), or the customer is offered that other channel.
- Built by [[TSK-0122]]; the zone data with [[TSK-0123]].
