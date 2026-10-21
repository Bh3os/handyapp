---
id: OWN-DEC-153
type: decision
title: "Routine reminders send automatically: one 3-day estimate reminder, one 3-day question reminder, the 24-hour appointment reminder"
status: active
area: messaging
links:
  supersedes: ["[[OWN-DEC-78]]", "[[OWN-DEC-132]]"]
  uses: ["[[FACT-REMINDER-CADENCES]]", "[[FACT-REOPEN-PERIOD]]"]
  related: ["[[OWN-DEC-101]]", "[[OWN-DEC-107]]", "[[OWN-DEC-112]]", "[[OWN-DEC-113]]"]
source: "owner answers 2026-10-21 R3-Q1"
---
Owner answer (round 3, question 1), option chosen "Automatic, as in my spec (Recommended)":

> Choose **Automatic, as in my spec (Recommended)**.
>
> This decision supersedes the previous staff-release requirement for routine reminders.
>
> Implement the following rules:
>
> 1. **Estimate reminders:** Send one automatic reminder 3 days after the estimate is successfully delivered, per estimate version, only if the estimate remains pending.
> 2. **Question reminders:** Send one automatic reminder 3 days after a staff question is delivered, only if the customer has not responded.
> 3. **Appointment reminders:** Send automatically 24 hours before each confirmed estimate or work appointment.
> 4. Cancel scheduled reminders immediately when their conditions no longer apply.
> 5. Never send reminders for approved, rejected, expired, withdrawn, cancelled, or superseded records.
> 6. Recalculate appointment reminders after rescheduling.
> 7. Prevent duplicate reminders using idempotency keys.
> 8. Respect applicable communication preferences, consent, opt-outs, and quiet-hours rules.
> 9. Send approved transactional emails automatically. Queue eligible SMS notifications according to the configured quiet-hours policy.
> 10. Maintain complete delivery logs and visible failure statuses for staff.
> 11. Keep personalized staff replies subject to staff release.
> 12. Keep work-pause notifications subject to explicit owner approval.
> 13. Do not send a 24-hour estimate reminder. Use only the 3-day reminder.
> 14. Test all reminder triggers, cancellations, timing rules, and duplicate prevention in staging before enabling production delivery.
>
> This is the final messaging policy for routine reminders. Update existing specifications and implementation rules to eliminate contradictions.

Effect:
- Replaces [[OWN-DEC-78]] ("Do not send automatically; staff release each draft") and [[OWN-DEC-132]], and the 24-hour and 48-hour question-reminder drafts of [[OWN-DEC-101]].
- Estimate: exactly one automatic reminder per estimate version, 3 days after the estimate was successfully delivered, only while that version is still pending. There is no 24-hour estimate reminder.
- Question: one automatic reminder 3 days after the question notice was delivered, only while the question is unanswered.
- Appointment: automatic, 24 hours before each confirmed estimate or work visit, recalculated after a reschedule. A visit booked less than 24 hours ahead gets no message describing itself as a 24-hour reminder; the confirmation covers it (MESSAGE 11, [[OWN-DEC-151]]).
- Scheduled reminders are cancelled as soon as their condition stops applying; none is sent for approved, rejected, expired, withdrawn, cancelled or superseded records; idempotency keys prevent duplicates; preferences, consent, opt-outs and quiet hours apply; emails send automatically and texts queue to the permitted hours ([[OWN-DEC-154]]).
- Kept from [[OWN-DEC-101]]: a failed notice never counts as customer non-response and starts no clock; a reply stops the reminder; the 30-day reopen period ([[FACT-REOPEN-PERIOD]]); accepted, scheduled or paid work is never cancelled under this rule. PROPOSED reading: "Closed—no response" becomes available 24 hours after the single question reminder was actually sent.
- Staff replies stay staff-released ([[OWN-DEC-154]]); work-pause notices stay owner-approved ([[OWN-DEC-152]]).
- Not covered by this answer: unpaid-invoice reminders ([[OWN-DEC-112]]) stay staff-released drafts until the owner decides ([[OQ-MESSAGES-OUTSIDE-THE-21]]); the service-quality follow-up is [[OWN-DEC-157]]; repeat-service reminders stay as [[OWN-DEC-113]].
- Values: [[FACT-REMINDER-CADENCES]]. Built by [[TSK-0121]].
