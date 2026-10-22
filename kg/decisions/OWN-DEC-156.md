---
id: OWN-DEC-156
type: decision
title: "Automatic notice when work-appointment windows are published; separate estimate-visit and work-appointment workflows"
status: active
area: scheduling
links:
  related: ["[[OWN-DEC-105]]", "[[OWN-DEC-144]]", "[[HH-SCH-11]]"]
source: "owner answers 2026-10-21 R1-Q3; R2-Q1 (specification section 10)"
---
Owner answer (round 1, question 3, "Work-visit windows notice"), option chosen "Yes, send a notice":

> Choose **Yes, send a notice**.
>
> Automatically notify customers when WORK appointment windows become available after their estimate has been approved.
>
> Implement the following requirements:
>
> 1. Send a professional automatic email with a secure link to the project's Appointments page.
> 2. Clearly explain that the customer has 24 hours to select an available appointment window.
> 3. Display available dates, arrival windows, and the applicable time zone.
> 4. Do not describe an appointment as confirmed until the customer selects a window and the system successfully validates and reserves it.
> 5. Prevent double-booking of employees and overlapping work assignments.
> 6. Automatically release temporary appointment holds after 24 hours if no selection is made.
> 7. Allow customers to request new appointment options when the original options expire.
> 8. Send a confirmation email immediately after successful booking.
> 9. Send an appointment reminder 24 hours before the confirmed work visit.
> 10. Prevent duplicate notifications and maintain complete notification and booking audit records.
> 11. Respect customer communication preferences and send SMS only after applicable registration and consent requirements have been satisfied.
> 12. Handle expired links, unavailable windows, and simultaneous booking attempts safely.
>
> Use HandyHub's professional, friendly communication style. Test the entire workflow in staging before enabling production notifications.

Round 2 specification, section 10:

> # 10. APPOINTMENT WORKFLOW RULES
>
> Maintain separate workflows for:
>
> 1. On-site estimate visits
> 2. Work appointments following accepted estimates
>
> Do not confuse the two appointment types.
>
> ## Estimate visit
>
> Request submitted → Staff prepares options → Options published → Customer selects → Availability validated → Visit confirmed → Reminder delivered.
>
> ## Work appointment
>
> Estimate approved → Job created → Staff prepares work windows → Windows published → Customer selects → Crew availability validated → Work appointment confirmed → Reminder delivered.
>
> ## Scheduling protections
>
> - Never double-book an employee.
> - Respect employee qualifications.
> - Respect required crew size.
> - Respect mandatory safety and compliance holds.
> - Preserve rescheduling history.
> - Check scheduling conflicts atomically.
> - Handle concurrent customer selections safely.
> - Expire unselected work-window offers after 24 hours.
> - Do not promise availability if capacity is not genuinely held.
> - Cancel obsolete reminders following cancellation or rescheduling.
>
> Only send confirmation messages after successful booking.

Effect:
- When staff publish work-visit windows after approval, the customer automatically gets MESSAGE 09 ([[OWN-DEC-151]]) with a secure link to the project's Appointments page, stating the 24-hour hold and its expiry in the property's zone ([[OWN-DEC-144]], [[OWN-DEC-159]]).
- Nothing is called confirmed until the selection is validated and reserved; employees are never double-booked; holds release after 24 hours without a selection; the customer can ask for new options; the confirmation email (MESSAGE 10) goes immediately after booking and the reminder 24 hours before ([[OWN-DEC-153]]); no duplicate notices; expired links, unavailable windows and simultaneous selections are handled safely.
- If capacity cannot genuinely be held for 24 hours, the notice says the windows are available to select rather than held.
- Section 10 keeps the estimate-visit and work-appointment workflows separate, with its scheduling protections.
- Answers [[OQ-WORK-WINDOW-OFFER-NOTICE]]. Built by [[TSK-0120]].
