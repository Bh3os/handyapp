---
id: OQ-WINDOW-OFFER-RULES
type: question
title: The window-offer details no decision gives
status: open
area: scheduling
links:
  related: ["[[OWN-DEC-144]]", "[[OWN-DEC-99]]", "[[OWN-DEC-105]]", "[[HH-SCH-11]]", "[[HH-SCH-05]]", "[[ENT-Reservation]]", "[[ENT-Visit]]", "[[TSK-0063]]"]
source: "TSK-0063 (2026-10-21): OWN-DEC-144 holds offered windows 24 hours; the details below are PROPOSED"
---
**Question:** does the owner approve, or change, these PROPOSED details of offering windows?

- **Who answers:** the owner.
- **Decided and configured (scheduling.window_offers, active):** offered windows hold the needed workers and resources for 24 hours from the offer ([[OWN-DEC-144]]); staff offer 2–3 windows ([[OWN-DEC-99]], [[OWN-DEC-105]]).
- **PROPOSED, in use on private staging:**
  - The hold time is counted by the database clock from the moment the offer is saved; all windows of one offer share that expiry. A selection at or after it is refused as expired (the customer sees "These times are no longer held. HandyHub will offer new times.") rather than rechecked and booked; an offer that expires unselected expires its tentative visit with it ([[HH-SCH-05]], [[ENT-Visit]]), and staff get a queue item to offer new windows (by planning a new visit).
  - One offer holds the visit's whole team (the workers and items staff name, the lead first) for every window; the windows' reserved ranges may not overlap. One open offer per visit; while it is open the visit is not moved or confirmed by staff.
  - Staff may withdraw an open offer with a written reason; its holds are released and the visit stays tentative.
  - The customer may ask for other times with an optional note (up to 500 characters); its holds are released, the visit stays tentative and staff get a queue item ("Offered windows need new times", time-sensitive band) that resolves when a new offer is made or a window is selected. Estimators see the item (they offer estimate-visit windows).
  - A work visit's windows pass the job's scheduling gates when offered and again when selected (the deposit gate is [[TSK-0064]]'s); a selection that cannot be kept (a worker's time off, hours or eligibility changed, a gate unmet) is refused with "That time is no longer available. Choose another time or request other times." and changes nothing.
  - Preparation instructions are free text staff write with the offer (up to 1,000 characters) and are shown with the confirmed visit.
  - Customer wording of the Appointments tab (offer titles, "These times are held for you until …", "Choose this time", "None of these times work? Request other times", the confirmed-visit card and "An estimate visit is for preparing your estimate. It doesn't approve a price.") extends [[OQ-PORTAL-WORDING]].
- **Until answered:** the PROPOSED details above are used; each is configuration or a small code change.
