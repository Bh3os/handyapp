---
id: OWN-DEC-56
type: decision
title: Visit preferences on the estimate request
status: active
area: intake
links:
  related: ["[[HH-INT-02]]", "[[HH-SCH-01]]"]
  uses: ["[[FACT-HOURS]]"]
  part_of: ["[[C02]]"]
source: "vault-own-decisions.md OWN-DEC-56; project chat 2026-10-12"
---
Owner wording (project chat, 2026-10-12): "Treat these as customer preferences, not confirmed availability." "I'd keep all five options." Wording: "When would you prefer a visit? Select your preferred time. We'll confirm scheduling after reviewing your request." Options "Mornings, Afternoons, Evenings, Weekends, Any time, I'm flexible"; "This is a preference, not a confirmed appointment." "For the production form, I would make the options reflect actual working hours, support a preferred date where useful, and avoid promising evening or weekend appointments unless HandyHub provides them. If customers can accommodate more than one window, allowing multiple selections would make scheduling easier." Approved version: "Offer Mornings, Afternoons, Evenings, Weekends, and Any time. Clearly label these as preferred visit windows, not guaranteed availability. Display only options compatible with actual operating capacity. Confirm appointments after reviewing the service request."

Effect:
- The request form offers the windows Mornings, Afternoons, Evenings, Weekends and Any time, labelled as preferences, not guaranteed availability.
- Only windows compatible with the configured visit hours are shown ([[FACT-HOURS]]: every day 8 AM to 10 PM, so all five appear today). Several may be selected.
- An optional preferred date starts tomorrow.
- The preferences are stored on the request and shown to the office; they are never written to a visit. An appointment is confirmed only when the office sends a date and an arrival window.

Partly replaced by [[OWN-DEC-92]]: "Any time" clears the other selections; Weekends must align with the date or the flexible-date choice; "I'm flexible" replaces a date; an optional "Need help today?" request; and the text "These are your preferences. Your appointment is confirmed only after we send a date and arrival window."
