---
id: FACT-HOURS
type: fact
title: Visits and customer contact every day, 8 AM–10 PM
status: active
area: business
links:
  decided_by: ["[[OWN-DEC-66]]", "[[OWN-DEC-86]]", "[[OWN-DEC-94]]", "[[OWN-DEC-101]]", "[[OWN-DEC-112]]", "[[OWN-DEC-115]]", "[[OWN-DEC-132]]", "[[OWN-DEC-154]]", "[[OWN-DEC-170]]"]
  related: ["[[OWN-DEC-02]]", "[[OWN-DEC-65]]", "[[OWN-DEC-92]]", "[[OWN-DEC-107]]"]
source: "owner-answers-verbatim 2026-10-05T16:22 [Hours], 2026-10-05T16:23 [Text hours], 2026-10-12 steps 1.1, 3.1, 4.4, 10.3, S1"
---
**Changed by [[OWN-DEC-154]], [[OWN-DEC-159]], [[OWN-DEC-170]] (2026-10-21):** transactional emails and released staff replies send at any hour; the 8 AM–10 PM limit applies to non-urgent texts in the recipient's local zone; business hours stay 8 AM–10 PM in America/Kentucky/Louisville; preferred windows are Mornings 8–12, Afternoons 12–5, Evenings 5–10 ([[FACT-WINDOW-HOURS]]).

**Value:** every day, 8 AM–10 PM, in the business time zone ([[FACT-TIMEZONE]]). Never 24/7 ([[OWN-DEC-02]]: "247" in the domain is not a 24/7 promise).

Where it applies:
- Visits are by appointment within these hours; the site says "Visits every day, 8 AM–10 PM, by appointment." ([[OWN-DEC-86]]).
- The request form's preferred windows (Mornings, Afternoons, Evenings) are configured inside these hours ([[OWN-DEC-92]]).
- Staff-released customer messages (all reminders except unanswered-estimate reminders, [[FACT-REMINDER-CADENCES]]) are sent only within these hours; a draft released outside them is queued until 8 AM ([[OWN-DEC-101]], [[OWN-DEC-112]]; owner answer 2026-10-05 "8 am-10 pm" for texts).
- The 1-hour response target counts only within these hours and pauses outside them ([[FACT-RESPONSE-TARGET]]).
- Requests received outside these hours are reviewed when the business reopens ([[OWN-DEC-94]]).

Not held to these hours: one-time codes and access links send immediately ([[OWN-DEC-65]]); released unanswered-estimate reminders send at any hour ([[OWN-DEC-132]]); the "On my way" notice follows the worker's tap (owner answer 2026-10-05T18:11, "Any time"; [[OWN-DEC-107]]). PROPOSED: the other automatic notices of [[FACT-AUTOMATIC-MESSAGES]] send when the triggering action is committed.

**Built by [[TSK-0122]] (2026-10-22):** `messages.delivery_hours` applies these hours to non-urgent customer texts only, in the recipient's verified zone (9 AM–9 PM Eastern while it is unknown, [[OWN-DEC-207]]); emails and released replies go at any hour; codes, account security notices, access links and the On my way notice never wait.
