---
id: HH-INT-22
type: requirement
title: "SMS opt-in checkbox on the request form"
status: active
priority: P0
area: intake
links:
  decided_by: ["[[OWN-DEC-147]]", "[[OWN-DEC-190]]"]
  depends_on: ["[[HH-INT-18]]"]
  constrained_by: ["[[RULE-NO-INVENTED-FACTS]]", "[[RULE-SERVER-AUTHZ]]", "[[RULE-HUMAN-REVIEW]]"]
  uses: ["[[ENT-ConsentPreference]]", "[[ENT-PolicyVersion]]", "[[ENT-Request]]", "[[INT-Bird]]"]
  tested_by: ["[[T76]]"]
  part_of: ["[[C02]]"]
  related: ["[[HH-COM-12]]"]
source: "OWN-DEC-147 (new behaviour; no guide id)"
---
- The contact step ([[HH-INT-18]]) has an SMS opt-in checkbox, unchecked by default.
- It is separate from accepting the terms and separate from the marketing permission; none of the three implies another, and submitting the request is never SMS consent.
- The exact disclosure text sits next to the checkbox. It names the program and the message types, states the frequency, "Message and data rates may apply", "Reply STOP to opt out" and "Reply HELP for help", gives the support contact, and links to the privacy policy and the SMS terms ([[HH-COM-12]]). The text is a versioned legal text awaiting attorney review ([[OQ-ATTORNEY-PRIVACY]]), never improvised in code.
- Checking the box stores a consent record ([[ENT-ConsentPreference]]): purpose transactional texts, channel SMS, the phone number, the disclosure version, the time and the source (request form). It is shown to staff with the request.
- No text, including codes and reminders, is sent to a number without a current SMS opt-in; having a phone number is never texting consent ([[HH-COM-05]]). Choosing "text" as the preferred contact method needs the opt-in, and the form says so instead of changing the choice silently.
- STOP withdraws the opt-in at once; START records a new opt-in ([[INT-Bird]]).

**Changed by [[OWN-DEC-190]] (2026-10-21):** the checkbox wording and disclosure are the owner's ([[OWN-DEC-190]], opt-in point A).
