---
id: OQ-APPOINTMENT-REMINDER-WORDING
type: question
title: The wording of the appointment reminder, and the open details of its draft
status: open
area: messaging
links:
  related: ["[[HH-COM-11]]", "[[OWN-DEC-107]]", "[[OWN-DEC-78]]", "[[FACT-REMINDER-CADENCES]]", "[[HH-COM-04]]", "[[HH-COM-05]]", "[[HH-COM-09]]", "[[OQ-BIRD-10DLC]]", "[[OQ-ESTIMATE-REMINDER-WORDING]]", "[[TSK-0067]]", "[[TSK-0066]]", "[[TSK-0070]]"]
source: "TSK-0067 (2026-10-21): OWN-DEC-107 names the reminder's content and timing; no owner wording exists for reminder.appointment"
---
**Question:** which exact email subject and body (and text-message body) should the appointment reminder use, and does the owner accept the PROPOSED details below?

- **Who answers:** the owner (wording, channel, who releases); the A2P 10DLC campaign description for the reminder texts goes with [[OQ-BIRD-10DLC]] (human review: messaging compliance).
- **Decided, in use:** [[OWN-DEC-107]]: the draft is prepared 24 hours before the visit (`reminders.cadences.appointment.hoursBefore`), or at once when the visit is confirmed less than 24 hours ahead, with the confirmed date and arrival window, the address and the approved preparation steps; staff release it; the current appointment is rechecked before sending and outdated, cancelled or duplicate reminders are suppressed. [[OWN-DEC-78]]: no reminder sends automatically. [[HH-COM-09]]: a released reminder sends inside the daily contact hours ([[FACT-HOURS]]), otherwise at the next opening.
- **What the software does now (TSK-0067):** confirming a visit (staff confirmation or the customer's selected window) and every committed reschedule schedule the draft of the visit's current window; the draft appears in the staff queue (`appointment_reminder`) and on the visit's panel of the scheduling board, where Owner and Office send or dismiss it. It is rechecked when drafted, when released and by the send job: the visit still confirmed at the same window, the window not started, no reminder of it already sent, the same address and preparation steps, and the customer's channel permission. A reschedule or cancellation cancels the waiting reminder in its own transaction; the database cancels it when a visit leaves "confirmed" any other way. No template version of `reminder.appointment` is released, so a released reminder is recorded as `template_not_configured` (never as sent) with a delivery issue and Retry.
- **PROPOSED (not owner-approved), used by the software until answered:**
  - "approved preparation steps" are the preparation instructions staff wrote with the offered windows (the ones the customer already sees in the Appointments tab); a visit confirmed without an offer has none, and none are made up;
  - one draft per reminder on the customer's preferred channel: a text when they prefer texts and the SMS opt-in is current, otherwise email (as for [[OQ-ESTIMATE-REMINDER-WORDING]]);
  - a reassignment keeps the reminder (its date, window, address and preparation do not change); a reschedule replaces it with a draft for the new window;
  - Owner and Office release or dismiss appointment reminders (message.release_draft together with visit.reschedule); the Estimator sees them on the board without the actions; the queue item is due by the start of the arrival window;
  - a dismissed draft is kept as cancelled and never sent; changed address or preparation steps refresh a draft before release (staff review it again), and suppress a released one at send time;
  - the reminder is a "customer reminder" for estimate visits as well as work visits ("each confirmed estimate or work visit", [[HH-COM-11]]).
- **PROPOSED wording for the owner to approve or change (not used by the software):** subject "Your HandyHub appointment is coming up"; body "Reminder: your HandyHub appointment is {visitWindow} at {serviceAddress}. How to prepare: {preparationSteps}. To ask a question or request to reschedule, open your project: {projectLink}."
- **Until answered:** drafts, rechecks and the staff screens work; nothing reaches a customer.
