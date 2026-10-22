---
id: OWN-DEC-92
type: decision
title: Property and timing: full address, preferences, never an appointment
status: active
area: intake
links:
  related: ["[[OWN-DEC-56]]", "[[OWN-DEC-88]]", "[[HH-INT-02]]", "[[HH-CUS-03]]", "[[HH-SCH-01]]", "[[HH-SCH-02]]", "[[HH-CRM-02]]", "[[OWN-DEC-170]]"]
  uses: ["[[FACT-HOURS]]", "[[FACT-TIMEZONE]]", "[[FACT-PRICING-SAME-DAY-CHARGE]]", "[[FACT-SERVICE-AREA]]"]
source: "owner-answers-verbatim 2026-10-12T18:31:16.913Z [2.3 Timing]; decision-briefs 2026-10-12T18:31:38"
---
Partly replaced by [[OWN-DEC-170]] (2026-10-21): the window hours are 8–12, 12–5 and 5–10 and the notice reads "These are your preferred times only. Your appointment is not confirmed until HandyHub sends you a confirmed date and arrival window."

Owner, 2026-10-12, journey Step 2.3, property and timing.

Question asked:
> Step 2.3 - Property and timing: property address with ZIP (carried from the ZIP check), property type, preferred date (tomorrow or later), and preferred windows inside 8 AM-10 PM ('Any time' can't be combined with other windows). The form says clearly these are preferences, not an appointment. OK?

Owner wording:
> Yes, with these adjustments:
>
> - Require the full property address: street address, city, state, and ZIP. Apartment/unit is optional. Also collect property type.
> - Prefill the ZIP from the coverage check. Let customers correct it and recheck coverage without clearing other answers.
> - Save the full address with the request, show it to authorized staff, and include it in the customer’s review summary before submission. Never display it publicly.
> - Offer a preferred date or “I’m flexible.” Standard dates start tomorrow, using the property’s local time.
> - Include “Need help today?” as an optional request for staff review—not a guaranteed appointment. Show any applicable same-day charge only under the activated policy.
> - Offer Mornings, Afternoons, Evenings, Weekends, or Any time. Display configured window hours within 8 AM–10 PM. Any time clears other selections; Weekends must align with the date or flexible-date preference.
> - Show: “These are your preferences. Your appointment is confirmed only after we send a date and arrival window.”
> - Preserve all details when navigating back. Outside, boundary, or unknown coverage must not block submission; flag the request for staff review.
>
> Implement, test, and publish this complete flow on private staging.

Effect:
- Required: street address, city, state and ZIP; apartment/unit optional; property type collected (the list is open, [[OQ-PROPERTY-TYPES]]).
- The ZIP is prefilled from the coverage check ([[OWN-DEC-88]]); changing it rechecks coverage without clearing other answers. Outside, boundary or unknown coverage never blocks submission; the request is flagged for staff review.
- The full address is saved with the request, shown to authorized staff and in the customer's review summary, and never displayed publicly.
- Timing: a preferred date or "I'm flexible"; standard dates start tomorrow in the property's local time ([[FACT-TIMEZONE]]). "Need help today?" is an optional request for staff review, not a guaranteed appointment; a same-day charge appears only once a policy exists ([[FACT-PRICING-SAME-DAY-CHARGE]], [[OQ-SAME-DAY-CHARGE]]); today it is priced per job on the estimate ([[OWN-DEC-66]]).
- Windows: Mornings, Afternoons, Evenings, Weekends or Any time, displayed with the configured hours inside 8 AM–10 PM ([[FACT-HOURS]]). Any time clears the others; Weekends must agree with the date or the flexible choice ([[OWN-DEC-56]]).
- The form shows: "These are your preferences. Your appointment is confirmed only after we send a date and arrival window." All details are kept when going back.

Links: uses [[FACT-HOURS]], [[FACT-TIMEZONE]], [[FACT-PRICING-SAME-DAY-CHARGE]], [[FACT-SERVICE-AREA]].
