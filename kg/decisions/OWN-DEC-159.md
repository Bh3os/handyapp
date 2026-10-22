---
id: OWN-DEC-159
type: decision
title: "Time zones: business time America/Kentucky/Louisville; appointments in the property's Eastern or Central zone"
status: active
area: platform
links:
  uses: ["[[FACT-TIMEZONE]]", "[[FACT-HOURS]]", "[[FACT-ESTIMATE-VALIDITY]]", "[[FACT-RESPONSE-TARGET]]"]
  related: ["[[HH-SCH-02]]", "[[HH-DATA-06]]"]
source: "owner answers 2026-10-21 R3-Q2"
---
Owner answer (round 3, question 2), option chosen "Business Eastern, customer local (Recommended)":

> Choose **Business Eastern, customer local (Recommended)**.
>
> Implement the following time-zone policy across HandyHub:
>
> 1. Set the official business time zone to `America/Kentucky/Louisville`.
> 2. Use Eastern Time for business operating hours (8:00 AM–10:00 PM daily), internal response-time goals, business reporting, and estimate validity calculations, unless a specific estimate explicitly defines different terms.
> 3. Determine the customer's appointment time zone from the service property's verified location, supporting both Eastern and Central time zones.
> 4. Display all customer appointment dates, arrival windows, scheduling options, and visit reminders in the property's local time zone.
> 5. Schedule SMS notifications according to the applicable recipient-local time zone and messaging rules. Do not assume the property's time zone is always the recipient's time zone.
> 6. Display staff scheduling information consistently, clearly identifying the relevant time zone.
> 7. Store event timestamps in UTC and store the applicable IANA time-zone identifier separately.
> 8. Automatically account for daylight saving time, including transitions between EST/EDT and CST/CDT.
> 9. Use actual time-zone identifiers rather than fixed UTC offsets.
> 10. Ensure 24-hour scheduling holds, estimate-reminder delays, appointment reminders, and expiration timestamps are calculated consistently.
> 11. For the one-hour response goal, measure elapsed time during business hours and clearly distinguish the target from any guaranteed response commitment.
> 12. For estimate validity, store an explicit expiration timestamp and display it in the customer's local time zone while retaining the official business-time calculation.
> 13. Never silently assume Eastern Time when the customer's relevant time zone is unknown. Flag it for verification before sending time-sensitive communications.
> 14. Test both Eastern and Central locations, daylight saving transitions, appointment booking, notifications, and expiration calculations in staging.
>
> Apply this consistently across the customer portal, staff portal, scheduling system, notifications, estimates, and audit logs.

Effect:
- The official business time zone is `America/Kentucky/Louisville` ([[FACT-TIMEZONE]], now decided): business hours (8 AM–10 PM daily), the response goal, business reporting and estimate validity.
- The appointment time zone is the service property's, from its verified location, Eastern or Central. Appointment dates, arrival windows, options and visit reminders are shown in it.
- Texts are scheduled in the recipient's local zone; the property's zone is never assumed to be the recipient's.
- Staff screens always label the zone shown.
- Instants are stored in UTC with the IANA zone id stored separately; zone ids, never fixed offsets; daylight saving time (EST/EDT, CST/CDT) is automatic.
- 24-hour holds, reminder delays, appointment reminders and expiries are computed the same way everywhere.
- The one-hour response goal is measured in business hours and shown as a target, never a guarantee ([[FACT-RESPONSE-TARGET]]).
- Estimate validity is stored as an explicit expiry timestamp computed in business time and shown in the customer's local zone ([[FACT-ESTIMATE-VALIDITY]]).
- An unknown zone is flagged for verification before any time-sensitive message; Eastern is never assumed silently. The earlier ASSUMPTION that every served property is Eastern ([[FACT-TIMEZONE]]) is withdrawn.
- Answers [[OQ-TIMEZONE-ID]]. Built by [[TSK-0123]].
