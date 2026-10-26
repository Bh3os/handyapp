---
id: OQ-WINDOW-HOURS-DETAILS
type: question
title: The preferred-window details no decision gives
status: open
area: intake
links:
  related: ["[[OWN-DEC-170]]", "[[FACT-WINDOW-HOURS]]", "[[HH-INT-02]]", "[[OWN-DEC-159]]", "[[FACT-HOURS]]", "[[TSK-0139]]", "[[OQ-COUNTY-TIME-ZONES]]"]
source: "TSK-0139 (2026-10-25): OWN-DEC-170 gives the hours and the notice; the details below are PROPOSED"
---
**Question:** does the owner approve, or change, these PROPOSED details of the preferred time windows on the request form?

- **Who answers:** the owner.
- **Decided, in use:** Mornings 8:00 AM–12:00 PM, Afternoons 12:00 PM–5:00 PM, Evenings 5:00 PM–10:00 PM, Weekends (Saturday and Sunday, combinable with a time of day) and Any Time (clears the others), in the service property's zone; the notice below the choices reads exactly "These are your preferred times only. Your appointment is not confirmed until HandyHub sends you a confirmed date and arrival window." ([[OWN-DEC-170]], [[FACT-WINDOW-HOURS]]).
- **PROPOSED, in use on private staging:**
  - **What the customer sees.** Each day window shows its hours beside its name, for example "Mornings (8 AM–12 PM)". No time zone is named on the form: the hours are the property's own clock times, and the property's zone is not known while the form is filled in (it is derived from the county list, which is NOT CONFIGURED, [[OQ-COUNTY-TIME-ZONES]], or verified by staff later). Naming a zone to the customer would need wording the owner has not given.
  - **Where the notice appears.** Below the five choices on the form, and again on the review step and on the receipt page, beside the preferred timing.
  - **Labels.** The choice keeps the label "Any time" already on the form; the owner's answer writes "Any Time".
  - **Kept with the request.** The request stores the hours each chosen day window had when it was sent, so a later change of `request.window_hours` never changes what an earlier request meant. Requests sent before 2026-10-25 were offered no hours and keep none.
  - **What staff see.** The request record shows each chosen window with those hours, and names the property's zone ("Hours in the property's time zone: America/Chicago (Central time)"), or Unknown while it is not verified; Eastern is never assumed. With a preferred date and a known zone, the window is shown as that date's times with the zone abbreviation (EDT or EST, CDT or CST).
  - **Claims register.** The notice is registered as the owner's exact wording, so the content lint checks it word for word.
- **Until answered:** the PROPOSED details above are used; each is a small change to the nodes or the code.
