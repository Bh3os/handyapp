---
id: OWN-DEC-199
type: decision
title: "Rules Review G: portal wording approved once it is checked against actual behaviour"
status: active
area: portal
links:
  related: ["[[OWN-DEC-192]]", "[[OQ-PORTAL-WORDING]]", "[[HH-PORT-02]]", "[[HH-PORT-06]]"]
source: "owner answers 2026-10-21 R12 (Rules Review)"
---
Owner answer (round 12, Rules Review), section verbatim:

> G — Customer Portal Wording
> Approve G1 and G2 conditionally.
> Review all wording against actual behavior, especially:
> * Confirmed versus preferred appointments
> * Real versus tentative capacity holds
> * Customer action requirements
> * Pending deposits
> * Estimate approval and expiration
> * Payment state
> * Completed versus open jobs
> Correct misleading claims before approving content.
> Customer-facing content remains English-only.

Rules as built, as the owner reviewed them on the Rules Review page (2026-10-21):

- **G1** All on-screen portal wording you didn't write yourself, as shown on staging: statuses such as "Waiting on HandyHub" and "Nothing is needed from you", buttons such as "Pay your deposit" and "Choose your work appointment", empty states, and the Messages, Documents, Photos, Appointments and Payments tabs. It's plain wording and can be edited later without code changes.
- **G2** Appointment wording, for example "These times are held for you until {time}.", "Choose this time", "None of these times work? Request other times" and "An estimate visit is for preparing your estimate. It doesn't approve a price."

Effect:
- G1 and G2 are approved on condition that every customer sentence is checked against what the software actually does, especially confirmed versus preferred appointments, real versus tentative capacity holds, what the customer must do, pending deposits, estimate approval and expiry, payment state, and completed versus open jobs; misleading claims are corrected before the wording counts as approved.
- Customer wording stays English only ([[OWN-DEC-162]]).
- Built by [[TSK-0150]].
