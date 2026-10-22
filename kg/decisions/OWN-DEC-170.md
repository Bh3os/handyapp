---
id: OWN-DEC-170
type: decision
title: "Preferred time windows: Mornings 8–12, Afternoons 12–5, Evenings 5–10"
status: active
area: intake
links:
  uses: ["[[FACT-WINDOW-HOURS]]", "[[FACT-HOURS]]"]
  related: ["[[OWN-DEC-92]]", "[[HH-INT-02]]"]
source: "owner answers 2026-10-21 R6-Q1"
---
Owner answer (round 6, question 1), option chosen "8-12 / 12-5 / 5-10 (Recommended)":

> Choose **8-12 / 12-5 / 5-10 (Recommended)**.
>
> Implement these customer appointment preferences:
>
> - **Mornings:** 8:00 AM – 12:00 PM
> - **Afternoons:** 12:00 PM – 5:00 PM
> - **Evenings:** 5:00 PM – 10:00 PM
> - **Weekends:** Saturday and Sunday, combinable with a time-of-day preference.
> - **Any Time:** Customer is flexible during HandyHub's operating hours.
>
> Additional requirements:
>
> 1. Clearly explain that these are scheduling preferences, not confirmed appointments.
> 2. Allow customers to select multiple compatible preferences.
> 3. Selecting "Any Time" must clear the other time-of-day selections.
> 4. Use the service property's local time zone (Eastern or Central).
> 5. Preserve preferences throughout the request and estimate workflow.
> 6. Do not automatically reserve an appointment from these preferences.
> 7. Staff must publish actual available appointment windows before customers can book.
> 8. Confirm appointments only after validating crew availability, qualifications, and required project approvals.
> 9. Ensure no appointment arrival window extends beyond the configured service hours without an explicitly authorized exception.
> 10. Make the selections easy to use on mobile devices.
> 11. Ensure weekend preferences are consistent with the customer's requested dates.
>
> Display this notice below the selections:
>
> "These are your preferred times only. Your appointment is not confirmed until HandyHub sends you a confirmed date and arrival window."
>
> Implement and test the behavior in private staging.

Effect:
- Mornings 8:00 AM–12:00 PM, Afternoons 12:00 PM–5:00 PM, Evenings 5:00 PM–10:00 PM; Weekends (Saturday and Sunday) combine with a time-of-day choice; Any Time means flexible within operating hours. Times are in the property's zone ([[OWN-DEC-159]]). Value [[FACT-WINDOW-HOURS]].
- The notice below the choices becomes exactly: "These are your preferred times only. Your appointment is not confirmed until HandyHub sends you a confirmed date and arrival window." It replaces the notice of [[OWN-DEC-92]].
- Several compatible choices are allowed; Any Time clears the others; preferences stay through the request and estimate; they never reserve an appointment; staff publish real windows before booking; confirmation follows the validation of crew, qualifications and approvals; no arrival window extends past the configured service hours without an authorized exception; the choices work well on phones; weekends agree with the requested dates.
- Answers [[OQ-WINDOW-HOURS]]. Built by [[TSK-0139]].
