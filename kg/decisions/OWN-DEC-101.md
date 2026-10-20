---
id: OWN-DEC-101
type: decision
title: Unanswered questions: reminders at 24 h and 48 h; 30-day reopen
status: active
area: messaging
links:
  related: ["[[OWN-DEC-78]]", "[[OWN-DEC-98]]", "[[HH-COM-05]]", "[[HH-AUTO-01]]", "[[HH-LEAD-03]]"]
  uses: ["[[FACT-REMINDER-CADENCES]]", "[[FACT-REOPEN-PERIOD]]", "[[FACT-HOURS]]", "[[FACT-TIMEZONE]]"]
source: "owner-answers-verbatim 2026-10-12T18:47:59.773Z [4.4 No reply]; decision-briefs 2026-10-12T18:48:55"
---
Owner, 2026-10-12, journey Step 4.4, no response from the customer.

Question asked:
> Step 4.4 - No response from the customer: if a question stays unanswered, a reminder draft is prepared at +3 days and a final one at +7 days (your cadence rule), and staff release them. After the final reminder with no answer, staff can mark the request 'Closed - no response'; the customer can reopen it from the project within 30 days by replying. The 30 days would be a configurable setting (NOT CONFIGURED until you set it). OK?

Owner wording:
> Use a faster follow-up schedule for unanswered staff questions:
>
> - Prepare the first reminder after 24 hours and the final reminder after 48 hours, measured from the original notice’s successful send.
> - Keep staff release, but place these drafts prominently in the action queue. Send during our daily contact hours, 8 AM–10 PM.
> - Staff may close an unbooked request as “Closed—no response” 24 hours after the final reminder was actually sent.
> - Stop reminders immediately when the customer replies. Failed notice delivery must not count as customer nonresponse.
> - Set the reopening period to 30 days now; keep it configurable without leaving it NOT CONFIGURED.
> - A reply within that period reopens the same request for staff review, preserving its history. It does not restore an expired estimate or appointment.
> - Never automatically cancel accepted, scheduled, or paid work under this rule.
>
> This replaces the 3-day/7-day cadence for unanswered questions only. Implement, test, and publish on private staging.

Effect:
- For unanswered staff questions only, this replaces the 3-day/7-day cadence that was proposed from [[OWN-DEC-78]]. The other OWN-DEC-78 cadences (unanswered estimate 3 and 7 days, appointment, completed job, repeat service) are unchanged except where later decisions say otherwise ([[FACT-REMINDER-CADENCES]]).
- First reminder draft 24 hours and final reminder draft 48 hours after the original notice was successfully sent. A failed delivery never starts the clock and never counts as non-response.
- Drafts stay staff-released, prominent in the action queue, and are sent only within 8 AM–10 PM in the business time zone ([[FACT-HOURS]], [[FACT-TIMEZONE]]); anything released outside those hours waits until 8 AM.
- Reminders stop as soon as the customer replies.
- Staff may close an unbooked request as "Closed—no response" 24 hours after the final reminder was actually sent.
- Reopen period: 30 days, a configurable value set now ([[FACT-REOPEN-PERIOD]]). A reply within it reopens the same request for staff review with its history; it does not restore an expired estimate or appointment.
- Accepted, scheduled or paid work is never cancelled automatically under this rule.

Links: uses [[FACT-REMINDER-CADENCES]], [[FACT-REOPEN-PERIOD]], [[FACT-HOURS]], [[FACT-TIMEZONE]].
